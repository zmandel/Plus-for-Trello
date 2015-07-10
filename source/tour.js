/* step
 *
 *  selector:   jquery selector of element. .eq(0) will be used 
 *  text:       html text to show
 *  angle:      clockwise. 0 points down
 *  distance:   from element to mouth of bubble
 *  size:       one of 50,100,150,200. 0 tries to pick automatically
 *
 **/

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
        text: "Start<br>the Plus tour<br>from here anytime!",
        angle: 180,
        distance: 0,
        size: 150
    };
    showBubbleFromStep(step, true, true,0);
}

function handleHomeTour() {
    var flow = [
        {
            selector: ".agile-spent-icon-header",
            text: "Click <b>?</b> anytime for<br>complete help.<br><br>If you track <b>E</b>stimation changes or manage a team make sure to read all help",
            angle: 180,
            distance: 0,
            size: 200
        },

        {
            selector: ".agile-spent-icon-header",
            text: "Use the arrows<br>here or on your<br>keyboard to<br>navigate this tour",
            angle: 180,
            distance: 0,
            size: 150
        },

        {
            selector: "#urlUser",
            text: "<br>This report<br>shows your total daily <b>S</b>pent breakdown<br>",
            angle: 180,
            distance: 0,
            size: 150
        },
         {
             selector: "#spentRecentWeeks",
             text: "<br>Change<br>the report view by clicking on the week<br>",
             angle: 180,
             distance: 0,
             size: 150
         },
         {
             selector: "#toggleAll",
             text: "<br>Toggles More-Less<br><br>Click <b>Less</b> to hide old boards and cards.<br>Click <b>More</b> to show all.<br><br>Make sure Trello <b>card aging</b> is enabled for the board",
             angle: 180,
             distance: 0,
             size: 200
         },
        {
            selector: ".icon-lg.window-module-title-icon.icon-star +",
            selectorAlt: ".icon-lg.window-module-title-icon.icon-member +", //if no stared boards, will be hidden
            text: "<br><br>Recently visited boards<br>show <b>S</b>pent and <b>E</b>stimate<br>from the <b>last time</b> you entered the board<br><br>",
            angle: 180-45,
            distance: 0,
            size: 200
        },

        {
            selector: "#headerSEActivities",
            text: "This section shows <br>Spent charts, your recent S/E and cards with Remaining balance.<br><br>Click to show or hide.",
            angle: 90,
            distance: 0,
            size: 200
        },

         {
             selector: ".classid_spent_week_users",
             text: "<br><br>Click on a chart title to zoom it full-window.<br><br>Click on any chart bar to drill-down.",
             getText: function () {
                 if (g_cRowsWeekByUser > 0)
                     return this.text;
                 return this.text + "<br>There is no data to chart this week yet.";
             },
             angle: 90,
             distance: 0,
             size: 200
         },

          {
              selector: ".classid_spent_recent_cards",
              text: "<br>Your last ten<br>card S/E entries.<br><br>Click one to open<br>the card<br><br>",
              angle: 135, //considers case where there are no fav. boards
              distance: 20,
              size: 150
          },
            {
                selector: ".classid_spent_pending_cards",
                text: "Cards with<br><b>S</b>pent not equal <b>E</b>stimate<br>show here.<br><br>Cards should not have S bigger than E, those  are painted pink",
                angle: 135, //considers case where there are no fav. boards
                distance: 20,
                size: 200
            },
            {
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
    elem.click(function () {
        handleTourStart(true);
    });
    if (g_tour.bAutoShowTour)
        setTimeout(function () { handleTourStart(false); }, 2500);
}

function handleCardTour() {
    var flow = [
    {
        selector: ".agile-spent-icon-header_cardwindow",
        text: "Help<br>is here too.<br><br>Use keyboard arrows<br>to navigate the tour.",
        angle: 180,
        distance: 0,
        size: 150
    },

       {
           selector: "#container_agile_checkRecurringCard",
           focus: "#agile_checkRecurringCard",
           text: "check 'Recurring'<br>so cards (like weekly meetings) will not have a '1ˢᵗ estimate' and wont inflate changed estimate reports.",
           angle: 180,
           distance: 0,
           size: 200
       },

    {
        selector: ".agile_hashtags_list",
        focus: ".agile_hashtags_list",
        text: "Add #tags<br>to cards and later search them from reports.",
        angle: 180,
        distance: 0,
        size: 150
    },

    {
        selector: ".js-card-title",
        focus: ".js-card-title",
        text: "You can also change the card title directly to manage #tags/recurring.",
        angle: 180,
        distance: 0,
        size: 150
    },

    {
        selector: ".agile-se-bar-entry",
        focus:".agile_days_box_input",
        text: "<b>card S/E bar</b><br> here you enter<br> <b>S</b>pent and <b>E</b>stimate rows.<br><br>Each <b>S/E row</b> entered shows as a card comment and in reports.",
        angle: 90,
        distance: 0,
        size: 200
    },
    {
        selector: ".agile-se-bar-entry",
        focus: ".agile_days_box_input",
        text: "<b>S</b>pent and <b>E</b>stimate<br>units default to 'hours'.<br>If you prefer minutes or days, change it from Preferences in Plus help before entering S/E.",
        angle: 90,
        distance: 0,
        size: 200
    },
      {
          selector: ".agile-se-bar-entry",
          focus: ".agile_days_box_input",
          text: "To track changed estimates, the first <b>S/E row</b><br>entered per user<br>needs an initial <b>E</b>stimate.",
          angle: 90,
          distance: 0,
          size: 200
      },
      {
          selector: ".agile-se-bar-entry",
          focus: ".agile_days_box_input",
          text: "That first S/E row<br>entered per user is<br>their <b>1ˢᵗ Estimate</b><br>and cannot be modified.<br><br>Useful to detect<br>and compare changed estimates using reports.<br>",
          angle: 90,
          distance: 0,
          size: 200
      },
    {
        selector: ".agile-se-bar-entry",
        focus: ".agile_days_box_input",
        text: "If you never want to track changed estimates tell Plus in Preferences to 'Allow negative <b>R</b>emaining'",
        angle: 90,
        distance: 0,
        size: 200
    },
    {
        selector: ".agile-se-bar-entry",
        focus: ".agile_days_box_input",
        text: "<b>Spend</b> units by<br>entering more 'S/E rows' with positive <b>S</b>pend and<br>empty <b>E</b>stimate.<br><br>",
        angle: 90,
        distance: 0,
        size: 200
    },

        {
            selector: ".agile-se-bar-entry",
            focus: ".agile_days_box_input",
            text: "You may<br>type both S and E<br>in the same row.<br><br>An empty cell means zero.",
            angle: 90,
            distance: 0,
            size: 200
        },

     {
         selector: ".agile-se-bar-entry",
         focus: ".agile_days_box_input",
         text: "<b>S and E<br>are cummulative</b>.<br><br>Their current sum per user is shown in the table above.<br><br>See the example in Plus help.",
         angle: 90,
         distance: 0,
         size: 200
     },
    {
        selector: ".agile-se-bar-entry",
        focus: ".agile_days_box_input",
        text: "The best practice is to<br>enter <b>S</b>pent until <b>R</b> is zero<br>(<b>S sum</b> equals <b>E sum</b>).",
        angle: 90,
        distance: 0,
        size: 200
    },
    {
        selector: ".agile-se-bar-entry",
        focus: ".agile_days_box_input",
        text: "If your Spent would<br>go over the estimate<br>enter more <b>E</b> so <b>R</b><br>doesn't go negative.<br><br>The Plus bar defaults <b>E</b><br>automatically in that case.",
        angle: 90,
        distance: 0,
        size: 200
    },
        {
            selector: ".agile-se-bar-entry",
            focus: ".agile_days_box_input",
            text: "Likewise<br>if you finish a card and<br>still has <b>R</b>emaining,<br>reduce your Estimate<br>(enter negative <b>E</b>)<br>so <b>R</b> gets to zero.<br><br>",
            angle: 90,
            distance: 0,
            size: 200
        },
        {
            selector: ".agile-card-seByUserModify",
            text: "Its easier<br>to make those modifications from here so it does that math for you.",
            angle: 180,
            distance: 0,
            size: 200
        },
        {
            selector: ".agile-card-seByUserModify",
            text: "For example,<br>if the card is done but there is still <b>R</b>, just edit here <b>E sum</b> to be equal to <b>S sum</b>.",
            angle: 180,
            distance: 0,
            size: 200
        },

        {
            selector: ".agile-card-seByUserModify",
            text: "Always use this or<br>the S/E bar to modify.<br><br><b>Do not delete the generated card comment</b><br><br><a style='color:white;' href='http://www.plusfortrello.com/p/faq.html' target='_blank'>oups too late</a>",
            angle: 180,
            distance: 0,
            size: 200
        },

        {
            selector: "#plusCardCommentUsers",
            focus: "#plusCardCommentUsers",
            text: "To enter an <b>S/E row</b><br>pick the user<br>(you by default).<br>If using multiple keywords, you can also pick one from another list.",
            angle: 180,
            distance: 0,
            size: 200
        },
     {
         selector: ".agile_days_box_input",
         focus: ".agile_days_box_input",
         text: "then pick the date it happened,<br><br>'now', -3d for '3 days ago' etc.",
         angle: 180,
         distance: 0,
         size: 200
     },
      {
          selector: ".agile_spent_box_input",
          focus: ".agile_spent_box_input",
          text: "type <b>Spent</b><br><br>Also accepts<br>hours<b>:</b>minutes format.<br><br>Leave blank to enter only an <b>E</b>stimate.<br>",
          angle: 180,
          distance: 0,
          size: 200
      },
           {
               selector: ".agile_estimation_box_input",
               focus: ".agile_estimation_box_input",
               text: "type <b>Estimate</b><br><br>Leave blank<br>to enter only <b>S</b>pent<br><br>The first row entered will be the 1ˢᵗ estimate (<b>E 1ˢᵗ</b>) in the table above.",
               angle: 180,
               distance: 0,
               size: 200
           },

           {
               selector: ".agile_comment_box_input",
               focus: ".agile_comment_box_input",
               text: "Type an<br>optional note here and press the Enter key or button.",
               angle: 180,
               distance: 0,
               size: 150
           },
               {
                   selector: ".agile-se-bar-entry",
                   focus: ".agile_days_box_input",
                   text: "For advanced S/E entry see<br><a style='color:white;' href='http://plusfortrello.blogspot.com/2014/12/plus-for-trello-se-card-comment-format.html' target='_blank'>S/E comment format</a>.",
                   angle: 90,
                   distance: 0,
                   size: 200
               },
       {
           selector: ".agile_card_report_link",
           focus: ".agile_card_report_link",
           text: "Once there are<br>S/E rows entered, this report shows a breakdown<br>per user.<br><br>Click this to drill-down on the card.",
           angle: 180,
           distance: 0,
           size: 200
       },

       {
           selector: ".agile-card-statrow-data",
           focus: ".agile-card-statrow-data",
           text: "Users with positive <b>R</b><br>have remaining work.<br><br>Mouse-over the user<br>to see their last S/E date.<br><br>Click the user to drill-down.<br>",
           angle: 180,
           distance: 0,
           size: 200
       },
       
       {
           selector: ".agile-card-first-estimate-header",
           focus: ".agile-card-first-estimate-header",
           text: "<b>1ˢᵗ E</b>stimate per user.<br><br>Once entered, the 1ˢᵗ estimate cannot be modified.",
           angle: 180,
           distance: 0,
           size: 200
       },
        {
            selector: ".agile-card-first-estimate-header",
            focus: ".agile-card-first-estimate-header",
            text: "1ˢᵗ estimates<br>appear also in reports<br>to compare at the board/user/date level.",
            angle: 180,
            distance: 0,
            size: 200
        },
        {
            selector: ".agile-card-now-estimate-header",
            focus: ".agile-card-now-estimate-header",
            text: "<br><b>Total estimate</b><br>per user to compare with E 1ˢᵗ",
            angle: 180,
            distance: 0,
            size: 150
        },
       
    
       {
           selector: "#agile_timer",
           focus: "#agile_timer",
           text: "<b>Card Timer</b><br><br>Start, Pause or Stop a timer.<br><br>",
           angle: (180 + 45),
           distance: 0,
           size: 150
       }
       ,

        {
            selector: "#agile_timer",
            focus: "#agile_timer",
            text: "<br>Once started,<br>the timer also shows in the Chrome Plus menu <br><br><a style='color:white;' href='https://www.youtube.com/watch?v=gbAZXtaRi5o' target='_blank'>can\'t see the Plus menu?</a><br>",
            angle: (180 + 45),
            distance: 0,
            size: 200,
            bScrollToView: false
        }
       ,

       {
           selector: "#agile_timer",
           focus: "#agile_timer",
           text: "Once paused<br>it pre-fills <b>S</b>pent<br>in the card S/E bar.<br><br>It wont show in reports<br>until you 'Enter' the s/e row.",
           angle: (180 + 45),
           distance: 0,
           size: 200
       }
       ,

       {
           selector: ".agile_spent_box_input",
           focus: ".agile_spent_box_input",
           text: "The timer pre-fills <b>S</b>pent here.<br><br>Enter it right away or keep starting/pausing the timer.",
           angle: 180-45,
           distance: 0,
           size: 200
       },

        {
            selector: ".agile_spent_box_input",
            focus: ".agile_spent_box_input",
            text: "If you forgot<br>to start a timer, type here the Spent so far and start the timer<br>to start at that value.<br>",
            angle: 180 - 45,
            distance: 0,
            size: 200
        },

         {
             selector: ".agile_spent_box_input",
             focus: ".agile_spent_box_input",
             text: "Also,<br>if you type Spent here once the timer is running, pausing the timer will add to it.",
             angle: 180 - 45,
             distance: 0,
             size: 200
         },

         {
             selector: "#plusCardCommentEnterButton",
             focus: "#plusCardCommentEnterButton",
             text: "Once a timer pre-fills Spent,<br>you need to Enter it.",
             angle: 180 - 45,
             distance: 0,
             size: 200
         },
        {
            selector: "#plusCardCommentEnterButton",
            focus: "#plusCardCommentEnterButton",
            text: "If you dont enter it,<br>Plus will remember your Draft row and remind you next time you open the card from the same computer.",
            angle: 180 - 45,
            distance: 0,
            size: 200
        },
    {
        selector: ".agile-spent-icon-header_cardwindow",
        focus: ".agile-spent-icon-header_cardwindow",
        text: "Read the<br>full help anytime.<br><br>Please <A href='http://www.plusfortrello.com/p/donations.html' target='_blank'>donate</A> <span style='font-size:230%'>☺</span>",
        angle: 180,
        distance: 0,
        size: 150,
        bEndTour:true
    }
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
            selector: ".agile_total_box.agile_spent_box",
            text: "Total<br><b>S</b>pent, <b>E</b>stimate and <b>R</b>emaining.<br><br>Mouse-over<br>for <b>% complete.</b><br><br><p class=agile_bubble_helptext'>Only shows in boards with non-zero S/E</p>",
            angle: 180+45,
            distance: 0,
            size: 200
        },

        {
            selector: ".agile_plus_filter_span",
            text: "Check to<br>sum only filtered cards.<br><br><p class=agile_bubble_helptext'>Only shows<br>when you have filtered cards using the sidebar or 'Less'</p>",
            angle: 180 + 45,
            distance: 0,
            size: 200
        },
         {
             selector: ".agile_plus_report_link",
             text: "Board<br>Report",
             angle: 180 + 45,
             distance: 0,
             size: 100
         },
          {
              selector: ".agile_plus_burndown_link",
              text: "Board<br>Burndown",
              angle: 180 + 45,
              distance: 0,
              size: 100
          },
           {
               selector: ".agile_listboard_header",
               text: "<br>Card totals per list.<br><br>Mouse-over<br>to view <b>% complete</b> and <b>R</b><br><br><br>",
               angle: -(180+45),
               distance: 0,
               size: 200
           },
           {
               selector: ".list-card-details .badges",
               text: "Total card S/E<br>by all team users.<br><br><b>Click on a card</b><br>to continue the tour<br><br>",
               angle: -(180 + 45),
               distance: 0,
               size: 200
           }

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

    if (Help.isVisible())
        sendDesktopNotification("Close Plus help to run the tour.", 5000);

    if (!g_bShowHomePlusSections) {
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


function startTourFlow(flow, name, bPaused) {
    bPaused = bPaused || false;
    if (g_tour.name != name) {
        g_tour.name = name;
        g_tour.flow = flow;
        g_tour.index = g_tour.mapFlowState[name] || 0;
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
    assert(g_tour.index < g_tour.flow.length);
    var step = g_tour.flow[g_tour.index];
    g_tour.mapFlowState[g_tour.name] = g_tour.index;
    showBubbleFromStep(step, g_tour.index == 0, g_tour.index == g_tour.flow.length - 1,delta);
}

function showBubbleFromStep(step, bFirst, bLast, delta) {
    //delta != 0 means its on a tour

    removeAllGrumbleBubbles(true);

    //timeout in case the grumble code doesnt finish right away
    setTimeout(function () {
        if (step.bHideOnTrelloSync && g_bEnableTrelloSync) {
            showNextBubble(delta);
            return;
        }
        var textStep = (step.getText ? step.getText() : step.text);
        var text = '<span class="agile_ballonBody">' + textStep + '<div style="padding-top:1em">';
        if (!bFirst)
            text = text + '<span title="Previous tip" style="display:inline-block" class="agile_bubbleArrow agile_bubbleArrowLeft agile_rotated">&#10152;</span>';

        var szClassClose = "agile_bubbleClose";
        if (!bFirst && !bLast)
            szClassClose = szClassClose + " agile_bubbleClose_bottom";
        text = text + '<span style="display:inline-block" title="Close" class="'+szClassClose+'">&#10006;</span>';

        if (!bLast)
            text = text + '<span style="display:inline-block" title="Next tip" class="agile_bubbleArrow agile_bubbleArrowRight">&#10152;</span>';
        text = text + '</div></span>';
        var distance = (step.distance === undefined ? 30 : step.distance);
        var size = (step.size === undefined ? 50 : step.size);
        var elemTarget = $(step.selector);
        if (elemTarget.length == 0) {
            showNextBubble(delta);
            return;
        }
        if (!(elemTarget.eq(0).is(":visible")) && step.selectorAlt)
            elemTarget = $(step.selectorAlt);
        
        if (elemTarget.length == 0 || !(elemTarget.eq(0).is(":visible"))) {
            showNextBubble(delta);
            return;
        }

        elemTarget = elemTarget.eq(0);

        //use focus as a way to force scrolling, certain special windows like Cards scroll in a custom way and body scrolling doesnt work.
        if (step.focus) {
            var elemFocus = $(step.focus).eq(0);
            var bRestoreTI = false;
            if (elemFocus[0].tabIndex < 0) {
                elemFocus[0].tabIndex = 1000; //force it to have a tabindex otherwise focus will be noop
            }
            $(step.focus).focus();
        }

        hiliteOnce(elemTarget, 2000);
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
                if (delta != 0 && (g_tour.index != g_tour.flow.length - 1 || step.bEndTour))
                    g_tour.bAutoShowTour=false; //stop auto tour if bubble (other than last) is closed
                removeAllGrumbleBubbles();
            });
        }, 0);
    },0);
}