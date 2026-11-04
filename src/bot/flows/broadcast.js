import { TEXTS, AUDIENCE_LABELS } from '../texts.js';
import {
  getBroadcastAudienceKeyboard,
  getBroadcastValuesKeyboard,
  getBroadcastConfirmKeyboard,
  getCancelKeyboard,
  getMenuOnlyKeyboard,
  getBackCancelKeyboard,
} from '../keyboards.js';
import { show, say } from '../ui.js';
import { getSession, setSession, clearSession } from '../sessions.js';
import { requireAdmin, requireModerator } from '../guards.js';
import { isModerator } from '../roles.js';
import { notifyUser } from '../notify.js';
import { countRecipients, getAudienceValues, sendBroadcast, AUDIENCES } from '../../services/broadcastService.js';
import { fill, truncate } from '../../utils/normalize.js';
import { capitalize } from '../../utils/subjects.js';

const TEXT_LIMIT = 3500;

function audienceLabel(audience) {
  return AUDIENCE_LABELS[audience] || audience;
}

function valueLabel(value) {
  return String(value || '')
    .split('::')
    .map((part) => capitalize(part))
    .join(', ');
}

async function startClassBroadcast(ctx) {
  const user = await requireAdmin(ctx, TEXTS.BC_ONLY_ADMIN);
  if (!user) return null;
  if (!user.school || !user.class) return show(ctx, TEXTS.NO_CLASS, getMenuOnlyKeyboard(user));
  await setSession(ctx.from.id, 'telegram', 'bc:text', { audience: 'class', value: '', own: true });
  return show(ctx, fill(TEXTS.BC_CLASS_PROMPT, { class: user.class }), getCancelKeyboard(user));
}

async function startCreatorBroadcast(ctx) {
  const user = await requireModerator(ctx);
  if (!user) return null;
  await setSession(ctx.from.id, 'telegram', 'bc:audience', {});
  return show(ctx, TEXTS.BC_CHOOSE_AUDIENCE, getBroadcastAudienceKeyboard(user));
}

async function askText(ctx, audience, value, { forceNew = false } = {}) {
  await setSession(ctx.from.id, 'telegram', 'bc:text', { audience, value, own: false });
  const text = fill(TEXTS.BC_ENTER_TEXT, { audience: audienceLabel(audience), value: valueLabel(value) });
  return (forceNew ? say : show)(ctx, text, getCancelKeyboard());
}

async function showConfirm(ctx, user, data) {
  const count = await countRecipients(data.audience, data.value, user.school, user.class);
  await setSession(ctx.from.id, 'telegram', 'bc:confirm', data);
  const text = fill(TEXTS.BC_CONFIRM, {
    audience: audienceLabel(data.audience),
    value: data.own ? user.class : valueLabel(data.value),
    count,
    text: truncate(data.text, 3000),
  });
  return say(ctx, text, getBroadcastConfirmKeyboard(user));
}

// Текстовый ввод на шагах bc:* (вызывается из router.js).
export async function handleBroadcastText(ctx, session, text) {
  const value = String(text ?? '').trim();
  if (session.step === 'bc:value') {
    const user = await requireModerator(ctx);
    if (!user) return null;
    // Значение аудитории можно ввести вручную, если его нет в списке кнопок.
    if (!value || value.length > 120) return say(ctx, TEXTS.BC_NO_VALUES, getBackCancelKeyboard('bc:creator', user));
    return askText(ctx, session.data.audience, value.toLowerCase(), { forceNew: true });
  }
  if (session.step === 'bc:text') {
    const data = session.data || {};
    const user = data.own ? await requireAdmin(ctx, TEXTS.BC_ONLY_ADMIN) : await requireModerator(ctx);
    if (!user) return null;
    if (!AUDIENCES.includes(data.audience)) {
      await clearSession(ctx.from.id, 'telegram');
      return say(ctx, TEXTS.BC_SESSION_LOST, getMenuOnlyKeyboard(user));
    }
    if (value.length < 1 || value.length > TEXT_LIMIT) return say(ctx, TEXTS.BC_TEXT_INVALID, getCancelKeyboard(user));
    return showConfirm(ctx, user, { ...data, text: value });
  }
  if (session.step === 'bc:confirm') return say(ctx, TEXTS.BC_CONFIRM.split('\n')[0], getBroadcastConfirmKeyboard());
  if (session.step === 'bc:audience') return say(ctx, TEXTS.BC_CHOOSE_AUDIENCE, getBroadcastAudienceKeyboard());
  await clearSession(ctx.from.id, 'telegram');
  return say(ctx, TEXTS.BC_SESSION_LOST, getMenuOnlyKeyboard());
}

export function broadcastFlow(bot) {
  bot.action('bc:class', async (ctx) => startClassBroadcast(ctx));
  bot.action('bc:creator', async (ctx) => startCreatorBroadcast(ctx));
  bot.action('adm:bc', async (ctx) => startCreatorBroadcast(ctx));

  bot.action(/^bc:aud:(all|city|school|class)$/, async (ctx) => {
    const user = await requireModerator(ctx);
    if (!user) return null;
    const audience = ctx.match[1];
    if (audience === 'all') return askText(ctx, 'all', '');
    const values = (await getAudienceValues(audience)).slice(0, 30);
    await setSession(ctx.from.id, 'telegram', 'bc:value', { audience, values });
    if (values.length === 0) return show(ctx, TEXTS.BC_NO_VALUES, getBackCancelKeyboard('bc:creator', user));
    const labels = values.map((value) => valueLabel(value));
    return show(ctx, fill(TEXTS.BC_CHOOSE_VALUE, { audience: audienceLabel(audience) }), getBroadcastValuesKeyboard(labels, user));
  });

  bot.action(/^bc:val:(\d{1,2})$/, async (ctx) => {
    const user = await requireModerator(ctx);
    if (!user) return null;
    const session = await getSession(ctx.from.id, 'telegram');
    const value = session?.step === 'bc:value' ? session.data?.values?.[Number(ctx.match[1])] : null;
    if (!value) return startCreatorBroadcast(ctx);
    return askText(ctx, session.data.audience, value);
  });

  bot.action('bc:send', async (ctx) => {
    const session = await getSession(ctx.from.id, 'telegram');
    const data = session?.step === 'bc:confirm' ? session.data : null;
    if (!data?.text || !AUDIENCES.includes(data.audience)) {
      await clearSession(ctx.from.id, 'telegram');
      return show(ctx, TEXTS.BC_SESSION_LOST, getMenuOnlyKeyboard());
    }
    const user = data.own ? await requireAdmin(ctx, TEXTS.BC_ONLY_ADMIN) : await requireModerator(ctx);
    if (!user) return null;
    if (!data.own && !isModerator(user)) return show(ctx, TEXTS.MODERATOR_ONLY, getMenuOnlyKeyboard(user));
    await clearSession(ctx.from.id, 'telegram');
    await show(ctx, TEXTS.BC_SENDING);
    const senderId = ctx.from.id;
    // Рассылка с паузами может идти минутами — дольше таймаута обработки апдейта,
    // поэтому она выполняется в фоне, а итог приходит отдельным сообщением.
    sendBroadcast(data.audience, data.own ? '' : data.value, data.text, user.firstName, user.school, user.class, {
      excludeTgId: senderId,
    })
      .then(({ sent, failed }) => notifyUser(senderId, fill(TEXTS.BC_DONE, { sent, failed }), getMenuOnlyKeyboard(user)))
      .catch((err) => {
        console.error(`broadcast: рассылка прервана: ${err?.message || err}`);
        return notifyUser(senderId, TEXTS.GENERIC_ERROR, getMenuOnlyKeyboard(user));
      });
    return null;
  });
}
