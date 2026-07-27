import { describe, expect, it } from 'vitest'
import {
  AmbiguousConditionalProbabilityError,
  matchRow,
  resolveProbability,
} from './conditionalProbability'
import { addOutcome, TreeNode } from './tree'

function chanceNode() {
  const node = new TreeNode('n1', 'chance', 'N1')
  const yes = addOutcome(node, 'Yes', 0.4)
  const no = addOutcome(node, 'No', 0.6)
  return { node, yes, no }
}

describe('resolveProbability (per-node conditional rows)', () => {
  it('falls back to the base probability when no row matches', () => {
    const { node, yes } = chanceNode()
    node.conditionalTable = [
      { condition: new Set(['n0:X']), probabilities: { Yes: 0.9, No: 0.1 } },
    ]
    expect(resolveProbability(node, yes, new Set())).toBe(0.4)
  })

  it('applies a matching row to every outcome it covers', () => {
    const { node, yes, no } = chanceNode()
    node.conditionalTable = [
      { condition: new Set(['n0:X']), probabilities: { Yes: 0.9, No: 0.1 } },
    ]
    const history = new Set(['n0:X'])
    expect(resolveProbability(node, yes, history)).toBe(0.9)
    expect(resolveProbability(node, no, history)).toBe(0.1)
  })

  it('falls back to base for an outcome a matching row does not cover', () => {
    const { node, yes, no } = chanceNode()
    node.conditionalTable = [
      { condition: new Set(['n0:X']), probabilities: { Yes: 0.9 } },
    ]
    const history = new Set(['n0:X'])
    expect(resolveProbability(node, yes, history)).toBe(0.9)
    expect(resolveProbability(node, no, history)).toBe(0.6)
  })

  it('picks the most specific (largest) matching row', () => {
    const { node, yes } = chanceNode()
    node.conditionalTable = [
      { condition: new Set(['n0:X']), probabilities: { Yes: 0.6, No: 0.4 } },
      { condition: new Set(['n0:X', 'n0:Y']), probabilities: { Yes: 0.9, No: 0.1 } },
    ]
    expect(resolveProbability(node, yes, new Set(['n0:X', 'n0:Y', 'n0:Z']))).toBe(0.9)
  })

  it('throws AmbiguousConditionalProbabilityError on an equally-specific tie', () => {
    const { node } = chanceNode()
    node.conditionalTable = [
      { condition: new Set(['n0:X']), probabilities: { Yes: 0.6, No: 0.4 } },
      { condition: new Set(['n0:Y']), probabilities: { Yes: 0.7, No: 0.3 } },
    ]
    expect(() => matchRow(node, new Set(['n0:X', 'n0:Y']))).toThrow(
      AmbiguousConditionalProbabilityError,
    )
  })

  it('does not throw when only one of two same-size rows actually matches', () => {
    const { node, yes } = chanceNode()
    node.conditionalTable = [
      { condition: new Set(['n0:X']), probabilities: { Yes: 0.6, No: 0.4 } },
      { condition: new Set(['n0:Y']), probabilities: { Yes: 0.7, No: 0.3 } },
    ]
    expect(resolveProbability(node, yes, new Set(['n0:X']))).toBe(0.6)
  })
})
