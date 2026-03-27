import { useRef, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import './Games.css'

function SnakeGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nextDirRef = useRef({ x: 0, y: 0 })
  const [score, setScore] = useState(0)
  const [running, setRunning] = useState(false)
  const [gameOver, setGameOver] = useState(false)
  const grid = 20
  const tile = 18

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const gfx = canvas.getContext('2d')
    if (!gfx) return
    const ctx2d: CanvasRenderingContext2D = gfx

    let snake: { x: number; y: number }[] = [{ x: 10, y: 10 }]
    let dir = { x: 0, y: 0 }
    let food = { x: 15, y: 15 }

    const W = grid * tile
    const H = grid * tile
    canvas.width = W
    canvas.height = H

    function placeFood() {
      food = {
        x: Math.floor(Math.random() * grid),
        y: Math.floor(Math.random() * grid),
      }
      if (snake.some((s) => s.x === food.x && s.y === food.y)) placeFood()
    }

    function draw(context: CanvasRenderingContext2D) {
      context.fillStyle = 'rgba(10, 10, 18, 0.4)'
      context.fillRect(0, 0, W, H)
      context.strokeStyle = 'rgba(139, 126, 216, 0.15)'
      context.lineWidth = 1
      for (let i = 0; i <= grid; i++) {
        context.beginPath()
        context.moveTo(i * tile, 0)
        context.lineTo(i * tile, H)
        context.stroke()
        context.beginPath()
        context.moveTo(0, i * tile)
        context.lineTo(W, i * tile)
        context.stroke()
      }
      context.fillStyle = '#ff6b6b'
      context.shadowColor = '#ff6b6b'
      context.shadowBlur = 10
      context.beginPath()
      context.arc(food.x * tile + tile / 2, food.y * tile + tile / 2, tile / 2 - 2, 0, Math.PI * 2)
      context.fill()
      context.shadowBlur = 0
      snake.forEach((seg, i) => {
        context.fillStyle = i === 0 ? '#B8A9E8' : 'rgba(139, 126, 216, 0.9)'
        context.fillRect(seg.x * tile + 1, seg.y * tile + 1, tile - 2, tile - 2)
      })
    }

    function step() {
      dir = { ...nextDirRef.current }
      if (dir.x === 0 && dir.y === 0) {
        draw(ctx2d)
        return
      }
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y }
      const hitWall = head.x < 0 || head.x >= grid || head.y < 0 || head.y >= grid
      const hitSelf = snake.slice(1).some((s) => s.x === head.x && s.y === head.y)
      if (hitWall || hitSelf) {
        setGameOver(true)
        return
      }
      snake.unshift(head)
      if (head.x === food.x && head.y === food.y) {
        setScore((s) => s + 1)
        placeFood()
      } else {
        snake.pop()
      }
      draw(ctx2d)
    }

    if (running && !gameOver) {
      const id = setInterval(step, 120)
      return () => clearInterval(id)
    }
    draw(ctx2d)
  }, [running, gameOver])

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const d = nextDirRef.current
      if (e.key === 'ArrowUp' && d.y !== 1) nextDirRef.current = { x: 0, y: -1 }
      if (e.key === 'ArrowDown' && d.y !== -1) nextDirRef.current = { x: 0, y: 1 }
      if (e.key === 'ArrowLeft' && d.x !== 1) nextDirRef.current = { x: -1, y: 0 }
      if (e.key === 'ArrowRight' && d.x !== -1) nextDirRef.current = { x: 1, y: 0 }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const start = () => {
    nextDirRef.current = { x: 0, y: 0 }
    setScore(0)
    setGameOver(false)
    setRunning(true)
  }

  return (
    <div className="games-game-card">
      <div className="games-game-header">
        <h3 className="games-game-title">Змейка</h3>
        <div className="games-game-stats">
          <span className="games-stat-value">{score}</span>
          <span className="games-stat-label">Очки</span>
        </div>
      </div>
      <div className="games-canvas-wrap">
        <canvas ref={canvasRef} className="games-canvas" />
        {!running && !gameOver && (
          <div className="games-overlay">
            <p>Стрелки — управление</p>
            <button type="button" className="games-btn" onClick={start}>Старт</button>
          </div>
        )}
        {gameOver && (
          <div className="games-overlay">
            <p>Игра окончена. Очки: {score}</p>
            <button type="button" className="games-btn" onClick={start}>Заново</button>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Games() {
  return (
    <div className="games-page">
      <div className="games-hero">
        <div className="games-terminal-frame">
          <div className="games-terminal-header">
            <div className="games-terminal-dots">
              <span className="games-dot red" />
              <span className="games-dot yellow" />
              <span className="games-dot green" />
            </div>
            <span className="games-terminal-title">Мини-игры</span>
          </div>
          <div className="games-terminal-body">
            <div className="games-terminal-line">
              <span className="games-prompt">user@botstory:~$</span>
              <span className="games-cmd">./play_games.sh</span>
            </div>
            <div className="games-terminal-line games-output">
              Откройте игру ниже или введите <code>games</code> в терминале уровня.
            </div>
          </div>
        </div>
      </div>
      <section className="games-section">
        <h2 className="games-section-title">Игры</h2>
        <div className="games-grid">
          <SnakeGame />
          <div className="games-game-card games-coming">
            <h3 className="games-game-title">Скоро ещё</h3>
            <p className="games-coming-text">Новые игры появятся здесь.</p>
          </div>
        </div>
      </section>
      <p className="games-back">
        <Link to="/">← На главную</Link>
        {' · '}
        <Link to="/levels">К миссиям</Link>
      </p>
    </div>
  )
}
