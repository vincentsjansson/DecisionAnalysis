import type { Outcome, TreeNode } from './tree'
import { branchLabel } from './tree'
import { matchRow, resolveProbability } from './conditionalProbability'

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
  /** The node whose outgoing outcome probability was adjusted. */
  node: TreeNode
  /** The on-path outcome that was adjusted. */
  edge: Outcome
  oldProbability: number
  newProbability: number
  /** Proportional renormalization applied to the adjusted outcome's siblings. */
  siblings: SiblingAdjustment[]
}

interface PathStep {
  node: TreeNode
  edge: Outcome
  /** Probability factor this step contributes to the joint product.
   * Decision-node alternatives contribute 1 (the decision-maker chooses). */
  factor: number
  adjustable: boolean
}

/** Sets the joint probability of the path ending in `targetEdge` (a terminal
 * outcome on `targetNode`) to `targetProbability`, by adjusting exactly one
 * outcome probability along the path from `root`: the first chance node
 * (walking from the root) with more than one outcome whose on-path outcome
 * can take a valid solved probability. That outcome's siblings are then
 * proportionally renormalized so the node still sums to 1.
 *
 * Outcomes whose probability is governed by a matching conditional row are
 * never auto-adjusted — changing their base probability would not change the
 * resolved value (a silent no-op, the exact legacy failure mode this rebuild
 * avoids). Throws `BackwardFillError` when no valid adjustment exists. */
export function backwardFill(
  root: TreeNode,
  targetNode: TreeNode,
  targetEdge: Outcome,
  targetProbability: number,
): BackwardFillResult {
  if (!(targetProbability > 0 && targetProbability <= 1)) {
    throw new BackwardFillError(
      `Target joint probability must be in (0, 1], got ${targetProbability}`,
    )
  }
  if (targetNode.outcomes.indexOf(targetEdge) === -1) {
    throw new BackwardFillError(
      `Outcome "${targetEdge.label}" does not belong to node "${targetNode.id}"`,
    )
  }

  // Climb parent pointers to establish the root -> targetNode chain.
  const chain: TreeNode[] = []
  for (let n: TreeNode | null = targetNode; n !== null; n = n.parent) chain.unshift(n)
  if (chain[0] !== root) {
    throw new BackwardFillError(
      `Node "${targetNode.id}" is not part of the tree rooted at "${root.id}"`,
    )
  }

  // Walk forward, resolving each step's effective probability with the
  // accumulated history (single token format via branchLabel). The final
  // step is the target edge itself.
  const steps: PathStep[] = []
  const history = new Set<string>()
  for (let i = 0; i < chain.length; i++) {
    const node = chain[i]
    const edge =
      i < chain.length - 1
        ? node.outcomes.find((o) => o.child === chain[i + 1])
        : targetEdge
    if (!edge) {
      throw new BackwardFillError(
        `No outcome from "${node.id}" to "${chain[i + 1].id}" — tree links are inconsistent`,
      )
    }

    const isChance = node.nodeType === 'chance'
    const factor = isChance ? resolveProbability(node, edge, history) : 1
    const row = matchRow(node, history)
    const conditionalGoverned = row !== null && edge.label in row.probabilities

    steps.push({
      node,
      edge,
      factor,
      adjustable: isChance && node.outcomes.length > 1 && !conditionalGoverned,
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

    const siblings = step.node.outcomes.filter((o) => o !== step.edge)
    const remaining = 1 - solved
    const finite = siblings.every((o) => Number.isFinite(o.probability))
    const siblingSum = siblings.reduce((s, o) => s + o.probability, 0)

    const adjustments: SiblingAdjustment[] = siblings.map((o) => {
      const old = o.probability
      o.probability =
        finite && siblingSum > 0
          ? (old / siblingSum) * remaining
          : remaining / siblings.length
      return { edge: o, oldProbability: old, newProbability: o.probability }
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
    `No valid single-outcome adjustment along the path to "${targetEdge.label}" can reach ` +
      `joint probability ${targetProbability}. Upstream probabilities are fixed, zero, ` +
      `unset, or governed by conditional rows.`,
  )
}
