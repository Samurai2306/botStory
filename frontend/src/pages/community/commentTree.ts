export interface FlatCommentNode {
  id: number
  parent_id: number | null
}

export type TreeCommentNode<T extends FlatCommentNode> = T & {
  replies: TreeCommentNode<T>[]
}

export function buildCommentTree<T extends FlatCommentNode>(flat: T[]): TreeCommentNode<T>[] {
  const byId = new Map<number, TreeCommentNode<T>>()
  flat.forEach((c) => byId.set(c.id, { ...c, replies: [] }))
  const roots: TreeCommentNode<T>[] = []

  flat.forEach((c) => {
    const node = byId.get(c.id)
    if (!node) return
    if (c.parent_id == null) {
      roots.push(node)
      return
    }
    const parent = byId.get(c.parent_id)
    if (parent) parent.replies.push(node)
    else roots.push(node)
  })

  return roots
}

export function countReplies<T extends FlatCommentNode>(node: TreeCommentNode<T>): number {
  return node.replies.length + node.replies.reduce((sum, child) => sum + countReplies(child), 0)
}
