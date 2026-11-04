import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { retry } from '../utils/retry.js';
import { originGuard } from './auth.js';
import { setupPages, renderNotFound } from './pages.js';
import { authRouter } from './routes/auth.js';
import { dataRouter } from './routes/data.js';
import { homeworkRouter } from './routes/homework.js';
import { scheduleRouter } from './routes/schedule.js';
import { newsRouter } from './routes/news.js';
import { adminRouter } from './routes/admin.js';
import { creatorRouter } from './routes/creator.js';
import { filesRouter } from './routes/files.js';
import { supportRouter } from './routes/support.js';

const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));
const FIFTEEN_MINUTES = 15 * 60 * 1000;
const AUTH_LIMITED_PATHS = [
  '/api/auth/start',
  '/api/auth/verify',
  '/api/auth/link',
  '/api/auth/register',
  '/api/auth/tma',
  '/api/auth/tg/start',
  '/api/auth/tg/verify',
  '/api/auth/tg/enter',
];

function webhookPath() {
  return `/tg/${config.webhook.secret}`;
}

export function createApp(bot) {
  const app = express();
  // Render и другие хостинги стоят за прокси: без этого лимиты считали бы всех с одного IP.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://telegram.org'],
          frameSrc: ["'self'", 'https://web.telegram.org'],
          frameAncestors: ["'self'", 'https://web.telegram.org'],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      // Mini App открывается внутри web.telegram.org, поэтому запрет фреймов задаёт только CSP frame-ancestors.
      xFrameOptions: false,
    }),
  );

  // Вебхук подключается до парсеров и лимитов: Telegram шлёт много запросов с небольшого набора IP.
  if (config.webhook.secret) {
    app.use(bot.webhookCallback(webhookPath(), { secretToken: config.webhook.secret }));
  }

  app.use(express.json({ limit: '8mb' }));
  app.use(express.urlencoded({ extended: true, limit: '8mb' }));
  app.use(cookieParser());

  app.use(
    '/api',
    rateLimit({
      windowMs: FIFTEEN_MINUTES,
      max: 100,
      standardHeaders: true,
      legacyHeaders: false,
      // Фото грузятся десятками на одну карточку и не должны съедать общий лимит API.
      skip: (req) => req.path.startsWith('/files/'),
      message: { error: 'too_many_requests' },
    }),
  );
  // Вход через Telegram ID — это 3 запроса (код, проверка, выбор аккаунта), поэтому лимит выше, чем был для одного спец-ID.
  // От подбора кода защищает отдельный лимит попыток в loginService.
  app.use(
    AUTH_LIMITED_PATHS,
    rateLimit({
      windowMs: FIFTEEN_MINUTES,
      max: 20,
      standardHeaders: true,
      legacyHeaders: false,
      message: { error: 'too_many_requests' },
    }),
  );
  app.use(originGuard);

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', db: mongoose.connection.readyState === 1 });
  });

  app.get('/bot-config.js', (req, res) => {
    const payload = JSON.stringify({ username: config.bot.username, siteUrl: config.siteUrl }).replace(/</g, '\\u003c');
    res.type('application/javascript').set('Cache-Control', 'no-cache').send(`window.BOT_CONFIG = ${payload};\n`);
  });

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send('User-agent: *\nDisallow: /api/\nAllow: /\n');
  });

  setupPages(app);
  // Шаблоны страниц отдаются только через setupPages, где подставляются переменные.
  const staticFiles = express.static(PUBLIC_DIR, { index: false, extensions: false });
  app.use((req, res, next) => (req.path.endsWith('.html') ? next() : staticFiles(req, res, next)));

  app.use('/api/auth', authRouter);
  app.use('/api/data', dataRouter);
  app.use('/api/homework', homeworkRouter);
  app.use('/api/schedule', scheduleRouter);
  app.use('/api/news', newsRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/creator', creatorRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/support', supportRouter);

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'not_found' });
  });

  app.use(async (req, res, next) => {
    try {
      res.status(404).type('html').send(await renderNotFound());
    } catch (err) {
      next(err);
    }
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
    if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
    console.error(`HTTP ${req.method} ${req.path}: ${err?.stack || err}`);
    if (res.headersSent) return res.end();
    return res.status(500).json({ error: 'internal' });
  });

  return app;
}

async function connectTelegram(bot) {
  if (config.webhook.url) {
    await retry(
      () =>
        bot.telegram.setWebhook(`${config.webhook.url}${webhookPath()}`, {
          secret_token: config.webhook.secret,
          drop_pending_updates: false,
        }),
      { label: 'Установка вебхука', attempts: 20 },
    );
    console.log('Вебхук установлен');
    return;
  }
  console.warn('WEBHOOK_URL не задан: бот запущен в режиме long polling (только для локальной разработки).');
  await retry(() => bot.telegram.deleteWebhook(), { label: 'Удаление вебхука', attempts: 20 });
  bot.launch().catch((err) => console.error(`Ошибка long polling: ${err.message}`));
}

export async function startServer(bot) {
  const app = createApp(bot);
  const httpServer = await new Promise((resolve, reject) => {
    const server = app.listen(config.port, () => resolve(server));
    server.on('error', reject);
  });
  console.log(`HTTP-сервер слушает порт ${config.port}`);
  // Связь с Telegram настраивается в фоне: сайт уже работает, а сбой сети при старте
  // (ETIMEDOUT до api.telegram.org) больше не останавливает процесс.
  connectTelegram(bot).catch((err) => console.error(`Не удалось подключиться к Telegram: ${err.code || err.message}`));
  return httpServer;
}
