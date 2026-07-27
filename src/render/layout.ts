import type { Outcome, TreeNode } from '../model/tree'
import { branchLabel } from '../model/tree'
import { resolveProbability } from '../model/conditionalProbability'

export const NODE_H = 40
export const MIN_NODE_W = 90
export const LEAF_W = 140
export const COL_GAP = 150
export const LEAF_SPACING = 64
export const PAD = 48

export interface NodeBox {
  node: TreeNode
  x: number
  y: number
  w: number
  h: number
  depth: number
  /** History set for the path root -> this node (branchLabel tokens). */
  history: Set<string>
}

/** A terminal outcome rendered as a leaf triangle with label/value/joint p. */
export interface LeafMark {
  node: TreeNode
  edge: Outcome
  x: number
  y: number
  /** Joint probability of the full path root -> this terminal outcome.
   * Chance steps multiply their resolved probability (NaN propagates —
   * unset stays visibly unset); decision steps contribute factor 1. */
  joint: number
}

export interface EdgeLine {
  parent: TreeNode
  edge: Outcome
  x1: number
  y1: number
  x2: number
  y2: number
  labelX: number
  labelY: number
}

export interface TreeLayout {
  boxes: NodeBox[]
  leaves: LeafMark[]
  edges: EdgeLine[]
  byNode: Map<TreeNode, NodeBox>
  width: number
  height: number
}

export function nodeWidth(label: string): number {
  return Math.max(MIN_NODE_W, label.length * 8 + 32)
}

/** Point on the rendered cubic bezier at parameter t. Control points sit at
 * 45% of the horizontal span, flat, matching renderTree's path. Labels are
 * placed at t = 0.75, where sibling curves have diverged to ~84% of their
 * vertical separation — this keeps labels apart at high branching factors
 * instead of stacking at the midpoint like legacy did. */
export function bezierPoint(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  t: number,
): { x: number; y: number } {
  const cp = (x2 - x1) * 0.45
  const c1x = x1 + cp
  const c2x = x2 - cp
  const u = 1 - t
  return {
    x: u * u * u * x1 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x2,
    y: u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2,
  }
}

const LABEL_T = 0.75

/** Computes positions for every node, terminal outcome, and edge. Terminal
 * outcomes get evenly spaced leaf slots (LEAF_SPACING apart — total height
 * auto-expands), nodes center on their branches, columns are sized by the
 * widest content at each depth. Pure function of the tree, recomputed from
 * scratch on every redraw. */
export function layoutTree(root: TreeNode): TreeLayout {
  // Column widths per depth (nodes and, one deeper than each node, leaves).
  const colW: number[] = []
  const bump = (depth: number, w: number): void => {
    colW[depth] = Math.max(colW[depth] ?? 0, w)
  }
  const measure = (node: TreeNode, depth: number): void => {
    bump(depth, nodeWidth(node.label))
    for (const edge of node.outcomes) {
      if (edge.child) measure(edge.child, depth + 1)
      else bump(depth + 1, LEAF_W)
    }
  }
  measure(root, 0)

  const colX: number[] = []
  let x = PAD
  for (let d = 0; d < colW.length; d++) {
    colX[d] = x + colW[d] / 2
    x += colW[d] + COL_GAP
  }

  const boxes: NodeBox[] = []
  const leaves: LeafMark[] = []
  const byNode = new Map<TreeNode, NodeBox>()
  let nextSlot = 0
  const slotY = (): number => PAD + nextSlot++ * LEAF_SPACING + NODE_H / 2

  const place = (node: TreeNode, depth: number, history: Set<string>, joint: number): NodeBox => {
    const branchYs: number[] = []

    // Empty node: occupies its own slot.
    if (node.outcomes.length === 0) {
      branchYs.push(slotY())
    }

    for (const edge of node.outcomes) {
      const isChance = node.nodeType === 'chance'
      const factor = isChance ? resolveProbability(node, edge, history) : 1
      const branchJoint = joint * factor

      if (edge.child) {
        const childHistory = new Set(history)
        childHistory.add(branchLabel(node, edge.label))
        const childBox = place(edge.child, depth + 1, childHistory, branchJoint)
        branchYs.push(childBox.y)
      } else {
        const y = slotY()
        leaves.push({
          node,
          edge,
          x: colX[depth + 1] - colW[depth + 1] / 2,
          y,
          joint: branchJoint,
        })
        branchYs.push(y)
      }
    }

    const box: NodeBox = {
      node,
      x: colX[depth],
      y: branchYs.reduce((s, y) => s + y, 0) / branchYs.length,
      w: nodeWidth(node.label),
      h: NODE_H,
      depth,
      history,
    }
    boxes.push(box)
    byNode.set(node, box)
    return box
  }
  place(root, 0, new Set(), 1)

  const edges: EdgeLine[] = []
  for (const box of boxes) {
    for (const edge of box.node.outcomes) {
      const x1 = box.x + box.w / 2
      const y1 = box.y
      let x2: number
      let y2: number
      if (edge.child) {
        const childBox = byNode.get(edge.child)
        if (!childBox) continue
        x2 = childBox.x - childBox.w / 2
        y2 = childBox.y
      } else {
        const mark = leaves.find((l) => l.edge === edge)
        if (!mark) continue
        x2 = mark.x - 6
        y2 = mark.y
      }
      const p = bezierPoint(x1, y1, x2, y2, LABEL_T)
      edges.push({ parent: box.node, edge, x1, y1, x2, y2, labelX: p.x, labelY: p.y - 8 })
    }
  }

  const width = x - COL_GAP + PAD
  const height = PAD * 2 + Math.max(nextSlot, 1) * LEAF_SPACING

  return { boxes, leaves, edges, byNode, width, height }
}
