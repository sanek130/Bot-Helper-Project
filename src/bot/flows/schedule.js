import bot, { answerCb, replyOrEdit } from '../bot.js';
import { TEXTS } from '../texts.js';
import { scheduleKeyboard } from '../keyboards.js';
import { getUserByTgId } from '../../services/userService.js';
import { getClassKey, getSchedulePhotoId, setSchedulePhotoId, touchUserActivity } from '../../services/homeworkService.js';
import { setSession, getSession, clearSession } from '../sessions.js';
import { escapeHtml } from '../../utils/normalize.js';

function isAdmin(user) {
  return user?.role === 'admin' || user?.role === 'creator';
}

export async function showSchedule(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) {
    await replyOrEdit(ctx, TEXTS.errors.notRegistered);
    return;
  }

  const photoId = await getSchedulePhotoId(getClassKey(user));
  const caption = TEXTS.schedule.caption
    .replace('{city}', escapeHtml(user.city || ''))
    .replace('{school}', escapeHtml(user.school || ''))
    .replace('{class}', escapeHtml(user.class || ''));

  const keyboard = scheduleKeyboard(isAdmin(user));

  if (!photoId) {
    await replyOrEdit(ctx, TEXTS.schedule.empty, keyboard);
    return;
  }

  try {
    await ctx.replyWithPhoto(photoId, { caption, parse_mode: 'HTML', ...keyboard });
    await answerCb(ctx);
  } catch (error) {
    console.error('Не удалось отправить расписание:', error.message);
    await replyOrEdit(ctx, TEXTS.schedule.outdated, keyboard);
  }
}

export async function startScheduleUpload(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  if (!isAdmin(user)) {
    await answerCb(ctx, TEXTS.errors.noPermission);
    return;
  }

  await setSession(ctx.from.id, 'schedule:upload', {});
  await answerCb(ctx);
  await replyOrEdit(ctx, TEXTS.schedule.uploadPrompt, {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.cancel, callback_data: 'reg:cancel' }]] },
  });
}

export async function handleSchedulePhoto(ctx, session) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user || !isAdmin(user)) {
    await clearSession(ctx.from.id);
    return;
  }

  const photos = ctx.message.photo || [];
  const largest = photos[photos.length - 1];
  if (!largest?.file_id) {
    await ctx.reply(TEXTS.schedule.onlyPhoto);
    return;
  }

  await setSchedulePhotoId(getClassKey(user), largest.file_id);
  await clearSession(ctx.from.id);
  await touchUserActivity(user.tgId);

  await ctx.reply(TEXTS.schedule.updated, {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.show, callback_data: 'schedule' }], [{ text: TEXTS.buttons.menu, callback_data: 'menu1' }]] },
  });
}

bot.command('schedule', async (ctx) => showSchedule(ctx));

bot.action('schedule', async (ctx) => {
  await answerCb(ctx);
  await showSchedule(ctx);
});

bot.action('schedule:update', async (ctx) => {
  await startScheduleUpload(ctx);
});

// Текст и файл вместо фото в режиме загрузки расписания
export async function handleScheduleText(ctx, session) {
  if (session.step !== 'schedule:upload') return false;
  await ctx.reply(TEXTS.schedule.onlyPhoto);
  return true;
}
