/// <reference path="intellisense.js" />

var g_msSyncPeriod = 3 * (60 * 1000); //3 minutes
var g_tipUserTopReport = "Click to sync now";
var g_marginLabelChart = 35;
var g_heightBarUser = 30;
var g_bShowBoardMarkers = false;
var g_portBackground = null; //plus engine notifications to this tab
var g_bNeedRefreshReports = false; //for delaying refresh when tab is not active. review zig: currently unused as I removed this feature
var g_bCheckedbSumFiltered = null; //null means not yet initialized (From sync storage)
var DELAY_FIRST_SYNC = 2000;
var g_cRetryingSync = 0;
var g_cRowsWeekByUser = 0; //gets set after making the chart. Used by the tour
var g_bShowHomePlusSections = true;

//review zig: this was the easy way to prevent charts from rendering until their container is attached to the dom.
//  in the home page case, we dont attach the plus 2x2 table until all its cells have loaded, so that its full height
//  is known, thus preventing page jumps as its height grows until all 4 cells are loaded.
// if we dont do this, the charts draw smaller, probably are not picking up some font-size/type that makes them paint smaller.
// task: investigate if changing css attributes to match body, like font type/size will make the chart draw right.
//end-review
var g_bPreventChartDraw = true;

var g_optIsPlusDisplayDisabled = null; //null means uninitialized. dont use directly. private to below
function isPlusDisplayDisabled() {
    if (g_optIsPlusDisplayDisabled === null)
        g_optIsPlusDisplayDisabled = localStorage[g_lsKeyDisablePlus]; //we want to read it once so its consistent for future calls. user must refresh page if changed

    if (g_optIsPlusDisplayDisabled == "true")
        return true;
    return false;
}

/* isBackendMode
 *
 * REVIEW zig: warning: must be called only if g_bReadGlobalConfig, else caller should wait until later
 * all callers were verified on mar-11-2014
 **/
function isBackendMode(configData) {
	if (configData === undefined) {
		if (!g_bReadGlobalConfig)
			return false;
		configData = g_configData;
	}
	return (configData && configData.spentSpecialUser != null);
}

var g_bReadGlobalConfig = false;

function showAproveGoogleSyncPermissions(callback) {
//the main purpose of showing the dialog is to generate a user action (OK click)
//to ask for new permissions (allowed only during a user action)
//also, it lets us warn the user about what is about to be asked and why.
    var divDialog = $(".agile_dialog_showAproveGSP");
    if (divDialog.length == 0) {
        divDialog = $('\
<dialog class="agile_dialog_showAproveGSP agile_dialog_DefaultStyle"> \
<h2>Plus for Trello - Google Sync permissions</h2><br> \
<p>Your configuration was synced to this device. Plus may ask</p>\
<p>you to approve permissions after pressing OK.</p>\
<br>\
<button style="float:right;" id="agile_dialog_GSP_OK">OK</button> \
</dialog>');
        $("body").append(divDialog);
        divDialog = $(".agile_dialog_showAproveGSP");
    }

    divDialog.find("#agile_dialog_GSP_OK").off("click.plusForTrello").on("click.plusForTrello", function (e) {
        divDialog[0].close();
        callback(); 
    });

    divDialog[0].showModal();
}


function configureSsLinks(bParam) {
	if (g_strServiceUrl != null) {
		configureSsLinksWorker(bParam, g_strServiceUrl);
	}
	else {
		chrome.storage.sync.get('serviceUrl', function (obj) {
			var strUrlNew = obj['serviceUrl']; //note: its still called serviceUrl even though now stores a sheet url (used to store a backend url in 2011)
			if (strUrlNew === undefined || strUrlNew == null)
				strUrlNew = ""; //means simple trello
			strUrlNew = strUrlNew.trim();
			var keyUrlLast = "serviceUrlLast";
			chrome.storage.local.get(keyUrlLast, function (obj) { //must be local as we are comparing local configuration. each devices does the same
				var strUrlOld = obj[keyUrlLast];
				if (strUrlOld)
					strUrlOld = strUrlOld.trim();
				else
				    strUrlOld = "";

				function continueConfig() {
				    g_strServiceUrl = strUrlNew;
				    configureSsLinksWorker(bParam, strUrlNew);
				}

				function saveLocalUrl(callback) {
				    var pairUrlOld = {};
				    pairUrlOld[keyUrlLast] = strUrlNew;
				    chrome.storage.local.set(pairUrlOld, function () {
				        if (chrome.runtime.lastError != undefined) {
				            alert("Plus for Trello:"+chrome.runtime.lastError.message);
				            return;
				        }
				        callback();
				    });
				}

				if (strUrlOld != strUrlNew && !g_bDisableSync && !g_optEnterSEByComment.IsEnabled()) {
				    //config changed from another device.
				    
				    if (strUrlOld && strUrlOld != "") {
				        alert("Google sync spreadsheet changed. Plus will reset sync.");
				        g_strServiceUrl = strUrlNew; //needed for clearAllStorage. in other cases its handled by continueConfig
				        clearAllStorage(function () {
				            saveLocalUrl(function () {
				                restartPlus("Refreshing with updated sync setting.");
				            });
				        });
				    }
				    else {
				        //possibly first time it has a sync url. must ask for extension webRequest permissions
                        //review zig multiple calls to continueConfig can be simplified with promises (need to add polyfill for older chromes)
				        showAproveGoogleSyncPermissions(function () {
				            sendExtensionMessage({ method: "requestWebRequestPermission" }, function (response) {
				                if (response.status != STATUS_OK)
				                    return;

				                if (!response.granted) {
				                    //here so user doesnt get stuck in a loop if no longer wants to use google sync
				                    if (confirm("Remove the Google sync url? Only press OK if you want to turn off Google sync.")) {
				                        chrome.storage.sync.set({ "serviceUrl": "" }, function () {
				                            if (chrome.runtime.lastError != undefined) {
				                                alert(chrome.runtime.lastError.message);
				                                return;
				                            }
				                            strUrlNew = "";
				                            saveLocalUrl(function () {
				                                continueConfig();
				                            });
				                        });
				                    }
				                    else {
				                        alert("You may continue using Plus but sync features may not work correctly.");
				                        continueConfig();
				                    }
				                }
				                else {
				                    saveLocalUrl(function () {
				                        continueConfig();
				                    });
				                }
				            });
				        });
				    }
				}
				else {
				    continueConfig();
				}
			});
		});
	}
}

var g_userTrelloCurrent = null;

/* getCurrentTrelloUser
 *
 * returns null if user not logged in, or not yet loaded
 * else returns user (without @)
 **/
function getCurrentTrelloUser() {
	if (g_userTrelloCurrent != null)
		return g_userTrelloCurrent;
	var headerBarItem = $(".js-open-header-member-menu");
	if (headerBarItem.length == 0) {
		headerBarItem = $(".header-auth");
		if (headerBarItem.length == 0) {
			//try later. most likely user not logged-in 
			return null;
		}
	}
	var avatarElem = headerBarItem.eq(0).find($(".member-avatar"))[0];
	if (avatarElem === undefined)
		avatarElem = headerBarItem.eq(0).find($(".member-initials"))[0];
	if (avatarElem === undefined)
		return null;
	var userElem = avatarElem.title;

    //search for the last () pair because the user long name could also have parenthesis
    //this happens a lot in users with non-western names, where trello adds the western name in parenthesis,
    //as in "%$#& &%948# (peter chang) (peterchang)"
	var iParenOpen = userElem.lastIndexOf("(");
	if (iParenOpen < 0)
	    return null;
	userElem = userElem.substring(iParenOpen+1);
	var iParenClose = userElem.lastIndexOf(")");
	if (iParenClose < 0 || iParenClose != userElem.length-1)
	    return null;
	userElem = userElem.substring(0,iParenClose);
	if (userElem.length == 0)
	    return null; //not needed, but might help when trello suddenly changes DOM
	g_userTrelloCurrent = userElem;
    //save the user
	chrome.storage.local.get([PROP_TRELLOUSER], function (obj) {
	    var userTrelloLast = (obj[PROP_TRELLOUSER] || null);
	    if (userTrelloLast != userElem) {
	        if (userTrelloLast)
	            sendDesktopNotification("Warning: Trello user changed. Reset Sync from Plus help" , 30000);
	        var pairUser = {};
	        pairUser[PROP_TRELLOUSER] = userElem;
	        chrome.storage.local.set(pairUser, function () {
	            if (chrome.runtime.lastError != undefined)
	                alert("Plus for Trello:" + chrome.runtime.lastError);
	        });
	    }
	});
	return userElem;
}

var g_configData = null; //set to non-null when sync is configured


//returns true iff progress set. false when progress was already set
function setWeekSummaryProgress(elem) {
	var strClass = "agile_sync_state";
	var elemTable = elem.children("table"); //review zig cleanup table find all over
	if (elemTable.hasClass(strClass))
		return false;
	elemTable.addClass(strClass);
	elem.attr("title", "Syncing...\nTo see progress hover Chrome's Plus icon ↗");
	return true;
}

function removeWeekSummaryProgress(elem) {
	var strClass = "agile_sync_state";
	elem.children("table").removeClass(strClass);
}

var g_bCreatedPlusHeader = false; //review zig: get rid of this by always creating 'new' icon hidden when #urlUser is created.

function configureSsLinksWorker(b, url, bSkipConfigCache) {
	var userElem = getCurrentTrelloUser();
	if (userElem == null) {
		//try later. most likely user not logged-in 
		setTimeout(function () { configureSsLinksWorker(b, url, bSkipConfigCache); }, 500);
		return;
	}

	var urlUserElem = $('#urlUser');
	if (urlUserElem.length == 0) {
		g_bCreatedPlusHeader = true;
		urlUserElem = $('<span id="urlUser"></span>').css("margin-left", "0px").css("margin-right", "2px");
		urlUserElem.addClass('agile_urlUser');
		urlUserElem.appendTo(b);
		if (!isPlusDisplayDisabled())
		    getRecentWeeksList(urlUserElem).appendTo(b);
	}

	if (!isPlusDisplayDisabled())
	    checkCreateRecentFilter(b);
	urlUserElem.attr("title", g_tipUserTopReport); //reset
	if (url == "") {
		g_configData = null;
		g_bReadGlobalConfig = true;
		onReadGlobalConfig(g_configData, userElem);
		return;
	}

	function part2() {
	    sendExtensionMessage({ method: "getConfigData", userTrello: userElem, urlService: url, bSkipCache: bSkipConfigCache },
            function (respConfig) {
                //note: here we used to check for trello user changed. worked for google sync but not for trello sync. that has now moved
                //to a warning at the time we detect that we change PROP_TRELLOUSER (independent of configData now)
                //respConfig.config is null in the non-spreadsheet-sync case
                if (respConfig.config && respConfig.config.status != STATUS_OK) {
                    setTimeout(function () {
                        //set error text later, to avoid cases when user navigates back/away while on this xhr call.
                        setSyncErrorStatus(urlUserElem, respConfig.config.status);
                    }, 500);
                    return;
                }
                g_configData = respConfig.config; //cached. can be null
                g_bReadGlobalConfig = true;
                onReadGlobalConfig(g_configData, userElem);
            });
	}

//review zig remove g_bCheckedTrelloSyncEnable and just force-enable sync
	if (!g_bCheckedTrelloSyncEnable && !g_bEnableTrelloSync) {
	    g_bCheckedTrelloSyncEnable = true;
	    chrome.storage.sync.set({ "bCheckedTrelloSyncEnable": g_bCheckedTrelloSyncEnable }, function () { });
	    if (!g_bDisableSync) {
			//used to be that spreadsheet sync could be used without trellosync. no more.
	        var pairTrelloSync = {};
	        pairTrelloSync["bEnableTrelloSync"] = true;
	        chrome.storage.sync.set(pairTrelloSync, function () {
	            if (chrome.runtime.lastError != undefined)
	                alert("Plus for Trello:" + chrome.runtime.lastError);
                else
	                g_bEnableTrelloSync = true; //note: this is a safe place to init this global. be careful if init code changes.
	            part2();
	        });
	        return; //dont continue and call part2 again
	    }
	}

    part2();

}

var g_bDidInitialIntervalsSetup = false;

function initialIntervalsSetup() {
	spentTotal = InfoBoxFactory.makeTotalInfoBox(SPENT,true).hide();
	estimationTotal = InfoBoxFactory.makeTotalInfoBox(ESTIMATION, true).hide();
	remainingTotal = InfoBoxFactory.makeTotalInfoBox(REMAINING, true).hide();

	doAllUpdates();

	setInterval(function () {
	    doAllUpdates();
	}, UPDATE_STEP);

	if (isPlusDisplayDisabled())
	    return;

	setTimeout(function () {
	    update(false); //first update
	}, 20);

	detectMovedCards();
	var oldLocation = location.href;
	setInterval(function () {
	    if (g_bNeedRefreshReports && !document.webkitHidden && g_bReadGlobalConfig) {
	        var user = getCurrentTrelloUser();
	        if (user) {
	            g_bForceUpdate = true;
	            g_bNeedRefreshReports = false;
	            doWeeklyReport(g_configData, user, false, true);
	        }
	    }
		if (location.href != oldLocation) {
		    oldLocation = location.href;
		    removeAllGrumbleBubbles();
	
		    //this might not be strictly needed. for safety clean this cache. it contains jquery elements inside and might confuse code.
		    //needed because trello plays with navigation and we can end up with the cache even though we are on another page (like a board page)
		    if (!bAtTrelloHome()) {
		        g_chartsCache = {};
		        cancelZoomin(null, true); //review zig: find a better way that is not timing-related, like a chrome url-changed notif, or change the href of recent/remaining to handlers
		    }

			setTimeout(function () { doAllUpdates(); }, 100); //breathe
		}
	}, 400); //check often, its important to prevent a big layout jump (so you can click on boards right away on home without them jumping (used to be more important before new trello 2014-01)

	var msLastDetectedActivity = 0; //zero means nothing detected yet.
	setInterval(function () {
	    if (!g_bEnableTrelloSync)
	        return;
	    //detect trello network activity and initiate sync
	    //in case of multiple trello windows open, note that the extension message will only return the same count to only one of the windows and the rest will receive zero.
        //its still possible that several consecutive changes cause more than one window to receive a non-zero modification count. its not a big deal as one will fail with busy.
	    sendExtensionMessage(
            { method: "queryTrelloDetectionCount" },
			function (response) {
			    if (response.status != STATUS_OK)
			        return;

			    var msNow = Date.now();
			    if (response.count == 0) {
			        if (msLastDetectedActivity == 0)
			            return;
			        if (msNow - msLastDetectedActivity > 500) {
			            msLastDetectedActivity = 0; //reset
			            doSyncDB(null, true, true, true,true);
			        }
			    }
			    else {
			        msLastDetectedActivity = msNow;
			    }
			});
	}, 1000);

	setInterval(function () {
	    testExtensionAndcommitPendingPlusMessages();
	}, 20000);
}

function onReadGlobalConfig(configData, user) {
	g_bShowBoardMarkers = false;

	if (isBackendMode(configData))
		g_bShowBoardMarkers = true;
	var pair = {};
	pair[PROP_SHOWBOARDMARKERS] = g_bShowBoardMarkers;
	chrome.storage.local.set(pair, function () { });

	//REVIEW zig: need a new way to notify of new service url/spreadsheet archiving (like a row with special meaning)
	startOpenDB(configData, user);
}

function setSyncErrorStatus(urlUser, status, statusLastTrelloSync) {
    removeWeekSummaryProgress(urlUser);
    statusLastTrelloSync = statusLastTrelloSync || STATUS_OK;
    if (statusLastTrelloSync == "busy")
        statusLastTrelloSync = STATUS_OK; //dont bother the user when busy

    if (status == STATUS_OK && statusLastTrelloSync == STATUS_OK) {
        var dateNow = new Date();
        var strTip = g_tipUserTopReport;
        urlUser.children("table").removeClass("agile_plus_header_error");
        if (g_bDisableSync || (g_strServiceUrl == "" && !g_optEnterSEByComment.IsEnabled()))
            strTip = "";
        urlUser.attr("title", strTip);
        return;
    }

    urlUser.children("table").addClass("agile_plus_header_error");

	var statusSet = "";

	if (status != STATUS_OK) {
	    if (status.indexOf("error:") >= 0)
	        statusSet = status;
	    else
	        statusSet = "error: " + status;
	}


    if (statusLastTrelloSync != STATUS_OK) {
        if (statusSet != "")
            statusSet = statusSet + "\n";
        statusSet = statusSet+ "sync error: " + statusLastTrelloSync;
    }

    urlUser.attr("title", statusSet);
    console.log(statusSet);
}

var g_intervalSync = null;
var g_dbOpened = false;
var g_idTimeoutReportHover = null;

function startOpenDB(config, user) {
	g_dbOpened = false;
    openPlusDb(
			function (response) {
			    if (response.status != STATUS_OK) {
			        showFatalError(response.status);
			        return;
			    }
				g_cRowsHistoryLast = response.cRowsTotal;
				g_dbOpened = true;
				onDbOpened();
				doWeeklyReport(config, user, true, false, false); //bRefreshCardReport=false because onDbOpened already does so REVIEW zig detect it in a cleaner way
				
				setTimeout(function () {
				    doSyncDB(user, true, false, true);
				}, DELAY_FIRST_SYNC); //wait a little so trello itself can load fully. Not needed but may speed up loading trello page.

				if (g_intervalSync != null) {
					clearInterval(g_intervalSync);
					g_intervalSync = null;
				}

				var urlUser = $("#urlUser");

				//Note: why use javascript handlers instead of css hover?
				//we want to cover a common case that css hover cant do: if a user using the mouse aiming towards the Plus help icon,
				//and she hovers over the weekly report on her way, as soon as she hover out of the report it will shrink and the plus icon will
				//keep moving away. Thus, here we delay the mouseout by 2 seconds so it gives her time to reach the plus icon.
				function handlerIn(event) {
					zoomTopReport(urlUser);
				}

				function handlerOut(event) {
					programUnZoom(urlUser);
				}

				urlUser.unbind("hover");
				urlUser.hover(handlerIn, handlerOut);

				if (!isPlusDisplayDisabled()) {
					g_intervalSync = setInterval(function () { doSyncDB(user, true, false, false); }, g_msSyncPeriod);
					//review zig: these all should be at urlUser creation time to avoid the unbinds and such
					urlUser.unbind("click");
					urlUser.click(function () {
						doSyncDB(user, false, false, false);
					});
				}
			},{ dowStart: DowMapper.getDowStart() });
}


function zoomTopReport(userElem) {
	if (g_idTimeoutReportHover) {
		//cancel ongoing. will be recreated on Out
		clearTimeout(g_idTimeoutReportHover);
		g_idTimeoutReportHover = null;
	}
	userElem.children("table").addClass("agile_plus_header_link_zoomhoverActive");
}

function programUnZoom(userElem) {
    if (g_idTimeoutReportHover == null) { //note: !=null can actually happen in rare cases involving switching windows while on the hover timeout wait
		g_idTimeoutReportHover = setTimeout(function () {
		    userElem.children("table").removeClass("agile_plus_header_link_zoomhoverActive");
			g_idTimeoutReportHover = null;
		}, 8000);
	} 
}

var g_cRowsHistoryLast = 0;
var g_bFirstTimeUse = false;
var g_bAllowNegativeRemaining = false;
var g_bDontWarnParallelTimers = false;
var g_bUserDonated = false;
var g_bHidePendingCards = false;
var g_msStartPlusUsage = null; //ms of date when plus started being used. will be null until user enters the first row
var g_bSyncOutsideTrello = false; //allow sync outside trello
var g_bChangeCardColor = false; //change card background color based on its first label

function checkFirstTimeUse() {
	var keyDateLastSetupCheck = "dateLastSetupCheck";
	var keySyncWarn = "bDontShowAgainSyncWarn";

	var msDateNow = Date.now();
	var bShowHelp = false;
	var totalDbRowsHistory = 0;
	sendExtensionMessage({ method: "getTotalDBRows" }, function (response) {
	    if (response.status == STATUS_OK) {
	        totalDbRowsHistory = response.cRowsTotal;
	        if (g_msStartPlusUsage == null && response.dateMin) {
	            chrome.storage.sync.set({ 'msStartPlusUsage': response.dateMin }, function () {
	                if (chrome.runtime.lastError === undefined)
	                    g_msStartPlusUsage = response.dateMin;
	            });
	        }
	    }
	    chrome.storage.local.get([keyDateLastSetupCheck, keySyncWarn], function (obj) {
	        var valuekeySyncWarn = obj[keySyncWarn];
	        var bForceShowHelp = false;
	        var msDateLastSetupCheck = obj[keyDateLastSetupCheck];
	        if (g_strServiceUrl == "" && !g_optEnterSEByComment.IsEnabled() && !g_bDisableSync) { //sync not set up
	            if (msDateLastSetupCheck !== undefined) {
	                if (totalDbRowsHistory > 0) {
	                    if (msDateNow - msDateLastSetupCheck > 1000 * 60 * 60 * 24) //nag once a day
	                        bShowHelp = true;
	                }
	            }
	            else {  
	                bShowHelp = true;
	                g_bFirstTimeUse = true;
	            }
	        }

            //show help on startup in some cases
			if (!bShowHelp && !g_bUserDonated && g_msStartPlusUsage != null) {
			    var dms = msDateNow - g_msStartPlusUsage;
			    var cDaysUsingPlus = Math.floor(dms / 1000 / 60 / 60 / 24);
			    if (cDaysUsingPlus > 20) {
			        if (msDateLastSetupCheck === undefined) {
			            bForceShowHelp = true;
			            bShowHelp = true;
			        }
			        else {
			            if (msDateNow - msDateLastSetupCheck > 1000 * 60 * 60 * 24 * 15) { //every 15 days (15%7=1 thus will shift the day of the week every time)
			                bForceShowHelp = true;
			                bShowHelp = true;
			            }
			        }
			    }
			}

			if (bShowHelp) {
			    if (!valuekeySyncWarn || bForceShowHelp) {
					var pair = {};
					pair[keyDateLastSetupCheck] = msDateNow;
					chrome.storage.local.set(pair, function () { });
					setTimeout(function () { Help.display(); }, 2000);
				}
			}
		});
	});
}

function updateCRowsTotalState(cRowsTotal, config, user) {
    var cRowsOld = g_cRowsHistoryLast;
    g_cRowsHistoryLast = cRowsTotal;
    var bNewRows = (cRowsOld != g_cRowsHistoryLast);
    if (bNewRows || cRowsTotal == 0) { //cRowsTotal==0 is a hack so the "first sync" status text gets updated after a first sync with no rows
        g_bForceUpdate = true;
        g_seCardCur = null; //mark as uninitialized. will be set on the refresh below
        doWeeklyReport(config, user, false, true);
    }
}

function onDbOpened() {
	if (!g_bDidInitialIntervalsSetup) {
		initialIntervalsSetup(); //also calls doAllUpdates
		g_bDidInitialIntervalsSetup = true;
	}
	checkFirstTimeUse();

	if (g_portBackground == null) {
	    g_portBackground = chrome.runtime.connect({ name: "registerForChanges" });
	    g_portBackground.onMessage.addListener(function (msg) {
	        var urlUser = $('#urlUser');
	        if (msg.status)
	            setSyncErrorStatus(urlUser, msg.status, msg.statusLastTrelloSync);

	        if (msg.status != STATUS_OK)
	            return;
           
	        if (msg.event == EVENTS.FIRST_SYNC_RUNNING) {
	            urlUser.html(buildDailyTable("<tr><td>Running</td></tr><tr><td>first sync</td></tr>"));
	            setWeekSummaryProgress(urlUser);
	            setTimeout(function () {
	                if (g_bNeedStartTourBubble)
	                    showTourBubble();
	            }, 1000);
	        }
	        else if (msg.event == EVENTS.NEW_ROWS) {
	            //this avoids refreshing the UI if no rows were added since last time
	            sendExtensionMessage({ method: "getTotalDBRows" },
                    function (response) {
                        
                        if (response.status != STATUS_OK)
                            return;
                        var user = getCurrentTrelloUser();

                        if (g_bReadGlobalConfig && user) {
                            updateCRowsTotalState(response.cRowsTotal, g_configData, user);
                        }
                    });
	        } else if (msg.event == EVENTS.DB_CHANGED) {
	            checkCardRecurringCheckbox();
	           //EVENTS.DB_CHANGED not handled for home/daily reports as we care about new rows only (otherwise it gets complicated to prevent double refreshing on new rows and other changes
	           //review zig" ideally refresh on this only if NEW_ROWS was not just received. then chart labels will rename when renamed in trello and so on (no new rows cases)
	           //important so we update card report then changing [R] status
				if (!msg.bNewHistoryRows) { //NEW_ROWS is already handled above
	               var user = getCurrentTrelloUser();
	               if (user) {
	                   g_bForceUpdate = true;
	                   doWeeklyReport(g_configData, user, false, true);
	               }
	           }
	       }
	    });
	}
}


function doSyncDB(userUnusedParam, bFromAuto, bOnlyTrelloSync, bRetry, bForce) {
    if (Help.isVisible() || isPlusDisplayDisabled())
        return;
    bOnlyTrelloSync = bOnlyTrelloSync || false;
    if (bRetry === undefined)
        bRetry = true;
    var config = g_configData;


    var urlUser = null;
    var dateNow = new Date();
    var bSetStatus = false;
    var cRetries = (bRetry? 3 : 1); //try this many times to start google sync
    var bDidTrelloSync=false;
    var bEnterSEByComments = g_optEnterSEByComment.IsEnabled();
    var tokenTrello = $.cookie("token");
    if (bFromAuto && !bForce) {
        if (document.webkitHidden)
            return; //sync only if active tab
    }

    worker();

    function worker() {
        if (g_cRetryingSync > 0)
            return;
        urlUser = $("#urlUser"); //set/refresh
        if (!setWeekSummaryProgress(urlUser))
            return;


        if (cRetries == 0) {
            //too busy. just pretent it succeeded
            setSyncErrorStatus(urlUser, STATUS_OK);
            return;
        }


        if (g_bDisableSync) {
            setSyncErrorStatus(urlUser, bFromAuto? STATUS_OK : "Sync is off. Enable it from Plus help.");
            return;
        }


        cRetries--;
        //when bEnterSEByComments, we want to go through google sync, which will route it to trello sync and take care of uptading history rows related stuff
        //review zig: this option will soon be imposible to configure in help, but legacy users could have it (thou we force-upgrade them on open except the few that declined it back when it was optional)
        if (g_bEnableTrelloSync && !bDidTrelloSync && !bEnterSEByComments) {
            sendExtensionMessage({ method: "trelloSyncBoards", tokenTrello: tokenTrello },
            function (response) {
                var statusSync = response.status;
                if (response.status != STATUS_OK) {
                    if (statusSync == "busy") {
                        doRetry();
                        return;
                    }
                    bSetStatus = true;
                    setSyncErrorStatus(urlUser, response.status);
                }
                else {
                    bDidTrelloSync = true;
                }

                if (bOnlyTrelloSync && !bSetStatus) { //when status is set, we do want to continue to google sync
                    setSyncErrorStatus(urlUser, response.status);
                    return;
                }
                doGoogleSync();
            });
        }
        else
            doGoogleSync();
    }

    function doRetry() {
        if (!bSetStatus)
            setSyncErrorStatus(urlUser, STATUS_OK);
        g_cRetryingSync++;
        setTimeout(function () {
            g_cRetryingSync--;
            worker();
        }, 3000);
    }

    function doGoogleSync() {
        if ((!config || bOnlyTrelloSync) && !bEnterSEByComments) {
            if (!bSetStatus) {
                bSetStatus = true;
                setSyncErrorStatus(urlUser, STATUS_OK);
            }
            return;
        }
        bSetStatus = false;
        sendExtensionMessage({ method: "syncDB", config: config, bUserInitiated: !bFromAuto, tokenTrello: tokenTrello },
            function (response) {
                statusSync = response.status;
                if (statusSync == "busy")
                    doRetry();
                //no need to call setSyncErrorStatus because a broadcastMessage will reach back to us and status will be set there
            });
    }
}

function doWeeklyReport(config, user, bUpdateErrorState, bReuseCharts, bRefreshCardReport) {
    var topbarElem = $("#help_buttons_container");
    if (isPlusDisplayDisabled()) {
        configureSsLinksWorkerPostOauth(null, topbarElem, user, false);
        return;
    }

    if (bUpdateErrorState === undefined)
        bUpdateErrorState = true;

    if (bRefreshCardReport === undefined)
        bRefreshCardReport = true;
    
    bReuseCharts = bReuseCharts || false;
    if (bRefreshCardReport)
        refreshCardTableStats(); //review zig: register for refresh notifications instead of hardcoding here all these. also this causes two reports when card page refreshed
	var dateToday = new Date();
	var weekCur = getCurrentWeekNum();
	var dowToday = dateToday.getDay();
	var sToday = 0;
	if (weekCur != getCurrentWeekNum(dateToday))
		sToday = null; //means we are not tracking "today" because the week selection is not the current week.

	var sql = "select H.idCard, H.user,H.spent,H.est,H.comment,C.name as nameCard, strftime('%w',H.date,'unixepoch','localtime') as dow, H.date, B.name as nameBoard,B.idBoard, H.eType from HISTORY H JOIN BOARDS B ON H.idBoard=B.idBoard JOIN CARDS C ON H.idCard=C.idCard AND C.bDeleted=0 WHERE week=? order by user asc, date desc";
	var values = [weekCur];
	g_cRowsWeekByUser = 0;
	getSQLReport(sql, values,
		function (response2) {
			var curUser = getCurrentTrelloUser();
			//transform array so it has all week days
			var i = 0;
			var ordered = [];
			var drilldownData = [];
			var iCurrentUserOrder = -1; //might not be there
			var row = null;
			if (response2.status == STATUS_OK) {
				for (; i < response2.rows.length; i++) {
					row = response2.rows[i];
					if (row.user == null)
						continue; //table empty
					if (ordered.length == 0 || ordered[ordered.length - 1][0] != row.user) { //note must be ordered by user
						ordered.push([row.user, 0, 0, 0, 0, 0, 0, 0]);
						drilldownData.push([row.user, [], [], [], [], [], [], []]);
						if (iCurrentUserOrder < 0 && row.user == curUser)
							iCurrentUserOrder = ordered.length - 1;
					}
					var rowOrder = ordered[ordered.length - 1];
					var drillOrder = drilldownData[ordered.length - 1];
					var iCol = DowMapper.posWeekFromDow(parseInt(row.dow, 10)) + 1; //this dow is a string (unlike most other code)
					rowOrder[iCol] += row.spent;
					drillOrder[iCol].push(row);
				}

				for (i = 0; i < ordered.length; i++) {
					row = ordered[i];
					var c = 1;
					for (; c < row.length; c++)
						row[c] = parseFixedFloat(row[c]); //reformat so charts dont have to
				}
			}
			g_cRowsWeekByUser = ordered.length; //used by tour
			var dataWeek = { config: config, status: response2.status, table: ordered, drilldownData: drilldownData, sWeek: 0, bReuseCharts: bReuseCharts };
			dataWeek.weekSummary = { rows: [] };
			if (iCurrentUserOrder >= 0) {
				var sumDays = 0;
				var k = 1;
				var strDays = "";
				var rowUser = ordered[iCurrentUserOrder];
				for (; k < rowUser.length; k++) {
					if (rowUser[k] == 0)
						continue;
					sumDays += rowUser[k];
					var dow = DowMapper.dowFromPosWeek(k - 1);
					if (sToday !== null && dow == dowToday)
					    sToday += rowUser[k];
					dataWeek.weekSummary.rows.push({ day: getWeekdayName(dow), total: rowUser[k] });
				}

				dataWeek.sWeek = sumDays;
			}
			if (sToday === null)
				dataWeek.sToday = null;
			else
				dataWeek.sToday = parseFixedFloat(sToday);
			addWeekDataByBoard(dataWeek, weekCur, response2, function () {
				useWeeklyReportData(dataWeek, topbarElem, user, bUpdateErrorState);
			});
		});
}

function addWeekDataByBoard(dataWeek, weekCur, response, callback) {
	//note: this used to be a separate sql report, now it reuses passed response
	var i = 0;
	var ordered = [];
	var mapUsers = {};
	var users = [];
	var colUserLast = 0; //column for next new user
	var drilldownData = [];
				
	if (response.status == STATUS_OK) {
		//dataWeek is not ordered like we want, do so first
		var rows = response.rows;
		rows.sort(function (a, b) {
			var ret = a.nameBoard.localeCompare(b.nameBoard);
			if (ret != 0)
				return ret;
			ret = a.user.localeCompare(b.user);
			if (ret != 0)
				return ret;
			ret = a.date - b.date;
			return ret;
		});

	    //transform array
		var rowOrder = null;
		if (response.status == STATUS_OK) {
			for (; i < rows.length; i++) {
				var row = rows[i];
				if (row.user == null)
					continue; //review zig when does this happen, no data? (sql response status row)
				var columnUser = mapUsers[row.user];
				if (columnUser === undefined) {
				    colUserLast++;
					columnUser = colUserLast;
					mapUsers[row.user] = columnUser;
					users.push(row.user);
				}

				if (ordered.length == 0 || ordered[ordered.length - 1][0] != row.nameBoard) {
					ordered.push([row.nameBoard]);
					drilldownData.push([row.nameBoard]);
				}
				rowOrder = ordered[ordered.length - 1]; //last one is current one
				var drillOrder = drilldownData[ordered.length - 1];
				while (rowOrder.length != colUserLast + 1) {
					rowOrder.push(0);
					drillOrder.push([]);
				}
				rowOrder[columnUser] += row.spent;
				drillOrder[columnUser].push(row);
			}

			for (i = 0; i < ordered.length; i++) {
				rowOrder = ordered[i];
				var iCol = 1;
				for (; iCol < rowOrder.length; iCol++)
					rowOrder[iCol] = parseFixedFloat(rowOrder[iCol]); //format it here so charts dont have to
				while (rowOrder.length != colUserLast + 1)
					rowOrder.push(0);
			}
		}
	}
	dataWeek.byBoard = { table: ordered, status: response.status, users: users, drilldownData: drilldownData, bReuseCharts: dataWeek.bReuseCharts };
	callback();
}

function useWeeklyReportData(dataWeek, topbarElem, user, bUpdateErrorState) {
	configureSsLinksWorkerPostOauth(dataWeek, topbarElem, user, bUpdateErrorState);
	insertFrontpageCharts(dataWeek, user);
}


function insertHistoryRowFromUI(row) {
	sendExtensionMessage({ method: "insertHistoryRowFromUI", row: row }, function (response) {
		if (response.status != STATUS_OK) {
			alert("Insert error: " + response.status);
			return;
		}
	});
}

function getSQLReport(sql, values, callback) {
	getSQLReportShared(sql, values, callback, function onError(status) {
		setSyncErrorStatus($('#urlUser'), status);
	});
}


function getRecentWeeksList(elemUser) {
	var combo = $('<select id="spentRecentWeeks" />').addClass("agile_weeks_combo");//.css('margin-left','5px');
	combo.css('cursor', 'pointer');
	combo.attr("title","click to change the week being viewed.");
	var date = new Date();
	var dateEnd = new Date();
	var daysDelta = DowMapper.posWeekFromDow(date.getDay());
	var i = 0;
	for (; i < 15; i++) {
	    date.setDate(date.getDate() - daysDelta);
		var text = getCurrentWeekNum(date);
		var title = date.toLocaleDateString();
		dateEnd.setDate(date.getDate() + 6);
		title = title + " - " + dateEnd.toLocaleDateString();
		combo.append($(new Option(text, text)).addClass('agile_weeks_combo_element').attr("title",title));
		daysDelta = 7;
	}
	
	if (g_weekNumUse != null)
	    combo.val(g_weekNumUse);
	combo.change(function () {
		if (!g_bReadGlobalConfig) {
			combo[0].selectedIndex = 0;
			return false;
		}
		combo.attr("title", "");
		var val = ($(this).val());
		g_weekNumUse = val;
		var userCur = getCurrentTrelloUser();
		var config = g_configData;
		if (userCur) { //review zig move up
			doWeeklyReport(config, userCur, true, true);
		}
		return true;
	});

	return combo;
}


function getAllUsersList() {
	var combo = $('<select id="spentAllUsers" />').addClass("agile_users_combo");//.css('margin-left','5px');
	chrome.storage.local.get("allUsersSpent", function (obj) {
		var users = obj["allUsersSpent"];
		combo.css('cursor', 'pointer');
		combo.append($(new Option("Users", "")).addClass('agile_users_combo_element agile_users_combo_element_disabled').attr("disabled", "disabled"));
		if (users !== undefined) {
			var i = 0;
			for (i = 0; i < users.length; i++) {
				combo.append($(new Option(users[i][0], users[i][1])).addClass('agile_users_combo_element'));
			}
		}
		combo[0].selectedIndex = 0; //force it since its disabled
		combo.change(function () {
			var url = ($(this).val());
			$(this)[0].selectedIndex = 0;
			if (url != "") {
				url = "https://docs.google.com/spreadsheet/ccc?key=" + url;
				window.open(url, '_blank');
			}
		});
	});
	return combo;
}
function buildDailyTable(content) {
    return "<table class='agile_urlUserTable agile_plus_header_link_zoomhover'><tbody>" + content + "</tbody></table>";
}

function configureSsLinksWorkerPostOauth(resp, b, user, bUpdateErrorState) {
    //resp can be null in case plus display changes are is disabled from plus help
	if (bUpdateErrorState === undefined)
		bUpdateErrorState = true;
	var urlUserElem = $('#urlUser');
	if (resp && resp.status != STATUS_OK) {
		if (bUpdateErrorState) {
			setTimeout(function () {
				//set error text later, to avoid cases when user navigates back/away while on this xhr call.
				setSyncErrorStatus(urlUserElem, resp.status);
			}, 100);
		}
		return;
	}

	var nameSsLink = "";
	if (bUpdateErrorState)
		setSyncErrorStatus(urlUserElem, resp.status);

	if (!resp) {
	    nameSsLink = "<tr><td>Plus disabled</td></tr>";
	}
	else {
	    processUserSENotifications(resp.sToday, resp.sWeek);
	    if (resp.weekSummary.rows.length == 0)
	        nameSsLink = "<tr><td>Ø</td></tr>";
	    else {
	        var row1 = "";
	        var row2 = "";
	        resp.weekSummary.rows.forEach(function (row) {
	            row1 = row1 + "<td>" + row.day + "</td>";
	            row2 = row2 + "<td>" + parseFixedFloat(row.total, false, true) + "</td>";
	        });
	        nameSsLink = "<tr>" + row1 + "</tr>" + "<tr>" + row2 + "</tr>";
	    }
	}
	urlUserElem.html(buildDailyTable(nameSsLink));
	var trelloLogo = $(".header-logo-default");
	if (trelloLogo.length > 0) {
	    var parentLogo = trelloLogo.parent();
	    parentLogo.hide();
	    parentLogo.css("float", "right");
	    parentLogo.css("left", "auto");
	    parentLogo.css("margin-left", "-100px");
	    parentLogo.css("margin-top", "-5px");
	    parentLogo.insertAfter(b);
	    parentLogo.show();
	    //trelloLogo.parent().animate({ left: "350px" }, 1200, "easeInQuart");
	}

	b.fadeIn(300);
	insertPlusFeed(g_bCreatedPlusHeader);
	g_bCreatedPlusHeader = false;
}

function updateSsLinks() {
	doSyncDB(getCurrentTrelloUser(), true, false, true);
}


function setupBurnDown(bShowHeaderStuff, bShowSumFilter) {
	var board = getCurrentBoard();
	if (board == null || remainingTotal === undefined)
	    return false;

	if (!bShowHeaderStuff)
	    bShowSumFilter=false;
	var burndownLink = $(".agile_plus_burndown_link");
	var reportLink = $(".agile_plus_report_link");
	var spanFilter = $(".agile_plus_filter_span");

	var idBoard = getIdBoardFromUrl(document.URL);
	if (idBoard == null)
		return false;

	if (burndownLink.length == 0) {
	    burndownLink = $("<img title='Plus - Board Dashboard'>").attr("src", chrome.extension.getURL("images/chart-sm.png")).addClass("agile_img_boardheader agile_plus_burndown_link");
	    burndownLink.insertAfter(spentTotal);
	    burndownLink.click(function () {
	        var boardCur = getCurrentBoard(); //board could have changed relative to "board"
	        if (boardCur == null)
	            return false;
	        var idBoardCur = getIdBoardFromUrl(document.URL);
	        if (idBoardCur == null)
	            return false;
	        var url = chrome.extension.getURL("dashboard.html") + "?board=" + encodeURIComponent(boardCur) + "&idBoard=" + encodeURIComponent(idBoardCur);
	        window.open(url, '_blank');
	        return false;
	    });

	    reportLink = $("<img title='Plus - Board Report'>").attr("src", chrome.extension.getURL("images/report-sm.png")).addClass("agile_img_boardheader agile_plus_report_link");
	    reportLink.insertAfter(burndownLink);
	    reportLink.click(function () {
	        var idBoardCur = getIdBoardFromUrl(document.URL);
	        if (idBoardCur == null)
	            return false;
	        var url = chrome.extension.getURL("report.html") + "?groupBy=idCardH&idBoard=" + encodeURIComponent(idBoardCur);
	        window.open(url, '_blank');
	        return false;
	    });

	    spanFilter = $('<span class="agile_plus_filter_span" style="float:right;display:none;">');
	    var filterSumCheck = $('<input  type="checkbox" value="checked" id="agile_plus_filter_check"  style="margin-bottom:0px;margin-top:0.55em;float:right;min-height:0.5em;line-height:0.5em;height:1em;margin-bottom:0px;cursor:pointer;">');
	    var labelSumCheck = $('<label for="agile_plus_filter_check" style="float:right;padding-right:0.4em;margin-top:0.40em;margin-bottom:0px;font-weight:normal;cursor:pointer;">').text("Sum filtered");
	    spanFilter.append(labelSumCheck).append(filterSumCheck);
	    spanFilter.insertAfter(reportLink);
	    var keyPropbSumFilteredCardsOnly = "bSumFilteredCardsOnly";

	    filterSumCheck[0].checked = g_bCheckedbSumFiltered;

	    filterSumCheck.click(function () {
	        filterSumCheck[0].disabled = true;
	        g_bCheckedbSumFiltered = filterSumCheck.is(':checked');
	        var pairbCheckedbSumFiltered = {};
	        pairbCheckedbSumFiltered[keyPropbSumFilteredCardsOnly] = g_bCheckedbSumFiltered;
	        chrome.storage.sync.set(pairbCheckedbSumFiltered, function () {

	            function finished() {
	                filterSumCheck[0].disabled = false;
	            }

	            if (chrome.runtime.lastError !== undefined) {
	                g_bCheckedbSumFiltered = !g_bCheckedbSumFiltered; //poor man recovery
	                filterSumCheck[0].checked = g_bCheckedbSumFiltered;
	                finished();
	                return;
	            }
	            updateCards(getCurrentBoard(), finished, true);
	        });
	    });
	}

	if (bShowHeaderStuff) {
	    burndownLink.show();
		reportLink.show();
	} else {
		reportLink.show();
	    burndownLink.hide();
	}

	if (bShowSumFilter)
	    spanFilter.show();
	else
	    spanFilter.hide();

	return true;
}


function processUserSENotifications(sToday,sWeek) {
	if (sToday === null)
		return;
	try {
		var factor = 10;
		if (sWeek > 100)
			factor = 1;
		else if (sWeek < 10)
			factor = 100;
		var sBadge = Math.round(sWeek * factor) / factor;
		if (sBadge >= 1000)
			sBadge = "+999";
		sendExtensionMessage({ method: "setBadgeData", text: "" + sBadge, weeknum: getCurrentWeekNum()});
		var dtToday = new Date();
		var key = "spentLastNotified";
		var strToday = makeDateCustomString(dtToday);
		chrome.storage.local.get(key, function (obj) {
			var value = obj[key];
			if (value != null) {
				if (strToday == value.strToday && sToday == value.sToday)
					return;
			}
			var pair = {};
			pair[key] = { strToday: strToday, sToday: sToday };
			chrome.storage.local.set(pair, function (obj) { });
			if (sToday!=0)
			    sendDesktopNotification("Spent today: " + sToday, 3000);
		});

	} catch (e) {
		//nothing
	}
}

function insertFrontpageCharts(dataWeek, user) {
	var mainDiv = $("#content");
	insertFrontpageChartsWorker(mainDiv, dataWeek, user);
}

function insertFrontpageChartsWorker(mainDiv, dataWeek, user) {
	//reset. Note case when navigating from board to home through trello logo, wont cause navigation
    if (!bAtTrelloHome()) {
		g_chartsCache = {};
		return false;
	}

    if (!dataWeek.bReuseCharts)
        g_chartsCache = {};

    var divMainBoardsContainer = $(".member-boards-view");
    var divInsertAfter = $(".boards-page-board-section");
    if (divMainBoardsContainer.length == 0 || divInsertAfter.length == 0) {
		setTimeout(function () { insertFrontpageChartsWorker(mainDiv, dataWeek, user); }, 50); //wait until trello loads that div
		return false;
	}

	var classContainer = "agile_spent_items_container";
	var divSpentItems = $("." + classContainer);
	var idChartModuleSpentWeekUsers = "spent_week_users";
	var idChartModuleSpentWeekBoard = "spent_week_board";
	var idRecentModule = "spent_recent_cards";
	var idPendingModule = "spent_pending_cards";
	var strPostfixStatus = "_status";

	if (divSpentItems.length == 0) {
	    var seHeader = $('<p id="headerSEActivities" class="agile_arrow_title"><b style="margin-left:17px;">Plus S/E</b></p>');

	    if (false) {
	        var spanIcon = $("<span>");
	        var icon = $("<img>").attr("src", chrome.extension.getURL("images/iconspent.png"));
	        icon.addClass("agile-spent-icon-homeSections");
	        spanIcon.append(icon);
	        seHeader.append(spanIcon);
	    }
	    divSpentItems = $('<div></div>').addClass(classContainer);
	    divInsertAfter = divInsertAfter.eq(0);
		
	    divSpentItems.css("opacity", 0);
		divSpentItems.hide();
		var seContainer = $('<div id="agile_seContainer" class="agile_arrow_closed agile_arrow_container">');
		seContainer.append(seHeader);
		var waiter = CreateWaiter(4, function () { //review promise
		    seContainer.append(divSpentItems);
		    seContainer.insertAfter(divInsertAfter);

		    function refreshAll() {
                //all these is so we can have the chart drawn and height calculated before we start the slide
		        divSpentItems.css("opacity", 0);
		        divSpentItems.css("height", 0);
		        divSpentItems.show();
		        if (g_bPreventChartDraw)
		            g_bPreventChartDraw = false;

		        redrawAllCharts();
		        
		        divSpentItems.hide();
		        divSpentItems.css("height", "");
		    }

		    seHeader.click(function () {
		        var bOpened = (seContainer.hasClass("agile_arrow_opened"));
		        g_bShowHomePlusSections = !bOpened;
		        if (!bOpened) {
		            refreshAll();
		        }
		        handleSectionSlide(seContainer, divSpentItems);
		        chrome.storage.sync.set({ "bClosePlusHomeSection": !g_bShowHomePlusSections }, function () {
		        //ignore chrome.runtime.lastError
		        });
		    });

		    //pretend charts are visible so we can preload charts. this speeds up the first time we drop down the header
		    var bShowSaved = g_bShowHomePlusSections;
		    g_bShowHomePlusSections = true;
		    refreshAll();
		    g_bShowHomePlusSections = bShowSaved;
		    if (g_bShowHomePlusSections) {
		        setTimeout(function () {//using timeout and animationFrame in hopes of improving animation sync with page dom load
		            window.requestAnimationFrame(function () { 
		                handleSectionSlide(seContainer, divSpentItems);
		            });
		        },300);
		    }
		});

		g_bPreventChartDraw = true;

		var tableSpentItems = $('<table id="idTableSpentItemsHome" border="0" cellpadding="0" cellspacing="0"></table>');
		var row1 = $('<tr></tr>');
		var row2 = $('<tr></tr>');
		tableSpentItems.append(row1);
		tableSpentItems.append(row2);
		divSpentItems.append(tableSpentItems);
		var cellA = $('<td />');
		var cellB = $('<td />');
		row1.append(cellA);
		row1.append(cellB);
		var cellC = $('<td />');
		var cellD = $('<td />');
		row2.append(cellC);
		row2.append(cellD);
		waiter.SetWaiting(true);
		chartModuleLoader(waiter, divSpentItems, cellA, "Week by user", idChartModuleSpentWeekUsers, idChartModuleSpentWeekUsers + strPostfixStatus, dataWeek, loadChartSpentWeekUser, "left");
		chartModuleLoader(waiter, divSpentItems, cellB, "Week by board", idChartModuleSpentWeekBoard, idChartModuleSpentWeekBoard + strPostfixStatus, dataWeek.byBoard, loadChartSpentWeekBoard, "left");
		var divItemDashboardRecent = addModuleSection(false, cellC, "Recent card S/E", idRecentModule, true, "left", true);
		var divItemDashboardUnspent = addModuleSection(false, cellD, "Remaining balance cards", idPendingModule, true, "left", true);
		loadDashboards(waiter, divItemDashboardRecent, divItemDashboardUnspent, user);
	} else {
		var divItemDashboardRecent2 = $("#" + idRecentModule);
		var divItemDashboardUnspent2 = $("#" + idPendingModule);
		loadChartSpentWeekUser(null, divSpentItems, idChartModuleSpentWeekUsers, idChartModuleSpentWeekUsers + strPostfixStatus, dataWeek);
		loadChartSpentWeekBoard(null,divSpentItems, idChartModuleSpentWeekBoard, idChartModuleSpentWeekBoard + strPostfixStatus, dataWeek.byBoard);
		loadDashboards(null, divItemDashboardRecent2, divItemDashboardUnspent2, user);
	}
	return true;
}

function chartModuleLoader(waiter, divSuperContainer, divSpentItems, title, idChartModule, idElemChartStatus, data, callback, strFloat) {
	var divItem = addModuleSection(true, divSpentItems, title, idChartModule, false, strFloat);
	divItem.attr("align", "center");

	var nameLocal = idChartModule + "-Height";
	chrome.storage.local.get(nameLocal, function (obj) {
		var heightLast = obj[nameLocal];
		if (heightLast === undefined)
			heightLast = "50px";
		divItem.css("height", heightLast);
		//divSuperContainer.show();
		callback(waiter,divSuperContainer, idChartModule, idElemChartStatus, data);
	});
}

function cancelZoomin(callback, bQuick) {
    //needed because the zoom library leaves styles behind on the body. Clear them here, otherwise some things break like chart drill-down windows after a zoomin/zoomout
    var zoomed = $(".agile_zoomedElement");
    var strBodyTransProp = document.body.style.getPropertyValue("-webkit-transform") || "";
    if (zoomed.length > 0 || strBodyTransProp.length>0) {
        zoomed.removeClass("agile_zoomedElement");
        function preCallback() {
            document.body.style.setProperty("-webkit-transform-origin", "none");
            document.body.style.setProperty("transform-origin", "none");
            document.body.style.setProperty("-webkit-transform", "none");
            document.body.style.setProperty("transform", "none");
            if (callback) {
                setTimeout(callback, 10);
            }
        }

        $("body").zoomTo({ targetsize: 1, duration: bQuick?100 : 600, animationendcallback: preCallback });
    }
    else if (callback)
        callback();
}

function addModuleSection(bEnableZoom, div, name, id, bHidden, strFloat, bLastRow) {
	if (bHidden === undefined)
		bHidden = false;
	var divModule = $("<DIV>");
	var divTitleContainer = $("<DIV>").addClass("agile_spent_item_title");

	if (g_bNewTrello) {
		divTitleContainer.addClass("agile_spent_item_title_newTrello"); //fix width
		divModule.addClass("agile_module_newtrello");

		if (strFloat)
			divModule.css("float", strFloat);
	}

	
	var titleModule = $('<h3>').addClass("classid_"+id+" sectionTitleFont");
	if (bEnableZoom) {
	    titleModule.addClass("agile_spent_item_title_zoomable");
	    titleModule.attr("title", "Click to zoom in/out");
	    titleModule.css("cursor", "-webkit-zoom-in");
	    titleModule.click(function (evt) {
	        if (divModule.hasClass("agile_zoomedElement")) {
	            titleModule.css("cursor", "-webkit-zoom-in");
	            cancelZoomin();
	        }
	        else {
	            function onFinishZoom() {
	                //need to change cursor here, else will change during animation on top of chart.
	                titleModule.css("cursor", "-webkit-zoom-out");
	            }
	            removeAllGrumbleBubbles();
	            divModule.zoomTo({ targetsize: 1, duration: 600, animationendcallback: onFinishZoom });
	            divModule.addClass("agile_zoomedElement");
	        }
	        evt.stopPropagation();
	    });
	}
	divTitleContainer.append(titleModule.text(name));
	divModule.append(divTitleContainer);
	var divItem = $('<div id="' + id + '"></div>').addClass("agile_spent_item notranslate");
	if (g_bNewTrello)
	    divItem.addClass("agile_spent_item_newTrello");
	if (bLastRow)
	    divItem.addClass("agile_spent_item_lastRow");
	divModule.append(divItem);
	if (bHidden)
		divModule.hide();
	div.append(divModule);
	return divItem;
}

function doRecentReport(waiter, elemRecent, user) {
    //note: includes deleted cards
    var sql = "select count(*) as cGrouped, max(date*1000) as msDate, max(dateLocal) as dateLocal, nameBoard, nameCard, SUM(spent) as spent, sum(est) as est, coalesce(GROUP_CONCAT(comment,'\n'),'') as comment, idCard from \
                (select H.date, datetime(H.date,'unixepoch','localtime') as dateLocal, B.name as nameBoard, C.name as nameCard, H.spent, H.est, H.comment, H.idCard \
				from HISTORY AS H \
				JOIN BOARDS AS B ON H.idBoard=B.idBoard \
				JOIN CARDS AS C ON H.idCard=C.idCard \
				WHERE H.user=? \
				ORDER BY date DESC LIMIT 10) \
                GROUP BY nameBoard,nameCard,idCard \
                ORDER BY dateLocal DESC \
                ";
	var values = [user];
	getSQLReport(sql, values,
		function (response) {
			elemRecent.find($("ul")).remove();
			var list = $("<ul>");
			if (!g_bNewTrello)
				list.addClass("board-list");
			elemRecent.append(list);

			handleLoadRecent(list, response.rows);
			elemRecent.parent().show();
			if (waiter)
			    waiter.Decrease();
		});
}


function doPendingReport(waiter, elemPending, user) {
    if (g_bHidePendingCards) {
        if (waiter)
            waiter.Decrease();
        return;
    }
    var sqlNegativeDiff = (g_bAllowNegativeRemaining ? "" : "CB.diff<-0.005 OR");
	var sql = "select CB.user, CB.spent, CB.est, CB.diff, datetime(CB.date,'unixepoch','localtime') as dateLocal, B.name as nameBoard, C.name as nameCard, C.idCard, \
					CB.date*1000 AS msDate, CB.diff  \
					FROM CARDBALANCE AS CB join CARDS AS C ON CB.idCard=C.idCard AND C.bDeleted=0 \
					jOIN BOARDS B ON B.idBoard=C.idBoard \
					WHERE CB.user=? AND ("+ sqlNegativeDiff + " CB.diff>0.005 OR CB.spent<-0.005 OR CB.est<-0.005) \
					ORDER BY CB.date DESC";
	var values = [user];
	getSQLReport(sql, values,
		function (response) {
			elemPending.find($("ul")).remove();
			var list = $("<ul>");
			if (!g_bNewTrello)
				list.addClass("board-list");
			elemPending.append(list);

			handleLoadPending(list, response.rows);
			elemPending.parent().show();
			if (waiter)
			    waiter.Decrease();
		});
}

function loadDashboards(waiter, elemRecent, elemUnspent, user) {
	if (!g_bReadGlobalConfig) {
		logPlusError("unusual: loadDashboards not ready.");
		return;
	}

	doRecentReport(waiter, elemRecent, user);
	doPendingReport(waiter, elemUnspent, user);
}

function addDashboardListItem(list, name, url, badge, tooltip, color) {
	var li = $("<li>");
	var a = $("<a>").addClass("agile-card-listitem").attr("href", url);
	if (!g_bNewTrello)
		a.addClass("js-open-board");
	else
		a.css("text-decoration", "none");

	var span = $("<span>").addClass("item-name").text(name);
	if (g_bNewTrello)
		span.addClass("agile-lineitem_newTrello");
	if (color !== undefined && color != null)
		span.css('color', color);
	if (badge !== undefined && badge != null) {
		badge.css('color', color);
		a.append(badge);
	}
	if (tooltip !== undefined)
		a.attr('title', tooltip);
	a.append(span);
	li.append(a);
	list.append(li);
	return span;
}

function handleLoadRecent(listElem, data) {
    var i = 0;
    var dateNow = new Date();
	for (; i < data.length; i++) {
		var row = data[i];
		if (row.dateLocal == null)
			break;
		var url = "https://trello.com/c/" + row.idCard;
		var comment = row.comment || ""; //review zig: cant find how a user reported this was null. I added this and a colalesce into the report, but cant see how it can happen.
		var commentNew = "";
		do {
		    commentNew = comment.replace(/\n\n/gm, "\n");
		    if (commentNew == comment)
		        break;
		    comment = commentNew;
		} while (true);
		if (comment == "\n")
		    comment = "";
		var tooltip = "";
		var prefixSE = "";
		var bMultiple = (row.cGrouped > 1);
		if (bMultiple) {
		    prefixSE = "Sum ";
		    tooltip = "" + row.cGrouped + " S/E rows.\nLast: ";
		}

		var cDays = dateDiffInDays(dateNow, new Date(row.msDate));

		if (cDays == 0)
		    tooltip += "today ";
		else if (cDays == 1)
		    tooltip += cDays+" day ago ";
		else
		    tooltip += cDays+" days ago ";

		tooltip = tooltip + row.dateLocal + "\n" + prefixSE + "S: " + row.spent + "   E: " + row.est;
		if (comment)
		    tooltip=tooltip+ "\n" + (row.cGrouped > 1 ? "Comments:\n" : "Comment: ") + comment;

		addDashboardListItem(listElem, strTruncate(row.nameBoard) + " - " + strTruncate(row.nameCard), url, null, tooltip);
	}
}

function handleLoadPending(listElem, data) {
    var i = 0;
    var dateNow = new Date();
	for (; i < data.length; i++) {
		var row = data[i];
		if (row.dateLocal == null)
			break;
		var url = "https://trello.com/c/" + row.idCard;
		var cDays = dateDiffInDays(dateNow, new Date(row.msDate));
		var tooltip = "Last S/E " + cDays;

		if (cDays == 1)
			tooltip += " day ago.";
		else
			tooltip += " days ago.";

		var bError = false;
		if (row.spent < -0.005) {
			tooltip += " Error! negative total spent in this card.";
			bError = true;
		} else if (row.est < -0.005) {
			tooltip += " Error! negative total estimate in this card.";
			bError = true;
		} else if (row.diff < -0.005 && !g_bAllowNegativeRemaining) {
			tooltip += " Error! negative remaining in this card. You must increase its Estimate.";
			bError = true;
		}

		var badge = BadgeFactory.makeRemainingBadge().addClass("agile_badge_home");
		badge.contents().last()[0].textContent = parseFixedFloat(row.diff);
		var color = null;
		if (cDays > 7 && !bError)
			color = "darkgray";
		var span = addDashboardListItem(listElem, strTruncate(row.nameBoard) + " - " + strTruncate(row.nameCard), url, badge, tooltip, color);
		if (bError)
			span.addClass("agile_card_error");
	}
}


function dateDiffInDays(a, b) {
	// Discard the time and time-zone information.
	var utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
	var utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());

	return Math.floor((utc1 - utc2) / (1000 * 60 * 60 * 24));
}

var g_chartsCache = {};
function loadChartSpentWeekUser(waiter, divContainer, idElem, idElemStatusChart, response) {
	if (!g_bReadGlobalConfig) {
		logPlusError("unusual: loadChartSpentWeekUser not ready.");
		return;
	}

	var elem = divContainer.find("#" + idElem);
	if (elem.length == 0)
		return;
	
	if (response.status != STATUS_OK || response.table === undefined || response.table.length == 0) {
	    if (waiter)
	        waiter.Decrease();
		elem.hide();
		return;
	} else
		elem.show();

	var rows = response.table;
	var data = new google.visualization.DataTable();
	var iDay = 0;
	data.addColumn('string', 'Who');
	for (; iDay < 7; iDay++) {
	    data.addColumn('number', getWeekdayName(DowMapper.dowFromPosWeek(iDay)));
	}

	var mapRows = addSumToRows(false, rows);
	data.addRows(rows);
	finishSpentChartConfig(waiter, idElem, elem, data, "top", 100, 0, response.drilldownData, "User", false, mapRows);
}



function getHtmlDrillDownTooltip(rows, bReverse, colExclude) {
	var headerBase = [{ name: "Date" }, { name: "User" }, { name: "Board" }, { name: "Card" }, { name: "S" }, { name: "E" }, { name: "Note", bExtend: true }, { name: COLUMNNAME_ETYPE }];

	var header = [];
	var iHeader = 0;
	for (; iHeader < headerBase.length; iHeader++) {
		if (headerBase[iHeader].name != colExclude)
			header.push(headerBase[iHeader]);
	}

	function callbackRowData(row) {
		var rgRet = [];
		var date = new Date(row.date * 1000); //db is in seconds
		rgRet.push({ name: makeDateCustomString(date,true), bNoTruncate: true });
		if (colExclude!="User")
			rgRet.push({ name: row.user, bNoTruncate: false });
		if (colExclude != "Board") {
		    if (row.idBoard) {
		        var urlBoard = "https://trello.com/b/" + row.idBoard;
		        rgRet.push({ name: "<A href='" + urlBoard + "'>" + strTruncate(row.nameBoard) + "</A>", bNoTruncate: true }); //no target makes it so trello loads it quickly and the drilldown stays up
		    }
		    else {
		        rgRet.push({ name: row.nameBoard, bNoTruncate: false });
		    }
		}
		var urlCard = null;
		if (row.idCard.indexOf("https://") == 0)
			urlCard = row.idCard; //old-style card URLs. Could be on old historical data from a previous Spent version
		else
			urlCard = "https://trello.com/c/" + row.idCard;
		rgRet.push({ name: "<A href='" + urlCard + "'>" + strTruncate(row.nameCard) + "</A>", bNoTruncate: true }); //no target makes it so trello loads it quickly and the drilldown stays up
		var sPush = parseFixedFloat(row.spent);
		var estPush = parseFixedFloat(row.est);
		rgRet.push({ type: "S", name: sPush, bNoTruncate: true });
		rgRet.push({ type: "E", name: estPush, bNoTruncate: true });
		rgRet.push({ name: row.comment, bNoTruncate: false });
		rgRet.push({ name: nameFromEType(row.eType), bNoTruncate: true });
		rgRet.title = "(" + sPush + " / " + estPush + ") " + row.comment;
		return rgRet;
	}

	return getHtmlBurndownTooltipFromRows(true, rows, bReverse, header, callbackRowData);
}

function loadChartSpentWeekBoard(waiter, divContainer, idElem, idElemStatusChart, response) {
	//review zig idElemStatusChart and in byUser unused
	if (!g_bReadGlobalConfig) {
		logPlusError("unusual: loadChartSpentWeekBoard not ready.");
		return;
	}

	var elem = divContainer.find("#" + idElem);
	if (elem.length == 0)
		return;

	if (response.status != STATUS_OK || response.table === undefined || response.table.length == 0) {
	    if (waiter)
	        waiter.Decrease();
		elem.hide();
		return;
	} else
		elem.show();

	var rows = response.table;
	var data = new google.visualization.DataTable();
	var iUser = 0;
	data.addColumn('string', 'Board');
	for (; iUser < response.users.length; iUser++)
		data.addColumn('number', response.users[iUser]);

	var mapRows = addSumToRows(false, rows);
	data.addRows(rows);
	finishSpentChartConfig(waiter, idElem, elem, data, "none", 150, 0, response.drilldownData, "Board",true, mapRows);
}

function finishSpentChartConfig(waiter, idElem, elem, data, posLegend, pxLeft, pxRight, drilldowns, colExclude, bReverse, mapRows) {
	var height = ((1 + data.getNumberOfRows()) * g_heightBarUser);
	if (posLegend == "top" || posLegend == "bottom")
		height += g_marginLabelChart;
	elem.css("height", "" + height);

	var chartParams = g_chartsCache[idElem];
    //timing note: we also check for elemChart being the right one. Sometimes the chart cache is left behind when trello plays navigation tricks.
    //example: from home click a board, then do "back". g_chartsCache will still be the old one
	var chartNew = null;
	if (chartParams === undefined || chartParams.elemChart != elem[0] || !g_bShowHomePlusSections) {
		chartNew = new google.visualization.BarChart(elem[0]);
		google.visualization.events.addListener(chartNew, 'animationfinish', function (e) {
		    handleRemapLabels(g_chartsCache[idElem]);
		});
	}
	else {
	    chartNew = chartParams.chart; //reuse chart
	}
	chartParams = { chart: chartNew, data: data, posLegend: posLegend, pxLeft: pxLeft, pxRight: pxRight };
	g_chartsCache[idElem] = chartParams;

	chartParams.data = data;
	chartParams.posLegend = posLegend;
	chartParams.pxLeft = pxLeft;
	chartParams.pxRight = pxRight; //NOTE: not used. gcharts doesnt support 'right'
	chartParams.mapRows = mapRows;
	chartParams.elemChart = elem[0];
	chartParams.chart.removeAction('drilldown'); //not sure if chart allows duplicate ids, so remove just in case
	chartParams.chart.removeAction('close-drilldown');
	if (drilldowns) {
	    
		chartParams.chart.setAction({
			id: 'drilldown',				  // An id is mandatory for all actions.
			text: 'Drill-down',	   // The text displayed in the tooltip.
			action: function () {		   // When clicked, the following runs.
			    cancelZoomin(function () {
			        handleDrilldownWindow(chartParams.chart, drilldowns, getHtmlDrillDownTooltip, colExclude, 1100, bReverse);
			        drawSpentWeekChart(chartParams);
			    });
			}
		});

		chartParams.chart.setAction({
			id: 'close-drilldown',				  // An id is mandatory for all actions.
			text: 'Close',	   // The text displayed in the tooltip.
			action: function () {		   // When clicked, the following runs.
				drawSpentWeekChart(chartParams);
			}
		});
	}

	if (!g_bPreventChartDraw)
	    drawSpentWeekChart(chartParams);
	if (waiter)
	    waiter.Decrease();
	var pair = {};
	var nameLocal = idElem + "-Height";
	pair[nameLocal] = height;
	chrome.storage.local.set(pair, function () { });
}

function redrawAllCharts() {
	var i = null;
	var chartsParams = g_chartsCache;
	for (i in chartsParams) {
		var cp = chartsParams[i];
		drawSpentWeekChart(cp);
	}
}

function updateUsersList(users) {
	users.sort(
		function (aParam, bParam) {
			var a = aParam[0];
			var b = bParam[0];
			if (a > b)
				return 1;
			if (a < b)
				return -1;
			return 0;
		}
	);

	//chrome.storage.local.remove("allUsersSpent");
	//return;
	var pair = {};
	pair["allUsersSpent"] = users;
	chrome.storage.local.set(pair, function (obj) {

	}
	);
}

function drawSpentWeekChart(chartParams) {
    if (!g_bShowHomePlusSections)
        return;
	var chart = chartParams.chart;
	var data = chartParams.data;
	var posLegend = chartParams.posLegend;
	var pxLeft = chartParams.pxLeft;
	var pxRight = chartParams.pxRight;
	var mapRows = chartParams.mapRows;
	var elemChart = chartParams.elemChart;

	var top = 0;
	var bottom = 0;
	var right = 0;

	if (posLegend == "top")
		top = g_marginLabelChart;
	else if (posLegend == "bottom")
		bottom = g_marginLabelChart;

	var style = {
		chartArea: { left: pxLeft, top: top, bottom: bottom, right: 0, height: data.getNumberOfRows() * g_heightBarUser, width: "100%" },
		tooltip: { isHtml: true, trigger: 'selection' },
		vAxes: [{
			useFormatFromData: true,
			minValue: null,
			viewWindowMode: null,
			viewWindow: null,
			maxValue: null,
			titleTextStyle: {
				color: "#222",
				fontSize: 9,
				italic: true
			},
			textStyle: {
				color: "#222",
				fontSize: 9
			}
		},
		{
			useFormatFromData: true
		}],
		series: {
			0: {
				errorBars: {
					errorType: "none"
				}
			}
		},
		booleanRole: "certainty",
		animation: {
			duration: 330,
			easing: "in"
		},
		backgroundColor: {
			fill: g_bNewTrello ? "#FFFFFF" : "#F0F0F0"
		},
		legend: posLegend,
		hAxis: {
			useFormatFromData: false,
			formatOptions: {
				source: "inline",
				suffix: UNITS.current
			},
			slantedText: false,
			minValue: null,
			format: "0.##'"+UNITS.current+"'",
			viewWindow: {
				max: null,
				min: null
			},
			logScale: false,
			gridlines: {
				count: 4
			},
			maxValue: null,
			titleTextStyle: {
				color: "#222",
				fontSize: 9,
				italic: true
			},
			textStyle: {
				color: "#222",
				fontSize: 9
			}
		},
		isStacked: true,
		legendTextStyle: {
			color: "#222",
			fontSize: 9
		}
	};
	chart.draw(data, style);
	handleRemapLabels(chartParams);
}

function removePostfix(str, postfix) {
	if (postfix.length == 0)
		return str;
	var iDots = str.indexOf(postfix);
	if (iDots<0 || iDots + postfix.length != str.length)
		return str;
	return str.substr(0, iDots);
}

function remapTextElements(value, postfix, svg, mapRows, mapDone) {

	if (mapDone[value] == true)
		return;

	var elem = svg.eq(0).find("text").filter(function () {
		var valElem = removePostfix(this.innerHTML, postfix);
		if (valElem == value)
			return true;
		if (postfix.length == 0 || this.innerHTML==valElem)
			return false;
		return (value.indexOf(valElem) == 0);
	});

	if (elem.length != 1) {
		//corner case: if there are 2 boards with long names that are equal when cropped,
		//we cant tell which is which so we skip the calc instead of miscalculating
		return;
	}

	//jquery does not work on svg elements (jan 2014) so use the DOM api
	var elemSub = elem[0];
	var val = elemSub.textContent;
	elemSub.textContent = mapRows[value] + " " + removePostfix(elemSub.textContent,postfix);
	mapDone[value] = true;
}


/* handleRemapLabels
 *
 * Why is this needed?
 * Google charts support animations which we use. When we do, charts use the row name to match old with new data.
 * If we were to directly change the row labels when setting the chart data, animations wont match correctly the rows,
 * thus we instead hack the chart svg and change the labels ourselves.
 * For this to work, you need to call this function BOTH from your chart.draw AND from 'animationfinish' chart event.
 **/
function handleRemapLabels(chartParams) {
    if (chartParams && chartParams.mapRows) {
		var mapDone = {};
		var svg = $(chartParams.elemChart).find("svg");
		if (svg.length == 0)
			return;

		var iMap;
		for (iMap in chartParams.mapRows) {
			remapTextElements(iMap, "", svg, chartParams.mapRows, mapDone);
		}
		
		//2nd pass to cover ellipsed labels (long labels ending with ...)
		for (iMap in chartParams.mapRows) {
			remapTextElements(iMap, "...", svg, chartParams.mapRows, mapDone);
		}
	}
}

var g_current_fontSize = null; //cache for setSmallFont

function setMediumFont(elem) {
	return setSmallFont(elem, 0.9);
}

function setSmallFont(elem, percent) {
	var percentUse = percent;
	if (percent === undefined)
		percent = 0.7;
	if (g_current_fontSize == null)
		g_current_fontSize = parseInt($("body").css("font-size"), 10);
	elem.css("font-size", (g_current_fontSize * percent).toFixed() + "px");
	return elem; //for chaining
}

function setNormalFont(elem) {
	return setSmallFont(elem, 1);
}

function checkEnableMoses() {
	if (g_bNewTrello)
		return true;

	var content = $("#content");
	var classHomeContent = "agile_maincontent_margin";

	if (bAtTrelloHome())
		content.addClass(classHomeContent); //do the Moses move.
	else {
		if (content.hasClass(classHomeContent) && $(".agile_spent_items_container").length > 0)
			return false; //call again
		content.removeClass(classHomeContent);
	}
	return true;
}


function doShowAgedCards(bShow) {
    if (isPlusDisplayDisabled())
        return;
    var elems = $(".aging-level-3");
    var elemTrelloFilter=$(".board-header-btn-filter-indicator");
    var bTrelloFilter = (elemTrelloFilter && !elemTrelloFilter.hasClass("hide"));

    if (bTrelloFilter)  //REVIEW zig: not enough. ideally all hidden cards (by "less") shoul be shown again as soon at the trello filter cards pane comes up 
        return;

	if (bShow)
		elems.removeClass("hide");
	else
		elems.addClass("hide");
}

var g_bShowAllItems = false;  //show all items, or recent only (cards and boards)

function checkCreateRecentFilter(header) {
	var elemFilter = header.find($("#toggleAll"));
	if (elemFilter.length > 0)
		return;
	var elem = $('<a id="toggleAll" href="">...</a>').
			css('margin-left', '5px').addClass('agile_plus_header_link').appendTo(header);


	//var elem=$('<span>Less</span>', { id:'toggleAll'}).addClass("agile_all_button").addClass("header-btn").addClass("header-notifications");
	elem.css('cursor', 'pointer');
	header.append(elem);
	updateShowAllButtonState(elem,true);
	elem.click(function (e) {
		e.preventDefault();
		//after set, we get again because set might have failed (over quota)
		chrome.storage.sync.set({ 'bShowAllItems': !g_bShowAllItems }, function () {
			if (chrome.runtime.lastError === undefined)
				updateShowAllButtonState(elem);
		});
	});
}

function updateShowAllButtonState(elem, bFirstTime) {
    if (isPlusDisplayDisabled())
        return;
	chrome.storage.sync.get("bShowAllItems", function (obj) {
		var bShow = obj["bShowAllItems"];
		if (bShow === undefined)
			bShow = true;
		g_bShowAllItems = bShow;

		if (bShow) {
			elem.removeClass("agile_all_unpressed");
			elem.addClass("agile_all_pressed");
			elem.attr("title", "Click to hide old boards and cards.\nMake sure Trello card aging is enabled.");
		} else {
			elem.removeClass("agile_all_pressed");
			elem.addClass("agile_all_unpressed");
			elem.attr("title", "Click to show old boards and cards.");
			if (bFirstTime)
				hiliteOnce(elem,0,"agile_box_more_hilite");
		}
		doShowAgedCards(bShow);
		setTimeout(function () {
		    updateCards(getCurrentBoard(), null, true, false);
		}, 50);

		updateBoardPageTotals();
		var classAgileFilter = "agile_plus_filter_old";

		if (bShow) {
		    elem.text("Less");
		    elem.removeClass(classAgileFilter);
		}
		else {
		    elem.text("More");
		    elem.addClass(classAgileFilter);
		}
	});
}



function testExtensionAndcommitPendingPlusMessages() {
	if (!g_bErrorExtension)
		testExtension(); //this attempts commit of pending queue
}