# API Руководство

Документация REST API платформы «Legend of B.O.T.» (обучение программированию на Кумире). Состояние API соответствует текущей реализации бэкенда.

## Base URL

```
http://localhost:8000/api/v1
```

Роутер подключён в `main.py` с префиксом `/api/v1`, поэтому все эндпоинты ниже относительны к этому базовому пути.

---

## Аутентификация

Защищённые эндпоинты требуют JWT в заголовке:

```
Authorization: Bearer <access_token>
```

Токен выдаётся при успешном `POST /auth/login`. Срок жизни задаётся в `settings.ACCESS_TOKEN_EXPIRE_MINUTES`.

**Почему JWT:** единый токен для SPA без сессий на сервере; фронт хранит токен и передаёт его с каждым запросом. Роль пользователя зашита в payload токена и используется для проверки прав (admin/user).

---

## Authentication (`/auth`)

Роутер: `auth.router`, префикс `/auth`. Регистрация и вход — без токена.

### POST `/auth/register`

Регистрация нового пользователя.

**Request body (JSON):**
```json
{
  "email": "user@example.com",
  "username": "username",
  "password": "password123"
}
```

**Response:** `201 Created`, схема `UserResponse`:
```json
{
  "id": 1,
  "email": "user@example.com",
  "username": "username",
  "role": "user",
  "is_active": true,
  "created_at": "2024-01-15T10:30:00"
}
```

**Ошибки:** `400` — "Email already registered" или "Username already taken".

**Почему так:** один пользователь = один email и один username; дубликаты запрещены. Роль при регистрации всегда `user` (задаётся в коде, не из тела запроса).

---

### POST `/auth/login`

Вход. Используется форма OAuth2 (application/x-www-form-urlencoded), как ожидает стандартный FastAPI OAuth2PasswordRequestForm.

**Request (form data):**
```
username=user@example.com
password=password123
```

Поле `username` в форме — на самом деле **email** (поиск пользователя по `User.email`, без учёта регистра).

**Response:** `200 OK`
```json
{
  "access_token": "eyJhbGc...",
  "token_type": "bearer"
}
```

**Ошибки:** `401` — "Incorrect email or password"; `403` — "User account is inactive".

**Почему так:** OAuth2-совместимый поток; фронт отправляет форму, получает токен и дальше подставляет его в `Authorization: Bearer ...`. Поиск по email, а не по username, чтобы входить одним уникальным идентификатором.

---

## Users (`/users`)

Роутер: `users.router`, префикс `/users`. Везде, кроме списка пользователей, работа идёт с текущим пользователем (`/me`).

### GET `/users/me`

Профиль текущего пользователя. Требует авторизации (`get_current_user`).

**Response:** `200 OK`, `UserResponse` (id, email, username, role, is_active, created_at).

---

### GET `/users/me/stats`

Статистика прогресса: сколько уровней пройдено из общего числа активных. Нужна для отображения прогресса на фронте (например, в профиле или LevelHub).

**Response:** `200 OK`
```json
{
  "completed": 5,
  "total": 10,
  "progress_percent": 50
}
```

**Почему так:** один запрос даёт и число, и процент; фронту не нужно отдельно запрашивать уровни и прогресс.

---

### GET `/users/me/progress`

Список пар (level_id, completed) по всем уровням для текущего пользователя. Используется для отображения «пройдено / не пройдено» по каждому уровню (например, бейджи в LevelHub).

**Response:** `200 OK`
```json
[
  { "level_id": 1, "completed": true },
  { "level_id": 2, "completed": false }
]
```

**Почему так:** один запрос вместо N запросов к `/levels/{id}/progress`; достаточно для фильтров и бейджей.

---

### PATCH `/users/me`

Обновление профиля. Тело — частичное (только переданные поля обновляются).

**Request (JSON):**
```json
{
  "email": "new@example.com",
  "username": "newname",
  "password": "newpassword"
}
```

Все поля опциональны. Проверка уникальности email и username при изменении (конфликт с другими пользователями → `400`).

**Response:** `200 OK`, `UserResponse`.

---

### GET `/users/` 🔒 Admin only

Список всех пользователей. Зависимость `get_current_admin`.

**Query:** `skip` (default 0), `limit` (default 100).

**Response:** `200 OK`, массив `UserResponse`.

**Почему так:** нужен только админу для модерации/управления; обычные пользователи не видят список других.

---

## Levels (`/levels`)

Роутер: `levels.router`, префикс `/levels`. Уровни — основа геймификации: карта, нарратив, эталонный код, прогресс пользователя.

### GET `/levels`

Список **активных** уровней. Авторизация опциональна (`get_optional_user`): без токена тоже можно получить список (для лендинга/превью).

**Query:** `skip`, `limit` (default 100). Уровни сортируются по полю `order`.

**Response:** `200 OK`, массив `LevelResponse` (id, title, description, narrative, order, difficulty, map_data, is_active, created_at).

**Почему так:** неактивные уровни (soft delete) не отдаются; порядок явно задаётся полем `order` в админке.

---

### GET `/levels/{level_id}`

Детали одного уровня. Авторизация опциональна.

**Response:** `200 OK`, `LevelDetailResponse`. Поля `golden_code` и `golden_steps_count` заполняются **только для пользователя с ролью admin**; иначе в ответе `null`, чтобы эталон решения не утекал.

**Почему так:** эталон нужен только админке и симулятору; игрокам показываем только карту и нарратив.

---

### POST `/levels` 🔒 Admin only

Создание уровня. Тело — `LevelCreate`: title, description (optional), narrative, order, difficulty, map_data, golden_code, golden_steps_count.

**Ошибка:** `400` — "Level with order N already exists". Порядок должен быть уникальным.

**Response:** `201 Created`, `LevelResponse`.

---

### PATCH `/levels/{level_id}` 🔒 Admin only

Частичное обновление уровня. Схема `LevelUpdate` — все поля опциональны.

**Response:** `200 OK`, `LevelResponse`.

---

### DELETE `/levels/{level_id}` 🔒 Admin only

«Удаление» уровня: в БД выставляется `is_active = False`. Запись не удаляется, чтобы не ломать ссылки на прогресс и историю.

**Response:** `204 No Content`.

**Почему так:** soft delete сохраняет целостность данных по прогрессу и сообщениям, при этом уровень перестаёт отдаваться в GET `/levels`.

---

### GET `/levels/{level_id}/progress`

Прогресс **текущего** пользователя по уровню. Требует авторизации.

**Response:** `200 OK`, `LevelProgressResponse` (id, user_id, level_id, completed, steps_count, attempts, best_steps_count, completed_at, created_at). Если прогресса нет — `404`.

**Почему так:** прогресс привязан к пользователю; один запрос — один уровень, для детальной страницы уровня или повторной отправки решения.

---

### POST `/levels/{level_id}/progress`

Отправка решения уровня. Создаёт или обновляет запись прогресса: сохраняет код, число шагов, помечает уровень как пройденный, обновляет best_steps_count при улучшении.

**Request (JSON):**
```json
{
  "level_id": 1,
  "user_code": "вперед\nвперед\nналево",
  "steps_count": 7
}
```

**Response:** `200 OK`, `LevelProgressResponse`.

**Почему так:** сервер не перепроверяет код через исполнитель; доверяем клиенту (исполнитель уже вызван на фронте через `/execute`). Сервер только фиксирует факт прохождения и метрики.

---

## Execute (`/execute`)

Роутер: `execute.router`, префикс `/execute`. Выполнение кода Кумир для уровня на сервере.

### POST `/execute`

Запуск кода на карте уровня. Требует авторизации.

**Request (JSON):**
```json
{
  "level_id": 1,
  "code": "вперед\nвперед\nнаправо\nвперед"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "reached_finish": true,
  "steps_count": 4,
  "history": [[1, 1, 0], [1, 2, 0], ...],
  "final_position": {"x": 2, "y": 4, "direction": 1},
  "error": null,
  "is_optimal": true,
  "golden_steps_count": 4
}
```

При ошибке выполнения (например, столкновение со стеной): `400 Bad Request`, в `detail` — текст ошибки от `KumirExecutor`. Поля `is_optimal` и `golden_steps_count` заполняются только при успешном достижении финиша, для сравнения с эталоном.

**Почему так:** логика движения и валидация на сервере — единственный источник правды; клиент не может «схитрить». История шагов и финальная позиция нужны для визуализации на фронте.

---

### GET `/execute/test`

Тестовый запуск исполнителя на фиксированной карте. **Без авторизации.** Используется для отладки исполнителя Кумир.

**Response:** JSON с результатом выполнения тестового кода или полем `error`.

**Почему так:** отдельный эндпоинт, чтобы не засорять основной POST и не требовать уровень из БД.

---

## Notes (`/notes`)

Роутер: `notes.router`, префикс `/notes`. Заметки пользователя (к уровню или общие). Все эндпоинты требуют авторизации.

### GET `/notes`

Список заметок текущего пользователя.

**Query:** `level_id` (optional) — фильтр по уровню; `skip`, `limit` (default 100).

**Response:** `200 OK`, массив `NoteResponse` (id, user_id, level_id, content, type, created_at, updated_at). Тип — enum: `"custom"` или `"highlight"`.

**Почему так:** заметки приватные; фильтр по level_id нужен для отображения заметок в контексте уровня.

---

### POST `/notes`

Создание заметки. `user_id` подставляется из токена.

**Request (JSON):**
```json
{
  "content": "Моя заметка",
  "level_id": 1,
  "type": "custom"
}
```

`level_id` и `type` опциональны (по умолчанию type = custom). Enum типа: `highlight`, `custom`.

**Response:** `201 Created`, `NoteResponse`.

---

### PATCH `/notes/{note_id}`

Обновление заметки. Можно менять только свои заметки (проверка `note.user_id == current_user.id`).

**Request:** схема `NoteUpdate` (content, type — оба опциональны).

**Response:** `200 OK`, `NoteResponse`. Иначе `404`.

---

### DELETE `/notes/{note_id}`

Удаление заметки. Только своя. **Response:** `204 No Content`.

---

## Highlights (`/highlights`)

Роутер: `highlights.router`, префикс `/highlights`. Выделения фрагментов текста по уровню (для подсказок/аннотаций). Все эндпоинты с авторизацией.

### GET `/highlights/level/{level_id}`

Все выделения текущего пользователя для уровня. Сортировка по `char_start`.

**Response:** `200 OK`, массив `HighlightResponse` (id, user_id, level_id, text_fragment, color, char_start, char_end, created_at). Цвет: enum `"red"` или `"yellow"`.

**Почему так:** маршрут `/level/{level_id}`, а не `/levels/{level_id}/highlights`, чтобы префикс `/highlights` был общим для всех операций с выделениями.

---

### POST `/highlights`

Создание выделения.

**Request (JSON):**
```json
{
  "level_id": 1,
  "text_fragment": "важный текст",
  "color": "yellow",
  "char_start": 100,
  "char_end": 113
}
```

**Response:** `201 Created`, `HighlightResponse`.

---

### DELETE `/highlights/{highlight_id}`

Удаление выделения. Только своё. **Response:** `204 No Content`.

---

## Messages (`/messages`)

Роутер: `messages.router`, префикс `/messages`. Чат по уровню: сообщения видят все авторизованные, создаёт — любой авторизованный, удалять может только админ.

### GET `/messages/level/{level_id}`

Сообщения чата уровня. Только не удалённые (`is_deleted == False`). В каждом сообщении дополняются поля `username` и `has_completed` (прошёл ли автор уровень — для бейджа «ветеран»). Если в тексте есть подстрока `[spoiler]`, в ответе выставляется `is_spoiler: true`.

**Query:** `skip`, `limit` (default 100).

**Response:** `200 OK`, массив `MessageResponse` (id, level_id, user_id, content, is_spoiler, created_at, is_deleted, username, has_completed).

**Почему так:** один запрос отдаёт всё нужное для отрисовки чата; спойлеры помечаются на сервере по контенту.

---

### POST `/messages`

Отправка сообщения в чат уровня.

**Request (JSON):**
```json
{
  "level_id": 1,
  "content": "Подсказка: используйте [spoiler]вперед\nвперед[/spoiler]"
}
```

**Валидация:** если в `content` есть ключевые слова Кумир (нц, кц, вперед, налево, направо, пока, если, то, иначе), но нет обёртки `[spoiler]...[/spoiler]`, возвращается `422` с сообщением о необходимости обернуть код в спойлер.

**Response:** `201 Created`, `MessageResponse` (с подставленными username и has_completed).

**Почему так:** защита от случайного спойлера решения в общем чате; код в сообщениях допустим только внутри тега спойлера.

---

### DELETE `/messages/{message_id}` 🔒 Admin only

Модерация: мягкое удаление сообщения (`is_deleted = True`). Запись в БД остаётся, в GET она не отдаётся.

**Response:** `204 No Content`.

**Почему так:** soft delete сохраняет историю для разбора инцидентов; обычные пользователи не могут удалять чужие сообщения.

---

## News (`/news`)

Роутер: `news.router`, префикс `/news`. Новости для лендинга: публично видны только опубликованные; админ видит все и может создавать/редактировать/удалять.

### GET `/news`

Список новостей. Авторизация опциональна.

- **Без токена или с ролью не admin:** только записи с `is_published == True`.
- **С ролью admin:** все новости (включая черновики).

**Query:** `skip` (default 0), `limit` (default 20). Сортировка по `created_at` по убыванию.

**Response:** `200 OK`, массив `NewsResponse` (id, title, content, author_id, is_published, created_at, updated_at).

**Почему так:** лендинг запрашивает список без токена и видит только опубликованное; админка с токеном получает полный список для редактирования.

---

### GET `/news/{news_id}`

Одна новость. Неопубликованную может получить только админ; иначе `404` с "News not found" (без раскрытия факта существования).

**Response:** `200 OK`, `NewsResponse`.

---

### POST `/news` 🔒 Admin only

Создание новости. В БД подставляется `author_id = current_user.id`.

**Request (JSON):**
```json
{
  "title": "Новая новость",
  "content": "Содержание...",
  "is_published": false
}
```

`is_published` по умолчанию false в схеме `NewsCreate`. **Response:** `201 Created`, `NewsResponse`.

---

### PATCH `/news/{news_id}` 🔒 Admin only

Частичное обновление. Схема `NewsUpdate`: title, content, is_published — все опциональны.

**Response:** `200 OK`, `NewsResponse`.

---

### DELETE `/news/{news_id}` 🔒 Admin only

Жёсткое удаление новости из БД. **Response:** `204 No Content`.

**Почему так:** новости не связаны с прогрессом пользователей, поэтому допустимо полное удаление; админка должна уметь убирать ошибочные или устаревшие записи.

---

## Коды ответов и ошибки

| Код | Значение |
|-----|----------|
| 200 | OK |
| 201 | Created (ресурс создан) |
| 204 | No Content (успех без тела, например после DELETE) |
| 400 | Bad Request (некорректные данные или бизнес-ограничение) |
| 401 | Unauthorized (нет или невалидный токен) |
| 403 | Forbidden (недостаточно прав, например не admin) |
| 404 | Not Found (ресурс не найден) |
| 422 | Unprocessable Entity (ошибка валидации Pydantic) |
| 500 | Internal Server Error |

Тело ошибки FastAPI обычно в формате `{"detail": "строка или массив объектов"}`. Для 422 `detail` — список ошибок по полям.

---

## Интерактивная документация

- **Swagger UI:** http://localhost:8000/docs  
- **ReDoc:** http://localhost:8000/redoc  

Там отражены все эндпоинты, схемы запроса/ответа и можно вызывать API из браузера.
