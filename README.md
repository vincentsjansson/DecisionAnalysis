# DecisionAnalysis

A decision analysis tool for building, visualizing, and evaluating 
decision trees. Built as a learning project and teaching aid for an 
introductory course in risk, safety, and crisis management.

## What it does

- Build decision trees interactively by adding nodes and outcomes
- Visualize trees with animated, curved edges in a dark-themed UI
- Set probabilities per outcome (auto-normalized to sum to 1.0)
- Set outcome values (payoffs/costs)
- Reorder nodes in the sequence bar to explore different decision orderings
- Flip trees horizontally for side-by-side comparison (e.g. Value of Information)
- Calculate Expected Value (EV) through the Python backend

## Project Structure
DecisionAnalysis/

├── backend/
│   ├── treemodel.py       # TreeNode and Outcome classes (node_type, value)
│   ├── treelogic.py       # EV calculation, traversal, backward fill
│   ├── converters.py      # JSON ↔ Python model conversion
│   ├── main.py            # FastAPI server (POST /backward)
│   └── init.py
│
├── frontend/
│   ├── csharp-wpf/        # WPF desktop app (current UI)
│   └── web/               # Planned TypeScript/GitHub Pages version

## Tech Stack

| Layer | Technology |
|---|---|
| Backend logic | Python 3.10+ |
| API layer | FastAPI + Uvicorn |
| Desktop frontend | C# WPF (.NET 4.7.2) |
| Planned web frontend | TypeScript + GitHub Pages |

## Getting started
### 1. Backend
```bash
pip install -r requirements.txt
uvicorn backend.main:app --reload
```
Backend runs at `http://127.0.0.1:8000`
### 2. Desktop app
Open `frontend/csharp-wpf/DecisionAnalysis.slnx` in Visual Studio 
and press F5.
Requires Visual Studio with the **.NET desktop development** workload.

## Roadmap
- [x] Python tree model with conditional probability tables
- [x] EV calculation and backward probability fill
- [x] FastAPI endpoint
- [x] WPF UI with animated tree canvas
- [x] Sequence bar with drag-to-reorder
- [x] Outcome editor with auto-normalized probabilities
- [ ] Fix leaf node interaction (clickable triangles)
- [ ] Connect WPF frontend to FastAPI backend
- [ ] Live EV display in UI
- [ ] Tree duplication for Value of Information analysis
- [ ] TypeScript port for GitHub Pages deployment
