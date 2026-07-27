import type { Outcome, TreeNode } from './tree'
import { branchLabel } from './tree'
import { resolveProbability } from './conditionalProbability'
import { calculateExpectedValue } from './expectedValue'
import { calculateEU, certaintyEquivalent } from './expectedUtility'
import { applyUtility } from './utility'
import type { UtilityFunction } from './utility'

export type DisplayMode = 'ev' | 'eu'

export interface TraceResult {
  /** true when a full arithmetic trace is available; false when data is
   * incomplete and `text` is the "can't compute" message. */
  ok: boolean
  text: string
}

const INCOMPLETE = 'Ofullständig data — kan inte visa beräkning'

/** Formats to ~4 significant figures, dropping float noise (4.199999… → 4.2). */
function num(x: number): string {
  return Number.isFinite(x) ? String(parseFloat(x.toPrecision(4))) : '–'
}

/** A one-level, human-readable trace of the arithmetic that produces a node's
 * displayed value — the actual weighted sum (chance) or max selection
 * (decision), using resolved, conditional-table-aware probabilities and real
 * child values. Deliberately a standalone reader: it reuses the existing
 * EV/EU/CE functions for child values rather than threading a collector
 * through their recursion, so those functions' signatures are unchanged. The
 * trace is one level deep — a child shown as a number can itself be selected
 * to see its own trace. */
export function traceNode(
  node: TreeNode,
  historySet: Set<string>,
  mode: DisplayMode,
  utilityFn?: UtilityFunction,
): TraceResult {
  if (node.outcomes.length === 0) return { ok: false, text: INCOMPLETE }

  const eu = mode === 'eu' && utilityFn !== undefined

  // The node's own displayed value; if it isn't finite, data is incomplete.
  let nodeValue: number
  try {
    nodeValue = eu
      ? certaintyEquivalent(node, utilityFn!, historySet)
      : calculateExpectedValue(node, historySet)
  } catch {
    return { ok: false, text: INCOMPLETE }
  }
  if (!Number.isFinite(nodeValue)) return { ok: false, text: INCOMPLETE }

  const childHistory = (edge: Outcome): Set<string> => {
    const next = new Set(historySet)
    next.add(branchLabel(node, edge.label))
    return next
  }
  const childEv = (edge: Outcome): number =>
    edge.child ? calculateExpectedValue(edge.child, childHistory(edge)) : (edge.value ?? NaN)
  const childEu = (edge: Outcome): number =>
    edge.child
      ? calculateEU(edge.child, utilityFn!, childHistory(edge))
      : applyUtility(edge.value ?? NaN, utilityFn!)
  const childCe = (edge: Outcome): number =>
    edge.child ? certaintyEquivalent(edge.child, utilityFn!, childHistory(edge)) : (edge.value ?? NaN)

  if (node.nodeType === 'chance') {
    if (eu) {
      // Honest arithmetic in EU mode is in utility space: EU = Σ p·u, then the
      // certainty equivalent CE = u⁻¹(EU). Showing the utility transform is the
      // pedagogical point of EU mode.
      const terms = node.outcomes.map(
        (edge) => `${num(resolveProbability(node, edge, historySet))} × ${num(childEu(edge))}`,
      )
      const euValue = calculateEU(node, utilityFn!, historySet)
      return {
        ok: true,
        text: `EU = ${terms.join(' + ')} = ${num(euValue)} → CE = ${num(nodeValue)}`,
      }
    }
    const terms = node.outcomes.map(
      (edge) => `${num(resolveProbability(node, edge, historySet))} × ${num(childEv(edge))}`,
    )
    return { ok: true, text: `${terms.join(' + ')} = ${num(nodeValue)}` }
  }

  // decision: max over branch values (CE in EU mode, EV otherwise — u is
  // increasing so the ranking is identical either way).
  const value = eu ? childCe : childEv
  let bestIdx = 0
  let bestVal = -Infinity
  node.outcomes.forEach((edge, i) => {
    const v = value(edge)
    if (v > bestVal) {
      bestVal = v
      bestIdx = i
    }
  })
  const branches = node.outcomes.map((edge) => `${edge.label}: ${num(value(edge))}`)
  return {
    ok: true,
    text: `max(${branches.join(', ')}) = ${num(nodeValue)} (välj ${node.outcomes[bestIdx].label})`,
  }
}

/** The utility transform at a terminal outcome — the actual step happening
 * there in EU mode ("u(8) = 4"). Trivial in EV mode (the value is the
 * payoff), so this is only meaningful for EU. */
export function traceTerminalUtility(
  value: number | undefined,
  utilityFn: UtilityFunction,
): TraceResult {
  if (value === undefined || !Number.isFinite(value)) return { ok: false, text: INCOMPLETE }
  return { ok: true, text: `u(${num(value)}) = ${num(applyUtility(value, utilityFn))}` }
}
