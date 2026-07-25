# DecisionAnalysis

A decision analysis tool for building, visualizing, and evaluating
decision trees. Built as a learning project and teaching aid for an
introductory course in risk, safety, and crisis management.

## Status

Early scaffolding. The tree model and JSON conversion layer work and
are tested. Everything else described below under "Vision" — EV
calculation, the API server, and the desktop UI — is not implemented
yet. See [Roadmap](#roadmap) for what's actually done.

## Vision

Once built out, the app should let you:

- Build decision trees interactively by adding nodes and outcomes
- Visualize trees with smooth bezier curves on an infinite zoomable canvas
- Set probabilities per outcome (auto-normalized to sum to 1.0)
- Set leaf values (payoffs/costs) by clicking directly on leaf nodes
- Calculate Expected Value (EV) via the Python backend — displayed per node
- Backward fill: set a known joint probability on a path and back-calculate
  the individual probabilities along it
- Flip trees horizontally for side-by-side comparison (e.g. Value of Information)
- Conditional probability tables per node
- Save and load trees as JSON files
- Have nodes be chance nodes or decision nodes (EV uses max instead of weighted average)

## What's implemented today

- `TreeNode` / `Outcome` model with conditional-probability-table support
  (subset-matching, auto-normalization)
- Plain tree traversal (`traverse_tree`)
- JSON ↔ model conversion (`frontend_to_backend` / `backend_to_frontend`),
  round-trip tested
- A WPF desktop shell that builds and runs, but shows an empty window —
  `Window_Loaded` currently just fires one hardcoded request at the
  (not yet existing) `/backward` endpoint as a wiring smoke test

## Project structure

```
DecisionAnalysis/
├── backend/
│   ├── app/
│   │   ├── treemodel.py     # TreeNode and Outcome classes
│   │   ├── treelogic.py     # tree traversal
│   │   ├── converters.py    # JSON ↔ Python model conversion
│   │   └── ascii_tree.py    # debug helper: print a tree to the console
│   └── tests/
│       └── testconverters.py
├── frontend/
│   └── csharp-wpf/          # WPF desktop app (empty shell so far)
├── pyproject.toml
└── requirements.txt
```

There is no `backend/main.py` / FastAPI server yet, and no `frontend/web/`
directory yet — see Roadmap.

## Tech stack

| Layer | Technology |
|---|---|
| Backend logic | Python 3.10+ |
| API layer (planned) | FastAPI + Uvicorn |
| Desktop frontend | C# WPF (.NET 4.7.2) |
| Serialization | Newtonsoft.Json |
| Planned web frontend | TypeScript + React + SVG |

## Getting started

### 1. Backend

```bash
pip install -r requirements.txt
pytest
```

This installs and runs the current test suite (tree model + converters).
There is no API server to start yet.

### 2. Desktop app

Open `frontend/csharp-wpf/DecisionAnalysis.slnx` in Visual Studio and press F5.

Requires Visual Studio with the **.NET desktop development** workload.

The app currently shows an empty window and fires one hardcoded
`/backward` request on load as a wiring smoke test — that call will fail
until the backend API server exists (see Roadmap).

## API endpoints (planned, not yet implemented)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/ev` | Calculate EV for entire tree |
| POST | `/backward` | Back-calculate probabilities from a known joint probability |

## Roadmap

- [x] Python tree model with conditional probability tables
- [x] JSON ↔ model conversion, round-trip tested
- [ ] EV calculation
- [ ] Backward probability fill (logic, not just the DTO shape)
- [ ] FastAPI endpoints (`/ev` and `/backward`)
- [ ] WPF UI with bezier tree canvas and zoom/pan
- [ ] Sequence bar with pill-style nodes
- [ ] Outcome editor with auto-normalized probabilities
- [ ] Clickable leaf nodes with value and joint probability input
- [ ] Per-path EV display on all nodes
- [ ] Chance and decision node types
- [ ] Flip/mirror view for Value of Information analysis
- [ ] Save and load trees as JSON
- [ ] TypeScript + React port for GitHub Pages deployment
