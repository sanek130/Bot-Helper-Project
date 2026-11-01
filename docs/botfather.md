# Настройка бота в BotFather

## Имя бота

**Username:** @HomeWorkly_bot

## About (до 120 символов)

HW-Helper: домашние задания и расписание твоего класса. Регистрация за минуту.

## Description (до 512 символов)

HW-Helper помогает школьникам не пропускать домашние задания. Смотри ДЗ на сегодня, завтра, послезавтра и на неделю, открывай расписание класса и выбирай любую дату через календарь. Админы класса добавляют задания в пару кликов, а жалобы на админов рассматривают модераторы и создатели. Регистрация занимает меньше минуты. Нажми «Начать», чтобы попасть в бот.

## Команды меню (/setcommands)

```
start - Начать и зарегистрироваться
menu - Главное меню
today - ДЗ на сегодня
tomorrow - ДЗ на завтра
after_tomorrow - ДЗ на послезавтра
week - ДЗ на неделю
schedule - Расписание класса
profile - Мой профиль
web_app - Веб-версия в Telegram
web_site - Сайт проекта
help - Помощь
support - Поддержка
```

Бот также сам выставляет эти команды при запуске через `setMyCommands`, поэтому шаг в BotFather нужен только для ручной проверки.

## Аватар

Файл `assets/avatar.svg`, 512×512:

- Фон: #378ADD (синий)
- Значок: открытая тетрадь с галочкой, белый, плоский, без обводки
- Без текста внутри
- Установка: `/setuserpic` (BotFather принимает изображение, поэтому SVG нужно сначала экспортировать в PNG 512×512)

## Privacy Policy

Ссылка: https://bot-helper-project-dl5d.onrender.com/privacy

Команда: `/setprivacypolicy` (раздел Bot Settings)

## Domain (для Telegram Login Widget)

Домен: bot-helper-project-dl5d.onrender.com

Команда: `/setdomain`

## Mini App (веб-версия в Telegram)

URL: https://bot-helper-project-dl5d.onrender.com/tma

Команда: `/newapp` или Bot Settings → Configure Mini App
