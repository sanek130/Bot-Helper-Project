import 'dotenv/config';
import { Telegraf } from "telegraf";
import { config } from "./config.js";
import mongoose from "mongoose";
import { User } from "./models/User.js";
import { Homework } from "./models/Homework.js";
import express from "express";

const app = express();
const PORT = process.env.PORT || 5000;

app.get("/", (req, res) => {
  res.status(200).send("🤖 Telegram Homework Bot is running!");
});

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

const bot = new Telegraf(config.telegramToken);

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

function getDefaultKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        ["📆 Сегодня", "📅 Завтра"],
        ["📆 Неделя", "⏭️ Другая неделя"],
        ["🔍 Выбор дня", "📥 Всё ДЗ"],
        ["👤 Профиль", "⚙️ Настройка"],
        ["🏠 Меню"]
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
}

async function getUserById(userId) {
  try {
    const user = await User.findOne({ id: userId.toString() });
    return user;
  } catch (e) {
    console.error("❌ Ошибка получения пользователя:", e);
    return null;
  }
}

async function saveUser(userData) {
  try {
    const user = await User.findOneAndUpdate(
      { id: userData.id.toString() },
      userData,
      { upsert: true, new: true }
    );
    return user;
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

async function getAllUsers() {
  try {
    return await User.find({});
  } catch (e) {
    console.error("❌ Ошибка получения пользователей:", e);
    return [];
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

function getWeekLabel(targetDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(targetDate);
  const diffDays = Math.floor((target - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "📆 в прошлом";
  if (diffDays === 0) return "🔵 сегодня";
  if (diffDays === 1) return "🟢 завтра";
  if (diffDays <= 6) return "📅 эта неделя";
  if (diffDays <= 13) return "📅 следующая неделя";
  if (diffDays <= 27) return "📅 через 2–3 недели";
  return "📅 позже";
}

function formatDate(dateStr) {
  const date = new Date(dateStr);
  const days = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  const day = date.getDate().toString().padStart(2, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  return `${days[date.getDay()]}, ${day}.${month}`;
}

async function updateUserStats(userId) {
  try {
    await User.findOneAndUpdate(
      { id: userId.toString() },
      {
        $inc: { "stats.homework_views": 1 },
        $set: { "stats.last_active": new Date() }
      }
    );
  } catch (e) {
    console.error("❌ Ошибка обновления статистики:", e);
  }
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

bot.on("message", async (ctx) => {
  const textw = ctx.message?.text?.trim();
  
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

  if (ctx.session.uploadingSchedule) {
    const user = await getUserById(userId);
    if (!user || user.role !== "admin") {
      delete ctx.session.uploadingSchedule;
      return;
    }

    if (!ctx.message?.photo) {
      await ctx.reply("❌ Отправьте именно фото (не файл и не текст).\n\n💡 <i>Совет: сожмите изображение перед отправкой для быстрой загрузки</i>", { parse_mode: "HTML" });
      return;
    }

    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const photoId = photo.file_id;
    const classKey = ctx.session.scheduleClass || user.class;

    await setSchedulePhotoId(classKey, photoId);

    delete ctx.session.uploadingSchedule;
    delete ctx.session.scheduleClass;

    await ctx.reply("✅ <b>Расписание успешно обновлено!</b>\n\n📅 Теперь ученики вашего класса смогут его просматривать.", {
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
        await ctx.reply("❌ Отправьте название предмета текстом.\n\n💡 <i>Например: Алгебра, Физика, История</i>", { parse_mode: "HTML" });
        return;
      }
      let subject = ctx.message.text.trim();
      subject = subject.charAt(0).toUpperCase() + subject.slice(1).toLowerCase();

      ctx.session.editSubject = subject;
      ctx.session.editStep = "waiting_dz";

      const icon = getSubjectIcon(subject);
      await ctx.reply(`${icon} <b>Предмет: ${subject}</b>\n\n📝 Теперь отправьте домашнее задание:\n\n• Можно текст\n• Можно фото с подписью\n• Можно файл с описанием\n\n💡 <i>Старайтесь писать понятно и подробно</i>`, {
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
      await ctx.reply(`✅ <b>ДЗ сохранено!</b>\n\n${icon} <b>${subject}</b>\n📅 Дата: ${day}.${month}.${year}\n🏫 Класс: ${classKey}\n\n📋 Задание:\n<i>${dzContent}</i>`, {
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

  if (!textw) return;

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

  if (commands.DAY.some((cmd) => text.includes(cmd))) {
    await showTodayDZ(ctx);
    return;
  }

  if (commands.NEXT_DAY.some((cmd) => text.includes(cmd))) {
    await showTomorrowDZ(ctx);
    return;
  }

  if (commands.WEEK.some((cmd) => text.includes(cmd))) {
    await showWeekDZ(ctx);
    return;
  }

  if (commands.NEXT_WEEK.some((cmd) => text.includes(cmd))) {
    await showNextWeekDZ(ctx);
    return;
  }

  if (adminCommands.EDIT.some((cmd) => text.includes(cmd))) {
    if (!(await isAdmin(ctx))) {
      await ctx.reply("🚫 <b>Доступ запрещён</b>\n\nЭта команда доступна только администраторам класса.", { parse_mode: "HTML" });
      return;
    }
    await showEditPanel(ctx);
    return;
  }

  if (adminCommands.STATS.some((cmd) => text.includes(cmd))) {
    if (!(await isAdmin(ctx))) {
      await ctx.reply("🚫 <b>Доступ запрещён</b>\n\nЭта команда доступна только администраторам.", { parse_mode: "HTML" });
      return;
    }
    await showAdminStats(ctx);
    return;
  }

  if (commands.START.some((cmd) => text.includes(cmd))) {
    await showStart(ctx);
  } else if (commands.REG.some((cmd) => text.includes(cmd))) {
    await showRegStep1(ctx);
  } else if (commands.MENU.some((cmd) => text.includes(cmd))) {
    await showMainMenu(ctx);
  } else if (commands.HELP.some((cmd) => text.includes(cmd))) {
    await showHelp(ctx);
  } else if (commands.ME.some((cmd) => text.includes(cmd))) {
    await showMe(ctx);
  }
});

bot.start((ctx) => showStart(ctx));

async function showStart(ctx) {
  const userId = ctx.from?.id;
  const user = await getUserById(userId);
  const firstName = ctx.from?.first_name || "друг";

  let msg;
  if (user) {
    msg = `👋 <b>С возвращением, ${firstName}!</b>\n\n` +
      `🎓 Ваш класс: <b>${user.class}</b>\n` +
      `📚 Роль: ${user.role === "admin" ? "🎓 Админ" : "🎒 Ученик"}\n\n` +
      `<i>Выберите действие ниже или используйте клавиатуру для быстрого доступа к домашнему заданию.</i>`;
  } else {
    msg = `👋 <b>Добро пожаловать, ${firstName}!</b>\n\n` +
      `📚 Я — <b>бот для домашних заданий</b>, который поможет тебе:\n\n` +
      `✅ Смотреть ДЗ на сегодня и завтра\n` +
      `✅ Просматривать задания на неделю вперёд\n` +
      `✅ Получать расписание уроков\n` +
      `✅ Быстро находить нужную информацию\n\n` +
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
    await ctx.reply("🚫 <b>Вы не зарегистрированы</b>\n\nИспользуйте кнопку ниже для регистрации.", {
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

  const profileText = `
${roleEmoji} <b>Ваш профиль</b>

👤 <b>Имя:</b> ${fullName}
💬 <b>Юзернейм:</b> ${username}
🎭 <b>Роль:</b> ${roleText}
🏫 <b>Класс:</b> ${user.class}

📊 <b>Статистика:</b>
├ 📖 Просмотров ДЗ: ${hwViews}
└ 🕐 Последняя активность: ${lastActive}

📅 <b>Дата регистрации:</b> ${regDate}
  `.trim();

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
    const msg = `✅ <b>Вы уже зарегистрированы!</b>\n\n🏫 Ваш класс: <b>${user.class}</b>\n🎭 Роль: ${user.role === "admin" ? "🎓 Админ" : "🎒 Ученик"}`;
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

  const msg = `📋 <b>Регистрация</b>\n\n` +
    `┌ Шаг 1 из 4: <b>Начало</b>\n` +
    `├ Шаг 2: Выбор роли\n` +
    `├ Шаг 3: Выбор класса\n` +
    `└ Шаг 4: Подтверждение\n\n` +
    `⏱️ Это займёт меньше минуты!\n\n` +
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

  const msg = `🏠 <b>Главное меню</b>\n\n` +
    (user
      ? `👋 Привет, <b>${user.first_name || "друг"}</b>!\n🏫 Класс: <b>${user.class}</b>\n\n<i>Выберите действие:</i>`
      : `<i>Вы не зарегистрированы. Зарегистрируйтесь для доступа ко всем функциям.</i>`);

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
      try { await ctx.deleteMessage(); } catch (e) {}
      await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
    }
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
  }
}

async function showHelp(ctx) {
  const msg = `❓ <b>Помощь и команды</b>\n\n` +
    `📚 <b>Основные команды:</b>\n` +
    `• /start — Начать работу с ботом\n` +
    `• /reg — Зарегистрироваться\n` +
    `• /menu — Главное меню\n` +
    `• /me — Мой профиль\n` +
    `• /help — Эта справка\n\n` +
    `📆 <b>Просмотр ДЗ:</b>\n` +
    `• /day — ДЗ на сегодня\n` +
    `• /next_day — ДЗ на завтра\n` +
    `• /weekend — ДЗ на неделю\n\n` +
    `🎓 <b>Для админов:</b>\n` +
    `• /edit — Редактировать ДЗ\n` +
    `• /stats — Статистика класса\n\n` +
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

  await updateUserStats(userId);

  const today = new Date().toISOString().split("T")[0];
  const dz = await getClassHomework(user.class);
  const todayDZ = dz[today];

  let msg;
  if (!todayDZ || Object.keys(todayDZ).length === 0) {
    msg = `📆 <b>ДЗ на сегодня (${formatDate(today)})</b>\n\n` +
      `🎉 <i>На сегодня заданий нет!</i>\n\n` +
      `🏫 Класс: <b>${user.class}</b>`;
  } else {
    msg = `📆 <b>ДЗ на сегодня (${formatDate(today)})</b>\n\n` +
      `🏫 Класс: <b>${user.class}</b>\n\n`;
    for (const [subject, task] of Object.entries(todayDZ)) {
      const icon = getSubjectIcon(subject);
      msg += `${icon} <b>${subject}</b>\n<i>${task}</i>\n\n`;
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

  await updateUserStats(userId);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  
  const dz = await getClassHomework(user.class);
  const tomorrowDZ = dz[tomorrowStr];

  let msg;
  if (!tomorrowDZ || Object.keys(tomorrowDZ).length === 0) {
    msg = `📅 <b>ДЗ на завтра (${formatDate(tomorrowStr)})</b>\n\n` +
      `🎉 <i>На завтра заданий нет!</i>\n\n` +
      `🏫 Класс: <b>${user.class}</b>`;
  } else {
    msg = `📅 <b>ДЗ на завтра (${formatDate(tomorrowStr)})</b>\n\n` +
      `🏫 Класс: <b>${user.class}</b>\n\n`;
    for (const [subject, task] of Object.entries(tomorrowDZ)) {
      const icon = getSubjectIcon(subject);
      msg += `${icon} <b>${subject}</b>\n<i>${task}</i>\n\n`;
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

  await updateUserStats(userId);

  const dates = getDatesRange(7);
  const dz = await getClassHomework(user.class);

  let msg = `📆 <b>ДЗ на неделю</b>\n🏫 Класс: <b>${user.class}</b>\n\n`;

  let hasAnyDZ = false;
  for (const dateStr of dates) {
    const dayDZ = dz[dateStr];
    if (dayDZ && Object.keys(dayDZ).length > 0) {
      hasAnyDZ = true;
      msg += `📅 <b>${formatDate(dateStr)}</b>\n`;
      for (const [subject, task] of Object.entries(dayDZ)) {
        const icon = getSubjectIcon(subject);
        msg += `  ${icon} ${subject}: <i>${truncateText(task, 50)}</i>\n`;
      }
      msg += "\n";
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

  await updateUserStats(userId);

  const start = new Date();
  start.setDate(start.getDate() + 7);
  
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date.toISOString().split("T")[0]);
  }

  const dz = await getClassHomework(user.class);

  let msg = `⏭️ <b>ДЗ на следующую неделю</b>\n🏫 Класс: <b>${user.class}</b>\n\n`;

  let hasAnyDZ = false;
  for (const dateStr of dates) {
    const dayDZ = dz[dateStr];
    if (dayDZ && Object.keys(dayDZ).length > 0) {
      hasAnyDZ = true;
      msg += `📅 <b>${formatDate(dateStr)}</b>\n`;
      for (const [subject, task] of Object.entries(dayDZ)) {
        const icon = getSubjectIcon(subject);
        msg += `  ${icon} ${subject}: <i>${truncateText(task, 50)}</i>\n`;
      }
      msg += "\n";
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

  const msg = `🔍 <b>Выберите дату</b>\n\n<i>Нажмите на дату, чтобы посмотреть ДЗ:</i>`;

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
    const msg = `📖 <b>Расписание уроков</b>\n\n` +
      `🏫 Класс: <b>${user.class}</b>\n\n` +
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
    caption: `📖 <b>Расписание уроков</b>\n🏫 Класс: <b>${user.class}</b>`,
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

  const msg = `⚙️ <b>Настройка клавиатуры</b>\n\n` +
    `Выберите кнопки, которые хотите видеть на клавиатуре.\n` +
    `Отмеченные ✅ будут отображаться.`;

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
  }
}

async function showEditPanel(ctx) {
  const msg = `✏️ <b>Панель редактирования ДЗ</b>\n\n` +
    `Выберите дату, чтобы изменить домашнее задание для вашего класса.\n\n` +
    `Вы сможете:\n` +
    `• Добавить новое задание\n` +
    `• Удалить существующее\n\n` +
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

  const msg = `📊 <b>Статистика класса ${user.class}</b>\n\n` +
    `👥 Всего пользователей: <b>${totalUsers}</b>\n` +
    `👑 Админов: <b>${admins}</b>\n` +
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

async function sendAdminRequest(ctx, user) {
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Неизвестный";
  const username = user.username ? `@${user.username}` : "не указан";

  const msg = `🔔 <b>Запрос на роль админа</b>\n\n` +
    `👤 Пользователь: <b>${fullName}</b>\n` +
    `💬 Юзернейм: ${username}\n` +
    `🏫 Класс: <b>${user.class}</b>\n` +
    `🆔 ID: <code>${user.id}</code>\n\n` +
    `Выберите действие:`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "✅ Одобрить", callback_data: `approve_admin_${user.id}` },
          { text: "❌ Отклонить", callback_data: `reject_admin_${user.id}` }
        ]
      ]
    }
  };

  for (const adminChatId of config.adminChatIds) {
    try {
      await bot.telegram.sendMessage(adminChatId, msg, { parse_mode: "HTML", ...keyboard });
    } catch (e) {
      console.error(`❌ Не удалось отправить запрос админу ${adminChatId}:`, e.message);
    }
  }
}

bot.action("request_admin", async (ctx) => {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);

  if (!user) {
    await ctx.answerCbQuery("❌ Вы не зарегистрированы");
    return;
  }

  if (user.role === "admin") {
    await ctx.answerCbQuery("✅ Вы уже админ!");
    return;
  }

  await sendAdminRequest(ctx, user);
  await ctx.answerCbQuery("✅ Запрос отправлен модераторам!");

  await ctx.editMessageText(
    `📨 <b>Запрос отправлен!</b>\n\n` +
    `Ваш запрос на получение роли администратора отправлен модераторам.\n` +
    `Ожидайте ответа.`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "🏠 В меню", callback_data: "main_menu" }]]
      }
    }
  );
});

bot.action(/approve_admin_(.+)/, async (ctx) => {
  const targetUserId = ctx.match[1];
  const adminId = ctx.from?.id.toString();

  if (!config.adminChatIds.includes(ctx.from?.id)) {
    await ctx.answerCbQuery("❌ У вас нет прав");
    return;
  }

  const targetUser = await getUserById(targetUserId);
  if (!targetUser) {
    await ctx.answerCbQuery("❌ Пользователь не найден");
    return;
  }

  await User.findOneAndUpdate(
    { id: targetUserId },
    { role: "admin" }
  );

  await ctx.answerCbQuery("✅ Пользователь назначен админом!");
  await ctx.editMessageText(
    `✅ <b>Запрос одобрен</b>\n\n` +
    `Пользователь <b>${targetUser.first_name}</b> теперь админ класса ${targetUser.class}.`,
    { parse_mode: "HTML" }
  );

  try {
    await bot.telegram.sendMessage(
      targetUserId,
      `🎉 <b>Поздравляем!</b>\n\nВаш запрос на роль администратора одобрен!\nТеперь вы можете редактировать ДЗ и загружать расписание.`,
      { parse_mode: "HTML" }
    );
  } catch (e) {
    console.error("Не удалось уведомить пользователя:", e.message);
  }
});

bot.action(/reject_admin_(.+)/, async (ctx) => {
  const targetUserId = ctx.match[1];

  if (!config.adminChatIds.includes(ctx.from?.id)) {
    await ctx.answerCbQuery("❌ У вас нет прав");
    return;
  }

  const targetUser = await getUserById(targetUserId);
  
  await ctx.answerCbQuery("❌ Запрос отклонён");
  await ctx.editMessageText(
    `❌ <b>Запрос отклонён</b>\n\n` +
    `Запрос пользователя <b>${targetUser?.first_name || "Неизвестный"}</b> отклонён.`,
    { parse_mode: "HTML" }
  );

  if (targetUser) {
    try {
      await bot.telegram.sendMessage(
        targetUserId,
        `❌ <b>Запрос отклонён</b>\n\nК сожалению, ваш запрос на роль администратора был отклонён.`,
        { parse_mode: "HTML" }
      );
    } catch (e) {
      console.error("Не удалось уведомить пользователя:", e.message);
    }
  }
});

bot.action(/toggle_kb_(.+)/, async (ctx) => {
  const btn = ctx.match[1];
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user) return;

  let list = user.custom_keyboard || [];
  if (list.includes(btn)) {
    list = list.filter(c => c !== btn);
  } else {
    list.push(btn);
  }

  await User.findOneAndUpdate(
    { id: userId },
    { custom_keyboard: list }
  );

  await showKeyboardConfig(ctx);
});

bot.action("save_keyboard", async (ctx) => {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  await ctx.answerCbQuery("✅ Клавиатура сохранена!");
  
  if (user) {
    await ctx.reply("⌨️ Ваша клавиатура обновлена!", buildReplyKeyboard(user.custom_keyboard));
  }
});

bot.action("show_reply_keyboard", async (ctx) => {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  await ctx.answerCbQuery();
  await ctx.reply("⌨️ Клавиатура активирована!", buildReplyKeyboard(user?.custom_keyboard));
});

bot.action("toggle_notifications", async (ctx) => {
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);
  
  if (!user) return;

  const newState = user.notifications_enabled === false ? true : false;
  await User.findOneAndUpdate(
    { id: userId },
    { notifications_enabled: newState }
  );

  await ctx.answerCbQuery(newState ? "🔔 Уведомления включены" : "🔕 Уведомления выключены");
  await showMe(ctx);
});

bot.action("main_menu", (ctx) => showMainMenu(ctx));
bot.action("start_bot", (ctx) => showStart(ctx));
bot.action("show_profile", (ctx) => showMe(ctx));
bot.action("reg_step1", (ctx) => showRegStep1(ctx));
bot.action("help_and_command", (ctx) => showHelp(ctx));
bot.action("cmd_day", (ctx) => showTodayDZ(ctx));
bot.action("cmd_next_day", (ctx) => showTomorrowDZ(ctx));
bot.action("cmd_week", (ctx) => showWeekDZ(ctx));
bot.action("cmd_next_week", (ctx) => showNextWeekDZ(ctx));
bot.action("cmd_choice", (ctx) => showChoiceDay(ctx));
bot.action("cmd_all", (ctx) => showChoiceDay(ctx));
bot.action("cmd_configure", (ctx) => showKeyboardConfig(ctx));
bot.action("view_schedule", (ctx) => viewSchedule(ctx));
bot.action("edit_dz_panel", (ctx) => showEditPanel(ctx));
bot.action("admin_stats", (ctx) => showAdminStats(ctx));

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
    `📤 <b>Загрузка расписания</b>\n\n` +
    `🏫 Класс: <b>${user.class}</b>\n\n` +
    `📷 Отправьте фото расписания.\n` +
    `<i>Совет: сожмите изображение для быстрой загрузки.</i>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "❌ Отмена", callback_data: "main_menu" }]]
      }
    }
  );
});

bot.action(/show_day_(.+)/, async (ctx) => {
  const dateStr = ctx.match[1];
  const userId = ctx.from?.id.toString();
  const user = await getUserById(userId);

  if (!user) {
    await ctx.answerCbQuery("❌ Сначала зарегистрируйтесь");
    return;
  }

  await updateUserStats(userId);

  const dz = await getClassHomework(user.class);
  const dayDZ = dz[dateStr];

  let msg;
  if (!dayDZ || Object.keys(dayDZ).length === 0) {
    msg = `📅 <b>ДЗ на ${formatDate(dateStr)}</b>\n\n` +
      `🎉 <i>На этот день заданий нет!</i>\n\n` +
      `🏫 Класс: <b>${user.class}</b>`;
  } else {
    msg = `📅 <b>ДЗ на ${formatDate(dateStr)}</b>\n\n` +
      `🏫 Класс: <b>${user.class}</b>\n\n`;
    for (const [subject, task] of Object.entries(dayDZ)) {
      const icon = getSubjectIcon(subject);
      msg += `${icon} <b>${subject}</b>\n<i>${task}</i>\n\n`;
    }
  }

  await ctx.answerCbQuery();
  await ctx.editMessageText(msg, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔍 Другой день", callback_data: "cmd_choice" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  });
});

bot.action("continue_reg", async (ctx) => {
  const msg = `📋 <b>Шаг 2: Выбор роли</b>\n\n` +
    `Выберите вашу роль:\n\n` +
    `🎒 <b>Ученик</b> — просмотр ДЗ и расписания\n` +
    `🎓 <b>Админ</b> — редактирование ДЗ и загрузка расписания\n\n` +
    `<i>Роль админа требует подтверждения модератором.</i>`;

  await ctx.answerCbQuery();
  await ctx.editMessageText(msg, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "🎒 Ученик", callback_data: "reg_role_user" }],
        [{ text: "🎓 Админ (требует подтверждения)", callback_data: "reg_role_admin" }],
        [{ text: "↩️ Назад", callback_data: "reg_step1" }]
      ]
    }
  });
});

bot.action(/reg_role_(.+)/, async (ctx) => {
  const role = ctx.match[1];
  ctx.session.regRole = role;

  const classes = ["Д9", "А9", "Б9", "В9", "Г9", "Д10", "А10", "Б10"];
  const buttons = [];
  for (let i = 0; i < classes.length; i += 2) {
    const row = [];
    for (let j = i; j < i + 2 && j < classes.length; j++) {
      row.push({ text: classes[j], callback_data: `reg_class_${classes[j]}` });
    }
    buttons.push(row);
  }
  buttons.push([{ text: "↩️ Назад", callback_data: "continue_reg" }]);

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `📋 <b>Шаг 3: Выбор класса</b>\n\nВыберите ваш класс:`,
    {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons }
    }
  );
});

bot.action(/reg_class_(.+)/, async (ctx) => {
  const classKey = ctx.match[1];
  const role = ctx.session.regRole || "user";
  const userId = ctx.from?.id;

  const userData = {
    id: userId.toString(),
    username: ctx.from?.username || null,
    first_name: ctx.from?.first_name || null,
    last_name: ctx.from?.last_name || null,
    class: classKey,
    role: role === "admin" ? "user" : "user",
    registered_at: new Date(),
    chat_id: ctx.chat?.id,
    chat_type: ctx.chat?.type,
    custom_keyboard: ["📆 Сегодня", "📅 Завтра", "📆 Неделя", "👤 Профиль", "🏠 Меню"],
    notifications_enabled: true,
    stats: {
      homework_views: 0,
      last_active: new Date()
    }
  };

  await saveUser(userData);

  delete ctx.session.regRole;

  let msg = `✅ <b>Регистрация завершена!</b>\n\n` +
    `👤 Имя: <b>${userData.first_name || "Не указано"}</b>\n` +
    `🏫 Класс: <b>${classKey}</b>\n` +
    `🎭 Роль: 🎒 Ученик\n\n`;

  if (role === "admin") {
    const user = await getUserById(userId);
    await sendAdminRequest(ctx, user);
    msg += `📨 <i>Ваш запрос на роль админа отправлен модераторам.</i>`;
  }

  await ctx.answerCbQuery("✅ Регистрация завершена!");
  await ctx.editMessageText(msg, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: "🏠 В главное меню", callback_data: "main_menu" }]]
    }
  });

  await ctx.reply("⌨️ Вот ваша клавиатура!", buildReplyKeyboard(userData.custom_keyboard));
});

bot.action("confirm_delete_profile", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `⚠️ <b>Удаление профиля</b>\n\n` +
    `Вы уверены, что хотите удалить свой профиль?\n` +
    `Это действие нельзя отменить.`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🗑️ Да, удалить", callback_data: "delete_profile" }],
          [{ text: "↩️ Нет, отмена", callback_data: "show_profile" }]
        ]
      }
    }
  );
});

bot.action("delete_profile", async (ctx) => {
  const userId = ctx.from?.id.toString();
  await deleteUser(userId);

  await ctx.answerCbQuery("✅ Профиль удалён");
  await ctx.editMessageText(
    `✅ <b>Профиль удалён</b>\n\n` +
    `Ваши данные были удалены.\n` +
    `Вы можете зарегистрироваться заново.`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Зарегистрироваться", callback_data: "reg_step1" }]]
      }
    }
  );
});

bot.action("edit_step_day", async (ctx) => {
  const dates = getDatesRange(14);
  const buttons = [];
  
  for (let i = 0; i < dates.length; i += 3) {
    const row = [];
    for (let j = i; j < i + 3 && j < dates.length; j++) {
      const d = new Date(dates[j]);
      const label = `${d.getDate()}.${(d.getMonth() + 1).toString().padStart(2, "0")}`;
      row.push({ text: label, callback_data: `edit_day_${dates[j]}` });
    }
    buttons.push(row);
  }
  buttons.push([{ text: "📅 Другой месяц", callback_data: "edit_step_month" }]);
  buttons.push([{ text: "↩️ Назад", callback_data: "edit_dz_panel" }]);

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `📅 <b>Выберите день</b>\n\n<i>Или выберите другой месяц:</i>`,
    {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons }
    }
  );
});

bot.action(/edit_day_(.+)/, async (ctx) => {
  const dateStr = ctx.match[1];
  const [year, month, day] = dateStr.split("-");
  
  ctx.session.editDate = { day, month, year };
  
  await showEditConfirmDate(ctx);
});

async function showEditConfirmDate(ctx) {
  if (!ctx.session.editDate) {
    await ctx.answerCbQuery();
    await ctx.editMessageText("❌ Сессия устарела. Пожалуйста, начните заново.", {
      reply_markup: { inline_keyboard: [[{ text: "✏️ Редактировать ДЗ", callback_data: "edit_dz_panel" }]] }
    });
    return;
  }

  const { day, month, year } = ctx.session.editDate;
  const dateStr = `${year}-${month}-${day}`;
  const dateObj = new Date(dateStr);
  const user = await getUserById(ctx.from.id);
  const classKey = user.class;

  const days = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  const weekday = days[dateObj.getDay()];

  const dz = await getClassHomework(classKey);
  const dayDZ = dz[dateStr] || {};
  
  let dzList = "";
  if (Object.keys(dayDZ).length > 0) {
    dzList = "\n\n📋 <b>Текущие задания:</b>\n";
    for (const [subject, task] of Object.entries(dayDZ)) {
      const icon = getSubjectIcon(subject);
      dzList += `${icon} ${subject}: <i>${truncateText(task, 40)}</i>\n`;
    }
  }

  const msg = `✅ Выбрана дата: <b>${day}.${month}.${year}</b>\n` +
    `📅 День недели: <b>${weekday}</b>\n` +
    `🏫 Класс: <b>${classKey}</b>${dzList}\n\n` +
    `Выберите действие:`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ Добавить ДЗ", callback_data: "edit_action_add" }],
        [{ text: "🗑️ Удалить ДЗ", callback_data: "edit_action_delete" }],
        [{ text: "↩️ Изменить дату", callback_data: "edit_step_day" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  };

  await ctx.answerCbQuery();
  await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
}

bot.action("edit_confirm_date", (ctx) => showEditConfirmDate(ctx));

bot.action("edit_action_add", async (ctx) => {
  ctx.session.editStep = "waiting_subject";
  
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `📝 <b>Добавление ДЗ</b>\n\n` +
    `Отправьте название предмета текстом.\n\n` +
    `<i>Например: Алгебра, Физика, История</i>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "↩️ Отмена", callback_data: "edit_confirm_date" }]]
      }
    }
  );
});

bot.action("edit_action_delete", async (ctx) => {
  const user = await getUserById(ctx.from.id);
  const { day, month, year } = ctx.session.editDate;
  const dateStr = `${year}-${month}-${day}`;

  const dz = await getClassHomework(user.class);
  const dayDZ = dz[dateStr] || {};

  if (Object.keys(dayDZ).length === 0) {
    await ctx.answerCbQuery("❌ На эту дату нет заданий");
    return;
  }

  const buttons = Object.keys(dayDZ).map(subject => {
    const icon = getSubjectIcon(subject);
    return [{ text: `🗑️ ${icon} ${subject}`, callback_data: `delete_subject_${subject}` }];
  });
  buttons.push([{ text: "↩️ Назад", callback_data: "edit_confirm_date" }]);

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `🗑️ <b>Удаление ДЗ</b>\n\n` +
    `Выберите предмет для удаления:`,
    {
      parse_mode: "HTML",
      reply_markup: { inline_keyboard: buttons }
    }
  );
});

bot.action(/delete_subject_(.+)/, async (ctx) => {
  const subject = ctx.match[1];
  const user = await getUserById(ctx.from.id);
  const { day, month, year } = ctx.session.editDate;
  const dateStr = `${year}-${month}-${day}`;

  const dz = await getClassHomework(user.class);
  if (dz[dateStr] && dz[dateStr][subject]) {
    delete dz[dateStr][subject];
    if (Object.keys(dz[dateStr]).length === 0) {
      delete dz[dateStr];
    }
    await saveClassHomework(user.class, dz);
  }

  await ctx.answerCbQuery(`✅ ${subject} удалён`);
  await showEditConfirmDate(ctx);
});

bot.action("edit_step_month", async (ctx) => {
  const months = [
    { text: "Янв", callback_data: "edit_select_month_01" },
    { text: "Фев", callback_data: "edit_select_month_02" },
    { text: "Мар", callback_data: "edit_select_month_03" },
    { text: "Апр", callback_data: "edit_select_month_04" },
    { text: "Май", callback_data: "edit_select_month_05" },
    { text: "Июн", callback_data: "edit_select_month_06" },
    { text: "Июл", callback_data: "edit_select_month_07" },
    { text: "Авг", callback_data: "edit_select_month_08" },
    { text: "Сен", callback_data: "edit_select_month_09" },
    { text: "Окт", callback_data: "edit_select_month_10" },
    { text: "Ноя", callback_data: "edit_select_month_11" },
    { text: "Дек", callback_data: "edit_select_month_12" }
  ];

  const rows = [];
  for (let i = 0; i < months.length; i += 3) {
    rows.push(months.slice(i, i + 3));
  }
  rows.push([{ text: "↩️ Назад", callback_data: "edit_step_day" }]);

  await ctx.answerCbQuery();
  await ctx.editMessageText("📅 Выберите <b>месяц</b>:", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows }
  });
});

bot.action(/edit_select_month_(\d+)/, async (ctx) => {
  const month = ctx.match[1];
  ctx.session.editMonth = month;

  const years = [
    { text: "2025", callback_data: "edit_select_year_2025" },
    { text: "2026", callback_data: "edit_select_year_2026" }
  ];

  await ctx.answerCbQuery();
  await ctx.editMessageText("📅 Выберите <b>год</b>:", {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [years, [{ text: "↩️ Назад", callback_data: "edit_step_month" }]]
    }
  });
});

bot.action(/edit_select_year_(\d+)/, async (ctx) => {
  const year = ctx.match[1];
  const month = ctx.session.editMonth;

  const daysInMonth = new Date(parseInt(year), parseInt(month), 0).getDate();
  const buttons = [];
  
  for (let i = 1; i <= daysInMonth; i += 7) {
    const row = [];
    for (let j = i; j < i + 7 && j <= daysInMonth; j++) {
      const dayStr = j.toString().padStart(2, "0");
      row.push({ text: dayStr, callback_data: `edit_day_${year}-${month}-${dayStr}` });
    }
    buttons.push(row);
  }
  buttons.push([{ text: "↩️ Назад", callback_data: "edit_step_month" }]);

  await ctx.answerCbQuery();
  await ctx.editMessageText(`📅 Выберите <b>день</b> (${month}.${year}):`, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons }
  });
});

bot.action("edit_help", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `ℹ️ <b>Справка по редактированию</b>\n\n` +
    `Эта панель позволяет:\n` +
    `• Добавлять новые домашние задания\n` +
    `• Удалять существующие задания\n` +
    `• Редактировать ДЗ для любой даты\n\n` +
    `<b>Как использовать:</b>\n` +
    `1. Выберите дату\n` +
    `2. Выберите действие (добавить/удалить)\n` +
    `3. Следуйте инструкциям\n\n` +
    `⚠️ Изменения сохраняются сразу!`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "↩️ Назад", callback_data: "edit_dz_panel" }]]
      }
    }
  );
});

async function startBot() {
  await connectDB();
  
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Web server запущен на порту ${PORT}`);
  });

  bot.launch()
    .then(() => console.log("🤖 Бот запущен!"))
    .catch((err) => console.error("❌ Ошибка запуска бота:", err));
}

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));

startBot();
