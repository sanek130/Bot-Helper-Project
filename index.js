import 'dotenv/config';
import { Telegraf, Markup, session } from 'telegraf';
import * as config from './config.js';
import mongoose from 'mongoose';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

// Аналог __dirname для ES-модулей
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

  import { User } from './models/User.js';
  import { Homework } from './models/Homework.js';

  import { initNotifications } from './notifications.js';
  import webAppApi from './webapp-api.js';
  import {
    EMOJI,
    SUBJECT_ICONS,
    QUICK_SUBJECTS,
    BTN,
    DEFAULT_KEYBOARD,
    ALL_KEYBOARD_BUTTONS,
    getSubjectIcon,
    toDateKey,
    addDaysToKey,
    formatDateShort,
    formatDateFull,
    dayTitle,
    buildDayCard,
    buildDayCopyText,
    dayNavButtons,
    menuFooter,
    botCommands,
  } from './ui.js';

  const bot = new Telegraf(config.telegramToken);
  const app = express();
  const PORT = process.env.PORT || 5000;

// 🔥 Парсер для чтения JSON из запросов Web App (должен быть ДО роутеров и статики)
app.use(express.json());

// Health endpoints for UptimeRobot/Render
app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/health", (req, res) => {
    res.status(200).json({
        ok: true,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Web App - раздача статических файлов
app.use('/app', express.static(path.join(__dirname, 'webapp')));
app.get('/app', (req, res) => {
  res.sendFile(path.join(__dirname, 'webapp', 'index.html'));
});

// Подключение API для Web App (теперь req.body будет работать)
app.use('/api', webAppApi);

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

  async function safeEditOrReply(ctx, text, options = {}) {
      await safeAnswerCb(ctx);
      
      try {
          if (ctx.callbackQuery?.message?.text) {
              return await ctx.editMessageText(text, options);
          }
      } catch (e) {
          console.warn('⚠️ editMessageText failed:', e.message);
      }
      
      try {
          await ctx.deleteMessage().catch(() => {});
      } catch (e) {}
      
      return await ctx.reply(text, options);
  }

  /* в будующем пригодится
  mongoose.connection.on("disconnected", () => {
    console.log("MongoDB отключена. Попытка переподключения...");
  });
  */

  mongoose.connection.on("error", (err) => {
    console.error("😰 Ошибка MongoDB:", err);
  });

  bot.use(session());

  // Антиспам: максимум 30 сообщений в минуту на пользователя
  const RATE_LIMIT_MAX_PER_MINUTE = 30;
  const RATE_LIMIT_WINDOW_MS = 60_000;
  const rateLimitBuckets = new Map(); // userId -> { count, resetAt, lastWarnAt }

  bot.use(async (ctx, next) => {
      // Ограничиваем только входящие сообщения (не callback_query и т.п.)
      if (!ctx.from || ctx.updateType !== "message") return next();

      const userId = String(ctx.from.id);
      const now = Date.now();

      const bucket = rateLimitBuckets.get(userId) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS, lastWarnAt: 0 };
      if (now >= bucket.resetAt) {
          bucket.count = 0;
          bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
          bucket.lastWarnAt = 0;
      }

      bucket.count += 1;
      rateLimitBuckets.set(userId, bucket);

      if (bucket.count > RATE_LIMIT_MAX_PER_MINUTE) {
          // Чтобы не усугублять спам, предупреждаем не чаще раза в ~3 секунды
          if (now - bucket.lastWarnAt > 3000) {
              const secondsLeft = Math.ceil((bucket.resetAt - now) / 1000);
              bucket.lastWarnAt = now;
              rateLimitBuckets.set(userId, bucket);
              await ctx.reply(`⏳ Слишком много сообщений. Лимит: ${RATE_LIMIT_MAX_PER_MINUTE} в минуту.\nПопробуйте снова через ${secondsLeft} сек.`);
          }
          return;
      }

      return next();
  });

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
      try {
          const userId = ctx.from?.id.toString();
          const text = ctx.message?.text || ctx.message?.caption;
          const hasPhoto = !!ctx.message?.photo;
          
          if (!text && !hasPhoto) return;

          const user = await getUserById(userId);
          const normalizedText = text ? normalizeText(text) : '';

          if (ctx.session.uploadingSchedule) {
              await handleScheduleUpload(ctx, user, hasPhoto);
              return;
          }

          if (ctx.session.editStep) {
              await handleHomeworkEdit(ctx, user, text, hasPhoto);
              return;
          }

          if (!text) return;
          if (['/START', 'НАЧАТЬ', 'СТАРТ'].includes(normalizedText)) {
              await showStart(ctx);
          } 
          else if (['/REG', 'ЗАРЕГИСТРИРОВАТЬСЯ'].includes(normalizedText)) {
              await showRegStep1(ctx);
          } 
          else if (['/MENU', 'МЕНЮ'].includes(normalizedText)) {
              await showMainMenu(ctx);
          } 
          else if (['/HELP', 'ПОМОЩЬ'].includes(normalizedText)) {
              await showHelp(ctx);
          } 
          else if (['/ME', 'ПРОФИЛЬ', 'Я', 'АККАУНТ'].includes(normalizedText)) {
              await showMe(ctx);
          } 
          else if (['/DAY', 'СЕГОДНЯ', 'СЕЙЧАС', 'ЭТОТ'].includes(normalizedText)) {
              await showTodayDZ(ctx);
          } 
          else if (['/NEXT_DAY', 'ЗАВТРА'].includes(normalizedText)) {
              await showTomorrowDZ(ctx);
          } 
          else if (['/WEEKEND', 'НЕДЕЛЯ'].includes(normalizedText)) {
              await showWeekDZ(ctx);
          } 
          else if (['/NEXT_WEEK', 'ДРУГАЯ НЕДЕЛЯ'].includes(normalizedText)) {
              await showNextWeekDZ(ctx);
          }
          else if (['/SCHEDULE', 'РАСПИСАНИЕ'].includes(normalizedText)) {
              await viewSchedule(ctx);
          }
          else if (['/EDIT', 'РЕДАКТИРОВАТЬ'].includes(normalizedText)) {
              if (user?.role === 'admin') {
                  await showEditPanel(ctx);
              } else {
                  await ctx.reply(`${EMOJI.no} Эта команда только для администраторов.`);
              }
          } 
          else if (['/STATS', 'СТАТИСТИКА'].includes(normalizedText)) {
              if (user?.role === 'admin') {
                  await showAdminStats(ctx);
              } else {
                  await ctx.reply(`${EMOJI.no} Эта команда только для администраторов.`);
              }
          }
          else if (['/WEB', 'ВЕБ', 'WEB', 'ВЕРСИЯ'].includes(normalizedText)) {
              await showWebApp(ctx);
          }
          else if (text === BTN.today || text === '📆 Сегодня') {
              await showTodayDZ(ctx);
          } 
          else if (text === BTN.tomorrow || text === '📅 Завтра') {
              await showTomorrowDZ(ctx);
          } 
          else if (text === BTN.week || text === '📆 Неделя') {
              await showWeekDZ(ctx);
          } 
          else if (text === BTN.nextWeek || text === '⏭️ Другая неделя') {
              await showNextWeekDZ(ctx);
          } 
          else if (text === BTN.choice || text === '🔍 Выбор дня') {
              await showDatePicker(ctx, 0, false);
          } 
          else if (text === BTN.all || text === '📥 Всё ДЗ') {
              await showAllHomeworkFromToday(ctx);
          } 
          else if (text === BTN.schedule || text === '📖 Расписание' || text === '🗂 Расписание') {
              await viewSchedule(ctx);
          } 
          else if (text === BTN.profile || text === '👤 Профиль') {
              await showMe(ctx);
          } 
          else if (text === BTN.settings || text === '⚙️ Настройка') {
              await showKeyboardConfig(ctx);
          } 
          else if (text === BTN.menu || text === '🏠 Меню') {
              await showMainMenu(ctx);
          } 
          else if (text === BTN.register || text === '📝 Зарегистрироваться') {
              await showRegStep1(ctx);
          }

      } catch (error) {
          console.error('❌ Ошибка в bot.on("message"):', error);
      }
  });

  async function handleScheduleUpload(ctx, user, hasPhoto) {
      if (!user || user.role !== "admin") {
          clearSession(ctx, ['uploadingSchedule', 'scheduleClass']);
          await ctx.reply("❌ У вас нет прав для загрузки расписания.");
          return;
      }

      if (hasPhoto) {
          try {
              const photo = ctx.message.photo[ctx.message.photo.length - 1];
              const photoId = photo.file_id;
              const classKey = ctx.session.scheduleClass || user.class;

              await setSchedulePhotoId(classKey, photoId);
              clearSession(ctx, ['uploadingSchedule', 'scheduleClass']);

              const keyboard = Markup.inlineKeyboard([
                  [Markup.button.callback('📖 Посмотреть расписание', 'view_schedule')],
                  [Markup.button.callback('🏠 В меню', 'main_menu')]
              ]);

              await ctx.reply("✅ *Расписание успешно обновлено!*\n\n" +
                  `🏫 Класс: ${classKey}\n` +
                  `📅 Обновлено: ${new Date().toLocaleDateString('ru-RU')}`, {
                  parse_mode: 'Markdown',
                  ...keyboard
              });
          } catch (error) {
              console.error('Ошибка сохранения расписания:', error);
              await ctx.reply("❌ Произошла ошибка при сохранении. Попробуйте ещё раз.");
          }
      } else {
          await ctx.reply("❌ Пожалуйста, отправьте именно *фото* расписания (не файл и не текст).", {
              parse_mode: 'Markdown'
          });
      }
  }

  async function handleHomeworkEdit(ctx, user, text, hasPhoto) {
      if (!user || user.role !== "admin") {
          clearEditSession(ctx);
          await ctx.reply("❌ У вас нет прав для редактирования ДЗ.");
          return;
      }

      if (ctx.session.editStep === "waiting_subject_for_add") {
          if (!text) {
              await ctx.reply("❌ Отправьте название предмета *текстом*.\nНапример: `Алгебра`, `Физика`", {
                  parse_mode: 'Markdown'
              });
              return;
          }

          const subject = text.trim();
          ctx.session.selectedSubject = subject;
          ctx.session.editStep = "waiting_dz_for_add";

          const keyboard = Markup.inlineKeyboard([
              [Markup.button.callback('❌ Отмена', 'edit_dz_panel')]
          ]);

          await ctx.reply(`✏️ *Предмет:* ${subject}\n📅 *Дата:* ${ctx.session.selectedDate}\n\n` +
              `Теперь отправьте домашнее задание:\n` +
              `• Текстом\n` +
              `• Или фото с подписью`, {
              parse_mode: 'Markdown',
              ...keyboard
          });
          return;
      }

      if (ctx.session.editStep === "waiting_dz_for_add") {
          try {
              const dateStr = ctx.session.selectedDate;
              const subject = ctx.session.selectedSubject;
              const classKey = user.class;

              let taskContent;
              
              if (hasPhoto) {
                  const photo = ctx.message.photo[ctx.message.photo.length - 1];
                  taskContent = {
                      type: 'photo',
                      photo_id: photo.file_id,
                      text: text || "Домашнее задание с фото"
                  };
              } else {
                  taskContent = {
                      type: 'text',
                      text: text
                  };
              }

              const dz = await getClassHomework(classKey);
              if (!dz[dateStr]) dz[dateStr] = {};
              dz[dateStr][subject] = taskContent;

              await saveClassHomework(classKey, dz);

              clearEditSession(ctx);

              const keyboard = Markup.inlineKeyboard([
                  [Markup.button.callback('➕ Добавить ещё', 'add_homework')],
                  [Markup.button.callback('📋 Посмотреть ДЗ', `show_day_${dateStr}`)],
                  [Markup.button.callback('🏠 В меню', 'main_menu')]
              ]);

              await ctx.reply("✅ *ДЗ добавлено!*\n\n" +
                  `📚 Предмет: ${subject}\n` +
                  `📅 Дата: ${dateStr}`, {
                  parse_mode: 'Markdown',
                  ...keyboard
              });

          } catch (error) {
              console.error('Ошибка сохранения ДЗ:', error);
              await ctx.reply("❌ Ошибка при сохранении ДЗ. Попробуйте ещё раз.");
          }
          return;
      }
  }

  function clearSession(ctx, keys) {
      keys.forEach(key => delete ctx.session[key]);
  }

  function clearEditSession(ctx) {
      clearSession(ctx, ['editStep', 'selectedSubject', 'selectedDate']);
  }

  async function safeAnswerCb(ctx, text = '') {
      try {
          await ctx.answerCbQuery(text);
      } catch (err) {
          if (err.description?.includes('query is too old')) {
              console.warn('Ignored stale callback query');
          } else {
              console.error('Failed to answer callback:', err.message);
          }
      }
  }

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
              { 
                  schedule_photo_id: photoId, 
                  updated_at: new Date() 
              },
              { upsert: true, new: true }
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
      await ctx.reply(`${EMOJI.no} Сначала зарегистрируйся.`, {
        reply_markup: {
          inline_keyboard: [[{ text: BTN.register, callback_data: "reg_step1" }]]
        }
      });
      return;
    }
    
    const todayKey = toDateKey();
    const dz = await getClassHomework(user.class);
    
    const allDates = Object.keys(dz)
      .filter(dateStr => dateStr >= todayKey)
      .sort((a, b) => a.localeCompare(b));
    
    if (allDates.length === 0) {
      const msg = `${EMOJI.homework} *Всё ДЗ*\n${EMOJI.school} ${user.class}\n\nНачиная с сегодня заданий нет.`;
      const keyboard = {
        reply_markup: {
          inline_keyboard: [
            [{ text: BTN.today, callback_data: "cmd_day" }, { text: BTN.tomorrow, callback_data: "cmd_next_day" }],
            ...menuFooter()
          ]
        }
      };
      if (ctx.callbackQuery) {
        await safeAnswerCb(ctx);
        await ctx.editMessageText(msg, { ...keyboard, parse_mode: "Markdown" });
      } else {
        await ctx.reply(msg, { ...keyboard, parse_mode: "Markdown" });
      }
      return;
    }

    // List dates as buttons instead of one huge message
    const buttons = allDates.slice(0, 14).map(dateStr => [{
      text: `${EMOJI.day} ${dayTitle(dateStr, todayKey)} · ${Object.keys(dz[dateStr]).length}`,
      callback_data: `show_day_${dateStr}`
    }]);
    buttons.push([{ text: BTN.today, callback_data: "cmd_day" }, { text: BTN.tomorrow, callback_data: "cmd_next_day" }]);
    buttons.push(...menuFooter());

    const msg = `${EMOJI.homework} *Всё ДЗ от сегодня*\n${EMOJI.school} ${user.class}\n\nВыбери день:`;
    
    await updateUserStats(userId, 'view_homework');
    
    if (ctx.callbackQuery) {
      await safeAnswerCb(ctx);
      await ctx.editMessageText(msg, { reply_markup: { inline_keyboard: buttons }, parse_mode: "Markdown" });
    } else {
      await ctx.reply(msg, { reply_markup: { inline_keyboard: buttons }, parse_mode: "Markdown" });
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
      await ctx.reply(`${EMOJI.no} Сначала зарегистрируйся.`, {
        reply_markup: {
          inline_keyboard: [[{ text: BTN.register, callback_data: "reg_step1" }]]
        }
      });
      return;
    }

    const todayKey = toDateKey();
    const dz = await getClassHomework(user.class);
    const startKey = addDaysToKey(todayKey, weekOffset * 7);

    const dates = [];
    for (let i = 0; i < 7; i++) {
      dates.push(addDaysToKey(startKey, i));
    }

    const buttons = [];
    const weekDays = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];

    const headerRow = dates.map((dateStr) => {
      const [y, m, d] = dateStr.split('-').map(Number);
      const dow = new Date(y, m - 1, d).getDay();
      return { text: weekDays[dow], callback_data: "noop" };
    });
    buttons.push(headerRow);

    const callbackPrefix = isEditMode ? "add_hw_date_" : "show_day_";
    const dateRow = dates.map((dateStr) => {
      const day = Number(dateStr.split('-')[2]);
      const hasDz = dz[dateStr] && Object.keys(dz[dateStr]).length > 0;
      let label = String(day);
      if (dateStr === todayKey) label = `[${day}]`;
      else if (hasDz) label = `${day}•`;
      return { text: label, callback_data: `${callbackPrefix}${dateStr}` };
    });
    buttons.push(dateRow);

    const startDay = Number(dates[0].split('-')[2]);
    const endDay = Number(dates[6].split('-')[2]);
    const startMonth = Number(dates[0].split('-')[1]);
    const endMonth = Number(dates[6].split('-')[1]);

    let periodText;
    if (startMonth === endMonth) {
      periodText = `${startDay}-${endDay} ${getMonthName(startMonth)}`;
    } else {
      periodText = `${startDay} ${getMonthName(startMonth)} - ${endDay} ${getMonthName(endMonth)}`;
    }

    const navRow = [];
    if (weekOffset > 0) {
      navRow.push({ text: `${EMOJI.back} Назад`, callback_data: `week_nav_${weekOffset - 1}_${isEditMode}` });
    }
    navRow.push({ text: periodText, callback_data: "noop" });
    if (weekOffset < 8) {
      navRow.push({ text: "Вперёд →", callback_data: `week_nav_${weekOffset + 1}_${isEditMode}` });
    }
    buttons.push(navRow);
    buttons.push(...menuFooter());

    const msg = `${EMOJI.day} *${isEditMode ? 'Дата для ДЗ' : 'Выбор дня'}*\n\n` +
      `Выбери день. [число] — сегодня, • — есть ДЗ.`;

    if (ctx.callbackQuery) {
      await safeAnswerCb(ctx);
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

  function getDoneSet(user, dateStr) {
    const list = user?.completed_homework?.[dateStr];
    return new Set(Array.isArray(list) ? list : []);
  }

  async function toggleHomeworkDone(user, dateStr, subject) {
    const completed = { ...(user.completed_homework || {}) };
    const list = Array.isArray(completed[dateStr]) ? [...completed[dateStr]] : [];
    const idx = list.indexOf(subject);
    if (idx === -1) list.push(subject);
    else list.splice(idx, 1);
    completed[dateStr] = list;
    await User.updateOne({ id: user.id }, { completed_homework: completed });
    return idx === -1;
  }

  function buildChecklistRows(dateStr, dayDZ, doneSet) {
    if (!dayDZ || Object.keys(dayDZ).length === 0) return [];
    const subjects = Object.keys(dayDZ);
    const rows = [];
    subjects.forEach((subject, i) => {
      const done = doneSet.has(subject);
      rows.push([{
        text: done ? `↩️ ${subject}` : `${EMOJI.ok} ${subject}`,
        callback_data: `toggle_done_${dateStr}_${i}`
      }]);
    });
    return rows.slice(0, 10);
  }

  async function replyOrEdit(ctx, msg, keyboard) {
    const options = { ...keyboard, parse_mode: "Markdown" };
    if (ctx.callbackQuery) {
      await safeAnswerCb(ctx);
      try {
        if (ctx.callbackQuery.message?.text) {
          await ctx.editMessageText(msg, options);
          return;
        }
      } catch (e) {}
      try { await ctx.deleteMessage(); } catch {}
      await ctx.reply(msg, options);
    } else {
      await ctx.reply(msg, options);
    }
  }

  async function showStart(ctx) {
    const userId = ctx.from?.id;
    const user = await getUserById(userId);
    const firstName = ctx.from?.first_name || "друг";
    let msg;
    
    if (user) {
      msg = `Снова привет, ${firstName}.\nКласс ${user.class}.`;
    } else {
      msg = `Привет, ${firstName}. Это ДЗник.\n\n` +
        `Сначала выбери класс — займёт меньше минуты.\n` +
        `Дальше ДЗ на сегодня и завтра будут в двух кнопках внизу экрана.`;
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: user ? [
          [{ text: BTN.today, callback_data: "cmd_day" }, { text: BTN.tomorrow, callback_data: "cmd_next_day" }],
          [{ text: `${EMOJI.menu} Меню`, callback_data: "main_menu" }]
        ] : [
          [{ text: BTN.register, callback_data: "reg_step1" }],
          [{ text: "Как это работает", callback_data: "help_and_command" }]
        ]
      }
    };
    
    await replyOrEdit(ctx, msg, keyboard);
  }

  async function showMe(ctx) {
    const userId = ctx.from?.id.toString();
    if (!userId) {
      await ctx.reply("Не удалось определить ID.");
      return;
    }
    const user = await getUserById(userId);
    if (!user) {
      await ctx.reply(`${EMOJI.no} Ты не зарегистрирован.`, {
        reply_markup: {
          inline_keyboard: [[{ text: BTN.register, callback_data: "reg_step1" }]]
        }
      });
      return;
    }
    const roleText = user.role === "admin" ? "Админ" : "Ученик";
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ") || "—";
    const username = user.username ? `@${user.username}` : "—";
    const regDate = new Date(user.registered_at).toLocaleDateString("ru-RU", {
      year: "numeric",
      month: "long",
      day: "numeric"
    });
    const hwViews = user.stats?.homework_views || 0;
    const slot = user.notification_slot || (user.notifications_enabled === false ? 'off' : '20');
    const slotLabel = slot === 'off' ? 'выкл' : `${slot}:00`;
    
    const profileText =
      `${EMOJI.profile} *Профиль*\n\n` +
      `Имя: ${fullName}\n` +
      `Юзернейм: ${username}\n` +
      `Роль: ${roleText}\n` +
      `${EMOJI.school} Класс: ${user.class}\n\n` +
      `Просмотров ДЗ: ${hwViews}\n` +
      `${EMOJI.bell} Напоминания: ${slotLabel}\n` +
      `Регистрация: ${regDate}`;
    
    const buttons = [
      [{ text: `${EMOJI.bell} Время уведомлений`, callback_data: "notif_slots" }],
      [{ text: `${EMOJI.school} Сменить класс`, callback_data: "change_class" }],
    ];
    
    if (user.role !== "admin") {
      buttons.push([{ text: "Стать админом", callback_data: "request_admin" }]);
    }
    
    buttons.push(...menuFooter());
    buttons.push([{ text: `${EMOJI.del} Удалить профиль`, callback_data: "confirm_delete_profile" }]);
    
    await replyOrEdit(ctx, profileText, { reply_markup: { inline_keyboard: buttons } });
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
    const changingClass = !!ctx.session.changingClass;
    
    const roleText = selectedRole === "admin" ? "Админ" : "Ученик";
    const msg = changingClass
      ? `${EMOJI.school} *Смена класса*\n\nВыбери букву класса:`
      : `*Регистрация*\nРоль: ${roleText}\nШаг 2 из 4 — буква класса`;
    
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
          changingClass
            ? [{ text: `${EMOJI.back} Профиль`, callback_data: "show_profile" }]
            : [{ text: `${EMOJI.back} К выбору роли`, callback_data: "reg_step1" }],
          [{ text: `${EMOJI.no} Отмена`, callback_data: changingClass ? "show_profile" : "start_bot" }]
        ]
      }
    };
    
    await safeAnswerCb(ctx);
    try {
      await ctx.editMessageText(msg, { ...keyboard, parse_mode: "Markdown" });
    } catch (e) {
      await ctx.reply(msg, { ...keyboard, parse_mode: "Markdown" });
    }
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
    
    const roleText = ctx.session.selectedRole === "admin" ? "Админ" : "Ученик";
    const selectedClass = `${selectedNumber}${ctx.session.selectedLetter}`;
    ctx.session.selectedClass = selectedClass;
    const changingClass = !!ctx.session.changingClass;
    
    const msg = changingClass
      ? `${EMOJI.school} *Смена класса*\n\nНовый класс: *${selectedClass}*\nВсё верно?`
      : `*Регистрация*\nШаг 4 — подтверждение\nРоль: *${roleText}*\nКласс: *${selectedClass}*` +
        `${ctx.session.selectedRole === "admin" ? "\n\nЗаявка на админа уйдёт на проверку." : ""}\n\nВсё верно?`;
    
    const rows = [
      [{ text: `${EMOJI.ok} Да`, callback_data: "reg_confirm" }],
      [{ text: `${EMOJI.back} Изменить класс`, callback_data: `reg_back_to_letter_${ctx.session.selectedRole}` }],
    ];
    if (changingClass) {
      rows.push([{ text: `${EMOJI.no} Отмена`, callback_data: "show_profile" }]);
    } else {
      rows.push([{ text: `${EMOJI.back} Изменить роль`, callback_data: "reg_step1" }]);
      rows.push([{ text: `${EMOJI.no} Отмена`, callback_data: "start_bot" }]);
    }
    
    await safeAnswerCb(ctx);
    await ctx.editMessageText(msg, {
      reply_markup: { inline_keyboard: rows },
      parse_mode: "Markdown"
    });
  }

  async function confirmRegistration(ctx) {
    const userId = ctx.from.id.toString();
    const selectedClass = ctx.session.selectedClass;
    const selectedRole = ctx.session.selectedRole;
    const changingClass = !!ctx.session.changingClass;
    
    if (!selectedClass || !selectedRole) {
      await ctx.answerCbQuery("Данные потеряны. Начни снова.");
      if (changingClass) await showMe(ctx);
      else await showRegStep1(ctx);
      return;
    }
    
    const userExists = await getUserById(userId);

    if (changingClass) {
      if (!userExists) {
        await ctx.answerCbQuery("Сначала зарегистрируйся.");
        ctx.session = {};
        await showRegStep1(ctx);
        return;
      }
      userExists.class = selectedClass;
      await saveUser(userExists);
      ctx.session = {};
      await safeAnswerCb(ctx, `${EMOJI.ok} Класс обновлён`);
      await ctx.editMessageText(
        `${EMOJI.ok} *Класс изменён*\n\n${EMOJI.school} Теперь ты в ${selectedClass}.`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: BTN.today, callback_data: "cmd_day" }],
              ...menuFooter()
            ]
          },
          parse_mode: "Markdown"
        }
      );
      return;
    }

    if (userExists) {
      await ctx.answerCbQuery("Ты уже зарегистрирован.");
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
        notification_slot: '20',
        custom_keyboard: DEFAULT_KEYBOARD,
        completed_homework: {},
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
          `${EMOJI.ok} *Готово*\n\n` +
          `${EMOJI.profile} ${newUser.first_name || 'друг'}\n` +
          `${EMOJI.school} ${newUser.class}\n\n` +
          `ДЗ на сегодня и завтра — кнопками внизу.`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: BTN.today, callback_data: "cmd_day" }],
                [{ text: `${EMOJI.menu} Меню`, callback_data: "main_menu" }]
              ]
            },
            parse_mode: "Markdown"
          }
        );
        await openReplyKeyboardForUser(ctx, newUser);
      } catch (e) {
        console.error("Ошибка регистрации:", e);
        await ctx.answerCbQuery("Ошибка регистрации. Попробуй ещё раз.");
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
                [{ text: "😎 Написать Александру", url: "https://t.me/sanek120" }]

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
      
      const msg = user
        ? `${EMOJI.menu} *Меню*\n\nПривет, ${user.first_name || "друг"}.\n\n${EMOJI.school} ${user.class}`
        : `${EMOJI.menu} *Меню*\n\nТы не зарегистрирован. Зарегистрируйся, чтобы видеть ДЗ.`;
      
      const baseButtons = [
          [{ text: BTN.today, callback_data: 'cmd_day' }],
          [
              Markup.button.callback(BTN.tomorrow, 'cmd_next_day'),
              Markup.button.callback(BTN.week, 'cmd_week')
          ],
          [
              Markup.button.callback(BTN.schedule, 'view_schedule'),
              Markup.button.callback(BTN.choice, 'cmd_choice')
          ],
          [
              Markup.button.callback(BTN.all, 'cmd_all'),
              Markup.button.callback(BTN.profile, 'show_profile')
          ],
      ];
      
      if (isAdminUser) {
          baseButtons.push([
              Markup.button.callback(`${EMOJI.edit} Редактировать ДЗ`, 'edit_dz_panel')
          ]);
          baseButtons.push([
              Markup.button.callback(`${EMOJI.upload} Расписание`, 'upload_schedule'),
              Markup.button.callback(`${EMOJI.stats} Статистика`, 'admin_stats')
          ]);
      }
      
      baseButtons.push([
          Markup.button.callback(BTN.settings, 'cmd_configure'),
          Markup.button.callback(`${EMOJI.keyboard} Клавиатура`, 'show_reply_keyboard')
      ]);
      
      if (!user) {
          baseButtons.push([Markup.button.callback(BTN.register, 'reg_step1')]);
      }
      
      const keyboard = Markup.inlineKeyboard(baseButtons);
      
      try {
          if (ctx.callbackQuery) {
              await safeAnswerCb(ctx);
              const callbackMsg = ctx.callbackQuery.message;
              if (callbackMsg?.text) {
                  await ctx.editMessageText(msg, { parse_mode: 'Markdown', ...keyboard });
              } else {
                  await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
              }
          } else {
              await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
          }
      } catch (error) {
          console.error('Ошибка showMainMenu:', error);
          await ctx.reply(msg, { parse_mode: 'Markdown', ...keyboard });
      }
  }

  async function showHelp(ctx) {
    const msg =
      `*Как пользоваться*\n\n` +
      `Команды:\n` +
      `/start — начать\n` +
      `/menu — меню\n` +
      `/day — ДЗ на сегодня\n` +
      `/next_day — ДЗ на завтра\n` +
      `/week — ДЗ на неделю\n` +
      `/schedule — расписание\n` +
      `/me — профиль\n` +
      `/help — эта справка\n` +
      `/web — открыть веб-версию\n\n` +
      `Удобнее кнопками внизу экрана: Сегодня и Завтра.\n` +
      `В профиле можно сменить класс и время напоминаний.`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: menuFooter()
      }
    };

    await replyOrEdit(ctx, msg, keyboard);
  }

  async function showWebApp(ctx) {
    // Используем реальный URL веб-приложения на Render
    const webAppUrl = process.env.WEBAPP_URL || 'https://bot-helper-project.onrender.com';
    
    // Защита: если URL не задан или не является HTTPS, показываем предупреждение
    if (!webAppUrl || !webAppUrl.startsWith('https://')) {
      await replyOrEdit(ctx, '⚠️ *Веб-версия временно недоступна*\n\nURL веб-приложения не настроен. Попробуйте позже.', {});
      return;
    }
    
    const msg = `🌐 *Веб-версия ДЗник*\n\n` +
      `Откройте удобный веб-интерфейс для просмотра домашних заданий.\n\n` +
      `Нажмите кнопку ниже, чтобы запустить веб-приложение.`;

    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🚀 Открыть веб-версию', web_app: { url: webAppUrl } }]
        ]
      }
    };

    await replyOrEdit(ctx, msg, keyboard);
  }

  async function showDayHomework(ctx, dateStr, emptyHint = null) {
    const userId = ctx.from?.id.toString();
    const user = await getUserById(userId);
    
    if (!user) {
      await ctx.reply(`${EMOJI.no} Сначала зарегистрируйся.`, {
        reply_markup: {
          inline_keyboard: [[{ text: BTN.register, callback_data: "reg_step1" }]]
        }
      });
      return;
    }
    
    const dz = await getClassHomework(user.class);
    const dayDZ = dz[dateStr];
    const doneSet = getDoneSet(user, dateStr);
    const hasPhotos = dayDZ && Object.values(dayDZ).some(
      (t) => typeof t === 'object' && t.photo_id
    );
    
    const msg = buildDayCard({
      dateStr,
      classKey: user.class,
      dayDZ,
      doneSet,
      emptyHint: emptyHint || 'Загляни в завтра или выбери другой день.',
    });
    
    const buttons = [
      ...buildChecklistRows(dateStr, dayDZ, doneSet),
      ...dayNavButtons(dateStr, { hasPhotos: !!hasPhotos, includeCopy: !!(dayDZ && Object.keys(dayDZ).length) }),
    ];
    
    await updateUserStats(userId, 'view_homework');
    await replyOrEdit(ctx, msg, { reply_markup: { inline_keyboard: buttons } });
  }

  async function showTodayDZ(ctx) {
    await showDayHomework(ctx, toDateKey());
  }

  async function showTomorrowDZ(ctx) {
    await showDayHomework(ctx, addDaysToKey(toDateKey(), 1));
  }

  async function showWeekDZ(ctx) {
    const userId = ctx.from?.id.toString();
    const user = await getUserById(userId);
    
    if (!user) {
      await ctx.reply(`${EMOJI.no} Сначала зарегистрируйся.`, {
        reply_markup: {
          inline_keyboard: [[{ text: BTN.register, callback_data: "reg_step1" }]]
        }
      });
      return;
    }
    
    const todayKey = toDateKey();
    const dates = [];
    for (let i = 0; i < 7; i++) dates.push(addDaysToKey(todayKey, i));
    const dz = await getClassHomework(user.class);
    
    let msg = `${EMOJI.week} *ДЗ на неделю*\n${EMOJI.school} ${user.class}\n`;
    let hasAnyDZ = false;
    
    for (const dateStr of dates) {
      const dayDZ = dz[dateStr];
      if (dayDZ && Object.keys(dayDZ).length > 0) {
        hasAnyDZ = true;
        msg += `\n${EMOJI.day} *${dayTitle(dateStr, todayKey)}*\n`;
        for (const [subject, task] of Object.entries(dayDZ)) {
          const icon = getSubjectIcon(subject);
          const taskText = typeof task === 'object' ? task.text : task;
          msg += `${icon} ${subject}: ${truncateText(taskText, 50)}\n`;
        }
      }
    }
    
    if (!hasAnyDZ) {
      msg += `\nНа эту неделю заданий нет.`;
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: `${EMOJI.week} Другая неделя`, callback_data: "cmd_next_week" }],
          [{ text: BTN.today, callback_data: "cmd_day" }, { text: BTN.tomorrow, callback_data: "cmd_next_day" }],
          ...menuFooter()
        ]
      }
    };
    
    await updateUserStats(userId, 'view_homework');
    await replyOrEdit(ctx, msg, keyboard);
  }

  async function showNextWeekDZ(ctx) {
    const userId = ctx.from?.id.toString();
    const user = await getUserById(userId);
    
    if (!user) {
      await ctx.reply(`${EMOJI.no} Сначала зарегистрируйся.`, {
        reply_markup: {
          inline_keyboard: [[{ text: BTN.register, callback_data: "reg_step1" }]]
        }
      });
      return;
    }
    
    const todayKey = toDateKey();
    const dates = [];
    for (let i = 7; i < 14; i++) dates.push(addDaysToKey(todayKey, i));
    
    const dz = await getClassHomework(user.class);
    let msg = `${EMOJI.week} *ДЗ на следующую неделю*\n${EMOJI.school} ${user.class}\n`;
    let hasAnyDZ = false;
    
    for (const dateStr of dates) {
      const dayDZ = dz[dateStr];
      if (dayDZ && Object.keys(dayDZ).length > 0) {
        hasAnyDZ = true;
        msg += `\n${EMOJI.day} *${formatDateShort(dateStr)}*\n`;
        for (const [subject, task] of Object.entries(dayDZ)) {
          const icon = getSubjectIcon(subject);
          const taskText = typeof task === 'object' ? task.text : task;
          msg += `${icon} ${subject}: ${truncateText(taskText, 50)}\n`;
        }
      }
    }
    
    if (!hasAnyDZ) {
      msg += `\nНа следующую неделю заданий нет.`;
    }
    
    const keyboard = {
      reply_markup: {
        inline_keyboard: [
          [{ text: `${EMOJI.week} Эта неделя`, callback_data: "cmd_week" }],
          [{ text: BTN.today, callback_data: "cmd_day" }],
          ...menuFooter()
        ]
      }
    };
    
    await updateUserStats(userId, 'view_homework');
    await replyOrEdit(ctx, msg, keyboard);
  }

  async function showHomeworkOfDay(ctx, dateStr) {
    await showDayHomework(ctx, dateStr);
  }

  async function viewSchedule(ctx) {
      const userId = ctx.from?.id.toString();
      const user = await getUserById(userId);
      
      if (!user) {
          await ctx.reply(`${EMOJI.no} Сначала зарегистрируйся.`, {
              reply_markup: Markup.inlineKeyboard([
                  [Markup.button.callback(BTN.register, 'reg_step1')]
              ])
          });
          return;
      }
      
      const photoId = await getSchedulePhotoId(user.class);
      
      if (!photoId) {
          const msg = `${EMOJI.schedule} *Расписание*\\n\\n` +
              `${EMOJI.school} ${user.class}\\n` +
              `Расписание ещё не загружено.\\n` +
              `Админ класса может добавить фото.`;
          
          const buttons = [];
          if (user.role === "admin") {
              buttons.push([Markup.button.callback(`${EMOJI.upload} Загрузить`, 'upload_schedule')]);
          }
          buttons.push(...menuFooter().map(row => row.map(b => Markup.button.callback(b.text, b.callback_data))));
          
          await safeAnswerCb(ctx);
          try {
              if (ctx.callbackQuery?.message?.text) {
                  await ctx.editMessageText(msg, {
                      parse_mode: 'Markdown',
                      reply_markup: Markup.inlineKeyboard(buttons).reply_markup
                  });
              } else {
                  await ctx.deleteMessage().catch(() => {});
                  await ctx.reply(msg, {
                      parse_mode: 'Markdown',
                      reply_markup: Markup.inlineKeyboard(buttons).reply_markup
                  });
              }
          } catch (e) {
              await ctx.reply(msg, {
                  parse_mode: 'Markdown',
                  reply_markup: Markup.inlineKeyboard(buttons).reply_markup
              });
          }
          return;
      }
      
      const caption = `${EMOJI.schedule} *Расписание*  +
      ${EMOJI.school} ${user.class}`;
      
      const buttons = [];
      if (user.role === "admin") {
          buttons.push([Markup.button.callback(`${EMOJI.upload} Обновить`, 'upload_schedule')]);
      }
      buttons.push([Markup.button.callback(`${EMOJI.menu} Меню`, 'main_menu')]);
      
      await safeAnswerCb(ctx);
      
      if (ctx.callbackQuery) {
          try {
              await ctx.deleteMessage().catch(() => {});
          } catch (e) {}
      }
      
      try {
          await ctx.replyWithPhoto(photoId, {
              caption: caption,
              parse_mode: 'Markdown',
              reply_markup: Markup.inlineKeyboard(buttons).reply_markup
          });
      } catch (error) {
          console.error("Ошибка отправки фото расписания:", error.message);
          
          const errorMsg = `${EMOJI.no} *Не удалось загрузить расписание*\\n\\n` +
              `Файл устарел. Админу нужно загрузить новое.`;
          
          const errorButtons = [];
          if (user.role === "admin") {
              errorButtons.push([Markup.button.callback(`${EMOJI.upload} Загрузить`, 'upload_schedule')]);
          }
          errorButtons.push([Markup.button.callback(`${EMOJI.menu} Меню`, 'main_menu')]);
          
          await ctx.reply(errorMsg, { 
              parse_mode: 'Markdown', 
              reply_markup: Markup.inlineKeyboard(errorButtons).reply_markup 
          });
      }
  }

  async function showKeyboardConfig(ctx) {
    const userId = ctx.from?.id.toString();
    const user = await getUserById(userId);
    
    if (!user) {
      await ctx.reply(`${EMOJI.no} Сначала зарегистрируйся.`, {
        reply_markup: {
          inline_keyboard: [[{ text: BTN.register, callback_data: "reg_step1" }]]
        }
      });
      return;
    }
    
    const allButtons = ALL_KEYBOARD_BUTTONS;
    const currentButtons = user.custom_keyboard?.length ? user.custom_keyboard : DEFAULT_KEYBOARD;
    
    const buttons = allButtons.map(btn => {
      const isSelected = currentButtons.includes(btn);
      return [{ text: `${isSelected ? EMOJI.ok : "⬜"} ${btn}`, callback_data: `toggle_kb_${btn}` }];
    });
    
    buttons.push([{ text: `${EMOJI.ok} Сохранить`, callback_data: "save_keyboard" }]);
    buttons.push(...menuFooter());
    
    const msg = `${EMOJI.settings} *Клавиатура*\n\nОтметь кнопки внизу экрана.\nПо умолчанию: Сегодня, Завтра и Меню.`;
    
    await replyOrEdit(ctx, msg, { reply_markup: { inline_keyboard: buttons } });
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

    const msg = `${EMOJI.edit} *Редактирование ДЗ*\n\nВыбери действие:`;
    const buttons = [
      [{ text: `${EMOJI.add} Добавить ДЗ`, callback_data: "add_homework" }],
      [{ text: `${EMOJI.del} Удалить ДЗ`, callback_data: "delete_homework" }],
      ...menuFooter()
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
      await ctx.reply(`${EMOJI.no} Сначала зарегистрируйся.`, {
        reply_markup: {
          inline_keyboard: [[{ text: BTN.register, callback_data: "reg_step1" }]]
        }
      });
      return;
    }
    
    const customButtons = user.custom_keyboard?.length
      ? user.custom_keyboard
      : DEFAULT_KEYBOARD;
    const rows = [];
    for (let i = 0; i < customButtons.length; i += 2) {
      rows.push(customButtons.slice(i, i + 2));
    }
    // ensure menu on last row alone if not present
    if (!customButtons.includes(BTN.menu)) {
      rows.push([BTN.menu]);
    }
    
    await ctx.reply(`${EMOJI.keyboard} Клавиатура открыта`, {
      reply_markup: {
        keyboard: rows,
        resize_keyboard: true,
        one_time_keyboard: false
      }
    });
    
    if (ctx.callbackQuery) {
      await safeAnswerCb(ctx, "Клавиатура открыта");
    }
  }

  async function openReplyKeyboardForUser(ctx, user) {
    const customButtons = user.custom_keyboard?.length
      ? user.custom_keyboard
      : DEFAULT_KEYBOARD;
    const rows = [];
    for (let i = 0; i < customButtons.length; i += 2) {
      rows.push(customButtons.slice(i, i + 2));
    }
    if (!customButtons.includes(BTN.menu)) rows.push([BTN.menu]);
    await ctx.reply(`${EMOJI.ok} Готово. Кнопки внизу экрана — Сегодня и Завтра.`, {
      reply_markup: {
        keyboard: rows,
        resize_keyboard: true,
        one_time_keyboard: false
      }
    });
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
                          `💬 Юзернейм: @${user.username || 'отсутствует'}` +
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

  const formatDate = formatDateFull;

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
  bot.action("show_profile", (ctx) => {
    delete ctx.session.changingClass;
    return showMe(ctx);
  });
  bot.action("cmd_configure", (ctx) => showKeyboardConfig(ctx));
  bot.action("help_and_command", (ctx) => showHelp(ctx));
  bot.action("show_reply_keyboard", (ctx) => showReplyKeyboard(ctx));
  bot.action("admin_stats", (ctx) => showAdminStats(ctx));
  bot.action("edit_dz_panel", (ctx) => {
    clearEditSession(ctx);
    return showEditPanel(ctx);
  });

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
    await showNotifSlots(ctx);
  });

  bot.action("notif_slots", async (ctx) => {
    await showNotifSlots(ctx);
  });

  async function showNotifSlots(ctx) {
    const user = await getUserById(ctx.from?.id);
    if (!user) return;
    const slot = user.notification_slot || (user.notifications_enabled === false ? 'off' : '20');
    const mark = (s) => (slot === s ? EMOJI.ok + ' ' : '');
    const msg = `${EMOJI.bell} *Напоминания о ДЗ на завтра*\n\nВыбери время (МСК):`;
    const buttons = [
      [{ text: `${mark('off')}Выкл`, callback_data: 'set_notif_off' }],
      [{ text: `${mark('18')}18:00`, callback_data: 'set_notif_18' }],
      [{ text: `${mark('20')}20:00`, callback_data: 'set_notif_20' }],
      [{ text: `${EMOJI.back} Профиль`, callback_data: 'show_profile' }],
    ];
    await replyOrEdit(ctx, msg, { reply_markup: { inline_keyboard: buttons } });
  }

  async function setNotificationSlot(ctx, slot) {
    const user = await getUserById(ctx.from?.id);
    if (!user) return;
    user.notification_slot = slot;
    user.notifications_enabled = slot !== 'off';
    await saveUser(user);
    await safeAnswerCb(ctx, slot === 'off' ? 'Уведомления выкл' : `Напоминание в ${slot}:00`);
    await showMe(ctx);
  }

  bot.action('set_notif_off', (ctx) => setNotificationSlot(ctx, 'off'));
  bot.action('set_notif_18', (ctx) => setNotificationSlot(ctx, '18'));
  bot.action('set_notif_20', (ctx) => setNotificationSlot(ctx, '20'));

  bot.action('change_class', async (ctx) => {
    const user = await getUserById(ctx.from?.id);
    if (!user) {
      await safeAnswerCb(ctx, 'Сначала зарегистрируйся');
      return;
    }
    ctx.session.changingClass = true;
    ctx.session.selectedRole = user.role === 'admin' ? 'admin' : 'user';
    await showRegStep2(ctx, ctx.session.selectedRole);
  });

  bot.action(/copy_day_(.+)/, async (ctx) => {
    const dateStr = ctx.match[1];
    const user = await getUserById(ctx.from?.id);
    if (!user) return;
    const dz = await getClassHomework(user.class);
    const text = buildDayCopyText({ dateStr, classKey: user.class, dayDZ: dz[dateStr] });
    await safeAnswerCb(ctx, 'Скопируй сообщение ниже');
    await ctx.reply(text);
  });

  bot.action(/toggle_done_(\d{4}-\d{2}-\d{2})_(\d+)/, async (ctx) => {
    const dateStr = ctx.match[1];
    const idx = parseInt(ctx.match[2], 10);
    const user = await getUserById(ctx.from?.id);
    if (!user) return;
    const dz = await getClassHomework(user.class);
    const dayDZ = dz[dateStr];
    if (!dayDZ) {
      await safeAnswerCb(ctx, 'ДЗ не найдено');
      return;
    }
    const subjects = Object.keys(dayDZ);
    const subject = subjects[idx];
    if (!subject) {
      await safeAnswerCb(ctx, 'Предмет не найден');
      return;
    }
    const marked = await toggleHomeworkDone(user, dateStr, subject);
    await safeAnswerCb(ctx, marked ? `${EMOJI.ok} ${subject}` : `↩️ ${subject}`);
    await showDayHomework(ctx, dateStr);
  });

  bot.action("request_admin", (ctx) => requestAdmin(ctx));

  bot.action('noop', async (ctx) => {
    await safeAnswerCb(ctx);
  });

  bot.action(/toggle_kb_(.+)/, async (ctx) => {
    const buttonName = ctx.match[1];
    const userId = ctx.from?.id.toString();
    const user = await getUserById(userId);
    
    if (!user) return;
    
    if (!user.custom_keyboard?.length) {
      user.custom_keyboard = [...DEFAULT_KEYBOARD];
    }
    const index = user.custom_keyboard.indexOf(buttonName);
    
    if (index === -1) {
      user.custom_keyboard.push(buttonName);
    } else {
      user.custom_keyboard.splice(index, 1);
    }
    
    await saveUser(user);
    await ctx.answerCbQuery(`Кнопка «${buttonName}» ${index === -1 ? "вкл" : "выкл"}`);
    await showKeyboardConfig(ctx);
  });

  bot.action("save_keyboard", async (ctx) => {
    const user = await getUserById(ctx.from?.id);
    await safeAnswerCb(ctx, "Клавиатура сохранена");
    if (user) await openReplyKeyboardForUser(ctx, user);
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

  bot.action('upload_schedule', async (ctx) => {
      const user = await getUserById(ctx.from?.id.toString());
      if (!user || user.role !== "admin") {
          await safeAnswerCb(ctx, "❌ Только админы могут загружать расписание");
          return;
      }
      
      ctx.session.uploadingSchedule = true;
      ctx.session.scheduleClass = user.class;
      
      const msg = `📤 *Загрузка расписания*\n\n` +
          `🏫 Класс: ${user.class}\n` +
          `📷 Отправьте фото расписания следующим сообщением\n\n` +
          `💡 *Советы:*\n` +
          `• Отправляйте как изображение (не файлом)\n` +
          `• Можно с подписью или без\n` +
          `• Нажмите "Отмена" если передумали`;
      
      const keyboard = Markup.inlineKeyboard([
          [Markup.button.callback('❌ Отмена', 'upload_schedule_cancel')]
      ]);
      
      await safeAnswerCb(ctx);
      
      try {
          if (ctx.callbackQuery?.message?.text) {
              await ctx.editMessageText(msg, { 
                  parse_mode: 'Markdown',
                  reply_markup: keyboard.reply_markup 
              });
          } else {
              try {
                  await ctx.deleteMessage();
              } catch (e) {
              }
              await ctx.reply(msg, { 
                  parse_mode: 'Markdown',
                  ...keyboard 
              });
          }
      } catch (error) {
          console.warn('⚠️ editMessageText не сработал, отправляем новое сообщение:', error.message);
          await ctx.reply(msg, { 
              parse_mode: 'Markdown',
              ...keyboard 
          });
      }
  });

  bot.action('upload_schedule_cancel', async (ctx) => {
      delete ctx.session.uploadingSchedule;
      delete ctx.session.scheduleClass;
      
      await safeAnswerCb(ctx, '✅ Загрузка отменена');
      
      try {
          if (ctx.callbackQuery?.message?.text) {
              await showMainMenu(ctx); 
          } else {
              await ctx.deleteMessage().catch(() => {});
              await showMainMenu(ctx);
          }
      } catch (e) {
          await showMainMenu(ctx);
      }
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

    const subjectRows = [];
    for (let i = 0; i < QUICK_SUBJECTS.length; i += 2) {
      const row = [];
      const a = QUICK_SUBJECTS[i];
      const b = QUICK_SUBJECTS[i + 1];
      row.push({ text: `${getSubjectIcon(a)} ${a}`, callback_data: `quick_subj_${i}` });
      if (b) row.push({ text: `${getSubjectIcon(b)} ${b}`, callback_data: `quick_subj_${i + 1}` });
      subjectRows.push(row);
    }
    subjectRows.push([{ text: 'Другой…', callback_data: 'quick_subj_other' }]);
    subjectRows.push([{ text: `${EMOJI.no} Отмена`, callback_data: 'edit_dz_panel' }]);
    
    await safeAnswerCb(ctx);
    await ctx.editMessageText(
      `${EMOJI.edit} *ДЗ на ${formatDateFull(dateStr)}*\n\nВыбери предмет или «Другой…»`,
      {
        reply_markup: { inline_keyboard: subjectRows },
        parse_mode: "Markdown"
      }
    );
  });

  bot.action(/quick_subj_(\d+)/, async (ctx) => {
    const idx = parseInt(ctx.match[1], 10);
    const subject = QUICK_SUBJECTS[idx];
    if (!subject || !ctx.session.selectedDate) {
      await safeAnswerCb(ctx, 'Выбери дату снова');
      return;
    }
    ctx.session.selectedSubject = subject;
    ctx.session.editStep = "waiting_dz_for_add";
    await safeAnswerCb(ctx);
    await ctx.editMessageText(
      `${EMOJI.edit} *${subject}*\n${EMOJI.day} ${formatDateFull(ctx.session.selectedDate)}\n\n` +
      `Отправь задание текстом или фото с подписью.`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: `${EMOJI.no} Отмена`, callback_data: 'edit_dz_panel' }]]
        },
        parse_mode: "Markdown"
      }
    );
  });

  bot.action('quick_subj_other', async (ctx) => {
    if (!ctx.session.selectedDate) {
      await safeAnswerCb(ctx, 'Выбери дату снова');
      return;
    }
    ctx.session.editStep = "waiting_subject_for_add";
    await safeAnswerCb(ctx);
    await ctx.editMessageText(
      `${EMOJI.edit} Напиши название предмета текстом.\nНапример: Алгебра, РОВ`,
      {
        reply_markup: {
          inline_keyboard: [[{ text: `${EMOJI.no} Отмена`, callback_data: 'edit_dz_panel' }]]
        },
        parse_mode: "Markdown"
      }
    );
  });

  bot.action("delete_homework", async (ctx) => {
    const userId = ctx.from?.id.toString();
    const user = await getUserById(userId);
    if (!user || user.role !== "admin") {
      await safeAnswerCb(ctx, "Только админы могут удалять ДЗ");
      return;
    }

    const dz = await getClassHomework(user.class);
    const datesWithDZ = Object.keys(dz)
      .filter(date => dz[date] && Object.keys(dz[date]).length > 0)
      .sort((a, b) => new Date(a) - new Date(b));

    if (datesWithDZ.length === 0) {
      await safeAnswerCb(ctx, "Нет ДЗ для удаления");
      await ctx.editMessageText("🗑️ Нет записей с домашним заданием.", {
        reply_markup: { inline_keyboard: [[{ text: "← Назад", callback_data: "edit_dz_panel" }]] }
      });
      return;
    }

    const buttons = datesWithDZ.slice(0, 20).map(dateStr => {
      const d = new Date(dateStr);
      const dayName = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'][d.getDay()];
      const formatted = `${dayName}, ${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      return [{ text: formatted, callback_data: `del_hw_date_${dateStr}` }];
    });
    buttons.push([{ text: "❌ Отмена", callback_data: "edit_dz_panel" }]);

    await safeAnswerCb(ctx);
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
      await safeAnswerCb(ctx, "Только админы могут удалять ДЗ.");
      return;
    }

    const dz = await getClassHomework(user.class);
    const dayDZ = dz[dateStr];

    if (!dayDZ || Object.keys(dayDZ).length === 0) {
      await safeAnswerCb(ctx, "❌ Нет ДЗ на эту дату.");
      return;
    }

    const subjects = Object.keys(dayDZ);
    const subjectMap = {};
    const buttons = subjects.map((subject, idx) => {
      const key = `del_sub_${idx}`;
      subjectMap[key] = { date: dateStr, subject };
      return [{ text: `${getSubjectIcon(subject)} ${subject}`, callback_data: key }];
    });

    ctx.session.del_hw_map = subjectMap;
    buttons.push([{ text: "← Назад", callback_data: "delete_homework" }]);

    const d = new Date(dateStr);
    const dayName = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'][d.getDay()];
    const header = `🗑️ *Удаление ДЗ на ${dayName}, ${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}*`;

    await safeAnswerCb(ctx);
    await ctx.editMessageText(`${header}\nВыберите предмет для удаления:`, {
      reply_markup: { inline_keyboard: buttons },
      parse_mode: "Markdown"
    });
  });

  bot.action(/del_sub_\d+/, async (ctx) => {
    const key = ctx.callbackQuery.data;
    const userId = ctx.from?.id.toString();
    const user = await getUserById(userId);
    if (!user || user.role !== "admin") {
      await safeAnswerCb(ctx, "Только админы могут удалять ДЗ.");
      return;
    }

    const map = ctx.session.del_hw_map;
    if (!map || !map[key]) {
      await safeAnswerCb(ctx, "❌ Сессия устарела. Повторите попытку.");
      return;
    }

    const { date, subject } = map[key];
    const classKey = user.class;

    const dz = await getClassHomework(classKey);

    if (dz[date]?.[subject] !== undefined) {
      delete dz[date][subject];
      if (Object.keys(dz[date]).length === 0) {
        delete dz[date];
      }
      await saveClassHomework(classKey, dz);
      await safeAnswerCb(ctx, `✅ ДЗ по "${subject}" на ${date} удалено.`);
    } else {
      await safeAnswerCb(ctx, "⚠️ ДЗ уже удалено или не существует.");
    }

    const updatedDz = await getClassHomework(classKey);
    const datesWithDZ = Object.keys(updatedDz)
      .filter(date => updatedDz[date] && Object.keys(updatedDz[date]).length > 0)
      .sort((a, b) => new Date(a) - new Date(b));

    if (datesWithDZ.length === 0) {
      await ctx.editMessageText("🗑️ Больше нет ДЗ для удаления.", {
        reply_markup: { inline_keyboard: [[{ text: "← Назад", callback_data: "edit_dz_panel" }]] }
      });
      return;
    }

    const buttons = datesWithDZ.slice(0, 20).map(dateStr => {
      const d = new Date(dateStr);
      const dayName = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'][d.getDay()];
      const formatted = `${dayName}, ${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
      return [{ text: formatted, callback_data: `del_hw_date_${dateStr}` }];
    });
    buttons.push([{ text: "← Назад", callback_data: "edit_dz_panel" }]);

    await ctx.editMessageText("🗑️ Выберите дату для удаления ДЗ:", {
      reply_markup: { inline_keyboard: buttons },
      parse_mode: "Markdown"
    });
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
    await ctx.editMessageText(ctx.update.callback_query.message.text + "✅ *ОДОБРЕНО* админом @" + (adminUser.username || "отсутствует"), {
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
      await bot.telegram.sendMessage(targetUser.chat_id, `${EMOJI.no} Заявка на администратора отклонена.`, {
        parse_mode: "Markdown"
      });
    } catch (e) {
      console.error("Не удалось уведомить пользователя об отклонении:", e);
    }
    
    await ctx.answerCbQuery("Заявка отклонена.");
    await ctx.editMessageText(ctx.update.callback_query.message.text + `\n${EMOJI.no} *ОТКЛОНЕНО*`, {
      reply_markup: { inline_keyboard: [] },
      parse_mode: "Markdown"
    });
  });

  async function startBot() {
    console.log("Запуск бота");
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`на порту: ${PORT}`);
    });
    connectDB().catch((e) => console.error("Ошибка подключения к MongoDB:", e));
    try {
      await bot.telegram.setMyCommands(botCommands());
      console.log("Команды Bot API установлены");
    } catch (e) {
      console.warn("Не удалось setMyCommands:", e.message);
    }
    bot.launch()
      .then(() => console.log("Бот запущен!"))
      .catch((err) => console.error("Ошибка запуска бота:", err));
  }

  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));

  startBot();
