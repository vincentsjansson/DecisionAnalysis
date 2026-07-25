# DecisionAnalysis — Progresslogg

Format: datum — vad hände — status/beslut. Nyast överst. Uppdatera denna fil efter varje segment/session, commit:a tillsammans med kodändringar.

---

## 2026-07-25 (segment 3) — Kärndatamodell, beräkningslogik och tester

**Vad hände:** Claude Code körde prompt #2 på `rebuild-typescript`.

- **Part 0:** Tog bort den portabla Node-installationen (`%LOCALAPPDATA%\nodejs-portable`), städade User PATH. Systeminstallationen (`C:\Program Files\nodejs`, v24.18.0) är nu den enda och resolvear korrekt i både PowerShell och Bash. Inget gick sönder.
- **Part 1** (`src/model/tree.ts`): `NodeType`, `TreeNode`, `Outcome`, `setChild`. Cykel-skydd genom att `TreeNode` håller ett `parent`-fält satt av `setChild`, som vandrar uppåt och kastar `CyclicTreeError` (inkl. self-loop-fallet).
- **Part 2** (`src/model/conditionalProbability.ts`): subset-matchning mot history-set, mest specifika match vinner. Tie-break-frågan från SPEC.md är låst: lika stora matchande conditions kastar `AmbiguousConditionalProbabilityError` istället för att tyst välja en.
- **Part 3** (`src/model/validateProbabilities.ts`): kastar `ProbabilitySumError` (med nod-id och faktisk summa, tolerans 1e-6) om en outcome-nods sannolikheter inte summerar till 1 — normaliserar inte tyst, till skillnad från gamla Python-koden.
- **Part 4** (`src/model/expectedValue.ts`): rekursiv EV, korrekt vid varje nod (inte bara löv) — viktat medelvärde för outcome-noder, max för beslutsnoder, payoff för löv.
- **Part 5** (`src/model/serialization.ts`): JSON-serialisering med `conditional_tables` (snake_case) rakt igenom, condition-sets som sorterade string-arrayer (aldrig `Set`/tuple som JSON-nyckel — fixar samma klass av bugg som gamla Pythons `to_dict()` hade).
- **Part 6:** Vitest installerat, `vite.config.ts` importerar nu `defineConfig` från `vitest/config`. 29 tester across alla fem moduler — täcker trädkonstruktion + cykel-detektion, villkorad sannolikhet (bas/enkel match/mest-specifik/tie-fel), validering (giltig/ogiltig summa, ingen tyst normalisering), EV (flernivåträd med bland decision/outcome, för-hand-räknat), och serialisering round-trip (inkl. conditional tables och nästlad struktur).

**Verifierat innan rapport:** `npx tsc --noEmit` rent, `npm run build` lyckas, `npm test` → 5 test-filer / 29 tester, alla gröna.

**Kvarstår:** VOC, beräkningssteg-visning, rendering/UI, flip/split, save/load-UI (I/O, inte bara serialisering), undo/redo, PNG-export — allt ❌, nästa segment.

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
