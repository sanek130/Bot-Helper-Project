import { User } from '../db/models/User.js';
import { getClassUsers } from './userService.js';
import { getClassKey, countAddedOn, countByAuthor } from './homeworkService.js';
import { getToday, addDaysKey } from '../utils/dateService.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function filterFor(key) {
  if (typeof key === 'string' && key.includes('-')) return { specId: key };
  return { tgId: Number(key) };
}

export async function touchUserActivity(key, { incrementViews = false, incrementAdded = false } = {}) {
  if (key === undefined || key === null) return null;
  const inc = {};
  if (incrementViews) inc['stats.homeworkViews'] = 1;
  if (incrementAdded) inc['stats.homeworkAdded'] = 1;
  const update = { $set: { 'stats.lastActive': new Date() } };
  if (Object.keys(inc).length > 0) update.$inc = inc;
  return User.findOneAndUpdate(filterFor(key), update, { new: true });
}

export function getActivityPercent(users, days) {
  if (!Array.isArray(users) || users.length === 0) return 0;
  const since = Date.now() - days * DAY_MS;
  const active = users.filter((user) => {
    const last = user?.stats?.lastActive;
    return last && new Date(last).getTime() >= since;
  }).length;
  return Math.round((active / users.length) * 100);
}

export async function getClassStats(school, className) {
  const users = await getClassUsers(school, className);
  const classKey = getClassKey(school, className);
  const today = getToday();
  const yesterday = addDaysKey(today, -1);
  const [todayCount, yesterdayCount] = await Promise.all([countAddedOn(classKey, today), countAddedOn(classKey, yesterday)]);
  return {
    classUsers: users.length,
    classAdmins: users.filter((user) => user.role === 'admin').length,
    classAdminNames: users.filter((user) => user.role === 'admin').map((user) => user.firstName || user.username || 'без имени'),
    homeworkViews: users.reduce((sum, user) => sum + (Number(user?.stats?.homeworkViews) || 0), 0),
    yesterdayCount,
    todayCount,
    dayPercent: getActivityPercent(users, 1),
    weekPercent: getActivityPercent(users, 7),
  };
}

export async function getAdminStats(key) {
  const user = await User.findOne(filterFor(key));
  if (!user || !user.school || !user.class) return { myCount: 0, othersCount: 0 };
  return countByAuthor(getClassKey(user.school, user.class), user.tgId ?? user.specId);
}
