/// <reference path="intellisense.js" />

var g_bLoaded = false;
var g_sizeLast = {
    width: 0,
    height: 0};

document.addEventListener('DOMContentLoaded', function () {
    if (g_bLoaded)
        return;
    g_bLoaded = true;

    var params = getUrlParams();
    var idCard = params.idCard;
    var url = "https://trello.com/c/" + idCard;
    var dockOut = $("#dockoutImg");
    dockOut.attr("src", chrome.extension.getURL("images/dockoutlarge.png"));
    dockOut.show();
    dockOut.css("cursor", "pointer");
    dockOut.off().click(function () { //cant use setPopupClickHandler because url could have changed if user navigated inside 
        sendExtensionMessage({ method: "openCardWindow", idCard: idCard, bForceTab: true }, function (response) {
            window.close();
        });
        return false;
    });

    var elemIframe = $("#plus_card");
    
    function loadTrello() {
        elemIframe.empty();
        window.TrelloCards.create(url, elemIframe[0], { compact: params.cpt == CARDPOPUPTYPE.POPUP_NOACTIONS });
        setupIframeWatch();
    }

    if (navigator.onLine)
        loadTrello();
    else {
        elemIframe.append($("<div style='margin-top:3em;padding-left:1em;padding-right:1em;'>Waiting for internet connection to load the card.</div>"));
        window.addEventListener("online", function () { loadTrello()});
    }

    function setupIframeWatch() {
        var iframe = $('.trello-card');
        if (iframe.length == 0)
            setTimeout(setupIframeWatch, 200);
        else {
            iframe[0].addEventListener("load", function () {
                setInterval(resize, 300);
            });
        }
    }

    function resize() {
        var elem = $("#plus_card_container");
        var width = elem.width();
        var height = elem.height();
        if (!width || !height)
            return;

        if (g_sizeLast.width == window.innerWidth && g_sizeLast.height == window.innerHeight)
           return;
        const extraWidth = window.outerWidth - window.innerWidth;
        const extraHeight = window.outerHeight - window.innerHeight;
        sendExtensionMessage({
            method: "cardPopupWindowResize", idCard: idCard,
            width: width + extraWidth,
            height: height + extraHeight
        }, function (response) {
            g_sizeLast.width = width;
            g_sizeLast.height = height;
        });
    }
});
