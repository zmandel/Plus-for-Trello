/* global TrelloPowerUp */
var WHITE_ICON = './images/icon-white.svg';
var GRAY_ICON = './images/icon-gray.svg';

var boardButtonCallback = function(t){
  return t.popup({
    title: 'Popup List Example',
    items: [
      {
        text: 'Open Overlay',
        callback: function(t){
          return t.overlay({
            url: './overlay.html',
            args: { rand: (Math.random() * 100).toFixed(0) }
          })
          .then(function(){
            return t.closePopup();
          });
        }
      },
      {
        text: 'Open Board Bar',
        callback: function(t){
          return t.boardBar({
            url: './board-bar.html',
            height: 200
          })
          .then(function(){
            return t.closePopup();
          });
        }
      }
    ]
  });
};

var cardButtonCallback = function(t){
  var items = Object.keys(parkMap).map(function(parkCode){
    var urlForCode = 'http://www.nps.gov/' + parkCode + '/';
    return {
      text: parkMap[parkCode],
      url: urlForCode,
      callback: function(t){
        return t.attach({ url: urlForCode, name: parkMap[parkCode] })
        .then(function(){
          return t.closePopup();
        })
      }
    };
  });

  return t.popup({
    title: 'Popup Search Example',
    items: items,
    search: {
      count: 5,
      placeholder: 'Search National Parks',
      empty: 'No parks found'
    }
  });
};

TrelloPowerUp.initialize({
  'board-buttons': function(t, options){
    return [{
      icon: WHITE_ICON,
      text: 'Template',
      callback: boardButtonCallback
    }];
  },
  'card-buttons': function(t, options) {
    return [{
      icon: GRAY_ICON,
      text: 'Template',
      callback: cardButtonCallback
    }];
  }
});
