import { useEffect, useState } from 'react'
import { communityAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { motion, AnimatePresence } from 'framer-motion'
import './Community.css'

type Tab = 'forum' | 'commits' | 'polls'

interface Post {
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
}

interface Comment {
  id: number
  post_id: number
  author_id: number
  author_username: string | null
  parent_id: number | null
  parent_username: string | null
  content: string
  created_at: string
  updated_at: string
}

interface CommentNode extends Comment {
  replies: CommentNode[]
}

interface Commit {
  sha: string
  message: string
  author: string
  date: string
  url: string
}

interface PollOption {
  id: number
  poll_id: number
  text: string
  order: number
  votes_count: number
  voted_by_me: boolean
}

interface Poll {
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
}

const CATEGORIES = [
  { value: '', label: 'Все' },
  { value: 'discussion', label: 'Обсуждение' },
  { value: 'question', label: 'Вопрос' },
  { value: 'idea', label: 'Идея' },
  { value: 'announcement', label: 'Объявление' },
] as const

const SORT_OPTIONS = [
  { value: 'new', label: 'Сначала новые' },
  { value: 'popular', label: 'По популярности' },
  { value: 'pinned_first', label: 'Закреплённые сверху' },
] as const

function buildCommentTree(flat: Comment[]): CommentNode[] {
  const byId = new Map<number, CommentNode>()
  flat.forEach((c) => byId.set(c.id, { ...c, replies: [] }))
  const roots: CommentNode[] = []
  flat.forEach((c) => {
    const node = byId.get(c.id)!
    if (c.parent_id == null) {
      roots.push(node)
    } else {
      const parent = byId.get(c.parent_id)
      if (parent) parent.replies.push(node)
      else roots.push(node)
    }
  })
  return roots
}

function countReplies(node: CommentNode): number {
  return node.replies.length + node.replies.reduce((s, r) => s + countReplies(r), 0)
}

export default function Community() {
  const { user, isAuthenticated } = useAuthStore()
  const [tab, setTab] = useState<Tab>('forum')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('new')
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null)
  const [postDetail, setPostDetail] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [showNewPostForm, setShowNewPostForm] = useState(false)
  const [newPostTitle, setNewPostTitle] = useState('')
  const [newPostContent, setNewPostContent] = useState('')
  const [newPostCategory, setNewPostCategory] = useState('discussion')
  const [newCommentContent, setNewCommentContent] = useState('')
  const [replyToCommentId, setReplyToCommentId] = useState<number | null>(null)
  const [expandedCommentIds, setExpandedCommentIds] = useState<Set<number>>(new Set())
  const [commits, setCommits] = useState<Commit[]>([])
  const [commitsLoading, setCommitsLoading] = useState(false)
  const [polls, setPolls] = useState<Poll[]>([])
  const [pollsLoading, setPollsLoading] = useState(false)
  const [showNewPollForm, setShowNewPollForm] = useState(false)
  const [newPollTitle, setNewPollTitle] = useState('')
  const [newPollDescription, setNewPollDescription] = useState('')
  const [newPollOptions, setNewPollOptions] = useState<string[]>(['', ''])
  const [error, setError] = useState<string | null>(null)

  const loadPosts = () => {
    setLoading(true)
    communityAPI
      .getPosts({ category: category || undefined, sort, limit: 50 })
      .then((r) => setPosts(r.data || []))
      .catch(() => setPosts([]))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    if (tab === 'forum') loadPosts()
  }, [tab, category, sort])

  useEffect(() => {
    if (tab === 'commits') {
      setCommitsLoading(true)
      communityAPI
        .getCommits(15)
        .then((r) => setCommits(r.data?.commits || []))
        .catch(() => setCommits([]))
        .finally(() => setCommitsLoading(false))
    }
  }, [tab])

  useEffect(() => {
    if (tab === 'polls') {
      setPollsLoading(true)
      communityAPI
        .getPolls({ limit: 50 })
        .then((r) => setPolls(r.data || []))
        .catch(() => setPolls([]))
        .finally(() => setPollsLoading(false))
    }
  }, [tab])

  const openPost = (id: number) => {
    setSelectedPostId(id)
    setPostDetail(null)
    setComments([])
    setCommentsLoading(true)
    communityAPI
      .getPost(id)
      .then((r) => setPostDetail(r.data))
      .catch(() => setError('Не удалось загрузить пост'))
      .finally(() => setCommentsLoading(false))
    communityAPI
      .getComments(id)
      .then((r) => setComments(r.data || []))
      .catch(() => setComments([]))
  }

  const closePost = () => {
    setSelectedPostId(null)
    setPostDetail(null)
    setComments([])
    setReplyToCommentId(null)
    setExpandedCommentIds(new Set())
    setError(null)
    loadPosts()
  }

  const toggleExpanded = (id: number) => {
    setExpandedCommentIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const getApiError = (err: any, fallback: string): string => {
    const d = err.response?.data?.detail
    if (typeof d === 'string') return d
    if (Array.isArray(d) && d.length) return d.map((x: any) => x.msg || JSON.stringify(x)).join('. ')
    const status = err.response?.status
    if (status === 401) return 'Войдите в аккаунт'
    if (status === 500) return 'Ошибка сервера. Возможно, не применена миграция БД (alembic upgrade head в контейнере backend).'
    return fallback
  }

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault()
    if (!newPostTitle.trim() || !newPostContent.trim()) return
    setError(null)
    communityAPI
      .createPost({ title: newPostTitle.trim(), content: newPostContent.trim(), category: newPostCategory })
      .then(() => {
        setShowNewPostForm(false)
        setNewPostTitle('')
        setNewPostContent('')
        setNewPostCategory('discussion')
        setError(null)
        loadPosts()
      })
      .catch((err) => setError(getApiError(err, 'Ошибка создания поста')))
  }

  const handleLike = (postId: number) => {
    if (!isAuthenticated) return
    communityAPI.likePost(postId).then(() => {
      if (postDetail?.id === postId) {
        communityAPI.getPost(postId).then((r) => setPostDetail(r.data))
      }
      loadPosts()
    }).catch(() => {})
  }

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedPostId || !newCommentContent.trim()) return
    const payload: { content: string; parent_id?: number } = { content: newCommentContent.trim() }
    if (replyToCommentId) payload.parent_id = replyToCommentId
    communityAPI
      .createComment(selectedPostId, payload)
      .then(() => {
        setNewCommentContent('')
        const parentId = replyToCommentId
        setReplyToCommentId(null)
        return communityAPI.getComments(selectedPostId!).then((r) => {
          setComments(r.data || [])
          if (parentId) setExpandedCommentIds((prev) => new Set(prev).add(parentId))
        })
      })
      .catch((err) => setError(err.response?.data?.detail || 'Ошибка отправки комментария'))
  }

  const handleDeleteComment = (commentId: number) => {
    communityAPI.deleteComment(commentId).then(() => {
      if (selectedPostId) communityAPI.getComments(selectedPostId).then((r) => setComments(r.data || []))
      if (postDetail) communityAPI.getPost(postDetail.id).then((r) => setPostDetail(r.data))
      loadPosts()
    }).catch(() => {})
  }

  const handleDeletePost = (postId: number) => {
    if (!confirm('Удалить пост?')) return
    communityAPI.deletePost(postId).then(closePost).catch(() => setError('Не удалось удалить пост'))
  }

  const handleCreatePoll = (e: React.FormEvent) => {
    e.preventDefault()
    const options = newPollOptions.filter((t) => t.trim()).map((text) => ({ text: text.trim() }))
    if (!newPollTitle.trim() || options.length < 2) {
      setError('Укажите заголовок и минимум 2 варианта ответа')
      return
    }
    setError(null)
    communityAPI
      .createPoll({ title: newPollTitle.trim(), description: newPollDescription.trim() || undefined, options })
      .then(() => {
        setShowNewPollForm(false)
        setNewPollTitle('')
        setNewPollDescription('')
        setNewPollOptions(['', ''])
        setError(null)
        if (tab === 'polls') communityAPI.getPolls({ limit: 50 }).then((r) => setPolls(r.data || []))
      })
      .catch((err) => setError(getApiError(err, 'Ошибка создания опроса')))
  }

  const handleVotePoll = (pollId: number, optionId: number) => {
    communityAPI
      .votePoll(pollId, optionId)
      .then((updated) => setPolls((prev) => prev.map((p) => (p.id === pollId ? updated.data : p))))
      .catch((err) => setError(getApiError(err, 'Ошибка голосования')))
  }

  const addPollOption = () => setNewPollOptions((prev) => [...prev, ''])
  const removePollOption = (i: number) => setNewPollOptions((prev) => prev.filter((_, idx) => idx !== i))
  const setPollOption = (i: number, v: string) => setNewPollOptions((prev) => { const n = [...prev]; n[i] = v; return n })

  const formatDate = (s: string) => {
    const d = new Date(s)
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }

  const isAdmin = user?.role === 'admin'

  return (
    <div className="community-page">
      <motion.h1
        className="community-title glitch"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        СООБЩЕСТВО
      </motion.h1>

      <motion.div
        className="community-tabs"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <button
          className={`community-tab ${tab === 'forum' ? 'active' : ''}`}
          onClick={() => setTab('forum')}
        >
          ◉ ФОРУМ
        </button>
        <button
          className={`community-tab ${tab === 'commits' ? 'active' : ''}`}
          onClick={() => setTab('commits')}
        >
          ◈ КОММИТЫ
        </button>
        <button
          className={`community-tab ${tab === 'polls' ? 'active' : ''}`}
          onClick={() => setTab('polls')}
        >
          ◐ ОПРОСЫ
        </button>
      </motion.div>

      {error && (
        <div className="community-error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)}>×</button>
        </div>
      )}

      <AnimatePresence mode="wait">
        {tab === 'forum' && (
          <motion.div
            key="forum"
            className="community-forum"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {selectedPostId ? (
              <div className="community-detail">
                {commentsLoading && !postDetail ? (
                  <div className="community-loading"><div className="spinner" /> Загрузка...</div>
                ) : postDetail ? (
                  <>
                    <div className="community-detail-header">
                      <button type="button" className="community-back" onClick={closePost}>← Назад к списку</button>
                      {postDetail.pinned && <span className="community-pinned">Закреплён</span>}
                    </div>
                    <article className="community-post-card detail">
                      <h2>{postDetail.title}</h2>
                      <div className="community-meta">
                        {postDetail.author_username} · {formatDate(postDetail.created_at)}
                        {postDetail.category && ` · ${CATEGORIES.find(c => c.value === postDetail.category)?.label || postDetail.category}`}
                      </div>
                      <div className="community-content">{postDetail.content}</div>
                      <div className="community-actions">
                        <button
                          type="button"
                          className={`community-like ${postDetail.liked_by_me ? 'liked' : ''}`}
                          onClick={() => handleLike(postDetail.id)}
                          disabled={!isAuthenticated}
                          title={isAuthenticated ? (postDetail.liked_by_me ? 'Убрать лайк' : 'Нравится') : 'Войдите, чтобы ставить лайки'}
                        >
                          ♥ {postDetail.likes_count}
                        </button>
                        <span className="community-comments-count">💬 {postDetail.comments_count}</span>
                        {(user?.id === postDetail.author_id || isAdmin) && (
                          <button type="button" className="community-delete" onClick={() => handleDeletePost(postDetail.id)}>Удалить</button>
                        )}
                      </div>
                    </article>
                    <section className="community-comments-section">
                      <h3>Комментарии</h3>
                      {(() => {
                        const tree = buildCommentTree(comments)
                        const renderComment = (node: CommentNode, level: number) => {
                          const hasReplies = node.replies.length > 0
                          const totalReplies = countReplies(node)
                          const isExpanded = expandedCommentIds.has(node.id)
                          return (
                            <div key={node.id} className="community-comment-wrap">
                              <div className={`community-comment community-comment-level-${Math.min(level, 5)}`}>
                                {node.parent_username && (
                                  <div className="community-comment-reply-to">Ответ на <strong>{node.parent_username}</strong></div>
                                )}
                                <div className="community-comment-meta">
                                  <strong>{node.author_username}</strong> · {formatDate(node.created_at)}
                                  {isAuthenticated && (
                                    <button type="button" className="community-comment-reply-btn" onClick={() => setReplyToCommentId(node.id)} title="Ответить">↩ Ответить</button>
                                  )}
                                  {(user?.id === node.author_id || isAdmin) && (
                                    <button type="button" className="community-comment-delete" onClick={() => handleDeleteComment(node.id)}>×</button>
                                  )}
                                </div>
                                <p>{node.content}</p>
                                {hasReplies && (
                                  <button
                                    type="button"
                                    className="community-comment-expand"
                                    onClick={() => toggleExpanded(node.id)}
                                  >
                                    {isExpanded ? '▼ Свернуть' : `▶ Развернуть ответы (${totalReplies})`}
                                  </button>
                                )}
                              </div>
                              {hasReplies && isExpanded && (
                                <div className="community-comment-children">
                                  {node.replies.map((r) => renderComment(r, level + 1))}
                                </div>
                              )}
                            </div>
                          )
                        }
                        return tree.map((node) => renderComment(node, 0))
                      })()}
                      {isAuthenticated ? (
                        <form onSubmit={handleAddComment} className="community-comment-form">
                          {replyToCommentId && (
                            <div className="community-comment-reply-hint">
                              Ответ на комментарий
                              <button type="button" onClick={() => setReplyToCommentId(null)}>Отмена</button>
                            </div>
                          )}
                          <textarea
                            value={newCommentContent}
                            onChange={(e) => setNewCommentContent(e.target.value)}
                            placeholder={replyToCommentId ? 'Текст ответа...' : 'Написать комментарий...'}
                            rows={2}
                            required
                          />
                          <button type="submit">Отправить</button>
                        </form>
                      ) : (
                        <p className="community-login-hint">Войдите, чтобы комментировать.</p>
                      )}
                    </section>
                  </>
                ) : (
                  <div className="community-loading">Пост не найден.</div>
                )}
              </div>
            ) : (
              <>
                <div className="community-toolbar">
                  <select className="community-select" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Категория">
                    {CATEGORIES.map((c) => (
                      <option key={c.value || 'all'} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <select className="community-select" value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Сортировка">
                    {SORT_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                  {isAuthenticated && (
                    <button type="button" className="community-btn-primary" onClick={() => { setError(null); setShowNewPostForm(true) }}>
                      + Новый пост
                    </button>
                  )}
                </div>
                {showNewPostForm && (
                  <form onSubmit={handleCreatePost} className="community-new-post-form">
                    <h3>Новый пост</h3>
                    <input
                      value={newPostTitle}
                      onChange={(e) => setNewPostTitle(e.target.value)}
                      placeholder="Заголовок"
                      required
                    />
                    <textarea
                      value={newPostContent}
                      onChange={(e) => setNewPostContent(e.target.value)}
                      placeholder="Текст поста"
                      rows={4}
                      required
                    />
                    <select className="community-select community-select-full" value={newPostCategory} onChange={(e) => setNewPostCategory(e.target.value)} aria-label="Категория поста">
                      {CATEGORIES.filter(c => c.value).map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                    <div className="community-form-actions">
                      <button type="submit">Создать</button>
                      <button type="button" onClick={() => setShowNewPostForm(false)}>Отмена</button>
                    </div>
                  </form>
                )}
                {loading ? (
                  <div className="community-loading"><div className="spinner" /> Загрузка постов...</div>
                ) : posts.length === 0 ? (
                  <p className="community-empty">Пока нет постов. Создайте первый!</p>
                ) : (
                  <ul className="community-posts-list">
                    {posts.map((p) => (
                      <li key={p.id}>
                        <motion.article
                          className="community-post-card"
                          layout
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          onClick={() => openPost(p.id)}
                        >
                          {p.pinned && <span className="community-pin-badge">📌</span>}
                          <h3>{p.title}</h3>
                          <div className="community-meta">
                            {p.author_username} · {formatDate(p.created_at)}
                            {p.category && ` · ${CATEGORIES.find(c => c.value === p.category)?.label || p.category}`}
                          </div>
                          <p className="community-excerpt">{p.content.slice(0, 120)}{p.content.length > 120 ? '…' : ''}</p>
                          <div className="community-stats">
                            ♥ {p.likes_count} · 💬 {p.comments_count}
                          </div>
                        </motion.article>
                      </li>
                    ))}
                  </ul>
                )}
                {!isAuthenticated && (
                  <p className="community-login-hint">Войдите, чтобы создавать посты и комментировать.</p>
                )}
              </>
            )}
          </motion.div>
        )}

        {tab === 'commits' && (
          <motion.div
            key="commits"
            className="community-commits"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {commitsLoading ? (
              <div className="community-loading"><div className="spinner" /> Загрузка коммитов...</div>
            ) : commits.length === 0 ? (
              <p className="community-empty">Коммиты не настроены (укажите GITHUB_REPO в .env бэкенда) или репозиторий недоступен.</p>
            ) : (
              <ul className="community-commits-list">
                {commits.map((c) => (
                  <li key={c.sha}>
                    <a href={c.url} target="_blank" rel="noopener noreferrer" className="community-commit-item">
                      <code>{c.sha}</code>
                      <span className="community-commit-msg">{c.message}</span>
                      <span className="community-commit-meta">{c.author} · {formatDate(c.date)}</span>
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}

        {tab === 'polls' && (
          <motion.div
            key="polls"
            className="community-polls"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="community-toolbar">
              {isAuthenticated && (
                <button type="button" className="community-btn-primary" onClick={() => { setError(null); setShowNewPollForm(true) }}>
                  + Новый опрос
                </button>
              )}
            </div>
            {showNewPollForm && (
              <form onSubmit={handleCreatePoll} className="community-new-post-form community-new-poll-form">
                <h3>Новый опрос</h3>
                <input
                  value={newPollTitle}
                  onChange={(e) => setNewPollTitle(e.target.value)}
                  placeholder="Вопрос опроса"
                  required
                />
                <textarea
                  value={newPollDescription}
                  onChange={(e) => setNewPollDescription(e.target.value)}
                  placeholder="Описание (необязательно)"
                  rows={2}
                />
                <div className="community-poll-options-edit">
                  <label>Варианты ответа (минимум 2)</label>
                  {newPollOptions.map((text, i) => (
                    <div key={i} className="community-poll-option-row">
                      <input
                        value={text}
                        onChange={(e) => setPollOption(i, e.target.value)}
                        placeholder={`Вариант ${i + 1}`}
                      />
                      {newPollOptions.length > 2 && (
                        <button type="button" className="community-poll-option-remove" onClick={() => removePollOption(i)}>×</button>
                      )}
                    </div>
                  ))}
                  <button type="button" className="community-poll-option-add" onClick={addPollOption}>+ Добавить вариант</button>
                </div>
                <div className="community-form-actions">
                  <button type="submit">Создать опрос</button>
                  <button type="button" onClick={() => setShowNewPollForm(false)}>Отмена</button>
                </div>
              </form>
            )}
            {pollsLoading ? (
              <div className="community-loading"><div className="spinner" /> Загрузка опросов...</div>
            ) : polls.length === 0 ? (
              <p className="community-empty">Пока нет опросов. Создайте первый!</p>
            ) : (
              <ul className="community-polls-list">
                {polls.map((poll) => (
                  <li key={poll.id}>
                    <article className="community-poll-card">
                      <div className="community-poll-header">
                        <h3>{poll.title}</h3>
                        {poll.closed && <span className="community-poll-closed">Закрыт</span>}
                      </div>
                      {poll.description && <p className="community-poll-description">{poll.description}</p>}
                      <div className="community-poll-meta">
                        {poll.author_username} · {formatDate(poll.created_at)} · всего голосов: {poll.total_votes}
                      </div>
                      <div className="community-poll-options">
                        {poll.options.map((opt) => {
                          const pct = poll.total_votes ? Math.round((opt.votes_count / poll.total_votes) * 100) : 0
                          return (
                            <div key={opt.id} className="community-poll-option">
                              <div className="community-poll-option-bar-wrap">
                                <div className="community-poll-option-bar" style={{ width: `${pct}%` }} />
                                <span className="community-poll-option-text">{opt.text}</span>
                                <span className="community-poll-option-count">{opt.votes_count} ({pct}%)</span>
                              </div>
                              {isAuthenticated && !poll.voted_by_me && !poll.closed && (
                                <button
                                  type="button"
                                  className="community-poll-vote-btn"
                                  onClick={() => handleVotePoll(poll.id, opt.id)}
                                >
                                  Голосовать
                                </button>
                              )}
                              {opt.voted_by_me && <span className="community-poll-voted-badge">✓ Ваш выбор</span>}
                            </div>
                          )
                        })}
                      </div>
                      {poll.voted_by_me && !poll.closed && (
                        <p className="community-poll-you-voted">Вы проголосовали</p>
                      )}
                      {(user?.id === poll.author_id || isAdmin) && (
                        <button type="button" className="community-delete community-poll-delete" onClick={() => { if (confirm('Удалить опрос?')) communityAPI.deletePoll(poll.id).then(() => setPolls((prev) => prev.filter((p) => p.id !== poll.id))) }}>Удалить опрос</button>
                      )}
                    </article>
                  </li>
                ))}
              </ul>
            )}
            {!isAuthenticated && (
              <p className="community-login-hint">Войдите, чтобы создавать опросы и голосовать.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
