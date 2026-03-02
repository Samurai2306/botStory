import { Link } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useEffect, useState } from 'react'
import { newsAPI } from '../services/api'
import { motion } from 'framer-motion'
import './Landing.css'

const MARQUEE_TAGS = [
  'JavaScript', 'TypeScript', 'Python', 'React', 'Vue', 'Node.js',
  'C#', 'Java', 'Kotlin', 'Go', 'Rust', 'Django', 'FastAPI',
  'Angular', 'Svelte', 'PostgreSQL', 'Redis', 'Docker',
]

export default function Landing() {
  const { isAuthenticated } = useAuthStore()
  const [news, setNews] = useState<any[]>([])

  useEffect(() => {
    newsAPI.getAll().then(res => setNews(res.data)).catch(() => {})
  }, [])

  return (
    <div className="landing-container">
      <div className="landing-bg-grid" aria-hidden />
      <div className="landing-bg-orb landing-bg-orb-1" aria-hidden />
      <div className="landing-bg-orb landing-bg-orb-2" aria-hidden />

      <section className="hero">
        <motion.div
          className="hero-content"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <motion.div
            className="hero-badge"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            NEXT-GEN EDUCATION
          </motion.div>

          <motion.h1
            className="hero-title"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <span className="hero-title-line">LEGEND OF</span>
            <span className="hero-title-accent">B.O.T.</span>
          </motion.h1>

          <motion.p
            className="hero-subtitle"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.35 }}
          >
            Изучай программирование в киберпространстве будущего. Решай задачи, управляй B.O.T. и становись мастером кода.
          </motion.p>

          <motion.div
            className="hero-stats"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.2 }}
          >
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
          </motion.div>

          <motion.div
            className="hero-buttons"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.4 }}
          >
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
          </motion.div>

          <motion.div
            className="scroll-indicator"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.8 }}
          >
            <div className="scroll-line" />
            <div className="scroll-text">SCROLL</div>
          </motion.div>
        </motion.div>

        <motion.div
          className="hero-visual"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.6, duration: 0.7 }}
        >
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
                  <span className="display-cursor" />
                </div>
              </div>
            </div>
          </div>
        </motion.div>
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
        <motion.h2
          className="section-title"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          СИСТЕМНЫЕ ВОЗМОЖНОСТИ НА ДАННЫЙ МОМЕНТ
        </motion.h2>
        <div className="features-grid">
          {[
            { icon: '⚡', title: 'ИГРОВОЙ ДВИЖОК', desc: 'Решай задачи, управляя B.O.T. на изометрической карте в реальном времени' },
            { icon: '💻', title: 'ЯЗЫК КУМИР', desc: 'Изучай программирование на понятном русском языке с подсветкой синтаксиса' },
            { icon: '📊', title: 'УМНЫЙ АНАЛИЗ', desc: 'Получай обратную связь и сравнивай своё решение с оптимальным' },
            { icon: '📖', title: 'ЦИФРОВОЙ ДНЕВНИК', desc: 'Сохраняй заметки, выделяй ключевые моменты в предысториях' },
            { icon: '💬', title: 'СОЦИАЛЬНАЯ СЕТЬ', desc: 'Обсуждай решения с другими игроками в чатах уровней' },
            { icon: '🎯', title: 'СИСТЕМА ПРОГРЕССА', desc: 'Отслеживай достижения, получай статистику и улучшай навыки' },
          ].map((feature, i) => (
            <motion.div
              key={i}
              className="feature-card"
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
            >
              <div className="feature-icon">{feature.icon}</div>
              <h3 className="feature-title">{feature.title}</h3>
              <p className="feature-desc">{feature.desc}</p>
              <div className="feature-line" />
            </motion.div>
          ))}
        </div>
      </section>

      {news.length > 0 && (
        <section className="news-section">
          <motion.h2
            className="section-title"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            ТРАНСЛЯЦИИ СИСТЕМЫ
          </motion.h2>
          <div className="news-grid">
            {news.map((item, i) => (
              <motion.div
                key={item.id}
                className="news-card"
                initial={{ opacity: 0, x: i % 2 === 0 ? -30 : 30 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <div className="news-header">
                  <span className="news-badge">НОВОСТЬ</span>
                  <span className="news-date">{new Date(item.created_at).toLocaleDateString('ru-RU')}</span>
                </div>
                <h3 className="news-title">{item.title}</h3>
                <p className="news-content">
                  {item.content.length > 200 ? `${item.content.substring(0, 200)}...` : item.content}
                </p>
              </motion.div>
            ))}
          </div>
        </section>
      )}

      <motion.section
        className="cta-section"
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
      >
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
      </motion.section>

      <footer className="landing-footer">
        <div className="footer-content">
          <div className="footer-logo">LEGEND OF B.O.T.</div>
          <div className="footer-links">
            <a href="#features">О проекте</a>
            <Link to="/levels">К миссиям</Link>
          </div>
          <div className="footer-copy">
            <p>© 2026 Legend of B.O.T. Все права нарушены.</p>
            <p>Powered by Sabitoshi</p>
          </div>
        </div>
      </footer>
    </div>
  )
}
