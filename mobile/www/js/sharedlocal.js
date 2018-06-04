/// <reference path="intellisense.js" />

//CANNOT use any external functions here

window.onload = function () {
    if (typeof (cordova) != "undefined")
        return;

    //prevents accidental page refresh, which our jquery mobile doesnt support on some pages.
    //sometimes the refresh happens automatically after external navigation :( so this gives a way to prevent it
    window.onbeforeunload = function () {
        return "Are you sure you want to exit the app?"; //some browsers dont show the actual text
    };
}
