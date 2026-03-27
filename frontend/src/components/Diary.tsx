import { useEffect, useState } from 'react'
import { notesAPI, highlightsAPI } from '../services/api'
import './Diary.css'

interface Props {
  levelId: number
}

interface Note {
  id: number
  content: string
  created_at: string
}

interface Highlight {
  id: number
  text_fragment: string
  color: string
}

export default function Diary({ levelId }: Props) {
  const [notes, setNotes] = useState<Note[]>([])
  const [highlights, setHighlights] = useState<Highlight[]>([])
  const [newNote, setNewNote] = useState('')

  useEffect(() => {
    loadNotes()
    loadHighlights()
  }, [levelId])

  const loadNotes = () => {
    notesAPI.getAll(levelId).then(res => setNotes(res.data || [])).catch(console.error)
  }
  const loadHighlights = () => {
    highlightsAPI.getForLevel(levelId).then(res => setHighlights(res.data || [])).catch(console.error)
  }

  const handleAddNote = () => {
    if (!newNote.trim()) return
    notesAPI.create({ level_id: levelId, content: newNote.trim(), type: 'custom' })
      .then(() => { setNewNote(''); loadNotes() })
      .catch(console.error)
  }

  const handleDeleteNote = (noteId: number) => {
    notesAPI.delete(noteId).then(loadNotes).catch(console.error)
  }

  const formatDate = (s: string) => new Date(s).toLocaleDateString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

  return (
    <div className="diary">
      <section className="diary-section diary-notes">
        <h3 className="diary-section-title">Заметки к уровню</h3>
        <div className="diary-note-form">
          <textarea
            value={newNote}
            onChange={e => setNewNote(e.target.value)}
            placeholder="Добавить заметку во время прохождения..."
            rows={2}
          />
          <button type="button" className="diary-add-btn" onClick={handleAddNote}>
            Добавить
          </button>
        </div>
        <div className="diary-note-list">
          {notes.length === 0 && (
            <p className="diary-empty">Пока нет заметок. Добавьте идеи или выводы по ходу решения.</p>
          )}
          {notes.map(note => (
            <div key={note.id} className="diary-note-item">
              <p className="diary-note-content">{note.content}</p>
              <div className="diary-note-footer">
                <span className="diary-note-date">{formatDate(note.created_at)}</span>
                <button type="button" className="diary-note-delete" onClick={() => handleDeleteNote(note.id)} title="Удалить">
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="diary-section diary-highlights">
        <h3 className="diary-section-title">Выделения из брифинга</h3>
        {highlights.length === 0 ? (
          <p className="diary-empty">Нет сохранённых выделений. Выделите важные места в предыстории перед миссией.</p>
        ) : (
          <div className="diary-highlight-list">
            {highlights.map(h => (
              <div key={h.id} className={`diary-highlight-item ${h.color}`}>
                "{h.text_fragment}"
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
