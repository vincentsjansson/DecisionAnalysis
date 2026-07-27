// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { Outcome, setChild, TreeNode } from '../model/tree'
import { renderTree } from './renderTree'

function host(): HTMLElement {
  return document.createElement('div')
}

function buildTree() {
  const root = new TreeNode('root', 'outcome', 'Root')
  const leafA = new TreeNode('la', 'leaf', 'LA', 10)
  const leafB = new TreeNode('lb', 'leaf', 'LB', 0)
  setChild(root, new Outcome('A', 0.3), leafA)
  setChild(root, new Outcome('B', 0.7), leafB)
  return { root, leafA, leafB }
}

describe('renderTree', () => {
  it('is fully idempotent — two renders produce identical markup', () => {
    const { root } = buildTree()
    const h = host()
    renderTree(h, root)
    const first = h.innerHTML
    renderTree(h, root)
    expect(h.innerHTML).toBe(first)
    expect(h.querySelectorAll('svg')).toHaveLength(1)
  })

  it('renders distinct shapes for the three node types', () => {
    const root = new TreeNode('root', 'decision', 'Decide')
    const mid = new TreeNode('mid', 'outcome', 'Chance')
    setChild(root, new Outcome('go', NaN), mid)
    setChild(mid, new Outcome('win', 0.5), new TreeNode('l1', 'leaf', 'L1', 1))
    setChild(mid, new Outcome('lose', 0.5), new TreeNode('l2', 'leaf', 'L2', 0))

    const h = host()
    renderTree(h, root)
    expect(h.querySelector('.node-decision rect')).not.toBeNull()
    expect(h.querySelector('.node-outcome ellipse')).not.toBeNull()
    expect(h.querySelector('.node-leaf path')).not.toBeNull()
  })

  it('shows live EV when data is complete', () => {
    const { root } = buildTree()
    const h = host()
    renderTree(h, root)
    // EV = 0.3·10 + 0.7·0 = 3
    const ev = h.querySelector('[data-node-id="root"] .node-ev')!
    expect(ev.textContent).toBe('EV 3')
  })

  it('shows "–" (never a fabricated value) when probabilities are unset', () => {
    const root = new TreeNode('root', 'outcome', 'Root')
    setChild(root, new Outcome('A', NaN), new TreeNode('la', 'leaf', 'LA', 10))
    setChild(root, new Outcome('B', NaN), new TreeNode('lb', 'leaf', 'LB', 0))

    const h = host()
    renderTree(h, root)
    expect(h.querySelector('[data-node-id="root"] .node-ev')!.textContent).toBe('EV –')
    const labels = [...h.querySelectorAll('.edge-label')].map((n) => n.textContent)
    expect(labels).toContain('A · –')
    expect(labels).toContain('B · –')
    // Incomplete marker, not a Σ-warning (NaN is unset, not wrong).
    expect(h.querySelector('.node-warning')!.textContent).toBe('p ofullständig')
  })

  it('live EV updates when the missing data is filled in and rerendered', () => {
    const root = new TreeNode('root', 'outcome', 'Root')
    const edgeA = new Outcome('A', NaN)
    const edgeB = new Outcome('B', NaN)
    setChild(root, edgeA, new TreeNode('la', 'leaf', 'LA', 10))
    setChild(root, edgeB, new TreeNode('lb', 'leaf', 'LB', 0))

    const h = host()
    renderTree(h, root)
    expect(h.querySelector('[data-node-id="root"] .node-ev')!.textContent).toBe('EV –')

    edgeA.probability = 0.4
    edgeB.probability = 0.6
    renderTree(h, root)
    expect(h.querySelector('[data-node-id="root"] .node-ev')!.textContent).toBe('EV 4')
    expect(h.querySelector('.node-warning')).toBeNull()
  })

  it('shows a non-blocking Σ-warning when probabilities do not sum to 1', () => {
    const root = new TreeNode('root', 'outcome', 'Root')
    setChild(root, new Outcome('A', 0.3), new TreeNode('la', 'leaf', 'LA', 10))
    setChild(root, new Outcome('B', 0.3), new TreeNode('lb', 'leaf', 'LB', 0))

    const h = host()
    renderTree(h, root)
    expect(h.querySelector('.node-warning')!.textContent).toBe('Σ = 0.6 ⚠')
    // Rendering still completed — the warning is non-blocking.
    expect(h.querySelectorAll('g.node')).toHaveLength(3)
  })

  it('omits probability labels on decision-node edges', () => {
    const root = new TreeNode('root', 'decision', 'Decide')
    setChild(root, new Outcome('go', NaN), new TreeNode('l1', 'leaf', 'L1', 5))
    setChild(root, new Outcome('stay', NaN), new TreeNode('l2', 'leaf', 'L2', 2))

    const h = host()
    renderTree(h, root)
    const labels = [...h.querySelectorAll('.edge-label')].map((n) => n.textContent)
    expect(labels).toEqual(['go', 'stay'])
    // Decision EV = max(5, 2) = 5 even with unset edge "probabilities".
    expect(h.querySelector('[data-node-id="root"] .node-ev')!.textContent).toBe('EV 5')
  })

  it('renders an empty-state hint when there is no tree', () => {
    const h = host()
    renderTree(h, null)
    expect(h.querySelector('.empty-hint')).not.toBeNull()
  })
})
