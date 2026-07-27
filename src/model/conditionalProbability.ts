import type { ConditionalRow, Outcome, TreeNode } from './tree'

export class AmbiguousConditionalProbabilityError extends Error {
  constructor(nodeId: string, size: number, conditions: Set<string>[]) {
    const rendered = conditions
      .map((c) => `{${[...c].sort().join(', ')}}`)
      .join(' vs ')
    super(
      `Node "${nodeId}": ${conditions.length} conditional rows of size ${size} ` +
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

/** Finds the conditional row that applies for `historySet`: the most specific
 * (largest condition) whose tokens are all present in the history. A tie
 * between equally-specific matches is a hard error, never an implicit
 * order-dependent pick. Returns null when no row matches. */
export function matchRow(node: TreeNode, historySet: Set<string>): ConditionalRow | null {
  let bestSize = -1
  let bestRows: ConditionalRow[] = []

  for (const row of node.conditionalTable) {
    if (!isSubset(row.condition, historySet)) continue
    if (row.condition.size > bestSize) {
      bestSize = row.condition.size
      bestRows = [row]
    } else if (row.condition.size === bestSize) {
      bestRows.push(row)
    }
  }

  if (bestRows.length > 1) {
    throw new AmbiguousConditionalProbabilityError(
      node.id,
      bestSize,
      bestRows.map((r) => r.condition),
    )
  }
  return bestRows[0] ?? null
}

/** Resolves the effective probability of `edge` out of `node`, given the path
 * taken so far. A matching conditional row that covers the outcome wins;
 * otherwise the outcome's base probability applies. */
export function resolveProbability(
  node: TreeNode,
  edge: Outcome,
  historySet: Set<string>,
): number {
  const row = matchRow(node, historySet)
  if (row && edge.label in row.probabilities) {
    return row.probabilities[edge.label]
  }
  return edge.probability
}
