const { Scenes } = require('telegraf');
const Homework = require('../models').Homework;
const User = require('../models').User;
const logger = require('../config/logger').child({ module: 'adminBroadcast' });

/**
 * Сцена массовой рассылки по классу через WizardScene
 */
const adminBroadcastWizard = new Scenes.WizardScene(
  'admin_broadcast',
  
  // Шаг 0: Инициализация и проверка прав
  async (ctx) => {
    ctx.wizard.state.data = {};
    
    const user = await User.findOne({ telegramId: ctx.from.id }).lean();
    
    if (!user || (user.role !== 'admin' && user.role !== 'class_admin')) {
      await ctx.reply('❌ У вас нет прав для рассылки.');
      return ctx.scene.leave();
    }
    
    ctx.wizard.state.data.userRole = user.role;
    ctx.wizard.state.data.userClass = user.classGrade;
    
    await ctx.reply(
      '📢 Массовая рассылка\n\n' +
      'Введите текст сообщения для рассылки:',
      { reply_markup: { force_reply: true } }
    );
    
    return ctx.wizard.next();
  },
  
  // Шаг 1: Ввод текста сообщения
  async (ctx) => {
    const messageText = ctx.message?.text?.trim();
    
    if (!messageText) {
      await ctx.reply('❌ Пожалуйста, введите текст сообщения:');
      return ctx.wizard.selectStep(1);
    }
    
    ctx.wizard.state.data.messageText = messageText;
    
    // Определяем получателей
    const recipientsQuery = { classGrade: ctx.wizard.state.data.userClass };
    if (ctx.wizard.state.data.userRole === 'class_admin') {
      // Классный руководитель может писать только своему классу
      recipientsQuery.role = 'student';
    }
    
    const recipients = await User.find(recipientsQuery).select('telegramId fullName').lean();
    
    if (recipients.length === 0) {
      await ctx.reply('❌ Нет получателей для рассылки.');
      return ctx.scene.leave();
    }
    
    ctx.wizard.state.data.recipientCount = recipients.length;
    
    await ctx.reply(
      `📊 Получатели: ${recipients.length} чел.\n\n` +
      `📝 Текст:\n${messageText}\n\n` +
      'Отправить сообщение? (Да/Нет)',
      { reply_markup: { force_reply: true } }
    );
    
    return ctx.wizard.next();
  },
  
  // Шаг 2: Подтверждение рассылки
  async (ctx) => {
    const confirmText = ctx.message?.text?.toLowerCase();
    
    if (!confirmText || !(confirmText.includes('да') || confirmText === 'yes')) {
      await ctx.reply('❌ Рассылка отменена.');
      return ctx.scene.leave();
    }
    
    // Выполняем рассылку
    const { messageText, userClass, userRole } = ctx.wizard.state.data;
    
    const recipientsQuery = { classGrade: userClass };
    if (userRole === 'class_admin') {
      recipientsQuery.role = 'student';
    }
    
    const recipients = await User.find(recipientsQuery).select('telegramId').lean();
    
    let successCount = 0;
    let failCount = 0;
    
    for (const recipient of recipients) {
      try {
        await ctx.telegram.sendMessage(
          recipient.telegramId,
          `📢 Объявление от классного руководителя:\n\n${messageText}`
        );
        successCount++;
      } catch (error) {
        logger.warn({ 
          recipientId: recipient.telegramId, 
          error 
        }, 'Не удалось отправить сообщение');
        failCount++;
      }
      
      // Небольшая задержка чтобы не попасть под rate limit Telegram
      if (recipients.indexOf(recipient) % 10 === 0 && recipients.indexOf(recipient) > 0) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    logger.info({ 
      userId: ctx.from.id, 
      classGrade: userClass,
      successCount,
      failCount
    }, 'Рассылка выполнена');
    
    await ctx.reply(
      `✅ Рассылка завершена!\n\n` +
      `📬 Отправлено: ${successCount}\n` +
      `❌ Ошибок: ${failCount}`
    );
    
    return ctx.scene.leave();
  }
);

module.exports = {
  adminBroadcastWizard
};
