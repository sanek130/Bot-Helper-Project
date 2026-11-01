import { bot } from './instance.js';
import { config } from '../config.js';
import { User } from '../db/models/User.js';

const PAUSE_MS = 50;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function notifyUser(tgId, text, extra = {}) {
  if (!tgId) return false;
  try {
    await bot.telegram.sendMessage(tgId, text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
    return true;
  } catch (err) {
    console.warn(`notifyUser: не удалось доставить сообщение tgId=${tgId}: ${err?.response?.description || err.message}`);
    return false;
  }
}

async function collectTgIds(roles, extraIds) {
  const users = await User.find({ role: { $in: roles }, tgId: { $exists: true, $ne: null } }, { tgId: 1 }).lean();
  return [...new Set([...extraIds, ...users.map((u) => u.tgId)].filter(Boolean))];
}

// Уведомление получают все модераторы и создатели: и из БД, и из MODERATOR_IDS/CREATOR_IDS.
export async function notifyCreators(text, extra = {}) {
  const ids = await collectTgIds(['creator', 'moderator'], [...config.creatorIds, ...config.moderatorIds]);
  let sent = 0;
  for (const tgId of ids) {
    if (await notifyUser(tgId, text, extra)) sent += 1;
    await sleep(PAUSE_MS);
  }
  return sent;
}

export async function notifyOnlyCreators(text, extra = {}) {
  const ids = await collectTgIds(['creator'], config.creatorIds);
  let sent = 0;
  for (const tgId of ids) {
    if (await notifyUser(tgId, text, extra)) sent += 1;
    await sleep(PAUSE_MS);
  }
  return sent;
}
