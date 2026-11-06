import { TEXTS, BUTTONS } from './texts.js';
import { getStartKeyboard, getUnregisteredKeyboard, getMenuOnlyKeyboard, getCancelKeyboard, resolveReplyText } from './keyboards.js';
import { say, toast } from './ui.js';
import { getSession, clearSession } from './sessions.js';
import { loadUser } from './guards.js';
import { discardDraft, getRawUserByTgId } from '../services/userService.js';
import { fill, normalizeText } from '../utils/normalize.js';
import { getToday, getTomorrow, getAfterTomorrow } from '../utils/dateService.js';

import { registrationFlow, handleRegText, showStartScreen } from './flows/registration.js';
import { loginFlow, handleLoginText, startLogin } from './flows/login.js';
import { accountsFlow } from './flows/accounts.js';
import { menuFlow, showMenuPage1, showWebOpen } from './flows/menu.js';
import { profileFlow, handleProfileText, showProfile } from './flows/profile.js';
import { helpFlow, showHelp } from './flows/help.js';
import { statsFlow, showStats } from './flows/stats.js';
import { homeworkFlow, showDayHomework, showWeekHomework } from './flows/homework.js';
import { scheduleFlow, showSchedule, handleSchedulePhoto, handleScheduleText } from './flows/schedule.js';
import { adminAddFlow, handleAddText, handleAddPhoto } from './flows/admin-add.js';
import { adminEditFlow, handleEditText, handleEditPhoto } from './flows/admin-edit.js';
import { adminDeleteFlow, handleDeleteText } from './flows/admin-delete.js';
import { adminPanelFlow, handleAdminPanelText, showAdminPanel } from './flows/admin-panel.js';
import { complaintsFlow, handleComplaintText } from './flows/complaints.js';
import { broadcastFlow, handleBroadcastText } from './flows/broadcast.js';
import { supportFlow, handleSupportText } from './flows/support.js';
import { creatorFlow, handleCreatorText } from './flows/creator.js';
import { styleFlow } from './flows/style.js';

// Действия кнопок нижней клавиатуры. Ключи совпадают со значениями BUTTONS из texts.js.
const BUTTON_ACTIONS = {
  'hw:today': (ctx) => showDayHomework(ctx, getToday(), { forceNew: true }),
  'hw:tomorrow': (ctx) => showDayHomework(ctx, getTomorrow(), { forceNew: true }),
  'hw:after_tomorrow': (ctx) => showDayHomework(ctx, getAfterTomorrow(), { forceNew: true }),
  'hw:week': (ctx) => showWeekHomework(ctx, 0),
  'schedule:show': (ctx) => showSchedule(ctx, { forceNew: true }),
  'prof:open': (ctx) => showProfile(ctx),
  'help:open': (ctx) => showHelp(ctx),
  'web:open': (ctx) => showWebOpen(ctx),
  'stats:open': (ctx) => showStats(ctx),
  'adm:panel': (ctx) => showAdminPanel(ctx, { forceNew: true }),
  'menu:page:1': (ctx) => showMenuPage1(ctx, { forceNew: true }),
  'login:start': (ctx) => startLogin(ctx),
};

// Обработчики текстового ввода по префиксу шага сессии.
const TEXT_HANDLERS = [
  ['reg:', handleRegText],
  ['login:', handleLoginText],
  ['prof:', handleProfileText],
  ['add:', handleAddText],
  ['edit:', handleEditText],
  ['del:', handleDeleteText],
  ['schedule:upload', handleScheduleText],
  ['cmp:', handleComplaintText],
  ['crt:', handleCreatorText],
  ['adm:', handleAdminPanelText],
  ['bc:', handleBroadcastText],
  ['sup:', handleSupportText],
];

// Шаги, в которых бот не ждёт текста: сессия хранит только состояние календаря.
function isPassiveStep(step) {
  return !step || step === 'idle' || step.startsWith('cal');
}

async function replyUnregisteredOrUnknown(ctx) {
  const user = await loadUser(ctx);
  if (!user || user.status !== 'active') return say(ctx, TEXTS.UNREGISTERED_SHORT, getUnregisteredKeyboard(user));
  return say(ctx, TEXTS.NOT_UNDERSTOOD, getMenuOnlyKeyboard(user));
}

async function handleText(ctx) {
  const raw = String(ctx.message.text ?? '');
  const text = raw.trim();
  const normalized = normalizeText(text);

  if (text.startsWith('/')) return say(ctx, TEXTS.UNKNOWN_COMMAND);

  // Подпись кнопки зависит от стиля (/style): «Сегодня», «📌 Сегодня», «📌 СЕГОДНЯ» или просто «📌».
  const buttonAction = BUTTONS[normalized] || BUTTONS[resolveReplyText(text)];
  if (buttonAction && BUTTON_ACTIONS[buttonAction]) {
    const session = await getSession(ctx.from.id, 'telegram');
    // Нажатие кнопки нижней клавиатуры прерывает текущий шаг; черновик регистрации при этом сохраняется.
    if (session && !session.step.startsWith('reg:')) await clearSession(ctx.from.id, 'telegram');
    return BUTTON_ACTIONS[buttonAction](ctx);
  }

  const session = await getSession(ctx.from.id, 'telegram');
  if (session && !isPassiveStep(session.step)) {
    const entry = TEXT_HANDLERS.find(([prefix]) => session.step.startsWith(prefix));
    if (entry) return entry[1](ctx, session, text);
    await clearSession(ctx.from.id, 'telegram');
    await say(ctx, TEXTS.UNEXPECTED_STEP);
    return showMenuPage1(ctx, { forceNew: true });
  }

  return replyUnregisteredOrUnknown(ctx);
}

async function handlePhoto(ctx) {
  const session = await getSession(ctx.from.id, 'telegram');
  const step = session?.step || '';
  if (step === 'add:task') return handleAddPhoto(ctx, session);
  if (step === 'edit:text') return handleEditPhoto(ctx, session);
  if (step === 'schedule:upload') return handleSchedulePhoto(ctx, session);
  return say(ctx, TEXTS.PHOTO_NOT_EXPECTED);
}

async function handleDocument(ctx) {
  const session = await getSession(ctx.from.id, 'telegram');
  if (session?.step === 'schedule:upload') return say(ctx, TEXTS.SCHEDULE_PHOTO_ONLY, getCancelKeyboard());
  return say(ctx, TEXTS.DOCUMENT_REJECTED);
}

async function handleCancel(ctx) {
  await clearSession(ctx.from.id, 'telegram');
  const raw = await getRawUserByTgId(ctx.from.id);
  if (raw && raw.status === 'active') {
    await toast(ctx, TEXTS.CANCELLED);
    await say(ctx, TEXTS.CANCELLED);
    return showMenuPage1(ctx, { forceNew: true });
  }
  if (raw && raw.status === 'unregistered') await discardDraft(ctx.from.id);
  return say(ctx, TEXTS.REG_CANCELLED, getStartKeyboard());
}

// Кнопка из старого сообщения, для которой нет обработчика (например, после обновления бота).
async function handleStale(ctx) {
  await toast(ctx, TEXTS.STALE_MENU);
  const user = await loadUser(ctx);
  if (user && user.status === 'active') return showMenuPage1(ctx, { forceNew: true });
  return showStartScreen(ctx);
}

export function setupRouter(bot) {
  bot.action('cancel', handleCancel);
  // /id работает и без регистрации: Telegram ID нужен, чтобы подтвердить Telegram на сайте.
  bot.command('id', (ctx) => ctx.reply(fill(TEXTS.MY_TG_ID, { tgId: ctx.from.id }), { parse_mode: 'HTML' }));

  registrationFlow(bot);
  loginFlow(bot);
  accountsFlow(bot);
  menuFlow(bot);
  styleFlow(bot);
  profileFlow(bot);
  helpFlow(bot);
  statsFlow(bot);
  homeworkFlow(bot);
  scheduleFlow(bot);
  adminAddFlow(bot);
  adminEditFlow(bot);
  adminDeleteFlow(bot);
  adminPanelFlow(bot);
  complaintsFlow(bot);
  broadcastFlow(bot);
  supportFlow(bot);
  creatorFlow(bot);

  bot.on('text', handleText);
  bot.on('photo', handlePhoto);
  bot.on('document', handleDocument);
  bot.action(/.*/, handleStale);
}
