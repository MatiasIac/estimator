(function attachCore(root, factory) {
  var namespace = root.Estimator || (root.Estimator = {});
  var api = factory(namespace);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createCore(Estimator) {
  "use strict";

  var DEFAULT_STORIES = [
    {
      id: "us-01",
      name: "Discovery workshop",
      o: 1,
      m: 2,
      p: 4,
      estimation: 2.17,
      dependencies: []
    },
    {
      id: "us-02",
      name: "Authentication foundation",
      o: 2,
      m: 4,
      p: 7,
      estimation: 4.17,
      dependencies: ["us-01"]
    },
    {
      id: "us-03",
      name: "Customer dashboard",
      o: 3,
      m: 5,
      p: 9,
      estimation: 5.33,
      dependencies: ["us-02"]
    },
    {
      id: "us-04",
      name: "Estimator CSV import",
      o: 2,
      m: 4,
      p: 8,
      estimation: 4.33,
      dependencies: ["us-02"]
    },
    {
      id: "us-05",
      name: "Monte Carlo calculation",
      o: 3,
      m: 6,
      p: 11,
      estimation: 6.33,
      dependencies: ["us-04"]
    },
    {
      id: "us-06",
      name: "Executive reporting",
      o: 2,
      m: 3,
      p: 6,
      estimation: 3.33,
      dependencies: ["us-03", "us-05"]
    },
    {
      id: "us-07",
      name: "Export package",
      o: 1,
      m: 2,
      p: 5,
      estimation: 2.33,
      dependencies: ["us-05"]
    },
    {
      id: "us-08",
      name: "UAT and rollout",
      o: 2,
      m: 4,
      p: 7,
      estimation: 4.17,
      dependencies: ["us-06", "us-07"]
    }
  ];

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function toNumber(value, fallback) {
    var parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function round(value, digits) {
    var places = Number.isFinite(digits) ? digits : 2;
    var factor = Math.pow(10, places);
    return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function pertMean(o, m, p) {
    return (toNumber(o, 0) + 4 * toNumber(m, 0) + toNumber(p, 0)) / 6;
  }

  function formatNumber(value, digits) {
    if (!Number.isFinite(value)) {
      return "-";
    }
    var places = Number.isFinite(digits) ? digits : 1;
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: places,
      minimumFractionDigits: value < 10 && value % 1 !== 0 ? Math.min(places, 2) : 0
    }).format(value);
  }

  function mean(values) {
    if (!values.length) {
      return 0;
    }
    return values.reduce(function sum(total, value) {
      return total + value;
    }, 0) / values.length;
  }

  function percentile(sortedValues, probability) {
    if (!sortedValues.length) {
      return 0;
    }
    var p = probability > 1 ? probability / 100 : probability;
    var position = clamp(p, 0, 1) * (sortedValues.length - 1);
    var lower = Math.floor(position);
    var upper = Math.ceil(position);
    if (lower === upper) {
      return sortedValues[lower];
    }
    var weight = position - lower;
    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  function sum(values) {
    return values.reduce(function add(total, value) {
      return total + value;
    }, 0);
  }

  function normalizeId(value) {
    return String(value || "")
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w.-]/g, "")
      .toLowerCase();
  }

  function makeStory(raw, index) {
    var id = normalizeId(raw.id || "us-" + String(index + 1).padStart(2, "0"));
    var o = toNumber(raw.o, 0);
    var m = toNumber(raw.m, o);
    var p = toNumber(raw.p, m);
    return {
      id: id,
      name: String(raw.name || raw.userStory || "User Story " + (index + 1)).trim(),
      o: o,
      m: m,
      p: p,
      estimation: round(toNumber(raw.estimation, pertMean(o, m, p)), 2),
      dependencies: Array.isArray(raw.dependencies)
        ? raw.dependencies.map(normalizeId).filter(Boolean)
        : []
    };
  }

  function downloadFile(filename, content, mimeType) {
    var blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function uniqueId(existingIds, prefix) {
    var base = prefix || "us";
    var attempt = 1;
    var id = "";
    do {
      id = base + "-" + String(attempt).padStart(2, "0");
      attempt += 1;
    } while (existingIds.has(id));
    return id;
  }

  Estimator.Core = {
    DEFAULT_STORIES: DEFAULT_STORIES,
    clone: clone,
    toNumber: toNumber,
    round: round,
    clamp: clamp,
    pertMean: pertMean,
    formatNumber: formatNumber,
    mean: mean,
    percentile: percentile,
    sum: sum,
    normalizeId: normalizeId,
    makeStory: makeStory,
    downloadFile: downloadFile,
    uniqueId: uniqueId
  };

  return Estimator.Core;
});
