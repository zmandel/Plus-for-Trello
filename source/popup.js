/// <reference path="intellisense.js" />

var g_bLoaded = false; //needed because DOMContentLoaded gets called again when we modify the page
var g_cSearchTotal = 0; //used for detecting if search is still current
var g_mapCards = {}; //to know if card was already added

function updateNewLink() {
    var keyLastSyncViewed = "rowidLastHistorySyncedViewed";
    var keyLastSync = "rowidLastHistorySynced";
    var key_plus_datesync_last = "plus_datesync_last";
    var keyplusSyncLastStatus = "plusSyncLastStatus";
    var rowidLastSyncViewed = null;
    var rowidLastSync = null;

    function doUpdateWorker() {
        chrome.storage.local.get([keyLastSyncViewed, keyLastSync, key_plus_datesync_last, keyplusSyncLastStatus], function (obj) {
            var rowidLastSyncViewedNew = obj[keyLastSyncViewed] || -1;
            var rowidLastSyncNew = obj[keyLastSync];
            var msplus_datesync_last = obj[key_plus_datesync_last];
            var statusLastSync = obj[keyplusSyncLastStatus];

            var tooltipSync = "Sync";
            if (msplus_datesync_last !== undefined) {
                var dateLastSync = new Date(msplus_datesync_last);
                tooltipSync = tooltipSync + "\nLast sync " + getTimeDifferenceAsString(msplus_datesync_last, true) + " @" + dateLastSync.toLocaleTimeString();
            }

            tooltipSync = tooltipSync + buildSyncErrorTooltip(statusLastSync);
            $("#imgSync").attr("title", tooltipSync);

            if (rowidLastSyncViewed  && rowidLastSync && rowidLastSyncViewedNew == rowidLastSyncViewed && rowidLastSyncNew == rowidLastSync)
                return; //nothing to do

            rowidLastSyncViewed = rowidLastSyncViewedNew;
            rowidLastSync = rowidLastSyncNew;
            var urlReport = chrome.extension.getURL("report.html");
            var elem = $("#reportLinkNew");
            elem.attr("href", urlReport + "?chartView=s&pivotBy=year&orderBy=date&archived=-1&deleted=-1&afterRow=-1&afterRow=" + rowidLastSyncViewed + "&setLastRowViewed=true");
            if (!g_bNoSE) {
                if (rowidLastSync !== undefined && (rowidLastSyncViewed < 0 || rowidLastSyncViewed < rowidLastSync)) {
                    $("#reportLinkNewDisabled").hide();
                    elem.show();
                }
                else {
                    elem.hide();
                    $("#reportLinkNewDisabled").show().css("cursor", "default");
                }
            }
        });
    }

    doUpdateWorker();
    setInterval(function () {
        doUpdateWorker();
    }, 2000);
}


document.addEventListener('DOMContentLoaded', function () {
    if (g_bLoaded)
        return;
    g_bLoaded = true;
    var bWindows = navigator.userAgent.indexOf("Win") != -1;
    if (bWindows)
        $("body").addClass("agile_cmenu_body_windows");
    loadSharedOptions(function () {
        setTimeout(function () {
            updateNewLink();
        }, 200);
        loadPopup();
        hitAnalytics("ChromeMenu", "open", true);
    });
});

function showError(strError) {
	logPlusError(strError);
	var progress = document.getElementById("progress");
	progress.innerHTML = strError + "<br><A href='plusmessages.html' target='_blank'>Plus error log</A>";
	progress.style.display = "block";
}


function getCardAndBoard(idCard,callback) {
    var sql = "SELECT c.name as nameCard, b.name as nameBoard FROM cards c JOIN boards b WHERE c.idCard=? AND c.idBoard=b.idBoard";
    var ret = { card: null, board: null };

    getSQLReport(sql, [idCard], function (response) {
        var rows = response.rows;
        if (response.status == STATUS_OK && rows && rows.length == 1) {
            ret.board = rows[0].nameBoard;
            ret.card = rows[0].nameCard;
        }
        callback(ret);
    });
}

function updateButtonTitle(button, idCardTimer) {
    getCardAndBoard(idCardTimer, function (data) {
        if (data && data.board && data.card) 
            button.prop("title", "Click to open card\n" + data.card + "\n" + data.board);
        else
            button.prop("title", "Click to open card"); // if card isnt on db
    });
}

function configureTimerElem(callback) {
    chrome.storage.sync.get([SYNCPROP_ACTIVETIMER], function (obj) {
        var idCardTimer = null;
        if (obj[SYNCPROP_ACTIVETIMER] !== undefined)
            idCardTimer = obj[SYNCPROP_ACTIVETIMER];

        if (idCardTimer) {
            $("#agile_active_timer").show();
            var elemSAT = $("#agile_showall_timers");
            elemSAT.show();
            elemSAT.click(function (ev) {
                ev.preventDefault();
                sendExtensionMessage({ method: "showAllActiveTimerNotifications" }, function (response) { });
                return false;
            });
            var button = $(".agile_timer_button_popup");
            var hash = getCardTimerSyncHash(idCardTimer);
            updateButtonTitle(button,idCardTimer);
            getCardTimerData(hash, function (objTimer) {
                var stored = objTimer.stored;
                
                if (stored === undefined || stored.msStart == null || stored.msEnd!=null)
                    return;
                
                function update() {
                    button.val(getTimerElemText(stored.msStart, Date.now()));
                }
                setInterval(function () {
                        update();
                }, 1000); //every second so user sees the timer ticking
                
                update();
                
                button.click(function () {
                    sendExtensionMessage({ method: "openCardWindow", idCard: idCardTimer, bForceTab: true }, function (response) { });
                });
            });
        }

        callback();
    });
}


function loadPopup() {
    $("#topTitle").css("cursor", "default");
    sendExtensionMessage({ method: "updatePlusIcon" }, function (response) { });
    setTimeout(function () {
        $("#agile_boardSearch").focus(); //focus on mac for some reason doesnt work without timeout
    }, 150);

    var imgSync = $("#imgSync");
    var linkHelp = $("#help_plus");
	var elemSpent = $("#reportLinkByUser");
	var elemRemain = $("#reportLinkR");
	var elemNewSE = $("#reportLinkNew");
	var elemNewSEDisabled = $("#reportLinkNewDisabled");

	if (g_bNoEst)
	    elemRemain.hide();

	if (g_bNoSE) {
	    elemSpent.hide();
	    elemRemain.hide();
	    elemNewSE.hide();
	    elemNewSEDisabled.hide();
	}

	function setSyncIcon(bSync) {
	    if (bSync) {
	        imgSync.attr("src", chrome.extension.getURL("images/syncingnow.gif"));
	        imgSync.css("cursor", "default");
	    }
	    else {
	        imgSync.attr("src", chrome.extension.getURL("images/sync.png"));
	        imgSync.css("cursor", "pointer");
	    }
	}

	setSyncIcon(false);
	linkHelp.click(function (evt) {
	    evt.preventDefault();
	    var pair = {};
	    pair[LOCALPROP_NEEDSHOWHELPPANE] = true;
	    chrome.storage.local.set(pair, function () {
	        chrome.tabs.create({ url: "https://trello.com/b/0jHOl1As/plus-for-trello-help" });
	    });
	    return false;
	});

	imgSync.click(function () {
	    setSyncIcon(true);
	    sendExtensionMessage({ method: "plusMenuSync" }, function (response) {
	        if (response.status==STATUS_OK && response.cRowsNew !== undefined && response.cRowsNew > 0)
	            location.reload(true);
	        else
	            setSyncIcon(false);
	    });
	});

	if (true)
	    configData();
    else
	    setTimeout(configData, 5000); //for debugging
	
}


function configData() {

    openPlusDb(function (response) {
        if (response.status != STATUS_OK) {
            showError(response.status);
            return;
        }
        configureTimerElem(function () {
            if (false) //for easy debugging. must be false
                setTimeout(function () { listAllBoards(); }, 12000);
            else
                listAllBoards();
        });
    });
}

function listAllBoards() {
    var sql = "SELECT b.idBoard, b.name, MAX(h.date) as maxDate FROM boards AS b LEFT OUTER JOIN history as H ON b.idBoard=h.idBoard WHERE b.idBoard <> ? AND b.bArchived=0 GROUP BY b.idBoard ORDER BY " + (g_bEnableTrelloSync ? "b.dateSzLastTrello" : "maxDate")+" DESC";
    var status = $("#progress");
	var cardResults = $("#agile_popup_cards_container");
	var urlBaseDashboard = chrome.extension.getURL("dashboard.html") + "?";
	var urlBaseReport = chrome.extension.getURL("report.html") + "?groupBy=idCardH&idBoard=";
	getSQLReport(sql, [IDBOARD_UNKNOWN], function (response) {
	    if (response.status != STATUS_OK) {
	        status.text(response.status);
	        status.show();
	        return;
	    }

	    var rows = response.rows;

	    if (rows === undefined || rows.length == 0) {
	        var textStatus;

	        if (!g_bEnableTrelloSync || g_bDisableSync)
	            textStatus = "Plus Sync is not enabled.</br></br>Click 'Help' above to open the Plus help pane and enable it.";
	        else if ((localStorage["plus_bFirstTrelloSyncCompleted"] || "") != "true")
	            textStatus = "First sync has not yet completed. Please wait.";
	        else
	            textStatus = "No boards with you as direct member. Add yourself to some boards.";
	        status.html(textStatus);
	        status.show();
	        return;
	    }
	    var i = 0;
	    var list = $("<div>");

	    var mapBoards = {};
	    for (; rows && i < rows.length; i++) {
	        var item = $("<div tabindex=0>").addClass("agile_board_dashboardItem");
	        var row = rows[i];
	        var url = urlBaseDashboard + "idBoard=" + encodeURIComponent(row.idBoard);
	        var a1 = $("<div class='agile_board_dashboardItem_name'>").text(row.name);
	        var a2 = $("<div class='agile_board_dashboardItem_row2'>");
	        mapBoards[row.idBoard] = { div: item, se: a2, name: row.name };
	        var imgDash = $("<img title='Burndown'>").attr("src", chrome.extension.getURL("images/chart-sm.png")).addClass("agile_img_popup");
	        var imgReport = $("<img title='Report'>").attr("src", chrome.extension.getURL("images/report-sm.png")).addClass("agile_img_popup");
	        var urlReport = urlBaseReport + encodeURIComponent(row.idBoard);
	        setPopupClickHandler(imgDash, url);
	        setPopupClickHandler(imgReport, urlReport);
	        if (row.maxDate) {
	            var date = new Date(row.maxDate * 1000);
	            item.attr("title", row.name + "\nLast S/E " + date.toLocaleDateString());
	        }
	        setPopupClickHandler(item, "https://trello.com/b/" + row.idBoard); // must be in a function outside loop
	        item.append(a1);
	        item.append(a2);
	        item.append(imgDash);
	        item.append(imgReport);
	        list.append(item);

	    }
	    list.insertBefore(cardResults);
	    var searchBox = $("#agile_boardSearch");
	    searchBox.keypress(function (event) {
	        var keycode = (event.keyCode ? event.keyCode : event.which);
	        if (keycode == '13') { //enter key
	            var elem = $(".agile_board_dashboardItem :visible").eq(0);
	            if (elem.length == 1) {
	                elem.click();
	                return false;
	            }
	        }
	    });

	    function doSearch() {
	        g_cSearchTotal++;
	        cSearchesTotal = g_cSearchTotal;
	        var val = searchBox.val().toLowerCase();
	        var term = "^*" + val + "*$";
	        term = term.replace(/[*]/g, ".*");
	        term = term.replace(/[?]/g, ".?");
	        var rx = new RegExp(term);
	        setTimeout(function () {
	            var bodyElem = $("body");
	            var hCur = bodyElem.height();
	            var cTotal = 0;
	            var cShown = 0;
	            for (var iBoards in mapBoards) {
	                cTotal++;
	                var item = mapBoards[iBoards];
	                if (item.name.toLowerCase().search(rx) >= 0) {
	                    item.div.show();
	                    cShown++;
	                }
	                else {
	                    item.div.hide();
	                }
	            }
	            bodyElem.height(hCur); //resetting height is a hack to workarround a chrome bug that doesnt repaint scrollbars sometimes as height changes.
	            if (cTotal > 0 && (val.length > 2 || (val.length > 0 && cShown == 0))) {
	                g_mapCards = {}; //reset
	                fillCardResults(cardResults, val, false, null, cSearchesTotal);
	            } else {
	                cardResults.empty();
	                $("#agile_popup_cards_comment_container").empty();
	                $("#agile_popup_cards_powerfind_container").empty();
	            }
	        }, 1);
	    }

	    searchBox.on('input', function () {
	        doSearch();
	    });

	    if (searchBox.val().length > 0) //happens if you 1) type, 2) zoom-in weekly report, 3) back
	        doSearch();

	    //fill sums of S/E
	    var sql2 = "SELECT b.idBoard, sum(h.spent) as spent, sum(h.est) as est FROM boards AS b JOIN history as H ON b.idBoard=h.idBoard GROUP BY h.idBoard";
	    getSQLReport(sql2, [], function (response2) {
	        if (response2.status != STATUS_OK) {
	            status.text(response2.status);
	            status.show();
	            return;
	        }

	        var rows = response2.rows;
	        var i = 0;
	        for (; i < rows.length; i++) {
	            var row = rows[i];
	            var elemCur = mapBoards[row.idBoard];
	            if (!elemCur)
	                continue;
	            var spentDisplay;
	            var estDisplay;

	            if (spentDisplay < 10)
	                spentDisplay = row.spent;
	            else
	                spentDisplay = Math.round(row.spent);

	            if (estDisplay < 10)
	                estDisplay = row.est;
	            else
	                estDisplay = Math.round(row.est);
	            elemCur.se.text(parseFixedFloat(spentDisplay) + " / " + parseFixedFloat(estDisplay));
	            if (row.spent >= 0 && row.est > 0)
	                elemCur.div.attr("title", elemCur.div.attr("title") + "\n" + Math.round(row.spent * 100 / row.est) + "% complete");
	        }
	    });
	    //	}, 100);
	});
}

function fillCardResults(divResults, val, bSearchComments, chSplit, cSearchCur) {
	bSearchComments = bSearchComments || false;
	var bAndSearch = (chSplit!==undefined && chSplit!=null);
	var cDays = 365; //at most look back one year review zig: make it an option
	if (bSearchComments)
		cDays = Math.round(cDays / 3); //4 months of data
	var sDateLimit = Math.round((Date.now() / 1000) - 60 * 60 * 24 * cDays);
	var paramsSql = [sDateLimit];

	var sql = "SELECT c.idCard, c.name AS nameCard, b.name as nameBoard, c.idBoard, MAX(cb.date) as maxDate FROM cards AS c LEFT OUTER JOIN cardbalance AS cb ON c.idCard=cb.idCard JOIN boards AS b ON b.idBoard=c.idBoard WHERE  (cb.date is NULL or cb.date >?) AND LOWER(c.name) GLOB ? GROUP BY c.idCard ORDER BY  " + (g_bEnableTrelloSync ? "c.dateSzLastTrello" : "maxDate") + " DESC LIMIT 10";
	
	if (bSearchComments)
		sql = "SELECT h.comment, c.idCard, c.name AS nameCard, b.name as nameBoard, c.idBoard, MAX(h.date) as maxDate FROM cards AS c JOIN history AS h ON c.idCard=h.idCard JOIN boards AS b ON b.idBoard=h.idBoard WHERE h.date>? AND LOWER(h.comment) GLOB ? GROUP BY c.idCard ORDER BY maxDate DESC LIMIT 10";

	if (bAndSearch) { //review zig: cant set together with bSearchComments
	    sql = "SELECT c.idCard, c.name AS nameCard, b.name as nameBoard, c.idBoard, MAX(cb.date) as maxDate FROM cards AS c LEFT OUTER JOIN cardbalance AS cb ON c.idCard=cb.idCard JOIN boards AS b ON b.idBoard=c.idBoard WHERE  (cb.date is NULL or cb.date >?) ";
		var parts = val.split(chSplit);
		if (parts.length < 2) {
			divResults.empty();
			done();
			return;
		}
		var i = 0;
		for (; i < parts.length; i++) {
			sql += "AND LOWER(c.name) GLOB ? ";
			paramsSql.push("*" + parts[i] + "*");
		}
		sql += "GROUP BY c.idCard ORDER BY " + (g_bEnableTrelloSync ? "c.dateSzLastTrello" : "maxDate") + " DESC LIMIT 10";
	} else {
		paramsSql.push("*" + val + "*");
	}

	function done() {
	    function processEachCard(idCard, obj) {
	        if (obj && obj.msEnd == null && obj.msStart) {
	            var data = g_mapCards[idCard];
	            if (data) {
	                data.sibling.addClass("agile_board_dashboardItem_row2_fixWidth");
	                var imgTimer = $("<img title='Timer'>").attr("src", chrome.extension.getURL("images/timer-sm-on.png")).addClass("agile_img_popup agile_noOpacity");
	                imgTimer.prop("title", "Active timer. Click this card to view or stop it.");
	                data.item.append(imgTimer);
	            }
	        }
	    }

	    var rgHashes = [];
	    var rgIds = [];
	    for (var idCard in g_mapCards) {
	        rgHashes.push(getCardTimerSyncHash(idCard));
	        rgIds.push(idCard);
	    }

	    chrome.storage.sync.get(rgHashes, function (obj) {
	        for (var i=0; i<rgIds.length; i++){
	            processEachCard(rgIds[i], obj[rgHashes[i]]);
	        }
	    });
	}


	getSQLReport(sql, paramsSql, function (response) {
		if (cSearchCur!=g_cSearchTotal)
			return; //stop, will be processed again
		var rows = response.rows;
		var i = 0;
		var bCalledAgain = false;
		var list = $("<div style='background-color:#DBDBDB;padding-top:1px;border-radius:4px;padding-bottom:5px;'>");
		var cAdded = 0;
		for (; rows && i < rows.length; i++) {
			var row = rows[i];
			if (g_mapCards[row.idCard])
				continue;
			var item = $("<div tabindex=0>").addClass("agile_board_dashboardItem").addClass("agile_board_dashboardItem_Card");
			var date = null;

			if (row.maxDate != null)
			    date = new Date(row.maxDate * 1000).toLocaleDateString();
			else
			    date = "never";
			var a1 = $("<div class='agile_board_dashboardItem_name agile_board_dashboardItem_nameCard'>").text(row.nameCard);
			var a2 = $("<div class='agile_board_dashboardItem_row2'>").text(row.nameBoard);
			//setPopupClickHandler(imgReport, urlReport);
			var titleUse = null;
			if (bSearchComments)
				titleUse = row.nameCard + "\nNote: " + row.comment + "\nOn: " + date;
			else
			    titleUse = row.nameCard + "\nLast S/E on: " + date;

			item.attr("title", titleUse);
			setPopupClickHandler(item, "https://trello.com/c/" + row.idCard);
			item.append(a1);
			item.append(a2);

			list.append(item);
			g_mapCards[row.idCard] = {sibling:a2, item:item};
			cAdded++;
		}

		var bEmpty = (!rows || cAdded == 0);

		divResults.empty();
		if (!bEmpty) {
			if (bSearchComments)
				divResults.append($("<b>Found in Plus comments:</b>"));
			else if (bAndSearch)
				divResults.append($("<b>Found by juggling search terms:</b>"));
			divResults.append(list);
		}
		if (bSearchComments) {
			var chSplit="*";
			if (val.indexOf(chSplit) < 0)
				chSplit = " ";

			var containerPf = $("#agile_popup_cards_powerfind_container");
			fillCardResults(containerPf, val, false, chSplit, cSearchCur);
			bCalledAgain = true;
		}
		else if (!bAndSearch) {
		    fillCardResults($("#agile_popup_cards_comment_container"), val, true, null, cSearchCur);
		    bCalledAgain = true;
		}

		if (!bCalledAgain)
		    done();
	});
}

function getSQLReport(sql, values, callback) {
	getSQLReportShared(sql, values, callback, function onError(status) {
		showError(status);
	});
}

