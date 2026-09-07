const { Markup } = require('telegraf');

/**
 * Reply-клавиатура для главного меню (для новых пользователей)
 */
function getStartReplyKeyboard() {
  return Markup.keyboard([
    ['📅 Расписание', '📚 Домашнее задание'],
    ['👤 Профиль', '⚙️ Настройки']
  ]).resize();
}

/**
 * Reply-клавиатура отмены действия
 */
function getCancelKeyboard() {
  return Markup.keyboard([['❌ Отмена']]).resize();
}

module.exports = {
  getStartReplyKeyboard,
  getCancelKeyboard
};
