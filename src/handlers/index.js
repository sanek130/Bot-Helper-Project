// Экспорт всех хендлеров
const mainMenuHandler = require('./mainMenu.handler');
const homeworkHandler = require('./homework.handler');

module.exports = {
  ...mainMenuHandler,
  ...homeworkHandler
};
