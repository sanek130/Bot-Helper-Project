import bot from './bot.js';
import { normalizeText } from '../utils/normalize.js';
import { getUserByTgId } from '../services/userService.js';
import { TEXTS } from './texts.js';

// Импортируем flows
import './flows/help.js';

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
      // TODO: registration flow
      await ctx.reply('Регистрация в разработке');
    } else if (normalized === '/menu' || normalized === 'меню') {
      // TODO: menu flow
      await ctx.reply('Меню в разработке');
    } else if (normalized === '/help' || normalized === 'помощь') {
      // Обрабатывается в help.js
    } else if (normalized === '/profile' || normalized === 'профиль') {
      // TODO: profile flow
      await ctx.reply('Профиль в разработке');
    } else if (normalized === '/web' || normalized === 'веб' || normalized === 'веб-версия') {
      // TODO: web link
      await ctx.reply('Веб-версия в разработке');
    }
    
    // Кнопки меню
    else if (normalized === 'сегодня') {
      // TODO: homework flow
      await ctx.reply('Сегодня в разработке');
    } else if (normalized === 'завтра') {
      // TODO: homework flow
      await ctx.reply('Завтра в разработке');
    } else if (normalized === 'послезавтра') {
      // TODO: homework flow
      await ctx.reply('Послезавтра в разработке');
    } else if (normalized === 'неделя') {
      // TODO: homework flow
      await ctx.reply('Неделя в разработке');
    } else if (normalized === 'выбор дня') {
      // TODO: homework flow
      await ctx.reply('Выбор дня в разработке');
    } else if (normalized === 'расписание') {
      // TODO: schedule flow
      await ctx.reply('Расписание в разработке');
    }
    
    // Если пользователь не зарегистрирован
    else if (!user) {
      await ctx.reply(TEXTS.errors.notRegistered, {
        parse_mode: 'HTML'
      });
    }
    
    // TODO: Обработка сессий (registration, homework edit и т.д.)
    
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

bot.action('menu', async (ctx) => {
  // TODO: открытие меню
  await safeAnswerCb(ctx);
  await ctx.reply('Меню - в разработке');
});

async function safeAnswerCb(ctx, text = '') {
  try {
    await ctx.answerCbQuery(text);
  } catch (err) {
    if (err.description?.includes('query is too old')) {
      console.warn('Ignored stale callback query');
    } else {
      console.error('Failed to answer callback:', err.message);
    }
  }
}
