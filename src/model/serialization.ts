import type { NodeType } from './tree'
import { Outcome, TreeNode } from './tree'

/** Wire format. snake_case throughout, `condition` as a sorted array (JSON
 * has no Set type), and NaN probabilities/undefined values as null —
 * JSON.stringify silently turns NaN into null anyway, so the mapping is
 * made explicit and round-trip safe here instead of by accident. */
export interface SerializedConditionalRow {
  condition: string[]
  probabilities: Record<string, number>
}

export interface SerializedOutcome {
  label: string
  probability: number | null
  value: number | null
  child: SerializedTreeNode | null
}

export interface SerializedTreeNode {
  id: string
  node_type: NodeType
  label: string
  conditional_tables: SerializedConditionalRow[]
  outcomes: SerializedOutcome[]
}

export function serializeTree(node: TreeNode): SerializedTreeNode {
  return {
    id: node.id,
    node_type: node.nodeType,
    label: node.label,
    conditional_tables: node.conditionalTable.map((row) => ({
      condition: [...row.condition].sort(),
      probabilities: { ...row.probabilities },
    })),
    outcomes: node.outcomes.map((edge) => ({
      label: edge.label,
      probability: Number.isFinite(edge.probability) ? edge.probability : null,
      value: edge.value !== undefined && Number.isFinite(edge.value) ? edge.value : null,
      child: edge.child ? serializeTree(edge.child) : null,
    })),
  }
}

/** Rebuilds a tree from `serializeTree`'s output. Round-trip safe: same node
 * types, labels, probabilities (null -> NaN "unset"), payoffs, conditional
 * rows, and structure. */
export function deserializeTree(data: SerializedTreeNode): TreeNode {
  const node = new TreeNode(data.id, data.node_type, data.label)
  node.conditionalTable = data.conditional_tables.map((row) => ({
    condition: new Set(row.condition),
    probabilities: { ...row.probabilities },
  }))
  node.outcomes = data.outcomes.map((edgeData) => {
    const edge = new Outcome(
      edgeData.label,
      edgeData.probability ?? NaN,
      null,
      edgeData.value ?? undefined,
    )
    if (edgeData.child) {
      const child = deserializeTree(edgeData.child)
      child.parent = node
      edge.child = child
      edge.value = undefined
    }
    return edge
  })
  return node
}
