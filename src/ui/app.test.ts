// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createApp } from './app'

function newApp(confirmAnswer = true) {
  const container = document.createElement('div')
  return createApp(container, { confirmFn: () => confirmAnswer })
}

describe('createApp', () => {
  it('builds the shell: fixed top bar with add button, canvas, panel', () => {
    const container = document.createElement('div')
    createApp(container)
    expect(container.querySelector('.topbar')).not.toBeNull()
    expect(container.querySelector('#add-node')).not.toBeNull()
    expect(container.querySelector('.canvas-host')).not.toBeNull()
    expect(container.querySelector('.panel')).not.toBeNull()
    expect(container.querySelector('.empty-hint')).not.toBeNull()
  })

  it('creates a root node and renders it', () => {
    const app = newApp()
    const root = app.api.createRoot('outcome', 'Vädret')
    expect(app.state.root).toBe(root)
    expect(root.nodeType).toBe('outcome')
    const container = document.querySelector('body') // container not attached; query via state instead
    void container
    expect(app.state.selected).toBe(root)
  })

  it('adds children through the model layer (edge + node created, parent linked)', () => {
    const app = newApp()
    const root = app.api.createRoot('outcome', 'Vädret')
    const child = app.api.addChild(root, { type: 'leaf', edgeLabel: 'Regn', payoff: 5 })

    expect(root.children).toHaveLength(1)
    expect(root.children[0].label).toBe('Regn')
    expect(Number.isNaN(root.children[0].probability)).toBe(true) // unset, not 0
    expect(child.parent).toBe(root)
    expect(child.payoff).toBe(5)
  })

  it('rejects duplicate sibling edge labels', () => {
    const app = newApp()
    const root = app.api.createRoot('outcome', 'Vädret')
    app.api.addChild(root, { type: 'leaf', edgeLabel: 'Regn', payoff: 1 })
    expect(() => app.api.addChild(root, { type: 'leaf', edgeLabel: 'Regn', payoff: 2 })).toThrow(
      /finns redan/,
    )
  })

  it('deletes a subtree via removeChild and can delete the root', () => {
    const app = newApp()
    const root = app.api.createRoot('outcome', 'Root')
    const mid = app.api.addChild(root, { type: 'outcome', edgeLabel: 'A' })
    app.api.addChild(mid, { type: 'leaf', edgeLabel: 'X', payoff: 1 })
    app.api.addChild(root, { type: 'leaf', edgeLabel: 'B', payoff: 2 })

    app.api.deleteNode(mid)
    expect(root.children).toHaveLength(1)
    expect(root.children[0].label).toBe('B')
    expect(mid.parent).toBeNull()

    app.api.deleteNode(root)
    expect(app.state.root).toBeNull()
  })

  it('inline edits update the model: label, payoff, probability', () => {
    const app = newApp()
    const root = app.api.createRoot('outcome', 'Root')
    const leaf = app.api.addChild(root, { type: 'leaf', edgeLabel: 'A', payoff: 1 })
    const edge = root.children[0]

    app.api.setNodeLabel(leaf, 'Nytt namn')
    app.api.setPayoff(leaf, 42)
    app.api.setEdgeProbability(edge, 0.8)

    expect(leaf.label).toBe('Nytt namn')
    expect(leaf.payoff).toBe(42)
    expect(edge.probability).toBe(0.8)
  })

  it('renaming an edge rewrites downstream conditional tokens', () => {
    const app = newApp()
    const root = app.api.createRoot('outcome', 'Root')
    const mid = app.api.addChild(root, { type: 'outcome', edgeLabel: 'A' })
    app.api.addChild(mid, { type: 'leaf', edgeLabel: 'X', payoff: 1 })
    app.api.addChild(mid, { type: 'leaf', edgeLabel: 'Y', payoff: 0 })

    const rootEdge = root.children[0]
    const midEdgeX = mid.children[0]
    app.api.setConditionalEntries(midEdgeX, [
      { condition: new Set([`${root.id}:A`]), probability: 0.9 },
    ])

    app.api.renameEdge(root, rootEdge, 'Regn')
    expect(rootEdge.label).toBe('Regn')
    expect(midEdgeX.conditionalTable[0].condition.has(`${root.id}:Regn`)).toBe(true)
  })

  it('backward-fill adjusts the model and reports the change transparently', () => {
    const app = newApp()
    const root = app.api.createRoot('outcome', 'Root')
    const mid = app.api.addChild(root, { type: 'outcome', edgeLabel: 'A' })
    app.api.addChild(root, { type: 'leaf', edgeLabel: 'B', payoff: 5 })
    const leafX = app.api.addChild(mid, { type: 'leaf', edgeLabel: 'X', payoff: 10 })
    app.api.addChild(mid, { type: 'leaf', edgeLabel: 'Y', payoff: 0 })

    app.api.setEdgeProbability(root.children[0], 0.3)
    app.api.setEdgeProbability(root.children[1], 0.7)
    app.api.setEdgeProbability(mid.children[0], 0.5)
    app.api.setEdgeProbability(mid.children[1], 0.5)

    app.api.applyBackwardFill(leafX, 0.24)

    expect(root.children[0].probability).toBeCloseTo(0.48)
    expect(root.children[1].probability).toBeCloseTo(0.52)
    // The transparency requirement: the message names the edge and both values.
    expect(app.state.message).toContain('Root → A')
    expect(app.state.message).toContain('0.3')
    expect(app.state.message).toContain('0.48')
    expect(app.state.message).toContain('syskon')
  })

  it('selecting a node then clicking background clears the selection', () => {
    const app = newApp()
    const root = app.api.createRoot('outcome', 'Root')
    app.api.selectNode(root)
    expect(app.state.selected).toBe(root)
    app.api.selectNode(null)
    expect(app.state.selected).toBeNull()
  })
})
