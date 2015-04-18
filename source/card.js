var g_inputSEClass = "agile_plus_addCardSE";
var g_strNowOption = "now";

var g_strDateOtherOption = "other";
var g_valDayExtra = null; //for "other" date in S/E bar

var g_strUserOtherOption = "other";
var g_valUserExtra = null; //for "other" added user in S/E bar

var g_strNoteBase = "type note.";

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

var g_seCardCur = null; //null means not yet initialized review zig cleanup into a class
function getSeCurForUser(user) { //note returns null when not loaded yet
    assert(user);
    if (!g_seCardCur)
        return null;
    var map = g_seCardCur[user] || { s: 0, e: 0 };
    return map;
}

function updateEOnSChange(cRetry) {
    cRetry = cRetry || 0;
    var comment = $("#plusCardCommentComment");
    var spinS = $("#plusCardCommentSpent");
    var spinE = $("#plusCardCommentEstimate");
    var comboUsers = $("#plusCardCommentUsers");

    setTimeout(function () {
        var valS = spinS.val() || "";
        bHilite = false;
        if (isRecurringCard()) {
            spinE.val(valS);
            bHilite = true;
        }
        else if (!g_bAllowNegativeRemaining) {
            if (g_seCardCur == null) { //user report not loaded yet
                if (cRetry < 3) {
                    setTimeout(function () {
                        if (spinS.is(":focus"))
                            updateEOnSChange(cRetry + 1);
                    }, 200);
                }
                return; 
            }
            var userCur=getUserFromCombo(comboUsers);
            var mapSeCur = getSeCurForUser(userCur);
            var sNew = mapSeCur.s + parseSEInput(spinS, false, true);
            var floatDiff = sNew - mapSeCur.e; //compare with original e
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
    var userElem = $("#plusCardCommentUsers");
    if (comment.length == 0 || spinS.length == 0 || spinE.length == 0 || userElem.length==0)
        return;

    var userCur = getUserFromCombo(userElem);
    if (!userCur)
        return;
    var mapSe = getSeCurForUser(userCur);
    if (mapSe == null)
        return;


    var sRaw = spinS.val();
    var eRaw = spinE.val();

    var sParsed = parseSEInput(spinS, false, true);
    var eParsed = parseSEInput(spinE, false, true);

    if ((sRaw.length == 0 && eRaw.length == 0) || sParsed == null || eParsed == null) {
        comment.attr("placeholder", g_strNoteBase);
        return;
    }

    var sumS = sParsed + mapSe.s;
    var sumE = eParsed + mapSe.e;
    var rDiff = parseFixedFloat(sumE - sumS);
    var noteFinal=g_strNoteBase + " R will be " + rDiff + "."+(rDiff!=0? "":" Increase E if not done.");
    comment.attr("placeholder", noteFinal);
    comment.attr("title", noteFinal);
}

function getUserFromCombo(combo) {
    var userCur = combo.val();
    if (userCur == g_strUserMeOption)
        userCur = getCurrentTrelloUser();
    return userCur;
}

function isRecurringCard() {
    var elemTitle = $(".window-title-text");
    if (elemTitle.length == 0)
        return false; //no longer in card window. just pretend not recurring
    var titleCur = elemTitle.text();
    var bRecurring = (titleCur.indexOf(TAG_RECURRING_CARD) >= 0);
    return bRecurring;
}

function fillComboKeywords(comboKeywords,rg, kwSelected) {
    function add(str, kwSelected) {
        var optAdd = new Option(str, str);
        comboKeywords.append($(optAdd));
        if (str == kwSelected)
            optAdd.selected = true;
    }

    comboKeywords.empty();
    for (var i = 0; i < rg.length; i++) {
        add(rg[i], kwSelected);
    }
}

function fillComboUsers(comboUsers, userSelected) {
    var sql = "select username from USERS order by username";
    var userMe = getCurrentTrelloUser();
    var user = g_strUserMeOption;
    comboUsers.empty();
    comboUsers.append($(new Option(user, user))); //make it available right away as caller might select it
    getSQLReport(sql, [],
		function (response) {
		    var map = {};
		    function add(user) {
		        var opt = new Option(user, user);
		        if (user == userSelected)
		            opt.selected = true;
		        comboUsers.append($(opt));

		    }
		    if (response.status == STATUS_OK) {
		        for (var i = 0; i < response.rows.length; i++) {
		            user = response.rows[i].username;
		            if (user == g_valUserExtra)
		                g_valUserExtra = null;
		            if (user == userMe)
		                continue;
		            add(user);
		        }
		    }
		    if (g_valUserExtra)
		        add(g_valUserExtra);
		    add(g_strUserOtherOption);
		});
}

function createCardSEInput(parentSEInput, spentParam, estimateParam, commentParam) {
	var bHasSpentBackend = isBackendMode();
	g_seCardCur = {}; //reset totals

	var container = $("<div></div>").addClass(g_inputSEClass).hide();
	var containerStats = $("<div></div>");
	var tableStats = $("<table class='agile-se-bar-table agile-se-stats tablesorter'></table>");
	var containerBar = $("<table class='agile-se-bar-table agile-se-bar-entry'></table>");
	containerStats.append(tableStats);
	container.append(containerStats);
	container.append(containerBar);
	var row = $("<tr></tr>").addClass("agile-card-background");
	containerBar.append(row);

	var comboUsers = setSmallFont($('<select id="plusCardCommentUsers"></select>').addClass("agile_users_box_input"));
	comboUsers.attr("title", "Click to select the user for this new S/E row.");
	fillComboUsers(comboUsers);
	comboUsers.change(function () {
	    updateNoteR();
	    var combo = $(this);
	    var val = combo.val();
	    if (!val)
	        return;
	    var userNew="";
	    function promptNewUser() {
	        userNew = prompt("Enter the Trello username.\nThat member will see s/e only if is a board member.", userNew);
	        if (userNew)
	            userNew = userNew.trim().toLowerCase();
	        if (userNew && userNew.indexOf("@") == 0)
	            userNew = userNew.substring(1);
	        if (userNew == g_strUserOtherOption)
	            userNew = "";
	        
	        if (userNew)
	            g_valUserExtra = userNew;
	        fillComboUsers(combo, userNew);
	        if (userNew && userNew.indexOf("global")!=0) { //global user is proposed in faq. dont confuse those users.
	            var idCardCur = getIdCardFromUrl(document.URL);
	            if (!idCardCur)
	                return; //shouldnt happen and no biggie if does
	            var board = getCurrentBoard();
	            if (!board)
	                return; //shouldnt happen and no biggie if does
	            FindIdBoardFromBoardName(board, idCardCur, function (idBoardFound) {
	                verifyBoardMember(userNew, idBoardFound, function () {
	                    //user not found as board member
	                    if (!confirm("'"+userNew+"' is not a member of '"+board+"'.\nAre you sure you want to use this user?\nPress OK to use it. Press Cancel to type it again.")) {
	                        promptNewUser();
	                    }
	                });
	            });
	        }
	    }

	    if (val == g_strUserOtherOption)
	        promptNewUser();
	});

	var comboDays = setSmallFont($('<select id="plusCardCommentDays"></select>').addClass("agile_days_box_input"));
	comboDays.attr("title", "Click to pick how many days ago it happened.");
	var iDays = null;
	var iLast = 9;
	if (bHasSpentBackend)
	    iLast = 2;
	function fillDaysList(cDaySelected) {
	    function addItem(iDays, iDaysSelected) {
	        var bSelected = (iDays == iDaysSelected);
	        var str = null;
	        if (iDays == g_strDateOtherOption)
	            str = iDays;
	        else if (iDays == 0)
	            str = g_strNowOption;
	        else
	            str = "-" + iDays + "d";
	        var optAdd = new Option(str, str);
	        if (bSelected)
	            optAdd.selected = true;
	        comboDays.append($(optAdd));
	    }

	    comboDays.empty();
	    addItem(0, cDaySelected);
	    for (iDays=1; iDays <= iLast; iDays++)
	        addItem(iDays, cDaySelected);

	    if (g_valDayExtra)
	        addItem(g_valDayExtra, cDaySelected);
	    addItem(g_strDateOtherOption, -1); //-1 so its different from all others
	}

	fillDaysList(0);
	comboDays.change(function () {
	        var combo = $(this);
	        var val = combo.val();
	        if (!val)
	            return;
	        if (val == g_strDateOtherOption) {
	            function process(dayNew) {
	                if (dayNew) {
	                    if (dayNew > iLast)
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

	            
	            getSEDate(function (dateIn) {
	                if (!getIdCardFromUrl(document.URL))
	                    return; //rare. user managed to close the card but not the date dialog.
	                var date = 0;
	                if (dateIn)
	                    date = getDeltaDates(dateNow, dateIn);
	                process(date);
	            });
	        }
	});
	var spinS = setNormalFont($('<input id="plusCardCommentSpent" placeholder="S"></input>').addClass("agile_spent_box_input"));
	spinS.attr("title", "Click to type Spent.");
	spinS[0].onkeypress = function (e) { validateSEKey(e); };
    //thanks for "input" http://stackoverflow.com/a/14029861/2213940
	spinS.bind("input", function (e) { updateEOnSChange(); });
	var spinE = setNormalFont($('<input id="plusCardCommentEstimate" placeholder="E"></input>').addClass("agile_estimation_box_input"));
	spinE.attr("title", "Click to type Estimate.");
	spinE[0].onkeypress = function (e) { validateSEKey(e); };
	spinE.bind("input", function (e) { updateNoteR(); });
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
    
	var comboKeyword = null; //stays null when the user only uses one keyword
	if (g_optEnterSEByComment.IsEnabled()) {
	    var rgkeywords = g_optEnterSEByComment.getAllKeywordsExceptLegacy();
	    if (rgkeywords.length > 1) {
	        comboKeyword = setSmallFont($('<select id="plusCardCommentKeyword"></select>').addClass("agile_users_box_input"));
	        comboKeyword.attr("title", "Click to pick a different keyword for this new S/E row.");
	        fillComboKeywords(comboKeyword, rgkeywords, null);
	        row.append($('<td />').addClass("agile_tablecellItem").append($("<div>").addClass("agile_keywordsComboContainer").append(comboKeyword)));
	    }
	}
	
	row.append($('<td />').addClass("agile_tablecellItem").append($("<div>").addClass("agile_usersComboContainer").append(comboUsers)));
	row.append($('<td />').addClass("agile_tablecellItem").append(comboDays));
	row.append($('<td />').addClass("agile_tablecellItem").append(spinS));
	row.append($('<td />').addClass("agile_tablecellItem").append(slashSeparator));
	row.append($('<td />').addClass("agile_tablecellItem").append(spinE));
	row.append($('<td />').addClass("agile_tablecellItem").append(comment).width("100%")); //takes remaining hor. space
	row.append($('<td />').addClass("agile_tablecellItemLast").append(buttonEnter));

	
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
			var keyword = null;
			if (comboKeyword)
			    keyword = comboKeyword.val();
			var s = parseSEInput(spinS);
			var e = parseSEInput(spinE);
			if (s == null) {
			    hiliteOnce(spinS, 500);
			    return;
			}

			if (e == null) {
			    hiliteOnce(spinE, 500);
			    return;
			}

			if (g_seCardCur == null) {
			    alert("Not ready. Try in a few seconds.");
			    return;
			}
			
			var userCur = getUserFromCombo(comboUsers);

			if (!userCur)
			    return; //shouldnt happen but for safety
			
			var mapSe = getSeCurForUser(userCur);
			assert(mapSe); //we checked g_seCardCur above so it should exist
			var sTotal = parseFixedFloat(mapSe.s + s);
			var eTotal = parseFixedFloat(mapSe.e + e);

			if (!verifyValidInput(sTotal, eTotal))
			    return;
			var prefix = comboDays.val();
			if (!prefix || prefix == g_strDateOtherOption) {
			    hiliteOnce(comboDays, 500);
			    return;
			}
			var valComment = replaceBrackets(comment.val());

			if (s == 0 && e == 0 && valComment.length == 0) {
			    hiliteOnce(spinS, 500);
			    hiliteOnce(spinE, 500);
			    return;
			}
			function onBeforeStartCommit() {
			    var seBarElems = $(".agile-se-bar-table *");
			    seBarElems.prop('disabled', true);
			    $(".agile_enter_box_input").text("...");
			    setBusy(true);
			}

			function onFinished(bOK) {
			    var seBarElems = $(".agile-se-bar-table *");
			    //enable S/E bar
			    setBusy(false);
			    seBarElems.prop('disabled', false);
			    $(".agile_spent_box_input").focus();
			    $(".agile_enter_box_input").text("Enter");

			    if (bOK) {
			        comboUsers.val(g_strUserMeOption); //if we dont reset it, a future timer could end up in the wrong user
			        comboDays.val(g_strNowOption);
			        $("#plusCardCommentSpent").val("");
			        $("#plusCardCommentEstimate").val("");
			        $("#plusCardCommentComment").val("");
			    }
			    //reports etc will refresh in the NEW_ROWS notification handler
			}

			//review zig settimeout is a leftover back when plus faked clicks. not needed anymore but doesnt hurt
			setTimeout(function () { setNewCommentInCard(keyword, s, e, valComment, prefix, userCur, onBeforeStartCommit, onFinished); }, 0);
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

function verifyBoardMember(userLowercase, idShortBoard, callbackNotFound) {
    assert(callbackNotFound);
    sendExtensionMessage({ method: "getTrelloBoardData", tokenTrello: null, idBoard: idShortBoard, fields: "memberships&memberships_member=true&memberships_member_fields=username" },
            function (response) {
                if (response.status != STATUS_OK || !response.board)
                    return;
                var members = response.board.memberships;
                if (!members)
                    return;
                for (var i = 0; i < members.length; i++) {
                    var member = members[i].member;
                    if (member && member.username && member.username.toLowerCase() == userLowercase)
                        break; //found
                }
                if (i == members.length)
                    callbackNotFound();
            });
}

function getSEDate(callback) {
    function getDate(elemDate) {
        var str = elemDate.val();
        var rg = str.split("-");
        if (rg.length != 3) {
            return null;
        }
        var year = parseInt(rg[0], 10);
        var month = parseInt(rg[1], 10) - 1;
        var day = parseInt(rg[2], 10);
        return new Date(year, month, day);
    }

    var divDialog = $(".agile_dialog_SEDate");
    var elemDate = null;
    var elemCommentDate = null;
    var dateNow = new Date();
    var dateMin = new Date();
    dateMin.setDate(dateMin.getDate() + g_dDaysMinimum);

    if (divDialog.length == 0) {
        divDialog = $('\
<dialog class="agile_dialog_SEDate agile_dialog_DefaultStyle"> \
<h2>Pick a date</h2><br> \
<input id="dialog_SEDate_date" type="date"/> \
<div id="dialog_SEDate_comment"></div> \
<button id="agile_dialog_SEDate_ok">Select</button> \
<button id="agile_dialog_SEDate_cancel">Cancel</button> \
</dialog>');
        $("body").append(divDialog);
        divDialog = $(".agile_dialog_SEDate");

        elemDate = divDialog.find("#dialog_SEDate_date");
        elemCommentDate = divDialog.find("#dialog_SEDate_comment");

        elemDate.change(function () {
            var dateCur = getDate(elemDate);
            var strMsg = "";
            if (dateCur) {
                var delta = getDeltaDates(new Date(), dateCur);
                if (delta > 0)
                    strMsg = "" +delta + (delta==1? " day" : " days")+" ago.";
            }
            elemCommentDate.text(strMsg);
        });
    }
    
    elemCommentDate = divDialog.find("#dialog_SEDate_comment");
    var strDateNow = makeDateOnlyString(dateNow);
    elemDate = divDialog.find("#dialog_SEDate_date");
    elemDate.prop("min", makeDateOnlyString(dateMin));
    elemDate.prop("max", strDateNow);
    elemDate.prop("value", strDateNow);
    elemCommentDate.text("");

    divDialog.find("#agile_dialog_SEDate_cancel").off("click.plusForTrello").on("click.plusForTrello", function (e) {
        callback(null);
        divDialog[0].close();
    });

    divDialog.find("#agile_dialog_SEDate_ok").off("click.plusForTrello").on("click.plusForTrello", function (e) {
        var dateCur = getDate(elemDate);
        var bOK = false;

        if (dateCur) {
            var delta = getDeltaDates(new Date(), dateCur);
            if (delta >= 0 && delta <= (-1 * g_dDaysMinimum))
                bOK = true;
        }

        if (!bOK) {
            alert("pick a date before today");
            return;
        }
        callback(dateCur);
        divDialog[0].close();
    });

    divDialog.off("keydown.plusForTrello").on("keydown.plusForTrello", function (evt) {
        //need to capture manually before trello captures it and closes the card.
        //note this doesnt cover all cases like focus being in another dialog element
        if (evt.keyCode === $.ui.keyCode.ESCAPE) {
            evt.stopPropagation();
            callback(null);
            divDialog[0].close();
        }
    });

    divDialog[0].showModal();
}

function verifyValidInput(sTotal, eTotal) {
    var rTotal = parseFixedFloat(eTotal - sTotal);
    var err = null;
    if (sTotal < 0)
        err = "Spent total will go negative.";
    else if (eTotal < 0)
        err = "Estimate total will go negative.";
    else if (rTotal < 0 && !g_bAllowNegativeRemaining) 
        err = "Spent total will be larger than estimate total.\nIf you dont need to track remaining, set it in Preferences, 'Allow negative Remaining' (Plus help.)";

    if (err != null) {
        err = err + "\n\nAre you sure you want to enter this S/E row?";
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
                //reset totals
                g_seCardCur = {};
                var elemRptLink = containerStats.find(".agile_card_report_link");
                if (response.status == STATUS_OK && (response.rows.length > 0 || isTourRunning())) {
                    elemRptLink.show();
                    if (elemRptLink.length == 0)
                        containerStats.prepend($('<a class="agile_card_report_link agile_link_noUnderline" href="' + chrome.extension.getURL("report.html?idCard=") + encodeURIComponent(idCard) + '" target="_blank">Card Report - Plus</a>'));
                    var i = 0;
                    //<span style="vertical-align: top;position: relative; top: -0.3em;font-size:0.7em">st</span>
                    var headTable = $("<thead>");
                    tableStats.append(headTable);
                    addCardSERowData(headTable, {
                        user: 'By User',
                        spent: 'S <span style="font-size:0.85em">sum</span>',
                        estOrig: '<span>E 1ˢᵗ</span>',
                        est: 'E <span style="font-size:0.85em">sum</span>',
                        remain: 'R <span style="font-size:0.80em">(E-S)</span>'
                    }, true);
                    var bodyTable = $("<tbody>");
                    tableStats.append(bodyTable);
                    if (response.rows.length == 0) //tour is running
                        addCardSERowData(bodyTable, {
                            user: 'sample user',
                            spent: '0', estOrig: '0',
                            est: '0',
                            remain: '0',
                            bSample: true
                        }, false);
                    for (; i < response.rows.length; i++) {
                        var rowData = response.rows[i];
                        rowData.estOrig = mapEstOrig[rowData.user] || 0;
                        addCardSERowData(bodyTable, rowData, false);
                        var mapCur = g_seCardCur[rowData.user];
                        if (!mapCur) {
                            mapCur = {
                                s: rowData.spent,
                                e: rowData.est
                            };
                            g_seCardCur[rowData.user] = mapCur;
                        } else {
                            mapCur.s = mapCur.s + rowData.spent;
                            mapCur.e = mapCur.e + rowData.est;
                        }
                    }
                }
                else {
                    elemRptLink.hide();
                }
                updateNoteR();
                tableStats.tablesorter({
                    headers: {
                        0: {
                            sorter: 'links' //our custom sorter
                        }
                    }
                });
                if (callback)
                    callback();
            });
    });
}

function showSETotalEdit(sVal, eVal, user) {
    var divDialog = $(".agile_dialog_editSETotal");
    if (divDialog.length==0) {
        divDialog = $('\
<dialog class="agile_dialog_editSETotal agile_dialog_DefaultStyle"> \
<h2 class="agile_mtse_title"></h2><br> \
<select class="agile_mtse_keywords" title="Pick the keyword for this modification."></select> \
<a class="agile_mtse_kwReportLink" href="" target="_blank">view keyword report</a> \
<table class="agile_seTotalTable"> \
<tr> \
<td align="left">S sum</td> \
<td align="left">E sum</td> \
<td align="left">R</td> \
</tr> \
<tr> \
<td align="left"><input class="agile_modify_total_se_input agile_mtse_s"></input></td> \
<td align="left"><input class="agile_modify_total_se_input agile_mtse_e"></input></td> \
<td align="left"><input class="agile_modify_total_se_input agile_mtse_r"></input></td> \
</tr> \
</table> \
<input class="agile_mtse_note" placeholder="note (optional)"></input> \
<button id="agile_modify_SETotal">Modify</button> \
<button id="agile_cancel_SETotal">Cancel</button> \
<br><br><p class="agile_mtseMessage"></p> \
<A style="float:right" href="http://plusfortrello.blogspot.com/2014/12/plus-for-trello-se-card-comment-format.html" target="_blank">help</A> \
</dialog>');
        $("body").append(divDialog);
        divDialog = $(".agile_dialog_editSETotal");
        divDialog.find("#agile_cancel_SETotal").click(function (e) {
            divDialog[0].close();
        });

        divDialog.on('keydown', function (evt) {
            //need to capture manually before trello captures it and closes the card.
            //note this doesnt cover all cases like focus being in another dialog element
            if (evt.keyCode === $.ui.keyCode.ESCAPE) {
                evt.stopPropagation();
                divDialog[0].close();
            }                
        });
    }
    var comboKeyword = divDialog.find(".agile_mtse_keywords");
    var elemKwLink = divDialog.find(".agile_mtse_kwReportLink");
    
    var bHideComboKeyword=true;
    if (g_optEnterSEByComment.IsEnabled()) {
        var rgkeywords = g_optEnterSEByComment.getAllKeywordsExceptLegacy();
        if (rgkeywords.length > 1) {
            bHideComboKeyword = false;
            fillComboKeywords(comboKeyword, rgkeywords, comboKeyword.val());
            comboKeyword.show();
            elemKwLink.show();
        }
    }
    if (bHideComboKeyword) {
        comboKeyword.hide();
        elemKwLink.hide();
    }
    else {
        var idCard = getIdCardFromUrl(document.URL);
        elemKwLink.attr("href", chrome.extension.getURL("report.html?idCard=" + encodeURIComponent(idCard)+"&groupBy=keyword&orderBy=date&user=" + user + "&deleted=0"));
    }
    
    var elemTitle = divDialog.find(".agile_mtse_title");
    elemTitle.html("Modify total S/E for " + user);
    function setSEVal(elem, val) {
        if (val == 0)
            val = "";
        elem.val(val);
    }

    var elemS = divDialog.find(".agile_mtse_s");
    setSEVal(elemS,sVal);

    var elemE=divDialog.find(".agile_mtse_e");
    setSEVal(elemE,eVal);

    var sOrig = sVal;
    var eOrig = eVal;
    var sOrigNum = parseFixedFloat(sOrig);
    var eOrigNum = parseFixedFloat(eOrig);
    var elemMessage = divDialog.find(".agile_mtseMessage");
    var elemNote = divDialog.find(".agile_mtse_note");
    var strMessageInitial = "Once you modify totals Plus will enter a new S/E row with the needed difference.";
    var elemR = divDialog.find(".agile_mtse_r");
    elemMessage.text(strMessageInitial);
    elemNote.val("");
    elemR.val(parseFixedFloat(eOrigNum - sOrigNum));
    elemR.prop('disabled', true);
    function updateMessage() {
        var data = getSEData(true);
        var strMessageNew = null;
        if (data.s == 0 && data.e == 0)
            strMessageNew=strMessageInitial;
        else
            strMessageNew = "" + data.s + "/" + data.e + " will be added to " + user + " in a new S/E row.";
        
        elemMessage.text(strMessageNew);
        elemR.val(parseFixedFloat(eOrigNum + data.e - sOrigNum-data.s));
    }

    function getSEData(bSilent) {
        var sNew = elemS.val().trim();
        var eNew = elemE.val().trim();
        var sNewNum = parseFixedFloat(sNew);
        var eNewNum = parseFixedFloat(eNew);
        var sDiff = parseFixedFloat(sNewNum - sOrigNum);
        var eDiff = parseFixedFloat(eNewNum - eOrigNum);
        if (!bSilent && !verifyValidInput(sNewNum, eNewNum))
            return null;
        var kw = null;
        if (!bHideComboKeyword)
            kw = comboKeyword.val();
        return { s: sDiff, e: eDiff, keyword:kw };
    }

    divDialog.find("#agile_modify_SETotal").off("click.plusForTrello").on("click.plusForTrello", function (e) {

        function onBeforeStartCommit() {
            var elems = $(".agile_dialog_editSETotal *");
            elems.prop('disabled', true);
            setBusy(true);
        }

        function onFinished(bOK) {
            var elems = $(".agile_dialog_editSETotal *");
            //enable S/E bar
            elems.prop('disabled', false);
            elemR.prop('disabled', true);
            setBusy(false);
            if (bOK) {
                divDialog[0].close();
            }
            //reports etc will refresh in the NEW_ROWS notification handler
        }

        //review zig settimeout is a leftover back when plus faked clicks. not needed anymore but doesnt hurt
        var data = getSEData(false);
        if (!data)
            return;
        if (data.s == 0 && data.e == 0) {
            alert("nothing to do!");
            return;
        }
        var note = replaceBrackets(elemNote.val());
        setTimeout(function () {
            setNewCommentInCard(data.keyword, data.s, data.e, note, "", //empty prefix means time:now
                user, onBeforeStartCommit, onFinished);
        }, 0);
    });

    elemS.unbind().bind("input", function (e) { updateMessage(); });
    elemE.unbind().bind("input", function (e) { updateMessage(); });
    divDialog[0].showModal();
}

function addCardSERowData(tableStats, rowData, bHeader) {
	var row = $("<tr></tr>").addClass("agile-card-background").addClass("agile-card-statrow");
	if (bHeader)
	    row.addClass("agile-card-background-header");
	else
	    row.addClass("agile-card-statrow-data");
	var td = (bHeader ? '<th />' : '<td />');
	var u = null;
	if (bHeader) {
	    u = $(td).html(rowData.user + g_hackPaddingTableSorter);
	}
	else {
	    var urlReport = '<a class="agile_link_noUnderline" href="' + chrome.extension.getURL("report.html?idCard=") + encodeURIComponent(rowData.idCard) + '&user=' + rowData.user + '" target="_blank">' + rowData.user + '</a>';
	    u = $(td).html(urlReport);
	}

	var bSample = (rowData.bSample);
	var sVal = (typeof (rowData.spent) == 'string' ? rowData.spent : parseFixedFloat(rowData.spent));
	var eOrigVal = (typeof (rowData.estOrig) == 'string' ? rowData.estOrig : parseFixedFloat(rowData.estOrig));
	var eVal = (typeof (rowData.est) == 'string' ? rowData.est : parseFixedFloat(rowData.est));
	var rVal =  (typeof (rowData.remain) == 'string' ? rowData.remain : parseFixedFloat(eVal - sVal));
	var s = $(td);
	var eOrig = $(td).addClass("agile-card-first-estimate-header");
	var e = $(td).addClass("agile-card-now-estimate-header");
	var r = $(td);
	var linkMod = $(td).addClass("agile-card-seByUserModify");
	if (bHeader) {
	    s.html(sVal+ g_hackPaddingTableSorter);
	    eOrig.html(eOrigVal + g_hackPaddingTableSorter + g_hackPaddingTableSorter);
	    e.html(eVal + g_hackPaddingTableSorter + g_hackPaddingTableSorter);
	    r.html(rVal + g_hackPaddingTableSorter + g_hackPaddingTableSorter);
	}
	else {
	    s.text(sVal);
	    eOrig.text(eOrigVal);
	    e.text(eVal);
	    r.text(rVal);
	    if (true) {
	        var strAnchorMod = '<a class="agile_linkSoftColor" href="" target="_blank">modify</a>';
	        linkMod.html(strAnchorMod);
	        linkMod.children("a").click(function (e) {
	            e.preventDefault();
	            if (bSample) {
	                alert("This is just a sample row and cannot be modified.");
	                return;
	            }
	            showSETotalEdit(sVal, eVal, rowData.user);
	        });
	    }
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
	var dateLast = (rowData.date? new Date(rowData.date*1000) : new Date());
	if (!bHeader)
	    u.attr("title", "last S/E " + dateLast.toLocaleDateString() + "\nClick to drill-down");
	row.append(u).append(s).append(eOrig).append(e).append(r);
	if (!bHeader)
	    row.append(linkMod);
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
			    bNewCommentFound = elemParent.hasClass("new-comment");

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
" + kw + " 7 : (without '/') spends 7/0 or 7/7 for recurring [R] cards.\n\n\
Click for more.");
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
		var regexp = /#([\S-]+)/g;
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
 * will add given S/E to existing values in the controls
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

//review rename commentBox to noteBox
function setNewCommentInCard(keywordUse, s, e, commentBox,
    prefix, //blank uses default (first) keyword
    member, //null means current user
    onBeforeStartCommit, //called before all validation passed and its about to commit
    onFinished) {        //called after commit finished or failed. onFinished(bOK)
	if (prefix == g_strNowOption || prefix == null)
		prefix = "";
	var comment = "";
	if (!keywordUse)
	    keywordUse = g_optEnterSEByComment.getDefaultKeyword();

	s = Math.round(s * 100) / 100;
	e = Math.round(e * 100) / 100;
	
	comment = keywordUse + " ";
	if (member == g_strUserMeOption)
	    member = null; //defaults later to user
	if (member && member != getCurrentTrelloUser())
	    comment = comment + "@" + member + " ";
	if (prefix.length > 0)
		comment = comment + " " + prefix + " ";
	comment = comment + s + "/" + e + " " + commentBox;

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
		    doEnterSEIntoCard(s, e, commentBox, comment, idBoardUse, idCardCur, prefix, board, keywordUse, member, onBeforeStartCommit, onFinished);
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

	if (userCur && userCur != getCurrentTrelloUser() && userCur != g_strUserMeOption) //review zig me shouldnt be needed
	    commentBox = "[by " + getCurrentTrelloUser() + "] " + commentBox;

	helperInsertHistoryRow(dateNow, idCard, idBoard, strBoard, cleanTitle, userCur, s, e, commentBox, idHistoryRowUse, keyword);
	return true;
}


function helperInsertHistoryRow(dateNow, idCard, idBoard, strBoard, strCard, userCur, s, e, comment, idHistoryRowUse, keyword) {
    var obj = makeHistoryRowObject(dateNow, idCard, idBoard, strBoard, strCard, userCur, s, e, comment, idHistoryRowUse, keyword);
	insertHistoryRowFromUI(obj);
}

function doEnterSEIntoCard(s, e, commentBox, comment, idBoard, idCard, strDays, strBoard, keyword, member, onBeforeStartCommit, onFinished) {
	var elem = null;
	var titleCur = null;
	var cleanTitle = null;

	elem = $(".window-title-text");
	if (elem.length == 0)
	    return; //trello html broke.
	titleCur = elem.text();
	var se = parseSE(titleCur, true, g_bAcceptSFT);
	cleanTitle = se.titleNoSE;

	var titleCardNew = null;
	var commentEnter = comment;

	if (!g_optEnterSEByComment.IsEnabled() && g_configData && g_strServiceUrl && g_strServiceUrl != "") {
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
	
	handleEnterCardComment(titleCardNew, commentEnter, idCard, s, e, commentBox, strDays, cleanTitle, keyword, member, onBeforeStartCommit, onFinished);
}

function handleEnterCardComment(titleCard, comment, idCard, s, e, commentBox, strDays, cleanTitle, keyword, member, onBeforeStartCommit, onFinished) {
    onBeforeStartCommit();

    function finished(bOK) {
        onFinished(bOK);
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
                finished(false);
                return;
            }

            if (!member)
                member = response.commentObj.memberCreator.username;
            var idBoard = response.commentObj.data.board.shortLink; //this is fresher than the one the caller has
            var strBoard = response.commentObj.data.board.name;
            var idHistoryRowUse = response.commentObj.id;
            if (!bHandleNoBackendDbEntry(s, e, commentBox, idBoard, idCard, strDays, strBoard, cleanTitle, member, idHistoryRowUse, keyword)) {
                alert("S/E was entered, but there was an error later.\nThis will be corrected on the next sync of the card comment.");
            }

            if (titleCard) {
                renameCard($.cookie("token"), idCard, titleCard, function (response) {
                    if (response.status != STATUS_OK) {
                        alert("Failed to rename card to change S/E\n" + response.status);
                    }
                    finished(true);
                });
            }
            else
                finished(true);
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