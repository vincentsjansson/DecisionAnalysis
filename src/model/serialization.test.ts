import { describe, expect, it } from 'vitest'
import { calculateExpectedValue } from './expectedValue'
import { deserializeTree, serializeTree } from './serialization'
import { Outcome, setChild, TreeNode } from './tree'

function buildTree() {
  const root = new TreeNode('root', 'outcome', 'Root')
  const leafA = new TreeNode('leafA', 'leaf', 'A', 8)
  const child = new TreeNode('child', 'outcome', 'Child')
  const leafX = new TreeNode('leafX', 'leaf', 'X', 3)
  const leafY = new TreeNode('leafY', 'leaf', 'Y', 5)

  const edgeToA = new Outcome('A', 0.5)
  edgeToA.conditionalTable = [
    { condition: new Set(['root:A']), probability: 0.9 },
    { condition: new Set(['root:A', 'root:B']), probability: 0.4 },
  ]
  setChild(root, edgeToA, leafA)
  setChild(root, new Outcome('B', 0.5), child)
  setChild(child, new Outcome('X', 0.3), leafX)
  setChild(child, new Outcome('Y', 0.7), leafY)

  return root
}

describe('serializeTree / deserializeTree', () => {
  it('produces plain JSON-safe output with snake_case fields', () => {
    const root = buildTree()
    const serialized = serializeTree(root)

    // No Sets or other non-JSON-safe values should remain.
    expect(() => JSON.stringify(serialized)).not.toThrow()

    expect(serialized.node_type).toBe('outcome')
    const edgeToA = serialized.children.find((c) => c.label === 'A')!
    expect(edgeToA.conditional_tables).toEqual([
      { condition: ['root:A'], probability: 0.9 },
      { condition: ['root:A', 'root:B'], probability: 0.4 },
    ])
  })

  it('round-trips through JSON with an identical structure', () => {
    const root = buildTree()
    const json = JSON.stringify(serializeTree(root))
    const restored = deserializeTree(JSON.parse(json))

    expect(serializeTree(restored)).toEqual(serializeTree(root))
  })

  it('round-trips EV and conditional-table behavior, not just shape', () => {
    const root = buildTree()
    const restored = deserializeTree(JSON.parse(JSON.stringify(serializeTree(root))))

    expect(calculateExpectedValue(restored)).toBeCloseTo(calculateExpectedValue(root))

    const originalEdge = root.children.find((c) => c.label === 'A')!
    const restoredEdge = restored.children.find((c) => c.label === 'A')!
    expect(restoredEdge.conditionalTable).toHaveLength(originalEdge.conditionalTable.length)
    expect([...restoredEdge.conditionalTable[0].condition]).toEqual(
      [...originalEdge.conditionalTable[0].condition],
    )
  })

  it('preserves leaf payoffs and omits payoff on non-leaf nodes', () => {
    const root = buildTree()
    const serialized = serializeTree(root)
    expect(serialized.payoff).toBeUndefined()

    const leafSerialized = serialized.children
      .find((c) => c.label === 'A')!
      .child!
    expect(leafSerialized.payoff).toBe(8)
  })

  it('restores parent back-references usable by setChild cycle checks', () => {
    const root = buildTree()
    const restored = deserializeTree(JSON.parse(JSON.stringify(serializeTree(root))))
    const restoredChild = restored.children.find((c) => c.label === 'B')!.child!
    expect(restoredChild.parent).toBe(restored)
  })
})
