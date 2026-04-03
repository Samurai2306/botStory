export type AdminSection = 'levels' | 'news' | 'updates' | 'notify'

export interface LevelOption {
  id: number
  title: string
  order: number
  is_active?: boolean
}

export interface NewsItem {
  id: number
  title: string
  content: string
  is_published: boolean
  created_at: string
  updated_at: string
}

export interface UpdateTimelineEvent {
  date: string
  title: string
  description: string
  type: 'feature' | 'fix' | 'improvement' | 'design' | 'infra' | 'other'
}

export interface UpdateLayoutBlock {
  type: 'hero' | 'rich_text' | 'timeline_slice' | 'media' | 'cta'
  title?: string
  content?: string
  media_url?: string
  cta_text?: string
  cta_url?: string
  emphasized?: boolean
}

export interface UpdateEditorData {
  title: string
  summary: string
  content: string
  topic: string
  status: 'draft' | 'published' | 'archived'
  is_published: boolean
  is_pinned: boolean
  timeline_events: UpdateTimelineEvent[]
  theme_config: {
    accent_color: string
    secondary_color: string
    background_gradient: string
    icon: string
    timeline_style: 'neon' | 'glass' | 'minimal' | 'retro'
    surface_pattern?: string
  }
  layout_blocks: UpdateLayoutBlock[]
}

export interface UpdateItem extends UpdateEditorData {
  id: number
  created_at: string
  updated_at?: string
}

export type MapObject = { type: string; x: number; y: number; color?: string; open?: boolean; on?: boolean }
