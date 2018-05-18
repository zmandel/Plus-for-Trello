/// <reference path="intellisense.js" />
function showTransferEDialog() {
    getUserLast(true).then(userLast => showTransferEDialogWorker(userLast));
}

function showTransferEDialogWorker(userLast) {
    var board = getCurrentBoard();
    if (board == null)
        return; //wait til later

    var idCardCur = getIdCardFromUrl(document.URL);
    if (!idCardCur)
        return;
    var seData = g_seCardCur;
    if (!seData) {
        sendDesktopNotification("Still loading. Try again in a few seconds.");
        return;
    }

    var divDialog = $(".agile_dialog_transferE");
    if (divDialog.length == 0) {
        divDialog = $('\
<dialog class="agile_dialog_transferE agile_dialog_DefaultStyle"> \
<h2>Transfer estimates</h2><br> \
<select class="agile_transferE_keywords agile_combo_smaller" title="Pick the keyword for this modification."></select> \
<a class="agile_transferE_kwReportLink agile_linkSoftColor" href="" target="_blank">view keyword report</a> \
<table class="agile_seTotalTable"> \
<tr> \
<td align="left" class="agile-etransfer-tcel-header">From</td> \
<td align="left" class="agile-etransfer-tcel-header">To</td> \
<td align="left" class="agile-etransfer-tcel-header" style="white-space: nowrap;">E ' + UNITS.getLongFormat(UNITS.current,g_bDisplayPointUnits) + '</td> \
</tr> \
<tr> \
<td align="left"><select class="agile_transferE_user_from agile_combo_regular" title="Pick the \'from\' user."></select></td> \
<td align="left"><select autofocus class="agile_transferE_user_to agile_combo_regular" title="Pick the \'to\' user."></select></td> \
<td align="left"><input class="agile_transferE_e" maxlength="10"</input></td> \
</tr> \
</table> \
<input class="agile_se_note agile_placeholder_small" placeholder="type an optional note"  maxlength="250"></input> \
<label class="agile_unselectable" style="vertical-align: middle;font-weight:normal;line-height:1em;"><input type="checkbox" class="agile_transfere_alsospend" style="vertical-align: middle;margin-bottom:4px;margin-top:4px;" /> Immediately spend the transferred ' + UNITS.getLongFormat(UNITS.current, g_bDisplayPointUnits) + '.</label>\
<button id="agile_enter_transferE">Enter</button> \
<button id="agile_cancel_transferE">Cancel</button> \
<button id="agile_help_transferE" style="display:inline-block;float:right;">Help</button> \
<p class="agile_transferEMessage agile_lightMessage">&nbsp;</p> \
<br> \
<table style="agile-etransfer-stats">\
<tr class="agile-card-background-header">\
<td style="width:50%;">User balances after Enter</td>\
<td style="width:15%;">S <span style="font-size:0.85em">sum</span></td>\
<td style="width:20%;">E <span style="font-size:0.85em">sum</span> (<span>1ˢᵗ</span>)</td>\
<td style="width:15%;">R</td>\
</tr>\
<tr>\
<td class="agile-etransfer-cell agile-etransfer-tcel-from-user">from: </td>\
<td class="agile-etransfer-cell agile-etransfer-tcel-from-s"></td>\
<td class="agile-etransfer-cell agile-etransfer-tcel-from-e"></td>\
<td class="agile-etransfer-cell agile-etransfer-tcel-from-r"></td>\
</tr>\
<tr>\
<td class="agile-etransfer-cell agile-etransfer-tcel-to-user">to: </td>\
<td class="agile-etransfer-cell agile-etransfer-tcel-to-s"></td>\
<td class="agile-etransfer-cell agile-etransfer-tcel-to-e"></td>\
<td class="agile-etransfer-cell agile-etransfer-tcel-to-r"></td>\
</table>\
</dialog>');
        $("body").append(divDialog);
        divDialog = $(".agile_dialog_transferE");
        divDialog.find("#agile_cancel_transferE").click(function (e) {
            divDialog[0].close();
        });

        divDialog.find("#agile_help_transferE").click(function (e) {
            showSEHelpDialog("transfere");
        });
    }

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

    var comboUserTo = divDialog.find(".agile_transferE_user_to");
    var comboUserFrom = divDialog.find(".agile_transferE_user_from");
    var elemAlsoSpend = divDialog.find(".agile_transfere_alsospend");
    var bAlsoSpend = false;

    setTimeout(() => { comboUserTo.focus();}); // for convenience, and so ESC wont kill the card behind
    var celSel = {
        from: { user: ".agile-etransfer-tcel-from-user", s: ".agile-etransfer-tcel-from-s", e: ".agile-etransfer-tcel-from-e", r: ".agile-etransfer-tcel-from-r" },
        to: { user: ".agile-etransfer-tcel-to-user", s: ".agile-etransfer-tcel-to-s", e: ".agile-etransfer-tcel-to-e", r: ".agile-etransfer-tcel-to-r" }
    };
    function appendPick(combo) {
        combo.append($(new Option("--  pick  --", "", false, true)).attr('disabled', 'disabled'));
    }

    elemAlsoSpend[0].checked = false;
    comboUserFrom.empty();
    appendPick(comboUserFrom);
    var userSelected = "";
    var userCurrent = getCurrentTrelloUser();
    for (user in seData) {
        var data = seData[user];
        if (data && data.e && data.e > 0) {
            var r = parseFixedFloat(data.e - data.s);
            if (r <= 0)
                continue;
            if (user == userCurrent)
                user = g_strUserMeOption;

            //userLast, if exists, has precedence, then the global user
            if (!userSelected || userSelected != userLast) {
                if ((user == userLast) || (user == g_globalUser) || (userSelected != g_globalUser))
                    userSelected = user;
            }
            comboUserFrom.append($(new Option(user, user)));
        }
    }

    if (userSelected) {
        comboUserFrom.val(userSelected);
    } else {
        alert("There are no users with Estimate for this card.\nFirst add a user or global estimate.");
        return;
    }

    comboUserTo.empty();
    appendPick(comboUserTo);
    fillComboUsers(false, comboUserTo, "", idCardCur, board, true, function callback(status) {
        //comboUserTo.val(""); //unselect
    });

    var comboKeyword = divDialog.find(".agile_transferE_keywords");
    var elemKwLink = divDialog.find(".agile_transferE_kwReportLink");

    var bHideComboKeyword = true;
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
        var href = chrome.extension.getURL("report.html?chartView=s&idCard=" + encodeURIComponent(idCard) + '&groupBy=user-keyword&orderBy=keyword&archived=-1&deleted=-1&sortList=%5B%5B"User"%2C0%5D%2C%5B"Keyword"%2C0%5D%5D');
        if (g_bProVersion)
            href += '&customColumns=user%2Ckeyword%2Cs%2Ce1st%2Ce%2Cr';
        elemKwLink.attr("href", href);
    }

    var elemE = divDialog.find(".agile_transferE_e");
    var elemMessage = divDialog.find(".agile_transferEMessage");
    var elemNote = divDialog.find(".agile_se_note");

    function setMessageText(text) {
        if (!text)
            elemMessage.html('&nbsp;');
        else
            elemMessage.text(text);
    }

    elemE.val('');
    setMessageText('');
    elemNote.val('');

    function refreshPreview(callback) {
        getData(true, callback);
    }

    function getData(bSilent, callback) {

        var data = null;
        var bFinished = false;

        function finish(status, elemError) {
            assert(!bFinished);
            bFinished = true;
            setMessageText(status == STATUS_OK ? "Ready to enter." : status);
            if (!bSilent && status != STATUS_OK) {
                if (elemError)
                    elemError.focus();
                alert(status);
            }
            if (callback)
                callback(status, data);
        }

        var eNew = elemE.val().trim();
      
        var eNewNum = parseFixedFloat(eNew);
        if (eNewNum < 0) {
            finish("E cannot be negative. To transfer the other way arround, switch from/to.", elemE);
            return;
        }

        var kw = g_optEnterSEByComment.getDefaultKeyword();
        if (!bHideComboKeyword)
            kw = comboKeyword.val();

        if (!kw) {
            finish("pick a keyword", bHideComboKeyword ? null : comboKeyword);
            return;
        }

        var note = elemNote.val() || "";
        var userFrom = getUserFromCombo(comboUserFrom).toLowerCase();
        var userTo = getUserFromCombo(comboUserTo).toLowerCase();

        if (note.length > 0 && note.trim().indexOf(PREFIX_PLUSCOMMAND) == 0) {
            finish("Plus commands (starting with " + PREFIX_PLUSCOMMAND + ") cannot be entered from here.", elemNote);
            return;
        }

        if (!userFrom && !userTo) {
            finish("Pick the 'from' and 'to' users.", comboUserFrom);
            return;
        }

        function fillTableRow(balData, selData, prefixFrom) {
            var elemUser = divDialog.find(selData.user);
            var elemS = divDialog.find(selData.s);
            var elemE = divDialog.find(selData.e);
            var elemR = divDialog.find(selData.r);
            var user = balData.user; //when empty, clear the other cells
            assert(elemUser.length == 1);
            elemUser.text(prefixFrom + user);
            elemS.removeClass("agile_plus_header_error");
            elemE.removeClass("agile_plus_header_error");
            elemR.removeClass("agile_plus_header_error agile_remaining_background");
            if (user) {
                elemS.text(parseFixedFloat(balData.s));
                if (balData.s < 0)
                    elemS.addClass("agile_plus_header_error");
                elemE.text(parseFixedFloat(balData.e) + " (" + parseFixedFloat(balData.e1) + ")");
                if (balData.e < 0)
                    elemE.addClass("agile_plus_header_error");
                var rCalc = balData.e - balData.s;
                elemR.text(parseFixedFloat(rCalc));
                if (rCalc < 0)
                    elemR.addClass("agile_plus_header_error");
                else if (rCalc > 0)
                    elemR.addClass("agile_remaining_background");
            } else {
                elemS.empty();
                elemE.empty();
                elemR.empty();
            }
        }

        var sqlParams = [idCardCur, userFrom, userTo]; //userFrom or userTo might be empty
        var sqlStmt = "SELECT spent,est,user,eType FROM HISTORY where idCard=? AND (user=? OR user=?)";
        if (!bHideComboKeyword) {
            sqlStmt += " AND keyword=?";
            sqlParams.push(kw);
        }
        sqlStmt += " order by rowid ASC";
        getSQLReport(sqlStmt, sqlParams, function (response) {
            if (response.status != STATUS_OK) {
                finish(response.status);
                return;
            }

            var bSameUsers = (userFrom == userTo);
            if (bSameUsers) {
                userTo = "";
            }
            var bal = {};
            bal.from = { s: 0, e: 0, e1: 0, user:userFrom };
            bal.to = { s: 0, e: 0, e1: 0,user:userTo};
            for (var i = 0; i < response.rows.length; i++) {
                var row = response.rows[i];
                var elem = (row.user==userFrom? bal.from : bal.to);
                elem.s += row.spent;
                elem.e += row.est;
                if (row.eType == ETYPE_NEW)
                    elem.e1 += row.est;
            }

            bal.from.e -= eNewNum;
            bal.from.e1 -= eNewNum;
            bal.to.e += eNewNum;
            bal.to.e1 += eNewNum;
            if (bAlsoSpend)
                bal.to.s += eNewNum;

            fillTableRow(bal.from, celSel.from, "from: ");
            fillTableRow(bal.to, celSel.to, "to: ");

            if (!userFrom) {
                finish("Pick the 'from' user.", comboUserFrom);
                return;
            }

            if (bal.from.e - bal.from.s < 0) {
                finish(userFrom + " does not have enough to transfer " + eNewNum + ".");
                return;
            }

            if (bSameUsers) {
                finish("Users cannot be the same.", comboUserTo);
                return;
            } else if (!userTo) {
                finish("Pick the 'to' user.", comboUserTo);
                return;
            }

            if (eNewNum == 0) {
                finish("Type the E to transfer.", elemE);
                return;
            }


            data = { keyword: kw, userFrom: userFrom, userTo: userTo, e: eNewNum, note: note, bAlsoSpend: bAlsoSpend };
            finish(STATUS_OK);
            return;
        });
    }

    elemAlsoSpend.off("click.plusForTrello").on("click.plusForTrello", function () {
        bAlsoSpend = elemAlsoSpend.is(':checked');
        refreshPreview();
    });

    comboUserTo.off("change.plusForTrello").on("change.plusForTrello", function () {
        var combo = $(this);
        var val;

        function getVal() {
            val = combo.val() || "";
        }

        function done() {
            refreshPreview();
            if (val) {
                setTimeout(function () {
                    elemE.focus();
                }, 100);
            }
        }

        getVal();

        if (val == g_strUserOtherOption) {
            promptNewUser(combo, idCardCur, function () {
                getVal();
                done();
            });
        } else {
            done();
        }
    });

    comboUserFrom.off("change.plusForTrello").on("change.plusForTrello", function (e) {
        var val = comboUserFrom.val();
        if (val)
            rememberSEUser(val);
        refreshPreview();
    });

    comboKeyword.off("change.plusForTrello").on("change.plusForTrello", function (e) {
        refreshPreview();
    });

    elemE.off("input.plusForTrello").on("input.plusForTrello", function (e) {
        refreshPreview();
    });

    elemE.off("keypress.plusForTrello").on("keypress.plusForTrello", function (e) {
        validateSEKey(e);
    });

    function enableUI(bEnable) {
        setBusy(!bEnable);
        var elems = $(".agile_dialog_transferE *").not('option');
        elems.prop('disabled', !bEnable);
    }

    //Click Enter
    function doEnter() {

        getData(false, function (status, data) {
            //data: // { keyword: kw, userFrom: userFrom, userTo: userTo, e: eNewNum, note: note, bAlsoSpend: bAlsoSpend }
            if (status != STATUS_OK || !data)
                return;
            assert(data.e > 0);

            function onBeforeStartCommit() {
                enableUI(false);
            }

            function onFinishedFinal(bOk, bCloseEvenOnFailure) {
                enableUI(true);
                if (bOk || bCloseEvenOnFailure)
                    divDialog[0].close();
            }

            function onFinished(bOk) {
                if (bOk) {
                    elemE.val(''); //safety in case the next operation fails, we dont want the user to click again OK
                    if (data.bAlsoSpend) {
                        setNewCommentInCard(idCardCur, data.keyword, data.e, 0.0, data.note, "", //empty prefix means time:now
                        data.userTo, null, null, function (bOk) {
                            if (!bOk)
                                alert("Error: The transfer succededed but entering the Spent may have failed.\nPlease refresh the trello.com page and wait for sync to finish to verify user balances.");
                            onFinishedFinal(bOk, true);
                        });
                    } else {
                        onFinishedFinal(bOk, false);
                    }
                }
            }
            setNewCommentInCard(idCardCur, data.keyword, 0.0, data.e, data.note, "", //empty prefix means time:now
                data.userFrom, data.userTo, onBeforeStartCommit, onFinished);
        });
    }

    divDialog.find("#agile_enter_transferE").off("click.plusForTrello").on("click.plusForTrello", function (e) {
        doEnter();
    });
    
    showModalDialog(divDialog[0]);
    enableUI(false);
    refreshPreview(function (status) {
        enableUI(true);
    });
}