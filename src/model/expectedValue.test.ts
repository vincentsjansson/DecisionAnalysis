import { describe, expect, it } from 'vitest'
import { calculateExpectedValue } from './expectedValue'
import { addOutcome, setChild, TreeNode } from './tree'

/**
 * root (decision)
 * ├─ "A" -> oa (chance)
 * │         ├─ "X" p=0.5, value 20
 * │         └─ "Y" p=0.5 -> ob (chance)
 * │                          ├─ "P" p=0.25, value 100
 * │                          └─ "Q" p=0.75, value 0
 * └─ "B" value 10
 *
 * Hand calculation:
 *   EV(ob)   = 0.25·100 + 0.75·0   = 25
 *   EV(oa)   = 0.5·20 + 0.5·25    = 22.5
 *   EV(root) = max(EV(oa), 10)    = 22.5
 */
function buildTree() {
  const root = new TreeNode('root', 'decision', 'Root')
  const oa = new TreeNode('oa', 'chance', 'OA')
  const ob = new TreeNode('ob', 'chance', 'OB')

  const edgeA = addOutcome(root, 'A')
  const edgeB = addOutcome(root, 'B', NaN, 10)
  setChild(root, edgeA, oa)

  addOutcome(oa, 'X', 0.5, 20)
  const edgeY = addOutcome(oa, 'Y', 0.5)
  setChild(oa, edgeY, ob)

  addOutcome(ob, 'P', 0.25, 100)
  addOutcome(ob, 'Q', 0.75, 0)

  return { root, oa, ob, edgeB }
}

describe('calculateExpectedValue', () => {
  it('computes the weighted average for a chance node with terminal outcomes', () => {
    const { ob } = buildTree()
    expect(calculateExpectedValue(ob)).toBeCloseTo(25)
  })

  it('propagates through nested chance nodes', () => {
    const { oa } = buildTree()
    expect(calculateExpectedValue(oa)).toBeCloseTo(22.5)
  })

  it('takes the max over alternatives for a decision node', () => {
    const { root } = buildTree()
    expect(calculateExpectedValue(root)).toBeCloseTo(22.5)
  })

  it('picks the other alternative when it becomes the better one', () => {
    const { root, edgeB } = buildTree()
    edgeB.value = 999
    expect(calculateExpectedValue(root)).toBeCloseTo(999)
  })

  it('applies conditional rows via the path history', () => {
    // root (chance) -A-> mid (chance), mid's distribution depends on root:A.
    const root = new TreeNode('root', 'chance', 'Root')
    const mid = new TreeNode('mid', 'chance', 'Mid')
    const edgeA = addOutcome(root, 'A', 1)
    setChild(root, edgeA, mid)
    addOutcome(mid, 'X', 0.5, 10)
    addOutcome(mid, 'Y', 0.5, 0)
    mid.conditionalTable = [
      { condition: new Set(['root:A']), probabilities: { X: 0.9, Y: 0.1 } },
    ]
    // Via root, history contains root:A => EV(mid|A) = 0.9·10 = 9.
    expect(calculateExpectedValue(root)).toBeCloseTo(9)
    // Standalone, no history => base 0.5/0.5 => 5.
    expect(calculateExpectedValue(mid)).toBeCloseTo(5)
  })

  it('returns NaN when a terminal value is unset (never fabricates)', () => {
    const node = new TreeNode('n', 'chance', 'N')
    addOutcome(node, 'A', 0.5, 10)
    addOutcome(node, 'B', 0.5) // no value
    expect(Number.isNaN(calculateExpectedValue(node))).toBe(true)
  })

  it('throws for a node with no outcomes', () => {
    const empty = new TreeNode('empty', 'decision', 'Empty')
    expect(() => calculateExpectedValue(empty)).toThrow(/no outcomes/)
  })
})
