# ChemEFlow

[Versión en español](README.es.md)

**ChemEFlow** is a visual educational tool for building flowsheets, defining equations, analyzing model readiness, solving small chemical engineering models, and reviewing structured results.

## Live Demo

[Open ChemEFlow online](https://imclick-project.github.io/ChemEFlow/)

## Problem

Chemical engineering students often use separate tools for flowsheets, equations, numerical solution, programming, and result analysis. This fragmentation can make it difficult to understand:

- where variables come from;
- how streams, equations, and results are connected;
- whether a model is complete and solvable;
- why a system cannot be solved;
- how the final result was obtained;
- how a mathematical model can be translated into executable code.

Programming can also become an additional barrier. Students may understand the engineering equations but still struggle to organize variables, construct numerical systems, manage dependencies, and implement the model correctly in Python or MATLAB.

## Solution

ChemEFlow addresses these challenges by integrating the visual and mathematical modeling workflow in a single environment. It also allows solved models to be exported as reusable Python and MATLAB code, helping connect equation-based modeling with programming.

The application already includes an optional Python API for model analysis and numerical solution. This backend also provides a foundation for future integration with scientific Python libraries for thermodynamic properties, nonlinear equation solving, data analysis, and graphical visualization.

ChemEFlow organizes the workflow into four connected tabs:

- **Components:** define the chemical components used in the model.
- **Flowsheet:** create sources, sinks, unit operations, streams, and process connections.
- **Equations:** declare variables, build linear systems, define target-variable functions, and analyze dependencies.
- **Results:** review solved and unresolved variables, mass and molar tables, basis conversions, and exports.

## Main Features

- Visual flowsheet construction.
- Component, stream, and variable configuration.
- Linear-system analysis and solution.
- Target-variable functions.
- Dependency and cycle detection.
- Separate **Analyze** and **Solve** actions.
- Optional Python backend with JavaScript fallback.
- Save and load complete projects.
- Export results to CSV.
- Export runnable Python code.
- Export runnable MATLAB code.

## Typical Workflow

```text
Components
    ↓
Flowsheet
    ↓
Variable configuration
    ↓
Equation blocks
    ↓
Analyze
    ↓
Solve
    ↓
Results and export
```

## Worked Example

A complete worked example will be included in this repository with:

- step-by-step instructions;
- screenshots of the main workflow;
- the saved ChemEFlow project;
- generated CSV results;
- exported Python code;
- exported MATLAB code.

The example can be executed directly from the public GitHub Pages version using the JavaScript solver fallback. The same workflow can also be run locally with the optional Python backend for Python-assisted analysis and solution.

In addition to this complete example, the repository is intended to grow into a library of solved chemical engineering problems that users can reproduce, modify, and use as learning references.

Links:

- [Worked example](docs/worked-example.md)
- [Generated files](examples/worked-example/)
- [Solved-problem library](examples/)

This documentation allows users and reviewers to reproduce the complete workflow from process construction to numerical results and code export.

## Architecture

```text
┌──────────────────────────────────────────────────────────┐
│                    ChemEFlow Frontend                     │
│                 React + Vite + React Flow                 │
│                                                          │
│ Components → Flowsheet → Equations → Results             │
└───────────────────────────┬──────────────────────────────┘
                            │ HTTP API when available
                            ▼
┌──────────────────────────────────────────────────────────┐
│                 Optional Python Backend                   │
│                    FastAPI + NumPy                        │
│                                                          │
│ Health check · Analysis · Linear-system solution         │
└───────────────────────────┬──────────────────────────────┘
                            │
                            ├── Current: NumPy calculations
                            │
                            └── Future: scientific Python libraries
                                        for properties, nonlinear
                                        equations, data analysis,
                                        and visualization

JavaScript fallback is used when the Python backend is unavailable.
```

## Technology Stack

### Frontend

- React
- Vite
- React Flow / XYFlow
- JavaScript
- HTML
- CSS

### Backend

- Python
- FastAPI
- Uvicorn
- NumPy

### Deployment and Development

- GitHub
- GitHub Pages
- GitHub Actions
- Anaconda
- Visual Studio Code
- Kiro

## Online and Local Execution

The public version is deployed through GitHub Pages and runs directly in the browser.

Because GitHub Pages only hosts static files, the online version uses the JavaScript solver fallback.

The local version can optionally connect to the Python backend for analysis and numerical solution.

## Run Locally

### Requirements

- Node.js 20 or later
- npm
- Optional: Python 3.11
- Optional: Anaconda

### Clone the Repository

```bash
git clone https://github.com/IMClick-Project/ChemEFlow.git
cd ChemEFlow
```

### Run the Frontend

```bash
npm install
npm run dev
```

Open the address shown by Vite, normally:

```text
http://localhost:5173
```

### Run the Optional Python Backend with Anaconda

```bash
conda create -n chemeflow python=3.11
conda activate chemeflow
cd backend
pip install -r requirements.txt
python -m uvicorn app.main:app --reload --port 8000
```

If the backend entry point is `main.py` directly, use:

```bash
python -m uvicorn main:app --reload --port 8000
```

Backend health check:

```text
http://127.0.0.1:8000/health
```

API documentation:

```text
http://127.0.0.1:8000/docs
```

## Production Build

```bash
npm run build
npm run preview
```

The production files are generated in:

```text
dist/
```

## Use of Kiro

Kiro was used during the early development of ChemEFlow, starting from the initial project idea. It helped transform the concept into a clearer application structure, identify the main modules, and establish a more organized development path.

Working with Kiro was particularly useful because the project required moving beyond my primary area of chemical engineering and into web development. It helped suggest interface structures, workflows, and implementation considerations that might not have been immediately evident from a chemical engineering perspective.

However, effective use of Kiro still required basic knowledge of web development and the technologies used in the project. This knowledge was necessary to evaluate suggestions, guide the implementation, identify incorrect assumptions, and progressively refine the application.

Kiro therefore served as a development assistant and design-support tool, while the final technical decisions, testing, corrections, and integration were guided by the project requirements and engineering objectives.

## Cloud Deployment

The current public prototype is deployed through GitHub Pages.

AWS services were not integrated into the final architecture of this hackathon version.

The application can run entirely in the browser using the JavaScript fallback, while an optional FastAPI and NumPy backend is available for local Python-assisted solving.

## Why ChemEFlow Matters

ChemEFlow addresses a real educational need by connecting process structure, equations, analysis, solution, programming, and results in one workflow.

Its main contribution is not a new numerical algorithm or process simulator. The contribution is an integrated educational environment where users can see:

- how the model is built;
- where variables originate;
- what each equation depends on;
- whether the model is solvable;
- how the result is generated;
- how the model can be exported and reused.

It also acts as a bridge between equation-based modeling and programming by generating reusable Python and MATLAB implementations from the model created visually.

The existing Python API also creates a practical foundation for extending ChemEFlow with scientific Python libraries without redesigning the complete application architecture.

## Current Limitations

- ChemEFlow is not a replacement for a rigorous process simulator.
- The public GitHub Pages version cannot execute the Python backend.
- Thermodynamic-property packages are not yet integrated.
- Basis conversion requires molecular-weight information.
- The current prototype focuses on small educational models.
- Advanced unit-operation models are not yet included.
- Dynamic simulation remains future work.

## Future Work

- Deploy the Python backend to a cloud service.
- Expand the unit-operation library.
- Integrate scientific Python libraries for thermodynamic-property calculations.
- Support a wider range of mathematical functions and expressions.
- Expand target-variable functions with additional mathematical operations.
- Add interactive plots for expressions, variable relationships, and calculated results.
- Add nonlinear equation systems using Python numerical libraries.
- Add guided tutorials and additional solved examples.
- Improve automated testing and accessibility.

## Team

**Mariola Camacho Lie (IMClick-Project)** — Project creator, chemical engineering concept development, application design, testing, documentation, and integration.

## Demo Video

The final project video will present:

- the problem addressed by ChemEFlow;
- the objective of the application;
- its main components;
- a complete functional example;
- the development workflow and use of Kiro.

**Video:** _Add the final link here before submission._

## Acknowledgments

I would like to thank Código Facilito for organizing the hackathon and for providing the previous bootcamp on Kiro and AWS.

The learning materials, practical sessions, community support, and mentoring helped strengthen the development process and provided useful guidance for transforming the initial idea into a functional project.

The bootcamp was especially valuable for exploring tools and development approaches outside my main field of chemical engineering, while still requiring critical evaluation, technical guidance, and continuous testing during implementation.

## License

The ChemEFlow source code is licensed under the
[Apache License 2.0](LICENSE).

Copyright 2026 Mariola Camacho Lie.

The ChemEFlow name, logo, and visual identity are not granted under this
license. Modified or derivative versions may not be presented as official
ChemEFlow releases without prior written permission.

Academic and scientific users are encouraged to cite ChemEFlow and its
associated publications when available.
