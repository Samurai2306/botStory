import { useEffect, useState, useRef } from 'react'
import { messagesAPI } from '../services/api'
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadMessages = () => {
    messagesAPI.getForLevel(levelId)
      .then(res => setMessages(res.data))
      .catch(console.error)
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
