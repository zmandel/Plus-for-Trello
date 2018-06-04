/* global TrelloPowerUp */
var LOGOPLUS = './images/logo.png';

TrelloPowerUp.initialize({
    'card-buttons': function (t, options) {
        return t.card('id')
        .then(function (card) {
            var url = 'https://app.plusfortrello.com/card.html?id=' + card.id;
            return [
              {
                  icon: LOGOPLUS,
                  text: 'Open in Plus',
                  callback: function (t) {
                      var height = 700;
                      var width = 500;
                      var myWindow = window.open(url, "_blank", "scrollbars=no,menubar=no,personalbar=no,minimizable=yes,resizable=yes,location=no,toolbar=no,status=no,innerHeight=" + height + ",innerWidth=" + width);
                      if (!myWindow || myWindow.closed || typeof myWindow.closed == 'undefined') {
                          alert("Please allow the Plus popup to display (see the address bar or below).");
                      }
                  }
              }
            ]
        })
    }
});