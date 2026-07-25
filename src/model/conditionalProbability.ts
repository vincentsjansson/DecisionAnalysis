import type { Outcome, TreeNode } from './tree'

export class AmbiguousConditionalProbabilityError extends Error {
  constructor(nodeId: string, size: number, conditions: Set<string>[]) {
    const rendered = conditions
      .map((c) => `{${[...c].sort().join(', ')}}`)
      .join(' vs ')
    super(
      `Node "${nodeId}": ${conditions.length} conditional-probability entries of size ${size} ` +
        `all match the current history and are equally specific (${rendered}). ` +
        `Define a unique most-specific condition, or remove the tie.`,
    )
    this.name = 'AmbiguousConditionalProbabilityError'
  }
}

function isSubset(sub: Set<string>, superset: Set<string>): boolean {
  for (const item of sub) {
    if (!superset.has(item)) return false
  }
  return true
}

/** Resolves the effective probability of `edge` given the path taken so far
 * (`historySet`). The most specific matching conditional entry wins (largest
 * condition size); a tie between equally-specific matches is a hard error
 * rather than an implicit, order-dependent pick. Falls back to the edge's
 * base probability when no conditional entry matches. */
export function resolveProbability(
  node: TreeNode,
  edge: Outcome,
  historySet: Set<string>,
): number {
  let bestSize = -1
  let bestMatches: Set<string>[] = []
  let bestProbability = edge.probability

  for (const entry of edge.conditionalTable) {
    if (!isSubset(entry.condition, historySet)) continue

    if (entry.condition.size > bestSize) {
      bestSize = entry.condition.size
      bestMatches = [entry.condition]
      bestProbability = entry.probability
    } else if (entry.condition.size === bestSize) {
      bestMatches.push(entry.condition)
    }
  }

  if (bestMatches.length > 1) {
    throw new AmbiguousConditionalProbabilityError(node.id, bestSize, bestMatches)
  }

  return bestProbability
}
