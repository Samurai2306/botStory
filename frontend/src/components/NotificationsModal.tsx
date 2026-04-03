import { useEffect, useState, useCallback, useRef, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { communityAPI } from '../services/api'
import CustomSelect from './ui/CustomSelect'
import './NotificationsModal.css'

export type AppNotification = {
  id: number
  type: string
  title: string
  body?: string | null
  payload?: Record<string, unknown> | null
  is_read: boolean
  is_pinned?: boolean
  created_at: string
}

type Props = {
  open: boolean
  onClose: () => void
  onChanged?: () => void
  reducedMotion?: boolean
  restoreFocusRef?: RefObject<HTMLElement | null>
}

const NOTIFICATION_TYPE_LABELS: Record<string, string> = {
  mention: 'Упоминание',
  comment_reply: 'Ответ в обсуждении',
  poll_result: 'Опрос',
  update: 'Обновление',
  system: 'Системное',
  important_update: 'Важное обновление',
  maintenance: 'Техработы',
  community: 'Сообщество',
  general: 'Объявление',
}

function notificationTypeLabel(n: AppNotification): string {
  const p = n.payload && typeof n.payload === 'object' ? (n.payload as { admin_broadcast?: boolean; broadcast_theme?: string }) : null
  if (p?.admin_broadcast) {
    const theme = p.broadcast_theme
    if (theme && NOTIFICATION_TYPE_LABELS[theme]) return NOTIFICATION_TYPE_LABELS[theme]
    return 'Рассылка'
  }
  return NOTIFICATION_TYPE_LABELS[n.type] ?? n.type
}

function notificationThemeModifier(n: AppNotification): string {
  const p = n.payload && typeof n.payload === 'object' ? (n.payload as { admin_broadcast?: boolean; broadcast_theme?: string }) : null
  if (!p?.admin_broadcast) return ''
  const slug = (p.broadcast_theme || n.type || 'general').replace(/_/g, '-')
  return ` notifications-modal-item--theme-${slug}`
}

function notificationContextHref(n: AppNotification): string | null {
  const payload = n.payload || {}
  const postId = Number((payload as { post_id?: number }).post_id)
  const targetId = Number((payload as { target_id?: number }).target_id)
  const targetType = String((payload as { target_type?: string }).target_type || '')
  const fromUserId = Number((payload as { from_user_id?: number }).from_user_id)
  if (Number.isFinite(postId) && postId > 0) return `/community?tab=forum&post=${postId}`
  if (targetType === 'post' && Number.isFinite(targetId) && targetId > 0) return `/community?tab=forum&post=${targetId}`
  if (Number.isFinite(fromUserId) && fromUserId > 0) return `/user-id/${fromUserId}`
  return null
}

export default function NotificationsModal({ open, onClose, onChanged, reducedMotion, restoreFocusRef }: Props) {
  const [items, setItems] = useState<AppNotification[]>([])
  const [filter, setFilter] = useState<'all' | 'unread' | 'important'>('all')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    communityAPI
      .getNotifications({ limit: 100 })
      .then((r) => setItems(r.data || []))
      .catch(() => {
        setItems([])
        setError('Не удалось загрузить уведомления')
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!open) return
    load()
  }, [open, load])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key !== 'Tab') return
      const root = panelRef.current
      if (!root) return

      const focusable = root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement as HTMLElement | null

      if (e.shiftKey && active === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    closeButtonRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
      restoreFocusRef?.current?.focus()
    }
  }, [open, restoreFocusRef])

  const togglePin = async (n: AppNotification) => {
    const next = !n.is_pinned
    try {
      await communityAPI.setNotificationPinned(n.id, next)
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_pinned: next } : x)))
      onChanged?.()
    } catch {
      setError('Не удалось изменить закрепление')
    }
  }

  const markRead = async (n: AppNotification) => {
    if (n.is_read) return
    try {
      await communityAPI.markNotificationRead(n.id)
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)))
      onChanged?.()
    } catch {
      setError('Не удалось отметить уведомление как прочитанное')
    }
  }

  const markAllRead = async () => {
    try {
      await communityAPI.markAllNotificationsRead()
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })))
      onChanged?.()
    } catch {
      setError('Не удалось отметить все уведомления как прочитанные')
    }
  }

  const deleteNotification = async (notificationId: number) => {
    try {
      await communityAPI.deleteNotification(notificationId)
      setItems((prev) => prev.filter((x) => x.id !== notificationId))
      onChanged?.()
    } catch {
      setError('Не удалось удалить уведомление')
    }
  }

  if (!open) return null

  const filtered = items.filter((n) => {
    if (filter === 'all') return true
    if (filter === 'unread') return !n.is_read
    return n.type === 'important_update' || n.type === 'system' || n.type === 'maintenance'
  })

  const content = (
    <div
      className={`notifications-modal-overlay${reducedMotion ? ' notifications-modal--reduced-motion' : ''}`}
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div
        className="notifications-modal-frame"
        role="presentation"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="notifications-modal-panel-bg" aria-hidden="true" />
        <div
          ref={panelRef}
          className="notifications-modal-panel"
          role="dialog"
          aria-modal="true"
          aria-labelledby="notifications-modal-title"
        >
        <header className="notifications-modal-head">
          <span className="notifications-modal-head-icon" aria-hidden="true">◉</span>
          <h2 id="notifications-modal-title">Уведомления</h2>
          <button ref={closeButtonRef} type="button" className="notifications-modal-close" onClick={onClose} aria-label="Закрыть">
            ✕
          </button>
        </header>
        {error && <p className="notifications-modal-error" role="alert">{error}</p>}
        <p className="notifications-modal-hint">
          Раз в месяц незакреплённые уведомления удаляются автоматически. Нажмите «закрепить», чтобы сохранить важные.
        </p>
        <div className="notifications-modal-actions">
          <button type="button" className="notifications-modal-refresh" onClick={load} disabled={loading}>
            ◌ Обновить
          </button>
          <button type="button" className="notifications-modal-refresh" onClick={() => void markAllRead()} disabled={loading || items.length === 0}>
            ✓ Прочитать всё
          </button>
          <div className="notifications-modal-filter-wrap">
            <CustomSelect
              className="notifications-modal-filter"
              value={filter}
              onChange={(value) => setFilter(value as 'all' | 'unread' | 'important')}
              options={[
                { value: 'all', label: 'Все' },
                { value: 'unread', label: 'Непрочитанные' },
                { value: 'important', label: 'Важные' },
              ]}
              ariaLabel="Фильтр уведомлений"
            />
          </div>
          <Link to="/community" className="notifications-modal-community" onClick={onClose}>
            ◐ В сообщество
          </Link>
        </div>
        <div className="notifications-modal-list-wrap">
          {loading && filtered.length === 0 ? (
            <p className="notifications-modal-empty">Загрузка…</p>
          ) : filtered.length === 0 ? (
            <p className="notifications-modal-empty">
              <span className="notifications-modal-empty-icon" aria-hidden="true">◇</span>
              Пока нет уведомлений
            </p>
          ) : (
            <ul className="notifications-modal-list">
              {filtered.map((n) => (
                <li
                  key={n.id}
                  className={`notifications-modal-item${n.is_read ? '' : ' is-unread'}${n.is_pinned ? ' is-pinned' : ''}${notificationThemeModifier(n)}`}
                >
                  <div className="notifications-modal-item-main">
                    <button
                      type="button"
                      className="notifications-modal-item-body"
                      onClick={() => markRead(n)}
                    >
                      <span className="notifications-modal-item-type">{notificationTypeLabel(n)}</span>
                      <strong>{n.title}</strong>
                      {n.body && <span className="notifications-modal-item-text">{n.body}</span>}
                      <time dateTime={n.created_at}>
                        {new Date(n.created_at).toLocaleString('ru-RU')}
                      </time>
                    </button>
                    <button
                      type="button"
                      className={`notifications-modal-pin${n.is_pinned ? ' active' : ''}`}
                      onClick={() => togglePin(n)}
                      title={n.is_pinned ? 'Снять закрепление (будет доступно к автоочистке)' : 'Закрепить — не удалять при месячной очистке'}
                      aria-pressed={!!n.is_pinned}
                    >
                      {n.is_pinned ? '★' : '☆'}
                    </button>
                    <button
                      type="button"
                      className="notifications-modal-delete"
                      onClick={() => void deleteNotification(n.id)}
                      title="Удалить уведомление"
                      aria-label="Удалить уведомление"
                    >
                      🗑
                    </button>
                    {notificationContextHref(n) && (
                      <Link className="notifications-modal-community" to={notificationContextHref(n) || '/community'} onClick={onClose}>
                        Открыть
                      </Link>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        </div>
      </div>
    </div>
  )

  return createPortal(content, document.body)
}
