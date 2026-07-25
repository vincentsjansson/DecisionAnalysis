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
