import bot, { answerCb, replyOrEdit } from '../bot.js';
import { TEXTS } from '../texts.js';
import {
  profileKeyboard,
  keyboardSettingsKeyboard,
  reRegisterKeyboard,
  replyKeyboard,
  classLetterKeyboard,
  classNumberKeyboard,
  adminRequestKeyboard,
} from '../keyboards.js';
import { getSession, setSession, clearSession, clearAllSessions } from '../sessions.js';
import {
  getUserByTgId,
  updateByTgId,
  unlinkTelegram,
  demoteUser,
  promoteUser,
} from '../../services/userService.js';
import { getClassKey, renameClassKey } from '../../services/homeworkService.js';
import { revokeAllTokens } from '../../web/auth.js';
import { escapeHtml } from '../../utils/normalize.js';
import { showMenuPage1 } from './menu.js';
import config from '../../config.js';

const AVAILABLE_BUTTONS = ['Сегодня', 'Завтра', 'Послезавтра', 'Неделя', 'Расписание', 'Профиль', 'Помощь', 'Веб-версия', 'Статистика'];

function roleLabel(user) {
  return TEXTS.roles[user.role] || TEXTS.roles.user;
}

export async function showProfile(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) {
    await replyOrEdit(ctx, TEXTS.errors.notRegistered);
    return;
  }

  let body = TEXTS.profile.body
    .replace('{firstName}', escapeHtml(user.firstName || '—'))
    .replace('{username}', escapeHtml(user.username || '—'))
    .replace('{specId}', user.specId)
    .replace('{city}', escapeHtml(user.city || '—'))
    .replace('{school}', escapeHtml(user.school || '—'))
    .replace('{class}', escapeHtml(user.class || '—'))
    .replace('{role}', roleLabel(user))
    .replace('{registeredAt}', new Date(user.registeredAt).toLocaleDateString('ru-RU'))
    .replace('{homeworkViews}', user.stats?.homeworkViews || 0);

  if (user.role === 'admin' || user.role === 'creator') {
    body += `\n${TEXTS.profile.adminAdded.replace('{homeworkAdded}', user.stats?.homeworkAdded || 0)}`;
  }
  if (user.role === 'admin') {
    body += `\n${TEXTS.profile.warns.replace('{warns}', user.warns || 0)}`;
  }

  await replyOrEdit(ctx, `<b>${TEXTS.profile.title}</b>\n${body}`, profileKeyboard(user));
}

async function showKeyboardSettings(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;

  const available = [...AVAILABLE_BUTTONS];
  if (user.role === 'admin' || user.role === 'creator') available.push('Админ-панель');

  const selected = (user.customKeyboard || ['Сегодня', 'Завтра', 'Меню']).filter((button) => available.includes(button) || button === 'Меню');
  await setSession(ctx.from.id, 'kb', { available, selected });
  await replyOrEdit(ctx, TEXTS.profile.keyboardConfig, keyboardSettingsKeyboard(available, selected));
}

async function toggleKeyboardButton(ctx, index) {
  const session = await getSession(ctx.from.id);
  const available = session.data.available || [];
  const selected = [...(session.data.selected || [])];
  const button = available[index];

  if (!button) {
    await answerCb(ctx, TEXTS.errors.staleMenu);
    return;
  }

  const position = selected.indexOf(button);
  if (position === -1) selected.push(button);
  else selected.splice(position, 1);

  await setSession(ctx.from.id, 'kb', { available, selected });
  await answerCb(ctx);
  await replyOrEdit(ctx, TEXTS.profile.keyboardConfig, keyboardSettingsKeyboard(available, selected));
}

async function applyKeyboard(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  const session = await getSession(ctx.from.id);
  if (!user) return;

  const selected = session.data.selected || ['Сегодня', 'Завтра', 'Меню'];
  await updateByTgId(user.tgId, { customKeyboard: selected });
  await clearSession(ctx.from.id);
  await answerCb(ctx, TEXTS.profile.keyboardApplied);
  await ctx.reply(TEXTS.profile.keyboardApplied, replyKeyboard(selected));
  await showProfile(ctx);
}

async function startClassChange(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  if (user.role !== 'user') {
    await answerCb(ctx, TEXTS.errors.noPermission);
    return;
  }
  await setSession(ctx.from.id, 'cls:letter', {});
  await answerCb(ctx);
  await replyOrEdit(
    ctx,
    `<b>${TEXTS.registration.step3_letter.title}</b>\n${TEXTS.registration.step3_letter.body}`,
    classLetterKeyboard()
  );
}

async function showClassNumber(ctx, letter) {
  await setSession(ctx.from.id, 'cls:number', { letter });
  await replyOrEdit(
    ctx,
    `<b>${TEXTS.registration.step3_number.title}</b>\n${TEXTS.registration.step3_number.body}`,
    classNumberKeyboard()
  );
}

async function finishClassChange(ctx, number, letter) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;

  const oldKey = getClassKey(user);
  const className = `${number}${letter}`;
  const updated = await updateByTgId(user.tgId, { class: className });

  await renameClassKey(oldKey, getClassKey(updated));
  await clearSession(ctx.from.id);

  await replyOrEdit(ctx, TEXTS.profile.classChanged.replace('{class}', className), {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.profile, callback_data: 'profile' }, { text: TEXTS.buttons.menu, callback_data: 'menu1' }]] },
  });
}

export async function handleClassText(ctx, session) {
  const text = ctx.message.text.trim();

  if (session.step === 'cls:letter') {
    const letter = text.toUpperCase();
    if (!/^[А-ЯЁ]$/.test(letter)) {
      await ctx.reply('Напиши одну букву от А до Я.');
      return true;
    }
    await showClassNumber(ctx, letter);
    return true;
  }

  if (session.step === 'cls:number') {
    const number = text.replace(/\D/g, '');
    if (!/^(4|5|6|7|8|9|10|11)$/.test(number)) {
      await ctx.reply('Напиши цифру от 4 до 11.');
      return true;
    }
    await finishClassChange(ctx, number, session.data.letter);
    return true;
  }

  return false;
}

async function requestAdmin(ctx) {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;

  if (user.pendingAdminRequest) {
    await answerCb(ctx, TEXTS.profile.adminRequestExists);
    return;
  }
  if (user.adminBanned) {
    await answerCb(ctx, TEXTS.profile.adminBanned);
    return;
  }

  await updateByTgId(user.tgId, { pendingAdminRequest: true });
  await answerCb(ctx, TEXTS.profile.adminRequestSent);

  const text = `👑 <b>Заявка на администратора</b>\nПользователь: ${escapeHtml(user.firstName || '—')}\nUsername: @${escapeHtml(user.username || 'нет')}\nШкола: ${escapeHtml(user.school || '—')}\nКласс: ${escapeHtml(user.class)}\n\nОдобрить или отклонить?`;

  for (const moderatorId of config.moderators.ids) {
    try {
      await bot.telegram.sendMessage(moderatorId, text, { parse_mode: 'HTML', ...adminRequestKeyboard(user.specId) });
    } catch {
      // создатель мог не начинать чат с ботом
    }
  }

  await ctx.reply(TEXTS.profile.adminRequestSent);
}

bot.command('profile', async (ctx) => showProfile(ctx));

bot.action('profile', async (ctx) => {
  await answerCb(ctx);
  await showProfile(ctx);
});

bot.action('prof:copy', async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  await answerCb(ctx);
  await ctx.reply(user.specId, { parse_mode: 'HTML' });
  await ctx.reply(`<code>${user.specId}</code>`, { parse_mode: 'HTML' });
});

bot.action('prof:logout', async (ctx) => {
  await answerCb(ctx);
  await replyOrEdit(ctx, TEXTS.profile.logoutWarning, {
    reply_markup: { inline_keyboard: [[{ text: 'Да, удалить', callback_data: 'prof:logout_yes' }], [{ text: 'Нет, оставить', callback_data: 'profile' }]] },
  });
});

bot.action('prof:logout_yes', async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;

  await unlinkTelegram(user.tgId);
  await clearAllSessions(user.tgId);
  await revokeAllTokens(user.specId);
  await answerCb(ctx);

  await replyOrEdit(ctx, TEXTS.profile.logoutDone, {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.register, callback_data: 'reg:start' }], [{ text: TEXTS.buttons.menu, callback_data: 'menu1' }]] },
  });
});

bot.action('prof:class', async (ctx) => startClassChange(ctx));

bot.action(/^cls:letter:([А-ЯЁ])$/, async (ctx) => {
  await answerCb(ctx);
  await showClassNumber(ctx, ctx.match[1]);
});

bot.action(/^cls:num:(\d+)$/, async (ctx) => {
  const session = await getSession(ctx.from.id);
  await answerCb(ctx);
  await finishClassChange(ctx, ctx.match[1], session.data.letter);
});

bot.action('cls:back:letter', async (ctx) => {
  await answerCb(ctx);
  await startClassChange(ctx);
});

bot.action('prof:request_admin', async (ctx) => requestAdmin(ctx));

bot.action('prof:demote', async (ctx) => {
  await answerCb(ctx);
  await replyOrEdit(ctx, TEXTS.profile.demoteWarning, {
    reply_markup: { inline_keyboard: [[{ text: TEXTS.buttons.yesShort, callback_data: 'prof:demote_yes' }, { text: TEXTS.buttons.no, callback_data: 'profile' }]] },
  });
});

bot.action('prof:demote_yes', async (ctx) => {
  const user = await getUserByTgId(ctx.from?.id);
  if (!user) return;
  if (user.role !== 'admin') {
    await answerCb(ctx, TEXTS.errors.noPermission);
    return;
  }
  await demoteUser(user.tgId);
  await answerCb(ctx, TEXTS.profile.demoted);
  await showProfile(ctx);
});

bot.action('kb:open', async (ctx) => {
  await answerCb(ctx);
  await showKeyboardSettings(ctx);
});

bot.action(/^kb:toggle:(\d+)$/, async (ctx) => toggleKeyboardButton(ctx, Number(ctx.match[1])));

bot.action('kb:apply', async (ctx) => applyKeyboard(ctx));

bot.action('kb:preview', async (ctx) => {
  const session = await getSession(ctx.from.id);
  await answerCb(ctx);
  await ctx.reply(TEXTS.profile.keyboardPreview, replyKeyboard(session.data.selected || ['Меню']));
});

export { roleLabel, showMenuPage1 };
