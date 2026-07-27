import type { NodeType } from '../model/tree'
import {
  Outcome,
  removeChild,
  renameEdgeLabel,
  setChild,
  TreeNode,
} from '../model/tree'
import type { ConditionalEntry } from '../model/tree'
import { backwardFill } from '../model/backwardFill'
import { branchLabel } from '../model/tree'
import { fmt, renderTree, applyViewTransform } from '../render/renderTree'
import type { ViewTransform } from '../render/renderTree'

export interface AppState {
  root: TreeNode | null
  selected: TreeNode | null
  /** Panel mode: normal node editing, or the create-root form. */
  creatingRoot: boolean
  /** Transparency report / error message shown in the panel. */
  message: string
  view: ViewTransform
  idCounter: number
}

export interface ChildSpec {
  type: NodeType
  edgeLabel: string
  payoff?: number
}

export interface AppApi {
  createRoot(type: NodeType, label: string, payoff?: number): TreeNode
  addChild(parent: TreeNode, spec: ChildSpec): TreeNode
  deleteNode(node: TreeNode): void
  setNodeLabel(node: TreeNode, label: string): void
  setPayoff(node: TreeNode, payoff: number): void
  setEdgeProbability(edge: Outcome, probability: number): void
  renameEdge(parent: TreeNode, edge: Outcome, newLabel: string): void
  setConditionalEntries(edge: Outcome, entries: ConditionalEntry[]): void
  applyBackwardFill(target: TreeNode, targetProbability: number): void
  selectNode(node: TreeNode | null): void
  render(): void
}

export interface App {
  state: AppState
  api: AppApi
}

/** `confirmFn` is injectable so tests can run the delete flow headlessly. */
export function createApp(
  container: HTMLElement,
  options: { confirmFn?: (message: string) => boolean } = {},
): App {
  const confirmFn = options.confirmFn ?? ((m: string) => window.confirm(m))

  const state: AppState = {
    root: null,
    selected: null,
    creatingRoot: false,
    message: '',
    view: { scale: 1, x: 0, y: 0 },
    idCounter: 0,
  }

  // ── Static shell (built once — zoom/pan listeners never accumulate) ──
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
  topbar.append(title, addBtn)

  const workspace = document.createElement('div')
  workspace.className = 'workspace'
  const canvasHost = document.createElement('div')
  canvasHost.className = 'canvas-host'
  const panel = document.createElement('aside')
  panel.className = 'panel'
  workspace.append(canvasHost, panel)
  container.append(topbar, workspace)

  let svg: SVGSVGElement | null = null

  // ── Zoom & pan, scoped to the canvas only ──
  canvasHost.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const newScale = Math.min(3, Math.max(0.2, state.view.scale * factor))
      const rect = canvasHost.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      state.view.x = mx - ((mx - state.view.x) / state.view.scale) * newScale
      state.view.y = my - ((my - state.view.y) / state.view.scale) * newScale
      state.view.scale = newScale
      if (svg) applyViewTransform(svg, state.view)
    },
    { passive: false },
  )

  let panStart: { mx: number; my: number; vx: number; vy: number } | null = null
  canvasHost.addEventListener('pointerdown', (e) => {
    if ((e.target as Element).closest('g.node')) return
    panStart = { mx: e.clientX, my: e.clientY, vx: state.view.x, vy: state.view.y }
  })
  canvasHost.addEventListener('pointermove', (e) => {
    if (!panStart) return
    state.view.x = panStart.vx + e.clientX - panStart.mx
    state.view.y = panStart.vy + e.clientY - panStart.my
    if (svg) applyViewTransform(svg, state.view)
  })
  canvasHost.addEventListener('pointerup', () => {
    panStart = null
  })
  canvasHost.addEventListener('dblclick', (e) => {
    if ((e.target as Element).closest('g.node')) return
    state.view = { scale: 1, x: 0, y: 0 }
    if (svg) applyViewTransform(svg, state.view)
  })

  addBtn.addEventListener('click', () => {
    if (state.root === null) {
      state.creatingRoot = true
      state.selected = null
    } else {
      // Judgment call: with an existing tree the button selects the root and
      // opens its editor, where "Lägg till gren" lives.
      state.selected = state.root
      state.creatingRoot = false
    }
    render()
  })

  const nextId = (): string => `n${++state.idCounter}`

  const findIncoming = (node: TreeNode): { parent: TreeNode; edge: Outcome } | null => {
    if (!node.parent) return null
    const edge = node.parent.children.find((e) => e.child === node)
    return edge ? { parent: node.parent, edge } : null
  }

  const historyFor = (node: TreeNode): Set<string> => {
    const tokens: string[] = []
    let current = node
    let inc = findIncoming(current)
    while (inc) {
      tokens.unshift(branchLabel(inc.parent, inc.edge.label))
      current = inc.parent
      inc = findIncoming(current)
    }
    return new Set(tokens)
  }

  // ── API — every mutation goes through the segment-3 model layer ──
  const api: AppApi = {
    createRoot(type, label, payoff) {
      const node = new TreeNode(nextId(), type, label, payoff)
      state.root = node
      state.selected = node
      state.creatingRoot = false
      state.message = ''
      render()
      return node
    },

    addChild(parent, spec) {
      if (parent.children.some((e) => e.label === spec.edgeLabel)) {
        throw new Error(`Grenen "${spec.edgeLabel}" finns redan på denna nod`)
      }
      const child = new TreeNode(nextId(), spec.type, spec.edgeLabel, spec.payoff)
      // New outcome edges start with NaN probability — deliberately "unset",
      // shown as "–" until the user fills it in. Never a fabricated 0.
      const edge = new Outcome(spec.edgeLabel, NaN)
      setChild(parent, edge, child)
      state.selected = child
      state.message = ''
      render()
      return child
    },

    deleteNode(node) {
      const inc = findIncoming(node)
      if (!inc) {
        state.root = null
      } else {
        removeChild(inc.parent, inc.edge)
      }
      state.selected = null
      state.message = ''
      render()
    },

    setNodeLabel(node, label) {
      node.label = label
      render()
    },

    setPayoff(node, payoff) {
      node.payoff = payoff
      render()
    },

    setEdgeProbability(edge, probability) {
      edge.probability = probability
      render()
    },

    renameEdge(parent, edge, newLabel) {
      if (!state.root) return
      renameEdgeLabel(state.root, parent, edge, newLabel)
      render()
    },

    setConditionalEntries(edge, entries) {
      edge.conditionalTable = entries
      render()
    },

    applyBackwardFill(target, targetProbability) {
      if (!state.root) return
      const result = backwardFill(state.root, target, targetProbability)
      const parts = result.siblings.map(
        (s) => `${s.edge.label}: ${fmt(s.oldProbability)} → ${fmt(s.newProbability)}`,
      )
      state.message =
        `Justerade P(${result.node.label} → ${result.edge.label}): ` +
        `${fmt(result.oldProbability)} → ${fmt(result.newProbability)}` +
        (parts.length > 0 ? ` · syskon omskalade: ${parts.join(', ')}` : '')
      render()
    },

    selectNode(node) {
      state.selected = node
      state.creatingRoot = false
      render()
    },

    render,
  }

  // ── Panel builders ──
  const field = (labelText: string, input: HTMLElement): HTMLElement => {
    const wrap = document.createElement('label')
    wrap.className = 'field'
    const span = document.createElement('span')
    span.textContent = labelText
    wrap.append(span, input)
    return wrap
  }

  const textInput = (value: string, onCommit: (v: string) => void): HTMLInputElement => {
    const input = document.createElement('input')
    input.type = 'text'
    input.value = value
    input.addEventListener('change', () => onCommit(input.value.trim()))
    return input
  }

  const numberInput = (value: number, onCommit: (v: number) => void): HTMLInputElement => {
    const input = document.createElement('input')
    input.type = 'text'
    input.inputMode = 'decimal'
    input.value = Number.isFinite(value) ? String(value) : ''
    input.addEventListener('change', () => onCommit(parseFloat(input.value.replace(',', '.'))))
    return input
  }

  const button = (label: string, onClick: () => void): HTMLButtonElement => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = label
    b.addEventListener('click', onClick)
    return b
  }

  const guarded = (fn: () => void): void => {
    try {
      fn()
    } catch (e) {
      state.message = e instanceof Error ? e.message : String(e)
      render()
    }
  }

  const typeSelect = (): HTMLSelectElement => {
    const select = document.createElement('select')
    for (const [value, text] of [
      ['outcome', 'Slumpnod (outcome)'],
      ['decision', 'Beslutsnod (decision)'],
      ['leaf', 'Lövnod (leaf)'],
    ] as const) {
      const opt = document.createElement('option')
      opt.value = value
      opt.textContent = text
      select.appendChild(opt)
    }
    return select
  }

  const buildCreateForm = (
    heading: string,
    submitLabel: string,
    onSubmit: (type: NodeType, label: string, payoff: number) => void,
  ): HTMLElement => {
    const form = document.createElement('div')
    form.className = 'create-form'
    const h = document.createElement('h3')
    h.textContent = heading
    form.appendChild(h)

    const select = typeSelect()
    const labelInput = document.createElement('input')
    labelInput.type = 'text'
    const payoffInput = document.createElement('input')
    payoffInput.type = 'text'
    payoffInput.inputMode = 'decimal'
    const payoffField = field('Payoff (krävs för löv)', payoffInput)

    const syncPayoffVisibility = (): void => {
      payoffField.style.display = select.value === 'leaf' ? '' : 'none'
    }
    select.addEventListener('change', syncPayoffVisibility)
    syncPayoffVisibility()

    form.append(
      field('Typ', select),
      field('Etikett', labelInput),
      payoffField,
      button(submitLabel, () =>
        guarded(() => {
          const label = labelInput.value.trim()
          if (!label) throw new Error('Etikett krävs')
          const payoff = parseFloat(payoffInput.value.replace(',', '.'))
          if (select.value === 'leaf' && !Number.isFinite(payoff)) {
            throw new Error('En lövnod måste ha ett numeriskt payoff-värde')
          }
          onSubmit(select.value as NodeType, label, payoff)
        }),
      ),
    )
    return form
  }

  const buildConditionalEditor = (edge: Outcome, node: TreeNode): HTMLElement => {
    const section = document.createElement('div')
    section.className = 'conditional-editor'
    const h = document.createElement('h3')
    h.textContent = 'Villkorstabell (ingående gren)'
    section.appendChild(h)

    const rows: { condition: HTMLInputElement; prob: HTMLInputElement }[] = []
    const rowsHost = document.createElement('div')

    const addRow = (conditionText: string, probText: string): void => {
      const row = document.createElement('div')
      row.className = 'conditional-row'
      const condition = document.createElement('input')
      condition.type = 'text'
      condition.value = conditionText
      condition.placeholder = 'villkor, kommaseparerade'
      const prob = document.createElement('input')
      prob.type = 'text'
      prob.inputMode = 'decimal'
      prob.value = probText
      prob.placeholder = 'p'
      const entry = { condition, prob }
      rows.push(entry)
      row.append(
        condition,
        prob,
        button('✕', () => {
          rows.splice(rows.indexOf(entry), 1)
          row.remove()
        }),
      )
      rowsHost.appendChild(row)
    }

    for (const entry of edge.conditionalTable) {
      addRow([...entry.condition].sort().join(','), String(entry.probability))
    }
    section.appendChild(rowsHost)

    section.appendChild(button('+ villkor', () => addRow('', '')))
    section.appendChild(
      button('Spara villkor', () =>
        guarded(() => {
          const entries: ConditionalEntry[] = rows.map((r) => {
            const tokens = r.condition.value
              .split(',')
              .map((s) => s.trim())
              .filter((s) => s.length > 0)
            const probability = parseFloat(r.prob.value.replace(',', '.'))
            if (tokens.length === 0) throw new Error('Ett villkor saknar tokens')
            if (!Number.isFinite(probability)) throw new Error('Ett villkor saknar sannolikhet')
            return { condition: new Set(tokens), probability }
          })
          api.setConditionalEntries(edge, entries)
        }),
      ),
    )

    const history = historyFor(node)
    if (history.size > 0) {
      const hint = document.createElement('p')
      hint.className = 'hint'
      hint.textContent = `Tillgängliga tokens på denna path: ${[...history].join(', ')}`
      section.appendChild(hint)
    }
    return section
  }

  const buildNodePanel = (node: TreeNode): void => {
    const inc = findIncoming(node)

    const typeLine = document.createElement('p')
    typeLine.className = 'node-meta'
    typeLine.textContent = `${node.nodeType} · id ${node.id}`
    panel.appendChild(typeLine)

    panel.appendChild(
      field(
        'Nodetikett',
        textInput(node.label, (v) => guarded(() => api.setNodeLabel(node, v || node.label))),
      ),
    )

    if (node.nodeType === 'leaf') {
      panel.appendChild(
        field(
          'Payoff',
          numberInput(node.payoff ?? NaN, (v) =>
            guarded(() => {
              if (!Number.isFinite(v)) throw new Error('Payoff måste vara ett tal')
              api.setPayoff(node, v)
            }),
          ),
        ),
      )

      const bf = document.createElement('div')
      bf.className = 'backfill'
      const h = document.createElement('h3')
      h.textContent = 'Sätt joint probability (backward-fill)'
      const target = document.createElement('input')
      target.type = 'text'
      target.inputMode = 'decimal'
      target.placeholder = 'mål-sannolikhet (0–1]'
      bf.append(
        h,
        field('Mål', target),
        button('Beräkna bakåt', () =>
          guarded(() => api.applyBackwardFill(node, parseFloat(target.value.replace(',', '.')))),
        ),
      )
      panel.appendChild(bf)
    }

    if (inc) {
      const h = document.createElement('h3')
      h.textContent = 'Ingående gren'
      panel.appendChild(h)
      panel.appendChild(
        field(
          'Gren-etikett',
          textInput(inc.edge.label, (v) =>
            guarded(() => api.renameEdge(inc.parent, inc.edge, v || inc.edge.label)),
          ),
        ),
      )
      if (inc.parent.nodeType === 'outcome') {
        panel.appendChild(
          field(
            'Sannolikhet (bas)',
            numberInput(inc.edge.probability, (v) =>
              guarded(() => api.setEdgeProbability(inc.edge, v)),
            ),
          ),
        )
        panel.appendChild(buildConditionalEditor(inc.edge, node))
      }
    }

    if (node.nodeType !== 'leaf') {
      panel.appendChild(
        buildCreateForm('Lägg till gren', 'Lägg till gren', (type, label, payoff) =>
          api.addChild(node, {
            type,
            edgeLabel: label,
            payoff: type === 'leaf' ? payoff : undefined,
          }),
        ),
      )
    }

    const del = button('Ta bort nod (med hela delträdet)', () => {
      if (confirmFn(`Ta bort "${node.label}" och hela dess delträd?`)) {
        guarded(() => api.deleteNode(node))
      }
    })
    del.className = 'danger'
    panel.appendChild(del)
  }

  const buildPanel = (): void => {
    panel.replaceChildren()

    if (state.message) {
      const msg = document.createElement('p')
      msg.className = 'message'
      msg.textContent = state.message
      panel.appendChild(msg)
    }

    if (state.creatingRoot) {
      panel.appendChild(
        buildCreateForm('Skapa rotnod', 'Skapa', (type, label, payoff) =>
          api.createRoot(type, label, type === 'leaf' ? payoff : undefined),
        ),
      )
      return
    }

    if (!state.selected) {
      const hint = document.createElement('p')
      hint.className = 'hint'
      hint.textContent = state.root
        ? 'Klicka på en nod i trädet för att redigera den.'
        : 'Klicka "Lägg till nod" för att börja.'
      panel.appendChild(hint)
      return
    }

    buildNodePanel(state.selected)
  }

  function render(): void {
    svg = renderTree(canvasHost, state.root, {
      selected: state.selected,
      view: state.view,
      onNodeClick: (node) => api.selectNode(node),
      onBackgroundClick: () => api.selectNode(null),
    })
    buildPanel()
  }

  render()
  return { state, api }
}
