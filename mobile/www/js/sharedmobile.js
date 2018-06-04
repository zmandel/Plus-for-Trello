/// <reference path="intellisense.js" />
//dont use const in this file, as mobile supports older browsers

var SEP_IDHISTORY_MULTI = ".";
var g_strUserMeOption = "me";
var PREFIX_PLUSCOMMAND = "^";
var PLUSCOMMAND_RESET = "^resetsync";
var PLUSCOMMAND_ETRANSFER = "^etransfer";
var g_prefixCommentTransfer = "[" + PLUSCOMMAND_ETRANSFER;
var g_prefixCommentTransferTo = g_prefixCommentTransfer + " to ";
var g_prefixCommentTransferFrom = g_prefixCommentTransfer + " from ";
var g_dDaysMinimum = -10000; //sane limit of how many days back can be set on a S/E comment. limit is inclusive
var TAG_RECURRING_CARD = "[R]";
var DEFAULTGLOBAL_USER = "global";

//prepends [by user] [xd] [^etransfer from/to user] to comments, returns new string 
function appendCommentBracketInfo(deltaParsed, comment, from, rgUsersProcess, iRowPush, bETransfer) {
    var commentPush = comment;
    var userCur = rgUsersProcess[iRowPush] || from;
    var bSpecialETransferFrom = (bETransfer && iRowPush === 0);
    var bSpecialETransferTo = (bETransfer && iRowPush === 1);

    if (deltaParsed)
        commentPush = "[" + deltaParsed + "d] " + commentPush;


    if (userCur != from)
        commentPush = "[by " + from + "] " + commentPush;

    if (bSpecialETransferFrom) {
        assert(rgUsersProcess[1]);
        commentPush = g_prefixCommentTransferTo + rgUsersProcess[1] + "] " + commentPush;
    } else if (bSpecialETransferTo) {
        assert(rgUsersProcess[0]);
        commentPush = g_prefixCommentTransferFrom + rgUsersProcess[0] + "] " + commentPush;
    }
    return commentPush;
}

function makeHistoryRowObject(dateNow, userCur, s, e, comment, idHistoryRowUse, keyword, idUser) {
    var obj = {};
    var userForId = userCur.replace(/-/g, '~'); //replace dashes from username. should never happen since trello already strips dashes from trello username.
    if (idHistoryRowUse) {
        idHistoryRowUse = idHistoryRowUse.replace(/-/g, '~'); //replace dashes just in case
        obj.idHistory = 'idc' + idHistoryRowUse; //make up a unique 'notification' id across team users. start with string so it never confuses the spreadsheet, and we can also detect the ones with comment ids
    }
    else {
        assert(s == 0 && e == 0); //without an id, must be 0/0 to not mess up the totals on reset. plus commands fall here
        obj.idHistory = 'id' + dateNow.getTime() + userForId; //make up a unique 'notification' id across team users. start with a string so it will never be confused by a number in the ss
    }

    obj.keyword = keyword || null; //null will be handled later when is entered into history
    var date = Math.floor(dateNow.getTime() / 1000); //seconds since 1970
    obj.date = date; //review zig: warning! date should really be sDate as it measures seconds, not milliseconds.
    obj.spent = s;
    obj.est = e;
    obj.user = userCur;
    obj.comment = comment;
    obj.idUser = idUser;
    return obj;
}
