var g_bNeedStartTourBubble = false;

var SYNCMETHOD = {
    disabled:0,
    trelloComments: 1,
    googleSheetLegacy: 2
};

var Help = {
    m_bShowing: false, //necessary to catch the possibility of null m_container on a consecutive display call
	m_container: null,
	m_manifestVersion: "",

	init: function () {
		if (Help.m_manifestVersion != "")
		    return;
		Help.m_manifestVersion = "unknown";
		var url = chrome.extension.getURL("manifest.json");
		
		var xhr = new XMLHttpRequest();
		xhr.onreadystatechange = function (e) {
		    if (xhr.readyState == 4 && xhr.status == 200) {
		        try {
		            var manifest = JSON.parse(xhr.responseText);
		            Help.m_manifestVersion = manifest.version;
		        }
		        catch (e)
		        {
		            console.log("error: cant parse manifest.");
		            if (url.indexOf("/gddgnpbmkhkpnnhkfheojeiceofcnoem/") >= 0) //developer url
		                alert("error");
		        }
			}
		};

		xhr.open("GET", url);
		xhr.send();
	},

	raw: function (h) {
		var elem = $(h);
		this.m_container.append(elem);
		return elem;
	},
	para: function (h, container) {
		var p = $('<p></p>').html(h);
		if (container === undefined)
			container = this.m_container;
		container.append(p);
		return p;
	},
	storageTotalSync: 0,
	storageTotalLocal: 0,
	storageTotalLocalStorage: 0,
	totalDbRowsHistory: 0,
	totalDbRowsHistoryNotSync: 0,
	totalDbMessages: 0,
	hasLegacyRows: false,
	bDontShowAgainSyncWarn: false,
    bStartTourBubbleOnClose: false,
    bAcceptSFT: false,
    bStartSyncOnClose: false,
    isVisible: function () {
        return ($('#agile_help_container').size() > 0 || this.m_bShowing);
    },
	display: function () {
	    if (this.m_bShowing || !g_dbOpened) {
			return;
	    }
	    this.m_bShowing = true;
	    this.bStartSyncOnClose = false;
	    removeAllGrumbleBubbles();
		var thisObj = this;
		testExtension(function () { //show help only if connected, plus this also commits pending log messages
			chrome.storage.sync.getBytesInUse(null,
				function (bytesInUse) {
					thisObj.storageTotalSync = bytesInUse;
					chrome.storage.local.getBytesInUse(null,
						function (bytesInUse2) {
							thisObj.storageTotalLocal = bytesInUse2;
							sendExtensionMessage({ method: "getlocalStorageSize" },
								function (response) {
									thisObj.storageTotalLocalStorage = response.result;
									sendExtensionMessage({ method: "getTotalDBRows" },
										function (response) {
										    if (response.status != STATUS_OK)
										        thisObj.totalDbRowsHistory = response.status; //review zig: ugly. dont allow plus to start
										    else {
										        thisObj.totalDbRowsHistory = response.cRowsTotal;
										    }

											sendExtensionMessage({ method: "getTotalDBRowsNotSync" },
												function (response) {
													if (response.status != STATUS_OK)
														thisObj.totalDbRowsHistoryNotSync = response.status;
													else
														thisObj.totalDbRowsHistoryNotSync = response.cRowsTotal;

													var keySyncWarn = "bDontShowAgainSyncWarn";
													chrome.storage.local.get([keySyncWarn], function (obj) {
													    var value = obj[keySyncWarn];
													    if (value !== undefined)
													        thisObj.bDontShowAgainSyncWarn = value;

													    thisObj.bAcceptSFT = g_bAcceptSFT;

													    sendExtensionMessage({ method: "getTotalDBMessages" },
																function (response) {
																    if (response.status != STATUS_OK)
																        thisObj.totalDbMessages = response.status;
																    else
																        thisObj.totalDbMessages = response.cRowsTotal;

																    sendExtensionMessage({ method: "detectLegacyHistoryRows" },
                                                                    function (response) {
                                                                        thisObj.hasLegacyRows = response.hasLegacyRows;
                                                                        thisObj.displayWorker();
                                                                    });
																});
													});

												});
										});
								});
						}
					);
				}
			);
			});
	},

	enableIntervalScroll: function (bEnable) {
	    if (bEnable) {
	        if (this.intervalCorrectScroll)
	            return;
	        this.intervalCorrectScroll=setInterval(function () {
	                var url = document.URL;
	                var iPound = url.indexOf("#");
	                if (iPound > 0) {
	                    //prevent scrolling of body when clicking on a topic at the end
	                    $('body').scrollTop(0);
	                    url = url.substr(0, iPound);
	                    window.history.replaceState('data', '', url);
	                }
	            }, 50);
	        return;
	    }

	    assert(!bEnable);
	    if (this.intervalCorrectScroll != null) {
	        clearInterval(this.intervalCorrectScroll);
	        this.intervalCorrectScroll = null;
	    }
	},
	displayWorker: function () {
	    var helpWin = this;
	    var comboSync = null;
	    var spanButtonGS = null;
	    var bNotSetUp = (g_configData == null);
	    var bSEByComments = g_optEnterSEByComment.IsEnabled();
	    if (bNotSetUp && bSEByComments)
	        bNotSetUp = false;

	    if (g_bDisableSync)
	        bNotSetUp = true;
	    function keepSyncPaused(bForce) {
	        if (bForce || helpWin.m_bShowing) {
	            sendExtensionMessage({ method: "beginPauseSync" }, function (response) { });
	            setTimeout(function () { keepSyncPaused(false); }, 1000);
	        }
	    }

	    keepSyncPaused(true);

	    var container = $('<div id="agile_help_container" tabindex="0"></div>').height($(window).height());
	    container.keydown(function (evt) {
	        evt.stopPropagation(); //dont let it bubble to document. in some pages like boards, document hooks into keyboard events for card navigation, which breaks scrolling here with down-arrow etc
	        return true; //do default action for this element
	    });
	    helpWin.m_container = container;
	    var elemClose = helpWin.raw('<div style="float:right;width:18px;"><img class="agile_help_close" src="' + chrome.extension.getURL("images/close.png") + '"></img></div>');
	    elemClose = elemClose.find(".agile_help_close");
	    elemClose.click(function () {
	        if (g_bDisableSync || (g_strServiceUrl == "" && !g_optEnterSEByComment.IsEnabled())) {
	            var msgAlert = "You have not enabled sync. You will not see your team data.\nClick Cancel to configure sync, or click OK to use without sync.";
	            var bHiliteGSButton = false;
	            if (comboSync.val() == SYNCMETHOD.googleSheetLegacy && g_strServiceUrl == "") {
	                msgAlert = "You have not set a google spreadsheet sync url.\nClick Cancel to configure it, or click OK to use without sync.";
	                bHiliteGSButton = true;
	            }

	            if (!confirm(msgAlert)) {
	                var section = $("#agile_help_trellosync");
	                var top = section.offset().top;
	                container.animate({
	                    scrollTop: top + container[0].scrollTop
	                }, 1000, function () {
	                    if (bHiliteGSButton)
	                        hiliteOnce(spanButtonGS, 3000);
	                });
	                return;
	            }
	        }
	        Help.close(false);
	    });

	    var elemTop = helpWin.raw('<div style="float:right;width:18px;"><img class="agile_help_top" src="' + chrome.extension.getURL("images/helptop.png") + '"></img></div>');
	    elemTop = elemTop.find(".agile_help_top");
	    elemTop.click(function () {
	        helpWin.m_container.animate({ scrollTop: helpWin.m_container.offset().top }, 350);
	    });
	    //dim help button after a few seconds. css hover will make it black again
	    setTimeout(function () {
	        elemClose.animate({
	            opacity: 0.33
	        }, 4000);
	        elemTop.animate({
	            opacity: 0.33
	        }, 4000);
	    }, 8000);

	    helpWin.raw('<span style="font-size:1.7em;font-weight:bold;">Plus for Trello Help</span>');
	    helpWin.raw('<span style="float:right;padding-right:6em;">version ' + Help.m_manifestVersion + '&nbsp;&nbsp<A href="#agile_help_languages">Language</A>&nbsp;&nbsp<A target="_blank" href="https://chrome.google.com/webstore/detail/plus-for-trello/gjjpophepkbhejnglcmkdnncmaanojkf/reviews" title="Give Plus 5 stars!\nHelp make Plus more popular so I can keep improving it.">Rate</A>&nbsp;&nbsp \
			<A target="_blank" href="https://chrome.google.com/webstore/support/gjjpophepkbhejnglcmkdnncmaanojkf">Feedback</a>&nbsp;&nbsp\
<a href="http://plusfortrello.blogspot.com/2014/12/change-log.html" target="_blank">Change log</A>&nbsp;&nbsp\
			<a class="agile_link_noUnderlineNever"  href="https://plus.google.com/109669748550259696558/posts" rel="publisher" target="_blank"> \
<img src="https://ssl.gstatic.com/images/icons/gplus-16.png" alt="Plus for Trello Google+ page" style="margin-bottom:-3px;margin-right:1px;border:0;width:16px;height:16px;"/></A>&nbsp;&nbsp\
<a class="agile_link_noUnderlineNever" href="https://twitter.com/PlusForTrello" rel="publisher" target="_blank"> \
<img src="https://abs.twimg.com/favicons/favicon.ico" alt="Follow on Twitter" style="margin-bottom:-3px;margin-right:1px;border:0;width:16px;height:16px;"/></A></span>');
	    helpWin.para("&nbsp;");
	    if (g_bFirstTimeUse) {
	        var elemFirstTime = helpWin.raw("<div class='agile-help-firstTime'><b>To show this help again click <img src='" + chrome.extension.getURL("images/iconspenthelp.png") + "' style='width:22px;height:22px;' /> next to the tour <img style='padding-left:4px;padding-bottom:5px' src='" + chrome.extension.getURL("images/helparrow.png") + "' /></b></div>");
	        hiliteOnce(elemFirstTime, 10000);
	        g_bFirstTimeUse = false;
	        helpWin.bStartTourBubbleOnClose = true;
	    }
	    if (helpWin.totalDbMessages > 0) {
	        helpWin.para('Alert: Error log has entries. <A target="_blank" href="' + chrome.extension.getURL("plusmessages.html") + '">View</A>.').css("color", COLOR_ERROR);
	    }
	    if (bNotSetUp && helpWin.totalDbRowsHistory > 0) {
	        helpWin.para('<b>Enable "sync" to see team S/E, full Chrome Plus menu and use from mobile.</b>').css("color", COLOR_ERROR);
	        if (!g_bDisableSync) {
	            var checkDontShowAgainSyncWarn = helpWin.para('<input style="vertical-align:middle;" type="checkbox" class="agile_checkHelp" value="checkedDontSW">Dont show this warning on startup.</input>').children('input:checkbox:first');
	            if (helpWin.bDontShowAgainSyncWarn)
	                checkDontShowAgainSyncWarn[0].checked = true;

	            checkDontShowAgainSyncWarn.click(function () {
	                var bValue = checkDontShowAgainSyncWarn.is(':checked');
	                var pair = {};
	                pair["bDontShowAgainSyncWarn"] = bValue;
	                chrome.storage.local.set(pair, function () { });
	            });
	        }
	    } else {
	        if (!bSEByComments && helpWin.totalDbRowsHistoryNotSync > 0) {
	            var strPre = "" + helpWin.totalDbRowsHistoryNotSync + ' S/E rows pending spreadsheet sync verification. ';
	            if (helpWin.totalDbRowsHistoryNotSync > 9) { //simple sync test. could happen also if user entered a lot of S/E rows within 5 minutes.
	                helpWin.para('If still not synced in 10 minutes, make sure spreadsheet sharing is setup correctly with Write access to you.').css("color", COLOR_ERROR);
	            } else {
	                helpWin.para(strPre + 'Plus will do so in the next 10 minutes.');
	            }
	            helpWin.para('&nbsp');
	        }
	    }

	    var strUsingPlusDays = "";
	    var cDaysUsingPlus = 0;
	    if (g_msStartPlusUsage != null) {
	        var dms = (Date.now() - g_msStartPlusUsage);
	        cDaysUsingPlus = Math.floor(dms / 1000 / 60 / 60 / 24);
	        if (cDaysUsingPlus > 2)
	            strUsingPlusDays = '' + cDaysUsingPlus + ' days with Plus. ';
	    }
	    var divDonations = $('<div></div>');
	    var bInsertDonationAsSection = false;
	    if (cDaysUsingPlus > 1) {
	        this.m_container.append(divDonations);
	        divDonations.hide();
	    }
	    else
	        bInsertDonationAsSection = true;
	    if (cDaysUsingPlus > 7) {
	        helpWin.para('I need <b>your help</b> to keep improving Plus! There are many useful features pending:', divDonations);
	        helpWin.para("&bull; Mobile view and drill-down of card S/E inside the iOS/Android app", divDonations);
	        helpWin.para("&bull; Track unanswered comments sent or received", divDonations);
	        helpWin.para("&bull; Card's time spent per list", divDonations);
	        helpWin.para('&bull; Board flow-charts for task count or time per list over time and much more!', divDonations);
	        helpWin.para('&nbsp;', divDonations);
	    }
	    else {
	        helpWin.para('I need <b>your</b> help to keep improving Plus!', divDonations);
	    }
	    helpWin.para('Donate securely with Paypal. <b>You don\'t need a Paypal account</b> just a credit card.', divDonations);
	    helpWin.para('<form action="https://www.paypal.com/cgi-bin/webscr" method="post" target="_blank">\
<input type="hidden" name="cmd" value="_s-xclick">\
<input type="hidden" name="encrypted" value="-----BEGIN PKCS7-----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-----END PKCS7-----">\
<input type="image" style="margin-bottom:0px" src="https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif" border="0" name="submit" title="Your donation counts a lot! Thank you!">\
</form>', divDonations);

	    if (!bInsertDonationAsSection) {
	        var checkDonated = helpWin.para('<input style="vertical-align:middle;" type="checkbox" class="agile_checkHelp" value="checkedDonated" \
					>I already donated, thanks! ' + strUsingPlusDays + '<A href="http://plusfortrello.blogspot.com/2015/04/donations.html" target="_blank">Donations: $2,046</A>. Over 1 year of constant improvement.</input>').css("marginBottom", 0).children('input:checkbox:first');
	        if (g_bUserDonated) {
	            checkDonated[0].checked = true;
	            divDonations.hide();
	        } else {
	            divDonations.show();
	        }
	        checkDonated.click(function () {
	            var bValue = checkDonated.is(':checked');
	            var pair = {};
	            pair["bUserSaysDonated"] = bValue;
	            if (bValue)
	                divDonations.slideUp();
	            else
	                divDonations.slideDown();
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError == undefined)
	                    g_bUserDonated = bValue;
	                checkDonated[0].checked = g_bUserDonated;
	            });
	        });
	    helpWin.para('&nbsp');
        }

	    if (g_bFirstTimeUse) {
	        helpWin.para('If you skip help, make sure to configure <b>Sync</b> and <b>Preferences</b> before using Plus.');
	        helpWin.para('&nbsp');
	    }

	    helpWin.para("<h2>Contents</h2><ul id='tocAgileHelp'></ul>");
	    helpWin.para('&nbsp');
	    var bSpentBackendCase = isBackendMode();

	    helpWin.para('<b><h2 id="agile_help_basichelp">Basics</h2></b>');
	    helpWin.para('<A target="_blank" href="https://www.youtube.com/watch?v=xj7zEaZ_NVc">One-minute intro video</A>');
	    helpWin.para('<img src="' + chrome.extension.getURL("images/s3.png") + '"/>');
	    helpWin.para("The <A target='_blank' href='http://en.wikipedia.org/wiki/ISO_week_date'>ISO week</A> as in 2014-W49 is 2014's week 49. Weeks start on Sunday unless you change it in <b>Preferences</b>.");
	    helpWin.para('Click the week to change the view on trello.com charts and the "daily spent" report. <A href="https://plus.google.com/photos/109669748550259696558/albums/6004371895359551937/6004371896981799010"  target="_blank">Click chart titles to zoom-in</A>.');
	    helpWin.para('&nbsp');

	    helpWin.para('<b>Plus Board toolbar</b>');
	    helpWin.para('<img src="' + chrome.extension.getURL("images/s2.png") + '"/>');
	    helpWin.para('Boxes display totals of all visible cards. Mouse-over them to see % complete.');
        helpWin.para('&nbsp');

        helpWin.para('<b>Plus card S/E bar</b>');
        helpWin.para('<img src="' + chrome.extension.getURL("images/cardplusbar.png") + '"/>');
        helpWin.para('<b>E</b>stimate the units needed to finish a card.');
        helpWin.para('<b>S</b>pend units from your estimate.');
        helpWin.para('Units (days, hours or minutes) can be configured in Preferences. Do so before entering any S/E.');
        helpWin.para('<b>card S/E is the sum of all its S/E history rows</b>. This is the most important concept in Plus.');
        helpWin.para('<img src="' + chrome.extension.getURL("images/cardplusreport.png") + '"/>');
        helpWin.para('Open a card to enter new <b>S</b>pent or <b>E</b>stimate history rows.');
        helpWin.para('The table above the card S/E bar shows totals per user.');
        helpWin.para('Ideally you first enter an estimate as in 0/2 and later spend it with 2/0.');
        helpWin.para('If you didn\'t estimate it previously, enter 2/2 which estimates and spends it.');
        helpWin.para('You dont have to spend all the estimate right away. Maybe you enter 0/5, then 3/0 then 2/0. The sum is 5/5.');
        helpWin.para('Plus considers your card finished when your <b>S sum</b> equals <b>E sum</b> thus R is zero.');
        helpWin.para('Your first card S/E row entered becomes your card\'s 1ˢᵗ estimate (E 1ˢᵗ) to compare it with the current estimate <b>E sum</b>.');
        helpWin.para('If you type <b>S</b> that would cause <b>S sum</b> to be greated than <b>E sum</b>, Plus automatically pre-fills more <b>E</b> to make <b>R</b> zero.');
        helpWin.para('To turn that off or to never use estimates, "allow negative <b>R</b>emaining" in Preferences.');

	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_reportingSE">Entering Spent / Estimate</h2></b>');
	    helpWin.para('Example starting from the bottom (oldest) card comment:');
	    helpWin.para('<img src="' + chrome.extension.getURL("images/s1.png") + '"/>');
	    helpWin.para('&nbsp');
	    helpWin.para('&bull; <b>Do not delete or edit a card S/E comment.</b> Instead use "<u>modify</u>" to the right of the Card report.');
	    helpWin.para('&bull; Also use "modify" if you prefer to think about total S/E instead of adding/substracting with the card S/E bar.');
	    helpWin.para('&nbsp;&nbsp;&nbsp;"modify" will do that math for you and enter the needed S/E as a new row.');
	    helpWin.para('&nbsp;&nbsp;&nbsp;For example: if you entered a Spent of 3 and modify it to zero, "modify" will enter a new row of "-3/0".');
	    helpWin.para("&bull; Enter S/E back in time by clicking on 'now' and pick how many days ago it happened. -3d means 3 days ago.");
	    helpWin.para('&bull; Keyboard use: Use TAB to move between fields. ENTER from the "note" field.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_trellosync">Sync</h2></b>');
	    helpWin.para('Select your team\'s sync method:');
	    comboSync = helpWin.para('<select id="agile_idComboSync" style="width:auto">').children('select');
	    comboSync.append($(new Option("Sync off", SYNCMETHOD.disabled)).addClass("agile_box_input_hilite"));
	    comboSync.append($(new Option("Trello card comments (recommended)", SYNCMETHOD.trelloComments)).addClass("agile_normalBackground"));
	    comboSync.append($(new Option("Google sync spreadsheet (legacy)", SYNCMETHOD.googleSheetLegacy)).addClass("agile_normalBackground"));
	    var syncSectionsMap = {};
	    for (var sMethod in SYNCMETHOD) {
	        var div = $('<div class="helpSectionAnim"></div>').hide();
	        helpWin.m_container.append(div);
	        syncSectionsMap[SYNCMETHOD[sMethod]] = div;
	    }

	    var bDisplayedLegacyNote = false;
	    if (helpWin.hasLegacyRows) {
	        helpWin.para('<A target="_blank" href="http://plusfortrello.blogspot.com/2014/11/plus-for-trello-upgrade-from-legacy.html">Legacy "Google sync" users read here</A>.');
	        bDisplayedLegacyNote = true;
	    }
	    var paraFirstSync = helpWin.para("<b>Your first sync will start after you close help</b>.\nKeep using Trello normally but do not close it until sync finishes.");
	    helpWin.para('<A target="_blank" href="http://plusfortrello.blogspot.com/2014/08/plus-for-trello-beta-sync-features.html">Read here for more details</A>.');

	    var divCur = syncSectionsMap[SYNCMETHOD.disabled];
	    helpWin.para("To get all Plus features enable sync from the list above. Once enabled you will get:", divCur);
	    helpWin.para("&bull; team S/E", divCur);
	    helpWin.para("&bull; full chrome Plus menu", divCur);
	    helpWin.para("&bull; lists in Plus reports", divCur);
	    helpWin.para("&bull; changes to cards, lists and boards is handled automatically.", divCur);
	    helpWin.para("&bull; use from other devices, mobile trello or mobile Plus.", divCur);
	    helpWin.para('<br>If you leave sync off (not recommended) you can still use Plus and get those features once enabled.', divCur);

	    divCur = syncSectionsMap[SYNCMETHOD.trelloComments];
	    var txtSEByCardComments = 'Enter S/E using the card plus bar or directly as card comments.';
	    txtSEByCardComments = txtSEByCardComments + "<br>Enter S/E from mobile or other browsers as a card comment. Users can view all S/E of their joined boards.";
	    if (g_strServiceUrl) {
	        txtSEByCardComments = txtSEByCardComments + '<br>Plus will no longer use the Google sync spreadsheet or rename card titles. You can also remove existing S/E inside card titles from Utilities.';
	    }
	    txtSEByCardComments = txtSEByCardComments + '<br>Plus syncs all boards you have joined.';
	    txtSEByCardComments = txtSEByCardComments + '<br>Enter and read card S/E using card comments that start with these keywords:<br><input style="display:inline;text-transform: lowercase;" type="text" spellcheck="false" maxlength="150" />&nbsp;<input type="button" value="Save keywords" /> Separate multiple keywords with comma.';
	    txtSEByCardComments = txtSEByCardComments + "<br>Your team should use the same keyword unless you want to further categorize or separate multiple subteams.";
	    txtSEByCardComments = txtSEByCardComments + "<br>See <A href='http://plusfortrello.blogspot.com/2014/12/plus-for-trello-se-card-comment-format.html' target='_blank'>card comment format help</A> for advanced features and keyword configuration ideas.";
	    txtSEByCardComments = txtSEByCardComments + "<br><br>If your team entered S/E in Plus before december 2014, also add 'plus s/e' as your last keyword. <A target='_blank' href='http://plusfortrello.blogspot.com/2014/11/plus-for-trello-upgrade-from-legacy.html'>More</A>";
	    var paraEnterSEByCardComments = helpWin.para(txtSEByCardComments, divCur);
	    var inputKeywords = paraEnterSEByCardComments.children('input:text:first');
	    var buttonSaveKeywords = paraEnterSEByCardComments.children('input:button:first');
	    helpWin.para('If you switch sync methods or changed keywords you may need to "Reset Sync" from Utilities.', divCur);
	    helpWin.para("", divCur);

	    divCur = syncSectionsMap[SYNCMETHOD.googleSheetLegacy];
	    if (!bDisplayedLegacyNote)
	        helpWin.para('Legacy "Google sync" users <A target="_blank" href="http://plusfortrello.blogspot.com/2014/11/plus-for-trello-upgrade-from-legacy.html">read here</A>.', divCur);
	    helpWin.para('This legacy mode was used before the new Trello card comments sync existed. Choose it if your team still hasn\'t upgraded or tell your team that its <A target="_blank" href="http://plusfortrello.blogspot.com/2014/11/plus-for-trello-upgrade-from-legacy.html">easy to upgrade</A> to the new "Trello card comments" sync mode.', divCur);
	    helpWin.para('Disadvantages of Google sync: requires chrome sign-in, no support for multiple keywords, no board-based permissions, no mobile use.', divCur);
	    helpWin.para('Advantages: teams see all S/E data regardless of board membership by sharing the same sync url or can have each their own. See card S/E team totals inside card titles (card titles are renamed to include total S/E).', divCur);
	    helpWin.para('This mode also enables syncronization with Trello to sync card/list/board changes in boards you have joined.', divCur);
	    helpWin.para('In this mode S/E is not read from card comments only from the spreadsheet even thou it does add a card S/E comment.', divCur);
	    helpWin.para('Thus in this mode you must enter all S/E using the "card S/E bar", never directly as comments or from mobile.', divCur);

	    spanButtonGS=setupPlusConfigLink(divCur);
	    helpWin.para("", divCur);
	    if (g_strServiceUrl == "")
	        helpWin.para('Not yet configured.', divCur);
	    else {
	        helpWin.para('Current sync spreadsheet url:', divCur);
	        setSmallFont(helpWin.para(g_strServiceUrl, divCur), 0.85);
	    }
	    helpWin.para('If you switch sync methods or changed keywords you may need to "Reset Sync" from Utilities.', divCur);
	    helpWin.para("", divCur);

	    var valCombo = null;
	    var bAddFirstSyncNote = !g_bEnableTrelloSync;

	    function onComboSyncChange() {
	        var valComboOld = valCombo;
	        valCombo = comboSync.val();
	        var bHilite = false;

	        for (var sMethod in syncSectionsMap) {
	            if (sMethod == valCombo) {
	                syncSectionsMap[sMethod].show();
	            }
	            else
	                syncSectionsMap[sMethod].hide();
	        }

	        if (valCombo != valComboOld) {
	            var bDisableSyncNew = g_bDisableSync;
	            var bEnableTrelloSyncNew = g_bEnableTrelloSync;
	            var bSyncByCommentsNew = g_optEnterSEByComment.bEnabled;

	            if (valCombo == SYNCMETHOD.disabled) {
	                bDisableSyncNew = true;
	                paraFirstSync.hide();
	                bHilite = true;
	            }
	            else {
	                if (bAddFirstSyncNote)
	                    paraFirstSync.show();
	                else
	                    paraFirstSync.hide();
	                if (valCombo == SYNCMETHOD.trelloComments) {
	                    bEnableTrelloSyncNew = true;
	                    bSyncByCommentsNew = true;
	                    bDisableSyncNew = false;
	                }
	                else if (valCombo == SYNCMETHOD.googleSheetLegacy) {
	                    if (g_strServiceUrl) { //if url not set yet, these two will be set during in plusconfig
	                        bEnableTrelloSyncNew = true;
	                        bSyncByCommentsNew = false;
	                        bDisableSyncNew = false;
	                    }
	                    else {
                            //disable both so sync remains fully disabled until user adds the spreadsheet
	                        bEnableTrelloSyncNew = false;
	                        bSyncByCommentsNew = false;
	                        bDisableSyncNew = true;
	                    }
	                }
	            }

	            if (bDisableSyncNew != g_bDisableSync || bEnableTrelloSyncNew != g_bEnableTrelloSync || bSyncByCommentsNew != g_optEnterSEByComment.bEnabled) {
	                setEnableTrelloSyncValue(bEnableTrelloSyncNew, bSyncByCommentsNew, bDisableSyncNew);
	            }

	            if (bHilite)
	                comboSync.addClass("agile_box_input_hilite");
	            else
	                comboSync.removeClass("agile_box_input_hilite");
	        }
	    }

	    comboSync.change(onComboSyncChange);
	    var valComboNew = valCombo;
	    if (g_bDisableSync || (g_strServiceUrl == "" && !g_optEnterSEByComment.IsEnabled()))
	        valComboNew = SYNCMETHOD.disabled;
	    else if (g_optEnterSEByComment.IsEnabled()) {
	        valComboNew = SYNCMETHOD.trelloComments;
	    }
	    else
	        valComboNew = SYNCMETHOD.googleSheetLegacy;
	    comboSync.val(valComboNew);
	    onComboSyncChange();

	    function putKeywordsStringInUi(rg) {
	        var strKeywords = "";
	        rg.forEach(function (keyword) {
	            if (strKeywords.length == 0)
	                strKeywords = keyword;
	            else
	                strKeywords = strKeywords + ", " + keyword;
	        });
	        inputKeywords.val(strKeywords);
	    }

	    putKeywordsStringInUi(g_optEnterSEByComment.rgKeywords);

	    function doSaveKeywords(bShowSavedMessage) {
	        var rg = inputKeywords.val().split(",");
	        var rgNew = [];
	        rg.forEach(function (keyword) {
	            var k = keyword.trim().toLowerCase();
	            if (k)
	                rgNew.push(k); //skip blanks etc
	        });
	        if (rgNew.length == 0)
	            rgNew.push(SEKEYWORD_DEFAULT);
	        putKeywordsStringInUi(rgNew);
	        chrome.storage.sync.set({ 'rgKWFCC': JSON.stringify(rgNew) }, function () {
	            if (chrome.runtime.lastError !== undefined) {
	                alert(chrome.runtime.lastError.message);
	                return;
	            }
	            var bChanged = (JSON.stringify(g_optEnterSEByComment.rgKeywords).toLowerCase() != JSON.stringify(rgNew).toLowerCase());
	            g_optEnterSEByComment.rgKeywords = rgNew;
	            if (bShowSavedMessage)
	                alert(bChanged ? "Saved. If your new keywords were used in the past, Reset Sync from preferences." : "Saved.");
	        });
	    }

	    buttonSaveKeywords.click(function () {
	        doSaveKeywords(true);
	    });


	    function setEnableTrelloSyncValue(bValue, bValueSyncByComments, bDisabled) {
	        worker();

	        function worker() {
	            var pair = {};
	            pair["bEnableTrelloSync"] = bValue;
	            pair["bDisabledSync"] = bDisabled;
	            if (bValue)
	                pair["bEnabledTrelloSyncBETA"] = true; //only way to turn it off is by doing a reset which will erase this sync property. review zig: later use a local property to detect if device was converted out of beta

	            pair["bEnterSEByCardComments"] = bValueSyncByComments;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError) {
	                    alert(chrome.runtime.lastError.message);
	                    return;
	                }
	                g_optEnterSEByComment.bEnabled = bValueSyncByComments;
	                if (g_bEnableTrelloSync != bValue && !bDisabled) {
	                    helpWin.bStartSyncOnClose = bValue;
	                }
	                g_bEnableTrelloSync = bValue;
	                g_bDisableSync = bDisabled;
	                if (g_bEnableTrelloSync && !g_bDisableSync) {
	                    if (bValueSyncByComments) {
	                        if (!g_optEnterSEByComment.hasLegacyKeyword() && helpWin.hasLegacyRows) {
	                            inputKeywords.val(inputKeywords.val() + ", " + SEKEYWORD_LEGACY);
	                            doSaveKeywords(false);
	                            hiliteOnce(inputKeywords);
	                            alert("the legacy keyword 'plus s/e' was added because you have legacy history rows (before dec. 2014).\nThis allows you to later Reset Sync without missing legacy card comments.");
	                        }
	                        inputKeywords.focus();
	                    }
	                }
	            });
	        }
	    }

	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_rules">Best practices</h2></b>');
	    helpWin.para('&bull; Follow the rule of reaching S equal E on finished cards so you can compare 1ˢᵗ with final estimates.');
	    helpWin.para('&bull; When a user finishes a card but has <b>R</b>emaining, she should make E equal to S by using "modify" in the card report.');
	    helpWin.para('&bull; Similarly if S goes over E, increase E so R doesnt go negative. The card S/E bar automatically pre-fills E to');
	    helpWin.para('&nbsp;&nbsp;&nbsp;help you prevent negative R.');
	    helpWin.para('&bull; <b>Do not edit or delete a card S/E comment</b>. Those will not be reflected in Plus until you "Reset sync".');
	    helpWin.para('&nbsp;&nbsp;&nbsp;Instead see "modify" above.');
	    helpWin.para('&bull; You can use the <b>units:subunits</b> format to enter S/E. (hours:minutes when using "hour" units)');
	    helpWin.para('&nbsp;&nbsp;&nbsp;1:25 using hour units = 1 hour and 25 minutes = 1.42 hours. Note one uses a <i>colon:</i> and the other uses a <i>period.</i>');
	    helpWin.para('&bull; Add <b>[exclude]</b> to list names to exclude them from board sums on the trello board header.<br>\
&nbsp;&nbsp;&nbsp;To exclude those also in reports set the list filter to "![exclude]".');
	    helpWin.para('&bull; Renaming a Trello user does not rename her in Plus, she will appear as a new user until you "Reset sync".');
	    helpWin.para('&nbsp;&nbsp;&nbsp;Deleted Trello users may lose their username in reports and show a user number instead.');
	    
		helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_mobilePlus">Mobile Plus for Trello</b>');
	    helpWin.para('View card S/E. Pin cards to your phone. Offline enabled.');
	    helpWin.para('The app works very well but some basic features are still missing. Soon it will have them.');
	    helpWin.para('Soon it will have card timers and the S/E bar. Until then, once you are on a card in the app and wish to add S/E, it lets you go directly to the card in the trello app to enter S/E as a comment.');
	    helpWin.para('The app is compatible only with "Trello card comments" sync. Upgrade if you are still using legacy google sync.');
	    helpWin.para('Android: <A href="https://play.google.com/store/apps/details?id=com.zigmandel.plusfortrello" target="_blank">install from the store</A>. Soon for Apple iOS.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_plusmenu">Plus menu</h2></b>');
	    helpWin.para('<img src="' + chrome.extension.getURL("images/plusmenu.png") + '"/>');
	    helpWin.para('<A href="https://www.youtube.com/watch?v=gbAZXtaRi5o" target="_blank">Don\'t see the Plus menu icon?</A>');
	    helpWin.para('The icon changes to <img src="' + chrome.extension.getURL("images/icon19New.png") + '"/> (green dot top-left) when there are <b>new S/E</b> rows from your team.');
	    helpWin.para('Click the menu to open a board, card, report or dashboard even when offline.');
	    helpWin.para('Find boards, top 10 cards (last 12 months) and Plus notes (last 4 months).');
        helpWin.para('Type words in any order. Cards are searched if you type three or more characters.');
	    helpWin.para('Use pattern matching with <b>*</b> for "any characters" and <b>?</b> for "single character" (<a target="_blank" href="http://en.wikipedia.org/wiki/Glob_(programming)#Syntax">GLOB syntax</a>).');
	    helpWin.para('Examples:');
	    helpWin.para('&bull; "informaci<b>?</b>n" matches "informaci<b>o</b>n" or "informaci<b>&oacute;</b>n".');
	    helpWin.para('&bull; "hel?? world" or "hel*ld" matches "hello world"');
	    helpWin.para('&bull; "term1 term2 term3" matches card titles with all words in any order.');
	    helpWin.para('&bull; "[cb]at" matches cat or bat.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');



	    helpWin.para('<b><h2 id="agile_help_timers">Card Timers</h2></b>');
	    helpWin.para('<img src="' + chrome.extension.getURL("images/timer.png") + '"/>');
	    helpWin.para("&bull; Start a timer from any card. The active timer is always visible in the Chrome Plus icon and menu.");
		helpWin.para("&bull; Timers measure time in your units from Preferences.");
		helpWin.para("&bull; Use timers started from another device when you are <A target='_blank' href='https://support.google.com/chrome/answer/185277?hl=en'>signed-into chrome</A>.");
	    helpWin.para("&bull; If you forgot to start a timer, type the spent so far in the 'S' box and start the timer.");
	    helpWin.para("&bull; Pause the timer to pre-fill the 'S' box. Add an optional estimate or note and press ENTER.");
	    helpWin.para('&bull; If you already had values typed in the S/E boxes, pausing the timer will add to them.');
	    helpWin.para('&bull; When pausing a timer and you dont enter the s/e row right away, leave the card open to keep the pre-filled \'S\'.');
	    helpWin.para('&bull; Cards with active timers have a hourglass in Board view and show in the Chrome Plus menu.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_reccards">Recurring cards [R]</h2></b>');
	    helpWin.para('Make a card recurring when you don\'t want to measure changed estimates (like weekly meetings.)');
	    helpWin.para('Check "&#10004; Recurring" inside the card or manually add <b>[R]</b> to the card title.');
	    helpWin.para('A recurring card\'s <b>E 1ˢᵗ</b> automatically changes to match <b>E sum</b> thus do not generate changed estimates in reports.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_hashtags">Card Hashtags #</h2></b>');
	    helpWin.para('Add #tags to cards to classify them. Use the hashtag list inside cards or type them directly in card titles.');
	    helpWin.para('Hashtags are similar to Trello labels with the advantage of seeing hashtag text in the board view and shared across all boards.');
	    helpWin.para('Search cards by hashtag in the Chrome Plus menu or reports (Plus does not currently support reports by labels.)');
	    helpWin.para('A card with title "This is a card #low #review" shows as:');
	    helpWin.para('<img src="' + chrome.extension.getURL("images/cardht.png") + '"/>');
	    helpWin.para('The first #tag is always shown bold.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_burndowns">Burndown charts</h2></b>');
	    helpWin.para('<img src="' + chrome.extension.getURL("images/s4.png") + '"/>');
	    helpWin.para('&bull; The initial Estimate climb (blue) happens during an estimation period and later remains stable.');
	    helpWin.para('&bull; In that estimation period the blue dots are equal to the green dots since no Spent is being done yet.');
	    helpWin.para('&bull; Then, the red line (Spent) climbs daily making the green line (Remaining) go down.');
	    helpWin.para('&bull; At the end, green (R) stays at zero and red (S) stops climbing.');
	    helpWin.para('&bull; Click on a dot to see more details and drill-down to the card.');
	    helpWin.para('&bull; Click on a user chart bar to drill-down into a report and cards.');
	    helpWin.para('&bull; Add a chart annotation by entering a card S/E row with a <A href="http://plusfortrello.blogspot.com/2014/12/plus-for-trello-se-card-comment-format.html" target="_blank">note starting with "!"</A>.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_reports">Reports</h2></b>');
	    helpWin.para('&bull; Open "Reports" from the Chrome Plus menu of from a board toolbar.');
	    helpWin.para('&bull; Use "Copy" <IMG border="none" align="top" src="' + chrome.extension.getURL("images/copy.png") + '"></IMG> on the top-right to send to the clipboard. Paste on a spreadsheet or email.');
	    helpWin.para('&bull; Drill-down on any chart bar or pivot cell to get a detailed report.');
	    helpWin.para('&bull; Reports and dashboards work offline from the Chrome Plus menu and can be bookmarked or emailed by URL.');
	    helpWin.para('&bull; The <b>E.type</b> column tells if the row Estimate is new, increases (+E) or decreases (-E) the card estimate per user.');
	    helpWin.para('&bull; A blank E.type means the estimate was not affected.');
	    helpWin.para('&bull; <A target="_blank" href="http://plusfortrello.blogspot.com/2014/04/plus-for-trello-custom-report.html">Detailed report help</A>.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_moreless">More - Less</h2></b>');
	    helpWin.para("&bull; Clicking 'Less' on the top bar hides boards not entered for over 2 weeks and cards with last activity over 4 weeks ago.");
	    helpWin.para('&bull; <A target="_blank" href="http://help.trello.com/article/810-enabling-power-ups">Enable the Card Aging power-up</A> on each board to hide cards.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_scrumNote">Only for "Scrum for Trello" extension users</h2></b>');
	    helpWin.para('<A target="_blank" href="http://plusfortrello.blogspot.com/2014/12/plus-for-trello-notes-for-users-of.html">Read migration instructions</A> and see <b>Preferences</b> to "Accept the Scrum for Trello format".');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_prefs">&#10162; Preferences</h2></b>');
	    helpWin.para('Refresh this and other Trello chrome tabs after changing preferences.');
	    if (true) { //units
	        var pComboUnits = helpWin.raw('<p><span>Work units: </span></p>');
	        var comboUnits = $('<select style="width:auto">');
	        pComboUnits.append(comboUnits).append($('<span> Card timers measure time in your units. When changing units, S/E already entered is assumed in the new units so pick it before entering any S/E.</span>'));
	        comboUnits.append($(new Option("minutes", UNITS.minutes)));
	        comboUnits.append($(new Option("hours", UNITS.hours)));
	        comboUnits.append($(new Option("days", UNITS.days)));
	        comboUnits.val(UNITS.current);

	        comboUnits.change(function () {
	            var pair = {};
	            var comboThis = $(this);
	            var valCombo = comboThis.val();
	            pair["units"] = valCombo;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError !== undefined) {
	                    comboThis.val(UNITS.current); //reset
	                } else {
	                    UNITS.current = valCombo;
	                    updateTimerChromeIcon();
	                }
	            });
	        });
	    }

	    if (bSpentBackendCase) {
	        helpWin.para('&bull; Spent backend users cannot allow negative Remaining or import from Scrum for Trello');
	    } else {
	        var checkIgnoreZeroEst = helpWin.para('<input style="vertical-align:middle;margin-bottom:0px;" type="checkbox" class="agile_checkHelp" value="checkedIgnoreZeroEstimates" \
>Allow negative <b>R</b>emaining (or never use Estimates). Cards with negative Remaining will not appear in \"Remaining balance cards\"\
. You will lose ability to measure remaining effort and "E" will not autocomplete as you type "S".</input>').children('input:checkbox:first');

	        if (g_bAllowNegativeRemaining)
	            checkIgnoreZeroEst[0].checked = true;

	        checkIgnoreZeroEst.click(function () {
	            var bValue = checkIgnoreZeroEst.is(':checked');
	            var pair = {};
	            pair["bIgnoreZeroECards"] = bValue;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError == undefined)
	                    g_bAllowNegativeRemaining = bValue;
	                checkIgnoreZeroEst[0].checked = g_bAllowNegativeRemaining;
	            });
	        });
	    }

	    //option to hide "Remaining balance cards" in Trello home
	    if (true) {
	        var checkHidePending = helpWin.para('<input style="vertical-align:middle;" type="checkbox" class="agile_checkHelp" value="checkedHidePending">\
Hide "Remaining balance cards" section in Trello home.</input>').children('input:checkbox:first');
	        if (g_bHidePendingCards)
	            checkHidePending[0].checked = true;

	        checkHidePending.click(function () {
	            var bValue = checkHidePending.is(':checked');
	            var pair = {};
	            pair["bHidePendingCards"] = bValue;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError == undefined)
	                    g_bHidePendingCards = bValue;
	                checkHidePending[0].checked = g_bHidePendingCards;
	            });
	        });
	    }

	    //option to allow sync outside Trello.
	    if (true) {
	        var checkSyncOutsideTrello = helpWin.para('<input style="vertical-align:middle;" type="checkbox" class="agile_checkHelp" value="checkedSyncOutsideTrello">\
Background sync every 10 minutes while Chrome is open even if Trello is not open.</input>').children('input:checkbox:first');
	        if (g_bSyncOutsideTrello)
	            checkSyncOutsideTrello[0].checked = true;

	        checkSyncOutsideTrello.click(function () {
	            var bValue = checkSyncOutsideTrello.is(':checked');
	            var pair = {};
	            pair["bSyncOutsideTrello"] = bValue;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError == undefined)
	                    g_bSyncOutsideTrello = bValue;
	                checkSyncOutsideTrello[0].checked = g_bSyncOutsideTrello;
	            });
	        });
	    }


	    //option to change week start day
	    if (true) {
	        //<select id="spentRecentWeeks" />')
	        var pComboDow = helpWin.raw('<p><span>Week starts on </span></p>');
	        var comboDowStart = $('<select style="width:auto">');
	        pComboDow.append(comboDowStart);
	        //comboDowStart.append($(new Option("saturday", "6"))); //dom: saturday not ready. many edge cases not handled.
	        comboDowStart.append($(new Option("sunday", "0")));
	        comboDowStart.append($(new Option("monday", "1")));
	        comboDowStart.val(DowMapper.getDowStart());
	        pComboDow.append($('<span>. You can change it anytime. All users should have the same setting.</span>'));
	        var statusDow = $("<b></b>").hide();
	        pComboDow.append(statusDow);
	        pComboDow.append(setSmallFont($('<br>If the next year starts before the middle of the week, it is week #1 of that year.'), 0.9));
	        comboDowStart.change(function () {
	            var pair = {};
	            comboDowStart.attr('disabled', 'disabled');
	            var valComboDow = parseInt(comboDowStart.val(), 10) || 0;
	            var bError = true;
	            var strError = "";
	            pair["dowStart"] = valComboDow;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError !== undefined) {
	                    strError = " Error. Not saved.";

	                    comboDowStart.val(DowMapper.getDowStart()); //reset
	                } else {
	                    strError = " Saved... ";
	                    bError = false;
	                }
	                statusDow.text(strError);
	                statusDow.show();
	                if (bError) {
	                    comboDowStart.removeAttr('disabled');
	                    return;
	                }
	                openPlusDb(
                        //re-open the db right away. This doesnt refresh everything but at least it triggers conversion asap.
                        //note that if conversion fails for any reason, it will be done at the next openPlusDb from the content script
                        function (response) {
                            if (response.status != STATUS_OK)
                                strError += response.status;
                            else {
                                var userCur = getCurrentTrelloUser();
                                var configCur = g_configData;
                                doWeeklyReport(configCur, userCur, true, false);
                                strError += "Database upgraded OK.";
                            }
                            statusDow.text(strError);
                            comboDowStart.removeAttr('disabled');
                        }, { dowStart: valComboDow });
	            });
	        });
	    }

	    //option to not warn on parallel timers
	    if (true) {
	        var checkDontWarnParallelTimers = helpWin.para('<input style="vertical-align:middle;" type="checkbox" class="agile_checkHelp" value="checkedDontWarnParallelTimers">\
Do not warn when starting multiple timers in parallel.</input>').children('input:checkbox:first');
	        if (g_bDontWarnParallelTimers)
	            checkDontWarnParallelTimers[0].checked = true;

	        checkDontWarnParallelTimers.click(function () {
	            var bValue = checkDontWarnParallelTimers.is(':checked');
	            var pair = {};
	            pair["bDontWarnParallelTimers"] = bValue;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError == undefined)
	                    g_bDontWarnParallelTimers = bValue;
	                checkDontWarnParallelTimers[0].checked = g_bDontWarnParallelTimers;
	            });
	        });
	    }

	    if (true) { //always show Spent in the Chrome icon, even when a timer is active.
	        var comboSpentOnAppIcon = helpWin.para('Show your weekly spent on the Chrome icon? <select style="width:auto">').children('select:first');
	        comboSpentOnAppIcon.append($(new Option("Yes except when there is an active timer", OPT_SHOWSPENTINICON_NORMAL)));
	        comboSpentOnAppIcon.append($(new Option("Yes always (even with an active timer)", OPT_SHOWSPENTINICON_ALWAYS)));
	        comboSpentOnAppIcon.append($(new Option("No, never show it.", OPT_SHOWSPENTINICON_NEVER)));
	        comboSpentOnAppIcon.val(g_optAlwaysShowSpentChromeIcon);

	        comboSpentOnAppIcon.change(function () {
	            var val = comboSpentOnAppIcon.val();
	            var pair = {};
	            pair[SYNCPROP_optAlwaysShowSpentChromeIcon] = val;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError == undefined)
	                    g_optAlwaysShowSpentChromeIcon = val;
	                comboSpentOnAppIcon.val(g_optAlwaysShowSpentChromeIcon);
	                sendExtensionMessage({ method: "updatePlusIcon", bOnlyTimer: false, bAnimate: true, bSetSpentBadge: true }, function (response) { });
	            });
	        });
	    }

	    //option to change the background color of cards
	    if (true) {
	        var checkCardColor = helpWin.para('<input style="vertical-align:middle;" type="checkbox" class="agile_checkHelp" value="checkedCardColor">\
Set the card background based on its first label color.</input>').children('input:checkbox:first');
	        if (g_bChangeCardColor)
	            checkCardColor[0].checked = true;

	        checkCardColor.click(function () {
	            var bValue = checkCardColor.is(':checked');
	            var pair = {};
	            pair["bChangeCardColor"] = bValue;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError == undefined)
	                    g_bChangeCardColor = bValue;
	                checkCardColor[0].checked = g_bChangeCardColor;
	            });
	        });
	    }

	    if (true) {
	        var checkAcceptScrumForTrello = helpWin.raw('<span style="vertical-align:middle;margin-bottom:0px;"><input style="vertical-align:middle;margin-bottom:0px;" type="checkbox"  value="checkedAcceptSFT">\
Accept the "Scrum for Trello" format: <i>(Estimate) card title [Spent]</i>. All users should have the same setting.</input></span>').children('input:checkbox:first');
	        if (g_bAcceptSFT)
	            checkAcceptScrumForTrello[0].checked = true;

	        checkAcceptScrumForTrello.click(function () {
	            var bValue = checkAcceptScrumForTrello.is(':checked');
	            var pair = {};
	            pair["bAcceptSFT"] = bValue;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError == undefined)
	                    g_bAcceptSFT = bValue;
	                checkAcceptScrumForTrello[0].checked = g_bAcceptSFT;
	            });
	        });
	    }

	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_utilities">Utilities (reset etc)</h2></b>');
	    var paraReset = helpWin.para('&bull; Re-read all your S/E data: <input type="button" value="Reset sync"/> Close other trello tabs before reset. Useful if you changed keywords, edited or deleted card S/E comments.');
	    var buttonReset = paraReset.children('input:button:first');
	    buttonReset.click(function () {
	        ResetPlus();
	    });

	    if (g_optEnterSEByComment.IsEnabled()) { //review zig enable also for stealth sheet sync mode
	        var paraRenameCards = helpWin.para('&bull; Remove S/E from card titles in Trello: <input type="button" value="Rename cards with S/E history"/>&nbsp;&nbsp;&nbsp;<input type="button" value="Rename all cards"/> These are useful if you switch sync methods.');
	        var buttonRenameCardsWithSE = paraRenameCards.children('input:button:first');
	        var buttonRenameCardsAll = paraRenameCards.children('input:button:last');
	        function handleButtonRename(bOnlyCardsWithHistory) {
	            sendExtensionMessage({ method: "queueRenameAllCards", bOnlyCardsWithHistory: bOnlyCardsWithHistory },
                                    function (response) {
                                        alert("Renaming will happen at the end of the next sync\nafter you close help.\nHover the Chrome Plus icon (top-right) to see sync progress.");
                                        helpWin.bStartSyncOnClose = true;
                                    });
	        }

	        buttonRenameCardsWithSE.click(function () {
	            if (!confirm('Are you sure you want to rename all cards with existing S/E rows?\nThey will be permanently renamed in Trello without undo.'))
	                return;
	            handleButtonRename(true);
	        });

	        buttonRenameCardsAll.click(function () {
	            if (!confirm('Are you sure you want to rename all cards, even those without S/E history rows?\nThey will be permanently renamed in Trello without undo.'))
	                return;
	            handleButtonRename(false);
	        });
	    }
	    else {
	        helpWin.para('Removal of S/E from card titles is only allowed in "Trello card comments" sync mode.'); //review zig stealth
	    }
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_security">Privacy policy and security</h2></b>');
	    helpWin.para('Plus secures all your data inside your browser, does not use servers and does not have access to your data outside your browser. <A target="_blank" href="http://plusfortrello.blogspot.com/2014/02/plus-for-trello-security-notes.html">More</A>.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_licences">Open-source licences</h2></b>');
	    helpWin.para('<A target="_blank" href="http://plusfortrello.blogspot.com/2015/02/plus-for-trello-licences.html">View all licences</A>.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');
	    
	    helpWin.para('<b><h2 id="agile_help_storage">Storage used</h2></b>');
	    helpWin.para('&bull; Chrome sync: ' + helpWin.storageTotalSync + " bytes.");
	    helpWin.para('&bull; Chrome local: ' + helpWin.storageTotalLocal + " bytes.");
	    helpWin.para('&bull; html5 localStorage: ' + helpWin.storageTotalLocalStorage + " bytes.");
	    helpWin.para('&bull; html5 web db: ' + helpWin.totalDbRowsHistory + " history rows.");
	    helpWin.para('Empty storage by doing a "Reset sync" from Utilities.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_troubleshoot">Frequently asked questions and issues</h2></b>');
	    helpWin.para('<A target="_blank" href="http://plusfortrello.blogspot.com/2015/03/plus-for-trello-faq.html" >see existing user questions or add a new one.</a>');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_languages">Other languages</h2></b>');
	    helpWin.para('Plus is compatible with the <A target="_blank" href="https://chrome.google.com/webstore/detail/google-translate/aapbdbdomjkkjkaonfhkkikfgjllcleb" >Google Translate Chrome extension</a> and Chrome right-click translation.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');
	    helpWin.para('<b><h2 id="agile_help_log">Error log</h2></b>');
	    helpWin.para('Errors logged: ' + helpWin.totalDbMessages + ' <A target="_blank" href="' + chrome.extension.getURL("plusmessages.html") + '">View</A>');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');
	    if (bInsertDonationAsSection) {
	        helpWin.para('<b><h2 id="agile_help_donate">Donate</h2></b>');
	        this.m_container.append(divDonations);
	        helpWin.para('&nbsp');
	        helpWin.para('&nbsp');
	    }
	    var body = $('body');
	    container.hide();
	    var toc = container.find("#tocAgileHelp");

	    helpWin.enableIntervalScroll(true);
	    container.find("h2").each(function () {
	        var el = $(this);
	        var title = el.text();
	        var id = el.attr("id");
	        if (id) {
	            var link = "#" + id;
	            var li = $("<li style='line-height: 1.5em;'><span>&nbsp;&nbsp</span></li>");
	            var a = $("<a class='agile_toc_link agile_link_noUnderline'>").attr("href", link).text(title);
	            li.append(a);
	            toc.append(li);
	        }
	    });
	    body.append(container);
	    container.fadeIn('fast', function () { container.focus(); });
	},
	close: function (bRestarting) {
	    var objHelp = this;
	    if (!objHelp.m_bShowing)
	        return;
	    if (bRestarting)
	        return;
	    objHelp.m_bShowing = false;
	    sendExtensionMessage({ method: "endPauseSync" }, function (response) {
	        objHelp.m_container.fadeOut('fast', function () {
	            var container = objHelp.m_container;
	            objHelp.m_container = null;
	            container.remove();
	            objHelp.enableIntervalScroll(false);
	            
	            if (objHelp.bStartTourBubbleOnClose) {
	                objHelp.bStartTourBubbleOnClose = false;
	                g_bNeedStartTourBubble = true;
	            }
	            if (objHelp.bStartSyncOnClose) {
	                setTimeout(function () {
	                    doSyncDB(null, false, false, true);
	                }, 1000);
	            } else {
	                //when bStartSyncOnClose, avoid showing the bubble before the first sync note
	                if (g_bNeedStartTourBubble)
	                    showTourBubble();
	            }
	        });
	    });
	}
};

function setupPlusConfigLink(bParam) {
    var span = $('<span></span>').addClass('header-btn-text agile_help_setup_link').text("Click to setup Google sync");
    span.appendTo(bParam);
    span.click(function () {
        PlusConfig.display(bParam);
    });
    return span;
}
