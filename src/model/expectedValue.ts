import type { Outcome, TreeNode } from './tree'
import { branchLabel } from './tree'
import { resolveProbability } from './conditionalProbability'

/** Recursively computes the expected value of `node`, given the path taken
 * to reach it (`historySet`). Works at every node, not just leaves:
 * - leaf: its fixed payoff
 * - outcome: probability-weighted average of children's EV
 * - decision: max of children's EV */
export function calculateExpectedValue(
  node: TreeNode,
  historySet: Set<string> = new Set(),
): number {
  if (node.nodeType === 'leaf') {
    return node.payoff!
  }

  if (node.children.length === 0) {
    throw new Error(`Node "${node.id}" (${node.nodeType}) has no children`)
  }

  const childEv = (edge: Outcome): number => {
    if (!edge.child) {
      throw new Error(`Edge "${edge.label}" on node "${node.id}" has no child attached`)
    }
    const nextHistory = new Set(historySet)
    nextHistory.add(branchLabel(node, edge.label))
    return calculateExpectedValue(edge.child, nextHistory)
  }

  if (node.nodeType === 'decision') {
    return Math.max(...node.children.map(childEv))
  }

  // outcome node: probability-weighted average
  return node.children.reduce((total, edge) => {
    const probability = resolveProbability(node, edge, historySet)
    return total + probability * childEv(edge)
  }, 0)
}
