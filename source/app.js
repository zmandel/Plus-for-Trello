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

function processCardFullWindows() {
 
	if (!g_bReadGlobalConfig)
		return;

	var sidebars = $(".window-sidebar");
	if (sidebars.length == 0)
		return;

	if (false) { //was: isBackendMode()
	    //review zig: will be handled in v3 with native trello sync. its too slow when the card has a lot of comments
		var siblings = sidebars.prev();
		var elems = $(".atMention:contains(" + "@" + getSpentSpecialUser() + ")");
		var cElems = Math.min(10, elems.length);
		var j = 0;
		for (j = 0; j < cElems; j++) {
		    var mentioned = elems.eq(j);
		    var elem = mentioned.parent().parent().parent().parent();
		    if (elem.length == 0)
		        continue;
			if (true) {
			    var sibling = $(elem).next();
				sibling.find($(".js-edit-action")).hide();
				sibling.find($(".js-confirm-delete-action")).hide();
			}
		}
	}
	var actions = sidebars.find($("h3:contains(Actions)"));
	var divInsert = actions.next();
	if (divInsert.find($("#agile_timer")).size() == 0) {
		var url = document.URL;
		var idCardCur = getIdCardFromUrl(url);
		if (idCardCur)
			divInsert.prepend(loadCardTimer(idCardCur));
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
    }, 1);
});

function entryPoint() {
	//note: this also does setInterval on the callback which we use to do sanity checks and housekeeping
	setCallbackPostLogMessage(testExtensionAndcommitPendingPlusMessages); //this allows all logs (logPlusError, logException) to be written to the database
	Help.init();
	HelpButton.display(); //inside is where the fun begins
	checkEnableMoses();
}

function loadOptions(callback) {
    var keyAllowNegativeRemaining = "bIgnoreZeroECards";
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

    function BLastErrorDetected() {
        if (chrome.runtime.lastError) {
            sendDesktopNotification("Plus for Trello cannot load\n" + chrome.runtime.lastError.message);
            return true;
        }
        return false;
    }

    //get options from sync. If not there, might be in local (older version), so upgrade it.
    //review zig: remove local check by aug.c2014
    chrome.storage.sync.get([keyrgKeywordsforSECardComment, keyrgKeywordsforSECardComment, keyAcceptSFT, keybEnterSEByCardComments, SYNCPROP_bAlwaysShowSpentChromeIcon, keyAllowNegativeRemaining, keyAlreadyDonated, keybEnableTrelloSync, keyHidePendingCards, keyDowStart,
                             keyMsStartPlusUsage, keySyncOutsideTrello, keybChangeCardColor, keyPropbSumFilteredCardsOnly],
                             function (objSync) {
                                 if (BLastErrorDetected())
                                     return;
                                 g_bEnableTrelloSync = objSync[keybEnableTrelloSync] || false;      
                                 g_optEnterSEByComment.loadFromStrings(objSync[keybEnterSEByCardComments], objSync[keyrgKeywordsforSECardComment]);
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
								callback();
                             });
}

function doAllUpdates() {
	markForUpdate();
	processCardFullWindows();
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
                            alert("Plus is currently syncing. Try again later.");
                            return;
                        }


                        sendExtensionMessage({ method: "getTotalDBRowsNotSync" },
                            function (response) {
                                if (response.status != STATUS_OK) {
                                    alert(response.status);
                                    return;
                                }

                                if (response.cRowsTotal > 0 && !g_optEnterSEByComment.IsEnabled()) {
                                    if (g_strServiceUrl && g_strServiceUrl.length > 0) {
                                        if (!confirm("You have pending S/E rows that havent synced yet to the spreadsheet. Are you sure you want to lose those rows?"))
                                            return;
                                    }
                                    else if (!confirm("You have not enabled 'Enter and read card S/E using card comments.' Rows wont come back until you do so.'\nAre you sure you want to lose those rows?"))
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