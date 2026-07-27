# DecisionAnalysis — Progresslogg

Format: datum — vad hände — status/beslut. Nyast överst. Uppdatera denna fil efter varje segment/session, commit:a tillsammans med kodändringar.

---

## 2026-07-27 (segment 6) — Flip/split med korrekt klarsyns-matematik + VOC

**Bakgrund:** De tre tidigare öppna flip-frågorna låstes av Vincent: (1) scope = alla paths möter samma variabelsekvens, tidig terminering hanteras med läroboks-dupliceringsregeln, allt annat är hårt fel; (2) semantik = klassisk klarsyn (chans före beslut), VOC = EV(omvänt) − EV(original) ≥ 0 med hård invariant; (3) konstruktion = det flippade trädet är ett helt nytt äkta träd med posteriorer som bas-sannolikheter, inga villkorstabeller.

**Vad byggdes:**

- **`src/model/bayesReversal.ts`:** `reverseTreeWithBayes(root)` → `{ flipped, voc, originalEv, flippedEv }`. Validering i insamlingssteget: kanonisk variabelsekvens (etikett + nodtyp per nivå), identiska utfallsmängder per variabel, Σ=1 per chansnod-instans (NaN = ofullständigt tillåts och propagerar), beslutsberoende chansfördelningar avvisas (klarsyn vore cirkulär), dubblerade variabelnamn över nivåer avvisas. Bygget: chansvariabler först (ursprunglig inbördes ordning), sedan besluten; per-gren-nodkopior med kontextupplösta fördelningar som bassannolikheter; payoff-funktionen evalueras ur originalträdet per fullständig variabeltilldelning — dupliceringsregeln faller ut naturligt, och variabler som en grens payoffs inte beror på hoppas över (speglar originalets tidiga terminering).
- **UI:** Flip-knapp → split-läge med två canvas. Höger = klarsynsträdet, skrivskyddat med egen zoom/pan och rubriken "Omvänt träd (klarsyn)". VOC-rad ("EV original = … · EV omvänt = … · VOC = …"). Vänsterredigering re-flippar live. Oflippbart träd visar algoritmens exakta felmeddelande i högerpanelen. Sammanfoga återgår och kastar det härledda trädet.
- **Tester:** 16 nya (14 modell + 2 UI), totalt 87, alla gröna. Handräknade: klassiska fallet (VOC 0.7, "Nej"-payoff duplicerad), tvåvariabelfallet med path-beroende fördelningar (VOC 1.4), chans-först-no-op (VOC exakt 0), alla fem avvisningsfallen, NaN-propagering, VOC-invarianten (kastar på −0.5, klampar −1e−12), split-cykeln flip → redigera → live re-flip (0.7 → 0.4 handräknat) → sammanfoga.
- **Browser-verifierat:** hela flödet byggt via dialogerna (Satsa/Väder-trädet), flip → VOC 0.7, backward-fill i split-läge → live re-flip → VOC 0.4, sammanfoga → vänsterträdet intakt. Inga konsolfel.

**Judgment calls:**

1. **Promptens steg 3–4 (marginal per terminal, P(path|terminal)) implementerades inte** — de ingår inte i den klassiska klarsyns-konstruktionen som de låsta besluten definierar. De posteriorer som faktiskt behövs (och används) är de kontextupplösta chansfördelningarna P(V | tidigare chansutfall). Chansvariabler behåller sin inbördes ordning: för klarsyns-EV (Σ_ω P(ω)·max) är den irrelevant, så ingen chans-mot-chans-Bayes-inversion behövs någonsin.
2. **Variabler identifieras med etikett + nodtyp** (i ett äkta träd är samma variabel olika nodobjekt per gren). Samma etikett på två olika nivåer avvisas med tydligt fel.
3. **Flera beslut stöds generellt:** alla chansvariabler före alla beslut, båda grupperna behåller inbördes ordning.
4. **Beslutsberoende chansfördelningar avvisas** (tolerans 1e-9, NaN≡NaN) hellre än medlas — "lär dig utfallet innan du beslutar" är odefinierat om utfallet beror på beslutet.
5. **Σ≠1 blockerar flip med tydligt fel; helt osatta sannolikheter (NaN) tillåts** och ger VOC "–" — konsistent med appens ofullständighets-filosofi och viktigt för live re-flip medan man bygger.
6. **Flippade trädet trunkeras per gren** när payoffs inte beror på återstående variabler (ingen meningslös nivå med odefinierade sannolikheter).
7. **Högerträdet ritas vänster-till-höger som vänsterträdet,** inte speglat som legacy — läsbarhet före spegel-estetik; markerat ⚠️ i SPEC om det vill återinföras.
8. **VOC-raden visar även båda EV-värdena,** inte bara differensen — pedagogiskt är jämförelsen poängen.

**Kvarstår (❌):** beräkningssteg-visning, save/load-UI, undo/redo, PNG-export. (Obs: uppdragstexten nämnde "EU" som nästa MVP-segment enligt en prioritetsordning i SPEC.md — någon sådan finns inte i SPEC.md ännu; ovanstående är vad SPEC faktiskt listar som ❌.)

---

## 2026-07-27 (segment 5) — Refaktor till läroboksmodellen + legacy's interaktions-UX

**Bakgrund:** Flip/split-segmentet pausades vid en genuin matematisk oklarhet i Bayes-omvändnings-spec:en (dokumenterad i föregående konversation — de tre öppna frågorna om scope/semantik/konstruktion är **fortfarande obesvarade** och flip är fortsatt pausad). Istället analyserades legacy-UI:t på djupet på Vincents begäran (menystruktur, dialoger, interaktionsflöden), vilket ledde till tre bekräftade beslut:

1. **Modellen refaktoreras till legacy/läroboks-semantiken:** två nodtyper (`decision`/`chance`), utfallen är kanterna, terminala utfall (utan barn) bär payoff — lövnodtypen är borttagen.
2. **Villkorstabeller lagras per nod** (villkor → komplett fördelning över nodens utfall), inte per kant — radsumma-1 blir strukturellt naturlig.
3. **UI:t följer legacy's interaktionsmodell:** kompakt kontextmeny per nod + fokuserade dialoger, istället för allt-i-ett-sidopanelen.

**Vad byggdes:**

- **Modell:** `tree.ts` omskriven (NodeType `decision`/`chance`, `Outcome.value` för terminala utfall, `addOutcome`/`setChild`/`detachChild`/`removeOutcome`/`renameOutcome`). `renameOutcome` skriver om både nodens egna villkorsradsnycklar och alla villkorstokens i trädet. `conditionalProbability.ts` matchar nu hela rader (mest specifika vinner, tie → fel; utfall utanför raden faller tillbaka på bas). `expectedValue`, `validateProbabilities`, `backwardFill` (mål = terminalt utfall), `serialization` (NaN/undefined ↔ null explicit — den tidigare NaN-varningen är därmed löst by design) — alla anpassade.
- **Rendering:** terminala utfall ritas som triangel + payoff + joint path-sannolikhet (NaN-propagerande). Rektangel = beslut, ellips = slump.
- **UI:** kontextmeny (Byt namn / Redigera utfall / Växla typ / Villkorstabell / Ta bort nod), utfallsredigerare med explicit Normalisera-knapp (aldrig tyst), villkorsmatris (rader = villkor från förfädernas utfall via dropdown, kolumner = nodens utfall, "(bas)"-rad), terminaldialog (payoff + backward-fill-mål + Lägg till barnnod), meddelanderad för backward-fill-rapporter och fel.
- **Tester:** alla 10 testfiler omskrivna för nya semantiken — 71 tester, alla gröna. `tsc` rent, `npm run build` rent. Fullt flöde browser-verifierat (skapa rot via dialog → utfall via matrisdialog → payoffs via terminaldialog → EV 4.4 → backward-fill 0.3→0.6 med transparent rapport → EV 6.8 → beslutsnod fäst efter ett utfall, asymmetriskt träd) utan konsolfel.

**Judgment calls:**

1. **"Ta bort nod" bevarar det ingående utfallet** som terminal slutpunkt (payoff osatt) istället för att ta bort hela utfallet — legacy tog bort noden ur sekvensen; i ett äkta träd är detta närmaste motsvarighet och minst destruktivt. Att ta bort själva utfallet görs i utfallsredigeraren (✕, med delträdsvarning).
2. **Villkorsdialogens radsummor blockerar inte spara** — Σ-varningen visas live i dialogen och på noden i trädet; hårda fel reserveras för strukturella problem (dubbletter, tomma etiketter). Följer varna-inte-blockera-mönstret.
3. **Villkorsrader med tomma celler** sparar bara de ifyllda kolumnerna (övriga utfall faller tillbaka på bas vid upplösning).
4. **Villkorsval i dialogen är en-token-per-rad** (dropdown över förfädernas utfall, som legacy). Modellen stödjer multi-token-villkor (subset-matchning finns kvar), men UI:t exponerar det inte än.
5. **"Lägg till nod"-knappen** skapar bara rot (dialog med typval); med befintligt träd visas ett hint-meddelande — trädet växer via terminaldialogens "Lägg till barnnod".
6. **Terminaldialogen applicerar bara ändrade fält** (som legacy's LeafValueDialog) — tömt värdefält = payoff osätts.

**Kvarstår (❌):** Flip/split med Bayes (pausad — de tre matematikfrågorna måste besvaras först), VOC, beräkningssteg-visning, save/load-UI, undo/redo, PNG-export.

---

## 2026-07-27 (segment 4) — Interaktivt UI: SVG-rendering, redigering, backward-fill, live EV

**Vad hände:** Claude Code byggde hela UI-segmentet på `rebuild-typescript` enligt de tre låsta besluten från legacy-genomgången.

- **Modellutökningar** (`src/model/`): `backwardFill.ts` (ren funktion, justerar första justerbara noden längs pathen, omskalar syskon proportionellt, returnerar full ändringsrapport, kastar `BackwardFillError` vid onåbart mål), `removeChild` (delträdsborttagning), `renameEdgeLabel` (skriver om alla villkorstokens i trädet vid namnbyte — den medvetna fixen för legacys tysta rename-brott). `branchLabel` flyttad till `tree.ts` som enda källa för tokenformatet `nodId:label`.
- **Rendering** (`src/render/`): `layout.ts` (ren geometri: lövslots med auto-expanderande höjd, föräldrar centrerade på barn, kantetiketter vid t=0.75 längs bezier-kurvan där syskonkurvor divergerat — testat separerade vid 3–4 utfall), `renderTree.ts` (idempotent SVG-ombyggnad, form per nodtyp: rektangel/ellips/triangel, live EV + upplöst sannolikhet, "–" för allt ofullständigt, icke-blockerande Σ-varningar).
- **UI-skal** (`src/ui/app.ts`): fast toppmeny (HTML utanför SVG — zoom/pan påverkar bara canvas-viewporten), redigeringspanel (skapa rot, lägg till gren, etikett/payoff/sannolikhet/villkorstabell, ta bort med bekräftelse), backward-fill med transparent rapport i panelen: "Justerade P(Vädret → Regn): 0.3 → 0.6 · syskon omskalade: Sol: 0.7 → 0.4".
- **Tester:** 33 nya (12 modell + 21 UI via jsdom). Totalt 62, alla gröna. `tsc --noEmit` rent, `npm run build` rent.
- **Verifierat i riktig webbläsare** (inte bara jsdom): skapa träd via UI-formulären, sätta sannolikheter, live EV uppdaterades korrekt (handräknat 4.4 → 6.8 efter backward-fill), ofullständig-markörer visades, felmeddelande vid ogiltigt mål utan krasch.

**Judgment calls (granska och korrigera vid behov):**

1. **"Osatt" sannolikhet = NaN.** Modellen (segment 3) har inget "unset"-tillstånd och default 0 vore ett fabricerat värde. Nya kanter skapas därför med `NaN`, som visas som "–" och ger "p ofullständig"-markör. Varning: `JSON.stringify(NaN)` → `null` — save/load-segmentet måste hantera detta explicit.
2. **"Lägg till nod" med befintligt träd** väljer roten och öppnar dess panel (där "Lägg till gren" finns) istället för att vara död eller skapa en andra rot.
3. **Redigeringspanel istället för popup-dialoger:** inline-redigering sker i en fast sidopanel (HTML, alltid synlig för vald nod) — enklare, temakonsekvent, och zoom-oberoende.
4. **En etikett vid grenskapande:** formuläret tar gren-etiketten (utfallets namn); den nya nodens etikett sätts till samma värde och kan ändras separat efteråt. Två fält vore mer korrekt men klumpigare.
5. **Syskon-etiketter måste vara unika** (både vid skapande och namnbyte) — annars kolliderar history-tokens `nodId:label` och villkorsupplösningen blir tvetydig.
6. **Backward-fill justerar aldrig en kant som styrs av en matchande villkorstabellspost** — att ändra dess bassannolikhet vore en tyst no-op (exakt legacy-felläget). Konservativ regel, dokumenterad i funktionens JSDoc.
7. **Löv skapade via UI kräver payoff direkt** i formuläret (modellens konstruktor kräver det) — ingen tyst default.
8. **Svensk UI-text** (verktyget är läromedel för en svensk kurs).
9. **Redigeringar committas på `change`-händelsen** (fokus lämnar fältet/Enter), inte per tangenttryck — hela trädet ritas om per commit och panelen byggs om.
10. **`confirm()` är injicerbar** i `createApp` så delete-flödet kan testas headless.

**Kvarstår (❌):** VOC, beräkningssteg-visning, flip/split med Bayes-omvändning (eget segment, låst beslut #2), save/load-UI (fil-I/O + NaN-hantering, se judgment call 1), undo/redo, PNG-export.

---

## 2026-07-27 — Legacy-genomgång (den riktiga koden) + tre låsta arkitekturbeslut

**Vad hände:** Vincent pekade ut en lokal mapp (`C:\Users\vince\Desktop\prog\git test\Beslutsanalys`) som visade sig innehålla en betydligt mer komplett version av det gamla projektet än vad GitHub hade — en fungerande FastAPI-backend (`main.py`, `/ev`, `/backward`), riktig EV- och backward-fill-logik, och en nästan komplett WPF-app (canvas-rendering, dialoger, save/load). Denna ersatte den tunnare GitHub-baserade `legacy/`-arkiveringen (se separat commit).

En fullständig genomläsning av `legacy/frontend/csharp-wpf/MainWindow.xaml.cs` (1171 rader), `ViewModels/TreeViewModel.cs` och `legacy/backend/treelogic.py` avslöjade:

- **Legacy's "träd" är i själva verket en platt sekvens** — `TreeViewModel.Sequence` låter alla outcomes på en nivå peka på samma nod-objekt på nästa nivå (`RebuildLinks()`). Asymmetriska träd är därför omöjliga i legacy-UI:t, och det är därför `LeafValues`/`NodeEvValues` måste vara path-keyed.
- Tre inbördes oförenliga nyckelformat för villkorade sannolikheter (UI: `"Nod = Outcome"`, forward-check: bara outcome-namn, traversering: `"Nod:Outcome"`) — subset-matchningen kunde aldrig träffa något UI:t skickade, och `calculate_ev` anropade aldrig villkors-upplösningen alls. Skärmen och beräkningen motsade varandra tyst.
- VOC-knappen var en återvändsgränd (Run EV fanns bara på vänster träd).
- Remove-node skyddade åt fel håll; rename bröt namnbaserade conditional-table-referenser tyst; tre olika sannolikhetssumma-toleranser; kantetiketter kolliderade blint.

**Tre arkitekturbeslut låsta som resultat** (dokumenterade i SPEC.md under "Lärdomar från legacy-genomgången"):

1. Rendering/UI byggs kring **äkta, potentiellt asymmetriska träd** (TS-modellen stödjer redan detta) — inte en pill-sequence-bar som legacy.
2. **Flip/split kräver riktig Bayes-omvändning** (marginaler + posteriorer), inte legacy's oförändrade sannolikhetskopiering, eftersom det senare ger tyst felaktig VOC så fort villkorade sannolikheter är i spel. Flip/split blir därför ett eget, senare segment — **inte** en del av det kommande rendering/UI-segmentet.
3. **Backward-fill behåller "justera första justerbara nod"-regeln**, men görs transparent (rapporterar till användaren vilken kant som ändrades) istället för att bara loggas tyst som i legacy.

De övriga legacy-buggarna är dokumenterade i SPEC.md som referens ("bugs att inte upprepa") — redan förhindrade av TS-modellens grundarkitektur (ett villkorsformat, hårda fel istället för tyst normalisering, äkta träd, id:n istället för namn).

**Kvarstår:** Rendering/UI (äkta träd-interaktion), VOC, beräkningssteg-visning, save/load-UI, undo/redo, PNG-export, och (nu bekräftat som eget segment) flip/split med Bayes-omvändning.

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
