import { describe, expect, it } from 'vitest'
import { backwardFill, BackwardFillError } from './backwardFill'
import { addOutcome, setChild, TreeNode } from './tree'

/**
 * root (chance)
 * ├─ "A" p=0.3 -> mid (chance)
 * │               ├─ "X" p=0.5, value 10   <- target terminal outcome
 * │               └─ "Y" p=0.5, value 0
 * └─ "B" p=0.7, value 5
 *
 * Joint P(A,X) = 0.3 × 0.5 = 0.15.
 */
function buildTree() {
  const root = new TreeNode('root', 'chance', 'Root')
  const mid = new TreeNode('mid', 'chance', 'Mid')

  const edgeA = addOutcome(root, 'A', 0.3)
  const edgeB = addOutcome(root, 'B', 0.7, 5)
  setChild(root, edgeA, mid)

  const edgeX = addOutcome(mid, 'X', 0.5, 10)
  const edgeY = addOutcome(mid, 'Y', 0.5, 0)

  return { root, mid, edgeA, edgeB, edgeX, edgeY }
}

describe('backwardFill', () => {
  it('adjusts the first adjustable node and renormalizes siblings (hand-calculated)', () => {
    const { root, mid, edgeA, edgeB, edgeX } = buildTree()

    // Target P(A,X) = 0.24. First adjustable node is root; the other factor
    // on the path is 0.5, so A must become 0.24 / 0.5 = 0.48; B -> 0.52.
    const result = backwardFill(root, mid, edgeX, 0.24)

    expect(result.node).toBe(root)
    expect(result.edge).toBe(edgeA)
    expect(result.oldProbability).toBeCloseTo(0.3)
    expect(result.newProbability).toBeCloseTo(0.48)
    expect(edgeA.probability).toBeCloseTo(0.48)
    expect(edgeB.probability).toBeCloseTo(0.52)
    expect(result.siblings).toHaveLength(1)
    expect(result.siblings[0].newProbability).toBeCloseTo(0.52)
  })

  it('renormalizes multiple siblings proportionally', () => {
    const root = new TreeNode('root', 'chance', 'Root')
    const a = addOutcome(root, 'A', 0.2, 1)
    const b = addOutcome(root, 'B', 0.3, 2)
    const c = addOutcome(root, 'C', 0.5, 3)

    backwardFill(root, root, a, 0.6)

    // A -> 0.6; remaining 0.4 split proportionally over B:C = 0.3:0.5.
    expect(a.probability).toBeCloseTo(0.6)
    expect(b.probability).toBeCloseTo(0.15)
    expect(c.probability).toBeCloseTo(0.25)
  })

  it('falls through to a deeper adjustable node when the first is single-outcome', () => {
    const { root, mid, edgeB, edgeX, edgeY } = buildTree()
    // Remove B so root has a single outcome and cannot be adjusted.
    root.outcomes.splice(root.outcomes.indexOf(edgeB), 1)
    root.outcomes[0].probability = 0.3

    const result = backwardFill(root, mid, edgeX, 0.06)

    // Only mid is adjustable: solved = 0.06 / 0.3 = 0.2; Y -> 0.8.
    expect(result.node).toBe(mid)
    expect(edgeX.probability).toBeCloseTo(0.2)
    expect(edgeY.probability).toBeCloseTo(0.8)
  })

  it('skips decision nodes (their alternatives carry no probability)', () => {
    const root = new TreeNode('root', 'decision', 'Decide')
    const mid = new TreeNode('mid', 'chance', 'Mid')
    const go = addOutcome(root, 'go')
    addOutcome(root, 'stay', NaN, 0)
    setChild(root, go, mid)
    const win = addOutcome(mid, 'win', 0.5, 4)
    addOutcome(mid, 'lose', 0.5, 0)

    const result = backwardFill(root, mid, win, 0.7)

    expect(result.node).toBe(mid)
    expect(win.probability).toBeCloseTo(0.7)
  })

  it('never adjusts an outcome governed by a matching conditional row', () => {
    const { root, mid, edgeX } = buildTree()
    mid.conditionalTable = [
      { condition: new Set(['root:A']), probabilities: { X: 0.5, Y: 0.5 } },
    ]

    // mid's X is conditional-governed on this path; root stays adjustable.
    const result = backwardFill(root, mid, edgeX, 0.24)
    expect(result.node).toBe(root)
  })

  it('throws BackwardFillError when the target is unreachable', () => {
    const { root, mid, edgeX } = buildTree()
    // Max reachable: adjust root alone -> 1 × 0.5 = 0.5; mid alone -> 0.3.
    expect(() => backwardFill(root, mid, edgeX, 0.9)).toThrow(BackwardFillError)
  })

  it('rejects a target probability outside (0, 1]', () => {
    const { root, mid, edgeX } = buildTree()
    expect(() => backwardFill(root, mid, edgeX, 0)).toThrow(BackwardFillError)
    expect(() => backwardFill(root, mid, edgeX, 1.2)).toThrow(BackwardFillError)
  })

  it('throws when the target node is not in the tree', () => {
    const { root } = buildTree()
    const stray = new TreeNode('stray', 'chance', 'S')
    const strayEdge = addOutcome(stray, 'x', 1, 1)
    expect(() => backwardFill(root, stray, strayEdge, 0.5)).toThrow(/är inte del av trädet/)
  })
})
