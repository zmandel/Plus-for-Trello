/**   (c) 2011 James Cryer, Huddle (www.huddle.com) 	*/
/**   http://jamescryer.github.com/grumble.js/ 		*/

/**   (c) 2011 James Cryer, Huddle (www.huddle.com) 	*/
/**   http://jamescryer.github.com/grumble.js/ 		*/


var liveBubbles = []; //review zig. for hiding all bubbles. should be done extending the jquery plugin instead of this global
var g_bTallLines = false;

function removeAllGrumbleBubbles(bDontClearTour) {
    if (bDontClearTour === undefined || !bDontClearTour) {
        stopTour();
    }

    var list = []; //use separate list in case the object callbacks delete it from liveBubbles
    liveBubbles.forEach(function (entry) {
        list.push(entry);
    });

    $.each(list, function (index, object) {
        object.grumble.bubble.clearQueue().hide();
        object.grumble.text.clearQueue().hide();
        if (object.button) object.button.clearQueue().hide();
        object.onHide();
    });
}

function hasLiveBubbles() {
    return liveBubbles.length > 0;
}

(function ($, window) {

    var defaults = {
        type: '',
        text: '',
        top: 0,
        left: 0,
        angle: 45,
        size: 50,
        distance: 50,
        template: '<div class="grumble" style="display:none;">&#160;</div>',
        textTemplate: '<div class="grumble-text" style="display:none;"><div class="outer"><div class="inner">{text}</div></div></div>',
        context: null
    };

    window.GrumbleBubble = function (options) {

        this.options = $.extend({}, defaults, options);
        this.context = $(this.options.context || $('body'));
        this.css = {};
        this.create();
    };

    window.GrumbleBubble.prototype = {

        create: function () {
            var tmpl = window.GrumbleBubble.prototype.tmpl;
            this.bubble = $(tmpl(this.options.template)).css( "background-image", "url("+chrome.extension.getURL("images/bubble-sprite.png")+")");
            this.text = $(tmpl(this.options.textTemplate, { text: this.options.text }));
            this.prepare();
        },

        /*
          the rotation is adjusted because the background image defaults to what would look like 45 degrees
          I dont like this, the code should be agnostic of the image and style
        */
        setBubbleRotation: function () {
            this.rotateDeg = this.options.angle - 45;
            if (this.rotateDeg < 0) {
                this.rotateDeg += 360;
            }
        },

        prepare: function () {
            var isAlreadyInserted = this.bubble.get(0).parentNode;

            this.setBubbleRotation();

            this.applyStyles();

            if (isAlreadyInserted !== this.context) {
                this.append();
            }

            this.rotate();
        },

        applyStyles: function () {

            this.setPosition();

            this.css.width = this.options.size;
            this.css.height = this.options.size;

            this.text
                .css(this.css)
                .addClass('grumble-text' + this.options.size);
            if (g_bTallLines) {
                this.text.addClass('grumble-textTallLines');
            }
            this.bubble
                .css(this.css)
                .addClass(this.options.type + 'grumble' + this.options.size);
            

            // remember calculated position for use by external components
            this.realLeft = this.css.left;
            this.realTop = this.css.top;
        },

        setPosition: function () {
            var ratio = this.options.angle / -360,
                xRadius = Math.cos(ratio * 2 * Math.PI),
                yRadius = Math.sin(ratio * 2 * Math.PI),
                halfSize = this.options.size / 2,
                sizeSquared = this.options.size * this.options.size,
                halfedHypotenuse = Math.sqrt(sizeSquared + sizeSquared) / 2,
                top = (this.options.top + halfSize) - xRadius * (this.options.distance + halfedHypotenuse),
                left = (this.options.left - halfSize) - yRadius * (this.options.distance + halfedHypotenuse);

            this.css.top = top - this.options.size;
            this.css.left = left;
        },

        append: function () {
            var body = this.context;
            this.bubble.appendTo(body);
            this.text.appendTo(body);
        },

        rotate: function () {
                this.cssRotate();
        },

        cssRotate: function () {
            this.bubble.css({
                '-moz-transform': 'rotate(' + this.rotateDeg + 'deg)',
                '-webkit-transform': 'rotate(' + this.rotateDeg + 'deg)',
                '-o-transform': 'rotate(' + this.rotateDeg + 'deg)',
                'transform': 'rotate(' + this.rotateDeg + 'deg)',
                '-webkit-transform-origin-x': Math.floor(this.css.width/2)+ 'px',
                '-webkit-transform-origin-y': Math.floor(this.css.height / 2) + 'px'
            });
        },

        adjust: function (options) {
            $.extend(this.options, options);
            this.prepare();
        },

        tmpl: function (template, obj, escapeContent) {
            for (var key in obj) {
                if (obj[key] === null) obj[key] = '';
                if (typeof (obj[key]) === 'object' && obj[key].length) { obj[key] = obj[key].join(', '); }
                template = template.replace(new RegExp('{' + key + '}', 'g'), escapeContent ? escape(obj[key]) : obj[key]);
            }
            return template;
        }

    };
}($, window));


(function ($, Bubble) {

	// $.fn.grumble.defaults references this object. $.fn.grumble.defaults should be used for extension
    var defaults = {
        text: '', // Accepts html
        angle: 45, // 0-360
        size: 50, // Default size
        sizeRange: [50, 100, 150, 200], // Depending on the amount of text, one of these sizes (px) will be used
        distance: 0,
        type: '', // this string is appended to the bubble CSS classname
        useRelativePositioning: false, // will position relative to the document by default
        showAfter: 0,
        hideAfter: false,
        hideOnClick: false,
        hasHideButton: false,
        bScrollToView: true,
        buttonTemplate: '<div class="grumble-button" style="display:none" title="{hideText}">x</div>',
        buttonHideText: 'Hide',
        onHide: function () { },
        onShow: function () { },
        onBeginHide: function () { }
    };
    liveBubbles = [];
	var msieOld = navigator.appName === 'Microsoft Internet Explorer' && window.document.documentMode < 10;

    $.fn.grumble = function (settings, adjustments) {

		if( typeof settings === 'string' ){
			this.trigger({type:settings+'.bubble', adjustments: adjustments});
			return this;
		}

		return this.each(function () {
		    var $me = $(this);
		    checkIfInView($me);
            var	options = $.extend({}, $.fn.grumble.defaults, settings, $me.data('grumble') || {}),
				size = calculateTextHeight(options.size, options.sizeRange, options.text),
				grumble,
				button,
				_private,
				offset,
				context;

			if( options.useRelativePositioning ) {
				context = $me.offsetParent();
			}

			offset = getOffsets($me, context,options.angle);

			options.top = offset.top;
			options.left = offset.left;

			if($.data(this, 'hazGrumble')){
				$me.grumble('adjust', settings);
				$me.grumble('show');
				return true;
			} else {
				$.data(this, 'hazGrumble', true);
			}

			_private = {

				init: function(){
					grumble = new Bubble({
						text: options.text,
						top: options.top,
						left: options.left,
						angle: options.angle,
						size: size,
						distance: options.distance,
						type: options.type,
						context: context // could be undefined
					});

					if(options.hasHideButton) this.addButton();

					liveBubbles.push({
						grumble: grumble,
						button: button,
						onHide: function(){
							_private.isVisible = false;
							$(document.body).unbind('click.bubble');
							_private.doOnBeginHideCallback();
							_private.doOnHideCallback();
						}
					});

					this.showBubble();
					this.prepareEvents();
					
				},

				addButton: function(){
					var tmpl = Bubble.prototype.tmpl;
				
					// I think this code smells.. Responsibility for the view should be in the same place.
					// Could possibly move this into bubble.js
					// or extract all view logic into a third component
					button = $( tmpl(options.buttonTemplate,{hideText:options.buttonHideText}))
						.css({
							left:grumble.realLeft+size-10,
							top: grumble.realTop + size - 10,

						})
						.insertAfter(grumble.text);
				},

				rePositionButton: function(){
					if( !button ) return;

					button
						.css({
							left:grumble.realLeft+size-10,
							top:grumble.realTop+size-10
						});
				},

				createFxQueue : function(){
					grumble.bubble.queue('fx');
					grumble.text.queue('fx');
					grumble.bubble.delay(options.showAfter);
					grumble.text.delay(options.showAfter);
					if (button) button.delay(options.showAfter);
				},

				showBubble: function(){
					if(_private.isVisible == true) return;
					
					if(options.showAfter) _private.createFxQueue();
					
					if(msieOld){
						grumble.bubble.queue('fx',function(next){
							grumble.bubble.show();
							next();
						});
						grumble.text.queue('fx',function(next){
							grumble.text.show();
							next();
						});
						if(button){
							button.queue('fx',function(next){
								button.show();
								next();
							});
						}
					} else {
						grumble.bubble.fadeTo('fast',1);
						grumble.text.fadeTo('fast',1);
						if(button) button.fadeTo('fast',1);
					}

					grumble.bubble.queue('fx',function(next){
						_private.isVisible = true;
						if(options.hideOnClick || options.hasHideButton) _private.hideOnClick();
						_private.doOnShowCallback();
						checkIfInView(grumble.bubble);
                        /*
						if (!options.bScrollToView)
						    $me.focus();
                        else
						    checkIfInView(grumble.bubble);
                            */
						
						next();
					});
					
					if(options.hideAfter) _private.hideBubble();
				},

				hideBubble: function(){
					//if(_private.isVisible == false) return;

					grumble.bubble.delay(options.hideAfter);
					grumble.text.delay(options.hideAfter);

					grumble.bubble.queue('fx',function(next){
						_private.doOnBeginHideCallback();
						next();
					});

					if(msieOld){
						grumble.bubble.queue('fx',function(next){
							grumble.bubble.hide();
							next();
						});
						grumble.bubble.queue('fx',function(next){
							grumble.text.hide();
							next();
						});
						if(button){
							button.queue('fx',function(next){
								button.hide();
								next();
							});
						}
					} else {
						grumble.bubble.fadeOut();
						grumble.text.fadeOut();
						if (button) button.fadeOut();
					}

					grumble.bubble.queue('fx',function(next){
						_private.isVisible = false;
						_private.doOnHideCallback();
						next();
					});
				},

				doOnBeginHideCallback: function(){
					options.onBeginHide(grumble, button);
				},

				doOnHideCallback: function(){
				    options.onHide(grumble, button);
				    var thisLocal = this;
				    setTimeout(function () {
				        thisLocal.removeBubble();
				    }, 0);
				    

				},

				doOnShowCallback: function(){
					options.onShow(grumble, button);
				},

				hideOnClick: function(){
					setTimeout(function(){
						var click = function(){
							_private.hideBubble(grumble, button);
							$(document.body).unbind('click.bubble', click);
						};
						$(document.body).bind('click.bubble',click);
					}, 1000);
				},

				removeBubble: function() {
				    grumble.bubble.hide().remove();
				    grumble.text.hide().remove();
				    if (button) button.hide().remove();

				    // remove from liveBubbles array :
				    var len = liveBubbles.length;
				    for (var i = 0; i < len; i++) {
				        if (grumble === liveBubbles[i].grumble) {
				            liveBubbles.splice(i, 1);
				            break;
				        }
				    }
				    $me.removeData("hazGrumble");
				},

				prepareEvents: function(){
					$(window).bind('resize.bubble', function(){
						var offset;

						offset = getOffsets($me, context,grumble.angle);

						grumble.adjust({
							top: offset.top,
							left: offset.left
						});

						_private.rePositionButton();
					});

					$me.bind('hide.bubble',  function(event){
						_private.hideBubble(grumble, button);
					});
					
					$me.bind('adjust.bubble',  function(event){
						if(event.adjustments && typeof event.adjustments === 'object'){
							grumble.adjust(event.adjustments);
						}
					});
					
					$me.bind('show.bubble',  function(event){
						_private.showBubble(grumble, button);
					});
					
					$me.bind('delete.bubble', function (event) {
					    removeBubble();
					});
				}
			};
			_private.init();
        });
	};

	$.fn.grumble.defaults = defaults;

	$(document).bind('keyup.bubble',function(event){ // Pressing the escape key will stop all bubbles
	    if (event.keyCode === 27) {
	        removeAllGrumbleBubbles();
		}
	});

	function getOffsets($me, context,angle){
		var offset,
			marginTop;

		if( context ) {
			marginTop = Number($me.css('margin-top').replace("px", "")) || 0;
			offset = $me.position();
			offset.top += marginTop + context.scrollTop();
		} else {
			offset = $me.offset();
		}

		if (angle > 80 && angle < 100) {
		    offset.top += $me.height()/2;
		    offset.left += $me.width();
		}
		else if (angle > 260 && angle < 280) {
		    offset.top += $me.height() / 2;
		}
		else {
		    offset.top += $me.height();
		    offset.left += $me.width() / 2;
		}
		return offset;
	}

	function calculateTextHeight(defaultSize, range, text, bFindOptimal) {
		var el = $('<div style="position:absolute;visibility:hidden;width:'+defaultSize+'px;">'+text+'</div>')
					.appendTo($(document.body)),
			height = el.outerHeight()*2+(defaultSize*0.20),/*the 20% is approx padding: could be more clever*/
			index = $.inArray(defaultSize, range);

		el.remove();

		if ((bFindOptimal || defaultSize==0) && height >= defaultSize && range[++index]) {
			return calculateTextHeight(range[index], range, text,true); //WARNING: RECURSION!
		}

		return defaultSize;
	}

}(jQuery, GrumbleBubble));


function checkIfInView(element) {
    var offset = element.offset().top - $(window).scrollTop();

    if (offset + element.height() > window.innerHeight || offset<0) {
        // Not in view so scroll to it
        $('html,body').animate({ scrollTop: offset-50 }, 300);
        return false;
    }
    return true;
}