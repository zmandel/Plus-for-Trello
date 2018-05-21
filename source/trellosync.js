/// <reference path="intellisense.js" />

var g_cMaxCallstack = 400; //400 is a safe size. Larger could cause stack overflow. must be large else is too slow in chrome canary.
var g_cLimitActionsPerPage = 900; //the larger the better to avoid many round-trips and consuming more quota. trello allows up to 1000 but I feel safer with a little less.
var g_bProcessCardCommentCopies = false; //Trello optionally copies card comment when making a card copy REVIEW must handle in comment parser
var g_bUpdateSyncNotificationProgress = false;

var SQLQUERY_PREFIX_CARDDATA = "select dateCreated, dateDue, idBoard, name, dateSzLastTrello, idList, idLong, idCard, idShort, bArchived, bDeleted ";
var SQLQUERY_PREFIX_LISTDATA = "select idBoard, name, dateSzLastTrello, idList, bArchived, pos ";
var SQLQUERY_PREFIX_BOARDDATA = "select idBoard,idLong, name, dateSzLastTrello, idActionLast, bArchived, verDeepSync, idTeam, dateLastActivity ";
var SQLQUERY_PREFIX_LABELDATA = "select idLabel,name, idBoardShort, color ";
var SQLQUERY_PREFIX_LABELCARDDATA = "select idCardShort, idLabel ";

var g_msDelayTrelloSearch = (1000 * 60 * 5); //trello takes sometimes over a minute to show changed cards in search, so use 5min as a safe delay
var g_lastStatusSyncCache = {}; //needed for later checking if the last sync had errors easily (not async) statusRead, statusWrite, date could all be undefined)

var g_strKeyTokenTrelloLast = "tokenTrelloLast";

/* array of cards where card = {
        status: "OK", //ignore it
        shortLink: "H8gGOqNk",
        nameOld: "(4) bb [5]",
        nameNew: "bb"
    }; */
var g_rgUndoCardRename = null;

//REVIEW zig: idCardShort is a bad name, its really shortLink, and NOT idShort.
function checkMaxCallStack(iLoop) {
    return (((iLoop+1) % g_cMaxCallstack) == 0);
}

function logTrelloSync(message) {
    if (g_bIncreaseLogging)
        console.log(message);
}

var TOTAL_SYNC_STAGES = 9;

var g_syncStatus = {
    postfixStage: "",
    strLastStatus: STATUS_OK,
    bSyncing: false,
    cSteps: 0,
    cProcessed: 0,
    stage: "",
    cTotalStages: TOTAL_SYNC_STAGES,
    stageNum: 0,
    rgStepHistory: [], //review zig: for debugging errors in steps
    msStart: 0,
    msLast: Date.now(),
    bSingleStep: false,
    bExtraRenameStep:false,
    setStage: function (name, cSteps, bSingleStep, bFirstStep) { //bSingleStep indicates this stage always has one step
        //review zig: a rare bug causes stageNum to be != cTotalStages when sync finishes ok. I have reviewed the flow many times but havent
        //found the cause. Seems that it would need two sync at the same time but a global prevents that already.
        //since its very rare, I suspect it happens when a specific step fails an ajax call (no interenet etc) and plus doesnt recover properly.
        //I have reviewed the error handlers and they seem ok. eventually should use bFirstStep as safety but
        //not done yet so rgStepHistory in error logs can tell me when this bug happens.
        assert(name=="" || this.bSyncing || this.stage == ""); //first stage or already syncing. first stage is special because bSyncing isnt yet set (so progress wouldnt read a bad stage)
        this.bSingleStep = bSingleStep || false;
        var bSyncingOld = this.bSyncing;
        var bFinished = (name == "");
        if (bFinished) {
            this.stageNum = 0;
            this.bSyncing = false;
            this.bExtraRenameStep = false;
            this.rgUndoCardRename = null;
            this.cTotalStages = TOTAL_SYNC_STAGES;
        }
        else {
            if (!bSyncingOld) {
                this.stageNum = 0; //reset
            }

            if (this.stageNum == 0 && bFirstStep)
                this.rgStepHistory = [];
            this.stageNum++;
            this.bSyncing = true;
            name = "Stage " + this.stageNum + " of " + this.cTotalStages + ": " + name;
            this.rgStepHistory.push(name);
        }
        this.stage = name;
        this.postfixStage = ""; //reset
        this.cProcessed = 0;
        this.cSteps = cSteps;

        var msNow = Date.now();
        if (this.bSyncing && !bSyncingOld) {
            this.msStart = msNow;
            this.msLast = msNow;
            this.cTotalStages = TOTAL_SYNC_STAGES;
            this.bExtraRenameStep = false;
            this.rgUndoCardRename = null;
            var strOptionrenameCardsPendingData = localStorage["renameCardsPendingData"];
            if (strOptionrenameCardsPendingData) {
                localStorage.removeItem("renameCardsPendingData"); //remove right away, so in case the following code gets stuck in a loop, we wont continue attempting rename
                var optRename = JSON.parse(strOptionrenameCardsPendingData);
                if (optRename.pending) {
                    this.cTotalStages++;
                    this.bExtraRenameStep = true;
                    this.bOnlyRenameCardsWithHistory = optRename.bOnlyCardsWithHistory;
                    if (typeof (this.bOnlyRenameCardsWithHistory) == "undefined")
                        this.bOnlyRenameCardsWithHistory = true; //safer
                }
            } else if (g_rgUndoCardRename) {
                this.cTotalStages++;
                this.bExtraRenameStep = true;
                this.rgUndoCardRename = g_rgUndoCardRename;
                g_rgUndoCardRename = null;
            }
        }
        
        var segDelta = " delta prev:" + Math.round((msNow - (bFinished ? this.msStart : this.msLast)) / 10) / 100 + "s";
        if (!(bFinished && !bSyncingOld))
            this.msLast = msNow;
        updatePlusIcon(bSyncingOld == this.bSyncing);
        if (!bFinished)
            logTrelloSync("sync: " + this.stage + " total:" + this.cSteps + segDelta);
        else {
            if (g_bEnableTrelloSync && bSyncingOld)
                logTrelloSync("sync: finished." + segDelta);
        }
    }
};

//review zig: tokenTrello is not used. some callers already pass null
function processThreadedItemsSync(tokenTrello, items, onPreProcessItem, onProcessItem, onFinishedAll, bDontUpdateSyncStatus, needsProcessItemDelay) {

    function onFinishedEach(status) {
        if (status == STATUS_OK) {
            if (!bDontUpdateSyncStatus) {
                g_syncStatus.cProcessed++;
                updatePlusIcon(true);
            }
        }
    }

    processThreadedItems(tokenTrello, items, onPreProcessItem, onProcessItem, onFinishedAll, onFinishedEach, needsProcessItemDelay);
}

function handleGetTrelloCardData(request, sendResponseParam) {
    var response = { status: "error" };
    getCardData(request.tokenTrello, request.idCard, request.fields, request.bBoardShortLink, callbackCard);

    function callbackCard(cardData) {
        response.status = cardData.status;
        response.card = cardData.card;
        sendResponseParam(response);
    }
}

function handleGetTrelloBoardData(request, sendResponseParam) {
    var response = { status: "error" };
    getBoardData(request.tokenTrello, false, request.idBoard, "fields=" + request.fields, callback);

    function callback(data) {
        response.status = data.status;
        response.board = data.board;
        sendResponseParam(response);
    }
}

function makeLastStatusSync(statusRead, statusWrite, date) {
    if (!date)
        date = Date.now();
    g_lastStatusSyncCache = { statusRead: statusRead, statusWrite: statusWrite, date: date };
    return g_lastStatusSyncCache;
}

/* handleSyncBoards
 *
 * Entry point to trello sync
 *
 * See sync diagram on how this can be reached:
 * https://docs.google.com/drawings/d/1C6SaEjejg1e_NzfqhMpno5B5RyugtwCzdfH4XTyZmuw/edit?usp=sharing
 *
 **/
function handleSyncBoards(request, sendResponseParam) {
    loadBackgroundOptions(function () {
        function sendResponse(response) {
            g_syncStatus.strLastStatus = response.status;
            if (g_optEnterSEByComment.IsEnabled()) {
                var pairDateLast = {};
                var pairLastStatus = {};
                var dateNow = Date.now();
                if (response.status == STATUS_OK)
                    pairDateLast["plus_datesync_last"] = dateNow;
                chrome.storage.local.set(pairDateLast, function () {
                    pairLastStatus["plusSyncLastStatus"] = makeLastStatusSync(response.status, STATUS_OK, dateNow);
                    chrome.storage.local.set(pairLastStatus, function () {
                        sendResponseParam(response);
                    });
                });
            }
            else
                sendResponseParam(response);
        }

        if (g_bDisableSync) {
            sendResponseParam({ status: "sync is off" });
            return;
        }

        if (!isDbOpened() || g_syncStatus.bSyncing || g_cReadSyncLock != 0 || g_cFullSyncLock != 0 || g_cWriteSyncLock != 0) {
            sendResponseParam({ status: "busy" });
            return;
        }

        //first stage
        g_syncStatus.setStage("", 0); //reset in case somehow a previous one was pending
        g_syncStatus.setStage("Starting sync", 1, true, true); //note that this will cause g_syncStatus.bSyncing=true
        //if there are pending rows, we must commit them before because they reference board/card names/ids that could change during sync
        //and sync only maintains the history table, not the queuehistory
        insertPendingSERows(function (responseInsertSE) {
            if (responseInsertSE.status != STATUS_OK) {
                g_syncStatus.setStage("", 0);
                sendResponseParam({ status: responseInsertSE.status });
                return;
            }
            handleSyncBoardsWorker(request.tokenTrello, request.bUserInitiated, sendResponse);
        });
    });
}

function handleSyncBoardsWorker(tokenTrello, bUserInitiated, sendResponseParam) {
    var tokenTrelloStored = localStorage[g_strKeyTokenTrelloLast];

    g_bUpdateSyncNotificationProgress = false; //reset
    if (!tokenTrello) {
        if (!tokenTrelloStored) {
            //note: currently the token is not actually used during sync, but might be used in the future
			//its also safer to do the background calls only after we've made calls from the content script (which sets the token)
            sendResponseParam({ status: "busy" }); //happens if called from offline sync and weve never done an online sync yet (rare)
            return;
        }
        tokenTrello = tokenTrelloStored;
    }
    if (!tokenTrelloStored)
        localStorage[g_strKeyTokenTrelloLast] = tokenTrello;

    var boardsTrello = []; //boards the user has access. This list is later intersected with the db boards list.
    var boardsReport = [];

    //Arquitecture note about rgCardResetData: see http://sqlite.org/autoinc.html regarding deleting rows and rowid behaviour. some plus features rely on an always-incrementing rowid,
    //(like etype for E1st, and boardmarkers). We could use autoincrement on history, but requires an upgrade of the table and decreases performace.
    //that sqlite link in our case says that you cant ever delete the row with the largest rowid, which could be of a card in this array.
    //to avoid the issue, and to maintain a record of the original values being modified, I instead make the existing card history rows 0/0,
    //and include in the note the [details] of the original S/E in the row.
    //this does not break 1st estimates, because they ignore 0/0 when calculating min(rowid) see updateCardRecurringStatusInHistory, handleMakeNonRecurring
    //CARDBALANCE and BOARDMARKER tables are reset for the cards, and are re-generated.

    var alldata = {
        bForceDeepSyncOnRecentBoards: bUserInitiated,
        labels: {}, //hash by idLabel (name,idBoardShort,color)
        teams: {}, //hash by idTeam (name, dateSzLastTrello, nameShort)
        boards: {}, //hash by shortLink. (name, dateSzLastTrello, idActionLast, bArchived, idTeam ...) **NOTE** dateSzLastTrello is 1ms behind (see note in sql)
        lists: {},  //hash by idLong. (name, idBoard, dateSzLastTrello, bArchived, pos)
        cards: {},  //hash by shortLink. (name, idBoard, dateSzLastTrello, idList, bArchived, listCards[] (idList,dateSzIn,dateSzOut,userIn,userOut) )
                    //if cards.idLabels, contains an array of idLabels

        cardsByLong: {}, //hash idLong -> shortLink.
        boardsByLong: {}, //hash idLong -> shortLink.
        hasBoardAccessDirect: {}, //hash by shortLink -> true iff user has access to that board (note: means user has no direct access, but may still have access throigh team membership)
        hasNoBoardAccess: {}, //hash by shortLink -> true iff user has NO board access.
        hasBoardAccess : {}, //hash by shortLink -> true iff user has access to that board. Not here does not mean user has no access.
        rgCommentsSE: [], //all possible S/E comments
        rgCardResetData: [], //array of {idCard: shortLink, idBoard: shortLink, dateSzBefore, idActionReset: action with resetsync command } of cards needing reset
        dateLastLabelsSyncStrOrig: null, //when not null, indicates original value from GLOBALS
        dateLastLabelsSyncStrNew: null //when not null, indicates new value from GLOBALS
    };

    g_lastLogError = ""; //reset
    updatePlusIcon(false);

    startSyncProcess();

    function startSyncProcess() {
        var request = { sql: "select idTeam, name, dateSzLastTrello, nameShort FROM TEAMS where idTeam<>?", values: [IDTEAM_UNKNOWN] };
        handleGetReport(request,
            function (responseReport) {
                if (responseReport.status != STATUS_OK) {
                    sendResponse(responseReport);
                    return;
                }
                responseReport.rows.forEach(function (row) {
                    assert(row.idTeam);
                    var teamCur = cloneObject(row); //to modify it
                    teamCur.orig = cloneObject(teamCur); //keep original values for comparison
                    alldata.teams[row.idTeam] = teamCur;
                });

                var request = { sql: SQLQUERY_PREFIX_BOARDDATA+"FROM BOARDS where idBoard<>?", values: [IDBOARD_UNKNOWN] };
                handleGetReport(request,
                    function (responseReport) {
                        if (responseReport.status != STATUS_OK) {
                            sendResponse(responseReport);
                            return;
                        }
                        boardsReport = cloneObject(responseReport.rows || []); //clone so rows can be modified.
                        assert(boardsReport);
                        getBoardsLastInfo(tokenTrello, callbackBoardsLastInfo);
                    });
            });
    }

    function callbackBoardsLastInfo(responseBoardsLastInfo) {
        if (responseBoardsLastInfo.status != STATUS_OK) {
            sendResponse(responseBoardsLastInfo);
            return;
        }

        boardsTrello = responseBoardsLastInfo.items;
        var bFirstSync = (boardsTrello.length > 0 && ((localStorage["plus_bFirstTrelloSyncCompleted"] || "") != "true"));
        if (bFirstSync) {
            animateFlip();
            for (var iAnim = 1; iAnim < 10; iAnim++)
                doAnim(1000 * iAnim);
            
            function doAnim(ms) {
                setTimeout(function () {
                    if (g_syncStatus.bSyncing)
                        animateFlip();
                }, ms);
            }
            broadcastMessage({ event: EVENTS.FIRST_SYNC_RUNNING, status: STATUS_OK });
            g_bUpdateSyncNotificationProgress = true;
            handleShowDesktopNotification({
                notification: Language.FIRSTSYNC_PRE,
                timeout: 15000,
                idUse: IDNOTIFICATION_FIRSTSYNCPRORESS,
                dontClose: true
            });
        }

        completeMissingCardDateCreated(tokenTrello, alldata, function (response) {
            if (response.status != STATUS_OK)
                sendResponse(response);
            else
                getAllTrelloBoardActions(tokenTrello, alldata, boardsReport, boardsTrello, process, bUserInitiated);
        });
        }
    
    function sendResponse(response) {
        if (response.status == STATUS_OK) {
            if (g_syncStatus.cTotalStages != g_syncStatus.stageNum)
                logPlusError("Finished with stageNum != cTotalStages " + g_syncStatus.stageNum + "/" + g_syncStatus.cTotalStages + ":"+JSON.stringify(g_syncStatus.rgStepHistory));
        }
        
        g_syncStatus.setStage("", 0);

        sendResponseParam(response);
    }

    
    function process(responseGetActions) {
        if (responseGetActions.status != STATUS_OK)
            sendResponse({ status: responseGetActions.status });
        else {

            function processAllCardsRename(response) {
                if (response.status == STATUS_OK && g_syncStatus.bExtraRenameStep) {
                    if (g_syncStatus.rgUndoCardRename)
                        processUndoAllCardsNameCleanup(tokenTrello, g_syncStatus.rgUndoCardRename, sendResponse);
                    else
                        processAllCardsNameCleanup(tokenTrello, g_syncStatus.bOnlyRenameCardsWithHistory, sendResponse);
                }
                else
                    sendResponse(response);
            }

            processTrelloActions(tokenTrello, alldata, responseGetActions.actions, responseGetActions.boards, responseGetActions.hasBoardAccessDirect, processAllCardsRename);
        }
    }
}

function populateTeams(teamsDb, boardsTrello) {
    boardsTrello.forEach(function (board) {
        var team = board.organization;
        var bChanged = false;
        if (!team)
            return;
        var teamDb = teamsDb[team.id];
        assert(board.dateLastActivity);
        var teamNew = {
            idTeam: team.id,
            name: team.displayName,
            dateSzLastTrello: board.dateLastActivity,
            nameShort: team.name || ""
        };

        if (!teamDb) {
            teamsDb[team.id] = teamNew;
        }
        else {
            if (teamDb.dateSzLastTrello < teamNew.dateSzLastTrello)
                teamDb.dateSzLastTrello = teamNew.dateSzLastTrello;
            //dateSzLastTrello comes from the board, not the team. so update name and nameShort which is always fresh data
            teamDb.name = teamNew.name;
            teamDb.nameShort = teamNew.nameShort;
        }
    });
}


function processUndoAllCardsNameCleanup(tokenTrello, rgUndoCardRename, sendResponse) {
    handleShowDesktopNotification({
        notification: "Starting to UNDO card title renames.\nWatch progress by hovering the Chrome Plus icon.",
        timeout: 15000
    });
    var rgErrorRenamedCards = [];
    g_syncStatus.setStage("Undoing card renames.", rgUndoCardRename.length);
    processThreadedItemsSync(tokenTrello, rgUndoCardRename, null, onProcessItem, onFinishedAll);

    /* a card contains: cardSample = {
        status: "OK", //ignore it
        shortLink: "H8gGOqNk",
        nameOld: "(4) bb [5]",
        nameNew: "bb"
    }; */

    function onProcessItem(tokenTrello, card, iitem, postProcessItem) {

        function callPost(status) {
            postProcessItem(status, card, iitem);
        }

        if (!card.status || card.status != STATUS_OK) {
            rgErrorRenamedCards.push("Ignoring card with previous failed rename or missing status. shortLink: " + (card.shortLink || "missing too!"));
            callPost(STATUS_OK);
            return;
        }

        var shortLink = card.shortLink;
        if (!shortLink || !card.nameOld) {
            rgErrorRenamedCards.push("Ignoring card with missing shortLink/nameOld");
            callPost(STATUS_OK);
            return;
        }

        renameCard(tokenTrello, shortLink, card.nameOld, function (cardData) {
            if (cardData.status != STATUS_OK)
                rgErrorRenamedCards.push("Error during card rename. shortLink: " + shortLink + ". " + cardData.status);
            else {
                if (!cardData.hasPermission) {
                    rgErrorRenamedCards.push("No permission to rename card. shortLink: " + shortLink);
                    cardData.status = STATUS_OK;
                }
            }

            callPost(cardData.status);
        }, STATUS_OK); //STATUS_OK means a failure from lack of permission will still be OK (with hasPemission=false)
    }

    function onFinishedAll(status) {
        if (rgErrorRenamedCards.length > 0) {
            saveAsFile(rgErrorRenamedCards.join("\r\n"), "error log - plus for trello undo renamed cards.txt", true);
            handleShowDesktopNotification({
                notification: "Finished undo operation of " + rgUndoCardRename.length + " cards with errors (see downloaded file).",
                timeout: 8000
            });
        } else {
            handleShowDesktopNotification({
                notification: "Finished undo operation of " + rgUndoCardRename.length + " cards OK.",
                timeout: 8000
            });
        }
        sendResponse({ status: status });
    }
}

function processAllCardsNameCleanup(tokenTrello, bOnlyRenameCardsWithHistory, sendResponse) {
    handleShowDesktopNotification({
        notification: "Starting to cleanup S/E from card titles.\nWatch progress by hovering the Chrome Plus icon.",
        timeout: 15000
    });

    var sql = "select idCard FROM CARDS WHERE bDeleted=0";
    if (bOnlyRenameCardsWithHistory)
        sql = "select c.idCard FROM CARDS c JOIN CARDBALANCE cb ON c.idCard=cb.idCard WHERE c.bDeleted=0";
    var request = { sql: sql, values: [] };
    handleGetReport(request,
        function (responseReport) {
            if (responseReport.status != STATUS_OK || responseReport.rows.length == 0) {
                if (responseReport.status == STATUS_OK)
                    g_syncStatus.setStage("Removing S/E from card titles", 1, true); //pretent step happened anyway (as status could be OK so caller expects all steps to finish)
                sendResponse(responseReport);
                return;
            }
            g_syncStatus.setStage("Removing S/E from card titles", responseReport.rows.length);
            var rgRenamedCards = [];
            var rgErrorsRename = [];
            processThreadedItemsSync(tokenTrello, responseReport.rows, null, onProcessItem, onFinishedAll);

            function onProcessItem(tokenTrello, card, iitem, postProcessItem) {

                function callPost(status) {
                    postProcessItem(status, card, iitem);
                }

                function callbackCard(cardData) {
                    if (cardData.status != STATUS_OK) {
                        callPost(cardData.status);
                        return;
                    }

                    if (!cardData.hasPermission) {
                        rgErrorsRename.push("No permission to get card with shortLink: " + card.idCard);
                        callPost(STATUS_OK);
                        return;
                    }



                    var nameNew = parseSE(cardData.card.name, true).titleNoSE;
                    if (cardData.card.name != nameNew) {
                        var shortLinkSaved = cardData.card.shortLink;
                        var nameOld = cardData.card.name;
                        renameCard(tokenTrello, shortLinkSaved, nameNew, function (cardData) {
                            rgRenamedCards.push({ status: cardData.status, shortLink: shortLinkSaved, nameOld: nameOld, nameNew: nameNew });
                            if (cardData.status == STATUS_OK && !cardData.hasPermission) {
                                rgErrorsRename.push("No permission to rename card with shortLink: " + shortLinkSaved);
                                cardData.status = STATUS_OK;
                            }
                            callPost(cardData.status);
                        }, STATUS_OK); //STATUS_OK means a failure from lack of permission will still be OK (with hasPemission=false)
                    }
                    else
                        callPost(STATUS_OK);
                }
                assert(card.idCard);
                getCardData(tokenTrello, card.idCard, "shortLink,name", false, callbackCard);
            }

            function onFinishedAll(status) {
                if (rgErrorsRename.length > 0)
                    saveAsFile(rgErrorsRename.join("\r\n"), "error log - plus for trello renamed cards.txt", true, true);
                saveAsFile({ totalCards: rgRenamedCards.length, cards: rgRenamedCards }, "plus for trello renamed cards json.txt", true);

                var strNotify;
                if (rgErrorsRename.length==0)
                    strNotify = "Finished renaming " + rgRenamedCards.length + " cards.\nAs a backup, all renamed cards are in the file just downloaded.";
                else
                    strNotify = "Finished renaming with errors (see downloaded errors file)." + rgRenamedCards.length + " cards.\nAs a backup, all renamed cards are in the file just downloaded.";
                handleShowDesktopNotification({
                    notification: strNotify,
                    timeout: 15000
                });
                sendResponse({ status: status });
            }
        });
}

function completeMissingCardDateCreated(tokenTrello, alldata, sendResponse) {
    var request = { sql: SQLQUERY_PREFIX_CARDDATA + "FROM CARDS where dateCreated is NULL AND idLong is not NULL", values: [] };
    handleGetReport(request,
        function (responseReport) {
            if (responseReport.status != STATUS_OK) {
                sendResponse(responseReport);
                return;
            }

            responseReport.rows.forEach(function (row) {
                var cardCur = alldata.cards[row.idCard];
                if (!cardCur) {
                    cardCur = cloneObject(row);
                    cardCur.orig = cloneObject(cardCur); //keep original values for comparison
                    alldata.cards[row.idCard] = cardCur;
                    if (row.idLong)
                        alldata.cardsByLong[row.idLong] = row.idCard;
                }
                if (!cardCur.dateCreated && row.idLong) {
                    var cSeconds = parseInt(row.idLong.substring(0, 8), 16); //http://help.trello.com/article/759-getting-the-time-a-card-or-board-was-created
                    if (cSeconds && cSeconds > 0)
                        cardCur.dateCreated = cSeconds; 
                }
            });
            sendResponse({ status: STATUS_OK });
        });
}

function completeMissingListCardData(tokenTrello, alldata, sendResponse) {
    var shortLinkCard = null;
    var cardsToFix=[];
    for (shortLinkCard in alldata.cards) {
        var cardCur = alldata.cards[shortLinkCard];
        if (!cardCur.bDeleted && (cardCur.idList == IDLIST_UNKNOWN || cardCur.idList == null))
            cardsToFix.push(cardCur);
    }

    g_syncStatus.setStage("Completing card's lists", cardsToFix.length);
    processThreadedItemsSync(tokenTrello, cardsToFix, null, onProcessItem, onFinishedAll, false, needsProcessItemDelay);

    function needsProcessItemDelay(card, iitem) {
        return (!(card.idBoard && alldata.hasNoBoardAccess[card.idBoard]));
    }

    function onProcessItem(tokenTrello, card, iitem, postProcessItem)  {
        
        function callPost(status) {
            postProcessItem(status, card, iitem);
        }

        function callbackCard(cardData) {
            if (cardData.status != STATUS_OK) {
                callPost(cardData.status);
                return;
            }

            if (!card.dateSzLastTrello)
                card.dateSzLastTrello = earliest_trello_date(); //set it to simplify code that assumes cards from trello api always have it set

            if (cardData.hasPermission) {
                card.idList = cardData.card.idList;
                card.idLong = cardData.card.id; //cards that came from db might be missing it
            }
            else {
                card.idList = IDLIST_UNKNOWN;
                card.bArchived = true; //not really true but this prevents later attempts at completing card data.
                //not setting card.idBoard = IDBOARD_UNKNOWN; //review zig: this would be good for consistency, but may not be a good idea when a card was deleted or loses permission we dont want to lose the board it beloged to
                //thus, because of this currently its not always true that a card's list belongs to the same board as the card in the db
                if (cardData.bDeleted) {
                    card.bDeleted = true;
                    card.bArchived = true;
                }

                if (!cardData.bForced) {
                    if (card.idBoard && card.idBoard != IDBOARD_UNKNOWN && !alldata.hasNoBoardAccess[card.idBoard] && !alldata.hasBoardAccessDirect[card.idBoard] && !alldata.hasBoardAccess[card.idBoard]) {
                        //optimization: check board status so later we dont have to keep checking all board cards
                        getBoardData(tokenTrello, false, card.idBoard, "fields=dateLastActivity", function (boardData) {
                            if (!boardData.hasPermission)
                                alldata.hasNoBoardAccess[card.idBoard] = true;
                            else
                                alldata.hasBoardAccess[card.idBoard] = true;
                            callPost(cardData.status);
                        });
                        return;
                    }
                }
            }
            callPost(cardData.status);
        }

        assert(card.idLong || card.idCard);
        if (!needsProcessItemDelay(card, iitem))
            callbackCard({status:STATUS_OK, hasPermission:false, bForced:true}); //optimization
        else
            getCardData(tokenTrello, card.idLong || card.idCard, "id,idList", false, callbackCard);
    }

    function onFinishedAll(status) {
        sendResponse({ status: status });
    }
}

function completeMissingListData(tokenTrello, alldata, sendResponse) {
    var listsToFix = [];
    var mapHandled = {};

    for (var shortLinkCard in alldata.cards) {
        var idList=alldata.cards[shortLinkCard].idList;
        if (idList == IDLIST_UNKNOWN)
            continue;

        if (!mapHandled[idList] && !alldata.lists[idList]) {
            listsToFix.push({ idList: idList });
            mapHandled[idList] = true;
            //idBoard: IDBOARD_UNKNOWN is later used to know this one is missing in local db
            alldata.lists[idList] = { name: STR_UNKNOWN_LIST, idBoard: IDBOARD_UNKNOWN, dateSzLastTrello: null, bArchived: false, pos:null }; //set a default
        }
    }

    for (var idListMissing in alldata.lists) {
        if (mapHandled[idListMissing])
            continue;
        if (alldata.lists[idListMissing].pos)
            continue;
        listsToFix.push({ idList: idListMissing });
        mapHandled[idListMissing] = true;
    }

    g_syncStatus.setStage("Completing list details", listsToFix.length);
    processThreadedItemsSync(tokenTrello, listsToFix, null, onProcessItem, onFinishedAll);

    function onProcessItem(tokenTrello, item, iitem, postProcessItem) {

        var idListCur = item.idList;
        assert(idListCur);
        var listDb = alldata.lists[idListCur];

        function finish() {
            if (listDb.idBoard != IDBOARD_UNKNOWN && !alldata.hasBoardAccessDirect[listDb.idBoard] && !alldata.hasBoardAccess[listDb.idBoard]) {
                if (alldata.hasNoBoardAccess[listDb.idBoard]) {
                    callbackList({ status: STATUS_OK, hasPermission :false, bForced: true}); //optimize trello calls
                    return;
                }
            }
            getListData(tokenTrello, idListCur, "name,idBoard,closed,pos", callbackList);
        }


       
        if (listDb.idBoard == IDBOARD_UNKNOWN) {
            //could be in db. if not, get it with the trello api
            getThisListFromDb(alldata, idListCur, function () {
                listDb = alldata.lists[idListCur];
                if (listDb.idBoard == IDBOARD_UNKNOWN)
                    finish();
                else
                    callPost(STATUS_OK);
            }, function onError(status) {
                callPost(status);
            });
        }
        else {
            finish();
        }

        function callPost(status) {
            postProcessItem(status, item, iitem);
        }

        function callbackList(listData) {
            if (listData.status != STATUS_OK) {
                callPost(listData.status);
                return;
            }

            if (!listDb.dateSzLastTrello)
                listDb.dateSzLastTrello = earliest_trello_date(); //fill a valid date. code later is simplified as it expects that it came from an "action"

            //note there isnt a "delete list" action, so dont archive it here. different than cards where we assume the card was deleted
            if (listData.hasPermission) {
                assert(listData.list.name);
                listDb.name = listData.list.name;
                //note: in the case of upgrading from data without list "pos", we can end up here early without boardsByLong but with a vali idBoard already
                listDb.idBoard = listDb.idBoard || alldata.boardsByLong[listData.list.idBoard] || IDBOARD_UNKNOWN;
                listDb.bArchived = listData.list.closed || false;
                listDb.pos = listData.list.pos || null;
            }
            else {
                listDb.pos = -1; //fake pos. this prevents from continuing to attempt getting pos from lists with "null" pos during upgrade to this pos feature
                listDb.bArchived = true; //this might not be really true but prevents certain repeated queries to update the list

                if (!listData.bForced && listDb.idBoard && listDb.idBoard != IDBOARD_UNKNOWN && !alldata.hasNoBoardAccess[listDb.idBoard] && !alldata.hasBoardAccessDirect[listDb.idBoard] && !alldata.hasBoardAccess[listDb.idBoard]) {
                    //optimization: check board status so later we dont have to keep checking all board cards
                    getBoardData(tokenTrello, false, listDb.idBoard, "fields=dateLastActivity", function (boardData) {
                        if (!boardData.hasPermission)
                            alldata.hasNoBoardAccess[listDb.idBoard] = true;
                        else
                            alldata.hasBoardAccess[listDb.idBoard] = true;
                        callPost(listData.status);
                    });
                    return;
                }
            }

            callPost(listData.status);
        }
    }

    function onFinishedAll(status) {
        sendResponse({ status: status });
    }
}

function matchesCardShortLinkFromTrelloWelcomeBoard(shortLink) {
    var rg = [
        //all cards from both "welcome board" in https://trello.com/examples
        //1: https://trello.com/b/bKbdmCKB/welcome-board 
"YdSxoGcc",
"XNItoCqd",
"B5h0PIBw",
"tVOKKKJS",
"1FzNqM9E",
"jOERTc2e",

"3MOoOZAk",
"FUKG6oiY",
"3E8uiAEk",
"LrrmgFyd",
"HMWuGKCb",
"kn935e6l",
"TFHJb9F2",

"uoe6rcDL",
"Tek4fCNQ",
"bVlkHq2d",
"JSccv2Cq",
"sfAshneN",
"xa7yvDpA",

//2: https://trello.com/b/HF8XAoZd/welcome-board
"QB1UIzwU",
"TqE553J6",
"rlJzoJEd",
"UlhkFUUd",
"OR0JbMVP",
"ZQK0l0oa",
"AgCyecMP"
];
    for (var i = 0; i < rg.length; i++) {
        if (rg[i] == shortLink)
            return true;
    }
    return false;
}

function preProcessActionsCaches(tokenTrello, actions, alldata, nextAction) {
    for (var i = 0; i < actions.length; i++) {
        var action = actions[i];
        var card = action.data.card;
        if (card && card.shortLink) {
            if (matchesCardShortLinkFromTrelloWelcomeBoard(card.shortLink))
                card.shortLink = undefined; //trello bug. see note below.
            else
                alldata.cardsByLong[card.id] = card.shortLink; //populate cache. needed later for cards missing shortLink
        }

        function preProcessBoardSourceTarget(board) {
            if (board) {
                var shortLink = alldata.boardsByLong[board.id];
                if (!shortLink) {
                    //set temporarily to unknown. Might remain unknown if we dont recover it from later history
                    alldata.boardsByLong[board.id] = IDBOARD_UNKNOWN;
                }
            }
        }

        preProcessBoardSourceTarget(action.data.boardSource);
        preProcessBoardSourceTarget(action.data.boardTarget);

        var board = action.data.board;
        if (board) {
			//in .com.pe https://mail.google.com/mail/ca/u/0/#apps/to%3Asupport%40trello.com+shortlink/148d1f65e49605b2
            //NOTE: confirmed trello bug where board.shortLink != action.idBoardSrc
            //Ive seen it happen on a customer, where an updateList action had board.shortLink be the trello welcome board, but idBoardSrc was the copy that trello makes.
            //WARNING: this means that code elsewhere cant trust board.shortLink unless it came from the db :(
            //there is code that currently identifies cards from trello sample boards, where this often happens, to ignore those shortLinks
            if (board.shortLink && board.shortLink != action.idBoardSrc) {
                console.log("Plus unusual: board.shortLink != action.idBoardSrc. shortLink:" + board.shortLink + " idBoardSrc:" + action.idBoardSrc+" .Full action:");
                console.log(JSON.stringify(action, undefined, 4));
            }
            var shortLink=alldata.boardsByLong[board.id];
            if (!shortLink || shortLink == IDBOARD_UNKNOWN)
                alldata.boardsByLong[board.id] = action.idBoardSrc;//dont use board.shortLink, could be incorrect (see note above)
        }
    }

    getAllItemsFromDb(actions, alldata, getAllMissingCardShortlinks);

    function getAllMissingCardShortlinks(status) {
        if (status != STATUS_OK) {
            nextAction(status);
            return;
        }

        var cardIds = listMissingCardShortlinks(actions, alldata);
        var cardsIgnore = {}; //cardsIgnore[idCardLong] true. review zig: doesnt seem necessary as cardIds has unique values

        g_syncStatus.setStage("Completing card details", cardIds.length);

        processThreadedItemsSync(tokenTrello, cardIds, null, onProcessItem, nextAction);

        function onProcessItem(tokenTrello, item, iitem, postProcessItem) {
            var idLong = item.idLong;
            if (cardsIgnore[idLong])
                callPost(STATUS_OK);
            else
                getCardData(tokenTrello, idLong, "shortLink", false, callbackCard);


            function callPost(status) {
                postProcessItem(status, item, iitem);
            }

            function callbackCard(cardData) {
                
                if (cardData.status != STATUS_OK) {
                    callPost(cardData.status);
                    return;
                }
                if (!cardData.hasPermission || cardData.bDeleted) {
                    cardsIgnore[idLong] = true;
                    callPost(cardData.status);
                    return;
                }
                
                alldata.cardsByLong[idLong] = cardData.card.shortLink;
                var cardsNotFound = {};
                populateDataCardFromDb(cardsNotFound, alldata, cardData.card, callPost); //there might be new cards now that we have the shortLink
            }
        }
    }
}


function listMissingCardShortlinks(actions, alldata) {
    var cardIds = [];
    var mapHandled = {};
    for (var i = 0; i < actions.length; i++) {
        var action = actions[i];
        if (action.ignore)
            continue;
        var card = action.data.card;
        if (!card || card.shortLink || mapHandled[card.id])
            continue;
        mapHandled[card.id] = true;
        if (alldata.cardsByLong[card.id])
            continue;
        cardIds.push({ idLong: card.id });
    }
    return cardIds;
}


function getAllItemsFromDb(actions, alldata, sendStatus) {
    var iAction = -1;
    var cardsNotFound = {};

    g_syncStatus.setStage("Pre-processing history", actions.length);
    nextAction(STATUS_OK);

    function nextAction(status) {
        iAction++;
        if (status != STATUS_OK) {
            sendStatus(status);
            return;
        }

        g_syncStatus.cProcessed = iAction;
        if ((iAction % 500) == 0)
            updatePlusIcon(true);

        if (iAction == actions.length) {
            sendStatus(STATUS_OK);
            return;
        }
        var action = actions[iAction];
        var card = action.data.card;
        var bCheckMaxCallstack = checkMaxCallStack(iAction);
        if (card) {
            populateDataCardFromDb(cardsNotFound, alldata, card, nextAction, bCheckMaxCallstack);
        }
        else {
            if (bCheckMaxCallstack) { //reduce long callstacks. must be large else is slow in canary
                setTimeout(function () {
                    nextAction(STATUS_OK);
                }); //undefined timeout is faster and still clears callstack
            }
            else
                nextAction(STATUS_OK);
        }
    }
}

function populateDataCardFromDb(cardsNotFound, alldata, card, sendStatus, bAsync) {
    assert(card);
    var idShortCard = card.shortLink;
    var idLongCard = card.id;
    var cardDb = null;
    
    function earlyFinish() {
        if (bAsync) {
            setTimeout(function () {
                sendStatus(STATUS_OK);
            });
        }
        else
            sendStatus(STATUS_OK);
    }

    assert(idLongCard);
    if (cardsNotFound[idLongCard]) {
        earlyFinish();
        return;
    }

    if (idShortCard)
        cardDb = alldata.cards[idShortCard];
    else {
        assert(idLongCard);
        idShortCard = alldata.cardsByLong[idLongCard];
        if (idShortCard)
            cardDb = alldata.cards[idShortCard];
    }
    
    if (cardDb) {
        earlyFinish();
        return;
    }
                        
    var request = { sql: SQLQUERY_PREFIX_CARDDATA+"FROM CARDS where (idCard=? OR idLong=?)", values: [idShortCard, idLongCard] };
    handleGetReport(request,
        function (responseReport) {
            if (responseReport.status != STATUS_OK) {
                sendStatus(responseReport.status);
                return;
            }
            if (responseReport.rows.length > 0) {                
                if (responseReport.rows.length != 1) {
                    logPlusError("responseReport.rows: " + JSON.stringify(responseReport.rows));
                }
				assert(responseReport.rows.length == 1);
                cardDb = cloneObject(responseReport.rows[0]); //to modify it
                assert(cardDb.idLong || cardDb.dateSzLastTrello == null || cardDb.idList == IDLIST_UNKNOWN || cardDb.bArchived); //sanity. if fails, might need to test for dateSzLastTrello==earliest_trello_date() thou that means archived
                if (!idShortCard)
                    idShortCard = cardDb.idCard;
                alldata.cardsByLong[idLongCard] = idShortCard;
                
                cardDb.orig = cloneObject(cardDb); //keep original values for comparison
                cardDb.idLong = idLongCard;
                alldata.cards[idShortCard] = cardDb;
            }
            else {
                cardsNotFound[idLongCard] = true;
            }
            sendStatus(STATUS_OK);
        });
}


function getThisListFromDb(alldata, idList, onOk, sendError) {
    var request = { sql: SQLQUERY_PREFIX_LISTDATA+"FROM LISTS where idList=?", values: [idList] };
    handleGetReport(request,
        function (responseReport) {
            if (responseReport.status != STATUS_OK) {
                sendError(responseReport.status);
                return;
            }
            if (responseReport.rows.length > 0) {
                assert(responseReport.rows.length == 1);
                var listCur = cloneObject(responseReport.rows[0]); //to modify it
                assert(listCur.idList);
                listCur.orig = cloneObject(listCur); //keep original values for comparison
                alldata.lists[listCur.idList] = listCur;
            }
            onOk();
        });
}

function commitTrelloChanges(alldata, sendResponse) {
    
    var bMadeChanges = false;
    g_syncStatus.setStage("Saving all", 1, true);
    function errorTransaction() {
        if (g_lastLogError == STATUS_OK) //should never happen
            g_lastLogError = "error";

        if (g_lastLogError == "")
            logPlusError("error in commitTrelloChanges");

        sendResponse({ status: g_lastLogError });
    }

    function okTransaction() {
        insertPendingSERows(function (responseInsertSE) {
            var bNewHistoryRows = (responseInsertSE.cRowsNew > 0);
            if (bNewHistoryRows)
                bMadeChanges = true;

            if (bMadeChanges) {
                notifyFinishedDbChanges(bNewHistoryRows);
                localStorage["plus_bFirstTrelloSyncCompleted"] = "true"; //if user later resets sync , we purposely dont restore this so a first sync happens again 
            }
            sendResponse(responseInsertSE);
        });
    }

    if (false) {
        var cBoardsTotal = Object.keys(alldata.boards).length;
        if (cBoardsTotal > 0)
            saveAsFile(alldata.boards, "alldata.boards-" + cBoardsTotal + ".json");
    }

    //review zig: if no board actions, most of the time we do the transaction unnecesarily, but it complicated to detect beforehand if the commits will have no effect
    g_db.transaction(processBulkChanges, errorTransaction, okTransaction);

    function processBulkChanges(tx) {
        bMadeChanges = commitTeamSyncData(tx, alldata) || bMadeChanges;
        bMadeChanges = commitBoardSyncData(tx, alldata) || bMadeChanges;
        bMadeChanges = commitListSyncData(tx, alldata) || bMadeChanges;
        bMadeChanges = commitBoardLabelsSyncData(tx, alldata) || bMadeChanges;
        bMadeChanges = commitCardSyncData(tx, alldata) || bMadeChanges;
        commitSESyncData(tx, alldata); //ignore return value, history row changes are broadcasted with NEW_ROWS later.
    }
}


function bUpdateAlldataCard(actionCur, cards, card, idBoard, dateCard) {
    assert(idBoard); //can be unknown
    //actionCur can be null
    //warning: can get called (from search) with partial card details (only labels)
    var ret = true;
    var idList = null;
    var typeAction = null;

    if (actionCur) {
        typeAction = actionCur.type;
        if (actionCur.data.list)
            idList = actionCur.data.list.id;
    }

    if (card.idList) //not "else" with above, in case "convertToCardFromCheckItem" contains idList (trello fixed this for actions going forward aprox july 2014)
        idList = card.idList;
    else if (actionCur && actionCur.data.listAfter)
        idList = actionCur.data.listAfter.id;


    var cardCur = cards[card.shortLink];
    var dueDate = undefined;
    var dateCreated = undefined;
    if (typeof card.due != "undefined") {
        if (card.due == null)
            dueDate = null;
        else
            dueDate = Math.round(new Date(card.due).getTime() / 1000);
    }

    if (typeAction == "createCard" && actionCur.date)
        dateCreated = Math.round(new Date(actionCur.date).getTime() / 1000);

    var idShort = card.idShort;
    if (idShort && typeof (idShort) == "number") //no evidence that its not a number, but list "pos" turned out to be sometimes not a number, thus assume it can happen here
        idShort = idShort.toString(); //this also helps correctly converting to number, as sqlite will convert 4 to '4.0'

    if (cardCur) {
        if (idShort)
            cardCur.idShort = idShort;

        if (!cardCur.dateSzLastTrello || dateCard >= cardCur.dateSzLastTrello) {
            if (card.name) //not present on deleteCard
                cardCur.name = card.name;

            if (typeof dueDate != "undefined")
                cardCur.dateDue = dueDate; //can be null

            if (typeof dateCreated != "undefined")
                cardCur.dateCreated = dateCreated; //not null

            cardCur.dateSzLastTrello = dateCard;
            if (true) {
                //for consistency, thou note that its not always true that an unknown list means unknown board
                if (idBoard == IDBOARD_UNKNOWN)
                    idList = IDLIST_UNKNOWN;
            }
            if (idList != null && idList != cardCur.idList)
                cardCur.idList = idList; //review zig handle list membership change here. handle IDLIST_UNKNOWN too

            cardCur.idBoard = idBoard;


            if (card.closed !== undefined)
                cardCur.bArchived = card.closed;
        }
        else
            ret = false;
    }
    else {
        //note card.closed should be undefined, but just in case read it too (eg. if trello ever truncates history)
        if (idList == null)
            idList = IDLIST_UNKNOWN;
        var cardActionName = card.name;
        if (cardActionName === undefined) {
            //Trello appears to have changed the way they store deleted card history as of june 18 2015
            //thus a deleted card will only have a single "deleteCard" history entry.
            //before this change, trello used to keep all the history thus the name was never undefined ("createCard" and such were processed before)
            cardActionName = (typeAction == "deleteCard" ? "deleted card" : "unknown card name");
        }
        cardCur = { name: cardActionName, dateSzLastTrello: dateCard, idList: idList, idBoard: idBoard, bArchived: card.closed || false, dateDue: dueDate || null, dateCreated:dateCreated || null, idShort: idShort };
        cards[card.shortLink] = cardCur;
    }

    assert(card.id);
    cardCur.idLong = card.id;
    if (card.bDeleted || typeAction == "deleteCard") {
        cardCur.bDeleted = true; //prevent further api calls. review zig check callers
        cardCur.bArchived = true;
    }
    return ret;
}

function bUpdateAlldataList(lists, list, idBoard, dateList) {
    var ret = true;
    var listCur = lists[list.id];
    if (listCur) {
        if (!listCur.dateSzLastTrello || dateList >= listCur.dateSzLastTrello) {
            if (list.name) //on cards, sometimes its not there.
                listCur.name = list.name;

            if (list.pos)
                listCur.pos = list.pos;
            listCur.dateSzLastTrello = dateList;
            listCur.idBoard = idBoard;

            if (list.closed !== undefined)
                listCur.bArchived = list.closed;
        }
        else
            ret = false;

    }
    else {
        listCur = { name: list.name, dateSzLastTrello: dateList, idBoard: idBoard, bArchived: list.closed || false, pos: list.pos || null };
        lists[list.id] = listCur;
    }
    assert(listCur.bArchived !== undefined);
    return ret;
}


function processTrelloActions(tokenTrello, alldata, actions, boards, hasBoardAccessDirect, sendResponseParam) {
    var bProcessCommentSE = g_optEnterSEByComment.IsEnabled();
    var rgKeywords = [];
    var mapHandledCardCommand = {};
    var bFirstSync = ((localStorage["plus_bFirstTrelloSyncCompleted"] || "") != "true");
    var iAction = -1;
    var cCalls = 1; //prevent  zero remain at the beginning

    if (bProcessCommentSE)
        rgKeywords = cloneObject(g_optEnterSEByComment.rgKeywords); //prevent issues if object changes during sync

    alldata.hasBoardAccessDirect = hasBoardAccessDirect;
    function postComplete(response) {

        if (response.status != STATUS_OK) {
            sendResponseParam(response);
            return;
        }

        var cNullIdList = 0;
        var cUnknownIdList = 0;
        for (var shortLink in alldata.cards) {
            var card = alldata.cards[shortLink];
            assert((card.dateSzLastTrello && card.idLong) || card.bArchived || card.idList==IDLIST_UNKNOWN); 
            if (!card.idList)
                cNullIdList++;
            else if (card.idList == IDLIST_UNKNOWN)
                cUnknownIdList++;
        }
        if (cNullIdList>0)
            logTrelloSync(cNullIdList + " 'NULL' idList");
        if (cUnknownIdList > 0)
            logTrelloSync(cUnknownIdList + " 'UNKNOWN' idList");
        commitTrelloChanges(alldata, sendResponseParam);
    }


    function sendResponse(response) {
        if (response.status != STATUS_OK) {
            sendResponseParam(response);
            return;
        }

        
        function postCompleteListCardData(response) {
            //complete missing lists, since new lists might have been pulled by completeMissingListCardData
            if (response.status != STATUS_OK) {
                sendResponseParam(response);
                return;
            }

            //complete missing list pos. Can be a big list for existing users just getting this new feature (2015-07-25) as
            //the actions only update lists participating in the action
            var request = { sql: SQLQUERY_PREFIX_LISTDATA + "FROM LISTS where pos is NULL AND  idList!='" + IDLIST_UNKNOWN + "' AND  idBoard!='" + IDBOARD_UNKNOWN + "'", values: [] };
            handleGetReport(request,
                function (responseReport) {
                    if (responseReport.status != STATUS_OK) {
                        sendResponseParam(responseReport);
                        return;
                    }

                    responseReport.rows.forEach(function (row) {
                        assert(row.idList);
                        if (alldata.lists[row.idList])
                            return;
                        var listCur = cloneObject(row); //to modify it
                        listCur.orig = cloneObject(listCur); //keep original values for comparison
                        alldata.lists[listCur.idList] = listCur;
                    });
                    completeMissingListData(tokenTrello, alldata, postComplete);
                });
        }

        //complete card list membership
        //first, add to alldata.cards any cards from the db that have unknown lists and arent already on alldata.cards
        getOtherDbCardsWithMissingListData();

        function getOtherDbCardsWithMissingListData() {
            //skip bArchived. we set it to 1 later for cards that couldnt be completed because of permissions, so dont query them here on the next sync
            //also skip those with dateSzLastTrello not null. that can happen on a non-deleted card that was on the db but now the user doenst have permission.
            //those are set to a non-null dateSzLastTrello so that we dont keep permanently trying to complete them here.
            //this list is unfortunately big on the very first sync, most items are skipped
                                
            var request = { sql: SQLQUERY_PREFIX_CARDDATA+"FROM CARDS where idList='" + IDLIST_UNKNOWN + "' AND bArchived=0 AND dateSzLastTrello IS NULL", values: [] };
            handleGetReport(request,
                function (responseReport) {
                    if (responseReport.status != STATUS_OK) {
                        sendResponseParam(responseReport);
                        return;
                    }

                    responseReport.rows.forEach(function (row) {
                        if (alldata.cards[row.idCard])
                            return;
                        if (row.idLong)
                            alldata.cardsByLong[row.idLong] = row.idCard;
                        var cardDb = cloneObject(row);
                        cardDb.orig = cloneObject(cardDb); //keep original values for comparison
                        alldata.cards[row.idCard] = cardDb;
                    });
                    completeMissingListCardData(tokenTrello, alldata, postCompleteListCardData);
                });
        }
        
    }

    //preload alldata boards. note "boards" is an array, while alldata.boards is a map.
    for (var iBoard = 0; iBoard < boards.length; iBoard++) {
        var boardLoop = boards[iBoard];
        alldata.boards[boardLoop.idBoard] = boardLoop;
        if (boardLoop.idLong && boardLoop.idLong != IDBOARD_UNKNOWN)
            alldata.boardsByLong[boardLoop.idLong] = boardLoop.idBoard;
    }

    preProcessActionsCaches(tokenTrello, actions, alldata, nextAction); //populates alldata.cardsByLong, gets missing card shortLinks, starts process

    function nextAction(statusLastAction) {
        statusLastAction = statusLastAction || STATUS_OK;
        if (statusLastAction != STATUS_OK) {
            sendResponse({ status: statusLastAction });
            return;
        }
        iAction++;
        cCalls++;
        g_syncStatus.cProcessed = iAction;
        if ((iAction % 200) == 0)
            updatePlusIcon(true);
            
        if (iAction == 0) {
            g_syncStatus.setStage("Processing history", actions.length);
        }
        if (iAction == actions.length) {
            processResetCardCommands(tokenTrello, alldata, sendResponse);
            return;
        }

        var actionCur = actions[iAction];
        if (checkMaxCallStack(cCalls)) { //reduce long callstacks
            setTimeout(function () {  
                processCurrent(actionCur);
            });
        }
        else
            processCurrent(actionCur);
    }

    function processCurrent(actionCur) {
        var typeAction = actionCur.type;
        var queue = [];

        //a simple queue to process async processing.
        //could be done with promises but 1) not available yet to old chrome versions, b) dont want to deal with another library and adapt it to extensions,
        //c) i only want a simple queue with centralized exception handling.
        //doing it this way I think its simpler because im avoiding deep nested callbacks and the flow+error handling is centralized and easily visible

        function stepDone(status) {
            cCalls++;

            if (checkMaxCallStack(cCalls)) { //reduce long callstacks
                setTimeout(function () {
                    worker();
                });
            } else {
                worker();
            }

            function worker() {
                if (status != STATUS_OK) {
                    sendResponse({ status: status });
                    return;
                }



                if (queue.length == 0)
                    nextAction();
                else {
                    try {
                        var pending = queue.shift();
                        if (actionCur.ignore) {
                            stepDone(STATUS_OK);
                            return;
                        }

                        pending.call();
                    } catch (ex) {
                        logException(ex);
                        sendResponse({ status: ex.message });
                    }
                }
            }
        }

        function addShortLinkToCard() {
            if (actionCur.data.card.shortLink) {
                stepDone(STATUS_OK);
                return;
            }
            var shortLinkCard = alldata.cardsByLong[actionCur.data.card.id]; //note we previously ran getAllMissingCardShortlinks
            if (shortLinkCard) {
                actionCur.data.card.shortLink = shortLinkCard;
            }
            else {
                actionCur.ignore = true;
            }
            stepDone(STATUS_OK);
        }

        function getListsFromDb() {
            var queueLists = [actionCur.data.listBefore, actionCur.data.listAfter, actionCur.data.list];
            //note: there are cases where trello doesnt make actions for created lists, for example when duplicating a board.
            //in those cases, lists may suddenly appear without a "createList" action. So, detect them here.
            function processCur() {
                if (queueLists.length == 0) {
                    stepDone(STATUS_OK);
                    return;
                }

                var list = queueLists.shift();
                if (!list) {
                    processCur();
                    return;
                }

                var listCur = alldata.lists[list.id];
                if (listCur)
                    processCur();
                else {
                    getThisListFromDb(alldata, list.id, function () {
                        processCur();
                    }, function onError(status) {
                        stepDone(status);
                    });
                }
            }

            processCur();
        }

        function processCardsFromMovedList() {
            if (actionCur.old) {
                //determined before in processListAction
                stepDone(STATUS_OK);
                return;
            }
            var idList = actionCur.data.list.id;
            var listCur = alldata.lists[idList];
            assert(listCur); //done in processListAction
                                
            var request = { sql: SQLQUERY_PREFIX_CARDDATA + "FROM CARDS where idList=?", values: [idList] };
            handleGetReport(request,
                function (responseReport) {
                    if (responseReport.status != STATUS_OK) {
                        stepDone(responseReport.status);
                        return;
                    }

                    responseReport.rows.forEach(function (row) {
                        if (alldata.cards[row.idCard])
                            return; //only load those not loaded already
                        if (row.idLong)
                            alldata.cardsByLong[row.idLong] = row.idCard;
                        var cardDb = cloneObject(row);
                        cardDb.orig = cloneObject(cardDb); //keep original values for comparison
                        alldata.cards[row.idCard] = cardDb;
                    });
                    //once all missing cards from the list are loaded, loop all cards to change their boards.
                    //this loop must be done every time there is a moved list since we need to know the cards inside at that point in time
                    for (var shortLinkCard in alldata.cards) {
                        var cardCur = alldata.cards[shortLinkCard];
                        if (cardCur.idList == idList && (cardCur.dateSzLastTrello == null || actionCur.date >= cardCur.dateSzLastTrello)) {
                            cardCur.dateSzLastTrello = actionCur.date;
                            cardCur.idBoard = listCur.idBoard;
                        }
                    }

                    stepDone(STATUS_OK);
                });
        }

        function processListAction() {
            var board = null;

            if (actionCur.type=="moveListFromBoard")
                board = actionCur.data.boardTarget;
            else
                board = actionCur.data.board;

            assert(board);
            var idBoard = alldata.boardsByLong[board.id];
            assert(idBoard); //can be unknown

            function updateList(list) {
                if (!list || list.id==IDLIST_UNKNOWN)
                    return;

                function updateCorruptedListFromObj(cur) {
                    if (cur._id !== undefined)
                        list.id = cur._id;
                    if (cur.closed !== undefined)
                        list.closed = cur.closed;
                    if (cur.name !== undefined)
                        list.name = cur.name;
                    if (cur.pos !== undefined)
                        list.pos = cur.pos;
                }

                if (typeof (list.id) == "object" && list.id._id)
                    updateCorruptedListFromObj(list.id);

                if (list.pos && (typeof (list.pos) == "object")) { //trello bug causes these to appear here
                    //console.log(JSON.stringify(actionCur, undefined, 4));
                    var posObj = list.pos;
                    list.pos = null;
                    if (posObj.updatedLists && posObj.updatedLists.length > 0) {
                        for (var ipos = 0; ipos < posObj.updatedLists.length; ipos++) {
                            var cur = posObj.updatedLists[ipos];
                            if (cur._id == list.id) {
                                updateCorruptedListFromObj(cur);
                            } else if (cur.name && cur._id) {
                                //recurse
                                updateList({id:cur._id, name: cur.name, closed: cur.closed || false, pos: cur.pos || null});
                            }
                        }
                    }

                }

                if (!bUpdateAlldataList(alldata.lists, list, idBoard, actionCur.date))
                    actionCur.old = true;
            }

            updateList(actionCur.data.listBefore);
            updateList(actionCur.data.listAfter);
            updateList(actionCur.data.list);

            stepDone(STATUS_OK);
        }


        function processBoardAction() { //update alldata.boards
            var board = actionCur.data.board;
            assert(board);
            //pre-processing figured out the map from id[long] to shortLink
            assert(alldata.boardsByLong[actionCur.data.board.id]);
            var boardCache = alldata.boards[alldata.boardsByLong[actionCur.data.board.id]];
            assert(boardCache); //must be here, we populated it based on boards already on the db.
            assert(boardCache.idLong && boardCache.idLong != IDBOARD_UNKNOWN);
            assert(boardCache.bArchived !== undefined);
            if (!boardCache.dateSzLastTrello || actionCur.date >= boardCache.dateSzLastTrello) {
                //name, bArchived and idLong was already handled when we got the boards last status.
                //but, we still have to process the board action to get the last action id.
                //This covers the case when the last action has another consecutive action with the exact same date. yea I know its very unlikely.
                boardCache.dateSzLastTrello = actionCur.date; //note: later, dateSzLastTrelloNew will overwrite it
                boardCache.idActionLast = actionCur.id;  //note: later, idActionLastNew will overwrite it
            }
            else
                actionCur.old = true;

            stepDone(STATUS_OK);
        }

        function processCommentSEAction() {
            var comment = actionCur.data.text.toLowerCase();
            rgKeywords.every(function (keyword) {
                keyword = keyword.trim().toLowerCase() + " ";
                var iStart = comment.indexOf(keyword);
                if (iStart >= 0) {
                    if (iStart > 0 && comment.charAt(iStart - 1) != " ") //whole word keyword
                        return true; //continue
                    //detect the card "resetsync" command
                    //in bFirstSync case, there is no need to process the command, and also serves as a way to workarround possible future sync issues caused
                    //by the command: those users could reset sync as a last resort.
                    var commentLower = comment.toLowerCase();
                    if (!bFirstSync && commentLower.indexOf(PLUSCOMMAND_RESET) >= 0) { //this "if" just prevents running the regex on every comment
                        g_regexWords.lastIndex = 0;
                        var words = commentLower.substring(iStart + keyword.length).match(g_regexWords); //http://stackoverflow.com/a/9402526/2213940
                        if (words.length > 0 && words[0] == PLUSCOMMAND_RESET) {
                            if (actionCur.data.card && actionCur.data.board) { //really should assert these
                                var idCardPush = actionCur.data.card.shortLink;
                                var idBoardCur = actionCur.idBoardSrc;
                                var boardLoop = alldata.boards[idBoardCur];
                                if (idCardPush && boardLoop) { //really should assert as it was set (if needed) by addShortLinkToCard
                                    assert(boardLoop.dateSzBefore);
                                    if (!mapHandledCardCommand[idCardPush]) {
                                        alldata.rgCardResetData.push({ idCard: idCardPush, idBoard: idBoardCur, dateSzBefore: boardLoop.dateSzBefore, idActionReset: actionCur.id });
                                        mapHandledCardCommand[idCardPush] = true;
                                    }
                                }
                            }
                        }
                    }
                    if (false) { //REVIEW CARDTRANSFER
                        const prefixFromCard = PLUSCOMMAND_ETRANSFER + PLUSCOMMAND_ETRANSFER_FROMCARD;
                        if (commentLower.indexOf(prefixFromCard) >= 0) {
                            const iPrefixFind = commentLower.indexOf(prefixFromCard);
                            const idCardFromTransfer = commentLower.substring(iPrefixFind + prefixFromCard.length).split(" ")[0]; //first word
                            //need to add the source card and its board to our globals
                            if (idCardFromTransfer) {
                                //
                            }
                        }
                    }
                    alldata.rgCommentsSE.push(actionCur); //candidate for being a S/E comment. Later we will perform stricter checks
                    return false; //stop
                }
                return true; //continue
            });
            stepDone(STATUS_OK);
        }

        function processCardAction() { //update alldata.cards
            var cardAction=actionCur.data.card;
            var board = null;

            if (typeAction == "convertToCardFromCheckItem" && (!actionCur.data.list || !actionCur.data.list.id)) {
                actionCur.data.list = { id: IDLIST_UNKNOWN, name: STR_UNKNOWN_LIST }; //temporary value until (maybe) fixed later
            }

            if (actionCur.data.boardTarget)
                board = actionCur.data.boardTarget;
            else
                board = actionCur.data.board;

            assert(board);
            var idBoard = alldata.boardsByLong[board.id];
            assert(idBoard); //can be unknown
            if (!bUpdateAlldataCard(actionCur, alldata.cards, cardAction, idBoard, actionCur.date))
                actionCur.old = true;
            stepDone(STATUS_OK);
        }

        if (actionCur.data.board)
            queue.push(processBoardAction);

        queue.push(getListsFromDb);
        queue.push(processListAction);
        if (typeAction == "moveListFromBoard" || typeAction == "moveListToBoard")
            queue.push(processCardsFromMovedList);

        if (actionCur.data.card) {
            if (!actionCur.data.card.shortLink)
                queue.push(addShortLinkToCard);
            queue.push(processCardAction);


            var idCardLongDebug = null;

            if (idCardLongDebug && idCardLongDebug == actionCur.data.card.id) {
                //debug helper
                var x = 1;
                x++;
            }

        }
        if ((typeAction == "commentCard" || (g_bProcessCardCommentCopies && typeAction == "copyCommentCard")) && bProcessCommentSE)
            queue.push(processCommentSEAction);

        stepDone(STATUS_OK); //start chain of functions
    } //processCurrent
}

function processResetCardCommands(tokenTrello, alldata, sendResponse) {
    var limit = g_cLimitActionsPerPage;

    g_syncStatus.setStage("Processing cards with reset sync", alldata.rgCardResetData.length);
    if (alldata.rgCardResetData.length == 0)
        sendResponse({ status: STATUS_OK });
    else {
        //first, remove all S/E for cards getting reset
        alldata.rgCommentsSE.forEach(function (action) {
            alldata.rgCardResetData.forEach(function (obj) { //this is a small array
                var idCard = obj.idCard;
                if (action.data.card && action.data.card.shortLink == idCard)
                    action.ignore = true;
            });
        });
        

        var cGotActions = 0;
        processThreadedItemsSync(tokenTrello, alldata.rgCardResetData, onPreProcessItem, onProcessItem, onFinishedAll);


        function onFinishedAll(status) {
            sendResponse({ status: status});
        }

        function onPreProcessItem(cardData) {
            return true;
        }

        function onProcessItem(tokenTrello, cardData, iitem, postProcessItem) {

            function callPost(status) {
                postProcessItem(status, cardData, iitem);
            }

            //note: dateSzBefore comes from board.dateSzBefore, which will include the last action processed in the board (if its for the same card)
            //this is ok because this getCardActions is for getting all actions for a card, and the last one processed will be deleted anyway
            getCardActions(tokenTrello, iitem, cardData.idCard, cardData.idBoard, limit, cardData.dateSzBefore, [],callbackGetCardActions);

            function callbackGetCardActions(response, lengthOriginal) {
                if (response.status != STATUS_OK) {
                    callPost(response.status);
                    return;
                }

                if (response.items && response.items.length > 0) {
                    var dateLast = "";
                    var itemResetLast = null;
                    response.items.forEach(function (item) {
                        //when reseting a card, we will zero s/e of entered items (not delete them) thus we must use
                        //a different action id by adding a postfix
                        assert(cardData.idActionReset);
                        item.idPostfix = "~" + cardData.idActionReset; //use ~ as - is reserved in makeRowAtom etc
                        //just add all comments. later we will check if its really an S/E comment
                        var comment = item.data.text.toLowerCase();
                        if (comment.indexOf(PLUSCOMMAND_RESET)<0) //note: this isnt perfect as user could include the string anywhere. but good enough to prevent duplication of resetsyncs
                            alldata.rgCommentsSE.push(item);
                        else {
                            if (dateLast < item.date) {
                                dateLast = item.date;
                                itemResetLast = item;
                            }
                        }
                    });
                    if (itemResetLast) //push a single resetsync item at the end. This prevents writting again all previous resetsync
                        alldata.rgCommentsSE.push(itemResetLast);

                    if (lengthOriginal < limit) {
                        callPost(response.status);
                        return;
                    }
                    
                    var actionLast = response.items[response.items.length - 1];
                    dateLast = new Date(actionLast.date);
                    //see "Why skip an item and query with a date 1 millisecond  after the last item"
                    dateLast.setTime(dateLast.getTime() + 1);

                    setTimeout(function () {
                        getCardActions(tokenTrello, iitem, cardData.idCard, cardData.idBoard, limit, dateLast.toISOString(), [actionLast.id], callbackGetCardActions);
                    }, MS_TRELLOAPI_WAIT);
                }
                else {
                    callPost(response.status);
                }
            }
        }
    }
}

function getBoardData(tokenTrello, bOnlyCards, idBoard, params, callback, waitRetry) {
    //https://trello.com/docs/api/board/index.html
    var bParamsIsPath = (params && params.charAt(0) == "/");
    var url = "https://trello.com/1/boards/" + idBoard + (bOnlyCards? "/cards?":(bParamsIsPath?"":"?")) + params;
    var xhr = new XMLHttpRequest();
    xhr.withCredentials = true; //not needed but might be chrome bug? placing it for future
    xhr.onreadystatechange = function (e) {
        if (xhr.readyState == 4) {
            handleFinishRequest();

            function handleFinishRequest() {
                var objRet = { status: "unknown error", hasPermission: false };
                var bReturned = false;

                if (xhr.status == 200) {
                    try {
                        objRet.hasPermission = true;
                        objRet.board = JSON.parse(xhr.responseText);
                        objRet.status = STATUS_OK;
                        callback(objRet);
                        bReturned = true;
                    } catch (ex) {
                        objRet.status = "error: " + ex.message;
                        logException(ex);
                    }
                } else {
                    //boards cant be deleted, but leave it here for future possibility. REVIEW zig: board delete case isnt handled in sync
                    if (bHandledDeletedOrNoAccess(xhr.status, objRet)) { //no permission to the board, or board deleted already
                        null; //happy lint
                    }
                    else if (xhr.status == 429) { //too many request, reached quota.
                        var waitNew = (waitRetry || 500) * 2;
                        if (waitNew < 8000) {
                            bReturned = true;
                            setTimeout(function () {
                                console.log("Plus: retrying api call"); //review zig put this in the generic version
                                getBoardData(tokenTrello, bOnlyCards, idBoard, params, callback, waitNew);
                            }, waitNew);
                        }
                        else {
                            objRet.status = errFromXhr(xhr);
                        }
                    }
                    else {
                        objRet.status = errFromXhr(xhr);
                    }
                }

                if (!bReturned) {
                    callback(objRet);
                }
            }
        }
    };

    xhr.open("GET", url);
    xhr.send();
}


function getListData(tokenTrello, idList, fields, callback, waitRetry) {
    //https://trello.com/docs/api/list/index.html

    var url = "https://trello.com/1/lists/" + idList + "?fields=" + fields;
    var xhr = new XMLHttpRequest();
    xhr.withCredentials = true; //not needed but might be chrome bug? placing it for future
    xhr.onreadystatechange = function (e) {
        if (xhr.readyState == 4) {
            handleFinishRequest();

            function handleFinishRequest() {
                var objRet = { status: "unknown error", hasPermission: false };
                var bReturned = false;

                if (xhr.status == 200) {
                    try {
                        objRet.hasPermission = true;
                        objRet.list = JSON.parse(xhr.responseText);
                        objRet.status = STATUS_OK;
                        callback(objRet);
                        bReturned = true;
                    } catch (ex) {
                        logException(ex);
                        objRet.status = "error: " + ex.message;
                    }
                } else {
                    if (bHandledDeletedOrNoAccess(xhr.status, objRet)) { //no permission to the list
                        null; //happy lint
                    }
                    else if (xhr.status == 429) { //too many request, reached quota.
                        var waitNew = (waitRetry || 500) * 2;
                        if (waitNew < 8000) {
                            bReturned = true;
                            setTimeout(function () {
                                console.log("Plus: retrying api call");
                                getListData(tokenTrello, idList, fields, callback, waitNew); //review zig: make a single wrapper for all trello api 429 handling
                            }, waitNew);
                        }
                        else {
                            objRet.status = errFromXhr(xhr);
                        }
                    }
                    else {
                        objRet.status = errFromXhr(xhr);
                    }
                }

                if (!bReturned) {
                    callback(objRet);
                }
            }
        }
    };

    xhr.open("GET", url);
    xhr.send();
}

var BOARD_ACTIONS_LIST_BASE = "updateList,deleteCard,commentCard,createList,convertToCardFromCheckItem,createCard,copyCard,emailCard,moveCardToBoard,moveCardFromBoard,updateBoard,moveListFromBoard,moveListToBoard,updateCard";
function buildBoardActionsList() {
    var ret = BOARD_ACTIONS_LIST_BASE;
    if (g_bProcessCardCommentCopies)
        ret += ",copyCommentCard";
    return ret;
}

function getCardActions(tokenTrello, iCard, idCard, idBoard, limit, strDateBefore, actionsSkip, callback, waitRetry) {
    //https://trello.com/docs/api/card/index.html
    //the API gets actions from newest to oldest always
    
    var url = "https://trello.com/1/cards/" + idCard + "/actions?action_member=true&action_memberCreator=true&action_member_fields=username&action_memberCreator_fields=username&limit=" + limit;

    if (true) {
        url = url + "&filter=commentCard";
        if (g_bProcessCardCommentCopies)
            url = url + ",copyCommentCard";

        if (strDateBefore && strDateBefore.length > 0)
            url = url + "&before=" + strDateBefore;
    }
    var xhr = new XMLHttpRequest();
    xhr.withCredentials = true; //not needed but might be chrome bug? placing it for future
    xhr.onreadystatechange = function (e) {
        if (xhr.readyState == 4) {
            handleFinishRequest();

            function handleFinishRequest() {
                var objRet = { status: "unknown error", hasPermission: false, items: [], iCard: iCard };
                var bReturned = false;

                if (xhr.status == 200) {
                    try {
                        objRet.hasPermission = true;
                        var obj = JSON.parse(xhr.responseText);
                        var lengthOriginal = obj.length;

                        objRet.status = STATUS_OK;
                        var listRet = [];
                        //NOTE
                        //Why skip an item and query with a date 1 millisecond  after the last item?
                        //see the note in getBoardActions on why we paginate this way Trello actions
                        //note that cards currently only use one action to skip, but ive kept the code similar to
                        //getBoardActions in hopes of later unifying both
                        for (var iAddBoardSrc = 0; iAddBoardSrc < obj.length; iAddBoardSrc++) {
                            var itemCur = obj[iAddBoardSrc];
                            if (actionsSkip.length > 0) {
                                var iSkip = 0;
                                for (iSkip = 0; iSkip < actionsSkip.length; iSkip++) {
                                    if (actionsSkip[iSkip] == itemCur.id)
                                        break;
                                }
                                if (iSkip < actionsSkip.length) {
                                    actionsSkip.splice(iSkip, 1); //it appears once at most, so speed things up by removing it
                                    continue; //found above
                                }
                            }
                            itemCur.idBoardSrc = idBoard; //we cant trust action's board shortLink because of trello bugs. see note on getBoardActions
                            listRet.push(itemCur);
                        }
                        objRet.items = listRet;
                        callback(objRet, lengthOriginal);
                        bReturned = true;
                    } catch (ex) {
                        logException(ex);
                        objRet.status = "error: " + ex.message;
                    }
                } else {
                    if (bHandledDeletedOrNoAccess(xhr.status, objRet)) { //no permission to the card
                        null; //happy lint
                    }
                    else if (xhr.status == 429) { //too many request, reached quota. 
                        var waitNew = (waitRetry || 500) * 2;
                        if (waitNew < 8000) {
                            bReturned = true;
                            setTimeout(function () {
                                console.log("Plus: retrying api call");
                                getCardActions(tokenTrello, iCard, idCard, idBoard, limit, strDateBefore, actionsSkip, callback, waitNew);
                            }, waitNew);
                        }
                        else {
                            objRet.status = errFromXhr(xhr);
                        }
                    }
                    else {
                        objRet.status = errFromXhr(xhr);
                    }
                }

                if (!bReturned) {
                    callback(objRet);
                }
            }
        }
    };

    xhr.open("GET", url);
    xhr.send();
}


function getBoardActions(tokenTrello, iBoard, idBoard, limit, strDateBefore, strDateAfter, actionsSkip, callback, waitRetry) {
    //https://developers.trello.com/advanced-reference/board#get-1-boards-board-id-actions
    //the API gets actions from newest to oldest always
    //closed==archived
    //"copyBoard" sucede cuando se copia un board, no empezara con "createBoard".
    var bFilter = true; //debe ser true. false used for testing
    var url = "https://trello.com/1/boards/" + idBoard + "/actions?action_member=true&action_memberCreator=true&action_member_fields=username&action_memberCreator_fields=username&limit=" + limit; //review zig trello promised to add filtering of memberCreator fields. currently causes excess download
    
    if (bFilter) {
        url = url + "&filter=" + buildBoardActionsList();
        if (strDateBefore && strDateBefore.length > 0)
            url = url + "&before=" + strDateBefore;

        if (strDateAfter && strDateAfter.length > 0)
            url = url + "&since=" + strDateAfter;
    }
    var xhr = new XMLHttpRequest();
    xhr.withCredentials = true; //not needed but might be chrome bug? placing it for future
    xhr.onreadystatechange = function (e) {
        if (xhr.readyState == 4) {
            handleFinishRequest();

            function handleFinishRequest() {
                var objRet = { status: "unknown error", hasPermission: false, items:[], iBoard: iBoard };
                var bReturned = false;

                if (xhr.status == 200) {
                    try {
                        objRet.hasPermission = true;
                        var obj = JSON.parse(xhr.responseText);
                        var lengthOriginal = obj.length;
                        objRet.status = STATUS_OK;
                        var listRet = [];
                        //NOTE
                        //Why skip an item and query with a date 1 millisecond  after the last item?
                        //Unfortunately the trello api v1 does not allow to query before/after a given action id,
                        //only based on dates. While its very unlikely, its possible that two actions might have the
                        //same date down to the millisecond. If I were to simply use "before"/"after" the last action querried,
                        //it could skip on those with the same date (depending on how trello decided to order them).
                        //Thus, I instead use a query before the last date plus one millisecond.
                        //NOTE 2
                        //This way of paging can end up with duplicates being inserted, consider the case
                        //where the last two actions we got have the same timestamp (this IS possible, see note where we later sort actions)
                        //then we would end up getting those two again on the next iteration. but we only put the last one on actionsSkip
                        //Plus deals with this by treating each action applied as being idempotent. for example an s/e row with duplicate id will be ignored and not commited
                        //However, we still here attempt to cover the most common case and remove the expected dups.
                        //this helps performance-wise otherwise every time all boards will have one "new" (duplicate) action to process
                        for (var iAddBoardSrc = 0; iAddBoardSrc < obj.length; iAddBoardSrc++) {
                            var itemCur=obj[iAddBoardSrc];
                            if (actionsSkip.length > 0) {
                                var iSkip = 0;
                                for (iSkip=0; iSkip < actionsSkip.length; iSkip++) {
                                    if (actionsSkip[iSkip] == itemCur.id)
                                        break;
                                }
                                if (iSkip < actionsSkip.length) {
                                    actionsSkip.splice(iSkip, 1);   //it appears once at most, so speed things up by removing it
                                    continue; //found above
                                }
                            }
                            itemCur.idBoardSrc = idBoard;  //sometimes the trello board is not correct. use this one always
                            listRet.push(itemCur);
                        }
                        objRet.items = listRet;
                        callback(objRet, lengthOriginal);
                        bReturned = true;
                    } catch (ex) {
                        logException(ex);
                        objRet.status = "error: " + ex.message;
                    }
                } else {
                    if (bHandledDeletedOrNoAccess(xhr.status, objRet)) { //no permission to the board
                        null; //happy lint
                    }
                    else if (xhr.status == 429) { //too many request, reached quota. 
                        var waitNew = (waitRetry || 500) * 2;
                        if (waitNew < 8000) {
                            bReturned = true;
                            setTimeout(function () {
                                console.log("Plus: retrying api call");
                                getBoardActions(tokenTrello, iBoard, idBoard, limit, strDateBefore, strDateAfter, actionsSkip, callback, waitNew);
                            }, waitNew);
                        }
                        else {
                            objRet.status = errFromXhr(xhr);
                        }
                    }
                    else {
                        objRet.status = errFromXhr(xhr);
                    }
                }

                if (!bReturned) {
                    callback(objRet);
                }
            }
        }
    };

    xhr.open("GET", url);
    xhr.send();
}


function getAllTrelloBoardActions(tokenTrello, alldata, boardsReport, boardsTrello, sendResponse, bUserInitiated) {
    assert(boardsReport);

    if (false) { //debugging
        sendResponse({ status: STATUS_OK });
        return;
    }
    var limit = g_cLimitActionsPerPage;
    var statusProcess = { boards: [], iBoard: -1, hasBoardAccessDirect: {} };
    var results = [];
    var bReturned = false;
    var cNeedProcess = 0;
    var cReadyToWait = false;

    handleGetReport({ sql: "SELECT dateLastLabelsSync from GLOBALS", values: [] },
        function (responseGlobal) {
            if (responseGlobal.status != STATUS_OK) {
                sendResponse(responseGlobal);
                return;
            }
            assert(responseGlobal.rows.length == 1);
            var dateLastLabelsSync = new Date(responseGlobal.rows[0].dateLastLabelsSync);
            assert(dateLastLabelsSync);
            var dateNow = new Date();
            var msDateNow = dateNow.getTime();
            alldata.dateLastLabelsSyncStrOrig = responseGlobal.rows[0].dateLastLabelsSync;
            alldata.dateLastLabelsSyncStrNew = dateNow.toISOString();
            var msdateLastLabelsSync = dateLastLabelsSync.getTime();
            msdateLastLabelsSync = Math.max(0, msdateLastLabelsSync - g_msDelayTrelloSearch*2); //pretend is a little before, to cover for overlap with eventually consistent search in trello
            //must include at least the past g_msDelayTrelloSearch because of eventual search consistency. *2 for safety
            var cDaysDelta = ((msDateNow - msdateLastLabelsSync) / 1000 / 60 / 60 / 24);
            if (cDaysDelta < 0)
                cDaysDelta = 0; //user's system date might be wrong
            
            cDaysDelta = Math.ceil(cDaysDelta); //trello api handles minimum of 1 'edited' search
            var bForceAllBoards = (cDaysDelta > 30);
            if (bForceAllBoards)
                worker(cDaysDelta, msdateLastLabelsSync, sendResponse);
            else {
                //call with a custom sendResponse, so we can retry worker if needed
                worker(cDaysDelta, msdateLastLabelsSync, function (response) {
                    if (response.status != STATUS_OK && response.bNeedWorkerRetry) {
                        bForceAllBoards = true;
                        worker(cDaysDelta, msdateLastLabelsSync, sendResponse); //retry
                    }
                    else {
                        sendResponse(response);
                    }
                });
            }


            function worker(cDaysDelta, msdateLastLabelsSync, sendResponse) {
                var boardsProcess = [];
                var mapBoards = {};
                var mapBecameNonMemberBoard = {};
                boardsReport.forEach(function (board) {
                    board.orig = cloneObject(board); //keep original values for comparison
                    //verDeepSync notes:
                    //when a user regains membership to a board that he used to be a member, we want to fix all cards and 
                    //history with "unknown board/list" by doing a "deep sync". For this, we want to set verDeepSync = VERDEEPSYNC.NOTMEMBER if the user is not a member,
                    //so that when regaining membership, verDeepSync will change and cause a deep sync.

                    assert(VERDEEPSYNC.NOTMEMBER < VERDEEPSYNC.MINVALID);
                    if (board.verDeepSync != VERDEEPSYNC.NOTMEMBER)
                        mapBecameNonMemberBoard[board.idBoard] = true; //assume true until later
                    board.bProcessActions = false;
                    board.bPushed = false;
                    mapBoards[board.idBoard] = board;
                });


                var boardDb = null;
                boardsTrello.forEach(function (board) {
                    boardDb = mapBoards[board.shortLink];
                    //trello returns null dateLastActivity sometimes.
                    if (!board.dateLastActivity) {
                        board.dateLastActivity = earliest_trello_date(); //give it some default date. safest to make it earliest so it later queries for all data
                        if (boardDb)
                            board.dateLastActivity = boardDb.dateLastActivity; //default to the last known value
                    }

                    if (!board.actions || board.actions.length == 0)
                        return;
                    assert(board.dateLastActivity); //normalized above
                    var idTeamNew = board.idOrganization || null;

                    statusProcess.hasBoardAccessDirect[board.shortLink] = true;


                    var actionLast = board.actions[0];
                    if (actionLast.date > board.dateLastActivity)
                        board.dateLastActivity = actionLast.date; //fix it, as sometimes trello api returns null date (normalized to earliest_trello_date)

                    if (boardDb) {
                        mapBecameNonMemberBoard[board.shortLink] = false;
                    }
                    else {
                        boardDb = {
                            idBoard: board.shortLink,
                            name: board.name,
                            idLong: board.id,
                            bPendingCreation: true,
                            dateSzLastTrello: null,
                            idActionLast: null,
                            bArchived: 0,
                            verDeepSync: VERDEEPSYNC.MINVALID, //always smaller than current. will cause a deep sync
                            dateLastActivity: board.dateLastActivity,
                            idTeam: idTeamNew
                        };
                    }

                    assert(boardDb.dateLastActivity);
                    assert(boardDb.idBoard == board.shortLink);

                    boardDb.bProcessActions = true;
                    boardDb.methodProcess = { deep: false, needLabels: false, needSearch: false };

                    if (boardDb.dateSzLastTrello && actionLast.date < boardDb.dateSzLastTrello) {
                        //when cards are deleted or moved, their history will be moved out of the board so the last action date could be smaller.
                        boardDb.bProcessActions = false;
                    }

                    var bSameLastAction = (actionLast.id == boardDb.idActionLast);
                    var bBoardUpdated = (boardDb.dateLastActivity < board.dateLastActivity);
                    if (bSameLastAction)
                        boardDb.bProcessActions = false;

                    if (bBoardUpdated) {
                        boardDb.dateLastActivity = board.dateLastActivity;
                        boardDb.methodProcess.needLabels = true;
                    }
                    else {
                        var msdateLastActivity = new Date(boardDb.dateLastActivity).getTime();
                        //note: msdateLastLabelsSync already has substracted the search delay
                        if (msdateLastActivity > msdateLastLabelsSync) {
                            if (alldata.bForceDeepSyncOnRecentBoards)
                                boardDb.verDeepSync = VERDEEPSYNC.MINVALID; //force deep later
                            else
                                boardDb.methodProcess.needSearch = true;
                        }
                    }


                    if (bForceAllBoards || bBoardUpdated || boardDb.methodProcess.needSearch || boardDb.verDeepSync < VERDEEPSYNC.CURRENT || !bSameLastAction || boardDb.idTeam != idTeamNew) {
                        assert(board.name);
                        boardDb.name = board.name;
                        boardDb.bArchived = board.closed || false;
                        boardDb.idLong = board.id;
                        boardDb.idTeam = idTeamNew; //can be null
                        boardDb.bPushed = true;
                        assert(boardDb.methodProcess);

                        if (boardDb.bProcessActions) {
                            var dateLastAction = new Date(actionLast.date);
                            dateLastAction.setTime(dateLastAction.getTime() + 1);
                            boardDb.dateSzBefore = dateLastAction.toISOString();
                        }
                        if (bForceAllBoards || boardDb.verDeepSync == VERDEEPSYNC.NOTMEMBER)
                            boardDb.verDeepSync = VERDEEPSYNC.MINVALID; //restore as its no longer not member. this causes deep sync

                        if (boardDb.verDeepSync >= VERDEEPSYNC.MINVALID && boardDb.verDeepSync < VERDEEPSYNC.CURRENT)
                            boardDb.methodProcess.deep = true;
                        boardDb.bBoardUpdated = bBoardUpdated;
                        boardsProcess.push(boardDb);
                    }
                });

                populateTeams(alldata.teams, boardsTrello); //happens after looping boardsTrello, as fields (like dateLastActivity) are updated there

                for (var idBoardShort in mapBecameNonMemberBoard) {
                    if (mapBecameNonMemberBoard[idBoardShort]) {
                        boardDb = mapBoards[idBoardShort];
                        assert(boardDb);
                        assert(!boardDb.bPushed);
                        assert(!boardDb.methodProcess);
                        boardDb.methodProcess = { deep: false, needLabels: false, needSearch: false };
                        boardDb.bPushed = true;
                        boardDb.bArchived = true; //pretend archived. when user gains membership again, it will get fixed
                        assert(!boardDb.bProcessActions);
                        boardDb.verDeepSync = VERDEEPSYNC.NOTMEMBER; //forces deep sync later when user regains membership
                        boardsProcess.push(boardDb); //just to update version+archived
                    }
                }
                statusProcess.boards = boardsProcess;
                if (boardsProcess.length == 0) {
                    //skip searching for modified cards, otherwise we would do that search every time
                    startAllBoardActionsCalls({}, {}, sendResponse);
                    return;
                }

                var requestCardsUnknown = { sql: SQLQUERY_PREFIX_CARDDATA + "FROM CARDS where idBoard=?", values: [IDBOARD_UNKNOWN] };
                handleGetReport(requestCardsUnknown,
                    function (responseReport) {
                        if (responseReport.status != STATUS_OK) {
                            sendResponse(responseReport);
                            return;
                        }
                        var cards = responseReport.rows || [];
                        var mapCardsUnknownBoard = {};
                        cards.forEach(function (card) {
                            mapCardsUnknownBoard[card.idCard] = card;
                        });

                        var requestListsUnknown = { sql: SQLQUERY_PREFIX_LISTDATA + "FROM LISTS where idBoard=? AND idList<>?", values: [IDBOARD_UNKNOWN, IDLIST_UNKNOWN] };
                        handleGetReport(requestListsUnknown,
                            function (responseReport) {
                                if (responseReport.status != STATUS_OK) {
                                    sendResponse(responseReport);
                                    return;
                                }
                                var lists = responseReport.rows || [];
                                var mapListsUnknownBoard = {};
                                lists.forEach(function (list) {
                                    mapListsUnknownBoard[list.idList] = list;
                                });

                                if (bForceAllBoards) {
                                    //no need to search modified cards
                                    startAllBoardActionsCalls(mapCardsUnknownBoard, mapListsUnknownBoard, sendResponse);
                                }
                                else {
                                    //search for recently modified cards
                                    var cLimitCardsSearch = 1000;
                                    var idBoardsSearch = [];
                                    assert(statusProcess.boards.length > 0);
                                    statusProcess.boards.forEach(function (board) {
                                        //search only on boards that were modified and that will not undergo deep sync later
                                        if (board.idLong && !board.methodProcess.deep) {
                                            if (board.methodProcess.needLabels || board.methodProcess.needSearch) //else, came from mapBecameNonMemberBoard
                                                idBoardsSearch.push(board.idLong);
                                        }
                                    });

                                    if (idBoardsSearch.length == 0) {
                                        startAllBoardActionsCalls(mapCardsUnknownBoard, mapListsUnknownBoard, sendResponse);
                                        return;
                                    }
                                    
                                    doSearchTrelloChanges(bUserInitiated, tokenTrello, idBoardsSearch, cDaysDelta, cLimitCardsSearch, function (data) {
                                        if (data.status != STATUS_OK) {
                                            sendResponse(data);
                                            return;
                                        }
                                        
                                        //review: one user had data.search undefined so check it
                                        if (!data.search || data.search.cards.length == cLimitCardsSearch) {
                                            //rare case, too many cards changed. instead of coding a paged search, just tell caller to retry with a full deep sync
                                            //hack alert: this repeats the previous step using deep sync for all boards. might be hard to maintain if step later changes global state
                                            sendResponse({ bNeedWorkerRetry: true, status: "retry with deep sync"});
                                        }
                                        else {
                                            var cardsSearch = [];
                                            data.search.cards.forEach(function (card) {
                                                if (card.dateLastActivity) {
                                                    var msCard = (new Date(card.dateLastActivity)).getTime();
                                                    if (msCard < (msdateLastLabelsSync - g_msDelayTrelloSearch*3)) {
                                                        //stale card that still shows in search because we always search for at least "edited:1"
                                                        //so skip those that are safely out of our range, just to avoid processing them and later do nothing (no changes)
                                                        return;
                                                    }
                                                }
                                                cardsSearch.push(card);
                                            });
                                            startAllBoardActionsCalls(mapCardsUnknownBoard, mapListsUnknownBoard, sendResponse, cardsSearch);
                                        }
                                    });
                                }
                            });
                    });
            }

            function startAllBoardActionsCalls(mapCardsUnknownBoard, mapListsUnknownBoard, sendResponse, cardsSearch) {
                var cGotActions = 0;
                g_syncStatus.setStage("Getting board history", statusProcess.boards.length);
                if (statusProcess.boards.length == 0) //not really necessary but it happens very often so short-circuit earlier
                    onFinishedAll(STATUS_OK);
                else
                    processThreadedItemsSync(tokenTrello, statusProcess.boards, onPreProcessItem, onProcessItem, onFinishedAll);


                function onFinishedAll(status) {
                    results.sort(function (a, b) {
                        var cmp = cmpString(a.date, b.date);
                        if (cmp == 0) {
                            //some paired trello actions like moveCardFromBoard/moveCardToBoard receive the exact same date, thus a simple sort by date
                            //could end up flipping those pairs. This caused a bug before 2.11.5 where, depending on the order that the actions were queried, the pairs
                            //could end up inverted
                            if (a.type.indexOf("From") >= 0 && b.type.indexOf("To") >= 0)
                                return -1;
                            else if (b.type.indexOf("From") >= 0 && a.type.indexOf("To") >= 0)
                                return 1;
                            else if (b.type != a.type) {
                                //sometimes an updateCard happens at the same time as others. in plus case, in old versions
                                //it would add a comment and in paralel it would rename the card. we want updateCard to win
                                //and since "updateCard" > "commentCard" or "copyCommentCard", this works like the order we want
                                //this also gives order consistency.

                                return a.type.localeCompare(b.type);
                            }
                        }
                        return cmp;
                    });
                    if (results.length) {
                        saveAsFile(results, "resultsSorted-" + results.length + ".json");
                        saveAsFile(statusProcess, "statusProcess.json");
                    }

                    sendResponse({ status: status, actions: results, boards: statusProcess.boards, hasBoardAccessDirect: statusProcess.hasBoardAccessDirect });
                }

                function onPreProcessItem(board) {
                    if (board.hasPermission === false)
                        return false;

                    if (!board.dateSzLastTrelloNew) {
                        board.dateSzLastTrelloNew = (board.dateSzLastTrello || "");
                        board.idActionLastNew = (board.idActionLast || "");
                    }
                    else {
                        assert(board.idActionLastNew);
                    }
                    return true;
                }

                function onProcessItem(tokenTrello, board, iitem, postProcessItem) {

                    function callPost(status) {
                        if (status != STATUS_OK) {
                            postProcessItem(status, board, iitem);
                            return;
                        }

                        var idBoard = board.idBoard;
                        var labelsDb = [];

                        //get all board labels
                        var request = { sql: SQLQUERY_PREFIX_LABELDATA + "FROM LABELS where idBoardShort=?", values: [idBoard] };
                        handleGetReport(request,
                            function (responseReport) {
                                if (responseReport.status != STATUS_OK) {
                                    postProcessItem(responseReport.status, board, iitem);
                                    return;
                                }

                                function populateAllDataLabel(row) {
                                    var labelDb = cloneObject(row); //to modify it
                                    labelDb.orig = cloneObject(labelDb); //keep original values for comparison
                                    assert(labelDb.idLabel);
                                    alldata.labels[labelDb.idLabel] = labelDb;
                                    labelsDb.push(labelDb);
                                }

                                responseReport.rows.forEach(function (row) {
                                    populateAllDataLabel(row);
                                });


                                if (!bHandleUpdateBoardDeepSync())
                                    postProcessItem(status, board, iitem);
                            });

                        function bHandleUpdateBoardDeepSync() {
                            if (!board.methodProcess.deep && !board.methodProcess.needLabels && !board.methodProcess.needSearch)
                                return false;
                            //get all board lists in db, so we can have an "orig"
                            var request = { sql: SQLQUERY_PREFIX_LISTDATA + "FROM LISTS where idBoard=?", values: [idBoard] };
                            handleGetReport(request,
                                function (responseReport) {
                                    if (responseReport.status != STATUS_OK) {
                                        postProcessItem(responseReport.status, board, iitem);
                                        return;
                                    }

                                    function populateAllDataList(row) {
                                        var listDb = cloneObject(row); //to modify it
                                        assert(listDb.idList);
                                        listDb.orig = cloneObject(listDb); //keep original values for comparison
                                        alldata.lists[listDb.idList] = listDb;
                                    }

                                    responseReport.rows.forEach(function (row) {
                                        populateAllDataList(row);
                                    });

                                    //get all board cards in db, so we can have an "orig"

                                    var request = { sql: SQLQUERY_PREFIX_CARDDATA + "FROM CARDS WHERE idBoard=?", values: [idBoard] };
                                    handleGetReport(request,
                                        function (responseReport) {
                                            if (responseReport.status != STATUS_OK) {
                                                postProcessItem(responseReport.status, board, iitem);
                                                return;
                                            }


                                            function populateAllDataCard(row) {
                                                var cardDb = cloneObject(row); //to modify it later
                                                assert(cardDb.idCard);
                                                alldata.cardsByLong[cardDb.idLong] = cardDb.idCard;
                                                cardDb.orig = cloneObject(cardDb); //keep original values for comparison
                                                alldata.cards[cardDb.idCard] = cardDb;
                                            }

                                            responseReport.rows.forEach(function (row) {
                                                populateAllDataCard(row);
                                            });

                                            request = {
                                                sql: SQLQUERY_PREFIX_LABELCARDDATA + "FROM LABELCARD WHERE idCardShort in (SELECT idCard from CARDS where idBoard=?)",
                                                values: [idBoard]
                                            };

                                            if (g_bDummyLabel) {
                                                request.sql += " AND idLabel<>?";
                                                request.values.push(IDLABEL_DUMMY);
                                            }
                                            request.sql += " ORDER BY idCardShort DESC,idLabel DESC";
                                            handleGetReport(request,
                                                function (responseReport) {
                                                    if (responseReport.status != STATUS_OK) {
                                                        postProcessItem(responseReport.status, board, iitem);
                                                        return;
                                                    }

                                                    responseReport.rows.forEach(function (lc) {
                                                        var cardDb = alldata.cards[lc.idCardShort];
                                                        if (!cardDb)
                                                            return; //might be out of sync
                                                        assert(cardDb.orig);
                                                        if (!cardDb.orig.idLabels)
                                                            cardDb.orig.idLabels = [];
                                                        cardDb.orig.idLabels.push(lc.idLabel);
                                                    });

                                                    stepBoardData();
                                                });

                                            function stepBoardData() {
                                                //trello returns null dateLastActivity sometimes. use a default a little before now, so in case local clock is a little off, it wont save a future date.
                                                var szdateNowDefault = new Date(Date.now() - 1000 * 60 * 60).toISOString();
                                                //review zig: handle updated renamed/[deleted] labels
                                                var paramsQuery = null;

                                                if (board.methodProcess.deep) {
                                                    paramsQuery = "labels=all&label_fields=all&labels_limit=1000&cards=all&card_fields=labels,due,closed,dateLastActivity,idList,shortLink,name,idShort&lists=all&list_fields=closed,name,pos&fields=dateLastActivity";
                                                }
                                                else if (board.methodProcess.needLabels) {
                                                    //just get labels. currently the board's last activity date its the only way to know a label might have changed (without using webhooks)
                                                    paramsQuery = "labels=all&label_fields=all&labels_limit=1000&fields=dateLastActivity";
                                                }
                                                else {
                                                    assert(board.methodProcess.needSearch);
                                                    //force this case to also end in processBoardData, to handle previously searched cards for this board
                                                    var dataProcess = {
                                                        status: STATUS_OK,
                                                        board: {
                                                            id: board.idLong,
                                                            dateLastActivity: board.dateLastActivity
                                                        }
                                                    };
                                                    processBoardData(dataProcess);
                                                    return;
                                                }

                                                getBoardData(tokenTrello, false, idBoard, paramsQuery, processBoardData);

                                                function processBoardData(data) {
                                                    if (data.status == STATUS_OK && data.board) {
                                                        var lists = data.board.lists; //might be undefined
                                                        var cards = data.board.cards; //might be undefined
                                                        var labelsBoard = data.board.labels;

                                                        function updateLabel(label) {
                                                            var labelDb = alldata.labels[label.id];
                                                            var row = {
                                                                idLabel: label.id,
                                                                name: label.name || label.color, //default to color if name is empty
                                                                idBoardShort: idBoard,
                                                                color: label.color
                                                            };
                                                            if (!labelDb) {
                                                                labelDb = row;
                                                                alldata.labels[labelDb.idLabel] = labelDb;
                                                            }
                                                            else {
                                                                labelDb.name = row.name;
                                                                labelDb.idBoardShort = row.idBoardShort;
                                                                labelDb.color = row.color;
                                                            }
                                                        }

                                                        //lists
                                                        if (lists) {
                                                            var dateLast = data.board.dateLastActivity || szdateNowDefault;

                                                            lists.forEach(function (list) {
                                                                assert(list.id);
                                                                var listUnknownBoard = mapListsUnknownBoard[list.id];
                                                                if (listUnknownBoard)
                                                                    populateAllDataList(listUnknownBoard);

                                                                //list doesnt have a dateLastActivity so use board's dateLastActivity
                                                                bUpdateAlldataList(alldata.lists, list, idBoard, dateLast);
                                                            });
                                                        }

                                                        //labels
                                                        if (labelsBoard) {
                                                            labelsDb.forEach(function (label) {
                                                                if (label.idBoardShort == idBoard)
                                                                    label.idBoardShort = IDBOARD_UNKNOWN; //temporarily unknown. restored below if still in board
                                                            });

                                                            labelsBoard.forEach(function (label) {
                                                                assert(label.id);
                                                                updateLabel(label);
                                                            });
                                                        }

                                                        function processCards(cards) {
                                                            cards.forEach(function (card) {
                                                                if (card.idBoard && card.idBoard != data.board.id) {
                                                                    //when passing cards from search, it contains results from multiple boards.
                                                                    return;
                                                                }
                                                                assert(card.id);
                                                                assert(card.shortLink);
                                                                var cardUnknownBoard = mapCardsUnknownBoard[card.shortLink];
                                                                if (cardUnknownBoard)
                                                                    populateAllDataCard(cardUnknownBoard); //card belongs to this board, load it into alldata cards/cardsByLong
                                                                else
                                                                    alldata.cardsByLong[card.id] = card.shortLink;
                                                                bUpdateAlldataCard(null, alldata.cards, card, idBoard, card.dateLastActivity || szdateNowDefault);

                                                                //labels
                                                                if (card.labels) {
                                                                    var cardAD = alldata.cards[card.shortLink];
                                                                    assert(cardAD);
                                                                    cardAD.idLabels = [];
                                                                    card.labels.forEach(function (label) {
                                                                        cardAD.idLabels.push(label.id);
                                                                        if (!labelsBoard)
                                                                            updateLabel(label);
                                                                    });
                                                                }
                                                            });
                                                        }

                                                        //cards
                                                        if (cards)
                                                            processCards(cards);

                                                        if (cardsSearch)
                                                            processCards(cardsSearch); //warning: in this case, cards just contain labels, not all fields. processCards deals with that
                                                        board.verDeepSync = VERDEEPSYNC.CURRENT;
                                                    }
                                                    postProcessItem(data.status, board, iitem);
                                                }
                                            }
                                        });
                                });
                            return true;
                        } //end bHandleUpdateBoardDeepSync

                    }

                    if (board.bProcessActions === false)
                        callPost(STATUS_OK); //shortcut getting actions.
                    else
                        getBoardActions(tokenTrello, iitem, board.idBoard, limit, board.dateSzBefore, board.dateSzLastTrelloNew, [board.idActionLastNew], callbackGetBoardActions);

                    function callbackGetBoardActions(response, lengthOriginal) {
                        var boardCur = board;
                        if (response.status != STATUS_OK) {
                            callPost(response.status);
                            return;
                        }

                        cGotActions++;
                        if (cGotActions % 2 == 0)
                            g_syncStatus.postfixStage = "..."; //keeps "alive" the status progress, even if the last board is stuck on a lot of history.
                        else
                            g_syncStatus.postfixStage = "";
                        updatePlusIcon(true);
                        if (response.hasPermission !== undefined)
                            boardCur.hasPermission = response.hasPermission;

                        if (response.items && response.items.length > 0) {
                            var actionFirst = response.items[0];
                            var dateFirst = new Date(actionFirst.date);
                            dateFirst.setTime(dateFirst.getTime() - 1);
                            var szDateFirst = dateFirst.toISOString();
                            assert(boardCur.dateSzLastTrelloNew || boardCur.dateSzLastTrelloNew == "");
                            if (szDateFirst > boardCur.dateSzLastTrelloNew) { //happens on first page per board
                                boardCur.dateSzLastTrelloNew = szDateFirst;
                                boardCur.idActionLastNew = actionFirst.id;
                            }
                            results = results.concat(response.items);

                            if (lengthOriginal < limit) {
                                callPost(response.status);
                                return;
                            }
                            var actionLast = response.items[response.items.length - 1];
                            var dateLast = new Date(actionLast.date);
                            //see "Why skip an item and query with a date 1 millisecond  after the last item"
                            dateLast.setTime(dateLast.getTime() + 1);
                            setTimeout(function () {
                                getBoardActions(tokenTrello, response.iBoard, boardCur.idBoard, limit, dateLast.toISOString(), boardCur.dateSzLastTrello || "", [actionLast.id, boardCur.idActionLast || ""], callbackGetBoardActions);
                            }, MS_TRELLOAPI_WAIT);
                        }
                        else {
                            callPost(response.status);
                        }
                    }
                }
            }
        });
}


function getBoardsLastInfo(tokenTrello, callback) {
    getBoardsLastInfoWorker(tokenTrello, callback);
}


function getBoardsLastInfoWorker(tokenTrello, callback, waitRetry) {
    //https://developers.trello.com/advanced-reference/member#get-1-members-idmember-or-username-boards
    var url = "https://trello.com/1/members/me/boards?organization=true&organization_fields=displayName,name&fields=idOrganization,name,closed,shortLink,dateLastActivity&actions=" + buildBoardActionsList() + "&actions_limit=1&action_fields=date&action_memberCreator=false";
	var xhr = new XMLHttpRequest();
    xhr.withCredentials = true; //not needed but might be chrome bug? placing it for future
    xhr.onreadystatechange = function (e) {
        if (xhr.readyState == 4) {
            handleFinishRequest();

            function handleFinishRequest() {
                var objRet = { status: "unknown error", items: []};
                var bReturned = false;

                if (xhr.status == 200) {
                    try {
                        objRet.hasPermission = true;
                        var obj = JSON.parse(xhr.responseText);
                        objRet.status = STATUS_OK;
                        objRet.items = obj;
                        callback(objRet);
                        bReturned = true;
                    } catch (ex) {
                        logException(ex);
                        objRet.status = "error: " + ex.message;
                    }
                } else {
                    if (xhr.status == 429) { //too many request, reached quota. REVIEW zig: consolidate all retry logic in a function, use callbacks to implement each one
                        var waitNew = (waitRetry || 500) * 2;
                        if (waitNew < 8000) {
                            bReturned = true;
                            setTimeout(function () {
                                console.log("Plus: retrying api call");
                                getBoardsLastInfoWorker(tokenTrello, callback, waitNew);
                            }, waitNew);
                        }
                        else {
                            objRet.status = errFromXhr(xhr);
                        }
                    }
                    else {
                        objRet.status = errFromXhr(xhr);
                    }
                }

                if (!bReturned) {
                    callback(objRet);
                }
            }
        }
    };

    xhr.open("GET", url);
    xhr.send();
}

var g_etDateCache = null;
function earliest_trello_date() {
    if (!g_etDateCache)
        g_etDateCache = new Date(1).toISOString();
    return g_etDateCache;
}


var g_bDisplayedDSCWarning = false;

function doSearchTrelloChanges(bUserInitiated, tokenTrello, idBoardsSearch, cDaysDelta, cCardsLimit, callback, waitRetry) {
    //https://developers.trello.com/advanced-reference/search

    //warning: card_fields must be the same as the fields we get in card actions, see bUpdateAlldataCard for relevant fields. Otherwise a search
    //calling on bUpdateAlldataCard could update dateSzLastTrello to a newer date and moot action change updates, as the action will have a slightly smaller date
        
    var dscTrello=localStorage["trelloAuth-dsc"];
    var url = "https://trello.com/1/search?query=edited:" + cDaysDelta +
        "&modelTypes=cards&cards_limit=" +
        cCardsLimit +
        "&card_fields=closed,due,idList,name,dateLastActivity,labels,shortLink,idBoard,idShort" +  //warning: idBoard is trello long idBoard
        "&idBoards=" + idBoardsSearch.join();
    if (dscTrello)
        url = url + "&dsc=" + dscTrello;

    var xhr = new XMLHttpRequest();
    xhr.withCredentials = true; //not needed but might be chrome bug? placing it for future

    xhr.onreadystatechange = function (e) {
        if (xhr.readyState == 4) {
            handleFinishRequest();

            function handleFinishRequest() {
                var objRet = { status: "unknown error", hasPermission: false };
                var bReturned = false;
                var status = xhr.status;

                if (status == 200) {
                    try {
                        objRet.hasPermission = true;
                        objRet.search = JSON.parse(xhr.responseText);
                        objRet.status = STATUS_OK;
                        callback(objRet);
                        bReturned = true;
                    } catch (ex) {
                        logException(ex);
                        objRet.status = "error: " + ex.message;
                    }
                } else {
                    if (status == 400) {
                        try {
                            injectTrelloFrame();
                        } catch (e) {
                            logException(e);
                            console.log("Error: could not insert trello iframe to fix expired auth.");
                        }
                        objRet.status = "Error: Trello authentication error. Will retry in a few seconds.";
                        g_cErrorSync++;
						//hack alert: this prevents the counter from reaching 1 later, thus skipping the retry code in g_loaderDetector.init
                        if (g_cErrorSync==1)
                            g_cErrorSync = 2;
                        if (false) { //review zig remove once iframe fix is stable
                            if (!g_bDisplayedDSCWarning || bUserInitiated) {
                                g_bDisplayedDSCWarning = true;
                                handleShowDesktopNotification({
                                    notification: objRet.status,
                                    timeout: 15000
                                });
                            }
                        }
                    }
                    else if (bHandledDeletedOrNoAccess(status, objRet)) { //no permission. should not happen in search case
                        null; //happy lint
                    }
                    else if (status == 429) { //too many request, reached quota.
                        var waitNew = (waitRetry || 500) * 2;
                        if (waitNew < 8000) {
                            bReturned = true;
                            setTimeout(function () {
                                console.log("Plus: retrying api call"); //review zig put this in the generic version
                                doSearchTrelloChanges(bUserInitiated, tokenTrello, idBoardsSearch, cDaysDelta, cCardsLimit, callback, waitNew);
                            }, waitNew);
                        }
                        else {
                            objRet.status = errFromXhr(xhr);
                        }
                    }
                    else {
                        objRet.status = errFromXhr(xhr);
                    }
                }

                if (!bReturned) {
                    callback(objRet);
                }
            }
        }
    };

    xhr.open("GET", url);
    xhr.send();
}

function getAllTeams(callback, waitRetry) {
    //https://trello.com/docs/api/board/index.html

    var url = "https://trello.com/1/members/me/organizations?fields=idBoards";
    var xhr = new XMLHttpRequest();
    xhr.withCredentials = true; //not needed but might be chrome bug? placing it for future
    xhr.onreadystatechange = function (e) {
        if (xhr.readyState == 4) {
            handleFinishRequest();

            function handleFinishRequest() {
                var objRet = { status: "unknown error", hasPermission: false };
                var bReturned = false;

                if (xhr.status == 200) {
                    try {
                        objRet.hasPermission = true;
                        objRet.teams = JSON.parse(xhr.responseText);
                        objRet.status = STATUS_OK;
                        callback(objRet);
                        bReturned = true;
                    } catch (ex) {
                        logException(ex);
                        objRet.status = "error: " + ex.message;
                    }
                } else {
                    //boards cant be deleted, but leave it here for future possibility. REVIEW zig: board delete case isnt handled in sync
                    if (bHandledDeletedOrNoAccess(xhr.status, objRet)) { //no permission to the board, or board deleted already
                        null; //happy lint
                    }
                    else if (xhr.status == 429) { //too many request, reached quota.
                        var waitNew = (waitRetry || 500) * 2;
                        if (waitNew < 8000) {
                            bReturned = true;
                            setTimeout(function () {
                                console.log("Plus: retrying api call"); //review zig put this in the generic version
                                getAllTeams(callback, waitNew);
                            }, waitNew);
                        }
                        else {
                            objRet.status = errFromXhr(xhr);
                        }
                    }
                    else {
                        objRet.status = errFromXhr(xhr);
                    }
                }

                if (!bReturned) {
                    callback(objRet);
                }
            }
        }
    };

    xhr.open("GET", url);
    xhr.send();
}

function buildBoardsWithoutMe(callback) {
    if ((localStorage["plus_bFirstTrelloSyncCompleted"] || "") != "true") {
        callback({ status: "Before using this feature, 'First sync' needs to complete.\n\n'First sync' will complete automatically once you close the Plus help pane." });
        return;
    }

    var request = { sql: "SELECT idLong from BOARDS", values: [] };
    handleGetReport(request,
        function (responseReport) {
            if (responseReport.status != STATUS_OK) {
                callback({ status: responseReport.status });
                return;
            }
            var mapBoards = {};
            responseReport.rows.forEach(function (row) {
                mapBoards[row.idLong] = true;
            });

            getAllTeams(function (response) {
                if (response.status != STATUS_OK) {
                    callback({ status: response.status });
                    return;
                }
                var boardsNotFound = [];
                response.teams.forEach(function (team) {
                    team.idBoards.forEach(function (idBoard) {
                        if (!mapBoards[idBoard])
                            boardsNotFound.push({ idBoardLong: idBoard });
                    });
                });
                processBoardNames(boardsNotFound, function (status) {
                    boardsNotFound.sort(function (a, b) {
                        return ((b.dateLastActivity || "").localeCompare(a.dateLastActivity || ""));
                    });
                    callback({ status: status, boards: boardsNotFound });
                });
            });
        });
}

function processBoardNames(boards,callback) {
    processThreadedItemsSync(null, boards, null, onProcessItem, onFinishedAll);

    function onProcessItem(tokenTrello, board, iitem, postProcessItem) {

        assert(board.idBoardLong);
        getBoardData(null, false, board.idBoardLong, "fields=name,closed,dateLastActivity,", callbackBoard);

        function callPost(status) {
            postProcessItem(status, board, iitem);
        }

        function callbackBoard(boardData) {
            board.name = "Error loading";
            if (!boardData.hasPermission) {
                board.name = "No permission";
                callPost(STATUS_OK);
                return;
            }

            if (boardData.status != STATUS_OK) {
                callPost(boardData.status);
                return;
            }
            board.name = boardData.board.name;
            board.closed = boardData.board.closed;
            board.dateLastActivity = boardData.board.dateLastActivity; //review zig: bad naming its string
            callPost(STATUS_OK);
        }
    }

    function onFinishedAll(status) {
        callback(status);
    }
}

