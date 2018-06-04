/// <reference path="intellisense.js" />

//CANNOT use any external functions here

window.onload = function () {
    if (typeof (cordova) != "undefined")
        return;
    //since our simple jqm doesnt support url navigation, a page refresh or direct link will
    //fail. So instead redirect those requests to home, and handle the common case of a card url
    var path = window.location.href;
    var pathStart = "/index.html";
    var strDetectIdCard = "?idCard=";
    if (path.indexOf(pathStart + strDetectIdCard) >= 0)
        return; //special-case this one, which we produce below
    var parts = path.split("/");
    if (parts.length > 0) {
        var partLast = parts.pop();
        path = "/" + partLast;
        if (path != pathStart) {
            var strCardDetect = "card.html?id=";
            var prePath = parts.join("/");
            var postPath = "";
            if (partLast.indexOf(strCardDetect) == 0) {
                postPath = strDetectIdCard + partLast.split(strCardDetect)[1];
            }
            window.location.replace(prePath + pathStart + postPath);
        }
    }
};

