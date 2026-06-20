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

testCsvParsing();
testValidation();
testCriticalPath();
testCapacitySchedule();
testMonteCarloDeterministicCase();

console.log("All estimation tests passed.");
