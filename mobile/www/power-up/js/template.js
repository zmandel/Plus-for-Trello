/* global TrelloPowerUp */
var LOGOPLUS = './images/logo.png';
var PROP_NAVIDCARDLONG = "nav-idCardLong"; //duplicated from redirector.js

TrelloPowerUp.initialize({
    'card-buttons': function (t, options) {
        return t.card('id')
        .then(function (card) {
            var idCardLong = card.id;
            return [
              {
                  icon: LOGOPLUS,
                  text: 'Open in Plus',
                  callback: function (t) {
                      localStorage[PROP_NAVIDCARDLONG] = idCardLong;
                      var url = document.location.origin + '/index.html';
                      return t.popup({
                          title: 'Card',
                          url: url,
                          height: 400
                      })
                  }
              }
            ]
        })
    }
});