var PlusConfig = {
    bClosed:true,
    bReset:false,
	isVisible: function () {
		return ($('div#spent_serviceUrlConfig_container').size() > 0);
	},
	display: function (plusBarElem) {
		PlusConfig.displayWorker(plusBarElem);
	},
	displayWorker: function (plusBarElem) {
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
		container.append(setFont($('<p><b>Google sync is a legacy option. Dont enable it unless you want to keep using the old sync method.</b></p>')));
		container.append(setFont($('<p><b>Google sync renames card titles to include S/E in them as you enter S/E rows.</b></p>')));
	    //review zig: handle not logged in when all users have chrome v33 onSignInChanged https://developer.chrome.com/apps/identity#event-onSignInChanged
		container.append(setFont($('<p>If you havent signed-into Chrome, click the Chrome menu to the right \
<img id="imgChromeMenu" src="' + chrome.extension.getURL("images/chromenu.png") + '" title="Not this one, the one on the top-right of your screen."/> and \
<A target="_blank" href="https://support.google.com/chrome/answer/185277?hl=en">sign in to Chrome</A>.<br><b>Note this is not the same as being signed into your gmail.</b></p>')));

		container.find("#imgChromeMenu").click(function () {
			alert("Not this one, the one on the top-right of your screen.");
		});
		container.append(setFont($('<p>You must be signed in to Chrome with the same email in all your devices to use Google sync.</p>')));
		container.append(setFont($('<p>Configure one device only. Your other devices will automatically pick up the new configuration.</p>')));
		container.append(setFont($('<p><b><A target="_blank" href="http://plusfortrello.blogspot.com/2014/01/plus-configuration-options.html">Read here</A></b> for more details.</p>')));
		container.append($('<p>&nbsp</p>'));

		if (g_strServiceUrl &&  g_strServiceUrl != "") {
		    container.append(setFont($('<p>To revoke permissions to your Google Drive go <a target="_blank" href="https://security.google.com/settings/security/permissions">here</a></p>')));
		}
		var btnCreate = setFont($('<button id="buttonCreateSs"></button>')).css('margin-bottom', '5px');
		var strCreate = "Create a new sync spreadsheet";
		var bAppendTeamSpreadsheetText = false;
		btnCreate.text(strCreate);
		if (!g_optEnterSEByComment.IsEnabled() && (g_strServiceUrl == null || g_strServiceUrl == "")) {
		    var strTeamModeSetup = "For <A target='_blank' href='http://plusfortrello.blogspot.com/2014/01/plus-configuration-options.html'>team mode</A> the team administrator should create the spreadsheet and give it to team users, shared with Write permissions.";
		    container.append(setFont($('<p>' + strTeamModeSetup + '</p>')));
		    btnCreate.show();
		    bAppendTeamSpreadsheetText = true;
		}
		else {
		    btnCreate.hide();
		    if (g_optEnterSEByComment.IsEnabled() && (g_strServiceUrl == null || g_strServiceUrl == ""))
		        container.append(setFont($('<p>You cannot create a new spreadsheet while "Enter and read card S/E using card comments" is enabled.</p>'))); //review zig: unreachable soon
		    else {
		        container.append(setFont($('<p>To create a new spreadsheet, first clear this one and press OK.</p>')));
		        bAppendTeamSpreadsheetText = true;
		    }
		}

		container.append(btnCreate);
		if (bAppendTeamSpreadsheetText)
		    container.append(setFont($('<span > or put the team spreadsheet url from your team administrator.</span>')));
		divInput.append(setFont(input));
		container.append(divInput);
		container.append(setFont($('<p>Example: https://docs.google.com/...?key=blahblah#gid=0</p>')));
		if (g_strServiceUrl != null && g_strServiceUrl != "") {
		    var urlClean = g_strServiceUrl.split("#")[0];
		    var strSharingNote = " <A target='_blank' href='" + urlClean + (urlClean.indexOf("?")<0 ? "?" : "&") + "usp=sharing&userstoinvite=type_users_emails_here'>Configure spreadsheet sharing</A>.";
		    container.append(setFont($('<p>' + strSharingNote + '</p>')));
		}
		
		container.append(setFont($('<p>Do not modify the spreadsheet.</p>')));
		container.append(btnOk).append(btnCancel);
		container.append($('<p>&nbsp</p>'));
		var body = $('body');
		btnCancel.click(function () {
			PlusConfig.close(false);
		});

		btnCreate.click(function () {
			setBusy(true);
			btnCreate.prop('disabled', true);
			btnCreate.text("Creating spreadsheet. Approve Google permissions..");
			sendDesktopNotification("Please wait while Plus creates your sync spreadsheet.", 6000);
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
			});
		});
		btnOk.click(function () {
		    if (thisLocal.bClosed) //not sure if it can happen. for safety in case it gets on a partial failure state.
		        return;

			var url = input.val().trim();
			var bError = false;
			var bReset = thisLocal.bReset;
			thisLocal.bReset = false;
			if (!bReset && (g_strServiceUrl == url || (g_strServiceUrl == null && url == ""))) {
				PlusConfig.close(false);
				return;

			}
			var bSimplePlus = (url.indexOf("https://docs.google.com/") == 0);
			if (url != "" && !bSimplePlus &&
				url.indexOf("https://script.google.com/") != 0) {
				alert("Invalid url format. Enter the correct url, or cancel.");
				return;
			}

			if (url.indexOf("/d/")>=0) {
			    var parts = url.split("#gid=");
			    if (parts.length < 2 || parts[1] != "0") {
			        alert("Only new google sheets with #gid=0 can be accepted.");
			        return;
			    }
			}
			if (bSimplePlus && ((url.indexOf("key=") < 0 && url.indexOf("/d/") < 0) || url.indexOf("#gid=") < 0)) {
				alert("Invalid Google spreadsheet url format. Make sure it has #gid=");
				return;
			}

			var strOldStorage = g_strServiceUrl;

			if (!bReset && strOldStorage != null && strOldStorage.trim() != "" && url.length>0) {
				if (!confirm("By changing the URL, all local data will be cleared and re-read from the new spreadsheet.\nAre you sure you want to modify this setup URL?"))
				    return;
				if (g_optEnterSEByComment.IsEnabled())
				    alert('Because you have enabled "Enter and read card S/E using card comments", the google spreasheet will not be used'); //review zig unreachable soon
			}

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
					            if (!confirm("You have pending S/E rows that havent synced yet to the spreadsheet. Are you sure you want to lose those rows?"))
					                return;
					        }

					        //handle sync URL change
					        g_strServiceUrl = url;

					        function setLocalUrlAndRestart() {
					            //need to store it also in local, otherwise the restart will detect that sync changed but we already handled that.
					            var pairUrlLocal = {};
					            pairUrlLocal['serviceUrlLast'] = g_strServiceUrl;
					            chrome.storage.local.set(pairUrlLocal, function () {
					                if (g_strServiceUrl != "" && !g_bEnableTrelloSync) {
					                    var pairTrelloSync = {};
					                    pairTrelloSync["bEnableTrelloSync"] = true; //enable trello sync automatically
					                    chrome.storage.sync.set(pairTrelloSync, function () {
					                        if (chrome.runtime.lastError != undefined)
					                            return;
					                        g_bEnableTrelloSync = true;
					                        alert("Your first sync will start now.\nKeep using Trello normally but do not close it until sync finishes.");
					                        PlusConfig.close(true);
					                    });
					                }
					                else {
					                    PlusConfig.close(true);
					                }
					            });
					        }

					        if (!bReset && bSimplePlus && (strOldStorage == null || strOldStorage.trim() == "")) {
					            //preserve storage if its going from 'no sync' -> 'sync'
					            chrome.storage.sync.set({ 'serviceUrl': g_strServiceUrl },
                                    function () {
                                        setLocalUrlAndRestart();
                                    });
					            return;
					        }

					        clearAllStorage(function () {
					            setLocalUrlAndRestart();
					        });
					    });
				});
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
	sendDesktopNotification(message, 4000);
    //note: we dont use location.reload because help toc could have added # to the url thus reload will fail
	if (Help.isVisible())
	    Help.close(true);
	setTimeout(function () { window.location.href = "https://trello.com"; }, 2000); //see ya. use timeout so code (continuations) above have time to finish,
}

function clearAllStorage(callback) {
	chrome.storage.sync.clear(function () {
		chrome.storage.local.clear(function () {
			sendExtensionMessage({ method: "clearAllStorage" },
				function (response) {
				    setTimeout(function () {
                        //keep the important user preferences
					    chrome.storage.sync.set({
					        'serviceUrl': g_strServiceUrl,
					        'bDontWarnParallelTimers' : g_bDontWarnParallelTimers,
					        'bIgnoreZeroECards': g_bAllowNegativeRemaining,
					        'bAcceptSFT': g_bAcceptSFT,
					        'bUserSaysDonated': g_bUserDonated,
					        'bEnableTrelloSync': g_bEnableTrelloSync,
					        'bEnterSEByCardComments': g_optEnterSEByComment.bEnabled, //sont use IsEnabled()
					        'rgKWFCC': JSON.stringify(g_optEnterSEByComment.rgKeywords),
					        'bAlwaysShowSpentChromeIcon': g_bAlwaysShowSpentChromeIcon,
					        'bHidePendingCards': g_bHidePendingCards,
					        'dowStart': DowMapper.getDowStart(),
					        'msStartPlusUsage': g_msStartPlusUsage,
					        'bSyncOutsideTrello': g_bSyncOutsideTrello,
					        'bChangeCardColor': g_bChangeCardColor,
					        'bSumFilteredCardsOnly': g_bCheckedbSumFiltered,
					        'units' : UNITS.current
					    },
							function () {
							    if (callback !== undefined)
							        callback();
							});
					}, 1000); //wait 1000 to avoid quota issues after sync.clear
				});
		});
	});
}

function RequestNotificationPermission(callback) {
	window.webkitNotifications.requestPermission(callback);
}
