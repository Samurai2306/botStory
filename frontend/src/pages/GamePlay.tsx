import { lazy, Suspense, useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { levelAPI, executeAPI } from '../services/api'
import IsometricCanvas from '../components/IsometricCanvas'
import CodeEditor from '../components/CodeEditor'
import CodePanelTerminal from '../components/CodePanelTerminal'
import Debriefing from '../components/Debriefing'
import { useAuthStore } from '../store/authStore'
import { mergeProfilePreferences } from '../types/profile'
import './GamePlay.css'

const BODY_FULLSCREEN_CLASS = 'gameplay-fullscreen'
const DRAFT_SAVE_DEBOUNCE_MS = 400
const LevelChat = lazy(() => import('../components/LevelChat'))

interface Level {
  id: number
  title: string
  map_data: any
  narrative?: string
  golden_steps_count?: number
}

type QueuedProgressPayload = { levelId: number; user_code: string; steps_count: number }
const PROGRESS_QUEUE_KEY = 'offline:progressQueue'

function readProgressQueue(): QueuedProgressPayload[] {
  try {
    const raw = localStorage.getItem(PROGRESS_QUEUE_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeProgressQueue(items: QueuedProgressPayload[]) {
  localStorage.setItem(PROGRESS_QUEUE_KEY, JSON.stringify(items))
}

export default function GamePlay() {
  const { user } = useAuthStore()
  const compareToGolden =
    mergeProfilePreferences(user?.profile_preferences).learning.show_golden_after_complete !== false
  const { id } = useParams()
  const navigate = useNavigate()
  const [level, setLevel] = useState<Level | null>(null)
  const [code, setCode] = useState('')
  const [robotHistory, setRobotHistory] = useState<any[]>([])
  const [mineHistory, setMineHistory] = useState<any[]>([])
  const [gatesHistory, setGatesHistory] = useState<any[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<any>(null)
  const [showDebriefing, setShowDebriefing] = useState(false)
  const [progressSaveError, setProgressSaveError] = useState<string | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [codePanelView, setCodePanelView] = useState<'terminal' | 'ide'>('terminal')
  const [showChat, setShowChat] = useState(false)
  const [runHint, setRunHint] = useState<string | null>(null)
  const draftSaveTimerRef = useRef<number | null>(null)

  useEffect(() => {
    const flush = async () => {
      const queue = readProgressQueue()
      if (!queue.length) return
      const rest: QueuedProgressPayload[] = []
      for (const item of queue) {
        try {
          await levelAPI.submitSolution(item.levelId, { user_code: item.user_code, steps_count: item.steps_count })
        } catch {
          rest.push(item)
        }
      }
      writeProgressQueue(rest)
    }
    void flush()
    window.addEventListener('online', flush)
    return () => window.removeEventListener('online', flush)
  }, [])

  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      const next = !prev
      if (next) document.body.classList.add(BODY_FULLSCREEN_CLASS)
      else document.body.classList.remove(BODY_FULLSCREEN_CLASS)
      return next
    })
  }, [])

  useEffect(() => {
    return () => document.body.classList.remove(BODY_FULLSCREEN_CLASS)
  }, [])

  useEffect(() => {
    if (id) {
      levelAPI.getById(parseInt(id))
        .then(res => setLevel(res.data))
        .catch(console.error)
    }
  }, [id])

  useEffect(() => {
    if (!level?.id) return
    const key = `level:draft:${level.id}`
    const saved = localStorage.getItem(key)
    if (saved && !code.trim()) setCode(saved)
  }, [level?.id])

  useEffect(() => {
    if (!level?.id) return
    const key = `level:draft:${level.id}`
    if (draftSaveTimerRef.current != null) {
      window.clearTimeout(draftSaveTimerRef.current)
    }
    draftSaveTimerRef.current = window.setTimeout(() => {
      localStorage.setItem(key, code)
      draftSaveTimerRef.current = null
    }, DRAFT_SAVE_DEBOUNCE_MS)

    return () => {
      if (draftSaveTimerRef.current != null) {
        window.clearTimeout(draftSaveTimerRef.current)
        draftSaveTimerRef.current = null
      }
      // Flush latest draft on effect cleanup/unmount.
      localStorage.setItem(key, code)
    }
  }, [level?.id, code])

  const handleExecute = async () => {
    if (!level) return
    if (!code.trim()) {
      setRunHint('Добавьте команды в редактор перед запуском. Например: "вперед"')
      return
    }
    setRunHint(null)
    
    setIsExecuting(true)
    setExecutionResult(null)
    
    try {
      const response = await executeAPI.executeCode(level.id, code)
      const result = response.data
      
      setExecutionResult(result)
      setRobotHistory(result.history ?? [])
      setMineHistory(result.mine_history ?? [])
      setGatesHistory(result.gates_history ?? [])
      
      if (result.success && result.reached_finish) {
        setProgressSaveError(null)
        const stepsCount = typeof result.steps_count === 'number' ? result.steps_count : 0
        const levelId = Number(level.id)
        const payload = { user_code: code.trim(), steps_count: stepsCount }
        let lastErr: any = null
        const maxAttempts = 3
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          try {
            await levelAPI.submitSolution(levelId, payload)
            lastErr = null
            break
          } catch (saveErr: any) {
            lastErr = saveErr
            const isNetworkError = !saveErr?.response && (saveErr?.message === 'Network Error' || saveErr?.code === 'ERR_NETWORK')
            if (isNetworkError && attempt < maxAttempts) {
              await new Promise(r => setTimeout(r, 800 * attempt))
              continue
            }
            break
          }
        }
        if (lastErr) {
          const msg = lastErr?.response?.data?.detail ?? lastErr?.message ?? 'Ошибка сети'
          const text = Array.isArray(msg) ? msg[0]?.msg ?? String(msg) : String(msg)
          const isNetworkError = !lastErr?.response && (lastErr?.message === 'Network Error' || lastErr?.code === 'ERR_NETWORK')
          const hint = isNetworkError
            ? ' Нет сети: решение сохранено локально и отправится автоматически при восстановлении соединения.'
            : ''
          if (isNetworkError) {
            const queue = readProgressQueue()
            queue.push({ levelId, ...payload })
            writeProgressQueue(queue)
          }
          setProgressSaveError(text + hint)
          console.error('Не удалось сохранить прогресс:', lastErr?.response?.data ?? lastErr)
        }
        // Дождаться, пока анимация по истории доиграет, прежде чем показывать дебрифинг
        const steps = Array.isArray(result.history) ? Math.max(0, result.history.length - 1) : 0
        const animMs = Math.max(1800, Math.round(steps * 90)) // ~0.2 шага/кадр при 60fps => ~83ms/шаг; берём запас
        setTimeout(() => setShowDebriefing(true), animMs)
      }
    } catch (error: any) {
      setExecutionResult({
        success: false,
        error: error.response?.data?.detail || 'Ошибка выполнения кода',
        steps_count: 0,
        history: [],
        reached_finish: false
      })
    } finally {
      setIsExecuting(false)
    }
  }

  const handleReset = () => {
    setRobotHistory([])
    setMineHistory([])
    setGatesHistory([])
    setExecutionResult(null)
    setShowDebriefing(false)
  }

  if (!level) {
    return (
      <div className="gameplay gameplay-loading">
        <div className="loading-state">
          <span className="loading-spinner" />
          <p>Загрузка миссии...</p>
        </div>
      </div>
    )
  }

  if (showDebriefing) {
    return (
      <Debriefing
        levelId={level.id}
        result={executionResult}
        goldenSteps={compareToGolden ? level.golden_steps_count : undefined}
        compareToGolden={compareToGolden}
        progressSaveError={progressSaveError}
        onClose={() => navigate('/levels')}
        onRetry={() => { setShowDebriefing(false); setProgressSaveError(null) }}
      />
    )
  }

  return (
    <div className={`gameplay ${isFullscreen ? 'gameplay--fullscreen' : ''}`}>
      <div className="gameplay-header">
        <h2>{level.title}</h2>
        <div className="gameplay-header-actions">
          <button
            type="button"
            className="chat-btn"
            onClick={() => setShowChat(true)}
            title="Открыть чат уровня"
          >
            💬 Чат
          </button>
          <button
            type="button"
            className="fullscreen-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Выйти из полноэкранного режима' : 'Карта и код во весь экран'}
          >
            {isFullscreen ? '✕ Выйти' : '⛶ Во весь экран'}
          </button>
          <button onClick={() => navigate('/levels')} className="back-btn">
            ← К уровням
          </button>
        </div>
      </div>
      
      <div className="gameplay-layout">
        <div className="game-area game-area--two-col">
          <div className="game-area-section">
            <span className="game-area-label">Карта</span>
            <IsometricCanvas
              mapData={level.map_data}
              robotHistory={robotHistory}
              mineHistory={mineHistory}
              gatesHistory={gatesHistory}
            />
          </div>
          <div className="game-area-section">
            <span className="game-area-label">Код</span>
            {codePanelView === 'terminal' ? (
              <CodePanelTerminal
                onSwitchToIde={() => setCodePanelView('ide')}
                onRun={handleExecute}
                isExecuting={isExecuting}
                narrative={level.narrative}
                levelTitle={level.title}
              />
            ) : (
              <CodeEditor
                value={code}
                onChange={setCode}
                onExecute={handleExecute}
                onReset={handleReset}
                isExecuting={isExecuting}
                onSwitchToTerminal={() => setCodePanelView('terminal')}
              />
            )}
          </div>
        </div>
      </div>

      {showChat && (
        <div className="chat-modal" role="dialog" aria-modal="true">
          <div className="chat-modal-backdrop" onClick={() => setShowChat(false)} />
          <div className="chat-modal-card">
            <div className="chat-modal-header">
              <span className="chat-modal-title">Чат уровня</span>
              <button type="button" className="chat-modal-close" onClick={() => setShowChat(false)} aria-label="Закрыть чат">
                ✕
              </button>
            </div>
            <div className="chat-modal-body">
              <Suspense fallback={<div className="community-loading"><div className="spinner" /> Загрузка чата...</div>}>
                <LevelChat levelId={level.id} />
              </Suspense>
            </div>
          </div>
        </div>
      )}
      
      {executionResult && !executionResult.success && (
        <div className="error-panel">
          <h3>Ошибка!</h3>
          <p>{executionResult.error}</p>
        </div>
      )}
      {runHint && (
        <div className="error-panel">
          <h3>Пустой запуск</h3>
          <p>{runHint}</p>
        </div>
      )}
    </div>
  )
}
