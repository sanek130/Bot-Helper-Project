# ДЗник — школьный бот домашних заданий

Telegram-бот на Telegraf + MongoDB: ДЗ по классу, расписание, напоминания, чеклист, Mini App.

## Быстрый старт

1. `.env`: `BOT_TOKEN`, `MONGODB_URI`, опционально `WEBAPP_URL=https://твой-домен/app`
2. `npm install` → `npm start`
3. Тексты BotFather и Mini App — [`BOTFATHER.md`](BOTFATHER.md)

## Mini App

Статика: [`webapp/`](webapp/) · API: [`webapp-api.js`](webapp-api.js)  
Открывается кнопкой в меню бота и Menu Button Telegram (нужен HTTPS).

## Стиль UI

Словарь эмодзи и карточки дня — [`ui.js`](ui.js).
