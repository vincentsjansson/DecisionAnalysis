import { describe, expect, it } from 'vitest'
import {
  AmbiguousConditionalProbabilityError,
  resolveProbability,
} from './conditionalProbability'
import { Outcome, TreeNode } from './tree'

describe('resolveProbability', () => {
  const node = new TreeNode('n1', 'outcome', 'N1')

  it('falls back to the base probability when no conditional entry matches', () => {
    const edge = new Outcome('Yes', 0.4)
    edge.conditionalTable = [{ condition: new Set(['n0:X']), probability: 0.9 }]

    expect(resolveProbability(node, edge, new Set())).toBe(0.4)
  })

  it('applies a single matching conditional entry', () => {
    const edge = new Outcome('Yes', 0.4)
    edge.conditionalTable = [{ condition: new Set(['n0:X']), probability: 0.9 }]

    expect(resolveProbability(node, edge, new Set(['n0:X']))).toBe(0.9)
  })

  it('picks the most specific (largest) matching condition', () => {
    const edge = new Outcome('Yes', 0.4)
    edge.conditionalTable = [
      { condition: new Set(['n0:X']), probability: 0.6 },
      { condition: new Set(['n0:X', 'n0:Y']), probability: 0.9 },
    ]

    expect(resolveProbability(node, edge, new Set(['n0:X', 'n0:Y', 'n0:Z']))).toBe(0.9)
  })

  it('throws AmbiguousConditionalProbabilityError on a tie between equally specific matches', () => {
    const edge = new Outcome('Yes', 0.4)
    edge.conditionalTable = [
      { condition: new Set(['n0:X']), probability: 0.6 },
      { condition: new Set(['n0:Y']), probability: 0.7 },
    ]

    expect(() => resolveProbability(node, edge, new Set(['n0:X', 'n0:Y']))).toThrow(
      AmbiguousConditionalProbabilityError,
    )
  })

  it('does not throw when a tie exists but only one member is actually a subset of history', () => {
    const edge = new Outcome('Yes', 0.4)
    edge.conditionalTable = [
      { condition: new Set(['n0:X']), probability: 0.6 },
      { condition: new Set(['n0:Y']), probability: 0.7 },
    ]

    expect(resolveProbability(node, edge, new Set(['n0:X']))).toBe(0.6)
  })
})
