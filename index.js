import 'dotenv/config';
import { Telegraf } from "telegraf";
import { config } from "./config.js";
import mongoose from "mongoose";
import { User } from "./models/User.js";
import { Homework } from "./models/Homework.js";
import express from "express";

// === Настройка Express для Render ===
const app = express();
const PORT = process.env.PORT || 5000;
app.get("/", (req, res) => {
  res.status(200).send("✅ Bot is running!");
});

// === Подключение к MongoDB ===
async function connectDB() {
  try {
    await mongoose.connect(config.mongodbUri);
    console.log("✅ MongoDB подключена успешно!");
  } catch (error) {
    console.error("❌ Ошибка подключения к MongoDB:", error);
    process.exit(1);
  }
}

mongoose.connection.on("disconnected", () => {
  console.log("⚠️ MongoDB отключена. Попытка переподключения...");
});
mongoose.connection.on("error", (err) => {
  console.error("❌ Ошибка MongoDB:", err);
});

// === Инициализация бота ===
const bot = new Telegraf(config.telegramToken);

// === Сессия в памяти ===
const sessions = new Map();
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

// === Вспомогательные функции ===
const SUBJECT_ICONS = {
  "Алгебра": "📐",
  "Геометрия": "📏",
  "Математика": "🔢",
  "Русский": "📝",
  "Литература": "📖",
  "Английский": "🇬🇧",
  "История": "🏛️",
  "Обществознание": "👥",
  "География": "🌍",
  "Биология": "🧬",
  "Физика": "⚡",
  "Химия": "🧪",
  "Информатика": "💻",
  "Физкультура": "🏃",
  "ОБЖ": "🛡️",
  "Музыка": "🎵",
  "ИЗО": "🎨",
  "Технология": "🔧"
};

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

function buildReplyKeyboard(userButtons) {
  if (!userButtons || userButtons.length === 0) {
    userButtons = ["📆 Сегодня", "📅 Завтра", "⚙️ Настройка", "🏠 Меню"];
  }
  const rows = [];
  for (let i = 0; i < userButtons.length; i += 2) {
    rows.push(userButtons.slice(i, i + 2));
  }
  return {
    reply_markup: {
      keyboard: rows,
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
}

// === Функции работы с базой данных ===
async function getUserById(userId) {
  try {
    return await User.findOne({ id: userId.toString() });
  } catch (e) {
    console.error("❌ Ошибка получения пользователя:", e);
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
    console.error("❌ Ошибка сохранения пользователя:", e);
    return null;
  }
}

async function deleteUser(userId) {
  try {
    await User.deleteOne({ id: userId.toString() });
    return true;
  } catch (e) {
    console.error("❌ Ошибка удаления пользователя:", e);
    return false;
  }
}

async function getClassHomework(classKey) {
  try {
    const hw = await Homework.findOne({ classKey });
    return hw ? hw.data : {};
  } catch (e) {
    console.error("❌ Ошибка получения ДЗ:", e);
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
    console.error("❌ Ошибка сохранения ДЗ:", e);
    return false;
  }
}

async function getSchedulePhotoId(classKey) {
  try {
    const hw = await Homework.findOne({ classKey });
    return hw?.schedule_photo_id || null;
  } catch (e) {
    console.error("❌ Ошибка получения расписания:", e);
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
    console.error("❌ Ошибка сохранения расписания:", e);
    return false;
  }
}

async function isAdmin(ctx) {
  const user = await getUserById(ctx.from?.id);
  return user && user.role === "admin";
}

function normalizeText(text) {
  return (text || "").trim().toUpperCase();
}

function truncateText(text, maxLength = 12) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + "...";
}

// === Обработчики сообщений ===
bot.on("message", async (ctx) => {
  const textw = ctx.message?.text?.trim();
  if (!textw) return;

  // Команды
  if (textw === "📆 Сегодня") return showTodayDZ(ctx);
  if (textw === "📅 Завтра") return showTomorrowDZ(ctx);
  if (textw === "📆 Неделя") return showWeekDZ(ctx);
  if (textw === "⏭️ Другая неделя") return showNextWeekDZ(ctx);
  if (textw === "🔍 Выбор дня") return showChoiceDay(ctx);
  if (textw === "📥 Всё ДЗ") return showChoiceDay(ctx);
  if (textw === "📖 Расписание") return viewSchedule(ctx);
  if (textw === "👤 Профиль") return showMe(ctx);
  if (textw === "⚙️ Настройка") return showKeyboardConfig(ctx);
  if (textw === "🏠 Меню") return showMainMenu(ctx);

  const userId = ctx.from?.id;
  if (!userId) return;

  // Загрузка расписания
  if (ctx.session.uploadingSchedule) {
    const user = await getUserById(userId);
    if (!user || user.role !== "admin") {
      delete ctx.session.uploadingSchedule;
      return;
    }
    if (!ctx.message?.photo) {
      await ctx.reply("❌ Отправьте именно фото (не файл и не текст).<i>Совет: сожмите изображение перед отправкой для быстрой загрузки</i>", { parse_mode: "HTML" });
      return;
    }
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const photoId = photo.file_id;
    const classKey = ctx.session.scheduleClass || user.class;
    await setSchedulePhotoId(classKey, photoId);
    delete ctx.session.uploadingSchedule;
    delete ctx.session.scheduleClass;
    await ctx.reply("✅ <b>Расписание успешно обновлено!</b>📅 Теперь ученики вашего класса смогут его просматривать.", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "👁️ Посмотреть расписание", callback_data: "view_schedule" }],
          [{ text: "🏠 В меню", callback_data: "main_menu" }]
        ]
      }
    });
    return;
  }

  // Редактирование ДЗ
  if (ctx.session.editStep) {
    const user = await getUserById(userId);
    if (!user || user.role !== "admin") {
      delete ctx.session.editStep;
      delete ctx.session.editSubject;
      delete ctx.session.editDate;
      return;
    }
    if (ctx.session.editStep === "waiting_subject") {
      if (!ctx.message?.text) {
        await ctx.reply("❌ Отправьте название предмета текстом.<i>Например: Алгебра, Физика, История</i>", { parse_mode: "HTML" });
        return;
      }
      let subject = ctx.message.text.trim();
      subject = subject.charAt(0).toUpperCase() + subject.slice(1).toLowerCase();
      ctx.session.editSubject = subject;
      ctx.session.editStep = "waiting_dz";
      const icon = getSubjectIcon(subject);
      await ctx.reply(`${icon} <b>Предмет: ${subject}</b>📝 Теперь отправьте домашнее задание:• Можно текст• Можно фото с подписью• Можно файл с описанием💡 <i>Старайтесь писать понятно и подробно</i>`, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [[{ text: "↩️ Отмена", callback_data: "edit_confirm_date" }]]
        }
      });
      return;
    }
    if (ctx.session.editStep === "waiting_dz") {
      const { day, month, year } = ctx.session.editDate;
      const dateKey = `${year}-${month}-${day}`;
      const subject = ctx.session.editSubject;
      const classKey = user.class;
      let dzContent = ctx.message.text || ctx.message.caption || "📎 Домашнее задание (файл/фото без описания)";
      const dz = await getClassHomework(classKey);
      if (!dz[dateKey]) dz[dateKey] = {};
      dz[dateKey][subject] = dzContent;
      await saveClassHomework(classKey, dz);
      delete ctx.session.editStep;
      delete ctx.session.editSubject;
      delete ctx.session.editDate;
      const icon = getSubjectIcon(subject);
      await ctx.reply(`✅ <b>ДЗ сохранено!</b>${icon} <b>${subject}</b>📅 Дата: ${day}.${month}.${year}🏫 Класс: ${classKey}📋 Задание:<i>${dzContent}</i>`, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "➕ Добавить ещё предмет", callback_data: "edit_action_add" }],
            [{ text: "📋 Посмотреть ДЗ на эту дату", callback_data: "edit_confirm_date" }],
            [{ text: "🏠 В меню", callback_data: "main_menu" }]
          ]
        }
      });
      return;
    }
  }

  // Команды через текст
  const msg = ctx.message;
  if (!msg || (!msg.text && !msg.caption)) return;
  const text = normalizeText(msg.text || msg.caption);
  const commands = {
    START: ["/START", "НАЧАТЬ", "СТАРТ", "В НАЧАЛО", "ДОБРО ПОЖАЛОВАТЬ"],
    REG: ["/REG", "ЗАРЕГИСТРИРОВАТЬСЯ", "РЕГИСТРАЦИЯ", "РЕГ"],
    MENU: ["/MENU", "МЕНЮ", "ГЛАВНОЕ МЕНЮ", "В МЕНЮ"],
    HELP: ["/HELP", "ПОМОЩЬ", "СПРАВКА", "КОМАНДЫ"],
    ME: ["/ME", "/PROFILE", "Я", "ПРОФИЛЬ"],
    DAY: ["/DAY", "СЕГОДНЯ"],
    NEXT_DAY: ["/NEXT_DAY", "ЗАВТРА"],
    WEEK: ["/WEEKEND", "НЕДЕЛЯ"],
    NEXT_WEEK: ["/NEXT_WEEK", "ДРУГАЯ НЕДЕЛЯ"]
  };

  const adminCommands = {
    EDIT: ["/EDIT", "РЕДАКТИРОВАТЬ", "EDIT"],
    STATS: ["/STATS", "СТАТИСТИКА"]
  };

  if (commands.DAY.some(cmd => text.includes(cmd))) {
    await showTodayDZ(ctx);
    return;
  }
  if (commands.NEXT_DAY.some(cmd => text.includes(cmd))) {
    await showTomorrowDZ(ctx);
    return;
  }
  if (commands.WEEK.some(cmd => text.includes(cmd))) {
    await showWeekDZ(ctx);
    return;
  }
  if (commands.NEXT_WEEK.some(cmd => text.includes(cmd))) {
    await showNextWeekDZ(ctx);
    return;
  }
  if (adminCommands.EDIT.some(cmd => text.includes(cmd))) {
    if (!(await isAdmin(ctx))) {
      await ctx.reply("🚫 <b>Доступ запрещён</b>Эта команда доступна только администраторам класса.", { parse_mode: "HTML" });
      return;
    }
    await showEditPanel(ctx);
    return;
  }
  if (adminCommands.STATS.some(cmd => text.includes(cmd))) {
    if (!(await isAdmin(ctx))) {
      await ctx.reply("🚫 <b>Доступ запрещён</b>Эта команда доступна только администраторам.", { parse_mode: "HTML" });
      return;
    }
    await showAdminStats(ctx);
    return;
  }

  if (commands.START.some(cmd => text.includes(cmd))) {
    await showStart(ctx);
  } else if (commands.REG.some(cmd => text.includes(cmd))) {
    await showRegStep1(ctx);
  } else if (commands.MENU.some(cmd => text.includes(cmd))) {
    await showMainMenu(ctx);
  } else if (commands.HELP.some(cmd => text.includes(cmd))) {
    await showHelp(ctx);
  } else if (commands.ME.some(cmd => text.includes(cmd))) {
    await showMe(ctx);
  }
});

// === Обработчики кнопок ===
bot.start((ctx) => showStart(ctx));

async function showStart(ctx) {
  const userId = ctx.from?.id;
  const user = await getUserById(userId);
  const firstName = ctx.from?.first_name || "друг";
  let msg;
  if (user) {
    msg = `👋 <b>С возвращением, ${firstName}!</b>` +
      `🎓 Ваш класс: <b>${user.class}</b>` +
      `📚 Роль: ${user.role === "admin" ? "🎓 Админ" : "🎒 Ученик"}` +
      `<i>Выберите действие ниже или используйте клавиатуру для быстрого доступа к домашнему заданию.</i>`;
  } else {
    msg = `👋 <b>Добро пожаловать, ${firstName}!</b>` +
      `📚 Я — <b>бот для домашних заданий</b>, который поможет тебе:` +
      `✅ Смотреть ДЗ на сегодня и завтра` +
      `✅ Просматривать задания на неделю вперёд` +
      `✅ Получать расписание уроков` +
      `✅ Быстро находить нужную информацию` +
      `🚀 <b>Для начала работы зарегистрируйся!</b>`;
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
    await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
  }
}

async function showMe(ctx) {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.reply("❌ Не удалось определить ваш ID.");
    return;
  }
  const user = await getUserById(userId);
  if (!user) {
    await ctx.reply("🚫 <b>Вы не зарегистрированы</b>Используйте кнопку ниже для регистрации.", {
      parse_mode: "HTML",
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
  const lastActive = user.stats?.last_active? new Date(user.stats.last_active).toLocaleDateString("ru-RU"): "—";
  const profileText = `${roleEmoji} <b>(Ваш профиль)</b>👤 <b>Имя:</b> ${fullName}💬 <b>Юзернейм:</b> ${username}🎭 <b>Роль:</b> ${roleText}🏫 <b>Класс:</b> ${user.class}📊 <b>Статистика:</b>├ 📖 Просмотров ДЗ: ${hwViews}└ 🕐 Последняя активность: ${lastActive}📅 <b>Дата регистрации:</b> ${regDate}`.trim();
  const buttons = [
    [{ text: "🔔 Уведомления: " + (user.notifications_enabled !== false ? "✅ Вкл" : "❌ Выкл"), callback_data: "toggle_notifications" }]
  ];
  if (user.role !== "admin") {
    buttons.push([{ text: "🎓 Стать админом", callback_data: "request_admin" }]);
  }
  buttons.push([{ text: "⚙️ Настроить клавиатуру", callback_data: "cmd_configure" }]);
  buttons.push([{ text: "🏠 В меню", callback_data: "main_menu" }]);
  buttons.push([{ text: "🗑️ Удалить профиль", callback_data: "confirm_delete_profile" }]);
  const keyboard = { reply_markup: { inline_keyboard: buttons } };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(profileText, { parse_mode: "HTML", ...keyboard });
  } else {
    await ctx.reply(profileText, { parse_mode: "HTML", ...keyboard });
  }
}

async function showRegStep1(ctx) {
  const userId = ctx.from?.id;
  const user = await getUserById(userId);
  if (user) {
    const msg = `✅ <b>Вы уже зарегистрированы!</b>🏫 Ваш класс: <b>${user.class}</b>🎭 Роль: ${user.role === "admin" ? "🎓 Админ" : "🎒 Ученик"}`;
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
      await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
    } else {
      await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
    }
    return;
  }
  const msg = `📋 <b>Регистрация</b>` +
    `┌ Шаг 1 из 4: <b>Начало</b>` +
    `├ Шаг 2: Выбор роли` +
    `├ Шаг 3: Выбор класса` +
    `└ Шаг 4: Подтверждение` +
    `⏱️ Это займёт меньше минуты!` +
    `<i>👇 Нажмите «Продолжить» чтобы начать</i>`;
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🚀 Продолжить", callback_data: "continue_reg" }],
        [{ text: "❓ Подробнее о боте", callback_data: "help_and_command" }],
        [{ text: "❌ Отмена", callback_data: "start_bot" }]
      ]
    }
  };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
  }
}

async function showMainMenu(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  const isAdminUser = user?.role === "admin";
  const msg = `🏠 <b>Главное меню</b>` +
    (user? `👋 Привет, <b>${user.first_name || "друг"}</b>!🏫 Класс: <b>${user.class}</b><i>Выберите действие:</i>`: `<i>Вы не зарегистрированы. Зарегистрируйтесь для доступа ко всем функциям.</i>`);
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
  baseButtons.push([{ text: "⌨️ Открыть клавиатуру", callback_data: "show_reply_keyboard" }]);
  if (!user) {
    baseButtons.push([{ text: "📝 Зарегистрироваться", callback_data: "reg_step1" }]);
  }
  const keyboard = { reply_markup: { inline_keyboard: baseButtons } };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    const callbackMsg = ctx.callbackQuery.message;
    if (callbackMsg?.text) {
      await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
    } else {
      try { await ctx.deleteMessage(); } catch {}
      await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
    }
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
  }
}

async function showHelp(ctx) {
  const msg = `❓ <b>Помощь и команды</b>` +
    `📚 <b>Основные команды:</b>` +
    `• /start — Начать работу с ботом` +
    `• /reg — Зарегистрироваться` +
    `• /menu — Главное меню` +
    `• /me — Мой профиль` +
    `• /help — Эта справка` +
    `📆 <b>Просмотр ДЗ:</b>` +
    `• /day — ДЗ на сегодня` +
    `• /next_day — ДЗ на завтра` +
    `• /weekend — ДЗ на неделю` +
    `🎓 <b>Для админов:</b>` +
    `• /edit — Редактировать ДЗ` +
    `• /stats — Статистика класса` +
    `<i>Используйте кнопки клавиатуры для быстрого доступа!</i>`;
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
  }
}

async function showTodayDZ(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  if (!user) {
    await ctx.reply("🚫 Сначала зарегистрируйтесь: /reg");
    return;
  }
  const today = new Date().toISOString().split("T")[0];
  const dz = await getClassHomework(user.class);
  const todayDZ = dz[today];
  let msg;
  if (!todayDZ || Object.keys(todayDZ).length === 0) {
    msg = `📆 <b>ДЗ на сегодня (${formatDate(today)})</b>` +
      `🎉 <i>На сегодня заданий нет!</i>` +
      `🏫 Класс: <b>${user.class}</b>`;
  } else {
    msg = `📆 <b>ДЗ на сегодня (${formatDate(today)})</b>` +
      `🏫 Класс: <b>${user.class}</b>`;
    for (const [subject, task] of Object.entries(todayDZ)) {
      const icon = getSubjectIcon(subject);
      msg += `${icon} <b>${subject}</b><i>${task}</i>`;
    }
  }
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📅 Завтра", callback_data: "cmd_next_day" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
  }
}

async function showTomorrowDZ(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  if (!user) {
    await ctx.reply("🚫 Сначала зарегистрируйтесь: /reg");
    return;
  }
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const dz = await getClassHomework(user.class);
  const tomorrowDZ = dz[tomorrowStr];
  let msg;
  if (!tomorrowDZ || Object.keys(tomorrowDZ).length === 0) {
    msg = `📅 <b>ДЗ на завтра (${formatDate(tomorrowStr)})</b>` +
      `🎉 <i>На завтра заданий нет!</i>` +
      `🏫 Класс: <b>${user.class}</b>`;
  } else {
    msg = `📅 <b>ДЗ на завтра (${formatDate(tomorrowStr)})</b>` +
      `🏫 Класс: <b>${user.class}</b>`;
    for (const [subject, task] of Object.entries(tomorrowDZ)) {
      const icon = getSubjectIcon(subject);
      msg += `${icon} <b>${subject}</b><i>${task}</i>`;
    }
  }
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📆 Сегодня", callback_data: "cmd_day" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
  }
}

async function showWeekDZ(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  if (!user) {
    await ctx.reply("🚫 Сначала зарегистрируйтесь: /reg");
    return;
  }
  const dates = getDatesRange(7);
  const dz = await getClassHomework(user.class);
  let msg = `📆 <b>ДЗ на неделю</b>🏫 Класс: <b>${user.class}</b>`;
  let hasAnyDZ = false;
  for (const dateStr of dates) {
    const dayDZ = dz[dateStr];
    if (dayDZ && Object.keys(dayDZ).length > 0) {
      hasAnyDZ = true;
      msg += `📅 <b>${formatDate(dateStr)}</b>`;
      for (const [subject, task] of Object.entries(dayDZ)) {
        const icon = getSubjectIcon(subject);
        msg += `  ${icon} ${subject}: <i>${truncateText(task, 50)}</i>`;
      }
      msg += "";
    }
  }
  if (!hasAnyDZ) {
    msg += `🎉 <i>На эту неделю заданий нет!</i>`;
  }
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "⏭️ Следующая неделя", callback_data: "cmd_next_week" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
  }
}

async function showNextWeekDZ(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  if (!user) {
    await ctx.reply("🚫 Сначала зарегистрируйтесь: /reg");
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
  let msg = `⏭️ <b>ДЗ на следующую неделю</b>🏫 Класс: <b>${user.class}</b>`;
  let hasAnyDZ = false;
  for (const dateStr of dates) {
    const dayDZ = dz[dateStr];
    if (dayDZ && Object.keys(dayDZ).length > 0) {
      hasAnyDZ = true;
      msg += `📅 <b>${formatDate(dateStr)}</b>`;
      for (const [subject, task] of Object.entries(dayDZ)) {
        const icon = getSubjectIcon(subject);
        msg += `  ${icon} ${subject}: <i>${truncateText(task, 50)}</i>`;
      }
      msg += "";
    }
  }
  if (!hasAnyDZ) {
    msg += `🎉 <i>На следующую неделю заданий нет!</i>`;
  }
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📆 Эта неделя", callback_data: "cmd_week" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
  }
}

async function showChoiceDay(ctx) {
  const dates = getDatesRange(14);
  const buttons = [];
  for (let i = 0; i < dates.length; i += 2) {
    const row = [];
    for (let j = i; j < i + 2 && j < dates.length; j++) {
      const d = new Date(dates[j]);
      const label = `${d.getDate()}.${(d.getMonth() + 1).toString().padStart(2, "0")}`;
      row.push({ text: label, callback_data: `show_day_${dates[j]}` });
    }
    buttons.push(row);
  }
  buttons.push([{ text: "🏠 В меню", callback_data: "main_menu" }]);
  const msg = `🔍 <b>Выберите дату</b><i>Нажмите на дату, чтобы посмотреть ДЗ:</i>`;
  const keyboard = { reply_markup: { inline_keyboard: buttons } };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
  }
}

async function viewSchedule(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  if (!user) {
    await ctx.reply("🚫 Сначала зарегистрируйтесь: /reg");
    return;
  }
  const photoId = await getSchedulePhotoId(user.class);
  if (!photoId) {
    const msg = `📖 <b>Расписание уроков</b>` +
      `🏫 Класс: <b>${user.class}</b>` +
      `❌ <i>Расписание ещё не загружено.</i>`;
    const buttons = [];
    if (user.role === "admin") {
      buttons.push([{ text: "📤 Загрузить расписание", callback_data: "upload_schedule" }]);
    }
    buttons.push([{ text: "🏠 В меню", callback_data: "main_menu" }]);
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
    } else {
      await ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
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
  await ctx.replyWithPhoto(photoId, {
    caption: `📖 <b>Расписание уроков</b>🏫 Класс: <b>${user.class}</b>`,
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons }
  });
}

async function showKeyboardConfig(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  if (!user) {
    await ctx.reply("🚫 Сначала зарегистрируйтесь: /reg");
    return;
  }
  const allButtons = ["📆 Сегодня", "📅 Завтра", "📆 Неделя", "⏭️ Другая неделя", "🔍 Выбор дня", "📥 Всё ДЗ", "📖 Расписание", "👤 Профиль", "⚙️ Настройка", "🏠 Меню"];
  const currentButtons = user.custom_keyboard || [];
  const buttons = allButtons.map(btn => {
    const isSelected = currentButtons.includes(btn);
    return [{ text: `${isSelected ? "✅" : "⬜"} ${btn}`, callback_data: `toggle_kb_${btn}` }];
  });
  buttons.push([{ text: "💾 Сохранить", callback_data: "save_keyboard" }]);
  buttons.push([{ text: "🏠 В меню", callback_data: "main_menu" }]);
  const msg = `⚙️ <b>Настройка клавиатуры</b>` +
    `Выберите кнопки, которые хотите видеть на клавиатуре.` +
    `Отмеченные ✅ будут отображаться.`;
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
  }
}

async function showEditPanel(ctx) {
  const msg = `✏️ <b>Панель редактирования ДЗ</b>` +
    `Выберите дату, чтобы изменить домашнее задание для вашего класса.` +
    `Вы сможете:` +
    `• Добавить новое задание` +
    `• Удалить существующее` +
    `⚠️ Все изменения применяются мгновенно.`;
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "▶️ Продолжить", callback_data: "edit_step_day" }],
        [{ text: "ℹ️ Об этой панели", callback_data: "edit_help" }, { text: "↩️ Назад", callback_data: "main_menu" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
  }
}

async function showAdminStats(ctx) {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  if (!user || user.role !== "admin") {
    await ctx.reply("🚫 Эта функция доступна только админам.");
    return;
  }
  const classUsers = await User.find({ class: user.class });
  const totalUsers = classUsers.length;
  const admins = classUsers.filter(u => u.role === "admin").length;
  const activeToday = classUsers.filter(u => {
    if (!u.stats?.last_active) return false;
    const lastActive = new Date(u.stats.last_active);
    const today = new Date();
    return lastActive.toDateString() === today.toDateString();
  }).length;
  const msg = `📊 <b>Статистика класса ${user.class}</b>` +
    `👥 Всего пользователей: <b>${totalUsers}</b>` +
    `👑 Админов: <b>${admins}</b>` +
    `🟢 Активны сегодня: <b>${activeToday}</b>`;
  const keyboard = {
    reply_markup: {
      inline_keyboard: [[{ text: "🏠 В меню", callback_data: "main_menu" }]]
    }
  };
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
  }
}

// === Кнопка "Загрузить расписание" — исправлена! ===
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
    `📤 <b>Загрузка расписания</b>` +
    `📷 Отправьте фото расписания.` +
    `💡 <i>Совет: сожмите изображение для быстрой загрузки.</i>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Отмена", callback_data: "main_menu" }]]
      }
    }
  );
});

// === Кнопка "Редактировать ДЗ" — исправлена! ===
bot.action("edit_dz_panel", async (ctx) => {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  if (!user || user.role !== "admin") {
    await ctx.answerCbQuery("❌ Только админы могут редактировать ДЗ");
    return;
  }
  ctx.session.editStep = "waiting_subject";
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `✏️ <b>Редактирование ДЗ</b>` +
    `Отправьте название предмета текстом.` +
    `💡 <i>Например: Алгебра, Физика, История</i>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "↩️ Отмена", callback_data: "main_menu" }]]
      }
    }
  );
});

// === Запуск бота ===
async function startBot() {
  console.log("🚀 Запуск бота...");
  await connectDB();
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Web server запущен на порту ${PORT}`);
  });
  bot.launch()
    .then(() => console.log("✅ Бот успешно запущен!"))
    .catch((err) => console.error("❌ Ошибка запуска бота:", err));
}

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
startBot();