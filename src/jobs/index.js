// Экспорт всех cron-задач
const { initHomeworkReminder } = require('./homeworkReminder.job');

/**
 * Инициализация всех фоновых задач
 * @param {Telegraf} bot - экземпляр бота
 */
function initJobs(bot) {
  const jobs = [];
  
  // Инициализируем задачу напоминаний о ДЗ
  const homeworkReminderJob = initHomeworkReminder(bot);
  jobs.push(homeworkReminderJob);
  
  // Здесь можно добавить другие задачи:
  // - Уведомления об изменениях расписания
  // - Очистка старых данных
  // - Синхронизация с внешними системами
  
  return jobs;
}

module.exports = {
  initJobs,
  initHomeworkReminder
};
