# КлассныйБот

Telegram-бот и сайт с домашними заданиями и расписанием класса. Один аккаунт на всех платформах, один спец-ID, одна база MongoDB.

## Из чего состоит

- **Бот** (Telegraf 4): регистрация, вход по спец-ID, ДЗ на день и неделю, календарь, чеклист, расписание, профиль, статистика, админ-действия, жалобы, варны, рассылки.
- **Сайт** (Express 5): лендинг, регистрация, вход по коду из Telegram, кабинет, панели `/admin` и `/creator`, новости, помощь, политика конфиденциальности.
- **Автоудаление** старых ДЗ — отдельная cron-задача Render (`scripts/cleanup-homework.js`).
- **Макс** — только заглушка: поле `maxId`, платформа `max`, кнопка «Макс — скоро». Бот не реализован.

## Структура

```
src/
├── index.js          запуск: БД, команды бота, Express
├── config.js         проверка переменных окружения
├── db/               подключение и модели Mongoose
├── data/             cities.json, schools.json
├── bot/              bot.js, router.js, keyboards.js, texts.js, sessions.js, flows/
├── services/         бизнес-логика (ДЗ, пользователи, вход, статистика, рассылки, файлы, очистка)
├── web/              Express, авторизация, API-роуты, public/
│   └── public/       HTML, CSS, ES-модули сайта (без сборщика)
├── utils/            нормализация, экранирование, предметы, лимитер
scripts/
├── migrate.js        миграция старой базы
└── cleanup-homework.js
tests/                node:test
docs/                 botfather.md, privacy.md, help.md
assets/avatar.svg
render.yaml
```

## Локальный запуск

1. Node.js 20+.
2. Скопируй `.env.example` в `.env` и заполни:
   - `BOT_TOKEN`, `BOT_USERNAME` — из @BotFather;
   - `MONGO_URI` — строка MongoDB Atlas;
   - `MODERATOR_IDS` — tgId создателей через запятую;
   - `SITE_URL` — `http://localhost:3000` локально;
   - `WEBHOOK_URL` — локально можно не задавать (бот стартует без вебхука);
   - `JWT_SECRET`, `WEBHOOK_SECRET` — случайные строки (JWT не короче 32 символов).
3. `npm install`
4. `npm run dev`
5. Открой `http://localhost:3000` и проверь `/health`.

`npm start` — обычный запуск без watch.

## Миграция старой базы

Скрипт идемпотентный: его можно запускать несколько раз.

1. Сделай резервную копию кластера Atlas (или сними дамп `mongodump`).
2. Пропиши `MONGO_URI` в окружение.
3. `npm run migrate`
4. Скрипт сам выгрузит коллекции в `backup/` (папка в `.gitignore`).

Что делает миграция:
- `id`/`chat_id` → `tgId`, `completed_homework` → `completedHomework`, `custom_keyboard` → `customKeyboard` (`pending_admin_request` больше не переносится — заявок на админа нет);
- удаляет `notification_slot` и `notifications_enabled`;
- добавляет `specId` тем, у кого его нет;
- переименовывает ключи `Homework` из «Класс» в «Школа::Класс» (если школа известна), а при конфликте сливает данные;
- данные ДЗ и статистики не удаляет.

## Деплой на Render

В корне лежит `render.yaml` с веб-сервисом и cron-задачей.

1. Запушь ветку в GitHub.
2. Render → New → Blueprint → выбери репозиторий и ветку.
3. Введи вручную: `BOT_TOKEN`, `BOT_USERNAME`, `MONGO_URI`, `MODERATOR_IDS`, `SITE_URL`, `WEBHOOK_URL`. `WEBHOOK_SECRET` и `JWT_SECRET` Render сгенерирует сам.
4. После первого деплоя проверь `SITE_URL` и `WEBHOOK_URL` (обычно совпадают), перезапусти сервис.
5. Проверь `/health` и отправь боту `/start`.
6. Настрой BotFather по `docs/botfather.md`, загрузи `assets/avatar.svg`.
7. Заполни контакт в `docs/privacy.md`.

Cron-задача `classbot-cleanup` запускается в 00:00 UTC (03:00 МСК) и чистит ДЗ старше `CLEANUP_DAYS` (по умолчанию 14 дней). Она не зависит от веб-сервиса.

Ограничения: один инстанс веб-сервиса (иначе вебхук и сессии могут обработать сообщение дважды). Файлы на диске не хранятся: только MongoDB и `file_id` Telegram.

## Переменные окружения

| Переменная | Обязательна | Назначение |
|---|---|---|
| BOT_TOKEN | да | токен бота |
| BOT_USERNAME | да | ник без @ |
| MONGO_URI | да | строка подключения |
| MODERATOR_IDS | да | tgId создателей через запятую |
| SITE_URL | да | адрес сайта |
| WEBHOOK_URL | нет | публичный адрес для вебхука; без него бот стартует без вебхука |
| WEBHOOK_SECRET | при заданном WEBHOOK_URL | часть пути `/tg/{secret}` |
| JWT_SECRET | да | подпись токенов сайта, ≥32 символов |
| GOOGLE_CLIENT_ID | нет | OAuth Client ID (Web) для входа через Google; без него кнопка Google скрыта |
| CLEANUP_DAYS | нет | срок хранения ДЗ, по умолчанию 14 |
| TZ | нет | Europe/Moscow |
| PORT | нет | порт, Render задаёт сам |

## Вход, роли, модерация и поддержка

- **Способы входа.** Telegram-бот (спец-ID), мини-приложение (данные Telegram проверяются по подписи `initData`), виджет «Войти через Telegram» на сайте, Google (ID-токен проверяется по ключам Google) и номер телефона. Номер добавляется в боте кнопкой «Поделиться контактом» — Telegram подтверждает, что номер принадлежит пользователю, поэтому SMS не нужны; код входа по номеру приходит в Telegram.
- **Мини-приложение** — страница `/tma`. Кнопка «Приложение» появляется в меню бота автоматически, если `SITE_URL` начинается с `https://`. Команда `/app` присылает кнопку запуска.
- **Виджет Telegram** работает только после `/setdomain` в BotFather (домен из `SITE_URL`).
- **Роли.** Заявок на админа больше нет: админов назначают создатели в боте («Панель создателя» → «Пользователи») или на сайте (`/creator`).
- **Создатели** могут: банить и разбанивать пользователей и админов (с причиной), назначать и снимать админов, выдавать и сбрасывать варны, удалять аккаунты, отвечать в поддержке, рассматривать жалобы и делать рассылки. Других создателей модерировать нельзя.
- **Бан** закрывает бота, сайт и мини-приложение. Остаётся только поддержка — чтобы обжаловать.
- **Поддержка.** `/support` в боте, страница `/support` на сайте и вкладка в мини-приложении. Обращения приходят всем создателям в Telegram с кнопками «Ответить» и «Закрыть», ответ уходит пользователю в Telegram.
- **Локально без вебхука** бот работает через long polling: достаточно не задавать `WEBHOOK_URL`.

## API

Все изменяющие запросы проверяют `Origin` (должен совпадать с `SITE_URL`) и роль на сервере. Cookie сессии — `httpOnly`, `SameSite=Lax`, `Secure` на https. Мини-приложение передаёт тот же токен в заголовке `Authorization: Bearer …`. Забаненный пользователь получает `403 {error: 'banned', reason}` везде, кроме поддержки.

| Метод | Путь | Роль | Вход | Выход |
|---|---|---|---|---|
| POST | /api/auth/register | — | `{city, school, class}` + необязательно `telegramInitData` / `telegramAuth` / `googleCredential` | `{specId, activationLink}` или сразу `{registered, user, token}` + cookie |
| POST | /api/auth/provider | — | `{telegramInitData}` / `{telegramAuth}` / `{googleCredential}` | `{registered:true, user, token}` или `{registered:false, profile}` |
| POST | /api/auth/link-provider | user | то же | `{user}` |
| GET | /api/auth/pending | — | `?specId=` | `{status, activationLink?}` |
| POST | /api/auth/login | — | `{specId}` или `{phone}` | `{ok}` (код в Telegram) |
| POST | /api/auth/verify | — | `{specId или phone, code}` | `{user, token}` + cookie |
| GET | /api/auth/me | user | — | `{user}` |
| POST | /api/auth/logout | user | — | `{ok}` |
| POST | /api/auth/logout-all | user | — | `{ok}` |
| POST | /api/auth/link | user | — | `{activationLink}` |
| GET | /api/homework | user | `?date=` | карточка дня |
| GET | /api/homework/week | user | `?offset=` | дни недели |
| GET | /api/homework/all | user | — | 14 дней |
| GET | /api/homework/search | user | `?q=` | топ-10 |
| GET | /api/homework/copy | user | `?date=` | `{text}` |
| POST | /api/homework/check | user | `{date, subject, done}` | `{ok, done}` |
| POST | /api/homework | admin | `{date, subject, text}` | `{ok, merged}` |
| PUT | /api/homework | admin | `{date, subject, text?, newSubject?}` | `{ok}` |
| POST | /api/homework/move | admin | `{date, subject, toDate}` | `{ok}` |
| POST | /api/homework/duplicate | admin | `{from, to}` | `{ok, copied}` |
| POST | /api/homework/photos | admin | `{date, subject, photo}` | `{ok}` |
| POST | /api/homework/photos/remove | admin | `{date, subject}` | `{ok}` |
| DELETE | /api/homework | admin | `{date, subject}` | `{ok}` |
| GET | /api/schedule | user | — | `{hasSchedule, photoUrl?}` |
| POST | /api/schedule | admin | `{photo}` | `{ok, photoUrl}` |
| DELETE | /api/schedule | admin | — | `{ok}` |
| GET | /api/news | — | — | `{news}` |
| POST | /api/news | creator | `{title, body, audience, audienceValue, pinned}` | `{news}` |
| PUT | /api/news/:id | creator | любые поля | `{news}` |
| DELETE | /api/news/:id | creator | — | `{ok}` |
| GET | /api/admin/stats | admin | — | `{stats}` |
| POST | /api/admin/broadcast | admin | `{text}` | `{total, delivered, failed}` |
| GET | /api/creator/users | creator | `?q=` | `{users}` |
| POST | /api/creator/users/:specId/warn | creator | — | `{user}` |
| POST | /api/creator/users/:specId/unwarn | creator | — | `{user}` |
| POST | /api/creator/users/:specId/demote | creator | — | `{user}` |
| POST | /api/creator/users/:specId/promote | creator | — | `{user}` |
| POST | /api/creator/users/:specId/ban | creator | `{reason?}` | `{user}` |
| POST | /api/creator/users/:specId/unban | creator | — | `{user}` |
| GET | /api/creator/overview | creator | — | `{users, admins, banned, reports, tickets}` |
| GET | /api/creator/support | creator | `?status=open\|closed\|all` | `{tickets}` |
| POST | /api/creator/support/:id/reply | creator | `{text}` | `{ticket}` |
| POST | /api/creator/support/:id/close | creator | — | `{ticket}` |
| GET | /api/support | user (и забаненный) | — | `{tickets}` |
| POST | /api/support | user (и забаненный) | `{text, source}` | `{ticket}` |
| DELETE | /api/creator/users/:specId | creator | — | `{ok}` |
| GET | /api/creator/reports | creator | `?status=` | `{reports}` |
| POST | /api/creator/reports/:id/warn | creator | — | `{ok}` |
| POST | /api/creator/reports/:id/demote | creator | — | `{ok}` |
| POST | /api/creator/reports/:id/reject | creator | — | `{ok}` |
| GET | /api/creator/audiences | creator | — | `{cities, schools, classes}` |
| POST | /api/creator/broadcast | creator | `{target, value, text}` | `{total, delivered, failed}` |
| GET | /api/files/:fileId | user | — | поток файла |
| GET | /health | — | — | `{status, db}` |
| POST | /tg/{WEBHOOK_SECRET} | Telegram | update | — |

Спец-ID, токен бота и прямые ссылки Telegram в ответах API и логах не выдаются.

## Как добавить город или школу

1. `src/data/cities.json`: `{ "id": "kazan", "name": "Казань", "aliases": ["казань", "kazan"] }`.
2. `src/data/schools.json`: `{ "id": "kazan_school1", "cityId": "kazan", "type": "школа", "number": "1", "name": "школа 1", "aliases": ["школа 1", "школа №1"], "verified": false }`.
3. Перезапусти сервис. Код менять не нужно.

Название школы собирается как `${type} ${number}`. «Другой город» — служебная запись: при выборе пользователь вводит город текстом.

## Тесты и проверки

```bash
node --check src/index.js   # и другие изменённые файлы
npm test                    # node:test
```

Тесты покрывают: даты на границе суток по Москве, merge ДЗ и лимиты, поиск города и школы, очистку старых ДЗ, одноразовость кода и лимит попыток, три варна, антиспам, проверку подписи Telegram Mini App/виджета и Google ID-токена, права модерации, нормализацию телефона и проверку текста обращений.

Перед пушем в `main` дополнительно проверяются вручную: регистрация, вход по спец-ID с подтверждением, просмотр, добавление, редактирование, удаление и перенос ДЗ, рассылка, жалоба, три варна.

## Что нужно для подключения Макса

- Bot API мессенджера Макс и токен бота.
- Вебхук на отдельный путь.
- Привязка по тому же `specId` (поле `maxId` и платформа `max` уже зарезервированы).

## Лицензия

MIT.
