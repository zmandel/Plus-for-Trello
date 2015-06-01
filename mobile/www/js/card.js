var g_valDayExtra = null;

var g_seCard = {
    clear: function() {
        this.mapUsers = {};
    },
    setSeCurForUser: function (user, s, e) {
        assert(user);
        var map = this.mapUsers[user];
        if (map) {
            map.s = s;
            map.e = e;
        }
        else
            this.mapUsers[user] = { s: s, e: e };
    },
    getSeCurForUser: function (user) { //note returns null when not loaded yet
        assert(user);
        var map = this.mapUsers[user] || { s: 0, e: 0 };
        return map;
    },

    //private:
    mapUsers: {}
};

function loadCardPage(page, params, bBack, urlPage) {
    var card = page.find("#cardTitle");
    var container = page.find("#seContainer");
    
    //warning: params is changed as data is refreshed. make sure to always use params and not a local cached value
    container.hide();
    page.find("#cardDesc").hide();
    var tbody = container.children("table").children("tbody");
    var elemBoard = page.find("#cardBoard");
    var elemList = page.find("#cardList");

    function updateTexts() {
        elemBoard.text(params.nameBoard);
        elemList.text(params.nameList);
        card.text(params.name);
    }
    tbody.empty();
    updateTexts();

    function refreshSE(bSlide) {
        fillSEData(page, container, tbody, params, bBack, function (cRows, bCached) {
            updateTexts();
            if (!bCached) {
                g_pinnedCards.updatePinned(params.id, params.name, params.nameList, params.nameBoard); //handle trello renames etc
            }
            if (cRows == 0) {
                container.hide();
                return;
            }

            if (container.is(":visible"))
                return;

            if (bSlide)
                container.slideDown(200);
            else
                container.show();
        });
    }

    function setLocalNotification(idNotification, bPinned) {
        if (!g_bLocalNotifications || !idNotification)
            return;

        if (bPinned) {
            var url = urlPage;
            //clean up url so it starts with the page
            var strFind = "/www/";
            var iFind = url.lastIndexOf(strFind); //on android 4.0, the url is built differently and www appears twice

            if (iFind >= 0) {
                url = url.substr(iFind + strFind.length);
            }
            //alertMobile("adding notif " + idNotification);
            window.plugin.notification.local.add({
                id: idNotification,
                message:params.name,
                title: params.nameBoard,
                sound:null,
                json: JSON.stringify({ url: url, action:"pinnedCard" })
            });
        }
        else {
            window.plugin.notification.local.cancel(idNotification, function () {
                // The notification has been cancelled
                //review zig: doesnt get called so not using it
            });
        }
    }

    g_stateContext.idCard = params.id;
    refreshSE(true);
    var elemPin = page.find("#cardPin");
    elemPin.flipswitch();
    var idNotification = g_pinnedCards.getIdNotification(params.id);
    elemPin[0].checked = (idNotification != null);
    elemPin.flipswitch("refresh");
    elemPin.off("change.plusForTrello").on("change.plusForTrello", function () {
        var bChecked = elemPin.is(':checked');
        idNotification = g_pinnedCards.pin(params.name, params.nameList, params.nameBoard, params.id, params.shortLink, bChecked);
        if (idNotification)
            setLocalNotification(idNotification, bChecked);
        else {
            assert(false);
        }
      
    });

    var paramsAnim = { duration: 200, easing: "linear" };
    var delayKB = 350;

    enableSEFormElems(false, page);
    var cTimesClickedAdd = 0;
    page.find("#addSE").off("click").click(function (event) {
        //$(this).slideUp(paramsAnim);
        cTimesClickedAdd++;
        enableSEFormElems(true, page, cTimesClickedAdd>1);
        $("#panelAddSEContainer").addClass("shiftUp");
        $("#cardBottomContainer").addClass("plusShiftBottom");
        $("#panelAddSE").addClass("opacityFull").removeClass("opacityZero");
        $(".cardBackground").addClass("backgroundShader");
        $("#seContainer table").addClass("backgroundShader");
        $("#seContainer table th").addClass("backgroundShader");
        $("#seContainer table td").addClass("backgroundShader");
        
        setTimeout(function () {
            var elemSEFocus = $("#plusCardCommentSpent"); //review zig test ios keyboard
            if (isCordova())
                cordova.plugins.Focus.focus(elemSEFocus);
        }, delayKB);
    });
    
    page.find("#plusCardCommentCancelButton").off("click").click(function () {
        setTimeout(function () {
        $("#panelAddSEContainer").removeClass("shiftUp");
        $("#cardBottomContainer").removeClass("plusShiftBottom");
        $(".cardBackground").removeClass("backgroundShader");
        $("#seContainer table").removeClass("backgroundShader");
        $("#seContainer table th").removeClass("backgroundShader");
        $("#seContainer table td").removeClass("backgroundShader");
        $("#panelAddSE").removeClass("opacityFull").addClass("opacityZero");
        enableSEFormElems(false, page);
        }, delayKB);
    });

    page.find("#openTrelloCard").off("click").click(function () {
        var urlCard = "https://trello.com/c/" + params.shortLink;
        if (isCordova()) {
            window.plugins.webintent.startActivity({
                action: window.plugins.webintent.ACTION_VIEW,
                url: urlCard
            },
            function () { },
            function (e) { alertMobile('Failed to open card'); }
        );
        }
        else {
            window.open(urlCard, '_blank', 'location=yes');
        }
    });
}

function enableSEFormElems(bEnable,
    page,
    bOnlyEnable) { //bOnlyEnable true and bEnable true will just show elements without repopulating (opt)
    if (bEnable) {
        page.find(".seFormElem").removeAttr('disabled');
        page.find("#plusCardCommentEnterButton").removeClass("ui-disabled");
        page.find("#plusCardCommentCancelButton").removeClass("ui-disabled");
        var listUsers = page.find("#plusCardCommentUser").selectmenu("enable");
        var listDays = page.find("#plusCardCommentDays").selectmenu("enable");

        if (bOnlyEnable) {
            listUsers[0].selectedIndex = 0;
            listDays[0].selectedIndex = 0;
            listUsers.selectmenu("refresh");
            listDays.selectmenu("refresh");
            return;
        }

        function setUnitLabels() {
            var u = UNITS.GetUnit() + " ";
            var su = UNITS.GetSubUnit() + " ";
            page.find("#spentUnit").text(u);
            page.find("#spentSubUnit").text(su);
            page.find("#estUnit").text(u);
            page.find("#estSubUnit").text(su);
        }

        setUnitLabels();
        var valUserOther = "other";
        
        function appendUser(name, bSelected) {
            var item = $("<option value='" + name + "'" + (bSelected ? " selected='selected'" : "") + ">" + name + "</option>");
            listUsers.append(item);
        }

        function fillUserList(userSelected) {
            listUsers.empty();
            g_recentUsers.users.sort(function (a, b) {
                return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            });
            appendUser("me");
            g_recentUsers.users.forEach(function (user) {
                var nameUse = user.name.toLowerCase();
                if (g_user && g_user.username.toLowerCase() == nameUse)
                    return;
                appendUser(nameUse, userSelected && userSelected == nameUse);
            });

            appendUser(valUserOther);
            listUsers.selectmenu("refresh");
        }
        fillUserList();
        listUsers.off("change.plusForTrello");
        listUsers.on("change.plusForTrello", function () {
            var combo = $(this);
            var val = combo.val();
            if (!val)
                return;
            if (val == valUserOther) {
                function process(userNew) {
                    if (userNew)
                        userNew = userNew.trim().toLowerCase();
                    if (userNew)
                        g_recentUsers.markRecent(userNew, null, new Date().getTime(), true);
                    fillUserList(userNew);
                }

                if (navigator && navigator.notification) {
                    navigator.notification.prompt(
                        "type username",  // message
                        function onPrompt(results) {
                            var text = null;
                            if (results.buttonIndex == 1)
                                text = results.input1;
                            process(results.input1);
                        },                  // callback to invoke
                        'User name',            // title
                        ['Ok', 'Cancel'],             // buttonLabels
                        "");                // defaultText
                }
                else {
                    process(prompt("type username", ""));
                }
            }
        });
        
        var valDayOther = "other";
        var valMaxDaysCombo = 9;
        function appendDay(cDay, cDaySelected) {
            var nameOption = null;
            var bSelected = (cDay == cDaySelected);
            if (cDay == valDayOther) {
                nameOption = cDay;
            }
            else if (cDay == 0)
                nameOption = "now";
            else
                nameOption = "-" + cDay + "d";
            var item = $("<option value='" + cDay + "'" + (bSelected ? " selected='selected'" : "") + ">" + nameOption + "</option>");
            listDays.append(item);
        }

        function fillDaysList(cDaySelected) {
            listDays.empty();
            for (var iDay = 0; iDay <= valMaxDaysCombo; iDay++)
                appendDay(iDay, cDaySelected);
            if (g_valDayExtra)
                appendDay(g_valDayExtra, cDaySelected);
            appendDay(valDayOther, 0); //0 so it never selects it
            listDays.selectmenu("refresh");
        }
        fillDaysList();
        listDays.off("change.plusForTrello");
        listDays.on("change.plusForTrello", function () {
            var combo = $(this);
            var val = combo.val();
            if (!val)
                return;
            if (val == valDayOther) {
                function process(dayNew) {
                    if (dayNew) {
                        if (dayNew > valMaxDaysCombo)
                            g_valDayExtra = dayNew;
                    }
                    fillDaysList(dayNew);
                }

                var dateNow = new Date();
                var options = {
                    date: dateNow,
                    mode: 'date',
                    maxDate: dateNow.getTime()
                };

                if (typeof (datePicker) != "undefined") {
                    datePicker.show(options, function (date) {

                        if (date > dateNow) {
                            alert("Date must be in the past");
                            date = null;
                        }
                        else {
                            var date1 = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
                            var date2 = Date.UTC(dateNow.getFullYear(), dateNow.getMonth(), dateNow.getDate());
                            var ms = Math.abs(date1 - date2);
                            date = Math.floor(ms / 1000 / 60 / 60 / 24);
                        }
                        process(date);
                    });
                }
                else {
                    var strValDelta = prompt("enter positive delta", "");
                    process(parseInt(strValDelta) || 0);
                }
            }
        });

    } else {
        page.find(".seFormElem").attr('disabled', 'disabled');
        page.find("#plusCardCommentUser").selectmenu("disable");
        page.find("#plusCardCommentDays").selectmenu("disable");
        page.find("#plusCardCommentEnterButton").addClass("ui-disabled");
        page.find("#plusCardCommentCancelButton").addClass("ui-disabled");
    }
}

function fillSEData(page, container, tbody, params, bBack, callback) {
    var idCard = params.id;
    function appendRow(user, s, eFirst, e, r) {
        var row = $("<tr>");
        row.append("<td class='colUser'>" + user + "</td>");
        row.append("<td class='colSSum'>" + s + "</td>");
        row.append("<td class='colEFirst'>" + eFirst + "</td>");
        row.append("<td class='colESum'>" + e + "</td>");
        row.append("<td class='colR'>" + r + "</td>");
        tbody.append(row);
    }

    g_stateContext.idCard = idCard;
    //on back, dont call trello, rely on cache only
    callTrelloApi("cards/" + idCard + "?actions=commentCard&actions_limit=900&fields=name,desc&action_fields=data,date,idMemberCreator&action_memberCreator_fields=username&board=true&board_fields=name&list=true&list_fields=name", true, bBack ? -1 : 500, function (response, responseCached) {
        var rgComments = [];
        var rgRows = [];
        var objReturn = {};
        if (response.objTransformed) {
            rgRows = response.objTransformed.rgRows;
            objReturn.name = response.objTransformed.name;
            objReturn.nameList = response.objTransformed.nameList;
            objReturn.nameBoard = response.objTransformed.nameBoard;
            objReturn.desc = response.objTransformed.desc;

        } else {
            var strKeywords = localStorage[PROP_PLUSKEYWORDS];
            var rgKeywords = [];
            strKeywords.split(",").forEach(function (k) {
                rgKeywords.push(k.toLowerCase().trim());
            });
            var cActions = response.obj.actions.length;
            for (iAction = cActions - 1; iAction >= 0; iAction--) {
                var action=response.obj.actions[iAction];
                var rowsAdd = readTrelloCommentDataFromAction(action, response.obj.name, rgKeywords);
                rowsAdd.forEach(function (rowCur) {
                    if (!rowCur.bError)
                        rgComments.push(rowCur);
                });
            }

            rgRows = calculateCardSEReport(rgComments, response.obj.name, responseCached != null);
            objReturn.rgRows = rgRows;
            objReturn.name = response.obj.name;
            objReturn.nameList = response.obj.list.name;
            objReturn.nameBoard = response.obj.board.name;
            objReturn.desc = response.obj.desc;

            
        }

        //review zig: ugly to have to update both objReturn and params
        params.name = objReturn.name;
        params.nameList = objReturn.nameList;
        params.nameBoard = objReturn.nameBoard;

        if (responseCached && JSON.stringify(responseCached.objTransformed) == JSON.stringify(objReturn))
            return objReturn;

        page.find("#cardTitle").text(objReturn.name);
        var converter = new Markdown.Converter();
        var descElem = page.find("#cardDesc");
        if (!objReturn.desc)
            descElem.hide();
        else {
            descElem.html(converter.makeHtml(objReturn.desc));
            var elems = descElem.find("a");
            elems.each(function (index) {
                var elem = elems[index];
                if ($(elem).prop("href").indexOf("/www/dont_modify")>0)
                    $(elem).hide();
            });
            elems.click(function (e) {
                //prevent jqm from handling it.
                e.preventDefault();
                var url = $(e.target).prop("href");
                openUrlAsActivity(url); //better as activity so drive attachments etc open native
            });
            descElem.show();
        }
        tbody.empty();
        rgRows.forEach(function (row) {
            appendRow(row.user, parseFixedFloat(row.spent), parseFixedFloat(row.estFirst), parseFixedFloat(row.est), parseFixedFloat(row.est - row.spent));
        });

        callback(rgRows.length, response.bCached);
        return objReturn;
    });
}

function calculateCardSEReport(rgComments, nameCard, bFromCache) {
    //rgComments in date ascending (without -dX)
    var bRecurring = (nameCard.toLowerCase().indexOf(TAG_RECURRING_CARD)>=0);
    var rgRows = [];
    var userSums = {};
    var iOrder = 0;
    var bModifiedUsers = false;
    rgComments.forEach(function (row) {
        userRow=userSums[row.user];
        if (userRow) {
            if (!userRow.idUser && row.idUser)
                userRow.idUser = row.idUser;
            userRow.spent = userRow.spent + row.spent;
            userRow.est = userRow.est + row.est;
            if (bRecurring)
                userRow.estFirst = userRow.est;
            if (row.date>userRow.sDateMost)
                userRow.sDateMost = row.date;
        }
        else {
            //first estimate row
            userRow = {};
            userSums[row.user] = userRow;
            userRow.spent = row.spent;
            userRow.est =  row.est;
            userRow.estFirst = row.est;
            userRow.user = row.user;
            userRow.idUser = row.idUser;
            userRow.sDateMost = row.date;
        }
        userRow.iOrder = iOrder;
        iOrder++;
    });

    for (var user in userSums) {
        var objSums = userSums[user];
        rgRows.push(objSums);
        if (g_recentUsers.markRecent(user, objSums.idUser, objSums.sDateMost * 1000, false)) {
            //review zig: add check for bFromCache so it doesnt do double work. not here yet because it would cause already-cached card data to
            //not go through here, because older versions didnt have this code to update the users list storage.
            //by june 2015 the check could be added and most users wont notice the issue
            bModifiedUsers = true;
        }
    }

    if (bModifiedUsers)
        g_recentUsers.saveProp();

    rgRows.sort(function (a, b) {
        return b.iOrder - a.iOrder;
    });

    return rgRows;
}
