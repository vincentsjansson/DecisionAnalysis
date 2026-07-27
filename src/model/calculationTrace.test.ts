import { describe, expect, it } from 'vitest'
import { traceNode, traceTerminalUtility } from './calculationTrace'
import { addOutcome, setChild, TreeNode } from './tree'
import type { UtilityFunction } from './utility'

const EXP: UtilityFunction = { type: 'exponential', parameter: 0.1 }

describe('traceNode — chance nodes', () => {
  it('EV mode: exact weighted-sum string', () => {
    const node = new TreeNode('c', 'chance', 'Väder')
    addOutcome(node, 'Regn', 0.3, 8)
    addOutcome(node, 'Sol', 0.7, 2)
    const trace = traceNode(node, new Set(), 'ev')
    expect(trace.ok).toBe(true)
    expect(trace.text).toBe('0.3 × 8 + 0.7 × 2 = 3.8')
  })

  it('EV mode: uses resolved conditional probabilities, not base', () => {
    const root = new TreeNode('root', 'chance', 'Root')
    const a = addOutcome(root, 'A', 1)
    const mid = new TreeNode('mid', 'chance', 'Mid')
    setChild(root, a, mid)
    addOutcome(mid, 'X', 0.5, 8)
    addOutcome(mid, 'Y', 0.5, 2)
    mid.conditionalTable = [
      { condition: new Set(['root:A']), probabilities: { X: 0.3, Y: 0.7 } },
    ]
    // Under history {root:A} the resolved probs are 0.3/0.7, not the base 0.5.
    const trace = traceNode(mid, new Set(['root:A']), 'ev')
    expect(trace.text).toBe('0.3 × 8 + 0.7 × 2 = 3.8')
  })

  it('EU mode: shows the utility weighted sum and the CE conversion', () => {
    const node = new TreeNode('c', 'chance', 'Flip')
    addOutcome(node, 'Heads', 0.5, 10)
    addOutcome(node, 'Tails', 0.5, 0)
    // u(10)=6.321, u(0)=0, EU=3.161, CE=3.799 at γ=0.1.
    const trace = traceNode(node, new Set(), 'eu', EXP)
    expect(trace.ok).toBe(true)
    expect(trace.text).toBe('EU = 0.5 × 6.321 + 0.5 × 0 = 3.161 → CE = 3.799')
  })
})

describe('traceNode — decision nodes', () => {
  it('EV mode: shows each branch value, the max, and the chosen label', () => {
    const root = new TreeNode('d', 'decision', 'Bet')
    const yes = addOutcome(root, 'Yes')
    addOutcome(root, 'No', NaN, 3)
    const flip = new TreeNode('f', 'chance', 'Flip')
    setChild(root, yes, flip)
    addOutcome(flip, 'Rain', 0.3, 8)
    addOutcome(flip, 'Sun', 0.7, 2)
    // EV(Yes) = 3.8 > EV(No) = 3, so max is 4.2 choosing Yes.
    const trace = traceNode(root, new Set(), 'ev')
    expect(trace.text).toBe('max(Yes: 3.8, No: 3) = 3.8 (välj Yes)')
  })

  it('EU mode: branch values are certainty equivalents', () => {
    const root = new TreeNode('d', 'decision', 'Bet')
    const yes = addOutcome(root, 'Yes')
    addOutcome(root, 'No', NaN, 4)
    const flip = new TreeNode('f', 'chance', 'Flip')
    setChild(root, yes, flip)
    addOutcome(flip, 'Heads', 0.5, 10)
    addOutcome(flip, 'Tails', 0.5, 0)
    // CE(Yes) = 3.799 < CE(No) = 4, so a risk-averse chooser picks No.
    const trace = traceNode(root, new Set(), 'eu', EXP)
    expect(trace.text).toBe('max(Yes: 3.799, No: 4) = 4 (välj No)')
  })
})

describe('traceNode — terminal utility & incomplete', () => {
  it('terminal utility transform in EU mode', () => {
    // u(10) at γ=0.1 = 6.321
    expect(traceTerminalUtility(10, EXP)).toEqual({ ok: true, text: 'u(10) = 6.321' })
  })

  it('terminal utility is incomplete when the payoff is unset', () => {
    expect(traceTerminalUtility(undefined, EXP).ok).toBe(false)
    expect(traceTerminalUtility(NaN, EXP).ok).toBe(false)
  })

  it('falls back to the incomplete message when a probability is unset', () => {
    const node = new TreeNode('c', 'chance', 'Flip')
    addOutcome(node, 'A', NaN, 8)
    addOutcome(node, 'B', NaN, 2)
    const trace = traceNode(node, new Set(), 'ev')
    expect(trace.ok).toBe(false)
    expect(trace.text).toMatch(/Ofullständig/)
  })

  it('falls back to the incomplete message when a payoff is unset', () => {
    const node = new TreeNode('c', 'chance', 'Flip')
    addOutcome(node, 'A', 0.5, 8)
    addOutcome(node, 'B', 0.5) // no value
    expect(traceNode(node, new Set(), 'ev').ok).toBe(false)
  })

  it('updates live when the underlying data changes', () => {
    const node = new TreeNode('c', 'chance', 'Flip')
    const a = addOutcome(node, 'A', 0.5, 8)
    addOutcome(node, 'B', 0.5, 2)
    expect(traceNode(node, new Set(), 'ev').text).toBe('0.5 × 8 + 0.5 × 2 = 5')
    a.value = 20
    expect(traceNode(node, new Set(), 'ev').text).toBe('0.5 × 20 + 0.5 × 2 = 11')
  })
})
