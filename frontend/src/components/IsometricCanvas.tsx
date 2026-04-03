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
const TARGET_RENDER_FPS = 30
const FRAME_INTERVAL_MS = 1000 / TARGET_RENDER_FPS

export default function IsometricCanvas({ mapData, robotHistory, mineHistory = [], gatesHistory = [] }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const continuousRef = useRef<number>(0)
  const panRafRef = useRef<number | null>(null)
  const panPendingRef = useRef<{ x: number; y: number } | null>(null)
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

    const mainCtx = canvas.getContext('2d')
    if (!mainCtx) return

    const paintTarget = { current: mainCtx as CanvasRenderingContext2D }

    // Render into the visible viewport size (avoid CSS downscaling that makes maps tiny)
    const container = containerRef.current
    const viewW = Math.max(320, container?.clientWidth ?? 900)
    const viewH = Math.max(240, container?.clientHeight ?? 560)
    const dpr = Math.max(1, Math.floor((window.devicePixelRatio || 1) * 100) / 100)
    canvas.width = Math.floor(viewW * dpr)
    canvas.height = Math.floor(viewH * dpr)
    canvas.style.width = `${viewW}px`
    canvas.style.height = `${viewH}px`
    mainCtx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const behindCanvas = document.createElement('canvas')
    const frontCanvas = document.createElement('canvas')
    behindCanvas.width = canvas.width
    behindCanvas.height = canvas.height
    frontCanvas.width = canvas.width
    frontCanvas.height = canvas.height
    const behindCtx = behindCanvas.getContext('2d')
    const frontCtx = frontCanvas.getContext('2d')
    if (!behindCtx || !frontCtx) return
    behindCtx.setTransform(dpr, 0, 0, dpr, 0, 0)
    frontCtx.setTransform(dpr, 0, 0, dpr, 0, 0)

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
      c: CanvasRenderingContext2D,
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
      c.save()
      c.fillStyle = fill
      c.strokeStyle = stroke
      c.lineWidth = lineWidth
      c.beginPath()
      c.moveTo(center.x, center.y - ry)
      c.lineTo(center.x + rx, center.y)
      c.lineTo(center.x, center.y + ry)
      c.lineTo(center.x - rx, center.y)
      c.closePath()
      c.fill()
      c.stroke()
      c.restore()
    }

    const drawChargingStation = (
      c: CanvasRenderingContext2D,
      isoX: number,
      isoY: number,
      variant: 'start' | 'finish'
    ) => {
      const { center } = getTilePoints(isoX, isoY)
      const baseColor = variant === 'finish' ? '#d4a012' : '#8b7cb0'
      c.save()
      c.globalAlpha = 1
      drawInsetDiamond(c, isoX, isoY, 0.78, '#16162a', '#2a2a3e', 1)
      c.strokeStyle = baseColor
      c.lineWidth = 1.5
      c.beginPath()
      c.ellipse(center.x, center.y, 14 * zoom, 8 * zoom, 0, 0, Math.PI * 2)
      c.stroke()
      c.font = `bold ${16 * zoom}px Arial`
      c.fillStyle = baseColor
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText('⚡', center.x, center.y)
      c.restore()
    }

    /** Верх куба стены: без «каркасного X» — металлическая панель с лёгким бликом */
    const drawLabWallDetails = (c: CanvasRenderingContext2D, isoX: number, isoY: number, depth: number) => {
      const { top, right, bottom, left, center } = getTilePoints(isoX, isoY)

      c.save()
      drawInsetDiamond(c, isoX, isoY, 0.88, 'rgba(18,18,28,0.55)', 'rgba(255,255,255,0.06)', 1)

      // Мягкий блик по диагонали ромба (не линии-сетка)
      const shine = c.createLinearGradient(top.x, top.y, bottom.x, bottom.y)
      shine.addColorStop(0, 'rgba(255,255,255,0.07)')
      shine.addColorStop(0.45, 'rgba(255,255,255,0)')
      shine.addColorStop(1, 'rgba(0,0,0,0.12)')
      c.fillStyle = shine
      c.beginPath()
      c.moveTo(top.x, top.y)
      c.lineTo(right.x, right.y)
      c.lineTo(bottom.x, bottom.y)
      c.lineTo(left.x, left.y)
      c.closePath()
      c.fill()

      // Тонкая кромка + микро-заклёпки (читаемость без wireframe)
      c.strokeStyle = 'rgba(139, 126, 216, 0.2)'
      c.lineWidth = 1
      c.stroke()
      const rivet = (px: number, py: number) => {
        c.fillStyle = 'rgba(255,255,255,0.12)'
        c.beginPath()
        c.arc(px, py, 1.8 * zoom, 0, Math.PI * 2)
        c.fill()
      }
      const inset = 0.82
      const rx = (TILE_WIDTH / 2) * zoom * inset
      const ry = (TILE_HEIGHT / 2) * zoom * inset
      rivet(center.x, center.y - ry)
      rivet(center.x + rx, center.y)
      rivet(center.x, center.y + ry)
      rivet(center.x - rx, center.y)

      // Вертикальные кромки боковых граней (лёгкое свечение)
      c.strokeStyle = 'rgba(139, 126, 216, 0.18)'
      c.lineWidth = 1.5
      c.shadowBlur = 8
      c.shadowColor = 'rgba(139, 126, 216, 0.2)'
      c.beginPath()
      c.moveTo(left.x, left.y)
      c.lineTo(left.x, left.y + depth)
      c.stroke()
      c.beginPath()
      c.moveTo(right.x, right.y)
      c.lineTo(right.x, right.y + depth)
      c.stroke()
      c.shadowBlur = 0
      c.restore()
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

      paintTarget.current!.save()
      const inset = 0.88
      const rx = w * inset
      const ry = h * inset
      paintTarget.current!.fillStyle = 'rgba(18,18,28,0.55)'
      // Визуально «как обводка стен»: без диагональных бликов/заливок.
      paintTarget.current!.strokeStyle = 'rgba(139, 126, 216, 0.22)'
      paintTarget.current!.lineWidth = 1.15
      paintTarget.current!.beginPath()
      paintTarget.current!.moveTo(center.x, center.y - ry)
      paintTarget.current!.lineTo(center.x + rx, center.y)
      paintTarget.current!.lineTo(center.x, center.y + ry)
      paintTarget.current!.lineTo(center.x - rx, center.y)
      paintTarget.current!.closePath()
      paintTarget.current!.fill()
      paintTarget.current!.stroke()

      // Контур внешних граней: однотонный штрих по внешним ребрам панели.
      paintTarget.current!.strokeStyle = 'rgba(139, 126, 216, 0.22)'
      paintTarget.current!.lineWidth = 1
      paintTarget.current!.beginPath()
      paintTarget.current!.moveTo(top.x, top.y)
      paintTarget.current!.lineTo(right.x, right.y)
      paintTarget.current!.lineTo(bottom.x, bottom.y)
      paintTarget.current!.lineTo(left.x, left.y)
      paintTarget.current!.closePath()
      paintTarget.current!.stroke()

      const rivet = (px: number, py: number) => {
        // Точки наверху должны быть столь же заметными, как обводка стен.
        paintTarget.current!.fillStyle = 'rgba(139, 126, 216, 0.22)'
        paintTarget.current!.beginPath()
        paintTarget.current!.arc(px, py, 1.8 * zoom, 0, Math.PI * 2)
        paintTarget.current!.fill()
      }
      const ri = 0.82
      rivet(center.x, center.y - h * ri)
      rivet(center.x + w * ri, center.y)
      rivet(center.x, center.y + h * ri)
      rivet(center.x - w * ri, center.y)
      paintTarget.current!.restore()
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
      paintTarget.current!.save()
      paintTarget.current!.globalAlpha = 0.3 * (opts?.alpha ?? 1)
      paintTarget.current!.fillStyle = '#000000'
      paintTarget.current!.filter = 'blur(4px)'
      paintTarget.current!.beginPath()
      paintTarget.current!.moveTo(isoX, isoY + depth + 5)
      paintTarget.current!.lineTo(isoX + TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom + depth + 5)
      paintTarget.current!.lineTo(isoX, isoY + TILE_HEIGHT * zoom + depth + 5)
      paintTarget.current!.lineTo(isoX - TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom + depth + 5)
      paintTarget.current!.closePath()
      paintTarget.current!.fill()
      paintTarget.current!.filter = 'none'
      paintTarget.current!.restore()

      // ——— Стена: заливка + обводка только по видимым рёбрам (не по нижнему краю у пола) ———
      if (type === 'wall') {
        paintTarget.current!.save()
        const wallAlpha = opts?.alpha ?? 1
        paintTarget.current!.globalAlpha = wallAlpha
        const wh = WALL_HEIGHT * zoom * (opts?.heightScale ?? 1)
        const baseY = isoY + (TILE_HEIGHT / 2) * zoom
        const w = (TILE_WIDTH / 2) * zoom
        const h = (TILE_HEIGHT / 2) * zoom
        const topCenterY = baseY - wh
        const floorSouthY = isoY + TILE_HEIGHT * zoom

        const frontColor = '#1c1c2a'
        const sideColorL = '#14141f'
        const sideColorR = '#12121c'

        // 1) Основание — без обводки, чтобы не было линии по стыку с полом
        // Даже при cutawayWalls стараемся не оставлять “дыры” у пола:
        // нижняя база рисуется непрозрачно, а прозрачность применяем к верхней части стены.
        paintTarget.current!.globalAlpha = 1
        const floorGrad = paintTarget.current!.createLinearGradient(
          isoX - TILE_WIDTH / 4 * zoom, isoY,
          isoX + TILE_WIDTH / 4 * zoom, isoY + TILE_HEIGHT * zoom
        )
        floorGrad.addColorStop(0, '#2a2a3e')
        floorGrad.addColorStop(1, '#1a1a2e')
        paintTarget.current!.fillStyle = floorGrad
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX, isoY)
        paintTarget.current!.lineTo(isoX + w, baseY)
        paintTarget.current!.lineTo(isoX, isoY + TILE_HEIGHT * zoom)
        paintTarget.current!.lineTo(isoX - w, baseY)
        paintTarget.current!.closePath()
        paintTarget.current!.fill()

        // Закрываем два нижних сектора (которые иначе выглядят “пустыми” и смотрятся как пол без стен).
        // Это треугольники слева/справа от центральной оси до южной вершины ромба пола.
        const leftBottomGrad = paintTarget.current!.createLinearGradient(
          isoX - w,
          baseY,
          isoX,
          floorSouthY
        )
        leftBottomGrad.addColorStop(0, sideColorL)
        leftBottomGrad.addColorStop(1, '#050508')
        paintTarget.current!.fillStyle = leftBottomGrad
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX - w, baseY)
        paintTarget.current!.lineTo(isoX, isoY + TILE_HEIGHT * zoom)
        paintTarget.current!.lineTo(isoX, isoY)
        paintTarget.current!.closePath()
        paintTarget.current!.fill()

        const rightBottomGrad = paintTarget.current!.createLinearGradient(
          isoX + w,
          baseY,
          isoX,
          floorSouthY
        )
        rightBottomGrad.addColorStop(0, sideColorR)
        rightBottomGrad.addColorStop(1, '#0a0a12')
        paintTarget.current!.fillStyle = rightBottomGrad
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX + w, baseY)
        paintTarget.current!.lineTo(isoX, isoY + TILE_HEIGHT * zoom)
        paintTarget.current!.lineTo(isoX, isoY)
        paintTarget.current!.closePath()
        paintTarget.current!.fill()

        // Верхняя часть (боковые/передняя/крыша) — как и раньше, с cutaway alpha.
        paintTarget.current!.globalAlpha = wallAlpha

        // 2) Боковые грани — объёмный градиент (левая темнее)
        // Боковая грань должна сходиться к южной вершине пола, иначе снизу остаются “пустые” сектора.
        const lgL = paintTarget.current!.createLinearGradient(isoX - w, baseY, isoX, floorSouthY)
        lgL.addColorStop(0, sideColorL)
        lgL.addColorStop(1, '#0c0c14')
        paintTarget.current!.fillStyle = lgL
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX - w, baseY)
        paintTarget.current!.lineTo(isoX - w, baseY - wh)
        paintTarget.current!.lineTo(isoX, isoY - wh)
        paintTarget.current!.lineTo(isoX, floorSouthY)
        paintTarget.current!.closePath()
        paintTarget.current!.fill()
        const lgR = paintTarget.current!.createLinearGradient(isoX + w, baseY, isoX, floorSouthY)
        lgR.addColorStop(0, sideColorR)
        lgR.addColorStop(1, '#0a0a12')
        paintTarget.current!.fillStyle = lgR
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX + w, baseY)
        paintTarget.current!.lineTo(isoX + w, baseY - wh)
        paintTarget.current!.lineTo(isoX, isoY - wh)
        paintTarget.current!.lineTo(isoX, floorSouthY)
        paintTarget.current!.closePath()
        paintTarget.current!.fill()

        // Замыкание «юбки» у основания: боковые грани сходятся к нижней вершине ромба пола,
        // а передняя грань раньше начиналась ниже (baseY+overlap) — оставался треугольник к камере.
        // Юбка у пола тоже рисуется непрозрачно, чтобы не выглядело как пустота.
        paintTarget.current!.globalAlpha = 1
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX - w, baseY)
        paintTarget.current!.lineTo(isoX + w, baseY)
        paintTarget.current!.lineTo(isoX, floorSouthY)
        paintTarget.current!.closePath()
        paintTarget.current!.fillStyle = frontColor
        paintTarget.current!.fill()
        paintTarget.current!.globalAlpha = wallAlpha

        // 3) Передняя грань — металл + лёгкий вертикальный sheen (нижний край на baseY, без зазора с «юбкой»)
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX - w, baseY)
        paintTarget.current!.lineTo(isoX + w, baseY)
        paintTarget.current!.lineTo(isoX + w, baseY - wh)
        paintTarget.current!.lineTo(isoX - w, baseY - wh)
        paintTarget.current!.closePath()
        paintTarget.current!.fillStyle = frontColor
        paintTarget.current!.fill()
        const frontSheen = paintTarget.current!.createLinearGradient(isoX - w, baseY - wh, isoX + w, baseY)
        frontSheen.addColorStop(0, 'rgba(255,255,255,0.06)')
        frontSheen.addColorStop(0.35, 'rgba(255,255,255,0)')
        frontSheen.addColorStop(0.7, 'rgba(0,0,0,0.12)')
        frontSheen.addColorStop(1, 'rgba(255,255,255,0.03)')
        paintTarget.current!.fillStyle = frontSheen
        paintTarget.current!.fill()

        // 4) Верхняя грань
        const topGrad = paintTarget.current!.createLinearGradient(
          isoX - TILE_WIDTH / 4 * zoom, topCenterY - h,
          isoX + TILE_WIDTH / 4 * zoom, topCenterY + h
        )
        topGrad.addColorStop(0, '#262638')
        topGrad.addColorStop(1, '#1a1a2a')
        paintTarget.current!.fillStyle = topGrad
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX, topCenterY - h)
        paintTarget.current!.lineTo(isoX + w, topCenterY)
        paintTarget.current!.lineTo(isoX, topCenterY + h)
        paintTarget.current!.lineTo(isoX - w, topCenterY)
        paintTarget.current!.closePath()
        paintTarget.current!.fill()

        drawPremiumWallRoofDetails(isoX, topCenterY, w, h)

        // 5) Обводка только видимых рёбер: без нижнего края (где стена стыкуется с полом)
        paintTarget.current!.strokeStyle = 'rgba(139, 126, 216, 0.22)'
        paintTarget.current!.lineWidth = 1.15
        // Верх передней грани
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX - w, baseY - wh)
        paintTarget.current!.lineTo(isoX + w, baseY - wh)
        paintTarget.current!.stroke()
        // Левое и правое вертикальные рёбра передней грани (не ведём до пола — обрываем чуть выше)
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX - w, baseY - wh)
        paintTarget.current!.lineTo(isoX - w, baseY)
        paintTarget.current!.stroke()
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX + w, baseY - wh)
        paintTarget.current!.lineTo(isoX + w, baseY)
        paintTarget.current!.stroke()
        // Верхние диагонали боковых граней (рёбра «крыши» блока)
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX - w, baseY - wh)
        paintTarget.current!.lineTo(isoX, isoY - wh)
        paintTarget.current!.stroke()
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX + w, baseY - wh)
        paintTarget.current!.lineTo(isoX, isoY - wh)
        paintTarget.current!.stroke()
        // Контур верхней грани (все рёбра верха видны)
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX, topCenterY - h)
        paintTarget.current!.lineTo(isoX + w, topCenterY)
        paintTarget.current!.lineTo(isoX, topCenterY + h)
        paintTarget.current!.lineTo(isoX - w, topCenterY)
        paintTarget.current!.closePath()
        paintTarget.current!.stroke()

        // Угол «в камеру»: общее ребро боковых граней (isoX) + продолжение по центру передней грани до пола
        paintTarget.current!.strokeStyle = 'rgba(72, 66, 118, 0.62)'
        paintTarget.current!.lineWidth = 1.4 * zoom
        paintTarget.current!.lineCap = 'round'
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX, isoY - wh)
        paintTarget.current!.lineTo(isoX, floorSouthY)
        paintTarget.current!.stroke()
        paintTarget.current!.lineWidth = 0.9 * zoom
        paintTarget.current!.strokeStyle = 'rgba(210, 200, 255, 0.2)'
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX, isoY - wh)
        paintTarget.current!.lineTo(isoX, floorSouthY)
        paintTarget.current!.stroke()

        // Нижние внешние кромки (закрывают “пустые” треугольники и дают обводку на границе карты).
        paintTarget.current!.strokeStyle = 'rgba(139, 126, 216, 0.22)'
        paintTarget.current!.lineWidth = 1.0
        paintTarget.current!.lineCap = 'round'
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX - w, baseY)
        paintTarget.current!.lineTo(isoX, floorSouthY)
        paintTarget.current!.stroke()
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(isoX + w, baseY)
        paintTarget.current!.lineTo(isoX, floorSouthY)
        paintTarget.current!.stroke()

        paintTarget.current!.restore()
        return
      }

      // Top face with gradient (non-wall)
      paintTarget.current!.save()
      const topGradient = paintTarget.current!.createLinearGradient(
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
      
      paintTarget.current!.fillStyle = topGradient
      paintTarget.current!.beginPath()
      paintTarget.current!.moveTo(isoX, isoY)
      paintTarget.current!.lineTo(isoX + TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom)
      paintTarget.current!.lineTo(isoX, isoY + TILE_HEIGHT * zoom)
      paintTarget.current!.lineTo(isoX - TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom)
      paintTarget.current!.closePath()
      paintTarget.current!.fill()

      // Add glow for special tiles
      if (type === 'start' || type === 'finish' || type === 'trap') {
        paintTarget.current!.shadowBlur = 30
        paintTarget.current!.shadowColor = color
        paintTarget.current!.fill()
        paintTarget.current!.shadowBlur = 0
      }

      // Stroke with neon effect
      paintTarget.current!.strokeStyle = type === 'wall' ? '#8B7ED8' : 'rgba(139, 126, 216, 0.4)'
      paintTarget.current!.lineWidth = 2
      paintTarget.current!.stroke()
      paintTarget.current!.restore()

      // Left face (3D depth)
      paintTarget.current!.save()
      const leftGradient = paintTarget.current!.createLinearGradient(
        isoX - TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom,
        isoX - TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom + depth
      )
      leftGradient.addColorStop(0, type === 'wall' ? '#0a0a15' : '#15152a')
      leftGradient.addColorStop(1, type === 'wall' ? '#050508' : '#0a0a15')
      
      paintTarget.current!.fillStyle = leftGradient
      paintTarget.current!.beginPath()
      paintTarget.current!.moveTo(isoX, isoY + TILE_HEIGHT * zoom)
      paintTarget.current!.lineTo(isoX - TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom)
      paintTarget.current!.lineTo(isoX - TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom + depth)
      paintTarget.current!.lineTo(isoX, isoY + TILE_HEIGHT * zoom + depth)
      paintTarget.current!.closePath()
      paintTarget.current!.fill()
      
      if (type === 'wall') {
        paintTarget.current!.strokeStyle = 'rgba(0, 255, 170, 0.3)'
        paintTarget.current!.lineWidth = 1
        paintTarget.current!.stroke()
      }
      paintTarget.current!.restore()

      // Right face (3D depth)
      paintTarget.current!.save()
      const rightGradient = paintTarget.current!.createLinearGradient(
        isoX + TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom,
        isoX + TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom + depth
      )
      rightGradient.addColorStop(0, type === 'wall' ? '#08080d' : '#12122a')
      rightGradient.addColorStop(1, type === 'wall' ? '#030305' : '#08080d')
      
      paintTarget.current!.fillStyle = rightGradient
      paintTarget.current!.beginPath()
      paintTarget.current!.moveTo(isoX, isoY + TILE_HEIGHT * zoom)
      paintTarget.current!.lineTo(isoX + TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom)
      paintTarget.current!.lineTo(isoX + TILE_WIDTH / 2 * zoom, isoY + TILE_HEIGHT / 2 * zoom + depth)
      paintTarget.current!.lineTo(isoX, isoY + TILE_HEIGHT * zoom + depth)
      paintTarget.current!.closePath()
      paintTarget.current!.fill()
      
      if (type === 'wall') {
        paintTarget.current!.strokeStyle = 'rgba(139, 126, 216, 0.3)'
        paintTarget.current!.lineWidth = 1
        paintTarget.current!.stroke()
      }
      paintTarget.current!.restore()

      // Lab wall / charging station overlays (readability + theme)
      if (type === 'wall') {
        drawLabWallDetails(paintTarget.current!, isoX, isoY, depth)
      } else if (type === 'start') {
        drawChargingStation(paintTarget.current!, isoX, isoY, 'start')
      } else if (type === 'finish') {
        drawChargingStation(paintTarget.current!, isoX, isoY, 'finish')
      } else if (type === 'trap') {
        drawEnhancedMarker(paintTarget.current!, isoX, isoY, '⚠', '#f87171', 32)
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
      paintTarget.current!.save()
      // Outer rim
      paintTarget.current!.fillStyle = 'rgba(0,0,0,0.55)'
      paintTarget.current!.beginPath()
      paintTarget.current!.moveTo(top.x, top.y)
      paintTarget.current!.lineTo(right.x, right.y)
      paintTarget.current!.lineTo(bottom.x, bottom.y)
      paintTarget.current!.lineTo(left.x, left.y)
      paintTarget.current!.closePath()
      paintTarget.current!.fill()
      // Deep pit gradient
      const pit = paintTarget.current!.createRadialGradient(center.x, center.y + 10 * zoom, 2 * zoom, center.x, center.y + 10 * zoom, 36 * zoom)
      pit.addColorStop(0, 'rgba(0,0,0,0.9)')
      pit.addColorStop(0.5, 'rgba(10,10,20,0.85)')
      pit.addColorStop(1, 'rgba(0,0,0,0.55)')
      paintTarget.current!.fillStyle = pit
      paintTarget.current!.beginPath()
      paintTarget.current!.moveTo(center.x, center.y - (TILE_HEIGHT / 2) * zoom * 0.65)
      paintTarget.current!.lineTo(center.x + (TILE_WIDTH / 2) * zoom * 0.65, center.y)
      paintTarget.current!.lineTo(center.x, center.y + (TILE_HEIGHT / 2) * zoom * 0.65)
      paintTarget.current!.lineTo(center.x - (TILE_WIDTH / 2) * zoom * 0.65, center.y)
      paintTarget.current!.closePath()
      paintTarget.current!.fill()
      // Rim glow
      paintTarget.current!.strokeStyle = 'rgba(139,126,216,0.22)'
      paintTarget.current!.lineWidth = 2
      paintTarget.current!.shadowBlur = 18
      paintTarget.current!.shadowColor = 'rgba(139,126,216,0.25)'
      paintTarget.current!.beginPath()
      paintTarget.current!.moveTo(top.x, top.y)
      paintTarget.current!.lineTo(right.x, right.y)
      paintTarget.current!.lineTo(bottom.x, bottom.y)
      paintTarget.current!.lineTo(left.x, left.y)
      paintTarget.current!.closePath()
      paintTarget.current!.stroke()
      paintTarget.current!.restore()
    }

    const drawBrokenCracks = (x: number, y: number) => {
      const { isoX, isoY } = gridToIso(x, y)
      const { top, right, bottom, left, center } = getTilePoints(isoX, isoY)
      paintTarget.current!.save()
      // Dark cracked-glass style: detailed curved cracks over the full platform.
      drawInsetDiamond(paintTarget.current!, isoX, isoY, 0.92, 'rgba(0,0,0,0.16)', 'rgba(255,255,255,0.05)', 1)
      drawInsetDiamond(paintTarget.current!, isoX, isoY, 0.82, 'rgba(0,0,0,0.24)', 'rgba(255,255,255,0.04)', 1)

      const clipDiamond = () => {
        const t = lerpPt(top, center, 0.18)
        const r = lerpPt(right, center, 0.18)
        const b = lerpPt(bottom, center, 0.18)
        const l = lerpPt(left, center, 0.18)
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(t.x, t.y)
        paintTarget.current!.lineTo(r.x, r.y)
        paintTarget.current!.lineTo(b.x, b.y)
        paintTarget.current!.lineTo(l.x, l.y)
        paintTarget.current!.closePath()
      }

      paintTarget.current!.save()
      clipDiamond()
      paintTarget.current!.clip()

      const crackMain = 'rgba(50, 40, 28, 0.9)'
      const crackThin = 'rgba(60, 48, 34, 0.76)'

      const curve = (pts: Array<[number, number]>, width: number, color: string) => {
        if (pts.length < 2) return
        paintTarget.current!.strokeStyle = color
        paintTarget.current!.lineWidth = width * zoom
        paintTarget.current!.lineCap = 'round'
        paintTarget.current!.lineJoin = 'round'
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(pts[0][0], pts[0][1])
        for (let i = 1; i < pts.length - 1; i++) {
          const cx = (pts[i][0] + pts[i + 1][0]) / 2
          const cy = (pts[i][1] + pts[i + 1][1]) / 2
          paintTarget.current!.quadraticCurveTo(pts[i][0], pts[i][1], cx, cy)
        }
        const last = pts[pts.length - 1]
        paintTarget.current!.lineTo(last[0], last[1])
        paintTarget.current!.stroke()
      }

      // Main large cracks
      curve([
        [center.x - 28 * zoom, center.y - 12 * zoom],
        [center.x - 10 * zoom, center.y - 8 * zoom],
        [center.x + 6 * zoom, center.y - 2 * zoom],
        [center.x + 24 * zoom, center.y + 10 * zoom],
      ], 2.1, crackMain)
      curve([
        [center.x - 18 * zoom, center.y + 18 * zoom],
        [center.x - 6 * zoom, center.y + 8 * zoom],
        [center.x + 4 * zoom, center.y - 6 * zoom],
        [center.x + 10 * zoom, center.y - 18 * zoom],
      ], 1.9, crackMain)
      curve([
        [center.x - 4 * zoom, center.y + 20 * zoom],
        [center.x + 2 * zoom, center.y + 8 * zoom],
        [center.x + 14 * zoom, center.y + 2 * zoom],
        [center.x + 26 * zoom, center.y - 4 * zoom],
      ], 1.7, crackMain)

      // Secondary branches
      curve([
        [center.x - 10 * zoom, center.y - 8 * zoom],
        [center.x - 16 * zoom, center.y - 18 * zoom],
        [center.x - 22 * zoom, center.y - 22 * zoom],
      ], 1.25, crackThin)
      curve([
        [center.x + 4 * zoom, center.y - 5 * zoom],
        [center.x + 10 * zoom, center.y - 14 * zoom],
        [center.x + 16 * zoom, center.y - 20 * zoom],
      ], 1.2, crackThin)
      curve([
        [center.x + 6 * zoom, center.y + 1 * zoom],
        [center.x + 1 * zoom, center.y + 10 * zoom],
        [center.x - 7 * zoom, center.y + 16 * zoom],
      ], 1.1, crackThin)
      curve([
        [center.x - 2 * zoom, center.y + 7 * zoom],
        [center.x - 13 * zoom, center.y + 9 * zoom],
        [center.x - 22 * zoom, center.y + 6 * zoom],
      ], 1.05, crackThin)
      curve([
        [center.x + 13 * zoom, center.y + 7 * zoom],
        [center.x + 21 * zoom, center.y + 13 * zoom],
        [center.x + 27 * zoom, center.y + 18 * zoom],
      ], 1.05, crackThin)
      curve([
        [center.x - 14 * zoom, center.y + 2 * zoom],
        [center.x - 19 * zoom, center.y - 2 * zoom],
        [center.x - 25 * zoom, center.y - 6 * zoom],
      ], 0.95, crackThin)
      curve([
        [center.x - 1 * zoom, center.y - 1 * zoom],
        [center.x - 4 * zoom, center.y - 13 * zoom],
        [center.x - 7 * zoom, center.y - 24 * zoom],
      ], 0.9, crackThin)
      curve([
        [center.x + 9 * zoom, center.y + 3 * zoom],
        [center.x + 18 * zoom, center.y - 2 * zoom],
        [center.x + 28 * zoom, center.y - 8 * zoom],
      ], 0.92, crackThin)
      curve([
        [center.x - 8 * zoom, center.y + 14 * zoom],
        [center.x - 15 * zoom, center.y + 19 * zoom],
        [center.x - 24 * zoom, center.y + 24 * zoom],
      ], 0.86, crackThin)
      curve([
        [center.x + 3 * zoom, center.y + 11 * zoom],
        [center.x + 11 * zoom, center.y + 16 * zoom],
        [center.x + 20 * zoom, center.y + 21 * zoom],
      ], 0.84, crackThin)

      paintTarget.current!.restore()
      paintTarget.current!.restore()
    }

    const drawLever = (x: number, y: number, color: string, on: boolean) => {
      const { isoX, isoY } = gridToIso(x, y)
      const glow = on ? 'rgba(34,197,94,0.45)' : 'rgba(239,68,68,0.45)'
      const floorFill = on ? 'rgba(34,197,94,0.16)' : 'rgba(239,68,68,0.16)'
      // Neon floor plate
      drawInsetDiamond(paintTarget.current!, isoX, isoY, 0.9, 'rgba(0,0,0,0.28)', 'rgba(255,255,255,0.08)', 1)
      drawInsetDiamond(paintTarget.current!, isoX, isoY, 0.76, floorFill, glow, 2)
      const { center } = getTilePoints(isoX, isoY)

      // Lever base
      paintTarget.current!.save()
      paintTarget.current!.shadowBlur = 16
      paintTarget.current!.shadowColor = glow
      paintTarget.current!.fillStyle = 'rgba(10,10,18,0.85)'
      paintTarget.current!.strokeStyle = 'rgba(255,255,255,0.12)'
      paintTarget.current!.lineWidth = 1.2
      paintTarget.current!.beginPath()
      paintTarget.current!.ellipse(center.x, center.y, 10 * zoom, 6 * zoom, 0, 0, Math.PI * 2)
      paintTarget.current!.fill()
      paintTarget.current!.stroke()

      // Lever handle (tilts based on state)
      const tilt = on ? -0.6 : 0.6
      paintTarget.current!.translate(center.x, center.y - 2 * zoom)
      paintTarget.current!.rotate(tilt)
      paintTarget.current!.strokeStyle = color
      paintTarget.current!.lineWidth = 3.2 * zoom
      paintTarget.current!.beginPath()
      paintTarget.current!.moveTo(-1 * zoom, 0)
      paintTarget.current!.lineTo(0, -14 * zoom)
      paintTarget.current!.stroke()
      // knob
      paintTarget.current!.fillStyle = color
      paintTarget.current!.beginPath()
      paintTarget.current!.arc(0, -16 * zoom, 3.4 * zoom, 0, Math.PI * 2)
      paintTarget.current!.fill()
      paintTarget.current!.restore()
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
    let frameNow = performance.now()

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

        // Minimal frame thickness.
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
        const thick = 2.2 * zoom
        const d0 = { x: o0.x + nx * thick, y: o0.y + ny * thick }
        const d1 = { x: o1.x + nx * thick, y: o1.y + ny * thick }
        const d0t: Pt = { x: d0.x, y: d0.y - wh }
        const d1t: Pt = { x: d1.x, y: d1.y - wh }

        paintTarget.current!.save()
        paintTarget.current!.lineCap = 'round'
        paintTarget.current!.lineJoin = 'round'

        // 1) Side thickness
        const sideFill = 'rgba(8,8,13,0.86)'
        const sideEdge = 'rgba(139, 126, 216, 0.12)'
        paintTarget.current!.fillStyle = sideFill
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(o0.x, o0.y)
        paintTarget.current!.lineTo(d0.x, d0.y)
        paintTarget.current!.lineTo(d0t.x, d0t.y)
        paintTarget.current!.lineTo(o0t.x, o0t.y)
        paintTarget.current!.closePath()
        paintTarget.current!.fill()
        paintTarget.current!.strokeStyle = sideEdge
        paintTarget.current!.lineWidth = 0.85 * zoom
        paintTarget.current!.stroke()
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(o1.x, o1.y)
        paintTarget.current!.lineTo(o1t.x, o1t.y)
        paintTarget.current!.lineTo(d1t.x, d1t.y)
        paintTarget.current!.lineTo(d1.x, d1.y)
        paintTarget.current!.closePath()
        paintTarget.current!.fill()
        paintTarget.current!.stroke()
        paintTarget.current!.fillStyle = 'rgba(5,5,10,0.94)'
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(o0.x, o0.y)
        paintTarget.current!.lineTo(o1.x, o1.y)
        paintTarget.current!.lineTo(d1.x, d1.y)
        paintTarget.current!.lineTo(d0.x, d0.y)
        paintTarget.current!.closePath()
        paintTarget.current!.fill()
        paintTarget.current!.strokeStyle = 'rgba(139, 126, 216, 0.12)'
        paintTarget.current!.stroke()

        // Main gate panel
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(o0.x, o0.y)
        paintTarget.current!.lineTo(o1.x, o1.y)
        paintTarget.current!.lineTo(o1t.x, o1t.y)
        paintTarget.current!.lineTo(o0t.x, o0t.y)
        paintTarget.current!.closePath()
        const gFill = paintTarget.current!.createLinearGradient(midB.x, midB.y, midT.x, midT.y)
        gFill.addColorStop(0, 'rgba(28,28,42,0.9)')
        gFill.addColorStop(1, 'rgba(18,18,28,0.88)')
        paintTarget.current!.fillStyle = gFill
        paintTarget.current!.fill()
        paintTarget.current!.save()
        paintTarget.current!.globalCompositeOperation = 'multiply'
        paintTarget.current!.fillStyle = color
        paintTarget.current!.globalAlpha = 0.12
        paintTarget.current!.fill()
        paintTarget.current!.globalAlpha = 1
        paintTarget.current!.globalCompositeOperation = 'source-over'
        paintTarget.current!.restore()

        paintTarget.current!.save()
        paintTarget.current!.clip()
        const pulse = 0.5 + 0.5 * Math.sin(frameNow / 320)
        const veil = paintTarget.current!.createLinearGradient(midB.x, midB.y, midT.x, midT.y)
        veil.addColorStop(0, `rgba(255,255,255,${0.02 + pulse * 0.02})`)
        veil.addColorStop(0.5, 'rgba(120,200,255,0.04)')
        veil.addColorStop(1, 'rgba(255,255,255,0.02)')
        paintTarget.current!.fillStyle = veil
        paintTarget.current!.fillRect(
          Math.min(o0.x, o1.x, o0t.x, o1t.x) - 4,
          Math.min(o0.y, o1.y, o0t.y, o1t.y) - 4,
          200 * zoom,
          200 * zoom
        )

        // Barrier: very subtle lines
        for (let i = 0; i < 3; i++) {
          const t = (i + 1) / 4
          const b = lerpPt(o0, o1, t)
          const tp = lerpPt(o0t, o1t, t)
          const g = paintTarget.current!.createLinearGradient(b.x, b.y, tp.x, tp.y)
          g.addColorStop(0, 'rgba(255,255,255,0)')
          g.addColorStop(0.5, 'rgba(255,255,255,0.11)')
          g.addColorStop(1, 'rgba(255,255,255,0)')
          paintTarget.current!.strokeStyle = g
          paintTarget.current!.lineWidth = 1.8 * zoom
          paintTarget.current!.beginPath()
          paintTarget.current!.moveTo(b.x, b.y + 6 * zoom)
          paintTarget.current!.lineTo(tp.x, tp.y - 6 * zoom)
          paintTarget.current!.stroke()
        }

        paintTarget.current!.restore()

        // Outer frame
        paintTarget.current!.shadowBlur = 4
        paintTarget.current!.shadowColor = color
        paintTarget.current!.strokeStyle = color
        paintTarget.current!.lineWidth = 2.1 * zoom
        paintTarget.current!.globalAlpha = 0.9
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(o0.x, o0.y)
        paintTarget.current!.lineTo(o0t.x, o0t.y)
        paintTarget.current!.stroke()
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(o1.x, o1.y)
        paintTarget.current!.lineTo(o1t.x, o1t.y)
        paintTarget.current!.stroke()
        paintTarget.current!.lineWidth = 1.8 * zoom
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(o0t.x, o0t.y)
        paintTarget.current!.lineTo(o1t.x, o1t.y)
        paintTarget.current!.stroke()
        paintTarget.current!.lineWidth = 1.6 * zoom
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(o0.x, o0.y)
        paintTarget.current!.lineTo(o1.x, o1.y)
        paintTarget.current!.stroke()
        paintTarget.current!.shadowBlur = 0
        paintTarget.current!.globalAlpha = 1

        paintTarget.current!.strokeStyle = 'rgba(139, 126, 216, 0.28)'
        paintTarget.current!.lineWidth = 1 * zoom
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(o0.x, o0.y)
        paintTarget.current!.lineTo(o0t.x, o0t.y)
        paintTarget.current!.stroke()
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(o1.x, o1.y)
        paintTarget.current!.lineTo(o1t.x, o1t.y)
        paintTarget.current!.stroke()

        paintTarget.current!.restore()
      }

      /**
       * Замок строго в плоскости ромба крыши: x' = isoX + u·w, y' = topCenterY + v·hFace
       * (u вдоль правого ребра ромба, v — к нижней вершине), без произвольного skew — не «кривится».
       */
      const drawGateLockOnRoof = (portalMidFloor: Pt | null) => {
        const topCenterY = baseY - wh
        const hFace = (TILE_HEIGHT / 2) * zoom
        const roofTop = { x: isoX, y: topCenterY - hFace }

        // Hanging lock centered above the gate opening.
        let lockX = isoX
        let lockY = roofTop.y + 8 * zoom
        if (portalMidFloor) {
          lockX = portalMidFloor.x
          lockY = topCenterY - hFace * 0.82
          if (portal) {
            const pMid = lerpPt(portal.p0, portal.p1, 0.5)
            const pMidTop = { x: pMid.x, y: pMid.y - wh }
            const anchored = lerpPt(pMidTop, roofTop, 0.22)
            lockX = anchored.x
            lockY = anchored.y + 1.2 * zoom
          }
        }
        paintTarget.current!.save()
        paintTarget.current!.shadowBlur = 8
        paintTarget.current!.shadowColor = `${color}88`
        paintTarget.current!.fillStyle = 'rgba(9,9,16,0.92)'
        paintTarget.current!.strokeStyle = color
        paintTarget.current!.lineWidth = 1.2 * zoom

        // Hanger
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(lockX, lockY - 6 * zoom)
        paintTarget.current!.lineTo(lockX, lockY - 1.5 * zoom)
        paintTarget.current!.stroke()

        // body
        const bw = 8 * zoom
        const bh = 5.4 * zoom
        const bx = lockX - bw / 2
        const by = lockY - bh / 2
        const rr = 1.8 * zoom
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(bx + rr, by)
        paintTarget.current!.lineTo(bx + bw - rr, by)
        paintTarget.current!.quadraticCurveTo(bx + bw, by, bx + bw, by + rr)
        paintTarget.current!.lineTo(bx + bw, by + bh - rr)
        paintTarget.current!.quadraticCurveTo(bx + bw, by + bh, bx + bw - rr, by + bh)
        paintTarget.current!.lineTo(bx + rr, by + bh)
        paintTarget.current!.quadraticCurveTo(bx, by + bh, bx, by + bh - rr)
        paintTarget.current!.lineTo(bx, by + rr)
        paintTarget.current!.quadraticCurveTo(bx, by, bx + rr, by)
        paintTarget.current!.closePath()
        paintTarget.current!.fill()
        paintTarget.current!.stroke()

        // shackle
        paintTarget.current!.beginPath()
        paintTarget.current!.arc(lockX, by + 0.6 * zoom, 1.9 * zoom, Math.PI, 0)
        paintTarget.current!.stroke()

        // highlight
        paintTarget.current!.shadowBlur = 0
        paintTarget.current!.strokeStyle = 'rgba(255,255,255,0.28)'
        paintTarget.current!.lineWidth = 0.9 * zoom
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(bx + 1.6 * zoom, by + 1.8 * zoom)
        paintTarget.current!.lineTo(bx + bw - 1.6 * zoom, by + 1.8 * zoom)
        paintTarget.current!.stroke()
        paintTarget.current!.restore()
      }

      // Fallback: старая ориентация по передней грани столба
      const drawFallbackFrontFace = () => {
        const faceBR = { x: isoX + w, y: baseY }
        const faceBL = { x: isoX - w, y: baseY }
        drawAirlockPortal(faceBL, faceBR)
      }

      paintTarget.current!.save()
      let portalMid: Pt | null = null
      if (portal) {
        portalMid = lerpPt(portal.p0, portal.p1, 0.5)
        drawAirlockPortal(portal.p0, portal.p1)
      } else {
        portalMid = { x: isoX, y: baseY }
        drawFallbackFrontFace()
      }
      drawGateLockOnRoof(portalMid)
      paintTarget.current!.restore()
    }

    const drawGateOpenOverlay = (x: number, y: number, color: string) => {
      const { isoX, isoY } = gridToIso(x, y)
      const { top, right, bottom, left, center } = getTilePoints(isoX, isoY)
      paintTarget.current!.save()

      // Lowered gate: understated reinforced plate + thin colored rail
      paintTarget.current!.shadowBlur = 12
      paintTarget.current!.shadowColor = color
      drawInsetDiamond(paintTarget.current!, isoX, isoY, 0.9, 'rgba(0,0,0,0.22)', 'rgba(255,255,255,0.07)', 1)
      drawInsetDiamond(paintTarget.current!, isoX, isoY, 0.74, 'rgba(0,0,0,0.10)', 'rgba(255,255,255,0.10)', 1)

      // Corner chevrons (hint of mechanism)
      paintTarget.current!.shadowBlur = 0
      paintTarget.current!.strokeStyle = 'rgba(255,255,255,0.10)'
      paintTarget.current!.lineWidth = 1.15 * zoom
      const chevron = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => {
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(ax, ay)
        paintTarget.current!.lineTo(bx, by)
        paintTarget.current!.lineTo(cx, cy)
        paintTarget.current!.stroke()
      }
      chevron(center.x - 18 * zoom, center.y - 2 * zoom, center.x - 10 * zoom, center.y - 8 * zoom, center.x - 2 * zoom, center.y - 2 * zoom)
      chevron(center.x + 18 * zoom, center.y - 2 * zoom, center.x + 10 * zoom, center.y - 8 * zoom, center.x + 2 * zoom, center.y - 2 * zoom)
      chevron(center.x - 18 * zoom, center.y + 8 * zoom, center.x - 10 * zoom, center.y + 14 * zoom, center.x - 2 * zoom, center.y + 8 * zoom)
      chevron(center.x + 18 * zoom, center.y + 8 * zoom, center.x + 10 * zoom, center.y + 14 * zoom, center.x + 2 * zoom, center.y + 8 * zoom)

      // Rail around the tile perimeter
      paintTarget.current!.strokeStyle = color
      paintTarget.current!.lineWidth = 1.7 * zoom
      paintTarget.current!.shadowBlur = 10
      paintTarget.current!.shadowColor = color
      paintTarget.current!.beginPath()
      paintTarget.current!.moveTo(top.x, top.y)
      paintTarget.current!.lineTo(right.x, right.y)
      paintTarget.current!.lineTo(bottom.x, bottom.y)
      paintTarget.current!.lineTo(left.x, left.y)
      paintTarget.current!.closePath()
      paintTarget.current!.stroke()
      paintTarget.current!.restore()
    }

    const drawSmartMine = (x: number, y: number, dir: number, _progress: number) => {
      const { isoX, isoY } = gridToIso(x, y)
      const bob = Math.sin((frameNow / 220) + x * 0.7 + y * 0.9) * 2.5 * zoom
      const by = isoY + (TILE_HEIGHT / 2) * zoom - 10 * zoom + bob
      const angle = (dir ?? 0) * (Math.PI / 2)
      paintTarget.current!.save()
      // body
      paintTarget.current!.translate(isoX, by)
      paintTarget.current!.fillStyle = '#171723'
      paintTarget.current!.strokeStyle = 'rgba(251,191,36,0.55)'
      paintTarget.current!.lineWidth = 2
      paintTarget.current!.beginPath()
      paintTarget.current!.ellipse(0, 0, 12 * zoom, 9 * zoom, 0, 0, Math.PI * 2)
      paintTarget.current!.fill()
      paintTarget.current!.shadowBlur = 18
      paintTarget.current!.shadowColor = 'rgba(251,191,36,0.35)'
      paintTarget.current!.stroke()
      // eye
      paintTarget.current!.rotate(angle)
      paintTarget.current!.fillStyle = '#fbbf24'
      paintTarget.current!.beginPath()
      paintTarget.current!.arc(7 * zoom, -1 * zoom, 2.2 * zoom, 0, Math.PI * 2)
      paintTarget.current!.fill()
      // legs spikes
      paintTarget.current!.rotate(-angle)
      paintTarget.current!.shadowBlur = 0
      paintTarget.current!.strokeStyle = 'rgba(255,255,255,0.12)'
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2
        paintTarget.current!.beginPath()
        paintTarget.current!.moveTo(Math.cos(a) * 10 * zoom, Math.sin(a) * 7 * zoom)
        paintTarget.current!.lineTo(Math.cos(a) * 15 * zoom, Math.sin(a) * 10 * zoom)
        paintTarget.current!.stroke()
      }
      paintTarget.current!.restore()
    }

    const drawEnhancedMarker = (c: CanvasRenderingContext2D, x: number, y: number, symbol: string, color: string, size: number) => {
      const cy = y + TILE_HEIGHT / 2 * zoom
      c.save()
      c.globalAlpha = 1
      c.font = `bold ${size * zoom}px Arial`
      c.fillStyle = color
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      c.fillText(symbol, x, cy)
      c.restore()
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
      paintTarget.current!.save()
      paintTarget.current!.globalAlpha = 1
      paintTarget.current!.fillStyle = '#1e1a2e'
      paintTarget.current!.beginPath()
      paintTarget.current!.moveTo(isoX, isoY)
      paintTarget.current!.lineTo(isoX + w, baseY)
      paintTarget.current!.lineTo(isoX, isoY + TILE_HEIGHT * zoom)
      paintTarget.current!.lineTo(isoX - w, baseY)
      paintTarget.current!.closePath()
      paintTarget.current!.fill()
      paintTarget.current!.strokeStyle = '#6b5b8a'
      paintTarget.current!.lineWidth = 2
      paintTarget.current!.stroke()
      paintTarget.current!.restore()
    }

    // Робот: стоит на полу клетки (ноги на уровне пола), компактный 3D-корпус, экран со стрелкой
    const drawRobot = (x: number, y: number, direction: number, _progress: number = 1) => {
      const { isoX, isoY } = gridToIso(x, y)
      const floorY = isoY + (TILE_HEIGHT / 2) * zoom // уровень пола клетки
      const legHeight = 16 * zoom
      const robotBaseY = floorY - legHeight // низ ног = floorY, верх ног = robotBaseY

      paintTarget.current!.save()
      paintTarget.current!.globalAlpha = 1

      drawRobotCellHighlight(x, y)

      const angle = getDirectionAngleWithView(direction)

      // Тень на полу под ногами (на уровне пола)
      paintTarget.current!.fillStyle = '#08080c'
      paintTarget.current!.beginPath()
      paintTarget.current!.ellipse(isoX, floorY + 4 * zoom, 16 * zoom, 6 * zoom, 0, 0, Math.PI * 2)
      paintTarget.current!.fill()

      // Ноги — стоят на полу (низ ног на floorY)
      paintTarget.current!.fillStyle = '#3d3d52'
      paintTarget.current!.fillRect(isoX - 9 * zoom, robotBaseY, 6 * zoom, legHeight)
      paintTarget.current!.fillRect(isoX + 3 * zoom, robotBaseY, 6 * zoom, legHeight)

      // Корпус: перед + боковая грань (опирается на ноги)
      const bw = 20 * zoom
      const bh = 18 * zoom
      const bx = isoX - bw / 2
      const by = robotBaseY - bh
      paintTarget.current!.fillStyle = '#5a5278'
      paintTarget.current!.fillRect(bx, by, bw, bh)
      paintTarget.current!.fillStyle = '#484860'
      paintTarget.current!.beginPath()
      paintTarget.current!.moveTo(bx + bw, by + bh)
      paintTarget.current!.lineTo(bx + bw, by)
      paintTarget.current!.lineTo(bx + bw + 8 * zoom, by - 4 * zoom)
      paintTarget.current!.lineTo(bx + bw + 8 * zoom, by + bh - 4 * zoom)
      paintTarget.current!.closePath()
      paintTarget.current!.fill()

      // Голова: экран (тёмный прямоугольник + стрелка «куда смотрит»)
      const headW = 16 * zoom
      const headH = 12 * zoom
      const headX = isoX - headW / 2
      const headY = by - headH - 2 * zoom
      paintTarget.current!.fillStyle = '#0f0f18'
      paintTarget.current!.fillRect(headX, headY, headW, headH)
      paintTarget.current!.strokeStyle = '#4a4a62'
      paintTarget.current!.lineWidth = 1
      paintTarget.current!.strokeRect(headX, headY, headW, headH)
      paintTarget.current!.save()
      paintTarget.current!.translate(isoX, headY + headH / 2)
      paintTarget.current!.rotate(angle)
      paintTarget.current!.fillStyle = '#34d399'
      paintTarget.current!.beginPath()
      paintTarget.current!.moveTo(0, -4 * zoom)
      paintTarget.current!.lineTo(3 * zoom, 3 * zoom)
      paintTarget.current!.lineTo(-3 * zoom, 3 * zoom)
      paintTarget.current!.closePath()
      paintTarget.current!.fill()
      paintTarget.current!.restore()
      paintTarget.current!.fillStyle = '#383850'
      paintTarget.current!.beginPath()
      paintTarget.current!.moveTo(headX + headW, headY + headH)
      paintTarget.current!.lineTo(headX + headW, headY)
      paintTarget.current!.lineTo(headX + headW + 5 * zoom, headY - 2 * zoom)
      paintTarget.current!.lineTo(headX + headW + 5 * zoom, headY + headH - 2 * zoom)
      paintTarget.current!.closePath()
      paintTarget.current!.fill()

      paintTarget.current!.restore()
    }

    type CanvasObject = { type: string; x: number; y: number; color?: string; open?: boolean; on?: boolean }
    type TileEntry = {
      x: number
      y: number
      tileType: string
      wallObj?: CanvasObject
      startObj?: CanvasObject
      finishObj?: CanvasObject
      leverObj?: CanvasObject
      gateObj?: CanvasObject
      gateColor?: string
      gatePortalEdge: { p0: Pt; p1: Pt } | null
    }

    const sortedTiles: { x: number; y: number; vx: number; vy: number }[] = []
    for (let y = 0; y < mapData.height; y++) {
      for (let x = 0; x < mapData.width; x++) {
        const { vx, vy } = gridToView(x, y)
        sortedTiles.push({ x, y, vx, vy })
      }
    }
    sortedTiles.sort((a, b) => (a.vx + a.vy) - (b.vx + b.vy))

    const getGatePortalEdge = (gx: number, gy: number): { p0: Pt; p1: Pt } | null => {
      const { isoX, isoY } = gridToIso(gx, gy)
      const baseY = isoY + (TILE_HEIGHT / 2) * zoom
      const w = (TILE_WIDTH / 2) * zoom
      const right: Pt = { x: isoX + w, y: baseY }
      const bottom: Pt = { x: isoX, y: isoY + TILE_HEIGHT * zoom }
      return { p0: right, p1: bottom }
    }

    // Static layer cache: precompute tile metadata once per effect run.
    const tileEntries: TileEntry[] = sortedTiles.map(({ x, y }) => {
      const raw = mapData.cells?.[y]?.[x]
      const cellLower = (raw || 'platform').toString().toLowerCase()
      const tileType = (cellLower === 'empty' ? 'platform' : cellLower)
      const objs = objectsAt.get(`${x},${y}`) ?? []
      const wallObj = objs.find(o => o.type === 'wall') ?? (tileType === 'wall' ? ({ type: 'wall', x, y } as CanvasObject) : undefined)
      const startObj = objs.find(o => o.type === 'start') ?? (tileType === 'start' ? ({ type: 'start', x, y } as CanvasObject) : undefined)
      const finishObj = objs.find(o => o.type === 'finish') ?? (tileType === 'finish' ? ({ type: 'finish', x, y } as CanvasObject) : undefined)
      const leverObj = objs.find(o => o.type === 'lever')
      const gateObj = objs.find(o => o.type === 'gate')
      const gateColor = gateObj?.color
      return {
        x,
        y,
        tileType,
        wallObj,
        startObj,
        finishObj,
        leverObj,
        gateObj,
        gateColor,
        gatePortalEdge: getGatePortalEdge(x, y),
      }
    })

    let staticRasterKey = ''

    const render = (nowMs: number) => {
      frameNow = nowMs

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

      const robotView = robotPos ? gridToView(robotPos.x, robotPos.y) : null
      const robotDepth = robotView ? (robotView.vx + robotView.vy) : null

      const getWallCutaway = (gx: number, gy: number) => {
        if (!cutawayWalls || !robotView || robotDepth == null) return { alpha: 1, heightScale: 1 }
        const { vx, vy } = gridToView(gx, gy)
        const depth = vx + vy
        const dManhattan = Math.abs(vx - robotView.vx) + Math.abs(vy - robotView.vy)
        const inFront = depth >= robotDepth
        if (!inFront) return { alpha: 1, heightScale: 1 }

        if (dManhattan <= 3) return { alpha: 0.16, heightScale: 0.28 }
        if (dManhattan <= 5) return { alpha: 0.26, heightScale: 0.42 }
        if (dManhattan <= 7) return { alpha: 0.42, heightScale: 0.65 }
        return { alpha: 1, heightScale: 1 }
      }

      const renderTileRow = (entry: TileEntry, skipRobot: boolean, skipMine: boolean) => {
        const { x, y, tileType, wallObj, startObj, finishObj, leverObj, gateObj, gateColor, gatePortalEdge } = entry
        const gateOpen = gateObj
          ? (gateStateByColor[(gateColor || '').toLowerCase()] ?? gateObj.open ?? false)
          : false

        if (tileType === 'void') {
          drawVoid(x, y)
        } else {
          if (wallObj || (gateObj && !gateOpen)) {
            const cut = getWallCutaway(x, y)
            drawIsometricTile(x, y, '#0f0f1a', 'wall', cut)
            if (gateObj && !gateOpen) {
              paintTarget.current!.save()
              paintTarget.current!.globalAlpha = Math.max(0.65, cut.alpha)
              drawGateClosedOverlay(x, y, colorForGate(gateColor), gatePortalEdge, cut.heightScale ?? 1)
              paintTarget.current!.restore()
            }
          } else {
            drawIsometricTile(x, y, '#1a1a2e', 'platform')
            if (tileType === 'broken_floor') drawBrokenCracks(x, y)
            if (gateObj && gateOpen) drawGateOpenOverlay(x, y, colorForGate(gateColor))
          }
        }

        if (startObj) drawChargingStation(paintTarget.current!, gridToIso(x, y).isoX, gridToIso(x, y).isoY, 'start')
        if (finishObj) drawChargingStation(paintTarget.current!, gridToIso(x, y).isoX, gridToIso(x, y).isoY, 'finish')
        if (leverObj) {
          const levKey = (leverObj.color || '').toLowerCase()
          const on = (gateStateByColor[levKey] ?? leverObj.on) ? true : false
          drawLever(x, y, colorForGate(leverObj.color), on)
        }

        if (robotPos && robotPos.x === x && robotPos.y === y && !skipRobot) {
          drawRobot(x, y, robotDir, robotProgress)
        }
        if (minePos && minePos.x === x && minePos.y === y && !skipMine) {
          drawSmartMine(x, y, mineDir, robotProgress)
        }
      }

      const mineActive = mineHistory.length > 0
      const anyClosedGate = tileEntries.some((e) => {
        if (!e.gateObj) return false
        const gk = (e.gateColor || '').toLowerCase()
        const open = gk.length
          ? (gateStateByColor[gk] ?? e.gateObj.open ?? false)
          : (e.gateObj.open ?? false)
        return !open
      })
      const gatePulseBucket = !mineActive && anyClosedGate ? Math.floor(frameNow / 260) : 0
      const cacheKey = [
        stepIndex,
        pan.x,
        pan.y,
        zoom,
        rotationDeg,
        cutawayWalls ? 1 : 0,
        robotPos ? `${robotPos.x},${robotPos.y}` : '_',
        JSON.stringify(gateStateByColor),
        gatePulseBucket,
      ].join('|')

      const compositeCachedLayers = () => {
        mainCtx.clearRect(0, 0, viewW, viewH)
        // Main context имеет setTransform(dpr,...), а offscreen-канвасы рисуются в device-пикселях.
        // Поэтому drawImage без target size (width/height) при dpr != 1 может уезжать/масштабироваться.
        mainCtx.drawImage(
          behindCanvas,
          0,
          0,
          behindCanvas.width,
          behindCanvas.height,
          0,
          0,
          viewW,
          viewH,
        )
        paintTarget.current = mainCtx

        if (robotPos) {
          mainCtx.save()
          mainCtx.translate(pan.x, pan.y)
          drawRobot(robotPos.x, robotPos.y, robotDir, robotProgress)
          mainCtx.restore()
        }
        mainCtx.drawImage(
          frontCanvas,
          0,
          0,
          frontCanvas.width,
          frontCanvas.height,
          0,
          0,
          viewW,
          viewH,
        )
      }

      if (!mineActive && cacheKey === staticRasterKey) {
        compositeCachedLayers()
        return
      }

      if (!mineActive) {
        staticRasterKey = cacheKey
        behindCtx.clearRect(0, 0, viewW, viewH)
        frontCtx.clearRect(0, 0, viewW, viewH)
        behindCtx.save()
        behindCtx.translate(pan.x, pan.y)
        frontCtx.save()
        frontCtx.translate(pan.x, pan.y)

        const robotIdx = robotPos ? tileEntries.findIndex((t) => t.x === robotPos.x && t.y === robotPos.y) : -1

        for (let i = 0; i < tileEntries.length; i++) {
          const entry = tileEntries[i]
          const useFront = robotIdx >= 0 && i > robotIdx
          paintTarget.current = useFront ? frontCtx : behindCtx
          renderTileRow(entry, true, true)
        }

        behindCtx.restore()
        frontCtx.restore()
        paintTarget.current = mainCtx
        compositeCachedLayers()
        return
      }

      staticRasterKey = ''
      paintTarget.current = mainCtx
      mainCtx.clearRect(0, 0, viewW, viewH)
      mainCtx.save()
      mainCtx.translate(pan.x, pan.y)
      for (const entry of tileEntries) {
        renderTileRow(entry, false, false)
      }
      mainCtx.restore()
    }

    currentStepRef.current = 0

    // Continuous animation for effects
    let lastRenderedAt = 0
    const continuousAnimate = (ts: number) => {
      const deltaMs = ts - lastRenderedAt
      if (deltaMs >= FRAME_INTERVAL_MS || lastRenderedAt === 0) {
        if (robotHistory.length > 0 && currentStepRef.current < robotHistory.length - 1) {
          const frameFactor = Math.max(0.8, deltaMs / 16.67)
          currentStepRef.current += 0.2 * frameFactor
        }
        render(ts)
        lastRenderedAt = ts
      }
      continuousRef.current = requestAnimationFrame(continuousAnimate)
    }
    continuousRef.current = requestAnimationFrame(continuousAnimate)

    return () => {
      if (continuousRef.current) {
        cancelAnimationFrame(continuousRef.current)
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
            panPendingRef.current = {
              x: dragStart.current.panX + e.clientX - dragStart.current.x,
              y: dragStart.current.panY + e.clientY - dragStart.current.y,
            }
            if (panRafRef.current == null) {
              panRafRef.current = requestAnimationFrame(() => {
                if (panPendingRef.current) {
                  setPan(panPendingRef.current)
                }
                panPendingRef.current = null
                panRafRef.current = null
              })
            }
          }
        }}
        onMouseUp={() => {
          setIsDragging(false)
          dragStart.current = null
          if (panRafRef.current != null) {
            cancelAnimationFrame(panRafRef.current)
            panRafRef.current = null
          }
          if (panPendingRef.current) {
            setPan(panPendingRef.current)
            panPendingRef.current = null
          }
        }}
        onMouseLeave={() => {
          setIsDragging(false)
          dragStart.current = null
          if (panRafRef.current != null) {
            cancelAnimationFrame(panRafRef.current)
            panRafRef.current = null
          }
          if (panPendingRef.current) {
            setPan(panPendingRef.current)
            panPendingRef.current = null
          }
        }}
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
