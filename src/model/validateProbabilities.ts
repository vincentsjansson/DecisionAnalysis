import type { TreeNode } from './tree'
import { resolveProbability } from './conditionalProbability'

const TOLERANCE = 1e-6

export class ProbabilitySumError extends Error {
  nodeId: string
  sum: number

  constructor(nodeId: string, sum: number) {
    super(
      `Node "${nodeId}": conditional probabilities sum to ${sum}, expected 1 (±${TOLERANCE}).`,
    )
    this.name = 'ProbabilitySumError'
    this.nodeId = nodeId
    this.sum = sum
  }
}

/** Sums the resolved probabilities of `node`'s outgoing edges for the given
 * history. Only meaningful for `outcome` nodes — always 1 for other node
 * types since there's nothing to validate. */
export function sumProbabilities(node: TreeNode, historySet: Set<string>): number {
  if (node.nodeType !== 'outcome') return 1
  return node.children.reduce(
    (total, edge) => total + resolveProbability(node, edge, historySet),
    0,
  )
}

/** Throws `ProbabilitySumError` if `node`'s outgoing probabilities (for the
 * given history) don't sum to 1 within tolerance. Deliberately does not
 * normalize — a wrong sum should surface, not be silently corrected. */
export function validateProbabilities(node: TreeNode, historySet: Set<string>): void {
  if (node.nodeType !== 'outcome') return

  const sum = sumProbabilities(node, historySet)
  if (Math.abs(sum - 1) > TOLERANCE) {
    throw new ProbabilitySumError(node.id, sum)
  }
}
