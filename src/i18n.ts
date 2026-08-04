/** Minimal, dependency-free i18n. Two languages only (Swedish default, English)
 * per the course context. A single typed `Dict` interface means sv and en can
 * never drift — a missing key is a compile error. The active language lives in
 * module state (persisted to localStorage) so any call site can read it via
 * `t()`; the app re-renders on `setLang`. Swedish strings are byte-identical to
 * the pre-i18n code, so the existing (sv-default) test suite stays green. */

export type Lang = 'sv' | 'en'

const STORAGE_KEY = 'da-lang'

function readInitial(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'sv' || v === 'en') return v
  } catch {
    /* localStorage unavailable (SSR/tests) — fall through to default */
  }
  return 'sv'
}

let current: Lang = readInitial()

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  current = lang
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    /* ignore persistence failure */
  }
}

/** The full set of user-facing UI strings. Plain strings for static text,
 * functions for anything with interpolation. */
export interface Dict {
  // ── Top bar ──
  titleField: string
  addNode: string
  flip: string
  merge: string
  flipTitle: string
  undo: string
  undoTitle: string
  redo: string
  redoTitle: string
  save: string
  saveTitle: string
  load: string
  saveAsFile: string
  saveAsPng: string
  langTitle: string
  // ── Utility bar ──
  utilityFunction: string
  utilityLinear: string
  utilityExponential: string
  setRiskAttitude: string
  riskOdds: (r: string) => string
  modeEv: string
  modeEuCe: string
  // ── Panes ──
  reversedCaption: string
  reversedEditedCaption: string
  deviationBadge: string
  deviationTitle: string
  emptyHint: string
  // ── Context menu ──
  rename: string
  renameVariable: string
  editOutcomes: string
  makeDecision: string
  makeChance: string
  conditionalTable: string
  unlinkFromVariable: string
  deleteNode: string
  deleteNodeConfirm: (what: string) => string
  deleteSubtree: (label: string, edge: string) => string
  deleteWholeTree: string
  pillLockedTable: string
  pillLockedNonUniform: string
  // ── Generic dialog ──
  cancel: string
  create: string
  ok: string
  close: string
  save_: string // dialog "Spara" button (distinct id from top-bar save)
  name: string
  type: string
  nodeChance: string
  nodeDecision: string
  nameDialogNode: string
  nameDialogVariable: string
  createRoot: string
  // ── Outcomes dialog ──
  outcomesTitle: (node: string) => string
  outcomeLabelPlaceholder: string
  probPlaceholder: string
  addOutcome: string
  normalize: string
  pIncomplete: string
  sumWarning: (sum: string) => string
  allOutcomesNeedLabel: string
  outcomeLabelsUnique: string
  syncNoteTable: (siblings: string) => string
  syncNoteLinked: (siblings: string) => string
  // ── Divergence dialog ──
  divergenceTitle: string
  divergenceBody: (node: string, siblings: string) => string
  divergenceOwn: string
  divergenceGroup: string
  unlinkedOwnProbs: (node: string) => string
  unlinkedMessage: (node: string) => string
  // ── Conditional table dialog ──
  conditionalTitle: (node: string) => string
  noOutcomesYet: string
  conditionColumn: string
  baseRow: string
  addCondition: string
  noConditionsAvailable: string
  tableSyncNote: string
  resolvedForInstance: (path: string, parts: string) => string
  pathRoot: string
  // ── Terminal dialog ──
  terminalTitle: (node: string, edge: string) => string
  payoffLabel: string
  payoffPlaceholder: string
  utilityTransform: (text: string) => string
  jointLabel: string
  jointPlaceholder: string
  addChildNode: string
  valueMustBeNumber: string
  // ── Attach-child dialog ──
  newNodeAfter: (edge: string) => string
  // ── Elicitation dialog ──
  elicitTitle: string
  elicitMethod: string
  elicitIndifference: string
  elicitReference: string
  elicitPPlaceholder: string
  elicitWLabel: string
  elicitWPlaceholder: string
  elicitResult: (gamma: string, r: string, attitude: string) => string
  riskAverse: string
  riskNeutral: string
  riskSeeking: string
  enterValidValue: string
  // ── Save / load / png messages ──
  savedAs: (name: string) => string
  loaded: (name: string) => string
  couldNotReadFile: string
  nothingToExport: string
  exported: (files: string) => string
  couldNotExportEmpty: string
  // ── VOC / trace bars ──
  vocEmptyHint: (vocLabel: string) => string
  vocIncomplete: (vocLabel: string) => string
  vocRow: (valLabel: string, vocLabel: string, orig: string, rev: string, voc: string) => string
  calculation: (node: string, text: string) => string
  // ── renderTree ──
  pIncompleteShort: string
  sumShort: (sum: string) => string
  ambiguousConditions: string
  badgeTableTip: string
  badgeLinkedTip: string
  // ── Misc messages / hints / confirms ──
  vocHint: string
  linkedCreated: (shown: string, extra: number) => string
  linkedToVariable: (label: string, display: string) => string
  unsavedConfirm: string
  subtreeRemoveConfirm: (edge: string) => string
  rootExistsHint: string
  elicitPLabel: string
  elicitExample: (ce100: string, ce10: string) => string
  useGamma: string
}

const sv: Dict = {
  titleField: 'BESLUTSTRÄD',
  addNode: 'Lägg till nod',
  flip: '⇄ Flip',
  merge: '⇄ Sammanfoga',
  flipTitle:
    'Visar trädet omvänt (alla slumputfall kända innan besluten) bredvid ditt ' +
    'träd och räknar ut VOC — värdet av klarsyn. Klicka igen för att stänga.',
  undo: '↶',
  undoTitle: 'Ångra (Ctrl+Z)',
  redo: '↷',
  redoTitle: 'Gör om (Ctrl+Shift+Z)',
  save: 'Spara ▾',
  saveTitle: 'Spara som fil (JSON) eller som PNG-bild',
  load: 'Ladda',
  saveAsFile: 'Spara som fil',
  saveAsPng: 'Spara som PNG',
  langTitle: 'Byt språk / Switch language',
  utilityFunction: 'Nyttofunktion:',
  utilityLinear: 'Linjär (riskneutral)',
  utilityExponential: 'Exponentiell',
  setRiskAttitude: 'Ställ in riskattityd…',
  riskOdds: (r) => `(riskodds r = ${r})`,
  modeEv: 'Läge: EV',
  modeEuCe: 'Läge: EU/CE',
  reversedCaption: 'Omvänt träd (klarsyn) — redigerbart',
  reversedEditedCaption: 'Omvänt träd — fri jämförelse',
  deviationBadge: '✎ redigerad sedan Sammanfoga',
  deviationTitle:
    'Höger träd har redigerats manuellt sedan det genererades. VOC är nu en fri ' +
    'jämförelse mellan de två trädens värden, inte en strikt klarsynsvärdering.',
  emptyHint: 'Tomt träd — klicka "Lägg till nod" för att skapa en rotnod.',
  rename: '✎ Byt namn',
  renameVariable: '✎ Byt namn på variabeln',
  editOutcomes: '☰ Redigera utfall',
  makeDecision: '⇄ Gör till beslutsnod',
  makeChance: '⇄ Gör till slumpnod',
  conditionalTable: '⊞ Villkorstabell',
  unlinkFromVariable: '⛓ Koppla loss från variabeln',
  deleteNode: '✕ Ta bort nod',
  deleteNodeConfirm: (what) => `${what}. Fortsätt?`,
  deleteSubtree: (label, edge) =>
    `"${label}" och hela dess delträd tas bort — utfallet "${edge}" blir en slutpunkt igen`,
  deleteWholeTree: 'Hela trädet tas bort',
  pillLockedTable: 'Har villkorstabell — låst position, kan inte ordnas om.',
  pillLockedNonUniform:
    'Nivån är inte en enhetlig variabel (t.ex. en frikopplad instans) — kan inte ordnas om.',
  cancel: 'Avbryt',
  create: 'Skapa',
  ok: 'OK',
  close: 'Stäng',
  save_: 'Spara',
  name: 'Namn',
  type: 'Typ',
  nodeChance: 'Slumpnod',
  nodeDecision: 'Beslutsnod',
  nameDialogNode: 'Nodens namn',
  nameDialogVariable: 'Variabelns namn (påverkar alla instanser)',
  createRoot: 'Skapa rotnod',
  outcomesTitle: (node) => `Utfall — ${node}`,
  outcomeLabelPlaceholder: 'etikett',
  probPlaceholder: 'p',
  addOutcome: '+ utfall',
  normalize: 'Normalisera',
  pIncomplete: 'p ofullständig — tomma sannolikheter visas som "–" i trädet',
  sumWarning: (sum) => `⚠ Summan är ${sum}, förväntat 1`,
  allOutcomesNeedLabel: 'Alla utfall måste ha en etikett',
  outcomeLabelsUnique: 'Utfallsetiketter måste vara unika inom noden',
  syncNoteTable: (siblings) =>
    `Den här instansen styrs av sin villkorstabell — sannolikheterna nedan ` +
    `används bara som fallback och synkas inte med gruppen (${siblings}). ` +
    `Ta bort villkorstabellen för att synka igen.`,
  syncNoteLinked: (siblings) =>
    `Länkad till: ${siblings}. Utfallsuppsättning och sannolikheter synkas i ` +
    `gruppen. Anger du andra sannolikheter än gruppen får du välja om det ska ` +
    `gälla alla eller bara den här instansen.`,
  divergenceTitle: 'Sannolikheterna skiljer sig från gruppen',
  divergenceBody: (node, siblings) =>
    `"${node}" är länkad till ${siblings}. Du angav andra sannolikheter än ` +
    `gruppen. Vad vill du göra?`,
  divergenceOwn: 'Bara den här instansen (koppla loss)',
  divergenceGroup: 'Uppdatera hela gruppen',
  unlinkedOwnProbs: (node) =>
    `"${node}" är nu frikopplad — egen variabel med egna sannolikheter.`,
  unlinkedMessage: (node) => `"${node}" är nu frikopplad — egen variabel, synkas inte längre.`,
  conditionalTitle: (node) => `Villkorstabell — ${node}`,
  noOutcomesYet: 'Noden har inga utfall än — lägg till utfall först.',
  conditionColumn: 'Villkor',
  baseRow: '(bas)',
  addCondition: '+ villkor',
  noConditionsAvailable: 'Inga villkor tillgängliga — noden har inga förfäder med utfall.',
  tableSyncNote:
    'Så länge den här instansen har en villkorstabell styr den sina egna ' +
    'sannolikheter och synkas inte med gruppen. Tar du bort alla villkorsrader ' +
    'börjar den synka igen och antar gruppens fördelning.',
  resolvedForInstance: (path, parts) => `Gäller för den här instansen (väg: ${path}): ${parts}`,
  pathRoot: 'roten',
  terminalTitle: (node, edge) => `${node} → ${edge}`,
  payoffLabel: 'Värde (payoff)',
  payoffPlaceholder: 'osatt',
  utilityTransform: (text) => `Nyttotransform: ${text}`,
  jointLabel: 'Sätt joint probability (backward-fill)',
  jointPlaceholder: 'mål-sannolikhet (0–1]',
  addChildNode: '+ Lägg till barnnod…',
  valueMustBeNumber: 'Värdet måste vara ett tal',
  newNodeAfter: (edge) => `Ny nod efter "${edge}"`,
  elicitTitle: 'Ställ in riskattityd (γ)',
  elicitMethod: 'Metod',
  elicitIndifference: 'Indifferens-fråga',
  elicitReference: 'Snabb approximation (referensbelopp)',
  elicitPPlaceholder: '0 < p < 1 (p = 0.5 → riskneutral)',
  elicitWLabel: 'Referensbelopp W (γ ≈ 0.96 / W)',
  elicitWPlaceholder: 'W > 0',
  elicitResult: (gamma, r, attitude) => `γ = ${gamma} · riskodds r = ${r} · ${attitude}`,
  riskAverse: 'riskavert',
  riskNeutral: 'riskneutral',
  riskSeeking: 'risksökande',
  enterValidValue: 'Ange ett giltigt värde först.',
  savedAs: (name) => `Sparat som ${name}.`,
  loaded: (name) => `Laddade ${name}.`,
  couldNotReadFile: 'Kunde inte läsa filen.',
  nothingToExport: 'Inget träd att exportera.',
  exported: (files) => `Exporterade ${files} (PNG, transparent bakgrund).`,
  couldNotExportEmpty: 'Kunde inte exportera — trädet är tomt.',
  vocEmptyHint: (vocLabel) =>
    `${vocLabel} = – · bygg ett träd (Lägg till nod) för att räkna ut klarsynens värde`,
  vocIncomplete: (vocLabel) => `${vocLabel} = – · fyll i alla sannolikheter och utfallsvärden`,
  vocRow: (valLabel, vocLabel, orig, rev, voc) =>
    `${valLabel} vänster = ${orig} · ${valLabel} höger = ${rev} · ${vocLabel} = ${voc}`,
  calculation: (node, text) => `Beräkning (${node}): ${text}`,
  pIncompleteShort: 'p ofullständig',
  sumShort: (sum) => `Σ = ${sum} ⚠`,
  ambiguousConditions: '⚠ villkor tvetydiga',
  badgeTableTip: 'Villkorstabell — styr egna sannolikheter, synkas inte med gruppen',
  badgeLinkedTip:
    'Länkad instans — utfall och sannolikheter synkas med samma variabel på andra grenar',
  vocHint:
    'VOC = värdet av klarsyn: hur mycket det förväntade värdet (EV) ökar om du ' +
    'får veta alla slumputfall innan du fattar besluten. Höger träd visar det ' +
    'omvända beslutsläget som VOC bygger på.',
  linkedCreated: (shown, extra) =>
    `Länkade instanser skapade: ${shown}${extra > 0 ? ` (+${extra} till)` : ''}. ` +
    `Utfallsuppsättning, nodtyp och sannolikheter synkas automatiskt ` +
    `(en instans med egen villkorstabell styr sina egna sannolikheter).`,
  linkedToVariable: (label, display) =>
    `Länkad till variabeln "${label}" — utfall synkas automatiskt mellan alla ` +
    `instanser (visas som "${display}").`,
  unsavedConfirm: 'Osparade ändringar går förlorade om du laddar en fil. Fortsätt?',
  subtreeRemoveConfirm: (edge) => `Utfallet "${edge}" har ett delträd som tas bort. Fortsätt?`,
  rootExistsHint:
    'Trädet har redan en rot — klicka på en nod för att redigera, eller på en ' +
    'triangel för att bygga vidare.',
  elicitPLabel: 'Sannolikhet p: indifferent mellan 0 säkert och (p: vinn 1 / 1−p: förlora 1)',
  elicitExample: (ce100, ce10) =>
    `Exempel: en 50/50-chansning om 100 är värd CE = ${ce100}; om 10 → CE = ${ce10}.`,
  useGamma: 'Använd γ',
}

const en: Dict = {
  titleField: 'DECISION TREE',
  addNode: 'Add node',
  flip: '⇄ Flip',
  merge: '⇄ Merge',
  flipTitle:
    'Shows the tree reversed (all chance outcomes known before the decisions) ' +
    'beside your tree and computes VOC — the value of clairvoyance. Click again to close.',
  undo: '↶',
  undoTitle: 'Undo (Ctrl+Z)',
  redo: '↷',
  redoTitle: 'Redo (Ctrl+Shift+Z)',
  save: 'Save ▾',
  saveTitle: 'Save as file (JSON) or as a PNG image',
  load: 'Load',
  saveAsFile: 'Save as file',
  saveAsPng: 'Save as PNG',
  langTitle: 'Switch language / Byt språk',
  utilityFunction: 'Utility function:',
  utilityLinear: 'Linear (risk-neutral)',
  utilityExponential: 'Exponential',
  setRiskAttitude: 'Set risk attitude…',
  riskOdds: (r) => `(risk odds r = ${r})`,
  modeEv: 'Mode: EV',
  modeEuCe: 'Mode: EU/CE',
  reversedCaption: 'Reversed tree (clairvoyance) — editable',
  reversedEditedCaption: 'Reversed tree — free comparison',
  deviationBadge: '✎ edited since Merge',
  deviationTitle:
    'The right tree has been edited manually since it was generated. VOC is now ' +
    'a free comparison between the two trees’ values, not a strict clairvoyance valuation.',
  emptyHint: 'Empty tree — click "Add node" to create a root node.',
  rename: '✎ Rename',
  renameVariable: '✎ Rename the variable',
  editOutcomes: '☰ Edit outcomes',
  makeDecision: '⇄ Make it a decision node',
  makeChance: '⇄ Make it a chance node',
  conditionalTable: '⊞ Conditional table',
  unlinkFromVariable: '⛓ Unlink from the variable',
  deleteNode: '✕ Delete node',
  deleteNodeConfirm: (what) => `${what}. Continue?`,
  deleteSubtree: (label, edge) =>
    `"${label}" and its entire subtree will be removed — the outcome "${edge}" becomes an endpoint again`,
  deleteWholeTree: 'The whole tree will be removed',
  pillLockedTable: 'Has a conditional table — fixed position, can’t be reordered.',
  pillLockedNonUniform:
    'This level isn’t a single uniform variable (e.g. an unlinked instance) — can’t be reordered.',
  cancel: 'Cancel',
  create: 'Create',
  ok: 'OK',
  close: 'Close',
  save_: 'Save',
  name: 'Name',
  type: 'Type',
  nodeChance: 'Chance node',
  nodeDecision: 'Decision node',
  nameDialogNode: 'Node name',
  nameDialogVariable: 'Variable name (affects all instances)',
  createRoot: 'Create root node',
  outcomesTitle: (node) => `Outcomes — ${node}`,
  outcomeLabelPlaceholder: 'label',
  probPlaceholder: 'p',
  addOutcome: '+ outcome',
  normalize: 'Normalize',
  pIncomplete: 'p incomplete — empty probabilities show as "–" in the tree',
  sumWarning: (sum) => `⚠ The sum is ${sum}, expected 1`,
  allOutcomesNeedLabel: 'Every outcome must have a label',
  outcomeLabelsUnique: 'Outcome labels must be unique within the node',
  syncNoteTable: (siblings) =>
    `This instance is driven by its conditional table — the probabilities below ` +
    `are only a fallback and don’t sync with the group (${siblings}). ` +
    `Remove the conditional table to sync again.`,
  syncNoteLinked: (siblings) =>
    `Linked to: ${siblings}. The outcome set and probabilities sync across the ` +
    `group. If you enter probabilities that differ from the group you’ll choose ` +
    `whether it applies to all or just this instance.`,
  divergenceTitle: 'The probabilities differ from the group',
  divergenceBody: (node, siblings) =>
    `"${node}" is linked to ${siblings}. You entered probabilities that differ ` +
    `from the group. What do you want to do?`,
  divergenceOwn: 'Just this instance (unlink)',
  divergenceGroup: 'Update the whole group',
  unlinkedOwnProbs: (node) => `"${node}" is now unlinked — its own variable with its own probabilities.`,
  unlinkedMessage: (node) => `"${node}" is now unlinked — its own variable, no longer synced.`,
  conditionalTitle: (node) => `Conditional table — ${node}`,
  noOutcomesYet: 'The node has no outcomes yet — add outcomes first.',
  conditionColumn: 'Condition',
  baseRow: '(base)',
  addCondition: '+ condition',
  noConditionsAvailable: 'No conditions available — the node has no ancestors with outcomes.',
  tableSyncNote:
    'As long as this instance has a conditional table it controls its own ' +
    'probabilities and doesn’t sync with the group. If you remove all condition ' +
    'rows it starts syncing again and adopts the group’s distribution.',
  resolvedForInstance: (path, parts) => `Applies to this instance (path: ${path}): ${parts}`,
  pathRoot: 'the root',
  terminalTitle: (node, edge) => `${node} → ${edge}`,
  payoffLabel: 'Value (payoff)',
  payoffPlaceholder: 'unset',
  utilityTransform: (text) => `Utility transform: ${text}`,
  jointLabel: 'Set joint probability (backward-fill)',
  jointPlaceholder: 'target probability (0–1]',
  addChildNode: '+ Add child node…',
  valueMustBeNumber: 'The value must be a number',
  newNodeAfter: (edge) => `New node after "${edge}"`,
  elicitTitle: 'Set risk attitude (γ)',
  elicitMethod: 'Method',
  elicitIndifference: 'Indifference question',
  elicitReference: 'Quick approximation (reference amount)',
  elicitPPlaceholder: '0 < p < 1 (p = 0.5 → risk-neutral)',
  elicitWLabel: 'Reference amount W (γ ≈ 0.96 / W)',
  elicitWPlaceholder: 'W > 0',
  elicitResult: (gamma, r, attitude) => `γ = ${gamma} · risk odds r = ${r} · ${attitude}`,
  riskAverse: 'risk-averse',
  riskNeutral: 'risk-neutral',
  riskSeeking: 'risk-seeking',
  enterValidValue: 'Enter a valid value first.',
  savedAs: (name) => `Saved as ${name}.`,
  loaded: (name) => `Loaded ${name}.`,
  couldNotReadFile: 'Could not read the file.',
  nothingToExport: 'No tree to export.',
  exported: (files) => `Exported ${files} (PNG, transparent background).`,
  couldNotExportEmpty: 'Could not export — the tree is empty.',
  vocEmptyHint: (vocLabel) =>
    `${vocLabel} = – · build a tree (Add node) to compute the value of clairvoyance`,
  vocIncomplete: (vocLabel) => `${vocLabel} = – · fill in all probabilities and outcome values`,
  vocRow: (valLabel, vocLabel, orig, rev, voc) =>
    `${valLabel} left = ${orig} · ${valLabel} right = ${rev} · ${vocLabel} = ${voc}`,
  calculation: (node, text) => `Calculation (${node}): ${text}`,
  pIncompleteShort: 'p incomplete',
  sumShort: (sum) => `Σ = ${sum} ⚠`,
  ambiguousConditions: '⚠ ambiguous conditions',
  badgeTableTip: 'Conditional table — controls its own probabilities, doesn’t sync with the group',
  badgeLinkedTip:
    'Linked instance — outcomes and probabilities sync with the same variable on other branches',
  vocHint:
    'VOC = value of clairvoyance: how much the expected value (EV) rises if you ' +
    'get to know all chance outcomes before making the decisions. The right tree ' +
    'shows the reversed decision situation VOC is based on.',
  linkedCreated: (shown, extra) =>
    `Linked instances created: ${shown}${extra > 0 ? ` (+${extra} more)` : ''}. ` +
    `Outcome set, node type and probabilities sync automatically ` +
    `(an instance with its own conditional table controls its own probabilities).`,
  linkedToVariable: (label, display) =>
    `Linked to the variable "${label}" — outcomes sync automatically across all ` +
    `instances (shown as "${display}").`,
  unsavedConfirm: 'Unsaved changes will be lost if you load a file. Continue?',
  subtreeRemoveConfirm: (edge) => `The outcome "${edge}" has a subtree that will be removed. Continue?`,
  rootExistsHint:
    'The tree already has a root — click a node to edit it, or a triangle to grow ' +
    'the tree further.',
  elicitPLabel: 'Probability p: indifferent between 0 for sure and (p: win 1 / 1−p: lose 1)',
  elicitExample: (ce100, ce10) =>
    `Example: a 50/50 gamble for 100 is worth CE = ${ce100}; for 10 → CE = ${ce10}.`,
  useGamma: 'Use γ',
}

/** The active-language dictionary. Read it fresh at each call site (so a
 * language switch followed by a re-render picks up the new strings). */
export function t(): Dict {
  return current === 'en' ? en : sv
}
