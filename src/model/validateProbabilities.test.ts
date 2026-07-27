import { describe, expect, it } from 'vitest'
import { addOutcome, TreeNode } from './tree'
import { ProbabilitySumError, validateProbabilities } from './validateProbabilities'

describe('validateProbabilities', () => {
  it('passes when probabilities sum to 1', () => {
    const node = new TreeNode('n1', 'chance', 'N1')
    addOutcome(node, 'A', 0.3)
    addOutcome(node, 'B', 0.7)
    expect(() => validateProbabilities(node, new Set())).not.toThrow()
  })

  it('tolerates tiny floating-point error', () => {
    const node = new TreeNode('n1', 'chance', 'N1')
    addOutcome(node, 'A', 0.1)
    addOutcome(node, 'B', 0.2)
    addOutcome(node, 'C', 0.7)
    // 0.1 + 0.2 + 0.7 !== 1 exactly in IEEE754, must still pass.
    expect(() => validateProbabilities(node, new Set())).not.toThrow()
  })

  it('throws ProbabilitySumError with the actual sum when it is wrong', () => {
    const node = new TreeNode('n1', 'chance', 'N1')
    addOutcome(node, 'A', 0.3)
    addOutcome(node, 'B', 0.3)

    let error: unknown
    try {
      validateProbabilities(node, new Set())
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(ProbabilitySumError)
    expect((error as ProbabilitySumError).nodeId).toBe('n1')
    expect((error as ProbabilitySumError).sum).toBeCloseTo(0.6)
  })

  it('does not normalize — probabilities are untouched after failed validation', () => {
    const node = new TreeNode('n1', 'chance', 'N1')
    const edge = addOutcome(node, 'A', 0.3)
    expect(() => validateProbabilities(node, new Set())).toThrow()
    expect(edge.probability).toBe(0.3)
  })

  it('validates against a matching conditional row', () => {
    const node = new TreeNode('n1', 'chance', 'N1')
    addOutcome(node, 'A', 0.5)
    addOutcome(node, 'B', 0.5)
    node.conditionalTable = [
      { condition: new Set(['up:X']), probabilities: { A: 0.9, B: 0.3 } },
    ]
    // Base sums to 1, but under the condition the row sums to 1.2.
    expect(() => validateProbabilities(node, new Set())).not.toThrow()
    expect(() => validateProbabilities(node, new Set(['up:X']))).toThrow(ProbabilitySumError)
  })

  it('is a no-op for decision nodes', () => {
    const node = new TreeNode('d1', 'decision', 'D1')
    addOutcome(node, 'A')
    expect(() => validateProbabilities(node, new Set())).not.toThrow()
  })
})
