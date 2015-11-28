/// <reference path="intellisense.js" />

var UPDATE_STEP = 1000;
var ESTIMATION = 'estimation';
var SPENT = 'spent';
var REMAINING = 'remaining';
var spentTotal = null;
var estimationTotal = null;
var remainingTotal=null;
var g_boardName = null;
var g_bUpdatingGlobalSums= null;  //null means uninitialized. tracks if we are waiting for all trello cards to load
var g_manifestVersion = "";
var g_rgExcludedUsers = []; //users exluded from the S/E bar

function getSpentSpecialUser() { //review zig: unused
	//review zig: wrap g_configData futher as it can be null
	if (g_configData)
		return g_configData.spentSpecialUser;
	return "";
}

//insertCardTimer
//
function insertCardTimer(containerBar) {

    tryInsert();

	function tryInsert() {
	    if (!inserted())
	        setTimeout(tryInsert, 200);
	}

	function inserted() {
	    if (!g_bReadGlobalConfig)
	        return false;

	    var url = document.URL;
	    var idCardCur = getIdCardFromUrl(url);

	    if (!idCardCur)
	        return true;

	    var sidebars = $(".window-sidebar");
	    if (sidebars.length == 0)
	        return false;

	    var actions = sidebars.find($(".other-actions h3")).first();
	    if (actions.length == 0)
	        return false;
	    var divInsert = actions.next();
	    if (divInsert.find($("#agile_timer")).size() != 0)
	        return true;

	    divInsert.prepend(loadCardTimer(idCardCur, containerBar));
	    return true;
	}
}

function getXFromUrl(url, prefix) {
    if (url.indexOf(prefix) != 0)
        return null;

    var remainUrl = url.slice(prefix.length);
    var iNextSlash = remainUrl.indexOf("/");
    if (iNextSlash >= 0)
        remainUrl = remainUrl.slice(0, iNextSlash);
    return remainUrl;
}

function getIdCardFromUrl(url) {
    return getXFromUrl(url, "https://trello.com/c/");
}

function getIdBoardFromUrl(url) {
    return getXFromUrl(url, "https://trello.com/b/");
}

var g_bErrorExtension = false;

function showExtensionUpgradedError(e) {
    if (g_bErrorExtension)
        return;
    g_bErrorExtension = true;
    var message = "";
    if (e && e.message && !bIgnoreError(e.message))
        message = e.message;

    var divDialog = $("#agile_dialog_ExtensionUpgraded");

    if (divDialog.length == 0) {
        divDialog = $('\
<dialog id="agile_dialog_ExtensionUpgraded" class="agile_dialog_DefaultStyle agile_dialog_Postit agile_dialog_Postit_ExtensionUpgraded"> \
<h2>Chrome updated Plus for Trello</h2><br> \
<p>Reload this page to use Plus. <A href="http://www.plusfortrello.com/p/change-log.html" target="_blank">Whats new?</A></p> \
<p id="agile_dialog_ExtensionUpgraded_message"></p> \
<a href="" class="button-link agile_dialog_Postit_button" id="agile_dialog_ExtensionUpgraded_Refresh">Reload</a> \
<a title="Ignore to keep working on this page.\nSome Plus features may not work until you Reload." href="" class="button-link agile_dialog_Postit_button" id="agile_dialog_ExtensionUpgraded_Ignore">Ignore</a> \
</dialog>');
        $("body").append(divDialog);
        divDialog = $("#agile_dialog_ExtensionUpgraded");

        var imgReload = $("<img>").attr("src", chrome.extension.getURL("images/reloadchrome.png")).addClass('agile_reload_ext_button_img');
        var reload = divDialog.find("#agile_dialog_ExtensionUpgraded_Refresh");
        reload.append($("<span>").append(imgReload));
        reload.off("click.plusForTrello").on("click.plusForTrello", function (e) {
            e.preventDefault();
            setTimeout(function () { //timeout so the button reacts to the click uxwise
                location.reload(); //note not passing false per http://stackoverflow.com/questions/16873263/load-from-cache-with-window-location-reload-and-hash-fragment-in-chrome-doesnt
            }, 10);
        });

        divDialog.find("#agile_dialog_ExtensionUpgraded_Ignore").off("click.plusForTrello").on("click.plusForTrello", function (e) {
            e.preventDefault(); //link click would navigate otherwise
            divDialog.removeClass("agile_dialog_ExtensionUpgraded_animate");
            setTimeout(function () { divDialog[0].close();}, 400); //wait for animation to complete
        });
    }
    $("#agile_dialog_ExtensionUpgraded_message").text(message);
    divDialog[0].show();
    setTimeout(function () {divDialog.addClass("agile_dialog_ExtensionUpgraded_animate");},200); //some dialog conflict prevents animation from working without timeout
}


function showFatalError(message) {
    if (g_bErrorExtension)
        return;
    g_bErrorExtension = true;

    var divDialog = $("#agile_dialog_FatalError");

    if (divDialog.length == 0) {
        divDialog = $('\
<dialog id="agile_dialog_FatalError" class="agile_dialog_DefaultStyle agile_dialog_Postit"> \
<h3>Plus for Trello error</h3>\
<p id="agile_dialog_FatalError_message"></p> \
<A id="agile_dialog_FatalError_ViewLog" href="" target="_blank">View error log</A> \
<a style="float:right;" href="" class="button-link agile_dialog_Postit_button" id="agile_dialog_FatalError_Ignore">Ignore</a> \
</dialog>');
        $("body").append(divDialog);
        divDialog = $("#agile_dialog_FatalError");
        divDialog.find("#agile_dialog_FatalError_ViewLog").prop("href", chrome.extension.getURL("plusmessages.html"));
        divDialog.find("#agile_dialog_FatalError_Ignore").off("click.plusForTrello").on("click.plusForTrello", function (e) {
            e.preventDefault(); //link click would navigate otherwise
            divDialog[0].close();
        });
    }
    $("#agile_dialog_FatalError_message").text(message);
    divDialog[0].show();
}

function testExtension(callback) {
    if (g_bErrorExtension)
        return;
    
    try {
		var rgLog=g_plusLogMessages;

		sendExtensionMessage({ method: "testBackgroundPage", logMessages: rgLog},
		function (response) {
			if (response.status == STATUS_OK) { //status of log write
                g_plusLogMessages = [];
			}
			if (callback)
				callback();
		}, true); //true to rethrow exceptions
	} catch (e) {
	    showExtensionUpgradedError(e);
	}
}

function loadExtensionVersion(callback) {
    if (g_manifestVersion != "")
        return;
    g_manifestVersion = "unknown"; //prevent loading again and handle error case
    var url = chrome.extension.getURL("manifest.json");

    var xhr = new XMLHttpRequest();
    xhr.onreadystatechange = function (e) {
        if (xhr.readyState == 4 && xhr.status == 200) {
            try {
                g_manifestVersion = JSON.parse(xhr.responseText).version;
            }
            catch (e) {
                console.log("error: cant parse manifest.");
                if (url.indexOf("/gddgnpbmkhkpnnhkfheojeiceofcnoem/") >= 0) //developer url
                    alert("error");
            }
            callback();
        }
    };

    xhr.open("GET", url);
    xhr.send();
}

$(function () {
    loadExtensionVersion(function () {
        setTimeout(function () { //in timeout so we can safely reference globals and give a little time for trello load itself since we  "run_at": "document_start"

            //for <dialog>
            var preDialog = '<pre style="display:none;">dialog::backdrop\
        { \
        position: fixed; \
        top: 0; \
        left: 0; \
        right: 0; \
        bottom: 0; \
        background-color: rgba(0, 0, 0, 0.8); \
        }</pre>';
            $("body").append($(preDialog));

            //http://tablesorter.com/docs/example-parsers.html
            //http://stackoverflow.com/a/2129479/2213940
            addTableSorterParsers();
            loadOptions(function () {
                entryPoint();
            });
        }, 600); //"run_at": "document_start" is before trello does ajax so breathe and dont compete with trello load
    });
});

function entryPoint() {
	//note: this also does setInterval on the callback which we use to do sanity checks and housekeeping
	setCallbackPostLogMessage(testExtensionAndcommitPendingPlusMessages); //this allows all logs (logPlusError, logException) to be written to the database
	HelpButton.display(); //inside is where the fun begins
	checkEnableMoses();
}

//review zig: merge with loadSharedOptions
function loadOptions(callback) {
    var keyAllowNegativeRemaining = "bIgnoreZeroECards";
    var keyDontWarnParallelTimers = "bDontWarnParallelTimers";
    var keyAcceptSFT = "bAcceptSFT";
    var keyAcceptPFTLegacy = "bAcceptPFTLegacy";
    var keyAlreadyDonated = "bUserSaysDonated";
    var keyHidePendingCards = "bHidePendingCards";
    var keyDowStart = "dowStart";
    var keyMsStartPlusUsage = "msStartPlusUsage";
    var keySyncOutsideTrello = "bSyncOutsideTrello";
    var keybChangeCardColor = "bChangeCardColor";
    var keyPropbSumFilteredCardsOnly = "bSumFilteredCardsOnly";
    var keybEnableTrelloSync = "bEnableTrelloSync";
    var keybEnterSEByCardComments = "bEnterSEByCardComments";
    var keyrgKeywordsforSECardComment = "rgKWFCC";
    var keyrgExcludedUsers = "rgExcludedUsers";
    var keyUnits = "units";
    var keyCheckedTrelloSyncEnable = "bCheckedTrelloSyncEnable";
    var keybDisabledSync = "bDisabledSync"; //note this takes precedence over bEnableTrelloSync or g_strServiceUrl 'serviceUrl'
    var keyClosePlusHomeSection = "bClosePlusHomeSection";
    var keybDontShowTimerPopups = "bDontShowTimerPopups";
    var keyServiceUrl = 'serviceUrl'; //note we only get but not set. Code later will set it
    function BLastErrorDetected() {
        if (chrome.runtime.lastError) {
            sendDesktopNotification("Plus for Trello cannot load\n" + chrome.runtime.lastError.message,20000);
            return true;
        }
        return false;
    }

    //get options from sync
    chrome.storage.sync.get([SYNCPROP_bStealthSEMode, SYNCPROP_language, keyServiceUrl, keybDontShowTimerPopups, keyClosePlusHomeSection, keyDontWarnParallelTimers, keyUnits,
                             keyrgExcludedUsers, keyrgKeywordsforSECardComment, keyAcceptSFT,
                             keyAcceptPFTLegacy, keybEnterSEByCardComments, SYNCPROP_optAlwaysShowSpentChromeIcon, keyAllowNegativeRemaining, keyAlreadyDonated, keybEnableTrelloSync,
                             keyCheckedTrelloSyncEnable, keyHidePendingCards, keyDowStart, keyMsStartPlusUsage, keySyncOutsideTrello, keybChangeCardColor,
                             keyPropbSumFilteredCardsOnly, keybDisabledSync],
                             function (objSync) {
                                 if (BLastErrorDetected())
                                     return;
                                 g_language = objSync[SYNCPROP_language] || "en";
                                 g_bDontShowTimerPopups = objSync[keybDontShowTimerPopups] || false;
                                 g_bShowHomePlusSections = !(objSync[keyClosePlusHomeSection] || false);
                                 UNITS.current = objSync[keyUnits] || UNITS.current;
                                 g_bDontWarnParallelTimers = objSync[keyDontWarnParallelTimers] || false;
                                 g_bEnableTrelloSync = objSync[keybEnableTrelloSync] || false;
                                 g_bCheckedTrelloSyncEnable = objSync[keyCheckedTrelloSyncEnable] || false;
                                 g_optEnterSEByComment.loadFromStrings(objSync[keybEnterSEByCardComments], objSync[keyrgKeywordsforSECardComment]);

                                 g_rgExcludedUsers = JSON.parse(objSync[keyrgExcludedUsers] || "[]");
                                 g_bDisableSync = objSync[keybDisabledSync] || false;
                                 g_bUserDonated = objSync[keyAlreadyDonated] || false;
                                 g_msStartPlusUsage = objSync[keyMsStartPlusUsage] || null; //later we will try to initialize it when null, but may remain null
                                 g_bHidePendingCards = objSync[keyHidePendingCards] || false;
                                 setOptAlwaysShowSpentChromeIcon(objSync[SYNCPROP_optAlwaysShowSpentChromeIcon]);
                                 DowMapper.setDowStart(objSync[keyDowStart] || DowMapper.DOWSTART_DEFAULT);
                                 g_bAcceptSFT = objSync[keyAcceptSFT] || false;

                                 g_bAcceptPFTLegacy = objSync[keyAcceptPFTLegacy];
                                 if (g_bAcceptPFTLegacy === undefined)
                                     g_bAcceptPFTLegacy = true; //defaults to true to not break legacy users
                                 
                                 g_bAllowNegativeRemaining = objSync[keyAllowNegativeRemaining] || false;
                                 g_bStealthSEMode = (objSync[SYNCPROP_bStealthSEMode] && objSync[keyServiceUrl] && !g_bDisableSync) ? true : false;
                                 g_bSyncOutsideTrello = objSync[keySyncOutsideTrello] || false;
                                 g_bChangeCardColor = objSync[keybChangeCardColor] || false;
                                 g_bCheckedbSumFiltered = objSync[keyPropbSumFilteredCardsOnly] || false;
                                 //alert("g_bEnableTrelloSync : " + g_bEnableTrelloSync + "\ncomments sync : " + g_optEnterSEByComment.bEnabled + "\ndisabled sync : " + g_bDisableSync);
								callback();
                             });
}

function doAllUpdates() {
    markForUpdate();
    if (isPlusDisplayDisabled())
        return;
	addCardCommentHelp();
}


var g_globalTotalSpent = null; //used to detect changes on global spent
var g_globalTotalEstimation = null; //used to detect changes on global est
var g_strPageHtmlLast = "";
var g_bNeedsUpdate = false;


/* markForUpdate
 *
 * Waits until changes stabilize to make an update
 **/
function markForUpdate() {
	var strPageHtml = document.body.innerHTML;
	if (!g_bForceUpdate  && strPageHtml != g_strPageHtmlLast) {
		g_bNeedsUpdate = true;
		g_strPageHtmlLast = strPageHtml;
	} else if (g_bNeedsUpdate || g_bForceUpdate) {
		g_strPageHtmlLast = strPageHtml;
		update(true);
	}
}


var g_bForceUpdate = false;


function updateNewTrelloFlag() {
	//review zig: getCurrentBoard also updates. unify. not sure if this always gets called before getCurrentBoard. since old will go away is not worth it.
	g_bNewTrello = true;
}

function update(bShowBoardTotals) {
    updateWorker(bShowBoardTotals);
}


function updateSsLinksDetector(globalTotalSpent, globalTotalEstimation) {
	var user = getCurrentTrelloUser();

	if (user != null && globalTotalSpent == g_globalTotalSpent && globalTotalEstimation == g_globalTotalEstimation)
		updateSsLinks();
	else {
		var gTSLocal = g_globalTotalSpent;
		var gTELocal = g_globalTotalEstimation;
		setTimeout(function () { updateSsLinksDetector(gTSLocal, gTELocal); }, 500); //try later until it stabilizes
	}
}


function ResetPlus() {
    chrome.storage.sync.get([SYNCPROP_ACTIVETIMER], function (obj) {
        var strConfirm = 'Are you sure you want to Reset?';
        if (obj[SYNCPROP_ACTIVETIMER] !== undefined)
            strConfirm = strConfirm + ' All timers still running will be lost.';

        if (!confirm(strConfirm))
            return;

        sendExtensionMessage({ method: "detectLegacyHistoryRows" },
            function (response) {
                if (response.hasLegacyRows) {
                    if (g_optEnterSEByComment.IsEnabled() && !g_optEnterSEByComment.hasLegacyKeyword()) {
                        if (!confirm("The legacy keyword 'Plus S/E' is missing from your keywords, thus Plus will not be able to read your legacy rows.\nAre you sure you want to Reset?"))
                            return;
                    }
                }

                sendExtensionMessage({ method: "isSyncing" },
                    function (response) {
                        if (response.status != STATUS_OK) {
                            alert(response.status);
                            return;
                        }

                        if (response.bSyncing) {
                            //note: this isnt perfect but will cover many concurrency cases
                            if (!confirm("Plus is currently syncing.\nYou should press Cancel unless Plus is stuck in this state.\nAre you sure you want to reset?"))
                                return;
                        }


                        sendExtensionMessage({ method: "getTotalDBRowsNotSync" },
                            function (response) {
                                if (response.status != STATUS_OK) {
                                    alert(response.status);
                                    return;
                                }

                                if (response.cRowsTotal > 0 && (g_bDisableSync || !g_optEnterSEByComment.IsEnabled())) { //review newsync
                                    if (!g_optEnterSEByComment.IsEnabled() && g_strServiceUrl && g_strServiceUrl.length > 0) {
                                        if (!confirm("You have pending S/E rows that havent synced yet to the spreadsheet. Are you sure you want to lose those rows?"))
                                            return;
                                    }
                                    else if (!confirm("Sync is not enabled. S/E rows wont come back until you do so.'\nAre you sure you want to reset now?"))
                                        return;
                                }

                                clearAllStorage(function () {
                                    restartPlus("All local data cleared. Refreshing to start sync...");
                                });
                            });
                    });
            });
    });
}