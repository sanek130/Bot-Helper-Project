import { getClassKey } from '../services/homeworkService.js';
import { isModerator } from '../bot/roles.js';

const CLASS_KEY_RE = /^.{1,120}::.{1,10}$/;

export function asyncRoute(handler) {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

export function ownClassKey(user) {
  if (!user?.school || !user?.class) return '';
  return getClassKey(user.school, user.class);
}

// Админ работает строго со своим классом. Модератор и создатель могут указать класс явно
// (classKey или пара school + class), иначе берётся рабочий класс из бота или собственный.
export function resolveClassKey(user, source = {}) {
  const own = ownClassKey(user);
  let requested = '';
  if (typeof source.classKey === 'string' && source.classKey.trim()) {
    requested = source.classKey.trim();
  } else if (typeof source.school === 'string' && source.school.trim() && typeof source.class === 'string' && source.class.trim()) {
    requested = getClassKey(source.school.trim(), source.class.trim());
  }
  if (requested && !CLASS_KEY_RE.test(requested)) return { error: 'invalid_class' };
  if (isModerator(user)) {
    const classKey = requested || user.workClassKey || own;
    return classKey ? { classKey } : { error: 'no_class' };
  }
  if (requested && requested !== own) return { error: 'forbidden_class' };
  return own ? { classKey: own } : { error: 'no_class' };
}

export function sendClassError(res, error) {
  const status = error === 'forbidden_class' ? 403 : 400;
  return res.status(status).json({ error });
}

export function displayName(user) {
  return user?.firstName || 'Без имени';
}

export function displayUsername(user) {
  return user?.username || 'нет';
}

export function errorCode(err, fallback = 'internal') {
  return err?.code && typeof err.code === 'string' ? err.code : fallback;
}

export function parseLimit(value, def, max) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}
