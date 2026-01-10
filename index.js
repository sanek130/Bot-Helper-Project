import 'dotenv/config';
import { Telegraf, Markup, session } from 'telegraf';
import * as config from './config.js';
import mongoose from 'mongoose';
import express from 'express';
import fs from 'fs';

import { User } from './models/User.js';
import { Homework } from './models/Homework.js';

import { initNotifications } from './notifications.js';
import { url } from 'inspector';

const bot = new Telegraf(config.telegramToken);
const app = express();
const PORT = process.env.PORT || 5000;

const adminChatIds = [5191412364, 369745517];

const sessions = new Map();

async function connectDB() {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log('😰MongoDB подключена успешно!');
  } catch (error) {
    console.error('😰Ошибка подключения к MongoDB:', error);
    process.exit(1);
  }
}

mongoose.connection.on("disconnected", () => {
  console.log("MongoDB отключена. Попытка переподключения...");
});

mongoose.connection.on("error", (err) => {
  console.error("😰 Ошибка MongoDB:", err);
});


bot.use(session());

bot.use((ctx, next) => {
  const sessionId = ctx.from?.id.toString() || "anonymous";
  ctx.session = sessions.get(sessionId) || {};
  return next().then(() => {
    if (Object.keys(ctx.session).length > 0) {
      sessions.set(sessionId, ctx.session);
    } else {
      sessions.delete(sessionId);
    }
  });
});

initNotifications(bot);

bot.on('message', async (ctx) => {
  const text = ctx.message?.text || ctx.message?.caption;
  if (!text && !ctx.message?.photo) return;
  
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (ctx.session.uploadingSchedule) {
    if (!user || user.role !== "admin") {
      delete ctx.session.uploadingSchedule;
      await ctx.reply("У вас нет прав для загрузки расписания.");
      return;
    }
    
    if (ctx.message.photo) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const photoId = photo.file_id;
      const classKey = ctx.session.scheduleClass || user.class;
      
      await setSchedulePhotoId(classKey, photoId);
      delete ctx.session.uploadingSchedule;
      delete ctx.session.scheduleClass;
      
      await ctx.reply("✅ Расписание успешно обновлено!", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📖 Посмотреть расписание", callback_data: "view_schedule" }],
            [{ text: "🏠 В меню", callback_data: "main_menu" }]
          ]
        }
      });
    } else {
      await ctx.reply("Отправьте именно *фото* расписания (не файл и не текст).", {
        parse_mode: "Markdown"
      });
    }
    return;
  }
  
  if (ctx.session.editStep) {
    if (!user || user.role !== "admin") {
      delete ctx.session.editStep;
      delete ctx.session.selectedSubject;
      delete ctx.session.selectedDate;
      await ctx.reply("У вас нет прав для редактирования ДЗ.");
      return;
    }
    
    if (ctx.session.editStep === "waiting_subject_for_add") {
      if (!ctx.message.text) {
        await ctx.reply("Отправьте название предмета текстом.\nНапример: Алгебра, Физика, История", {
          parse_mode: "Markdown"
        });
        return;
      }
      
      const subject = ctx.message.text.trim();
      ctx.session.selectedSubject = subject;
      ctx.session.editStep = "waiting_dz_for_add";
      
      await ctx.reply(`✏️ Предмет: ${subject}\n📅 Дата: ${ctx.session.selectedDate}\nТеперь отправьте домашнее задание (текст или фото с подписью):`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: "❌ Отмена", callback_data: "edit_dz_panel" }]
          ]
        },
        parse_mode: "Markdown"
      });
      return;
    }
    
    if (ctx.session.editStep === "waiting_dz_for_add") {
      const dateStr = ctx.session.selectedDate;
      const subject = ctx.session.selectedSubject;
      const classKey = user.class;
      
      let taskContent = ctx.message.text || ctx.message.caption || "Домашнее задание (файл/фото без описания)";
      
      if (ctx.message.photo) {
        const photo = ctx.message.photo[ctx.message.photo.length - 1];
        const photoId = photo.file_id;
        taskContent = {
          text: ctx.message.caption || "Домашнее задание с фото",
          photo_id: photoId
        };
      }
      
      const dz = await getClassHomework(classKey);
      if (!dz[dateStr]) dz[dateStr] = {};
      dz[dateStr][subject] = taskContent;
      
      await saveClassHomework(classKey, dz);
      
      delete ctx.session.editStep;
      delete ctx.session.selectedSubject;
      delete ctx.session.selectedDate;
      
      await ctx.reply("✅ ДЗ добавлено!", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "➕ Добавить ещё", callback_data: "add_homework" }],
            [{ text: "📋 Посмотреть ДЗ на эту дату", callback_data: `show_day_${dateStr}` }],
            [{ text: "🏠 В меню", callback_data: "main_menu" }]
          ]
        },
        parse_mode: "Markdown"
      });
      return;
    }
  }
  
  if (!text) return;
  
  const normalizedText = normalizeText(text);
  
  if (normalizedText === "/START" || normalizedText.includes("НАЧАТЬ") || normalizedText.includes("СТАРТ")) {
    await showStart(ctx);
  } else if (normalizedText === "/REG" || normalizedText.includes("ЗАРЕГИСТРИРОВАТЬСЯ")) {
    await showRegStep1(ctx);
  } else if (normalizedText === "/MENU" || normalizedText.includes("МЕНЮ")) {
    await showMainMenu(ctx);
  } else if (normalizedText === "/HELP" || normalizedText.includes("ПОМОЩЬ")) {
    await showHelp(ctx);
  } else if (normalizedText === "/ME" || normalizedText.includes("ПРОФИЛЬ") || normalizedText.includes("Я") || normalizedText.includes("АККАУНТ")) {
    await showMe(ctx);
  } else if (normalizedText === "/DAY" || normalizedText.includes("СЕГОДНЯ") || normalizedText.includes("СЕЙЧАС") || normalizedText.includes("ЭТОТ") ) {
    await showTodayDZ(ctx);
  } else if (normalizedText === "/NEXT_DAY" || normalizedText.includes("ЗАВТРА")) {
    await showTomorrowDZ(ctx);
  } else if (normalizedText === "/XUI" || normalizedText.includes("ХУЙ")) {
    await showmypelis(ctx);
  } else if (normalizedText === "/WEEKEND" || normalizedText.includes("НЕДЕЛЯ")) {
    await showWeekDZ(ctx);
  } else if (normalizedText === "/NEXT_WEEK" || normalizedText.includes("ДРУГАЯ НЕДЕЛЯ")) {
    await showNextWeekDZ(ctx);
  } else if (normalizedText === "/EDIT" || normalizedText.includes("РЕДАКТИРОВАТЬ")) {
    if (user && user.role === "admin") {
      await showEditPanel(ctx);
    } else {
      await ctx.reply("❌ Эта команда доступна только администраторам.");
    }
  } else if (normalizedText === "/STATS" || normalizedText.includes("СТАТИСТИКА")) {
    if (user && user.role === "admin") {
      await showAdminStats(ctx);
    } else {
      await ctx.reply("Эта команда доступна только администраторам.");
    }
  } else {
    if (text === "📆 Сегодня") {
      await showTodayDZ(ctx);
    } else if (text === "📅 Завтра") {
      await showTomorrowDZ(ctx);
    } else if (text === "📆 Неделя") {
      await showWeekDZ(ctx);
    } else if (text === "⏭️ Другая неделя") {
      await showNextWeekDZ(ctx);    
    } else if (text === "🔍 Выбор дня") {
      await showDatePicker(ctx, 0, false);
    } else if (text === "📥 Всё ДЗ") {
      await showAllHomeworkFromToday(ctx);
    } else if (text === "📖 Расписание") {
      await viewSchedule(ctx);
    } else if (text === "👤 Профиль") {
      await showMe(ctx);
    } else if (text === "⚙️ Настройка") {
      await showKeyboardConfig(ctx);
    } else if (text === "🏠 Меню") {
      await showMainMenu(ctx);
    } else if (text === "📝 Зарегистрироваться") {
      await showRegStep1(ctx);
    }
  }
});

const SUBJECT_ICONS = {
  "Алгебра": "📐",
  "Биология": "🧬",
  "Химия": "🧪",
  "Физкультура": "🏃",
  "Математика": "🔢",
  "Геометрия": "📏",
  "Физика": "⚡",
  "Информатика": "💻",  
  "ОПИД ВН": "💻",
  "Русский": "📝",
  "Литература": "📖",
  "Английский": "🇬🇧",
  "История": "🏛️",
  "Обществознание": "👥",
  "РОВ": "👥",
  "География": "🌍",
  "Кубань": "🌍",
  "Кубановедение": "🌍",
  "Мир ДО": "🌍",
  "ОБЖ": "🛡️",  
  "ОБЗР": "🛡️",
  "Музыка": "🎵",
  "ИЗО": "🎨",
  "Технология": "🔧"
};

async function getUserById(userId) {
  try {
    return await User.findOne({ id: userId.toString() });
  } catch (e) {
    console.error("Ошибка получения пользователя:", e);
    return null;
  }
}

async function saveUser(userData) {
  try {
    return await User.findOneAndUpdate(
      { id: userData.id.toString() },
      userData,
      { upsert: true, new: true }
    );
  } catch (e) {
    console.error("Ошибка сохранения пользователя:", e);
    return null;
  }
}

async function deleteUser(userId) {
  try {
    await User.deleteOne({ id: userId.toString() });
    return true;
  } catch (e) {
    console.error("Ошибка удаления пользователя:", e);
    return false;
  }
}

async function getClassHomework(classKey) {
  try {
    const hw = await Homework.findOne({ classKey });
    return hw ? hw.data : {};
  } catch (e) {
    console.error("Ошибка получения ДЗ:", e);
    return {};
  }
}

async function saveClassHomework(classKey, data, schedulePhotoId = null) {
  try {
    const updateData = { classKey, data, updated_at: new Date() };
    if (schedulePhotoId !== null) {
      updateData.schedule_photo_id = schedulePhotoId;
    }
    await Homework.findOneAndUpdate(
      { classKey },
      updateData,
      { upsert: true, new: true }
    );
    return true;
  } catch (e) {
    console.error("Ошибка сохранения ДЗ:", e);
    return false;
  }
}

async function getSchedulePhotoId(classKey) {
  try {
    const hw = await Homework.findOne({ classKey });
    return hw?.schedule_photo_id || null;
  } catch (e) {
    console.error("Ошибка получения расписания:", e);
    return null;
  }
}

async function setSchedulePhotoId(classKey, photoId) {
  try {
    await Homework.findOneAndUpdate(
      { classKey },
      { schedule_photo_id: photoId, updated_at: new Date() },
      { upsert: true }
    );
    return true;
  } catch (e) {
    console.error("Ошибка сохранения расписания:", e);
    return false;
  }
}

async function isAdmin(ctx) {
  const user = await getUserById(ctx.from?.id);
  return user && user.role === "admin";
}

async function updateUserStats(userId, action) {
  try {
    const updates = {
      $inc: { 'stats.homework_views': 0 },
      $set: { 'stats.last_active': new Date() }
    };
    
    switch (action) {
      case 'view_homework':
        updates.$inc['stats.homework_views'] = 1;
        break;
      default:
        break;
    }
    
    await User.updateOne(
      { id: userId.toString() },
      updates
    );
  } catch (e) {
    console.error("Ошибка обновления статистики пользователя:", e);
  }
}

async function showAllHomeworkFromToday(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user) {
    await ctx.reply("🚫 Сначала зарегистрируйтесь!", {
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Регистрация", callback_data: "reg_step1" }]]
      }
    });
    return;
  }
  
  const today = new Date();
  const dz = await getClassHomework(user.class);
  
  // Получаем все даты с ДЗ, начиная с сегодняшнего дня
  const allDates = Object.keys(dz)
    .filter(dateStr => {
      const date = new Date(dateStr);
      return date >= today.setHours(0, 0, 0, 0);
    })
    .sort((a, b) => new Date(a) - new Date(b));
  
  if (allDates.length === 0) {
    const msg = `📚 Всё домашнее задание*\n🏫 Класс: ${user.class}\n🎉 Начиная с сегодняшнего дня домашних заданий нет!`;
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "📆 Сегодня", callback_data: "cmd_day" }, { text: "📅 Завтра", callback_data: "cmd_next_day" }],
          [{ text: "🏠 В меню", callback_data: "main_menu" }]
        ]
      }
    };
    
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await ctx.editMessageText(msg, { ...keyboard, parse_mode: "Markdown" });
    } else {
      await ctx.reply(msg, { ...keyboard, parse_mode: "Markdown" });
    }
    return;
  }
  
  let msg = `📚 *Всё домашнее задание от сегодня*\n🏫 Класс: ${user.class}
📅 Найдено заданий на ${allDates.length} ${getDaysWord(allDates.length)}\n\n━━━━━━━━━━━━━━━━━━━━`;
  
  let totalTasks = 0;
  
  for (const dateStr of allDates) {
    const dayDZ = dz[dateStr];
    const tasksCount = Object.keys(dayDZ).length;
    totalTasks += tasksCount;
    
    const dateObj = new Date(dateStr);
    const isToday = dateObj.toDateString() === new Date().toDateString();
    const isTomorrow = dateObj.toDateString() === new Date(Date.now() + 86400000).toDateString();
    
    let dateLabel = formatDate(dateStr);
    if (isToday) dateLabel = `📍 СЕГОДНЯ (${dateLabel})`;
    else if (isTomorrow) dateLabel = `📍 ЗАВТРА (${dateLabel})`;

    msg += `📅 *${dateLabel}*\n`;
    msg += `└─ Заданий: ${tasksCount}\n\n`;
    
    for (const [subject, task] of Object.entries(dayDZ)) {
      const icon = getSubjectIcon(subject);
      const taskText = typeof task === 'object' ? task.text : task;
      const hasPhoto = typeof task === 'object' && task.photo_id ? " 📷" : "";
      
      msg += `   ${icon} *${subject}*${hasPhoto}\n`;
      msg += `   ${truncateText(taskText, 80)}\n\n`;
    }
    
    msg += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  }
  
  msg += `📊 *Всего:* ${totalTasks} ${getTasksWord(totalTasks)} на ${allDates.length} ${getDaysWord(allDates.length)}`;
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📆 Сегодня", callback_data: "cmd_day" }, { text: "📅 Завтра", callback_data: "cmd_next_day" }],
        [{ text: "🔍 Выбрать день", callback_data: "cmd_choice" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  };
  
  await updateUserStats(userId, 'view_homework');
  
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { ...keyboard, parse_mode: "Markdown" });
  } else {
    await ctx.reply(msg, { ...keyboard, parse_mode: "Markdown" });
  }
}

function getDaysWord(count) {
  if (count % 10 === 1 && count % 100 !== 11) return "день";
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return "дня";
  return "дней";
}

function getTasksWord(count) {
  if (count % 10 === 1 && count % 100 !== 11) return "задание";
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) return "задания";
  return "заданий";
}


async function showDatePicker(ctx, weekOffset = 0, isEditMode = false) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);

  if (!user) {
    await ctx.reply("🚫 Сначала зарегистрируйтесь!", {
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Регистрация", callback_data: "reg_step1" }]]
      }
    });
    return;
  }

  const startDate = new Date();
  startDate.setDate(startDate.getDate() + (weekOffset * 7));

  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(startDate);
    date.setDate(startDate.getDate() + i);
    dates.push(date);
  }

  const buttons = [];
  const weekDays = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

  let headerRow = [];
  for (let i = 0; i < 7; i++) {
    const dayOfWeek = dates[i].getDay();
    headerRow.push({ text: weekDays[dayOfWeek], callback_data: "noop" });
  }
  buttons.push(headerRow);

  const callbackPrefix = isEditMode ? "add_hw_date_" : "show_day_";
  const dateRow = dates.map(date => {
    const day = date.getDate();
    const month = date.getMonth() + 1;
    const dateStr = date.toISOString().split("T")[0];
    const today = new Date().toDateString();
    const isToday = date.toDateString() === today;

    return {
      text: isToday ? `[${day}]` : `${day}`,
      callback_data: `${callbackPrefix}${dateStr}`
    };
  });
  buttons.push(dateRow);

  const startDay = dates[0].getDate();
  const endDay = dates[6].getDate();
  const startMonth = dates[0].getMonth() + 1;
  const endMonth = dates[6].getMonth() + 1;

  let periodText;
  if (startMonth === endMonth) {
    periodText = `${startDay}-${endDay} ${getMonthName(startMonth)}`;
  } else {
    periodText = `${startDay} ${getMonthName(startMonth)} - ${endDay} ${getMonthName(endMonth)}`;
  }

  // Навигация
  const navRow = [];
  if (weekOffset > 0) {
    navRow.push({ text: "◀️ Назад", callback_data: `week_nav_${weekOffset - 1}_${isEditMode}` });
  }
  navRow.push({ text: periodText, callback_data: "noop" });
  if (weekOffset < 8) {
    navRow.push({ text: "Вперёд ▶️", callback_data: `week_nav_${weekOffset + 1}_${isEditMode}` });
  }
  buttons.push(navRow);

  buttons.push([{ text: "🏠 В меню", callback_data: "main_menu" }]);

  const msg = `📅 *${isEditMode ? 'Выбор даты для редактирования' : 'Выбор даты'}*\n
🔍 Выберите день для ${isEditMode ? 'редактирования' : 'просмотра'} ДЗ:\n[  ] - сегодня`;

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    try {
      await ctx.editMessageText(msg, {
        reply_markup: { inline_keyboard: buttons },
        parse_mode: "Markdown"
      });
    } catch (e) {
      try { await ctx.deleteMessage(); } catch {}
      await ctx.reply(msg, {
        reply_markup: { inline_keyboard: buttons },
        parse_mode: "Markdown"
      });
    }
  } else {
    await ctx.reply(msg, {
      reply_markup: { inline_keyboard: buttons },
      parse_mode: "Markdown"
    });
  }
}

function getMonthName(month) {
  const months = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
  return months[month - 1];
}

async function showStart(ctx) {
  const userId = ctx.from?.id;
  const user = await getUserById(userId);
  const firstName = ctx.from?.first_name || "друг";
  let msg;
  
  if (user) {
    msg = `👋 С возвращением, ${firstName}!

🎓 Ваш класс: ${user.class}
📚 Роль: ${user.role === "admin" ? "🎓 Админ" : "🎒 Ученик"}

Выберите действие ниже или используйте клавиатуру для быстрого доступа к домашнему заданию.`;
  } else {
    msg = `👋 Добро пожаловать, ${firstName}!

📚 Я — бот для домашних заданий, который поможет тебе:
✅ Смотреть ДЗ на сегодня и завтра
✅ Просматривать задания на неделю вперёд
✅ Получать расписание уроков
✅ Быстро находить нужную информацию

🚀 Для начала работы зарегистрируйся!`;
  }
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: user ? [
        [{ text: "📆 Сегодня", callback_data: "cmd_day" }, { text: "📅 Завтра", callback_data: "cmd_next_day" }],
        [{ text: "🏠 Главное меню", callback_data: "main_menu" }],
        [{ text: "👤 Мой профиль", callback_data: "show_profile" }]
      ] : [
        [{ text: "📝 Зарегистрироваться", callback_data: "reg_step1" }],
        [{ text: "❓ Как это работает?", callback_data: "help_and_command" }]
      ]
    }
  };
  
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { ...keyboard });
  } else {
    await ctx.reply(msg, { ...keyboard });
  }
}

async function showMe(ctx) {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.reply("Не удалось определить ваш ID.");
    return;
  }
  const user = await getUserById(userId);
  if (!user) {
    await ctx.reply("🚫 Вы не зарегистрированы\nИспользуйте кнопку ниже для регистрации.", {
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Зарегистрироваться", callback_data: "reg_step1" }]]
      }
    });
    return;
  }
  const roleText = user.role === "admin" ? "🎓 Администратор" : "🎒 Ученик";
  const roleEmoji = user.role === "admin" ? "👑" : "📚";
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Не указано";
  const username = user.username ? `@${user.username}` : "не указан";
  const regDate = new Date(user.registered_at).toLocaleDateString("ru-RU", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });
  const hwViews = user.stats?.homework_views || 0;
  const lastActive = user.stats?.last_active
    ? new Date(user.stats.last_active).toLocaleDateString("ru-RU")
    : "—";
  
  const profileText = `${roleEmoji} *Ваш профиль*

👤 Имя: ${fullName}
💬 Юзернейм: ${username}
🎭 Роль: ${roleText}
🏫 Класс: ${user.class}

📊 Статистика:
├ 📖 Просмотров ДЗ: ${hwViews}
└ 🕐 Последняя активность: ${lastActive}

📅 Дата регистрации: ${regDate}`;
  
  const buttons = [
    [{ text: "🔔 Уведомления: " + (user.notifications_enabled !== false ? "✅ Вкл" : "❌ Выкл"), callback_data: "toggle_notifications" }]
  ];
  
  if (user.role !== "admin") {
    buttons.push([{ text: "🎓 Стать админом", callback_data: "request_admin" }]);
  }
  
  buttons.push([{ text: "🏠 В меню", callback_data: "main_menu" }]);
  buttons.push([{ text: "🗑️ Удалить профиль", callback_data: "confirm_delete_profile" }]);
  
  const keyboard = { reply_markup: { inline_keyboard: buttons } };
  
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(profileText, { ...keyboard, parse_mode: "Markdown" });
  } else {
    await ctx.reply(profileText, { ...keyboard, parse_mode: "Markdown" });
  }
}


async function showRegStep1(ctx) {
  const userId = ctx.from?.id;
  const user = await getUserById(userId);
  
  if (user) {
    const msg = `✅ Вы уже зарегистрированы!\n🏫 Ваш класс: ${user.class}
🎭 Роль: ${user.role === "admin" ? "🎓 Админ" : "🎒 Ученик"}`;
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🏠 В главное меню", callback_data: "main_menu" }],
          [{ text: "👤 Мой профиль", callback_data: "show_profile" }],
          [{ text: "🔄 Перерегистрироваться", callback_data: "confirm_delete_profile" }]
        ]
      }
    };
    
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await ctx.editMessageText(msg, { ...keyboard });
    } else {
      await ctx.reply(msg, { ...keyboard });
    }
    return;
  }
  
  const msg = `📋 *Регистрация*\n┌ Шаг 1 из 4: Выбор роли
├ Шаг 2: Выбор буквы класса\n├ Шаг 3: Выбор цифры класса
└ Шаг 4: Подтверждение\n⏱️ Это займёт меньше минуты!\n👇 Выберите вашу роль:`;
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "👑 Администратор", callback_data: "reg_select_role_admin" }],
        [{ text: "🎒 Ученик", callback_data: "reg_select_role_user" }],
        [{ text: "❌ Отмена", callback_data: "start_bot" }]
      ]
    }
  };
  
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    try {
      await ctx.editMessageText(msg, { ...keyboard, parse_mode: "Markdown" });
    } catch (e) {
      try { await ctx.deleteMessage(); } catch {}
      await ctx.reply(msg, { ...keyboard, parse_mode: "Markdown" });
    }
  } else {
    await ctx.reply(msg, { ...keyboard, parse_mode: "Markdown" });
  }
}

async function showRegStep2(ctx, selectedRole) {
  ctx.session.selectedRole = selectedRole;
  
  const roleText = selectedRole === "admin" ? "👑 Администратор" : "🎒 Ученик";
  const msg = `📋 *Регистрация*\n✅ Роль: *${roleText}*\n┌ Шаг 2 из 4: Выбор буквы класса\n👇 Выберите букву вашего класса:`;
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "А", callback_data: "reg_select_letter_А" },
          { text: "Б", callback_data: "reg_select_letter_Б" },
          { text: "В", callback_data: "reg_select_letter_В" }
        ],
        [
          { text: "Г", callback_data: "reg_select_letter_Г" },
          { text: "Д", callback_data: "reg_select_letter_Д" },
          { text: "Е", callback_data: "reg_select_letter_Е" }
        ],
        [{ text: "← Назад к выбору роли", callback_data: "reg_step1" }],
        [{ text: "❌ Отмена", callback_data: "start_bot" }]
      ]
    }
  };
  
  await ctx.answerCbQuery();
  await ctx.editMessageText(msg, { ...keyboard, parse_mode: "Markdown" });
}

async function showRegStep3(ctx, selectedLetter) {
  ctx.session.selectedLetter = selectedLetter;
  
  const roleText = ctx.session.selectedRole === "admin" ? "👑 Администратор" : "🎒 Ученик";
  const msg = `📋 *Регистрация*\n✅ Роль: *${roleText}*\n✅ Буква класса: *${selectedLetter}*
┌ Шаг 3 из 4: Выбор цифры класса\n👇 Выберите цифру вашего класса:`;
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "3", callback_data: "reg_select_number_3" },
          { text: "4", callback_data: "reg_select_number_4" },
          { text: "5", callback_data: "reg_select_number_5" }
        ],
        [
          { text: "6", callback_data: "reg_select_number_6" },
          { text: "7", callback_data: "reg_select_number_7" },
          { text: "8", callback_data: "reg_select_number_8" }
        ],
        [
          { text: "9", callback_data: "reg_select_number_9" },
          { text: "10", callback_data: "reg_select_number_10" },
          { text: "11", callback_data: "reg_select_number_11" }
        ],
        [{ text: "← Назад к выбору буквы", callback_data: `reg_back_to_letter_${ctx.session.selectedRole}` }],
        [{ text: "❌ Отмена", callback_data: "start_bot" }]
      ]
    }
  };
  
  await ctx.answerCbQuery();
  await ctx.editMessageText(msg, { ...keyboard, parse_mode: "Markdown" });
}

async function showRegStep4(ctx, selectedNumber) {
  ctx.session.selectedNumber = selectedNumber;
  
  const roleText = ctx.session.selectedRole === "admin" ? "👑 Администратор" : "🎒 Ученик";
  const selectedClass = `${selectedNumber}${ctx.session.selectedLetter}`;
  ctx.session.selectedClass = selectedClass;
  
  const msg = `📋 *Регистрация*\n┌ Шаг 4 из 4: Подтверждение\n✅ Роль: *${roleText}*\n✅ Класс: *${selectedClass}*
${ctx.session.selectedRole === "admin" ? "⚠️ *Внимание:* Ваша заявка на роль администратора будет отправлена на проверку модераторам." : ""}\nВсё верно?`;
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Да, всё верно!", callback_data: "reg_confirm" }],
        [{ text: "← Изменить класс", callback_data: `reg_back_to_letter_${ctx.session.selectedRole}` }],
        [{ text: "← Изменить роль", callback_data: "reg_step1" }],
        [{ text: "❌ Отмена", callback_data: "start_bot" }]
      ]
    }
  };
  
  await ctx.answerCbQuery();
  await ctx.editMessageText(msg, { ...keyboard, parse_mode: "Markdown" });
}

async function confirmRegistration(ctx) {
  const userId = ctx.from.id.toString();
  const selectedClass = ctx.session.selectedClass;
  const selectedRole = ctx.session.selectedRole;
  
  if (!selectedClass || !selectedRole) {
    await ctx.answerCbQuery("Ошибка: данные регистрации потеряны. Попробуйте снова.");
    await showRegStep1(ctx);
    return;
  }
  
  const userExists = await getUserById(userId);
  if (userExists) {
    await ctx.answerCbQuery("Вы уже зарегистрированы.");
    ctx.session = {};
    return;
  }
  
  // Если роль - ученик, регистрируем сразу
  if (selectedRole === "user") {
    const newUser = new User({
      id: userId,
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      last_name: ctx.from.last_name,
      class: selectedClass,
      role: "user",
      chat_id: ctx.chat.id,
      chat_type: ctx.chat.type,
      registered_at: new Date(),
      notifications_enabled: true,
      stats: {
        homework_views: 0,
        last_active: new Date()
      }
    });
    
    try {
      await newUser.save();
      ctx.session = {};
      
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `🎉 *Регистрация завершена!*\n` +
        `👤 Имя: ${newUser.first_name || 'не указано'}` +
        `🏫 Класс: ${newUser.class}` +
        `🎭 Роль: 🎒 Ученик\n` +
        `Добро пожаловать в систему домашних заданий!`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🏠 Перейти в меню", callback_data: "main_menu" }],
              [{ text: "⌨️ Настроить клавиатуру", callback_data: "cmd_configure" }]
            ]
          },
          parse_mode: "Markdown"
        }
      );
    } catch (e) {
      console.error("Ошибка регистрации:", e);
      await ctx.answerCbQuery("Произошла ошибка при регистрации. Попробуйте еще раз.");
    }
  }
  
  // Если роль - админ, отправляем заявку супер-админам
  else if (selectedRole === "admin") {
    const requestMessage = `👑 *НОВАЯ ЗАЯВКА НА АДМИНИСТРАТОРА*\n` +
                          `👤 Пользователь: ${ctx.from.first_name || 'Неизвестно'} ${ctx.from.last_name || ''}` +
                          `💬 Юзернейм: @${ctx.from.username || 'отсутствует'}` +
                          `🆔 ID: \`${userId}\`` +
                          `🏫 Класс: ${selectedClass}` +
                          `📅 Дата заявки: ${new Date().toLocaleString('ru-RU')}\n` +
                          `Желает стать администратором класса.`;
    
    const buttons = [
      [
        { text: "✅ Одобрить", callback_data: `super_approve_${userId}` },
        { text: "❌ Отклонить", callback_data: `super_reject_${userId}` }
      ]
    ];
    
    sessions.set(`pending_admin_${userId}`, {
      userId,
      username: ctx.from.username,
      first_name: ctx.from.first_name,
      last_name: ctx.from.last_name,
      class: selectedClass,
      chat_id: ctx.chat.id,
      chat_type: ctx.chat.type
    });
    
    let successCount = 0;
    for (const adminChatId of adminChatIds) {
      try {
        await bot.telegram.sendMessage(adminChatId, requestMessage, {
          reply_markup: { inline_keyboard: buttons },
          parse_mode: "Markdown"
        });
        successCount++;
      } catch (e) {
        console.error(`Не удалось отправить заявку супер-админу ${adminChatId}:`, e);
      }
    }
    
    if (successCount > 0) {
      ctx.session = {};
      await ctx.answerCbQuery();
      await ctx.editMessageText(
        `📤 *Заявка отправлена!*` +
        `Ваша заявка на роль администратора класса ${selectedClass} отправлена модераторам.` +
        `⏳ Ожидайте подтверждения. Это может занять некоторое время.` +
        `💡 Вы получите уведомление, когда заявка будет рассмотрена.` +
        `💡 Или напишите одному из них`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "🏠 На главную", callback_data: "start_bot" }],
              [{ text: "👎 Написать Сергею", url: "https://t.me/Cageyserg" }],
              [{ text: "😎 Написать Александру", url: "https://t.me/Sashshih" }]

            ]
          },
          parse_mode: "Markdown"
        }
      );
    } else {
      await ctx.answerCbQuery("Ошибка: не удалось отправить заявку модераторам.");
    }
  }
}

async function showMainMenu(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  const isAdminUser = user?.role === "admin";
  
  const msg = `🏠 *Главное меню*${user ? `\n👋 Привет, ${user.first_name || "друг"}!\n🏫 Класс: ${user.class}\nВыберите действие:` : `\n
  Вы не зарегистрированы. Зарегистрируйтесь для доступа ко всем функциям.`}`;
  
  const baseButtons = [
    [
      { text: "📆 Сегодня", callback_data: "cmd_day" },
      { text: "📅 Завтра", callback_data: "cmd_next_day" }
    ],
    [
      { text: "📆 Неделя", callback_data: "cmd_week" },
      { text: "⏭️ Другая неделя", callback_data: "cmd_next_week" }
    ],
    [{ text: "📖 Расписание уроков", callback_data: "view_schedule" }],
    [
      { text: "🔍 Выбор дня", callback_data: "cmd_choice" },
      { text: "📥 Всё ДЗ", callback_data: "cmd_all" }
    ]
  ];
  
  if (isAdminUser) {
    baseButtons.push([
      { text: "📤 Загрузить расписание", callback_data: "upload_schedule" },
      { text: "✏️ Редактировать ДЗ", callback_data: "edit_dz_panel" }
    ]);
    baseButtons.push([{ text: "📊 Статистика", callback_data: "admin_stats" }]);
  }
  
  baseButtons.push([
    { text: "👤 Профиль", callback_data: "show_profile" },
    { text: "⚙️ Настройка", callback_data: "cmd_configure" }
  ]);

  baseButtons.push([{ text: "📊 Статистика", callback_data: "admin_stats" }]);
  baseButtons.push([{ text: "⌨️ Открыть клавиатуру", callback_data: "show_reply_keyboard" }]);
  
  if (!user) {
    baseButtons.push([{ text: "📝 Зарегистрироваться", callback_data: "reg_step1" }]);
  }
  
  const keyboard = { reply_markup: { inline_keyboard: baseButtons } };
  
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    const callbackMsg = ctx.callbackQuery.message;
    if (callbackMsg?.text) {
      await ctx.editMessageText(msg, { ...keyboard, parse_mode: "Markdown" });
    } else {
      try { await ctx.deleteMessage(); } catch {}
      await ctx.reply(msg, { ...keyboard, parse_mode: "Markdown" });
    }
  } else {
    await ctx.reply(msg, { ...keyboard, parse_mode: "Markdown" });
  }
}

async function showHelp(ctx) {
  const msg = '❓ *Помощь и команды*\n\n' +
              '📚 *Основные команды*:\n' +
              '• /*start* — Начать работу с ботом\n' +
              '• /*reg* — Зарегистрироваться\n' +
              '• /*menu* — Главное меню\n' +
              '• /*me* — Мой профиль\n' +
              '• /*help* — Эта справка\n\n' +
              '📆 *Просмотр ДЗ*:\n' +
              '• /*day* — ДЗ на сегодня\n' +
              '• /*next_day* — ДЗ на завтра\n' +
              '• /*weekend* — ДЗ на неделю\n\n' +
              '🎓 *Для админов*:\n' +
              '• /*edit* — Редактировать ДЗ\n' +
              '• /*stats* — Статистика класса\n\n' +
              '💡 *Совет*: Используйте кнопки клавиатуры для быстрого доступа!';

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🏠 В меню', callback_data: 'main_menu' }]
      ]
    }
  };

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, keyboard);
  } else {
    await ctx.reply(msg, keyboard);
  }
}

async function showTodayDZ(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user) {
    await ctx.reply("🚫 Сначала зарегистрируйтесь!", {
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Регистрация", callback_data: "reg_step1" }]]
      }
    });
    return;
  }
  
  const today = new Date().toISOString().split("T")[0];
  const dz = await getClassHomework(user.class);
  const todayDZ = dz[today];
  
  let msg;
  let hasPhotos = false;
  if (!todayDZ || Object.keys(todayDZ).length === 0) {
    msg = `📅 *ДЗ на сегодня* (${formatDate(today)})\n🎉 На сегодня заданий нет!
\n🏫 Класс: ${user.class}`;
  } else {
    msg = `📅 *ДЗ на сегодня* (${formatDate(today)})\n🏫 Класс: ${user.class}`;
    for (const [subject, task] of Object.entries(todayDZ)) {
      const icon = getSubjectIcon(subject);
      const taskText = typeof task === 'object' ? task.text : task;
      msg += `${icon} *${subject}*\n${taskText}`;
      if (typeof task === 'object' && task.photo_id) {
        hasPhotos = true;
      }
    }
  }
  
  const buttons = [
    [{ text: "📅 Завтра", callback_data: "cmd_next_day" }],
    [{ text: "📆 Неделя", callback_data: "cmd_week" }]
  ];
  
  if (hasPhotos) {
    buttons.unshift([{ text: "📷 Показать фотографии", callback_data: `show_photos_${today}` }]);
  }
  
  buttons.push([{ text: "🏠 В меню", callback_data: "main_menu" }]);
  
  const keyboard = { reply_markup: { inline_keyboard: buttons } };
  
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { ...keyboard, parse_mode: "Markdown" });
  } else {
    await ctx.reply(msg, { ...keyboard, parse_mode: "Markdown" });
  }
  
  await updateUserStats(userId, 'view_homework');
}

async function showTomorrowDZ(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user) {
    await ctx.reply("🚫 Сначала зарегистрируйтесь!", {
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Регистрация", callback_data: "reg_step1" }]]
      }
    });
    return;
  }
  
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const dz = await getClassHomework(user.class);
  const tomorrowDZ = dz[tomorrowStr];
  
  let msg;
  let hasPhotos = false;
  if (!tomorrowDZ || Object.keys(tomorrowDZ).length === 0) {
    msg = `📅 *ДЗ на завтра* (${formatDate(tomorrowStr)})\n🎉 На завтра заданий нет!\n🏫 Класс: ${user.class}`;
  } else {
    msg = `📅 *ДЗ на завтра* (${formatDate(tomorrowStr)})\n🏫 Класс: ${user.class}`;
    for (const [subject, task] of Object.entries(tomorrowDZ)) {
      const icon = getSubjectIcon(subject);
      const taskText = typeof task === 'object' ? task.text : task;
      msg += `${icon} *${subject}*\n${taskText}`;
      if (typeof task === 'object' && task.photo_id) {
        hasPhotos = true;
      }
    }
  }
  
  const buttons = [
    [{ text: "📆 Сегодня", callback_data: "cmd_day" }],
    [{ text: "📆 Неделя", callback_data: "cmd_week" }]
  ];
  
  if (hasPhotos) {
    buttons.unshift([{ text: "📷 Показать фотографии", callback_data: `show_photos_${tomorrowStr}` }]);
  }
  
  buttons.push([{ text: "🏠 В меню", callback_data: "main_menu" }]);
  
  const keyboard = { reply_markup: { inline_keyboard: buttons } };
  
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { ...keyboard, parse_mode: "Markdown" });
  } else {
    await ctx.reply(msg, { ...keyboard, parse_mode: "Markdown" });
  }
  
  await updateUserStats(userId, 'view_homework');
}

async function showmypelis(ctx) {
  await ctx.reply("Вы готовы стать одним из разработчиков бота?\n🥶😱😨ИЛИ😰🤯🥵\nБольшая пачечка чипсоов на ваш выбор?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🧠Да", callback_data: "open_new_order" }],
        [{ text: "😱Нет", callback_data: "main_menu" }],
        [{ text: "📊Выбрать пачку", callback_data: "get_chips" }],
        [{ text: "👎👎👎пропустить пасхалку👎👎👎", callback_data: "main_menu" }]
      ]
    }
  });
  return;
}

async function no_axaxax(ctx) {
  await ctx.reply("Мы передумали, может что то еще?\nНапример маленкую  пачку чипсов", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Краб", callback_data: "get_krab" }],
        [{ text: "Сметана зелень", callback_data: "get_smetana" }],
        [{ text: "cheeze", callback_data: "get_cheeze" }],
        [{ text: "лосос", callback_data: "get_losos" }]
      ]
    }
  });
  return;
}

async function get_chips_for_user(ctx) {
  await ctx.reply("Выберите пачку!", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Краб", callback_data: "get_krab" }],
        [{ text: "Сметана зелень", callback_data: "get_smetana" }],
        [{ text: "Cheeze", callback_data: "get_cheeze" }],
        [{ text: "Лосось", callback_data: "delete_profile_confirmed" }]
      ]
    }
  });
  return;
}

async function collect(ctx) {
  await ctx.reply("Вы уверены в своем выборе?", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Да", callback_data: "get_c" }],
        [{ text: "Нет", callback_data: "get_chips" }]
      ]
    }
  });
  return;
}

async function krab_give(ctx) {

  await ctx.reply("Эмм... мне было лень что либо делать, так что... выбери.... ", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "орел", callback_data: "v_o" }],
        [{ text: "решка", callback_data: "v_r" }]
      ]
    }
  });
  return;
}

async function v_o_v(ctx) {
  await ctx.reply("Вы выбрали орел", {});
  return;
}

async function v_r_v(ctx) {
  await ctx.reply("вы выбрали решка", {});
  return;
}

async function showWeekDZ(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user) {
    await ctx.reply("🚫 Сначала зарегистрируйтесь!", {
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Регистрация", callback_data: "reg_step1" }]]
      }
    });
    return;
  }
  
  const dates = getDatesRange(7);
  const dz = await getClassHomework(user.class);
  
  let msg = `📆 *ДЗ на неделю*\n🏫 Класс: ${user.class}`;
  let hasAnyDZ = false;
  
  for (const dateStr of dates) {
    const dayDZ = dz[dateStr];
    if (dayDZ && Object.keys(dayDZ).length > 0) {
      hasAnyDZ = true;
      msg += `📅 *${formatDate(dateStr)}*\n`;
      for (const [subject, task] of Object.entries(dayDZ)) {
        const icon = getSubjectIcon(subject);
        const taskText = typeof task === 'object' ? task.text : task;
        msg += `  ${icon} ${subject}: ${truncateText(taskText, 50)}`;
      }
      msg += "";
    }
  }
  
  if (!hasAnyDZ) {
    msg += `🎉 На эту неделю заданий нет!`;
  }
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "⏭️ Следующая неделя", callback_data: "cmd_next_week" }],
        [{ text: "📆 Сегодня", callback_data: "cmd_day" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  };
  
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { ...keyboard, parse_mode: "Markdown" });
  } else {
    await ctx.reply(msg, { ...keyboard, parse_mode: "Markdown" });
  }
  
  await updateUserStats(userId, 'view_homework');
}

async function showNextWeekDZ(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user) {
    await ctx.reply("🚫 Сначала зарегистрируйтесь!", {
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Регистрация", callback_data: "reg_step1" }]]
      }
    });
    return;
  }
  
  const start = new Date();
  start.setDate(start.getDate() + 7);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date.toISOString().split("T")[0]);
  }
  
  const dz = await getClassHomework(user.class);
  let msg = `⏭️ *ДЗ на следующую неделю*\n🏫 Класс: ${user.class}\n`;
  let hasAnyDZ = false;
  
  for (const dateStr of dates) {
    const dayDZ = dz[dateStr];
    if (dayDZ && Object.keys(dayDZ).length > 0) {
      hasAnyDZ = true;
      msg += `📅 *${formatDate(dateStr)}*\n`;
      for (const [subject, task] of Object.entries(dayDZ)) {
        const icon = getSubjectIcon(subject);
        const taskText = typeof task === 'object' ? task.text : task;
        msg += `  ${icon} ${subject}: ${truncateText(taskText, 50)}\n`;
      }
      msg += "";
    }
  }
  
  if (!hasAnyDZ) {
    msg += `🎉 На следующую неделю заданий нет!`;
  }
  
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📆 Эта неделя", callback_data: "cmd_week" }],
        [{ text: "📆 Сегодня", callback_data: "cmd_day" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  };
  
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { ...keyboard, parse_mode: "Markdown" });
  } else {
    await ctx.reply(msg, { ...keyboard, parse_mode: "Markdown" });
  }
  
  await updateUserStats(userId, 'view_homework');
}

async function showHomeworkOfDay(ctx, dateStr) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user) {
    await ctx.reply("🚫 Сначала зарегистрируйтесь!", {
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Регистрация", callback_data: "reg_step1" }]]
      }
    });
    return;
  }
  
  const dz = await getClassHomework(user.class);
  const dayDZ = dz[dateStr];
  
  let msg;
  let hasPhotos = false;
  if (!dayDZ || Object.keys(dayDZ).length === 0) {
    msg = `📅 *ДЗ на ${formatDate(dateStr)}*\n📝 На этот день заданий нет.`;
  } else {
    msg = `📅 *ДЗ на ${formatDate(dateStr)}*\n`;
    for (const [subject, task] of Object.entries(dayDZ)) {
      const icon = getSubjectIcon(subject);
      const taskText = typeof task === 'object' ? task.text : task;
      msg += `${icon} *${subject}*\n${taskText}\n`;
      if (typeof task === 'object' && task.photo_id) {
        hasPhotos = true;
      }
    }
  }
  
  await updateUserStats(userId, 'view_homework');
  
  const buttons = [
    [{ text: "🔍 Выбрать другой день", callback_data: "cmd_choice" }],
    [{ text: "📆 Сегодня", callback_data: "cmd_day" }, { text: "📅 Завтра", callback_data: "cmd_next_day" }]
  ];
  
  if (hasPhotos) {
    buttons.unshift([{ text: "📷 Показать фотографии", callback_data: `show_photos_${dateStr}` }]);
  }
  
  buttons.push([{ text: "🏠 В меню", callback_data: "main_menu" }]);
  
  const keyboard = { reply_markup: { inline_keyboard: buttons } };
  
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { ...keyboard, parse_mode: "Markdown" });
  } else {
    await ctx.reply(msg, { ...keyboard, parse_mode: "Markdown" });
  }
}

async function viewSchedule(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user) {
    await ctx.reply("🚫 Сначала зарегистрируйтесь!", {
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Регистрация", callback_data: "reg_step1" }]]
      }
    });
    return;
  }
  
  const photoId = await getSchedulePhotoId(user.class);
  
  if (!photoId) {
    const msg = `📖 *Расписание уроков*\n🏫 Класс: ${user.class}\n❌ Расписание ещё не загружено.`;
    const buttons = [];
    
    if (user.role === "admin") {
      buttons.push([{ text: "📤 Загрузить расписание", callback_data: "upload_schedule" }]);
    }
    
    buttons.push([{ text: "🏠 В меню", callback_data: "main_menu" }]);
    
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await ctx.editMessageText(msg, {
        reply_markup: { inline_keyboard: buttons },
        parse_mode: "Markdown"
      });
    } else {
      await ctx.reply(msg, {
        reply_markup: { inline_keyboard: buttons },
        parse_mode: "Markdown"
      });
    }
    return;
  }
  
  const buttons = [];
  if (user.role === "admin") {
    buttons.push([{ text: "📤 Обновить расписание", callback_data: "upload_schedule" }]);
  }
  buttons.push([{ text: "🏠 В меню", callback_data: "main_menu" }]);
  
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    try { await ctx.deleteMessage(); } catch (e) {}
  }
  
  try {
    await ctx.replyWithPhoto(photoId, {
      caption: `📖 *Расписание уроков*\n🏫 Класс: ${user.class}`,
      reply_markup: { inline_keyboard: buttons },
      parse_mode: "Markdown"
    });
  } catch (error) {
    console.error("Ошибка отправки фото расписания:", error);
    await ctx.reply("Не удалось загрузить расписание. Возможно, файл устарел. Загрузите новое расписание.", {
      reply_markup: { inline_keyboard: buttons }
    });
  }
}

async function showKeyboardConfig(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user) {
    await ctx.reply("🚫 Сначала зарегистрируйтесь!", {
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Регистрация", callback_data: "reg_step1" }]]
      }
    });
    return;
  }
  
  const allButtons = ["📆 Сегодня", "📅 Завтра", "📆 Неделя", "⏭️ Другая неделя", "🔍 Выбор дня", "📥 Всё ДЗ", "📖 Расписание", "👤 Профиль", "⚙️ Настройка", "🏠 Меню"];
  const currentButtons = user.custom_keyboard || ["📆 Сегодня", "📅 Завтра", "🏠 Меню"];
  
  const buttons = allButtons.map(btn => {
    const isSelected = currentButtons.includes(btn);
    return [{ text: `${isSelected ? "✅" : "⬜"} ${btn}`, callback_data: `toggle_kb_${btn}` }];
  });
  
  buttons.push([{ text: "💾 Сохранить", callback_data: "save_keyboard" }]);
  buttons.push([{ text: "🏠 В меню", callback_data: "main_menu" }]);
  
  const msg = `⚙️ *Настройка клавиатуры*\nВыберите кнопки, которые хотите видеть на клавиатуре. Отмеченные ✅ будут отображаться.`;
  
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, {
      reply_markup: { inline_keyboard: buttons },
      parse_mode: "Markdown"
    });
  } else {
    await ctx.reply(msg, {
      reply_markup: { inline_keyboard: buttons },
      parse_mode: "Markdown"
    });
  }
}

async function showAdminStats(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user || user.role !== "admin") {
    await ctx.reply("🚫 Эта функция доступна только админам.");
    return;
  }
  
  try {
    const classUsers = await User.find({ class: user.class });
    const totalUsers = classUsers.length;
    const admins = classUsers.filter(u => u.role === "admin").length;
    const activeToday = classUsers.filter(u => {
      if (!u.stats?.last_active) return false;
      const lastActive = new Date(u.stats.last_active);
      const today = new Date();
      return lastActive.toDateString() === today.toDateString();
    }).length;
    
    const totalHomeworkViews = classUsers.reduce((sum, u) => sum + (u.stats?.homework_views || 0), 0);
    
    const msg = `📊 *Статистика класса ${user.class}*\n👥 Всего пользователей: ${totalUsers}
👑 Админов: ${admins}\n🟢 Активны сегодня: ${activeToday}\n📖 Общих просмотров ДЗ: ${totalHomeworkViews}`;
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [[{ text: "🏠 В меню", callback_data: "main_menu" }]]
      }
    };
    
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await ctx.editMessageText(msg, { ...keyboard, parse_mode: "Markdown" });
    } else {
      await ctx.reply(msg, { ...keyboard, parse_mode: "Markdown" });
    }
  } catch (e) {
    console.error("Ошибка получения статистики:", e);
    await ctx.reply("Ошибка получения статистики.");
  }
}

async function showEditPanel(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  if (!user || user.role !== "admin") {
    try {
      await ctx.answerCbQuery("Только админы могут редактировать ДЗ.");
    } catch (e) {
      console.warn("Не удалось ответить на callback:", e.message);
    }
    return;
  }

  const msg = `✏️ *Панель редактирования ДЗ*\nВыберите действие:`;
  const buttons = [
    [{ text: "➕ Добавить ДЗ", callback_data: "add_homework" }],
    [{ text: "🗑️ Удалить ДЗ", callback_data: "delete_homework" }],
    [{ text: "🏠 В меню", callback_data: "main_menu" }]
  ];
  const keyboard = { reply_markup: { inline_keyboard: buttons } };

  try {
    await ctx.answerCbQuery();
  } catch (e) {
    console.warn("Не удалось ответить на callback:", e.message);
  }

  try {
    if (ctx.callbackQuery) {
      await ctx.editMessageText(msg, { ...keyboard, parse_mode: "Markdown" });
    } else {
      await ctx.reply(msg, { ...keyboard, parse_mode: "Markdown" });
    }
  } catch (e) {
    console.error("Ошибка при отображении панели редактирования:", e);
    try {
      await ctx.reply(msg, { ...keyboard, parse_mode: "Markdown" });
    } catch (e2) {
      console.error("Полный провал отображения панели:", e2);
    }
  }
}

async function showReplyKeyboard(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user) {
    await ctx.reply("🚫 Сначала зарегистрируйтесь!", {
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Регистрация", callback_data: "reg_step1" }]]
      }
    });
    return;
  }
  
  const customButtons = user.custom_keyboard || ["📆 Сегодня", "📅 Завтра", "🏠 Меню"];
  const rows = [];
  for (let i = 0; i < customButtons.length; i += 2) {
    rows.push(customButtons.slice(i, i + 2));
  }
  
  await ctx.reply("⌨️ *Клавиатура открыта*", {
    reply_markup: {
      keyboard: rows,
      resize_keyboard: true,
      one_time_keyboard: false
    },
    parse_mode: "Markdown"
  });
  
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery("✅ Клавиатура открыта!");
  }
}

async function requestAdmin(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user) return;
  
  if (user.role === "admin") {
    await ctx.answerCbQuery("Вы уже администратор!");
    return;
  }
  
  if (user.pending_admin_request) {
    await ctx.answerCbQuery("Ваша заявка уже отправлена и рассматривается.");
    return;
  }
  
  const requestMessage = `👑 *Заявка на администратора*\n` +
                        `👤 Пользователь: ${user.first_name || user.username || 'Неизвестно'} (@${user.username || 'отсутствует'})` +
                        `🆔 ID: \`${user.id}\`` +
                        `🎓 Класс: ${user.class}` +
                        `📅 Регистрация: ${new Date(user.registered_at).toLocaleDateString()}\n` +
                        `Желает стать администратором.`;
  
  const buttons = [
    [
      { text: "✅ Одобрить", callback_data: `approve_admin_request_${userId}` },
      { text: "❌ Отклонить", callback_data: `reject_admin_request_${userId}` }
    ]
  ];
  
  user.pending_admin_request = true;
  await saveUser(user);
  
  try {
    const adminUsers = await User.find({ class: user.class, role: "admin" });
    
    for (const admin of adminUsers) {
      try {
        await bot.telegram.sendMessage(admin.chat_id, requestMessage, {
          reply_markup: { inline_keyboard: buttons },
          parse_mode: "Markdown"
        });
      } catch (e) {
        console.error(`Не удалось отправить заявку админу ${admin.id}:`, e);
      }
    }
    
    await ctx.answerCbQuery("Заявка отправлена администраторам. Ожидайте ответа.");
  } catch (e) {
    console.error("Ошибка отправки заявки:", e);
    await ctx.answerCbQuery("Ошибка отправки заявки.");
  }
}

function getSubjectIcon(subject) {
  for (const [key, icon] of Object.entries(SUBJECT_ICONS)) {
    if (subject.toLowerCase().includes(key.toLowerCase())) {
      return icon;
    }
  }
  return "📘";
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const days = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${days[date.getDay()]}, ${day}.${month}`;
}

function getDatesRange(daysCount = 7) {
  const dates = [];
  const start = new Date();
  for (let i = 0; i < daysCount; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date.toISOString().split("T")[0]);
  }
  return dates;
}

function normalizeText(text) {
  return (text || "").trim().toUpperCase();
}

function truncateText(text, maxLength = 50) {
  if (typeof text !== 'string') return String(text).slice(0, maxLength);
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + "...";
}


bot.action("main_menu", (ctx) => showMainMenu(ctx));
bot.action("start_bot", (ctx) => showStart(ctx));
bot.action("cmd_day", (ctx) => showTodayDZ(ctx));
bot.action("cmd_next_day", (ctx) => showTomorrowDZ(ctx));
bot.action("cmd_week", (ctx) => showWeekDZ(ctx));
bot.action("cmd_next_week", (ctx) => showNextWeekDZ(ctx));
bot.action("cmd_choice", (ctx) => showDatePicker(ctx, 0, false));
bot.action("cmd_all", (ctx) => showAllHomeworkFromToday(ctx));
bot.action("view_schedule", (ctx) => viewSchedule(ctx));
bot.action("show_profile", (ctx) => showMe(ctx));
bot.action("cmd_configure", (ctx) => showKeyboardConfig(ctx));
bot.action("help_and_command", (ctx) => showHelp(ctx));
bot.action("show_reply_keyboard", (ctx) => showReplyKeyboard(ctx));
bot.action("admin_stats", (ctx) => showAdminStats(ctx));
bot.action("edit_dz_panel", (ctx) => showEditPanel(ctx));
bot.action("get_chips", (ctx) => get_chips_for_user(ctx));
bot.action("open_new_order", (ctx) => no_axaxax(ctx));
bot.action("get_krab", (ctx) => krab_give(ctx));
bot.action("get_smetana", (ctx) => collect(ctx));
bot.action("get_cheeze", (ctx) => collect(ctx));
bot.action("get_c", (ctx) => collect(ctx));
bot.action("v_o", (ctx) => v_o_v(ctx));
bot.action("v_r", (ctx) => v_r_v(ctx));
bot.action("noop", async (ctx) => await ctx.answerCbQuery());

bot.action(/week_nav_(\d+)_(.+)/, async (ctx) => {
  const weekOffset = parseInt(ctx.match[1]);
  const isEditMode = ctx.match[2] === 'true';
  await showDatePicker(ctx, weekOffset, isEditMode);
});

bot.action(/week_nav_(\d+)/, async (ctx) => {
  const weekOffset = parseInt(ctx.match[1]);
  await showDatePicker(ctx, weekOffset, false);
});

bot.action("reg_step1", (ctx) => showRegStep1(ctx));

bot.action("reg_select_role_admin", async (ctx) => {
  await showRegStep2(ctx, "admin");
});

bot.action("reg_select_role_user", async (ctx) => {
  await showRegStep2(ctx, "user");
});

bot.action(/reg_select_letter_(.+)/, async (ctx) => {
  const selectedLetter = ctx.match[1];
  await showRegStep3(ctx, selectedLetter);
});

bot.action(/reg_select_number_(.+)/, async (ctx) => {
  const selectedNumber = ctx.match[1];
  await showRegStep4(ctx, selectedNumber);
});

bot.action(/reg_back_to_letter_(.+)/, async (ctx) => {
  const role = ctx.match[1];
  await showRegStep2(ctx, role);
});

bot.action("reg_confirm", (ctx) => confirmRegistration(ctx));

bot.action(/super_approve_(.+)/, async (ctx) => {
  const targetUserId = ctx.match[1];
  const pendingData = sessions.get(`pending_admin_${targetUserId}`);
  
  if (!pendingData) {
    await ctx.answerCbQuery("❌ Данные заявки не найдены.");
    return;
  }
  
  const newUser = new User({
    id: pendingData.userId,
    username: pendingData.username,
    first_name: pendingData.first_name,
    last_name: pendingData.last_name,
    class: pendingData.class,
    role: "admin",
    chat_id: pendingData.chat_id,
    chat_type: pendingData.chat_type,
    registered_at: new Date(),
    notifications_enabled: true,
    stats: {
      homework_views: 0,
      last_active: new Date()
    }
  });
  
  try {
    await newUser.save();
    sessions.delete(`pending_admin_${targetUserId}`);
    
    await bot.telegram.sendMessage(pendingData.chat_id,
      `🎉 *Поздравляем!*\n` +
      `Ваша заявка на роль администратора класса ${pendingData.class} была одобрена!\n` +
      `Теперь вы можете:` +
      `✅ Редактировать домашние задания` +
      `✅ Загружать расписание уроков` +
      `✅ Просматривать статистику класса\n` +
      `Добро пожаловать в команду!`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🏠 Перейти в меню", callback_data: "main_menu" }],
            [{ text: "⌨️ Настроить клавиатуру", callback_data: "cmd_configure" }]
          ]
        },
        parse_mode: "Markdown"
      }
    );
    
    await ctx.answerCbQuery("✅ Заявка одобрена!");
    await ctx.editMessageText(
      ctx.update.callback_query.message.text + "✅ *ОДОБРЕНО*",
      {
        reply_markup: { inline_keyboard: [] },
        parse_mode: "Markdown"
      }
    );
  } catch (e) {
    console.error("Ошибка при одобрении заявки:", e);
    await ctx.answerCbQuery("Ошибка при одобрении заявки.");
  }
});

bot.action(/super_reject_(.+)/, async (ctx) => {
  const targetUserId = ctx.match[1];
  const pendingData = sessions.get(`pending_admin_${targetUserId}`);
  
  if (!pendingData) {
    await ctx.answerCbQuery("Данные заявки не найдены.");
    return;
  }
  
  try {
    sessions.delete(`pending_admin_${targetUserId}`);
    
    await bot.telegram.sendMessage(pendingData.chat_id,
      `*Заявка отклонена*\n` +
      `К сожалению, ваша заявка на роль администратора класса ${pendingData.class} была отклонена.\n` +
      `Вы можете зарегистрироваться как обычный ученик и попробовать подать заявку позже.`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "📝 Регистрация", callback_data: "reg_step1" }]
          ]
        },
        parse_mode: "Markdown"
      }
    );
    
    await ctx.answerCbQuery("❌ Заявка отклонена.");
    await ctx.editMessageText(
      ctx.update.callback_query.message.text + "❌ *ОТКЛОНЕНО*",
      {
        reply_markup: { inline_keyboard: [] },
        parse_mode: "Markdown"
      }
    );
  } catch (e) {
    console.error("Ошибка при отклонении заявки:", e);
    await ctx.answerCbQuery("Ошибка при отклонении заявки.");
  }
});

bot.action("confirm_delete_profile", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText("⚠️ *Подтверждение удаления*\nВы уверены, что хотите удалить свой профиль?\nЭто действие нельзя отменить!", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "✅ Да, удалить", callback_data: "delete_profile_confirmed" }],
        [{ text: "❌ Нет, отмена", callback_data: "show_profile" }]
      ]
    },
    parse_mode: "Markdown"
  });
});

bot.action("delete_profile_confirmed", async (ctx) => {
  const userId = ctx.from?.id.toString();
  if (!userId) return;
  
  await deleteUser(userId);
  sessions.delete(userId);
  
  await ctx.answerCbQuery();
  await ctx.editMessageText("🗑️ *Ваш профиль успешно удален.*\nДля повторного использования бота нужно пройти регистрацию заново.", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📝 Зарегистрироваться", callback_data: "reg_step1" }]
      ]
    },
    parse_mode: "Markdown"
  });
});

bot.action("toggle_notifications", async (ctx) => {
  const user = await getUserById(ctx.from?.id);
  if (!user) return;
  
  user.notifications_enabled = !user.notifications_enabled;
  await saveUser(user);
  
  await ctx.answerCbQuery(`🔔 Уведомления: ${user.notifications_enabled ? "Вкл" : "Выкл"}`);
  await showMe(ctx);
});

bot.action("request_admin", (ctx) => requestAdmin(ctx));

bot.action(/toggle_kb_(.+)/, async (ctx) => {
  const buttonName = ctx.match[1];
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user) return;
  
  if (!user.custom_keyboard) user.custom_keyboard = [];
  const index = user.custom_keyboard.indexOf(buttonName);
  
  if (index === -1) {
    user.custom_keyboard.push(buttonName);
  } else {
    user.custom_keyboard.splice(index, 1);
  }
  
  await saveUser(user);
  await ctx.answerCbQuery(`Кнопка "${buttonName}" ${index === -1 ? "включена" : "отключена"}`);
  await showKeyboardConfig(ctx);
});

bot.action("save_keyboard", async (ctx) => {
  await ctx.answerCbQuery("✅ Клавиатура сохранена!");
  await showMainMenu(ctx);
});

bot.action(/show_day_(.+)/, async (ctx) => {
  const dateStr = ctx.match[1];
  await showHomeworkOfDay(ctx, dateStr);
});

bot.action(/show_photos_(.+)/, async (ctx) => {
  const dateStr = ctx.match[1];
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user) return;
  
  const dz = await getClassHomework(user.class);
  const dayDZ = dz[dateStr];
  
  if (!dayDZ) {
    await ctx.answerCbQuery("ДЗ не найдено");
    return;
  }
  
  await ctx.answerCbQuery();
  
  for (const [subject, task] of Object.entries(dayDZ)) {
    if (typeof task === 'object' && task.photo_id) {
      try {
        await ctx.replyWithPhoto(task.photo_id, {
          caption: `📷 *${subject}*\n${task.text}`,
          parse_mode: "Markdown"
        });
      } catch (e) {
        console.error("Ошибка отправки фото:", e);
        await ctx.reply(`Не удалось загрузить фото для предмета "${subject}"`);
      }
    }
  }
});

bot.action("upload_schedule", async (ctx) => {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user || user.role !== "admin") {
    await ctx.answerCbQuery("❌ Только админы могут загружать расписание");
    return;
  }
  
  ctx.session.uploadingSchedule = true;
  ctx.session.scheduleClass = user.class;
  
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `📤 *Загрузка расписания*\n📷 Отправьте фото расписания.\n💡 Совет: отправляйте фото как изображение (не как файл).`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Отмена", callback_data: "main_menu" }]]
      },
      parse_mode: "Markdown"
    }
  );
});

bot.action("add_homework", async (ctx) => {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user || user.role !== "admin") {
    await ctx.answerCbQuery("Только админы могут добавлять ДЗ");
    return;
  }
  
  await showDatePicker(ctx, 0, true);
});

bot.action(/add_hw_date_(.+)/, async (ctx) => {
  const dateStr = ctx.match[1];
  ctx.session.selectedDate = dateStr;
  ctx.session.editStep = "waiting_subject_for_add";
  
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `✏️ *Добавление ДЗ на ${formatDate(dateStr)}*\nОтправьте название предмета текстом.\nНапример: Алгебра, Физика, История`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Отмена", callback_data: "edit_dz_panel" }]]
      },
      parse_mode: "Markdown"
    }
  );
});

bot.action("delete_homework", async (ctx) => {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user || user.role !== "admin") {
    await ctx.answerCbQuery("Только админы могут удалять ДЗ");
    return;
  }
  
  const dz = await getClassHomework(user.class);
  const datesWithDZ = Object.keys(dz).filter(date => Object.keys(dz[date]).length > 0);
  
  if (datesWithDZ.length === 0) {
    await ctx.answerCbQuery("Нет ДЗ для удаления");
    return;
  }
  
  const buttons = [];
  for (const dateStr of datesWithDZ.slice(0, 10)) {
    buttons.push([{ text: formatDate(dateStr), callback_data: `del_hw_date_${dateStr}` }]);
  }
  
  buttons.push([{ text: "❌ Отмена", callback_data: "edit_dz_panel" }]);
  
  await ctx.answerCbQuery();
  await ctx.editMessageText("🗑️ *Выберите дату для удаления ДЗ:*", {
    reply_markup: { inline_keyboard: buttons },
    parse_mode: "Markdown"
  });
});

bot.action(/del_hw_date_(.+)/, async (ctx) => {
  const dateStr = ctx.match[1];
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user || user.role !== "admin") {
    await ctx.answerCbQuery("Только админы могут удалять ДЗ");
    return;
  }
  
  const dz = await getClassHomework(user.class);
  const dayDZ = dz[dateStr];
  
  if (!dayDZ || Object.keys(dayDZ).length === 0) {
    await ctx.answerCbQuery("На эту дату нет ДЗ");
    return;
  }
  
  const buttons = Object.keys(dayDZ).map(subject => [
    { text: `${getSubjectIcon(subject)} ${subject}`, callback_data: `del_hw_subject_${dateStr}_${encodeURIComponent(subject)}` }
  ]);
  
  buttons.push([{ text: "🗑️ Удалить всё ДЗ на эту дату", callback_data: `del_hw_all_${dateStr}` }]);
  buttons.push([{ text: "❌ Отмена", callback_data: "delete_homework" }]);
  
  await ctx.answerCbQuery();
  await ctx.editMessageText(`🗑️ *Удаление ДЗ на ${formatDate(dateStr)}*\nВыберите предмет для удаления:`, {
    reply_markup: { inline_keyboard: buttons },
    parse_mode: "Markdown"
  });
});

bot.action(/del_hw_subject_(.+)_(.+)/, async (ctx) => {
  const [, dateStr, encodedSubject] = ctx.match;
  const subject = decodeURIComponent(encodedSubject);
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user || user.role !== "admin") {
    await ctx.answerCbQuery("Только админы могут удалять ДЗ");
    return;
  }
  
  const dz = await getClassHomework(user.class);
  
  if (dz[dateStr] && dz[dateStr][subject]) {
    delete dz[dateStr][subject];
    
    if (Object.keys(dz[dateStr]).length === 0) {
      delete dz[dateStr];
    }
    
    await saveClassHomework(user.class, dz);
    await ctx.answerCbQuery(`✅ ДЗ по предмету "${subject}" удалено`);
    
    await ctx.editMessageText("✅ *ДЗ успешно удалено!*", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ Добавить ДЗ", callback_data: "add_homework" }],
          [{ text: "🗑️ Удалить ещё", callback_data: "delete_homework" }],
          [{ text: "🏠 В меню", callback_data: "main_menu" }]
        ]
      },
      parse_mode: "Markdown"
    });
  } else {
    await ctx.answerCbQuery("❌ Предмет не найден");
  }
});

bot.action(/del_hw_all_(.+)/, async (ctx) => {
  const dateStr = ctx.match[1];
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user || user.role !== "admin") {
    await ctx.answerCbQuery("Только админы могут удалять ДЗ");
    return;
  }
  
  const dz = await getClassHomework(user.class);
  
  if (dz[dateStr]) {
    delete dz[dateStr];
    await saveClassHomework(user.class, dz);
    await ctx.answerCbQuery("✅ Всё ДЗ на эту дату удалено");
    
    await ctx.editMessageText("✅ *Всё ДЗ на эту дату удалено!*", {
      reply_markup: {
        inline_keyboard: [
          [{ text: "➕ Добавить ДЗ", callback_data: "add_homework" }],
          [{ text: "🗑️ Удалить ещё", callback_data: "delete_homework" }],
          [{ text: "🏠 В меню", callback_data: "main_menu" }]
        ]
      },
      parse_mode: "Markdown"
    });
  } else {
    await ctx.answerCbQuery("На эту дату нет ДЗ");
  }
});

bot.action(/approve_admin_request_(.+)/, async (ctx) => {
  const targetUserId = ctx.match[1];
  const adminId = ctx.from?.id.toString();
  const adminUser = await getUserById(adminId);
  
  if (!adminUser || adminUser.role !== "admin") {
    await ctx.answerCbQuery("Только админы могут одобрять заявки.");
    return;
  }
  
  const targetUser = await getUserById(targetUserId);
  if (!targetUser) {
    await ctx.answerCbQuery("Пользователь не найден.");
    return;
  }
  
  targetUser.role = "admin";
  targetUser.pending_admin_request = undefined;
  await saveUser(targetUser);
  
  try {
    await bot.telegram.sendMessage(targetUser.chat_id, "🎉 *Поздравляем!*\nВаша заявка на роль администратора была одобрена. Теперь вы можете редактировать ДЗ и управлять расписанием.", {
      parse_mode: "Markdown"
    });
  } catch (e) {
    console.error("Не удалось уведомить пользователя об одобрении:", e);
  }
  
  await ctx.answerCbQuery("✅ Заявка одобрена.");
  await ctx.editMessageText(ctx.update.callback_query.message.text + "✅ *ОДОБРЕНО* админом @" + (adminUser.username || adminUser.first_name || adminId), {
    reply_markup: { inline_keyboard: [] },
    parse_mode: "Markdown"
  });
});

bot.action(/reject_admin_request_(.+)/, async (ctx) => {
  const targetUserId = ctx.match[1];
  const adminId = ctx.from?.id.toString();
  const adminUser = await getUserById(adminId);
  
  if (!adminUser || adminUser.role !== "admin") {
    await ctx.answerCbQuery("Только админы могут отклонять заявки.");
    return;
  }
  
  const targetUser = await getUserById(targetUserId);
  if (!targetUser) {
    await ctx.answerCbQuery("Пользователь не найден.");
    return;
  }
  
  targetUser.pending_admin_request = undefined;
  await saveUser(targetUser);
  
  try {
    await bot.telegram.sendMessage(targetUser.chat_id, "😳⚠️К сожалению, ваша заявка на роль администратора была отклонена.😳⚠️", {
      parse_mode: "Markdown"
    });
  } catch (e) {
    console.error("Не удалось уведомить пользователя об отклонении:", e);
  }
  
  await ctx.answerCbQuery("😳⚠️Заявка отклонена.");
  await ctx.editMessageText(ctx.update.callback_query.message.text + "❌⚠️ *ОТКЛОНЕНО* злым админом @" + (adminUser.username || adminUser.first_name || adminId), {
    reply_markup: { inline_keyboard: [] },
    parse_mode: "Markdown"
  });
});

async function startBot() {
  console.log("Запуск бота");
  await connectDB();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`на порту: ${PORT}`);
  });
  bot.launch()
    .then(() => console.log("Бот запущен!"))
    .catch((err) => console.error("😰Ошибка запуска бота:", err));
}

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

startBot();
