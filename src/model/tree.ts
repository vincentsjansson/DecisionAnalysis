export type NodeType = 'decision' | 'chance'

/** One conditional-probability row on a node: when every token in
 * `condition` is present in the current history, the row supplies the
 * probability for each of the node's outcomes (keyed by outcome label).
 * A full row per condition — not per-edge overrides — so a row is always a
 * complete distribution and row-sum-to-1 can be checked structurally. */
export interface ConditionalRow {
  condition: Set<string>
  probabilities: Record<string, number>
}

/** An outgoing path from a node — the node's outcome (chance nodes) or
 * alternative (decision nodes). A terminal outcome (`child === null`) is the
 * end of a path and carries the payoff in `value`. There is no separate leaf
 * node type — this mirrors textbook decision trees. */
export class Outcome {
  label: string
  /** Base probability (chance nodes). NaN = deliberately unset, shown as "–". */
  probability: number
  child: TreeNode | null
  /** Payoff when terminal. undefined = unset, shown as "–". */
  value?: number

  constructor(label: string, probability = NaN, child: TreeNode | null = null, value?: number) {
    this.label = label
    this.probability = probability
    this.child = child
    this.value = value
  }
}

export class TreeNode {
  id: string
  nodeType: NodeType
  /** The base variable name — shared, identical, across every node in the
   * same variable group. Priming for display comes from `instanceIndex`, not
   * from this field, so renaming and grouping stay clean. */
  label: string
  outcomes: Outcome[]
  conditionalTable: ConditionalRow[]
  /** Set when attached via `setChild`. Used for cycle detection and path walks. */
  parent: TreeNode | null
  /** Groups node instances of the same conceptual variable. Every node has
   * one; a singleton's `variableId` equals its own `id`. Nodes sharing a
   * `variableId` keep their outcome *set* synced (but not probabilities), and
   * flip/VOC treats them as the same variable. */
  variableId: string
  /** 0 for the primary (unprimed) instance, 1 for the first prime, etc. Used
   * only to render the prime-mark suffix — never baked into `label`. */
  instanceIndex: number

  constructor(id: string, nodeType: NodeType, label: string) {
    this.id = id
    this.nodeType = nodeType
    this.label = label
    this.outcomes = []
    this.conditionalTable = []
    this.parent = null
    this.variableId = id
    this.instanceIndex = 0
  }
}

/** Display name = base name + a prime mark per instance index ("Väder",
 * "Väder'", "Väder''"). The primary instance shows the bare base name. */
export function displayName(node: TreeNode): string {
  return node.label + "'".repeat(node.instanceIndex)
}

/** The single history/condition token format used everywhere: model,
 * conditional tables, and UI. Namespaced by node id so identical outcome
 * labels on different nodes don't collide. Never build this string by hand
 * elsewhere — legacy had three incompatible formats and the conditional
 * probabilities never reached the EV calculation. */
export function branchLabel(node: TreeNode, outcomeLabel: string): string {
  return `${node.id}:${outcomeLabel}`
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

/** Adds a new outcome to `node`. Labels must be unique among siblings since
 * the branch token (`nodeId:label`) is the history key. */
export function addOutcome(
  node: TreeNode,
  label: string,
  probability = NaN,
  value?: number,
): Outcome {
  if (node.outcomes.some((o) => o.label === label)) {
    throw new Error(`Node "${node.id}" already has an outcome labeled "${label}"`)
  }
  const outcome = new Outcome(label, probability, null, value)
  node.outcomes.push(outcome)
  return outcome
}

/** Attaches `child` at the end of `edge` (which must belong to `parent`).
 * Throws `CyclicTreeError` if `child` is already an ancestor of `parent`.
 * The edge stops being terminal, so any stored payoff is cleared. */
export function setChild(parent: TreeNode, edge: Outcome, child: TreeNode): void {
  if (parent.outcomes.indexOf(edge) === -1) {
    throw new Error(`Outcome "${edge.label}" does not belong to node "${parent.id}"`)
  }
  if (edge.child !== null) {
    throw new Error(`Outcome "${edge.label}" on node "${parent.id}" already has a child`)
  }

  let ancestor: TreeNode | null = parent
  while (ancestor !== null) {
    if (ancestor === child) {
      throw new CyclicTreeError(parent.id, child.id)
    }
    ancestor = ancestor.parent
  }

  edge.child = child
  edge.value = undefined
  child.parent = parent
}

/** Detaches `edge`'s child subtree, making the edge terminal again (payoff
 * unset). Used by "delete node" — the outcome itself survives. */
export function detachChild(edge: Outcome): void {
  if (edge.child) {
    edge.child.parent = null
    edge.child = null
  }
}

/** Removes `edge` (and thereby its whole subtree) from `node`, and drops the
 * outcome's column from the node's conditional rows. */
export function removeOutcome(node: TreeNode, edge: Outcome): void {
  const index = node.outcomes.indexOf(edge)
  if (index === -1) {
    throw new Error(`Outcome "${edge.label}" does not belong to node "${node.id}"`)
  }
  node.outcomes.splice(index, 1)
  if (edge.child) edge.child.parent = null
  for (const row of node.conditionalTable) {
    delete row.probabilities[edge.label]
  }
}

/** Renames an outcome and keeps every reference consistent:
 * - the node's own conditional rows (probabilities are keyed by label)
 * - every condition token `nodeId:oldLabel` anywhere in the tree
 * Legacy keyed conditions on names and silently broke them on rename —
 * this is the deliberate fix. Sibling labels must stay unique. */
export function renameOutcome(
  root: TreeNode,
  node: TreeNode,
  edge: Outcome,
  newLabel: string,
): void {
  if (node.outcomes.indexOf(edge) === -1) {
    throw new Error(`Outcome "${edge.label}" does not belong to node "${node.id}"`)
  }
  if (node.outcomes.some((o) => o !== edge && o.label === newLabel)) {
    throw new Error(
      `Node "${node.id}" already has an outcome labeled "${newLabel}" — sibling labels must be unique`,
    )
  }

  const oldLabel = edge.label
  const oldToken = branchLabel(node, oldLabel)
  const newToken = branchLabel(node, newLabel)
  edge.label = newLabel

  for (const row of node.conditionalTable) {
    if (oldLabel in row.probabilities) {
      row.probabilities[newLabel] = row.probabilities[oldLabel]
      delete row.probabilities[oldLabel]
    }
  }

  const rewrite = (current: TreeNode): void => {
    for (const row of current.conditionalTable) {
      if (row.condition.has(oldToken)) {
        row.condition.delete(oldToken)
        row.condition.add(newToken)
      }
    }
    for (const outcome of current.outcomes) {
      if (outcome.child) rewrite(outcome.child)
    }
  }
  rewrite(root)
}
