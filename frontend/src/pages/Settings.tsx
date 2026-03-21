import { useEffect, useState } from 'react'
import { userAPI } from '../services/api'
import { useAuthStore } from '../store/authStore'
import './Settings.css'

type Locale = 'ru' | 'en'
type TerminalTheme = 'windows' | 'macos' | 'linux'

export default function Settings() {
  const { fetchUser, user } = useAuthStore()
  const [locale, setLocale] = useState<Locale>('ru')
  const [terminalTheme, setTerminalTheme] = useState<TerminalTheme>('linux')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const uLocale = (user as any)?.locale
    const uTheme = (user as any)?.terminal_theme
    if (uLocale === 'ru' || uLocale === 'en') setLocale(uLocale)
    if (uTheme === 'windows' || uTheme === 'macos' || uTheme === 'linux') setTerminalTheme(uTheme)
  }, [user])

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      await userAPI.updateProfile({ locale, terminal_theme: terminalTheme })
      await fetchUser()
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Не удалось сохранить настройки')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="settings">
      <div className="settings-card">
        <h1>Настройки</h1>

        <div className="settings-section">
          <h3>Язык</h3>
          <div className="settings-select-wrapper">
            <select
              className="settings-select"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              <option value="ru">Русский</option>
              <option value="en">English</option>
            </select>
          </div>
        </div>

        <div className="settings-section">
          <h3>Терминал</h3>
          <div className="settings-select-wrapper">
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
          <p className="settings-hint">Выбор влияет на внешний вид терминала в брифинге.</p>
        </div>

        {error && <div className="settings-error">{error}</div>}

        <button type="button" className="settings-save" onClick={save} disabled={saving}>
          {saving ? 'Сохранение…' : 'Сохранить'}
        </button>
      </div>
    </div>
  )
}

