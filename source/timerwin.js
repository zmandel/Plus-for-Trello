var g_bLoaded = false; //needed because DOMContentLoaded gets called again when we modify the page


document.addEventListener('DOMContentLoaded', function () {
    if (g_bLoaded)
        return;
    g_bLoaded = true;
    var params = getUrlParams();
    var idCard = params.idCard;
    var hash = getCardTimerSyncHash(idCard);
    var bodyElem = $("body");
    bodyElem.click(function () {
        var href = "https://trello.com/c/" + idCard;
        window.open(href, "_blank"); //this activates the window if chrome is minimized or not active. (chrome.tabs.create does not)
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