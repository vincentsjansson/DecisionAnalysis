import type { NodeType, Outcome } from '../model/tree'
import {
  branchLabel,
  detachChild,
  displayName,
  setChild,
  TreeNode,
} from '../model/tree'
import type { ConditionalRow } from '../model/tree'
import {
  addOutcomeToGroup,
  mirrorLinkedInstances,
  createLinkedNode,
  groupSiblings,
  removeOutcomeFromGroup,
  renameOutcomeInGroup,
  renameVariable,
  unlinkNode,
} from '../model/variable'
import { backwardFill } from '../model/backwardFill'
import { reverseTreeWithBayes } from '../model/bayesReversal'
import { deserializeDocument, documentFilename, documentToJson } from '../model/document'
import { certaintyEquivalent } from '../model/expectedUtility'
import { traceNode, traceTerminalUtility } from '../model/calculationTrace'
import {
  applyInverseUtility,
  applyUtility,
  defaultUtilityFunction,
  gammaFromIndifference,
  gammaFromReferenceAmount,
  riskOddsFromGamma,
  UtilityDomainError,
} from '../model/utility'
import type { UtilityFunction, UtilityType } from '../model/utility'
import { applyViewTransform, fmt, renderTree } from '../render/renderTree'
import type { DisplayMode, ViewTransform } from '../render/renderTree'

export interface AppState {
  root: TreeNode | null
  selected: TreeNode | null
  message: string
  /** Split mode: left = editable original, right = derived read-only
   * clairvoyance tree, recomputed from the left tree on every render. */
  split: boolean
  /** 'ev' = risk-neutral expected value; 'eu' = certainty equivalent under
   * `utilityFn` (risk-adjusted). */
  displayMode: DisplayMode
  utilityFn: UtilityFunction
  view: ViewTransform
  viewRight: ViewTransform
  idCounter: number
  /** True when the tree/settings changed since the last save or load — used
   * to confirm before a load would discard unsaved work. */
  dirty: boolean
}

export interface AppApi {
  createRoot(type: NodeType, label: string): TreeNode
  addOutcomeTo(node: TreeNode, label: string, probability?: number, value?: number): Outcome
  attachChild(node: TreeNode, edge: Outcome, type: NodeType, label: string): TreeNode
  toggleType(node: TreeNode): void
  renameNode(node: TreeNode, label: string): void
  unlinkVariable(node: TreeNode): void
  renameOutcomeOn(node: TreeNode, edge: Outcome, newLabel: string): void
  removeOutcomeFrom(node: TreeNode, edge: Outcome): void
  setProbability(edge: Outcome, probability: number): void
  setValue(edge: Outcome, value: number | undefined): void
  setConditionalTable(node: TreeNode, rows: ConditionalRow[]): void
  deleteNode(node: TreeNode): void
  applyBackwardFill(node: TreeNode, edge: Outcome, targetProbability: number): void
  exportDocument(): string
  loadDocument(text: string, opts?: { skipConfirm?: boolean }): boolean
  toggleSplit(): void
  setDisplayMode(mode: DisplayMode): void
  setUtilityType(type: UtilityType): void
  setUtilityParameter(parameter: number): void
  selectNode(node: TreeNode | null): void
  render(): void
}

export interface App {
  state: AppState
  api: AppApi
}

/** `confirmFn` is injectable so tests can run destructive flows headlessly. */
export function createApp(
  container: HTMLElement,
  options: { confirmFn?: (message: string) => boolean } = {},
): App {
  const confirmFn = options.confirmFn ?? ((m: string) => window.confirm(m))

  const state: AppState = {
    root: null,
    selected: null,
    message: '',
    split: false,
    displayMode: 'ev',
    // Default to exponential CARA when EU mode is first opened — a standard,
    // visibly risk-averse curve, so switching to EU actually shows CE < EV
    // rather than the linear no-op.
    utilityFn: defaultUtilityFunction('exponential'),
    view: { scale: 1, x: 0, y: 0 },
    viewRight: { scale: 1, x: 0, y: 0 },
    idCounter: 0,
    dirty: false,
  }

  // ── Static shell (built once — listeners never accumulate) ──
  container.innerHTML = ''
  container.className = 'app'

  const topbar = document.createElement('header')
  topbar.className = 'topbar'
  const title = document.createElement('span')
  title.className = 'app-title'
  title.textContent = 'DecisionAnalysis'
  const addBtn = document.createElement('button')
  addBtn.id = 'add-node'
  addBtn.textContent = 'Lägg till nod'
  const flipBtn = document.createElement('button')
  flipBtn.id = 'flip'
  flipBtn.textContent = '⇄ Flip'
  flipBtn.title =
    'Visar trädet omvänt (alla slumputfall kända innan besluten) bredvid ditt ' +
    'träd och räknar ut VOC — värdet av klarsyn. Klicka igen för att stänga.'
  const modeBtn = document.createElement('button')
  modeBtn.id = 'mode-toggle'
  const saveBtn = document.createElement('button')
  saveBtn.id = 'save'
  saveBtn.textContent = '💾 Spara'
  const loadBtn = document.createElement('button')
  loadBtn.id = 'load'
  loadBtn.textContent = '📂 Ladda'
  const fileInput = document.createElement('input')
  fileInput.type = 'file'
  fileInput.accept = 'application/json,.json'
  fileInput.style.display = 'none'
  topbar.append(title, addBtn, flipBtn, modeBtn, saveBtn, loadBtn, fileInput)

  const messageStrip = document.createElement('div')
  messageStrip.className = 'message-strip'
  messageStrip.style.display = 'none'

  // ── Utility-function config bar, shown only in EU mode ──
  const utilityBar = document.createElement('div')
  utilityBar.className = 'utility-bar'
  utilityBar.style.display = 'none'
  const utilityLabel = document.createElement('span')
  utilityLabel.textContent = 'Nyttofunktion:'
  const utilityTypeSelect = document.createElement('select')
  utilityTypeSelect.id = 'utility-type'
  for (const [value, label] of [
    ['linear', 'Linjär (riskneutral)'],
    ['exponential', 'Exponentiell'],
  ] as const) {
    const opt = document.createElement('option')
    opt.value = value
    opt.textContent = label
    utilityTypeSelect.appendChild(opt)
  }
  // γ fine-tune input (exponential only) + elicitation launcher.
  const paramLabel = document.createElement('label')
  paramLabel.className = 'utility-param'
  const paramLabelText = document.createElement('span')
  paramLabelText.textContent = 'γ'
  const paramInput = document.createElement('input')
  paramInput.id = 'utility-parameter'
  paramInput.type = 'text'
  paramInput.inputMode = 'decimal'
  paramLabel.append(paramLabelText, paramInput)
  const elicitBtn = document.createElement('button')
  elicitBtn.id = 'elicit'
  elicitBtn.textContent = 'Ställ in riskattityd…'
  const riskReadout = document.createElement('span')
  riskReadout.className = 'risk-readout'
  utilityBar.append(utilityLabel, utilityTypeSelect, paramLabel, elicitBtn, riskReadout)

  const utilityErrorEl = document.createElement('div')
  utilityErrorEl.className = 'utility-error'
  utilityErrorEl.style.display = 'none'

  const vocBar = document.createElement('div')
  vocBar.className = 'voc-bar'
  vocBar.style.display = 'none'

  // One-line, always-visible explanation of what the VOC number means, so a
  // first-time user doesn't have to know the abbreviation. Shown only in split.
  const vocHint = document.createElement('div')
  vocHint.className = 'voc-hint'
  vocHint.style.display = 'none'
  vocHint.textContent =
    'VOC = värdet av klarsyn: hur mycket det förväntade värdet (EV) ökar om du ' +
    'får veta alla slumputfall innan du fattar besluten. Höger träd visar det ' +
    'omvända beslutsläget som VOC bygger på.'

  // Calculation-trace bar: shows the arithmetic behind the selected node's
  // value. Visible only while a node is selected.
  const traceBar = document.createElement('div')
  traceBar.className = 'trace-bar'
  traceBar.style.display = 'none'

  const workspace = document.createElement('div')
  workspace.className = 'workspace'
  const canvasHost = document.createElement('div')
  canvasHost.className = 'canvas-host'

  const rightPane = document.createElement('div')
  rightPane.className = 'right-pane'
  rightPane.style.display = 'none'
  const rightCaption = document.createElement('div')
  rightCaption.className = 'pane-caption'
  rightCaption.textContent = 'Omvänt träd (klarsyn) — skrivskyddat'
  const rightHost = document.createElement('div')
  rightHost.className = 'canvas-host canvas-right'
  const flipErrorEl = document.createElement('div')
  flipErrorEl.className = 'flip-error'
  flipErrorEl.style.display = 'none'
  rightPane.append(rightCaption, rightHost, flipErrorEl)

  workspace.append(canvasHost, rightPane)

  const menuLayer = document.createElement('div')
  menuLayer.className = 'menu-layer'

  const dialogLayer = document.createElement('div')
  dialogLayer.className = 'dialog-layer'

  container.append(
    topbar,
    messageStrip,
    utilityBar,
    utilityErrorEl,
    vocBar,
    vocHint,
    traceBar,
    workspace,
    menuLayer,
    dialogLayer,
  )

  let svg: SVGSVGElement | null = null
  let svgRight: SVGSVGElement | null = null

  // ── Zoom & pan, scoped to each canvas only. The view object is mutated
  //    in place so both hosts keep a stable reference across renders. ──
  const wireNav = (
    host: HTMLElement,
    view: ViewTransform,
    getSvg: () => SVGSVGElement | null,
  ): void => {
    host.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
        const newScale = Math.min(3, Math.max(0.2, view.scale * factor))
        const rect = host.getBoundingClientRect()
        const mx = e.clientX - rect.left
        const my = e.clientY - rect.top
        view.x = mx - ((mx - view.x) / view.scale) * newScale
        view.y = my - ((my - view.y) / view.scale) * newScale
        view.scale = newScale
        const s = getSvg()
        if (s) applyViewTransform(s, view)
      },
      { passive: false },
    )

    let panStart: { mx: number; my: number; vx: number; vy: number } | null = null
    host.addEventListener('pointerdown', (e) => {
      if ((e.target as Element).closest('g.node, g.leaf')) return
      panStart = { mx: e.clientX, my: e.clientY, vx: view.x, vy: view.y }
    })
    host.addEventListener('pointermove', (e) => {
      if (!panStart) return
      view.x = panStart.vx + e.clientX - panStart.mx
      view.y = panStart.vy + e.clientY - panStart.my
      const s = getSvg()
      if (s) applyViewTransform(s, view)
    })
    host.addEventListener('pointerup', () => {
      panStart = null
    })
    host.addEventListener('dblclick', (e) => {
      if ((e.target as Element).closest('g.node, g.leaf')) return
      view.scale = 1
      view.x = 0
      view.y = 0
      const s = getSvg()
      if (s) applyViewTransform(s, view)
    })
  }
  wireNav(canvasHost, state.view, () => svg)
  wireNav(rightHost, state.viewRight, () => svgRight)

  const nextId = (): string => `n${++state.idCounter}`

  const setMessage = (text: string): void => {
    state.message = text
    messageStrip.textContent = text
    messageStrip.style.display = text ? '' : 'none'
  }

  const markDirty = (): void => {
    state.dirty = true
  }

  const guarded = (fn: () => void): void => {
    try {
      fn()
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e))
    }
  }

  const incomingEdge = (node: TreeNode): { parent: TreeNode; edge: Outcome } | null => {
    if (!node.parent) return null
    const edge = node.parent.outcomes.find((o) => o.child === node)
    return edge ? { parent: node.parent, edge } : null
  }

  /** History token set for the path root -> `node` (the outcome labels taken
   * to reach it), so conditional probabilities resolve correctly for the
   * node's calculation trace. */
  const historyFor = (node: TreeNode): Set<string> => {
    const tokens: string[] = []
    let current = node
    for (let inc = incomingEdge(current); inc; inc = incomingEdge(current)) {
      tokens.push(branchLabel(inc.parent, inc.edge.label))
      current = inc.parent
    }
    return new Set(tokens)
  }

  const nodeById = (id: string): TreeNode | null => {
    const walk = (n: TreeNode): TreeNode | null => {
      if (n.id === id) return n
      for (const o of n.outcomes) {
        if (o.child) {
          const found = walk(o.child)
          if (found) return found
        }
      }
      return null
    }
    return state.root ? walk(state.root) : null
  }

  /** Display form of a condition token "nodeId:label" -> "NodLabel = label". */
  const tokenDisplay = (token: string): string => {
    const sep = token.indexOf(':')
    const id = token.slice(0, sep)
    const label = token.slice(sep + 1)
    const node = nodeById(id)
    return `${node ? node.label : id} = ${label}`
  }

  /** All condition tokens available to `node`: every outcome of every
   * ancestor (all outcomes, not just the taken path — matches legacy). */
  const availableTokens = (node: TreeNode): string[] => {
    const tokens: string[] = []
    for (let a = node.parent; a !== null; a = a.parent) {
      for (const o of a.outcomes) tokens.push(branchLabel(a, o.label))
    }
    return tokens
  }

  // ── API — every mutation goes through the model layer ──
  const api: AppApi = {
    createRoot(type, label) {
      const node = new TreeNode(nextId(), type, label)
      state.root = node
      state.selected = node
      setMessage('')
      markDirty()
      render()
      return node
    },

    addOutcomeTo(node, label, probability = NaN, value?) {
      const edge = state.root
        ? addOutcomeToGroup(state.root, node, label, probability, value)
        : addOutcomeToGroup(node, node, label, probability, value)
      markDirty()
      render()
      return edge
    },

    attachChild(node, edge, type, label) {
      const child = createLinkedNode(state.root, nextId(), type, label)
      setChild(node, edge, child)
      state.selected = child
      markDirty()
      // Proactively grow the same variable across the whole grid of positions
      // that should hold it: the parent's other terminal outcomes AND — when
      // the parent itself is a linked instance — the corresponding outcomes on
      // its sibling instances, all joining one linked group. Only under chance
      // parents: a chance variable recurs across its contexts, whereas decision
      // alternatives are deliberately asymmetric (act vs. don't act), so
      // auto-filling them would fight the classic decision-tree shape.
      const autoFilled =
        state.root && node.nodeType === 'chance'
          ? mirrorLinkedInstances(state.root, node, child, nextId)
          : []
      if (autoFilled.length > 0) {
        const shown = [child, ...autoFilled].slice(0, 6).map((n) => `"${displayName(n)}"`).join(', ')
        const more = autoFilled.length + 1 > 6 ? ` (+${autoFilled.length + 1 - 6} till)` : ''
        setMessage(
          `Länkade instanser skapade: ${shown}${more}. ` +
            `Utfallsuppsättningen och nodtypen synkas automatiskt; sannolikheter är egna per instans.`,
        )
      } else if (child.instanceIndex > 0) {
        setMessage(
          `Länkad till variabeln "${child.label}" — utfall synkas automatiskt ` +
            `mellan alla instanser (visas som "${displayName(child)}").`,
        )
      }
      render()
      return child
    },

    toggleType(node) {
      node.nodeType = node.nodeType === 'chance' ? 'decision' : 'chance'
      markDirty()
      render()
    },

    renameNode(node, label) {
      if (!state.root) return
      // Renaming propagates to the whole variable group (locked decision A).
      renameVariable(state.root, node, label)
      markDirty()
      render()
    },

    unlinkVariable(node) {
      if (!state.root) return
      unlinkNode(state.root, node)
      setMessage(`"${displayName(node)}" är nu frikopplad — egen variabel, synkas inte längre.`)
      markDirty()
      render()
    },

    renameOutcomeOn(node, edge, newLabel) {
      if (!state.root) return
      renameOutcomeInGroup(state.root, node, edge, newLabel)
      markDirty()
      render()
    },

    removeOutcomeFrom(node, edge) {
      if (state.root) removeOutcomeFromGroup(state.root, node, edge)
      markDirty()
      render()
    },

    setProbability(edge, probability) {
      edge.probability = probability
      markDirty()
      render()
    },

    setValue(edge, value) {
      edge.value = value
      markDirty()
      render()
    },

    setConditionalTable(node, rows) {
      node.conditionalTable = rows
      markDirty()
      render()
    },

    deleteNode(node) {
      const inc = incomingEdge(node)
      if (!inc) {
        state.root = null
      } else {
        detachChild(inc.edge)
      }
      if (state.selected === node) state.selected = null
      markDirty()
      render()
    },

    applyBackwardFill(node, edge, targetProbability) {
      if (!state.root) return
      const result = backwardFill(state.root, node, edge, targetProbability)
      const parts = result.siblings.map(
        (s) => `${s.edge.label}: ${fmt(s.oldProbability)} → ${fmt(s.newProbability)}`,
      )
      setMessage(
        `Justerade P(${displayName(result.node)} → ${result.edge.label}): ` +
          `${fmt(result.oldProbability)} → ${fmt(result.newProbability)}` +
          (parts.length > 0 ? ` · syskon omskalade: ${parts.join(', ')}` : ''),
      )
      markDirty()
      render()
    },

    exportDocument() {
      const json = documentToJson({
        tree: state.root,
        displayMode: state.displayMode,
        utility: state.utilityFn,
        idCounter: state.idCounter,
      })
      state.dirty = false // a successful save clears the unsaved-changes flag
      return json
    },

    loadDocument(text, opts) {
      // Validate first, so a broken file never triggers a discard prompt.
      const doc = deserializeDocument(text)
      if (!opts?.skipConfirm && state.root && state.dirty) {
        if (!confirmFn('Osparade ändringar går förlorade om du laddar en fil. Fortsätt?')) {
          return false
        }
      }
      state.root = doc.tree
      state.displayMode = doc.displayMode
      state.utilityFn = doc.utility
      state.idCounter = doc.idCounter
      state.selected = null
      state.split = false
      state.dirty = false
      render()
      return true
    },

    toggleSplit() {
      state.split = !state.split
      state.viewRight.scale = 1
      state.viewRight.x = 0
      state.viewRight.y = 0
      render()
    },

    setDisplayMode(mode) {
      state.displayMode = mode
      markDirty()
      render()
    },

    setUtilityType(type) {
      // Switching type resets the parameter to that type's sensible default;
      // the user can fine-tune afterward.
      state.utilityFn = defaultUtilityFunction(type)
      markDirty()
      render()
    },

    setUtilityParameter(parameter) {
      state.utilityFn = { ...state.utilityFn, parameter }
      markDirty()
      render()
    },

    selectNode(node) {
      state.selected = node
      render()
    },

    render,
  }

  // ── Context menu ──
  const closeMenu = (): void => {
    menuLayer.replaceChildren()
  }

  const menuItem = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'menu-item'
    b.textContent = label
    b.addEventListener('click', () => {
      closeMenu()
      onClick()
    })
    return b
  }

  const openNodeMenu = (node: TreeNode, x: number, y: number): void => {
    closeMenu()
    const menu = document.createElement('div')
    menu.className = 'menu'
    const rect = container.getBoundingClientRect()
    menu.style.left = `${x - rect.left}px`
    menu.style.top = `${y - rect.top}px`

    const linked = state.root ? groupSiblings(state.root, node).length > 0 : false

    menu.append(
      menuItem(
        linked ? '✎ Byt namn på variabeln' : '✎ Byt namn',
        () =>
          openNameDialog(
            linked ? 'Variabelns namn (påverkar alla instanser)' : 'Nodens namn',
            node.label,
            (v) => guarded(() => api.renameNode(node, v)),
          ),
      ),
      menuItem('☰ Redigera utfall', () => openOutcomesDialog(node)),
      menuItem(
        node.nodeType === 'chance' ? '⇄ Gör till beslutsnod' : '⇄ Gör till slumpnod',
        () => guarded(() => api.toggleType(node)),
      ),
    )
    if (node.nodeType === 'chance') {
      menu.append(menuItem('⊞ Villkorstabell', () => openConditionalDialog(node)))
    }
    if (linked) {
      menu.append(
        menuItem('⛓ Koppla loss från variabeln', () => guarded(() => api.unlinkVariable(node))),
      )
    }
    menu.append(
      menuItem('✕ Ta bort nod', () => {
        const inc = incomingEdge(node)
        const what = inc
          ? `"${displayName(node)}" och hela dess delträd tas bort — utfallet "${inc.edge.label}" blir en slutpunkt igen`
          : `Hela trädet tas bort`
        if (confirmFn(`${what}. Fortsätt?`)) guarded(() => api.deleteNode(node))
      }),
    )

    menuLayer.appendChild(menu)
  }

  container.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('.menu')) closeMenu()
  })

  // ── Dialogs ──
  const closeDialog = (): void => {
    dialogLayer.replaceChildren()
  }

  const openDialog = (titleText: string): { body: HTMLElement; footer: HTMLElement } => {
    closeDialog()
    const overlay = document.createElement('div')
    overlay.className = 'dialog-overlay'
    const dialog = document.createElement('div')
    dialog.className = 'dialog'
    const h = document.createElement('h2')
    h.textContent = titleText
    const body = document.createElement('div')
    body.className = 'dialog-body'
    const footer = document.createElement('div')
    footer.className = 'dialog-footer'
    dialog.append(h, body, footer)
    overlay.appendChild(dialog)
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeDialog()
    })
    dialogLayer.appendChild(overlay)
    return { body, footer }
  }

  const dialogButton = (label: string, onClick: () => void, primary = false): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    if (primary) b.className = 'primary'
    b.addEventListener('click', onClick)
    return b
  }

  const fieldRow = (labelText: string, input: HTMLElement): HTMLElement => {
    const wrap = document.createElement('label')
    wrap.className = 'field'
    const span = document.createElement('span')
    span.textContent = labelText
    wrap.append(span, input)
    return wrap
  }

  const textInput = (value: string): HTMLInputElement => {
    const input = document.createElement('input')
    input.type = 'text'
    input.value = value
    return input
  }

  const parseNum = (raw: string): number => parseFloat(raw.trim().replace(',', '.'))

  const openNameDialog = (
    titleText: string,
    initial: string,
    onOk: (value: string) => void,
  ): void => {
    const { body, footer } = openDialog(titleText)
    const input = textInput(initial)
    body.appendChild(fieldRow('Namn', input))
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && input.value.trim()) {
        closeDialog()
        onOk(input.value.trim())
      }
    })
    footer.append(
      dialogButton('Avbryt', closeDialog),
      dialogButton(
        'OK',
        () => {
          if (!input.value.trim()) return
          closeDialog()
          onOk(input.value.trim())
        },
        true,
      ),
    )
    input.focus()
  }

  const openCreateRootDialog = (): void => {
    const { body, footer } = openDialog('Skapa rotnod')
    const select = document.createElement('select')
    for (const [value, text] of [
      ['chance', 'Slumpnod'],
      ['decision', 'Beslutsnod'],
    ] as const) {
      const opt = document.createElement('option')
      opt.value = value
      opt.textContent = text
      select.appendChild(opt)
    }
    const labelInput = textInput('')
    body.append(fieldRow('Typ', select), fieldRow('Namn', labelInput))
    footer.append(
      dialogButton('Avbryt', closeDialog),
      dialogButton(
        'Skapa',
        () => {
          const label = labelInput.value.trim()
          if (!label) return
          closeDialog()
          guarded(() => api.createRoot(select.value as NodeType, label))
        },
        true,
      ),
    )
    labelInput.focus()
  }

  /** Legacy-style outcome editor: rows of label (+ probability for chance
   * nodes), explicit Normalisera button — never silent normalization. */
  const openOutcomesDialog = (node: TreeNode): void => {
    const isChance = node.nodeType === 'chance'
    const { body, footer } = openDialog(`Utfall — ${displayName(node)}`)

    // Warn that outcome edits propagate to the variable's other instances.
    const siblings = state.root ? groupSiblings(state.root, node) : []
    if (siblings.length > 0) {
      const note = document.createElement('p')
      note.className = 'sync-note'
      note.textContent =
        `Detta påverkar även: ${siblings.map((n) => displayName(n)).join(', ')} ` +
        `(utfallsuppsättningen synkas; sannolikheter är egna per instans).`
      body.appendChild(note)
    }

    interface Row {
      edge: Outcome | null
      labelInput: HTMLInputElement
      probInput: HTMLInputElement | null
      removed: boolean
      el: HTMLElement
    }
    const rows: Row[] = []
    const rowsHost = document.createElement('div')
    const warning = document.createElement('p')
    warning.className = 'dialog-warning'
    warning.style.display = 'none'

    const updateWarning = (): void => {
      if (!isChance) return
      let sum = 0
      let anyNaN = false
      for (const r of rows) {
        if (r.removed || !r.probInput) continue
        const v = parseNum(r.probInput.value)
        if (Number.isNaN(v)) anyNaN = true
        else sum += v
      }
      const active = rows.filter((r) => !r.removed)
      if (active.length === 0) {
        warning.style.display = 'none'
        return
      }
      if (anyNaN) {
        warning.textContent = 'p ofullständig — tomma sannolikheter visas som "–" i trädet'
        warning.style.display = ''
      } else if (Math.abs(sum - 1) > 1e-6) {
        warning.textContent = `⚠ Summan är ${fmt(sum)}, förväntat 1`
        warning.style.display = ''
      } else {
        warning.style.display = 'none'
      }
    }

    const addRow = (edge: Outcome | null): void => {
      const el = document.createElement('div')
      el.className = 'dialog-row'
      const labelInput = textInput(edge ? edge.label : '')
      labelInput.placeholder = 'etikett'
      let probInput: HTMLInputElement | null = null
      el.appendChild(labelInput)
      if (isChance) {
        probInput = textInput(edge && Number.isFinite(edge.probability) ? String(edge.probability) : '')
        probInput.placeholder = 'p'
        probInput.className = 'prob'
        probInput.addEventListener('input', updateWarning)
        el.appendChild(probInput)
      }
      const row: Row = { edge, labelInput, probInput, removed: false, el }
      el.appendChild(
        dialogButton('✕', () => {
          if (edge?.child && !confirmFn(`Utfallet "${edge.label}" har ett delträd som tas bort. Fortsätt?`)) {
            return
          }
          row.removed = true
          el.remove()
          updateWarning()
        }),
      )
      rows.push(row)
      rowsHost.appendChild(el)
    }

    for (const edge of node.outcomes) addRow(edge)
    body.append(rowsHost, warning)

    const actions = document.createElement('div')
    actions.className = 'dialog-actions'
    actions.appendChild(dialogButton('+ utfall', () => addRow(null)))
    if (isChance) {
      actions.appendChild(
        dialogButton('Normalisera', () => {
          const active = rows.filter((r) => !r.removed && r.probInput)
          const vals = active.map((r) => parseNum(r.probInput!.value))
          if (vals.some((v) => Number.isNaN(v))) {
            const even = 1 / active.length
            for (const r of active) r.probInput!.value = String(parseFloat(even.toPrecision(6)))
          } else {
            const sum = vals.reduce((s, v) => s + v, 0)
            if (sum <= 0) return
            active.forEach((r, i) => {
              r.probInput!.value = String(parseFloat((vals[i] / sum).toPrecision(6)))
            })
          }
          updateWarning()
        }),
      )
    }
    body.appendChild(actions)
    updateWarning()

    footer.append(
      dialogButton('Avbryt', closeDialog),
      dialogButton(
        'Spara',
        () =>
          guarded(() => {
            const active = rows.filter((r) => !r.removed)
            const labels = active.map((r) => r.labelInput.value.trim())
            if (labels.some((l) => !l)) throw new Error('Alla utfall måste ha en etikett')
            if (new Set(labels).size !== labels.length) {
              throw new Error('Utfallsetiketter måste vara unika inom noden')
            }

            // All edits route through the group-aware model functions so the
            // outcome set stays synced across every linked instance (labels
            // only — probabilities remain per-instance).
            const root = state.root ?? node
            for (const r of rows) {
              if (r.removed && r.edge) removeOutcomeFromGroup(root, node, r.edge)
            }
            for (const r of active) {
              const label = r.labelInput.value.trim()
              const prob = r.probInput ? parseNum(r.probInput.value) : NaN
              if (r.edge) {
                if (r.edge.label !== label) {
                  renameOutcomeInGroup(root, node, r.edge, label)
                }
                r.edge.probability = prob
              } else {
                addOutcomeToGroup(root, node, label, prob)
              }
            }
            markDirty()
            closeDialog()
            render()
          }),
        true,
      ),
    )
  }

  /** Legacy-style conditional matrix: rows = conditions, columns = the
   * node's outcomes. The base row edits the outcomes' base probabilities. */
  const openConditionalDialog = (node: TreeNode): void => {
    const { body, footer } = openDialog(`Villkorstabell — ${displayName(node)}`)
    const outcomeLabels = node.outcomes.map((o) => o.label)
    if (outcomeLabels.length === 0) {
      body.textContent = 'Noden har inga utfall än — lägg till utfall först.'
      footer.appendChild(dialogButton('Stäng', closeDialog, true))
      return
    }

    const table = document.createElement('table')
    table.className = 'matrix'
    const thead = document.createElement('thead')
    const headRow = document.createElement('tr')
    headRow.appendChild(document.createElement('th')).textContent = 'Villkor'
    for (const label of outcomeLabels) {
      headRow.appendChild(document.createElement('th')).textContent = label
    }
    headRow.appendChild(document.createElement('th'))
    thead.appendChild(headRow)
    table.appendChild(thead)
    const tbody = document.createElement('tbody')
    table.appendChild(tbody)

    interface MatrixRow {
      condition: Set<string> | null // null = base row
      inputs: HTMLInputElement[]
      removed: boolean
      el: HTMLTableRowElement
    }
    const matrixRows: MatrixRow[] = []

    const addMatrixRow = (condition: Set<string> | null, values: (number | undefined)[]): void => {
      const tr = document.createElement('tr')
      const condCell = document.createElement('td')
      condCell.textContent = condition
        ? [...condition].map(tokenDisplay).join(' & ')
        : '(bas)'
      if (!condition) condCell.className = 'base'
      tr.appendChild(condCell)

      const inputs: HTMLInputElement[] = []
      for (const v of values) {
        const td = document.createElement('td')
        const input = textInput(v !== undefined && Number.isFinite(v) ? String(v) : '')
        input.className = 'prob'
        inputs.push(input)
        td.appendChild(input)
        tr.appendChild(td)
      }

      const row: MatrixRow = { condition, inputs, removed: false, el: tr }
      const actionCell = document.createElement('td')
      if (condition) {
        actionCell.appendChild(
          dialogButton('✕', () => {
            row.removed = true
            tr.remove()
          }),
        )
      }
      tr.appendChild(actionCell)
      matrixRows.push(row)
      tbody.appendChild(tr)
    }

    addMatrixRow(null, node.outcomes.map((o) => o.probability))
    for (const row of node.conditionalTable) {
      addMatrixRow(new Set(row.condition), outcomeLabels.map((l) => row.probabilities[l]))
    }

    body.appendChild(table)

    // Add-condition picker: one ancestor-outcome token per new row.
    const tokens = availableTokens(node)
    const picker = document.createElement('select')
    for (const token of tokens) {
      const opt = document.createElement('option')
      opt.value = token
      opt.textContent = tokenDisplay(token)
      picker.appendChild(opt)
    }
    const pickerRow = document.createElement('div')
    pickerRow.className = 'dialog-actions'
    pickerRow.append(
      picker,
      dialogButton('+ villkor', () => {
        if (!picker.value) return
        addMatrixRow(new Set([picker.value]), outcomeLabels.map(() => undefined))
      }),
    )
    if (tokens.length === 0) {
      const hint = document.createElement('p')
      hint.className = 'hint'
      hint.textContent = 'Inga villkor tillgängliga — noden har inga förfäder med utfall.'
      body.appendChild(hint)
    } else {
      body.appendChild(pickerRow)
    }

    footer.append(
      dialogButton('Avbryt', closeDialog),
      dialogButton(
        'Spara',
        () =>
          guarded(() => {
            const base = matrixRows[0]
            node.outcomes.forEach((o, i) => {
              o.probability = parseNum(base.inputs[i].value)
            })
            const rows: ConditionalRow[] = []
            for (const row of matrixRows.slice(1)) {
              if (row.removed || !row.condition) continue
              const probabilities: Record<string, number> = {}
              outcomeLabels.forEach((label, i) => {
                const v = parseNum(row.inputs[i].value)
                if (!Number.isNaN(v)) probabilities[label] = v
              })
              rows.push({ condition: row.condition, probabilities })
            }
            api.setConditionalTable(node, rows)
            closeDialog()
          }),
        true,
      ),
    )
  }

  /** Terminal-outcome dialog: payoff + target joint probability (changed
   * fields only, like legacy), plus attaching a child node to grow the tree. */
  const openTerminalDialog = (node: TreeNode, edge: Outcome): void => {
    const { body, footer } = openDialog(`${displayName(node)} → ${edge.label}`)

    const valueInput = textInput(edge.value !== undefined ? String(edge.value) : '')
    valueInput.placeholder = 'osatt'
    const initialValue = valueInput.value
    body.appendChild(fieldRow('Värde (payoff)', valueInput))

    // In EU mode, show the utility transform happening at this terminal.
    if (state.displayMode === 'eu') {
      const uTrace = traceTerminalUtility(edge.value, state.utilityFn)
      const uLine = document.createElement('p')
      uLine.className = 'trace-line'
      uLine.textContent = `Nyttotransform: ${uTrace.text}`
      body.appendChild(uLine)
    }

    const jointInput = textInput('')
    jointInput.placeholder = 'mål-sannolikhet (0–1]'
    body.appendChild(fieldRow('Sätt joint probability (backward-fill)', jointInput))

    const grow = document.createElement('div')
    grow.className = 'dialog-actions'
    grow.appendChild(
      dialogButton('+ Lägg till barnnod…', () => {
        closeDialog()
        openAttachChildDialog(node, edge)
      }),
    )
    body.appendChild(grow)

    footer.append(
      dialogButton('Avbryt', closeDialog),
      dialogButton(
        'OK',
        () =>
          guarded(() => {
            if (valueInput.value !== initialValue) {
              const raw = valueInput.value.trim()
              if (raw === '') {
                api.setValue(edge, undefined)
              } else {
                const v = parseNum(raw)
                if (Number.isNaN(v)) throw new Error('Värdet måste vara ett tal')
                api.setValue(edge, v)
              }
            }
            const jointRaw = jointInput.value.trim()
            closeDialog()
            if (jointRaw !== '') {
              api.applyBackwardFill(node, edge, parseNum(jointRaw))
            }
          }),
        true,
      ),
    )
    valueInput.focus()
  }

  const openAttachChildDialog = (node: TreeNode, edge: Outcome): void => {
    const { body, footer } = openDialog(`Ny nod efter "${edge.label}"`)
    const select = document.createElement('select')
    for (const [value, text] of [
      ['chance', 'Slumpnod'],
      ['decision', 'Beslutsnod'],
    ] as const) {
      const opt = document.createElement('option')
      opt.value = value
      opt.textContent = text
      select.appendChild(opt)
    }
    const labelInput = textInput('')
    body.append(fieldRow('Typ', select), fieldRow('Namn', labelInput))
    footer.append(
      dialogButton('Avbryt', closeDialog),
      dialogButton(
        'Skapa',
        () => {
          const label = labelInput.value.trim()
          if (!label) return
          closeDialog()
          guarded(() => api.attachChild(node, edge, select.value as NodeType, label))
        },
        true,
      ),
    )
    labelInput.focus()
  }

  addBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    if (state.root === null) {
      openCreateRootDialog()
    } else {
      setMessage(
        'Trädet har redan en rot — klicka på en nod för att redigera, eller på en triangel för att bygga vidare.',
      )
    }
  })

  flipBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    api.toggleSplit()
  })

  // ── Save / load ──
  saveBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    const json = api.exportDocument()
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = documentFilename(state.root)
    a.click()
    URL.revokeObjectURL(url)
    setMessage(`Sparat som ${a.download}.`)
  })

  loadBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    fileInput.click()
  })

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0]
    if (!file) return
    void file
      .text()
      .then((text) => {
        fileInput.value = '' // let the same file be picked again later
        guarded(() => {
          if (api.loadDocument(text)) setMessage(`Laddade ${file.name}.`)
        })
      })
      .catch(() => {
        fileInput.value = ''
        setMessage('Kunde inte läsa filen.')
      })
  })

  // ── Display-mode toggle + utility config wiring ──
  modeBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    api.setDisplayMode(state.displayMode === 'ev' ? 'eu' : 'ev')
  })

  utilityTypeSelect.addEventListener('change', () => {
    api.setUtilityType(utilityTypeSelect.value as UtilityType)
  })

  paramInput.addEventListener('change', () => {
    const gamma = parseNum(paramInput.value)
    if (Number.isFinite(gamma)) api.setUtilityParameter(gamma)
  })

  elicitBtn.addEventListener('click', (e) => {
    e.stopPropagation()
    openElicitationDialog()
  })

  /** γ elicitation: choose a method (direct indifference question, or the
   * quick reference-amount approximation), answer it, see the resulting γ and
   * risk odds r plus example certainty equivalents, then apply. */
  const openElicitationDialog = (): void => {
    const { body, footer } = openDialog('Ställ in riskattityd (γ)')

    const method = document.createElement('select')
    for (const [value, label] of [
      ['indifference', 'Indifferens-fråga'],
      ['reference', 'Snabb approximation (referensbelopp)'],
    ] as const) {
      const opt = document.createElement('option')
      opt.value = value
      opt.textContent = label
      method.appendChild(opt)
    }
    body.appendChild(fieldRow('Metod', method))

    // Method 1 — indifference probability p.
    const pField = fieldRow(
      'Sannolikhet p: indifferent mellan 0 säkert och (p: vinn 1 / 1−p: förlora 1)',
      textInput(''),
    )
    const pInput = pField.querySelector('input') as HTMLInputElement
    pInput.placeholder = '0 < p < 1 (p = 0.5 → riskneutral)'

    // Method 2 — reference amount W.
    const wField = fieldRow('Referensbelopp W (γ ≈ 0.96 / W)', textInput(''))
    const wInput = wField.querySelector('input') as HTMLInputElement
    wInput.placeholder = 'W > 0'

    body.append(pField, wField)

    const result = document.createElement('p')
    result.className = 'elicit-result'
    body.appendChild(result)

    const preview = document.createElement('p')
    preview.className = 'elicit-preview'
    body.appendChild(preview)

    let computedGamma = state.utilityFn.parameter

    const exampleCe = (gamma: number, win: number): number => {
      const fn: UtilityFunction = { type: 'exponential', parameter: gamma }
      try {
        return applyInverseUtility(
          0.5 * applyUtility(win, fn) + 0.5 * applyUtility(0, fn),
          fn,
        )
      } catch {
        return NaN
      }
    }

    const recompute = (): void => {
      try {
        if (method.value === 'indifference') {
          computedGamma = gammaFromIndifference(parseNum(pInput.value))
        } else {
          computedGamma = gammaFromReferenceAmount(parseNum(wInput.value))
        }
        const r = riskOddsFromGamma(computedGamma)
        const attitude =
          computedGamma > 1e-9 ? 'riskavert' : computedGamma < -1e-9 ? 'risksökande' : 'riskneutral'
        result.textContent = `γ = ${fmt(computedGamma)} · riskodds r = ${fmt(r)} · ${attitude}`
        preview.textContent =
          `Exempel: en 50/50-chansning om 100 är värd CE = ${fmt(exampleCe(computedGamma, 100))}; ` +
          `om 10 → CE = ${fmt(exampleCe(computedGamma, 10))}.`
      } catch (err) {
        result.textContent = err instanceof Error ? err.message : String(err)
        preview.textContent = ''
      }
    }

    const syncMethod = (): void => {
      pField.style.display = method.value === 'indifference' ? '' : 'none'
      wField.style.display = method.value === 'reference' ? '' : 'none'
      recompute()
    }
    method.addEventListener('change', syncMethod)
    pInput.addEventListener('input', recompute)
    wInput.addEventListener('input', recompute)
    syncMethod()

    footer.append(
      dialogButton('Avbryt', closeDialog),
      dialogButton(
        'Använd γ',
        () =>
          guarded(() => {
            if (!Number.isFinite(computedGamma)) {
              throw new Error('Ange ett giltigt värde först.')
            }
            // Elicitation always produces an exponential utility.
            state.utilityFn = { type: 'exponential', parameter: computedGamma }
            markDirty()
            closeDialog()
            render()
          }),
        true,
      ),
    )
  }

  /** Reflects display-mode/utility state into the top-bar controls. Built
   * once, updated every render — no listener churn. */
  const syncModeControls = (): void => {
    modeBtn.textContent = state.displayMode === 'eu' ? 'Läge: EU/CE' : 'Läge: EV'
    utilityBar.style.display = state.displayMode === 'eu' ? '' : 'none'
    if (state.displayMode !== 'eu') {
      utilityErrorEl.style.display = 'none'
      return
    }
    utilityTypeSelect.value = state.utilityFn.type
    const isExp = state.utilityFn.type === 'exponential'
    paramLabel.style.display = isExp ? '' : 'none'
    elicitBtn.style.display = isExp ? '' : 'none'
    if (isExp) {
      if (document.activeElement !== paramInput) {
        paramInput.value = String(parseFloat(state.utilityFn.parameter.toPrecision(6)))
      }
      const r = riskOddsFromGamma(state.utilityFn.parameter)
      riskReadout.textContent = `(riskodds r = ${fmt(r)})`
    } else {
      riskReadout.textContent = ''
    }

    // Surface a utility-domain error naming the cause, without crashing render.
    if (state.root) {
      try {
        certaintyEquivalent(state.root, state.utilityFn)
        utilityErrorEl.style.display = 'none'
      } catch (e) {
        if (e instanceof UtilityDomainError) {
          utilityErrorEl.textContent = e.message
          utilityErrorEl.style.display = ''
        } else {
          utilityErrorEl.style.display = 'none'
        }
      }
    } else {
      utilityErrorEl.style.display = 'none'
    }
  }

  /** The right pane is always derived: recomputed from the left tree on
   * every render, so edits on the left re-flip automatically. Flip errors
   * (unflippable structure) are shown verbatim — the user needs to know
   * exactly which variables/paths conflict. */
  const renderRightPane = (): void => {
    flipBtn.textContent = state.split ? '⇄ Sammanfoga' : '⇄ Flip'
    rightPane.style.display = state.split ? '' : 'none'
    vocBar.style.display = state.split ? '' : 'none'
    vocHint.style.display = state.split ? '' : 'none'
    if (!state.split) {
      rightHost.replaceChildren()
      svgRight = null
      return
    }

    if (!state.root) {
      rightHost.replaceChildren()
      svgRight = null
      flipErrorEl.style.display = 'none'
      vocBar.textContent = 'VOC = – · bygg ett träd (Lägg till nod) för att räkna ut klarsynens värde'
      return
    }

    try {
      const result = reverseTreeWithBayes(state.root)
      svgRight = renderTree(rightHost, result.flipped, {
        view: state.viewRight,
        displayMode: state.displayMode,
        utilityFn: state.utilityFn,
      })
      flipErrorEl.style.display = 'none'

      if (state.displayMode === 'eu') {
        // VOC on certainty equivalents: perfect information can't lower EU, and
        // u⁻¹ is increasing, so CE_flipped ≥ CE_original holds — same VOC ≥ 0
        // property as EV mode.
        try {
          const ceOrig = certaintyEquivalent(state.root, state.utilityFn)
          const ceFlip = certaintyEquivalent(result.flipped, state.utilityFn)
          vocBar.textContent =
            `CE original = ${fmt(ceOrig)} · ` +
            `CE omvänt (klarsyn) = ${fmt(ceFlip)} · ` +
            `VOC (CE) = ${fmt(ceFlip - ceOrig)}`
        } catch (err) {
          if (err instanceof UtilityDomainError) {
            vocBar.textContent = 'VOC (CE) = –'
            utilityErrorEl.textContent = err.message
            utilityErrorEl.style.display = ''
          } else {
            // Incomplete tree (missing probabilities/payoffs): fail loud with a
            // reason rather than showing a bare "–".
            vocBar.textContent =
              'VOC (CE) = – · fyll i alla sannolikheter och utfallsvärden först'
          }
        }
      } else if (!Number.isFinite(result.originalEv) || !Number.isFinite(result.flippedEv)) {
        // Structure flips fine but some probability/payoff is still blank, so
        // the EVs are NaN. Say why instead of showing a silent "VOC = –".
        vocBar.textContent =
          'VOC = – · fyll i alla sannolikheter och utfallsvärden för att räkna ut klarsynens värde'
      } else {
        vocBar.textContent =
          `EV original = ${fmt(result.originalEv)} · ` +
          `EV omvänt (klarsyn) = ${fmt(result.flippedEv)} · ` +
          `VOC = ${fmt(result.voc)}`
      }
    } catch (e) {
      rightHost.replaceChildren()
      svgRight = null
      flipErrorEl.textContent = e instanceof Error ? e.message : String(e)
      flipErrorEl.style.display = ''
      vocBar.textContent = state.displayMode === 'eu' ? 'VOC (CE) = –' : 'VOC = –'
    }
  }

  /** Shows the arithmetic behind the selected node's value, live and
   * mode-aware. Hidden when nothing is selected. */
  const updateTraceBar = (): void => {
    if (!state.selected) {
      traceBar.style.display = 'none'
      return
    }
    const node = state.selected
    const trace = traceNode(node, historyFor(node), state.displayMode, state.utilityFn)
    traceBar.textContent = `Beräkning (${displayName(node)}): ${trace.text}`
    traceBar.style.display = ''
  }

  function render(): void {
    svg = renderTree(canvasHost, state.root, {
      selected: state.selected,
      view: state.view,
      displayMode: state.displayMode,
      utilityFn: state.utilityFn,
      onNodeClick: (node, e) => {
        api.selectNode(node)
        openNodeMenu(node, e.clientX, e.clientY)
      },
      onLeafClick: (node, edge) => {
        openTerminalDialog(node, edge)
      },
      onBackgroundClick: () => {
        state.selected = null
        closeMenu()
        render()
      },
    })
    syncModeControls()
    renderRightPane()
    updateTraceBar()
  }

  render()
  return { state, api }
}
