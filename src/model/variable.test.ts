import { describe, expect, it } from 'vitest'
import { reverseTreeWithBayes } from './bayesReversal'
import {
  addOutcome,
  displayName,
  setChild,
  TreeNode,
} from './tree'
import {
  addOutcomeToGroup,
  adoptGroupProbabilities,
  allNodes,
  mirrorLinkedInstances,
  collectGroup,
  createLinkedNode,
  groupSiblings,
  hasConditionalTable,
  removeOutcomeFromGroup,
  renameOutcomeInGroup,
  renameVariable,
  setNodeTypeInGroup,
  syncProbabilitiesFromNode,
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

  // DESIGN CHANGE 2026-08-02: probabilities now sync across the group by
  // default (previously independent per instance) so a tree is filled once.
  it('syncs probabilities across the group by default', () => {
    const { root, a, b } = linkedPair()
    addOutcomeToGroup(root, a, 'X')
    addOutcomeToGroup(root, a, 'Y')
    a.outcomes[0].probability = 0.9
    a.outcomes[1].probability = 0.1
    syncProbabilitiesFromNode(root, a)
    // The sibling adopts a's flat distribution (matched by label).
    expect(b.outcomes.map((o) => o.probability)).toEqual([0.9, 0.1])
  })

  it('a conditional-table instance opts out of probability sync (both directions)', () => {
    const { root, a, b } = linkedPair()
    addOutcomeToGroup(root, a, 'X')
    addOutcomeToGroup(root, a, 'Y')
    // b becomes context-driven.
    b.conditionalTable = [{ condition: new Set(['root:No']), probabilities: { X: 0.4, Y: 0.6 } }]
    b.outcomes[0].probability = 0.4
    b.outcomes[1].probability = 0.6
    expect(hasConditionalTable(b)).toBe(true)

    // a's edit must NOT overwrite b (b is table-driven)...
    a.outcomes[0].probability = 0.9
    a.outcomes[1].probability = 0.1
    syncProbabilitiesFromNode(root, a)
    expect(b.outcomes.map((o) => o.probability)).toEqual([0.4, 0.6])

    // ...and b's own edit must NOT push to a either.
    b.outcomes[0].probability = 0.2
    syncProbabilitiesFromNode(root, b)
    expect(a.outcomes.map((o) => o.probability)).toEqual([0.9, 0.1])
  })

  it('re-adopts the group distribution when a conditional table is removed', () => {
    const { root, a, b } = linkedPair()
    addOutcomeToGroup(root, a, 'X')
    addOutcomeToGroup(root, a, 'Y')
    a.outcomes[0].probability = 0.7
    a.outcomes[1].probability = 0.3
    syncProbabilitiesFromNode(root, a)
    // b diverges via a table, then drops it.
    b.conditionalTable = [{ condition: new Set(['root:No']), probabilities: { X: 0.4, Y: 0.6 } }]
    b.outcomes[0].probability = 0.4
    b.outcomes[1].probability = 0.6
    b.conditionalTable = []
    adoptGroupProbabilities(root, b)
    expect(b.outcomes.map((o) => o.probability)).toEqual([0.7, 0.3])
  })

  it('propagates a node-type change to every instance in the group', () => {
    const { root, a, b } = linkedPair()
    expect(a.nodeType).toBe('chance')
    expect(b.nodeType).toBe('chance')
    setNodeTypeInGroup(root, b, 'decision')
    expect(a.nodeType).toBe('decision')
    expect(b.nodeType).toBe('decision')
  })

  it('a node-type change does NOT touch an explicitly unlinked instance', () => {
    const { root, a, b } = linkedPair()
    unlinkNode(root, b) // b becomes its own variable
    setNodeTypeInGroup(root, a, 'decision')
    expect(a.nodeType).toBe('decision')
    expect(b.nodeType).toBe('chance') // untouched
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

describe('mirrorLinkedInstances — grow the same variable across the parent group grid', () => {
  let idn = 0
  const nextId = () => `auto${++idn}`

  /** The exact screenshot scenario: chance "test" with outcomes 1/2/3/4, a
   * "Hej" node added under outcome "1". */
  function screenshotSetup() {
    idn = 0
    const test = new TreeNode('test', 'chance', 'test')
    const e1 = addOutcome(test, '1', 0.25)
    addOutcome(test, '2', 0.25)
    addOutcome(test, '3', 0.25)
    addOutcome(test, '4', 0.25)
    // Add "Hej" (chance) under outcome "1".
    const hej = new TreeNode('hej', 'chance', 'Hej')
    setChild(test, e1, hej)
    return { test, hej }
  }

  it('fills the other three terminal outcomes with correctly-named linked instances', () => {
    const { test, hej } = screenshotSetup()
    const created = mirrorLinkedInstances(test, test, hej, nextId)

    expect(created).toHaveLength(3)
    // Every outcome of "test" now has a child; the three new ones are linked.
    const children = test.outcomes.map((o) => o.child!)
    expect(children.every((c) => c !== null)).toBe(true)
    // All four share Hej's variableId and node type.
    for (const c of children) {
      expect(c.variableId).toBe(hej.variableId)
      expect(c.nodeType).toBe('chance')
      expect(c.label).toBe('Hej')
    }
    // Display names are primed by creation order.
    expect(children.map((c) => displayName(c))).toEqual(['Hej', "Hej'", "Hej''", "Hej'''"])
  })

  it('copies the outcome set on mirror; a fresh instance starts with unset probabilities', () => {
    const { test, hej } = screenshotSetup()
    // Give Hej its own outcomes BEFORE auto-fill so the set is copied in.
    addOutcome(hej, 'a', 0.6)
    addOutcome(hej, 'b', 0.4)
    const [hej2] = mirrorLinkedInstances(test, test, hej, nextId)

    expect(hej2.outcomes.map((o) => o.label)).toEqual(['a', 'b'])
    // A freshly mirrored instance starts unset — probability *values* flow in
    // later via syncProbabilitiesFromNode when any instance is edited (the
    // instances all exist first, so one fill reaches the whole group).
    expect(hej2.outcomes.every((o) => Number.isNaN(o.probability))).toBe(true)
    syncProbabilitiesFromNode(test, hej)
    expect(hej2.outcomes.map((o) => o.probability)).toEqual([0.6, 0.4])
    // And later adding an outcome on any instance propagates to the group.
    addOutcomeToGroup(test, hej2, 'c')
    expect(hej.outcomes.some((o) => o.label === 'c')).toBe(true)
  })

  it('does not overwrite a sibling that already has its own child', () => {
    const { test, hej } = screenshotSetup()
    // Outcome "2" already has a different, unrelated subtree.
    const other = new TreeNode('other', 'decision', 'Annat')
    setChild(test, test.outcomes[1], other)

    mirrorLinkedInstances(test, test, hej, nextId)

    // Outcome "2" is untouched; only 3 and 4 got Hej instances.
    expect(test.outcomes[1].child).toBe(other)
    expect(test.outcomes[2].child!.label).toBe('Hej')
    expect(test.outcomes[3].child!.label).toBe('Hej')
  })

  it('respects a previously-unlinked sibling (non-terminal) — does not relink it', () => {
    const { test, hej } = screenshotSetup()
    mirrorLinkedInstances(test, test, hej, nextId) // fills 2,3,4 as Hej', Hej'', Hej'''
    const hej2 = test.outcomes[1].child! // the instance under outcome "2"
    unlinkNode(test, hej2) // user makes it independent

    // Later, add a brand-new node under a freshly-terminal outcome. First make
    // outcome "3" terminal again by detaching, then re-add + auto-fill.
    test.outcomes[2].child!.parent = null
    test.outcomes[2].child = null
    const fresh = new TreeNode('fresh', 'chance', 'Hej')
    // fresh links to the remaining Hej group (primary hej).
    fresh.variableId = hej.variableId
    setChild(test, test.outcomes[2], fresh)
    mirrorLinkedInstances(test, test, fresh, nextId)

    // The unlinked instance under "2" keeps its own variableId — not relinked.
    expect(hej2.variableId).toBe(hej2.id)
    expect(hej2.variableId).not.toBe(hej.variableId)
  })

  it('is a no-op when there are no other terminal siblings', () => {
    idn = 0
    const parent = new TreeNode('p', 'chance', 'P')
    const only = addOutcome(parent, 'x', 1)
    const child = new TreeNode('c', 'chance', 'C')
    setChild(parent, only, child)
    expect(mirrorLinkedInstances(parent, parent, child, nextId)).toHaveLength(0)
  })

  it('flip/VOC treats auto-filled instances as one variable (shared variableId)', () => {
    idn = 0
    // Väder (chance) Regn/Sol, decision "Åtgärd" auto-filled under both.
    const root = new TreeNode('root', 'chance', 'Väder')
    const regn = addOutcome(root, 'Regn', 0.4)
    addOutcome(root, 'Sol', 0.6)
    const act = new TreeNode('act', 'decision', 'Åtgärd')
    setChild(root, regn, act)
    const [act2] = mirrorLinkedInstances(root, root, act, nextId)
    expect(act2.variableId).toBe(act.variableId) // one variable

    // Synced outcome set (Vänta/Agera), independent payoffs per instance.
    addOutcomeToGroup(root, act, 'Vänta')
    addOutcomeToGroup(root, act, 'Agera')
    act.outcomes.find((o) => o.label === 'Vänta')!.value = 2
    act.outcomes.find((o) => o.label === 'Agera')!.value = 5
    act2.outcomes.find((o) => o.label === 'Vänta')!.value = 4
    act2.outcomes.find((o) => o.label === 'Agera')!.value = 1

    // Väder already precedes the decision (clairvoyance order) so flip is a
    // no-op: VOC = 0 with no FlipError — proving both Åtgärd instances are
    // recognized as the same variable (else it would reject as a mismatch).
    const result = reverseTreeWithBayes(root)
    expect(result.originalEv).toBeCloseTo(0.4 * 5 + 0.6 * 4) // 4.4
    expect(result.voc).toBe(0)
  })
})

describe('mirrorLinkedInstances — nested cross-instance mirroring', () => {
  let idn = 0
  const nextId = () => `x${++idn}`

  /** The screenshot setup: a chance variable "nämen" with three linked
   * instances (under a grandparent's three outcomes), each carrying outcomes
   * 1/2/3, then a child "okej" attached under nämen's outcome "1". Returns the
   * root, the three nämen instances, and the just-attached okej. */
  function namenSetup() {
    idn = 0
    const root = new TreeNode('G', 'chance', 'G')
    const g1 = addOutcome(root, 'gA')
    addOutcome(root, 'gB')
    addOutcome(root, 'gC')
    const namen = new TreeNode('namen', 'chance', 'nämen')
    setChild(root, g1, namen)
    // Grow the nämen group across the grandparent's other outcomes.
    const [namen2, namen3] = mirrorLinkedInstances(root, root, namen, nextId)
    // Give the nämen variable outcomes 1/2/3 (synced across all instances).
    addOutcomeToGroup(root, namen, '1')
    addOutcomeToGroup(root, namen, '2')
    addOutcomeToGroup(root, namen, '3')
    // Attach "okej" under nämen's outcome "1".
    const okej = new TreeNode('okej', 'chance', 'okej')
    setChild(namen, namen.outcomes.find((o) => o.label === '1')!, okej)
    return { root, namen, namen2, namen3, okej }
  }

  it('mirrors "okej" across the full nämen × outcome grid as one linked group', () => {
    const { root, namen, namen2, namen3, okej } = namenSetup()
    const created = mirrorLinkedInstances(root, namen, okej, nextId)

    // 3 nämen instances × 3 outcomes = 9 okej positions, minus the original = 8.
    expect(created).toHaveLength(8)

    // Every (nämen-instance × outcome) position now holds an okej instance,
    // and every one shares okej's variableId, type, and base label.
    for (const namenInstance of [namen, namen2, namen3]) {
      for (const label of ['1', '2', '3']) {
        const child = namenInstance.outcomes.find((o) => o.label === label)!.child
        expect(child).not.toBeNull()
        expect(child!.variableId).toBe(okej.variableId)
        expect(child!.nodeType).toBe('chance')
        expect(child!.label).toBe('okej')
      }
    }
    // One group of nine with contiguous prime indices.
    const okejGroup = collectGroup(root, okej.variableId)
    expect(okejGroup).toHaveLength(9)
    expect(okejGroup.map((n) => n.instanceIndex)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    expect(displayName(okejGroup[0])).toBe('okej')
    expect(displayName(okejGroup[1])).toBe("okej'")
    // The nämen group itself is untouched (still three instances).
    expect(collectGroup(root, namen.variableId)).toHaveLength(3)
  })

  it('syncs both the outcome set and probabilities across all nine okej instances', () => {
    const { root, namen, namen2, okej } = namenSetup()
    mirrorLinkedInstances(root, namen, okej, nextId)

    // Add an outcome on one okej instance -> propagates to all nine.
    addOutcomeToGroup(root, okej, 'a')
    addOutcomeToGroup(root, okej, 'b')
    for (const n of collectGroup(root, okej.variableId)) {
      expect(n.outcomes.map((o) => o.label)).toEqual(['a', 'b'])
    }
    // Fill probabilities once on any instance -> the whole nested group adopts them.
    okej.outcomes[0].probability = 0.9
    okej.outcomes[1].probability = 0.1
    syncProbabilitiesFromNode(root, okej)
    const other = namen2.outcomes.find((o) => o.label === '1')!.child!
    expect(other.outcomes.map((o) => o.probability)).toEqual([0.9, 0.1])
  })

  it('does not overwrite a diverged branch when mirroring (no-overwrite at depth)', () => {
    const { root, namen, namen2, okej } = namenSetup()
    // Before mirroring okej, build a DIFFERENT structure under nämen':1.
    const jaha = new TreeNode('jaha', 'decision', 'jahå')
    setChild(namen2, namen2.outcomes.find((o) => o.label === '1')!, jaha)

    mirrorLinkedInstances(root, namen, okej, nextId)

    // nämen':1 keeps "jahå" — not clobbered by the okej mirror.
    expect(namen2.outcomes.find((o) => o.label === '1')!.child).toBe(jaha)
    // The other nämen':2 / nämen':3 positions still got okej instances.
    expect(namen2.outcomes.find((o) => o.label === '2')!.child!.label).toBe('okej')
  })

  it('granular unlink at depth frees only that branch, leaving parents and siblings intact', () => {
    const { root, namen, namen2, okej } = namenSetup()
    mirrorLinkedInstances(root, namen, okej, nextId)
    const okejVar = okej.variableId

    // Unlink the nested okej instance under nämen':1.
    const nested = namen2.outcomes.find((o) => o.label === '1')!.child!
    unlinkNode(root, nested)

    // The nested one is now its own independent variable.
    expect(nested.variableId).toBe(nested.id)
    expect(collectGroup(root, nested.variableId)).toHaveLength(1)
    // nämen' is unaffected — still linked to nämen/nämen''.
    expect(namen2.variableId).toBe(namen.variableId)
    expect(collectGroup(root, namen.variableId)).toHaveLength(3)
    // okej and the remaining seven are still one group (nine minus the freed one).
    expect(collectGroup(root, okejVar)).toHaveLength(8)
    expect(okej.variableId).toBe(okejVar)
    // Editing the okej group no longer reaches the unlinked branch.
    addOutcomeToGroup(root, okej, 'z')
    expect(nested.outcomes.some((o) => o.label === 'z')).toBe(false)
    expect(collectGroup(root, okejVar).every((n) => n.outcomes.some((o) => o.label === 'z'))).toBe(
      true,
    )
  })

  it('composes through depth: a third level mirrors across the whole grid', () => {
    const { root, namen, okej } = namenSetup()
    mirrorLinkedInstances(root, namen, okej, nextId) // level 2 grid: 9 okej

    // Give okej outcomes p/q (synced across all nine), then add a third-level
    // node "foo" under okej's outcome "p".
    addOutcomeToGroup(root, okej, 'p')
    addOutcomeToGroup(root, okej, 'q')
    const foo = new TreeNode('foo', 'chance', 'foo')
    setChild(okej, okej.outcomes.find((o) => o.label === 'p')!, foo)
    const created = mirrorLinkedInstances(root, okej, foo, nextId)

    // okej group = 9 instances × 2 outcomes = 18 foo positions, minus original.
    expect(created).toHaveLength(17)
    const fooGroup = collectGroup(root, foo.variableId)
    expect(fooGroup).toHaveLength(18)
    // Every okej instance has a foo under both p and q.
    for (const okejInstance of collectGroup(root, okej.variableId)) {
      for (const label of ['p', 'q']) {
        expect(okejInstance.outcomes.find((o) => o.label === label)!.child!.label).toBe('foo')
      }
    }
  })

  it('flip/VOC treats a nested linked group identically (variableId-based, no bayesReversal change)', () => {
    // Root chance "Väder"(Regn/Sol) -> decision "Bet"(Ja/Nej) mirrored across
    // both; under Bet's "Ja" a chance "Utfall"(Vinst/Förlust) mirrored across
    // all Bet instances. Deeply nested linked groups must flip without error.
    idn = 0
    const root = new TreeNode('root', 'chance', 'Väder')
    const regn = addOutcome(root, 'Regn', 0.5)
    addOutcome(root, 'Sol', 0.5)
    const bet = new TreeNode('bet', 'decision', 'Bet')
    setChild(root, regn, bet)
    mirrorLinkedInstances(root, root, bet, nextId) // Bet' under Sol
    addOutcomeToGroup(root, bet, 'Ja')
    addOutcomeToGroup(root, bet, 'Nej')
    // "Nej" terminates with a payoff on each Bet instance.
    for (const b of collectGroup(root, bet.variableId)) {
      b.outcomes.find((o) => o.label === 'Nej')!.value = 3
    }
    // Chance "Utfall" under Bet:Ja, mirrored across both Bet instances.
    const utfall = new TreeNode('utf', 'chance', 'Utfall')
    setChild(bet, bet.outcomes.find((o) => o.label === 'Ja')!, utfall)
    mirrorLinkedInstances(root, bet, utfall, nextId)
    addOutcomeToGroup(root, utfall, 'Vinst')
    addOutcomeToGroup(root, utfall, 'Förlust')
    // Fill terminal payoffs + probabilities on every Utfall instance.
    for (const u of collectGroup(root, utfall.variableId)) {
      const v = u.outcomes.find((o) => o.label === 'Vinst')!
      const f = u.outcomes.find((o) => o.label === 'Förlust')!
      v.probability = 0.6
      v.value = 10
      f.probability = 0.4
      f.value = 0
    }

    // Väder (chance) already precedes the Bet decision, so flip is a no-op:
    // VOC = 0, no FlipError — the nested Utfall/Bet linked groups are each
    // recognized as one variable by their shared variableId.
    const result = reverseTreeWithBayes(root)
    expect(Number.isFinite(result.originalEv)).toBe(true)
    expect(result.voc).toBe(0)
  })

  it('is a bounded single pass on a deep tree (no unbounded cascade, no hang)', () => {
    idn = 0
    const root = new TreeNode('r', 'chance', 'V0')
    addOutcome(root, 'a')
    addOutcome(root, 'b')
    // Build 5 nested levels, each: attach a chance node under the current
    // level's first outcome, mirror across the grid, then give it two outcomes.
    let level: TreeNode = root
    const start = Date.now()
    for (let depth = 1; depth <= 5; depth++) {
      const child = new TreeNode(`v${depth}`, 'chance', `V${depth}`)
      setChild(level, level.outcomes.find((o) => o.child === null)!, child)
      mirrorLinkedInstances(root, level, child, nextId)
      addOutcome(child, 'a')
      addOutcomeToGroup(root, child, 'b')
      level = child
    }
    const elapsed = Date.now() - start
    // Must finish quickly (well under a second) and produce a finite structure.
    expect(elapsed).toBeLessThan(1000)
    // Node count is bounded (2^depth-ish per level), not infinite.
    expect(allNodes(root).length).toBeLessThan(500)
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
