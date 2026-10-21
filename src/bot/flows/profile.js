import bot, { replyOrEdit, safeAnswerCb, setSessionStep, getSessionData, clearSession } from '../bot.js';
import { TEXTS } from '../texts.js';
import { profileKeyboard, keyboardSettingsKeyboard } from '../keyboards.js';
import { getUserByTgId, updateUser, deleteUser, demoteToUser, promoteToAdmin, unlinkTelegram } from '../../services/userService.js';
import { escapeHtml } from '../../utils/normalize.js';

// Команда /profile и кнопка
bot.command('profile', async (ctx) => {
  await showProfile(ctx);
});

bot.action('profile', async (ctx) => {
  await showProfile(ctx);
});

async function showProfile(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user) {
    await ctx.reply(TEXTS.errors.notRegistered, { parse_mode: 'HTML' });
    return;
  }
  
  const body = TEXTS.profile.body
    .replace('{firstName}', escapeHtml(user.firstName || '—'))
    .replace('{username}', escapeHtml(user.username ? `@${user.username}` : '—'))
    .replace('{specId}', user.specId)
    .replace('{city}', escapeHtml(user.city || '—'))
    .replace('{school}', escapeHtml(user.school || '—'))
    .replace('{class}', escapeHtml(user.class || '—'))
    .replace('{role}', user.role === 'admin' ? 'Админ' : user.role === 'creator' ? 'Создатель' : 'Участник')
    .replace('{registeredAt}', new Date(user.registeredAt).toLocaleDateString('ru-RU'))
    .replace('{homeworkViews}', user.stats?.homeworkViews || 0)
    .replace('{homeworkAdded}', user.stats?.homeworkAdded || 0)
    .replace('{warns}', user.warns || 0);
  
  const msg = `<b>${TEXTS.profile.title}</b>\n\n${body}`;
  const isAdmin = user.role === 'admin' || user.role === 'creator';
  const isAdminBanned = user.adminBanned;
  const keyboard = profileKeyboard(isAdmin, isAdminBanned);
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

// Копировать спец-ID
bot.action('copyId', async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  
  await ctx.reply(`<code>${user.specId}</code>`, { parse_mode: 'HTML' });
  await safeAnswerCb(ctx);
});

// Настройки клавиатуры
bot.action('keyboardSettings', async (ctx) => {
  await showKeyboardSettings(ctx);
});

async function showKeyboardSettings(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  
  const availableButtons = [
    'Сегодня', 'Завтра', 'Послезавтра', 'Неделя', 'Выбор дня', 'Всё ДЗ', 
    'Расписание', 'Профиль', 'Помощь', 'Веб-версия', 'Статистика'
  ];
  
  if (user.role === 'admin' || user.role === 'creator') {
    availableButtons.push('Админ-панель');
  }
  
  const currentKeyboard = user.customKeyboard || ['Сегодня', 'Завтра', 'Меню'];
  
  const rows = [];
  for (let i = 0; i < availableButtons.length; i += 2) {
    const row = [];
    row.push({
      text: `${currentKeyboard.includes(availableButtons[i]) ? '✅ ' : '☐ '}${availableButtons[i]}`,
      callback_data: `toggle_kb_${i}`
    });
    if (availableButtons[i + 1]) {
      row.push({
        text: `${currentKeyboard.includes(availableButtons[i + 1]) ? '✅ ' : '☐ '}${availableButtons[i + 1]}`,
        callback_data: `toggle_kb_${i + 1}`
      });
    }
    rows.push(row);
  }
  
  rows.push([{ text: 'Меню всегда включён', callback_data: 'noop' }]);
  rows.push([{ text: TEXTS.buttons.apply, callback_data: 'applyKeyboard' }]);
  rows.push([{ text: TEXTS.buttons.preview, callback_data: 'previewKeyboard' }]);
  rows.push([{ text: TEXTS.buttons.cancel, callback_data: 'profile' }]);
  
  const msg = TEXTS.profile.keyboardConfig;
  const keyboard = { reply_markup: { inline_keyboard: rows } };
  
  await setSessionStep(ctx, 'keyboardSettings', { availableButtons, currentKeyboard });
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
}

// Переключение кнопки клавиатуры
bot.action(/^toggle_kb_(\d+)$/, async (ctx) => {
  const index = parseInt(ctx.match[1]);
  const data = getSessionData(ctx);
  const availableButtons = data.availableButtons;
  const currentKeyboard = [...data.currentKeyboard];
  
  const button = availableButtons[index];
  if (!button) return;
  
  const idx = currentKeyboard.indexOf(button);
  if (idx === -1) {
    currentKeyboard.push(button);
  } else {
    currentKeyboard.splice(idx, 1);
  }
  
  // Меню всегда должен быть
  if (!currentKeyboard.includes('Меню')) {
    currentKeyboard.push('Меню');
  }
  
  await setSessionStep(ctx, 'keyboardSettings', { ...data, currentKeyboard });
  await showKeyboardSettings(ctx);
});

// Применить клавиатуру
bot.action('applyKeyboard', async (ctx) => {
  const data = getSessionData(ctx);
  const user = await getUserByTgId(ctx.from?.id);
  
  if (!user || !data.currentKeyboard) return;
  
  await updateUser(user.tgId, { customKeyboard: data.currentKeyboard });
  await clearSession(ctx);
  
  // Отправляем новую клавиатуру
  const keyboard = { reply_markup: { keyboard: data.currentKeyboard.map(b => [b]), resize: true } };
  await ctx.reply('Клавиатура обновлена', keyboard);
  await safeAnswerCb(ctx);
  await showProfile(ctx);
});

// Предпросмотр клавиатуры
bot.action('previewKeyboard', async (ctx) => {
  const data = getSessionData(ctx);
  const keyboard = { reply_markup: { keyboard: data.currentKeyboard.map(b => [b]), resize: true } };
  await ctx.reply('Текущая клавиатура:', keyboard);
  await safeAnswerCb(ctx);
});

// Выйти из аккаунта
bot.action('logout', async (ctx) => {
  const msg = TEXTS.profile.logoutWarning;
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: TEXTS.buttons.yes, callback_data: 'confirmLogout' }],
        [{ text: TEXTS.buttons.no, callback_data: 'profile' }]
      ]
    }
  };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});

bot.action('confirmLogout', async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  
  await unlinkTelegram(user.tgId);
  await clearSession(ctx);
  
  const msg = '✅ Ты вышел из аккаунта. Данные сохранены.\n\nВойди снова по спец-ID из профиля на другой платформе или через /start.';
  await replyOrEdit(ctx, msg, { reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.register, callback_data: 'reg_step1' }]] } });
});

// Стать админом
bot.action('becomeAdmin', async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  
  if (user.pendingAdminRequest) {
    await safeAnswerCb(ctx, 'Заявка уже отправлена');
    return;
  }
  
  // Отправляем заявку создателям
  user.pendingAdminRequest = true;
  await user.save();
  
  const config = (await import('../../config.js')).default;
  
  for (const moderatorId of config.moderators.ids) {
    try {
      await bot.telegram.sendMessage(moderatorId,
        `👑 <b>ЗАЯВКА НА АДМИНА ИЗ ПРОФИЛЯ</b>\n\n` +
        `👤 Пользователь: ${user.firstName}\n` +
        `💬 Username: @${user.username || 'отсутствует'}\n` +
        `🆔 ID: <code>${user.tgId}</code>\n` +
        `🏫 Школа: ${user.school}\n` +
        `🏫 Класс: ${user.class}\n\n` +
        `Одобрить или отклонить?`,
        {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Одобрить', callback_data: `approve_admin_${user.tgId}` }],
              [{ text: '❌ Отклонить', callback_data: `reject_admin_${user.tgId}` }]
            ]
          }
        }
      );
    } catch (e) {
      console.error(`Ошибка отправки заявки модератору ${moderatorId}:`, e);
    }
  }
  
  await safeAnswerCb(ctx, 'Заявка отправлена');
  await ctx.reply('Заявка на роль админа отправлена создателю. Ожидай ответ.');
});

// Стать участником (для админов)
bot.action('becomeUser', async (ctx) => {
  const msg = '⚠️ Понизить до участника?\n\nТы потеряешь возможность добавлять ДЗ и расписание.';
  const keyboard = {
    reply_markup: {
      inline_keyboard: [
        [{ text: TEXTS.buttons.yes, callback_data: 'confirmDemote' }],
        [{ text: TEXTS.buttons.no, callback_data: 'profile' }]
      ]
    }
  };
  
  await safeAnswerCb(ctx);
  await replyOrEdit(ctx, msg, keyboard);
});

bot.action('confirmDemote', async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  
  await demoteToUser(user.tgId);
  await safeAnswerCb(ctx);
  await showProfile(ctx);
});

// Сменить класс
bot.action('changeClass', async (ctx) => {
  // TODO: реализовать смену класса (похоже на регистрацию, но только шаги 3.1 и 3.2)
  await safeAnswerCb(ctx, 'Смена класса в разработке');
});
