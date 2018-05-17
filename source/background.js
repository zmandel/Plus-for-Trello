/// <reference path="intellisense.js" />

var g_dataTotalSpentThisWeek = { str: null, weeknum: null };
var g_msSyncRateLimit = 1000 * 1; //1 second (used to be larger and more relevant back when syncing on spreadsheets with my developer key
var MSDELAY_FIRSTSYNC = 500;
var g_bOffline = false;
var g_cErrorSync = 0; //errors during sync period
var g_strTimerLast = "";
var g_idTimeoutTimer = null;
var PLUS_BACKGROUND_CALLER = true; //allows us to tell shared.js we are calling
var g_bInstalledNetworkDetection = false;
var g_bDetectTrelloNetworkActivity = false;
var g_cTrelloActivitiesDetected = 0;
var g_bLastPlusMenuIconError = false;  //remembers if the icon last drew the red error X
var g_mapTimerWindows = {};

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

// string to number
function wid_to_gid(wid) {
	return (parseInt(String(wid), 36) ^ 31578);
}

// number to string
function gid_to_wid(gid) {
	// (gid xor 31578) encoded in base 36
	return parseInt((gid ^ 31578), 10).toString(36);
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

function handleGetAllHashtags(sendResponse) {
    var request = { sql: "SELECT name FROM cards WHERE name LIKE '%#%' AND bDeleted=0 AND idBoard in (SELECT idBoard from Boards where bArchived=0)", values: [] };
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

function handlePequestProPermission(sendResponse) {
    chrome.permissions.request({
        permissions: ["alarms","gcm"],
        origins: ['http://www.plusfortrello.com/', 'https://www.plusfortrello.com/', 'https://ssl.google-analytics.com/']
    }, function (granted) {
        if (!granted) {
            sendResponse({ status: "error: permission not granted by the user." });
            return;
        }

        handleCheckChromeStoreToken(sendResponse);
    });
}

function handleGoogleSyncPermission(sendResponse) {
    chrome.permissions.request({
        permissions: [],
        origins: ['https://spreadsheets.google.com/']
    }, function (granted) {
        // The callback argument will be true if the user granted the permissions.
        sendResponse({ status: STATUS_OK, granted: granted || false });
    });
}

var g_idCardTimerLast = null;

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
                    setTimeout(function () {
                        //open the last active timer. do it a little later since chrome is just starting up
                        doShowTimerWindow(idCardTimer);
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

var g_loaderDetector = {
    initLoader: function () {
        var thisLocal = this;

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
            return;
        }

        setTimeout(function () { //avoid global dependencies. however, this timeout could cause content script to call before we are ready. in messaging we handle it.
            g_analytics.init();
            loadBackgroundOptions(function () {
                thisLocal.init();
                g_bPlusExtensionLoadedOK = true;
            });
        }, 1); //to force-test timing-related issues, change this 1 to a larger number so that other places will retry. those places also need larger setTimeouts to test.
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
                //attempt to recover from the first error wihin the sync period.
                setTimeout(function () {
                    checkNeedsSync(true);
                }, 5000);
            }
        }, 1000 * 5);


        //install network detection
        var intervalNetDetect=setInterval(function () {
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

        }, 4000);

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
                if (!bSyncOutsideTrello || g_bDisableSync)
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

        setTimeout(function () { checkNeedsSync(true); }, MSDELAY_FIRSTSYNC); //check right away
        setInterval(function () {
            checkNeedsSync(false);
            g_cErrorSync = 0; //reset counter
        }, 1000 * 60 * 10); // and every 10 minutes
    }
}.initLoader();

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
        updatePlusIconWorker(bTooltipOnly); //review zig: ugly workarround because code sets storage props and inmediately calls updatePlusIcon
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
            var tooltip = "Plus for Trello\n";

            if (bNew)
                tooltip = tooltip + "New S/E rows\n";
            
            if (g_dataTotalSpentThisWeek.str == null || g_strTimerLast.length>0)
                setIconBadgeText("", g_strTimerLast.length > 0);
            
            if (g_dataTotalSpentThisWeek.str)
                tooltip = tooltip + g_dataTotalSpentThisWeek.weeknum + ": " + g_dataTotalSpentThisWeek.str + " Spent \n\n";

            if (msplus_datesync_last !== undefined)
                tooltip = tooltip + "Last sync " + getTimeDifferenceAsString(msplus_datesync_last,true) + "\n";

            var syncStatus = "";
            if (g_cWriteSyncLock == 0 && g_cReadSyncLock == 0 && !g_syncStatus.bSyncing) {
                if (g_msRequestedSyncPause > 0) {
                    tooltip = tooltip + "Sync is paused until help is closed.\n";
                }
                if (statusLastSync)
                    syncStatus = buildSyncErrorTooltip(statusLastSync);
                tooltip = tooltip + syncStatus;
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

            if (g_bOffline)
                tooltip = tooltip + "\nChrome is offline.";
            chrome.browserAction.setTitle({ title: tooltip });
            var dateLastStatus = (statusLastSync && statusLastSync.date) || msNow;
            return (syncStatus.length ==0 || (msNow-dateLastStatus>1000*60*20)); //pretend there wasnt a sync error if its old (over 20 min)
        }

        var bErrorSync = !setTooltipSyncStatus();
        var ctx = null;
        var canvas = null;
        var dxCanvas = 0;
        var dyCanvas = 0;
        var rotation = g_rotation;

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
            //draw spent counter on top of chrome badge
            if (g_optAlwaysShowSpentChromeIcon == OPT_SHOWSPENTINICON_ALWAYS && g_strTimerLast.length > 0 && g_strBadgeText.length > 0) {
				//review zig: doesnt show offline/error visual status
                ctx.fillStyle = PLUS_COLOR_SPENTBADGE;
                ctx.strokeStyle = PLUS_COLOR_SPENTBADGE;
                ctx.font = "bold 8px Tahoma, Arial, sans-serif"; //tahoma is very readable at small sizes
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

            chrome.browserAction.setIcon({ imageData: ctx.getImageData(0, 0, 19, 19) });
        }
    });
}

var g_rgPorts = [];

function broadcastMessage(message) {
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
    var responseStatus = { bCalled: false };


    function sendResponse(obj) {
        try {
            if (sendResponseParam)
                sendResponseParam(obj);
        } catch (e) {
            if (e.message.indexOf("disconnected port object") < 0) //skip disconnected ports as the user may close a trello tab anytime
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
        else if (request.method == "getBoardsWithoutMe") {
            buildBoardsWithoutMe(function (response) {
                sendResponse(response);
            });
        }
        else if (request.method == "hitAnalyticsEvent") {
            handleHitAnalyticsEvent(request.category, request.action);
            sendResponse({ status: STATUS_OK });
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
            handlePequestProPermission(sendResponse);
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
        else if (request.method == "checkLoggedIntoChrome") {
            handleCheckLoggedIntoChrome(sendResponse);
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
                status="Invalid JSON text format.";
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
});

function handleCopyClipboard(html, sendResponse) {
    if (window.getSelection && document.createRange) {
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

        sendResponse({ status: STATUS_OK });
    }
    else {
        sendResponse({ status: "Cannot copy to clipboard." });
    }
}

function doShowTimerWindow(idCard) {
    var idWindow = g_mapTimerWindows[idCard];

    if (idWindow === undefined)
        create(idCard);
    else {
        chrome.windows.get(idWindow, null, function (window) {
            if (chrome.runtime.lastError || !window) {
                if (g_mapTimerWindows[idCard] === idWindow) {
                    delete g_mapTimerWindows[idCard];
                    create(idCard);
                }
            }
        });
    }

    function create(idCard) {
        handleOpenDB(null, function (responseOpen) {
            if (responseOpen.status != STATUS_OK) {
                return;
            }
            var request = { sql: "SELECT cards.name as nameCard, boards.name as nameBoard FROM cards JOIN boards on cards.idBoard=boards.idBoard WHERE idCard=?", values: [idCard] };
            handleGetReport(request,
                function (responseReport) {
                    if (responseReport.status != STATUS_OK)
                        return;
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
                        return;
                    }
                    chrome.windows.create({
                        url: chrome.extension.getURL("timerwin.html") + "?idCard=" + idCard + "&nameCard=" + encodeURIComponent(nameCard) +
                            "&nameBoard=" + encodeURIComponent(nameBoard), width: 205, height: 88, type: "panel"
                    },
                        function (window) {
                            if (window) {
                                if (g_mapTimerWindows[idCard]) {
                                    //disclaimer: in v3.1.7 there was a bug where sometimes a card timer window would show twice.
                                    //repro was to click on the timer button inside the chrome popup
                                    //the card would open with the board behind it. both cards and boards would ask for the timer window but there
                                    //already was code here to deal with it. I made other parts more robust but I have also added this final check
                                    //even though I dont think its needed anymore
                                    chrome.windows.remove(window.id);
                                    logPlusError("duplicate timer window removed");
                                }
                                else {
                                    g_mapTimerWindows[idCard] = window.id;
                                    if (!window.alwaysOnTop) {
                                        var heightNew = window.height + 12; //for the line showing panel instructions
                                        var widthNew = window.width + 40; //some OSs (win10) need more space for the max/restore/min win buttons
                                        chrome.windows.update(window.id, { height: heightNew, width: widthNew }); //grow to show panel enabling instructions
                                    }
                                }
                            }
                        });
                });
        });
    }
}

var g_bSignedIn = false;

/* review zig: enable when chrome adds this api to release channel, and re-test
chrome.identity.onSignInChanged.addListener(function(account, signedIn) {
	g_bSignedIn = signedIn;
});
*/

//note: ntofications are done from background from here so they work correctly when navigating during notification, and chrome has them preaproved
var g_strLastNotification = "";
var g_dtLastNotification = null;

function handleShowDesktopNotification(request) {
	var dtNow = new Date();
	var dtDiff = 0;
	if (g_dtLastNotification != null) {
		if (dtNow.getTime() - g_dtLastNotification.getTime() < 5000 && g_strLastNotification == request.notification)
			return; //ingore possible duplicate notifications
	}
	g_dtLastNotification = dtNow;
	g_strLastNotification = request.notification;
	var timeout = request.timeout || 5000;
	var notification = chrome.notifications.create(request.notification,
        {
            type:"basic",
            iconUrl: chrome.extension.getURL("images/icon128.png"),
            title: 'Plus for Trello',
            message: request.notification
        }, function (notificationId) {
            if (timeout) {
                setTimeout(function () {
                    chrome.notifications.clear(notificationId,function(wasCleared) {});
                }, timeout);
            }
        });
}

function handleCheckLoggedIntoChrome(sendResponse) {
	sendResponse({ status: (!g_bSignedIn) ? "error" : STATUS_OK });
	return;
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
                handleConfigNewSs(id, gid_to_wid(0), sendResponse); //gid_to_wid(0) works with new sheets as well
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

function handleCheckChromeStoreToken(sendResponse) {
    if (chrome.identity === undefined) {
        sendResponse({ status: "Please sign-in to Chrome." });
        return;
    }

    handleShowDesktopNotification({
        notification: "Please wait a few seconds for additional permission screens the first time you enable Pro.",
        timeout: 10000
    });

    chrome.identity.getAuthToken({ interactive: true, scopes: ["https://www.googleapis.com/auth/chromewebstore.readonly"] }, function (token) {
        if (token) {
            g_bProVersion = true; //caller will update storage. this global is for background, not content scripts
            sendResponse({ status: STATUS_OK });
        } else {
            g_bProVersion = false; //caller will update storage
            var message = "";
            if (chrome.runtime.lastError)
                message = chrome.runtime.lastError.message;
            sendResponse({ status: "Not signed into Chrome, network error or no permission.\n" + message });
        }
    });
}


function handleApiCall(url, params, bRetry, sendResponse, postBody, contentType, bAddIfMatchStar) {
	if (chrome.identity === undefined) {
		sendResponse({ status: "Please sign-in to Chrome from its top-right menu." });
		return;
	}

	chrome.identity.getAuthToken({ interactive: true, scopes: ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive.file"] }, function (token) {
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
			for (; i < obj.items.length; i++){
				var item = obj.items[i];
				var msDate = Date.parse(item.published);
				if (msDate <= msLastPostRetrieved || item.verb != "post") //review zig: lowerCase before check
					continue;
				item.msDatePublish = msDate; //save caller from having to parse it
				itemsRet.push(item);
				if (msDate > msDateMax)
					msDateMax = msDate;
			}

			itemsRet.sort(function (a, b) {
			    return b.msDatePublish - a.msDatePublish;
			});
			sendResponse({ status: STATUS_OK, items: itemsRet, msLastPostRetrieved: msDateMax });
			return;
		}
	};

	var url = "https://www.googleapis.com/plus/v1/people/109669748550259696558/activities/public?key=AIzaSyAKvksXJUQSqv9R9hJ4f7drfbBVyo4-7Tk&maxResults=50&fields=items(published%2Ctitle%2Curl%2Cverb)";

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

function handleHitAnalyticsEvent(category, action) {
    //try and hit anyway. if user didnt enable analytics, it will fail silently
    g_analytics.hit({ t: "event", ec: category, ea: action }, 1000);
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
        for (p in params) {
            payload = payload + "&" + p + "=" + encodeURIComponent(params[p]);
        }
        setTimeout(function () {
            var xhr = new XMLHttpRequest();
            var url = "https://ssl.google-analytics.com/collect";

            xhr.open("POST", url, true);
            //xhr.setRequestHeader("Content-length", payload.length); //unsafe in chrome
            xhr.send(payload);
        }, msDelay);
    },
    //private
    generateQuickGuid: function () {
        //http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
        return Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
    }
};