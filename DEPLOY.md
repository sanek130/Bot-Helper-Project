# Инструкция по развёртыванию Telegram Web App

## 1. Подготовка переменных окружения для Render

Создайте в панели Render следующие Environment Variables:

```
BOT_TOKEN=ваш_токен_бота_от_BotFather
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/homework-bot?retryWrites=true&w=majority
PORT=5000
NODE_VERSION=18.x
```

### Получение BOT_TOKEN:
1. Откройте @BotFather в Telegram
2. Создайте нового бота или используйте существующего
3. Скопируйте токен

### Получение MONGODB_URI:
1. Зарегистрируйтесь на [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Создайте бесплатный кластер
3. Добавьте пользователя с паролем
4. В Network Access добавьте `0.0.0.0/0` (разрешить доступ отовсюду)
5. Скопируйте connection string и замените `<password>` на ваш пароль

## 2. Настройка Web App в BotFather

1. Откройте @BotFather
2. Выберите вашего бота
3. Команда `/newapp` или редактирование существующего Web App
4. Укажите URL: `https://your-app.onrender.com/app`
5. Укажите короткое имя для кнопки

## 3. Деплой на Render

1. Создайте новый Web Service на Render
2. Подключите репозиторий GitHub
3. Build Command: `npm install`
4. Start Command: `node index.js`
5. Добавьте Environment Variables из пункта 1
6. Deploy!

## 4. Проверка работы

После деплоя проверьте endpoints:

- `GET https://your-app.onrender.com/health` - должен вернуть JSON с status ok
- `GET https://your-app.onrender.com/app` - должна открыться HTML страница Web App

## 5. API Endpoints

Все endpoints требуют заголовок `X-Telegram-Init-Data` с initData от Telegram Web App.

### Публичные маршруты:
- `GET /` - health check "OK"
- `GET /health` - расширенная информация о здоровье сервиса
- `GET /app` - главная страница Web App
- `GET /app/*` - статические файлы Web App

### API маршруты (требуют авторизации):
- `GET /api/me` - профиль текущего пользователя
- `GET /api/homework?from=YYYY-MM-DD&to=YYYY-MM-DD` - ДЗ на период
- `POST /api/homework` - добавить ДЗ (только admin)
- `POST /api/homework/done` - отметить ДЗ выполненным
- `GET /api/subjects` - список предметов
- `GET /api/homework/by-subject?name=...` - поиск по предмету
- `GET /api/schedule` - расписание (фото)
- `POST /api/homework/duplicate` - дублирование дня (только admin)
- `POST /api/broadcast` - рассылка классу (только admin)
- `POST /api/upload-photo` - загрузка фото к ДЗ (только admin)
- `GET /api/photo/:fileId` - получение URL фото

### Коды ошибок:
- `401 Unauthorized` - неверный или отсутствующий initData
- `403 Forbidden` - пользователь не зарегистрирован или нет прав
- `400 Bad Request` - ошибка валидации входных данных
- `500 Internal Server Error` - ошибка сервера

## 6. Модели данных MongoDB

### User (пользователи):
```javascript
{
  id: String,              // Telegram user ID
  username: String,
  first_name: String,
  last_name: String,
  class: String,           // Класс (например "10А")
  role: String,            // "user" или "admin"
  registered_at: Date,
  notification_slot: String, // "off", "18", "20"
  completed_homework: Object, // { "YYYY-MM-DD": ["Алгебра", ...] }
  stats: {
    homework_views: Number,
    last_active: Date
  }
}
```

### Homework (домашние задания по классам):
```javascript
{
  classKey: String,        // Класс (например "10А")
  data: Object,            // { "YYYY-MM-DD": { "Алгебра": { type: "text", text: "..." } } }
  schedule_photo_id: String, // file_id фото расписания
  updated_at: Date
}
```

## 7. Формат данных ДЗ

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
    }
  }
}
```
