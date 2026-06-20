(function attachCharts(root, factory) {
  var namespace = root.Estimator || (root.Estimator = {});
  var api = factory(namespace);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createCharts(Estimator) {
  "use strict";

  var Core = Estimator.Core;
  var Metrics = Estimator.Metrics;
  var SVG_NS = "http://www.w3.org/2000/svg";
  var COLORS = {
    teal: "#0b7f7a",
    rose: "#b5335b",
    amber: "#b87712",
    green: "#33845a",
    indigo: "#4857a8",
    ink: "#152027",
    muted: "#66727a",
    line: "#dfe7e3",
    fill: "#d7f0eb"
  };

  function clear(container) {
    container.innerHTML = "";
  }

  function empty(container, message) {
    clear(container);
    var box = document.createElement("div");
    box.className = "chart-empty";
    box.textContent = message || "No data available.";
    container.appendChild(box);
  }

  function el(name, attrs, text) {
    var node = document.createElementNS(SVG_NS, name);
    Object.keys(attrs || {}).forEach(function setAttr(key) {
      node.setAttribute(key, attrs[key]);
    });
    if (text !== undefined) {
      node.textContent = text;
    }
    return node;
  }

  function createSvg(container, width, height) {
    clear(container);
    var svg = el("svg", {
      class: "chart-svg",
      viewBox: "0 0 " + width + " " + height,
      role: "img"
    });
    container.appendChild(svg);
    return svg;
  }

  function extent(values) {
    var min = Infinity;
    var max = -Infinity;
    values.forEach(function inspect(value) {
      if (value < min) {
        min = value;
      }
      if (value > max) {
        max = value;
      }
    });
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return [0, 1];
    }
    if (min === max) {
      return [min - 0.5, max + 0.5];
    }
    return [min, max];
  }

  function scaleLinear(domain, range) {
    var d0 = domain[0];
    var d1 = domain[1];
    var r0 = range[0];
    var r1 = range[1];
    var span = d1 - d0 || 1;
    return function scale(value) {
      return r0 + ((value - d0) / span) * (r1 - r0);
    };
  }

  function ticks(min, max, count) {
    var total = count || 5;
    if (min === max) {
      return [min];
    }
    var values = [];
    var step = (max - min) / (total - 1);
    for (var index = 0; index < total; index += 1) {
      values.push(min + step * index);
    }
    return values;
  }

  function drawGrid(svg, chart, xTicks, yTicks, xScale, yScale) {
    yTicks.forEach(function drawYTick(tick) {
      var y = yScale(tick);
      svg.appendChild(el("line", {
        class: "grid-line",
        x1: chart.left,
        y1: y,
        x2: chart.right,
        y2: y
      }));
    });

    xTicks.forEach(function drawXTick(tick) {
      var x = xScale(tick);
      svg.appendChild(el("line", {
        class: "grid-line",
        x1: x,
        y1: chart.top,
        x2: x,
        y2: chart.bottom,
        "stroke-opacity": "0.55"
      }));
    });
  }

  function drawAxes(svg, chart, xTicks, yTicks, xScale, yScale, xLabel, yLabel) {
    var xAxis = el("g", { class: "axis" });
    var yAxis = el("g", { class: "axis" });

    xAxis.appendChild(el("line", {
      x1: chart.left,
      y1: chart.bottom,
      x2: chart.right,
      y2: chart.bottom,
      stroke: COLORS.line
    }));

    yAxis.appendChild(el("line", {
      x1: chart.left,
      y1: chart.top,
      x2: chart.left,
      y2: chart.bottom,
      stroke: COLORS.line
    }));

    xTicks.forEach(function drawXTick(tick) {
      var x = xScale(tick);
      xAxis.appendChild(el("text", {
        x: x,
        y: chart.bottom + 22,
        "text-anchor": "middle"
      }, Core.formatNumber(tick, 1)));
    });

    yTicks.forEach(function drawYTick(tick) {
      var y = yScale(tick);
      yAxis.appendChild(el("text", {
        x: chart.left - 10,
        y: y + 4,
        "text-anchor": "end"
      }, Core.formatNumber(tick, 0)));
    });

    svg.appendChild(xAxis);
    svg.appendChild(yAxis);

    if (xLabel) {
      svg.appendChild(el("text", {
        x: (chart.left + chart.right) / 2,
        y: chart.bottom + 48,
        "text-anchor": "middle",
        fill: COLORS.muted,
        "font-size": "12"
      }, xLabel));
    }

    if (yLabel) {
      svg.appendChild(el("text", {
        x: chart.left - 42,
        y: (chart.top + chart.bottom) / 2,
        transform: "rotate(-90 " + (chart.left - 42) + " " + ((chart.top + chart.bottom) / 2) + ")",
        "text-anchor": "middle",
        fill: COLORS.muted,
        "font-size": "12"
      }, yLabel));
    }
  }

  function buildBins(values, desiredCount) {
    var range = extent(values);
    var min = range[0];
    var max = range[1];
    var count = Math.max(6, desiredCount || Math.round(Math.sqrt(values.length)));
    var size = (max - min) / count || 1;
    var bins = Array.from({ length: count }, function makeBin(_, index) {
      return {
        x0: min + index * size,
        x1: min + (index + 1) * size,
        count: 0
      };
    });

    values.forEach(function place(value) {
      var index = Math.min(count - 1, Math.max(0, Math.floor((value - min) / size)));
      bins[index].count += 1;
    });

    return bins;
  }

  function markerList(markers) {
    return [
      { label: "P50", value: markers && markers.p50, color: COLORS.teal },
      { label: "P80", value: markers && markers.p80, color: COLORS.rose },
      { label: "P90", value: markers && markers.p90, color: COLORS.amber },
      { label: "P95", value: markers && markers.p95, color: COLORS.indigo }
    ].filter(function validMarker(marker) {
      return Number.isFinite(marker.value);
    });
  }

  function drawMarkers(svg, chart, xScale, markers) {
    markerList(markers).forEach(function drawMarker(marker, index) {
      var x = xScale(marker.value);
      svg.appendChild(el("line", {
        x1: x,
        y1: chart.top,
        x2: x,
        y2: chart.bottom,
        stroke: marker.color,
        "stroke-width": "2",
        "stroke-dasharray": index === 0 ? "" : "5 4"
      }));
      svg.appendChild(el("text", {
        class: "marker-label",
        x: x + 6,
        y: chart.top + 18 + index * 17,
        fill: marker.color
      }, marker.label + " " + Core.formatNumber(marker.value, 1)));
    });
  }

  function renderHistogram(container, values, markers) {
    if (!values || !values.length) {
      empty(container, "Run a simulation to see the duration distribution.");
      return;
    }

    var width = 920;
    var height = 330;
    var chart = { left: 60, right: 890, top: 22, bottom: 262 };
    var svg = createSvg(container, width, height);
    var bins = buildBins(values, Math.min(36, Math.max(12, Math.round(Math.sqrt(values.length)))));
    var xDomain = [bins[0].x0, bins[bins.length - 1].x1];
    var yMax = Math.max.apply(null, bins.map(function binCount(bin) { return bin.count; }));
    var xScale = scaleLinear(xDomain, [chart.left, chart.right]);
    var yScale = scaleLinear([0, yMax || 1], [chart.bottom, chart.top]);
    var xTickValues = ticks(xDomain[0], xDomain[1], 7);
    var yTickValues = ticks(0, yMax || 1, 5);

    drawGrid(svg, chart, xTickValues, yTickValues, xScale, yScale);

    bins.forEach(function drawBin(bin, index) {
      var x = xScale(bin.x0) + 1;
      var barWidth = Math.max(1, xScale(bin.x1) - xScale(bin.x0) - 2);
      var y = yScale(bin.count);
      var palette = [COLORS.teal, COLORS.green, COLORS.amber, COLORS.rose, COLORS.indigo];
      svg.appendChild(el("rect", {
        x: x,
        y: y,
        width: barWidth,
        height: chart.bottom - y,
        rx: "3",
        fill: palette[index % palette.length],
        "fill-opacity": "0.76"
      }));
    });

    drawAxes(svg, chart, xTickValues, yTickValues, xScale, yScale, "Duration", "Simulations");
    drawMarkers(svg, chart, xScale, markers);
  }

  function renderConfidence(container, sortedValues) {
    if (!sortedValues || !sortedValues.length) {
      empty(container, "Run a simulation to see the confidence curve.");
      return;
    }

    var width = 620;
    var height = 300;
    var chart = { left: 54, right: 586, top: 20, bottom: 232 };
    var svg = createSvg(container, width, height);
    var domain = extent(sortedValues);
    var xScale = scaleLinear(domain, [chart.left, chart.right]);
    var yScale = scaleLinear([0, 100], [chart.bottom, chart.top]);
    var xTickValues = ticks(domain[0], domain[1], 5);
    var yTickValues = [0, 25, 50, 75, 100];
    var step = Math.max(1, Math.floor(sortedValues.length / 220));
    var points = [];

    for (var index = 0; index < sortedValues.length; index += step) {
      points.push({
        x: xScale(sortedValues[index]),
        y: yScale((index / (sortedValues.length - 1)) * 100)
      });
    }
    points.push({
      x: xScale(sortedValues[sortedValues.length - 1]),
      y: yScale(100)
    });

    drawGrid(svg, chart, xTickValues, yTickValues, xScale, yScale);

    var areaPath = "M " + chart.left + " " + chart.bottom + " " +
      points.map(function pointToString(point) {
        return "L " + point.x + " " + point.y;
      }).join(" ") +
      " L " + chart.right + " " + chart.bottom + " Z";
    svg.appendChild(el("path", {
      d: areaPath,
      fill: COLORS.fill,
      "fill-opacity": "0.75"
    }));

    var linePath = points.map(function pointToString(point, index) {
      return (index === 0 ? "M " : "L ") + point.x + " " + point.y;
    }).join(" ");
    svg.appendChild(el("path", {
      d: linePath,
      fill: "none",
      stroke: COLORS.teal,
      "stroke-width": "3"
    }));

    drawAxes(svg, chart, xTickValues, yTickValues, xScale, yScale, "Duration", "Confidence %");
  }

  function renderViolin(container, values, markers) {
    if (!values || !values.length) {
      empty(container, "Run a simulation to see the violin distribution.");
      return;
    }

    var width = 620;
    var height = 300;
    var chart = { left: 52, right: 586, top: 36, bottom: 228 };
    var svg = createSvg(container, width, height);
    var bins = buildBins(values, 34);
    var domain = [bins[0].x0, bins[bins.length - 1].x1];
    var xScale = scaleLinear(domain, [chart.left, chart.right]);
    var center = (chart.top + chart.bottom) / 2;
    var maxCount = Math.max.apply(null, bins.map(function count(bin) { return bin.count; })) || 1;
    var maxHalf = (chart.bottom - chart.top) / 2 - 12;

    var topPoints = bins.map(function mapTop(bin) {
      var x = xScale((bin.x0 + bin.x1) / 2);
      var half = (bin.count / maxCount) * maxHalf;
      return { x: x, y: center - half };
    });
    var bottomPoints = bins.slice().reverse().map(function mapBottom(bin) {
      var x = xScale((bin.x0 + bin.x1) / 2);
      var half = (bin.count / maxCount) * maxHalf;
      return { x: x, y: center + half };
    });
    var path = topPoints.concat(bottomPoints).map(function pointToString(point, index) {
      return (index === 0 ? "M " : "L ") + point.x + " " + point.y;
    }).join(" ") + " Z";

    svg.appendChild(el("path", {
      d: path,
      fill: COLORS.fill,
      stroke: COLORS.teal,
      "stroke-width": "2"
    }));
    svg.appendChild(el("line", {
      x1: chart.left,
      y1: center,
      x2: chart.right,
      y2: center,
      stroke: COLORS.line,
      "stroke-width": "2"
    }));

    var xTickValues = ticks(domain[0], domain[1], 5);
    var xScaleForAxis = xScale;
    drawAxes(svg, chart, xTickValues, [], xScaleForAxis, function identity(value) { return value; }, "Duration", "");
    drawMarkers(svg, chart, xScale, markers);
  }

  function renderScatter(container, points, markers) {
    if (!points || !points.length) {
      empty(container, "Run a simulation to see effort versus duration.");
      return;
    }

    var width = 620;
    var height = 300;
    var chart = { left: 58, right: 586, top: 20, bottom: 232 };
    var svg = createSvg(container, width, height);
    var durationDomain = extent(points.map(function getDuration(point) { return point.duration; }));
    var effortDomain = extent(points.map(function getEffort(point) { return point.effort; }));
    var xScale = scaleLinear(durationDomain, [chart.left, chart.right]);
    var yScale = scaleLinear(effortDomain, [chart.bottom, chart.top]);
    var xTickValues = ticks(durationDomain[0], durationDomain[1], 5);
    var yTickValues = ticks(effortDomain[0], effortDomain[1], 5);

    drawGrid(svg, chart, xTickValues, yTickValues, xScale, yScale);

    points.forEach(function drawPoint(point) {
      svg.appendChild(el("circle", {
        cx: xScale(point.duration),
        cy: yScale(point.effort),
        r: "3",
        fill: COLORS.indigo,
        "fill-opacity": "0.32"
      }));
    });

    drawAxes(svg, chart, xTickValues, yTickValues, xScale, yScale, "Duration", "Effort");
    drawMarkers(svg, chart, xScale, markers);
  }

  function renderSensitivity(container, sensitivity) {
    if (!sensitivity || !sensitivity.length) {
      empty(container, "Run a simulation to see sensitivity.");
      return;
    }

    var data = sensitivity.slice(0, 10);
    var width = 620;
    var height = Math.max(300, 72 + data.length * 30);
    var chart = { left: 176, right: 586, top: 24, bottom: height - 48 };
    var svg = createSvg(container, width, height);
    var maxAbs = Math.max.apply(null, data.map(function absCorrelation(item) {
      return Math.abs(item.correlation);
    })) || 1;
    var xScale = scaleLinear([-maxAbs, maxAbs], [chart.left, chart.right]);
    var zero = xScale(0);
    var rowHeight = (chart.bottom - chart.top) / data.length;

    svg.appendChild(el("line", {
      x1: zero,
      y1: chart.top - 8,
      x2: zero,
      y2: chart.bottom + 4,
      stroke: COLORS.line,
      "stroke-width": "2"
    }));

    data.forEach(function drawBar(item, index) {
      var y = chart.top + index * rowHeight + 6;
      var x = xScale(Math.min(0, item.correlation));
      var widthValue = Math.abs(xScale(item.correlation) - zero);
      var fill = item.correlation >= 0 ? COLORS.rose : COLORS.indigo;

      svg.appendChild(el("text", {
        x: chart.left - 12,
        y: y + 16,
        "text-anchor": "end",
        fill: COLORS.ink,
        "font-size": "12",
        "font-weight": "800"
      }, item.id));
      svg.appendChild(el("rect", {
        x: x,
        y: y,
        width: Math.max(2, widthValue),
        height: 18,
        rx: "4",
        fill: fill,
        "fill-opacity": "0.82"
      }));
      svg.appendChild(el("text", {
        x: xScale(item.correlation) + (item.correlation >= 0 ? 7 : -7),
        y: y + 14,
        "text-anchor": item.correlation >= 0 ? "start" : "end",
        fill: COLORS.muted,
        "font-size": "11"
      }, Core.formatNumber(item.correlation, 2)));
    });
  }

  function truncate(value, maxLength) {
    var text = String(value || "");
    if (text.length <= maxLength) {
      return text;
    }
    return text.slice(0, maxLength - 1) + "...";
  }

  function renderDependencyGraph(container, stories, deterministic) {
    if (!stories || !stories.length || !deterministic) {
      empty(container, "Upload story data to see the dependency network.");
      return;
    }

    var sorted;
    try {
      sorted = Metrics.topologicalSort(stories);
    } catch (error) {
      empty(container, error.message);
      return;
    }

    var layerById = new Map();
    sorted.order.forEach(function assignLayer(story) {
      var layer = 0;
      (story.dependencies || []).forEach(function dependencyLayer(dependency) {
        layer = Math.max(layer, (layerById.get(dependency) || 0) + 1);
      });
      layerById.set(story.id, layer);
    });

    var layers = new Map();
    stories.forEach(function groupByLayer(story) {
      var layer = layerById.get(story.id) || 0;
      if (!layers.has(layer)) {
        layers.set(layer, []);
      }
      layers.get(layer).push(story);
    });

    var layerKeys = Array.from(layers.keys()).sort(function ascending(a, b) { return a - b; });
    var maxRows = Math.max.apply(null, layerKeys.map(function rowCount(layer) {
      return layers.get(layer).length;
    }));
    var nodeWidth = 166;
    var nodeHeight = 60;
    var columnGap = 70;
    var rowGap = 38;
    var width = Math.max(900, 60 + layerKeys.length * (nodeWidth + columnGap));
    var height = Math.max(340, 64 + maxRows * (nodeHeight + rowGap));
    var svg = createSvg(container, width, height);
    var criticalSet = new Set(deterministic.criticalPath || []);
    var criticalEdges = new Set();
    (deterministic.criticalPath || []).forEach(function setCriticalEdge(id, index, path) {
      if (index > 0) {
        criticalEdges.add(path[index - 1] + "->" + id);
      }
    });
    var positionById = new Map();

    layerKeys.forEach(function placeLayer(layer, layerIndex) {
      var items = layers.get(layer);
      var totalHeight = items.length * nodeHeight + (items.length - 1) * rowGap;
      var startY = Math.max(34, (height - totalHeight) / 2);
      items.forEach(function placeStory(story, rowIndex) {
        positionById.set(story.id, {
          x: 36 + layerIndex * (nodeWidth + columnGap),
          y: startY + rowIndex * (nodeHeight + rowGap)
        });
      });
    });

    stories.forEach(function drawEdges(story) {
      var target = positionById.get(story.id);
      (story.dependencies || []).forEach(function drawEdge(dependency) {
        var source = positionById.get(dependency);
        if (!source || !target) {
          return;
        }
        var x1 = source.x + nodeWidth;
        var y1 = source.y + nodeHeight / 2;
        var x2 = target.x;
        var y2 = target.y + nodeHeight / 2;
        var mid = (x1 + x2) / 2;
        var critical = criticalEdges.has(dependency + "->" + story.id);
        svg.appendChild(el("path", {
          d: "M " + x1 + " " + y1 + " C " + mid + " " + y1 + ", " + mid + " " + y2 + ", " + x2 + " " + y2,
          fill: "none",
          stroke: critical ? COLORS.rose : COLORS.line,
          "stroke-width": critical ? "3" : "2"
        }));
      });
    });

    stories.forEach(function drawNode(story) {
      var position = positionById.get(story.id);
      var task = (deterministic.tasks || []).find(function findTask(item) {
        return item.id === story.id;
      });
      var critical = criticalSet.has(story.id);
      svg.appendChild(el("rect", {
        x: position.x,
        y: position.y,
        width: nodeWidth,
        height: nodeHeight,
        rx: "8",
        fill: critical ? "#fff1f4" : "#ffffff",
        stroke: critical ? COLORS.rose : COLORS.line,
        "stroke-width": critical ? "2" : "1.5"
      }));
      svg.appendChild(el("text", {
        x: position.x + 12,
        y: position.y + 20,
        fill: critical ? COLORS.rose : COLORS.teal,
        "font-size": "12",
        "font-weight": "900"
      }, story.id));
      svg.appendChild(el("text", {
        x: position.x + 12,
        y: position.y + 38,
        fill: COLORS.ink,
        "font-size": "12",
        "font-weight": "750"
      }, truncate(story.name, 21)));
      svg.appendChild(el("text", {
        x: position.x + 12,
        y: position.y + 54,
        fill: COLORS.muted,
        "font-size": "10"
      }, task ? "ES " + Core.formatNumber(task.earliestStart, 1) + " EF " + Core.formatNumber(task.earliestFinish, 1) : ""));
    });
  }

  Estimator.Charts = {
    renderHistogram: renderHistogram,
    renderConfidence: renderConfidence,
    renderViolin: renderViolin,
    renderScatter: renderScatter,
    renderSensitivity: renderSensitivity,
    renderDependencyGraph: renderDependencyGraph,
    empty: empty
  };

  return Estimator.Charts;
});
