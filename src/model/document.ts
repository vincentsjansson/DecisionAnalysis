import { deserializeTree, serializeTree } from './serialization'
import type { SerializedConditionalRow, SerializedOutcome, SerializedTreeNode } from './serialization'
import type { NodeType, TreeNode } from './tree'
import type { UtilityFunction, UtilityType } from './utility'
import { allNodes } from './variable'
import { t } from '../i18n'

export type DocumentDisplayMode = 'ev' | 'eu'

/** The full editor state a save file captures: the tree plus the settings
 * needed to reproduce the displayed values (EV vs EU/CE + utility function)
 * and the id counter so newly-created nodes don't collide with loaded ones.
 *
 * As of the editable-right-tree change, the flipped/clairvoyance tree is no
 * longer always recomputable from the left (the user may edit it freely), so
 * BOTH trees are persisted. `rightTree` is null until the first flip;
 * `rightEdited` records whether it has diverged from its Bayes baseline (drives
 * the deviation indicator); `split` remembers whether the split view was open. */
export interface DecisionDocument {
  tree: TreeNode | null
  rightTree: TreeNode | null
  rightEdited: boolean
  split: boolean
  displayMode: DocumentDisplayMode
  utility: UtilityFunction
  idCounter: number
}

export interface SerializedDocument {
  format: 'decision-analysis'
  version: number
  display_mode: DocumentDisplayMode
  utility: { type: UtilityType; parameter: number }
  id_counter: number
  tree: SerializedTreeNode | null
  right_tree: SerializedTreeNode | null
  right_edited: boolean
  split: boolean
}

export const DOCUMENT_FORMAT = 'decision-analysis'
// v2 added right_tree / right_edited / split. v1 files still load (missing
// fields default to no right tree, not edited, single view).
export const DOCUMENT_VERSION = 2

export class DocumentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DocumentError'
  }
}

export function serializeDocument(doc: DecisionDocument): SerializedDocument {
  return {
    format: DOCUMENT_FORMAT,
    version: DOCUMENT_VERSION,
    display_mode: doc.displayMode,
    utility: { type: doc.utility.type, parameter: doc.utility.parameter },
    id_counter: doc.idCounter,
    tree: doc.tree ? serializeTree(doc.tree) : null,
    right_tree: doc.rightTree ? serializeTree(doc.rightTree) : null,
    right_edited: doc.rightEdited,
    split: doc.split,
  }
}

/** Pretty-printed JSON for the download. */
export function documentToJson(doc: DecisionDocument): string {
  return JSON.stringify(serializeDocument(doc), null, 2)
}

// ── Validation (fail loud, name the problem) ────────────────────────────────

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function validateConditionalRow(raw: unknown, where: string): SerializedConditionalRow {
  if (!isObject(raw)) throw new DocumentError(`${where}: villkorsrad är inte ett objekt.`)
  if (!Array.isArray(raw.condition) || raw.condition.some((c) => typeof c !== 'string')) {
    throw new DocumentError(`${where}: "condition" måste vara en lista av strängar.`)
  }
  if (!isObject(raw.probabilities)) {
    throw new DocumentError(`${where}: "probabilities" måste vara ett objekt.`)
  }
  return raw as unknown as SerializedConditionalRow
}

function validateOutcome(raw: unknown, where: string): SerializedOutcome {
  if (!isObject(raw)) throw new DocumentError(`${where}: utfall är inte ett objekt.`)
  if (typeof raw.label !== 'string') throw new DocumentError(`${where}: utfall saknar "label".`)
  if (raw.probability !== null && typeof raw.probability !== 'number') {
    throw new DocumentError(`${where}: "probability" måste vara ett tal eller null.`)
  }
  if (raw.value !== null && typeof raw.value !== 'number') {
    throw new DocumentError(`${where}: "value" måste vara ett tal eller null.`)
  }
  if (raw.child !== null) validateNode(raw.child, `${where} → ${raw.label}`)
  return raw as unknown as SerializedOutcome
}

function validateNode(raw: unknown, where: string): SerializedTreeNode {
  if (!isObject(raw)) throw new DocumentError(`${where}: nod är inte ett objekt.`)
  if (typeof raw.id !== 'string') throw new DocumentError(`${where}: nod saknar giltigt "id".`)
  if (raw.node_type !== 'decision' && raw.node_type !== 'chance') {
    throw new DocumentError(`${where}: "node_type" måste vara "decision" eller "chance".`)
  }
  if (typeof raw.label !== 'string') throw new DocumentError(`${where}: nod saknar "label".`)
  if (!Array.isArray(raw.outcomes)) throw new DocumentError(`${where}: "outcomes" måste vara en lista.`)
  if (!Array.isArray(raw.conditional_tables)) {
    throw new DocumentError(`${where}: "conditional_tables" måste vara en lista.`)
  }
  if (raw.variable_id !== undefined && typeof raw.variable_id !== 'string') {
    throw new DocumentError(`${where}: "variable_id" måste vara en sträng.`)
  }
  if (raw.instance_index !== undefined && typeof raw.instance_index !== 'number') {
    throw new DocumentError(`${where}: "instance_index" måste vara ett tal.`)
  }
  raw.conditional_tables.forEach((row, i) => validateConditionalRow(row, `${where} [villkor ${i}]`))
  raw.outcomes.forEach((o) => validateOutcome(o, `${where} (${(raw as { label: string }).label})`))
  return raw as unknown as SerializedTreeNode
}

/** Verifies that every variable group is internally consistent: all nodes
 * sharing a variableId must have the same base label and node type (the
 * invariant linked instances always satisfy). Catches a corrupt/hand-edited
 * file that would otherwise load a broken variable group. */
function validateVariableGroups(root: TreeNode): void {
  const groups = new Map<string, TreeNode>()
  for (const node of allNodes(root)) {
    const primary = groups.get(node.variableId)
    if (!primary) {
      groups.set(node.variableId, node)
      continue
    }
    if (primary.label !== node.label || primary.nodeType !== node.nodeType) {
      throw new DocumentError(
        t().docBrokenGroup(
          node.variableId,
          primary.label,
          primary.nodeType,
          node.label,
          node.nodeType,
        ),
      )
    }
  }
}

/** Highest numeric suffix among `n<number>` ids, so the loaded id counter can
 * be raised above any existing id even if the file's own counter is stale. */
function highestNumericId(root: TreeNode | null): number {
  if (!root) return 0
  let max = 0
  for (const node of allNodes(root)) {
    const m = /^n(\d+)$/.exec(node.id)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max
}

/** Parses and validates a save file, returning a live `DecisionDocument`.
 * Throws `DocumentError` with a specific message on any malformed/broken
 * input — never returns a partial or silently-repaired document. */
export function deserializeDocument(text: string): DecisionDocument {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new DocumentError(t().docInvalidJson)
  }
  if (!isObject(raw)) throw new DocumentError(t().docNotDocObject)
  if (raw.format !== DOCUMENT_FORMAT) {
    throw new DocumentError(t().docUnknownFormat)
  }
  if (raw.display_mode !== 'ev' && raw.display_mode !== 'eu') {
    throw new DocumentError(t().docDisplayMode)
  }
  if (!isObject(raw.utility) || (raw.utility.type !== 'linear' && raw.utility.type !== 'exponential')) {
    throw new DocumentError(t().docUtilityType)
  }
  if (typeof raw.utility.parameter !== 'number') {
    throw new DocumentError(t().docUtilityParam)
  }
  const savedCounter = typeof raw.id_counter === 'number' ? raw.id_counter : 0

  let tree: TreeNode | null = null
  if (raw.tree !== null && raw.tree !== undefined) {
    tree = deserializeTree(validateNode(raw.tree, 'tree'))
    validateVariableGroups(tree)
  }

  // Right (clairvoyance) tree: v2+. Absent in v1 files -> null (single view).
  let rightTree: TreeNode | null = null
  if (raw.right_tree !== null && raw.right_tree !== undefined) {
    rightTree = deserializeTree(validateNode(raw.right_tree, 'right_tree'))
    validateVariableGroups(rightTree)
  }
  if (raw.right_edited !== undefined && typeof raw.right_edited !== 'boolean') {
    throw new DocumentError(t().docRightEdited)
  }
  if (raw.split !== undefined && typeof raw.split !== 'boolean') {
    throw new DocumentError(t().docSplit)
  }

  return {
    tree,
    rightTree,
    rightEdited: raw.right_edited === true,
    split: raw.split === true,
    displayMode: raw.display_mode,
    utility: { type: raw.utility.type as UtilityType, parameter: raw.utility.parameter },
    idCounter: Math.max(savedCounter, highestNumericId(tree), highestNumericId(rightTree)),
  }
}

/** A safe download filename from the root node's name + today's date. */
export function documentFilename(tree: TreeNode | null): string {
  const date = new Date().toISOString().slice(0, 10)
  const base = tree
    ? tree.label
        .trim()
        .replace(/[^\p{L}\p{N}_-]+/gu, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || 'beslutstrad'
    : 'beslutstrad'
  return `${base}-${date}.json`
}

// re-export node type for callers that build documents
export type { NodeType }
