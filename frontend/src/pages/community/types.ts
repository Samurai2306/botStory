export type Tab = 'forum' | 'updates' | 'polls' | 'users' | 'mentions'

export interface Post {
  id: number
  author_id: number
  author_username: string | null
  title: string
  content: string
  category: string
  pinned: boolean
  created_at: string
  updated_at: string
  likes_count: number
  comments_count: number
  liked_by_me: boolean
  bookmarked_by_me?: boolean
  author_avatar_url?: string | null
}

export interface Comment {
  id: number
  post_id: number
  author_id: number
  author_username: string | null
  author_avatar_url?: string | null
  parent_id: number | null
  parent_username: string | null
  parent_avatar_url?: string | null
  content: string
  created_at: string
  updated_at: string
}

export interface UpdateTimelineEvent {
  date: string
  title: string
  description: string
  type: 'feature' | 'fix' | 'improvement' | 'design' | 'infra' | 'other'
}

export interface UpdateThemeConfig {
  accent_color?: string
  secondary_color?: string
  background_gradient?: string
  icon?: string
  timeline_style?: string
  surface_pattern?: string | null
}

export interface UpdateEntry {
  id: number
  title: string
  summary?: string | null
  content: string
  topic: string
  is_published: boolean
  is_pinned: boolean
  published_at?: string | null
  created_at: string
  author_username?: string | null
  timeline_events: UpdateTimelineEvent[]
  theme_config?: UpdateThemeConfig
}

export interface PollOption {
  id: number
  poll_id: number
  text: string
  order: number
  votes_count: number
  voted_by_me: boolean
}

export interface Poll {
  id: number
  author_id: number
  author_username: string | null
  title: string
  description: string | null
  closed: boolean
  created_at: string
  updated_at: string
  options: PollOption[]
  total_votes: number
  voted_by_me: boolean
  my_option_id: number | null
  author_avatar_url?: string | null
}
