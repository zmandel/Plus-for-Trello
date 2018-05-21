/// <reference path="intellisense.js" />

var g_db = null;
var STR_UNKNOWN_LABEL = "";
var STR_UNKNOWN_TEAM = "Unknown team";
var STR_UNKNOWN_LIST = "Unknown list";
var STR_UNKNOWN_BOARD = "Unknown board";
var STR_UNKNOWN_CARD = "Unknown card";

var g_msRequestedSyncPause = 0; //sync can be paused for a few seconds with the "beginPauseSync" message. this way we avoid a pause/unpause pair that may break when user closes the tab.
var LS_KEY_detectedErrorLegacyUpgrade = "detectedErrorLegacyUpgrade";

//ver 3: 3.4.4
//ver 4: 3.6.x (add labels)
//ver 5: 3.6.6, fix bug where due dates were not being sync sometimes (due to introduction of search with incomplete card fields)
var VERDEEPSYNC = {
    CURRENT: 5,  //making it bigger will trigger a "deep sync" on all boards. Temporary solution to running deep sync. must be >0
    MINVALID: 0,
    NOTMEMBER: -1 //hackinsh way to keep a special board state when user is no longer a member of the board. needed to distinguish from zero in first-sync case with existing db data
};

function isDbOpened() {
    if (typeof (g_db) == "undefined") //in case its called from a global object during construction
        return false;

    return (!g_bOpeningDb && g_db);
}

function testResetVersion() {
    if (!isDbOpened())
        return;
    alert("changing sql db version.");
    var db = g_db;
    var versionCur = parseInt(db.version,10) || 0;
    db.changeVersion(versionCur, 31);
}

function notifyTruncatedSyncState(msgErr) {
    //this is needed for emergency unlock of background globals.
    //without this, a coding error/assert/unhandled exception could lock up sync and thus prevent a reset
    logPlusError(msgErr);
    setTimeout(function () {
        var messageResponse = { event: EVENTS.NEW_ROWS, cRowsNew: 0, status: msgErr, statusLastTrelloSync: g_syncStatus.strLastStatus };
        broadcastMessage(messageResponse); //unlock syncing clients
        updatePlusIcon(false);
    }, 300);
}

//based on http://blog.maxaller.name/2010/03/html5-web-sql-database-intro-to-versioning-and-migrations/
function Migrator(db, sendResponse) {
	var migrations = [];
	this.migration = function (number, func) {
		migrations[number] = func;
	};
	var doMigration = function (number) {
		if (migrations[number]) {
			db.changeVersion(db.version, String(number), function (t) {
				migrations[number](t);
			}, function (err) {
			    var strErr = "error in doMigration to version " + number;
			    if (err.message && err.message.indexOf("callback did not return false") < 0) //this one is not interesting and will clutter user error msg
			        strErr = strErr + ": " + err.message;

			    if (console.error) console.error(strErr);
			    sendResponse({ status: strErr });
			    return true; //stop
			}, function () {
				doMigration(number + 1);
			});
		} else {
		    sendResponse({ status: STATUS_OK });
		}
	};

	this.doIt = function () {
		var initialVersion = parseInt(db.version, 10) || 0;
		try {
			doMigration(initialVersion + 1);
		} catch (e) {
			if (console.error)
			    console.error(e.message);
			logException(e);
		}
	};
}

function handleInsertHistoryRowFromUI(request, sendResponseParam) {
    function sendResponse(response) {
        if (response.status==STATUS_OK)
            animateFlip();
        sendResponseParam(response);
    }
    //this row could affect or depend on previous rows. make sure to insert them before
    insertPendingSERows(function (responseInsertSE) {
        if (responseInsertSE.status != STATUS_OK) {
            sendResponse({ status: responseInsertSE.status });
            return;
        }
        insertIntoDB(request.rows, sendResponse);
    },
    false); //dont allow calling while db is open (will wait and retry)
}

var g_cFullSyncLock = 0;
var g_cReadSyncLock = 0;
var g_cWriteSyncLock = 0;
var g_cRowsRead = 0;

function handleIsSyncing(sendResponse) {
    loadBackgroundOptions(function () {
        var response = { status: STATUS_OK, bSyncing: (g_cReadSyncLock > 0 || g_cWriteSyncLock > 0 || g_syncStatus.bSyncing) };
        sendResponse(response);
    });
}

function handleUnpause(sendResponse) {
    if (g_msRequestedSyncPause != 0) {
        g_cFullSyncLock -= 1;
        g_msRequestedSyncPause = 0;
        updatePlusIcon(true);
    }
    if (sendResponse)
        sendResponse({ status: STATUS_OK });
}

function handlePause(sendResponse) {
    if (g_msRequestedSyncPause == 0) {
        g_cFullSyncLock += 1;
        updatePlusIcon(true);
    }
    g_msRequestedSyncPause = Date.now();
    sendResponse({ status: STATUS_OK });
}


function handleGetTotalRows(bOnlyNotSync, sendResponse, bAllowWhileOpening) {
	var sql = null;
	if (bOnlyNotSync)
		sql = "select count(*) as total FROM HISTORY WHERE bSynced=0";
	else
		sql = "select max(rowid) as total, min(date) as dateMin FROM HISTORY"; //rowid autoincrements and we never delete rows. faster than count(*)
	var request = { sql: sql, values: [] };
	handleGetReport(request,
		function (response) {
		    var thisResponse = { status: response.status, cRowsTotal: 0 };
		    if (response.status != STATUS_OK) {
		        sendResponse(thisResponse);
		        return;
		    }

		    if (response.rows) {
		        thisResponse.cRowsTotal = response.rows[0].total || 0;

		        var dateMin = (response.rows[0].dateMin || 0) * 1000; //convert to ms
		        if (dateMin > 0)
		            thisResponse.dateMin = dateMin;
		        sendResponse(thisResponse);
		    }
		},
        bAllowWhileOpening);
}

function detectLegacyHistoryRows(sendResponse) {
    var sDate = Math.round(g_dateMinCommentSELegacy.getTime() / 1000); //needed because a reset sync could have populated the keyword on the old rows
    var sql = sql = "select idHistory from history where date < ? OR keyword is NULL limit 1";
    var request = { sql: sql, values: [sDate] };
    handleGetReport(request,
		function (response) {
		    response.hasLegacyRows = (response.status == STATUS_OK && response.rows && response.rows.length > 0);
		    sendResponse(response);
		},
        true);
}

function handleGetTotalMessages(sendResponse) {
	var request = { sql: "select count(*) as total FROM LOGMESSAGES", values: [] }; //review zig: use max(rowid), handle empty case
	handleGetReport(request,
		function (response) {
			var thisResponse = { status: response.status };
			if (response.status != STATUS_OK) {
				sendResponse(thisResponse);
				return;
			}
			var cRowsTotal = response.rows[0].total;
			thisResponse.cRowsTotal = cRowsTotal;
			sendResponse(thisResponse);
		},
        true);
}


//review zig: restructure calling sync so this event can notify all
function notifyStartSync() {
    broadcastMessage({ event: EVENTS.START_SYNC, status: STATUS_OK });
}

function notifyFinishedDbChanges(bNewHistoryRows) {
    broadcastMessage({ event: EVENTS.DB_CHANGED, bNewHistoryRows: bNewHistoryRows || false, status: STATUS_OK });
}

function handleSyncDB(request, sendResponseParam, bDontCallLoadSB) {

    function worker() {
        handleSyncDBWorker(request, sendResponseParam);
    }

    if (!bDontCallLoadSB) {
        loadBackgroundOptions(function () {
            worker();
        });
    } else
        worker();
}

function handleSyncDBWorker(request, sendResponseParam) {
    var retConfig = request.config;
    if (retConfig === undefined) {
        sendResponseParam({ status: "not configured" });
        return;
    }
    else if (retConfig && retConfig.status != STATUS_OK) {
        sendResponseParam({ status: retConfig.status });
        return;
    }

    if (g_cReadSyncLock < 0) {
        logPlusError("error: g_cReadSyncLock<0");
        sendResponseParam({ status: "error (see error log in Plus help)" });
        return;
    }

    if (g_bDisableSync) {
        sendResponseParam({ status: "sync is off" });
        return;
    }

    if (!isDbOpened() || g_cWriteSyncLock != 0 || g_cReadSyncLock != 0 || g_cFullSyncLock != 0 || g_syncStatus.bSyncing) {
        if (request && request.bUserInitiated && g_msRequestedSyncPause > 0) {
            handleShowDesktopNotification({
                notification: "Close the Plus help pane to sync with Trello.",
                timeout: 5000
            });
        }

        sendResponseParam({ status: "busy" });
        return;
    }

    if (request.bUserInitiated)
        g_bRetryAuth = true;

    var bEnterSEByComments = (g_optEnterSEByComment.IsEnabled() && (!retConfig || retConfig.spentSpecialUser === undefined));

    if (!bEnterSEByComments)
        g_cReadSyncLock++;
    g_cRowsRead = 0;

    function sendResponse(response) {
        //hook into response to manage locking and write sync
        if (!bEnterSEByComments)
            g_cReadSyncLock--;

        if (!bEnterSEByComments && retConfig != null && retConfig.spentSpecialUser === undefined && response.status == STATUS_OK) {
            if (g_cWriteSyncLock == 0) {
                //increment g_cFullSyncLock so it stays busy until we actually increment g_cWriteSyncLock (Avoid timing issue)
                g_cFullSyncLock++;
                setTimeout(function () {
                    startWriteSync(retConfig.idSsUser, retConfig.idUserSheetTrello);
                }, 100); //see if we need to write into the spreadsheet, but start a little bit after this response
            }
        }
        else
            g_strLastWriteSyncStatus=STATUS_OK; //reset.
        response.statusLastWriteSync = g_strLastWriteSyncStatus;

        var bNeedUpdateIcon = true;
        if (response.cRowsNew && response.cRowsNew > 0 && response.rowidLastInserted != null) {
            bNeedUpdateIcon = false;
            updatePlusIcon();
        }

        if (response.status == STATUS_OK) {
            if (!bEnterSEByComments) { //bEnterSEByComments does this later. review both should share
                bNeedUpdateIcon = false;
                var pairDateLast = {};
                pairDateLast["plus_datesync_last"] = Date.now();
                chrome.storage.local.set(pairDateLast, function () {
                    updatePlusIcon();
                });
            }

            if (bNeedUpdateIcon && g_bLastPlusMenuIconError)
                updatePlusIcon();
        }

        var pairLastStatus = {};
        if (response.status != STATUS_OK) {
            g_cErrorSync++;
            updatePlusIcon();
        }

        if (!bEnterSEByComments) {
            pairLastStatus["plusSyncLastStatus"] = makeLastStatusSync(response.status, response.statusLastWriteSync || STATUS_OK);
            chrome.storage.local.set(pairLastStatus, function () {
                if (bNeedUpdateIcon)
                    updatePlusIcon();
            });
        }

        sendResponseParam(response);
        if (response.status != "busy" && !response.bBroadcasted) {
            var messageResponse = { event: EVENTS.NEW_ROWS, cRowsNew: 0, status: response.status, statusLastTrelloSync: g_syncStatus.strLastStatus };
            broadcastMessage(messageResponse);
        }
    }

    if (retConfig == null && !bEnterSEByComments) {  //simple trello case, pretend a sync happened. this way we follow the same route in simple trello too
        sendResponse({ status: STATUS_OK, cRowsNew: 0 });
        return;
    }

    updatePlusIcon();

    function handleSSsync(sendResponse) {
        try {
            var idSs = null;
            var idSheet = null;

            if (retConfig.idMasterSheetTrello !== undefined) {
                idSs = retConfig.idSsMaster;
                idSheet = retConfig.idMasterSheetTrello;
            } else {
                idSs = retConfig.idSsUser;
                idSheet = retConfig.idUserSheetTrello;
            }

            var url = "https://spreadsheets.google.com/feeds/list/" +
                idSs + "/" + idSheet +
                "/private/basic";

            var rowSyncStart = 1;
            var iRowEndLastSpreadsheet = rowSyncStart - 1; //0
            var allssData = getRowSSEndLastData({ idSs: idSs, idSheet: idSheet }); //as this is the first call in the sync process, we pass defaults to deal with conversion from versions before 2016-12-16
            var indexMap = idSs + "/" + idSheet;
            if (allssData[indexMap]) {
                iRowEndLastSpreadsheet = allssData[indexMap];
                    rowSyncStart = iRowEndLastSpreadsheet + 1;
                }

            var dataAll = [];
            var cPage = 500; //get rows by chunks.
            //thanks to https://groups.google.com/forum/#!topic/google-spreadsheets-api/dSniiF18xnM
            var params = { 'alt': 'json', 'start-index': rowSyncStart, 'max-results': cPage };
            var ssInfo = { idSs: idSs, idSheet: idSheet, indexMap: indexMap, retConfig:retConfig, iRowEndLastSpreadsheet: iRowEndLastSpreadsheet };
            handleApiCall(url, params, true, function myCallback(resp) {
                try {
                    if (resp !== undefined && resp.data !== undefined && resp.data.feed !== undefined) {
                        var entry = resp.data.feed.entry;
                       
                        if (entry) {
                            var iData = 0;
                            var data = entry;
                            for (; iData < data.length; iData++)
                                dataAll.push(data[iData]);
                            g_cRowsRead += data.length;
                        }
                        updatePlusIcon(true);
                        if (!entry || entry.length < cPage) {
                            processNewRows(dataAll, sendResponse, ssInfo);
                            return;
                        }

                        rowSyncStart += cPage;
                        var paramsNew = { 'alt': 'json', 'start-index': rowSyncStart, 'max-results': cPage };
                        handleApiCall(url, paramsNew, true, myCallback);

                    } else {
                        sendResponse({ status: (resp || {}).status });
                    }
                } catch (e) {
                    logException(e);
                    sendResponse({ status: "exception: " + e.message });
                }
            }
            );
        } catch (e) {
            logException(e);
            sendResponse({ status: "exception: " + e.message });
        }
    }

    calculateSyncDelay(function () {
        if (!bEnterSEByComments)
            handleSSsync(sendResponse);
        else
            handleSyncBoards({ tokenTrello: request.tokenTrello, bUserInitiated: request.bUserInitiated }, sendResponse);
    });
}

var g_strLastWriteSyncStatus = STATUS_OK;

function decrementWriteSyncLock(bDecrementWrite) {
    if (bDecrementWrite) {
        assert(g_cWriteSyncLock > 0);
        g_cWriteSyncLock--;
    }
    updatePlusIcon();
}


function startWriteSync(idSsUser, idUserSheetTrello) {
    if (g_cFullSyncLock <=0) {
        logPlusError("bad g_cFullSyncLock"); //should never happen
		return;
	}

	var request = {
		sql: "select H.idHistory, H.date, C.idBoard, C.idCard, B.name as board, C.name as card, H.spent, H.est, H.user, H.week, H.month, H.comment \
				FROM HISTORY H JOIN CARDS C on H.idCard=C.idCard JOIN BOARDS B ON C.idBoard=B.idBoard \
				where H.bSynced=0 order by H.date ASC", values: []
	};
	handleGetReport(request,
		function (response) {
		    g_cFullSyncLock--;
		    assert(g_cFullSyncLock >= 0);
		    var bDecrementedFullLock = false;


		    if (response.status == STATUS_OK) {
		        var bDecrementWrite = (response.rows && response.rows.length > 0);
		        if (bDecrementWrite) {
		            g_cWriteSyncLock++; //first increment it, in response will decrement
		            updatePlusIcon();
		        }
		        appendRowsToSpreadsheet(response.rows, 0, idSsUser, idUserSheetTrello, function () { decrementWriteSyncLock(bDecrementWrite); });
		    }
		    else {
		        setLastWriteStatus(response.status);
		        decrementWriteSyncLock(false);
		    }
		});
}

function setLastWriteStatus(status) {
    //patch sync status with new write status
    if (status != STATUS_OK)
        status = status + ".\nMake sure the spreadsheet is shared with Write permission to you.";
    var bChanged = (g_strLastWriteSyncStatus != status);
    g_strLastWriteSyncStatus = status;
    var keyplusSyncLastStatus = "plusSyncLastStatus";
    chrome.storage.local.get([keyplusSyncLastStatus], function (obj) {
        var statusLastSync = obj[keyplusSyncLastStatus];
        var pairLastStatus = {};
        pairLastStatus["plusSyncLastStatus"] = makeLastStatusSync(statusLastSync.statusRead, status);
        chrome.storage.local.set(pairLastStatus, function () {
            if (bChanged)
                updatePlusIcon(false);
        });
    });
}

function appendRowsToSpreadsheet(rows, iRow, idSsUser, idUserSheetTrello, response) {
	if (rows.length == iRow) {
		if (rows.length == 0)
		    setLastWriteStatus(STATUS_OK);
		response();
		return;
	}
	appendRowToSpreadsheet(rows[iRow], idSsUser, idUserSheetTrello, function () {
		//wait a little per row to not overwhelm quotas
		//note: the only common case where there is more than 1 row to write is when the user first sets up sync after using Plus without sync.
		//so its not worth it to optimize that case, it will just take longer to complete the write sync.
		//note that it actually takes longer than the timeout, since a row waits for the previous one to finish (serial)
		if (g_strLastWriteSyncStatus != STATUS_OK)
			response();
		else
			setTimeout(function () { appendRowsToSpreadsheet(rows, iRow + 1, idSsUser, idUserSheetTrello, response); }, 1200);
	});
}

function dateToSpreadsheetString(date) {
	// M/D/YYYY H:M:S review zig: make it customizable, but its hard given google spreadsheet inability to control its format.
	var year = date.getFullYear();
	var month = date.getMonth() + 1;
	var day = date.getDate();
	var hour = date.getHours();
	var min = date.getMinutes();
	var sec = date.getSeconds();

	var ret = "" + prependZero(month) + "/" + prependZero(day) + "/" + year + " " + prependZero(hour) + ":" + prependZero(min) + ":" + prependZero(sec);
	return ret;
}

function appendRowToSpreadsheet(row, idSsUser, idUserSheetTrello, sendResponse) {
    //note this serializes all appends, so we dont overwhelm google quotas
	var date = new Date(row.date * 1000);
	var atom = makeRowAtom(dateToSpreadsheetString(date), row.board, row.card, row.spent, row.est,
				   row.user, row.week, row.month, row.comment, row.idBoard, row.idCard, row.idHistory);
	var url = "https://spreadsheets.google.com/feeds/list/" + idSsUser + "/" + idUserSheetTrello + "/private/full";
	handleApiCall(url, {}, true, function (response) {
	    setLastWriteStatus(response.status);
		sendResponse(); 
	}, atom);
}

function appendLogToPublicSpreadsheet(message, sendResponse) {
    //note this serializes all appends, so we dont overwhelm google quotas
    assert(false); //no longer used
	var atom = makeMessageAtom(message);
	var url = "https://spreadsheets.google.com/feeds/list/" + "xxxxxxx" + "/" + gid_to_wid(0) + "/private/full";
	onAuthorized(url, {}, function (response) {
	    sendResponse(); 
	}, null, true, atom);
}

/* handleGetReport
 *
 * returns READ-ONLY rows. use cloneObject if you want to modify it, else changes fail without error.
 **/
function handleGetReport(request, sendResponse, bAllowWhileOpening, cRetries) {
    var cRetriesStart = 8;
    if (cRetries === undefined)
        cRetries = cRetriesStart; //first time

    if (!isDbOpened() && (!bAllowWhileOpening || !g_db)) {
        if (cRetries <= 0) {
            var error = "unusual: db not ready";
            sendResponse({ status: error });
        }
        else {
			//could happen i.e. two trello tabs open, one resets sync, causes g_db to reset, the other doe a report from timer at the same time.
            //its a rare case, and we minimize it much more by doing these retries because not all report callers might handle well failure
            if (cRetries == cRetriesStart-1)
                console.log("unusual: db still busy. keep retrying handleGetReport.");
            setTimeout(function () {
                handleGetReport(request, sendResponse, bAllowWhileOpening, cRetries - 1);
            }, 1000);
        }
        return;
	}

	var sql = request.sql;
	var values = request.values;
	var rowsResult = [];
	g_db.transaction(function (tx) {
		tx.executeSql(sql, values,
			function (t, results) {
			    rowsResult = new Array(results.rows.length);
				for (var i = 0; i < results.rows.length; i++)
					rowsResult[i]=results.rows.item(i);
			},
			function (trans, error) {
				logPlusError(error.message + " sql: " + sql);
				return true; //stop
			});
	},

	function errorTransaction() {
		logPlusError("error in handleGetReport: " + sql);
		sendResponse({ status: "error: handleGetReport" });
	},

	function okTransaction() {
		sendResponse({ status: STATUS_OK, rows: rowsResult });
	});
}

var g_regexDateParseRow = null;
function parseNewHistoryRow(rowIn) {
    var dummyColumn = "dummyPlusForTrelloColumn"; //simplifies algorithm below
    var strContentsOrig = rowIn.content.$t;
    var strContents = strContentsOrig + ", " + dummyColumn + ": dummy";
    //example for items after first: ", card:"
    //for each item: trim, remove optional ' at the beginning
    //an element with "" (instead of null) indicates an optional column
    var mapMatches = { board: null, card: null, spenth: null, esth: null, who: null, week: null, month: null, comment: "", cardurl: null, idtrello: null };
    mapMatches[dummyColumn] = null; //append at the end of the properties
    var propMatch = null;
    var strToParse = strContents;
    var propPending = null;
    for (propMatch in mapMatches) {
        var strFind=propMatch;
        if (propPending != null)
            strFind = ", " + strFind;
        strFind = strFind+":";
        var ich = strToParse.indexOf(strFind);
        if (ich < 0) {
            if (mapMatches[propMatch] === "")
                continue;
            throw new Error("Missing position '" + strFind + "' on row " + strContentsOrig);
        }
        if (propPending)
            mapMatches[propPending] = cleanupStringSpreadsheet(strToParse.substr(0, ich));
        propPending=propMatch;
        ich = ich + strFind.length;
        strToParse = strToParse.substr(ich);
    }
    var rgIds = mapMatches.idtrello.split("-");
	if (rgIds.length != 3)
	    throw new Error("Bad ids parse row error: " + strContentsOrig);

	var date = rowIn.title.$t;
	//   1  2  3   4  5  6
    //   7/30/2013 18:15:25
	if (!g_regexDateParseRow)
	    g_regexDateParseRow = new RegExp("'?(\\d+)/(\\d+)/(\\d+)\\s(\\d+):(\\d+):(\\d+)");
	var pattDate = g_regexDateParseRow;
	var rgResultsDate = pattDate.exec(date);
	if (rgResultsDate == null)
		throw new Error("Generic date parse error: " + date);
	var dateParsed = new Date(rgResultsDate[3], rgResultsDate[1] - 1, rgResultsDate[2], rgResultsDate[4], rgResultsDate[5], rgResultsDate[6], 0);
	var strBoard = mapMatches.board;
	var strCard = mapMatches.card;
	var spent = parseFloat(mapMatches.spenth);
	var est = parseFloat(mapMatches.esth);
	var user = mapMatches.who;
	var week = mapMatches.week; //review zig
	var month = mapMatches.month;
	var comment = mapMatches.comment;
	var idHistory = cleanupStringSpreadsheet(rgIds[0]);
	if (idHistory.indexOf("idc") == 0) {
        //there was a time when Plus appended the user to the history id. This makes it harder to support user renaming with some sync scenarios, so remove them
	    var posFindUser = idHistory.lastIndexOf(user);
	    if (posFindUser > 0 && idHistory.length == posFindUser + user.length)
	        idHistory = idHistory.slice(0, posFindUser);
	}
	var idCard = rgIds[1];
	var idBoard = rgIds[2];
	var obj = {};

	obj.idHistory = idHistory;
	obj.idCard = idCard;
	obj.idBoard = idBoard;
	obj.date = Math.floor(dateParsed.getTime() / 1000); //seconds since 1970
	obj.strBoard = strBoard;
	obj.strCard = strCard;
	obj.spent = spent;
	obj.est = est;
	obj.user = user;
	obj.week = getCurrentWeekNum(new Date(obj.date*1000)); //dont trust the spreadsheet's week. as of v2.7.8 the user can change the week start day (sunday or monday)
	obj.month = month;
	obj.comment = comment;
	return obj;
}

function cleanupStringSpreadsheet(str) {
	if (typeof (str) != 'string')
		return str;
	str = str.trim();
	if (str.indexOf("'") == 0)
		str = str.substr(1);
	return str;
}

function processNewRows(rowsInput, sendResponse, ssInfo) {

    var rows = new Array(rowsInput.length);
	
	for (var i = 0; i < rowsInput.length; i++) {
		rows[i]=parseNewHistoryRow(rowsInput[i]);
	}
	insertIntoDB(rows, sendResponse, ssInfo);

}


function handleMakeNonRecurring(tx, idCard) {
    var sqlUpdateEtype = "UPDATE HISTORY set eType= CASE when est<0 then " +
        ETYPE_DECR + " else  case when est>0 then " +
        ETYPE_INCR + " else " +
        ETYPE_NONE +
        " END END where idCard=?";
    tx.executeSql(sqlUpdateEtype, [idCard], function (tx2, results) {
        var sqlUpdate2 = "update history set eType=" +
            ETYPE_NEW + " where (rowid in (select min(rowid) from history  where idCard=? and (spent<>0 OR est<>0) group by user,idCard)) \
OR (est<>0 AND comment LIKE '%" + g_prefixCommentTransfer + "%')";
        tx2.executeSql(sqlUpdate2, [idCard], function (tx3, results) {},
            function (tx3, error) {
                logPlusError(error.message);
                return true; //stop
            });
    },
	function (tx2, error) {
	    logPlusError(error.message);
	    return true; //stop
	});
}


function handleMakeRecurring(tx, idCard) {
    var sqlUpdateEtype = "update history set eType=" +
        ETYPE_NEW + " where idCard = ? and eType <> " +
        ETYPE_NEW + " and est <> 0";
    tx.executeSql(sqlUpdateEtype, [idCard], function (tx2, results) {
    },
	function (tx2, error) {
	    logPlusError(error.message);
	    return true; //stop
	});
}



function handleCardCreatedUpdatedMoved(data, rowParam, bVerifyBoardIsCardsBoard, tx, callback) {
    var row = rowParam;
    var strExecute = "SELECT dateSzLastTrello, idCard, idBoard, name from CARDS where idCard=?";
	var values = [row.idCard];

    //note: dont yet use data.cards if card is there. changing statement execution order/depth can affect other things
	tx.executeSql(strExecute, values,
	function onOk(tx2, resultSet) {
	    var dateEarliestTrello = earliest_trello_date();
		var strExecute2 = null;
		if (resultSet.rows.length > 1)
			logPlusError("cards bad consistency: duplicate card"); // should never happen. keep going anyway as it may get autocorrected
		var bCardRenamed = false;
		var bCardCreated = false;
		var bCardMoved = false;
		var rowCard = data.cards[row.idCard];
		if (!rowCard && resultSet.rows.length > 0) {
		    rowCard = cloneObject(resultSet.rows.item(0)); //clone to modify it
		    data.cards[row.idCard] = rowCard; //save it.
		}

		if (rowCard) {
		    if (rowCard.idBoard != row.idBoard) {
		        bCardMoved = true; //moved
		    }

		    if (rowCard.name != row.strCard)
		        bCardRenamed = true; //renamed
		} else
		    bCardCreated = true; //created

		if (bCardCreated) {
		    //since its the first time we encounter the card, idBoard should be OK
		    rowCard = { idCard: row.idCard, idBoard: row.idBoard, name: row.strCard };
		    data.cards[row.idCard] = rowCard;
		    strExecute2 = "INSERT INTO CARDS (idCard, idBoard, name) \
						   VALUES (? , ? , ?)";
		    tx2.executeSql(strExecute2, [row.idCard, row.idBoard, row.strCard],
                function onOkInsert(tx3, resultSet) {
                    var x = 1; //for debug breakpoint
                },
				function (tx3, error) {
				    logPlusError(error.message);
				    return true; //stop
				});
		    if (g_bDummyLabel) {
		        //since we are just creating the card, it needs a dummy label as it has no labels
		        tx2.executeSql("INSERT OR REPLACE INTO LABELCARD (idCardShort,idLabel) VALUES (?,?)", [row.idCard, IDLABEL_DUMMY], null,
                    function (tx3, error) {
                        logPlusError(error.message);
                        return true; //stop
                    });
		    }

		}

		assert(rowCard);
	    //note on rowCard.dateSzLastTrello: when sync is enabled but the card hasnt been updated from trello sync yet,
	    //go ahead and update the card based on this history row. even if we dont do it here, it will be done eventually by trello sync when
	    //it processes the card's history (and sets dateSzLastTrello). but doing it here gets the change faster to the user.  
		if ((bCardRenamed || bCardMoved) && (!g_bEnableTrelloSync || rowCard.dateSzLastTrello == null || rowCard.dateSzLastTrello == dateEarliestTrello)) {
		    if (bCardRenamed)
		        handleRecurringChange(tx2, row.idCard, rowCard.name, row.strCard);
		    rowCard.idBoard = row.idBoard;
		    rowCard.name = row.strCard;
		    assert(rowCard.idCard == row.idCard);
		    strExecute2 = "UPDATE CARDS SET idBoard=?,name=? WHERE idCard=?";
		    tx2.executeSql(strExecute2, [rowCard.idBoard, rowCard.name, rowCard.idCard],
                function onOkInsert(tx3, resultSet) {
                    var x = 1;
                },
				function (tx3, error) {
				    logPlusError(error.message);
				    return true; //stop
				});

		    if (bCardMoved) {
		        //note: the only reason we have an idBoard here is for perf as sqlite doesnt have indexed views.
		        //this supports moving cards to another board.
		        strExecute2 = "UPDATE HISTORY SET idBoard=? WHERE idCard=?";
		        //console.log("idBoard: " + row.idBoard + "  idCard:" + row.idCard);
		        tx2.executeSql(strExecute2, [row.idBoard, row.idCard], null,
                    function (tx3, error) {
                        logPlusError(error.message);
                        return true; //stop
                    }
                );
		    }
		} else if (bVerifyBoardIsCardsBoard && bCardMoved) {
		    //correct the history row to have the db card's idBoard
		    tx2.executeSql("UPDATE HISTORY SET idBoard=? WHERE idHistory=?", [rowCard.idBoard, row.idHistory],
                    null,
                    function (tx3, error) {
                        logPlusError(error.message);
                        return true; //stop
                    }
                );
		}

		callback(rowCard);
	},
	function (tx2, error) {
		logPlusError(error.message);
		return true; //stop
	});
}

function handleRecurringChange(tx, idCard, nameOld, nameNew) {
    var bOldR = (nameOld.indexOf("[R]") >= 0);
    var bNewR = (nameNew.indexOf("[R]") >= 0);

    if (!bOldR && bNewR)
        handleMakeRecurring(tx, idCard);
    else if (bOldR && !bNewR)
        handleMakeNonRecurring(tx, idCard);
}


function handleUpdateCardBalances(rowParam, rowidParam, tx, nameCard, eTypeRow) {
    var row = rowParam;
    if (row.spent == 0 && row.est == 0) //see updateCardRecurringStatusInHistory, handleMakeNonRecurring usage of min(rowid)
        return;
	var strExecute = "INSERT OR IGNORE INTO CARDBALANCE (idCard, user, spent, est, diff, date) VALUES (?, ?, ?, ?, ?, ?)";
	tx.executeSql(strExecute, [row.idCard, row.user, 0, 0, 0, row.date],
		function onOkInsert(tx2, resultSet) {
			var eType = ETYPE_NONE;

			if (resultSet.rowsAffected == 1)
			    eType = ETYPE_NEW;
			else if (nameCard.indexOf(TAG_RECURRING_CARD) >= 0) { //use nameCard since row.strCard could be outdated (trello sync case)
			    if (row.est!=0)
			        eType = ETYPE_NEW; //recurring cards never increase/decrease estimates, all reporting is considered "new"
			}
			else if (row.est != 0 && rowParam.comment && rowParam.comment.indexOf(g_prefixCommentTransfer) >= 0) {
			    eType = ETYPE_NEW;
			}
			else if (row.est > 0)
			    eType = ETYPE_INCR;
			else if (row.est < 0)
			    eType = ETYPE_DECR;

			if (eType == eTypeRow)
				return; //skip

			var strExecute2 = "UPDATE HISTORY SET eType=? WHERE rowid=?";
			tx2.executeSql(strExecute2, [eType, rowidParam],
				null,
				function (tx3, error) {
					logPlusError(error.message);
					return true; //stop
				}
			);
		},
		function (tx3, error) {
		 	logPlusError(error.message);
			return true; //stop
		}
	);

	strExecute = "UPDATE CARDBALANCE SET spent=spent+?, est=est+?, diff=diff+?, date=max(date,?) WHERE idCard=? AND user=?";
	tx.executeSql(strExecute, [row.spent, row.est, parseFixedFloat(row.est - row.spent), row.date, row.idCard, row.user],
        null,
		function (tx3, error) {
			logPlusError(error.message);
			return true; //stop
		}
	);
}

function loadBackgroundOptions(callback) {

    loadSharedOptions(function () {
        if (!g_bEnableTrelloSync || g_bDisableSync) {
            g_syncStatus.setStage("", 0); //reset
        }
        callback();
    });
}

function insertIntoDB(rows, sendResponse, ssInfo) {
    loadBackgroundOptions(function () {
        insertIntoDBWorker(rows, sendResponse, ssInfo);
    });
}

function insertIntoDBWorker(rows, sendResponse, ssInfo, bFromTrelloComments) {
    assert(g_db);
    var i = 0;
    var idMemberMapByName = {}; //populated at the beginning with all existing users by name
	var cProcessedTotal = 0;
	var cInsertedTotal = 0;
	var cRows = rows.length;
	var bFromSpreadsheet = (ssInfo !== undefined);
	var bFromSource = (bFromSpreadsheet || bFromTrelloComments); //otherwise it comes from the interface
	var rowidLastInserted = null; //will be set to the rowid of the last inserted row
	var data = {
        cards:{} // card[idCard]. must keep track of cards values because deeper queries can create/modify cards and higher transaction levels wont see those changes.
	};

	if (rows.length == 0) {
		sendResponse({ status: STATUS_OK, cRowsNew: 0 });
		return;
	}

	function processCurrentRow(tx, rowParam) {
	    //note: its important to explicitly use a local row variable so subqueries below will receive the correct row.
	    //	  else it will point to the caller's row which is reused in a loop.
	    var row = rowParam;
	    assert(g_optEnterSEByComment.bInitialized);
	    if (!row.keyword)
            row.keyword = g_optEnterSEByComment.getDefaultKeyword();

	    if (!bFromTrelloComments) {
	        //in case board is new.
	        var strExecute = "INSERT OR IGNORE INTO BOARDS (idBoard, name) \
				VALUES (?, ?)";
	        tx.executeSql(strExecute, [row.idBoard, row.strBoard],
                null,
                function (tx2, error) {
                    logPlusError(error.message);
                    return true; //stop
                });

	        if (!g_bEnableTrelloSync) { //otherwise handled by trello sync.
	            strExecute = "UPDATE BOARDS set name=? where idBoard=?";
	            tx.executeSql(strExecute, [row.strBoard, row.idBoard],
                    null,
                    function (tx2, error) {
                        logPlusError(error.message);
                        return true; //stop
                    });
	        }
	    }

	    insertHistory(tx, data, row, bFromSource);

	    function markAsSynced(txParam) {
	        assert(bFromSource);
	        //note: consider case when row was initially inserted from UI and later synced from ss. 
	        txParam.executeSql("UPDATE HISTORY SET bSynced=1 WHERE idHistory=? AND bSynced=0", [row.idHistory],
                function (tx2, resultSet) { },
                function (tx2, error) {
                    logPlusError(error.message);
                    return true; //stop
                }
            );
	    }

	    //review zig: consider doing the etype/card/history updates for moves/renames as a 2nd pass. store in globals table last history's rowid processed in the 2nd pass
	    //and here and in dbopen do the 2nd pass when needed. currently the transaction nestings make it hard to control the order of operations and higher levels seeing changes in db
	    //from lower levels.
	    //end review
	    function insertHistory(tx, data, row, bFromSource) {
	        var strExecute = "INSERT OR IGNORE INTO HISTORY (idHistory, date, idBoard, idCard, spent, est, user, week, month, comment, bSynced, eType, keyword) \
				VALUES (? , ? , ? , ? , ? , ? , ? ,? , ?, ?, ?, ?, ?)";
	        //note that when writting rows from the UI (not the spreadsheet) we dont set bSynced=1 right away, instead we wait until we read that row from the ss to set it
	        var bSynced = (bFromSource ? 1 : 0);
	        //bSynced arquitecture note: bSynced denotes if the row came from the spreadsheet. When it doesnt come from the ss, it comes from
	        //the user interface, which will eventually be written to the ss, and eventually read again and set the 0 into 1 below.
	        //
	        //idBoard note: idBoard should always match the db card.idBoard, however for short periods this may not be the case.
	        //the strategy here is to always trust the idBoard if it came from the interface (plus S/E card bar of current user), because the db has a higher chance of being wrong (pending sync)
	        //but if the row comes from the spreadsheet, we will correct the row (if needed) to match the card's idBoard. Later, trello sync will take care of correcting it again if the card's board changes.
	        var eTypeRow = ETYPE_NONE; //initial hint. can be changed later below.
	        if (row.comment && row.comment.indexOf(g_prefixCommentTransfer) >= 0)
	            eTypeRow = ETYPE_NEW; //only a hint. minor optimization to later it doesnt need to change it
	        tx.executeSql(strExecute, [row.idHistory, Math.floor(row.date), row.idBoard, row.idCard, row.spent, row.est, row.user, row.week, row.month, row.comment, bSynced, eTypeRow, row.keyword],
                function onOkInsertHistory(tx2, resultSet) {
                    if (resultSet.rowsAffected != 1) { //is row there already?
                        if (bFromSource)
                            markAsSynced(tx2); //validating as synced the row that already was in the db if we just read this row from the spreadsheet
                        return; //note that insertId is set to a bogus id in this case. happens when the insert was ignored. those can happen when the row was already here
                    }
                    //new row in history table inserted.
                    cInsertedTotal++;
                    var rowInner = row;
                    //console.log("idBoard history:"+rowInner.idBoard);
                    var rowidInner = resultSet.insertId;
                    if (!idMemberMapByName[row.user] && row.user.indexOf(g_deletedUserIdPrefix) != 0) { //review zig duplicated. consolidate
                        idMemberMapByName[row.user] = g_prefixCustomUserId + row.user; //add it so we dont keep adding it for next rows
                        createNewUser(row.user, tx2);
                    }
                    //must do this only when history is created, not updated, thus its in here and not outside the history insert.
                    if (rowInner.idCard != ID_PLUSBOARDCOMMAND) {
                        if (rowidLastInserted == null || rowidInner > rowidLastInserted) {
                            if (rowInner.user != g_userTrelloBackground || row.comment.indexOf("[by ") >= 0 || row.comment.indexOf(PREFIX_ERROR_SE_COMMENT) >= 0) //comments by the user dont count, unless they were made by another user in the name of the user
                                rowidLastInserted = rowidInner;
                        }
                        if (!bFromTrelloComments) {
                            handleCardCreatedUpdatedMoved(data, rowInner, bFromSpreadsheet, tx2, function (cardData) {
                                handleUpdateCardBalances(rowInner, rowidInner, tx2, cardData.name);
                            });
                        }
                        else {
                            handleUpdateCardBalances(rowInner, rowidInner, tx2, row.strCard);
                        }
                    }
                    else {
                        handleBoardCommand(rowInner, rowidInner, tx2, !bFromSource, function (rowidError) {
                            if (rowidLastInserted == null || rowidError > rowidLastInserted)
                                rowidLastInserted = rowidError; //we skipped setting this for commands, but we do want to show error commands as 'new rows'
                        });
                    }
                },
                function onError(tx2, error) {
                    logPlusError(error.message);
                    return true; //stop
                }
            );
	    }
	}

	function processBulkInsert(tx) {
		var step = 250; //avoid a massive transacion (should use less ram i guess). relevant only in first-sync case or reset
		var iRowQueueDeleteMost = -1; //sentinel value
		var cRowsMaxLoop = i + step;
		if (cRowsMaxLoop > cRows)
			cRowsMaxLoop = cRows;

        //note: spreadsheet row parsing does not yet support the new commands, and board commands are undocumented.
		//note about commands: when processing commands, we need to reference data from previous commands (eg [un]markboard)
		//and some of that data is created in secondary handlers, thus the primary handler in the row loop wont see the data as it hasnt
		//been created yet, (being async, primary handlers excute all first, then secondary)
		//thus, in this loop we will break after encountering a 2nd board command.
		var cBoardCommands = 0;
		for (; i < cRowsMaxLoop; i++) {
			var rowLoop = rows[i];
			if (rowLoop.idCard == ID_PLUSBOARDCOMMAND)
			    cBoardCommands++;
			if (cBoardCommands > 1)
				break; //dont allow two commands on the same transaction
			if (rowLoop.idHistory == "") { //this really cant happen, an empty row would have been refused at parse time (before this)
			    i = cRows; //force stop of toplevel closure
				break;
			}
			cProcessedTotal++;
			processCurrentRow(tx, rowLoop);
			if (rowLoop.iRow !== undefined && rowLoop.iRow > iRowQueueDeleteMost) //iRow can be zero so check against undefined
			    iRowQueueDeleteMost = rowLoop.iRow;
		}
		if (iRowQueueDeleteMost >= 0) {
		    tx.executeSql("DELETE FROM QUEUEHISTORY WHERE iRow <= ?", [iRowQueueDeleteMost],
                null,
                function (tx2, error) {
                    logPlusError(error.message);
                    return true; //stop
                });
		}

	}

	function errorTransaction() {
		logPlusError("error in insertIntoDB");
		sendResponse({ status: "error: insertIntoDB." });
	}

	function okTransaction() {
	    if (ssInfo !== undefined) { //undefined when inserting from interface, not spreadsheet
	        var allSsData = getRowSSEndLastData();
	        allSsData[ssInfo.indexMap] = ssInfo.iRowEndLastSpreadsheet + cProcessedTotal;
	        saveRowSSEndLastData(allSsData);
	    }

		if (rowidLastInserted !== null) {
		    var pair = {};
		    pair["rowidLastHistorySynced"] = rowidLastInserted;
		    chrome.storage.local.set(pair, function () {});
		}

		if (i < cRows) {
		    g_db.transaction(processBulkInsert, errorTransaction, okTransaction);
		} else {
		    var messageResponse = { bBroadcasted: true, event: EVENTS.NEW_ROWS, status: STATUS_OK, cRowsNew: cInsertedTotal, rowidLastInserted: rowidLastInserted, statusLastTrelloSync: g_syncStatus.strLastStatus };
		    sendResponse(messageResponse);
		    broadcastMessage(messageResponse);
		    if (cInsertedTotal>0)
		        notifyFinishedDbChanges(true); //note it doesnt do it for each transaction, thus its not a bulletproof of telling if something changed.
		}
	}

	function start() {
	    var sql = "SELECT idMemberCreator,username, dateSzLastTrello FROM USERS";
	    handleGetReport({ sql: sql, values: [] },
            function (response) {
                if (response.status != STATUS_OK) {
                    sendResponse(response);
                    return;
                }
                for (var i=0; i < response.rows.length; i++) {
                    var row =  response.rows[i];
                    idMemberMapByName[row.username] = row.idMemberCreator;
                }
                g_db.transaction(processBulkInsert, errorTransaction, okTransaction);
            },
            true);
	    
	}

	start();
}

function createNewUser(nameUser, tx) {
    //insert a new fake user. Note that user.dateSzLastTrello is set to empty so that its "less" than any future date captured from a card comment
    tx.executeSql("INSERT OR IGNORE INTO USERS (idMemberCreator,username, dateSzLastTrello) VALUES (?,?,?)", [g_prefixCustomUserId + nameUser, nameUser, ""],
                            function (tx2, resultSet) {
                            },
                            function (tx2, error) {
                                logPlusError(error.message);
                                return true; //stop
                            }
                        );
}


/* old board commands (undocumented) still here in case we reuse this code later.
 *
 * this code is tricky because rows sometimes refer to previous rows that were just commited, and sometimes
 * needs to undo changes.
 **/
function handleBoardCommand(rowInnerParam, rowidInner, tx, bThrowErrors, callbackOnError) {
	//note on mark balances. defining sums of S/E by history rowid makes it a strict mark that cant be changed with back-reporting (-3d etc)
	var rowInner = rowInnerParam;
	var rowidHistory = rowidInner;
	var userMarked = rowInner.user;
	var comment = rowInner.comment;
	var idBoard = rowInner.idBoard; //note: if the card where the activity was entered is later moved to another board, we use the old board. thats intended.
	var date = rowInner.date;
	var patt = /^(\[by ([^ \t\r\n\v\f]+)\][ \t]+)?\^(markboard|unmarkboard)([ \t]+(.*))?/;
	var rgResults = patt.exec(comment);

    //review zig bThrowErrors needs to be implemented before enabling entering commands from interface (in burndowns)
	function restoreHistoryCard(strError, tx) {

	    if (strError) {
	        tx.executeSql("UPDATE HISTORY SET comment= '" + PREFIX_ERROR_SE_COMMENT + strError + "] '|| comment WHERE rowid=?", [rowidHistory],
                            function (tx2, resultSet) {
                            },
                            function (tx2, error) {
                                logPlusError(error.message);
                                return true; //stop
                            }
                        );
	    }

	    if (!rowInner.idCardOrig) //can restore only if it was saved
	        return;

	    tx.executeSql("UPDATE HISTORY SET idCard=? WHERE rowid=?", [rowInner.idCardOrig,rowidHistory],
						function (tx2, resultSet) {
						},
						function (tx2, error) {
						    logPlusError(error.message);
						    return true; //stop
						}
					);
	    callbackOnError(rowidHistory);
	}

	if (rgResults == null) {
	    restoreHistoryCard("bad command format", tx);
	} else {
	    var userMarking = rgResults[2] || userMarked;
	    var commandBoard = rgResults[3];
	    var nameMarker = (rgResults[5] || "").trim();
	    var nameMarkerUpper = nameMarker.toUpperCase();


	    //note: this is not enforced by unique index, so in theory there could be a duplicate BOARDMARKERS row inserted (very rare)
	    var strExecute = "SELECT rowid,dateStart,rowidHistoryStart,spentStart,estStart,nameMarker FROM BOARDMARKERS WHERE idBoard=? AND userMarking=? AND userMarked=? AND UPPER(nameMarker)=? AND dateEnd IS NULL";
	    tx.executeSql(strExecute, [idBoard, userMarking, userMarked, nameMarkerUpper],
			function (tx2, resultSet) {
			    var length = resultSet.rows.length;
			    var rowMarker = null;
			    if (length > 0)
			        rowMarker = resultSet.rows.item(0);

			    if (commandBoard == "markboard") {
			        if (rowMarker != null) {
			            restoreHistoryCard("open marker already exists", tx2);
			            return;
			        }
			        //insert marker
			        var strExecute2 = "INSERT INTO BOARDMARKERS (idBoard, dateStart, rowidHistoryStart, spentStart, estStart,\
						dateEnd, rowidHistoryEnd, spentEnd, estEnd, nameMarker, userMarked, userMarking)  \
							SELECT ?, ?, ?, SUM(h.spent), sum(h.est), NULL, NULL, NULL, NULL, ?, ?, ? FROM history h JOIN cards c ON h.idCard=c.idCard WHERE h.idBoard=? AND h.user=? AND h.rowid < ? AND c.name NOT LIKE '%[R]%'";
			        var values2 = [idBoard, date, rowidHistory, nameMarker, userMarked, userMarking, idBoard, userMarked, rowidHistory];
			        tx2.executeSql(strExecute2, values2,
						function (tx3, resultSet) {
						},
						function (tx3, error) {
						    logPlusError(error.message);
						    return true; //stop
						}
					);
			        return;
			    } else if (commandBoard == "unmarkboard") {
			        if (rowMarker == null) {
			            restoreHistoryCard("no such open marker to close", tx2);
			            return;
			        }
			        //close marker  INTO CARDS (idCard, idBoard, name) VALUES (? , ? , ?)
			        var strExecute2Unmark = "\
					INSERT OR REPLACE INTO BOARDMARKERS (rowid,idBoard,dateStart,rowidHistoryStart,spentStart,estStart, \
					dateEnd,rowidHistoryEnd,spentEnd,estEnd,nameMarker,userMarked,userMarking) \
					SELECT ?,?,?,?,?,?,?,?,SUM(h.spent), SUM(h.est), ?,?,? FROM history h JOIN cards c on h.idCard=c.idCard WHERE h.idBoard=? AND h.user=? AND h.rowid < ? AND c.name NOT LIKE '%[R]%'";
			        var values2Unmark = [rowMarker.rowid, idBoard, rowMarker.dateStart, rowMarker.rowidHistoryStart, rowMarker.spentStart, rowMarker.estStart,
									date, rowidHistory, rowMarker.nameMarker, userMarked, userMarking, idBoard, userMarked, rowidHistory];
			        tx2.executeSql(strExecute2Unmark, values2Unmark,
						function (tx3, resultSet) {
						},
						function (tx3, error) {
						    logPlusError(error.message);
						    return true; //stop
						}
					);
			        return;
			    } else {
                    //note: currently theres no way to get here (in trello comment mode but yes from spreadsheets) as plus commands are filtered earlier before queued
			        restoreHistoryCard("unknown command", tx);
			    }
			},
			function (tx2, error) {
			    logPlusError(error.message);
			    return true; //stop
			}
		);
	}
}

function handleWriteLogToPlusSupport(request, sendResponse) {
    var sql = "select date,message FROM LOGMESSAGES order by date DESC"; //desc because it could be truncated on a long log. We want to receive the latest entries.
    var query = { sql: sql, values: [] };
    handleGetReport(query,
        function (response) {
            if (response.status != STATUS_OK) {
                sendResponse(response);
                return;
            }

            var rgPostPublicLog = [];
            if (response.rows && response.rows.length > 0) {
                response.rows.forEach(function (row) {
                    var strDate = new Date(row.date * 1000).toGMTString();
                    var strMessage = strDate + " " + row.message;
					// < > break ss api.
                    strMessage = replaceString(strMessage, /[<>]/g, "-");
                    rgPostPublicLog.push(strMessage);
                });
            }
            if (rgPostPublicLog.length > 0)
                startWritePublicLog(rgPostPublicLog);
            else
                response.status = "Nothing to send!";
            sendResponse(response);
        },
        true);
}

function handleDeleteAllLogMessages(request, sendResponse) {
	var db = g_db;
	var ret = { status: "" };
	if (db == null) {
	    ret.status = "error: handleDeleteAllLogMessages no g_db";
		logPlusError(ret.status);
		sendResponse(ret);
		return;
	}

	db.transaction(function (tx) {
		var strExecute = "DELETE FROM LOGMESSAGES";
		tx.executeSql(strExecute, []);
	},

	function errorTransaction() {
		ret.status = "Error while deleting logmessages";
		logPlusError(ret.status);
		sendResponse(ret);
		return;
	},

	function okTransaction() {
		ret.status = STATUS_OK;
		sendResponse(ret);
		return;
	});
}

function handleDeleteDB(request, sendResponseParam) {
    g_bOpeningDb = true;

    function sendResponse(response) {
        g_bOpeningDb = false;
        sendResponseParam(response);
    }

	var db = g_db;
	if (db == null) {
	    db = rawOpenDb(); //open it without migration. maybe migration failed before
	}

	if (!db) {
        //in theory it cant get here
	    logPlusError("handleDeleteDB no db");
	    sendResponse({ status: "error: handleDeleteDB no g_db" });
	    return;
	}
	var versionCur = parseInt(db.version,10) || 0;
	db.changeVersion(versionCur, 0, function (t) {
	    //not deleting LOGMESSAGES
        //not deleting USERS. useful when resetting plus and there are deleted users (to restore the orginal name to the idMember in card comments)
	    t.executeSql('DROP TABLE IF EXISTS BOARDMARKERS');
	    t.executeSql('DROP TABLE IF EXISTS QUEUEHISTORY');
		t.executeSql('DROP TABLE IF EXISTS HISTORY');
		t.executeSql('DROP TABLE IF EXISTS CARDBALANCE');
		t.executeSql('DROP TABLE IF EXISTS LISTCARDS');
		t.executeSql('DROP TABLE IF EXISTS LISTS');
		t.executeSql('DROP TABLE IF EXISTS CARDS');
		t.executeSql('DROP TABLE IF EXISTS BOARDS');
		t.executeSql('DROP TABLE IF EXISTS LABELCARD');
		t.executeSql('DROP TABLE IF EXISTS LABELS');
		t.executeSql('DROP TABLE IF EXISTS TEAMS');
		t.executeSql('DROP TABLE IF EXISTS GLOBALS');
		t.executeSql('DROP TABLE IF EXISTS USERS'); //review zig: used to keep the non-custom in 2.12.1 but I removed as it could cause problems if somehow users table is not created
	}, function (err) {
		if (console.error)
			console.error("Error!: %s", err.message);
		sendResponse({ status: "error: handleDeleteDB" });
	}, function () {
	    saveRowSSEndLastData({}); //just in case, thou should be set also when opening the db on migration 1.
		g_db = null;
		sendResponse({ status: STATUS_OK });
	});
}


function insertLogMessages(log, callback) {
	var ret = { status: "" };
	var db = g_db;
	if (db == null) {
		ret.status = "Error: no db open yet";
		callback(ret);
		return;
	}

	var logLocal = g_plusLogMessages;

	if (log.length == 1 && log[0] == null) { //review zig: doesnt happen anymore
		log = [];
		logLocal = [];
	}

	if (logLocal.length == 0 && log.length == 0) {
		ret.status = STATUS_OK;
		callback(ret);
		return;
	}

	db.transaction(function (tx) {
		var i = 0;
		var logs = [logLocal, log]; //commit our own log too.
		var j = 0;
		for (; j < logs.length; j++) {
			var logCur = logs[j];
			for (i = 0; i < logCur.length; i++) {
				var entry = logCur[i];
				var strExecute = "INSERT INTO LOGMESSAGES (date, message) \
				VALUES (?, ?)";
				tx.executeSql(strExecute, [Math.round(entry.date / 1000), entry.message]);
			}
		}
	},

	function errorTransaction() {
		ret.status = "Error while inserting logmessages";
		callback(ret);
		return;
	},

	function okTransaction() {
		g_plusLogMessages = [];
		ret.status = STATUS_OK;
		callback(ret);
		return;
	});
}

function startWritePublicLog(messages) {
    var merged = messages.join("\n\n");
    var maxLength = 4000;
    if (merged.length > maxLength)
        merged = merged.substring(0, maxLength);
    var urlForm = "https://docs.google.com/forms/d/1IpMQnmIKXVXeDeKhZRxWFK1-YAg8aGnqFlZbX9lUUP8/viewform?entry.1934000221=" + encodeURIComponent(merged);
    window.open(urlForm,"_blank");
}

function convertDowStart(dowStart,dowDelta, sendResponse, response) {
    if (!g_db) {  //dont use isDbOpened since its called while opening
        var error = "db not open";
        logPlusError(error);
        response.status = error;
        sendResponse(response);
        return;
    }

    var sql = "SELECT rowid,date from HISTORY";
    g_db.transaction(function (tx) {
        tx.executeSql(sql, [],
			function (tx2, results) {
			    var i = 0;
			    for (; i < results.rows.length; i++) {
			        var item = results.rows.item(i);
			        var dateCur = new Date(item.date * 1000);
			        tx2.executeSql("UPDATE HISTORY SET week=? WHERE rowid=?", [getCurrentWeekNum(dateCur, dowStart, dowDelta),item.rowid],
                        function (tx3, results) {
                            //nothing
                        },
                        function (tx3, error) {
                            logPlusError(error.message);
                            return true; //stop
                        });
			    }
			},
			function (tx2, error) {
			    logPlusError(error.message + " sql: " + sql);
			    return true; //stop
			});


        var sql2 = "UPDATE GLOBALS SET dowStart=?, dowDelta=?";
        tx.executeSql(sql2, [dowStart, dowDelta],
           function (tx2, results) {
           },
           function (tx2, error) {
               logPlusError(error.message + " sql: " + sql2);
               return true; //stop
           });
    },

	function errorTransaction() {
	    response.status = "error: convertDowStart";
	    logPlusError(response.status);
	    sendResponse(response);
	},

	function okTransaction() {
	    response.dowStart = dowStart;
	    response.dowDelta = dowDelta;
	    DowMapper.setDowStart(dowStart, dowDelta); //init background's version of this global
	    sendResponse(response);
	});
}

var g_bOpeningDb = false;

function rawOpenDb() {
    return openDatabase('trellodata', '', 'Trello database', 100 * 1024 * 1024); //100mb though extension asks for unlimited so it should grow automatically.
}

function handleOpenDB(options, sendResponseParam, cRetries) {
    function doit() {
        loadBackgroundOptions(function () {
            handleOpenDBWorker(options, sendResponseParam, cRetries);
        });
    }

    if (!g_bPlusExtensionLoadedOK) {
        //in case it is timing related, give it one breath
        console.log("Unusual: !g_bPlusExtensionLoadedOK in handleOpenDB");
        if (!g_bRetryWhenNotLoadedOK) {
            setTimeout(function () {
                if (g_bPlusExtensionLoadedOK)
                    doit();
                else {
                    console.log("Unusual: 2nd try !g_bPlusExtensionLoadedOK in handleOpenDB");
                }
            }, 2000);
        }
        return;
    }

    doit();

    function handleOpenDBWorker(options, sendResponseParam, cRetries) {
        var db = null;
        var bDidSetOpening = false;

        if (cRetries === undefined)
            cRetries = 10;

        if (g_bOpeningDb) {
            cRetries--;
            if (cRetries < 0) {
                sendResponseParam({ status: "error: database busy, try later." });
                return;
            }
            setTimeout(function () {
                handleOpenDB(options, sendResponseParam, cRetries);
            }, 2000);
            return;
        }

        if (g_db != null) {
            handleGetTotalRows(false, sendResponse, true);
            return;
        }

        g_bOpeningDb = true; //prevent timing situations (mostly while debugging with breakpoints in background page) where the db might be partially open yet we allow opening the partial cache from another opendb call
        bDidSetOpening = true; //remember it was us

        function finalResponse(thisResponse) {
            if (thisResponse.status == STATUS_OK) {
                if (db) {//db null returning the cache
                    g_db = db; //cache forever
                    if (localStorage[LS_KEY_detectedErrorLegacyUpgrade]) {
                        handleShowDesktopNotification({
                            notification: "Plus detected a migration error. 'Reset sync' from Utilities in Plus help to recover missing legacy S/E rows.",
                            timeout: 10000
                        });
                    }
                }
            }
            else if (g_db && g_db == db) //review zig ideally we should store the cache above only but there are dependencies with g_db used within funcions called that expect g_db set
                g_db = null; //on error clear the cache that we set just before.
            if (bDidSetOpening)
                g_bOpeningDb = false;
            updatePlusIcon();
            checkAnalyticsActive();
            sendResponseParam(thisResponse);
        }

        function sendResponse(thisResponse) {
            if (thisResponse.status != STATUS_OK) {
                finalResponse(thisResponse);
                return;
            }
            //wrapper to handle db conversion on dowStart mismatch
            //review zig: currently called also when g_db is already cached. when fixed, consider case where this fails (thisResponse.status)
            var sql = "select dowStart, dowDelta FROM GLOBALS LIMIT 1";
            var request = { sql: sql, values: [] };
            handleGetReport(request,
                function (response) {
                    if (response.status == STATUS_OK && response.rows && response.rows.length == 1) {
                        var dowStart = response.rows[0].dowStart;
                        var dowDelta = response.rows[0].dowDelta;
                        if (!(dowStart === undefined || dowStart < 0 || dowStart > 6)) {
                            if (options && typeof (options.dowStart) == "number" && (options.dowStart != dowStart || options.dowDelta != dowDelta)) {
                                assert(options.dowDelta !== undefined);
                                convertDowStart(options.dowStart, options.dowDelta, finalResponse, thisResponse);
                                return;
                            }
                            else {
                                DowMapper.setDowStart(dowStart, dowDelta); //init background version of the global
                                thisResponse.dowStart = dowStart;
                                thisResponse.dowDelta = dowDelta;
                                finalResponse(thisResponse);
                                return;
                            }
                            assert(false); //should never get here
                        }
                    }
                    if (response.status == STATUS_OK)
                        thisResponse.status = "error";
                    finalResponse(thisResponse);
                },
                true);
            return;
        }

        function PreHandleGetTotalRows(response) {
            if (response.status != STATUS_OK) {
                sendResponse(response);
                return;
            }
            assert(db);
            g_db = db; //cache temporarily. might be reverted to null later. review zig: would be best to cache it later only, but there is code afterwards that depends on the global, like handleGetTotalRows
            insertPendingSERows(function (responseInsertSE) {
                handleGetTotalRows(false, sendResponse, true); //note we ignore responseInsertSE. failure to insert pending rows shouldnt prevent opening the db. a later sync will insert them before sync starts
            },
            true); //allow calling during db opening
        }

        if (g_callbackOnAssert == null)
            g_callbackOnAssert = notifyTruncatedSyncState;

        db = rawOpenDb();
        var versionCur = parseInt(db.version, 10) || 0;

        var M = new Migrator(db, PreHandleGetTotalRows);
        //note: use SELECT * FROM sqlite_master to list tables and views in the console.
        //review zig: if the migration fails, we dont detect it and never call it again. shouldnt fail but its desastrous if it does.
        //NOTE: remember to update handleDeleteDB and properly use CREATE TABLE IF NOT EXISTS
        M.migration(1, function (t) {
            //delete old saved tokens (Before we used chrome.identity)
            var scopeOld = encodeURI("https://spreadsheets.google.com/feeds/");
            delete localStorage["oauth_token" + scopeOld];
            delete localStorage["oauth_token_secret" + scopeOld];

            saveRowSSEndLastData({}); //reset when creating database

            t.executeSql('CREATE TABLE IF NOT EXISTS BOARDS ( \
							idBoard TEXT PRIMARY KEY  NOT NULL, \
							name TEXT  NOT NULL \
							)');

            //FOREIGN KEY (idBoard) REFERENCES BOARDS(idBoard) not supported by chrome
            t.executeSql('CREATE TABLE IF NOT EXISTS CARDS ( \
							idCard TEXT PRIMARY KEY  NOT NULL, \
							idBoard TEXT NOT NULL, \
							name TEXT  NOT NULL \
							)');

            //FOREIGN KEY (idCard) REFERENCES CARDS(idCard) not supported by chrome
            //NOTE: HISTORY.idCard could be ID_PLUSBOARDCOMMAND, in which case the card wont exist in CARDS. consider when joining etc.
            //HISTORY.idHistory, in the case of card comment sync, is the action id. but it can also be actionId-actionResetId, where actionResetId is
            //the action that caused a card reset and re-read of card history
            t.executeSql('CREATE TABLE IF NOT EXISTS HISTORY ( \
							idHistory TEXT PRIMARY KEY  NOT NULL, \
							date INT   NOT NULL, \
							idBoard TEXT NOT NULL, \
							idCard TEXT NOT NULL, \
							spent REAL  NOT NULL,\
							est REAL  NOT NULL,\
							user TEXT NOT NULL,\
							week TEXT NOT NULL, \
							month TEXT NOT NULL, \
							comment TEXT NOT NULL \
							)');

            //CARDBALANCE only keeps track of cards with pending balance per user, or balance per user issues (negative Spent, etc)
            t.executeSql('CREATE TABLE IF NOT EXISTS CARDBALANCE ( \
							idCard TEXT NOT NULL, \
							user TEXT NOT NULL, \
							spent REAL  NOT NULL,\
							est REAL  NOT NULL,\
							diff REAL NOT NULL, \
							date INT NOT NULL \
							)');

            //these two will be created later, but there are timing issues where they could be used while migration happens.
            //review zig: establish practice of creating all tables and indexes here, and keep duplicating for migration. except sqlite doesnt support "if not exists" for add column
            t.executeSql('CREATE TABLE IF NOT EXISTS GLOBALS ( \
							dowStart INT NOT NULL \
							)');

            t.executeSql('CREATE TABLE IF NOT EXISTS LOGMESSAGES ( \
							date INT NOT NULL, \
							message TEXT NOT NULL \
							)');
        });


        M.migration(2, function (t) {
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_histByDate ON HISTORY(date DESC)'); //global history
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_histByCard ON HISTORY(idCard,date DESC)'); //used by sync code when inserting new rows (where it updates idBoard), also for card history
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_histByUserCard ON HISTORY(user, date DESC)'); //for drilldowns into users history by admins
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_histByWeekUser ON HISTORY(week,user,date DESC)'); //for weekly report and (date) drill-down
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_histByBoardUser ON HISTORY(idBoard, date ASC)'); //for board history
            t.executeSql('CREATE UNIQUE INDEX IF NOT EXISTS idx_cardbalanceByCardUserUnique ON CARDBALANCE(idCard, user ASC)'); //for insert integrity
        });


        M.migration(3, function (t) {
            t.executeSql('ALTER TABLE HISTORY ADD COLUMN bSynced INT DEFAULT 0');  // 0 == ETYPE_NONE
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_histBySynced ON HISTORY(bSynced ASC)'); // to quickly find un-synced 
        });


        M.migration(4, function (t) {
            //bug in v2.2 caused bad row ids. fix them.
            var strFixIds = "UPDATE HISTORY set idHistory='id' || replace(idHistory,'-','') WHERE bSynced=0";
            t.executeSql(strFixIds, [], null,
                function (t2, error) {
                    logPlusError(error.message);
                    return true; //stop
                }
            );
        });


        M.migration(5, function (t) {
            t.executeSql('CREATE TABLE IF NOT EXISTS LOGMESSAGES ( \
							date INT NOT NULL, \
							message TEXT NOT NULL \
							)');
        });

        M.migration(6, function (t) {
            //BOARDMARKERS use rowid to calculate the SUMs for S/E instead of dates so that once a marker is started or stopped and calculated,
            // it wont be modified by back-reporting (-1d etc)
            //because rows are never deleted, sqLite will always autoincrement rowids, thus we can filter by them (http://sqlite.org/autoinc.html)
            t.executeSql('CREATE TABLE IF NOT EXISTS BOARDMARKERS ( \
							idBoard INT NOT NULL, \
							dateStart INT NOT NULL, \
							rowidHistoryStart INT NOT NULL, \
							spentStart REAL  NOT NULL,\
							estStart REAL  NOT NULL,\
							dateEnd INT, \
							rowidHistoryEnd INT, \
							spentEnd REAL,\
							estEnd REAL,\
							nameMarker TEXT NOT NULL, \
							userMarked TEXT NOT NULL, \
							userMarking TEXT NOT NULL \
							)');

            //dateEnd NULL iff marker is open
            //index note: would be cool to use sqlite partial indexes so we enforce uniqueness only on open markers, but its not supported in chrome
            //because the sqlite version in chrome is 3.7.x and partial indexes are supported from 3.8.0 (http://www.sqlite.org/partialindex.html)
            //currently we manually enforce the unique name on (userMarking, userMarked, nameMarker) WHERE dateEnd IS NULL (open markers)
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_boardmarkersByBoard ON BOARDMARKERS(idBoard, userMarking, userMarked, nameMarker, dateEnd)'); //fast finds and row commit
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_boardmarkersByUserMarked ON BOARDMARKERS(userMarked, dateEnd)'); //fast finds
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_boardmarkersByUserMarking ON BOARDMARKERS(userMarking, dateEnd)'); //fast finds
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_cardsByBoard ON CARDS(idBoard, idCard)'); //future fast join/filter by board
        });

        M.migration(7, function (t) {
            t.executeSql("ALTER TABLE HISTORY ADD COLUMN eType INT");
            updateAllETypes(t);
        });

        M.migration(8, function (t) {
            t.executeSql("drop INDEX IF EXISTS idx_cardbalanceByCardUserDiff");
            t.executeSql("drop INDEX IF EXISTS idx_cardbalanceByCardUserSpent");
            t.executeSql("drop INDEX IF EXISTS idx_cardbalanceByCardUserEst");
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_cardbalanceByCardUserSpent_new ON CARDBALANCE(user ASC, spent ASC)'); //for fast reports
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_cardbalanceByCardUserEst_new ON CARDBALANCE(user ASC, est ASC)'); //for fast reports
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_cardbalanceByDate ON CARDBALANCE(date DESC)'); //for fast reports
        });

        M.migration(9, function (t) {
            t.executeSql("drop INDEX IF EXISTS idx_histByBoardRowId");
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_histByBoardRowId_new ON HISTORY(idBoard, user ASC, week DESC)'); //report and to calculate board mark balances. note sqlite doesnt allow including rowid here.

        });

        M.migration(10, function (t) {
            //dowStart: day that a week starts. Default to 0=sunday. Needs to be part of the db as history.week depends on this.
            t.executeSql('CREATE TABLE IF NOT EXISTS GLOBALS ( \
							dowStart INT NOT NULL \
							)', []);
        });

        M.migration(11, function (t) {
            //due to a (rare) bug in db v10, we need to recreate the globals row here
            t.executeSql('select dowStart FROM GLOBALS', [], function (tx2, results) {
                if (!results.rows || results.rows.length == 0)
                    tx2.executeSql("INSERT INTO GLOBALS (dowStart) VALUES (0)");
            });
        });

        M.migration(12, function (t) {
            updateCardRecurringStatusInHistory(t);
        });

        M.migration(13, function (t) {
            //dateSzLastTrello is a text date (iso datetime like 2007-06-09T17:46:2.123)
            t.executeSql('ALTER TABLE CARDS ADD COLUMN dateSzLastTrello TEXT DEFAULT NULL');
            t.executeSql("ALTER TABLE CARDS ADD COLUMN idList TEXT DEFAULT '" + IDLIST_UNKNOWN + "' NOT NULL");
            t.executeSql('ALTER TABLE CARDS ADD COLUMN bArchived INT DEFAULT 0');
            t.executeSql('ALTER TABLE CARDS ADD COLUMN idLong TEXT DEFAULT NULL');

            //NOTE: board dateSzLastTrello is always 1 ms behind the last action processed, so that we find idActionLast
            //REVIEW zig: should be cleaned up so the regular date is stored, and when needed substract the ms
            t.executeSql('ALTER TABLE BOARDS ADD COLUMN dateSzLastTrello TEXT DEFAULT NULL');
            t.executeSql('ALTER TABLE BOARDS ADD COLUMN idActionLast TEXT DEFAULT NULL');
            t.executeSql('ALTER TABLE BOARDS ADD COLUMN bArchived INT DEFAULT 0');
            t.executeSql('ALTER TABLE BOARDS ADD COLUMN idLong TEXT DEFAULT NULL');

            //idList IDLIST_UNKNOWN is unique, (there isnt one per board)
            t.executeSql('CREATE TABLE IF NOT EXISTS LISTS (idList TEXT PRIMARY KEY, idBoard TEXT NOT NULL, name TEXT NOT NULL, dateSzLastTrello TEXT, bArchived INT DEFAULT 0)');
            //REVIEW ZIG post beta t.executeSql('CREATE TABLE IF NOT EXISTS LISTCARDS (idList TEXT NOT NULL,  idCard TEXT NOT NULL, dateSzIn TEXT NOT NULL, dateSzOut TEXT, userIn TEXT NOT NULL, userOut TEXT)');

            //these two arent unique as it could contain unknown. unique is a remnant from old versions
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_cardsIdLongUnique ON CARDS(idLong)'); //for integrity
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_boardsIdLongUnique ON BOARDS(idLong)'); //for integrity

            //REVIEW ZIG post beta t.executeSql('CREATE UNIQUE INDEX IF NOT EXISTS idx_listCardsDateSzInUnique ON LISTCARDS(idCard, dateSzIn)'); //for insert integrity
            //note that CARDS.idList should always be equal to LISTCARDS.idList where dateSzOut is null
            //REVIEW ZIG post beta t.executeSql('CREATE UNIQUE INDEX IF NOT EXISTS idx_listCardsDateSzOutUnique ON LISTCARDS(idCard, dateSzOut)'); //for integrity and to guarantee null dateSzOut unique
            t.executeSql("INSERT OR REPLACE INTO BOARDS (idBoard, idLong, name) VALUES (?,?,?)", [IDBOARD_UNKNOWN, IDBOARD_UNKNOWN, STR_UNKNOWN_BOARD]); //cant fail since  the id cant be used by trello
            t.executeSql("INSERT OR REPLACE INTO LISTS (idList, idBoard, name) VALUES (?,?,?)", [IDLIST_UNKNOWN, IDBOARD_UNKNOWN, STR_UNKNOWN_LIST]); //cant fail since  the ids cant be used by trello

        });

        M.migration(14, function (t) {
            //dateSzLastTrello is a text date (iso datetime like 2007-06-09T17:46:2.123)
            t.executeSql('ALTER TABLE CARDS ADD COLUMN bDeleted INT DEFAULT 0');
        });

        M.migration(15, function (t) {
        });

        M.migration(16, function (t) {
            //rare timing when using trello sync and other team users write new history rows with outdated card info (idBoard or card.name)
            //card name change can affect [R] thus recalculate all etypes
            //also in very rare cases, plus missed a recurring state change leaving the card history with incorrect etypes. that was fixed so upgrade data.
            updateCardRecurringStatusInHistory(t);
            t.executeSql("update HISTORY set idBoard=(select CARDS.idBoard from CARDS WHERE CARDS.idCard=HISTORY.idCard) WHERE HISTORY.idCard <> '" + ID_PLUSBOARDCOMMAND + "'");
        });

        M.migration(17, function (t) {
            //to simplify v3 code, convert history ids by removing user from the end of the history id,
            //"idc"+messageId+user   to   "idc"+messageId
            //this allows stronger handling when trello users are renamed. there is no need of the user in there.
            t.executeSql("update HISTORY set idHistory = replace(idHistory, user, '') where idHistory like 'idc%' and replace(idHistory, user, '')||user=idHistory");
        });

        M.migration(18, function (t) {
            //iRow must use autoincrement to prevent rowid reuse
            //note: sqlite creates the "sqlite_sequence" table automatically because of autoincrement usage here. https://www.sqlite.org/autoinc.html 
            t.executeSql('CREATE TABLE IF NOT EXISTS QUEUEHISTORY ( \
							iRow INTEGER PRIMARY KEY AUTOINCREMENT , \
							obj TEXT NOT NULL \
							)');

            //USERS table is not yet used on history and cardbalance. there are issues to solve
            //review zig: when a user is deleted/renamed from trello, trello will remove it from previous history and a 
            //trello first sync after a user is deleted will never know the users real name.
            //Because we allow to impersonate users in S/E comments, plus wont know how to match the deleted/renamed users with those impersoanted comment users.
            //thus, we simply use this table as a cache of the last "known good" state for a user and to help detect user renames, but it isnt perfect.
            //Since this table is not deleted during "reset", further resets will continue to match deleted users by id.
            //table isnt used for anything critical as it may not be exactly equal to users in history.
            //S/E bar uses it for users list as its cleaner and faster than unique history users
            t.executeSql('CREATE TABLE IF NOT EXISTS USERS ( \
							idMemberCreator TEXT PRIMARY KEY, \
							username TEXT NOT NULL, \
                            dateSzLastTrello TEXT NOT NULL \
                            )');

            //saves keyword used when entered from card comment. for future reporting features
            t.executeSql('ALTER TABLE HISTORY ADD COLUMN keyword TEXT DEFAULT NULL');
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_histByKeyword ON HISTORY(keyword ASC, date DESC)'); //for reports
        });

        M.migration(19, function (t) {
            //bug in 2.11.1 caused to treat certain legacy rows as bad format. save it to alert the user later to reset sync
            var sql = "SELECT H.rowid FROM HISTORY H WHERE COMMENT LIKE '%[error: bad d for non-admin]%' AND keyword <> '@tareocw' LIMIT 1";
            t.executeSql(sql, [],
                    function (tx2, results) {
                        if (results.rows.length > 0)
                            localStorage[LS_KEY_detectedErrorLegacyUpgrade] = "1"; //existance of property means it detected. "reset sync" will remove it
                    },
                    function (trans, error) {
                        logPlusError(error.message + " sql: " + sql);
                        return true; //stop
                    });
        });

        M.migration(20, function (t) {
        });

        M.migration(21, function (t) {
            t.executeSql("update CARDS set idList = '" + IDLIST_UNKNOWN + "' where bDeleted=0 AND idBoard='" + IDBOARD_UNKNOWN + "'");
        });

        M.migration(22, function (t) {
            //review zig: remove by july 2015. otherwise future errors with those texts will get lost on reset
            t.executeSql("DELETE FROM LOGMESSAGES where message LIKE '%error: no idCardCur%'");
            t.executeSql("DELETE FROM LOGMESSAGES where message LIKE '%unusual: db not ready%'");
        });

        M.migration(23, function (t) {
            //review zig: remove by july 2015. otherwise future errors with those texts will get lost on reset
            t.executeSql("DELETE FROM LOGMESSAGES where message LIKE '%getBoardsLastInfoWorker%'");
            t.executeSql("DELETE FROM LOGMESSAGES where message LIKE '%error: idBoardShort:%'");
        });

        M.migration(24, function (t) {
            //review zig: remove by aug 2015. otherwise future errors with those texts will get lost on reset
            t.executeSql("DELETE FROM LOGMESSAGES where message LIKE '%at handleLoadRecent%'");
        });

        M.migration(25, function (t) {
            //review zig: remove by aug 2015. otherwise future errors with those texts will get lost on reset
            t.executeSql("DELETE FROM LOGMESSAGES where message LIKE '%property ''dowStart'' of undefined'");
        });

        M.migration(26, function (t) {
            //review zig: remove by aug 2015. otherwise future errors with those texts will get lost on reset
            //errorTransaction (trellosync.js:724
            t.executeSql("DELETE FROM LOGMESSAGES where message LIKE '%errorTransaction (trellosync.js:724%'");
            t.executeSql("DELETE FROM LOGMESSAGES where message LIKE '%property ''dowStart'' of undefined%'");
        });

        M.migration(27, function (t) {
            t.executeSql('ALTER TABLE LISTS ADD COLUMN pos REAL DEFAULT NULL');
            t.executeSql("update LISTS set pos = -1 where idList= '" + IDLIST_UNKNOWN + "' OR idBoard='" + IDBOARD_UNKNOWN + "'");
            t.executeSql('ALTER TABLE BOARDS ADD COLUMN verDeepSync INT DEFAULT ' + VERDEEPSYNC.MINVALID);
        });

        M.migration(28, function (t) {
            t.executeSql("delete from LISTS where idList like '[%'"); //fix trello bug with corrupted idLists in trello board actions
            t.executeSql("update cards set idList='" + IDLIST_UNKNOWN + "' where idList LIKE '[%'"); //ditto
        });

        M.migration(29, function (t) {
            t.executeSql('ALTER TABLE CARDS ADD COLUMN dateDue INT DEFAULT NULL');

            t.executeSql("drop INDEX IF EXISTS idx_cardbalanceByCardUserDiff_new"); //improve index by excluding zero diff entries
            });

        M.migration(30, function (t) {
            t.executeSql("drop INDEX IF EXISTS idx_cardsByDueDate"); //to re-create
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_cardsByDueDate_new ON CARDS(dateDue ASC)'); //migration 29 used to create with "where" filter which turned to be unsupported on older linux
            t.executeSql("drop INDEX IF EXISTS idx_cardbalanceByCardUserDiff_new2"); //ditto
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_cardbalanceByCardUserDiff_new3 ON CARDBALANCE(user ASC, diff ASC)'); //for updating rows on insert,reports and verifications
        });

        M.migration(31, function (t) {
            t.executeSql("DELETE FROM LOGMESSAGES where message LIKE '%property ''href'' of undefined%'");
        });

        M.migration(32, function (t) {
            //for future consistency, normalize rare-case ids that could have been generated a few days before this code was added.
            //this is so code can now always assume a pattern of %~%[.%] so move those that already looked like that so the dot is to the left of ~
            //thus one can always split on "~", then split the right side by "." SEP_IDHISTORY_MULTI
            t.executeSql("select rowid,idHistory from HISTORY where idHistory like '%~%.%'", [],
                   function (tx2, results) {
                       if (!results || !results.rows || results.rows.length == 0)
                           return;
                       for (var i = 0; i < results.rows.length; i++) {
                           var row = results.rows.item(i);
                           var partsHist = row.idHistory.split("~");
                           if (partsHist.length != 2) //should always happens
                               return;
                           var partsRight = partsHist[1].split(SEP_IDHISTORY_MULTI);
                           if (partsRight.length != 2) //should always happens
                               return;
                           var idHistoryNew = partsHist[0] + SEP_IDHISTORY_MULTI + partsRight[1] + "~" + partsRight[0];
                           tx2.executeSql("update HISTORY set idHistory=? where rowid=?",
                                                   [idHistoryNew, row.rowid],
                               function (tx3, results) {
                               },
                               function (tx3, error) {
                                   logPlusError(error.message + ": upgrading to 32 - loop");
                                   return true; //stop
                               });
                       }
                   },
                   function (tx2, error) {
                       logPlusError(error.message + ": upgrading to 32");
                       return true; //stop
                   });
        });

        M.migration(33, function (t) {
            //fix rare corruption in case a card has more than one reset sync and both are synced together in the same batch
            var mapCards = {};
            t.executeSql("select H.rowid,H.idHistory,H.idCard,H.spent,H.est,H.user,C.name as nameCard from HISTORY H JOIN CARDS C ON H.idCard=C.idCard where H.idHistory like '%~%' and (H.spent!=0 or H.est!=0) order by H.rowid DESC", [],
                   function (tx2, results) {
                       if (!results || !results.rows || results.rows.length == 0)
                           return;
                       var map = null;
                       for (var i = 0; i < results.rows.length; i++) {
                           var row = results.rows.item(i);
                           var partsHist = row.idHistory.split("~");
                           if (partsHist.length != 2) //should always happens
                               return;
                           var idTrelloCommentCommand = partsHist[1].split(SEP_IDHISTORY_MULTI)[0]; //could be in the form of idHist~idHistCommand.number
                           map=mapCards[row.idCard];
                           if (!map) {
                               map={idCommand:idTrelloCommentCommand,nameCard:row.nameCard, bModified:false};
                               mapCards[row.idCard] = map;
                           }
                           if (map.idCommand == idTrelloCommentCommand)
                               continue;
                           map.bModified = true;
                           //, eType=" + ETYPE_NONE + ", comment= '[original s/e: ' || spent || '/' || est || '] ' || comment  
                           tx2.executeSql("UPDATE history set spent=0, est=0 , eType=" + ETYPE_NONE + ", comment= '[corrected row. original s/e: ' || spent || '/' || est || '] ' || comment where rowid = ?", [row.rowid]);
                           tx2.executeSql("UPDATE CARDBALANCE SET spent=spent-?, est=est-?, diff=diff-? WHERE idCard=? AND user=?",
                               [row.spent, row.est, parseFixedFloat(row.est - row.spent), row.idCard, row.user]);
                       }

                       //fix eTypes as the patch above could have messed 1st estimate etype
                       for (var idCardCur in mapCards) {
                           if (!mapCards[idCardCur].bModified)
                               continue;
                           if (mapCards[idCardCur].nameCard.indexOf("[R]") >= 0)
                               handleMakeRecurring(tx2, idCardCur);
                           else
                               handleMakeNonRecurring(tx2, idCardCur);
                       }
                   },
                   function (tx2, error) {
                       logPlusError(error.message + ": upgrading to 33");
                       return true; //stop
                   });
        });

        M.migration(34, function (t) {
            t.executeSql("DELETE FROM LOGMESSAGES where message LIKE '%getBoardsLastInfoWorker%'");
        });

        M.migration(35, function (t) {
            //idTeam is the old idOrganization in Trello
            t.executeSql('CREATE TABLE IF NOT EXISTS TEAMS ( \
							idTeam TEXT PRIMARY KEY NOT NULL, \
							name TEXT NOT NULL, \
                            nameShort TEXT NOT NULL, \
                            dateSzLastTrello TEXT NOT NULL \
							)');

            t.executeSql('CREATE INDEX IF NOT EXISTS idx_teamsByName ON TEAMS(name ASC)');
            t.executeSql("INSERT OR REPLACE INTO TEAMS (idTeam, name, nameShort, dateSzLastTrello) VALUES (?,?,?,?)",
                [IDTEAM_UNKNOWN, STR_UNKNOWN_TEAM, "", earliest_trello_date()]);

            t.executeSql("ALTER TABLE BOARDS ADD COLUMN idTeam TEXT DEFAULT '" + IDTEAM_UNKNOWN + "'"); //idTeam can also be null for boards without team
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_boardsByIdTeam ON BOARDS(idTeam ASC)');
        });

        M.migration(36, function (t) {
            t.executeSql("ALTER TABLE BOARDS ADD COLUMN dateLastActivity TEXT DEFAULT '"+earliest_trello_date()+"' NOT NULL"); //same (usually) as trello's board.dateLastActivity

            t.executeSql("ALTER TABLE GLOBALS ADD COLUMN dateLastLabelsSync TEXT DEFAULT '" + earliest_trello_date() + "' NOT NULL");

            //LABELS.idBoardShort is named "short" to be explicit, but note that the other table's "idBoard" is also a short trello id.
            //idBoardShort can be IDBOARD_UNKNOWN
            t.executeSql('CREATE TABLE IF NOT EXISTS LABELS ( \
							idLabel TEXT PRIMARY KEY NOT NULL, \
							name TEXT NOT NULL, \
                            idBoardShort TEXT NOT NULL, \
                            color TEXT \
							)');
            
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_labelsByIdBoard ON LABELS(idBoardShort ASC)'); //index by board for quick filtering in case of many labels

            t.executeSql('CREATE TABLE IF NOT EXISTS LABELCARD ( \
							idCardShort TEXT NOT NULL, \
							idLabel TEXT NOT NULL, \
                            PRIMARY KEY (idCardShort, idLabel) \
							)');

            //PRIMARY KEY (idCardShort, idLabel) gives unique and an index (for reports)
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_labelcardByLabel ON LABELCARD(idLabel ASC,idCardShort ASC)'); //for reports

            if (g_bDummyLabel) { //Note: if reactivated, this needs to move as a new version upgrade
                t.executeSql("INSERT OR REPLACE INTO LABELS (idLabel, name, idBoardShort, color) VALUES (?,?,?,?)",
                    [IDLABEL_DUMMY, "", IDBOARD_UNKNOWN, ""]);

                //doing this here ensures all cards, even those we can no longer reach, have an initial dummy. thus we can later assume no labels -> has dummy label
                t.executeSql("INSERT OR REPLACE INTO LABELCARD (idCardShort,idLabel) SELECT idCard,'" + IDLABEL_DUMMY + "' FROM CARDS", []);
            }

        });

        M.migration(37, function (t) {
            t.executeSql("ALTER TABLE CARDS ADD COLUMN idShort TEXT DEFAULT NULL"); //not shortLink. idShort is unique per board
        });

        M.migration(38, function (t) {
            //version 4.0.0
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_boardsByArchived ON BOARDS(bArchived ASC)'); //for hashtags global list and reports
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_listsByArchived ON LISTS(bArchived ASC)');
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_cardsByArchivedDeleted ON CARDS(bArchived ASC, bDeleted ASC)');
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_listsByBoard ON LISTS(idBoard ASC)'); 
        });

        M.migration(39, function (t) {
            t.executeSql('ALTER TABLE CARDS ADD COLUMN dateCreated INT DEFAULT NULL');
            t.executeSql('CREATE INDEX IF NOT EXISTS idx_cardsByDateCreated ON CARDS(dateCreated ASC)');
        });

        M.migration(40, function (t) {
            t.executeSql('ALTER TABLE GLOBALS ADD dowDelta INT DEFAULT 0');
        });

        M.doIt();
    }
}

function updateCardRecurringStatusInHistory(t) {
    //see handleUpdateCardBalances for reference

    //used to set recurring cards to ETYPE_NONE, which makes reports on "new" versus "actual" not work correctly.
    var sqlUpdateEtype = "update history set eType=" +
    ETYPE_NEW + " where idCard in (select idCard from CARDS where CARDS.name LIKE '%[R]%') and history.eType <> " +
    ETYPE_NEW + " and history.est <> 0";

    t.executeSql(sqlUpdateEtype, [],
        function (tx2, results) {
    },
        function (tx2, error) {
            logPlusError(error.message);
            return true; //stop
    });

    //this one shouldnt be needed, but here just in case (completes the query above)
    sqlUpdateEtype = "update history set eType=" +
    ETYPE_NONE + " where idCard in (select idCard from CARDS where CARDS.name LIKE '%[R]%') and history.est = 0";

    t.executeSql(sqlUpdateEtype, [],
        function (tx2, results) {
        },
        function (tx2, error) {
            logPlusError(error.message);
            return true; //stop
        });

    //fix older history that might not have [R] card status reflected in history, because older versions didnt update history when [R] status changes
    sqlUpdateEtype = "UPDATE HISTORY set eType= CASE when est<0 then " +
    ETYPE_DECR + " else  case when est>0 then " +
    ETYPE_INCR + " else " +
    ETYPE_NONE +
    " END END where idCard in (select idCard from cards where name NOT LIKE '%[R]%')";

    t.executeSql(sqlUpdateEtype, [], function (tx2, results) {
        var sqlUpdate2 = "update history set eType=" +
            ETYPE_NEW + " where (rowid in (select min(rowid) from history where (spent<>0 OR est<>0) and idCard in (select idCard from cards where name NOT LIKE '%[R]%') group by user,idCard)) \
OR (est<>0 AND comment LIKE '%" + g_prefixCommentTransfer + "%')";
        tx2.executeSql(sqlUpdate2, [], function (tx3, results) { },
            function (tx3, error) {
                logPlusError(error.message);
                return true; //stop
            });
    },
    function (tx2, error) {
        logPlusError(error.message);
        return true; //stop
    });
}

function handleUpdateRowEtype(row, mapBalance, tx) {
	var eType = ETYPE_NONE;
	var key = row.idCard + "-" + row.user;
	if (mapBalance[key]) {
	    if (row.nameCard && row.nameCard.indexOf(TAG_RECURRING_CARD) >= 0) {
            if (row.est!=0)
	            eType = ETYPE_NEW;
	    }
	    else if (row.est != 0 && row.comment && row.comment.indexOf(g_prefixCommentTransfer) >= 0)
	        eType = ETYPE_NEW;
	    else if (row.est > 0)
	        eType = ETYPE_INCR;
	    else if (row.est < 0)
	        eType = ETYPE_DECR;
	} else if (row.spent!=0 || row.est!=0) {
		eType = ETYPE_NEW;
		mapBalance[key] = true;
	}

	if (eType != row.eType) {
		var sql = "UPDATE HISTORY SET eType=? WHERE rowid=?";
		tx.executeSql(sql, [eType, row.rowid],
		null,
		function (tx2, error) {
			logPlusError(error.message + " sql: " + sql);
			return true; //stop
		});
	}
}

function updateAllETypes(tx) {
	var sql = "SELECT H.user, H.idCard, H.spent, H.est, H.eType,H.rowid, H.comment, C.name as nameCard FROM HISTORY H JOIN CARDS C ON H.idCard=C.idCard order by H.rowid ASC";
	tx.executeSql(sql, [],
			function (tx2, results) {
				var i = 0;
				var mapBalance = {}; //track new state. can get big on a large file
				for (; i < results.rows.length; i++) {
					var row=results.rows.item(i);
					handleUpdateRowEtype(row, mapBalance, tx2);
				}
			},
			function (trans, error) {
				logPlusError(error.message + " sql: " + sql);
				return true; //stop
			});
}

function makeRowGsxField(name, value) {
	return "<gsx:" + name + ">" + value + "</gsx:" + name + ">";
}

var g_regexXmlEscapeAmp = /&/g;
var g_regexXmlEscapeLt = /</g;
var g_regexXmlEscapeGt = />/g;
var g_regexXmlEscapeQ = /"/g;
var g_regexXmlEscapeApos = /'/g;

function xmlEscape(str) {
    str = replaceString(str, g_regexXmlEscapeAmp, '&amp;');
    str = replaceString(str, g_regexXmlEscapeLt, '&lt;');
    str = replaceString(str, g_regexXmlEscapeGt, '&gt;');
    str = replaceString(str, g_regexXmlEscapeQ, '&quot;');
    str = replaceString(str, g_regexXmlEscapeApos, '&apos;');
    return str;
}

function makeRowAtom(date, board, card, spenth, esth, who, week, month, comment, idBoard, idCard, idtrello) {
	var cardurl = "https://trello.com/c/" + idCard;
	var ssRowId = idtrello + "-" + idCard + "-" + idBoard;
	var atom = '<entry xmlns="http://www.w3.org/2005/Atom" xmlns:gsx="http://schemas.google.com/spreadsheets/2006/extended">';
	var names = ['date', 'board', 'card', 'spenth', 'esth', 'who', 'week', 'month', 'comment', 'cardurl', 'idtrello'];
	var values = [date, xmlEscape(board), xmlEscape(card), spenth, esth, xmlEscape(who), week, month, xmlEscape(comment), cardurl, xmlEscape(ssRowId)];

	//Note: everything is escaped with ' to escape problems with different spreadsheet regional settings or numbers that plus can parse but sheets cant
	var i = 0;
	for (; i < names.length; i++) {
		atom += makeRowGsxField(names[i], "'" + values[i]);
	}
	atom += '</entry>';
	return atom;
}

function makeMessageAtom(message) {
	var atom = '<entry xmlns="http://www.w3.org/2005/Atom" xmlns:gsx="http://schemas.google.com/spreadsheets/2006/extended">';

	atom += makeRowGsxField("message", "'" + message);
	atom += '</entry>';
	return atom;
}

function saveRowSSEndLastData(data) {
    assert(typeof (data) == "object"); //old way stored number as string 
    localStorage["rowSsSyncEndLast"] = JSON.stringify(data);
}

function getRowSSEndLastData(defaults) {
    var data = localStorage["rowSsSyncEndLast"];
    if (typeof (data) !== "undefined" && typeof (data) == "string" && data.indexOf("{")!=0) {
        //older format that stored just the index of a single sheet as string (before 2016-12-12)
        assert(defaults);
        var idSs = defaults.idSs;
        assert(idSs);
        var idSheet = defaults.idSheet;
        assert(typeof(idSheet) == 'string');
        var iRow = parseInt(data, 10) || 0;
        data = {};
        //convert to new format
        data[idSs+"/"+idSheet] = iRow;
        saveRowSSEndLastData(data);
    }
    if (!data)
        data = {};
    if (typeof (data) == "string")
        data = JSON.parse(data);
    return data;
}

