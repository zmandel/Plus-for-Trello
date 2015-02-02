var IDBOARD_UNKNOWN = "//"; //board shortLink/idLong reserved for unknown boards. saved into db. for cases where user does not have permission for a board (for example when moving a card there)
var IDLIST_UNKNOWN = "//"; //list idLong. deals with missing idList in convertToCardFromCheckItem board action. saved to db
var PREFIX_ERROR_SE_COMMENT = "[error: "; //always use this to prefix error SE rows.
var g_msFetchTimeout = 15000; //ms to wait on urlFetches. update copy on plus.js
var g_cchTruncateDefault = 50;
var g_cchTruncateShort = 20;
var g_bAlwaysShowSpentChromeIcon = false; //review zig these 3  need initialization. reuse loadBackgroundOptions
var g_bAcceptSFT = false;
var g_regexExcludeList = /\[\s*exclude\s*\]/;
var g_userTrelloBackground = null;
var ID_PLUSCOMMAND = "/PLUSCOMMAND";
var PREFIX_PLUSCOMMAND = "^";
var PROP_TRELLOUSER = "plustrellouser";
var PROP_SHOWBOARDMARKERS = "showboardmarkers";
var TAG_RECURRING_CARD = "[R]";
var COLUMNNAME_ETYPE = "E.type";
var g_bPopupMode = false; //running as popup? (chrome browse action popup) REVIEW zig: cleanup, only reports need this?
var SYNCPROP_ACTIVETIMER = "cardTimerActive";
var SYNCPROP_bAlwaysShowSpentChromeIcon = "bAlwaysShowSpentChromeIcon";
var SEKEYWORD_DEFAULT = "plus!";
var SEKEYWORD_LEGACY = "Plus S/E";
var g_bEnableTrelloSync = false; //must be initialized by caller
var g_dDaysMinimum = -10000; //sane limit of how many days back can be set on a S/E comment

var g_dateMinCommentSELegacy = new Date(2014, 11, 12);
var g_dateMinCommentSERelaxedFormat = new Date(2014, 11, 9);

var g_optEnterSEByComment = {
    bInitialized: false,
    IsEnabled: function () {
        assert(this.bInitialized);
        assert(typeof g_bEnableTrelloSync !== "undefined");
        return (g_bEnableTrelloSync && this.bEnabled && this.rgKeywords.length > 0);
    },
    bEnabled: false,
    rgKeywords: [SEKEYWORD_DEFAULT],
    getDefaultKeyword: function() {
        assert(this.bInitialized);
        var ret = this.rgKeywords[0];
        if (!ret)
            ret = SEKEYWORD_DEFAULT;
        return ret.toLocaleLowerCase();
    },
    hasLegacyKeyword: function () {
        assert(this.bInitialized);
        var bFound = false;
        this.rgKeywords.every(function (keyword) {
            if (keyword.toLowerCase() == SEKEYWORD_LEGACY.toLowerCase()) {
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


var STATUS_OK = "OK"; //for messaging status with background page. all responses should have response.status=STATUS_OK when ok
var COLOR_ERROR = "#D64141";
var MS_TRELLOAPI_WAIT=(1000/30); //review zig: possible to optimize this by substraction from prev. api call time, but not worth it yet
var CMAX_THREADS = 4;
var g_callbackOnAssert = null;
var g_bDebuggingInfo = false;

Array.prototype.appendArray = function (other_array) {
    other_array.forEach(function (v) { this.push(v); }, this);
};

function getWeekdayName(num) {
    var g_rgiDayName = ['su', 'mo', 'tu', 'we', 'th', 'fr', 'sa'];
    return g_rgiDayName[num];
}

var EVENTS = {
    NEW_ROWS: "newrows",
    START_SYNC: "startsync",
    DB_CHANGED: "dbchanged",
    FIRST_SYNC_RUNNING : "firstsyncrunning"
};

var UNITS = {
    minutes: "m",
    hours: "h",
    days: "d",
    current: "h", //current units, hours by default
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
        var mult=MAP_UNITS[this.current];
        assert(mult);
        return time/mult;
    },
    UnitsToTime: function (units) {
        var mult = MAP_UNITS[this.current];
        assert(mult);
        return units * mult;
    }
};

var MAP_UNITS = {
    "m": 1000 * 60,
    "h": 1000 * 60 * 60,
    "d": 1000 * 60 * 60 * 24
};


/* DowMapper
 *
 * handles mapping betwen a dow (day of week, 0=sunday, 1=monday, etc) to/from an ordering position (0 to 6)
 * the week starts with the day at position 0.
 *
 * getDowStart()
 * setDowStart(dow)
 * posWeekFromDow(dow)
 * dowFromPosWeek(pos)
 *
 * Plus strategy for dealing with week numbers:
 * each HISTORY stores its week number, so its easier to query without worrying about producing the right week query. Without it its hard to deal correctly
 * with boundary weeks, for example week 53 of a given year might fall into the next year thus a query by year would crop the results.
 * One the week number is stored, we need a way to  know what standard was used (week's start day) for the row. We dont keep that standard in browser storage because it wouldnt
 * be possible to atomically change a row and setting. Thus the setting is saved in a table GLOBALS which has a single row and a column 'dowStart'
 * Additionally, we keep in storage.sync the last dowStart the user configured, and during openDb it checks if the db needs converting.
 * By convension, only openDb from the content script will cause conversion. the other callers just use the db setting. In practice, unless there is a rare case of failure,
 * the sync setting and the db setting will be in sync. The sync setting has precedence and will continue attempting to make them in sync at the next openDb call (window refresh)
 *
 **/
var DowMapper = {
    //public:
    DOWSTART_DEFAULT:0, //sunday default
    getDowStart: function () { return this.m_dowStart; },   //set dow with position 0
    setDowStart: function (dow) { this.m_dowStart = dow; }, //get dow with position 0
    posWeekFromDow: function (dow) {                        //position for a given dow
        var pos = dow - this.m_dowStart;
        if (pos < 0)
            pos = pos + 7; //mod is faster but this is easier to understand
        return pos;
    },
    dowFromPosWeek: function (pos) {                        //dow in given position
        var dowNew = pos + this.m_dowStart;
    if (dowNew > 6)
        dowNew = dowNew - 7; //mod is faster but this is easier to understand
    return dowNew;
    },
    
    //------------------------------------------
    //private:
    init: function () {        
        //initialize the object. see http://stackoverflow.com/questions/4616202/self-references-in-object-literal-declarations
        this.m_dowStart = this.DOWSTART_DEFAULT;
        delete this.init;
        return this;
    }
}.init();

function loadSharedOptions(callback) {

    var keyAcceptSFT = "bAcceptSFT";
    var keybEnableTrelloSync = "bEnableTrelloSync";
    var keybEnterSEByCardComments = "bEnterSEByCardComments";
    var keyrgKeywordsforSECardComment = "rgKWFCC";
    var keyUnits = "units";
    assert(typeof SYNCPROP_bAlwaysShowSpentChromeIcon !== "undefined");

    chrome.storage.sync.get([keyUnits, SYNCPROP_bAlwaysShowSpentChromeIcon, keyAcceptSFT, keybEnableTrelloSync, keybEnterSEByCardComments, keyrgKeywordsforSECardComment],
                             function (objSync) {
                                 UNITS.current = objSync[keyUnits] || UNITS.current;
                                 g_bAlwaysShowSpentChromeIcon = objSync[SYNCPROP_bAlwaysShowSpentChromeIcon] || false;
                                 g_bAcceptSFT = objSync[keyAcceptSFT] || false;
                                 g_bEnableTrelloSync = objSync[keybEnableTrelloSync] || false;
                                 g_optEnterSEByComment.loadFromStrings(objSync[keybEnterSEByCardComments], objSync[keyrgKeywordsforSECardComment]);

                                 chrome.storage.local.get([PROP_TRELLOUSER], function (obj) {
                                     g_userTrelloBackground = (obj[PROP_TRELLOUSER] || null);
                                     callback();
                                 });
                             });
}

function errFromXhr(xhr) {
    var errText = "error: " + xhr.status;
    if (xhr.statusText || xhr.responseText)
        errText = errText + "\n" + xhr.statusText + "\n" + xhr.responseText;
    else if (xhr.status == 0)
        errText = errText + "\nNo connection.";
    console.log(errText);
    return errText;
}

function assert(condition, message) {
	if (!condition) {
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
			    if (response.dowStart !== undefined)
			        DowMapper.setDowStart(response.dowStart);
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

        Increase: function () {
            this.cTasksPending++;
        },

        SetCount: function (cTasks) {
            assert(this.cTasksPending == 0);
            this.cTasksPending = cTasks;
        },
        Decrease: function () {
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
        cTasksPending: 0
    }.Init(cTasks, callback);

    return waiter;
}


function getUrlParams() {
	var iParams = window.location.href.indexOf("?");
	var objRet = {};
	if (iParams < 0)
		return objRet;
	var strParams = window.location.href.substring(iParams + 1);
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
	try {
	    chrome.runtime.sendMessage(obj, function (response) {
			try {
				setTimeout(function () { if (responseParam) responseParam(response); }, 0); //this allows the response to be out of the extension messaging stack. exceptions wont break the channel.
			} catch (e) {
				logException(e);
			}
		});
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

function sendDesktopNotification(strNotif, timeout) {
    if (timeout === undefined)
        timeout = 4000;

    sendExtensionMessage({ method: "showDesktopNotification", notification: strNotif, timeout: timeout }, function (response) { });
}

var g_plusLogMessages = []; //queues an error log which is regularly purged
var g_lastLogPush = null;
var g_lastLogError = "";

function bIgnoreError(str) {
    return (str.indexOf("Error connecting to extension") >= 0);
}

//logPlusError
// bAddStackTrace: defaults to true.
//
function logPlusError(str, bAddStackTrace) {
   
    if (bIgnoreError(str))
        return;

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
	    if (g_userTrelloCurrent && (g_userTrelloCurrent == "zmandel" || g_userTrelloCurrent == "zigmandel" || g_userTrelloCurrent == "tareocw")) {
	        if (typeof document != "undefined" && typeof PLUS_BACKGROUND_CALLER == "undefined")
	            console.dir(document.body);
	        //hi to me
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


function getSQLReportShared(sql, values, okCallback, errorCallback) {
	sendExtensionMessage({ method: "getReport", sql: sql, values: values }, function (response) {
		if (response.status != STATUS_OK) {
			if (errorCallback)
				errorCallback(response.status);
			return; //dont call  okCallback
		}
		okCallback(response);
	});
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
			if (response.status != STATUS_OK)
				return;
			setTimeout(function () {
			    removeSelection();
			    sendDesktopNotification("Copied to the clipboard.\nPaste anywhere like excel or email.");
			}, 100); //timeout is only for user visual cue 
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

function getHtmlBurndownTooltipFromRows(bShowTotals, rows, bReverse, header, callbackGetRowData, bOnlyTable, title) {
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
	        if (type)
	            classesTd += " agile_cell_drilldown" + type;  //used for agile_cell_drilldownS and agile_cell_drilldownE classes
			return "<td class='"+classesTd+ "'>" + (bNoTruncate ? val : strTruncate(val)) + "</td>";
		}

		var tds = callbackGetRowData(row);
		if (tds.length == 0)
			return "";
		var strPost = "";
		if (tds.title && tds.title != "")
		    strPost = " title='" + tds.title + "'";
		var strClassRow = "agile-drilldown-row";
		if (iColComment >= 0 && tds.length > iColComment && tds[iColComment].name.toLowerCase().indexOf(PREFIX_ERROR_SE_COMMENT) >= 0)
		    strClassRow = strClassRow + " agile-drilldown-row-error";
		var html = "<tr class='"+strClassRow+"'" + strPost + ">";
		var iCol = 0;
		for (; iCol < tds.length; iCol++) {
		    html += td(tds[iCol].name, tds[iCol].bNoTruncate, tds[iCol].type);
		}
		html += "</tr>";
		return html;
	}


	var htmlTop = '';

	if (!bOnlyTable) {
		htmlTop += '<div class="agile_tooltipContainer agile_arrow_opened">';
	}
	
	var html = [""]; //html[0] i placeholder for htmlTop
	if (bOnlyTable)
		html.push('<div class="agile_tooltip_scroller" tabindex="0">');
	else
		html.push('<div class="agile_tooltip_scroller agile_tooltip_scroller_Short" tabindex="0">');

	html.push('<table class="agile_tooltipTable">');
	html.push('<tr class="agile-drilldown-header">');
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
		html.push(th(nameCol, bExtendCur));
	}
	html.push('</tr>');
	var sTotal = 0;
	var eTotal = 0;
	var row = null;
	var i;

	if (bReverse) {
	    for (i = rows.length - 1; i >= 0; i--) {
			row = rows[i];
			html.push(htmlRow(row));
			sTotal += row.spent;
			eTotal += row.est;
		}
	} else {
	    for (i = 0; i < rows.length; i++) {
			row = rows[i];
			html.push(htmlRow(row));
			sTotal += row.spent;
			eTotal += row.est;
		}
	}
	html.push('</table>&nbsp<br />'); //extra line fixes table copy, otherwise bottom-right cell loses background color in pasted table.
	html.push('</DIV>');
	if (!bOnlyTable)
		html.push('</DIV>');
	if (bShowTotals)
	    title += ("&nbsp;S:" + parseFixedFloat(sTotal) + "&nbsp;&nbsp;&nbsp;&nbspE:" + parseFixedFloat(eTotal) + "&nbsp;&nbsp;&nbsp;&nbspR:" + parseFixedFloat(eTotal - sTotal));
	htmlTop += getDrilldownTopButtons(bOnlyTable, title);
	html[0] = htmlTop;
	return html.join('');
}

function setScrollerHeight(heightWindow, scroller, elemTop, dyTop, bAdjustBody) {
	if (elemTop.length == 0)
		return;
	var position = elemTop.offset();
	dyTop = dyTop || 0;
	bAdjustBody = bAdjustBody || false;
	//NOTE: heightWindow is passed and not calculated here because in some cases (tab show/hide) body height changed after showing elements.
	var height = heightWindow- position.top - dyTop; //review zig: redo scroller stuff
	if (height < 100) //minimum size
		height = 100;
	
	if (!bAdjustBody)
		scroller.css("height", height-7); //7 is to prevent scrollbar in case some plattform calcs are off by a few pixels
}

function makeReportContainer(html, widthWindow, bOnlyTable, elemParent, bNoScroll) {
	bNoScroll = bNoScroll || bOnlyTable;
	var container = $(".agile_topLevelTooltipContainer");
	bOnlyTable = bOnlyTable || false;

	if (container.length == 0)
		container = $("<div class='agile_topLevelTooltipContainer'></div>");
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
	      var t = ev.target;

	      var elemThis = $(t).closest('TR');
	      if (elemThis.children("th").length > 0)
	          return;
	      if (elemThis.hasClass("agile-drilldown-row-toggle"))
	          elemThis.removeClass("agile-drilldown-row-toggle");
	      else
	          elemThis.addClass("agile-drilldown-row-toggle");

	      var selected = container.find(".agile-drilldown-row-toggle");
	      var iSelected = 0;
	      var sCur = 0;
	      var eCur = 0;
	      for (; iSelected < selected.length; iSelected++) {
	          var children = selected.eq(iSelected).children("td");
	          var iChildren = 0;
	          for (; iChildren < children.length; iChildren++) {
	              var childCur = children.eq(iChildren);
	              if (childCur.hasClass("agile_cell_drilldownS"))
	                  sCur += parseFloat(childCur.text());
	              else if (childCur.hasClass("agile_cell_drilldownE"))
	                  eCur += parseFloat(childCur.text());
	          }
	      }
	      if (selected.length > 0)
	          $(".agile_selection_totals").html("&nbsp;(Selected S:" + parseFixedFloat(sCur) + "&nbsp;&nbsp;&nbsp;&nbsp;E:" + parseFixedFloat(eCur) + "&nbsp;&nbsp;&nbsp;&nbsp;R:" + parseFixedFloat(eCur - sCur) + ")");
	      else
	          $(".agile_selection_totals").empty();
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
		copyWindow.attr("title", "Click to copy table to your clipboard, then paste elsewhere (email, spreadsheet, etc.)");
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
	var html = htmlFromRows(drilldowns[selection.row][selection.column], bReverse, colExclude);
	var container = makeReportContainer(html, widthWindow);
}

function handleSectionSlide(section, content, widthOpen,elemShowHide) {
	var bOpened = (section.hasClass("agile_arrow_opened"));
	if (!bOpened && widthOpen) { //doing width before the toggle looks better and avoids a chrome paint bug
		section.css("width", widthOpen);
		if (elemShowHide)
			elemShowHide.show();
	}
	content.slideToggle(150, function () {
		if (bOpened) {
			section.removeClass("agile_arrow_opened");
			section.addClass("agile_arrow_closed");
			if (elemShowHide)
				elemShowHide.hide();
			section.css("width", "auto");
			section.css("padding-bottom", "0px");
		} else {
			section.removeClass("agile_arrow_closed");
			section.addClass("agile_arrow_opened");
		}
	});
	
}
/**
 * ScrollView - jQuery plugin 0.1
 *
 * from https://code.google.com/p/jquery-scrollview/
 * This plugin supplies contents view by grab and drag scroll.
 *
 * Copyright (c) 2009 Toshimitsu Takahashi
 *
 * Released under the MIT license.
 * 
 * Modified by Zig Mandel
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
	elem.click(function () {
		chrome.tabs.create({ url: url });
		return false;
	});
	elem.keypress(function (event) {
		var keycode = (event.keyCode ? event.keyCode : event.which);
		if (keycode == '13') { //enter key
			chrome.tabs.create({ url: url });
			return false;
		}
	});
}

//msTime 0 or undefined will use 1500
function hiliteOnce(elem,msTime, strClass) {
	var classBlink = (strClass ? strClass : "agile_box_input_hilite");
	msTime = msTime || 1500;
	elem.addClass(classBlink);
	setTimeout(function () {
	    elem.animate();
		elem.removeClass(classBlink);
	}, msTime);
}


/* cloneObject
 *
 * simple clone for serializable objects
 **/
function cloneObject(obj) {
	return JSON.parse(JSON.stringify(obj));
}


var g_weekNumUse = null;
function getCurrentWeekNum(date, dowStartOpt) {
	if (date === undefined) {
		if (g_weekNumUse != null)
			return g_weekNumUse; //default week num, from plus header week selector
		date = new Date();
	}
   
	if (dowStartOpt === undefined)
	    dowStartOpt = DowMapper.getDowStart();
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
function makeDateOnlyString(date) {
	return date.getFullYear() + "-" + getWithZeroPrefix(date.getMonth() + 1) + "-" + getWithZeroPrefix(date.getDate());
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
        for (var item in items) {
            if (typeof item == "string" && item.indexOf(szTimerPattern) == 0) {
                var data = items[item];
                var idCard = item.substr(szTimerPattern.length);
                if (data.msStart && data.msEnd == null) {
                    verifyActiveTimer(idCard);
                    break;
                }
            }
        }
    });
}


function getTimerElemText(msStart, msEnd, bValuesOnly) {
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

    if (bValuesOnly) {
        return { days:days, hours: hours, minutes: minutes, seconds: seconds };
    }
    else {
		//review zig timers
        txt = (days==0? "": ""+days+"d ") + (unit == UNITS.minutes? "" : getWithZeroPrefix(hours) + ":") + getWithZeroPrefix(minutes) + ":" + getWithZeroPrefix(seconds) + "s";
        return txt;
    }
}


//experimental
function addFixedHeaders(table) {
	var headers = table.find("th");
	var pos = getElementPosition(table[0]);
	var x = 0;
	var y = 0;
	var tableClone = $("<table class='agile_table_pivot' cellpadding=2 cellspacing=0 style='position:fixed'>").offset({ top: pos.y, left: pos.x });
	headers.each(function () {
		pos = getElementPosition(this);
		var label = $("<th>").css("min-width", this.clientWidth).css("max-width", this.clientWidth).text(this.textContent);
		tableClone.append(label);
	});
	table.after(tableClone);
}

//from http://www.kirupa.com/html5/get_element_position_using_javascript.htm
function getElementPosition(element) {
	var xPosition = 0;
	var yPosition = 0;

	while (element) {
		xPosition += (element.offsetLeft - element.scrollLeft + element.clientLeft);
		yPosition += (element.offsetTop - element.scrollTop + element.clientTop);
		element = element.offsetParent;
	}
	return { x: xPosition, y: yPosition };
}

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
function processThreadedItems(tokenTrello, items, onPreProcessItem, onProcessItem, onFinishedAll, onFinishedEach) {
    var cNeedProcess = 0;
    var cReadyToWait = false;
    var bReturned = false;
    var cProcessed = 0;

    try {
        startProcess();
    } catch (ex) {
        onFinishedInternal("error: " + ex.message);
    }

    function onFinishedInternal(status) {
        if (bReturned) //allow multiple calls, simplifiers error handling in callers
            return;
        bReturned = true;
        assert(status != STATUS_OK || cNeedProcess == cProcessed);
        onFinishedAll(status);
    }

    function startProcess() {
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
        setTimeout(function () {
            try {
                onProcessItem(tokenTrello, item, iitem, postProcessItem);
            } catch (ex) {
                onFinishedInternal("error: " + ex.message);
            }
            
        }, ms);
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


/* parseSE
*
* bKeepHashTags defaults to false
* returns se:
* se.titleNoSE : string
* se.spent : float
* se.estimate : float 
*
*/
function parseSE(title, bKeepHashTags, bAcceptSFT) {
    var se = { bParsed: false, bSFTFormat: false };

    if (bAcceptSFT)
        se = parseSE_SFT(title);

    if (se.bParsed) {
        se.bSFTFormat = true;
    } else {
        var patt = new RegExp("^([(]\\s*([+-]?[0-9]*[.]?[0-9]*)\\s*/\\s*([+-]?[0-9]*[.]?[0-9]*)\\s*[)])?\\s*(.+)$");
        var rgResults = patt.exec(title);

        //review zig: when is rgResults null? one user had this but never sent the offending card title
        if (rgResults == null || rgResults[2] === undefined || rgResults[3] === undefined) {
            se.spent = 0;
            se.estimate = 0;
            se.titleNoSE = title.trim();
            if (bAcceptSFT)
                se.bSFTFormat = true;
        } else {
            se.titleNoSE = rgResults[4].trim();
            se.spent = parseFixedFloat(rgResults[2]);
            se.estimate = parseFixedFloat(rgResults[3]);
        }
    }
    // Strip hashtags
    if (bKeepHashTags === undefined || bKeepHashTags == false) //review zig cleanup by initializing to bKeepHashTags = bKeepHashTags || false and testing !bKeepHashTags
        se.titleNoSE = se.titleNoSE.replace(/#[\w-]+/g, "");
    return se;
}

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
    var patt = new RegExp("^.*?" + makePatt(leftDelim, rightDelim) + ".*$"); //*? means non-greedy match so find first
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
    patt = new RegExp("^.*" + makePatt(leftDelim, rightDelim) + ".*$"); //normal (greedy) match so it finds last
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

function renameCard(tokenTrello, idCard, title, callback, waitRetry) {
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
                    }
                } else {
                    var bDeleted = (xhr.status == 404 || xhr.status == 400); //400 shouldnt really happen. old plus data from spreadsheets has this in cw360 because it was added manually to ss
                    if (xhr.status == 401 || xhr.status == 403 || bDeleted) { //no permission or deleted
                        objRet.hasPermission = false;
                        objRet.status = "error: permission error or deleted";
                        if (bDeleted)
                            objRet.bDeleted = true;
                    }
                    else if (xhr.status == 429) { //too many request, reached quota.
                        var waitNew = (waitRetry || 500) * 2;
                        if (waitNew < 8000) {
                            bReturned = true;
                            setTimeout(function () {
                                renameCard(token, idCard, title, callback, waitNew);
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

function replaceBrackets(str) {
    return str.replace(/\[/g, '*').replace(/\]/g, '*');
}

function makeHistoryRowObject(dateNow, idCard, idBoard, strBoard, strCard, userCur, s, e, comment, idHistoryRowUse, keyword) {
    //console.log(dateNow + " idCard:" + idCard + " idBoard:" + idBoard + " card:" + strCard + " board:" + strBoard);
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
    obj.idCard = idCard;
    obj.idBoard = idBoard;
    obj.keyword = keyword || null; //null will be handled later when is entered into history
    var date = Math.floor(dateNow.getTime() / 1000); //seconds since 1970
    obj.date = date;
    obj.strBoard = strBoard;
    obj.strCard = strCard;
    obj.spent = s;
    obj.est = e;
    obj.user = userCur;
    obj.week = getCurrentWeekNum(dateNow);
    var nMonth = dateNow.getMonth() + 1;
    nMonth = getWithZeroPrefix(nMonth);
    obj.month = dateNow.getFullYear() + "-" + nMonth;
    obj.comment = comment;
    return obj;
}

//return example: "1 hour 4 minutes ago"
//handles up to hours (not days)
function getTimeDifferenceAsString(msDateParam, bShort) {
    assert(msDateParam);
    var dateNow = new Date();
    var minutes = Math.floor((dateNow.getTime() - msDateParam) / 1000 / 60);
    var hours = Math.floor(minutes / 60);
    var strRet = "";
    if (hours > 0) {
        strRet = "" + hours + (hours == 1 ? " hour " : " hours ");
        if (bShort)
            minutes = 0;
        else
            minutes = minutes - 60 * hours;
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
