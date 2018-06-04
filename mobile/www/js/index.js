/// <reference path="intellisense.js" />

var TRELLO_APPKEY = "xxxxxxx";
var g_idGlobalAnalytics = "zzzzz";
//var TRELLO_APPKEY = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxx";
//var g_idGlobalAnalytics = "xx-xxxxxxxx-x";

//localStorage usage:
//some items are stored directly with a fixed string, using global PROP_* properties
//dinamically named properties are always prefixed by a string and a colon, plus one parameter.
// rnid:id for notifications
// td:url for caching trello api calls
// mpc:shortLink maps card shortlink to id
// mpb:shortLink maps board shortlink to id


var PROP_TRELLOKEY = "trellokey";
var PROP_TRELLOUSERDATA = "trellouserdata";
var PROP_PLUSKEYWORDS = "plusKeywords";
var PROP_ALLOWNEGATIVER = "allowNegativeR";
var PROP_UNITSASPOINTS = "unitsAsPoints";
var PROP_GLOBALUSER = "globalUser";
var PROP_LASTACTIVITYINFO = "lastActivityInfo";
var PROP_PLUSUNITS = "plusUnits";
var PROP_NAVIDCARDLONG = "nav-idCardLong"; //duplicated from redirector.js
var STATUS_OK = "OK";
var IMAGE_HEADER_TEMPLATE = '<img src="img/login.png" class="imgHeader" width="20" align="top" />';
var g_cPageNavigations = 0;
var g_bLocalNotifications = false;
var g_mapLastActivityInfo = null;
var g_user = null;
var g_bAllowNegativeRemaining = false;
var g_bDisplayPointUnits = false;

var g_msMaxHandleOpenUrl = 2000; //max time we remember we opened this url already. since we use 500 intervals, really we could make it 600 but 2000 is safer

var g_loaderDetector = {
    initLoader: function () {
        if (!isCordova()) {
            var url = document.location.href;
            if (url.indexOf("#") >= 0 || url.indexOf("?") >= 0) {
                window.location.replace("/index.html");
                return this;
            }
        }
        return this;
    }
}.initLoader();

function registerWorker() {
    if (!('serviceWorker' in navigator))
        return;
    //caller already waited for window load (https://github.com/google/WebFundamentals/issues/3883)
    if (navigator.serviceWorker.addEventListener) {
        navigator.serviceWorker.addEventListener('message', function (event) {
            if (event.data.action && event.data.action == "pinnedCard")
                changePage("card.html?id=" + encodeURIComponent(event.data.idCardLong), "none", null);
        });
    }
    navigator.serviceWorker.register('service-worker.js').then(function (reg) {
        // updatefound is fired if service-worker.js changes.
        reg.onupdatefound = function () {
            // The updatefound event implies that reg.installing is set; see
            // https://slightlyoff.github.io/ServiceWorker/spec/service_worker/index.html#service-worker-container-updatefound-event
            var installingWorker = reg.installing;

            installingWorker.onstatechange = function () {
                switch (installingWorker.state) {
                    case 'installed':
                        if (navigator.serviceWorker.controller) {
                            // At this point, the old content will have been purged and the fresh content will
                            // have been added to the cache.
                            // It's the perfect time to display a "New content is available; please refresh."
                            // message in the page's interface.
                            //console.log('New or updated content is available.');
                        } else {
                            // At this point, everything has been precached.
                            // It's the perfect time to display a "Content is cached for offline use." message.
                            //console.log('Content is now available offline!');
                        }
                        break;

                    case 'redundant':
                        console.error('The installing service worker became redundant.');
                        break;
                    default:
                        //other states like 'activated'
                        break;
                }
            };
        };
    }).catch(function (e) {
        console.error('Error during service worker registration:', e);
    });
}

function assert(val) {

    if (!val) {
        //review zig: send to log
        if (g_user && g_user.username && (g_user.username.toLowerCase() == "zmandel" || g_user.username.toLowerCase() == "zigmandel")) {
            var str = "assert failed! ";
            try {
                throw new Error();
            } catch (e) {
                str = str + " :: " + e.stack;
                //remove self/known callstack elements, and remove column from each line number
                str = str.replace(/\n\s*(at assert).*\n/, "\n").replace(/:\d\)/g, ")");
                //remove absolute paths
                str = str.replace(/file:\/\/.*\//g, "");
            }
            alert(str);
        }
    }
}

//called when plusfortrello://activity is received
function handleOpenURL(url) {
    //alertMobile(url);

    //duplicate detection is needed so that we can launch several identical activities into the app when a notification is clicked.
    //needed because on cold start it takes time for the app to load and would miss the notification callback if we didnt
    //send many events. see onLocalNotification
    if (g_mapLastActivityInfo === null) {
        var lai = localStorage[PROP_LASTACTIVITYINFO];
        if (lai)
            g_mapLastActivityInfo = JSON.parse(lai);
        else
            g_mapLastActivityInfo = {};
    }

    var strFind = "://";
    var iFind = url.indexOf(strFind);
    if (iFind >= 0)
        url = url.substr(iFind + strFind.length);

    
    var msNow = new Date().getTime();
    var cRetry = 0;
    var idNotificationFrom = null;
    var splitted = url.split("&retryActivity=");
    if (splitted.length == 2)
        cRetry = parseInt(splitted[1], 10); //note that parseInt works even if the number is followed by another parameter

    splitted = url.split("&idNotification=");
    if (splitted.length == 2)
        idNotificationFrom = parseInt(splitted[1], 10);

    if (!idNotificationFrom) {
        assert(false);
        return;
    }

    var iFindNotifParams = url.indexOf("fromNotification=true");
    //remove all notif parameters. otherwise new ones can be added on top of the url and mess things up with dup parameteres
    if (iFindNotifParams>0) {
        url=url.substr(0,iFindNotifParams - 1); 
    } else {
        assert(false);
    }
    var key = "rnid:" + idNotificationFrom; //make it a string. frefix so later it wont ever confict with others.
    var mapCur = g_mapLastActivityInfo[key];
    var msLast = 0;
    var bSkip = false;
    if (mapCur) {
        msLast = mapCur.ms;
    }
    else {
        mapCur = { ms: msNow };
        g_mapLastActivityInfo[key] = mapCur;
    }

    
    if (cRetry) {
        if (msNow - msLast < g_msMaxHandleOpenUrl) {
            bSkip=true;
        }
    }

    mapCur.ms = msNow;
    var objClean = {};
    //keep only recent so it doenst grow forever
    if (!bSkip) {
        //alertMobile("" + cRetry + " retry");
        for (var i in g_mapLastActivityInfo) {
            if (msNow - g_mapLastActivityInfo[i].ms < g_msMaxHandleOpenUrl)
                objClean[i] = g_mapLastActivityInfo[i];
        }
        g_mapLastActivityInfo = objClean;
    }
    //needs to be stored in case user 1) clicks a notification 2) quickly quits app
    localStorage[PROP_LASTACTIVITYINFO] = JSON.stringify(g_mapLastActivityInfo);
    if (!bSkip) {
        changePage(url, "slidedown");
    }
}

function changePage(url, transition, callback, bReplaceState) {
    if (g_bShownPopupLink)
        $("#openAsDesktopPopup").hide();
    //review zig: jqm 1.4.5 does not fix this bug https://github.com/jquery/jquery-mobile/issues/1383
    //review zig: no longer needed as we only pass card long id in parameters
    url = url.replace(/'/g, ' ').replace(/"/g, ' ').replace(/\(/g, ' ').replace(/\)/g, ' ');
    var optsChange = { transition: transition, showLoadMsg: false, changeHash: !bReplaceState };
	$.mobile.changePage(url, optsChange);
	if (callback)
	    callback();
}

var g_titlesPage = {
    pageLogin: "Home",
    pageSettings: "Settings",
    pageHelp: "Help",
    pageListBoards: "Boards",
    pageListLists: "Lists",
    pageListCards: "Cards",
    pageCardDetail: "Card"
};

//context is used to compare page context in a closure with current context.
//useful after a network call returns and user might not be in the same page anymore.
//a quick user on a slow connection could defeat this by re-entering the same page going always forward
//for example by pinning the card, going to another card and clicking the notification thus the card opens again.
//not handled as its rare and current routing might be replaced with an actual framework
var g_stateContext = {
    idPage: "pageLogin",
    idBoard: null,
    idList: null,
    idCard: null
};

var g_analytics = {
    idAnalytics: null,
    PROP_IDANALYTICS : "idAnalytics",
    PROP_DISABLEANALYTICS: "bDisableAnalytics",
    bDisableAnalytics: false,
    setDisabled: function (bDisabled) {
        if (bDisabled)
            localStorage[this.PROP_DISABLEANALYTICS] = "true";
        else
            delete localStorage[this.PROP_DISABLEANALYTICS];
        this.bDisableAnalytics= bDisabled;
    },
    init: function () {
        if (this.idAnalytics)
            return;

        this.idAnalytics = localStorage[this.PROP_IDANALYTICS];
        this.bDisableAnalytics=(localStorage[this.PROP_DISABLEANALYTICS]=="true");
        if (!this.idAnalytics) {
            this.idAnalytics = this.generateQuickGuid();
            localStorage[this.PROP_IDANALYTICS] = this.idAnalytics;
        }
    },
    hit: function (params, msDelay) {
        if (this.bDisableAnalytics)
            return;
        msDelay = msDelay || 1000;
        this.init();
        var payload = "v=1&tid=" + "UA-" + g_idGlobalAnalytics + "zzz" + "-" + "1" + "&cid=" + encodeURIComponent(g_analytics.idAnalytics);
        for (p in params) {
            payload = payload + "&" + p + "=" + encodeURIComponent(params[p]);
        }

        var PROP_LS_CD1LAST = "CD1LAST";

        var valCD1Prev = localStorage[PROP_LS_CD1LAST] || "";
        var cslCD1Cur = (isCordova() ? "MobileApp" : "WebApp");
        if (valCD1Prev != cslCD1Cur) { //analytics docs recommend to only send the parameter when it changed, for performance.
            payload = payload + "&cd1=" + cslCD1Cur;

        }
        setTimeout(function () {
        $.post("https://www.google-analytics.com/collect", payload, function (data) {
            if (valCD1Prev != cslCD1Cur)
                localStorage[PROP_LS_CD1LAST] = cslCD1Cur;
        });
        }, msDelay);
    },
    //private
    generateQuickGuid: function () {
        //http://stackoverflow.com/questions/105034/create-guid-uuid-in-javascript
        return Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
    }
};

var g_recentBoards = {
    PROP: "recentBoards",
    MAXIMUM:8,
    markRecent: function (name, id) {
        var msDate = new Date().getTime();
        var boards=this.boards;
        var boardNew = { name: name, id: id, msDate: msDate };
        var msDateMin = msDate;
        var iReplace=-1;
        for (var i = 0; i < boards.length; i++) {
            var board = boards[i];
            if (board.id == id) {
                iReplace = i;
                break;
            }
            if (board.msDate < msDateMin) {
                iReplace = i;
                msDateMin = board.msDate;
            }
        }
        if (iReplace < 0 || (boards[iReplace].id != id && boards.length < this.MAXIMUM))
            boards.push(boardNew);
        else
            boards[iReplace] = boardNew;
        localStorage[this.PROP] = JSON.stringify(boards);
    },
    updateAll: function (mapBoards) {
        var boards = this.boards;
        var bModified = false;
        for (var i = 0; i < boards.length; i++) {
            if (!mapBoards[boards[i].id]) {
                bModified = true;
                boards.splice(i, 1);
                i--;
            }
        }
        if (bModified)
            localStorage[this.PROP] = JSON.stringify(boards);
    },
    init : function () {
        var store = localStorage[this.PROP];
        if (store)
            this.boards = JSON.parse(store);
    },
    reset: function () {
        delete localStorage[this.PROP];
        this.boards = [];
    },
    boards : []
};


var g_recentUsers = {
    PROP: "recentUsers",
    MAXIMUM: 50,
    markRecent: function (name, id, msDate, bSaveProp) {    //returns if users was modified.
        //note id can be null. search is done based both on id and name
        var users = this.users;
        name = name.toLowerCase();
        var userNew = { name: name, id: id, msDate: msDate };
        var msDateMin = msDate;
        var iReplace = -1;
        var bModified = false;
        var bExact = false;
        for (var i = 0; i < users.length; i++) {
            var user = users[i];
            if ((user.id && user.id == id) || (user.name==name)) {
                iReplace = i;
                bExact = true;
                break;
            }
            if (user.msDate < msDateMin) {
                iReplace = i;
                msDateMin = user.msDate;
            }
        }
        if (iReplace < 0 || (!bExact && users.length < this.MAXIMUM)) {
            users.push(userNew);
            bModified = true;
        }
        else {
            if (users[iReplace].msDate < userNew.msDate) {
                users[iReplace] = userNew;
                bModified = true;
            }
        }
        if (bSaveProp && bModified)
            this.saveProp();
        return bModified;
    },
    saveProp: function () {
        localStorage[this.PROP] = JSON.stringify(this.users);
    },
    init: function () {
        var store = localStorage[this.PROP];
        if (store)
            this.users = JSON.parse(store);
    },
    reset: function () {
        delete localStorage[this.PROP];
        this.users = [];
    },
    users: []
};

var g_pinnedCards = {
    PROP: "pinnedCards",
    PROP_NOTIF_IDLAST : "lastPinnedCardId",
    MAXIMUM: 50, //review zig: limiting for now. dont see a case for letting more as its not super-efficient the localStorage implementation
    idPinnedStart:1000,  //start ids at 1000 for no good reason yet
    cards: [],
    idPinnedLast: null,

    init : function () {
        var store = localStorage[this.PROP];
        if (store)
            this.cards = JSON.parse(store);
        var idLast=localStorage[this.PROP_NOTIF_IDLAST];
        if (idLast)
            idLast=parseInt(idLast,10);

        this.idPinnedLast = idLast || this.idPinnedStart;
    },

    reset: function () {
        delete localStorage[this.PROP];
        delete localStorage[this.PROP_NOTIF_IDNEXT];
        this.cards = [];
    },

    getIdNotification: function (id) { //returns null if not pinned.
        for (var i = 0; i < this.cards.length; i++) {
            var card =  this.cards[i];
            if (card.id == id) {
                return card.idNotification;
            }
        }
        return null;
    },

    updatePinned: function (id, name, nameList, nameBoard ) { //returns null if not pinned.
        for (var i = 0; i < this.cards.length; i++) {
            var card = this.cards[i];
            if (card.id == id) {
                if (card.name != name || card.nameList != nameList || card.nameBoard != nameBoard) {
                    card.name = name;
                    card.nameList = nameList;
                    card.nameBoard = nameBoard;
                    localStorage[this.PROP] = JSON.stringify(this.cards);
                }
                break;
            }
        }
    },

    pin: function (name, nameList, nameBoard, id, shortLink, bPin) {
        var msDate = null; 
        var cards=this.cards;
        var iReplace=-1;
        var idPinnedUse = null;
        var bIncrementedId = false;

        if (bPin) {
            msDate = new Date().getTime();
            idPinnedUse=this.idPinnedLast+1;
            bIncrementedId=true;
        }

        var msDateMin = msDate;
        var cardNew = { name: name, nameList: nameList, nameBoard: nameBoard, id: id, shortLink: shortLink, msDate: msDate, idNotification: idPinnedUse };

        for (var i = 0; i < cards.length; i++) {
            var card = cards[i];
            if (card.id == id) {
                iReplace = i;
                idPinnedUse=card.idNotification;
                bIncrementedId=false;
                break;
            }
            if (bPin && card.msDate < msDateMin) {
                iReplace = i;
                msDateMin = card.msDate;
            }
        }

        var bSave=true;
        if (!bPin) {
            if (iReplace >= 0 && cards[iReplace].id == id) {
                cards.splice(iReplace, 1);
            }
            else
                bSave=false;
        }
        else if (iReplace < 0 || (cards[iReplace].id != id && cards.length < this.MAXIMUM))
            cards.push(cardNew);
        else
            cards[iReplace] = cardNew;

        if (bPin && bIncrementedId) {
            this.idPinnedLast = idPinnedUse;
            localStorage[this.PROP_NOTIF_IDLAST] = idPinnedUse;
        }


        if (bSave)
            localStorage[this.PROP] = JSON.stringify(cards);

        return idPinnedUse;
    }
};

var g_mapShortLinks = {
    prefixBoard: "mpb:",
    prefixCard: "mpc:",
    setBoardId: function (shortLink, id) {
        localStorage[this.prefixBoard + shortLink] = id;
    },
    getBoardId: function (shortLink) {
        return localStorage[this.prefixBoard + shortLink]; //can be undefined
    },

    setCardId: function (shortLink, id) {
        localStorage[this.prefixCard + shortLink] = id;
    },
    getCardId: function (shortLink) {
        return localStorage[this.prefixCard + shortLink]; //can be undefined
    }
};

//Exists just for testing purposes by running locally in chrome
function isCordova() {
    return (typeof (cordova) != "undefined");
}

var g_cAlerts = 0;
function alertMobile(message, msTimeout) {
    var bCordova = isCordova();
    if (bCordova)
        window.plugins.toast.showShortTop(message);
    else
        $.mobile.loading('show', { theme: "a", text: message, textonly: true, textVisible: true });
    g_cAlerts++;
    setTimeout(function () {
        g_cAlerts--;
        if (g_cAlerts == 0 && !bCordova) {
            $.mobile.loading('hide');
        }
    }, msTimeout || 4000);
}

$(document).bind("mobileinit", function () {
    try {
        $.support.cors = true;
        $.mobile.allowCrossDomainPages = true;
        $.mobile.hoverDelay = 10;
        $.mobile.phonegapNavigationEnabled = true;
    } catch (e) {

    }
});


function openUrlAsActivity(url) {
    if (!isCordova()) {
        openNoLocation(url);
        return;
    }
    window.plugins.webintent.startActivity({
        action: window.plugins.webintent.ACTION_VIEW,
        url: url
    },
            function () { },
            function (e) { alertMobile('Failed to open. Please try later'); }
    );
}

$(document).ready(function () {
    //review zig: apparently has to be here as dom is not built on mobileinit
    FastClick.attach(document.body);
});

function setDefaultKeywords() {
    var keywords = localStorage[PROP_PLUSKEYWORDS];
    var keywordsDefault = "plus!, plus s/e";
    if (!keywords) {
        keywords = keywordsDefault;
        localStorage[PROP_PLUSKEYWORDS] = keywords;
    }
}


function onLocalNotification(id, state, json) {
    assert(false); //no longer used with new local notifications plugin 0.8x
    var url = "";
    var action = "unknown";
    if (json) {
        var parsed = JSON.parse(json);
        url = parsed.url;
        action = parsed.action;
    }
    //ALERT review zig: to work on a slow emulator (or very slow phone) this needs to be higher. it isnt so because it would cause plus to relaunch
    //if user presses a notification and quickly exits the app.
    var delay = 500; 

    url = "plusfortrello://" + url;
    //include the id, its needed so later detect the duplicates send below
    //fromNotification serves also as a dummy parameter, so we can later know that idNotification is preceded by "&" and not "?"
    url = url + (url.indexOf("?") < 0 ? "?" : "&") + "fromNotification=true&idNotification=" + id + "&notificationAction=" + action;
    //https://github.com/katzer/cordova-plugin-local-notifications/issues/410

    var bAlreadyHandled = false;
    function isAlreadyHandled() {
        if (bAlreadyHandled)
            return true;

        var msNow = new Date().getTime();
        var key = "rnid:" + id;
        var mapCur = g_mapLastActivityInfo[key];
        if (mapCur && msNow - mapCur.ms < g_msMaxHandleOpenUrl) {
            //alertMobile("handled already!",800);
            bAlreadyHandled = true;
        }
        bAlreadyHandled = false; //redundant
        return bAlreadyHandled;
    }

    var cRetry = 0;

    function worker() {
        setTimeout(function () {
            if (cRetry<4 && (cRetry == 0 || !isAlreadyHandled())) {
                openUrlAsActivity(url+(cRetry==0?"":"&retryActivity="+cRetry));
                cRetry++;
                worker();
            }
        }, delay);
    }

    worker();
}


function handleBoardOrCardActivity(text) {
    function getId(strFind) {
        var i = text.indexOf(strFind);
        var split = null;
        if (i >= 0) {
            text = text.substring(i + strFind.length);
            split = text.split("/");
            if (split.length > 0)
                text = split[0];
            return text;
        }
        return null;
    }
    
    var bHandled = false;
    var idBoardShortLink = getId("trello.com/b/");
    if (idBoardShortLink) {
        bHandled = true;
        setTimeout(function () {
            var idBoardFull = g_mapShortLinks.getBoardId(idBoardShortLink);
            if (idBoardFull) {
                handleBoardClick(idBoardFull, "");
            }
            else {
                callTrelloApi("boards/" + idBoardShortLink + "?fields=name", false, 0, callbackTrelloApi,undefined, undefined, undefined, undefined, true);

                function callbackTrelloApi(response, responseCached) {
                    handleBoardClick(response.obj.id, response.obj.name);
                }
            }
        }, 400);
    }
    else {
        var idCardShortLink = getId("trello.com/c/");
        if (idCardShortLink) {
            bHandled = true;
            setTimeout(function () {
                var idCardFull = g_mapShortLinks.getCardId(idCardShortLink);
                if (idCardFull) {
                    handleCardClick(idCardFull, "", "", "", idCardShortLink);
                }
                else {
                    callTrelloApi("cards/" + idCardShortLink + "?fields=name,shortLink", false, 0, callbackTrelloApi, undefined, undefined, undefined, undefined, true);

                    function callbackTrelloApi(response, responseCached) {
                        handleCardClick(response.obj.id, response.obj.name, "", "", response.obj.shortLink);
                    }
                }
            }, 400);
        }
    }

    if (!bHandled)
        alertMobile("No card or board url received.");
}

var g_bHideHome = false; //hack to hide home while navigating directly to a card

var app = {
    // Application Constructor
    initialize: function () {
        this.bindEvents();
    },
    // Bind Event Listeners
    //
    // Bind any events that are required on startup. Common events are:
    // 'load', 'deviceready', 'offline', and 'online'.
    bindEvents: function () {
        g_loaderDetector.initLoader(); 
        if (isCordova())
            document.addEventListener('deviceready', this.onDeviceReady, false);
        else {
            var thisApp = this;
            window.addEventListener('load', function load(event) {
                window.removeEventListener("load", load, false); //remove listener, no longer needed
                //must wait for load to initialize the page, otherwise jqm gets sometimes confused, specially when navigating directly to a card,
                //as the redirection to card.html was sometimes re-navigating back to home.
                thisApp.onDeviceReady();
                //we want to initialize the worker after the page is fully initialized, otherwise the first time it will fight for resources as it caches.
                //we further use setTimeout, thou Im not sure if that really makes any difference.
                setTimeout(registerWorker,300);
            }, false);
        }
            
    },
    // deviceready Event Handler
    //
    // The scope of 'this' is the event. In order to call the 'receivedEvent'
    // function, we must explicitly call 'app.receivedEvent(...);'
    onDeviceReady: function () {
        if (isCordova()) {
            g_bLocalNotifications = (typeof (cordova) != "undefined" && cordova.plugins && cordova.plugins.notification);
            if (g_bLocalNotifications) {
                //review no longer using onLocalNotification
                cordova.plugins.notification.local.on("click", function (notification) {
                    if (notification.data) {
                        var data = JSON.parse(notification.data);
                        changePage(data.url, "slidedown");
                    }
                });
            }


            window.plugins.webintent.getExtra(window.plugins.webintent.EXTRA_TEXT, function (text) {
                if (text)
                    handleBoardOrCardActivity(text);
            }, function() {
                // There was no extra supplied.
            });

            window.plugins.webintent.onNewIntent(function (text) {
                if (text)
                    handleBoardOrCardActivity(text);
            });

        }
        g_bAllowNegativeRemaining = (localStorage[PROP_ALLOWNEGATIVER] || "") == "true";
        g_bDisplayPointUnits = (localStorage[PROP_UNITSASPOINTS] || "") == "true";
        g_analytics.init();
        g_recentBoards.init();
        g_recentUsers.init();
        g_pinnedCards.init();
        var header = $("[data-role='header']");
        header.toolbar();
        header.addClass("animateTransitions");
        setDefaultKeywords();
        var pageLogin = $("#pageLogin");

        function onBeforePageChange(page, urlNew, bBack) {
            var idPage = page.attr("id");
            //console.log("onBeforePageChange " + idPage);
            g_cPageNavigations++;
            g_stateContext.idPage = idPage;
            setPageTitle(idPage);
            var params = "";
            if (urlNew) {
                var iFind = urlNew.indexOf("?");
                if (iFind >= 0)
                    params = urlNew.substr(iFind);
            }
            if (typeof (g_fnCancelSEBar) != "undefined" && g_fnCancelSEBar) {
                var fnCall = g_fnCancelSEBar;
                g_fnCancelSEBar = null;
                fnCall();
			}
            defaultPageInit(idPage, page, params, bBack, urlNew);
        }

        var pageYOffsetLast = 0;
        var bRemovedLast = true;

        function onScrollAction() {
            if (window.pageYOffset < pageYOffsetLast) {
                if (!bRemovedLast)
                    header.removeClass("plusShiftTop");
                bRemovedLast = true;
            }
            else {
                if (bRemovedLast && window.pageYOffset > 20) {
                    header.addClass("plusShiftTop");
                    bRemovedLast = false;
                }
            }

            pageYOffsetLast = window.pageYOffset;
        }

        function onAfterPageChange(page) {
            $(window).off("scroll.plusForTrello");
            $(window).on("scroll.plusForTrello", function () {
                if (typeof (requestAnimationFrame) == "undefined")
                    onScrollAction();
                else
                    requestAnimationFrame(onScrollAction);
            });
            g_analytics.hit({ t: "pageview", dp: page.attr("id") }, 1000);
        }

        header.show();
        var idCardNavigate = localStorage[PROP_NAVIDCARDLONG];
        
        pageLogin.show();
        $(document).on("pagecontainerbeforetransition", function (event, ui) {
            header.removeClass("animateTransitions").removeClass("plusShiftTop");
            onBeforePageChange(ui.toPage, ui.absUrl, ui.options.direction=="back");
        });

        $(document).on("pagecontainerchange", function (event, ui) {
            onAfterPageChange(ui.toPage);
            header.addClass("animateTransitions");
        });

        UNITS.current = (localStorage[PROP_PLUSUNITS] || UNITS.current);
        UNITS.SetCallbackOnSet(function (unit) {
            localStorage[PROP_PLUSUNITS] = unit;
        });

        $("#settings").click(function () {
            changePage("settings.html", "none");
        });

        $(".userTrello").click(function () {
            if ($("#settings").is(":visible"))
                changePage("settings.html", "none");
        });

        initUser(function (user) {
            if (user) {
                if (idCardNavigate) {
                    //came from redirector
                    g_bHideHome = true; //temporarily hide it
                    g_bShownPopupLink = true; //so we wont show it on this index.html
                    delete localStorage[PROP_NAVIDCARDLONG];
                    setTimeout(function () {
                        changePage("card.html?id=" + encodeURIComponent(idCardNavigate), "none", null);
                    }, 50);
                }
            }
            onBeforePageChange(pageLogin);
            onAfterPageChange(pageLogin);
        });
    },

    receivedEvent: function (id) {
        //console.log('Received Event: ' + id);
    }
};

function exitApp() {
    if (typeof (navigator) != "undefined" && navigator.app && navigator.app.exitApp)
        navigator.app.exitApp();
    else {
        try {
            window.opener = window;
        } catch (e) {

        }
        window.close();
    }
}

function getUserGlobal() {
    return (localStorage[PROP_GLOBALUSER] || DEFAULTGLOBAL_USER);
}

function setupSettingsPage() {
    function buildKeywordString(rg) {
        var strKeywords = "";
        rg.forEach(function (k) {
            if (strKeywords.length == 0)
                strKeywords = k;
            else
                strKeywords = strKeywords + ", " + k;
        });
        return strKeywords;
    }

    if (g_user)
        $("#loginInfo").text("Logged-in as " + g_user.fullName + " (" + g_user.username + ")");
    else
        $("#loginInfo").text("Not logged-in");

    var deviceVersion = "web version";
    if (typeof(device)!="undefined" && device.version)
        deviceVersion = device.version;
    var infoVersions = "Device version: " + deviceVersion;
    if (isCordova()) {
        cordova.getAppVersion(function (version) {
            infoVersions = infoVersions + "<br> Plus Beta version: " + version;
            $("#plusVersionInfo").html(infoVersions);
        });
    }
    else {
        $("#plusVersionInfo").html(infoVersions);
    }
    var notesHelp = "";
    $("#plusHelpNotes").html(notesHelp);
    
    $("#allowNegativeR").attr("checked", g_bAllowNegativeRemaining).checkboxradio("refresh");
    $("#unitsAsPoints").attr("checked", g_bDisplayPointUnits).checkboxradio("refresh");
    var selectUnits = $("#selectUnits");
    selectUnits.val(UNITS.current);
    selectUnits.selectmenu("refresh");
    selectUnits.off("change.plusForTrello");
    selectUnits.on("change.plusForTrello", function () {
        var combo = $(this);
        var val = combo.val();
        if (!val)
            return;
        UNITS.SetUnits(val);
    });

    if (localStorage[PROP_TRELLOKEY])
        $("#logout").show();
    else
        $("#logout").hide();

    $("#logout").off("click").click(function () {
        var message = "Plus will also remove offline Trello data. Are you sure?";
        function worker() {
            logoutTrello();
        }

        
        if (typeof (navigator) != "undefined" && navigator.notification) {
            navigator.notification.confirm(
                message,
                function onPrompt(buttonIndex) {
                    if (buttonIndex != 1)
                        return;
                    worker();
                },                  // callback to invoke
                'Confirm',            // title
                ['Yes, logout and exit', 'Cancel']);            // buttonLabels
        }
        else {
            if (confirm(message)) {
                worker();
            }
        }
    });
        

    $("#exitApp").off("click").click(function () {
        exitApp();
    });

    function onGlobalUserClick(userGlobalDefault) {
        var userOld = userGlobalDefault || localStorage[PROP_GLOBALUSER] || DEFAULTGLOBAL_USER;
        var title = "Enter the name of the 'global' user";
        var userNew = prompt(title, userOld);
        userNew = (userNew || "").toLowerCase().trim();
        if (userNew && /\s|@|,/.test(userNew)) {
            alert("The global user cannot contain spaces, commas or @.");
            setTimeout(onGlobalUserClick.bind(null,userNew), 100);
            return;
        }
        saveUser(userNew);

        function saveUser(userNew) {
            if (!userNew)
                userNew = DEFAULTGLOBAL_USER;

            localStorage[PROP_GLOBALUSER] = userNew;
        }
    }

    $("#allowNegativeR").off("click").click(function () {
        g_bAllowNegativeRemaining = $("#allowNegativeR").is(':checked');
        localStorage[PROP_ALLOWNEGATIVER] = g_bAllowNegativeRemaining?"true":"false";
    });

    $("#unitsAsPoints").off("click").click(function () {
        g_bDisplayPointUnits = $("#unitsAsPoints").is(':checked');
        localStorage[PROP_UNITSASPOINTS] = g_bDisplayPointUnits ? "true" : "false";
    });

    $("#globaluser").off("click").click(function () {
        onGlobalUserClick();
    });

    $("#keywords").off("click").click(function () {
        var keywords = localStorage[PROP_PLUSKEYWORDS];
        var title = "Enter your Plus S/E keywords separated by comma";
        var keywordsNew = prompt(title, keywords);
        saveKeywords(keywordsNew);

        function saveKeywords(keywordsNew) {
            if (!keywordsNew)
                return;
            var rg = keywordsNew.split(",");
            var rgNew = [];
            rg.forEach(function (k) {
                k = k.trim().toLowerCase();
                if (k)
                    rgNew.push(k); //skip blanks etc
            });
            if (rgNew.length) {
                localStorage[PROP_PLUSKEYWORDS] = buildKeywordString(rgNew);
            } else {
                alertMobile("Error in keywords format. Not saved.");
            }
        }
    });
}


function getUrlParams(url) {
    // http://stackoverflow.com/a/23946023/2407309
    url = url.split('#')[0]; // Discard fragment identifier.
    var urlParams = {};
    var queryString = url.split('?')[1];
    if (!queryString) {
        if (url.search('=') !== false) {
            queryString = url;
        }
    }
    if (queryString) {
        var keyValuePairs = queryString.split('&');
        for (var i = 0; i < keyValuePairs.length; i++) {
            var keyValuePair = keyValuePairs[i].split('=');
            var paramName = keyValuePair[0];
            var paramValue = keyValuePair[1] || '';
            urlParams[paramName] = decodeURIComponent(paramValue.replace(/\+/g, ' '));
        }
    }
    return urlParams;
}


function refreshCurrentPage() {
    defaultPageInit();
}


var g_lastPageInfo = {
    idPage: null,
    page: null,
    params: null,
    bBack: false,
    urlNew: null
};


/* defaultPageInit
 *
 * initialize the page.
 **/
function defaultPageInit(idPage, page, params, bBack, urlNew) {
    if (!idPage) {
        //repeat last init (for refresh)
        idPage = g_lastPageInfo.idPage;
        if (idPage == null)
            return; //ignore init without a page yet
        page = g_lastPageInfo.page;
        params = g_lastPageInfo.params;
        bBack = g_lastPageInfo.bBack;
        urlNew = g_lastPageInfo.urlNew;
    } else {
        g_lastPageInfo.idPage = idPage;
        g_lastPageInfo.page = page;
        g_lastPageInfo.params = params;
        g_lastPageInfo.bBack = bBack;
        g_lastPageInfo.urlNew=urlNew;
    }

    if (params)
        params = getUrlParams(params);


    if (!g_user || idPage == "pageSettings" || idPage == "pageHelp")
        $("#settings").hide();
    else
        $("#settings").show();

    //console.log("loading " + idPage);
    if (idPage == "pageHelp")
        loadHelpPage();
    else if (idPage == "pageLogin")
        loadHomePage();
    else if (idPage == "pageSettings")
        setupSettingsPage();
    else if (idPage == "pageListBoards")
        loadBoardsPage(page, bBack);
    else if (idPage == "pageCardDetail")
        loadCardPage(page, params, bBack, urlNew);
}

function openNoLocation(url) {
    return window.open(url, '_blank', isCordova()? 'location=no': undefined);
}

function loadHelpPage() {
    $("#openPlusChromeStore").off("click").click(function () {
        var appInBrowser = openNoLocation("https://chrome.google.com/webstore/detail/plus-for-trello-time-trac/gjjpophepkbhejnglcmkdnncmaanojkf");
    });

    $("#plusSurvey").off("click").click(function () {
        var appInBrowserSurvey = openNoLocation("https://docs.google.com/forms/d/1pIChF9MsRirj7OnF7VYHpK0wbGu9wNpUEJEmLQfeIQc/viewform?usp=send_form");
    });

    $("#plusLicences").off("click").click(function () {
        var appInBrowserSurvey = openNoLocation("http://www.plusfortrello.com/p/licences.html");
    });

    var cHelpClicked = 0;
    $("#helpMoreInfo").off("click").click(function () {
        var appInBrowserSurvey = openNoLocation("http://www.plusfortrello.com/p/mobile-plus-for-trello.html");
        cHelpClicked++;
        if (cHelpClicked == 8) {
            if (!confirm("Are you sure you want to turn " + (g_analytics.bDisableAnalytics ? "ON" : "OFF") + " Google Analytics?"))
                return;
            g_analytics.setDisabled(!g_analytics.bDisableAnalytics);
        }
    });

    $("#clearCache").off("click").click(function () {
        if (!confirm("All stored information including recent boards will be cleared from this device. Are your sure?"))
            return;
        clearAllStorage(true, refreshCurrentPage);
    });

    $("#imgDonate").off("click").click(function () {
        var urlDonate = "https://www.paypal.com/cgi-bin/webscr?cmd=_donations&business=FH223PYNLWZQU&lc=US&item_name=Plus%20for%20Trello%20mobile&currency_code=USD&bn=PP%2dDonationsBF%3abtn_donate_SM%2egif%3aNonHosted";
        openUrlAsActivity(urlDonate);
    });

    //use separate window because otherwise it messes up the app header when going back from external page
    //also, an external window loads inmediately after click, then loads content, while jqm loads content first giving lag impression
    $("#helpPlusCommentFormat").off("click").click(function () {
        var appInBrowserSurvey = openNoLocation("http://www.plusfortrello.com/p/spent-estimate-card-comment-format.html");
    });

    //note: should use unescape(encodeURIComponent( but cant because of the compression library generating invalid uris. not worth setting uri compression mode.
    var sizeStorage = JSON.stringify(localStorage).length * 2; //*2 as each char is utf16 = 2 bytes
    var txt = Math.round((sizeStorage * 100) / 1024 / 1024) / 100;
    if (txt == 0)
        txt = Math.round(sizeStorage / 1024) + " KB";
    else
        txt = txt + " MB";
    $("#storageUsed").text(txt);
}

function setPageTitle(idPage) {
    $(".plusHeader h1").html(IMAGE_HEADER_TEMPLATE + g_titlesPage[idPage]);
}

function populateUser(user) {
    var userElems = $(".userTrello");
    userElems.empty();
    g_user = user;
    if (!user)
        return;
    if (user.avatarHash) {
        var image = $("<img>").attr("src", "https://trello-avatars.s3.amazonaws.com/" + user.avatarHash + "/30.png");
        userElems.append(image);
    }
}

function initUser(callback) {

    function fill(user) {
        populateUser(user);
        callback(user);
    }
    if (localStorage[PROP_TRELLOKEY]) {
        var user = localStorage[PROP_TRELLOUSERDATA];
        if (user) {
            user = JSON.parse(user);
            fill(user);
        } else {
            callTrelloApi("members/me?fields=avatarHash,fullName,id,username,url", false, 0, function (response) {
                user = response.obj;
                localStorage[PROP_TRELLOUSERDATA] = JSON.stringify(user);
                fill(user);
            }, undefined, undefined, true);
        }
    } else {
        fill(null);
    }
}

function isDesktopVersion() {
    return !(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i.test(navigator.userAgent));
}

var g_bShownPopupLink = false;

function loadHomePage() {
    var bHasKeyTrello = (!!localStorage[PROP_TRELLOKEY]);

    if (g_bHideHome) {
        g_bHideHome = false;
        if (bHasKeyTrello)
            return;
    }

    $("#viewBoards").off("click").click(function () {
        changePage("#pageListBoards", "slide");
    });

    var listBoardsRecent = $("#listBoardsRecent").listview();
    var listCardsPinned = $("#listCardsPinned").listview();

    $("#login").off("click").click(function () {
        loginToTrello();
    });

    var bAsStandaloneApp = (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (!bAsStandaloneApp && window.navigator && window.navigator.standalone)
        bAsStandaloneApp = true;
    
    var elemLinkPopup = $("#openAsDesktopPopup");
    if (!g_bShownPopupLink && !bAsStandaloneApp && isDesktopVersion() && (!document.referrer || document.referrer.indexOf(document.domain || "") < 0)) {
        g_bShownPopupLink = true;
        elemLinkPopup.show();
        elemLinkPopup.off("click").click(function () {
            var height = Math.floor(elemLinkPopup.height() * 37);
            var width = Math.floor(elemLinkPopup.height() * 25);
            var originCur = location.origin;
            if (!originCur || originCur.indexOf("file://") == 0)
                originCur = location.href; //file: case. not perfect but at least something
            else
                originCur += "/index.html";
            window.open(originCur, "Plus for Trello", "scrollbars=no,menubar=no,personalbar=no,minimizable=yes,resizable=yes,location=no,toolbar=no,status=no,innerHeight=" + height + ",innerWidth=" + width);
        });
    }
    else
        elemLinkPopup.hide();

    if (bHasKeyTrello) {
        $("#login").hide();

        $("#viewBoardsContainer").show();
        
        if (g_recentBoards.boards.length > 0) {
            $('#listBoardsRecent li:not(:first)').remove();

            g_recentBoards.boards.sort(function (a, b) {
                return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            });
            addBoardsToList(listBoardsRecent, g_recentBoards.boards);
            listBoardsRecent.listview("refresh");
            listBoardsRecent.show();
        }
        else
            listBoardsRecent.hide();


        if (g_pinnedCards.cards.length > 0) {
            $('#listCardsPinned li:not(:first)').remove();

            g_pinnedCards.cards.sort(function (a, b) {
                return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            });
            addCardsToPinnedList(listCardsPinned, g_pinnedCards.cards);
            listCardsPinned.listview("refresh");
            listCardsPinned.show();
        }
        else
            listCardsPinned.hide();

    } else {
        $("#login").show();
        $("#viewBoardsContainer").hide();
        $("#listBoardsRecent").hide();
        $("#listCardsPinned").hide();
    }
}


function clearAllStorage(bKeepLoginInfo,callback) {
    var keywords = localStorage[PROP_PLUSKEYWORDS];
    var key = localStorage[PROP_TRELLOKEY];
    var idAnalytics = localStorage[g_analytics.PROP_IDANALYTICS];
    var bDisableAnalytics = g_analytics.bDisableAnalytics;
    g_recentBoards.reset();
    g_recentUsers.reset();
    g_pinnedCards.reset();
    localStorage.clear();

    if (bKeepLoginInfo)
        localStorage[PROP_TRELLOKEY] = key;
    //always preserve these
    if (keywords)
        localStorage[PROP_PLUSKEYWORDS] = keywords;

    if (idAnalytics)
        localStorage[g_analytics.PROP_IDANALYTICS] = idAnalytics;

    if (bDisableAnalytics)
        g_analytics.setDisabled(true);

    initUser(callback);
}

function logoutTrello() {
    clearAllStorage(false, exitApp);
}

function loadBoardsPage(page, bBack) {
    if (bBack) //optimize. since its on main index page, it works
        return;
    var list = $("#boardsList").listview();
    list.empty();
    callTrelloApi("members/me/boards?fields=id,name,closed", true, 3000, function (response) {
        list.empty();
        var rgBoards = [];
        var objReturn = {};
        if (response.objTransformed) {
            rgBoards = response.objTransformed.rgBoards;
        }
        else {
            var mapBoards = {};
            response.obj.forEach(function (elem) {
                if (elem.closed)
                    return;
                rgBoards.push({ id: elem.id, name: elem.name });
                mapBoards[elem.id] = true;
            });
            g_recentBoards.updateAll(mapBoards);
            rgBoards.sort(function (a, b) {
                return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            });
            objReturn.rgBoards = rgBoards;
        }

        addBoardsToList(list, rgBoards);
        list.listview("refresh");
        return objReturn;
    });
}

function addBoardsToList(list, rgBoards) {
    rgBoards.forEach(function (elem) {
        var item = $("<li><a href='#'>" + elem.name + "</a></li>");
        item.click(function () {
            handleBoardClick(elem.id, elem.name);
        });
        list.append(item);
        if (elem.shortLink)
            g_mapShortLinks.setBoardId(elem.shortLink, elem.id);
    });
}


function addCardsToPinnedList(list, rgCards) {
    rgCards.forEach(function (elem) {
        var item = $("<li><a href='#' class='pinnedCardElement'>" + elem.name + "<p class='pinnedCardSubtext'>" + elem.nameBoard + "<span style='color:#BDBDBD;'> in </span>" + elem.nameList + "</p></a>" + "</li>");
        item.click(function () {
            handleCardClick(elem.id, elem.name, elem.nameList, elem.nameBoard, elem.shortLink);
        });
        list.append(item);
    });
}

function handleBoardClick(idBoard, name) {
    var list = $("#listsList");
    list.empty();
    list.listview();
    //
    //REVIEW zig: note about boards navigation: This also applies to most page navigations (except the card details page).
    //jqm is not very good as storing parameters in the url. Ive had to workarround many bugs where it doesnt handle well some characters even when encoded properly.
    //see jqm 1.4.5 bug https://github.com/jquery/jquery-mobile/issues/1383
    //either we need a new framework for navigation, or we upgrade to a better jqm and handle navigation properly by putting all parameters in the url.
    //currently we only handle the cards details page by special-handling a mapping of id to parameters.
    //the issue can be easily reproduced by using the official trello app to "send board link" to plus, then navigate forward, then send another board and go back.
    //the result is that the previous pages will not reset their content and just show the last loaded board/list.
    //
    $(".titleListLists").text(name);
    //idBoard is a "long id". we do not pass a shortLink because other code depends on using the id to map things (like api result caches)
    g_stateContext.idBoard = idBoard;
    
    changePage("index.html#pageListLists", "slide", function () {
        callTrelloApi("boards/" + idBoard + "?lists=all&list_fields=id,name,pos,closed&fields=name,shortLink", true, 3000, function (response) {
            list.empty();
            idBoard = response.obj.id; //refresh in case a shortLink was passed
            g_mapShortLinks.setBoardId(response.obj.shortLink, idBoard); //useful for offline + opening plus from trello board link
            name = response.obj.name;
            g_recentBoards.markRecent(name, idBoard);
            $(".titleListLists").text(name);
            response.obj.lists.forEach(function (elem) {
                if (elem.closed)
                    return;
                var item = $("<li><a href='#'>" + elem.name + "</a></li>");
                item.click(function () {
                    handleListClick(elem.id, name, elem.name);
                });
                list.append(item);
            });
            list.listview("refresh");
        });
    });
}

function handleListClick(idList, nameBoard, nameList) {
    changePage("index.html#pageListCards", "slide", function () {
        var list = $("#cardsList");
        var titleHeader = nameList;

        $(".titleListCards").text(nameBoard);
        list.empty();
        list.listview();
        list.append($("<li data-role='list-divider'>" + titleHeader + "</li>"));
        list.listview("refresh");
        g_stateContext.idList = idList;
        callTrelloApi("lists/" + idList + "?cards=open&card_fields=name,shortLink,closed", true, 3000, function (response) {
            $('#cardsList li:not(:first)').remove();
            var rgCards = [];
            var objReturn = {};
            var elemTitle = $('#cardsList li:first');
            if (response.objTransformed) {
                rgCards = response.objTransformed.rgCards;
                elemTitle.text(response.objTransformed.name);
            } else {
                elemTitle.text(response.obj.name); //reset first element in case a previous pending ajax changed it
                response.obj.cards.forEach(function (elem) {
                    if (elem.closed)
                        return;
                    rgCards.push({ name: elem.name, id: elem.id, shortLink: elem.shortLink });
                });
                objReturn.rgCards = rgCards;
                objReturn.name = response.obj.name;
            }

            rgCards.forEach(function (elem) {
                var item = $("<li><a href='#'>" + elem.name + "</a></li>");
                item.click(function () {
                    handleCardClick(elem.id, elem.name, nameList, nameBoard, elem.shortLink);
                });
                list.append(item);
                //note we do not remember the mapping because entering an unvisited card offline would just show all empty.
                //instead, the card mapping is saved only when the card has been visited before
                //g_mapShortLinks.setCardId(elem.shortLink, elem.id); 

            });
            list.listview("refresh");
            return objReturn;
        });
    });
}

function handleCardClick(id, name, nameList, nameBoard, shortLink) {
    assert(id); //note that the other fields could be blank on some offline scenarios
    var cardCached = g_cardsById[id];
    if (name && (!cardCached || (nameList && nameBoard && shortLink))) {
        //see jqm issue on why we dont store params in the url (other than id) https://github.com/jquery/jquery-mobile/issues/1383
        cardCached = {
            name: name,
            nameList: nameList,
            nameBoard: nameBoard,
            shortLink: shortLink
        };
        g_cardsById[id] = cardCached;
    }
    changePage("card.html?id=" + encodeURIComponent(id), "slidedown");
}

function setTrelloToken(token) {
    delete localStorage[PROP_TRELLOUSERDATA];
    if (!token)
        delete localStorage[PROP_TRELLOKEY];
    else
        localStorage[PROP_TRELLOKEY] = token;
    initUser(refreshCurrentPage);
}

function getAppKey() {
    return TRELLO_APPKEY + "xxxxxxx" + "yyyyyyy";
}

function authorizeFromWeb() { //thanks http://madebymunsters.com/blog/posts/authorizing-trello-with-angular/ for converting the trello coffescript
    var key = getAppKey();
    var authWindow, authUrl, token, trello, height, left, origin, receiveMessage, ref1, top, width;
    width = 450;
    height = 520;
    left = window.screenX + (window.innerWidth - width) / 2;
    top = window.screenY + (window.innerHeight - height) / 2;
    origin = (ref1 = /^[a-z]+:\/\/[^\/]*/.exec(location)) != null ? ref1[0] : void 0;
    //call_back=postMessage is necessary to enable cross-origin communication
    authUrl = 'https://trello.com/1/authorize?return_url=' + origin + '&callback_method=postMessage&expiration=never&name=Plus+for+Trello+mobile&scope=read,write&key=' + key;
    var bSafariStandalone = (window.navigator && window.navigator.standalone);
    authWindow = window.open(authUrl, bSafariStandalone ? '_system' : 'trello', 'width=' + width + ',height=' + height + ',left=' + left + ',top=' + top);
    var receiveMessage = function (event) {
        var ref2;
        if ((ref2 = event.source) != null) {
            ref2.close();
        }
        if ((event.data != null) && /[0-9a-f]{64}/.test(event.data)) {
            
            token= event.data;
        } else {
            token = null;
        }
        if (typeof window.removeEventListener === 'function') {
            //remove event listener
            window.removeEventListener('message', receiveMessage, false);
        }
        setTrelloToken(token);
    };
    return typeof window.addEventListener === 'function' ? window.addEventListener('message', receiveMessage, false) : void 0;
}

function loginToTrello() {
    if (isCordova()) {
        var appInBrowser = window.open("https://trello.com/1/authorize?return_url=https%3A%2F%2Flocalhost&key=" + getAppKey() + "&name=Plus+for+Trello+mobile&expiration=never&response_type=token&scope=read,write", '_blank', 'location=yes');
        var bSkipError = false;

        function onErrorEvent(event) {
            if (!bSkipError)
                alertMobile("Cannot login. Please check your connection.");
        }

        function onEvent(event) {
            var prefixToken = "#token=";
            var i = event.url.indexOf(prefixToken);
            if (i >= 0) {
                bSkipError = true;
                var token = event.url.substr(i + prefixToken.length);
                appInBrowser.close();
                setTrelloToken(token);
            }
        }
        appInBrowser.addEventListener('loadstart', onEvent);
        appInBrowser.addEventListener('loaderror', onErrorEvent);

    } else {
        authorizeFromWeb();
    }
}


app.initialize();