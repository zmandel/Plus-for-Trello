//from plus extension code
var g_dateMinCommentSE = new Date(2013, 6, 30);
var g_dateMinCommentSEWithDateOverBackend = new Date(2014, 11, 3); //S/E with -xd will be ignored on x<-2 for non spent-backend admins, like the backend used to do
var g_dateMinCommentSERelaxedFormat = new Date(2014, 11, 9);
var PREFIX_ERROR_SE_COMMENT = "[error: "; //always use this to prefix error SE rows.
var ID_PLUSCOMMAND = "/PLUSCOMMAND";
var PREFIX_PLUSCOMMAND = "^";
var TAG_RECURRING_CARD = "[R]";
var g_dDaysMinimum = -10000; //sane limit of how many days back can be set on a S/E comment

//review zig: select units from prefs
var UNITS = {
    PROP_PLUSUNITS :"plusUnits",
    minutes: "m",
    hours: "h",
    days: "d",
    current: "h", //current units, hours by default
    InitOnce: function () {
        this.current = (localStorage[this.PROP_PLUSUNITS] || this.current);
    },
    SetUnits: function (unit) {
        this.current = unit;
        localStorage[this.PROP_PLUSUNITS] = unit;
    },
    FormatWithColon: function (f) {
        assert(typeof f == "number");
        assert(f >= 0); //floor would need to change
        if (f == 0)
            return "";
        var units = Math.floor(f);
        var str = "";
        var subunits = Math.round((f - units) * this.ColonFactor());
        if (subunits == 0)
            str = "" + units;
        else
            str = "" + (units == 0 ? "" : units) + ":" + subunits;
        return str;
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

var MAP_UNITS = {
    "m": 1000 * 60,
    "h": 1000 * 60 * 60,
    "d": 1000 * 60 * 60 * 24
};

var g_syncProgress = {
    total: 0,
    start: function () {
        this.total++;
        $("#syncButton").buttonMarkup({ icon: "syncAnim" });
    },

    end: function () {
        this.total--;
        if (this.total == 0)
            $("#syncButton").buttonMarkup({ icon: "syncStatic" });
    }
};

function parseColonFormatSE(val, bExact) {
    assert(val.indexOf(":") >= 0);
    if (val.indexOf(".") >= 0)
        return null; //invalid

    var rg = val.split(":");
    if (rg.length != 2)
        return null; //invalid

    var h = parseInt(rg[0], 10) || 0;
    var sign = (h < 0 ? -1 : 1);
    h = Math.abs(h);
    var m = parseInt(rg[1], 10) || 0;

    var retVal = sign * (h + (m / UNITS.ColonFactor()));
    if (bExact)
        return retVal;
    return parseFixedFloat(retVal);
}


//parseFixedFloat
//round to two decimals.
//input can be string or number
//if text contains colon, will assume units:subunits format
//returns a float
function parseFixedFloat(text, bDontZeroNan, bOneDecimal) {
    var val = null;

    if (typeof text == "number")
        val = text;
    else {
        if (typeof (text) == 'string' && text.indexOf(":") >= 0) {
            val = parseColonFormatSE(text, false);
            if (val === null)
                val = 0;
        }
        else {
            val = parseFloat(text);
        }
    }
    if (isNaN(val)) {
        if (bDontZeroNan)
            return val;
        return 0;
    }
    var roundNum = (bOneDecimal ? 10 : 100);

    return Math.round(val * roundNum) / roundNum;
}

function errFromXhr(xhr) {
    var errText = "";

    if (xhr.status == 0)
        errText = "No connection";
    else if (xhr.statusText)
        errText = xhr.statusText;
    else if (xhr.responseText)
        errText = xhr.responseText;
    else
        errText = "error: " + xhr.status;

    console.log(errText);
    return errText;
}

//bReturnErrors false (default): will display error and not call callback.
//always changePane before calling this for a page
function callTrelloApi(urlParam, bContext, msWaitStart, callback, bReturnErrors, waitRetry, bSkipCache, context, bReturnOnlyCachedIfExists) {
    var keyCached = "td:" + urlParam;
    var bReturnedCached = false;
    var objTransformedFirst = null;
    var cPageNavCur = g_cPageNavigations;
    if (bContext && !context)
        context = JSON.stringify(g_stateContext);

    //NOTE: negative msWaitStart means use cache only if possible and do not call trello
    function bOKContext() {
        return (!bContext || context == JSON.stringify(g_stateContext));
    
    }

    if (!bSkipCache) {
        //if there is a cache, return it, and later return again the real results
        var cached = localStorage[keyCached];
        if (cached) {
            cached = JSON.parse(cached);
            if ((msWaitStart > 250) && cached.now && (Date.now() - cached.now > 1000 * 60 * 10))
                msWaitStart = 250; //hurry up refreshing if cache is older than 10 minutes
                
            var objRetCached = {};
            var objSet = JSON.parse(LZString.decompress(cached.compressed));

            if (cached.bTransformed)
                objRetCached.objTransformed = objSet;
            else           
                objRetCached.obj = objSet;
            
            objRetCached.bCached = true;
            objTransformedFirst = objRetCached;
            bReturnedCached = true;
            callback(objRetCached);
            if (bReturnOnlyCachedIfExists)
                return; //dont make the request again
        }
    }
    var url = "https://trello.com/1/" + urlParam + "&key=" + TRELLO_APPKEY + "&token=" + localStorage[PROP_TRELLOKEY];
    var xhr = new XMLHttpRequest();
    var bOkCallback = false;
    xhr.onreadystatechange = function (e) {
        if (xhr.readyState == 4) {
            g_syncProgress.end();
            handleFinishRequest();

            function handleFinishRequest() {
                var objRet = { status: "unknown error", obj: [], bCached:false };
                var bReturned = false;
                var bQuotaExceeded = (xhr.status == 429);
                g_analytics.hit({ t: "event", ec: "trelloApiCalls", ea: (bQuotaExceeded? "callRetry" : "call") }, 1000);
               
                if (!bOKContext())
                    return;

                if (xhr.status == 200) {
                    try {
                        var obj = JSON.parse(xhr.responseText);
                        objRet.status = STATUS_OK;
                        objRet.obj = obj;
                        bReturned = true;
                        if (cPageNavCur != g_cPageNavigations)
                            objTransformedFirst = null; //invalidate if user navigated away since first cache return
                        var objTransformed = callback(objRet, objTransformedFirst);
                        bOkCallback = true; //covers exception from callback
                        var cacheItem={compressed:null, bTransformed:false,now:Date.now()};
                        if (objTransformed) {
                            cacheItem.bTransformed = true;
                            cacheItem.compressed = LZString.compress(JSON.stringify(objTransformed));
                        } else {
                            cacheItem.bTransformed = false;
                            cacheItem.compressed=LZString.compress(xhr.responseText);
                        }
                        localStorage[keyCached] = JSON.stringify(cacheItem);
                    } catch (ex) {
                        objRet.status = "error: " + ex.message;
                    }
                } else {
                    if (bQuotaExceeded) {
                        var waitNew = (waitRetry || 500) * 2;
                        if (waitNew < 8001) {
                            console.log("Plus: retrying api call");
                            callTrelloApi(urlParam, bContext, waitNew, callback, bReturnErrors, waitNew, true, context);
                            return;
                        }
                        else {
                            objRet.status = errFromXhr(xhr);
                        }
                    }
                    else if (xhr.status == 404) {
                        objRet.status = "error: not found\n" + errFromXhr(xhr);
                    }
                    else {
                        objRet.status = errFromXhr(xhr);
                    }
                }

                if (!bReturned || !bOkCallback) {
                    if (objRet.status != STATUS_OK && !bReturnErrors) {
                        alertMobile(objRet.status);
                        return;
                    }
                    if (!bReturned)
                        callback(objRet);          
                }
            }
        }
    };

    function worker() {
        if (!bOKContext())
            return;

        g_syncProgress.start();
        xhr.open("GET", url);
        xhr.send();
    }

    if (!bReturnedCached)
        msWaitStart = 0;
    
    if (msWaitStart > 0) {
        setTimeout(function () {
            worker();
        }, msWaitStart);
    }
    else if (msWaitStart == 0)  {
        worker();
    }
    //negative msWaitStart means we do not call worker
}

//taken from chrome extension code
function matchCommentParts(text, date, bRecurringCard) {
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

//taken from chrome extension code
function replaceBrackets(str) {
    return str.replace(/\[/g, '*').replace(/\]/g, '*');
}

//taken from chrome extension code
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

//taken from chrome extension code
function readTrelloCommentDataFromAction(action, cardTitle, rgKeywords)
{
    var tableRet = [];
    var id = action.id;
    var from = null;
    var memberCreator = action.memberCreator; //may be undefined

    if (memberCreator && memberCreator.username)
        from = memberCreator.username;
    else
        from = action.idMemberCreator || "unknown"; //if action feed didnt include memberCreator, a deleted user wont even have this so use unknown

    from = from.toLowerCase(); //shouldnt be necessary but just in case
    var bPlusCommand = false;
    var textNotifyOrig = action.data.text.trim();
    var date = new Date(action.date); //convert from ISO-8601 to js date
    if (date < g_dateMinCommentSE || rgKeywords.length==0)
        return tableRet;

    rgKeywords.every(function (keyword) {
        var txtPre = keyword + " ";
        var i = textNotifyOrig.toLowerCase().indexOf(txtPre);
        if (i < 0 || (i > 0 && textNotifyOrig.charAt(i - 1) != " ")) //whole word keyword
            return true; //continue

        var textNotify = textNotifyOrig.substr(txtPre.length + i).trim(); //remove keyword
        var idForSs = "" + id; //clone it
        var parseResults = matchCommentParts(textNotify, date, cardTitle.indexOf(TAG_RECURRING_CARD)>=0);
        var comment = "";

        function pushErrorObj(strErr) {
            if (tableRet.length != 0)
                return;
            var obj = makeHistoryRowObject(date, from, 0, 0, PREFIX_ERROR_SE_COMMENT + strErr + "] " + replaceBrackets(textNotify), idForSs, keyword);
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

        if (parseResults.strSpent)
            s = parseFixedFloat(parseResults.strSpent,false);

        if (parseResults.strEstimate)
            e = parseFixedFloat(parseResults.strEstimate, false);



        comment = parseResults.comment;
        var commentLower = comment.toLowerCase();
        if (commentLower.indexOf(PREFIX_PLUSCOMMAND) == 0) {
            if (0 == s && 0 == e &&
                  (commentLower.indexOf("markboard") == 1 || commentLower.indexOf("unmarkboard") == 1)) {
                bPlusCommand = true;
            }
            else {
                //attempted a plus command. dont fail with error, just insert a warning. might be a legitimate S/E entry
                comment = "[command ignored] " + comment;
            }
        }


        var deltaDias = parseResults.days;
        var deltaParsed = 0;
        if (deltaDias) {
            deltaParsed = parseInt(deltaDias, 10) || 0;
            if (deltaParsed > 0 || deltaParsed < g_dDaysMinimum) { //sane limits
                //note this is really not possible to enter here because the parser guarantees that deltaPasrsd will be negative
                pushErrorObj("bad d");
                return true; //continue
            }

            var deltaMin = (keyword == "@tareocw"? -2 : -10);
            //support spent backend legacy rules for legacy rows
            if (deltaParsed < deltaMin && date < g_dateMinCommentSEWithDateOverBackend) {
                if (from != "zigmandel" && from != "julioberrospi" && from != "juanjoserodriguez2") {
                    pushErrorObj("bad d for legacy entry"); //used to say "bad d for non-admin"
                    return true; //continue
                }
            }
            date.setDate(date.getDate() + deltaParsed);
            comment = "[" + deltaParsed + "d] " + comment;
        }

        var rgUsersProcess = parseResults.rgUsers; //NOTE: >1 when reporting multiple users on a single comment
        var iRowPush = 0;

        if (rgUsersProcess.length == 0)
            rgUsersProcess.push(from);

        tableRet = []; //remove possible previous errors (when another keyword before matched partially and failed)
        for (iRowPush = 0; iRowPush < rgUsersProcess.length; iRowPush++) {
            var idForSsUse = idForSs;
            var commentPush = comment;
            if (iRowPush > 0)
                idForSsUse = idForSs + "." + iRowPush;
            var userCur = rgUsersProcess[iRowPush];
            if (userCur.toLowerCase() == "me")
                userCur = from; //allow @me shortcut (since trello wont autocomplete the current user)
            var bSameUser= (userCur.toLowerCase() == from.toLowerCase());
            if (!bSameUser)
                commentPush = "[by " + from + "] " + commentPush;
            
            var obj = makeHistoryRowObject(date, userCur, s, e, commentPush, idForSsUse, keyword, bSameUser? action.idMemberCreator : null);
            obj.bError = false;
            tableRet.push(obj);
        }
        return false; //stop
    }); //end every keyword

    return tableRet;
}