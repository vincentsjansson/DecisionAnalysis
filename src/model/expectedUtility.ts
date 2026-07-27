import type { Outcome, TreeNode } from './tree'
import { branchLabel } from './tree'
import { resolveProbability } from './conditionalProbability'
import { applyInverseUtility, applyUtility } from './utility'
import type { UtilityFunction } from './utility'

/** Expected Utility: the same recursion as `calculateExpectedValue`, but
 * terminal payoffs are transformed through the utility function before being
 * combined. Decision = max of children's EU (u is increasing, so maximizing
 * utility ranks alternatives the same as maximizing money), chance =
 * probability-weighted average of children's EU. */
export function calculateEU(
  node: TreeNode,
  utilityFn: UtilityFunction,
  historySet: Set<string> = new Set(),
): number {
  if (node.outcomes.length === 0) {
    throw new Error(`Node "${node.id}" (${node.nodeType}) has no outcomes`)
  }

  const branchUtility = (edge: Outcome): number => {
    if (edge.child) {
      const nextHistory = new Set(historySet)
      nextHistory.add(branchLabel(node, edge.label))
      return calculateEU(edge.child, utilityFn, nextHistory)
    }
    return applyUtility(edge.value ?? NaN, utilityFn)
  }

  if (node.nodeType === 'decision') {
    return Math.max(...node.outcomes.map(branchUtility))
  }

  return node.outcomes.reduce((total, edge) => {
    const probability = resolveProbability(node, edge, historySet)
    return total + probability * branchUtility(edge)
  }, 0)
}

/** Certainty Equivalent: the guaranteed money amount that is exactly as
 * desirable as the risky prospect under this utility function. Equals EV when
 * the utility is linear (risk-neutral); is strictly below EV for a
 * risk-averse (concave) utility on any prospect with nonzero variance. */
export function certaintyEquivalent(
  node: TreeNode,
  utilityFn: UtilityFunction,
  historySet: Set<string> = new Set(),
): number {
  return applyInverseUtility(calculateEU(node, utilityFn, historySet), utilityFn)
}
