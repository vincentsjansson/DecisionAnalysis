# DecisionAnalysis — Målspec (TypeScript, from scratch)

Status: ✅ byggt · ⚠️ delvis/risk · ❌ ska byggas.

Beslut 2026-07-25: C# WPF och Python-backend skrotas. Allt byggs i TypeScript som en statisk webbapp (GitHub Pages), inget backend krävs — beräkningarna är enkla nog att köra client-side.

**Teknikstack:** Vite + vanilla TypeScript, SVG-rendering av trädet, deploy till GitHub Pages via GitHub Actions. Krav: en extern, icke-teknisk person ska kunna klicka en länk och få upp verktyget direkt i webbläsaren, inget installationssteg.

## Bekräftad regel att inte återupprepa

Tidigare C#/Python-kod hade en fältnamnsregression: C# serialiserade `conditionaltables`, Python läste `conditional_tables`. **TS-koden ska konsekvent använda `conditional_tables` (snake_case) i alla JSON-strukturer.**

## Nodtyper

- ❌ Tre nodtyper: `outcome`, `decision`, `leaf`. Ska finnas som explicit `nodeType`-fält i modellen från start.

## Datamodell

- ❌ `TreeNode` / `Outcome` i TS, med `nodeType`, payoff-fält på lövnoder, joint probability.
- ⚠️ Villkorad sannolikhet per path (subset-matchning mot history-set): konceptet finns beskrivet från gamla Python-koden (`apply_conditional_probabilities`) men ingen TS-kod ännu. Bra referenslogik att porta över.
  - Öppen fråga att låsa innan bygge: **tie-break-regel** när flera conditions av samma storlek matchar (gamla koden var beroende av dict-insättningsordning — odefinierat). Bestäm en explicit regel (t.ex. senast tillagd vinner, eller kräv unika storlekar och kasta fel vid krock).
- ❌ Cykel-skydd vid nod-koppling (kontrollera att ny child inte redan är en förfader).

## Beräkningar

- ❌ EV per nod: slumpnoder = viktat medelvärde av barnens EV; beslutsnoder = max av barnens EV.
- ❌ VOC (Value of Clairvoyance).
- ❌ Beräkningssteg-visning (pedagogisk, t.ex. "0.3 × 8 + 0.7 × 2 = 4.2").
- ❌ Sannolikhetsvalidering: varna (inte tyst normalisera) om villkorade sannolikheter för en nod inte summerar till 1.

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

- ❌ Save/load som JSON, round-trip-säkert (spara → ladda om → identiska EV/VOC/sannolikhetsvärden).
- Path-keyed datastrukturer för delade Outcome-objekt över flera paths: **inte en risk idag** (trädet är strikt ett träd, ingen delning), men bli explicit designkrav om delning införs senare.

## Undo/redo

- ❌ Ctrl+Z / Ctrl+Shift+Z, täcker trädändringar (lägg till/ta bort nod, ändra payoff/sannolikhet, flip/split).

## Export

- ❌ PNG-export med transparent bakgrund, bara text/grafik synlig. Kräver att renderingen finns först.

## Explicit ur scope tills vidare

- Ingen backend/server — allt körs client-side, statisk deploy.
- Ingen C#/.NET-kod behålls.
- Ingen Python-kod behålls (kan användas som referens för logik, men porteras inte rakt av).
