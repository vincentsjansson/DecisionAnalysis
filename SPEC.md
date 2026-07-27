# DecisionAnalysis — Målspec (TypeScript, from scratch)

Status: ✅ byggt · ⚠️ delvis/risk · ❌ ska byggas.

Beslut 2026-07-25: C# WPF och Python-backend skrotas. Allt byggs i TypeScript som en statisk webbapp (GitHub Pages), inget backend krävs — beräkningarna är enkla nog att köra client-side.

**Teknikstack:** Vite + vanilla TypeScript, SVG-rendering av trädet, deploy till GitHub Pages via GitHub Actions. Krav: en extern, icke-teknisk person ska kunna klicka en länk och få upp verktyget direkt i webbläsaren, inget installationssteg.

## Bekräftad regel att inte återupprepa

Tidigare C#/Python-kod hade en fältnamnsregression: C# serialiserade `conditionaltables`, Python läste `conditional_tables`. **TS-koden ska konsekvent använda `conditional_tables` (snake_case) i alla JSON-strukturer.**

## Lärdomar från legacy-genomgången (2026-07-27)

Den lokala kopian av det gamla projektet (inte GitHub-versionen, som var betydligt tunnare — se PROGRESS.md) visade sig ha en nästan komplett WPF-app: canvas-rendering, sequence bar, dialoger, save/load, och en fungerande FastAPI-backend med riktig EV- och backward-fill-logik. En fullständig genomläsning av `legacy/frontend/csharp-wpf/MainWindow.xaml.cs` (1171 rader), `ViewModels/TreeViewModel.cs`, och `legacy/backend/treelogic.py` gav tre arkitekturbeslut som nu är låsta för TS-bygget, plus en lista referensbuggar.

### Låsta beslut

1. **Äkta träd, inte sequence-UI.** Legacy's `TreeViewModel.Sequence` är en **platt lista av nivåer** — `RebuildLinks()` låter alla outcomes på nivå i peka på **samma** nod-objekt på nivå i+1. Det är därför asymmetriska träd är omöjliga i legacy, och därför `LeafValues`/`NodeEvValues` måste vara path-keyed (noderna delas mellan alla paths). TS-datamodellen (segment 3) är redan ett äkta träd. Rendering/UI-segmentet ska bygga interaktion runt riktiga, potentiellt asymmetriska träd (klicka en nod → lägg till barn på just den grenen) — **inte** en pill-sequence-bar.

2. **Flip/split: riktig Bayes-omvändning, inte legacy's naiva kopiering.** Legacy kopierar sannolikheterna oförändrade till det speglade trädet. Det är bara matematiskt korrekt om chansnodernas sannolikheter är oberoende av tidigare grenar — med villkorade sannolikheter i scope är naiv kopiering fel och skulle ge tyst felaktig VOC, oacceptabelt i ett läromedel. Flip/split blir därför ett eget, större segment (kräver korrekt beräkning av marginaler och posteriorer via Bayes), inte en enkel spegel-operation. **Flip/split byggs inte som en del av det kommande rendering/UI-segmentet — det skjuts upp till ett dedikerat framtida segment.**

3. **Backward-fill: behåll "justera första justerbara nod längs pathen"-regeln**, samma som legacy, men gör den transparent — rapportera tydligt till användaren vilken kant/sannolikhet som faktiskt ändrades, istället för att bara logga det tyst (legacy loggade bara till `Debug.WriteLine`).

### Referensbuggar att inte upprepa

Dessa är redan förhindrade av TS-modellens grundarkitektur (ett villkorsformat, fel istället för tyst normalisering, äkta träd, id:n istället för namn), men värda att ha i huvudet vid UI-bygget:

- **Tre olika nyckelformat för villkorade sannolikheter** i legacy samtidigt: UI:t skapade `"Nod = Outcome"`, `forward_probability_along_path` använde bara outcome-namnet, `traverse_tree` använde `"Nod:Outcome"`. Ingen av dem matchade varandra — subset-matchningen kunde aldrig träffa något UI:t skickat, och `calculate_ev` anropade aldrig villkors-upplösningen alls. Skärmen visade villkorade sannolikheter (UI:ts egen lokala beräkning); root-EV räknades på bassannolikheterna. TS: ett enda format (`nodId:label`), och EV-beräkningen använder samma history-mekanism som resolvern.
- **VOC-knappen var en återvändsgränd** — Run EV fanns bara på vänster träd, så högerträdets EV (som VOC kräver) kunde aldrig sättas.
- **Remove-node skyddade åt fel håll** — blockerade borttagning av en nod med egna conditional tables, men tillät borttagning av en nod som *andra* noders tabeller refererade till (blev tysta döda villkor).
- **Rename bröt namnbaserade conditional-table-referenser tyst** — villkor och tabellrader var nycklade på outcome-namn, så en omdöpning lämnade skräpnycklar utan varning.
- **Tre olika toleranser för sannolikhetssumma** i olika lager (1e-5 i UI-varningen, 0.01 i spara-spärren, 1e-6 i backend).
- **Kantetiketter placerades blint** på Bézier-mittpunkten med fasta pixel-offsets, ingen kollisionshantering — bekräftar "label overlap"-buggen från den ursprungliga checklistan.

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

- ❌ Flip = vänd trädet runt; split = resultatet, två oberoende trädvyer sida vid sida. **Låst beslut:** kräver riktig Bayes-omvändning (marginaler + posteriorer), inte legacy's oförändrade sannolikhetskopiering — se "Lärdomar från legacy-genomgången". Eget, dedikerat framtida segment — **inte** en del av det kommande rendering/UI-segmentet.
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
