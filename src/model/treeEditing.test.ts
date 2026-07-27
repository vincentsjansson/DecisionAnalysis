import { describe, expect, it } from 'vitest'
import { Outcome, removeChild, renameEdgeLabel, setChild, TreeNode } from './tree'

describe('removeChild', () => {
  it('detaches the edge and clears the child parent pointer', () => {
    const root = new TreeNode('root', 'outcome', 'Root')
    const child = new TreeNode('c', 'leaf', 'C', 1)
    const edge = new Outcome('x', 1)
    setChild(root, edge, child)

    removeChild(root, edge)

    expect(root.children).toHaveLength(0)
    expect(child.parent).toBeNull()
  })

  it('throws when the edge does not belong to the parent', () => {
    const root = new TreeNode('root', 'outcome', 'Root')
    expect(() => removeChild(root, new Outcome('x', 1))).toThrow(/not a child edge/)
  })
})

describe('renameEdgeLabel', () => {
  it('renames the edge and rewrites conditional tokens across the tree', () => {
    const root = new TreeNode('root', 'outcome', 'Root')
    const mid = new TreeNode('mid', 'outcome', 'Mid')
    const edgeA = new Outcome('A', 0.5)
    setChild(root, edgeA, mid)
    setChild(root, new Outcome('B', 0.5), new TreeNode('lb', 'leaf', 'LB', 0))

    const edgeX = new Outcome('X', 0.5)
    edgeX.conditionalTable = [{ condition: new Set(['root:A']), probability: 0.9 }]
    setChild(mid, edgeX, new TreeNode('lx', 'leaf', 'LX', 1))
    setChild(mid, new Outcome('Y', 0.5), new TreeNode('ly', 'leaf', 'LY', 2))

    renameEdgeLabel(root, root, edgeA, 'Regn')

    expect(edgeA.label).toBe('Regn')
    // The downstream condition that referenced root:A must follow the rename.
    expect(edgeX.conditionalTable[0].condition.has('root:Regn')).toBe(true)
    expect(edgeX.conditionalTable[0].condition.has('root:A')).toBe(false)
  })

  it('rejects a rename that would duplicate a sibling label', () => {
    const root = new TreeNode('root', 'outcome', 'Root')
    const edgeA = new Outcome('A', 0.5)
    setChild(root, edgeA, new TreeNode('la', 'leaf', 'LA', 1))
    setChild(root, new Outcome('B', 0.5), new TreeNode('lb', 'leaf', 'LB', 2))

    expect(() => renameEdgeLabel(root, root, edgeA, 'B')).toThrow(/must be unique/)
  })
})
