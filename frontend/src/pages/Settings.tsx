import { useEffect, useState } from 'react'
import { userAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { mergeProfilePreferences, type ProfilePreferences } from '../types/profile'
import './Settings.css'

type Locale = 'ru' | 'en'
type TerminalTheme = 'windows' | 'macos' | 'linux'

export default function Settings() {
  const { fetchUser, user } = useAuthStore()
  const [locale, setLocale] = useState<Locale>('ru')
  const [terminalTheme, setTerminalTheme] = useState<TerminalTheme>('linux')
  const [bio, setBio] = useState('')
  const [tagline, setTagline] = useState('')
  const [prefs, setPrefs] = useState<ReturnType<typeof mergeProfilePreferences>>(
    mergeProfilePreferences(null)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState(false)

  useEffect(() => {
    if (!user) return
    const uLocale = user.locale
    const uTheme = user.terminal_theme
    if (uLocale === 'ru' || uLocale === 'en') setLocale(uLocale)
    if (uTheme === 'windows' || uTheme === 'macos' || uTheme === 'linux') setTerminalTheme(uTheme)
    setBio(user.bio || '')
    setTagline(user.tagline || '')
    setPrefs(mergeProfilePreferences(user.profile_preferences))
  }, [user])

  const patchPrefs = (partial: ProfilePreferences) => {
    setPrefs((prev) => ({
      ui: { ...prev.ui, ...(partial.ui || {}) },
      learning: { ...prev.learning, ...(partial.learning || {}) },
      privacy: { ...prev.privacy, ...(partial.privacy || {}) },
    }))
  }

  const save = async () => {
    setSaving(true)
    setError(null)
    setOk(false)
    try {
      await userAPI.updateProfile({
        locale,
        terminal_theme: terminalTheme,
        bio: bio.trim() || null,
        tagline: tagline.trim() || null,
        profile_preferences: {
          ui: {
            compact_level_hub: prefs.ui.compact_level_hub,
            reduced_motion: prefs.ui.reduced_motion,
          },
          learning: {
            chat_default_spoiler: prefs.learning.chat_default_spoiler,
            show_golden_after_complete: prefs.learning.show_golden_after_complete,
          },
          privacy: {
            hide_stats_on_public: prefs.privacy.hide_stats_on_public,
            hide_achievements_on_public: prefs.privacy.hide_achievements_on_public,
          },
        },
      })
      await fetchUser()
      setOk(true)
      setTimeout(() => setOk(false), 2500)
    } catch (e: unknown) {
      const err = e as { response?: { data?: { detail?: string } } }
      setError(err.response?.data?.detail ?? 'Не удалось сохранить настройки')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings">
      <div className="settings-card">
        <h1>Настройки</h1>

        <div className="settings-section">
          <h3>Профиль</h3>
          <label className="settings-field">
            Слоган (до 120 символов)
            <input
              type="text"
              maxLength={120}
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="Короткая строка под ником"
            />
          </label>
          <label className="settings-field">
            О себе (до 500 символов)
            <textarea
              rows={4}
              maxLength={500}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Расскажите о себе — текст виден вам и на публичной странице профиля."
            />
          </label>
        </div>

        <div className="settings-section">
          <h3>Приватность (публичная страница /user/…)</h3>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={prefs.privacy.hide_stats_on_public}
              onChange={(e) =>
                patchPrefs({ privacy: { hide_stats_on_public: e.target.checked } })
              }
            />
            Скрыть счётчики прогресса (пройдено / всего / %)
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={prefs.privacy.hide_achievements_on_public}
              onChange={(e) =>
                patchPrefs({ privacy: { hide_achievements_on_public: e.target.checked } })
              }
            />
            Скрыть список достижений
          </label>
        </div>

        <div className="settings-section">
          <h3>Интерфейс</h3>
          <div className="settings-select-wrapper">
            <label>Язык</label>
            <select
              className="settings-select"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </div>
          <div className="settings-select-wrapper">
            <label>Терминал в брифинге</label>
            <select
              className="settings-select"
              value={terminalTheme}
              onChange={(e) => setTerminalTheme(e.target.value as TerminalTheme)}
            >
              <option value="windows">Windows</option>
              <option value="macos">macOS</option>
              <option value="linux">Linux</option>
            </select>
          </div>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={prefs.ui.compact_level_hub}
              onChange={(e) =>
                patchPrefs({ ui: { compact_level_hub: e.target.checked } })
              }
            />
            Компактный хаб уровней
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={prefs.ui.reduced_motion}
              onChange={(e) =>
                patchPrefs({ ui: { reduced_motion: e.target.checked } })
              }
            />
            Уменьшить анимации (доступность)
          </label>
        </div>

        <div className="settings-section">
          <h3>Обучение</h3>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={prefs.learning.chat_default_spoiler}
              onChange={(e) =>
                patchPrefs({ learning: { chat_default_spoiler: e.target.checked } })
              }
            />
            По умолчанию отправлять сообщения в чат уровня в блоке спойлера
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={prefs.learning.show_golden_after_complete}
              onChange={(e) =>
                patchPrefs({ learning: { show_golden_after_complete: e.target.checked } })
              }
            />
            Показывать эталонные шаги на экране после прохождения
          </label>
        </div>

        {error && <div className="settings-error">{error}</div>}
        {ok && <div className="settings-ok">Сохранено</div>}

        <button type="button" className="settings-save" onClick={() => void save()} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}
