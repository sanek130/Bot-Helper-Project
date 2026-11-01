import { TEXTS } from '../texts.js';
import { getScheduleKeyboard, getScheduleUpdatedKeyboard, getCancelKeyboard, getMenuOnlyKeyboard } from '../keyboards.js';
import { show, say } from '../ui.js';
import { setSession, clearSession } from '../sessions.js';
import { requireActive, requireAdmin, getWorkClassKey } from '../guards.js';
import { getClassKey, getSchedulePhoto, setSchedulePhoto, parseClassKey } from '../../services/homeworkService.js';
import { fill } from '../../utils/normalize.js';
import { capitalize } from '../../utils/subjects.js';

// Модератор и создатель видят расписание выбранного рабочего класса — того же,
// для которого они его обновляют; остальные — расписание своего класса.
function scheduleClassKey(user) {
  return getWorkClassKey(user);
}

export async function showSchedule(ctx, { forceNew = false } = {}) {
  const user = await requireActive(ctx);
  if (!user) return null;
  const classKey = scheduleClassKey(user);
  if (!classKey) return show(ctx, TEXTS.NO_CLASS, getMenuOnlyKeyboard());
  const photoId = await getSchedulePhoto(classKey);
  if (!photoId) return (forceNew ? say : show)(ctx, TEXTS.SCHEDULE_EMPTY, getScheduleKeyboard(user, false));
  const { school, class: className } = parseClassKey(classKey);
  const ownClass = user.school && user.class && classKey === getClassKey(user.school, user.class);
  const caption = fill(TEXTS.SCHEDULE_CAPTION, {
    city: ownClass ? capitalize(user.city) : '—',
    school: capitalize(school),
    class: className,
  });
  try {
    return await ctx.replyWithPhoto(photoId, { caption, parse_mode: 'HTML', ...getScheduleKeyboard(user, true) });
  } catch {
    return say(ctx, TEXTS.PHOTO_EXPIRED, getScheduleKeyboard(user, false));
  }
}

export async function startScheduleUpload(ctx) {
  const user = await requireAdmin(ctx);
  if (!user) return null;
  const classKey = getWorkClassKey(user);
  if (!classKey) return show(ctx, TEXTS.NO_CLASS, getMenuOnlyKeyboard());
  await setSession(ctx.from.id, 'telegram', 'schedule:upload', { classKey });
  return say(ctx, TEXTS.SCHEDULE_UPLOAD, getCancelKeyboard());
}

export async function handleSchedulePhoto(ctx) {
  const user = await requireAdmin(ctx);
  if (!user) return null;
  const classKey = getWorkClassKey(user);
  if (!classKey) return say(ctx, TEXTS.NO_CLASS, getMenuOnlyKeyboard());
  const photos = ctx.message.photo || [];
  const fileId = photos[photos.length - 1]?.file_id;
  if (!fileId) return say(ctx, TEXTS.SCHEDULE_PHOTO_ONLY, getCancelKeyboard());
  await setSchedulePhoto(classKey, fileId);
  await clearSession(ctx.from.id, 'telegram');
  return say(ctx, TEXTS.SCHEDULE_UPDATED, getScheduleUpdatedKeyboard());
}

export async function handleScheduleText(ctx) {
  return say(ctx, TEXTS.SCHEDULE_PHOTO_ONLY, getCancelKeyboard());
}

export function scheduleFlow(bot) {
  bot.action('schedule:show', async (ctx) => showSchedule(ctx, { forceNew: true }));
  bot.action('schedule:upload', async (ctx) => startScheduleUpload(ctx));
}
