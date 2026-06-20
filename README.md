# Formal Estimation Tool

Formal Estimation Tool is a browser-based project estimation dashboard for teams that want to move beyond single-point estimates. It uses PERT estimates, story dependencies, risk data, and Monte Carlo simulation to show a realistic range of possible delivery outcomes.

The application runs as a single-page web app with plain JavaScript, CSS, and HTML. There is no framework or build step required.

## Why This Approach Helps

Traditional project plans often depend on one expected delivery date. That can make plans look more certain than they really are. Real delivery work has uncertainty: some stories finish quickly, some take longer, dependencies block parallel work, known risks may trigger, and a few high-risk items can drive the whole schedule.

This tool treats estimation as a range instead of a promise. Each story is estimated with:

- optimistic effort
- most likely effort
- pessimistic effort

The app then runs thousands of simulated project outcomes. This gives project managers and stakeholders a better view of schedule confidence, delivery risk, and the stories or risks that most influence the final date.

For example, instead of saying, "The project will take 30 days," the dashboard can show that the project may have a P50 duration of 30 days, a P80 duration of 38 days, and a P95 duration of 46 days. That makes planning conversations more honest and easier to defend.

## Key Benefits

- Shows delivery confidence levels such as P50, P80, P90, and P95.
- Helps teams choose planning commitments based on risk tolerance.
- Highlights critical path dependencies that drive the schedule.
- Shows which stories have the greatest sensitivity to project duration.
- Tracks project and story-level risks that can optionally affect the simulation.
- Lets users compare Beta-PERT and triangular estimation distributions.
- Supports quick scenario analysis by changing estimates, dependencies, simulation count, risks, and parallel work streams.
- Gives executives and project managers visual feedback without needing a spreadsheet model.
- Keeps all data local in the browser unless the user exports it.

## Features

- CSV upload for user stories, PERT estimates, and dependencies.
- Editable story table after upload.
- Risk register with probability, impact, owner, mitigation, contingency, and status.
- Optional risk-adjusted simulation impact.
- Monte Carlo simulation with configurable simulation count.
- Beta-PERT and triangular distribution options.
- Configurable parallel work streams to model team capacity.
- Configurable PERT lambda for Beta-PERT uncertainty shaping.
- Project duration distribution chart.
- Confidence curve chart.
- Violin distribution chart.
- Effort versus duration scatter chart.
- Sensitivity chart showing story influence.
- Dependency and critical path graph.
- KPI cards for P50, P80, P95, expected effort, critical path size, and risk exposure.
- CSV export for updated estimate data.
- JSON export for simulation results and risk data.
- Unit tests for parsing, scheduling, risk impact, and simulation logic.

## Basic Workflow

1. Open `index.html` in a web browser.
2. Upload a CSV file with user stories, estimates, and dependencies.
3. Review the parsed story data in the editable table.
4. Adjust estimates, dependencies, or story names if needed.
5. Add or update risks in the risk register if the project has known uncertainty beyond normal story estimates.
6. Choose the simulation settings:
   - number of simulations
   - distribution type
   - parallel work streams
   - PERT lambda
   - whether risk impacts should be included
7. Run the simulation.
8. Review the dashboard:
   - confidence values
   - project duration distribution
   - critical path
   - sensitivity drivers
   - effort versus duration
   - risk exposure
9. Export the updated CSV or JSON results when needed.

## CSV Format

The CSV file should include these columns:

```csv
ID,USER STORY,O,M,P,ESTIMATION,DEPENDENCY
us-01,User Story 1,1,4,6,5.75,
us-02,User Story 2,1,2,4,2.17,"us-01"
us-03,User Story 3,1,2,3,2,"us-01,us-02"
```

Column meanings:

- `ID`: unique story identifier.
- `USER STORY`: short story name or description.
- `O`: optimistic estimate.
- `M`: most likely estimate.
- `P`: pessimistic estimate.
- `ESTIMATION`: PERT estimate, usually calculated as `(O + 4M + P) / 6`.
- `DEPENDENCY`: comma-separated list of story IDs that must finish first.

A sample file is available at `data/sample-estimates.csv`.

## Estimation Settings

### Parallel Work Streams

Parallel work streams represent how many stories can be worked on at the same time. A value of `1` models sequential delivery. A value of `3` allows up to three dependency-ready stories to run in parallel.

This setting affects project duration, but not total effort.

### Distribution

The app supports two distribution types:

- `Beta-PERT`: a smooth distribution that usually clusters more naturally around the most likely estimate. This is the recommended default for formal estimation.
- `Triangular`: a simpler distribution that uses straight-line probability from optimistic to most likely to pessimistic.

### PERT Lambda

PERT lambda controls how tightly Beta-PERT samples cluster around the most likely estimate.

Lower values create wider uncertainty. Higher values create tighter clustering around the most likely estimate.

### Risk Register

The risk register captures uncertainty that is different from normal estimate variation. A story estimate describes how long the planned work may take. A risk describes something that may or may not happen, such as a delayed decision, unclear dependency, unavailable stakeholder, unstable integration, or late scope clarification.

Each risk can be linked to the whole project or to a specific story. Story-linked risks add impact to that story when they trigger during a simulation run. Project-level risks add schedule impact after the dependency schedule is calculated. Closed risks remain visible for tracking, but they are not included in simulated impact.

Use the `Include risk impacts` setting to compare the normal forecast with the risk-adjusted forecast.

## Running Tests

The project includes a small test script with no external dependencies.

```powershell
node tests\estimation.test.js
```

If your PowerShell policy allows npm scripts, this also works:

```powershell
npm test
```

## Project Structure

```text
.
|-- index.html
|-- css/
|   `-- styles.css
|-- js/
|   |-- app.js
|   |-- charts.js
|   |-- core.js
|   |-- csv.js
|   |-- metrics.js
|   |-- monteCarlo.js
|   `-- ui.js
|-- data/
|   `-- sample-estimates.csv
`-- tests/
    `-- estimation.test.js
```

## Notes

This tool is intended to support planning conversations, not replace professional judgment. The quality of the output depends on the quality of the input estimates, dependency mapping, risk assumptions, and assumptions about team capacity.

The best use of the tool is to compare scenarios, understand uncertainty, and make project commitments with a clear confidence level.
