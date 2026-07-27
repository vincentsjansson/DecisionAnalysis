import type { NodeType, TreeNode as TreeNodeType } from './tree'
import { addOutcome, branchLabel, setChild, TreeNode } from './tree'
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

/** A "variable" in the canonical sequence: identified by node label + type.
 * In a true tree the same variable appears as separate node objects on
 * different branches — label is what ties them together. */
interface CanonicalVar {
  label: string
  nodeType: NodeType
  outcomeLabels: string[]
}

interface PathInfo {
  /** variable label -> outcome label taken, for every variable on the path */
  assignment: Map<string, string>
  varsIncluded: Set<string>
}

const DIST_EPSILON = 1e-9
const VOC_EPSILON = 1e-9

function fmtP(p: number): string {
  return Number.isFinite(p) ? String(parseFloat(p.toPrecision(4))) : '–'
}

function fmtDist(dist: Map<string, number>): string {
  return [...dist].map(([label, p]) => `${label} ${fmtP(p)}`).join(' / ')
}

function describeContext(assignment: Map<string, string>): string {
  return [...assignment].map(([k, v]) => `${k}=${v}`).join(' → ')
}

/** The VOC ≥ 0 invariant: perfect information can never hurt. A genuinely
 * negative value means the reversal itself is buggy — refuse to show it.
 * Tiny negative float noise is clamped to 0. */
export function ensureVocInvariant(voc: number): number {
  if (!Number.isFinite(voc)) return voc
  if (voc < -VOC_EPSILON) {
    throw new FlipError(
      `Internal consistency check failed: VOC = ${voc} is negative, which is ` +
        `impossible for correct clairvoyance (perfect information cannot make the ` +
        `decision-maker worse off). Refusing to display a wrong number — this is a bug.`,
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
    throw new FlipError('Cannot flip: the tree has no outcomes yet.')
  }

  // ── Collect: canonical variable sequence, per-context chance
  //    distributions, and every path's variable assignment. ──
  const canonical: CanonicalVar[] = []
  const paths: PathInfo[] = []
  const distGroups = new Map<string, { dist: Map<string, number>; desc: string }>()

  const chanceContextKey = (depth: number, label: string, assignment: Map<string, string>): string => {
    const parts: string[] = []
    for (let i = 0; i < depth; i++) {
      if (canonical[i].nodeType === 'chance') {
        parts.push(`${canonical[i].label}=${assignment.get(canonical[i].label)}`)
      }
    }
    return `${depth}|${label}|${parts.join('|')}`
  }

  const visit = (
    node: TreeNodeType,
    depth: number,
    history: Set<string>,
    assignment: Map<string, string>,
  ): void => {
    const where = describeContext(assignment) || '(rot)'
    const existing = canonical[depth]
    if (!existing) {
      for (let i = 0; i < depth; i++) {
        if (canonical[i].label === node.label) {
          throw new FlipError(
            `Cannot flip: the variable "${node.label}" appears at two different levels ` +
              `(level ${i + 1} and level ${depth + 1} via ${where}). Give the variables unique names.`,
          )
        }
      }
      canonical[depth] = {
        label: node.label,
        nodeType: node.nodeType,
        outcomeLabels: node.outcomes.map((o) => o.label),
      }
    } else {
      if (existing.label !== node.label || existing.nodeType !== node.nodeType) {
        throw new FlipError(
          `Cannot flip: at level ${depth + 1}, one branch has ${existing.nodeType} ` +
            `"${existing.label}" but the branch via ${where} has ${node.nodeType} ` +
            `"${node.label}". All paths must pass the same variables in the same order.`,
        )
      }
      const expected = [...existing.outcomeLabels].sort().join(', ')
      const got = node.outcomes.map((o) => o.label).sort().join(', ')
      if (expected !== got) {
        throw new FlipError(
          `Cannot flip: variable "${node.label}" has outcomes {${got}} via ${where} ` +
            `but {${expected}} elsewhere — the same variable must have the same outcomes everywhere.`,
        )
      }
    }
    if (node.outcomes.length === 0) {
      throw new FlipError(`Cannot flip: node "${node.label}" (via ${where}) has no outcomes.`)
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
          `Cannot flip: the probabilities of "${node.label}" (via ${where}) sum to ` +
            `${fmtP(sum)}, expected 1 — fix them before flipping.`,
        )
      }

      const key = chanceContextKey(depth, node.label, assignment)
      const prev = distGroups.get(key)
      if (prev) {
        for (const [label, p] of dist) {
          const q = prev.dist.get(label)!
          const equal = (Number.isNaN(p) && Number.isNaN(q)) || Math.abs(p - q) <= DIST_EPSILON
          if (!equal) {
            throw new FlipError(
              `Cannot flip: the distribution of "${node.label}" differs between branches — ` +
                `via ${prev.desc}: ${fmtDist(prev.dist)}, but via ${where}: ${fmtDist(dist)}. ` +
                `Clairvoyance ("learn the outcome before deciding") is only defined when ` +
                `chance probabilities do not depend on the decision path.`,
            )
          }
        }
      } else {
        distGroups.set(key, { dist, desc: where })
      }
    }

    for (const edge of node.outcomes) {
      const nextAssignment = new Map(assignment)
      nextAssignment.set(node.label, edge.label)
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
  const anyCompatiblePathIncludes = (assign: Map<string, string>, varLabel: string): boolean =>
    paths.some((p) => p.varsIncluded.has(varLabel) && compatible(p, assign))

  /** Evaluates the original tree as a payoff function of a full variable
   * assignment. Early-terminating original paths simply ignore the assigned
   * values of the variables they skip — the textbook duplication rule. */
  const evaluate = (assign: Map<string, string>): number => {
    let node = root
    for (;;) {
      const outLabel = assign.get(node.label)!
      const edge = node.outcomes.find((o) => o.label === outLabel)!
      if (edge.child) node = edge.child
      else return edge.value ?? NaN
    }
  }

  type Built = { kind: 'terminal'; value: number } | { kind: 'node'; node: TreeNodeType }

  const build = (assign: Map<string, string>, k: number): Built => {
    while (k < order.length && !anyCompatiblePathIncludes(assign, order[k].v.label)) k++
    if (k === order.length) return { kind: 'terminal', value: evaluate(assign) }

    const { v, i } = order[k]
    const node = new TreeNode(nid(), v.nodeType, v.label)
    const dist =
      v.nodeType === 'chance'
        ? distGroups.get(chanceContextKey(i, v.label, assign))?.dist
        : undefined

    for (const outLabel of v.outcomeLabels) {
      const probability = dist ? (dist.get(outLabel) ?? NaN) : NaN
      const sub = build(new Map(assign).set(v.label, outLabel), k + 1)
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
    throw new FlipError('Cannot flip: the tree has no variables to reorder.')
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
