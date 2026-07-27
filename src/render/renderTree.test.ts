// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { addOutcome, setChild, TreeNode } from '../model/tree'
import { renderTree } from './renderTree'

function host(): HTMLElement {
  return document.createElement('div')
}

function buildTree() {
  const root = new TreeNode('root', 'chance', 'Root')
  const edgeA = addOutcome(root, 'A', 0.3, 10)
  const edgeB = addOutcome(root, 'B', 0.7, 0)
  return { root, edgeA, edgeB }
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

  it('renders rect for decision, ellipse for chance, triangles for terminals', () => {
    const root = new TreeNode('root', 'decision', 'Decide')
    const go = addOutcome(root, 'go')
    addOutcome(root, 'stay', NaN, 0)
    const mid = new TreeNode('mid', 'chance', 'Chance')
    setChild(root, go, mid)
    addOutcome(mid, 'win', 0.5, 1)
    addOutcome(mid, 'lose', 0.5, 0)

    const h = host()
    renderTree(h, root)
    expect(h.querySelector('.node-decision rect')).not.toBeNull()
    expect(h.querySelector('.node-chance ellipse')).not.toBeNull()
    expect(h.querySelectorAll('g.leaf path')).toHaveLength(3)
  })

  it('shows live EV when data is complete', () => {
    const { root } = buildTree()
    const h = host()
    renderTree(h, root)
    // EV = 0.3·10 + 0.7·0 = 3
    expect(h.querySelector('[data-node-id="root"] .node-ev')!.textContent).toBe('EV 3')
  })

  it('shows "–" (never a fabricated value) for unset probabilities and values', () => {
    const root = new TreeNode('root', 'chance', 'Root')
    addOutcome(root, 'A', NaN, 10)
    addOutcome(root, 'B', NaN) // no value either

    const h = host()
    renderTree(h, root)
    expect(h.querySelector('[data-node-id="root"] .node-ev')!.textContent).toBe('EV –')
    const labels = [...h.querySelectorAll('.edge-label')].map((n) => n.textContent)
    expect(labels).toContain('A · –')
    expect(labels).toContain('B · –')
    expect(h.querySelector('.node-warning')!.textContent).toBe('p ofullständig')
    const values = [...h.querySelectorAll('.leaf-value')].map((n) => n.textContent)
    expect(values).toContain('–')
    const joints = [...h.querySelectorAll('.leaf-joint')].map((n) => n.textContent)
    expect(joints).toEqual(['p = –', 'p = –'])
  })

  it('live EV updates when the missing data is filled in and rerendered', () => {
    const root = new TreeNode('root', 'chance', 'Root')
    const edgeA = addOutcome(root, 'A', NaN, 10)
    const edgeB = addOutcome(root, 'B', NaN, 0)

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
    const root = new TreeNode('root', 'chance', 'Root')
    addOutcome(root, 'A', 0.3, 10)
    addOutcome(root, 'B', 0.3, 0)

    const h = host()
    renderTree(h, root)
    expect(h.querySelector('.node-warning')!.textContent).toBe('Σ = 0.6 ⚠')
    expect(h.querySelectorAll('g.leaf')).toHaveLength(2)
  })

  it('omits probability labels on decision-node alternatives', () => {
    const root = new TreeNode('root', 'decision', 'Decide')
    addOutcome(root, 'go', NaN, 5)
    addOutcome(root, 'stay', NaN, 2)

    const h = host()
    renderTree(h, root)
    const labels = [...h.querySelectorAll('.edge-label')].map((n) => n.textContent)
    expect(labels).toEqual(['go', 'stay'])
    // Decision EV = max(5, 2) even with unset probabilities.
    expect(h.querySelector('[data-node-id="root"] .node-ev')!.textContent).toBe('EV 5')
  })

  it('renders an empty-state hint when there is no tree', () => {
    const h = host()
    renderTree(h, null)
    expect(h.querySelector('.empty-hint')).not.toBeNull()
  })
})
