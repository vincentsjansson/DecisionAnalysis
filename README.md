# DecisionAnalysis

A decision analysis tool for building, visualizing, and evaluating
decision trees. Built as a learning project and teaching aid for an
introductory course in risk, safety, and crisis management.

## What it does

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
- Nodes can be chance nodes or decision nodes (EV uses max instead of weighted average)

## Project structure
DecisionAnalysis/

├── backend/

│   ├── treemodel.py      # TreeNode and Outcome classes

│   ├── treelogic.py      # EV calculation, traversal, backward fill

│   ├── converters.py     # JSON ↔ Python model conversion

│   ├── main.py           # FastAPI server (POST /ev, POST /backward)

│   └── init.py

│

├── frontend/

│   ├── csharp-wpf/       # WPF desktop app

│   └── web/              # Planned TypeScript/GitHub Pages version

│

├── tests/

│   ├── conftest.py

│   ├── testconverters.py

│   └── testbackward.py

│

└── requirements.txt
## Tech stack

| Layer | Technology |
|---|---|
| Backend logic | Python 3.10+ |
| API layer | FastAPI + Uvicorn |
| Desktop frontend | C# WPF (.NET 4.7.2) |
| Serialization | Newtonsoft.Json |
| Planned web frontend | TypeScript + React + SVG |

## Getting started

### 1. Backend

```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

Backend runs on `http://127.0.0.1:8000`.

### 2. Desktop app

Open `frontend/csharp-wpf/DecisionAnalysisC-/DecisionAnalysis.slnx`
in Visual Studio and press F5.

Requires Visual Studio with the **.NET desktop development** workload.

The app connects to the backend automatically. Start the backend
before clicking **▶ Run EV** or **⟵ Backward**.

## How to use

1. Add nodes with the **+** button in the sequence bar
2. Click a node to rename it or edit its outcomes and probabilities
3. Click a leaf triangle to set its payoff value or a known joint probability
4. Click **▶ Run EV** to calculate expected values (requires backend)
5. Click **⇄ Flip** for a mirrored side-by-side view
6. Use **💾 Save** / **📂 Load** to persist trees as JSON

## API endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/ev` | Calculate EV for entire tree |
| POST | `/backward` | Back-calculate probabilities from a known joint probability |

## Roadmap

- [x] Python tree model with conditional probability tables
- [x] EV calculation and backward probability fill
- [x] FastAPI endpoints (/ev and /backward)
- [x] WPF UI with bezier tree canvas and zoom/pan
- [x] Sequence bar with pill-style nodes
- [x] Outcome editor with auto-normalized probabilities
- [x] Clickable leaf nodes with value and joint probability input
- [x] Per-path EV display on all nodes
- [x] Chance and decision node types
- [x] Flip/mirror view for Value of Information analysis
- [x] Save and load trees as JSON
- [x] Backward fill via leaf click
- [ ] TypeScript + React port for GitHub Pages deployment
