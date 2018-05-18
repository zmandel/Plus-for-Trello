/// <reference path="intellisense.js" />

function commitTeamSyncData(tx, alldata) {
    var idTeam = null;
    var sql = "";
    var bChanged = false;
    for (idTeam in alldata.teams) {
        var team = alldata.teams[idTeam];
        if (team.idTeam == IDTEAM_UNKNOWN)
            continue;

        var thisChanged = true;

        if (!team.name)
            team.name = STR_UNKNOWN_TEAM; //cover cases of Trello corruption

        if (team.orig) {
            if (team.orig.name == team.name && team.orig.nameShort == team.nameShort) {
                thisChanged = false;
                if (team.orig.dateSzLastTrello == team.dateSzLastTrello)
                    continue;
            }
        }

        if (thisChanged)
            bChanged = true;
        if (!team.orig) {
            //could use this for both cases, but maybe sqlite optimizes for update
            sql = "INSERT OR REPLACE INTO TEAMS (name, nameShort, dateSzLastTrello, idTeam) VALUES (?,?,?,?)";
        }
        else {
            sql = "UPDATE TEAMS SET name=?, nameShort=?, dateSzLastTrello=? WHERE idTeam=?";
        }
        tx.executeSql(sql, [team.name, team.nameShort, team.dateSzLastTrello, team.idTeam],
                null,
				function (tx2, error) {
				    logPlusError(error.message);
				    return true; //stop
				});
    }
    return bChanged;
}


function commitBoardSyncData(tx, alldata) {
    var idBoard = null;
    var sql = "";
    var bChanged = false;
    for (idBoard in alldata.boards) {
        var board = alldata.boards[idBoard];
        if (board.idBoard == IDBOARD_UNKNOWN)
            continue;

        var thisChanged = true;

        if (!board.name)
            board.name = STR_UNKNOWN_BOARD; //cover cases of Trello corruption

        assert(board.dateSzLastTrelloNew || !board.dateSzLastTrello);
        assert(board.idActionLastNew || !board.idActionLast);

        if (board.orig) {
            if (board.orig.idTeam == board.idTeam && board.orig.name == board.name && board.orig.bArchived == board.bArchived &&
                board.orig.idLong == board.idLong && board.orig.idBoard == board.idBoard && board.orig.verDeepSync == board.verDeepSync) {
                thisChanged = false;
                if (board.orig.dateLastActivity == board.dateLastActivity &&
                    board.orig.dateSzLastTrello == board.dateSzLastTrello &&
                    board.orig.idActionLast == board.idActionLast)
                    continue;
            }
        }

        if (thisChanged)
            bChanged = true;
        if (board.bPendingCreation) {
            assert(!board.orig);
            //could use this for both cases, but maybe sqlite optimizes for update
            //using "replace" as the board could have been alreadt created during sync (by user entering S/E into a card)
            sql = "INSERT OR REPLACE INTO BOARDS (name, dateSzLastTrello, idActionLast, bArchived, idLong, verDeepSync, idTeam, dateLastActivity, idBoard) VALUES (?,?,?,?,?,?,?,?,?)";
        }
        else {
            assert(board.orig);
            sql = "UPDATE BOARDS SET name=?, dateSzLastTrello=?, idActionLast=?,bArchived=?,idLong=?,verDeepSync=?, idTeam=?, dateLastActivity=? WHERE idBoard=?";
        }
        tx.executeSql(sql, [board.name, board.dateSzLastTrelloNew || null, board.idActionLastNew || null, board.bArchived ? 1 : 0, board.idLong, board.verDeepSync || 0, board.idTeam || null, board.dateLastActivity || earliest_trello_date(), board.idBoard],
                null,
				function (tx2, error) {
				    logPlusError(error.message);
				    return true; //stop
				});
    }
    return bChanged;
}

function commitBoardLabelsSyncData(tx, alldata) {
    var idLabel = null;
    var sql = "";
    var bChanged = false;

    if (alldata.dateLastLabelsSyncStrOrig && alldata.dateLastLabelsSyncStrNew && alldata.dateLastLabelsSyncStrOrig != alldata.dateLastLabelsSyncStrNew) {
        //bChanged = true; simple changes dont cause a changed
        sql = "UPDATE GLOBALS SET dateLastLabelsSync=?";
        tx.executeSql(sql, [alldata.dateLastLabelsSyncStrNew],
                null,
				function (tx2, error) {
				    logPlusError(error.message);
				    return true; //stop
				});
    }

    for (idLabel in alldata.labels) {
        var thisChanged = true;
        var label = alldata.labels[idLabel];
        if (!label.name)
            label.name = STR_UNKNOWN_LABEL;
        assert(label.idBoardShort);

        if (label.orig) {
            if (label.orig.idLabel == idLabel && label.orig.name == label.name && label.orig.idBoardShort == label.idBoardShort) {
                continue;
            }
        }

        if (thisChanged)
            bChanged = true;

        sql = "INSERT OR REPLACE INTO LABELS (idLabel, name, idBoardShort, color) VALUES (?,?,?,?)";
        tx.executeSql(sql, [idLabel, label.name, label.idBoardShort, label.color],
                null,
				function (tx2, error) {
				    logPlusError(error.message);
				    return true; //stop
				});
    }
    return bChanged;
}

function commitListSyncData(tx, alldata) {
    var idList = null;
    var sql = "";
    var bChanged = false;

    for (idList in alldata.lists) {
        var thisChanged = true;
        var list = alldata.lists[idList];
        if (!list.name)
            list.name = STR_UNKNOWN_LIST; //this can happen on corrupted trello lists (happened to one customer I remote-debugged)
        assert(idList != IDLIST_UNKNOWN);
        assert(list.idBoard); //can be unknown. eg. moved to a board outside of Plus
        assert(list.idBoard == IDBOARD_UNKNOWN || list.dateSzLastTrello);

        if (!list.dateSzLastTrello) {
            assert(list.bArchived); //was deleted
            list.dateSzLastTrello = earliest_trello_date();
        }

        if (list.orig) {
            if (list.orig.idList == idList && list.orig.name == list.name && list.orig.idBoard == list.idBoard &&
                list.orig.bArchived == list.bArchived && list.orig.pos == list.pos) {
                thisChanged = false;
                if (list.orig.dateSzLastTrello == list.dateSzLastTrello)
                    continue;
            }
        }

        if (thisChanged)
            bChanged = true;

        sql = "INSERT OR REPLACE INTO LISTS (idList, name, idBoard, dateSzLastTrello, bArchived, pos) VALUES (?,?,?, ?,?,?)";
        tx.executeSql(sql, [idList, list.name, list.idBoard, list.dateSzLastTrello, list.bArchived || list.bDeleted ? 1 : 0, list.pos || null],
                null,
				function (tx2, error) {
				    logPlusError(error.message);
				    return true; //stop
				});
    }
    return bChanged;
}


function commitCardSyncData(tx, alldata) {
    var idCard = null;
    var sql = "";
    var bChanged = false;

    for (idCard in alldata.cards) {
        var thisChanged = true;
        
        //review zig: verify if it can be unknown
        var card = alldata.cards[idCard];
        if (!card.dateSzLastTrello) {
            assert(card.bArchived); //was deleted
            card.dateSzLastTrello = earliest_trello_date(); //stops from trying to do a card sync since its deleted
        }

        assert(card.idBoard);
        assert(card.idList);

        if (!card.name)
            card.name = STR_UNKNOWN_CARD; //cover trello corruption

        var name = parseSE(card.name, true).titleNoSE;

        if (card.idLabels)
            card.idLabels.sort();

        if (card.orig) {
            if (card.orig.idLabels)
                card.orig.idLabels.sort();

            var strLabelsOrig = JSON.stringify(card.orig.idLabels || []);
            var strLabels = JSON.stringify(card.idLabels || []);

            if (strLabelsOrig == strLabels && card.orig.idCard == card.idCard && card.orig.name == name && card.orig.idBoard == card.idBoard &&
   				card.orig.idList == card.idList && card.orig.bArchived == card.bArchived && card.orig.bDeleted == card.bDeleted &&
                card.orig.dateDue == card.dateDue && card.orig.dateCreated == card.dateCreated && card.orig.idLong == card.idLong &&
                card.orig.idShort == card.idShort) { //idShort can change if orig null (old version) or if card is moved
                thisChanged = false;
                if (card.orig.dateSzLastTrello == card.dateSzLastTrello)
                    continue;
            }
        }
        if (thisChanged)
            bChanged = true;


        //review zig: for performance, this should update when orig exists, using INSERT OR IGNORE, then UPDATE (unless it must be there because there is an orig)
        sql = "INSERT OR REPLACE INTO CARDS (idCard, idBoard, name, dateSzLastTrello, idList, bArchived, bDeleted, idLong, dateDue, dateCreated, idShort) VALUES (?,?,?,?,?,?,?,?,?,?,?)";
        handleInsertCard(sql, idCard, card);

        //a function is needed here so idCard, card are retained for use in callbacks
        function handleInsertCard(sql, idCard, card) {
            tx.executeSql(sql, [idCard, card.idBoard, name, card.dateSzLastTrello, card.idList, (card.bArchived || card.bDeleted) ? 1 : 0, card.bDeleted ? 1 : 0, card.idLong, card.dateDue, card.dateCreated, card.idShort],
                    function onOkInsert(tx2, resultSet) {
                        if (g_bDummyLabel && !card.orig && !card.idLabels) {
                            //could be a newly created card. check if it has no dummy.
                            //in theory, if !card.orig means a new card, but is more robust to check here
                            tx2.executeSql("SELECT COUNT(*) as total FROM LABELCARD WHERE idCardShort=?", [idCard],
                                function onResult(tx3, results) {
                                    assert(results.rows.length == 1);
                                    var row = results.rows.item(0);
                                    if (row.total == 0) {
                                        tx3.executeSql("INSERT OR REPLACE INTO LABELCARD (idCardShort,idLabel) VALUES (?,?)", [idCard, IDLABEL_DUMMY],
                                            null,
                                            function (tx4, error) {
                                                logPlusError(error.message);
                                                return true; //stop
                                            });
                                    }
                                },
                                function (tx3, error) {
                                    logPlusError(error.message);
                                    return true; //stop
                                });
                        }
                    },
                    function (tx2, error) {
                        logPlusError(error.message);
                        return true; //stop
                    });
        }

        if (card.orig) {
            if (card.orig.idBoard != card.idBoard) {
                //card moved
                sql = "UPDATE HISTORY SET idBoard=? WHERE idCard=?";
                tx.executeSql(sql, [card.idBoard, idCard],
                    null,
                    function (tx2, error) {
                        logPlusError(error.message);
                        return true; //stop
                    });
            }

            if (card.orig.name != name) {
                //card renamed. handle [R] change
                handleRecurringChange(tx, card.idCard, card.orig.name, name);
            }
        }

        //handle labels
        if (card.idLabels) {
            var idLabelsAdd = [];
            var idLabelsRemove = [];

            if (card.orig && card.orig.idLabels) {
                for (var iCard = 0, iCardOrig = 0; ;) {
                    var bOrigInRange = (iCardOrig < card.orig.idLabels.length);
                    var bInRange = (iCard < card.idLabels.length);

                    var val = null;
                    if (bInRange)
                        val = card.idLabels[iCard];
                    var valOrig = null;

                    if (bOrigInRange)
                        valOrig= card.orig.idLabels[iCardOrig];
                    if (bOrigInRange && bInRange) {
                        if (val == valOrig) {
                            iCard++;
                            iCardOrig++;
                        }
                        else if (val < valOrig) {
                            idLabelsAdd.push(val);
                            iCard++;
                        }
                        else {
                            assert(val > valOrig);
                            idLabelsRemove.push(valOrig);
                            iCardOrig++;
                        }
                    }
                    else if (bOrigInRange) {
                        idLabelsRemove.push(valOrig);
                        iCardOrig++;
                    }
                    else if (bInRange) {
                        idLabelsAdd.push(val);
                        iCard++;
                    }
                    else {
                        break;
                    }
                }
            }
            else {
                idLabelsAdd = card.idLabels;
            }

            if (g_bDummyLabel) {
                if (card.idLabels.length > 0) {
                    idLabelsRemove.push(IDLABEL_DUMMY);
                }
                else {
                    idLabelsAdd.push(IDLABEL_DUMMY);
                }
            }

            idLabelsAdd.forEach(function (idLabel) {
                tx.executeSql("INSERT OR REPLACE INTO LABELCARD (idCardShort,idLabel) VALUES (?,?)", [idCard, idLabel],
                null,
				function (tx2, error) {
				    logPlusError(error.message);
				    return true; //stop
				});
            });

            idLabelsRemove.forEach(function (idLabel) {
                tx.executeSql("DELETE FROM LABELCARD WHERE idCardShort=? AND idLabel=?", [idCard, idLabel],
                null,
				function (tx2, error) {
				    logPlusError(error.message);
				    return true; //stop
				});
            });
        }
    }
    return bChanged;
}

function commitSESyncData(tx, alldata) {
    var bChanges = alldata.rgCommentsSE.length > 0;
    var sql = "SELECT idMemberCreator,username, dateSzLastTrello FROM USERS";
    tx.executeSql(sql, [], function (tx2, results) {
        var i = 0;
        var usersMap = {};
        var idMemberMapByName = {};
        for (; i < results.rows.length; i++) {
            var row =  cloneObject(results.rows.item(i));
            usersMap[row.idMemberCreator] = row;
            idMemberMapByName[row.username] = row.idMemberCreator;
        }
        commitSESyncDataWorker(tx, alldata, usersMap, idMemberMapByName);
    },
            function (tx2, error) {
                logPlusError(error.message);
                return true; //stop
            });

    return bChanges;
}

function preprocessUsersInAllData(rgCommentsSE, usersMap, idMemberMapByName) {
    //hash idMemberCreator -> last memberCreator data. Useful to have a quick list of users without having to query HISTORY
    //review zig: doesnt handle well deleted users, only renamed
    rgCommentsSE.forEach(function (action) {
        processUser(action.date, action.memberCreator, action.idMemberCreator); //idMemberCreator is always set
        if (action.member && action.member.id && action.member.id != action.idMemberCreator) {
            processUser(action.date, action.member, action.member.id); //can happen in copyCommentCard action
        }
    });


    function processUser(dateAction, member, idMember) {
        assert(idMember);
        var mc = member; //may be undefined
        var mcOld = usersMap[idMember];
        var bOldIsFake = false;
        if (!mc)
            return; //review zig when can this happen?
        if (!mcOld) {
            //might be there already by name
            var idMemberFakeExisting = idMemberMapByName[mc.username];
            if (idMemberFakeExisting) {
                mcOld = usersMap[idMemberFakeExisting];
                if (mcOld && idMemberFakeExisting.indexOf(g_prefixCustomUserId) == 0)
                    bOldIsFake = true;
            }
        }
        if (!mcOld || mcOld.dateSzLastTrello <= dateAction || bOldIsFake) {
            if (bOldIsFake)
                mcOld.bDelete = true;
            usersMap[idMember] = { dateSzLastTrello: dateAction, bEdited: true, idMemberCreator: idMember, username: mc.username };
            idMemberMapByName[mc.username] = idMember;
        }
    }
}

function commitSESyncDataWorker(tx, alldata, usersMap, idMemberMapByName) {
    var rows = [];
    var rgKeywords=g_optEnterSEByComment.rgKeywords;
    //sort before so usersMap is correct and we insert in date order. date is comment date, without yet applying any delta (-xd)
    //review zig ideally it should merge individual board sorted items without destruction or original orders in each array,
    //but im not sure if it would really make a difference as there is only dependency between cards not boards (currently)
    //and in any case the date to the millisecond would have to be identical to cause issues
    alldata.rgCommentsSE.sort(function (a, b) {
        return cmpString(a.date, b.date);
    });

    //once sorted, process all users to update their data
    preprocessUsersInAllData(alldata.rgCommentsSE, usersMap, idMemberMapByName);

    alldata.rgCommentsSE.forEach(function (action) {
        if (action.ignore)
            return; //can get here when there is a card reset command, and generates duplicate actions ignored here

        var rowsAdd = readTrelloCommentDataFromAction(action, rgKeywords, alldata, usersMap, idMemberMapByName);
        rowsAdd.forEach(function (rowCur) {
            rows.push(rowCur);
        });
    });
    var bCommited = (rows.length > 0);

    //note: we dont directly insert into history. Instead put it on QUEUEHISTORY and insert later.
    //the only reason to do it this way is because insertIntoDBWorker sometimes divides work in multiple transactions (see board commands), and 
    //websql does not support nested transactions. savepoints arent supported and cant be used either.
    //also this made it easier to reuse existing code that inserts history rows based on spreadsheet rows (legacy sync).
    //the rows here will be inserted as soon as the containing transaction is done. Also we check for pending inserts
    //when the db is opened to handle cases like a shutdown in between transactions.
    rows.forEach(function (row) {
        var sql = "INSERT INTO QUEUEHISTORY (obj) VALUES (?)";
        tx.executeSql(sql, [JSON.stringify(row)],
                null,
				function (tx2, error) {
				    logPlusError(error.message);
				    return true; //stop
				});
    });

    alldata.rgCardResetData.forEach(function (cardData) {
        var sql = "UPDATE history set spent=0, est=0, eType=" + ETYPE_NONE + ", comment= '[original s/e: ' || spent || '/' || est || '] ' || comment  WHERE idCard=? and (spent<>0 OR est<>0)";
        tx.executeSql(sql, [cardData.idCard],
                null,
				function (tx2, error) {
				    logPlusError(error.message);
				    return true; //stop
				});

        sql = "DELETE FROM CARDBALANCE WHERE idCard=?";
        tx.executeSql(sql, [cardData.idCard],
                null,
				function (tx2, error) {
				    logPlusError(error.message);
				    return true; //stop
				});

        //card.dateSzLastTrello should not require updating since we only get card comments from before the last processed board date, thus should should
        //never find a card with a date after the one already in processCardAction

        //REVIEW ZIG: BOARDMARKERS are not reset if they came from these cards. this can be fixed by including idCard as a BOARDMARKERS column and delete those here
        sql = "DELETE FROM BOARDMARKERS WHERE idCard=?";
    });
    
    var idMemberCreator = null;

    for (idMemberCreator in usersMap) {
        var userCur = usersMap[idMemberCreator];
        if (userCur.bDelete) {
            tx.executeSql("DELETE FROM USERS WHERE idMemberCreator=?",
            [idMemberCreator],
                null,
				function (tx2, error) {
				    logPlusError(error.message);
				    return true; //stop
				});
            continue;
        }

        if (!userCur.bEdited)
            continue;
        tx.executeSql("INSERT OR REPLACE INTO USERS (idMemberCreator,username, dateSzLastTrello) VALUES (?,?,?)",
            [idMemberCreator, userCur.username, userCur.dateSzLastTrello],
                null,
				function (tx2, error) {
				    logPlusError(error.message);
				    return true; //stop
				});
    }

    return bCommited;
}

function insertPendingSERows(callback, bAllowWhileOpeningDb) {
    var request = { sql: "select iRow, obj FROM QUEUEHISTORY order by iRow ASC", values: [] };
    handleGetReport(request,
        function (responseReport) {
            if (responseReport.status != STATUS_OK) {
                callback({ status: responseReport.status, cRowsNew: 0 });
                return;
            }

            var rowsCommit = new Array(responseReport.rows.length);
			var iCommit=0;
            responseReport.rows.forEach(function (row) {
                var rowAdd = JSON.parse(row.obj);
                rowAdd.iRow = row.iRow;
                rowsCommit[iCommit]=rowAdd;
				iCommit++;
            });
            insertIntoDBWorker(rowsCommit, callback, undefined, true);
        },
        bAllowWhileOpeningDb);
}
