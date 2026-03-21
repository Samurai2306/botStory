import { useEffect, useRef, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import './IsometricCanvas.css'

interface Props {
  mapData: {
    width: number
    height: number
    cells: string[][]
    objects?: Array<{ type: string; x: number; y: number; color?: string; open?: boolean; on?: boolean }>
  }
  robotHistory: Array<[number, number, number]>
  mineHistory?: Array<[number, number, number]>
  gatesHistory?: Array<Record<string, boolean>>
}

const TILE_WIDTH = 80
const TILE_HEIGHT = 40
const TILE_DEPTH = 16
const WALL_HEIGHT = 58

export default function IsometricCanvas({ mapData, robotHistory, mineHistory = [], gatesHistory = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>(0)
  const currentStepRef = useRef<number>(0)
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [cutawayWalls, setCutawayWalls] = useState(true)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [rotationDeg, setRotationDeg] = useState(0) // 0, 90, 180, 270 — поворот поля для удобства
  const [isDragging, setIsDragging] = useState(false)

  const objectsAt = useMemo(() => {
    const m = new Map<string, Array<{ type: string; x: number; y: number; color?: string; open?: boolean; on?: boolean }>>()
    const objs = Array.isArray(mapData?.objects) ? mapData.objects : []
    for (const o of objs) {
      const key = `${o.x},${o.y}`
      const arr = m.get(key) ?? []
      arr.push(o)
      m.set(key, arr)
    }
    return m
  }, [mapData])

  const startCell = useMemo(() => {
    const objs = Array.isArray(mapData?.objects) ? mapData.objects : []
    for (const o of objs) {
      if (o.type === 'start') return { x: o.x, y: o.y }
    }
    if (!mapData?.cells) return null
    for (let yy = 0; yy < mapData.height; yy++) {
      for (let xx = 0; xx < mapData.width; xx++) {
        if (mapData.cells[yy][xx] === 'start') return { x: xx, y: yy }
      }
    }
    return null
  }, [mapData])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Render into the visible viewport size (avoid CSS downscaling that makes maps tiny)
    const container = containerRef.current
    const viewW = Math.max(320, container?.clientWidth ?? 900)
    const viewH = Math.max(240, container?.clientHeight ?? 560)
    const dpr = Math.max(1, Math.floor((window.devicePixelRatio || 1) * 100) / 100)
    canvas.width = Math.floor(viewW * dpr)
    canvas.height = Math.floor(viewH * dpr)
    canvas.style.width = `${viewW}px`
    canvas.style.height = `${viewH}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const margin = Math.min(140, Math.max(70, viewH * 0.14))

    // Горизонтальный поворот вида: переводим клетку (x,y) в "видовые" координаты (vx,vy), карта не переворачивается
    const gridToView = (gx: number, gy: number) => {
      const w = mapData.width
      const h = mapData.height
      switch (rotationDeg) {
        case 90:  return { vx: h - 1 - gy, vy: gx }
        case 180: return { vx: w - 1 - gx, vy: h - 1 - gy }
        case 270: return { vx: gy, vy: w - 1 - gx }
        default:  return { vx: gx, vy: gy }
      }
    }

    const gridToIso = (gx: number, gy: number) => {
      const { vx, vy } = gridToView(gx, gy)
      return {
        isoX: (vx - vy) * (TILE_WIDTH / 2) * zoom + viewW / 2,
        isoY: (vx + vy) * (TILE_HEIGHT / 2) * zoom + margin
      }
    }

    const getTilePoints = (isoX: number, isoY: number) => {
      const top = { x: isoX, y: isoY }
      const right = { x: isoX + (TILE_WIDTH / 2) * zoom, y: isoY + (TILE_HEIGHT / 2) * zoom }
      const bottom = { x: isoX, y: isoY + TILE_HEIGHT * zoom }
      const left = { x: isoX - (TILE_WIDTH / 2) * zoom, y: isoY + (TILE_HEIGHT / 2) * zoom }
      const center = { x: isoX, y: isoY + (TILE_HEIGHT / 2) * zoom }
      return { top, right, bottom, left, center }
    }

    const drawInsetDiamond = (
      ctx: CanvasRenderingContext2D,
      isoX: number,
      isoY: number,
      inset: number,
      fill: CanvasFillStrokeStyles['fillStyle'],
      stroke: CanvasFillStrokeStyles['strokeStyle'],
      lineWidth: number
    ) => {
      const { center } = getTilePoints(isoX, isoY)
      const rx = (TILE_WIDTH / 2) * zoom * inset
      const ry = (TILE_HEIGHT / 2) * zoom * inset
      ctx.save()
      ctx.fillStyle = fill
      ctx.strokeStyle = stroke
      ctx.lineWidth = lineWidth
      ctx.beginPath()
      ctx.moveTo(center.x, center.y - ry)
      ctx.lineTo(center.x + rx, center.y)
      ctx.lineTo(center.x, center.y + ry)
      ctx.lineTo(center.x - rx, center.y)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }

    const drawChargingStation = (
      ctx: CanvasRenderingContext2D,
      isoX: number,
      isoY: number,
      variant: 'start' | 'finish'
    ) => {
      const { center } = getTilePoints(isoX, isoY)
      const baseColor = variant === 'finish' ? '#d4a012' : '#8b7cb0'
      ctx.save()
      ctx.globalAlpha = 1
      drawInsetDiamond(ctx, isoX, isoY, 0.78, '#16162a', '#2a2a3e', 1)
      ctx.strokeStyle = baseColor
      ctx.lineWidth = 1.5
      ctx.beginPath()
      ctx.ellipse(center.x, center.y, 14 * zoom, 8 * zoom, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.font = `bold ${16 * zoom}px Arial`
      ctx.fillStyle = baseColor
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('⚡', center.x, center.y)
      ctx.restore()
    }

    /** Верх куба стены: без «каркасного X» — металлическая панель с лёгким бликом */
    const drawLabWallDetails = (ctx: CanvasRenderingContext2D, isoX: number, isoY: number, depth: number) => {
      const { top, right, bottom, left, center } = getTilePoints(isoX, isoY)

      ctx.save()
      drawInsetDiamond(ctx, isoX, isoY, 0.88, 'rgba(18,18,28,0.55)', 'rgba(255,255,255,0.06)', 1)

      // Мягкий блик по диагонали ромба (не линии-сетка)
      const shine = ctx.createLinearGradient(top.x, top.y, bottom.x, bottom.y)
      shine.addColorStop(0, 'rgba(255,255,255,0.07)')
      shine.addColorStop(0.45, 'rgba(255,255,255,0)')
      shine.addColorStop(1, 'rgba(0,0,0,0.12)')
      ctx.fillStyle = shine
      ctx.beginPath()
      ctx.moveTo(top.x, top.y)
      ctx.lineTo(right.x, right.y)
      ctx.lineTo(bottom.x, bottom.y)
      ctx.lineTo(left.x, left.y)
      ctx.closePath()
      ctx.fill()

      // Тонкая кромка + микро-заклёпки (читаемость без wireframe)
      ctx.strokeStyle = 'rgba(139, 126, 216, 0.2)'
      ctx.lineWidth = 1
      ctx.stroke()
      const rivet = (px: number, py: number) => {
        ctx.fillStyle = 'rgba(255,255,255,0.12)'
        ctx.beginPath()
        ctx.arc(px, py, 1.8 * zoom, 0, Math.PI * 2)
        ctx.fill()
      }
      const inset = 0.82
      const rx = (TILE_WIDTH / 2) * zoom * inset
      const ry = (TILE_HEIGHT / 2) * zoom * inset
      rivet(center.x, center.y - ry)
      rivet(center.x + rx, center.y)
      rivet(center.x, center.y + ry)
      rivet(center.x - rx, center.y)

      // Вертикальные кромки боковых граней (лёгкое свечение)
      ctx.strokeStyle = 'rgba(139, 126, 216, 0.18)'
      ctx.lineWidth = 1.5
      ctx.shadowBlur = 8
      ctx.shadowColor = 'rgba(139, 126, 216, 0.2)'
      ctx.beginPath()
      ctx.moveTo(left.x, left.y)
      ctx.lineTo(left.x, left.y + depth)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(right.x, right.y)
      ctx.lineTo(right.x, right.y + depth)
      ctx.stroke()
      ctx.shadowBlur = 0
      ctx.restore()
    }

    /** Панель на верхней грани куба стены (тот же стиль, что у «лаб»-стены на плитке, без X и без ложной глубины depth) */
    const drawPremiumWallRoofDetails = (
      isoX: number,
      topCenterY: number,
      w: number,
      h: number
    ) => {
      const top = { x: isoX, y: topCenterY - h }
      const right = { x: isoX + w, y: topCenterY }
      const bottom = { x: isoX, y: topCenterY + h }
      const left = { x: isoX - w, y: topCenterY }
      const center = { x: isoX, y: topCenterY }

      ctx.save()
      const inset = 0.88
      const rx = w * inset
      const ry = h * inset
      ctx.fillStyle = 'rgba(18,18,28,0.55)'
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(center.x, center.y - ry)
      ctx.lineTo(center.x + rx, center.y)
      ctx.lineTo(center.x, center.y + ry)
      ctx.lineTo(center.x - rx, center.y)
      ctx.closePath()
      ctx.fill()
      ctx.stroke()

      const shine = ctx.createLinearGradient(top.x, top.y, bottom.x, bottom.y)
      shine.addColorStop(0, 'rgba(255,255,255,0.07)')
      shine.addColorStop(0.45, 'rgba(255,255,255,0)')
      shine.addColorStop(1, 'rgba(0,0,0,0.12)')
      ctx.fillStyle = shine
      ctx.beginPath()
      ctx.moveTo(top.x, top.y)
      ctx.lineTo(right.x, right.y)
      ctx.lineTo(bottom.x, bottom.y)
      ctx.lineTo(left.x, left.y)
      ctx.closePath()
      ctx.fill()
      // Внешний контур «крыши» уже обводится в drawIsometricTile (шаг 5)

      const rivet = (px: number, py: number) => {
        ctx.fillStyle = 'rgba(255,255,255,0.12)'
        ctx.beginPath()
        ctx.arc(px, py, 1.8 * zoom, 0, Math.PI * 2)
        ctx.fill()
      }
      const ri = 0.82
      rivet(center.x, center.y - h * ri)
      rivet(center.x + w * ri, center.y)
      rivet(center.x, center.y + h * ri)
      rivet(center.x - w * ri, center.y)
      ctx.restore()
    }

    // Enhanced isometric tile with premium 3D depth
    const drawIsometricTile = (
      x: number,
      y: number,
      color: string,
      type: string,
      opts?: { alpha?: number; heightScale?: number }
    ) => {
      const { isoX, isoY } = gridToIso(x, y)
      const depth = type === 'wall' ? TILE_DEPTH * 3 : TILE_DEPTH

      // Enhanced shadow
      ctx.save()
      ctx.globalAlpha = 0.3 * (opts?.alpha ?? 1)
      ctx.fillStyle = '#000000'
      ctx.filter = 'blur(4px)'
      ctx.beginPath()
      ctx.moveTo(isoX, isoY + depth + 5)
      ctx.lineTo(isoX + TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom + depth + 5)
      ctx.lineTo(isoX, isoY + TILE_HEIGHT * zoom + depth + 5)
      ctx.lineTo(isoX - TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom + depth + 5)
      ctx.closePath()
      ctx.fill()
      ctx.filter = 'none'
      ctx.restore()

      // ——— Стена: заливка + обводка только по видимым рёбрам (не по нижнему краю у пола) ———
      if (type === 'wall') {
        ctx.save()
        ctx.globalAlpha = opts?.alpha ?? 1
        const wh = WALL_HEIGHT * zoom * (opts?.heightScale ?? 1)
        const baseY = isoY + (TILE_HEIGHT / 2) * zoom
        const w = (TILE_WIDTH / 2) * zoom
        const h = (TILE_HEIGHT / 2) * zoom
        const topCenterY = baseY - wh

        const frontColor = '#1c1c2a'
        const sideColorL = '#14141f'
        const sideColorR = '#12121c'

        // 1) Основание — без обводки, чтобы не было линии по стыку с полом
        const floorGrad = ctx.createLinearGradient(
          isoX - TILE_WIDTH / 4 * zoom, isoY,
          isoX + TILE_WIDTH / 4 * zoom, isoY + TILE_HEIGHT * zoom
        )
        floorGrad.addColorStop(0, '#2a2a3e')
        floorGrad.addColorStop(1, '#1a1a2e')
        ctx.fillStyle = floorGrad
        ctx.beginPath()
        ctx.moveTo(isoX, isoY)
        ctx.lineTo(isoX + w, baseY)
        ctx.lineTo(isoX, isoY + TILE_HEIGHT * zoom)
        ctx.lineTo(isoX - w, baseY)
        ctx.closePath()
        ctx.fill()

        // 2) Боковые грани — объёмный градиент (левая темнее)
        const lgL = ctx.createLinearGradient(isoX - w, baseY, isoX, isoY - wh)
        lgL.addColorStop(0, sideColorL)
        lgL.addColorStop(1, '#0c0c14')
        ctx.fillStyle = lgL
        ctx.beginPath()
        ctx.moveTo(isoX - w, baseY)
        ctx.lineTo(isoX - w, baseY - wh)
        ctx.lineTo(isoX, isoY - wh)
        ctx.lineTo(isoX, isoY)
        ctx.closePath()
        ctx.fill()
        const lgR = ctx.createLinearGradient(isoX + w, baseY, isoX, isoY - wh)
        lgR.addColorStop(0, sideColorR)
        lgR.addColorStop(1, '#0a0a12')
        ctx.fillStyle = lgR
        ctx.beginPath()
        ctx.moveTo(isoX + w, baseY)
        ctx.lineTo(isoX + w, baseY - wh)
        ctx.lineTo(isoX, isoY - wh)
        ctx.lineTo(isoX, isoY)
        ctx.closePath()
        ctx.fill()

        // 3) Передняя грань — металл + лёгкий вертикальный sheen
        const overlap = 2
        ctx.beginPath()
        ctx.moveTo(isoX - w, baseY + overlap)
        ctx.lineTo(isoX + w, baseY + overlap)
        ctx.lineTo(isoX + w, baseY - wh)
        ctx.lineTo(isoX - w, baseY - wh)
        ctx.closePath()
        ctx.fillStyle = frontColor
        ctx.fill()
        const frontSheen = ctx.createLinearGradient(isoX - w, baseY - wh, isoX + w, baseY)
        frontSheen.addColorStop(0, 'rgba(255,255,255,0.06)')
        frontSheen.addColorStop(0.35, 'rgba(255,255,255,0)')
        frontSheen.addColorStop(0.7, 'rgba(0,0,0,0.12)')
        frontSheen.addColorStop(1, 'rgba(255,255,255,0.03)')
        ctx.fillStyle = frontSheen
        ctx.fill()

        // 4) Верхняя грань
        const topGrad = ctx.createLinearGradient(
          isoX - TILE_WIDTH / 4 * zoom, topCenterY - h,
          isoX + TILE_WIDTH / 4 * zoom, topCenterY + h
        )
        topGrad.addColorStop(0, '#262638')
        topGrad.addColorStop(1, '#1a1a2a')
        ctx.fillStyle = topGrad
        ctx.beginPath()
        ctx.moveTo(isoX, topCenterY - h)
        ctx.lineTo(isoX + w, topCenterY)
        ctx.lineTo(isoX, topCenterY + h)
        ctx.lineTo(isoX - w, topCenterY)
        ctx.closePath()
        ctx.fill()

        drawPremiumWallRoofDetails(isoX, topCenterY, w, h)

        // 5) Обводка только видимых рёбер: без нижнего края (где стена стыкуется с полом)
        ctx.strokeStyle = 'rgba(139, 126, 216, 0.22)'
        ctx.lineWidth = 1.15
        // Верх передней грани
        ctx.beginPath()
        ctx.moveTo(isoX - w, baseY - wh)
        ctx.lineTo(isoX + w, baseY - wh)
        ctx.stroke()
        // Левое и правое вертикальные рёбра передней грани (не ведём до пола — обрываем чуть выше)
        ctx.beginPath()
        ctx.moveTo(isoX - w, baseY - wh)
        ctx.lineTo(isoX - w, baseY)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(isoX + w, baseY - wh)
        ctx.lineTo(isoX + w, baseY)
        ctx.stroke()
        // Верхние диагонали боковых граней (рёбра «крыши» блока)
        ctx.beginPath()
        ctx.moveTo(isoX - w, baseY - wh)
        ctx.lineTo(isoX, isoY - wh)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(isoX + w, baseY - wh)
        ctx.lineTo(isoX, isoY - wh)
        ctx.stroke()
        // Контур верхней грани (все рёбра верха видны)
        ctx.beginPath()
        ctx.moveTo(isoX, topCenterY - h)
        ctx.lineTo(isoX + w, topCenterY)
        ctx.lineTo(isoX, topCenterY + h)
        ctx.lineTo(isoX - w, topCenterY)
        ctx.closePath()
        ctx.stroke()

        // Угол «в камеру»: общее ребро боковых граней (isoX) + продолжение по центру передней грани до пола
        ctx.strokeStyle = 'rgba(72, 66, 118, 0.62)'
        ctx.lineWidth = 1.4 * zoom
        ctx.lineCap = 'round'
        ctx.beginPath()
        ctx.moveTo(isoX, isoY - wh)
        ctx.lineTo(isoX, baseY + overlap)
        ctx.stroke()
        ctx.lineWidth = 0.9 * zoom
        ctx.strokeStyle = 'rgba(210, 200, 255, 0.2)'
        ctx.beginPath()
        ctx.moveTo(isoX, isoY - wh)
        ctx.lineTo(isoX, baseY + overlap)
        ctx.stroke()

        ctx.restore()
        return
      }

      // Top face with gradient (non-wall)
      ctx.save()
      const topGradient = ctx.createLinearGradient(
        isoX - TILE_WIDTH / 4 * zoom, isoY,
        isoX + TILE_WIDTH / 4 * zoom, isoY + TILE_HEIGHT * zoom
      )
      
      if (type === 'start') {
        topGradient.addColorStop(0, '#8B7ED8')
        topGradient.addColorStop(1, '#B8A9E8')
      } else if (type === 'finish') {
        topGradient.addColorStop(0, '#fbbf24')
        topGradient.addColorStop(1, '#f59e0b')
      } else if (type === 'trap') {
        topGradient.addColorStop(0, '#f87171')
        topGradient.addColorStop(1, '#dc2626')
      } else {
        topGradient.addColorStop(0, '#2a2a3e')
        topGradient.addColorStop(1, '#1a1a2e')
      }
      
      ctx.fillStyle = topGradient
      ctx.beginPath()
      ctx.moveTo(isoX, isoY)
      ctx.lineTo(isoX + TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom)
      ctx.lineTo(isoX, isoY + TILE_HEIGHT * zoom)
      ctx.lineTo(isoX - TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom)
      ctx.closePath()
      ctx.fill()

      // Add glow for special tiles
      if (type === 'start' || type === 'finish' || type === 'trap') {
        ctx.shadowBlur = 30
        ctx.shadowColor = color
        ctx.fill()
        ctx.shadowBlur = 0
      }

      // Stroke with neon effect
      ctx.strokeStyle = type === 'wall' ? '#8B7ED8' : 'rgba(139, 126, 216, 0.4)'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()

      // Left face (3D depth)
      ctx.save()
      const leftGradient = ctx.createLinearGradient(
        isoX - TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom,
        isoX - TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom + depth
      )
      leftGradient.addColorStop(0, type === 'wall' ? '#0a0a15' : '#15152a')
      leftGradient.addColorStop(1, type === 'wall' ? '#050508' : '#0a0a15')
      
      ctx.fillStyle = leftGradient
      ctx.beginPath()
      ctx.moveTo(isoX, isoY + TILE_HEIGHT * zoom)
      ctx.lineTo(isoX - TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom)
      ctx.lineTo(isoX - TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom + depth)
      ctx.lineTo(isoX, isoY + TILE_HEIGHT * zoom + depth)
      ctx.closePath()
      ctx.fill()
      
      if (type === 'wall') {
        ctx.strokeStyle = 'rgba(0, 255, 170, 0.3)'
        ctx.lineWidth = 1
        ctx.stroke()
      }
      ctx.restore()

      // Right face (3D depth)
      ctx.save()
      const rightGradient = ctx.createLinearGradient(
        isoX + TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom,
        isoX + TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom + depth
      )
      rightGradient.addColorStop(0, type === 'wall' ? '#08080d' : '#12122a')
      rightGradient.addColorStop(1, type === 'wall' ? '#030305' : '#08080d')
      
      ctx.fillStyle = rightGradient
      ctx.beginPath()
      ctx.moveTo(isoX, isoY + TILE_HEIGHT * zoom)
      ctx.lineTo(isoX + TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom)
      ctx.lineTo(isoX + TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom + depth)
      ctx.lineTo(isoX, isoY + TILE_HEIGHT * zoom + depth)
      ctx.closePath()
      ctx.fill()
      
      if (type === 'wall') {
        ctx.strokeStyle = 'rgba(139, 126, 216, 0.3)'
        ctx.lineWidth = 1
        ctx.stroke()
      }
      ctx.restore()

      // Lab wall / charging station overlays (readability + theme)
      if (type === 'wall') {
        drawLabWallDetails(ctx, isoX, isoY, depth)
      } else if (type === 'start') {
        drawChargingStation(ctx, isoX, isoY, 'start')
      } else if (type === 'finish') {
        drawChargingStation(ctx, isoX, isoY, 'finish')
      } else if (type === 'trap') {
        drawEnhancedMarker(ctx, isoX, isoY, '⚠', '#f87171', 32)
      }
    }

    const colorForGate = (c?: string) => {
      const cc = (c || '').toLowerCase()
      if (cc === 'orange') return '#fb923c'
      if (cc === 'blue') return '#60a5fa'
      if (cc === 'purple') return '#c084fc'
      if (cc === 'green') return '#34d399'
      if (cc === 'red') return '#f87171'
      if (cc === 'yellow') return '#fbbf24'
      return '#b8a9e8'
    }

    const drawVoid = (x: number, y: number) => {
      const { isoX, isoY } = gridToIso(x, y)
      const { top, right, bottom, left, center } = getTilePoints(isoX, isoY)
      ctx.save()
      // Outer rim
      ctx.fillStyle = 'rgba(0,0,0,0.55)'
      ctx.beginPath()
      ctx.moveTo(top.x, top.y)
      ctx.lineTo(right.x, right.y)
      ctx.lineTo(bottom.x, bottom.y)
      ctx.lineTo(left.x, left.y)
      ctx.closePath()
      ctx.fill()
      // Deep pit gradient
      const pit = ctx.createRadialGradient(center.x, center.y + 10 * zoom, 2 * zoom, center.x, center.y + 10 * zoom, 36 * zoom)
      pit.addColorStop(0, 'rgba(0,0,0,0.9)')
      pit.addColorStop(0.5, 'rgba(10,10,20,0.85)')
      pit.addColorStop(1, 'rgba(0,0,0,0.55)')
      ctx.fillStyle = pit
      ctx.beginPath()
      ctx.moveTo(center.x, center.y - (TILE_HEIGHT / 2) * zoom * 0.65)
      ctx.lineTo(center.x + (TILE_WIDTH / 2) * zoom * 0.65, center.y)
      ctx.lineTo(center.x, center.y + (TILE_HEIGHT / 2) * zoom * 0.65)
      ctx.lineTo(center.x - (TILE_WIDTH / 2) * zoom * 0.65, center.y)
      ctx.closePath()
      ctx.fill()
      // Rim glow
      ctx.strokeStyle = 'rgba(139,126,216,0.22)'
      ctx.lineWidth = 2
      ctx.shadowBlur = 18
      ctx.shadowColor = 'rgba(139,126,216,0.25)'
      ctx.beginPath()
      ctx.moveTo(top.x, top.y)
      ctx.lineTo(right.x, right.y)
      ctx.lineTo(bottom.x, bottom.y)
      ctx.lineTo(left.x, left.y)
      ctx.closePath()
      ctx.stroke()
      ctx.restore()
    }

    const drawBrokenCracks = (x: number, y: number) => {
      const { isoX, isoY } = gridToIso(x, y)
      const { top, right, bottom, left, center } = getTilePoints(isoX, isoY)
      ctx.save()

      // Clean "tempered glass" panel: subtle inset + a few crisp cracks (no noisy pattern)
      drawInsetDiamond(ctx, isoX, isoY, 0.9, 'rgba(0,0,0,0.18)', 'rgba(255,255,255,0.07)', 1)
      ctx.shadowBlur = 14
      ctx.shadowColor = 'rgba(251, 191, 36, 0.11)'
      drawInsetDiamond(ctx, isoX, isoY, 0.72, 'rgba(251,191,36,0.045)', 'rgba(251, 191, 36, 0.14)', 1.5)
      ctx.shadowBlur = 0

      // Cracks (thin + readable)
      ctx.strokeStyle = 'rgba(251, 191, 36, 0.40)'
      ctx.shadowBlur = 8
      ctx.shadowColor = 'rgba(251, 191, 36, 0.12)'
      ctx.lineWidth = 1.25 * zoom
      const crack = (pts: Array<[number, number]>) => {
        ctx.beginPath()
        ctx.moveTo(pts[0][0], pts[0][1])
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
        ctx.stroke()
      }
      const fx = center.x - 2 * zoom
      const fy = center.y + 2 * zoom
      crack([[fx, fy], [fx - 10 * zoom, fy - 12 * zoom], [fx - 18 * zoom, fy - 8 * zoom]])
      crack([[fx, fy], [fx + 14 * zoom, fy - 10 * zoom], [fx + 20 * zoom, fy - 4 * zoom]])
      crack([[fx, fy], [fx + 6 * zoom, fy + 10 * zoom], [fx + 14 * zoom, fy + 14 * zoom]])

      // Tiny edge ticks (very subtle)
      ctx.shadowBlur = 0
      ctx.strokeStyle = 'rgba(255,255,255,0.07)'
      ctx.lineWidth = 1 * zoom
      ctx.beginPath()
      ctx.moveTo(top.x + (right.x - top.x) * 0.28, top.y + (right.y - top.y) * 0.28)
      ctx.lineTo(top.x + (right.x - top.x) * 0.34, top.y + (right.y - top.y) * 0.34)
      ctx.moveTo(left.x + (bottom.x - left.x) * 0.66, left.y + (bottom.y - left.y) * 0.66)
      ctx.lineTo(left.x + (bottom.x - left.x) * 0.72, left.y + (bottom.y - left.y) * 0.72)
      ctx.stroke()
      ctx.restore()
    }

    const drawLever = (x: number, y: number, color: string, on: boolean) => {
      const { isoX, isoY } = gridToIso(x, y)
      const glow = on ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'
      const floorFill = on ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.16)'
      // Neon floor plate
      drawInsetDiamond(ctx, isoX, isoY, 0.9, 'rgba(0,0,0,0.28)', 'rgba(255,255,255,0.08)', 1)
      drawInsetDiamond(ctx, isoX, isoY, 0.76, floorFill, glow, 2)
      const { center } = getTilePoints(isoX, isoY)

      // Lever base
      ctx.save()
      ctx.shadowBlur = 16
      ctx.shadowColor = glow
      ctx.fillStyle = 'rgba(10,10,18,0.85)'
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      ctx.lineWidth = 1.2
      ctx.beginPath()
      ctx.ellipse(center.x, center.y, 10 * zoom, 6 * zoom, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()

      // Lever handle (tilts based on state)
      const tilt = on ? -0.6 : 0.6
      ctx.translate(center.x, center.y - 2 * zoom)
      ctx.rotate(tilt)
      ctx.strokeStyle = color
      ctx.lineWidth = 3.2 * zoom
      ctx.beginPath()
      ctx.moveTo(-1 * zoom, 0)
      ctx.lineTo(0, -14 * zoom)
      ctx.stroke()
      // knob
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(0, -16 * zoom, 3.4 * zoom, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }

    type Pt = { x: number; y: number }
    const lerpPt = (a: Pt, b: Pt, t: number): Pt => ({
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    })

    /**
     * Шлюз вдоль РЕАЛЬНОГО ребра между клетками (изометрия): портал между проходимым соседом и этой клеткой.
     * Если portal == null — запасной вариант по «передней» грани блока.
     */
    const drawGateClosedOverlay = (
      gx: number,
      gy: number,
      color: string,
      portal: { p0: Pt; p1: Pt } | null,
      heightScale = 1
    ) => {
      const wh = WALL_HEIGHT * zoom * heightScale
      const { isoX, isoY } = gridToIso(gx, gy)
      const baseY = isoY + (TILE_HEIGHT / 2) * zoom
      const w = (TILE_WIDTH / 2) * zoom

      const drawAirlockPortal = (p0: Pt, p1: Pt) => {
        // Без смещения по нормали: четырёхугольник строго в плоскости ребра клетки —
        // при повороте карты остаётся частью блока, не «плывёт» относительно стены.
        const o0 = { x: p0.x, y: p0.y }
        const o1 = { x: p1.x, y: p1.y }
        const o0t: Pt = { x: o0.x, y: o0.y - wh }
        const o1t: Pt = { x: o1.x, y: o1.y - wh }
        const midB = lerpPt(o0, o1, 0.5)
        const midT = lerpPt(o0t, o1t, 0.5)

        // «Толщина» рамы в сторону прохода (видимые боковины + порог), не сдвигая основной проём
        const ex = o1.x - o0.x
        const ey = o1.y - o0.y
        const elen = Math.hypot(ex, ey) || 1
        let nx = -ey / elen
        let ny = ex / elen
        const towardEdge = { x: midB.x - isoX, y: midB.y - baseY }
        if (nx * towardEdge.x + ny * towardEdge.y < 0) {
          nx = -nx
          ny = -ny
        }
        const thick = 3.4 * zoom
        const d0 = { x: o0.x + nx * thick, y: o0.y + ny * thick }
        const d1 = { x: o1.x + nx * thick, y: o1.y + ny * thick }
        const d0t: Pt = { x: d0.x, y: d0.y - wh }
        const d1t: Pt = { x: d1.x, y: d1.y - wh }

        ctx.save()
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        // 1) Тёмные грани объёма рамы (сначала фон)
        const sideFill = 'rgba(6,6,12,0.92)'
        const sideEdge = 'rgba(139, 126, 216, 0.14)'
        ctx.fillStyle = sideFill
        ctx.beginPath()
        ctx.moveTo(o0.x, o0.y)
        ctx.lineTo(d0.x, d0.y)
        ctx.lineTo(d0t.x, d0t.y)
        ctx.lineTo(o0t.x, o0t.y)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = sideEdge
        ctx.lineWidth = 0.85 * zoom
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(o1.x, o1.y)
        ctx.lineTo(o1t.x, o1t.y)
        ctx.lineTo(d1t.x, d1t.y)
        ctx.lineTo(d1.x, d1.y)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()
        ctx.fillStyle = 'rgba(5,5,10,0.94)'
        ctx.beginPath()
        ctx.moveTo(o0.x, o0.y)
        ctx.lineTo(o1.x, o1.y)
        ctx.lineTo(d1.x, d1.y)
        ctx.lineTo(d0.x, d0.y)
        ctx.closePath()
        ctx.fill()
        ctx.strokeStyle = 'rgba(139, 126, 216, 0.12)'
        ctx.stroke()

        // Поле шлюза (тёмный металл + энерго-затвор)
        ctx.beginPath()
        ctx.moveTo(o0.x, o0.y)
        ctx.lineTo(o1.x, o1.y)
        ctx.lineTo(o1t.x, o1t.y)
        ctx.lineTo(o0t.x, o0t.y)
        ctx.closePath()
        // Та же «металл» что у передней грани стены + лёгкий оттенок цвета шлюза
        const gFill = ctx.createLinearGradient(midB.x, midB.y, midT.x, midT.y)
        gFill.addColorStop(0, 'rgba(28,28,42,0.94)')
        gFill.addColorStop(0.45, 'rgba(26,26,38,0.9)')
        gFill.addColorStop(1, 'rgba(18,18,28,0.93)')
        ctx.fillStyle = gFill
        ctx.fill()
        ctx.save()
        ctx.globalCompositeOperation = 'multiply'
        ctx.fillStyle = color
        ctx.globalAlpha = 0.12
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.globalCompositeOperation = 'source-over'
        ctx.restore()

        ctx.save()
        ctx.clip()
        const pulse = 0.5 + 0.5 * Math.sin(Date.now() / 320)
        const veil = ctx.createLinearGradient(midB.x, midB.y, midT.x, midT.y)
        veil.addColorStop(0, `rgba(255,255,255,${0.02 + pulse * 0.02})`)
        veil.addColorStop(0.5, 'rgba(120,200,255,0.04)')
        veil.addColorStop(1, 'rgba(255,255,255,0.02)')
        ctx.fillStyle = veil
        ctx.fillRect(
          Math.min(o0.x, o1.x, o0t.x, o1t.x) - 4,
          Math.min(o0.y, o1.y, o0t.y, o1t.y) - 4,
          200 * zoom,
          200 * zoom
        )

        // Барьер: меньше полос, мягче — читается как объёмное поле, не «решётка»
        for (let i = 0; i < 5; i++) {
          const t = (i + 0.5) / 5
          const b = lerpPt(o0, o1, t)
          const tp = lerpPt(o0t, o1t, t)
          const g = ctx.createLinearGradient(b.x, b.y, tp.x, tp.y)
          g.addColorStop(0, 'rgba(255,255,255,0)')
          g.addColorStop(0.5, 'rgba(255,255,255,0.11)')
          g.addColorStop(1, 'rgba(255,255,255,0)')
          ctx.strokeStyle = g
          ctx.lineWidth = 2.1 * zoom
          ctx.beginPath()
          ctx.moveTo(b.x, b.y + 6 * zoom)
          ctx.lineTo(tp.x, tp.y - 6 * zoom)
          ctx.stroke()
        }

        // Сканирующая линия (поперёк проёма)
        const scanT = (Math.sin(Date.now() / 240) * 0.5 + 0.5)
        const sb = lerpPt(o0, o1, scanT)
        const st = lerpPt(o0t, o1t, scanT)
        ctx.strokeStyle = 'rgba(255,255,255,0.18)'
        ctx.lineWidth = 2 * zoom
        ctx.shadowBlur = 8
        ctx.shadowColor = color
        ctx.beginPath()
        ctx.moveTo(sb.x, sb.y)
        ctx.lineTo(st.x, st.y)
        ctx.stroke()
        ctx.shadowBlur = 0
        ctx.restore()

        // Рама: тоньше и ближе к обводке стены, акцент — цвет шлюза
        ctx.shadowBlur = 6
        ctx.shadowColor = color
        ctx.strokeStyle = color
        ctx.lineWidth = 2.4 * zoom
        ctx.globalAlpha = 0.92
        ctx.beginPath()
        ctx.moveTo(o0.x, o0.y)
        ctx.lineTo(o0t.x, o0t.y)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(o1.x, o1.y)
        ctx.lineTo(o1t.x, o1t.y)
        ctx.stroke()
        ctx.lineWidth = 2 * zoom
        ctx.beginPath()
        ctx.moveTo(o0t.x, o0t.y)
        ctx.lineTo(o1t.x, o1t.y)
        ctx.stroke()
        ctx.lineWidth = 1.85 * zoom
        ctx.beginPath()
        ctx.moveTo(o0.x, o0.y)
        ctx.lineTo(o1.x, o1.y)
        ctx.stroke()
        ctx.shadowBlur = 0
        ctx.globalAlpha = 1

        ctx.strokeStyle = 'rgba(139, 126, 216, 0.28)'
        ctx.lineWidth = 1 * zoom
        ctx.beginPath()
        ctx.moveTo(o0.x, o0.y)
        ctx.lineTo(o0t.x, o0t.y)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(o1.x, o1.y)
        ctx.lineTo(o1t.x, o1t.y)
        ctx.stroke()

        // Внутренняя «обойма»
        ctx.globalAlpha = 0.45
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'
        ctx.lineWidth = 1.2 * zoom
        ctx.beginPath()
        ctx.moveTo(lerpPt(o0, o1, 0.08).x, lerpPt(o0, o1, 0.08).y)
        ctx.lineTo(lerpPt(o0t, o1t, 0.08).x, lerpPt(o0t, o1t, 0.08).y)
        ctx.lineTo(lerpPt(o0t, o1t, 0.92).x, lerpPt(o0t, o1t, 0.92).y)
        ctx.lineTo(lerpPt(o0, o1, 0.92).x, lerpPt(o0, o1, 0.92).y)
        ctx.closePath()
        ctx.stroke()
        ctx.globalAlpha = 1

        // Угловые «заклёпки» рамы
        const riv = (px: number, py: number) => {
          ctx.fillStyle = 'rgba(255,255,255,0.2)'
          ctx.strokeStyle = color
          ctx.lineWidth = 0.9 * zoom
          ctx.beginPath()
          ctx.arc(px, py, 1.9 * zoom, 0, Math.PI * 2)
          ctx.fill()
          ctx.stroke()
        }
        riv(o0.x, o0.y)
        riv(o1.x, o1.y)
        riv(o0t.x, o0t.y)
        riv(o1t.x, o1t.y)

        ctx.restore()
      }

      /**
       * Замок строго в плоскости ромба крыши: x' = isoX + u·w, y' = topCenterY + v·hFace
       * (u вдоль правого ребра ромба, v — к нижней вершине), без произвольного skew — не «кривится».
       */
      const drawGateLockOnRoof = (portalMidFloor: Pt | null) => {
        const topCenterY = baseY - wh
        const hFace = (TILE_HEIGHT / 2) * zoom

        let du = 0
        let dv = 0
        if (portalMidFloor) {
          du = Math.max(-0.24, Math.min(0.24, ((portalMidFloor.x - isoX) / w) * 0.3))
          dv = Math.max(-0.2, Math.min(0.2, ((portalMidFloor.y - baseY) / hFace) * 0.25))
        }
        // Ближе к «задней» части крыши (к верхней вершине ромба), не висит над просветом
        dv -= 0.1

        ctx.save()
        ctx.shadowBlur = 0
        ctx.translate(isoX, topCenterY)
        ctx.transform(w, 0, 0, hFace, 0, 0)
        ctx.translate(du, dv)
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'

        const lw = Math.max(0.03, 1.5 / w)
        ctx.lineWidth = lw
        ctx.strokeStyle = color

        // Лёгкая тень на плоскости крыши (эллипс в локальных осях ромба)
        ctx.fillStyle = 'rgba(0,0,0,0.35)'
        ctx.beginPath()
        ctx.ellipse(0, 0.1, 0.14, 0.06, 0, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = 'rgba(0,0,0,0.5)'
        const lx = -0.13
        const ly = 0.02
        const rw = 0.26
        const rh = 0.17
        const rad = 0.035
        ctx.beginPath()
        ctx.moveTo(lx + rad, ly)
        ctx.lineTo(lx + rw - rad, ly)
        ctx.quadraticCurveTo(lx + rw, ly, lx + rw, ly + rad)
        ctx.lineTo(lx + rw, ly + rh - rad)
        ctx.quadraticCurveTo(lx + rw, ly + rh, lx + rw - rad, ly + rh)
        ctx.lineTo(lx + rad, ly + rh)
        ctx.quadraticCurveTo(lx, ly + rh, lx, ly + rh - rad)
        ctx.lineTo(lx, ly + rad)
        ctx.quadraticCurveTo(lx, ly, lx + rad, ly)
        ctx.closePath()
        ctx.fill()
        ctx.stroke()

        const sh = 0.052
        ctx.beginPath()
        ctx.arc(lx + rw / 2, ly, sh, Math.PI, 0)
        ctx.stroke()

        ctx.restore()
      }

      // Fallback: старая ориентация по передней грани столба
      const drawFallbackFrontFace = () => {
        const faceBR = { x: isoX + w, y: baseY }
        const faceBL = { x: isoX - w, y: baseY }
        drawAirlockPortal(faceBL, faceBR)
      }

      ctx.save()
      let portalMid: Pt | null = null
      if (portal) {
        portalMid = lerpPt(portal.p0, portal.p1, 0.5)
        drawAirlockPortal(portal.p0, portal.p1)
      } else {
        portalMid = { x: isoX, y: baseY }
        drawFallbackFrontFace()
      }
      drawGateLockOnRoof(portalMid)
      ctx.restore()
    }

    const drawGateOpenOverlay = (x: number, y: number, color: string) => {
      const { isoX, isoY } = gridToIso(x, y)
      const { top, right, bottom, left, center } = getTilePoints(isoX, isoY)
      ctx.save()

      // Lowered gate: understated reinforced plate + thin colored rail
      ctx.shadowBlur = 12
      ctx.shadowColor = color
      drawInsetDiamond(ctx, isoX, isoY, 0.9, 'rgba(0,0,0,0.22)', 'rgba(255,255,255,0.07)', 1)
      drawInsetDiamond(ctx, isoX, isoY, 0.74, 'rgba(0,0,0,0.10)', 'rgba(255,255,255,0.10)', 1)

      // Corner chevrons (hint of mechanism)
      ctx.shadowBlur = 0
      ctx.strokeStyle = 'rgba(255,255,255,0.10)'
      ctx.lineWidth = 1.15 * zoom
      const chevron = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
        ctx.beginPath()
        ctx.moveTo(ax, ay)
        ctx.lineTo(bx, by)
        ctx.lineTo(cx, cy)
        ctx.stroke()
      }
      chevron(center.x - 18 * zoom, center.y - 2 * zoom, center.x - 10 * zoom, center.y - 8 * zoom, center.x - 2 * zoom, center.y - 2 * zoom)
      chevron(center.x + 18 * zoom, center.y - 2 * zoom, center.x + 10 * zoom, center.y - 8 * zoom, center.x + 2 * zoom, center.y - 2 * zoom)
      chevron(center.x - 18 * zoom, center.y + 8 * zoom, center.x - 10 * zoom, center.y + 14 * zoom, center.x - 2 * zoom, center.y + 8 * zoom)
      chevron(center.x + 18 * zoom, center.y + 8 * zoom, center.x + 10 * zoom, center.y + 14 * zoom, center.x + 2 * zoom, center.y + 8 * zoom)

      // Rail around the tile perimeter
      ctx.strokeStyle = color
      ctx.lineWidth = 1.7 * zoom
      ctx.shadowBlur = 10
      ctx.shadowColor = color
      ctx.beginPath()
      ctx.moveTo(top.x, top.y)
      ctx.lineTo(right.x, right.y)
      ctx.lineTo(bottom.x, bottom.y)
      ctx.lineTo(left.x, left.y)
      ctx.closePath()
      ctx.stroke()
      ctx.restore()
    }

    const drawSmartMine = (x: number, y: number, dir: number, _progress: number) => {
      const { isoX, isoY } = gridToIso(x, y)
      const bob = Math.sin((Date.now() / 220) + x * 0.7 + y * 0.9) * 2.5 * zoom
      const by = isoY + (TILE_HEIGHT / 2) * zoom - 10 * zoom + bob
      const angle = (dir ?? 0) * (Math.PI / 2)
      ctx.save()
      // body
      ctx.translate(isoX, by)
      ctx.fillStyle = '#171723'
      ctx.strokeStyle = 'rgba(251,191,36,0.55)'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.ellipse(0, 0, 12 * zoom, 9 * zoom, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 18
      ctx.shadowColor = 'rgba(251,191,36,0.35)'
      ctx.stroke()
      // eye
      ctx.rotate(angle)
      ctx.fillStyle = '#fbbf24'
      ctx.beginPath()
      ctx.arc(7 * zoom, -1 * zoom, 2.2 * zoom, 0, Math.PI * 2)
      ctx.fill()
      // legs spikes
      ctx.rotate(-angle)
      ctx.shadowBlur = 0
      ctx.strokeStyle = 'rgba(255,255,255,0.12)'
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        ctx.beginPath()
        ctx.moveTo(Math.cos(a) * 10 * zoom, Math.sin(a) * 7 * zoom)
        ctx.lineTo(Math.cos(a) * 15 * zoom, Math.sin(a) * 10 * zoom)
        ctx.stroke()
      }
      ctx.restore()
    }

    const drawEnhancedMarker = (ctx: CanvasRenderingContext2D, x: number, y: number, symbol: string, color: string, size: number) => {
      const cy = y + TILE_HEIGHT / 2 * zoom
      ctx.save()
      ctx.globalAlpha = 1
      ctx.font = `bold ${size * zoom}px Arial`
      ctx.fillStyle = color
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(symbol, x, cy)
      ctx.restore()
    }


    // Вектор в «видовых» координатах при текущем повороте: куда сдвинуться из (vx,vy) по направлению d (0=N,1=E,2=S,3=W)
    const getViewDelta = (d: number) => {
      const dx = d === 1 ? 1 : d === 3 ? -1 : 0
      const dy = d === 0 ? -1 : d === 2 ? 1 : 0
      switch (rotationDeg) {
        case 90:  return { dvx: -dy, dvy: dx }
        case 180: return { dvx: -dx, dvy: -dy }
        case 270: return { dvx: dy, dvy: -dx }
        default:  return { dvx: dx, dvy: dy }
      }
    }
    // Угол стрелки: в сторону соседней клетки в экранных координатах (с учётом поворота вида); стрелка по умолчанию «вверх»
    const getDirectionAngleWithView = (d: number) => {
      const { dvx, dvy } = getViewDelta(d)
      const w = TILE_WIDTH / 2
      const h = TILE_HEIGHT / 2
      const isoDx = (dvx - dvy) * w
      const isoDy = (dvx + dvy) * h
      const angleFromRight = Math.atan2(isoDy, isoDx)
      const upAngle = -Math.PI / 2
      return angleFromRight - upAngle
    }

    // Клетка робота: весь ромб клетки залит одним цветом и обведён — сразу видно, на какой клетке стоит
    const drawRobotCellHighlight = (x: number, y: number) => {
      const { isoX, isoY } = gridToIso(x, y)
      const w = (TILE_WIDTH / 2) * zoom
      const baseY = isoY + (TILE_HEIGHT / 2) * zoom
      ctx.save()
      ctx.globalAlpha = 1
      ctx.fillStyle = '#1e1a2e'
      ctx.beginPath()
      ctx.moveTo(isoX, isoY)
      ctx.lineTo(isoX + w, baseY)
      ctx.lineTo(isoX, isoY + TILE_HEIGHT * zoom)
      ctx.lineTo(isoX - w, baseY)
      ctx.closePath()
      ctx.fill()
      ctx.strokeStyle = '#6b5b8a'
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.restore()
    }

    // Робот: стоит на полу клетки (ноги на уровне пола), компактный 3D-корпус, экран со стрелкой
    const drawRobot = (x: number, y: number, direction: number, _progress: number = 1) => {
      const { isoX, isoY } = gridToIso(x, y)
      const floorY = isoY + (TILE_HEIGHT / 2) * zoom // уровень пола клетки
      const legHeight = 16 * zoom
      const robotBaseY = floorY - legHeight // низ ног = floorY, верх ног = robotBaseY

      ctx.save()
      ctx.globalAlpha = 1

      drawRobotCellHighlight(x, y)

      const angle = getDirectionAngleWithView(direction)

      // Тень на полу под ногами (на уровне пола)
      ctx.fillStyle = '#08080c'
      ctx.beginPath()
      ctx.ellipse(isoX, floorY + 4 * zoom, 16 * zoom, 6 * zoom, 0, 0, Math.PI * 2)
      ctx.fill()

      // Ноги — стоят на полу (низ ног на floorY)
      ctx.fillStyle = '#3d3d52'
      ctx.fillRect(isoX - 9 * zoom, robotBaseY, 6 * zoom, legHeight)
      ctx.fillRect(isoX + 3 * zoom, robotBaseY, 6 * zoom, legHeight)

      // Корпус: перед + боковая грань (опирается на ноги)
      const bw = 20 * zoom
      const bh = 18 * zoom
      const bx = isoX - bw / 2
      const by = robotBaseY - bh
      ctx.fillStyle = '#5a5278'
      ctx.fillRect(bx, by, bw, bh)
      ctx.fillStyle = '#484860'
      ctx.beginPath()
      ctx.moveTo(bx + bw, by + bh)
      ctx.lineTo(bx + bw, by)
      ctx.lineTo(bx + bw + 8 * zoom, by - 4 * zoom)
      ctx.lineTo(bx + bw + 8 * zoom, by + bh - 4 * zoom)
      ctx.closePath()
      ctx.fill()

      // Голова: экран (тёмный прямоугольник + стрелка «куда смотрит»)
      const headW = 16 * zoom
      const headH = 12 * zoom
      const headX = isoX - headW / 2
      const headY = by - headH - 2 * zoom
      ctx.fillStyle = '#0f0f18'
      ctx.fillRect(headX, headY, headW, headH)
      ctx.strokeStyle = '#4a4a62'
      ctx.lineWidth = 1
      ctx.strokeRect(headX, headY, headW, headH)
      ctx.save()
      ctx.translate(isoX, headY + headH / 2)
      ctx.rotate(angle)
      ctx.fillStyle = '#34d399'
      ctx.beginPath()
      ctx.moveTo(0, -4 * zoom)
      ctx.lineTo(3 * zoom, 3 * zoom)
      ctx.lineTo(-3 * zoom, 3 * zoom)
      ctx.closePath()
      ctx.fill()
      ctx.restore()
      ctx.fillStyle = '#383850'
      ctx.beginPath()
      ctx.moveTo(headX + headW, headY + headH)
      ctx.lineTo(headX + headW, headY)
      ctx.lineTo(headX + headW + 5 * zoom, headY - 2 * zoom)
      ctx.lineTo(headX + headW + 5 * zoom, headY + headH - 2 * zoom)
      ctx.closePath()
      ctx.fill()

      ctx.restore()
    }

    const render = () => {
      ctx.clearRect(0, 0, viewW, viewH)
      ctx.save()
      ctx.translate(pan.x, pan.y)

      // Порядок по глубине vx+vy: робот и его клетка рисуются на своей глубине, стены спереди их перекрывают
      const stepIndex = robotHistory.length > 0 ? Math.min(Math.floor(currentStepRef.current), robotHistory.length - 1) : 0
      const robotPos = robotHistory.length > 0
        ? (() => { const s = Math.min(Math.floor(currentStepRef.current), robotHistory.length - 1); const [rx, ry] = robotHistory[s]; return { x: rx, y: ry } })()
        : (startCell ? { x: startCell.x, y: startCell.y } : null)
      const robotDir = robotHistory.length > 0
        ? robotHistory[Math.min(Math.floor(currentStepRef.current), robotHistory.length - 1)][2]
        : 0
      const robotProgress = robotHistory.length > 0 ? currentStepRef.current - Math.floor(currentStepRef.current) : 1

      const minePos = mineHistory.length > 0
        ? (() => { const s = Math.min(stepIndex, mineHistory.length - 1); const [mx, my] = mineHistory[s]; return { x: mx, y: my } })()
        : null
      const mineDir = mineHistory.length > 0
        ? mineHistory[Math.min(stepIndex, mineHistory.length - 1)][2]
        : 0

      const gateStateByColor = gatesHistory.length > 0
        ? gatesHistory[Math.min(stepIndex, gatesHistory.length - 1)] ?? {}
        : {}

      /** Проходимая клетка для ориентации шлюза (стена / закрытый шлюз блокируют проход). */
      const isWalkableForGatePortal = (nx: number, ny: number): boolean => {
        if (nx < 0 || ny < 0 || nx >= mapData.width || ny >= mapData.height) return false
        const raw = mapData.cells?.[ny]?.[nx]
        const cl = (raw || 'platform').toString().toLowerCase()
        const tt = cl === 'empty' ? 'platform' : cl
        if (tt === 'void') return false
        const o = objectsAt.get(`${nx},${ny}`) ?? []
        if (o.some((ob) => ob.type === 'wall')) return false
        const g = o.find((ob) => ob.type === 'gate')
        if (g) {
          const gc = (g.color || '').toLowerCase()
          const open = gateStateByColor[gc] ?? g.open ?? false
          if (!open) return false
        }
        return true
      }

      /** Ребро ромба пола между клеткой шлюза и первым проходимым соседом (изометрия). */
      const getGatePortalEdge = (gx: number, gy: number): { p0: Pt; p1: Pt } | null => {
        const { isoX, isoY } = gridToIso(gx, gy)
        const baseY = isoY + (TILE_HEIGHT / 2) * zoom
        const w = (TILE_WIDTH / 2) * zoom
        const top: Pt = { x: isoX, y: isoY }
        const right: Pt = { x: isoX + w, y: baseY }
        const bottom: Pt = { x: isoX, y: isoY + TILE_HEIGHT * zoom }
        const left: Pt = { x: isoX - w, y: baseY }
        const cands: Array<{ nx: number; ny: number; p0: Pt; p1: Pt }> = [
          { nx: gx + 1, ny: gy, p0: right, p1: bottom },
          { nx: gx - 1, ny: gy, p0: top, p1: left },
          { nx: gx, ny: gy + 1, p0: left, p1: bottom },
          { nx: gx, ny: gy - 1, p0: top, p1: right },
        ]
        for (const c of cands) {
          if (isWalkableForGatePortal(c.nx, c.ny)) return { p0: c.p0, p1: c.p1 }
        }
        return null
      }

      const robotView = robotPos ? gridToView(robotPos.x, robotPos.y) : null
      const robotDepth = robotView ? (robotView.vx + robotView.vy) : null

      // Walls in front of the robot become translucent/shorter to keep interior readable.
      const getWallCutaway = (gx: number, gy: number) => {
        if (!cutawayWalls || !robotView || robotDepth == null) return { alpha: 1, heightScale: 1 }
        const { vx, vy } = gridToView(gx, gy)
        const depth = vx + vy
        const dManhattan = Math.abs(vx - robotView.vx) + Math.abs(vy - robotView.vy)
        const inFront = depth >= robotDepth
        if (!inFront) return { alpha: 1, heightScale: 1 }

        // Strong cutaway when the wall is close and in front; gentle fade for slightly further walls.
        if (dManhattan <= 3) return { alpha: 0.16, heightScale: 0.28 }
        if (dManhattan <= 5) return { alpha: 0.26, heightScale: 0.42 }
        if (dManhattan <= 7) return { alpha: 0.42, heightScale: 0.65 }
        return { alpha: 1, heightScale: 1 }
      }

      const tiles: { x: number; y: number; vx: number; vy: number }[] = []
      for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
          const { vx, vy } = gridToView(x, y)
          tiles.push({ x, y, vx, vy })
        }
      }
      tiles.sort((a, b) => (a.vx + a.vy) - (b.vx + b.vy))

      for (const { x, y } of tiles) {
        const raw = mapData.cells?.[y]?.[x]
        const cellLower = (raw || 'platform').toString().toLowerCase()
        const tileType = (cellLower === 'empty' ? 'platform' : cellLower)
        const objs = objectsAt.get(`${x},${y}`) ?? []

        const wallObj = objs.find(o => o.type === 'wall') ?? (tileType === 'wall' ? ({ type: 'wall', x, y } as any) : undefined)
        const startObj = objs.find(o => o.type === 'start') ?? (tileType === 'start' ? ({ type: 'start', x, y } as any) : undefined)
        const finishObj = objs.find(o => o.type === 'finish') ?? (tileType === 'finish' ? ({ type: 'finish', x, y } as any) : undefined)
        const leverObj = objs.find(o => o.type === 'lever')
        const gateObj = objs.find(o => o.type === 'gate')
        const gateColor = gateObj?.color
        const gateOpen = gateObj
          ? (gateStateByColor[(gateColor || '').toLowerCase()] ?? gateObj.open ?? false)
          : false

        // 1) Base tile
        if (tileType === 'void') {
          drawVoid(x, y)
        } else {
          // walls/closed gates draw as wall blocks
          if (wallObj || (gateObj && !gateOpen)) {
            const cut = getWallCutaway(x, y)
            drawIsometricTile(x, y, '#0f0f1a', 'wall', cut)
            // Gate overlay stays readable even when wall is cut away
            if (gateObj && !gateOpen) {
              ctx.save()
              ctx.globalAlpha = Math.max(0.65, cut.alpha)
              const portalEdge = getGatePortalEdge(x, y)
              drawGateClosedOverlay(x, y, colorForGate(gateColor), portalEdge, cut.heightScale ?? 1)
              ctx.restore()
            }
          } else {
            drawIsometricTile(x, y, '#1a1a2e', 'platform')
            if (tileType === 'broken_floor') drawBrokenCracks(x, y)
            if (gateObj && gateOpen) drawGateOpenOverlay(x, y, colorForGate(gateColor))
          }
        }

        // 2) Object overlays
        if (startObj) drawChargingStation(ctx, gridToIso(x, y).isoX, gridToIso(x, y).isoY, 'start')
        if (finishObj) drawChargingStation(ctx, gridToIso(x, y).isoX, gridToIso(x, y).isoY, 'finish')
        if (leverObj) {
          const c = (leverObj.color || '').toLowerCase()
          const on = (gateStateByColor[c] ?? leverObj.on) ? true : false
          drawLever(x, y, colorForGate(leverObj.color), on)
        }

        // Робот рисуется сразу после своей клетки по глубине — стены с большей глубиной нарисуются поверх
        if (robotPos && robotPos.x === x && robotPos.y === y) {
          drawRobot(x, y, robotDir, robotProgress)
        }
        if (minePos && minePos.x === x && minePos.y === y) {
          drawSmartMine(x, y, mineDir, robotProgress)
        }
      }

      ctx.restore()
    }

    // Animation loop
    const animate = () => {
      if (currentStepRef.current < robotHistory.length - 1) {
        currentStepRef.current += 0.2 // Slower animation for smoothness
        render()
        animationRef.current = requestAnimationFrame(animate)
      } else {
        render()
      }
    }

    if (robotHistory.length > 0) {
      currentStepRef.current = 0
      animate()
    } else {
      render()
    }

    // Continuous animation for effects
    const continuousAnimate = () => {
      render()
      requestAnimationFrame(continuousAnimate)
    }
    continuousAnimate()

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [mapData, robotHistory, mineHistory, gatesHistory, zoom, pan, startCell, rotationDeg, objectsAt, cutawayWalls])

  return (
    <div className="isometric-canvas-wrapper">
      <div className="canvas-controls">
        <motion.button
          className="control-btn"
          onClick={() => setCutawayWalls((v) => !v)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          title="Автоматически «срезать» стены перед роботом"
        >
          <span className="control-icon">▱</span>
          {cutawayWalls ? 'Срез стен: ВКЛ' : 'Срез стен: ВЫКЛ'}
        </motion.button>
        
        <div className="zoom-controls">
          <motion.button
            className="control-btn"
            onClick={() => setRotationDeg((r) => (r + 90) % 360)}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Повернуть поле"
          >
            <span className="control-icon">↻</span>
            Поворот
          </motion.button>
          <motion.button
            className="control-btn"
            onClick={() => setZoom(Math.min(zoom + 0.1, 2))}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <span className="control-icon">+</span>
          </motion.button>
          <span className="zoom-level">{Math.round(zoom * 100)}%</span>
          <motion.button
            className="control-btn"
            onClick={() => setZoom(Math.max(zoom - 0.1, 0.5))}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
          >
            <span className="control-icon">−</span>
          </motion.button>
          <motion.button
            className="control-btn"
            onClick={() => { setPan({ x: 0, y: 0 }); setZoom(1); setRotationDeg(0) }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Сбросить вид"
          >
            <span className="control-icon">⌂</span>
            Сброс
          </motion.button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="isometric-canvas-container"
        onWheel={(e) => {
          e.preventDefault()
          setZoom((z) => Math.min(2, Math.max(0.5, z - e.deltaY * 0.002)))
        }}
        onMouseDown={(e) => {
          if (e.button === 0) {
            setIsDragging(true)
            dragStart.current = { x: e.clientX, y: e.clientY, panX: pan.x, panY: pan.y }
          }
        }}
        onMouseMove={(e) => {
          if (dragStart.current) {
            setPan({
              x: dragStart.current.panX + e.clientX - dragStart.current.x,
              y: dragStart.current.panY + e.clientY - dragStart.current.y,
            })
          }
        }}
        onMouseUp={() => { setIsDragging(false); dragStart.current = null }}
        onMouseLeave={() => { setIsDragging(false); dragStart.current = null }}
        style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
      >
        <canvas ref={canvasRef} className="isometric-canvas" />
        
        {/* Holographic overlay effect */}
        <div className="holo-overlay" />
        
        {/* Scan lines */}
        <div className="scan-lines" />
      </div>

      {/* Status indicators */}
      {(() => {
        const lastStep = robotHistory.length > 0
          ? robotHistory[robotHistory.length - 1]
          : (startCell ? [startCell.x, startCell.y, 0] as [number, number, number] : null)
        const dirNames = ['СЕВЕР', 'ВОСТОК', 'ЮГ', 'ЗАПАД']
        const directionText = lastStep != null ? dirNames[lastStep[2]] ?? '—' : '—'
        return (
          <div className="status-bar">
            <div className="status-item">
              <span className="status-label">СИСТЕМА:</span>
              <span className="status-value glow-text">АКТИВНА</span>
            </div>
            <div className="status-item">
              <span className="status-label">РАЗМЕР КАРТЫ:</span>
              <span className="status-value">{mapData.width}×{mapData.height}</span>
            </div>
            <div className="status-item">
              <span className="status-label">РОБОТ:</span>
              <span className="status-value">
                {lastStep != null ? `клетка [${lastStep[0]}, ${lastStep[1]}]` : '—'}
              </span>
            </div>
            <div className="status-item">
              <span className="status-label">СМОТРИТ:</span>
              <span className="status-value glow-text">{directionText}</span>
            </div>
            <div className="status-item">
              <span className="status-label">ШАГИ:</span>
              <span className="status-value">{robotHistory.length > 0 ? robotHistory.length - 1 : '0'}</span>
            </div>
          </div>
        )
      })()}
      <p className="canvas-hint">Колёсико мыши — зум • Перетаскивание — панорама</p>
    </div>
  )
}
