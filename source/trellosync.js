
var g_bLogTrelloSyncStatusToConsole = true;  //review zig: turn off in v3

function logTrelloSync(message) {
    if (g_bLogTrelloSyncStatusToConsole)
        console.log(message);
}

var TOTAL_SYNC_STAGES = 8;

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
    msLast: 0,
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

        var msNow = new Date().getTime();
        if (this.bSyncing && !bSyncingOld) {
            this.msStart = msNow;
            this.msLast = msNow;
            this.cTotalStages = TOTAL_SYNC_STAGES;
            this.bExtraRenameStep = false;
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
            }
        }
     
    
        var segDelta = " delta prev:" + Math.round((msNow - (bFinished ? this.msStart : this.msLast)) / 10) / 100 + "s";
        this.msLast = msNow;
        updatePlusIcon(bSyncingOld == this.bSyncing);
        if (!bFinished)
            logTrelloSync("sync: " + this.stage + " total:" + this.cSteps + segDelta);
        else if (g_bEnableTrelloSync)
            logTrelloSync("sync: finished." + segDelta);
    }
};

function processThreadedItemsSync(tokenTrello, items, onPreProcessItem, onProcessItem, onFinishedAll) {

    function onFinishedEach(status) {
        if (status == STATUS_OK) {
            g_syncStatus.cProcessed++;
            updatePlusIcon(true);
        }
    }

    processThreadedItems(tokenTrello, items, onPreProcessItem, onProcessItem, onFinishedAll, onFinishedEach);
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

function makeLastStatusSync(statusRead, statusWrite, date) {
    if (!date)
        date=(new Date()).getTime();
    return { statusRead: statusRead, statusWrite: statusWrite, date: date };
}

/* handleSyncBoards
 *
 * Entry point to trello sync
 **/
function handleSyncBoards(request, sendResponseParam) {
    loadBackgroundOptions(function () {
        function sendResponse(response) {
            g_syncStatus.strLastStatus = response.status;
            if (g_optEnterSEByComment.IsEnabled()) {
                var pairDateLast = {};
                var pairLastStatus = {};
                var dateNow = (new Date()).getTime();
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

        if (!isDbOpened() || g_syncStatus.bSyncing || g_cReadSyncLock != 0 || g_cFullSyncLock != 0 || g_cWriteSyncLock != 0) {
            sendResponseParam({ status: "busy" });
            return;
        }

        //if there are pending rows, we must commit them before because they reference board/card names/ids that could change during sync
        //and sync only maintains the history table, not the queuehistory
        insertPendingSERows(function (responseInsertSE) {
            if (responseInsertSE.status != STATUS_OK) {
                sendResponseParam({ status: responseInsertSE.status });
                return;
            }
            handleSyncBoardsWorker(request.tokenTrello, sendResponse);
        });
    });
}

function handleSyncBoardsWorker(tokenTrello, sendResponseParam) {
    var strKeyTokenTrelloLast = "tokenTrelloLast";
    var tokenTrelloStored = localStorage[strKeyTokenTrelloLast];

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
        localStorage[strKeyTokenTrelloLast] = tokenTrello;

    var boardsTrello = []; //boards the user has access. This list is later intersected with the db boards list.
    var boardsReport = [];

 
    g_lastLogError = ""; //reset
    updatePlusIcon(false);

    //first stage
    g_syncStatus.setStage("", 0); //reset in case somehow a previous one was pending
    g_syncStatus.setStage("Detecting boards to update", 1, true, true); //note that this will cause g_syncStatus.bSyncing=true
    startSyncProcess();

    function startSyncProcess() {
        var request = { sql: "select idBoard,idLong, name, dateSzLastTrello, idActionLast, bArchived FROM BOARDS where idBoard<>?", values: [IDBOARD_UNKNOWN] };
        handleGetReport(request,
            function (responseReport) {
                if (responseReport.status != STATUS_OK) {
                    sendResponse(responseReport);
                    return;
                }
                boardsReport = cloneObject(responseReport.rows || []); //clone so rows can be modified.
                worker();
            });

        function worker() {
            assert(boardsReport);
            getBoardsLastInfo(tokenTrello, callbackBoardsLastInfo);
        }
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
            setTimeout(function () {
                if (g_syncStatus.bSyncing)
                    animateFlip();
            }, 3000);
            broadcastMessage({ event: EVENTS.FIRST_SYNC_RUNNING, status: STATUS_OK });
            handleShowDesktopNotification({
                notification: "Trello sync is running for the first time and may take a few minutes to finish.\n\nSee progress by hovering over the Plus icon on the top-right of Chrome.",
                timeout: 40000
            });
        }
        getAllTrelloBoardActions(tokenTrello, boardsReport, boardsTrello, process);
        }
    
    function sendResponse(response) {
        if (response.status == STATUS_OK) {
		//review zig: this should be assert. got it once and couldnt find cause (related to breakpoints set but didnt want to block entire sync process for this)
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
                    processAllCardsNameCleanup(tokenTrello, g_syncStatus.bOnlyRenameCardsWithHistory, sendResponse);
                }
                else
                    sendResponse(response);
            }

            processTrelloActions(tokenTrello, responseGetActions.actions, responseGetActions.boards, responseGetActions.hasBoardAccess, processAllCardsRename);
        }
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
                    g_syncStatus.setStage("Removing S/E from card names", 1, true); //pretent step happened anyway (as status could be OK so caller expects all steps to finish)
                sendResponse(responseReport);
                return;
            }
            g_syncStatus.setStage("Removing S/E from card names", responseReport.rows.length);
            var rgRenamedCards = [];
            processThreadedItemsSync(tokenTrello, responseReport.rows, null, onProcessItem, onFinishedAll);

            function onProcessItem(tokenTrello, card, iitem, postProcessItem) {

                function callPost(status) {
                    postProcessItem(status, card, iitem);
                }

                function callbackCard(cardData) {
                    if (!cardData.hasPermission) {
                        callPost(STATUS_OK);
                        return;
                    }

                    if (cardData.status != STATUS_OK) {
                        callPost(cardData.status);
                        return;
                    }

                    var nameNew = parseSE(cardData.card.name, true, g_bAcceptSFT).titleNoSE;
                    if (cardData.card.name != nameNew) {
                        var shortLinkSaved = cardData.card.shortLink;
                        var nameOld = cardData.card.name;
                        renameCard(tokenTrello, shortLinkSaved, nameNew, function (cardData) {
                            rgRenamedCards.push({ status: cardData.status, shortLink: shortLinkSaved, nameOld: nameOld, nameNew: nameNew });
                            if (!cardData.hasPermission)
                                cardData.status = STATUS_OK;
                            
                            callPost(cardData.status);
                        });
                    }
                    else
                        callPost(STATUS_OK);
                }
                assert(card.idCard);
                getCardData(tokenTrello, card.idCard, "shortLink,name", false, callbackCard);
            }

            function onFinishedAll(status) {
                saveAsFile({ totalCards: rgRenamedCards.length, cards: rgRenamedCards }, "plus for trello renamed cards json.txt", true);
                handleShowDesktopNotification({
                    notification: "Finished renaming "+rgRenamedCards.length+" cards.\nAll renamed cards are in the downloaded file.",
                    timeout: 20000
                });
                sendResponse({ status: status });
            }
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
    processThreadedItemsSync(tokenTrello, cardsToFix, null, onProcessItem, onFinishedAll);

    function onProcessItem(tokenTrello, card, iitem, postProcessItem) {
        
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
                if (cardData.bDeleted) {
                    card.bDeleted = true;
                    card.bArchived = true;
                }
            }
            callPost(cardData.status);
        }
        assert(card.idLong || card.idCard);
        getCardData(tokenTrello, card.idLong || card.idCard, "id,idList", false, callbackCard);
    }

    function onFinishedAll(status) {
        sendResponse({ status: status });
    }
}

function completeMissingListData(tokenTrello, alldata, sendResponse) {
    var listsToFix = [];
    var mapHandled = {}; //only necessary for ability to make debug tests, since could just use alldata.lists

    for (var shortLinkCard in alldata.cards) {
        var idList=alldata.cards[shortLinkCard].idList;
        if (idList == IDLIST_UNKNOWN)
            continue;
        //name, idBoard, dateSzLastTrello, bArchived
        if (!mapHandled[idList] && !alldata.lists[idList]) {
            listsToFix.push({ idList: idList });
            mapHandled[idList] = true;
            alldata.lists[idList] = { name: STR_UNKNOWN_LIST, idBoard: IDBOARD_UNKNOWN, dateSzLastTrello: null, bArchived: false }; //set a default
        }
    }

    g_syncStatus.setStage("Completing list details", listsToFix.length);
    processThreadedItemsSync(tokenTrello, listsToFix, null, onProcessItem, onFinishedAll);

    function onProcessItem(tokenTrello, item, iitem, postProcessItem) {
        var idListCur = item.idList;
        assert(idListCur);
        var listDb = alldata.lists[idListCur];
        assert(listDb.idBoard == IDBOARD_UNKNOWN);

        //could be in db. if not, get it with the trello api
        getThisListFromDb(alldata, idListCur, function () {
            listdb = alldata.lists[idListCur];
            if (listdb.idBoard == IDBOARD_UNKNOWN)
                getListData(tokenTrello, idListCur, "name,idBoard,closed", callbackList);
            else
                callPost(STATUS_OK);
        }, function onError(status) {
            callPost(status);
        });

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
                listDb.idBoard = alldata.boardsByLong[listData.list.idBoard] || IDBOARD_UNKNOWN;
                listDb.bArchived = listData.list.closed || false;
            }

            callPost(listData.status);
        }
    }

    function onFinishedAll(status) {
        sendResponse({ status: status });
    }
}

function preProcessActionsCaches(tokenTrello, actions, alldata, nextAction) {
    for (var i = 0; i < actions.length; i++) {
        var action = actions[i];
        var card = action.data.card;
        if (card && card.shortLink)
            alldata.cardsByLong[card.id] = card.shortLink; //populate cache. needed later for cards missing shortLink
        

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
            //NOTE: in some rare cases (presumably a trello bug) board.shortLink != action.idBoardSrc
            //Ive seen it happen on a customer, where an updateList action had board.shortLink be the trello welcome board, but idBoardSrc was the copy that trello makes.
            //WARNING: this means that code elsewhere cant trust board.shortLink unless it came from the db :(
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
        if (card) {
            populateDataCardFromDb(cardsNotFound, alldata, card, nextAction);
        }
        else {
            if ((iAction % 20) == 10) { //reduce long callstacks
                setTimeout(function () {
                    nextAction(STATUS_OK);
                }, 0);
            }
            else
                nextAction(STATUS_OK);
        }
    }
}

function populateDataCardFromDb(cardsNotFound, alldata, card, sendStatus) {
    assert(card);
    var idShortCard = card.shortLink;
    var idLongCard = card.id;
    var cardDb = null;
    
    assert(idLongCard);
    if (cardsNotFound[idLongCard]) {
        sendStatus(STATUS_OK);
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
        sendStatus(STATUS_OK);
        return;
    }

    var request = { sql: "select idBoard, name, dateSzLastTrello, idList, idLong, idCard, bArchived, bDeleted FROM CARDS where (idCard=? OR idLong=?)", values: [idShortCard, idLongCard] };
    handleGetReport(request,
        function (responseReport) {
            if (responseReport.status != STATUS_OK) {
                sendStatus(responseReport.status);
                return;
            }
            if (responseReport.rows.length > 0) {
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
    var request = { sql: "select idBoard, name, dateSzLastTrello, idList, bArchived FROM LISTS where idList=?", values: [idList] };
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
    g_syncStatus.setStage("Committing all", 1, true);
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

    g_db.transaction(processBulkChanges, errorTransaction, okTransaction);

    function processBulkChanges(tx) {
        bMadeChanges = commitBoardSyncData(tx, alldata) || bMadeChanges;
        bMadeChanges = commitListSyncData(tx, alldata) || bMadeChanges;
        bMadeChanges = commitCardSyncData(tx, alldata) || bMadeChanges;
        commitSESyncData(tx, alldata); //ignore return value, history row changes are broadcasted with NEW_ROWS later.
    }
}

function processTrelloActions(tokenTrello, actions, boards, hasBoardAccess, sendResponseParam) {
    var bProcessCommentSE = g_optEnterSEByComment.IsEnabled();
    var rgKeywords = [];
    if (bProcessCommentSE)
        rgKeywords = cloneObject(g_optEnterSEByComment.rgKeywords); //prevent issues if object changes during sync

    var alldata = {
        boards: {}, //hash by shortLink. (name, dateSzLastTrello, idActionLast, bArchived)
        lists: {},  //hash by idLong. (name, idBoard, dateSzLastTrello, bArchived)
        cards: {},  //hash by shortLink. (name, idBoard, dateSzLastTrello, idList, bArchived, listCards[] (idList,dateSzIn,dateSzOut,userIn,userOut) )
        cardsByLong: {}, //hash idLong -> shortLink.
        boardsByLong: {}, //hash idLong -> shortLink.
        hasBoardAccess: hasBoardAccess, //hash by shortLink -> true iff user has access to that board
        commentsSE: [] //all possible S/E comments
    };

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
        logTrelloSync(cNullIdList + " 'NULL' idList");
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

            completeMissingListData(tokenTrello, alldata, postComplete);
        }

        //complete card list membership
        //first, add to alldata.cards any cards from the db that have unknown lists and arent already on alldata.cards
        getOtherDbCardsWithMissingListData();

        function getOtherDbCardsWithMissingListData() {
            //skip bArchived. we set it to 1 later for cards that couldnt be completed because of permissions, so dont query them here on the next sync
            //also skip those with dateSzLastTrello not null. that can happen on a non-deleted card that was on the db but now the user doenst have permission.
            //those are set to a non-null dateSzLastTrello so that we dont keep permanently trying to complete them here.
            //this list is unfortunately big on the very first sync, most items are skipped
            var request = { sql: "select idBoard, name, dateSzLastTrello, idList, idLong, idCard, bArchived, bDeleted FROM CARDS where idList='" + IDLIST_UNKNOWN + "' AND bArchived=0 AND dateSzLastTrello IS NULL", values: [] };
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

    var iAction = -1;
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
        g_syncStatus.cProcessed = iAction;
        if ((iAction % 200) == 0)
            updatePlusIcon(true);
            
        if (iAction == 0) {
            g_syncStatus.setStage("Processing history", actions.length);
        }
        if (iAction == actions.length) {
            var rgResult = [];
            for (var iFilterAction = 0; iFilterAction < actions.length; iFilterAction++) {
                if (!actions[iFilterAction].ignore)
                    rgResult.push(actions[iFilterAction]);
            }


            sendResponse({ status: STATUS_OK });
            return;
        }

        var actionCur = actions[iAction];
        if ((iAction % 20)==10) { //reduce long callstacks
            setTimeout(function () {  
                processCurrent(actionCur);
            }, 0);
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
            if (status != STATUS_OK)
                sendResponse({ status: status });
            else if (queue.length==0)
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
                    sendResponse({ status: ex.message });
                }
            }
        }

        function addShortLinkToCard() {
            if (actionCur.data.card.shortLink) {
                stepDone(STATUS_OK);
                return;
            }
            var shortLinkCard = alldata.cardsByLong[actionCur.data.card.id];
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
            var iQueue = 0;
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
            var request = { sql: "select idBoard, name, dateSzLastTrello, idList, idLong, idCard, bArchived, bDeleted FROM CARDS where idList=?", values: [idList] };
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
                        if (cardCur.idList == idList && (cardCur.dateSzLastTrello == null || actionCur.date >= cardCur.dateSzLastTrello))
                            cardCur.idBoard = listCur.idBoard;
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

                var listCur = alldata.lists[list.id];
                if (listCur) {
                    if (!listCur.dateSzLastTrello || actionCur.date >= listCur.dateSzLastTrello) {
                        if (list.name) //test just in case. on cards, sometimes its not there.
                            listCur.name = list.name;
                        listCur.dateSzLastTrello = actionCur.date;
                        listCur.idBoard = idBoard;

                        if (list.closed !== undefined)
                            listCur.bArchived = list.closed;
                    }
                    else
                        actionCur.old = true;

                }
                else {
                    listCur = { name: list.name, dateSzLastTrello: actionCur.date, idBoard: idBoard, bCreated: true, bArchived: list.closed || false };
                    alldata.lists[list.id] = listCur;
                }
                assert(listCur.bArchived !== undefined);
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
                if (comment.indexOf(keyword) >= 0) {
                    alldata.commentsSE.push(actionCur); //candidate for being a S/E comment. Later we will perform stricter checks
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

            var idList = null;
            if (actionCur.data.list)
                idList = actionCur.data.list.id;

            if (cardAction.idList) //not "else" with above, in case "convertToCardFromCheckItem" contains idList (trello fixed this for actions going forward aprox july 2014)
                idList = cardAction.idList;
            else if (actionCur.data.listAfter)
                idList = actionCur.data.listAfter.id;

            
            var cardCur = alldata.cards[cardAction.shortLink];
            if (cardCur) {
                if (!cardCur.dateSzLastTrello || actionCur.date >= cardCur.dateSzLastTrello) {
                    if (cardAction.name) //not present on deleteCard
                        cardCur.name = cardAction.name;
                    cardCur.dateSzLastTrello = actionCur.date;
                    if (idList != null && idList != cardCur.idList)
                        cardCur.idList = idList; //review zig handle list membership change here. handle IDLIST_UNKNOWN too

                    cardCur.idBoard = idBoard;
                        
                    if (cardAction.closed !== undefined)
                        cardCur.bArchived = cardAction.closed;
                }
                else
                    actionCur.old = true;

            }
            else {
                //note cardAction.closed should be undefined, but just in case read it too (eg. if trello ever truncates history)
                if (idList == null)
                    idList = IDLIST_UNKNOWN;
                cardCur = { name: cardAction.name, dateSzLastTrello: actionCur.date, idList: idList, idBoard: idBoard, bCreated: true, bArchived: cardAction.closed || false };
                alldata.cards[cardAction.shortLink] = cardCur;
            }

            cardCur.idLong = cardAction.id;
            if (cardAction.bDeleted || typeAction=="deleteCard") {
                cardCur.bDeleted = true; //prevent further api calls. review zig check callers
                cardCur.bArchived = true;
            }
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
        }
        if (typeAction == "commentCard" && bProcessCommentSE)
            queue.push(processCommentSEAction);

        stepDone(STATUS_OK); //start chain of functions
    } //processCurrent
}

function getBoardData(tokenTrello, idBoard, fields, callback, waitRetry) {
    //https://trello.com/docs/api/board/index.html

    var url = "https://trello.com/1/boards/" + idBoard + "?fields=" + fields;
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
                        bReturned = true;
                        callback(objRet);
                    } catch (ex) {
                        objRet.status = "error: " + ex.message;
                    }
                } else {
                    //boards cant be deleted, but leave it here for future possibility. REVIEW zig: board delete case isnt handled in sync
                    var bDeleted = (xhr.status == 404 || xhr.status == 400); //400 shouldnt really happen. old plus data from spreadsheets has this in cw360 because it was added manually to ss
                    if (xhr.status == 401 || bDeleted) { //no permission to the board, or board deleted already
                        objRet.hasPermission = false;
                        objRet.status = STATUS_OK;
                        if (bDeleted)
                            objRet.bDeleted = true;
                    }
                    else if (xhr.status == 429) { //too many request, reached quota.
                        var waitNew = (waitRetry || 500) * 2;
                        if (waitNew < 8000) {
                            bReturned = true;
                            setTimeout(function () {
                                console.log("Plus: retrying api call"); //review zig put this in the generic version
                                getBoardData(tokenTrello, idBoard, fields, callback, waitNew);
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

                if (!bReturned)
                    callback(objRet);
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
                        bReturned = true;
                        callback(objRet);
                    } catch (ex) {
                        objRet.status = "error: " + ex.message;
                    }
                } else {
                    if (xhr.status == 401) { //no permission to the list 
                        objRet.hasPermission = false;
                        objRet.status = STATUS_OK;
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

                if (!bReturned)
                    callback(objRet);
            }
        }
    };

    xhr.open("GET", url);
    xhr.send();
}

function getCardData(tokenTrello, idCardLong, fields, bBoardShortLink, callback, waitRetry) {
    //https://trello.com/docs/api/card/index.html
   
    var url = "https://trello.com/1/cards/" + idCardLong + "?fields=" + fields;
    if (bBoardShortLink)
        url = url + "&board=true&board_fields=shortLink";
    var xhr = new XMLHttpRequest();
    xhr.withCredentials = true; //not needed but might be chrome bug? placing it for future
    xhr.onreadystatechange = function (e) {
        if (xhr.readyState == 4) {
            handleFinishRequest();

            function handleFinishRequest() {
                var objRet = { status: "unknown error", hasPermission: false};
                var bReturned = false;

                if (xhr.status == 200) {
                    try {
                        objRet.hasPermission = true;
                        objRet.card=JSON.parse(xhr.responseText);
                        objRet.status = STATUS_OK;
                        bReturned = true;
                        callback(objRet);
                    } catch (ex) {
                        objRet.status = "error: " + ex.message;
                    }
                } else {
                    var bDeleted = (xhr.status == 404 || xhr.status == 400); //400 shouldnt really happen. old plus data from spreadsheets has this in cw360 because it was added manually to ss
                    if (xhr.status == 401 || bDeleted) { //no permission to the board, or card deleted already
                        objRet.hasPermission = false;
                        objRet.status = STATUS_OK;
                        if (bDeleted)
                            objRet.bDeleted = true;
                    }
                    else if (xhr.status == 429) { //too many request, reached quota. 
                        var waitNew = (waitRetry || 500) * 2;
                        if (waitNew < 8000) {
                            bReturned = true;
                            setTimeout(function () {
                                console.log("Plus: retrying api call");
                                getCardData(tokenTrello, idCardLong, fields, bBoardShortLink, callback, waitNew);
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

                if (!bReturned)
                    callback(objRet);
            }
        }
    };

    xhr.open("GET", url);
    xhr.send();
}
var BOARD_ACTIONS_LIST = "deleteCard,commentCard,createList,convertToCardFromCheckItem,createCard,copyCard,emailCard,moveCardToBoard,moveCardFromBoard,,updateBoard,moveListFromBoard,moveListToBoard,updateCard:idList,updateCard:closed,updateCard:name,updateList:closed,updateList:name";

function getBoardActions(tokenTrello, iBoard, idBoard, limit, strDateBefore, strDateAfter, actionsSkip, callback, waitRetry) {
    //https://trello.com/docs/api/board/index.html#get-1-boards-board-id-actions
    //the API gets actions from newest to oldest always
    //closed==archived
    //"copyBoard" sucede cuando se copia un board, no empezara con "createBoard". no es necesario usar ninguno
    var bFilter = true; //debe ser true. false used for testing
    var url = "https://trello.com/1/boards/" + idBoard + "/actions?action_member=true&action_memberCreator=true&action_member_fields=username&action_memberCreator_fields=username&limit=" + limit;
    //var url = "https://trello.com/1/organizations/cloudware360devs?boards=all&board_actions=all&board_actions_limit=1";
    if (bFilter) {
        url = url + "&filter=" + BOARD_ACTIONS_LIST;
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
                        for (var iAddBoardSrc = 0; iAddBoardSrc < obj.length; iAddBoardSrc++) {
                            var itemCur=obj[iAddBoardSrc];
                            if (actionsSkip.length > 0) {
                                var iSkip = 0;
                                for (iSkip=0; iSkip < actionsSkip.length; iSkip++) {
                                    if (actionsSkip[iSkip] == itemCur.id)
                                        break;
                                }
                                if (iSkip < actionsSkip.length)
                                    continue; //found above
                            }
                            obj[iAddBoardSrc].idBoardSrc = idBoard; //for debugging, but might have a role later
                            listRet.push(obj[iAddBoardSrc]);
                        }
                        objRet.items = listRet;
                        bReturned = true;
                        callback(objRet, lengthOriginal);
                    } catch (ex) {
                        objRet.status = "error: " + ex.message;
                    }
                } else {
                    if (xhr.status == 401) { //no permission to the board
                        objRet.hasPermission = false;
                        objRet.status = STATUS_OK;
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

                if (!bReturned)
                    callback(objRet);
            }
        }
    };

    xhr.open("GET", url);
    xhr.send();
}


function getAllTrelloBoardActions(tokenTrello, boardsReport, boardsTrello, sendResponse) {
    assert(boardsReport);

    if (false) { //debugging
        sendResponse({ status: STATUS_OK });
        return;
    }
    var limit = 900; //the larger the better to avoid many round-trips and consuming more quota. trello allows up to 1000 but I feel safer with a little less.
    var statusProcess = { boards: [], iBoard: -1, hasBoardAccess: {}};
    var results = [];
    var bReturned = false;
    var cNeedProcess = 0;
    var cReadyToWait = false;

    worker();

    function worker() {
        var boardsProcess = [];
        var mapBoards = {};
        boardsReport.forEach(function (board) {
            board.orig = cloneObject(board); //keep original values for comparison
            mapBoards[board.idBoard]=board;
        });

        boardsTrello.forEach(function (board) {
            if (!board.actions || board.actions.length == 0)
                return;
            statusProcess.hasBoardAccess[board.shortLink] = true;
            var boardDb = mapBoards[board.shortLink];
            if (!boardDb) {
                boardDb = {
                    idBoard : board.shortLink,
                    name : board.name,
                    idLong: board.id,
                    bPendingCreation : true,
					dateSzLastTrello : null,
					idActionLast: null,
					bArchived:0
                };
            }
            assert(boardDb.idBoard == board.shortLink);
            var actionLast = board.actions[0];
            if (boardDb.dateSzLastTrello && actionLast.date < boardDb.dateSzLastTrello) {
                //when cards are deleted or moved, their history will be moved out of the board so the last action date could be smaller.
                return;
            }
		            
            if (actionLast.id != boardDb.idActionLast) {
                var dateLastAction = new Date(actionLast.date);
                dateLastAction.setTime(dateLastAction.getTime() + 1);
                assert(board.name);
                boardDb.name = board.name;
                boardDb.bArchived = board.closed || false;
                boardDb.idLong = board.id;
                boardDb.dateSzBefore = dateLastAction.toISOString();
                boardsProcess.push(boardDb);
            }
        });

        statusProcess.boards = boardsProcess;
        startAllBoardActionsCalls();
    }

    function startAllBoardActionsCalls() {
        var cGotActions = 0;
        g_syncStatus.setStage("Getting board history", statusProcess.boards.length);
        processThreadedItemsSync(tokenTrello, statusProcess.boards, onPreProcessItem, onProcessItem, onFinishedAll);


        function onFinishedAll(status) {
            results.sort(function (a, b) { return a.date.localeCompare(b.date); });
            if (results.length) {
                saveAsFile(results, "resultsSorted-"+results.length+".json");
                saveAsFile(statusProcess, "statusProcess.json");
            }
            sendResponse({ status: status, actions: results, boards: statusProcess.boards, hasBoardAccess: statusProcess.hasBoardAccess });
        }

        function onPreProcessItem(board) {
            if (board.hasPermission === false)
                return false;

            if (!board.dateSzLastTrelloNew) { //review zig: 2nd pass case. revise if still needed
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
                postProcessItem(status, board, iitem);
            }

            getBoardActions(tokenTrello, iitem, board.idBoard, limit, board.dateSzBefore, board.dateSzLastTrelloNew, [board.idActionLastNew], callbackGetBoardActions);

            function callbackGetBoardActions(response, lengthOriginal) {
                var boardCur = board;
                if (response.status != STATUS_OK) {
                    callPost(response.status);
                    return;
                }

                cGotActions++;
                if (cGotActions%2 == 0)
                    g_syncStatus.postfixStage = "..."; //keeps "alive" the status progress, even if the last board is stuck on a lot of history.
                else
                    g_syncStatus.postfixStage = "";
                updatePlusIcon(true);
                if (response.hasPermission !== undefined)
                    boardCur.hasPermission = response.hasPermission;

                if (response.items.length > 0) {
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
}


function getBoardsLastInfo(tokenTrello, callback) {
    chrome.storage.local.get([PROP_TRELLOUSER], function (obj) {
        var userTrello = (obj[PROP_TRELLOUSER] || null);
        if (userTrello == null) {
            callback({ status: "error: no trello user. Go to trello.com with an active user." });
            return;
        }
        getBoardsLastInfoWorker(tokenTrello, callback, userTrello);
    });
}


function getBoardsLastInfoWorker(tokenTrello, callback, userTrello, waitRetry) {
    //https://trello.com/docs/api/member/index.html
    var url = "https://trello.com/1/members/" + userTrello + "/boards?fields=name,closed,shortLink&actions=" + BOARD_ACTIONS_LIST + "&actions_limit=1&action_fields=date";
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
                        bReturned = true;
                        callback(objRet);
                    } catch (ex) {
                        objRet.status = "error: " + ex.message;
                    }
                } else {
                    if (xhr.status == 429) { //too many request, reached quota. REVIEW zig: consolidate all retry logic in a function, use callbacks to implement each one
                        var waitNew = (waitRetry || 500) * 2;
                        if (waitNew < 8000) {
                            bReturned = true;
                            setTimeout(function () {
                                console.log("Plus: retrying api call");
                                getBoardsLastInfoWorker(tokenTrello, callback, userTrello, waitNew);
                            }, waitNew);
                        }
                        else {
                            objRet.status = errFromXhr(xhr);
                        }
                    }
                    else if (xhr.status == 404) {
                        objRet.status = "user not found. If you renamed your trello user, please to to trello.com\n"+errFromXhr(xhr);
                    }
                    else {
                        objRet.status = errFromXhr(xhr);
                    }
                }

                if (!bReturned)
                    callback(objRet);
            }
        }
    };

    xhr.open("GET", url);
    xhr.send();
}

function earliest_trello_date() {
    return new Date(1).toISOString();
}

//code based on spent backend
function matchCommentParts(text,date, bRecurringCard) {
    //note that comment gets cropped to 200 characters
    //? is used to force non-greedy
    var i_users = 1;
    var i_days = 4;
    var i_spent = 5;
    var i_sep = 6;
    var i_est = 7;
    var i_spacesPreComment = 8;
    var i_note = 9;
    var preComment = "";

    //note: this regex is highly sensitive to changes. consider newlines in comments.
    //                          1-users                4-days         5-spent          6- / separator    7-estimate          8-spaces   9-note
    var patt = new RegExp("^((\\s*@\\w+\\s+)*)((-[0-9]+)[dD]\\s+)?([+-]?[0-9]*[.:]?[0-9]*)?\\s*(/?)\\s*([+-]?[0-9]*[.:]?[0-9]*)?(\\s*)(\\s[\\s\\S]*)?$");
    var rgResults = patt.exec(text);
    if (rgResults == null)
        return null;

    rgResults[i_est] = rgResults[i_est] || ""; //standarize
    rgResults[i_note] = (rgResults[i_note] || "").substring(0, 200); //reasonable crop
    rgResults[i_note].split("\n")[0]; //note is up to newline if any

    if (!rgResults[i_sep]) { //separator
        if (date && date < g_dateMinCommentSERelaxedFormat) {
            console.log("S/E legacy row with new format ignored "+date);
            return null;
        }
        if (rgResults[i_est]) {
            //when no separator, assume there is only spent. add any possible E matches to the comment (in case note started with a number)
            rgResults[i_note] = rgResults[i_est] + rgResults[i_spacesPreComment] + rgResults[i_note];
            rgResults[i_est] = "";
            rgResults[i_spacesPreComment] = "";
            preComment = "[warning: possibly missing /] ";
        }
        if (rgResults[i_est].length == 0 && bRecurringCard) { //special case for recurring cards
            rgResults[i_est] = rgResults[i_spent];
        }
    }

    rgResults[i_note] = rgResults[i_note].trim();
    var ret = {};
    var users = rgResults[i_users].trim();
    var rgUsers = [];
    if (users.length > 0) {
        var listUsers = users.split("@");
        var i = 0;
        for (; i < listUsers.length; i++) {
            var item = listUsers[i].trim().toLowerCase();
            if (item.length != 0)
                rgUsers.push(item);
        }
    }
    ret.rgUsers = rgUsers;
    ret.days = rgResults[i_days] || "";
    ret.strSpent = rgResults[i_spent] || "";
    ret.strEstimate = rgResults[i_est] || "";
    ret.comment = preComment + replaceBrackets(rgResults[i_note] || "");
    return ret;
}