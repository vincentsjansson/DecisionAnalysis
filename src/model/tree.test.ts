import { describe, expect, it } from 'vitest'
import {
  addOutcome,
  branchLabel,
  CyclicTreeError,
  setChild,
  TreeNode,
} from './tree'

describe('addOutcome', () => {
  it('adds outcomes with unset probability by default', () => {
    const node = new TreeNode('n1', 'chance', 'Väder')
    const edge = addOutcome(node, 'Regn')
    expect(node.outcomes).toEqual([edge])
    expect(Number.isNaN(edge.probability)).toBe(true)
    expect(edge.child).toBeNull()
    expect(edge.value).toBeUndefined()
  })

  it('accepts probability and terminal value', () => {
    const node = new TreeNode('n1', 'chance', 'Väder')
    const edge = addOutcome(node, 'Regn', 0.3, 8)
    expect(edge.probability).toBe(0.3)
    expect(edge.value).toBe(8)
  })

  it('rejects duplicate sibling labels (branch tokens must be unique)', () => {
    const node = new TreeNode('n1', 'chance', 'Väder')
    addOutcome(node, 'Regn')
    expect(() => addOutcome(node, 'Regn')).toThrow(/already has an outcome/)
  })
})

describe('setChild', () => {
  it('attaches a child, sets the parent pointer, and clears the terminal value', () => {
    const parent = new TreeNode('p', 'chance', 'P')
    const edge = addOutcome(parent, 'A', 0.5, 99)
    const child = new TreeNode('c', 'chance', 'C')

    setChild(parent, edge, child)

    expect(edge.child).toBe(child)
    expect(child.parent).toBe(parent)
    expect(edge.value).toBeUndefined()
  })

  it('rejects an edge that does not belong to the parent', () => {
    const parent = new TreeNode('p', 'chance', 'P')
    const stray = addOutcome(new TreeNode('x', 'chance', 'X'), 'A')
    expect(() => setChild(parent, stray, new TreeNode('c', 'chance', 'C'))).toThrow(
      /does not belong/,
    )
  })

  it('rejects attaching to an edge that already has a child', () => {
    const parent = new TreeNode('p', 'chance', 'P')
    const edge = addOutcome(parent, 'A')
    setChild(parent, edge, new TreeNode('c1', 'chance', 'C1'))
    expect(() => setChild(parent, edge, new TreeNode('c2', 'chance', 'C2'))).toThrow(
      /already has a child/,
    )
  })

  it('rejects a self-loop and ancestor cycles', () => {
    const grandparent = new TreeNode('gp', 'chance', 'GP')
    const parent = new TreeNode('p', 'chance', 'P')
    const gpEdge = addOutcome(grandparent, 'down')
    setChild(grandparent, gpEdge, parent)

    const selfEdge = addOutcome(parent, 'self')
    expect(() => setChild(parent, selfEdge, parent)).toThrow(CyclicTreeError)

    const backEdge = addOutcome(parent, 'back')
    expect(() => setChild(parent, backEdge, grandparent)).toThrow(CyclicTreeError)
  })
})

describe('branchLabel', () => {
  it('namespaces by node id', () => {
    const node = new TreeNode('n7', 'chance', 'Väder')
    expect(branchLabel(node, 'Regn')).toBe('n7:Regn')
  })
})
