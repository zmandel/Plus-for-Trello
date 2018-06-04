var PROP_NAVIDCARDLONG = "nav-idCardLong"; //duplicated from redirector.js
var t = TrelloPowerUp.iframe();
t.sizeTo('#content');
var g_idCard = t.arg('idCard');

// close overlay if user clicks outside our content
document.addEventListener('click', function (e) {
    if (e.target.tagName == 'BODY') {
        t.closeOverlay().done();
    }
});