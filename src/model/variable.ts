import type { NodeType, Outcome } from './tree'
import {
  addOutcome,
  branchLabel,
  displayName,
  removeOutcome,
  renameOutcome,
  TreeNode,
} from './tree'

export class VariableConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VariableConflictError'
  }
}

/** Depth-first list of every node in the tree rooted at `root`. */
export function allNodes(root: TreeNode): TreeNode[] {
  const out: TreeNode[] = []
  const walk = (n: TreeNode): void => {
    out.push(n)
    for (const o of n.outcomes) if (o.child) walk(o.child)
  }
  walk(root)
  return out
}

/** Every node sharing `variableId` (the whole variable group), primary first. */
export function collectGroup(root: TreeNode, variableId: string): TreeNode[] {
  return allNodes(root)
    .filter((n) => n.variableId === variableId)
    .sort((a, b) => a.instanceIndex - b.instanceIndex)
}

/** The first existing node whose base name equals `name`, or null. Used to
 * decide whether a newly-created node links into an existing variable. */
export function findByBaseName(root: TreeNode | null, name: string): TreeNode | null {
  if (!root) return null
  return allNodes(root).find((n) => n.label === name) ?? null
}

/** Renumbers a group's `instanceIndex` values to a contiguous 0..n-1 by their
 * current order, so prime marks stay gap-free after a member leaves. */
function recompact(root: TreeNode, variableId: string): void {
  collectGroup(root, variableId).forEach((node, i) => {
    node.instanceIndex = i
  })
}

/** Creates a node and, if its name matches an existing node in `root`, links
 * it into that variable group: shared `variableId`, next `instanceIndex`, and
 * the group's current outcome set copied in (labels only — probabilities start
 * unset). The new node is NOT yet attached to the tree; the caller wires it in
 * with `setChild`. Throws `VariableConflictError` on a node-type mismatch
 * within a group. */
export function createLinkedNode(
  root: TreeNode | null,
  id: string,
  nodeType: NodeType,
  name: string,
): TreeNode {
  const node = new TreeNode(id, nodeType, name)
  const existing = findByBaseName(root, name)
  if (!existing || !root) return node // singleton

  if (existing.nodeType !== nodeType) {
    throw new VariableConflictError(
      `Kan inte länka till variabeln "${name}": den är en ${typeLabel(existing.nodeType)}, ` +
        `men du försöker skapa en ${typeLabel(nodeType)}. En variabels alla instanser måste ha samma typ.`,
    )
  }

  const group = collectGroup(root, existing.variableId)
  node.variableId = existing.variableId
  node.instanceIndex = Math.max(...group.map((n) => n.instanceIndex)) + 1
  // Sync the outcome set (labels only) from the group's primary.
  for (const edge of group[0].outcomes) {
    addOutcome(node, edge.label)
  }
  return node
}

function typeLabel(t: NodeType): string {
  return t === 'chance' ? 'slumpnod' : 'beslutsnod'
}

/** Adds an outcome to `node` and propagates the same label (probability unset)
 * to every other instance in its variable group. Returns the outcome on
 * `node`. Probabilities are never synced — only the outcome set. */
export function addOutcomeToGroup(
  root: TreeNode,
  node: TreeNode,
  label: string,
  probability = NaN,
  value?: number,
): Outcome {
  const created = addOutcome(node, label, probability, value)
  for (const instance of collectGroup(root, node.variableId)) {
    if (instance !== node && !instance.outcomes.some((o) => o.label === label)) {
      addOutcome(instance, label)
    }
  }
  return created
}

/** Removes an outcome (by matching label) from every instance in the group,
 * dropping its conditional-table column on each. */
export function removeOutcomeFromGroup(root: TreeNode, node: TreeNode, edge: Outcome): void {
  const label = edge.label
  for (const instance of collectGroup(root, node.variableId)) {
    const match = instance.outcomes.find((o) => o.label === label)
    if (match) removeOutcome(instance, match)
  }
}

/** Renames an outcome across every instance in the group. For each instance
 * this rekeys that instance's own conditional-row probabilities AND rewrites
 * every `<instanceId>:<oldLabel>` condition token throughout the tree — the
 * per-instance token namespacing means a synced rename must run the full
 * rename on each instance, or downstream conditions silently orphan. */
export function renameOutcomeInGroup(
  root: TreeNode,
  node: TreeNode,
  edge: Outcome,
  newLabel: string,
): void {
  const oldLabel = edge.label
  if (oldLabel === newLabel) return
  const group = collectGroup(root, node.variableId)

  // Validate up front on every instance so we never half-apply.
  for (const instance of group) {
    if (instance.outcomes.some((o) => o.label === newLabel)) {
      throw new Error(
        `Instansen "${displayName(instance)}" har redan ett utfall "${newLabel}" — ` +
          `utfallsetiketter måste vara unika.`,
      )
    }
    if (!instance.outcomes.some((o) => o.label === oldLabel)) {
      throw new Error(`Instansen "${displayName(instance)}" saknar utfallet "${oldLabel}".`)
    }
  }

  for (const instance of group) {
    const match = instance.outcomes.find((o) => o.label === oldLabel)!
    renameOutcome(root, instance, match, newLabel)
  }
}

/** Renames the whole variable (base name) — propagates to every instance in
 * the group (locked decision A). Rejects a collision with a *different*
 * existing variable's base name. */
export function renameVariable(root: TreeNode, node: TreeNode, newName: string): void {
  if (node.label === newName) return
  const clash = allNodes(root).find((n) => n.label === newName && n.variableId !== node.variableId)
  if (clash) {
    throw new VariableConflictError(
      `Namnet "${newName}" används redan av en annan variabel. Välj ett annat namn ` +
        `(eller länka genom att skapa en ny nod med det namnet).`,
    )
  }
  for (const instance of collectGroup(root, node.variableId)) {
    instance.label = newName
  }
}

/** Detaches `node` from its variable group into its own independent variable:
 * fresh `variableId` (= its own id), reset to a primary (index 0), keeping its
 * current outcomes/probabilities/conditional table. The remaining group is
 * recompacted so its prime marks stay contiguous. This is the explicit unlink
 * action (distinct from rename, which propagates). */
export function unlinkNode(root: TreeNode, node: TreeNode): void {
  const oldGroup = node.variableId
  if (collectGroup(root, oldGroup).length <= 1) return // already independent
  node.variableId = node.id
  node.instanceIndex = 0
  recompact(root, oldGroup)
}

/** Other instances (besides `node`) in the same variable group — for the UI to
 * warn "this edit also affects: …". Empty when the node is independent. */
export function groupSiblings(root: TreeNode, node: TreeNode): TreeNode[] {
  return collectGroup(root, node.variableId).filter((n) => n !== node)
}

/** Derives variable groups purely from base names: every set of same-named
 * nodes becomes one group (shared variableId, contiguous instance indices in
 * tree order). Throws `VariableConflictError` on a within-name type mismatch.
 * Intended for normalizing an externally-built or imported tree — NOT called
 * on every edit, since it would undo an explicit unlink of a coincidentally
 * same-named node. */
export function relinkByName(root: TreeNode): void {
  const byName = new Map<string, TreeNode[]>()
  for (const n of allNodes(root)) {
    const list = byName.get(n.label) ?? []
    list.push(n)
    byName.set(n.label, list)
  }
  for (const [name, nodes] of byName) {
    const type = nodes[0].nodeType
    for (const n of nodes) {
      if (n.nodeType !== type) {
        throw new VariableConflictError(
          `Variabeln "${name}" har blandade nodtyper — alla instanser måste ha samma typ.`,
        )
      }
    }
    const variableId = nodes[0].id
    nodes.forEach((n, i) => {
      n.variableId = variableId
      n.instanceIndex = i
    })
  }
}

export { branchLabel }
