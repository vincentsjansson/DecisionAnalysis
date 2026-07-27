import type { Outcome, TreeNode } from '../model/tree'
import { branchLabel } from '../model/tree'

export const NODE_H = 40
export const MIN_NODE_W = 90
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
  /** The edge this node was reached through (null for the root). */
  incoming: Outcome | null
}

export interface EdgeLine {
  parent: TreeNode
  edge: Outcome
  child: TreeNode
  x1: number
  y1: number
  x2: number
  y2: number
  labelX: number
  labelY: number
}

export interface TreeLayout {
  boxes: NodeBox[]
  edges: EdgeLine[]
  byNode: Map<TreeNode, NodeBox>
  width: number
  height: number
}

export function nodeWidth(label: string): number {
  return Math.max(MIN_NODE_W, label.length * 8 + 32)
}

/** Point on the rendered cubic bezier at parameter t. Control points sit at
 * 45% of the horizontal span, flat (same y as the endpoints), matching
 * renderTree's path. Labels are placed at t = 0.75, where sibling curves have
 * diverged to ~84% of their vertical separation — this is what keeps labels
 * apart at high branching factors instead of stacking at the midpoint like
 * legacy did. */
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

/** Computes positions for every node and edge. Leaves get evenly spaced
 * vertical slots (LEAF_SPACING apart — auto-expanding total height), internal
 * nodes center on their children, columns are sized by the widest label at
 * each depth. Pure function of the tree: recomputed from scratch on every
 * redraw, nothing cached. */
export function layoutTree(root: TreeNode): TreeLayout {
  // Column widths per depth.
  const colW: number[] = []
  const measure = (node: TreeNode, depth: number): void => {
    colW[depth] = Math.max(colW[depth] ?? 0, nodeWidth(node.label))
    for (const edge of node.children) if (edge.child) measure(edge.child, depth + 1)
  }
  measure(root, 0)

  const colX: number[] = []
  let x = PAD
  for (let d = 0; d < colW.length; d++) {
    colX[d] = x + colW[d] / 2
    x += colW[d] + COL_GAP
  }

  const boxes: NodeBox[] = []
  const byNode = new Map<TreeNode, NodeBox>()
  let nextSlot = 0

  const place = (
    node: TreeNode,
    depth: number,
    history: Set<string>,
    incoming: Outcome | null,
  ): NodeBox => {
    let y: number
    const childBoxes: NodeBox[] = []

    if (node.children.length === 0) {
      y = PAD + nextSlot * LEAF_SPACING + NODE_H / 2
      nextSlot++
    } else {
      for (const edge of node.children) {
        if (!edge.child) continue
        const childHistory = new Set(history)
        childHistory.add(branchLabel(node, edge.label))
        childBoxes.push(place(edge.child, depth + 1, childHistory, edge))
      }
      y =
        childBoxes.length > 0
          ? childBoxes.reduce((s, b) => s + b.y, 0) / childBoxes.length
          : PAD + nextSlot++ * LEAF_SPACING + NODE_H / 2
    }

    const box: NodeBox = {
      node,
      x: colX[depth],
      y,
      w: nodeWidth(node.label),
      h: NODE_H,
      depth,
      history,
      incoming,
    }
    boxes.push(box)
    byNode.set(node, box)
    return box
  }
  place(root, 0, new Set(), null)

  const edges: EdgeLine[] = []
  for (const box of boxes) {
    for (const edge of box.node.children) {
      if (!edge.child) continue
      const childBox = byNode.get(edge.child)
      if (!childBox) continue
      const x1 = box.x + box.w / 2
      const y1 = box.y
      const x2 = childBox.x - childBox.w / 2
      const y2 = childBox.y
      const p = bezierPoint(x1, y1, x2, y2, LABEL_T)
      edges.push({
        parent: box.node,
        edge,
        child: edge.child,
        x1,
        y1,
        x2,
        y2,
        labelX: p.x,
        labelY: p.y - 8,
      })
    }
  }

  const width = x - COL_GAP + PAD
  const height = PAD * 2 + Math.max(nextSlot, 1) * LEAF_SPACING

  return { boxes, edges, byNode, width, height }
}
