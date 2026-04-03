# Legend of B.O.T.

> Образовательная платформа для изучения программирования через алгоритмические задачи на синтаксисе языка «Кумир».  
> **B.O.T.** = **B**eing **O**f **T**tomorrow

![Status](https://img.shields.io/badge/status-active-success.svg)
![Version](https://img.shields.io/badge/version-2.1-blue.svg)

---

## Быстрый старт

### Требования

- **Docker** и **Docker Compose**
- Git

### За 5 минут

```bash
git clone https://github.com/Samurai2306/botStory.git
cd botStory

# Запуск всех сервисов
docker-compose up -d

# Инициализация БД (один раз после первого запуска)
docker-compose exec backend alembic upgrade head
docker-compose exec backend python scripts/create_admin_simple.py
docker-compose exec backend python scripts/seed_data.py
```

**Открыть:**  
- Frontend: http://localhost:5173  
- API: http://localhost:8000  
- Документация API: http://localhost:8000/docs  
- Публичный профиль игрока (после логина можно скопировать ссылку в «Профиль»): `http://localhost:5173/user/<username>`  

**Вход администратора:**  
- Email: `admin@botstory.com`  
- Пароль: `admin`  

> После первого входа пароль рекомендуется сменить.

---

## Что запускать и в каком порядке  

| Действие | Команда | Когда |
|----------|---------|--------|
| Поднять сервисы | `docker-compose up -d` | Всегда первым. Поднимает PostgreSQL, Redis, backend, frontend. |
| Миграции БД | `docker-compose exec backend alembic upgrade head` | После первого клонирования и после появления новых миграций. |
| Создать админа | `docker-compose exec backend python scripts/create_admin_simple.py` | Один раз после миграций (или если сбросили БД). |
| Тестовые данные | `docker-compose exec backend python scripts/seed_data.py` | По желанию: уровни и новости. |
| Перезапуск после изменений кода | `docker-compose restart backend` `docker-compose restart frontend` | Код смонтирован в контейнеры — перезапуска достаточно. |
| Полная пересборка | `docker-compose up -d --build` | Если меняли Dockerfile или зависимости. |

---

## Чего не делать и почему

- **Не запускать** `create_admin.py` (старый скрипт) — используйте `create_admin_simple.py`: он не зависит от passlib и корректно работает с bcrypt.
- **Не менять** порты в `docker-compose.yml` без необходимости — frontend ожидает backend на 8000 (через proxy в dev).
- **Не хранить** секреты в репозитории — для production заведите `.env` и не коммитьте его (см. `docs/DEPLOYMENT.md`).
- **SECRET_KEY обязателен**: backend запускается только с заданным ключом JWT (минимум 32 символа). При ротации ключа все ранее выданные токены станут невалидны и потребуется повторный вход.
- **Не выполнять** `alembic downgrade` на production без бэкапа БД — возможна потеря данных.

---

## Как реагировать на типичные проблемы

### Порты заняты (5432, 6379, 8000, 5173)

Измените маппинг портов в `docker-compose.yml` для нужного сервиса, например:

```yaml
ports:
  - "8001:8000"  # backend на 8001 снаружи
```

Или остановите процесс, занимающий порт.

### Backend не стартует / ошибки БД

```bash
# Логи backend
docker-compose logs backend

# Проверка доступности PostgreSQL
docker-compose ps
```

Убедитесь, что контейнер `postgres` в состоянии `Up`. Если БД пересоздавали — заново выполните миграции и скрипт создания админа.

Если backend завершается сразу после старта, проверьте что в окружении задан `SECRET_KEY` (не короче 32 символов).
Если в логах ошибка вида `SECRET_KEY uses a known insecure value`, значит используется запрещенное значение (например `your-secret-key-change-in-production`) — задайте новый случайный ключ длиной от 32 символов в `.env` и/или `docker-compose.yml`.

### Сборка падает при `lookup registry-1.docker.io: no such host`

Проблема не в коде проекта, а в сетевом доступе Docker до Docker Hub (DNS/прокси).

- Проверьте DNS с хоста: `nslookup registry-1.docker.io`
- Проверьте доступность образов: `docker pull node:18-alpine` и `docker pull python:3.11-slim`
- Если нужно, настройте DNS в Docker Desktop (например `8.8.8.8`, `1.1.1.1`) и перезапустите Docker Desktop
- В корпоративной сети при необходимости включите HTTPS proxy/VPN

### Ошибка «Incorrect email or password» / «trapped bcrypt»

- Вход: используйте `admin@botstory.com` / `admin` после создания админа через `create_admin_simple.py`.
- После **пересоздания тома PostgreSQL** админа в БД нет — снова выполните:  
  `docker-compose exec backend python scripts/create_admin_simple.py`
- Если логин не принимается, **сбросьте пароль админа**:  
  `docker-compose exec backend python scripts/create_admin_simple.py --reset`
- Если при создании админа падает bcrypt — в проекте используется прямой `bcrypt` в `app/core/security.py` и в `create_admin_simple.py`; убедитесь, что не вызывается старый `create_admin.py` с passlib.

### Сообщение «Ошибка входа» без уточнения (красный баннер)

Обычно **нет ответа от API** (backend не запущен, неверный `VITE_API_URL`, порт не 8000).

- Проверьте: `curl http://localhost:8000/docs` или откройте в браузере.
- В `frontend` по умолчанию запросы идут на `http://localhost:8000` (`VITE_API_URL`). Если backend на другом порту — задайте переменную или поправьте URL.
- При **`npm run dev` на своей машине** (не в Docker) прокси в `vite.config.ts` направляет `/api` на `127.0.0.1:8000`, а не на хост `backend` (он доступен только внутри docker-сети).

### Frontend не подключается к API

- Проверьте, что backend отвечает: `curl http://localhost:8000/health`
- В dev Vite проксирует `/api` на backend; по умолчанию target — `http://127.0.0.1:8000` (см. `frontend/vite.config.ts`). Для нестандартного адреса: `VITE_PROXY_TARGET=...`.

### Прогресс не сохраняется / «Network Error» при завершении уровня

- Убедитесь, что **бэкенд запущен** и доступен: в браузере или в терминале выполните `curl http://localhost:8000/health` — должен вернуться `{"status":"healthy"}`.
- Если фронт открыт на `localhost:5173`, запросы сохранения идут на `http://localhost:8000` (или на значение `VITE_API_URL` в `.env` фронта). Запустите все сервисы: `docker-compose up -d` или отдельно backend на порту 8000.
- В логах backend при сохранении не должно быть исключений: `docker-compose logs -f backend` (завершите уровень и посмотрите вывод).

### Пустой список уровней / 401 в консоли

- Выполнен ли вход; не истёк ли JWT.
- После перезапуска backend токен остаётся валидным, пока не истечёт срок (настройка в backend).
- После смены `SECRET_KEY` ранее выданные токены автоматически перестают работать — выполните повторный вход.

### Ошибки при `npm install` (frontend)

```bash
cd frontend
rm -rf node_modules package-lock.json
npm install
```

Требуется Node.js 18+.

---

## Структура проекта

```
botStory/
├── backend/          # FastAPI, PostgreSQL, Kumir-исполнитель
│   ├── app/          # API, модели, ядро
│   ├── kumir/        # Интерпретатор команд Кумир
│   └── scripts/      # create_admin_simple.py, seed_data.py
├── frontend/         # React + TypeScript + Vite
│   └── src/          # Страницы, компоненты, store, api
├── docs/             # Документация (API, деплой, архитектура, фичи, конкуренты, ПО)
└── docker-compose.yml
```

---

## Роли пользователей

| Роль | Возможности |
|------|-------------|
| Гость | Лендинг, новости, вход/регистрация |
| Игрок | Уровни, брифинг → игра → дебрифинг, дневник, чаты, профиль |
| Администратор | Всё выше + создание уровней, модерация, новости |

---

## Тесты

| Где | Команда |
|-----|---------|
| Backend (рекомендуется Docker, Python 3.11 в образе) | `docker compose run --rm --no-deps backend pytest tests -v` |
| Frontend | `cd frontend && npm install && npm run test` |

Подробный отчёт по сценариям (12+ тестовых примеров) и расшифровка полей: [docs/converted-document.md](docs/converted-document.md).

## Документация

| Документ | Содержание |
|----------|------------|
| [docs/ARCHITECTURE_AND_DATABASES.md](docs/ARCHITECTURE_AND_DATABASES.md) | Схема приложения, диаграммы, БД (PostgreSQL/Redis) |
| [docs/API_GUIDE.md](docs/API_GUIDE.md) | Описание REST API (эндпоинты, запросы, ответы) |
| [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) | Развёртывание на production (Docker, Nginx, SSL) |
| [docs/FEATURES.md](docs/FEATURES.md) | Реализованный функционал по модулям |
| [docs/COMPETITOR_ANALYSIS.md](docs/COMPETITOR_ANALYSIS.md) | Анализ конкурентов (School 21, Алгоритмика и др.) |
| [docs/SOFTWARE_USED.md](docs/SOFTWARE_USED.md) | Список ПО проекта (зачем и почему) |
| [docs/AGENT_IMPLEMENTATION_WORKFLOW.md](docs/AGENT_IMPLEMENTATION_WORKFLOW.md) | Распределение задач improvement-плана между 4 агентами и правила интеграции |
| [docs/IMPLEMENTATION_FULL_REPORT.md](docs/IMPLEMENTATION_FULL_REPORT.md) | Полный отчет по реализованным задачам, исправлениям и остаточным шагам |

---

## Новые улучшения (P2/P3)

- `COMM-01/02/03`: в сообществе добавлены поток упоминаний, переходы по контексту из уведомлений, а также управление статусом опроса (закрыть/открыть) для автора/админа.
- `ADMIN-01/02`: в админке есть деактивация уровня (soft-delete), а в чате уровня для admin добавлена модерация удаления сообщений.
- `CHAT-01`: чат уровня получает автообновление (polling с более редким режимом на скрытой вкладке).
- `GAME-01`: при запуске пустого кода показывается явная подсказка вместо «тихого» no-op.
- `PWA-01/02/03/04`: добавлены `manifest.webmanifest`, базовый service worker App Shell, локальные draft'ы кода по уровню и офлайн-очередь отправки прогресса с автосинхронизацией при `online`.
- `API-01`: унифицирована стратегия поиска пользователей через общий backend search helper; `community/users` помечен как deprecated-зеркало для совместимости.
- `RT-01/RT-02`: добавлены realtime WebSocket-каналы для unread-count уведомлений и snapshot чата уровня (`/api/v1/realtime/.../ws`) с fallback на polling во фронте.
- `ENG-01`: центр уведомлений получил фильтры (все/непрочитанные/важные) и bulk action "прочитать всё"; в настройках есть quiet mode/digest.
- `PUSH-01`: реализован минимальный in-app browser push (Web Notification API при открытом приложении), включается в настройках.
- `LEARN-01`: добавлен endpoint офлайн-пакета уровней (`/api/v1/levels/offline-package`) и кнопка предзагрузки в хабе уровней.
- `GAM-01`: realtime-каналы позволяют показывать live-обновления достижений/титулов через поток уведомлений (при генерации системных событий backend).
- `PERF-02`: в настройках добавлен `Performance mode` (минимум визуальных эффектов для слабых устройств).
- `OBS-01`: backend возвращает `X-Request-Id` для каждого запроса; безопасный error envelope содержит `request_id`.

---

## Лицензия

MIT
