import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { communityAPI, updatesAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { motion, AnimatePresence } from 'framer-motion'
import CommunityAuthorChip from '../components/community/CommunityAuthorChip'
import CustomSelect from '../components/ui/CustomSelect'
import { buildCommentTree, countReplies, TreeCommentNode } from './community/commentTree'
import CommunityPostCard from './community/CommunityPostCard'
import { CATEGORIES, SORT_OPTIONS } from './community/constants'
import { Comment, Poll, Post, Tab, UpdateEntry } from './community/types'
import { formatDate, getApiError } from './community/utils'
import './Community.css'

export default function Community() {
  const { user, isAuthenticated } = useAuthStore()
  const [searchParams, setSearchParams] = useSearchParams()
  const [tab, setTab] = useState<Tab>('forum')
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('new')
  const [searchText, setSearchText] = useState('')
  const [postOffset, setPostOffset] = useState(0)
  const [hasMorePosts, setHasMorePosts] = useState(true)
  const [selectedPostId, setSelectedPostId] = useState<number | null>(null)
  const [postDetail, setPostDetail] = useState<Post | null>(null)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentOffset, setCommentOffset] = useState(0)
  const [hasMoreComments, setHasMoreComments] = useState(true)
  const [showNewPostForm, setShowNewPostForm] = useState(false)
  const [newPostTitle, setNewPostTitle] = useState('')
  const [newPostContent, setNewPostContent] = useState('')
  const [newPostCategory, setNewPostCategory] = useState('discussion')
  const [newCommentContent, setNewCommentContent] = useState('')
  const [replyToCommentId, setReplyToCommentId] = useState<number | null>(null)
  const [expandedCommentIds, setExpandedCommentIds] = useState<Set<number>>(new Set())
  const [updates, setUpdates] = useState<UpdateEntry[]>([])
  const [updatesLoading, setUpdatesLoading] = useState(false)
  const [polls, setPolls] = useState<Poll[]>([])
  const [pollsLoading, setPollsLoading] = useState(false)
  const [pollOffset, setPollOffset] = useState(0)
  const [hasMorePolls, setHasMorePolls] = useState(true)
  const [showNewPollForm, setShowNewPollForm] = useState(false)
  const [newPollTitle, setNewPollTitle] = useState('')
  const [newPollDescription, setNewPollDescription] = useState('')
  const [newPollOptions, setNewPollOptions] = useState<string[]>(['', ''])
  const [error, setError] = useState<string | null>(null)
  const [reputationTop, setReputationTop] = useState<Array<{ user_id: number; username: string; avatar_url?: string | null; reputation_score: number }>>([])
  const [foundUsers, setFoundUsers] = useState<Array<{ user_id: number; id?: number; username: string; avatar_url?: string | null; matched_titles?: string[]; reputation_score?: number; is_friend?: boolean }>>([])
  const [userSearch, setUserSearch] = useState('')
  const [subscriptions, setSubscriptions] = useState<string[]>([])
  const [friends, setFriends] = useState<Array<{ user_id: number; username: string; avatar_url?: string | null; reputation_score: number; is_friend: boolean }>>([])
  const [mentions, setMentions] = useState<Array<{ id: number; target_type: string; target_id: number; author_username: string | null; created_at: string; is_read: boolean }>>([])
  const [mentionsLoading, setMentionsLoading] = useState(false)
  const deferredSearchText = useDeferredValue(searchText)

  const reportError = (err: unknown, fallback: string) => {
    setError(getApiError(err, fallback))
  }

  const loadPosts = useCallback((append = false, skip = 0) => {
    setLoading(true)
    communityAPI
      .getPosts({ category: category || undefined, sort, limit: 20, skip, q: deferredSearchText || undefined })
      .then((r) => {
        const rows = r.data || []
        setHasMorePosts(rows.length >= 20)
        setPostOffset(skip + rows.length)
        setPosts((prev) => (append ? [...prev, ...rows] : rows))
      })
      .catch((err) => {
        setPosts([])
        reportError(err, 'Не удалось загрузить посты')
      })
      .finally(() => setLoading(false))
  }, [category, sort, deferredSearchText])

  useEffect(() => {
    if (tab === 'forum') loadPosts(false, 0)
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      if (category) next.set('category', category)
      else next.delete('category')
      if (sort) next.set('sort', sort)
      else next.delete('sort')
      if (deferredSearchText) next.set('q', deferredSearchText)
      else next.delete('q')
      return next
    })
  }, [tab, category, sort, deferredSearchText, setSearchParams, loadPosts])

  useEffect(() => {
    const tabFromQuery = searchParams.get('tab')
    if (tabFromQuery === 'forum' || tabFromQuery === 'updates' || tabFromQuery === 'polls' || tabFromQuery === 'users' || tabFromQuery === 'mentions') {
      setTab(tabFromQuery)
    }
    setCategory(searchParams.get('category') || '')
    setSort(searchParams.get('sort') || 'new')
    setSearchText(searchParams.get('q') || '')
    communityAPI.getReputationLeaderboard(10).then((r) => setReputationTop(r.data || [])).catch((err) => {
      setReputationTop([])
      reportError(err, 'Не удалось загрузить рейтинг')
    })
    const postFromQuery = Number(searchParams.get('post') || '')
    if (postFromQuery) {
      setTab('forum')
      openPost(postFromQuery)
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated) return
    communityAPI.getSubscriptions().then((r) => {
      setSubscriptions((r.data || []).map((x: any) => x.category))
    }).catch((err) => {
      setSubscriptions([])
      reportError(err, 'Не удалось загрузить подписки')
    })
    communityAPI.getFriends().then((r) => setFriends(r.data || [])).catch((err) => {
      setFriends([])
      reportError(err, 'Не удалось загрузить список друзей')
    })
  }, [isAuthenticated])

  useEffect(() => {
    if (tab === 'mentions' && isAuthenticated) {
      setMentionsLoading(true)
      communityAPI
        .getMentions({ limit: 50, skip: 0 })
        .then((r) => setMentions(r.data || []))
        .catch((err) => {
          setMentions([])
          reportError(err, 'Не удалось загрузить упоминания')
        })
        .finally(() => setMentionsLoading(false))
    }
  }, [tab, isAuthenticated])

  useEffect(() => {
    if (tab === 'updates') {
      setUpdatesLoading(true)
      updatesAPI
        .getAll({ limit: 30 })
        .then((r) => setUpdates(r.data || []))
        .catch((err) => {
          setUpdates([])
          reportError(err, 'Не удалось загрузить обновления')
        })
        .finally(() => setUpdatesLoading(false))
    }
  }, [tab])

  useEffect(() => {
    if (tab === 'polls') {
      setPollsLoading(true)
      communityAPI
        .getPolls({ limit: 20, skip: 0 })
        .then((r) => {
          const rows = r.data || []
          setPolls(rows)
          setPollOffset(rows.length)
          setHasMorePolls(rows.length >= 20)
        })
        .catch((err) => {
          setPolls([])
          reportError(err, 'Не удалось загрузить опросы')
        })
        .finally(() => setPollsLoading(false))
    }
  }, [tab])

  const loadMorePolls = () => {
    if (!hasMorePolls) return
    communityAPI.getPolls({ limit: 20, skip: pollOffset }).then((r) => {
      const rows = r.data || []
      setPolls((prev) => [...prev, ...rows])
      setPollOffset((prev) => prev + rows.length)
      setHasMorePolls(rows.length >= 20)
    }).catch((err) => reportError(err, 'Не удалось загрузить опросы'))
  }

  useEffect(() => {
    const q = userSearch.trim()
    if (!isAuthenticated) {
      setFoundUsers([])
      return
    }
    if (q.length < 1) {
      communityAPI.getCommunityUsers({ limit: 25 }).then((r) => setFoundUsers(r.data || [])).catch((err) => {
        setFoundUsers([])
        reportError(err, 'Не удалось загрузить пользователей')
      })
      return
    }
    const t = setTimeout(() => {
      communityAPI.getCommunityUsers({ q, limit: 25 }).then((r) => setFoundUsers(r.data || [])).catch((err) => {
        setFoundUsers([])
        reportError(err, 'Не удалось выполнить поиск пользователей')
      })
    }, 250)
    return () => clearTimeout(t)
  }, [userSearch, isAuthenticated])

  const openPost = useCallback((id: number) => {
    setSelectedPostId(id)
    setPostDetail(null)
    setComments([])
    setCommentOffset(0)
    setHasMoreComments(true)
    setCommentsLoading(true)
    communityAPI
      .getPost(id)
      .then((r) => setPostDetail(r.data))
      .catch((err) => setError(getApiError(err, 'Не удалось загрузить пост')))
      .finally(() => setCommentsLoading(false))
    communityAPI
      .getComments(id, { limit: 50, skip: 0 })
      .then((r) => {
        const rows = r.data || []
        setComments(rows)
        setCommentOffset(rows.length)
        setHasMoreComments(rows.length >= 50)
      })
      .catch((err) => {
        setComments([])
        reportError(err, 'Не удалось загрузить комментарии')
      })
  }, [])

  const loadMoreComments = () => {
    if (!selectedPostId || !hasMoreComments) return
    communityAPI
      .getComments(selectedPostId, { limit: 50, skip: commentOffset })
      .then((r) => {
        const rows = r.data || []
        setComments((prev) => [...prev, ...rows])
        setCommentOffset((prev) => prev + rows.length)
        setHasMoreComments(rows.length >= 50)
      })
      .catch((err) => reportError(err, 'Не удалось загрузить комментарии'))
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
    }).catch((err) => reportError(err, 'Не удалось обновить реакцию'))
  }

  const handleBookmark = (postId: number) => {
    if (!isAuthenticated) return
    communityAPI.bookmarkPost(postId).then(() => {
      if (postDetail?.id === postId) {
        communityAPI.getPost(postId).then((r) => setPostDetail(r.data))
      }
      loadPosts(false, 0)
    }).catch((err) => reportError(err, 'Не удалось обновить закладки'))
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
    }).catch((err) => reportError(err, 'Не удалось удалить комментарий'))
  }

  const handleDeletePost = (postId: number) => {
    if (!confirm('Удалить пост?')) return
    communityAPI.deletePost(postId).then(closePost).catch((err) => setError(getApiError(err, 'Не удалось удалить пост')))
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

  const renderWithMentions = (text: string) => {
    const re = /(^|\s)@([A-Za-z0-9_]{2,30})/g
    const parts: React.ReactNode[] = []
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const start = m.index
      const full = m[0]
      const username = m[2]
      parts.push(text.slice(last, start))
      const prefix = full.startsWith(' ') ? ' ' : ''
      parts.push(
        <span key={`${username}-${start}`}>
          {prefix}
          <Link to={`/user/${encodeURIComponent(username)}`} className="community-mention-link">@{username}</Link>
        </span>
      )
      last = start + full.length
    }
    parts.push(text.slice(last))
    return parts
  }

  const isAdmin = user?.role === 'admin'
  const commentTree = useMemo(() => buildCommentTree(comments), [comments])

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
          className={`community-tab ${tab === 'updates' ? 'active' : ''}`}
          onClick={() => setTab('updates')}
        >
          ◈ ОБНОВЛЕНИЯ
        </button>
        <button
          className={`community-tab ${tab === 'polls' ? 'active' : ''}`}
          onClick={() => setTab('polls')}
        >
          ◐ ОПРОСЫ
        </button>
        <button
          className={`community-tab ${tab === 'users' ? 'active' : ''}`}
          onClick={() => setTab('users')}
        >
          👥 ПОЛЬЗОВАТЕЛИ
        </button>
        {isAuthenticated && (
          <button
            className={`community-tab ${tab === 'mentions' ? 'active' : ''}`}
            onClick={() => setTab('mentions')}
          >
            @ УПОМИНАНИЯ
          </button>
        )}
      </motion.div>

      {error && (
        <div className="community-error" role="alert">
          {error}
          <button type="button" onClick={() => setError(null)}>×</button>
        </div>
      )}

      <div className="community-top-widgets">
        <section className="community-widget">
          <div className="community-widget-head">
            <span aria-hidden="true">🏆</span>
            <h3>Топ репутации</h3>
          </div>
          <ul>
            {reputationTop.map((r) => (
              <li key={r.user_id}>
                <Link to={`/user/${encodeURIComponent(r.username)}`}>{r.username}</Link> · {r.reputation_score}
              </li>
            ))}
          </ul>
        </section>
      </div>

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
                        <CommunityAuthorChip username={postDetail.author_username} avatarUrl={postDetail.author_avatar_url} />
                        <span className="community-meta-sep">·</span>
                        <span>{formatDate(postDetail.created_at)}</span>
                        {postDetail.category && ` · ${CATEGORIES.find(c => c.value === postDetail.category)?.label || postDetail.category}`}
                      </div>
                      <div className="community-content">{renderWithMentions(postDetail.content)}</div>
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
                        <button type="button" className="community-like" onClick={() => handleBookmark(postDetail.id)}>
                          {postDetail.bookmarked_by_me ? '★ В закладках' : '☆ В закладки'}
                        </button>
                        {(user?.id === postDetail.author_id || isAdmin) && (
                          <button type="button" className="community-delete" onClick={() => handleDeletePost(postDetail.id)}>Удалить</button>
                        )}
                      </div>
                    </article>
                    <section className="community-comments-section">
                      <h3>Комментарии</h3>
                      {(() => {
                        const renderComment = (node: TreeCommentNode<Comment>, level: number) => {
                          const hasReplies = node.replies.length > 0
                          const totalReplies = countReplies(node)
                          const isExpanded = expandedCommentIds.has(node.id)
                          return (
                            <div key={node.id} className="community-comment-wrap">
                              <div className={`community-comment community-comment-level-${Math.min(level, 5)}`}>
                                {node.parent_username && (
                                  <div className="community-comment-reply-to">
                                    Ответ на <CommunityAuthorChip username={node.parent_username} avatarUrl={node.parent_avatar_url} />
                                  </div>
                                )}
                                <div className="community-comment-meta">
                                  <CommunityAuthorChip username={node.author_username} avatarUrl={node.author_avatar_url} />
                                  <span>·</span>
                                  <span>{formatDate(node.created_at)}</span>
                                  {isAuthenticated && (
                                    <button type="button" className="community-comment-reply-btn" onClick={() => setReplyToCommentId(node.id)} title="Ответить">↩ Ответить</button>
                                  )}
                                  {(user?.id === node.author_id || isAdmin) && (
                                    <button type="button" className="community-comment-delete" onClick={() => handleDeleteComment(node.id)}>×</button>
                                  )}
                                </div>
                                <p>{renderWithMentions(node.content)}</p>
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
        return commentTree.map((node) => renderComment(node, 0))
                      })()}
                      {hasMoreComments && comments.length > 0 && (
                        <button type="button" className="community-comment-expand" onClick={loadMoreComments}>
                          Показать еще комментарии
                        </button>
                      )}
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
                  <div className="community-toolbar-label">🧭 Лента</div>
                  <input
                    className="community-select"
                    value={searchText}
                    onChange={(e) => setSearchText(e.target.value)}
                    placeholder="Поиск по постам..."
                    aria-label="Поиск постов"
                  />
                  <CustomSelect
                    className="community-select"
                    value={category}
                    onChange={setCategory}
                    options={CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
                    ariaLabel="Категория"
                  />
                  {isAuthenticated && category && (
                    <button
                      type="button"
                      className="community-btn-primary"
                      onClick={() => {
                        communityAPI.toggleSubscription(category).then(() => communityAPI.getSubscriptions()).then((r) => {
                          setSubscriptions((r.data || []).map((x: any) => x.category))
                        }).catch((err) => reportError(err, 'Не удалось обновить подписки'))
                      }}
                    >
                      {subscriptions.includes(category.toUpperCase()) || subscriptions.includes(category) ? 'Отписаться от категории' : 'Подписаться на категорию'}
                    </button>
                  )}
                  <CustomSelect
                    className="community-select"
                    value={sort}
                    onChange={setSort}
                    options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                    ariaLabel="Сортировка"
                  />
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
                    <CustomSelect
                      className="community-select community-select-full"
                      value={newPostCategory}
                      onChange={setNewPostCategory}
                      options={CATEGORIES.filter(c => c.value).map((c) => ({ value: c.value, label: c.label }))}
                      ariaLabel="Категория поста"
                    />
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
                        <CommunityPostCard post={p} onOpenPost={openPost} formatDate={formatDate} />
                      </li>
                    ))}
                  </ul>
                )}
                {!loading && hasMorePosts && (
                  <div className="community-load-more-wrap">
                    <button type="button" className="community-btn-primary" onClick={() => loadPosts(true, postOffset)}>
                      Загрузить еще
                    </button>
                  </div>
                )}
                {!isAuthenticated && (
                  <p className="community-login-hint">Войдите, чтобы создавать посты и комментировать.</p>
                )}
              </>
            )}
          </motion.div>
        )}

        {tab === 'updates' && (
          <motion.div
            key="updates"
            className="community-updates"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {updatesLoading ? (
              <div className="community-loading"><div className="spinner" /> Загрузка обновлений...</div>
            ) : updates.length === 0 ? (
              <p className="community-empty">Пока нет опубликованных обновлений.</p>
            ) : (
              <ul className="community-updates-list">
                {updates.map((u) => (
                  <li key={u.id}>
                    <article
                      className={`community-update-card ${u.is_pinned ? 'is-pinned' : ''}`}
                      style={{
                        ['--update-accent' as any]: u.theme_config?.accent_color || '#8B7ED8',
                        ['--update-secondary' as any]: u.theme_config?.secondary_color || '#B8A9E8',
                        ['--update-bg' as any]: u.theme_config?.background_gradient || 'linear-gradient(135deg, rgba(139,126,216,0.12), rgba(12,10,24,0.65))',
                      }}
                    >
                      <header className="community-update-head">
                        <div className="community-update-title-wrap">
                          <span className="community-update-icon">{u.theme_config?.icon || '◉'}</span>
                          <div>
                            <h3>{u.title}</h3>
                            <div className="community-update-meta">
                              <span>{u.topic}</span>
                              <span>·</span>
                              <span>{formatDate(u.published_at || u.created_at)}</span>
                              {u.author_username && (
                                <>
                                  <span>·</span>
                                  <CommunityAuthorChip username={u.author_username} />
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        {u.is_pinned && <span className="community-update-pinned">PINNED</span>}
                      </header>
                      {u.summary && <p className="community-update-summary">{u.summary}</p>}
                      <p className="community-update-content">{u.content}</p>
                      <div className="community-update-timeline">
                        {(u.timeline_events || []).slice(0, 8).map((evt, idx) => (
                          <div key={`${u.id}-${idx}`} className={`community-update-point type-${evt.type}`}>
                            <div className="community-update-dot" aria-hidden="true" />
                            <div className="community-update-line" aria-hidden="true" />
                            <div className="community-update-event-body">
                              <div className="community-update-event-head">
                                <strong>{evt.title}</strong>
                                <span>{formatDate(evt.date)}</span>
                              </div>
                              <p>{evt.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
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
              <div className="community-toolbar-label">🗳 Опросы</div>
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
                        <CommunityAuthorChip username={poll.author_username} avatarUrl={poll.author_avatar_url} />
                        <span className="community-meta-sep">·</span>
                        <span>{formatDate(poll.created_at)}</span>
                        <span className="community-meta-sep">·</span>
                        <span>всего голосов: {poll.total_votes}</span>
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
                        <button
                          type="button"
                          className="community-like"
                          onClick={() => {
                            communityAPI
                              .setPollClosed(poll.id, !poll.closed)
                              .then((updated) => setPolls((prev) => prev.map((p) => (p.id === poll.id ? updated.data : p))))
                              .catch((err) => setError(getApiError(err, 'Не удалось сменить статус опроса')))
                          }}
                        >
                          {poll.closed ? 'Открыть опрос' : 'Закрыть опрос'}
                        </button>
                      )}
                      {(user?.id === poll.author_id || isAdmin) && (
                        <button type="button" className="community-delete community-poll-delete" onClick={() => { if (confirm('Удалить опрос?')) communityAPI.deletePoll(poll.id).then(() => setPolls((prev) => prev.filter((p) => p.id !== poll.id))) }}>Удалить опрос</button>
                      )}
                    </article>
                  </li>
                ))}
              </ul>
            )}
            {!pollsLoading && hasMorePolls && polls.length > 0 && (
              <div className="community-load-more-wrap">
                <button type="button" className="community-btn-primary" onClick={loadMorePolls}>Загрузить еще опросы</button>
              </div>
            )}
            {!isAuthenticated && (
              <p className="community-login-hint">Войдите, чтобы создавать опросы и голосовать.</p>
            )}
          </motion.div>
        )}

        {tab === 'users' && (
          <motion.div
            key="users"
            className="community-users"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {!isAuthenticated ? (
              <p className="community-login-hint">Войдите, чтобы искать игроков и добавлять друзей.</p>
            ) : (
              <>
                <div className="community-users-grid">
                  <section className="community-widget">
                    <div className="community-widget-head">
                      <span aria-hidden="true">🔎</span>
                      <h3>Поиск игроков</h3>
                    </div>
                    <input
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      placeholder="Ник или часть ника..."
                      className="community-widget-input"
                    />
                    <ul className="community-users-list">
                      {foundUsers.map((fu) => (
                        <li key={fu.user_id ?? fu.id}>
                          <Link to={`/user/${encodeURIComponent(fu.username)}`}>{fu.username}</Link>
                          <span> · репутация: {fu.reputation_score ?? 0}</span>
                          <button
                            type="button"
                            className="community-friend-btn"
                            onClick={() => {
                              const uid = (fu as any).user_id ?? fu.id
                              communityAPI.toggleFriend(uid).then(() => Promise.all([communityAPI.getCommunityUsers({ q: userSearch || undefined, limit: 25 }), communityAPI.getFriends()])).then(([usersRes, friendsRes]) => {
                                setFoundUsers(usersRes.data || [])
                                setFriends(friendsRes.data || [])
                              }).catch((err) => reportError(err, 'Не удалось обновить список друзей'))
                            }}
                          >
                            {(fu as any).is_friend ? 'Удалить из друзей' : 'Добавить в друзья'}
                          </button>
                        </li>
                      ))}
                    </ul>
                    {foundUsers.length === 0 && <p className="community-widget-empty">Пользователи не найдены.</p>}
                  </section>
                  <section className="community-widget">
                    <div className="community-widget-head">
                      <span aria-hidden="true">🤝</span>
                      <h3>Мои друзья</h3>
                    </div>
                    <ul className="community-users-list">
                      {friends.map((f) => (
                        <li key={f.user_id}>
                          <Link to={`/user/${encodeURIComponent(f.username)}`}>{f.username}</Link>
                          <span> · репутация: {f.reputation_score}</span>
                          <button
                            type="button"
                            className="community-friend-btn"
                            onClick={() => {
                              communityAPI.toggleFriend(f.user_id).then(() => Promise.all([communityAPI.getCommunityUsers({ q: userSearch || undefined, limit: 25 }), communityAPI.getFriends()])).then(([usersRes, friendsRes]) => {
                                setFoundUsers(usersRes.data || [])
                                setFriends(friendsRes.data || [])
                              }).catch((err) => reportError(err, 'Не удалось обновить список друзей'))
                            }}
                          >
                            Удалить
                          </button>
                        </li>
                      ))}
                    </ul>
                    {friends.length === 0 && <p className="community-widget-empty">Список друзей пока пуст.</p>}
                  </section>
                </div>
              </>
            )}
          </motion.div>
        )}

        {tab === 'mentions' && (
          <motion.div
            key="mentions"
            className="community-users"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {!isAuthenticated ? (
              <p className="community-login-hint">Войдите, чтобы видеть упоминания.</p>
            ) : mentionsLoading ? (
              <div className="community-loading"><div className="spinner" /> Загрузка упоминаний...</div>
            ) : mentions.length === 0 ? (
              <p className="community-empty">Упоминаний пока нет.</p>
            ) : (
              <ul className="community-users-list">
                {mentions.map((m) => (
                  <li key={m.id}>
                    <span>@{m.author_username || 'пользователь'} упомянул(а) вас</span>
                    <span> · {formatDate(m.created_at)}</span>
                    <Link to={`/community?tab=forum&post=${m.target_type === 'post' ? m.target_id : ''}`}>Открыть контекст</Link>
                    {!m.is_read && (
                      <button
                        type="button"
                        className="community-friend-btn"
                        onClick={() => {
                          communityAPI.markMentionRead(m.id).then(() => {
                            setMentions((prev) => prev.map((x) => (x.id === m.id ? { ...x, is_read: true } : x)))
                          }).catch((err) => reportError(err, 'Не удалось отметить упоминание как прочитанное'))
                        }}
                      >
                        Пометить прочитанным
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
