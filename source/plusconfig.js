/// <reference path="intellisense.js" />

var PlusConfig = {
    bClosed:true,
    bReset:false,
	isVisible: function () {
		return ($('div#spent_serviceUrlConfig_container').size() > 0);
	},
	display: function (plusBarElem, bStealth) {
	    PlusConfig.displayWorker(plusBarElem, bStealth);
	},
	displayWorker: function (plusBarElem, bStealth) {
	    var thisLocal = this;
		function setFont(elem) { return setMediumFont(elem); }
		if (thisLocal.isVisible()) {
			return;
		}
		thisLocal.bClosed = false;
		var container = $('<div id="spent_serviceUrlConfig_container"></div>');
		var btnOk = $('<button>OK</button>');
		var btnCancel = $('<button>Cancel</button>');
		var divInput = $('<div />');
		var input = $('<input type="url" spellcheck="false"></input>').width('100%');
		if (g_strServiceUrl != null)
			input.val(g_strServiceUrl);
		container.append($('<H2 text-align="center"><b>Setup Google sync</b></H2>'));
		if (!bStealth)
		    container.append(setFont($('<p><b>Google sync (legacy) renames card titles to include total S/E.</b></p>')));
		container.append(setFont($('<p>If you have not <A target="_blank" href="https://support.google.com/chrome/answer/185277">signed-into Chrome</A>, \
Chrome will prompt you to do so. <b><br><i>This is not the same as being signed into your Gmail</i>. </b>\
You need to sign-in to Chrome to use this sync mode.</p>')));
		container.append(setFont($('<p>Configure one device only. Your other devices that sign-in to Chrome will automatically pick up the new configuration. <b>')));
		container.append(setFont($('<p><A target="_blank" href="http://www.plusfortrello.com/p/google-sync-configuration-options.html">Read here</A> to compare "Google sync" with "card comments sync"<b>')));
		container.append($('<p>&nbsp</p>'));
		var btnCreate = setFont($('<button id="buttonCreateSs"></button>')).css('margin-bottom', '5px');
		var strCreate = "Create a new sync spreadsheet";
		var bAppendTeamSpreadsheetText = false;
		btnCreate.text(strCreate);
		if (!g_strServiceUrl) {
		    container.append(setFont($('<p>For team mode, the team manager should use "create" below and share the resulting spreadsheet URL to all team users (with write permissions for those entering S/E).</p>')));
		    btnCreate.show();
		    bAppendTeamSpreadsheetText = true;
		}
		else {
		    btnCreate.hide();
		    container.append(setFont($('<p>To create a new spreadsheet, first clear this one and press OK.</p>')));
		    bAppendTeamSpreadsheetText = true;
		}

		container.append(btnCreate);
		if (bAppendTeamSpreadsheetText)
		    container.append(setFont($('<span > or put the team spreadsheet URL from your team administrator.</span>')));
		divInput.append(setFont(input));
		container.append(divInput);
		//container.append(setFont($('<p>Example: https://docs.google.com/spreadsheets/d/abcabydo/edit#gid=0</p>')));
		if (g_strServiceUrl != null && g_strServiceUrl != "") {
		    var urlClean = g_strServiceUrl.split("#")[0];
		    var strSharingNote = " <A target='_blank' href='" + urlClean + (urlClean.indexOf("?")<0 ? "?" : "&") + "usp=sharing&userstoinvite=type_users_emails_here'>Configure spreadsheet sharing</A>.";
		    container.append(setFont($('<p>' + strSharingNote + '</p>')));
		}
		
		container.append(setFont($('<p>Do not modify the spreadsheet.</p>')));
		container.append(setFont($("<p><A target='_blank' href='https://security.google.com/settings/security/permissions'>View or revoke Google permissions</A> given to 'Plus for Trello'. Before revoking access, set sync to 'off'. <A target='_blank' href='https://support.google.com/drive/answer/2523079'>See more help</A>.</p>")));

		container.append(btnOk).append(btnCancel);
		container.append($('<p>&nbsp</p>'));
		var body = $('body');
		btnCancel.click(function () {
			PlusConfig.close(false);
		});

		btnCreate.click(function () {

		    function worker() {
		        setBusy(true);
		        btnCreate.prop('disabled', true);
		        btnCreate.text("Creating spreadsheet. Approve Google permissions..");
		        sendDesktopNotification("Please wait while Plus creates your sync spreadsheet.", 10000);
		        sendExtensionMessage({ method: "createNewSs" },
                function (response) {
                    setBusy(false);
                    if (response.status != STATUS_OK) {
                        setTimeout(function () { //review zig: convert all requests to sendmessage. here timeout needed because alert causes exception
                            alert("error: " + response.status);
                            btnCreate.text(strCreate);
                            btnCreate.prop('disabled', false);
                            return;
                        }, 100);
                        return;
                    }
                    btnCreate.text("Spreadsheet created OK");
                    btnCreate.prop('disabled', true);
                    var urlCreated = "https://docs.google.com/spreadsheets/d/" + response.id + "/edit#gid=0";
                    input.val(urlCreated);
                    btnOk.css("background", "yellow");
                    if (true) {
                        var urlClean = urlCreated.split("#")[0];
                        var strSharingNote = " <A target='_blank' href='" + urlClean + "&usp=sharing&userstoinvite=type_users_emails_here'>Configure spreadsheet sharing</A>.";
                        container.append(setFont($('<p>' + strSharingNote + '</p>')));
                    }
                    if (g_strServiceUrl && g_strServiceUrl != "") {
                        container.append(setFont($('<p>To revoke permissions to your Google Drive go <a target="_blank" href="https://security.google.com/settings/security/permissions">here</a></p>')));
                    }
                });
		    }

		    sendExtensionMessage({ method: "requestGoogleSyncPermission" }, function (response) {
		        if (response.status != STATUS_OK) {
		            alert(response.status);
		            return;
		        }
		        if (response.status == STATUS_OK && response.granted)
		            worker();
		    });
		    
		});

		btnOk.click(function () {
		    if (thisLocal.bClosed) //not sure if it can happen. for safety in case it gets on a partial failure state.
		        return;

		    var userElem = getCurrentTrelloUser();
		    if (userElem == null) {
		        alert("Unexpected error: cannot detect current Trello user.");
		        return;
		    }
		    var url = input.val().trim();
		    var bError = false;
		    var bReset = thisLocal.bReset;
		    thisLocal.bReset = false;

		    if (!bReset && (g_strServiceUrl == url || (g_strServiceUrl == null && url == ""))) {
		        PlusConfig.close(false);
		        return;

		    }

		    if (url == "")
		        worker();
		    else {
		        sendExtensionMessage({ method: "requestGoogleSyncPermission" }, function (response) {
		            if (response.status != STATUS_OK) {
		                alert(response.status);
		                return;
		            }
		            if (response.status == STATUS_OK && response.granted)
		                worker();
		        });
		    }

		    function worker() {
		        var bSimplePlus = (url.indexOf("https://docs.google.com/") == 0);
		        if (url != "" && !bSimplePlus &&
                    url.indexOf("https://script.google.com/") != 0) {
		            alert("Invalid url format. Enter the correct url, or cancel.");
		            return;
		        }

		        if (url.indexOf("/d/") >= 0) {
		            var parts = url.split("#gid=");
		            if (parts.length < 2) {
		                alert("Invalid url format: missing '#gid='");
		                return;
		            }
		        }
		        if (bSimplePlus && ((url.indexOf("key=") < 0 && url.indexOf("/d/") < 0) || url.indexOf("#gid=") < 0)) {
		            alert("Invalid Google spreadsheet url format. Possibly missing #gid=");
		            return;
		        }

		        var strOldStorage = g_strServiceUrl;

		        sendExtensionMessage({ method: "isSyncing" },
                    function (response) {
                        if (response.status != STATUS_OK) {
                            alert(response.status);
                            return;
                        }

                        if (response.bSyncing) {
                            //note: this isnt perfect but will cover most concurrency cases
                            alert("Plus is currently syncing. Try again later.");
                            return;
                        }


                        sendExtensionMessage({ method: "getTotalDBRowsNotSync" },
                            function (response) {
                                if (response.status != STATUS_OK) {
                                    alert(response.status);
                                    return;
                                }

                                if (g_strServiceUrl && g_strServiceUrl.length > 0 && response.cRowsTotal > 0) {
                                    if (!confirm("You have pending S/E rows not yet saved to the spreadsheet, and will be lost if you press OK.\n\nPress OK if you are sure you want to loose those rows. Otherwise press Cancel and reload the page to start sync."))
                                        return;
                                }

                                //handle sync URL change
                                g_strServiceUrl = url;

                                function setLocalUrlAndRestart() {
                                    //need to store it also in local, otherwise the restart will detect that sync changed but we already handled that.
                                    var pairUrlLocal = {};
                                    pairUrlLocal['serviceUrlLast'] = g_strServiceUrl;
                                    chrome.storage.local.set(pairUrlLocal, function () {
                                        if (chrome.runtime.lastError) {
                                            alert(chrome.runtime.lastError.message);
                                            return;
                                        }
                                        var bOldEnableTrelloSync = g_bEnableTrelloSync;

                                        if (g_optEnterSEByComment.bEnabled || (g_strServiceUrl != "" && (!g_bEnableTrelloSync || g_bDisableSync)) ||
                                            (g_strServiceUrl == "" && (g_bEnableTrelloSync || !g_bDisableSync))) {
                                            var pairTrelloSync = {};
                                            var bNewEnableTrelloSync = (g_strServiceUrl != "");
                                            var bNewDisableSync = !bNewEnableTrelloSync;
                                            if (g_bEnableTrelloSync != bNewEnableTrelloSync)
                                                pairTrelloSync["bEnableTrelloSync"] = bNewEnableTrelloSync;
                                            if (bNewDisableSync != g_bDisableSync)
                                                pairTrelloSync["bDisabledSync"] = bNewDisableSync;
                                            if (g_optEnterSEByComment.bEnabled)
                                                pairTrelloSync["bEnterSEByCardComments"] = false; //turn it off as it has precedence over spreadsheet sync
                                            chrome.storage.sync.set(pairTrelloSync, function () {
                                                if (chrome.runtime.lastError) {
                                                    alert(chrome.runtime.lastError.message);
                                                    return;
                                                }
                                                g_bEnableTrelloSync = bNewEnableTrelloSync;
                                                g_optEnterSEByComment.bEnabled = false;
                                                g_bDisableSync = bNewDisableSync;
                                                if (!bOldEnableTrelloSync && bNewEnableTrelloSync)
                                                    alert("Your first sync will start now.\nKeep using Trello normally but do not close Trello until sync finishes.");
                                                PlusConfig.close(true);
                                            });
                                        }
                                        else {
                                            PlusConfig.close(true);
                                        }
                                    });
                                }

                                var promiseClearStorage = null;
                                if (!bReset && bSimplePlus && (strOldStorage == null || strOldStorage.trim() == ""))
                                    promiseClearStorage = Promise.resolve(false);
                                else if (!bReset && strOldStorage != null && strOldStorage.trim() != "" && url.length > 0)
                                    promiseClearStorage = DeleteOrMergeNewSyncSource();
                                else
                                    promiseClearStorage = Promise.resolve(true);

                                promiseClearStorage.then(function (bClearStorage) {
                                    if (!bClearStorage) {
                                        chrome.storage.sync.set({ 'serviceUrl': g_strServiceUrl },
                                            function () {
                                                if (chrome.runtime.lastError) {
                                                    alert(chrome.runtime.lastError.message);
                                                    return;
                                                }

                                                reloadConfigData(url, function () {
                                                    setLocalUrlAndRestart();
                                                });
                                            });
                                    } else {
                                        clearAllStorage(function () { //review zig misnamed. clears all storage except a few like the sync url.
                                            setLocalUrlAndRestart();
                                        });
                                    }
                                });
                            });
                    });
		    }
		});
		container.hide();
		body.append(container);
		container.fadeIn('fast', function () {
			input.focus();

		});
	},
	close: function (bReloadPage) {
	    if (this.bClosed)
	        return;
	    this.bClosed = true;

	    if (bReloadPage) {
	        restartPlus("Settings saved. Refreshing...");
	        return;
	    }
	    var container = $('div#spent_serviceUrlConfig_container');
	    container.remove();
	}
};

function restartPlus(message) {
	setBusy(true);
	sendDesktopNotification(message, 7000);
    //note: we dont use location.reload because help toc could have added # to the url thus reload will fail
	if (Help.isVisible())
	    Help.close(true);
	setTimeout(function () { window.location.href = "https://trello.com"; }, 2000); //see ya. use timeout so code (continuations) above have time to finish,
}

function clearAllStorage(callback) {
    var propsSyncSave = {};
    chrome.storage.sync.get([SYNCPROP_NO_SE, SYNCPROP_CARDPOPUPTYPE, SYNCPROP_ACTIVETIMER, SYNCPROP_LIDATA, SYNCPROP_LIDATA_STRIPE, SYNCPROP_USERSEBAR_LAST, SYNCPROP_bShowedFeatureSEButton], function (obj) {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
        } else {
            propsSyncSave = obj;
        }
        var idCardActiveTimer = propsSyncSave[SYNCPROP_ACTIVETIMER];
        if (idCardActiveTimer) {
            var hashAT = getCardTimerSyncHash(idCardActiveTimer);
            chrome.storage.sync.get([hashAT], function (objAT) {
                propsSyncSave[hashAT] = objAT[hashAT];
                clearAllStorageWorker(callback);
            });
        } else {
            clearAllStorageWorker(callback);
        }
    });

    function clearAllStorageWorker(callback) {
        chrome.storage.sync.clear(function () {
            chrome.storage.local.clear(function () {
                var keyUrlLast = "serviceUrlLast";
                var pairsLocal = {};
                if (g_strServiceUrl)
                    pairsLocal["serviceUrlLast"] = g_strServiceUrl; //restore it to  prevent the "spreadsheet permissions" preface dialog from showing after a reset 
                pairsLocal[LOCALPROP_PRO_VERSION] = g_bProVersion;
                chrome.storage.local.set(pairsLocal, function () {
                    if (chrome.runtime.lastError) {
                        console.log(chrome.runtime.lastError.message);
                        alert(chrome.runtime.lastError.message);
                    }
                    //review zig: we never do localStorage.clear(). need to check if any needs saving before adding it
                    //for now just delete the new ones
                    delete localStorage[PROP_LS_ASKEDNOTUSINGSE]; //helps with testing 
                    continueClear();
                });
            });
        });

        function continueClear() {
            sendExtensionMessage({ method: "clearAllStorage" },
                function (response) {
                    setTimeout(function () {
                        //keep the important user preferences
                        var objSet = {
                            'serviceUrl': g_strServiceUrl,
                            'bDisabledSync': g_bDisableSync,
                            'bDontWarnParallelTimers': g_bDontWarnParallelTimers,
                            'bIgnoreZeroECards': g_bAllowNegativeRemaining,
                            'bAcceptSFT': g_bAcceptSFT,
                            'bUserSaysDonated': g_bUserDonated,
                            'bEnableTrelloSync': g_bDisableSync ? false : g_bEnableTrelloSync, //note g_bDisableSync is used to "fully" reset sync
                            'bEnterSEByCardComments': g_bDisableSync ? false : g_optEnterSEByComment.bEnabled, //dont use IsEnabled() as it also uses g_bEnableTrelloSync
                            'rgKWFCC': JSON.stringify(g_optEnterSEByComment.rgKeywords),
                            'bAlwaysShowSpentChromeIcon': g_optAlwaysShowSpentChromeIcon,
                            'bHidePendingCards': g_bHidePendingCards,
                            'bHideLessMore': g_bHideLessMore,
                            'dowStart': DowMapper.getDowStart(),
                            'dowDelta': DowMapper.getDowDelta(),
                            'msStartPlusUsage': g_msStartPlusUsage,
                            'bSyncOutsideTrello': g_bSyncOutsideTrello,
                            'bChangeCardColor': g_bChangeCardColor,
                            'bHideTour' : g_bHideTour,
                            'bSumFilteredCardsOnly': g_bCheckedbSumFiltered,
                            'units': UNITS.current,
                            'bDisplayPointUnits': g_bDisplayPointUnits,
                            'rgExcludedUsers': JSON.stringify(g_rgExcludedUsers),
                            'bAcceptPFTLegacy': g_bAcceptPFTLegacy,
                            'bPreventEstMod': g_bPreventIncreasedE,
                            'bCheckedTrelloSyncEnable': g_bCheckedTrelloSyncEnable,
                            'bAlwaysShowSEBar': g_bAlwaysShowSEBar,
                            'bUseLastSEBarUser': g_bUseLastSEBarUser,
                            'bDontShowTimerPopups': g_bDontShowTimerPopups,
                            'bDontShowSpentPopups': g_bDontShowSpentPopups,
                            'bClosePlusHomeSection': !g_bShowHomePlusSections //Negated
                        };

                        for (var propSaved in propsSyncSave)
                            objSet[propSaved] = propsSyncSave[propSaved];
                        
                        objSet[SYNCPROP_bStealthSEMode] = (g_bStealthSEMode && g_strServiceUrl && !g_bDisableSync) ? true : false;
                        objSet[SYNCPROP_language] = g_language;
                        objSet[SYNCPROP_KEYWORDS_HOME] = JSON.stringify(g_rgKeywordsHome);
                        objSet[SYNCPROP_BOARD_DIMENSION] = g_dimension || VAL_COMBOVIEWKW_ALL;
                        objSet[SYNCPROP_GLOBALUSER] = g_globalUser || DEFAULTGLOBAL_USER;
                        objSet[SYNCPROP_SERVIEWS] = g_serViews;
                        if (g_msStartPlusUsage)
                            objSet[SYNCPROP_MSSTARTPLUSUSAGE] = g_msStartPlusUsage;

                        chrome.storage.sync.set(objSet,
                            function () {
                                if (chrome.runtime.lastError) {
                                    alert(chrome.runtime.lastError.message);
                                    return;
                                }

                                if (callback !== undefined)
                                    callback();
                            });
                    }, 1000); //wait 1000 to avoid quota issues after sync.clear
                });
        }
    }
}

function RequestNotificationPermission(callback) {
	window.webkitNotifications.requestPermission(callback);
}

function reloadConfigData(url, callback) {
    //purpose is to pass bSkipCache: true so the cache gets recalculated
    var userElem = getCurrentTrelloUser();
    if (userElem == null) {
        alert("Unexpected error: cannot detect current Trello user.");
        return;
    }
    sendExtensionMessage({ method: "getConfigData", userTrello: userElem, urlService: url, bSkipCache: true },
        function (respConfig) {
            if (respConfig.config) {
                if (respConfig.config.status != STATUS_OK) {
                    sendExtensionMessage(respConfig.config.status);
                    return;
                }
                g_configData = respConfig.config; //can be null. probably not necesary to refresh this global as we are about to restart, but seems safer to do so
                callback();
            }
        });
}

