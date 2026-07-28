# DecisionAnalysis

A decision analysis tool for building, visualizing, and evaluating
decision trees — EV, conditional probabilities, and Value of
Clairvoyance. Built as a teaching aid for an introductory course in
risk, safety, and crisis management.

## Testa live

👉 **https://vincentsjansson.github.io/DecisionAnalysis/**

Den senaste versionen deployas automatiskt hit vid varje push till
`rebuild-typescript` (och `main`). Öppna länken i valfri webbläsare —
inget installationssteg behövs.

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

MVP complete: interactive decision/chance tree editing, live EV and
Expected Utility (with γ-elicitation → certainty equivalent), transparent
backward-fill, flip/split with Bayes clairvoyance + live VOC, step-by-step
calculation traces, linked variable instances, and save/load to JSON.
See [SPEC.md](SPEC.md) for the full feature status and [PROGRESS.md](PROGRESS.md)
for the build history.

## Getting started

```bash
npm install
npm run dev       # local dev server
npm run build     # production build to dist/
```

## Deployment

Every push to `main` or `rebuild-typescript` builds the app and deploys
`dist/` to GitHub Pages via `.github/workflows/deploy.yml`, served at the
[live link](https://vincentsjansson.github.io/DecisionAnalysis/) above.
