var LabelsManager = {
    update: function (card) {

        var classes = ['agile_green_card', 'agile_yellow_card', 'agile_orange_card', 'agile_red_card', 'agile_purple_card', 'agile_blue_card'];
        var mapClasses = {};
        var i = 0;
        for (; i < classes.length; i++) {
            mapClasses[classes[i]] = card.hasClass(classes[i]);
        }

        var classUse = null;

        var firstLabel = card.find(g_bNewTrello ? 'div.list-card-labels' : 'div.card-labels').children(':first');
        if (firstLabel.size()) {
            var classString = firstLabel.attr('class');
            if (classString.search('green') != -1) {
                classUse = 'agile_green_card';

            } else if (classString.search('yellow') != -1) {
                classUse = 'agile_yellow_card';

            } else if (classString.search('orange') != -1) {
                classUse = 'agile_orange_card';

            } else if (classString.search('red') != -1) {
                classUse = 'agile_red_card';

            } else if (classString.search('purple') != -1) {
                classUse = 'agile_purple_card';

            } else if (classString.search('blue') != -1) {
                classUse = 'agile_blue_card';
            }

            if (classUse) {
                if (mapClasses[classUse])
                    mapClasses[classUse] = false;
                else
                    card.addClass(classUse);
            }

            for (i in mapClasses) {
                if (mapClasses[i])
                    card.removeClass(i);
            }
        }
    }
};
