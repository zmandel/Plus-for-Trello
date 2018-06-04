/// <reference path="intellisense.js" />

var g_bLoaded = false; //needed because DOMContentLoaded gets called again when we modify the page
var g_mapETypeParam = { "ALL": "", "EINCR": 1, "EDECR": -1, "ENEW": 2 };
var g_iTabCur = null; //invalid initially
var ITAB_REPORT = 0;
var ITAB_BYUSER = 1;
var ITAB_BYBOARD = 2;
var ITAB_CHART = 3;
var g_colorDefaultOver = "#B9FFA9";
var g_colorDefaultUnder = "#FFD5BD";
var g_bShowKeywordFilter = false;
var KEY_FORMAT_PIVOT_USER = "formatPivotUser";
var KEY_FORMAT_PIVOT_BOARD = "formatPivotBoard";
var KEY_bEnableTrelloSync = "bEnableTrelloSync";
var KEY_bIgnoreZeroECards = "bIgnoreZeroECards";
var keybEnterSEByCardComments = "bEnterSEByCardComments"; //review zig reuse shared globals loader
var keyrgKeywordsforSECardComment = "rgKWFCC";
const g_postFixHeaderLast = "*"; //special postfix for column headers
var g_namedReport = null; //stores named report from initial url param
var g_excludedColumns = {};
var g_bAllowNegativeRemaining = false;
var g_bNoGroupChart = false;
const g_strMessageNoGroupChart = "To view this chart type, group by other than 'S/E rows'.";
var g_lastGroupSelection = "";
var g_mapColorFromName = {};
var g_interactions = [];
const g_heightLine = 28;
const g_maxLegendsPerColumn = 30;
const g_maxLegendColumns = 3;
const PROP_LS_bShowedDefaultCPMCountsListFilter = "bShowedDefaultCPMCountsListFilter";
const CF_PREFIX = "cf:";

const g_chartViews = { //do not modify existing options, as those could be in saved user's bookmarks
    s: "s",
    e: "e",
    r: "r",
    ser: "ser",
    e1vse: "e1vse",
    echange: "echange",
    cardcount: "cardcount",
    burndown: "burndown"
};

//fixed colors only for g_chartViews that have a single color 
const g_colorsFixed={
    s:"#D25656",
    e: "#2196F3",
    r: "#519B51",
    cardcount: "#026AA7"
};

//domains for the various charts
const g_dnames = { 
    ser: "ser",
    s: "s",
    e: "e",
    r: "r",
    cardcount: "cardcount"
};

//maps dependencies between a column and card fields.
//Those on the RIGHT have a unique LEFT property (a card can only have one team and one board, so it appears under team and board)
//used for detecting if a grouped report column contains unique or "last" (*) values.
//see also https://docs.google.com/a/plusfortrello.com/spreadsheets/d/1ECujO3YYTa3akMdnCrQ5ywgWnqybJDvXnVLwxZ2tT-M/edit?usp=sharing
const g_columnData = {
    user: ["user"],
    team: ["idTeamH","idBoardH","idCardH"],
    board: ["idBoardH", "idCardH"],
    nameList: ["nameList", "idCardH"],
    hashtagFirst: ["hashtags", "hashtagFirst", "idCardH"],
    card: ["idCardH"],
    dowName: ["dateString"],
    week: ["week", "dateString"],
    month: ["month", "dateString"],
    dateString: ["dateString"],
    keyword: ["keyword"],
    archived: ["archived", "idCardH"],
    boardShortLink: ["idBoardH", "idCardH"],
    cardNumber: ["idCardH"],
    cardCount: ["idCardH"],
    cardShortLink: ["idCardH"],
    deleted: ["deleted", "idCardH"],
    dateDue: ["dateDue", "idCardH"],
    dateCreated: ["dateCreated", "idCardH"],
    e: ["e"],
    e1st: ["e1st"],
    eType: ["eType"],
    labels: ["labels","idCardH"],
    note: ["comment"],
    r: ["r"],
    s: ["s"],
    cf: ["cf", "idCardH"] //any custom field
};

var g_colours = { //thanks http://stackoverflow.com/a/1573141/2213940
    "aliceblue": "#f0f8ff", "antiquewhite": "#faebd7", "aqua": "#00ffff", "aquamarine": "#7fffd4", "azure": "#f0ffff",
    "beige": "#f5f5dc", "bisque": "#ffe4c4", "black": "#000000", "blanchedalmond": "#ffebcd", "blue": "#0000ff", "blueviolet": "#8a2be2", "brown": "#a52a2a", "burlywood": "#deb887",
    "cadetblue": "#5f9ea0", "chartreuse": "#7fff00", "chocolate": "#d2691e", "coral": "#ff7f50", "cornflowerblue": "#6495ed", "cornsilk": "#fff8dc", "crimson": "#dc143c", "cyan": "#00ffff",
    "darkblue": "#00008b", "darkcyan": "#008b8b", "darkgoldenrod": "#b8860b", "darkgray": "#a9a9a9", "darkgreen": "#006400", "darkkhaki": "#bdb76b", "darkmagenta": "#8b008b", "darkolivegreen": "#556b2f",
    "darkorange": "#ff8c00", "darkorchid": "#9932cc", "darkred": "#8b0000", "darksalmon": "#e9967a", "darkseagreen": "#8fbc8f", "darkslateblue": "#483d8b", "darkslategray": "#2f4f4f", "darkturquoise": "#00ced1",
    "darkviolet": "#9400d3", "deeppink": "#ff1493", "deepskyblue": "#00bfff", "dimgray": "#696969", "dodgerblue": "#1e90ff",
    "firebrick": "#b22222", "floralwhite": "#fffaf0", "forestgreen": "#228b22", "fuchsia": "#ff00ff",
    "gainsboro": "#dcdcdc", "ghostwhite": "#f8f8ff", "gold": "#ffd700", "goldenrod": "#daa520", "gray": "#808080", "green": "#008000", "greenyellow": "#adff2f",
    "honeydew": "#f0fff0", "hotpink": "#ff69b4",
    "indianred ": "#cd5c5c", "indigo": "#4b0082", "ivory": "#fffff0", "khaki": "#f0e68c",
    "lavender": "#e6e6fa", "lavenderblush": "#fff0f5", "lawngreen": "#7cfc00", "lemonchiffon": "#fffacd", "lightblue": "#add8e6", "lightcoral": "#f08080", "lightcyan": "#e0ffff", "lightgoldenrodyellow": "#fafad2",
    "lightgrey": "#d3d3d3", "lightgreen": "#90ee90", "lightpink": "#ffb6c1", "lightsalmon": "#ffa07a", "lightseagreen": "#20b2aa", "lightskyblue": "#87cefa", "lightslategray": "#778899", "lightsteelblue": "#b0c4de",
    "lightyellow": "#ffffe0", "lime": "#00ff00", "limegreen": "#32cd32", "linen": "#faf0e6",
    "magenta": "#ff00ff", "maroon": "#800000", "mediumaquamarine": "#66cdaa", "mediumblue": "#0000cd", "mediumorchid": "#ba55d3", "mediumpurple": "#9370d8", "mediumseagreen": "#3cb371", "mediumslateblue": "#7b68ee",
    "mediumspringgreen": "#00fa9a", "mediumturquoise": "#48d1cc", "mediumvioletred": "#c71585", "midnightblue": "#191970", "mintcream": "#f5fffa", "mistyrose": "#ffe4e1", "moccasin": "#ffe4b5",
    "navajowhite": "#ffdead", "navy": "#000080",
    "oldlace": "#fdf5e6", "olive": "#808000", "olivedrab": "#6b8e23", "orange": "#ffa500", "orangered": "#ff4500", "orchid": "#da70d6",
    "palegoldenrod": "#eee8aa", "palegreen": "#98fb98", "paleturquoise": "#afeeee", "palevioletred": "#d87093", "papayawhip": "#ffefd5", "peachpuff": "#ffdab9", "peru": "#cd853f", "pink": "#ffc0cb", "plum": "#dda0dd", "powderblue": "#b0e0e6", "purple": "#800080",
    "red": "#ff0000", "rosybrown": "#bc8f8f", "royalblue": "#4169e1",
    "saddlebrown": "#8b4513", "salmon": "#fa8072", "sandybrown": "#f4a460", "seagreen": "#2e8b57", "seashell": "#fff5ee", "sienna": "#a0522d", "silver": "#c0c0c0", "skyblue": "#87ceeb", "slateblue": "#6a5acd", "slategray": "#708090", "snow": "#fffafa", "springgreen": "#00ff7f", "steelblue": "#4682b4",
    "tan": "#d2b48c", "teal": "#008080", "thistle": "#d8bfd8", "tomato": "#ff6347", "turquoise": "#40e0d0",
    "violet": "#ee82ee",
    "wheat": "#f5deb3", "white": "#ffffff", "whitesmoke": "#f5f5f5",
    "yellow": "#ffff00", "yellowgreen": "#9acd32"
};

var g_namedParams = { //review move all here
    dontQuery: "dontQuery",//1 when set
    fromMarkAllViewed: "fromMAV",//1 when set
    sortListNamed: "sortList",
    namedReport: "named" //popup inline reports use this
};

var NR_POPUP_REMAIN = "_remain"; //used in report and html
var NR_HOME_REMAIN = "_remainHome"; //in plus home
var g_cSyncSleep = 0;  //for controlling sync abuse
var g_bIgnoreEnter = false; //review zig
var FILTER_DATE_ADVANCED = "advanced";
var g_bNeedSetLastRowViewed = false;
var g_bAddParamSetLastRowViewedToQuery = false;
var g_rowidLastSyncRemember = -1;
var g_bBuildSqlMode = false;
var g_sortListNamed = null; //when not null, this array specifies the sort list by column name
var g_orderByWhenSortList = null; //stores the last "order by" at the moment we generated g_sortListNamed
var PIVOT_BY = {
    year: "year",
    month: "month",
    week: "", //review: weird way to make default
    day: "day"
};

//cache formats to avoid overloading sync. "format" is saved to sync so short names there to reduce sync usage
var g_dataFormatUser = { key: KEY_FORMAT_PIVOT_USER, interval: null, cLastWrite: 0, cCur: 0, format: { u: { c: g_colorDefaultUnder, v: null }, o: { c: g_colorDefaultOver, v: null } } };
var g_dataFormatBoard = { key: KEY_FORMAT_PIVOT_BOARD, interval: null, cLastWrite: 0, cCur: 0, format: { u: { c: g_colorDefaultUnder, v: null }, o: { c: g_colorDefaultOver, v: null } } };
var g_rgTabs = []; //tab data

function getCleanHeaderName(name) {
    if (!name)
        return "";
    var ret = name.split('\xa0')[0]; //hack: added &nbsp (g_hackPaddingTableSorter) to headers for tablesorter so remove them
    var iLast = ret.indexOf(g_postFixHeaderLast);
    if (iLast > 0)
        ret = ret.substr(0, iLast);
    //remove parenthesis (R case)
    iLast = ret.indexOf("(");
    if (iLast > 0)
        ret = ret.substr(0, iLast);
    return ret.trim();
}

function buildUrlFromParams(params, bNoPopupMode, prefixCustom) {
    if (bNoPopupMode) {
        params["popup"] = 0;
        params[g_namedParams.namedReport] = "";
    }
    else {
        if (params["popup"] === undefined && g_bPopupMode)
            params["popup"] = "1";
    }
    assert(!g_bBuildSqlMode);
    return commonBuildUrlFromParams(params, prefixCustom || "report.html");
}

function updateNamedReport(url) {
    if (g_namedReport)
        localStorage[g_namedParams.namedReport + ":" + g_namedReport] = url;
}

window.onerror = function (msg, url, lineNo, columnNo, error) {
    var string = msg.toLowerCase();
    var substring = "script error";
    var message;
    if (string.indexOf(substring) > -1) {
        message = 'Script Error: See background browser console for details. ' + msg;
    } else {
        message = [
            'Message: ' + msg,
            'URL: ' + url,
            'Line: ' + lineNo,
            'Error object: ' + JSON.stringify(error)
        ].join(' - ');
    }
    console.log(message);
    alert(message);
    return false;
};

function updateUrlState(params) {
    if (g_namedReport)
        params[g_namedParams.namedReport] = g_namedReport;
    if (g_sortListNamed)
        params[g_namedParams.sortListNamed] = JSON.stringify(g_sortListNamed);
    var url = buildUrlFromParams(params);
    window.history.replaceState('data', '', url);
    updateNamedReport(url);
}

var g_msLastLoadedGlobals = 0;
function loadStorageGlobals(callback) {
    g_msLastLoadedGlobals = Date.now();
    chrome.storage.sync.get([SYNCPROP_NO_SE, SYNCPROP_NO_EST, KEY_bIgnoreZeroECards, KEY_FORMAT_PIVOT_USER, KEY_FORMAT_PIVOT_BOARD, KEY_bEnableTrelloSync, keybEnterSEByCardComments, keyrgKeywordsforSECardComment], function (objs) {
        if (objs[KEY_FORMAT_PIVOT_USER] !== undefined)
            g_dataFormatUser.format = objs[KEY_FORMAT_PIVOT_USER];
        if (objs[KEY_FORMAT_PIVOT_BOARD] !== undefined)
            g_dataFormatBoard.format = objs[KEY_FORMAT_PIVOT_BOARD];
        g_bEnableTrelloSync = objs[KEY_bEnableTrelloSync] || false;
        g_bNoSE = objs[SYNCPROP_NO_SE] || false;
        g_bNoEst = objs[SYNCPROP_NO_EST] || false;
        g_optEnterSEByComment.loadFromStrings(objs[keybEnterSEByCardComments], objs[keyrgKeywordsforSECardComment]);
        g_bAllowNegativeRemaining = objs[KEY_bIgnoreZeroECards] || false;
        chrome.storage.local.get([LOCALPROP_PRO_VERSION], function (obj) {
            if (chrome.runtime.lastError) {
                alert(chrome.runtime.lastError.message);
                return;
            }
            g_bProVersion = obj[LOCALPROP_PRO_VERSION] || false;
            callback();
        });
    });
}

function loadTabs(parent) {
    if (g_bBuildSqlMode)
        return;
    var tabs = parent.children(".agile_tabselector_list").find("a");
    var i = 0;
    for (; i < tabs.length; i++) {
        var elem = tabs.eq(i);
        g_rgTabs.push(elem.attr("href"));
        elem.off().click(function () {
            selectTab(-1, $(this).attr("href"));
            return false;
        });
    }
}

function doResizeFromParent() {
    assert(g_bBuildSqlMode);
    
    setTimeout(function () {
        window.parent.resizeMe(document.body.clientHeight + 60);
    }, 0);
}

window.addEventListener('resize', function () {
    if (g_iTabCur != null)
        selectTab(g_iTabCur, undefined, true);

    if (g_iTabCur == ITAB_CHART) {
        if (g_chartContainer)
            g_chartContainer.redraw();
    }
    if (g_bBuildSqlMode)
        doResizeFromParent();
});

function selectTab(iTab, href, bForce) {
    if (iTab == null) {
        assert(g_iTabCur == null); //happens first time we init g_iTabCur
        iTab = 0;
    }

    if (g_bBuildSqlMode) {
        g_iTabCur = iTab;
        return;
    }

    function postSelect() {
        if (g_iTabCur == ITAB_CHART)
            setTimeout(fillChart, 100); //wait for final layout
    }

    if (iTab == g_iTabCur && !bForce) {
        postSelect();
        return; //ignore
    }



    var params = getUrlParams();
    iTab = selectTabUI(iTab, href);
    g_iTabCur = iTab;
    postSelect();
    if (params["tab"] != iTab) {
        if (params["tab"] || iTab != 0) { //not just an optimization. Print (ctrl+print) causes a resize. updating the url causes the print dialog to go away in windows chrome.
            params["tab"] = iTab;
            updateUrlState(params);
        }
    }
}

/* selectTabUI
 * 
 * select by iTab or href
 * to select by href pass -1 to iTab
 * RETURNS: iTab selected (useful for href case)
 **/
function selectTabUI(iTab, href) {
    if (g_bBuildSqlMode)
        return iTab;
    var i = 0;
    var selector = null;
    var classSelected = "agile_report_tabselector_selected";
    var selectedOld = $("." + classSelected);
    selectedOld.removeClass(classSelected);
    //selectedOld.parent().css("border-color", "#E8EBEE");
    var elemsHide = null;
    selectedOld.parent().removeClass("agile_tabcell_selected");
    for (; i < g_rgTabs.length; i++) {
        var cur = g_rgTabs[i];
        if (i == iTab || (href && href == cur)) {
            iTab = i;//for the href case
            selector = cur;
        }
        else {
            if (elemsHide)
                elemsHide = elemsHide.add($(cur));
            else
                elemsHide = $(cur);
        }
    }
    if (selector) {
        var elem = $(selector);
        var selectedNew = $(".agile_tabselector_list").find("a[href='" + selector + "']");
        selectedNew.addClass(classSelected);
        selectedNew.parent().addClass("agile_tabcell_selected");
        function fixScroller() {
            if (elemsHide)
                elemsHide.hide();
            var heightWindow = window.innerHeight;
            elem.show();
            if (g_bPopupMode && heightWindow > 470)
                heightWindow = 470; //prevent weird animations in popup when we exceed the original height in calculations
            var scroller = elem.find(iTab == ITAB_REPORT ? ".agile_tooltip_scroller" : ".agile_report_containerScroll");
            setScrollerHeight(heightWindow, scroller, scroller);
        }

        setTimeout(function () {
            fixScroller(); //this allows the tabs to refresh in case the tab is large (report tab)
        }, 10);

    }
    return iTab;
}

function findMatchingKeywords(term, autoResponse) {
    if (term == "*")
        term = "";
    var rg = [];

    if (g_optEnterSEByComment.IsEnabled())
        rg = g_optEnterSEByComment.rgKeywords;

    autoResponse(term == "" ? rg : rg.filter(function (item) {
        return (item.indexOf(term) >= 0);
    }));
}

function findMatchingTeams(term, autoResponse) {
    if (term == "*")
        term = "";
    var sql = "SELECT name FROM teams";
    var sqlPost = " ORDER BY LOWER(name) ASC";
    var paramsSql = [];

    if (term != "") {
        sql = sql + " where name LIKE ?";
        paramsSql.push("%" + term + "%");
    }
    getSQLReport(sql + sqlPost, paramsSql, function (response) {
        var rows = response.rows;
        if (response.status != STATUS_OK || !rows) {
            autoResponse([]);
            return;
        }

        var ret = new Array(rows.length);

        for (var i = 0; i < rows.length; i++) {
            ret[i] = rows[i].name;
        }

        autoResponse(ret);
    });
}

function findMatchingBoards(term, autoResponse) {
    if (term == "*")
        term = "";
    var nameTeam = $("#team").val().trim();
    var cWhere = 0;
    var sql = "SELECT B.name FROM boards B";
    var sqlPost = " ORDER BY LOWER(B.name) ASC";
    var paramsSql = [];

    if (nameTeam != "") {
        sql = sql + " LEFT OUTER JOIN TEAMS T ON B.idTeam=T.idTeam where T.name LIKE ?";
        paramsSql.push("%" + nameTeam + "%");
        cWhere++;
    }

    if (term != "") {
        if (cWhere == 0) {
            sql = sql + " WHERE";
        }
        else {
            sql = sql + " AND";
        }
        cWhere++;
        sql = sql + " B.name LIKE ?";
        paramsSql.push("%" + term + "%");
    }


    getSQLReport(sql + sqlPost, paramsSql, function (response) {
        var rows = response.rows;
        if (response.status != STATUS_OK || !rows) {
            autoResponse([]);
            return;
        }

        var ret = new Array(rows.length);

        for (var i = 0; i < rows.length; i++) {
            ret[i] = rows[i].name;
        }

        autoResponse(ret);
    });
}

function findMatchingLabels(term, autoResponse) {
    if (term == "*")
        term = "";
    var nameBoard = $("#board").val().trim();
    var idBoard = $("#idBoard").val().trim();
    var sql = null;
    var sqlPost = " ORDER BY LOWER(labels.name) ASC";
    var params = [];
    var cWhere = 0;

    if (idBoard.length > 0) {
        sql = "SELECT labels.name FROM labels where idBoardShort = ?";
        cWhere++;
        params.push(idBoard);
    }
    else if (nameBoard.length > 0) {
        sql = "SELECT distinct(labels.name) FROM labels join boards on labels.idBoardShort=boards.idBoard where boards.name LIKE ?";
        cWhere++;
        params.push("%" + nameBoard + "%");
    }
    else {
        sql = "SELECT distinct(labels.name) FROM labels";
    }

    if (term != "") {
        if (cWhere == 0) {
            sql = sql + " WHERE";
        }
        else {
            sql = sql + " AND";
        }
        cWhere++;
        sql = sql + " labels.name LIKE ?";
        if (g_bDummyLabel)
            sql = sql + " AND labels.idLabel<>'" + IDLABEL_DUMMY + "'";
        params.push("%" + term + "%");
    }

    getSQLReport(sql + sqlPost, params, function (response) {
        var rows = response.rows;
        if (response.status != STATUS_OK || !rows) {
            autoResponse([]);
            return;
        }

        var ret = new Array(rows.length);

        for (var i = 0; i < rows.length; i++) {
            ret[i] = rows[i].name;
        }

        autoResponse(ret);
    });
}

function findMatchingLists(term, autoResponse) {
    if (term == "*")
        term = "";
    var nameBoard = $("#board").val().trim();
    var idBoard = $("#idBoard").val().trim();
    var sql = null;
    var sqlPost = " ORDER BY LOWER(lists.name) ASC";
    var params = [];
    var cWhere = 0;

    if (idBoard.length > 0) {
        sql = "SELECT lists.name FROM lists where idBoard = ?";
        cWhere++;
        params.push(idBoard);
    }
    else if (nameBoard.length > 0) {
        sql = "SELECT distinct(lists.name) FROM lists join boards on lists.idBoard=boards.idBoard where boards.name LIKE ?";
        cWhere++;
        params.push("%" + nameBoard + "%");
    }
    else {
        sql = "SELECT distinct(lists.name) FROM lists";
    }

    if (term != "") {
        if (cWhere == 0) {
            sql = sql + " WHERE";
        }
        else {
            sql = sql + " AND";
        }
        cWhere++;
        sql = sql + " lists.name LIKE ?";
        params.push("%" + term + "%");
    }

    getSQLReport(sql + sqlPost, params, function (response) {
        var rows = response.rows;
        if (response.status != STATUS_OK || !rows) {
            autoResponse([]);
            return;
        }

        var ret = new Array(rows.length);

        for (var i = 0; i < rows.length; i++) {
            ret[i] = rows[i].name;
        }

        autoResponse(ret);
    });
}

function findMatchingUsers(term, autoResponse) {
    if (term == "*")
        term = "";
    var sql = "SELECT distinct(user) FROM history";
    var sqlPost = " ORDER BY LOWER(user) ASC";
    var params = [];
    if (term != "") {
        sql = sql + " where user LIKE ?";
        params.push("%" + term + "%");
    }
    sql = sql + sqlPost;
    getSQLReport(sql, params, function (response) {
        var rows = response.rows;
        if (response.status != STATUS_OK || !rows) {
            autoResponse([]);
            return;
        }

        var ret = new Array(rows.length);

        for (var i = 0; i < rows.length; i++) {
            ret[i] = rows[i].user;
        }

        autoResponse(ret);
    });
}


function findMatchingWeeks(term, autoResponse) {
    if (term == "*")
        term = "";
    var date = new Date();
    var rg = [];
    var daysDelta = 7;
    for (var i = 0; i < 53; i++) {
        rg.push(getCurrentWeekNum(date));
        date.setDate(date.getDate() - daysDelta);
    }
    autoResponse(term == "" ? rg : rg.filter(function (item) {
        return (item.indexOf(term) >= 0);
    }));
}

function findMatchingMonths(term, autoResponse) {
    if (term == "*")
        term = "";
    var date = new Date();
    var rg = [];
    var daysDelta = 7;
    date.setDate(1);
    for (var i = 0; i < 24; i++) {
        rg.push(getCurrentMonthFormatted(date));
        date.setMonth(date.getMonth() - 1);
    }

    autoResponse(term == "" ? rg : rg.filter(function (item) {
        return (item.indexOf(term) >= 0);
    }));
}

var g_portBackground = null;

function setupNotifications() {
    if (g_portBackground != null)
        return;
    g_portBackground = chrome.runtime.connect({ name: "registerForChanges" });
    g_portBackground.onMessage.addListener(function (msg) {
        if (msg.status != STATUS_OK)
            return;

        if (msg.event == EVENTS.DB_CHANGED) {
            hiliteOnce($("#agile_reload_page").show(), 10000);
        }
    });
}

function updateURLPart(part) {
    var params = getUrlParams();
    var elem = $("#" + part);
    var val = elem.val();
    if (elem[0].type == "checkbox")
        val = (elem[0].checked ? "true" : "");
    if (params[part] != val) {
        params[part] = val;
        updateUrlState(params);
    }
}

//Report bookmarks
//
//we create a special "Plus reports" folder inside Chrome Bookmarks bar.
//we use chrome sync to store the folder id (assumes Chrome keeps folder id of synced bookmarks)
//REVIEW: verify claim above
//if the sync id is invalid or nonexistent, we search by folder name. If that fails we create the folder.
//before saving the bookmark, the url is updated to reflect current report inputs

function createReportBookmark() {
    const SYNCPROP_idFolderParentBookmark = "idFolderParentBookmark";
    const nameFolderParent = "Plus reports";
    var url = buildUrlFromParams(getUrlParams(), true); //cleans up url
    chrome.storage.sync.get([SYNCPROP_idFolderParentBookmark], function (objs) {
        var idFolderPlus = objs[SYNCPROP_idFolderParentBookmark] || null;
        if (idFolderPlus) {
            chrome.bookmarks.get(idFolderPlus, function (bookmarks) {
                if (bookmarks && bookmarks.length == 1)
                    saveBookmark(bookmarks[0].id);
                else
                    stepFindFolder();
            });
        } else {
            stepFindFolder();
        }

    });


    function stepFindFolder() {
        chrome.bookmarks.search({ url: null, title: nameFolderParent }, function (nodes) {
            if (nodes && nodes.length > 0) {
                stepSaveFolderAndBookmark(nodes[0].id);
            } else {
                stepCreateFolder();
            }
        });
    }

    function stepCreateFolder() {
        const idChromeBookmarksBar = "1"; //https://bugs.chromium.org/p/chromium/issues/detail?id=21330#c4
        chrome.bookmarks.create({ parentId: idChromeBookmarksBar, title: nameFolderParent }, function (bookmark) {
            if (bookmark)
                stepSaveFolderAndBookmark(bookmark.id);
        });
    }

    function stepSaveFolderAndBookmark(idBookmark) {
        var pair = {};
        pair[SYNCPROP_idFolderParentBookmark] = idBookmark;
        chrome.storage.sync.set(pair, function () {
            var err = chrome.runtime.lastError; //just reference it, but we proceed even in failure
            saveBookmark(idBookmark);
        });
    }

    function saveBookmark(idParent) { 
        var title = window.prompt('Bookmark name:');
        if (!title)
            return;
        title = title.trim();
        chrome.bookmarks.create({ parentId: idParent, title: title, url: url }, function (bookmark) {
            if (!bookmark)
                alert('Error saving bookmark :(');
            else {
                chrome.bookmarks.get(idParent, function (bookmarks) {
                    if (bookmarks && bookmarks.length == 1)
                        sendDesktopNotification("Saved in '"+bookmarks[0].title+"' Chrome bookmark folder.", 4000);
                });
            }
        });
    }
}


//see https://docs.google.com/a/plusfortrello.com/spreadsheets/d/1ECujO3YYTa3akMdnCrQ5ywgWnqybJDvXnVLwxZ2tT-M/edit?usp=sharing
var g_mapNameFieldToInternal = {
    team: "idTeamH",
    board: "idBoardH",
    list: "nameList",
    card: "idCardH",
    hashtag: "hashtagFirst",
    hashtag1: "hashtagFirst",
    hashtags: "hashtags",
    labels: "labels", 
    user: "user",
    keyword: "keyword",
    date: "dateString",
    dowName: "dowName",
    week: "week",
    month: "month",
    note: "comment"
};

function refreshBuildSqlMode(params) {
    if (params["board"] || !params["idBoard"]) {
        $("#team").parent().show();
        $("#board").parent().show();
    }
    else {
        $("#board").parent().hide();
        $("#team").parent().hide();
    }
}

function updateOutputFormat(format) {
    var msg;
    if (!format || format == "csv")
        msg = "Can cause <A href='http://stackoverflow.com/questions/4438589' target='_blank'>issues with special characters</A> when opening in Excel.";
    else
        msg = "Note about the <A href='https://support.microsoft.com/en-us/help/948615' target='_blank'>warning in Excel</A>.";
    $("#noteExportFormat").html(msg);

}

document.addEventListener('DOMContentLoaded', function () {
    g_progress.init();
    loadStorageGlobals(function () {
        loadAll();
    });
    //setTimeout(loadAll,100); //review this might help reduce timing issues
});

function loadAll() {
    //chrome Content Security Policy (CSP) needs DOMContentLoaded
    if (g_bLoaded)
        return;
    g_bLoaded = true;

    $("#selectAllColumns").bsmSelect({
        addItemTarget: 'bottom',
        animate: true,
        highlight: true,
        listClass: "bsmListCustomColumns",
        plugins: [
          $.bsmSelect.plugins.sortable({ axis: 'y', opacity: 0.5 }, { }),
          $.bsmSelect.plugins.compatibility()
        ]
    });

    $("#checkCustomColumns").change(function () {
        var bChecked = ($("#checkCustomColumns")[0].checked == true);
        var elemSection = $("#section_customColumns");
        if (!bChecked) {
            elemSection.hide();
        } else {
            elemSection.show();
        }
    });

    $("#checkOutputReport").change(function () {
        var elemOutputFormatHelp = $("#noteExportFormat");
        if (this.checked)
            elemOutputFormatHelp.show();
        else
            elemOutputFormatHelp.hide();
    });

    $("#outputFormat").change(function () {
        updateOutputFormat($(this).val());
    });

    addTableSorterParsers();
    //any params that do not have a UI counterpart will be stripped later, so get them here and set a few global states
    var params = getUrlParams();
    var bDisableSort = false;
    var namedReport = params[g_namedParams.namedReport];
    var bNeedReplaceState = false;
    g_bPopupMode = (params["popup"] == "1"); //this one wins over saved one
    g_bBuildSqlMode = (params["getsql"] == "1");

    if (!g_bBuildSqlMode)
        hitAnalytics("Reports", "open-" + (g_bPopupMode ? "inPopup" : "window"), true);

    if (namedReport) {
        g_namedReport = namedReport;
        if (params["useStoredNamed"]) {
            var urlNew = localStorage[g_namedParams.namedReport + ":" + namedReport];
            if (urlNew) {
                params = getUrlParams(urlNew);
                //for safety prevent bad params from getting stuck
                params["popup"] = (g_bPopupMode ? "1" : "0");
                params["getsql"] = (g_bBuildSqlMode ? "1" : "0");
                bNeedReplaceState = true;
            }
        }

        if (g_namedReport == NR_POPUP_REMAIN || g_namedReport == NR_HOME_REMAIN) {
            bDisableSort = true;
            params["orderBy"] = "remain"; //force. we disable it so user could get stuck if someone the combo changes (in theory shouldnt change thou)
            bNeedReplaceState = true;
        }
    }

    if (bNeedReplaceState) {
        if (g_namedReport)
            params[g_namedParams.namedReport] = g_namedReport;
        window.history.replaceState('data', '', buildUrlFromParams(params));
    }

    if (!g_bPopupMode)
        $("body").removeClass("agile_report_minSize");
    else
        $(".agile_report_filters").addClass("agile_report_filters_smaller");

    if (g_bBuildSqlMode) {
        $("#tabs").hide();
        $("#agile_title_header_report").hide();
        $("#groupBy").parent().hide();
        $("#pivotBy").parent().hide();
        $("#orderBy").parent().hide();
        $("body").css("margin-top", "0px");
        $("#report_top_section").css("margin-bottom", "0px");
        $("#buttonFilter").appendTo($(".agile_alternate_filterPos"));
        refreshBuildSqlMode(params);
        doResizeFromParent();
    }

    loadTabs($("#tabs"));
    if (g_bNoSE)
        $(".agile_tab_pivot").hide();

    if (bDisableSort)
        $("#orderBy").prop('disabled', true);

    if (g_bNoSE) {
        $("#pivotBy").parent().hide();
        $("#user").parent().hide();
        $("#comment").parent().hide();
        
        $("#groupBy option[value*='user']").remove();
        $("#groupBy option[value*='comment']").remove();
        $("#groupBy option[value='']").remove();

        $("#orderBy option[value='spent']").remove();
        $("#orderBy option[value='est']").remove();
        $("#orderBy option[value='user']").remove();
    }

    if (g_bNoSE || g_bNoEst) {
        $("#orderBy option[value*='remain']").remove();
        $("#eType").parent().hide();
    }

    if (g_bPopupMode) {
        $("#spanChartHeight").hide();
        $("#team").parent().hide();
        $("#archived").parent().hide();
        $("#deleted").parent().hide();
        $("#eType").parent().hide();

        if (g_bPopupMode && !bDisableSort) {
            $("#orderBy option[value*='remain']").remove();
        }

        $("#card").parent().hide();
        //$("#list").parent().hide();
        $("#comment").parent().hide();

        if (params["orderBy"] == "remain") {
            $("#sinceSimple").parent().hide();
            $("#pivotBy").parent().hide();
            $(".agile_tab_rest").hide();
            $(".agile_tab_chart").show();
        }
    }
    else {
        $("#spanChartHeight").show();
        $("#archived").parent().show();
        $("#deleted").parent().show();
    }

    if (g_bPopupMode) {
        $("#report_title_rightLinks").hide();
        //$("body").height(470); //these two are also duplicated in report.html body so that reports opened from the popup (spent this week) has the right size (prevent flicker)
        //$("body").width(685);
        var dockOut = $("#dockoutImg");
        dockOut.attr("src", chrome.extension.getURL("images/dockout.png"));
        dockOut.show();
        dockOut.css("cursor", "pointer");


        var back = $("#backImg");
        back.attr("src", chrome.extension.getURL("images/back.png"));
        back.show();
        back.css("cursor", "pointer");
        back.off().click(function () {
            window.history.back();
            return false;
        });

    } else {
        $("#report_title_rightLinks").show();
    }

    openPlusDb(function (response) {
        if (response.status != STATUS_OK) {
            return;
        }
        if (!g_bBuildSqlMode)
            setupNotifications();

        $("#agile_reload_page_link").off().click(function (e) {
            e.preventDefault();
            var params = getUrlParams();
            if (g_bAddParamSetLastRowViewedToQuery)
                params["setLastRowViewed"] = "true";
            configReport(params, true);

        });

        $("#chartView").change(function () {
            var typeChart = $("#chartView").val();
            fillChart();
            var params = getUrlParams();
            if (params["chartView"] != typeChart) {
                params["chartView"] = typeChart;
                updateUrlState(params);
            }
        });

        
        $("#stackBy").change(function (evt) {
            var paramsOld = getUrlParams();
            var stackOld = paramsOld["stackBy"];
            var stack = $("#stackBy").val();
            var valGroupByOld = $("#groupBy").val();
            var valGroupByNew = valGroupByOld;
            updateURLPart("stackBy");
            var pGroups = valGroupByOld.split("-");
            if (stackOld && !stack && pGroups.length>1 && pGroups.indexOf(stackOld) >= 0) {
                if (confirm("Also remove '" + stackOld + "' from the Group-by?")) {
                    pGroups = pGroups.filter(function (group) {
                        return (group && group != stackOld);
                    });
                    valGroupByNew = pGroups.join("-");
                }
            }

            if (stack && pGroups.indexOf(stack) < 0) {
                pGroups.push(stack);
                pGroups = pGroups.filter(function (group) {
                    return (group && group != stackOld);
                });
                valGroupByNew = pGroups.join("-");
            }

            if (valGroupByNew != valGroupByOld) {
                var elemGroup = $("#groupBy");
                elemGroup.val(valGroupByNew);
                if (elemGroup.val() != valGroupByNew) {
                    elemGroup.append(new Option(remapGroupByToDisplay(valGroupByNew), valGroupByNew));
                    elemGroup.val(valGroupByNew);
                }
                updateURLPart("groupBy");
                sendDesktopNotification("Plus modified the 'group-by' to accomodate this stacking.",6000);
            }
            $("#buttonFilter").click(); //review zig: ugly but currently only way to get updated groupBy in case used changed it following stackby error from missing groupby
            //fillChart(true); //we used to do this instead of reloading the entire report, but since allowing group by id elements (team,board,card) chaert stacking can fail
        });

        var elemGroupBy = $("#groupBy");
        elemGroupBy.change(function () {
            handleCustom("");

            function handleCustom(valDefault) {
                var valGroup = elemGroupBy.val();
                if (valGroup == "custom") {
                    valDefault = valDefault || remapGroupByToDisplay(g_lastGroupSelection);
                    var strGroup = window.prompt("Enter groups separated by '-'\n\
Example: board-user-month will group counts and sums by board, then user, then month.\n\n\
• To prevent grouping, pick 'S/E rows' in the dropdown.\n\
• You can bookmark the report in Chrome after clicking query.\n\
• For more help, cancel and click Help top-right.\n\n\
Pick from:\n\
Team - Board - List - Card - Hashtag1 - Hashtags - Labels - User - Note - Keyword - Date - Month - Week", valDefault);
                    if (!strGroup)
                        elemGroupBy.val(g_lastGroupSelection);
                    else {
                        strGroup = strGroup.trim();
                        var groups = strGroup.split("-");
                        var groupsPretty = [];
                        for (var iGroup = 0; iGroup < groups.length; iGroup++) {
                            var gLower = groups[iGroup].toLowerCase().trim();
                            var mapped = g_mapNameFieldToInternal[gLower];
                            groupsPretty.push(capitalizeFirstLetter(gLower));
                            if (mapped)
                                groups[iGroup] = mapped;
                            else {
                                alert('"' + groups[iGroup] + '" is not valid.');
                                setTimeout(function () {
                                    handleCustom(strGroup);
                                }, 100);
                                return;
                            }
                        }
                        var strNew = groups.join("-");
                        elemGroupBy.val(strNew); //try again
                        if (elemGroupBy.val() != strNew) {
                            var strPretty = groupsPretty.join("-");
                            elemGroupBy.append($(new Option(strPretty, strNew)));
                            elemGroupBy.val(strNew);
                            g_lastGroupSelection = strNew;
                        }
                    }
                } else {
                    g_lastGroupSelection = valGroup;
                }
            }
        });


        $("#checkNoColorsChart").change(function () {
            updateURLPart("checkNoColorsChart");
            if (g_dataChart)
                g_dataChart.params["checkNoColorsChart"] = ($("#checkNoColorsChart")[0].checked == true ? "true" : "");
            fillChart(true);

        });

        $("#heightZoomChart").change(function () {
            //updateURLPart("heightZoomChart");
            if (g_dataChart)
                g_dataChart.params["heightZoomChart"] = parseInt($("#heightZoomChart").val(),10) || 0;
            fillChart(true);

        });

        function onBkColorChartChange(bFillChart) {
            updateURLPart("checkBGColorChart");
            if (g_dataChart)
                g_dataChart.params["checkBGColorChart"] = ($("#checkBGColorChart")[0].checked == true ? "true" : "");
            if (bFillChart)
                fillChart(true);
        }

        $("#checkBGColorChart").change(function () {
            onBkColorChartChange(true);
        });


        $("#colorChartBackground").change(function () {
            updateURLPart("colorChartBackground");
            if (g_dataChart)
                g_dataChart.params["colorChartBackground"] = $("#colorChartBackground").val();
            if (!$("#checkBGColorChart")[0].checked) {
                $("#checkBGColorChart")[0].checked = true;
                onBkColorChartChange(false);
            }
            fillChart(true);

        });

        function addFocusHandler(elem) {
            var specialAll = "*"; //wasted time getting .autocomplete to work on "" so this hack worksarround it
            elem.off("focus.plusForTrello").on("focus.plusForTrello", function () {
                if (this.value == "" || this.value == specialAll)
                    $(this).autocomplete("search", specialAll);
            });
        }

        addFocusHandler($("#keyword").autocomplete({
            delay: 0,
            minChars: 0,
            source: function (request, response) {
                findMatchingKeywords(request.term, response);
            }

        }));
        addFocusHandler($("#team").autocomplete({
            delay: 0,
            minChars: 0,
            source: function (request, response) {
                findMatchingTeams(request.term, response);
            }
        }));

        addFocusHandler($("#board").autocomplete({
            delay: 0,
            minChars: 0,
            source: function (request, response) {
                findMatchingBoards(request.term, response);
            }
        }));

        addFocusHandler($("#user").autocomplete({
            delay: 0,
            minChars: 0,
            source: function (request, response) {
                findMatchingUsers(request.term, response);
            }
        }));

        addFocusHandler($("#list").autocomplete({
            delay: 0,
            minChars: 0,
            source: function (request, response) {
                findMatchingLists(request.term, response);
            }
        }));


        addFocusHandler($("#weekStart").autocomplete({
            delay: 0,
            minChars: 0,
            source: function (request, response) {
                findMatchingWeeks(request.term, response);
            }
        }));

        addFocusHandler($("#weekEnd").autocomplete({
            delay: 0,
            minChars: 0,
            source: function (request, response) {
                findMatchingWeeks(request.term, response);
            }
        }));

        addFocusHandler($("#monthStart").autocomplete({
            delay: 0,
            minChars: 0,
            source: function (request, response) {
                findMatchingMonths(request.term, response);
            }
        }));

        addFocusHandler($("#monthEnd").autocomplete({
            delay: 0,
            minChars: 0,
            source: function (request, response) {
                findMatchingMonths(request.term, response);
            }
        }));

        addFocusHandler($("#label").autocomplete({
            delay: 0,
            minChars: 0,
            source: function (request, response) {
                findMatchingLabels(request.term, response);
            }
        }));


        configAllPivotFormats();
        configChartTab();
        loadReport(params);
    });
}

function configChartTab() {
    var copyWindow = $("#tabs-3").find(".agile_drilldown_select");

    if (copyWindow.length > 0) {
        copyWindow.attr("src", chrome.extension.getURL("images/copy.png"));
        copyWindow.attr("title", "Click to download as a PNG image.");
        copyWindow.off().click(function () {
            if (!g_dataChart || !g_dataChart.dnameLast) {
                alert("Error: Nothing to copy!");
                return;
            }
            var domain = g_dataChart.domains[g_dataChart.dnameLast];
            if (!domain)
                return;
            if (bCancelFromAlertLargeSize(domain, true))
                return;
            var elemChart = $("#chartPrintContainer");
            var nameChart = window.prompt("Name for the PNG file:", "chart");
            if (nameChart) {
                domtoimage.toBlob(elemChart[0]).then(function (blob) {
                    var link = document.createElement('a');
                    var url = URL.createObjectURL(blob);
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.download =nameChart.trim()+'.png'; 
                    link.href = url;
                    link.onclick = function () {
                        requestAnimationFrame(function () {
                            URL.revokeObjectURL(url);
                        })
                    };
                    link.click();
                });
            }
        });
    }
}

var g_cacheCells = {}; //cache cells to speed up formatting when user changes the ranges

function configPivotFormat(elemFormat, dataFormat, tableContainer, iTab) {
    var underElem = elemFormat.children(".agile_format_under");
    var overElem = elemFormat.children(".agile_format_over");
    var colorUnderElem = elemFormat.children(".agile_colorpicker_colorUnder");
    var colorOverElem = elemFormat.children(".agile_colorpicker_colorOver");
    var colorNormal = "#FFFFFF"; //review zig: get it from css
    var comboFormat = elemFormat.children(".agile_report_optionsFormat");
    var copyWindow = elemFormat.find(".agile_drilldown_select");

    if (copyWindow.length > 0) {
        copyWindow.attr("src", chrome.extension.getURL("images/copy.png"));
        copyWindow.attr("title", "Copy the table to the clipboard, then paste in a spreadsheet, an email etc.");
        copyWindow.off().click(function () {
            var table = tableContainer;
            selectElementContents(table[0]);
        });
    }

    underElem.val(dataFormat.format.u.v);
    colorUnderElem.val(dataFormat.format.u.c);
    overElem.val(dataFormat.format.o.v);
    colorOverElem.val(dataFormat.format.o.c);
    comboFormat.val(dataFormat.format.f || "smooth");

    function applyFormat(bFirstTime) {
        if (bFirstTime)
            applyFormatWorker(bFirstTime); //review zig: should be ok in setTimeout but here to reduce risk of making this change.
        else
            setTimeout(function () { applyFormatWorker(bFirstTime); }, 10);
    }

    function applyFormatWorker(bFirstTime) {
        var weekCur = getCurrentWeekNum(new Date());
        var strUnder = underElem.val();
        var strOver = overElem.val();
        var valUnder = (strUnder.length == 0 ? null : parseFloat(strUnder));
        var valOver = (strOver.length == 0 ? null : parseFloat(strOver));
        var colorUnder = colorUnderElem.val();
        var colorOver = colorOverElem.val();
        var formatType = comboFormat.val();
        var bNoFormat = formatType == "off";
        var bStrictFormat = formatType == "strict";
        var rgbUnder = rgbFromHex(colorUnder);
        var rgbOver = rgbFromHex(colorOver);

        if (bNoFormat) {
            savePivotFormat(dataFormat, colorUnder, colorOver, valUnder, valOver, formatType);
            valUnder = null;
            valOver = null;
            underElem.prop('disabled', true);
            overElem.prop('disabled', true);

        }
        else {
            savePivotFormat(dataFormat, colorUnder, colorOver, valUnder, valOver, formatType);
            underElem.removeAttr('disabled');
            overElem.removeAttr('disabled');
        }

        if (bFirstTime && (bNoFormat || (valUnder === null && valOver === null)))
            return; //performance

        if (g_iTabCur != null && g_iTabCur != iTab)
            setTimeout(function () { workerCells(); }, 200);
        else
            workerCells();

        function workerCells() {
            var cells = g_cacheCells[dataFormat.key];
            if (cells === undefined) {
                cells = tableContainer.find(".agile_pivot_value");
                if (!bFirstTime)
                    g_cacheCells[dataFormat.key] = cells; //cache when called from format change so its fast as the user changes values
            }

            cells.each(function () {
                var bUsedUnder = false;
                var rgb = null;
                var el = $(this);
                var val = parseFloat(el.text());
                var color = colorNormal;

                if (el.data("agile_total_row") == "true") {
                    //until the week is done doesnt make sense to color under
                    color = "#FFFFFF";
                    rgb = null; //so it resets below
                }
                else if (valUnder == null && valOver == null)
                    color = colorNormal;
                else if (valUnder != null && val < valUnder) {
                    color = colorUnder;
                    bUsedUnder = true;
                }
                else if (valOver != null && val > valOver)
                    color = colorOver;
                else if (!bStrictFormat && (valUnder != null || valOver != null)) {
                    //in between
                    var distance = 0;
                    if (valUnder != null && valOver != null)
                        distance = valOver - valUnder;
                    else if (valUnder != null)
                        distance = valUnder;
                    else
                        distance = valOver;
                    distance = distance / 4;

                    var rgbLeft = null;
                    var rbgRight = null;
                    var rgbWhite = rgbFromHex("#FFFFFF");
                    var percentSpread = 0.7; //% of the color range to use.
                    //used to leave 1/2 of the difference on each side so its easier to distinguish the actual boundary
                    var diff = 0;
                    if (valUnder != null && (val - valUnder <= distance)) {
                        rgbLeft = rgbUnder;
                        rgbRight = rgbWhite;
                        diff = val - valUnder;
                        bUsedUnder = true;
                    } else if (valOver != null && (valOver - val <= distance)) {
                        rgbLeft = rgbOver;
                        rgbRight = rgbWhite;
                        diff = valOver - val;
                    }

                    if (rgbLeft == null) {
                        rgb = rgbWhite;
                    } else {
                        rgb = [];
                        var iColor = 0;
                        var rate = (1 - percentSpread) / 2 + (diff / distance) * percentSpread;
                        for (; iColor < 3; iColor++)
                            rgb.push(Math.round(rgbLeft[iColor] + (rgbRight[iColor] - rgbLeft[iColor]) * rate));
                    }
                    color = "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")";
                }

                if (bUsedUnder && el.data("agile_week") == weekCur) {
                    //until the week is done doesnt make sense to color under
                    color = "#FFFFFF";
                    rgb = null; //so it resets below
                }

                el.css("background", color);
                var colorText = g_colorTrelloBlack;

                if (el.hasClass("agile_pivotCell_Zero"))
                    colorText = color; //prevent filling report with zeros which clutter it. value is there but with color equal to background
                else
                    colorText = colorContrastWith(color, rgb, g_colorTrelloBlack);

                el.css("color", colorText);
            });
        }
    }

    applyFormat(true);
    comboFormat.off().change(function () {
        applyFormat(false);
    });

    function onEditsChange() {
        applyFormat(false);
    }

    underElem.off().on('input', onEditsChange);
    overElem.off().on('input', onEditsChange);
    colorUnderElem.off().on('input', onEditsChange);
    colorOverElem.off().on('input', onEditsChange);
}

function colorContrastWith(color, rgb, colorTrelloBlack) {
    var colorText = colorTrelloBlack;

    if (!rgb)
        rgb = rgbFromHex(color);
    if (rgb) {
        var sum = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722; //standard luminance. This will never be perfect a user's gamma/calibration is never the same.
        if (sum < 128)
            colorText = "white";
    }
    return colorText;
}


function rgbFromHex(hex) {
    var regexRGB = /^#([\da-fA-F]{2})([\da-fA-F]{2})([\da-fA-F]{2})/;
    var rgb = regexRGB.exec(hex);
    if (!rgb) {
        var hexNamedColor = g_colours[hex.toLowerCase()];
        if (hexNamedColor) {
            rgb = regexRGB.exec(hexNamedColor);
        }
        if (!rgb)
            return null;
    }
    return [parseInt(rgb[1], 16), parseInt(rgb[2], 16), parseInt(rgb[3], 16)];
}

function savePivotFormat(dataFormat, colorUnder, colorOver, valUnder, valOver, formatType) {
    var before = JSON.stringify(dataFormat.format);
    var obj = dataFormat.format.u;
    obj.c = colorUnder;
    obj.v = valUnder;
    obj = dataFormat.format.o;
    obj.c = colorOver;
    obj.v = valOver;
    dataFormat.format.f = formatType;
    var after = JSON.stringify(dataFormat.format);
    var waitNormal = 4000;

    function saveToSync(bNow) {
        //look until it stabilizes, otherwise dont sync it this time.
        var lastFormat = JSON.stringify(dataFormat.format);
        var wait = waitNormal * 3 / 4;
        if (bNow && bNow == true)
            wait = 200;

        setTimeout(function () {
            if (!bNow && g_cSyncSleep > 0) {
                g_cSyncSleep--;
                return;
            }
            var currentFormat = JSON.stringify(dataFormat.format);
            if (currentFormat != lastFormat)
                return;
            var pair = {};
            var cCur = dataFormat.cCur; //separate from global format
            pair[dataFormat.key] = dataFormat.format;
            chrome.storage.sync.set(pair, function () {
                if (chrome.runtime.lastError === undefined)
                    dataFormat.cLastWrite = Math.max(dataFormat.cLastWrite, cCur);
                else
                    g_cSyncSleep = 5; //will sleep next x cicles
            });
        }, wait);
    }

    if (before != after) {
        dataFormat.cCur++;
        if (dataFormat.interval == null) {
            saveToSync(true); //first change saves right away
            dataFormat.interval = setInterval(function () {
                if (dataFormat.cCur != dataFormat.cLastWrite)
                    saveToSync(false);
            }, waitNormal); //keep sync quotas happy
        }
    }
}

function invertColor(hexTripletColor) {
    var color = hexTripletColor;
    color = color.substring(1);           // remove #
    color = parseInt(color, 16);          // convert to integer
    color = 0xFFFFFF ^ color;             // invert three bytes
    color = color.toString(16);           // convert to hex
    color = ("000000" + color).slice(-6); // pad with leading zeros
    color = "#" + color;                  // prepend #
    return color;
}

function capitalizeFirstLetter(string) {
    return string[0].toUpperCase() + string.slice(1);
}

function remapGroupByToDisplay(str) {
    var groups = str.split("-");
    var strDisplay = str;
    for (var iGroup = 0; iGroup < groups.length; iGroup++) {
        var strGroup = groups[iGroup].toLowerCase();
        var bMapped = false;
        for (var iMap in g_mapNameFieldToInternal) {
            if (g_mapNameFieldToInternal[iMap].toLowerCase() == strGroup) {
                groups[iGroup] = capitalizeFirstLetter(iMap);
                bMapped = true;
                break;
            }
        }
        if (!bMapped)
            return ""; //means error
    }
    return groups.join("-");
}

function getParamAndPutInFilter(elem, params, name, valDefault) {
    var value = params[name];
    var str = "";
    var bShowHide = (valDefault == "showhide");
    if (!bShowHide)
        str = valDefault;
    if (value && value != "")
        str = decodeURIComponent(value);
    if (name.indexOf("check") == 0)
        elem[0].checked = (str == "true");
    else {
        elem.val(str);
        if (name == "groupBy")
            g_lastGroupSelection = str;

        if (elem.val() != str) {
            //allow user to type a random filter from the url
            if (elem.is("select")) {
                var strDisplay = str;
                if (name == "groupBy")
                    strDisplay = remapGroupByToDisplay(str);
                elem.append($(new Option(strDisplay, str)));
                elem.val(str);
            }
        }
    }
    if (bShowHide) {
        var parent = elem.parent();
        if (str.length > 0)
            parent.show();
        else {
            parent.hide();
        }
    }

    return str;
}

function loadReport(params) {
    selectTab(params["tab"] || null);
    $("#divMain").show();
    var bDontQuery = (params[g_namedParams.dontQuery] == "1");
    var bFromMarkAllViewed = (params[g_namedParams.markAllViewed] == "1");
    var szSortListParam = params[g_namedParams.sortListNamed];
    if (szSortListParam) {
        g_sortListNamed = JSON.parse(szSortListParam);
        g_orderByWhenSortList = params["orderBy"];
    }
    else {
        g_sortListNamed = null;
    }
    var sinceSimple = "";
    if (params.weekStartRecent == "true") {
        sinceSimple = "w-4";
    }

    g_idCardSelect = params.idCardSelect;

    if (params.setLastRowViewed == "true")
        g_bNeedSetLastRowViewed = true;
    else
        g_bNeedSetLastRowViewed = false;

    var comboSinceSimple = $("#sinceSimple");
    var comboOrderBy = $('#orderBy');
    var groupDateAdvanced = $("#groupDateAdvanced");

    //note: "all" in comboSinceSimple has value "" thus gets selected by default when there is no param
    function updateDateState() {
        if (comboSinceSimple.val() == FILTER_DATE_ADVANCED) {
            groupDateAdvanced.show();
            selectTab(g_iTabCur); //body size can change when showing fields
        } else {
            groupDateAdvanced.hide();
            selectTab(g_iTabCur); //body size can change when hiding fields
        }
    }

    comboSinceSimple.off().change(function () {
        updateDateState();
    });

    comboOrderBy.off().change(function () {
        if (comboOrderBy.val() == "remain") {
            comboSinceSimple.val("");
            hiliteOnce(comboSinceSimple);
            updateDateState();

        }
    });


    if (g_bProVersion)
        $("#labelOptionsProOnly").hide();

    var editLabels = $("#label");
    var editKeyword = $("#keyword");
    g_bShowKeywordFilter = (g_optEnterSEByComment.IsEnabled() && g_optEnterSEByComment.getAllKeywordsExceptLegacy().length > 1);

    if (params["checkNoColorsChartCount"]) //old property
        params["checkNoColorsChart"] = params["checkNoColorsChartCount"]; //migrate
    if (params["stackCount"]) //old property
        params["stackBy"] = params["stackCount"]; //migrate

    if (params["sinceSimple"] && params["sinceSimple"].toLowerCase() == FILTER_DATE_ADVANCED.toLowerCase() && !params["weekStart"] && !params["weekEnd"] && !params["monthStart"] && !params["monthEnd"]) {
        params["sinceSimple"] = "";
    }

    var elemAllCustomColumns = $("#selectAllColumns");
    var elemCheckCCol = $("#checkCustomColumns");
    if (params["customColumns"]) {
        var optsPush = [];
        var opt;
        var columnsSet = params["customColumns"].split(",");
        //note that the bsmselect library cannot handle well initial selection sort, see https://github.com/vicb/bsmSelect/issues/34
        //to workarround, we re-order the original list so that it puts the ordered list at the beginning of the list, thus preserving sort
        //of the multi selection
        columnsSet.forEach(function (elem) {
            opt = elemAllCustomColumns.children('option[value="' + elem + '"]');
            var text = opt.text();
            opt.remove();
            optsPush.push(new Option(text, elem));
        });
        while (optsPush.length > 0) {
            opt = optsPush.pop();
            $(opt).attr('selected', 'selected');
            elemAllCustomColumns.prepend(opt);
        }
        elemAllCustomColumns.change();
        elemCheckCCol[0].checked = true;
        elemCheckCCol.change();
    }

    var elems = {
        stackBy: "", checkNoColorsChart: "false", checkBGColorChart: "false", colorChartBackground: "#FFFFFF", chartView: g_chartViews.cardcount, keyword: "showhide", groupBy: "", pivotBy: "", orderBy: "date", showZeroR: "", sinceSimple: sinceSimple, weekStart: "", weekEnd: "",
        monthStart: "", monthEnd: "", user: "", team: "", board: "", list: "", card: "", label: "", comment: "", eType: "all", archived: "0", deleted: "0",
        idBoard: "showhide", idCard: "showhide", checkNoCrop: "false", afterRow: "showhide", checkNoCharts: "false",
        checkAddCustomFields: "false", checkNoLabelColors: "false", checkNoBracketNotes: false, checkOutputCardShortLink: "false", checkOutputBoardShortLink: "false", checkOutputReport: "false", outputFormat: "csv", checkOutputCardIdShort: "false",
        checkHideAnnotationTexts: "false", checkHideZoomArea: false, checkSyncBeforeQuery: "false", checkNoPartialE: "false"
    };


    if (params["groupBy"] == "custom")
        params["groupBy"] = ""; //too late here

    for (var iobj in elems) {
        var elemCur = $("#" + iobj);
        elemCur.off("keypress.plusForTrello").on("keypress.plusForTrello", function (event) {
            if (g_bIgnoreEnter)
                return;
            var keycode = (event.keyCode ? event.keyCode : event.which);
            if (keycode == '13') { //enter key
                onQuery();
            }
        });

        getParamAndPutInFilter(elemCur, params, iobj, elems[iobj]);
        if ((iobj == "idBoard" || iobj == "idCard") && params[iobj])
            hiliteOnce(elemCur);
        //localStorage[PROP_LS_bShowedDefaultCPMCountsListFilter] = "";
        if (g_namedReport == "_counts" && iobj == "list" && !localStorage[PROP_LS_bShowedDefaultCPMCountsListFilter] && params[iobj] == "doing") {
            localStorage[PROP_LS_bShowedDefaultCPMCountsListFilter] = "true";
            hiliteOnce(elemCur, 400, undefined, 5);
        }
    }

    var elemChartMessage = $("#chartMessage");
    elemChartMessage.text(""); //reset
    g_bNoGroupChart = false;
    if (params["checkNoCharts"] == "true") {
        elemChartMessage.text("To view charts, uncheck 'No Charts' from reports Options and query again.");
    } else if (!params["groupBy"]) {
        elemChartMessage.text(g_strMessageNoGroupChart);
        g_bNoGroupChart = true;
    }

    var elemOutputFormatHelp = $("#noteExportFormat");
    if (params["checkOutputReport"] == "true")
        elemOutputFormatHelp.show();
    else
        elemOutputFormatHelp.hide();
    updateOutputFormat(params["outputFormat"]);
    if (g_bShowKeywordFilter)
        editKeyword.parent().show();
    else {
        editKeyword.parent().hide();
        if ($("#orderBy").val().toLowerCase().indexOf("keyword")<0)
            $("#orderBy option[value*='keyword']").remove();
        if ($("#groupBy").val().toLowerCase().indexOf("keyword")<0)
            $("#groupBy option[value*='keyword']").remove();
    }

    if (!g_bEnableTrelloSync) {
        $("#list").prop('disabled', true).prop("title", "Disabled until you enable Sync from Plus help.");
        $("#orderBy option[value*='nameList']").remove();
        $("#orderBy option[value*='posList']").remove();
        $("#groupBy option[value*='nameList']").remove();
    }

    if (!g_bPopupMode && !g_bEnableTrelloSync) {
        var strAppendNoSync = "Enable sync to use archived and deleted.";
        $("#archived").prop('disabled', true).addClass("agile_background_disabled").prop("title", strAppendNoSync);
        $("#deleted").prop('disabled', true).addClass("agile_background_disabled").prop("title", strAppendNoSync);
    }

    updateDateState();
    var btn = $("#buttonFilter");

    $("#dockoutImg").off().click(function () { //cant use setPopupClickHandler because url could have changed if user navigated inside 
        onQuery(false, true, function (status) {
            if (status == STATUS_OK) {
                var urlDockout = buildUrlFromParams(getUrlParams(), true);
                chrome.tabs.create({ url: urlDockout });
            }

        });
        return false;
    });

    $("#saveReport").off().click(function () {
        chrome.permissions.request({
            permissions: ["bookmarks"]
        }, function (granted) {
            if (chrome.runtime.lastError) {
                alert(chrome.runtime.lastError.message || "Error");
                return;
            }
            if (!granted) {
                alert("To use this feature, grant the permission to create Chrome bookmarks.");
                return;
            }
            onQuery(false, true, function (status) {
                if (status==STATUS_OK)
                    createReportBookmark();
            });

        });
    });

    //g_msLastLoadedGlobals = Date.now();
    function onQuery(bFirstTime, bOnlyUpdateUrl, callbackQuery) {
        if (Date.now() - g_msLastLoadedGlobals > 1000) {
            //this helps when changing options from another tab and querying again, ie when enabling pro version we dont want to again say its not enabled
            loadStorageGlobals(function () {
                onQueryWorker(bFirstTime, bOnlyUpdateUrl, callbackQuery);
            });
        } else {
            onQueryWorker(bFirstTime, bOnlyUpdateUrl, callbackQuery);
        }
        
    }
    function onQueryWorker(bFirstTime, bOnlyUpdateUrl, callbackQuery) {
        if (bFirstTime && g_bBuildSqlMode)
            bFirstTime = false;

        g_cacheCells = {}; //clear cache
        if (false) { //review zig: figure out how to make this work.
            var iForms = 0;
            var forms = $("form");
            function handleFormsSubmit(iform, forms) {
                setTimeout(function () {
                    document.forms[forms[iform].name].submit();
                    if (iform + 1 < forms.length)
                        handleFormsSubmit(iform + 1, forms);
                }, 100);
            }

            handleFormsSubmit(0, forms);
        }
        
        if (!bOnlyUpdateUrl) {
            if (!g_bBuildSqlMode) {
                setBusy(true, btn);
                btn.attr('disabled', 'disabled');
            }
            if (bFirstTime)
                btn.text("•••");
        }

        for (var iobj in elems) {
            if (iobj == "tab")
                continue;
            var elemCur = $("#" + iobj);
            if (iobj.indexOf("check") == 0)
                elems[iobj] = (elemCur[0].checked ? "true" : "false"); //keep it a string so its similar to the other properties
            else {
                elems[iobj] = elemCur.val();
                //clear advanced date filters if a simple one is being used. Do it on query and not on list change so user can experient with the ui without losing what was typed.
                if (iobj == "sinceSimple" && elems[iobj] != FILTER_DATE_ADVANCED)
                    groupDateAdvanced.find("input").val(""); //review: implement a "postGet" event defined per field so each field handles this
            }
        }


        if (elemCheckCCol[0].checked) {
            var options = $("#selectAllColumns")[0].options;
            var opt;
            var opts = [];
            for (var iOpt = 0; iOpt < options.length; iOpt++) {
                opt = options[iOpt];

                if (opt.selected)
                    opts.push(opt.value);
            }
            elems["customColumns"] = opts.join(",");
        }

        assert(g_iTabCur != null);
        elems["tab"] = g_iTabCur;

        if (bFirstTime && !g_bPopupMode) {
            //these set of timeouts could be done all together but the GUI wont update instantly.
            //handles this case: 1) make a huge report, 2) view by User, 3) change the filter and click Query again.
            //without this, the pivot view would take a long time to clear because its waiting for the report to clear (which can take a few seconds with 10,000 rows).
            $(".agile_report_container_byUser").empty().html("&nbsp;&nbsp;&nbsp;•••");
            $(".agile_report_container_byBoard").empty().html("&nbsp;&nbsp;&nbsp;•••");
            $(".agile_topLevelTooltipContainer").empty().html("&nbsp;&nbsp;&nbsp;•••");
            configReport(elems, undefined, undefined, callbackQuery);
        } else {
            configReport(elems, !bFirstTime && !g_bBuildSqlMode, bOnlyUpdateUrl, callbackQuery);
        }
    }

    var headerOptions = $("#headerOptions");
    var containerOptions = $("#optionsContainer");
    var headerTemplates = $("#headerTemplates");
    var containerTemplates = $("#templatesContainer");

    if (g_bBuildSqlMode)
        containerOptions.hide();
    else 
        containerOptions.show();
    
    if (g_bBuildSqlMode || g_bPopupMode)
        containerTemplates.hide();
    else
        containerTemplates.hide();
        
    headerTemplates.off().click(function () {
        handleSectionSlide(containerTemplates, $("#templates_section"), undefined, undefined, function () {
            selectTab(g_iTabCur, undefined, true);
        });
    });


    headerOptions.off().click(function () {
        handleSectionSlide(containerOptions, $("#report_options_section"), undefined, undefined, function () {
            selectTab(g_iTabCur, undefined, true);
        });
    });

    btn.off().click(function () {
        onQuery();
    });

    if (!g_bBuildSqlMode && Object.keys(params).length > 0 && !bDontQuery) { //dont execute query automatically
        if (g_bPopupMode)
            onQuery(true);
        else
            setTimeout(function () { onQuery(true); }, 10);
    }
    else {
        if (!g_bBuildSqlMode) {
            delete params[g_namedParams.dontQuery];
            delete params[g_namedParams.markAllViewed];
            updateUrlState(params);
        }
        resetQueryButton(btn);
        if (bFromMarkAllViewed) {
            $("#reportBottomMessage").show().html("s/e rows marked viewed. Query a new report or <button id='report-close-window'>close this window</button>");
            $("#report-close-window").off("click.plusForTrello").on("click.plusForTrello", function (e) {
                window.close();
            });

        }
        if (g_bBuildSqlMode)
            onQuery(true);
        else
            hiliteOnce($("#buttonFilter"));
    }
}


function showError(err) {
    alert("Plus for Trello:" + err);
}

function completeString(str, pattern) {
    var c = pattern.length;
    while (str.length < c)
        str = str + pattern.charAt(str.length);
    return str;
}

//advancedParams:
// bNoWhereAnd: IN. hacky. will also not increment cFilters
// bLabelMode: IN
// bNegateAll : OUT
// errorParse: OUT. if set (string), a parsing error occurred
function buildSqlParam(param, params, table, sqlField, operator, state, completerPattern, btoUpper, advancedParams) {
    advancedParams = advancedParams || {};
    if (table)
        table = table + ".";
    else
        table = "";
    if (btoUpper === undefined)
        btoUpper = true;
    var val = params[param];
    if (val == "")
        return "";

    var bString = (typeof (val) == 'string');
    if (completerPattern)
        val = completeString(val, completerPattern);
    var sql = "";
    var parts = null;
    if (bString) {
        val = val.trim();
        if (btoUpper)
            val = val.toUpperCase();
    }

    //review zig: need more generic way to interpret parameters without hardcoding all here
    if (param == "eType")
        val = g_mapETypeParam[val];

    if (param == "sinceSimple") {
        parts = val.split("-");
        if (parts.length < 2)
            return "";	 //ignore if value is not in tuple format. caller deals with those (advanced, all, etc)
        var now = new Date();
        now.setHours(0, 0, 0, 0);
        var delta = (parseInt(parts[1], 10) || 0) - 1;
        if (parts[0] == "W")
            delta = (delta * 7) + DowMapper.posWeekFromDow(now.getDay());

        now.setDate(now.getDate() - delta);
        val = Math.round(now.getTime() / 1000); //db date are in seconds
    }

    //a bit ugly to reuse the old month field but it was easiest like this and falls back to month when needed
    //historically this only filtered on months. really using the month field is about the same as using the date filter perf-wise
    //but keeping the special-case month filter as it might be a bit faster on large reports
    if (param == "monthStart" || param == "monthEnd") {
        parts = val.split("-");
        if (parts.length == 3) {
            var yearParsed = parseInt(parts[0], 10);
            var monthParsed = parseInt(parts[1], 10);
            var dayParsed = parseInt(parts[2], 10);
            if (yearParsed > 1900 && monthParsed > 0 && dayParsed > 0) {
                var dateParsed = new Date(yearParsed, monthParsed - 1, dayParsed);
                if (param == "monthEnd")
                    dateParsed.setHours(23, 59, 59, 999);
                sqlField = "date";
                val = Math.round(dateParsed.getTime() / 1000); //db date are in seconds
            }
        }
    }

    if (param == "archived") {
        val = parseInt(val, 10) || 0;
        if (val < 0) //"All" is -1
            return "";
    }

    if (param == "deleted") {
        val = parseInt(val, 10) || 0;
        if (val < 0) //"All" is -1
            return "";
    }

    bString = (typeof (val) == 'string'); //refresh

    if (!advancedParams.bNoWhereAnd) {
        if (state.cFilters == 0)
            sql += " WHERE ";
        else
            sql += " AND ";
    }

    var decorate = "";
    var bAllowOrAnd = false;

    if (operator.toUpperCase() == "LIKE") {
        assert(bString);
        decorate = "%";
        bAllowOrAnd = true;
    }

    if (bAllowOrAnd && val.length > 1) {
        var chFirst = val.charAt(0);
        var chLast = val.slice(-1);
        if ((chFirst == "'" || chFirst == '"') && chFirst == chLast) {
            bAllowOrAnd = false;
            val = val.substring(1, val.length - 1);
        }
    }

    var opOrAnd = "";
    var opOrAndOrig = "";
    var valElems = [val];
    if (bAllowOrAnd) {
        if (val.indexOf(" AND ") > 0)
            opOrAnd = " AND ";
        else if (val.indexOf(" OR ") > 0)
            opOrAnd = " OR ";

        opOrAndOrig = opOrAnd;
        if (opOrAnd) {
            valElems = val.split(opOrAnd);
        }
    }

    var bMultiple = valElems.length > 1;
    var cProcessed = 0;
    var cNegated = 0;
    var cFiltersAdd = 0;
    var valuesAdd = [];
    if (bMultiple)
        sql += "(";
    valElems.forEach(function (val) {
        cProcessed++;
        var opNot = "";
        if (bString)
            val = val.trim();
        if (bAllowOrAnd && val.charAt(0) == "!") {
            opNot = "NOT ";
            cNegated++;
            val = val.substr(1);
            if (advancedParams.bLabelMode) {
                opNot = "";
                advancedParams.bNegateAll = true;
                if (opOrAnd)
                    opOrAnd = " OR "; //apply !A AND !B AND !C --> !(A OR B OR C)
            }
        }

        if (bString && btoUpper)
            sql += ("UPPER(" + table + sqlField + ") " + opNot + operator + " ?");
        else
            sql += (table + sqlField + " " + operator + " ?");

        if (bMultiple && cProcessed != valElems.length)
            sql = sql + opOrAnd;
        if (!advancedParams.bNoWhereAnd)
            cFiltersAdd++;
        valuesAdd.push(decorate == "" ? val : decorate + val + decorate);
    });

    if (advancedParams.bLabelMode) {
        if (opOrAnd == " AND ") {
            advancedParams.errorParse = "AND is not supported unless all terms are negated, as in: !a AND !b AND !c";
        }
        else if ((cNegated > 0 && opOrAndOrig == " OR ") || //no negation with OR
            (advancedParams.bNegateAll && cNegated != valElems.length)) { //when negating, negate all
            advancedParams.errorParse = "When using ! (negation) with multiple terms, all terms must be negated with AND, as in: !a AND !b AND !c";
        }
    }

    if (bMultiple)
        sql += ")";

    if (advancedParams.errorParse)
        sql = "";
    else {
        state.cFilters += cFiltersAdd;
        valuesAdd.forEach(function (val) {
            state.values.push(val);
        });
    }
    return sql;
}

function buildSql(elems) {

    var cErrors = 0;
    function buildAllParams(state, bTable, bExcludeWeekFilter, bOnlyWithDueDates) {
        //bTable is needed to dissambiguate when table column names collide in joins
        var sql = "";
        var pre = (bTable ? "H" : "");
        sql += buildSqlParam("sinceSimple", elems, pre, "date", ">=", state);
        if (!bExcludeWeekFilter) {
            sql += buildSqlParam("weekStart", elems, "", "week", ">=", state);
            sql += buildSqlParam("weekEnd", elems, "", "week", "<=", state, "9999-W99");
        }
        sql += buildSqlParam("monthStart", elems, "", "month", ">=", state);
        sql += buildSqlParam("monthEnd", elems, "", "month", "<=", state, "9999-99");
        sql += buildSqlParam("user", elems, pre, "user", "LIKE", state);
        sql += buildSqlParam("team", elems, "", "nameTeam", "LIKE", state);
        sql += buildSqlParam("board", elems, "", "nameBoard", "LIKE", state); //note LIKE allows and/or
        sql += buildSqlParam("list", elems, "", "nameList", "LIKE", state);
        sql += buildSqlParam("card", elems, "", "nameCard", "LIKE", state);
        sql += buildSqlParam("comment", elems, "", "comment", "LIKE", state);
        sql += buildSqlParam("eType", elems, "", "eType", "=", state);
        sql += buildSqlParam("archived", elems, "", "bArchivedCB", "=", state);
        sql += buildSqlParam("deleted", elems, "", "bDeleted", "=", state);
        sql += buildSqlParam("idBoard", elems, "", "idBoardH", "=", state);
        sql += buildSqlParam("idCard", elems, "", "idCardH", "=", state);
        sql += buildSqlParam("afterRow", elems, pre, "rowid", ">", state, null, false);
        sql += buildSqlParam("keyword", elems, "", "keyword", "LIKE", state);

        if (bOnlyWithDueDates || elems["orderBy"] == "dateDue")
            sql += buildSqlParam("dateDue", { dateDue: null }, "", "dateDue", "IS NOT", state);

        if (elems["label"]) {
            if (g_bProVersion) {
                var advancedParams = { bNoWhereAnd: true, bLabelMode: true, bNegateAll: false, errorParse: "" };
                var sqlLabels = "SELECT LC.idCardShort FROM LABELCARD as LC JOIN LABELS as L on LC.idLabel=L.idLabel WHERE " +
                    buildSqlParam("label", elems, "", "L.name", "LIKE", state, undefined, undefined, advancedParams);
                if (advancedParams.errorParse) {
                    if (cErrors == 0)
                        sendDesktopNotification("Error: unsupported label filter. Please hover the labels filter for help: " + advancedParams.errorParse, 12000);
                    cErrors++;
                }
                else {
                    sql += (state.cFilters > 0 ? " AND" : " WHERE") + " C.idCard" + (advancedParams.bNegateAll ? " NOT" : "") + " in (" + sqlLabels + ")";
                }
            } else {
                sendDesktopNotification("To filter by labels enable 'Pro' from the Plus help pane in trello.com", 10000);
            }
        }

        return sql;
    }

    //note: the query itself doesnt group because we later do need the entire history to fill the pivot tabs.
    var groupByLower = (elems["groupBy"] || "").toLowerCase();
    var bByROpt = false;
    var bHasUnion = false;
    var sql = "select H.rowid as rowid, H.keyword as keyword, H.user as user, H.week as week, H.month as month, H.spent as spent, H.est as est, \
                CASE WHEN (H.eType="+ ETYPE_NEW + ") then H.est else 0 end as estFirst, \
                H.date as date, H.comment as comment, H.idCard as idCardH, H.idBoard as idBoardH, T.idTeam as idTeamH, T.name as nameTeam,T.nameShort as nameTeamShort, L.name as nameList, L.pos as posList, C.name as nameCard, C.idShort as idShort, B.name as nameBoard, H.eType as eType, \
                CASE WHEN (C.bArchived+B.bArchived+L.bArchived)>0 then 1 else 0 end as bArchivedCB, C.bDeleted as bDeleted, C.dateDue as dateDue, C.dateCreated as dateCreated \
                FROM HISTORY as H \
                JOIN CARDS as C on H.idCard=C.idCard \
                JOIN LISTS as L on C.idList=L.idList \
                JOIN BOARDS B on H.idBoard=B.idBoard \
                LEFT OUTER JOIN TEAMS T on B.idTeam=T.idTeam";

    var bOrderByR = (elems["orderBy"] == "remain"); //this special-case filters out zero R. special-case it to speed it up
    var bAllDates = (elems["sinceSimple"] == "");

    //cardbalance is indexed by diff. using that index makes report O(log n) versus O(n)
    //cant do it with filters because S/E/E1st totals would be off 
    if (bOrderByR && bAllDates && elems["eType"] == "" && elems["afterRow"] == "" && elems["comment"] == "") {
        sql += " JOIN CARDBALANCE CB on CB.idCard=C.idCard AND H.user=CB.user AND (CB.diff<-0.005 OR CB.diff>0.005)";
        bByROpt = true;
    }
    var state = { cFilters: 0, values: [] };
    sql += buildAllParams(state, true);

    if ((groupByLower != "" || g_bBuildSqlMode) &&
        !elems["user"] && //these two imply s/e rows (except when using NOT, but even then it could be unexpected). Card count charts are better for finding those.
        !elems["keyword"] &&
        elems["checkNoPartialE"]!=="true" &&
        !bOrderByR) {
        bHasUnion = true;
        //REVIEW: since now we do a full pass to find duplicate card rows, consider doing two separate queries.
        //note: dashboard (g_bBuildSqlMode) setChartData relies on special-case of dateDue
        sql += " UNION ALL \
                select " + ROWID_REPORT_CARD + " as rowid, '' as keyword, '' as user, '' as week, " +
                (g_bBuildSqlMode ? "strftime('%Y',datetime(dateDue, 'unixepoch'))||'-'||strftime('%m',datetime(dateDue, 'unixepoch'))" : "case when C.dateSzLastTrello is null then '' else substr(C.dateSzLastTrello,0,8) end") + " as month, 0 as spent, 0 as est, \
                0 as estFirst, "+
                (g_bBuildSqlMode? "C.dateDue" : "CASE when C.dateSzLastTrello is null then 0 else cast(strftime('%s',C.dateSzLastTrello) as INTEGER) end")+" as date " +
                ", '' as comment, C.idCard as idCardH, C.idBoard as idBoardH, \
                T.idTeam as idTeamH, T.name as nameTeam,T.nameShort as nameTeamShort, L.name as nameList, L.pos as posList, C.name as nameCard, C.idShort as idShort, B.name as nameBoard, " + ETYPE_NONE + " as eType, \
                CASE WHEN (C.bArchived+B.bArchived+L.bArchived)>0 then 1 else 0 end as bArchivedCB, C.bDeleted as bDeleted, C.dateDue as dateDue, C.dateCreated as dateCreated \
                FROM CARDS as C \
                JOIN LISTS as L on C.idList=L.idList \
                JOIN BOARDS B on C.idBoard=B.idBoard \
                LEFT OUTER JOIN TEAMS T on B.idTeam=T.idTeam";
        //rebuild filters again because table names are different
        state.cFilters = 0;

        //review hack alert: This excludes the week filter. its taken care later for reports, but not for g_bBuildSqlMode (dashboard) which manually filters in setChartData
        sql += buildAllParams(state, false, true, g_bBuildSqlMode);
    }

    var direction = (g_bBuildSqlMode ? "ASC" : "DESC");
    sql += " ORDER BY date " + direction + ", rowid " + direction; //REVIEW: by date is needed for g_bBuildSqlMode, but otherwise remove once I add smarter order defaults

    return { sql: sql, values: state.values, bByROpt: bByROpt, bHasUnion: bHasUnion, bOrderAsc: direction == "ASC" };
}

var g_progress = {
    m_container: null,
    m_text: null,
    m_anim: null,
    init: function () {
        if (this.m_text)
            return;
        this.m_container = $("#progress");
        this.m_text = $("#progressText");
        this.m_anim = $("#progressAnim");
    },
    show: function (bShow) {
        if (bShow)
            this.m_container.show();
        else
            this.m_container.hide();
    },
    text: function (text) {
        this.m_text.text(text);
        if (!text)
            this.anim("");
    },
    anim: function (text) {
        this.m_anim.text(text);
    }
};

function configReport(elemsParam, bRefreshPage, bOnlyUrl, callbackParam) {
    var elems = cloneObject(elemsParam);
    var bSyncBeforeQuery = (elems["checkSyncBeforeQuery"] === "true");
    var bIncludeCustomFields = (elems["checkAddCustomFields"] == "true");
    var customColumns = ((g_bProVersion ? elems.customColumns : "") || "").split(",");
    if (customColumns.length == 1 && customColumns[0] == "")
        customColumns = [];
    var bCalledBackMain = false;
    function callbackMain(status) {
        if (bCalledBackMain)
            return; //prevent double callback (on error cases maybe callback throws)
        bCalledBackMain = true;
        if (callbackParam)
            callbackParam(status);
    }

    if (!g_bProVersion) {
        if (bSyncBeforeQuery || elems.customColumns || bIncludeCustomFields) {
            bSyncBeforeQuery = false;
            bIncludeCustomFields = false;
            if (!bOnlyUrl)
                sendDesktopNotification("To use 'Pro' report options, enable 'Pro' from the Plus help pane", 7000);
        }
    }

    //Compact the url for easier reading by removing common defaults

    if (elems["eType"] == "all") //do this before updateUrlState so it doesnt include this default in the url REVIEW zig change so its elem value IS "" (see sinceDate)
        elems["eType"] = ""; //this prevents growing the URL with the default value for eType

    if (elems["deleted"] === "")
        elems["deleted"] = "0"; //default to "Not deleted"

    if (elems["archived"] === "")
        elems["archived"] = "0"; //default to "Not archived"

    
    var rgelemsFalse = ["checkAddCustomFields", "checkNoCrop", "checkBGColorChart", "checkNoCharts", "checkNoColorsChart", "checkNoLabelColors", "checkNoPartialE",
    "checkSyncBeforeQuery", "checkOutputCardShortLink", "checkOutputBoardShortLink", "checkOutputCSV", 
    "checkOutputCardIdShort", "checkHideAnnotationTexts", "checkHideZoomArea", "checkNoBracketNotes"];

    rgelemsFalse.forEach(function (elem) {
        var obj = elems[elem];
        if (obj === "false")
            elems[elem] = "";
    });

    if (elems["checkOutputReport"] === "false") {
        elems["checkOutputReport"] = "";
        if (elems["outputFormat"] === "csv")
            elems["outputFormat"] = "";
    }


    if (!g_bBuildSqlMode) {
        if (g_bAddParamSetLastRowViewedToQuery) {
            elems["setLastRowViewed"] = "true";
        }

        if (g_orderByWhenSortList && g_orderByWhenSortList != elems["orderBy"] && g_sortListNamed)
            g_sortListNamed = null;
        updateUrlState(elems);
    }

    if (bOnlyUrl) {
        callbackMain(STATUS_OK);
        return;
    }
    if (!g_bBuildSqlMode)
        setBusy(true);
    if (bRefreshPage) {
        assert(!g_bBuildSqlMode);
        //we do this because jquery/DOM accumulates RAM from old table contents, which also take a long time to clear.
        //instead, just reload the page. clears RAM and speeds it up.
        location.reload(true);
        //no callbackMain needed
        return;
    }


    var sqlQuery = buildSql(elems);
    if (g_bBuildSqlMode) {
        refreshBuildSqlMode(elems);
        window.parent.setSql(sqlQuery.sql, sqlQuery.values, elems);
        callbackMain(STATUS_OK);
        return;
    }

    const orderBy = elems["orderBy"];
    if (g_bPopupMode) {
        var strTitleReport;
        if (orderBy == "remain")
            strTitleReport = "Remain";
        else
            strTitleReport = "Spent";
        $("#report_title_text").text(strTitleReport);
    } else {
        $("#report_title_text").text("Report - Plus");
    }

    openPlusDb(
			function (response) {
			    if (response.status != STATUS_OK) {
			        showError(response.status);
			        callbackMain(response.status);
			        return;
			    }
			    if (bSyncBeforeQuery) {
			        g_progress.text("Syncing...");
			        sendExtensionMessage({ method: "plusMenuSync" }, function (response) {
			            if (response.status != STATUS_OK)
			                alert(response.status);
			            g_progress.text("");
			            doSQLReportPart();
			        });

			    } else {
			        doSQLReportPart();
			    }

			    function doSQLReportPart() {
			        g_progress.text("Querying...");
			        getSQLReport(sqlQuery.sql, sqlQuery.values,
                        function (response) {
                            g_progress.text("");
                            if (response.status != STATUS_OK) {
                                showError(response.status);
                                callbackMain(response.status);
                                return;
                            }
                            var rows = response.rows;
                            try {
                                var groupBy = elems["groupBy"];
                                var options = {
                                    bNoTruncate: elems["checkNoCrop"] == "true",
                                    bNoLabelColors: g_bProVersion && elems["checkNoLabelColors"] == "true",
                                    bAddCustomFields: bIncludeCustomFields,
                                    bExcludeCardsWithPartialE: elems["checkNoPartialE"]=="true",
                                    bOutputCardShortLink: elems["checkOutputCardShortLink"] == "true",
                                    bOutputBoardShortLink: elems["checkOutputBoardShortLink"] == "true",
                                    bOutputCardIdShort: elems["checkOutputCardIdShort"] == "true",
                                    bNoBracketNotes: elems["checkNoBracketNotes"] == "true",
                                    bCountCards: (groupBy.length > 0),
                                    customColumns: customColumns,
                                    bCheckOutputCSV: g_bProVersion && elems["checkOutputReport"] == "true" && elems["outputFormat"]=="csv",
                                    bCheckOutputXLS: g_bProVersion && elems["checkOutputReport"] == "true" && elems["outputFormat"] == "xls"
                                };

                                g_progress.text("Filling...");

                                setReportData(rows, options, elems, sqlQuery, function onOK() {
                                    g_progress.text("");
                                    if (options.bCheckOutputCSV || options.bCheckOutputXLS) {
                                        setTimeout(function () {
                                            var elem = $("#tabs-0 table")[0];
                                            if (options.bCheckOutputCSV)
                                                ExcellentExport.csv(elem, elem);
                                            else
                                                ExcellentExport.excel(elem, elem);
                                        }, 1000);
                                    }
                                    callbackMain(STATUS_OK);
                                });
                            }
                            catch (e) {
                                var strError = "error: " + e.message;
                                logException(e);
                                showError(strError);
                                callbackMain(strError);
                            }
                        });
			    }
			});
}

function resetQueryButton(btn) {
    setBusy(false);
    setBusy(false, btn);
    btn.removeAttr('disabled');
    btn.text("Query");
}

function transformAndMarkSkipCardRows(rows, transformRow) {
    var mapIdCards = {};
    const cLength = rows.length;
    var row;
    for (var i = 0; i < cLength; i++) {
        row = rows[i];
        if (row.bSkip)
            continue;
        if (transformRow)
            transformRow(row);
        if (row.bSkip)
            continue;
        assert(row.idCardH);
        if (row.rowid !== ROWID_REPORT_CARD) {
            if (!mapIdCards[row.idCardH])
                mapIdCards[row.idCardH] = {};
            mapIdCards[row.idCardH].bSE = true;
        } else {
            if (!mapIdCards[row.idCardH])
                mapIdCards[row.idCardH] = {};
            assert(mapIdCards[row.idCardH].i === undefined);
            mapIdCards[row.idCardH].i = i;
        }
    }

    //looping on cards is faster than looping all rows.
    //REVIEW see comment where the SQL UNION is made. we could avoid this 2nd pass with two separate queries, but might not be worth it
    var item;
    for (idCard in mapIdCards) {
        item = mapIdCards[idCard];
        if (item.bSE && item.i !== undefined)
            rows[item.i].bSkip = true;
    }
}

function splitRowsBy(rows, colName, mapCardsToLabels) {
    var bHashtags = (colName == "hashtags");
    var bLabels = (colName == "labels");
    var cItems = rows.length;
    var row;
    var iSplit;
    var rowClone;
    var nameField;
    var rgItems;

    if (bHashtags)
        nameField = "hashtagFirst";
    else
        nameField = "labels";

    for (var i = 0; i < cItems; i++) {
        row = rows[i];
        if (row.bSkip)
            continue;
        assert(row[nameField] === undefined);
        if (bHashtags)
            rgItems = getHashtagsFromTitle(row.nameCard || "", false);
        else
            rgItems = mapCardsToLabels ? (mapCardsToLabels[row.idCardH] || { rgNameLabels: [] }).rgNameLabels : []; //mapCardsToLabels can be null if !pro
        if (rgItems.length == 0)
            row[nameField] = "";
        else {
            for (iSplit = 0; iSplit < rgItems.length; iSplit++) {
                if (iSplit == 0)
                    row[nameField] = rgItems[0];
                else {
                    rowClone = cloneObject(row);
                    rowClone[nameField] = rgItems[iSplit];
                    rows.push(rowClone);
                }
            }
        }
    }
}

function fillMapCardsToLabels(rowsIn, options, callback) {
    var mapIdCards = {};
    var idCards = [];
    var mapCardsToLabels = {};
    rowsIn.forEach(function (row) {
        if (row.bSkip)
            return;
        if (!mapIdCards[row.idCardH]) {
            mapIdCards[row.idCardH] = true;
            idCards.push("'" + row.idCardH + "'");
        }
    });
    idCards.sort();
    var sql = "SELECT idCardShort,idLabel FROM LABELCARD";
    var bWhere = false;
    var paramsSql = [];
    if (idCards.length < 3000) {
        //avoid making a huge query string when there are too many cards. limit to 3000 as it wasnt tested with over 4000
        sql = sql + " WHERE idCardShort IN (" + idCards.join() + ")";
        bWhere = true;
    }
    if (g_bDummyLabel) {
        if (bWhere)
            sql = sql + " AND";
        else {
            sql = sql + " WHERE";
            bWhere = true;
        }
        sql = sql + " idLabel<>?";
        paramsSql.push(IDLABEL_DUMMY);
    }
    sql = sql + " ORDER BY idCardShort DESC, idLabel DESC";
    getSQLReport(sql, paramsSql, function (response) {
        if (response.status != STATUS_OK) {
            alert(response.status);
            return;
        }
        var rowsLC = response.rows;
        var mapIdLabels = {};
        var idLabels = [];
        rowsLC.forEach(function (row) {
            if (!mapIdLabels[row.idLabel]) {
                mapIdLabels[row.idLabel] = true;
                idLabels.push("'" + row.idLabel + "'");
            }
            var mapCTL = mapCardsToLabels[row.idCardShort];
            if (!mapCTL) {
                mapCTL = { idLabels: [] };
                mapCardsToLabels[row.idCardShort] = mapCTL;
            }
            mapCTL.idLabels.push(row.idLabel);
        });

        var mapLabelNames = {};
        var mapLabelColors = {};
        var mapColorFromName = {};
        sql = "SELECT idLabel,name,color FROM LABELS WHERE idLabel in (" + idLabels.join() + ")";
        getSQLReport(sql, [], function (response) {
            if (response.status != STATUS_OK) {
                alert(response.status);
                return;
            }
            response.rows.forEach(function (rowLabel) {
                var name = escapeHtml(rowLabel.name);
                var color = rowLabel.color || "#b6bbbf"; //trello's no-color color
                mapLabelNames[rowLabel.idLabel] = name;
                mapLabelColors[rowLabel.idLabel] = color;
                if (!mapColorFromName[name])
                    mapColorFromName[name] = color;
            });
            g_mapColorFromName = mapColorFromName;
            var iLabel = 0;
            for (var idCardLoop in mapCardsToLabels) {
                var objLoop = mapCardsToLabels[idCardLoop];
                var rgLabels = new Array(objLoop.idLabels.length);
                var rgLabelsDecorated = new Array(objLoop.idLabels.length);
                rgNameLabels = new Array(objLoop.idLabels.length);
                iLabel = 0;

                objLoop.idLabels.forEach(function (idLabel) {
                    var nameLabel = mapLabelNames[idLabel];
                    rgLabels[iLabel] = { name: nameLabel, idLabel: idLabel };
                    rgNameLabels[iLabel] = nameLabel;
                    iLabel++;
                });

                rgLabels.sort(function (a, b) {
                    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
                });

                objLoop.rgNameLabels = rgNameLabels;
                if (options.bNoLabelColors) {
                    objLoop.labels = rgLabels.map(function (val) {
                        return val.name;
                    }).join(', ');
                }
                else {
                    iLabel = 0;
                    rgLabels.forEach(function (label) {
                        var colorTextLabel = colorContrastWith(mapLabelColors[label.idLabel], null, "#000000");
                        var strClassText = "";
                        if (colorTextLabel == "white") {
                            strClassText = "report_class_white_text ";
                        }
                        rgLabelsDecorated[iLabel] = '<span class="' + strClassText + 'report_label_color" style="background-color:' + mapLabelColors[label.idLabel] + ';">' + mapLabelNames[label.idLabel] + '</span>';
                        iLabel++;
                    });

                    objLoop.labels = rgLabelsDecorated.join('&nbsp;&nbsp;');
                }
            }
            callback(mapCardsToLabels);
        });
    });
}

function skipRowsWithPartialE(rows, bOrderAsc) {
    var mapCards = {};
    var dateLast = 0;

    const cTotal = rows.length;
    if (cTotal==0)
        return;

    function processRow(row) {
        assert(row.date >= dateLast);
        dateLast = row.date;
        if (row.bSkip || row.rowid === ROWID_REPORT_CARD)
            return;
        const idCard = row.idCardH;
        var map = mapCards[idCard] || { bSkip: false, bHasE1st: false };
        if (map.bSkip) {
            row.bSkip = true;
            return;
        }

        if (map.bHasE1st)
            return;

        if (row.eType == ETYPE_NEW) {
            map.bHasE1st = true;
            mapCards[idCard] = map;
            return;
        }

        if (row.spent != 0 || row.eType != ETYPE_NONE) {
            map.bSkip = true;
            mapCards[idCard] = map;
            row.bSkip = true;
            return;
        }
    }

    if (bOrderAsc) {
        rows.forEach(processRow);
    } else {
        for (var iRow = cTotal - 1; iRow >= 0; iRow--) {
            processRow(rows[iRow]);
        }
    }
}

function processThreadedItemsReport(items, onPreProcessItem, onProcessItem, onFinishedAll) {
    var rg = ["◐", "◓", "◑", "◒"];
    var msStart = 0;
    var iFound = 0;
    var msLast = 0;
    function onFinishedEach(status) {
        if (status == STATUS_OK) {
            var msNow = Date.now();
            if (msStart == 0) {
                msStart = msNow;
                msLast = msNow;
            }
            var msDelta = msNow - msLast;
            if (msDelta > 50) {
                msLast = msNow;
                iFound=(iFound+1)%rg.length;
            }
            if (msNow - msStart > 4000) {
                text = rg[iFound];
                g_progress.anim(text);
            }
            }
        }

    function onFinishAllLocal(status) {
        g_progress.text("");
        onFinishedAll(status);
    }

    processThreadedItems(null, items, onPreProcessItem, onProcessItem, onFinishedAll, onFinishedEach, false);
}

function setReportData(rowsOrig, options, urlParams, sqlQuery, callbackOK) {
    var rowsGrouped = rowsOrig;
    const groupBy = urlParams["groupBy"];
    const orderBy = urlParams["orderBy"];
    const bCountCards = options.bCountCards;
    const weekStart = urlParams["weekStart"];
    const weekEnd = urlParams["weekEnd"];
    const bPivotByWeek = (urlParams["pivotBy"] == PIVOT_BY.week);

    if (sqlQuery.bHasUnion) {
        assert(groupBy.length > 0);
        var tdata = null;
        if (weekStart || weekEnd)
            tdata = { weekStart: weekStart, weekEnd: weekEnd };
        transformAndMarkSkipCardRows(rowsOrig, function (row) {
            var week = row.week;
            if (!week) {
                week = getCurrentWeekNum(new Date(row.date * 1000));
                row.week = week;
                if (tdata) {
                    if ((weekStart && week < weekStart) || (weekEnd && week > weekEnd))
                        row.bSkip = true;
                }
            }
        });
    }
    
    //this must happen after filtering by week above to prevent future issues
    if (options.bExcludeCardsWithPartialE)
        skipRowsWithPartialE(rowsOrig, sqlQuery.bOrderAsc);

    var bShowCard = (groupBy == "" || groupBy.indexOf("idCardH") >= 0 || groupBy.indexOf("labels") >= 0); //review zig: dup elsewhere
    var bShowLabels = (bShowCard && g_bProVersion && (options.customColumns.length==0 || options.customColumns.indexOf("labels") >= 0));

    stepCustomFields(function (status, cfmetaData, cardData) {
        var customFieldsData = { cfmetaData: cfmetaData, cardData: cardData };
        if (!bShowLabels) {
            stepGroup(null, customFieldsData);
        }
        else {
            fillMapCardsToLabels(rowsOrig, options, function (map) {
                stepGroup(map, customFieldsData);
            });
        }
    });

    function stepCustomFields(callback) {
        if (groupBy == "" || !options.bAddCustomFields) {
            callback(STATUS_OK, {}, {});
            return;
        }
        var boards = {};
        var cards = {};
        var row;
        var i;
        var prop;
        for (i = 0; i < rowsOrig.length; i++) {
            row = rowsOrig[i];
            if (row.idBoardH && row.idBoardH != IDBOARD_UNKNOWN) {
                if (!boards[row.idBoardH])
                    boards[row.idBoardH] = true;
            }
            if (row.idCardH) {
                if (!cards[row.idCardH])
                    cards[row.idCardH] = true;
            }
        }

        function doneGetCustomFieldsData(status, boardDataIn, cardDataIn) {
            if (status != STATUS_OK) {
                sendDesktopNotification("Custom fields missing because: " + status, 5000);
                callback(status, {}, {});
                return;
            }
            //transform boardData
            var cfmetaDataOut = {};
            var cardDataOut = {};
            var mapFindDups = {};
            

            for (var idBoardShort in boardDataIn) {
                var bf = boardDataIn[idBoardShort];
                if (!bf)
                    continue;
                bf.forEach(function (entry) {
                    //NOTE: we remap trellos checkbox type so it can be grouped
                    var bCheckbox = (entry.type == "checkbox");
                    var objSet = { type: bCheckbox ? "number" : entry.type, name: entry.name };
                    if (entry.type == "list")
                        objSet.options = entry.options;
                    cfmetaDataOut[entry.id] = objSet;
                    var idMap = (objSet.type + "-" + objSet.name.trim()).toLowerCase();
                    var foundIdMap = mapFindDups[idMap];
                    if (foundIdMap)
                        objSet.idMaster = foundIdMap;
                    else
                        mapFindDups[idMap] = entry.id;
                    if (bCheckbox)
                        cfmetaDataOut[entry.id].bCheckbox = true;
                });
            }

            var rgCFIds = [];
            for (var idCF in cfmetaDataOut) {
                if (!cfmetaDataOut[idCF].idMaster)
                    rgCFIds.push(idCF);
            }
            rgCFIds.sort(function (a, b) {
                var cmp = cfmetaDataOut[a].name.toLowerCase().trim().localeCompare(cfmetaDataOut[b].name.toLowerCase().trim());
                if (cmp == 0)
                    cmp = cfmetaDataOut[a].type.localeCompare(cfmetaDataOut[b].type);
                return cmp;
            });
            cfmetaDataOut.sortedColumns = rgCFIds;
            var messageErrorLast = "";
            for (var idCardShort in cardDataIn) {
                try {
                    var cf = cardDataIn[idCardShort];
                    if (cf && cf.customFieldItems) {
                        cardDataOut[idCardShort] = {};

                        cf.customFieldItems.forEach(function (entry) {
                            var bdata = cfmetaDataOut[entry.idCustomField];
                            if (bdata) {
                                //warning: entry.value can be undefined
                                var valSet = (bdata.bCheckbox ? (entry.value && entry.value.checked == "true" ? { number: 1 } : { number: 0 }) : entry.value);
                                if (bdata.type == "list") {
                                    for (var iOption = 0; iOption < bdata.options.length; iOption++) {
                                        var bdataOptsCur = bdata.options[iOption];
                                        if (bdataOptsCur.id == entry.idValue) {
                                            valSet = { list: bdataOptsCur.value.text };
                                            break;
                                        }
                                    }

                                }

                                if (valSet)
                                    cardDataOut[idCardShort][entry.idCustomField] = valSet;
                            }
                        });
                    }
                } catch (ex) {
                    logException(ex);
                    messageErrorLast = ex.message;
                }
            }
            if (messageErrorLast)
                alert(messageErrorLast);
            callback(STATUS_OK, cfmetaDataOut, cardDataOut);
        }

        chrome.runtime.getBackgroundPage(function (bkPage) {
            var rgBoards = [];
            var boardData = {};
            for (prop in boards)
                rgBoards.push({ id: prop });

            stepBoards();

            function stepCards(status) {
                var rgCards = [];
                var cardData = {};
                if (status != STATUS_OK) {
                    doneCards(status);
                    return;
                }
                for (prop in cards)
                    rgCards.push({ id: prop });
                processThreadedItemsReport(rgCards, null, onProcessItem, doneCards);
                function doneCards(status) {
                    g_progress.text("Custom fields step 3 of 3: processing");
                    g_progress.anim("");
                    doneGetCustomFieldsData(status, boardData, cardData);
                }

                function onProcessItem(tokenTrello, item, iitem, postProcessItem) {
                    var idCard = item.id;
                    g_progress.text("Custom fields step 2 of 3: " + Math.round(iitem * 100 / rgCards.length) + "%");
                    bkPage.getCardData(tokenTrello, idCard, "id&customFieldItems=true", false, function (response) {
                        if (response.status == STATUS_OK)
                            cardData[idCard] = response.card;
                        postProcessItem(response.status, item, iitem);
                    });
                }
            }

            function stepBoards() {
                processThreadedItemsReport(rgBoards, null, onProcessItem, doneBoards);
                function doneBoards(status) {
                    stepCards(status);
                }

                function onProcessItem(tokenTrello, item, iitem, postProcessItem) {
                    var idBoard = item.id;
                    g_progress.text("Custom fields step 1 of 3: " + Math.round(iitem * 100 / rgBoards.length) + "%");
                    bkPage.getBoardData(tokenTrello, false, idBoard, "/customFields", function (response) {
                        if (response.status == STATUS_OK)
                            boardData[idBoard] = response.board;
                        postProcessItem(response.status, item, iitem);
                    });
                }
            }
        });
    }

    function stepGroup(mapCardsToLabels, customFieldsData) {
        var bGroupMultipleHashtags = groupBy.indexOf("hashtags") >= 0;
        var bGroupMultipleLabels = groupBy.indexOf("labels") >= 0;
        var cRowsOrigBefore = rowsOrig.length;

        if (bGroupMultipleHashtags)
            splitRowsBy(rowsOrig, "hashtags");

        if (bGroupMultipleLabels) {
            if (!g_bProVersion)
                sendDesktopNotification("To group by labels enable 'Pro' from the Plus help pane in trello.com", 10000);
            splitRowsBy(rowsOrig, "labels", mapCardsToLabels);
        }

        if (rowsOrig.length > cRowsOrigBefore)
            sendDesktopNotification("This report has duplicated counts and S/E sums due to grouping of cards with multiple labels or hashtags.", 8000);

        if (groupBy.length > 0 || (orderBy.length > 0 && orderBy != "date")) //assumes new rows are only inserted when grouping is set
            rowsGrouped = groupRows(rowsOrig, groupBy, orderBy, bCountCards, customFieldsData);
        if (rowsGrouped.length > 3000 && bPivotByWeek) { //week is the default. else user likely changed it on purpose so dont keep reminding this tip
            const bNoCharts = (urlParams["checkNoCharts"] == "true");
            var strAlert = "To speed up this report, consider:";
            strAlert += "\n• Set pivot by 'Year'";

            if (!bNoCharts)
                strAlert += "\n• In this report options section, check 'No charts'";
            sendDesktopNotification(strAlert, 6000);
        }
        fillDOM(mapCardsToLabels, customFieldsData, options.customColumns, callbackOK);
    }

    function fillDOM(mapCardsToLabels, customFieldsData, customColumns, callbackOK) {
        var bShowMonth = (urlParams["sinceSimple"].toUpperCase() == FILTER_DATE_ADVANCED.toUpperCase() && (urlParams["monthStart"].length > 0 || urlParams["monthEnd"].length > 0));
        var headersSpecial = {};
        var html = getHtmlDrillDownTooltip(customColumns, rowsGrouped, mapCardsToLabels, customFieldsData, headersSpecial, options, groupBy, orderBy, urlParams["eType"], urlParams["archived"], urlParams["deleted"], bShowMonth, sqlQuery.bByROpt);
        var parentScroller = $(".agile_report_container");
        var container = makeReportContainer(html, 1300, true, parentScroller, true);
        updateSelectedReportTotals(); //some reports include row selections
        var tableElem = $(".tablesorter");
        var bDoSort = true;
        if (tableElem.length > 0 && rowsGrouped.length > 0) {
            var sortList = [];
            if (g_sortListNamed) {
                //some scenarios could end up pointing to nonexistent rows from a previous saved report
                sortList = namedToIndexedSortList(g_sortListNamed, tableElem);
            }

            if (sortList.length == 0 && orderBy) {
                var elemMatch = $('#orderBy option').filter(function () { return $(this).val() == orderBy; });
                if (elemMatch.length > 0) {
                    var textSort = getCleanHeaderName(elemMatch[0].innerText);
                    var ascdesc = 0;
                    if (orderBy != "dateDue" && (orderBy == "date" || typeof (rowsGrouped[0][orderBy]) != "string"))
                        ascdesc = 1;

                    //dont update g_sortListNamed as this is not an explicit custom sort, it just came from the filter combo
                    //in reality it shouldnt make a difference but not updating it just to reduce code change impact
                    sortList = namedToIndexedSortList([[textSort, ascdesc]], tableElem);
                    bDoSort = false;
                }
            }
            tableElem.tablesorter({
                sortList: sortList,
                bDoSort: bDoSort,
                headers: headersSpecial
            });

            tableElem.bind("sortEnd", function () {
                var elem = this;
                if (elem && elem.config && elem.config.sortList && elem.config.headerList) {
                    var params = getUrlParams();
                    g_sortListNamed = indexedToNamedSortList(elem.config.sortList, tableElem);
                    params[g_namedParams.sortListNamed] = JSON.stringify(g_sortListNamed);
                    configReport(params, false, true);
                }
            });
        }


        var btn = $("#buttonFilter");
        resetQueryButton(btn);
        fillPivotTables(rowsOrig, $(".agile_report_container_byUser"), $(".agile_report_container_byBoard"), urlParams, options.bNoTruncate);
        saveDataChart(rowsGrouped, urlParams, options);
        selectTab(g_iTabCur); //select again to adjust height
        if (g_bNeedSetLastRowViewed) {
            g_bNeedSetLastRowViewed = false;
            configureLastViewedRowButton();
            g_bAddParamSetLastRowViewedToQuery = true;
        }
        callbackOK();
    }
}

function indexedToNamedSortList(list, table) {

    var cols = []; //array
    var iCol = 0;
    table.find("thead tr th").each(function () {
        var txt = getCleanHeaderName($(this)[0].innerText);
        cols[iCol] = txt;
        iCol++;
    });

    var ret = [];
    list.forEach(function (elem) {
        if (elem[0] >= cols.length)
            return;
        var txt = cols[elem[0]];
        ret.push([txt, elem[1]]);
    });
    return ret;
}

function namedToIndexedSortList(list, table) {

    var cols = {}; //object
    var iCol = 0;
    table.find("thead tr th").each(function () {
        var txt = getCleanHeaderName($(this)[0].innerText).toLowerCase();
        cols[txt] = iCol;
        iCol++;
    });

    var ret = [];
    list.forEach(function (elem) {
        if (elem.length != 2 || typeof (elem[0]) != "string")
            return;
        var iFound = cols[elem[0].toLowerCase()];
        if (iFound === undefined)
            return;
        ret.push([iFound, elem[1]]);
    });
    return ret;
}


function configureLastViewedRowButton() {
    var keyLastSyncViewed = "rowidLastHistorySyncedViewed";

    chrome.storage.local.get([keyLastSyncViewed], function (obj) {
        var rowidLastSync = obj[keyLastSyncViewed];

        if (rowidLastSync !== undefined && g_rowidLastSyncRemember < 0)
            g_rowidLastSyncRemember = rowidLastSync; //needed when user already marked all as viewed, so there are no rows.
        var buttonMarkRead = $("#buttonMarkallRead");
        buttonMarkRead.show();
        $("#afterRow").prop('disabled', true);
        buttonMarkRead.off().click(function () {
            buttonMarkRead.attr('disabled', 'disabled');
            setLastViewedRow();
        });
    });
}

function setLastViewedRow() {
    var keyLastSyncViewed = "rowidLastHistorySyncedViewed";

    function finish() {
        sendExtensionMessage({ method: "updatePlusIcon" }, function (response) { });
        var params = {};
        g_bAddParamSetLastRowViewedToQuery = false;
        params[g_namedParams.dontQuery] = "1";
        params[g_namedParams.markAllViewed] = "1";
        params["sinceSimple"] = "w-4";
        configReport(params, true);
    }

    chrome.storage.local.get([keyLastSyncViewed], function (obj) {
        var rowidLastSyncViewed = obj[keyLastSyncViewed];
        //prevent an old report from overwritting a newer viewed row
        if (rowidLastSyncViewed !== undefined && rowidLastSyncViewed >= g_rowidLastSyncRemember) {
            finish();
            return;
        }

        var pair = {};
        pair[keyLastSyncViewed] = g_rowidLastSyncRemember;
        chrome.storage.local.set(pair, function () {
            finish();
        });
    });
}

var g_chartContainer = null;
var g_dataChart = null;
const g_yFieldSeparator = "\n";

function saveDataChart(rows, urlParams, options) {
    //remove any possible previous leftover
    g_chartContainer = null;
    g_dataChart = null;
    const groupBy = urlParams["groupBy"];
    const bAllDates = (urlParams["sinceSimple"] == "");
    const bSingleBoard = (!!urlParams["idBoard"]);
    const bRemain = (urlParams["orderBy"] == "remain");
    const stackBy = urlParams["stackBy"];
    if (!groupBy || urlParams["checkNoCharts"] == "true") {
        return;
    }

    var textMessage = "";
    var pGroups = groupBy.split("-");
    var pCur;
    var prependIds = [];
    var bDateGroups = false;
    var strNameBoardSingle = "";
    //convert to the actual field (special cases)
    for (var iProp = 0; iProp < pGroups.length; iProp++) {
        pCur = pGroups[iProp];
        var bId = true;
        var bStop = false;
        if (pCur == "idCardH") {
            pGroups[iProp] = "nameCard";
            if (pGroups.length == 1 && !bSingleBoard) {
                //special case this grouping so the board name shows too
                pGroups.push("nameBoard");
                bStop = true; //so it wont proceess this extra
            }
        }
        else if (pCur == "idTeamH")
            pGroups[iProp] = "nameTeam";
        else if (pCur == "idBoardH")
            pGroups[iProp] = "nameBoard";
        else if (pCur == "hashtags") {
            pGroups[iProp] = "hashtagFirst";
            bId = false;
        }
        else
            bId = false;

        if (pCur.indexOf("date") == 0)
            bDateGroups = true;
        //use prepend ids to cover cases where two domain parts are identical (like two cards with the same title)
        //Thus, all parts are prepended with the ids where they came from.
        if (bId && stackBy != pCur)
            prependIds.push(pCur);
        
        if (bStop)
            break;
    }

    var dataS = [];
    var dataR = [];
    var dataE = [];
    var dataEFirst = [];
    var dataCountCards = [];
    var mapDomains = {};
    var domains = {};

    for (var dname in g_dnames) {
        domains[dname]=[];
        mapDomains[dname] = {};
    }

    function checkPushDomain(dname, yField) {
        if (!yField)
            return;
        var map = mapDomains[dname];
        if (map[yField])
            return;
        domains[dname].push(yField);
        map[yField] = true;
    }


    const bShowR = (bAllDates && !bDateGroups);
    var bHasNegativeR = false;
    var bHasNegatives = false;
    var iPartGroupExclude = -1;

    for (var iRow = 0; iRow < rows.length; iRow++) {
        var yField = "";
        var rowCur = rows[iRow];
        for (iProp = 0; iProp < pGroups.length; iProp++) {
            var propNameLoop = pGroups[iProp];
            if (bSingleBoard && propNameLoop == "nameBoard") {
                iPartGroupExclude = iProp;
                continue;
            }
            var valProp = rowCur[propNameLoop];
            if (propNameLoop == "comment")
                valProp = removeBracketsInNote(valProp);
            var val = (yField.length > 0 ? g_yFieldSeparator : "") + (valProp || "-");

            yField += val;
        }
        //NOTE: code uses "dlabel" (data label) to distinguish from trello labels.
        //All dlabels will always contain two parts, separated by REPORTCHART_DLABEL_PREPENDSEP
        //the first part, if not empty, contains a unique string made from the prependIds
        var prepend = "";

        for (iProp = 0; iProp < prependIds.length; iProp++) {
            prepend = prepend + "+" + (rowCur[prependIds[iProp]] || "");
        }

        yField = prepend + REPORTCHART_DLABEL_PREPENDSEP + yField;

        if (bSingleBoard && strNameBoardSingle.length == 0)
            strNameBoardSingle = rowCur.nameBoard;
        //datasets

        if (options.bCountCards) {
            dataCountCards.push({ x: rowCur.countCards || 1, y: yField });
            checkPushDomain("cardcount", yField);
        }

        if (bRemain || (rowCur.spent != 0 || (bShowR && rowCur.est != 0))) {
            if (!bRemain && rowCur.spent != 0) {
                dataS.push({ x: parseFixedFloat(rowCur.spent), y: yField });
                checkPushDomain("s", yField);
                checkPushDomain("ser", yField);
                if (rowCur.spent < 0)
                    bHasNegatives = true;
            }
            if (bShowR) {
                var rCalc = parseFixedFloat(rowCur.est - rowCur.spent);
                if (rCalc != 0) {
                    if (rCalc < 0)
                        bHasNegatives = true;
                    dataR.push({ x: rCalc, y: yField });
                    checkPushDomain("ser", yField);
                    checkPushDomain("r", yField);
                }
            }
        }

        var bHasEstData=(rowCur.est != 0 || rowCur.estFirst != 0);
        if (bHasEstData) {
            //push always together even if some are zero, as later elements must correspond in both sets
            dataE.push({ x: parseFixedFloat(rowCur.est), y: yField });
            dataEFirst.push({ x: parseFixedFloat(rowCur.estFirst), y: yField });
            checkPushDomain("e", yField);
        }
    }

    g_dataChart = {
        dataS: dataS,
        dataR: dataR,
        dataCountCards: dataCountCards,
        dataE: dataE,
        dataEFirst: dataEFirst,
        domains: domains,
        dnameLast: null, //last chart generated
        bShowR: bShowR,
        bRemain: bRemain,
        bHasNegatives: bHasNegatives,
        cPartsGroupFinal: pGroups.length - (iPartGroupExclude >= 0 ? 1 : 0),
        params: urlParams,
        iPartGroupExclude: iPartGroupExclude,
        strNameBoardSingle: strNameBoardSingle
    };

    return;
}

const REPORTCHART_DLABEL_PREPENDSEP = "|"; //cant be / as unknown ids contain that

function bCancelFromAlertLargeSize(domain, bDownloading) {
    const MAX_BARS = 200;
    if (domain.length > MAX_BARS) {
        var strAlert = "The charts will have " + domain.length + " bars.";
        if (bDownloading)
            strAlert += "\n" + "Converting a large chart to PNG may fail.";
        strAlert += "\nAre you sure?";
        if (!confirm(strAlert))
            return true; //cancel
    }
    return false; //dont cancel
}

var g_lastChartFilled = "";
function fillChart(bForce) {
    var typeChart = $("#chartView").val();
    var elemStack = $("#stackBy");
    var elemStackPre = $("#stackByPre");
    var spanNoColors = $("#spancheckNoColorsChart");
    var bStacked = (typeChart == g_chartViews.s || typeChart == g_chartViews.e || typeChart == g_chartViews.r);
    if (typeChart == g_chartViews.cardcount || bStacked) {
        elemStackPre.show();
        elemStack.show();
    }
    else {
        elemStackPre.hide();
        elemStack.hide();
    }


    if (typeChart == g_chartViews.burndown)
        spanNoColors.hide();
    else
        spanNoColors.show();

    if (g_lastChartFilled == typeChart && !bForce)
        return;

    if (g_bNoGroupChart)
        $("#chartMessage").text(g_strMessageNoGroupChart);

    if (typeChart == g_chartViews.burndown) {
        chartBurndown(bForce);
    }

    else {
        if (!g_dataChart) {
            g_lastChartFilled = "";
            return;
        }
        var bCancel = false;
        g_dataChart.dnameLast = null; //reset

        function callbackCancel(dname) {
            var domain = g_dataChart.domains[dname];
            if (!bForce && bCancelFromAlertLargeSize(domain, false)) {
                bCancel = true;
                return true; //cancel
            }
            g_dataChart.dnameLast = dname; //asume chart wont fail after this
            return false; //continue
        }

        if (bStacked)
            chartStacked(typeChart, bForce, callbackCancel);
        else if (typeChart == g_chartViews.ser)
            chartSER(bForce, callbackCancel);
        else if (typeChart == g_chartViews.cardcount) {
            chartStacked(typeChart, bForce, callbackCancel);
        }
        else if (typeChart == g_chartViews.e1vse)
            charte1vse(bForce, callbackCancel);
        else if (typeChart == g_chartViews.echange)
            charteChange(bForce, callbackCancel);
    }
    if (!bCancel)
        g_lastChartFilled = typeChart;
}

const DLABELPART_SKIP = " ";

function dlabelRealFromEncoded(dlabel) {
    var iSlash = dlabel.indexOf(REPORTCHART_DLABEL_PREPENDSEP); //skip prependIds
    var dlabelReal = dlabel.substring(iSlash + 1);
    var parts = dlabelReal.split(g_yFieldSeparator);
    var dlabelDisplay = "";
    for (var iPart = 0; iPart < parts.length; iPart++) {
        var valPart = parts[iPart];
        if (valPart == DLABELPART_SKIP)
            continue;
        if (iPart > 0)
            dlabelDisplay += g_yFieldSeparator;
        dlabelDisplay += strTruncate(parts[iPart] || "-", g_cchTruncateChartDlabel);
    }
    return dlabelDisplay;
}

function getCommonChartParts(elemChart, domain, colorsForScale, legendTexts) {
    elemChart.parent().show(); //we hide it when it does not apply. needed because it might have a background color
    var colorBk = (g_dataChart.params["checkBGColorChart"] == "true" ? g_dataChart.params["colorChartBackground"] || "#FFFFFF" : null);
    $("#chartPrintContainer").css("background-color", colorBk || "transparent");

    var ret = {};
    ret.colorScale = new Plottable.Scales.Color().domain(legendTexts);
    if (colorsForScale)
        ret.colorScale.range(colorsForScale);
    if (colorsForScale.length > 1)
        ret.legend = new Plottable.Components.Legend(ret.colorScale).xAlignment("center").yAlignment("top").maxEntriesPerRow(legendTexts.length > g_maxLegendsPerColumn ? g_maxLegendColumns : 1);
    else
        ret.legend = null;
    ret.yScale = new Plottable.Scales.Category().domain(domain);
    ret.xScale = new Plottable.Scales.Linear();
    ret.xAxis = new Plottable.Axes.Numeric(ret.xScale, "bottom");

    ret.yAxis = new Plottable.Axes.Category(ret.yScale, "left").formatter(function (text) {
        return dlabelRealFromEncoded(text);
    });

    return ret;
}

function getCleanChartElem() {
    clearInteractions();
    if (g_chartContainer) {
        g_chartContainer.destroy();
        g_chartContainer = null;
    }

    var elemChart = $("#chart");
    d3.select("chart").remove(); //jquery 'empty' breaks plottable interaction in card count chart
    elemChart.parent().hide();
    return elemChart;
}

function prependChartTitle(table, dataChart, domain) {
    var objRet = { bPrepended: false };
    var strTitle = "";
    if (dataChart.strNameBoardSingle)
        strTitle = dataChart.strNameBoardSingle;


    if (domain.length == 1) {
        var strDlabel = dlabelRealFromEncoded(domain[0]);
        if (strDlabel) { //adding a break with empty next line causes ... on first line.
            if (strTitle)
                strTitle += "\n";
            strTitle += strDlabel;
        }
    }

    if (strTitle) {
        table.unshift([null, new Plottable.Components.TitleLabel(strTitle)]);
        objRet.bPrepended = true;
        objRet.strTitle = strTitle;
    }

    if (domain.length == 1) {
        for (var i = 0; i < table.length; i++) {
            if (table[i][0]) {
                table[i][0] = null; //REVIEW hack. relies on yAxis always being the only in the first column
                break;
            }
        }
    }

    var elemLabelPro = $("#labelGetPro");
    if (!g_bProVersion) { 
        elemLabelPro.show();
        var click = new Plottable.Interactions.Click(); //review: unknown why the interaction is lost after switching to another chart and back here
        elemLabelPro.off("click.plusForTrello").on("click.plusForTrello", function (evt) {
            var pair = {};
            pair[LOCALPROP_NEEDSHOWPRO] = true;
            chrome.storage.local.set(pair, function () {
                if (chrome.runtime.lastError == undefined) {
                    window.open("https://trello.com", "_blank");
                    return;
                }
            });
        });
    } else {
        elemLabelPro.hide();
    }
    return objRet;
}

function pushInteraction(evt, elem) {
    g_interactions.push({ evt: evt, to: elem });
}

function clearInteractions() {
    //when creating a new chart, the old deleted chart and elements do not detach from interactions.
    //thus we keep track and detach here
    const cInter = g_interactions.length;
    var inter;
    for (var iInter = 0; iInter < cInter; iInter++) {
        inter = g_interactions[iInter];
        if (inter.evt.detachFrom)
            inter.evt.detachFrom(inter.to);
    }
    g_interactions = [];
}

function isReportWithPartialE(params) {
    var bRet = g_dataChart.params["sinceSimple"] && g_dataChart.params["checkNoPartialE"] !== "true";
    return bRet;
}

function chartSetup(chart) {
    chart.labelsEnabled(true);
    chart.deferredRendering(false); //note: could use combination of chart type and g_dataChart.bHasNegatives to optimize here, but opened to more issues. not worth it.
}

function chartSER(bForce, callbackCancel) {
    var elemChart = getCleanChartElem();
    var bNoColors = (g_dataChart.params["checkNoColorsChart"] == "true");
    var elemChartMessage = $("#chartMessage");
    var textMessage = "";

    if (!g_dataChart.bRemain) {
        if (g_dataChart.dataS.length == 0 && (!g_dataChart.bShowR || g_dataChart.dataR.length == 0))
            textMessage += "There is no Spent/Estimate to chart. ";
    } else {
        if (g_dataChart.dataR.length == 0)
            textMessage += "There is no Remain to chart. ";
    }

    if (textMessage)
        textMessage += "Try the 'Card count' chart from the list above. ";

    if (isReportWithPartialE(g_dataChart.params)) {
        hiliteOnce($("#sinceSimple"));
        hiliteOnce($("#headerOptions"));
        textMessage += "To make this chart, do not filter by Date or click <b>Options</b> to exclude cards with partial Estimates.";
    }

    var bCriticalError = (textMessage.length > 0);

    if (g_dataChart.bRemain && g_dataChart.dataS.length == 0)
        textMessage += "To show Spent, do not order by 'R (non zero)'. ";

    elemChartMessage.html(textMessage);
    if (bCriticalError)
        return;

    var colors = [g_colorsFixed[g_chartViews.s]];
    if (bNoColors) {
        colors = ["#FFFFFF"];
    }
    var legendTexts = ["Spent"];
    if (g_dataChart.bShowR) {
        colors.push(bNoColors? "#DDDDDD" : g_colorsFixed[g_chartViews.r]);
        legendTexts.push("Remain");
    }
    var dname = g_dnames.ser;
    var domain = g_dataChart.domains[dname];
    if (callbackCancel(dname))
        return;
    var colorsFinal = (g_dataChart.bRemain ? [colors[1]] : colors);
    var legendTextsFinal = (g_dataChart.bRemain ? [legendTexts[1]] : legendTexts);

    var common = getCommonChartParts(elemChart, domain, colorsFinal, legendTextsFinal);

    var chart = new Plottable.Plots.StackedBar(Plottable.Plots.BarOrientation.horizontal).labelsEnabled(true).addClass("chartReportStyle");

    chartSetup(chart);

    if (bNoColors)
        chart.attr("stroke", "black");

    if (!g_bPopupMode)
        chart.animated(!bForce);

    if (!g_dataChart.bRemain)
        chart.addDataset(new Plottable.Dataset(g_dataChart.dataS, { iColor: 0 }));
    if (g_dataChart.bShowR)
        chart.addDataset(new Plottable.Dataset(g_dataChart.dataR, { iColor: 1 }));

    chart.x(function (d) { return d.x; }, common.xScale).
        y(function (d) { return d.y; }, common.yScale).
        attr("fill", function (d, i, dataset) {
            var md = dataset.metadata();
            return colors[md.iColor];
        });

    var table = [
      [null, common.legend],
      [common.yAxis, chart],
      [null, common.xAxis]
    ];

    var dataPrepended = prependChartTitle(table, g_dataChart, domain);
    g_chartContainer = new Plottable.Components.Table(table);
    const heightLegend = g_heightLine * 4;
    elemChart.css('height', heightLegend + getChartHeight(domain, g_dataChart.cPartsGroupFinal, dataPrepended));
    g_chartContainer.renderTo("#chart");
    handleMouseMoveTooltips(elemChart, chart, common, legendTexts);
}


function charte1vse(bForce, callbackCancel) {
    var elemChart = getCleanChartElem();
    var bNoColors = (g_dataChart.params["checkNoColorsChart"] == "true");
    var elemChartMessage = $("#chartMessage");
    var textMessage = "";

    if (g_dataChart.dataE.length == 0) {
        textMessage += "There are no estimates to chart. ";
    }
    elemChartMessage.text(textMessage);
    if (textMessage.length > 0)
        return;

    addChartEstWarning(elemChartMessage);
    var colors = ["#81D4FA", g_colorsFixed.e];
    if (bNoColors)
        colors = ["#FFFFFF", "#DDDDDD"];
    var legendTexts = ["E 1st", "E current"];
    var dname = g_dnames.e;
    var domain = g_dataChart.domains[dname];
    if (callbackCancel(dname))
        return;
    elemChart.parent().show();
    var common = getCommonChartParts(elemChart, domain, colors, legendTexts);
    common.yScale.innerPadding(0).outerPadding(0);

    var chart = new Plottable.Plots.ClusteredBar(Plottable.Plots.BarOrientation.horizontal).
        addDataset(new Plottable.Dataset(g_dataChart.dataEFirst, { iColor: 0 })).
        addDataset(new Plottable.Dataset(g_dataChart.dataE, { iColor: 1 })).
        labelsEnabled(true).addClass("chartReportStyle");
    chartSetup(chart);

    if (bNoColors)
        chart.attr("stroke", "black");

    if (!g_bPopupMode)
        chart.animated(!bForce);

    chart.x(function (d) { return d.x; }, common.xScale).
        y(function (d) { return d.y; }, common.yScale).
        attr("fill", function (d, i, dataset) {
            var md = dataset.metadata();
            return colors[md.iColor];
        });

    var table = [
      [null, common.legend],
      [common.yAxis, chart],
      [null, common.xAxis]
    ];
    var dataPrepended = prependChartTitle(table, g_dataChart, domain);
    g_chartContainer = new Plottable.Components.Table(table);
    const heightLegend = g_heightLine * 4;
    elemChart.css('height', heightLegend + getChartHeight(domain, g_dataChart.cPartsGroupFinal, dataPrepended, 2));

    g_chartContainer.renderTo("#chart");
    handleMouseMoveTooltips(elemChart, chart, common, legendTexts);
}

function addChartEstWarning(elemChartMessage) {
    if (g_dataChart.params["sinceSimple"] && g_dataChart.params["checkNoPartialE"] !== "true") {
        elemChartMessage.html("Note: This report is filtered by date, which may cause unexpected E,R values. Click <b>Options</b> and Exclude cards with partial estimates.");
        hiliteOnce($("#sinceSimple"));
        hiliteOnce($("#headerOptions"));
    }
}

function chartBurndown(bForce) {
    getCleanChartElem();
    var elemChartMessage = $("#chartMessage");
    var params = getUrlParams();
    delete params["orderBy"];
    delete params["groupBy"];
    delete params["pivotBy"];
    delete params["stackBy"];
    delete params["tab"];
    var url = buildUrlFromParams(params, true, "dashboard.html");
    elemChartMessage.html("<div style='margin-top:1em;'><A href='" + url + "' target='_blank'><img src=images/chart-sm.png style='vertical-align: middle;margin-right:5px;'/>Burndown chart</A> based on this report filters.</div>");
    return;
}

function charteChange(bForce, callbackCancel) {
    var elemChart = getCleanChartElem();
    var bNoColors = (g_dataChart.params["checkNoColorsChart"] == "true");
    var elemChartMessage = $("#chartMessage");
    var textMessage = "";

    if (g_dataChart.dataE.length == 0) {
        textMessage += "There are no estimates to chart. ";
    }
    elemChartMessage.text(textMessage);
    if (textMessage.length > 0)
        return;

    addChartEstWarning(elemChartMessage);

    var colors = ["#81D4FA", "#f44336", "#4CAF50"];
    if (bNoColors)
        colors = ["#DDDDDD", "#000000","#FFFFFF"];
    var legendTexts = ["E 1st", "Increased E", "Reduced E"];
    var dname = g_dnames.e;
    var domain = g_dataChart.domains[dname];
    if (callbackCancel(dname))
        return;

    var common = getCommonChartParts(elemChart, domain, colors, legendTexts);

    var dPlus = [];
    var dMinus = [];
    var dE1 = g_dataChart.dataEFirst;
    var dE2 = g_dataChart.dataE;
    var delta = 0;
    assert(dE1.length == dE2.length);
    for (var ids = 0; ids < dE1.length; ids++) {
        delta = dE2[ids].x - dE1[ids].x;
        if (delta > 0)
            dPlus.push({ x: parseFixedFloat(delta), y: dE1[ids].y });
        if (delta < 0)
            dMinus.push({ x: parseFixedFloat(delta), y: dE1[ids].y });
    }

    var chart = new Plottable.Plots.StackedBar(Plottable.Plots.BarOrientation.horizontal).
        addDataset(new Plottable.Dataset(g_dataChart.dataEFirst, {iColor:0, type: "dataEFirst"})).
        addDataset(new Plottable.Dataset(dPlus, {iColor:1, type: "dPlus"})).
        addDataset(new Plottable.Dataset(dMinus, { iColor: 2, type: "dMinus" })).labelsEnabled(true).addClass("chartReportStyle");
    chartSetup(chart);
    if (bNoColors)
        chart.attr("stroke", "black");

    if (!g_bPopupMode)
        chart.animated(!bForce);

    chart.x(function (d) { return d.x; }, common.xScale).
        y(function (d) { return d.y; }, common.yScale).
        attr("fill", function (d, i, dataset) {
            var md = dataset.metadata();
            return colors[md.iColor];
        }).labelFormatter(
            function (text, datum, i, ds) {
                var pre = "";
                if (ds) {
                    var md = ds.metadata();
                    if (md && md.type == "dPlus")
                        pre = "+";
                }
                return pre + text;
            });

    var table = [
      [null, common.legend],
      [common.yAxis, chart],
      [null, common.xAxis]
    ];
    var dataPrepended = prependChartTitle(table, g_dataChart, domain);
    g_chartContainer = new Plottable.Components.Table(table);

    const heightLegend = g_heightLine * 6;
    elemChart.css('height', heightLegend + getChartHeight(domain, g_dataChart.cPartsGroupFinal, dataPrepended));

    g_chartContainer.renderTo("#chart");
    handleMouseMoveTooltips(elemChart, chart, common, legendTexts);
}

function getChartZoomFactor() {
    var factor=1;
    
    const minFactor = 0.1;
    const maxFactor = 3;
    const steps = 10;
    const middle = 0;
    const zoomMin = -10;
    const zoomMax = 10;
    var zoom = g_dataChart.params["heightZoomChart"] || middle;
    if (zoom < middle) {  //-10 to 0, distribute (1-minFactor)
        factor = minFactor + ((1 - minFactor) / zoomMax) * (zoom + zoomMax);
    } else if (zoom > middle) { //0 to 10, distribute so 10 maps to 3
        factor = 1 + ((zoom * maxFactor) / zoomMax);
    }
    return factor;
}

function getChartHeight(domain, cPartsGroupFinal, dataPrepended, cBars, heightMinDefault) {
    heightMinDefault = heightMinDefault || 0;
    //  groups: 1 to N
    //  title: iff dataPrepended.bPrepended
    //
    //          chartStacked            Title
    //
    //         |
    //         |--------------
    //  group1 |             |          
    //  group2 |      7      |  7
    //  group3 |             |
    //         |--------------
    //         |--------
    //    -    |       |
    //    -    |   4   |  4             Bars
    //    -    |       |
    //         ---------
    //         |------------
    //    -    |           |
    //    -    |     6     |  6
    //    -    |           |
    //         |------------
    //         |--------------------    X axis, ticks and labels
    //         |   |   |   |   |
    //         0   2   4   6   8
    //
    //
    // A "line" is like a line of text in the chart
    // a bar has minimum 2 lines, even if it has 1 group otherwise label doesnt show
    cBars = cBars || 1;
    const cLinesPerBar = Math.max(2, cPartsGroupFinal);
    const heightBar = g_heightLine * cLinesPerBar * cBars;
    const heightBarSpacing = g_heightLine * 0.6;
    const heightXAxis = g_heightLine * 3;
    const heightMargins = g_heightLine * 2;
    var heightTitle = 0;
    const factor = getChartZoomFactor();
    if (dataPrepended.bPrepended) {
        var cLinesTitle = dataPrepended.strTitle.split("\n").length;
        heightTitle=heightTitle*cLinesTitle*2;
    }
    var heightChartCalc = (domain.length * (heightBar + heightBarSpacing)) + heightXAxis + heightMargins + heightTitle;
    if (heightMinDefault)
        heightChartCalc = Math.max(heightMinDefault, heightChartCalc);
    return heightChartCalc * factor;
}

function chartStacked(type, bForce, callbackCancel) {
    type = type || $("#chartView").val();
    var elemChart = getCleanChartElem();
    var stackBy = $("#stackBy").val();
    var bNoColors = (g_dataChart.params["checkNoColorsChart"] == "true");
    var bOrderRemain = (g_dataChart.params["orderBy"] == "remain");

    var elemChartMessage = $("#chartMessage");
    var textMessage = "";
    var dataChart = null;
    var domain = null;
    var colorFixed = g_colorsFixed[type];
    var colorsVar = ["#DDDDDD", "#FFFFFF"];
    var dname = g_dnames[type];
    if (type == g_chartViews.cardcount) {
        dataChart = g_dataChart.dataCountCards;
        if (dataChart.length == 0)
            textMessage += "There are no counts to chart. ";
    } else {
        if (type == g_chartViews.s)
            dataChart = g_dataChart.dataS;
        else if (type == g_chartViews.e)
            dataChart = g_dataChart.dataE;
        else if (type == g_chartViews.r)
            dataChart = g_dataChart.dataR;

        assert(dataChart);
        if (dataChart.length == 0)
            textMessage += "There is no data to chart. ";

        if (type == g_chartViews.s && bOrderRemain)
            textMessage += "Order by something different than 'R'. ";
    }

    assert(dataChart && colorFixed && colorsVar && dname);
    domain = g_dataChart.domains[dname];
    if (callbackCancel(dname))
        return;
    if (type == g_chartViews.r) {
        if (isReportWithPartialE(g_dataChart.params)) {
            hiliteOnce($("#sinceSimple"));
            hiliteOnce($("#headerOptions"));
            textMessage += "To make this chart, do not filter by Date or click <b>Options</b> to exclude cards with partial Estimates.";
        }
    }

    var bCriticalError = (textMessage.length > 0);

    //non-critical messages here

    if (type == g_chartViews.r && !bOrderRemain)
        textMessage += "Tip: make a faster 'Remain' report ordering by 'R (non-zero)'.";
    elemChartMessage.html(textMessage);
    if (bCriticalError)
        return;

    var colors = [colorFixed];
    if (bNoColors) {
        colors = colorsVar;
    }
    var legendTexts = [];
    legendTextsInfo = [
        { text: "-", i: 0 },
        { text: "", i: 1 }
    ]; //note below we force-sort this one to the top always
    var iGroupStack = -1; //none
    if (stackBy) {
        var pGroups = g_dataChart.params["groupBy"].split("-");
        iGroupStack = pGroups.indexOf(stackBy);

        if (iGroupStack < 0 && stackBy == "hashtagFirst") //review zig: ugly side-effect of having those two groups (historical note: hashtags added later, hashtagFirst kept for backwards compatibility)
            iGroupStack = pGroups.indexOf("hashtags");

        if (iGroupStack < 0) {
            sendDesktopNotification("Error: the report 'Group by' must contain your stacking. Pick 'Custom' from the group-by dropdown and append it, then Query.", 10000);
            $("#stackBy").val("");
            updateURLPart("stackBy");
        } else if (g_dataChart.iPartGroupExclude >= 0 && g_dataChart.iPartGroupExclude < iGroupStack)
            iGroupStack--;
    }

    var cPartsGroupFinal = g_dataChart.cPartsGroupFinal;
    var mapLegendToIColor = {};

    var iColor = 1; //0 is for no hashtag
    if (iGroupStack >= 0) {
        //transform the domain and datasets
        assert(legendTextsInfo[legendTextsInfo.length - 1].text == "");
        legendTextsInfo.pop(); //remove fake empty legend
        if (!bNoColors) {
            //thanks http://stackoverflow.com/a/4382138/2213940 for showing the 20 "best" colors to use for most people (black added by me)
            colors = ["#000000", //Black, only for empty property "-"  0
                    "#FF6800", // Vivid Orange              1
                    "#803E75", // Strong Purple              2
                    "#A6BDD7", // Very Light Blue              3
                    "#00538A", // Strong Blue              4
                    "#C10020", // Vivid Red              5
                    "#CEA262", // Grayish Yellow              6
                    "#817066", // Medium Gray              7
                    // The following don't work well for people with defective color vision 8
                    "#FFB300", // Vivid Yellow              9
                    "#007D34", // Vivid Green              10
                    "#F6768E", // Strong Purplish Pink              11
                    "#FF7A5C", // Strong Yellowish Pink              12
                    "#53377A", // Strong Violet              13
                    "#FF8E00", // Vivid Orange Yellow              14
                    "#B32851", // Strong Purplish Red              15
                    "#F4C800", // Vivid Greenish Yellow              16
                    "#7F180D", // Strong Reddish Brown              17
                    "#93AA00", // Vivid Yellowish Green              18
                    "#593315", // Deep Yellowish Brown              19
                    "#F13A13", // Vivid Reddish Orange              20
                    "#2F3A1D" // Dark Olive Green (modified by zig to differenciate better from black)               21
            ];
        }
        cPartsGroupFinal--;
        var mapDomainNew = {};
        var mapDlabelsNew = {};
        var domainNew = [];
        const lengthColorsOrig = colors.length;

        domain.forEach(function (dlabel) {
            var iSlash = dlabel.indexOf(REPORTCHART_DLABEL_PREPENDSEP);
            var prepend = dlabel.substring(0, iSlash + 1); //include REPORTCHART_DLABEL_PREPENDSEP
            var dlabelReal = dlabel.substring(iSlash + 1);
            var parts = dlabelReal.split(g_yFieldSeparator);
            if (iGroupStack < parts.length) {
                var partNew = parts[iGroupStack];
                parts[iGroupStack] = DLABELPART_SKIP;
                if (!mapDlabelsNew[partNew.toLowerCase()]) {
                    mapDlabelsNew[partNew.toLowerCase()] = true;

                    if (partNew != "-") {
                        if (stackBy == "labels") {
                            var colNew = g_mapColorFromName[partNew];
                            if (colNew)
                                colors[iColor] = colNew;
                        }

                        legendTextsInfo.push({ text: partNew, i: iColor });
                        iColor++; //move to the next color
                        if (iColor >= colors.length)
                            colors.push(colors[((iColor - 1) % (lengthColorsOrig - 1)) + 1]); //remap to 1-20
                    }
                }
            } else {
                console.log("Unexpected parts on iGroupStack");
            }
            var elemNew = prepend + parts.join(g_yFieldSeparator);
            if (!mapDomainNew[elemNew]) {
                mapDomainNew[elemNew] = true;
                domainNew.push(elemNew);
            }

        });
        
        if (stackBy != "labels") {
            legendTextsInfo.sort(function (a, b) {
                var at = a.text;
                var bt = b.text;
                const legendEmpty = "-";
                if (at != bt) {
                    //force sort
                    if (at == legendEmpty)
                        return -1;
                    if (bt == legendEmpty)
                        return 1;
                }
                return at.toLowerCase().localeCompare(bt.toLowerCase());
            });
        }
        domain = domainNew;
    }

    for (var iSet = 0; iSet < legendTextsInfo.length; iSet++) {
        var dataCur = legendTextsInfo[iSet];
        var textSet = dataCur.text;
        legendTexts.push(textSet);
        mapLegendToIColor[textSet.toLowerCase()] = iSet;
    }

    var common = getCommonChartParts(elemChart, domain, colors, legendTexts);
    if (bNoColors)
        common.legend = null;
    common.xScale.tickGenerator(Plottable.Scales.TickGenerators.integerTickGenerator());

    var datasets = {};
    for (var iDS = 0; iDS < dataChart.length; iDS++) {
        var itemCur = dataChart[iDS];
        var dlabel = itemCur.y;
        //{ x: rowCur.countCards, y: yField };
        var iSlash = dlabel.indexOf(REPORTCHART_DLABEL_PREPENDSEP);
        var prepend = dlabel.substring(0, iSlash + 1); //include REPORTCHART_DLABEL_PREPENDSEP
        var dlabelReal = dlabel.substring(iSlash + 1);
        var parts = dlabelReal.split(g_yFieldSeparator);
        var partNew = ""; //index when no stacking. review: javascript allows this, but its kinda ugly
        if (iGroupStack >= 0) {
            if (iGroupStack < parts.length) {
                partNew = parts[iGroupStack];
                parts[iGroupStack] = DLABELPART_SKIP;
            } else {
                console.log("Unexpected parts on iGroupStack");
            }
        }
        
        if (!datasets[partNew])
            datasets[partNew] = [];

        datasets[partNew].push({ x: itemCur.x, y: prepend + parts.join(g_yFieldSeparator), iColor: mapLegendToIColor[partNew.toLowerCase()] });
    }

    var chart = new Plottable.Plots.StackedBar(Plottable.Plots.BarOrientation.horizontal).
        labelsEnabled(true).addClass("chartReportStyle");
    chartSetup(chart);
    if (bNoColors)
        chart.attr("stroke", "black");

    for (iSet = 0; iSet < legendTextsInfo.length; iSet++) {
        var dsAdd = datasets[legendTextsInfo[iSet].text];
        if (dsAdd)
            chart.addDataset(new Plottable.Dataset(dsAdd));
    }

    if (!g_bPopupMode)
    	chart.animated(!bForce);

    function IColorRemapFromD(d) {
        var iColor = d.iColor || 0;
        if (bNoColors && iColor > 0)
            iColor = 1;
        return (iColor % colors.length);
    }

    chart.x(function (d) {
        return d.x;
    }, common.xScale).
        y(function (d) {
            return d.y;
        }, common.yScale).
        attr("fill", function (d) {
            var iColor = IColorRemapFromD(d);
            return colors[iColor];
        });


    var table = null;
    if (iGroupStack >= 0) {
        if (!bNoColors && type == g_chartViews.cardcount) {
            chart.attr("stroke", function (d) {
                var iColor = IColorRemapFromD(d);
                if (iColor == 0)
                    return "black"; //make these a little thicker so its clear its the black one
            });
        }
        table = [
      [common.yAxis, chart, common.legend],
      [null, common.xAxis, null]
        ];
    } else {
        table = [
          [null, common.legend],
          [common.yAxis, chart],
          [null, common.xAxis]
        ];
    }

    var dataPrepended = prependChartTitle(table, g_dataChart, domain);
    g_chartContainer = new Plottable.Components.Table(table);
    function getLegendHeightApprox(length) {
        if (length > g_maxLegendsPerColumn) {
            length = Math.ceil(length / g_maxLegendColumns);
        }
        return length * g_heightLine * 0.7;
    }

    var heightChartCalc = getChartHeight(domain, cPartsGroupFinal, dataPrepended, 1, getLegendHeightApprox(legendTexts.length));
    elemChart.css('height', heightChartCalc);
    g_chartContainer.renderTo("#chart");
    if (iGroupStack >= 0 && !bNoColors) { //when there are too many legend items and few bars, the legend might get cropped.
        var heightLegend = common.legend.requestedSpace(common.legend._width, Infinity).minHeight;
        if (heightLegend > heightChartCalc)
            elemChart.css('height', heightLegend);
    }
    handleMouseMoveTooltips(elemChart, chart, common, legendTexts);
}

function handleMouseMoveTooltips(elemChart, chart, common, legendTexts) {
    var elemTooltip = $("#tooltipChart");
    // Setup Interaction.Pointer
    var pointer = new Plottable.Interactions.Pointer(); //review: unknown why the interaction is lost after switching to another chart and back here
    pointer.onPointerMove(function (p) {
        var bHide = true;
        var closest = chart.entitiesAt(p);
        if (closest && closest[0]) {
            closest = closest[0];
            if (closest.datum != null) {
                elemTooltip.css("left", p.x + elemChart.offset().left + (common.yAxis._width || 0) + 20);
                elemTooltip.css("top", closest.position.y + elemChart.offset().top);
                var iColor = undefined;
                var legendText = "";
                if (typeof (closest.datum.iColor) !== "undefined")
                    iColor = closest.datum.iColor;
                else {
                    var md = closest.dataset.metadata();
                    if (md)
                        iColor = md.iColor;
                }
                if (typeof (iColor) !== "undefined") {
                    legendText = legendTexts[iColor];
                    if (legendText)
                        legendText = escapeHtml(legendText) + "<br \>";
                }

                var yText = dlabelRealFromEncoded(closest.datum.y);
                elemTooltip.html(yText + "<br \>" + legendText + closest.datum.x);
                elemTooltip.show();
                bHide = false;
            }
        }
        if (bHide)
            elemTooltip.hide();
    });

    pointer.onPointerExit(function () {
        elemTooltip.hide();
    });

    pointer.attachTo(chart);
    pushInteraction(pointer, chart);
}

function fillPivotTables(rows, elemByUser, elemByBoard, urlParams, bNoTruncate) {
    var pivotBy = urlParams["pivotBy"];
    var bPivotByMonth = (pivotBy == PIVOT_BY.month);
    var bPivotByWeek = (pivotBy == PIVOT_BY.week);
    var bPivotByDate = (pivotBy == PIVOT_BY.day);
    var bPivotByYear = (pivotBy == PIVOT_BY.year);
    var tables = calculateTables(rows, pivotBy);
    //{ header: header, tips: tips, byUser: rgUserRows, byBoard: rgBoardRows };
    var parent = elemByUser.parent();
    var dyTop = 70;
    var strTh = "<th class='agile_header_pivot agile_pivotCell'>";
    var strTd = '<td class="agile_nowrap agile_pivotCell">';
    var strTable = "<table class='agile_table_pivot' cellpadding=2 cellspacing=0>";
    var elemTableUser = $(strTable);
    var trUser = $("<tr>");
    var elemTableBoard = $(strTable);
    var trBoard = $("<tr>");
    var replaces = [];
    var pivotStart = "weekStart";
    var pivotEnd = "weekEnd";

    if (bPivotByMonth || bPivotByYear) {
        pivotStart = "monthStart";
        pivotEnd = "monthEnd";
    }

    function handleClickZoom(table) {
        table[0].addEventListener('click',
	  function (ev) {
	      var t = ev.target;

	      var elemThis = $(t).closest('th,td');
	      var data = elemThis.data("agile_reportzoom");
	      if (!data)
	          return;

	      var params = getUrlParams();
	      for (var i = 0; i < data.replaces.length; i++) {
	          var rep = data.replaces[i];
	          params[rep.name] = rep.value;
	      }

	      if (data.bPivotByWeek || data.bPivotByMonth)
	          params["pivotBy"] = PIVOT_BY.day;
	      else if (data.bPivotByYear)
	          params["pivotBy"] = PIVOT_BY.month;
	      else
	          params["tab"] = 0;

	      if (data.bRemoveSimpleDateFilter)
	          params["sinceSimple"] = FILTER_DATE_ADVANCED;

	      if (ev.ctrlKey) {
	          window.open(buildUrlFromParams(params, true), '_blank');
	      }
	      else {
	          delete params[g_namedParams.namedReport];
	          window.location.href = buildUrlFromParams(params);
	      }
	  }, false);
    }

    function addClickZoom(tdElem, urlParams, replaces, bRemoveSimpleDateFilter, title) {
        title = title || "";
        if (title != "")
            tdElem.prop("title", title);

        if (bPivotByDate)
            return; //REVIEW todo

        //note: would be better to use anchors but I couldnt get them to be clickable in the whole cell so I went back
        //to using a click handler on the cell	
        tdElem.css("cursor", "-webkit-zoom-in");
        tdElem.addClass("agile_hoverZoom");
        //offload creating zoom url to the moment the cell is clicked. that way we get the correct iTab and possible url modifications from elsewhere
        var data = {
            replaces: replaces,
            bPivotByWeek: bPivotByWeek,
            bPivotByMonth: bPivotByMonth,
            bPivotByYear: bPivotByYear,
            bRemoveSimpleDateFilter: bRemoveSimpleDateFilter
        };
        tdElem.data("agile_reportzoom", data);
    }

    handleClickZoom(elemTableUser);
    handleClickZoom(elemTableBoard);
    var iCol = 0;
    var val = null;
    var tdElem = null;
    var strHeader = null;

    //HEADERS
    for (; iCol < tables.header.length; iCol++) {
        val = tables.header[iCol];
        var tdUser = $(strTh).text(val).attr("title", tables.tips[iCol]);
        var tdBoard = $(strTh).text(val).attr("title", tables.tips[iCol]);
        if (!bPivotByDate) {
            replaces = [{ name: pivotStart, value: val }, { name: pivotEnd, value: val }];
            if (val.length > 0) {
                addClickZoom(tdUser, urlParams, replaces, true);
                addClickZoom(tdBoard, urlParams, replaces, true);
            }
        }
        if (iCol == 0) {
            tdUser.text("User");
            tdBoard.text("Board");
        }
        trUser.append(tdUser);
        trBoard.append(tdBoard);
    }
    elemTableUser.append(trUser);
    elemTableBoard.append(trBoard);


    var bLastRow = false;
    //BY USER
    var iRow = 0;
    for (; iRow < tables.byUser.length; iRow++) {
        trUser = $("<tr>");
        var valUser = tables.byUser[iRow][0];
        var tdUserCol = $(strTd).text(valUser).addClass("agile_pivotFirstCol");
        trUser.append(tdUserCol);

        bLastRow = (iRow == tables.byUser.length - 1);

        if (!bLastRow) {
            replaces = [{ name: "user", value: valUser }];
            addClickZoom(tdUserCol, urlParams, replaces, false);
        }
        else {
            tdUserCol.css("font-weight", "bold");
            tdUserCol.css("text-align", "right");
        }

        for (iCol = 1; iCol < tables.header.length; iCol++) {
            strHeader = tables.header[iCol];
            val = parseFixedFloat(tables.byUser[iRow][iCol]) || 0;
            tdElem = $(strTd).text(val).addClass("agile_pivot_value");
            if (val == 0)
                tdElem.addClass("agile_pivotCell_Zero");
            trUser.append(tdElem);
            replaces = [{ name: pivotStart, value: strHeader }, { name: pivotEnd, value: strHeader }];
            if (bLastRow) {
                //last row
                tdElem.data("agile_total_row", "true");
                tdElem.css("font-weight", "bold");
            }
            else {
                replaces.push({ name: "user", value: valUser });
            }
            addClickZoom(tdElem, urlParams, replaces, true, strHeader + "    " + valUser);
            if (bPivotByWeek)
                tdElem.data("agile_week", strHeader);

        }
        elemTableUser.append(trUser);
    }

    //BY BOARD
    for (iRow = 0; iRow < tables.byBoard.length; iRow++) {
        trBoard = $("<tr>");
        var nameBoard = tables.byBoard[iRow][0].name || ""; //total rows dont have names
        if (!bNoTruncate)
            nameBoard = strTruncate(nameBoard);
        var tdBoardCol = $(strTd).text(nameBoard).addClass("agile_pivotFirstCol");
        trBoard.append(tdBoardCol);
        var valIdBoard = tables.byBoard[iRow][0].idBoard;

        bLastRow = (iRow == tables.byBoard.length - 1);

        if (!bLastRow) {
            replaces = [{ name: "idBoard", value: valIdBoard }];
            addClickZoom(tdBoardCol, urlParams, replaces, false);
        }
        else {
            tdBoardCol.css("font-weight", "bold");
            tdBoardCol.css("text-align", "right");
        }

        for (iCol = 1; iCol < tables.header.length; iCol++) {
            strHeader = tables.header[iCol];
            val = parseFixedFloat(tables.byBoard[iRow][iCol]) || 0;
            tdElem = $(strTd).text(val).addClass("agile_pivot_value");
            if (val == 0)
                tdElem.addClass("agile_pivotCell_Zero");
            trBoard.append(tdElem);
            replaces = [{ name: pivotStart, value: strHeader }, { name: pivotEnd, value: strHeader }];
            var titleCur = strHeader + "    " + nameBoard;

            if (bLastRow) {
                //last row
                tdElem.data("agile_total_row", "true");
                tdElem.css("font-weight", "bold");
            }
            else {
                replaces.push({ name: "idBoard", value: valIdBoard });
            }
            addClickZoom(tdElem, urlParams, replaces, true, titleCur);
            if (bPivotByWeek)
                tdElem.data("agile_week", strHeader); //used later to detect current week column
        }
        elemTableBoard.append(trBoard);
    }

    elemByUser.empty();
    elemByBoard.empty();
    elemByUser.append(elemTableUser);
    elemByBoard.append(elemTableBoard);
    configAllPivotFormats();
}

function configAllPivotFormats() {
    if (g_bBuildSqlMode)
        return;
    configPivotFormat($("#tabs-1 .agile_format_container"), g_dataFormatUser, $(".agile_report_container_byUser"), ITAB_BYUSER);
    configPivotFormat($("#tabs-2 .agile_format_container"), g_dataFormatBoard, $(".agile_report_container_byBoard"), ITAB_BYBOARD);
}

/* calculateTables
 *
 * returns { header, tips, byUser, byBoard}, last row of byUser contains column totals
 **/
function calculateTables(rows, pivotBy) {
    var header = [""];
    var users = {};
    var boards = {};
    var i = 0;
    var iColumn = 0;
    var pivotLast = "";
    var tips = [""]; //tip for each header element
    var totalsPerPivot = [""]; //appended at the end of the user results
    var bPivotByMonth = (pivotBy == PIVOT_BY.month);
    var bPivotByWeek = (pivotBy == PIVOT_BY.week);
    var bPivotByDate = (pivotBy == PIVOT_BY.day);
    var bPivotByYear = (pivotBy == PIVOT_BY.year);

    for (; i < rows.length; i++) {
        var row = rows[i];
        if (row.spent == 0)
            continue;
        var pivotCur = row.week;
        var dateStart = new Date(row.date * 1000);

        if (bPivotByMonth) {
            pivotCur = row.month;
        }
        else if (bPivotByDate) {
            pivotCur = dateStart.toLocaleDateString();
        }
        else if (bPivotByYear)
            pivotCur = "" + dateStart.getFullYear();

        if (pivotCur != pivotLast) {
            iColumn++;
            header[iColumn] = pivotCur; //note column zero is skipped, start at 1
            pivotLast = pivotCur;
            if (bPivotByWeek) {
                dateStart.setDate(dateStart.getDate() - DowMapper.posWeekFromDow(dateStart.getDay()));
                var title = dateStart.toLocaleDateString();
                dateStart.setDate(dateStart.getDate() + 6);
                title = title + " - " + dateStart.toLocaleDateString();
                tips[iColumn] = title;
            }
            else if (bPivotByDate) {
                tips[iColumn] = getWeekdayName(dateStart.getDay()) + " " + getCurrentWeekNum(dateStart);
            }
            else if (bPivotByMonth) {
                var dateMonthStart = new Date(dateStart.getTime());
                var dateMonthEnd = new Date(dateStart.getFullYear(), dateStart.getMonth() + 1, 0);
                dateMonthStart.setDate(1);
                tips[iColumn] = getCurrentWeekNum(dateMonthStart) + " - " + getCurrentWeekNum(dateMonthEnd);
            }
            else if (bPivotByYear) {
                tips[iColumn] = "" + dateStart.getFullYear();
            }
        }
        var userRow = users[row.user];
        var bWasEmpty = (userRow === undefined);
        if (bWasEmpty)
            userRow = [row.user];
        var sumUser = userRow[iColumn] || 0;
        userRow[iColumn] = sumUser + row.spent;
        if (bWasEmpty)
            users[row.user] = userRow;

        totalsPerPivot[iColumn] = (totalsPerPivot[iColumn] || 0) + row.spent;

        var boardRow = boards[row.nameBoard];
        bWasEmpty = (boardRow === undefined);
        if (bWasEmpty)
            boardRow = [{ name: row.nameBoard, idBoard: row.idBoardH }];
        var sumBoard = boardRow[iColumn] || 0;
        boardRow[iColumn] = sumBoard + row.spent;
        if (bWasEmpty)
            boards[row.nameBoard] = boardRow;
    }


    function doSortUser(a, b) {
        return (a[0].toLowerCase().localeCompare(b[0].toLowerCase()));
    }

    function doSortBoard(a, b) {
        return (a[0].name.toLowerCase().localeCompare(b[0].name.toLowerCase()));
    }

    var rgUserRows = [];
    var rgBoardRows = [];
    for (i in users)
        rgUserRows.push(users[i]);
    rgUserRows.sort(doSortUser);

    for (i in boards)
        rgBoardRows.push(boards[i]);
    rgBoardRows.sort(doSortBoard);
    rgUserRows.push(totalsPerPivot);
    rgBoardRows.push(totalsPerPivot);
    return { header: header, tips: tips, byUser: rgUserRows, byBoard: rgBoardRows };
}


function getHtmlDrillDownTooltip(customColumns, rows, mapCardsToLabels, customFieldsData, headersSpecial, options, groupBy, orderBy, eType, archived, deleted, bShowMonth, bByROpt) {
    var bOrderR = (orderBy == "remain");
    var header = [];
    const partsGroup = groupBy.split("-");
    var bCountCards = options.bCountCards;
    var bNoTruncate = options.bNoTruncate;
    var headersSpecialTemp = {};
    var idCardSelect = g_idCardSelect;
    g_idCardSelect = null;

    var cfmetaData = null;

    if (customFieldsData)
        cfmetaData = customFieldsData.cfmetaData;

    function pushSpecialLinkHeader() {
        assert(header.length > 0);
        headersSpecialTemp[header.length - 1] = {
            sorter: 'links'
        };
    }

    function pushSpecialDueDateHeader() {
        assert(header.length > 0);
        headersSpecialTemp[header.length - 1] = {
            sorter: 'dateDue'
        };
    }

    const bCustomColumns = (customColumns.length > 0);
    //see https://docs.google.com/a/plusfortrello.com/spreadsheets/d/1ECujO3YYTa3akMdnCrQ5ywgWnqybJDvXnVLwxZ2tT-M/edit?usp=sharing
    function includeCol(strCol) {
        if (strCol.indexOf(CF_PREFIX) == 0)
            return true;
        var colData = g_columnData[strCol];
        assert(colData);
        if (!bCustomColumns)
            return true;
        return (customColumns.indexOf(strCol) >= 0);
    }
   
    var rgColumnPositions = [];
    function pushHeader(name, base, bIsAggregate, bExtended) {
        base = base || name.toLowerCase();
        
        var bCF = (base.indexOf(CF_PREFIX) == 0);
        if (bCF)
            base = "cf";
        var colData = g_columnData[base];
        assert(colData);
        
        if (bCustomColumns && !bCF) {
            var iColCustom = customColumns.indexOf(base);
            assert(iColCustom>=0);
            rgColumnPositions.push(iColCustom);
        }
        if (!bIsAggregate && groupBy != "") {
            for (var iProp = 0; iProp < colData.length; iProp++) {
                if (partsGroup.indexOf(colData[iProp]) >= 0)
                    break;  //found
            }
            if (iProp >= colData.length)  //not found
                name += g_postFixHeaderLast;
        }
        var obj = { name: name };
        if (bExtended)
            obj.bExtend = true;
        header.push(obj);
    }

    function pushHeaderExtended(name, base, bIsAggregate) {
        pushHeader(name, base, bIsAggregate, true);
    }

    function pushHeaderAggregate(name, base, bExtended) {
        pushHeader(name, base, true, bExtended);
    }

    var bGroupedByDate = (groupBy.indexOf("dateString") >= 0);
    var bShowKeyword = (bCustomColumns ? includeCol("keyword") : g_bShowKeywordFilter);
    if (bShowKeyword)
        pushHeader("Keyword");

    var bRPopup = (bOrderR && g_bPopupMode);
    var bShowDate = bCustomColumns ? includeCol("dateString") : (!bRPopup || bGroupedByDate);
    if (bShowDate)
        pushHeader("Date", "dateString");

    if (bCustomColumns)
        bShowMonth = includeCol("month");
    var bCardGrouping = (groupBy.indexOf("idCardH") >= 0);
    var bShowBoard = bCustomColumns ? includeCol("board") : (groupBy == "" || groupBy.indexOf("idBoardH") >= 0 || bCardGrouping);
    var bShowCard = bCustomColumns ? includeCol("card") : (groupBy == "" || bCardGrouping);
    var bShowTeam = bCustomColumns ? includeCol("team") : (groupBy.indexOf("idTeamH") >= 0 || (!g_bPopupMode && bShowBoard));
    var bGroupedByLabels = (groupBy.indexOf("labels") >= 0);
    var bShowLabels = bCustomColumns ? includeCol("labels") : g_bProVersion && (bShowCard || bGroupedByLabels);

    if (bShowLabels && bCustomColumns && !mapCardsToLabels) {
        sendDesktopNotification("To show labels, group by card or s/e rows.", 12000);
    }
    var bShowList = bCustomColumns ? includeCol("nameList") : ((!bRPopup || groupBy.indexOf("nameList") >= 0) && g_bEnableTrelloSync && (groupBy == "" || groupBy.indexOf("nameList") >= 0 || orderBy.indexOf("posList") >= 0 || bShowCard));
    var bPushedCard = false;
    var bGroupedByHashtags = (groupBy.indexOf("hashtags") >= 0);
    var bGroupedByFirstHashtag = (groupBy.indexOf("hashtagFirst") >= 0);
    var bShowHashtag = bCustomColumns ? includeCol("hashtagFirst") : (bGroupedByFirstHashtag || bGroupedByHashtags);
    var bShowCardShortLink = bCustomColumns ? includeCol("cardShortLink") : options.bOutputCardShortLink;
    var bShowCardNumber=bCustomColumns ? includeCol("cardNumber") : options.bOutputCardIdShort;

    function pushCardHeader() {
        if (bShowCardShortLink)
            pushHeader("Card shortLink", "cardShortLink");

        if (bShowCardNumber)
            pushHeader("Card #", "cardNumber");
        if (bShowCard) {
            pushHeader("Card", "card");
            pushSpecialLinkHeader();
        }
    }

    var bShowDueDate = bCustomColumns? includeCol("dateDue") : bCardGrouping;
    if (bShowDueDate) {
        pushHeader("Due date", "dateDue");
        pushSpecialDueDateHeader();
    }

    var bShowCreatedDate = bCustomColumns ? includeCol("dateCreated") : false;
    if (bShowCreatedDate) {
        pushHeader("Created date", "dateCreated");
    }

    var bShowWeek = bCustomColumns ? includeCol("week") : (bShowDate && (bGroupedByDate || !g_bPopupMode));
    if (bShowWeek)
        pushHeader("Week","week");

    if (bShowCard && bCardGrouping && !bPushedCard) {
        pushCardHeader();
        bPushedCard = true;
    }

    var bShowCardCount= bCustomColumns? includeCol("cardCount"): (bCountCards && groupBy.indexOf("idCardH") < 0);
    if (bShowCardCount)
        pushHeader("Card count", "cardCount", true);
    var bGroupByCardOrNone = (groupBy == "" || bCardGrouping);
    var bShowArchived = bCustomColumns ? includeCol("archived") : (g_bEnableTrelloSync && bGroupByCardOrNone && archived != "1" && archived != "0");
    var bShowDeleted = bCustomColumns ? includeCol("deleted") : (g_bEnableTrelloSync && bGroupByCardOrNone && deleted != "1" && deleted != "0");
    if (bShowMonth)
        pushHeader("Month", "month");

    var bShowUser = bCustomColumns ? includeCol("user") : (g_bNoSE? false : (groupBy == "" || groupBy.indexOf("user") >= 0));
    if (bShowUser)
        pushHeader("User");

    if (bShowTeam) {
        pushHeader("Team");
        pushSpecialLinkHeader();
    }

    var bShowBoardShortLink = bCustomColumns ?includeCol("boardShortLink") : (bShowBoard && options.bOutputBoardShortLink);
    if (bShowBoardShortLink) {
        pushHeader("Board shortLink", "boardShortLink");
    }

    if (bShowBoard) {
        pushHeader("Board","board");
        pushSpecialLinkHeader();
    }

    if (bShowList)
        pushHeader("List","nameList");

    if (bShowHashtag) {
        pushHeader(bGroupedByHashtags?"Hashtag": "1st Hashtag", "hashtagFirst");
    }

    if (!bPushedCard) {
        pushCardHeader();
        bPushedCard = true;
    }

    if (bShowLabels)
        pushHeader(bGroupedByLabels? "Label" : "Labels", "labels");

    var bShowS = true;
    var bShowEFirst = true;
    var bShowE = true;
    var bShowRemain = true;
    var bNoSEInfo = (bOrderR && groupBy != "idCardH-user" && bByROpt);
    if (!bCustomColumns) {
        if (bNoSEInfo) {
            bShowS = false; //S/E is not meaningful when filtering only by cards with non-zero R
            bShowEFirst = false;
            bShowE = false;
        }

        bShowRemain = (bOrderR || groupBy != "");
        if (g_bNoSE) {
            bShowS = false;
        }

        if (g_bNoSE || g_bNoEst) {
            bShowEFirst = false;
            bShowE = false;
            bShowRemain = false;
        }

    } else {
        bShowS = includeCol("s");
        bShowEFirst = includeCol("e1st");
        bShowE = includeCol("e");
        bShowRemain = includeCol("r");
    }

    if (bShowS)
        pushHeader("S", "", true);
    if (bShowEFirst)
        pushHeaderAggregate("E 1ˢᵗ","e1st");
    if (bShowE)
        pushHeaderAggregate("E");
    if (bShowRemain)
        pushHeaderAggregate("R");

    var bShowComment = bCustomColumns ? includeCol("note") : !g_bNoSE && (groupBy == "" || groupBy.indexOf("comment") >= 0);
    if (bShowComment)
        pushHeaderExtended("Note");

    var bShowEtype = bCustomColumns ? includeCol("eType") : (!g_bNoSE && !g_bNoEst && groupBy == "");

    if (bShowEtype)
        pushHeader(COLUMNNAME_ETYPE, "eType");

    if (bShowArchived)
        pushHeader("Archived");

    if (bShowDeleted)
        pushHeader("Deleted");

    if (cfmetaData && cfmetaData.sortedColumns) {
        cfmetaData.sortedColumns.forEach(function (id) {
            pushHeader(CF_PREFIX + cfmetaData[id].name, null, cfmetaData[id].type=="number");
        });
    }
    var dateNowCache = new Date();
    const lengthCols = header.length;
    var iPosCol;
    var iPosExtra = 0; //for cf
    if (bCustomColumns) {
        //alert: rgColumnPositions works only if we guarantee that custom columns are ALWAYS shown. make sure all uses above of 'bCustomColumns' force the column if specified, even if Plus cant show it.
        var headerSorted = new Array(lengthCols);
        for (var iHeader = 0; iHeader < lengthCols; iHeader++) {
            if (iHeader >= rgColumnPositions.length) {
                assert(header[iHeader].name.indexOf(CF_PREFIX) == 0); //its a custom field
                iPosCol = rgColumnPositions.length + iPosExtra;
                iPosExtra++;
            } else {
                iPosCol = rgColumnPositions[iHeader];
            }
            headerSorted[iPosCol] = header[iHeader];
        }
        header = headerSorted;
    }

    for (var propICol in headersSpecialTemp) {

        
        if (bCustomColumns) {
            assert(propICol < rgColumnPositions.length);
            iPosCol = rgColumnPositions[propICol];
        } else {
            iPosCol = propICol;
        }

        headersSpecial[iPosCol] = headersSpecialTemp[propICol];
    }

    
    function callbackRowData(row) {
        if (idCardSelect && row.idCardH == idCardSelect)
            row.bSelectedRow = true;
        bPushedCard = false;
        if (row.rowid && row.rowid > g_rowidLastSyncRemember) //review zig: hacky way so we dont loop the array twice. would be nice if this was outside of view
            g_rowidLastSyncRemember = row.rowid;
        var rgRet = new Array(lengthCols);
        var dateString = row["dateString"];
        var dateTimeString = row["dtString"];
        var daterow = new Date(row.date * 1000); //db is in seconds
        if (dateString === undefined || dateTimeString === undefined) {
            var dateDbUse = daterow;
            dateString = makeDateCustomString(dateDbUse);
            dateTimeString = makeDateCustomString(dateDbUse, true);
        }

        var iColPushed = -1;
        function pushCol(obj) {
            iColPushed++;
            var iPosCol;
            if (bCustomColumns) {
                if (iColPushed >= rgColumnPositions.length) {
                    iPosCol = iColPushed; //custom fields
                } else {
                    iPosCol = rgColumnPositions[iColPushed];
                }
            } else {
                iPosCol = iColPushed;
            }
           
            rgRet[iPosCol]=obj;
        }

        if (bShowKeyword)
            pushCol({ name: escapeHtml(row.keyword), bNoTruncate: true });
        if (bShowDate)
            pushCol({ name: (bGroupedByDate ? dateString : dateTimeString), bNoTruncate: true });
        if (bShowDueDate) {
            var dateDueTimeString = row.dateDue || "";
            if (dateDueTimeString) {
                dateDueTimeString = new Date(dateDueTimeString * 1000);
                dateDueTimeString = makeDateCustomString(dateDueTimeString, true);
            }
            pushCol({ name: dateDueTimeString, bNoTruncate: true });
        }

        if (bShowCreatedDate) {
            var dateCreatedTimeString = row.dateCreated || "";
            if (dateCreatedTimeString) {
                dateCreatedTimeString = new Date(dateCreatedTimeString * 1000);
                dateCreatedTimeString = makeDateCustomString(dateCreatedTimeString, true);
            }
            pushCol({ name: dateCreatedTimeString, bNoTruncate: true });
        }

        function pushCardRow() {
            if (bShowCardShortLink) {
                pushCol({ name: row.idCardH, bNoTruncate: true });
            }
            if (bShowCardNumber) {
                pushCol({ name: row.idShort, bNoTruncate: true });
            }

            if (bShowCard) {
                var urlCard;
                if (row.idCardH.indexOf("https://") == 0)
                    urlCard = row.idCardH; //old-style card URLs. Could be on old historical data from a previous Spent version
                else
                    urlCard = "https://trello.com/c/" + row.idCardH;

                pushCol({ name: "<A title='Go to Trello card' target='_blank' href='" + urlCard + "'>" + escapeHtml(bNoTruncate ? row.nameCard : strTruncate(row.nameCard)) + "</A>", bNoTruncate: true });
            }
        }

        if (bShowWeek) //week
            pushCol({ name: row.week ? row.week : getCurrentWeekNum(daterow), bNoTruncate: true });

        if (bShowCard && bCardGrouping && !bPushedCard) { //card
            pushCardRow();
            bPushedCard = true;
        }

        if (bShowCardCount) //note if !countCards we must output something if user picked the custom column. 1 makes more sense than 0
            pushCol({ name: String(row.countCards || 1), bNoTruncate: true });

        if (bShowMonth)
            pushCol({ name: row.month ? row.month : getCurrentMonthFormatted(daterow), bNoTruncate: true });

        if (bShowUser)
            pushCol({ name: row.user, bNoTruncate: bNoTruncate });

        if (bShowTeam) {
            var urlTeam = "https://trello.com/" + (row.nameTeamShort || "");
            var nameTeam = row.nameTeam || ""; //for rows without team
            pushCol({ name: "<A title='Go to Trello team' target='_blank' href='" + urlTeam + "'>" + escapeHtml(bNoTruncate ? nameTeam : strTruncate(nameTeam)) + "</A>", bNoTruncate: true });
        }

        if (bShowBoardShortLink)
            pushCol({ name: (row.idBoardH == IDBOARD_UNKNOWN ? "" : row.idBoardH), bNoTruncate: true });

        if (bShowBoard) {
            var urlBoard = "https://trello.com/b/" + row.idBoardH;
            pushCol({ name: "<A title='Go to Trello board' target='_blank' href='" + urlBoard + "'>" + escapeHtml(bNoTruncate ? row.nameBoard : strTruncate(row.nameBoard)) + "</A>", bNoTruncate: true });
        }

        if (bShowList) {
            var strListUse = row.nameList;
            if (!bNoTruncate)
                strListUse = strTruncate(strListUse, g_cchTruncateShort);
            pushCol({ name: escapeHtml(strListUse), bNoTruncate: true });
        }


        if (bShowHashtag) {
            var nameHSF;
            if (bGroupedByFirstHashtag || bGroupedByHashtags) {
                assert(row.hashtagFirst !== undefined);
                nameHSF = row.hashtagFirst; //when grouping by hashtag, its already extracted
            }
            else {
                var rgHashForCard = getHashtagsFromTitle(row.nameCard || "", true);
                if (rgHashForCard.length > 0)
                    nameHSF = rgHashForCard[0];
                else
                    nameHSF = "";
            }
            pushCol({ name: escapeHtml(nameHSF), bNoTruncate: bNoTruncate });
        }

        if (!bPushedCard && (bShowCard || bShowCardNumber || bShowCardShortLink)) {
            pushCardRow();
            bPushedCard = true;
        }

        if (bShowLabels) {
            if (bGroupedByLabels) {
                assert(row.labels !== undefined); //already extracted when grouping by labels
                pushCol({ name: escapeHtml(row.labels), bNoTruncate: bNoTruncate });
            } else {
                //mapCardsToLabels might not be there when the column is forced with custom columns
                var labels = !mapCardsToLabels ? "" : (mapCardsToLabels[row.idCardH] || { labels: "" }).labels;
                pushCol({ name: labels, bNoTruncate: true }); //labels dont truncate otherwise it could not show an entire label if the card has many
            }
        }
        var sPush = parseFixedFloat(row.spent);
        var estPush = parseFixedFloat(row.est);
        if (bShowS)
            pushCol({ type: "S", name: sPush, bNoTruncate: true });
        if (bShowEFirst)
            pushCol({ type: "EFirst", name: parseFixedFloat(row.estFirst), bNoTruncate: true }); //not type "E". that is used when showing sum of row selections
        if (bShowE)
            pushCol({ type: "E", name: estPush, bNoTruncate: true });
        
        if (bShowRemain) {
            var remainCalc = parseFixedFloat(row.est - row.spent);
            if (bOrderR && remainCalc == 0)
                return [];
            pushCol({ type: "R", name: remainCalc, bNoTruncate: true }); //type "R" just so it generates the transparent zero
        }
        if (bShowComment)
            pushCol({ name: escapeHtml(options.bNoBracketNotes ? removeBracketsInNote(row.comment) : row.comment), bNoTruncate: bNoTruncate });

        if (bShowEtype)
            pushCol({ name: nameFromEType(row.eType), bNoTruncate: true });

        if (bShowArchived)
            pushCol({ name: row.bArchivedCB > 0 ? "Yes" : "No", bNoTruncate: true });

        if (bShowDeleted)
            pushCol({ name: row.bDeleted ? "Yes" : "No", bNoTruncate: true });

        
        if (cfmetaData && cfmetaData.sortedColumns) {
            cfmetaData.sortedColumns.forEach(function (id) {
                var valCF = "";
                cfmetaDataCur = cfmetaData[id];
                if (row.cfData && row.cfData[id]) {
                    if (cfmetaDataCur) {
                        valCF = row.cfData[id].val;
                    }
                }
                pushCol({ name: valCF, bNoTruncate: bNoTruncate });
            });
        }

        if (!bShowComment) {
            var title = "Last: ";
            title += row.user;
            title += " - " + row.nameBoard;
            title += " - " + row.nameList;
            title += " - " + row.nameCard;
            title += " - " + row.comment;
            if (row.rowid == ROWID_REPORT_CARD)
                title += "\n(no s/e)";
            rgRet.title = escapeHtml(title);
        } else {
            rgRet.title = escapeHtml((!bNoSEInfo ? "(" + sPush + " / " + estPush + ") " : "") + row.comment);
        }
        if (row.date) {
            var dateRow = new Date(row.date * 1000);
            var delta = getDeltaDates(dateNowCache, dateRow); //db is in seconds
            var postFix = " days ago";
            if (delta == 1)
                postFix = " day ago";
            else if (delta == 0) {
                delta = "";
                postFix = "today";
            }
            rgRet.title = rgRet.title + "\n" + makeDateCustomString(dateRow, true) + "\n" + getCurrentWeekNum(dateRow) + " " + delta + postFix;
        }
        return rgRet;
    }

    return getHtmlBurndownTooltipFromRows(true, rows, false, header, callbackRowData, true, "", !bNoSEInfo);
}

function getSQLReport(sql, values, callback) {
    getSQLReportShared(sql, values, callback, function onError(status) {
        showError(status);
    });
}

