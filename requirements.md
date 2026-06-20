# Single Page Formal Estimation Tool

This application is a single page application that helps teams and companies to apply formal estimation processes using Monte Carlo Simulation.

The tool uses a PERT estimation CSV with user stories and dependencies uploaded by the user and calculates triangular estimation, beta-pert, user story and project effort vs duration, P50, P80, P90 and P95 confidence, critical path, sensitive diagram, violin distribution diagram, and other relevant one with the help of Monte Carlo Simulation. 

## Requirements

- Single page application that runs in a web browser
- Use pure JavaScript instead of frameworks such as React, Angular or any other similar
- The application must be visually rich so the user can get visual feedback quickly
- The user must upload a CSV file to start the estimation process
- The application will take the CSV that contains the list of user stories for the project to be analyzed and an initial PERT estimation including user stories dependencies
- Once the CSV is parsed, Monte Carlo simulation will be run and produce the expected diagrams and values mentioned for the application
- Graphs and charts must be visually rich. D3 or any other JavaScript free graph and chart plugin or framework is allowed to be used
- Resulting data must be exportable
- Information must be presented as a executive control panel so project managers or any other interested user can easily interact with the information
- Number of simulations for Monte Carlo, as any other important variable must be modifiable by the user
- The user must be able to modify values in the interface and run the simulation and all the results as much as they would like
- Once CSV is uploaded, the user should be able to update the data in the web page any time

## Technical requirements

- JavaScript code, CSS code and any other must be placed in its own folders and files
- Avoid spaghetti code
- It must be coded as very high level development
- Code quality is a must
- Unit tests are recommended 

## CSV file template

To start the estimation process the user must upload a CSV file that contains the users stories and the initial PERT (Optimistic, Most Likely, Pesimistic) estimation using the formula "(o + (m * 4) + p)/6". 

```csv
ID,USER STORY,O,M,P,ESTIMATION,DEPENDENCY
us-01,User Story 1,1,4,6,5.75,
us-02,User Story 2,1,2,4,2.17,"us-01"
us-03,User Story 3,1,2,3,2,"us-01,us-02"
```
- User Stories require an ID that must be unique
- O column represent the Optimistic value
- M column represent the Most Likely value
- P column represent the Pesimistic value
- ESTIMATION represent the estimation calculation using PERT formula
- DEPENDENCY list all the user stories IDs that must be completed before the current user story can be consider completed or start working (This will be used to form a critical path and dependency diagram, plus effort vs duration to complete the current estimated project)

