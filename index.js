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
      await ctx.reply("❌ Отправьте именно фото (не файл и не текст).\nСовет: сожмите изображение перед отправкой для быстрой загрузки.", { parse_mode: "HTML" });
      return;
    }
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const photoId = photo.file_id;
    const classKey = ctx.session.scheduleClass || user.class;
    await setSchedulePhotoId(classKey, photoId);
    delete ctx.session.uploadingSchedule;
    delete ctx.session.scheduleClass;
    await ctx.reply("✅ Расписание успешно обновлено!\nТеперь ученики вашего класса смогут его просматривать.", {
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
        await ctx.reply("❌ Отправьте название предмета текстом.\nНапример: Алгебра, Физика, История", { parse_mode: "HTML" });
        return;
      }
      let subject = ctx.message.text.trim();
      subject = subject.charAt(0).toUpperCase() + subject.slice(1).toLowerCase();
      ctx.session.editSubject = subject;
      ctx.session.editStep = "waiting_dz";
      const icon = getSubjectIcon(subject);
      await ctx.reply(`${icon} Предмет: ${subject}\nТеперь отправьте домашнее задание:\n• Можно текст\n• Можно фото с подписью\n• Можно файл с описанием\nСовет: старайтесь писать понятно и подробно`, {
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
      let dzContent = ctx.message.text || ctx.message.caption || "Домашнее задание (файл/фото без описания)";
      const dz = await getClassHomework(classKey);
      if (!dz[dateKey]) dz[dateKey] = {};
      dz[dateKey][subject] = dzContent;
      await saveClassHomework(classKey, dz);
      delete ctx.session.editStep;
      delete ctx.session.editSubject;
      delete ctx.session.editDate;
      const icon = getSubjectIcon(subject);
      await ctx.reply(`✅ ДЗ сохранено!\n${icon} ${subject}\nДата: ${day}.${month}.${year}\nКласс: ${classKey}\nЗадание:\n${dzContent}`, {
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
      await ctx.reply("🚫 Доступ запрещён\nЭта команда доступна только администраторам класса.", { parse_mode: "HTML" });
      return;
    }
    await showEditPanel(ctx);
    return;
  }
  if (adminCommands.STATS.some(cmd => text.includes(cmd))) {
    if (!(await isAdmin(ctx))) {
      await ctx.reply("🚫 Доступ запрещён\nЭта команда доступна только администраторам.", { parse_mode: "HTML" });
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
    msg = `👋 С возвращением, ${firstName}!\n🎓 Ваш класс: ${user.class}\n📚 Роль: ${user.role === "admin" ? "🎓 Админ" : "🎒 Ученик"}\nВыберите действие ниже или используйте клавиатуру для быстрого доступа к домашнему заданию.`;
  } else {
    msg = `👋 Добро пожаловать, ${firstName}!\n📚 Я — бот для домашних заданий, который поможет тебе:\n✅ Смотреть ДЗ на сегодня и завтра\n✅ Просматривать задания на неделю вперёд\n✅ Получать расписание уроков\n✅ Быстро находить нужную информацию\n🚀 Для начала работы зарегистрируйся!`;
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
    await ctx.reply("🚫 Вы не зарегистрированы\nИспользуйте кнопку ниже для регистрации.", {
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
  const lastActive = user.stats?.last_active
    ? new Date(user.stats.last_active).toLocaleDateString("ru-RU")
    : "—";
  const profileText = `${roleEmoji} (Ваш профиль)\n👤 Имя: ${fullName}\n💬 Юзернейм: ${username}\n🎭 Роль: ${roleText}\n🏫 Класс: ${user.class}\n📊 Статистика:\n├ 📖 Просмотров ДЗ: ${hwViews}\n└ 🕐 Последняя активность: ${lastActive}\n📅 Дата регистрации: ${regDate}`;
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
    const msg = `✅ Вы уже зарегистрированы!\n🏫 Ваш класс: ${user.class}\n🎭 Роль: ${user.role === "admin" ? "🎓 Админ" : "🎒 Ученик"}`;
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
  const msg = `📋 Регистрация\n┌ Шаг 1 из 4: Начало\n├ Шаг 2: Выбор роли\n├ Шаг 3: Выбор класса\n└ Шаг 4: Подтверждение\n⏱️ Это займёт меньше минуты!\n👇 Нажмите «Продолжить» чтобы начать`;
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
  const msg = `🏠 Главное меню\n${user ? `👋 Привет, ${user.first_name || "друг"}!\n🏫 Класс: ${user.class}\nВыберите действие:` : `Вы не зарегистрированы. Зарегистрируйтесь для доступа ко всем функциям.`}`;
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
  const msg = `❓ Помощь и команды\n📚 Основные команды:\n• /start — Начать работу с ботом\n• /reg — Зарегистрироваться\n• /menu — Главное меню\n• /me — Мой профиль\n• /help — Эта справка\n📆 Просмотр ДЗ:\n• /day — ДЗ на сегодня\n• /next_day — ДЗ на завтра\n• /weekend — ДЗ на неделю\n🎓 Для админов:\n• /edit — Редактировать ДЗ\n• /stats — Статистика класса\nИспользуйте кнопки клавиатуры для быстрого доступа!`;
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
    msg = `📅 ДЗ на сегодня (${formatDate(today)})\n🎉 На сегодня заданий нет!\n🏫 Класс: ${user.class}`;
  } else {
    msg = `📅 ДЗ на сегодня (${formatDate(today)})\n🏫 Класс: ${user.class}\n`;
    for (const [subject, task] of Object.entries(todayDZ)) {
      const icon = getSubjectIcon(subject);
      msg += `${icon} ${subject}\n${task}\n`;
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
    msg = `📅 ДЗ на завтра (${formatDate(tomorrowStr)})\n🎉 На завтра заданий нет!\n🏫 Класс: ${user.class}`;
  } else {
    msg = `📅 ДЗ на завтра (${formatDate(tomorrowStr)})\n🏫 Класс: ${user.class}\n`;
    for (const [subject, task] of Object.entries(tomorrowDZ)) {
      const icon = getSubjectIcon(subject);
      msg += `${icon} ${subject}\n${task}\n`;
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
  let msg = `📆 ДЗ на неделю\n🏫 Класс: ${user.class}\n`;
  let hasAnyDZ = false;
  for (const dateStr of dates) {
    const dayDZ = dz[dateStr];
    if (dayDZ && Object.keys(dayDZ).length > 0) {
      hasAnyDZ = true;
      msg += `📅 ${formatDate(dateStr)}\n`;
      for (const [subject, task] of Object.entries(dayDZ)) {
        const icon = getSubjectIcon(subject);
        msg += `  ${icon} ${subject}: ${truncateText(task, 50)}\n`;
      }
      msg += "\n";
    }
  }
  if (!hasAnyDZ) {
    msg += `🎉 На эту неделю заданий нет!`;
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
  let msg = `⏭️ ДЗ на следующую неделю\n🏫 Класс: ${user.class}\n`;
  let hasAnyDZ = false;
  for (const dateStr of dates) {
    const dayDZ = dz[dateStr];
    if (dayDZ && Object.keys(dayDZ).length > 0) {
      hasAnyDZ = true;
      msg += `📅 ${formatDate(dateStr)}\n`;
      for (const [subject, task] of Object.entries(dayDZ)) {
        const icon = getSubjectIcon(subject);
        msg += `  ${icon} ${subject}: ${truncateText(task, 50)}\n`;
      }
      msg += "\n";
    }
  }
  if (!hasAnyDZ) {
    msg += `🎉 На следующую неделю заданий нет!`;
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
  const msg = `🔍 Выберите дату\nНажмите на дату, чтобы посмотреть ДЗ:`;
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
    const msg = `📖 Расписание уроков\n🏫 Класс: ${user.class}\n❌ Расписание ещё не загружено.`;
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
    caption: `📖 Расписание уроков\nКласс: ${user.class}`,
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
  const msg = `⚙️ Настройка клавиатуры\nВыберите кнопки, которые хотите видеть на клавиатуре.\nОтмеченные ✅ будут отображаться.`;
  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
  }
}

async function showEditPanel(ctx) {
  const msg = `✏️ Панель редактирования ДЗ\nВыберите дату, чтобы изменить домашнее задание для вашего класса.\nВы сможете:\n• Добавить новое задание\n• Удалить существующее\n⚠️ Все изменения применяются мгновенно.`;
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
  const msg = `📊 Статистика класса ${user.class}\n👥 Всего пользователей: ${totalUsers}\n👑 Админов: ${admins}\n🟢 Активны сегодня: ${activeToday}`;
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
    `📤 Загрузка расписания\n📷 Отправьте фото расписания.\nСовет: сожмите изображение для быстрой загрузки.`,
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
    `✏️ Редактирование ДЗ\nОтправьте название предмета текстом.\nНапример: Алгебра, Физика, История`,
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