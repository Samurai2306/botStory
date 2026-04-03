import { useState, useEffect, useCallback, useRef } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { communityAPI } from '../services/api'
import { resolveApiUrl } from '../services/api'
import { createWsUrl } from '../services/api'
import { mergeProfilePreferences } from '../types/profile'
import { motion } from 'framer-motion'
import NotificationsModal from './NotificationsModal'
import './Layout.css'

function SystemClock() {
  const [systemTime, setSystemTime] = useState(new Date())

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSystemTime(new Date())
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  return <>{systemTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</>
}

export default function Layout() {
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const bellButtonRef = useRef<HTMLButtonElement | null>(null)
  const pollDelayRef = useRef(15000)
  const timerRef = useRef<number | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const unreadRef = useRef(0)
  const wsHealthyRef = useRef(false)

  const refreshUnreadNotifications = useCallback(async () => {
    if (!user) {
      setUnreadNotifications(0)
      return
    }

    try {
      const countResponse = await communityAPI.getUnreadNotificationsCount()
      const nextCount = Number(countResponse.data?.unread_count ?? 0)
      setUnreadNotifications(Number.isFinite(nextCount) ? nextCount : 0)
      pollDelayRef.current = 15000
    } catch {
      try {
        const listResponse = await communityAPI.getNotifications({ limit: 100 })
        const rows = listResponse.data || []
        setUnreadNotifications(rows.filter((n: { is_read: boolean }) => !n.is_read).length)
        pollDelayRef.current = 20000
      } catch {
        setUnreadNotifications(0)
        pollDelayRef.current = Math.min(pollDelayRef.current * 2, 120000)
      }
    }
  }, [user])

  useEffect(() => {
    unreadRef.current = unreadNotifications
  }, [unreadNotifications])

  useEffect(() => {
    if (!user) return

    const clearTimer = () => {
      if (timerRef.current != null) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const schedule = () => {
      clearTimer()
      timerRef.current = window.setTimeout(async () => {
        if (!document.hidden && !wsHealthyRef.current) {
          await refreshUnreadNotifications()
        } else if (wsHealthyRef.current) {
          pollDelayRef.current = 45000
        }
        schedule()
      }, pollDelayRef.current)
    }

    refreshUnreadNotifications().finally(schedule)
    const onVisibilityChange = () => {
      if (!document.hidden) {
        pollDelayRef.current = 15000
        refreshUnreadNotifications().finally(schedule)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      clearTimer()
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [user, location.pathname, refreshUnreadNotifications])

  useEffect(() => {
    if (!user) return
    const token = localStorage.getItem('token')
    if (!token) return
    const ws = new WebSocket(createWsUrl('/api/v1/realtime/notifications/ws', token))
    wsRef.current = ws
    ws.onopen = () => {
      wsHealthyRef.current = true
      pollDelayRef.current = 45000
    }
    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(String(event.data || '{}')) as { type?: string; unread_count?: number }
        if (payload.type === 'notifications_unread' && typeof payload.unread_count === 'number') {
          const prev = unreadRef.current
          setUnreadNotifications(payload.unread_count)
          if (payload.unread_count > prev) {
            const prefs = mergeProfilePreferences(user.profile_preferences)
            if (prefs.notifications.push_in_app && !prefs.notifications.quiet_mode && 'Notification' in window) {
              if (Notification.permission === 'granted') {
                new Notification('Новое уведомление', { body: 'Откройте центр уведомлений.' })
              } else if (Notification.permission === 'default') {
                Notification.requestPermission().catch(() => {})
              }
            }
          }
        }
      } catch {
        // ignore malformed WS events
      }
    }
    ws.onerror = () => {
      wsHealthyRef.current = false
      pollDelayRef.current = 15000
    }
    ws.onclose = () => {
      wsHealthyRef.current = false
      pollDelayRef.current = 15000
    }
    return () => {
      wsHealthyRef.current = false
      wsRef.current?.close()
      wsRef.current = null
    }
  }, [user])

  const isActive = (path: string) => location.pathname === path

  const reducedMotion = user
    ? mergeProfilePreferences(user.profile_preferences).ui.reduced_motion
    : false
  const performanceMode = user
    ? !!mergeProfilePreferences(user.profile_preferences).ui.performance_mode
    : false

  return (
    <div className={`layout${reducedMotion ? ' layout--reduced-motion' : ''}${performanceMode ? ' layout--performance' : ''}`}>
      <motion.nav 
        className="navbar"
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, type: "spring" }}
      >
        <div className="nav-brand">
          <Link to="/" className="nav-logo-link">LEGEND OF B.O.T.</Link>
        </div>

        {user && (
          <Link
            to="/profile"
            className="nav-user"
            onClick={() => setMenuOpen(false)}
          >
            <motion.div
              className="user-avatar"
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
            >
              {user.avatar_url ? (
                <img src={resolveApiUrl(user.avatar_url) || ''} alt={`Аватар ${user.username}`} className="user-avatar-img" />
              ) : (
                user.username.charAt(0).toUpperCase()
              )}
            </motion.div>
            <span className="user-name">{user.username}</span>
          </Link>
        )}

        <button
          type="button"
          className={`menu-toggle ${menuOpen ? 'active' : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          aria-label={menuOpen ? 'Закрыть меню навигации' : 'Открыть меню навигации'}
        >
          <span></span>
          <span></span>
          <span></span>
        </button>

        <motion.div 
          id="primary-navigation"
          className={`nav-links ${menuOpen ? 'active' : ''}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Link 
            to="/levels" 
            className={isActive('/levels') ? 'active' : ''}
            onClick={() => setMenuOpen(false)}
          >
            ◉ МИССИИ
          </Link>
          <Link 
            to="/community" 
            className={isActive('/community') ? 'active' : ''}
            onClick={() => setMenuOpen(false)}
          >
            ◐ СООБЩЕСТВО
          </Link>
          <Link
            to="/settings"
            className={isActive('/settings') ? 'active' : ''}
            onClick={() => setMenuOpen(false)}
          >
            ⚙ НАСТРОЙКИ
          </Link>
          {user?.role === 'admin' && (
            <Link 
              to="/admin" 
              className={isActive('/admin') ? 'active' : ''}
              onClick={() => setMenuOpen(false)}
            >
              ⚙ АДМИНКА
            </Link>
          )}
          {user && (
            <button
              type="button"
              className="nav-bell"
              ref={bellButtonRef}
              onClick={() => {
                setNotificationsOpen(true)
                setMenuOpen(false)
              }}
              aria-label="Уведомления"
              title="Уведомления"
            >
              <span className="nav-bell-icon" aria-hidden="true">🔔</span>
              {unreadNotifications > 0 && (
                <span className="nav-bell-badge">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>
              )}
            </button>
          )}
          <button 
            onClick={() => {
              logout()
              setMenuOpen(false)
            }} 
            className="logout-btn"
          >
            ⏻ ВЫХОД
          </button>
        </motion.div>
      </motion.nav>

      {user && (
        <NotificationsModal
          open={notificationsOpen}
          onClose={() => setNotificationsOpen(false)}
          onChanged={refreshUnreadNotifications}
          reducedMotion={reducedMotion}
          restoreFocusRef={bellButtonRef}
        />
      )}

      <main className="main-content">
        <Outlet />
      </main>

      {/* Status bar */}
      <motion.div 
        className="status-bar-nav"
        initial={{ y: 100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6, type: "spring", delay: 0.3 }}
      >
        <div className="status-item-nav">
          <div className="status-indicator"></div>
          <span>СТАТУС: <span className="status-value">АКТИВЕН</span></span>
        </div>
        <div className="status-item-nav">
          <span>ПОЛЬЗОВАТЕЛЬ: <span className="status-value">{user?.username || 'ГОСТЬ'}</span></span>
        </div>
        <div className="status-item-nav">
          <span>ВРЕМЯ: <span className="status-value">
            <SystemClock />
          </span></span>
        </div>
        <div className="status-item-nav">
          <span>РОЛЬ: <span className="status-value">{user?.role?.toUpperCase() || 'N/A'}</span></span>
        </div>
      </motion.div>
    </div>
  )
}
