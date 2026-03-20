import { useRef, useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { T } from '../i18n/translations'
import './CodePanelTerminal.css'

const PROMPT = 'user@botstory:~$'
const TYPEWRITER_CHAR_MS = 28

type LineEntry = { type: 'cmd' | 'out' | 'sys' | 'link'; text: string; visibleLength?: number; href?: string }

interface CodePanelTerminalProps {
  onSwitchToIde: () => void
  onRun: () => void
  isExecuting: boolean
  narrative?: string
  levelTitle?: string
}

const helpLines = T.ru.help

export default function CodePanelTerminal({
  onSwitchToIde,
  onRun,
  isExecuting,
  narrative = '',
  levelTitle = '',
}: CodePanelTerminalProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<number | null>(null)
  const pendingOutputRef = useRef<LineEntry[]>([])

  const [lines, setLines] = useState<LineEntry[]>([
    { type: 'out', text: 'Введите run codeIDE — открыть редактор кода. Введите run — выполнить код.' },
    { type: 'out', text: 'cat mission.txt — описание уровня. games — мини-игры. help — справка. clear — очистить.' },
    { type: 'out', text: '' },
  ])
  const [input, setInput] = useState('')

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    const el = contentRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines.length])

  // Посимвольное появление последней строки (команды); по завершении — вывести накопленный вывод
  useEffect(() => {
    if (lines.length === 0) return
    const last = lines[lines.length - 1]
    if (last.visibleLength == null || last.visibleLength >= last.text.length) {
      if (last.visibleLength != null && last.visibleLength >= last.text.length) {
        const pending = pendingOutputRef.current
        if (pending.length > 0) {
          pendingOutputRef.current = []
          setLines((prev) => [...prev.slice(0, -1), { ...last, visibleLength: undefined }, ...pending])
        } else {
          setLines((prev) => {
            const p = prev.slice()
            p[p.length - 1] = { ...last, visibleLength: undefined }
            return p
          })
        }
      }
      return
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      setLines((prev) => {
        const p = prev.slice()
        const l = p[p.length - 1]
        if (l.visibleLength == null || l.visibleLength >= l.text.length) return prev
        p[p.length - 1] = { ...l, visibleLength: (l.visibleLength ?? 0) + 1 }
        return p
      })
    }, TYPEWRITER_CHAR_MS)
    return () => {
      if (typingTimeoutRef.current != null) {
        window.clearTimeout(typingTimeoutRef.current)
        typingTimeoutRef.current = null
      }
    }
  }, [lines])

  const run = (raw: string) => {
    const trimmed = raw.trim()
    if (!trimmed) return
    const fullCmd = `${PROMPT} ${raw}`
    const parts = trimmed.split(/\s+/)
    const cmd = parts[0].toLowerCase()
    const rest = parts.slice(1)

    if (cmd === 'clear') {
      setLines([{ type: 'cmd', text: fullCmd }])
      setInput('')
      return
    }

    setLines((prev) => [...prev, { type: 'cmd', text: fullCmd, visibleLength: 0 }])
    setInput('')

    if (cmd === 'run' && rest.length > 0 && rest[0].toLowerCase() === 'codeide') {
      pendingOutputRef.current = [{ type: 'out', text: 'Открываю редактор кода...' }]
      onSwitchToIde()
      return
    }
    if (cmd === 'run' && rest.length === 0) {
      onRun()
      pendingOutputRef.current = [{ type: 'out', text: isExecuting ? 'Запуск...' : 'Выполняю код.' }]
      return
    }
    if (cmd === 'cat' && rest[0] === 'mission.txt') {
      const narrativeText = String(narrative || '').trim()
      const narrativeLines = narrativeText
        ? narrativeText.split('\n').map((x) => x.trimEnd()).filter(Boolean)
        : []
      if (narrativeLines.length === 0) {
        pendingOutputRef.current = [{ type: 'out', text: 'Описание уровня не задано.' }]
      } else {
        pendingOutputRef.current = narrativeLines.map((text) => ({ type: 'sys' as const, text }))
      }
      return
    }
    if (cmd === 'help') {
      pendingOutputRef.current = helpLines.map((text) => ({ type: 'out', text }))
      return
    }
    if (cmd === 'games') {
      pendingOutputRef.current = [{ type: 'link', text: 'Открыть мини-игры →', href: '/games' }]
      return
    }
    pendingOutputRef.current = [
      { type: 'out', text: `Неизвестная команда: ${cmd}. Доступны: run codeIDE, run, cat mission.txt, help, clear, games.` },
    ]
  }

  return (
    <div className="code-panel-terminal code-panel-terminal-briefing-style">
      <div className="code-panel-terminal-screen">
        <div className="code-panel-terminal-header">
          <div className="code-panel-terminal-dots" aria-hidden>
            <span className="code-panel-terminal-dot red" />
            <span className="code-panel-terminal-dot yellow" />
            <span className="code-panel-terminal-dot green" />
          </div>
          <span className="code-panel-terminal-title">Terminal</span>
          {levelTitle && (
            <span className="code-panel-terminal-badge" title="Уровень">
              {levelTitle}
            </span>
          )}
        </div>
        <div className="code-panel-terminal-content" ref={contentRef}>
          {lines.map((l, i) => (
            <div key={i} className={`code-panel-terminal-line ${l.type}`}>
              {l.type === 'link' && l.href ? (
                <Link to={l.href} className="code-panel-terminal-gamelink">
                  {l.text}
                </Link>
              ) : l.visibleLength != null ? (
                <>
                  {l.text.slice(0, l.visibleLength)}
                  {l.visibleLength < l.text.length && (
                    <span className="code-panel-terminal-cursor" aria-hidden />
                  )}
                </>
              ) : (
                l.text
              )}
            </div>
          ))}
          <div className="code-panel-terminal-inputline">
            <span className="code-panel-terminal-prompt">{PROMPT}</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run(input)}
              className="code-panel-terminal-input"
              placeholder=" run codeIDE / run / cat mission.txt / help"
              disabled={isExecuting}
              aria-label="Команда"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
