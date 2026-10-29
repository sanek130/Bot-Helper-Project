import bot, { answerCb, replyOrEdit } from './bot.js';
import { TEXTS } from './texts.js';
import { getSession, clearSession } from './sessions.js';
import { getUserByTgId } from '../services/userService.js';
import { showDayHomework, showWeekHomework, showCalendar, showAllHomework } from './flows/homework.js';
import { showSchedule, handleScheduleText } from './flows/schedule.js';
import { handleAddText, startAdd } from './flows/admin-add.js';
import { handleEditText, startEdit } from './flows/admin-edit.js';
import './flows/admin-delete.js';
import { handleRegistrationText, showStart } from './flows/registration.js';
import { handleLoginText, startLogin } from './flows/login.js';
import { showProfile, handleClassText } from './flows/profile.js';
import { showStats } from './flows/stats.js';
import { showAdminPanel } from './flows/admin-panel.js';
import { handleComplaintText, startComplaint } from './flows/complaints.js';
import { handleBroadcastText, startClassBroadcast, startCreatorBroadcast } from './flows/broadcast.js';
import { showHelp } from './flows/help.js';
import { handleSupportText } from './flows/support.js';
import { handleCreatorText } from './flows/creator.js';
import { showMenuPage1, showMenuPage2 } from './flows/menu.js';
import { toDateKey, addDaysToKey } from '../services/dateService.js';
import { normalizeText } from '../utils/normalize.js';
import config from '../config.js';

const BUTTONS = {
  'меню': 'menu',
  'сегодня': 'today',
  'завтра': 'tomorrow',
  'послезавтра': 'after',
  'неделя': 'week',
  'выбор дня': 'calendar',
  'всё дз': 'all',
  'расписание': 'schedule',
  'профиль': 'profile',
  'помощь': 'help',
  'веб-версия': 'web',
  'статистика': 'stats',
  'админ-панель': 'admin',
  'настройки': 'menu2',
  'моя статистика': 'stats',
  'начать': 'start',
  'регистрация': 'start',
  'отмена': 'cancel',
  'поддержка': 'support',
  'сайт': 'web',
};

async function handleButton(ctx, action) {
  switch (action) {
    case 'start':
      await showStart(ctx);
      return true;
    case 'cancel':
      await clearSession(ctx.from.id);
      await showMenuPage1(ctx);
      return true;
    case 'menu':
      await clearSession(ctx.from.id);
      await showMenuPage1(ctx);
      return true;
    case 'menu2':
      await clearSession(ctx.from.id);
      await showMenuPage2(ctx);
      return true;
    case 'today':
      await showDayHomework(ctx, toDateKey());
      return true;
    case 'tomorrow':
      await showDayHomework(ctx, addDaysToKey(toDateKey(), 1));
      return true;
    case 'after':
      await showDayHomework(ctx, addDaysToKey(toDateKey(), 2));
      return true;
    case 'week':
      await showWeekHomework(ctx, 0);
      return true;
    case 'calendar':
      await showCalendar(ctx, 'show', 0);
      return true;
    case 'all':
      await showAllHomework(ctx);
      return true;
    case 'schedule':
      await showSchedule(ctx);
      return true;
    case 'profile':
      await showProfile(ctx);
      return true;
    case 'help':
      await showHelp(ctx);
      return true;
    case 'web': {
      await ctx.reply(`🌐 ${TEXTS.buttons.web}: ${config.site.url}`, {
        reply_markup: { inline_keyboard: [[{ text: 'Открыть сайт', url: config.site.url }]] },
      });
      return true;
    }
    case 'support':
      await ctx.reply(TEXTS.support.prompt, { parse_mode: 'HTML' });
      await (await import('./sessions.js')).setSession(ctx.from.id, 'sup:text', {});
      return true;
    case 'stats':
      await showStats(ctx);
      return true;
    case 'admin':
      await showAdminPanel(ctx);
      return true;
    default:
      return false;
  }
}

async function handleStepText(ctx, session) {
  const step = session.step || '';

  if (step === 'login:id') return handleLoginText(ctx, session);
  if (step.startsWith('sup:')) return handleSupportText(ctx, session);
  if (step.startsWith('crt:')) return handleCreatorText(ctx, session);
  if (step.startsWith('reg:')) return handleRegistrationText(ctx, session);
  if (step.startsWith('add:')) return handleAddText(ctx, session);
  if (step === 'edit:text') return handleEditText(ctx, session);
  if (step.startsWith('cmp:')) return handleComplaintText(ctx, session);
  if (step === 'bc:text') return handleBroadcastText(ctx, session);
  if (step.startsWith('cls:')) return handleClassText(ctx, session);
  if (step === 'schedule:upload') return handleScheduleText(ctx, session);

  return false;
}

bot.on('text', async (ctx) => {
  try {
    const text = ctx.message?.text;
    if (!text) return;

    const normalized = normalizeText(text);
    if (normalized.startsWith('/')) {
      await ctx.reply(TEXTS.errors.unknownCommand);
      return;
    }

    if (normalized === 'меню') {
      await handleButton(ctx, 'menu');
      return;
    }

    const session = await getSession(ctx.from.id);

    if (await handleStepText(ctx, session)) return;
    if (await handleButton(ctx, BUTTONS[normalized])) return;

    const user = await getUserByTgId(ctx.from.id);
    if (!user) {
      await replyOrEdit(ctx, TEXTS.errors.notRegistered, {
        reply_markup: {
          inline_keyboard: [
            [{ text: TEXTS.buttons.register, callback_data: 'reg:start' }],
            [{ text: TEXTS.buttons.help, callback_data: 'help' }],
          ],
        },
      });
      return;
    }

    await ctx.reply(TEXTS.errors.unknownCommand);
  } catch (error) {
    console.error('Ошибка текстового обработчика:', error.message);
    await ctx.reply(TEXTS.errors.somethingWentWrong, { parse_mode: 'HTML' });
  }
});

bot.on('photo', async (ctx) => {
  try {
    const session = await getSession(ctx.from.id);

    if (session.step === 'schedule:upload') {
      const { handleSchedulePhoto } = await import('./flows/schedule.js');
      await handleSchedulePhoto(ctx, session);
      return;
    }

    if (session.step === 'add:task') {
      const { handleAddPhoto } = await import('./flows/admin-add.js');
      await handleAddPhoto(ctx, session);
      return;
    }

    if (session.step === 'edit:text') {
      const { handleEditPhoto } = await import('./flows/admin-edit.js');
      await handleEditPhoto(ctx, session);
      return;
    }

    await ctx.reply('Фото можно прикрепить, когда бот попросит об этом. Открой меню /menu.');
  } catch (error) {
    console.error('Ошибка обработчика фото:', error.message);
    await ctx.reply(TEXTS.errors.somethingWentWrong, { parse_mode: 'HTML' });
  }
});

// Старые кнопки: показываем актуальное меню вместо «вечной загрузки»
bot.on('callback_query', async (ctx) => {
  await answerCb(ctx, TEXTS.errors.staleMenu);
  const user = await getUserByTgId(ctx.from.id);
  if (user) await showMenuPage1(ctx);
  else await replyOrEdit(ctx, TEXTS.errors.notRegistered, {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.register, callback_data: 'reg:start' }]] },
  });
});

export { startAdd, startEdit, startComplaint, startLogin, startClassBroadcast, startCreatorBroadcast };

bot.on('document', async (ctx) => {
  const session = await getSession(ctx.from.id);
  if (session.step === 'schedule:upload') {
    await ctx.reply(TEXTS.schedule.onlyPhoto);
    return;
  }
  await ctx.reply('Документы не принимаются. Пришли фото, когда бот попросит.');
});
