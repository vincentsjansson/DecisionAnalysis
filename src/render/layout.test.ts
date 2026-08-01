import { describe, expect, it } from 'vitest'
import { addOutcome, setChild, TreeNode } from '../model/tree'
import { LEAF_SPACING, layoutTree, mirrorLayout, NODE_H } from './layout'

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

describe('mirrorLayout', () => {
  function deepTree(): TreeNode {
    // Bet(decision) Yes -> Weather(chance) Rain->8 / Sun->2 ; No -> 3
    const root = new TreeNode('bet', 'decision', 'Bet')
    const yes = addOutcome(root, 'Yes')
    addOutcome(root, 'No', NaN, 3)
    const w = new TreeNode('w', 'chance', 'Weather')
    setChild(root, yes, w)
    addOutcome(w, 'Rain', 0.3, 8)
    addOutcome(w, 'Sun', 0.7, 2)
    return root
  }

  it('reflects every x around the axis and leaves y/size/refs untouched', () => {
    const base = layoutTree(deepTree())
    const AXIS = 1000
    const m = mirrorLayout(base, AXIS)

    // Same counts, unchanged canvas dimensions.
    expect(m.boxes).toHaveLength(base.boxes.length)
    expect(m.leaves).toHaveLength(base.leaves.length)
    expect(m.edges).toHaveLength(base.edges.length)
    expect(m.width).toBe(base.width)
    expect(m.height).toBe(base.height)

    // Node x reflected, y and size identical, node reference preserved.
    base.boxes.forEach((b, i) => {
      const mb = m.boxes[i]
      expect(mb.node).toBe(b.node)
      expect(mb.x).toBeCloseTo(AXIS - b.x)
      expect(mb.y).toBe(b.y)
      expect(mb.w).toBe(b.w)
    })
    // Edge endpoints and label x reflected; y untouched.
    base.edges.forEach((e, i) => {
      const me = m.edges[i]
      expect(me.x1).toBeCloseTo(AXIS - e.x1)
      expect(me.x2).toBeCloseTo(AXIS - e.x2)
      expect(me.labelX).toBeCloseTo(AXIS - e.labelX)
      expect(me.y1).toBe(e.y1)
      expect(me.y2).toBe(e.y2)
    })
    // byNode rebuilt to the mirrored boxes (history preserved for prob resolution).
    for (const b of m.boxes) expect(m.byNode.get(b.node)).toBe(b)
  })

  it('puts the root on the right and the deepest leaves on the left', () => {
    const base = layoutTree(deepTree())
    const m = mirrorLayout(base, base.width)
    const rootBox = m.byNode.get([...base.byNode.keys()].find((n) => n.id === 'bet')!)!
    const otherMaxX = Math.max(...m.boxes.filter((b) => b.node.id !== 'bet').map((b) => b.x))
    // The root (bet) sits to the RIGHT of every other node in the mirrored tree.
    expect(rootBox.x).toBeGreaterThan(otherMaxX)
    // Leaves sit to the LEFT of the root.
    expect(Math.max(...m.leaves.map((l) => l.x))).toBeLessThan(rootBox.x)
  })

  it('is an involution — mirroring twice restores the original x', () => {
    const base = layoutTree(deepTree())
    const back = mirrorLayout(mirrorLayout(base, 777), 777)
    base.boxes.forEach((b, i) => expect(back.boxes[i].x).toBeCloseTo(b.x))
  })
})
