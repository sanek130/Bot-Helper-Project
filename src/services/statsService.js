import { User } from '../db/models/User.js';
import { Homework } from '../db/models/Homework.js';
import { getClassKey } from './homeworkService.js';
import { getClassUsers } from './userService.js';
import { toDateKey } from './dateService.js';

/**
 * Получить статистику класса
 */
export async function getClassStats(user) {
  try {
    const classKey = getClassKey(user);
    const classUsers = await getClassUsers(classKey);
    const admins = classUsers.filter(u => u.role === 'admin');
    
    // Общая статистика
    const totalViews = classUsers.reduce((sum, u) => sum + (u.stats?.homeworkViews || 0), 0);
    const totalAdded = classUsers.reduce((sum, u) => sum + (u.stats?.homeworkAdded || 0), 0);
    
    // Статистика по дням
    const todayKey = toDateKey();
    const yesterdayKey = toDateKey(new Date(Date.now() - 24 * 60 * 60 * 1000));
    
    const hw = await Homework.findOne({ classKey });
    const data = hw?.data || {};
    
    let yesterdayCount = 0;
    let todayCount = 0;
    
    for (const dateKey of Object.keys(data)) {
      if (dateKey === yesterdayKey) {
        yesterdayCount = Object.keys(data[dateKey]).length;
      } else if (dateKey === todayKey) {
        todayCount = Object.keys(data[dateKey]).length;
      }
    }
    
    // Активность
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    
    const dayActive = classUsers.filter(u => u.stats?.lastActive >= dayAgo).length;
    const weekActive = classUsers.filter(u => u.stats?.lastActive >= weekAgo).length;
    
    const dayPercent = classUsers.length > 0 ? Math.round((dayActive / classUsers.length) * 100) : 0;
    const weekPercent = classUsers.length > 0 ? Math.round((weekActive / classUsers.length) * 100) : 0;
    
    // Статистика по админам
    const adminStats = admins.map(admin => ({
      name: admin.firstName || 'Админ',
      added: admin.stats?.homeworkAdded || 0
    }));
    
    return {
      classUsers: classUsers.length,
      homeworkViews: totalViews,
      adminCount: admins.length,
      adminStats,
      yesterdayCount,
      todayCount,
      dayPercent,
      weekPercent
    };
  } catch (e) {
    console.error('Ошибка получения статистики класса:', e);
    return null;
  }
}

/**
 * Получить статистику админа
 */
export async function getAdminStats(user) {
  try {
    const classKey = getClassKey(user);
    const classUsers = await getClassUsers(classKey);
    
    const myAdded = user.stats?.homeworkAdded || 0;
    const othersAdded = classUsers.reduce((sum, u) => {
      if (u.tgId !== user.tgId) {
        return sum + (u.stats?.homeworkAdded || 0);
      }
      return sum;
    }, 0);
    
    return {
      warns: user.warns || 0,
      myAdded,
      othersAdded
    };
  } catch (e) {
    console.error('Ошибка получения статистики админа:', e);
    return null;
  }
}
