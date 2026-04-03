import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useEffect, useState } from 'react'
import { newsAPI, updatesAPI } from '../services/api'
import './Landing.css'

const MARQUEE_TAGS = [
  'JavaScript', 'TypeScript', 'Python', 'React', 'Vue', 'Node.js',
  'C#', 'Java', 'Kotlin', 'Go', 'Rust', 'Django', 'FastAPI',
  'Angular', 'Svelte', 'PostgreSQL', 'Redis', 'Docker',
]

export default function Landing() {
  const { isAuthenticated } = useAuthStore()
  const [news, setNews] = useState<any[] | null>(null)
  const [latestUpdate, setLatestUpdate] = useState<any | null | undefined>(undefined)

  useEffect(() => {
    let cancelled = false
    const idleRunner = (cb: () => void) => {
      if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
        ;(window as any).requestIdleCallback(cb, { timeout: 1500 })
      } else {
        globalThis.setTimeout(cb, 250)
      }
    }

    idleRunner(() => {
      if (cancelled) return
      newsAPI.getAll().then(res => {
        if (!cancelled) setNews(Array.isArray(res.data) ? res.data : [])
      }).catch(() => {
        if (!cancelled) setNews([])
      })
      updatesAPI.getLatest().then(res => {
        if (!cancelled) setLatestUpdate(res.data || null)
      }).catch(() => {
        if (!cancelled) setLatestUpdate(null)
      })
    })

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="landing-container">
      <div className="landing-bg-grid" aria-hidden />
      <div className="landing-bg-orb landing-bg-orb-1" aria-hidden />
      <div className="landing-bg-orb landing-bg-orb-2" aria-hidden />

      <section className="hero">
        <div
          className="hero-content"
        >
          <div
            className="hero-badge"
          >
            NEXT-GEN EDUCATION
          </div>

          <h1 className="hero-title">
            <span className="hero-title-line">LEGEND OF</span>
            <span className="hero-title-accent">B.O.T.</span>
          </h1>

          <p className="hero-subtitle">
            Изучай программирование в киберпространстве будущего. Решай задачи, управляй B.O.T. и становись мастером кода.
          </p>

          <div className="hero-stats">
            <div className="stat-item">
              <div className="stat-value">∞</div>
              <div className="stat-label">Возможностей</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">100%</div>
              <div className="stat-label">Результат</div>
            </div>
            <div className="stat-item">
              <div className="stat-value">0+</div>
              <div className="stat-label">лет</div>
            </div>
          </div>

          <div className="hero-buttons">
            {isAuthenticated ? (
              <Link to="/levels" className="glass-btn glass-btn-primary">
                ▶ НАЧАТЬ МИССИЮ
              </Link>
            ) : (
              <>
                <Link to="/register" className="glass-btn glass-btn-primary">
                  ◉ НАЧАТЬ ПУТЕШЕСТВИЕ
                </Link>
                <Link to="/login" className="glass-btn glass-btn-outline">
                  ◈ ВХОД В СИСТЕМУ
                </Link>
              </>
            )}
          </div>

          <div className="scroll-indicator">
            <div className="scroll-line" />
            <div className="scroll-text">SCROLL</div>
          </div>
        </div>

        <div className="hero-visual">
          <div className="display-container">
            <div className="display-screen">
              <div className="display-header">
                <div className="display-dots">
                  <span className="display-dot red" />
                  <span className="display-dot yellow" />
                  <span className="display-dot green" />
                </div>
                <span className="display-title">Terminal</span>
              </div>
              <div className="display-content">
                <div className="display-line">
                  <span className="display-prompt">user@botstory:~$</span>
                  <span className="display-cmd">./welcome.sh</span>
                </div>
                <div className="display-line">
                  <span className="display-output">Legend of B.O.T. — образовательная платформа</span>
                </div>
                <div className="display-line">
                  <span className="display-prompt">user@botstory:~$</span>
                  <span className="display-cmd">cat mission.txt</span>
                </div>
                <div className="display-line">
                  <span className="display-output">Управляй роботом. Пиши код на Кумире.</span>
                </div>
                <div className="display-line">
                  <span className="display-prompt">user@botstory:~$</span>
                  <span className="display-cmd">./start_mission</span>
                </div>
                <div className="display-line">
                  <span className="display-output">Готов к миссии.</span>
                </div>
                <div className="display-line">
                  <span className="display-prompt">user@botstory:~$</span>
                  <span className="display-cmd">./play_games.sh</span>
                </div>
                <div className="display-line">
                  <Link to="/games" className="display-output display-gamelink">Открыть мини-игры →</Link>
                </div>
                <div className="display-line">
                  <span className="display-prompt">user@botstory:~$</span>
                  <span className="display-cursor" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="marquee-section">
        <h2 className="marquee-title">Возможные будущие языки и фреймворки</h2>
        <div className="marquee-wrap">
          <div className="marquee-track">
            {[...MARQUEE_TAGS, ...MARQUEE_TAGS].map((tag, i) => (
              <span key={i} className="marquee-tag">{tag}</span>
            ))}
          </div>
        </div>
      </section>

      <section id="features" className="features">
        <h2 className="section-title">
          СИСТЕМНЫЕ ВОЗМОЖНОСТИ НА ДАННЫЙ МОМЕНТ
        </h2>
        <div className="features-grid">
          {[
            { icon: '⚡', title: 'ИГРОВОЙ ДВИЖОК', desc: 'Решай задачи, управляя B.O.T. на изометрической карте в реальном времени' },
            { icon: '💻', title: 'ЯЗЫК КУМИР', desc: 'Изучай программирование на понятном русском языке с подсветкой синтаксиса' },
            { icon: '📊', title: 'УМНЫЙ АНАЛИЗ', desc: 'Получай обратную связь и сравнивай своё решение с оптимальным' },
            { icon: '📖', title: 'ЦИФРОВОЙ ДНЕВНИК', desc: 'Сохраняй заметки, выделяй ключевые моменты в предысториях' },
            { icon: '💬', title: 'СОЦИАЛЬНАЯ СЕТЬ', desc: 'Обсуждай решения с другими игроками в чатах уровней' },
            { icon: '🎯', title: 'СИСТЕМА ПРОГРЕССА', desc: 'Отслеживай достижения, получай статистику и улучшай навыки' },
          ].map((feature, i) => (
            <div key={i} className="feature-card">
              <div className="feature-icon">{feature.icon}</div>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-desc">{feature.desc}</p>
              <div className="feature-line" />
            </div>
          ))}
        </div>
      </section>

      <section className="news-section">
        {Array.isArray(news) && news.length > 0 && (
          <>
            <h2 className="section-title">
              ТРАНСЛЯЦИИ СИСТЕМЫ
            </h2>
            <div className="news-grid">
              {news.map((item) => (
                <div key={item.id} className="news-card">
                  <div className="news-header">
                    <span className="news-badge">НОВОСТЬ</span>
                    <span className="news-date">{new Date(item.created_at).toLocaleDateString('ru-RU')}</span>
                  </div>
                  <h3 className="news-title">{item.title}</h3>
                  <p className="news-content">{item.content}</p>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="updates-preview-section">
        {latestUpdate !== undefined && latestUpdate && (
          <>
            <h2 className="section-title">
              ПОСЛЕДНЕЕ ОБНОВЛЕНИЕ
            </h2>
            <article
              className="landing-update-card"
              style={{
                ['--upd-accent' as any]: latestUpdate.theme_config?.accent_color || '#8B7ED8',
                ['--upd-secondary' as any]: latestUpdate.theme_config?.secondary_color || '#B8A9E8',
                ['--upd-bg' as any]: latestUpdate.theme_config?.background_gradient || 'linear-gradient(135deg, rgba(139,126,216,0.16), rgba(11,11,20,0.85))',
              }}
            >
              <header className="landing-update-head">
                <span className="landing-update-icon">{latestUpdate.theme_config?.icon || '◉'}</span>
                <div>
                  <h3>{latestUpdate.title}</h3>
                  <p>{new Date(latestUpdate.published_at || latestUpdate.created_at).toLocaleString('ru-RU')}</p>
                </div>
              </header>
              {latestUpdate.summary && <p className="landing-update-summary">{latestUpdate.summary}</p>}
              <div className="landing-update-mini-timeline">
                {(latestUpdate.timeline_events || []).slice(0, 3).map((evt: any, idx: number) => (
                  <div className="landing-update-mini-row" key={`${latestUpdate.id}-${idx}`}>
                    <span className="dot" />
                    <div>
                      <strong>{evt.title}</strong>
                      <p>{evt.description}</p>
                    </div>
                  </div>
                ))}
              </div>
              <Link to="/community" className="landing-update-link">Открыть все обновления в сообществе →</Link>
            </article>
          </>
        )}
      </section>

      <section className="cta-section">
        <div className="cta-content">
          <h2 className="cta-title">ГОТОВ НАЧАТЬ?</h2>
          <p className="cta-text">
            Присоединяйся к тысячам учеников, которые уже осваивают программирование в самой футуристичной образовательной платформе.
          </p>
          {!isAuthenticated && (
            <Link to="/register" className="glass-btn glass-btn-primary">
              ◉ ОТПРАВИТЬСЯ В ПУТЕШЕСТВИЕ
            </Link>
          )}
        </div>
      </section>

      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-logo">LEGEND OF B.O.T.</div>
          <div className="footer-links">
            <a href="#features">О проекте</a>
            <Link to="/levels">К миссиям</Link>
          </div>
          <div className="footer-copy">
            <p>© 2026 Legend of B.O.T. Все права нарушены.</p>
            <p>Powered by Sabitoshi & Dabjam</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
