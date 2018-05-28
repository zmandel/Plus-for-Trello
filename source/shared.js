/// <reference path="intellisense.js" />

var IDTEAM_UNKNOWN = "//"; //reserved idTeam. note that idTeam can also be null for boards without team
var IDBOARD_UNKNOWN = "//"; //board shortLink/idLong reserved for unknown boards. saved into db. for cases where user does not have permission for a board (for example when moving a card there)
var IDLIST_UNKNOWN = "//"; //list idLong. deals with missing idList in convertToCardFromCheckItem board action. saved to db

//review: dummy labels were initially used as a hacky way to get certain queries with "NOT" (!) working on labels.
//however it was limited and a similar effect can be achieved using idCard NOT in (list)
var IDLABEL_DUMMY = "//"; //the one dummy label cards share.
var g_bDummyLabel = false; //not used. just kept to keep the code as it inserts itself in interesting spots
const ROWID_REPORT_CARD = -1; // "fake" rowid on reports that join card with history. use -1 as rowid so when doing a "new s/e rows" report and a group is used, this union wont appear.
var PREFIX_COMMAND_SE_RESETCOMMAND = "[^resetsync";
var g_msFetchTimeout = 15000; //ms to wait on urlFetches. update copy on plus.js
var g_cchTruncateDefault = 50;
var g_cchTruncateShort = 20;
var g_cchTruncateChartDlabel = 35;
var g_regexpHashtags = /#([\S-]+)/g;
var g_colorTrelloBlack = "#4D4D4D";
const IDNOTIFICATION_FIRSTSYNCPRORESS = "firstSyncProgress";
var OPT_SHOWSPENTINICON_NORMAL = 0;
var OPT_SHOWSPENTINICON_ALWAYS = 1;
var OPT_SHOWSPENTINICON_NEVER = 2;
var g_optAlwaysShowSpentChromeIcon = OPT_SHOWSPENTINICON_NORMAL; //review zig these 3 need initialization. 
var g_bDontShowTimerPopups = false;
var g_bIncreaseLogging = false;
var g_lsKeyDisablePlus = "agile_pft_disablePageChanges"; //in page localStorage (of trello.com content script) so it survives plus reset sync
var g_language = "en";
var g_bNoSE = false; //true -> hide S/E features
var g_bNoEst = false; //true -> hide E features
var g_bProVersion = false;
var g_bFromBackground = false;
var g_msStartPlusUsage = null; //ms of date when plus started being used.
const URLPART_PLUSLICENSE = "plus-license";
const LOCALPROP_NEEDSHOWPRO = "keyNeedShowProInfo";
const LOCALPROP_DONTSHOWSYNCWARN = "bDontShowAgainSyncWarn";
const LOCALPROP_NEEDSHOWHELPPANE = "keyNeedShowHelpPane";

const ID_PLUSBOARDCOMMAND = "/PLUSCOMMAND"; //review zig: remnant from undocumented boardmarkers feature. newer commands do not use this.

//thanks http://stackoverflow.com/a/12034334
var g_entityMap = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': '&quot;',
    "'": '&#39;',
    "/": '&#x2F;'
};

//replace can be a string, or a map function
//for performace, returns same string when there is no match
function replaceString(string, regex, replace) {
    if (typeof (string) != "string")
        string = String(string);

    regex.lastIndex = 0;
    return string.replace(regex, replace);
}



//much faster than localeCompare for many strings to sort
function cmpString(a, b) {
    return a > b ? 1 : a < b ? -1 : 0;
}

function commonBuildUrlFromParams(params, doc) {
    var url = chrome.extension.getURL(doc);
    var val = null;
    var bPasQ = (doc.indexOf("?")>=0);

    for (var i in params) {
        val = params[i];
        if (val == "")
            continue;
        if (!bPasQ) {
            url += "?";
            bPasQ = true;
        }
        else
            url += "&";
        url += (i + "=" + encodeURIComponent(val));
    }
    return url;
}

var g_regexEscapeHtml = /[&<>"'\/]/g;

function escapeHtml(string) {
    if (!string)
        return "";
    return replaceString(string, g_regexEscapeHtml, function (s) {
        return g_entityMap[s];
    });
}

function bHandledDeletedOrNoAccess(status, objRet, statusRetCustom) {
    var bDeleted = bStatusXhrDeleted(status);
    if (bStatusXhrNoAccess(status) || bDeleted) {
        if (typeof (statusRetCustom) == "undefined")
            statusRetCustom = STATUS_OK;
        objRet.hasPermission = false;
        objRet.status = statusRetCustom;
        if (bDeleted)
            objRet.bDeleted = true;
        return true;
    }
    return false;
}

function bStatusXhrNoAccess(status) {
    if (status == 400 || status == 401 || status == 403)
        return true;
    return false;
}

function bStatusXhrDeleted(status) {
    return (status == 404);
}

var g_regexParserFormat = /<.*?>/;

function addTableSorterParsers() {
    $.tablesorter.addParser({
        // set a unique id 
        id: 'links',
        is: function (s) {
            // return false so this parser is not auto detected 
            return false;
        },
        format: function (s) {
            // format your data for normalization 
            return replaceString(s, g_regexParserFormat, "");
        },
        // set type, either numeric or text
        type: 'text'
    });

    $.tablesorter.addParser({
        // set a unique id 
        id: 'digitWithParen',
        is: function (s) {
            // return false so this parser is not auto detected 
            return false;
        },
        format: function (s) {
            // format your data for normalization
            return s.split("(")[0].trim(); //remove possible (E 1st)
        },
        // set type, either numeric or text
        type: 'numeric'
    });

    
    $.tablesorter.addParser({
        id: 'dateDue',
        is: function (s) {
            // return false so this parser is not auto detected 
            return false;
        },
        format: function (s) {
            // format your data for normalization
            if (s.length > 2) //hackish: empty dates show as a spasish char. this detects it.
                return s;
            return "3000-01-01 00:00";
        },
        // set type, either numeric or text
        type: 'text'
    });

}

function isTestVersion() {
    //return false;
    return (chrome.runtime.id != "gjjpophepkbhejnglcmkdnncmaanojkf");
}

function getHashtagsFromTitle(title, bFirstOnly) {
    var hashtags = [];
    g_regexpHashtags.lastIndex = 0; //needed because of /g in global regex
    var result = g_regexpHashtags.exec(title);
    while (result != null) {
        hashtags.push(result[1]);
        if (bFirstOnly)
            break;
        result = g_regexpHashtags.exec(title);
    }

    return hashtags;
}

function setOptAlwaysShowSpentChromeIcon(opt) {
    //note old versions used to store boolean
    if (typeof (opt) === "undefined")
        opt=OPT_SHOWSPENTINICON_NORMAL;
    else if (opt === true)
        opt = OPT_SHOWSPENTINICON_ALWAYS;
    else if (opt === false)
        opt = OPT_SHOWSPENTINICON_NORMAL;
    g_optAlwaysShowSpentChromeIcon = opt;
}

var STATUS_OK = "OK"; //for messaging status with background page. all responses should have response.status=STATUS_OK when ok
var STATUS_CANCEL = "cancelled";

var COLOR_ERROR = "#D16C6C";
var MS_TRELLOAPI_WAIT = (1000 / 30); //review zig: possible to optimize this by substraction from prev. api call time, but not worth it yet
var CMAX_THREADS = 4;
var g_callbackOnAssert = null;
var g_bDebuggingInfo = false;

var g_bAcceptSFT = true;
var g_bAcceptPFTLegacy = true;

var g_regexExcludeList = /\[\s*exclude\s*\]/;
var g_userTrelloBackground = null;

var g_regexWords = /\S+/g; //parse words from an s/e comment. kept global in hopes of increasing perf by not having to parse the regex every time

var PROP_TRELLOUSER = "plustrellouser";
var PROP_SHOWBOARDMARKERS = "showboardmarkers";
var COLUMNNAME_ETYPE = "E. type";
var g_bPopupMode = false; //running as popup? (chrome browse action popup) REVIEW zig: cleanup, only reports need this?


var SYNCPROP_CARDPOPUPTYPE = "cardPopupType"; //one of CARDPOPUPTYPE
var SYNCPROP_ACTIVETIMER = "cardTimerActive";
var SYNCPROP_optAlwaysShowSpentChromeIcon = "bAlwaysShowSpentChromeIcon"; //"b" because it used to be a boolean
var SYNCPROP_bShowedFeatureSEButton = "bShowedFeatureSEButton";
var SYNCPROP_bStealthSEMode = "bStealthSEMode";
var SYNCPROP_language = "language";
var SYNCPROP_BOARD_DIMENSION = "board_dimension";
var SYNCPROP_GLOBALUSER = "global_user";
var SYNCPROP_KEYWORDS_HOME = "keywords_home";
var LOCALPROP_PRO_VERSION = "pro_enabled";
var SYNCPROP_MSLICHECK = "msLiCheck";
var SYNCPROP_LIDATA = "LiData";  //for chrome store {  msLastCheck, msCreated, li}
var SYNCPROP_LIDATA_STRIPE = "striLiData"; //for stripe { msLastCheck, msCreated, li, userTrello, emailOwner, quantity, nameCardOwner}
var SYNCPROP_SERVIEWS = "SERViews";  // see g_serViews
var SYNCPROP_MSSTARTPLUSUSAGE = "msStartPlusUsage";
var SYNCPROP_USERSEBAR_LAST = "userSEBarLast";
var SYNCPROP_NO_SE = "dontUseSE";
var SYNCPROP_NO_EST = "dontUseEst";
var LOCALPROP_EXTENSION_VERSIONSTORE = "chromeStoreExtensionVersion";

var g_bStealthSEMode = false; //stealth mode. Only applies when using google spreadsheet sync. use IsStealthMode()
var g_strServiceUrl = null; //null while not loaded. set to empty string or url NOTE initialized separately in content vs background
var SEKEYWORD_DEFAULT = "plus!";
var SEKEYWORD_LEGACY = "plus s/e";
var g_bEnableTrelloSync = false; //review zig this and g_bDisableSync must be initialized by caller (like loadSharedOptions)
var g_bDisableSync = false; // 'bDisabledSync' sync prop. note this takes precedence over bEnableTrelloSync or g_strServiceUrl 'serviceUrl'
var g_bCheckedTrelloSyncEnable = false; //review zig must be initialized by caller 
var g_hackPaddingTableSorter = "&nbsp;&nbsp;"; //because we remove many tablesorter css styles, appending spaces to header text was the easiest way to avoid overlap with sort arrow
var g_dateMinCommentSELegacy = new Date(2014, 11, 12);

function IsStealthMode() {
    return (!g_bDisableSync && g_bStealthSEMode && !g_optEnterSEByComment.IsEnabled() && g_strServiceUrl);
}

var g_optEnterSEByComment = {
    bInitialized: false,
    IsEnabled: function () { //note this doesnt take into account g_bDisableSync
        assert(this.bInitialized);
        assert(typeof g_bEnableTrelloSync !== "undefined");
        return (g_bEnableTrelloSync && this.bEnabled && this.rgKeywords.length > 0);
    },
    bEnabled: false,    //review zig: some use this directly because its not always equivalent to IsEnabled. clean up with another method or param in IsEnabled
    rgKeywords: [SEKEYWORD_DEFAULT],
    getAllKeywordsExceptLegacy: function () {
        var ret=[];
        var iMax=this.rgKeywords.length;
        for (var i = 0; i < iMax; i++) {
            var kw=this.rgKeywords[i];
            if (kw.toLowerCase() == SEKEYWORD_LEGACY)
                continue;
            ret.push(kw);
        }
        if (ret.length == 0)
            ret.push(SEKEYWORD_DEFAULT);
        return ret;
    },
    getDefaultKeyword: function() {
        assert(this.bInitialized);
        var ret = this.rgKeywords[0];
        if (!ret)
            ret = SEKEYWORD_DEFAULT;
        return ret.toLowerCase();
    },
    hasLegacyKeyword: function () {
        assert(this.bInitialized);
        var bFound = false;
        this.rgKeywords.every(function (keyword) {
            if (keyword.toLowerCase() == SEKEYWORD_LEGACY) {
                bFound = true;
                return false; //stop
            }
            return true; //continue
        });
        return bFound;
    },
    loadFromStrings: function (bEnabled, strKW) {
        this.bEnabled = bEnabled || false;
        this.rgKeywords = JSON.parse(strKW || "[]");
        if (this.rgKeywords.constructor !== Array || this.rgKeywords.length == 0)
            this.rgKeywords = [SEKEYWORD_DEFAULT]; //force always the default. array cant be empty.
        this.bInitialized = true;
    }
};


Array.prototype.appendArray = function (other_array) {
    other_array.forEach(function (v) { this.push(v); }, this);
};

//var g_rgiDayName = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
var g_rgiDayName = [null, null, null, null, null, null, null];
var g_rgiDayNameLong = [null, null, null, null, null, null, null];
function getWeekdayName(num, bLong) {
    var dateKnown;
    if (bLong) {
        if (!g_rgiDayNameLong[num]) {
            assert(num >= 0 && num <= 6);
            dateKnown = new Date(2016, 10, 6 + num, 12, 0, 0, 0); //midday of known sunday + delta, to avoid daylight-saving issues
            g_rgiDayNameLong[num] = dateKnown.toLocaleString(window.navigator.language, { weekday: 'long' });
        }
        return g_rgiDayNameLong[num];
    }
    if (!g_rgiDayName[num]) {
        assert(num >= 0 && num <= 6);
        dateKnown = new Date(2016, 10, 6+num, 12, 0, 0, 0); //midday of known sunday + delta, to avoid daylight-saving issues
        g_rgiDayName[num]=dateKnown.toLocaleString(window.navigator.language, { weekday: 'short' });
    }
    return g_rgiDayName[num];
}

var EVENTS = {
    NEW_ROWS: "newrows",
    START_SYNC: "startsync",
    DB_CHANGED: "dbchanged",
    FIRST_SYNC_RUNNING: "firstsyncrunning",
    EXTENSION_RESTARTING: "extensionRestarting"
};

var CARDPOPUPTYPE = {
    POPUP_NOACTIONS: "noactions",
    POPUP_SOMEACTIONS: "someactions",
    NO_POPUP: "nopopup",
    DEFAULT: "nopopup"
};


/* DowMapper
 *
 * handles mapping betwen a dow (day of week, 0=sunday, 1=monday, etc) to/from an ordering position (0 to 6)
 * the week starts with the day at position 0.
 *
 * getDowStart()
 * setDowStart(dow,delta)
 * posWeekFromDow(dow)
 * dowFromPosWeek(pos)
 *
 * Plus strategy for dealing with week numbers:
 * each HISTORY stores its week number, so its easier to query without worrying about producing the right week query. Without it its hard to deal correctly
 * with boundary weeks, for example week 53 of a given year might fall into the next year thus a query by year would crop the results.
 * Once the week number is stored, we need a way to  know what standard was used (week's start day) for the row. We dont keep that standard in browser storage because it wouldnt
 * be possible to atomically change a row and setting. Thus the setting is saved in a table GLOBALS which has a single row and a column 'dowStart'
 * Additionally, we keep in storage.sync the last dowStart the user configured, and during openDb it checks if the db needs converting.
 * By convension, only openDb from the content script will cause conversion. the other callers just use the db setting. In practice, unless there is a rare case of failure,
 * the sync setting and the db setting will be in sync. The sync setting has precedence and will continue attempting to make them in sync at the next openDb call (window refresh or new tab)
 *
 **/
var DowMapper = {
    //public:
    DOWSTART_DEFAULT:0, //sunday default
    getDowStart: function () { return this.m_dowStart; },   //set dow with position 0
    getDowDelta: function () { return this.m_dowDelta; },
    setDowStart: function (dow, delta) {
        assert(typeof(delta) !== "undefined");
        this.m_dowStart = dow;
        this.m_dowDelta = delta;
    }, //get dow with position 0
    posWeekFromDow: function (dow) {                        //position for a given dow
        var pos = dow - this.m_dowStart - this.m_dowDelta;
        if (pos < 0)
            pos = 14 + pos;
        pos = pos % 7;
        return pos;
    },
    dowFromPosWeek: function (pos) {                        //dow in given position
        var dowNew = pos + this.m_dowStart + this.m_dowDelta;
        if (dowNew < 0)
            dowNew = 14 + dowNew;
        dowNew = dowNew % 7;
    return dowNew;
    },
    
    //------------------------------------------
    //private:
    init: function () {        
        //initialize the object. see http://stackoverflow.com/questions/4616202/self-references-in-object-literal-declarations
        this.m_dowStart = this.DOWSTART_DEFAULT;
        this.m_dowDelta = 0;
        delete this.init; //dont call me back again
        return this;
    }
}.init();

function loadSharedOptions(callback) {
    var keyAcceptSFT = "bAcceptSFT";
    var keyAcceptPFTLegacy = "bAcceptPFTLegacy";
    var keybEnableTrelloSync = "bEnableTrelloSync";
    var keybDisabledSync = "bDisabledSync"; //note this takes precedence over bEnableTrelloSync or g_strServiceUrl 'serviceUrl'
    var keybEnterSEByCardComments = "bEnterSEByCardComments";
    var keyrgKeywordsforSECardComment = "rgKWFCC";
    var keyUnits = "units";
    var keybDontShowTimerPopups = "bDontShowTimerPopups";
    var keyServiceUrl = 'serviceUrl';

    assert(typeof SYNCPROP_optAlwaysShowSpentChromeIcon  !== "undefined");
    //review zig: app.js has duplicate code for this
    chrome.storage.sync.get([SYNCPROP_NO_EST, SYNCPROP_NO_SE, SYNCPROP_MSSTARTPLUSUSAGE, keyServiceUrl, SYNCPROP_bStealthSEMode, SYNCPROP_language, keybDontShowTimerPopups, keyUnits, SYNCPROP_optAlwaysShowSpentChromeIcon, keyAcceptSFT, keybEnableTrelloSync, keybEnterSEByCardComments,
                            keyrgKeywordsforSECardComment, keybDisabledSync],
                             function (objSync) {
                                 if (chrome.runtime.lastError) {
                                     alert(chrome.runtime.lastError.message);
                                     return;
                                 }
                                 g_strServiceUrl = objSync[keyServiceUrl]; //note: its still called serviceUrl even though now stores a sheet url (used to store a backend url in 2011)
                                 if (g_strServiceUrl === undefined || g_strServiceUrl == null)
                                     g_strServiceUrl = ""; //means simple trello. (do the same as in content script)
                                 g_msStartPlusUsage = objSync[SYNCPROP_MSSTARTPLUSUSAGE] || null;
                                 if (g_msStartPlusUsage == null) {
                                     g_msStartPlusUsage = Date.now();
                                     chrome.storage.sync.set({ [SYNCPROP_MSSTARTPLUSUSAGE]: g_msStartPlusUsage });
                                 }
                                 g_bDontShowTimerPopups = objSync[keybDontShowTimerPopups] || false;
                                 UNITS.current = objSync[keyUnits] || UNITS.current;
                                 setOptAlwaysShowSpentChromeIcon(objSync[SYNCPROP_optAlwaysShowSpentChromeIcon]);
                                 g_bAcceptSFT = objSync[keyAcceptSFT];
                                 if (g_bAcceptSFT === undefined)
                                     g_bAcceptSFT = true;

                                 g_bAcceptPFTLegacy = objSync[keyAcceptPFTLegacy];
                                 if (g_bAcceptPFTLegacy === undefined)
                                     g_bAcceptPFTLegacy = true; //defaults to true to not break legacy users

                                 g_bEnableTrelloSync = objSync[keybEnableTrelloSync] || false;
                                 g_optEnterSEByComment.loadFromStrings(objSync[keybEnterSEByCardComments], objSync[keyrgKeywordsforSECardComment]);
                                 g_bDisableSync = objSync[keybDisabledSync] || false;
                                 g_bStealthSEMode = (objSync[SYNCPROP_bStealthSEMode] && g_strServiceUrl && !g_bDisableSync) ? true : false;
                                 g_language = objSync[SYNCPROP_language] || "en";

                                 g_bNoSE = objSync[SYNCPROP_NO_SE] || false;
                                 g_bNoEst = objSync[SYNCPROP_NO_EST] || false;

                                 chrome.storage.local.get([PROP_TRELLOUSER, LOCALPROP_PRO_VERSION], function (obj) {
                                     if (chrome.runtime.lastError) {
                                         alert(chrome.runtime.lastError.message);
                                         return;
                                     }
                                     g_userTrelloBackground = (obj[PROP_TRELLOUSER] || null);
                                     g_bProVersion = obj[LOCALPROP_PRO_VERSION] || false;
                                     callback();
                                 });
                             });
}

function errFromXhr(xhr) {
    var errText = "error: " + xhr.status;
    if (xhr.statusText || xhr.responseText) {
        g_bIncreaseLogging = true;
        errText = errText + "\n" + xhr.statusText + "\n" + xhr.responseText;
    }
    else if (xhr.status == 0)
        errText = Language.NOINTERNETCONNECTION;
    console.log(errText);
    return errText;
}

function assert(condition, message) {
    if (!condition) {
        g_bIncreaseLogging = true;
		var log = "Assertion failed. ";
		if (message)
			log += message;
		logPlusError(log);
		debugger;
		if (g_callbackOnAssert)
		    g_callbackOnAssert(log);
        throw new Error(log);
	}
}

function saveAsFile(data, filename, bForceSave) {
    if (!bForceSave && !g_bDebuggingInfo)
        return;

    if (!filename)
        filename = 'console.json';

        if (typeof data === "object") {
            data = JSON.stringify(data, undefined, 4);
        }

        var blob = new Blob([data], { type: 'text/json' }),
            e = document.createEvent('MouseEvents'),
            a = document.createElement('a');

        a.download = filename;
        a.href = window.URL.createObjectURL(blob);
        a.dataset.downloadurl = ['text/json', a.download, a.href].join(':');
        e.initMouseEvent('click', true, false, window, 0, 0, 0, 0, 0, false, false, false, false, 0, null);
        a.dispatchEvent(e);
    }

// ETYPE
// stored in HISTORY.eType
// indicates the estimate action on the card (by card by user)
var ETYPE_NONE = 0;
var ETYPE_INCR = 1;
var ETYPE_DECR = -1;
var ETYPE_NEW = 2;


function nameFromEType(eType) {
	if (eType == ETYPE_NONE)
		return "";

	if (eType == ETYPE_INCR)
		return "+E";

	if (eType == ETYPE_DECR)
		return "-E";

	if (eType == ETYPE_NEW)
		return "NEW";
}

function buildSyncErrorTooltip(status) {
	var ret = "";
    if (status) {
        
        if (status.statusRead && status.statusRead != STATUS_OK)
            ret = ret + "\nLast sync read error:\n" + status.statusRead;
        if (status.statusWrite && status.statusWrite != STATUS_OK)
            ret = ret + "\nLast sync write error:\n" + status.statusWrite;
    }
    if (ret.length > 0)
        ret = ret + "\n";
    return ret;
}


//openPlusDb
//
//wrapper for openDB message. initializes global options
function openPlusDb(sendResponse, options) {
    sendExtensionMessage({ method: "openDB", options: options },
			function (response) {
			    if (response.dowStart !== undefined) {
			        assert(response.dowDelta !== undefined);
			        DowMapper.setDowStart(response.dowStart, response.dowDelta);
			    }
			    sendResponse(response);
			});
}



function bAtTrelloHome() {
    var url = document.URL.toLowerCase();
    if (url != "https://trello.com/" && url != "https://trello.com/#")
        return false;
    return true;
}

function CreateWaiter(cTasks, callback) {
    var waiter = {

        Init: function (cTasks, callback) {
            assert(this.cTasksPending == 0);
            this.cTasksPending = cTasks;
            this.OnFinish = callback;
            return this;
        },

        Increase: function (prop) { //prop: optional to prevent multiple calls with the same prop from increasing
            if (prop) {
                if (this.mapProps[prop])
                    return;
                this.mapProps[prop] = true;
            }
            this.cTasksPending++;
        },

        SetCount: function (cTasks) {
            assert(this.cTasksPending == 0);
            this.cTasksPending = cTasks;
        },
        Decrease: function (prop) { //prop: optional to prevent multiple calls with the same prop from decreasing
            if (prop) {
                if (this.mapProps[prop])
                    return;
                this.mapProps[prop] = true;
            }
            this.cTasksPending--;
            if (this.bWaiting && this.cTasksPending == 0)
                this.OnFinish();
        },
        SetWaiting: function (bWaiting) {
            this.bWaiting = bWaiting;
            if (this.bWaiting && this.cTasksPending == 0)
                this.OnFinish();
        },
        bWaiting: false,
        cTasksPending: 0,
        mapProps: {}
    }.Init(cTasks, callback);

    return waiter;
}


function getUrlParams(href) {
    if (!href)
        href = window.location.href;
	var iParams = href.indexOf("?");
	var objRet = {};
	if (iParams < 0)
		return objRet;
	var strParams = href.substring(iParams + 1);
	var params = strParams.split("&");
	var i = 0;
	for (i = 0; i < params.length; i++) {
		var pair = params[i].split("=");
		objRet[pair[0]] = decodeURIComponent(pair[1]);
	}
	return objRet;
}


/* strTruncate
 *
 * truncates a string if larger than length, returns a string at most of length+3
 **/
function strTruncate(str, length) {
	if (length === undefined)
		length = g_cchTruncateDefault;
	if (typeof (str) != 'string')
		str = "" + str;
	if (str.length > length)
		str = str.substr(0, length) + "...";
	return str;
}

function sendExtensionMessage(obj, responseParam, bRethrow) {

   
    function preResponse(response) {
        try {
            if (response && response.bExtensionNotLoadedOK)
                return; //safer to not respond

            if (chrome.runtime.lastError) //could happen on error connecting to the extension. that case response can even be undefined https://developer.chrome.com/extensions/runtime#method-sendMessage
                throw new Error(chrome.runtime.lastError.message);

            if (responseParam)
                responseParam(response);
        } catch (e) {
            logException(e);
        }
    }

    try {
        //sending a message from bk to bk doesnt work, so do it manually
        if (g_bFromBackground && chrome.runtime && chrome.runtime.getBackgroundPage) {
            chrome.runtime.getBackgroundPage(function (bkPage) {
                try {
                    bkPage.handleExtensionMessage(obj, preResponse);
                } catch (e) {
                    logException(e);
                }
            });
            return;
        }

        chrome.runtime.sendMessage(obj, preResponse);
	} catch (e) {
		logException(e);
		if (bRethrow)
			throw e;
	}
}

function logException(e, str) {
	if (str && str != e.message)
		str = str + "," + e.message;
	else
		str = e.message;
	logPlusError(str + " :: " + e.stack, false);
}

function sendDesktopNotification(strNotif, timeout, idUse) {
    if (timeout === undefined)
        timeout = 7000;

    sendExtensionMessage({ method: "showDesktopNotification", notification: strNotif, timeout: timeout, idUse: idUse }, function (response) { });
}

var g_plusLogMessages = []; //queues an error log which is regularly purged
var g_lastLogPush = null;
var g_lastLogError = "";

function bIgnoreError(str) {
    return (str.indexOf("Error connecting to extension") >= 0 || str.indexOf("Invocation of form runtime")>=0);
}

//logPlusError
// bAddStackTrace: defaults to true.
//
function logPlusError(str, bAddStackTrace) {
    str = str || ""; //handle possible undefined
    if (bIgnoreError(str))
        return;

    if (str.indexOf("disconnected port") >= 0 || str.indexOf("port closed") >= 0)
        return; //sometimes we dont return from a received message. that seems ok

    g_bIncreaseLogging = true;
	var strStack = null;
	var date = new Date();
	if (bAddStackTrace === undefined)
		bAddStackTrace = true;
	if (bAddStackTrace) {
		try {
			throw new Error();
		} catch (e) {
		    str = str + " :: " + e.stack;
            //remove self/known callstack elements, and remove column from each line number
		    str = str.replace(/\n\s*(at logPlusError).*\n/, "\n").replace(/\n\s*(at assert).*\n/, "\n").replace(/:\d\)/g, ")");
		    //remove absolute paths
		    str = str.replace(/chrome-extension:\/\/.*\//g, "");
		}
	}
	g_lastLogError = str;
	console.log(str);

	if (typeof g_userTrelloCurrent != "undefined") {
	    if (g_userTrelloCurrent && (g_userTrelloCurrent == "zmandel" || g_userTrelloCurrent == "zigmandel")) {
	        if (typeof document != "undefined" && typeof PLUS_BACKGROUND_CALLER == "undefined")
	            console.dir(document.body);
	        //hi to me
	        if (str)
	            alert(str);
	    }
	}

	var pushData = { date: date.getTime(), message: str };
	if (!(g_lastLogPush != null && (pushData.date - g_lastLogPush.date < 1000 * 60) && pushData.message == g_lastLogPush.message)) {
	    g_lastLogPush = pushData;
	    g_plusLogMessages.push(pushData);
	    setTimeout(function () { //get out of the current callstack which could be inside a db transaction etc
	        if (g_callbackPostLogMessage)
	            g_callbackPostLogMessage();
	    }, 2000);
	}
}

/* setCallbackPostLogMessage
 * must be called once if you want to commit messages to the db
 * will cause a commit one call to push a message (errors etc), plus will attempt commit every minute
 **/
var g_intervalCallbackPostLogMessage = null;
var g_callbackPostLogMessage = null;

function setCallbackPostLogMessage(callback) {
	g_callbackPostLogMessage = callback;
	if (g_intervalCallbackPostLogMessage)
		clearInterval(g_intervalCallbackPostLogMessage);
	//note: callers expect this interval, dont change it.
	g_intervalCallbackPostLogMessage = setInterval(function () {
		callback();
	}, 60000);
}

/* getSQLReportShared supports Promises or callbacks 
 * when okCallback is not set, it will use promises (ignoring errorCallback even if set)
 * when okCallback is set, it uses callbacks (okCallback and errorCallback if set)
 **/
function getSQLReportShared(sql, values, okCallback, errorCallback) {

    var promise = null;
    var resolveFn = null; //these are used so we can use promises or callbacks
    var rejectFn = null;

    function sendResponse(response) {
        if (response.status != STATUS_OK) {
            if (rejectFn) {
                rejectFn(new Error(response.status));
                return;
            }
            if (errorCallback && !resolveFn)
                errorCallback(response.status);
            return; //dont call  okCallback
        }
        if (resolveFn) {
            resolveFn(response);
            return;
        }
        okCallback(response);
    }

    if (!okCallback) {
        assert(window.Promise);
        promise = new Promise(doit);
        return promise;
    }

    function doit(resolve, reject) {
        resolveFn = resolve;
        rejectFn = reject;
        var obj = { method: "getReport", sql: sql, values: values };
        if (chrome && chrome.runtime && chrome.runtime.getBackgroundPage) { //calling directly background (vs using a message) should be more efficient and allow bigger returned tables
            chrome.runtime.getBackgroundPage(function (bkPage) {
                bkPage.handleGetReport(obj, sendResponse);
            });
        }
        else {
            sendExtensionMessage(obj, sendResponse);
        }
    }

    doit();
    return null; //happy lint
}



function selectElementContents(el) {
    if (window.getSelection && document.createRange) {
		//select it just for visual purposes. Extension background will do the actual copy
		var sel = window.getSelection();
		var range = document.createRange();
		range.selectNodeContents(el);
		sel.removeAllRanges();
		sel.addRange(range);

		sendExtensionMessage({ method: "copyToClipboard", html: el.innerHTML }, function (response) {
		    if (response.status != STATUS_OK) {
		        sendDesktopNotification(response.status || "Error");
		        return;
		    }
			setTimeout(function () {
			    removeSelection();
			    sendDesktopNotification("Copied to the clipboard.\nPaste anywhere like excel or email.");
			}, 100); //delay is for user visuals only
		});
	}
}

function removeSelection() {
	if (window.getSelection && document.createRange) {
		var sel = window.getSelection();
		sel.removeAllRanges();
	}
}

function prependZero(num) {
    assert(typeof num == "number");
    return (num < 10 ? "0" + num : num);
}


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


function addSumToRows(bModifyRows, rows, prefix) {
	prefix = prefix || "";
	var mapRet = {};
	var iRow = 0;
	for (; iRow < rows.length; iRow++) {
		var sum = 0;
		var row = rows[iRow];
		var iCol = 1;
		for (; iCol < row.length; iCol++)
			sum += row[iCol];
		sum = parseFixedFloat(sum);
		if (bModifyRows)
			row[0] = prefix + sum + " " + row[0];
		else
			mapRet[row[0]] = sum;
	}
	return mapRet;
}

function getDrilldownTopButtons(bNoClose, title) {
	bNoClose = bNoClose || false;

	var ret = '<div style="padding-bottom:3px;"><p class="agile_drilldown_h"><span>' + title + "</span><span class='agile_selection_totals'></span></p>";
	if (!bNoClose)
		ret += '<img class="agile_help_close_drilldown"></img>';
	ret += '<img class="agile_drilldown_select"></img></div>';
	return ret;
}

function getHtmlBurndownTooltipFromRows(bShowTotals, rows, bReverse, header, callbackGetRowData, bOnlyTable, title, bSEColumns) {
	bOnlyTable = bOnlyTable || false;
	if (title === undefined)
		title = "Plus Drill-down";

	var iColComment = -1;
	function th(val, bExtend) {
		return "<th class='agile_drill_th" + (bExtend ? " agile_drill_th_extend" : "") + "'>" + val + "</th>";
	}

	function htmlRow(row) {

	    function td(val, bNoTruncate, type) {
	        var classesTd = "agile_cell_drilldown";
	        if (type) {
	            classesTd += " agile_cell_drilldown" + type;  //used for agile_cell_drilldownS and agile_cell_drilldownE classes
	            if (val === 0) {
	                //review zig: assumes type is always an s/e type
	                classesTd += " agile_reportSECellZero";
	            }
	        }
	        if (val === "")
	            val = "&nbsp;";  //prevent tables with all empty fields (Bad height)
			return "<td class='"+classesTd+ "'>" + (bNoTruncate ? val : strTruncate(val)) + "</td>";
		}

		var tds = callbackGetRowData(row);
		if (!tds || tds.length == 0)
			return "";
		var strPost = "";
		if (tds.title && tds.title != "")
		    strPost = " title='" + tds.title + "'";
		var strClassRow = "agile-drilldown-row";

		if (row.bSelectedRow)
		    strClassRow = strClassRow + " agile-drilldown-row-toggle";

		if (iColComment >= 0 && tds.length > iColComment) {
		    var commentLow = tds[iColComment].name.toLowerCase();
		    if (commentLow.indexOf(PREFIX_ERROR_SE_COMMENT) >= 0)
		        strClassRow = strClassRow + " agile-drilldown-row-error";
		    else if (commentLow.indexOf(PREFIX_COMMAND_SE_RESETCOMMAND) >= 0)
		        strClassRow = strClassRow + " agile-drilldown-row-command";
		}
		var html = "<tr class='"+strClassRow+"'" + strPost + ">";
		var iCol = 0;
		for (; iCol < tds.length; iCol++) {
		    html = html + td(tds[iCol].name, tds[iCol].bNoTruncate, tds[iCol].type);
		}
		html = html + "</tr>";
		return html;
	}


	var htmlTop = '';

	if (!bOnlyTable) {
	    htmlTop = htmlTop + '<div class="agile_tooltipContainer agile_arrow_opened agile_almostTopmost1">';
	}
	
	var html = "";
	if (bOnlyTable)
		html='<div class="agile_tooltip_scroller" tabindex="0">';
	else
		html='<div class="agile_tooltip_scroller agile_tooltip_scroller_Short" tabindex="0">';

	html=html+('<table class="agile_tooltipTable tablesorter">');
	html=html+('<thead><tr class="agile-drilldown-header">');
	var iHeader = 0;
	var bExtended = false;
	for (; iHeader < header.length; iHeader++) {
		var bExtendCur = header[iHeader].bExtend;
		if (bExtendCur)
			bExtended = true;
		if (!bExtended && iHeader == (header.length - 1))
		    bExtendCur = true;
		var nameCol = header[iHeader].name;
		if (nameCol.toLowerCase() == "note")
		    iColComment = iHeader;
		html=html+(th(nameCol + g_hackPaddingTableSorter, bExtendCur)); //nbsp hack so tablesorter arrows dont overlap name
	}
	html=html+('</tr></thead><tbody>');
	var sTotal = 0;
	var eTotal = 0;
	var eFirstTotal = 0;
	var bUseEFirst = false;
	var row = null;
	var i;

	if (bReverse) {
	    for (i = rows.length - 1; i >= 0; i--) {
			row = rows[i];
			html=html+(htmlRow(row));
			sTotal += row.spent;
			eTotal += row.est;
			if (row.estFirst) {
			    eFirstTotal += row.estFirst;
			    bUseEFirst = true;
			}
		}
	} else {
	    for (i = 0; i < rows.length; i++) {
			row = rows[i];
			html=html+(htmlRow(row));
			sTotal += row.spent;
			eTotal += row.est;
			if (row.estFirst) {
			    eFirstTotal += row.estFirst;
			    bUseEFirst = true;
            }
		}
	}

	if (g_bNoEst)
	    bUseEFirst = false;

	html=html+('</tbody></table>&nbsp<br />'); //extra line fixes table copy, otherwise bottom-right cell loses background color in pasted table.
	html=html+('</DIV>');
	if (!bOnlyTable)
		html=html+('</DIV>');
	if (bShowTotals) {
	    var sep = "<span class='agile_lighterText'>:</span>";
	    title += ("&nbsp;" + rows.length + " rows&nbsp;");
	    if (bSEColumns && !g_bNoSE) {
	        title += "&nbsp;&nbsp;S" + sep + parseFixedFloat(sTotal);
	        if (!g_bNoEst) {
	            title += (
            (bUseEFirst ? "&nbsp;&nbsp;&nbsp;&nbspE 1ˢᵗ" + sep + parseFixedFloat(eFirstTotal) : "") +
            "&nbsp;&nbsp;&nbsp;&nbspE" + sep + parseFixedFloat(eTotal) + "&nbsp;&nbsp;");
	            title += "&nbsp;&nbspR" + sep + parseFixedFloat(eTotal - sTotal);
	        }
	    }
	}
	htmlTop += getDrilldownTopButtons(bOnlyTable, title);
	return htmlTop+html;
}

function setScrollerHeight(heightWindow, scroller, elemTop, dyTop, bAdjustBody) {
	if (elemTop.length == 0)
		return;
	var position = elemTop.offset();
	dyTop = dyTop || 0;
	bAdjustBody = bAdjustBody || false;
	//NOTE: heightWindow is passed and not calculated here because in some cases (tab show/hide) body height changed after showing elements.
	var height = heightWindow - position.top - dyTop; //review zig: redo scroller stuff
	if ($("#reportBottomMessage").is(":visible"))
	    height = height - 40;
	if (height < 100) //minimum size
		height = 100;
	
	if (!bAdjustBody)
		scroller.css("height", height-7); //7 is to prevent scrollbar in case some plattform calcs are off by a few pixels
}

function updateSelectedReportTotals() {
    var container = $(".agile_topLevelTooltipContainer");
    var selected = container.find(".agile-drilldown-row-toggle");
    var iSelected = 0;
    var sCur = 0;
    var eCur = 0;
    var bAdded = false; //simple way of not showing selected s/e when not present (sort by R for example)
    for (; iSelected < selected.length; iSelected++) {
        var children = selected.eq(iSelected).children("td");
        var iChildren = 0;
        for (; iChildren < children.length; iChildren++) {
            var childCur = children.eq(iChildren);
            if (childCur.hasClass("agile_cell_drilldownS")) {
                sCur += parseFloat(childCur.text());
                bAdded = true;

            }
            else if (childCur.hasClass("agile_cell_drilldownE")) {
                eCur += parseFloat(childCur.text());
                bAdded = true;
            }
        }
    }
    if (selected.length > 0)
        $(".agile_selection_totals").html((g_bPopupMode ? "<br />" : "") + "&nbsp;" + selected.length + " Selected "+ (g_bNoSE?"": "&nbsp;&nbsp;S:" + parseFixedFloat(sCur) + "&nbsp;&nbsp;") + (g_bNoSE || g_bNoEst? "" : "&nbsp;&nbsp;E:" + parseFixedFloat(eCur) + "&nbsp;&nbsp;&nbsp;&nbsp;R:" + parseFixedFloat(eCur - sCur)));
    else
        $(".agile_selection_totals").empty();
}

function makeReportContainer(html, widthWindow, bOnlyTable, elemParent, bNoScroll) {
	bNoScroll = bNoScroll || bOnlyTable;
	var container = $(".agile_topLevelTooltipContainer");
	bOnlyTable = bOnlyTable || false;

	if (container.length == 0)
	    container = $("<div class='agile_topLevelTooltipContainer notranslate'></div>");
	container.empty();
	container[0].innerHTML = html;
	var tooltip = null;
	var scroller = container.find(".agile_tooltip_scroller");
	//if (bNoScroll)
	//	scroller.addClass("agile_tooltip_scroller_noScroll");

	if (!bOnlyTable) {
		tooltip = container.find(".agile_tooltipContainer");
		tooltip.css("width", widthWindow);
		var marginLeft = 0;
		if (widthWindow < $(window).width())
			marginLeft = -Math.round(widthWindow / 2);
		else {
			tooltip.addClass("agile_tooltipContainerAbsolute");
		}
		tooltip.css("margin-left", marginLeft + "px");
	} else {
		//review zig: since html is not yet created inside we cant get the actual scroller.
		//instead it gets the element above and hardcodes its height (30) to substract. fix it.
		setScrollerHeight( window.innerHeight,scroller, $(".agile_report_container"), g_bPopupMode ? 0 : 30); //review zig why special popup
		}

	//use addEventListener to avoid placing a handler on each individual TR
	container[0].addEventListener('click',
	  function (ev) {
	      var bRet = true;
	      var t = $(ev.target);
	      if (t.is("a") && (t.prop("target")=="_blank" || (ev.ctrlKey || ev.shiftKey))) {
	          var url = t.prop("href");
	          var idCard = getIdCardFromUrl(url);
	          if (idCard) {
	              sendExtensionMessage({ method: "openCardWindow", idCard: idCard, position: { x: ev.screenX, y: ev.screenY }, bForceTab: ev.ctrlKey || ev.shiftKey }, function (response) { });
	              ev.preventDefault();
	              bRet= false;
	          } else {
	              var idBoard = getIdBoardFromUrl(url);
	              if (idBoard) {
	                  sendExtensionMessage({ method: "openBoardWindow", idBoard: idBoard }, function (response) { });
	                  ev.preventDefault();
	                  bRet = false;
	              }
	          }
	      }
	      var elemThis = t.closest('TR');
	      if (elemThis.children("th").length == 0) {

	          if (elemThis.hasClass("agile-drilldown-row-toggle"))
	              elemThis.removeClass("agile-drilldown-row-toggle");
	          else
	              elemThis.addClass("agile-drilldown-row-toggle");

	          updateSelectedReportTotals();
	      }
	      return bRet;
	  }, false);

	container.hide();
	if (!elemParent)
		elemParent = $('body');
	elemParent.append(container);
	container.show();
	if (true) {
		if (!bOnlyTable)
			scroller.focus();
		function checkRemoveContainer(e) {
			if (e.keyCode == 27)  // esc
				container.remove();
		}

		container.find(".agile_tooltipTable").keyup(checkRemoveContainer);
		if (tooltip)
			tooltip.keyup(checkRemoveContainer);
	}

	var copyWindow = container.find(".agile_drilldown_select");
	var attrTitle = null;

	if (!bOnlyTable) {
		var header = container.find($(".agile_drilldown_h"));
		header.css("cursor","pointer");
		header.click(function () {
			handleSectionSlide(tooltip, scroller, widthWindow, copyWindow);
		});
		var btnClose = container.find($(".agile_help_close_drilldown"));
		attrTitle = btnClose.attr("title");
		if (attrTitle)
			return container;
		btnClose.attr("src", chrome.extension.getURL("images/close.png"));
		btnClose.attr("title", "Click or ESC to close.");
		if (btnClose.length > 0) {
			btnClose.click(function () {
				container.remove();
			});
		}
	}

	if (copyWindow.length > 0) {
		attrTitle = copyWindow.attr("title");
		if (attrTitle)
			return container;
		copyWindow.attr("src", chrome.extension.getURL("images/copy.png"));
		copyWindow.attr("title", "Copy the table to the clipboard, then paste in a spreadsheet, an email etc.");
		copyWindow.click(function () {
			var table = container.find(".agile_tooltip_scroller");
			selectElementContents(table[0]);
		});
	}

	if (!bOnlyTable)
		scroller.scrollview();
	return container;
}

function handleDrilldownWindow(chart, drilldowns, htmlFromRows, colExclude, widthWindow, bReverse) {
	bReverse = bReverse || false;
	var selection = chart.getSelection()[0];
	var html = htmlFromRows(drilldowns[selection.row][selection.column], bReverse, colExclude, { row: selection.row, col: selection.column });
	var container = makeReportContainer(html, widthWindow);
}

function handleSectionSlide(section, content, widthOpen, elemShowHide, callbackDone) {
    var step = 250;
	var bOpened = (section.hasClass("agile_arrow_opened"));
	if (!bOpened && widthOpen) { //doing width before the toggle looks better and avoids a chrome paint bug
		section.css("width", widthOpen);
		if (elemShowHide)
			elemShowHide.show();
	}

	if (!bOpened)
	    content.show();
	else
	    content.hide();
	content.css("opacity", bOpened ? "0" : "1");
if (bOpened) {
			section.removeClass("agile_arrow_opened");
			section.addClass("agile_arrow_closed");
			if (elemShowHide)
			    elemShowHide.hide();
			if (widthOpen)
			    section.css("width", "auto");
		} else {
			section.removeClass("agile_arrow_closed");
			section.addClass("agile_arrow_opened");
		}

		if (callbackDone)
		    callbackDone();
}

/**
 * Modified ScrollView - jQuery plugin 0.1
 * 
 * from https://code.google.com/p/jquery-scrollview/
 * This plugin supplies contents view by grab and drag scroll.
 *
 * Copyright (c) 2009 Toshimitsu Takahashi
 *
 * Released under the MIT license.
 *
 * == Usage =======================
 *   // apply to block element.
 *   $("#map").scrollview();
 *   
 *   // with setting grab and drag icon urls.
 *   //   grab: the cursor when mouse button is up.
 *   //   grabbing: the cursor when mouse button is down.
 *   //
 *   $("#map".scrollview({
 *	 grab : "images/openhand.cur",
 *	 grabbing : "images/closedhand.cur"
 *   });
 * ================================
 */
if (typeof jQuery !== 'undefined') {
	(function () {
		function ScrollView() { this.initialize.apply(this, arguments); }
		ScrollView.prototype = {
			initialize: function (container, config) {
				// setting cursor.
				var gecko = navigator.userAgent.indexOf("Gecko/") != -1;
				var opera = navigator.userAgent.indexOf("Opera/") != -1;
				var mac = navigator.userAgent.indexOf("Mac OS") != -1;
				if (opera) {
					this.grab = "default";
					this.grabbing = "move";
				} else if (!(mac && gecko) && config) {
					if (config.grab) {
						this.grab = "url(\"" + config.grab + "\"),default";
					}
					if (config.grabbing) {
						this.grabbing = "url(" + config.grabbing + "),move";
					}
				} else if (gecko) {
					this.grab = "-moz-grab";
					this.grabbing = "-moz-grabbing";
				} else {
					this.grab = "default";
					this.grabbing = "ns-resize";
				}

				// Get container and image.
				this.m = $(container);
				this.i = this.m.children().css("cursor", this.grab);

				this.isgrabbing = false;

				// Set mouse events.
				var self = this;
				setTimeout(function () {
					self.i.mousedown(function (e) {
						if (self.isgrabbing) return true;
						self.startgrab();
						self.xp = e.pageX;
						self.yp = e.pageY;
						return false;
					}).mousemove(function (e) {
						if (!self.isgrabbing) return true;
						self.scrollTo(self.xp - e.pageX, self.yp - e.pageY);
						self.xp = e.pageX;
						self.yp = e.pageY;
						return false;
					}).
					mouseup(function () { self.stopgrab(); }).
					dblclick(function () {
						var _m = self.m;
						var off = _m.offset();
						var dy = _m.height() - 11;
						if (dy < 0) {
							dy = "+=" + dy + "px";
						} else {
							dy = "-=" + -dy + "px";
						}
						_m.animate({ scrollLeft: 0, scrollTop: dy },
								"normal", "swing");
					});
					//self.centering();
				}, 50);

			},
			centering: function () {
				var _m = this.m;
				var w = this.i.width() - _m.width();
				var h = this.i.height() - _m.height();
				_m.scrollLeft(w / 2).scrollTop(h / 2);
			},
			startgrab: function () {
				if (this.isgrabbing) return;
				this.isgrabbing = true;
				this.i.css("cursor", this.grabbing);
			},
			stopgrab: function () {
				if (!this.isgrabbing) return;
				this.isgrabbing = false;
				this.i.css("cursor", this.grab);
			},
			scrollTo: function (dx, dy) {
				var _m = this.m;
				var x = _m.scrollLeft() + dx;
				var y = _m.scrollTop() + dy;
				_m.scrollLeft(x).scrollTop(y);
			}
		};

		jQuery.fn.scrollview = function (config) {
			return this.each(function () {
				new ScrollView(this, config);
			});
		};
	})(jQuery);
}

function setPopupClickHandler(elem, url) {

    function create(ev) {
        var idCard = getIdCardFromUrl(url);
        if (idCard) {
            sendExtensionMessage({ method: "openCardWindow", idCard: idCard, bForceTab: (ev && (ev.ctrlKey || ev.shiftKey)) }, function (response) { });
            return;
        } else {
            var idBoard = getIdBoardFromUrl(url);
            if (idBoard) {
                sendExtensionMessage({ method: "openBoardWindow", idBoard: idBoard }, function (response) { });
                return;
            }
        }
        chrome.tabs.create({ url: url });
    }

    elem.click(function (event) {
        event.preventDefault();
        create(event);
		return false;
	});
	elem.keypress(function (event) {
		var keycode = (event.keyCode ? event.keyCode : event.which);
		if (keycode == '13') { //enter key
		    create(event);
			return false;
		}
	});
}

//msTime 0 or undefined will use 1500
function hiliteOnce(elem,msTime, strClass, count) {
	var classBlink = (strClass ? strClass : "agile_box_input_hilite");
	msTime = msTime || 1500;
	elem.addClass(classBlink);
	setTimeout(function () {
	    elem.removeClass(classBlink);
	    if (count && count>1) {
	        setTimeout(function () {
	            hiliteOnce(elem, msTime, strClass, count - 1);
	        }, msTime);
	    }
	}, msTime);
}


/* cloneObject
 *
 * simple clone for serializable objects
 **/
function cloneObject(obj) {
	return JSON.parse(JSON.stringify(obj));
}


function getCurrentMonthFormatted(date) {
    return (date.getFullYear() + "-" + getWithZeroPrefix(date.getMonth() + 1));
}

var g_weekNumUse = null; //"2015-W05"; //set for testing only

function getCurrentWeekNum(date, dowStartOpt, dowDeltaOpt) {
	if (date === undefined) {
		if (g_weekNumUse != null)
			return g_weekNumUse; //default week num, from plus header week selector
		date = new Date();
	}
   
	if (dowStartOpt === undefined)
	    dowStartOpt = DowMapper.getDowStart();
	if (dowDeltaOpt === undefined)
	    dowDeltaOpt = DowMapper.getDowDelta();
	if (dowDeltaOpt != 0) {
	    date = new Date(date.getTime()); //clone
	    date.setDate(date.getDate() - dowDeltaOpt);
	}
	var weeknum = getWeekNumCalc(date, dowStartOpt); //week starts at g_dowStart (0=sunday)
	var year = date.getFullYear();
	var month = date.getMonth();
	if (weeknum == 1 && month == 11)
		year++; //week  belongs to next year
	else if (month == 0 && weeknum >= 50)
		year--;

	weeknum = getWithZeroPrefix(weeknum);

	return "" + year + "-W" + weeknum; //"2013-W50"
}

function getWeekNumCalc(dateIn, dowOffset) {
	//developed by Nick Baicoianu at MeanFreePath: http://www.epoch-calendar.com
    //review dom: doesnt support schemes where 1st jan must be in week1 (like arabic saturday start)
    dowOffset = typeof (dowOffset) == 'number' ? dowOffset : 0; //default dowOffset to zero (sunday)
    if (false) {
        if (dowOffset == 6)
            dateIn.setDate(dateIn.getDate() + 7);
    }
	var newYear = new Date(dateIn.getFullYear(), 0, 1);
	var day = newYear.getDay() - dowOffset; //the day of week the year begins on
	day = (day >= 0 ? day : day + 7);
	var daynum = Math.floor((dateIn.getTime() - newYear.getTime() -
	(dateIn.getTimezoneOffset() - newYear.getTimezoneOffset()) * 60000) / 86400000) + 1;
	var weeknum;
	//if the year starts before the middle of a week
	if (day < 4) {
		weeknum = Math.floor((daynum + day - 1) / 7) + 1;
		if (weeknum > 52) {
			nYear = new Date(dateIn.getFullYear() + 1, 0, 1);
			nday = nYear.getDay() - dowOffset;
			nday = nday >= 0 ? nday : nday + 7;
			/*if the next year starts before the middle of
 			  the week, it is week #1 of that year*/
			weeknum = nday < 4 ? 1 : 53;
		}
	}
	else {
		weeknum = Math.floor((daynum + day - 1) / 7);
	}
	if (weeknum == 0) //these 2 lines by Zig (case d=6 but left here just in case)
	    weeknum = 53;
	return weeknum;
}

function getWithZeroPrefix(number) {
	var ret = (number < 10 ? "0" : "") + number;
	return ret;
}

//YYYY-MM-DD 
function makeDateCustomString(date, bWithTime) {
    var ret = date.getFullYear() + "-" + getWithZeroPrefix(date.getMonth() + 1) + "-" + getWithZeroPrefix(date.getDate());
    if (bWithTime) {
        var hours = date.getHours();
        var minutes = date.getMinutes();
        var strTime = getWithZeroPrefix(hours) + ':' + getWithZeroPrefix(minutes);
        ret = ret + " " + strTime;
    }
    return ret;
}

function getDeltaDates(dateA, dateB) {
    var delta = 0;
    if (dateA) {
        var date1 = Date.UTC(dateA.getFullYear(), dateA.getMonth(), dateA.getDate());
        var date2 = Date.UTC(dateB.getFullYear(), dateB.getMonth(), dateB.getDate());
        var ms = Math.abs(date1 - date2); //abs corrects floor negatives
        delta = Math.floor(ms / 1000 / 60 / 60 / 24);
        if (date1 < date2)
            delta = delta * -1;
    }
    return delta;
}

function setBusy(bBusy, elem) {
	if (elem === undefined)
		elem = $("body");
	var classAdd = null;
	var classRem = null;
	if (bBusy) {
		classAdd = "agile_busy";
		classRem = "agile_notbusy";
	} else {
		classAdd = "agile_notbusy";
		classRem = "agile_busy";
	}
	setTimeout(function () {
		elem.removeClass(classRem);
		elem.addClass(classAdd);
	}, 50);
}

function getCardTimerSyncHash(idCard) {
    return "timer:" + idCard;
}

function getCardTimerData(hash, resp) {
    chrome.storage.sync.get(hash, function (obj) {
        resp({ stored: obj[hash], hash: hash });
        return;
    });
}


function verifyActiveTimer(idCard) {
    chrome.storage.sync.get([SYNCPROP_ACTIVETIMER], function (obj) {
        if (obj[SYNCPROP_ACTIVETIMER] && obj[SYNCPROP_ACTIVETIMER] == idCard)
            return;
        var objNew = {};
        objNew[SYNCPROP_ACTIVETIMER] = idCard;
        chrome.storage.sync.set(objNew, function () { updateTimerChromeIcon(); });
    });
}


function updateTimerChromeIcon(bAnimate) {
    sendExtensionMessage({ method: "updatePlusIcon", bOnlyTimer: true, bAnimate: bAnimate || false }, function (response) { });
}

function findNextActiveTimer() {
    chrome.storage.sync.get(null, function (items) {
        var szTimerPattern = "timer:";
        var msStartLast = 0;
        var idCardFoundLast = null;
        //find the last active timer
        for (var item in items) {
            if (typeof item == "string" && item.indexOf(szTimerPattern) == 0) {
                var data = items[item];
                var idCard = item.substr(szTimerPattern.length);
                if (data.msStart && data.msEnd == null && data.msStart > msStartLast) {
                    msStartLast = data.msStart;
                    idCardFoundLast = idCard;
                }
            }
        }
        if (idCardFoundLast)
            verifyActiveTimer(idCardFoundLast);
    });
}

function findAllActiveTimers(callback) {
    chrome.storage.sync.get(null, function (items) {
        var rgIdCards = [];
        var szTimerPattern = "timer:";
        var idCardFoundLast = null;
        //find the last active timer
        for (var item in items) {
            if (typeof item == "string" && item.indexOf(szTimerPattern) == 0) {
                var data = items[item];
                var idCard = item.substr(szTimerPattern.length);
                if (data.msStart && data.msEnd == null) {
                    rgIdCards.push(idCard);
                }
            }
        }
        callback(rgIdCards);
    });
}

function removeTimerForCard(idCardParsed, bWarn) {
    var hash = getCardTimerSyncHash(idCardParsed);
    chrome.storage.sync.get([SYNCPROP_ACTIVETIMER, hash], function (obj) {
        var bDeleteActive = false;
        if (obj[SYNCPROP_ACTIVETIMER] !== undefined && obj[SYNCPROP_ACTIVETIMER] == idCardParsed)
            bDeleteActive = true;
        var rgPropsRemove = [];
        if (obj[hash])
            rgPropsRemove.push(hash);
        if (bDeleteActive)
            rgPropsRemove.push(SYNCPROP_ACTIVETIMER);

        if (rgPropsRemove.length == 0)
            return;

        if (bWarn && !confirm("You no longer have access to the card. Remove the timer?"))
            return;

        chrome.storage.sync.remove(rgPropsRemove, function () {
            if (chrome.runtime.lastError !== undefined) {
                sendDesktopNotification("Error while removing the timer: " + chrome.runtime.lastError.message);
                return;
            }
            updateTimerChromeIcon();
            if (bDeleteActive)
                findNextActiveTimer();
            sendDesktopNotification("Plus deleted the timer because the card cannot be found in Trello.", 15000); //note: timer panels rely on this, as alerts dont work in panels
        });
    });
}


function getTimerElemText(msStart, msEnd, bValues, bNoSeconds) {
    bNoSeconds = bNoSeconds || false;
    var txt = "";
    var ms = 0;
    if (msStart != null)
        ms = msEnd - msStart;
    var unit = UNITS.current;
    var divisor = (MAP_UNITS[UNITS.current]);
    assert(divisor);
    var days = 0;
    var hours = 0;

    //review zig: generalize
    if (unit == UNITS.days) {
        days = Math.floor(ms / divisor);
        ms -= days * divisor;
    }
    if (unit != UNITS.minutes) {
        divisor = 1000 * 60 * 60;
        hours = Math.floor(ms / divisor);
        ms -= hours * divisor;
    }
    divisor = 1000 * 60;
    var minutes = Math.floor(ms / divisor);
    ms -= minutes * divisor;
    divisor = 1000;
    var seconds = Math.floor(ms / divisor);
    txt = (days == 0 ? "" : "" + days + "d ") + (unit == UNITS.minutes ? "" : getWithZeroPrefix(hours) + ":") + getWithZeroPrefix(minutes) +
        (bNoSeconds?"m" : ":" + getWithZeroPrefix(seconds) + "s");

    if (bValues) {
        return { days:days, hours: hours, minutes: minutes, seconds: seconds,text:txt };
    }
    else {
        return txt;
    }
}

function showTimerPopup(idCard) {
    sendExtensionMessage({ method: "showTimerWindow", idCard: idCard },
                function (response) {
                });
}

var g_cTimesZeroTimeout = 0;
var g_cTimesContinuousZeroTimeout = 0;

/* processThreadedItems
 *
 * Administers concurrent trello api calls
 *
 * onPreProcessItem(item) can be null
 * onProcessItem(tokenTrello, item, iitem, postProcessItem) with postProcessItem(status, item, iitem). 
 * onFinishedAll(status)
 * onFinishedEach(status) or null
 * status == STATUS_OK when succeeds.
 *
 **/
function processThreadedItems(tokenTrello, items, onPreProcessItem, onProcessItem, onFinishedAll, onFinishedEach, needsProcessItemDelay) {
    var cNeedProcess = 0;
    var cReadyToWait = false;
    var bReturned = false;
    var cProcessed = 0;

    try {
        startProcess();
    } catch (ex) {
        logException(ex);
        onFinishedInternal("error: " + ex.message);
    }

    function onFinishedInternal(status) {
        if (bReturned) //allow multiple calls, simplifiers error handling in callers
            return;
        bReturned = true;
        assert(status != STATUS_OK || cNeedProcess == cProcessed);
        if (g_cTimesContinuousZeroTimeout > 0) {
            g_cTimesContinuousZeroTimeout = 0;
            //guarantee fresh callstack uppon return.reduces chances of random callstack additions over time
            setTimeout(function () {
                onFinishedAll(status);
            });
        } else {
            onFinishedAll(status);
        }
    }

    function startProcess() {
        g_cTimesContinuousZeroTimeout = 0;
        for (var iitem = 0; iitem < items.length; iitem++) {
            var itemCur = items[iitem];
            assert(typeof itemCur == "object");
            itemCur.bPendingQuery = false;
            itemCur.bFinishedQuery = false;
            if (!onPreProcessItem || onPreProcessItem(itemCur)) {
                cNeedProcess++;
                if (cNeedProcess <= CMAX_THREADS)
                    queueCall(itemCur, iitem, (cNeedProcess - 1) *MS_TRELLOAPI_WAIT);
            }
            else {
                itemCur.bFinishedQuery = true;
            }
        }
        if (cProcessed >= cNeedProcess) {
            onFinishedInternal(STATUS_OK);
        }
        else
            cReadyToWait = true; //this might not be necessary, but it doesnt hurt
    }

    function queueCall(item, iitem, ms) {
        if (bReturned) //a previous error could have already returned
            return;

        item.bPendingQuery = true;
        //timeout is to reduce chances of a trello quota. Note that even if we get a quota issue, it will be retried.
        if (needsProcessItemDelay && !needsProcessItemDelay(item, iitem)) {
            ms = 0;
            g_cTimesZeroTimeout++;
            if ((g_cTimesZeroTimeout % 50) == 0)
                ms = 50; //breath in case of consecutive zero waits. doesnt hurt when not consecutive
        }
        if (ms == 0)
            ms = undefined; //faster, specially in Canary (2016 last checked)

        if (ms === undefined)
            g_cTimesContinuousZeroTimeout++;

        function doIt() {
            try {
                onProcessItem(tokenTrello, item, iitem, postProcessItem);
            } catch (ex) {
                logException(ex);
                onFinishedInternal("error: " + ex.message);
            }
        }

        if (ms === undefined && (g_cTimesContinuousZeroTimeout % 20 != 0)) {
            doIt();
            return;
        }
        g_cTimesContinuousZeroTimeout = 0;
        setTimeout(doIt, ms);
    }

    function postProcessItem(status, item, iitem) {
        if (bReturned) //a previous error could have already returned
            return;
        cProcessed++;
        assert(item.bFinishedQuery !== undefined && item.bPendingQuery !== undefined);
        item.bFinishedQuery = true;
        if (onFinishedEach)
            onFinishedEach(status);

        if (status != STATUS_OK) {
            onFinishedInternal(status);
            return;
        }

        if (cReadyToWait && cProcessed >= cNeedProcess) {
            onFinishedInternal(STATUS_OK);
            return;
        }

        for (var i = iitem + 1; i < items.length; i++) {
            var itemCur = items[i];
            assert(itemCur.bFinishedQuery !== undefined && itemCur.bPendingQuery !== undefined);
            if (itemCur.bFinishedQuery || itemCur.bPendingQuery)
                continue;
            queueCall(itemCur, i, MS_TRELLOAPI_WAIT);
            break;
        }
    }
}

var g_regexParseSE = null;
var g_regexRemoveHashtags = /#[\S-]+/g;

/* parseSE
*
* bKeepHashTags defaults to false
* returns se:
* se.titleNoSE : string
* se.spent : float
* se.estimate : float 
*
*/
function parseSE(title, bKeepHashTags) {
    var bAcceptSFT = g_bAcceptSFT;
    var se = { bParsed: false, bSFTFormat: false };

    if (bAcceptSFT)
        se = parseSE_SFT(title);

    if (se.bParsed) {
        se.bSFTFormat = true;
    } else {
        if (g_regexParseSE === null)
            g_regexParseSE= new RegExp("^([(]\\s*([+-]?[0-9]*[.]?[0-9]*)\\s*/\\s*([+-]?[0-9]*[.]?[0-9]*)\\s*[)])?\\s*(.+)$");
        var patt = g_regexParseSE;
        var rgResults = patt.exec(title);

        //review zig: when is rgResults null? one user had this but never sent the offending card title
        if (!g_bAcceptPFTLegacy || rgResults == null || rgResults[2] === undefined || rgResults[3] === undefined) {
            se.spent = 0;
            se.estimate = 0;
            se.titleNoSE = title.trim();
            if (bAcceptSFT)
                se.bSFTFormat = true;
        } else {
            se.titleNoSE = (rgResults[4] || "").trim();
            se.spent = parseFixedFloat(rgResults[2]);
            se.estimate = parseFixedFloat(rgResults[3]);
        }
    }
    // Strip hashtags
    if (bKeepHashTags === undefined || bKeepHashTags == false) //review zig cleanup by initializing to bKeepHashTags = bKeepHashTags || false and testing !bKeepHashTags
        se.titleNoSE = replaceString(se.titleNoSE,g_regexRemoveHashtags , "");
    return se;
}

var g_regexSFT1 = null;
var g_regexSFT2 = null;
function parseSE_SFT(title) {
    function makePatt(leftDelim, rightDelim) {
        var start = null;
        var end = null;
        if (leftDelim == "[") {
            start = "\\[";
            end = "\\]";
        }
        else {
            start = "[" + leftDelim + "]";
            end = "[" + rightDelim + "]";
        }
        return start + "(\\s*[+-]?[0-9]*[.]?[0-9]*\\s*)" + end;
    }

    var se = { bParsed: false };
    var leftDelim = "(";
    var rightDelim = ")";
    var part = makePatt(leftDelim, rightDelim);
    if (g_regexSFT1 === null)
        g_regexSFT1 = new RegExp("^.*?" + makePatt(leftDelim, rightDelim) + ".*$"); //*? means non-greedy match so find first
    var patt = g_regexSFT1;
    var rgResults = patt.exec(title);

    if (rgResults == null || rgResults[1] === undefined)
        se.estimate = 0;
    else {
        se.estimate = parseFixedFloat(rgResults[1], true);
        if (!isNaN(se.estimate)) {
            title = title.replace(leftDelim + rgResults[1] + rightDelim, "").trim();
            se.titleNoSE = title;
            se.bParsed = true;
        }
    }

    leftDelim = "[";
    rightDelim = "]";
    if (!g_regexSFT2)
        g_regexSFT2 = new RegExp("^.*" + makePatt(leftDelim, rightDelim) + ".*$"); //normal (greedy) match so it finds last;
    patt = g_regexSFT2;
    rgResults = patt.exec(title);
    if (rgResults == null || rgResults[1] === undefined)
        se.spent = 0;
    else {
        se.spent = parseFixedFloat(rgResults[1], true);
        if (!isNaN(se.spent)) {
            se.titleNoSE = title.replace(leftDelim + rgResults[1] + rightDelim, "").trim();
            se.bParsed = true;
        }
    }
    return se;
}

function getCardData(tokenTrello, idCardLong, fields, bBoardShortLink, callback, waitRetry) {
    //https://trello.com/docs/api/card/index.html
    assert(idCardLong);
    assert(fields);
    assert(callback);
    var bFieldsIsRoute = (fields && fields.charAt(0) == "/");
    var url = "https://trello.com/1/cards/" + idCardLong + (bFieldsIsRoute? "" : "?fields=") + fields;
    if (bBoardShortLink)
        url = url + "&board=true&board_fields=shortLink";
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
                        objRet.card = JSON.parse(xhr.responseText);
                        objRet.status = STATUS_OK;
                        callback(objRet);
                        bReturned = true;
                    } catch (ex) {
                        objRet.status = "error: " + ex.message;
                        logException(ex);
                    }
                } else {
                    if (bHandledDeletedOrNoAccess(xhr.status, objRet)) { //no permission to the board, or card deleted already
                        null; //happy lint
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

                if (!bReturned) {
                    callback(objRet);
                }
            }
        }
    };

    xhr.open("GET", url);
    xhr.send();
}


//renameCard
//leave statusNoAccessCustom undefined to return error status.
//set statusNoAccessCustom to STATUS_OK so it returns OK on those cases (with card.hasPermission=false) if undefined.
function renameCard(tokenTrello, idCard, title, callback, statusNoAccessCustom, waitRetry) {
    if (!statusNoAccessCustom)
        statusNoAccessCustom = "error: permission error or deleted";
    //https://trello.com/docs/api/card/index.html
    var url = "https://trello.com/1/cards/" + idCard + "/name?value=" + encodeURIComponent(title) + "&token=";
    url = url + tokenTrello; //trello requires the extra token besides the cookie to prevent accidental errors from extensions
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
                        objRet.card = JSON.parse(xhr.responseText);
                        objRet.status = STATUS_OK;
                        bReturned = true;
                        callback(objRet);
                    } catch (ex) {
                        objRet.status = "error: " + ex.message;
                        logException(ex);
                    }
                } else {
                    if (bHandledDeletedOrNoAccess(xhr.status, objRet, statusNoAccessCustom)) { //no permission or deleted
                        null; //happy lint
                    }
                    else if (xhr.status == 429) { //too many request, reached quota.
                        var waitNew = (waitRetry || 500) * 2;
                        if (waitNew < 8000) {
                            bReturned = true;
                            setTimeout(function () {
                                renameCard(token, idCard, title, callback, statusNoAccessCustom, waitNew);
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

    xhr.open("PUT", url);
    xhr.send();
}

var g_regexBracketOpen = /\[/g;
var g_regexBracketClose = /\]/g;

function replaceBrackets(str) {
    if (typeof (str) == "string" && str.indexOf("[") < 0)
        return str;

    var strRet = replaceString(str, g_regexBracketOpen, '*');
    strRet = replaceString(strRet, g_regexBracketClose, '*').trim();
    return strRet;
}

//return example: "1 hour ago" "7 days ago"
//always return a whole unit without subunits
function getTimeDifferenceAsString(msDateParam) {
    assert(msDateParam);
    var minutes = Math.floor((Date.now() - msDateParam) / 1000 / 60);
    var hours = Math.floor(minutes / 60);
    var days = Math.floor(hours / 24);
    var strRet = "";

    if (days > 0) {
        strRet = "" + days + (days == 1 ? " day " : " days ");
        minutes = 0;
        hours = 0;
    }


    if (hours > 0) {
        strRet = "" + hours + (hours == 1 ? " hour " : " hours ");
            minutes = 0;
    }

    if (strRet == "" && minutes == 0) {
        strRet = "just now";
    }
    else {
        if (strRet == "" || minutes > 0) {
            strRet = strRet + minutes + (minutes == 1 ? " minute " : " minutes ");
        }
        strRet = strRet + "ago";
    }
    return strRet;
}

function elementInViewport(el) { //thanks to http://stackoverflow.com/a/125106/2213940
    var top = el.offsetTop;
    var left = el.offsetLeft;
    var width = el.offsetWidth;
    var height = el.offsetHeight;

    while (el.offsetParent) {
        el = el.offsetParent;
        top += el.offsetTop;
        left += el.offsetLeft;
    }

    return (
      top >= window.pageYOffset &&
      left >= window.pageXOffset &&
      (top + height) <= (window.pageYOffset + window.innerHeight) &&
      (left + width) <= (window.pageXOffset + window.innerWidth));
}

function removeBracketsInNote(note) {
    var iFindBracket = note.lastIndexOf("]");
    if (iFindBracket >= 0) {
        iFindBracket++;
        if (iFindBracket >= note.length)
            note = "";
        else
            note = note.substring(iFindBracket);
    }
    return note.trim();
}

function groupRows(rowsOrig, propertyGroup, propertySort, bCountCards, customFieldsData) {

    var ret = [];
    var i = 0;
    const cMax = rowsOrig.length;
    var row = null;
    var cfmetaData = null;
    var cardCF = null;

    if (customFieldsData) {
        cfmetaData = customFieldsData.cfmetaData;
        cardCF = customFieldsData.cardData;
    }

    //group
    if (propertyGroup.length > 0) {
        var map = {};
        var mapCardsPerGroup = {};
        var pGroups = propertyGroup.split("-");
        var propDateString = "dateString"; //review zig: ugly to do it here, but elsewhere requires another pass to rowsOrig
        var propDateTimeString = "dtString";

        //we need to map whether a card row was assigned a custom value, because some reports (grouped by user, keyword, etc) can repeat the same card in multiple groups.
        //with this map we will never duplicate the custom field in other
        var mapCardCFHandled = {};

        try {
            for (i=0; i < cMax; i++) {
                row = rowsOrig[i];

                if (row.bSkip)
                    continue;

                if (row.date !== undefined && (row[propDateString] === undefined || row[propDateTimeString] === undefined)) {
                    var dateRow = new Date(row.date * 1000); //db is in seconds
                    row[propDateString] = makeDateCustomString(dateRow);
                    row[propDateTimeString] = makeDateCustomString(dateRow, true);
                }

                if (cardCF && cfmetaData) {
                    //strategy for grouping custom fields is to use the "last" value (like the other fields) when not numeric.
                    //when numeric, it adds them keeping track if a card was already added within each group (as a group can repeat the same card)
                    //checkbox items were previously converted to numeric
                    //numeric values are converted to float in cfData, which is later use to paint each column
                    var cardCFCur = cardCF[row.idCardH];
                    if (cardCFCur) {
                        for (var idCF in cardCFCur) {
                            var cfmetaDataCur = cfmetaData[idCF];
                            var idCFUse = idCF;
                            if (cfmetaDataCur.idMaster)
                                idCFUse = cfmetaDataCur.idMaster;
                            var cardCFCurField = cardCFCur[idCF];
                            var valCF = "";
                            if (cardCFCurField)
                                valCF=cardCFCurField[cfmetaDataCur.type];
                            if (cfmetaDataCur.type == "number")
                                valCF = parseFloat(valCF || "0.0") || 0.0;
                            else if (cfmetaDataCur.type == "date")
                                valCF = makeDateCustomString(new Date(valCF), true);
                            if (!row.cfData) {
                                row.cfData = {};
                                row.cfCardsGrouped = {}; //during grouping, holds whether a card was already summed
                                row.cfCardsGrouped[row.idCardH] = true;
                            }
                            row.cfData[idCFUse] = { type: cfmetaDataCur.type, val: valCF };
                        }
                    }
                }

                var key = "";
                var iProp = 0;

                for (; iProp < pGroups.length; iProp++) {
                    var propname = pGroups[iProp];
                    var valCur = "";
                    if (propname == "dowName") { //review zig: not yet in UI
                        if (!row.dowName)
                            row.dowName = getWeekdayName(new Date(row.date * 1000).getDay(), false); //NOTE we modify the row here. needed by reports
                        valCur = row.dowName;
                    } else if (propname == "hashtagFirst" || propname == "hashtags") {
                        if (row.hashtagFirst === undefined) { //splitRows might have already loaded them
                            var rgHash = getHashtagsFromTitle(row.nameCard || "", true);
                            if (rgHash.length > 0)
                                valCur = rgHash[0];
                            else
                                valCur = "";
                            row.hashtagFirst = valCur; //NOTE we modify the row here. needed by reports
                        } else {
                            valCur = row.hashtagFirst;
                        }
                    } else if (propname == "labels") {
                        //when grouping by labels, splitRows has always prepopulated labels, and without html decoration
                        assert(row.labels !== undefined);
                        valCur = row.labels;
                    } else if (propname == "comment") {
                        valCur = removeBracketsInNote(row.comment); 
                    } else {
                        valCur = row[propname];
                    }

                    key = key + "/" + String(valCur).toLowerCase();
                }
                var group = map[key];
                if (group === undefined)
                    group = cloneObject(row);
                else {
                    //rowid -1 when its a card row (from the query UNION)
                    if (group.rowid == -1 && row.rowid != -1) {
                        var sSave = group.spent;
                        var eSave = group.est;
                        var eFirstSave = group.estFirst;
                        var rowidSave = group.rowid;
                        var dateDueSave = group.dateDue;
                        var countCardsSave = group.countCards;
                        var cfDataSave = group.cfData;
                        var cfCardsGroupedSave = group.cfCardsGrouped;
                        group = cloneObject(row); //re-clone so rows with s/e always take precedence over card-only rows. REVIEW: investigate & documment why?
                        group.spent = sSave;
                        group.est = eSave;
                        group.estFirst = eFirstSave;
                        group.rowid = rowidSave;
                        group.dateDue = dateDueSave;
                        group.countCards = countCardsSave;
                        group.cfData = cfDataSave;
                        group.cfCardsGrouped = cfCardsGroupedSave;
                    }
                    group.spent += row.spent;
                    group.est += row.est;
                    group.estFirst += row.estFirst;

                    if (!group.cfData) {
                        group.cfData = row.cfData;
                        group.cfCardsGrouped = row.cfCardsGrouped;
                    }
                    else if (row.cfData && !group.cfCardsGrouped[row.idCardH]) {
                        group.cfCardsGrouped[row.idCardH] = true;
                        for (var idCFCur in row.cfData) {
                            if (!group.cfData[idCFCur]) {
                                group.cfData[idCFCur] = row.cfData[idCFCur];
                            }
                            else if (row.cfData[idCFCur].type == "number") {
                                group.cfData[idCFCur].val += row.cfData[idCFCur].val;
                            }
                        }
                    }

                    if (row.rowid !== undefined && row.rowid != ROWID_REPORT_CARD && (group.rowid === undefined || row.rowid > group.rowid)) {
                        group.rowid = row.rowid; //maintanin rowid so that a "mark all read" on a grouped report will still find the largest rowid
                    }
                }
                map[key] = group;
                if (bCountCards) {
                    if (!mapCardsPerGroup[key]) {
                        group.countCards = 0;
                        mapCardsPerGroup[key] = {};
                    }
                    if (!mapCardsPerGroup[key][row.idCardH]) {
                        mapCardsPerGroup[key][row.idCardH] = true;
                        group.countCards++;
                    }
                }
            }
        } catch (ex) {
            logException(ex);
            alert(ex.message);
            throw ex;
        }


        for (i in map) {
            ret.push(map[i]);
        }
    } else {
        ret = cloneObject(rowsOrig); //so sorting doesnt mess with rowsOrig
    }

    if (propertySort == "dow") { //review zig: not yet in UI
        for (i = 0; i < ret.length; i++) {
            row = ret[i];

            if (row.bSkip)
                continue;
            if (!row.dow)
                row.dow = new Date(row.date * 1000).getDay(); //NOTE we modify the row here. needed by reports
        }
    }
        

    //sort
    //note: propDateString might not be in rows at this point (is here only if there was grouping)
    if (ret.length > 0 && propertySort.length > 0 && (propertySort != "date" || propertyGroup.length > 0)) {
        var bString = typeof (ret[0][propertySort]) == "string";
        var bRemain = (propertySort == "remain");
        var bPosList = (propertySort == "posList");
        ret.sort(function doSort(a, b) {
            function compareItems(a, b) {
                if (bPosList) {
                    var namePropBoard = "nameBoard";
                    var ret = a[namePropBoard].localeCompare(b[namePropBoard]);
                    if (ret != 0)
                        return ret;
                    return a[propertySort] - b[propertySort];
                }
                if (bString)
                    return (a[propertySort].localeCompare(b[propertySort]));
                var va = null;
                var vb = null;

                if (bRemain) {
                    va = a.est - a.spent;
                    vb = b.est - b.spent;
                } else {
                    if (propertySort == "dateDue") { //REVIEW ZIG: ugly duplication in setReportData
                        va = b[propertySort];
                        vb = a[propertySort];
                    }
                    else {
                        va = a[propertySort];
                        vb = b[propertySort];
                    }

                }
                return (vb - va);
            }

            var cmp = compareItems(a, b);
            if (cmp === 0) {
                cmp = b.date - a.date;
                if (cmp == 0 && b.rowid !== undefined && a.rowid !== undefined)
                    cmp = b.rowid - a.rowid; //use entry order. covers transfers (and sometimes immediate spent, when it also falls on the same second) having same date
            }
            return cmp;
        }
        );
    }
    return ret;
}


function getXFromUrl(url, prefix) {
    if (!url || url.indexOf(prefix) != 0)
        return null;

    var remainUrl = url.slice(prefix.length);
    var iNextSlash = remainUrl.indexOf("/");
    if (iNextSlash >= 0)
        remainUrl = remainUrl.slice(0, iNextSlash);
    return remainUrl;
}

function getIdCardFromUrl(url) {
    return getXFromUrl(url, "https://trello.com/c/");
}

function getIdBoardFromUrl(url) {
    return getXFromUrl(url, "https://trello.com/b/");
}

function elemShowHide(elem, bShow, ms) {
    if (bShow) {
        if (ms)
            elem.slideDown(ms);
        else
            elem.show();
    }
    else {
        if (ms)
            elem.slideUp(ms);
            else
        elem.hide();
    }
}

function isLicException() {
    return (navigator && navigator.userAgent && (navigator.userAgent.indexOf("Opera")>=0 || navigator.userAgent.indexOf("OPR/")>=0));
}

function hitAnalytics(category, action, bSkipNewbie) {
    sendExtensionMessage({ method: "hitAnalyticsEvent", category: category, action: action, bSkipNewbie: bSkipNewbie }, function (response) {
    });
}
