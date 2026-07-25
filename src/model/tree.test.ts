import { describe, expect, it } from 'vitest'
import { CyclicTreeError, Outcome, setChild, TreeNode } from './tree'

describe('TreeNode construction', () => {
  it('requires a payoff on leaf nodes', () => {
    expect(() => new TreeNode('l1', 'leaf', 'Leaf')).toThrow(/must have a payoff/)
  })

  it('rejects a payoff on non-leaf nodes', () => {
    expect(() => new TreeNode('d1', 'decision', 'Decide', 5)).toThrow(
      /Only leaf nodes may have a payoff/,
    )
  })

  it('accepts a leaf node with a payoff', () => {
    const leaf = new TreeNode('l1', 'leaf', 'Leaf', 42)
    expect(leaf.payoff).toBe(42)
    expect(leaf.children).toEqual([])
  })
})

describe('setChild', () => {
  it('attaches a child and sets its parent back-reference', () => {
    const root = new TreeNode('root', 'outcome', 'Root')
    const leaf = new TreeNode('l1', 'leaf', 'Leaf', 1)
    const edge = new Outcome('Yes', 1)

    setChild(root, edge, leaf)

    expect(root.children).toEqual([edge])
    expect(edge.child).toBe(leaf)
    expect(leaf.parent).toBe(root)
  })

  it('refuses to attach children to a leaf node', () => {
    const leaf = new TreeNode('l1', 'leaf', 'Leaf', 1)
    const other = new TreeNode('l2', 'leaf', 'Other', 2)
    expect(() => setChild(leaf, new Outcome('x', 1), other)).toThrow(
      /Cannot attach children to leaf/,
    )
  })

  it('rejects a self-loop', () => {
    const node = new TreeNode('a', 'outcome', 'A')
    expect(() => setChild(node, new Outcome('x', 1), node)).toThrow(CyclicTreeError)
  })

  it('rejects attaching an ancestor as a child (cycle)', () => {
    const grandparent = new TreeNode('gp', 'outcome', 'GP')
    const parent = new TreeNode('p', 'outcome', 'P')
    const child = new TreeNode('c', 'outcome', 'C')

    setChild(grandparent, new Outcome('to-parent', 1), parent)
    setChild(parent, new Outcome('to-child', 1), child)

    // Attaching grandparent back under child would close a cycle.
    expect(() => setChild(child, new Outcome('back-to-gp', 1), grandparent)).toThrow(
      CyclicTreeError,
    )
  })

  it('allows attaching an unrelated node as a child', () => {
    const root = new TreeNode('root', 'outcome', 'Root')
    const branchA = new TreeNode('a', 'outcome', 'A')
    const branchB = new TreeNode('b', 'leaf', 'B', 3)

    setChild(root, new Outcome('a', 0.5), branchA)
    expect(() => setChild(branchA, new Outcome('b', 1), branchB)).not.toThrow()
    expect(branchA.children[0].child).toBe(branchB)
  })
})
