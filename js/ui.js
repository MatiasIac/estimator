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
  var Report = Estimator.Report;

  var state = {
    stories: [],
    risks: [],
    scenarios: [],
    results: null,
    scenarioResults: [],
    scenarioNotice: "",
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
      targetDurationInput: documentRef.getElementById("targetDurationInput"),
      riskImpactInput: documentRef.getElementById("riskImpactInput"),
      runButton: documentRef.getElementById("runButton"),
      tableBody: documentRef.getElementById("storyTableBody"),
      validationList: documentRef.getElementById("validationList"),
      riskTableBody: documentRef.getElementById("riskTableBody"),
      riskValidationList: documentRef.getElementById("riskValidationList"),
      scenarioTableBody: documentRef.getElementById("scenarioTableBody"),
      scenarioComparisonBody: documentRef.getElementById("scenarioComparisonBody"),
      scenarioValidationList: documentRef.getElementById("scenarioValidationList"),
      addStoryButton: documentRef.getElementById("addStoryButton"),
      addRiskButton: documentRef.getElementById("addRiskButton"),
      addScenarioButton: documentRef.getElementById("addScenarioButton"),
      exportCsvButton: documentRef.getElementById("exportCsvButton"),
      exportResultsButton: documentRef.getElementById("exportResultsButton"),
      exportReportButton: documentRef.getElementById("exportReportButton"),
      runMeta: documentRef.getElementById("runMeta"),
      p50Value: documentRef.getElementById("p50Value"),
      p80Value: documentRef.getElementById("p80Value"),
      p95Value: documentRef.getElementById("p95Value"),
      effortValue: documentRef.getElementById("effortValue"),
      criticalPathValue: documentRef.getElementById("criticalPathValue"),
      criticalPathLabel: documentRef.getElementById("criticalPathLabel"),
      riskExposureValue: documentRef.getElementById("riskExposureValue"),
      riskExposureLabel: documentRef.getElementById("riskExposureLabel"),
      deadlineConfidenceValue: documentRef.getElementById("deadlineConfidenceValue"),
      deadlineConfidenceLabel: documentRef.getElementById("deadlineConfidenceLabel"),
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
      setStories(
        Core.clone(Core.DEFAULT_STORIES),
        true,
        Core.clone(Core.DEFAULT_RISKS),
        Core.clone(Core.DEFAULT_SCENARIOS)
      );
    });

    refs.simulationForm.addEventListener("submit", function submitSimulation(event) {
      event.preventDefault();
      runSimulation();
    });

    refs.addStoryButton.addEventListener("click", addStory);
    refs.addRiskButton.addEventListener("click", addRisk);
    refs.addScenarioButton.addEventListener("click", addScenario);
    refs.exportCsvButton.addEventListener("click", exportCsv);
    refs.exportResultsButton.addEventListener("click", exportResults);
    refs.exportReportButton.addEventListener("click", exportReport);

    refs.tableBody.addEventListener("change", handleTableChange);
    refs.tableBody.addEventListener("click", handleTableClick);
    refs.riskTableBody.addEventListener("change", handleRiskTableChange);
    refs.riskTableBody.addEventListener("click", handleRiskTableClick);
    refs.scenarioTableBody.addEventListener("change", handleScenarioTableChange);
    refs.scenarioTableBody.addEventListener("click", handleScenarioTableClick);

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
      lambda: Core.toNumber(refs.lambdaInput.value, 4),
      targetDuration: readTargetDuration(),
      includeRiskImpacts: refs.riskImpactInput.checked,
      risks: state.risks
    };
  }

  function readTargetDuration() {
    var raw = String(state.refs.targetDurationInput.value || "").trim();
    return raw === "" ? NaN : Core.toNumber(raw, NaN);
  }

  function setStories(stories, shouldRun, risks, scenarios) {
    state.stories = stories.map(function normalizeStory(story, index) {
      return Core.makeStory(story, index);
    });
    state.risks = Array.isArray(risks)
      ? risks.map(function normalizeRisk(risk, index) { return Core.makeRisk(risk, index); })
      : [];
    state.scenarios = Array.isArray(scenarios)
      ? scenarios.map(function normalizeScenario(scenario, index) {
        return Core.makeScenario(scenario, index, readOptions().capacity);
      })
      : Core.clone(Core.DEFAULT_SCENARIOS).map(function normalizeScenario(scenario, index) {
        return Core.makeScenario(scenario, index, readOptions().capacity);
      });
    state.results = null;
    state.scenarioResults = [];
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
    state.scenarioResults = [];
    render();
  }

  function addRisk() {
    var existingIds = new Set(state.risks.map(function getId(risk) { return risk.id; }));
    state.risks.push(
      Core.makeRisk({
        id: Core.uniqueId(existingIds, "risk"),
        description: "New project risk",
        target: "project",
        probability: 25,
        impact: 3,
        owner: "",
        mitigation: "",
        contingency: "",
        status: "open"
      }, state.risks.length)
    );
    state.results = null;
    state.scenarioResults = [];
    render();
  }

  function addScenario() {
    var existingIds = new Set(state.scenarios.map(function getId(scenario) { return scenario.id; }));
    state.scenarios.push(
      Core.makeScenario({
        id: Core.uniqueId(existingIds, "scenario"),
        name: "New scenario",
        enabled: true,
        capacity: readOptions().capacity,
        effortAdjustment: 0,
        riskAdjustment: 0,
        projectDelay: 0,
        notes: ""
      }, state.scenarios.length, readOptions().capacity)
    );
    state.results = null;
    state.scenarioResults = [];
    state.scenarioNotice = "Scenario added. Edit the assumptions, then run the simulation to compare it.";
    render();
    focusScenarioRow(state.scenarios.length - 1);
  }

  function handleTableClick(event) {
    var button = event.target.closest("button[data-action='delete-story']");
    if (!button) {
      return;
    }
    var index = Number(button.dataset.index);
    var deleted = state.stories[index];
    state.stories.splice(index, 1);
    if (deleted) {
      state.risks.forEach(function unlinkRisk(risk) {
        if (risk.target === deleted.id) {
          risk.target = "project";
        }
      });
    }
    state.results = null;
    state.scenarioResults = [];
    render();
  }

  function handleRiskTableClick(event) {
    var button = event.target.closest("button[data-action='delete-risk']");
    if (!button) {
      return;
    }
    var index = Number(button.dataset.index);
    state.risks.splice(index, 1);
    state.results = null;
    state.scenarioResults = [];
    render();
  }

  function handleScenarioTableClick(event) {
    var button = event.target.closest("button[data-action='delete-scenario']");
    if (!button) {
      return;
    }
    var index = Number(button.dataset.index);
    state.scenarios.splice(index, 1);
    state.results = null;
    state.scenarioResults = [];
    state.scenarioNotice = "Scenario removed. Run the simulation again to refresh the comparison.";
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
      var previousId = story.id;
      story.id = Core.normalizeId(input.value);
      state.risks.forEach(function updateLinkedRisk(risk) {
        if (risk.target === previousId) {
          risk.target = story.id;
        }
      });
    } else if (field === "name") {
      story.name = input.value.trim();
    } else if (field === "dependencies") {
      story.dependencies = input.value.split(",").map(Core.normalizeId).filter(Boolean);
    } else if (["o", "m", "p"].indexOf(field) >= 0) {
      story[field] = Core.toNumber(input.value, 0);
    }

    story.estimation = Core.round(Core.pertMean(story.o, story.m, story.p), 2);
    state.results = null;
    state.scenarioResults = [];
    state.scenarioNotice = "Scenario changed. Run the simulation again to refresh the comparison.";
    render();
  }

  function handleRiskTableChange(event) {
    var input = event.target;
    if (!input.dataset || input.dataset.index === undefined) {
      return;
    }

    var index = Number(input.dataset.index);
    var field = input.dataset.field;
    var risk = state.risks[index];
    if (!risk) {
      return;
    }

    if (field === "id") {
      risk.id = Core.normalizeId(input.value);
    } else if (field === "description") {
      risk.description = input.value.trim();
    } else if (field === "target") {
      risk.target = input.value === "project" ? "project" : Core.normalizeId(input.value);
    } else if (field === "probability") {
      risk.probability = Core.clamp(Core.toNumber(input.value, 0), 0, 100);
    } else if (field === "impact") {
      risk.impact = Math.max(0, Core.toNumber(input.value, 0));
    } else if (field === "owner") {
      risk.owner = input.value.trim();
    } else if (field === "mitigation") {
      risk.mitigation = input.value.trim();
    } else if (field === "contingency") {
      risk.contingency = input.value.trim();
    } else if (field === "status") {
      risk.status = Core.normalizeRiskStatus(input.value);
    }

    state.results = null;
    state.scenarioResults = [];
    render();
  }

  function handleScenarioTableChange(event) {
    var input = event.target;
    if (!input.dataset || input.dataset.index === undefined) {
      return;
    }

    var index = Number(input.dataset.index);
    var field = input.dataset.field;
    var scenario = state.scenarios[index];
    if (!scenario) {
      return;
    }

    if (field === "enabled") {
      scenario.enabled = input.checked;
    } else if (field === "id") {
      scenario.id = Core.normalizeId(input.value);
    } else if (field === "name") {
      scenario.name = input.value.trim();
    } else if (field === "capacity") {
      scenario.capacity = Math.max(1, Math.round(Core.toNumber(input.value, readOptions().capacity)));
    } else if (field === "effortAdjustment") {
      scenario.effortAdjustment = Core.clamp(Core.toNumber(input.value, 0), -90, 500);
    } else if (field === "riskAdjustment") {
      scenario.riskAdjustment = Core.clamp(Core.toNumber(input.value, 0), -100, 500);
    } else if (field === "projectDelay") {
      scenario.projectDelay = Math.max(0, Core.toNumber(input.value, 0));
    } else if (field === "notes") {
      scenario.notes = input.value.trim();
    }

    state.results = null;
    state.scenarioResults = [];
    render();
  }

  function runSimulation() {
    var storyErrors = Csv.validateStories(state.stories);
    var riskErrors = Core.validateRisks(state.risks, state.stories);
    var scenarioErrors = Core.validateScenarios(state.scenarios);
    renderValidation(storyErrors);
    renderRiskValidation(riskErrors);
    renderScenarioValidation(scenarioErrors);
    if (storyErrors.length || riskErrors.length || scenarioErrors.length) {
      state.results = null;
      state.scenarioResults = [];
      renderResults();
      return;
    }

    setBusy(true);
    window.setTimeout(function runLater() {
      try {
        var options = readOptions();
        state.results = MonteCarlo.simulate(state.stories, options);
        state.scenarioResults = MonteCarlo.compareScenarios(state.stories, options, state.scenarios);
        renderResults();
      } catch (error) {
        state.results = null;
        state.scenarioResults = [];
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
    renderRiskTable();
    renderScenarioTable();
    renderValidation(Csv.validateStories(state.stories));
    renderRiskValidation(Core.validateRisks(state.risks, state.stories));
    renderScenarioValidation(Core.validateScenarios(state.scenarios));
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

  function renderRiskTable() {
    var body = state.refs.riskTableBody;
    body.innerHTML = "";

    if (!state.risks.length) {
      var row = state.document.createElement("tr");
      row.className = "empty-row";
      var cell = state.document.createElement("td");
      cell.colSpan = 10;
      cell.textContent = "Add project or story-level risks to model uncertainty beyond normal estimates.";
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    state.risks.forEach(function renderRisk(risk, index) {
      var row = state.document.createElement("tr");
      row.appendChild(riskInputCell(risk.id, index, "id", "text"));
      row.appendChild(riskInputCell(risk.description, index, "description", "text"));
      row.appendChild(riskTargetCell(risk.target, index));
      row.appendChild(riskInputCell(risk.probability, index, "probability", "number"));
      row.appendChild(riskInputCell(risk.impact, index, "impact", "number"));
      row.appendChild(riskInputCell(risk.owner, index, "owner", "text"));
      row.appendChild(riskInputCell(risk.mitigation, index, "mitigation", "text"));
      row.appendChild(riskInputCell(risk.contingency, index, "contingency", "text"));
      row.appendChild(riskStatusCell(risk.status, index));

      var actionCell = state.document.createElement("td");
      actionCell.className = "delete-cell";
      var deleteButton = state.document.createElement("button");
      deleteButton.className = "icon-button";
      deleteButton.type = "button";
      deleteButton.dataset.action = "delete-risk";
      deleteButton.dataset.index = String(index);
      deleteButton.setAttribute("aria-label", "Delete " + risk.id);
      deleteButton.title = "Delete risk";
      deleteButton.textContent = "X";
      actionCell.appendChild(deleteButton);
      row.appendChild(actionCell);

      body.appendChild(row);
    });
  }

  function renderScenarioTable() {
    var body = state.refs.scenarioTableBody;
    body.innerHTML = "";

    if (!state.scenarios.length) {
      var row = state.document.createElement("tr");
      row.className = "empty-row";
      var cell = state.document.createElement("td");
      cell.colSpan = 9;
      cell.textContent = "Add scenarios to compare alternate planning assumptions.";
      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    state.scenarios.forEach(function renderScenario(scenario, index) {
      var row = state.document.createElement("tr");
      row.appendChild(scenarioEnabledCell(scenario.enabled, index));
      row.appendChild(scenarioInputCell(scenario.id, index, "id", "text"));
      row.appendChild(scenarioInputCell(scenario.name, index, "name", "text"));
      row.appendChild(scenarioInputCell(scenario.capacity, index, "capacity", "number"));
      row.appendChild(scenarioInputCell(scenario.effortAdjustment, index, "effortAdjustment", "number"));
      row.appendChild(scenarioInputCell(scenario.riskAdjustment, index, "riskAdjustment", "number"));
      row.appendChild(scenarioInputCell(scenario.projectDelay, index, "projectDelay", "number"));
      row.appendChild(scenarioInputCell(scenario.notes, index, "notes", "text"));

      var actionCell = state.document.createElement("td");
      actionCell.className = "delete-cell";
      var deleteButton = state.document.createElement("button");
      deleteButton.className = "icon-button";
      deleteButton.type = "button";
      deleteButton.dataset.action = "delete-scenario";
      deleteButton.dataset.index = String(index);
      deleteButton.setAttribute("aria-label", "Delete " + scenario.id);
      deleteButton.title = "Delete scenario";
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

  function riskInputCell(value, index, field, type) {
    var cell = state.document.createElement("td");
    var input = state.document.createElement("input");
    input.value = value;
    input.dataset.index = String(index);
    input.dataset.field = field;
    input.type = type;
    input.setAttribute("aria-label", field + " for risk row " + (index + 1));
    if (type === "number") {
      input.min = "0";
      input.step = field === "probability" ? "1" : "0.01";
      if (field === "probability") {
        input.max = "100";
      }
    }
    cell.appendChild(input);
    return cell;
  }

  function scenarioEnabledCell(value, index) {
    var cell = state.document.createElement("td");
    var input = state.document.createElement("input");
    input.checked = value !== false;
    input.className = "scenario-check";
    input.dataset.index = String(index);
    input.dataset.field = "enabled";
    input.type = "checkbox";
    input.setAttribute("aria-label", "run scenario row " + (index + 1));
    cell.appendChild(input);
    return cell;
  }

  function scenarioInputCell(value, index, field, type) {
    var cell = state.document.createElement("td");
    var input = state.document.createElement("input");
    input.value = value;
    input.dataset.index = String(index);
    input.dataset.field = field;
    input.type = type;
    input.setAttribute("aria-label", field + " for scenario row " + (index + 1));
    if (type === "number") {
      input.step = field === "capacity" ? "1" : "0.01";
      if (field === "capacity") {
        input.min = "1";
      } else if (field === "effortAdjustment") {
        input.min = "-90";
      } else if (field === "riskAdjustment") {
        input.min = "-100";
      } else {
        input.min = "0";
      }
    }
    cell.appendChild(input);
    return cell;
  }

  function riskTargetCell(value, index) {
    var cell = state.document.createElement("td");
    var select = state.document.createElement("select");
    select.dataset.index = String(index);
    select.dataset.field = "target";
    select.setAttribute("aria-label", "target for risk row " + (index + 1));
    appendOption(select, "project", "Project", value === "project");
    state.stories.forEach(function addStoryOption(story) {
      appendOption(select, story.id, story.id, value === story.id);
    });
    cell.appendChild(select);
    return cell;
  }

  function riskStatusCell(value, index) {
    var cell = state.document.createElement("td");
    var select = state.document.createElement("select");
    select.dataset.index = String(index);
    select.dataset.field = "status";
    select.setAttribute("aria-label", "status for risk row " + (index + 1));
    Core.RISK_STATUSES.forEach(function addStatus(status) {
      appendOption(select, status, status.charAt(0).toUpperCase() + status.slice(1), value === status);
    });
    cell.appendChild(select);
    return cell;
  }

  function appendOption(select, value, label, selected) {
    var option = state.document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = selected;
    select.appendChild(option);
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

  function renderRiskValidation(errors) {
    var box = state.refs.riskValidationList;
    box.className = "validation-list";
    if (!state.risks.length) {
      box.textContent = "";
      return;
    }
    if (errors.length) {
      box.classList.add("has-errors");
      box.textContent = errors.join(" ");
    } else {
      box.classList.add("is-ok");
      box.textContent = "Risk register looks ready. Closed risks are tracked but excluded from simulated impact.";
    }
  }

  function renderScenarioValidation(errors) {
    var box = state.refs.scenarioValidationList;
    box.className = "validation-list";
    if (!state.scenarios.length) {
      box.textContent = "";
      return;
    }
    if (errors.length) {
      box.classList.add("has-errors");
      box.textContent = errors.join(" ");
    } else {
      box.classList.add("is-ok");
      box.textContent = state.scenarioNotice || "Enabled scenarios will be compared after each simulation run.";
    }
  }

  function focusScenarioRow(index) {
    window.setTimeout(function focusLater() {
      var input = state.refs.scenarioTableBody.querySelector(
        "input[data-index='" + index + "'][data-field='name']"
      );
      if (input) {
        input.focus();
        input.select();
      }
    }, 0);
  }

  function renderResults() {
    var results = state.results;
    var refs = state.refs;
    refs.exportResultsButton.disabled = !results;
    refs.exportReportButton.disabled = !results;
    renderRiskKpi(results);
    renderDeadlineKpi(results);

    if (!results) {
      renderScenarioComparison();
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
      " streams, risk impacts " +
      (results.options.includeRiskImpacts ? "on" : "off");

    Charts.renderHistogram(refs.histogramChart, results.raw.durations, results.duration);
    Charts.renderConfidence(refs.confidenceChart, results.duration.sorted);
    Charts.renderViolin(refs.violinChart, results.raw.durations, results.duration);
    Charts.renderScatter(refs.scatterChart, results.raw.scatter, results.duration);
    Charts.renderSensitivity(refs.sensitivityChart, results.sensitivity);
    Charts.renderDependencyGraph(refs.dependencyChart, state.stories, results.deterministic);
    renderScenarioComparison();
  }

  function renderRiskKpi(results) {
    var exposure = Core.riskExposure(state.risks);
    var activeCount = state.risks.filter(Core.isRiskActive).length;

    if (results && results.risk && results.risk.included) {
      state.refs.riskExposureValue.textContent = Core.formatNumber(results.risk.impact.mean, 1);
      state.refs.riskExposureLabel.textContent = activeCount + " active risks included";
      return;
    }

    state.refs.riskExposureValue.textContent = activeCount ? Core.formatNumber(exposure, 1) : "-";
    state.refs.riskExposureLabel.textContent = activeCount
      ? activeCount + " active risks, not simulated"
      : "no active risks";
  }

  function renderDeadlineKpi(results) {
    if (!results || !results.deadline || results.deadline.targetDuration === null) {
      state.refs.deadlineConfidenceValue.textContent = "-";
      state.refs.deadlineConfidenceLabel.textContent = "set a target duration";
      return;
    }

    state.refs.deadlineConfidenceValue.textContent = Core.formatNumber(results.deadline.confidence, 1) + "%";
    state.refs.deadlineConfidenceLabel.textContent =
      "within " + Core.formatNumber(results.deadline.targetDuration, 1) +
      " (" + results.deadline.status + " confidence)";
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

  function renderScenarioComparison() {
    var body = state.refs.scenarioComparisonBody;
    body.innerHTML = "";

    if (!state.scenarioResults.length) {
      var emptyRow = state.document.createElement("tr");
      emptyRow.className = "empty-row";
      var emptyCell = state.document.createElement("td");
      emptyCell.colSpan = 9;
      emptyCell.textContent = state.scenarios.length
        ? "Run a simulation to compare enabled scenarios."
        : "Add scenarios to compare alternate planning assumptions.";
      emptyRow.appendChild(emptyCell);
      body.appendChild(emptyRow);
      return;
    }

    state.scenarioResults.forEach(function renderScenarioResult(item) {
      var summary = item.summary;
      var row = state.document.createElement("tr");
      appendTextCell(row, summary.name);
      appendTextCell(row, Core.formatNumber(summary.capacity, 0));
      appendTextCell(row, Core.formatNumber(summary.p50, 1));
      appendTextCell(row, Core.formatNumber(summary.p80, 1));
      appendTextCell(row, Core.formatNumber(summary.p95, 1));
      appendTextCell(row, formatConfidence(summary.targetConfidence));
      appendTextCell(row, Core.formatNumber(summary.effort, 1));
      appendTextCell(row, Core.formatNumber(summary.riskExposure, 1));
      appendTextCell(row, scenarioAssumptions(summary));
      body.appendChild(row);
    });
  }

  function scenarioAssumptions(summary) {
    var parts = [];
    if (summary.effortAdjustment !== 0) {
      parts.push("effort " + signedPercent(summary.effortAdjustment));
    }
    if (summary.riskAdjustment !== 0) {
      parts.push("risk " + signedPercent(summary.riskAdjustment));
    }
    if (summary.projectDelay > 0) {
      parts.push("delay " + Core.formatNumber(summary.projectDelay, 1));
    }
    if (summary.notes) {
      parts.push(summary.notes);
    }
    return parts.length ? parts.join("; ") : "base assumptions";
  }

  function signedPercent(value) {
    return (value > 0 ? "+" : "") + Core.formatNumber(value, 1) + "%";
  }

  function formatConfidence(value) {
    return Number.isFinite(value) ? Core.formatNumber(value, 1) + "%" : "-";
  }

  function appendTextCell(row, value) {
    var cell = state.document.createElement("td");
    cell.textContent = value;
    row.appendChild(cell);
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
      risks: state.risks,
      scenarios: state.scenarios,
      scenarioResults: state.scenarioResults,
      results: state.results
    };
    Core.downloadFile(
      "monte-carlo-estimation-results.json",
      JSON.stringify(payload, null, 2),
      "application/json;charset=utf-8"
    );
  }

  function exportReport() {
    if (!state.results) {
      return;
    }

    var html = Report.createExecutiveReport({
      generatedAt: new Date().toISOString(),
      stories: state.stories,
      risks: state.risks,
      scenarios: state.scenarios,
      results: state.results,
      scenarioResults: state.scenarioResults,
      charts: collectChartSnapshots()
    });

    Core.downloadFile("executive-estimation-report.html", html, "text/html;charset=utf-8");
  }

  function collectChartSnapshots() {
    return [
      { title: "Project Duration Distribution", container: state.refs.histogramChart },
      { title: "Confidence Curve", container: state.refs.confidenceChart },
      { title: "Violin Distribution", container: state.refs.violinChart },
      { title: "Effort vs Duration", container: state.refs.scatterChart },
      { title: "Sensitivity", container: state.refs.sensitivityChart },
      { title: "Dependency and Critical Path", container: state.refs.dependencyChart }
    ].map(function mapChart(chart) {
      var svg = chart.container.querySelector("svg");
      return {
        title: chart.title,
        svg: svg ? svg.outerHTML : ""
      };
    });
  }

  Estimator.UI = {
    init: init,
    setStories: setStories,
    runSimulation: runSimulation,
    state: state
  };

  return Estimator.UI;
});
