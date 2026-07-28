import { describe, expect, it } from 'vitest'
import {
  deserializeDocument,
  documentFilename,
  documentToJson,
  serializeDocument,
} from './document'
import type { DecisionDocument } from './document'
import { serializeTree } from './serialization'
import { addOutcome, setChild, TreeNode } from './tree'
import { addOutcomeToGroup, autoFillLinkedSiblings } from './variable'
import type { UtilityFunction } from './utility'

function roundTrip(doc: DecisionDocument): DecisionDocument {
  return deserializeDocument(documentToJson(doc))
}

describe('document round-trip', () => {
  it('round-trips a simple tree with display/utility settings', () => {
    const root = new TreeNode('n1', 'chance', 'Väder')
    addOutcome(root, 'Regn', 0.3, 8)
    addOutcome(root, 'Sol', 0.7, 2)
    const doc: DecisionDocument = {
      tree: root,
      displayMode: 'eu',
      utility: { type: 'exponential', parameter: 0.1 },
      idCounter: 1,
    }
    const restored = roundTrip(doc)
    expect(restored.displayMode).toBe('eu')
    expect(restored.utility).toEqual<UtilityFunction>({ type: 'exponential', parameter: 0.1 })
    // Tree identity preserved.
    expect(serializeTree(restored.tree!)).toEqual(serializeTree(root))
  })

  it('round-trips the complex case: linked variables + conditional tables + EU', () => {
    // Chance "test" 1/2/3, auto-fill "Hej" across all three (linked instances),
    // give Hej a conditional table, and use EU settings.
    let counter = 3
    const nextId = () => `n${++counter}`
    const test = new TreeNode('n1', 'chance', 'test')
    const e1 = addOutcome(test, '1', 0.5)
    addOutcome(test, '2', 0.3)
    addOutcome(test, '3', 0.2)
    const hej = new TreeNode('n2', 'chance', 'Hej')
    setChild(test, e1, hej)
    const filled = autoFillLinkedSiblings(test, test, hej, nextId)
    expect(filled).toHaveLength(2)
    // Synced outcome set on the whole Hej group.
    addOutcomeToGroup(test, hej, 'a')
    addOutcomeToGroup(test, hej, 'b')
    // Independent probabilities + a conditional table on the primary Hej only.
    hej.outcomes[0].probability = 0.6
    hej.outcomes[1].probability = 0.4
    hej.conditionalTable = [
      { condition: new Set(['n1:1']), probabilities: { a: 0.9, b: 0.1 } },
    ]

    const doc: DecisionDocument = {
      tree: test,
      displayMode: 'eu',
      utility: { type: 'exponential', parameter: 0.25 },
      idCounter: counter,
    }
    const restored = roundTrip(doc)

    // Exact structural identity (ids, variableId groupings, instance indices,
    // conditional tables, probabilities) via serialize-equality.
    expect(serializeTree(restored.tree!)).toEqual(serializeTree(test))
    expect(restored.utility).toEqual<UtilityFunction>({ type: 'exponential', parameter: 0.25 })

    // Variable grouping survived: the three Hej instances share one variableId
    // with contiguous prime indices, distinct from "test".
    const nodes = collect(restored.tree!)
    const hejGroup = nodes.filter((n) => n.label === 'Hej')
    expect(hejGroup).toHaveLength(3)
    expect(new Set(hejGroup.map((n) => n.variableId)).size).toBe(1)
    expect(hejGroup.map((n) => n.instanceIndex).sort()).toEqual([0, 1, 2])
    // Conditional table preserved on the primary.
    const primary = hejGroup.find((n) => n.instanceIndex === 0)!
    expect(primary.conditionalTable[0].probabilities).toEqual({ a: 0.9, b: 0.1 })
    expect([...primary.conditionalTable[0].condition]).toEqual(['n1:1'])
  })

  it('raises idCounter above the highest existing id even if the file counter is stale', () => {
    const root = new TreeNode('n7', 'chance', 'X')
    addOutcome(root, 'a', 1, 1)
    const doc: DecisionDocument = {
      tree: root,
      displayMode: 'ev',
      utility: { type: 'linear', parameter: 0 },
      idCounter: 2, // stale, below the n7 id
    }
    expect(roundTrip(doc).idCounter).toBe(7)
  })

  it('round-trips an empty document (no tree)', () => {
    const doc: DecisionDocument = {
      tree: null,
      displayMode: 'ev',
      utility: { type: 'linear', parameter: 0 },
      idCounter: 0,
    }
    const restored = roundTrip(doc)
    expect(restored.tree).toBeNull()
  })
})

describe('deserializeDocument — malformed input fails loud', () => {
  const base = {
    format: 'decision-analysis',
    version: 1,
    display_mode: 'ev',
    utility: { type: 'linear', parameter: 0 },
    id_counter: 0,
    tree: null,
  }

  it('rejects non-JSON', () => {
    expect(() => deserializeDocument('{not json')).toThrow(/giltig JSON/)
  })

  it('rejects a file without the format tag', () => {
    expect(() => deserializeDocument(JSON.stringify({ hello: 1 }))).toThrow(/Okänt filformat/)
  })

  it('rejects a bad display_mode', () => {
    expect(() => deserializeDocument(JSON.stringify({ ...base, display_mode: 'xyz' }))).toThrow(
      /display_mode/,
    )
  })

  it('rejects a bad utility type', () => {
    expect(() =>
      deserializeDocument(JSON.stringify({ ...base, utility: { type: 'quadratic', parameter: 1 } })),
    ).toThrow(/utility.type/)
  })

  it('rejects a node with a bad node_type', () => {
    const tree = { id: 'n1', node_type: 'weird', label: 'X', outcomes: [], conditional_tables: [] }
    expect(() => deserializeDocument(JSON.stringify({ ...base, tree }))).toThrow(/node_type/)
  })

  it('rejects a node missing its outcomes array', () => {
    const tree = { id: 'n1', node_type: 'chance', label: 'X', conditional_tables: [] }
    expect(() => deserializeDocument(JSON.stringify({ ...base, tree }))).toThrow(/outcomes/)
  })

  it('rejects a corrupt variable group (same variableId, different label/type)', () => {
    const tree = {
      id: 'n1',
      node_type: 'chance',
      label: 'test',
      variable_id: 'n1',
      instance_index: 0,
      conditional_tables: [],
      outcomes: [
        {
          label: '1',
          probability: 1,
          value: null,
          child: {
            id: 'n2',
            node_type: 'decision', // mismatched type within the same group
            label: 'Hej',
            variable_id: 'shared',
            instance_index: 0,
            conditional_tables: [],
            outcomes: [],
          },
        },
        {
          label: '2',
          probability: 0,
          value: null,
          child: {
            id: 'n3',
            node_type: 'chance',
            label: 'Hej',
            variable_id: 'shared', // same group id but chance vs decision
            instance_index: 1,
            conditional_tables: [],
            outcomes: [],
          },
        },
      ],
    }
    expect(() => deserializeDocument(JSON.stringify({ ...base, tree }))).toThrow(
      /Trasig variabelgrupp/,
    )
  })
})

describe('documentFilename', () => {
  it('derives from the root label + date', () => {
    const root = new TreeNode('n1', 'chance', 'Mitt Träd!')
    expect(documentFilename(root)).toMatch(/^mitt-träd-\d{4}-\d{2}-\d{2}\.json$/)
  })

  it('falls back for an empty tree', () => {
    expect(documentFilename(null)).toMatch(/^beslutstrad-\d{4}-\d{2}-\d{2}\.json$/)
  })
})

describe('serializeDocument', () => {
  it('tags the format and version', () => {
    const doc: DecisionDocument = {
      tree: null,
      displayMode: 'ev',
      utility: { type: 'linear', parameter: 0 },
      idCounter: 0,
    }
    const s = serializeDocument(doc)
    expect(s.format).toBe('decision-analysis')
    expect(s.version).toBe(1)
  })
})

// local helper
function collect(root: TreeNode, out: TreeNode[] = []): TreeNode[] {
  out.push(root)
  for (const o of root.outcomes) if (o.child) collect(o.child, out)
  return out
}
