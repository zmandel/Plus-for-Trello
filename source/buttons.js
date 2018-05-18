/// <reference path="intellisense.js" />


var HelpButton = {
    strClass: 'agile_help_button',
    create: function () {
        var bPlusDisplayDisabled = isPlusDisplayDisabled();
        var b = $('<span id="agile_help_buttons_container"></span>').addClass('notranslate header-btn ' + this.strClass);
		b.hide();

		var spanIcon = $('<span></span>').css('cursor', 'help');
		var spanTour = $('<span class="agile_tour_link agile_plus_header_link">Tour</span>');
		hookTour(spanTour);
		var icon = $("<img>").attr("src", chrome.extension.getURL(bPlusDisplayDisabled ? "images/iconspenthelpwarn.png" : "images/iconspenthelp.png"));
		icon.addClass("agile-spent-icon-header agile-main-plus-help-icon");
		icon.attr("title", "Plus Help");
		if (!bPlusDisplayDisabled)
		    b.append(spanTour);
		spanIcon.append(icon);
		b.append(spanIcon);
		icon.click(function (evt) {
		    Help.display();
		});

		configureSsLinks(b);
		setTimeout(function () {
		    if (newerStoreVersion())
		        hiliteOnce(icon, null, null, 3);
		}, 1000);
		return b;
	},
	display: function () {
		var header = $('div#header div.header-user');
		if (header.find('.' + this.strClass).size() == 0) {
			var objThis = this.create();
			header.prepend(objThis);
		}
	}
};


var g_intervalCheckPlusFeed = null;
function insertPlusFeed(bForce) {
	if (g_intervalCheckPlusFeed != null && !bForce)
		return;

	var stateFeed = {
		msLastPostRetrieved: 0,		// date of most recent post retrieved
		msLastPostReadByUser: 0,	// date of last post read by user
		msLastQuery: 0,				// date we last made a query. shouldnt do more than once every 3 hours to prevent sync issues and api overuse.
		msUserClicked: 0
	};

	var icon = $(".agile-icon-new-header");

	if (icon.length > 0)
		return;

	function doGetFeed() {
		var key = "gplusfeeddata";
		chrome.storage.sync.get(key, function (obj) {
			var data = obj[key];
			if (data !== undefined)
				stateFeed = data;
			var msNow = Date.now();
			var msWait = 1000 * 60 * 60 * 3; //3 hours (there is a quota of 50,000 queries/day for all users) code.google.com/apis/console/b/0/?noredirect#project:147493868263:stats
		    //msWait = 1000; //1 sec, for test
			if (isPlusDisplayDisabled())
			    msWait = 1000 * 60 * 60 * 0.5; //half hour in case there is a new g+ post about an issue fixed
			if (msNow - stateFeed.msLastQuery > msWait) {
				setTimeout(function () { //delay a few seconds because usually happens on trello page load, wait until that settles
					sendExtensionMessage({ method: "getPlusFeed", msLastPostRetrieved: stateFeed.msLastPostReadByUser },
					function (response) {
						if (response.status != STATUS_OK) {
							insertPlusFeedWorker(stateFeed, key); //use previous result
							return;
						}
						stateFeed.msLastPostRetrieved = response.msLastPostRetrieved;
						stateFeed.msLastQuery = msNow;
						var iitem = 0;
						var itemsSave = [];
						var iMax = Math.min(2, response.items.length); //prevent huge sync item
						for (; iitem < iMax; iitem++) {
							var item = response.items[iitem];
							itemsSave.push({ d: item.msDatePublish, t:item.title });
						}
						if (JSON.stringify(itemsSave).length > 500) //prevent huge sync item. should never happen since each item is small and we allow 2 only
							itemsSave = [];
						stateFeed.items = itemsSave;
						var objSave = {};
						objSave[key] = stateFeed;
						if (true) {
							chrome.storage.sync.set(objSave, function () {
								if (chrome.runtime.lastError === undefined)
									insertPlusFeedWorker(stateFeed, key);
							});
						}
					});
				}, 3000);
			} else {
				insertPlusFeedWorker(stateFeed, key);
			}
		});
	}

	setTimeout(function () { doGetFeed(); }, 1000); //use timeout so icon doesnt jump left after inserted (let plus header breathe)
	
	if (g_intervalCheckPlusFeed != null)
		return;
	//since feed is only updated if the tab is active etc, we check often if it needs updating.
	g_intervalCheckPlusFeed=setInterval(function () {
	    if (!isTabVisible())
			return;
		doGetFeed();
	}, 1000 * 60 * 5); //every 5 minutes
}

function insertPlusFeedWorker(stateFeed, key) {
	var icon = $(".agile-icon-new-header");
	var spanIcon = null;
	var bShowNewIcon= false;
	var bShowRecentIcon = false; //review: this can go away
	var pathImgRecent = "images/newgray.png";
	var msNow = Date.now();
	var dmsOldestShow = 1000 * 60 * 60 * 24 * 6; //6 days
	var titleTipBase = "New Plus features!";

	if (stateFeed.msLastPostReadByUser < stateFeed.msLastPostRetrieved) {
	    if (msNow - stateFeed.msLastPostRetrieved < dmsOldestShow) {
	        if (g_msStartPlusUsage && stateFeed.msLastPostRetrieved<g_msStartPlusUsage)
	            bShowNewIcon = false;
            else
	            bShowNewIcon = true;
	    }
	}

	if (bShowNewIcon || bShowRecentIcon) {
		if (icon.length == 0) {
		    var parent = $("#agile_help_buttons_container");
			spanIcon = $('<span></span>').css('cursor', 'pointer');
			spanIcon.hide();
			icon = $("<img>");
			icon.addClass("agile-icon-new-header");
			spanIcon.append(icon);
			parent.prepend(spanIcon);
			icon.click(function () {
				chrome.storage.sync.get(key, function (obj) {
					var stateOrig = cloneObject(stateFeed);
					var data = obj[key];
					if (data !== undefined)
						stateFeed.msLastPostRetrieved = Math.max(data.msLastPostRetrieved, stateOrig.msLastPostRetrieved);
					stateFeed.msLastPostReadByUser = stateFeed.msLastPostRetrieved;
					stateFeed.msUserClicked = Date.now();
					if (stateOrig.msLastPostRetrieved != stateFeed.msLastPostRetrieved ||
						stateOrig.msLastPostReadByUser != stateFeed.msLastPostReadByUser ||
						(stateFeed.msUserClicked - stateOrig.msUserClicked > 1000 * 60 * 5)) { //protect sync quota for 5min if only msUserClicked changed
						var objSave = {};
						stateFeed.items = [];
						objSave[key] = stateFeed;					
						chrome.storage.sync.set(objSave, function () { });
					}
				});
				icon.attr("src", chrome.extension.getURL(pathImgRecent));
				icon.attr("title", titleTipBase);
				window.open('https://plus.google.com/collection/khxOc', '_blank');
				if (newerStoreVersion())
				    sendDesktopNotification("Open the Plus help pane to update to the latest version now.");
			});
		} else {
			spanIcon = icon.parent();
		}
		icon.attr("src", chrome.extension.getURL(bShowNewIcon ? "images/new.png" : pathImgRecent));
		var iitem = 0;
		var titleTip = titleTipBase;
		if (false) { //dont show preview 
		    for (; stateFeed.items && iitem < stateFeed.items.length; iitem++) {
		        var item = stateFeed.items[iitem];
		        var datePub = new Date(item.d);
		        titleTip += ("\n\n• " + datePub.toLocaleDateString() + ": " + item.t);
		    }
		}
		icon.attr("title", titleTip);
		checkTrelloLogo();
		spanIcon.fadeIn(600, function () {
		    checkTrelloLogo();
		    if (bShowNewIcon)
		        spanIcon.fadeOut(300, function () {
		            spanIcon.fadeIn(300);
		        });
		});
	} else {
		if (icon.length > 0) {
			spanIcon = icon.parent();
			spanIcon.hide();
		}
	}
}