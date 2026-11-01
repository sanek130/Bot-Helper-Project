import { TEXTS, ROLE_LABELS } from '../texts.js';
import {
  getMenuPage1Keyboard,
  getMenuPage2Keyboard,
  getUnregisteredKeyboard,
  getWebAppKeyboard,
  getWebSiteKeyboard,
  getWebOpenKeyboard,
} from '../keyboards.js';
import { show, say } from '../ui.js';
import { getSession, clearSession } from '../sessions.js';
import { loadUser } from '../guards.js';
import { fill } from '../../utils/normalize.js';
import { capitalize } from '../../utils/subjects.js';
import { getToday, getTomorrow, getAfterTomorrow } from '../../utils/dateService.js';

// Возврат в меню завершает незаконченный шаг (кроме регистрации: её данные живут в черновике).
async function dropFlowSession(ctx) {
  const session = await getSession(ctx.from.id, 'telegram');
  if (session && !session.step.startsWith('reg:')) await clearSession(ctx.from.id, 'telegram');
}

export function menuText(user) {
  return fill(TEXTS.MENU_PAGE_1, {
    username: user.username || user.firstName || 'без ника',
    role: ROLE_LABELS[user.role] || user.role,
    school: capitalize(user.school),
    class: user.class,
  });
}

export async function showMenuPage1(ctx, { forceNew = false } = {}) {
  const user = await loadUser(ctx);
  const send = forceNew ? say : show;
  if (!user || user.status !== 'active') return send(ctx, TEXTS.UNREGISTERED_ACCESS, getUnregisteredKeyboard());
  await dropFlowSession(ctx);
  return send(ctx, menuText(user), getMenuPage1Keyboard(user));
}

export async function showMenuPage2(ctx) {
  const user = await loadUser(ctx);
  if (!user || user.status !== 'active') return show(ctx, TEXTS.UNREGISTERED_ACCESS, getUnregisteredKeyboard());
  await dropFlowSession(ctx);
  return show(ctx, TEXTS.MENU_PAGE_2, getMenuPage2Keyboard(user));
}

export async function showWebOpen(ctx) {
  return show(ctx, TEXTS.WEB_OPEN, getWebOpenKeyboard());
}

// Модуль ДЗ импортируется лениво: он сам использует меню, и прямой импорт дал бы цикл.
async function homework() {
  return import('./homework.js');
}

async function schedule() {
  return import('./schedule.js');
}

export function menuFlow(bot) {
  bot.command('menu', async (ctx) => showMenuPage1(ctx, { forceNew: true }));
  bot.action('menu:page:1', async (ctx) => showMenuPage1(ctx));
  bot.action('menu:page:2', async (ctx) => showMenuPage2(ctx));

  bot.command('today', async (ctx) => (await homework()).showDayHomework(ctx, getToday()));
  bot.command('tomorrow', async (ctx) => (await homework()).showDayHomework(ctx, getTomorrow()));
  bot.command('after_tomorrow', async (ctx) => (await homework()).showDayHomework(ctx, getAfterTomorrow()));
  bot.command('week', async (ctx) => (await homework()).showWeekHomework(ctx, 0));
  bot.command('schedule', async (ctx) => (await schedule()).showSchedule(ctx));

  bot.command('web_app', async (ctx) => say(ctx, TEXTS.WEB_APP_LINK, getWebAppKeyboard()));
  bot.command('web_site', async (ctx) => say(ctx, TEXTS.WEB_SITE_LINK, getWebSiteKeyboard()));
  bot.command('web', async (ctx) => say(ctx, TEXTS.WEB_OPEN, getWebOpenKeyboard()));
  bot.action('web:open', async (ctx) => showWebOpen(ctx));
}
