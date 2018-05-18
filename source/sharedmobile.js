/// <reference path="intellisense.js" />
//
//DONT use const in this file, as mobile supports older browsers

var SEP_IDHISTORY_MULTI = ".";
var g_strUserMeOption = "me";
var PREFIX_PLUSCOMMAND = "^"; //plus command starts with this (both card and board commands)
var PLUSCOMMAND_RESET = "^resetsync";
var PLUSCOMMAND_ETRANSFER = "^etransfer";
var PLUSCOMMAND_ETRANSFER_FROMCARD = ".fromcard:";
var g_prefixCommentTransfer = "[" + PLUSCOMMAND_ETRANSFER;
var g_prefixCommentTransferTo = g_prefixCommentTransfer + " to ";
var g_prefixCommentTransferFrom = g_prefixCommentTransfer + " from ";
var g_dDaysMinimum = -10000; //sane limit of how many days back can be set on a S/E comment. limit is inclusive
var TAG_RECURRING_CARD = "[R]";
var DEFAULTGLOBAL_USER = "global";
var g_strUserOtherOption = "other user...";
var g_strDateOtherOption = "other date...";
var g_valMaxDaysCombo = 5;

var MAP_UNITS = {
    "m": 1000 * 60,
    "h": 1000 * 60 * 60,
    "d": 1000 * 60 * 60 * 24
};


var UNITS = {
    minutes: "m",
    hours: "h",
    days: "d",
    current: "h", //current units, hours by default
    callbackOnSet: null,

    getCurrentShort: function (bDisplayPointUnits) {
        if (bDisplayPointUnits)
            return "p";
        return this.current;
    },
    getLongFormat: function (u, bDisplayPointUnits) {
        u = u || this.current;
        if (bDisplayPointUnits)
            return "points";

        if (u == this.minutes)
            return "minutes";

        if (u == this.hours)
            return "hours";

        if (u == this.days)
            return "days";

        logPlusError("unknown units");
        return "unknown";
    },
    SetCallbackOnSet: function (callback) {
        callbackOnSet = callback;
    },
    SetUnits: function (unit) {
        this.current = unit;
        if (callbackOnSet)
            callbackOnSet(unit);
    },
    FormatWithColon: function (f, bShowZero) {
        assert(typeof f == "number");
        var pre = "";
        var strZero = (bShowZero ? "0" : "");
        if (f < 0) {
            f = -f;
            pre = "-";
        }
        if (f == 0)
            return strZero;
        var units = Math.floor(f);
        var str = "";
        var subunits = Math.round((f - units) * this.ColonFactor());
        if (subunits == 0)
            str = "" + units;
        else
            str = "" + (units == 0 ? strZero : units) + ":" + subunits;
        return pre + str;
    },
    ColonFactor: function () {
        return (this.current == "d" ? 24 : 60);
    },
    TimeToUnits: function (time) {
        var mult = MAP_UNITS[this.current];
        assert(mult);
        return time / mult;
    },
    UnitsToTime: function (units) {
        var mult = MAP_UNITS[this.current];
        assert(mult);
        return units * mult;
    },

    GetUnit: function () {
        assert(this.current);
        return this.current;
    },
    GetSubUnit: function () {
        if (this.current == this.minutes)
            return "s";
        if (this.current == this.hours)
            return this.minutes;
        if (this.current == this.days)
            return this.hours;
        assert(false);
        return null; //happy lint
    }
};

var g_bChromeStorage = (typeof (chrome) != "undefined" && chrome.storage && chrome.storage.local);

//use chrome.storage.local if available, else use localStorage
var g_storage = {
    get: function (key, callback) { //callback(string or null)
        if (g_bChromeStorage) {
            chrome.storage.local.get(key, function (obj) {
                var value = obj[key];
                if (chrome.runtime.lastError)
                    console.log(chrome.runtime.lastError.message);
                callback(value);
            });
        } else {
            callback(localStorage[key]);
        }
    },
    //optional callback(string error or null)
    set: function (key, strVal, callback) {
        if (g_bChromeStorage) {
            var pair = {};
            pair[key] = strVal;
            chrome.storage.local.set(pair, function () {
                if (callback)
                    callback(chrome.runtime.lastError ? chrome.runtime.lastError.message : null);
            });
        } else {
            localStorage[key] = strVal;
            if (callback)
                callback(null);
        }
    },
    remove: function (key, callback) { //optional callback(string error or null)
        if (g_bChromeStorage) {
            chrome.storage.local.remove(key, function () {
                if (callback)
                    callback(chrome.runtime.lastError ? chrome.runtime.lastError.message : null);
            });
        } else {
            delete localStorage[key];
            if (callback)
                callback(null);
        }
    }
};


//information about what is being edited in the s/e card. can load/restore from storage per card
//NOTE: g_currentCardSEData.user can be "me", must be manually mapped to g_user.username 
var g_currentCardSEData = {
    loadFromStorage: function (idCard, callback) {
        assert(idCard);
        var key = this.keyStoragePrefix + idCard;
        
        this.clearValues();
		this.idCard = idCard;
        var thisLocal = this;
        g_storage.get(key, function (strVal) {
            if (!strVal) {
                callback();
                return;
            }
            var value = JSON.parse(strVal);
            assert(idCard == value.idCard);
            if (thisLocal.idCard != idCard) {
                //should never happen but handle possible rare timing if async storage
                //does not callback
                return;

            }
            thisLocal.msTime = value.msTime;
            thisLocal.keyword = value.keyword;
            thisLocal.user = value.user;
            thisLocal.delta = value.delta;
            thisLocal.s = value.s;
            thisLocal.e = value.e;
            thisLocal.note = value.note;
            callback();
        });
    },
    saveToStorage: function () {
        assert(this.idCard);
        var stringified = JSON.stringify({
            idCard: this.idCard,
            keyword: this.keyword,
            user: this.user,
            delta: this.delta,
            s: this.s,
            e: this.e,
            note: this.note,
            msTime: this.msTime
        });

        var key = this.keyStoragePrefix + this.idCard;
        var thisLocal = this;
        g_storage.set(key, stringified, function (strError) {
            if (strError)
                return;
            thisLocal.strLastSaved = stringified;
        });
    },

    setValues: function (idCard, keyword, user, delta, s, e, note) {
        if (this.idCard == idCard &&
            this.keyword == keyword &&
            this.user == user &&
            this.delta == delta &&
            this.s == s &&
            this.e == e &&
            this.note == note) {
            return;
        }

        this.idCard = idCard;
        this.keyword = keyword;
        this.user = user;
        this.delta = delta;
        this.s = s;
        this.e = e;
        this.note = note;
        this.msTime = Date.now();
        this.saveToStorage();
    },

    removeValue: function (idCardCur) {
        if (!idCardCur)
            idCardCur = this.idCard;

        if (!idCardCur)
            return;
        var key = this.keyStoragePrefix + idCardCur;
        g_storage.remove(key);
        if (this.idCard == idCardCur)
            this.clearValues();
    },

    //ALL BELOW ARE PRIVATE

    clearValues: function () {
        this.msTime = 0;
        this.keyword = "";
        this.user = "";
        this.delta = "";
        this.s = "";
        this.e = "";
        this.note = "";
        //do not clear this.idCard, we want to leave it, as if the draft is all empty.
    },

    msTime: 0,
    keyStoragePrefix: "cardSEDraft:",
    strLastSaved: "", //note: because it contains the idCard, its OK to not clear this cache when the card changes
    idCard: "",
    keyword: "",
    user: "", //note: can be "me". must be checked
    delta: "",
    s: "", //NOTE: s/e stored as strings. could contain ":"
    e: "",
    note: ""
};

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

var g_regexDashCleanup = /-/g;
function makeHistoryRowObject(dateNow, idCard, idBoard, strBoard, strCard, userCur, s, e, comment, idHistoryRowUse, keyword) {
    //console.log(dateNow + " idCard:" + idCard + " idBoard:" + idBoard + " card:" + strCard + " board:" + strBoard);
    var obj = {};
    var userForId = replaceString(userCur, g_regexDashCleanup, '~'); //replace dashes from username. really should never happen since currently trello already strips dashes from trello username. see makeRowAtom
    if (idHistoryRowUse) {
        idHistoryRowUse = replaceString(idHistoryRowUse, g_regexDashCleanup, '~'); //replace dashes just in case. we use them to store more info later
        obj.idHistory = 'idc' + idHistoryRowUse; //make up a unique 'notification' id across team users. start with string so it never confuses the spreadsheet, and we can also detect the ones with comment ids
    }
    else {
        assert(IsStealthMode() || (s == 0 && e == 0)); //without an id, must be 0/0 to not mess up the totals on reset. plus commands fall here
        obj.idHistory = 'id' + dateNow.getTime() + userForId; //make up a unique 'notification' id across team users. start with a string so it will never be confused by a number in the ss. user added to prevent multiple users with dup id
    }
    obj.idCard = idCard;
    obj.idBoard = idBoard;
    obj.keyword = keyword || null; //null will be handled later when is entered into history
    var date = Math.floor(dateNow.getTime() / 1000); //seconds since 1970
    obj.date = date; //review zig: warning! date should really be sDate as it measures seconds, not milliseconds.
    obj.strBoard = strBoard;
    obj.strCard = strCard;
    obj.spent = s;
    obj.est = e;
    obj.user = userCur;
    obj.week = getCurrentWeekNum(dateNow);
    obj.month = getCurrentMonthFormatted(dateNow);
    obj.comment = comment;
    return obj;
}

