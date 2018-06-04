/* global TrelloPowerUp */
var LOGOPLUS = './images/logo.png';
var PROP_NAVIDCARDLONG = "nav-idCardLong"; //from webapp
var PROP_NAVFROMPOWERUP = "nav-fromPowerup"; //from webapp
var PROP_CARDDATAPOWERUP = "cardData-powerup"; //from webapp

TrelloPowerUp.initialize({
    'card-buttons': function (t, options) {
        return [
              {
                  icon: LOGOPLUS,
                  text: 'Spent/Estimate',
                  callback: function (t) {
                      return t.card('id', 'members')
                        .then(function (card) {
                            var idCardLong = card.id;
                            var members = card.members;
                            localStorage[PROP_NAVIDCARDLONG] = idCardLong;
                            localStorage[PROP_CARDDATAPOWERUP] = JSON.stringify({
                                idLong: idCardLong,
                                members: members
                            });
                            localStorage[PROP_NAVFROMPOWERUP] = "true";
                            var url = document.location.origin + '/index.html';
                            return t.popup({
                                title: 'Card',
                                url: url,
                                height: 320
                            });
                        })
                  }
              }
        ]
    }
});