import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { levelAPI, executeAPI } from '../services/api'
import IsometricCanvas from '../components/IsometricCanvas'
import CodeEditor from '../components/CodeEditor'
import Diary from '../components/Diary'
import LevelChat from '../components/LevelChat'
import Debriefing from '../components/Debriefing'
import './GamePlay.css'

const BODY_FULLSCREEN_CLASS = 'gameplay-fullscreen'

interface Level {
  id: number
  title: string
  map_data: any
  golden_steps_count?: number
}

export default function GamePlay() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [level, setLevel] = useState<Level | null>(null)
  const [code, setCode] = useState('')
  const [robotHistory, setRobotHistory] = useState<any[]>([])
  const [isExecuting, setIsExecuting] = useState(false)
  const [executionResult, setExecutionResult] = useState<any>(null)
  const [showDebriefing, setShowDebriefing] = useState(false)
  const [sidebarTab, setSidebarTab] = useState<'diary' | 'chat'>('diary')
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

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

  const handleExecute = async () => {
    if (!level || !code.trim()) return
    
    setIsExecuting(true)
    setExecutionResult(null)
    
    try {
      const response = await executeAPI.executeCode(level.id, code)
      const result = response.data
      
      setExecutionResult(result)
      setRobotHistory(result.history ?? [])
      
      if (result.success && result.reached_finish) {
        // Save progress (don't block debriefing on failure)
        levelAPI.submitSolution(level.id, {
          user_code: code,
          steps_count: result.steps_count ?? 0
        }).catch(() => {})
        
        // Show debriefing after animation
        setTimeout(() => setShowDebriefing(true), 2000)
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
        goldenSteps={level.golden_steps_count}
        onClose={() => navigate('/levels')}
        onRetry={() => setShowDebriefing(false)}
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
            className="fullscreen-btn"
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Выйти из полноэкранного режима' : 'Карта и код во весь экран'}
          >
            {isFullscreen ? '✕ Выйти' : '⛶ Во весь экран'}
          </button>
          <button
            type="button"
            className="sidebar-toggle-btn"
            onClick={() => setSidebarCollapsed(c => !c)}
            title={sidebarCollapsed ? 'Показать дневник и чат' : 'Свернуть панель'}
          >
            {sidebarCollapsed ? '◐ Панель' : '◑ Свернуть'}
          </button>
          <button onClick={() => navigate('/levels')} className="back-btn">
            ← К уровням
          </button>
        </div>
      </div>
      
      <div className={`gameplay-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <div className="game-area">
          <div className="game-area-section">
            <span className="game-area-label">Карта</span>
            <IsometricCanvas
              mapData={level.map_data}
              robotHistory={robotHistory}
            />
          </div>
          <div className="game-area-section">
            <span className="game-area-label">Код</span>
            <CodeEditor
              value={code}
              onChange={setCode}
              onExecute={handleExecute}
              onReset={handleReset}
              isExecuting={isExecuting}
            />
          </div>
        </div>
        
        {!sidebarCollapsed && (
          <div className="sidebar">
            <div className="sidebar-tabs">
              <button 
                className={sidebarTab === 'diary' ? 'active' : ''}
                onClick={() => setSidebarTab('diary')}
              >
                📖 Дневник
              </button>
              <button 
                className={sidebarTab === 'chat' ? 'active' : ''}
                onClick={() => setSidebarTab('chat')}
              >
                💬 Чат
              </button>
            </div>
            <div className="sidebar-content">
              {sidebarTab === 'diary' && <Diary levelId={level.id} />}
              {sidebarTab === 'chat' && <LevelChat levelId={level.id} />}
            </div>
          </div>
        )}
      </div>
      
      {executionResult && !executionResult.success && (
        <div className="error-panel">
          <h3>Ошибка!</h3>
          <p>{executionResult.error}</p>
        </div>
      )}
    </div>
  )
}
