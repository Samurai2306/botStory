import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { levelAPI, userAPI } from '../services/api'
import { T } from '../i18n/translations'
import './Briefing.css'

interface Level {
  id: number
  title: string
  narrative: string
}

type TerminalTheme = 'windows' | 'macos' | 'linux'
type Locale = 'ru' | 'en'

const MAX_LEVEL_WORDS = 10
const TYPEWRITER_CHAR_MS = 28

type LineEntry = { kind: 'sys' | 'cmd' | 'out' | 'link'; text: string; visibleLength?: number; href?: string }

export default function Briefing() {
  const { id } = useParams()
  const navigate = useNavigate()
  const outRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<number | null>(null)
  const lineQueueRef = useRef<LineEntry[]>([])
  const pendingCommandOutputRef = useRef<LineEntry[]>([])

  const [level, setLevel] = useState<Level | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const [locale, setLocale] = useState<Locale>('ru')
  const [terminalTheme, setTerminalTheme] = useState<TerminalTheme>('linux')
  const [hintWord, setHintWord] = useState<string>('')
  const [levelWords, setLevelWords] = useState<string[]>([])

  const [lines, setLines] = useState<LineEntry[]>([])
  const [command, setCommand] = useState('')

  const levelId = id != null && /^\d+$/.test(String(id)) ? parseInt(id, 10) : null

  const t = useMemo(() => (locale === 'en' ? T.en : T.ru), [locale])

  const prompt = useMemo(() => {
    if (terminalTheme === 'windows') return 'C:\\Users\\user\\botstory>'
    if (terminalTheme === 'macos') return 'user@mac ~ %'
    return 'user@botstory:~$'
  }, [terminalTheme])

  const promptParts = useMemo(() => {
    if (terminalTheme === 'windows') return { user: 'C:\\Users\\user\\botstory>', end: '' }
    if (terminalTheme === 'macos') return { user: 'user@mac', end: ' ~ %' }
    return { user: 'user@botstory:', end: '~$' }
  }, [terminalTheme])

  // Справка с синтаксисом команд, зависящим от типа терминала
  const themeHelpLines = useMemo(() => {
    const isEn = locale === 'en'
    if (terminalTheme === 'windows') {
      return isEn
        ? [
            'Commands (Windows cmd style):',
            'help — show help',
            'type mission.txt — show level description again',
            'start mission.bat — start mission',
            'games.exe — open minigames',
            'add_word <word> — add a level word (max 10)',
            'set_hint <word> — set a global hint word for future levels',
            'cls — clear screen',
            'words — show current level words',
            'hint — show current hint word',
          ]
        : [
            'Команды (стиль Windows):',
            'help — справка',
            'type mission.txt — снова показать описание уровня',
            'start mission.bat — начать миссию',
            'games.exe — открыть мини-игры',
            'add_word <слово> — добавить слово для уровня (до 10)',
            'set_hint <слово> — сохранить слово-подсказку для всех уровней',
            'cls — очистить экран',
            'words — показать текущие слова уровня',
            'hint — показать текущее слово-подсказку',
          ]
    }
    // macOS и Linux — shell-стиль, но текст немного разный
    const descCmd = 'cat mission.txt'
    const startCmd = './start_mission'
    const clearCmd = 'clear'
    const gamesCmd = 'games'
    if (isEn) {
      return [
        'Commands (Unix shell style):',
        'help — show help',
        `${descCmd} — show level description again`,
        `${startCmd} — start mission`,
        `${gamesCmd} — open minigames`,
        'add_word <word> — add a level word (max 10)',
        'set_hint <word> — set a global hint word for future levels',
        `${clearCmd} — clear screen`,
        'words — show current level words',
        'hint — show current hint word',
      ]
    }
    return [
      'Команды (Unix shell):',
      'help — справка',
      `${descCmd} — снова показать описание уровня`,
      `${startCmd} — начать миссию`,
      `${gamesCmd} — открыть мини-игры`,
      'add_word <слово> — добавить слово для уровня (до 10)',
      'set_hint <слово> — сохранить слово-подсказку для всех уровней',
      `${clearCmd} — очистить экран`,
      'words — показать текущие слова уровня',
      'hint — показать текущее слово-подсказку',
    ]
  }, [locale, terminalTheme])

  useEffect(() => {
    return () => {
      if (typingTimeoutRef.current != null) window.clearTimeout(typingTimeoutRef.current)
    }
  }, [])

  const appendLine = (line: LineEntry, typewriter = false) => {
    setLines((prev) => [...prev, typewriter ? { ...line, visibleLength: 0 } : line])
  }

  // Посимвольное появление последней строки; когда строка дописана — достаём следующую из очереди
  useEffect(() => {
    if (lines.length === 0) return
    const last = lines[lines.length - 1]
    if (last.visibleLength == null || last.visibleLength >= last.text.length) {
      if (last.visibleLength != null && last.visibleLength >= last.text.length) {
        const nextFromQueue = lineQueueRef.current.shift()
        const pendingOut = pendingCommandOutputRef.current
        const hasPending = pendingOut.length > 0
        if (hasPending) pendingCommandOutputRef.current = []
        setLines((prev) => {
          const p = prev.slice()
          p[p.length - 1] = { ...p[p.length - 1], visibleLength: undefined }
          if (hasPending) p.push(...pendingOut)
          else if (nextFromQueue) p.push({ ...nextFromQueue, visibleLength: 0 })
          return p
        })
      }
      return
    }
    typingTimeoutRef.current = window.setTimeout(() => {
      setLines((prev) => {
        const p = prev.slice()
        const l = p[p.length - 1]
        if (l.visibleLength == null || l.visibleLength >= l.text.length) return prev
        p[p.length - 1] = { ...l, visibleLength: l.visibleLength + 1 }
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

  useEffect(() => {
    if (!levelId) {
      setLoadError('Неверный адрес уровня')
      return
    }
    setLoadError(null)
    setLines([])
    Promise.all([
      levelAPI.getById(levelId),
      levelAPI.getWords(levelId).catch(() => ({ data: { words: [] as string[] } })),
      userAPI.getProfile().catch(() => ({ data: {} as any })),
    ])
      .then(([lvl, w, u]) => {
        setLevel(lvl.data)
        const words = w.data?.words
        setLevelWords(Array.isArray(words) ? words.slice(0, MAX_LEVEL_WORDS) : [])

        const uLocale = u.data?.locale
        const uTheme = u.data?.terminal_theme
        const uHint = u.data?.hint_word
        setLocale(uLocale === 'en' ? 'en' : 'ru')
        setTerminalTheme(uTheme === 'windows' || uTheme === 'macos' || uTheme === 'linux' ? uTheme : 'linux')
        setHintWord(typeof uHint === 'string' ? uHint : '')

        const narrativeText = String(lvl.data?.narrative || '').trim()
        let narrativeLines: string[] = narrativeText
          ? narrativeText
              .split('\n')
              .map((x: string) => x.trimEnd())
              .filter(Boolean)
          : []
        // Если первая строка — один символ (частая ошибка переноса в данных), склеить со следующей
        if (narrativeLines.length > 1 && narrativeLines[0].length <= 1) {
          narrativeLines = [narrativeLines[0] + narrativeLines[1], ...narrativeLines.slice(2)]
        }
        const introHelp = themeHelpLines.slice(0, 4)

        const queue: LineEntry[] = [
          ...narrativeLines.map((text) => ({ kind: 'sys' as const, text })),
          ...introHelp.map((text) => ({ kind: 'out' as const, text })),
          { kind: 'out', text: '' },
        ]
        lineQueueRef.current = queue
        if (queue.length > 0) {
          const first = queue.shift()!
          appendLine({ ...first, visibleLength: 0 })
        }
      })
      .catch(() => setLoadError('Не удалось загрузить уровень'))
  }, [levelId, themeHelpLines])

  useEffect(() => {
    // Auto-scroll to bottom on new output.
    const el = outRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [lines.length])

  useEffect(() => {
    inputRef.current?.focus()
  }, [level?.id])

  const runCommand = async (raw: string) => {
    const input = raw.trim()
    if (!input) return
    const lower = input.toLowerCase()

    // Команду показываем посимвольно (как будто печатает человек)
    appendLine({ kind: 'cmd', text: `${prompt} ${input}` }, true)

    const [cmd, ...rest] = input.split(/\s+/)
    const arg = rest.join(' ').trim()

    const out: LineEntry[] = []

    // help всегда одна, но текст — по теме терминала
    if (cmd === 'help') {
      themeHelpLines.forEach((x: string) => out.push({ kind: 'out', text: x }))
    }
    // Описание уровня
    else if (
      (terminalTheme !== 'windows' && cmd === 'cat' && rest[0] === 'mission.txt') ||
      (terminalTheme === 'windows' && lower === 'type mission.txt')
    ) {
      const narrativeText = String(level?.narrative || '').trim()
      const narrativeLines = narrativeText
        ? narrativeText.split('\n').map((x: string) => x.trimEnd()).filter(Boolean)
        : []
      if (narrativeLines.length === 0) {
        out.push({ kind: 'out', text: locale === 'en' ? 'No description.' : 'Описание уровня не задано.' })
      } else {
        narrativeLines.forEach((text: string) => out.push({ kind: 'sys', text }))
      }
    }
    // Очистка экрана
    else if (
      (terminalTheme === 'windows' && cmd === 'cls') ||
      (terminalTheme !== 'windows' && cmd === 'clear')
    ) {
      setLines([])
      return
    }
    // Мини-игры
    else if (
      (terminalTheme === 'windows' && lower === 'games.exe') ||
      (terminalTheme !== 'windows' && cmd === 'games')
    ) {
      out.push({
        kind: 'link',
        text: locale === 'en' ? 'Click to open minigames' : 'Открыть мини-игры',
        href: '/games',
      })
    }
    // Старт миссии
    else if (
      (terminalTheme === 'windows' && lower === 'start mission.bat') ||
      (terminalTheme !== 'windows' && cmd === './start_mission')
    ) {
      pendingCommandOutputRef.current = []
      navigate(`/level/${id}/play`)
      return
    } else if (cmd === 'words') {
      out.push({ kind: 'out', text: levelWords.length ? levelWords.join(', ') : '(empty)' })
    } else if (cmd === 'hint') {
      out.push({ kind: 'out', text: hintWord || '(empty)' })
    } else if (cmd === 'add_word') {
      if (!arg) out.push({ kind: 'out', text: t.emptyArg })
      else {
        const nextWord = arg.split(/\s+/)[0].trim()
        if (!nextWord) out.push({ kind: 'out', text: t.emptyArg })
        else if (!levelId) { /* no output */ }
        else if (levelWords.length >= MAX_LEVEL_WORDS) out.push({ kind: 'out', text: t.wordsLimit })
        else {
          const next = [...levelWords, nextWord].slice(0, MAX_LEVEL_WORDS)
          try {
            await levelAPI.setWords(levelId, { words: next })
            setLevelWords(next)
            out.push({ kind: 'out', text: t.addedWord(nextWord) })
          } catch {
            out.push({ kind: 'out', text: 'Error' })
          }
        }
      }
    } else if (cmd === 'set_hint') {
      if (!arg) out.push({ kind: 'out', text: t.emptyArg })
      else {
        const nextHint = arg.split(/\s+/)[0].trim()
        if (!nextHint) out.push({ kind: 'out', text: t.emptyArg })
        else {
          try {
            await userAPI.updateProfile({ hint_word: nextHint })
            setHintWord(nextHint)
            out.push({ kind: 'out', text: t.savedHint(nextHint) })
          } catch {
            out.push({ kind: 'out', text: 'Error' })
          }
        }
      }
    } else {
      out.push({ kind: 'out', text: t.unknownCommand(cmd) })
    }

    pendingCommandOutputRef.current = out
  }

  if (loadError && !level) {
    return (
      <div className="briefing">
        <div className="briefing-container briefing-error">
          <p className="briefing-error-text">{loadError}</p>
          <button type="button" className="briefing-back-btn" onClick={() => navigate('/levels')}>
            ← К списку уровней
          </button>
        </div>
      </div>
    )
  }

  if (!level) {
    return (
      <div className="briefing">
        <div className="briefing-loading">Загрузка...</div>
      </div>
    )
  }

  return (
    <div className="briefing">
      <div className={`briefing-terminal terminal-theme-${terminalTheme}`}>
        <div className="briefing-terminal-screen">
          <div className={`briefing-terminal-header ${terminalTheme === 'windows' ? 'windows' : ''}`}>
            {terminalTheme !== 'windows' ? (
              <div className="briefing-terminal-dots" aria-hidden>
                <span className="briefing-terminal-dot red" />
                <span className="briefing-terminal-dot yellow" />
                <span className="briefing-terminal-dot green" />
              </div>
            ) : (
              <div className="briefing-terminal-wintitle" aria-hidden>Command Prompt</div>
            )}
            <span className="briefing-terminal-title">{t.terminalTitle}</span>
            <span className="briefing-terminal-badge" title="Уровень">{level.title}</span>
          </div>

          <div className="briefing-terminal-content" ref={outRef}>
            {lines.map((l, idx) => {
              const isEmptyTyping = l.visibleLength === 0 && (l.text?.length ?? 0) > 0
              const showCursor = l.visibleLength != null && l.visibleLength > 0 && l.visibleLength < l.text.length
              return (
                <div
                  key={idx}
                  className={`briefing-terminal-line ${l.kind} ${isEmptyTyping ? 'briefing-terminal-line-empty' : ''}`}
                >
                  {l.kind === 'link' && l.href ? (
                    l.visibleLength != null && l.visibleLength < l.text.length ? (
                      <>
                        {l.text.slice(0, l.visibleLength)}
                        {showCursor && <span className="briefing-terminal-cursor" aria-hidden />}
                      </>
                    ) : (
                      <Link to={l.href} className="briefing-terminal-gamelink">{l.text}</Link>
                    )
                  ) : (
                    <>
                      {l.text.slice(0, l.visibleLength ?? l.text.length)}
                      {showCursor && <span className="briefing-terminal-cursor" aria-hidden />}
                    </>
                  )}
                </div>
              )
            })}
            <div className="briefing-terminal-inputline">
              {promptParts.end ? (
                <>
                  <span className="briefing-terminal-prompt-user">{promptParts.user}</span>
                  <span className="briefing-terminal-prompt-end">{promptParts.end}</span>
                </>
              ) : (
                <span className="briefing-terminal-prompt">{prompt}</span>
              )}
              <input
                ref={inputRef}
                className="briefing-terminal-input"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    const v = command
                    setCommand('')
                    runCommand(v)
                  }
                }}
                placeholder=""
                aria-label={locale === 'en' ? 'Command input' : 'Ввод команды'}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
