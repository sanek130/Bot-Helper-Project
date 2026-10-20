import { User } from '../db/models/User.js';
import crypto from 'crypto';

/**
 * Найти пользователя по tgId
 */
export async function getUserByTgId(tgId) {
  try {
    return await User.findOne({ tgId: Number(tgId) });
  } catch (e) {
    console.error('Ошибка получения пользователя:', e);
    return null;
  }
}

/**
 * Найти пользователя по specId
 */
export async function getUserBySpecId(specId) {
  try {
    return await User.findOne({ specId });
  } catch (e) {
    console.error('Ошибка получения пользователя:', e);
    return null;
  }
}

/**
 * Создать пользователя
 */
export async function createUser(userData) {
  try {
    const user = new User(userData);
    await user.save();
    return user;
  } catch (e) {
    console.error('Ошибка создания пользователя:', e);
    return null;
  }
}

/**
 * Обновить пользователя
 */
export async function updateUser(tgId, updates) {
  try {
    return await User.findOneAndUpdate(
      { tgId: Number(tgId) },
      updates,
      { new: true }
    );
  } catch (e) {
    console.error('Ошибка обновления пользователя:', e);
    return null;
  }
}

/**
 * Удалить пользователя
 */
export async function deleteUser(tgId) {
  try {
    await User.deleteOne({ tgId: Number(tgId) });
    return true;
  } catch (e) {
    console.error('Ошибка удаления пользователя:', e);
    return false;
  }
}

/**
 * Отвязать Telegram от аккаунта
 */
export async function unlinkTelegram(tgId) {
  try {
    await User.updateOne(
      { tgId: Number(tgId) },
      { $unset: { tgId: 1 } }
    );
    return true;
  } catch (e) {
    console.error('Ошибка отвязки Telegram:', e);
    return false;
  }
}

/**
 * Привязать новый tgId к аккаунту
 */
export async function linkTelegram(specId, newTgId) {
  try {
    const user = await User.findOne({ specId });
    if (!user) return null;
    
    user.tgId = Number(newTgId);
    if (!user.platforms.includes('telegram')) {
      user.platforms.push('telegram');
    }
    await user.save();
    return user;
  } catch (e) {
    console.error('Ошибка привязки Telegram:', e);
    return null;
  }
}

/**
 * Выдать варн пользователю
 */
export async function giveWarn(tgId) {
  try {
    const user = await User.findOne({ tgId: Number(tgId) });
    if (!user) return null;
    
    user.warns = Math.min(user.warns + 1, 3);
    
    // При трёх варнах - понижение и бан
    if (user.warns >= 3) {
      user.role = 'user';
      user.adminBanned = true;
    }
    
    await user.save();
    return user;
  } catch (e) {
    console.error('Ошибка выдачи варна:', e);
    return null;
  }
}

/**
 * Понизить роль до участника
 */
export async function demoteToUser(tgId) {
  try {
    const user = await User.findOne({ tgId: Number(tgId) });
    if (!user) return null;
    
    user.role = 'user';
    await user.save();
    return user;
  } catch (e) {
    console.error('Ошибка понижения роли:', e);
    return null;
  }
}

/**
 * Вернуть роль админа
 */
export async function promoteToAdmin(tgId) {
  try {
    const user = await User.findOne({ tgId: Number(tgId) });
    if (!user) return null;
    
    user.role = 'admin';
    user.adminBanned = false;
    user.warns = 0;
    await user.save();
    return user;
  } catch (e) {
    console.error(' ошибки повышения роли:', e);
    return null;
  }
}

/**
 * Обновить статистику пользователя
 */
export async function updateUserStats(tgId, action) {
  try {
    const updates = {
      $inc: { 'stats.homeworkViews': 0 },
      $set: { 'stats.lastActive': new Date() }
    };
    
    switch (action) {
      case 'view_homework':
        updates.$inc['stats.homeworkViews'] = 1;
        break;
      case 'add_homework':
        updates.$inc['stats.homeworkAdded'] = 1;
        break;
      default:
        break;
    }
    
    await User.updateOne(
      { tgId: Number(tgId) },
      updates
    );
  } catch (e) {
    console.error('Ошибка обновления статистики:', e);
  }
}

/**
 * Получить пользователей класса
 */
export async function getClassUsers(classKey) {
  try {
    const sep = classKey.indexOf('::');
    let filter;
    
    if (sep !== -1) {
      const school = classKey.slice(0, sep);
      const className = classKey.slice(sep + 2);
      filter = { school, class: className };
    } else {
      filter = { class: classKey };
    }
    
    return await User.find(filter);
  } catch (e) {
    console.error('Ошибка получения пользователей класса:', e);
    return [];
  }
}

/**
 * Получить админов класса
 */
export async function getClassAdmins(classKey) {
  try {
    const users = await getClassUsers(classKey);
    return users.filter(u => u.role === 'admin');
  } catch (e) {
    console.error('Ошибка получения админов класса:', e);
    return [];
  }
}
