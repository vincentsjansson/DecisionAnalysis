# Legacy (archived)

This directory holds the original Python/FastAPI backend and C# WPF
desktop frontend. The project has been rebuilt as a static TypeScript
web app (see repo root) — nothing here is built, run, or ported going
forward. Kept for reference only.

## Note (2026-07-27)

The version originally archived here came from the GitHub repo, which
turned out to be stale: broken imports, no `main.py`/API server, and a
near-empty WPF shell. This was replaced with the actual local working
copy, which is substantially more complete:

- `backend/main.py` — a working FastAPI app (`/ev`, `/backward`)
- `backend/treelogic.py` — real `calculate_ev` (weighted average /
  max) and `backward_fill_along_path` implementations
- `backend/treemodel.py` — `node_type` ("chance"/"decision") and a
  leaf payoff field (`Outcome.value`)
- `frontend/csharp-wpf/` — the real WPF UI: canvas rendering,
  sequence bar, node popup menu, dialogs (backward fill, conditional
  table, edit outcomes, leaf value, outcome name), save/load
  (`Services/TreeSerializer.cs`), and path-keyed `LeafValues` /
  `NodeEvValues` in `ViewModels/TreeViewModel.cs`
- `tests/` — includes `testbackward.py` (backward-fill) and
  `conftest.py`, not just the converter test
- `_archive/` — older discarded scripts, archived as found

Build artifacts and vendored dependencies (`bin/`, `obj/`, `.vs/`,
`packages/`, `__pycache__/`) were not copied — restore via `dotnet
restore` / NuGet and a Python virtualenv if you ever need to actually
run this code.

Useful as reference logic for the TypeScript rebuild (see
`../SPEC.md`), not as something to port directly.
