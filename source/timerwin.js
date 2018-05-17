/// <reference path="intellisense.js" />

var g_bLoaded = false; //needed because DOMContentLoaded gets called again when we modify the page

function getSQLReport(sql, values, callback) {
    return getSQLReportShared(sql, values, callback, function onError(status) {
        showError(status);
    });
}

document.addEventListener('DOMContentLoaded', function () {
    if (g_bLoaded)
        return;
    g_bLoaded = true;

    var params = getUrlParams();
    var idCard = params.idCard;
    var hash = getCardTimerSyncHash(idCard);
    var bodyElem = $("body");

    bodyElem.click(function () {

        function stepCardData(resolve, reject) {
            getCardData(null, idCard, "shortLink", false, function (cardData) {
                if (cardData.status == STATUS_OK && !cardData.hasPermission) {
                    removeTimerForCard(idCard);
                    reject(new Error("")); //not an error, just stop chain. message already shown by removeTimerForCard
                }
                else
                    resolve(STATUS_OK);
            });
        }

        function openCard(status) {
            assert(status == STATUS_OK);
            window.open("https://trello.com/c/" + idCard, "_blank"); //this activates the window if chrome is minimized or not active. (chrome.tabs.create does not)
        }

        function checkDeletedCard(response) {
            assert(response.status == STATUS_OK);
            var rows = response.rows;
            assert(window.Promise); //we check for this during extension init, and wont load if its not there
            if (rows && rows.length == 1 && rows[0].bDeleted)
                return new Promise(stepCardData); //verify that indeed user has no access
            else
                return STATUS_OK;
        }

        loadSharedOptions(function () {
            getSQLReport("SELECT bDeleted FROM cards WHERE idCard=?", [idCard]).then(checkDeletedCard).then(openCard)['catch'](function (err) { //review: 'catch' syntax to keep lint happy
                if (err.message) //message is only set if user needs to see a message. else just means stop the chain
                    sendDesktopNotification(err.message, 10000); //note: timer panels rely on this, as alerts dont work in panels
            });
        });
    });

    bodyElem.on("mouseenter", function () {
        bodyElem.addClass("agile_timer_popup_hilite");
    });

    bodyElem.on("mouseleave", function () {
        bodyElem.removeClass("agile_timer_popup_hilite");
    });

    //review zig: re-enable hover on panel body. https://code.google.com/p/chromium/issues/detail?id=268367
    $("#cardText").text(params.nameCard);//.prop("title", params.nameCard);
    $("#cardFullAsTitle").prop("title", params.nameCard); //so in case there is ellipsis, tooltip shows when hovering it
    $("#boardText").text(params.nameBoard);
    var bPanel = chrome.windows.getCurrent(null, function (window) {
        if (!window.alwaysOnTop) {
            $("#enablePanels").show();
            $("#linkEnablePanels").click(function (e) {
                e.preventDefault();
                e.stopPropagation();
                sendExtensionMessage({ method: "openChromeOptionsPanels" }, function (response) { });
            });
        }
    });
    if (bPanel)
        button.hide();
    function update() {
        getCardTimerData(hash, function (objTimer) {
            var stored = objTimer.stored;

            if (stored === undefined || stored.msStart == null || stored.msEnd != null) {
                document.title = "00:00:00s";
                window.close();
            }
            else {
                var values = getTimerElemText(stored.msStart, Date.now(), false, document.visibilityState != "visible");
                document.title = values;
            }
        });
    }

    update();
    setInterval(update, 1000);
});