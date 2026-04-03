import { describe, expect, it } from 'vitest'
import { buildCommentTree, countReplies } from './commentTree'

type DemoComment = {
  id: number
  parent_id: number | null
  content: string
}

describe('commentTree', () => {
  it('builds nested reply tree from flat rows', () => {
    const flat: DemoComment[] = [
      { id: 1, parent_id: null, content: 'root' },
      { id: 2, parent_id: 1, content: 'reply-1' },
      { id: 3, parent_id: 2, content: 'reply-1-1' },
      { id: 4, parent_id: null, content: 'second-root' },
    ]

    const tree = buildCommentTree(flat)
    expect(tree).toHaveLength(2)
    expect(tree[0].replies).toHaveLength(1)
    expect(tree[0].replies[0].replies).toHaveLength(1)
  })

  it('counts all nested replies recursively', () => {
    const [root] = buildCommentTree<DemoComment>([
      { id: 1, parent_id: null, content: 'root' },
      { id: 2, parent_id: 1, content: 'reply-1' },
      { id: 3, parent_id: 1, content: 'reply-2' },
      { id: 4, parent_id: 2, content: 'reply-1-1' },
    ])

    expect(countReplies(root)).toBe(3)
  })
})
