import type { TreeNode } from './tree'
import { resolveProbability } from './conditionalProbability'

const TOLERANCE = 1e-6

export class ProbabilitySumError extends Error {
  nodeId: string
  sum: number

  constructor(nodeId: string, sum: number) {
    super(
      `Node "${nodeId}": outcome probabilities sum to ${sum}, expected 1 (±${TOLERANCE}).`,
    )
    this.name = 'ProbabilitySumError'
    this.nodeId = nodeId
    this.sum = sum
  }
}

/** Sums the resolved probabilities of `node`'s outcomes for the given
 * history. Only meaningful for chance nodes — always 1 for decision nodes
 * since their alternatives carry no probabilities. */
export function sumProbabilities(node: TreeNode, historySet: Set<string>): number {
  if (node.nodeType !== 'chance') return 1
  return node.outcomes.reduce(
    (total, edge) => total + resolveProbability(node, edge, historySet),
    0,
  )
}

/** Throws `ProbabilitySumError` if `node`'s outcome probabilities (for the
 * given history) don't sum to 1 within tolerance. Deliberately does not
 * normalize — a wrong sum should surface, not be silently corrected. */
export function validateProbabilities(node: TreeNode, historySet: Set<string>): void {
  if (node.nodeType !== 'chance') return

  const sum = sumProbabilities(node, historySet)
  if (Math.abs(sum - 1) > TOLERANCE) {
    throw new ProbabilitySumError(node.id, sum)
  }
}
