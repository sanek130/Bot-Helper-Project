import 'dotenv/config';
import { Telegraf } from "telegraf";
import { config } from "./config.js";
import mongoose from "mongoose";
import { User } from "./models/User.js";
import { Homework } from "./models/Homework.js";
import express from "express";

const app = express();
const PORT = process.env.PORT || 3000;

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

bot.on("message", async (ctx) => {
  const textw = ctx.message?.text?.trim();
  if (!textw) return;

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
    [{ text: "🔔 Уведомления: " + (user.notifications_enabled !== false ? "✅ Вкл" : "❌ Выкл"), callback_data: "toggle_notifications" }],
    [{ text: "⚙️ Настроить клавиатуру", callback_data: "cmd_configure" }],
    [{ text: "🏠 В меню", callback_data: "main_menu" }],
    [{ text: "🗑️ Удалить профиль", callback_data: "confirm_delete_profile" }]
  ];

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
  baseButtons.push([{ text: "❓ Помощь", callback_data: "help_and_command" }]);
  baseButtons.push([{ text: "⌨️ Открыть клавиатуру", callback_data: "show_reply_keyboard" }]);

  const keyboard = { reply_markup: { inline_keyboard: baseButtons } };

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    const callbackMsg = ctx.callbackQuery.message;
    if (callbackMsg?.text) {
      await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
    } else {
      try {
        await ctx.deleteMessage();
      } catch (e) {}
      await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
    }
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", ...keyboard });
  }
}

async function showHelp(ctx) {
  const msg = `❓ <b>Справка по боту</b>\n\n` +
    `📚 <b>Что умеет этот бот:</b>\n\n` +
    `<b>🔹 Просмотр домашнего задания:</b>\n` +
    `├ 📆 <b>Сегодня</b> — ДЗ на сегодня\n` +
    `├ 📅 <b>Завтра</b> — ДЗ на завтра\n` +
    `├ 📆 <b>Неделя</b> — ДЗ на текущую неделю\n` +
    `├ ⏭️ <b>Другая неделя</b> — ДЗ на следующую неделю\n` +
    `└ 🔍 <b>Выбор дня</b> — выбрать конкретную дату\n\n` +
    `<b>🔹 Расписание:</b>\n` +
    `└ 📖 <b>Расписание</b> — посмотреть расписание уроков\n\n` +
    `<b>🔹 Профиль и настройки:</b>\n` +
    `├ 👤 <b>Профиль</b> — ваши данные и статистика\n` +
    `└ ⚙️ <b>Настройка</b> — настроить клавиатуру\n\n` +
    `<b>📝 Основные команды:</b>\n` +
    `<code>/start</code> — начало работы\n` +
    `<code>/menu</code> — главное меню\n` +
    `<code>/help</code> — эта справка\n` +
    `<code>/profile</code> — ваш профиль\n\n` +
    `<b>🎓 Для админов:</b>\n` +
    `<code>/edit</code> — редактировать ДЗ\n` +
    `<code>/stats</code> — статистика класса\n\n` +
    `💡 <i>Используйте кнопки клавиатуры для быстрого доступа!</i>`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📆 Попробовать: Сегодня", callback_data: "cmd_day" }],
        [{ text: "📝 Зарегистрироваться", callback_data: "reg_step1" }],
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
  const user = await getUserById(ctx.from?.id);
  if (!user || user.role !== "admin") {
    await ctx.reply("🚫 Только для админов");
    return;
  }

  const classKey = user.class;
  const allUsers = await getAllUsers();
  const classUsers = allUsers.filter((u) => u.class === classKey);
  const totalUsers = allUsers.length;
  const classAdmins = classUsers.filter((u) => u.role === "admin").length;

  const dz = await getClassHomework(classKey);
  const dzDates = Object.keys(dz);
  const totalDZ = dzDates.reduce((sum, date) => sum + Object.keys(dz[date] || {}).length, 0);

  const msg = `📊 <b>Статистика</b>\n\n` +
    `<b>🏫 Класс ${classKey}:</b>\n` +
    `├ 👥 Пользователей: ${classUsers.length}\n` +
    `├ 🎓 Админов: ${classAdmins}\n` +
    `├ 📚 Дней с ДЗ: ${dzDates.length}\n` +
    `└ 📝 Всего заданий: ${totalDZ}\n\n` +
    `<b>📈 Общая статистика:</b>\n` +
    `└ 👥 Всего пользователей: ${totalUsers}`;

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

async function showTodayDZ(ctx) {
  const user = await getUserById(ctx.from?.id);
  if (!user) {
    await ctx.reply("🚫 <b>Сначала зарегистрируйтесь!</b>", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Зарегистрироваться", callback_data: "reg_step1" }]]
      }
    });
    return;
  }

  await updateUserStats(ctx.from?.id);

  const today = new Date().toISOString().split("T")[0];
  const classKey = user.class;
  const dz = await getClassHomework(classKey);
  const lessons = dz[today] || {};

  let msg = `📆 <b>Домашнее задание на сегодня</b>\n`;
  msg += `📅 ${formatDate(today)} • ${getWeekLabel(today)}\n`;
  msg += `🏫 Класс: <b>${classKey}</b>\n\n`;

  if (Object.keys(lessons).length === 0) {
    msg += `✨ <b>Заданий нет!</b>\n\n<i>Свободный день или ДЗ ещё не добавлено.</i>`;
  } else {
    for (const [subject, task] of Object.entries(lessons)) {
      const icon = getSubjectIcon(subject);
      msg += `${icon} <b>${subject}</b>\n${task}\n\n`;
    }
  }

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📅 Завтра", callback_data: "cmd_next_day" }, { text: "📆 Неделя", callback_data: "cmd_week" }],
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
  const user = await getUserById(ctx.from?.id);
  if (!user) {
    await ctx.reply("🚫 <b>Сначала зарегистрируйтесь!</b>", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Зарегистрироваться", callback_data: "reg_step1" }]]
      }
    });
    return;
  }

  await updateUserStats(ctx.from?.id);

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];
  const classKey = user.class;
  const dz = await getClassHomework(classKey);
  const lessons = dz[tomorrowStr] || {};

  let msg = `📅 <b>Домашнее задание на завтра</b>\n`;
  msg += `📅 ${formatDate(tomorrowStr)} • ${getWeekLabel(tomorrowStr)}\n`;
  msg += `🏫 Класс: <b>${classKey}</b>\n\n`;

  if (Object.keys(lessons).length === 0) {
    msg += `✨ <b>Заданий нет!</b>\n\n<i>Свободный день или ДЗ ещё не добавлено.</i>`;
  } else {
    for (const [subject, task] of Object.entries(lessons)) {
      const icon = getSubjectIcon(subject);
      msg += `${icon} <b>${subject}</b>\n${task}\n\n`;
    }
  }

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📆 Сегодня", callback_data: "cmd_day" }, { text: "📆 Неделя", callback_data: "cmd_week" }],
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
  const user = await getUserById(ctx.from?.id);
  if (!user) {
    await ctx.reply("🚫 <b>Сначала зарегистрируйтесь!</b>", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Зарегистрироваться", callback_data: "reg_step1" }]]
      }
    });
    return;
  }

  await updateUserStats(ctx.from?.id);

  const dates = getDatesRange(7);
  const classKey = user.class;
  const dz = await getClassHomework(classKey);

  let msg = `📆 <b>Домашнее задание на неделю</b>\n`;
  msg += `🏫 Класс: <b>${classKey}</b>\n\n`;

  let hasAny = false;
  for (const dateStr of dates) {
    const lessons = dz[dateStr] || {};
    if (Object.keys(lessons).length > 0) {
      hasAny = true;
      msg += `<b>📅 ${formatDate(dateStr)}</b>\n`;
      for (const [subject, task] of Object.entries(lessons)) {
        const icon = getSubjectIcon(subject);
        msg += `${icon} <b>${subject}</b>: ${truncateText(task, 50)}\n`;
      }
      msg += "\n";
    }
  }

  if (!hasAny) {
    msg += `✨ <b>На этой неделе заданий нет!</b>\n\n<i>Наслаждайтесь свободным временем!</i>`;
  }

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "⏭️ Следующая неделя", callback_data: "cmd_next_week" }],
        [{ text: "🔍 Выбрать день", callback_data: "cmd_choice" }],
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
  const user = await getUserById(ctx.from?.id);
  if (!user) {
    await ctx.reply("🚫 <b>Сначала зарегистрируйтесь!</b>", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Зарегистрироваться", callback_data: "reg_step1" }]]
      }
    });
    return;
  }

  await updateUserStats(ctx.from?.id);

  const start = new Date();
  start.setDate(start.getDate() + 7);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date.toISOString().split("T")[0]);
  }

  const classKey = user.class;
  const dz = await getClassHomework(classKey);

  let msg = `⏭️ <b>Домашнее задание на следующую неделю</b>\n`;
  msg += `🏫 Класс: <b>${classKey}</b>\n\n`;

  let hasAny = false;
  for (const dateStr of dates) {
    const lessons = dz[dateStr] || {};
    if (Object.keys(lessons).length > 0) {
      hasAny = true;
      msg += `<b>📅 ${formatDate(dateStr)}</b>\n`;
      for (const [subject, task] of Object.entries(lessons)) {
        const icon = getSubjectIcon(subject);
        msg += `${icon} <b>${subject}</b>: ${truncateText(task, 50)}\n`;
      }
      msg += "\n";
    }
  }

  if (!hasAny) {
    msg += `✨ <b>На следующей неделе заданий пока нет!</b>\n\n<i>Возможно, их ещё не добавили.</i>`;
  }

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📆 Текущая неделя", callback_data: "cmd_week" }],
        [{ text: "🔍 Выбрать день", callback_data: "cmd_choice" }],
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
  const msg = `🔍 <b>Выбор даты</b>\n\n` +
    `Выберите день, чтобы посмотреть домашнее задание.\n\n` +
    `📅 Сначала выберите <b>день месяца</b>:`;

  const days = [];
  for (let i = 1; i <= 31; i++) {
    days.push({ text: i < 10 ? `0${i}` : `${i}`, callback_data: `choice_select_day_${i}` });
  }
  const rows = [];
  for (let i = 0; i < days.length; i += 7) {
    rows.push(days.slice(i, i + 7));
  }
  rows.push([{ text: "🏠 В меню", callback_data: "main_menu" }]);

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: rows } });
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: rows } });
  }
}

async function showKeyboardConfig(ctx) {
  const userId = ctx.from.id.toString();
  const user = await getUserById(userId);

  if (!user) {
    await ctx.reply("🚫 <b>Сначала зарегистрируйтесь!</b>", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Зарегистрироваться", callback_data: "reg_step1" }]]
      }
    });
    return;
  }

  const currentKb = user.custom_keyboard || ["📆 Сегодня", "📅 Завтра", "📖 Расписание"];

  const allOptions = [
    "📆 Сегодня",
    "📅 Завтра",
    "📆 Неделя",
    "⏭️ Другая неделя",
    "🔍 Выбор дня",
    "📥 Всё ДЗ",
    "📖 Расписание",
    "👤 Профиль",
    "🏠 Меню"
  ];

  let msg = `⚙️ <b>Настройка клавиатуры</b>\n\n`;
  msg += `Выберите кнопки, которые будут отображаться на вашей быстрой клавиатуре.\n\n`;
  msg += `✅ — включено\n⬜️ — выключено\n\n`;
  msg += `<b>Текущие кнопки:</b> ${currentKb.length > 0 ? currentKb.join(", ") : "нет"}`;

  const buttons = allOptions.map((opt) => {
    const isSelected = currentKb.includes(opt);
    return [{
      text: `${isSelected ? "✅" : "⬜️"} ${opt}`,
      callback_data: `toggle_kb_${opt}`
    }];
  });

  buttons.push([{ text: "💾 Сохранить и применить", callback_data: "save_keyboard" }]);
  buttons.push([{ text: "🔄 Сбросить настройки", callback_data: "reset_keyboard" }]);
  buttons.push([{ text: "🏠 В меню", callback_data: "main_menu" }]);

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
  } else {
    await ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
  }
}

async function showEditPanel(ctx) {
  const msg = `✏️ <b>Панель редактирования ДЗ</b>\n\n` +
    `Здесь вы можете управлять домашними заданиями для вашего класса.\n\n` +
    `<b>Возможности:</b>\n` +
    `├ ➕ Добавить новое задание\n` +
    `├ 🗑️ Удалить существующее\n` +
    `└ 📝 Редактировать содержимое\n\n` +
    `⚠️ <i>Все изменения применяются мгновенно и видны всем ученикам класса.</i>\n\n` +
    `👇 Нажмите «Продолжить» чтобы выбрать дату`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "▶️ Продолжить", callback_data: "edit_step_day" }],
        [{ text: "📊 Статистика", callback_data: "admin_stats" }],
        [{ text: "ℹ️ Инструкция", callback_data: "edit_help" }],
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

async function viewSchedule(ctx) {
  const user = await getUserById(ctx.from?.id);
  if (!user) {
    await ctx.reply("🚫 <b>Сначала зарегистрируйтесь!</b>", {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Зарегистрироваться", callback_data: "reg_step1" }]]
      }
    });
    return;
  }

  const classKey = user.class;
  const photoId = await getSchedulePhotoId(classKey);

  if (!photoId) {
    const msg = `📖 <b>Расписание для класса ${classKey}</b>\n\n` +
      `❌ <i>Расписание пока не добавлено.</i>\n\n` +
      (user.role === "admin"
        ? `💡 <b>Вы админ!</b> Загрузите расписание через кнопку ниже.`
        : `💡 Попросите админа класса загрузить расписание.`);

    const buttons = user.role === "admin"
      ? [[{ text: "📤 Загрузить расписание", callback_data: "upload_schedule" }], [{ text: "🏠 В меню", callback_data: "main_menu" }]]
      : [[{ text: "🏠 В меню", callback_data: "main_menu" }]];

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await ctx.editMessageText(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
    } else {
      await ctx.reply(msg, { parse_mode: "HTML", reply_markup: { inline_keyboard: buttons } });
    }
    return;
  }

  try {
    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await ctx.deleteMessage();
    }
    await ctx.replyWithPhoto(photoId, {
      caption: `📖 <b>Расписание для класса ${classKey}</b>`,
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "🔄 Обновить", callback_data: "view_schedule" }],
          [{ text: "🏠 В меню", callback_data: "main_menu" }]
        ]
      }
    });
  } catch (e) {
    console.error("Ошибка отправки расписания:", e);
    await ctx.reply("❌ Не удалось загрузить расписание. Возможно, оно было удалено.", {
      reply_markup: {
        inline_keyboard: [[{ text: "🏠 В меню", callback_data: "main_menu" }]]
      }
    });
  }
}

bot.action("start_bot", (ctx) => showStart(ctx));
bot.action("main_menu", (ctx) => showMainMenu(ctx));
bot.action("help_and_command", (ctx) => showHelp(ctx));
bot.action("reg_step1", (ctx) => showRegStep1(ctx));
bot.action("show_profile", (ctx) => showMe(ctx));
bot.action("cmd_configure", (ctx) => showKeyboardConfig(ctx));
bot.action("cmd_day", (ctx) => showTodayDZ(ctx));
bot.action("cmd_next_day", (ctx) => showTomorrowDZ(ctx));
bot.action("cmd_week", (ctx) => showWeekDZ(ctx));
bot.action("cmd_next_week", (ctx) => showNextWeekDZ(ctx));
bot.action("admin_stats", (ctx) => showAdminStats(ctx));
bot.action("edit_dz_panel", async (ctx) => {
  if (!(await isAdmin(ctx))) {
    await ctx.answerCbQuery("🚫 Только для админов");
    return;
  }
  await showEditPanel(ctx);
});

bot.action("cmd_choice", async (ctx) => {
  await ctx.answerCbQuery();
  await showChoiceDay(ctx);
});

bot.action("cmd_all", async (ctx) => {
  await ctx.answerCbQuery();
  await showChoiceDay(ctx);
});

bot.action("view_schedule", (ctx) => viewSchedule(ctx));

bot.action("show_reply_keyboard", async (ctx) => {
  await ctx.answerCbQuery("⌨️ Клавиатура открыта!");
  await ctx.reply("⌨️ Используйте кнопки ниже:", getDefaultKeyboard());
});

bot.action("toggle_notifications", async (ctx) => {
  const userId = ctx.from.id.toString();
  const user = await getUserById(userId);
  if (!user) {
    await ctx.answerCbQuery("❌ Пользователь не найден");
    return;
  }

  const newValue = !(user.notifications_enabled !== false);
  await User.findOneAndUpdate({ id: userId }, { notifications_enabled: newValue });
  await ctx.answerCbQuery(newValue ? "🔔 Уведомления включены" : "🔕 Уведомления выключены");
  await showMe(ctx);
});

bot.action(/toggle_kb_(.+)/, async (ctx) => {
  const cmd = ctx.match[1];
  const userId = ctx.from.id.toString();
  const user = await getUserById(userId);

  if (!user) {
    await ctx.answerCbQuery("❌ Пользователь не найден");
    return;
  }

  let keyboard = user.custom_keyboard || ["📆 Сегодня", "📅 Завтра", "📖 Расписание"];

  if (keyboard.includes(cmd)) {
    keyboard = keyboard.filter((k) => k !== cmd);
  } else {
    keyboard.push(cmd);
  }

  await User.findOneAndUpdate({ id: userId }, { custom_keyboard: keyboard });
  await showKeyboardConfig(ctx);
});

bot.action("save_keyboard", async (ctx) => {
  const userId = ctx.from.id.toString();
  const user = await getUserById(userId);
  const keyboard = user?.custom_keyboard || ["📆 Сегодня", "📅 Завтра", "📖 Расписание"];

  const rows = [];
  for (let i = 0; i < keyboard.length; i += 2) {
    rows.push(keyboard.slice(i, i + 2));
  }
  rows.push(["⚙️ Настройка"]);

  await ctx.answerCbQuery("✅ Клавиатура сохранена!");
  await ctx.reply("⌨️ Ваша клавиатура обновлена:", {
    reply_markup: { keyboard: rows, resize_keyboard: true }
  });
});

bot.action("reset_keyboard", async (ctx) => {
  const userId = ctx.from.id.toString();
  const defaultKb = ["📆 Сегодня", "📅 Завтра", "📖 Расписание"];
  await User.findOneAndUpdate({ id: userId }, { custom_keyboard: defaultKb });
  await ctx.answerCbQuery("🔄 Клавиатура сброшена");
  await showKeyboardConfig(ctx);
});

bot.action("continue_reg", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `📋 <b>Регистрация — Шаг 2 из 4</b>\n\n` +
    `🎭 <b>Выберите вашу роль:</b>\n\n` +
    `🎒 <b>Ученик</b> — просмотр ДЗ и расписания\n` +
    `🎓 <b>Админ</b> — добавление ДЗ и управление классом\n\n` +
    `<i>⚠️ Админ может редактировать задания для всего класса</i>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "🎒 Ученик", callback_data: "fill_quest_user" },
            { text: "🎓 Админ", callback_data: "fill_quest_admin" }
          ],
          [{ text: "↩️ Назад", callback_data: "reg_step1" }]
        ]
      }
    }
  );
});

bot.action("fill_quest_user", async (ctx) => {
  ctx.session.role = "user";
  await showClassLetterSelection(ctx);
});

bot.action("fill_quest_admin", async (ctx) => {
  ctx.session.role = "admin";
  await showClassLetterSelection(ctx);
});

async function showClassLetterSelection(ctx) {
  const roleText = ctx.session.role === "admin" ? "🎓 Админ" : "🎒 Ученик";
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `📋 <b>Регистрация — Шаг 3 из 4</b>\n\n` +
    `✅ Роль: <b>${roleText}</b>\n\n` +
    `🔤 <b>Выберите букву вашего класса:</b>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "А", callback_data: "continue_class_a" },
            { text: "Б", callback_data: "continue_class_b" },
            { text: "В", callback_data: "continue_class_v" }
          ],
          [
            { text: "Г", callback_data: "continue_class_g" },
            { text: "Д", callback_data: "continue_class_d" },
            { text: "Е", callback_data: "continue_class_e" }
          ],
          [{ text: "↩️ Назад", callback_data: "continue_reg" }]
        ]
      }
    }
  );
}

bot.action(/continue_class_([a-z])/i, async (ctx) => {
  const letterMap = { a: "А", b: "Б", v: "В", g: "Г", d: "Д", e: "Е" };
  const key = ctx.match[1].toLowerCase();
  const letter = letterMap[key];
  if (!letter) {
    await ctx.answerCbQuery("❌ Неверная буква");
    return;
  }
  ctx.session.chosenLetter = letter;
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `📋 <b>Регистрация — Шаг 3 из 4</b>\n\n` +
    `✅ Роль: <b>${ctx.session.role === "admin" ? "🎓 Админ" : "🎒 Ученик"}</b>\n` +
    `✅ Буква класса: <b>${letter}</b>\n\n` +
    `🔢 <b>Теперь выберите номер класса:</b>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [
            { text: "5", callback_data: "class_num_5" },
            { text: "6", callback_data: "class_num_6" },
            { text: "7", callback_data: "class_num_7" }
          ],
          [
            { text: "8", callback_data: "class_num_8" },
            { text: "9", callback_data: "class_num_9" },
            { text: "10", callback_data: "class_num_10" }
          ],
          [{ text: "11", callback_data: "class_num_11" }],
          [{ text: "↩️ Изменить букву", callback_data: "fill_quest_user" }]
        ]
      }
    }
  );
});

bot.action(/class_num_(\d+)/, async (ctx) => {
  await ctx.answerCbQuery();

  const number = ctx.match[1];
  const validNumbers = ["5", "6", "7", "8", "9", "10", "11"];
  if (!validNumbers.includes(number)) {
    await ctx.reply("❌ Недопустимый номер класса");
    return;
  }
  if (!ctx.session?.chosenLetter) {
    await ctx.reply("❌ Сначала выберите букву класса!");
    return;
  }

  const fullClass = ctx.session.chosenLetter + number;
  ctx.session.class = fullClass;
  const roleText = ctx.session.role === "admin" ? "🎓 Админ" : "🎒 Ученик";

  await ctx.editMessageText(
    `📋 <b>Регистрация — Шаг 4 из 4</b>\n\n` +
    `<b>Проверьте ваши данные:</b>\n\n` +
    `├ 🎭 Роль: <b>${roleText}</b>\n` +
    `├ 🏫 Класс: <b>${fullClass}</b>\n` +
    `└ 👤 Имя: <b>${ctx.from.first_name || "Не указано"}</b>\n\n` +
    `✅ Если всё верно, нажмите <b>«Подтвердить»</b>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Подтвердить регистрацию", callback_data: "confirm_class" }],
          [{ text: "🔄 Изменить класс", callback_data: "fill_quest_user" }],
          [{ text: "❌ Отменить", callback_data: "start_bot" }]
        ]
      }
    }
  );
});

bot.action("confirm_class", async (ctx) => {
  await ctx.answerCbQuery();

  const userId = ctx.from.id.toString();
  const fullClass = ctx.session.class;
  const role = ctx.session.role || "user";

  if (!fullClass) {
    await ctx.editMessageText("❌ Ошибка: класс не выбран. Начните регистрацию заново.", {
      reply_markup: {
        inline_keyboard: [[{ text: "📝 Начать заново", callback_data: "reg_step1" }]]
      }
    });
    return;
  }

  const userData = {
    id: userId,
    username: ctx.from.username,
    first_name: ctx.from.first_name,
    last_name: ctx.from.last_name,
    class: fullClass,
    role: role,
    registered_at: new Date(),
    custom_keyboard: ["📆 Сегодня", "📅 Завтра", "📖 Расписание"],
    notifications_enabled: true,
    stats: { homework_views: 0, last_active: new Date() }
  };

  await saveUser(userData);

  delete ctx.session.class;
  delete ctx.session.role;
  delete ctx.session.chosenLetter;

  await ctx.editMessageText(
    `🎉 <b>Регистрация завершена!</b>\n\n` +
    `Добро пожаловать в систему!\n\n` +
    `├ 👤 <b>${ctx.from.first_name || "Пользователь"}</b>\n` +
    `├ 🏫 Класс: <b>${fullClass}</b>\n` +
    `└ 🎭 Роль: <b>${role === "admin" ? "🎓 Админ" : "🎒 Ученик"}</b>\n\n` +
    `🚀 Теперь вы можете:\n` +
    `• Смотреть домашние задания\n` +
    `• Просматривать расписание\n` +
    (role === "admin" ? `• Добавлять и редактировать ДЗ\n` : "") +
    `\n<i>Используйте кнопки ниже для навигации!</i>`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📆 Посмотреть ДЗ на сегодня", callback_data: "cmd_day" }],
          [{ text: "🏠 В главное меню", callback_data: "main_menu" }],
          [{ text: "⌨️ Открыть клавиатуру", callback_data: "show_reply_keyboard" }]
        ]
      }
    }
  );
});

bot.action("confirm_delete_profile", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `⚠️ <b>Удаление профиля</b>\n\n` +
    `Вы уверены, что хотите удалить свой профиль?\n\n` +
    `❌ <b>Это действие нельзя отменить!</b>\n` +
    `Все ваши данные и настройки будут удалены.`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Да, удалить профиль", callback_data: "delete_profile" }],
          [{ text: "❌ Нет, отмена", callback_data: "show_profile" }]
        ]
      }
    }
  );
});

bot.action("delete_profile", async (ctx) => {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.answerCbQuery("❌ Ошибка");
    return;
  }

  const user = await getUserById(userId);
  if (!user) {
    await ctx.answerCbQuery("❌ Профиль не найден");
    return;
  }

  await deleteUser(userId);
  sessions.delete(userId);

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `🗑️ <b>Профиль удалён</b>\n\n` +
    `Ваш профиль успешно удалён из системы.\n\n` +
    `Вы можете зарегистрироваться заново в любой момент.`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [
          [{ text: "📝 Зарегистрироваться заново", callback_data: "reg_step1" }],
          [{ text: "🏠 На главную", callback_data: "start_bot" }]
        ]
      }
    }
  );
});

bot.action("edit_step_day", async (ctx) => {
  const days = [];
  for (let i = 1; i <= 31; i++) {
    days.push({ text: i < 10 ? `0${i}` : `${i}`, callback_data: `edit_select_day_${i}` });
  }
  const rows = [];
  for (let i = 0; i < days.length; i += 7) {
    rows.push(days.slice(i, i + 7));
  }
  rows.push([{ text: "↩️ Назад", callback_data: "edit_dz_panel" }]);

  await ctx.answerCbQuery();
  await ctx.editMessageText("📅 <b>Выберите день:</b>", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows }
  });
});

bot.action(/edit_select_day_(\d+)/, async (ctx) => {
  const day = ctx.match[1].padStart(2, "0");
  ctx.session.editDate = { day };
  await showEditMonthSelection(ctx);
});

async function showEditMonthSelection(ctx) {
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
  for (let i = 0; i < months.length; i += 4) {
    rows.push(months.slice(i, i + 4));
  }
  rows.push([{ text: "↩️ Назад", callback_data: "edit_step_day" }]);

  await ctx.answerCbQuery();
  await ctx.editMessageText("📅 <b>Выберите месяц:</b>", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows }
  });
}

bot.action(/edit_select_month_(\d+)/, async (ctx) => {
  const month = ctx.match[1];
  ctx.session.editDate.month = month;
  await showEditYearSelection(ctx);
});

async function showEditYearSelection(ctx) {
  const currentYear = new Date().getFullYear();
  const years = [
    { text: `${currentYear}`, callback_data: `edit_select_year_${currentYear}` },
    { text: `${currentYear + 1}`, callback_data: `edit_select_year_${currentYear + 1}` }
  ];
  const rows = [years, [{ text: "↩️ Назад", callback_data: "edit_step_month" }]];

  await ctx.answerCbQuery();
  await ctx.editMessageText("📅 <b>Выберите год:</b>", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows }
  });
}

bot.action("edit_step_month", (ctx) => showEditMonthSelection(ctx));

bot.action(/edit_select_year_(\d+)/, async (ctx) => {
  const year = ctx.match[1];
  ctx.session.editDate.year = year;
  await showEditConfirmDate(ctx);
});

async function showEditConfirmDate(ctx) {
  if (!ctx.session.editDate) {
    await ctx.answerCbQuery();
    await ctx.editMessageText("❌ Сессия устарела. Начните заново.", {
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
  const lessons = dz[dateStr] || {};
  const lessonCount = Object.keys(lessons).length;

  let msg = `📅 <b>Выбрана дата: ${day}.${month}.${year}</b>\n`;
  msg += `📆 ${weekday}\n`;
  msg += `🏫 Класс: <b>${classKey}</b>\n\n`;

  if (lessonCount > 0) {
    msg += `📚 <b>Текущие задания (${lessonCount}):</b>\n`;
    for (const [subject, task] of Object.entries(lessons)) {
      const icon = getSubjectIcon(subject);
      msg += `${icon} <b>${subject}</b>: ${truncateText(task, 30)}\n`;
    }
    msg += "\n";
  } else {
    msg += `📭 <i>На эту дату заданий пока нет</i>\n\n`;
  }

  msg += `👇 <b>Выберите действие:</b>`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ Добавить ДЗ", callback_data: "edit_action_add" }],
        [{ text: "🗑️ Удалить ДЗ", callback_data: "edit_action_delete" }],
        [{ text: "📅 Изменить дату", callback_data: "edit_step_day" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  };

  await ctx.answerCbQuery();
  await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
}

bot.action("edit_confirm_date", (ctx) => showEditConfirmDate(ctx));

bot.action("edit_action_add", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `✏️ <b>Добавление домашнего задания</b>\n\n` +
    `📝 Введите <b>название предмета</b>:\n\n` +
    `<i>Примеры: Алгебра, Физика, История, Английский</i>\n\n` +
    `💡 Совет: пишите названия одинаково каждый раз для удобства поиска.`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "↩️ Назад", callback_data: "edit_confirm_date" }]]
      }
    }
  );
  ctx.session.editStep = "waiting_subject";
});

bot.action("edit_action_delete", async (ctx) => {
  await ctx.answerCbQuery();

  const { day, month, year } = ctx.session.editDate || {};
  if (!day || !month || !year) {
    await ctx.editMessageText("❌ Сессия устарела. Начните заново.", {
      reply_markup: { inline_keyboard: [[{ text: "✏️ Редактировать ДЗ", callback_data: "edit_dz_panel" }]] }
    });
    return;
  }

  const dateKey = `${year}-${month}-${day}`;
  const user = await getUserById(ctx.from.id);
  const classKey = user.class;

  const dz = await getClassHomework(classKey);
  const lessons = dz[dateKey] || {};
  const lessonNames = Object.keys(lessons);

  if (lessonNames.length === 0) {
    await ctx.editMessageText("❌ На эту дату нет домашнего задания.", {
      reply_markup: { inline_keyboard: [[{ text: "↩️ Назад", callback_data: "edit_confirm_date" }]] }
    });
    return;
  }

  const buttons = lessonNames.map((subject, index) => {
    const icon = getSubjectIcon(subject);
    return [{ text: `${icon} ${truncateText(subject)}`, callback_data: `edit_del_${index}` }];
  });
  buttons.push([{ text: "↩️ Назад", callback_data: "edit_confirm_date" }]);

  await ctx.editMessageText(`🗑️ <b>Удаление домашнего задания</b>\n\n📅 Дата: ${day}.${month}.${year}\n\nВыберите предмет для удаления:`, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: buttons }
  });

  ctx.session.lessonsToDelete = lessonNames;
  ctx.session.dzDateKey = dateKey;
  ctx.session.dzClass = classKey;
});

bot.action(/edit_del_(\d+)/, async (ctx) => {
  const index = parseInt(ctx.match[1], 10);
  const lessonNames = ctx.session.lessonsToDelete || [];
  const subject = lessonNames[index];

  if (!subject) {
    await ctx.answerCbQuery("❌ Предмет не найден.");
    return;
  }

  const dateKey = ctx.session.dzDateKey;
  const classKey = ctx.session.dzClass;

  const dz = await getClassHomework(classKey);
  if (!dz[dateKey]?.[subject]) {
    await ctx.answerCbQuery("❌ Предмет уже удалён.");
    return;
  }

  delete dz[dateKey][subject];
  if (Object.keys(dz[dateKey]).length === 0) {
    delete dz[dateKey];
  }
  await saveClassHomework(classKey, dz);

  delete ctx.session.lessonsToDelete;
  delete ctx.session.dzDateKey;
  delete ctx.session.dzClass;

  const icon = getSubjectIcon(subject);
  await ctx.answerCbQuery();
  await ctx.editMessageText(`✅ <b>Предмет удалён!</b>\n\n${icon} <b>${subject}</b> успешно удалён из списка заданий.`, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ Добавить ещё", callback_data: "edit_action_add" }],
        [{ text: "📋 К списку заданий", callback_data: "edit_confirm_date" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  });
});

bot.action("edit_help", async (ctx) => {
  const msg = `ℹ️ <b>Инструкция по редактированию ДЗ</b>\n\n` +
    `<b>📝 Как добавить задание:</b>\n` +
    `1. Выберите дату (день → месяц → год)\n` +
    `2. Нажмите «➕ Добавить ДЗ»\n` +
    `3. Введите название предмета\n` +
    `4. Отправьте текст задания\n\n` +
    `<b>🗑️ Как удалить задание:</b>\n` +
    `1. Выберите дату\n` +
    `2. Нажмите «🗑️ Удалить ДЗ»\n` +
    `3. Выберите предмет для удаления\n\n` +
    `<b>💡 Советы:</b>\n` +
    `• Пишите названия предметов одинаково\n` +
    `• Добавляйте подробные описания заданий\n` +
    `• Можно прикреплять фото к заданиям\n\n` +
    `⚠️ Все изменения видны ученикам сразу!`;

  await ctx.answerCbQuery();
  await ctx.editMessageText(msg, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: "↩️ Назад", callback_data: "edit_dz_panel" }]]
    }
  });
});

bot.action("upload_schedule", async (ctx) => {
  const user = await getUserById(ctx.from?.id);
  if (!user || user.role !== "admin") {
    await ctx.answerCbQuery("🚫 Только для админов");
    return;
  }

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    `📤 <b>Загрузка расписания</b>\n\n` +
    `📸 Отправьте <b>фото расписания</b> следующим сообщением.\n\n` +
    `<b>Требования:</b>\n` +
    `├ Только изображение (не файл)\n` +
    `├ Хорошее качество и читаемость\n` +
    `└ Одно фото на класс\n\n` +
    `⚠️ Старое расписание будет заменено новым.`,
    {
      parse_mode: "HTML",
      reply_markup: {
        inline_keyboard: [[{ text: "↩️ Отмена", callback_data: "main_menu" }]]
      }
    }
  );

  ctx.session.uploadingSchedule = true;
  ctx.session.scheduleClass = user.class;
});

bot.action(/choice_select_day_(\d+)/, async (ctx) => {
  const day = ctx.match[1].padStart(2, "0");
  ctx.session.choiceDate = { day };
  await showChoiceMonth(ctx);
});

async function showChoiceMonth(ctx) {
  const months = [
    { text: "Янв", callback_data: "choice_select_month_01" },
    { text: "Фев", callback_data: "choice_select_month_02" },
    { text: "Мар", callback_data: "choice_select_month_03" },
    { text: "Апр", callback_data: "choice_select_month_04" },
    { text: "Май", callback_data: "choice_select_month_05" },
    { text: "Июн", callback_data: "choice_select_month_06" },
    { text: "Июл", callback_data: "choice_select_month_07" },
    { text: "Авг", callback_data: "choice_select_month_08" },
    { text: "Сен", callback_data: "choice_select_month_09" },
    { text: "Окт", callback_data: "choice_select_month_10" },
    { text: "Ноя", callback_data: "choice_select_month_11" },
    { text: "Дек", callback_data: "choice_select_month_12" }
  ];
  const rows = [];
  for (let i = 0; i < months.length; i += 4) {
    rows.push(months.slice(i, i + 4));
  }
  rows.push([{ text: "↩️ Назад", callback_data: "cmd_choice" }]);

  await ctx.answerCbQuery();
  await ctx.editMessageText("📅 <b>Выберите месяц:</b>", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows }
  });
}

bot.action(/choice_select_month_(\d+)/, async (ctx) => {
  const month = ctx.match[1];
  ctx.session.choiceDate.month = month;
  await showChoiceYear(ctx);
});

async function showChoiceYear(ctx) {
  const currentYear = new Date().getFullYear();
  const years = [
    { text: `${currentYear}`, callback_data: `choice_select_year_${currentYear}` },
    { text: `${currentYear + 1}`, callback_data: `choice_select_year_${currentYear + 1}` }
  ];
  const rows = [years, [{ text: "↩️ Назад", callback_data: "choice_step_month" }]];

  await ctx.answerCbQuery();
  await ctx.editMessageText("📅 <b>Выберите год:</b>", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows }
  });
}

bot.action("choice_step_day", async (ctx) => {
  await showChoiceDay(ctx);
});

bot.action("choice_step_month", (ctx) => showChoiceMonth(ctx));

bot.action(/choice_select_year_(\d+)/, async (ctx) => {
  const year = ctx.match[1];
  ctx.session.choiceDate.year = year;
  await showChoiceConfirm(ctx);
});

async function showChoiceConfirm(ctx) {
  const { day, month, year } = ctx.session.choiceDate;
  const dateStr = `${year}-${month}-${day}`;
  const dateObj = new Date(dateStr);

  if (isNaN(dateObj.getTime())) {
    await ctx.answerCbQuery("❌ Неверная дата");
    return;
  }

  const user = await getUserById(ctx.from.id);
  const classKey = user.class;
  const dz = await getClassHomework(classKey);
  const lessons = dz[dateStr] || {};

  await updateUserStats(ctx.from?.id);

  const days = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  const weekday = days[dateObj.getDay()];
  const weekLabel = getWeekLabel(dateObj);

  let msg = `📅 <b>Домашнее задание</b>\n\n`;
  msg += `📆 <b>${day}.${month}.${year}</b> • ${weekday}\n`;
  msg += `${weekLabel}\n`;
  msg += `🏫 Класс: <b>${classKey}</b>\n\n`;

  if (Object.keys(lessons).length === 0) {
    msg += `✨ <b>Заданий нет!</b>\n\n<i>На эту дату домашнее задание не добавлено.</i>`;
  } else {
    for (const [subject, task] of Object.entries(lessons)) {
      const icon = getSubjectIcon(subject);
      msg += `${icon} <b>${subject}</b>\n${task}\n\n`;
    }
  }

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📥 Всё ДЗ от этой даты", callback_data: "show_all_from_date" }],
        [{ text: "🔍 Выбрать другую дату", callback_data: "cmd_choice" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  };

  await ctx.answerCbQuery();
  await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
}

bot.action("show_all_from_date", async (ctx) => {
  const { day, month, year } = ctx.session.choiceDate || {};
  if (!day || !month || !year) {
    await ctx.answerCbQuery("❌ Сессия устарела");
    return;
  }

  const startDate = new Date(`${year}-${month}-${day}`);
  const user = await getUserById(ctx.from.id);
  const classKey = user.class;
  const dz = await getClassHomework(classKey);

  const sortedDates = Object.keys(dz)
    .filter((date) => new Date(date) >= startDate)
    .sort((a, b) => new Date(a) - new Date(b));

  let msg = `📥 <b>Всё ДЗ от ${day}.${month}.${year}</b>\n`;
  msg += `🏫 Класс: <b>${classKey}</b>\n\n`;

  let hasAny = false;

  for (const dateStr of sortedDates) {
    const lessons = dz[dateStr];
    if (Object.keys(lessons).length > 0) {
      hasAny = true;
      msg += `<b>📅 ${formatDate(dateStr)}</b>\n`;
      for (const [subject, task] of Object.entries(lessons)) {
        const icon = getSubjectIcon(subject);
        msg += `${icon} <b>${subject}</b>\n${task}\n\n`;
      }
    }
  }

  if (!hasAny) {
    msg += `❌ <i>Заданий от этой даты нет.</i>`;
  }

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🔍 Выбрать другую дату", callback_data: "cmd_choice" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  };

  await ctx.answerCbQuery();
  await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
});

async function startBot() {
  console.log("🚀 Запуск бота...");

  await connectDB();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Web server запущен на порту ${PORT}`);
  });

  bot.launch();
  console.log("✅ Бот успешно запущен!");

  process.once("SIGINT", () => {
    bot.stop("SIGINT");
    mongoose.connection.close();
  });
  process.once("SIGTERM", () => {
    bot.stop("SIGTERM");
    mongoose.connection.close();
  });
}

startBot();
