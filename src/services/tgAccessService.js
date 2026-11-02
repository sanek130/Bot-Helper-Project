import { User } from '../db/models/User.js';
import { claimDetachedAccount, createPendingWebUser, ensureCreator, linkTelegram } from './userService.js';

export const TG_ID_RE = /^\d{5,15}$/;
const MAX_ACCOUNTS = 20;

function fail(code, extra = {}) {
  const error = new Error(code);
  error.code = code;
  Object.assign(error, extra);
  return error;
}

export function parseTgId(value) {
  const raw = String(value ?? '').trim();
  if (!TG_ID_RE.test(raw)) return null;
  const tgId = Number(raw);
  return Number.isSafeInteger(tgId) && tgId > 0 ? tgId : null;
}

// Аккаунты человека: тот, что сейчас привязан к его Telegram, и те, из которых он вышел в боте.
export async function getAccountsForTg(tgId) {
  const id = Number(tgId);
  return User.find({
    status: 'active',
    $or: [{ tgId: id }, { ownerTgId: id, tgId: { $exists: false } }],
  })
    .sort({ updatedAt: -1 })
    .limit(MAX_ACCOUNTS);
}

export async function getBoundAccount(tgId) {
  return User.findOne({ tgId: Number(tgId), status: 'active' });
}

export function canEnterWithTg(user, tgId) {
  if (!user || user.status !== 'active') return false;
  const id = Number(tgId);
  if (user.tgId) return Number(user.tgId) === id;
  return Number(user.ownerTgId) === id;
}

export function accountSummary(user, tgId) {
  return {
    specId: user.specId,
    firstName: user.firstName || '',
    city: user.city || '',
    school: user.school || '',
    class: user.class || '',
    role: user.role,
    banned: Boolean(user.banned),
    linked: Boolean(user.tgId) && Number(user.tgId) === Number(tgId),
    registeredAt: user.registeredAt || user.createdAt || null,
  };
}

// Привязка аккаунта к подтверждённому Telegram — это и есть полный доступ: фото, уведомления, ответы поддержки.
// В боте у одного Telegram может быть только один текущий аккаунт, поэтому замена текущего — только с makeMain.
export async function bindAccountToTg(specId, tgId, { makeMain = false } = {}) {
  const id = Number(tgId);
  const target = await User.findOne({ specId });
  if (!target || target.status !== 'active') throw fail('user_not_found');
  if (target.tgId && Number(target.tgId) === id) return { user: target, changed: false, replaced: null };
  if (target.tgId) throw fail('tg_already_linked');
  const bound = await getBoundAccount(id);
  if (bound && bound.specId !== target.specId && !makeMain) {
    throw fail('tg_has_account', { current: accountSummary(bound, id) });
  }
  const user = await claimDetachedAccount(target.specId, id);
  return { user, changed: true, replaced: bound ? bound.specId : null };
}

// Регистрация на сайте после подтверждения Telegram: аккаунт сразу активен, переход в бота не нужен.
// Если у этого Telegram уже есть текущий аккаунт в боте, новый не отбирает его место, а попадает в «Мои аккаунты».
export async function createVerifiedWebUser(fields, tgId) {
  const id = Number(tgId);
  const draft = await createPendingWebUser(fields);
  await User.updateOne(
    { _id: draft._id },
    { $set: { status: 'active', ownerTgId: id, registeredAt: new Date() }, $unset: { pendingExpiresAt: '' } },
  );
  const bound = await getBoundAccount(id);
  if (bound) return { user: await User.findById(draft._id), linked: false, current: accountSummary(bound, id) };
  await linkTelegram(draft.specId, id);
  const user = (await ensureCreator(id)) || (await User.findById(draft._id));
  return { user, linked: true, current: null };
}
