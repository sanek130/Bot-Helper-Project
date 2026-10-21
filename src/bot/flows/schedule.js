import bot, { replyOrEdit, safeAnswerCb, setSessionStep, getSessionData, clearSession } from '../bot.js';
import { TEXTS } from '../texts.js';
import { scheduleKeyboard } from '../keyboards.js';
import { getUserByTgId } from '../../services/userService.js';
import { getClassKey, getSchedulePhotoId, setSchedulePhotoId } from '../../services/homeworkService.js';

// Команда /schedule и кнопка
bot.command('schedule', async (ctx) => {
  await showSchedule(ctx);
});

bot.action('schedule', async (ctx) => {
  await showSchedule(ctx);
});

async function showSchedule(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user) {
    await ctx.reply(TEXTS.errors.notRegistered, { parse_mode: 'HTML' });
    return;
  }
  
  const classKey = getClassKey(user);
  const photoId = await getSchedulePhotoId(classKey);
  const isAdmin = user.role === 'admin' || user.role === 'creator';
  
  if (photoId) {
    const msg = `<b>${TEXTS.schedule.title}</b>\n\nГород: ${user.city || '—'}\nШкола: ${user.school || '—'}\nКласс: ${user.class}`;
    
    try {
      await ctx.replyWithPhoto(photoId, { caption: msg, parse_mode: 'HTML' });
      
      const keyboard = scheduleKeyboard(isAdmin);
      await ctx.reply('Действия:', keyboard);
    } catch (e) {
      console.error('Ошибка отправки фото расписания:', e);
      await ctx.reply(TEXTS.schedule.outdated, { parse_mode: 'HTML' });
      const keyboard = scheduleKeyboard(isAdmin);
      await replyOrEdit(ctx, TEXTS.schedule.outdated, keyboard);
    }
  } else {
    const msg = `<b>${TEXTS.schedule.title}</b>\n\n${TEXTS.schedule.notFound}`;
    const keyboard = scheduleKeyboard(isAdmin);
    await safeAnswerCb(ctx);
    await replyOrEdit(ctx, msg, keyboard);
  }
}

// Загрузка расписания (админ)
bot.action('uploadSchedule', async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user || (user.role !== 'admin' && user.role !== 'creator')) {
    await safeAnswerCb(ctx, TEXTS.errors.noPermission);
    return;
  }
  
  await setSessionStep(ctx, 'uploadingSchedule', { classKey: getClassKey(user) });
  const msg = TEXTS.schedule.uploadPrompt;
  const keyboard = { reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.cancel, callback_data: 'cancel' }]] } };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});

// Обработка фото расписания
bot.on('message', async (ctx) => {
  const step = getSessionData(ctx, 'step');
  
  if (step === 'uploadingSchedule') {
    const user = await getUserByTgId(ctx.from?.id);
    
    if (!user || (user.role !== 'admin' && user.role !== 'creator')) {
      await clearSession(ctx);
      return;
    }
    
    if (ctx.message.photo) {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const photoId = photo.file_id;
      const classKey = getSessionData(ctx, 'classKey') || getClassKey(user);
      
      await setSchedulePhotoId(classKey, photoId);
      await clearSession(ctx);
      
      const msg = TEXTS.schedule.updated;
      const keyboard = scheduleKeyboard(true);
      await safeAnswerCb(ctx);
      await replyOrEdit(ctx, msg, keyboard);
    } else {
      await ctx.reply(TEXTS.schedule.onlyPhoto, { parse_mode: 'HTML' });
    }
  }
});
