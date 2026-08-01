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
  /** EV(flipped) − EV(original), clamped of float noise; NaN when the tree
   * is incomplete. Guaranteed ≥ 0 — a genuinely negative value throws. */
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

/** The VOC ≥ 0 invariant: perfect information can never hurt. A genuinely
 * negative value means the reversal itself is buggy — refuse to show it.
 * Tiny negative float noise is clamped to 0. */
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

/** Classical clairvoyance flip with correct probability handling.
 *
 * Validates that every root-to-terminal path passes the same variables in the
 * same order (early termination allowed — the textbook duplication rule
 * applies: a terminal that skips later variables keeps its payoff under every
 * outcome of those variables). Then rebuilds the tree with all chance
 * variables ahead of all decisions ("what if we knew the outcomes before
 * deciding?"), as a genuinely new tree: fresh flip_N ids, one node copy per
 * branch, and each chance outcome carrying its context-resolved probability
 * P(V | earlier chance outcomes) as a plain base probability — no conditional
 * tables needed, since a true tree has no sharing to disambiguate.
 *
 * Chance variables keep their original relative order: for clairvoyance EV
 * (Σ_ω P(ω) · max over decisions) the internal chance order is irrelevant,
 * so no chance-vs-chance Bayes inversion is ever required — the "posteriors"
 * that matter are exactly these per-context distributions. What IS required,
 * and enforced, is that chance distributions do not depend on decision
 * branches — otherwise "learning the outcome before deciding" is circular
 * and the flip throws rather than fabricating a number. */
export function reverseTreeWithBayes(root: TreeNodeType): FlipResult {
  if (root.outcomes.length === 0) {
    throw new FlipError('Kan inte vända: trädet har inga utfall än.')
  }

  // ── Collect: canonical variable sequence, per-context chance
  //    distributions, and every path's variable assignment. Variables are
  //    identified by variableId (linked instances share one), not by a
  //    coincidental label match. ──
  const canonical: CanonicalVar[] = []
  const paths: PathInfo[] = []
  const distGroups = new Map<string, { dist: Map<string, number>; desc: string }>()
  const varName = new Map<string, string>() // variableId -> display name, for messages

  const chanceContextKey = (
    depth: number,
    variableId: string,
    assignment: Map<string, string>,
  ): string => {
    const parts: string[] = []
    for (let i = 0; i < depth; i++) {
      if (canonical[i].nodeType === 'chance') {
        parts.push(`${canonical[i].variableId}=${assignment.get(canonical[i].variableId)}`)
      }
    }
    return `${depth}|${variableId}|${parts.join('|')}`
  }

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

      const key = chanceContextKey(depth, node.variableId, assignment)
      const prev = distGroups.get(key)
      if (prev) {
        for (const [label, p] of dist) {
          const q = prev.dist.get(label)!
          const equal = (Number.isNaN(p) && Number.isNaN(q)) || Math.abs(p - q) <= DIST_EPSILON
          if (!equal) {
            throw new FlipError(
              `Kan inte vända: fördelningen för "${displayName(node)}" skiljer sig mellan grenar — ` +
                `via ${prev.desc}: ${fmtDist(prev.dist)}, men via ${where}: ${fmtDist(dist)}. ` +
                `Klarsyn ("få veta utfallet innan beslut") är bara definierat när ` +
                `slumpsannolikheter inte beror på beslutsvägen.`,
            )
          }
        }
      } else {
        distGroups.set(key, { dist, desc: where })
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

  // ── Build the flipped tree: chance variables first (original relative
  //    order), then decisions (original relative order). ──
  const order = [
    ...canonical.map((v, i) => ({ v, i })).filter((x) => x.v.nodeType === 'chance'),
    ...canonical.map((v, i) => ({ v, i })).filter((x) => x.v.nodeType === 'decision'),
  ]

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
   * original tree's early termination. */
  const anyCompatiblePathIncludes = (assign: Map<string, string>, variableId: string): boolean =>
    paths.some((p) => p.varsIncluded.has(variableId) && compatible(p, assign))

  /** Evaluates the original tree as a payoff function of a full variable
   * assignment (keyed by variableId). Early-terminating original paths simply
   * ignore the assigned values of the variables they skip — the textbook
   * duplication rule. */
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

    const { v, i } = order[k]
    const node = new TreeNode(nid(), v.nodeType, v.displayLabel)
    const dist =
      v.nodeType === 'chance'
        ? distGroups.get(chanceContextKey(i, v.variableId, assign))?.dist
        : undefined

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

  // ── EVs and the VOC invariant. ──
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

  const voc = ensureVocInvariant(flippedEv - originalEv)
  return { flipped, voc, originalEv, flippedEv }
}
