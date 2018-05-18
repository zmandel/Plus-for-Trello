﻿/// <reference path="intellisense.js" />

var UPDATE_STEP = 1300;
var ESTIMATION = 'estimation';
var SPENT = 'spent';
var REMAINING = 'remaining';

var g_bheader = {
    //review: move g_spentTotal etc here
    comboSEView: null,
    hide: function () {
        if (this.comboSEView)
            this.comboSEView.hide();
    }
};

var g_spentTotal = null;
var g_estimationTotal = null;
var g_remainingTotal = null;

var g_boardName = null;
var g_bUpdatingGlobalSums = null;  //null means uninitialized. tracks if we are waiting for all trello cards to load
var g_manifestVersion = "";
var g_rgExcludedUsers = []; //users exluded from the S/E bar
var g_bDontShowSpentPopups = false;
var g_serViews = { board: { s: true, e: true, r: true }, list: { s: true, e: true, r: false }, card: { s: true, e: true, r: false } };
var g_verStore = ""; //only set when chrome calls us with an available update. might be outdated after update

function showModlessDialog(elem) {
    if (!elem.show) {
        dialogPolyfill.registerDialog(elem);
    }
    elem.show();
}

function showModalDialog(elem) {
    if (!elem.show) {
        dialogPolyfill.registerDialog(elem);
    }
    elem.showModal();
}



function getSpentSpecialUser() { //review zig: unused
    //review zig: wrap g_configData futher as it can be null
    if (g_configData)
        return g_configData.spentSpecialUser;
    return "";
}

//insertCardTimer
//
function insertCardTimer(containerBar) {

    tryInsert();

    function tryInsert() {
        if (!inserted())
            setTimeout(tryInsert, 200);
    }

    function inserted() {
        if (!g_bReadGlobalConfig)
            return false;

        var url = document.URL;
        var idCardCur = getIdCardFromUrl(url);

        if (!idCardCur)
            return true;

        var sidebars = $(".window-sidebar");
        if (sidebars.length == 0)
            return false;

        var actions = sidebars.find($(".other-actions h3")).first();
        if (actions.length == 0)
            return false;
        var divInsert = actions.next();
        if (divInsert.find($("#agile_timer")).size() != 0)
            return true;

        divInsert.prepend(loadCardTimer(idCardCur, containerBar));
        return true;
    }
}


var g_bErrorExtension = false;

function showExtensionUpgradedError(e) {
    if (g_bErrorExtension)
        return;
    g_bErrorExtension = true;
    var message = "";
    //note: newer chrome no longer detects the "connecting to extension" error and instead throws a general "Cannot read property 'name' from Undefined" error.
    if (e && e.message && !bIgnoreError(e.message))
        message = e.message;

    var divDialog = $("#agile_dialog_ExtensionUpgraded");

    if (divDialog.length == 0) {
        //focus on h2 so it doesnt go to the first link
        divDialog = $('\
<dialog id="agile_dialog_ExtensionUpgraded" class="agile_dialog_DefaultStyle agile_dialog_Postit agile_dialog_Postit_Anim">\
<h3 tabindex="1" style="outline: none;">Chrome updated Plus for Trello</h3><br> \
<p>Reload this page to use Plus. <A href="http://www.plusfortrello.com/p/change-log.html" target="_blank">Whats new?</A></p> \
<p id="agile_dialog_ExtensionUpgraded_message"></p> \
<a href="" class="button-link agile_dialog_Postit_button" id="agile_dialog_ExtensionUpgraded_Refresh">Reload</a> \
<a title="Ignore to keep working on this page.\nSome Plus features may not work until you Reload." href="" class="button-link agile_dialog_Postit_button" id="agile_dialog_ExtensionUpgraded_Ignore">Ignore</a> \
</dialog>');
        $("body").append(divDialog);
        divDialog = $("#agile_dialog_ExtensionUpgraded");

        var imgReload = $("<img>").attr("src", chrome.extension.getURL("images/reloadchrome.png")).addClass('agile_reload_ext_button_img');
        var reload = divDialog.find("#agile_dialog_ExtensionUpgraded_Refresh");
        reload.append($("<span>").append(imgReload));
        reload.off("click.plusForTrello").on("click.plusForTrello", function (e) {
            e.preventDefault();
            setTimeout(function () { //timeout so the button reacts to the click uxwise
                location.reload(); //note not passing false per http://stackoverflow.com/questions/16873263/load-from-cache-with-window-location-reload-and-hash-fragment-in-chrome-doesnt
            }, 10);
        });

        divDialog.find("#agile_dialog_ExtensionUpgraded_Ignore").off("click.plusForTrello").on("click.plusForTrello", function (e) {
            e.preventDefault(); //link click would navigate otherwise
            divDialog.removeClass("agile_dialog_Postit_Anim_ShiftToShow");
            setTimeout(function () { divDialog[0].close(); }, 300+10); //wait for animation to complete
        });
    }
    $("#agile_dialog_ExtensionUpgraded_message").text(message);
    showModlessDialog(divDialog[0]);
    setTimeout(function () { divDialog.addClass("agile_dialog_Postit_Anim_ShiftToShow"); }, 200); //some dialog conflict prevents animation from working without timeout
}


function showFirstLicDialog(bExpanded, callback) {
    var divDialog = $("#agile_dialog_FirstLic");

    if (divDialog.length == 0) {
        //focus on h2 so it doesnt go to the first link
        divDialog = $('\
<dialog id="agile_dialog_FirstLic" style="cursor:pointer;text-align: center;width:33em;padding-top:0.5em;" class="agile_dialog_DefaultStyle agile_dialog_Postit agile_dialog_Postit_Anim_Lic">\
<div id="agile_FirstLic_title" tabindex="1" style="outline: none; text-align: center;cursor:pointer;">Please click here to activate your "Plus for Trello Pro" yearly license.</div> \
<div id="agile_FirstLic_content" style="display:none;"><br><b>Your "Plus for Trello Pro" yearly license</b><br>\
<br>\
<p>Pay with the Chrome Web Store. It uses <A href="https://www.google.com/chrome/browser/signin.html"  target="_blank">Chrome sign-in</A>.</p>\
Click "Activate" to show the Chrome store license screen.<br><br>\
<a href="" class="button-link agile_dialog_Postit_button" id="agile_dialog_FirstLic_OK">Activate</a>&nbsp;&nbsp; \
<a href="" class="button-link agile_dialog_Postit_button" style="" id="agile_dialog_FirstLic_Cancel">Later</a><br><br><hr> \
<div style="text-align: left;">\
<p>&bull; The Chrome store is currently failing for some users. <a href="" id="agile_storeerrors_tellmore">More</a>\
<span style="display:none;" id="agile_storeerrors_tellmore_content">If it shows an error: Dont worry, you can keep using "Pro" and will not be charged. Google is currently working on fixing these Chrome Store issues.</span></p>\
<p>&bull; Already paid, reinstalled Plus? Activate to find your license. You will never be double-charged.</p>\
<p>&bull; <a href="" id="agile_stripe_tellmore">More payment options?</a></p>\
<p style="display:none;" id="agile_stripe_tellmore_content">&bull; Soon we will add single & group licenses without needing Chrome sign-in or a Google account. We will use <A href="https://stripe.com/about" target="_blank">stripe.com</A> licenses based on Trello usernames, not Google accounts.\
The current Chrome Web Store payments will still be supported.</p>\
</div><br>\
<span style="font-size:80%;color:#909090;">Note: <A href="http://www.plusfortrello.com" target="_blank" style="color:#909090;">Plus for Trello</A> is not associated with Trello or Atlassian.\
</span>\
<span style="float:right;"><A href="\
https://translate.google.com.pe/?um=1&ie=UTF-8&hl=en&client=tw-ob#en/es/Pay%20with%20the%20%22Chrome%20Web%20Store%22.%20It%20uses%20Chrome%20sign-in.%0A%0AClick%20%22Activate%22%20to%20show%20the%20Chrome%20store%20license%20screen.%0A%0AButtons%3A%20Activate%2C%20Later%0A%0A%E2%80%A2%20The%20Chrome%20store%20is%20currently%20failing%20for%20some%20users.%20If%20it%20shows%20an%20error%3A%20Dont%20worry%2C%20you%20can%20keep%20using%20%22Pro%22%20and%20will%20not%20be%20charged.%20Google%20is%20currently%20working%20on%20fixing%20these%20Chrome%20Store%20issues.%0A%0A%E2%80%A2%20Already%20paid%2C%20reinstalled%20Plus%3F%20Activate%20to%20find%20your%20license.%20You%20will%20never%20be%20double-charged.%0A%0A%E2%80%A2%20More%20payment%20options%3A%20Soon%20we%20will%20add%20single%20%26%20group%20licenses%20without%20needing%20Chrome%20sign-in%20or%20a%20Google%20account.%20We%20will%20use%20stripe.com%20licenses%20based%20on%20Trello%20usernames%2C%20not%20Google%20accounts.The%20current%20Chrome%20Web%20Store%20payments%20will%20still%20be%20supported.%0A%0ANote%3A%20%22Plus%20for%20Trello%22%20is%20not%20associated%20with%20%22Trello%22%20or%20%22Atlassian%22.\
" target="_blank">Translate</A></span>\
<\div>\
</dialog>');
        $("body").append(divDialog);
        divDialog = $("#agile_dialog_FirstLic");
        if (!bExpanded)
            hiliteOnce(divDialog, 3000);
        divDialog.click(function (e) {
            var content = divDialog.find("#agile_FirstLic_content");
            if (content.is(":visible"))
                return;
            divDialog.find("#agile_FirstLic_title").hide();
            content.slideDown(200);
        });

        function doCloseDialog(callbackBefore, callbackAfter) {
            if (callbackBefore)
                callbackBefore();
            divDialog.removeClass("agile_dialog_Postit_Anim_ShiftToShow");
            setTimeout(function () {
                divDialog[0].close();
                if (callbackAfter)
                    callbackAfter();
            }, 300); //wait for animation to complete
        }

        divDialog.find("#agile_storeerrors_tellmore").off("click.plusForTrello").on("click.plusForTrello", function (e) {
            e.preventDefault();
            divDialog.find("#agile_storeerrors_tellmore").hide();
            divDialog.find("#agile_storeerrors_tellmore_content").show();
        });

        divDialog.find("#agile_stripe_tellmore").off("click.plusForTrello").on("click.plusForTrello", function (e) {
            e.preventDefault();
            divDialog.find("#agile_stripe_tellmore").parent().hide();
            divDialog.find("#agile_stripe_tellmore_content").show();
        });
        
        divDialog.find("#agile_dialog_FirstLic_OK").off("click.plusForTrello").on("click.plusForTrello", function (e) {
            e.preventDefault();
            doCloseDialog(function () {
                callback(STATUS_OK);
            });
        });

        divDialog.find("#agile_dialog_FirstLic_Cancel").off("click.plusForTrello").on("click.plusForTrello", function (e) {
            e.preventDefault(); //link click would navigate otherwise
            doCloseDialog(function () {
                callback("cancel");
            });
        });
    }
    if (bExpanded) {
        divDialog.find("#agile_FirstLic_title").hide();
        divDialog.find("#agile_FirstLic_content").show();
    } else {
        divDialog.find("#agile_FirstLic_title").show();
        divDialog.find("#agile_FirstLic_content").hide();
    }
    showModlessDialog(divDialog[0]);
    divDialog.find("#agile_dialog_FirstLic_OK").focus();
    setTimeout(function () { divDialog.addClass("agile_dialog_Postit_Anim_ShiftToShow"); }, 200); //some dialog conflict prevents animation from working without timeout
}

function showTryProDialog(bHilite, callback) {
    var divDialog = $("#agile_dialog_TryPro");

    if (divDialog.length == 0) {
        //focus on h2 so it doesnt go to the first link
        divDialog = $('\
<dialog id="agile_dialog_TryPro" style="cursor:pointer;text-align: center;width:25em;padding-top:0.5em;" class="agile_dialog_DefaultStyle agile_dialog_Postit agile_dialog_Postit_Anim_TryPro">\
<div tabindex="1" style="outline: none; text-align: center;cursor:pointer;">Read about our Plus for Trello "Pro" version.</div> \
</dialog>');
        $("body").append(divDialog);
        divDialog = $("#agile_dialog_TryPro");
        if (bHilite) {
            setTimeout(function () {
                hiliteOnce(divDialog, 3000);
            }, 1000);
        }
        divDialog.click(function (e) {
            doCloseDialog(function () {
                callback();
            });
        });

        function doCloseDialog(callbackAfter) {
            divDialog.removeClass("agile_dialog_Postit_Anim_ShiftToShow");
            setTimeout(function () {
                divDialog[0].close();
                if (callbackAfter)
                    callbackAfter();
            }, 300); //wait for animation to complete
        }

    }

    showModlessDialog(divDialog[0]);
    setTimeout(function () { divDialog.addClass("agile_dialog_Postit_Anim_ShiftToShow"); }, 200); //some dialog conflict prevents animation from working without timeout
}

function showFatalError(message) {
    if (g_bErrorExtension)
        return;
    g_bErrorExtension = true;

    var divDialog = $("#agile_dialog_FatalError");

    if (divDialog.length == 0) {
        divDialog = $('\
<dialog id="agile_dialog_FatalError" class="agile_dialog_DefaultStyle agile_dialog_Postit"> \
<h3>Plus for Trello error</h3>\
<p id="agile_dialog_FatalError_message"></p> \
<A id="agile_dialog_FatalError_ViewLog" href="" target="_blank">View error log</A> \
<a style="float:right;" href="" class="button-link agile_dialog_Postit_button" id="agile_dialog_FatalError_Ignore">Ignore</a> \
</dialog>');
        $("body").append(divDialog);
        divDialog = $("#agile_dialog_FatalError");
        divDialog.find("#agile_dialog_FatalError_ViewLog").prop("href", chrome.extension.getURL("plusmessages.html"));
        divDialog.find("#agile_dialog_FatalError_Ignore").off("click.plusForTrello").on("click.plusForTrello", function (e) {
            e.preventDefault(); //link click would navigate otherwise
            divDialog[0].close();
        });
    }
    $("#agile_dialog_FatalError_message").text(message);
    showModlessDialog(divDialog[0]);
}

function testExtension(callback) {
    if (g_bErrorExtension)
        return;

    try {
        var rgLog = g_plusLogMessages;

        sendExtensionMessage({ method: "testBackgroundPage", logMessages: rgLog },
		function (response) {
		    if (response.status == STATUS_OK) { //status of log write
		        g_plusLogMessages = [];
		    }
		    if (callback)
		        callback();
		}, true); //true to rethrow exceptions
    } catch (e) {
        showExtensionUpgradedError(e);
    }
}

function loadExtensionVersion(callback) {
    if (g_manifestVersion != "")
        return;
    g_manifestVersion = "unknown"; //prevent loading again and handle error case
    sendExtensionMessage({ method: "getManifestVersion"}, function (response) {
        if (response.status!= STATUS_OK)
            return;
        g_manifestVersion = response.version;
        callback();
    });
}

function newerStoreVersion() {
    var bNeedUpgrade = false;
    if (g_verStore && g_verStore != g_manifestVersion) {
        var partsCurrent = g_manifestVersion.split(".");
        var partsStore = g_verStore.split(".");
        if (partsStore.length != partsCurrent.length)
            bNeedUpgrade = true;
        else {
            for (var iPartsVersion = 0; iPartsVersion < partsStore.length; iPartsVersion++) {
                var vCur = parseInt(partsCurrent[iPartsVersion], 10);
                var vStore = parseInt(partsStore[iPartsVersion], 10);
                if (vStore > vCur) {
                    bNeedUpgrade = true;
                    break;
                }
            }
        }
    }
    return bNeedUpgrade;
}

$(function () {
    loadExtensionVersion(function () {
        setTimeout(function () { //in timeout so we can safely reference globals and give a little time for trello load itself since we  "run_at": "document_start"
            var bInIFrame = (window != window.top);
            setTrelloAuth(null, bInIFrame); //do this earliest
            if (bInIFrame) {
                //We are on an iframe. This happens when trello authentication fails (dsc token is expired). background loads trello in an iframe, hitting here.
                return;
            }
            setInterval(setTrelloAuth, 10000);

            //for <dialog>
            var preDialog = '<pre style="display:none;">dialog::backdrop\
        { \
        position: fixed; \
        top: 0; \
        left: 0; \
        right: 0; \
        bottom: 0; \
        background-color: rgba(0, 0, 0, 0.8); \
        }</pre>';
            $("body").append($(preDialog));
            //$(document).tooltip(); //review this breaks when closing a window with ESC, tooltip stays up and its hard to clean up
            //http://tablesorter.com/docs/example-parsers.html
            //http://stackoverflow.com/a/2129479/2213940
            addTableSorterParsers();
            loadOptions(function () {
                entryPoint();
            });
        }, 600); //"run_at": "document_start" is before trello does ajax so breathe and dont compete with trello load
    });
});

var g_dscTrello = null;
function setTrelloAuth(callback, bInFrame) {
    var dscNew = $.cookie("dsc");
    if (dscNew && dscNew != g_dscTrello) {
        g_dscTrello = dscNew;
        sendExtensionMessage({ method: "setTrelloAuthData", dsc: dscNew, bInFrame: bInFrame }, function () {
            if (callback)
                setTimeout(callback,1); //prevent recursing from message callback
        });
    } else if (callback) {
        callback();
    }
}


function entryPoint() {
    g_waiterLi.SetWaiting(true);
    //note: this also does setInterval on the callback which we use to do sanity checks and housekeeping
    setCallbackPostLogMessage(testExtensionAndcommitPendingPlusMessages); //this allows all logs (logPlusError, logException) to be written to the database
    HelpButton.display(); //inside is where the fun begins
    checkEnableMoses();
}

//review zig: merge with loadSharedOptions
function loadOptions(callback) {
    var keyDisplayPointUnits = "bDisplayPointUnits";
    var keyAllowNegativeRemaining = "bIgnoreZeroECards";
    var keyPreventIncreasedE = "bPreventEstMod";
    var keyDontWarnParallelTimers = "bDontWarnParallelTimers";
    var keyAcceptSFT = "bAcceptSFT";
    var keyAcceptPFTLegacy = "bAcceptPFTLegacy";
    var keyAlreadyDonated = "bUserSaysDonated";
    var keyHidePendingCards = "bHidePendingCards";
    var keyAlwaysShowSEBar = "bAlwaysShowSEBar";
    var keyHideLessMore = "bHideLessMore";
    var keyDowStart = "dowStart";
    var keyDowDelta = "dowDelta";
    var keyMsStartPlusUsage = "msStartPlusUsage";
    var keySyncOutsideTrello = "bSyncOutsideTrello";
    var keybChangeCardColor = "bChangeCardColor";
    var keyPropbSumFilteredCardsOnly = "bSumFilteredCardsOnly";
    var keybEnableTrelloSync = "bEnableTrelloSync";
    var keybEnterSEByCardComments = "bEnterSEByCardComments";
    var keyrgKeywordsforSECardComment = "rgKWFCC";
    var keyrgExcludedUsers = "rgExcludedUsers";
    var keyUnits = "units";
    var keyCheckedTrelloSyncEnable = "bCheckedTrelloSyncEnable";
    var keybDisabledSync = "bDisabledSync"; //note this takes precedence over bEnableTrelloSync or g_strServiceUrl 'serviceUrl'
    var keyClosePlusHomeSection = "bClosePlusHomeSection";
    var keybDontShowTimerPopups = "bDontShowTimerPopups";
    var keybDontShowSpentPopups = "bDontShowSpentPopups";
    var keyServiceUrl = 'serviceUrl'; //note we only get but not set. Code later will set it

    function BLastErrorDetected() {
        if (chrome.runtime.lastError) {
            sendDesktopNotification("Plus for Trello cannot load\n" + chrome.runtime.lastError.message, 20000);
            return true;
        }
        return false;
    }

    //get options from sync
    chrome.storage.sync.get([SYNCPROP_SERVIEWS, SYNCPROP_KEYWORDS_HOME, keyDisplayPointUnits, SYNCPROP_GLOBALUSER, SYNCPROP_BOARD_DIMENSION, SYNCPROP_bStealthSEMode, SYNCPROP_language, keyServiceUrl, keybDontShowTimerPopups, keybDontShowSpentPopups, keyClosePlusHomeSection, keyDontWarnParallelTimers, keyUnits,
                             keyrgExcludedUsers, keyrgKeywordsforSECardComment, keyAcceptSFT, keyHideLessMore,
                             keyAcceptPFTLegacy, keybEnterSEByCardComments, SYNCPROP_optAlwaysShowSpentChromeIcon, keyAllowNegativeRemaining,keyPreventIncreasedE, keyAlreadyDonated, keybEnableTrelloSync,
                             keyCheckedTrelloSyncEnable, keyHidePendingCards, keyAlwaysShowSEBar, keyDowStart, keyDowDelta, keyMsStartPlusUsage, keySyncOutsideTrello, keybChangeCardColor,
                             keyPropbSumFilteredCardsOnly, keybDisabledSync],
                             function (objSync) {
                                 if (BLastErrorDetected())
                                     return;
                                 try {
                                     g_rgKeywordsHome = JSON.parse(objSync[SYNCPROP_KEYWORDS_HOME] || "[]");
                                 } catch (e) {
                                     logException(e);
                                 }

                                 g_serViews = (objSync[SYNCPROP_SERVIEWS] || g_serViews);
                                 g_globalUser = objSync[SYNCPROP_GLOBALUSER] || DEFAULTGLOBAL_USER;
                                 g_dimension = objSync[SYNCPROP_BOARD_DIMENSION] || VAL_COMBOVIEWKW_ALL;
                                 g_language = objSync[SYNCPROP_language] || "en";
                                 g_bDontShowTimerPopups = objSync[keybDontShowTimerPopups] || false;
                                 g_bDontShowSpentPopups = objSync[keybDontShowSpentPopups] || false;
                                 g_bShowHomePlusSections = !(objSync[keyClosePlusHomeSection] || false);
                                 UNITS.current = objSync[keyUnits] || UNITS.current;
                                 g_bDontWarnParallelTimers = objSync[keyDontWarnParallelTimers] || false;
                                 g_bEnableTrelloSync = objSync[keybEnableTrelloSync] || false;
                                 g_bCheckedTrelloSyncEnable = objSync[keyCheckedTrelloSyncEnable] || false;
                                 g_optEnterSEByComment.loadFromStrings(objSync[keybEnterSEByCardComments], objSync[keyrgKeywordsforSECardComment]);

                                 g_rgExcludedUsers = JSON.parse(objSync[keyrgExcludedUsers] || "[]");
                                 g_bDisableSync = objSync[keybDisabledSync] || false;
                                 g_bUserDonated = objSync[keyAlreadyDonated] || false;
                                 g_msStartPlusUsage = objSync[keyMsStartPlusUsage] || null; //later we will try to initialize it when null, but may remain null
                                 g_bHidePendingCards = objSync[keyHidePendingCards] || false;
                                 g_bAlwaysShowSEBar = objSync[keyAlwaysShowSEBar] || false;
                                 g_bHideLessMore = objSync[keyHideLessMore] || false;

                                 setOptAlwaysShowSpentChromeIcon(objSync[SYNCPROP_optAlwaysShowSpentChromeIcon]);
                                 DowMapper.setDowStart(objSync[keyDowStart] || DowMapper.DOWSTART_DEFAULT, objSync[keyDowDelta] || 0);
                                 g_bAcceptSFT = objSync[keyAcceptSFT];
                                 if (g_bAcceptSFT === undefined)
                                     g_bAcceptSFT = true;

                                 g_bAcceptPFTLegacy = objSync[keyAcceptPFTLegacy];
                                 if (g_bAcceptPFTLegacy === undefined)
                                     g_bAcceptPFTLegacy = true; //defaults to true to not break legacy users
                                 g_bDisplayPointUnits = objSync[keyDisplayPointUnits] || false;
                                 g_bAllowNegativeRemaining = objSync[keyAllowNegativeRemaining] || false;
                                 g_bPreventIncreasedE = objSync[keyPreventIncreasedE] || false;
                                 g_bStealthSEMode = (objSync[SYNCPROP_bStealthSEMode] && objSync[keyServiceUrl] && !g_bDisableSync) ? true : false;
                                 g_bSyncOutsideTrello = objSync[keySyncOutsideTrello] || false;
                                 g_bChangeCardColor = objSync[keybChangeCardColor] || false;
                                 g_bCheckedbSumFiltered = objSync[keyPropbSumFilteredCardsOnly] || false;
                                 //alert("g_bEnableTrelloSync : " + g_bEnableTrelloSync + "\ncomments sync : " + g_optEnterSEByComment.bEnabled + "\ndisabled sync : " + g_bDisableSync);

                                 chrome.storage.local.get([LOCALPROP_PRO_VERSION, LOCALPROP_EXTENSION_VERSIONSTORE], function (obj) {
                                    if (BLastErrorDetected())
                                        return;
                                    g_verStore = obj[LOCALPROP_EXTENSION_VERSIONSTORE] || "";
                                    g_bProVersion = obj[LOCALPROP_PRO_VERSION] || false;
                                    callback();
                                });
                             });
}

function doAllUpdates() {
    markForUpdate();
    if (isPlusDisplayDisabled())
        return;
    addCardCommentHelp();

    var url = document.URL;

    var idCard = getIdCardFromUrl(url);
    if (idCard)
        sendExtensionMessage({ method: "notifyCardTab", idCard: idCard }, function (response) { });
    else {
        var idBoard = getIdBoardFromUrl(url);
        if (idBoard)
            sendExtensionMessage({ method: "notifyBoardTab", idBoard: idBoard }, function (response) { });
    }

    if (document.URL.toLowerCase() == "https://trello.com/plus-emergency-settings") {
        var linkReset = $("#plusEmergencyReset");
        elemDetect = $(".big-message h1");
        if (linkReset.length == 0 && elemDetect.length > 0) {
            elemDetect.text("");
            $(".big-message p").text("");
            linkReset = $("<button id='plusEmergencyReset'>Plus emergency 'Reset Sync'</button>");
            $("#content").append(linkReset);
            linkReset = $("#plusEmergencyReset");
            linkReset.click(function (e) {
                e.preventDefault();
                ResetPlus();
            });
            var linkPlusHelpPane = $("<br><button >Show the Plus help pane</button>");
            $("#content").append(linkPlusHelpPane);
            linkPlusHelpPane.click(function (e) {
                e.preventDefault();
                Help.display();
            });
        }
    }
}


var g_globalTotalSpent = null; //used to detect changes on global spent
var g_globalTotalEstimation = null; //used to detect changes on global est
var g_strPageHtmlLast = "";
var g_bNeedsUpdate = false;


/* markForUpdate
 *
 * Waits until changes stabilize to make an update
 **/
function markForUpdate() {
    var strPageHtml = document.body.innerHTML;
    if (!g_bForceUpdate && strPageHtml != g_strPageHtmlLast) {
        g_bNeedsUpdate = true;
        g_strPageHtmlLast = strPageHtml;
    } else if (g_bNeedsUpdate || g_bForceUpdate) {
        g_strPageHtmlLast = strPageHtml;
        update(true);
    }
}


var g_bForceUpdate = false;

function update(bShowBoardTotals) {
    updateWorker(bShowBoardTotals);
}


function updateSsLinksDetector(globalTotalSpent, globalTotalEstimation) {
    var user = getCurrentTrelloUser();

    if (user != null && globalTotalSpent == g_globalTotalSpent && globalTotalEstimation == g_globalTotalEstimation)
        updateSsLinks();
    else {
        var gTSLocal = g_globalTotalSpent;
        var gTELocal = g_globalTotalEstimation;
        setTimeout(function () { updateSsLinksDetector(gTSLocal, gTELocal); }, 500); //try later until it stabilizes
    }
}


function ResetPlus() {
    chrome.storage.sync.get([SYNCPROP_ACTIVETIMER], function (obj) {
        var strConfirm = 'Are you sure you want to Reset?';
        if (obj[SYNCPROP_ACTIVETIMER] !== undefined)
            strConfirm = strConfirm + ' All timers still running will be lost.';

        if (!confirm(strConfirm))
            return;

        sendExtensionMessage({ method: "detectLegacyHistoryRows" },
            function (response) {
                if (response.hasLegacyRows) {
                    if (g_optEnterSEByComment.IsEnabled() && !g_optEnterSEByComment.hasLegacyKeyword()) {
                        if (!confirm("The legacy keyword 'Plus S/E' is missing from your keywords, thus Plus will not be able to read your legacy rows.\nAre you sure you want to Reset?"))
                            return;
                    }
                }

                sendExtensionMessage({ method: "isSyncing" },
                    function (response) {
                        if (response.status != STATUS_OK) {
                            alert(response.status);
                            return;
                        }

                        if (response.bSyncing) {
                            //note: this isnt perfect but will cover many concurrency cases
                            if (!confirm("Plus is currently syncing.\nYou should press Cancel unless Plus is stuck in this state.\nAre you sure you want to reset?"))
                                return;
                        }


                        sendExtensionMessage({ method: "getTotalDBRowsNotSync" },
                            function (response) {
                                if (response.status != STATUS_OK) {
                                    alert(response.status);
                                    return;
                                }

                                if (response.cRowsTotal > 0 && (g_bDisableSync || !g_optEnterSEByComment.IsEnabled())) { //review newsync
                                    if (!g_optEnterSEByComment.IsEnabled() && g_strServiceUrl && g_strServiceUrl.length > 0) {
                                        if (!confirm("You have pending S/E rows that havent synced yet to the spreadsheet. Are you sure you want to lose those rows?"))
                                            return;
                                    }
                                    else if (!confirm("Sync is not enabled. S/E rows wont come back until you do so.'\nAre you sure you want to reset now?"))
                                        return;
                                }

                                clearAllStorage(function () {
                                    restartPlus("All local data cleared. Refreshing to start sync...");
                                });
                            });
                    });
            });
    });
}