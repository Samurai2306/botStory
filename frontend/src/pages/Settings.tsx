import { useEffect, useState } from 'react'
import { userAPI } from '../services/api'
import { resolveApiUrl } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { mergeProfilePreferences, type ProfilePreferences } from '../types/profile'
import CustomSelect, { type CustomSelectOption } from '../components/ui/CustomSelect'
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
  const [avatarKey, setAvatarKey] = useState<string>('')
  const [avatarCatalog, setAvatarCatalog] = useState<Record<string, { key: string; url: string }[]>>({})
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
    setAvatarKey(user.avatar_key || '')
    setPrefs(mergeProfilePreferences(user.profile_preferences))
  }, [user])

  useEffect(() => {
    userAPI.getAvatarCatalog().then((res) => setAvatarCatalog(res.data || {})).catch(() => setAvatarCatalog({}))
  }, [])

  const patchPrefs = (partial: ProfilePreferences) => {
    setPrefs((prev) => ({
      ui: { ...prev.ui, ...(partial.ui || {}) },
      learning: { ...prev.learning, ...(partial.learning || {}) },
      privacy: { ...prev.privacy, ...(partial.privacy || {}) },
      notifications: { ...prev.notifications, ...(partial.notifications || {}) },
    }))
  }

  const avatarOptions: CustomSelectOption[] = [
    { value: '', label: 'Буквенный аватар' },
    ...Object.entries(avatarCatalog).flatMap(([group, items]) =>
      items.map((item) => ({ value: item.key, label: `${group} / ${item.key}` }))
    ),
  ]

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
        avatar_key: avatarKey || null,
        profile_preferences: {
          ui: {
            compact_level_hub: prefs.ui.compact_level_hub,
            reduced_motion: prefs.ui.reduced_motion,
            performance_mode: prefs.ui.performance_mode,
          },
          learning: {
            chat_default_spoiler: prefs.learning.chat_default_spoiler,
            show_golden_after_complete: prefs.learning.show_golden_after_complete,
          },
          notifications: {
            quiet_mode: !!prefs.notifications.quiet_mode,
            digest_mode: prefs.notifications.digest_mode,
            push_in_app: !!prefs.notifications.push_in_app,
          },
          privacy: {
            hide_stats_on_public: prefs.privacy.hide_stats_on_public,
            hide_achievements_on_public: prefs.privacy.hide_achievements_on_public,
            hide_bio_on_public: prefs.privacy.hide_bio_on_public,
            hide_tagline_on_public: prefs.privacy.hide_tagline_on_public,
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
          <div className="settings-select-wrapper">
            <label>Аватар</label>
            <CustomSelect
              className="settings-select-shell"
              value={avatarKey}
              onChange={setAvatarKey}
              options={avatarOptions}
              ariaLabel="Выбор аватара"
            />
          </div>
          <div className="settings-avatar-preview">
            <div className="settings-avatar-preview-current">
              <span className="settings-avatar-preview-label">Предпросмотр</span>
              {avatarKey ? (
                <img
                  src={resolveApiUrl(
                    Object.values(avatarCatalog).flat().find((x) => x.key === avatarKey)?.url || null
                  ) || ''}
                  alt={`Предпросмотр ${avatarKey}`}
                  className="settings-avatar-preview-img"
                />
              ) : (
                <div className="settings-avatar-preview-fallback">Буква</div>
              )}
            </div>
            <div className="settings-avatar-grid">
              {Object.entries(avatarCatalog).flatMap(([group, items]) =>
                items.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={`settings-avatar-item ${avatarKey === item.key ? 'active' : ''}`}
                    onClick={() => setAvatarKey(item.key)}
                    title={`${group}: ${item.key}`}
                  >
                    <img src={resolveApiUrl(item.url) || ''} alt={item.key} />
                  </button>
                ))
              )}
            </div>
          </div>
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
          <label className="settings-check">
            <input
              type="checkbox"
              checked={prefs.privacy.hide_bio_on_public}
              onChange={(e) =>
                patchPrefs({ privacy: { hide_bio_on_public: e.target.checked } })
              }
            />
            Скрыть поле «О себе» на публичной странице
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={prefs.privacy.hide_tagline_on_public}
              onChange={(e) =>
                patchPrefs({ privacy: { hide_tagline_on_public: e.target.checked } })
              }
            />
            Скрыть слоган на публичной странице
          </label>
        </div>

        <div className="settings-section">
          <h3>Интерфейс</h3>
          <div className="settings-select-wrapper">
            <label>Язык</label>
            <CustomSelect
              className="settings-select-shell"
              value={locale}
              onChange={(value) => setLocale(value as Locale)}
              options={[
                { value: 'ru', label: 'Русский' },
                { value: 'en', label: 'English' },
              ]}
              ariaLabel="Выбор языка"
            />
          </div>
          <div className="settings-select-wrapper">
            <label>Терминал в брифинге</label>
            <CustomSelect
              className="settings-select-shell"
              value={terminalTheme}
              onChange={(value) => setTerminalTheme(value as TerminalTheme)}
              options={[
                { value: 'windows', label: 'Windows' },
                { value: 'macos', label: 'macOS' },
                { value: 'linux', label: 'Linux' },
              ]}
              ariaLabel="Выбор темы терминала"
            />
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
          <label className="settings-check">
            <input
              type="checkbox"
              checked={!!prefs.ui.performance_mode}
              onChange={(e) =>
                patchPrefs({ ui: { performance_mode: e.target.checked } })
              }
            />
            Performance mode (упрощённые эффекты на слабых устройствах)
          </label>
        </div>

        <div className="settings-section">
          <h3>Уведомления 2.0</h3>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={!!prefs.notifications.quiet_mode}
              onChange={(e) =>
                patchPrefs({ notifications: { quiet_mode: e.target.checked } })
              }
            />
            Тихий режим (без всплывающих in-app push)
          </label>
          <label className="settings-check">
            <input
              type="checkbox"
              checked={!!prefs.notifications.push_in_app}
              onChange={(e) =>
                patchPrefs({ notifications: { push_in_app: e.target.checked } })
              }
            />
            Browser push (когда приложение открыто)
          </label>
          <div className="settings-select-wrapper">
            <label>Режим доставки</label>
            <CustomSelect
              className="settings-select-shell"
              value={prefs.notifications.digest_mode}
              onChange={(value) => patchPrefs({ notifications: { digest_mode: value as 'instant' | 'daily' } })}
              options={[
                { value: 'instant', label: 'Сразу' },
                { value: 'daily', label: 'Daily digest' },
              ]}
              ariaLabel="Режим доставки уведомлений"
            />
          </div>
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
