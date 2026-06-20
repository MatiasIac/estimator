(function attachUi(root, factory) {
  var namespace = root.Estimator || (root.Estimator = {});
  var api = factory(namespace);
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function createUi(Estimator) {
  "use strict";

  var Core = Estimator.Core;
  var Csv = Estimator.Csv;
  var Metrics = Estimator.Metrics;
  var MonteCarlo = Estimator.MonteCarlo;
  var Charts = Estimator.Charts;

  var state = {
    stories: [],
    results: null,
    document: null,
    refs: {}
  };

  function init(documentRef) {
    state.document = documentRef;
    state.refs = {
      fileInput: documentRef.getElementById("csvFileInput"),
      dropZone: documentRef.getElementById("dropZone"),
      loadSampleButton: documentRef.getElementById("loadSampleButton"),
      simulationForm: documentRef.getElementById("simulationForm"),
      iterationsInput: documentRef.getElementById("iterationsInput"),
      distributionSelect: documentRef.getElementById("distributionSelect"),
      capacityInput: documentRef.getElementById("capacityInput"),
      lambdaInput: documentRef.getElementById("lambdaInput"),
      runButton: documentRef.getElementById("runButton"),
      tableBody: documentRef.getElementById("storyTableBody"),
      validationList: documentRef.getElementById("validationList"),
      addStoryButton: documentRef.getElementById("addStoryButton"),
      exportCsvButton: documentRef.getElementById("exportCsvButton"),
      exportResultsButton: documentRef.getElementById("exportResultsButton"),
      runMeta: documentRef.getElementById("runMeta"),
      p50Value: documentRef.getElementById("p50Value"),
      p80Value: documentRef.getElementById("p80Value"),
      p95Value: documentRef.getElementById("p95Value"),
      effortValue: documentRef.getElementById("effortValue"),
      criticalPathValue: documentRef.getElementById("criticalPathValue"),
      criticalPathLabel: documentRef.getElementById("criticalPathLabel"),
      histogramChart: documentRef.getElementById("histogramChart"),
      confidenceChart: documentRef.getElementById("confidenceChart"),
      violinChart: documentRef.getElementById("violinChart"),
      scatterChart: documentRef.getElementById("scatterChart"),
      sensitivityChart: documentRef.getElementById("sensitivityChart"),
      dependencyChart: documentRef.getElementById("dependencyChart")
    };

    bindEvents();
    render();
  }

  function bindEvents() {
    var refs = state.refs;

    refs.fileInput.addEventListener("change", function onFileChange(event) {
      var file = event.target.files && event.target.files[0];
      if (file) {
        readCsvFile(file);
      }
      event.target.value = "";
    });

    refs.loadSampleButton.addEventListener("click", function loadSample() {
      setStories(Core.clone(Core.DEFAULT_STORIES), true);
    });

    refs.simulationForm.addEventListener("submit", function submitSimulation(event) {
      event.preventDefault();
      runSimulation();
    });

    refs.addStoryButton.addEventListener("click", addStory);
    refs.exportCsvButton.addEventListener("click", exportCsv);
    refs.exportResultsButton.addEventListener("click", exportResults);

    refs.tableBody.addEventListener("change", handleTableChange);
    refs.tableBody.addEventListener("click", handleTableClick);

    ["dragenter", "dragover"].forEach(function bindDrag(eventName) {
      refs.dropZone.addEventListener(eventName, function onDrag(event) {
        event.preventDefault();
        refs.dropZone.classList.add("is-dragging");
      });
    });

    ["dragleave", "drop"].forEach(function bindLeave(eventName) {
      refs.dropZone.addEventListener(eventName, function onLeave(event) {
        event.preventDefault();
        refs.dropZone.classList.remove("is-dragging");
      });
    });

    refs.dropZone.addEventListener("drop", function onDrop(event) {
      var file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) {
        readCsvFile(file);
      }
    });
  }

  function readCsvFile(file) {
    var reader = new FileReader();
    reader.addEventListener("load", function loaded() {
      try {
        var stories = Csv.storiesFromCsv(reader.result);
        setStories(stories, true);
      } catch (error) {
        renderValidation(["Unable to parse CSV: " + error.message]);
      }
    });
    reader.readAsText(file);
  }

  function readOptions() {
    var refs = state.refs;
    return {
      iterations: Core.toNumber(refs.iterationsInput.value, 10000),
      distribution: refs.distributionSelect.value,
      capacity: Core.toNumber(refs.capacityInput.value, 3),
      lambda: Core.toNumber(refs.lambdaInput.value, 4)
    };
  }

  function setStories(stories, shouldRun) {
    state.stories = stories.map(function normalizeStory(story, index) {
      return Core.makeStory(story, index);
    });
    state.results = null;
    render();
    if (shouldRun) {
      runSimulation();
    }
  }

  function addStory() {
    var existingIds = new Set(state.stories.map(function getId(story) { return story.id; }));
    state.stories.push(
      Core.makeStory({
        id: Core.uniqueId(existingIds, "us"),
        name: "New user story",
        o: 1,
        m: 2,
        p: 3,
        dependencies: []
      }, state.stories.length)
    );
    state.results = null;
    render();
  }

  function handleTableClick(event) {
    var button = event.target.closest("button[data-action='delete-story']");
    if (!button) {
      return;
    }
    var index = Number(button.dataset.index);
    state.stories.splice(index, 1);
    state.results = null;
    render();
  }

  function handleTableChange(event) {
    var input = event.target;
    if (!input.dataset || input.dataset.index === undefined) {
      return;
    }

    var index = Number(input.dataset.index);
    var field = input.dataset.field;
    var story = state.stories[index];
    if (!story) {
      return;
    }

    if (field === "id") {
      story.id = Core.normalizeId(input.value);
    } else if (field === "name") {
      story.name = input.value.trim();
    } else if (field === "dependencies") {
      story.dependencies = input.value.split(",").map(Core.normalizeId).filter(Boolean);
    } else if (["o", "m", "p"].indexOf(field) >= 0) {
      story[field] = Core.toNumber(input.value, 0);
    }

    story.estimation = Core.round(Core.pertMean(story.o, story.m, story.p), 2);
    state.results = null;
    render();
  }

  function runSimulation() {
    var errors = Csv.validateStories(state.stories);
    renderValidation(errors);
    if (errors.length) {
      state.results = null;
      renderResults();
      return;
    }

    setBusy(true);
    window.setTimeout(function runLater() {
      try {
        state.results = MonteCarlo.simulate(state.stories, readOptions());
        renderResults();
      } catch (error) {
        state.results = null;
        renderValidation(["Simulation failed: " + error.message]);
        renderResults();
      } finally {
        setBusy(false);
      }
    }, 20);
  }

  function setBusy(isBusy) {
    state.refs.runButton.disabled = isBusy || !state.stories.length;
    state.refs.runButton.textContent = isBusy ? "Running..." : "Run simulation";
  }

  function render() {
    renderTable();
    renderValidation(Csv.validateStories(state.stories));
    renderResults();
    state.refs.runButton.disabled = !state.stories.length;
    state.refs.exportCsvButton.disabled = !state.stories.length;
  }

  function renderTable() {
    var body = state.refs.tableBody;
    body.innerHTML = "";

    if (!state.stories.length) {
      var row = state.document.createElement("tr");
      row.className = "empty-row";
      var cell = state.document.createElement("td");
      cell.colSpan = 8;
      cell.textContent = "Upload a CSV file or load the sample data to begin.";
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    state.stories.forEach(function renderStory(story, index) {
      var row = state.document.createElement("tr");
      row.appendChild(inputCell(story.id, index, "id", "text"));
      row.appendChild(inputCell(story.name, index, "name", "text"));
      row.appendChild(inputCell(story.o, index, "o", "number"));
      row.appendChild(inputCell(story.m, index, "m", "number"));
      row.appendChild(inputCell(story.p, index, "p", "number"));

      var estimationCell = state.document.createElement("td");
      estimationCell.className = "pert-cell";
      estimationCell.textContent = Core.formatNumber(Core.pertMean(story.o, story.m, story.p), 2);
      row.appendChild(estimationCell);

      row.appendChild(inputCell((story.dependencies || []).join(","), index, "dependencies", "text"));

      var actionCell = state.document.createElement("td");
      actionCell.className = "delete-cell";
      var deleteButton = state.document.createElement("button");
      deleteButton.className = "icon-button";
      deleteButton.type = "button";
      deleteButton.dataset.action = "delete-story";
      deleteButton.dataset.index = String(index);
      deleteButton.setAttribute("aria-label", "Delete " + story.id);
      deleteButton.title = "Delete story";
      deleteButton.textContent = "X";
      actionCell.appendChild(deleteButton);
      row.appendChild(actionCell);

      body.appendChild(row);
    });
  }

  function inputCell(value, index, field, type) {
    var cell = state.document.createElement("td");
    var input = state.document.createElement("input");
    input.value = value;
    input.dataset.index = String(index);
    input.dataset.field = field;
    input.type = type;
    input.setAttribute("aria-label", field + " for row " + (index + 1));
    if (type === "number") {
      input.min = "0";
      input.step = "0.01";
    }
    cell.appendChild(input);
    return cell;
  }

  function renderValidation(errors) {
    var box = state.refs.validationList;
    box.className = "validation-list";
    if (!state.stories.length) {
      box.textContent = "";
      return;
    }
    if (errors.length) {
      box.classList.add("has-errors");
      box.textContent = errors.join(" ");
    } else {
      box.classList.add("is-ok");
      box.textContent = "Data looks ready for simulation.";
    }
  }

  function renderResults() {
    var results = state.results;
    var refs = state.refs;
    refs.exportResultsButton.disabled = !results;

    if (!results) {
      refs.p50Value.textContent = "-";
      refs.p80Value.textContent = "-";
      refs.p95Value.textContent = "-";
      refs.effortValue.textContent = "-";
      refs.criticalPathValue.textContent = "-";
      refs.criticalPathLabel.textContent = state.stories.length ? "run simulation to calculate" : "upload data to calculate";
      refs.runMeta.textContent = state.stories.length ? "Data loaded. Run a simulation." : "No simulation run yet.";
      Charts.empty(refs.histogramChart, "Run a simulation to see the duration distribution.");
      Charts.empty(refs.confidenceChart, "Run a simulation to see the confidence curve.");
      Charts.empty(refs.violinChart, "Run a simulation to see the violin distribution.");
      Charts.empty(refs.scatterChart, "Run a simulation to see effort versus duration.");
      Charts.empty(refs.sensitivityChart, "Run a simulation to see sensitivity.");
      renderDeterministicGraphOnly();
      return;
    }

    refs.p50Value.textContent = Core.formatNumber(results.duration.p50, 1);
    refs.p80Value.textContent = Core.formatNumber(results.duration.p80, 1);
    refs.p95Value.textContent = Core.formatNumber(results.duration.p95, 1);
    refs.effortValue.textContent = Core.formatNumber(results.effort.mean, 1);
    refs.criticalPathValue.textContent = results.deterministic.criticalPath.length + " stories";
    refs.criticalPathLabel.textContent = results.deterministic.criticalPath.join(" -> ");
    refs.runMeta.textContent = results.options.iterations.toLocaleString() +
      " simulations, " +
      (results.options.distribution === "betaPert" ? "Beta-PERT" : "Triangular") +
      ", " +
      results.options.capacity +
      " streams";

    Charts.renderHistogram(refs.histogramChart, results.raw.durations, results.duration);
    Charts.renderConfidence(refs.confidenceChart, results.duration.sorted);
    Charts.renderViolin(refs.violinChart, results.raw.durations, results.duration);
    Charts.renderScatter(refs.scatterChart, results.raw.scatter, results.duration);
    Charts.renderSensitivity(refs.sensitivityChart, results.sensitivity);
    Charts.renderDependencyGraph(refs.dependencyChart, state.stories, results.deterministic);
  }

  function renderDeterministicGraphOnly() {
    if (!state.stories.length || Csv.validateStories(state.stories).length) {
      Charts.empty(state.refs.dependencyChart, "Upload valid story data to see the dependency network.");
      return;
    }
    try {
      var deterministic = Metrics.summarizeDeterministic(state.stories, readOptions().capacity);
      Charts.renderDependencyGraph(state.refs.dependencyChart, state.stories, deterministic);
    } catch (error) {
      Charts.empty(state.refs.dependencyChart, error.message);
    }
  }

  function exportCsv() {
    if (!state.stories.length) {
      return;
    }
    Core.downloadFile("pert-estimates.csv", Csv.storiesToCsv(state.stories), "text/csv;charset=utf-8");
  }

  function exportResults() {
    if (!state.results) {
      return;
    }
    var payload = {
      stories: state.stories,
      results: state.results
    };
    Core.downloadFile(
      "monte-carlo-estimation-results.json",
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
  }

  Estimator.UI = {
    init: init,
    setStories: setStories,
    runSimulation: runSimulation,
    state: state
  };

  return Estimator.UI;
});
