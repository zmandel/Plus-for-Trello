/// <reference path="intellisense.js" />
var g_strOffline = "No connection";
var g_bLastOffline = false;

var g_syncProgress = {
    m_total: 0,
    m_totalOffline: 0,
    m_markup: "syncStatic",
    start: function () {
        this.m_total++;
        this.doMarkup("syncAnim");
    },

    end: function () {
        this.m_total--;
        if (this.m_total == 0)
            this.doMarkup("syncStatic");
    },
    
    onOffline: function () {
        var thisObj = this;
        this.m_totalOffline++;
        this.doMarkup("syncOffline");
        setTimeout(function () {
            thisObj.m_totalOffline--;
            if (thisObj.m_totalOffline == 0 && thisObj.m_total == 0)
                thisObj.doMarkup("syncStatic");
        }, 3000);
    },

    //private
    doMarkup: function (markup) {
        this.m_markup = markup;
        $("#syncButton").buttonMarkup({ icon: markup });
    },


};

function parseColonFormatSE(val, bExact) {
    assert(val.indexOf(":") >= 0);
    if (val.indexOf(".") >= 0)
        return null; //invalid

    var rg = val.split(":");
    if (rg.length != 2)
        return null; //invalid

    var h = parseInt(rg[0], 10) || 0;
    var sign = (h < 0 ? -1 : 1);
    h = Math.abs(h);
    var m = parseInt(rg[1], 10) || 0;

    var retVal = sign * (h + (m / UNITS.ColonFactor()));
    if (bExact)
        return retVal;
    return parseFixedFloat(retVal);
}


//parseFixedFloat
//round to two decimals.
//input can be string or number
//if text contains colon, will assume units:subunits format
//returns a float
function parseFixedFloat(text, bDontZeroNan, bOneDecimal) {
    var val = null;

    if (typeof text == "number")
        val = text;
    else {
        if (typeof (text) == 'string' && text.indexOf(":") >= 0) {
            val = parseColonFormatSE(text, false);
            if (val === null)
                val = 0;
        }
        else {
            val = parseFloat(text);
        }
    }
    if (isNaN(val)) {
        if (bDontZeroNan)
            return val;
        return 0;
    }
    var roundNum = (bOneDecimal ? 10 : 100);

    return Math.round(val * roundNum) / roundNum;
}

function errFromXhr(xhr) {
    var errText = "";

    if (xhr.status == 0)
        errText = g_strOffline;
    else if (xhr.statusText)
        errText = xhr.statusText;
    else if (xhr.responseText)
        errText = xhr.responseText;
    else
        errText = "error: " + xhr.status;

    console.log(errText);
    return errText;
}

function addCardCommentByApi(idCard, comment, callback, waitRetry) {
    //https://trello.com/docs/api/card/index.html
    var urlParam = "cards/" + idCard + "/actions/comments?text=" + encodeURIComponent(comment);
                //urlParam, bContext, msWaitStart, callback, bReturnErrors, waitRetry, bSkipCache, context, bReturnOnlyCachedIfExists, bDontStoreInCache, bDontRetry, bPost
    callTrelloApi(urlParam, false,    0,           callback, true,          0,         true,       null,    false,                     true,              true,       true);
}

//bReturnErrors false (default): will display error and not call callback.
//always changePane before calling this for a page
function callTrelloApi(urlParam, bContext, msWaitStart, callback, bReturnErrors, waitRetry, bSkipCache,
    context, bReturnOnlyCachedIfExists, bDontStoreInCache, bDontRetry, bPost) {
    var keyCached = "td:" + urlParam;
    var bReturnedCached = false;
    var objTransformedFirst = null;
    var cPageNavCur = g_cPageNavigations;
    if (bContext && !context)
        context = JSON.stringify(g_stateContext);

    //NOTE: negative msWaitStart means use cache only if possible and do not call trello
    function bOKContext() {
        return (!bContext || context == JSON.stringify(g_stateContext));
    
    }

    if (!bSkipCache) {
        //if there is a cache, return it, and later return again the real results
        var cached = localStorage[keyCached];
        if (cached) {
            cached = JSON.parse(cached);
            if ((msWaitStart > 250) && cached.now && (Date.now() - cached.now > 1000 * 60 * 10))
                msWaitStart = 250; //hurry up refreshing if cache is older than 10 minutes

            var objRetCached = {};
            var objSet = null;

            try {
                if (cached.b16)
                    objSet = JSON.parse(LZString.decompressFromUTF16(cached.compressed));
                else
                    objSet = JSON.parse(LZString.decompress(cached.compressed));
            } catch (e) {

            }

            if (objSet) {
                if (cached.bTransformed)
                    objRetCached.objTransformed = objSet;
                else
                    objRetCached.obj = objSet;

                objRetCached.bCached = true;
                objTransformedFirst = objRetCached;
                bReturnedCached = true;
                callback(objRetCached);
                if (bReturnOnlyCachedIfExists)
                    return; //dont make the request again
            }
        }
    }
    var objRet = { status: "unknown error", obj: [], bCached: false };
    var keyTrello = localStorage[PROP_TRELLOKEY];
    if (!keyTrello) {
        //happens if logging out while deep in the page stack, then go "back"
        objRet.status = "error: authorize the app first.";
        callback(objRet);
        return;
    }
    var url = "https://trello.com/1/" + urlParam + "&key=" + getAppKey() + "&token=" + keyTrello;
    var xhr = new XMLHttpRequest();
    var bOkCallback = false;
    xhr.onreadystatechange = function (e) {
        if (xhr.readyState == 4) {
            g_syncProgress.end();
            handleFinishRequest();

            function handleFinishRequest() {

                var bReturned = false;
                var bQuotaExceeded = (xhr.status == 429);
                g_analytics.hit({ t: "event", ec: "trelloApiCalls", ea: (bQuotaExceeded? "callRetry" : "call") }, 1000);
                g_bLastOffline = false;
                if (!bOKContext())
                    return;

                if (xhr.status == 200) {
                    try {
                        var obj = JSON.parse(xhr.responseText);
                        objRet.status = STATUS_OK;
                        objRet.obj = obj;
                        bReturned = true;
                        if (cPageNavCur != g_cPageNavigations)
                            objTransformedFirst = null; //invalidate if user navigated away since first cache return
                        var objTransformed = callback(objRet, objTransformedFirst);
                        bOkCallback = true; //covers exception from callback
                        if (!bDontStoreInCache) {
                            var cacheItem = { compressed: null, bTransformed: false, now: Date.now(), b16: true };
                            if (objTransformed) {
                                cacheItem.bTransformed = true;
                                cacheItem.compressed = LZString.compressToUTF16(JSON.stringify(objTransformed));
                            } else {
                                cacheItem.bTransformed = false;
                                cacheItem.compressed = LZString.compressToUTF16(xhr.responseText);
                            }
                            localStorage[keyCached] = JSON.stringify(cacheItem);
                        }
                    } catch (ex) {
                        objRet.status = "error: " + ex.message;
                    }
                } else {
                    if (bQuotaExceeded && !bDontRetry) {
                        var waitNew = (waitRetry || 500) * 2;
                        if (waitNew < 8001) {
                            console.log("Plus: retrying api call");
                                        //urlParam, bContext, msWaitStart, callback, bReturnErrors, waitRetry, bSkipCache, context, bReturnOnlyCachedIfExists, bDontStoreInCache, bDontRetry, bPost
                            callTrelloApi(urlParam, bContext, waitNew,     callback, bReturnErrors, waitNew,   true,       context, bReturnOnlyCachedIfExists, bDontStoreInCache, bDontRetry, bPost);
                            return;
                        }
                        else {
                            objRet.status = errFromXhr(xhr);
                        }
                    }
                    else if (xhr.status == 404) {
                        objRet.status = "error: not found\n" + errFromXhr(xhr);
                    }
                    else {
                        objRet.status = errFromXhr(xhr);
                    }
                }

                if (objRet.status == g_strOffline)
                    g_bLastOffline = true;

                if (!bReturned || !bOkCallback) {
                    if (objRet.status != STATUS_OK && !bReturnErrors) {
                        if (g_bLastOffline)
                            alertOffline();
                        else
                            alertMobile(objRet.status);
                        return;
                    }
                    if (!bReturned)
                        callback(objRet);          
                }
            }
        }
    };

    function worker() {
        if (!bOKContext())
            return;

        g_syncProgress.start();
        xhr.open(bPost? "POST" : "GET", url);
        xhr.send();
    }

    if (!bReturnedCached)
        msWaitStart = 0;
    
    if (msWaitStart > 0) {
        setTimeout(function () {
            worker();
        }, msWaitStart);
    }
    else if (msWaitStart == 0)  {
        worker();
    }
    //negative msWaitStart means we do not call worker
}

//taken from chrome extension code
function replaceBrackets(str) {
    if (typeof (str) == "string" && str.indexOf("[") < 0)
        return str;
    return str.replace(/\[/g, '*').replace(/\]/g, '*');
}
