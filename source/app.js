var UPDATE_STEP = 1000;
var ESTIMATION = 'estimation';
var SPENT = 'spent';
var REMAINING = 'remaining';
var spentTotal = null;
var estimationTotal = null;
var remainingTotal=null;
var g_boardName = null;
var g_bUpdatingGlobalSums= null;  //null means uninitialized. tracks if we are waiting for all trello cards to load


function getSpentSpecialUser() {
	//review zig: wrap g_configData futher as it can be null
	if (g_configData)
		return g_configData.spentSpecialUser;
	return "";
}

//insertCardTimer
//
function insertCardTimer() {

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

	    var actions = sidebars.find($("h3:contains(Actions)"));
	    if (actions.length == 0)
	        return false;
	    var divInsert = actions.next();
	    if (divInsert.find($("#agile_timer")).size() != 0)
	        return true;

	    divInsert.prepend(loadCardTimer(idCardCur));
	    return true;
	}
}


function getIdCardFromUrl(url) {
	var strSearch = "https://trello.com/c/";
	if (url.indexOf(strSearch) != 0)
		return null;

	var remainUrl = url.slice(strSearch.length);
	var iNextSlash = remainUrl.indexOf("/");
	if (iNextSlash>=0)
	    remainUrl = remainUrl.slice(0, iNextSlash);
	return remainUrl;
}

function getIdBoardFromUrl(url) {
	var strSearch = "https://trello.com/b/";
	if (url.indexOf(strSearch) != 0)
		return null;

	var remainUrl = url.slice(strSearch.length);
	remainUrl = remainUrl.slice(0, remainUrl.indexOf("/"));
	return remainUrl;
}

var g_bErrorExtension = false;

function showExtensionError(e) {
	var strError = "Plus for Trello has been updated to a new version!\nplease refresh this page after pressing OK.";
	if (e && e.message && !bIgnoreError(e.message))
		strError += ("\n\nDetailed error:\n" + e.message);
	alert(strError);
}

function testExtension(callback) {
	try {
		if (g_bErrorExtension) {
			showExtensionError();
			return;
		}
		//REVIEW zig: enable for all not just spent backend. null marker indicates to remove all logs
		var bDoWriteToBackendLog = isBackendMode(); //only internal plus dev is enabled.
		var rgLog=g_plusLogMessages;

		sendExtensionMessage({ method: "testBackgroundPage", logMessages: rgLog, bDoWriteToBackendLog: bDoWriteToBackendLog, tuser: getCurrentTrelloUser() },
		function (response) {
			if (response.status == STATUS_OK) { //status of log write
                g_plusLogMessages = [];
			}
			if (callback)
				callback();
		}, true); //true to rethrow exceptions
	} catch (e) {
		g_bErrorExtension = true;
		showExtensionError(e);
	}
}

$(function () {
    setTimeout(function () { //in timeout so we can safely reference globals
        loadOptions(function () {
            entryPoint();
        });
    },1);
});

function entryPoint() {
	//note: this also does setInterval on the callback which we use to do sanity checks and housekeeping
	setCallbackPostLogMessage(testExtensionAndcommitPendingPlusMessages); //this allows all logs (logPlusError, logException) to be written to the database
	Help.init();
	HelpButton.display(); //inside is where the fun begins
	checkEnableMoses();
}

//review zig: merge with loadSharedOptions
function loadOptions(callback) {
    var keyAllowNegativeRemaining = "bIgnoreZeroECards";
    var keyDontWarnParallelTimers = "bDontWarnParallelTimers";
    var keyAcceptSFT = "bAcceptSFT";
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
    var keyUnits = "units";
    var keyCheckedTrelloSyncEnable = "bCheckedTrelloSyncEnable";
    var keybDisabledSync = "bDisabledSync"; //note this takes precedence over bEnableTrelloSync or g_strServiceUrl 'serviceUrl'

    function BLastErrorDetected() {
        if (chrome.runtime.lastError) {
            sendDesktopNotification("Plus for Trello cannot load\n" + chrome.runtime.lastError.message);
            return true;
        }
        return false;
    }

    //get options from sync
    chrome.storage.sync.get([keyDontWarnParallelTimers, keyUnits, keyrgKeywordsforSECardComment, keyrgKeywordsforSECardComment, keyAcceptSFT,
                             keybEnterSEByCardComments, SYNCPROP_bAlwaysShowSpentChromeIcon, keyAllowNegativeRemaining, keyAlreadyDonated, keybEnableTrelloSync,
                             keyCheckedTrelloSyncEnable, keyHidePendingCards, keyDowStart, keyMsStartPlusUsage, keySyncOutsideTrello, keybChangeCardColor,
                             keyPropbSumFilteredCardsOnly, keybDisabledSync],
                             function (objSync) {
                                 if (BLastErrorDetected())
                                     return;
                                 UNITS.current = objSync[keyUnits] || UNITS.current;
                                 g_bDontWarnParallelTimers = objSync[keyDontWarnParallelTimers] || false;
                                 g_bEnableTrelloSync = objSync[keybEnableTrelloSync] || false;
                                 g_bCheckedTrelloSyncEnable = objSync[keyCheckedTrelloSyncEnable] || false;
                                 g_optEnterSEByComment.loadFromStrings(objSync[keybEnterSEByCardComments], objSync[keyrgKeywordsforSECardComment]);
                                 g_bDisableSync = objSync[keybDisabledSync] || false;
                                 g_bUserDonated = objSync[keyAlreadyDonated] || false;
                                 g_msStartPlusUsage = objSync[keyMsStartPlusUsage] || null; //later we will try to initialize it when null, but may remain null
                                 g_bHidePendingCards = objSync[keyHidePendingCards] || false;
                                 g_bAlwaysShowSpentChromeIcon = objSync[SYNCPROP_bAlwaysShowSpentChromeIcon] || false;
                                 DowMapper.setDowStart(objSync[keyDowStart] || DowMapper.DOWSTART_DEFAULT);
                                 g_bAcceptSFT = objSync[keyAcceptSFT] || false;
                                 g_bAllowNegativeRemaining = objSync[keyAllowNegativeRemaining] || false;
                                 g_bSyncOutsideTrello = objSync[keySyncOutsideTrello] || false;
                                 g_bChangeCardColor = objSync[keybChangeCardColor] || false;
                                 g_bCheckedbSumFiltered = objSync[keyPropbSumFilteredCardsOnly] || false;
                                 //alert("g_bEnableTrelloSync : " + g_bEnableTrelloSync + "\ncomments sync : " + g_optEnterSEByComment.bEnabled + "\ndisabled sync : " + g_bDisableSync);
								callback();
                             });
}

function doAllUpdates() {
	markForUpdate();
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

function stringStartsWith(string, input) {
	return string.substring(0, input.length) === input;
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
                                        if (!confirm("You have pending s/e rows that havent synced yet to the spreadsheet. Are you sure you want to lose those rows?"))
                                            return;
                                    }
                                    else if (!confirm("Sync is not enabled. s/e rows wont come back until you do so.'\nAre you sure you want to reset now?"))
                                        return;
                                }

                                clearAllStorage(function () {
                                    restartPlus("All local data removed. Refreshing to start sync...");
                                });
                            });
                    });
            });
    });
}