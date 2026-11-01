import { TEXTS, ROLE_LABELS, KEYBOARD_ITEMS } from '../texts.js';
import {
  getProfileKeyboard,
  getBackToProfileKeyboard,
  getLogoutConfirmKeyboard,
  getLogoutDoneKeyboard,
  getProfileMenuKeyboard,
  getMenuProfileKeyboard,
  getDemoteConfirmKeyboard,
  getKbSettingsKeyboard,
  getKbPreviewBackKeyboard,
  getRegLetterKeyboard,
  getRegNumberKeyboard,
  getReplyKeyboard,
} from '../keyboards.js';
import { show, say, toast } from '../ui.js';
import { getSession, setSession, clearSession, clearAllSessions } from '../sessions.js';
import { requireActive } from '../guards.js';
import { isAdmin } from '../roles.js';
import { unlinkTelegram, updateUserClass, setRole, demoteToUser, setCustomKeyboard } from '../../services/userService.js';
import { fill } from '../../utils/normalize.js';
import { capitalize } from '../../utils/subjects.js';

const dateFormatter = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', year: 'numeric' });

export function formatDate(value) {
  if (!value) return '—';
  return dateFormatter.format(new Date(value));
}

export function profileText(user) {
  const stats = user.stats || {};
  let text = fill(TEXTS.PROFILE_CARD, {
    firstName: user.firstName || '—',
    username: user.username || 'нет',
    specId: user.specId,
    city: user.city,
    school: capitalize(user.school),
    class: user.class,
    role: ROLE_LABELS[user.role] || user.role,
    registeredAt: formatDate(user.registeredAt || user.createdAt),
    homeworkViews: stats.homeworkViews || 0,
  });
  if (isAdmin(user)) text += `\n${fill(TEXTS.PROFILE_ADDED_LINE, { homeworkAdded: stats.homeworkAdded || 0 })}`;
  if (user.role === 'admin') text += `\n${fill(TEXTS.PROFILE_WARNS_LINE, { warns: user.warns || 0 })}`;
  return text;
}

export async function showProfile(ctx) {
  const user = await requireActive(ctx);
  if (!user) return null;
  const session = await getSession(ctx.from.id, 'telegram');
  if (session?.step?.startsWith('prof:')) await clearSession(ctx.from.id, 'telegram');
  return show(ctx, profileText(user), getProfileKeyboard(user));
}

function availableItems(user) {
  return KEYBOARD_ITEMS.filter((item) => item !== 'Админ-панель' || isAdmin(user));
}

async function showKbSettings(ctx, user, selected) {
  return show(ctx, TEXTS.KB_SETTINGS, getKbSettingsKeyboard(selected, user));
}

export async function handleProfileLetter(ctx, letter) {
  const user = await requireActive(ctx);
  if (!user) return null;
  const value = String(letter || '').trim();
  if (!/^[а-яё]$/i.test(value)) return say(ctx, TEXTS.REG_LETTER_INVALID, getRegLetterKeyboard('prof'));
  await setSession(ctx.from.id, 'telegram', 'prof:change_number', { letter: value.toUpperCase().replace('Ё', 'Е') });
  return show(ctx, TEXTS.REG_STEP_3_NUMBER, getRegNumberKeyboard('prof'));
}

export async function handleProfileNumber(ctx, number) {
  const user = await requireActive(ctx);
  if (!user) return null;
  const session = await getSession(ctx.from.id, 'telegram');
  const letter = session?.data?.letter;
  if (!letter) {
    await setSession(ctx.from.id, 'telegram', 'prof:change_letter', {});
    return show(ctx, TEXTS.REG_STEP_3_LETTER, getRegLetterKeyboard('prof'));
  }
  const value = Number(number);
  if (!Number.isInteger(value) || value < 4 || value > 11) {
    return say(ctx, TEXTS.REG_NUMBER_INVALID, getRegNumberKeyboard('prof'));
  }
  const newClass = `${value}${letter}`;
  await updateUserClass(ctx.from.id, newClass);
  await clearSession(ctx.from.id, 'telegram');
  return show(ctx, fill(TEXTS.PROFILE_CLASS_CHANGED, { newClass }), getProfileMenuKeyboard());
}

// Текстовый ввод на шагах смены класса (вызывается из router.js).
export async function handleProfileText(ctx, session, text) {
  if (session.step === 'prof:change_letter') return handleProfileLetter(ctx, text);
  if (session.step === 'prof:change_number') return handleProfileNumber(ctx, text.trim());
  await clearSession(ctx.from.id, 'telegram');
  return showProfile(ctx);
}

export function profileFlow(bot) {
  bot.command('profile', async (ctx) => showProfile(ctx));
  bot.action('prof:open', async (ctx) => showProfile(ctx));

  bot.action('prof:copy_id', async (ctx) => {
    const user = await requireActive(ctx);
    if (!user) return null;
    return say(ctx, fill(TEXTS.PROFILE_COPY_ID, { specId: user.specId }), getBackToProfileKeyboard());
  });

  bot.action('prof:logout', async (ctx) => {
    const user = await requireActive(ctx);
    if (!user) return null;
    return show(ctx, TEXTS.PROFILE_LOGOUT_CONFIRM, getLogoutConfirmKeyboard());
  });

  bot.action('prof:logout_yes', async (ctx) => {
    const user = await requireActive(ctx);
    if (!user) return null;
    await unlinkTelegram(ctx.from.id);
    await clearAllSessions(ctx.from.id);
    return show(ctx, TEXTS.PROFILE_LOGOUT_DONE, getLogoutDoneKeyboard());
  });

  bot.action('prof:logout_no', async (ctx) => showProfile(ctx));

  bot.action('prof:change_class', async (ctx) => {
    const user = await requireActive(ctx);
    if (!user) return null;
    if (user.role !== 'user') {
      await toast(ctx, TEXTS.PROFILE_ONLY_USER, true);
      return showProfile(ctx);
    }
    await setSession(ctx.from.id, 'telegram', 'prof:change_letter', {});
    return show(ctx, TEXTS.REG_STEP_3_LETTER, getRegLetterKeyboard('prof'));
  });

  bot.action('prof:become_admin', async (ctx) => {
    const user = await requireActive(ctx);
    if (!user) return null;
    if (user.adminBanned) return show(ctx, TEXTS.PROFILE_ADMIN_BANNED, getProfileMenuKeyboard());
    if (user.role !== 'user') {
      await toast(ctx, TEXTS.PROFILE_ONLY_USER, true);
      return showProfile(ctx);
    }
    // Админ назначается сразу, без заявки создателю.
    await setRole(ctx.from.id, 'admin');
    return show(ctx, TEXTS.PROFILE_BECAME_ADMIN, getMenuProfileKeyboard());
  });

  bot.action('prof:demote', async (ctx) => {
    const user = await requireActive(ctx);
    if (!user) return null;
    if (user.role !== 'admin') {
      await toast(ctx, TEXTS.PROFILE_ONLY_ADMIN, true);
      return showProfile(ctx);
    }
    return show(ctx, TEXTS.PROFILE_DEMOTE_CONFIRM, getDemoteConfirmKeyboard());
  });

  bot.action('prof:demote_yes', async (ctx) => {
    const user = await requireActive(ctx);
    if (!user) return null;
    if (user.role !== 'admin') return showProfile(ctx);
    const updated = await demoteToUser(ctx.from.id);
    return show(ctx, fill(TEXTS.PROFILE_DEMOTED, { warns: updated?.warns || 0 }), getProfileMenuKeyboard());
  });

  // Выбор хранится в сессии до нажатия «Применить», чтобы случайные нажатия не меняли клавиатуру.
  bot.action('prof:kb_open', async (ctx) => {
    const user = await requireActive(ctx);
    if (!user) return null;
    const selected = (user.customKeyboard || []).filter((item) => availableItems(user).includes(item));
    await setSession(ctx.from.id, 'telegram', 'prof:kb', { selected });
    return showKbSettings(ctx, user, selected);
  });

  bot.action(/^prof:kb_toggle:(.{1,20})$/, async (ctx) => {
    const user = await requireActive(ctx);
    if (!user) return null;
    const item = ctx.match[1];
    if (!availableItems(user).includes(item)) {
      await toast(ctx, TEXTS.STALE_MENU);
      return showProfile(ctx);
    }
    const session = await getSession(ctx.from.id, 'telegram');
    const current = Array.isArray(session?.data?.selected) ? session.data.selected : user.customKeyboard || [];
    const selected = current.includes(item) ? current.filter((value) => value !== item) : [...current, item];
    const ordered = availableItems(user).filter((value) => selected.includes(value));
    await setSession(ctx.from.id, 'telegram', 'prof:kb', { selected: ordered });
    return showKbSettings(ctx, user, ordered);
  });

  bot.action('prof:kb_apply', async (ctx) => {
    const user = await requireActive(ctx);
    if (!user) return null;
    const session = await getSession(ctx.from.id, 'telegram');
    const selected = Array.isArray(session?.data?.selected) ? session.data.selected : user.customKeyboard || [];
    const updated = await setCustomKeyboard(ctx.from.id, selected);
    await clearSession(ctx.from.id, 'telegram');
    await say(ctx, TEXTS.KB_APPLIED, getReplyKeyboard(updated));
    return say(ctx, TEXTS.KB_NEXT, getProfileMenuKeyboard());
  });

  bot.action('prof:kb_preview', async (ctx) => {
    const user = await requireActive(ctx);
    if (!user) return null;
    await say(ctx, TEXTS.KB_PREVIEW, getReplyKeyboard(user));
    return say(ctx, TEXTS.KB_PREVIEW_HINT, getKbPreviewBackKeyboard());
  });
}
