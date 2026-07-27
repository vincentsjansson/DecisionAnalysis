import { describe, expect, it } from 'vitest'
import {
  addOutcome,
  displayName,
  setChild,
  TreeNode,
} from './tree'
import {
  addOutcomeToGroup,
  collectGroup,
  createLinkedNode,
  groupSiblings,
  removeOutcomeFromGroup,
  renameOutcomeInGroup,
  renameVariable,
  unlinkNode,
  VariableConflictError,
} from './variable'

/** Root decision with two branches, each ready to hold a linked instance. */
function twoBranchRoot() {
  const root = new TreeNode('root', 'decision', 'Bet')
  const yes = addOutcome(root, 'Yes')
  const no = addOutcome(root, 'No')
  return { root, yes, no }
}

describe('createLinkedNode — auto-link and auto-name', () => {
  it('leaves an unmatched name as an independent singleton', () => {
    const { root, yes } = twoBranchRoot()
    const weather = createLinkedNode(root, 'w1', 'chance', 'Väder')
    setChild(root, yes, weather)
    expect(weather.variableId).toBe('w1')
    expect(weather.instanceIndex).toBe(0)
    expect(displayName(weather)).toBe('Väder')
  })

  it('links a second instance and primes its display name', () => {
    const { root, yes, no } = twoBranchRoot()
    const first = createLinkedNode(root, 'w1', 'chance', 'Väder')
    setChild(root, yes, first)
    addOutcome(first, 'Regn', 0.3, 8)
    addOutcome(first, 'Sol', 0.7, 2)

    const second = createLinkedNode(root, 'w2', 'chance', 'Väder')
    setChild(root, no, second)

    expect(second.variableId).toBe(first.variableId)
    expect(second.instanceIndex).toBe(1)
    expect(displayName(first)).toBe('Väder')
    expect(displayName(second)).toBe("Väder'")
    // Outcome SET copied (labels), probabilities NOT (unset on the new one).
    expect(second.outcomes.map((o) => o.label)).toEqual(['Regn', 'Sol'])
    expect(second.outcomes.every((o) => Number.isNaN(o.probability))).toBe(true)
  })

  it('primes a third instance with two marks', () => {
    const { root, yes, no } = twoBranchRoot()
    const extra = addOutcome(root, 'Maybe')
    const a = createLinkedNode(root, 'a', 'chance', 'V')
    setChild(root, yes, a)
    const b = createLinkedNode(root, 'b', 'chance', 'V')
    setChild(root, no, b)
    const c = createLinkedNode(root, 'c', 'chance', 'V')
    setChild(root, extra, c)
    expect(displayName(c)).toBe("V''")
    expect(collectGroup(root, a.variableId)).toHaveLength(3)
  })

  it('rejects a node-type mismatch within a variable group', () => {
    const { root, yes, no } = twoBranchRoot()
    const chance = createLinkedNode(root, 'w1', 'chance', 'Väder')
    setChild(root, yes, chance)
    expect(() => createLinkedNode(root, 'w2', 'decision', 'Väder')).toThrow(VariableConflictError)
    void no
  })
})

describe('outcome-set sync across a group', () => {
  function linkedPair() {
    const { root, yes, no } = twoBranchRoot()
    const a = createLinkedNode(root, 'a', 'chance', 'V')
    setChild(root, yes, a)
    const b = createLinkedNode(root, 'b', 'chance', 'V')
    setChild(root, no, b)
    return { root, a, b }
  }

  it('propagates an added outcome (label only, probability unset) to all instances', () => {
    const { root, a, b } = linkedPair()
    addOutcomeToGroup(root, a, 'X', 0.6, 9)
    expect(a.outcomes.map((o) => o.label)).toEqual(['X'])
    expect(b.outcomes.map((o) => o.label)).toEqual(['X'])
    // The editing instance keeps its probability/value; the sibling gets unset.
    expect(a.outcomes[0].probability).toBe(0.6)
    expect(Number.isNaN(b.outcomes[0].probability)).toBe(true)
  })

  it('propagates a removal to all instances and drops the conditional column', () => {
    const { root, a, b } = linkedPair()
    addOutcomeToGroup(root, a, 'X')
    addOutcomeToGroup(root, a, 'Y')
    b.conditionalTable = [{ condition: new Set(['root:Yes']), probabilities: { X: 0.4, Y: 0.6 } }]

    removeOutcomeFromGroup(root, a, a.outcomes.find((o) => o.label === 'X')!)

    expect(a.outcomes.map((o) => o.label)).toEqual(['Y'])
    expect(b.outcomes.map((o) => o.label)).toEqual(['Y'])
    expect(b.conditionalTable[0].probabilities).toEqual({ Y: 0.6 })
  })

  it('keeps probabilities independent per instance (only the set is shared)', () => {
    const { root, a, b } = linkedPair()
    addOutcomeToGroup(root, a, 'X')
    addOutcomeToGroup(root, a, 'Y')
    a.outcomes[0].probability = 0.9
    a.outcomes[1].probability = 0.1
    b.outcomes[0].probability = 0.5
    b.outcomes[1].probability = 0.5
    // Editing labels does not touch the other instance's probabilities.
    expect(a.outcomes.map((o) => o.probability)).toEqual([0.9, 0.1])
    expect(b.outcomes.map((o) => o.probability)).toEqual([0.5, 0.5])
  })
})

describe('synced outcome rename preserves conditional-table integrity', () => {
  it('rewrites conditional references across ALL instances and downstream nodes', () => {
    // root(decision) Yes->V(a), No->V(b). Each V has a downstream chance node
    // whose conditional row references its own parent instance's outcome token.
    const { root, yes, no } = twoBranchRoot()
    const a = createLinkedNode(root, 'a', 'chance', 'V')
    setChild(root, yes, a)
    const b = createLinkedNode(root, 'b', 'chance', 'V')
    setChild(root, no, b)
    addOutcomeToGroup(root, a, 'Hi')
    addOutcomeToGroup(root, a, 'Lo')

    // a's own conditional row keyed by outcome label.
    a.conditionalTable = [{ condition: new Set(['root:Yes']), probabilities: { Hi: 0.8, Lo: 0.2 } }]
    // A downstream node under a's "Hi" branch conditions on a:Hi.
    const downstream = new TreeNode('down', 'chance', 'D')
    setChild(a, a.outcomes.find((o) => o.label === 'Hi')!, downstream)
    addOutcome(downstream, 'x', 0.5, 1)
    addOutcome(downstream, 'y', 0.5, 2)
    downstream.conditionalTable = [
      { condition: new Set([`${a.id}:Hi`]), probabilities: { x: 0.9, y: 0.1 } },
    ]
    // b also has a downstream node conditioning on b:Hi.
    const downstreamB = new TreeNode('downB', 'chance', 'D')
    setChild(b, b.outcomes.find((o) => o.label === 'Hi')!, downstreamB)
    addOutcome(downstreamB, 'x', 0.5, 1)
    addOutcome(downstreamB, 'y', 0.5, 2)
    downstreamB.conditionalTable = [
      { condition: new Set([`${b.id}:Hi`]), probabilities: { x: 0.3, y: 0.7 } },
    ]

    renameOutcomeInGroup(root, a, a.outcomes.find((o) => o.label === 'Hi')!, 'High')

    // Both instances renamed.
    expect(a.outcomes.map((o) => o.label)).toEqual(['High', 'Lo'])
    expect(b.outcomes.map((o) => o.label)).toEqual(['High', 'Lo'])
    // a's own conditional row rekeyed.
    expect(a.conditionalTable[0].probabilities).toEqual({ High: 0.8, Lo: 0.2 })
    // BOTH downstream condition tokens rewritten to their own instance's id —
    // no orphaned rows.
    expect(downstream.conditionalTable[0].condition.has(`${a.id}:High`)).toBe(true)
    expect(downstream.conditionalTable[0].condition.has(`${a.id}:Hi`)).toBe(false)
    expect(downstreamB.conditionalTable[0].condition.has(`${b.id}:High`)).toBe(true)
    expect(downstreamB.conditionalTable[0].condition.has(`${b.id}:Hi`)).toBe(false)
  })

  it('rejects a synced rename that would duplicate a sibling label', () => {
    const { root, yes, no } = twoBranchRoot()
    const a = createLinkedNode(root, 'a', 'chance', 'V')
    setChild(root, yes, a)
    const b = createLinkedNode(root, 'b', 'chance', 'V')
    setChild(root, no, b)
    addOutcomeToGroup(root, a, 'X')
    addOutcomeToGroup(root, a, 'Y')
    expect(() => renameOutcomeInGroup(root, a, a.outcomes[0], 'Y')).toThrow(/unika/)
  })
})

describe('renameVariable — propagate to all instances', () => {
  it('renames the base name on every instance', () => {
    const { root, yes, no } = twoBranchRoot()
    const a = createLinkedNode(root, 'a', 'chance', 'Väder')
    setChild(root, yes, a)
    const b = createLinkedNode(root, 'b', 'chance', 'Väder')
    setChild(root, no, b)

    renameVariable(root, a, 'Klimat')
    expect(a.label).toBe('Klimat')
    expect(b.label).toBe('Klimat')
    expect(displayName(b)).toBe("Klimat'")
  })

  it('rejects renaming into a different existing variable', () => {
    const { root, yes, no } = twoBranchRoot()
    const a = createLinkedNode(root, 'a', 'chance', 'Väder')
    setChild(root, yes, a)
    const other = createLinkedNode(root, 'm', 'chance', 'Marknad')
    setChild(root, no, other)
    expect(() => renameVariable(root, a, 'Marknad')).toThrow(VariableConflictError)
  })
})

describe('unlinkNode — leave the group cleanly', () => {
  it('detaches into an independent variable and recompacts the remainder', () => {
    const { root, yes, no } = twoBranchRoot()
    const extra = addOutcome(root, 'Maybe')
    const a = createLinkedNode(root, 'a', 'chance', 'V')
    setChild(root, yes, a)
    addOutcome(a, 'X', 0.5, 1)
    addOutcome(a, 'Y', 0.5, 2)
    const b = createLinkedNode(root, 'b', 'chance', 'V')
    setChild(root, no, b)
    const c = createLinkedNode(root, 'c', 'chance', 'V')
    setChild(root, extra, c)
    // Group order: a(0), b(1), c(2).

    unlinkNode(root, b)

    // b is now its own singleton, keeping its outcomes.
    expect(b.variableId).toBe('b')
    expect(b.instanceIndex).toBe(0)
    expect(b.outcomes.map((o) => o.label)).toEqual(['X', 'Y'])
    expect(groupSiblings(root, b)).toHaveLength(0)
    // Remaining group {a, c} recompacted to 0,1 (no gap where b was).
    const remaining = collectGroup(root, a.variableId)
    expect(remaining.map((n) => n.id)).toEqual(['a', 'c'])
    expect(remaining.map((n) => n.instanceIndex)).toEqual([0, 1])
    // Once unlinked, edits no longer propagate to b.
    addOutcomeToGroup(root, a, 'Z')
    expect(a.outcomes.some((o) => o.label === 'Z')).toBe(true)
    expect(c.outcomes.some((o) => o.label === 'Z')).toBe(true)
    expect(b.outcomes.some((o) => o.label === 'Z')).toBe(false)
  })
})
