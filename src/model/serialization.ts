import type { NodeType } from './tree'
import { Outcome, TreeNode } from './tree'

/** Wire format for a conditional-probability override. `condition` is a
 * sorted array (JSON has no Set type) of the branch labels required. */
export interface SerializedConditionalEntry {
  condition: string[]
  probability: number
}

export interface SerializedOutcome {
  label: string
  probability: number
  conditional_tables: SerializedConditionalEntry[]
  child: SerializedTreeNode | null
}

export interface SerializedTreeNode {
  id: string
  node_type: NodeType
  label: string
  payoff?: number
  children: SerializedOutcome[]
}

function serializeOutcome(edge: Outcome): SerializedOutcome {
  return {
    label: edge.label,
    probability: edge.probability,
    conditional_tables: edge.conditionalTable.map((entry) => ({
      condition: [...entry.condition].sort(),
      probability: entry.probability,
    })),
    child: edge.child ? serializeTree(edge.child) : null,
  }
}

/** Converts a tree to a JSON-safe plain object. Field names are snake_case
 * throughout, and `condition` sets become sorted string arrays — no Sets or
 * tuples ever reach JSON.stringify. */
export function serializeTree(node: TreeNode): SerializedTreeNode {
  return {
    id: node.id,
    node_type: node.nodeType,
    label: node.label,
    ...(node.nodeType === 'leaf' ? { payoff: node.payoff } : {}),
    children: node.children.map(serializeOutcome),
  }
}

function deserializeOutcome(data: SerializedOutcome, parent: TreeNode): Outcome {
  const edge = new Outcome(data.label, data.probability, null)
  edge.conditionalTable = data.conditional_tables.map((entry) => ({
    condition: new Set(entry.condition),
    probability: entry.probability,
  }))
  if (data.child) {
    const child = deserializeTree(data.child)
    child.parent = parent
    edge.child = child
  }
  return edge
}

/** Rebuilds a tree from `serializeTree`'s output. Round-trip safe: the
 * result has the same node types, payoffs, probabilities, conditional
 * tables, and structure as the original (condition-set member order may
 * differ, but Set membership is unordered by definition). */
export function deserializeTree(data: SerializedTreeNode): TreeNode {
  const node = new TreeNode(
    data.id,
    data.node_type,
    data.label,
    data.node_type === 'leaf' ? data.payoff : undefined,
  )
  node.children = data.children.map((edgeData) => deserializeOutcome(edgeData, node))
  return node
}
