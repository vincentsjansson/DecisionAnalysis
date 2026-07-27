import { describe, expect, it } from 'vitest'
import { Outcome, setChild, TreeNode } from '../model/tree'
import { LEAF_SPACING, layoutTree, NODE_H } from './layout'

function fan(count: number): TreeNode {
  const root = new TreeNode('root', 'outcome', 'Root')
  for (let i = 0; i < count; i++) {
    setChild(
      root,
      new Outcome(`alt${i}`, 1 / count),
      new TreeNode(`leaf${i}`, 'leaf', `Leaf ${i}`, i),
    )
  }
  return root
}

describe('layoutTree', () => {
  it('spaces leaves so they never overlap, growing the canvas as needed', () => {
    for (const count of [2, 5, 12]) {
      const layout = layoutTree(fan(count))
      const leafYs = layout.boxes
        .filter((b) => b.node.nodeType === 'leaf')
        .map((b) => b.y)
        .sort((a, b) => a - b)

      expect(leafYs).toHaveLength(count)
      for (let i = 1; i < leafYs.length; i++) {
        expect(leafYs[i] - leafYs[i - 1]).toBeGreaterThanOrEqual(NODE_H)
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

  it('places edge labels clear of both node shapes', () => {
    const layout = layoutTree(fan(3))
    for (const line of layout.edges) {
      // Label anchor must sit strictly between the parent's right edge and
      // the child's left edge (text-anchor=end extends it leftward into gap).
      expect(line.labelX).toBeGreaterThan(line.x1)
      expect(line.labelX).toBeLessThan(line.x2)
    }
  })

  it('centers a parent on its children and tracks history per node', () => {
    const root = new TreeNode('root', 'outcome', 'Root')
    const mid = new TreeNode('mid', 'outcome', 'Mid')
    setChild(root, new Outcome('A', 0.5), mid)
    setChild(mid, new Outcome('X', 0.5), new TreeNode('lx', 'leaf', 'LX', 1))
    setChild(mid, new Outcome('Y', 0.5), new TreeNode('ly', 'leaf', 'LY', 2))

    const layout = layoutTree(root)
    const midBox = layout.byNode.get(mid)!
    const xs = layout.boxes.filter((b) => b.node.nodeType === 'leaf').map((b) => b.y)
    expect(midBox.y).toBeCloseTo((xs[0] + xs[1]) / 2)

    expect([...layout.byNode.get(mid)!.history]).toEqual(['root:A'])
    const lxBox = layout.boxes.find((b) => b.node.id === 'lx')!
    expect(lxBox.history.has('root:A')).toBe(true)
    expect(lxBox.history.has('mid:X')).toBe(true)
  })
})
