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

### Ошибка «Incorrect email or password» / «trapped bcrypt»

- Вход: используйте `admin@botstory.com` / `admin` после создания админа через `create_admin_simple.py`.
- Если при создании админа падает bcrypt — в проекте используется прямой `bcrypt` в `app/core/security.py` и в `create_admin_simple.py`; убедитесь, что не вызывается старый `create_admin.py` с passlib.

### Frontend не подключается к API

- Проверьте, что backend отвечает: `curl http://localhost:8000/health`
- В dev Vite проксирует `/api` на backend; проверьте `frontend/vite.config.ts` (proxy target).

### Прогресс не сохраняется / «Network Error» при завершении уровня

- Убедитесь, что **бэкенд запущен** и доступен: в браузере или в терминале выполните `curl http://localhost:8000/health` — должен вернуться `{"status":"healthy"}`.
- Если фронт открыт на `localhost:5173`, запросы сохранения идут на `http://localhost:8000` (или на значение `VITE_API_URL` в `.env` фронта). Запустите все сервисы: `docker-compose up -d` или отдельно backend на порту 8000.
- В логах backend при сохранении не должно быть исключений: `docker-compose logs -f backend` (завершите уровень и посмотрите вывод).

### Пустой список уровней / 401 в консоли

- Выполнен ли вход; не истёк ли JWT.
- После перезапуска backend токен остаётся валидным, пока не истечёт срок (настройка в backend).

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

---

## Лицензия

MIT
