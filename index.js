import { Telegraf } from "telegraf";
import { config } from "./config.js";
import { readFileSync, writeFileSync, existsSync } from "fs";


// === ЗАПУСК БОТА И ВЕБ-СЕРВЕРА ДЛЯ RENDER ===
import express from "express";
const app = express();
const PORT = process.env.PORT || 3000;

// Health-check endpoint для UptimeRobot
app.get("/", (req, res) => {
  res.status(200).send("OK");
});

// Запускаем веб-сервер
app.listen(PORT, () => {
  console.log(`🌐 Web server запущен на порту ${PORT}`);
});


const bot = new Telegraf(config.telegramToken);

// === Пути к файлам ===
const USERS_FILE = "./users.json";
const DZ_FILE = "./dataClassDZ.json";

if (!existsSync(USERS_FILE)) {
  writeFileSync(USERS_FILE, JSON.stringify({}, null, 2));
  console.log("📄 Создан файл users.json");
}
if (!existsSync(DZ_FILE)) {
  writeFileSync(DZ_FILE, JSON.stringify({}, null, 2));
  console.log("📄 Создан файл dataClassDZ.json");
}

// === Сессия в памяти ===
const sessions = new Map();
bot.use((ctx, next) => {
  const sessionId = ctx.from?.id.toString() || 'anonymous';
  ctx.session = sessions.get(sessionId) || {};
  return next().then(() => {
    if (Object.keys(ctx.session).length > 0) {
      sessions.set(sessionId, ctx.session);
    } else {
      sessions.delete(sessionId);
    }
  });
});

// ===   ФУНКЦИЯ ДЛЯ КЛАВИАТУРЫ  ===
function getDefaultKeyboard() {
  return {
    reply_markup: {
      keyboard: [
        ["📆 Сегодня", "📅 Завтра"],
        ["📆 Неделя", "⏭️ Другая неделя"],
        ["🔍 Выбор дня", "📥 Всё ДЗ"],
        ["👤 Профиль", "⚙️ Настройка"],
        ["🏠 Меню"] // ← кнопка для редактирования клавиатуры
      ],
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
}

// === Функции для работы с файлами ===
function readUsers() {
  try {
    return JSON.parse(readFileSync(USERS_FILE, "utf8"));
  } catch (e) {
    console.error("❌ Ошибка чтения users.json:", e);
    return {};
  }
}
function saveUsers(users) {
  try {
    writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), "utf8");
  } catch (e) {
    console.error("❌ Ошибка записи users.json:", e);
  }
}
function readDZ() {
  try {
    return JSON.parse(readFileSync(DZ_FILE, "utf8"));
  } catch (e) {
    console.error("❌ Ошибка чтения dataClassDZ.json:", e);
    return {};
  }
}
function saveDZ(dzData) {
  try {
    writeFileSync(DZ_FILE, JSON.stringify(dzData, null, 2), "utf8");
  } catch (e) {
    console.error("❌ Ошибка записи dataClassDZ.json:", e);
  }
}
function getUserById(userId) {
  const users = readUsers();
  return users[userId] || null;
}
function isAdmin(ctx) {
  const user = getUserById(ctx.from?.id);
  return user && user.role === "admin";
}
function normalizeText(text) {
  return (text || "").trim().toUpperCase();
}
function truncateText(text, maxLength = 12) {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 1) + '...';
}
function getDatesRange(daysCount = 7) {
  const dates = [];
  const start = new Date();
  for (let i = 0; i < daysCount; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date.toISOString().split('T')[0]);
  }
  return dates;
}
function getWeekLabel(targetDate) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(targetDate);
  const diffDays = Math.floor((target - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return "в прошлом";
  if (diffDays === 0) return "сегодня";
  if (diffDays === 1) return "завтра";
  if (diffDays <= 6) return "эта неделя";
  if (diffDays <= 13) return "следующая неделя";
  if (diffDays <= 27) return "через 2–3 недели";
  return "позже";
}
// === Обработка текстовых сообщений ===
bot.on("message", async (ctx) => {
  const textw = ctx.message?.text?.trim();
  if (!textw) return;

  // Команды через клавиатуру
  if (textw === "📆 Сегодня") return showTodayDZ(ctx);
  if (textw === "📅 Завтра") return showTomorrowDZ(ctx);
  if (textw === "📆 Неделя") return showWeekDZ(ctx);
  if (textw === "⏭️ Другая неделя") return showNextWeekDZ(ctx);
  if (textw === "🔍 Выбор дня") return showChoiceDay(ctx);
  if (textw === "📥 Всё ДЗ") return showChoiceDay(ctx); // ведёт к выбору даты
  if (textw === "📖 Расписание") return viewSchedule(ctx); // переиспользуй функцию
  if (textw === "👤 Профиль") return showMe(ctx);
  if (textw === "⚙️ Настройка") return showKeyboardConfig(ctx);

  const userId = ctx.from?.id;
  if (!userId) return;

  // === Обработка загрузки расписания ===
  if (ctx.session.uploadingSchedule) {
    const user = getUserById(userId);
    if (!user || user.role !== "admin") {
      delete ctx.session.uploadingSchedule;
      return;
    }

    if (!ctx.message?.photo) {
      await ctx.reply("❌ Отправьте именно фото (не файл и не текст).");
      return;
    }

    // Берём фото самого высокого качества
    const photo = ctx.message.photo[ctx.message.photo.length - 1];
    const photoId = photo.file_id;

    const dz = readDZ();
    const classKey = ctx.session.scheduleClass || user.class;
    if (!dz[classKey]) dz[classKey] = {};
    dz[classKey].schedule_photo_id = photoId;
    saveDZ(dz);

    // Очистка
    delete ctx.session.uploadingSchedule;
    delete ctx.session.scheduleClass;

    await ctx.reply("✅ Расписание успешно обновлено!", {
      reply_markup: {
        inline_keyboard: [[{ text: "🏠 В меню", callback_data: "main_menu" }]]
      }
    });
    return;
  }
  // === 1. Обработка шагов редактирования (только для админов!) ===
  if (ctx.session.editStep) {
    const user = getUserById(userId);
    if (!user || user.role !== "admin") {
      // Очистить сессию, если не админ
      delete ctx.session.editStep;
      delete ctx.session.editSubject;
      delete ctx.session.editDate;
      return;
    }

    if (ctx.session.editStep === "waiting_subject") {
      if (!ctx.message?.text) {
        await ctx.reply("❌ Отправьте название предмета текстом.");
        return;
      }
      let subject = ctx.message.text.trim();
      subject = subject.charAt(0).toUpperCase() + subject.slice(1).toLowerCase();

      ctx.session.editSubject = subject;
      ctx.session.editStep = "waiting_dz";

      await ctx.reply(`📝 Теперь отправьте домашнее задание по предмету <b>${subject}</b>:\n\n• Можно текст, фото, файл`, {
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

      let dzContent = ctx.message.text ||
                      ctx.message.caption ||
                      "Домашнее задание (файл/фото без описания)";

      const dz = readDZ();
      if (!dz[classKey]) dz[classKey] = {};
      if (!dz[classKey][dateKey]) dz[classKey][dateKey] = {};
      dz[classKey][dateKey][subject] = dzContent;
      saveDZ(dz);

      // Очистка сессии
      delete ctx.session.editStep;
      delete ctx.session.editSubject;
      delete ctx.session.editDate;

      await ctx.reply(`✅ ДЗ по предмету <b>${subject}</b> сохранено на ${day}.${month}.${year}!`, {
        parse_mode: "HTML",
        reply_markup: {
          inline_keyboard: [
            [{ text: "➕ Добавить ещё", callback_data: "edit_dz_panel" }],
            [{ text: "🏠 В меню", callback_data: "main_menu" }]
          ]
        }
      });
      return;
    }
  }

  // === 2. Обработка обычных команд ===
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
    EDIT: ["/EDIT", "РЕДАКТИРОВАТЬ", "EDIT"]
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
  // Команда /edit
  if (adminCommands.EDIT.some(cmd => text.includes(cmd))) {
    if (!isAdmin(ctx)) {
      await ctx.reply("🚫 Эта команда доступна только админам.");
      return;
    }
    await showEditPanel(ctx);
    return; // ← важно: не продолжать дальше!
  }

  // Остальные команды
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
  } else if (text === "АХУЕЛ?") {
    await ctx.reply("динахуй пидор");
  }
});

bot.start((ctx) => showStart(ctx));

// === ФУНКЦИИ ОТОБРАЖЕНИЯ ===

async function showStart(ctx) {
  const msg = "👋 Добро пожаловать!\n📚 Я — твой помощник с домашним заданием.\nЧтобы начать работу, пожалуйста, зарегистрируйся — или выбери действие ниже:";
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "👤 Создать профиль", callback_data: "reg_step1" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }],
        [{ text: "🛎 Помощь", callback_data: "help_and_command" }]
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

async function showMe(ctx) {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.reply("❌ Не удалось определить ваш ID.");
    return;
  }

  const users = readUsers();
  const user = users[userId];

  if (!user) {
    await ctx.reply("🚫 Вы не зарегистрированы. Используйте /reg для регистрации.");
    return;
  }

  const roleText = user.role === "admin" ? "🎓 Админ" : "🎒 Ученик";
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "Не указано";
  const username = user.username ? `@${user.username}` : "не указан";
  const regDate = new Date(user.registered_at).toLocaleDateString("ru-RU");

  const profileText = `
👤 <b>Ваши данные</b>:

• Имя: ${fullName}
• Юзернейм: ${username}
• Роль: ${roleText}
• Класс: ${user.class}
• Зарегистрирован: ${regDate}
  `.trim();

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🏠 В меню", callback_data: "main_menu" }],
        [{ text: "❌ Удалить профиль", callback_data: "confirm_delete_profile" }]
      ]
    }
  };

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    await ctx.editMessageText(profileText, { parse_mode: "HTML", ...keyboard });
  } else {
    await ctx.reply(profileText, { parse_mode: "HTML", ...keyboard });
  }
}

async function showRegStep1(ctx) {
  const userId = ctx.from?.id;
  const users = readUsers();
  if (users[userId]) {
    const msg = "✅ Вы уже зарегистрированы!";
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: "🏠 В главное меню", callback_data: "main_menu" }],
          [{ text: "❌ Удалить профиль", callback_data: "confirm_delete_profile" }]
        ]
      }
    };

    if (ctx.callbackQuery) {
      await ctx.answerCbQuery();
      await ctx.editMessageText(msg, keyboard);
    } else {
      await ctx.reply(msg, keyboard);
    }
    return;
  }

  const msg = `📝 Регистрация состоит из 5 шагов\n
📍 Текущий этап: 1/5\n
🛡️ Для админов — 6 шагов (6. Подтверждение админства ✅)`
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎬 Продолжить", callback_data: "continue_reg" },
          { text: "ℹ️ Подробнее", callback_data: "details_reg" }
        ],
        [{ text: "❌ Отмена", callback_data: "start_bot" }]
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

async function showMainMenu(ctx) {
  const userId = ctx.from?.id.toString();
  const user = getUserById(userId);
  const isAdminUser = user?.role === "admin";

  const msg = "🏠 Главное меню";

  const baseButtons = [
    [
      { text: "📆 Сегодня", callback_data: "cmd_day" },
      { text: "📅 Завтра", callback_data: "cmd_next_day" }
    ],
    [
      { text: "📆 Неделя", callback_data: "cmd_week" },
      { text: "⏭️ Другая неделя", callback_data: "cmd_next_week" }
    ],
    [{ text: "📖 Расписание", callback_data: "view_schedule" }],
    [
      { text: "🔍 Выбор дня", callback_data: "cmd_choice" },
      { text: "📥 Всё ДЗ", callback_data: "cmd_all" }
    ]
  ];

  // Добавляем админские кнопки, если пользователь — админ
  if (isAdminUser) {
    baseButtons.push([{ text: "📤 Отправить расписание", callback_data: "upload_schedule" }]);
    baseButtons.push([{ text: "✏️ Редактировать ДЗ", callback_data: "edit_dz_panel" }]);
  }

  // Общие служебные кнопки
  baseButtons.push([
    { text: "👤 Профиль", callback_data: "show_profile" },
    { text: "⚙️ Настройка", callback_data: "cmd_configure" }
  ]);

  // Кнопка для перехода к быстрой клавиатуре (reply keyboard)
  baseButtons.push([{ text: "⌨️ Открыть клавиатуру", callback_data: "show_reply_keyboard" }]);

  // Кнопка удаления профиля — внизу
  baseButtons.push([{ text: "❌ Удалить профиль", callback_data: "confirm_delete_profile" }]);

  const keyboard = {
    reply_markup: {
      inline_keyboard: baseButtons
    }
  };

  if (ctx.callbackQuery) {
    await ctx.answerCbQuery();
    const callbackMsg = ctx.callbackQuery.message;
    if (callbackMsg?.text) {
      await ctx.editMessageText(msg, keyboard);
    } else {
      try {
        await ctx.deleteMessage();
      } catch (e) {
        // Игнорируем, если нельзя удалить
      }
      await ctx.reply(msg, keyboard);
    }
  } else {
    await ctx.reply(msg, keyboard);
  }
}

async function showEditPanel(ctx) {
  const msg = `✏️ <b>Панель редактирования ДЗ</b>

Выберите дату, чтобы изменить домашнее задание для вашего класса.

Вы сможете:
• Добавить новое задание
• Удалить существующее

⚠️ Все изменения применяются мгновенно.
`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "▶️ Продолжить", callback_data: "edit_step_day" }],
        [
          { text: "ℹ️ Об этой панели", callback_data: "edit_help" },
          { text: "↩️ Назад", callback_data: "main_menu" }
        ],
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

async function showEditMonthSelection(ctx) {
  const months = [
    { text: "Янв (01)", callback_data: "edit_select_month_01" },
    { text: "Фев (02)", callback_data: "edit_select_month_02" },
    { text: "Мар (03)", callback_data: "edit_select_month_03" },
    { text: "Апр (04)", callback_data: "edit_select_month_04" },
    { text: "Май (05)", callback_data: "edit_select_month_05" },
    { text: "Июн (06)", callback_data: "edit_select_month_06" },
    { text: "Июл (07)", callback_data: "edit_select_month_07" },
    { text: "Авг (08)", callback_data: "edit_select_month_08" },
    { text: "Сен (09)", callback_data: "edit_select_month_09" },
    { text: "Окт (10)", callback_data: "edit_select_month_10" },
    { text: "Ноя (11)", callback_data: "edit_select_month_11" },
    { text: "Дек (12)", callback_data: "edit_select_month_12" }
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
}

async function showEditYearSelection(ctx) {
  const years = [
    { text: "2025", callback_data: "edit_select_year_2025" },
    { text: "2026", callback_data: "edit_select_year_2026" }
  ];
  const rows = [years, [{ text: "↩️ Назад", callback_data: "edit_step_month" }]];

  await ctx.answerCbQuery();
  await ctx.editMessageText("📅 Выберите <b>год</b>:", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows }
  });
}

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
  const user = getUserById(ctx.from.id);
  const classKey = user.class;

  // Форматируем день недели
  const days = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  const weekday = days[dateObj.getDay()];

  const msg = `✅ Выбрана дата: <b>${day}.${month}.${year}</b>
📅 День недели: <b>${weekday}</b>
🏫 Класс: <b>${classKey}</b>

Выберите действие:`;

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

function buildReplyKeyboard(userButtons) {
  if (!userButtons || userButtons.length === 0) {
    // Если ничего не выбрано — показываем минимум
    userButtons = ["📆 Сегодня", "📅 Завтра","⚙️ Настройка", "🏠 Меню"];
  }

  const rows = [];
  // Разбиваем по 2 кнопки в ряд (удобно на телефоне)
  for (let i = 0; i < userButtons.length; i += 2) {
    rows.push(userButtons.slice(i, i + 2));
  }
  return {
    reply_markup: {
      keyboard: rows,
      resize_keyboard: true, // подстраивает размер под экран
      one_time_keyboard: false // клавиатура всегда видна
    }
  };
}


bot.action(/toggle_kb_(.+)/, async (ctx) => {
  const cmd = ctx.match[1];
  const userId = ctx.from.id.toString();
  const users = readUsers();
  const user = users[userId];
  if (!user) return;

  let list = user.custom_keyboard || [];
  if (list.includes(cmd)) {
    list = list.filter(c => c !== cmd);
  } else {
    list.push(cmd);
  }
  user.custom_keyboard = list;
  saveUsers(users);

  await showKeyboardConfig(ctx);
});

bot.action("save_keyboard", async (ctx) => {
  await ctx.answerCbQuery("✅ Клавиатура сохранена!");
  const user = getUserById(ctx.from.id);
  await ctx.reply("Теперь вы можете использовать быструю клавиатуру внизу экрана.", buildReplyKeyboard(user?.custom_keyboard));
});

// КОНЕЦ ФУНКЦИЙ, ХОТЯ...//

bot.action(/edit_select_year_(\d+)/, async (ctx) => {
  const year = ctx.match[1];
  ctx.session.editDate.year = year;
  await showEditConfirmDate(ctx);
});
// Кнопка "назад" из года → месяц
bot.action("edit_step_month", (ctx) => showEditMonthSelection(ctx));

bot.action(/edit_select_month_(\d+)/, async (ctx) => {
  const month = ctx.match[1];
  ctx.session.editDate.month = month;
  await showEditYearSelection(ctx);
});

async function showHelp(ctx) {
  const msg = `ℹ️ Помощь и команды

💻 Регистрация 
При первом запуске бота пройдите регистрацию:
1. Выберите тип пользования (ученик / учитель)
2. Укажите букву своего класса (например, «А», «Б»)
3. Укажите номер класса (от 1 до 11)
4. Подтвердите выбор
   → Если вы админ, ваша заявка будет отправлена на модерацию и активируется после подтверждения

---

🚀 Основные команды

🎒 Для всех пользователей:
• /day или «сегодня» — домашка на сегодня  
• /next_day или «завтра» — домашка на завтра  
• /weekend или «неделя» — задания на эту неделю  
• /next_week или «другая неделя» — задания на следующую неделю  
• /choice или «выбор» — выбрать конкретный день  
• /all или «всё» — всё задание с сегодняшнего дня и далее  
• /menu или «меню» — вернуться в главное меню  
• /configure или «настройка» — настроить быструю клавиатуру  
• /profile или «профиль» — показать ваши данные (регистрация, класс, роль и т.д.)  
• /table или «таблица» — список пользователей вашего класса

🎓 Только для админов:
• /edit или «изменить» — редактировать домашнее задание  
• /delete или «удалить» — удалить задание  
• /add или «добавить» — добавить новый урок  
• /leave или «выйти» — покинуть админскую роль

💡 Команды работают в любом регистре: /StArT, «ЗаРеГиСтРиРоВаТьСя», «МЕНЮ» и т.д.
`;

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "🏠 В меню", callback_data: "main_menu" }, { text: "↩️ Назад", callback_data: "start_bot" }]
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

// Показать ДЗ на сегодня
async function showTodayDZ(ctx) {
  const user = getUserById(ctx.from?.id);
  if (!user) {
    await ctx.answerCbQuery("❌ Вы не зарегистрированы.");
    return;
  }

  const today = new Date();
  const dateKey = today.toISOString().split('T')[0]; // "YYYY-MM-DD"
  const classKey = user.class;

  const dz = readDZ();
  const lessons = dz[classKey]?.[dateKey];

  let msg;
  if (!lessons || Object.keys(lessons).length === 0) {
    msg = `📅 <b>Домашнее задание на сегодня (${today.toLocaleDateString("ru-RU")})</b>\n\n❌ Нет заданий.`;
  } else {
    let dzText = "";
    for (const [subject, task] of Object.entries(lessons)) {
      dzText += `\n📘 <b>${subject}</b>\n${task}\n`;
    }
    msg = `📅 <b>Домашнее задание на сегодня (${today.toLocaleDateString("ru-RU")})</b>\n${dzText}`;
  }

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

// Показать ДЗ на завтра
async function showTomorrowDZ(ctx) {
  const user = getUserById(ctx.from?.id);
  if (!user) {
    await ctx.answerCbQuery("❌ Вы не зарегистрированы.");
    return;
  }

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dateKey = tomorrow.toISOString().split('T')[0]; // "YYYY-MM-DD"
  const classKey = user.class;

  const dz = readDZ();
  const lessons = dz[classKey]?.[dateKey];

  let msg;
  if (!lessons || Object.keys(lessons).length === 0) {
    msg = `📅 <b>Домашнее задание на завтра (${tomorrow.toLocaleDateString("ru-RU")})</b>\n\n❌ Нет заданий.`;
  } else {
    let dzText = "";
    for (const [subject, task] of Object.entries(lessons)) {
      dzText += `\n📘 <b>${subject}</b>\n${task}\n`;
    }
    msg = `📅 <b>Домашнее задание на завтра (${tomorrow.toLocaleDateString("ru-RU")})</b>\n${dzText}`;
  }

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

async function showWeekDZ(ctx) {
  const user = getUserById(ctx.from?.id);
  if (!user) {
    await ctx.answerCbQuery("❌ Вы не зарегистрированы.");
    return;
  }

  const dates = getDatesRange(7); // сегодня + 6 дней = 7 дней
  const classKey = user.class;
  const dz = readDZ();

  let msg = `📆 <b>Домашнее задание на эту неделю</b>\n\n`;

  let hasAny = false;
  for (const dateStr of dates) {
    const dateObj = new Date(dateStr);
    const lessons = dz[classKey]?.[dateStr];
    if (lessons && Object.keys(lessons).length > 0) {
      hasAny = true;
      const dayName = dateObj.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "numeric" });
      msg += `📅 <b>${dayName}</b>\n`;
      for (const [subject, task] of Object.entries(lessons)) {
        msg += `📘 ${subject}\n${task}\n\n`;
      }
    }
  }

  if (!hasAny) {
    msg += "❌ Нет домашних заданий на эту неделю.";
  }

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

async function showNextWeekDZ(ctx) {
  const user = getUserById(ctx.from?.id);
  if (!user) {
    await ctx.answerCbQuery("❌ Вы не зарегистрированы.");
    return;
  }

  // Пропускаем 7 дней, берём следующие 7
  const dates = [];
  const start = new Date();
  for (let i = 7; i < 14; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    dates.push(date.toISOString().split('T')[0]);
  }

  const classKey = user.class;
  const dz = readDZ();

  let msg = `⏭️ <b>Домашнее задание на следующую неделю</b>\n\n`;

  let hasAny = false;
  for (const dateStr of dates) {
    const dateObj = new Date(dateStr);
    const lessons = dz[classKey]?.[dateStr];
    if (lessons && Object.keys(lessons).length > 0) {
      hasAny = true;
      const dayName = dateObj.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "numeric" });
      msg += `📅 <b>${dayName}</b>\n`;
      for (const [subject, task] of Object.entries(lessons)) {
        msg += `📘 ${subject}\n${task}\n\n`;
      }
    }
  }

  if (!hasAny) {
    msg += "❌ Нет домашних заданий на следующую неделю.";
  }

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

// Главное меню выбора
async function showChoiceDay(ctx) {
  const msg = `🔍 <b>Выбор дня для просмотра ДЗ</b>\n\nВыберите дату по шагам:`;
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "▶️ Продолжить", callback_data: "choice_step_day" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  };
  await ctx.answerCbQuery();
  await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
}

async function showKeyboardConfig(ctx) {
  const msg = `⚙️ <b>Настройка быстрой клавиатуры</b>\n\nВыберите, какие кнопки вы хотите видеть:`;
  
  const allButtons = [
    "📆 Сегодня", "📅 Завтра", "📆 Неделя", "⏭️ Другая неделя",
    "🔍 Выбор дня", "📥 Всё ДЗ", "🏠 Меню", "👤 Профиль"
  ];

  // Загружаем текущую настройку пользователя
  const userId = ctx.from.id.toString();
  const users = readUsers();
  const user = users[userId] || {};
  const current = user.custom_keyboard || allButtons;

  const inlineButtons = allButtons.map(btn => {
    const isActive = current.includes(btn);
    const prefix = isActive ? "✅ " : "⬜ ";
    return [{ text: prefix + btn, callback_data: `toggle_kb_${btn}` }];
  });

  inlineButtons.push([{ text: "💾 Сохранить", callback_data: "save_keyboard" }]);
  inlineButtons.push([{ text: "↩️ Назад", callback_data: "main_menu" }]);

  await ctx.reply(msg, {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: inlineButtons }
  });
}

// Переключение кнопки
bot.action(/toggle_kb_(.+)/, async (ctx) => {
  const button = ctx.match[1];
  const userId = ctx.from.id.toString();
  const users = readUsers();
  let user = users[userId];
  if (!user) return;

  let current = user.custom_keyboard || [
    "📆 Сегодня", "📅 Завтра", "📖 Расписание", "👤 Профиль"
  ];

  if (current.includes(button)) {
    current = current.filter(b => b !== button);
  } else {
    current.push(button);
  }

  user.custom_keyboard = current;
  saveUsers(users);

  // Обновляем сообщение с настройкой
  await showKeyboardConfig(ctx);
});

// Сохранение и применение
bot.action("save_keyboard", async (ctx) => {
  const userId = ctx.from.id.toString();
  const users = readUsers();
  const user = users[userId];
  const keyboard = user?.custom_keyboard || ["📆 Сегодня", "📅 Завтра", "📖 Расписание"];

  // Формируем клавиатуру по 2 кнопки в ряд
  const rows = [];
  for (let i = 0; i < keyboard.length; i += 2) {
    rows.push(keyboard.slice(i, i + 2));
  }
  rows.push(["⚙️ Настройка"]); // всегда оставляем кнопку настройки

  await ctx.answerCbQuery("✅ Клавиатура обновлена!");
  await ctx.reply("Ваша клавиатура изменена:", {
    reply_markup: {
      keyboard: rows,
      resize_keyboard: true
    }
  });
});

// Выбор дня
bot.action("choice_step_day", async (ctx) => {
  const days = [];
  for (let i = 1; i <= 31; i++) {
    days.push({ text: i < 10 ? `0${i}` : `${i}`, callback_data: `choice_select_day_${i}` });
  }
  const rows = [];
  for (let i = 0; i < days.length; i += 6) {
    rows.push(days.slice(i, i + 6));
  }
  rows.push([{ text: "↩️ Назад", callback_data: "cmd_choice" }]);
  await ctx.answerCbQuery();
  await ctx.editMessageText("📅 Выберите <b>день</b>:", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows }
  });
});

bot.action(/choice_select_day_(\d+)/, async (ctx) => {
  const day = ctx.match[1].padStart(2, '0');
  ctx.session.choiceDate = { day };
  await showChoiceMonth(ctx);
});

// Выбор месяца
async function showChoiceMonth(ctx) {
  const months = [
    { text: "Янв (01)", callback_data: "choice_select_month_01" },
    { text: "Фев (02)", callback_data: "choice_select_month_02" },
    { text: "Мар (03)", callback_data: "choice_select_month_03" },
    { text: "Апр (04)", callback_data: "choice_select_month_04" },
    { text: "Май (05)", callback_data: "choice_select_month_05" },
    { text: "Июн (06)", callback_data: "choice_select_month_06" },
    { text: "Июл (07)", callback_data: "choice_select_month_07" },
    { text: "Авг (08)", callback_data: "choice_select_month_08" },
    { text: "Сен (09)", callback_data: "choice_select_month_09" },
    { text: "Окт (10)", callback_data: "choice_select_month_10" },
    { text: "Ноя (11)", callback_data: "choice_select_month_11" },
    { text: "Дек (12)", callback_data: "choice_select_month_12" }
  ];
  const rows = [];
  for (let i = 0; i < months.length; i += 3) {
    rows.push(months.slice(i, i + 3));
  }
  rows.push([{ text: "↩️ Назад", callback_data: "choice_step_day" }]);
  await ctx.answerCbQuery();
  await ctx.editMessageText("📅 Выберите <b>месяц</b>:", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows }
  });
}

bot.action(/choice_select_month_(\d+)/, async (ctx) => {
  const month = ctx.match[1];
  ctx.session.choiceDate.month = month;
  await showChoiceYear(ctx);
});

// Выбор года
async function showChoiceYear(ctx) {
  const years = [
    { text: "2025", callback_data: "choice_select_year_2025" },
    { text: "2026", callback_data: "choice_select_year_2026" }
  ];
  const rows = [years, [{ text: "↩️ Назад", callback_data: "choice_step_month" }]];
  await ctx.answerCbQuery();
  await ctx.editMessageText("📅 Выберите <b>год</b>:", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows }
  });
}

bot.action("choice_step_month", (ctx) => showChoiceMonth(ctx));

bot.action(/choice_select_year_(\d+)/, async (ctx) => {
  const year = ctx.match[1];
  ctx.session.choiceDate.year = year;
  await showChoiceConfirm(ctx);
});

// Подтверждение и показ ДЗ
async function showChoiceConfirm(ctx) {
  const { day, month, year } = ctx.session.choiceDate;
  const dateStr = `${year}-${month}-${day}`;
  const dateObj = new Date(dateStr);
  
  // Проверка валидности даты
  if (isNaN(dateObj.getTime())) {
    await ctx.answerCbQuery("❌ Неверная дата");
    return;
  }

  const user = getUserById(ctx.from.id);
  const classKey = user.class;
  const dz = readDZ();
  const lessons = dz[classKey]?.[dateStr] || {};

  // День недели
  const days = ["Воскресенье", "Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота"];
  const weekday = days[dateObj.getDay()];
  const weekLabel = getWeekLabel(dateObj);

  let msg = `✅ <b>Выбрана дата: ${day}.${month}.${year}</b>\n📅 ${weekday} • ${weekLabel}\n🏫 Класс: ${classKey}\n\n`;
  
  if (Object.keys(lessons).length === 0) {
    msg += "❌ Нет домашнего задания.";
  } else {
    for (const [subject, task] of Object.entries(lessons)) {
      msg += `\n📘 <b>${subject}</b>\n${task}\n`;
    }
  }

  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: "📥 Всё ДЗ от этой даты", callback_data: "show_all_from_date" }],
        [{ text: "↩️ Выбрать другую дату", callback_data: "cmd_choice" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  };

  await ctx.answerCbQuery();
  await ctx.editMessageText(msg, { parse_mode: "HTML", ...keyboard });
}

// === CALLBACK ОБРАБОТЧИКИ ===
bot.action("start_bot", (ctx) => showStart(ctx));
bot.action("main_menu", (ctx) => showMainMenu(ctx));

bot.action("help_and_command", (ctx) => showHelp(ctx));
bot.action("reg_step1", (ctx) => showRegStep1(ctx));
bot.action("show_profile", (ctx) => showMe(ctx));
bot.action("edit_confirm_date", (ctx) => showEditConfirmDate(ctx));

bot.action("cmd_configure", (ctx) => showKeyboardConfig(ctx));
bot.action("cmd_day", (ctx) => showTodayDZ(ctx));
bot.action("cmd_next_day", (ctx) => showTomorrowDZ(ctx));
bot.action("cmd_week", (ctx) => showWeekDZ(ctx));
bot.action("cmd_next_week", (ctx) => showNextWeekDZ(ctx));
bot.action("cmd_choice", async (ctx) => {
  await ctx.answerCbQuery();
  await showChoiceDay(ctx);
});
bot.action("show_all_from_date", async (ctx) => {
  const { day, month, year } = ctx.session.choiceDate || {};
  if (!day || !month || !year) {
    await ctx.answerCbQuery("❌ Сессия устарела");
    return;
  }

  const startDate = new Date(`${year}-${month}-${day}`);
  const user = getUserById(ctx.from.id);
  const classKey = user.class;
  const dz = readDZ();

  // Получим все даты из dataClassDZ.json для этого класса
  const classDZ = dz[classKey] || {};
  const sortedDates = Object.keys(classDZ)
    .filter(date => new Date(date) >= startDate)
    .sort((a, b) => new Date(a) - new Date(b));

  let msg = `📥 <b>Всё ДЗ от ${day}.${month}.${year} и далее</b>\n\n`;
  let hasAny = false;

  for (const dateStr of sortedDates) {
    const lessons = classDZ[dateStr];
    if (Object.keys(lessons).length > 0) {
      hasAny = true;
      const dateObj = new Date(dateStr);
      const dayName = dateObj.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "numeric" });
      msg += `📅 <b>${dayName}</b>\n`;
      for (const [subject, task] of Object.entries(lessons)) {
        msg += `📘 ${subject}\n${task}\n\n`;
      }
    }
  }

  if (!hasAny) {
    msg += "❌ Нет заданий от этой даты.";
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
bot.action("cmd_all", async (ctx) => {
  await ctx.answerCbQuery();
  await showChoiceDay(ctx); // Перенаправляем в выбор даты
});

bot.action("continue_reg", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(`✨ Отлично! Шаг 2 из 5\n
🎒 Кто вы — пользователь или админ?`, {
    reply_markup: {
      inline_keyboard: [
        [
          { text: "🎒 Пользователь", callback_data: "fill_quest_user" },
          { text: "🎓 Админ", callback_data: "fill_quest_admin" }
        ],
        [
          { text: "↩️ Поменять класс", callback_data: "reg_step1" },
          { text: "🛎 Помощь", callback_data: "help_and_command" }
        ]
      ]
    }
  });
});

bot.action("upload_schedule", async (ctx) => {
  const user = getUserById(ctx.from?.id);
  if (!user || user.role !== "admin") {
    await ctx.answerCbQuery("🚫 Только для админов");
    return;
  }

  await ctx.answerCbQuery();
  await ctx.editMessageText("📤 Отправьте фото расписания.\n\n⚠️ Только одно фото. Старое будет заменено.", {
    reply_markup: {
      inline_keyboard: [[{ text: "↩️ Отмена", callback_data: "main_menu" }]]
    }
  });

  // Устанавливаем флаг в сессии
  ctx.session.uploadingSchedule = true;
  ctx.session.scheduleClass = user.class;
});

bot.action("view_schedule", async (ctx) => {
  const user = getUserById(ctx.from?.id);
  if (!user) {
    await ctx.answerCbQuery("❌ Вы не зарегистрированы.");
    return;
  }

  const dz = readDZ();
  const classKey = user.class;
  const photoId = dz[classKey]?.schedule_photo_id;

  if (!photoId) {
    await ctx.answerCbQuery();
    await ctx.editMessageText("📅 Расписание пока не добавлено админом.", {
      reply_markup: {
        inline_keyboard: [[{ text: "🏠 В меню", callback_data: "main_menu" }]]
      }
    });
    return;
  }

  try {
    await ctx.answerCbQuery();
    await ctx.deleteMessage(); // удаляем старое сообщение
    await ctx.replyWithPhoto(photoId, {
      caption: `📅 Расписание для класса ${classKey}`,
      reply_markup: {
        inline_keyboard: [[{ text: "🏠 В меню", callback_data: "main_menu" }]]
      }
    });
  } catch (e) {
    console.error("Ошибка отправки расписания:", e);
    await ctx.reply("❌ Не удалось загрузить расписание. Возможно, оно устарело.");
  }
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

  const dz = readDZ();
  if (!dz[classKey]?.[dateKey]?.[subject]) {
    await ctx.answerCbQuery("❌ Предмет уже удалён.");
    return;
  }

  delete dz[classKey][dateKey][subject];
  if (Object.keys(dz[classKey][dateKey]).length === 0) {
    delete dz[classKey][dateKey];
  }
  saveDZ(dz);

  // Очистка сессии
  delete ctx.session.lessonsToDelete;
  delete ctx.session.dzDateKey;
  delete ctx.session.dzClass;

  await ctx.answerCbQuery();
  await ctx.editMessageText(`✅ Предмет "${subject}" удалён.`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ Добавить ещё", callback_data: "edit_action_add" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  });
});

bot.action("edit_action_add", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText("✏️ Введите название предмета (например, «Алгебра»):", {
    reply_markup: {
      inline_keyboard: [[{ text: "↩️ Назад", callback_data: "edit_confirm_date" }]]
    }
  });
  ctx.session.editStep = "waiting_subject";
});

bot.action(/edit_delete_lesson_(.+)/, async (ctx) => {
  const encodedSubject = ctx.match[1];
  const subject = decodeURIComponent(encodedSubject);
  const { day, month, year } = ctx.session.editDate;
  const dateKey = `${year}-${month}-${day}`;
  const user = getUserById(ctx.from.id);
  const classKey = user.class;

  const dz = readDZ();
  if (!dz[classKey]?.[dateKey]?.[subject]) {
    await ctx.answerCbQuery("❌ Предмет не найден.");
    return;
  }

  delete dz[classKey][dateKey][subject];
  // Удаляем дату, если пусто
  if (Object.keys(dz[classKey][dateKey]).length === 0) {
    delete dz[classKey][dateKey];
  }
  saveDZ(dz);

  await ctx.answerCbQuery();
  await ctx.editMessageText(`✅ Предмет "${subject}" удалён.`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ Добавить ещё", callback_data: "edit_action_add" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  });
});

bot.action("edit_help", async (ctx) => {
  const msg = `ℹ️ <b>О панели редактирования</b>

1. Выберите дату по шагам: день → месяц → год.
2. На выбранную дату вы можете:
   • Добавить ДЗ по любому предмету
   • Удалить существующее ДЗ
3. Все изменения применяются сразу.
4. ДЗ видят только пользователи вашего класса.

💡 Совет: вводите предметы одинаково («Алгебра», а не «алгебра» или «АлГеБрА»).
`;
  await ctx.answerCbQuery();
  await ctx.editMessageText(msg, {
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[{ text: "↩️ Назад", callback_data: "edit_dz_panel" }]]
    }
  });
});

bot.action("fill_quest_user", async (ctx) => {
  ctx.session.role = "user";
  await showClassLetterSelection(ctx);
});

bot.action("fill_quest_admin", async (ctx) => {
  ctx.session.role = "admin";
  await showClassLetterSelection(ctx);
});

bot.action("edit_dz_panel", async (ctx) => {
  if (!isAdmin(ctx)) {
    await ctx.answerCbQuery("🚫 Только для админов");
    return;
  }
  await showEditPanel(ctx);
});

bot.action("confirm_delete_profile", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "⚠️ Вы уверены, что хотите удалить свой профиль?\nЭто действие нельзя отменить.",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Да, удалить", callback_data: "delete_profile" }],
          [{ text: "❌ Нет, отмена", callback_data: "show_profile" }]
        ]
      }
    }
  );
});

bot.action("delete_profile", async (ctx) => {
  const userId = ctx.from?.id.toString();
  if (!userId) {
    await ctx.answerCbQuery("❌ Не удалось определить ваш ID.");
    return;
  }

  const users = readUsers();
  if (!users[userId]) {
    await ctx.answerCbQuery("❌ Вы не зарегистрированы.");
    return;
  }

  // Удаляем пользователя
  delete users[userId];
  saveUsers(users);

  // Очистить сессию
  sessions.delete(userId);

  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "🗑️ Ваш профиль успешно удалён.\nВы можете зарегистрироваться заново в любой момент.",
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: "👤 Создать профиль", callback_data: "reg_step1" }],
          [{ text: "🛎 Помощь", callback_data: "show_help" }]

        ]
      }
    }
  );
});

bot.action("edit_action_delete", async (ctx) => {
  await ctx.answerCbQuery(); // ← сразу отвечаем!

  const { day, month, year } = ctx.session.editDate || {};
  if (!day || !month || !year) {
    await ctx.editMessageText("❌ Сессия устарела. Начните заново.", {
      reply_markup: { inline_keyboard: [[{ text: "✏️ Редактировать ДЗ", callback_data: "edit_dz_panel" }]] }
    });
    return;
  }

  const dateKey = `${year}-${month}-${day}`;
  const user = getUserById(ctx.from.id);
  const classKey = user.class;

  const dz = readDZ();
  const lessons = dz[classKey]?.[dateKey] || {};
  const lessonNames = Object.keys(lessons);

  if (lessonNames.length === 0) {
    await ctx.editMessageText("❌ На эту дату нет домашнего задания.", {
      reply_markup: { inline_keyboard: [[{ text: "↩️ Назад", callback_data: "edit_confirm_date" }]] }
    });
    return;
  }

  // Генерируем кнопки с обрезанным текстом и индексом в callback_data
  const buttons = lessonNames.map((subject, index) => ({
    text: truncateText(subject), // ← обрезаем до 12 символов
    callback_data: `edit_del_${index}` // ← короткий и безопасный
  }));

  const rows = buttons.map(b => [b]);
  rows.push([{ text: "↩️ Назад", callback_data: "edit_confirm_date" }]);

  await ctx.editMessageText("🗑️ Выберите предмет для удаления:", {
    reply_markup: { inline_keyboard: rows }
  });

  // Сохраняем список в сессии
  ctx.session.lessonsToDelete = lessonNames;
  ctx.session.dzDateKey = dateKey;
  ctx.session.dzClass = classKey;
});

bot.action(/edit_delete_lesson_(.+)/, async (ctx) => {
  const encodedSubject = ctx.match[1];
  const subject = decodeURIComponent(encodedSubject);
  const { day, month, year } = ctx.session.editDate;
  const dateKey = `${year}-${month}-${day}`;
  const user = getUserById(ctx.from.id);
  const classKey = user.class;

  const dz = readDZ();
  if (!dz[classKey]?.[dateKey]?.[subject]) {
    await ctx.answerCbQuery("❌ Предмет не найден.");
    return;
  }

  delete dz[classKey][dateKey][subject];
  // Удаляем дату, если пусто
  if (Object.keys(dz[classKey][dateKey]).length === 0) {
    delete dz[classKey][dateKey];
  }
  saveDZ(dz);

  await ctx.answerCbQuery();
  await ctx.editMessageText(`✅ Предмет "${subject}" удалён.`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: "➕ Добавить ещё", callback_data: "edit_action_add" }],
        [{ text: "🏠 В меню", callback_data: "main_menu" }]
      ]
    }
  });
});


async function showClassLetterSelection(ctx) {
  const roleText = ctx.session.role === "admin" ? "Админ" : "Пользователь";
  await ctx.answerCbQuery();
  await ctx.editMessageText(`✅ Вы выбрали роль: *${roleText}*\n🎯Выберите вашу букву класса:`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [
          { text: " А ", callback_data: "continue_class_a" },
          { text: " Б ", callback_data: "continue_class_b" },
          { text: " В ", callback_data: "continue_class_v" }
        ],
        [
          { text: "Г", callback_data: "continue_class_g" },
          { text: "Д", callback_data: "continue_class_d" },
          { text: "Е", callback_data: "continue_class_e" }
        ],
        [{ text: "↩️ Назад", callback_data: "continue_reg" }]
      ]
    }
  });
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
  await ctx.editMessageText(`✅ Вы выбрали букву: *${letter}*\n🔢 Теперь выберите номер класса:`, {
    parse_mode: "Markdown",
    reply_markup: {
      inline_keyboard: [
        [{ text: "4", callback_data: "class_num_4" }, { text: "5", callback_data: "class_num_5" }, { text: "6", callback_data: "class_num_6" }],
        [{ text: "7", callback_data: "class_num_7" }, { text: "8", callback_data: "class_num_8" }, { text: "9", callback_data: "class_num_9" }],
        [{ text: "10", callback_data: "class_num_10" }, { text: "11", callback_data: "class_num_11" }],
        [{ text: "↩️ Назад", callback_data: "fill_quest_user" }]
      ]
    }
  });
});

bot.action(/class_num_(\d+)/, async (ctx) => {
  // 🔹 Сразу отвечаем!
  await ctx.answerCbQuery();

  const number = ctx.match[1];
  const validNumbers = ["4", "5", "6", "7", "8", "9", "10", "11"];
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
  const roleText = ctx.session.role === "admin" ? "Админ" : "Пользователь";
  await ctx.editMessageText(
    `✅ Отлично!\nВаша роль: *${roleText}*\nВаш класс: *${fullClass}*\n\nТеперь можно подтвердить регистрацию.`,
    {
      parse_mode: "Markdown",
      reply_markup: {
        inline_keyboard: [
          [{ text: "✅ Подтвердить", callback_data: "confirm_class" }],
          [{ text: "🔄 Изменить букву", callback_data: "fill_quest_user" }]
        ]
      }
    }
  );
});

//ваажно ыа уаы уаыуаыуа ыу аыу аыа ыа ыуа ыу ыуа ыуф цфц фц фц фцв фц ц
bot.action("edit_step_day", async (ctx) => {
  const days = [];
  for (let i = 1; i <= 31; i++) {
    days.push({ text: i < 10 ? `0${i}` : `${i}`, callback_data: `edit_select_day_${i}` });
  }

  const rows = [];
  for (let i = 0; i < days.length; i += 6) {
    rows.push(days.slice(i, i + 6));
  }

  rows.push([{ text: "↩️ Назад", callback_data: "edit_dz_panel" }]);

  await ctx.answerCbQuery();
  await ctx.editMessageText("📅 Выберите <b>день</b>:", {
    parse_mode: "HTML",
    reply_markup: { inline_keyboard: rows }
  });
});

bot.action(/edit_select_day_(\d+)/, async (ctx) => {
  const day = ctx.match[1].padStart(2, '0');
  ctx.session.editDate = { day };
  await showEditMonthSelection(ctx);
});

// === Подтверждение регистрации с модерацией админов ===
bot.action("confirm_class", async (ctx) => {
  const userId = ctx.from?.id;
  if (!userId) {
    await ctx.answerCbQuery("❌ Не удалось определить ваш ID");
    return;
  }

  if (!ctx.session?.class || !ctx.session?.role) {
    await ctx.answerCbQuery("❌ Данные не заполнены");
    return;
  }

  const users = readUsers();
  if (users[userId]) {
    await ctx.answerCbQuery("❌ Вы уже зарегистрированы!");
    return;
  }

  const userData = {
    id: userId,
    username: ctx.from.username || null,
    first_name: ctx.from.first_name || null,
    last_name: ctx.from.last_name || null,
    class: ctx.session.class,
    registered_at: new Date().toISOString(),
    message_id: ctx.callbackQuery?.message?.message_id,
    chat_type: ctx.chat?.type, // на случай, если вызван не из ЛС
    chat_id: ctx.from.id // всегда from.id для ЛС
  };

  if (ctx.session.role === "admin") {
    userData.role = "pending_admin";
    users[userId] = userData;
    saveUsers(users);

    const adminMsg = `
🆕 Запрос на админство!
👤 Пользователь: ${userData.first_name || ""} ${userData.last_name || ""}
🆔 ID: ${userId}
🏫 Класс: ${userData.class}
Юзернейм: ${userData.username ? `@${userData.username}` : "не указан"}
    `.trim();

    // ✅ Отправляем запрос ВСЕМ админам из config.adminChatIds
    for (const adminId of config.adminChatIds) {
      try {
        await ctx.telegram.sendMessage(
          adminId,
          adminMsg,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: "✅ Одобрить", callback_data: `approve_admin_${userId}` },
                  { text: "❌ Отклонить", callback_data: `reject_admin_${userId}` }
                ]
              ]
            }
          }
        );
      } catch (e) {
        console.warn(`Не удалось отправить уведомление админу ${adminId}:`, e.message);
      }
    }

    // Сообщение кандидату
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `📨 Заявка на админство отправлена!

🚀 Ожидайте подтверждения от админов.

❗️ Пока вы зарегистрированы как пользователь.

💡 Чтобы быстрее подтвердили — напишите админам напрямую:`,
      {
        reply_markup: {
          inline_keyboard: [
            [{ text: "🏠 В меню", callback_data: "main_menu" }],
            [{ text: "😍 Написать Санечке", url: "https://t.me/Sashshih" }],
            [{ text: "⚠️ Написать Сергею", url: "https://t.me/Cageyserg" }]
          ]
        }
      }
    );
  } else {
    // Обычная регистрация
    userData.role = "user";
    users[userId] = userData;
    saveUsers(users);

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `✅ Регистрация завершена! Добро пожаловать в *${ctx.session.class}* класс!`,
      {
        parse_mode: "Markdown",
        reply_markup: {
          inline_keyboard: [[{ text: "🏠 В меню", callback_data: "main_menu" }]]
        }
      }
    );
  }
});

bot.action("show_reply_keyboard", async (ctx) => {
  await ctx.answerCbQuery();
  const user = getUserById(ctx.from.id);
  const kb = user?.custom_keyboard || [];
  await ctx.reply("⌨️ Ваша быстрая клавиатура:", buildReplyKeyboard(kb));
});

bot.action("details_reg", async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText(
    "📋 Подробнее о регистрации:\n\n" +
    "1. Имя\n" +
    "2. Возраст\n" +
    "3. Класс\n" +
    "4. Никнейм\n" +
    "5. Согласие с правилами\n\n" +
    "Для админов добавляется:\n" +
    "6. Подтверждение админства (через модерацию)",
    {
      reply_markup: {
        inline_keyboard: [[{ text: "↩️ Назад", callback_data: "reg_step1" }]]
      }
    }
  );
});

// === Модерация админов ===
bot.action(/approve_admin_(\d+)/, async (ctx) => {
  const targetUserId = ctx.match[1];
  const users = readUsers();
  const user = users[targetUserId];

  if (!user || user.role !== "pending_admin") {
    await ctx.answerCbQuery("❌ Пользователь не найден или уже обработан.");
    return;
  }

  user.role = "admin";
  saveUsers(users);

  try {
    await ctx.telegram.editMessageText(
      user.chat_id,
      user.message_id,
      undefined,
      `✅ Ваша заявка на админство одобрена!\nВы теперь админ класса ${user.class}.`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "🏠 В меню", callback_data: "main_menu" }]]
        }
      }
    );
  } catch (e) {
    console.warn("Не удалось обновить сообщение у пользователя:", e.message);
  }

  await ctx.answerCbQuery();
  await ctx.editMessageText(`✅ Админ ${user.first_name || "пользователь"} одобрен.`);
});

bot.action(/reject_admin_(\d+)/, async (ctx) => {
  const targetUserId = ctx.match[1];
  const users = readUsers();
  const user = users[targetUserId];

  if (!user || user.role !== "pending_admin") {
    await ctx.answerCbQuery("❌ Пользователь не найден или уже обработан.");
    return;
  }

  user.role = "user";
  saveUsers(users);

  try {
    await ctx.telegram.editMessageText(
      user.chat_id,
      user.message_id,
      undefined,
      `❌ Ваша заявка на админство отклонена.\nВы зарегистрированы как обычный пользователь.`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: "🏠 В меню", callback_data: "main_menu" }]]
        }
      }
    );
  } catch (e) {
    console.warn("Не удалось обновить сообщение у пользователя:", e.message);
  }

  await ctx.answerCbQuery();
  await ctx.editMessageText(`❌ Заявка отклонена.`);
});

// === ЗАПУСК ===
bot.launch();
console.log("✅ Бот запущен! Ожидание сообщений...");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));