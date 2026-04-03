import { Suspense, lazy } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/authStore'
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'
const LevelHub = lazy(() => import('./pages/LevelHub'))
const GamePlay = lazy(() => import('./pages/GamePlay'))
const Briefing = lazy(() => import('./pages/Briefing'))
const Profile = lazy(() => import('./pages/Profile'))
const PublicUserProfile = lazy(() => import('./pages/PublicUserProfile'))
const Settings = lazy(() => import('./pages/Settings'))
const AdminPanel = lazy(() => import('./pages/AdminPanel'))
const Community = lazy(() => import('./pages/Community'))
const Games = lazy(() => import('./pages/Games'))
const Layout = lazy(() => import('./components/Layout'))

function RouteFallback() {
  return (
    <div className="app-session-loading">
      <div className="app-session-spinner" />
      <p>Загрузка интерфейса...</p>
    </div>
  )
}

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

        <Route element={<Suspense fallback={<RouteFallback />}><Layout /></Suspense>}>
          <Route
            path="/levels"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteFallback />}><LevelHub /></Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/level/:id/briefing"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteFallback />}><Briefing /></Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/level/:id/play"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteFallback />}><GamePlay /></Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteFallback />}><Profile /></Suspense>
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Suspense fallback={<RouteFallback />}><Settings /></Suspense>
              </ProtectedRoute>
            }
          />
          <Route path="/community" element={<Suspense fallback={<RouteFallback />}><Community /></Suspense>} />
          <Route path="/user/:username" element={<Suspense fallback={<RouteFallback />}><PublicUserProfile /></Suspense>} />
          <Route path="/user-id/:id" element={<Suspense fallback={<RouteFallback />}><PublicUserProfile /></Suspense>} />
          <Route path="/games" element={<Suspense fallback={<RouteFallback />}><Games /></Suspense>} />
          <Route
            path="/admin"
            element={
              !sessionChecked ? (
                <div className="app-session-loading">
                  <div className="app-session-spinner" />
                  <p>Проверка сессии...</p>
                </div>
              ) : isAuthenticated && user?.role === 'admin' ? (
                <Suspense fallback={<RouteFallback />}><AdminPanel /></Suspense>
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
