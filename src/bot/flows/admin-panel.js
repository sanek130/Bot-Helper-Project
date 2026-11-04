import { TEXTS } from '../texts.js';
import { getAdminPanelKeyboard, getPickClassKeyboard, getMenuOnlyKeyboard, getBackCancelKeyboard } from '../keyboards.js';
import { show, say } from '../ui.js';
import { getSession, setSession, clearSession } from '../sessions.js';
import { requireAdmin, requireCreator, requireModerator, canModerate, getWorkClassKey } from '../guards.js';
import { isModerator } from '../roles.js';
import { getAdminStats } from '../../services/statsService.js';
import { countUsersOverview, setWorkClassKey } from '../../services/userService.js';
import { countOpenReports } from '../../services/reportService.js';
import { countOpenTickets } from '../../services/supportService.js';
import { listClassKeys, getClassKey } from '../../services/homeworkService.js';
import { fill } from '../../utils/normalize.js';

export { requireAdmin, requireCreator, requireModerator, canModerate };

// Права + рабочий класс одной проверкой: без класса админ-флоу продолжать бессмысленно.
export async function requireAdminClass(ctx, deniedText = TEXTS.NO_RIGHTS) {
  const user = await requireAdmin(ctx, deniedText);
  if (!user) return null;
  const classKey = getWorkClassKey(user);
  if (!classKey) {
    await show(ctx, isModerator(user) ? TEXTS.PICK_CLASS_EMPTY : TEXTS.NO_CLASS, getMenuOnlyKeyboard(user));
    return null;
  }
  return { user, classKey };
}

export async function showAdminPanel(ctx, { forceNew = false } = {}) {
  const user = await requireAdmin(ctx);
  if (!user) return null;
  const output = forceNew ? say : show;
  if (isModerator(user)) {
    const [overview, openReports, openTickets] = await Promise.all([countUsersOverview(), countOpenReports(), countOpenTickets()]);
    const text = fill(TEXTS.CREATOR_PANEL_SHORT, {
      ...overview,
      openReports,
      openTickets,
      classKey: getWorkClassKey(user) || '—',
    });
    return output(ctx, text, getAdminPanelKeyboard(user));
  }
  const stats = await getAdminStats(ctx.from.id);
  const text = fill(TEXTS.ADMIN_PANEL, { warns: user.warns || 0, myCount: stats.myCount, othersCount: stats.othersCount });
  return output(ctx, text, getAdminPanelKeyboard(user));
}

async function showPickClass(ctx) {
  const user = await requireModerator(ctx);
  if (!user) return null;
  const classKeys = await listClassKeys(30);
  await setSession(ctx.from.id, 'telegram', 'adm:pick_class', { classKeys });
  const text = classKeys.length ? TEXTS.PICK_CLASS : TEXTS.PICK_CLASS_EMPTY;
  return show(ctx, text, classKeys.length ? getPickClassKeyboard(classKeys, user) : getBackCancelKeyboard('adm:panel', user));
}

async function applyWorkClass(ctx, classKey) {
  const user = await setWorkClassKey(ctx.from.id, classKey);
  await clearSession(ctx.from.id, 'telegram');
  return say(ctx, fill(TEXTS.PICK_CLASS_DONE, { classKey }), getAdminPanelKeyboard(user));
}

// Ручной ввод класса: школа приводится к нижнему регистру, буква класса — к верхнему,
// как это делает регистрация («гимназия 25» и «10А»).
export function parseManualClassKey(text) {
  const [schoolRaw, classRaw] = String(text ?? '').split('::');
  const school = String(schoolRaw ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  const match = String(classRaw ?? '').replace(/\s+/g, '').match(/^(\d{1,2})([а-яё])$/i);
  if (!school || school.length > 80 || !match) return null;
  const number = Number(match[1]);
  if (number < 1 || number > 11) return null;
  return getClassKey(school, `${number}${match[2].toUpperCase()}`);
}

export async function handleAdminPanelText(ctx, session, text) {
  if (session.step !== 'adm:pick_class') {
    await clearSession(ctx.from.id, 'telegram');
    return showAdminPanel(ctx, { forceNew: true });
  }
  const user = await requireModerator(ctx);
  if (!user) return null;
  const classKey = parseManualClassKey(text);
  if (!classKey) return say(ctx, TEXTS.PICK_CLASS_INVALID, getBackCancelKeyboard('adm:panel', user));
  return applyWorkClass(ctx, classKey);
}

export function adminPanelFlow(bot) {
  bot.action('adm:panel', async (ctx) => {
    await clearSession(ctx.from.id, 'telegram');
    return showAdminPanel(ctx);
  });

  bot.command('admin', async (ctx) => {
    await clearSession(ctx.from.id, 'telegram');
    return showAdminPanel(ctx, { forceNew: true });
  });

  bot.action('adm:pick_class', async (ctx) => showPickClass(ctx));

  bot.action(/^adm:class:(\d{1,2})$/, async (ctx) => {
    const user = await requireModerator(ctx);
    if (!user) return null;
    const session = await getSession(ctx.from.id, 'telegram');
    const classKey = session?.step === 'adm:pick_class' ? session.data?.classKeys?.[Number(ctx.match[1])] : null;
    if (!classKey) return showPickClass(ctx);
    return applyWorkClass(ctx, classKey);
  });
}
