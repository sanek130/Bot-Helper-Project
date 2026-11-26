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

export function isClassMember(user) {
  return Boolean(user) && user.classStatus === 'member';
}

// Управление классом: ДЗ, расписание, состав, голосование.
// Право даётся участием в локальном классе (всем его участникам), а не ролью admin.
// Роль admin оставлена для совместимости: админ класса тоже управляет своим классом,
// но потерявший права админ (adminBanned) опирается только на членство в классе.
export function canManageClass(user) {
  if (!user) return false;
  if (isModerator(user)) return true;
  if (isClassMember(user)) return true;
  return false;
}

// Голос при приёме в класс: только участники, у которых не отнято право голоса.
export function canVoteInClass(user) {
  return isClassMember(user) && user.voteBlocked !== true;
}

// Полномочия выкидывать из класса и отнимать голос — у создателей и модераторов
// (а также у ФАКТИЧЕСКИХ участников класса по отношению к своим одноклассникам).
export const STAFF_ROLES = ['moderator', 'creator'];

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
