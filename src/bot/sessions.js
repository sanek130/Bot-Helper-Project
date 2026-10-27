import { Session } from '../db/models/Session.js';

const TTL_MS = 24 * 60 * 60 * 1000;
const PLATFORM = 'telegram';

function expires() {
  return new Date(Date.now() + TTL_MS);
}

export async function getSession(tgId) {
  const doc = await Session.findOne({ userId: String(tgId), platform: PLATFORM }).lean();
  if (!doc) return { step: null, data: {} };
  return { step: doc.step || null, data: doc.data || {} };
}

export async function setSession(tgId, step, data = {}) {
  await Session.findOneAndUpdate(
    { userId: String(tgId), platform: PLATFORM },
    { $set: { step, data, updatedAt: new Date(), expiresAt: expires() } },
    { upsert: true }
  );
}

export async function patchSession(tgId, patch = {}) {
  const session = await getSession(tgId);
  await setSession(tgId, session.step, { ...session.data, ...patch });
  return { step: session.step, data: { ...session.data, ...patch } };
}

export async function setStep(tgId, step) {
  const session = await getSession(tgId);
  await setSession(tgId, step, session.data);
}

export async function clearSession(tgId) {
  await Session.deleteOne({ userId: String(tgId), platform: PLATFORM });
}

export async function clearAllSessions(tgId) {
  await Session.deleteMany({ userId: String(tgId) });
}
