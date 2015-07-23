var LabelsManager = {
    reduceColor: function (part) {
        return Math.round(255-(255-part) / 8);
    },
    update: function (card) {
        var color = "white";
        var firstLabel = card.find('div.list-card-labels').children(':first');
        if (firstLabel.size()) {
            var backgroundColor = firstLabel.css('background-color');
            var m = backgroundColor.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
            if (m)
                color = "rgb(" + this.reduceColor(m[1]) + "," + this.reduceColor(m[2]) + "," + this.reduceColor(m[3]) + ")";
        }
        card.css("background-color", color);
    }
};
