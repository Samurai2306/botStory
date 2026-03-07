# Руководство по развёртыванию

Краткий запуск описан в корневом [README.md](../README.md). Ниже — полная настройка окружения и production.

## Быстрый старт (Docker)

### 1. Клонирование репозитория

```bash
git clone https://github.com/Samurai2306/botStory.git
cd botStory
```

### 2. Настройка переменных окружения

Создайте файл `.env` в корне проекта:

```env
# Database
DATABASE_URL=postgresql://botstory_user:botstory_pass@postgres:5432/botstory

# Redis
REDIS_URL=redis://redis:6379

# JWT Security
SECRET_KEY=your-super-secret-key-change-this-in-production
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=1440

# CORS
BACKEND_CORS_ORIGINS=["http://localhost:5173","http://localhost:3000"]
```

### 3. Запуск всех сервисов

```bash
docker-compose up -d
```

Это запустит:
- PostgreSQL (порт 5432)
- Redis (порт 6379)
- Backend API (порт 8000)
- Frontend (порт 5173)

### 4. Инициализация базы данных

```bash
# Применить миграции
docker-compose exec backend alembic upgrade head

# Создать администратора (рекомендуется create_admin_simple.py)
docker-compose exec backend python scripts/create_admin_simple.py

# Загрузить тестовые данные
docker-compose exec backend python scripts/seed_data.py
```

### 5. Доступ к приложению

- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:8000
- **API Documentation**: http://localhost:8000/docs
- **Admin credentials**: 
  - Email: admin@botstory.com
  - Password: admin

---

## Локальная разработка (без Docker)

### Backend

```bash
cd backend

# Создать виртуальное окружение
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Установить зависимости
pip install -r requirements.txt

# Запустить PostgreSQL и Redis локально
# Обновить DATABASE_URL и REDIS_URL в .env

# Применить миграции
alembic upgrade head

# Создать админа и загрузить данные
python scripts/create_admin_simple.py
python scripts/seed_data.py

# Запустить сервер
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend

# Установить зависимости
npm install

# Запустить dev-сервер
npm run dev
```

---

## Производственное развёртывание

### На VPS (Ubuntu/Debian)

#### 1. Подготовка сервера

```bash
# Обновить систему
sudo apt update && sudo apt upgrade -y

# Установить Docker и Docker Compose
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo apt install docker-compose -y

# Установить Nginx
sudo apt install nginx -y
```

#### 2. Настройка Nginx

Создайте файл `/etc/nginx/sites-available/botstory`:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:5173;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # API docs
    location /docs {
        proxy_pass http://localhost:8000;
    }

    location /openapi.json {
        proxy_pass http://localhost:8000;
    }
}
```

Активируйте конфигурацию:

```bash
sudo ln -s /etc/nginx/sites-available/botstory /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

#### 3. SSL с Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

#### 4. Настройка production окружения

Обновите `docker-compose.yml` для production:

```yaml
services:
  backend:
    environment:
      - SECRET_KEY=${SECRET_KEY}  # Из переменных окружения
      - DATABASE_URL=${DATABASE_URL}
    restart: always

  frontend:
    environment:
      - VITE_API_URL=https://yourdomain.com
    command: npm run build && npm run preview
    restart: always
```

#### 5. Запуск

```bash
# Клонировать репозиторий
git clone https://github.com/Samurai2306/botStory.git
cd botStory

# Настроить .env с production значениями
nano .env

# Запустить
docker-compose up -d

# Инициализировать БД
docker-compose exec backend alembic upgrade head
docker-compose exec backend python scripts/create_admin_simple.py
docker-compose exec backend python scripts/seed_data.py
```

---

## Мониторинг и обслуживание

### Просмотр логов

```bash
# Все сервисы
docker-compose logs -f

# Конкретный сервис
docker-compose logs -f backend
docker-compose logs -f frontend
```

### Резервное копирование БД

```bash
# Создать бэкап
docker-compose exec postgres pg_dump -U botstory_user botstory > backup_$(date +%Y%m%d).sql

# Восстановить из бэкапа
docker-compose exec -T postgres psql -U botstory_user botstory < backup_20240101.sql
```

### Обновление приложения

```bash
# Получить последние изменения
git pull origin main

# Пересобрать и перезапустить контейнеры
docker-compose down
docker-compose up -d --build

# Применить новые миграции
docker-compose exec backend alembic upgrade head
```

---

## Устранение неполадок

### Backend не запускается

```bash
# Проверить логи
docker-compose logs backend

# Проверить, доступна ли БД
docker-compose exec backend python -c "from app.db.database import engine; engine.connect()"
```

### Frontend не собирается

```bash
# Очистить node_modules и пересобрать
cd frontend
rm -rf node_modules package-lock.json
npm install
npm run build
```

### Проблемы с миграциями

```bash
# Откатить последнюю миграцию
docker-compose exec backend alembic downgrade -1

# Создать новую миграцию
docker-compose exec backend alembic revision --autogenerate -m "description"
```

---

## Безопасность

1. **Всегда меняйте дефолтные пароли и секретные ключи**
2. **Используйте HTTPS в production**
3. **Ограничьте доступ к базе данных** (используйте firewall)
4. **Регулярно обновляйте зависимости**
5. **Настройте автоматические бэкапы**
6. **Используйте rate limiting** для API

---

## Поддержка

Если возникли проблемы:
1. Проверьте Issues на GitHub
2. Создайте новый Issue с описанием проблемы
3. Свяжитесь с разработчиками
