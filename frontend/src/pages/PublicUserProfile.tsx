import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { userAPI, communityAPI } from '../services/api'
import { resolveApiUrl } from '../services/api'
import './PublicUserProfile.css'

type PublicAchievement = {
  slug: string
  name: string
  description: string
  category: string
  earned_at?: string | null
}

type PublicTitle = {
  title_id: number
  slug: string
  name: string
  description: string
  is_current_holder: boolean
  ever_held: boolean
}

type EquippedSlot = {
  slot: number
  title_id?: number | null
  slug?: string | null
  name?: string | null
}

type PublicBody = {
  id: number
  username: string
  canonical_username?: string | null
  bio?: string | null
  tagline?: string | null
  avatar_url?: string | null
  completed_levels?: number | null
  total_active_levels?: number | null
  progress_percent?: number | null
  achievements: PublicAchievement[]
  titles: PublicTitle[]
  equipped_titles: EquippedSlot[]
}

type PublicPost = {
  id: number
  title: string
  created_at: string
}

export default function PublicUserProfile() {
  const { username, id } = useParams<{ username?: string; id?: string }>()
  const navigate = useNavigate()
  const [data, setData] = useState<PublicBody | null>(null)
  const [posts, setPosts] = useState<PublicPost[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!username && !id) return
    setError(null)
    const req = id
      ? userAPI.getPublicProfileById(Number(id))
      : userAPI.getPublicProfile(username as string)
    req
      .then((res) => {
        const body = res.data as PublicBody
        setData(body)
        if (id && body.canonical_username) {
          navigate(`/user/${encodeURIComponent(body.canonical_username)}`, { replace: true })
        }
        return communityAPI.getPosts({ author_id: body.id, limit: 5 })
      })
      .then((res) => setPosts((res.data || []).map((p: any) => ({ id: p.id, title: p.title, created_at: p.created_at }))))
      .catch(() => setError('Профиль не найден или недоступен'))
  }, [username, id, navigate])

  if (error || !data) {
    return (
      <div className="public-profile public-profile--center">
        <div className="public-profile-card">
          <p>{error || 'Загрузка…'}</p>
          <Link to="/">На главную</Link>
        </div>
      </div>
    )
  }

  const statsHidden = data.completed_levels == null && data.total_active_levels == null

  return (
    <div className="public-profile">
      <div className="public-profile-card">
        <div className="public-profile-passport">
          <span className="public-profile-label">OPERATOR</span>
          {data.avatar_url ? (
            <img className="public-profile-avatar" src={resolveApiUrl(data.avatar_url) || ''} alt={`Аватар ${data.username}`} />
          ) : null}
          <h1 className="glitch public-profile-name">{data.username}</h1>
          {data.tagline && <p className="public-profile-tagline">{data.tagline}</p>}
          {data.bio && <p className="public-profile-bio">{data.bio}</p>}
        </div>

        {!statsHidden && (
          <div className="public-profile-stats">
            <div>
              <span className="public-profile-stat-value">{data.completed_levels}</span>
              <span className="public-profile-stat-label">пройдено</span>
            </div>
            <div>
              <span className="public-profile-stat-value">{data.total_active_levels}</span>
              <span className="public-profile-stat-label">всего уровней</span>
            </div>
            <div>
              <span className="public-profile-stat-value">{data.progress_percent ?? 0}%</span>
              <span className="public-profile-stat-label">прогресс</span>
            </div>
          </div>
        )}
        {statsHidden && (
          <p className="public-profile-hidden-note">Пользователь скрыл детальную статистику.</p>
        )}

        <section className="public-profile-section">
          <h2>Активность в сообществе</h2>
          {posts.length === 0 ? (
            <p className="public-profile-muted">Пока нет публикаций.</p>
          ) : (
            <ul className="public-profile-title-list">
              {posts.map((p) => (
                <li key={p.id}>
                  <Link to={`/community?post=${p.id}`}>{p.title}</Link>
                  <p>{new Date(p.created_at).toLocaleDateString('ru-RU')}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="public-profile-section">
          <h2>Титулы в слотах</h2>
          <ul className="public-profile-equipped">
            {data.equipped_titles.map((s) => (
              <li key={s.slot}>
                Слот {s.slot}: {s.name || '—'}
              </li>
            ))}
          </ul>
        </section>

        <section className="public-profile-section">
          <h2>Достижения</h2>
          {data.achievements.length === 0 ? (
            <p className="public-profile-muted">
              Нет отображаемых достижений или список скрыт настройками приватности.
            </p>
          ) : (
            <ul className="public-profile-ach-list">
              {data.achievements.map((a) => (
                <li key={a.slug}>
                  <strong>{a.name}</strong>
                  <span className="public-profile-cat">{a.category}</span>
                  <p>{a.description}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <Link to="/" className="public-profile-back">
          ← На главную
        </Link>
      </div>
    </div>
  )
}
