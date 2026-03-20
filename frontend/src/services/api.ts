import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'

export const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
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
  updateProfile: (data: any) => api.patch('/users/me', data),
}

// Level API
export const levelAPI = {
  getAll: () => api.get('/levels'),
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
  create: (data: any) => api.post('/levels', data),
  update: (id: number, data: any) => api.patch(`/levels/${id}`, data),
  delete: (id: number) => api.delete(`/levels/${id}`),
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
  getAll: () => api.get('/news'),
  getById: (id: number) => api.get(`/news/${id}`),
  
  // Admin
  create: (data: any) => api.post('/news', data),
  update: (id: number, data: any) => api.patch(`/news/${id}`, data),
  delete: (id: number) => api.delete(`/news/${id}`),
}

// Community API (forum posts, comments, likes, commits)
export const communityAPI = {
  getPosts: (params?: { category?: string; sort?: string; skip?: number; limit?: number }) =>
    api.get('/community/posts', { params }),
  getPost: (id: number) => api.get(`/community/posts/${id}`),
  createPost: (data: { title: string; content: string; category?: string }) =>
    api.post('/community/posts', data),
  updatePost: (id: number, data: { title?: string; content?: string; category?: string; pinned?: boolean }) =>
    api.patch(`/community/posts/${id}`, data),
  deletePost: (id: number) => api.delete(`/community/posts/${id}`),
  likePost: (id: number) => api.post(`/community/posts/${id}/like`),
  getComments: (postId: number) => api.get(`/community/posts/${postId}/comments`),
  createComment: (postId: number, data: { content: string; parent_id?: number }) =>
    api.post(`/community/posts/${postId}/comments`, data),
  deleteComment: (commentId: number) => api.delete(`/community/comments/${commentId}`),
  getCommits: (limit?: number) => api.get('/community/commits', { params: { limit } }),
  // Опросы
  getPolls: (params?: { skip?: number; limit?: number }) => api.get('/community/polls', { params }),
  getPoll: (id: number) => api.get(`/community/polls/${id}`),
  createPoll: (data: { title: string; description?: string; options: { text: string }[] }) =>
    api.post('/community/polls', data),
  votePoll: (pollId: number, optionId: number) =>
    api.post(`/community/polls/${pollId}/vote`, { option_id: optionId }),
  deletePoll: (id: number) => api.delete(`/community/polls/${id}`),
}
