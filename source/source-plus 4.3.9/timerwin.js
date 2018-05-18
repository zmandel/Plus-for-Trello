/// <reference path="intellisense.js" />

var g_bLoaded = false;
var g_bSentLoadedMsg = false;

function sendOnceLoadedMessage() {
    if (g_bSentLoadedMsg)
        return;
    g_bSentLoadedMsg = true;
    var params = getUrlParams();
    var idCard = params.idCard;
    var bClearAndMinimize = (params.minimized != "0");
    sendExtensionMessage({ method: "timerWindowLoaded", idCard: idCard, bClearAndMinimize: bClearAndMinimize }, function (response) { });
}

window.addEventListener("load", function (event) {
    var params = getUrlParams();
    var idCard = params.idCard;
    //try to wait until the window is fully painted, Windows needs it so its minimized preview shows the content.
    //this method isnt perfect. I also tried changing an img src and detect its onload but that also didnt always work,
    //so the current approach is to wait an extra 100ms
    window.requestAnimationFrame(function () {
        setTimeout(function () {
            sendOnceLoadedMessage();
            setTimeout(function () {
                window.requestAnimationFrame(function () {
                    handleRestoreWindow(idCard); //case after lock screen restore
                });
            }, 2000); //2000 is a safe time to wait, in case the minimize takes time and another paint happens
        }, 100);
    });
});


var g_bHandledRestore = false;
function handleRestoreWindow(idCard) {
    if (g_bHandledRestore)
        return;
    g_bHandledRestore = true; //first one wins
    sendOnceLoadedMessage();
    sendExtensionMessage({ method: "timerWindowRestored", idCard: idCard }, function (response) {
        window.close();
    });
}

window.onfocus = function () {
    if (document.visibilityState != "visible")
        return;
    var params = getUrlParams();
    var idCard = params.idCard;
    handleRestoreWindow(idCard);
};

document.addEventListener('DOMContentLoaded', function () {
    if (g_bLoaded)
        return;
    g_bLoaded = true;

    var params = getUrlParams();
    var idCard = params.idCard;
    var hash = getCardTimerSyncHash(idCard);

    $("#cardText").text(params.nameCard);//.prop("title", params.nameCard);
    $("#boardText").text(params.nameBoard);

    function update() {
        getCardTimerData(hash, function (objTimer) {
            var stored = objTimer.stored;

            if (stored === undefined || stored.msStart == null || stored.msEnd != null) {
                document.title = "00:00m";
                sendOnceLoadedMessage();
                window.close();
            }
            else {
                document.title = getTimerElemText(stored.msStart, Date.now(), false, true);
            }
        });
    }

    update();
    setInterval(update, 1000); //review this could be re-done with timeouts with minute-step as now the windows is always minimized
});

