# DecisionAnalysis — Progresslogg

Format: datum — vad hände — status/beslut. Nyast överst. Uppdatera denna fil efter varje segment/session, commit:a tillsammans med kodändringar.

---

## 2026-07-25 — Audit av faktisk kod + arkitekturbeslut

**Vad hände:** Bad en review-AI gå igenom hela repot (C# WPF + Python/FastAPI) mot en spec baserad på projektminnet. Resultat: nästan ingenting av den planerade funktionaliteten fanns implementerad. Enda som fanns: `TreeNode`/`Outcome`-modell, `apply_conditional_probabilities` (path-baserad villkorad sannolikhet), `traverse_tree` (ren traversering), `converters.py` (JSON-konvertering av bar trädform). C# WPF var i praktiken ett tomt fönster.

**Bekräftad bugg:** DTO-fältnamnsregression — C# serialiserade `conditionaltables`, Python läste `conditional_tables`. Aldrig faktiskt kopplade ihop så aldrig kraschat, men skulle ha varit en bugg vid integration.

**Beslut:** Skrota C# och Python helt. Bygg om från grunden i TypeScript som statisk webbapp (GitHub Pages), inget backend — beräkningar körs client-side.

**Historikstrategi:** SPEC.md (målspec med ✅/⚠️/❌-status) + denna PROGRESS.md-fil hålls i repot som huvudsanning över sessioner, committas löpande.

**Status vid start av TS-bygget:** 0 % byggt av målspecen (se SPEC.md). Allt är att bygga från scratch.

**Teknikval (bekräftat):**
- Rendering: SVG + vanilla TypeScript (inget UI-ramverk — bäst för Bézier-kurvor, enkel PNG-export, minst att lära sig samtidigt som TS).
- Build/tooling: Vite (snabb, minimal config, byggd för statisk deploy).
- Hosting: GitHub Pages, auto-deploy via GitHub Actions vid push till main. Krav: en extern, icke-teknisk person ska kunna klicka en länk och få upp verktyget direkt i webbläsaren — inget lokalt installationssteg.

**Nästa steg:** Skriv och kör Claude Code-prompt #1: scaffolda Vite+TS-projekt, sätt upp GitHub Actions-workflow för Pages-deploy.

---

## 2026-07-25 (segment 2) — Scaffolding klar, branch pushad

**Vad hände:** Claude Code körde prompt #1 på branchen `rebuild-typescript` (från `cleanup`).
- Gammal C#/Python-kod flyttad till `legacy/` (inget raderat).
- Vite + vanilla-ts scaffoldat vid repo-roten, placeholder-sida "Under construction".
- `vite.config.ts` med `base: '/DecisionAnalysis/'`.
- `.github/workflows/deploy.yml` byggd för auto-deploy till Pages vid push till `main`.
- README omskriven. Claude Code skapade egna tomma `SPEC.md`/`PROGRESS.md` i repot — dessa ersattes i detta segment med de riktiga versionerna.
- Verifierat lokalt: `npm run build` och `npm run dev` fungerar.

**Kvarstår innan merge till main:**
1. ~~Ersätt repots tomma SPEC.md/PROGRESS.md med de ifyllda versionerna.~~ Klart.
2. GitHub Pages Source satt till "GitHub Actions" — klart (gjort av Vincent).
3. Städa dubbel Node-installation (portabel i `%LOCALAPPDATA%\nodejs-portable` + winget-systeminstallation) — behåll systeminstallationen, ta bort den portabla.
4. Branch hålls kvar olegad tills vidare, ingen merge till main än.

**Status:** 0 % av funktionsspecen byggd än (ren scaffolding + deploy-pipeline). Nästa segment: datamodellen (`TreeNode`/`Outcome`, tre nodtyper).
