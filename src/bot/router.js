import bot from './bot.js';
import { normalizeText } from '../utils/normalize.js';
import { getUserByTgId } from '../services/userService.js';
import { TEXTS } from './texts.js';
import { safeAnswerCb, replyOrEdit } from './bot.js';

// Импортируем flows
import './flows/help.js';
import './flows/registration.js';
import './flows/menu.js';
import './flows/homework.js';
import './flows/schedule.js';
import './flows/profile.js';
import './flows/admin-add.js';
import './flows/admin-delete.js';
import './flows/admin-edit.js';
import './flows/broadcast.js';
import './flows/admin-panel.js';
import './flows/stats.js';

// Функция для показа главного меню
async function showMainMenu(ctx) {
  // Делигируем в menu.js
  const menuModule = await import('./flows/menu.js');
  await menuModule.showMenuPage1(ctx);
}

// Обработка текстовых сообщений и кнопок
bot.on('message', async (ctx) => {
  try {
    const userId = ctx.from?.id;
    const text = ctx.message?.text;
    
    if (!text) return;
    
    const normalized = normalizeText(text);
    const user = await getUserByTgId(userId);
    
    // Команды
    if (normalized === '/start' || normalized === 'начать' || normalized === 'старт') {
      // Обрабатывается в registration.js
    } else if (normalized === '/menu' || normalized === 'меню') {
      await showMainMenu(ctx);
    } else if (normalized === '/help' || normalized === 'помощь') {
      // Обрабатывается в help.js
    } else if (normalized === '/profile' || normalized === 'профиль') {
      // Обрабатывается в profile.js
    } else if (normalized === '/web' || normalized === 'веб' || normalized === 'веб-версия') {
      const config = (await import('../config.js')).default;
      const webUrl = config.site.url;
      await ctx.reply(`🌐 Веб-версия: ${webUrl}`);
    }
    
    // Кнопки меню
    else if (normalized === 'сегодня') {
      // Обрабатывается в homework.js
    } else if (normalized === 'завтра') {
      // Обрабатывается в homework.js
    } else if (normalized === 'послезавтра') {
      // Обрабатывается в homework.js
    } else if (normalized === 'неделя') {
      // Обрабатывается в homework.js
    } else if (normalized === 'выбор дня') {
      // Обрабатывается в homework.js
    } else if (normalized === 'расписание') {
      // Обрабатывается в schedule.js
    }
    
    // Если пользователь не зарегистрирован
    else if (!user) {
      await ctx.reply(TEXTS.errors.notRegistered, {
        parse_mode: 'HTML'
      });
    }
    
    // Текстовые сообщения для flows обрабатываются в самих flow-файлах
    
  } catch (e) {
    console.error('Ошибка в bot.on("message"):', e);
    await ctx.reply(TEXTS.errors.somethingWentWrong, {
      parse_mode: 'HTML'
    });
  }
});

// Обработка callback-кнопок
bot.action('cancel', async (ctx) => {
  // TODO: очистка сессии и открытие меню
  await safeAnswerCb(ctx);
  await ctx.reply('Отмена - в разработке');
});

bot.action('back', async (ctx) => {
  // TODO: возвращение на предыдущий шаг сессии
  await safeAnswerCb(ctx);
  await ctx.reply('Назад - в разработке');
});

bot.action('stats', async (ctx) => {
  const statsModule = await import('./flows/stats.js');
  await statsModule.showStats(ctx);
});

bot.action('adminPanel', async (ctx) => {
  const adminPanelModule = await import('./flows/admin-panel.js');
  await adminPanelModule.showAdminPanel(ctx);
});

bot.action('menu', async (ctx) => {
  await showMainMenu(ctx);
});
