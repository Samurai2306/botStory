import { useNavigate } from 'react-router-dom'
import './Debriefing.css'

interface Props {
  levelId: number
  result: {
    steps_count: number
    is_optimal?: boolean
    golden_steps_count?: number
  }
  goldenSteps?: number
  /** Сравнение с эталоном и блок «эталонных шагов» */
  compareToGolden?: boolean
  progressSaveError?: string | null
  onClose: () => void
  onRetry: () => void
}

export default function Debriefing({
  levelId,
  result,
  goldenSteps,
  compareToGolden = true,
  progressSaveError,
  onClose,
  onRetry,
}: Props) {
  const navigate = useNavigate()

  const isOptimal = compareToGolden
    ? result.steps_count <= (goldenSteps || result.golden_steps_count || Infinity)
    : Boolean(result.is_optimal)

  return (
    <div className="debriefing">
      <div className="debriefing-card">
        <h1>Миссия завершена!</h1>
        {progressSaveError && (
          <div className="debriefing-save-error" role="alert">
            Не удалось сохранить прогресс: {progressSaveError}. Вернитесь к уровням и зайдите в миссию снова — прохождение сохранится при следующей попытке.
          </div>
        )}
        
        <div className="result-summary">
          <div className="result-stat">
            <div className="stat-label">Ваше решение</div>
            <div className="stat-value">{result.steps_count} шагов</div>
          </div>
          
          {compareToGolden && goldenSteps ? (
            <div className="result-stat">
              <div className="stat-label">Эталон</div>
              <div className="stat-value">{goldenSteps} шагов</div>
            </div>
          ) : null}
        </div>

        {compareToGolden ? (
          isOptimal ? (
            <div className="result-message success">
              <h2>Отличная работа!</h2>
              <p>Ваше решение оптимально!</p>
            </div>
          ) : (
            <div className="result-message">
              <h2>Можно лучше!</h2>
              <p>Попробуйте найти более короткий путь</p>
            </div>
          )
        ) : (
          <div className="result-message success">
            <h2>Миссия засчитана</h2>
            <p>Эталонные шаги скрыты в настройках профиля.</p>
          </div>
        )}
        
        <div className="debriefing-actions">
          <button onClick={onRetry} className="btn-retry">
            Попробовать снова
          </button>
          <button 
            onClick={() => navigate(`/level/${levelId}/play`)} 
            className="btn-chat"
          >
            К миссии (чат)
          </button>
          <button onClick={onClose} className="btn-next">
            К уровням
          </button>
        </div>
      </div>
    </div>
  )
}
