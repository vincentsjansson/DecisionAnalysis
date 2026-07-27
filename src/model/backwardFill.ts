import type { Outcome, TreeNode } from './tree'
import { branchLabel } from './tree'
import { resolveProbability } from './conditionalProbability'

export class BackwardFillError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BackwardFillError'
  }
}

export interface SiblingAdjustment {
  edge: Outcome
  oldProbability: number
  newProbability: number
}

/** Everything the UI needs to report exactly what changed — legacy applied
 * the adjustment silently and only wrote it to debug output. */
export interface BackwardFillResult {
  /** The node whose outgoing edge probability was adjusted. */
  node: TreeNode
  /** The on-path edge that was adjusted. */
  edge: Outcome
  oldProbability: number
  newProbability: number
  /** Proportional renormalization applied to the adjusted edge's siblings. */
  siblings: SiblingAdjustment[]
}

interface PathStep {
  node: TreeNode
  edge: Outcome
  /** Probability factor this step contributes to the joint product.
   * Decision-node edges contribute 1 (the decision-maker chooses). */
  factor: number
  /** True when this step's edge probability can be solved for. */
  adjustable: boolean
}

/** Sets the joint probability of reaching `target` to `targetProbability` by
 * adjusting exactly one edge probability along the path from `root`:
 * the first node (walking from the root) with more than one outcome whose
 * on-path edge can take a valid solved probability. The edge's siblings are
 * then proportionally renormalized so the node still sums to 1.
 *
 * Edges governed by a matching conditional-table entry are never auto-adjusted
 * (changing their base probability would not change the resolved value — a
 * silent no-op, which is exactly the legacy failure mode this rebuild avoids).
 * Throws `BackwardFillError` when no valid adjustment exists. */
export function backwardFill(
  root: TreeNode,
  target: TreeNode,
  targetProbability: number,
): BackwardFillResult {
  if (!(targetProbability > 0 && targetProbability <= 1)) {
    throw new BackwardFillError(
      `Target joint probability must be in (0, 1], got ${targetProbability}`,
    )
  }

  // Climb parent pointers to establish the root → target node chain.
  const chain: TreeNode[] = []
  for (let n: TreeNode | null = target; n !== null; n = n.parent) chain.unshift(n)
  if (chain[0] !== root) {
    throw new BackwardFillError(`Node "${target.id}" is not part of the tree rooted at "${root.id}"`)
  }
  if (chain.length < 2) {
    throw new BackwardFillError('Target is the root — there is no path to adjust')
  }

  // Walk forward, resolving each step's effective probability with the
  // accumulated history (single token format via branchLabel).
  const steps: PathStep[] = []
  const history = new Set<string>()
  for (let i = 0; i < chain.length - 1; i++) {
    const node = chain[i]
    const next = chain[i + 1]
    const edge = node.children.find((e) => e.child === next)
    if (!edge) {
      throw new BackwardFillError(`No edge from "${node.id}" to "${next.id}" — tree links are inconsistent`)
    }

    const isOutcome = node.nodeType === 'outcome'
    const factor = isOutcome ? resolveProbability(node, edge, history) : 1
    const conditionalGoverned = edge.conditionalTable.some((entry) => {
      for (const token of entry.condition) if (!history.has(token)) return false
      return true
    })

    steps.push({
      node,
      edge,
      factor,
      adjustable: isOutcome && node.children.length > 1 && !conditionalGoverned,
    })
    history.add(branchLabel(node, edge.label))
  }

  // First adjustable node (from the root) whose solved probability is valid.
  for (const step of steps) {
    if (!step.adjustable) continue

    let productOthers = 1
    let valid = true
    for (const other of steps) {
      if (other === step) continue
      if (!(other.factor > 0)) {
        valid = false // covers 0, negative, and NaN
        break
      }
      productOthers *= other.factor
    }
    if (!valid) continue

    const solved = targetProbability / productOthers
    if (!(solved > 0 && solved <= 1)) continue

    const oldProbability = step.edge.probability
    step.edge.probability = solved

    const siblings = step.node.children.filter((e) => e !== step.edge)
    const remaining = 1 - solved
    const finite = siblings.every((e) => Number.isFinite(e.probability))
    const siblingSum = siblings.reduce((s, e) => s + e.probability, 0)

    const adjustments: SiblingAdjustment[] = siblings.map((e) => {
      const old = e.probability
      e.probability =
        finite && siblingSum > 0
          ? (old / siblingSum) * remaining
          : remaining / siblings.length
      return { edge: e, oldProbability: old, newProbability: e.probability }
    })

    return {
      node: step.node,
      edge: step.edge,
      oldProbability,
      newProbability: solved,
      siblings: adjustments,
    }
  }

  throw new BackwardFillError(
    `No valid single-edge adjustment along the path to "${target.id}" can reach ` +
      `joint probability ${targetProbability}. Upstream probabilities are fixed, zero, ` +
      `unset, or governed by conditional tables.`,
  )
}
