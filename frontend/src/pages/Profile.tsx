import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { userAPI, gamificationAPI } from '../services/api'
import { resolveApiUrl } from '../services/api'
import CustomSelect from '../components/ui/CustomSelect'
import './Profile.css'

type AchievementRow = {
  slug: string
  category: string
  name: string
  description: string
  is_hidden: boolean
  earned: boolean
  earned_at?: string | null
}

type EquippedSlot = {
  slot: number
  title_id?: number | null
  slug?: string | null
  name?: string | null
}

type HeldTitle = {
  title_id: number
  slug: string
  name: string
}

type Tab = 'overview' | 'achievements' | 'titles'

export default function Profile() {
  const { user } = useAuthStore()
  const [tab, setTab] = useState<Tab>('overview')
  const [stats, setStats] = useState({ completed: 0, total: 0, progress_percent: 0 })
  const [achievements, setAchievements] = useState<AchievementRow[]>([])
  const [heldTitles, setHeldTitles] = useState<HeldTitle[]>([])
  const [equippedSlots, setEquippedSlots] = useState<EquippedSlot[]>([])
  const [slot1, setSlot1] = useState<number | ''>('')
  const [slot2, setSlot2] = useState<number | ''>('')
  const [titlesSaving, setTitlesSaving] = useState(false)
  const [titlesMsg, setTitlesMsg] = useState<string | null>(null)
  const [copyDone, setCopyDone] = useState(false)

  useEffect(() => {
    userAPI.getStats().then((res) => setStats(res.data)).catch(console.error)
  }, [])

  useEffect(() => {
    if (tab === 'achievements') {
      gamificationAPI
        .getMyAchievements()
        .then((res) => setAchievements(res.data as AchievementRow[]))
        .catch(console.error)
    }
    if (tab === 'titles') {
      Promise.all([
        gamificationAPI.getEquippedTitles(),
        gamificationAPI.getMyHeldTitles(),
      ])
        .then(([eq, ht]) => {
          const rows = eq.data as EquippedSlot[]
          setEquippedSlots(rows)
          const by = Object.fromEntries(rows.map((r) => [r.slot, r.title_id]))
          setSlot1((by[1] as number | undefined) ?? '')
          setSlot2((by[2] as number | undefined) ?? '')
          setHeldTitles(ht.data as HeldTitle[])
        })
        .catch(console.error)
    }
  }, [tab])

  const copyPublicLink = () => {
    if (!user) return
    const url = `${window.location.origin}/user/${encodeURIComponent(user.username)}`
    void navigator.clipboard.writeText(url).then(() => {
      setCopyDone(true)
      setTimeout(() => setCopyDone(false), 2000)
    })
  }

  const saveEquipped = async () => {
    setTitlesMsg(null)
    setTitlesSaving(true)
    try {
      await gamificationAPI.setEquippedTitles({
        slot1_title_id: slot1 === '' ? null : Number(slot1),
        slot2_title_id: slot2 === '' ? null : Number(slot2),
      })
      const [eq, ht] = await Promise.all([
        gamificationAPI.getEquippedTitles(),
        gamificationAPI.getMyHeldTitles(),
      ])
      const rows = eq.data as EquippedSlot[]
      setEquippedSlots(rows)
      setHeldTitles(ht.data as HeldTitle[])
      const by = Object.fromEntries(rows.map((r) => [r.slot, r.title_id]))
      setSlot1((by[1] as number | undefined) ?? '')
      setSlot2((by[2] as number | undefined) ?? '')
      setTitlesMsg('Сохранено')
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setTitlesMsg(err.response?.data?.detail || 'Не удалось сохранить титулы')
    } finally {
      setTitlesSaving(false)
    }
  }

  if (!user) return null

  const heldIds = new Set(heldTitles.map((t) => t.title_id))
  const slot1Row = equippedSlots.find((r) => r.slot === 1)
  const slot2Row = equippedSlots.find((r) => r.slot === 2)

  const slot1Options = [
    { value: '', label: '—' },
    ...heldTitles.map((t) => ({ value: String(t.title_id), label: t.name })),
  ]
  if (
    slot1 !== '' &&
    !heldIds.has(Number(slot1)) &&
    slot1Row?.title_id === slot1 &&
    slot1Row.name
  ) {
    slot1Options.push({ value: String(slot1), label: slot1Row.name })
  }

  const slot2Options = [
    { value: '', label: '—' },
    ...heldTitles.map((t) => ({ value: String(t.title_id), label: t.name })),
  ]
  if (
    slot2 !== '' &&
    !heldIds.has(Number(slot2)) &&
    slot2Row?.title_id === slot2 &&
    slot2Row.name
  ) {
    slot2Options.push({ value: String(slot2), label: slot2Row.name })
  }

  const catLabel: Record<string, string> = {
    social: 'Социальные',
    progression: 'Прогресс',
    efficiency: 'Эффективность',
    hardcore: 'Хардкор',
  }

  return (
    <div className="profile">
      <div className="profile-passport">
        <div className="profile-passport-top">
          <span className="profile-passport-id">UID // {user.id}</span>
          <div className="profile-avatar">
            {user.avatar_url ? (
              <img src={resolveApiUrl(user.avatar_url) || ''} alt={`Аватар ${user.username}`} className="profile-avatar-img" />
            ) : (
              user.username.charAt(0).toUpperCase()
            )}
          </div>
        </div>
        <h1 className="glitch profile-username">{user.username}</h1>
        {user.tagline && <p className="profile-tagline">{user.tagline}</p>}
        {user.bio && <p className="profile-bio">{user.bio}</p>}
        {!user.tagline && !user.bio && (
          <p className="profile-bio-placeholder">
            Добавьте слоган и описание в{' '}
            <Link to="/settings">настройках</Link>.
          </p>
        )}
        <p className="profile-email">{user.email}</p>
        <div className="profile-role">
          Роль: <span>{user.role === 'admin' ? 'Администратор' : 'Игрок'}</span>
        </div>
        <div className="profile-actions">
          <button type="button" className="profile-btn-copy" onClick={copyPublicLink}>
            {copyDone ? 'Скопировано' : 'Ссылка на публичный профиль'}
          </button>
          <Link to="/settings" className="profile-link-settings">
            Настройки профиля и приватности →
          </Link>
        </div>
      </div>

      <div className="profile-tabs">
        <button
          type="button"
          className={tab === 'overview' ? 'active' : ''}
          onClick={() => setTab('overview')}
        >
          Обзор
        </button>
        <button
          type="button"
          className={tab === 'achievements' ? 'active' : ''}
          onClick={() => setTab('achievements')}
        >
          Достижения
        </button>
        <button
          type="button"
          className={tab === 'titles' ? 'active' : ''}
          onClick={() => setTab('titles')}
        >
          Титулы
        </button>
      </div>

      {tab === 'overview' && (
        <div className="profile-card">
          <div className="profile-stats">
            <div className="stat-item">
              <div className="stat-value">{stats.completed}</div>
              <div className="stat-label">Пройдено уровней</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{stats.total}</div>
              <div className="stat-label">Всего уровней</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">{stats.progress_percent}%</div>
              <div className="stat-label">Прогресс</div>
            </div>
          </div>
          <p className="profile-meta">
            Аккаунт создан: {new Date(user.created_at).toLocaleDateString('ru-RU')}
          </p>
        </div>
      )}

      {tab === 'achievements' && (
        <div className="profile-card profile-achievements">
          <p className="profile-hint">
            Секретные достижения скрыты, пока не получены.
          </p>
          <div className="achievement-grid">
            {achievements.map((a) => (
              <div
                key={a.slug}
                className={`achievement-card ${a.earned ? 'earned' : 'locked'}`}
              >
                <span className="achievement-cat">{catLabel[a.category] || a.category}</span>
                <h3>{a.name}</h3>
                <p>{a.description}</p>
                {a.earned && a.earned_at && (
                  <span className="achievement-date">
                    {new Date(a.earned_at).toLocaleDateString('ru-RU')}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'titles' && (
        <div className="profile-card profile-titles">
          <h2 className="profile-section-title">Экипировка (2 слота)</h2>
          <p className="profile-hint">
            Можно выбрать только титулы, которыми вы владеете сейчас. Пустой слот — «—».
          </p>
          <div className="title-equip-row">
            <label>
              Слот 1
              <CustomSelect
                className="profile-title-select"
                value={slot1 === '' ? '' : String(slot1)}
                onChange={(value) => setSlot1(value === '' ? '' : Number(value))}
                options={slot1Options}
                ariaLabel="Выбор титула для слота 1"
              />
            </label>
            <label>
              Слот 2
              <CustomSelect
                className="profile-title-select"
                value={slot2 === '' ? '' : String(slot2)}
                onChange={(value) => setSlot2(value === '' ? '' : Number(value))}
                options={slot2Options}
                ariaLabel="Выбор титула для слота 2"
              />
            </label>
          </div>
          <button
            type="button"
            className="profile-save-titles"
            onClick={() => void saveEquipped()}
            disabled={titlesSaving}
          >
            {titlesSaving ? 'Сохранение…' : 'Сохранить слоты'}
          </button>
          {titlesMsg && <p className="profile-titles-msg">{titlesMsg}</p>}
        </div>
      )}
    </div>
  )
}
