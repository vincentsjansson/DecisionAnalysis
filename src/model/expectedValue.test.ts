import { describe, expect, it } from 'vitest'
import { calculateExpectedValue } from './expectedValue'
import { Outcome, setChild, TreeNode } from './tree'

/**
 * Tree under test:
 *
 * root (decision)
 * ├─ "A" -> oa (outcome)
 * │         ├─ "X" p=0.5 -> leafX (leaf, payoff 20)
 * │         └─ "Y" p=0.5 -> ob (outcome)
 * │                          ├─ "P" p=0.25 -> leafP (leaf, payoff 100)
 * │                          └─ "Q" p=0.75 -> leafQ (leaf, payoff 0)
 * └─ "B" -> leafB (leaf, payoff 10)
 *
 * Hand calculation:
 *   EV(ob)   = 0.25*100 + 0.75*0   = 25
 *   EV(oa)   = 0.5*20 + 0.5*25     = 22.5
 *   EV(root) = max(EV(oa), EV(leafB)) = max(22.5, 10) = 22.5
 */
function buildTree() {
  const root = new TreeNode('root', 'decision', 'Root')
  const oa = new TreeNode('oa', 'outcome', 'OA')
  const ob = new TreeNode('ob', 'outcome', 'OB')
  const leafX = new TreeNode('leafX', 'leaf', 'X', 20)
  const leafP = new TreeNode('leafP', 'leaf', 'P', 100)
  const leafQ = new TreeNode('leafQ', 'leaf', 'Q', 0)
  const leafB = new TreeNode('leafB', 'leaf', 'B', 10)

  setChild(root, new Outcome('A', 1), oa)
  setChild(root, new Outcome('B', 1), leafB)
  setChild(oa, new Outcome('X', 0.5), leafX)
  setChild(oa, new Outcome('Y', 0.5), ob)
  setChild(ob, new Outcome('P', 0.25), leafP)
  setChild(ob, new Outcome('Q', 0.75), leafQ)

  return { root, oa, ob, leafX, leafP, leafQ, leafB }
}

describe('calculateExpectedValue', () => {
  it('returns the payoff for a leaf', () => {
    const { leafB } = buildTree()
    expect(calculateExpectedValue(leafB)).toBe(10)
  })

  it('computes the weighted average for an outcome node', () => {
    const { ob } = buildTree()
    expect(calculateExpectedValue(ob)).toBeCloseTo(25)
  })

  it('propagates correctly through a nested outcome node', () => {
    const { oa } = buildTree()
    expect(calculateExpectedValue(oa)).toBeCloseTo(22.5)
  })

  it('computes the max over children for a decision node', () => {
    const { root } = buildTree()
    expect(calculateExpectedValue(root)).toBeCloseTo(22.5)
  })

  it('picks the other branch when it becomes the better one', () => {
    const { root, leafB } = buildTree()
    leafB.payoff = 999
    expect(calculateExpectedValue(root)).toBeCloseTo(999)
  })

  it('throws for a non-leaf node with no children', () => {
    const empty = new TreeNode('empty', 'decision', 'Empty')
    expect(() => calculateExpectedValue(empty)).toThrow(/no children/)
  })
})
