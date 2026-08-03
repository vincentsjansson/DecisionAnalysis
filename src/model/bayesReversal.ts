import type { NodeType, TreeNode as TreeNodeType } from './tree'
import { addOutcome, branchLabel, displayName, setChild, TreeNode } from './tree'
import { resolveProbability } from './conditionalProbability'
import { calculateExpectedValue } from './expectedValue'

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
 * base name) is kept for user-facing messages and the flipped node's name. */
interface CanonicalVar {
  variableId: string
  displayLabel: string
  nodeType: NodeType
  outcomeLabels: string[]
}

interface PathInfo {
  /** variableId -> outcome label taken, for every variable on the path */
  assignment: Map<string, string>
  varsIncluded: Set<string>
}

const DIST_EPSILON = 1e-9
const VOC_EPSILON = 1e-9

/** Node type in Swedish, for user-facing flip error messages. */
function typeSv(t: NodeType): string {
  return t === 'chance' ? 'slumpnod' : 'beslutsnod'
}

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

/** Full sequence reversal (segment 22, 2026-08-03/04 — replaces the earlier
 * classical-clairvoyance chance-before-decision reversal).
 *
 * The flipped tree reverses the ENTIRE node sequence along every path,
 * regardless of node type: a→b→c becomes c→b→a. This is a purely structural/
 * positional mirror, not a Bayesian posterior computation — each moved node
 * keeps its OWN outcome set and the probabilities already attached to those
 * outcomes, copied unchanged from the original tree. There is no "value of
 * clairvoyance" semantics anymore (a decision node can end up earlier than
 * information it originally depended on), so EV is not guaranteed to increase
 * — VOC is displayed by the app as the direction-agnostic |EV_left − EV_right|.
 *
 * Early termination (the textbook duplication rule) still works exactly as
 * before: `canonical` establishes one variable per depth from the longest
 * paths, shorter paths simply don't include later variables, and `build`
 * skips a variable when no path compatible with the current assignment
 * includes it — this logic doesn't care what order `order` visits variables
 * in, so it is unchanged by the switch to full reversal.
 *
 * The one thing full reversal cannot support: a chance node whose probability
 * genuinely depends on context (a conditional table that varies by branch).
 * In the old algorithm this was fine because the deciding ancestor was always
 * placed earlier (chance-before-decision). Under a full reversal an ancestor
 * can end up LATER than the node it would have determined — at the point the
 * node is built there is no way to know which of its context-dependent
 * distributions applies — so this fails loud with `FlipError` rather than
 * guessing. A chance node with a single, context-independent distribution
 * (the common case, and the only one linked-group probability sync produces)
 * is unaffected. */
export function reverseTreeWithBayes(root: TreeNodeType): FlipResult {
  if (root.outcomes.length === 0) {
    throw new FlipError('Kan inte vända: trädet har inga utfall än.')
  }

  // ── Collect: canonical variable sequence, each chance variable's own
  //    (context-independent) distribution, and every path's variable
  //    assignment. Variables are identified by variableId (linked instances
  //    share one), not by a coincidental label match. ──
  const canonical: CanonicalVar[] = []
  const paths: PathInfo[] = []
  // Keyed by variableId only (NOT by preceding context): a full reversal can
  // place a node's determining ancestor after it, so the node's distribution
  // must be the same everywhere it occurs — see the FlipError below.
  const distGroups = new Map<string, { dist: Map<string, number>; desc: string }>()
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
          throw new FlipError(
            `Kan inte vända: variabeln "${displayName(node)}" förekommer på två olika nivåer ` +
              `(nivå ${i + 1} och nivå ${depth + 1} via ${where}). En variabel kan inte förekomma två gånger på samma väg.`,
          )
        }
      }
      canonical[depth] = {
        variableId: node.variableId,
        displayLabel: node.label,
        nodeType: node.nodeType,
        outcomeLabels: node.outcomes.map((o) => o.label),
      }
    } else {
      if (existing.variableId !== node.variableId || existing.nodeType !== node.nodeType) {
        throw new FlipError(
          `Kan inte vända: på nivå ${depth + 1} har en gren ${typeSv(existing.nodeType)} ` +
            `"${existing.displayLabel}" men grenen via ${where} har ${typeSv(node.nodeType)} ` +
            `"${displayName(node)}". Alla vägar måste passera samma variabler i samma ordning. ` +
            `(Två noder med samma namn behandlas som samma variabel bara när de är länkade.)`,
        )
      }
      const expected = [...existing.outcomeLabels].sort().join(', ')
      const got = node.outcomes.map((o) => o.label).sort().join(', ')
      if (expected !== got) {
        throw new FlipError(
          `Kan inte vända: variabeln "${displayName(node)}" har utfallen {${got}} via ${where} ` +
            `men {${expected}} någon annanstans — samma variabel måste ha samma utfall överallt.`,
        )
      }
    }
    if (node.outcomes.length === 0) {
      throw new FlipError(`Kan inte vända: noden "${displayName(node)}" (via ${where}) har inga utfall.`)
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
        throw new FlipError(
          `Kan inte vända: sannolikheterna för "${displayName(node)}" (via ${where}) summerar till ` +
            `${fmtP(sum)}, förväntat 1 — rätta dem innan du vänder.`,
        )
      }

      const prev = distGroups.get(node.variableId)
      if (prev) {
        for (const [label, p] of dist) {
          const q = prev.dist.get(label)!
          const equal = (Number.isNaN(p) && Number.isNaN(q)) || Math.abs(p - q) <= DIST_EPSILON
          if (!equal) {
            throw new FlipError(
              `Kan inte vända: "${displayName(node)}" har olika sannolikheter beroende på kontext — ` +
                `via ${prev.desc}: ${fmtDist(prev.dist)}, men via ${where}: ${fmtDist(dist)}. ` +
                `En fullständig sekvensvändning kräver att varje nod har SAMMA sannolikheter ` +
                `överallt, eftersom förfadern som villkoret beror på kan hamna efter noden i den ` +
                `vända ordningen — ta bort villkorstabellen eller gör sannolikheterna kontextoberoende.`,
            )
          }
        }
      } else {
        distGroups.set(node.variableId, { dist, desc: where })
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

  // ── Build the flipped tree: the ENTIRE canonical sequence reversed,
  //    regardless of node type (full sequence reversal, not chance-first). ──
  const order = canonical.map((v, i) => ({ v, i })).reverse()

  let idCounter = 0
  const nid = (): string => `flip_${++idCounter}`

  const compatible = (path: PathInfo, assign: Map<string, string>): boolean => {
    for (const [key, value] of assign) {
      const pathValue = path.assignment.get(key)
      if (pathValue !== undefined && pathValue !== value) return false
    }
    return true
  }

  /** The duplication rule's flip side: a variable is only materialized in a
   * branch of the flipped tree if some original path compatible with the
   * branch actually passes it — otherwise every payoff in the branch is
   * independent of the variable and the level is skipped, mirroring the
   * original tree's early termination. Order-agnostic: works identically for
   * full reversal as it did for chance-first ordering. */
  const anyCompatiblePathIncludes = (assign: Map<string, string>, variableId: string): boolean =>
    paths.some((p) => p.varsIncluded.has(variableId) && compatible(p, assign))

  /** Evaluates the original tree as a payoff function of a full variable
   * assignment (keyed by variableId). Early-terminating original paths simply
   * ignore the assigned values of the variables they skip — the textbook
   * duplication rule. Order-agnostic: walks the ORIGINAL tree, independent of
   * what order the flipped tree was built in. */
  const evaluate = (assign: Map<string, string>): number => {
    let node = root
    for (;;) {
      const outLabel = assign.get(node.variableId)!
      const edge = node.outcomes.find((o) => o.label === outLabel)!
      if (edge.child) node = edge.child
      else return edge.value ?? NaN
    }
  }

  type Built = { kind: 'terminal'; value: number } | { kind: 'node'; node: TreeNodeType }

  const build = (assign: Map<string, string>, k: number): Built => {
    while (k < order.length && !anyCompatiblePathIncludes(assign, order[k].v.variableId)) k++
    if (k === order.length) return { kind: 'terminal', value: evaluate(assign) }

    const { v } = order[k]
    const node = new TreeNode(nid(), v.nodeType, v.displayLabel)
    // Each chance node keeps its own (context-independent) distribution —
    // copied unchanged, never recomputed for the new position.
    const dist = v.nodeType === 'chance' ? distGroups.get(v.variableId)?.dist : undefined

    for (const outLabel of v.outcomeLabels) {
      const probability = dist ? (dist.get(outLabel) ?? NaN) : NaN
      const sub = build(new Map(assign).set(v.variableId, outLabel), k + 1)
      if (sub.kind === 'terminal') {
        addOutcome(node, outLabel, probability, Number.isNaN(sub.value) ? undefined : sub.value)
      } else {
        const edge = addOutcome(node, outLabel, probability)
        setChild(node, edge, sub.node)
      }
    }
    return { kind: 'node', node }
  }

  const built = build(new Map(), 0)
  if (built.kind === 'terminal') {
    throw new FlipError('Kan inte vända: trädet har inga variabler att ordna om.')
  }
  const flipped = built.node

  // ── EVs, informational only (the app computes its own displayed VOC as
  //    |EV_left − EV_right|, independent of these fields). ──
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
