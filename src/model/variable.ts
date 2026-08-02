import type { NodeType, Outcome } from './tree'
import {
  addOutcome,
  branchLabel,
  displayName,
  removeOutcome,
  renameOutcome,
  setChild,
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

/** After a child is attached under one of `parent`'s outcomes, proactively
 * mirrors it across the whole grid of positions that should hold the same
 * variable — so a nested linked structure grows in lock-step without the user
 * repeating the setup on every branch and every parent instance.
 *
 * The grid is `group(parent) × outcomes`: for every instance of `parent`'s
 * variable (parent itself plus its linked siblings P', P'', …) and every one
 * of that instance's still-terminal outcomes, a linked instance of `template`
 * is created. That single sweep covers both dimensions the previous one-level
 * fill missed:
 *  - parent's own other terminal outcomes (the original task-#12 behavior), and
 *  - the corresponding outcomes on parent's linked sibling instances.
 * Outcome correspondence across instances is by label — the same key the
 * outcome-set sync already uses — and linked instances always carry identical
 * label sets, so iterating each instance's own outcomes needs no separate
 * position map. Every created node joins `template`'s own variable group
 * (shared variableId via createLinkedNode's name match), so N/N'/N''… are one
 * synced group, exactly like parent's.
 *
 * It runs as ONE bounded pass (|group| × |outcomes|), never a tree-wide walk.
 * No in-pass recursion is needed: a freshly-created node is childless, so
 * there is nothing deeper to mirror yet — depth composes naturally because
 * every later node-creation event fires this same handler once for its own
 * group. Non-terminal outcomes (already-built or unlinked/diverged structure)
 * are skipped, which also guards against overwriting or double-filling.
 * Returns the instances created (empty if none). */
export function mirrorLinkedInstances(
  root: TreeNode,
  parent: TreeNode,
  template: TreeNode,
  nextId: () => string,
): TreeNode[] {
  const created: TreeNode[] = []
  // Snapshot the parent group up front; created nodes join template's group,
  // not parent's, so this list is stable across the sweep.
  for (const instance of collectGroup(root, parent.variableId)) {
    for (const edge of instance.outcomes) {
      if (edge.child) continue // skip the just-attached child and any existing/diverged structure
      const node = createLinkedNode(root, nextId(), template.nodeType, template.label)
      setChild(instance, edge, node)
      created.push(node)
    }
  }
  return created
}

/** True when this instance's probabilities are governed by its own conditional
 * table (context-dependent, path-driven) rather than the group's shared flat
 * probability. Such an instance opts out of flat-probability sync automatically. */
export function hasConditionalTable(node: TreeNode): boolean {
  return node.conditionalTable.length > 0
}

/** Sets the node type on every instance in the variable group. Node type is a
 * group invariant (all instances of one variable share a type), so a type
 * change on any instance must propagate. Explicitly unlinked instances have
 * their own `variableId` and are unaffected. */
export function setNodeTypeInGroup(root: TreeNode, node: TreeNode, type: NodeType): void {
  for (const instance of collectGroup(root, node.variableId)) {
    instance.nodeType = type
  }
}

/** Copies `node`'s flat outcome probabilities (matched by label) to every other
 * instance in its group that has no conditional table. No-op when `node` itself
 * has a conditional table — a context-dependent instance neither sends nor
 * receives flat-probability sync. This is the default as of the 2026-08-02
 * design change: linked instances share one distribution, so a tree is filled
 * once instead of repeating the same probabilities on every instance. */
export function syncProbabilitiesFromNode(root: TreeNode, node: TreeNode): void {
  if (hasConditionalTable(node)) return
  for (const instance of collectGroup(root, node.variableId)) {
    if (instance === node || hasConditionalTable(instance)) continue
    for (const edge of node.outcomes) {
      const match = instance.outcomes.find((o) => o.label === edge.label)
      if (match) match.probability = edge.probability
    }
  }
}

/** Sets one outcome's probability on `node` and syncs it (by label) across the
 * group's no-table instances. Convenience wrapper over `syncProbabilitiesFromNode`
 * for single-edge edits. */
export function setProbabilityInGroup(
  root: TreeNode,
  node: TreeNode,
  edge: Outcome,
  probability: number,
): void {
  edge.probability = probability
  syncProbabilitiesFromNode(root, node)
}

/** When an instance drops its conditional table it rejoins flat-probability
 * sync: it adopts the group's shared flat probabilities from any no-table
 * sibling. No-op when no such donor exists (every other instance is either
 * absent or itself table-driven) — the node then keeps its current values. */
export function adoptGroupProbabilities(root: TreeNode, node: TreeNode): void {
  const donor = collectGroup(root, node.variableId).find(
    (n) => n !== node && !hasConditionalTable(n),
  )
  if (!donor) return
  for (const edge of node.outcomes) {
    const match = donor.outcomes.find((o) => o.label === edge.label)
    if (match) edge.probability = match.probability
  }
}

/** Adds an outcome to `node` and propagates the same label (probability unset)
 * to every other instance in its variable group. Returns the outcome on
 * `node`. The outcome *set* is synced here; probability *values* sync
 * separately via `syncProbabilitiesFromNode`. */
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
  const group = collectGroup(root, oldGroup)
  if (group.length <= 1) return // already independent
  const remaining = group.filter((n) => n !== node)
  // The group's variableId is the primary instance's node id. If we're unlinking
  // that very node, `node.variableId = node.id` would be a no-op and leave it in
  // the group — so re-home the remaining instances onto a new owner id first,
  // freeing this node's id to become its own independent variable.
  const remainingGroup = node.id === oldGroup ? remaining[0].id : oldGroup
  if (node.id === oldGroup) {
    for (const n of remaining) n.variableId = remainingGroup
  }
  node.variableId = node.id
  node.instanceIndex = 0
  recompact(root, remainingGroup)
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
