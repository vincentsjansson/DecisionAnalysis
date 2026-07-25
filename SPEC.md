# DecisionAnalysis — Målspec (TypeScript, from scratch)

Status: ✅ byggt · ⚠️ delvis/risk · ❌ ska byggas.

Beslut 2026-07-25: C# WPF och Python-backend skrotas. Allt byggs i TypeScript som en statisk webbapp (GitHub Pages), inget backend krävs — beräkningarna är enkla nog att köra client-side.

**Teknikstack:** Vite + vanilla TypeScript, SVG-rendering av trädet, deploy till GitHub Pages via GitHub Actions. Krav: en extern, icke-teknisk person ska kunna klicka en länk och få upp verktyget direkt i webbläsaren, inget installationssteg.

## Bekräftad regel att inte återupprepa

Tidigare C#/Python-kod hade en fältnamnsregression: C# serialiserade `conditionaltables`, Python läste `conditional_tables`. **TS-koden ska konsekvent använda `conditional_tables` (snake_case) i alla JSON-strukturer.**

## Nodtyper

- ✅ Tre nodtyper: `outcome`, `decision`, `leaf`. Explicit `nodeType`-fält i modellen (`src/model/tree.ts`).

## Datamodell

- ✅ `TreeNode` / `Outcome` i TS (`src/model/tree.ts`), med `nodeType`, payoff-fält på lövnoder (konstruktor kastar om payoff saknas på leaf eller sätts på icke-leaf).
- ✅ Villkorad sannolikhet per path (subset-matchning mot history-set): portad till `src/model/conditionalProbability.ts`. **Tie-break-frågan är låst:** flera lika specifika matchande conditions kastar `AmbiguousConditionalProbabilityError` istället för att tyst välja en (se "Bekräftad regel att inte återupprepa"-andan — samma princip applicerad här).
- ✅ Cykel-skydd vid nod-koppling: `setChild` (`src/model/tree.ts`) går upp genom `parent`-kedjan och kastar `CyclicTreeError` om `child` redan är en förfader (inkl. self-loop).

## Beräkningar

- ✅ EV per nod: slumpnoder = viktat medelvärde av barnens EV; beslutsnoder = max av barnens EV. Rekursiv, fungerar på varje nod i trädet, inte bara löven (`src/model/expectedValue.ts`).
- ❌ VOC (Value of Clairvoyance).
- ❌ Beräkningssteg-visning (pedagogisk, t.ex. "0.3 × 8 + 0.7 × 2 = 4.2").
- ✅ Sannolikhetsvalidering: `src/model/validateProbabilities.ts` kastar `ProbabilitySumError` (med nod-id och faktisk summa) om villkorade sannolikheter för en nod inte summerar till 1 inom tolerans 1e-6 — normaliserar inte tyst.

## Flip / split

- ❌ Flip = vänd trädet runt; split = resultatet, två oberoende trädvyer sida vid sida med separata sequence bars (pill-sekvenser).
- Krav: verifiera vid bygge att de två träden är helt oberoende (inga delade referenser).

## Rendering / UI

- ❌ Canvas- eller SVG-rendering av trädet, idempotent redraw.
- ❌ Bézier-kurvor för grenar.
- ❌ Zoom begränsad till canvas-ytan (header fixerad).
- ❌ Leaf-spacing auto-expand mot overlap.
- ❌ Svart-vitt tema.
- ❌ Mirrored layout för höger träd i split-läge (textorientering + pill-sequence-bar speglad).

## Spara / ladda

- ⚠️ Serialisering/deserialisering (`src/model/serialization.ts`) är klar och round-trip-testad (EV och conditional_tables identiska efter spara→ladda), snake_case-fältnamn (`conditional_tables`) enligt regeln ovan. **Fortfarande ❌:** ingen fil-I/O eller UI (spara-till-fil / ladda-från-fil-knappar).
- Path-keyed datastrukturer för delade Outcome-objekt över flera paths: **inte en risk idag** (trädet är strikt ett träd, ingen delning), men bli explicit designkrav om delning införs senare.

## Undo/redo

- ❌ Ctrl+Z / Ctrl+Shift+Z, täcker trädändringar (lägg till/ta bort nod, ändra payoff/sannolikhet, flip/split).

## Export

- ❌ PNG-export med transparent bakgrund, bara text/grafik synlig. Kräver att renderingen finns först.

## Explicit ur scope tills vidare

- Ingen backend/server — allt körs client-side, statisk deploy.
- Ingen C#/.NET-kod behålls.
- Ingen Python-kod behålls (kan användas som referens för logik, men porteras inte rakt av).
