import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import config from '../config.js';
import bot from '../bot/bot.js';
import { originGuard } from './auth.js';
import { registerPages } from './pages.js';
import authRoutes from './routes/auth.js';
import homeworkRoutes from './routes/homework.js';
import scheduleRoutes from './routes/schedule.js';
import newsRoutes from './routes/news.js';
import adminRoutes from './routes/admin.js';
import creatorRoutes from './routes/creator.js';
import fileRoutes from './routes/files.js';
import supportRoutes from './routes/support.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      scriptSrc: ["'self'", 'https://telegram.org', 'https://accounts.google.com/gsi/client'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style'],
      connectSrc: ["'self'", 'https://accounts.google.com/gsi/'],
      frameSrc: ['https://oauth.telegram.org', 'https://accounts.google.com/gsi/'],
      // Мини-приложение открывается во фрейме веб-версии Telegram
      frameAncestors: [(req) => (req.path === '/tma' ? 'https://web.telegram.org https://*.telegram.org' : "'none'")],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      // На локальном http не апгрейдим запросы, иначе стили и скрипты не загрузятся
      upgradeInsecureRequests: config.site.url.startsWith('https://') ? [] : null,
    },
  },
  // Окно входа Google открывается во всплывающем окне
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  frameguard: false,
}));

app.use(cookieParser());
app.use(express.json({ limit: '8mb' }));
app.use(originGuard);

app.use('/api/auth', authRoutes);
app.use('/api/homework', homeworkRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/creator', creatorRoutes);
app.use('/api/files', fileRoutes);
app.use('/api/support', supportRoutes);

app.get('/health', (req, res) => {
  const db = mongoose.connection.readyState === 1 ? 'ok' : 'down';
  res.status(db === 'ok' ? 200 : 503).json({ status: db === 'ok' ? 'ok' : 'degraded', db });
});

registerPages(app);

app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1h', index: false }));

// Вебхук Telegram: путь содержит секрет, в лог секрет не пишем
if (config.site.webhookSecret) {
  // Telegraf сам сверяет req.url с полным путём, поэтому не монтируем его через app.use(path, ...)
  app.use(bot.webhookCallback(`/tg/${config.site.webhookSecret}`, { secretToken: config.site.webhookSecret }));
}

app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }));

app.use((req, res) => {
  res.status(404).type('html').send('<!DOCTYPE html><meta charset="utf-8"><title>404</title><p>Страница не найдена. <a href="/">На главную</a></p>');
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  console.error('Ошибка API:', error.message);
  const status = error.status || 500;
  return res.status(status).json({ error: status === 500 ? 'internal_error' : error.code || 'bad_request' });
});

export async function startServer() {
  const server = app.listen(config.port, '0.0.0.0', () => {
    console.log(`HTTP-сервер слушает порт ${config.port}`);
  });

  if (config.site.webhookUrl && config.site.webhookSecret) {
    const url = `${config.site.webhookUrl}/tg/${config.site.webhookSecret}`;
    try {
      await bot.telegram.setWebhook(url, { secret_token: config.site.webhookSecret });
      console.log('Вебхук установлен');
    } catch (error) {
      console.error('Не удалось установить вебхук:', error.message);
    }
  } else {
    // Без вебхука (локально) бот получает сообщения через long polling
    console.warn('WEBHOOK_URL не задан: бот работает через long polling');
    bot.launch().catch((error) => console.error('Не удалось запустить polling:', error.message));
  }

  return server;
}

export default app;
