/// <reference path="intellisense.js" />

var g_dataTotalSpentThisWeek = { str: null, weeknum: null };
var g_msSyncRateLimit = 1000 * 1; //1 second (used to be larger and more relevant back when syncing on spreadsheets with my developer key
var MSDELAY_FIRSTSYNC = 500;
var g_bOffline = false;
var g_cErrorSync = 0; //errors during sync period. hack alert: it is set to specific values, does not really reflect a real count but a state
var g_strTimerLast = "";
var g_idTimeoutTimer = null;
var PLUS_BACKGROUND_CALLER = true; //allows us to tell shared.js we are calling
var g_bInstalledNetworkDetection = false;
var g_bDetectTrelloNetworkActivity = false;
var g_cTrelloActivitiesDetected = 0;
var g_bLastPlusMenuIconError = false;  //remembers if the icon last drew the red error X
var g_mapTimerWindows = {}; // {idWindow, can be undefined or invalid }
const PROP_LS_cViewedBuyDialog = "cViewedBuyDialog"; //count stored as string
var g_msUpdateNotificationReceived = 0; //0 means not received

chrome.runtime.onInstalled.addListener(function (details) {
    if (details && details.reason && details.reason == "install") {
        handleShowDesktopNotification({
            notification: "Welcome!\nRefresh or open a trello.com page to start.",
            timeout: 8000
        });
    }
});

function handleUpdateExtension(details) {
    var versionNew = (details || { version: "" }).version || "";
    if (!versionNew)
        return;
    var pair = {};
    pair[LOCALPROP_EXTENSION_VERSIONSTORE] = versionNew;
    chrome.storage.local.set(pair, function () {
        if (chrome.runtime.lastError)
            console.log(chrome.runtime.lastError.message);
        else
            g_msUpdateNotificationReceived = Date.now();
    });
}

chrome.runtime.onUpdateAvailable.addListener(function (details) {
    handleUpdateExtension(details);
});




window.onerror = function (msg, url, lineNo, columnNo, error) {
    var string = msg.toLowerCase();
    var substring = "script error";
    var message;
    if (string.indexOf(substring) > -1) {
        message = 'Script Error: See background browser console for details. ' + msg;
    } else {
        message = [
            'Message: ' + msg,
            'URL: ' + url,
            'Line: ' + lineNo,
            'Column: ' + columnNo,
            'Error object: ' + JSON.stringify(error)
        ].join(' - ');
    }
    logPlusError(message, false);
    return false;
};

function getConfigData(urlService, userTrello, callback, bSkipCache) {
    var data = null;
    //review zig: assumes g_optEnterSEByComment is loaded. should be. assert in IsEnabled ensures it wont continue if not.
    if (g_optEnterSEByComment.IsEnabled())
        urlService = ""; //to be more consistent with trello sync when no google user was configured
	if (bSkipCache === undefined || bSkipCache === false)
		data = localStorage["configData"];
	if (data !== undefined && data != null)
		data = JSON.parse(data);
	if (data === undefined)
		data = null;

	if (data != null)
		callback(data);
	else {
		doCallUrlConfig(urlService, userTrello, callback);
	}
}


function doCallUrlConfig(urlConfig, userTrello, callback) {
    if (!urlConfig) {
        callback(null);
        return;
    }
	if (urlConfig.indexOf("https://docs.google.com/") == 0) {
		//this is hacky, but it was the easiest way to enable the simple Plus case (without spent backend)
		//pretend urlConfig is the gas script url until the last minute (here) where we build the config object
		var config = doGetJsonConfigSimplePlus(urlConfig, userTrello);
		localStorage["configData"] = JSON.stringify(config);
		callback(config);
		return;
	}

	handleShowDesktopNotification({
	    notification: "Incorrect google sync url",
	    timeout: 10000
	});

	callback(null);
	return;
}

var DATAVERSION_SIMPLEPLUS = 1;

function doGetJsonConfigSimplePlus(url, user) {
	var objRet = { version: DATAVERSION_SIMPLEPLUS, bSimplePlus: true };
	var strFindKey = "key=";
	var iKey = url.indexOf(strFindKey);
	var bNewSheet = false;
	if (iKey <= 0) {
	    strFindKey = "/d/";
	    iKey = url.indexOf(strFindKey);
	    if (iKey <= 0) {
	        objRet.status = "No spreadsheet key.";
	        return objRet;
	    }
	    bNewSheet = true;
	}
	var strRight = url.substr(iKey + strFindKey.length);
	var parts = strRight.split("#gid=");
	objRet.userTrello = user;
	objRet.urlSsUser = url;
	var partLeft = parts[0];
	if (partLeft.indexOf("&") >=0)
	    partLeft = (partLeft.split("&"))[0];

	if (bNewSheet && partLeft.indexOf("/") >= 0) //new sheets have "/edit"
	    partLeft = (partLeft.split("/"))[0];

	objRet.idSsUser = partLeft;
	objRet.idUserSheetTrello = gid_to_wid(parts[1]);
	objRet.status = STATUS_OK;
	return objRet;
}


// number to string
function gid_to_wid(gid) {
    //thanks for new sheets support to http://stackoverflow.com/a/26893526/2213940
    var idIsNewStyle = gid > 31578;
    var xorValue = idIsNewStyle ? 474 : 31578;
    var postValue = parseInt((gid ^ xorValue), 10).toString(36);
    if (idIsNewStyle) {
        return 'o' + postValue;
    } else {
        return postValue;
    }
}

function standarizeSpreadsheetValue(value) {
	if (value == "#VALUE!" || value == "--")
		value = "";
	if (typeof (value) == 'string' && value.indexOf("'") == 0)
		value = value.substr(1);
	return value;
}

function handleRawSync(bFromAuto, sendResponseParam) {
    var PROP_SERVICEURL = 'serviceUrl';

    function sendResponse(response) {
        if (sendResponseParam)
            sendResponseParam(response);
    }

    chrome.storage.local.get([PROP_TRELLOUSER], function (obj) {
        var userTrello = (obj[PROP_TRELLOUSER] || null);
        if (userTrello == null) {
            sendResponse({ status: "error: no user yet. Enter a trello.com page first." });
            return;
        }
            
        chrome.storage.sync.get([PROP_SERVICEURL], function (obj) {
            var urlSync = obj[PROP_SERVICEURL] || null;

            getConfigData(urlSync, userTrello, function (responseConfig) {
                //responseConfig can be null (when no urlSync). review zig: remnant from v1. once we stop using internal backend, a lot of this code can be simplified
                if (responseConfig && responseConfig.status != STATUS_OK) {
                    sendResponse(responseConfig);
                    return;
                }
                handleOpenDB(null, function (responseOpen) {
                    if (responseOpen.status != STATUS_OK) {
                        sendResponse(responseOpen);
                        return;
                    }
                    //g_optEnterSEByComment initialized while inside handleOpenDb
                    if (g_bDisableSync || (!g_optEnterSEByComment.IsEnabled() && (urlSync == null || urlSync.length == 0))) {
                        sendResponse({ status: "sync not configured or off" });
                        return;
                    }

                    handleSyncDB({ config: responseConfig, bUserInitiated: !bFromAuto }, function (responseSync) {
                        sendResponse(responseSync);
                    }, true);
                });
            });
        });
    });
}

var g_strBadgeText = "";
var PLUS_COLOR_SPENTBADGE = "#B10013";

function getFormattedSpentBadgeText() {
    var l = g_strBadgeText.length;
    if (l>0 && l<4)
        return g_strBadgeText + UNITS.current;
    return g_strBadgeText;
}

function setIconBadgeText(text, bAsTimer) {
    text = "" + text; //in case its not string yet
    if (!bAsTimer) {
        g_strBadgeText = text;
    }

    if (g_strTimerLast.length > 0) {
        chrome.browserAction.setBadgeBackgroundColor({ color: "#2A88BE" });
        chrome.browserAction.setBadgeText({ text: g_strTimerLast });
 
    }
    else {
        assert(!bAsTimer);
        chrome.browserAction.setBadgeBackgroundColor({ color: PLUS_COLOR_SPENTBADGE });
        var textSet = "";
        if (g_optAlwaysShowSpentChromeIcon != OPT_SHOWSPENTINICON_NEVER)
            textSet = getFormattedSpentBadgeText(text);
        chrome.browserAction.setBadgeText({ text: textSet });
    }
}


function calculateSyncDelay(callback) {
    var keyPlusDateSyncLast = "plus_datesync_last";
    chrome.storage.local.get(keyPlusDateSyncLast, function (obj) {
        var msDateSyncLast = obj[keyPlusDateSyncLast];

        var delay = 0;
        if (msDateSyncLast !== undefined) {
            var dateNow = new Date();
            var deltaCur = (dateNow.getTime() - msDateSyncLast);
            if (deltaCur < g_msSyncRateLimit)
                delay = g_msSyncRateLimit - deltaCur;
        }
        setTimeout(function () {
            callback();
        }, delay);
    });
}

//review: cache this list globally, patch it as cards get renamed (hard to tell when an entry goes away)
function handleGetAllHashtags(sendResponse) {
    var request = { sql: "SELECT name FROM cards WHERE name LIKE '%#%' AND bDeleted=0 AND bArchived=0 AND idBoard <> ? AND idBoard in (SELECT idBoard from Boards where bArchived=0)", values: [IDBOARD_UNKNOWN] };
    handleGetReport(request,
        function (responseReport) {
            if (responseReport.status != STATUS_OK) {
                sendResponse(responseReport);
                return;
            }
            var mapHashtags = {};
            responseReport.rows.forEach(function (row) {
                var h = getHashtagsFromTitle(row.name);
                h.forEach(function (hItem) {
                    mapHashtags[hItem] = true;
                });
            });

            var result = [];
            for (var hItem in mapHashtags) {
                result.push(hItem);
            }
            result.sort(function doSort(a, b) {
                return (a.toLowerCase().localeCompare(b.toLowerCase()));
            });

            var hLast = null;
            var resultUnique = [];
            for (var iResult = 0; iResult < result.length; iResult++) {
                var hCur = result[iResult];
                if (hLast && hCur.toLowerCase() == hLast.toLowerCase())
                    continue;
                resultUnique.push(hCur);
                hLast = hCur;
            }
            responseReport.list = resultUnique;
            sendResponse(responseReport);
        });
}

function handlePlusMenuSync(sendResponse) {
    loadBackgroundOptions(function () {
        handleRawSync(false, sendResponse);
    });
}

function handleRequestProPermission(sendResponse) {
    //review: handleCheckChromeStoreToken not used anymore here. we used to check for webstore permissions here
    g_bProVersion = true; //this global is only for background. caller will update storage
    sendResponse({ status: STATUS_OK });
  
}

function handleGoogleSyncPermission(sendResponse) {
    chrome.permissions.request({
        permissions: [],
        origins: ['https://spreadsheets.google.com/', 'https://www.googleapis.com/']
    }, function (granted) {
        if (chrome.runtime.lastError) {
            sendResponse({ status: chrome.runtime.lastError.message || "Error", granted:false });
            return;
        }
        sendResponse({ status: STATUS_OK, granted: granted || false });
    });
}

var g_idCardTimerLast = null;

function handleShowAllActiveTimers() {
    findAllActiveTimers(function (rgIdCards) {
        var cTotal = rgIdCards.length;
        var cProcessed = 0;
        var cMinimized = 0;
        var cExisting = 0;

        function onFinishedAll() {
            var strNotification = null;

            if (cExisting == cTotal) {
                strNotification = "No more active timers to show.";
                if (cMinimized > 0)
                    strNotification += " Note: some timers are minimized.";
            }

            if (strNotification) {
                handleShowDesktopNotification({
                    notification: strNotification,
                    timeout: 5000
                });
            }
        }

        if (rgIdCards.length == 0)
            onFinishedAll(); //edge or impossible case
        else {
            rgIdCards.forEach(function (idCard) {
                doShowTimerWindow(idCard, function (status, properties) {
                    cProcessed++;
                    if (status == STATUS_OK && properties && properties.bExisted) {
                        cExisting++;
                        if (properties.bMinimized)
                            cMinimized++;
                    }

                    if (cProcessed == cTotal)
                        onFinishedAll();
                });
            });
        }
    });
}

function processTimerCounter(bLoadingExtension) {

    var bChangedIdCard = false;
    function getTimerText(response) {
        assert(typeof SYNCPROP_optAlwaysShowSpentChromeIcon !== "undefined");
        var keyUnits = "units";
        chrome.storage.sync.get([keyUnits, SYNCPROP_ACTIVETIMER, SYNCPROP_optAlwaysShowSpentChromeIcon], function (obj) {
            var idCardTimer = null;
            UNITS.current = obj[keyUnits] || UNITS.current; //reload
            setOptAlwaysShowSpentChromeIcon(obj[SYNCPROP_optAlwaysShowSpentChromeIcon]);
            if (obj[SYNCPROP_ACTIVETIMER] !== undefined)
                idCardTimer = obj[SYNCPROP_ACTIVETIMER];

            if (idCardTimer != g_idCardTimerLast) {
                bChangedIdCard = true;
                if (g_idCardTimerLast == null && bLoadingExtension) {
                    //done only when bLoadingExtension as other times will be taken care from content.
                    //otherwise, if the user closes the popup, it would come back again

                    //open the last active timer. do it a little later since chrome is just starting up
                    setTimeout(function () {
                        //show the active timer. wait for it otherwise timing issues can cause rare paths as db is being opened while the other timers are reached below.
                        doShowTimerWindow(idCardTimer, function (status) {
                            if (status != STATUS_OK)
                                return;
                            findAllActiveTimers(function (rgIdCards) {
                                rgIdCards.forEach(function (idCard) {
                                    if (idCard != idCardTimer)
                                        doShowTimerWindow(idCard);
                                });
                            });
                        });
                        
                    }, 2000);
                }
                g_idCardTimerLast = idCardTimer;
            }

            if (idCardTimer) {
                var hash = getCardTimerSyncHash(idCardTimer);
                getCardTimerData(hash, function (objTimer) {
                    var stored = objTimer.stored;
                    if (stored === undefined || stored.msStart == null || stored.msEnd != null) {
                        response("");
                        return;
                    }
                    var msStart = stored.msStart;
                    var msEnd = Date.now();
                    var minutesDelta= (msEnd - msStart) / 1000 / 60;
                    var msRemain = (minutesDelta - Math.floor(minutesDelta)) * 60 * 1000;
                    var time=getTimerElemText(msStart, msEnd,true);
                    var text = "";
                    var unit = UNITS.current;

                    if (unit == UNITS.hours) {
                        if (time.hours > 9)
                            text = "" + Math.round(UNITS.TimeToUnits(msEnd - msStart) * 10) / 10;
                        else {
                            if (time.hours == 0)
                                text = "0:" + time.minutes; //cleaner
                            else
                                text = "" + time.hours + ":" + prependZero(time.minutes);
                        }
                    }
                    else if (unit == UNITS.minutes) {
                        if (time.minutes > 9999)
                            text = "+9999";
                        else
                            text = "" + time.minutes;
                    }
                    else {
                        assert(unit == UNITS.days);
                        text = "" + Math.round(UNITS.TimeToUnits(msEnd - msStart) * 10) / 10;
                    }
                    response(text, msRemain);
                });
            }
            else {
                response("");
            }
        });
    }

    getTimerText(function responseTimer(strTimer, msRemain) {
        var bChanged = (g_strTimerLast != strTimer);
        var bWasEmpty = (g_strTimerLast.length==0);
        g_strTimerLast = strTimer;
        if (g_idTimeoutTimer) {
            clearTimeout(g_idTimeoutTimer);
            g_idTimeoutTimer = null;
        }
        if (strTimer.length == 0) { //stopped timer
            if (bChanged) {
                setIconBadgeText(g_strBadgeText); //restore last badge
                updatePlusIcon(false);
                animateFlip();
            }
        }
        else {
            updatePlusIcon(false);
            g_idTimeoutTimer = setTimeout(processTimerCounter, (1000 * 60 - msRemain + 500));
            if ((bChanged && bWasEmpty) || bChangedIdCard)
                animateFlip();
        }
    });
}

function doInstallNetworkDetection() {
    if (g_bInstalledNetworkDetection)
        return;
    g_bInstalledNetworkDetection = true;
    var rgIgnore = ["/checklist/", "/markAsViewed", "/1/members"];
    chrome.webRequest.onCompleted.addListener(
        function (details) {
            if (details.statusCode == 200 && g_bDetectTrelloNetworkActivity && details.method != "GET") {
                //  && details.url.indexOf("/1/members") < 0
                var bHandleIt=rgIgnore.every(function (str) {
                    if (details.url.indexOf(str) >= 0)
                        return false; //stop
                    return true;
                });
                if (bHandleIt)
                    handleDetectedTrelloActivity();
            }
        },
        { urls: ["https://trello.com/1/*"] },
        []);

    chrome.webRequest.onErrorOccurred.addListener(function (details) {
        if (details && details.type == "main_frame" && details.parentFrameId == -1 && details.method == "GET" && !details.fromCache &&
            (!navigator.onLine || details.error.indexOf("_DISCONNECT") >= 0)) {
            var url = details.url;
            chrome.tabs.get(details.tabId, function (tab) {
                if (tab && tab.highlighted) { //highlighted reduces chances we show the message for a tab that chrome is retrying in the background
                    doShowBoardCardOfflineNotification(url);
                }
            });
        }
    }, { urls: ["https://trello.com/b/*", "https://trello.com/c/*"] });
}


function doShowBoardCardOfflineNotification(url) {
    var idBoard = null;
    var idCard = null;
    if (url.toLowerCase().indexOf("/b/") >= 0)
        idBoard = url.split("/")[4];
    else if (url.toLowerCase().indexOf("/c/") >= 0)
        idCard = url.split("/")[4];

    if (idBoard || idCard) {
        handleOpenDB(null, function (responseOpen) {
            if (responseOpen.status != STATUS_OK) {
                return;
            }
            var request = null;
            if (idBoard) {
                request = { sql: "SELECT idBoard,name FROM boards WHERE idBoard=?", values: [idBoard] };
                handleGetReport(request,
                    function (responseReport) {
                        if (responseReport.status == STATUS_OK && responseReport.rows.length > 0) {
                            handleShowDesktopNotification({ timeout: 10000, idUse: g_prefixOfflineBoardNotification + idBoard, notification: "Chrome is offline. Click to open a card report for this board: " + responseReport.rows[0].name });
                        }
                    });
            }
            else if (idCard) {
                request = { sql: "SELECT idBoard,name FROM cards WHERE idCard=?", values: [idCard] };
                handleGetReport(request,
                    function (responseReport) {
                        if (responseReport.status == STATUS_OK && responseReport.rows.length > 0) {
                            idBoard = responseReport.rows[0].idBoard;
                            handleShowDesktopNotification({ timeout: 10000, idUse: g_prefixOfflineCardNotification + idBoard + ":" + idCard, notification: "Chrome is offline. Click to open a card report for this card and board: " + responseReport.rows[0].name });
                        }
                    });
            }
        });
    }
}

function handleDetectedTrelloActivity() {
    //the idea is to do the bare minimum here as it can happen often and we also dont want to risk errors happening on this system callback.
    //later, a setTimeout detects this change and acts
    g_cTrelloActivitiesDetected++;
}

function handleQueryTrelloDetectionCount(sendResponse) {
    var cRet = g_cTrelloActivitiesDetected;
    g_cTrelloActivitiesDetected = 0;
    sendResponse({ status: STATUS_OK, count: cRet });
}

var g_bPlusExtensionLoadedOK = false;
var g_bRetryWhenNotLoadedOK = true;

function setUninstallURLCustom() {
    //review zig: modify to include &pro=true when g_bProVersion. First requires to keep g_bProVersion up to date (its not in many cases)
    if (chrome.runtime.setUninstallURL) //none in some ubuntu
        chrome.runtime.setUninstallURL("http://www.plusfortrello.com/p/goodbye.html?from=uninstall", function () { });
}

var g_loaderDetector = {
    initLoader: function () {
        var thisLocal = this;
        g_bFromBackground = true; //from shared
        setUninstallURLCustom();
        //prevent too old Chrome versions.
        //Must support at least Promises (Chrome 33) http://caniuse.com/#feat=promises
        //<dialog>: polyfilled so we dont check. http://caniuse.com/#feat=dialog (native since Chrome 37)

        //your ticket to the Promised land
        if (!window.Promise) {
            g_bRetryWhenNotLoadedOK = false;
            setTimeout(function () {
                handleShowDesktopNotification({
                    notification: "Sorry, your Chrome browser is outdated. Plus for Trello requires Chrome 33 or later.\nUpdate Chrome or remove Plus from the Chrome Menu + More Tools + Extensions.",
                    timeout: 30000
                });
            }, 1000);
            //g_bPlusExtensionLoadedOK remains false
            return this;
        }

        setTimeout(function () { //avoid global dependencies. however, this timeout could cause content script to call before we are ready. in messaging we handle it.
            g_analytics.init();
            loadBackgroundOptions(function () {
                thisLocal.init();
                g_bPlusExtensionLoadedOK = true;
            });
        }, 1); //to force-test timing-related issues, change this 1 to a larger number so that other places will retry. those places also need larger setTimeouts to test.
        return this;
    },
    init: function () {
        g_bOffline = !navigator.onLine;
        updatePlusIcon();
        
        //unpause sync
        setInterval(function () {
            if (g_msRequestedSyncPause==0)
                return;
            var msNow = Date.now();
            if (msNow - g_msRequestedSyncPause > 6000) {
                handleUnpause();
            }
        }, 2000);

        //update icon tooltip and active timer
        setInterval(function () {
            updatePlusIcon(true); //just the tooltip
            if (g_cErrorSync == 1) {
                g_cErrorSync = 2; //not 1
                //attempt to recover from the first error wihin the sync period.
                setTimeout(function () {
                    checkNeedsSync(true);
                }, 5000);
            }
        }, 1000 * 5);


        
        var intervalNetDetect = null;

        function doNetDetect() {
            if (g_bInstalledNetworkDetection) {
                if (intervalNetDetect)
                    clearInterval(intervalNetDetect);
                intervalNetDetect = null;
                return;
            }
            var keyTrelloSync = 'bEnableTrelloSync';
            chrome.storage.sync.get(keyTrelloSync, function (obj) {
                g_bDetectTrelloNetworkActivity = obj[keyTrelloSync] || false;
                if (g_bDetectTrelloNetworkActivity && !g_bInstalledNetworkDetection) {
                    doInstallNetworkDetection();
                }
            });

        }

        setTimeout(function () {
            doNetDetect();
            //install network detection
            intervalNetDetect = setInterval(doNetDetect, 4000);
        }, 2500);

        hookNotificationActions();
        processTimerCounter(true);

        function updateOnlineState(bOnline) {
            console.log("Plus online: " + bOnline);
            g_bOffline = !bOnline;
            updatePlusIcon(false);
            if (bOnline)
                setTimeout(function () { checkNeedsSync(true); }, 2000);
        }

        window.addEventListener("online", function () { updateOnlineState(true); }, false);
        window.addEventListener("offline", function () { updateOnlineState(false); }, false);

        //do sync

        function checkNeedsSync(bForce) {
            var keySyncOutsideTrello = "bSyncOutsideTrello";
            var keyPlusDateSyncLast = "plus_datesync_last";

            if (g_bOffline)
                return;

            chrome.storage.sync.get([keySyncOutsideTrello], function (obj) {
                var bSyncOutsideTrello = obj[keySyncOutsideTrello];

                if (g_bDisableSync)
                    return;


                //if we already did at least one sync during this chrome session, and the last error was "offline", do try to sync again (bypassing bSyncOutsideTrello)
                var bLastErrorWasOffline = (g_lastStatusSyncCache &&
                    ((g_lastStatusSyncCache.statusRead && g_lastStatusSyncCache.statusRead.indexOf(Language.NOINTERNETCONNECTION)>=0) ||
                    (g_lastStatusSyncCache.statusWrite && g_lastStatusSyncCache.statusWrite.indexOf(Language.NOINTERNETCONNECTION) >= 0)));

                if (!bSyncOutsideTrello && !bLastErrorWasOffline)
                    return;

                if (g_optEnterSEByComment.IsEnabled() && (localStorage["plus_bFirstTrelloSyncCompleted"] || "") != "true")
                    return; //dont make the first sync from background-sync

                chrome.storage.local.get(keyPlusDateSyncLast, function (obj) {
                    var msDateSyncLast = obj[keyPlusDateSyncLast];
                    var dateNow = new Date();
                    if (!bForce && msDateSyncLast !== undefined && dateNow.getTime() - msDateSyncLast < g_msSyncRateLimit)
                        return;
                    handleRawSync(true);
                });
            });
        }

        //check right away
        setTimeout(function () {
            checkNeedsSync(true);
        }, MSDELAY_FIRSTSYNC); 

        //every 10 minutes
        setInterval(function () {
            checkAnalyticsActive();
            checkNeedsSync(false);
            g_cErrorSync = 0; //reset counter
        }, 1000 * 60 * 10);
    }
}.initLoader();

function checkAnalyticsActive() {
    if (!g_db) //active only if at least opened the db
        return;

    var dateNow = new Date();
    var msShift = (dateNow.getTimezoneOffset() - 60 * 5) * 60000; //GMT-5 aprox standarization
    var msNow = dateNow.getTime() + msShift;
    var msLast = parseInt(localStorage["ms-last-usage"] || "0",10);
    dateNow = new Date(msNow); //overwrite
    var dateLast = new Date(msLast);
    var strNow = makeDateCustomString(dateNow);
    var strLast = makeDateCustomString(dateLast);
    if (strNow != strLast) {
        handleHitAnalyticsEvent("ActiveDay", "active", true, true);
        localStorage["ms-last-usage"] = "" + msNow;
    }
}

function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
    if (typeof stroke == "undefined") {
        stroke = true;
    }
    if (typeof radius == "undefined") {
        radius = 5;
    }
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
    if (fill) {
        ctx.fill();
    }
    if (stroke) {
        ctx.stroke();
    }
}


var g_dataSyncLast = { stage: "", ms: 0 }; //to avoid spamming tooltip update
var g_animationFrames = 18;
var g_msAnimationSpeed = 17;
var g_rotation = 0;
var g_bHilitePlusIcon = false;

function ease(x) {
    return (1 - Math.sin(Math.PI / 2 + x * Math.PI)) / 2;
}

function animateFlip() {
    if (true) { //review zig: temporarily stopped until rotation is fixed
        g_bHilitePlusIcon = true;
        updatePlusIcon(false);
        setTimeout(function () {
            g_bHilitePlusIcon = false;
            updatePlusIcon(false);
        }, 600);
        return;
    }

    if (g_rotation != 0)
        return;

    function worker() {
        var bQueue = false;

        if (g_rotation <= 1) {
            g_rotation += (1 / g_animationFrames);
            bQueue = true;
        } else {
            g_rotation = 0;
        }
        updatePlusIcon(false);
        if (bQueue) {
            setTimeout(function () {
                worker();
            }, g_msAnimationSpeed);
        }
    }
    worker();
}

function updatePlusIcon(bTooltipOnly) {
    setTimeout(function () {
        updatePlusIconWorker(bTooltipOnly); //review zig: ugly workarround because code sets storage props and immediately calls updatePlusIcon
    }, 100);
}

function updatePlusIconWorker(bTooltipOnly) {
    bTooltipOnly = bTooltipOnly || false;
    if (g_bLastPlusMenuIconError)
        bTooltipOnly = false; //force it
    var keyLastSync = "rowidLastHistorySynced";
    var keyLastSyncViewed = "rowidLastHistorySyncedViewed";
    var key_plus_datesync_last = "plus_datesync_last";
    var keyplusSyncLastStatus = "plusSyncLastStatus";
    var msNow = Date.now();

	//prevent changing tooltip too often
    //note: checks typeof as this could be called from within a global constructor.
    if (bTooltipOnly && typeof g_syncStatus != "undefined" && typeof g_dataSyncLast != "undefined" && g_syncStatus.bSyncing) {
        if (g_dataSyncLast.stage != g_syncStatus.stage) {
            g_dataSyncLast.stage = g_syncStatus.stage;
        }
        else {
            if (msNow - g_dataSyncLast.ms < 200)
                return;
        }
        g_dataSyncLast.ms = msNow;
    }

    chrome.storage.local.get([keyLastSync, keyLastSyncViewed, key_plus_datesync_last, keyplusSyncLastStatus], function (obj) {
        var rowidLastSync = obj[keyLastSync];
        var rowidLastSyncViewed = obj[keyLastSyncViewed];
        var msplus_datesync_last = obj[key_plus_datesync_last];
        var statusLastSync = obj[keyplusSyncLastStatus]; //can be undefined the first time or after reset sync
        var bNew = false;

        if (rowidLastSync != null && (rowidLastSyncViewed == null || rowidLastSyncViewed < rowidLastSync))
            bNew = true;
        var strBase = "images/icon19";
        if (bNew) {
            strBase += "new";
        }

        if (g_bHilitePlusIcon)
            strBase = "images/icon19hilite";

        //returns false if there is no sync error
        function setTooltipSyncStatus() {
            var tooltipPre = "Plus for Trello\n";
            var tooltip = "";
            if (bNew)
                tooltipPre = tooltipPre + "New S/E rows\n";
            
            if (g_dataTotalSpentThisWeek.str == null || g_strTimerLast.length>0)
                setIconBadgeText("", g_strTimerLast.length > 0);
            
            if (g_dataTotalSpentThisWeek.str)
                tooltipPre = tooltipPre + g_dataTotalSpentThisWeek.weeknum + ": " + g_dataTotalSpentThisWeek.str + " Spent \n\n";

            if (msplus_datesync_last !== undefined)
                tooltipPre = tooltipPre + "Last sync " + getTimeDifferenceAsString(msplus_datesync_last, true) + "\n";

            var syncStatus = "";
            if (g_cWriteSyncLock == 0 && g_cReadSyncLock == 0 && !g_syncStatus.bSyncing) {
                if (g_msRequestedSyncPause > 0) {
                    tooltipPre = tooltipPre + "Sync is paused until help is closed.\n";
                }
                if (statusLastSync)
                    syncStatus = buildSyncErrorTooltip(statusLastSync);
                tooltipPre = tooltipPre + syncStatus;
            }

            if (g_cWriteSyncLock > 0)
                tooltip = tooltip + "Writting S/E to spreadsheet...\n";

            if (g_cReadSyncLock > 0)
                tooltip = tooltip + "Reading S/E from spreadsheet...\n" + g_cRowsRead + " rows read.\n";
            
            if (g_syncStatus.bSyncing) {
                tooltip = tooltip + "Reading from Trello..."+ g_syncStatus.postfixStage+"\n";
                    tooltip = tooltip + g_syncStatus.stage + "\n";
                    if (!g_syncStatus.bSingleStep)
                        tooltip = tooltip + (g_syncStatus.cProcessed + " of " + g_syncStatus.cSteps + "\n");
            }

            
            if (g_bUpdateSyncNotificationProgress) {
                if (g_cWriteSyncLock == 0 && g_cReadSyncLock == 0 && !g_syncStatus.bSyncing) {
                    g_bUpdateSyncNotificationProgress = false; //reset
                    chrome.notifications.clear(IDNOTIFICATION_FIRSTSYNCPRORESS, function (bWasCleared) { });
                } else {
                    chrome.notifications.update(IDNOTIFICATION_FIRSTSYNCPRORESS,
                        {
                            message: Language.FIRSTSYNC_PRE + tooltip
                        }, function (notificationId) {});
                }
            }

            if (g_bOffline)
                tooltip = tooltip + "\nChrome is offline.";
            chrome.browserAction.setTitle({ title: tooltipPre + tooltip });

            var dateLastStatus = (statusLastSync && statusLastSync.date) || msNow;
            return { statusStr: syncStatus, msDelta: msNow - dateLastStatus };
        }

        var statusTooltip = setTooltipSyncStatus();
        var bErrorSync = (statusTooltip.statusStr.length > 0 && statusTooltip.msDelta < 1000 * 60 * 60); //pretend there wasnt a sync error if its old (over 60 min)
        var ctx = null;
        var canvas = null;
        var dxCanvas = 0;
        var dyCanvas = 0;
        var rotation = g_rotation;

        if (bErrorSync && statusTooltip.statusStr && statusTooltip.statusStr.indexOf(Language.NOINTERNETCONNECTION) >= 0) {
            bErrorSync = false;
        }
        if (bTooltipOnly && bErrorSync)
            bTooltipOnly = false;

        if (!bTooltipOnly) {
            var img = document.getElementById("imgPlusMenu");
            img.setAttribute("width", "19");
            img.setAttribute("height", "19");
            img.setAttribute("src", chrome.extension.getURL(strBase + ".png"));
            canvas = document.getElementById("canvasPlusMenu");
            canvas.setAttribute("width", "19");
            canvas.setAttribute("height", "19");
            ctx = canvas.getContext("2d");
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            if (rotation != 0) {
                dxCanvas = Math.ceil(canvas.width / 2);
                dyCanvas = Math.ceil(canvas.height / 2);
                ctx.translate(dxCanvas, dyCanvas);
            }
            //review zig if (rotation != 0)  ctx.rotate(2 * Math.PI * ease(rotation));
            if (img.complete) { //check if image was already loaded by the browser
                img.onload = null; //anyone waiting should be cancelled as they have stale data
                callbackPaint();
            } else {
                img.onload = callbackPaint;
            }
        }

        function callbackPaint() {
            ctx.drawImage(img, -dxCanvas, -dyCanvas);
            if (rotation != 0) {
                ctx.translate(-dxCanvas, -dyCanvas);
                ctx.rotate(-2 * Math.PI * ease(rotation));
            }

            var colorTrelloSync = "#FFFFFF";
            var colorErrorSync = "#FF5050";
            var colorOffline = "#BBBBBB";
            var colorBackground = "#FFFFFF";
            var colorCircleStroke = '#000000';

            if (bErrorSync)
                colorBackground = colorErrorSync;
            else if (g_bOffline)
                colorBackground = colorOffline;

            g_bLastPlusMenuIconError = false; //reset
            var nameFontSmall = "bold 8px Tahoma, Arial, sans-serif"; //tahoma is very readable at small sizes

            //draw spent counter on top of chrome badge
            if (g_optAlwaysShowSpentChromeIcon == OPT_SHOWSPENTINICON_ALWAYS && g_strTimerLast.length > 0 && g_strBadgeText.length > 0) {
				//review zig: doesnt show offline/error visual status
                ctx.fillStyle = PLUS_COLOR_SPENTBADGE;
                ctx.strokeStyle = PLUS_COLOR_SPENTBADGE;
                ctx.font = nameFontSmall;
                var textBadgeSpent = getFormattedSpentBadgeText();
                var width = ctx.measureText(textBadgeSpent).width;
                var xStart = Math.max(16 - width, 1);
                ctx.fillRect(xStart, 4, 19, 9);
                ctx.fillStyle = "#FFFFFF";
                ctx.fillText(textBadgeSpent, xStart + 2, 12);
            }
            else if (bErrorSync || g_bOffline) { //draw X
                g_bLastPlusMenuIconError = true;
                var dx = 4.5;
                ctx.beginPath();
                ctx.strokeStyle = colorBackground;
                if (bErrorSync) {
                    ctx.lineWidth = 1.5;
                }
                else {
                    ctx.lineWidth = 1.5;
                }

                ctx.moveTo(1 + dx, 1);
                ctx.lineTo(8 + dx, 8);
                ctx.stroke();
                ctx.moveTo(8 + dx, 1);
                ctx.lineTo(1 + dx, 8);
                ctx.stroke();
                ctx.closePath();
            }


            //white dot to the right
            if (g_cReadSyncLock > 0 || g_syncStatus.bSyncing) {
                ctx.beginPath();
                ctx.fillStyle = (colorTrelloSync);
                ctx.arc(15, 2, 2, 0, 2 * Math.PI, false);
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = colorCircleStroke;
                ctx.stroke();
                ctx.closePath();
            }

            //orange dot to the right
            if (g_cWriteSyncLock > 0) {
                ctx.beginPath();
                ctx.fillStyle = "#FED89E";
                ctx.arc(15, 2, 2, 0, 2 * Math.PI, false);
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = colorCircleStroke;
                ctx.stroke();
                ctx.closePath();
            }
            
            if (isTestVersion()) {
                ctx.fillStyle = '#000000';
                ctx.strokeStyle = '#000000';
                ctx.font = "bold 5px Tahoma, Arial, sans-serif";
                var textBadgeDev = "•";
                var xStartDev = 6;
                ctx.fillText(textBadgeDev, xStartDev + 2,6);
            }
            chrome.browserAction.setIcon({ imageData: ctx.getImageData(0, 0, 19, 19) });
        }
    });
}

var g_rgPorts = [];

function broadcastMessage(message, callback) {
    setTimeout(function () {
        var i = 0;
        for (; i < g_rgPorts.length; i++) {
            try {
                g_rgPorts[i].postMessage(message);
            }
            catch (ex) {
                logException(ex);
            }
        }
        if (callback)
            callback();
    }, 50);
}

chrome.runtime.onConnect.addListener(function (port) {
    assert(port.name == "registerForChanges"); //else handle !g_bPlusExtensionLoadedOK case
    g_rgPorts.push(port);
    port.onDisconnect.addListener(function () {
        var i = 0;
        for (; i< g_rgPorts.length; i++){
            if (g_rgPorts[i] === port) {
                g_rgPorts[i] = null; //not sure if necessary
                g_rgPorts.splice(i, 1);
                break;
            }
        }
    });
});


chrome.runtime.onMessage.addListener(function (request, sender, sendResponseParam) {
    var idTab = null;
    var idWindow = null;
    if (sender && sender.tab) {
        idTab = sender.tab.id || null;
        idWindow = sender.tab.windowId || null;
    }
    return handleExtensionMessage(request, sendResponseParam, idTab, idWindow);
});


function handleExtensionMessage(request, sendResponseParam, idTabSender, idWindowSender) {
    var responseStatus = { bCalled: false };


    function sendResponse(obj) {
        try {
            if (sendResponseParam)
                sendResponseParam(obj);
        } catch (e) {
            logException(e);
        }
        responseStatus.bCalled = true;
    }


    if (!g_bPlusExtensionLoadedOK) {
        //in case it is timing related, give it one breath
        //dont keep giving breaths on unrecoverable errors
        console.log("Unusual: !g_bPlusExtensionLoadedOK in onMessage.addListener callback");
        function doError() {
            g_bRetryWhenNotLoadedOK = false;
            var err = "Extension not loaded error.";
            console.log(err);
            sendResponse({ status: err, bExtensionNotLoadedOK: true });
        }

        if (!g_bRetryWhenNotLoadedOK) {
            doError();
        }
        else {
            setTimeout(function () {
                if (g_bPlusExtensionLoadedOK)
                    doit();
                else {
                    console.log("Unusual: 2nd try !g_bPlusExtensionLoadedOK in onMessage.addListener callback");
                    doError();
                }
            }, 2000);
        }
        return (!responseStatus.bCalled);
    }

    doit();

    function doit() {
        if (request.method == "getConfigData") {
            var bSkipCache = (request.bSkipCache);

            getConfigData(request.urlService, request.userTrello, function (retConfig) {
                if (retConfig === undefined) //null means something different
                    sendResponse({ config: { status: "not configured" } });
                else
                    sendResponse({ config: retConfig });
            }, bSkipCache);
        }
        else if (request.method == "setTrelloAuthData") {
            localStorage["trelloAuth-dsc"] = request.dsc;
            if (request.bInFrame) {
                setTimeout(function () {
                    uninjectTrelloFrame();
                    handleRawSync(true);
                }, 100);
            }
            sendResponse({ status: STATUS_OK });
        }
        else if (request.method == "reloadExtension") {
            handleReloadExtension();
            sendResponse({ status: STATUS_OK });
        }
        else if (request.method == "notifyCardTab") {
            handlenotifyCardTab(request.idCard, idTabSender);
            sendResponse({ status: STATUS_OK });
        }
        else if (request.method == "notifyBoardTab") {
            handlenotifyBoardTab(request.idBoard, idTabSender);
            sendResponse({ status: STATUS_OK });
        }
        else if (request.method == "cardPopupWindowResize") {
            chrome.windows.update(idWindowSender, { width: request.width, height: request.height });
            sendResponse({ status: STATUS_OK });
        }
        else if (request.method == "showAllActiveTimerNotifications") {
            handleShowAllActiveTimers();
            sendResponse({ status: STATUS_OK });
        }
        else if (request.method == "openCardWindow") {
            doOpenCardInBrowser(request.idCard, request.position, request.bForceTab, request.bForcePopup);
            sendResponse({ status: STATUS_OK });
        }
        else if (request.method == "openBoardWindow") {
            doOpenBoardInBrowser(request.idBoard);
            sendResponse({ status: STATUS_OK });
        }
        else if (request.method == "timerWindowLoaded") {
            handleTimerWindowLoaded(request.idCard, request.bClearAndMinimize);
            sendResponse({ status: STATUS_OK });
        }
        else if (request.method == "completedFirstSync") {
            sendResponse({ status: STATUS_OK, bCompletedFirstSync: ((localStorage["plus_bFirstTrelloSyncCompleted"] || "") == "true") });
        }
        else if (request.method == "timerWindowRestored") {
            handleTimerWindowRestored(request.idCard);
            sendResponse({ status: STATUS_OK });
        }

        else if (request.method == "getBoardsWithoutMe") {
            buildBoardsWithoutMe(function (response) {
                sendResponse(response);
            });
        }
        else if (request.method == "hitAnalyticsEvent") {
            handleHitAnalyticsEvent(request.category, request.action, false, request.bSkipNewbie);
            sendResponse({ status: STATUS_OK });
        }
        else if (request.method == "getDateUpdateNotificationReceived") {
            sendResponse({ status: STATUS_OK, msDate: g_msUpdateNotificationReceived });
        }
        else if (request.method == "showTimerWindow") {
            var keybDontShowTimerPopups = "bDontShowTimerPopups";
            chrome.storage.sync.get([keybDontShowTimerPopups], function (objSync) {
                g_bDontShowTimerPopups = objSync[keybDontShowTimerPopups] || false;
                if (!g_bDontShowTimerPopups)
                    doShowTimerWindow(request.idCard);
            });
            sendResponse({ status: STATUS_OK });
        }
        else if (request.method == "openChromeOptionsPanels") {
            alert("Enable 'Chrome panels' for much better timers.\n\
'Panels' is a new Chrome feature that comes disabled by default. To enable now:\n\n\
1. Press OK to open the 'Chrome options' page.\n\n\
2. Click 'Enable' there and 'Relaunch Chrome' from\n    the bottom of that page.\n\n\
Do not change any other option there.\n\
With 'Panels' enabled, your card timer popups will become top-most panels that organize neatly and stay up even if you quit Chrome.\n\
If you instead want to disable timer popups do so from Plus preferences.");
            chrome.tabs.create({ url: "chrome://flags/#enable-panels" });
            sendResponse({ status: STATUS_OK });
        }
        else if (request.method == "animateChromeIconFlip") {
            animateFlip();
            sendResponse({ status: STATUS_OK });
        }
        else if (request.method == "requestGoogleSyncPermission") {
            handleGoogleSyncPermission(sendResponse);
        }
        else if (request.method == "requestProPermission") {
            handleRequestProPermission(sendResponse);
        }
        else if (request.method == "checkLi") {
            handleCheckLi(sendResponse);
        }
        else if (request.method == "queryTrelloDetectionCount") {
            handleQueryTrelloDetectionCount(sendResponse);
        }
        else if (request.method == "plusMenuSync") {
            handlePlusMenuSync(sendResponse);
        }
        else if (request.method == "createNewSs") {
            handleCreateSs(sendResponse);
        }
        else if (request.method == "getPlusFeed") {
            handleGetPlusFeed(request.msLastPostRetrieved, sendResponse);
        }
        else if (request.method == "getAllHashtags") {
            handleGetAllHashtags(sendResponse);
        }
        else if (request.method == "getManifestVersion") {
            sendResponse({ status: STATUS_OK, version: chrome.runtime.getManifest().version });
        }
        else if (request.method == "updatePlusIcon") {
            if (request.bOnlyTimer) {
                processTimerCounter();
            }
            else {
                if (request.bSetSpentBadge) {
                    chrome.storage.sync.get([SYNCPROP_optAlwaysShowSpentChromeIcon], function (obj) {
                        setOptAlwaysShowSpentChromeIcon(obj[SYNCPROP_optAlwaysShowSpentChromeIcon]);
                        if (g_strTimerLast.length == 0)
                            setIconBadgeText(g_strBadgeText, false);
                        updatePlusIcon();
                    });
                }
                else {
                    updatePlusIcon();
                }
            }

            if (request.bAnimate)
                animateFlip();
            sendResponse({ status: STATUS_OK });
        }
        else if (request.method == "setBadgeData") { //str, weeknum, text
            if (request.text !== undefined) {
                g_dataTotalSpentThisWeek.str = request.text;
                g_dataTotalSpentThisWeek.weeknum = request.weeknum;
                setIconBadgeText(request.text);
            }
            if (request.tooltip !== undefined)
                chrome.browserAction.setTitle({ title: request.tooltip });
            sendResponse({});
        }
        else if (request.method == "testBackgroundPage") {
            insertLogMessages(request.logMessages, sendResponse);
        }
        else if (request.method == "showDesktopNotification") {
            handleShowDesktopNotification(request);
            sendResponse({});
        }
        else if (request.method == "insertHistoryRowFromUI") {
            handleInsertHistoryRowFromUI(request, sendResponse);
        }
        else if (request.method == "queueRenameAllCards") {
            g_rgUndoCardRename = null; //exlusive
            localStorage["renameCardsPendingData"] = JSON.stringify({ pending: true, bOnlyCardsWithHistory: request.bOnlyCardsWithHistory });
            sendResponse({ status: STATUS_OK });
        }
        else if (request.method == "getReport") {
            handleGetReport(request, sendResponse);
        }
        else if (request.method == "openDB") {
            handleOpenDB(request.options, sendResponse);
        }
        else if (request.method == "syncDB") {
            handleSyncDB(request, sendResponse);
            //testResetVersion(); //for testing only
        }
        else if (request.method == "trelloSyncBoards") {
            handleSyncBoards(request, sendResponse);
        }
        else if (request.method == "detectLegacyHistoryRows") {
            detectLegacyHistoryRows(sendResponse);
        }
        else if (request.method == "getTrelloCardData") {
            handleGetTrelloCardData(request, sendResponse);
        }
        else if (request.method == "getTrelloBoardData") {
            handleGetTrelloBoardData(request, sendResponse);
        }
        else if (request.method == "getTotalDBRows") {
            handleGetTotalRows(false, sendResponse);
        }
        else if (request.method == "getTotalDBRowsNotSync") {
            handleGetTotalRows(true, sendResponse);
        }
        else if (request.method == "getTotalDBMessages") {
            handleGetTotalMessages(sendResponse);
        }
        else if (request.method == "getlocalStorageSize") {
            sendResponse({ result: unescape(encodeURIComponent(JSON.stringify(localStorage))).length });
        }
        else if (request.method == "clearAllStorage") {
            var savedId = localStorage[g_analytics.PROP_IDANALYTICS];
            localStorage.clear();
            if (savedId)
                localStorage[g_analytics.PROP_IDANALYTICS] = savedId;
            handleDeleteDB(request, sendResponse);
        }
        else if (request.method == "clearAllLogMessages") {
            handleDeleteAllLogMessages(request, sendResponse);
        }
        else if (request.method == "writeLogToPlusSupport") {
            handleWriteLogToPlusSupport(request, sendResponse);
        }
        else if (request.method == "isSyncing") {
            handleIsSyncing(sendResponse);
        }
        else if (request.method == "beginPauseSync") {
            handlePause(sendResponse);
        }
        else if (request.method == "endPauseSync") {
            handleUnpause(sendResponse);
        }
        else if (request.method == "copyToClipboard") {
            handleCopyClipboard(request.html, sendResponse);
        }
        else if (request.method == "undoRenameCards") {
            localStorage.removeItem("renameCardsPendingData"); //exclusive
            //getting the input here likely allows a larger text buffer and/or more efficient than sending through message
            var text = window.prompt("Paste the text from the rename backup file (dont worry about the '...' at the end after pasting)");
            var obj = null;
            var totalCards = 0;
            var status = STATUS_OK;

            if (text) {
                try {
                    obj = JSON.parse(text);
                } catch (e) {

                }
            }
            if (text && (obj == null || !obj.cards || obj.cards.length != obj.totalCards)) {
                status = "Invalid JSON text format.";
            } else if (!text || obj.totalCards <= 0)
                status = "No cards to process.";
            else {
                totalCards = obj.totalCards;
            }
            if (obj)
                g_rgUndoCardRename = obj.cards;
            else
                g_rgUndoCardRename = null;
            sendResponse({ status: status, totalCards: totalCards });

        }
        else
            sendResponse({});
    }

    if (!responseStatus.bCalled)
        return true;
}


function handleCopyClipboard(html, sendResponse) {
    if (window.getSelection && document.createRange) {

        function handleRequestPermission(sendResponse) {
            chrome.permissions.request({
                permissions: ["clipboardWrite"]
            }, function (granted) {
                if (chrome.runtime.lastError) {
                    sendResponse({ status: chrome.runtime.lastError.message || "Error" });
                    return;
                }
                if (!granted) {
                    sendResponse({ status: "error: permission not granted." });
                    return;
                }

                sendResponse({ status: STATUS_OK});
            });
        }

        handleRequestPermission(function (response) {
            if (response.status == STATUS_OK) {
                var elemReplace = document.getElementById("selectionPlaceholder");
                elemReplace.innerHTML = html;
                var sel = window.getSelection();
                var range = document.createRange();
                range.selectNodeContents(elemReplace);
                sel.removeAllRanges();
                sel.addRange(range);
                document.execCommand("Copy");
                setTimeout(function () {
                    //blank it when done. Delay is to attempt fix on a user that says rows at the end dont get copied,
                    //which maybe happens because "copy" could be running in parallel and replacing the html could hurt it.
                    elemReplace.innerHTML = "";
                }, 3000);
            }
            sendResponse(response);
        });
    }
    else {
        sendResponse({ status: "Cannot copy to clipboard." });
    }
}

function isTaskbarBottom() {
    return (navigator.platform.indexOf('Win') >= 0 || navigator.userAgent.indexOf('CrOS')>=0); //windows and chromebooks 
}

var g_bHookedNotificationsButton = false;

function handleTimerWindowRestored(idCard) {
    var map = g_mapTimerWindows[idCard];
    if (!map)
        return;
    showTimerWindowAsNotification(idCard, map.nameCard, map.nameBoard);
}

function handleTimerWindowLoaded(idCard, bClearAndMinimize) {
    var map = g_mapTimerWindows[idCard];
    if (!map)
        return;
    var idWindow = map.idWindow;
    try {
        //alert: this call, when done without any Chrome windows left on the screen, will fail and the catch doesnt help, thus its done at the very end.
        map.bClosedByUser = true;
        if (bClearAndMinimize) {
            chrome.notifications.clear(idNotificationForTimer(idCard), function (bWasCleared) {
                if (true) //dont use bWasCleared for case where ther notification is no longer there when closed by system (lock screen etc)
                    chrome.windows.update(idWindow, { state: "minimized" });
            });
        }
    } catch (e) {
        //yummy
    }
}


function handleNotifClick(notificationId) {
    
    var idCard = idCardFromIdNotification(notificationId);

    function stepCardData(resolve, reject) {
        getCardData(null, idCard, "shortLink", false, function (cardData) {
            if (cardData.status == STATUS_OK && !cardData.hasPermission) {
                removeTimerForCard(idCard);
                reject(new Error("")); //not an error, just stop chain. message already shown by removeTimerForCard
            }
            else
                resolve(STATUS_OK);
        });
    }

    function openCard(status) {
        assert(status == STATUS_OK);
        doOpenCardInBrowser(idCard, undefined, true);
    }

    function checkDeletedCard(response) {
        assert(response.status == STATUS_OK);
        var rows = response.rows;
        assert(window.Promise); //we check for this during extension init, and wont load if its not there
        if (rows && rows.length == 1 && rows[0].bDeleted)
            return new Promise(stepCardData); //verify that indeed user has no access
        else
            return STATUS_OK;
    }

    loadSharedOptions(function () {
        getSQLReportShared("SELECT bDeleted FROM cards WHERE idCard=?", [idCard]).then(checkDeletedCard).then(openCard)['catch'](function (err) { //review: 'catch' syntax to keep lint happy
            if (err.message) //message is only set if user needs to see a message. else just means stop the chain
                sendDesktopNotification(err.message, 10000); //note: timer panels rely on this, as alerts dont work in panels
        });
    });
}

function doOpenCardInBrowser(idCard, pos, bForceTab, bForcePopup) {

    function openCardAsUrl() {
        window.open("https://trello.com/c/" + idCard, "_blank"); //this activates the window if chrome is minimized or not active. (chrome.tabs.create does not)
    }

    function openCard() {
        if (!bForceTab) {
            chrome.storage.sync.get([SYNCPROP_CARDPOPUPTYPE], function (obj) {
                if (chrome.runtime.lastError) {
                    console.error(chrome.runtime.lastError.message);
                    return;
                }

                var cardPopupType = obj[SYNCPROP_CARDPOPUPTYPE] || CARDPOPUPTYPE.DEFAULT;
                if (cardPopupType == CARDPOPUPTYPE.NO_POPUP) {
                    if (bForcePopup)
                        makeCardPopupWindow(idCard, pos, CARDPOPUPTYPE.POPUP_SOMEACTIONS);
                    else
                        openCardAsUrl();
                }
                else
                    makeCardPopupWindow(idCard, pos, cardPopupType);
            });
            return;
        }
        openCardAsUrl();
    }

    if (!bForceTab && bForcePopup) {
        openCard();
        return;
    }

    var mapCardWindow = g_mapCardToTab[idCard];  // { tabid: tabid, ms: Date.now() };
    var msNow = Date.now();
    if (mapCardWindow && msNow - mapCardWindow.ms < 8000) { //recent card window. depends on UPDATE_STEP
        var tabid = mapCardWindow.tabid;

        //verify the tab is alive and well
        chrome.tabs.get(tabid, function (tab) {
            var idCardCur = null;
            if (!chrome.runtime.lastError && tab && tab.url)
                idCardCur = getIdCardFromUrl(tab.url);

            if (idCardCur != idCard)
                openCard();
            else {
                //first select the window. else chrome can get weird about selecting the tab while the window is not active
                chrome.windows.update(tab.windowId, { focused: true }, function (window) {
                    if (chrome.runtime.lastError || !window)
                        openCard();
                    else {
                        //finally, select the tab
                        chrome.tabs.update(tabid, { active: true, highlighted: true }, function (tab) {
                            var idCardCur = null;
                            if (!chrome.runtime.lastError && tab && tab.url)
                                idCardCur = getIdCardFromUrl(tab.url);

                            if (idCardCur != idCard)
                                openCard();
                        });
                    }
                });
            }
        });
    } else {
        openCard();
    }
}


function doOpenBoardInBrowser(idBoard) {
    function openBoardAsUrl() {
        window.open("https://trello.com/b/" + idBoard, "_blank"); //this activates the window if chrome is minimized or not active. (chrome.tabs.create does not)
    }

    var mapBoardWindow = g_mapBoardToTab[idBoard];  // { tabid: tabid, ms: Date.now() };
    var msNow = Date.now();
    if (mapBoardWindow && msNow - mapBoardWindow.ms < 8000) { //recent Board window. depends on UPDATE_STEP
        var tabid = mapBoardWindow.tabid;

        //verify the tab is alive and well
        chrome.tabs.get(tabid, function (tab) {
            var idBoardCur = null;
            if (tab)
                idBoardCur = getIdBoardFromUrl(tab.url);

            if (idBoardCur != idBoard)
                openBoardAsUrl();
            else {
                //first select the window. else chrome can get weird about selecting the tab while the window is not active
                chrome.windows.update(tab.windowId, { focused: true }, function (window) {
                    if (!window)
                        openBoardAsUrl();
                    else {
                        //finally, select the tab
                        chrome.tabs.update(tabid, { active: true, highlighted: true }, function (tab) {
                            var idBoardCur = null;
                            if (tab)
                                idBoardCur = getIdBoardFromUrl(tab.url);

                            if (idBoardCur != idBoard)
                                openBoardAsUrl();
                        });
                    }
                });
            }
        });
    } else {
        openBoardAsUrl();
    }
}

function makeTimerPopupWindow(notificationId, bMinimized) {
    if (!notificationId || notificationId.indexOf(g_prefixTimerNotification) != 0)
        return;
    var marginSafety = 20;
    var width = 240;
    var height = 88;
    var topPos = (isTaskbarBottom() ? Math.max(0, window.screen.availHeight - height - marginSafety) : 0);
    var leftPost = Math.max(0, window.screen.availWidth - width - marginSafety);
    var idCard = idCardFromIdNotification(notificationId);
    var data = g_mapTimerWindows[idCard];
    if (!data)
        return;
    data.bClosedByUser = false;
    chrome.windows.create({
        url: chrome.extension.getURL("timerwin.html") + "?idCard=" + idCard + "&nameCard=" + encodeURIComponent(data.nameCard) +
            "&nameBoard=" + encodeURIComponent(data.nameBoard)+"&minimized="+(bMinimized?"1":"0"), width: width, height: height, type: "popup", left: leftPost, top: topPos
    },
    function (window) {
        if (window) {
            var map = g_mapTimerWindows[idCard];
            if (map)
                map.idWindow = window.id;

        } 
    }
    );
}

function makeCardPopupWindow(idCard, pos, cardPopupType) {
    assert(cardPopupType != CARDPOPUPTYPE.NO_POPUP);
    var marginSafety = 20;
    var width = 329;
    var height = 224;
    if (cardPopupType == CARDPOPUPTYPE.POPUP_NOACTIONS)
        height = 183;
    var topPos = window.screen.availHeight/2;
    var leftPost = screen.availWidth/2;
    if (pos) {
        topPos = pos.y-100;
        leftPost = pos.x-100;
    }

    var idWindow = g_mapCardToMiniPopupWindow[idCard];

    if (!idWindow)
        create();
    else
        caseWindow();

    function caseWindow() {
        chrome.windows.get(idWindow, null, function (window) {
            if (chrome.runtime.lastError || !window) {
                if (idWindow == g_mapCardToMiniPopupWindow[idCard]) {
                    delete g_mapCardToMiniPopupWindow[idCard];
                    create();
                }
            } else {
                chrome.windows.update(idWindow, { focused: true }, function (window) {
                    
                });
            }
        });
    }

    function create() {
        const lsprop_shownCardMiniMePopup = "shownCardMiniMePopup";
        if (!localStorage[lsprop_shownCardMiniMePopup]) {
            localStorage[lsprop_shownCardMiniMePopup] = true;
            handleShowDesktopNotification({
                notification: "See Plus Preferences to control mini-me card popups.",
                timeout: 9000
            });
        }
        chrome.windows.create({
            url: chrome.extension.getURL("cardwin.html") + "?idCard=" + idCard + "&cpt=" + cardPopupType,
            width: width, height: height, type: "popup", left: leftPost, top: topPos
        },
        function (window) {
            if (window) {
                g_mapCardToMiniPopupWindow[idCard] = window.id;
            }
        }
        );
    }
}


function handleOfflineBoardNotificationClick(notificationId) {
    var parts = notificationId.split(":");
    var idBoard = parts[1];
    var urlGo = chrome.extension.getURL("report.html") + "?groupBy=idCardH&idBoard=" + encodeURIComponent(idBoard);
    window.open(urlGo, "_blank");
    chrome.notifications.clear(notificationId, function (bWasCleared) { });
}

function handleOfflineCardNotificationClick(notificationId) {
    var parts = notificationId.split(":");

    var idBoard = parts[1];
    var idCard = parts[2];

    handleOpenDB(null, function (responseOpen) {
        if (responseOpen.status != STATUS_OK) {
            return;
        }

        var request = { sql: "SELECT idBoard,name,bArchived,bDeleted FROM cards WHERE idCard=?", values: [idCard] };
        handleGetReport(request,
            function (responseReport) {
                if (responseReport.status == STATUS_OK && responseReport.rows.length > 0) {
                    var row = responseReport.rows[0];
                    idBoard = row.idBoard;
                    var urlGo = chrome.extension.getURL("report.html") + "?groupBy=idCardH&idBoard=" + encodeURIComponent(idBoard) + "&idBoard=" + encodeURIComponent(idBoard) + "&orderBy=posList&idCardSelect=" + encodeURIComponent(idCard);
                    if (row.bArchived)
                        urlGo += "&archived=-1";
                    if (row.bDeleted)
                        urlGo += "&deleted=-1";
                    window.open(urlGo, "_blank");
                    chrome.notifications.clear(notificationId, function (bWasCleared) { });
                }
            });
    });
}

function hookNotificationActions() {
    if (g_bHookedNotificationsButton)
        return;
    g_bHookedNotificationsButton = true;

    chrome.notifications.onClicked.addListener(function (notificationId) {
        if (!notificationId)
            return;

        if (notificationId.indexOf(g_prefixTimerNotification) == 0) {
            handleNotifClick(notificationId);
        }
        else if (notificationId.indexOf(g_prefixOfflineBoardNotification) == 0) {
            handleOfflineBoardNotificationClick(notificationId);
        }
        else if (notificationId.indexOf(g_prefixOfflineCardNotification) == 0) {
            handleOfflineCardNotificationClick(notificationId);
        }
    });

    chrome.notifications.onClosed.addListener(function (notificationId, byUser) {
        if (byUser || !notificationId || notificationId.indexOf(g_prefixTimerNotification) != 0)
            return; //some notifications are not timers

        var idCard = idCardFromIdNotification(notificationId);
        var data = g_mapTimerWindows[idCard];
        if (!data.bClosedByUser)
            makeTimerPopupWindow(notificationId,false);
    });

    chrome.notifications.onButtonClicked.addListener(function (notificationId, buttonIndex) {
        makeTimerPopupWindow(notificationId, true);
    });
}

var g_prefixTimerNotification = "timer:";
var g_prefixOfflineBoardNotification = "openBoardReport:";
var g_prefixOfflineCardNotification = "openCardReport:";
function idNotificationForTimer(idCard) { 
    return g_prefixTimerNotification + idCard;
}

function idCardFromIdNotification(idNotification) {
    assert(idNotification.indexOf(g_prefixTimerNotification) == 0);
    return idNotification.substring(g_prefixTimerNotification.length);
}

var g_intervalTimerNotifications = null;
var g_cTimerUpdates = 0;

function handleTimerNotificationsUpdate() {
    if (!g_intervalTimerNotifications)
        g_intervalTimerNotifications = setInterval(updateTimerNotifications, 1000);
    updateTimerNotifications();

    function updateTimerNotifications() {
        chrome.notifications.getAll(function (notifications) {
            var cUpdated = 0;
            for (var idNotification in notifications) {
                if (!idNotification || idNotification.indexOf(g_prefixTimerNotification) != 0)
                    continue;
                updateTimerNotification(idNotification);
                cUpdated++;
                g_cTimerUpdates++;
            }
            if (cUpdated == 0 && g_intervalTimerNotifications) {
                clearInterval(g_intervalTimerNotifications);
                g_intervalTimerNotifications = null;
            }
        });
    }

    function updateTimerNotification(idNotification) {
        var idCard = idCardFromIdNotification(idNotification);
        var hash = getCardTimerSyncHash(idCard);
        getCardTimerData(hash, function (objTimer) {
            var stored = objTimer.stored;
            var map = g_mapTimerWindows[idCard];
            if (!map)
                return;

            if (stored === undefined || stored.msStart == null || stored.msEnd != null) {
                map.bClosedByUser = true;
                chrome.notifications.clear(idNotification, function (bWasCleared) { });
            }
            else {
                var notification = chrome.notifications.update(idNotification,
                    {
                        title: getTimerElemText(stored.msStart, Date.now(), false, false),
                        buttons: [{ title: g_cTimerUpdates>2?"":"Minimize", iconUrl: chrome.extension.getURL("images/minimize.png") }]
                    }, function (notificationId) {
                       
                    }
                    );
            }
        });
    }
}

function createChromeNotification(idNotification, obj, callback) {
    var notification = null;

    try {
        notification = chrome.notifications.create(idNotification, obj, callback);
    } catch (e) {
        if (obj.requireInteraction && e.message && e.message.indexOf("requireInteraction")>=0) {
            delete obj.requireInteraction; //workarround for old versions of chrome
            notification = chrome.notifications.create(idNotification, obj, callback);
        } else {
            throw e;
        }
    }
    return notification;
}

function showTimerWindowAsNotification(idCard, nameCard, nameBoard) {
    hookNotificationActions();
    g_mapTimerWindows[idCard] = { idWindow: null, nameCard: nameCard, nameBoard: nameBoard };
    var idNotification = idNotificationForTimer(idCard);
    var notification = createChromeNotification(idNotification,
        {
            type: "basic",
            isClickable:true,
            iconUrl: chrome.extension.getURL("images/timer-sm-on.png"),
            appIconMaskUrl: chrome.extension.getURL("images/icon32alpha.png"),
            title: "00:00:00s",
            message: nameCard,
            contextMessage:strTruncate(nameBoard, 40),
            requireInteraction: true,
            buttons: [{ title: "Minimize", iconUrl: chrome.extension.getURL("images/minimize.png")}]
        }, function (notificationId) {
            handleTimerNotificationsUpdate();
            }
        );
}

function doShowTimerWindow(idCard, callbackParam) {
    
    var data = g_mapTimerWindows[idCard];
    var bCalledCallback = false;

    function callback(status, properties) {
        if (bCalledCallback)
            return;
        bCalledCallback = true;
        if (callbackParam)
            callbackParam(status, properties);
    }

    if (data === undefined)
        create(idCard);
    else if (data.idWindow) {
        caseWindow(data.idWindow);
    } else {
        caseNotification();
    } 

    function caseWindow(idWindow) {
        chrome.windows.get(idWindow, null, function (window) {
            if (chrome.runtime.lastError || !window) {
                data = g_mapTimerWindows[idCard];
                if (!data || data.idWindow === idWindow) {
                    delete g_mapTimerWindows[idCard];
                    create(idCard);
                } else {
                    callback(STATUS_OK, { bExisted: true, bMinimized: (data.idWindow!=null) });
                }
            } else {
                callback(STATUS_OK, { bExisted: true, bMinimized: true });
            }
        });
    }

    function caseNotification() {
        var idNotification = idNotificationForTimer(idCard);
        chrome.notifications.getAll(function (notifications) {
            if (!notifications[idNotification]) {
                delete g_mapTimerWindows[idCard];
                create(idCard);
            } else {
                callback(STATUS_OK, { bExisted: true, bMinimized: false});
            }
        });
    }

    function create(idCard) {
        handleOpenDB(null, function (responseOpen) {
            if (responseOpen.status != STATUS_OK) {
                callback(responseOpen.status);
                return;
            }
            var request = { sql: "SELECT cards.name as nameCard, boards.name as nameBoard FROM cards JOIN boards on cards.idBoard=boards.idBoard WHERE idCard=?", values: [idCard] };
            handleGetReport(request,
                function (responseReport) {
                    if (responseReport.status != STATUS_OK) {
                        callback(responseReport.status);
                        return;
                    }
                    var nameCard = null;
                    var nameBoard = null;
                    if (responseReport.rows.length == 0) {
                        nameCard = "card not synced yet";
                        nameBoard = "";
                    }
                    else {
                        nameCard = responseReport.rows[0].nameCard;
                        nameBoard = responseReport.rows[0].nameBoard;
                    }

                    if (g_mapTimerWindows[idCard]) {
                        //very hard (impossible?) to happen, but it takes time (open db, make report) since last map check. windows could have been created from a previous request.
                        callback(STATUS_OK, { bExisted: true, bMinimized: (g_mapTimerWindows[idCard].idWindow!=null) });
                        return;
                    }

                    showTimerWindowAsNotification(idCard, nameCard, nameBoard);
                    callback(STATUS_OK, { bExisted: false, bMinimized: false });
                    return;
                });
        });
    }
}

var g_bSignedIn = false;


//note: ntofications are done from background from here so they work correctly when navigating during notification, and chrome has them preaproved
var g_strLastNotification = "";
var g_dtLastNotification = null;
var g_mapNotificationToTimeoutClose = {};

function handleShowDesktopNotification(request) {
	var dtNow = new Date();
	var dtDiff = 0;
	var idUse = request.idUse || request.notification || "";
	if (g_dtLastNotification != null) {
		if (dtNow.getTime() - g_dtLastNotification.getTime() < 2500 && g_strLastNotification == request.notification)
		    return idUse; //ignore possible duplicate notifications
	}
	g_dtLastNotification = dtNow;
	g_strLastNotification = request.notification;
	var timeout = request.timeout || 5000;

	if (request.dontClose)
	    timeout = 0;
	function clearPendingTimeout() {
	    if (g_mapNotificationToTimeoutClose[idUse]) {
	        clearTimeout(g_mapNotificationToTimeoutClose[idUse]);
	        g_mapNotificationToTimeoutClose[idUse] = null;
	    }
	}

	clearPendingTimeout();
	createChromeNotification(idUse,
        {
            type:"basic",
            iconUrl: chrome.extension.getURL("images/icon128.png"),
            title: 'Plus for Trello',
            message: request.notification,
            requireInteraction: true
        }, function (notificationId) {
            if (timeout) {
                clearPendingTimeout();
                var timeoutLast = null;
				timeoutLast=setTimeout(function () {
                    if (g_mapNotificationToTimeoutClose[idUse] === timeoutLast)
                        g_mapNotificationToTimeoutClose[idUse] = null;
                    chrome.notifications.clear(notificationId, function (wasCleared) { });
                }, timeout);
                g_mapNotificationToTimeoutClose[idUse] = timeoutLast;
            }
        });
    return idUse;
}


function handleCreateSs(sendResponse) {
    var url = null;
    var postData = null;
    if (false) { //no longer works with the stricter drive.file permission
        postData = {title:"Plus for Trello sync spreadsheet",description:"Do NOT modify this spreadsheet"};
        url = "https://www.googleapis.com/drive/v2/files/1-C2J31LslVj-AlB9PJP-68ADhK5gpx0o5PKGZE_kxvM/copy";
        handleApiCall(url, {convert:false, ocr:false}, true, function (response) {
            var id = null;
            if (response.data && response.data.id)
                id = response.data.id;
            if (id == null)
                response.status = "Unknown error creating spreadsheet";

           sendResponse({ status: response.status, id: id });
        }, JSON.stringify(postData), "application/json");
    }
    else {
        url = "https://www.googleapis.com/drive/v2/files";
        postData = {
            'mimeType': 'application/vnd.google-apps.spreadsheet',
            'title': 'Plus for Trello sync spreadsheet'
        };
        handleApiCall(url, {}, true, function (response) {
            var id = null;
            if (response.data && response.data.id)
                id = response.data.id;
            if (id == null && response.status == STATUS_OK)
                response.status = "Unknown error creating spreadsheet";

            if (response.status != STATUS_OK)
                sendResponse({ status: response.status, id: null });
            else
                handleConfigNewSs(id, gid_to_wid(0), sendResponse);
        }, JSON.stringify(postData), "application/json");
    }
}

function handleConfigNewSs(idSs, wid, sendResponse) {
	//write ss header
	var row = 1;
	var i = 0;
	var data = ["date", "board", "card", "spenth", "esth", "who", "week", "month", "comment", "cardurl", "idtrello"];
	var url = 'https://spreadsheets.google.com/feeds/cells/' + idSs + '/' + wid + '/private/full';
	var atom = '<feed xmlns="http://www.w3.org/2005/Atom" \
	xmlns:batch="http://schemas.google.com/gdata/batch" \
	xmlns:gs="http://schemas.google.com/spreadsheets/2006"> \
<id>'+ url + '</id>';
	for (; i < data.length; i++) {
		atom += makeCellBatchEntry(idSs, wid, 1, i + 1, data[i]);
	}
	atom += '</feed>';
	url += '/batch';
	handleApiCall(url, {}, true, function (response) {
		if (response.data && response.data.toLowerCase().indexOf("error") >= 0) {
			idSs = null; //review zig: should delete the spreadsheet
			response.status = "unknown spreadsheet write error";
		}
		sendResponse({ status: response.status, id: idSs });
	}, atom, null, true);
}


function makeCellBatchEntry(idSs, wid, row, column, value) {
	var feedUrl = "https://spreadsheets.google.com/feeds/cells/" + idSs + "/" + wid + "/private/full/R" + row + "C" + column;
	var ret = '\
<entry>\
<batch:id>A'+ row + '-' + column + '</batch:id> \
<batch:operation type="update"/> \
<id>'+ feedUrl + '</id> \
<link rel="edit" type="application/atom+xml" \
href="'+ feedUrl + '/version"/> \
<gs:cell row="'+ row + '" col="' + column + '" inputValue="' + value + '"/> \
</entry>';
	return ret;
}


function handleApiCall(url, params, bRetry, sendResponse, postBody, contentType, bAddIfMatchStar) {
	if (chrome.identity === undefined) {
		sendResponse({ status: "Please sign-in to Chrome from its top-right menu." });
		return;
	}

	getExtensionOauthToken("To continue, approve the Google permissions. If not signed-in to Chrome, do so now.",
        ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive.file"], function (token) {
	    
		if (token) {
			onAuthorized(url, params, sendResponse, token, bRetry, postBody, contentType, bAddIfMatchStar);
		} else {
		    var message = "";
		    if (chrome.runtime.lastError)
		        message = chrome.runtime.lastError.message;
		    sendResponse({ status: "Not signed into Chrome, network error or no permission.\n" + message });
		}
	});
}


function stringifyParams(parameters) {
	var params = [];
	for (var p in parameters) {
		params.push(encodeURIComponent(p) + '=' +
					encodeURIComponent(parameters[p]));
	}
	return params.join('&');
}

function handleGetPlusFeed(msLastPostRetrieved, sendResponse) {
	var xhr = new XMLHttpRequest();
	xhr.onreadystatechange = function (event) {
		if (xhr.readyState == 4) {
			var statusRet = STATUS_OK;
			var obj = null;

			if (xhr.status == 200 && xhr.responseText !== undefined && xhr.responseText != "") {
			    try {
			        obj = JSON.parse(xhr.responseText);
			    } catch (e) {
			    }
			}
			if (obj == null) {
				sendResponse({ status: "error" });
				return;
			}

			var i = 0;
			var msDateMax = 0;
			var itemsRet = [];
			if (obj.length && obj.length > 0) {
			    var dateParsed = new Date(obj[0].date);
			    msDateMax = dateParsed.getTime();
			}
			sendResponse({ status: STATUS_OK, items: itemsRet, msLastPostRetrieved: msDateMax });
			return;
		}
	};
    //get the date of the last created card in the Plus for Trello public board https://trello.com/b/OpVbnPB4/plus-for-trello-public-board list "News"
	var url = "https://trello.com/1/lists/588790142d87061b84b7353c/actions?filter=createCard&fields=date&limit=1&memberCreator=false";

	xhr.open("GET", url, true);
	xhr.send();
}

var g_bRetryAuth = true;

function onAuthorized(url, params, sendResponse, oauth, bRetry, postBody, contentType, bAddIfMatchStar) {
	if (contentType === undefined || contentType == null)
		contentType = "application/atom+xml";
	var method = postBody ? 'POST' : 'GET';
	var paramsOriginal = JSON.parse(JSON.stringify(params)); //clone
	var xhr = new XMLHttpRequest();
	xhr.onreadystatechange = function (event) {
		if (xhr.readyState == 4) {
		    var statusRet = STATUS_OK;
			if (bRetry && xhr.status == 401 && (
					xhr.statusText.indexOf("Token revoked") == 0 ||
					xhr.statusText.indexOf("Token invalid") == 0 ||
					xhr.statusText.indexOf("Unauthorized") == 0)) { //"Unauthorized" can happen if user removes token from https://accounts.google.com/IssuedAuthSubTokens
				//refresh oauth tokens
			    if (g_bRetryAuth && confirm("Unable to authenticate with Google.\n\nNOTE: If you want to disable Google Sync go to Plus Help, Sync and select 'sync off'.\n\nRetry authentication?")) {
			        chrome.identity.removeCachedAuthToken({ token: oauth }, function () {
			            handleApiCall(url, paramsOriginal, false, sendResponse, postBody, contentType, bAddIfMatchStar);
			        });
			    }
			    else {
			        g_bRetryAuth = false;
			        sendResponse({ status: "You are not authenticated with Google." });
			    }

				return;
			} else {
				var data = null;
				if (xhr.status < 200 || xhr.status > 207) {
				    if (xhr.status == 403)
				        statusRet = "No spreadsheet permission to " + (postBody ? "write." : "read.");
				    else
				        statusRet = errFromXhr(xhr);
				    console.error("Plus Oauth unusual. status: " + xhr.status + ". statusText: " + xhr.statusText);
					sendResponse({ status: statusRet });
					return;
				}

				var bJson = (xhr.responseText && xhr.responseText.length>0 && "{" == xhr.responseText.charAt(0));

				if (bJson) {
					try {
						data = JSON.parse(xhr.responseText);
					}
					catch (e) {
					}
				} else
					data = xhr.responseText;
				if (bJson && data == null) {
					sendResponse({ status: "Unknown error." });
				}
				else
					sendResponse({ data: data, status: STATUS_OK });
			}
		}
	};
	xhr.open(method, url + '?' + stringifyParams(params), true);

	xhr.setRequestHeader('GData-Version', '3.0');
	xhr.setRequestHeader('Content-Type', contentType);
	xhr.setRequestHeader('Cache-Control', 'no-cache');
	if (oauth) //oauth not used for reading/writting a public spreadsheet
	    xhr.setRequestHeader('Authorization', 'Bearer ' + oauth);
	if (bAddIfMatchStar)
		xhr.setRequestHeader('If-Match', '*');
	xhr.send(postBody);
}

function getCurrentSyncName() {
    var name = "";
    if (g_bDisableSync || (g_strServiceUrl == "" && !g_optEnterSEByComment.IsEnabled())) //same as !helpWin.isSyncEnabled()
        name = "sync-disabled"; //SYNCMETHOD.disabled;
    else if (g_optEnterSEByComment.IsEnabled()) {
        name = "sync-cardcomments"; //SYNCMETHOD.trelloComments;
    }
    else {
        if (g_bStealthSEMode)
            name = "sync-stealth"; //SYNCMETHOD.googleSheetStealth;
        else
            name = "sync-legacy"; //SYNCMETHOD.googleSheetLegacy;
    }
    return name;
}

function handleHitAnalyticsEvent(category, action, bIncludeVersion, bSkipNewbie) {
    if (bSkipNewbie) {
        var msDelta = Date.now() - g_msStartPlusUsage;
        if (msDelta < 1000 * 60 * 60 * 4)
            return;
    }
    g_analytics.hit({ t: "event", ec: category, ea: (bIncludeVersion? chrome.runtime.getManifest().version + ": " : "") + action }, 1000);
}

var g_analytics = {
    idGlobalAnalytics: "UA-72924905-1",
    idAnalytics: null,
    PROP_IDANALYTICS: "idAnalytics",
    PROP_DISABLEANALYTICS: "bDisableAnalytics",
    bDisableAnalytics: false,
    setDisabled: function (bDisabled) {
        if (bDisabled)
            localStorage[this.PROP_DISABLEANALYTICS] = "true";
        else
            delete localStorage[this.PROP_DISABLEANALYTICS];
        this.bDisableAnalytics = bDisabled;
    },
    init: function () {
        if (this.idAnalytics)
            return;

        this.idAnalytics = localStorage[this.PROP_IDANALYTICS];
        this.bDisableAnalytics = (localStorage[this.PROP_DISABLEANALYTICS] == "true");
        if (!this.idAnalytics) {
            this.idAnalytics = this.generateQuickGuid();
            localStorage[this.PROP_IDANALYTICS] = this.idAnalytics;
        }
    },
    hit: function (params, msDelay) {
        if (isTestVersion())
            return;

        if (this.bDisableAnalytics)
            return;
        msDelay = msDelay || 1000;
        this.init();
        var payload = "v=1&tid=" + this.idGlobalAnalytics + "&cid=" + encodeURIComponent(this.idAnalytics);
        for (var p in params) {
            payload = payload + "&" + p + "=" + encodeURIComponent(params[p]);
        }
        const PROP_LS_CD1LAST = "CD1LAST";
        const keySyncOutsideTrello = "bSyncOutsideTrello";
        const bAlwaysSendCD = true; //review: somehow analytics is losing custom properties, so trying to always send them to see if it fixes it. 2017-06-07
        var valCD1Prev = localStorage[PROP_LS_CD1LAST] || "";
        var valCD1Cur = (g_bProVersion ? "Pro" : "Basic");
        if (bAlwaysSendCD || valCD1Prev != valCD1Cur) //analytics docs recommend to only send the parameter when it changed, for performance.
            payload = payload + "&cd1=" + valCD1Cur;

        chrome.storage.sync.get([SYNCPROP_NO_SE, SYNCPROP_NO_EST, SYNCPROP_LIDATA, SYNCPROP_LIDATA_STRIPE, keySyncOutsideTrello], function (obj) {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError.message);
                return;
            }

            var liData = obj[SYNCPROP_LIDATA];
            var liDataStripe = obj[SYNCPROP_LIDATA_STRIPE];
            const PROP_LS_CD2LAST = "CD2LAST"; //licence & buy attempt count
            const PROP_LS_CD3LAST = "CD3LAST"; //sync method
            const PROP_LS_CD4LAST = "CD4LAST"; //background sync
            const PROP_LS_CD5LAST = "CD5LAST"; //keywords count (multiple keywords)
            const PROP_LS_CD6LAST = "CD6LAST"; //units
            const PROP_LS_CD7LAST = "CD7LAST"; //SYNCPROP_NO_SE
            const PROP_LS_CD8LAST = "CD8LAST"; //SYNCPROP_NO_EST

            var valCD2Prev = localStorage[PROP_LS_CD2LAST] || "";
            var cViewedBuyDialog = localStorage[PROP_LS_cViewedBuyDialog] || "0";
            var valCD2Cur = (liData && liData.li ? "ActiveCS" : (liDataStripe && liDataStripe.li ? "ActiveStripe" : "Inactive")) + "-" + cViewedBuyDialog;
            if (bAlwaysSendCD || valCD2Prev != valCD2Cur)
                payload = payload + "&cd2=" + valCD2Cur;

            var valCD3Prev = localStorage[PROP_LS_CD3LAST] || "";
            var valCD3Cur = getCurrentSyncName();
            if (bAlwaysSendCD || valCD3Prev != valCD3Cur)
                payload = payload + "&cd3=" + valCD3Cur;

            var valCD4Prev = localStorage[PROP_LS_CD4LAST] || "";
            var valCD4Cur = obj[keySyncOutsideTrello] ? "true" : "false";
            if (bAlwaysSendCD || valCD4Prev != valCD4Cur)
                payload = payload + "&cd4=" + valCD4Cur;

            var valCD5Prev = localStorage[PROP_LS_CD5LAST] || "";
            var valCD5Cur = g_optEnterSEByComment.getAllKeywordsExceptLegacy().length.toString();
            if (bAlwaysSendCD || valCD5Prev != valCD5Cur)
                payload = payload + "&cd5=" + valCD5Cur;

            var valCD6Prev = localStorage[PROP_LS_CD6LAST] || "";
            var valCD6Cur = UNITS.current;
            if (bAlwaysSendCD || valCD6Prev != valCD6Cur)
                payload = payload + "&cd6=" + valCD6Cur;

            var valCD7Prev = localStorage[PROP_LS_CD7LAST] || "";
            var valCD7Cur = obj[SYNCPROP_NO_SE]? "true" : "false";
            if (bAlwaysSendCD || valCD7Prev != valCD7Cur)
                payload = payload + "&cd7=" + valCD7Cur;

            var valCD8Prev = localStorage[PROP_LS_CD8LAST] || "";
            var valCD8Cur = obj[SYNCPROP_NO_EST]? "true" : "false";
            if (bAlwaysSendCD || valCD8Prev != valCD8Cur)
                payload = payload + "&cd8=" + valCD8Cur;

            setTimeout(function () {
                var xhr = new XMLHttpRequest();
                var url = "https://ssl.google-analytics.com/collect";

                xhr.onreadystatechange = function (e) {
                    if (xhr.readyState == 4 && xhr.status == 200) {
                        if (valCD1Prev != valCD1Cur)
                            localStorage[PROP_LS_CD1LAST] = valCD1Cur;

                        if (valCD2Prev != valCD2Cur)
                            localStorage[PROP_LS_CD2LAST] = valCD2Cur;

                        if (valCD3Prev != valCD3Cur)
                            localStorage[PROP_LS_CD3LAST] = valCD3Cur;

                        if (valCD4Prev != valCD4Cur)
                            localStorage[PROP_LS_CD4LAST] = valCD4Cur;

                        if (valCD5Prev != valCD5Cur)
                            localStorage[PROP_LS_CD5LAST] = valCD5Cur;

                        if (valCD6Prev != valCD6Cur)
                            localStorage[PROP_LS_CD6LAST] = valCD6Cur;
                    }
                };

                xhr.open("POST", url, true);
                //xhr.setRequestHeader("Content-length", payload.length); //unsafe in chrome
                xhr.send(payload);
            }, msDelay);
        });


    },
    //private
    generateQuickGuid: function () {
        //http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
        return Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
    }
};

var g_bInstalledHeadersRequest = false;
var g_bInjectedTrelloFrame = false;

function handleHeadersReceived(info) {
    var headers = info.responseHeaders;
    if (g_bInjectedTrelloFrame) {
        for (var i = headers.length - 1; i >= 0; --i) {
            var header = headers[i].name.toLowerCase();
            if (header == 'x-frame-options' || header == 'frame-options') {
                headers.splice(i, 1); // Remove header
                setTimeout(function () {
                    uninjectTrelloFrame();
                }, 30000); //ait at maximum this time
            }
        }
    }
    return { responseHeaders: headers };
}

function uninjectTrelloFrame() {
    var parent = document.getElementById("parentTrelloIFrameAuth");
    while (parent.firstChild)
        parent.removeChild(parent.firstChild);
    g_bInjectedTrelloFrame = false;
    if (g_bInstalledHeadersRequest) {
        chrome.webRequest.onHeadersReceived.removeListener(handleHeadersReceived);
        g_bInstalledHeadersRequest = false;
    }
}

function injectTrelloFrame() {
    if (!g_bInstalledHeadersRequest) {
        chrome.webRequest.onHeadersReceived.addListener(handleHeadersReceived,
            {
                urls: ['https://trello.com/b/nC8QJJoZ*'],
                types: ['sub_frame']
            },
            ['blocking', 'responseHeaders']);
        g_bInstalledHeadersRequest = true;
    }

    var link = "https://trello.com/b/nC8QJJoZ/trello-development-roadmap";
    var iframe = document.createElement('iframe');
    iframe.frameBorder = 0;
    iframe.width = "300px";
    iframe.height = "250px";
    iframe.id = "trelloiframe";
    iframe.setAttribute("src", link);
    var parent = document.getElementById("parentTrelloIFrameAuth");
    while (parent.firstChild)
        parent.removeChild(parent.firstChild);
    parent.appendChild(iframe);
    g_bInjectedTrelloFrame = true;
}

var g_mapCardToMiniPopupWindow = {};
var g_mapCardToTab = {}; //we keep this map to know which tab has which card currently open. This method works without needing to add the "tabs" permission to the extension.
var g_mapBoardToTab = {}; //we keep this map to know which tab has which card currently open. This method works without needing to add the "tabs" permission to the extension.

function handlenotifyCardTab(idCard, tabid) {
    g_mapCardToTab[idCard] = {tabid: tabid, ms: Date.now() };
}

function handlenotifyBoardTab(idBoard, tabid) {
    g_mapBoardToTab[idBoard] = { tabid: tabid, ms: Date.now() };
}


/* handleCheckLi
 * can return in status:
 * STATUS_OK
 * "hasLicense" : the user already had an active license.
 * "TOKEN_MISSING_ERROR" : user is not signed-in to Chrome
 * other random errors that Chome might return
**/
function handleCheckLi(sendResponse) {

    function respond(status) {
        console.log("handleCheckLi respond: " + status);
        sendResponse({ status: status });
    }

    //Note: store api does not require this getAuthToken. its an attempt to fix many errors when users try to pay
    getExtensionOauthToken("To continue, approve the Chrome Web Store permissions. If not signed-in to Chrome, do so now.",
        ["https://www.googleapis.com/auth/chromewebstore.readonly"], function (token) {
        if (token) {
            checkPurchased(false);
            return;
        } else {
            var message = "";
            if (chrome.runtime.lastError)
                message = chrome.runtime.lastError.message;
            if (!message)
                message = "Not signed-in to Chrome, or no permission for the Chrome webstore.";
            handleShowDesktopNotification({
                notification: message, timeout: 10000
            });
        }
    });
    

    function BLastErrorDetected() {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError.message);
            handleShowDesktopNotification({
                notification: "Error: "+chrome.runtime.lastError.message,
                timeout: 10000
            });  
            return true;
        }
        return false;
    }

    function checkPurchased(bJustPurchased, strErrorCustom, licCustom, onError) {
        //onError is used to let the caller retry (as it usually expects the license to be there)
        google.payments.inapp.getPurchases({
            'parameters': { 'env': 'prod' },
            'success': onLicenseUpdate,
            'failure': onLicenseUpdateFail
        });

        function onLicenseUpdateFail(data) {
            console.log("onLicenseUpdateFail");
            var strError = "onLicenseUpdateFail:" + JSON.stringify(data);
            console.error(strError);
            handleHitAnalyticsEvent("LicActivation", strError, true);
            if (onError)
                onError();
            else {
                if (data && data.response && data.response.errorType == "TOKEN_MISSING_ERROR") //user is not signed-in
                    strError = data.response.errorType; 
                respond(strError);
            }
            return;
        }

        function onLicenseUpdate(data) {
            console.log("onLicenseUpdate");
            var licenses = data.response.details;
            var count = licenses.length;
            var liData = { msLastCheck: Date.now(), msCreated:0, li: "" };
            for (var i = 0; i < count; i++) {
                var license = licenses[i];
                if (license.sku == 'plus_pro_single' && license.state == "ACTIVE") {
                    liData.msCreated = parseInt(license.createdTime, 10);
                    liData.li = licCustom || license.itemId;
                }
            }

            if (onError && !liData.li) {
                onError();
                return;
            }

            var objNew = {};
            objNew[SYNCPROP_LIDATA] = liData;
            chrome.storage.sync.set(objNew, function () {
                //ok if fails 
                if (BLastErrorDetected())
                    console.error(chrome.runtime.lastError.message);
                if (!liData.li) {
                    if (bJustPurchased)
                        respond(strErrorCustom || "Purchase failed");
                    else
                        doPurchase();
                }
                else {
                    respond(bJustPurchased? STATUS_OK : "hasLicense");
                    return;
                }
            });
        }
    }

    function doPurchase() {
        var cViewed = localStorage[PROP_LS_cViewedBuyDialog];
        if (cViewed)
            cViewed = parseInt(cViewed,10) || 0;
        else
            cViewed = 0;
        cViewed++;
        localStorage[PROP_LS_cViewedBuyDialog]=cViewed.toString();
        //note this window is not modal. In theory the user could leave it open an cause re-entry. callers check not to overwrite storage based on msLastCheck
        google.payments.inapp.buy({
            'parameters': { 'env': 'prod' },
            'sku': 'plus_pro_single',
            'success': onPurchased,
            'failure': onPurchaseFail
        });

        function onPurchaseFail(data) {
            var strError = "onPurchaseFail";
            var licCustom = null;
            if (data && data.response && data.response.errorType)
                strError = data.response.errorType;

            console.log("onPurchaseFail:");
            console.log(JSON.stringify(data));
            handleHitAnalyticsEvent("LicActivation", "onPurchaseFail: " + JSON.stringify(data), true);
            //http://stackoverflow.com/questions/38043180/
            //{"request":{},"response":{"errorType":"PURCHASE_CANCELED"}} when user cancels the window (and maybe in other cases)
            // {checkoutOrderId: "10370910874874185126.76a0c57c6ea342e79b0d9a97b91d29ee", integratorData: "EMeilfWBBQ=="}
            if (data && data.checkoutOrderId)
                licCustom = JSON.stringify(data);
            else {
                if (strError == "PURCHASE_CANCELED") {
                    respond(strError);
                    return;
                }
            }


            function showProgressNotification() {
                handleShowDesktopNotification({
                    notification: "Getting your license...Almost done!",
                    timeout: 5100
                });
            }

            showProgressNotification();
            setTimeout(function () { //take some API breath
                checkPurchased(true, strError, licCustom, function () {
                    showProgressNotification();
                    console.log("Retry checkPurchased.");
                    setTimeout(function () { //retry once: take some API breath
                        checkPurchased(true, strError, licCustom, null);
                    }, 5000);
                });
            }, 5000);
            
            return;
        }

        function onPurchased(data) {
            var liData = { msLastCheck: Date.now(), msCreated: 0, li: "" };
            console.log("onPurchased:");
            handleHitAnalyticsEvent("LicActivation", "onPurchased", true);
            console.log(JSON.stringify(data));
            if (data && data.response) {
                liData.msCreated = liData.msLastCheck;
                liData.li = data.response.orderId;
            }

            var objNew = {};
            objNew[SYNCPROP_LIDATA] = liData;
            chrome.storage.sync.set(objNew, function () {
                //ok if fails
                if (BLastErrorDetected())
                    console.error(chrome.runtime.lastError.message);
                respond(STATUS_OK);
                return;
            });
        }
    }
}

function handleReloadExtension() {
    setTimeout(function () {
        broadcastMessage({ event: EVENTS.EXTENSION_RESTARTING, status: STATUS_OK }, function () {
            chrome.runtime.reload();
        });
    }, 1000);
}


function getExtensionOauthToken(strNotification, scopes, callback) {
    
    var idWait = null;
    var bWaiting = true;
    setTimeout(function () {
        if (!bWaiting)
            return;
        idWait = handleShowDesktopNotification({
            notification: strNotification,
            timeout: 12000
        });
    }, 4000);

    chrome.identity.getAuthToken({ interactive: true, scopes: scopes }, function (token) {
        if (chrome.runtime.lastError)
            console.log(chrome.runtime.lastError.message);

        bWaiting = false;
        if (idWait)
            chrome.notifications.clear(idWait, function (wasCleared) { });

        if (token)
            callback(token);
        else {
            //since we removed explicit manifest permissions for webstore (and maybe others), we can get a "Authorization page could not be loaded"
            //but it is fixed by getting the token again.
            chrome.identity.getAuthToken({ interactive: false, scopes: scopes }, function (token) {
                callback(token);
            });
        }
    });
}