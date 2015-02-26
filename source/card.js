var g_inputSEClass = "agile_plus_addCardSE";
var g_strNowOption = "now";
var g_strNoteBase = "type note and Enter.";

function validateSEKey(evt) {
	var theEvent = evt || window.event;
	var key = theEvent.keyCode || theEvent.which;
	key = String.fromCharCode(key);
	var regex = /[0-9]|\.|\:|\-/;
	if (!regex.test(key)) {
		theEvent.returnValue = false;
		if (theEvent.preventDefault) theEvent.preventDefault();
	}
}

var g_seCardCur = { s: null, e: null }; //keeps stats about the user's last open card. used for "se bar" validation. null means not initialized

function updateEOnSChange() {
    var comment = $("#plusCardCommentComment");
    var spinS = $("#plusCardCommentSpent");
    var spinE = $("#plusCardCommentEstimate");

    setTimeout(function () {
        var valS = spinS.val() || "";
        bHilite = false;
        if (isRecurringCard()) {
            spinE.val(valS);
            bHilite = true;
        }
        else if (!g_bAllowNegativeRemaining) {
            if (g_seCardCur.s === null || g_seCardCur.e === null)
                return; //should never happen but just in case
            var sNew = g_seCardCur.s + parseSEInput(spinS, false, true);
            var floatDiff = sNew - g_seCardCur.e;
            if (floatDiff <= 0)
                floatDiff = 0;
            var diff = parseFixedFloat(floatDiff);
            if (diff <= 0) {
                diff = "";
                floatDiff = 0;
            }

            if (spinE.val() != diff) {
                if (diff) {
                    if (valS.indexOf(":") >= 0) {
                        diff = UNITS.FormatWithColon(floatDiff);
                    }
                }
                spinE.val(diff);
                bHilite = true;
            }
        }
        if (bHilite)
            hiliteOnce(spinE, 500);
        updateNoteR();
    }, 1);
}

function updateNoteR() {
    var comment = $("#plusCardCommentComment");
    var spinS = $("#plusCardCommentSpent");
    var spinE = $("#plusCardCommentEstimate");
    if (comment.length == 0 || spinS.length == 0 || spinE.length == 0)
        return;

    if (g_seCardCur.s == null)
        return; //should never happen but just in case

    var sRaw = spinS.val();
    var eRaw = spinE.val();

    var sParsed = parseSEInput(spinS, false, true);
    var eParsed = parseSEInput(spinE, false, true);

    if ((sRaw.length == 0 && eRaw.length == 0) || sParsed == null || eParsed == null) {
        comment.attr("placeholder", g_strNoteBase);
        return;
    }


    var sumS = sParsed + g_seCardCur.s;
    var sumE = eParsed + g_seCardCur.e;
    var rDiff = parseFixedFloat(sumE - sumS);
    comment.attr("placeholder", g_strNoteBase + " R will be " + rDiff + "."+(rDiff!=0? "":" Increase E if you are not done." ));
}

function isRecurringCard() {
    var elemTitle = $(".window-title-text");
    if (elemTitle.length == 0)
        return false; //no longer in card window. just pretend not recurring
    var titleCur = elemTitle.text();
    var bRecurring = (titleCur.indexOf(TAG_RECURRING_CARD) >= 0);
    return bRecurring;
}


function createCardSEInput(parentSEInput, spentParam, estimateParam, commentParam) {
	var bHasSpentBackend = isBackendMode();
	g_seCardCur.s = null;
	g_seCardCur.e = null;

	var container = $("<div></div>").addClass(g_inputSEClass).hide();
	var containerStats = $("<div></div>");
	var tableStats = $("<table class='agile-se-bar-table agile-se-stats'></table>");
	var containerBar = $("<table class='agile-se-bar-table agile-se-bar-entry'></table>");
	containerStats.append(tableStats);
	container.append(containerStats);
	container.append(containerBar);
	var row = $("<tr></tr>").addClass("agile-card-background");
	containerBar.append(row);

	var comboDays = setSmallFont($('<select id="plusCardCommentDays"></select>').addClass("agile_days_box_input"));
	comboDays.attr("title", "How many days ago did it happen?");
	var iDays = 1;
	var iLast = 10;
	if (bHasSpentBackend)
		iLast = 2;
	comboDays.append($(new Option(g_strNowOption, g_strNowOption)));
	for (; iDays <= iLast; iDays++) {
		var txt = "-" + iDays + "d";
		comboDays.append($(new Option(txt, txt)));
	}
	var spinS = setNormalFont($('<input id="plusCardCommentSpent" placeholder="S"></input>').addClass("agile_spent_box_input"));

	spinS[0].onkeypress = function (e) { validateSEKey(e); };
	spinS.bind("keydown keyup paste", function (e) { updateEOnSChange(); });
	var spinE = setNormalFont($('<input id="plusCardCommentEstimate" placeholder="E"></input>').addClass("agile_estimation_box_input"));
	spinE[0].onkeypress = function (e) { validateSEKey(e); };
	spinE.bind("keydown keyup paste", function (e) { updateNoteR(); });
	var slashSeparator = setSmallFont($("<span />").text("/"));
	var comment = setNormalFont($('<input type="text" name="Comment" placeholder="' + g_strNoteBase + '"/>').attr("id", "plusCardCommentComment").addClass("agile_comment_box_input"));

	spinS.focus(function () { $(this).select(); });
	spinE.focus(function () { $(this).select(); }); //selection on focus helps in case card is recurring, user types S and clicks on E to type it too. since we typed it for them, might get unexpected results

	var spanIcon = $("<span />");
	var icon = $("<img>").attr("src", chrome.extension.getURL("images/iconspent.png"));
	icon.attr('title', 'Add S/E to this card. Use negative numbers to reduce.');
	icon.addClass("agile-spent-icon-cardcommentSE");
	spanIcon.append(icon);

	var buttonEnter = setSmallFont($('<button id="plusCardCommentEnterButton"/>').addClass("agile_enter_box_input").text("Enter"));
	buttonEnter.attr('title', 'Click to enter this S/E.');
	row.append($('<td />').addClass("agile_tablecellItem").append(spanIcon));
	row.append($('<td />').addClass("agile_tablecellItem").append(comboDays));
	row.append($('<td />').addClass("agile_tablecellItem").append(spinS)).
		append($('<td />').addClass("agile_tablecellItem").append(slashSeparator)).
		append($('<td />').addClass("agile_tablecellItem").append(spinE)).
		append($('<td />').addClass("agile_tablecellItem").append(comment).width("100%")). //takes remaining hor. space
		append($('<td />').addClass("agile_tablecellItemLast").append(buttonEnter));

	if (spentParam !== undefined)
	    spinS.val(spentParam);

	if (estimateParam !== undefined)
	    spinE.val(estimateParam);

	if (commentParam !== undefined)
	    comment.val(commentParam);

	buttonEnter.click(function () {
		testExtension(function () {
			clearBlinkButtonInterval();
			buttonEnter.removeClass("agile_box_input_hilite");
			var s = parseSEInput(spinS);
			var e = parseSEInput(spinE);
			if (s == null || e == null)
			    return;

			if (!verifyValidInput(s, e))
			    return;
			var prefix = comboDays.val();
			var valComment = replaceBrackets(comment.val());
			//use setTimeout to get out of the click stack. else it will conflict with out fake clicks.
			setTimeout(function () { setNewCommentInCard(s, e, valComment, prefix, true); }, 0);
		});
	});

	comment.keypress(function (event) {
	    var keycode = (event.keyCode ? event.keyCode : event.which);
	    if (keycode == '13') { //enter key
	        buttonEnter.click();
	        return false;
	    }
	});
	
	parentSEInput.before(container);
	fillCardSEStats(tableStats, function () {
	    container.show();
	});
}

function verifyValidInput(s, e) {
    if (g_seCardCur.s === null || g_seCardCur.e === null)
        return false; //shouldnt happen as the bar is hidden until this is loaded, but just in case
    var sTotal = parseFixedFloat(g_seCardCur.s + s);
    var eTotal = parseFixedFloat(g_seCardCur.e + e);
    var rTotal = parseFixedFloat(eTotal - sTotal);

    var err = null;
    if (sTotal < 0)
        err = "Your spent total will go negative.";
    else if (eTotal < 0)
        err = "Your estimate total will go negative.";
    else if (rTotal < 0 && !g_bAllowNegativeRemaining) 
        err = "Your spent total will be larger than total estimate.\nIf you dont need to track remaining, set it in Preferences, 'Allow negative Remaining' (Plus help.)";

    if (err != null) {
        err = err + "\n\nAre you sure you want to enter it?";
        if (!confirm(err))
            return false;
    }
    return true;
}

function refreshCardTableStats() {
    fillCardSEStats($(".agile-se-stats"));
}

//REVIEW opt: could do this on a single query with case and two columns for estimate
function getInitialCardBalances(idCard, callback) {
    var sql = "select user, SUM(est) as estSum from HISTORY where idCard=? AND eType=" + ETYPE_NEW + " GROUP by user";
    var values = [idCard];
    getSQLReport(sql, values,
		function (response) {
		    var map = {};
		    if (response.status == STATUS_OK) {
		        for (var i = 0; i < response.rows.length; i++) {
		            var row = response.rows[i];
		            map[row.user] = row.estSum;
		        }
		    }
		    callback(map);
		});
}

function fillCardSEStats(tableStats,callback) {
    if (tableStats.length == 0)
        return;
    var containerStats=tableStats.parent();
    var idCard = getIdCardFromUrl(document.URL);
    var userCur = getCurrentTrelloUser();
    if (!idCard || userCur==null)
		return; //ignore

    getInitialCardBalances(idCard, function (mapEstOrig) {
        var sql = "select CB.idCard, CB.user, CB.spent, CB.est, CB.date \
				FROM CARDBALANCE AS CB \
				WHERE CB.idCard=? \
				ORDER BY CB.date DESC";
        var values = [idCard];
        getSQLReport(sql, values,
            function (response) {
                tableStats.empty();
                //reset
                g_seCardCur.s = 0;
                g_seCardCur.e = 0;
                var elemRptLink = containerStats.find(".agile_card_report_link");
                if (response.status == STATUS_OK && (response.rows.length > 0 || isTourRunning())) {
                    elemRptLink.show();
                    if (elemRptLink.length == 0)
                        containerStats.prepend($('<a class="agile_card_report_link agile_link_noUnderline" href="' + chrome.extension.getURL("report.html?idCard=") + encodeURIComponent(idCard) + '" target="_blank">Card Report - Plus</a>'));
                    var i = 0;
                    //<span style="vertical-align: top;position: relative; top: -0.3em;font-size:0.7em">st</span>
                    addCardSERowData(tableStats, { user: 'By User', spent: 'S <span style="font-size:0.85em">sum</span>', estOrig: '<span>E 1ˢᵗ</span>', est: 'E <span style="font-size:0.85em">sum</span>', remain: 'R <span style="font-size:0.80em">(E-S)</span>' }, true);
                    if (response.rows.length == 0)
                        addCardSERowData(tableStats, { user: 'sample user', spent: '0', estOrig: '0', est: '0', remain: '0' });
                    for (; i < response.rows.length; i++) {
                        var rowData = response.rows[i];
                        rowData.estOrig = mapEstOrig[rowData.user] || 0;
                        addCardSERowData(tableStats, rowData);
                        if (rowData.user == userCur) {
                            g_seCardCur.s = g_seCardCur.s + rowData.spent;
                            g_seCardCur.e = g_seCardCur.e + rowData.est;
                        }
                    }
                }
                else {
                    elemRptLink.hide();
                }
                updateNoteR();
                if (callback)
                    callback();
            });
    });
}

function addCardSERowData(tableStats, rowData, bHeader) {
	var row = $("<tr></tr>").addClass("agile-card-background").addClass("agile-card-statrow");
	if (bHeader)
	    row.addClass("agile-card-background-header");
	else
	    row.addClass("agile-card-statrow-data");
	var td = (bHeader ? '<th />' : '<td />');
	var u = null;
	if (bHeader)
		u = $(td).text(rowData.user);
	else {
	    var urlReport = '<a class="agile_link_noUnderline" href="' + chrome.extension.getURL("report.html?idCard=") + encodeURIComponent(rowData.idCard) + '&user=' + rowData.user + '" target="_blank">' + rowData.user + '</a>';
		u = $(td).html(urlReport);
	}

	var sVal = (typeof (rowData.spent) == 'string' ? rowData.spent : parseFixedFloat(rowData.spent));
	var eOrigVal = (typeof (rowData.estOrig) == 'string' ? rowData.estOrig : parseFixedFloat(rowData.estOrig));
	var eVal = (typeof (rowData.est) == 'string' ? rowData.est : parseFixedFloat(rowData.est));
	var rVal =  (typeof (rowData.remain) == 'string' ? rowData.remain : parseFixedFloat(eVal - sVal));
	var s = $(td);
	var eOrig = $(td).addClass("agile-card-first-estimate-header");
	var e = $(td).addClass("agile-card-now-estimate-header");
	var r = $(td);

	if (bHeader) {
	    s.html(sVal);
	    eOrig.html(eOrigVal);
	    e.html(eVal);
	    r.html(rVal);
	}
	else {
	    s.text(sVal);
	    eOrig.text(eOrigVal);
	    e.text(eVal);
	    r.text(rVal);
	}

	if (typeof (sVal) == "number") {
		if (sVal < 0) {
			s.attr("title",  "Negative Spent!");
			s.css("background", COLOR_ERROR);
		}

		if (eVal < 0) {
			e.attr("title", "Negative Estimate!");
			e.css("background", COLOR_ERROR);
		}

		if (rVal < 0) {
		    r.attr("title", "Spent larger than Estimate!");
		    r.css("background", COLOR_ERROR);
		}
		else if (rVal > 0) {
		    r.css("background", "#CAE3CA");
		}
	}
	var dateLast = new Date(rowData.date * 1000);
	if (!bHeader)
	    u.attr("title", "last S/E " + dateLast.toLocaleDateString() + "\nClick to drill-down");
	row.append(u).append(s).append(eOrig).append(e).append(r);
	tableStats.append(row);
}


//bExact is only for preserving values entered with colon format
function parseSEInput(ctl, bHiliteError, bExact) {
	if (bHiliteError===undefined)
		bHiliteError = true;
	if (bHiliteError)
		ctl.removeClass("agile_box_input_hilite");
	var val = ctl[0].value;
	if (val.indexOf(":") < 0)
	    return parseFixedFloat(val);

	var retVal = parseColonFormatSE(val, bExact);
	if (retVal === null) {
	    if (bHiliteError)
	        ctl.addClass("agile_box_input_hilite");
	    return null; //invalid
	}
    return retVal;
}


function addCardCommentHelp() {
	if (!g_bReadGlobalConfig)
		return; //wait til later

	var elems = $(".add-controls");
	var elemsVerifyCardWindow = $(".card-detail-title");

	if (elemsVerifyCardWindow.length == 0)
		return;

	var i = 0;

	//create S/E bar if not there yet
	if ($("." + g_inputSEClass).length == 0) {
		$(".edits-warning").css("background", "yellow").attr('title', 'Plus: Make sure to enter this unsaved edit if it was made by Plus.');
		var board = getCurrentBoard();
		if (board == null)
		    return; //wait til later
        
		var idCardCur = getIdCardFromUrl(document.URL);
		if (!idCardCur)
		    return; //timing issue, really shouldnt happen as we found card elements above

        //simply so in case idBoard(Short) isnt cached, go get it from the api and cache it so its ready when the S/E is entered by the user 
		FindIdBoardFromBoardName(board, idCardCur, function (idBoardFound) { });

		for (i = 0; i < elems.length; i++) {
			var elem = elems.eq(i);
			var elemParent = elem.parent();
			var bNewCommentFound = elemParent.hasClass("new-comment");

			if (!bNewCommentFound) {
			    elemParent = elemParent.parent();
			    bNewCommentFound = elemParent.hasClass("new-comment")

			}
			if (bNewCommentFound) {
				var classSpentCommentHelp = "agile_plushelp_cardCommentHelp";
				if (elem.eq(0).children("." + classSpentCommentHelp).length == 0) {
				    var help = null;
				    if (isBackendMode()) {
				        help = setSmallFont($("<span>Spent: @" + getSpentSpecialUser() + " [-1d] S/E note</span>").addClass(classSpentCommentHelp), 0.85);
				    }
				    else if (g_optEnterSEByComment.IsEnabled() && g_optEnterSEByComment.rgKeywords.length > 0) {
				        var kw = g_optEnterSEByComment.getDefaultKeyword();
				        help = setSmallFont($("<A class='quiet-button u-float-left' style='margin-left:10px' href='http://plusfortrello.blogspot.com/2014/12/plus-for-trello-se-card-comment-format.html' target='_blank'><b>" + kw + "</b> keyword help</A>").addClass(classSpentCommentHelp), 0.85);
				        help.prop("title", kw + " 0/4  :  adds 4 to your estimate\n\n\
" + kw + " -2d 5/3 fix doc : adds 2days ago 5/3 with note 'fix doc'\n\n\
" + kw + " @john 0/6 : adds to john 6 estimate\n\n\
" + kw + " @john @paul -2d 3/3 codereview : adds to john and paul -2days ago 3/3 with note 'codereview'\n\n\
You may use @me to add yourself.\n\n\
"+ kw + " 7 : (without '/') spends 7/0 or 7/7 for recurring [R] cards.");
				    }
				    if (help)
				        elem.append(help);
				}
				var elemWindowTop = elemParent;
				while (!elemWindowTop.hasClass("window-wrapper"))
				    elemWindowTop = elemWindowTop.parent();
				elemWindowTop.find(".window-header").eq(0).append(createMiniHelp());
				
				createCardSEInput(elemParent);
				insertCardTimer();
				break;
			}
		}
	}

	var helpClass = "agile_plushelp_renamecardwarning";
	var saveBtn = $(".js-save-edit");

	if (saveBtn.length == 0)
		return;

	for (i = 0; i < saveBtn.length; i++) {
		var e = saveBtn.eq(i);

		var editControls = e.parent();
		if (!editControls.eq(0).hasClass("edit-controls"))
			continue;
		var elemFind = editControls.eq(0).parent();
		if (!elemFind.eq(0).hasClass("edit"))
			continue;
		elemFind = elemFind.eq(0).parent();
		if (!elemFind.eq(0).hasClass("card-detail-title"))
			continue;

		if (editControls.eq(0).children("." + helpClass).length == 0) {
		    var helpWarnChange = setSmallFont($("<div>Plus: Append <b>[R]</b> to the title  to make it a <b>Recurring Card</b>.").addClass(helpClass), 0.85);
			editControls.append(helpWarnChange);
		}
	}
}

var Card = {
	//
	// Separator used to split the custom values 
	// from the rest of the title
	//
	mainSeparator: ")",
	secondarySeparator: "/",
	startSeparator: "(",
	//
	// Parses the title to obtain the estimated number of units
	// E.g. "2--This is a string" will output the number 2.
	//
	hashtagsFromTitle: function (title) {
		var hashtags = [];
		var regexp = /#([\w-]+)/g;
		var result = regexp.exec(title);
		while (result != null) {
			hashtags.push(result[1]);
			result = regexp.exec(title);
		}

		return hashtags;
	},
	
	estimationLabelText: function (estimationNumber) {
		return "E: " + String(estimationNumber);
	},
	spentLabelText: function (spentNumber) {
		return "S: " + String(spentNumber);
	},
	remainingLabelText: function (number) {
		return "R: " + String(number);
	},
	titleTag: function (card) {
		var details = $(card).children('.list-card-details');
		return details.eq(0).children('.list-card-title').eq(0);
	}
};


function loadCardTimer(idCard) {
    var timerElem = $("<a></a>").addClass("button-link ").attr("id", "agile_timer").attr('disabled', 'disabled');
	var spanIcon = $("<span>");
	var icon = $("<img>").attr("src", chrome.extension.getURL("images/iconspent.png"));
	icon.addClass("agile-spent-icon-cardtimer");
	spanIcon.append(icon);
	spanIcon.appendTo(timerElem);
	var spanTextTimer = $("<span>");
	spanTextTimer.appendTo(timerElem);
	var hash = getCardTimerSyncHash(idCard);
	var timerStatus = { bRunning: false, idInterval: null, idCard: idCard };
	getCardTimerData(hash, function (obj) {
		hash = obj.hash;
		var stored = obj.stored;
		var msStart = 0;
		var msEnd = 0;
		if (stored !== undefined) {
			timerStatus.bRunning = (stored.msEnd == null);
			msStart = stored.msStart;
			if (timerStatus.bRunning) {
			    configureTimerInterval(timerElem, timerStatus, msStart);
			    verifyActiveTimer(idCard); //in case the user has multiple active timers, this will make  active the last one viewed in trello
				var date = new Date();
				msEnd = date.getTime();
			}
			else
				msEnd = stored.msEnd;
		}
		updateTimerElemText(timerElem, msStart, msEnd);
		updateTimerTooltip(timerElem, timerStatus.bRunning, false, true);
		timerElem.removeAttr('disabled');
		timerElem.click(function (evt) {
		    testExtension(function () {
		        handleCardTimerClick(evt.timeStamp, hash, timerElem, timerStatus, idCard);
		    });
		});
	});
	return timerElem;
}

function updateTimerTooltip(timerElem, bRunning, bRemoveSmallTimerHelp, bUpdateCards) {
    bRemoveSmallTimerHelp = bRemoveSmallTimerHelp || false; //review zig remove
	bUpdateCards = bUpdateCards || false;
	var title = "";
	var strClassRunning = "agile_timer_running";
	if (bRunning) {
		timerElem.addClass(strClassRunning);
        title = "Click to stop the timer.";
	}
	else {
		timerElem.removeClass(strClassRunning);
		title = "Click to start the timer.";
	}

	timerElem.attr('title', title);
	if (bUpdateCards) {
		var boardCur = getCurrentBoard();
		if (boardCur != null) {
			//setTimeout allows formatting above to happen faster
			setTimeout(function () { updateCards(boardCur,null, true, false); }, 50);
		}
	}
}

function isTimerRunningOnScreen(timer) {
	timer = timer || g_timerStatus;
	return (timer && timer.idInterval && timer.idCard && getIdCardFromUrl(document.URL) == timer.idCard);
}

function clearTimerInterval(timerStatus) {
    if (timerStatus && (timerStatus.bRunning || timerStatus.idInterval)) {
        timerStatus.bRunning = false;
        if (timerStatus.idInterval)
            clearInterval(timerStatus.idInterval);
        timerStatus.idInterval = null;
    }
}

var g_timerStatus = null;
function configureTimerInterval(timerElem, timerStatus, msStart) {
    clearTimerInterval(g_timerStatus);
    g_timerStatus = timerStatus; //so we can tell when a timer is running
    clearTimerInterval(timerStatus); //shouldnt be set but just in case of timing issues
    timerStatus.bRunning = true;
    var hash = getCardTimerSyncHash(timerStatus.idCard);
    timerStatus.idInterval = setInterval(function () {
		if (g_timerStatus && g_timerStatus.idInterval != timerStatus.idInterval) {
		    //review zig: this cant happen anymore
		    logPlusError("timer error: other timer was already set. cleared it.");
		    clearTimerInterval(timerStatus);
			return;
		}

        //get it again in case it changed from another device or window
		getCardTimerData(hash, function (obj) {
		    var stored = obj.stored;
		    if (stored === undefined || (stored.msStart != null && stored.msEnd != null) ||
                (stored.msStart == null && stored.msEnd == null)) {
		        clearTimerInterval(timerStatus);
		        updateTimerElemText(timerElem, 0, 0); //just so it shows 0:0
		        updateTimerTooltip(timerElem, false, true, true);
		        return;
		    }
            //review zig: missing case to implement is when card window open without timer, and timer is started from somewhere else. should define a broadcast to detect this
		    if (isTimerRunningOnScreen(timerStatus)) {
		        msStart = stored.msStart; //REVIEE zig: parameter msStart no longer needed. always comes from storage
		        var msEnd = new Date().getTime();
		        updateTimerElemText(timerElem, msStart, msEnd);
		        updateTimerTooltip(timerElem, true, msEnd - msStart > 20 * 1000, false);
		    }
		});
	}, 1000);
}

function updateTimerElemText(timerElem, msStart, msEnd) {
	timerElem.children().filter(':last-child').text(getTimerElemText(msStart, msEnd));
}


function handleCardTimerClick(msDateClick, hash, timerElem, timerStatus, idCard) {
    chrome.storage.sync.get([SYNCPROP_ACTIVETIMER], function (objActiveTimer) {
        var idCardActiveTimer = null;
        idCardActiveTimer = (objActiveTimer[SYNCPROP_ACTIVETIMER] || null);

        getCardTimerData(hash, function (obj) { //get it again in case it changed from another device
            hash = obj.hash;
            var stored = obj.stored;
            if (stored === undefined || (stored.msStart != null && stored.msEnd != null) ||
                (stored.msStart == null && stored.msEnd == null)) {
                //START
                if (idCardActiveTimer && !g_bDontWarnParallelTimers) {
                    if (!confirm("There is already an active timer.\nClick the Chrome Plus icon to see it.\nAre you sure you want to start another timer?\n\n[See Plus help Preferences to disable this warning]"))
                        return;
                }
                var elemSpent = $("#plusCardCommentSpent");
                var sCur = null;
                var bClearSpentBox = false;
                if (elemSpent.length == 1) {
                    sCur = parseSEInput(elemSpent, false, true);
                    if (sCur != null) {
                        if (parseFixedFloat(g_sTimerLastAdd) == sCur)
                            sCur = g_sTimerLastAdd;
                        msDateClick = msDateClick - UNITS.UnitsToTime(sCur);
                        bClearSpentBox = true;
                    }
                }

                stored = { msStart: msDateClick, msEnd: null };
                var objNew = {};
                objNew[hash] = stored;
                objNew[SYNCPROP_ACTIVETIMER] = idCard;
                //uncommon case of having two card windows open, start timer from A, stop from B, stop again A
                clearTimerInterval(timerStatus);
                chrome.storage.sync.set(objNew, function () {
                    if (chrome.runtime.lastError !== undefined)
                        return;
                    timerStatus.bRunning = true;
                    updateTimerTooltip(timerElem, timerStatus.bRunning, false, true);
                    configureTimerInterval(timerElem, timerStatus, stored.msStart);
                    updateTimerChromeIcon();
                    if (bClearSpentBox) {
                        var elemComment = $("#plusCardCommentComment");
                        elemSpent.val("");
                        $("#plusCardCommentEstimate").val("");
                        updateNoteR();
                        clearBlinkButtonInterval();
                        $("#plusCardCommentEnterButton").removeClass("agile_box_input_hilite");
                    }
                });
            }
            else if (stored.msStart != null && stored.msEnd == null) {
                //STOP
                var msStartCur = stored.msStart;
                var msEndCur = msDateClick;
                chrome.storage.sync.remove([hash, SYNCPROP_ACTIVETIMER], function () {
                    if (chrome.runtime.lastError !== undefined)
                        return;
                    clearTimerInterval(timerStatus);
                    updateTimerElemText(timerElem, msStartCur, msStartCur); //just so it shows 0:0
                    updateTimerTooltip(timerElem, timerStatus.bRunning, false, true);
                    updateTimerChromeIcon();
                    var ms = msEndCur - msStartCur;
                    var sCalc = UNITS.TimeToUnits(ms);
                    var sUse = parseFixedFloat(sCalc);
                    if (sUse != 0) {
                        addSEFieldValues(sCalc, "");
                    }
                    else {
                        sendDesktopNotification("Ellapsed time too small (under 0.01). Timer ignored\n.", 10000);
                    }
                    findNextActiveTimer();
                });
            }
        });
    });
}

var g_intervalBlinkButton = null;
var g_cBlinkButton = 0;

function clearBlinkButtonInterval() {
	if (g_intervalBlinkButton != null)
		clearInterval(g_intervalBlinkButton);
	g_cBlinkButton = 0;
}

var g_sTimerLastAdd = 0; //used for improving timer precision (because of rounding to x.xx spent format)

/* addSEFieldValues
 *
 * s,e: float
 * will add given s/e to existing values in the controls
 **/
function addSEFieldValues(s, comment) {
	var elemSpent = $("#plusCardCommentSpent");
	var elemEst = $("#plusCardCommentEstimate");
	var sCur = parseSEInput(elemSpent,false,true);
	var eCur = parseSEInput(elemEst, false);
	if (sCur == null)
		sCur=0;
	if (eCur == null)
	    eCur = 0;
	g_sTimerLastAdd = s + sCur;
	s = parseFixedFloat(g_sTimerLastAdd);
	if (s == 0)
		s = "";

	$("#plusCardCommentDays").val(g_strNowOption);
	elemSpent.val(s);
	updateEOnSChange();
	$("#plusCardCommentComment").val(comment);
	var elemEnter = $("#plusCardCommentEnterButton");
	var classBlink = "agile_box_input_hilite";
	elemEnter.focus().addClass(classBlink);
	clearBlinkButtonInterval();
	g_intervalBlinkButton = setInterval(function () {
		g_cBlinkButton++;

		if (elemEnter.hasClass(classBlink))
			elemEnter.removeClass(classBlink);
		else {
			elemEnter.addClass(classBlink);
			if (g_cBlinkButton > 2) //do it here so it remains yellow
				clearBlinkButtonInterval();
		}
	}, 500);
}

function setNewCommentInCard(s, e, commentBox, prefix, bFromSEControls) {
	if (prefix == g_strNowOption || prefix == null)
		prefix = "";
	var bNoSpentBackend = !isBackendMode();
	var bAlwaysEnter = (bFromSEControls == true);
	var comment = "";
	var keywordUse = null; //legacy cases may remain null

	if (!bAlwaysEnter && s < 0.005)
		comment = "";
	else {
		s = Math.round(s * 100) / 100;
		e = Math.round(e * 100) / 100;
		if (bNoSpentBackend) {
		    keywordUse = g_optEnterSEByComment.getDefaultKeyword();
		    comment = keywordUse + " ";
			if (prefix.length > 0)
				comment = comment + " " + prefix + " ";
			comment = comment + s + "/" + e + " " + commentBox;
		}
		else
			comment = "@" + getSpentSpecialUser() + " " + (prefix === undefined ? "" : prefix + " ") + s + "/" + e + " " + commentBox;
	}

	if (comment == "" || (!bAlwaysEnter && s == 0 && e == 0))
		return;

	var board = getCurrentBoard();
	if (board == null) {
		logPlusError("error: no board");
		return; //should never happen, we had it when the S/E box was created
	}

	var idCardCur = getIdCardFromUrl(document.URL);
	if (!idCardCur) {
		logPlusError("error: no idCardCur");
		return; //should never happen
	}

	FindIdBoardFromBoardName(board, idCardCur, function (idBoardFound) {
		if (idBoardFound) {
		    idBoardUse = idBoardFound;
		    doEnterSEIntoCard(s, e, commentBox, comment, idBoardUse, idCardCur, prefix, board, keywordUse);
		}
		else {
		    var strError = "Network error. Cannot get idBoard.\nClose the card,  go to the trello board page and try again.";
		    logPlusError(strError);
		    alert(strError);
		}
	});
}

function bHandleNoBackendDbEntry(s, e, commentBox, idBoard, idCard, strDays, strBoard, cleanTitle, userCur, idHistoryRowUse, keyword) {
	var dateNow = new Date();
	var dDays = 0;
	if (strDays != "") {
		dDays = parseInt(strDays, 10) || 0;
		if (dDays < 0 && dDays >= g_dDaysMinimum) {
		    dateNow.setDate(dateNow.getDate() + dDays);
		    commentBox = "[" + dDays + "d] " + commentBox; //review zig: these tags should happen at row entry time, shared by other code that does the same message
		}
	}

	helperInsertHistoryRow(dateNow, idCard, idBoard, strBoard, cleanTitle, userCur, s, e, commentBox, idHistoryRowUse, keyword);
	return true;
}


function helperInsertHistoryRow(dateNow, idCard, idBoard, strBoard, strCard, userCur, s, e, comment, idHistoryRowUse, keyword) {
    var obj = makeHistoryRowObject(dateNow, idCard, idBoard, strBoard, strCard, userCur, s, e, comment, idHistoryRowUse, keyword);
	insertHistoryRowFromUI(obj);
}

function doEnterSEIntoCard(s, e, commentBox, comment, idBoard, idCard, strDays, strBoard, keyword) {
	var bNoSpentBackend = !isBackendMode();
	var elem = null;
	var titleCur = null;
	var cleanTitle = null;

	elem = $(".window-title-text");
	titleCur = elem.text();
	var se = parseSE(titleCur, true, g_bAcceptSFT);
	cleanTitle = se.titleNoSE;

	var titleCardNew = null;
	var commentEnter = comment;

	if (bNoSpentBackend && !g_optEnterSEByComment.IsEnabled() && g_configData && g_strServiceUrl && g_strServiceUrl != "") {
	    //legacy option to rename card titles. Keep it on if user has configured google sync and hasnt configured reading S/E from comments
	    //note that we dont rename card titles if there is no service url. this can affect a few users, but its best because it avoids issues with new
        //team users that never enable sync and just start using Plus without any configuration.
		var estimation = parseFixedFloat(e + se.estimate);
		var spent = parseFixedFloat(s + se.spent);

		if (se.bSFTFormat)
		    titleCardNew = "(" + estimation + ") " + cleanTitle + " [" + spent + "]";
		else
		    titleCardNew = "(" + spent + "/" + estimation + ") " + cleanTitle;
	} else {
	    commentEnter = comment;
	    if (cleanTitle != titleCur) {
	        titleCardNew = cleanTitle;
	        commentEnter = commentEnter + " [plus removed "+ parseFixedFloat(se.spent) + "/" + parseFixedFloat(se.estimate)+" from title]";
	    }
	}
	
	handleEnterCardComment(titleCardNew, commentEnter, idCard, s, e, commentBox, strDays, cleanTitle, bNoSpentBackend, keyword);
}

function handleEnterCardComment(titleCard, comment, idCard, s, e, commentBox, strDays, cleanTitle, bNoSpentBackend, keyword) {

    var seBarElems = $(".agile-se-bar-table *");
    var bEnabled = false;
    seBarElems.prop('disabled', true);
    $(".agile_enter_box_input").text("...");

    function enableSEBar() {
        if (bEnabled)
            return;
        bEnabled = true;
        seBarElems.prop('disabled', false);
        $(".agile_spent_box_input").focus();
        $(".agile_enter_box_input").text("Enter");
    }

    function finished() {
        enableSEBar();
        //reports etc will refresh in the NEW_ROWS notification handler
    }

    //pause sync. otherwise, it will still work ok, but we want to avoid randomness in the order things happen. When adding a comment,
    //plus will trap the comment creation and attempt to start a trello sync. This can all happen before we get to the point of manually adding the history row below.
    //thus, depending on timing, the history row could be added from here or from detecting a network change and starting a sync.
    //so, we pause sync for a few seconds while we finish adding the comment and database rows. Its not perfect but will cause the great mayority of cases
    //to first add the history row and later verify it from sync. Doing it this way is also more efficient and faster to update.
    sendExtensionMessage({ method: "beginPauseSync" }, function (response) {
        addCardCommentByApi(idCard, comment, function (response) {
            if (response.status != STATUS_OK) {
                alert("Failed to enter S/E\n" + response.status);
                finished();
                return;
            }

            if (bNoSpentBackend) {
                var member = response.commentObj.memberCreator.username;
                var idBoard = response.commentObj.data.board.shortLink; //this is fresher than the one the caller has
                var strBoard = response.commentObj.data.board.name;
                var idHistoryRowUse = response.commentObj.id;
                if (!bHandleNoBackendDbEntry(s, e, commentBox, idBoard, idCard, strDays, strBoard, cleanTitle, member, idHistoryRowUse, keyword)) {
                    alert("S/E was entered, but there was an error later.\nThis will be corrected on the next Trello sync.");
                }
            }

            $("#plusCardCommentDays").val(g_strNowOption);
            $("#plusCardCommentSpent").val("");
            $("#plusCardCommentEstimate").val("");
            $("#plusCardCommentComment").val("");

            enableSEBar();

            if (titleCard) {
                renameCard($.cookie("token"), idCard, titleCard, function (response) {
                    if (response.status != STATUS_OK) {
                        alert("Failed to rename card to change S/E\n" + response.status);
                    }
                    finished();
                });
            }
            else
                finished();
        });
    });
}


function addCardCommentByApi(idCard, comment, callback, waitRetry) {
    //https://trello.com/docs/api/card/index.html
    var url = "https://trello.com/1/cards/" + idCard + "/actions/comments?text=" + encodeURIComponent(comment) + "&token=";
    url = url + $.cookie("token"); //trello requires the extra token besides the cookie to prevent accidental errors from extensions
    var xhr = new XMLHttpRequest();
    xhr.withCredentials = true; //not needed but might be chrome bug? placing it for future
    xhr.onreadystatechange = function (e) {
        if (xhr.readyState == 4) {
            handleFinishRequest();

            function handleFinishRequest() {
                var objRet = { status: "unknown error", hasPermission: false };
                var bReturned = false;

                if (xhr.status == 200) {
                    try {
                        objRet.hasPermission = true;
                        objRet.commentObj = JSON.parse(xhr.responseText);
                        objRet.status = STATUS_OK;
                        bReturned = true;
                        callback(objRet);
                    } catch (ex) {
                        objRet.status = "error: " + ex.message;
                    }
                } else {
                    var bDeleted = (xhr.status == 404 || xhr.status == 400); //400 shouldnt really happen. old plus data from spreadsheets has this in cw360 because it was added manually to ss
                    if (xhr.status == 401 || xhr.status == 403 || bDeleted) { //no permission or deleted
                        objRet.hasPermission = false;
                        objRet.status = "error: permission error or deleted";
                        if (bDeleted)
                            objRet.bDeleted = true;
                    }
                    else if (xhr.status == 429) { //too many request, reached quota.
                        var waitNew = (waitRetry || 500) * 2;
                        if (waitNew < 8000) {
                            bReturned = true;
                            setTimeout(function () {
                                addCardCommentByApi(idCard, comment, callback, waitNew);
                            }, waitNew);
                        }
                        else {
                            objRet.status = errFromXhr(xhr);
                        }
                    }
                    else {
                        objRet.status = errFromXhr(xhr);
                    }
                }

                if (!bReturned)
                    callback(objRet);
            }
        }
    };

    xhr.open("POST", url);
    xhr.send();
}


/* detectMovedCards
 *
 * detect when the current user moves a card through trello UI.
 * when so, moves existing card history to the new board
 **/
function detectMovedCards() {

    setInterval(function () {
        if (!g_bReadGlobalConfig || g_bEnableTrelloSync)
            return;
        worker();
    }, 400);

	function worker() {

		var hooked="agile_moveHooked";
		var buttonFindMove = $(".js-submit");
		if (buttonFindMove.length == 0)
			return;

		var iTest = 0;
		var buttonMove = null;
		for (; iTest < buttonFindMove.length; iTest++) {
			var btnTest = buttonFindMove.eq(iTest);
			if (btnTest.hasClass(hooked))
				return;
			if (btnTest.val() != "Move")
				continue;
			var topParent = btnTest.parent().parent().parent();
			if (!topParent.hasClass("pop-over"))
				continue;
			var headerTitle = topParent.find(".header-title").eq(0);
			if (headerTitle.length != 1 || headerTitle.text() != "Move Card")
				continue;
			buttonMove = btnTest;
			break;
		}

		if (buttonMove == null)
			return;
		if (buttonMove.hasClass(hooked))
			return;
		var parent = buttonMove.parent().parent();
		var boardMoveElem = parent.find(".js-board-value").eq(0);
		if (boardMoveElem.length == 0)
			return;
		var idCardCur = getIdCardFromUrl(document.URL);
		if (!idCardCur)
			return;
		buttonMove.addClass(hooked);
		var spanIcon = $('<span></span>').css("margin-left", "4px");
		var icon = $("<img>").attr("src", chrome.extension.getURL("images/icon16.png")).css("margin-bottom", "-3px");
		//icon.addClass("agile-spent-icon-header");
		icon.attr("title", "Plus will move S/E data to the new board.");
		spanIcon.append(icon);
		spanIcon.insertAfter(buttonMove);

		var boardCur = getCurrentBoard();
		buttonMove.click(function () {
			var boardNameNew = boardMoveElem.text();
			if (boardNameNew == boardCur)
				return;
			if (isBackendMode()) {
				setTimeout(function () {
					alert("Plus for Trello: After pressing OK, Plus will take you to the moved card. You must report an S/E of 0/0 once there."); //review zig automate this.
					window.location.href = "https://trello.com/c/" + idCardCur;
				}, 300);
				return;
			} else {
				function handleIdNotFound(idCardCur) {
					alert("IMPORTANT: Plus for Trello could not find the new board (has not been used yet in Plus). To correct, please enter an S/E of 0/0 on the card after pressing OK.");
					window.location.href = "https://trello.com/c/" + idCardCur;
				}

				var userCur = getCurrentTrelloUser();
				if (userCur == null) {
					handleIdNotFound(idCardCur);
					return;
				}

				FindIdBoardFromBoardName(boardNameNew, idCardCur, function (idBoardFound) {
					if (idBoardFound == null)
						handleIdNotFound(idCardCur);
					else
						doInsert00History(idCardCur, idBoardFound, boardNameNew, userCur, boardCur);
				});
			}
		});
	}
}

/* FindIdBoardFromBoardName
 * 
 * does callback(idBoard).
 * WARNING: can return null even on a valid board. Happens when board hasnt been accesed by the user through Plus.
 *
**/
function FindIdBoardFromBoardName(boardNameNew, idCard, callback) {
    //idCard may be null;

    function getFromTrelloApi(callbackFind) {
        sendExtensionMessage({ method: "getTrelloCardData", tokenTrello: null, idCard: idCard, fields: "id", bBoardShortLink:true },
            function (response) {
                if (response.status != STATUS_OK || !response.card || !response.card.board || !response.card.board.shortLink)
                    callbackFind(null);
                else
                    callbackFind(response.card.board.shortLink);
            });
    }

    function getFromBoardNameSql(callbackFind) {
        var sql = "select idBoard FROM boards WHERE name=?";
        var values = [boardNameNew];
        getSQLReport(sql, values,
            function (response) {
                if (response.rows === undefined || response.rows.length != 1 || !response.rows[0].idBoard) {
                    callbackFind(null);
                } else {
                    callbackFind(response.rows[0].idBoard);
                }
            });
    }

    function getFromCardSql(callbackFind) {
        if (!idCard) {
            callbackFind(null);
            return;
        }
        var sql = "select idBoard FROM cards WHERE idCard=?";
        var values = [idCard];
        getSQLReport(sql, values,
            function (response) {
                if (response.rows === undefined || response.rows.length != 1 || !response.rows[0].idBoard) {
                    callbackFind(null);
                } else {
                    callbackFind(response.rows[0].idBoard);
                }
            });
    }

	//First try to get it from storage (more common and usually most up-to-date if the user just entered the board)
	var key = getKeyForIdFromBoard(boardNameNew);
	chrome.storage.local.get(key, function (obj) {
		var value = obj[key];
		//If not in storage look for it on the db
		if (value === undefined) {
            //precedence to trello api as is the most up-to-date
		    getFromTrelloApi(function (idFound) {
		        if (idFound != null) {
		            doSaveBoardValues({ idBoard: idFound }, key); //remember it
		            callback(idFound);
		        }
		        else {
		            getFromCardSql(function (idFound) {
		                if (idFound != null)
		                    callback(idFound);
		                else
		                    getFromBoardNameSql(callback);
		            });
		        }
		    });
		    
		} else {
			callback(value.idBoard);
		}
	});
}

function doInsert00History(idCardCur, idBoardNew, boardNameNew, userCur, boardCur) {
	var sql = "select name FROM cards WHERE idCard=?";
	var values = [idCardCur];
	getSQLReport(sql, values,
		function (response) {
			if (response.rows && response.rows.length == 1 && response.rows[0].name) {
				var nameCard = response.rows[0].name;
				helperInsertHistoryRow(new Date(), idCardCur, idBoardNew, boardNameNew, nameCard, userCur, 0, 0, "Plus: card moved from '"+boardCur+"'");
				sendDesktopNotification("Plus has moved the card's data to the new board.", 8000);
			}
		});
}
