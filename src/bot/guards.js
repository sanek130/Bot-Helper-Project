import { TEXTS } from './texts.js';
import { getUserByTgId } from '../services/userService.js';
import { getClassKey } from '../services/homeworkService.js';
import { isAdmin, isModerator, isCreator } from './roles.js';
import { getMenuOnlyKeyboard, getUnregisteredKeyboard } from './keyboards.js';
import { show, toast } from './ui.js';

async function deny(ctx, text, keyboard = getMenuOnlyKeyboard()) {
  if (ctx.callbackQuery) await toast(ctx, text, true);
  await show(ctx, text, keyboard);
  return null;
}

// Пользователь перечитывается из БД: роль могла измениться после загрузки middleware.
export async function loadUser(ctx) {
  if (!ctx.from) return null;
  const user = await getUserByTgId(ctx.from.id);
  ctx.state.user = user;
  ctx.user = user;
  return user;
}

export async function requireActive(ctx) {
  const user = await loadUser(ctx);
  if (!user || user.status !== 'active') return deny(ctx, TEXTS.UNREGISTERED_ACCESS, getUnregisteredKeyboard(user));
  return user;
}

export async function requireAdmin(ctx, text = TEXTS.NO_RIGHTS) {
  const user = await requireActive(ctx);
  if (!user) return null;
  if (user.adminBanned && !isModerator(user)) return deny(ctx, TEXTS.ADMIN_BANNED_NO_RIGHTS);
  if (!isAdmin(user)) return deny(ctx, text);
  return user;
}

export async function requireModerator(ctx) {
  const user = await requireActive(ctx);
  if (!user) return null;
  if (!isModerator(user)) return deny(ctx, TEXTS.MODERATOR_ONLY);
  return user;
}

export async function requireCreator(ctx) {
  const user = await requireActive(ctx);
  if (!user) return null;
  if (!isCreator(user)) return deny(ctx, TEXTS.CREATOR_ONLY);
  return user;
}

// Модератор не трогает модераторов и создателей; создатель не трогает других создателей.
// Себя нельзя банить, понижать, варнить и удалять — только смотреть карточку.
export function canModerate(actor, target, action = 'view') {
  if (!actor || !target) return false;
  const self = actor.specId === target.specId;
  if (self) return action === 'view';
  if (target.role === 'creator') return false;
  if (target.role === 'moderator' && actor.role !== 'creator') return false;
  return isModerator(actor);
}

// Админ работает только со своим классом; модератор и создатель — с выбранным рабочим классом.
export function getWorkClassKey(user) {
  if (!user) return '';
  if (isModerator(user) && user.workClassKey) return user.workClassKey;
  if (!user.school || !user.class) return '';
  return getClassKey(user.school, user.class);
}
