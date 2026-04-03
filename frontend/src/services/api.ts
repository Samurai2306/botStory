import axios from 'axios'
import { useAuthStore } from '../store/authStore'

// Если VITE_API_URL задан — ходим по полному URL.
// Если не задан — ходим относительно: /api/v1 (ожидаем, что Vite проксирует /api → backend).
const trimmedViteApiUrl = (import.meta.env.VITE_API_URL as string | undefined)?.trim() || ''
const hasExplicitApiUrl = trimmedViteApiUrl.length > 0

export const API_URL = hasExplicitApiUrl ? trimmedViteApiUrl.replace(/\/$/, '') : ''

export function resolveApiUrl(url: string | null | undefined): string | null {
  if (!url) return null
  if (url.startsWith('http://') || url.startsWith('https://')) return url
  // Если API_URL не задан — возвращаем относительный путь (например `/api/v1/...`).
  if (!API_URL) return url
  return `${API_URL}${url}`
}

export function createWsUrl(path: string, token?: string | null): string {
  const base = API_URL || window.location.origin
  const wsBase = base.replace(/^http/, 'ws').replace(/\/$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  const q = token ? `?token=${encodeURIComponent(token)}` : ''
  return `${wsBase}${normalizedPath}${q}`
}

export const api = axios.create({
  baseURL: hasExplicitApiUrl ? `${API_URL}/api/v1` : '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

const PUBLIC_PATHS = new Set<string>(['/', '/login', '/register'])

// On 401 (expired/invalid token) — logout; redirect only from non-public pages
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Network fallback: in docker/proxy setups the primary API URL может быть недоступен из браузера.
    // Тогда пробуем запросить тот же endpoint через относительный /api/v1 (Vite proxy).
    const cfg = error?.config as (import('axios').AxiosRequestConfig & { __apiRetryProxy?: boolean }) | undefined
    const isNetworkError = !error.response && (error.code === 'ERR_NETWORK' || error.message === 'Network Error')
    if (isNetworkError && cfg && !cfg.__apiRetryProxy) {
      cfg.__apiRetryProxy = true
      // Переопределяем baseURL только для повторного запроса
      cfg.baseURL = '/api/v1'
      return api.request(cfg)
    }

    if (error.response?.status === 401) {
      const isProgressSave = error.config?.method === 'post' && typeof error.config?.url === 'string' && error.config.url.includes('/progress')
      if (!isProgressSave) {
        useAuthStore.getState().logout()
        const currentPath = window.location.pathname
        const isLoginRequest = !!error.config?.url?.includes('/auth/login')
        if (!isLoginRequest && !PUBLIC_PATHS.has(currentPath)) {
          window.location.pathname = '/'
        }
      }
    }
    return Promise.reject(error)
  }
)

// Auth API
export const authAPI = {
  register: (data: { email: string; username: string; password: string }) =>
    api.post('/auth/register', data),
  
  login: (email: string, password: string) =>
    api.post('/auth/login', new URLSearchParams({ username: email, password }), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    }),
}

// User API
export const userAPI = {
  getProfile: () => api.get('/users/me'),
  getStats: () => api.get<{ completed: number; total: number; progress_percent: number }>('/users/me/stats'),
  getLevelProgress: () => api.get<{ level_id: number; completed: boolean; best_steps_count?: number | null }[]>('/users/me/progress'),
  updateProfile: (data: Record<string, unknown>) => api.patch('/users/me', data),
  getPublicProfile: (username: string) =>
    api.get(`/users/${encodeURIComponent(username)}/public`),
  getPublicProfileById: (id: number) =>
    api.get(`/users/by-id/${id}/public`),
  getAvatarCatalog: () => api.get('/users/avatars/catalog'),
  searchUsers: (q: string, limit = 20) => api.get('/users/search', { params: { q, limit } }),
}

export const gamificationAPI = {
  getMyAchievements: () => api.get('/me/achievements'),
  getMyHeldTitles: () => api.get('/me/held-titles'),
  getEquippedTitles: () => api.get('/me/equipped-titles'),
  setEquippedTitles: (body: { slot1_title_id?: number | null; slot2_title_id?: number | null }) =>
    api.put('/me/equipped-titles', body),
  getTitlesLeaderboard: () => api.get('/titles/leaderboard'),
}

// Level API
export const levelAPI = {
  getAll: () => api.get('/levels/'),
  getOfflinePackage: () => api.get('/levels/offline-package'),
  getById: (id: number) => api.get(`/levels/${id}`),
  getProgress: (id: number) => api.get(`/levels/${id}/progress`),
  getWords: (level_id: number) => api.get<{ words: string[] }>(`/levels/${level_id}/words`),
  setWords: (level_id: number, data: { words: string[] }) => api.put(`/levels/${level_id}/words`, data),
  submitSolution: (id: number, data: { user_code: string; steps_count: number }) =>
    api.post(`/levels/${Number(id)}/progress`, {
      level_id: Number(id),
      user_code: data.user_code,
      steps_count: Number(data.steps_count)
    }),
  
  // Admin
  create: (data: any) => api.post('/levels/', data),
  update: (id: number, data: any) => api.patch(`/levels/${id}`, data),
  delete: (id: number) => api.delete(`/levels/${id}`),
  getAllAdmin: (params?: { include_inactive?: boolean }) => api.get('/levels/', { params }),
}

// Execute API
export const executeAPI = {
  executeCode: (level_id: number, code: string) =>
    api.post('/execute', { level_id, code }),
  test: () => api.get('/execute/test'),
}

// Notes API
export const notesAPI = {
  getAll: (level_id?: number) => api.get('/notes', { params: { level_id } }),
  create: (data: any) => api.post('/notes', data),
  update: (id: number, data: any) => api.patch(`/notes/${id}`, data),
  delete: (id: number) => api.delete(`/notes/${id}`),
}

// Highlights API
export const highlightsAPI = {
  getForLevel: (level_id: number) => api.get(`/highlights/level/${level_id}`),
  create: (data: any) => api.post('/highlights', data),
  delete: (id: number) => api.delete(`/highlights/${id}`),
}

// Messages API
export const messagesAPI = {
  getForLevel: (level_id: number) => api.get(`/messages/level/${level_id}`),
  create: (data: { level_id: number; content: string }) => api.post('/messages', data),
  delete: (id: number) => api.delete(`/messages/${id}`),
}

// News API
export const newsAPI = {
  getAll: () => api.get('/news/'),
  getById: (id: number) => api.get(`/news/${id}`),
  
  // Admin
  create: (data: any) => api.post('/news/', data),
  update: (id: number, data: any) => api.patch(`/news/${id}`, data),
  delete: (id: number) => api.delete(`/news/${id}`),
}

// Community API (forum posts, comments, likes, commits)
export const communityAPI = {
  getPosts: (params?: { category?: string; sort?: string; skip?: number; limit?: number; author_id?: number; q?: string }) =>
    api.get('/community/posts', { params }),
  getPost: (id: number) => api.get(`/community/posts/${id}`),
  createPost: (data: { title: string; content: string; category?: string }) =>
    api.post('/community/posts', data),
  updatePost: (id: number, data: { title?: string; content?: string; category?: string; pinned?: boolean }) =>
    api.patch(`/community/posts/${id}`, data),
  deletePost: (id: number) => api.delete(`/community/posts/${id}`),
  likePost: (id: number) => api.post(`/community/posts/${id}/like`),
  bookmarkPost: (id: number) => api.post(`/community/posts/${id}/bookmark`),
  getBookmarks: () => api.get('/community/bookmarks'),
  getComments: (postId: number, params?: { skip?: number; limit?: number }) =>
    api.get(`/community/posts/${postId}/comments`, { params }),
  createComment: (postId: number, data: { content: string; parent_id?: number }) =>
    api.post(`/community/posts/${postId}/comments`, data),
  deleteComment: (commentId: number) => api.delete(`/community/comments/${commentId}`),
  // Опросы
  getPolls: (params?: { skip?: number; limit?: number }) => api.get('/community/polls', { params }),
  getPoll: (id: number) => api.get(`/community/polls/${id}`),
  createPoll: (data: { title: string; description?: string; options: { text: string }[] }) =>
    api.post('/community/polls', data),
  votePoll: (pollId: number, optionId: number) =>
    api.post(`/community/polls/${pollId}/vote`, { option_id: optionId }),
  setPollClosed: (pollId: number, closed: boolean) =>
    api.patch(`/community/polls/${pollId}/close`, { closed }),
  deletePoll: (id: number) => api.delete(`/community/polls/${id}`),
  getMentions: (params?: { skip?: number; limit?: number }) => api.get('/community/mentions', { params }),
  markMentionRead: (mentionId: number) => api.post(`/community/mentions/${mentionId}/read`),
  getNotifications: (params?: { skip?: number; limit?: number }) => api.get('/community/notifications', { params }),
  getUnreadNotificationsCount: () => api.get<{ unread_count: number }>('/community/notifications/unread-count'),
  markNotificationRead: (notificationId: number) => api.post(`/community/notifications/${notificationId}/read`),
  deleteNotification: (notificationId: number) => api.delete(`/community/notifications/${notificationId}`),
  setNotificationPinned: (notificationId: number, pinned: boolean) =>
    api.post(`/community/notifications/${notificationId}/pin`, { pinned }),
  markAllNotificationsRead: () => api.post('/community/notifications/mark-read-bulk'),
  broadcastNotifications: (data: {
    title: string
    body?: string
    theme?: 'system' | 'important_update' | 'maintenance' | 'community' | 'general'
  }) => api.post('/community/notifications/broadcast', data),
  getSubscriptions: () => api.get('/community/subscriptions'),
  toggleSubscription: (category: string) => api.post(`/community/subscriptions/${category}`),
  getReputationLeaderboard: (limit = 20) => api.get('/community/reputation/leaderboard', { params: { limit } }),
  getCommunityUsers: (params?: { q?: string; limit?: number }) => api.get('/community/users', { params }),
  getFriends: () => api.get('/community/friends'),
  toggleFriend: (userId: number) => api.post(`/community/friends/${userId}`),
}

export const updatesAPI = {
  getAll: (params?: { skip?: number; limit?: number; topic?: string }) =>
    api.get('/updates/', { params }),
  getLatest: () => api.get('/updates/latest'),
  getTopics: () => api.get('/updates/topics/list'),
  getById: (id: number) => api.get(`/updates/${id}`),
  create: (data: Record<string, unknown>) => api.post('/updates/', data),
  update: (id: number, data: Record<string, unknown>) => api.patch(`/updates/${id}`, data),
  publish: (id: number) => api.post(`/updates/${id}/publish`),
  delete: (id: number) => api.delete(`/updates/${id}`),
}
