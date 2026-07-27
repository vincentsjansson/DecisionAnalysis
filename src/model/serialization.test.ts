import { describe, expect, it } from 'vitest'
import { calculateExpectedValue } from './expectedValue'
import { deserializeTree, serializeTree } from './serialization'
import { addOutcome, setChild, TreeNode } from './tree'

function buildTree() {
  const root = new TreeNode('root', 'chance', 'Root')
  const mid = new TreeNode('mid', 'chance', 'Mid')

  addOutcome(root, 'A', 0.5, 8)
  const edgeB = addOutcome(root, 'B', 0.5)
  setChild(root, edgeB, mid)

  addOutcome(mid, 'X', 0.3, 3)
  addOutcome(mid, 'Y', 0.7, 5)
  mid.conditionalTable = [
    { condition: new Set(['root:B']), probabilities: { X: 0.6, Y: 0.4 } },
    { condition: new Set(['root:A', 'root:B']), probabilities: { X: 0.2, Y: 0.8 } },
  ]
  return root
}

describe('serializeTree / deserializeTree', () => {
  it('produces JSON-safe snake_case output with sorted condition arrays', () => {
    const serialized = serializeTree(buildTree())
    expect(() => JSON.stringify(serialized)).not.toThrow()
    expect(serialized.node_type).toBe('chance')

    const midSer = serialized.outcomes.find((o) => o.label === 'B')!.child!
    expect(midSer.conditional_tables).toEqual([
      { condition: ['root:B'], probabilities: { X: 0.6, Y: 0.4 } },
      { condition: ['root:A', 'root:B'], probabilities: { X: 0.2, Y: 0.8 } },
    ])
  })

  it('round-trips through JSON with identical structure and behavior', () => {
    const root = buildTree()
    const restored = deserializeTree(JSON.parse(JSON.stringify(serializeTree(root))))

    expect(serializeTree(restored)).toEqual(serializeTree(root))
    expect(calculateExpectedValue(restored)).toBeCloseTo(calculateExpectedValue(root))

    const mid = restored.outcomes.find((o) => o.label === 'B')!.child!
    expect(mid.parent).toBe(restored)
  })

  it('round-trips unset probability (NaN) and unset value via null — explicitly', () => {
    const root = new TreeNode('root', 'chance', 'Root')
    addOutcome(root, 'A') // probability NaN, value undefined

    const json = JSON.parse(JSON.stringify(serializeTree(root)))
    expect(json.outcomes[0].probability).toBeNull()
    expect(json.outcomes[0].value).toBeNull()

    const restored = deserializeTree(json)
    expect(Number.isNaN(restored.outcomes[0].probability)).toBe(true)
    expect(restored.outcomes[0].value).toBeUndefined()
  })

  it('preserves terminal payoffs', () => {
    const serialized = serializeTree(buildTree())
    expect(serialized.outcomes.find((o) => o.label === 'A')!.value).toBe(8)
  })
})
