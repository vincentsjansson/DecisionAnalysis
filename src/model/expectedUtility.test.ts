import { describe, expect, it } from 'vitest'
import { calculateEU, certaintyEquivalent } from './expectedUtility'
import { calculateExpectedValue } from './expectedValue'
import { addOutcome, setChild, TreeNode } from './tree'
import type { UtilityFunction } from './utility'

const LINEAR: UtilityFunction = { type: 'linear', parameter: 0 }

/** Chance node: 0.5 -> 10, 0.5 -> 0. EV = 5, variance nonzero. */
function coinFlip() {
  const node = new TreeNode('c', 'chance', 'Flip')
  addOutcome(node, 'Heads', 0.5, 10)
  addOutcome(node, 'Tails', 0.5, 0)
  return node
}

/**
 * Decision over a risky chance node vs a safe payoff:
 * Bet (decision)
 * ├─ "Yes" -> Flip(chance): Heads 0.5 -> 10, Tails 0.5 -> 0
 * └─ "No"  -> 4
 */
function decisionTree() {
  const root = new TreeNode('d', 'decision', 'Bet')
  const yes = addOutcome(root, 'Yes')
  addOutcome(root, 'No', NaN, 4)
  setChild(root, yes, coinFlip())
  return root
}

describe('calculateEU / certaintyEquivalent — core safeguard', () => {
  it('linear utility: CE equals EV everywhere (risk-neutral)', () => {
    for (const tree of [coinFlip(), decisionTree()]) {
      expect(certaintyEquivalent(tree, LINEAR)).toBeCloseTo(calculateExpectedValue(tree))
    }
  })

  it('linear utility: EU equals EV', () => {
    const tree = coinFlip()
    expect(calculateEU(tree, LINEAR)).toBeCloseTo(calculateExpectedValue(tree))
  })
})

describe('risk attitude properties', () => {
  it('risk-averse exponential (γ > 0): CE < EV', () => {
    const tree = coinFlip()
    const ev = calculateExpectedValue(tree)
    const ce = certaintyEquivalent(tree, { type: 'exponential', parameter: 0.1 })
    // Hand: u(10)=6.32121, EU=3.16060, CE=−ln(0.683940)/0.1 = 3.79885…
    expect(ce).toBeCloseTo(3.79885, 4)
    expect(ce).toBeLessThan(ev)
  })

  it('risk-seeking exponential (γ < 0): CE > EV', () => {
    const tree = coinFlip()
    const ev = calculateExpectedValue(tree)
    const ce = certaintyEquivalent(tree, { type: 'exponential', parameter: -0.1 })
    expect(ce).toBeGreaterThan(ev)
  })

  it('a sure thing has CE = EV regardless of risk attitude (zero variance)', () => {
    const node = new TreeNode('c', 'chance', 'Certain')
    addOutcome(node, 'Only', 1, 6)
    for (const fn of [
      { type: 'exponential', parameter: 0.2 },
      { type: 'exponential', parameter: -0.3 },
      { type: 'linear', parameter: 0 },
    ] as UtilityFunction[]) {
      expect(certaintyEquivalent(node, fn)).toBeCloseTo(6)
    }
  })

  it('risk aversion flips the optimal decision (safe beats fair gamble)', () => {
    // EV(Yes) = 5 > EV(No) = 4, so EV mode prefers the gamble...
    const tree = decisionTree()
    expect(calculateExpectedValue(tree)).toBeCloseTo(5)
    // ...but a risk-averse decision-maker prefers the safe 4 (CE of the
    // gamble is 3.80 < 4), so CE of the whole tree is 4.
    const ce = certaintyEquivalent(tree, { type: 'exponential', parameter: 0.1 })
    expect(ce).toBeCloseTo(4)
  })
})

describe('EU error propagation', () => {
  it('propagates NaN when a payoff is unset', () => {
    const node = new TreeNode('c', 'chance', 'Flip')
    addOutcome(node, 'Up', 0.5, 5)
    addOutcome(node, 'Down', 0.5) // no value
    expect(Number.isNaN(certaintyEquivalent(node, { type: 'exponential', parameter: 0.1 }))).toBe(
      true,
    )
  })
})
