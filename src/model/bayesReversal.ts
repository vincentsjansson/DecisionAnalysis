import type { ConditionalRow, NodeType, TreeNode as TreeNodeType } from './tree'
import { addOutcome, branchLabel, displayName, setChild, TreeNode } from './tree'
import { resolveProbability } from './conditionalProbability'
import { calculateExpectedValue } from './expectedValue'
import { t } from '../i18n'

export class FlipError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FlipError'
  }
}

export interface FlipResult {
  flipped: TreeNodeType
  /** flippedEv − originalEv, informational only (the app displays VOC as the
   * direction-agnostic |EV_left − EV_right|, computed independently in app.ts).
   * NaN when either tree is incomplete. Unlike the old classical-clairvoyance
   * reversal, this is NOT guaranteed ≥ 0 — a full sequence reversal can make
   * EV go either way, so no invariant is enforced here (see `ensureVocInvariant`,
   * kept as a standalone utility but no longer called from this function). */
  voc: number
  originalEv: number
  flippedEv: number
}

/** A "variable" in the canonical sequence, identified by `variableId` + type.
 * In a true tree the same variable appears as separate node objects on
 * different branches; linked instances share a `variableId`, which is what
 * ties them together — not a coincidental label match. `displayLabel` (the
 * base name) is kept for user-facing messages and the built node's name. */
interface CanonicalVar {
  variableId: string
  displayLabel: string
  nodeType: NodeType
  outcomeLabels: string[]
  /** True when a node at this level carries a conditional table — a "wall" that
   * stays fixed during the flip (segment-wise reversal); the levels on each side
   * of it reverse independently. Its context-dependent distribution is resolved
   * per-branch at build time (its determining ancestors stay before it). */
  hasTable: boolean
}

interface PathInfo {
  /** variableId -> outcome label taken, for every variable on the path */
  assignment: Map<string, string>
  varsIncluded: Set<string>
}

/** Result of the collect phase: the validated canonical variable sequence plus
 * everything the build phase needs (paths for the duplication rule, per-variable
 * distributions, and the original root for payoff evaluation). */
interface Collected {
  root: TreeNodeType
  canonical: CanonicalVar[]
  paths: PathInfo[]
  distGroups: Map<string, Map<string, number>>
}

const DIST_EPSILON = 1e-9
const VOC_EPSILON = 1e-9


function fmtP(p: number): string {
  return Number.isFinite(p) ? String(parseFloat(p.toPrecision(4))) : '–'
}

function fmtDist(dist: Map<string, number>): string {
  return [...dist].map(([label, p]) => `${label} ${fmtP(p)}`).join(' / ')
}

function describeContext(assignment: Map<string, string>, varName: Map<string, string>): string {
  return [...assignment].map(([k, v]) => `${varName.get(k) ?? k}=${v}`).join(' → ')
}

/** Standalone ≥0 check, kept for callers that want the classical clairvoyance
 * invariant (perfect information can never hurt) — e.g. a future strict-VOC
 * mode. NOT called by `reverseTreeWithBayes` itself: a full sequence reversal
 * has no such guarantee (see FlipResult.voc). */
export function ensureVocInvariant(voc: number): number {
  if (!Number.isFinite(voc)) return voc
  if (voc < -VOC_EPSILON) {
    throw new FlipError(
      `Intern konsistenskontroll misslyckades: VOC = ${voc} är negativt, vilket är ` +
        `omöjligt för korrekt klarsyn (perfekt information kan inte göra ` +
        `beslutsfattaren sämre ställd). Vägrar visa ett felaktigt tal — detta är en bugg.`,
    )
  }
  return Math.max(0, voc)
}

/** Collect + validate the canonical variable sequence. Every root-to-terminal
 * path must pass the same variables in the same order (early termination is
 * allowed — the duplication rule). Chance nodes must sum to 1 and must have a
 * single context-independent distribution (a conditional table that differs by
 * branch is rejected: under a reordering an ancestor can end up after the node
 * it would determine, so there is no way to know which distribution applies).
 * Throws `FlipError` with a specific message on any violation. */
function collectCanonical(root: TreeNodeType): Collected {
  if (root.outcomes.length === 0) {
    throw new FlipError(t().flipNoOutcomes)
  }

  const canonical: CanonicalVar[] = []
  const paths: PathInfo[] = []
  // Keyed by variableId only: a reordering can place a node's determining
  // ancestor after it, so the node's distribution must be the same everywhere.
  const distGroups = new Map<string, Map<string, number>>()
  const distDesc = new Map<string, string>()
  const varName = new Map<string, string>() // variableId -> display name, for messages

  const visit = (
    node: TreeNodeType,
    depth: number,
    history: Set<string>,
    assignment: Map<string, string>,
  ): void => {
    varName.set(node.variableId, displayName(node))
    const where = describeContext(assignment, varName) || '(rot)'
    const existing = canonical[depth]
    if (!existing) {
      for (let i = 0; i < depth; i++) {
        if (canonical[i].variableId === node.variableId) {
          throw new FlipError(t().flipVarTwoLevels(displayName(node), i + 1, depth + 1, where))
        }
      }
      canonical[depth] = {
        variableId: node.variableId,
        displayLabel: node.label,
        nodeType: node.nodeType,
        outcomeLabels: node.outcomes.map((o) => o.label),
        hasTable: node.conditionalTable.length > 0,
      }
    } else {
      // Any instance at this level carrying a conditional table makes the level
      // a wall (fixed pivot in the flip).
      if (node.conditionalTable.length > 0) existing.hasTable = true
      if (existing.variableId !== node.variableId || existing.nodeType !== node.nodeType) {
        throw new FlipError(
          t().flipLevelMismatch(
            depth + 1,
            t().nodeTypeWord(existing.nodeType),
            existing.displayLabel,
            where,
            t().nodeTypeWord(node.nodeType),
            displayName(node),
          ),
        )
      }
      const expected = [...existing.outcomeLabels].sort().join(', ')
      const got = node.outcomes.map((o) => o.label).sort().join(', ')
      if (expected !== got) {
        throw new FlipError(t().flipDiffOutcomes(displayName(node), got, where, expected))
      }
    }
    if (node.outcomes.length === 0) {
      throw new FlipError(t().flipNodeNoOutcomes(displayName(node), where))
    }

    if (node.nodeType === 'chance') {
      const dist = new Map<string, number>()
      let sum = 0
      for (const edge of node.outcomes) {
        const p = resolveProbability(node, edge, history)
        dist.set(edge.label, p)
        sum += p
      }
      if (Number.isFinite(sum) && Math.abs(sum - 1) > 1e-6) {
        throw new FlipError(t().flipSumNotOne(displayName(node), where, fmtP(sum)))
      }

      // A wall level (has a conditional table) keeps its own context-dependent
      // distribution, resolved per-branch at build time — it never needs a single
      // group distribution, so skip the consistency check and distGroups entry.
      // A level WITHOUT a table but whose base probabilities still differ across
      // instances is a genuinely inconsistent variable — that still fails loud.
      if (!canonical[depth].hasTable) {
        const prev = distGroups.get(node.variableId)
        if (prev) {
          for (const [label, p] of dist) {
            const q = prev.get(label)!
            const equal = (Number.isNaN(p) && Number.isNaN(q)) || Math.abs(p - q) <= DIST_EPSILON
            if (!equal) {
              throw new FlipError(
                t().flipDiffContext(
                  displayName(node),
                  distDesc.get(node.variableId)!,
                  fmtDist(prev),
                  where,
                  fmtDist(dist),
                ),
              )
            }
          }
        } else {
          distGroups.set(node.variableId, dist)
          distDesc.set(node.variableId, where)
        }
      }
    }

    for (const edge of node.outcomes) {
      const nextAssignment = new Map(assignment)
      nextAssignment.set(node.variableId, edge.label)
      if (edge.child) {
        const nextHistory = new Set(history)
        nextHistory.add(branchLabel(node, edge.label))
        visit(edge.child, depth + 1, nextHistory, nextAssignment)
      } else {
        paths.push({
          assignment: nextAssignment,
          varsIncluded: new Set(nextAssignment.keys()),
        })
      }
    }
  }
  visit(root, 0, new Set(), new Map())

  return { root, canonical, paths, distGroups }
}

/** Builds a fresh tree whose levels follow `order` (a permutation of the
 * canonical variable sequence). Shared by the flip (order = reversed) and manual
 * pill-drag level reordering (order = one adjacent pair swapped). A moved node
 * keeps its own outcomes and their probabilities unchanged — no recomputation.
 * Asymmetry / early termination is handled by the duplication rule via
 * `anyCompatiblePathIncludes`, so this works for ANY order.
 *
 * `preserveGroups`: when true, built nodes reuse the source variable's
 * `variableId` (so linked instances stay linked in the result — needed for an
 * in-place reorder of the real tree). When false, each built node is its own
 * singleton (the flip produces an independent derived tree). */
function buildFromOrder(
  c: Collected,
  order: CanonicalVar[],
  nid: () => string,
  preserveGroups: boolean,
  preserveTables = false,
): TreeNodeType {
  const compatible = (path: PathInfo, assign: Map<string, string>): boolean => {
    for (const [key, value] of assign) {
      const pathValue = path.assignment.get(key)
      if (pathValue !== undefined && pathValue !== value) return false
    }
    return true
  }

  /** A variable is materialized in a branch only if some original path
   * compatible with the branch actually passes it — otherwise every payoff in
   * the branch is independent of the variable and the level is skipped
   * (mirroring the original tree's early termination). Order-agnostic. */
  const anyCompatiblePathIncludes = (assign: Map<string, string>, variableId: string): boolean =>
    c.paths.some((p) => p.varsIncluded.has(variableId) && compatible(p, assign))

  /** Evaluates the original tree as a payoff function of a full variable
   * assignment (keyed by variableId). Early-terminating paths ignore variables
   * they skip — the duplication rule. Order-agnostic (walks the original tree). */
  const evaluate = (assign: Map<string, string>): number => {
    let node = c.root
    for (;;) {
      const outLabel = assign.get(node.variableId)!
      const edge = node.outcomes.find((o) => o.label === outLabel)!
      if (edge.child) node = edge.child
      else return edge.value ?? NaN
    }
  }

  /** Finds an original instance of `variableId` whose path is COMPATIBLE with
   * `assign`, and the history taken to reach it. For an ancestor variable that
   * IS assigned, only the matching outcome is followed (so a wall's determining
   * ancestors — always assigned — pin the exact context). For an ancestor that
   * ISN'T assigned (a non-determining level that a pill reorder moved below this
   * one), all branches are explored to locate the variable — any instance is
   * equivalent, since by construction this node doesn't depend on that level. */
  const originalInstance = (
    assign: Map<string, string>,
    variableId: string,
  ): { node: TreeNodeType; history: Set<string> } | null => {
    let found: { node: TreeNodeType; history: Set<string> } | null = null
    const dfs = (node: TreeNodeType, history: Set<string>): void => {
      if (found) return
      if (node.variableId === variableId) {
        found = { node, history }
        return
      }
      const assigned = assign.get(node.variableId)
      for (const edge of node.outcomes) {
        if (found) return
        if (assigned !== undefined && edge.label !== assigned) continue
        if (edge.child) dfs(edge.child, new Set(history).add(branchLabel(node, edge.label)))
      }
    }
    dfs(c.root, new Set())
    return found
  }

  /** A WALL chance node's distribution, resolved per-branch (honouring its
   * conditional table) — used by the flip, which BAKES the resolved values (no
   * table kept in the derived tree). */
  const resolveWallDist = (
    assign: Map<string, string>,
    variableId: string,
  ): Map<string, number> | null => {
    const inst = originalInstance(assign, variableId)
    if (!inst) return null
    const dist = new Map<string, number>()
    for (const edge of inst.node.outcomes)
      dist.set(edge.label, resolveProbability(inst.node, edge, inst.history))
    return dist
  }

  // Table preservation (in-place pill reorder): a conditional table's condition
  // tokens are `oldAncestorId:label`. After the rebuild the ancestor is a NEW
  // node, so remap each token to the ancestor's new node id on the current path.
  const oldIdToVar = new Map<string, string>()
  if (preserveTables) {
    const walk = (n: TreeNodeType): void => {
      oldIdToVar.set(n.id, n.variableId)
      for (const o of n.outcomes) if (o.child) walk(o.child)
    }
    walk(c.root)
  }
  const remapTable = (
    table: ConditionalRow[],
    pathNodes: Map<string, TreeNodeType>,
  ): ConditionalRow[] =>
    table.map((row) => ({
      condition: new Set(
        [...row.condition].map((tok) => {
          const sep = tok.indexOf(':')
          const oldId = tok.slice(0, sep)
          const label = tok.slice(sep + 1)
          const varOfTok = oldIdToVar.get(oldId)
          const newNode = varOfTok ? pathNodes.get(varOfTok) : undefined
          return newNode ? `${newNode.id}:${label}` : tok
        }),
      ),
      probabilities: { ...row.probabilities },
    }))

  // Per-variable instance counter, so preserved groups get contiguous
  // instanceIndex values (0 = primary) for correct prime-mark display.
  const instCount = new Map<string, number>()
  const makeNode = (v: CanonicalVar): TreeNodeType => {
    const node = new TreeNode(nid(), v.nodeType, v.displayLabel)
    if (preserveGroups) {
      node.variableId = v.variableId
      node.instanceIndex = instCount.get(v.variableId) ?? 0
      instCount.set(v.variableId, node.instanceIndex + 1)
    }
    return node
  }

  type Built = { kind: 'terminal'; value: number } | { kind: 'node'; node: TreeNodeType }

  const build = (
    assign: Map<string, string>,
    k: number,
    pathNodes: Map<string, TreeNodeType>,
  ): Built => {
    while (k < order.length && !anyCompatiblePathIncludes(assign, order[k].variableId)) k++
    if (k === order.length) return { kind: 'terminal', value: evaluate(assign) }

    const v = order[k]
    const node = makeNode(v)

    // Distribution + (for pill reorder) preserved conditional table.
    let dist: Map<string, number> | undefined
    let tableToCopy: ConditionalRow[] | undefined
    if (v.nodeType === 'chance') {
      if (preserveTables) {
        // Keep the tree faithful: BASE probabilities from the original instance,
        // and its conditional table copied with tokens re-pointed to the new
        // ancestor ids (the ancestors are already in `pathNodes`).
        const inst = originalInstance(assign, v.variableId)
        if (inst) {
          dist = new Map(inst.node.outcomes.map((o) => [o.label, o.probability]))
          if (inst.node.conditionalTable.length > 0) {
            tableToCopy = remapTable(inst.node.conditionalTable, pathNodes)
          }
        }
      } else if (v.hasTable) {
        dist = resolveWallDist(assign, v.variableId) ?? undefined
      } else {
        dist = c.distGroups.get(v.variableId)
      }
    }
    if (tableToCopy) node.conditionalTable = tableToCopy

    const childPath = new Map(pathNodes).set(v.variableId, node)
    for (const outLabel of v.outcomeLabels) {
      const probability = dist ? (dist.get(outLabel) ?? NaN) : NaN
      const sub = build(new Map(assign).set(v.variableId, outLabel), k + 1, childPath)
      if (sub.kind === 'terminal') {
        addOutcome(node, outLabel, probability, Number.isNaN(sub.value) ? undefined : sub.value)
      } else {
        const edge = addOutcome(node, outLabel, probability)
        setChild(node, edge, sub.node)
      }
    }
    return { kind: 'node', node }
  }

  const built = build(new Map(), 0, new Map())
  if (built.kind === 'terminal') {
    throw new FlipError(t().flipNoVars)
  }
  return built.node
}

/** Segment-wise reversal order: conditional-table levels ("walls") stay fixed
 * in place, and each run of levels between walls (or between a wall and an end)
 * is reversed independently. With NO walls this is a plain full reversal of the
 * whole sequence — so a table-free tree behaves exactly as before (segment 22).
 * A wall's determining ancestors are all at lower depth, hence in an earlier
 * segment, hence still before the wall after reversal — so its context stays
 * resolvable. */
function segmentReverseOrder(canonical: CanonicalVar[]): CanonicalVar[] {
  const order: CanonicalVar[] = []
  let segment: CanonicalVar[] = []
  for (const v of canonical) {
    if (v.hasTable) {
      order.push(...segment.reverse())
      segment = []
      order.push(v) // wall stays put
    } else {
      segment.push(v)
    }
  }
  order.push(...segment.reverse())
  return order
}

/** Segment-wise reversal (segment 29, generalizes the segment-22 full reversal):
 * reverses the node sequence along every path, BUT treats a conditional-table
 * node as a fixed "breaking point" — the levels on each side of it reverse
 * independently while it stays in place, so its distribution (which depends on
 * ancestors that stay before it) is still well-defined. A tree with no
 * conditional tables reverses in full, exactly as before. Each moved chance node
 * keeps its outcomes; a wall node's context-dependent distribution is resolved
 * per-branch. Not strict "value of clairvoyance" — the app shows VOC as the
 * direction-agnostic |EV_left − EV_right|. */
export function reverseTreeWithBayes(root: TreeNodeType): FlipResult {
  const c = collectCanonical(root)
  const order = segmentReverseOrder(c.canonical)
  let idCounter = 0
  const flipped = buildFromOrder(c, order, () => `flip_${++idCounter}`, false)

  let originalEv = NaN
  let flippedEv = NaN
  try {
    originalEv = calculateExpectedValue(root)
  } catch {
    /* incomplete tree -> NaN */
  }
  try {
    flippedEv = calculateExpectedValue(flipped)
  } catch {
    /* incomplete tree -> NaN */
  }

  return { flipped, voc: flippedEv - originalEv, originalEv, flippedEv }
}

/** Swaps two ADJACENT levels of the tree (`upperDepth` and `upperDepth + 1`),
 * returning a fresh restructured tree — the in-place pill-drag reorder. Linked
 * groups AND conditional tables are preserved (`preserveTables`: tables are
 * copied with their condition tokens re-pointed to the new ancestor ids).
 *
 * Conditional tables are allowed EXCEPT when the swap would break a dependency:
 * the LOWER level may not move above a level its own conditional table depends
 * on (that determining ancestor must stay before it). An independent level can
 * freely move past a conditional-table node. Also fails loud when the tree isn't
 * level-consistent (an unlinked instance breaks a level's single-variable
 * identity) or `upperDepth` is out of range. */
export function reorderAdjacentLevels(
  root: TreeNodeType,
  upperDepth: number,
  nid: () => string,
): TreeNodeType {
  const c = collectCanonical(root)
  if (upperDepth < 0 || upperDepth + 1 >= c.canonical.length) {
    throw new FlipError(t().flipReorderNoNeighbour)
  }
  const upper = c.canonical[upperDepth]
  const lower = c.canonical[upperDepth + 1]

  // Fall-1 block: does the LOWER level's conditional table depend on the UPPER
  // level? If so, swapping would put the upper level after something that
  // depends on it — refuse. (A table can only reference ancestors, i.e. higher
  // levels, so the reverse can't happen.)
  const oldIdToVar = new Map<string, string>()
  const walk = (n: TreeNodeType): void => {
    oldIdToVar.set(n.id, n.variableId)
    for (const o of n.outcomes) if (o.child) walk(o.child)
  }
  walk(root)
  const dependsOnUpper = (n: TreeNodeType): boolean =>
    n.variableId === lower.variableId &&
    n.conditionalTable.some((row) =>
      [...row.condition].some((tok) => oldIdToVar.get(tok.slice(0, tok.indexOf(':'))) === upper.variableId),
    )
  const anyLowerDependsOnUpper = (n: TreeNodeType): boolean => {
    if (dependsOnUpper(n)) return true
    for (const o of n.outcomes) if (o.child && anyLowerDependsOnUpper(o.child)) return true
    return false
  }
  if (anyLowerDependsOnUpper(root)) {
    throw new FlipError(t().flipReorderDependency(lower.displayLabel, upper.displayLabel))
  }

  const order = c.canonical.slice()
  ;[order[upperDepth], order[upperDepth + 1]] = [order[upperDepth + 1], order[upperDepth]]
  return buildFromOrder(c, order, nid, true, true)
}
