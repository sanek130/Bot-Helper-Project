import { Telegraf } from 'telegraf';
import { config } from '../config.js';

// Единственный экземпляр Telegraf. Вынесен отдельно, чтобы сервисы (notify, fileService, веб-роуты)
// могли отправлять сообщения без циклического импорта bot.js → router.js → flows.
export const bot = new Telegraf(config.bot.token, { handlerTimeout: 60_000 });
export default bot;
