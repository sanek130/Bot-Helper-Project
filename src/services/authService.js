import crypto from 'node:crypto';
import { verifyTelegramWebAppData, verifyTelegramLoginWidget, verifyGoogleCredential } from './externalAuthService.js';
import { UserModel } from '../db/models/User.js';
import sha256 from '../utils/sha256.js';

// === ТЕЛЕГРАМ WEBAPP (Mini App) ===
export async function handleTelegramWebApp(initData, botToken) {
  try {
    const user = verifyTelegramWebAppData(initData, botToken);
    if (!user) return null;

    // Ищем пользователя по Telegram ID
    let dbUser = await UserModel.findOne({ tgId: user.id });

    if (!dbUser) {
      // Новый пользователь — регистрируем через Web App
      const specId = crypto.randomUUID();
      dbUser = await UserModel.create({
        specId,
        tgId: user.id,
        firstName: user.firstName,
        lastName: '',
        username: user.username || '',
        notificationName: `${user.firstName}`,
        registeredAt: new Date(),
        role: 'user',
      });
    } else if (!dbUser.specId) {
      // Старый пользователь без specId — привязываем
      await UserModel.updateOne({ tgId: user.id }, { $set: { specId: crypto.randomUUID() } });
      dbUser = await UserModel.findOne({ tgId: user.id });
    }

    return dbUser;
  } catch (error) {
    console.error('Ошибка handleTelegramWebApp:', error);
    return null;
  }
}

// === ТЕЛЕГРАМ ЛОГИН ВИДЖЕТ ===
export async function handleTelegramLogin(data, botToken) {
  try {
    const user = verifyTelegramLoginWidget(data, botToken);
    if (!user) return null;

    let dbUser = await UserModel.findOne({ tgId: user.id });

    if (!dbUser) {
      const specId = crypto.randomUUID();
      dbUser = await UserModel.create({
        specId,
        tgId: user.id,
        firstName: user.firstName,
        lastName: '',
        username: user.username || '',
        notificationName: `${user.firstName}`,
        registeredAt: new Date(),
        role: 'user',
      });
    }

    return dbUser;
  } catch (error) {
    console.error('Ошибка handleTelegramLogin:', error);
    return null;
  }
}

// === GOOGLE OAuth ===
export async function handleGoogleAuth(credential, clientId) {
  try {
    const user = verifyGoogleCredential(credential, clientId);
    if (!user) return null;

    let dbUser = await UserModel.findOne({ googleId: user.googleId });

    if (!dbUser) {
      const specId = crypto.randomUUID();
      dbUser = await UserModel.create({
        specId,
        tgId: null, // Google пользователь ещё не привязал Telegram
        phone: null,
        googleId: user.googleId,
        email: user.email,
        firstName: user.name?.split(' ')[0] || '',
        lastName: user.name?.split(' ')?.slice(1).join(' ') || '',
        username: '',
        notificationName: `${user.firstName} ${user.lastName}`,
        registeredAt: new Date(),
        role: 'user',
      });
    }

    return dbUser;
  } catch (error) {
    console.error('Ошибка handleGoogleAuth:', error);
    return null;
  }
}

// === КОД С САЙТА ===
export async function handleSiteCode(code, tgId) {
  try {
    const hashed = sha256(code.trim());
    
    let dbUser = await UserModel.findOne({ siteId: hashed });
    if (!dbUser) return null;

    // Привязываем Telegram к этому аккаунту
    if (tgId && !dbUser.tgId) {
      await UserModel.updateOne({ siteId: hashed }, { 
        $set: { tgId },
        $unset: { siteId: '' }
      });
    }

    return dbUser;
  } catch (error) {
    console.error('Ошибка handleSiteCode:', error);
    return null;
  }
}

// === ТЕЛЕГРАМ ССЫЛКА (t.me/username) ===
export async function handleTelegramLink(link, tgId) {
  try {
    const usernameMatch = link.match(/\/@([a-zA-Z0-9_]+)/);
    if (!usernameMatch) return null;

    // Проверяем что это реальный пользователь Telegram
    const parsedLink = `https://telegram.org/resolve/${encodeURIComponent(usernameMatch[1])}`;
    try {
      const response = await fetch(parsedLink);
      const data = await response.json();
      const tgIdFromLink = parseInt(data?.id);

      if (tgIdFromLink !== tgId) return null; // Проверка на подмену

      let dbUser = await UserModel.findOne({ tgId: tgIdFromLink });

      if (!dbUser) {
        const specId = crypto.randomUUID();
        dbUser = await UserModel.create({
          specId,
          tgId: tgIdFromLink,
          firstName: '',
          lastName: '',
          username: usernameMatch[1],
          notificationName: `@${usernameMatch[1]}`,
          registeredAt: new Date(),
          role: 'user',
        });
      }

      return dbUser;
    } catch {
      // Если API недоступен — пропускаем проверку, но логируем предупреждение
      console.warn('Не удалось проверить Telegram ссылку:', parsedLink);
      return null;
    }
  } catch (error) {
    console.error('Ошибка handleTelegramLink:', error);
    return null;
  }
}

// === СПЕЦИАЛЬНЫЙ ID (кросс-платформенная привязка) ===
export async function handleSpecialId(specId, tgId) {
  try {
    let dbUser = await UserModel.findOne({ specId });

    if (!dbUser) {
      const specId2 = crypto.randomUUID();
      dbUser = await UserModel.create({
        specId: specId2,
        tgId,
        firstName: '',
        lastName: '',
        username: '',
        notificationName: `Специальный ID`,
        registeredAt: new Date(),
        role: 'user',
      });
    } else if (!dbUser.tgId && tgId) {
      // Если у пользователя уже есть другой specId, сохраняем его для истории
      const oldSpecId = dbUser.specId;
      await UserModel.updateOne(
        { _id: dbUser._id }, 
        { $set: { specId: crypto.randomUUID() } }
      );
      dbUser = await UserModel.findOne({ specId });
    }

    return dbUser;
  } catch (error) {
    console.error('Ошибка handleSpecialId:', error);
    return null;
  }
}

// === ТЕЛЕГРАМ: СБРОС ИЛИ ПРИВЯЗКА TELEGRAM ===
export async function handleTelegramBind(specId, tgId) {
  try {
    let dbUser = await UserModel.findOne({ specId });

    if (!dbUser) {
      const specId2 = crypto.randomUUID();
      dbUser = await UserModel.create({
        specId: specId2,
        tgId,
        firstName: '',
        lastName: '',
        username: '',
        notificationName: `Новый пользователь`,
        registeredAt: new Date(),
        role: 'user',
      });
    } else if (!dbUser.tgId && tgId) {
      await UserModel.updateOne({ specId }, { $set: { tgId }, $unset: { siteId: '' } });
      dbUser = await UserModel.findOne({ specId });
    }

    return dbUser;
  } catch (error) {
    console.error('Ошибка handleTelegramBind:', error);
    return null;
  }
}

// === ВЕРСИЯ С GOOGLE OAuth ===
export async function handleGoogleBind(specId, googleId, tgId = null) {
  try {
    let dbUser = await UserModel.findOne({ specId });

    if (!dbUser) {
      const specId2 = crypto.randomUUID();
      dbUser = await UserModel.create({
        specId: specId2,
        tgId: tgId || null,
        googleId,
        email: '',
        firstName: '',
        lastName: '',
        username: '',
        notificationName: `Google OAuth`,
        registeredAt: new Date(),
        role: 'user',
      });
    } else if (!dbUser.googleId && googleId) {
      await UserModel.updateOne({ specId }, { $set: { googleId }, $unset: { siteId: '' } });
      dbUser = await UserModel.findOne({ specId });
    }

    return dbUser;
  } catch (error) {
    console.error('Ошибка handleGoogleBind:', error);
    return null;
  }
}