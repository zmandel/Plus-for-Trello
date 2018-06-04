

self.addEventListener('notificationclick', function (event) {
    if (event.notification.data && event.notification.data.action == "pinnedCard") {
        //See if any existing client window has the card open. if so, focus it.
        //else, try to reuse an existing client window.
        //else, create a new window.
        event.waitUntil(clients.matchAll({
            type: "window"
        }).then(function (clientList) {
            var idCardLong=event.notification.data.idCardLong;
            var strPrefix = 'card.html?id=' + idCardLong;

            var client = null;
            var clientLoop = null;
            for (var i = 0; i < clientList.length; i++) {
                clientLoop = clientList[i];
                //frameType "top-level" when inside a trello power-up
                if (clientLoop.frameType && clientLoop.frameType != "top-level") {
                    continue;
                }
                if (clientLoop.url && (clientLoop.url.indexOf(strPrefix) >= 0) && 'focus' in clientLoop) //the indexOf here isnt 100% perfect but chances are slim it will collide with another card
                    return clientLoop.focus();
                client= clientLoop;
            }
            if (client) {
                client.postMessage({ action: "pinnedCard", idCardLong: idCardLong });
                if ('focus' in client)
                    return client.focus();
            } else if (clients.openWindow)
                return clients.openWindow(strPrefix); //see https://github.com/w3c/ServiceWorker/issues/720#issuecomment-269984307
        }));
    }
});

