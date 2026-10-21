import express from 'express';
import cookieParser from 'cookie-parser';
import path from 'path';
import { fileURLToPath } from 'url';
import config from '../config.js';
import bot from '../bot/bot.js';
import authRoutes from './routes/auth.js';
import homeworkRoutes from './routes/homework.js';
import scheduleRoutes from './routes/schedule.js';
import fileRoutes from './routes/file.js';
import newsRoutes from './routes/news.js';
import { originMiddleware } from './auth.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = config.port;

// Middleware
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(originMiddleware);

// Статические файлы
app.use(express.static(path.join(__dirname, 'public')));

// API маршруты
app.use('/api/auth', authRoutes);
app.use('/api/homework', homeworkRoutes);
app.use('/api/schedule', scheduleRoutes);
app.use('/api/file', fileRoutes);
app.use('/api/news', newsRoutes);

// Data файлы (города и школы)
app.use('/data', express.static(path.join(__dirname, '../../data')));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// SPA fallback (для клиентского роутинга)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/data') || req.path.startsWith('/tg')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Вебхук для Telegram
app.use(`/tg/${config.site.webhookSecret}`, bot.webhookCallback('/tg/' + config.site.webhookSecret));

// Запуск Express
export async function startExpress() {
  app.listen(PORT, () => {
    console.log(`✅ Express сервер запущен на порту ${PORT}`);
  });
  
  // Установка вебхука
  if (config.site.webhookUrl) {
    try {
      const webhookUrl = `${config.site.webhookUrl}/tg/${config.site.webhookSecret}`;
      await bot.telegram.setWebhook(webhookUrl);
      console.log('✅ Вебхук установлен');
    } catch (e) {
      console.error('❌ Ошибка установки вебхука:', e);
    }
  } else {
    console.warn('⚠️ WEBHOOK_URL не задан, вебхук не установлен');
  }
}

export default app;
