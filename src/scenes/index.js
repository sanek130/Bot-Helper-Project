const { Scenes } = require('telegraf');
const { Stage } = require('telegraf');

// Импорт всех сцен
const { onboardingWizard, setupOnboardingHandlers } = require('./onboarding.scene');
const { addHomeworkWizard } = require('./addHomework.scene');
const { editHomeworkWizard, setupEditHomeworkHandlers } = require('./editHomework.scene');
const { adminBroadcastWizard } = require('./adminBroadcast.scene');

/**
 * Инициализация Stage (менеджер сцен) и регистрация всех WizardScene
 */
function initScenes(bot) {
  // Создаём Stage и добавляем все сцены
  const stage = new Stage([
    onboardingWizard,
    addHomeworkWizard,
    editHomeworkWizard,
    adminBroadcastWizard
  ]);
  
  // Подключаем middleware Stage ко всем апдейтам
  bot.use(stage.middleware());
  
  // Регистрируем обработчики inline-кнопок для сцен
  setupOnboardingHandlers(bot);
  setupEditHomeworkHandlers(bot);
  
  return stage;
}

module.exports = {
  initScenes,
  // Экспортируем сцены для использования в хендлерах
  scenes: {
    onboarding: onboardingWizard,
    addHomework: addHomeworkWizard,
    editHomework: editHomeworkWizard,
    adminBroadcast: adminBroadcastWizard
  }
};
