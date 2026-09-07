const Homework = require('../models').Homework;
const User = require('../models').User;
const logger = require('../config/logger').child({ module: 'homeworkService' });

/**
 * Получить все ДЗ для класса пользователя
 * @param {number} telegramId - Telegram ID пользователя
 * @param {Object} options - опции фильтрации
 */
async function getClassHomework(telegramId, options = {}) {
  const user = await User.findOne({ telegramId }).lean();
  
  if (!user) {
    throw new Error('Пользователь не найден');
  }
  
  const query = { classGrade: user.classGrade };
  
  // Фильтр по дате
  if (options.date) {
    const targetDate = new Date(options.date);
    const startOfDay = new Date(targetDate.setHours(0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59));
    query.dueDate = { $gte: startOfDay, $lte: endOfDay };
  }
  
  // Фильтр по предмету
  if (options.subject) {
    query.subject = new RegExp(options.subject, 'i');
  }
  
  // Только активные (не просроченные)
  if (options.activeOnly) {
    query.dueDate = { $gte: new Date() };
  }
  
  const homeworks = await Homework.find(query)
    .sort({ dueDate: 1 })
    .limit(options.limit || 50)
    .lean();
  
  return {
    homeworks,
    classGrade: user.classGrade,
    total: homeworks.length
  };
}

/**
 * Получить ДЗ по ID
 * @param {string} homeworkId - ID домашнего задания
 * @param {number} telegramId - Telegram ID пользователя (для проверки прав)
 */
async function getHomeworkById(homeworkId, telegramId) {
  const user = await User.findOne({ telegramId }).lean();
  
  if (!user) {
    throw new Error('Пользователь не найден');
  }
  
  const homework = await Homework.findOne({ 
    _id: homeworkId,
    classGrade: user.classGrade 
  }).lean();
  
  if (!homework) {
    throw new Error('ДЗ не найдено');
  }
  
  return homework;
}

/**
 * Создать новое ДЗ
 * @param {Object} data - данные ДЗ
 * @param {number} creatorTelegramId - Telegram ID создателя
 */
async function createHomework(data, creatorTelegramId) {
  const user = await User.findOne({ telegramId: creatorTelegramId }).lean();
  
  if (!user) {
    throw new Error('Пользователь не найден');
  }
  
  // Проверка прав (только админы и классные руководители могут создавать ДЗ)
  if (user.role !== 'admin' && user.role !== 'class_admin') {
    throw new Error('Недостаточно прав для создания ДЗ');
  }
  
  const homework = new Homework({
    ...data,
    classGrade: user.classGrade,
    postedBy: creatorTelegramId
  });
  
  await homework.save();
  
  logger.info({ 
    userId: creatorTelegramId, 
    homeworkId: homework._id,
    subject: homework.subject 
  }, 'ДЗ создано');
  
  return homework;
}

/**
 * Обновить ДЗ
 * @param {string} homeworkId - ID домашнего задания
 * @param {Object} updateData - данные для обновления
 * @param {number} updaterTelegramId - Telegram ID обновляющего
 */
async function updateHomework(homeworkId, updateData, updaterTelegramId) {
  const user = await User.findOne({ telegramId: updaterTelegramId }).lean();
  
  if (!user) {
    throw new Error('Пользователь не найден');
  }
  
  // Проверка прав
  if (user.role !== 'admin' && user.role !== 'class_admin') {
    throw new Error('Недостаточно прав для редактирования ДЗ');
  }
  
  const homework = await Homework.findOneAndUpdate(
    { 
      _id: homeworkId,
      classGrade: user.classGrade 
    },
    updateData,
    { new: true }
  );
  
  if (!homework) {
    throw new Error('ДЗ не найдено');
  }
  
  logger.info({ 
    userId: updaterTelegramId, 
    homeworkId,
    updates: Object.keys(updateData)
  }, 'ДЗ обновлено');
  
  return homework;
}

/**
 * Удалить ДЗ
 * @param {string} homeworkId - ID домашнего задания
 * @param {number} deleterTelegramId - Telegram ID удаляющего
 */
async function deleteHomework(homeworkId, deleterTelegramId) {
  const user = await User.findOne({ telegramId: deleterTelegramId }).lean();
  
  if (!user) {
    throw new Error('Пользователь не найден');
  }
  
  // Проверка прав
  if (user.role !== 'admin' && user.role !== 'class_admin') {
    throw new Error('Недостаточно прав для удаления ДЗ');
  }
  
  const result = await Homework.deleteOne({
    _id: homeworkId,
    classGrade: user.classGrade
  });
  
  if (result.deletedCount === 0) {
    throw new Error('ДЗ не найдено');
  }
  
  logger.info({ 
    userId: deleterTelegramId, 
    homeworkId 
  }, 'ДЗ удалено');
  
  return true;
}

/**
 * Получить статистику ДЗ для класса
 * @param {string} classGrade - класс (например, "9А")
 */
async function getHomeworkStats(classGrade) {
  const today = new Date();
  today.setHours(0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  const [total, active, overdue, dueToday, dueTomorrow] = await Promise.all([
    Homework.countDocuments({ classGrade }),
    Homework.countDocuments({ classGrade, dueDate: { $gte: today } }),
    Homework.countDocuments({ classGrade, dueDate: { $lt: today } }),
    Homework.countDocuments({ 
      classGrade, 
      dueDate: { $gte: today, $lt: tomorrow } 
    }),
    Homework.countDocuments({ 
      classGrade, 
      dueDate: { $gte: tomorrow, $lt: new Date(tomorrow.setDate(tomorrow.getDate() + 1)) } 
    })
  ]);
  
  return {
    total,
    active,
    overdue,
    dueToday,
    dueTomorrow
  };
}

module.exports = {
  getClassHomework,
  getHomeworkById,
  createHomework,
  updateHomework,
  deleteHomework,
  getHomeworkStats
};
