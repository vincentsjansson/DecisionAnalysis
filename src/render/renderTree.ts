import type { Outcome, TreeNode } from '../model/tree'
import { displayName } from '../model/tree'
import { resolveProbability } from '../model/conditionalProbability'
import { calculateExpectedValue } from '../model/expectedValue'
import { certaintyEquivalent } from '../model/expectedUtility'
import type { UtilityFunction } from '../model/utility'
import { ProbabilitySumError, sumProbabilities } from '../model/validateProbabilities'
import type { NodeBox } from './layout'
import { layoutTree, mirrorLayout } from './layout'

const SVG_NS = 'http://www.w3.org/2000/svg'

export interface ViewTransform {
  scale: number
  x: number
  y: number
}

export type DisplayMode = 'ev' | 'eu'

export interface RenderOptions {
  selected?: TreeNode | null
  view?: ViewTransform
  /** 'ev' (default, risk-neutral) shows EV per node; 'eu' shows the certainty
   * equivalent under `utilityFn`. */
  displayMode?: DisplayMode
  utilityFn?: UtilityFunction
  /** Horizontally mirror the spatial layout (root on the right, branches grow
   * left) while keeping all text upright and readable. Used for the read-only
   * clairvoyance tree in split mode. */
  mirror?: boolean
  onNodeClick?: (node: TreeNode, event: MouseEvent) => void
  onLeafClick?: (node: TreeNode, edge: Outcome, event: MouseEvent) => void
  onBackgroundClick?: () => void
}

/** Formats a number for display, or "–" for anything unfit to show
 * (NaN/Infinity/undefined). The locked rule: never fabricate a value. */
export function fmt(x: number | undefined): string {
  return x !== undefined && Number.isFinite(x) ? String(parseFloat(x.toPrecision(4))) : '–'
}

function el<K extends keyof SVGElementTagNameMap>(tag: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, tag)
}

function text(x: number, y: number, content: string, cls: string): SVGTextElement {
  const t = el('text')
  t.setAttribute('x', String(x))
  t.setAttribute('y', String(y))
  t.setAttribute('class', cls)
  t.textContent = content
  return t
}

/** Per-node value label, displayed gracefully: exceptions (no outcomes,
 * ambiguous conditionals, utility-domain errors) and NaN (unset
 * probabilities/values) all become "–". In EU mode the label is the
 * certainty equivalent (money), never a raw utility number. */
function nodeValueText(box: NodeBox, opts: RenderOptions): string {
  if (opts.displayMode === 'eu' && opts.utilityFn) {
    try {
      return `CE ${fmt(certaintyEquivalent(box.node, opts.utilityFn, box.history))}`
    } catch {
      return 'CE –'
    }
  }
  try {
    return `EV ${fmt(calculateExpectedValue(box.node, box.history))}`
  } catch {
    return 'EV –'
  }
}

/** Probability-sum status for a chance node: null when fine, otherwise a
 * short warning string. Never throws, never blocks rendering. */
function nodeWarningText(box: NodeBox): string | null {
  if (box.node.nodeType !== 'chance' || box.node.outcomes.length === 0) return null
  try {
    const sum = sumProbabilities(box.node, box.history)
    if (Number.isNaN(sum)) return 'p ofullständig'
    if (Math.abs(sum - 1) > 1e-6) return `Σ = ${fmt(sum)} ⚠`
    return null
  } catch (e) {
    if (e instanceof ProbabilitySumError) return `Σ = ${fmt(e.sum)} ⚠`
    return '⚠ villkor tvetydiga'
  }
}

function nodeShape(box: NodeBox, selected: boolean): SVGElement {
  const cls = `shape${selected ? ' selected' : ''}`
  const { w, h } = box
  if (box.node.nodeType === 'decision') {
    const r = el('rect')
    r.setAttribute('x', String(-w / 2))
    r.setAttribute('y', String(-h / 2))
    r.setAttribute('width', String(w))
    r.setAttribute('height', String(h))
    r.setAttribute('rx', '3')
    r.setAttribute('class', cls)
    return r
  }
  const e = el('ellipse')
  e.setAttribute('rx', String(w / 2))
  e.setAttribute('ry', String(h / 2 + 2))
  e.setAttribute('class', cls)
  return e
}

/** Fully idempotent: wipes the host and rebuilds the entire SVG from the
 * model. All listeners live on the fresh elements, so nothing accumulates. */
export function renderTree(
  host: HTMLElement,
  root: TreeNode | null,
  opts: RenderOptions = {},
): SVGSVGElement {
  host.replaceChildren()

  const svg = el('svg')
  svg.setAttribute('class', 'tree-svg')
  svg.setAttribute('width', '100%')
  svg.setAttribute('height', '100%')
  svg.addEventListener('click', () => opts.onBackgroundClick?.())
  host.appendChild(svg)

  const viewport = el('g')
  viewport.setAttribute('id', 'viewport')
  svg.appendChild(viewport)
  applyViewTransform(svg, opts.view ?? { scale: 1, x: 0, y: 0 })

  if (!root) {
    const empty = document.createElement('div')
    empty.className = 'empty-hint'
    empty.textContent = 'Tomt träd — klicka "Lägg till nod" för att skapa en rotnod.'
    host.appendChild(empty)
    return svg
  }

  const base = layoutTree(root)
  // Mirror around whichever is wider — the content or the live canvas — so the
  // mirrored tree right-aligns to the canvas edge (and a tiny tree still sits
  // at the right rather than cramped mid-canvas). clientWidth is 0 under jsdom,
  // where we fall back to the content width.
  const layout = opts.mirror
    ? mirrorLayout(base, Math.max(base.width, host.clientWidth || 0))
    : base

  // Edges + labels first (under the nodes).
  for (const line of layout.edges) {
    const cp = (line.x2 - line.x1) * 0.45
    const path = el('path')
    path.setAttribute(
      'd',
      `M ${line.x1} ${line.y1} C ${line.x1 + cp} ${line.y1}, ${line.x2 - cp} ${line.y2}, ${line.x2} ${line.y2}`,
    )
    path.setAttribute('class', 'edge')
    viewport.appendChild(path)

    const parentBox = layout.byNode.get(line.parent)!
    let label = line.edge.label
    if (line.parent.nodeType === 'chance') {
      let p: string
      try {
        p = fmt(resolveProbability(line.parent, line.edge, parentBox.history))
      } catch {
        p = '⚠'
      }
      label += ` · ${p}`
    }
    const t = text(line.labelX, line.labelY, label, 'edge-label')
    // Mirrored tree: the label sits on the child (left) side, so anchor it to
    // start (extends right over the curve) instead of end.
    t.setAttribute('text-anchor', opts.mirror ? 'start' : 'end')
    viewport.appendChild(t)
  }

  // Terminal outcomes as leaf marks: triangle + value + joint probability.
  for (const mark of layout.leaves) {
    const g = el('g')
    g.setAttribute('class', 'leaf')
    g.setAttribute('data-leaf', `${mark.node.id}:${mark.edge.label}`)
    g.setAttribute('transform', `translate(${mark.x} ${mark.y})`)
    g.addEventListener('click', (e) => {
      e.stopPropagation()
      opts.onLeafClick?.(mark.node, mark.edge, e as MouseEvent)
    })

    // Mirrored tree: the triangle points left (toward its parent on the right)
    // and its value/joint labels sit to the left, still upright and readable.
    const tri = el('path')
    tri.setAttribute('d', opts.mirror ? 'M 0 -12 L -20 0 L 0 12 Z' : 'M 0 -12 L 20 0 L 0 12 Z')
    tri.setAttribute('class', 'shape')
    g.appendChild(tri)

    const labelX = opts.mirror ? -28 : 28
    const labelAnchor = opts.mirror ? 'end' : 'start'
    const vt = text(labelX, -2, fmt(mark.edge.value), 'leaf-value')
    vt.setAttribute('text-anchor', labelAnchor)
    g.appendChild(vt)
    const pt = text(labelX, 13, `p = ${fmt(mark.joint)}`, 'leaf-joint')
    pt.setAttribute('text-anchor', labelAnchor)
    g.appendChild(pt)

    viewport.appendChild(g)
  }

  for (const box of layout.boxes) {
    const g = el('g')
    g.setAttribute('class', `node node-${box.node.nodeType}`)
    g.setAttribute('data-node-id', box.node.id)
    g.setAttribute('transform', `translate(${box.x} ${box.y})`)
    g.addEventListener('click', (e) => {
      e.stopPropagation()
      opts.onNodeClick?.(box.node, e as MouseEvent)
    })

    g.appendChild(nodeShape(box, box.node === opts.selected))
    g.appendChild(text(0, -3, displayName(box.node), 'node-label'))
    g.appendChild(text(0, 13, nodeValueText(box, opts), 'node-ev'))
    const warning = nodeWarningText(box)
    if (warning) {
      g.appendChild(text(0, box.h / 2 + 16, warning, 'node-warning'))
    }

    viewport.appendChild(g)
  }

  return svg
}

/** Updates zoom/pan without a rebuild — redraws stay cheap and zoom stays
 * scoped to the canvas (the header is plain HTML outside the SVG). */
export function applyViewTransform(svg: SVGSVGElement, view: ViewTransform): void {
  const viewport = svg.querySelector('#viewport')
  viewport?.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.scale})`)
}
