# DecisionAnalysis — Progresslogg

Format: datum — vad hände — status/beslut. Nyast överst. Uppdatera denna fil efter varje segment/session, commit:a tillsammans med kodändringar.

---

## 2026-08-02 (segment 18) — Speglad layout för höger (klarsyns)träd i split-läge

**Vad byggdes:** Rent rendering/layout-segment — höger trädet i split-läge ritas nu **horisontellt speglat** (rot till höger, grenar växer vänster) istället för som en duplicerad vänster-till-höger-kopia. Bayes-omvändningens matematik rördes inte alls (redan verifierad).

**Implementation:** `mirrorLayout(layout, axisWidth)` i `layout.ts` — en ren efterbehandling som reflekterar varje x-koordinat till `axisWidth − x` (nodboxar, kant-x1/x2, etikett-x), lämnar y/storlek/history/nod-referenser orörda och bygger om `byNode`-mappen. `renderTree` fick en `mirror`-flagga: den kör `mirrorLayout(base, max(base.width, host.clientWidth))`, vänder lövtriangelns riktning (`L -20 0`), lövtextens sida (x −28, ankare end) och kant-etikettens ankare (start). **Ingen `scale(-1)`-transform** — texten ritas alltid upprätt, bara den rumsliga geometrin speglas. `renderRightPane` i app.ts skickar `mirror: true`.

**Layout-beslut (dokumenterade, inga blockeringar):**

1. **Reflektionsaxel = `max(innehållsbredd, canvas-bredd)`**, inte enbart innehållsbredd. C#-referensen reflekterar runt canvas-bredden (`canvasW − ColumnXs[i]`) så roten hamnar vid canvas-kanten. Att bara använda innehållsbredd skulle kläma ett litet träd mot mitten. `host.clientWidth` är 0 under jsdom → faller tillbaka på innehållsbredd (deterministiskt för enhetstester, som reflekterar runt en känd bredd).
2. **Texttypografi speglas aldrig** — bara nodpositioner, kurvriktning, triangelriktning och text-ankare. Labels/siffror förblir läsbara vänster-till-höger (promptens explicita krav).
3. **Speglingen sitter i layout-koordinaterna, inte i en SVG-vy-transform** — så oberoende zoom/pan (`viewRight`) och den idempotenta host.replaceChildren()-redrawen fungerar oförändrat.

**Testresultat:** 227 gröna (+7): `mirrorLayout` reflekterar x korrekt kring axeln (y/storlek/refs orörda, byNode ombyggd), rot-till-höger/löv-till-vänster, involution (spegla två gånger = original); `renderTree` mirror är idempotent (två renders identiska, inga DOM-dubbletter), placerar rot höger om barn, är horisontell spegelbild av ospeglad render, pekar lövtrianglar vänster med upprätt text. `tsc` + build rena.

**Live-verifierat** (JS-driven DOM): byggde beslut→chans-träd, Flip → höger träd har chans-rot vid x=623 (höger), beslut-barn vid x=383, löv vid x=188 (vänster), lövtrianglar pekar vänster, labels upprätt. Växla split av/på upprepade gånger → höger panel tömd rent vid av (0 SVG/noder), återuppbyggd identiskt vid på (ingen kvarhängande DOM). Litet träd → rot vid höger kant, inga konstiga marginaler.

**Committat direkt på `main`** — avgränsat scope (en ren layout-funktion + render-flagga + tester + docs), rör inte modell/beräkning eller vänstra trädet.

---

## 2026-08-02 (segment 17) — Undo/redo (Ctrl+Z / Ctrl+Shift+Z), snapshot-baserad

**Vad hände:** Byggde ångra/gör-om. Valde **snapshot-baserad historik** (inte command-pattern): vid varje committad mutation deep-clonas hela dokument-state via den redan testade `documentToJson`-round-trippen, plus vy-bitarna split-läge och vald nod. Motiv: med "fail loud"-principen och pedagogiska (små) träd är helträds-snapshots enklare att göra korrekta än inversa operationer per mutation — särskilt givet hur komplex länkad-variabel-synken är (en bugg i en handskriven "ångra sannolikhetssynk" vore lätt att missa).

**Arkitektur:** En central choke point i slutet av `render()`, gated av en `pendingCommit`-flagga som `markDirty()` sätter (och `toggleSplit()` direkt, eftersom split inte markerar dirty men ändå ska vara ångringsbart). Eftersom varje användaråtgärd avslutas med exakt ett `render()`-anrop kollapsar hela effekten — även multinods-effekter som auto-fyll/mirroring och sannolikhetssynk — till EN snapshot. `restore()` sätter en `restoring`-flagga som undertrycker snapshot under uppspelning. `history[cursor]` är alltid nuvarande state; äldre = ångra, nyare = gör om.

**Live-verifierat** (JS-driven DOM): byggde rot→utfall→auto-fyllt barn (2 instanser)→flip, sedan Ctrl+Z stegvis: flip→split av, auto-fyll→**båda** barnen borta i ett steg, utfall borta, rot borta, undo-knappen inaktiveras vid baseline. Ctrl+Shift+Z stegar korrekt framåt och inaktiverar redo vid tip.

**Judgment calls (särskilt "vad är ETT steg"):**

1. **Koalescering av sannolikhetsredigering löses av arkitekturen, inte av en debounce-timer.** Appen muterar trädet bara vid dialog-*spara* (aldrig per tangenttryckning — inmatningsfälten uppdaterar bara en Σ-varning live). Så kontinuerlig redigering av ett fält → en spara → en snapshot. Testet skriver flera värden i ett fält och sparar en gång → verifierar att EN ångra återställer hela vägen. Detta matchar promptens "commit vid blur/stängning".
2. **displayMode/utility-ändringar committar också** (de sätter `markDirty` → snapshot). Promptens lista nämnde dem inte explicit, men de ingår i dokument-snapshotten; att committa på dem gör ångra konsekvent (ingen överraskande sido-återställning av läge när man ångrar en trädändring gjord efter ett lägesbyte).
3. **Split-läge ingår i snapshotten** (utöver save-filens fält) så att ångra återställer split som prompten kräver — men `toggleSplit` sätter *inte* dirty (split sparas inte till fil), bara `pendingCommit`.
4. **Vald nod sparas i snapshotten** (billigt, undviker dinglande pekare) — id:t åter-hittas efter deserialisering eftersom serialiseringen bevarar id:n.
5. **Global `keydown` på `document`** (inte på container) för att fånga genvägar oavsett fokus. Hoppar över app-undo helt när `input`/`textarea`/`select`/contenteditable har fokus (fältets egen textundo gäller då). Stöd även `Ctrl+Y` för gör-om (billigt).
6. **Historiktak 100**, äldsta faller bort tyst via `shift()`.

**Testresultat:** 220 gröna (+10 undo/redo-tester: enkel add→undo→redo, koalescering till ett steg, auto-fyll ett steg, sannolikhetssynk ett steg, flip/split-ångra, ladda nollställer historik, redo rensas vid ny mutation, tangentbordsvakt vid textfält-fokus, historiktak utan krasch). `tsc` + build rena. Committat direkt på `main` — avgränsat scope (en UI-fil + CSS + tester + docs).

---

## 2026-08-02 (segment 16) — DESIGNÄNDRING: sannolikhetssynk + två länkade-grupp-buggar

Live-testning avslöjade tre saker: en **designändring** (inte buggfix) och två regressioner/buggar. Alla tre live-reproducerade och verifierade efter fix (JS-driven DOM mot den körande appen, då browser-panelen inte komponerar skärmdumpar).

### 1. DESIGNÄNDRING — sannolikheter synkas nu över länkade instanser (ändrar tidigare beslut)

**Motivering (användarens ord):** tidigare regel ("sannolikheter är egna per instans") gjorde verktyget för långsamt — man tvingades upprepa samma sannolikheter på varje länkad instans. Idén är att bygga träd snabbt och fylla i **en gång**.

**Ny regel:** platta utfallssannolikheter synkas som standard över gruppen (`syncProbabilitiesFromNode`), precis som utfallsuppsättning och nodtyp. Undantag: en instans med egen `conditional_table` blir kontextberoende och slutar automatiskt synka (varken skickar eller tar emot) — utan separat "Koppla loss". Tas tabellen bort återgår instansen till synk och antar gruppens delade fördelning (`adoptGroupProbabilities`). "Koppla loss" (`unlinkNode`) förblir den drastiska mekanismen som bryter allt. **Live-verifierat:** satte jag=0.7/du=0.3 på en okejdå-instans → båda syskonen antog 0.7/0.3.

### 2. REGRESSION — nodtyp-synk trasig

**Root cause:** `api.toggleType` satte bara `node.nodeType` på den enskilda noden — anropade aldrig gruppsynk (till skillnad från skapande/mirroring som håller typen invariant). En instans kunde bli beslutsnod medan syskonen förblev slumpnoder, trots att UI:t lovar typsynk. **Fix:** `toggleType` → `setNodeTypeInGroup` (propagerar till hela gruppen; frikopplade instanser med eget `variableId` lämnas orörda). **Live-verifierat:** typ-ändring på en av tre okejdå-instanser → alla tre blev rektanglar (beslutsnoder), roten namen förblev ellips.

### 3. BUGG — flip/Bayes-omvändning för länkade grupper

**Undersökning (reproducerat isolerat med modell-lagret):** algoritmen är faktiskt **redan korrekt**. Två länkade chansnoder utan beslut → korrekt no-op (VOC=0). Beslut → länkad chansgrupp med **samma** fördelning → viks korrekt ihop till EN gemensam rotnod (klarsyns-strukturen). Beslut → grupp med **olika** fördelningar → failar loud (`FlipError` "fördelningen skiljer sig mellan grenar"), vilket är korrekt (klarsyn odefinierad när slumpfördelning beror på beslut).

**Root cause för det upplevda felet:** den struktur användaren såg (okejdå som rot, beslutet duplicerat under varje utfall) är den **matematiskt korrekta** Bayes-omvändningen. Med gamla designen (oberoende sannolikheter) hade de tre instanserna olika fördelningar → flip kastade fel eller gav en förvirrande fold. **Designändring #1 är själva fixen:** synkade sannolikheter gör att en grupp utan villkorstabell garanterat delar en fördelning, så hopvikningen är entydig. **Reversal-algoritmen skrevs INTE om** (den var korrekt; att röra den vore onödig risk). **Live-verifierat:** beslut namen → länkad okejdå-grupp, flip → höger träd har exakt 3 noder: EN okejdå-rot + namen duplicerat under jag/du.

**Blandade fallet (villkorstabell på en instans i en länkad grupp):** väldefinierade tabeller (beror på chans-förfader, konsekvent över beslutsgrenar) hanteras korrekt via `chanceContextKey` — täcks av scenario 2 (VOC=1, instanserna länkade). En instans vars tabell gör fördelningen beslutsberoende → failar loud. Ingen tyst felaktig siffra är möjlig, så jag bedömde att fråga inte behövdes.

**Testresultat:** 206 gröna (+6). Nya: modell-synk (prob-synk default, villkorstabell opt-out åt båda håll, re-adopt vid borttagning, typ-synk propagering + frikopplad-instans skippas), app-nivå regressionstester (toggleType via api propagerar; prob-synk via utfallsdialogen; villkorstabell-instans opt-out), och flip-scenario 6 (hopvikning till en nod + fail-loud vid beslutsberoende fördelning). Tre gamla "oberoende"-tester **medvetet omskrivna** till nya synk-beteendet (inte raderade). `tsc` + build rena.

**Judgment calls:** (1) Skrev **inte** om reversal-algoritmen — den var redan korrekt; designändringen levererar fixen. (2) Nyskapade instanser startar fortfarande med osatta sannolikheter (synkas vid nästa redigering, som når alla redan skapade instanser) — enklare än att kopiera värden vid skapande, och "fyll en gång"-målet uppnås ändå. (3) Committat direkt på `main`: avgränsat scope (modellsynk-funktioner + UI-wiring + docs + tester), samma mönster som senaste segmenten.

---

## 2026-08-01 (segment 15) — Normalisera: repeterande decimaler summerar till exakt 1

**Bakgrund:** Jämn fördelning av sannolikheter som ger oändliga decimaler (⅓ = 0,333333…, ⅙ = 0,166666…) föll utanför Σ=1-valideringen: "Normalisera" avrundade varje värde till 6 värdesiffror, så tre 0,333333 summerade till 0,999999 → `|0,999999 − 1| ≈ 1,0000e-6`, precis *över* toleransen `1e-6` → Σ-felet triggades.

**Åtgärd:** Bröt ut en ren, testbar hjälpfunktion `distributeSumToOne(targets)` i `app.ts`: avrundar alla värden till 6 värdesiffror men sätter **sista utfallet = 1 − summan av de övriga**, så det absorberar avrundningsresten (⅓ → 0.333333 / 0.333333 / 0.333334). "Normalisera"-knappen bygger nu `targets` (tom → jämn fördelning `1/n`; annars skalning `v/Σ`) och kör dem genom hjälpen. Matematiskt: sista värdets egen 6-siffriga avrundning ger som mest 5e-7 fel, oavsett antal utfall → alltid inom `1e-6`.

**Testresultat:** 5 nya tester (tredjedelar → exakt [0.333333,0.333333,0.333334]; jämn fördelning 2–12 utfall inom tolerans; nakna 0.333333-fallet fixat; normaliserad uppsättning passerar `validateProbabilities` utan Σ-fel; enkel-/tom-fall). Totalt 200 gröna. `tsc` + build rena. **Live-verifierat** (JS-driven DOM genom den riktiga Normalisera-knappen): 3 utfall → 0.333333/0.333333/0.333334, summa 1, ingen Σ-varning.

**Judgment call:** Behöll principen "aldrig tyst normalisering" — fixen gäller bara den **explicita** Normalisera-knappen, inte automatiskt vid inmatning. Alternativet (auto-normalisera medan man skriver) valdes bort eftersom det skulle dölja verkliga inmatningsfel, tvärtemot läromedlets fail-loud-design.

---

## 2026-08-01 (segment 14) — Flip/VOC: korrekthetsbevis + UX-polish

**Bakgrund:** Flip/split (VOC) fanns redan implementerat och enhetstestat, men live-användning kändes klurig/oklar. Uppdraget var dubbelt: (1) bevisa matematisk korrekthet i fler verkliga scenarier än de ursprungliga testerna, (2) göra flödet begripligt utan dokumentation.

**Del 1 — korrekthetsverifiering (`src/model/bayesReversal.scenarios.test.ts`, 7 nya tester, alla med handräknade värden):**

1. **Enkelt symmetriskt träd** — beslut vs säkert utfall, VOC=2. Korrekt.
2. **Villkorstabeller** (legacys kända svaghet) — C1→beslut→C2 där C2:s fördelning är villkorad på C1 (0.9/0.1 vs 0.1/0.9). Handräknat VOC=1. Testet är medvetet konstruerat så att om omvändningen ignorerade villkorstabellen och använde marginalen (0.5/0.5) skulle den ge VOC=5. Koden ger 1 → **villkorade sannolikheter respekteras genom hela reversal-processen, inte bara marginalerna. Legacy-buggen finns inte kvar.** Korrekt.
3. **Nästlade länkade grupper** — Väder→Bet(länkad)→Utfall(nästlad länkad), VOC=1.2. variableId-baserad scope-validering ger rätt även på djupet + en negativkontroll att olänkade, olika fördelade likadant-namngivna noder korrekt *avvisas*. Korrekt.
4. **Asymmetriskt träd** — tidig terminering (No→3), dupliceringsregeln, VOC=0.7. Korrekt.
5. **Djupt 4-nivåers blandat träd** — C1→D1→C2→D2, länkade grupper; interna invarianter (VOC≥0) + oberoende omräkning av båda EV:erna via `calculateExpectedValue`. Korrekt.

**Ingen matematikbugg hittad.** Ett testantagande var fel (scenario 3 trodde jag var en no-op VOC=0, men Utfall ligger efter beslutet → VOC=1.2); koden hade rätt, jag rättade testets förväntan.

**Del 2 — UX-granskning (browser-automation + jsdom-tester) och fixar:**

| Observation | Åtgärd |
| --- | --- |
| Flip öppnar split automatiskt, VOC visas direkt | Redan bra — ingen ändring |
| Återgång ("Sammanfoga") bevarar vänsterträdets redigeringar | Redan bra — låst med test |
| Höger träd märkt "Omvänt träd (klarsyn) — skrivskyddat" | Redan bra — ingen ändring |
| **"VOC" är en oförklarad förkortning** för en student | Ny alltid-synlig hint-rad under VOC-raden som förklarar VOC = värdet av klarsyn; tooltip på Flip-knappen |
| **Ofullständigt träd (utfall utan sannolikhet/payoff) → tyst "VOC = –"** utan orsak | Fail-loud: VOC-raden säger nu *varför* ("fyll i alla sannolikheter och utfallsvärden …"), i både EV- och EU/CE-läge |
| **FlipError-meddelanden på engelska** i svenskt UI | Alla `FlipError`-meddelanden översatta till svenska (+ testregexerna uppdaterade) |

**Testresultat:** 195 gröna (185 baslinje + 7 scenarier + 3 nya jsdom-UI-tester för VOC-raden: komplett→siffror+hint, ofullständigt→fail-loud, sammanfoga→dolt+bevarat). `tsc --noEmit` + `vite build` rena. Live-verifierat (JS-driven DOM, då browser-panelen inte komponerade för skärmdumpar): tomt-träd-flip visar hjälptext + hint, tooltip och skrivskyddad-caption på plats.

**Judgment calls:**

1. **Översatte modell-lagrets `FlipError`-meddelanden till svenska.** De visas direkt för användaren i högerpanelen, så i ett annars helsvenskt läromedel är engelska en reell inkonsekvens (observerad live). Uppdaterade de ~6 testregexer som matchade engelska delsträngar. Alternativet (behålla engelska modellfel) valdes bort eftersom texten är användarvänd, inte utvecklarintern.
2. **Committat direkt på `main`** utan separat PR — avgränsat scope (två UI-element + felmeddelandeöversättning + tester, inga modell-*beteende*ändringar), samma mönster som segment 13. VOC-matematiken rördes inte alls; bara verifierades.

---

## 2026-07-28 (segment 13) — Rekursiv/tvärgående mirroring av länkade instanser

**Vad hände:** Live-test avslöjade att auto-fyllen (segment 10) bara verkade på ett plan: när "okej" lades under nämen:1 fylldes nämens egna syskonutfall (okej', okej'' under nämen) men INTE motsvarande position på nämen'/nämen'' — de förblev öar. Byggde man ut nämen' separat fick den en orelaterad struktur.

**Åtgärd:** Ersatte `autoFillLinkedSiblings` (egen-nivå-fyllning) med `mirrorLinkedInstances`, som speglar över hela rutnätet `grupp(förälder) × utfall`: för varje instans av förälderns variabel (föräldern själv + länkade syskon P', P'') och varje terminalt utfall på den instansen skapas en länkad instans av det nyskapade barnet. Det täcker båda dimensionerna i ett svep — egna terminala syskon (gamla task #12) OCH motsvarande utfall på förälderns länkade syskon. `attachChild` anropar den (fortsatt chance-gate). Positionsmappningen är label-baserad (samma nyckel som utfalls-synken; entydig i befintlig kod).

**Testresultat:** 8 nya tester (screenshot 9-grid, oberoende sannolikheter + synkad uppsättning, no-overwrite av avvikande gren, granular unlink på djupet, djup-komposition till 18-grid, flip/VOC med nästlade grupper, bunden-prestanda på 5 nivåer, + UI-flödestest). Totalt 185, alla gröna. `tsc` + build rena. **Live-verifierat (bild 1 → bild 2):** byggde nämen-gruppen (3 instanser), la okej under nämen:1 → 9 okej-instanser över hela rutnätet (13 noder totalt), meddelanderaden listade dem; granular unlink på en nästlad okej gav "frikopplad" och lämnade resten intakt. Inga konsolfel.

**Judgment calls:**

1. **Ett bundet pass, ingen rekursion i handlern.** Nyckelinsikt: en nyskapad nod är alltid barnlös vid skapandet, så ett enda grid-fill-pass (|grupp|×|utfall|) ger exakt önskad slutbild. Djup komponeras via efterföljande skapande-event (var och en triggar handlern en gång för sin grupp) — inte via rekursion i passet. Detta uppfyller prestandakravet ("EN pass, ingen trädtäckande sökning, får inte cascada obegränsat") bättre än den bokstavliga rekursion prompten skisserade, och ger samma slutresultat. Prestandatest: 5 nivåer, <1s, <500 noder.
2. **Namngivning: befintligt enkel-index-schema, inget specialfall.** Prompten skissade "'okej" (ledande prim per förälder-instans). Vår `displayName` = basnamn + efterföljande primar via ett enda `instanceIndex`. De 9 okej-instanserna blir alltså okej, okej', …, okej⁸ (en grupp, unika namn), inte en 2D ledande/efterföljande-notation. Prompten sa uttryckligen "verifiera att er befintliga auto-namngivningslogik redan producerar detta korrekt utan specialfall" — så jag behöll det existerande schemat (funktionellt korrekt: en synkad grupp med unika namn). Ett 2D-namnschema vore en separat kosmetisk ändring; flaggas här om det önskas.
3. **Granular unlink fungerade redan** på valfritt djup tack vare att `variableId` är per-nod oberoende av förälderns — verifierat med test, ingen modelländring behövdes.
4. **Flip/VOC krävde inga ändringar** i `bayesReversal.ts` (redan variableId-baserad) — verifierat med test för nästlade grupper.
5. **Committat direkt på `main`** (nu enda branchen) utan separat PR — omfånget är avgränsat (en modellfunktion + tester + docs, 185 gröna, live-verifierat), så en PR-granskningsrunda bedömdes inte motiverad.

---

## 2026-07-28 (segment 12) — Konsolidera deploy till bara `main`

**Vad hände:** Live-länken serverade ett gammalt bygge eftersom deploy-workflowet bara triggade på `main` medan segment 9–11 låg okmergade på `rebuild-typescript`. En tillfällig fix la till `rebuild-typescript` som andra deploy-källa (både i workflow-triggern och i `github-pages`-miljöns branch-policy). Det gav två parallella deploy-källor till samma URL — inte önskvärt permanent.

**Åtgärd:** `main` görs till enda sanning för både kod och deploy. `rebuild-typescript` mergas till `main` (segment 9–11 + docs), deploy-triggern återställs till `branches: [main]`, och `rebuild-typescript` tas bort ur `github-pages`-miljöns tillåtna branches. Efter detta deployar bara push till `main`. README:s deploy-sektion uppdaterad därefter.

**Branch-städning:** `cleanup` raderad (0 commits ahead av main, redundant). `feature/child-based` **lämnad orörd** — innehåller gammal C#/WPF-referenskod (VOC-display, flip-layout, save/load) som kan vara värdefull referens för ett kommande segment (riktig visuell speglingslayout i split-läge).

---

## 2026-07-28 (segment 11) — Spara/ladda-UI (JSON-filer)

**Vad hände:** Kopplade den befintliga (sedan segment 3 testade) serialiseringen till fil-I/O och UI.

- **`src/model/document.ts`:** ett dokument-omslag runt trädserialiseringen — `{ tree, displayMode, utility, idCounter }` — så en sparfil också fångar EV/EU-läge, nyttofunktionsinställningar och id-räknaren (höjs över högsta befintliga id vid laddning så nya noder inte kolliderar). `deserializeDocument` validerar fail-loud med specifika meddelanden (ogiltig JSON, saknat/okänt format, felaktig display_mode/utility, felaktig nodform, **trasig variabelgrupp** = samma variableId med olika namn/typ) — laddar aldrig ett partiellt/reparerat träd. `documentFilename` härleder ett säkert namn ur rotetiketten + datum.
- **UI:** 💾 Spara laddar ner dokumentet (Blob + `<a download>`); 📂 Ladda öppnar filväljare, läser + validerar + applicerar och ritar om allt (träd, EV/EU, variabelgrupper). Dirty-flagga (sätts vid varje mutation, nollställs vid spara/ladda) driver en bekräftelse innan en laddning kastar osparat arbete.
- **Tester:** 18 nya (round-trip enkel + komplex med länkade variabler/villkor/EU, idCounter-höjning, tomt dokument, sex malformerade-fall, filnamn, samt UI-spara/ladda/bekräfta-flödet). Totalt 177, alla gröna. `tsc` + build rena. Browser-verifierat end-to-end: bygg → spara ("Sparat som väder-2026-07-28.json") → ladda ett dokument återställer träd + EV/EU/CE-visning exakt (Marknad, CE 2.481 vid γ=0.15, handkontrollerat); malformerade filer ger specifika fel och lämnar trädet orört. Inga konsolfel.

**Judgment calls:**

1. **Sparformatet är appens eget dokument** (med `format`-tagg + version). Blott-träd-filer från annat håll avvisas med tydligt meddelande snarare än att tyst laddas — förutsägbart och matchar fail-loud-principen.
2. **Split-läge sparar bara originalträdet** — det omvända (klarsyns-)trädet är alltid härlett/omräkningsbart, så det behöver inte persisteras; laddning återgår till enkelvy.
3. **Osparade ändringar = dirty-flagga + confirm**, inte en beständig "osparat"-indikator. Enklare och räcker för segmentet (prompten tillät att skjuta upp en mer polerad indikator). `idCounter` persisteras + höjs defensivt över högsta `n<siffra>`-id vid laddning.
4. **Nyttoinställningar round-trip-as** (displayMode + utility) eftersom de påverkar de visade värdena — annars skulle en laddad EU-fil visa fel siffror.

**MVP-status:** oförändrat komplett. Save/load låg utanför MVP men var efterfrågat; nu klart. Fortfarande ❌ (utanför scope): VOI för imperfekt information, känslighetsanalys, flerdimensionella värdefunktioner, relevansdiagram, risk & förmåga, undo/redo, PNG-export, speglad högerträds-layout.

---

## 2026-07-28 (segment 10) — Auto-fill av länkade instanser (korrigering från live-test)

**Vad hände:** Live-test (screenshot) visade en lucka: en slumpnod "test" med utfall 1/2/3/4 där man la "Hej" under "1" fick INTE automatiskt Hej'/Hej''/Hej''' under 2/3/4 — länkning skedde bara om man manuellt skapade varje nod med matchande namn. Detta segment gör länkningen proaktiv och omedelbar vid nodskapande.

- **Modell:** `autoFillLinkedSiblings(root, parent, template, nextId)` i `variable.ts` — återanvänder `createLinkedNode` för att fylla varje fortfarande *terminalt* syskon-utfall under `parent` med en länkad instans av det nyss skapade barnet (delad `variableId`, synkad utfallsuppsättning + nodtyp, egna sannolikheter). Fires en gång per skapande, en nivå djupt (varje ny instans är barnlös → ingen kaskad). Icke-terminala syskon (redan byggd eller frikopplad struktur) lämnas orörda.
- **UI:** `attachChild` kallar auto-fill efter att barnet kopplats — men **bara när föräldern är en slumpnod**. Meddelanderaden listar de skapade instanserna.
- **Tester:** 10 nya (screenshot-scenariot, ingen överskrivning av befintlig struktur, respekterar tidigare unlink, unlink-en-påverkar-inte-andra, flip behandlar auto-fyllda instanser som en variabel, chance-only-grinden). Totalt 159, alla gröna. `tsc` + build rena. Browser-verifierat: screenshot-scenariot ger nu Hej/Hej'/Hej''/Hej''' automatiskt, och utfall som läggs till på en instans synkas till alla fyra. Inga konsolfel.

**Judgment call (frågade användaren — genuint tvetydigt):**

- **Auto-fill gäller bara slumpnoder, inte beslutsnoder.** Specen sa "any outcome of a parent", men bokstavligt tillämpat på beslutsnoder skulle det bryta asymmetriska beslutsträd — det klassiska klarsyns-/VOC-exemplet som verktyget självt räknar på är asymmetriskt ("Satsa? Ja→chansning, Nej→säker payoff"). Att auto-fylla Nej med en länkad chansnod skulle tvinga användaren att radera den. Frågade och användaren bekräftade slumpnoder-bara. Manuell namn-länkning under beslutsgrenar fungerar fortfarande om man vill ha symmetri.
- **Terminal-vakten `if (edge.child) continue`** hanterar både "redan byggd struktur" och "tidigare frikopplad instans" (en frikopplad instans har fortfarande ett barn → icke-terminal → hoppas över), så ingen extra logik behövdes för att respektera unlinks.

**Status:** MVP oförändrat komplett. Save/load-UI återstår som nästa segment (påbörjades men pausades för denna korrigering). Övrigt utanför MVP oförändrat.

---

## 2026-07-28 (segment 9) — Länkade variabelinstanser

**Vad hände:** Gjorde "samma variabel på flera grenar" till ett förstklassigt begrepp (`variableId`) istället för en implicit namnjämförelse, och stärkte flip/VOC-valideringen med det.

- **Modell:** `TreeNode` fick `variableId` (grupp; singleton = eget id) och `instanceIndex` (0 = primär; prim-markörer via `displayName`, aldrig lagrade i `label`). Nytt `src/model/variable.ts`: `createLinkedNode` (auto-länkar på namnmatch, kopierar utfallsuppsättning, typkonflikt → `VariableConflictError`), `addOutcomeToGroup`/`removeOutcomeFromGroup`/`renameOutcomeInGroup` (synkar uppsättningen, ej sannolikheter; rename kör full per-instans-omskrivning av villkorsnycklar + tokens), `renameVariable` (propagerar), `unlinkNode` (frikoppling + recompact), `relinkByName` (normalisering från namn). `bayesReversal` identifierar nu variabler via `variableId`. Serialisering persisterar `variable_id`/`instance_index` (bakåtkompatibelt).
- **UI:** nodskapande via `createLinkedNode` med länknings-meddelande; utfallsdialogen visar "Detta påverkar även: …" och rutas via grupp-funktionerna; "Byt namn" på länkad nod döper hela variabeln; ny "⛓ Koppla loss"-menypost; alla namn visas via `displayName` (prim-markörer). Typkonflikt visas tydligt.
- **Tester:** 19 nya (12 `variable.test.ts` inkl. den kritiska villkorstabell-integriteten över instanser, 5 UI, 2 nya flip-fall). Totalt 150, alla gröna. `tsc` + build rena. Browser-verifierat: auto-länk med synkade utfall, flip som känner igen länkade instanser som en variabel (VOC 2.1), inga konsolfel.

**Judgment calls:**

1. **Intern representation:** `label` = basnamn (delas av gruppen), `instanceIndex` → prim-markörer via `displayName()`, `variableId` = grupp-id (singleton = eget nod-id). Ingen central variabelregister — allt härleds genom att gå trädet, vilket passar den självständiga träd-arkitekturen.
2. **Rename-semantik (låst beslut A från användaren):** att döpa om en nod döper hela variabeln (propagerar); unlink är en **separat** explicit menypost, inte samma gest. Detta löste den tvetydighet jag stannade och frågade om.
3. **Unlink** ger färsk `variableId` (= nod-id), `instanceIndex` 0, behåller utfall/sannolikheter/villkorstabell; kvarvarande grupp recompactas så prim-markörer förblir sammanhängande. Behåller basnamnet (kan ge två likanamnade oberoende variabler tills användaren döper om — dokumenterat, ej ett fel).
4. **Villkorssäker synkad rename:** varje instans har egna `nodId:etikett`-tokens, så en synkad utfalls-rename kör den fulla enkelnods-omskrivningen på varje instans (nyckel-rekey + token-rewrite över hela trädet). Testat att inga villkorsrader blir föräldralösa — detta var den datakritiska punkten prompten varnade för.
5. **Flip-identitet via `variableId`:** två tillfälligt likanamnade men *olänkade* noder behandlas nu som olika variabler (flip avvisar) — mer robust än gammal sträng-matchning. Länkade instanser med olika visningsnamn (Väder/Väder') känns korrekt igen som en variabel. `relinkByName` finns för att normalisera externt byggda träd (t.ex. i tester), men körs aldrig automatiskt (skulle upphäva en explicit unlink).
6. **`relinkByName` i flip-testerna:** de bygger träd med rå `new TreeNode`, så de normaliseras från namn först — speglar vad UI:t (createLinkedNode) skulle ha producerat.

**MVP-status:** oförändrad — MVP var redan komplett (segment 8). Detta är en UX/robusthets-utökning ovanpå MVP. Fortfarande ❌ (utanför MVP): VOI för imperfekt information, känslighetsanalys, flerdimensionella värdefunktioner, relevansdiagram, risk & förmåga, undo/redo, PNG-export, save/load-UI, speglad högerträds-layout.

---

## 2026-07-27 (segment 8) — Beräkningssteg-visning · MVP KOMPLETT

**Vad hände:** Sista MVP-segmentet. Byggde steg-för-steg-visning av aritmetiken bakom varje nods värde, och regressionstestade Σ-varningen.

- **`src/model/calculationTrace.ts`:** `traceNode(node, history, mode, fn)` ger en enrads, läsbar trace: slumpnod i EV-läge = viktad summa ("0.3 × 8 + 0.7 × 2 = 3.8") med resolved conditional probs; slumpnod i EU-läge = nyttosumman + CE-konvertering ("EU = 0.3 × 5.507 + 0.7 × 1.813 = 2.921 → CE = 3.454"); beslutsnod = "max(Ja: 3.8, Nej: 3) = 3.8 (välj Ja)". `traceTerminalUtility` ger "u(8) = 6.321" för terminala utfall i EU-läge. Återanvänder befintliga EV/EU/CE-funktioner för barnvärden (inga signaturändringar). ~4 signifikanta siffror (ingen float-brus). Ofullständig data → "Ofullständig data — kan inte visa beräkning".
- **UI:** trace-bar visar vald nods beräkning, uppdateras live vid varje ändring och respekterar EV/EU-läget. Terminaldialogen får nyttotransform-rad i EU-läge.
- **Σ-varning (Part 3):** verifierat att den fungerar i båda lägen och använder resolved (conditional-table-medvetna) sannolikheter — ny regressionstest med villkorsrad som summerar till 1.2.
- **Tester:** 14 nya (10 trace-modell + 4 UI). Totalt 131, alla gröna. `tsc` rent, build rent. Browser-verifierat: chance/decision-trace i båda lägen med handkontrollerade värden (u(8)=5.507, EU=2.921, CE=3.454), live-uppdatering, incomplete-fallback. Inga konsolfel.

**Judgment calls:**

1. **Trace är enradig, per vald nod** (inte hela rekursionen på en gång) — barnvärden visas som tal, och användaren kan välja barnet för att se dess egen trace. Matchar promptens exempel och håller det läsbart. Implementerat som fristående `traceNode`-läsare som återanvänder EV/EU/CE i stället för att tråckla en collector genom rekursionen — noll signaturändringar.
2. **EU-lägets slumpnod-trace visar nyttorummet** ("EU = Σ p·u = … → CE = u⁻¹(…)") — det är den ärliga aritmetiken och själva den pedagogiska poängen med EU (transformera → väntevärde → tillbaka). Beslutsnoder visar CE per gren (monotont ekvivalent med max EU, men läsbart i pengar).
3. **Många barn: radbrytning, inte trunkering** (`word-break`) — hellre en lång men komplett/ärlig aritmetik än en avkortad. Trace-baren wrappar.
4. **Avrundning till ~4 signifikanta siffror** via samma `toPrecision(4)`-logik som resten av appen — konsekvent, och tar bort `4.19999…`-brus.

**MVP-status — KOMPLETT.** Alla fyra MVP-prioriteringspunkter är ✅: (1) modellrefaktor, (2) VOC, (3) EU, (4) pedagogiska tillägg. Kärn-MVP:n (trädvisualisering + EV + EU + VOC + pedagogisk polish) är byggd enligt ursprunglig scope.

**Fortfarande ❌ — allt explicit utanför MVP från start** (egna framtida segment): VOI för imperfekt information, känslighetsanalys, flerdimensionella värdefunktioner, relevansdiagram, risk & förmåga-modul, beslutsanalyscykel-vy, real optioner, undo/redo, PNG-export, save/load-UI, samt speglad högerträds-layout i split-läge (⚠️ i SPEC).

---

## 2026-07-27 (segment 7) — Expected Utility (EU/CE) med γ-elicitering

**Vad hände:** Byggde EU som alternativt beräkningsläge vid sidan av EV. Ursprungspromptens fyra u-funktionstyper reviderades mitt i segmentet till kursmaterialets två (linjär + exponentiell CARA), med γ-elicitering som den pedagogiskt centrala biten.

- **`src/model/utility.ts`:** linjär (identitet) + exponentiell CARA u(x)=(1−e^(−γx))/γ, båda med sluten, algebraiskt verifierad invers. Domänvaktat (`UtilityDomainError` vid utility utanför inverterbar räckvidd); NaN (osatt payoff) propagerar. γ-elicitering: `gammaFromIndifference(p)=ln(p/(1−p))` (exakt lösning av CARA-indifferensen u(0)=p·u(1)+(1−p)·u(−1)), `gammaFromReferenceAmount(W)=0.96/W`, `riskOddsFromGamma=e^γ`.
- **`src/model/expectedUtility.ts`:** `calculateEU` (samma decision=max/chance=viktat-medel-rekursion som EV, men på nyttovärden), `certaintyEquivalent` = u⁻¹(EU).
- **UI:** lägesknapp EV↔EU/CE; i EU-läge visar noder CE (pengar, aldrig råa nyttotal). Utility-bar (typval Linjär/Exponentiell, γ-finjustering, riskodds-utläsning). Elicitering-dialog med båda metoderna, live γ/r-utläsning och exempel-CE:n. Split-läge räknar VOC på CE i EU-läge. Utility-fel visas som banner + "CE –", ingen krasch.
- **Tester:** 30 nya (utility + EU + UI). Totalt 117, alla gröna. `tsc` rent, build rent. Browser-verifierat: EV 5 → CE 3.799 (γ=0.1), elicitering p=0.6 → γ=0.4055/r=1.5, W=48 → γ=0.02, split-CE-VOC, graceful "CE –" vid γ utanför räckvidd. Inga konsolfel.

**Judgment calls:**

1. **Fyra typer → två.** Tog bort kvadratisk och logaritmisk helt (kod + tester) istället för att lämna dem oanvända — matchar projektets "ingen död kod"-disciplin och SPEC:ens två-typs-scope. Linjär + exponentiell räcker för kursen.
2. **Parametern heter `parameter` i interfacet men *är* γ för exponentiell** — ett fält, minimal UI. Kursens "riskodds" r (=e^γ) visas i UI:t men lagras aldrig; bara γ lever i modellen.
3. **Default vid EU-läge = exponentiell γ=0.1** (synligt riskavert), inte linjär — så att växlingen till EU faktiskt visar CE<EV istället för en no-op. Användaren kan välja Linjär explicit.
4. **Typbyte återställer γ till typens default**; finjustering sker efteråt.
5. **Split-läges-EU byggdes (inte uppskjutet):** VOC på CE var en ren utökning (CE på båda träden). CE_omvänt ≥ CE_original håller eftersom u⁻¹ är växande, så ≥0-egenskapen består. Ren chansträd (utan beslut) ger korrekt VOC=0.
6. **Elicitering-preview** visar exempel-CE:n för 50/50-chansningar (100 resp. 10) snarare än en ritad u-kurva — textbaserat är robustare och räcker för intuition.
7. **γ=0 hanteras som riskneutrala gränsvärdet** (identitet) i både applyUtility och inversen, så p=0.5-elicitering blir ren riskneutralitet utan division-med-noll.

**MVP-status:** Efter detta segment återstår endast punkt 4 i MVP-prioriteringen — pedagogiska tillägg (sannolikhetsvaliderings-UI-varning finns redan i renderingen som Σ-varning; kvar är steg-för-steg-beräkningsvisning). Sedan är MVP (trädvisualisering, EV, EU, VOC) komplett.

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
