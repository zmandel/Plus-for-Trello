/// <reference path="intellisense.js" />

var g_valDayExtra = null;
var g_bNoAnimationDelay = false; //to optimize animation when pressing back button
var SEKEYWORD_LEGACY = "plus s/e";
var g_fnCancelSEBar = null;
var g_cardsById = {}; //has name, nameBoard, nameList, shortLink. used for navigation as jqm cant yet store well params in url

function getAllKeywords(bExcludeLegacyLast) {
    var strKeywords = localStorage[PROP_PLUSKEYWORDS] || "";
    var rgKeywords = [];
    strKeywords.split(",").forEach(function (k) {
        rgKeywords.push(k.toLowerCase().trim());
    });
    if (bExcludeLegacyLast && rgKeywords.length > 0 && rgKeywords[rgKeywords.length - 1] == SEKEYWORD_LEGACY)
        rgKeywords.pop();
    return rgKeywords;
}

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

function resetSEPanel(page) {
    unhookBack();
    page.find("#panelAddSEContainer").removeClass("shiftUp");
    page.find("#cardBottomContainer").removeClass("plusShiftBottom");
    page.find(".cardBackground").removeClass("backgroundShader");
    page.find("#seContainer table").removeClass("backgroundShader");
    page.find("#seContainer table th").removeClass("backgroundShader");
    page.find("#seContainer table td").removeClass("backgroundShader");
    page.find("#panelAddSE").removeClass("opacityFull").addClass("opacityZero");
    enableSEFormElems(false, page);
}

function loadCardPage(page, params, bBack, urlPage) {
    assert(params.id); //note that the rest of params could be missing on some cases (cold navigation here from trello app)
    var cardCached=g_cardsById[params.id];
    if (cardCached) {
        params.name = cardCached.name;
        params.nameList = cardCached.nameList;
        params.nameBoard = cardCached.nameBoard;
        params.shortLink = cardCached.shortLink;
    }
    var card = page.find("#cardTitle");
    var container = page.find("#seContainer");
    
    //warning: params is changed as data is refreshed. make sure to always use params and not a local cached value
    container.hide();
    page.find("#cardDesc").hide();
    var tbody = container.children("table").children("tbody");
    var elemBoard = page.find("#cardBoard");
    var elemList = page.find("#cardList");

    function updateTexts() {
        var strUnknown = "..."; //shows while values load from trello. could stay like that on some offline scenarios.
        elemBoard.text(params.nameBoard || strUnknown);
        elemList.text(params.nameList || strUnknown);
        card.text(params.name || strUnknown);
    }
    tbody.empty();
    updateTexts();

    function refreshSE(bSlide) {
        fillSEData(page, container, tbody, params, bBack, function (cRows, bCached) {
            //params have been updated. Update the card cache as well
            //review zig: ugly. sometimes we have a partial cache
            if (!cardCached || !bCached || !!cardCached.name || !cardCached.nameList || !cardCached.nameBoard) {
                cardCached = {
                    name: params.name,
                    nameList: params.nameList,
                    nameBoard: params.nameBoard,
                    shortLink: params.shortLink
                };
                g_cardsById[params.id] = cardCached;
                g_mapShortLinks.setCardId(params.shortLink, params.id);
            }
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
    var bNeedBounceFocus = false;
    var panelAddSE = page.find($("#panelAddSE")); //review zig test ios keyboard

    //this is part of the hack to get the focus event into the spent box and display the android numeric keyboard
    //we simulate a click with the "focus" plugin https://github.com/46cl/cordova-android-focus-plugin/
    //which gives us the right to simulate other user events like "focus" to bring the keyboard up.
    page.find("#panelAddSE").off("click").click(function (event) {
        if (bNeedBounceFocus) {
            bNeedBounceFocus = false;
            //$("#panelAddSE").find("input,select").removeClass("disabledClicks");
            $("#plusCardCommentSpent").focus();
            event.stopPropagation();
            event.preventDefault();
            return false;
        }
    });

    page.find("#addSE").off("click").click(function (event) {
        hookBack();
        event.stopPropagation();
        event.preventDefault();
        cTimesClickedAdd++;
        enableSEFormElems(true, page, cTimesClickedAdd > 1);
        bNeedBounceFocus = true;
        page.find("#panelAddSEContainer").addClass("shiftUp");
        page.find("#cardBottomContainer").addClass("plusShiftBottom");
        page.find("#panelAddSE").addClass("opacityFull").removeClass("opacityZero");
        page.find(".cardBackground").addClass("backgroundShader");
        page.find("#seContainer table").addClass("backgroundShader");
        page.find("#seContainer table th").addClass("backgroundShader");
        page.find("#seContainer table td").addClass("backgroundShader");
        
        page.find("#seBarFeedback").off("click").click(function () {
            var appInBrowserSurvey = window.open("https://docs.google.com/forms/d/1pIChF9MsRirj7OnF7VYHpK0wbGu9wNpUEJEmLQfeIQc/viewform?usp=send_form", '_blank', 'location=no');
        });

        setTimeout(function () {
            if (isCordova())
                cordova.plugins.Focus.focus(panelAddSE);
            else
                page.find("#plusCardCommentSpent").focus();
        }, delayKB);

        function cancelSEBar() {
            g_fnCancelSEBar = null;
            resetSEPanel(page);
        }

        g_fnCancelSEBar = cancelSEBar;
        return false;
    });
    
    page.find("#plusCardCommentCancelButton").off("click").click(function (event) {
        g_fnCancelSEBar = null;
        var delay = delayKB * 2;
        if (g_bNoAnimationDelay) {
            g_bNoAnimationDelay = false;
            delay = 0;
        }
        setTimeout(function () {
            resetSEPanel(page);
        }, delay);
        event.stopPropagation();
        event.preventDefault();
        return false;
    });

    page.find("#openTrelloCard").off("click").click(function (event) {
        var urlCard = "https://trello.com/c/" + params.shortLink;
        if (isCordova()) {
            window.plugins.webintent.startActivity({
                action: window.plugins.webintent.ACTION_VIEW,
                url: urlCard
            },
            function () { },
            function (e) { alertMobile('Could not open card'); }
        );
        }
        else {
            window.open(urlCard, '_blank', 'location=yes');
        }

        event.stopPropagation();
        event.preventDefault();
        return false;
    });
}

var g_bBackHooked=false;

function onBackKeyDown() {
    var elem = $("#plusCardCommentCancelButton");
    if (elem.length > 0) {
        g_bNoAnimationDelay = true;
        elem.eq(0).click();
    }
}

function hookBack() {
    if (g_bBackHooked)
        return;
    g_bBackHooked=true;
    document.addEventListener("backbutton", onBackKeyDown, false);
}

function unhookBack() {
    if (!g_bBackHooked)
        return;
    g_bBackHooked = false;
    document.removeEventListener("backbutton", onBackKeyDown, false);
}

function enableSEFormElems(bEnable,
    page,
    bOnlyEnable) { //bOnlyEnable true and bEnable true will just show elements without repopulating (opt)
    if (bEnable) {
        page.find(".seFormElem").removeAttr('disabled');
        page.find("#plusCardCommentEnterButton").removeClass("ui-disabled");
        page.find("#plusCardCommentCancelButton").removeClass("ui-disabled");
        var listKeywords = page.find("#plusCardCommentKeyword").selectmenu("enable");
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

        function appendKeyword(keyword, bSelected) {
            var item = $("<option value='" + keyword + "'" + (bSelected ? " selected='selected'" : "") + ">" + keyword + "</option>");
            listKeywords.append(item);
        }

        function fillKeywords(keywordSelected) {
            var rgKeywords = getAllKeywords(true);
            rgKeywords.forEach(function (keyword) {
                appendKeyword(keyword, keywordSelected && keywordSelected == keyword);
            });
            
            listKeywords.selectmenu("refresh");
            if (rgKeywords.length < 2)
                listKeywords.parent().hide();
            else
                listKeywords.parent().show();
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

        fillKeywords();
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
                        "Type username",  // message
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
                    process(prompt("Type username", ""));
                }
            }
        });
        
        var valDayOther = "other";
        var valMaxDaysCombo = 5;
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
                        if (!date || date=="cancel") {
                            date = "";
                        }
                        else if (date > dateNow) {
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
                    process(parseInt(strValDelta,10) || 0);
                }
            }
        });

    } else {
        page.find(".seFormElem").attr('disabled', 'disabled');
        page.find("#plusCardCommentKeyword").selectmenu("disable");
        page.find("#plusCardCommentUser").selectmenu("disable");
        page.find("#plusCardCommentDays").selectmenu("disable");
        page.find("#plusCardCommentEnterButton").addClass("ui-disabled");
        page.find("#plusCardCommentCancelButton").addClass("ui-disabled");
    }
}

function fillSEData(page, container, tbody, params, bBack, callback) {
    var idCard = params.id;
    g_seCard.clear();
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
    callTrelloApi("cards/" + idCard + "?actions=commentCard&actions_limit=900&fields=name,desc&action_fields=data,date,idMemberCreator&action_memberCreator_fields=username&board=true&board_fields=name&list=true&list_fields=name", true, bBack? -1: 200, callbackTrelloApi);

    function callbackTrelloApi(response, responseCached) {
        g_seCard.clear(); //might not be necessary but timing issues might require another clear
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
            //update params.id, as we might have received a shortLink (currently does not happen)
            params.id = response.obj.id;
            idCard = params.id;
            var rgKeywords = getAllKeywords();
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
            elems.click(function (e) {
                //prevent jqm from handling it.
                e.preventDefault();
                e.stopPropagation();
                var url = $(e.target).prop("href");
                var urlLower = url.toLowerCase();
                if (urlLower.indexOf("trello.com/" >= 0)) {
                    if (urlLower.indexOf("trello.com/b/") >= 0 || urlLower.indexOf("trello.com/c/") >= 0)
                        handleBoardOrCardActivity(url);
                    else
                        window.open(url, '_blank', 'location=no'); //the trello app doesnt handle well activity links (other than boards or cards)
                }
                else
                    openUrlAsActivity(url); //better as activity so drive attachments etc open native
            });
            descElem.show();
        }
        tbody.empty();
        rgRows.forEach(function (row) {
            var sLoop = parseFixedFloat(row.spent);
            var eLoop = parseFixedFloat(row.est);
            g_seCard.setSeCurForUser(row.user, sLoop, eLoop);
            appendRow(row.user, sLoop, parseFixedFloat(row.estFirst), eLoop, parseFixedFloat(row.est - row.spent));
        });

        callback(rgRows.length, response.bCached);
        return objReturn;
    }
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
            //review 2 zig: cant see how to prevent the double check. we want to update when reading from cache but also when reading from trello if
            //plus users list changed in the card
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
