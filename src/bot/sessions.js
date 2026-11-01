import { Session, SESSION_TTL_MS } from '../db/models/Session.js';

function key(userId) {
  return String(userId);
}

function nextExpiry() {
  return new Date(Date.now() + SESSION_TTL_MS);
}

export async function getSession(userId, platform = 'telegram') {
  const session = await Session.findOne({ userId: key(userId), platform }).lean();
  if (!session) return null;
  // TTL-индекс MongoDB удаляет документы с задержкой до минуты, поэтому срок проверяется явно.
  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) return null;
  return session;
}

export async function setSession(userId, platform = 'telegram', step, data = {}) {
  return Session.findOneAndUpdate(
    { userId: key(userId), platform },
    { $set: { step, data, expiresAt: nextExpiry() } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();
}

export async function patchSession(userId, platform = 'telegram', newData = {}) {
  const current = await getSession(userId, platform);
  const data = { ...(current?.data || {}), ...newData };
  return Session.findOneAndUpdate(
    { userId: key(userId), platform },
    { $set: { data, expiresAt: nextExpiry() }, $setOnInsert: { step: current?.step || 'idle' } },
    { upsert: true, new: true },
  ).lean();
}

export async function setStep(userId, platform = 'telegram', step) {
  return Session.findOneAndUpdate(
    { userId: key(userId), platform },
    { $set: { step, expiresAt: nextExpiry() }, $setOnInsert: { data: {} } },
    { upsert: true, new: true },
  ).lean();
}

export async function clearSession(userId, platform = 'telegram') {
  await Session.deleteOne({ userId: key(userId), platform });
}

export async function clearAllSessions(userId) {
  await Session.deleteMany({ userId: key(userId) });
}
