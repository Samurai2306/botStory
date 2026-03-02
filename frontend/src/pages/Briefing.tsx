import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { levelAPI, highlightsAPI } from '../services/api'
import './Briefing.css'

interface Level {
  id: number
  title: string
  narrative: string
}

export default function Briefing() {
  const { id } = useParams()
  const navigate = useNavigate()
  const narrativeRef = useRef<HTMLDivElement>(null)
  const [level, setLevel] = useState<Level | null>(null)
  const [, setHighlights] = useState<any[]>([])
  const [selectedColor, setSelectedColor] = useState('yellow')

  useEffect(() => {
    if (id) {
      levelAPI.getById(parseInt(id))
        .then(res => setLevel(res.data))
        .catch(console.error)
      
      highlightsAPI.getForLevel(parseInt(id))
        .then(res => setHighlights(res.data))
        .catch(console.error)
    }
  }, [id])

  const handleTextSelection = () => {
    const selection = window.getSelection()
    if (!selection || selection.toString().trim().length === 0) return
    
    const narrativeEl = narrativeRef.current
    if (!narrativeEl) return
    
    const range = selection.getRangeAt(0)
    if (!range.intersectsNode(narrativeEl)) return
    
    const selectedText = selection.toString().trim()
    const preRange = document.createRange()
    preRange.selectNodeContents(narrativeEl)
    preRange.setEnd(range.startContainer, range.startOffset)
    const char_start = preRange.toString().length
    preRange.setEnd(range.endContainer, range.endOffset)
    const char_end = preRange.toString().length
    
    highlightsAPI.create({
      level_id: parseInt(id!),
      text_fragment: selectedText,
      color: selectedColor,
      char_start,
      char_end
    }).then(() => {
      highlightsAPI.getForLevel(parseInt(id!)).then(res => setHighlights(res.data))
    }).catch(console.error)
  }

  if (!level) {
    return <div className="loading">Загрузка...</div>
  }

  return (
    <div className="briefing">
      <div className="briefing-container">
        <h1>{level.title}</h1>
        
        <div className="highlight-toolbar">
          <span>Маркер:</span>
          <button 
            className={`marker-btn red ${selectedColor === 'red' ? 'active' : ''}`}
            onClick={() => setSelectedColor('red')}
          >
            Важно
          </button>
          <button 
            className={`marker-btn yellow ${selectedColor === 'yellow' ? 'active' : ''}`}
            onClick={() => setSelectedColor('yellow')}
          >
            Правило
          </button>
          <button 
            className={`marker-btn green ${selectedColor === 'green' ? 'active' : ''}`}
            onClick={() => setSelectedColor('green')}
          >
            Ключ
          </button>
          <button onClick={handleTextSelection} className="save-highlight-btn">
            Сохранить выделение
          </button>
        </div>
        
        <div ref={narrativeRef} className="narrative" onMouseUp={handleTextSelection}>
          {level.narrative.split('\n').map((para, i) => (
            <p key={i}>{para}</p>
          ))}
        </div>
        
        <button 
          className="start-mission-btn"
          onClick={() => navigate(`/level/${id}/play`)}
        >
          Начать миссию →
        </button>
      </div>
    </div>
  )
}
