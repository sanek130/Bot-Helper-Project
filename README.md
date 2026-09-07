# 🤖 School Bot - Телеграм-бот школьного расписания

Telegram-бот для управления школьным расписанием и домашними заданиями.

## 📋 Возможности

### Для учеников:
- 📅 Просмотр расписания на сегодня/завтра/неделю
- 📚 Домашние задания по предметам
- 🔔 Уведомления о ДЗ
- 👤 Личный профиль с настройками
- 📅 Экспорт расписания в .ics (календарь)

### Для классных руководителей:
- ✏️ Редактирование ДЗ
- 📝 Управление расписанием
- 📢 Рассылки по классу

### Для администраторов:
- 🛠️ Полная панель управления
- ⏰ Настройка расписания звонков
- 📊 Журнал изменений (Audit Log)
- 👥 Модерация заявок

## 🚀 Быстрый старт

### Локальная разработка (Docker)

```bash
# 1. Скопируйте пример переменных окружения
cp .env.example .env

# 2. Отредактируйте .env, указав BOT_TOKEN и другие настройки

# 3. Запустите все сервисы
docker-compose up -d

# 4. Проверьте логи
docker-compose logs -f bot
```

### Локальная разработка (без Docker)

```bash
# 1. Установите зависимости
npm install

# 2. Настройте переменные окружения
cp .env.example .env
# Отредактируйте .env

# 3. Запустите MongoDB и Redis локально

# 4. Запустите бота
npm run dev
```

## 📁 Структура проекта

```
src/
├── bot.js                 # Точка входа
├── config/                # Конфигурация
│   ├── index.js           # Основной конфиг
│   ├── database.js        # MongoDB подключение
│   ├── redis.js           # Redis подключение
│   ├── session.js         # Сессии
│   └── logger.js          # Логирование (pino)
├── models/                # Mongoose модели
│   └── index.js           # Все модели
├── middlewares/           # Middleware
│   ├── roleGuard.js       # Проверка ролей
│   ├── rateLimit.js       # Rate limiting
│   └── errorHandler.js    # Обработка ошибок
├── keyboards/             # Клавиатуры
│   └── mainMenu.js        # Главное меню
├── handlers/              # Обработчики событий
├── scenes/                # Wizard сцены (онбординг)
├── services/              # Бизнес-логика
├── jobs/                  # Cron задачи
└── utils/                 # Утилиты
    ├── validators.js      # Zod валидация
    ├── datetime.js        # Работа с датами
    ├── subjectIcons.js    # Иконки предметов
    └── i18n.js            # Интернационализация
```

## 🔧 Переменные окружения

| Переменная | Описание | Пример |
|------------|----------|--------|
| `BOT_TOKEN` | Токен бота от @BotFather | `123456:ABC-DEF...` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/school-bot` |
| `REDIS_URL` | Redis URL | `redis://localhost:6379` |
| `WEBHOOK_PATH` | Путь webhook | `/telegraf/bot` |
| `WEBHOOK_SECRET` | Секрет webhook | `your_secret` |
| `WEBHOOK_BASE_URL` | Базовый URL для webhook | `https://app.onrender.com` |
| `PORT` | Порт сервера | `3000` |
| `NODE_ENV` | Режим работы | `development` / `production` |
| `ADMIN_CHAT_IDS` | ID админов (через запятую) | `123456789,987654321` |
| `DEFAULT_TIMEZONE` | Часовой пояс по умолчанию | `Europe/Moscow` |
| `HOMEWORK_REMINDER_TIME` | Время напоминания о ДЗ | `20:00` |

## 🏗️ Развёртывание на Render

1. Создайте новый **Web Service** на Render
2. Подключите репозиторий
3. Добавьте переменные окружения из `.env.example`
4. Создайте **MongoDB Atlas** (бесплатный M0 тариф)
5. Создайте **Redis** (Render Key Value или Upstash)
6. Настройте webhook URL после деплоя

### render.yaml (Blueprint)

Создайте файл `render.yaml` для автоматического развёртывания всех сервисов.

## 🧪 Тесты

```bash
npm test
```

## 📝 API

### Health Check
```
GET /health
```

Ответ:
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

## 🛠️ Технологии

- **Node.js** 20+
- **Telegraf** 4.x - Telegram Bot Framework
- **Express** 5.x - HTTP сервер
- **Mongoose** 9.x - ODM для MongoDB
- **Redis** - сессии и кэш
- **Zod** - валидация данных
- **Pino** - структурированное логирование
- **i18next** - интернационализация
- **node-cron** - планировщик задач

## 📄 Лицензия

MIT
