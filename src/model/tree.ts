export type NodeType = 'decision' | 'outcome' | 'leaf'

/** A single conditional-probability override: applies when all labels in
 * `condition` are present in the current history. */
export interface ConditionalEntry {
  condition: Set<string>
  probability: number
}

/** An edge from an `outcome` (or `decision`) node to a child node.
 * `probability` and `conditionalTable` are only meaningful when the owning
 * node is of type `outcome` — decision nodes ignore them. */
export class Outcome {
  label: string
  probability: number
  child: TreeNode | null
  conditionalTable: ConditionalEntry[]

  constructor(label: string, probability = 0, child: TreeNode | null = null) {
    this.label = label
    this.probability = probability
    this.child = child
    this.conditionalTable = []
  }
}

export class TreeNode {
  id: string
  nodeType: NodeType
  label: string
  children: Outcome[]
  payoff?: number
  /** Set by `setChild` on the child when it is attached. Used for cycle detection. */
  parent: TreeNode | null

  constructor(id: string, nodeType: NodeType, label: string, payoff?: number) {
    if (nodeType === 'leaf' && payoff === undefined) {
      throw new Error(`Leaf node "${id}" must have a payoff value`)
    }
    if (nodeType !== 'leaf' && payoff !== undefined) {
      throw new Error(`Only leaf nodes may have a payoff value (node "${id}" is "${nodeType}")`)
    }

    this.id = id
    this.nodeType = nodeType
    this.label = label
    this.children = []
    this.payoff = payoff
    this.parent = null
  }
}

/** The single history/condition token format used everywhere: model,
 * conditional tables, and UI. Namespaced by node id so identical edge
 * labels on different nodes don't collide. Never build this string by
 * hand elsewhere — legacy had three incompatible formats and the
 * conditional probabilities never reached the EV calculation. */
export function branchLabel(node: TreeNode, edgeLabel: string): string {
  return `${node.id}:${edgeLabel}`
}

export class CyclicTreeError extends Error {
  constructor(parentId: string, childId: string) {
    super(
      `Cannot attach "${childId}" as a child of "${parentId}": ` +
        `"${childId}" is already an ancestor of "${parentId}", which would create a cycle.`,
    )
    this.name = 'CyclicTreeError'
  }
}

/** Attaches `child` to `parent` via `edge`. Throws `CyclicTreeError` if `child`
 * is already an ancestor of `parent` (including `child === parent`). */
export function setChild(parent: TreeNode, edge: Outcome, child: TreeNode): void {
  if (parent.nodeType === 'leaf') {
    throw new Error(`Cannot attach children to leaf node "${parent.id}"`)
  }

  let ancestor: TreeNode | null = parent
  while (ancestor !== null) {
    if (ancestor === child) {
      throw new CyclicTreeError(parent.id, child.id)
    }
    ancestor = ancestor.parent
  }

  edge.child = child
  child.parent = parent
  parent.children.push(edge)
}

/** Detaches `edge` (and thereby its whole subtree) from `parent`. */
export function removeChild(parent: TreeNode, edge: Outcome): void {
  const index = parent.children.indexOf(edge)
  if (index === -1) {
    throw new Error(`Edge "${edge.label}" is not a child edge of node "${parent.id}"`)
  }
  parent.children.splice(index, 1)
  if (edge.child) edge.child.parent = null
}

/** Renames `edge` and rewrites every conditional-table condition in the whole
 * tree (from `root`) that referenced the old branch token, so conditions keep
 * working after a rename. Legacy keyed conditions on names and silently broke
 * them on rename — this is the deliberate fix. Sibling edge labels must stay
 * unique, since the branch token (`nodeId:label`) is the history key. */
export function renameEdgeLabel(
  root: TreeNode,
  parent: TreeNode,
  edge: Outcome,
  newLabel: string,
): void {
  if (parent.children.indexOf(edge) === -1) {
    throw new Error(`Edge "${edge.label}" is not a child edge of node "${parent.id}"`)
  }
  if (parent.children.some((e) => e !== edge && e.label === newLabel)) {
    throw new Error(
      `Node "${parent.id}" already has a sibling edge labeled "${newLabel}" — sibling labels must be unique`,
    )
  }

  const oldToken = branchLabel(parent, edge.label)
  const newToken = branchLabel(parent, newLabel)
  edge.label = newLabel

  const rewrite = (node: TreeNode): void => {
    for (const childEdge of node.children) {
      for (const entry of childEdge.conditionalTable) {
        if (entry.condition.has(oldToken)) {
          entry.condition.delete(oldToken)
          entry.condition.add(newToken)
        }
      }
      if (childEdge.child) rewrite(childEdge.child)
    }
  }
  rewrite(root)
}
