 /// <reference path="intellisense.js" />

var g_bLoaded = false; //needed because DOMContentLoaded gets called again when we modify the page
var g_marginLabelChart = 35;
var g_heightBarUser = 30;
var g_colorRemaining = "#519B51";
var g_colorRemainingDark = "#346334";
var g_data = null;
var g_chartUser = null;
var g_dataUser = null;
var g_userTrello = null;
var g_tl = { container: null, chartBottom: null, xAxisBottom: null, redrawAnnotations: null, pointer: null };
var g_bUniqueBoard = false;
var g_TimelineColors = ["#D25656", "#6F83AD", g_colorRemaining, "black"]; //red, blue, green (spent, estimate, remaining, annotation)

var g_paramsLast = null;
function replaceUrlState(params) {
    window.history.replaceState('data', '', commonBuildUrlFromParams(params, "dashboard.html"));
    g_paramsLast = getUrlParams();
}

document.addEventListener('DOMContentLoaded', function () {
	if (g_bLoaded)
		return;
	g_bLoaded = true;
	//chrome Content Security Policy (CSP) makes us do it like this
	google.setOnLoadCallback(loadBurndown);
});


function checkHideTimelineSpark(params) {
    if (!params)
        params = getUrlParams();
    if (g_tl.chartBottom && (params["checkHideZoomArea"] || g_tl.chartBottom.height() < 12)) {
        g_tl.container.remove(g_tl.chartBottom);
        g_tl.container.remove(g_tl.xAxisBottom);
        g_tl.container.computeLayout();
        g_tl.container.redraw();
    }
}

function redrawCharts(bDontRedrawUser) {
    if (!bDontRedrawUser)
        drawChartUser();
    if (g_tl.crosshair)
        g_tl.crosshair.hide(); //could reposition (like annotations) but not worth it

    if (g_tl.projectionLine)
        g_tl.projectionLine.hide();

    if (g_tl.container) {
        //add in case it was removed by a previous resize (in checkHideTimelineSpark)
        if (g_tl.chartBottom)
            g_tl.container.add(g_tl.chartBottom, 2, 1);
        
        if (g_tl.xAxisBottom)
            g_tl.container.add(g_tl.xAxisBottom, 3, 1);
        
        var elemContainerTL = $("#timeline");
        var position = elemContainerTL.offset();
        var heightBody = window.innerHeight;
        var height = Math.max(heightBody - position.top, Math.max(heightBody / 2, 200));
        elemContainerTL.height(height);
        g_tl.container.computeLayout();
        g_tl.container.redraw();
        checkHideTimelineSpark();
        if (g_tl.redrawAnnotations)
            g_tl.redrawAnnotations();
    }
}

window.addEventListener('resize', function () {
	redrawCharts();
});


function showError(strError) {
	logPlusError(strError);
	var progress = document.getElementById("progress");
	progress.innerText = strError;
	progress.style.display = "block";
}

function setSql(sql, values, elemsParam) {
    g_sql = sql;
    g_valuesSql = values;
    var elems = cloneObject(elemsParam);
    delete elems["chartView"];
    if (elems["orderBy"] == "date") //review default sort
        delete elems["orderBy"];

    if (elems["archived"] == "0")
        delete elems["archived"];

    if (elems["deleted"] == "0")
        delete elems["deleted"];

    var paramsUrl = getUrlParams(); //we need to ignore some params we receive, and use the ones from our UI
    function fixField(field) {
        elems[field] = paramsUrl[field];
        if (elems[field] != "true")
            delete elems[field];
    }
    fixField("checkHideAnnotationTexts");
    fixField("checkHideZoomArea");

    updateBoardLinks(elems); //updates elems too
    window.history.replaceState('data', '', commonBuildUrlFromParams(elems, "dashboard.html"));
    if (!g_bDontQuery)
        configBoardBurndownData(null, elems);
    else {
        g_bDontQuery = false;
        hiliteOnce($("#buttonFilter", $("#frameFilter").contents()));
    }
}

function resizeMe(innerHeight) {
    $("#frameFilter").height(innerHeight);
}

var g_sql = "";
var g_valuesSql = [];

function configBoardBurndownData(idBoard, elems) {
    document.getElementById("progress").style.display = "block";
    openPlusDb(
			function (response) {
			    if (response.status != STATUS_OK) {
			        showError(response.status);
			        return;
			    }
			    var sql = g_sql;
			    var values;
                
			    values = g_valuesSql;
			    
			    function updateTitle(title) {
			        title += " - Plus Burndown";
			        document.title = title;
			        $("#dashBoardTopTitle").text(title);
			    }

			    getSQLReport(sql, values,
                    function (response) {
                        var rows = response.rows;
                        try {
                            setChartData(rows, idBoard, elems);
                            var bUniqueBoard = !!elems["idBoard"];
                            g_bUniqueBoard = bUniqueBoard;
                            if (bUniqueBoard) {
                                if (rows && rows.length>0)
                                    updateTitle(rows[0].nameBoard);
                                else {
                                    getSQLReport("select name from BOARDS where idBoard=?", [elems["idBoard"]],
                                        function (response) {
                                            rows = response.rows;
                                            if (rows && rows.length>0)
                                                updateTitle(rows[0].name);
                                            else
                                                updateTitle("board not synced");
                                        });
                                }
                            } else {
                                updateTitle("Custom filters");
                            }
                        }
                        catch (e) {
                            var strError = "error: " + e.message;
                            showError(strError);
                        }
                    });
			});
}


// params is IN/OUT
function updateBoardLinks(params) {
    var paramIdBoard = params["idBoard"];
    var idBoard = null;

    
    $("#projectionLink").show();
    $("#saveBurndown").show();
    if (paramIdBoard)
        idBoard = decodeURIComponent(paramIdBoard);

    if (idBoard) {
        delete params["board"]; //dont pass it back to the report. it was historically just for title display purposes (june  2016)
        $("#reportLink").attr("href", chrome.extension.getURL("report.html?chartView=s&idBoard=") + paramIdBoard + "&weekStartRecent=true").show();
        $("#boardLink").attr("href", "https://trello.com/b/" + paramIdBoard).show();
    }
    else {
        $("#reportLink").hide();
        $("#boardLink").hide();
    }
}

function loadBurndown() {
    resetChartline();
    g_bDontQuery = false; //reset
    g_paramsLast = getUrlParams();
    var params = g_paramsLast;
	var paramIdBoard = params["idBoard"];
	var paramNameBoard = params["board"];
	var idBoard = null;
    var boardName = null;
    
    if (paramNameBoard)
        boardName = decodeURIComponent(paramNameBoard);

    if (paramIdBoard)
        idBoard = decodeURIComponent(paramIdBoard);

    updateBoardLinks(params);

	var header = $("#headerMarker");
	var container = $("#boardMarkersContainer");
	var headerFilter = $("#headerFilter");
	var containerFilter = $("#filtersContainer");

	hitAnalytics("Burndown", "open", true);

	$("#saveBurndown").click(function (e) {
	    e.preventDefault();
	    var nameChart = window.prompt("Name for the PNG file:", "burndown");
	    var elemChart = $("#timelinePrintContainer");
        //hack alert: qtip library uses html titles, but SVG doesnt like them. Thus we strip all titles here from SVG (qtip sets oldTitle) 
	    var elemsClean = document.querySelectorAll("[oldTitle]");
	    for (var iClean = 0; iClean < elemsClean.length; iClean++) {
	        elemsClean[iClean].removeAttributeNS(null, "title");
	        elemsClean[iClean].removeAttributeNS(null, "oldTitle");
	    }
	    if (nameChart) {
	        domtoimage.toBlob(elemChart[0], { bgcolor: "white"}).then(function (blob) {
	            var link = document.createElement('a');
	            var url = URL.createObjectURL(blob);
	            link.style.display = 'none';
	            document.body.appendChild(link);
	            link.download = nameChart.trim() + '.png';
	            link.href = url;
	            link.onclick = function () {
	                requestAnimationFrame(function () {
	                    URL.revokeObjectURL(url);
	                })
	            };
	            link.click();
	        });
	    }
	});

	function onDoneSlide() {
	    redrawCharts(false);
	}

	function doFilterClick() {
	    handleSectionSlide(containerFilter, $("#report_filter_section"), undefined, undefined, onDoneSlide);
	}

	header.click(function () {
	    handleSectionSlide(container, $("#boardMarkersContent"), undefined, undefined, onDoneSlide);
	});

	headerFilter.click(function () {
	    doFilterClick();
	});

	var elemHideAnnotations = $("#checkHideAnnotationTexts");
	elemHideAnnotations[0].checked = (params["checkHideAnnotationTexts"] == "true");
	elemHideAnnotations.click(function () {
	    if (!g_sql)
	        return; //too early
	    params = getUrlParams();
	    if (elemHideAnnotations[0].checked)
	        params["checkHideAnnotationTexts"] = "true";
	    else
	        delete params["checkHideAnnotationTexts"];
	    replaceUrlState(params);
	    redrawCharts(true);
	});

	var elemHideZoom = $("#checkHideZoomArea");
	elemHideZoom[0].checked = (params["checkHideZoomArea"] == "true");
	elemHideZoom.click(function () {
	    if (!g_sql)
	        return; //too early
	    params = getUrlParams();
	    if (elemHideZoom[0].checked)
	        params["checkHideZoomArea"] = "true";
	    else
	        delete params["checkHideZoomArea"];

	    replaceUrlState(params);
	    redrawCharts(true);
	});

    //review ugly
	if (!idBoard && !boardName && !params["keyword"] && !params["sinceSimple"] && !params["weekStart"] && !params["weekEnd"] &&
         !params["monthStart"] && !params["monthEnd"] && !params["user"] && !params["team"] && !params["list"] && !params["card"] &&
         !params["label"] && !params["comment"] && !params["eType"] && !params["idCard"]) {
        $("#filtersContainer").show();
	    g_bDontQuery = true;
	}


	var headerUser = $("#headerByUser");
	headerUser.off().click(function () {
	    handleSectionSlide($("#chartUserContainer"), $("#byUserContent"), undefined, undefined, onDoneSlide);
	    drawChartUser();
	});

    chrome.storage.local.get([PROP_TRELLOUSER, PROP_SHOWBOARDMARKERS], function (obj) {
        g_userTrello = (obj[PROP_TRELLOUSER] || null); //review zig handle null case when used in the future
        g_bShowBoardMarkers = (obj[PROP_SHOWBOARDMARKERS] || false);
        var bDontQuery = g_bDontQuery; //in case callback changes it
        var srcUse = commonBuildUrlFromParams(params, "report.html?getsql=1");
        $("#frameFilter").attr('src', srcUse); //this ends up calling us back to setSql()
        if (bDontQuery)
            setTimeout(doFilterClick, 250); //without timeout it wont work. likely from timing of resizeMe. did not investigate further
	});
}

var g_bShowBoardMarkers = false;
var g_bDontQuery = false; //in case user navivates without any parameters

function makeRowMarkerParams(rowOrig, totalByUser) {
    var bOpen = (rowOrig.dateEnd == null);
    var row = {};
    var colors = {};

    var cSecStart = rowOrig.dateStart;
    var cSecEnd = 0;


    row.dateStartStr = rowOrig.dateStartStr;
    if (bOpen) {
        row.dateEndStr = "";
        cSecEnd = Math.floor(Date.now() / 1000);
    }
    else {
        row.dateEndStr = rowOrig.dateEndStr;
        cSecEnd = rowOrig.dateEnd;
    }
    row.cDays = Math.floor((cSecEnd - cSecStart) / 60 / 60 / 24);
    row.userMarked = rowOrig.userMarked;
    row.userMarking = rowOrig.userMarking;

    var spentStart = rowOrig.spentStart;
    var estStart = rowOrig.estStart;      
    var spentEnd = rowOrig.spentEnd || 0;  //is null when !bOpen
    var estEnd = rowOrig.estEnd || 0;

    assert(spentStart != null && estStart != null); //but could be zero
    row.seStart = parseFixedFloat(spentStart) + " / " + parseFixedFloat(estStart);

    if (bOpen) {
        var totalUser = totalByUser[row.userMarked];

        if (totalUser) {
            spentEnd = totalUser.sNotR;
            estEnd = totalUser.eNotR;
        }
    }

    row.seEnd = parseFixedFloat(spentEnd) + " / " + parseFixedFloat(estEnd);
    row.nameMarker = rowOrig.nameMarker;
    if (estEnd > estStart || spentEnd > estStart)
        colors.seEnd = true;

    return { row: row, colors: colors };
}

function loadBoardMarkers(idBoard, totalByUser) {
	var sql = "SELECT datetime(dateStart,'unixepoch','localtime') as dateStartStr, datetime(dateEnd,'unixepoch','localtime') as dateEndStr, dateStart, dateEnd, userMarked, userMarking, spentStart, estStart, spentEnd, estEnd, nameMarker \
					FROM boardmarkers where idBoard=? ORDER BY dateStart DESC";
	var values = [idBoard];
	getSQLReport(sql, values,
		function (response) {
			var rows = response.rows;
			var container = $("#boardMarkersContainer");
			var table = $("#tableMarkers");

			table.empty();
			if (rows && rows.length > 0) {
				var i = 0;
				var header = { dateStartStr: 'Begin date', dateEndStr: 'End date', cDays: 'Days', userMarked: 'For user', userMarking: 'By', seStart: 'Begin S/E', seEnd: 'End S/E', nameMarker: 'Marker name' };
				addRowMarkerData(table, header, {}, true);
				for (; i < response.rows.length; i++) {
				    var rowParams = makeRowMarkerParams(response.rows[i], totalByUser);
					addRowMarkerData(table, rowParams.row, rowParams.colors, false);
				}
			}
			container.show();
		});
}

function addRowMarkerData(table, rowData, colors, bHeader) {
	var row = $("<tr></tr>").addClass("agile-card-background").addClass("agile-card-statrow");
	if (bHeader)
		row.addClass("agile-card-background-header");
	var td = (bHeader ? '<th />' : '<td />');

	var i;
	for (i in rowData) {
		var data = rowData[i];
		var elem = $(td).text(typeof (data) == 'string' ? data : parseFixedFloat(data));
		if (colors[i])
			elem.css("background", "lightcoral");
		row.append(elem);
	}
	table.append(row);
}

function resetChartline() {
    if (g_tl.pointer) {
        if (g_tl.plot)
            g_tl.pointer.detachFrom(g_tl.plot);
        g_tl.pointer = null;
    }
    g_tl.plot = null;
    g_tl.crosshair = null;
    g_tl.projectionLine = null;
    g_tl.chartBottom = null;
    g_tl.xAxisBottom = null;
    g_tl.redrawAnnotations = null;
    if (g_tl.container)
        g_tl.container.destroy();
    g_tl.container = null;
    resetTDOutput(d3.select("#timelineDetail"));
}

function resetTDOutput(output) {
    output.html("");
}

function loadTimeline(series, params) {
    var xScale = new Plottable.Scales.Time();
    var xAxis = new Plottable.Axes.Numeric(xScale, "bottom");
    var xFormatter = Plottable.Formatters.multiTime();
    xAxis.formatter(xFormatter);
    var yScale = new Plottable.Scales.Linear();
    var yAxis = new Plottable.Axes.Numeric(yScale, "left");
    
    var series1 = new Plottable.Dataset(series.spent, { name: "Spent" });
    var series2 = new Plottable.Dataset(series.est, { name: "Estimate" });
    var series3 = new Plottable.Dataset(series.remain, { name: "Remain" });
    var seriesAnnotation = new Plottable.Dataset(series.annotation, { name: "Annotation" });

    var bandPlotS = new Plottable.Plots.Area();
    bandPlotS.deferredRendering(false);
    bandPlotS.addDataset(series1);
    bandPlotS.x(function (d) { return d.x; }, xScale).
        y(function (d) { return d.y; }, yScale).
        attr("fill", "#ffcdd2").
        attr("stroke-width", 0);


    var plot = new Plottable.Plots.Line(xScale, yScale);
    plot.deferredRendering(false);
    plot.x(function (d) {
        return d.x;
    }, xScale).y(function (d) {
        return d.y;
    }, yScale);
    plot.attr("stroke", function (d, i, dataset) { return d.stroke; });
    plot.addDataset(series1).addDataset(series2).addDataset(series3);
    plot.autorangeMode("y");

    var plotAnnotations = new Plottable.Plots.Scatter(xScale, yScale);
    plotAnnotations.deferredRendering(false);
    plotAnnotations.addClass("tooltipped");
    plotAnnotations.attr("title", function (d) {
        return '<div>' + d.tooltip + '</div><div>' + makeDateCustomString(d.x) + ' (' + getCurrentWeekNum(d.x) + ')</div><div>Total S:' + d.sumSpent + '&nbsp;&nbsp;E:' + d.y + '&nbsp;&nbsp;R:' + d.sumR + '</div>';
    });
    plotAnnotations.size(13);
    plotAnnotations.attr("fill","black");
    plotAnnotations.x(function (d) { return d.x; }, xScale).y(function (d) { return d.y; }, yScale);
    plotAnnotations.addDataset(seriesAnnotation);
    plotAnnotations.autorangeMode("y");

    var sparklineXScale = new Plottable.Scales.Time();
    var sparklineYScale = new Plottable.Scales.Linear();
    var sparkline = new Plottable.Plots.Line(xScale, sparklineYScale);
    sparkline.deferredRendering(false);
    sparkline.x(function (d) { return d.x; }, sparklineXScale).y(function (d) { return d.y; }, sparklineYScale);
    sparkline.attr("stroke", function (d, i, dataset) { return d.stroke; });
    sparkline.addDataset(series1).addDataset(series2).addDataset(series3);

    var sparklineAnnotations = new Plottable.Plots.Scatter(xScale, sparklineYScale);
    sparklineAnnotations.deferredRendering(false);
    sparklineAnnotations.size(8);
    sparklineAnnotations.attr("fill", "black");
    sparklineAnnotations.x(function (d) { return d.x; }, sparklineXScale).y(function (d) { return d.y; }, sparklineYScale);
    sparklineAnnotations.addDataset(seriesAnnotation);

    var dragBox = new Plottable.Components.XDragBoxLayer();
    dragBox.resizable(true);
    dragBox.onDrag(function (bounds) {
        var min = sparklineXScale.invert(bounds.topLeft.x);
        var max = sparklineXScale.invert(bounds.bottomRight.x);
        xScale.domain([min, max]);
    });
    dragBox.onDragEnd(function (bounds) {
        if (bounds.topLeft.x === bounds.bottomRight.x) {
            xScale.domain(sparklineXScale.domain());
        }
    });

    var txtAnnotations = [];
    function addAnnotationText(annotation,x,y) {
        var txt = plotAnnotations.foreground().append("text");
        txt.attr({
            "text-anchor": "right",
            "font-size": "0.7em",
            "font-weight": "bold",
            "dx": "0em", //use if you want to offset x
            "dy": "1.5em", //offset y relative to text-anchor
            "fill": g_colorTrelloBlack,
            "writing-mode": "vertical-rl"
        });
        txt.text(annotation);
        txtAnnotations.push({ txt: txt, x: x, y: y });
    }

    function redrawAnnotations() {
        if (!g_paramsLast)
            g_paramsLast = getUrlParams();
        txtAnnotations.forEach(function (elem) {
            elem.txt.attr({
                "x": xScale.scale(elem.x),
                "y": yScale.scale(elem.y),
                "visibility": g_paramsLast["checkHideAnnotationTexts"]=="true"?"hidden":"visible"
            });
        });
    }


    function onUpdateXScale() {

        //could reposition these (like annotations) but not worth it
        if (g_tl.crosshair)
            g_tl.crosshair.hide(); 

        if (g_tl.projectionLine)
            g_tl.projectionLine.hide();

        dragBox.boxVisible(true);
        var xDomain = xScale.domain();
        dragBox.bounds({
            topLeft: { x: sparklineXScale.scale(xDomain[0]), y: null },
            bottomRight: { x: sparklineXScale.scale(xDomain[1]), y: null }
        });
        redrawAnnotations();
    }

    xScale.onUpdate(onUpdateXScale);

    yScale.onUpdate(function () {
        redrawAnnotations();
    });
    var miniChart = null;
    var sparklineXAxis = null;

    
    miniChart = new Plottable.Components.Group([sparkline, sparklineAnnotations, dragBox]);
    sparklineXAxis = new Plottable.Axes.Time(sparklineXScale, "bottom");
    sparklineXAxis.addClass("minichartBurndownXLine");

    var pzi = new Plottable.Interactions.PanZoom(xScale, null);
    pzi.attachTo(plot);

    var output = d3.select("#timelineDetail");
    resetTDOutput(output);

    var colorScale = new Plottable.Scales.Color().range(g_TimelineColors).domain(["Spent", "Estimate", "Remain", "Annotation"]);
    var legend = new Plottable.Components.Legend(colorScale).xAlignment("center").yAlignment("center");
    var gridline = new Plottable.Components.Gridlines(xScale, yScale);
    gridline.addClass("timelineGridline");
    resetChartline();
    g_tl.plot = plot;
    g_tl.chartBottom = miniChart;
    g_tl.xAxisBottom = sparklineXAxis;
    g_tl.container = new Plottable.Components.Table([ //ALERT: resize code assumes table positions
      [yAxis, new Plottable.Components.Group([bandPlotS, plot, plotAnnotations, gridline]), legend],
      [null, xAxis],
      [null, miniChart],
      [null, sparklineXAxis]
    ]);
    g_tl.container.rowWeight(2, 0.2);
    g_tl.container.renderTo("#timeline");
    onUpdateXScale(); //causes the gray selection on bottom chart to show all range selected
    setTimeout(function () {
        checkHideTimelineSpark(params);
    }, 200);
    series.annotation.forEach(function (annotation) {
        addAnnotationText(annotation.text, annotation.x, annotation.y);
    });

    g_tl.redrawAnnotations = redrawAnnotations;
    redrawAnnotations();
    $($(".tooltipped")[0].getElementsByTagName("path")).qtip({
        position: {
            my: "bottom middle",
            at: "top middle"
        },
        hide: {
            delay: 400 //stay up a little so its harder to accidentally move a little the mouse and close it
        },
        style: {
            classes: "qtip-dark"
        }
    });
    var crosshair = createCrosshair(plot, yScale);
    var projectionLine = createProjectionLine(plot, xFormatter, xScale, yScale);
    g_tl.crosshair = crosshair;
    g_tl.projectionLine = projectionLine;
    var pointer = new Plottable.Interactions.Click();
    var entityLast = null;

    g_tl.pointer = pointer;

    pointer.onClick(function (p) {
        var event = window.event;

        if (event && (event.ctrlKey || event.shiftKey)) {
            projectionLine.drawAt(p);
            return;
        }
        var nearestEntity = plot.entityNearest(p);
        if (!nearestEntity || nearestEntity.datum == null) {
            return;
        }
        crosshair.drawAt(nearestEntity.position);
        entityLast = nearestEntity;
        var datum = nearestEntity.datum;
        if (!datum)
            return; //for future
        var d = datum.drill;
        var html = getHtmlBurndownTooltip(d.user, d.card, d.date, d.spent, d.est, d.spentSum, d.estSum, d.remainSum, d.idCard, d.note);
        output.html(html);
    });
    
    pointer.attachTo(plot);
    redrawCharts(); //recalculate heights and redraw
}

var g_projectionData = {
    x1: 0,
    y1: 0
};

function createProjectionLine(plot, xFormatter, xScale, yScale) {
    var projection = {};
    var container = plot.foreground().append("g").style("visibility", "hidden");
    projection.lineDom = container.append("line").attr("stroke", g_colorRemaining).attr("stroke-width", 1).attr("stroke-dasharray", "5,5");
    projection.circleStart = container.append("circle").attr("stroke", g_colorRemaining).attr("fill", "white").attr("r", 6);
    projection.circleMid = container.append("circle").attr("stroke", g_colorRemaining).attr("fill", "black").attr("r", 3);
    projection.circleEnd = container.append("circle").attr("stroke", g_colorRemaining).attr("fill", g_colorRemaining).attr("r", 6).style("visibility", "hidden");
    projection.labelBackground = container.append("rect").attr("width",0).attr("height",0).attr("fill", "white").attr("rx", 3).attr("ry", 3).attr("stroke", g_colorRemainingDark).attr("stroke-width",1).style("visibility", "hidden");
    projection.labelEnd = container.append("text").attr("stroke", g_colorRemainingDark).attr("stroke-width", 1).attr("stroke-opacity", 1);
    projection.bProjectionFirstClick = true;

    //plot.height()
    projection.drawAt = function (p) {
        var attr = {};
        container.style("visibility", "visible");
        if (projection.bProjectionFirstClick) {
            if (p.y >= yScale.scale(0)) {
                sendDesktopNotification("Click on a point above the zero line.", 5000);
                return;
            }
            projection.labelEnd.text("");
            projection.labelBackground.style("visibility", "hidden");
            projection.circleEnd.style("visibility", "hidden");
            projection.circleMid.style("visibility", "hidden");
            attr.x1 = p.x;
            attr.x2 = p.x;
            attr.y1 = p.y;
            attr.y2 = p.y;
            g_projectionData.x1 = attr.x1;
            g_projectionData.y1 = attr.y1;
            projection.circleStart.attr({
                cx: p.x,
                cy: p.y
            });
            projection.circleStart.style("visibility", "visible");
        } else {
            attr.y2 = yScale.scale(0);
            if (p.y <= g_projectionData.y1) {
                sendDesktopNotification("Click on a point to the right and below the first point.", 5000);
                return;
            }
            attr.x2 = ((p.x - g_projectionData.x1) / (p.y - g_projectionData.y1)) * (attr.y2 - g_projectionData.y1) + g_projectionData.x1;

            if (attr.x2 <= g_projectionData.x1) {
                sendDesktopNotification("Click on a point to the right of the first point.", 5000);
                return;
            }
            projection.circleStart.style("visibility", "visible");
            projection.labelEnd.attr({ x: attr.x2 + 13, y: attr.y2 - 13 });
            var widthLabel = 150;
            if (attr.x2 + widthLabel > plot.width())
                projection.labelEnd.attr({ x: attr.x2 - widthLabel, y: attr.y2 - 13 });
            var dateEnd = xScale.invert(attr.x2);
            var labelEnd = "";
            if (dateEnd) {
                labelEnd = dateEnd.toDateString(); //review couldnt use xFormatter(dateEnd)
                sendDesktopNotification("Projected: "+labelEnd, 10000, "projectedBurnDownEndDate");
            }

            

            projection.labelEnd.text(labelEnd);
            projection.circleEnd.attr({
                cx: attr.x2,
                cy: attr.y2
            });

            projection.circleMid.attr({
                cx: p.x,
                cy: p.y
            });
            projection.circleEnd.style("visibility", "visible");
            projection.circleMid.style("visibility", "visible");
            projection.labelEnd.style("visibility", "visible");
            var bbox = projection.labelEnd[0][0].getBBox();
            var pxBorder = 5;
            projection.labelBackground.attr({
                x: bbox.x - pxBorder,
                y: bbox.y - pxBorder,
                width: bbox.width + 2 * pxBorder,
                height: bbox.height + 2 * pxBorder
            });
            projection.labelBackground.style("visibility", "visible");
            projection.lineDom.style("visibility", "visible");
        }
        projection.bProjectionFirstClick = !projection.bProjectionFirstClick;
        projection.lineDom.attr(attr);
        
    };
    projection.hide = function () {
        container.style("visibility", "hidden");
        projection.circleStart.style("visibility", "hidden");
        projection.labelBackground.style("visibility", "hidden");
        projection.circleEnd.style("visibility", "hidden");
        projection.circleMid.style("visibility", "hidden");
        projection.labelEnd.style("visibility", "hidden");
        projection.lineDom.style("visibility", "hidden");
        projection.bProjectionFirstClick = true;
    };
    return projection;
}

function createCrosshair(plot, yScale) {
    var crosshair = {};
    var crosshairContainer = plot.foreground().append("g").style("visibility", "hidden");
    crosshair.vLine = crosshairContainer.append("line").attr("stroke", g_colorTrelloBlack).attr("y1", yScale.domainMin()).attr("y2", plot.height()).attr("stroke-dasharray", "2,4");
    crosshair.circle = crosshairContainer.append("circle").attr("stroke", g_colorTrelloBlack).attr("fill", "white").attr("r", 3);
    crosshair.drawAt = function (p) {
        crosshair.vLine.attr({
            x1: p.x,
            x2: p.x
        });
        crosshair.circle.attr({
            cx: p.x,
            cy: p.y
        });
        crosshairContainer.style("visibility", "visible");
    };
    crosshair.hide = function () {
        crosshairContainer.style("visibility", "hidden");
    };
    return crosshair;
}

//review: idBoard not correct anymore but ok as its only used by (unused) board markers feature
function setChartData(rows, idBoard, params) {
    resetChartline();
	var i = 0;
	var seriesTimeline = {spent:[],est:[],remain:[],annotation:[]};
	var spentTotal = 0;
	var estTotal = 0;
	var totalByUser = {};
	const weekStart = params["weekStart"];
	const weekEnd = params["weekEnd"];
	var maxLength = 58; //hover tooltip shows full text

	function shortenString(str) {
	    if (str.length > maxLength)
	        str = str.substring(0, maxLength) + "…";
	    return str;
	}


	var remainTotalDisplay = 0;
	var spentTotalDisplay = 0;
	var estTotalDisplay = 0;
	const lengthRows = rows.length;
	var cSkipElemInTimeline = 0;

	for (; i < lengthRows; i++) {
		var row = rows[i];


		var date = new Date(row.date * 1000); //db is in seconds
		var spent = row.spent;
		var est = row.est;
		var idCard = row.idCardH;
		var comment = row.comment;
		var card = row.nameCard;
		var user = row.user;

	    //detect transfers. this is not 100% perfect because a comment or due date from another card could happen to fall just in between the transfers (which have a 1second difference).
		//rowid -1
		if (cSkipElemInTimeline == 0 && row.rowid != ROWID_REPORT_CARD && row.comment && row.comment.indexOf(g_prefixCommentTransferTo) >= 0 && i + 1 < lengthRows && spent == 0) {
		    var rowNext = rows[i + 1];
		    if (rowNext.rowid && row.rowid + 1 == rowNext.rowid &&
                rowNext.comment && rowNext.comment.indexOf(g_prefixCommentTransferFrom) >= 0 &&
                rowNext.spent == 0 &&
                parseFixedFloat(Math.abs(rowNext.est + est)) == 0) {
		        cSkipElemInTimeline=2; //this and next one
		    }
		}

		var objHtml;
		if (user) { //!user when row is a card due date
		    if (totalByUser[user] === undefined)
		        totalByUser[user] = { s: 0, e: 0, sNotR: 0, eNotR: 0, data: [] };
		    var totalsUser = totalByUser[user];
		    totalsUser.s += spent;
		    totalsUser.e += est;
		    if (card.indexOf(TAG_RECURRING_CARD) < 0) {
		        totalsUser.sNotR += spent;
		        totalsUser.eNotR += est;
		    }
		    totalsUser.data.push(row); //for drill-down tooltip
		    if (cSkipElemInTimeline == 0) {
		        spentTotal += spent;
		        estTotal += est;
		    } else {
		        cSkipElemInTimeline--;
		    }
		    remainTotalDisplay = parseFixedFloat(estTotal - spentTotal);
		    spentTotalDisplay = parseFixedFloat(spentTotal);
		    estTotalDisplay = parseFixedFloat(estTotal);
		    var annotation = "";
		    var iAnnotation = comment.indexOf("!");
		    if (iAnnotation == 0 || comment.indexOf("] !") > 0) //needs to start with ! (] happens when Spent autoinserts markers like [+E] in the comment
		        annotation = comment.slice(iAnnotation + 1);

		    objHtml = {
		        user: user, card: card, date: date, spent: parseFixedFloat(spent), est: parseFixedFloat(est), spentSum: spentTotalDisplay,
		        estSum: estTotalDisplay, remainSum: remainTotalDisplay, idCard: idCard, note: comment
		    };
		    seriesTimeline.spent.push({ x: date, y: spentTotalDisplay, stroke: g_TimelineColors[0], drill: objHtml });
		    seriesTimeline.est.push({ x: date, y: estTotalDisplay, stroke: g_TimelineColors[1], drill: objHtml });
		    seriesTimeline.remain.push({ x: date, y: remainTotalDisplay, stroke: g_TimelineColors[2], drill: objHtml });
		    if (annotation)
		        seriesTimeline.annotation.push({ x: date, y: estTotalDisplay, stroke: g_TimelineColors[3], text: shortenString(annotation), tooltip: annotation, sumSpent: spentTotalDisplay, sumR: remainTotalDisplay });
		}
		else {
		    if (row.dateDue) {
		        //we use row.user to determine if this is a row from the 2nd UNION (due date list)
		        //note: row.date will contain dateDue in this case.
		        assert(row.dateDue == row.date);
		        var bSkip = false;

		        if (weekStart || weekEnd) {
		            var week = getCurrentWeekNum(date);
		            if ((weekStart && week < weekStart) || (weekEnd && week > weekEnd))
		                bSkip = true;
		        }
		        if (!bSkip) {

		            objHtml = {
		                user: user, card: card, date: date, spent: 0, est: 0, spentSum: spentTotalDisplay,
		                estSum: estTotalDisplay, remainSum: remainTotalDisplay, idCard: idCard, note: "Card with due date."
		            };
                    //push E so user can click on the dot.
		            seriesTimeline.est.push({ x: date, y: estTotalDisplay, stroke: g_TimelineColors[1], drill: objHtml });

		            var strNote = "Due: " + row.nameCard;
		            seriesTimeline.annotation.push({ x: date, y: estTotalDisplay, stroke: g_TimelineColors[3], text: shortenString(strNote), tooltip: strNote, sumSpent: 0, sumR: 0, isDue: true });
		        }
		    }
		}
        
	}
	g_dataUser = new google.visualization.DataTable();
	g_dataUser.addColumn('string', 'Who');
	g_dataUser.addColumn('number', 'S');
	g_dataUser.addColumn('number', 'R');
	var rowsUser = [];
	var drilldowns = [];
	for (var keyUser in totalByUser) {
		var obj = totalByUser[keyUser];
		drilldowns.push([keyUser, obj.data, obj.data]);
		rowsUser.push([keyUser, parseFixedFloat(obj.s), parseFixedFloat(obj.e - obj.s)]);
	}
	addSumToRows(true, rowsUser, "E: ");
	g_dataUser.addRows(rowsUser);
	var elemProgress = document.getElementById("progress");
	var chartBottom = $("#visualizationBottom"); //review zig cleanup mix of jquery and native NOTE: historically this was at the bottom, now on top.
	var elemFilter = $("#filtersContainer");
	var elemByUserContainer = $("#chartUserContainer");
	var elemTimeline = $("#timeline");
	elemFilter.show();
	if (rows.length == 0) {
	    elemProgress.innerText = "No S/E or due dates for the given board/filters.";
	    elemProgress.style.display = "block";
	    elemByUserContainer.hide();
	    chartBottom.hide();
	    elemTimeline.hide();
	    resetChartline();
	}
	else {
	    elemProgress.style.display = "none";
		var heightUser = ((2 + g_dataUser.getNumberOfRows()) * g_heightBarUser);
		elemByUserContainer.show();
		chartBottom.show();
		chartBottom.css("height", "" + heightUser);
		elemTimeline.show();
		loadTimeline(seriesTimeline, params);
		g_chartUser = new google.visualization.BarChart(chartBottom[0]);
		var chartLocal = g_chartUser;
		g_chartUser.removeAction('drilldown'); //not sure if chart allows duplicate ids, so remove just in case
		g_chartUser.removeAction('close-drilldown');
		g_chartUser.setAction({
			id: 'drilldown',				  // An id is mandatory for all actions.
			text: 'Drill-down',	   // The text displayed in the tooltip.
			action: function () {		   // When clicked, the following runs.
				handleDrilldownWindow(chartLocal, drilldowns, getHtmlBurndownTooltipByUser, "", 810, true);
				drawChartUser();
			}
		});
		g_chartUser.setAction({
			id: 'close-drilldown',				  // An id is mandatory for all actions.
			text: 'Close',	   // The text displayed in the tooltip.
			action: function () {		   // When clicked, the following runs.
				drawChartUser();
			}
		});

		if (g_bShowBoardMarkers && idBoard!=null)
			loadBoardMarkers(idBoard, totalByUser);
		drawChartUser();
	}
}

function getHtmlBurndownTooltipByUser(rowsParam, bReverse, colExclude, selection) {
    
    var header = [{ name: "Date Last" }, { name: "Board", bBoard:true }, { name: "Card" }, { name: "S" }, { name: "E" }, { name: "R" }];
    var bUniqueBoard = g_bUniqueBoard;
    assert(header[1].bBoard);
    if (bUniqueBoard)
        header.splice(1, 1);
    var bRemain = (selection && selection.col === 2);
	function callbackRowData(row) {
		var rgRet = [];
		var date = new Date(row.date * 1000); //db is in seconds
		rgRet.push({ name: makeDateCustomString(date,true), bNoTruncate: true });

		if (!bUniqueBoard) {
		    var urlBoard = "https://trello.com/b/" + row.idBoardH;
		    rgRet.push({ name: "<A target='_blank' href='" + urlBoard + "'>" + escapeHtml(strTruncate(row.nameBoard)) + "</A>", bNoTruncate: true });
		}
		
		var urlCard = null;
		if (row.idCardH.indexOf("https://") == 0)
			urlCard = row.idCardH; //old-style card URLs. Could be on old historical data from a previous Spent version
		else
			urlCard = "https://trello.com/c/" + row.idCardH;
		rgRet.push({ name: "<A target='_blank' href='" + urlCard + "'>" + escapeHtml(strTruncate(row.nameCard)) + "</A>", bNoTruncate: true });
		var sPush = parseFixedFloat(row.spent);
		var estPush = parseFixedFloat(row.est);
		var rPush = parseFixedFloat(row.est - row.spent);

		if (bRemain) {
		    if (rPush === 0)
		        return null;
		} else {
		    if (sPush === 0)
		        return null;
		}
		rgRet.push({ type: "S", name: sPush, bNoTruncate: true });
		rgRet.push({ type: "E", name: estPush, bNoTruncate: true });
		rgRet.push({ type: "R", name: rPush});
		return rgRet;
	}
	var rows = groupRows(rowsParam, "idCardH", "date", false, null);
	return getHtmlBurndownTooltipFromRows(true, rows, bReverse, header, callbackRowData);
}

function getHtmlBurndownTooltip(user, card, date, spent, est, sTotal, eTotal, rTotal, idCard, comment) {
	var html = "";
	var url = "";

	if (idCard.indexOf("https://") == 0)
		url = idCard; //old-style card URLs. Could be on old historical data from a previous Spent version
	else
		url = "https://trello.com/c/" + idCard;

	html += makeDateCustomString(date, true) + " (" + getCurrentWeekNum(date)+") ";
	html += '<A target="_blank" href="' + url + '">' + card + '</A> ';
	if (user)
	    html += 'by ' + user;
	html += '. ';
	if (spent!=0 || est!=0)
	    html += 'S:' + spent + '  E:' + est + ".";
	if (comment != "")
	    html += " "+comment;
	html += '<br>Total S:' + sTotal + '&nbsp; E:' + eTotal + '&nbsp; R:' + rTotal;
	return html;
}


function drawChartUser() {
	if (g_chartUser == null)
		return;
	var style = {
	    title: "",
		tooltip: { isHtml: false, trigger: 'selection' },
		titleTextStyle: { fontSize: "16", bold: true },
		chartArea: { left: 130, top: 20, height: g_dataUser.getNumberOfRows() * g_heightBarUser },
		height: "100%",
		titleTextStyle: { color: '#4D4D4D', fontSize: 16 },
		vAxes: [{
			textStyle: {
				//color: "#222",
				fontSize: 11
			}
		},
		{
			useFormatFromData: true
		}],
		series: {
			0: {
			    color: '#D25656',
				errorBars: {
					errorType: "none"
				}
			},
			1: {
			    color: '#519B51',
				errorBars: {
					errorType: "none"
				}
			}
		},
		booleanRole: "certainty",
		animation: {
			duration: 0
		},

		legend: "none",
		hAxis: {
			viewWindowMode: 'pretty',
			useFormatFromData: false,
			formatOptions: {
				source: "inline"
			},
			slantedText: false,
			minValue: 0,
			format: "0.#",
			viewWindow: {
				max: null,
				min: null
			},
			logScale: false,
			gridlines: {
				count: 4
			},
			maxValue: null,
			textPosition: 'out',
			textStyle: {
				//color: "#222",
				fontSize: 9
			}
		},
		isStacked: true,
		legendTextStyle: {
			//color: "#222",
			fontSize: 9
		}
	};
	g_chartUser.draw(g_dataUser, style);
}


function getSQLReport(sql, values, callback) {
	getSQLReportShared(sql, values, callback, function onError(status) {
		showError(status);
	});
}
