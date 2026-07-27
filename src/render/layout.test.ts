import { describe, expect, it } from 'vitest'
import { addOutcome, setChild, TreeNode } from '../model/tree'
import { LEAF_SPACING, layoutTree, NODE_H } from './layout'

function fan(count: number): TreeNode {
  const root = new TreeNode('root', 'chance', 'Root')
  for (let i = 0; i < count; i++) {
    addOutcome(root, `alt${i}`, 1 / count, i)
  }
  return root
}

describe('layoutTree', () => {
  it('spaces terminal outcomes so they never overlap, growing the canvas', () => {
    for (const count of [2, 5, 12]) {
      const layout = layoutTree(fan(count))
      const ys = layout.leaves.map((l) => l.y).sort((a, b) => a - b)

      expect(ys).toHaveLength(count)
      for (let i = 1; i < ys.length; i++) {
        expect(ys[i] - ys[i - 1]).toBeGreaterThanOrEqual(NODE_H)
      }
      expect(layout.height).toBeGreaterThanOrEqual(count * LEAF_SPACING)
    }
  })

  it('keeps edge labels vertically separated at 3+ outcomes on one node', () => {
    const layout = layoutTree(fan(4))
    const labelYs = layout.edges.map((e) => e.labelY).sort((a, b) => a - b)

    // Label text is ~12px tall; ≥20px separation means no overlap.
    for (let i = 1; i < labelYs.length; i++) {
      expect(labelYs[i] - labelYs[i - 1]).toBeGreaterThanOrEqual(20)
    }
  })

  it('places edge labels strictly between parent and target', () => {
    const layout = layoutTree(fan(3))
    for (const line of layout.edges) {
      expect(line.labelX).toBeGreaterThan(line.x1)
      expect(line.labelX).toBeLessThan(line.x2 + 1)
    }
  })

  it('centers a parent on its branches and tracks history per node', () => {
    const root = new TreeNode('root', 'chance', 'Root')
    const edgeA = addOutcome(root, 'A', 1)
    const mid = new TreeNode('mid', 'chance', 'Mid')
    setChild(root, edgeA, mid)
    addOutcome(mid, 'X', 0.5, 1)
    addOutcome(mid, 'Y', 0.5, 2)

    const layout = layoutTree(root)
    const midBox = layout.byNode.get(mid)!
    const ys = layout.leaves.map((l) => l.y)
    expect(midBox.y).toBeCloseTo((ys[0] + ys[1]) / 2)
    expect([...midBox.history]).toEqual(['root:A'])
  })

  it('computes joint probability per terminal outcome (decision steps count as 1)', () => {
    const root = new TreeNode('root', 'decision', 'Decide')
    const go = addOutcome(root, 'go')
    addOutcome(root, 'stay', NaN, 0)
    const mid = new TreeNode('mid', 'chance', 'Mid')
    setChild(root, go, mid)
    addOutcome(mid, 'win', 0.3, 10)
    addOutcome(mid, 'lose', 0.7, 0)

    const layout = layoutTree(root)
    const win = layout.leaves.find((l) => l.edge.label === 'win')!
    const stay = layout.leaves.find((l) => l.edge.label === 'stay')!
    expect(win.joint).toBeCloseTo(0.3)
    expect(stay.joint).toBeCloseTo(1)
  })

  it('propagates NaN joint for unset probabilities instead of fabricating', () => {
    const root = new TreeNode('root', 'chance', 'Root')
    addOutcome(root, 'A', NaN, 5)
    addOutcome(root, 'B', NaN, 2)
    const layout = layoutTree(root)
    expect(layout.leaves.every((l) => Number.isNaN(l.joint))).toBe(true)
  })
})
