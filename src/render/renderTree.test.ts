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

  describe('mirror mode (right/clairvoyance tree)', () => {
    function decisionTree() {
      const root = new TreeNode('bet', 'decision', 'Bet')
      const yes = addOutcome(root, 'Yes')
      addOutcome(root, 'No', NaN, 3)
      const w = new TreeNode('w', 'chance', 'Weather')
      setChild(root, yes, w)
      addOutcome(w, 'Rain', 0.3, 8)
      addOutcome(w, 'Sun', 0.7, 2)
      return root
    }

    const nodeX = (h: HTMLElement, id: string): number => {
      const t = h.querySelector(`[data-node-id="${id}"]`)!.getAttribute('transform')!
      return parseFloat(/translate\(([-\d.]+)/.exec(t)![1])
    }

    it('is idempotent — two mirrored renders match, no duplicate SVG/nodes', () => {
      const h = host()
      renderTree(h, decisionTree(), { mirror: true })
      const first = h.innerHTML
      const nodeCount = h.querySelectorAll('[data-node-id]').length
      renderTree(h, decisionTree(), { mirror: true })
      expect(h.innerHTML).toBe(first)
      expect(h.querySelectorAll('svg')).toHaveLength(1)
      expect(h.querySelectorAll('[data-node-id]')).toHaveLength(nodeCount)
    })

    it('places the root to the RIGHT of its children (branches grow left)', () => {
      const h = host()
      renderTree(h, decisionTree(), { mirror: true })
      // Weather is a child of Bet; mirrored, Bet (root) is right of Weather.
      expect(nodeX(h, 'bet')).toBeGreaterThan(nodeX(h, 'w'))
    })

    it('is the horizontal mirror image of the un-mirrored render', () => {
      const plain = host()
      renderTree(plain, decisionTree())
      const mir = host()
      renderTree(mir, decisionTree(), { mirror: true })
      // Un-mirrored: root is left of its child. Mirrored: root is right of it.
      expect(nodeX(plain, 'bet')).toBeLessThan(nodeX(plain, 'w'))
      expect(nodeX(mir, 'bet')).toBeGreaterThan(nodeX(mir, 'w'))
    })

    it('points leaf triangles left and keeps text upright (no transform flip)', () => {
      const h = host()
      renderTree(h, decisionTree(), { mirror: true })
      const tri = h.querySelector('g.leaf path')!.getAttribute('d')!
      expect(tri).toContain('-20 0') // apex points left
      // Text is never mirror-transformed — labels stay readable.
      expect(h.querySelector('#viewport')!.getAttribute('transform')).not.toMatch(/scale\(-/)
      expect(h.querySelector('[data-node-id="bet"] .node-label')!.textContent).toBe('Bet')
    })
  })

  describe('linked-group state badge', () => {
    // Two chance instances sharing a variableId (a linked group), one of which
    // is driven by a conditional table.
    function linkedTree() {
      const root = new TreeNode('root', 'decision', 'D')
      const gA = addOutcome(root, 'a')
      const gB = addOutcome(root, 'b')
      const m1 = new TreeNode('m1', 'chance', 'M')
      const m2 = new TreeNode('m2', 'chance', 'M')
      m1.variableId = 'grpM'
      m2.variableId = 'grpM'
      m1.instanceIndex = 0
      m2.instanceIndex = 1
      addOutcome(m1, 'x', 0.5, 1)
      addOutcome(m1, 'y', 0.5, 0)
      addOutcome(m2, 'x', 0.5, 1)
      addOutcome(m2, 'y', 0.5, 0)
      setChild(root, gA, m1)
      setChild(root, gB, m2)
      return { root, m1, m2 }
    }

    it('shows the linked glyph (⛓) on plain linked instances', () => {
      const { root } = linkedTree()
      const h = host()
      renderTree(h, root)
      const badge = h.querySelector('[data-node-id="m1"] .node-badge')!
      expect(badge).not.toBeNull()
      // firstChild is the glyph text node; the <title> child holds the tooltip.
      expect(badge.firstChild!.textContent).toBe('⛓')
      expect(badge.querySelector('title')!.textContent).toContain('Länkad instans')
    })

    it('shows the conditional-table glyph (⊞) when an instance has a table', () => {
      const { root, m1 } = linkedTree()
      m1.conditionalTable = [{ condition: new Set(['root:a']), probabilities: { x: 0.9, y: 0.1 } }]
      const h = host()
      renderTree(h, root)
      expect(h.querySelector('[data-node-id="m1"] .node-badge')!.firstChild!.textContent).toBe('⊞')
      // The sibling with no table is still a plain linked instance.
      expect(h.querySelector('[data-node-id="m2"] .node-badge')!.firstChild!.textContent).toBe('⛓')
    })

    it('shows no badge on a singleton node', () => {
      const root = new TreeNode('root', 'chance', 'Solo')
      addOutcome(root, 'a', 0.5, 1)
      addOutcome(root, 'b', 0.5, 0)
      const h = host()
      renderTree(h, root)
      expect(h.querySelector('[data-node-id="root"] .node-badge')).toBeNull()
    })
  })
})
