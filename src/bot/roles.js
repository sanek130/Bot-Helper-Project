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

// Управление составом класса: смотреть список, исключать, отнимать голос.
// Это право есть у всех участников класса (плюс staff) — состав решают сами одноклассники.
export function canManageClass(user) {
  if (!user) return false;
  if (isModerator(user)) return true;
  if (isClassMember(user)) return true;
  return false;
}

// Право менять ДЗ и расписание: staff или участник класса с ролью admin.
// Участник с ролью user ДЗ только просматривает — в этом смысл ролей внутри класса,
// и именно это переключает роль в составе класса.
export function canEditHomework(user) {
  if (!user) return false;
  if (isModerator(user)) return true;
  // Заблокированный админ теряет права, пока запрет не снимут.
  if (user.adminBanned) return false;
  return isClassMember(user) && user.role === 'admin';
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
