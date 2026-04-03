import { motion } from 'framer-motion'
import CommunityAuthorChip from '../../components/community/CommunityAuthorChip'
import { CATEGORIES } from './constants'
import { Post } from './types'

interface CommunityPostCardProps {
  post: Post
  onOpenPost: (id: number) => void
  formatDate: (value: string) => string
}

export default function CommunityPostCard({ post, onOpenPost, formatDate }: CommunityPostCardProps) {
  return (
    <motion.button
      type="button"
      className="community-post-card"
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onOpenPost(post.id)}
      aria-label={`Открыть пост: ${post.title}`}
    >
      {post.pinned && <span className="community-pin-badge">📌</span>}
      <h3>{post.title}</h3>
      <div className="community-meta">
        <CommunityAuthorChip username={post.author_username} avatarUrl={post.author_avatar_url} linkEnabled={false} />
        <span className="community-meta-sep">·</span>
        <span>{formatDate(post.created_at)}</span>
        {post.category && ` · ${CATEGORIES.find((c) => c.value === post.category)?.label || post.category}`}
      </div>
      <p className="community-excerpt">
        {post.content.slice(0, 120)}
        {post.content.length > 120 ? '…' : ''}
      </p>
      <div className="community-stats">
        ♥ {post.likes_count} · 💬 {post.comments_count}
        {post.bookmarked_by_me ? ' · ★' : ''}
      </div>
    </motion.button>
  )
}
