
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

function getConfigData(urlService, userTrello, callback, bSkipCache) {
	var data = null;

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
    if (!urlConfig) { //needed for offline sync for trellosync
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
	    timeout: 40000
	});

	callback(null);
	return;
}

var DATAVERSION_SIMPLEPLUS = 1;

function doGetJsonConfigSimplePlus(url, user) {
	var objRet = { version: DATAVERSION_SIMPLEPLUS, bSimplePlus: true };
	var strFindKey = "key=";
	var iKey = url.indexOf(strFindKey);
	if (iKey <= 0) {
		objRet.status = "No spreadsheet key.";
		return objRet;
	}
	var strRight = url.substr(iKey + strFindKey.length);
	var parts = strRight.split("#gid=");
	objRet.userTrello = user;
	objRet.urlSsUser = url;
	var partLeft = parts[0];
	if (partLeft.indexOf("&") < 0)
		objRet.idSsUser = partLeft;
	else
		objRet.idSsUser = (partLeft.split("&"))[0];
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

function handleRawSync(sendResponseParam) {
    var PROP_SERVICEURL = "serviceUrl";

    function sendResponse(response) {
        if (sendResponseParam)
            sendResponseParam(response);
    }

    chrome.storage.local.get([PROP_TRELLOUSER], function (obj) {
        var userTrello = (obj[PROP_TRELLOUSER] || null);
        if (userTrello == null) {
            sendResponse({ status: "error" });
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
                    if (!g_optEnterSEByComment.IsEnabled() && (urlSync == null || urlSync.length == 0)) {
                        sendResponse({ status: "sync not configured" });
                        return;
                    }

                    handleSyncDB({ config: responseConfig }, function (responseSync) {
                        sendResponse(responseSync);
                    }, true);
                });
            });
        });
    });
}

var g_strBadgeText = "";
var PLUS_COLOR_SPENTBADGE = "#B10013";

function setIconBadgeText(text, bAsTimer) {
    text = "" + text; //in case its not string yet
    if (!bAsTimer) {
        g_strBadgeText = text;
    }

    if (g_strTimerLast.length > 0)
        text = g_strTimerLast;

    chrome.browserAction.setBadgeText({ text: text });
    chrome.browserAction.setBadgeBackgroundColor({color:(g_strTimerLast.length > 0?"#2A88BE":PLUS_COLOR_SPENTBADGE)});
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

function handlePlusMenuSync(sendResponse) {
    handleRawSync(sendResponse);
}

function handleWebRequestPermission(sendResponse) {
    chrome.permissions.request({
        permissions: ['webRequest'],
        origins: ['https://trello.com/1/*']
    }, function (granted) {
        // The callback argument will be true if the user granted the permissions.
        sendResponse({ granted: granted || false });
    });
}

var g_idCardTimerLast = null;

function processTimerCounter() {

    var bChangedIdCard = false;
    function getTimerText(response) {
        assert(typeof SYNCPROP_bAlwaysShowSpentChromeIcon !== "undefined");
        var keyUnits = "units";
        chrome.storage.sync.get([keyUnits, SYNCPROP_ACTIVETIMER, SYNCPROP_bAlwaysShowSpentChromeIcon], function (obj) {
            var idCardTimer = null;
            UNITS.current = obj[keyUnits] || UNITS.current; //reload
            g_bAlwaysShowSpentChromeIcon = obj[SYNCPROP_bAlwaysShowSpentChromeIcon] || false;
            if (obj[SYNCPROP_ACTIVETIMER] !== undefined)
                idCardTimer = obj[SYNCPROP_ACTIVETIMER];

            if (idCardTimer != g_idCardTimerLast) {
                bChangedIdCard = true;
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
                    var msEnd = new Date().getTime();
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

var g_loaderDetector = {
    initLoader: function () {
        var thisLocal = this;
        setTimeout(function () { //avoid global dependencies
            loadBackgroundOptions(function () {
                thisLocal.init();
            });
        }, 1);
    },
    init: function () {
        g_bOffline = !navigator.onLine;
        updatePlusIcon();
        
        //unpause sync
        setInterval(function () {
            if (g_msRequestedSyncPause==0)
                return;
            var msNow=new Date().getTime();
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
        }, 1000 * 10);


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

        processTimerCounter();

        function updateOnlineState(bOnline) {
            g_bOffline = !bOnline;
            if (bOnline) {
                setTimeout(function () { checkNeedsSync(true); }, 2000);
            }
            else {
                updatePlusIcon(false);
            }
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
                if (!bSyncOutsideTrello)
                    return;

                if (g_optEnterSEByComment.IsEnabled() && (localStorage["plus_bFirstTrelloSyncCompleted"] || "") != "true")
                    return; //dont make the first sync from background-sync

                chrome.storage.local.get(keyPlusDateSyncLast, function (obj) {
                    var msDateSyncLast = obj[keyPlusDateSyncLast];
                    var dateNow = new Date();
                    if (!bForce && msDateSyncLast !== undefined && dateNow.getTime() - msDateSyncLast < g_msSyncRateLimit)
                        return;
                    handleRawSync();
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

function ease(x) {
    return (1 - Math.sin(Math.PI / 2 + x * Math.PI)) / 2;
}

function animateFlip() {
    setTimeout(function worker() {
        if (g_rotation <= 1) {
            setTimeout(function () {
                g_rotation += 1 / g_animationFrames;
                worker();
            }, g_msAnimationSpeed);
        } else {
            g_rotation = 0;
        }
        updatePlusIcon(false);
    }, 10);
}



function updatePlusIcon(bTooltipOnly) {
    bTooltipOnly = bTooltipOnly || false;
    var keyLastSync = "rowidLastHistorySynced";
    var keyLastSyncViewed = "rowidLastHistorySyncedViewed";
    var key_plus_datesync_last = "plus_datesync_last";
    var keyplusSyncLastStatus = "plusSyncLastStatus";
    var msNow = (new Date()).getTime();

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
        var statusLastSync = obj[keyplusSyncLastStatus];
        var bNew = false;

        if (rowidLastSync != null && (rowidLastSyncViewed == null || rowidLastSyncViewed < rowidLastSync))
            bNew = true;
        var strBase = "images/icon19";
        if (bNew) {
            strBase += "New";
        }

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
            var dateLastStatus = statusLastSync.date || msNow;
            return (syncStatus.length ==0 || (msNow-dateLastStatus>1000*60*20)); //pretend there wasnt a sync error if its old (over 20 min)
        }

        bErrorSync = false;

        if (bTooltipOnly) {
            bErrorSync= !setTooltipSyncStatus();
            if (bErrorSync)
                bTooltipOnly = false;
        }

        var ctx = null;
        var canvas = null;
        var dxCanvas = 0;
        var dyCanvas = 0;

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
            if (g_rotation != 0) {
                dxCanvas = Math.ceil(canvas.width / 2);
                dyCanvas = Math.ceil(canvas.height / 2);
                ctx.translate(dxCanvas, dyCanvas);
            }
            ctx.rotate(2 * Math.PI * ease(g_rotation));
        }
        

        var callback = function () {
            ctx.drawImage(img, -dxCanvas, -dyCanvas);
            if (g_rotation != 0) {
                ctx.translate(-dxCanvas, -dyCanvas);
                ctx.rotate(-2 * Math.PI * ease(g_rotation));
            }
            var color = "#B0FF5B";
            var colorTrelloSync = "#FFFFFF";
            var colorErrorSync = "#FF5050";
            var colorOffline = "#BBBBBB";
            var colorBackground = "#FFFFFF";
            var colorCircleStroke = (g_syncStatus.bSyncing ? '#000000' : '#415C20');

            bErrorSync = !setTooltipSyncStatus();

            if (bErrorSync)
                colorBackground = colorErrorSync;
            else if (g_bOffline)
                colorBackground = colorOffline;

            //draw spent counter on top of chrome badge
            if (g_bAlwaysShowSpentChromeIcon && g_strTimerLast.length > 0 && g_strBadgeText.length > 0) {
				//review zig: doesnt show offline/error visual status
                ctx.fillStyle = PLUS_COLOR_SPENTBADGE;
                ctx.strokeStyle = PLUS_COLOR_SPENTBADGE;
                var width=ctx.measureText(g_strBadgeText).width;
                roundRect(ctx, 0, 0, width+4, 11, 1, true, true);
                ctx.fillStyle = "#FFFFFF";
                ctx.font = "bold 8px Arial Narrow, Arial, sans-serif";
                ctx.fillText(g_strBadgeText, 2, 9);
            }
            else if (bErrorSync || g_bOffline) { //draw red X
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


            //green dot to the right
            if (g_cReadSyncLock > 0 || g_syncStatus.bSyncing) {
                ctx.beginPath();
                ctx.fillStyle = (g_syncStatus.bSyncing? colorTrelloSync : color);
                ctx.arc(15, 2, 2, 0, 2 * Math.PI, false);
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = colorCircleStroke;
                ctx.stroke();
                ctx.closePath();
            }

            //green dot to the left
            if (g_cWriteSyncLock > 0) {
                ctx.beginPath();
                ctx.fillStyle = color;
                ctx.arc(3, 2, 2, 0, 2 * Math.PI, false);
                ctx.fill();
                ctx.lineWidth = 1;
                ctx.strokeStyle = colorCircleStroke;
                ctx.stroke();
                ctx.closePath();
            }

            chrome.browserAction.setIcon({ imageData: ctx.getImageData(0, 0, 19, 19) });
        };

        if (!bTooltipOnly) {
            if (img.complete) { //check if image was already loaded by the browser
                callback();
            } else {
                img.onload = callback;
            }
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
    assert(port.name == "registerForChanges");
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
		responseStatus.bCalled= true;
	}

	if (request.method == "getConfigData") {
		var bSkipCache = (request.bSkipCache);
		getConfigData(request.urlService, request.userTrello, function (retConfig) {
			if (retConfig === undefined) //null means something different
				sendResponse({ config: { status: "not configured" } });
			else
				sendResponse({ config: retConfig });
		}, bSkipCache);
	}
	else if (request.method == "requestWebRequestPermission") {
	    handleWebRequestPermission(sendResponse);
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
	else if (request.method == "updatePlusIcon") {
	    if (request.bOnlyTimer) {
	        processTimerCounter();
	    }
	    else
	        updatePlusIcon();
	    sendResponse({status : STATUS_OK});
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
	    if (request.tooltip !==undefined)
		    chrome.browserAction.setTitle({ title: request.tooltip });
		sendResponse({});
	}
	else if (request.method == "testBackgroundPage") {
	    insertLogMessages(request.logMessages, request.bDoWriteToBackendLog, request.tuser, sendResponse);
	}
	else if (request.method == "showDesktopNotification") {
		handleShowDesktopNotification(request);
		sendResponse({});
	}
	else if (request.method == "insertHistoryRowFromUI") {
		handleInsertHistoryRowFromUI(request, sendResponse);
	}
	else if (request.method == "queueRenameAllCards") {
	    localStorage["renameCardsPendingData"] = JSON.stringify({ pending: true, bOnlyCardsWithHistory: request.bOnlyCardsWithHistory});
	    sendResponse({status:STATUS_OK});
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
		localStorage.clear();
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
	else
	    sendResponse({});

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
		elemReplace.innerHTML = ""; //blank it when done
		sendResponse({ status: STATUS_OK });
		return;
	}
	sendResponse({ status: "cant copy to clipboard." });
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
		if (dtNow.getTime() - g_dtLastNotification.getTime() < 10000 && g_strLastNotification == request.notification)
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
    if (true) {
        postData = {title:"Plus for Trello sync spreadsheet",description:"Do NOT modify this spreadsheet"};
        url = "https://www.googleapis.com/drive/v2/files/0AuP6m1j2b6F4dE1BbGNkTnpzaTdFNG05WVZRellmbmc/copy";
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
		sendResponse({ status: "Please sign-in to Chrome from it's top-right menu." });
		return;
	}

	chrome.identity.getAuthToken({ interactive: true }, function (token) {
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
			    if (g_bRetryAuth && confirm("Unable to authenticate with Google.\n\nNOTE: If you want to disable Google Sync go to Plus Help, Google Sync, and remove the sync URL.\n\nRetry authentication?")) {
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

