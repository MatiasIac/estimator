const assert = require("assert/strict");

globalThis.Estimator = {};
require("../js/core");
require("../js/csv");
require("../js/metrics");
require("../js/monteCarlo");

const { Core, Csv, Metrics, MonteCarlo } = globalThis.Estimator;

function approx(actual, expected, tolerance = 0.000001) {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `Expected ${actual} to be within ${tolerance} of ${expected}`
  );
}

function testCsvParsing() {
  const csv = [
    "ID,USER STORY,O,M,P,ESTIMATION,DEPENDENCY",
    "a,Story A,1,1,1,1,",
    "b,Story B,2,2,2,2,a",
    'c,Story C,5,5,5,5,"a,b"'
  ].join("\n");

  const stories = Csv.storiesFromCsv(csv);
  assert.equal(stories.length, 3);
  assert.deepEqual(stories[2].dependencies, ["a", "b"]);
  assert.deepEqual(Csv.validateStories(stories), []);
}

function testValidation() {
  const cycle = [
    Core.makeStory({ id: "a", name: "A", o: 1, m: 1, p: 1, dependencies: ["b"] }, 0),
    Core.makeStory({ id: "b", name: "B", o: 1, m: 1, p: 1, dependencies: ["a"] }, 1)
  ];

  assert.ok(Csv.validateStories(cycle).some((message) => message.includes("cycle")));
}

function testCriticalPath() {
  const stories = [
    Core.makeStory({ id: "a", name: "A", o: 1, m: 1, p: 1 }, 0),
    Core.makeStory({ id: "b", name: "B", o: 2, m: 2, p: 2, dependencies: ["a"] }, 1),
    Core.makeStory({ id: "c", name: "C", o: 5, m: 5, p: 5, dependencies: ["a"] }, 2)
  ];

  const network = Metrics.calculateNetwork(stories);
  approx(network.duration, 6);
  assert.deepEqual(network.criticalPath, ["a", "c"]);
}

function testCapacitySchedule() {
  const stories = [
    Core.makeStory({ id: "a", name: "A", o: 5, m: 5, p: 5 }, 0),
    Core.makeStory({ id: "b", name: "B", o: 5, m: 5, p: 5 }, 1),
    Core.makeStory({ id: "c", name: "C", o: 1, m: 1, p: 1, dependencies: ["a", "b"] }, 2)
  ];

  approx(Metrics.scheduleWithCapacity(stories, null, 2).duration, 6);
  approx(Metrics.scheduleWithCapacity(stories, null, 1).duration, 11);
}

function testMonteCarloDeterministicCase() {
  const stories = [
    Core.makeStory({ id: "a", name: "A", o: 5, m: 5, p: 5 }, 0),
    Core.makeStory({ id: "b", name: "B", o: 5, m: 5, p: 5 }, 1),
    Core.makeStory({ id: "c", name: "C", o: 1, m: 1, p: 1, dependencies: ["a", "b"] }, 2)
  ];

  const results = MonteCarlo.simulate(stories, {
    iterations: 100,
    distribution: "betaPert",
    capacity: 2,
    lambda: 4
  });

  approx(results.duration.p50, 6);
  approx(results.duration.p95, 6);
  approx(results.effort.mean, 11);
  assert.equal(results.sensitivity.length, 3);
}

function testRiskImpactSimulation() {
  const stories = [
    Core.makeStory({ id: "a", name: "A", o: 5, m: 5, p: 5 }, 0),
    Core.makeStory({ id: "b", name: "B", o: 1, m: 1, p: 1, dependencies: ["a"] }, 1)
  ];
  const risks = [
    Core.makeRisk({
      id: "risk-01",
      description: "Story delay",
      target: "a",
      probability: 100,
      impact: 2,
      status: "open"
    }, 0),
    Core.makeRisk({
      id: "risk-02",
      description: "Project delay",
      target: "project",
      probability: 100,
      impact: 3,
      status: "open"
    }, 1)
  ];

  const withRisk = MonteCarlo.simulate(stories, {
    iterations: 100,
    distribution: "betaPert",
    capacity: 1,
    lambda: 4,
    includeRiskImpacts: true,
    risks
  });
  const withoutRisk = MonteCarlo.simulate(stories, {
    iterations: 100,
    distribution: "betaPert",
    capacity: 1,
    lambda: 4,
    includeRiskImpacts: false,
    risks
  });

  approx(withRisk.duration.p50, 11);
  approx(withRisk.effort.mean, 8);
  approx(withRisk.risk.impact.mean, 5);
  approx(withoutRisk.duration.p50, 6);
  assert.equal(Core.validateRisks(risks, stories).length, 0);
}

function testScenarioComparison() {
  const stories = [
    Core.makeStory({ id: "a", name: "A", o: 5, m: 5, p: 5 }, 0),
    Core.makeStory({ id: "b", name: "B", o: 5, m: 5, p: 5 }, 1)
  ];
  const scenarios = [
    Core.makeScenario({
      id: "reduced-capacity",
      name: "Reduced capacity",
      enabled: true,
      capacity: 1,
      effortAdjustment: 0,
      riskAdjustment: 0,
      projectDelay: 0
    }, 0, 2),
    Core.makeScenario({
      id: "added-scope",
      name: "Added scope",
      enabled: true,
      capacity: 2,
      effortAdjustment: 100,
      riskAdjustment: 0,
      projectDelay: 2
    }, 1, 2)
  ];

  const comparison = MonteCarlo.compareScenarios(stories, {
    iterations: 100,
    distribution: "betaPert",
    capacity: 2,
    lambda: 4,
    includeRiskImpacts: false,
    risks: []
  }, scenarios);

  assert.equal(comparison.length, 2);
  approx(comparison[0].summary.p50, 10);
  approx(comparison[0].summary.effort, 10);
  approx(comparison[1].summary.p50, 12);
  approx(comparison[1].summary.effort, 20);
  assert.equal(Core.validateScenarios(scenarios).length, 0);
}

testCsvParsing();
testValidation();
testCriticalPath();
testCapacitySchedule();
testMonteCarloDeterministicCase();
testRiskImpactSimulation();
testScenarioComparison();

console.log("All estimation tests passed.");
