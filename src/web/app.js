import express from 'express';
import config from '../config.js';
import bot from '../bot/bot.js';

const app = express();
const PORT = config.port;

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
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
