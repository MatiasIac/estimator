(function attachMonteCarlo(root, factory) {
  var namespace = root.Estimator || (root.Estimator = {});
  var api = factory(namespace);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createMonteCarlo(Estimator) {
  "use strict";

  var Core = Estimator.Core;
  var Metrics = Estimator.Metrics;

  function sampleTriangular(o, m, p) {
    if (p <= o) {
      return m;
    }
    var mode = Core.clamp(m, o, p);
    var u = Math.random();
    var split = (mode - o) / (p - o);
    if (u < split) {
      return o + Math.sqrt(u * (p - o) * (mode - o));
    }
    return p - Math.sqrt((1 - u) * (p - o) * (p - mode));
  }

  function sampleNormal() {
    var u = 0;
    var v = 0;
    while (u === 0) {
      u = Math.random();
    }
    while (v === 0) {
      v = Math.random();
    }
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function sampleGamma(shape) {
    if (shape <= 0) {
      return 0;
    }

    if (shape < 1) {
      return sampleGamma(shape + 1) * Math.pow(Math.random(), 1 / shape);
    }

    var d = shape - 1 / 3;
    var c = 1 / Math.sqrt(9 * d);

    while (true) {
      var x = sampleNormal();
      var v = Math.pow(1 + c * x, 3);
      if (v <= 0) {
        continue;
      }
      var u = Math.random();
      if (u < 1 - 0.0331 * Math.pow(x, 4)) {
        return d * v;
      }
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) {
        return d * v;
      }
    }
  }

  function sampleBeta(alpha, beta) {
    var x = sampleGamma(alpha);
    var y = sampleGamma(beta);
    var total = x + y;
    if (total === 0) {
      return alpha / (alpha + beta);
    }
    return x / total;
  }

  function sampleBetaPert(o, m, p, lambda) {
    if (p <= o) {
      return m;
    }
    var mode = Core.clamp(m, o, p);
    var weight = Core.toNumber(lambda, 4);
    var alpha = 1 + weight * ((mode - o) / (p - o));
    var beta = 1 + weight * ((p - mode) / (p - o));
    return o + sampleBeta(alpha, beta) * (p - o);
  }

  function sampleStory(story, distribution, lambda) {
    if (distribution === "triangular") {
      return sampleTriangular(story.o, story.m, story.p);
    }
    return sampleBetaPert(story.o, story.m, story.p, lambda);
  }

  function summarize(values) {
    var sorted = values.slice().sort(function ascending(a, b) { return a - b; });
    return {
      min: sorted[0] || 0,
      max: sorted[sorted.length - 1] || 0,
      mean: Core.mean(sorted),
      p50: Core.percentile(sorted, 0.5),
      p80: Core.percentile(sorted, 0.8),
      p90: Core.percentile(sorted, 0.9),
      p95: Core.percentile(sorted, 0.95),
      sorted: sorted
    };
  }

  function simulate(stories, options) {
    var settings = options || {};
    var iterations = Math.round(
      Core.clamp(Core.toNumber(settings.iterations, 10000), 100, 100000)
    );
    var distribution = settings.distribution === "triangular" ? "triangular" : "betaPert";
    var capacity = Math.max(1, Math.round(Core.toNumber(settings.capacity, 1)));
    var lambda = Core.clamp(Core.toNumber(settings.lambda, 4), 1, 10);
    var projectDelay = Math.max(0, Core.toNumber(settings.projectDelay, 0));
    var includeRiskImpacts = settings.includeRiskImpacts === true;
    var risks = (settings.risks || []).map(function normalizeRisk(risk, index) {
      return Core.makeRisk(risk, index);
    });
    var activeRisks = risks.filter(Core.isRiskActive);
    var durations = [];
    var efforts = [];
    var riskImpacts = [];
    var scatter = [];
    var storyAccumulators = new Map();
    var storyStats = new Map();
    var riskStats = new Map();
    var sumY = 0;
    var sumY2 = 0;
    var scatterStep = Math.max(1, Math.floor(iterations / 1200));

    activeRisks.forEach(function initializeRiskStats(risk) {
      riskStats.set(risk.id, {
        id: risk.id,
        description: risk.description,
        target: risk.target,
        probability: risk.probability,
        impact: risk.impact,
        triggerCount: 0,
        totalImpact: 0
      });
    });

    stories.forEach(function initializeAccumulator(story) {
      storyAccumulators.set(story.id, {
        id: story.id,
        name: story.name,
        sumX: 0,
        sumX2: 0,
        sumXY: 0
      });
      storyStats.set(story.id, {
        id: story.id,
        name: story.name,
        sum: 0,
        sum2: 0
      });
    });

    for (var index = 0; index < iterations; index += 1) {
      var durationById = {};
      var storyRiskImpactById = {};
      var projectRiskImpact = 0;
      var totalRiskImpact = 0;
      var effort = 0;

      if (includeRiskImpacts) {
        activeRisks.forEach(function sampleRisk(risk) {
          var probability = Core.clamp(Core.toNumber(risk.probability, 0), 0, 100) / 100;
          var impact = Math.max(0, Core.toNumber(risk.impact, 0));
          if (Math.random() > probability) {
            return;
          }

          var stats = riskStats.get(risk.id);
          stats.triggerCount += 1;
          stats.totalImpact += impact;
          totalRiskImpact += impact;

          if (risk.target === "project") {
            projectRiskImpact += impact;
          } else {
            storyRiskImpactById[risk.target] = (storyRiskImpactById[risk.target] || 0) + impact;
          }
        });
      }

      stories.forEach(function sample(story) {
        var sampledDuration = sampleStory(story, distribution, lambda) + (storyRiskImpactById[story.id] || 0);
        durationById[story.id] = sampledDuration;
        effort += sampledDuration;

        var perStory = storyStats.get(story.id);
        perStory.sum += sampledDuration;
        perStory.sum2 += sampledDuration * sampledDuration;
      });

      var scheduled = Metrics.scheduleWithCapacity(stories, durationById, capacity);
      var projectDuration = scheduled.duration + projectRiskImpact + projectDelay;

      durations.push(projectDuration);
      efforts.push(effort);
      riskImpacts.push(totalRiskImpact);
      sumY += projectDuration;
      sumY2 += projectDuration * projectDuration;

      if (index % scatterStep === 0) {
        scatter.push({
          duration: projectDuration,
          effort: effort
        });
      }

      stories.forEach(function updateSensitivity(story) {
        var x = durationById[story.id];
        var accumulator = storyAccumulators.get(story.id);
        accumulator.sumX += x;
        accumulator.sumX2 += x * x;
        accumulator.sumXY += x * projectDuration;
      });
    }

    var durationSummary = summarize(durations);
    var effortSummary = summarize(efforts);
    var riskImpactSummary = summarize(riskImpacts);
    var meanY = sumY / iterations;
    var varianceY = sumY2 - iterations * meanY * meanY;

    var sensitivity = Array.from(storyAccumulators.values()).map(function mapSensitivity(item) {
      var meanX = item.sumX / iterations;
      var varianceX = item.sumX2 - iterations * meanX * meanX;
      var covariance = item.sumXY - iterations * meanX * meanY;
      var denominator = Math.sqrt(Math.max(varianceX, 0) * Math.max(varianceY, 0));
      return {
        id: item.id,
        name: item.name,
        correlation: denominator === 0 ? 0 : covariance / denominator,
        influence: denominator === 0 ? 0 : Math.abs(covariance / denominator)
      };
    }).sort(function sortInfluence(a, b) {
      return b.influence - a.influence;
    });

    var perStory = Array.from(storyStats.values()).map(function mapStoryStats(item) {
      var mean = item.sum / iterations;
      var variance = item.sum2 / iterations - mean * mean;
      return {
        id: item.id,
        name: item.name,
        mean: mean,
        standardDeviation: Math.sqrt(Math.max(variance, 0))
      };
    });

    var perRisk = Array.from(riskStats.values()).map(function mapRiskStats(item) {
      return {
        id: item.id,
        description: item.description,
        target: item.target,
        probability: item.probability,
        impact: item.impact,
        triggerRate: (item.triggerCount / iterations) * 100,
        expectedImpact: item.totalImpact / iterations
      };
    }).sort(function sortRiskExposure(a, b) {
      return b.expectedImpact - a.expectedImpact;
    });

    return {
      options: {
        iterations: iterations,
        distribution: distribution,
        capacity: capacity,
        lambda: lambda,
        projectDelay: projectDelay,
        includeRiskImpacts: includeRiskImpacts
      },
      deterministic: Metrics.summarizeDeterministic(stories, capacity),
      duration: durationSummary,
      effort: effortSummary,
      risk: {
        included: includeRiskImpacts,
        activeCount: activeRisks.length,
        expectedExposure: Core.riskExposure(activeRisks),
        impact: riskImpactSummary,
        stats: perRisk
      },
      raw: {
        durations: durations,
        efforts: efforts,
        riskImpacts: riskImpacts,
        scatter: scatter
      },
      sensitivity: sensitivity,
      storyStats: perStory,
      generatedAt: new Date().toISOString()
    };
  }

  function simulateScenario(stories, options, scenario) {
    var baseOptions = options || {};
    var settings = Core.makeScenario(scenario, 0, baseOptions.capacity || 1);
    var scenarioStories = Core.applyScenarioToStories(stories, settings);
    var scenarioRisks = Core.applyScenarioToRisks(baseOptions.risks || [], settings);
    var scenarioOptions = {
      iterations: baseOptions.iterations,
      distribution: baseOptions.distribution,
      capacity: settings.capacity,
      lambda: baseOptions.lambda,
      includeRiskImpacts: baseOptions.includeRiskImpacts,
      risks: scenarioRisks,
      projectDelay: settings.projectDelay
    };
    var result = simulate(scenarioStories, scenarioOptions);

    return {
      scenario: settings,
      result: result,
      summary: {
        id: settings.id,
        name: settings.name,
        capacity: settings.capacity,
        effortAdjustment: settings.effortAdjustment,
        riskAdjustment: settings.riskAdjustment,
        projectDelay: settings.projectDelay,
        p50: result.duration.p50,
        p80: result.duration.p80,
        p90: result.duration.p90,
        p95: result.duration.p95,
        effort: result.effort.mean,
        riskExposure: result.risk.expectedExposure,
        notes: settings.notes
      }
    };
  }

  function compareScenarios(stories, options, scenarios) {
    return (scenarios || [])
      .map(function normalizeScenario(scenario, index) {
        return Core.makeScenario(scenario, index, options && options.capacity);
      })
      .filter(function enabledScenario(scenario) {
        return scenario.enabled;
      })
      .map(function runScenario(scenario) {
        return simulateScenario(stories, options, scenario);
      });
  }

  Estimator.MonteCarlo = {
    sampleTriangular: sampleTriangular,
    sampleBetaPert: sampleBetaPert,
    simulate: simulate,
    simulateScenario: simulateScenario,
    compareScenarios: compareScenarios,
    summarize: summarize
  };

  return Estimator.MonteCarlo;
});
