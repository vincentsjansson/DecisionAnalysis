import type { Outcome, TreeNode } from './tree'
import { branchLabel } from './tree'
import { resolveProbability } from './conditionalProbability'

/** Recursively computes the expected value of `node`, given the path taken
 * to reach it (`historySet`). Works at every node, not just endpoints:
 * - terminal outcome: its payoff `value` (undefined -> NaN, shown as "–")
 * - chance node: probability-weighted average over its outcomes
 * - decision node: max over its alternatives
 * A node with no outcomes has no defined EV and throws — the UI shows "–". */
export function calculateExpectedValue(
  node: TreeNode,
  historySet: Set<string> = new Set(),
): number {
  if (node.outcomes.length === 0) {
    throw new Error(`Node "${node.id}" (${node.nodeType}) has no outcomes`)
  }

  const branchValue = (edge: Outcome): number => {
    if (edge.child) {
      const nextHistory = new Set(historySet)
      nextHistory.add(branchLabel(node, edge.label))
      return calculateExpectedValue(edge.child, nextHistory)
    }
    return edge.value ?? NaN
  }

  if (node.nodeType === 'decision') {
    return Math.max(...node.outcomes.map(branchValue))
  }

  return node.outcomes.reduce((total, edge) => {
    const probability = resolveProbability(node, edge, historySet)
    return total + probability * branchValue(edge)
  }, 0)
}
