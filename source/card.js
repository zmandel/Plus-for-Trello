/// <reference path="intellisense.js" />

var g_inputSEClass = "agile_plus_addCardSE";
var g_strNowOption = "now";
var g_bShowSEBar = false;
const ID_BOARD_PLUSHELP = "0jHOl1As";

var g_valDayExtra = null; //for "other" date in S/E bar
var g_valUserExtra = null; //for "other" added user in S/E bar
var g_regexValidateSEKey = /[0-9]|\.|\:|\-/;
const g_iLastComboDays = 9;
var g_timeoutComboDaysUpdate = null;
var g_msdateFillDaysList = 0;


function validateSEKey(evt) {
	var theEvent = evt || window.event;
	var key = theEvent.keyCode || theEvent.which;
	key = String.fromCharCode(key);
	if (!g_regexValidateSEKey.test(key)) {
		theEvent.returnValue = false;
		if (theEvent.preventDefault)
		    theEvent.preventDefault();
	}
}

var g_seCardCur = null; //null means not yet initialized review zig cleanup into a class

function rememberSEUser(user) {
    if (!g_bUseLastSEBarUser)
        return;
    var objNew = {};
    objNew[SYNCPROP_USERSEBAR_LAST] = user;
    chrome.storage.sync.set(objNew, function () {
        //ok if fails 
        if (BLastErrorDetected())
            console.error(chrome.runtime.lastError.message);
    });
}

/* getUserLast
 ** thenable
 ** will always resolve to "" when !g_bUseLastSEBarUser or !bUseLast
 ** bUseLast: does NOT mean g_bUseLastSEBarUser. its a shortcut to pass false and resolve to "" for callers that dont want to use userLast
 **/
function getUserLast(bUseLast) {
    var val = ""; //means "me" by callers
    if (!g_bUseLastSEBarUser || !bUseLast)
        return Promise.resolve(val);
    return new Promise(function (resolve, reject) {
        chrome.storage.sync.get([SYNCPROP_USERSEBAR_LAST], function (obj) {
            if (chrome.runtime.lastError)
                console.log(chrome.runtime.lastError.message); //eat it and default to "" (me)
            else
                val = obj[SYNCPROP_USERSEBAR_LAST] || "";
            resolve(val);
        });
    });
}

function getSeCurForUser(user,keyword) { //note returns null when not loaded yet
    assert(user);
    if (g_seCardCur===null)
        return null;
    var retZero = { s: 0, e: 0, kw: {} };
    var map = g_seCardCur[user] || retZero;
    if (!keyword)
        return map;
    return (map.kw[keyword] || retZero);
    }

function updateEOnSChange(cRetry) {
    cRetry = cRetry || 0;
    var comment = $("#plusCardCommentComment");
    var spinS = $("#plusCardCommentSpent");
    var spinE = $("#plusCardCommentEstimate");
    var comboUsers = $("#plusCardCommentUsers");
    var comboKeywords = $("#plusCardCommentKeyword"); //can be empty

    setTimeout(function ()  {
        var valS = spinS.val() || "";
        var bHilite = false;
        var bRecurring = isRecurringCard();
        if (bRecurring) {
            spinE.val(valS);
            bHilite = true;
        }
        else if (!g_bAllowNegativeRemaining) {
            if (g_seCardCur === null) { //user report not loaded yet
                if (cRetry < 3) {
                    setTimeout(function () {
                        if (spinS.is(":focus"))
                            updateEOnSChange(cRetry + 1);
                    }, 200);
                }
                return; 
            }
            var userCur = getUserFromCombo(comboUsers);
            if (!userCur)
                return; //timing related. card window could be gone thus no combo
            var keyword = comboKeywords.val() || ""; //can be empty
            var mapSeCur = getSeCurForUser(userCur, keyword);
            if (!mapSeCur)
                return; //shouldt happen

            var sNew = mapSeCur.s + parseSEInput(spinS, false, true);
            var floatDiff = sNew - mapSeCur.e; //compare with original e
            if (floatDiff <= 0)
                floatDiff = 0;
            var diff = parseFixedFloat(floatDiff);
            if (diff <= 0 || (g_bPreventIncreasedE && mapSeCur.e>0)) {
                assert(!bRecurring);
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
    var spinS = $("#plusCardCommentSpent");
    var spinE = $("#plusCardCommentEstimate");
    var userElem = $("#plusCardCommentUsers");
    var comboKeywords = $("#plusCardCommentKeyword"); //can be empty
    var statusPre = $("#agile-se-bar-status-pre");
    var statusS = $("#agile-se-bar-status-s");
    var statusE = $("#agile-se-bar-status-e");
    var statusR = $("#agile-se-bar-status-r");
    if (statusPre.length == 0 || spinS.length == 0 || spinE.length == 0 || userElem.length == 0)
        return;

    var userCur = getUserFromCombo(userElem);
    if (!userCur)
        return; //user not loaded yet
    var keyword = comboKeywords.val() || "";
	var mapSe = getSeCurForUser(userCur, keyword);
    if (mapSe == null)
        return; // table not loaded yet. this will be called when table loads

    var strLinkHelp = "&nbsp;&nbsp;<a class='agile_linkSoftColor no-print agile_unselectable' href='' target='_blank'>Help</a>";
    var sRaw = spinS.val();
    var eRaw = spinE.val();

    function done() {
        updateCurrentSEData();
        var link = statusR.find("A");
        link.click(function (e) {
            e.preventDefault();
            showSEHelpDialog();
        });
    }

    function clearAll() {
        statusPre.html("&nbsp;");
        statusS.html("");
        statusE.html("");
        statusR.html(strLinkHelp);
    }

    var sParsed = parseSEInput(spinS, false, true, true);
    var eParsed = parseSEInput(spinE, false, true, true);

    if (sParsed == null) {
        clearAll();
        statusPre.html("Bad S format!");
        done();
        return;
    }
    if (eParsed == null) {
        clearAll();
        statusPre.html("Bad E format!");
        done();
        return;
    }

    var sumS = sParsed + mapSe.s;
    var sumE = eParsed + mapSe.e;
    var rDiff = parseFixedFloat(sumE - sumS);

    var rDiffFormatted = rDiff;
    var sSumFormatted = parseFixedFloat(sumS);
    var eSumFormatted = parseFixedFloat(sumE);
    var prefixNote = "sums will be:";
    if (sParsed == 0 && eParsed == 0) {
        if (sumE == 0 && sumS == 0) {
            clearAll();
            done();
            return;
        }
        prefixNote = "sums are:";
    }

    if (sumS < 0 || (!g_bNoEst && (sumE < 0 || (!g_bAllowNegativeRemaining && rDiff < 0))))
        statusPre.closest("tr").addClass("agile_SER_negative").removeClass("agile_SER_normal");
    else
        statusPre.closest("tr").addClass("agile_SER_normal").removeClass("agile_SER_negative");

    statusPre.html(prefixNote);
    statusS.html("S=&#8203;" + sSumFormatted); //see http://stackoverflow.com/a/41913332/2213940 about the zero-width space so it line-breaks on long strings
    statusE.html(g_bNoEst? "" : "E=&#8203;" + eSumFormatted);
    statusR.html(g_bNoEst ? "" : "&nbsp;&nbsp;R=" + rDiffFormatted + (g_bAllowNegativeRemaining || rDiff != 0 ? "" : ". Increase E if not done.") + strLinkHelp);
    done();
}


var g_timeoutUpdateCurrentSEData = null;
function updateCurrentSEData(bForceNow) {
    if (g_timeoutUpdateCurrentSEData) {
        clearTimeout(g_timeoutUpdateCurrentSEData);
        g_timeoutUpdateCurrentSEData = null;
    }

    function worker() {
        var idCardCur = getIdCardFromUrl(document.URL);
        if (!idCardCur)
            return;
        var comment = $("#plusCardCommentComment");
        var spinS = $("#plusCardCommentSpent");
        var spinE = $("#plusCardCommentEstimate");
        var comboUsers = $("#plusCardCommentUsers");
        var comboDays = $("#plusCardCommentDays");
        var comboKeywords = $("#plusCardCommentKeyword");

        var valComment = comment.val();
        var valS = spinS.val();
        var valE = spinE.val();
        var valUser = comboUsers.val() || "";
        var valDays = comboDays.val() || "";
        var valKeyword = (comboKeywords.length==0?"": comboKeywords.val()); //can be empty if combo doesnt exist

        if (valUser == g_strUserOtherOption || valDays == g_strDateOtherOption)
            return;
        g_currentCardSEData.setValues(idCardCur, valKeyword, valUser, valDays, valS, valE, valComment);
    }

    if (bForceNow) {
        worker();
    }
    else {

        g_timeoutUpdateCurrentSEData = setTimeout(function () {
            worker();
        }, 300); //fast-typing users shall not suffer
    }
}


function getUserFromCombo(combo) {
    var userCur = combo.val() || "";
    if (userCur == g_strUserMeOption)
        userCur = getCurrentTrelloUser();
    return userCur || ""; //prevent null
}

function isRecurringCard() {
    var elemTitle = $(".card-detail-title-assist");
    if (elemTitle.length == 0)
        return false; //no longer in card window. just pretend not recurring
    var titleCur = elemTitle.text();
    var bRecurring = (titleCur.indexOf(TAG_RECURRING_CARD) >= 0);
    return bRecurring;
}

function fillComboKeywords(comboKeywords, rg, kwSelected, classItem, strPrependNonDisabled, bNoPrependKWHeader) {
    function add(elem, kwSelected) {
        var str;
        var val;
        var title = "";
        var disabled=false;
        if (typeof (elem) == "string") {
            str = elem;
            val = elem;
        }
        else {
            str=elem.str;
            val = elem.val;
            title = elem.title;
            disabled = elem.disabled || false;
        }

        if (!disabled && strPrependNonDisabled)
            str = strPrependNonDisabled + str;
        var elemOption;
        if (disabled)
            elemOption = $('<optgroup label="' + str + '">');
        else {
            elemOption = $(new Option(str, val));
            if (val == kwSelected)
                elemOption[0].selected = true;
        }
        

        if (classItem)
            elemOption.addClass(classItem);
        if (title)
            elemOption.attr("title", title);
        comboKeywords.append(elemOption);
    }

    comboKeywords.empty();
    if (!bNoPrependKWHeader)
        comboKeywords.append($("<optgroup label='keyword:'></optgroup>"));
    for (var i = 0; i < rg.length; i++) {
        add(rg[i], kwSelected);
    }
}

function fillComboUsers(bUseLast, comboUsers, userSelected, idCard, nameBoard, bDontEmpty, callbackParam) {
    getUserLast(bUseLast).then(userLast => fillComboUsersWorker(comboUsers, userSelected || userLast, idCard, nameBoard, bDontEmpty, callbackParam));
}

function fillComboUsersWorker(comboUsers, userSelected, idCard, nameBoard, bDontEmpty, callbackParam) {

    function callback(status) {
        if (status != STATUS_OK)
            sendDesktopNotification(status);
        if (callbackParam)
            callbackParam(status);
    }
    var sql = "select username from USERS order by username";
    var userMe = getCurrentTrelloUser();
    var user = g_strUserMeOption;
    var userGlobal = g_globalUser; //make a copy
    if (!bDontEmpty) {
        comboUsers.empty();
        comboUsers.append($("<optgroup label='user:'></optgroup>"));
    }
    comboUsers.append($(new Option(user, user))); //make it available right away as caller might select it
    getSQLReport(sql, [],
		function (response) {
		    var map = {};
		    function add(user) {
		        if (g_rgExcludedUsers.indexOf(user)>=0)
		            return;
		        var opt = new Option(user, user);
		        if (user == userSelected)
		            opt.selected = true;
		        comboUsers.append($(opt));

		    }
		    if (response.status == STATUS_OK) {
		        var mapUsers = {};
		        for (var i = 0; i < response.rows.length; i++) {
		            user = response.rows[i].username;
		            mapUsers[user] = true;
		            if (user == userGlobal)
		                userGlobal = "";
		            if (user == g_valUserExtra)
		                g_valUserExtra = null;
		            if (user == userMe)
		                continue;
		            add(user);
		        }

		        FindIdBoardFromBoardName(nameBoard, idCard, function (idBoardFound) {
		            if (!idBoardFound) {
		                callback("board not found. Sync and try again.");
		                return;
		            }
                    
		            getTrelloBoardMembers(idBoardFound, 1000*60*2, function (members) {
		                for (var i = 0; i < members.length; i++) {
		                    var member = members[i].member;
		                    if (!member || !member.username || mapUsers[member.username] || member.username == userMe)
		                        continue;
		                    add(member.username);
		                }
		                if (userGlobal)
		                    add(userGlobal);
		                if (g_valUserExtra)
		                    add(g_valUserExtra);
		                add(g_strUserOtherOption);
		                callback(STATUS_OK);
		            });
		        });
		    } else {
		        callback(response.status);
		    }
		});
}


function showSEButtonBubble(elem) {

    var step = {
        selector: elem,
        text: "Add Plus S/E<br>from here!",
        angle: 180,
        distance: 5,
        size: 150,
        hiliteTime:10000
    };
    showBubbleFromStep(step, true, true, 0);
}

function createSEButton() {
    var parent = $(".new-comment .comment-box-options");
    if (parent.length == 1) {
        var a = $("<A class='comment-box-options-item agile-addSEButton' href='#' title='Add Plus S/E'>");
        var spanIcon = $("<span class='icon-sm'/>");
        var icon = $("<img style='margin-top:2px;'>").attr("src", chrome.extension.getURL("images/iconaddse.png"));

        //icon.addClass("agile-spent-icon-cardcommentSE");
        spanIcon.append(icon);
        a.append(spanIcon);
        parent.prepend(a);
        a.click(function () {
            showSEBarContainer(false,true,false, true);
        });
    }
}

function showSEBarContainer(bDontRemember, bFocusS, bFocusE, bDontHilite) {
    $(".agile-se-bar-entry").show();
    if (!bDontRemember)
        g_bShowSEBar = true;
    if (bFocusS || bFocusE) {
        setTimeout(function () {
            var elemSE = $(bFocusS ? ".agile_spent_box_input" : ".agile_estimation_box_input");
            elemSE.focus();
            if (!bDontHilite) {
                hiliteOnce(elemSE);
                hiliteOnce($("#plusCardCommentUsers"));
            }
        }, 0);
        }
}

function fillDaysList(comboDays, cDaySelected) {
    var iDays = null;
    const bStrSelected = (typeof (cDaySelected) === "string");
    g_msdateFillDaysList = Date.now();
    function addItem(iDays, iDaysSelected) {
        var bSelected = (iDays === iDaysSelected);
        var str = null;
        var title = "";
        if (iDays == g_strDateOtherOption)
            str = iDays;
        else if (iDays == 0) {
            str = g_strNowOption;
            title = "today";
        }
        else {
            str = "-" + iDays + "d";
            title = "" + iDays + (iDays == 1 ? " day ago" : " days ago");
            var dateNow = new Date();
            dateNow.setDate(dateNow.getDate() - iDays);
            title = title + ": " + getWeekdayName(dateNow.getDay()) + " " + dateNow.toLocaleDateString();
        }
        var optAdd = new Option(str, str);
        if (bStrSelected)
            bSelected = (str === iDaysSelected);
        if (bSelected)
            optAdd.selected = true;
        comboDays.append($(optAdd).attr("title", title));
    }

    comboDays.empty();
    comboDays.append($("<optgroup label='days ago:'></optgroup>"));
    addItem(0, cDaySelected);
    for (iDays = 1; iDays <= g_iLastComboDays; iDays++)
        addItem(iDays, cDaySelected);

    if (g_valDayExtra)
        addItem(g_valDayExtra, cDaySelected);
    addItem(g_strDateOtherOption, -1); //-1 so its different from all others
}

function promptNewUser(combo, idCardCur, callbackParam) {
    function callback() {
        if (callbackParam)
            callbackParam();
    }

    var userNew = prompt("Enter the Trello username.\nThat member will see s/e only if is a board member.\n\nTo hide users from the s/e bar, see Plus Preferences.", userNew);
    if (userNew)
        userNew = userNew.trim().toLowerCase();
    if (userNew && userNew.indexOf("@") == 0)
        userNew = userNew.substring(1);
    if (userNew == g_strUserOtherOption)
        userNew = "";

    if (userNew)
        g_valUserExtra = userNew;
    board = getCurrentBoard(); //refresh
    if (!board)
        return;
    fillComboUsers(false, combo, userNew, idCardCur, board, false, function (status) {
        if (status != STATUS_OK) {
            callback(status);
            return;
        }
        if (userNew && userNew.toLowerCase().indexOf(DEFAULTGLOBAL_USER.toLowerCase()) != 0 && userNew.toLowerCase().indexOf(g_globalUser.toLowerCase()) != 0) {
            if (idCardCur != getIdCardFromUrl(document.URL))
                return; //shouldnt happen and no biggie if does
            board = getCurrentBoard();
            if (!board)
                return; //shouldnt happen and no biggie if does
            FindIdBoardFromBoardName(board, idCardCur, function (idBoardFound) {
                verifyBoardMember(userNew, idBoardFound,
                    function () {
                    //user not found as board member
                    if (!confirm("'" + userNew + "' is not a member of '" + board + "'.\nAre you sure you want to use this user?\nPress OK to use it. Press Cancel to type it again.")) {
                        promptNewUser(combo, idCardCur, callbackParam);
                    } else {
                        callback(STATUS_OK);
                    }
                    }, function () {
                        callback(STATUS_OK);
                    });
            });
        } else {
            callback(STATUS_OK);
        }
    });
}

function alertNoIncE() {
    alert("You cannot increase the estimate (hey, just following your Preferences.)\nYour manager can increase estimates for you.\n\nTip: Are you typing in the correct Spent / Estimate box?");
}

function createCardSEInput(parentSEInput, idCardCur, board) {
    assert(idCardCur);
	var bHasSpentBackend = isBackendMode();
	g_seCardCur = null; //remains null for a short time, until card report is loaded. code must check for ===null

	var container = $("<div class='notranslate'></div>").addClass(g_inputSEClass).hide();
	var containerStats = $("<div></div>");
	var tableStats = $("<table class='agile-se-bar-table agile-se-stats tablesorter'></table>");
	var containerBar = $("<table class='agile-se-bar-table agile-se-bar-entry no-print'></table>");
	
	if (!g_bShowSEBar && !g_bAlwaysShowSEBar)
        containerBar.hide();
	containerStats.append(tableStats);
	container.append(containerStats);
	container.append(containerBar);
	var row = $("<tr></tr>").addClass("agile-card-background");
	var rowStatus = $("<tr>").addClass("agile-card-background");
	var rowPad = $("<tr>").addClass("agile-card-background").append($("<td style='font-size:50%;'>&nbsp;</td>").addClass("agile_tablecellItem"));

	containerBar.append(row).append(rowStatus).append(rowPad);

	var comboUsers = setSmallFont($('<select id="plusCardCommentUsers"></select>').addClass("agile_general_box_input"));
	comboUsers.attr("title", "Click to select the user for this new S/E row.");
	fillComboUsers(true, comboUsers, "", idCardCur, board);
	comboUsers.change(function () {
	    updateNoteR();
	    var combo = $(this);
	    var val = combo.val();
	    if (!val)
	        return;

	    if (val == g_strUserOtherOption)
	        promptNewUser(combo, idCardCur);
	    else
	        rememberSEUser(val);
	});

	var comboDays = setSmallFont($('<select id="plusCardCommentDays"></select>').addClass("agile_days_box_input"));
	comboDays.attr("title", "Click to pick how many days ago it happened.");

	fillDaysList(comboDays, 0);
    
	if (g_timeoutComboDaysUpdate == null) {

	    function prepareNextCheck() {
	        assert(g_msdateFillDaysList > 0);
	        var dateNext = new Date(g_msdateFillDaysList);
	        dateNext = new Date(dateNext.getFullYear(), dateNext.getMonth(), dateNext.getDate() + 1);

	        g_timeoutComboDaysUpdate = setTimeout(function () {
	            var comboDaysCheck = $("#plusCardCommentDays");
	            if (comboDaysCheck.length == 0) {
	                g_timeoutComboDaysUpdate = null; //will create timeout again next time
	                return;
	            }
	            fillDaysList(comboDaysCheck, comboDaysCheck.val());
	            prepareNextCheck();
	        }, dateNext.getTime() - g_msdateFillDaysList + 500);
	    }

	    prepareNextCheck();
	}

	comboDays.change(function () {
	        var combo = $(this);
	        var val = combo.val();
	        if (!val)
	            return;
	        updateCurrentSEData();
	        if (val == g_strDateOtherOption) {
	            function process(dayNew) {
	                if (dayNew) {
	                    if (dayNew > g_iLastComboDays)
	                        g_valDayExtra = dayNew;
	                }
	                fillDaysList(comboDays, dayNew);
	            }

	            var dateNow = new Date();
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
	var spinS = setNormalFont($('<input id="plusCardCommentSpent" placeholder="S" maxlength="10"></input>').addClass("agile_spent_box_input agile_placeholder_small agile_focusColorBorder"));
	spinS.attr("title", "Click to type Spent.\nIf needed, Plus will increase E (right) when your total S goes over E.");
	spinS[0].onkeypress = function (e) { validateSEKey(e); checkEnterKey(e); };
    //thanks for "input" http://stackoverflow.com/a/14029861/2213940
	spinS.bind("input", function (e) { updateEOnSChange(); });
	var spinE = setNormalFont($('<input id="plusCardCommentEstimate" placeholder="E" maxlength="10"></input>').addClass("agile_estimation_box_input agile_placeholder_small agile_focusColorBorder"));
	var spanSpinE = $('<span>');
	spanSpinE.append(spinE);
	spinE.attr("title", "Click to type Estimate.");
	spinE[0].onkeypress = function (e) { validateSEKey(e); checkEnterKey(e); };
	spinE.bind("input", function (e) { updateNoteR(); });
	var slashSeparator = setSmallFont($("<span>").text("/"));
	var comment = setNormalFont($('<input type="text" maxlength="250" name="Comment" placeholder="note"/>').attr("id", "plusCardCommentComment").addClass("agile_comment_box_input agile_placeholder_small"));

	if (g_bNoEst) {
	    slashSeparator.addClass("agile_hidden");
	    spanSpinE.addClass("agile_hidden");
	}
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
	var bAppendKW = false;
	var comboKeyword = null; //stays null when the user only uses one keyword
	if (g_optEnterSEByComment.IsEnabled()) {
	    var rgkeywords = g_optEnterSEByComment.getAllKeywordsExceptLegacy();
	    if (rgkeywords.length > 1) {
	        bAppendKW = true;
	        comboKeyword = setSmallFont($('<select id="plusCardCommentKeyword"></select>').addClass("agile_general_box_input"));
	        comboKeyword.attr("title", "Click to pick a different keyword for this new S/E row.");
	        fillComboKeywords(comboKeyword, rgkeywords, null);
	        row.append($('<td />').addClass("agile_tablecellItem").append($("<div>").addClass("agile_keywordsComboContainer").append(comboKeyword)));
	        comboKeyword.change(function () {
	            updateNoteR();
	        });
	    }
	}
	
	rowStatus.append($("<td>").addClass("agile_tablecellItem agile_tablecellItemStatus")); //space for the icon on above it
	var tdStatusPre = $("<td  style='text-align: right;' colspan='" + (bAppendKW ? "3" : "2") + "'>").addClass("agile_tablecellItem agile_tablecellItemStatus");
	var elemStatusPre = $("<div id='agile-se-bar-status-pre' class='agile-se-bar-status'>").html("");
	tdStatusPre.append(elemStatusPre);

	var tdStatusS = $("<td style='text-align: center;'>").addClass("agile_tablecellItem agile_tablecellItemStatus");
	var elemStatusS = $("<div id='agile-se-bar-status-s' class='agile-se-bar-status'>").html("");
	tdStatusS.append(elemStatusS);

	var tdStatusSep = $("<td>").addClass("agile_tablecellItem agile_tablecellItemStatus"); //space for the icon on above it
	var tdStatusE = $("<td style='text-align: center;'>").addClass("agile_tablecellItem agile_tablecellItemStatus");
	var elemStatusE = $("<div id='agile-se-bar-status-e' class='agile-se-bar-status'>").html("");
	tdStatusE.append(elemStatusE);

	var tdStatusR = $("<td>").addClass("agile_tablecellItem agile_tablecellItemStatus");
	var elemStatusR = $("<div id='agile-se-bar-status-r' class='agile-se-bar-status'>").html("");
	tdStatusR.append(elemStatusR);

	rowStatus.append(tdStatusPre).append(tdStatusS).append(tdStatusSep).append(tdStatusE).append(tdStatusR);

	row.append($('<td />').addClass("agile_tablecellItem").append($("<div>").addClass("agile_usersComboContainer").append(comboUsers)));
	row.append($('<td />').addClass("agile_tablecellItem").append(comboDays));
	row.append($('<td />').addClass("agile_tablecellItem").append(spinS));
	row.append($('<td />').addClass("agile_tablecellItem").append(slashSeparator));
	row.append($('<td />').addClass("agile_tablecellItem").append(spanSpinE));
	row.append($('<td />').addClass("agile_tablecellItem").append(comment).width("100%")); //takes remaining hor. space
	row.append($('<td />').addClass("agile_tablecellItemLast").append(buttonEnter));

	function doEnter() {
	    testExtension(function () {
	        clearBlinkButtonInterval();
	        buttonEnter.removeClass("agile_box_input_hilite");
	        var keyword = null;
	        if (comboKeyword)
	            keyword = comboKeyword.val() || "";
	        var s = parseSEInput(spinS, false, false, true);
	        var e = parseSEInput(spinE, false, false, true);
	        if (s == null) {
	            hiliteOnce(spinS, 500);
	            return;
	        }

	        if (e == null) {
	            hiliteOnce(spinE, 500);
	            return;
	        }

	        if (g_seCardCur === null) {
	            alert("Not ready. Try in a few seconds.");
	            return;
	        }

	        var userCur = getUserFromCombo(comboUsers);

	        if (!userCur)
	            return; //shouldnt happen but for safety

	        var mapSe = getSeCurForUser(userCur, keyword);
	        assert(mapSe); //we checked g_seCardCur above so it should exist
	        if (g_bPreventIncreasedE && mapSe.e > 0 && e > 0 && !isRecurringCard()) {
	            alertNoIncE();
	            hiliteOnce(spinE, 500);
	            spinE.focus();
	            return;
	        }

	        var sTotal = parseFixedFloat(mapSe.s + s);
	        var eTotal = parseFixedFloat(mapSe.e + e);

	        if (!verifyValidInput(sTotal, eTotal))
	            return;
	        var prefix = comboDays.val() || "";
	        if (!prefix || prefix == g_strDateOtherOption) {
	            hiliteOnce(comboDays, 500);
	            return;
	        }
	        var valComment = comment.val();

	        if (s == 0 && e == 0 && valComment.length == 0) {
	            hiliteOnce(spinS, 500);
	            hiliteOnce(spinE, 500);
	            return;
	        }

	        if (valComment && valComment.length > 0 && valComment.trim().indexOf(PREFIX_PLUSCOMMAND) == 0) {
	            alert("Plus commands (starting with " + PREFIX_PLUSCOMMAND + ") cannot be entered from the S/E bar.");
	            hiliteOnce(comment, 500);
	            return;
	        }
	        function onBeforeStartCommit() {
	            var seBarElems = $(".agile-se-bar-table *");
	            seBarElems.prop('disabled', true);
	            $(".agile_enter_box_input").text("...");
	            setBusy(true);
	            updateCurrentSEData(true);
	        }

	        function onFinished(bOK) {
	            var seBarElems = $(".agile-se-bar-table *");
	            //enable S/E bar
	            setBusy(false);
	            seBarElems.prop('disabled', false);
	            $(".agile_spent_box_input").focus();
	            $(".agile_enter_box_input").text("Enter");

	            if (bOK) {
	                if (idCardCur == getIdCardFromUrl(document.URL)) {
                        if (!g_bUseLastSEBarUser)
	                    	comboUsers.val(g_strUserMeOption); //if we dont reset it, a future timer could end up in the wrong user
	                    comboDays.val(g_strNowOption);
	                    $("#plusCardCommentSpent").val("");
	                    $("#plusCardCommentEstimate").val("");
	                    $("#plusCardCommentComment").val("");
	                }
	                g_currentCardSEData.removeValue(idCardCur);
	            }
	            //reports etc will refresh in the NEW_ROWS notification handler
	        }

	        setNewCommentInCard(idCardCur, keyword, s, e, valComment, prefix, userCur, null, onBeforeStartCommit, onFinished);
	    });
	}

	buttonEnter.click(function () {
	    doEnter();
	});

	function checkEnterKey(event) {
	    var keycode = (event.keyCode ? event.keyCode : event.which);
	    if (keycode == '13') { //enter key
	        doEnter();
	        return false;
	    }
	}

	comment.keypress(checkEnterKey);
	
	comment.bind("input", function (e) { updateCurrentSEData(); });
	parentSEInput.before(container);
	fillCardSEStats(tableStats, function () {
	    container.show();
        if (!g_bNoSE)
	        createSEButton();
	    insertCardTimer();
	    g_currentCardSEData.loadFromStorage(idCardCur, function () {
	        if (g_currentCardSEData.idCard != idCardCur)
	            return; //timing. should never happen but just in case

	        if (!g_currentCardSEData.s && !g_currentCardSEData.e && !g_currentCardSEData.note)
			    return;
			var bFocus = false;
			function set(elem, val, bAddIfNotThere) {
	            if (val && val != elem.val()) {
	                elem.val(val);
	                if (bAddIfNotThere && elem.val() != val) {
	                    elem.append($(new Option(val, val)));
	                    elem.val(val);
	                }
	                if (!bFocus) {
	                    bFocus = true;
	                    comment.focus(); //so it scrolls there if needed
	                }
	            }
	        }


	        set(comboUsers,g_currentCardSEData.user,true);
	        set(comboDays,g_currentCardSEData.delta, true);
	        set(spinS,g_currentCardSEData.s);
	        set(spinE,g_currentCardSEData.e);
	        set(comment,g_currentCardSEData.note);
	        if (comboKeyword)
	            set(comboKeyword,g_currentCardSEData.keyword, true);
	        updateNoteR();
	        if (bFocus) {
	            if (g_currentCardSEData.s != 0 || g_currentCardSEData.e != 0) {
	                if (!g_timerStatus || !g_timerStatus.bRunning || g_timerStatus.idCard != idCardCur) {
	                    $("#plusCardCommentEnterButton").addClass("agile_box_input_hilite");
	                    var strWhen = getTimeDifferenceAsString(g_currentCardSEData.msTime, true);
	                    sendDesktopNotification("Card has a draft s/e row (" + strWhen + ")\n• Click 'Enter', or\n• Click the timer to unpause it, or\n• Clear the bar to forget it.", 15000);
	                }
	            }
	                
	            showSEBarContainer();
	        }
	    });
	});
}

var g_cacheBoardMembers = {};
function getTrelloBoardMembers(idShortBoard, msCacheMax, callback) { //callback only on success
    var cached = g_cacheBoardMembers[idShortBoard];
    var msNow = Date.now();
    if (cached && msNow - cached.ms < msCacheMax) {
        callback(cached.members);
        return;
    }

    sendExtensionMessage({ method: "getTrelloBoardData", tokenTrello: null, idBoard: idShortBoard, fields: "memberships&memberships_member=true&memberships_member_fields=username" },
        function (response) {
            if (response.status != STATUS_OK || !response.board) {
                sendDesktopNotification("Error while checking board memberships. (status: " + response.status+")", 5000);
                return;
            }
            var members = response.board.memberships;
            if (!members)
                return;
            g_cacheBoardMembers[idShortBoard] = { ms: msNow, members: members };
            callback(members);
        });
}

function verifyBoardMember(userLowercase, idShortBoard, callbackNotFound, callbackFound) {
    assert(callbackNotFound);
    getTrelloBoardMembers(idShortBoard, 0, function (members) {
        for (var i = 0; i < members.length; i++) {
            var member = members[i].member;
            if (member && member.username && member.username.toLowerCase() == userLowercase)
                break; //found
        }
        if (i == members.length)
            callbackNotFound();
        else if (callbackFound)
            callbackFound();
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
    var strDateNow = makeDateCustomString(dateNow);
    elemDate = divDialog.find("#dialog_SEDate_date");
    elemDate.prop("min", makeDateCustomString(dateMin));
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

    showModalDialog(divDialog[0]);
}


function verifyValidInput(sTotal, eTotal) {
    var rTotal = parseFixedFloat(eTotal - sTotal);
    var err = null;
    if (sTotal < 0)
        err = "Spent total will go negative.";
    else if (!g_bNoEst) {
        if (eTotal < 0)
            err = "Estimate total will go negative.";
        else if (rTotal < 0 && !g_bAllowNegativeRemaining)
            err = "Spent total will be larger than estimate total.\nTo avoid this see Plus Preferences 'Allow negative Remaining'";
    }
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
		        callback(map);
            }
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
        var sql = "select '' as keyword, CB.idCard, CB.user, CB.spent, CB.est, CB.date \
				FROM CARDBALANCE AS CB \
				WHERE CB.idCard=? \
				ORDER BY CB.date DESC";
        var values = [idCard];

        if (g_optEnterSEByComment.IsEnabled() && g_optEnterSEByComment.rgKeywords.length>1) {
            sql = "select H.keyword, H.idCard, H.user, SUM(H.spent) as spent, SUM(H.est) as est, MAX(H.date) as date FROM HISTORY AS H WHERE H.idCard=? \
            group by user,keyword \
            order by date DESC, rowid DESC";
        }

        getSQLReport(sql, values,
            function (response) {
                tableStats.empty();
                containerStats.hide();
                //start building by resetting it
                g_seCardCur = {};
                var elemRptLink = containerStats.find(".agile_card_report_link");
                var estimateBadge = containerStats.find(".agile_badge_estimate");
                var spentBadge = containerStats.find(".agile_badge_spent");
                var remainBadge = containerStats.find(".agile_badge_remaining");
                if (response.status == STATUS_OK && (response.rows.length > 0 || (isTourRunning() && !g_bNoSE))) {
                    if (!g_bNoSE)
                        containerStats.show();
                    if (elemRptLink.length == 0) {
                        estimateBadge = BadgeFactory.makeEstimateBadge().addClass("agile_badge_cardfront").attr('title', 'E sum\nall users');
                        spentBadge = BadgeFactory.makeSpentBadge().addClass("agile_badge_cardfront agile_badge_cardfrontFirst").attr('title', 'S sum\nall users');
                        remainBadge = BadgeFactory.makeRemainingBadge().addClass("agile_badge_cardfront").attr('title', 'R sum\nall users');

                        var elemTransferE = $('<a class="agile_linkSoftColor no-print agile_unselectable" href="" target="_blank" title="Transfer estimates between users">transfer E</a>');
                        if (g_bNoEst) {
                            elemTransferE.hide();
                            estimateBadge.hide();
                            remainBadge.hide();
                        }

                        elemTransferE.click(function () {
                            showTransferEDialog();
                        });
                        containerStats.prepend(elemTransferE);

                        containerStats.prepend($('<a class="agile_card_report_link agile_linkSoftColor no-print" href="' + chrome.extension.getURL("report.html?chartView=s&idCard=") + encodeURIComponent(idCard) + '" target="_blank" title="Open a detailed S/E rows report">Report</a>'));
                        containerStats.prepend(remainBadge);
                        containerStats.prepend(estimateBadge);
                        containerStats.prepend(spentBadge);
                    }
                    
                    //<span style="vertical-align: top;position: relative; top: -0.3em;font-size:0.7em">st</span>
                    var headTable = $("<thead>");
                    tableStats.append(headTable);
                    var dataRowHeader = {
                        user: 'By User',
                        spent: 'S <span style="font-size:0.85em">sum</span>',
                        est: 'E <span style="font-size:0.85em">sum</span>',
                        estOrig: '<span>1ˢᵗ</span>',
                        remain: 'R',
                        idCard: idCard
                    };

                    var rowHeader = addCardSERowData(headTable, dataRowHeader, true);
                    var bodyTable = $("<tbody>");
                    bModifiedHeaderE = false;
                    var sTotalCard = 0;
                    var eTotalCard = 0;

                    tableStats.append(bodyTable);

                    function addDataRow(rowData) {
                        sTotalCard += rowData.spent;
                        eTotalCard += rowData.est;
                        addCardSERowData(bodyTable, rowData, false);
                        if (!bModifiedHeaderE && parseFixedFloat(rowData.estOrig) != parseFixedFloat(rowData.est)) {
                            var elemHeaderE = rowHeader.find(".agile-card-now-estimate-header");
                            elemHeaderE.html(dataRowHeader.est + " (" + dataRowHeader.estOrig + ")" + g_hackPaddingTableSorter);
                            elemHeaderE.attr("title", "Estimate sum per user. (1ˢᵗ estimate in parenthesis)");
                            bModifiedHeaderE = true;
                        }
                    }

                    if (isTourRunning() && !g_bNoSE)
                        addDataRow({ //ensure at least one row exists and it has est != estOrig
                            user: 'sample user',
                            spent: 6, estOrig: 11,
                            est: 15,
                            remain: 9,
                            bSample: true,
                            idCard: idCard
                        });

                    var rgReportRows = [];
                    var i;

                    for (i=0; i < response.rows.length; i++) {
                        var rowData = response.rows[i];
                        rowData.estOrig = mapEstOrig[rowData.user] || 0;
                        var mapCur = g_seCardCur[rowData.user];
                        if (!mapCur) {
                            mapCur = {
                                s: rowData.spent,
                                e: rowData.est,
                                rowData: rowData, //stores the latest row (because of sort order DESC)
                                kw: {}
                            };
                            g_seCardCur[rowData.user] = mapCur;
                            rgReportRows.push(mapCur);
                        } else {
                            mapCur.s = mapCur.s + rowData.spent;
                            mapCur.e = mapCur.e + rowData.est;
                        }
                        var keyword=rowData.keyword;
                        if (keyword) {
                            var mapKW = mapCur.kw[keyword];
                            if (!mapKW) {
                                mapKW = {
                                    s: rowData.spent,
                                    e: rowData.est
                                };
                                mapCur.kw[keyword] = mapKW;
                            } else {
                                mapKW.s = mapKW.s + rowData.spent;
                                mapKW.e = mapKW.e + rowData.est;
                            }
                        }
                    }

                    for (i = 0; i < rgReportRows.length; i++) {
                        var dCur = cloneObject(rgReportRows[i].rowData);
                        //review: hacking rowData as an easy way to reuse previous code. Needs rework inside addDataRow
                        dCur.spent = rgReportRows[i].s;
                        dCur.est = rgReportRows[i].e;
                        addDataRow(dCur);
                    }

                    spentBadge.text(parseFixedFloat(sTotalCard));
                    estimateBadge.text(parseFixedFloat(eTotalCard));
                    remainBadge.text(parseFixedFloat(eTotalCard-sTotalCard));
                }

                updateNoteR();
                tableStats.tablesorter({
                    headers: {
                        0: {
                            sorter: 'links' //our custom sorter
                        },
                        1: {
                            sorter: 'digit'
                        },
                        2: {
                            sorter: 'digitWithParen' //our custom sorter
                        },
                        3: {
                            sorter: 'digit'
                        }
                    }
                });
                if (callback)
                    callback();
            });
    });
}

function showSETotalEdit(idCardCur, user) {
    var divDialog = $(".agile_dialog_editSETotal");
    if (divDialog.length==0) {
        divDialog = $('\
<dialog class="agile_dialog_editSETotal agile_dialog_DefaultStyle"> \
<h2 class="agile_mtse_title"></h2><br> \
<select class="agile_mtse_keywords agile_combo_regular" title="Pick the keyword for this modification."></select> \
<a class="agile_mtse_kwReportLink agile_linkSoftColor" href="" target="_blank">view keyword report</a> \
<br>Date to modify: <select class="agile_mtse_day"></select>\
<table class="agile_seTotalTable"> \
<tr> \
<td align="left">S sum</td> \
<td align="left">E sum</td> \
<td align="left">R</td> \
</tr> \
<tr> \
<td align="left"><input class="agile_modify_total_se_input agile_mtse_s" maxlength="10"></input></td> \
<td align="left"><input class="agile_modify_total_se_input agile_mtse_e" maxlength="10"></input></td> \
<td align="left"><input class="agile_modify_total_se_input agile_mtse_r" maxlength="10"></input></td> \
<td title="change your units from Plus Preferences" align="left"><span class="agile_mtse_units"></span></td> \
</tr> \
</table> \
<input class="agile_se_note agile_placeholder_small" placeholder="type an optional note" maxlength="250"></input> \
<button id="agile_modify_SETotal">Modify</button> \
<button id="agile_cancel_SETotal">Cancel</button> \
<br><br><p class="agile_mtseMessage agile_lightMessage"></p> \
<br>\
<span class="agile_lightMessage">Use "Modify" or use the "S/E bar" ?<br>Modify a 1ˢᵗ estimate ? See </span> <button class="agile_modify_help" style="display:inline-block;"  href="">help</button> \
</dialog>');
        $("body").append(divDialog);
        divDialog = $(".agile_dialog_editSETotal");
        divDialog.find("#agile_cancel_SETotal").click(function (e) {
            divDialog[0].close();
        });

        divDialog.find(".agile_mtse_s")[0].onkeypress = function (e) { validateSEKey(e); };
        divDialog.find(".agile_mtse_e")[0].onkeypress = function (e) { validateSEKey(e); };
        divDialog.find(".agile_mtse_r")[0].onkeypress = function (e) { validateSEKey(e); };
        divDialog.find(".agile_modify_help").click(function (ev) {
            showSEHelpDialog();
        });

        divDialog.find(".agile_mtse_day").change(function () {
            var combo = $(this);
            var val = combo.val();
            if (!val)
                return;
            if (val == g_strDateOtherOption) {
                function process(dayNew) {
                    if (dayNew) {
                        if (dayNew > g_iLastComboDays)
                            g_valDayExtra = dayNew;
                    }
                    fillDaysList(comboDays, dayNew);
                }

                var dateNow = new Date();
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
    }

    var comboDays = divDialog.find(".agile_mtse_day");
    fillDaysList(comboDays, 0);

    divDialog.off('keydown.plusForTrello').on('keydown.plusForTrello', function (evt) {
        //need to capture manually before trello captures it and closes the card.
        //note this doesnt cover all cases like focus being in another dialog element
        if (evt.keyCode === $.ui.keyCode.ESCAPE) {
            evt.stopPropagation();
            divDialog[0].close();
        } else if (evt.keyCode === $.ui.keyCode.ENTER) {
            doEnter();
        }
    });

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
        elemKwLink.attr("href", chrome.extension.getURL("report.html?chartView=s&idCard=" + encodeURIComponent(idCard) + "&orderBy=keyword&user=" + user + "&sortList=%5B%5B%22Keyword%22%2C0%5D%2C%5B%22Date%22%2C1%5D%5D"));
    }
    
    var elemTitle = divDialog.find(".agile_mtse_title");
    elemTitle.html("Modify total S/E for " + user);
    function setSEVal(elem, val) {
        if (val == 0)
            val = "";
        elem.val(val);
    }

    var elemS = divDialog.find(".agile_mtse_s");
    var elemE = divDialog.find(".agile_mtse_e");
    var elemMessage = divDialog.find(".agile_mtseMessage");
    var elemNote = divDialog.find(".agile_se_note");
    var strMessageInitial = "Plus will enter a new S/E row on the given date, with the needed values to make your new totals.";
    var elemR = divDialog.find(".agile_mtse_r");

    var sOrig = null;
    var eOrig = null;
    var sOrigNum = null;
    var eOrigNum = null;

    initValues();

    function initValues() {
        var seDataDisplay = getSeCurForUser(user, bHideComboKeyword ? null : comboKeyword.val());
        var sVal = seDataDisplay.s;
        var eVal = seDataDisplay.e;
        setSEVal(elemS,sVal);
        setSEVal(elemE,eVal);

        sOrig = sVal;
        eOrig = eVal;
        sOrigNum = parseFixedFloat(sOrig);
        eOrigNum = parseFixedFloat(eOrig);

        elemMessage.text(strMessageInitial);
        elemNote.val("");
        elemR.val(parseFixedFloat(eOrigNum - sOrigNum));
    }

    function updateEfromS() {
        var sNew = elemS.val().trim();
        var valESet = null;
        var sNewNum = parseFixedFloat(sNew);
        var bUpdateRInstead = false;
        if (sNewNum <= sOrigNum) {
            bUpdateRInstead = true;
        } else {
            if (isRecurringCard())
                valESet = sNew;
            else {
                if (sNewNum > eOrigNum) {
                    if (g_bPreventIncreasedE)
                        bUpdateRInstead = true;
                    else
                        valESet = sNew;
                } else {
                    bUpdateRInstead = true;
                }
            }
        }

        if (bUpdateRInstead)
            updateMessage(true);
        else {
            if (valESet !== null) {
                elemE.val(valESet);
                hiliteOnce(elemE);
            }
            updateMessage(false);
        }
    }

    function updateEFromR() {
        var sNew = elemS.val().trim();
        var rNew = elemR.val().trim();
        var sNewNum = parseFixedFloat(sNew);
        var rNewNum = parseFixedFloat(rNew);
        var valNew = parseFixedFloat(rNewNum + sNewNum);

        if (valNew != elemE.val()) {
            elemE.val(valNew);
            hiliteOnce(elemE);
        }
    }

    function updateMessage(bUpdateR) {
        var data = getSEData(true);
        if (!data)
            return;
        var strMessageNew = null;
        if (data.s == 0 && data.e == 0)
            strMessageNew=strMessageInitial;
        else
            strMessageNew = "" + data.s + "/" + data.e + " will be added to " + user + " in a new S/E row.";
        
        elemMessage.text(strMessageNew);
        if (bUpdateR) {
            var valNew = parseFixedFloat(eOrigNum + data.e - sOrigNum - data.s);
            if (valNew != elemR.val()) {
                    elemR.val(valNew);
                    hiliteOnce(elemR);
                }
            }
        }

    function getSEData(bSilent) {
        var prefix = comboDays.val() || "";
        if (!prefix || prefix == g_strDateOtherOption) {
            if (!bSilent) {
                hiliteOnce(comboDays, 500);
                return null;
            } else {
                prefix = "";
            }
        }

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
            kw = comboKeyword.val() || "";
        return { s: sDiff, e: eDiff, keyword: kw, prefix: prefix };
    }

    comboKeyword.off("change.plusForTrello").on("change.plusForTrello", function (e) {
        initValues();
    });

    function doEnter() {
        function onBeforeStartCommit() {
            var elems = $(".agile_dialog_editSETotal *");
            elems.prop('disabled', true);
            setBusy(true);
        }

        function onFinished(bOK) {
            var elems = $(".agile_dialog_editSETotal *");
            //enable S/E bar
            elems.prop('disabled', false);
            setBusy(false);
            if (bOK) {
                divDialog[0].close();
            }
            //reports etc will refresh in the NEW_ROWS notification handler
        }

        var data = getSEData(false);
        if (!data)
            return;
        if (data.s == 0 && data.e == 0) {
            alert("nothing to do!");
            return;
        }
        var note = elemNote.val();

        if (note && note.length > 0 && note.trim().indexOf(PREFIX_PLUSCOMMAND) == 0) {
            alert("Plus commands (starting with " + PREFIX_PLUSCOMMAND + ") cannot be entered from here.");
            hiliteOnce(elemNote, 1500);
            return;
        }

        if (g_bPreventIncreasedE && !isRecurringCard() && data.e > 0) {
            alertNoIncE();
            elemE.focus();
            hiliteOnce(elemE, 500);
            return;
        }
        setNewCommentInCard(idCardCur, data.keyword, data.s, data.e, note, data.prefix, //empty prefix means time:now
            user, null, onBeforeStartCommit, onFinished);
    }

    divDialog.find("#agile_modify_SETotal").off("click.plusForTrello").on("click.plusForTrello", function (e) {
        doEnter();
    });

    elemS.unbind("input").bind("input", function (e) { updateEfromS(); });
    elemE.unbind("input").bind("input", function (e) { updateMessage(true); });
    elemR.unbind("input").bind("input", function (e) { updateEFromR(); updateMessage(false); });
    $(".agile_mtse_units").text(UNITS.getLongFormat(UNITS.current, g_bDisplayPointUnits));
    showModalDialog(divDialog[0]);
    setTimeout(function () {
        elemR.focus();
        elemR[0].select();
    }, 100);
}

function addCardSERowData(tableStats, rowData, bHeader) {
    var idCardCur = rowData.idCard;
    var bSample = (rowData.bSample);
    assert(idCardCur);
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
	    var urlReport = '<a class="agile_link_noUnderline" href="' + chrome.extension.getURL("report.html?chartView=s&idCard=") + encodeURIComponent(idCardCur) + '&user=' + rowData.user + '" target="_blank">' + rowData.user + '</a>';
	    u = $(td).html(urlReport);
	}

	var sVal = (typeof (rowData.spent) == 'string' ? rowData.spent : parseFixedFloat(rowData.spent));
	var eOrigVal = (typeof (rowData.estOrig) == 'string' ? rowData.estOrig : parseFixedFloat(rowData.estOrig));
	var eVal = (typeof (rowData.est) == 'string' ? rowData.est : parseFixedFloat(rowData.est));
	var rVal =  (typeof (rowData.remain) == 'string' ? rowData.remain : parseFixedFloat(eVal - sVal));
	var s = $(td);
	
	var e = $(td).addClass("agile-card-now-estimate-header");
	var r = $(td);
	if (g_bNoEst) {
	    e.hide();
	    r.hide();
	}
	var linkMod = $(td).addClass("agile-card-seByUserModify");
	
	if (bHeader) {
	    u.attr("title", "Click on a user to view a detailed drilldown report");
	    s.html(sVal + g_hackPaddingTableSorter).attr("title", "Spent sum per user");
	    e.html(eVal + g_hackPaddingTableSorter).attr("title", "Estimate sum per user");
	    r.html(rVal + g_hackPaddingTableSorter).attr("title", "Remaining (E minus S)");
	}
	else {
	    var eValDisplay = eVal;
	    if (eVal != eOrigVal)
	        eValDisplay = eVal + " (" + eOrigVal + ")";
	    s.text(sVal);
	    e.text(eValDisplay);
	    r.text(rVal);
	    if (true) {
	        var strAnchorMod = '<a class="agile_linkSoftColor" href="" target="_blank">modify</a>';
	        linkMod.html(strAnchorMod);
	        linkMod.children("a").click(function (e) {
	            e.preventDefault();
	            if (bSample) {
	                alert("This is just a sample row (shown only for the tour) and cannot be modified.");
	                return;
	            }
	            showSETotalEdit(idCardCur, rowData.user);
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
		    r.addClass("agile_remaining_background");
		}
	}
	var dateLast = (rowData.date ? new Date(rowData.date * 1000) : new Date());

	if (!bHeader) {
	    if (bSample) {
	        u.attr("title", "This is just a sample row for the tour.\nReal S/E rows will display a report for each row here.");
	    }
	    else {
	        //DOM war to trick title to show during mousemove
	        //fought this after losing the battle using jquery tooltip/qtip2 as both require worse
	        //hacks to show during mousemove and to destroy when pressing ESC on a card front while tooltip shows.
	        //all because I wanted to be lazy and not do a proper tooltip <dialog> but hey, I know how to trick native tooltips now
	        var msdateCalc = 0;
	        var bRecurse = false;

	        u.on("mousemove", function (e) {
	            if (bRecurse) {
	                bRecurse = false;
	                return true; //not handled
	            }

	            var msdateNow = Date.now();
				//prevent lots of reports while use moves the mouse over link
	            //also prevents running this flow while the report is being calculated, thus possibly breaking the hack
				if (msdateNow - msdateCalc<3000)
	                return true; //not handled

	            msdateCalc = msdateNow;
	            var maxRows = 10;
	            var maxNote = 50;
	            var sql = "select H.keyword, H.spent, H.est, H.date, H.week, h.comment FROM HISTORY AS H WHERE H.idCard=? and user=? order by date DESC, rowid DESC LIMIT "+(maxRows+1);
	            var values = [idCardCur, rowData.user];
	            
	            getSQLReport(sql, values, function (response) {
	                var strTitle = "";
	                var bMultipleKeywords = g_optEnterSEByComment.IsEnabled() && g_optEnterSEByComment.getAllKeywordsExceptLegacy().length > 1;
	                for (var i = 0; i < response.rows.length; i++) {
	                    if (i >= maxRows) {
	                        strTitle += "\nShowing only last "+maxRows+" s/e rows.";
	                        break;
	                    }
	                    var row = response.rows[i];
	                    var date = makeDateCustomString(new Date(row.date * 1000));
	                    var se = parseFixedFloat(row.spent) + "/" + parseFixedFloat(row.est);
	                    var str = (bMultipleKeywords ? row.keyword + " \t" : "");
	                    var note = strTruncate(row.comment, maxNote);
	                    str += (date + "    ");
	                    str += (row.week + "    ");
	                    str += se;
                        if (note)
	                        str += (" \t"+note);
	                    if (strTitle == "")
	                        strTitle = str;
                        else
	                    	strTitle += ("\n" + str);
	                }
	                strTitle += "\nClick user to drill-down";
	                u.attr("title", strTitle);
	                bRecurse = true;
	                u.trigger("mousemove"); //trick dom to show the title we just set
	            });
	            return false; //handled so return false
	        });
	    }
	}
	row.append(u).append(s).append(e).append(r);
	if (!bHeader)
	    row.append(linkMod);
	tableStats.append(row);
	return row;
}


//bExact is only for preserving values entered with colon format
function parseSEInput(ctl, bHiliteError, bExact, bDontZeroNan) {
	if (bHiliteError===undefined)
		bHiliteError = true;
	if (bHiliteError)
		ctl.removeClass("agile_box_input_hilite");
	var val = (ctl[0].value || "").trim();
	var retVal;
	if (val.indexOf(":") < 0) {
	    if (val.length == 0)
	        retVal = 0;
        else
	        retVal = parseFixedFloat(val, bDontZeroNan);
	    if (bDontZeroNan && isNaN(retVal))
	        retVal = null;
    }
	else
	    retVal = parseColonFormatSE(val, bExact);
	if (retVal === null) {
	    if (bHiliteError)
	        ctl.addClass("agile_box_input_hilite");
	    return null; //invalid
	}
    return retVal;
}

function recalcChecklistTotals() {
    var checks = $(".checklist-item-details-text");
    var s = 0;
    var e = 0;
    
    checks.each(function (i, elem) {
        var se = parseSE(elem.textContent, true);
        if (se.bParsed) {
            s = s + se.spent;
            e = e + se.estimate;
        }
    });
    var seChecks = $(".agile_se_checks");
    //add-comment-section
    s = parseFixedFloat(s);
    e = parseFixedFloat(e);
    if (s == 0 && e == 0) {
        seChecks.hide();
        return;
    }

    var elemAfter=$(".add-comment-section");
    if (elemAfter.length==0)
        return;

    if (seChecks.length == 0) {
        seChecks = $("<div style='cursor:default;margin-left:1em;' class='agile_se_checks' title='This S/E is not included in card totals. It is shown only as an aid.'>");
        seChecks.insertBefore(elemAfter);
        seChecks = $(".agile_se_checks");
    }
    seChecks.text("Checklists total: ");
    var estimateBadge = seChecks.children(".agile_badge_estimate");
    var spentBadge = seChecks.children(".agile_badge_spent");
    if (estimateBadge.length==0) {
        estimateBadge = BadgeFactory.makeEstimateBadge().addClass("agile_badge_cardfront");
        if (g_bNoEst)
            estimateBadge.hide();
        spentBadge = BadgeFactory.makeSpentBadge().addClass("agile_badge_cardfront");
        seChecks.append(spentBadge).append(estimateBadge);
    }
    estimateBadge.text(e);
    spentBadge.text(s);
    seChecks.show();
}

function addCardCommentHelp() {
	if (!g_bReadGlobalConfig)
		return; //wait til later

	var elems = $(".new-comment");
	var i = 0;

	//create S/E bar if not there yet
	if ($("." + g_inputSEClass).length == 0) {
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
			var elemParent = elem;

			if (true) {
				var classSpentCommentHelp = "agile_plushelp_cardCommentHelp";
				var elemWindowTop = elemParent;
				while (!elemWindowTop.hasClass("window-wrapper"))
				    elemWindowTop = elemWindowTop.parent();
				var div = $("<div class='no-print'></div>");
				div.append(createRecurringCheck());
				createHashtagsList(div);
				createSEMenu(div);
				elemWindowTop.find(".window-header").eq(0).append(div);
				
				createCardSEInput(elemParent, idCardCur, board);
				break;
			}
		}
	}
}

function checkCardRecurringCheckbox() {
    var idCardCur = getIdCardFromUrl(document.URL);
    if (!idCardCur)
        return;
    var elemTitle = $(".card-detail-title-assist");
    if (elemTitle.length == 0)
        return;
    
    var checkbox = $("#agile_checkRecurringCard");
    if (checkbox.length == 0)
        return;

    var titleCur = elemTitle.text();
    var bIsRecurring = (titleCur.indexOf(TAG_RECURRING_CARD) >= 0);
    checkbox[0].checked = bIsRecurring;
    updateRecurringCardImage(bIsRecurring);
}

function createRecurringCheck() {
    var check = $('<input class="agile_linkSoftColor" id="agile_checkRecurringCard" style="vertical-align:middle;margin-bottom:0px;display:inline;" type="checkbox"  />');
    var icon = $("<img>").attr("src", chrome.extension.getURL("images/recurring.png")).addClass("agile-card-icon-recurring");
    var span = $('<span id="container_agile_checkRecurringCard" class="agile_linkSoftColor">').append(icon).append(check);
    span.prop("title", "Plus [R]ecurring cards (like weekly meetings) don\'t affect changed estimate reports.");
    var elemTitle = $(".card-detail-title-assist");
    var titleCur = elemTitle.text().trim();
    var bChecked = (titleCur.indexOf(TAG_RECURRING_CARD) >= 0);
    check[0].checked = bChecked;
    span.append($('<label style="display:inline;margin-right:1.5em;font-weight:normal" for="agile_checkRecurringCard" class="agile_unselectable agile_linkSoftColor">Recurring</label>'));
    updateRecurringCardImage(bChecked, icon);
    check.click(function () {
        bChecked = check.is(':checked');
        elemTitle = $(".card-detail-title-assist");

        function undoCheck() {
            bChecked = !bChecked;
            check[0].checked = bChecked;
            updateRecurringCardImage(bChecked, icon);
        }

        var idCardCur = getIdCardFromUrl(document.URL);
        if (!idCardCur || elemTitle.length == 0) {
            undoCheck();
            return;
        }

        titleCur = elemTitle.text().trim();
        var bIsRecurring = (titleCur.indexOf(TAG_RECURRING_CARD) >= 0);
        if ((bIsRecurring && bChecked) || (!bIsRecurring && !bChecked))
            return;
        if (bChecked)
            titleCur = titleCur + " " + TAG_RECURRING_CARD;
        else {
            titleCur = replaceString(titleCur, g_regexRecurringTitleReplace, "").trim();
        }

        check.attr('disabled', 'disabled');
        renameCard($.cookie("token"), idCardCur, titleCur, function (response) {
            check.removeAttr('disabled');
            if (response.status != STATUS_OK) {
                undoCheck();
                alert("Failed to rename card.\n" + response.status);
            }
            else {
                //redo it. minor case when user manually renamed title or other db data while plus was renaming due to user clicking checkbox
                //since this rename is the one most up-to-date, use its checked status.
                check[0].checked = bChecked;
                updateRecurringCardImage(bChecked, icon);
            }
        });

    });
    if (g_bNoEst)
        span.hide();
    return span;
}


function updateRecurringCardImage(bRecurring, icon) {
    if (!icon)
        icon = $(".agile-card-icon-recurring");
    if (bRecurring)
        icon.show();
    else
        icon.hide();
}

function createSEMenu(divParent) {
    var comboSE = $("<select class='agile_AddSELink agile_card_combo agile_linkSoftColor'></select>");
    comboSE.prop("title", "Plus for Trello card features");
    if (!g_bNoSE) {
        comboSE.append($(new Option("add Spent", "S")).prop("title", "Add Spent to a user.\nuser's Spent = sum of all their 'S' entries."));
        if (!g_bNoEst) {
            comboSE.append($(new Option("add Estimate", "E")).prop("title", "Create or add Estimate for a user.\nuser's Estimate = sum of all 'E' entries."));
            comboSE.append($(new Option("transfer Estimate", "TE")).prop("title", 'transfer "E 1ˢᵗ" between users.\n\
Useful to transfer from a global estimate to a specific user.'));
        }
        comboSE.append($(new Option("? Show S/E Help", "help")));
    }
    comboSE.append($(new Option("? Show the Plus help pane", "helppane")));
    comboSE.append($(new Option("? Start the card tour", "tour")));
    comboSE.append($(new Option("Mini-me", "minime")));
    comboSE.val(""); //unselect
    divParent.append(comboSE);
    comboUpdateView();

    function comboUpdateView() {
        var scombo=comboSE.select2({ minimumResultsForSearch: Infinity, placeholder: (g_bNoSE? "" : "S/E & ")+ "More", dropdownAutoWidth: true });
    }

    function clearSelection() {
        comboSE.val("").trigger("change");
    }

    comboSE.on("change", function () {
        var val = comboSE.val() || "";
        if (val == "S") {
            clearSelection();
            showSEBarContainer(false, true);
            return false; //handled
        }

        if (val == "E") {
            clearSelection();
            showSEBarContainer(false, false, true);
            return false; //handled
        }

        if (val == "TE") {
            clearSelection();
            showTransferEDialog();
            return false; //handled
        }

        if (val == "help") {
            showSEHelpDialog();
            clearSelection();
            return false; //handled
        }

        if (val == "tour") {
            clearSelection();
            handleTourStart(true);
            return false; //handled
        }

        if (val == "helppane") {
            clearSelection();
            Help.display();
            return false; //handled
        }

        if (val == "minime") {
            var idCard = getIdCardFromUrl(document.URL);
            clearSelection();
            sendExtensionMessage({ method: "openCardWindow", idCard: idCard, bForcePopup: true }, function (response) {});
            return false; //handled
        }
    });

    if (g_tour.bAutoShowTour)
        setTimeout(function () { handleTourStart(false); }, 2500);
    else if (!isTourRunning() && !g_bNoSE) {
        chrome.storage.sync.get([SYNCPROP_bShowedFeatureSEButton], function (obj) {
            if (!obj[SYNCPROP_bShowedFeatureSEButton]) {
                showSEButtonBubble(comboSE);
                obj[SYNCPROP_bShowedFeatureSEButton] = true;
                chrome.storage.sync.set(obj, function () {
                    if (chrome.runtime.lastError !== undefined)
                        return; //just to reference it so chrome debugger doesnt complain
                });
            }
        });
    }
}

function createHashtagsList(divParent) {
    var comboK = $("<select class='agile_hashtags_list agile_card_combo'></select>");
    comboK.prop("title", "Add Plus #tags to later filter by in Reports and charts.");
    var txtOther = "other...";
    var elemOther = null;


    function triggerChange() {
        comboK.trigger('change');
    }

    function addFirst() {
       //select2 uses placeholders instead
    }

    function addOther() {
        elemOther = $(new Option(txtOther, txtOther));
        comboK.append(elemOther);
    }

    function removeOther() {
        if (!elemOther)
            return;

        elemOther.remove();
        elemOther = null;
    }

    function addKeyword(k) {
        comboK.append($(new Option(k, k)).addClass("notranslate"));
    }

    addFirst();
    var bLoaded = false;
    var listCached = [];
    var bFromOpening = false;

    comboK.on("select2:opening", function (e) {
        var bNeedsLoading = !bLoaded;
        if (bFromOpening) {
            bFromOpening = false;
            return; //dont recurse
        }
        //we always prevent the default load for two reasons:
        //1: to delay-load the list as loading the hashtag list could be a perf hit.
        //2: bugs in select2 prevent it from focusing on the search term. but manually displaying the dropdown does work.
        //select2 lets us use search and delay-load.
        //Chrome 53 stopped allowing fake clicks to do async loading. https://productforums.google.com/forum/#!msg/chrome/Q4Rt6d0C4Qo/DhQdubVCAwAJ
        e.preventDefault();
        bLoaded = true;
        function loadAllAndOpen() {
            comboK.empty();
            addFirst();
            listCached.forEach(function (k) {
                addKeyword(k);
            });
            addOther();
            selectFirst();
            comboUpdateView();
            bFromOpening = true;
            comboK.select2("open");
        }

        if (!bNeedsLoading) {
            setTimeout(function () {
                loadAllAndOpen();
            }, 100);

            return;
        }
        sendExtensionMessage({ method: "getAllHashtags" }, function (response) {
            if (response.status != STATUS_OK) {
                alert(response.status);
                return;
            }
            
            listCached = cloneObject(response.list);
            loadAllAndOpen();
        });
    });

    //review fix selectFirst mess with promises
    function selectFirst() {
        comboK.val("");
        comboK.trigger('change');
    }

    function comboUpdateView() {
        comboK.select2({
            tags: true, //https://github.com/select2/select2/issues/4088
            insertTag: function (data, tag) {
                tag.text = "Add new: #" + tag.text;
                data.push(tag);
            },
            minimumResultsForSearch: 0, placeholder: "Add #tags", width: 'auto', dropdownAutoWidth: true
        });
    }
    comboK.on("change", function () {
        var val = comboK.val() || "";
        var iHash = null;
        if (val == "")
            return;
        if (val == txtOther) {
            var newHash = prompt("Type the new hashtag: (to remove a tag, remove it from the card title)");
            if (!newHash) {
                selectFirst();
                return;
            }
            newHash = newHash.trim();
            iHash = newHash.indexOf("#");
            if (iHash == 0)
                newHash = newHash.substring(1);
            else if (iHash > 0) {
                alert("Type a single hashtag without spaces or #.");
                selectFirst();
                return;
            }
            if (newHash.indexOf(" ") >= 0) {
                alert("Type a single hashtag without spaces.");
                selectFirst();
                return;
            }
            if (!listCached.every(function (k) {
                if (k.toLowerCase() == newHash.toLowerCase())
                    return false;
                return true;
            })) {
                alert("Hashtag is already in the list.");
                selectFirst();
                return;
            }

            removeOther();
            addKeyword(newHash);
            listCached.push(newHash);
            addOther();
            comboK.val(newHash);
            triggerChange();
            val = newHash;
        } else {
            //might be the "add new item"
            if (listCached.every(function (k) {
                if (k.toLowerCase() == val.toLowerCase())
                    return false;
            return true;
            })) {
                listCached.push(val);
            }
        }
        var idCardCur = getIdCardFromUrl(document.URL);
        elem = $(".card-detail-title-assist");
        if (!idCardCur || elem.length == 0) {
            selectFirst();
            return;
        }

        var titleCur = elem.text().trim();
        var rgHash = getHashtagsFromTitle(titleCur);
        for (iHash = 0; iHash < rgHash.length;iHash++) {
            if (rgHash[iHash].toLowerCase() == val.toLowerCase()) {
                //silently ignore
                sendDesktopNotification("hashtag #"+val+" is already in the card.");
                selectFirst();
                return;
            }
        }
        titleCur = titleCur + " " + "#"+val;
        renameCard($.cookie("token"), idCardCur, titleCur, function (response) {
            if (response.status != STATUS_OK) {
                alert("Failed to rename card.\n" + response.status);
            }
            selectFirst();
        });
    });
    divParent.append(comboK);
    comboUpdateView();
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
	    return getHashtagsFromTitle(title);
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
    var timerElem = $("<a></a>").addClass("button-link").attr("id", "agile_timer").attr('disabled', 'disabled');
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
			    setTimeout(function () {
			        showTimerPopup(idCard); //wait a little since the trello card window is loading
			    }, 500);
			    
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
		    var msEvent = Date.now(); //workarround dont rely on evt.timeStamp (possibly https://code.google.com/p/chromium/issues/detail?id=578243)
		    testExtension(function () {
		        handleCardTimerClick(msEvent, hash, timerElem, timerStatus, idCard);
		    });
		});
	});
	if (g_bNoSE)
	    timerElem.hide();
	return timerElem;
}

function updateTimerTooltip(timerElem, bRunning, bRemoveSmallTimerHelp, bUpdateCards) {
    bRemoveSmallTimerHelp = bRemoveSmallTimerHelp || false; //review zig remove
	bUpdateCards = bUpdateCards || false;
	var title = "";
	var strClassRunning = "agile_timer_running";
	if (bRunning) {
		timerElem.addClass(strClassRunning);
		title = "Click to stop or pause the Plus timer.";
	}
	else {
		timerElem.removeClass(strClassRunning);
		title = "Click to start the Plus timer.";
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
		        var msEnd = Date.now();
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
            hash = obj.hash; //legacy timer case
            var stored = obj.stored;
            if (stored === undefined || (stored.msStart != null && stored.msEnd != null) ||
                (stored.msStart == null && stored.msEnd == null)) {
                //START
                if (idCardActiveTimer && idCardActiveTimer!= idCard && !g_bDontWarnParallelTimers) {
                    if (!confirm("There is already an active timer.\nClick the Chrome Plus icon to see it.\nAre you sure you want to start another timer?\n\n(See Plus help Preferences to disable this warning)"))
                        return;
                }

                var elemSpent = $("#plusCardCommentSpent");
                var sCur = null;
                var bClearSpentBox = false;
                if (elemSpent.length == 1) {
                    sCur = parseSEInput(elemSpent, false, true, true);
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
                    showTimerPopup(idCard);
                });
            }
            else if (stored.msStart != null && stored.msEnd == null) {
                //STOP
                var msStartCur = stored.msStart;
                var msEndCur = msDateClick;
                var rgRemove = [hash];
                var bRemoveActive = (idCardActiveTimer && idCardActiveTimer == idCard);
                if (bRemoveActive)
                    rgRemove.push(SYNCPROP_ACTIVETIMER);
            
                chrome.storage.sync.remove(rgRemove, function () {
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
                        showSEBarContainer();
                        addSEFieldValues(sCalc);
                    }
                    else {
                        sendDesktopNotification("Ellapsed time too small (under 0.01 " + UNITS.getLongFormat() + "). Timer ignored\n.", 10000);
                    }
                    if (bRemoveActive)
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
 * s: float
 * will add to existing s in field
 **/
function addSEFieldValues(s) {
	var elemSpent = $("#plusCardCommentSpent");
	var elemEst = $("#plusCardCommentEstimate");
	var elemUsers = $("#plusCardCommentUsers");
	if (elemUsers.val() != g_strUserMeOption) {
	    elemUsers.val(g_strUserMeOption);
	    hiliteOnce(elemUsers, 3000);
	}

	var sCur = parseSEInput(elemSpent,false,true, true);
	var eCur = parseSEInput(elemEst, false, false, true);
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
			if (g_cBlinkButton > 1) //do it here so it remains yellow
				clearBlinkButtonInterval();
		}
	}, 500);
}

//review rename commentBox to noteBox
function setNewCommentInCard(idCardCur, keywordUse, //blank uses default (first) keyword
    s, e, commentBox,
    prefix, //blank uses default (first) keyword
    member, //null means current user
    memberTransferTo, //when not null, creates a transfer estimate command
    onBeforeStartCommit, //called before all validation passed and its about to commit
    onFinished) {        //called after commit finished or failed. onFinished(bOK)
	if (prefix == g_strNowOption || prefix == null)
		prefix = "";
	var comment = "";
	var prefixComment = ""; //for transfer command
	if (!keywordUse)
	    keywordUse = g_optEnterSEByComment.getDefaultKeyword();

	s = Math.round(s * 100) / 100;
	e = Math.round(e * 100) / 100;
	
	comment = keywordUse + " ";

	if (memberTransferTo) {
	    assert(member && member != g_strUserMeOption && memberTransferTo != g_strUserMeOption);
	    assert(prefix.length == 0);
	    comment = comment + "@" + member + " " + "@" + memberTransferTo + " ";
	    prefixComment = PLUSCOMMAND_ETRANSFER + " ";
	} else {
	    if (member == g_strUserMeOption)
	        member = null; //defaults later to user
	    if (member && member != getCurrentTrelloUser())
	        comment = comment + "@" + member + " ";
	    if (prefix.length > 0)
	        comment = comment + " " + prefix + " ";
	}
	comment = comment + s + "/" + e + " " + prefixComment+ commentBox;
	commentBox = replaceBrackets(commentBox);
	var board = getCurrentBoard();
	if (!board) {
		logPlusError("error: no board");
		return; //should never happen, we had it when the S/E box was created
	}

	if (!idCardCur || idCardCur != getIdCardFromUrl(document.URL))
		return; //should never happen

	FindIdBoardFromBoardName(board, idCardCur, function (idBoardFound) {
	    if (idBoardFound) {
	        if (idBoardFound == ID_BOARD_PLUSHELP) {
	            alert("Enter Spent & Estimates in your boards. You cannot enter S/E in this public help board.");
	            return;
	        }
		    idBoardUse = idBoardFound;
		    assert(idBoardUse && board);
		    doEnterSEIntoCard(s, e, commentBox, comment, idBoardUse, idCardCur, prefix, board, keywordUse, member, memberTransferTo, onBeforeStartCommit, onFinished);
		}
		else {
		    alert("Network error. Cannot get board data: idBoard.\nPlease try again when online.");
		}
	});
}

function HandleNoBackendDbEntry(s, e, commentBox, idBoard, idCard, strDays, strBoard, cleanTitle, userCur, memberTransferTo, idHistoryRowUse, keyword, callback) {
	var dateNow = new Date();
	var dDays = 0;
	
	if (strDays != "") {
		dDays = parseInt(strDays, 10) || 0;
		if (dDays < 0 && dDays >= g_dDaysMinimum) {
		    dateNow.setDate(dateNow.getDate() + dDays);
		}
	}

	var userCurrent = getCurrentTrelloUser();
	var rgUsers = [userCur];
	if (memberTransferTo != null)
	    rgUsers.push(memberTransferTo); //must be there before the first call to appendCommentBracketInfo
	var rgComments = [appendCommentBracketInfo(dDays, commentBox, userCurrent, rgUsers, 0, memberTransferTo != null)];
	if (memberTransferTo != null)
	    rgComments.push(appendCommentBracketInfo(dDays, commentBox, userCurrent, rgUsers, 1, memberTransferTo != null));
    //REVIEW CARDTRANSFER
	helperInsertHistoryRow(dateNow, idCard, idBoard, strBoard, cleanTitle, rgUsers, s, e, rgComments, idHistoryRowUse, keyword, callback);
}


//assumes that rgUsers.length is 1 or 2. 2 means a transfer of e (positive) from rgUsers[0] to rgUsers[1]
function helperInsertHistoryRow(dateNow, idCard, idBoard, strBoard, strCard, rgUsers, s, e, rgComments, idHistoryRowUse, keyword, callback) {
    assert(rgUsers[0]);
    assert(rgUsers.length == 1 || rgUsers.length == 2); //assumes its a transfer when 2
    assert(rgComments.length == 1 || rgComments.length == 2);
    assert(rgComments.length == rgUsers.length);
    var objs = [];
    if (rgUsers.length == 1) {
        objs.push(makeHistoryRowObject(dateNow, idCard, idBoard, strBoard, strCard, rgUsers[0], s, e, rgComments[0], idHistoryRowUse, keyword));
    } else {
        assert(e > 0);
        assert(rgComments[0].indexOf(g_prefixCommentTransferTo) >= 0);
        assert(rgComments[1].indexOf(g_prefixCommentTransferFrom) >= 0);
        assert(rgUsers[1]);
        //note that both are entered with the same date. code should sort by date,rowid to get the right timeline
        objs.push(makeHistoryRowObject(dateNow, idCard, idBoard, strBoard, strCard, rgUsers[0], s, -e, rgComments[0], idHistoryRowUse, keyword));
        var idHistoryUse2 = null;
        if (idHistoryRowUse)
            idHistoryUse2 = idHistoryRowUse + SEP_IDHISTORY_MULTI + "1";
        //note idHistoryUse2 can remain null in case of stealth sync, in which case the "id" of the receiving s/e row will not have ".1" appended to its idHistory
        objs.push(makeHistoryRowObject(dateNow, idCard, idBoard, strBoard, strCard, rgUsers[1], s, e, rgComments[1], idHistoryUse2, keyword));
    }
    insertHistoryRowFromUI(objs, callback);
}

function doEnterSEIntoCard(s, e, commentBox, comment, idBoard, idCard, strDays, strBoard, keyword, member, memberTransferTo, onBeforeStartCommit, onFinished) {
	var elem = null;
	var titleCur = null;
	var cleanTitle = null;

	elem = $(".card-detail-title-assist");
	if (elem.length == 0)
	    return; //trello html broke.
	titleCur = elem.text();
	var se = parseSE(titleCur, true);
	cleanTitle = se.titleNoSE;

	var titleCardNew = null;
	var commentEnter = comment;

	if (!IsStealthMode() && !memberTransferTo) {
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
	        if (false && cleanTitle != titleCur) { //review: disabled this until a better way is implemented
	            titleCardNew = cleanTitle;
	            commentEnter = commentEnter + " [plus removed " + parseFixedFloat(se.spent) + "/" + parseFixedFloat(se.estimate) + " from title]";
	        }
	    }
	}
	
	handleEnterCardComment(titleCardNew, commentEnter, strBoard, idBoard, idCard, s, e, commentBox, strDays, cleanTitle, keyword, member, memberTransferTo, onBeforeStartCommit, onFinished);
}

function handleEnterCardComment(titleCard, comment, strBoardParam, idBoardParam, idCard, s, e, commentBox,
            strDays, cleanTitle, keyword, member, memberTransferTo, onBeforeStartCommit, onFinished) {

    assert(onFinished);
    if (onBeforeStartCommit)
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
        if (IsStealthMode()) {
            postAddCardComment(idBoardParam, strBoardParam, null);
        }
        else {
            addCardCommentByApi(idCard, comment, function (response) {
                if (response.status != STATUS_OK) {
                    alert("Failed to enter S/E\n" + response.status);
                    finished(false);
                    return;
                }

                if (!member)
                    member = response.commentObj.memberCreator.username;
                var idBoard = response.commentObj.data.board.shortLink; //this is fresher than idBoardParam
                var strBoard = response.commentObj.data.board.name; //fresher than strBoard param
                var idHistoryRowUse = response.commentObj.id;
                postAddCardComment(idBoard, strBoard, idHistoryRowUse); 
            });
        }

        function postAddCardComment(idBoard, strBoard, idHistoryRowUse) {
            HandleNoBackendDbEntry(s, e, commentBox, idBoard, idCard, strDays, strBoard, cleanTitle, member, memberTransferTo, idHistoryRowUse, keyword, function (status) {
                if (!IsStealthMode() && titleCard) {
                    renameCard($.cookie("token"), idCard, titleCard, function (response) {
                        if (response.status != STATUS_OK) {
                            alert("Failed to rename card title after changed S/E\n" + response.status);
                        }
                        finished(true); //set bOk true even if card rename failed, as its an intermediate state and its worse to pretend fail and repeat the s/e row just entered.
                    });
                }
                else
                    finished(true);
            });
        }
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
                        logException(ex);
                    }
                } else {
                    if (bHandledDeletedOrNoAccess(xhr.status, objRet, "error: permission error or deleted")) { //no permission or deleted
                        null; //avoid lint
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
    return; //not worth detecting as now we prompt users to enable sync always
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
        if (!idCard) {
            callbackFind(null);
            return;
        }
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
				helperInsertHistoryRow(new Date(), idCardCur, idBoardNew, boardNameNew, nameCard, [userCur], 0, 0, ["Plus: card moved from '" + boardCur + "'"], undefined, undefined, function (status) {
				    if (status == STATUS_OK)
				        sendDesktopNotification("Plus has moved the card's data to the new board.", 8000);
				});

			}
		});
}

function showSEHelpDialog(section) {
    section = section || "welcome";
    var divDialog = $(".agile_dialog_SEHelp");
    if (divDialog.length == 0) {
        var bSECommentsMode = (g_optEnterSEByComment.IsEnabled() && g_optEnterSEByComment.rgKeywords.length > 0);
        var kw = g_optEnterSEByComment.getDefaultKeyword();
        //note: tabindex="1" will set focus to the title. this is to prevent focus to other elements that may cause a scroll down of the dialog on small screens.
        divDialog = $('\
<dialog class="agile_dialog_SEHelp agile_dialog_DefaultStyle"> \
<img style="float:right;cursor:pointer;" id="agile_dialog_SEHelp_OK" src="' + chrome.extension.getURL("images/close.png") + '"></img>\
<h2 id="agile_dialog_SEHelp_Top" style="outline: none;" align="center">Spent / Estimates help</h2>\
<select tabindex="1" id="agile_sehelp_combotopic">\
    <option value="welcome">Click here to pick a help topic</option>\
    <option value="addest">Add user estimate or global estimate</option>\
    <option value="addspent">Add user spent</option>\
    <option value="modspent">Modify total spent</option>\
    <option value="modest">Modify total estimate or remain</option>\
    <option value="transfere">Transfer estimate to a user</option>\
    <option value="modfirstest">Fix mistakes or modify  a 1ˢᵗ estimate</option>\
    <option value="addannotation">Add a burndown annotation</option>'+
    (bSECommentsMode?'<option value="secommentexamples">Examples of S/E card comments</option>':'')+
    '<option value="setprefs">Set your Plus S/E preferences</option>\
    <option value="otherhelp">Other s/e help topics</option>\
</select>\
<div class="agile_sehelpsection" id="agile_sehelp_secommentexamples">'+
'<p><b>' + kw + ' 0/4</b>  :  add 4 to your estimate.</p>\
<p><b>' + kw + ' -2d 5/3 fix doc</b> : add 2days ago 5/3 with note "fix doc".</p>\
<p><b>' + kw + ' @john 0/6</b> : add to john 6 estimate.</p>\
<p><b>' + kw + ' @john @paul -2d 3/3 code review</b> : add to john and paul -2days ago 3/3 with note "code review".</p>\
<p><i>use @me as shortcut to add yourself. @me is always the comment owner.</i></p>\
<p><b>' + kw + ' @global @me /7 ^etransfer</b> : transfer 7 "E 1ˢᵗ" from global to me.</p>\
<p><b>' + kw + ' 7</b> : (without "/") spends 7/0 or 7/7 for Plus recurring "[R]" cards.</p>\
<br>\
<A href="http://www.plusfortrello.com/p/spent-estimate-card-comment-format.html" target="_blank">More Plus S/E comment help.</A>\
</div>\
<div class="agile_sehelpsection" id="agile_sehelp_welcome">\
&nbsp;<br>\
<img style="margin-left:5em;" src="' + chrome.extension.getURL("images/cardplusreport.png") + '"/>\
&nbsp;<br>\
&nbsp;<br>\
<p><b>Each entry in the S/E bar adds to the sums per user (or substracts when negative)</b></p>\
<p><b>R</b>emain = <b>E</b>stimate - <b>S</b>pent</p>\
<p><b>E</b>stimate = <b>S</b>pent + <b>R</b>emain</p>\
<p><b>E</b>stimate = <b>E 1ˢᵗ</b> + "E changes" (<b>+E</b> & <b>-E</b> "E. type" in Reports)</p>\
</div>\
<div class="agile_sehelpsection" id="agile_sehelp_addannotation">\
<p>To add an annotation, first pick the annotation date in the S/E bar, then type your annotation in the note field starting with "<b>!</b>" and press Enter.</p>\
<p>Typing S/E is optional when adding an annotation.</p>\
</div>\
<div class="agile_sehelpsection" id="agile_sehelp_addest">\
<img src="' + chrome.extension.getURL("images/plusbarlabeled.png") + '" />\
<br><br>\
<p><b>Add a user estimate:</b> Pick "add Estimate" from the "S/E & More" menu in the card front.</p>\
<p>Pick the user in the S/E bar (or "me" for yourself), Estimate, optional note, and Enter.</p>\
<p>The estimate may increase or decrease later if you keep adding more E entries with the S/E bar or with "modify".<p>\
<p>Keep E up-to-date so Plus can calculate a realistic Remain "R" for reports and burndowns.</p>\
<p>Plus keeps track of the first estimate (E 1ˢᵗ) per user to compare with their current E. See the "Modify total estimate" and "Transfer from a global estimate" topics above.</p>\
<br>\
<p><b>Add a global estimate</b> by assigning it to the <A href="https://trello.com/c/6QFgJEZH/13-global-user" target="_blank">"global" user</A>. Useful to later transfer E to specific users.</p>\
<p>When transferring estimates, Plus always transfers E 1ˢᵗ. This can cause "global" to reach negative E 1ˢᵗ when its estimate was increased and later transferred to a user.</p>\
<p>Change the "global" name in Plus Preferences.</p>\
</div>\
<div class="agile_sehelpsection" id="agile_sehelp_addspent">\
<img src="' + chrome.extension.getURL("images/plusbarlabeled.png") + '" />\
<br><br>\
<p>Pick "add Spent" from the "S/E & More" menu in the card front.</p>\
<p>Pick the user in the S/E bar (or "me" for yourself), type the spent, optional note, and Enter.</p>\
<p>If the spent is not for "now", pick the date from the "now" date selector.</p>\
<br>\
<p>Keep adding more Spent entries with the S/E bar, "modify", or directly as card comments (if using that sync mode).</p>\
<p>Total Spent is always the sum of all S entries.</p>\
<br>\
<p>If you type S in the S/E bar with empty E (or not enough to cover the Spent about to be added) Plus automatically prefills the missing E in the S/E bar so R=0, to prevent R from going negative. This behaviour can be turned off from Preferences.</p>\
</div>\
<div class="agile_sehelpsection" id="agile_sehelp_modspent">\
<img src="' + chrome.extension.getURL("images/cardsemodify.png") + '" />\
<br><br>\
<p>Use "modify" to correct mistakes or if you prefer to modify total S directly instead of thinking about increases and decreases. "modify" will create the S/E entry (calculating the needed difference)  on the date you specify. When fixing past mistakes, pick the date where the mistake happened.</p>\
<br>\
<p>You can also use the S/E bar with negative S to substract from total Spent.</p>\
<br>\
<p>Normally, you should not modify S/E comments you already entered (or sheet rows for stealth sync users) even if mistaken. Use "modify" or see the "Fix mistakes" topic above.</p>\
</div>\
<div class="agile_sehelpsection" id="agile_sehelp_modest">\
<img src="' + chrome.extension.getURL("images/cardsemodify.png") + '" />\
<br><br>\
<p>Use "modify" to change E or R directly instead of thinking about increases and decreases. "modify" will create the needed S/E entry on the date you specify. When fixing past mistakes, pick the date where the mistake happened.</p>\
<br>\
<p>Plus considers a card finished when R is zero for all users. R = E - S.  \
<p>You may also use the S/E bar with negative numbers to substract from the total Estimate. However, just like the S/E bar, it does not modify "E 1ˢᵗ".</p>\
<br>\
<p>Normally, you should not modify S/E comments you already entered (or sheet rows for stealth sync users) even if mistaken. Use "modify" or see the "Fix mistakes" topic above to modify "E 1ˢᵗ" or other changes.</p>\
</div>\
<div class="agile_sehelpsection" id="agile_sehelp_transfere">\
<p>Pick "transfer Estimate" from the "S/E & More" menu in the card front.<\p>\
<p>Transfer "E 1ˢᵗ" between users, usually from a "global" estimate to an actual user.<\p>\
<br>\
<p>A "global" estimate is E assigned to the "global" user.<\p>\
<p>Change "global" to a different name in Plus help - Preferences.<\p>\
<A href="http://www.plusfortrello.com/p/transfer-estimates-between.html" target="_blank">More information</A>\
</div>\
<div class="agile_sehelpsection" id="agile_sehelp_modfirstest">\
<p>To fix mistakes with Spent or Estimate, use "modify".</p>\
<p>However, that will not change a 1ˢᵗ Estimate. It\'s possible to modify E 1ˢᵗ when using the "Card comments" sync mode by entering a special S/E comment with the "^resetsync" command.<\p>\
<p>First, modify the card comment where the S/E entry was made for the 1ˢᵗ Estimate. Note that only the Trello user that made the comment can modify it.<br>\
<p>Then, issue the command:</p>\
<p><b>'+g_optEnterSEByComment.getDefaultKeyword()+' ^resetsync</b> as a card comment. Plus will re-read all S/E comments just for that card.</p>\
<p>This command may be used to modify any S/E row, not just E 1ˢᵗ. However, note that Plus will keep a record in reports of the old S/E values for traceability.</p>\
<br>\
<p>Read more about the <A href="http://www.plusfortrello.com/p/spent-estimate-card-comment-format.html#resetsynccommand" target="_blank">card "^resetsync" command</A>.</p>\
<p>You may also force Plus to re-read all S/E including E 1ˢᵗ (for all sync modes) from the Plus help pane Utilities, however this would need to be done by all team members too and can take a a few minutes on many boards.</p>\
</div>\
<div class="agile_sehelpsection" id="agile_sehelp_setprefs">\
<p>From the Plus help pane jump to Preferences to set your Units (minutes, hours, days), whether to use Estimates, background sync and much more.</p>\
<p>Set your S/E sync method and keywords form the help pane\'s Sync section.</p>\
<p>View more in the help board\'s <A href="https://trello.com/c/dte0vHXX/5-preferences-units-and-much-more" target="_blank">card about Preferences</A></p>\
</div>\
<div class="agile_sehelpsection" id="agile_sehelp_otherhelp">\
<p>For more help:</p>\
<ul class="agile_sehelp_otheritem">\
<li>&bull; <b><A href="https://trello.com/b/0jHOl1As/plus-for-trello-help" target="_blank">Help Board</A></b></li>\
<li>&bull; <A href="http://www.plusfortrello.com/p/how-plus-tracks-spent-and-estimate-in.html" target="_blank">How Plus tracks Spent and Estimate</A></li>\
<li>&bull; <A href="http://www.plusfortrello.com/p/s-e-entry-methods.html" target="_blank">Spent / Estimate entry methods</A></li>\
<li>&bull; <A href="http://www.plusfortrello.com/p/spent-estimate-card-comment-format.html" target="_blank">Entering Spent / Estimate as card comments</A></li>\
<li>&bull; <A href="http://www.plusfortrello.com/p/faq.html#use_keywords" target="_blank">Using multiple keywords</A></li>\
<li>&bull; <A href="http://www.plusfortrello.com/p/sync-features.html" target="_blank">How Plus syncs Trello data</A></li>\
<li>&bull; <A href="http://www.plusfortrello.com/p/notes-for-users-of-scrum-for-trello.html" target="_blank">Support for S/E inside card titles</A></li>\
<li>&bull; <A href="http://www.plusfortrello.com/p/faq.html" target="_blank">Hashtags, week numbers, troubleshooting and more in the FAQ</A></li>\
</ul>\
</div>\
</dialog>');
        $("body").append(divDialog);
        divDialog = $(".agile_dialog_SEHelp");
    } 

    function doFinish(bOK) {
        divDialog[0].close();
    }

    function detectEscape(ev) {
        if (ev.keyCode == 27) {
            ev.preventDefault();
            doFinish(false);
            return false;
        }
    }

    divDialog.off("keydown.plusForTrello").on("keydown.plusForTrello", function (e) {
        return detectEscape(e);
    });

    divDialog.find("#agile_dialog_SEHelp_OK").off("click.plusForTrello").on("click.plusForTrello", function (e) {
        doFinish(true);
    });

    function hideAllSections() {
        divDialog.find(".agile_sehelpsection").addClass("agile_hidden");
    }

    var elemCombo = divDialog.find("#agile_sehelp_combotopic");
    elemCombo.off("keydown.plusForTrello").on("keydown.plusForTrello", function (e) {
        return detectEscape(e);
    });

    elemCombo.off("change.plusForTrello").on("change.plusForTrello", function (e) {
        var val = $(this).val();
        showSection(val);
    });

    function showSection(section) {
        hideAllSections();
        divDialog.find("#agile_sehelp_" + section).removeClass("agile_hidden");
        elemCombo.val(section);
    }
    hideAllSections();
    showSection(section);
    showModalDialog(divDialog[0]);
}
