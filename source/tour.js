/// <reference path="intellisense.js" />

/* step
 *
 *  selector:   jquery selector of element. .eq(0) will be used 
 *  text:       html text to show
 *  angle:      clockwise. 0 points down
 *  distance:   from element to mouth of bubble
 *  size:       one of 50,100,150,200. 0 tries to pick automatically
 *
 **/

var g_wideLag = {
    "zh-CN": true
};

var g_tour = {
    bAutoShowTour: false,
    name: "",
    flow: [],
    index: 0,
    mapFlowState: {}
};

function isTourRunning() {
    return (g_tour.bAutoShowTour || g_tour.name.length > 0);
}

function showTourBubble() {
    g_bNeedStartTourBubble = false;
    var step = {
        selector: ".agile_tour_link",
        text: "Start<br>the Plus tour<br>from here anytime!<br><br>Select your language in Plus help.",
        angle: 180,
        distance: 0,
        size: 200
    };
    showBubbleFromStep(step, true, true,0);
}


function showSeeYaBubble() {
    var step = {
        selector: ".agile_tour_link",
        text: "See you later!",
        angle: 180,
        distance: 0,
        size: 100
    };
    showBubbleFromStep(step, true, true, 0, true);
}

function handleHomeTour() {
    var flow = [
        {
            id: 1,
            selector: ".agile-spent-icon-header",
            text: "Click <b>?</b> anytime for<br>complete help.<br><br>If you track <b>E</b>stimation changes or manage a team make sure to read all help",
            angle: 180,
            distance: 0,
            size: 200
        },

        {
            id: 2,
            selector: ".agile-spent-icon-header",
            text: "Use the arrows<br>here or on your<br>keyboard to<br>navigate this tour",
            angle: 180,
            distance: 0,
            size: 150
        },

        {
            id: 3,
            selector: "#urlUser",
            text: "<br>This report<br>shows your total daily <b>S</b>pent breakdown<br>",
            angle: 180,
            distance: 0,
            size: 150,
            bSEOnly: true
        },
         {
             id: 4,
             selector: "#spentRecentWeeks",
             text: "<br>Change<br>the report view by clicking on the week<br>",
             angle: 180,
             distance: 0,
             size: 150,
             bSEOnly: true
         },
         {
             id: 5,
             selector: "#toggleAll",
             text: "<br>Toggles More-Less<br><br>Click <b>Less</b> to hide old boards and cards.<br>Click <b>More</b> to show all.<br><br>Make sure <b><a style='color:white;' href='http://help.trello.com/article/820-card-aging' target='_blank'>Trello card aging</a></b> is enabled for the board",
             angle: 180,
             distance: 0,
             size: 200
         },
        {
            id: 7,
            selector: "#headerSEActivities",
            text: "This section shows <br>Spent charts, your recent S/E and cards with Remaining balance.<br><br>Click to show or hide.",
            angle: 90,
            distance: 0,
            size: 200,
            bSEOnly: true
        },

         {
             id: 8,
             selector: ".classid_spent_week_users",
             text: "<br><br>Click on a chart title to zoom it full-window.<br><br>Click on any chart bar to drill-down.",
             addText: function () {
                 if (g_cRowsWeekByUser > 0)
                     return "";
                 return "There is no data to chart this week yet.";
             },
             angle: 90,
             distance: 0,
             size: 200,
             bSEOnly: true
         },

          {
              id: 9,
              selector: ".classid_spent_recent_cards",
              text: "<br>Your last ten<br>card S/E entries.<br><br>Click one to open<br>the card<br><br>",
              angle: 135, //considers case where there are no fav. boards
              distance: 20,
              size: 150,
              bSEOnly: true
          },
            {
                id: 10,
                selector: ".classid_spent_pending_cards",
                text: "Cards with<br><b>S</b>pent not equal <b>E</b>stimate<br>show here.<br><br>Cards should not have S bigger than E, those are painted pink",
                angle: 135, //considers case where there are no fav. boards
                distance: 20,
                size: 200,
                bSEOnly: true
            },
            {
                id: 11,
                selector: ".js-boards-menu",
                text: "<b>Go to a board</b><br>to continue the tour",
                angle: 90+45,
                distance: 0,
                size: 150
            }
    ];
    startTourFlow(flow,"home");

}

function hookTour(elem) {
    if (g_bHideTour)
        elem.hide();
    elem.click(function () {
        handleTourStart(true);
    });
    if (g_tour.bAutoShowTour)
        setTimeout(function () { handleTourStart(false); }, 2500);
}

function handleCardTour() {
    showSEBarContainer(true);
    var flow = [
    {
        id: 1,
        selector: ".agile_AddSELink",
        text: "Help<br>is here too.<br><br>Use keyboard arrows<br>to navigate the tour.",
        angle: 180,
        distance: 0,
        size: 150
    },

    {
        id: 2,
        selector: "#container_agile_checkRecurringCard",
        text: "check 'Recurring'<br>so cards (like weekly meetings) will not have a '1ˢᵗ estimate' and wont inflate changed estimate reports.",
        angle: 180,
        distance: 0,
        size: 200,
        bSEOnly: true
    },

    {
        id: 3,
        selector: ".agile_hashtags_list",
        text: "Add #tags<br>to cards and later search them from reports.",
        angle: 180,
        distance: 0,
        size: 150
    },

    {
        id: 4,
        selector: "h2.js-card-title",
        text: "You can also<br>change the card title directly to manage #tags/recurring.",
        angle: 180,
        distance: 0,
        size: 150
    },

      {
          id: 5,
          selector: ".agile_AddSELink",
          text: "To show the<br>card 'S/E bar'<br>when hidden<br>click here.",
          angle: 180,
          distance: 0,
          size: 150,
          bSEOnly: true
      },

    {
        id: 6,
        selector: ".agile-se-bar-entry",
        focus:".agile_days_box_input",
        text: "<b>card S/E bar</b><br> here you enter<br> <b>S</b>pent and <b>E</b>stimate rows.<br><br>Each <b>S/E row</b> entered shows as a card comment and in reports.",
        angle: 90,
        distance: 0,
        size: 200,
        bSEOnly: true
    },
    {
        id: 7,
        selector: ".agile-se-bar-entry",
        focus: ".agile_days_box_input",
        text: "<b>S</b>pent and <b>E</b>stimate<br>units default to 'hours'.<br>If you prefer minutes or days, change it from Preferences in Plus help before entering S/E.",
        angle: 90,
        distance: 0,
        size: 200,
        bSEOnly: true
    },
      {
          id: 8,
          selector: ".agile-se-bar-entry",
          focus: ".agile_days_box_input",
          text: "To track changed estimates, the first <b>S/E row</b><br>entered per user<br>needs an initial <b>E</b>stimate.",
          angle: 90,
          distance: 0,
          size: 200,
          bSEOnly: true,
          bEstOnly: true
      },
      {
          id: 9,
          selector: ".agile-se-bar-entry",
          focus: ".agile_days_box_input",
          text: "That first S/E row<br>entered per user is<br>their <b>1ˢᵗ Estimate</b><br>and cannot be modified.<br><br>Useful to detect<br>and compare changed estimates using reports.<br>",
          angle: 90,
          distance: 0,
          size: 200,
          bSEOnly: true,
          bEstOnly: true
      },
    {
        id: 10,
        selector: ".agile-se-bar-entry",
        focus: ".agile_days_box_input",
        text: "If you never want to track changed estimates tell Plus in Preferences to 'Allow negative <b>R</b>emaining'",
        angle: 90,
        distance: 0,
        size: 200,
        bSEOnly: true,
        bEstOnly: true
    },
    {
        id: 11,
        selector: ".agile-se-bar-entry",
        focus: ".agile_days_box_input",
        text: "<b>Spend</b> units by<br>entering more 'S/E rows' with positive <b>S</b>pend and<br>empty <b>E</b>stimate.<br><br>",
        angle: 90,
        distance: 0,
        size: 200,
        bSEOnly: true
    },

        {
            id: 12,
            selector: ".agile-se-bar-entry",
            focus: ".agile_days_box_input",
            text: "You may<br>type both S and E<br>in the same row.<br><br>An empty cell means zero.",
            angle: 90,
            distance: 0,
            size: 200,
            bSEOnly: true,
            bEstOnly: true
        },

     {
         id: 13,
         selector: ".agile-se-bar-entry",
         focus: ".agile_days_box_input",
         text: "<b>S and E<br>are cummulative</b>.<br><br>Their current sum per user is shown in the table above.<br><br>See the example in Plus help.",
         angle: 90,
         distance: 0,
         size: 200,
         bSEOnly: true
     },
    {
        id: 14,
        selector: ".agile-se-bar-entry",
        focus: ".agile_days_box_input",
        text: "The best practice is to<br>enter <b>S</b>pent until <b>R</b> is zero<br>(<b>S sum</b> equals <b>E sum</b>).",
        angle: 90,
        distance: 0,
        size: 200,
        bSEOnly: true,
        bEstOnly: true
    },
    {
        id: 15,
        selector: ".agile-se-bar-entry",
        focus: ".agile_days_box_input",
        text: "If your Spent would<br>go over the estimate<br>enter more <b>E</b> so <b>R</b><br>doesn't go negative.<br><br>The Plus bar defaults <b>E</b><br>automatically in that case.",
        angle: 90,
        distance: 0,
        size: 200,
        bSEOnly: true,
        bEstOnly: true
    },
        {
            id: 16,
            selector: ".agile-se-bar-entry",
            focus: ".agile_days_box_input",
            text: "Likewise<br>if you finish a card and<br>still has <b>R</b>emaining,<br>reduce your Estimate<br>(enter negative <b>E</b>)<br>so <b>R</b> gets to zero.<br><br>",
            angle: 90,
            distance: 0,
            size: 200,
            bSEOnly: true,
            bEstOnly: true
        },
        {
            id: 17,
            selector: ".agile-card-seByUserModify",
            text: "Its easier<br>to make those modifications from here so it does that math for you.",
            angle: 180,
            distance: 0,
            size: 200,
            bSEOnly: true,
            bEstOnly: true
        },
        {
            id: 18,
            selector: ".agile-card-seByUserModify",
            text: "For example,<br>if the card is done but there is still <b>R</b>, just zero or empty <b>R</b> to reduce the estimate.",
            angle: 180,
            distance: 0,
            size: 200,
            bSEOnly: true,
            bEstOnly: true
        },

        {
            id: 19,
            selector: ".agile-card-seByUserModify",
            text: "Always use this or<br>the S/E bar to modify.<br><br><b>Do not edit or delete the card comment</b><br><br><a style='color:white;' href='http://www.plusfortrello.com/p/spent-estimate-card-comment-format.html#resetsynccommand' target='_blank'>oups too late</a>",
            angle: 180,
            distance: 0,
            size: 200,
            bSEOnly: true,
            bEstOnly: true
        },

        {
            id: 40,
            selector: ".agile-card-seByUserModify",
            text: "<br>Read:<br><br><a style='color:white;' href='http://www.plusfortrello.com/p/s-e-entry-methods.html' target='_blank'>Which S/E entry method to use?</a><br><br>",
            angle: 180,
            distance: 0,
            size: 200,
            bSEOnly: true
        },

        {
            id: 20,
            selector: "#plusCardCommentUsers",
            text: "To enter an <b>S/E row</b><br>pick the user<br>(you by default).<br>If using multiple keywords, you can also pick one from another list.",
            angle: 180,
            distance: 0,
            size: 200,
            bSEOnly: true
        },
     {
         id: 21,
         selector: ".agile_days_box_input",
         text: "then pick the date it happened,<br><br>'now', -3d for '3 days ago', or 'other' to pick from a calendar.",
         angle: 180,
         distance: 0,
         size: 200,
         bSEOnly: true
     },
      {
          id: 22,
          selector: ".agile_spent_box_input",
          text: "type <b>Spent</b><br><br>Also accepts<br>hours<b>:</b>minutes format.<br><br>Leave blank to enter only an <b>E</b>stimate.<br>",
          angle: 180,
          distance: 0,
          size: 200,
          bSEOnly: true
      },
           {
               id: 23,
               selector: ".agile_estimation_box_input",
               text: "type <b>Estimate</b><br><br>Leave blank<br>to enter only <b>S</b>pent<br><br>The first row entered will be the 1ˢᵗ estimate (<b>E 1ˢᵗ</b>) in the table above.",
               angle: 180,
               distance: 0,
               size: 200,
               bSEOnly: true,
               bEstOnly: true
           },

           {
               id: 24,
               selector: ".agile_comment_box_input",
               text: "Type an<br>optional note here and press the Enter key or button.",
               angle: 180,
               distance: 0,
               size: 150,
               bSEOnly: true
           },
               {
                   id: 25,
                   selector: ".agile-se-bar-entry",
                   focus: ".agile_days_box_input",
                   text: "For advanced S/E entry see<br><a style='color:white;' href='http://www.plusfortrello.com/p/spent-estimate-card-comment-format.html' target='_blank'>S/E comment format</a>.",
                   angle: 90,
                   distance: 0,
                   size: 200,
                   bSEOnly: true
               },
       {
           id: 26,
           selector: ".agile_card_report_link",
           text: "Once there are<br>S/E rows entered, this report shows a breakdown<br>per user.<br><br>Click this to drill-down on the card.",
           angle: 180,
           distance: 0,
           size: 200,
           bSEOnly: true
       },

       {
           id: 27,
           selector: ".agile-card-statrow-data",
           text: "Users with positive <b>R</b><br>have remaining work.<br><br>Mouse-over the user<br>to see their last S/E date.<br><br>Click the user to drill-down.<br>",
           angle: 180,
           distance: 0,
           size: 200,
           bSEOnly: true,
           bEstOnly: true
       },
        {
            id: 28,
            selector: ".agile-card-now-estimate-header",
            text: "<br><b>E Sum</b> is the current estimate per user.<br><br>Calculated as the sum of all E in S/E rows for the user.",
            angle: 180,
            distance: 0,
            size: 200,
            bSEOnly: true,
            bEstOnly: true
        },
       {
           id: 29,
           selector: ".agile-card-now-estimate-header",
           text: "<b>(E 1ˢᵗ)</b> shows (in<br>parenthesis) when<br>the current estimate has been modified.<br><br>Once entered, the 1ˢᵗ estimate cannot be modified (except with <a style='color:white;' href='http://www.plusfortrello.com/p/spent-estimate-card-comment-format.html#resetsynccommand' target='_blank'>resetsync</a>)",
           angle: 180,
           distance: 0,
           size: 200,
           bSEOnly: true,
           bEstOnly: true
       },
        {
            id: 30,
            selector: ".agile-card-now-estimate-header",
            text: "1ˢᵗ estimates<br>appear also in reports<br>to compare at the board/user/date level.",
            angle: 180,
            distance: 0,
            size: 200,
            bSEOnly: true,
            bEstOnly: true
        },
    
       {
           id: 31,
           selector: "#agile_timer",
           text: "<b>Card Timer</b><br><br>Start, Pause or Stop a timer.<br><br>",
           angle: (180 + 45),
           distance: 0,
           size: 150,
           bSEOnly: true
       }
       ,

        {
            id: 32,
            selector: "#agile_timer",
            text: "<br>Once started,<br>the timer also shows in the Chrome Plus menu <br><br><a style='color:white;' href='https://www.youtube.com/watch?v=gbAZXtaRi5o' target='_blank'>can\'t see the Plus menu?</a><br>",
            angle: (180 + 45),
            distance: 0,
            size: 200,
            bScrollToView: false,
            bSEOnly: true
        }
       ,

       {
           id: 33,
           selector: "#agile_timer",
           text: "Once paused<br>it pre-fills <b>S</b>pent<br>in the card S/E bar.<br><br>It wont show in reports<br>until you 'Enter' the s/e row.",
           angle: (180 + 45),
           distance: 0,
           size: 200,
           bSEOnly: true
       }
       ,

       {
           id: 34,
           selector: ".agile_spent_box_input",
           text: "The timer pre-fills <b>S</b>pent here.<br><br>Enter it right away or keep starting/pausing the timer.",
           angle: 180-45,
           distance: 0,
           size: 200,
           bSEOnly: true
       },

        {
            id: 35,
            selector: ".agile_spent_box_input",
            text: "If you forgot<br>to start a timer, type here the Spent so far and start the timer<br>to start at that value.<br>",
            angle: 180 - 45,
            distance: 0,
            size: 200,
            bSEOnly: true
        },

         {
             id: 36,
             selector: ".agile_spent_box_input",
             text: "Also,<br>if you type Spent here once the timer is running, pausing the timer will add to it.",
             angle: 180 - 45,
             distance: 0,
             size: 200,
             bSEOnly: true
         },

         {
             id: 37,
             selector: "#plusCardCommentEnterButton",
             text: "Once a timer pre-fills Spent,<br>you need to Enter it.",
             angle: 180 - 45,
             distance: 0,
             size: 200,
             bSEOnly: true
         },
        {
            id: 38,
            selector: "#plusCardCommentEnterButton",
            text: "If you dont enter it,<br>Plus will remember your Draft row and remind you next time you open the card from the same computer.",
            angle: 180 - 45,
            distance: 0,
            size: 200,
            bSEOnly: true
        },
    {
        id: 39,
        selector: ".agile_AddSELink",
        text: "Read the<br>full help anytime.<br><br>Please <A href='http://www.plusfortrello.com/p/donations.html' target='_blank'>donate</A> <span style='font-size:230%'>☺</span>",
        angle: 180,
        distance: 0,
        size: 150,
        bEndTour:true
    }
    // id: 40 taken already above
    ];

    startTourFlow(flow, "card", true);
    refreshCardTableStats(); //show hiddden fields
    showCurrentBubble();
}

function handleBoardTour() {
    var boardCur = getCurrentBoard();
    if (boardCur == null)
        return;

        var flow = [
        {
            id: 1,
            selector: ".agile_total_box.agile_spent_box",
            text: "Total<br><b>S</b>pent, <b>E</b>stimate and <b>R</b>emaining.<br><br>Mouse-over<br>for <b>% complete.</b><br><br>Only shows in boards with non-zero S/E",
            angle: 180+45,
            distance: 0,
            size: 200,
            bSEOnly: true
        },

        {
            id: 2,
            selector: ".agile_plus_filter_span",
            text: "Check to<br>sum only filtered cards.<br><br>Only shows<br>when you have filtered cards using the sidebar or 'Less'",
            angle: 180 + 45,
            distance: 0,
            size: 200,
            bSEOnly: true
        },
        {
            id: 7,
            selector: "#agile_globalkeywordlist",
            text: "<br><a style='color:white;' href='http://www.plusfortrello.com/p/board-dimensions.html' target='_blank'>Board Dimensions</a><br><br>",
            angle: 180 + 45,
            distance: 0,
            size: 150,
            bSEOnly: true
        },
         {
             id: 3,
             selector: ".agile_plus_report_link",
             text: "Board<br>Report",
             angle: 180 + 45,
             distance: 0,
             size: 100
         },
          {
              id: 4,
              selector: ".agile_plus_burndown_link",
              text: "Board<br>Burndown",
              angle: 180 + 45,
              distance: 0,
              size: 100,
              bSEOnly: true,
              bEstOnly: true
          },
           {
               id: 5,
               selector: ".agile_listboard_header",
               text: "<br>Card totals per list.<br><br>Mouse-over<br>to view <b>% complete</b> and <b>R</b><br><br><br>",
               angle: -(180+45),
               distance: 0,
               size: 200,
               noFocus: true,
               bSEOnly: true
           },
           {
               id: 6,
               selector: ".list-card-details .badges",
               text: "Total card S/E<br>by all team users.<br><br><b>Click on a card</b><br>to continue the tour<br><br>",
               angle: -(180 + 45),
               distance: 0,
               size: 200,
               noFocus: true
           }
           //id:7 taken

        ];
        updateCards(boardCur, null, true); //show hiddden fields
        setTimeout(function () {
        startTourFlow(flow, "board", true);
        showCurrentBubble();
        }, 500);
}

function stopTour() {
    g_tour.name = "";
    var boardCur = getCurrentBoard();
    if (boardCur != null)
        updateCards(boardCur, null, true);
    refreshCardTableStats();
    $(document).unbind("keydown.tourPlusArrows");
}

function handleTourStart(bFromClick) {
    if (hasLiveBubbles()) {
        removeAllGrumbleBubbles();
    }

    if (Help.isVisible()) {
        //retry as timing issues might cause this
        setTimeout(function () {
            if (Help.isVisible())
                sendDesktopNotification("Close Plus help to run the tour.", 8000);
            else
                handleTourStart(bFromClick);
        }, 2000); 
        return;
    }
    if (!g_bShowHomePlusSections && !g_bNoSE) {
        var seHeader = $("#headerSEActivities");
        if (seHeader.length != 0)
            seHeader.click();
    }

    g_tour.bAutoShowTour = true;
    setTimeout(function () {
        var url = window.location.href.toLowerCase();

        if (url.indexOf("https://trello.com/c/") == 0)
            handleCardTour();
        else if (url.indexOf("https://trello.com/b/") == 0)
            handleBoardTour();
        else if (bAtTrelloHome())
            handleHomeTour();
        else if (bFromClick) {
            sendDesktopNotification("Go to trello.com to start the tour.", 8000);
            return;
        }
        //msNow: the bubble code has a timing bug when quickly showing next bubble it can get out of sync with its
        //internal bubble array and leave bubbles floating arround.
        //its easy to repro using arrow keys by just keeping the keystroke down, thus ignore repeating keys
        var msNow = Date.now();
        var cc = 0;
        $(document).bind("keydown.tourPlusArrows", function (event) {
            function isRepeating() {
                return (event.originalEvent && event.originalEvent.repeat);
            }

            if (event.which == 37) {
                event.preventDefault();
                if (isRepeating())
                    return;
                showNextBubble(-1);
            }
            else if (event.which == 39) {
                event.preventDefault();
                if (isRepeating())
                    return;
                showNextBubble(1, event.shiftKey);
            }
            });
    }, 0);
}

var g_bOutputTourFlow = false; //for developer
var g_regexDoubleQuotes = /"/g;

function startTourFlow(flow, name, bPaused) {
    //review zig translations https://docs.google.com/spreadsheets/d/1pB7XSAFM8MjE4HpxX7LQ4rrfrlCm9Yd9euvSsbd7sVY/edit
    if (g_bOutputTourFlow) {
        var log = "";
        flow.forEach(function (step) {
            var text = step.text;
            if (text.indexOf('"') >= 0)
                text = replaceString(text, g_regexDoubleQuotes, '""'); //escape any existing double quotes.
            log = log + (log?"\r\n":"") + '"'+step.size+'"\t"'+ step.id + '"\t"' + text + '"';
        });
        console.log(log);
    }
    bPaused = bPaused || false;

    if (g_language != "en")
        flow = translateTour(flow, name, g_language);
    if (g_tour.name != name) {
        g_tour.name = name;
        g_tour.flow = flow;
        g_tour.index = g_tour.mapFlowState[name] || 0;
        if (g_tour.index >= g_tour.flow.length) {
            //can happen if tour is paused, and language changed to one with less bubbles)
            g_tour.index = g_tour.flow.length - 1;
        }
    }

    if (!bPaused)
        showCurrentBubble();
}

function showNextBubble(delta,bLast) {
    delta = delta || 1; //-1 or 1

    if (delta == 1) {
        if (bLast) {
            g_tour.index = g_tour.flow.length - 1;
            showCurrentBubble(delta);
        }
        else if (g_tour.index < g_tour.flow.length - 1) {
            g_tour.index++;
            showCurrentBubble(delta);
        }
    }
    else if (delta == -1) {
        if (g_tour.index > 0) {
            g_tour.index--;
            showCurrentBubble(delta);
        }
    }
}

function showCurrentBubble(delta) {
    delta = delta || 1;
    assert(g_tour.flow.length > 0);
    if (g_tour.index >= g_tour.flow.length) {
        //can happen if tour is paused, and language changed to one with less bubbles)
        g_tour.index = g_tour.flow.length - 1;
    }
    var step = g_tour.flow[g_tour.index];
    g_tour.mapFlowState[g_tour.name] = g_tour.index;
    showBubbleFromStep(step, g_tour.index == 0, g_tour.index == g_tour.flow.length - 1,delta);
}

function showBubbleFromStep(step, bFirst, bLast, delta, bNoClose) {
    //delta != 0 means its on a tour
    g_bTallLines = (g_wideLag[g_language] == true);
    removeAllGrumbleBubbles(true);

    //timeout in case the grumble code doesnt finish right away
    setTimeout(function () {
        if ((step.bHideOnTrelloSync && g_bEnableTrelloSync) || (g_bNoSE && step.bSEOnly) || (g_bNoEst && step.bEstOnly)) {
            showNextBubble(delta);
            return;
        }

        var textStep = step.text;
        if (step.addText) {
            var textNotify = step.addText();
            if (textNotify)
                sendDesktopNotification(textNotify,6000); //review zig: not translated
        }
        var text = '<span class="agile_ballonBody' + (step.bNoTranslate?' notranslate':'') + '">' + textStep + '<div style="padding-top:1em">';
        if (!bFirst)
            text = text + '<span title="Previous tip" style="display:inline-block" class="agile_bubbleArrow agile_bubbleArrowLeft agile_rotated">&#10140;</span>';

        var szClassClose = "agile_bubbleClose";
        if (!bFirst && !bLast)
            szClassClose = szClassClose + " agile_bubbleClose_bottom";
        if (!bNoClose)
            text = text + '<span style="display:inline-block" title="Close" class="'+szClassClose+'">&#10006;</span>';

        if (!bLast)
            text = text + '<span style="display:inline-block" title="Next tip" class="agile_bubbleArrow agile_bubbleArrowRight">&#10140;</span>';
        text = text + '</div></span>';
        var distance = (step.distance === undefined ? 30 : step.distance);
        var size = (step.size === undefined ? 50 : step.size);
        var elemTarget = (typeof (step.selector) == "string" ? $(step.selector) : step.selector);

        if (step.selectorAlt && (elemTarget.length == 0 || !(elemTarget.eq(0).is(":visible"))))
            elemTarget = $(step.selectorAlt);

        if (elemTarget.length != 0 && elemTarget.hasClass("select2-hidden-accessible"))
            elemTarget = elemTarget.next();

        if (elemTarget.length == 0 || !elemTarget.eq(0).is(":visible")) {
            showNextBubble(delta);
            return;
        }

        elemTarget = elemTarget.eq(0);
        //REVIEW zig: fix keyboard arrow on board last two steps, cause lists page to scroll horizontally
        //use focus as a way to force scrolling, certain special windows like Cards scroll in a custom way and body scrolling doesnt work.
        var elemFocus = elemTarget;
        if (step.focus)
            elemFocus = $(step.focus).eq(0);
        if (elemFocus[0].tabIndex < 0)
            elemFocus[0].tabIndex = 1000; //force it to have a tabindex otherwise focus will be noop
        elemFocus.focus();
        
        hiliteOnce(elemTarget, step.hiliteTime || 2000);
        elemTarget.grumble({
            text: text,
            angle: step.angle,
            distance: distance,
            showAfter: 0,
            size: size,
            bScrollToView: (step.bScrollToView === undefined ? true : step.bScrollToView),
                useRelativePositioning:false
        });

        setTimeout(function () {
            $(".agile_bubbleArrowRight").click(function (event) {
                showNextBubble(1,event.shiftKey);
            });

            $(".agile_bubbleArrowLeft").click(function () {
                showNextBubble(-1);
            });


            $(".agile_bubbleClose").click(function () {
                var bShowBye = false;
                if (delta != 0 && (g_tour.index != g_tour.flow.length - 1 || step.bEndTour)) {
                    g_tour.bAutoShowTour = false; //stop auto tour if bubble (other than last) is closed
                    if (!(bFirst && bLast))
                        bShowBye = true;
                }
                removeAllGrumbleBubbles();
                if (bShowBye) {
                    setTimeout(function () {
                        showSeeYaBubble();
                        setTimeout(function () {
                            removeAllGrumbleBubbles();
                        }, 3000);
                    }, 200);
                }
            });
        }, 0);
    },0);
}

