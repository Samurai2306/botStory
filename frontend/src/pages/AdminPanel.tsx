import { useState, useCallback, useEffect, type FormEvent } from 'react'
import { levelAPI, newsAPI, updatesAPI, communityAPI } from '../services/api'
import {
  AdminSection,
  LevelOption,
  MapObject,
  NewsItem,
  UpdateEditorData,
  UpdateItem,
  UpdateLayoutBlock,
  UpdateTimelineEvent,
} from './adminPanel/types'
import CustomSelect from '../components/ui/CustomSelect'
import './AdminPanel.css'

const TILE_TYPES = [
  { value: 'platform', label: 'Платформа', short: '▦' },
  { value: 'void', label: 'Пустота', short: '⬚' },
  { value: 'broken_floor', label: 'Сломанный пол', short: '⟡' },
] as const

const OBJECT_TYPES = [
  { value: 'erase', label: 'Ластик (удалить объект)', short: '⌫' },
  { value: 'wall', label: 'Стена', short: '▣' },
  { value: 'start', label: 'Старт', short: '▶' },
  { value: 'finish', label: 'Финиш', short: '★' },
  { value: 'smart_mine', label: 'Умная мина', short: '⛭' },
  { value: 'lever', label: 'Переключатель шлюза', short: '⟠' },
  { value: 'gate', label: 'Шлюз', short: '▥' },
] as const

const GATE_COLORS = [
  { value: 'orange', label: 'Оранжевый' },
  { value: 'blue', label: 'Синий' },
  { value: 'purple', label: 'Фиолетовый' },
  { value: 'green', label: 'Зелёный' },
  { value: 'red', label: 'Красный' },
  { value: 'yellow', label: 'Жёлтый' },
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

const BROADCAST_THEME_OPTIONS = [
  { value: 'general' as const, label: 'Объявление' },
  { value: 'system' as const, label: 'Системное' },
  { value: 'important_update' as const, label: 'Важное обновление' },
  { value: 'maintenance' as const, label: 'Техработы' },
  { value: 'community' as const, label: 'Сообщество' },
]

type BroadcastNotifyTheme = (typeof BROADCAST_THEME_OPTIONS)[number]['value']

function makeCells(width: number, height: number, fill: string = 'platform'): string[][] {
  return Array(height).fill(null).map(() => Array(width).fill(fill))
}

function normalizeMapData(md: any): { width: number; height: number; cells: string[][]; objects: MapObject[] } {
  const width = Number(md?.width) || 5
  const height = Number(md?.height) || 5
  const rawCells: any[][] = Array.isArray(md?.cells) ? md.cells : makeCells(width, height, 'platform')
  const rawObjects: any[] = Array.isArray(md?.objects) ? md.objects : []

  // New format already
  if (Array.isArray(md?.objects)) {
    const cells = makeCells(width, height, 'platform')
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = (rawCells?.[y]?.[x] ?? 'platform').toString().toLowerCase()
        cells[y][x] = (v === 'empty' ? 'platform' : v)
      }
    }
    return { width, height, cells, objects: rawObjects as MapObject[] }
  }

  // Legacy: objects embedded in cells
  const cells = makeCells(width, height, 'platform')
  const objects: MapObject[] = []
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = (rawCells?.[y]?.[x] ?? 'empty').toString().toLowerCase()
      if (v === 'wall' || v === 'start' || v === 'finish') {
        objects.push({ type: v, x, y })
        cells[y][x] = 'platform'
      } else if (v === 'void' || v === 'broken_floor' || v === 'platform') {
        cells[y][x] = v
      } else {
        // empty/trap/unknown -> platform
        cells[y][x] = 'platform'
      }
    }
  }
  return { width, height, cells, objects }
}

/** Количество непустых строк в эталонном коде — используется как golden_steps_count */
function countCodeLines(code: string): number {
  return code.trim().split(/\r?\n/).filter(l => l.trim()).length
}

const emptyLevelData = () => ({
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
    cells: makeCells(5, 5, 'platform'),
    objects: [] as MapObject[],
  }
})

const emptyNewsData = () => ({ title: '', content: '', is_published: false })
const emptyUpdateData = (): UpdateEditorData => ({
  title: '',
  summary: '',
  content: '',
  topic: 'general',
  status: 'draft',
  is_published: false,
  is_pinned: false,
  timeline_events: [
    {
      date: new Date().toISOString(),
      title: 'Новый этап',
      description: 'Опишите, что изменилось и почему это важно.',
      type: 'feature',
    },
  ],
  theme_config: {
    accent_color: '#8B7ED8',
    secondary_color: '#B8A9E8',
    background_gradient: 'linear-gradient(135deg,#151127,#211a3b,#151127)',
    icon: '◉',
    timeline_style: 'neon',
    surface_pattern: '',
  },
  layout_blocks: [
    { type: 'hero', title: 'Ключевая идея', content: 'Короткий акцент релиза', emphasized: true },
    { type: 'timeline_slice', title: 'Ход внедрения', content: 'Связь с событиями таймлайна' },
  ],
})

export default function AdminPanel() {
  const [adminSection, setAdminSection] = useState<AdminSection>('levels')
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [editMode, setEditMode] = useState<'tile' | 'object'>('tile')
  const [selectedTileType, setSelectedTileType] = useState<string>('platform')
  const [selectedObjectType, setSelectedObjectType] = useState<string>('wall')
  const [selectedColor, setSelectedColor] = useState<string>('orange')
  const [selectedGateOpen, setSelectedGateOpen] = useState<boolean>(false)
  const [levels, setLevels] = useState<LevelOption[]>([])
  const [editingLevelId, setEditingLevelId] = useState<number | null>(null)
  const [levelData, setLevelData] = useState(emptyLevelData())

  const [newsList, setNewsList] = useState<NewsItem[]>([])
  const [editingNewsId, setEditingNewsId] = useState<number | null>(null)
  const [newsData, setNewsData] = useState(emptyNewsData())
  const [updatesList, setUpdatesList] = useState<UpdateItem[]>([])
  const [editingUpdateId, setEditingUpdateId] = useState<number | null>(null)
  const [updateData, setUpdateData] = useState<UpdateEditorData>(emptyUpdateData())
  const [broadcastTitle, setBroadcastTitle] = useState('')
  const [broadcastBody, setBroadcastBody] = useState('')
  const [broadcastTheme, setBroadcastTheme] = useState<BroadcastNotifyTheme>('general')
  const [broadcastSending, setBroadcastSending] = useState(false)

  useEffect(() => {
    levelAPI
      .getAllAdmin({ include_inactive: true })
      .then((res) => setLevels(res.data || []))
      .catch((err) => {
        const status = (err as any)?.response?.status
        setMessage({
          type: 'error',
          text: status
            ? `Не удалось загрузить уровни (HTTP ${status}). Проверьте доступ к API.`
            : 'Не удалось загрузить уровни. Проверьте, что API доступен (VITE_API_URL/прокси).',
        })
      })
  }, [])

  useEffect(() => {
    setMessage(null)
    if (adminSection === 'news') {
      newsAPI
        .getAll()
        .then((res) => setNewsList(res.data || []))
        .catch((err) => {
          const status = (err as any)?.response?.status
          setMessage({
            type: 'error',
            text: status ? `Не удалось загрузить новости (HTTP ${status}).` : 'Не удалось загрузить новости.',
          })
        })
    }
    if (adminSection === 'updates') {
      updatesAPI
        .getAll({ limit: 100 })
        .then((res) => setUpdatesList(res.data || []))
        .catch((err) => {
          const status = (err as any)?.response?.status
          setMessage({
            type: 'error',
            text: status ? `Не удалось загрузить обновления (HTTP ${status}).` : 'Не удалось загрузить обновления.',
          })
        })
    }
  }, [adminSection])

  const handleBroadcastSubmit = async (e: FormEvent) => {
    e.preventDefault()
    const title = broadcastTitle.trim()
    if (!title) {
      setMessage({ type: 'error', text: 'Укажите заголовок' })
      return
    }
    if (!window.confirm('Отправить уведомление всем активным пользователям (кроме гостей)?')) return
    setBroadcastSending(true)
    try {
      const res = await communityAPI.broadcastNotifications({
        title,
        body: broadcastBody.trim() || undefined,
        theme: broadcastTheme,
      })
      const n = res.data?.recipients ?? 0
      setMessage({ type: 'success', text: `Рассылка отправлена. Получателей: ${n}.` })
      setBroadcastTitle('')
      setBroadcastBody('')
      setBroadcastTheme('general')
    } catch (err: unknown) {
      const ax = err as {
        message?: string
        code?: string
        response?: { status?: number; statusText?: string; data?: { detail?: unknown; message?: string } }
      }
      const res = ax.response
      const data = res?.data
      let text: string | null = null
      if (data && typeof data === 'object') {
        const d = data.detail
        if (typeof d === 'string') text = d
        else if (Array.isArray(d) && d.length > 0) {
          const first = d[0] as { msg?: string }
          if (typeof first?.msg === 'string') text = first.msg
        }
        if (!text && typeof data.message === 'string' && data.message.length > 0) text = data.message
      }
      if (!text && res?.status === 404) {
        text =
          'Маршрут рассылки не найден на сервере. Обновите backend до версии с POST /community/notifications/broadcast и перезапустите контейнер.'
      }
      if (!text && res?.status === 401) text = 'Сессия истекла или токен недействителен — войдите снова.'
      if (!text && res?.status === 403) text = 'Недостаточно прав (нужна роль admin в базе для этого токена).'
      if (!text && res?.status != null) {
        text = `Ответ сервера: ${res.status}${res.statusText ? ` ${res.statusText}` : ''}`
      }
      if (!text && (ax.code === 'ERR_NETWORK' || ax.message === 'Network Error')) {
        text =
          'Сервер недоступен. Запустите backend. В Docker перезапустите frontend после docker-compose (прокси VITE_PROXY_TARGET→backend); локально: npm run dev и API на порту 8000, либо задайте VITE_API_URL.'
      }
      if (!text && ax.message) text = ax.message
      if (!text) text = 'Не удалось отправить рассылку'
      setMessage({ type: 'error', text })
    } finally {
      setBroadcastSending(false)
    }
  }

  useEffect(() => {
    if (editingLevelId == null) {
      setLevelData(emptyLevelData())
      return
    }
    levelAPI.getById(editingLevelId).then(res => {
      const l = res.data
      const md = normalizeMapData(l.map_data || { width: 5, height: 5, cells: makeCells(5, 5, 'platform'), objects: [] })
      setLevelData({
        title: l.title || '',
        description: l.description || '',
        narrative: l.narrative || '',
        order: l.order ?? 1,
        difficulty: Math.min(5, Math.max(1, Number(l.difficulty) || 1)),
        golden_code: l.golden_code || '',
        golden_steps_count: l.golden_steps_count ?? 0,
        map_data: { width: md.width || 5, height: md.height || 5, cells: md.cells, objects: md.objects }
      })
    }).catch(() => setMessage({ type: 'error', text: 'Не удалось загрузить уровень' }))
  }, [editingLevelId])

  useEffect(() => {
    if (adminSection !== 'news' || editingNewsId == null) {
      setNewsData(emptyNewsData())
      return
    }
    newsAPI.getById(editingNewsId).then(res => {
      const n = res.data
      setNewsData({
        title: n.title || '',
        content: n.content || '',
        is_published: !!n.is_published
      })
    }).catch(() => setMessage({ type: 'error', text: 'Не удалось загрузить новость' }))
  }, [adminSection, editingNewsId])

  useEffect(() => {
    if (adminSection !== 'updates' || editingUpdateId == null) {
      setUpdateData(emptyUpdateData())
      return
    }
    updatesAPI.getById(editingUpdateId).then(res => {
      const u = res.data as UpdateItem
      setUpdateData({
        title: u.title || '',
        summary: u.summary || '',
        content: u.content || '',
        topic: u.topic || 'general',
        status: u.status || 'draft',
        is_published: !!u.is_published,
        is_pinned: !!u.is_pinned,
        timeline_events: Array.isArray(u.timeline_events) && u.timeline_events.length ? u.timeline_events : emptyUpdateData().timeline_events,
        theme_config: {
          accent_color: u.theme_config?.accent_color || '#8B7ED8',
          secondary_color: u.theme_config?.secondary_color || '#B8A9E8',
          background_gradient: u.theme_config?.background_gradient || 'linear-gradient(135deg,#151127,#211a3b,#151127)',
          icon: u.theme_config?.icon || '◉',
          timeline_style: u.theme_config?.timeline_style || 'neon',
          surface_pattern: u.theme_config?.surface_pattern || '',
        },
        layout_blocks: Array.isArray(u.layout_blocks) ? u.layout_blocks : [],
      })
    }).catch(() => setMessage({ type: 'error', text: 'Не удалось загрузить обновление' }))
  }, [adminSection, editingUpdateId])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    const payload = {
      ...levelData,
      golden_steps_count: countCodeLines(levelData.golden_code)
    }
    try {
      if (editingLevelId != null) {
        await levelAPI.update(editingLevelId, payload)
        setMessage({ type: 'success', text: 'Уровень обновлён!' })
      } else {
        await levelAPI.create(payload)
        setMessage({ type: 'success', text: 'Уровень создан успешно!' })
        setLevelData(emptyLevelData())
        levelAPI.getAllAdmin({ include_inactive: true }).then(res => setLevels(res.data || []))
      }
    } catch (error: any) {
      const d = error.response?.data?.detail
      const text = Array.isArray(d) ? (d[0]?.msg || d[0] || d.join(', ')) : (d || (editingLevelId != null ? 'Не удалось обновить уровень' : 'Не удалось создать уровень'))
      setMessage({ type: 'error', text: typeof text === 'string' ? text : 'Ошибка' })
    }
  }

  const handleNewsSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    try {
      if (editingNewsId != null) {
        await newsAPI.update(editingNewsId, newsData)
        setMessage({ type: 'success', text: 'Новость обновлена!' })
      } else {
        await newsAPI.create(newsData)
        setMessage({ type: 'success', text: 'Новость создана!' })
        setNewsData(emptyNewsData())
      }
      newsAPI.getAll().then(res => setNewsList(res.data || []))
    } catch (err: any) {
      const d = err.response?.data?.detail
      const text = Array.isArray(d) ? (d[0]?.msg || d[0] || d.join(', ')) : (d || 'Ошибка сохранения новости')
      setMessage({ type: 'error', text: typeof text === 'string' ? text : 'Ошибка' })
    }
  }

  const handleNewsDelete = async () => {
    if (editingNewsId == null) return
    if (!window.confirm('Удалить эту новость?')) return
    setMessage(null)
    try {
      await newsAPI.delete(editingNewsId)
      setMessage({ type: 'success', text: 'Новость удалена' })
      setEditingNewsId(null)
      setNewsData(emptyNewsData())
      newsAPI.getAll().then(res => setNewsList(res.data || []))
    } catch {
      setMessage({ type: 'error', text: 'Не удалось удалить новость' })
    }
  }

  const handleUpdateSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setMessage(null)
    try {
      const payload = {
        ...updateData,
        status: updateData.is_published ? 'published' : updateData.status,
      }
      if (editingUpdateId != null) {
        await updatesAPI.update(editingUpdateId, payload)
        setMessage({ type: 'success', text: 'Обновление сохранено' })
      } else {
        await updatesAPI.create(payload)
        setMessage({ type: 'success', text: 'Обновление создано' })
        setUpdateData(emptyUpdateData())
      }
      updatesAPI.getAll({ limit: 100 }).then(res => setUpdatesList(res.data || []))
    } catch {
      setMessage({ type: 'error', text: 'Не удалось сохранить обновление' })
    }
  }

  const handleUpdateDelete = async () => {
    if (editingUpdateId == null) return
    if (!window.confirm('Удалить это обновление?')) return
    try {
      await updatesAPI.delete(editingUpdateId)
      setEditingUpdateId(null)
      setUpdateData(emptyUpdateData())
      setMessage({ type: 'success', text: 'Обновление удалено' })
      updatesAPI.getAll({ limit: 100 }).then(res => setUpdatesList(res.data || []))
    } catch {
      setMessage({ type: 'error', text: 'Не удалось удалить обновление' })
    }
  }

  const addTimelineEvent = () => {
    setUpdateData(prev => ({
      ...prev,
      timeline_events: [...prev.timeline_events, {
        date: new Date().toISOString(),
        title: 'Новый этап',
        description: '',
        type: 'feature',
      }],
    }))
  }

  const updateTimelineEvent = (index: number, patch: Partial<UpdateTimelineEvent>) => {
    setUpdateData(prev => ({
      ...prev,
      timeline_events: prev.timeline_events.map((evt, i) => (i === index ? { ...evt, ...patch } : evt)),
    }))
  }

  const removeTimelineEvent = (index: number) => {
    setUpdateData(prev => ({
      ...prev,
      timeline_events: prev.timeline_events.filter((_, i) => i !== index),
    }))
  }

  const addLayoutBlock = () => {
    setUpdateData(prev => ({
      ...prev,
      layout_blocks: [...prev.layout_blocks, { type: 'rich_text', title: 'Новый блок', content: '' }],
    }))
  }

  const updateLayoutBlock = (index: number, patch: Partial<UpdateLayoutBlock>) => {
    setUpdateData(prev => ({
      ...prev,
      layout_blocks: prev.layout_blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)),
    }))
  }

  const removeLayoutBlock = (index: number) => {
    setUpdateData(prev => ({
      ...prev,
      layout_blocks: prev.layout_blocks.filter((_, i) => i !== index),
    }))
  }

  const updateTile = useCallback((y: number, x: number, tile: string) => {
    setLevelData(prev => {
      const newCells = prev.map_data.cells.map((row, yi) =>
        row.map((cell, xi) => (yi === y && xi === x ? tile : cell))
      )
      // if tile becomes void - remove objects at that cell
      const objects = (prev.map_data.objects || []).filter(o => !(o.x === x && o.y === y))
      return { ...prev, map_data: { ...prev.map_data, cells: newCells, objects: tile === 'void' ? objects : (prev.map_data.objects || []) } }
    })
  }, [])

  const upsertObject = useCallback((x: number, y: number, obj: MapObject | null) => {
    setLevelData(prev => {
      let objects = [...(prev.map_data.objects || [])]
      objects = objects.filter(o => !(o.x === x && o.y === y))

      if (obj) {
        // enforce single start/finish
        if (obj.type === 'start') objects = objects.filter(o => o.type !== 'start')
        if (obj.type === 'finish') objects = objects.filter(o => o.type !== 'finish')
        objects.push(obj)
      }

      // objects require platform under them
      const cells = prev.map_data.cells.map(r => [...r])
      if (obj && cells?.[y]?.[x] === 'void') cells[y][x] = 'platform'
      return { ...prev, map_data: { ...prev.map_data, cells, objects } }
    })
  }, [])

  const setMapSize = useCallback((width: number, height: number) => {
    const w = Math.min(MAX_SIZE, Math.max(MIN_SIZE, width))
    const h = Math.min(MAX_SIZE, Math.max(MIN_SIZE, height))
    setLevelData(prev => {
      const cur = prev.map_data
      const newCells = makeCells(w, h, 'platform')
      for (let y = 0; y < Math.min(h, cur.height); y++) {
        for (let x = 0; x < Math.min(w, cur.width); x++) {
          newCells[y][x] = cur.cells[y][x]
        }
      }
      const objects = (cur.objects || []).filter((o: MapObject) => o.x >= 0 && o.y >= 0 && o.x < w && o.y < h)
      return { ...prev, map_data: { width: w, height: h, cells: newCells, objects } }
    })
  }, [])

  const addRow = useCallback((at: 'top' | 'bottom') => {
    setLevelData(prev => {
      const { width, height, cells } = prev.map_data
      if (height >= MAX_SIZE) return prev
      const newRow = Array(width).fill('platform')
      const newCells = at === 'top' ? [newRow, ...cells] : [...cells, newRow]
      const objects = (prev.map_data.objects || []).map((o: MapObject) =>
        at === 'top' ? { ...o, y: o.y + 1 } : o
      ).filter((o: MapObject) => o.y < height + 1)
      return { ...prev, map_data: { width, height: height + 1, cells: newCells, objects } }
    })
  }, [])

  const addColumn = useCallback((at: 'left' | 'right') => {
    setLevelData(prev => {
      const { width, height, cells } = prev.map_data
      if (width >= MAX_SIZE) return prev
      const newCells = cells.map(row => {
        const r = [...row]
        if (at === 'left') r.unshift('platform')
        else r.push('platform')
        return r
      })
      const objects = (prev.map_data.objects || []).map((o: MapObject) =>
        at === 'left' ? { ...o, x: o.x + 1 } : o
      ).filter((o: MapObject) => o.x < width + 1)
      return { ...prev, map_data: { width: width + 1, height, cells: newCells, objects } }
    })
  }, [])

  const removeRow = useCallback((at: 'top' | 'bottom') => {
    setLevelData(prev => {
      const { width, height, cells } = prev.map_data
      if (height <= MIN_SIZE) return prev
      const newCells = at === 'top' ? cells.slice(1) : cells.slice(0, -1)
      const objects0 = prev.map_data.objects || []
      const objects = at === 'top'
        ? objects0.filter((o: MapObject) => o.y !== 0).map((o: MapObject) => ({ ...o, y: o.y - 1 }))
        : objects0.filter((o: MapObject) => o.y < height - 1)
      return { ...prev, map_data: { width, height: height - 1, cells: newCells, objects } }
    })
  }, [])

  const removeColumn = useCallback((at: 'left' | 'right') => {
    setLevelData(prev => {
      const { width, height, cells } = prev.map_data
      if (width <= MIN_SIZE) return prev
      const newCells = cells.map(row => at === 'left' ? row.slice(1) : row.slice(0, -1))
      const objects0 = prev.map_data.objects || []
      const objects = at === 'left'
        ? objects0.filter((o: MapObject) => o.x !== 0).map((o: MapObject) => ({ ...o, x: o.x - 1 }))
        : objects0.filter((o: MapObject) => o.x < width - 1)
      return { ...prev, map_data: { width: width - 1, height, cells: newCells, objects } }
    })
  }, [])

  const applyPreset = useCallback((w: number, h: number) => {
    setMapSize(w, h)
  }, [setMapSize])

  const clearMap = useCallback(() => {
    setLevelData(prev => {
      const { width, height } = prev.map_data
      return { ...prev, map_data: { width, height, cells: makeCells(width, height, 'platform'), objects: [] } }
    })
  }, [])

  const fillWalls = useCallback(() => {
    setLevelData(prev => {
      const { width, height } = prev.map_data
      const objects: MapObject[] = []
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) objects.push({ type: 'wall', x, y })
      }
      return { ...prev, map_data: { width, height, cells: makeCells(width, height, 'platform'), objects } }
    })
  }, [])

  return (
    <div className="admin-panel">
      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tab ${adminSection === 'levels' ? 'active' : ''}`}
          onClick={() => setAdminSection('levels')}
        >
          Конструктор уровней
        </button>
        <button
          type="button"
          className={`admin-tab ${adminSection === 'news' ? 'active' : ''}`}
          onClick={() => setAdminSection('news')}
        >
          Новости
        </button>
        <button
          type="button"
          className={`admin-tab ${adminSection === 'updates' ? 'active' : ''}`}
          onClick={() => setAdminSection('updates')}
        >
          Обновления
        </button>
        <button
          type="button"
          className={`admin-tab ${adminSection === 'notify' ? 'active' : ''}`}
          onClick={() => setAdminSection('notify')}
        >
          Уведомления
        </button>
      </div>

      {adminSection === 'levels' && (
        <>
          <h1>Конструктор уровней</h1>
          {message && (
            <div className={`admin-message ${message.type}`}>
              {message.type === 'success' ? '✓' : '⚠'} {message.text}
            </div>
          )}
          <form onSubmit={handleSubmit} className="level-form">
        <div className="form-section">
          <h2>Режим</h2>
          <div className="form-group">
            <label>Уровень</label>
            <div className="level-select-wrap">
              <CustomSelect
                className="level-select-edit"
                value={editingLevelId == null ? '' : String(editingLevelId)}
                onChange={(v) => setEditingLevelId(v === '' ? null : parseInt(v, 10))}
                ariaLabel="Выберите уровень для редактирования"
                options={[
                  { value: '', label: '— Новый уровень —' },
                  ...levels.map((l) => ({ value: String(l.id), label: `#${l.order} ${l.title}` })),
                ]}
              />
            </div>
            <span className="form-hint">
              {editingLevelId != null ? 'Редактирование: измените поля и нажмите «Сохранить»' : 'Выберите уровень для редактирования или оставьте «Новый уровень» для создания'}
            </span>
          </div>
        </div>
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
              <div className="value-stepper">
                <button
                  type="button"
                  className="stepper-btn"
                  onClick={() => setLevelData({ ...levelData, order: Math.max(1, levelData.order - 1) })}
                  disabled={levelData.order <= 1}
                  aria-label="Уменьшить порядок"
                >
                  −
                </button>
                <span className="stepper-value">{levelData.order}</span>
                <button
                  type="button"
                  className="stepper-btn"
                  onClick={() => setLevelData({ ...levelData, order: levelData.order + 1 })}
                  aria-label="Увеличить порядок"
                >
                  +
                </button>
              </div>
            </div>
            
            <div className="form-group">
              <label>Сложность (1–5)</label>
              <div className="value-stepper">
                <button
                  type="button"
                  className="stepper-btn"
                  onClick={() => setLevelData({ ...levelData, difficulty: Math.max(1, levelData.difficulty - 1) })}
                  disabled={levelData.difficulty <= 1}
                  aria-label="Уменьшить сложность"
                >
                  −
                </button>
                <span className="stepper-value">{levelData.difficulty}</span>
                <button
                  type="button"
                  className="stepper-btn"
                  onClick={() => setLevelData({ ...levelData, difficulty: Math.min(5, levelData.difficulty + 1) })}
                  disabled={levelData.difficulty >= 5}
                  aria-label="Увеличить сложность"
                >
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <div className="form-section map-section">
          <h2>Карта уровня</h2>

          <div className="map-toolbar">
            <label className="map-toolbar-label">Режим:</label>
            <div className="map-mode">
              <button
                type="button"
                className={`map-mode-btn ${editMode === 'tile' ? 'active' : ''}`}
                onClick={() => setEditMode('tile')}
              >
                Тайлы
              </button>
              <button
                type="button"
                className={`map-mode-btn ${editMode === 'object' ? 'active' : ''}`}
                onClick={() => setEditMode('object')}
              >
                Объекты
              </button>
            </div>

            {editMode === 'tile' ? (
              <>
                <label className="map-toolbar-label">Тайл:</label>
                <div className="map-type-select-wrap">
                  <CustomSelect
                    className="map-type-select"
                    value={selectedTileType}
                    onChange={setSelectedTileType}
                    ariaLabel="Выберите тайл"
                    options={TILE_TYPES.map(({ value, label }) => ({ value, label }))}
                  />
                </div>
                <span className="map-toolbar-hint">Клик по клетке — установить тайл</span>
              </>
            ) : (
              <>
                <label className="map-toolbar-label">Объект:</label>
                <div className="map-type-select-wrap">
                  <CustomSelect
                    className="map-type-select"
                    value={selectedObjectType}
                    onChange={setSelectedObjectType}
                    ariaLabel="Выберите объект"
                    options={OBJECT_TYPES.map(({ value, label }) => ({ value, label }))}
                  />
                </div>
                {(selectedObjectType === 'gate' || selectedObjectType === 'lever') && (
                  <div className="map-object-options">
                    <div className="map-type-select-wrap">
                      <CustomSelect
                        className="map-type-select"
                        value={selectedColor}
                        onChange={setSelectedColor}
                        ariaLabel="Цвет"
                        options={GATE_COLORS.map(({ value, label }) => ({ value, label }))}
                      />
                    </div>
                    {selectedObjectType === 'gate' && (
                      <label className="map-toggle">
                        <input
                          type="checkbox"
                          checked={selectedGateOpen}
                          onChange={(e) => setSelectedGateOpen(e.target.checked)}
                        />
                        <span>Открыт</span>
                      </label>
                    )}
                  </div>
                )}
                <span className="map-toolbar-hint">Клик по клетке — установить объект</span>
              </>
            )}
          </div>

          <div className="map-size-controls">
            <div className="map-size-row">
              <span className="map-size-label">Размер поля:</span>
              <div className="map-size-inputs">
                <label className="map-size-field">
                  <span>Ширина</span>
                  <div className="value-stepper">
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => setMapSize(Math.max(MIN_SIZE, levelData.map_data.width - 1), levelData.map_data.height)}
                      disabled={levelData.map_data.width <= MIN_SIZE}
                      aria-label="Уменьшить ширину"
                    >
                      −
                    </button>
                    <span className="stepper-value">{levelData.map_data.width}</span>
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => setMapSize(Math.min(MAX_SIZE, levelData.map_data.width + 1), levelData.map_data.height)}
                      disabled={levelData.map_data.width >= MAX_SIZE}
                      aria-label="Увеличить ширину"
                    >
                      +
                    </button>
                  </div>
                </label>
                <span className="map-size-sep">×</span>
                <label className="map-size-field">
                  <span>Высота</span>
                  <div className="value-stepper">
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => setMapSize(levelData.map_data.width, Math.max(MIN_SIZE, levelData.map_data.height - 1))}
                      disabled={levelData.map_data.height <= MIN_SIZE}
                      aria-label="Уменьшить высоту"
                    >
                      −
                    </button>
                    <span className="stepper-value">{levelData.map_data.height}</span>
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => setMapSize(levelData.map_data.width, Math.min(MAX_SIZE, levelData.map_data.height + 1))}
                      disabled={levelData.map_data.height >= MAX_SIZE}
                      aria-label="Увеличить высоту"
                    >
                      +
                    </button>
                  </div>
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
                    {row.map((cell, x) => {
                      const objects: MapObject[] = (levelData.map_data.objects || [])
                      const obj = objects.find(o => o.x === x && o.y === y)
                      const tile = (cell || 'platform').toLowerCase()
                      const tileMeta = TILE_TYPES.find(t => t.value === tile)
                      const objMeta = obj ? OBJECT_TYPES.find(t => t.value === obj.type) : null
                      const icon = objMeta?.short ?? tileMeta?.short ?? '▦'
                      const label = objMeta?.label ?? tileMeta?.label ?? tile
                      const klass = obj ? `map-cell--obj-${obj.type}` : `map-cell--${tile}`
                      const title = `[${x},${y}] ${label}`
                      return (
                      <button
                        key={x}
                        type="button"
                        onClick={() => {
                          if (editMode === 'tile') {
                            updateTile(y, x, selectedTileType)
                            return
                          }
                          if (selectedObjectType === 'erase') {
                            upsertObject(x, y, null)
                            return
                          }
                          if (selectedObjectType === 'gate') {
                            upsertObject(x, y, { type: 'gate', x, y, color: selectedColor, open: selectedGateOpen })
                            return
                          }
                          if (selectedObjectType === 'lever') {
                            upsertObject(x, y, { type: 'lever', x, y, color: selectedColor, on: false })
                            return
                          }
                          upsertObject(x, y, { type: selectedObjectType, x, y })
                        }}
                        className={`map-cell ${klass}`}
                        title={title}
                      >
                        <span className="map-cell-icon">{icon}</span>
                        <span className="map-cell-label">{label}</span>
                      </button>
                      )
                    })}
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
              onChange={(e) => {
                const code = e.target.value
                setLevelData({
                  ...levelData,
                  golden_code: code,
                  golden_steps_count: countCodeLines(code)
                })
              }}
              rows={8}
              placeholder="вперед&#10;налево&#10;вперед"
              required
            />
          </div>
          
          <div className="form-group form-group-readonly">
            <label>Количество шагов в эталоне</label>
            <div className="readonly-steps">
              <span className="readonly-steps-value">{countCodeLines(levelData.golden_code)}</span>
              <span className="readonly-steps-hint">подсчитано по числу строк</span>
            </div>
          </div>
        </div>
        
        <button type="submit" className="submit-btn">
            {editingLevelId != null ? 'Сохранить изменения' : 'Создать уровень'}
          </button>
          {editingLevelId != null && (
            <button
              type="button"
              className="submit-btn admin-delete-btn"
              onClick={async () => {
                if (!window.confirm('Деактивировать уровень? Он будет скрыт из списка уровней.')) return
                try {
                  await levelAPI.delete(editingLevelId)
                  setMessage({ type: 'success', text: 'Уровень деактивирован' })
                  setEditingLevelId(null)
                  setLevelData(emptyLevelData())
                  levelAPI.getAllAdmin({ include_inactive: true }).then(res => setLevels(res.data || []))
                } catch {
                  setMessage({ type: 'error', text: 'Не удалось деактивировать уровень' })
                }
              }}
            >
              Деактивировать уровень
            </button>
          )}
        </form>
        </>
      )}

      {adminSection === 'news' && (
        <>
          <h1>Новости</h1>
          {message && (
            <div className={`admin-message ${message.type}`}>
              {message.type === 'success' ? '✓' : '⚠'} {message.text}
            </div>
          )}
          <form onSubmit={handleNewsSubmit} className="level-form admin-news-form">
            <div className="form-section">
              <h2>Режим</h2>
              <div className="form-group">
                <label>Новость</label>
                <div className="level-select-wrap">
                  <CustomSelect
                    className="level-select-edit"
                    value={editingNewsId == null ? '' : String(editingNewsId)}
                    onChange={(v) => setEditingNewsId(v === '' ? null : parseInt(v, 10))}
                    ariaLabel="Выберите новость для редактирования"
                    options={[
                      { value: '', label: '— Новая новость —' },
                      ...newsList.map((n) => ({ value: String(n.id), label: `${n.is_published ? '✓' : '○'} ${n.title}` })),
                    ]}
                  />
                </div>
                <span className="form-hint">
                  {editingNewsId != null ? 'Редактирование: измените поля и нажмите «Сохранить»' : 'Выберите новость или оставьте «Новая новость» для создания'}
                </span>
              </div>
            </div>
            <div className="form-section">
              <h2>Содержание</h2>
              <div className="form-group">
                <label>Заголовок</label>
                <input
                  type="text"
                  value={newsData.title}
                  onChange={(e) => setNewsData({ ...newsData, title: e.target.value })}
                  required
                />
              </div>
              <div className="form-group">
                <label>Текст</label>
                <textarea
                  value={newsData.content}
                  onChange={(e) => setNewsData({ ...newsData, content: e.target.value })}
                  rows={8}
                  required
                />
              </div>
              <div className="form-group">
                <label className="news-checkbox-label">
                  <input
                    type="checkbox"
                    checked={newsData.is_published}
                    onChange={(e) => setNewsData({ ...newsData, is_published: e.target.checked })}
                  />
                  <span>Опубликовано (видна на лендинге)</span>
                </label>
              </div>
            </div>
            <div className="admin-news-actions">
              <button type="submit" className="submit-btn">
                {editingNewsId != null ? 'Сохранить изменения' : 'Создать новость'}
              </button>
              {editingNewsId != null && (
                <button type="button" className="submit-btn admin-delete-btn" onClick={handleNewsDelete}>
                  Удалить новость
                </button>
              )}
            </div>
          </form>
        </>
      )}

      {adminSection === 'updates' && (
        <>
          <h1>Обновления и кастомизация таймлайна</h1>
          {message && (
            <div className={`admin-message ${message.type}`}>
              {message.type === 'success' ? '✓' : '⚠'} {message.text}
            </div>
          )}
          <form onSubmit={handleUpdateSubmit} className="level-form admin-updates-form">
            <div className="form-section">
              <h2>Режим</h2>
              <div className="form-group">
                <label>Запись обновления</label>
                <div className="level-select-wrap">
                  <CustomSelect
                    className="level-select-edit"
                    value={editingUpdateId == null ? '' : String(editingUpdateId)}
                    onChange={(v) => setEditingUpdateId(v === '' ? null : parseInt(v, 10))}
                    ariaLabel="Выберите обновление для редактирования"
                    options={[
                      { value: '', label: '— Новое обновление —' },
                      ...updatesList.map((u) => ({ value: String(u.id), label: `${u.is_published ? '✓' : '○'} ${u.title}` })),
                    ]}
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h2>Контент и публикация</h2>
              <div className="form-group">
                <label>Заголовок</label>
                <input value={updateData.title} onChange={(e) => setUpdateData({ ...updateData, title: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Краткое описание</label>
                <textarea value={updateData.summary} onChange={(e) => setUpdateData({ ...updateData, summary: e.target.value })} rows={2} />
              </div>
              <div className="form-group">
                <label>Основной текст</label>
                <textarea value={updateData.content} onChange={(e) => setUpdateData({ ...updateData, content: e.target.value })} rows={6} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Тематический тег</label>
                  <input value={updateData.topic} onChange={(e) => setUpdateData({ ...updateData, topic: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>Статус</label>
                  <CustomSelect
                    className="level-select-edit"
                    value={updateData.status}
                    onChange={(value) => setUpdateData({ ...updateData, status: value as UpdateEditorData['status'] })}
                    options={[
                      { value: 'draft', label: 'draft' },
                      { value: 'published', label: 'published' },
                      { value: 'archived', label: 'archived' },
                    ]}
                    ariaLabel="Статус обновления"
                  />
                </div>
              </div>
              <div className="form-group">
                <label className="news-checkbox-label">
                  <input type="checkbox" checked={updateData.is_published} onChange={(e) => setUpdateData({ ...updateData, is_published: e.target.checked })} />
                  <span>Опубликовано (видно всем пользователям и гостям)</span>
                </label>
                <label className="news-checkbox-label">
                  <input type="checkbox" checked={updateData.is_pinned} onChange={(e) => setUpdateData({ ...updateData, is_pinned: e.target.checked })} />
                  <span>Закрепить вверху раздела</span>
                </label>
              </div>
            </div>

            <div className="form-section">
              <h2>Кастомизация интерфейса (theme_config)</h2>
              <div className="form-row">
                <div className="form-group">
                  <label>Accent color</label>
                  <input value={updateData.theme_config.accent_color} onChange={(e) => setUpdateData({ ...updateData, theme_config: { ...updateData.theme_config, accent_color: e.target.value } })} />
                </div>
                <div className="form-group">
                  <label>Secondary color</label>
                  <input value={updateData.theme_config.secondary_color} onChange={(e) => setUpdateData({ ...updateData, theme_config: { ...updateData.theme_config, secondary_color: e.target.value } })} />
                </div>
              </div>
              <div className="form-group">
                <label>Background gradient</label>
                <input value={updateData.theme_config.background_gradient} onChange={(e) => setUpdateData({ ...updateData, theme_config: { ...updateData.theme_config, background_gradient: e.target.value } })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Icon</label>
                  <input value={updateData.theme_config.icon} onChange={(e) => setUpdateData({ ...updateData, theme_config: { ...updateData.theme_config, icon: e.target.value } })} />
                </div>
                <div className="form-group">
                  <label>Timeline style</label>
                  <CustomSelect
                    className="level-select-edit"
                    value={updateData.theme_config.timeline_style}
                    onChange={(value) => setUpdateData({ ...updateData, theme_config: { ...updateData.theme_config, timeline_style: value as UpdateEditorData['theme_config']['timeline_style'] } })}
                    options={[
                      { value: 'neon', label: 'neon' },
                      { value: 'glass', label: 'glass' },
                      { value: 'minimal', label: 'minimal' },
                      { value: 'retro', label: 'retro' },
                    ]}
                    ariaLabel="Стиль таймлайна"
                  />
                </div>
              </div>
            </div>

            <div className="form-section">
              <h2>Таймлайн события</h2>
              {updateData.timeline_events.map((evt, idx) => (
                <div key={idx} className="admin-update-block">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Дата</label>
                      <input value={evt.date} onChange={(e) => updateTimelineEvent(idx, { date: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>Тип</label>
                      <CustomSelect
                        className="level-select-edit"
                        value={evt.type}
                        onChange={(value) => updateTimelineEvent(idx, { type: value as UpdateTimelineEvent['type'] })}
                        options={[
                          { value: 'feature', label: 'feature' },
                          { value: 'fix', label: 'fix' },
                          { value: 'improvement', label: 'improvement' },
                          { value: 'design', label: 'design' },
                          { value: 'infra', label: 'infra' },
                          { value: 'other', label: 'other' },
                        ]}
                        ariaLabel="Тип события"
                      />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Заголовок события</label>
                    <input value={evt.title} onChange={(e) => updateTimelineEvent(idx, { title: e.target.value })} />
                  </div>
                  <div className="form-group">
                    <label>Описание события</label>
                    <textarea rows={3} value={evt.description} onChange={(e) => updateTimelineEvent(idx, { description: e.target.value })} />
                  </div>
                  <button type="button" className="submit-btn admin-delete-btn" onClick={() => removeTimelineEvent(idx)}>Удалить событие</button>
                </div>
              ))}
              <button type="button" className="submit-btn" onClick={addTimelineEvent}>+ Добавить событие</button>
            </div>

            <div className="form-section">
              <h2>Конструктор layout_blocks</h2>
              {updateData.layout_blocks.map((blk, idx) => (
                <div key={idx} className="admin-update-block">
                  <div className="form-row">
                    <div className="form-group">
                      <label>Тип блока</label>
                      <CustomSelect
                        className="level-select-edit"
                        value={blk.type}
                        onChange={(value) => updateLayoutBlock(idx, { type: value as UpdateLayoutBlock['type'] })}
                        options={[
                          { value: 'hero', label: 'hero' },
                          { value: 'rich_text', label: 'rich_text' },
                          { value: 'timeline_slice', label: 'timeline_slice' },
                          { value: 'media', label: 'media' },
                          { value: 'cta', label: 'cta' },
                        ]}
                        ariaLabel="Тип блока"
                      />
                    </div>
                    <div className="form-group">
                      <label>Заголовок</label>
                      <input value={blk.title || ''} onChange={(e) => updateLayoutBlock(idx, { title: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>Контент</label>
                    <textarea rows={3} value={blk.content || ''} onChange={(e) => updateLayoutBlock(idx, { content: e.target.value })} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label>Media URL</label>
                      <input value={blk.media_url || ''} onChange={(e) => updateLayoutBlock(idx, { media_url: e.target.value })} />
                    </div>
                    <div className="form-group">
                      <label>CTA text</label>
                      <input value={blk.cta_text || ''} onChange={(e) => updateLayoutBlock(idx, { cta_text: e.target.value })} />
                    </div>
                  </div>
                  <div className="form-group">
                    <label>CTA URL</label>
                    <input value={blk.cta_url || ''} onChange={(e) => updateLayoutBlock(idx, { cta_url: e.target.value })} />
                  </div>
                  <label className="news-checkbox-label">
                    <input type="checkbox" checked={!!blk.emphasized} onChange={(e) => updateLayoutBlock(idx, { emphasized: e.target.checked })} />
                    <span>Акцентный блок</span>
                  </label>
                  <button type="button" className="submit-btn admin-delete-btn" onClick={() => removeLayoutBlock(idx)}>Удалить блок</button>
                </div>
              ))}
              <button type="button" className="submit-btn" onClick={addLayoutBlock}>+ Добавить блок</button>
            </div>

            <div className="admin-news-actions">
              <button type="submit" className="submit-btn">
                {editingUpdateId != null ? 'Сохранить обновление' : 'Создать обновление'}
              </button>
              {editingUpdateId != null && (
                <button type="button" className="submit-btn admin-delete-btn" onClick={handleUpdateDelete}>
                  Удалить обновление
                </button>
              )}
            </div>
          </form>
        </>
      )}

      {adminSection === 'notify' && (
        <>
          <h1>Рассылка уведомлений</h1>
          {message && (
            <div className={`admin-message ${message.type}`}>
              {message.type === 'success' ? '✓' : '⚠'} {message.text}
            </div>
          )}
          <form onSubmit={handleBroadcastSubmit} className="level-form admin-notify-form">
            <div className="form-section admin-notify-intro">
              <p>
                Сообщение попадёт в колокольчик у всех активных пользователей с ролью не «гость». Для важного текста
                пользователи могут закрепить уведомление в окне списка.
              </p>
            </div>
            <div className="form-section">
              <h2>Текст</h2>
              <div className="form-group">
                <label>Тема уведомления</label>
                <CustomSelect
                  className="level-select-edit"
                  value={broadcastTheme}
                  onChange={(value) => setBroadcastTheme(value as BroadcastNotifyTheme)}
                  disabled={broadcastSending}
                  ariaLabel="Тема рассылки"
                  options={BROADCAST_THEME_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                />
                <span className="form-hint">Влияет на подпись типа в колокольчике и цвет акцента в списке.</span>
              </div>
              <div className="form-group">
                <label>Заголовок (до 180 символов)</label>
                <input
                  type="text"
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  maxLength={180}
                  required
                  disabled={broadcastSending}
                />
              </div>
              <div className="form-group">
                <label>Текст (необязательно, до 500 символов)</label>
                <textarea
                  value={broadcastBody}
                  onChange={(e) => setBroadcastBody(e.target.value)}
                  rows={5}
                  maxLength={500}
                  disabled={broadcastSending}
                />
              </div>
            </div>
            <div className="admin-news-actions">
              <button type="submit" className="submit-btn" disabled={broadcastSending}>
                {broadcastSending ? 'Отправка…' : 'Разослать'}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  )
}
