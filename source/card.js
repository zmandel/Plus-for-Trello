/// <reference path="intellisense.js" />

var g_inputSEClass = "agile_plus_addCardSE";
var g_strNowOption = "now";
var g_bShowSEBar = false;

var g_strDateOtherOption = "other date...";
var g_valDayExtra = null; //for "other" date in S/E bar

var g_strUserOtherOption = "other user...";
var g_valUserExtra = null; //for "other" added user in S/E bar

var g_strNoteBase = "type note.";
var g_regexValidateSEKey = /[0-9]|\.|\:|\-/;

/* g_currentCardSEData 
 * 
 * keeps track of the card s/e row data to save in storage.local as a draft. cleared when user enters the row.
 *
**/
var g_currentCardSEData = { 
    loadFromStorage : function (idCard,callback) {
        assert(idCard);
        var key=this.keyStoragePrefix+idCard;
        this.idCard = idCard;
        this.clearValues();

        var thisLocal = this;
        chrome.storage.local.get(key, function (obj) {
            var value = obj[key];
            if (chrome.runtime.lastError || !value) {
                if (chrome.runtime.lastError)
                    console.log(chrome.runtime.lastError.message);
                callback();
                return;
            }
            value = JSON.parse(value);
            assert(idCard==value.idCard);
            if (thisLocal.idCard != idCard) {
                //should never happen but handle possible rare timing
                callback();
                return;

            }
            thisLocal.msTime = value.msTime;
            thisLocal.keyword = value.keyword;
            thisLocal.user = value.user;
            thisLocal.delta = value.delta;
            thisLocal.s = value.s;
            thisLocal.e = value.e;
            thisLocal.note = value.note;
            callback();
        });
    },
    saveToStorage: function (bForce) {
        assert(this.idCard);
        var stringified = JSON.stringify({
            idCard: this.idCard,
            keyword: this.keyword,
            user: this.user,
            delta: this.delta,
            s: this.s,
            e: this.e,
            note: this.note,
            msTime: this.msTime
        });
        if (!bForce) {
            if (this.strLastSaved == stringified)
                return;
        }
        var pair = {};
        var key = this.keyStoragePrefix + this.idCard;
        pair[key] = stringified;
        var thisLocal = this;
        chrome.storage.local.set(pair, function () {
            if (chrome.runtime.lastError) {
                console.log(chrome.runtime.lastError.message);
                return;
            }
            thisLocal.strLastSaved = stringified;
        });
    },

    setValues: function (idCard, keyword, user, delta, s, e, note) {
        if (this.idCard == idCard &&
            this.keyword == keyword &&
            this.user == user &&
            this.delta == delta &&
            this.s == s &&
            this.e == e &&
            this.note == note) {
            return;
        }

        this.idCard = idCard;
        this.keyword = keyword;
        this.user = user;
        this.delta = delta;
        this.s = s;
        this.e = e;
        this.note = note;
        this.msTime = Date.now();
        this.saveToStorage();
    },

    removeValue: function (idCardCur) {
        if (!idCardCur)
            idCardCur = this.idCard;

        if (!idCardCur)
            return;
        var key = this.keyStoragePrefix + idCardCur;
        chrome.storage.local.remove(key);
        if (this.idCard == idCardCur)
            this.clearValues();
    },

    //ALL BELOW IS PRIVATE

    clearValues: function () {
        this.msTime = 0;
        this.keyword = "";
        this.user = "";
        this.delta = "";
        this.s = "";
        this.e = "";
        this.note = "";
    },

    msTime: 0,
    keyStoragePrefix:"cardSEDraft:",
    strLastSaved : "",
    idCard : "",
    keyword: "",
    user: "",
    delta: "",
    s: "",
    e: "",
    note: ""
};

function validateSEKey(evt) {
	var theEvent = evt || window.event;
	var key = theEvent.keyCode || theEvent.which;
	key = String.fromCharCode(key);
	if (!g_regexValidateSEKey.test(key)) {
		theEvent.returnValue = false;
		if (theEvent.preventDefault) theEvent.preventDefault();
	}
}

var g_seCardCur = null; //null means not yet initialized review zig cleanup into a class
function getSeCurForUser(user,keyword) { //note returns null when not loaded yet
    assert(user);
    if (!g_seCardCur)
        return null;
    var retZero = { s: 0, e: 0 };
    var map = g_seCardCur[user] || retZero;
    if (!keyword)
        return map;
    return (map[keyword] || retZero);
    }

function updateEOnSChange(cRetry) {
    cRetry = cRetry || 0;
    var comment = $("#plusCardCommentComment");
    var spinS = $("#plusCardCommentSpent");
    var spinE = $("#plusCardCommentEstimate");
    var comboUsers = $("#plusCardCommentUsers");
    var comboKeywords = $("#plusCardCommentKeyword"); //can be empty

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
            var userCur = getUserFromCombo(comboUsers);
            if (!userCur)
                return; //timing related. card window could be gone thus no combo
            var keyword = comboKeywords.val(); //can be empty
            var mapSeCur = getSeCurForUser(userCur, keyword);
            if (!mapSeCur)
                return; //shouldt happen

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
    var comboKeywords = $("#plusCardCommentKeyword"); //can be empty

    if (comment.length == 0 || spinS.length == 0 || spinE.length == 0 || userElem.length==0)
        return;

    var userCur = getUserFromCombo(userElem);
    if (!userCur)
        return; //user not loaded yet
	var keyword = comboKeywords.val();
	var mapSe = getSeCurForUser(userCur, keyword);
    if (mapSe == null)
        return; // table not loaded yet. this will be called when table loads

    function done() {
        updateCurrentSEData();
    }

    var sRaw = spinS.val();
    var eRaw = spinE.val();

    var sParsed = parseSEInput(spinS, false, true);
    var eParsed = parseSEInput(spinE, false, true);

    if ((sRaw.length == 0 && eRaw.length == 0) || sParsed == null || eParsed == null) {
        comment.attr("placeholder", g_strNoteBase);
        done();
        return;
    }

    var sumS = sParsed + mapSe.s;
    var sumE = eParsed + mapSe.e;
    var rDiff = parseFixedFloat(sumE - sumS);
    var noteFinal=g_strNoteBase + " R will be " + rDiff + "."+(rDiff!=0? "":" Increase E if not done.");
    comment.attr("placeholder", noteFinal);
    comment.attr("title", noteFinal);
    done();
}


var g_timeoutUpdateCurrentSEData = null;

function updateCurrentSEData(bForceNow) {
    if (g_timeoutUpdateCurrentSEData) {
        clearTimeout(g_timeoutUpdateCurrentSEData);
    }

    function worker() {
        idCardCur = getIdCardFromUrl(document.URL);
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
        var valUser = comboUsers.val();
        var valDays = comboDays.val();
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
        }, 300);
    }
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

function fillComboKeywords(comboKeywords, rg, kwSelected, classItem) {

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

        var item = new Option(str, val);
        if (val == kwSelected)
            item.selected = true;
        var elemOption = $(item);
        if (classItem)
            elemOption.addClass(classItem);
        if (title)
            elemOption.attr("title", title);
        if (disabled)
            item.disabled = true;
        comboKeywords.append(elemOption);
    }

    comboKeywords.empty();
    for (var i = 0; i < rg.length; i++) {
        add(rg[i], kwSelected);
    }
}

function fillComboUsers(comboUsers, userSelected, idCard, nameBoard) {
    var sql = "select username from USERS order by username";
    var userMe = getCurrentTrelloUser();
    var user = g_strUserMeOption;
    comboUsers.empty();
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
		            if (user == g_valUserExtra)
		                g_valUserExtra = null;
		            if (user == userMe)
		                continue;
		            add(user);
		        }

		        FindIdBoardFromBoardName(nameBoard, idCard, function (idBoardFound) {
		            if (!idBoardFound)
		                return;
                    
		            getTrelloBoardMembers(idBoardFound, 1000*60*2, function (members) {
		                for (var i = 0; i < members.length; i++) {
		                    var member = members[i].member;
		                    if (!member || !member.username || mapUsers[member.username] || member.username == userMe)
		                        continue;
		                    add(member.username);
		                }
		                if (g_valUserExtra)
		                    add(g_valUserExtra);
		                add(g_strUserOtherOption);
		            });


		        });
        }
		});
}


function showSEButtonBubble(elem) {

    var step = {
        selector: elem,
        text: "Add Plus S/E<br>from here!",
        angle: 0,
        distance: 10,
        size: 150,
        hiliteTime:20000
    };
    showBubbleFromStep(step, true, true, 0);
}

function createSEButton() {
    var parent = $(".new-comment .comment-box-options");
    if (parent.length == 1) {
        var a = $("<A class='comment-box-options-item agile-addSEButton' href='#' title='Add Plus S/E...'>");
        var spanIcon = $("<span class='icon-sm'/>");
        var icon = $("<img style='margin-top:2px;'>").attr("src", chrome.extension.getURL("images/iconaddse.png"));

        //icon.addClass("agile-spent-icon-cardcommentSE");
        spanIcon.append(icon);
        a.append(spanIcon);
        parent.prepend(a);
        if (!isTourRunning()) {
            chrome.storage.sync.get([SYNCPROP_bShowedFeatureSEButton], function (obj) {
                if (!obj[SYNCPROP_bShowedFeatureSEButton]) {
                    showSEButtonBubble(a);
                    obj[SYNCPROP_bShowedFeatureSEButton] = true;
                    chrome.storage.sync.set(obj, function () {
                        if (chrome.runtime.lastError !== undefined)
                            return; //just to reference it so chrome debugger doesnt complain
                    });
                }
            });
        }
        a.click(function () {
            showSEBarContainer();
            setTimeout(function () {
                $(".agile_spent_box_input").focus();
            },0);
            
        });
    }
}

function showSEBarContainer(bDontRemember) {
    $(".agile-se-bar-entry").show();
    if (!bDontRemember)
        g_bShowSEBar = true;
}

function createCardSEInput(parentSEInput, idCardCur, board) {
    assert(idCardCur);
	var bHasSpentBackend = isBackendMode();
	g_seCardCur = {}; //reset totals

	var container = $("<div class='notranslate'></div>").addClass(g_inputSEClass).hide();
	var containerStats = $("<div></div>");
	var tableStats = $("<table class='agile-se-bar-table agile-se-stats tablesorter'></table>");
	var containerBar = $("<table class='agile-se-bar-table agile-se-bar-entry no-print'></table>");
	if (!g_bShowSEBar)
        containerBar.hide();
	containerStats.append(tableStats);
	container.append(containerStats);
	container.append(containerBar);
	var row = $("<tr></tr>").addClass("agile-card-background");
	containerBar.append(row);

	var comboUsers = setSmallFont($('<select id="plusCardCommentUsers"></select>').addClass("agile_users_box_input"));
	comboUsers.attr("title", "Click to select the user for this new S/E row.");
	fillComboUsers(comboUsers, "", idCardCur, board);
	comboUsers.change(function () {
	    updateNoteR();
	    var combo = $(this);
	    var val = combo.val();
	    if (!val)
	        return;
	    var userNew="";
	    function promptNewUser() {
	        userNew = prompt("Enter the Trello username.\nThat member will see s/e only if is a board member.\n\nTo hide users from the s/e bar, see Plus Preferences.", userNew);
	        if (userNew)
	            userNew = userNew.trim().toLowerCase();
	        if (userNew && userNew.indexOf("@") == 0)
	            userNew = userNew.substring(1);
	        if (userNew == g_strUserOtherOption)
	            userNew = "";
	        
	        if (userNew)
	            g_valUserExtra = userNew;
	        board = getCurrentBoard(); //refresh
	        fillComboUsers(combo, userNew, idCardCur, board);
	        if (userNew && userNew.toLowerCase().indexOf("global")!=0) { //global user is proposed in faq. dont confuse those users.
	            if (idCardCur != getIdCardFromUrl(document.URL))
	                return; //shouldnt happen and no biggie if does
	            board = getCurrentBoard();
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
	        updateCurrentSEData();
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
	var spinS = setNormalFont($('<input id="plusCardCommentSpent" placeholder="S"></input>').addClass("agile_spent_box_input agile_placeholder_small agile_focusColorBorder"));
	spinS.attr("title", "Click to type Spent.");
	spinS[0].onkeypress = function (e) { validateSEKey(e); };
    //thanks for "input" http://stackoverflow.com/a/14029861/2213940
	spinS.bind("input", function (e) { updateEOnSChange(); });
	var spinE = setNormalFont($('<input id="plusCardCommentEstimate" placeholder="E"></input>').addClass("agile_estimation_box_input agile_placeholder_small agile_focusColorBorder"));
	spinE.attr("title", "Click to type Estimate.");
	spinE[0].onkeypress = function (e) { validateSEKey(e); };
	spinE.bind("input", function (e) { updateNoteR(); });
	var slashSeparator = setSmallFont($("<span />").text("/"));
	var comment = setNormalFont($('<input type="text" name="Comment" placeholder="' + g_strNoteBase + '"/>').attr("id", "plusCardCommentComment").addClass("agile_comment_box_input agile_placeholder_small"));

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
	        comboKeyword.change(function () {
	            updateNoteR();
	        });
	    }
	}
	
	row.append($('<td />').addClass("agile_tablecellItem").append($("<div>").addClass("agile_usersComboContainer").append(comboUsers)));
	row.append($('<td />').addClass("agile_tablecellItem").append(comboDays));
	row.append($('<td />').addClass("agile_tablecellItem").append(spinS));
	row.append($('<td />').addClass("agile_tablecellItem").append(slashSeparator));
	row.append($('<td />').addClass("agile_tablecellItem").append(spinE));
	row.append($('<td />').addClass("agile_tablecellItem").append(comment).width("100%")); //takes remaining hor. space
	row.append($('<td />').addClass("agile_tablecellItemLast").append(buttonEnter));

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

			var mapSe = getSeCurForUser(userCur,keyword);
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

			setNewCommentInCard(idCardCur, keyword, s, e, valComment, prefix, userCur, onBeforeStartCommit, onFinished);
		});
	});

	comment.keypress(function (event) {
	    var keycode = (event.keyCode ? event.keyCode : event.which);
	    if (keycode == '13') { //enter key
	        buttonEnter.click();
	        return false;
	    }
	});
	
	comment.bind("input", function (e) { updateCurrentSEData(); });
	parentSEInput.before(container);
	fillCardSEStats(tableStats, function () {
	    container.show();
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
                sendDesktopNotification("Error while checking board memberships. " + response.status, 5000);
                return;
            }
            var members = response.board.memberships;
            if (!members)
                return;
            g_cacheBoardMembers[idShortBoard] = { ms: msNow, members: members };
            callback(members);
        });
}

function verifyBoardMember(userLowercase, idShortBoard, callbackNotFound) {
    assert(callbackNotFound);
    getTrelloBoardMembers(idShortBoard, 0, function (members) {
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
        var sql = "select '' as keyword, CB.idCard, CB.user, CB.spent, CB.est, CB.date \
				FROM CARDBALANCE AS CB \
				WHERE CB.idCard=? \
				ORDER BY CB.date DESC";
        var values = [idCard];

        if (g_optEnterSEByComment.IsEnabled() && g_optEnterSEByComment.rgKeywords.length>1) {
            sql = "select H.keyword, H.idCard, H.user, SUM(H.spent) as spent, SUM(H.est) as est, MAX(H.date) as date FROM HISTORY AS H WHERE H.idCard=? \
            group by user,keyword \
            order by date DESC";
        }

        getSQLReport(sql, values,
            function (response) {
                tableStats.empty();
                containerStats.hide();
                //reset totals
                g_seCardCur = {};
                var elemRptLink = containerStats.find(".agile_card_report_link");
                var estimateBadge = containerStats.find(".agile_badge_estimate");
                var spentBadge = containerStats.find(".agile_badge_spent");
                var remainBadge = containerStats.find(".agile_badge_remaining");
                if (response.status == STATUS_OK && (response.rows.length > 0 || isTourRunning())) {
                    containerStats.show();
                    if (elemRptLink.length == 0) {
                        estimateBadge = BadgeFactory.makeEstimateBadge().addClass("agile_badge_cardfront").attr('title', 'E sum\nall users');
                        spentBadge = BadgeFactory.makeSpentBadge().addClass("agile_badge_cardfront agile_badge_cardfrontFirst").attr('title', 'S sum\nall users');
                        remainBadge = BadgeFactory.makeRemainingBadge().addClass("agile_badge_cardfront").attr('title', 'R sum\nall users');
                        containerStats.prepend($('<a class="agile_card_report_link agile_link_noUnderline no-print" href="' + chrome.extension.getURL("report.html?idCard=") + encodeURIComponent(idCard) + '" target="_blank">Card Report - Plus</a>'));
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
                            elemHeaderE.attr("title", "Estimate sum per user. (1st estimate in parenthesis)");
                            bModifiedHeaderE = true;
                        }
                    }

                    if (isTourRunning())
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
                                dateLast: rowData.date, //take advantage of order by date DESC in query above
                                rowData:rowData
                            };
                            g_seCardCur[rowData.user] = mapCur;
                            rgReportRows.push(mapCur);
                        } else {
                            mapCur.s = mapCur.s + rowData.spent;
                            mapCur.e = mapCur.e + rowData.est;
                        }
                        var keyword=rowData.keyword;
                        if (keyword) {
                            mapKW = mapCur[keyword];
                            if (!mapKW) {
                                mapKW = {
                                    s: rowData.spent,
                                    e: rowData.est
                                };
                                mapCur[keyword] = mapKW;
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
<td title="change your units from Plus Preferences" align="left"><span class="agile_mtse_units"></span></td> \
</tr> \
</table> \
<input class="agile_mtse_note agile_placeholder_small" placeholder="type an optional note"></input> \
<button id="agile_modify_SETotal">Modify</button> \
<button id="agile_cancel_SETotal">Cancel</button> \
<br><br><p class="agile_mtseMessage agile_lightMessage"></p> \
<br>\
<span class="agile_lightMessage">Use "Modify" or use the "S/E bar" ?<br>Modify a 1st estimate ? See help <b>→</b></span> <A style="float:right" href="http://www.plusfortrello.com/p/spent-estimate-card-comment-format.html" target="_blank">help</A> \
</dialog>');
        $("body").append(divDialog);
        divDialog = $(".agile_dialog_editSETotal");
        divDialog.find("#agile_cancel_SETotal").click(function (e) {
            divDialog[0].close();
        });

        divDialog.find(".agile_mtse_s")[0].onkeypress = function (e) { validateSEKey(e); };
        divDialog.find(".agile_mtse_e")[0].onkeypress = function (e) { validateSEKey(e); };
        divDialog.find(".agile_mtse_r")[0].onkeypress = function (e) { validateSEKey(e); };

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
        elemKwLink.attr("href", chrome.extension.getURL("report.html?idCard=" + encodeURIComponent(idCard) + "&orderBy=keyword&user=" + user+"&sortList=%5B%5B%22Keyword%22%2C0%5D%2C%5B%22Date%22%2C1%5D%5D"));
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
    var elemNote = divDialog.find(".agile_mtse_note");
    var strMessageInitial = "Once you modify totals Plus will enter a new S/E row with the needed difference.";
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

    comboKeyword.off("change.plusForTrello").on("change.plusForTrello", function (e) {
        initValues();
    });

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
        var note = replaceBrackets(elemNote.val());
        setNewCommentInCard(idCardCur, data.keyword, data.s, data.e, note, "", //empty prefix means time:now
            user, onBeforeStartCommit, onFinished);
    });

    elemS.unbind().bind("input", function (e) { updateMessage(true); });
    elemE.unbind().bind("input", function (e) { updateMessage(true); });
    elemR.unbind().bind("input", function (e) { updateEFromR(); updateMessage(false); });
    $(".agile_mtse_units").text(UNITS.getLongFormat(UNITS.current));
    divDialog[0].showModal();
    elemR.focus();
    elemR[0].select();
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
	    var urlReport = '<a class="agile_link_noUnderline" href="' + chrome.extension.getURL("report.html?idCard=") + encodeURIComponent(idCardCur) + '&user=' + rowData.user + '" target="_blank">' + rowData.user + '</a>';
	    u = $(td).html(urlReport);
	}

	var sVal = (typeof (rowData.spent) == 'string' ? rowData.spent : parseFixedFloat(rowData.spent));
	var eOrigVal = (typeof (rowData.estOrig) == 'string' ? rowData.estOrig : parseFixedFloat(rowData.estOrig));
	var eVal = (typeof (rowData.est) == 'string' ? rowData.est : parseFixedFloat(rowData.est));
	var rVal =  (typeof (rowData.remain) == 'string' ? rowData.remain : parseFixedFloat(eVal - sVal));
	var s = $(td);
	
	var e = $(td).addClass("agile-card-now-estimate-header");
	var r = $(td);
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
	                return false;
	            }

	            var msdateNow = Date.now();
				//prevent lots of reports while use moves the mouse over link
	            //also prevents running this flow while the report is being calculated, thus possibly breaking the hack
				if (msdateNow - msdateCalc<3000)
	                return false;

	            msdateCalc = msdateNow;
	            var maxRows = 10;
	            var maxNote = 50;
	            var sql = "select H.keyword, H.spent, H.est, H.date, H.week, h.comment FROM HISTORY AS H WHERE H.idCard=? and user=? order by date DESC LIMIT "+(maxRows+1);
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
	            return true; //handled so return true
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
				        help = setSmallFont($("<A class='quiet-button u-float-left' style='margin-left:10px' href='http://www.plusfortrello.com/p/spent-estimate-card-comment-format.html' target='_blank'><b>" + kw + "</b> keyword help</A>").addClass(classSpentCommentHelp), 0.85);
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
				var div = $("<div class='no-print'></div>");
				div.append(createRecurringCheck()).append(createHashtagsList());
				elemWindowTop.find(".window-header").eq(0).append(createMiniHelp()).append(div);
				
				createCardSEInput(elemParent, idCardCur, board);
				break;
			}
		}
	}

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
	}
}

function checkCardRecurringCheckbox() {
    var idCardCur = getIdCardFromUrl(document.URL);
    if (!idCardCur)
        return;
    var elemTitle = $(".window-title-text");
    if (elemTitle.length == 0)
        return;
    
    var checkbox = $("#agile_checkRecurringCard");
    if (elemTitle.length == 0)
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
    var elemTitle = $(".window-title-text");
    var titleCur = elemTitle.text().trim();
    var bChecked = (titleCur.indexOf(TAG_RECURRING_CARD) >= 0);
    check[0].checked = bChecked;
    span.append($('<label style="display:inline;margin-right:2em;font-weight:normal" for="agile_checkRecurringCard" class="agile_unselectable agile_linkSoftColor">Recurring</label>'));
    updateRecurringCardImage(bChecked, icon);
    check.click(function () {
        bChecked = check.is(':checked');
        elemTitle = $(".window-title-text");

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
            titleCur = titleCur.replace(/\[R\]/g, "").trim();
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

function createHashtagsList() {
    var comboK = $("<select class='agile_hashtags_list agile_linkSoftColor'></select>");
    comboK.prop("title", "Add Plus #tags which are searchable from Reports.");
    var txtOther = "other...";
    var elemOther = null;

    function addFirst() {
        //disabled selected
        comboK.append($(new Option("add #tags", "", false, true)).attr('disabled', 'disabled').prop("title", "Click to add #tags"));
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
   
    comboK.on("mousedown", function (e) {
        if (bLoaded)
            return;
        //ignore click. load the list then fake a click again. not perfect
        //since list can be dropped with the keyboard and wont be loaded.
        //those users prob prefer to rename card titles directly so there.
        e.preventDefault();
        bLoaded = true;
        sendExtensionMessage({ method: "getAllHashtags" }, function (response) {
            if (response.status != STATUS_OK) {
                alert(response.status);
                return;
            }
            comboK.empty();
            addFirst();
            listCached = cloneObject(response.list);
            listCached.forEach(function (k) {
                addKeyword("#" + k);
            });
            addOther();
            var event;
            event = document.createEvent('MouseEvents');
            event.initMouseEvent('mousedown', true, true, window);
            comboK[0].dispatchEvent(event);
        });
    });

    //review fix selectFirst mess with promises
    function selectFirst() {
        comboK.val("");
    }

    comboK.on("change", function () {
        var val = comboK.val();
        if (val == "")
            return;
        if (val == txtOther) {
            var newHash = prompt("Type the new hashtag:");
            if (!newHash) {
                selectFirst();
                return;
            }
            newHash = newHash.trim();
            if (newHash.indexOf("#") < 0)
                newHash = "#" + newHash;
            if (newHash.indexOf(" ") >= 0) {
                alert("Type a single hashtag without spaces.");
                selectFirst();
                return;
            }
            if (!listCached.every(function (k) {
                if (("#" + k).toLowerCase() == newHash.toLowerCase())
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
            val = newHash;
        }
        var idCardCur = getIdCardFromUrl(document.URL);
        elem = $(".window-title-text");
        if (!idCardCur || elem.length == 0) {
            selectFirst();
            return;
        }

        var titleCur = elem.text().trim();
        var rgHash = getHashtagsFromTitle(titleCur);
        for (var iHash = 0; iHash < rgHash.length;iHash++) {
            if ("#" + rgHash[iHash].toLowerCase() == val.toLowerCase()) {
                //silently ignore
                selectFirst();
                return;
            }
        }
        titleCur = titleCur + " " + val;
        renameCard($.cookie("token"), idCardCur, titleCur, function (response) {
            if (response.status != STATUS_OK) {
                alert("Failed to rename card.\n" + response.status);
            }
            selectFirst();
        });
    });
    return comboK;
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
            hash = obj.hash;
            var stored = obj.stored;
            if (stored === undefined || (stored.msStart != null && stored.msEnd != null) ||
                (stored.msStart == null && stored.msEnd == null)) {
                //START
                if (idCardActiveTimer && !g_bDontWarnParallelTimers) {
                    if (!confirm("There is already an active timer.\nClick the Chrome Plus icon to see it.\nAre you sure you want to start another timer?\n\n(See Plus help Preferences to disable this warning)"))
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
                    showTimerPopup(idCard);
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
                        showSEBarContainer();
                        addSEFieldValues(sCalc);
                    }
                    else {
                        sendDesktopNotification("Ellapsed time too small (under 0.01 "+UNITS.getLongFormat()+"). Timer ignored\n.", 10000);
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
 * s: float
 * will add to existing s in field
 **/
function addSEFieldValues(s) {
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
function setNewCommentInCard(idCardCur, keywordUse, s, e, commentBox,
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
	if (!board) {
		logPlusError("error: no board");
		return; //should never happen, we had it when the S/E box was created
	}

	if (!idCardCur || idCardCur != getIdCardFromUrl(document.URL))
		return; //should never happen

	FindIdBoardFromBoardName(board, idCardCur, function (idBoardFound) {
		if (idBoardFound) {
		    idBoardUse = idBoardFound;
		    assert(idBoardUse && board);
		    doEnterSEIntoCard(s, e, commentBox, comment, idBoardUse, idCardCur, prefix, board, keywordUse, member, onBeforeStartCommit, onFinished);
		}
		else {
		    alert("Network error. Cannot get board data: idBoard.\nPlease try again when online.");
		}
	});
}

function HandleNoBackendDbEntry(s, e, commentBox, idBoard, idCard, strDays, strBoard, cleanTitle, userCur, idHistoryRowUse, keyword) {
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
	var se = parseSE(titleCur, true);
	cleanTitle = se.titleNoSE;

	var titleCardNew = null;
	var commentEnter = comment;

	if (!IsStealthMode()) {
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
	
	handleEnterCardComment(titleCardNew, commentEnter, strBoard, idBoard, idCard, s, e, commentBox, strDays, cleanTitle, keyword, member, onBeforeStartCommit, onFinished);
}

function handleEnterCardComment(titleCard, comment, strBoardParam, idBoardParam, idCard, s, e, commentBox,
            strDays, cleanTitle, keyword, member, onBeforeStartCommit, onFinished) {
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
            HandleNoBackendDbEntry(s, e, commentBox, idBoard, idCard, strDays, strBoard, cleanTitle, member, idHistoryRowUse, keyword);
            if (!IsStealthMode() && titleCard) {
                renameCard($.cookie("token"), idCard, titleCard, function (response) {
                    if (response.status != STATUS_OK) {
                        alert("Failed to rename card to change S/E\n" + response.status);
                    }
                    finished(true);
                });
            }
            else
                finished(true);
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
    //review zig: this is only used when user never configured sync. not worth it keeping it
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
			var headerTitle = topParent.find(".pop-over-header-title").eq(0);
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
		var icon = $("<img>").attr("src", chrome.extension.getURL("images/iconspent.png")).css("margin-bottom", "-3px");
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
					alert("Plus for Trello could not find the new board (has not been used yet in Plus). To correct, please enter an S/E of 0/0 on the card after pressing OK.");
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
				helperInsertHistoryRow(new Date(), idCardCur, idBoardNew, boardNameNew, nameCard, userCur, 0, 0, "Plus: card moved from '"+boardCur+"'");
				sendDesktopNotification("Plus has moved the card's data to the new board.", 8000);
			}
		});
}