import { EditorState } from '@codemirror/state'
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, scrollPastEnd } from '@codemirror/view'
import { defaultKeymap } from '@codemirror/commands'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { useEffect, useRef } from 'react'
import './CodeEditor.css'

interface Props {
  value: string
  onChange: (value: string) => void
  onExecute: () => void
  onReset: () => void
  isExecuting: boolean
  onSwitchToTerminal?: () => void
}

// Custom Kumir syntax highlighting
const kumirHighlight = HighlightStyle.define([
  { tag: tags.keyword, color: '#c084fc' },
  { tag: tags.comment, color: 'rgba(139, 126, 216, 0.5)' },
  { tag: tags.number, color: '#fbbf24' },
])

export default function CodeEditor({ value, onChange, onExecute, onReset, isExecuting, onSwitchToTerminal }: Props) {
  const editorRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)

  useEffect(() => {
    if (!editorRef.current) return

    const startState = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightActiveLine(),
        scrollPastEnd(),
        keymap.of(defaultKeymap),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChange(update.state.doc.toString())
          }
        }),
        syntaxHighlighting(kumirHighlight),
        EditorView.theme({
          '&': {
            background: 'rgba(8, 6, 16, 0.98)',
            color: '#e9d5ff',
            fontSize: '14px',
          },
          '.cm-content': {
            padding: '10px 12px',
            fontFamily: '"Rajdhani", "Fira Code", monospace',
          },
          '.cm-gutters': {
            background: 'rgba(12, 10, 22, 0.98)',
            color: 'rgba(139, 126, 216, 0.5)',
            border: 'none',
          },
          '.cm-activeLineGutter': {
            background: 'rgba(139, 126, 216, 0.12)',
            color: 'rgba(184, 169, 232, 0.95)',
          },
          '.cm-activeLine': {
            background: 'rgba(139, 126, 216, 0.08)',
          },
        }),
      ],
    })

    const view = new EditorView({
      state: startState,
      parent: editorRef.current,
    })

    viewRef.current = view

    return () => {
      view.destroy()
    }
  }, [])

  // Update value from outside
  useEffect(() => {
    if (viewRef.current && value !== viewRef.current.state.doc.toString()) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: value,
        },
      })
    }
  }, [value])

  return (
    <div className="code-editor-container">
      <div className="editor-toolbar">
        <button onClick={onExecute} disabled={isExecuting} className="run-btn">
          {isExecuting ? '⏳ Выполнение...' : '▶ Запустить'}
        </button>
        <button onClick={onReset} className="reset-btn">
          🔄 Сброс
        </button>
        {onSwitchToTerminal && (
          <button type="button" onClick={onSwitchToTerminal} className="terminal-btn" title="Вернуться к терминалу">
            ◫ Терминал
          </button>
        )}
        <div className="editor-hint">
          Команды: вперед, налево, направо, использовать, нц N раз ... кц
        </div>
      </div>
      <div ref={editorRef} className="code-editor" />
    </div>
  )
}
