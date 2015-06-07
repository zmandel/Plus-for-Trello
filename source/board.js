var g_minutesExpireBoardTotalCache = (60 * 24 * 7 * 2);	//after this many, board total cache is deleted.
var g_totalSpentAllBoards = 0;
var g_totalEstimateAllBoards = 0;

function updateBoardPageTotals() {
    if (!bAtTrelloHome()) //other pages, like org. boards also shows the board elements (thanks MarkF!)
        return;
	g_totalSpentAllBoards = 0;
	g_totalEstimateAllBoards = 0;
	var boardContainers = $("#content").find(".js-open-board");
	var i = 0;
	for (; i < boardContainers.length; i++) {
		var elem = null;
		if (g_bNewTrello)
			elem = $(boardContainers[i]).find(".board-list-item-name")[0];
		else
			elem = $(boardContainers[i]).children(".item-name")[0];
		updateBoardUIElem($(elem));
	}
}

//review zig: cleanup naming convention for callbacks, responses, sendResponse, etc. needs to be clear when its data, when its a function, and what params the function takes
function updateCardsWorker(boardCur, responseParam, bShowBoardTotals, defaultSE, idBoardParam, mapIdCardToSE) {

    var bResetHtmlLast = false; //cheap way to get this to retry later

    function response() {
        if (bResetHtmlLast)
            g_strPageHtmlLast = "";
        else
            g_strPageHtmlLast = document.body.innerHTML; //reset page detector
        if (responseParam)
            responseParam();
    }

    assert(g_bCheckedbSumFiltered !== null); //options must be loaded
    assert(bShowBoardTotals !== undefined);

    var globalTotalSpent = 0;
    var globalTotalEstimation = 0;
    var globalTotalSpentFiltered = 0;
    var globalTotalEstimationFiltered = 0;
    var idBoard = getIdBoardFromUrl(document.URL);

    if (idBoard != null && g_strLastBoardNameIdSaved != boardCur) { //REVIEW V3
        setUpdatingGlobalSums(boardCur, true);
        bShowBoardTotals = false;
        doSaveBoardValues({ idBoard: idBoard }, getKeyForIdFromBoard(boardCur));
        g_strLastBoardNameIdSaved = boardCur;
    }
    else {
        setUpdatingGlobalSums(boardCur, bShowBoardTotals);
    }


    var rgKeysTimers = [];  //these accumulate timer info so it can later make a single storage.get call
    var mapKeysTimersData = {};
    var bFilteredCard = false;
    var bHasHiddenCard = false;
    var bTourRunning = isTourRunning();

    function forEachList(i, el) {
        if (bResetHtmlLast)
            return;

        var h2 = null;
        if (g_bNewTrello)
            h2 = $(el);
        else
            h2 = $(el).children('h2');

        var bExcludeList = (h2.text().toLowerCase().search(g_regexExcludeList) >= 0);
        var listCur = h2.parent();
        var cards = List.cards(el);
        var divSE = null;

        var totalEstimation = 0;
        var totalSpent = 0;
        var totalEstimationFiltered = 0;
        var totalSpentFiltered = 0;
        var estimationBox = null;
        var spentBox = null;
        function forEachCard(k, card) {
            try {
                if (bResetHtmlLast)
                    return;
                forEachCardWorker(k, card);
            }
            catch (e) {
                logException(e);
            }
        }


        function forEachCardWorker(k, card) {
            var title = null;
            var originalTitleTag = null;
            var updateTotals = null;
            var estimation = null;
            var spent = null;
            var hashtags = [];
            var bCardIsVisible = false;

            //note: the "partx" functions are here to more easily detect performance issues using chrome profiling
            function updateTitle() {

                function part1() {
                    originalTitleTag = Card.titleTag(card);
                    function isElemVisible(elem) {
                        return (!$(elem).hasClass("hide")); //note: changed from using jquery visibility method, which eventually reads a width/height and strangely takes a long time in chrome
                    }

                    bCardIsVisible = isElemVisible(card);
                    updateTotals = (!g_bCheckedbSumFiltered || bCardIsVisible);
                    if (!updateTotals)
                        bFilteredCard = true;

                    if (!bCardIsVisible)
                        bHasHiddenCard = true;
                }

                function part2() {
                    if (g_bChangeCardColor)
                        LabelsManager.update($(card));
                    //
                    // Get the estimated scrum units
                    //
                    var nodeTitle = originalTitleTag.contents().filter(function () {
                        return this.nodeType == 3;
                    });
                    if (nodeTitle && nodeTitle.length > 0)
                        title = nodeTitle[0].nodeValue;
                    else {
                        title = "";  //hack. some cases e.g. user moving the card while this runs, returns no node
                        bResetHtmlLast = true;
                    }
                }

                part1();
                part2();
            }


            function updateSE() {
                if (title == "") {  //special case when couldnt parse it
                    estimation = 0;
                    spent = 0;
                    hashtags = [];
                    return;
                }

                var idCardCur = getIdCardFromUrl(originalTitleTag[0].href);
                var se = parseSE(title, false, g_bAcceptSFT);
                var seFromDb = mapIdCardToSE[idCardCur];

                if (seFromDb) {
                    se.estimate = parseFixedFloat(seFromDb.e);
                    se.spent = parseFixedFloat(seFromDb.s);
                } else if (isBackendMode()) {
                    se.estimate = 0;
                    se.spent = 0;
                }

                estimation = se.estimate;
                totalEstimationFiltered += updateTotals ? estimation : 0;
                totalEstimation += estimation;
                //
                // Get the spent scrum units
                //
                spent = se.spent;
                totalSpentFiltered += updateTotals ? spent : 0;
                totalSpent += spent;
                //
                // Get the card hashtag list
                //
                hashtags = Card.hashtagsFromTitle(title);

                //
                // Show a title w/o the markup
                //

                var bRecurring = (se.titleNoSE.indexOf(TAG_RECURRING_CARD) >= 0);
                var cloneTitleTag = null;
                var originalTitleSiblings = originalTitleTag.siblings('a.agile_clone_title');
                if (originalTitleSiblings.size() == 0) {
                    cloneTitleTag = originalTitleTag.clone();
                    originalTitleTag.addClass('agile_hidden');
                    cloneTitleTag.addClass('agile_clone_title');
                    originalTitleTag.after(cloneTitleTag);
                } else {
                    cloneTitleTag = originalTitleSiblings.eq(0);
                }

                var elRecurring = cloneTitleTag.children(".agile_recurring");

                if (idCardCur && bCardIsVisible) {
                    var hashTimer = getCardTimerSyncHash(idCardCur);
                    rgKeysTimers.push(hashTimer);
                    mapKeysTimersData[hashTimer] = { titleTag: cloneTitleTag, idCard: idCardCur };
                }

                var cleanTitle = se.titleNoSE;
                if (bRecurring) {
                    cleanTitle = cleanTitle.replace(/\[R\]/g, "");
                    if (elRecurring.length != 0)
                        elRecurring.show();
                    else {
                        var imgRecurring = $("<img>").attr("src", chrome.extension.getURL("images/recurring.png"));
                        imgRecurring.attr("title", TAG_RECURRING_CARD);
                        var spanRecurring = $("<span>").addClass("agile_recurring");
                        spanRecurring.append(imgRecurring);
                        cloneTitleTag.append(spanRecurring);
                    }
                }
                else {
                    if (elRecurring.length != 0)
                        elRecurring.hide();
                }

                var ctlUpdate = cloneTitleTag.contents()[1];
                if (ctlUpdate !== undefined)
                    ctlUpdate.textContent = cleanTitle;
                else {
                    var test = 1; //for breakpoint
                }
            }

            updateTitle();
            updateSE();

            //
            // Badges
            //
            var badges = $(card).children('.list-card-details').eq(0).children('div.badges');
            var bNoBadges = (spent == 0 && estimation == 0);

            if (bNoBadges && bTourRunning && k == 0)
                bNoBadges = false;

            // Estimate
            var estimateBadge = badges.children('div.' + BadgeFactory.estimateBadgeClass());
            if (estimateBadge.size() == 0) {
                if (!bNoBadges) {
                    estimateBadge = BadgeFactory.makeEstimateBadge();
                    badges.prepend(estimateBadge);
                }
            }
            else {
                if (bNoBadges)
                    estimateBadge.remove();
            }
            if (!bNoBadges)
                estimateBadge.contents().last()[0].textContent = estimation;

            // Spent
            var spentBadge = badges.children('div.' + BadgeFactory.spentBadgeClass());

            if (spentBadge.size() == 0) {
                if (!bNoBadges) {
                    spentBadge = BadgeFactory.makeSpentBadge();
                    badges.prepend(spentBadge);
                }
            }
            else {
                if (bNoBadges)
                    spentBadge.remove();
            }
            if (!bNoBadges)
                spentBadge.contents().last()[0].textContent = spent;

            // Hashtags
            var hashtagsJq = badges.children('.agile_hashtags');
            if (hashtagsJq.length == 0) {
                hashtagsJq = $('<span />').addClass('agile_hashtags');
                badges.append(hashtagsJq);
            }
            hashtagsJq.html('');
            for (var i = 0; i < hashtags.length; i++) {
                hashtagsJq.append($('<span />').
                        addClass(i == 0 ? 'badge agile_badge agile_badge_hashtag_primary' : 'badge agile_badge agile_badge_hashtag_secondary').
                        html(hashtags[i]));
            }
        }

        //
        // Estimation box
        //
        var h2SiblingsEstimationBox = listCur.find('.agile_estimation_box');
        if (h2SiblingsEstimationBox.size() < 1) {
            estimationBox = InfoBoxFactory.makeInfoBox(ESTIMATION);
            divSE = $("<div class='agile_listboard_header' style='width:100%'>");
            var linkCreateCard = $("<a href='#' title='Add a card...'>").addClass("js-open-card-composer agile-open-card-composer").text("+"); //js-open-card-composer makes it open the trello box
            divSE.append(estimationBox);
            divSE.append(linkCreateCard);
        } else {
            estimationBox = h2SiblingsEstimationBox.eq(0);
            divSE = estimationBox.parent();
        }

        //
        // Spent box
        //	
        var h2SiblinsSpentBox = listCur.find('.agile_spent_box');
        if (h2SiblinsSpentBox.size() == 0) {
            spentBox = InfoBoxFactory.makeInfoBox(SPENT);
            //adding the boxes changes the list height, trello doesnt catch this until you resize the window, so we adjust it here.
            //if we dont do this, the bottom of the list (with the 'add card' link) goes too low.
            //we use estimation height because is the one already visible.
            divSE.prepend(spentBox);
            listCur.append(divSE); //not h2.after(divSE) because that would cause the "subscribed to list" icon to drop below
        } else {
            spentBox = h2SiblinsSpentBox.eq(0);
        }

        cards.each(forEachCard);
        totalEstimation = parseFixedFloat(totalEstimation);
        totalSpent = parseFixedFloat(totalSpent);
        totalEstimationFiltered = parseFixedFloat(totalEstimationFiltered);
        totalSpentFiltered = parseFixedFloat(totalSpentFiltered);
        if (totalEstimation == 0 && totalSpent == 0 && !bTourRunning)
            divSE.hide();
        else {
            estimationBox.html(totalEstimationFiltered);
            spentBox.html(totalSpentFiltered);
            var diffR = parseFixedFloat(totalEstimationFiltered - totalSpentFiltered);
            var titleSE = "R:" + diffR;
            if (totalEstimationFiltered > 0 && totalSpentFiltered >= 0)
                titleSE = titleSE + " (" + Math.round(totalSpentFiltered * 100 / totalEstimationFiltered) + "% complete)";
            divSE.prop("title", titleSE);
            divSE.show();
        }
        if (!bExcludeList) {
            globalTotalEstimation += totalEstimation;
            globalTotalSpent += totalSpent;
            globalTotalEstimationFiltered += totalEstimationFiltered;
            globalTotalSpentFiltered += totalSpentFiltered;
        }
    }

    List.all().each(forEachList);
    if (bResetHtmlLast) {
        response();
        return;
    }
    globalTotalEstimation = parseFixedFloat(globalTotalEstimation);
    globalTotalSpent = parseFixedFloat(globalTotalSpent);
    globalTotalEstimationFiltered = parseFixedFloat(globalTotalEstimationFiltered);
    globalTotalSpentFiltered = parseFixedFloat(globalTotalSpentFiltered);

    var bShowHeaderStuff = bTourRunning; //when a tour runs, show all elements
    var spanFilter = $(".agile_plus_filter_span");
    if (!bShowHeaderStuff && globalTotalEstimation == 0 && globalTotalSpent == 0) {
        remainingTotal.hide();
        spentTotal.hide();
        estimationTotal.hide();
        spanFilter.hide();
    }
    else {
        var estimationValueSet = globalTotalEstimationFiltered;
        var spentValueSet = globalTotalSpentFiltered;

        if (defaultSE && !bShowBoardTotals && !bFilteredCard) { //use the cache
            estimationValueSet = defaultSE.e;
            spentValueSet = defaultSE.s;
        }
        var difference = parseFixedFloat(estimationValueSet - spentValueSet);

        estimationTotal.html(Card.estimationLabelText(estimationValueSet));
        spentTotal.html(Card.spentLabelText(spentValueSet));
        remainingTotal.html(Card.remainingLabelText(difference));


        var classPartialTotals = 'agile_box_partialUpdate';
        if (bShowBoardTotals) {
            estimationTotal.removeClass(classPartialTotals);
            spentTotal.removeClass(classPartialTotals);
            remainingTotal.removeClass(classPartialTotals);
        } else {
            estimationTotal.addClass(classPartialTotals);
            spentTotal.addClass(classPartialTotals);
            remainingTotal.addClass(classPartialTotals);
        }

        if (globalTotalEstimationFiltered > 0 && globalTotalSpentFiltered >= 0) {
            var titleR = Math.round(globalTotalSpentFiltered * 100 / globalTotalEstimationFiltered) + "% complete";
            remainingTotal.prop("title", titleR);
            estimationTotal.prop("title", titleR);
            spentTotal.prop("title", titleR);
        }
        estimationTotal.show();
        spentTotal.show();
        remainingTotal.show();
        bShowHeaderStuff = true;
    }
    setupBurnDown(bShowHeaderStuff, bHasHiddenCard || bTourRunning);
    var bSetTimeout = false;
    if (g_globalTotalSpent != null && (g_globalTotalSpent != globalTotalSpent || g_globalTotalEstimation != globalTotalEstimation)) {
        bSetTimeout = true;
    }
    g_globalTotalSpent = globalTotalSpent;
    g_globalTotalEstimation = globalTotalEstimation;
    updateBoardSEStorage(boardCur, globalTotalSpent, globalTotalEstimation);
    if (bSetTimeout)
        setTimeout(function () { updateSsLinksDetector(globalTotalSpent, globalTotalEstimation); }, 300); //let it breathe.

    //process card timer icons on all cards
    if (rgKeysTimers.length > 0) {
        chrome.storage.sync.get(rgKeysTimers, function (obj) {
            var iTimer = 0;
            for (; iTimer < rgKeysTimers.length; iTimer++) {
                var hashTimer = rgKeysTimers[iTimer];
                var stored = obj[hashTimer];
                var map = mapKeysTimersData[hashTimer];
                processCardTimerIcon(stored, map.titleTag, map.idCard);
            }
            response();
        });
    }
    else {
        response();
    }

}

function updateWorker(bShowBoardTotals) {
    updateNewTrelloFlag();
    HelpButton.display();
    InfoBoxManager.update();
    if (!g_bForceUpdate && isTimerRunningOnScreen())
        return;

    var boardCur = getCurrentBoard();
    var bOnBoardPageWithoutcard = (getIdBoardFromUrl(document.URL) != null);
    //note: when a card is up we want to avoid reparsing the board, user is typing etc
    if (boardCur != null && (g_bForceUpdate || bOnBoardPageWithoutcard)) {
        updateCards(boardCur, null, bShowBoardTotals);
    }
    g_bNeedsUpdate = false;
    g_bForceUpdate = false;
}

var g_strLastBoardNameIdSaved = null;

function removeTimerForCard(idCardParsed) {
    var hash = getCardTimerSyncHash(idCardParsed);
    chrome.storage.sync.get([SYNCPROP_ACTIVETIMER, hash], function (obj) {
        var bDeleteActive = false;
        if (obj[SYNCPROP_ACTIVETIMER] !== undefined && obj[SYNCPROP_ACTIVETIMER] == idCardParsed)
            bDeleteActive = true;
        var rgPropsRemove = [];
        if (obj[hash])
            rgPropsRemove.push(hash);
        if (bDeleteActive)
            rgPropsRemove.push(SYNCPROP_ACTIVETIMER);

        if (rgPropsRemove.length == 0)
            return;
        chrome.storage.sync.remove(rgPropsRemove, function () {
            if (chrome.runtime.lastError !== undefined)
                return;
            updateTimerChromeIcon();
            if (bDeleteActive)
                findNextActiveTimer();
            sendDesktopNotification("Deleted timer for this card.", 10000);
        });
    });
}

function updateCards(boardCur, responseParam, bShowBoardTotals, bRecalcAgedCards) {
    if (bRecalcAgedCards === undefined)
        bRecalcAgedCards = true;

    function response() {
        if (bRecalcAgedCards)
            doShowAgedCards(g_bShowAllItems);

        if (responseParam)
            responseParam();
    }
    var elemDetect = null;
    if (boardCur == null || remainingTotal == null) {
        var idCardParsed = getIdCardFromUrl(document.URL);
        if (!boardCur && !idCardParsed && document.URL.toLowerCase() == "https://trello.com/plusreset") {
            var linkReset = $("#plusEmergencyReset");
            elemDetect = $(".big-message h1");
            if (linkReset.length == 0 && elemDetect.length > 0) {
                elemDetect.text("");
                $(".big-message p").text("");
                linkReset = $("<button id='plusEmergencyReset'>click to perform a Plus emergency 'Reset'</button>");
                $(".big-message").append(linkReset);
                linkReset = $("#plusEmergencyReset");
                linkReset.click(function (e) {
                    linkReset.prop('disabled', true);
                    linkReset.hide();
                    e.preventDefault();
                    ResetPlus();
                });
            }
        }

        if (boardCur == null && idCardParsed) {
            //see if its a deleted card
            elemDetect = $(".big-message h1");
            if (elemDetect.length > 0 && elemDetect[0].innerText.indexOf("Card not found") >= 0) {
                removeTimerForCard(idCardParsed);
            }
        }
        if (response)
            response();
        return;
    }

    var keySE = getKeySEFromBoard(boardCur);
    var keyId = getKeyForIdFromBoard(boardCur);
    var idBoard = getIdBoardFromUrl(document.URL);
    var idCard = getIdCardFromUrl(document.URL);
    var mapIdCardToSE = {};

    chrome.storage.local.get([keySE, keyId], function (obj) {
        var valueSE = obj[keySE];
        var valueId = obj[keyId];

        if (!idBoard && valueId && valueId.idBoard)
            idBoard = valueId.idBoard;

        if (!idBoard) {
            FindIdBoardFromBoardName(boardCur, idCard, function (idBoardFound) {
                if (idBoardFound) {
                    idBoard = idBoardFound;
                    doIt();
                }
            });
        } else {
            doIt();
        }

        function doIt() {
            
            if (true) {
                var sql = "select CB.idCard, SUM(CB.spent) as sumSpent, SUM(CB.est) as sumEst FROM CARDBALANCE AS CB join CARDS AS C ON CB.idCard=C.idCard WHERE C.idBoard=? \
                            group by CB.idCard";
                getSQLReport(sql, [idBoard],
                    function (response) {
                        response.rows.forEach(function (row) {
                            mapIdCardToSE[row.idCard] = { s: row.sumSpent, e: row.sumEst };
                        });
                        callupdateCardsWorker();
                    });
            } else {
                callupdateCardsWorker();
            }

            function callupdateCardsWorker() {
                try {
                    updateCardsWorker(boardCur, response, bShowBoardTotals, valueSE, idBoard, mapIdCardToSE);
                }
                catch (e) {
                    logException(e);
                }
            }

        }
    });
}

function setUpdatingGlobalSums(boardCur, bUpdating) {

    if (g_bUpdatingGlobalSums !== null && g_bUpdatingGlobalSums == bUpdating)
        return;
    g_bUpdatingGlobalSums = bUpdating;
    if (!bUpdating) {
        //catch case where we used a cached sum and trello didnt change so we didnt refresh the sums with the real value.
        setTimeout(function () {
            if (g_bUpdatingGlobalSums)
                updateCards(boardCur, null, true);
        }, 3000);
    }
}

function processCardTimerIcon(stored, cloneTitleTag, idCard) {
    var imgTimer = cloneTitleTag.find('.agile_timer_icon_small');
    if (stored !== undefined && stored.msEnd == null) {  //show
        if (imgTimer.length == 0) {
            imgTimer = $("<img>").attr("src", chrome.extension.getURL("images/iconspent.png")).addClass('agile_timer_icon_small');
            imgTimer.attr("title", "Active timer");
            var span = $("<span>");
            span.append(imgTimer);
            cloneTitleTag.append(span);
            showTimerPopup(idCard);
        }
        else {
            imgTimer.parent().show();
        }
    } else if (imgTimer.length > 0)    //hide
        imgTimer.parent().hide();
}


function getKeyForIdFromBoard(board) {
    //note here and other getkey functions: use ":" as a special character in prefixes that need to be searched later or could colide with other generated keys.
	return "idb:" + board;
}

function getKeySEFromBoard(board) {
	return "b:" + board;
}

function updateBoardUIElem(boardElem) {
	var board = boardElem.text();
	var parent = boardElem.parent();
	if (g_bNewTrello)
		parent = parent.parent();

	if (parent.hasClass("agile-card-listitem"))
		return;
	var key = getKeySEFromBoard(board);
	chrome.storage.local.get(key, function (obj) {
		var value = obj[key];
		var bHide = true;
		if (value !== undefined) {
		    if (((Date.now()) - value.t) / 1000 / 60 < g_minutesExpireBoardTotalCache) {
				addBadgesToBoardElem(boardElem, value);
				bHide = false;
			}
			else
				chrome.storage.local.remove(key);
		}
		if (g_bShowAllItems)
			bHide = false;

		if (bHide)
			parent.parent().hide();
		else
			parent.parent().show();
	});
}

function addBadgesToBoardElem(boardElem, value) {
	var container = boardElem.parent();
	var list = container.find(".agile_spent_box");
	var spentBadge = null;
	if (list.size() == 0)
		spentBadge = InfoBoxFactory.makeInfoBox(SPENT);
	else
		spentBadge = list;

	spentBadge.html(parseFixedFloat(value.s, false, true)); //one decimal
	g_totalSpentAllBoards += value.s;
	list = container.find(".agile_estimation_box");
	var estimateBadge = null;
	if (list.size() == 0)
		estimateBadge = InfoBoxFactory.makeInfoBox(ESTIMATION);
	else
		estimateBadge = list;
	estimateBadge.html(parseFixedFloat(value.e,false,true)); //one decimal
	container.prepend(estimateBadge);
	container.prepend(spentBadge);
	
	g_totalEstimateAllBoards += value.e;
}

function updateBoardSEStorage(boardCur, spent, estimate) {
	var date = new Date();
	var key = getKeySEFromBoard(boardCur);
	var value = { s: spent, e: estimate, t: date.getTime() }; //make the names small so it consumes less storage quota
	doSaveBoardValues(value, key);
}

function doSaveBoardValues(value, key) {
	//http://developer.chrome.com/extensions/storage.html
	var pair = {};
	pair[key] = value;
	chrome.storage.local.set(pair, function () { });
}



var g_bNewTrello = true; //REVIEW zig: cleanup once all users move to this

function getCurrentBoard() {
	var boardNameContainerElem = $(".board-name");
	if (boardNameContainerElem.length == 0) { //timing sensitive
		boardNameContainerElem = $(".board-header-btn-name");
		if (boardNameContainerElem.length == 0)
			return null;
		g_bNewTrello = true;
	} 
	var boardNameElem = boardNameContainerElem.children(g_bNewTrello ? ".board-header-btn-text" : ".text");
	if (boardNameElem.length == 0)
		return null;
	var ret = boardNameElem.text().trim();
	if (ret == "")
		ret = null;
	return ret;
}

var List = {
    all: function () {
        if (g_bNewTrello)
            return $('.list-header-name');
        return $('div.list-title');
    },
    cards: function (list) {
        var cardsContainer = $(list).parent();
        if (!g_bNewTrello)
            cardsContainer = cardsContainer.siblings('div.list-card-area').children('div.list-cards').eq(0);
        else
            cardsContainer = cardsContainer.siblings('div.list-cards').eq(0);
        var cards = $(cardsContainer).children('div.list-card');
        return cards;
    }
};

var InfoBoxManager = {
    update: function () {
        var boardHeader = null;

        if (g_bNewTrello)
            boardHeader = $('div.board-header');
        else
            boardHeader = $('div#board-header');


        if (boardHeader.length == 0)
            return;

        if (remainingTotal.parent()[0] === boardHeader[0]) //optimize
            return;

        remainingTotal.hide();
        estimationTotal.hide();
        spentTotal.hide();
        boardHeader.append(remainingTotal);
        boardHeader.append(estimationTotal);
        boardHeader.append(spentTotal);


        var burndownLink = $(".agile_plus_burndown_link");
        if (burndownLink.length != 0)
            boardHeader.append(burndownLink);

        var reportLink = $(".agile_plus_report_link");
        if (reportLink.length != 0)
            boardHeader.append(reportLink);

        var spanFilter = $(".agile_plus_filter_span");
        if (spanFilter.length != 0)
            boardHeader.append(spanFilter);

    }
};

var InfoBoxFactory = {
    makeInfoBox: function (type) {
        var box = $('<div></div>').addClass('agile_box');
        if (type == ESTIMATION) {
            return box.addClass('agile_estimation_box').html('0');
        } else if (type == SPENT) {
            return box.addClass('agile_spent_box').html('0');
        }
    },
    makeTotalInfoBox: function (type) {
        var box = $('<div></div>').addClass('agile_box').addClass('agile_total_box');
        if (type == ESTIMATION) {
            return box.addClass('agile_estimation_box').html('E: 0');
        } else if (type == SPENT) {
            return box.addClass('agile_spent_box').html('S: 0');
        } else if (type == REMAINING) {
            return box.addClass('agile_remaining_box').html('R: 0');
        }
    }
};

var BadgeFactory = {
    baseBadge: function () {
        return $('<div></div>').addClass('badge');
    },
    makeEstimateBadge: function () {
        var b = this.baseBadge().addClass('agile_badge').addClass(this.estimateBadgeClass());
        b.append('0');
        return b;
    },
    makeSpentBadge: function () {
        var b = this.baseBadge().addClass('agile_badge').addClass(this.spentBadgeClass());
        b.append('0');
        return b;
    },
    makeRemainingBadge: function () {
        var b = this.baseBadge().addClass('agile_badge').addClass(this.remainingBadgeClass());
        b.append('0');
        return b;
    },
    estimateBadgeClass: function () {
        return "agile_badge_estimate";
    },
    spentBadgeClass: function () {
        return "agile_badge_spent";
    },
    remainingBadgeClass: function () {
        return "agile_badge_remaining";
    }
};

