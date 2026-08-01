# DecisionAnalysis — Målspec (TypeScript, from scratch)

Status: ✅ byggt · ⚠️ delvis/risk · ❌ ska byggas.

Beslut 2026-07-25: C# WPF och Python-backend skrotas. Allt byggs i TypeScript som en statisk webbapp (GitHub Pages), inget backend krävs — beräkningarna är enkla nog att köra client-side.

**Teknikstack:** Vite + vanilla TypeScript, SVG-rendering av trädet, deploy till GitHub Pages via GitHub Actions. Krav: en extern, icke-teknisk person ska kunna klicka en länk och få upp verktyget direkt i webbläsaren, inget installationssteg.

## MVP-prioritering (bekräftad 2026-07-27)

Kursen (Grunderna för beslutsfattande och beslutsanalys, vecka 2–10) har ett mycket större kravomfång än vad som byggs nu. MVP:n är medvetet avgränsad till fyra kärnfunktioner: **trädvisualisering, EV, EU, VOC**. Allt annat (VOI för imperfekt information, känslighetsanalys, flerdimensionella värdefunktioner, relevansdiagram, risk & förmåga-modul, beslutsanalyscykel-vy) är explicit utanför MVP och kommer som senare, separata segment.

**Byggordning för MVP:**

1. ✅ Modellrefaktor (två nodtyper `decision`/`chance`, payoff på terminala outcomes, villkorstabeller per nod) — klar.
2. ✅ VOC (flip/split med Bayes-omvändning för klassisk klarsyn) — klar.
3. ✅ EU (Expected Utility) — u-funktion i två former (linjär + exponentiell CARA med parameter γ, reviderat 2026-07-27 efter kursmaterialet), EV räknas om på nyttovärden och transformeras tillbaka till säkerhetsekvivalent (CE) för visning. γ sätts via elicitering (indifferens-fråga eller referensbelopp), inte råinmatning. Klar.
4. ✅ Pedagogiska tillägg: sannolikhetsvalidering som synlig UI-varning (Σ-indikator på noden, resolved-prob-medveten) och steg-för-steg-beräkningsvisning (trace-bar för vald nod + terminal-nyttotransform i EU-läge). Klar. **MVP komplett.**

**Explicit uteslutet ur MVP (senare, egna segment):** VOI för imperfekt information (kräver Bayesiansk uppdatering, likelihood, sensitivitet/specificitet — bygger vidare på VOC-ramverket), känslighetsanalys, flerdimensionella värdefunktioner, relevansdiagram, risk & förmåga-modul, beslutsanalyscykel-vy, real optioner, undo/redo, PNG-export, save/load-UI.

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

## Nodtyper (reviderat beslut 2026-07-27)

- ✅ **Två** nodtyper: `decision` och `chance`, med explicit `nodeType`-fält (`src/model/tree.ts`). **Utfallen är kanterna** från noden (`Outcome`), och ett terminalt utfall (utan barn) är slutpunkten och bär payoff-värdet (`Outcome.value`) — det finns ingen separat lövnodtyp. Detta matchar läroboksmodellen och legacy's semantik, och löser både namnkollisionen (`Outcome`-klass vs `'outcome'`-nodtyp) och etikettdupliceringen som den tidigare tre-typsmodellen hade.

## Datamodell

- ✅ `TreeNode` / `Outcome` i TS (`src/model/tree.ts`): `addOutcome` (unika syskon-etiketter), `setChild`/`detachChild`/`removeOutcome`/`renameOutcome`. Osatt sannolikhet = `NaN`, osatt payoff = `undefined` — visas som "–", aldrig fabricerade nollor.
- ✅ Villkorstabeller lagras **per nod** (reviderat 2026-07-27, som legacy): varje rad = villkor (set av `nodId:utfall`-tokens) → komplett fördelning över nodens utfall. Radsumma-1 är därmed strukturellt naturlig, till skillnad från per-kant-overrides. Subset-matchning mot history, mest specifika rad vinner, lika specifika kastar `AmbiguousConditionalProbabilityError` (`src/model/conditionalProbability.ts`). Utfall som en matchande rad inte täcker faller tillbaka på bassannolikheten.
- ✅ Cykel-skydd vid nod-koppling: `setChild` går upp genom `parent`-kedjan och kastar `CyclicTreeError` om barnet redan är en förfader (inkl. self-loop).
- ✅ `renameOutcome` skriver om både nodens egna villkorsraders nycklar och alla `nodId:etikett`-tokens i hela trädet — rename kan inte tyst döda villkor (legacy-buggen).
- ✅ **Länkade variabelinstanser** (`src/model/variable.ts`, reviderat 2026-07-27/28): samma konceptuella variabel kan förekomma som separata nodinstanser på olika grenar. `TreeNode` har `variableId` (grupp; singleton = eget id) och `instanceIndex` (0 = primär, driver prim-markörer via `displayName` — den primade strängen lagras aldrig i `label`). Skapa en nod med ett befintligt namn → auto-länkas (delad `variableId`, kopierad utfalls*uppsättning*, typkonflikt kastar `VariableConflictError`). **Rekursiv/tvärgående mirroring (`mirrorLinkedInstances`, 2026-07-28):** när en nod skapas under en **slumpnods** utfall speglas den över hela rutnätet `grupp(förälder) × utfall` — dvs. både (a) förälderns *egna* övriga terminala utfall OCH (b) motsvarande utfall (samma label) på förälderns länkade syskoninstanser P', P''. Alla skapade noder bildar en egen länkad grupp. Screenshot-fallet: nämen/nämen'/nämen'' (3 instanser, utfall 1/2/3) + "okej" under nämen:1 → 9 okej-instanser över hela 3×3-rutnätet, en delad `variableId`. En **enda bunden pass** per skapande-event (|grupp|×|utfall|, aldrig en trädtäckande sökning); djup komponeras naturligt eftersom varje efterföljande nodskapande triggar samma handler för sin egen grupp (en nyskapad nod är barnlös, så ingen rekursion behövs i passet). Endast terminala positioner fylls (befintlig/frikopplad/avvikande struktur lämnas orörd — no-overwrite på valfritt djup); gäller **inte** beslutsnoder (asymmetriska beslut bevaras — klassiska VOC-exemplet). Positionsmappningen mellan instansers utfall är label-baserad (samma nyckel som utfalls-synken). Utfallsuppsättningen hålls **alltid** synkad över gruppen (add/remove/rename propagerar; villkorssäker rename skriver om varje instans egna villkorsnycklar + tokens); **sannolikheter och villkorstabeller synkas inte** (samma variabel, kontextberoende sannolikheter). Att döpa om en instans döper hela variabeln (propagerar); explicit "Koppla loss" frikopplar en instans till egen variabel — **granulärt på valfritt djup** (t.ex. en nästlad okej' kan frikopplas utan att påverka nämen-nivån eller okej/okej''-gruppen), eftersom varje nod bär sin egen `variableId` oberoende av förälderns; framtida mirroring hoppar över den frikopplade grenen via no-overwrite. `variableId`/`instanceIndex` round-trip-serialiseras.

## Beräkningar

- ✅ EV per nod: slumpnoder = viktat medelvärde över utfallen (terminalt utfall bidrar med sitt `value`, barn med sitt EV); beslutsnoder = max. Rekursiv, fungerar på varje nod i trädet (`src/model/expectedValue.ts`).
- ✅ Backward-fill: `src/model/backwardFill.ts` — målet är ett terminalt utfall; justerar första justerbara noden längs pathen (slumpnod, >1 utfall, ej styrd av matchande villkorsrad), löser ut sannolikheten mot mål-joint, omskalar syskon proportionellt. Returnerar full rapport (nod, utfall, gammal/ny, syskonjusteringar) som UI:t visar i meddelanderaden — aldrig tyst (låst beslut #3). Kastar `BackwardFillError` vid onåbart mål.
- ✅ VOC (Value of Clairvoyance): `src/model/bayesReversal.ts` — klassisk klarsyn (chansvariabler flyttas före besluten), VOC = EV(omvänt) − EV(original). Hård invariant: genuint negativ VOC kastar fel (perfekt information kan aldrig skada — negativt betyder bugg), float-brus klampas till 0. Scope: alla paths måste möta samma variabler i samma ordning — variabelidentitet avgörs av `variableId` (länkade instanser), inte av tillfälligt lika namn (reviderat 2026-07-27); tidig terminering hanteras med läroboks-dupliceringsregeln; strukturkonflikt, olika utfallsmängder, beslutberoende chansfördelningar, dubblerade variabler och Σ≠1 ger specifika `FlipError` istället för tyst fel svar. Osatta sannolikheter propagerar till VOC = "–".
- ✅ Beräkningssteg-visning (`src/model/calculationTrace.ts`): trace-bar visar aritmetiken bakom vald nods värde — slumpnod EV "0.3 × 8 + 0.7 × 2 = 3.8" (resolved conditional probs), slumpnod EU "EU = 0.3 × 5.507 + 0.7 × 1.813 = 2.921 → CE = 3.454", beslutsnod "max(Ja: 3.8, Nej: 3) = 3.8 (välj Ja)", terminal-nyttotransform "u(8) = 6.321" i EU-läge. Live, mode-medveten, ~4 signifikanta siffror, "Ofullständig data"-fallback.
- ✅ Sannolikhetsvalidering: `src/model/validateProbabilities.ts` kastar `ProbabilitySumError` (med nod-id och faktisk summa) om villkorade sannolikheter för en nod inte summerar till 1 inom tolerans 1e-6 — normaliserar inte tyst. UI:t visar varningen icke-blockerande på noden ("Σ = 0.6 ⚠"), och skiljer på *fel* summa och *ofullständig* data ("p ofullständig" när sannolikheter är osatta).

## Flip / split

- ✅ Flip-knappen växlar till split-läge: vänster = originalträdet (redigerbart som vanligt), höger = det omvända klarsynsträdet (skrivskyddat, egen zoom/pan, tydligt märkt). VOC-rad visar EV original · EV omvänt · VOC. "Sammanfoga" går tillbaka till enkelträdsvyn.
- ✅ Högerträdet är alltid härlett: varje redigering av vänsterträdet (sannolikheter, payoffs, backward-fill, struktur) re-flippar och uppdaterar VOC live. Oflippbara träd visar algoritmens specifika felmeddelande (vilka variabler/grenar som krockar) i högerpanelen.
- ✅ Trädoberoende verifierat: det flippade trädet byggs som ett helt nytt träd (`flip_N`-id:n, egna nodkopior per gren, posteriorer som bas-sannolikheter — inga villkorstabeller, inga delade referenser). Testat att flippade noder inte förekommer i originalträdet.
- ✅ **UX-polish (2026-08-01):** split-läget öppnas direkt av Flip (inget extra klick för VOC), Flip-knappen har en tooltip som förklarar vad den gör, och en alltid synlig hint-rad under VOC-raden förklarar i en mening att **VOC = värdet av klarsyn** (hur mycket EV ökar om alla slumputfall är kända innan besluten). "Sammanfoga" återgår utan att förlora vänsterträdets redigeringar (verifierat i test).
- ✅ **Fail-loud även för ofullständiga träd (2026-08-01):** ett strukturellt giltigt men ofullständigt träd (saknade sannolikheter/payoffs) kastar ingen `FlipError` — då blir EV:erna `NaN`. Tidigare visades bara ett tyst "VOC = –"; nu visar VOC-raden **varför** ("fyll i alla sannolikheter och utfallsvärden …"), i både EV- och EU/CE-läge. Alla `FlipError`-meddelanden är översatta till svenska (var tidigare engelska i ett annars svenskt UI).
- ✅ **Matematiken verifierad över fem scenarier (2026-08-01, `bayesReversal.scenarios.test.ts`, bevisbörda):** (1) symmetriskt VOC=2, (2) **villkorstabeller** VOC=1 — konstruerat så att en naiv marginalomvändning i stället skulle ge 5, alltså bevisas att villkorade sannolikheter respekteras genom hela reversal-processen (legacy-buggen finns inte kvar), (3) nästlade länkade grupper VOC=1.2, (4) asymmetriskt/dupliceringsregeln VOC=0.7, (5) djupt 4-nivåers blandat träd (interna invarianter + oberoende omräkning). Ingen matematikbugg hittad.

## Rendering / UI (interaktionsmodell reviderad 2026-07-27 efter legacy-analysen)

- ✅ SVG-rendering av trädet (`src/render/`), fullt idempotent redraw (rensa + bygg om, inga ackumulerande lyssnare). Former, inte färger: rektangel = beslutsnod, ellips = slumpnod, triangel = terminalt utfall (med payoff och joint path-sannolikhet).
- ✅ Bézier-kurvor för grenar, etiketter med upplöst sannolikhet. Etiketter placeras vid t=0.75 längs kurvan där syskonkurvor divergerat — verifierat separerade vid 3–4 utfall per nod (legacy-buggen). Beslutsnoders alternativ visar ingen sannolikhet.
- ✅ Zoom/pan begränsad till canvas-ytan (transform på SVG-viewporten; toppmenyn är vanlig HTML utanför). Dubbelklick återställer zoom.
- ✅ Leaf-spacing auto-expand mot overlap, omräknas varje redraw.
- ✅ Svart-vitt tema rakt igenom, inklusive alla dialoger (legacy's lila villkorsdialog upprepas inte).
- ✅ **Legacy's interaktionsmodell:** klick på nod → kompakt kontextmeny (Byt namn / Redigera utfall / Växla typ / Villkorstabell / Ta bort nod), varje val öppnar en fokuserad dialog. Klick på terminalt utfall (triangel) → dialog med payoff + mål-joint-sannolikhet (backward-fill) + "Lägg till barnnod" (så växer trädet — äkta asymmetriska träd). Utfallsredigeraren har en **explicit** Normalisera-knapp och Σ-varning — normaliserar aldrig tyst. Villkorstabellen redigeras som matris (rader = villkor valda ur förfädernas utfall, kolumner = nodens utfall, "(bas)"-raden = bassannolikheterna).
- ✅ Live EV per nod och upplöst sannolikhet per utfall — uppdateras direkt vid varje ändring, ingen "beräkna"-knapp. Ofullständig data (osatt sannolikhet/payoff, nod utan utfall) visas som "–", aldrig fabricerade värden. Nya utfall skapas med **osatt** (NaN) sannolikhet, inte 0. Backward-fill-rapporter och fel visas i meddelanderaden under toppmenyn.
- ⚠️ Höger träd i split-läge ritas med samma vänster-till-höger-layout som vänsterträdet (roten till vänster), inte speglat som i legacy. Medvetet val: klarsynsträdet läses naturligast i samma riktning; spegling kan läggas till senare om det efterfrågas pedagogiskt.

## Spara / ladda

- ✅ Serialisering/deserialisering (`src/model/serialization.ts`) round-trip-testad, snake_case-fältnamn (`conditional_tables`). Osatt sannolikhet (NaN) och osatt payoff mappas **explicit** till `null` och tillbaka.
- ✅ Spara/ladda-UI (`src/model/document.ts` + app.ts): 💾 Spara laddar ner ett dokument (`{ tree, displayMode, utility, idCounter }`, JSON, Blob-nedladdning, filnamn = rotnamn + datum); 📂 Ladda öppnar filväljare, validerar + applicerar + ritar om. Round-trip exakt inkl. länkade variabelgrupper (`variableId`/`instanceIndex`), villkorstabeller och EV/EU-inställningar. Validering är fail-loud (ogiltig JSON, okänt/saknat format, felaktig display_mode/utility/nodform, trasig variabelgrupp) — laddar aldrig ett partiellt/trasigt träd. Dirty-flagga + bekräftelse innan en laddning skriver över osparade ändringar. Split-läge sparar bara originalträdet (det omvända är alltid härlett).
- Path-keyed datastrukturer för delade Outcome-objekt över flera paths: **inte en risk idag** (trädet är strikt ett träd, ingen delning), men bli explicit designkrav om delning införs senare.

## Undo/redo

- ❌ Ctrl+Z / Ctrl+Shift+Z, täcker trädändringar (lägg till/ta bort nod, ändra payoff/sannolikhet, flip/split).

## Export

- ❌ PNG-export med transparent bakgrund, bara text/grafik synlig. Kräver att renderingen finns först.

## Expected Utility (EU)

- ✅ EU-beräkning (väntad nytta) som alternativ till EV (`src/model/expectedUtility.ts`, `src/model/utility.ts`).
- **U-funktion (reviderat 2026-07-27 efter kursmaterialet):** endast **två** former — linjär (riskneutral, u(x)=x, CE=EV) och exponentiell CARA u(x)=(1−e^(−γx))/γ. Parametern heter **γ**; kursens "riskodds" r relaterar via γ = ln(r) (γ>0 riskavert, γ=0 neutral, γ<0 risksökande). Kvadratisk/logaritmisk från den tidigare fyra-typs-versionen är borttagna (utanför kursmaterialet). Båda har sluten invers för CE.
- Terminala outcomes payoff-värden transformeras genom u-funktionen → EU räknas som EV men på nyttovärdena (samma decision=max/chance=weighted-average-rekursion) → CE = u⁻¹(EU) i pengar för visning. Osatt payoff → NaN → "–". Ogiltig invers (utility utanför räckvidd) kastar `UtilityDomainError` och visas som banner + "CE –", ingen krasch.
- **γ-elicitering (kursens metoder, `src/model/utility.ts`):** (1) indifferens-fråga — användaren anger p där hen är indifferent mellan 0 säkert och (p: vinn 1 / 1−p: förlora 1) → γ = ln(p/(1−p)) exakt; p=0.5 → γ=0. (2) snabb approximation — referensbelopp W → γ ≈ 0.96/W. UI:t visar resulterande γ, riskodds r, och exempel-CE:n; γ kan finjusteras manuellt efteråt.
- UI: lägesknapp EV ↔ EU/CE i toppmenyn; i EU-läge visar noder CE (pengar, aldrig råa nyttotal). Utility-bar med typval + γ-input + elicitering-dialog. Gäller även split-läge: VOC beräknas då på CE (CE_omvänt − CE_original), samma ≥0-egenskap som EV-läges-VOC.

## Explicit ur scope tills vidare

- Ingen backend/server — allt körs client-side, statisk deploy.
- Ingen C#/.NET-kod behålls.
- Ingen Python-kod behålls (kan användas som referens för logik, men porteras inte rakt av).
