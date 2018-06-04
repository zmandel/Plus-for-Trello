/// <reference path="intellisense.js" />

//CANNOT use any external functions here
var PROP_NAVIDCARDLONG = "nav-idCardLong";
var PROP_NAVFROMPOWERUP = "nav-fromPowerup";

//using onload gives a chance for the page background to paint before we redirect, prevents white flash
window.onload = function () {
    this.init = null; //dont call again
    if (typeof (cordova) != "undefined")
        return;
    //since our simple jqm doesnt support url navigation, a page refresh or direct link will
    //fail. So instead redirect those requests to home. Handle the common case of a card url (from a notification)
    var path = window.location.href;
    var pathStart = "/index.html";
    var bRedirectHome = false;
    var parts = path.split("/");
    if (parts.length > 0) {
        var partLast = parts.pop();
        var pathExtracted = "/" + partLast;
        if (pathExtracted != pathStart) {
            bRedirectHome = true;
            var strCardDetect = "card.html?id=";
            var prePath = parts.join("/");
            var postPath = "";
            if (partLast.indexOf(strCardDetect) == 0) {
                var idCardLong = partLast.split(strCardDetect)[1];
                if (idCardLong) {
                    idCardLong = idCardLong.split("#")[0].split("&")[0]; //trello power-up adds extra parameters
                    localStorage[PROP_NAVIDCARDLONG] = idCardLong;
                    if (path.indexOf("powerup=true") >= 0)
                        localStorage[PROP_NAVFROMPOWERUP] = "true"; //used for testing the powerup without trello
                }
            }
        }
    }
    if (bRedirectHome)
        window.location.replace(pathStart);
};


