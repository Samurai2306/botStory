import { useState, useEffect } from 'react'
import { Outlet, Link, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { motion } from 'framer-motion'
import './Layout.css'

export default function Layout() {
  const { user, logout } = useAuthStore()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [systemTime, setSystemTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => {
      setSystemTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  const isActive = (path: string) => location.pathname === path

  return (
    <div className="layout">
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
              {user.username.charAt(0).toUpperCase()}
            </motion.div>
            <span className="user-name">{user.username}</span>
          </Link>
        )}

        <div className={`menu-toggle ${menuOpen ? 'active' : ''}`} onClick={() => setMenuOpen(!menuOpen)}>
          <span></span>
          <span></span>
          <span></span>
        </div>

        <motion.div 
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
            {systemTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </span></span>
        </div>
        <div className="status-item-nav">
          <span>РОЛЬ: <span className="status-value">{user?.role?.toUpperCase() || 'N/A'}</span></span>
        </div>
      </motion.div>
    </div>
  )
}
