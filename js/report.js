(function attachReport(root, factory) {
  var namespace = root.Estimator || (root.Estimator = {});
  var api = factory(namespace);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createReport(Estimator) {
  "use strict";

  var Core = Estimator.Core;

  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function fmt(value, digits) {
    return Core.formatNumber(value, digits === undefined ? 1 : digits);
  }

  function fmtPercent(value) {
    return Number.isFinite(value) ? fmt(value, 1) + "%" : "-";
  }

  function riskExposure(risk) {
    return (Core.clamp(Core.toNumber(risk.probability, 0), 0, 100) / 100) *
      Math.max(0, Core.toNumber(risk.impact, 0));
  }

  function recommendation(results) {
    if (!results) {
      return {
        duration: "-",
        narrative: "Run a simulation before exporting the executive report."
      };
    }

    var p80 = results.duration.p80;
    var target = results.deadline && results.deadline.targetDuration;
    var confidence = results.deadline && results.deadline.confidence;
    var duration = fmt(p80, 1);
    var narrative = "Use P80 as the recommended external commitment duration. It balances practical planning with an explicit confidence level.";

    if (Number.isFinite(target) && Number.isFinite(confidence)) {
      if (confidence >= 80) {
        narrative = "The target duration is at or above the planning confidence threshold. It can be treated as a defensible commitment if the listed assumptions remain true.";
        duration = fmt(target, 1);
      } else {
        narrative = "The target duration is below the recommended confidence threshold. Consider committing at P80 or changing scope, staffing, or risk assumptions.";
      }
    }

    return {
      duration: duration,
      narrative: narrative
    };
  }

  function table(headers, rows, emptyMessage) {
    var body = rows.length
      ? rows.map(function rowHtml(row) {
        return "<tr>" + row.map(function cellHtml(cell) {
          return "<td>" + escapeHtml(cell) + "</td>";
        }).join("") + "</tr>";
      }).join("")
      : "<tr><td colspan=\"" + headers.length + "\">" + escapeHtml(emptyMessage || "No data available.") + "</td></tr>";

    return "<table><thead><tr>" +
      headers.map(function headerHtml(header) { return "<th>" + escapeHtml(header) + "</th>"; }).join("") +
      "</tr></thead><tbody>" + body + "</tbody></table>";
  }

  function confidenceRows(results) {
    return [
      ["P50", fmt(results.duration.p50, 1), "50% confidence duration"],
      ["P80", fmt(results.duration.p80, 1), "Recommended planning commitment"],
      ["P90", fmt(results.duration.p90, 1), "High-confidence planning view"],
      ["P95", fmt(results.duration.p95, 1), "Risk-aware upper planning boundary"],
      [
        "Target",
        results.deadline && results.deadline.targetDuration !== null
          ? fmt(results.deadline.targetDuration, 1)
          : "-",
        results.deadline && Number.isFinite(results.deadline.confidence)
          ? fmtPercent(results.deadline.confidence) + " probability of finishing by target"
          : "No target duration set"
      ]
    ];
  }

  function topRiskRows(risks) {
    return (risks || [])
      .filter(Core.isRiskActive)
      .slice()
      .sort(function sortExposure(a, b) {
        return riskExposure(b) - riskExposure(a);
      })
      .slice(0, 8)
      .map(function mapRisk(risk) {
        return [
          risk.id,
          risk.description,
          risk.target === "project" ? "Project" : risk.target,
          fmt(risk.probability, 0) + "%",
          fmt(risk.impact, 1),
          fmt(riskExposure(risk), 1),
          risk.owner || "-",
          risk.status
        ];
      });
  }

  function scenarioRows(scenarioResults) {
    return (scenarioResults || []).map(function mapScenario(item) {
      var summary = item.summary;
      return [
        summary.name,
        fmt(summary.capacity, 0),
        fmt(summary.p50, 1),
        fmt(summary.p80, 1),
        fmt(summary.p95, 1),
        fmtPercent(summary.targetConfidence),
        fmt(summary.effort, 1),
        fmt(summary.riskExposure, 1),
        summary.notes || "base assumptions"
      ];
    });
  }

  function assumptionRows(payload) {
    var results = payload.results;
    var risks = payload.risks || [];
    var scenarios = payload.scenarios || [];
    var activeRisks = risks.filter(Core.isRiskActive);
    var enabledScenarios = scenarios.filter(function enabled(scenario) {
      return scenario.enabled !== false;
    });

    return [
      ["Generated", payload.generatedAt || new Date().toISOString()],
      ["Simulations", results.options.iterations.toLocaleString()],
      ["Distribution", results.options.distribution === "betaPert" ? "Beta-PERT" : "Triangular"],
      ["Parallel work streams", fmt(results.options.capacity, 0)],
      ["PERT lambda", fmt(results.options.lambda, 1)],
      ["Risk impacts", results.options.includeRiskImpacts ? "Included" : "Not included"],
      ["Target duration", results.deadline && results.deadline.targetDuration !== null ? fmt(results.deadline.targetDuration, 1) : "Not set"],
      ["Stories", (payload.stories || []).length],
      ["Active risks", activeRisks.length],
      ["Enabled scenarios", enabledScenarios.length]
    ];
  }

  function criticalPathText(results) {
    var path = results.deterministic && results.deterministic.criticalPath;
    return path && path.length ? path.join(" -> ") : "No critical path available.";
  }

  function chartSection(charts) {
    var available = (charts || []).filter(function hasSvg(chart) {
      return chart.svg;
    });

    if (!available.length) {
      return "<section><h2>Charts</h2><p>No chart snapshots were available in this export.</p></section>";
    }

    return "<section><h2>Charts</h2><div class=\"chart-grid\">" +
      available.map(function chartHtml(chart) {
        return "<article class=\"chart-card\"><h3>" + escapeHtml(chart.title) + "</h3>" + chart.svg + "</article>";
      }).join("") +
      "</div></section>";
  }

  function createExecutiveReport(payload) {
    var results = payload.results;
    var rec = recommendation(results);
    var riskMean = results.risk && results.risk.included ? results.risk.impact.mean : results.risk.expectedExposure;
    var deadlineConfidence = results.deadline && Number.isFinite(results.deadline.confidence)
      ? fmtPercent(results.deadline.confidence)
      : "Not set";

    return "<!doctype html>" +
      "<html lang=\"en\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">" +
      "<title>Executive Estimation Report</title>" +
      "<style>" +
      "body{margin:0;background:#eef3f0;color:#172128;font-family:Inter,Segoe UI,Arial,sans-serif;}" +
      ".page{width:min(1180px,calc(100% - 36px));margin:0 auto;padding:28px 0 40px;}" +
      "header{border-bottom:4px solid #0b7f7a;margin-bottom:18px;padding-bottom:18px;}" +
      "h1{font-size:36px;line-height:1;margin:0 0 8px;}h2{font-size:20px;margin:0 0 10px;}h3{font-size:15px;margin:0 0 10px;}" +
      "p{line-height:1.5;color:#4f5d64;}section{background:#fff;border:1px solid #d7e0dc;border-radius:8px;margin:14px 0;padding:18px;box-shadow:0 10px 28px rgba(17,31,38,.08);}" +
      ".kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;}.kpi{border-left:5px solid #0b7f7a;background:#f8fbfa;border-radius:6px;padding:12px;}" +
      ".kpi span{display:block;color:#66727a;font-size:12px;font-weight:800;text-transform:uppercase;}.kpi strong{display:block;font-size:24px;margin-top:8px;}" +
      "table{width:100%;border-collapse:collapse;margin-top:8px;}th,td{border-bottom:1px solid #dfe7e3;padding:9px;text-align:left;vertical-align:top;font-size:13px;}th{color:#66727a;background:#f6f9f8;text-transform:uppercase;font-size:11px;}" +
      ".chart-grid{display:grid;grid-template-columns:1fr;gap:14px;}.chart-card{border:1px solid #dfe7e3;border-radius:8px;padding:12px;overflow:auto;}svg{max-width:100%;height:auto;}" +
      ".recommendation{border-left:5px solid #b87712;background:#fff9ef;}.muted{color:#66727a;}@media print{body{background:#fff}.page{width:100%;padding:0}section{break-inside:avoid;box-shadow:none}}" +
      "</style></head><body><main class=\"page\">" +
      "<header><h1>Executive Estimation Report</h1><p>Monte Carlo project forecast generated from the current estimation dashboard.</p></header>" +
      "<section><h2>Summary KPIs</h2><div class=\"kpis\">" +
      kpi("P50 Duration", fmt(results.duration.p50, 1)) +
      kpi("P80 Duration", fmt(results.duration.p80, 1)) +
      kpi("P95 Duration", fmt(results.duration.p95, 1)) +
      kpi("Expected Effort", fmt(results.effort.mean, 1)) +
      kpi("Risk Exposure", fmt(riskMean, 1)) +
      kpi("Deadline Confidence", deadlineConfidence) +
      "</div></section>" +
      "<section class=\"recommendation\"><h2>Recommended Commitment</h2><p><strong>" + escapeHtml(rec.duration) + "</strong> duration units.</p><p>" + escapeHtml(rec.narrative) + "</p></section>" +
      "<section><h2>Confidence Table</h2>" + table(["Confidence", "Duration", "Meaning"], confidenceRows(results)) + "</section>" +
      "<section><h2>Critical Path</h2><p>" + escapeHtml(criticalPathText(results)) + "</p></section>" +
      "<section><h2>Top Risks</h2>" + table(["ID", "Risk", "Linked To", "Probability", "Impact", "Exposure", "Owner", "Status"], topRiskRows(payload.risks), "No active risks available.") + "</section>" +
      "<section><h2>Scenario Comparison</h2>" + table(["Scenario", "Streams", "P50", "P80", "P95", "Target Confidence", "Effort", "Risk Exposure", "Notes"], scenarioRows(payload.scenarioResults), "No enabled scenarios were simulated.") + "</section>" +
      "<section><h2>Assumptions</h2>" + table(["Assumption", "Value"], assumptionRows(payload)) + "</section>" +
      chartSection(payload.charts) +
      "</main></body></html>";
  }

  function kpi(label, value) {
    return "<div class=\"kpi\"><span>" + escapeHtml(label) + "</span><strong>" + escapeHtml(value) + "</strong></div>";
  }

  Estimator.Report = {
    createExecutiveReport: createExecutiveReport,
    recommendation: recommendation,
    escapeHtml: escapeHtml
  };

  return Estimator.Report;
});
