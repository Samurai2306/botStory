import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
import LevelHub from './pages/LevelHub'
import GamePlay from './pages/GamePlay'
import Briefing from './pages/Briefing'
import Profile from './pages/Profile'
import PublicUserProfile from './pages/PublicUserProfile'
import Settings from './pages/Settings'
import AdminPanel from './pages/AdminPanel'
import Community from './pages/Community'
import Games from './pages/Games'
import Layout from './components/Layout'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, sessionChecked } = useAuthStore()
  const location = useLocation()
  if (!sessionChecked) {
    return (
      <div className="app-session-loading">
        <div className="app-session-spinner" />
        <p>Проверка сессии...</p>
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  return <>{children}</>
}

function App() {
  const { isAuthenticated, user, sessionChecked } = useAuthStore()

  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        <Route element={<Layout />}>
          <Route
            path="/levels"
            element={
              <ProtectedRoute>
                <LevelHub />
              </ProtectedRoute>
            }
          />
          <Route
            path="/level/:id/briefing"
            element={
              <ProtectedRoute>
                <Briefing />
              </ProtectedRoute>
            }
          />
          <Route
            path="/level/:id/play"
            element={
              <ProtectedRoute>
                <GamePlay />
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route path="/community" element={<Community />} />
          <Route path="/user/:username" element={<PublicUserProfile />} />
          <Route path="/games" element={<Games />} />
          <Route
            path="/admin"
            element={
              !sessionChecked ? (
                <div className="app-session-loading">
                  <div className="app-session-spinner" />
                  <p>Проверка сессии...</p>
                </div>
              ) : isAuthenticated && user?.role === 'admin' ? (
                <AdminPanel />
              ) : (
                <Navigate to="/levels" replace />
              )
            }
          />
        </Route>
      </Routes>
    </Router>
  )
}

export default App
