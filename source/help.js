/// <reference path="intellisense.js" />

var g_bNeedStartTourBubble = false;
var g_bNeedShowPro = false;

var SYNCMETHOD = {
    disabled:0,
    trelloComments: 1,
    googleSheetLegacy: 2,
    googleSheetStealth: 3
};

function helpTooltip(ev, html) {
    var target = $(ev.target);
    target.replaceWith("<p>" + html + "</p>");
}

function putKeywordsStringInUi(rg, inputKeywords) {
    var strKeywords = "";
    rg.forEach(function (keyword) {
        if (strKeywords.length == 0)
            strKeywords = keyword;
        else
            strKeywords = strKeywords + ", " + keyword;
    });
    inputKeywords.val(strKeywords);
}

function convertKWListToArray(inputKeywords) {
    var rg = inputKeywords.val().split(",");
    var rgNew = [];
    rg.forEach(function (keyword) {
        var k = keyword.trim().toLowerCase();
        if (k)
            rgNew.push(k); //skip blanks etc
    });
    return rgNew;
}


var Help = {
    m_bShowing: false, //necessary to catch the possibility of null m_container on a consecutive display call
	m_container: null,
    m_extraElems:[],
	raw: function (h, container) {
	    if (!container)
	        container = this.m_container;
		var elem = $(h);
		container.append(elem);
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
	    var bShowPro = g_bNeedShowPro;
	    g_bNeedShowPro = false;
	    var helpWin = this;
	    var comboSync = null;
	    var spanButtonGS = null;
	    var spanButtonGSStealth = null;
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

	    if (bShowPro) {
	        setTimeout(function () {
	            var step = {
	                selector: $("#agile_plus_checkPro").parent(),
	                text: 'Enable "Pro"<br />from here!<br /><br />Thanks for<br />giving back!',
	                angle: 0,
	                distance: 5,
	                size: 150,
	                hiliteTime: 10000
	            };
	            showBubbleFromStep(step, true, true, 0);
	            setTimeout(function () {
	                removeAllGrumbleBubbles();
	            }, 5000);
	        },1000);
	    }
	    keepSyncPaused(true);

	    var container = $('<div id="agile_help_container" tabindex="0"></div>').height($(window).height());
	    container.keydown(function (evt) {
	        evt.stopPropagation(); //dont let it bubble to document. in some pages like boards, document hooks into keyboard events for card navigation, which breaks scrolling here with down-arrow etc
	        return true; //do default action for this element
	    });
	    helpWin.m_container = container;
	    helpWin.m_extraElems = [];
	    setTimeout(function () {
	        //NOTE: these two fixed elements must go outside of the scrolling element to avoid an issue (most likely a chrome bug) where the element is not painted unless the window is very wide.
	        //in that case, while resizing the window, a transparent area starts to cover these fixed elements. After much debugging, I found that when the help pane has no scrollbar, the issue goes away,
            //this is likely related to stacking context changes in chrome, in this case there are two scrollbars: one in trello and another in the help pane.
	        //This was fixed by moving these two elements out of the pane, make them topmost, and track them with m_extraElems
	        var containerFixed = $(body);
	        var elemClose = helpWin.raw('<img id="agile_help_close" class="agile_close_button agile_topmost" src="' + chrome.extension.getURL("images/close.png") + '"></img>', containerFixed);
	        helpWin.m_extraElems.push(elemClose);
	    elemClose.click(function () {
	        if (g_bDisableSync || (g_strServiceUrl == "" && !g_optEnterSEByComment.IsEnabled())) {
	            var msgAlert = "You have not enabled sync. You will not see your team data.\nClick Cancel to configure sync, or click OK to use without sync.";
	            var bHiliteGSButton = false;
	            if (g_strServiceUrl == "" && (comboSync.val() == SYNCMETHOD.googleSheetLegacy || comboSync.val() == SYNCMETHOD.googleSheetStealth)) {
	                msgAlert = "You have not set a google spreadsheet sync url.\nClick Cancel to configure it, or click OK to use without sync.";
	                bHiliteGSButton = true;
	            }

	            if (!confirm(msgAlert)) {
	                var section = $("#agile_help_trellosync");
	                var top = section.offset().top;
	                container.animate({
	                    scrollTop: top + container[0].scrollTop
	                }, 1000, function () {
	                    if (bHiliteGSButton) {
	                        hiliteOnce(spanButtonGS, 3000);
	                        hiliteOnce(spanButtonGSStealth, 3000);
	                    }
	                });
	                return;
	            }
	        }
	        Help.close(false);
	    });

	    var elemTop = helpWin.raw('<img class="agile_help_top agile_topmost" src="' + chrome.extension.getURL("images/helptop.png") + '"></img>', containerFixed);
	    helpWin.m_extraElems.push(elemTop);
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
	    }, 200);
	    helpWin.raw('<span style="font-size:1.7em;font-weight:bold;">Plus for Trello Help</span>');
	    helpWin.raw('<span style="float:right;padding-right:6em;">version ' + g_manifestVersion + '&nbsp;&nbsp<A target="_blank" href="https://chrome.google.com/webstore/detail/plus-for-trello/gjjpophepkbhejnglcmkdnncmaanojkf/reviews" title="Give Plus 5 stars and help spread the word!">Rate</A>&nbsp;&nbsp \
			<A target="_blank" href="https://chrome.google.com/webstore/support/gjjpophepkbhejnglcmkdnncmaanojkf">Feedback</a>&nbsp;&nbsp\
<a href="http://www.plusfortrello.com/p/change-log.html" target="_blank">Change log</A>&nbsp;&nbsp\
			<a class="agile_link_noUnderlineNever"  href="https://plus.google.com/collection/khxOc" rel="publisher" target="_blank"> \
<img src="https://ssl.gstatic.com/images/icons/gplus-16.png" title="Follow the official news page" style="margin-bottom:-3px;margin-right:1px;border:0;width:16px;height:16px;"/></A>&nbsp;&nbsp\
<a class="agile_link_noUnderlineNever" href="https://twitter.com/PlusForTrello" rel="publisher" target="_blank"> \
<img src="https://abs.twimg.com/favicons/favicon.ico" title="Follow us on Twitter" style="margin-bottom:-3px;margin-right:1px;border:0;width:16px;height:16px;"/></A>&nbsp;&nbsp\
<a class="agile_link_noUnderlineNever" href="https://www.linkedin.com/in/zigmandel" rel="publisher" target="_blank"> \
<img src="https://www.linkedin.com/favicon.ico" title="Connect at LinkedIn" style="margin-bottom:-3px;margin-right:1px;border:0;width:16px;height:16px;"/></A></span>');
	    helpWin.para("&nbsp;");
	    if (g_bFirstTimeUse) {
	        var elemFirstTime = helpWin.raw("<div class='agile-help-firstTime'><b>To show this help again click <img src='" + chrome.extension.getURL("images/iconspenthelp.png") + "' style='width:22px;height:22px;' /> next to the tour <img style='padding-left:4px;padding-bottom:5px' src='" + chrome.extension.getURL("images/helparrow.png") + "' /></b></div>");
	        hiliteOnce(elemFirstTime, 10000);
	        g_bFirstTimeUse = false;
	        helpWin.bStartTourBubbleOnClose = true;
	    }

	    helpWin.para('<b><h3>Language</h3></b>');
	    var pComboLang = helpWin.para('<select style="width:auto"></select>');
	    var comboLang = pComboLang.children('select');
	    comboLang.append($(new Option("English", "en")));
	    comboLang.append($(new Option("Danish - Dansk", "da")));
	    comboLang.append($(new Option("Dutch - Nederlands", "nl")));
	    comboLang.append($(new Option("French - Français", "fr")));
	    comboLang.append($(new Option("Portuguese - Português", "pt")));
	    comboLang.append($(new Option("Russian - Русский", "ru")));
	    comboLang.append($(new Option("Spanish - Español", "es")));
	    comboLang.append($(new Option("Other", "")));
	    
	    var paraLangOtherDetails = helpWin.raw('<p>Currently only the Plus Tour is translated.<br>\
Plus is compatible with <A target="_blank" href="https://chrome.google.com/webstore/detail/google-translate/aapbdbdomjkkjkaonfhkkikfgjllcleb" >Google Translate Chrome extension</a> and\
 <A href="https://support.google.com/chrome/answer/173424" target="_blank">Chrome right-click translation</A>.<br>\
<A href="http://www.plusfortrello.com/p/help-us-translate-plus-to-your-language.html" target="_blank">Help translate or improve the tour</A> for your language!');
	    helpWin.para('&nbsp');

	    function onComboLangChange() {
	        var pair = {};
	        var valNew = comboLang.val();
	        if (valNew != "en") {
	            paraLangOtherDetails.show();
	        }
	        else
	            paraLangOtherDetails.hide();

	        if (valNew == "")
	            return; //dont save the fake "other" selection. just there so user sees the help text below when lang is not english
	        pair[SYNCPROP_language] = valNew;
	        chrome.storage.sync.set(pair, function () {
	            if (chrome.runtime.lastError) {
	                alert(chrome.runtime.lastError.message);
	                comboLang.val(g_language);
	                return;
	            }
	            g_language = comboLang.val();
	        });
	    }

	    comboLang.val(g_language);
	    onComboLangChange();
	    comboLang.change(function () { onComboLangChange();});

	    if (true) {
	        helpWin.para("<h3>Enable or disable Plus</h3>");
	        
	        helpWin.para('In the rare case you have issues with the display of trello pages:');
	        var paraCheckDisable = helpWin.para('<input style="vertical-align:middle;" type="checkbox" class="agile_checkHelp" value="checkedDisablePlus">Disable changing trello.com pages. </input>\
<a href="">Tell me more</a>.');
	        var checkDisablePlus = paraCheckDisable.children('input:checkbox:first');
	        paraCheckDisable.children('a').click(function (ev) {
	            helpTooltip(ev,"If checked, Plus will still sync and reports will continue working.<br>This is an emergency option so you can keep using Trello in the unlikely case of a conflict.");
	        });
	        var bAddedRefresh = false;
	        if (isPlusDisplayDisabled())
	            checkDisablePlus[0].checked = true;
	        //.css("color", COLOR_ERROR);
	        function setEDColor(check) {
	            if (check.is(':checked'))
	                paraCheckDisable.addClass("agile_color_warning");
	            else
	                paraCheckDisable.removeClass("agile_color_warning");
	        }
	        setEDColor(checkDisablePlus);
	        checkDisablePlus.click(function () {
	            var bValue = checkDisablePlus.is(':checked');
	            if (bValue && !confirm("Are you sure you want to disable changing trello.com pages?\n\nPlus will not show S/E, timers, hashtags and other Plus elements inside Trello.")) {
	                checkDisablePlus[0].checked = false;
	                return;
	            }
	            localStorage[g_lsKeyDisablePlus] = (bValue?"true":"false"); //make this explicit even thout js would convert it
	            if (!bAddedRefresh) {
	                bAddedRefresh = true;
	                paraCheckDisable.append($("<span> Refresh all trello tabs to take effect.</span>"));
	            }
	            setEDColor(checkDisablePlus);
	        });
	        helpWin.para('&nbsp');
	    }

	    if (helpWin.totalDbMessages > 0) {
	        helpWin.para('Alert: Error log has entries. <A target="_blank" href="' + chrome.extension.getURL("plusmessages.html") + '">View</A>.').css("color", COLOR_ERROR);
	    }
	    if (bNotSetUp && helpWin.totalDbRowsHistory > 0) {
	        helpWin.para('<b>Enable "sync" to see Reports, full Chrome Plus menu, team S/E and use from mobile.</b>').css("color", COLOR_ERROR);
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
	        helpWin.para('We appreciate <b>your help</b> to keep improving Plus! There are many useful features pending:', divDonations);
	        helpWin.para("&bull; Mobile Apple/Android app improvements.", divDonations);
	        helpWin.para("&bull; Track unresolved card comments sent or received", divDonations);
	        helpWin.para('&bull; Board flowcharts for task count or time per list over time and much more!', divDonations);
	        helpWin.para('&nbsp;', divDonations);
	    }
	    else {
	        helpWin.para('We appreciate <b>your help</b> to keep improving Plus!', divDonations);
	    }
	    helpWin.para('Donate securely with Paypal. <b>You don\'t need a Paypal account</b> just a credit card.', divDonations);
	    helpWin.para('<form action="https://www.paypal.com/cgi-bin/webscr" method="post" target="_blank">\
<input type="hidden" name="cmd" value="_s-xclick">\
<input type="hidden" name="encrypted" value="-----BEGIN PKCS7-----MIIHXwYJKoZIhvcNAQcEoIIHUDCCB0wCAQExggEwMIIBLAIBADCBlDCBjjELMAkGA1UEBhMCVVMxCzAJBgNVBAgTAkNBMRYwFAYDVQQHEw1Nb3VudGFpbiBWaWV3MRQwEgYDVQQKEwtQYXlQYWwgSW5jLjETMBEGA1UECxQKbGl2ZV9jZXJ0czERMA8GA1UEAxQIbGl2ZV9hcGkxHDAaBgkqhkiG9w0BCQEWDXJlQHBheXBhbC5jb20CAQAwDQYJKoZIhvcNAQEBBQAEgYBP8OC6eCrCgPYR2U4imUM2SpHVJo23/8wNXbPQLAcPvRuh+CzhUW1BCzz2kCaJzeiRfuId9R08fsYhstNspzEnRj4HUgDSVvBp/KUUvw0jQl+RwhoFV42ZsYHPNZViR/PcSmaJ55zMl4rm8b0+zCwC34FA0GjmKqO34G2152hOhTELMAkGBSsOAwIaBQAwgdwGCSqGSIb3DQEHATAUBggqhkiG9w0DBwQIK3HpPkuszKaAgbjpVPzwXjU6/+QwWgzDWsNFPiUWptX9JRCGt4Hw2xJh7lP0WJb1BrzNE2WUXDMJYk+0bVRUKYUeeF2JyskTA4ekQ6x9pWp/xUaXe2tfyO1Yx8RtCU2cmbEmecKVlE13ns1Htkf0F/5KdXrCorAzOcedonR9xAeAGNjPFlnh5ettr5N4ayslkEoTBFuPq4G6DlH5UpE1HZqgG58/W7lxwcNgPdmUMoQmT1CATuBHtXnsaF3kR9TrgJQboIIDhzCCA4MwggLsoAMCAQICAQAwDQYJKoZIhvcNAQEFBQAwgY4xCzAJBgNVBAYTAlVTMQswCQYDVQQIEwJDQTEWMBQGA1UEBxMNTW91bnRhaW4gVmlldzEUMBIGA1UEChMLUGF5UGFsIEluYy4xEzARBgNVBAsUCmxpdmVfY2VydHMxETAPBgNVBAMUCGxpdmVfYXBpMRwwGgYJKoZIhvcNAQkBFg1yZUBwYXlwYWwuY29tMB4XDTA0MDIxMzEwMTMxNVoXDTM1MDIxMzEwMTMxNVowgY4xCzAJBgNVBAYTAlVTMQswCQYDVQQIEwJDQTEWMBQGA1UEBxMNTW91bnRhaW4gVmlldzEUMBIGA1UEChMLUGF5UGFsIEluYy4xEzARBgNVBAsUCmxpdmVfY2VydHMxETAPBgNVBAMUCGxpdmVfYXBpMRwwGgYJKoZIhvcNAQkBFg1yZUBwYXlwYWwuY29tMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDBR07d/ETMS1ycjtkpkvjXZe9k+6CieLuLsPumsJ7QC1odNz3sJiCbs2wC0nLE0uLGaEtXynIgRqIddYCHx88pb5HTXv4SZeuv0Rqq4+axW9PLAAATU8w04qqjaSXgbGLP3NmohqM6bV9kZZwZLR/klDaQGo1u9uDb9lr4Yn+rBQIDAQABo4HuMIHrMB0GA1UdDgQWBBSWn3y7xm8XvVk/UtcKG+wQ1mSUazCBuwYDVR0jBIGzMIGwgBSWn3y7xm8XvVk/UtcKG+wQ1mSUa6GBlKSBkTCBjjELMAkGA1UEBhMCVVMxCzAJBgNVBAgTAkNBMRYwFAYDVQQHEw1Nb3VudGFpbiBWaWV3MRQwEgYDVQQKEwtQYXlQYWwgSW5jLjETMBEGA1UECxQKbGl2ZV9jZXJ0czERMA8GA1UEAxQIbGl2ZV9hcGkxHDAaBgkqhkiG9w0BCQEWDXJlQHBheXBhbC5jb22CAQAwDAYDVR0TBAUwAwEB/zANBgkqhkiG9w0BAQUFAAOBgQCBXzpWmoBa5e9fo6ujionW1hUhPkOBakTr3YCDjbYfvJEiv/2P+IobhOGJr85+XHhN0v4gUkEDI8r2/rNk1m0GA8HKddvTjyGw/XqXa+LSTlDYkqI8OwR8GEYj4efEtcRpRYBxV8KxAW93YDWzFGvruKnnLbDAF6VR5w/cCMn5hzGCAZowggGWAgEBMIGUMIGOMQswCQYDVQQGEwJVUzELMAkGA1UECBMCQ0ExFjAUBgNVBAcTDU1vdW50YWluIFZpZXcxFDASBgNVBAoTC1BheVBhbCBJbmMuMRMwEQYDVQQLFApsaXZlX2NlcnRzMREwDwYDVQQDFAhsaXZlX2FwaTEcMBoGCSqGSIb3DQEJARYNcmVAcGF5cGFsLmNvbQIBADAJBgUrDgMCGgUAoF0wGAYJKoZIhvcNAQkDMQsGCSqGSIb3DQEHATAcBgkqhkiG9w0BCQUxDxcNMTMxMTIxMTg1ODUzWjAjBgkqhkiG9w0BCQQxFgQUKOi04oFDCAWxLx+IOXieH8srlhwwDQYJKoZIhvcNAQEBBQAEgYCsdokvKTUK5XnbNQL2C1gtchNWR1ejUekVqHhs1VKA7dR8eYI2fI4o0h0G6S220MdxUmv9PJlgkQiqVGJ3H/mPUQKFMoVZKmsxcH2bcBlI1k9XJJ6/Z7awKIQzzjD9PePDitHHqq83LNxP4NjL7RJcKQ104UkHpnBJ8OD23aR0dw==-----END PKCS7-----">\
<input type="image" style="margin-bottom:0px" src="https://www.paypalobjects.com/en_US/i/btn/btn_donateCC_LG.gif" border="0" name="submit" title="Your donation counts a lot! Thank you!">\
</form>', divDonations);

	    if (!bInsertDonationAsSection) {
	        var checkDonated = helpWin.para('<input style="vertical-align:middle;" type="checkbox" class="agile_checkHelp" value="checkedDonated" \
					>I already donated, thanks! ' + strUsingPlusDays + '<A href="http://www.plusfortrello.com/p/donations.html" target="_blank">Donate or view all donations</A>.</input>').css("marginBottom", 0).children('input:checkbox:first');
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

	    helpWin.para('<h2 id="agile_pro_section">Plus Pro version</h2>');
	    var paraPro = helpWin.para('<input style="vertical-align:middle;margin-bottom:0px;" type="checkbox" class="agile_checkHelp" value="checkedProVersion" id="agile_plus_checkPro" /><label style="display:inline-block;" for="agile_plus_checkPro">Enable "Pro" features</label>');
	    var checkEnablePro = paraPro.children('input:checkbox:first');
	    var textEnablePro = 'View or filter by <b>Card labels</b> in reports and burn-downs, custom report columns and extra export options useful for integrations.';
	    if (!g_bProVersion)
	        textEnablePro += '<br />Check for more details.';
	    helpWin.para(textEnablePro);
	    checkEnablePro[0].checked = g_bProVersion;

	    checkEnablePro.click(function () {
	        var bValue = checkEnablePro.is(':checked');
	        var pair = {};
	        
	        if (!bValue) {
	            if (!confirm('Are you sure you want to turn off "Pro"?')) {
	                checkEnablePro[0].checked = true;
	                return;
	            }
	            saveCheck();
	            sendExtensionMessage({ method: "hitAnalyticsEvent", category: "ProCheckbox", action: "disabled" }, function (response) { });
	        }
	        else {
	            checkEnablePro[0].checked = false; //temporarily while we authorize
	            handleProAproval(function (status) {
	                if (status != STATUS_OK)
	                    bValue = false;
	                saveCheck();
	                if (bValue)
	                    sendExtensionMessage({ method: "hitAnalyticsEvent", category: "ProCheckbox", action: "enabled" }, function (response) { });
	            });
	        }

	        function saveCheck() {
	            pair[LOCALPROP_PRO_VERSION] = bValue;
	            chrome.storage.local.set(pair, function () {
	                if (chrome.runtime.lastError == undefined)
	                    g_bProVersion = bValue;
	                checkEnablePro[0].checked = g_bProVersion;
	            });
	        }
	    });

	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');
	    helpWin.para("<h2 style='display:inline-block;'>Contents</h2><span style='color: #8c8c8c;margin-left:1em;'>click a section</span><ul id='tocAgileHelp'></ul>");
	    helpWin.para('&nbsp');
	    var bSpentBackendCase = isBackendMode();

	    helpWin.para('<b><h2 id="agile_help_basichelp">Basics</h2></b>');
	    helpWin.para('<A target="_blank" href="https://www.youtube.com/watch?v=xj7zEaZ_NVc">One-minute intro video</A>');
	    helpWin.para('<A target="_blank" href="http://www.plusfortrello.com/p/about.html">Quick introduction to Plus for Trello</A>');
	    helpWin.para('Reports, the Chrome Plus menu, hashtags and more/less can be used by all Trello users.');
	    helpWin.para('Other features like spent and estimate, burn-downs, timers and recurring cards are useful to those that measure card S/E (Spent and Estimate).');
	    helpWin.para('Once you close this help Plus will offer to run the product tour.');
	    helpWin.para('Do enable "Sync" (in this help below). Most Plus features need it even if you do not use Spent / Estimates.');
	    helpWin.para('<img src="' + chrome.extension.getURL("images/s3.png") + '"/>');
	    helpWin.para("This <b>Plus header</b> is useful mostly to those using S/E.");
	    helpWin.para("The <A target='_blank' href='http://en.wikipedia.org/wiki/ISO_week_date'>ISO week</A> as in 2014-W49 is 2014's week 49. Weeks start on Sunday unless you change it in <b>Preferences</b>.");
	    helpWin.para('Click the week to change the view on trello.com charts and reports. <A href="https://plus.google.com/photos/+PlusfortrelloNews/albums/6004371895359551937/6004371896981799010"  target="_blank"><br>Click chart titles</A> in trello.com to zoom charts to full window.');
	    helpWin.para('&nbsp');

	    helpWin.para('<b>Plus Board toolbar</b>');
	    helpWin.para('<img src="' + chrome.extension.getURL("images/s2.png") + '"/>');
	    helpWin.para('The full toobar shows when the board has S/E. Otherwise shows the report icon.');
	    helpWin.para('Boxes display <b>S</b>pent / <b>E</b>stimate / <b>R</b>emaining totals of all visible cards. Mouse-over them to see <b>% complete</b>.');
        helpWin.para('&nbsp');

        helpWin.para('<b>Plus card "S/E bar"</b>');
        helpWin.para('<img src="' + chrome.extension.getURL("images/cardplusbar.png") + '"/>');
        helpWin.para('Open any card and click "Add S/E" or the little Plus icon inside the card comment.');
        helpWin.para('<img src="' + chrome.extension.getURL("images/showsebar.png") + '"/>');
        helpWin.para('&nbsp');
        
        helpWin.para('<b>S</b>pend units from your estimate.');
        helpWin.para('<b>E</b>stimate the units needed to finish a card, for "me" (you) or other users.');

        helpWin.para('Units (days, hours or minutes) can be configured in Preferences below. Do so before entering any S/E.');
        helpWin.para('&nbsp');
        helpWin.para('&nbsp');
        helpWin.para('<b><h2 id="agile_help_sesystem">The Plus Spent / Estimate system</h2></b>');
        helpWin.para('<h3>An analogy with time tracking on a spreadsheet</h3>');
        helpWin.para('<b>Card S/E is the sum of all its S/E history rows</b>. This is the most important concept in Plus. Is similar to summing rows on a spreadsheet.');
        helpWin.para('<A href="http://www.plusfortrello.com/p/how-plus-tracks-spent-and-estimate-in.html" target="_blank">See this section on the web</A>');
        helpWin.para('Imagine you are entering Spent time as rows in a spreadsheet, adding rows from top to bottom:');
        helpWin.para('Using the Plus "Card S/E bar" is like adding new rows to the table below and moving the running total down:');
        helpWin.para('<img src="' + chrome.extension.getURL("images/help-spent-table.png") + '"/>');
        helpWin.para('&nbsp');
        helpWin.para('Plus does the same, except the "rows" are entered inside Trello cards as special card comments (or as Google spreadsheet rows, when using stealth sync mode).');
        helpWin.para('In the sample above, the current Spent is 13, the sum of all spend history.');
        helpWin.para('Plus uses the same concept for estimates: Enter a "first estimate" on the first row, then increase or decrease it in later rows if needed:');
        helpWin.para('<img src="' + chrome.extension.getURL("images/help-spent-est-table.png") + '"/>');
        helpWin.para('This gives much more information that just the previous "spent history" table because it shows a first estimate of 11, which was later increased by 2 hours.');
        helpWin.para('Plus reports and charts can show you these estimate changes per user, board, label, hashtag and much more. Knowing the actual estimate gives you burn-downs and projected end dates as Plus knows how much work Remains and how it changed over time.');
        helpWin.para('Plus automatically fills the "Estimate" column as you type "Spent" or stop timers, calculating any Estimate increases needed (which you can overwrite.)');
        helpWin.para('The difference in Trello is that Plus shows the rows from latest to earliest because that is how Trello displays card comments, and Plus also has an extra "User" column for each S/E row as Plus keeps Spent and Estimates per user.');
        helpWin.para('Use the Plus "Card S/E bar" to add more rows, or directly modify the running totals using "Modify"  (which adds a row for you with the needed differences, positive or negative).');
        helpWin.para('&nbsp');

        helpWin.para('<img src="' + chrome.extension.getURL("images/cardplusreport.png") + '"/>');

        helpWin.para('Open a card to enter new <b>S</b>pent or <b>E</b>stimate history rows.');
        helpWin.para('The table above the card S/E bar shows totals per user.');
        helpWin.para('Ideally you first enter an estimate as in 0/2 (S:blank, E:2) and later spend it with 2/0 (S:2, E:blank)');
        helpWin.para('If you didn\'t estimate it previously, enter 2/2 which estimates and spends it on the same "row".');
        helpWin.para('You dont have to spend all the estimate right away. Maybe you enter 0/5, then 3/0 then 2/0. The sum is 5/5.');
        helpWin.para('Plus considers your card finished when your <b>S sum</b> equals <b>E sum</b> thus R is zero.');
        helpWin.para('Your first S/E row per card becomes your card\'s 1ˢᵗ estimate (E 1ˢᵗ) used to compare to the current estimate <b>E sum</b>.');
        helpWin.para('If you type <b>S</b> that would cause <b>S sum</b> to be greated than <b>E sum</b>, Plus automatically pre-fills more <b>E</b> to make <b>R</b> zero.');
        helpWin.para('To turn that off or to never use estimates, "allow negative <b>R</b>emaining" in Preferences.');
        helpWin.para('When you enter S/E for another user (not "me") Plus generates a special note in that S/E row: "[by user]."');
        helpWin.para('All special notes that Plus generates with [brackets] are secure and cannot be faked or removed by other users making Plus actions fully traceable.');

	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_reportingSE">Entering Spent / Estimate</h2></b>');
	    helpWin.para('Easily enter Spent with card timers, or manually enter S/E with the Plus card bar.');
	    helpWin.para('To track time spent in lists automatically, see <A href="http://www.plusfortrello.com/p/automated-time-tracking-with-butler-plus.html" target="_blank">using Plus & Butler</A>.');
	    helpWin.para('&nbsp');
	    helpWin.para('Example of entering S/E starting from the bottom (oldest) card comment:');
	    helpWin.para('Note that Plus makes the "plus" card comments when using the S/E bar (unless using the stealth sync mode).');
	    helpWin.para('<img src="' + chrome.extension.getURL("images/s1.png") + '"/>');
	    helpWin.para('&nbsp');
	    helpWin.para('&bull; <b>Do not delete or edit a card S/E comment.</b> Instead use "<u>modify</u>" in the card front report.');
	    helpWin.para('&bull; Also use "modify" if you prefer to think about total S/E instead of adding/substracting with the card S/E bar.');
	    helpWin.para('&nbsp;&nbsp;&nbsp;"modify" will do the math for you and enter the needed S/E as a new row.');
	    helpWin.para('&nbsp;&nbsp;&nbsp;Example: if you entered a Spent of 3 and modify it to zero, "modify" will enter a new row of "-3/0".');
	    helpWin.para("&bull; Enter S/E back in time by clicking on 'now' and pick how many days ago it happened. -3d means 3 days ago.");
	    helpWin.para('&bull; Keyboard use: Use TAB or SHIFT+TAB to move between fields. Enter with the "Enter" key or button.');
	    helpWin.para('<b>More:</b> <A target="_blank" href="http://www.plusfortrello.com/p/s-e-entry-methods.html">Which S/E entry method should you use?</A>');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_trellosync">&#10148; Sync (by Card comment keywords or Stealth)</h2></b>');
	    helpWin.para('Select your team\'s sync method:');
	    helpWin.para('<b>Enable sync</b> to use Reports and the Plus menu, even if you do not use Spent / Estimate / Points.');
	    comboSync = helpWin.para('<select id="agile_idComboSync" style="width:auto">').children('select');
	    comboSync.append($(new Option("Sync off", SYNCMETHOD.disabled)).addClass("agile_box_input_hilite"));
	    comboSync.append($(new Option("Trello card comments (recommended)", SYNCMETHOD.trelloComments)).addClass("agile_normalBackground"));
	    comboSync.append($(new Option("Stealth Google sync spreadsheet", SYNCMETHOD.googleSheetStealth)).addClass("agile_normalBackground"));
	    comboSync.append($(new Option("Google sync spreadsheet (legacy)", SYNCMETHOD.googleSheetLegacy)).addClass("agile_normalBackground"));
	    var syncSectionsMap = {};
	    for (var sMethod in SYNCMETHOD) {
	        var div = $('<div class="helpSectionAnim"></div>').hide();
	        helpWin.m_container.append(div);
	        syncSectionsMap[SYNCMETHOD[sMethod]] = div;
	    }

	    var bAddFirstSyncNote = !g_bEnableTrelloSync;
	    var bDisplayedLegacyNote = false;
	    if (helpWin.hasLegacyRows) {
	        helpWin.para('<A target="_blank" href="http://www.plusfortrello.com/2014/11/plus-for-trello-upgrade-from-legacy.html">Legacy "Google sync" users read here</A>.');
	        bDisplayedLegacyNote = true;
	    }
	    var paraFirstSync = helpWin.para("<b>Your first sync will start after you close help</b>.\nKeep using Trello normally or close it, it will not affect sync.");
	    helpWin.para('If you switch sync methods or change keywords, "Reset Sync" from <A href="#agile_help_utilities">Utilities</A>.');
	    helpWin.para('<A target="_blank" href="http://www.plusfortrello.com/p/sync-features.html">Read here</A> for more sync details.');

	    var divCur = syncSectionsMap[SYNCMETHOD.disabled];
	    helpWin.para("Do not leave 'off' unless you are having a sync issue (super rare). Once enabled you will get:", divCur);
	    helpWin.para("&bull; Chrome Plus menu (top-right in Chrome)", divCur);
	    helpWin.para("&bull; Plus reports (full columns), charts, burn-downs.", divCur);
	    helpWin.para("&bull; View team Spent/Estimate/Points, not just yours.", divCur);
	    helpWin.para("&bull; Use from other devices, mobile or power-up.", divCur);

	    divCur = syncSectionsMap[SYNCMETHOD.trelloComments];
	    helpWin.para('&bull; This is the recommended sync method, even if you do not use S/E.', divCur);
	    helpWin.para('&bull; Users must be <b>direct board members</b> to view a board S/E.', divCur);
	    helpWin.para('&bull; Enter S/E using the card plus bar, mobile app, power-up or as a manual card comment.', divCur);
	    helpWin.para('&bull; This is the only method compatible with Butler for Trello to <A target="_blank" href="http://www.plusfortrello.com/p/automated-time-tracking-with-butler-plus.html">track time spent in lists</A>.', divCur);
	    if (g_strServiceUrl)
	        helpWin.para('Plus will no longer use the Google sync spreadsheet or rename card titles. You can also remove existing S/E inside card titles from Utilities.', divCur);
	    var txtSEByCardComments = 'Enter and read card S/E using card comments that start with these keywords:<br><input style="display:inline;text-transform: lowercase;" type="text" spellcheck="false" maxlength="150" />&nbsp;<input type="button" value="Save keywords" /> Separate <A target="_blank" href="http://www.plusfortrello.com/p/faq.html#use_keywords">multiple keywords</A> with comma.';
	    txtSEByCardComments = txtSEByCardComments + "<br>Your team should use the same keyword unless you want to further categorize or separate multiple subteams.";
	    txtSEByCardComments = txtSEByCardComments + "<br>Home charts and the weekly report in the header can be filtered by keywords, see Preferences.";
	    txtSEByCardComments = txtSEByCardComments + "<br>See <A href='http://www.plusfortrello.com/p/spent-estimate-card-comment-format.html' target='_blank'>card comment format help</A> for advanced features and keyword configuration ideas.";
	    txtSEByCardComments = txtSEByCardComments + "<br><br>If your team entered S/E in Plus before 2015, also add 'plus s/e' as your last keyword. <A target='_blank' href='http://www.plusfortrello.com/2014/11/plus-for-trello-upgrade-from-legacy.html'>More</A>";

	    var buttonshowNonMemberBoardsDialog = null; 

	    if (!bAddFirstSyncNote)
	        txtSEByCardComments = txtSEByCardComments + '<br><br>Find all boards that you are not a member (Plus syncs on boards with your membership):<br><input type="button" value="Find boards" />';

	    var paraEnterSEByCardComments = helpWin.para(txtSEByCardComments, divCur);
	    var inputKeywords = paraEnterSEByCardComments.children('input:text:first');
	    var buttonSaveKeywords = paraEnterSEByCardComments.children('input:button:first');
	    if (!bAddFirstSyncNote)
	        buttonshowNonMemberBoardsDialog = paraEnterSEByCardComments.children('input:button:last');
	    helpWin.para("&nbsp;", divCur);

	    divCur = syncSectionsMap[SYNCMETHOD.googleSheetStealth];
	    helpWin.para('Use this option when you must completely hide S/E from others that have access to your boards (like clients).', divCur);
	    helpWin.para('Stores S/E only in a private Google spreadsheet. S/E is not recorded anywhere inside Trello.', divCur);
	    helpWin.para('The other sync modes make a card comment each time you enter S/E.', divCur);
	    helpWin.para('Only those that use the same sync spreadsheet will see the team S/E, regardless of Trello board permissions.', divCur);
	    helpWin.para("&nbsp;", divCur);
	    helpWin.para('If you only want to prevent your S/E from appearing other user\'s reports and do not mind S/E appearing in card comments, you should instead use the 1st sync option and use a different "keyword".', divCur);
	    helpWin.para("&nbsp;", divCur);
        helpWin.para('How is this mode different from "Trello card comments" sync:', divCur);
        helpWin.para('&bull; Requires you to be <A target="_blank" href="https://support.google.com/chrome/answer/185277">signed-into Chrome</A>', divCur);
        helpWin.para('&bull; Enter S/E using the "card S/E bar", never as card comments nor from mobile, power-up or other browsers.', divCur);
	    helpWin.para('&bull; No "multiple keywords" feature.', divCur);
	    helpWin.para('&bull; No board-based permissions. Share the private spreadsheet using Google permissions.', divCur);
	    helpWin.para('&bull; No mobile app or power-up support yet.', divCur);
	    helpWin.para("&nbsp;", divCur);
	    helpWin.para('Plus will ask you for permission to access your Google spreadsheets once configured below.', divCur);
	    spanButtonGSStealth = setupPlusConfigLink(divCur, true);
	    helpWin.para("&nbsp;", divCur);

	    function showCurrentSpreadsheetLink() {
	        if (g_strServiceUrl == "")
	            helpWin.para('Not yet configured.', divCur);
	        else {
	            helpWin.para('Current sync spreadsheet url:', divCur);
	            setSmallFont(helpWin.para(g_strServiceUrl, divCur), 0.85);
	        }
	    }

	    showCurrentSpreadsheetLink();
	    helpWin.para("&nbsp;", divCur);

	    divCur = syncSectionsMap[SYNCMETHOD.googleSheetLegacy];
	    if (!bDisplayedLegacyNote)
	        helpWin.para('Legacy "Google sync" users <A target="_blank" href="http://www.plusfortrello.com/2014/11/plus-for-trello-upgrade-from-legacy.html">read here</A>.', divCur);
	    helpWin.para('This legacy mode was used before the new Trello card comments sync existed. Choose it if your team still hasn\'t upgraded or tell your team that its <A target="_blank" href="http://www.plusfortrello.com/2014/11/plus-for-trello-upgrade-from-legacy.html">easy to upgrade</A> to the new "Trello card comments" sync mode.', divCur);
	    helpWin.para('Disadvantages: Requires Chrome sign-in, no multiple keywords, no board-based permissions, no mobile app support.', divCur);
	    helpWin.para('Advantages: Permission is based on using the same spreadsheet url, regardless of board membership. Also, card titles are renamed to include total S/E thus you can see total card S/E from mobile or other browsers.', divCur);
	    helpWin.para('S/E is not synced from card comments, only from the spreadsheet even thou it does add a card S/E comment.', divCur);
	    helpWin.para('Thus in this mode you must enter all S/E using the "card S/E bar" from Chrome, never directly as comments nor from mobile.', divCur);
	    helpWin.para('Because this mode also adds card S/E comments, its easy to later change to the recommended 1st sync option.', divCur);
	    spanButtonGS = setupPlusConfigLink(divCur);
	    helpWin.para("&nbsp;", divCur);
	    showCurrentSpreadsheetLink();
	    helpWin.para("&nbsp;", divCur);

	    var valCombo = null;

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
	            var bStealthSEModeNew = false; //set to false by default

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
	                else if (valCombo == SYNCMETHOD.googleSheetLegacy || valCombo == SYNCMETHOD.googleSheetStealth) {
	                    bStealthSEModeNew = (valCombo == SYNCMETHOD.googleSheetStealth);
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

	            if (bDisableSyncNew != g_bDisableSync || bEnableTrelloSyncNew != g_bEnableTrelloSync || bSyncByCommentsNew != g_optEnterSEByComment.bEnabled || bStealthSEModeNew != g_bStealthSEMode) {
	                setEnableTrelloSyncValue(bEnableTrelloSyncNew, bSyncByCommentsNew, bDisableSyncNew, bStealthSEModeNew);
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
	    else {
	        if (g_bStealthSEMode)
	            valComboNew = SYNCMETHOD.googleSheetStealth;
            else
	            valComboNew = SYNCMETHOD.googleSheetLegacy;
	    }
	    comboSync.val(valComboNew);
	    onComboSyncChange();

	    putKeywordsStringInUi(g_optEnterSEByComment.rgKeywords, inputKeywords);

	    function doSaveKeywords(bShowSavedMessage) {
	        var rgNew = convertKWListToArray(inputKeywords);
	        if (rgNew.length == 0)
	            rgNew.push(SEKEYWORD_DEFAULT);
	        putKeywordsStringInUi(rgNew, inputKeywords);
	        chrome.storage.sync.set({ 'rgKWFCC': JSON.stringify(rgNew) }, function () {
	            if (chrome.runtime.lastError !== undefined) {
	                alert(chrome.runtime.lastError.message);
	                return;
	            }
	            var bChanged = (JSON.stringify(g_optEnterSEByComment.rgKeywords).toLowerCase() != JSON.stringify(rgNew).toLowerCase());
	            g_optEnterSEByComment.rgKeywords = rgNew;
	            getKeywordsViewList(); //trigger refresh
	            refreshCardTableStats();
	            if (bShowSavedMessage)
	                alert(bChanged ? "Saved. If your new keywords were used in the past, 'Reset Sync' from utilities." : "Saved.");
	        });
	    }

	    buttonSaveKeywords.click(function () {
	        doSaveKeywords(true);
	    });

	    if (buttonshowNonMemberBoardsDialog) {
	        buttonshowNonMemberBoardsDialog.click(function () {
	            showNonMemberBoardsDialog();
	        });
	    }

	    function setEnableTrelloSyncValue(bValue, bValueSyncByComments, bDisabled, bStealthSEMode) {
	        worker();

	        function worker() {
	            var pair = {};
	            pair["bEnableTrelloSync"] = bValue;
	            pair["bDisabledSync"] = bDisabled;
	            if (bValue)
	                pair["bEnabledTrelloSyncBETA"] = true; //only way to turn it off is by doing a reset which will erase this sync property. review zig: later use a local property to detect if device was converted out of beta

	            bStealthSEMode = bStealthSEMode ? true : false;
	            //note that temporarily we could have stealth mode without a sync url. to get use IsStealthMode()
	            pair["bEnterSEByCardComments"] = bValueSyncByComments;
	            pair[SYNCPROP_bStealthSEMode] = bStealthSEMode;
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
	                g_bStealthSEMode=bStealthSEMode;
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

	    helpWin.para('<b><h2 id="agile_help_preestimate">Pre-Estimations</h2></b>');
	    helpWin.para('Plus supports two levels of pre-estimation to help your team figure out card first estimates (E 1<sup>st</sup>).');
	    helpWin.para('Add pre-estimates to checklist items or card titles. Neither show in reports, only in the card front and board dimensions.');
	    helpWin.para('<A href="http://www.plusfortrello.com/p/how-plus-tracks-spent-and-estimate-in.html#plus_preestimates" target="_blank">See how to use pre-estimates.</A>');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_rules">Best practices for S/E</h2></b>');
	    helpWin.para('<b>★</b> <b>Do not edit or delete a card S/E comment</b>. Instead use "modify" to make S/E changes.');
	    helpWin.para('<b>★</b> If you do modify or delete S/E card comments see help inside the "modify" dialog about the card "^resetsync" command.');
	    helpWin.para('<b>★</b> A card is done when S reaches E (R is zero, R=E-S).');
	    helpWin.para('<b>★</b> To measure changed E the team (or the manager) should increase E as needed so <b>R</b> reflects actual <b>R</b>emaining work.');
	    helpWin.para('<b>★</b> When a user finishes a card but has <b>R</b>emaining, use "modify" and blank or zero <b>R</b> (which reduces E).');
	    helpWin.para('<b>★</b> Similarly if S goes over E, increase E so R is not negative.');
	    helpWin.para('<b>★</b> The card S/E bar and "modify" automatically pre-fill increased E to help you prevent negative R.');
	    helpWin.para('<b>★</b> Prevent accidental E increases with the preference to "Prevent me from increasing existing E".');
	    helpWin.para('<b>★</b> You may use the units:subunits <b>colon format</b> to enter S/E. (as in hours:minutes when using "hour" units)');
	    helpWin.para('&nbsp;&nbsp;&nbsp;1:25 in hour units = 1 hour 25 minutes = 1.42 hours. Note one uses a <i>colon:</i> and the other uses a <i>period.</i>');
	    helpWin.para('&nbsp;&nbsp;&nbsp;Plus always converts to "decimal format".');
	    helpWin.para('<b>★</b> Add <b>[exclude]</b> to list names to exclude them from board sums on the Trello board page.<br>\
&nbsp;&nbsp;&nbsp;To exclude those also in reports set the list filter to "![exclude]".');
	    helpWin.para('<b>★</b> Renaming a Trello user is not renamed in Plus. It will appear as a new user until you "Reset sync". <a href="">Tell me more</a>.').children('a').click(function (ev) {
	        helpTooltip(ev, "Deleted Trello users may lose their username in reports and show a user number instead if you reset sync or reinstall Plus.");
	    });
		helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_mobilePlus">Mobile and Web Plus for Trello</b>');
	    helpWin.para('Works on any phone or browser (Firefox, iPhone etc and soon an official Trello power-up).');
	    helpWin.para('View and enter card S/E. Pin cards to your phone notification bar. Works offline too!');
	    helpWin.para('Is compatible only with "Trello card comments" sync.');
	    helpWin.para('<A href="http://www.plusfortrello.com/p/mobile-plus-for-trello.html" target="_blank">More information</A>.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_plusmenu">Plus menu</h2></b>');
	    helpWin.para('<img src="' + chrome.extension.getURL("images/plusmenu.png") + '"/>');
	    helpWin.para('<A href="https://www.youtube.com/watch?v=gbAZXtaRi5o" target="_blank">Don\'t see the Plus menu icon?</A>');
	    helpWin.para('The icon changes to <img src="' + chrome.extension.getURL("images/icon19new.png") + '"/> (green dot top-left) when there are <b>new S/E</b> rows from your team.');
	    helpWin.para('Click the menu to open a board, card, report or burndown even when offline.');
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
	    helpWin.para("&bull; Start a timer from any card. The last active timer is always visible in the Chrome Plus icon and menu.");
	    helpWin.para("&bull; Timers measure time in your units from Preferences.");
	    helpWin.para("&bull; Timers always fill Spent using 'decimal format' and not 'colon format'. See more under 'Best practices'.");
		helpWin.para("&bull; Minimize a timer by clicking on '↓'");
		helpWin.para("&bull; Use timers started from another device when you are <A target='_blank' href='https://support.google.com/chrome/answer/185277'>signed-into Chrome</A>.");
	    helpWin.para("&bull; If you forgot to start a timer, type the spent so far in the 'S' box and start the timer.");
	    helpWin.para("&bull; Pause the timer to pre-fill the 'S' box. Add an optional estimate or note and press ENTER.");
	    helpWin.para('&bull; If you dont press ENTER right away, Plus will remind you next time you open the card.');
	    helpWin.para('&bull; Cards with active (running) timers have a hourglass in Board view and show in the Chrome Plus menu.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_reccards">Recurring cards [R]</h2></b>');
	    helpWin.para('Make a card recurring when you don\'t want to measure changed estimates (like weekly meetings.)');
	    helpWin.para('Check "&#10004; Recurring" inside the card or manually add <b>[R]</b> to the card title.');
	    helpWin.para('A recurring card\'s <b>E 1ˢᵗ</b> automatically changes to match <b>E sum</b> thus do not generate changed estimates in reports.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_hashtags">Card Hashtags #</h2></b>');
	    helpWin.para('Add #tags to cards. Use the hashtag list inside cards or type them directly in card titles.');
	    helpWin.para('Hashtags are similar to Trello labels with the advantage of viewing them in the card back and shared across all boards.');
	    helpWin.para('Search cards by hashtag in the Chrome Plus menu or reports.');
	    helpWin.para('A card with title "This is a card <b>#review #sales #urgent!</b>" shows as:');
	    helpWin.para('<img src="' + chrome.extension.getURL("images/cardht.png") + '"/>');
	    helpWin.para('Tags containing "!" are highlighted in yellow.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_burndowns">Burndown charts</h2></b>');
	    helpWin.para('<img src="' + chrome.extension.getURL("images/s4.png") + '"/>');
	    helpWin.para('&bull; The initial Estimate climb (blue) happens during an estimation period and later remains stable.');
	    helpWin.para('&bull; In that estimation period the blue dots are equal to the green dots since no Spent is being done yet.');
	    helpWin.para('&bull; Then, the red line (Spent) climbs daily making the green line (Remaining) go down.');
	    helpWin.para('&bull; In the end, green (R) stays at zero and red (S) stops climbing.');
	    helpWin.para('&bull; Click on a dot to see more details and drill-down to the card.');
	    helpWin.para('&bull; Click on a user chart bar to drill-down into a report and cards.');
	    helpWin.para('&bull; Add a chart annotation by entering a card S/E row with a <A href="http://www.plusfortrello.com/p/spent-estimate-card-comment-format.html" target="_blank">note starting with "!"</A>.');
	    helpWin.para('&bull; Include multiple boards by customizing filters or first make a report, then pick "burndown" from the chart tab.');
	    helpWin.para('&bull; <A href="http://www.plusfortrello.com/p/about.html#burndowns" target="_blank">See another example</A>.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_dimensions">Dimensions</h2></b>');
	    helpWin.para('View board S/E by different dimensions.');
	    helpWin.para('Useful when using <A target="_blank" href="http://www.plusfortrello.com/p/faq.html#use_keywords">multiple keywords</A> or "card title S/E" (Scrum for Trello and such).');
	    helpWin.para('<img width="300" src="' + chrome.extension.getURL("images/dimensions.png") + '"/>');
	    helpWin.para('<A href="http://www.plusfortrello.com/p/board-dimensions.html" target="_blank">More "dimensions" help</A>.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');
	    helpWin.para('<b><h2 id="agile_help_reports">Reports</h2></b>');
	    helpWin.para('&bull; Open "Reports" from the Chrome Plus menu or from any board.');
	    helpWin.para('&bull; Report pivots (Spent by...) are useful to teams using S/E.');
	    helpWin.para('&bull; Use "Copy" <IMG border="none" align="top" src="' + chrome.extension.getURL("images/copy.png") + '"></IMG> on the top-right to send to the clipboard. Paste on a spreadsheet or email.');
	    helpWin.para('&bull; Drill-down on any chart bar or pivot cell to get a detailed report.');
	    helpWin.para('&bull; Reports and burndowns work offline from the Chrome Plus menu and can be bookmarked or emailed by URL.');
	    helpWin.para('&bull; The <b>E. type</b> column tells if the row Estimate is new, increases (+E) or decreases (-E) the card estimate per user.');
	    helpWin.para('&bull; A blank E. type means the estimate was not affected.');
	    helpWin.para('&bull; <A target="_blank" href="http://www.plusfortrello.com/p/report-documentation-and-examples.html">Detailed report help</A>.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_moreless">Less - More </h2></b>');
	    helpWin.para("&bull; Clicking 'Less' on the page top hides boards not entered for over 2 weeks and cards with last activity over 4 weeks ago.");
	    helpWin.para('&bull; <A target="_blank" href="http://help.trello.com/article/820-card-aging">Enable the Card Aging power-up</A> on each board to hide cards.');
	    helpWin.para("&bull; Hide this feature from Preferences.");
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_scrumNote">For "Scrum for Trello" extension users</h2></b>');
	    helpWin.para('Plus can read S/E from card titles. If so, the S/E boxes in the card back are gray instead of white.');
	    helpWin.para('<A target="_blank" href="http://www.plusfortrello.com/p/notes-for-users-of-scrum-for-trello.html">Read migration instructions</A> and see <b>Preferences</b> to "Accept the Scrum for Trello format".');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_prefs">&#10148; Preferences</h2></b>');
	    helpWin.para('<b>Reload this and other Chrome Trello tabs</b> after changing preferences.');
	    if (true) { //units
	        var pComboUnits = helpWin.raw('<p><span>Work units: </span></p>');
	        var comboUnits = $('<select style="width:auto">');
	        pComboUnits.append(comboUnits).append($('<span> Card timers measure time in your units. When changing units, S/E already entered is assumed in the new units so set your units here before entering any S/E.</span>'));
	        comboUnits.append($(new Option(UNITS.getLongFormat(UNITS.minutes), UNITS.minutes)));
	        comboUnits.append($(new Option(UNITS.getLongFormat(UNITS.hours), UNITS.hours)));
	        comboUnits.append($(new Option(UNITS.getLongFormat(UNITS.days), UNITS.days)));
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

	    if (true) {
	        var checkPointUnits = helpWin.para('<input style="vertical-align:middle;margin-bottom:0px;" type="checkbox" class="agile_checkHelp" value="checkedPointUnits" \
>Call units "Points" instead of the selection above.</input>').children('input:checkbox:first');

	        if (g_bDisplayPointUnits)
	            checkPointUnits[0].checked = true;

	        checkPointUnits.click(function () {
	            var bValue = checkPointUnits.is(':checked');
	            var pair = {};
	            pair["bDisplayPointUnits"] = bValue;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError == undefined)
	                    g_bDisplayPointUnits = bValue;
	                checkPointUnits[0].checked = g_bDisplayPointUnits;
	            });
	        });
	    }

	    helpWin.raw('<p><b>Week numbering</b>. All users must have the same week settings.</p>');
	    const idNotificationWeekUpgrade = "upgradeWeekNumbering";	    //option to change week start day

	    var comboDowStart = null;
	    var comboWeekDeltaStart = null;
	    var elemEffectiveDow = null;

	    function getDowStartFromCombo() {
	        return (comboDowStart ? (parseInt(comboDowStart.val(), 10) || 0) : DowMapper.getDowStart());
	    }

	    function getWeekDeltaStartFromCombo() {
	        return (comboWeekDeltaStart ? (parseInt(comboWeekDeltaStart.val(), 10) || 0) : DowMapper.getDowDelta());
	    }

	    function updateEffectiveDow() {
	        if (!elemEffectiveDow)
	            return;
	        var delta = DowMapper.getDowDelta();
	        var dowStart = DowMapper.getDowStart();
	        var strEffectiveDow = "";
	        if (delta != 0) {

	            var dowStartFinal = DowMapper.dowFromPosWeek(0);
	            var strPrefix = "";
	            if (delta > 0)
	                strPrefix = "the following ";
	            else
	                strPrefix = "the previous ";
	            strEffectiveDow = " <b>Week effectively starts on " + strPrefix + getWeekdayName(DowMapper.dowFromPosWeek(0), true).toLowerCase() + "</b>. Set shift to zero above to undo. ";
	        }
	        var dateNowTemp = new Date();
	        strEffectiveDow += "<br>Today's week is " + getCurrentWeekNum(dateNowTemp, dowStart, delta) + " with these settings.<br><br>";
	        if (delta != 0)
	            strEffectiveDow += " Would be " + getCurrentWeekNum(dateNowTemp, dowStart, 0) + " with zero shift.";
	        elemEffectiveDow.html(strEffectiveDow);
	    }

	    function updateOnWeekNumChange() {
	        var elemComboWeeks = $("#spentRecentWeeks");
	        updateEffectiveDow();
	        fillRecentWeeksList(elemComboWeeks);
	        hiliteOnce(elemComboWeeks,4000);
	        doWeeklyReport(g_configData, getCurrentTrelloUser(), true, false);
	    }

        //Week starts on
	    if (true) {
	        var pComboDow = helpWin.raw('<p><span>Week starts on </span></p>').addClass('agile_help_indent1');
	        comboDowStart = $('<select style="width:auto">');
	        comboDowStart.appendTo(pComboDow);
	        //comboDowStart.append($(new Option("saturday", "6"))); //dom: saturday not ready. many edge cases not handled.
	        comboDowStart.append($(new Option("sunday", "0")));
	        comboDowStart.append($(new Option("monday", "1")));
	        comboDowStart.val(DowMapper.getDowStart());

	        comboDowStart.change(function () {
	            var pair = {};
	            comboDowStart.attr('disabled', 'disabled');
	            var valComboDow = getDowStartFromCombo();
	            var bError = true;
	            var strError = "";
	            pair["dowStart"] = valComboDow;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError !== undefined) {
	                    strError = " Error. Not saved.";

	                    comboDowStart.val(DowMapper.getDowStart()); //reset
	                } else {
	                    strError = " Saving...";
	                    bError = false;
	                }
	                if (strError)
	                    sendDesktopNotification(strError, 6000, idNotificationWeekUpgrade);
	                if (bError) {
	                    comboDowStart.removeAttr('disabled');
	                    return;
	                }

	                var valComboWeekDelta = getWeekDeltaStartFromCombo();

	                openPlusDb(
                        //re-open the db right away. This doesnt refresh everything but at least it triggers conversion asap.
                        //note that if conversion fails for any reason, it will be done at the next openPlusDb from the content script
                        function (response) {
                            if (response.status != STATUS_OK)
                                strError += response.status;
                            else {
                                updateOnWeekNumChange();
                                strError += "Database upgraded OK.";
                            }
                            sendDesktopNotification(strError, 6000, idNotificationWeekUpgrade);
                            comboDowStart.removeAttr('disabled');
                        }, { dowStart: valComboDow, dowDelta: valComboWeekDelta });
	            });
	        });
	    }

	    //enable support for custom weeks
	    if (true) {
	        var pComboWeekDelta = helpWin.raw('<p><span>Support any start day by shifting the week +forward or -backwards: </span></p>').addClass('agile_help_indent1');
	        comboWeekDeltaStart = $('<select style="width:auto">');
	        comboWeekDeltaStart.appendTo(pComboWeekDelta);
	        pComboWeekDelta.append("<span> </span>");
	        pComboWeekDelta.append($('<a href="">Tell me more</a>.')).children('a').click(function (ev) {
	            helpTooltip(ev, "Example: Start weeks on thursday by selecting 'monday' and a shift of +3, or previous thursday with a shift of -4.<br />Plus Supports  <A target='_blank' href='http://en.wikipedia.org/wiki/ISO_week_date'>ISO weeks</A> starting sunday or monday. The 'ISO standard' has special rules for numbering weeks at the start or end of a year. A non-zero value first shifts the date, then applies the ISO rules. -7 and +7 shift by a whole week.");
	        });
	        elemEffectiveDow = $('<p />');
	        pComboWeekDelta.append(elemEffectiveDow);
	        comboWeekDeltaStart.append($(new Option("-7")));
	        comboWeekDeltaStart.append($(new Option("-6")));
	        comboWeekDeltaStart.append($(new Option("-5")));
	        comboWeekDeltaStart.append($(new Option("-4")));
	        comboWeekDeltaStart.append($(new Option("-3")));
	        comboWeekDeltaStart.append($(new Option("-2")));
	        comboWeekDeltaStart.append($(new Option("-1")));
	        comboWeekDeltaStart.append($(new Option("0 (no shift)","0")));
	        comboWeekDeltaStart.append($(new Option("+1", "1")));
	        comboWeekDeltaStart.append($(new Option("+2", "2")));
	        comboWeekDeltaStart.append($(new Option("+3", "3")));
	        comboWeekDeltaStart.append($(new Option("+4", "4")));
	        comboWeekDeltaStart.append($(new Option("+5", "5")));
	        comboWeekDeltaStart.append($(new Option("+6", "6")));
	        comboWeekDeltaStart.append($(new Option("+7", "7")));
	        comboWeekDeltaStart.val(DowMapper.getDowDelta());
	        updateEffectiveDow();
	        comboWeekDeltaStart.change(function () {
	            var pair = {};
	            comboWeekDeltaStart.attr('disabled', 'disabled');
	            var valComboWeekDelta = getWeekDeltaStartFromCombo();
	            var bError = true;
	            var strError = "";
	            pair["dowDelta"] = valComboWeekDelta;
	            
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError !== undefined) {
	                    strError = " Error. Not saved.";

	                    comboWeekDeltaStart.val(DowMapper.getDowDelta());
	                } else {
	                    strError = " Saving... ";
	                    bError = false;
	                }

	                updateEffectiveDow();
                    if (strError)
	                    sendDesktopNotification(strError, 6000, idNotificationWeekUpgrade);

                    if (bError) {
                        comboWeekDeltaStart.removeAttr('disabled');
	                    return;
                    }

                    var valComboDow = getDowStartFromCombo();
                    //note: openPlusDb will update dowStart in DowMapper just before returning
	                openPlusDb(
                        //re-open the db right away. This doesnt refresh everything but at least it triggers conversion asap.
                        //note that if conversion fails for any reason, it will be done at the next openPlusDb from the content script
                        function (response) {
                            if (response.status != STATUS_OK)
                                strError += response.status;
                            else {
                                updateOnWeekNumChange();
                                strError += "Database upgraded OK.";
                            }
                            sendDesktopNotification(strError, 6000, idNotificationWeekUpgrade);
                            comboWeekDeltaStart.removeAttr('disabled');
                        }, { dowStart: valComboDow, dowDelta: valComboWeekDelta });
	            });
	        });
	    }

	    if (true) {
	        var paraPreventEstMod = helpWin.para('<input style="vertical-align:middle;margin-bottom:0px;" type="checkbox" class="agile_checkHelp" value="checkedPreventEstMod" \
>Prevent me (mostly) from increasing existing <b>E</b>stimates. Your manager does it for you or wants to prevent entry mistakes. </input> <a href="">Tell me more</a>.');
	        var checkPreventEstMod = paraPreventEstMod.children('input:checkbox:first');
	        paraPreventEstMod.children('a').click(function (ev) {
	            helpTooltip(ev, "Check to prevent users from accidentally increasing E (cause a +E) in the S/E bar and 'modify'.\
 Users can still increase E on [R]ecurring cards, create new estimations (1st E) in the S/E bar and change E with <A href='http://www.plusfortrello.com/p/spent-estimate-card-comment-format.html' target='_blank'>card comments</A>.<br>\
Managers can always easily find new S/E rows with 'E. type: +E' in the Plus Chrome menu 'New S/E rows' report or estimate change charts.");
	        });
	        if (g_bPreventIncreasedE)
	            checkPreventEstMod[0].checked = true;

	        checkPreventEstMod.click(function () {
	            var bValue = checkPreventEstMod.is(':checked');
	            var pair = {};
	            pair["bPreventEstMod"] = bValue;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError == undefined)
	                    g_bPreventIncreasedE = bValue;
	                checkPreventEstMod[0].checked = g_bPreventIncreasedE;
	            });
	        });
	    }

	    if (true) {
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

	    
	    if (true) {
	        var checkAlwaysShowSEBar = helpWin.para('<input style="vertical-align:middle;" type="checkbox" class="agile_checkHelp" value="checkedAlwaysShowSEBar">\
Always show the card S/E bar.</input>').children('input:checkbox:first');
	        if (g_bAlwaysShowSEBar)
	            checkAlwaysShowSEBar[0].checked = true;

	        checkAlwaysShowSEBar.click(function () {
	            var bValue = checkAlwaysShowSEBar.is(':checked');
	            var pair = {};
	            pair["bAlwaysShowSEBar"] = bValue;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError == undefined)
	                    g_bAlwaysShowSEBar = bValue;
	                checkAlwaysShowSEBar[0].checked = g_bAlwaysShowSEBar;
	            });
	        });
	    }

	    //option to hide "Less - More" feature
	    if (true) {
	        var checkHideLessMore = helpWin.para('<input style="vertical-align:middle;" type="checkbox" class="agile_checkHelp" value="checkedHideLessMore">\
Hide "Less - More" at the top of Trello pages.</input>').children('input:checkbox:first');
	        if (g_bHideLessMore)
	            checkHideLessMore[0].checked = true;

	        checkHideLessMore.click(function () {
	            var bValue = checkHideLessMore.is(':checked');
	            var pair = {};
	            pair["bHideLessMore"] = bValue;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError == undefined)
	                    g_bHideLessMore = bValue;
	                checkHideLessMore[0].checked = g_bHideLessMore;
	                if (g_bHideLessMore) {
	                    chrome.storage.sync.set({ 'bShowAllItems': true }, function () {
	                        if (chrome.runtime.lastError === undefined)
	                            g_bShowAllItems = true;
	                    });
	                }
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

	    //option to not warn on multiple active timers
	    if (true) {
	        var checkDontWarnParallelTimers = helpWin.para('<input style="vertical-align:middle;" type="checkbox" class="agile_checkHelp" value="checkedDontWarnParallelTimers">\
Do not warn when starting a timer when another timer is active.</input>').children('input:checkbox:first');
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

	    //option to not show spent popups
	    if (true) {
	        var checkDontShowSpentPopups = helpWin.para('<input style="vertical-align:middle;" type="checkbox" class="agile_checkHelp" value="checkedDontShowSpentPopups">\
Do not show daily spent total popup notifications every time you enter spent.</input>').children('input:checkbox:first');
	        if (g_bDontShowSpentPopups)
	            checkDontShowSpentPopups[0].checked = true;

	        checkDontShowSpentPopups.click(function () {
	            var bValue = checkDontShowSpentPopups.is(':checked');
	            var pair = {};
	            pair["bDontShowSpentPopups"] = bValue;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError == undefined)
	                    g_bDontShowSpentPopups = bValue;
	                checkDontShowSpentPopups[0].checked = g_bDontShowSpentPopups;
	            });
	        });
	    }

	    //option to not show timer popups
	    if (true) {
	        var checkDontShowTimerPopups = helpWin.para('<input style="vertical-align:middle;" type="checkbox" class="agile_checkHelp" value="checkedDontShowTimerPopups">\
Do not show timer popup notifications.</input>').children('input:checkbox:first');
	        if (g_bDontShowTimerPopups)
	            checkDontShowTimerPopups[0].checked = true;

	        checkDontShowTimerPopups.click(function () {
	            var bValue = checkDontShowTimerPopups.is(':checked');
	            var pair = {};
	            pair["bDontShowTimerPopups"] = bValue;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError == undefined)
	                    g_bDontShowTimerPopups = bValue;
	                checkDontShowTimerPopups[0].checked = g_bDontShowTimerPopups;
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

	    helpWin.para("<br>The next two settings let Plus read S/E from card and checklist titles for board dimensions, pre-estimation and those migrating from other scrum tools.");
	    helpWin.para("Plus uses card title S/E in board dimensions only when the card has no S/E rows entered yet.");
	    helpWin.para("All users should have the same setting. S/E entered this way will only appear in the board and checklists, not in reports or burndowns.");
	    helpWin.para("See more about <A target='_blank' href='http://www.plusfortrello.com/p/notes-for-users-of-scrum-for-trello.html'>S/E in card titles</A> and <A target='_blank' href='http://www.plusfortrello.com/p/how-plus-tracks-spent-and-estimate-in.html#plus_preestimates'>pre-estimations</A>.");
	    //checkAcceptPFTLegacy
	    if (true) {
	        var checkAcceptPFTLegacy = helpWin.raw('<span style="vertical-align:middle;margin-bottom:0px;"><input style="vertical-align:middle;margin-bottom:0px;" type="checkbox"  value="checkAcceptPFTLegacy">\
Accept the "(S/E) title" format in card titles.</input></span><br>').children('input:checkbox:first');
	        if (g_bAcceptPFTLegacy)
	            checkAcceptPFTLegacy[0].checked = true;

	        checkAcceptPFTLegacy.click(function () {
	            var bValue = checkAcceptPFTLegacy.is(':checked');
	            var pair = {};
	            pair["bAcceptPFTLegacy"] = bValue;
	            chrome.storage.sync.set(pair, function () {
	                if (chrome.runtime.lastError == undefined)
	                    g_bAcceptPFTLegacy = bValue;
	                checkAcceptPFTLegacy[0].checked = g_bAcceptPFTLegacy;
	                getKeywordsViewList(); //refresh
	            });
	        });
	    }

        //checkAcceptScrumForTrello
	    if (true) {
	        var checkAcceptScrumForTrello = helpWin.raw('<span style="vertical-align:middle;margin-bottom:0px;"><input style="vertical-align:middle;margin-bottom:0px;" type="checkbox"  value="checkedAcceptSFT">\
Accept the "Scrum for Trello" format in card titles: <i>(Estimate) card title [Spent]</i>.</input></span>').children('input:checkbox:first');
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
	                getKeywordsViewList(); //refresh
	            });
	        });
	    }

	    helpWin.para('&nbsp');

	    //global user
	    if (true) {
	        var paraGlobalUser = helpWin.para('Global estimates name (not a real Trello user): <input style="display:inline;width:15em;" type="text" spellcheck="false" maxlength="20"/>&nbsp;<input type="button" value="Save"/>');
	        var inputGlobalUser = paraGlobalUser.children('input:text:first');
	        var buttonSaveGlobalUser = paraGlobalUser.children('input:button:first');

	        inputGlobalUser.val(g_globalUser);
	        buttonSaveGlobalUser.click(function () {
	            doSave(true);

	            function doSave(bShowSavedMessage) {
	                var val = inputGlobalUser.val().toLowerCase().trim() || DEFAULTGLOBAL_USER;
	                inputGlobalUser.val(val);
	                if (val.indexOf("@") >= 0 || val.indexOf(" ") >= 0 || val.indexOf(",") >= 0 || val.indexOf("'") >= 0 || val.indexOf('"') >= 0) {
	                    alert("The username cannot contain @, spaces, quotes or commas.");
	                    return;
	                }
	                var objSave = {};
	                objSave[SYNCPROP_GLOBALUSER] = val;
	                chrome.storage.sync.set(objSave, function () {
	                    if (chrome.runtime.lastError !== undefined) {
	                        alert(chrome.runtime.lastError.message);
	                        return;
	                    }
	                    g_globalUser = val;
	                    if (bShowSavedMessage)
	                        alert("Saved.");
	                });
	            }
	        });
	    }

	    //ignore these users in the users dropdown
	    if (true) {
	        var paraExcludeUsers = helpWin.para('Exclude these users from the card bar. Separate users with comma:<br><input style="display:inline;width:40em;" type="text" spellcheck="false" maxlength="500"/>&nbsp;<input type="button" value="Save list"/>');
	        var inputExcludeUsers = paraExcludeUsers.children('input:text:first');
	        var buttonSaveExcludeUsers = paraExcludeUsers.children('input:button:first');

	        function putExcludedUsersInUi(rg) {
	            var str = "";
	            rg.forEach(function (item) {
	                if (str.length == 0)
	                    str = item;
	                else
	                    str = str + ", " + item;
	            });
	            inputExcludeUsers.val(str);

	        }

	        putExcludedUsersInUi(g_rgExcludedUsers);
	        buttonSaveExcludeUsers.click(function () {
	            doSaveExcludeUsers(true);

	            function doSaveExcludeUsers(bShowSavedMessage) {
	                var rg = inputExcludeUsers.val().split(",");
	                var rgNew = [];
	                rg.forEach(function (item) {
	                    var k = item.trim().toLowerCase();
	                    if (k)
	                        rgNew.push(k); //skip blanks etc
	                });

	                putExcludedUsersInUi(rgNew);
	                chrome.storage.sync.set({ 'rgExcludedUsers': JSON.stringify(rgNew) }, function () {
	                    if (chrome.runtime.lastError !== undefined) {
	                        alert(chrome.runtime.lastError.message);
	                        return;
	                    }
	                    g_rgExcludedUsers = rgNew;
	                    if (bShowSavedMessage)
	                        alert("Saved.");
	                });
	            }
	        });
	    }

        //keywords filter in home and header
	    if (true) {
	        var paraKWHome = helpWin.para('Only include these <A target="_blank" href="http://www.plusfortrello.com/p/faq.html#use_keywords">keywords</A> (separated by comma) in the Trello header report and home charts:<br><input style="display:inline;width:40em;" type="text" spellcheck="false" maxlength="200"/>&nbsp;<input type="button" value="Save list"/>');
	        var inputKWHome = paraKWHome.children('input:text:first');
	        var buttonKWHome = paraKWHome.children('input:button:first');
	        putKeywordsStringInUi(g_rgKeywordsHome, inputKWHome);
	     
	        buttonKWHome.click(function () {
	            doSave(true);

	            function doSave(bShowSavedMessage) {
	                var rgNew = convertKWListToArray(inputKWHome);
	                if (!rgNew.every(function (kw) {
	                    if (g_optEnterSEByComment.rgKeywords.indexOf(kw) < 0) {
	                        alert("The keyword '" + kw + "' is not in your keywords list. See the Sync by card comments section.");
	                        return false;
	                    }
	                    return true;
	                })) {
	                    return;
	                }

	                var objSave = {};
	                objSave[SYNCPROP_KEYWORDS_HOME] = JSON.stringify(rgNew);
	                chrome.storage.sync.set(objSave, function () {
	                    if (chrome.runtime.lastError !== undefined) {
	                        alert(chrome.runtime.lastError.message);
	                        return;
	                    }
	                    g_rgKeywordsHome = rgNew;
	                    putKeywordsStringInUi(g_rgKeywordsHome, inputKWHome);
	                    doWeeklyReport(g_configData, getCurrentTrelloUser(), true, false);
	                    setTimeout(function () { //timeout allows the charts UI to update
	                        if (bShowSavedMessage)
	                            alert("Saved.");
	                    }, 200);
	                });
	            }
	        });
	    }
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_utilities">Utilities (reset etc)</h2></b>');
	    var paraReset = helpWin.para('&bull; Re-read all your S/E data: <input type="button" value="Reset sync"/><br />Close other trello tabs before reset. Useful if you changed keywords, edited or deleted many card S/E comments.');
	    helpWin.para('If you only mofified a few card comments, read about the <A href="http://www.plusfortrello.com/p/spent-estimate-card-comment-format.html#resetsynccommand" target="_blank">card "^resetsync" command</A>.<br /><br />');
	    var buttonReset = paraReset.children('input:button:first');
	    buttonReset.click(function () {
	        ResetPlus();
	    });

	    if (g_optEnterSEByComment.IsEnabled() || IsStealthMode()) {
	        var paraRenameCards = helpWin.para('&bull; Remove S/E from card titles in Trello. Useful if you switch from the Legacy sync method:<br><input type="button" value="Rename cards with S/E history"/>&nbsp;&nbsp;&nbsp;<input type="button" value="Rename all cards"/>');
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
	            if (!confirm('Are you sure you want to rename all cards with existing S/E rows?\nThey will be permanently renamed in Trello.'))
	                return;
	            handleButtonRename(true);
	        });

	        buttonRenameCardsAll.click(function () {
	            if (!confirm('Are you sure you want to rename all cards, even those without S/E history rows?\nThey will be permanently renamed in Trello.'))
	                return;
	            handleButtonRename(false);
	        });

	        var paraUndoRenameCards = helpWin.para('<br />&bull; Undo a "Remove S/E from card titles" command using the created backup file from the "Rename" buttons above.<br /><input type="button" value="Undo Rename cards"/>');
	        var buttonUndoRenameCards = paraUndoRenameCards.children('input:button:first');
	        buttonUndoRenameCards.click(function () {
	            sendExtensionMessage({ method: "undoRenameCards"},
                                    function (response) {
                                        if (response.status == STATUS_OK) {
                                            if (response.totalCards != 0) {
                                                alert("Undo of " + response.totalCards + " card titles will happen during the next sync\nafter you close help.\nHover the Chrome Plus icon (top-right) to see sync progress.");
                                                helpWin.bStartSyncOnClose = true;
                                            }
                                            else
                                                alert("No cards to process.");
                                        } else {
                                            alert(response.status);
                                        }
                                    });
	        });

	    }
	    else {
	        helpWin.para('Removal of S/E from card titles is only allowed in "Trello card comments" or "stealth" sync mode.');
	    }

	    helpWin.para('&nbsp');
	    helpWin.para('&bull; To find all boards where you are not a member, see the <A href="#agile_help_trellosync">"Sync" section</A> above (only if using the "card comments" sync mode)');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_troubleshoot">Frequently asked questions and issues</h2></b>');
	    helpWin.para('<A target="_blank" href="http://www.plusfortrello.com/p/faq.html" >see FAQ or submit a new question or request</a>.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_help_security">Privacy policy, security and licence agreement</h2></b>');
	    helpWin.para('Plus secures all your data inside your browser, does not use servers and does not have access to your data outside your browser. <A target="_blank" href="http://www.plusfortrello.com/p/privacy-policy.html">More</A>.');
	    helpWin.para('By using this software, you agree to our <A target="_blank" href="http://www.plusfortrello.com/p/eula-plus-for-trello-end-user-license.html">End-user licence agreement (EULA)</A>.');
	    helpWin.para('&nbsp');
	    helpWin.para('&nbsp');

	    helpWin.para('<b><h2 id="agile_licences">Open-source licences</h2></b>');
	    helpWin.para('<A target="_blank" href="http://www.plusfortrello.com/p/licences.html">View all licences</A>.');
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
        //add all H2 to the index
	    container.find("h2").each(function () {
	        var el = $(this);
	        var title = el.text();
	        var id = el.attr("id");
	        if (id && id != "agile_pro_section") {
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
	        while (objHelp.m_extraElems && objHelp.m_extraElems.length > 0)
	            objHelp.m_extraElems.pop().remove();
	        objHelp.m_extraElems = [];
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
	                    doSyncDB(null, true, false, true);
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

function setupPlusConfigLink(bParam, bStealth) {
    var title = (bStealth ? "Click to setup Stealth Google sync" : "Click to setup Google sync");
    var span = $('<span></span>').addClass('header-btn-text agile_help_setup_link').text(title);
    span.appendTo(bParam);
    span.click(function () {
        PlusConfig.display(bParam, bStealth);
    });
    return span;
}

var g_cProtectMultiNonMemberBoardsDialog = 0;
function showNonMemberBoardsDialog() {
    g_cProtectMultiNonMemberBoardsDialog++;
    var cProtect = g_cProtectMultiNonMemberBoardsDialog;
    var divDialog = $(".agile_dialog_showNonMemberBoards");
    if (divDialog.length == 0) {
        divDialog = $('\
<dialog class="agile_dialog_showNonMemberBoards agile_dialog_DefaultStyle"> \
<h2>You are not a member of these boards:</h2> \
<br> \
<p>Plus compares your boards (since last sync) with all boards in all Trello teams where you belong.</p>\
<br> \
<div id="agile_nonmemberListContents"></div>\
<br \>\
<br \>\
<button style="float:right;" id="agile_dialog_showNonMemberBoards_OK">OK</button> \
</dialog>');
        $("body").append(divDialog);
        divDialog = $(".agile_dialog_showNonMemberBoards");
    }

    divDialog.find("#agile_dialog_showNonMemberBoards_OK").off("click.plusForTrello").on("click.plusForTrello", function (e) {
        divDialog[0].close();
    });

    var div = divDialog.find("#agile_nonmemberListContents");
    div.empty();
    div.text("Finding...");
    showModalDialog(divDialog[0]);
    sendExtensionMessage({ method: "getBoardsWithoutMe"},
                function (response) {
                    if (cProtect != g_cProtectMultiNonMemberBoardsDialog)
                        return;
                    div.empty();

                    if (response.status != STATUS_OK) {
                        div.text(response.status);
                        return;
                    }
                    if (response.boards.length == 0) {
                        div.text("No boards found where you are not a member (and belong to its team).");
                        return;
                    }
                    div.text("To use Plus on a board in this list, click it and add yourself as a member.");
                    var ul = $("<ul style='margin-top:1em;'>");
                    ul.appendTo(div);
                    response.boards.forEach(function (board) {
                        var li = $("<li>");
                        var a = $("<A target='_blank'>").prop("href", "https://trello.com/b/" + board.idBoardLong).text(board.name);
                        var text = " ";
                        if (board.dateLastActivity)
                            text += makeDateCustomString(new Date(board.dateLastActivity)) + " ";

                        if (board.closed)
                            text += "[Closed] ";
                        
                        var span = $("<span style='margin-right:1em;'>").text(text);
                        span.appendTo(li);
                        a.appendTo(li);
                        li.appendTo(ul);
                    });
                });
}

