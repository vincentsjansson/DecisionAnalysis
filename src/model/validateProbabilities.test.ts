import { describe, expect, it } from 'vitest'
import { Outcome, setChild, TreeNode } from './tree'
import { ProbabilitySumError, validateProbabilities } from './validateProbabilities'

describe('validateProbabilities', () => {
  it('passes when probabilities sum to 1', () => {
    const node = new TreeNode('n1', 'outcome', 'N1')
    setChild(node, new Outcome('A', 0.3), new TreeNode('a', 'leaf', 'A', 1))
    setChild(node, new Outcome('B', 0.7), new TreeNode('b', 'leaf', 'B', 2))

    expect(() => validateProbabilities(node, new Set())).not.toThrow()
  })

  it('tolerates tiny floating-point error', () => {
    const node = new TreeNode('n1', 'outcome', 'N1')
    setChild(node, new Outcome('A', 0.1), new TreeNode('a', 'leaf', 'A', 1))
    setChild(node, new Outcome('B', 0.2), new TreeNode('b', 'leaf', 'B', 2))
    setChild(node, new Outcome('C', 0.7), new TreeNode('c', 'leaf', 'C', 3))

    // 0.1 + 0.2 + 0.7 !== 1 exactly in IEEE754, must still pass.
    expect(() => validateProbabilities(node, new Set())).not.toThrow()
  })

  it('throws ProbabilitySumError with the actual sum when probabilities do not sum to 1', () => {
    const node = new TreeNode('n1', 'outcome', 'N1')
    setChild(node, new Outcome('A', 0.3), new TreeNode('a', 'leaf', 'A', 1))
    setChild(node, new Outcome('B', 0.3), new TreeNode('b', 'leaf', 'B', 2))

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

  it('does not normalize silently — probabilities are left untouched after a failed validation', () => {
    const node = new TreeNode('n1', 'outcome', 'N1')
    const edgeA = new Outcome('A', 0.3)
    setChild(node, edgeA, new TreeNode('a', 'leaf', 'A', 1))

    expect(() => validateProbabilities(node, new Set())).toThrow()
    expect(edgeA.probability).toBe(0.3)
  })

  it('is a no-op for non-outcome nodes', () => {
    const decision = new TreeNode('d1', 'decision', 'D1')
    setChild(decision, new Outcome('A', 0), new TreeNode('a', 'leaf', 'A', 1))
    expect(() => validateProbabilities(decision, new Set())).not.toThrow()
  })
})
