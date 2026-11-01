# HW-Helper (@HomeWorkly_bot)

Telegram-бот и веб-приложение для управления домашними заданиями в школах.

## Возможности

- **Регистрация** — выбор города, школы, класса, роли (user/admin)
- **Просмотр ДЗ** — сегодня, завтра, послезавтра, неделя, календарь
- **Расписание** — фото расписания класса
- **Админ-функции** — добавление, редактирование, удаление, перенос и копирование ДЗ
- **Жалобы** — на админов (рассматривают модераторы и создатели)
- **Рассылки** — админ своему классу, создатель любой группе
- **Поддержка** — тикеты для пользователей
- **Сайт** — личный кабинет, админ-панель, панель создателя, Telegram Mini App (`/tma`)
- **Автоочистка** — ДЗ старше `CLEANUP_DAYS` дней удаляются ежедневным Cron Job

## Стек

- Node.js 20+ (ES-модули)
- Telegraf 4 (Telegram-бот)
- Express 5 (веб-сервер)
- Mongoose 8 (MongoDB)
- MongoDB Atlas
- Render (деплой)

## Структура

```
src/
  config.js          — переменные окружения и их проверка
  index.js           — точка входа: БД, бот, веб-сервер
  bot/               — обработчики, клавиатуры, сценарии, тексты (TEXTS)
  services/          — бизнес-логика (пользователи, ДЗ, вход, поддержка, очистка)
  db/                — подключение и модели Mongoose
  utils/             — даты, поиск, лимиты, форматирование
  data/              — cities.json, schools.json
  web/               — Express: роуты API, страницы, авторизация
public/              — HTML, CSS и JS сайта
scripts/             — migrate.js, cleanup-homework.js
tests/               — тесты node:test
docs/                — тексты для BotFather, политика конфиденциальности
assets/avatar.svg    — аватар бота
render.yaml          — Blueprint для Render
```

## Локальный запуск

### 1. Клонировать репозиторий

```bash
git clone https://github.com/sanek130/Bot-Helper-Project.git
cd Bot-Helper-Project
```

### 2. Установить зависимости

```bash
npm install
```

### 3. Настроить .env

Скопировать `.env.example` в `.env` и заполнить:

```env
BOT_TOKEN=<токен от @BotFather>
BOT_USERNAME=HomeWorkly_bot
MONGO_URI=<строка подключения MongoDB Atlas>
MODERATOR_IDS=<tgId модераторов через запятую>
CREATOR_IDS=<tgId создателей через запятую>
SITE_URL=http://localhost:3000
JWT_SECRET=<минимум 32 символа>
WEBHOOK_URL=
WEBHOOK_SECRET=<от 8 до 128 символов: латиница, цифры, _ и ->
CLEANUP_DAYS=14
TZ=Europe/Moscow
```

### 4. Запустить

```bash
npm run dev
```

Если `WEBHOOK_URL` пустой, бот работает через long polling (без вебхука).

## Миграция данных

Если у вас есть старая база данных:

```bash
npm run migrate
```

Скрипт:

- Создаёт бэкап в `backup/YYYY-MM-DD_HH-MM-SS/`
- Переименовывает поля (`id` → `tgId`, `completed_homework` → `completedHomework`)
- Генерирует `specId` для пользователей без него
- Переименовывает `classKey` из "Класс" в "Школа::Класс"

Повторный запуск безопасен: уже перенесённые записи пропускаются.

## Автоочистка

```bash
npm run cleanup
```

Скрипт `scripts/cleanup-homework.js`:

- Работает без `BOT_TOKEN`, нужен только `MONGO_URI`
- Удаляет дни старше `CLEANUP_DAYS` из `Homework.data` и соответствующие отметки из `User.completedHomework`
- Удаляет просроченные незавершённые регистрации (`status: 'pending'`) вместе с их сессиями, запросами входа и токенами
- Ошибка в одном классе не останавливает обработку остальных
- Код выхода: 0 при успехе, 1 при ошибке

На Render скрипт запускается Cron Job `hw-helper-cleanup` ежедневно в 00:00 UTC (03:00 МСК). Дополнительно веб-сервис раз в час чистит просроченные pending-аккаунты.

## Деплой на Render

### 1. Создать Blueprint

В Render: New → Blueprint → выбрать репозиторий → ветка `main`.

### 2. Заполнить переменные окружения

После первого деплоя в Environment заполнить (для web-сервиса):

- `BOT_TOKEN`
- `MONGO_URI`
- `MODERATOR_IDS`
- `CREATOR_IDS`
- `SITE_URL` (например, `https://bot-helper-project-dl5d.onrender.com`)
- `WEBHOOK_URL` (совпадает с `SITE_URL`)

Для Cron Job `hw-helper-cleanup` нужен только `MONGO_URI`.

`JWT_SECRET` и `WEBHOOK_SECRET` генерируются автоматически.

### 3. Перезапустить сервис

После заполнения переменных — Manual Deploy → Deploy latest commit.

### 4. Проверить

- `GET /health` → `{ "status": "ok" }`
- В боте: `/start` → регистрация

## API

Все запросы, кроме публичных, требуют cookie с JWT (выдаётся после входа). Изменяющие запросы проверяют заголовок `Origin`.

### Авторизация

| Метод | Путь | Описание |
|---|---|---|
| POST | `/api/auth/start` | Запрос кода входа (body: `{ specId }`), код приходит в бот |
| POST | `/api/auth/verify` | Подтверждение кода (body: `{ specId, code }`) |
| POST | `/api/auth/link` | Вход по одноразовой ссылке из бота |
| POST | `/api/auth/register` | Регистрация на сайте без Telegram |
| POST | `/api/auth/tma` | Вход из Telegram Mini App по `initData` |
| POST | `/api/auth/logout` | Выход |
| POST | `/api/auth/logout-all` | Выход на всех устройствах |
| GET | `/api/auth/me` | Текущий пользователь |

### Справочники

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/data/cities` | Список городов |
| GET | `/api/data/schools` | Школы города (query: `cityId`) |

### Домашние задания

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/homework/day/:dateKey` | ДЗ на день |
| GET | `/api/homework/week?offset=0` | ДЗ на неделю |
| GET | `/api/homework/dates` | Даты, на которые есть ДЗ |
| GET | `/api/homework/search` | Поиск по ДЗ класса |
| POST | `/api/homework` | Добавить ДЗ (admin/creator/moderator) |
| PUT | `/api/homework/:classKey/:dateKey/:subjectHash` | Редактировать |
| DELETE | `/api/homework/:classKey/:dateKey/:subjectHash` | Удалить |
| POST | `/api/homework/toggle` | Переключить чеклист |
| POST | `/api/homework/upload-photo` | Загрузить фото к ДЗ (base64) |
| POST | `/api/homework/move` | Перенести ДЗ на другую дату |
| POST | `/api/homework/duplicate` | Скопировать ДЗ дня на другую дату |

### Расписание

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/schedule` | Фото расписания |
| POST | `/api/schedule` | Обновить фото по `fileId` (admin/creator/moderator) |
| POST | `/api/schedule/upload` | Загрузить фото расписания (base64) |

### Новости

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/news` | Список новостей (публичный) |
| POST | `/api/news` | Создать новость (creator) |
| PUT | `/api/news/:id` | Изменить новость (creator) |
| DELETE | `/api/news/:id` | Удалить новость (creator) |

### Админ

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/admin/stats` | Статистика класса |
| GET | `/api/admin/classes` | Список классов (moderator/creator) |
| GET | `/api/admin/audience-values` | Значения для выбора аудитории рассылки |
| POST | `/api/admin/broadcast` | Рассылка |
| GET | `/api/admin/users` | Поиск пользователей (moderator/creator) |
| POST | `/api/admin/warn` | Выдать варн (moderator/creator) |
| POST | `/api/admin/demote` | Снять роль админа (moderator/creator) |
| POST | `/api/admin/promote` | Назначить роль (moderator/creator) |
| POST | `/api/admin/ban` | Заблокировать пользователя (creator) |
| POST | `/api/admin/unban` | Разблокировать пользователя (creator) |
| POST | `/api/admin/reset-warns` | Сбросить варны (creator) |
| POST | `/api/admin/admin-unban` | Снять запрет на роль админа (creator) |
| DELETE | `/api/admin/user/:specId` | Удалить пользователя (creator) |

### Создатель

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/creator/reports` | Список жалоб |
| POST | `/api/creator/report/resolve` | Рассмотреть жалобу |

### Файлы

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/files/:fileId` | Проксирование фото Telegram |

### Поддержка

| Метод | Путь | Описание |
|---|---|---|
| GET | `/api/support/mine` | Мои обращения |
| GET | `/api/support/tickets` | Список тикетов (support/moderator/creator) |
| GET | `/api/support/ticket/:ticketId` | Переписка по тикету |
| POST | `/api/support/message` | Отправить сообщение |
| POST | `/api/support/reply` | Ответ поддержки (support/moderator/creator) |
| POST | `/api/support/close` | Закрыть тикет |

### Служебные

| Метод | Путь | Описание |
|---|---|---|
| GET | `/health` | Проверка работоспособности |
| POST | `/tg/:secret` | Вебхук Telegram |

## Добавление городов и школ

Отредактируйте `src/data/cities.json` и `src/data/schools.json`:

```json
// cities.json
[
  { "id": "krasnodar", "name": "Краснодар", "aliases": ["краснодар"] }
]

// schools.json
[
  {
    "id": "sch_1",
    "cityId": "krasnodar",
    "type": "гимназия",
    "number": "25",
    "name": "гимназия 25",
    "aliases": ["гимназия двадцать пять"],
    "verified": false
  }
]
```

## Тесты

```bash
npm test
```

Тесты с базой данных подключаются к `MONGO_TEST_URI` (по умолчанию `mongodb://localhost:27017`) и используют отдельные базы `hwhelper_test_*`. Если MongoDB недоступна, эти тесты пропускаются, остальные выполняются.

## Лицензия

MIT

## Контакты

Владелец: [укажите контакт]
