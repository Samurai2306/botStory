import { useEffect, useRef, useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import './IsometricCanvas.css'

interface Props {
  mapData: {
    width: number
    height: number
    cells: string[][]
  }
  robotHistory: Array<[number, number, number]>
}

const TILE_WIDTH = 80
const TILE_HEIGHT = 40
const TILE_DEPTH = 16
const WALL_HEIGHT = 58

export default function IsometricCanvas({ mapData, robotHistory }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number>(0)
  const currentStepRef = useRef<number>(0)
  const dragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [showGrid, setShowGrid] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [rotationDeg, setRotationDeg] = useState(0) // 0, 90, 180, 270 — поворот поля для удобства
  const [isDragging, setIsDragging] = useState(false)

  const startCell = useMemo(() => {
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

    // Set canvas size with margin
    const margin = 200
    canvas.width = (mapData.width + mapData.height) * TILE_WIDTH / 2 + margin * 2
    canvas.height = (mapData.width + mapData.height) * TILE_HEIGHT / 2 + margin * 2

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
        isoX: (vx - vy) * (TILE_WIDTH / 2) * zoom + canvas.width / 2,
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

    const drawLabWallDetails = (ctx: CanvasRenderingContext2D, isoX: number, isoY: number, depth: number) => {
      const { top, right, bottom, left, center } = getTilePoints(isoX, isoY)

      ctx.save()
      // Panel inset on top face
      drawInsetDiamond(ctx, isoX, isoY, 0.86, 'rgba(0,0,0,0.12)', 'rgba(255,255,255,0.08)', 1)

      // Glowing seams (like lab panels)
      ctx.strokeStyle = 'rgba(139, 126, 216, 0.35)'
      ctx.lineWidth = 1
      ctx.shadowBlur = 10
      ctx.shadowColor = 'rgba(139, 126, 216, 0.35)'
      ctx.beginPath()
      ctx.moveTo(top.x, top.y)
      ctx.lineTo(bottom.x, bottom.y)
      ctx.moveTo(left.x, left.y)
      ctx.lineTo(right.x, right.y)
      ctx.stroke()
      ctx.shadowBlur = 0

      // Rivets (corners of inset)
      const rivet = (px: number, py: number) => {
        ctx.fillStyle = 'rgba(255,255,255,0.25)'
        ctx.beginPath()
        ctx.arc(px, py, 2.2 * zoom, 0, Math.PI * 2)
        ctx.fill()
      }
      const inset = 0.86
      const rx = (TILE_WIDTH / 2) * zoom * inset
      const ry = (TILE_HEIGHT / 2) * zoom * inset
      rivet(center.x, center.y - ry)
      rivet(center.x + rx, center.y)
      rivet(center.x, center.y + ry)
      rivet(center.x - rx, center.y)

      // Hazard stripe on the front edge (bottom -> right and bottom -> left)
      const stripe = (ax: number, ay: number, bx: number, by: number) => {
        const stripes = 8
        for (let i = 0; i < stripes; i++) {
          const t0 = i / stripes
          const t1 = (i + 1) / stripes
          const x0 = ax + (bx - ax) * t0
          const y0 = ay + (by - ay) * t0
          const x1 = ax + (bx - ax) * t1
          const y1 = ay + (by - ay) * t1
          ctx.strokeStyle = i % 2 === 0 ? 'rgba(251, 191, 36, 0.55)' : 'rgba(0, 0, 0, 0.45)'
          ctx.lineWidth = 3 * zoom
          ctx.beginPath()
          ctx.moveTo(x0, y0)
          ctx.lineTo(x1, y1)
          ctx.stroke()
        }
      }
      stripe(bottom.x, bottom.y, right.x, right.y)
      stripe(bottom.x, bottom.y, left.x, left.y)

      // Side seam glow (vertical edges)
      ctx.strokeStyle = 'rgba(139, 126, 216, 0.22)'
      ctx.lineWidth = 2
      ctx.shadowBlur = 14
      ctx.shadowColor = 'rgba(139, 126, 216, 0.25)'
      // Left vertical edge
      ctx.beginPath()
      ctx.moveTo(left.x, left.y)
      ctx.lineTo(left.x, left.y + depth)
      ctx.stroke()
      // Right vertical edge
      ctx.beginPath()
      ctx.moveTo(right.x, right.y)
      ctx.lineTo(right.x, right.y + depth)
      ctx.stroke()
      ctx.restore()
    }

    // Enhanced isometric tile with premium 3D depth
    const drawIsometricTile = (x: number, y: number, color: string, type: string) => {
      const { isoX, isoY } = gridToIso(x, y)
      const depth = type === 'wall' ? TILE_DEPTH * 3 : TILE_DEPTH

      // Enhanced shadow
      ctx.save()
      ctx.globalAlpha = 0.3
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
        ctx.globalAlpha = 1
        const wh = WALL_HEIGHT * zoom
        const baseY = isoY + (TILE_HEIGHT / 2) * zoom
        const w = (TILE_WIDTH / 2) * zoom
        const h = (TILE_HEIGHT / 2) * zoom
        const topCenterY = baseY - wh

        const frontColor = '#1a1a28'
        const sideColor = '#181820'

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

        // 2) Боковые грани — заливка (передняя перекроет стыки)
        ctx.fillStyle = sideColor
        ctx.beginPath()
        ctx.moveTo(isoX - w, baseY)
        ctx.lineTo(isoX - w, baseY - wh)
        ctx.lineTo(isoX, isoY - wh)
        ctx.lineTo(isoX, isoY)
        ctx.closePath()
        ctx.fill()
        ctx.beginPath()
        ctx.moveTo(isoX + w, baseY)
        ctx.lineTo(isoX + w, baseY - wh)
        ctx.lineTo(isoX, isoY - wh)
        ctx.lineTo(isoX, isoY)
        ctx.closePath()
        ctx.fill()

        // 3) Передняя грань — заливка чуть ниже baseY, чтобы убрать артефакт-треугольник внизу
        ctx.fillStyle = frontColor
        const overlap = 2
        ctx.beginPath()
        ctx.moveTo(isoX - w, baseY + overlap)
        ctx.lineTo(isoX + w, baseY + overlap)
        ctx.lineTo(isoX + w, baseY - wh)
        ctx.lineTo(isoX - w, baseY - wh)
        ctx.closePath()
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

        // 5) Обводка только видимых рёбер: без нижнего края (где стена стыкуется с полом)
        ctx.strokeStyle = 'rgba(139, 126, 216, 0.28)'
        ctx.lineWidth = 1
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
        ctx.beginPath()
        ctx.moveTo(isoX, isoY - wh)
        ctx.lineTo(isoX, topCenterY + h)
        ctx.stroke()
        // Контур верхней грани (все рёбра верха видны)
        ctx.beginPath()
        ctx.moveTo(isoX, topCenterY - h)
        ctx.lineTo(isoX + w, topCenterY)
        ctx.lineTo(isoX, topCenterY + h)
        ctx.lineTo(isoX - w, topCenterY)
        ctx.closePath()
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

      // Сетка только если включена — тонкие линии, не отвлекают
      if (showGrid && type !== 'wall') {
        ctx.save()
        ctx.strokeStyle = 'rgba(120, 110, 150, 0.18)'
        ctx.lineWidth = 1
        ctx.setLineDash([4, 6])
        ctx.beginPath()
        ctx.moveTo(isoX, isoY)
        ctx.lineTo(isoX, isoY + TILE_HEIGHT * zoom)
        ctx.moveTo(isoX - TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom)
        ctx.lineTo(isoX + TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      }

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
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.translate(pan.x, pan.y)

      // Порядок по глубине vx+vy: робот и его клетка рисуются на своей глубине, стены спереди их перекрывают
      const robotPos = robotHistory.length > 0
        ? (() => { const s = Math.min(Math.floor(currentStepRef.current), robotHistory.length - 1); const [rx, ry] = robotHistory[s]; return { x: rx, y: ry } })()
        : (startCell ? { x: startCell.x, y: startCell.y } : null)
      const robotDir = robotHistory.length > 0
        ? robotHistory[Math.min(Math.floor(currentStepRef.current), robotHistory.length - 1)][2]
        : 0
      const robotProgress = robotHistory.length > 0 ? currentStepRef.current - Math.floor(currentStepRef.current) : 1

      const tiles: { x: number; y: number; vx: number; vy: number }[] = []
      for (let y = 0; y < mapData.height; y++) {
        for (let x = 0; x < mapData.width; x++) {
          const { vx, vy } = gridToView(x, y)
          tiles.push({ x, y, vx, vy })
        }
      }
      tiles.sort((a, b) => (a.vx + a.vy) - (b.vx + b.vy))

      for (const { x, y } of tiles) {
        const cellType = mapData.cells[y][x]
        let color = '#1a1a2e'
        if (cellType === 'wall') color = '#0f0f1a'
        else if (cellType === 'trap') color = '#2a0a0a'
        else if (cellType === 'start') color = '#0a2a0a'
        else if (cellType === 'finish') color = '#2a2a0a'
        drawIsometricTile(x, y, color, cellType)

        // Робот рисуется сразу после своей клетки по глубине — стены с большей глубиной нарисуются поверх
        if (robotPos && robotPos.x === x && robotPos.y === y) {
          drawRobot(x, y, robotDir, robotProgress)
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
  }, [mapData, robotHistory, zoom, showGrid, pan, startCell, rotationDeg])

  return (
    <div className="isometric-canvas-wrapper">
      <div className="canvas-controls">
        <motion.button
          className="control-btn"
          onClick={() => setShowGrid(!showGrid)}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
        >
          <span className="control-icon">⊞</span>
          {showGrid ? 'Скрыть сетку' : 'Показать сетку'}
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
