/// <reference path="intellisense.js" />
//dont use const in this file, as mobile supports older browsers

var g_deletedUserIdPrefix = "deleted"; //prefix for user id and user (when making up a username on deleted users)
var PREFIX_ERROR_SE_COMMENT = "[error: "; //always use this to prefix error SE rows.
var g_prefixCustomUserId = "customUser:";
var g_dateMinCommentSE = new Date(2013, 6, 30); //exclude S/E before this (regular users didnt have this available back then), excludes my testing data from spent backend
var g_dateMinCommentSEWithDateOverBackend = new Date(2014, 11, 3); //S/E with -xd will be ignored on x<-2 for non spent-backend admins, like the backend used to do
var g_dateMinCommentSERelaxedFormat = new Date(2014, 11, 9);
var g_dateMinTransferInPast = new Date(2017, 8, 15); //REVIEW cardtransfer
//regex is easy to break. check well your changes. consider newlines in comments. NOTE command could also be in the note.
//For historical reasons, the command here only covers ^resetsync without 0/0. later we detect other commands.
//                                       users               days           spent                      command           /        estimate              spaces   note
var g_regexSEFull = new RegExp("^((\\s*@\\w+\\s+)*)((-[0-9]+)[dD]\\s+)?(([+-]?[0-9]*[.:]?[0-9]*)|(\\^[a-zA-Z]+))?\\s*(/?)\\s*([+-]?[0-9]*[.:]?[0-9]*)?(\\s*)(\\s[\\s\\S]*)?$");

function readTrelloCommentDataFromAction(action, rgKeywords, alldata, usersMap, idMemberMapByName) {
    var tableRet = [];
    var id = action.id;
    var from = null;
    var memberCreator = action.memberCreator; //may be undefined

    if (usersMap && action.idMemberCreator) { //should be set always. but just in case handle it
        var cached = usersMap[action.idMemberCreator];
        if (cached)
            memberCreator = cached; //Trello renames all actions users when a user is renamed but not when deleted.
    }

    if (memberCreator && memberCreator.username)
        from = memberCreator.username;
    else
        from = g_deletedUserIdPrefix + (action.idMemberCreator || "unknown"); //keep the username as a regex word

    from = from.toLowerCase(); //shouldnt be necessary but just in case
    var idCardShort = alldata.cardsByLong[action.data.card.id];
    var cardObj = alldata.cards[idCardShort];
    var idBoardShort = (cardObj || {}).idBoard; //this one is more up to date than the one in the action


    if (!idBoardShort || !idCardShort || idBoardShort == IDBOARD_UNKNOWN) {
        //idBoardShort can be unknown. ignore those.
        if (!idBoardShort || !idCardShort)
            logPlusError("error: unexpected card comment from unknown board/card");
        return tableRet;
    }

    if (!alldata.boards[idBoardShort]) {
        //review zig: this happens rarely. the card could have moved to a board that the user no longer has access, but if so the comments should have moved there too.
        //might be timing-related to trello db.
        //if the board is not mapped by plus, this card comment should be processed when the user becomes a member or on next sync.
        return tableRet;
        //logPlusError("error: idBoardShort:" + idBoardShort + " action:" + JSON.stringify(action) + " cardObj:" + JSON.stringify(cardObj));
        //assert(false);
    }
    var strBoard = alldata.boards[idBoardShort].name;
    var strCard = cardObj.name;
    var textNotifyOrig = action.data.text.trim();
    var date = new Date(action.date); //convert from ISO-8601 to js date

    if (date < g_dateMinCommentSE || rgKeywords.length == 0)
        return tableRet;

    var cardTitle = action.data.card.name;
    var bRecurring = cardTitle.indexOf(TAG_RECURRING_CARD) >= 0;

    rgKeywords.every(function (keywordParam) {
        var bPlusBoardCommand = false;
        var keyword = keywordParam.toLowerCase();
        var txtPre = keyword + " ";
        var i = textNotifyOrig.toLowerCase().indexOf(txtPre);
        if (i < 0 || (i > 0 && textNotifyOrig.charAt(i - 1) != " ")) //whole word keyword
            return true; //continue

        var textNotify = textNotifyOrig.substr(txtPre.length + i).trim(); //remove keyword
        var idForSs = "" + id; //clone it
        
        var parseResults = matchCommentParts(textNotify, date, bRecurring, from);
        var comment = "";

        function pushErrorObj(strErr) {
            if (tableRet.length != 0)
                return;
            var obj = makeHistoryRowObject(date, idCardShort, idBoardShort, strBoard, strCard, from, 0, 0, PREFIX_ERROR_SE_COMMENT + strErr + "] " + replaceBrackets(textNotify), idForSs, keyword);
            obj.bError = true;
            tableRet.push(obj);
        }


        if (!parseResults) {
            pushErrorObj("bad format");
            return true; //continue
        }

        if (i > 0) {
            if (date > g_dateMinCommentSEWithDateOverBackend) {
                pushErrorObj("keyword not at start");
                return true;
            }
            //allow legacy S/E entry format for old spent backend rows
        }

        var s = 0;
        var e = 0;
        comment = parseResults.comment;

        if (parseResults.strSpent)
            s = parseFixedFloat(parseResults.strSpent, false);

        if (parseResults.strEstimate)
            e = parseFixedFloat(parseResults.strEstimate, false);

        var bETransfer = false;
        var idCardFromTransfer = null;

        if (parseResults.strCommand) {
            //note before v3.2.13 there were "board commands", (markboard, unmarkboard) no longer used
            bPlusBoardCommand = (parseResults.strCommand.indexOf("markboard") == 1 || parseResults.strCommand.indexOf("unmarkboard") == 1);

            function failCommand() {
                pushErrorObj("bad command format");
            }

            if (s != 0) {
                failCommand();
                return true; //continue
            }

            if (bPlusBoardCommand || parseResults.strCommand.indexOf(PLUSCOMMAND_RESET) == 0) {
                if (e != 0 || parseResults.rgUsers.length > 0 || parseResults.days) {
                    failCommand();
                    return true; //continue
                }
                comment = "[" + parseResults.strCommand + " command] " + comment; //keep command in history row for traceability
            } else {
                if (parseResults.strCommand.indexOf(PLUSCOMMAND_ETRANSFER) == 0) {
                    bETransfer = true;

                    if (parseResults.days && date < g_dateMinTransferInPast) {
                        failCommand();
                        return true; //continue
                    }

                    //note: do not yet modify the comment. we include the command later only on the first history row
                    if (e < 0 || parseResults.rgUsers.length != 2) {
                        failCommand();
                        return true; //continue
                    }
                    if (false) {
                        const prefixFromCard = PLUSCOMMAND_ETRANSFER + PLUSCOMMAND_ETRANSFER_FROMCARD;
                        if (parseResults.strCommand.indexOf(prefixFromCard) == 0) {
                            idCardFromTransfer = parseResults.strCommand.substring(prefixFromCard.length).split(" ")[0]; //first word
                            if (!idCardFromTransfer) {
                                failCommand();
                                return true; //continue
                            }
                        }
                    }
                } else {
                    failCommand();
                    return true; //continue
                }
            }
        }

        var deltaDias = parseResults.days;
        var deltaParsed = 0;
        if (deltaDias) {
            deltaParsed = parseInt(deltaDias, 10) || 0;
            if (deltaParsed > 0 || deltaParsed < g_dDaysMinimum) { //sane limits
                //note this is really not possible to enter here because the parser guarantees that deltaParsed will be negative
                pushErrorObj("bad d");
                return true; //continue
            }

            var deltaMin = (keyword == "@tareocw" ? -2 : -10);
            //support spent backend legacy rules for legacy rows
            if (deltaParsed < deltaMin && date < g_dateMinCommentSEWithDateOverBackend) {
                if (true) {
                    pushErrorObj("bad d for legacy entry"); //used to say "bad d for non-admin"
                    return true; //continue
                }
            }
            date.setDate(date.getDate() + deltaParsed);
        }

        var rgUsersProcess = parseResults.rgUsers; //NOTE: >1 when reporting multiple users on a single comment
        var iRowPush = 0;

        if (rgUsersProcess.length == 0)
            rgUsersProcess.push(from);

        tableRet = []; //remove possible previous errors (when another keyword before matched partially and failed)
        for (iRowPush = 0; iRowPush < rgUsersProcess.length; iRowPush++) {
            var idForSsUse = idForSs;
            var commentPush = appendCommentBracketInfo(deltaParsed, comment, from, rgUsersProcess, iRowPush, bETransfer);
            var datePush = date;
            if (iRowPush > 0)
                idForSsUse = idForSs + SEP_IDHISTORY_MULTI + iRowPush;
            if (action.idPostfix)
                idForSsUse = idForSsUse + action.idPostfix;
            var userCur = rgUsersProcess[iRowPush];

            if (idMemberMapByName && userCur != from) {
                //update usersMap to fake users that may not be real users
                //note checking for prefix g_deletedUserIdPrefix fails if user actually starts with "deleted", but its not a real scenario
                if (!idMemberMapByName[userCur] && userCur.indexOf(g_deletedUserIdPrefix) != 0) { //review zig duplicated. consolidate
                    var idMemberFake = g_prefixCustomUserId + userCur;
                    usersMap[idMemberFake] = { dateSzLastTrello: action.date, bEdited: true, idMemberCreator: idMemberFake, username: userCur };
                    idMemberMapByName[userCur] = idMemberFake;
                }
            }

            var bSpecialETransferFrom = (bETransfer && iRowPush === 0);

            //note that for transfers both are entered with the same date. code should sort by date,rowid to get the right timeline

            var idCardForRow = idCardShort;
            if (bPlusBoardCommand)
                idCardForRow = ID_PLUSBOARDCOMMAND;
            else if (bSpecialETransferFrom && idCardFromTransfer)
                idCardForRow = idCardFromTransfer;
            var obj = makeHistoryRowObject(datePush, idCardForRow, idBoardShort, strBoard, strCard, userCur, s, e, commentPush, idForSsUse, keyword);
            if (idCardForRow == ID_PLUSBOARDCOMMAND)
                obj.idCardOrig = idCardShort; //to restore in case the row causes an error at history commit time.
            
			obj.bError = false;
			if (bETransfer || bRecurring)
			    obj.bENew = true;
            if (parseResults.strCommand)
                obj.command = parseResults.strCommand.substring(1); //removes ^
            if (bSpecialETransferFrom) {
                assert(e >= 0);
                obj.est = -obj.est;
            }
            tableRet.push(obj);
        }
        return false; //stop
    }); //end every keyword

    return tableRet;
}


function matchCommentParts(text, date, bRecurringCard, userFrom) {
    //? is used to force non-greedy
    var i_users = 1;
    var i_days = 4;

    var i_spent = 6;
    var i_command = 7;
    var i_sep = 8;
    var i_est = 9;
    var i_spacesPreComment = 10;
    var i_note = 11;
    var preComment = "";

    var rgResults = g_regexSEFull.exec(text);
    if (rgResults == null)
        return null;

    //standarize regex quirks
    rgResults[i_users] = rgResults[i_users] || "";
    rgResults[i_command] = (rgResults[i_command] || "").toLowerCase();
    rgResults[i_est] = rgResults[i_est] || "";
    rgResults[i_note] = (rgResults[i_note] || ""); //note there is no limit. The user could in theory add millions of characters here.
    rgResults[i_note].split("\n")[0]; //note is up to newline if any

    assert(rgResults[i_command] == "" || (rgResults[i_command].length > 0 && rgResults[i_command].charAt(0) == PREFIX_PLUSCOMMAND));

    if (!rgResults[i_sep]) { //separator
        if (date && date < g_dateMinCommentSERelaxedFormat) {
            console.log("S/E legacy row with new format ignored " + date);
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
    if (!rgResults[i_command] && rgResults[i_note].indexOf(PREFIX_PLUSCOMMAND) == 0) {
        //for historical compatibility reasons, command in regex is only parsed when no S/E (resetsync case), but we need to manually parse it out of the comment otherwise.
        var words = rgResults[i_note].split(" ");
        rgResults[i_command] = words[0];
        rgResults[i_note] = rgResults[i_note].substring(words[0].length).trim();
    }
    var ret = {};
    var users = rgResults[i_users].trim();
    var rgUsers = [];
    if (users.length > 0) {
        var listUsers = users.split("@");
        var i = 0;
        for (; i < listUsers.length; i++) {
            var item = listUsers[i].trim().toLowerCase();
            if (item.length != 0) {
                item = item.toLowerCase();
                if (item == g_strUserMeOption)
                    item = userFrom; //allow @me shortcut (since trello wont autocomplete the current user)
                rgUsers.push(item);
            }
        }
    }
    ret.rgUsers = rgUsers;
    ret.days = rgResults[i_days] || "";
    ret.strSpent = rgResults[i_spent] || "";
    ret.strEstimate = rgResults[i_est] || "";
    ret.strCommand = rgResults[i_command] || "";
    ret.comment = preComment + replaceBrackets(rgResults[i_note] || "");
    return ret;
}
