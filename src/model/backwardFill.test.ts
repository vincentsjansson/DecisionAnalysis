import { describe, expect, it } from 'vitest'
import { backwardFill, BackwardFillError } from './backwardFill'
import { Outcome, setChild, TreeNode } from './tree'

/**
 * root (outcome)
 * ├─ "A" p=0.3 -> mid (outcome)
 * │               ├─ "X" p=0.5 -> leafX (payoff 10)
 * │               └─ "Y" p=0.5 -> leafY (payoff 0)
 * └─ "B" p=0.7 -> leafB (payoff 5)
 *
 * Joint P(leafX) = 0.3 × 0.5 = 0.15.
 */
function buildTree() {
  const root = new TreeNode('root', 'outcome', 'Root')
  const mid = new TreeNode('mid', 'outcome', 'Mid')
  const leafX = new TreeNode('leafX', 'leaf', 'X', 10)
  const leafY = new TreeNode('leafY', 'leaf', 'Y', 0)
  const leafB = new TreeNode('leafB', 'leaf', 'B', 5)

  const edgeA = new Outcome('A', 0.3)
  const edgeB = new Outcome('B', 0.7)
  const edgeX = new Outcome('X', 0.5)
  const edgeY = new Outcome('Y', 0.5)

  setChild(root, edgeA, mid)
  setChild(root, edgeB, leafB)
  setChild(mid, edgeX, leafX)
  setChild(mid, edgeY, leafY)

  return { root, mid, leafX, leafY, leafB, edgeA, edgeB, edgeX, edgeY }
}

describe('backwardFill', () => {
  it('adjusts the first adjustable node and renormalizes siblings (hand-calculated)', () => {
    const { root, leafX, edgeA, edgeB } = buildTree()

    // Target P(leafX) = 0.24. First adjustable node is root.
    // product of other factors = 0.5 (edge X), so edge A must become
    // 0.24 / 0.5 = 0.48. Sibling B renormalizes to 1 − 0.48 = 0.52.
    const result = backwardFill(root, leafX, 0.24)

    expect(result.node).toBe(root)
    expect(result.edge).toBe(edgeA)
    expect(result.oldProbability).toBeCloseTo(0.3)
    expect(result.newProbability).toBeCloseTo(0.48)
    expect(edgeA.probability).toBeCloseTo(0.48)
    expect(edgeB.probability).toBeCloseTo(0.52)
    expect(result.siblings).toHaveLength(1)
    expect(result.siblings[0].oldProbability).toBeCloseTo(0.7)
    expect(result.siblings[0].newProbability).toBeCloseTo(0.52)
  })

  it('renormalizes multiple siblings proportionally', () => {
    const root = new TreeNode('root', 'outcome', 'Root')
    const a = new Outcome('A', 0.2)
    const b = new Outcome('B', 0.3)
    const c = new Outcome('C', 0.5)
    const leafA = new TreeNode('la', 'leaf', 'LA', 1)
    setChild(root, a, leafA)
    setChild(root, b, new TreeNode('lb', 'leaf', 'LB', 2))
    setChild(root, c, new TreeNode('lc', 'leaf', 'LC', 3))

    backwardFill(root, leafA, 0.6)

    // A -> 0.6; remaining 0.4 split proportionally over B:C = 0.3:0.5.
    expect(a.probability).toBeCloseTo(0.6)
    expect(b.probability).toBeCloseTo(0.15)
    expect(c.probability).toBeCloseTo(0.25)
    expect(a.probability + b.probability + c.probability).toBeCloseTo(1)
  })

  it('falls through to a deeper adjustable node when the first cannot reach the target', () => {
    const { root, mid, leafX, edgeA, edgeX, edgeY } = buildTree()

    // Target 0.27: root would need 0.27 / 0.5 = 0.54 (valid) — so root is
    // chosen first. Force root to be non-viable by targeting 0.06 with the
    // mid factor at 0.5: root would need 0.12 (valid!). To test fall-through,
    // make root single-outcome instead.
    root.children.splice(root.children.indexOf(root.children.find((e) => e.label === 'B')!), 1)
    // root now has only edge A -> not adjustable (single outcome).

    const result = backwardFill(root, leafX, 0.06)

    // Only mid is adjustable: solved = 0.06 / 0.3 = 0.2.
    expect(result.node).toBe(mid)
    expect(result.edge).toBe(edgeX)
    expect(edgeX.probability).toBeCloseTo(0.2)
    expect(edgeY.probability).toBeCloseTo(0.8)
    void edgeA
  })

  it('skips decision nodes (their edges carry no probability)', () => {
    const root = new TreeNode('root', 'decision', 'Decide')
    const mid = new TreeNode('mid', 'outcome', 'Mid')
    const leaf = new TreeNode('leaf', 'leaf', 'L', 4)
    setChild(root, new Outcome('go', NaN), mid)
    setChild(root, new Outcome('stay', NaN), new TreeNode('l2', 'leaf', 'L2', 0))
    const edgeW = new Outcome('win', 0.5)
    setChild(mid, edgeW, leaf)
    setChild(mid, new Outcome('lose', 0.5), new TreeNode('l3', 'leaf', 'L3', 0))

    const result = backwardFill(root, leaf, 0.7)

    expect(result.node).toBe(mid)
    expect(edgeW.probability).toBeCloseTo(0.7)
  })

  it('never adjusts an edge governed by a matching conditional entry', () => {
    const { root, leafX, edgeX, mid } = buildTree()
    edgeX.conditionalTable = [{ condition: new Set(['root:A']), probability: 0.5 }]

    // mid's edge X is conditional-governed on this path; root remains the
    // only adjustable candidate.
    const result = backwardFill(root, leafX, 0.24)
    expect(result.node).toBe(root)
    void mid
  })

  it('throws BackwardFillError when the target is unreachable', () => {
    const { root, leafX } = buildTree()
    // Max reachable P(leafX) by adjusting root alone: 1 × 0.5 = 0.5;
    // by adjusting mid alone: 0.3 × 1 = 0.3. Target 0.9 is impossible.
    expect(() => backwardFill(root, leafX, 0.9)).toThrow(BackwardFillError)
  })

  it('rejects a target probability outside (0, 1]', () => {
    const { root, leafX } = buildTree()
    expect(() => backwardFill(root, leafX, 0)).toThrow(BackwardFillError)
    expect(() => backwardFill(root, leafX, 1.2)).toThrow(BackwardFillError)
  })

  it('throws when the target node is not in the tree', () => {
    const { root } = buildTree()
    const stray = new TreeNode('stray', 'leaf', 'S', 1)
    expect(() => backwardFill(root, stray, 0.5)).toThrow(/not part of the tree/)
  })
})
