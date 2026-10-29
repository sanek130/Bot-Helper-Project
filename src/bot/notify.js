import bot from './bot.js';
import config from '../config.js';
import { getCreators } from '../services/userService.js';

// Все создатели: роль в базе + tgId из MODERATOR_IDS
async function creatorChatIds() {
  const ids = new Set(config.moderators.ids);
  for (const creator of await getCreators()) {
    if (creator.tgId) ids.add(Number(creator.tgId));
  }
  return [...ids];
}

export async function notifyCreators(text, extra = {}) {
  let delivered = 0;
  for (const chatId of await creatorChatIds()) {
    try {
      await bot.telegram.sendMessage(chatId, text, { parse_mode: 'HTML', ...extra });
      delivered += 1;
    } catch {
      // создатель мог не начинать чат с ботом
    }
  }
  return delivered;
}

export async function notifyUser(user, text, extra = {}) {
  if (!user?.tgId) return false;
  try {
    await bot.telegram.sendMessage(user.tgId, text, { parse_mode: 'HTML', ...extra });
    return true;
  } catch {
    return false;
  }
}
