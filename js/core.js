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

  var DEFAULT_RISKS = [
    {
      id: "risk-01",
      description: "Third-party API documentation is incomplete",
      target: "us-04",
      probability: 35,
      impact: 4,
      owner: "Delivery lead",
      mitigation: "Validate API endpoints during discovery.",
      contingency: "Add a small integration spike before build.",
      status: "open"
    },
    {
      id: "risk-02",
      description: "Key reviewer availability delays acceptance",
      target: "project",
      probability: 25,
      impact: 3,
      owner: "Project manager",
      mitigation: "Book review sessions before implementation starts.",
      contingency: "Escalate to backup reviewer.",
      status: "monitoring"
    },
    {
      id: "risk-03",
      description: "Reporting requirements change after demo",
      target: "us-06",
      probability: 20,
      impact: 5,
      owner: "Product owner",
      mitigation: "Confirm report fields with stakeholders.",
      contingency: "Move non-essential report fields to follow-up scope.",
      status: "open"
    }
  ];

  var RISK_STATUSES = ["open", "monitoring", "mitigated", "closed"];

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

  function normalizeRiskStatus(value) {
    var status = String(value || "").trim().toLowerCase();
    return RISK_STATUSES.indexOf(status) >= 0 ? status : "open";
  }

  function makeRisk(raw, index) {
    var source = raw || {};
    var target = source.target === "project" ? "project" : normalizeId(source.target || "project");
    return {
      id: normalizeId(source.id || "risk-" + String(index + 1).padStart(2, "0")),
      description: String(source.description || "New project risk").trim(),
      target: target || "project",
      probability: clamp(toNumber(source.probability, 0), 0, 100),
      impact: Math.max(0, toNumber(source.impact, 0)),
      owner: String(source.owner || "").trim(),
      mitigation: String(source.mitigation || "").trim(),
      contingency: String(source.contingency || "").trim(),
      status: normalizeRiskStatus(source.status)
    };
  }

  function isRiskActive(risk) {
    return normalizeRiskStatus(risk.status) !== "closed";
  }

  function riskExposure(risks) {
    return (risks || []).filter(isRiskActive).reduce(function addExposure(total, risk) {
      return total + (clamp(toNumber(risk.probability, 0), 0, 100) / 100) * Math.max(0, toNumber(risk.impact, 0));
    }, 0);
  }

  function validateRisks(risks, stories) {
    var errors = [];
    var ids = new Set();
    var storyIds = new Set((stories || []).map(function getId(story) { return story.id; }));

    (risks || []).forEach(function validateRisk(risk, index) {
      var label = risk.id || "risk row " + (index + 1);
      if (!risk.id) {
        errors.push("Risk row " + (index + 1) + " is missing an ID.");
      }
      if (ids.has(risk.id)) {
        errors.push("Duplicate risk ID: " + risk.id + ".");
      }
      ids.add(risk.id);

      if (!risk.description) {
        errors.push(label + " is missing a description.");
      }
      if (risk.target !== "project" && !storyIds.has(risk.target)) {
        errors.push(label + " is linked to unknown story " + risk.target + ".");
      }
      if (!Number.isFinite(Number(risk.probability)) || risk.probability < 0 || risk.probability > 100) {
        errors.push(label + " probability must be between 0 and 100.");
      }
      if (!Number.isFinite(Number(risk.impact)) || risk.impact < 0) {
        errors.push(label + " impact must be zero or greater.");
      }
      if (RISK_STATUSES.indexOf(normalizeRiskStatus(risk.status)) < 0) {
        errors.push(label + " has an invalid status.");
      }
    });

    return errors;
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
    DEFAULT_RISKS: DEFAULT_RISKS,
    RISK_STATUSES: RISK_STATUSES,
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
    makeRisk: makeRisk,
    normalizeRiskStatus: normalizeRiskStatus,
    isRiskActive: isRiskActive,
    riskExposure: riskExposure,
    validateRisks: validateRisks,
    downloadFile: downloadFile,
    uniqueId: uniqueId
  };

  return Estimator.Core;
});
