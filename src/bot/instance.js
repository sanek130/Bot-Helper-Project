import https from 'node:https';
import { Telegraf } from 'telegraf';
import { config } from '../config.js';

// Свой агент для api.telegram.org: принудительно IPv4 (на хостингах без рабочего IPv6 запросы
// висят до ETIMEDOUT) и keep-alive, чтобы не открывать TLS-соединение на каждый запрос.
const telegramAgent = new https.Agent({ keepAlive: true, keepAliveMsecs: 10_000, family: 4 });

// Единственный экземпляр Telegraf. Вынесен отдельно, чтобы сервисы (notify, fileService, веб-роуты)
// могли отправлять сообщения без циклического импорта bot.js → router.js → flows.
export const bot = new Telegraf(config.bot.token, {
  handlerTimeout: 60_000,
  telegram: { agent: telegramAgent },
});
export default bot;
