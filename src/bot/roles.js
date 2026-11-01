export const ADMIN_ROLES = ['admin', 'moderator', 'creator'];
export const MODERATOR_ROLES = ['moderator', 'creator'];
export const SUPPORT_ROLES = ['support', 'moderator', 'creator'];

export function isAdmin(user) {
  return Boolean(user) && ADMIN_ROLES.includes(user.role);
}

export function isModerator(user) {
  return Boolean(user) && MODERATOR_ROLES.includes(user.role);
}

export function isCreator(user) {
  return Boolean(user) && user.role === 'creator';
}

export function isSupport(user) {
  return Boolean(user) && SUPPORT_ROLES.includes(user.role);
}

export const ROLE_TITLES = {
  user: 'участник',
  admin: 'админ',
  moderator: 'модератор',
  creator: 'создатель',
  support: 'поддержка',
};

export function roleTitle(role) {
  return ROLE_TITLES[role] || role || 'участник';
}
