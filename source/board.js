/// <reference path="intellisense.js" />

var g_regexRecurringTitleReplace = /\[R\]/g;

function updateBoardUI() {
    var boardCur = getCurrentBoard();
    if (boardCur)
        updateCards(boardCur, null, true, false);
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
    var bTourRunning = isTourRunning() && !g_bNoSE;

    function forEachList(i, el) {
        if (bResetHtmlLast)
            return;

        var h2 = h2 = $(el);
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
        var remainBox = null;

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

            
            function bUpdateTitle() {
                originalTitleTag = Card.titleTag(card);
                if (originalTitleTag.length == 0) {
                    bResetHtmlLast = true;
                    return false;
                }

                function isElemVisible(elem) {
                    return (!$(elem).hasClass("hide")); //note: changed from using jquery visibility method, which eventually reads a width/height and strangely takes a long time in chrome
                }

                bCardIsVisible = isElemVisible(card);
                updateTotals = (!g_bCheckedbSumFiltered || bCardIsVisible);
                if (!updateTotals)
                    bFilteredCard = true;

                if (!bCardIsVisible)
                    bHasHiddenCard = true;

                if (g_bChangeCardColor)
                    LabelsManager.update($(card));

                var nodeTitle = originalTitleTag.contents().filter(function () { //this method tries to cover cases when trello changes their html
                    return this.nodeType == 3;
                });
                if (nodeTitle && nodeTitle.length > 0)
                    title = nodeTitle[0].nodeValue;
                else {
                    title = "";  //hack. some cases e.g. user moving the card while this runs, returns no node
                    bResetHtmlLast = true;
                    return false;
                }
                return true;
            }


            function updateSE() {
                if (title == "" || idCardCur==null) {  //special case when couldnt parse it
                    estimation = 0;
                    spent = 0;
                    hashtags = [];
                    return;
                }

                var se = parseSE(title, false);
              
                if (g_dimension == VAL_COMBOVIEWKW_KWONLY) {
                    se.estimate = 0;
                    se.spent = 0;
                }

                var seFromDb = mapIdCardToSE[idCardCur];

                if (seFromDb) {
                    se.estimate = parseFixedFloat(seFromDb.e);
                    se.spent = parseFixedFloat(seFromDb.s);
                } else if (isBackendMode()) {
                    se.estimate = 0;
                    se.spent = 0;
                }
                else if (se.spent != 0 || se.estimate != 0)
                    bSEFromTitle = true;
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

                bRecurring = (se.titleNoSE.indexOf(TAG_RECURRING_CARD) >= 0);
                var cloneTitleTag = null;
                var originalTitleSiblings = originalTitleTag.siblings('.agile_clone_title');
                if (originalTitleSiblings.size() == 0) {
                    cloneTitleTag = originalTitleTag.clone();
                    originalTitleTag.addClass('agile_hidden');
                    cloneTitleTag.addClass('agile_clone_title');
                    originalTitleTag.after(cloneTitleTag);
                } else {
                    cloneTitleTag = $(originalTitleSiblings[0]);
                }

                var cleanTitle = se.titleNoSE;
                if (bRecurring)
                    cleanTitle = replaceString(cleanTitle,g_regexRecurringTitleReplace, "");
                
                var ctlContents = cloneTitleTag.contents();
                var ctlUpdate = null;

                if (ctlContents && ctlContents.length>=2)
                    ctlUpdate = ctlContents[1];

                if (!ctlUpdate) //trello might have changed their page. try with a regular <A> without children
                    ctlUpdate = cloneTitleTag[0];

                if (ctlUpdate && ctlUpdate.textContent != cleanTitle) {
                    if (!ctlUpdate.textContent || ctlUpdate.textContent.trim()!=(cleanTitle || "").trim())
                        ctlUpdate.textContent = cleanTitle;
                }
            }

            if (!bUpdateTitle())
                return;
            var idCardCur=getIdCardFromUrl(originalTitleTag[0].href || card.href);
            var bRecurring = false;
            var bSEFromTitle = false;
            updateSE();

            //
            // Card Badges
            //
            var badges = $(card).children('.list-card-details').eq(0).children('.badges');
            var bNoBadges = (spent == 0 && estimation == 0);
            var remain = parseFixedFloat(estimation - spent);
            var szClassSEFromTitle="agile_seFromTitle";

            if (bNoBadges && bTourRunning)
                bNoBadges = false;

        // Card Remaining
            var remainBadge = badges.children('.' + BadgeFactory.remainingBadgeClass());
            if (remainBadge.size() == 0) {
                if (!bNoBadges) {
                    remainBadge = BadgeFactory.makeRemainingBadge().addClass("agile_badge_cardback").attr('title', 'R');
                    badges.prepend(remainBadge);
                }
            }

            if (remainBadge.size() > 0)
                remainBadge.contents().last()[0].textContent = remain;
            if (bSEFromTitle)
                remainBadge.addClass(szClassSEFromTitle);
            else
                remainBadge.removeClass(szClassSEFromTitle);


       // Card Estimate
            var estimateBadge = badges.children('.' + BadgeFactory.estimateBadgeClass());
            if (estimateBadge.size() == 0) {
                if (!bNoBadges) {
                    estimateBadge = BadgeFactory.makeEstimateBadge().addClass("agile_badge_cardback").attr('title', 'E');
                    badges.prepend(estimateBadge);
                }
            }

            if (estimateBadge.size()>0)
                estimateBadge.contents().last()[0].textContent = estimation;
            if (bSEFromTitle)
                estimateBadge.addClass(szClassSEFromTitle);
            else
                estimateBadge.removeClass(szClassSEFromTitle);
            

        // Card Spent
            var spentBadge = badges.children('.' + BadgeFactory.spentBadgeClass());

            if (spentBadge.size() == 0) {
                if (!bNoBadges) {
                    spentBadge = BadgeFactory.makeSpentBadge().addClass("agile_badge_cardback").attr('title', 'S');
                    badges.prepend(spentBadge);
                }
            }
            
            if (spentBadge.size() > 0)
                spentBadge.contents().last()[0].textContent = spent;

            if (bSEFromTitle)
                spentBadge.addClass(szClassSEFromTitle);
            else
                spentBadge.removeClass(szClassSEFromTitle);

            //CARD
            elemShowHide(spentBadge, bNoBadges || g_bNoSE ? false : (!g_bProVersion ? true : g_serViews.card.s));
            elemShowHide(estimateBadge, bNoBadges || g_bNoSE || g_bNoEst ? false : (!g_bProVersion ? true : g_serViews.card.e));
            elemShowHide(remainBadge,  bNoBadges  || g_bNoSE || g_bNoEst ? false : (!g_bProVersion ? false : g_serViews.card.r));


            //Recurring
            if (true) {
                //always create so it maintains order respect to s/e and stuff to the right
                var elRecurring = badges.children(".agile_recurring");
                if (elRecurring.length == 0) {
                    var imgRecurring = $("<img class='agile_image_recurring_back'>").attr("src", chrome.extension.getURL("images/recurring.png"));
                    imgRecurring.attr("title", "Recurring card");
                    elRecurring = $("<span>").addClass("agile_recurring").hide();
                     elRecurring.append(imgRecurring);
                    badges.append(elRecurring);
                }

                if (bRecurring)
                        elRecurring.show();
                    else
                        elRecurring.hide();
            }

            // Hashtags
            var hashtagsJq = badges.children('.agile_hashtags');
            var bSameHashtags = false;
            if (hashtagsJq.length == 0) {
                hashtagsJq = $('<span />').addClass('agile_hashtags');
                badges.append(hashtagsJq);
            }
            else {
                var htChildren = hashtagsJq.children("span");
                if (htChildren.length == hashtags.length) {
                    var iChildren;
                    for (iChildren = 0; iChildren < htChildren.length; iChildren++) {
                        if (htChildren[iChildren].textContent != hashtags[iChildren])
                            break;
                    }
                    if (iChildren == htChildren.length)
                        bSameHashtags = true;
                }
                if (!bSameHashtags)
                    hashtagsJq.html('');
            }

            if (!bSameHashtags) {
                var spanLoop = null;
                for (var i = 0; i < hashtags.length; i++) {
                    spanLoop = $('<span />');
                    var hashLoop = hashtags[i];
                    hashtagsJq.append(spanLoop.
                            addClass(i == 0 ? 'badge agile_badge agile_badge_hashtag agile_badge_hashtag_primary' : 'badge agile_badge agile_badge_hashtag agile_badge_hashtag_secondary').
                            html(hashLoop));
                    if (hashLoop.indexOf("!") >= 0)
                        spanLoop.addClass("agile_badge_hashtag_shout");
                }
            }

            if (idCardCur && bCardIsVisible) {
                var hashTimer = getCardTimerSyncHash(idCardCur);
                rgKeysTimers.push(hashTimer);
                mapKeysTimersData[hashTimer] = { titleTag: badges, idCard: idCardCur };
            }
        }


        //
        // List Remaining box
        //	
        var h2SiblinsRemainBox = listCur.find('.agile_remaining_box');
        if (h2SiblinsRemainBox.size() == 0) {
            remainBox = InfoBoxFactory.makeInfoBox(REMAINING).hide().addClass("agile_badge_list");
            divSE = $("<span class='agile_listboard_header'>");
            divSE.append(remainBox);
        } else {
            remainBox = h2SiblinsRemainBox.eq(0);
            divSE = remainBox.parent();
        }

        //
        // List Estimation box
        //
        var h2SiblingsEstimationBox = listCur.find('.agile_estimation_box');
        if (h2SiblingsEstimationBox.size() < 1) {
            estimationBox = InfoBoxFactory.makeInfoBox(ESTIMATION).hide().addClass("agile_badge_list");
            divSE.prepend(estimationBox);
        } else {
            estimationBox = h2SiblingsEstimationBox.eq(0);
        }

        //
        // List Spent box
        //	
        var h2SiblinsSpentBox = listCur.find('.agile_spent_box');
        if (h2SiblinsSpentBox.size() == 0) {
            spentBox = InfoBoxFactory.makeInfoBox(SPENT).hide().addClass("agile_badge_list");
            divSE.prepend(spentBox);
            listCur.find(".list-header-extras").prepend(divSE); //not h2.after(divSE) because that would cause the "subscribed to list" icon to drop below

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
            remainBox.html(diffR);
            var titleSE = "R:" + diffR;
            if (totalEstimationFiltered > 0 && totalSpentFiltered >= 0)
                titleSE = titleSE + " (" + Math.round(totalSpentFiltered * 100 / totalEstimationFiltered) + "% complete)";
            divSE.prop("title", titleSE);
            divSE.show();
        }

        //LIST
        elemShowHide(spentBox, g_bNoSE? false : ( !g_bProVersion? true : g_serViews.list.s));
        elemShowHide(estimationBox, g_bNoSE || g_bNoEst ? false : (!g_bProVersion ? true : g_serViews.list.e));
        elemShowHide(remainBox, g_bNoSE || g_bNoEst ? false : (!g_bProVersion ? false : g_serViews.list.r));
        
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
        g_remainingTotal.hide();
        g_spentTotal.hide();
        g_estimationTotal.hide();
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

        g_estimationTotal.html(Card.estimationLabelText(estimationValueSet));
        g_spentTotal.html(Card.spentLabelText(spentValueSet));
        g_remainingTotal.html(Card.remainingLabelText(difference));


        var classPartialTotals = 'agile_box_partialUpdate';
        if (bShowBoardTotals) {
            g_estimationTotal.removeClass(classPartialTotals);
            g_spentTotal.removeClass(classPartialTotals);
            g_remainingTotal.removeClass(classPartialTotals);
        } else {
            g_estimationTotal.addClass(classPartialTotals);
            g_spentTotal.addClass(classPartialTotals);
            g_remainingTotal.addClass(classPartialTotals);
        }

        if (globalTotalEstimationFiltered > 0 && globalTotalSpentFiltered >= 0) {
            var titleR = Math.round(globalTotalSpentFiltered * 100 / globalTotalEstimationFiltered) + "% complete";
            g_remainingTotal.prop("title", titleR);
            g_estimationTotal.prop("title", titleR);
            g_spentTotal.prop("title", titleR);
        }

        //BOARD
        elemShowHide(g_spentTotal, g_bNoSE? false : ( bShowHeaderStuff || !g_bProVersion ? true : g_serViews.board.s));
        elemShowHide(g_estimationTotal, g_bNoSE || g_bNoEst ? false : (bShowHeaderStuff || !g_bProVersion ? true : g_serViews.board.e));
        elemShowHide(g_remainingTotal, g_bNoSE || g_bNoEst ? false : (bShowHeaderStuff || !g_bProVersion ? true : g_serViews.board.r));
        bShowHeaderStuff = true;
    }
    setupBurnDown(bShowHeaderStuff, bHasHiddenCard || bTourRunning);
    var bSetTimeout = false;
    if (g_globalTotalSpent != null && (g_globalTotalSpent != globalTotalSpent || g_globalTotalEstimation != globalTotalEstimation)) {
        if (g_bSkipUpdateSsLinks)
            g_bSkipUpdateSsLinks = false;
        else
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
            var stateLoop = { total: 0 };
            for (; iTimer < rgKeysTimers.length; iTimer++) {
                var hashTimer = rgKeysTimers[iTimer];
                var stored = obj[hashTimer];
                var map = mapKeysTimersData[hashTimer];
                processCardTimerIcon(stored, map.titleTag, map.idCard, stateLoop);
            }
            response();
        });
    }
    else {
        response();
    }

}

function updateWorker(bShowBoardTotals) {
    HelpButton.display();
    InfoBoxManager.update();

    if (isPlusDisplayDisabled())
        return;

    if (!g_bForceUpdate && isTimerRunningOnScreen())
        return;

    var boardCur = getCurrentBoard();
    var bOnBoardPageWithoutcard = (getIdBoardFromUrl(document.URL) != null);
    //note: when a card is up we want to avoid reparsing the board, user is typing etc
    var idCardFromURL = getIdCardFromUrl(document.URL);
    if (idCardFromURL)
        recalcChecklistTotals();

    if (boardCur != null && (g_bForceUpdate || bOnBoardPageWithoutcard)) {
        var sftElem = $("#scrumSettingsLink");
        if (sftElem.length > 0)
            showSFTDialog();
        updateCards(boardCur, null, bShowBoardTotals);
    }
    g_bNeedsUpdate = false;
    g_bForceUpdate = false;
}

var g_bSFTDialogShown = false;
function showSFTDialog() {
    if (g_bSFTDialogShown)
        return;
    g_bSFTDialogShown = true;
    var PROP_SFTDontWarnAgain="bSFTDontWarnAgain";
    chrome.storage.sync.get([PROP_SFTDontWarnAgain], function (obj) {
        if (chrome.runtime.lastError == undefined && obj && obj[PROP_SFTDontWarnAgain])
            return;
        var divDialog = $("#agile_dialog_SFTWarning");

        if (divDialog.length > 0)
            return; //show at most once per page cold load

        //focus on h2 so it doesnt go to the first link
        divDialog = $('\
<dialog id="agile_dialog_SFTWarning" class="agile_dialog_DefaultStyle agile_dialog_Postit agile_dialog_Postit_Anim agile_dialog_Postit_Anim_SFT" style="opacity:0.96;">\
<h2 tabindex="1" style="outline: none;">Plus for Trello</h2>\
<br><p>Plus for Trello can show or hide Scrum for Trello points.<br/ >Use the Plus preference to "Accept the Scrum for Trello format in card titles" (and checklists).\
<br /><br />Also, use Plus Dimensions to control what to see (points, S/E or a mix).<br /></p> \
<a href="" class="button-link agile_dialog_Postit_button" id="agile_dialog_SFTWarning_OK">OK</a> <A style="float:right;margin-top:0.5em;" target="_blank" href="http://www.plusfortrello.com/p/notes-for-users-of-scrum-for-trello.html">Read more</A>\
<br /><input style="vertical-align:middle;margin-bottom:0px;"  type="checkbox"  id="agile_check_SFTDontWarnAgain"><label style="display: inline-block;font-weight:500;"  for="agile_check_SFTDontWarnAgain">Dont show me again</label></input>\
</dialog>');
        $("body").append(divDialog);

        divDialog.find("#agile_dialog_SFTWarning_OK").off("click.plusForTrello").on("click.plusForTrello", function (e) {
            e.preventDefault(); //link click would navigate otherwise
            divDialog.removeClass("agile_dialog_Postit_Anim_ShiftToShow");

            var check = $("#agile_check_SFTDontWarnAgain");
            var bChecked = check[0].checked;
            var pairSFTWarn = {};
            pairSFTWarn[PROP_SFTDontWarnAgain] = bChecked;
            chrome.storage.sync.set(pairSFTWarn);
            setTimeout(function () { divDialog[0].close(); }, 300+10); //wait for animation to complete
        });
        showModlessDialog(divDialog[0]);
        setTimeout(function () { divDialog.addClass("agile_dialog_Postit_Anim_ShiftToShow"); }, 200); //some dialog conflict prevents animation from working without timeout
    });
}



var g_strLastBoardNameIdSaved = null;

function updateCards(boardCur, responseParam, bShowBoardTotals, bRecalcAgedCards) {
    if (isPlusDisplayDisabled())
        return;
    if (bRecalcAgedCards === undefined)
        bRecalcAgedCards = true;

    function response() {
        if (bRecalcAgedCards)
            doShowAgedCards(g_bShowAllItems);

        if (responseParam)
            responseParam();
    }
    var elemDetect = null;
    if (boardCur == null || g_remainingTotal == null) {
        var idCardParsed = getIdCardFromUrl(document.URL);

        if (boardCur == null && idCardParsed) {
            //see if its a deleted card
            elemDetect = $(".big-message h1");
            if (elemDetect.length > 0) {
                var elemCardAny = $('.list-card-details');
                if (elemCardAny.length==0)
                    removeTimerForCard(idCardParsed, true);
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
                params = [idBoard];
                var dimension = g_dimension;
                if (dimension != VAL_COMBOVIEWKW_ALL && dimension != VAL_COMBOVIEWKW_KWONLY) {
                    if (dimension == VAL_COMBOVIEWKW_CARDTITLES) {
                        callupdateCardsWorker();
                        return;
                    }

                    assert(dimension.length > 0); //assume the string is a keyword to filter
                    //a little more expensive report based on HISTORY
					sql = "select H.idCard, SUM(H.spent) as sumSpent, SUM(H.est) as sumEst FROM HISTORY AS H WHERE H.idBoard=? AND H.keyword=? \
                            group by H.idCard";
					params = [idBoard, dimension];
                }

                getSQLReport(sql, params,
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

function processCardTimerIcon(stored, container, idCard, stateLoop) {
    var imgTimer = container.find('.agile_timer_icon_small');
    if (stored !== undefined && stored.msEnd == null) {  //show
        if (imgTimer.length == 0) {
            imgTimer = $("<img>").attr("src", chrome.extension.getURL("images/iconspent.png")).addClass('agile_timer_icon_small');
            imgTimer.attr("title", "Active timer");
            var span = $("<span>");
            span.append(imgTimer);
            container.append(span);
            setTimeout(function () {
                showTimerPopup(idCard); //wait a little so we dont load many timer windows in parallel (and also give priority to trello board page loading)
            }, 500+stateLoop.total * 100);
            stateLoop.total++;
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

function getCurrentBoard() {
	var boardNameContainerElem = $(".board-name");
	if (boardNameContainerElem.length == 0) { //timing sensitive
		boardNameContainerElem = $(".board-header-btn-name");
		if (boardNameContainerElem.length == 0)
			return null;
	}

	if (getIdBoardFromUrl(document.URL) == null && getIdCardFromUrl(document.URL) == null)
	    return null;

	var boardNameElem = boardNameContainerElem.children(".board-header-btn-text");
	if (boardNameElem.length == 0)
		return null;
	var ret = boardNameElem.text().trim();
	if (ret == "")
		ret = null;
	return ret;
}

var List = {
    all: function () {
        return $('.list-header-name');
    },
    cards: function (list) {
        var cardsContainer = $(list).parent();
        cardsContainer = cardsContainer.siblings('.list-cards').eq(0);
        var cards = $(cardsContainer).children('.list-card');
        return cards;
    }
};

var InfoBoxManager = {
    update: function () {
        var boardHeader = $('.board-header');

        if (boardHeader.length != 1)
            return;

        if (g_remainingTotal.parent()[0] === boardHeader[0]) //optimize
            return;

        //migrate elements to new parent
        g_remainingTotal.hide();
        g_estimationTotal.hide();
        g_spentTotal.hide();
        g_bheader.hide();
        boardHeader.append(g_remainingTotal);
        boardHeader.append(g_estimationTotal);
        boardHeader.append(g_spentTotal);

        var burndownLink = $(".agile_plus_burndown_link");
        if (burndownLink.length != 0)
            boardHeader.append(burndownLink);

        var reportLink = $(".agile_plus_report_link");
        if (reportLink.length != 0)
            boardHeader.append(reportLink);
        
        var viewKW = g_bheader.comboSEView;
        if (viewKW && viewKW.length != 0)
            boardHeader.append(viewKW);

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
        } else if (type == REMAINING) {
            return box.addClass('agile_remaining_box').html('0');
        }
    },
    makeTotalInfoBox: function (type, bBoardTotals) {
        var box = $('<div></div>').addClass('agile_box').addClass('agile_total_box');
        if (bBoardTotals)
            box.addClass("agileBox_right");
        else
            box.addClass("agileBox_home");
        if (type == ESTIMATION) {
            return box.addClass('agile_estimation_box').html(bBoardTotals?'E: 0': '0');
        } else if (type == SPENT) {
            return box.addClass('agile_spent_box').html(bBoardTotals?'S: 0': '0');
        } else if (type == REMAINING) {
            return box.addClass('agile_remaining_box').html(bBoardTotals ? 'R: 0' : '0');
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

