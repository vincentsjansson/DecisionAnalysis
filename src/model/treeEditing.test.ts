import { describe, expect, it } from 'vitest'
import {
  addOutcome,
  detachChild,
  removeOutcome,
  renameOutcome,
  setChild,
  TreeNode,
} from './tree'

describe('removeOutcome', () => {
  it('removes the outcome, detaches its subtree, and drops its conditional column', () => {
    const node = new TreeNode('n1', 'chance', 'N1')
    const edgeA = addOutcome(node, 'A', 0.5)
    addOutcome(node, 'B', 0.5)
    const child = new TreeNode('c', 'chance', 'C')
    setChild(node, edgeA, child)
    node.conditionalTable = [
      { condition: new Set(['x:y']), probabilities: { A: 0.7, B: 0.3 } },
    ]

    removeOutcome(node, edgeA)

    expect(node.outcomes.map((o) => o.label)).toEqual(['B'])
    expect(child.parent).toBeNull()
    expect(node.conditionalTable[0].probabilities).toEqual({ B: 0.3 })
  })

  it('throws when the outcome does not belong to the node', () => {
    const node = new TreeNode('n1', 'chance', 'N1')
    const stray = addOutcome(new TreeNode('x', 'chance', 'X'), 'A')
    expect(() => removeOutcome(node, stray)).toThrow(/does not belong/)
  })
})

describe('detachChild', () => {
  it('makes the edge terminal again with the payoff unset', () => {
    const node = new TreeNode('n1', 'chance', 'N1')
    const edge = addOutcome(node, 'A')
    const child = new TreeNode('c', 'chance', 'C')
    setChild(node, edge, child)

    detachChild(edge)

    expect(edge.child).toBeNull()
    expect(child.parent).toBeNull()
    expect(edge.value).toBeUndefined()
  })
})

describe('renameOutcome', () => {
  function buildTree() {
    const root = new TreeNode('root', 'chance', 'Root')
    const edgeA = addOutcome(root, 'A', 0.5)
    addOutcome(root, 'B', 0.5)
    const mid = new TreeNode('mid', 'chance', 'Mid')
    setChild(root, edgeA, mid)
    addOutcome(mid, 'X', 0.5)
    addOutcome(mid, 'Y', 0.5)
    return { root, edgeA, mid }
  }

  it('renames and rewrites downstream condition tokens', () => {
    const { root, edgeA, mid } = buildTree()
    mid.conditionalTable = [
      { condition: new Set(['root:A']), probabilities: { X: 0.9, Y: 0.1 } },
    ]

    renameOutcome(root, root, edgeA, 'Regn')

    expect(edgeA.label).toBe('Regn')
    expect(mid.conditionalTable[0].condition.has('root:Regn')).toBe(true)
    expect(mid.conditionalTable[0].condition.has('root:A')).toBe(false)
  })

  it("rekeys the node's own conditional-row probabilities", () => {
    const { root, edgeA } = buildTree()
    root.conditionalTable = [
      { condition: new Set(['up:Z']), probabilities: { A: 0.6, B: 0.4 } },
    ]

    renameOutcome(root, root, edgeA, 'Regn')

    expect(root.conditionalTable[0].probabilities).toEqual({ Regn: 0.6, B: 0.4 })
  })

  it('rejects a rename that would duplicate a sibling label', () => {
    const { root, edgeA } = buildTree()
    expect(() => renameOutcome(root, root, edgeA, 'B')).toThrow(/must be unique/)
  })
})
