import { Homework } from '../db/models/Homework.js';
import { getClassKey } from './homeworkService.js';
import { getClassAdmins, getClassUsers } from './userService.js';
import { toDateKey, addDaysToKey } from './dateService.js';

export async function getClassStats(user) {
  const classKey = getClassKey(user);
  const classUsers = await getClassUsers(classKey);
  const admins = await getClassAdmins(classKey);

  const hw = await Homework.findOne({ classKey }).lean();
  const data = hw?.data || {};
  const todayKey = toDateKey();
  const yesterdayKey = addDaysToKey(todayKey, -1);

  const countFor = (dateKey) => (data[dateKey] ? Object.keys(data[dateKey]).length : 0);
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const isActive = (u, since) => u.stats?.lastActive && new Date(u.stats.lastActive) >= since;

  const dayActive = classUsers.filter((u) => isActive(u, dayAgo)).length;
  const weekActive = classUsers.filter((u) => isActive(u, weekAgo)).length;

  return {
    city: user.city,
    school: user.school,
    className: user.class,
    classUsers: classUsers.length,
    homeworkViews: classUsers.reduce((sum, u) => sum + (u.stats?.homeworkViews || 0), 0),
    adminCount: admins.length,
    admins: admins.map((admin) => ({ name: admin.firstName || 'Админ', added: admin.stats?.homeworkAdded || 0 })),
    yesterdayCount: countFor(yesterdayKey),
    todayCount: countFor(todayKey),
    dayPercent: classUsers.length ? Math.round((dayActive / classUsers.length) * 100) : 0,
    weekPercent: classUsers.length ? Math.round((weekActive / classUsers.length) * 100) : 0,
  };
}

export async function getAdminStats(user) {
  const classUsers = await getClassUsers(getClassKey(user));
  const myId = user.specId;
  return {
    warns: user.warns || 0,
    myAdded: user.stats?.homeworkAdded || 0,
    othersAdded: classUsers
      .filter((u) => u.specId !== myId)
      .reduce((sum, u) => sum + (u.stats?.homeworkAdded || 0), 0),
  };
}
