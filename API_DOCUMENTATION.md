# Telegram Web App API Documentation

## Обзор

Полный API для Telegram Web App (бот для домашнего задания) реализован в файле `webapp-api.js`.

## Архитектура

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Telegram Web   │────▶│  Express Server  │────▶│   MongoDB       │
│     App (FE)    │◀────│  (webapp-api.js) │◀────│   Database      │
└─────────────────┘     └──────────────────┘     └─────────────────┘
                                │
                                ▼
                        ┌──────────────────┐
                        │  Telegram Bot    │
                        │  API (Telegraf)  │
                        └──────────────────┘
```

## Безопасность

### Валидация Telegram initData

Все API endpoints (кроме health checks) требуют заголовок `X-Telegram-Init-Data` с валидным initData от Telegram.

**Алгоритм валидации:**
1. Извлечение `hash` из параметров
2. Сортировка остальных параметров по алфавиту
3. Создание secret key: `HMAC-SHA256("WebAppData", bot_token)`
4. Вычисление hash: `HMAC-SHA256(secret_key, sorted_params)`
5. Сравнение с полученным hash

**Middleware авторизации:**
- Проверяет валидность initData
- Ищет пользователя в БД по Telegram ID
- Возвращает 401/403 при ошибках
- Добавляет `req.user` и `req.telegramUser`

## API Endpoints

### Public Routes (без авторизации)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check "OK" |
| GET | `/health` | Расширенная информация о здоровье |
| GET | `/app` | Главная страница Web App |
| GET | `/app/*` | Статические файлы Web App |

### Protected Routes (требуют авторизации)

#### 1. GET `/api/me` - Профиль пользователя

Возвращает данные текущего пользователя.

**Response:**
```json
{
  "id": "123456789",
  "first_name": "Иван",
  "last_name": "Иванов",
  "username": "ivan",
  "class": "10А",
  "role": "user",
  "notification_slot": "20",
  "today": "2025-01-15"
}
```

#### 2. GET `/api/homework?from=YYYY-MM-DD&to=YYYY-MM-DD` - ДЗ на период

Получение домашних заданий на указанный период.

**Query Parameters:**
- `from` (required): Начальная дата в формате YYYY-MM-DD
- `to` (required): Конечная дата в формате YYYY-MM-DD

**Response:**
```json
{
  "days": {
    "2025-01-15": {
      "Алгебра": {
        "text": "стр. 42, № 3-5",
        "icon": "📐",
        "done": false
      },
      "Русский": {
        "text": "Упражнение 123",
        "icon": "📝",
        "done": true
      }
    }
  }
}
```

#### 3. POST `/api/homework` - Добавить ДЗ (только admin)

Добавление нового домашнего задания.

**Body:**
```json
{
  "date": "2025-01-15",
  "subject": "Алгебра",
  "text": "стр. 42, № 3-5"
}
```

**Response:**
```json
{ "ok": true }
```

**Errors:**
- 403: User is not admin
- 400: Missing required fields

#### 4. POST `/api/homework/done` - Отметить ДЗ выполненным

Переключает статус выполнения ДЗ (toggle).

**Body:**
```json
{
  "date": "2025-01-15",
  "subject": "Алгебра"
}
```

**Response:**
```json
{ "done": true }
```

#### 5. POST `/api/upload-photo` - Загрузка фото к ДЗ (только admin)

**Body:**
```json
{
  "date": "2025-01-15",
  "subject": "Русский",
  "photo_url": "https://api.telegram.org/file/bot..."
}
```

**Response:**
```json
{ "ok": true }
```

#### 6. GET `/api/photo/:fileId` - Получение URL фото

Получение прямого URL для файла Telegram по file_id.

**Response:**
```json
{
  "url": "https://api.telegram.org/file/botTOKEN/path/to/file.jpg"
}
```

#### 7. GET `/api/subjects` - Список предметов

Возвращает все предметы, для которых есть ДЗ.

**Response:**
```json
{
  "subjects": [
    { "name": "Алгебра", "icon": "📐" },
    { "name": "Русский", "icon": "📝" }
  ]
}
```

#### 8. GET `/api/homework/by-subject?name=...` - Поиск по предмету

Поиск будущих заданий по конкретному предмету.

**Query Parameters:**
- `name` (required): Название предмета

**Response:**
```json
{
  "items": [
    {
      "date": "2025-01-15",
      "subject": "Алгебра",
      "text": "стр. 42, № 3-5",
      "icon": "📐"
    }
  ]
}
```

#### 9. GET `/api/schedule` - Расписание

Получение URL фото расписания для класса пользователя.

**Response:**
```json
{
  "url": "https://api.telegram.org/file/botTOKEN/path/to/schedule.jpg"
}
```
или
```json
{ "url": null }
```

#### 10. POST `/api/homework/duplicate` - Дублирование дня (только admin)

Копирование всех ДЗ с одного дня на другой.

**Body:**
```json
{
  "from": "2025-01-15",
  "to": "2025-01-16"
}
```

**Response:**
```json
{ "count": 5 }
```

#### 11. POST `/api/broadcast` - Рассылка классу (только admin)

Отправка сообщения всем ученикам того же класса.

**Body:**
```json
{
  "text": "Завтра контрольная работа!"
}
```

**Response:**
```json
{ "sent": 15 }
```

## Коды ошибок HTTP

| Code | Meaning |
|------|---------|
| 200 | OK - запрос успешен |
| 400 | Bad Request - ошибка валидации входных данных |
| 401 | Unauthorized - неверный или отсутствующий initData |
| 403 | Forbidden - пользователь не зарегистрирован или нет прав |
| 404 | Not Found - файл не найден |
| 500 | Internal Server Error - ошибка сервера |

## Модели данных

### User Collection
```javascript
{
  _id: ObjectId,
  id: String,              // Telegram user ID (unique, indexed)
  username: String,
  first_name: String,
  last_name: String,
  class: String,           // Класс (indexed)
  role: String,            // "user" | "admin"
  registered_at: Date,
  notification_slot: String, // "off" | "18" | "20"
  completed_homework: {    // { "YYYY-MM-DD": ["Алгебра", ...] }
    type: Mixed,
    default: {}
  },
  stats: {
    homework_views: Number,
    last_active: Date
  }
}
```

### Homework Collection
```javascript
{
  _id: ObjectId,
  classKey: String,        // Класс (unique, indexed)
  data: {                  // { "YYYY-MM-DD": { "Предмет": {...} } }
    type: Mixed,
    default: {}
  },
  schedule_photo_id: String,
  updated_at: Date
}
```

## Формат данных ДЗ

```javascript
{
  "2025-01-15": {
    "Алгебра": {
      "type": "text",
      "text": "стр. 42, № 3-5"
    },
    "Русский": {
      "type": "photo",
      "photo_url": "https://...",
      "text": "Упражнение с фото"
    },
    "Физика": "Лабораторная работа"  // сокращённый формат
  }
}
```

## Интеграция с Frontend

Пример использования API в frontend (webapp/app.js):

```javascript
// Получение initData от Telegram
function initData() {
  return window.Telegram?.WebApp?.initData || '';
}

// Функция для API вызовов
async function api(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Telegram-Init-Data': initData(),
    ...(options.headers || {}),
  };
  const res = await fetch(`/api${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return data;
}

// Пример: получение профиля
const me = await api('/me');

// Пример: отметка о выполнении ДЗ
await api('/homework/done', {
  method: 'POST',
  body: JSON.stringify({ date: '2025-01-15', subject: 'Алгебра' })
});
```

## Переменные окружения

Обязательные переменные для работы API:

```bash
# Токен бота от @BotFather
BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz

# Connection string MongoDB
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/db

# Порт (опционально, Render устанавливает автоматически)
PORT=5000
```

## Логирование

API логирует следующие события:
- Ошибки валидации initData
- Ошибки подключения к БД
- Ошибки при отправке сообщений (broadcast)
- Ошибки при работе с файлами Telegram

Пример логов:
```
Ошибка валидации initData: Invalid hash
BOT_TOKEN не найден в переменных окружения
Не удалось отправить сообщение пользователю 123456: bot was blocked
```

## Production Checklist

- [ ] BOT_TOKEN установлен в Environment Variables
- [ ] MONGODB_URI настроен и доступен
- [ ] CORS настроен для домена Web App
- [ ] HTTPS включён (обязательно для Telegram Web App)
- [ ] Мониторинг здоровья через `/health` endpoint
- [ ] Логирование ошибок настроено
- [ ] Резервное копирование MongoDB включено
