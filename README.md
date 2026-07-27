# ChemEFlow

**Visual, glass-box material-balance modeling for chemical engineering education.**

ChemEFlow is a React/Vite application that connects four representations of a chemical-engineering model:

1. **Components** — define chemical components and molecular weights.
2. **Flowsheet** — build a process with sources, sinks, unit operations, and configurable streams.
3. **Equations** — declare variables, construct linear systems and target-variable functions, inspect dependencies, and diagnose model solvability.
4. **Results** — review stream tables and export the solved formulation to CSV, Python, or MATLAB.

Instead of hiding the mathematics inside a black box, ChemEFlow makes variables, equations, dependencies, and the resolution sequence visible.

> **Project status:** hackathon MVP / educational prototype.

---

## The challenge

Students often learn material balances in disconnected environments: hand calculations, programming notebooks, and process simulators. Moving between these representations can be difficult, and conventional simulators may allow users to obtain answers without clearly seeing the equations, assumptions, dependencies, or numerical steps involved.

ChemEFlow addresses this gap by providing a visual workflow that helps users move from a flowsheet to explicit equations, diagnose whether the model is resolvable, solve it, and inspect or reuse the generated code.

---

## Main features

### Components

- Add and edit components.
- Store molecular weights for mass–molar conversion.
- Select a mass or molar calculation basis.

### Flowsheet

- Drag and connect sources, sinks, and unit operations.
- Configure stream names, total flow, composition, and component flows.
- Move each connected stream port independently around a unit operation.
- Save and restore stream specifications and port locations.

### Equations

- Declare user-defined variables.
- Create linear systems of arbitrary size.
- Build target-variable functions with visual expression blocks.
- Use constants, variables, operators, and grouped expressions.
- Track dependencies between blocks.
- Detect incomplete expressions and circular dependencies.
- Propagate stream relationships.
- Validate fractions, flows, and consistency.

`Analyze` and `Solve` have different purposes:

- **Analyze** diagnoses a linear system without changing variable values.
- **Solve** validates the complete model, resolves ready linear systems, evaluates target-variable functions in dependency order, propagates stream relations, and repeats until no additional values can be obtained.

### Results

- Display user-defined variables with value, unit, status, and origin.
- Show mass composition, mass flow, molar composition, and molar flow as stream tables.
- Use components as rows, streams as naturally sorted columns, and a final `Total` row.
- Distinguish `Known`, `Calculated`, and `Solved` values.
- Mark secondary-basis tables as unavailable when molecular weights are incomplete.

### Project and code export

- Save the complete editable project as a `.chemeflow.json` file.
- Open a saved project and continue editing it.
- Export results as CSV.
- Export readable Python code using NumPy and pandas.
- Export readable MATLAB code using matrices and `table` objects.
- Represent linear systems explicitly as `A x = b`.
- Export target-variable functions as normal functions with detected parameters.

---

## Technology stack

- **Frontend:** React 19, Vite, React Flow / XYFlow
- **Optional numerical backend:** Python, FastAPI, NumPy
- **Browser fallback:** JavaScript linear-system analysis when the backend is unavailable
- **Generated code:** Python with NumPy and pandas; MATLAB

---

## Local installation

### Requirements

- Node.js 20 or newer
- npm
- Python 3.11 or newer for the optional local numerical backend

### 1. Clone the repository

```bash
git clone <YOUR_REPOSITORY_URL>
cd chemeflow
```

### 2. Start the Python backend

#### Windows with a virtual environment

```powershell
cd backend
python -m venv .venv
.venv\Scripts\activate
python -m pip install --upgrade pip
pip install -r requirements.txt
python -m uvicorn app.main:app --reload
```

The API runs at `http://127.0.0.1:8000`.

Useful endpoints:

- Health check: `http://127.0.0.1:8000/health`
- Interactive API documentation: `http://127.0.0.1:8000/docs`

### 3. Configure the frontend

Copy `.env.example` to `.env` in the project root:

```env
VITE_API_URL=http://127.0.0.1:8000
```

### 4. Start the frontend

Open a second terminal in the project root:

```bash
npm install
npm run dev
```

Open the URL printed by Vite, normally `http://localhost:5173`.

> The backend is recommended, but linear-system analysis can fall back to the browser if the local API is unavailable.

---

## Basic workflow

1. Add components and molecular weights in **Components**.
2. Select the calculation basis.
3. Build and connect the process in **Flowsheet**.
4. Select each stream to enter known flow and composition data.
5. Open **Equations**.
6. Add Variable Declarations, Linear Systems with expression-based coefficients, and Target Variable Functions as needed.
7. Press **Analyze** on each linear system to inspect its diagnostic status.
8. Press the global red **Solve** button.
9. Open **Results** after the model reaches `Model solved`.
10. Export CSV, Python, or MATLAB, or save the project for later use.

Any semantic change to the model invalidates the previous global solution. Press **Solve** again before reviewing Results.

---

## Example: linear system

For a system represented by

```text
A = [[1.0, 1.0],
     [0.4, 0.7]]

b = [100.0, 58.0]
```

ChemEFlow diagnoses the ranks of `A` and `[A|b]`. A ready system is resolved only when the global **Solve** button is pressed. The corresponding Python export follows the readable form:

```python
A_1 = np.array([
    [1.0, 1.0],
    [0.4, 0.7],
], dtype=float)

b_1 = np.array([100.0, 58.0], dtype=float)
x_1 = np.linalg.solve(A_1, b_1)
```

---

## Model-status vocabulary

### Linear System diagnostics

- `Ready to solve`
- `Underdetermined`
- `Inconsistent`
- `Physically invalid result`

### Target Variable Function diagnostics

- `Ready to solve`
- `Depends on another block`
- `Waiting for a variable`
- `No block produces a variable`
- `Incomplete expression`
- `Circular dependency`

### Global model status

- `Model solved`
- `Model partially solved`
- `Model cannot be solved`

### Variable status

- `Known` — specified by the user
- `Calculated` — obtained from direct stream relationships or basis conversion
- `Solved` — obtained by a Linear System or Target Variable Function during global Solve

---

## Exported Python and MATLAB files

The generated files are intended to be readable and editable outside ChemEFlow.

Python exports require:

```bash
pip install numpy pandas
```

They contain:

- editable inputs;
- declared and stream variables;
- linear systems as NumPy arrays;
- target-variable functions with explicit parameters;
- the resolution sequence;
- user-defined-variable tables;
- mass and molar flow/composition DataFrames.

MATLAB exports contain equivalent matrices, functions, variables, and `table` objects.

---

## Save and open projects

Use **Save Project** to download the complete editable model. The project file includes components, basis, flowsheet nodes, streams, specifications, equations, expression blocks, dependencies, and individual stream-port positions.

Use **Open Project** to restore the model. Results are intentionally invalidated after opening; press **Solve** to regenerate them from the restored configuration.

---

## Repository structure

```text
chemeflow/
├── src/                    # React application
│   ├── components/         # Shared interface components
│   ├── nodes/              # React Flow nodes
│   ├── pages/              # Components, Equations, and Results pages
│   ├── App.jsx             # Main application and shared state
│   └── App.css             # Application styles
├── backend/
│   ├── app/                # FastAPI numerical engine
│   ├── tests/              # Backend tests
│   └── requirements.txt
├── docs/                   # Architecture, demo, testing, and submission notes
├── .env.example
├── package.json
└── README.md
```

---

## Current scope and limitations

ChemEFlow currently focuses on educational material-balance modeling. It is not intended to replace a rigorous commercial process simulator.

Current limitations include:

- no rigorous thermodynamic-property packages;
- no energy balances;
- no reactor or separation-equilibrium models;
- no dynamic simulation or process control;
- local project files rather than cloud accounts;
- ongoing validation is still needed for large and unusual models.

These boundaries are intentional for the hackathon MVP: the priority is transparent formulation and model diagnosis.

---

## Hackathon demo

A recommended five-minute demonstration is available in [`docs/DEMO_SCRIPT.md`](docs/DEMO_SCRIPT.md).

Submission-ready title, description, challenge statement, and link placeholders are available in [`docs/HACKATHON_SUBMISSION.md`](docs/HACKATHON_SUBMISSION.md).

---

## Testing

Backend tests:

```bash
cd backend
python -m pytest
```

Frontend production build:

```bash
npm run build
```

A manual end-to-end checklist is available in [`docs/TEST_CHECKLIST.md`](docs/TEST_CHECKLIST.md).

---

## Roadmap after the hackathon

- Stabilize and document the MVP with classroom-scale examples.
- Add editable glass-box templates for mixers, splitters, and component separators.
- Conduct usability tests with chemical-engineering students.
- Evaluate learning outcomes related to degrees of freedom, dependency analysis, and transfer from flowsheets to code.
- Develop instructor activities and example projects.

---

## Team

Add the team members, institutional affiliation, and contact information here before submission.

## License

Add the selected open-source license before publishing the repository. MIT is a common option for hackathon and educational software, but the project team should confirm the final choice.

### Transparent dependency order
ChemEFlow displays how equation blocks depend on one another. Target functions preserve which inputs were resolved during the global Solve, while the Variable Inventory shows the block resolution order used by the dependency-aware solver.
