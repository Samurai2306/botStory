import { useEffect, useState, useRef } from 'react'
import { messagesAPI } from '../services/api'
import { createWsUrl } from '../services/api'
import { useAuthStore } from '../store/authStore'
import { mergeProfilePreferences } from '../types/profile'
import './LevelChat.css'

interface Props {
  levelId: number
}

interface Message {
  id: number
  content: string
  username: string
  has_completed: boolean
  is_spoiler: boolean
  created_at: string
}

const MAX_RENDERED_MESSAGES = 200

export default function LevelChat({ levelId }: Props) {
  const { user } = useAuthStore()
  const [messages, setMessages] = useState<Message[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [error, setError] = useState('')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadMessages()
  }, [levelId])

  useEffect(() => {
    const token = localStorage.getItem('token')
    let timer: number | null = null
    let ws: WebSocket | null = null
    let wsHealthy = false

    const setSafeMessages = (rows: Message[]) => {
      const normalized = Array.isArray(rows) ? rows : []
      setMessages(normalized.slice(-MAX_RENDERED_MESSAGES))
    }

    const stopPolling = () => {
      if (timer != null) {
        window.clearTimeout(timer)
        timer = null
      }
    }

    const tick = async () => {
      const isHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden'
      const nextMs = isHidden ? 15000 : 5000
      if (!wsHealthy) {
        await loadMessages(setSafeMessages)
      }
      timer = window.setTimeout(tick, nextMs)
    }

    const startPolling = () => {
      if (timer == null) {
        timer = window.setTimeout(tick, 5000)
      }
    }

    if (token) {
      ws = new WebSocket(createWsUrl(`/api/v1/realtime/levels/${levelId}/chat/ws`, token))
      ws.onopen = () => {
        wsHealthy = true
        stopPolling()
      }
      ws.onclose = () => {
        wsHealthy = false
        startPolling()
      }
      ws.onerror = () => {
        wsHealthy = false
        startPolling()
      }
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(String(event.data || '{}')) as { type?: string; messages?: Message[] }
          if (payload.type === 'chat_snapshot' && Array.isArray(payload.messages)) {
            setSafeMessages(payload.messages)
          }
        } catch {
          // ignore malformed payload
        }
      }
      startPolling()
    } else {
      startPolling()
    }

    return () => {
      stopPolling()
      if (ws) ws.close()
    }
  }, [levelId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadMessages = async (onData?: (rows: Message[]) => void) => {
    try {
      const res = await messagesAPI.getForLevel(levelId)
      const rows = Array.isArray(res.data) ? res.data : []
      if (onData) onData(rows)
      else setMessages(rows.slice(-MAX_RENDERED_MESSAGES))
    } catch {
      // Keep silent fallback behavior to avoid noisy UI errors during polling fallback.
    }
  }

  const handleSendMessage = async () => {
    if (!newMessage.trim()) return
    
    setError('')
    
    try {
      const prefs = user ? mergeProfilePreferences(user.profile_preferences) : null
      let content = newMessage.trim()
      if (
        prefs?.learning.chat_default_spoiler &&
        !content.toLowerCase().includes('[spoiler]')
      ) {
        content = `[spoiler]${content}[/spoiler]`
      }
      await messagesAPI.create({
        level_id: levelId,
        content,
      })
      
      setNewMessage('')
      loadMessages()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Ошибка отправки сообщения')
    }
  }

  const handleDeleteMessage = async (messageId: number) => {
    if (!window.confirm('Удалить сообщение из чата?')) return
    try {
      await messagesAPI.delete(messageId)
      setMessages((prev) => prev.filter((m) => m.id !== messageId))
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Не удалось удалить сообщение')
    }
  }

  const renderMessage = (msg: Message) => {
    const content = msg.content
    
    // Check if message has spoiler tag
    if (content.toLowerCase().includes('[spoiler]')) {
      const parts = content.split(/\[spoiler\](.*?)\[\/spoiler\]/gi)
      return (
        <div>
          {parts.map((part, i) => 
            i % 2 === 0 ? (
              <span key={i}>{part}</span>
            ) : (
              <details key={i} className="spoiler">
                <summary>Показать спойлер</summary>
                <pre>{part}</pre>
              </details>
            )
          )}
        </div>
      )
    }
    
    return <div>{content}</div>
  }

  return (
    <div className="level-chat">
      <div className="chat-header">
        <h3>Чат уровня</h3>
        <div className="chat-hint">
          💡 Код должен быть в теге [spoiler]...[/spoiler]
        </div>
      </div>
      
      <div className="messages-list">
        {messages.map(msg => (
          <div key={msg.id} className={`message ${msg.username === user?.username ? 'own' : ''}`}>
            <div className="message-header">
              <span className="message-author">
                {msg.username}
                {msg.has_completed && <span className="veteran-badge">🎖️ Ветеран</span>}
              </span>
              <span className="message-time">
                {new Date(msg.created_at).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
              </span>
              {user?.role === 'admin' && (
                <button type="button" className="chat-moderate-delete" onClick={() => handleDeleteMessage(msg.id)}>
                  Удалить
                </button>
              )}
            </div>
            <div className="message-content">
              {renderMessage(msg)}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      
      {error && <div className="chat-error">{error}</div>}
      
      <div className="chat-input">
        <textarea
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSendMessage()
            }
          }}
          placeholder="Написать сообщение... (Enter для отправки)"
          rows={3}
        />
        <button onClick={handleSendMessage} className="send-btn">
          Отправить
        </button>
      </div>
    </div>
  )
}
