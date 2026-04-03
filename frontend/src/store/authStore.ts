import { create } from 'zustand'
import { authAPI, userAPI } from '../services/api'
import type { ProfilePreferences } from '../types/profile'

/** Сообщения API → UI (покрыто unit-тестами). */
export function authErrorToRu(detail: string | string[]): string {
  const raw = Array.isArray(detail) ? detail[0] : detail
  if (!raw || typeof raw !== 'string') return 'Ошибка'
  const map: Record<string, string> = {
    'Incorrect email or password': 'Неверный email или пароль',
    'User account is inactive': 'Учётная запись деактивирована',
    'Email already registered': 'Этот email уже зарегистрирован',
    'Username already taken': 'Имя пользователя уже занято',
  }
  return map[raw] ?? raw
}

interface User {
  id: number
  email: string
  username: string
  role: 'guest' | 'user' | 'admin'
  is_active: boolean
  created_at: string
  hint_word?: string | null
  locale?: 'ru' | 'en' | string | null
  terminal_theme?: 'windows' | 'macos' | 'linux' | string | null
  bio?: string | null
  tagline?: string | null
  avatar_key?: string | null
  avatar_url?: string | null
  reputation_score?: number
  profile_preferences?: ProfilePreferences | null
}

interface AuthState {
  user: User | null
  token: string | null
  isAuthenticated: boolean
  isLoading: boolean
  sessionChecked: boolean
  error: string | null
  
  login: (email: string, password: string) => Promise<void>
  register: (email: string, username: string, password: string) => Promise<void>
  logout: () => void
  fetchUser: () => Promise<void>
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,
  sessionChecked: !localStorage.getItem('token'),
  error: null,
  
  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      const response = await authAPI.login(email, password)
      const { access_token } = response.data
      
      localStorage.setItem('token', access_token)
      set({ token: access_token, isAuthenticated: true })
      
      // Fetch user profile
      const userResponse = await userAPI.getProfile()
      set({ user: userResponse.data, isLoading: false })
    } catch (error: any) {
      let raw: string | string[]
      if (!error.response) {
        raw =
          'Сервер недоступен. Проверьте, что backend запущен и адрес API верный (VITE_API_URL / порт 8000).'
      } else {
        const d = error.response?.data?.detail
        if (Array.isArray(d) && d.length > 0 && typeof d[0]?.msg === 'string') {
          raw = d[0].msg
        } else {
          raw = d ?? 'Ошибка входа'
        }
      }
      const errorMessage = authErrorToRu(raw)
      set({ error: errorMessage, isLoading: false })
      throw error
    }
  },
  
  register: async (email: string, username: string, password: string) => {
    set({ isLoading: true, error: null })
    try {
      await authAPI.register({ email, username, password })
      
      // Auto-login after registration
      await useAuthStore.getState().login(email, password)
    } catch (error: any) {
      const raw = error.response?.data?.detail ?? 'Ошибка регистрации'
      set({ error: authErrorToRu(raw), isLoading: false })
      throw error
    }
  },
  
  logout: () => {
    localStorage.removeItem('token')
    set({ user: null, token: null, isAuthenticated: false, sessionChecked: true })
  },
  
  fetchUser: async () => {
    if (!localStorage.getItem('token')) {
      set({ sessionChecked: true })
      return
    }
    set({ isLoading: true })
    try {
      const response = await userAPI.getProfile()
      set({ user: response.data, isLoading: false, sessionChecked: true })
    } catch (error) {
      useAuthStore.getState().logout()
      set({ isLoading: false, sessionChecked: true })
    }
  },
  
  clearError: () => set({ error: null }),
}))

// Initialize user on app load
if (localStorage.getItem('token')) {
  useAuthStore.getState().fetchUser()
}
