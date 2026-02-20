import { useState, useCallback } from 'react'
import { levelAPI } from '../services/api'
import './AdminPanel.css'

const CELL_TYPES = [
  { value: 'empty', label: 'Пусто', short: '·' },
  { value: 'wall', label: 'Стена', short: '▣' },
  { value: 'trap', label: 'Ловушка', short: '⚠' },
  { value: 'start', label: 'Старт', short: '▶' },
  { value: 'finish', label: 'Финиш', short: '★' }
] as const

const MIN_SIZE = 3
const MAX_SIZE = 20

const PRESETS = [
  { w: 5, h: 5, label: '5×5' },
  { w: 6, h: 6, label: '6×6' },
  { w: 8, h: 6, label: '8×6' },
  { w: 10, h: 8, label: '10×8' },
  { w: 12, h: 10, label: '12×10' },
]

function makeCells(width: number, height: number, fill: string = 'empty'): string[][] {
  return Array(height).fill(null).map(() => Array(width).fill(fill))
}

export default function AdminPanel() {
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [selectedCellType, setSelectedCellType] = useState<string>('empty')
  const [levelData, setLevelData] = useState({
    title: '',
    description: '',
    narrative: '',
    order: 1,
    difficulty: 1,
    golden_code: '',
    golden_steps_count: 0,
    map_data: {
      width: 5,
      height: 5,
      cells: makeCells(5, 5)
    }
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    try {
      await levelAPI.create(levelData)
      setMessage({ type: 'success', text: 'Уровень создан успешно!' })
      setLevelData({
        ...levelData,
        title: '',
        description: '',
        narrative: '',
        golden_code: ''
      })
    } catch (error: any) {
      const d = error.response?.data?.detail
      const text = Array.isArray(d) ? (d[0]?.msg || d[0] || d.join(', ')) : (d || 'Не удалось создать уровень')
      setMessage({ type: 'error', text: typeof text === 'string' ? text : 'Не удалось создать уровень' })
    }
  }

  const updateCell = useCallback((y: number, x: number, type: string) => {
    setLevelData(prev => {
      const newCells = prev.map_data.cells.map((row, yi) =>
        row.map((cell, xi) => (yi === y && xi === x ? type : cell))
      )
      return { ...prev, map_data: { ...prev.map_data, cells: newCells } }
    })
  }, [])

  const setMapSize = useCallback((width: number, height: number) => {
    const w = Math.min(MAX_SIZE, Math.max(MIN_SIZE, width))
    const h = Math.min(MAX_SIZE, Math.max(MIN_SIZE, height))
    setLevelData(prev => {
      const cur = prev.map_data
      const newCells = makeCells(w, h, 'empty')
      for (let y = 0; y < Math.min(h, cur.height); y++) {
        for (let x = 0; x < Math.min(w, cur.width); x++) {
          newCells[y][x] = cur.cells[y][x]
        }
      }
      return { ...prev, map_data: { width: w, height: h, cells: newCells } }
    })
  }, [])

  const addRow = useCallback((at: 'top' | 'bottom') => {
    setLevelData(prev => {
      const { width, height, cells } = prev.map_data
      if (height >= MAX_SIZE) return prev
      const newRow = Array(width).fill('empty')
      const newCells = at === 'top' ? [newRow, ...cells] : [...cells, newRow]
      return { ...prev, map_data: { width, height: height + 1, cells: newCells } }
    })
  }, [])

  const addColumn = useCallback((at: 'left' | 'right') => {
    setLevelData(prev => {
      const { width, height, cells } = prev.map_data
      if (width >= MAX_SIZE) return prev
      const newCells = cells.map(row => {
        const r = [...row]
        if (at === 'left') r.unshift('empty')
        else r.push('empty')
        return r
      })
      return { ...prev, map_data: { width: width + 1, height, cells: newCells } }
    })
  }, [])

  const removeRow = useCallback((at: 'top' | 'bottom') => {
    setLevelData(prev => {
      const { width, height, cells } = prev.map_data
      if (height <= MIN_SIZE) return prev
      const newCells = at === 'top' ? cells.slice(1) : cells.slice(0, -1)
      return { ...prev, map_data: { width, height: height - 1, cells: newCells } }
    })
  }, [])

  const removeColumn = useCallback((at: 'left' | 'right') => {
    setLevelData(prev => {
      const { width, height, cells } = prev.map_data
      if (width <= MIN_SIZE) return prev
      const newCells = cells.map(row => at === 'left' ? row.slice(1) : row.slice(0, -1))
      return { ...prev, map_data: { width: width - 1, height, cells: newCells } }
    })
  }, [])

  const applyPreset = useCallback((w: number, h: number) => {
    setMapSize(w, h)
  }, [setMapSize])

  const clearMap = useCallback(() => {
    setLevelData(prev => {
      const { width, height } = prev.map_data
      return { ...prev, map_data: { width, height, cells: makeCells(width, height) } }
    })
  }, [])

  const fillWalls = useCallback(() => {
    setLevelData(prev => {
      const { width, height } = prev.map_data
      return { ...prev, map_data: { width, height, cells: makeCells(width, height, 'wall') } }
    })
  }, [])

  return (
    <div className="admin-panel">
      <h1>Конструктор уровней</h1>
      {message && (
        <div className={`admin-message ${message.type}`}>
          {message.type === 'success' ? '✓' : '⚠'} {message.text}
        </div>
      )}
      <form onSubmit={handleSubmit} className="level-form">
        <div className="form-section">
          <h2>Основная информация</h2>
          
          <div className="form-group">
            <label>Название</label>
            <input
              type="text"
              value={levelData.title}
              onChange={(e) => setLevelData({ ...levelData, title: e.target.value })}
              required
            />
          </div>
          
          <div className="form-group">
            <label>Описание</label>
            <textarea
              value={levelData.description}
              onChange={(e) => setLevelData({ ...levelData, description: e.target.value })}
              rows={3}
            />
          </div>
          
          <div className="form-group">
            <label>Предыстория (нарратив)</label>
            <textarea
              value={levelData.narrative}
              onChange={(e) => setLevelData({ ...levelData, narrative: e.target.value })}
              rows={6}
              required
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label>Порядок</label>
              <input
                type="number"
                value={levelData.order}
                onChange={(e) => setLevelData({ ...levelData, order: parseInt(e.target.value) })}
                min="1"
                required
              />
            </div>
            
            <div className="form-group">
              <label>Сложность (1-5)</label>
              <input
                type="number"
                value={levelData.difficulty}
                onChange={(e) => setLevelData({ ...levelData, difficulty: parseInt(e.target.value) })}
                min="1"
                max="5"
                required
              />
            </div>
          </div>
        </div>
        
        <div className="form-section map-section">
          <h2>Карта уровня</h2>

          <div className="map-toolbar">
            <label className="map-toolbar-label">Тип клетки:</label>
            <div className="map-type-select-wrap">
              <select
                value={selectedCellType}
                onChange={(e) => setSelectedCellType(e.target.value)}
                className="map-type-select"
                aria-label="Выберите тип клетки"
              >
                {CELL_TYPES.map(({ value, label }) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <span className="map-type-select-icon" aria-hidden>▼</span>
            </div>
            <span className="map-toolbar-hint">Клик по клетке — установить выбранный тип</span>
          </div>

          <div className="map-size-controls">
            <div className="map-size-row">
              <span className="map-size-label">Размер поля:</span>
              <div className="map-size-inputs">
                <label>
                  <span>Ширина</span>
                  <input
                    type="number"
                    min={MIN_SIZE}
                    max={MAX_SIZE}
                    value={levelData.map_data.width}
                    onChange={(e) => setMapSize(parseInt(e.target.value) || MIN_SIZE, levelData.map_data.height)}
                  />
                </label>
                <span className="map-size-sep">×</span>
                <label>
                  <span>Высота</span>
                  <input
                    type="number"
                    min={MIN_SIZE}
                    max={MAX_SIZE}
                    value={levelData.map_data.height}
                    onChange={(e) => setMapSize(levelData.map_data.width, parseInt(e.target.value) || MIN_SIZE)}
                  />
                </label>
              </div>
            </div>
            <div className="map-size-row">
              <span className="map-size-label">Быстрые размеры:</span>
              <div className="map-presets">
                {PRESETS.map(({ w, h, label }) => (
                  <button
                    key={label}
                    type="button"
                    className="map-preset-btn"
                    onClick={() => applyPreset(w, h)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="map-size-row">
              <span className="map-size-label">Добавить / убрать:</span>
              <div className="map-resize-buttons">
                <button type="button" className="map-resize-btn" onClick={() => addRow('top')} title="Добавить ряд сверху">+ ряд ↑</button>
                <button type="button" className="map-resize-btn" onClick={() => addRow('bottom')} title="Добавить ряд снизу">+ ряд ↓</button>
                <button type="button" className="map-resize-btn" onClick={() => removeRow('top')} title="Удалить верхний ряд">− ряд ↑</button>
                <button type="button" className="map-resize-btn" onClick={() => removeRow('bottom')} title="Удалить нижний ряд">− ряд ↓</button>
                <button type="button" className="map-resize-btn" onClick={() => addColumn('left')} title="Добавить столбец слева">+ столбец ←</button>
                <button type="button" className="map-resize-btn" onClick={() => addColumn('right')} title="Добавить столбец справа">+ столбец →</button>
                <button type="button" className="map-resize-btn" onClick={() => removeColumn('left')} title="Удалить левый столбец">− столбец ←</button>
                <button type="button" className="map-resize-btn" onClick={() => removeColumn('right')} title="Удалить правый столбец">− столбец →</button>
              </div>
            </div>
            <div className="map-size-row">
              <span className="map-size-label">Действия:</span>
              <div className="map-actions">
                <button type="button" className="map-action-btn map-action-clear" onClick={clearMap}>
                  Очистить карту
                </button>
                <button type="button" className="map-action-btn map-action-fill" onClick={fillWalls}>
                  Заполнить стенами
                </button>
              </div>
            </div>
          </div>

          <div className="map-editor-wrap">
            <div className="map-editor-scroll">
              <div className="map-editor">
                {levelData.map_data.cells.map((row, y) => (
                  <div key={y} className="map-row">
                    {row.map((cell, x) => (
                      <button
                        key={x}
                        type="button"
                        onClick={() => updateCell(y, x, selectedCellType)}
                        className={`map-cell map-cell--${cell}`}
                        title={`[${x},${y}] ${CELL_TYPES.find(t => t.value === cell)?.label ?? cell} — клик: ${CELL_TYPES.find(t => t.value === selectedCellType)?.label}`}
                      >
                        <span className="map-cell-icon">{CELL_TYPES.find(t => t.value === cell)?.short ?? '·'}</span>
                        <span className="map-cell-label">{CELL_TYPES.find(t => t.value === cell)?.label ?? cell}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
            <p className="map-editor-hint">Размер: {levelData.map_data.width}×{levelData.map_data.height}. Лимит: {MIN_SIZE}–{MAX_SIZE} по каждой оси.</p>
          </div>
        </div>
        
        <div className="form-section">
          <h2>Золотой эталон</h2>
          
          <div className="form-group">
            <label>Эталонный код</label>
            <textarea
              value={levelData.golden_code}
              onChange={(e) => setLevelData({ ...levelData, golden_code: e.target.value })}
              rows={8}
              placeholder="вперед&#10;налево&#10;вперед"
              required
            />
          </div>
          
          <div className="form-group">
            <label>Количество шагов в эталоне</label>
            <input
              type="number"
              value={levelData.golden_steps_count}
              onChange={(e) => setLevelData({ ...levelData, golden_steps_count: parseInt(e.target.value) })}
              min="0"
              required
            />
          </div>
        </div>
        
        <button type="submit" className="submit-btn">
          Создать уровень
        </button>
      </form>
    </div>
  )
}
