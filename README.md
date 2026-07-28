# DecisionAnalysis
https://vincentsjansson.github.io/DecisionAnalysis/
A decision analysis tool for building, visualizing, and evaluating
decision trees — EV, conditional probabilities, and Value of
Clairvoyance. Built as a teaching aid for an introductory course in Decision Analysis.

## Architecture

Static TypeScript web app (Vite, vanilla-ts). No backend, no server —
everything runs client-side and deploys as static files to GitHub
Pages.

An earlier prototype (Python/FastAPI backend + C# WPF desktop app) is
archived under [`legacy/`](legacy/) for reference. It is not built,
run, or ported — this is a rebuild from spec, not a migration.

- [SPEC.md](SPEC.md) — the feature spec
- [PROGRESS.md](PROGRESS.md) — build history

## Status

Scaffolding only. Deployment pipeline is wired up; no
decision-tree features are implemented yet.

## Getting started

```bash
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
```

## Deployment

Every push to `main` builds the app and deploys `dist/` to GitHub
Pages via `.github/workflows/deploy.yml`.
