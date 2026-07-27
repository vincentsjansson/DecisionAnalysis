import type { TreeNode } from '../model/tree'
import { resolveProbability } from '../model/conditionalProbability'
import { calculateExpectedValue } from '../model/expectedValue'
import { ProbabilitySumError, sumProbabilities } from '../model/validateProbabilities'
import type { NodeBox } from './layout'
import { layoutTree } from './layout'

const SVG_NS = 'http://www.w3.org/2000/svg'

export interface ViewTransform {
  scale: number
  x: number
  y: number
}

export interface RenderOptions {
  selected?: TreeNode | null
  view?: ViewTransform
  onNodeClick?: (node: TreeNode) => void
  onBackgroundClick?: () => void
}

/** Formats a number for display, or "–" for anything unfit to show
 * (NaN/Infinity). The locked rule: never fabricate a value. */
export function fmt(x: number): string {
  return Number.isFinite(x) ? String(parseFloat(x.toPrecision(4))) : '–'
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

/** EV for one node, displayed gracefully: exceptions (childless non-leaf,
 * ambiguous conditionals) and NaN (unset probabilities) all become "–". */
function nodeEvText(box: NodeBox): string {
  try {
    return `EV ${fmt(calculateExpectedValue(box.node, box.history))}`
  } catch {
    return 'EV –'
  }
}

/** Probability-sum status for an outcome node: null when fine, otherwise a
 * short warning string. Never throws, never blocks rendering. */
function nodeWarningText(box: NodeBox): string | null {
  if (box.node.nodeType !== 'outcome' || box.node.children.length === 0) return null
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
  if (box.node.nodeType === 'outcome') {
    const e = el('ellipse')
    e.setAttribute('rx', String(w / 2))
    e.setAttribute('ry', String(h / 2 + 2))
    e.setAttribute('class', cls)
    return e
  }
  // leaf: right-pointing triangle at the left edge, labels beside it
  const p = el('path')
  p.setAttribute('d', `M ${-w / 2} -13 L ${-w / 2 + 22} 0 L ${-w / 2} 13 Z`)
  p.setAttribute('class', cls)
  return p
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

  const layout = layoutTree(root)

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
    if (line.parent.nodeType === 'outcome') {
      let p: string
      try {
        p = fmt(resolveProbability(line.parent, line.edge, parentBox.history))
      } catch {
        p = '⚠'
      }
      label += ` · ${p}`
    }
    const t = text(line.labelX, line.labelY, label, 'edge-label')
    t.setAttribute('text-anchor', 'end')
    viewport.appendChild(t)
  }

  for (const box of layout.boxes) {
    const g = el('g')
    g.setAttribute('class', `node node-${box.node.nodeType}`)
    g.setAttribute('data-node-id', box.node.id)
    g.setAttribute('transform', `translate(${box.x} ${box.y})`)
    g.addEventListener('click', (e) => {
      e.stopPropagation()
      opts.onNodeClick?.(box.node)
    })

    g.appendChild(nodeShape(box, box.node === opts.selected))

    if (box.node.nodeType === 'leaf') {
      const tx = -box.w / 2 + 30
      const lt = text(tx, -3, box.node.label, 'node-label leaf-label')
      lt.setAttribute('text-anchor', 'start')
      g.appendChild(lt)
      const vt = text(tx, 13, fmt(box.node.payoff ?? NaN), 'node-ev')
      vt.setAttribute('text-anchor', 'start')
      g.appendChild(vt)
    } else {
      g.appendChild(text(0, -3, box.node.label, 'node-label'))
      g.appendChild(text(0, 13, nodeEvText(box), 'node-ev'))
      const warning = nodeWarningText(box)
      if (warning) {
        g.appendChild(text(0, box.h / 2 + 16, warning, 'node-warning'))
      }
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
