import { User } from '../db/models/User.js';
import { LoginRequest } from '../db/models/LoginRequest.js';
import crypto from 'crypto';

const CODE_LENGTH = 6;
const CODE_EXPIRY_MINUTES = 5;
const LINK_EXPIRY_MINUTES = 30;
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MINUTES = 15;

/**
 * Создать запрос на вход по коду (для сайта)
 */
export async function createCodeLoginRequest(specId) {
  const user = await User.findOne({ specId });
  if (!user) {
    return { success: false, error: 'Пользователь не найден' };
  }
  
  if (!user.tgId) {
    return { success: false, error: 'Аккаунт не привязан к Telegram' };
  }
  
  if (user.status === 'pending') {
    return { success: false, error: 'Аккаунт не активирован' };
  }
  
  // Генерируем код
  const code = generateCode();
  const codeHash = hashCode(code);
  
  // Проверяем, есть ли незавершённый запрос
  const existing = await LoginRequest.findOne({
    userId: user.specId,
    kind: 'site-code',
    status: 'pending'
  });
  
  if (existing) {
    // Удаляем старый
    await LoginRequest.deleteOne({ _id: existing._id });
  }
  
  // Создаём новый запрос
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);
  const request = new LoginRequest({
    userId: user.specId,
    kind: 'site-code',
    codeHash,
    status: 'pending',
    expiresAt
  });
  
  await request.save();
  
  return { success: true, code };
}

/**
 * Проверить код входа
 */
export async function verifyCodeLogin(specId, code, attempts) {
  const user = await User.findOne({ specId });
  if (!user) {
    return { success: false, error: 'Пользователь не найден' };
  }
  
  // Проверяем лимит попыток
  if (attempts >= MAX_ATTEMPTS) {
    return { success: false, error: 'Превышен лимит попыток. Попробуйте позже.' };
  }
  
  const codeHash = hashCode(code);
  const request = await LoginRequest.findOne({
    userId: specId,
    kind: 'site-code',
    codeHash,
    status: 'pending'
  });
  
  if (!request) {
    return { success: false, error: 'Неверный код', attempts: attempts + 1 };
  }
  
  if (request.expiresAt < new Date()) {
    request.status = 'expired';
    await request.save();
    return { success: false, error: 'Код истёк' };
  }
  
  // Код верен
  request.status = 'approved';
  await request.save();
  
  return { success: true, user };
}

/**
 * Создать запрос на вход по спец-ID из другого Telegram
 */
export async function createBotLoginRequest(specId, newTgId) {
  const user = await User.findOne({ specId });
  if (!user) {
    return { success: false, error: 'Пользователь не найден' };
  }
  
  if (user.status === 'pending') {
    return { success: false, error: 'Аккаунт не активирован' };
  }
  
  if (!user.tgId) {
    return { success: false, error: 'Войти через бота нельзя. Открой сайт и привяжи Telegram.' };
  }
  
  if (user.tgId === newTgId) {
    return { success: false, error: 'Этот Telegram уже привязан к аккаунту' };
  }
  
  // Проверяем, есть ли незавершённый запрос
  const existing = await LoginRequest.findOne({
    userId: specId,
    kind: 'bot',
    status: 'pending'
  });
  
  if (existing) {
    // Удаляем старый
    await LoginRequest.deleteOne({ _id: existing._id });
  }
  
  // Создаём новый запрос
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 минут
  const request = new LoginRequest({
    userId: specId,
    kind: 'bot',
    newTgId,
    status: 'pending',
    expiresAt
  });
  
  await request.save();
  
  return { success: true };
}

/**
 * Подтвердить вход по спец-ID (с привязанного Telegram)
 */
export async function approveBotLogin(specId) {
  const request = await LoginRequest.findOne({
    userId: specId,
    kind: 'bot',
    status: 'pending'
  });
  
  if (!request) {
    return { success: false, error: 'Запрос не найден или уже обработан' };
  }
  
  if (request.expiresAt < new Date()) {
    request.status = 'expired';
    await request.save();
    return { success: false, error: 'Запрос истёк' };
  }
  
  // Обновляем пользователя
  const user = await User.findOne({ specId });
  if (!user) {
    return { success: false, error: 'Пользователь не найден' };
  }
  
  user.tgId = request.newTgId;
  if (!user.platforms.includes('telegram')) {
    user.platforms.push('telegram');
  }
  await user.save();
  
  request.status = 'approved';
  await request.save();
  
  return { success: true, user };
}

/**
 * Создать одноразовую ссылку для активации аккаунта с сайта
 */
export async function createLinkLoginRequest(specId) {
  const user = await User.findOne({ specId });
  if (!user) {
    return { success: false, error: 'Пользователь не найден' };
  }
  
  // Генерируем токен
  const token = generateToken();
  const tokenHash = hashToken(token);
  
  // Создаём запрос
  const expiresAt = new Date(Date.now() + LINK_EXPIRY_MINUTES * 60 * 1000);
  const request = new LoginRequest({
    userId: specId,
    kind: 'link',
    codeHash: tokenHash,
    status: 'pending',
    expiresAt
  });
  
  await request.save();
  
  return { success: true, token };
}

/**
 * Подтвердить вход по ссылке
 */
export async function approveLinkLogin(token) {
  const tokenHash = hashToken(token);
  const request = await LoginRequest.findOne({
    kind: 'link',
    codeHash: tokenHash,
    status: 'pending'
  });
  
  if (!request) {
    return { success: false, error: 'Ссылка недействительна' };
  }
  
  if (request.expiresAt < new Date()) {
    request.status = 'expired';
    await request.save();
    return { success: false, error: 'Ссылка истекла' };
  }
  
  // Активируем аккаунт
  const user = await User.findOne({ specId: request.userId });
  if (!user) {
    return { success: false, error: 'Пользователь не найден' };
  }
  
  user.status = 'active';
  if (!user.platforms.includes('telegram')) {
    user.platforms.push('telegram');
  }
  await user.save();
  
  request.status = 'approved';
  await request.save();
  
  return { success: true, user };
}

// Вспомогательные функции

function generateCode() {
  const code = crypto.randomInt(0, 1000000).toString().padStart(CODE_LENGTH, '0');
  return code.slice(-CODE_LENGTH);
}

function hashCode(code) {
  return crypto.createHash('sha256').update(code).digest('hex');
}

function generateToken() {
  return crypto.randomBytes(32).toString('base64url').slice(0, 64);
}

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}
