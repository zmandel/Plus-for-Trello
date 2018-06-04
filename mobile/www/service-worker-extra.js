

self.onnotificationclick = function (event) {
    console.log('On notification click: ', event.notification.tag);
    if (event.notification.data && event.notification.data.action == "pinnedCard") {
        event.waitUntil(clients.matchAll({
            type: "window"
        }).then(function (clientList) {
            var idCardLong=event.notification.data.idCardLong;
            var strPrefix = 'card.html?id=' + idCardLong;

            var client = null;
            for (var i = 0; i < clientList.length; i++) {
                client = clientList[i];
                if (client.url && (client.url.indexOf(strPrefix) >= 0) && 'focus' in client)
                    return client.focus();
            }
            if (client) {
                client.postMessage({ action: "pinnedCard", idCardLong: idCardLong });
            } else if (clients.openWindow)
                return clients.openWindow(strPrefix);
        }));
    }
};

