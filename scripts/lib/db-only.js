// Импортируется первым в CLI-скриптах: переключает config.js в режим «только БД»,
// чтобы скрипты работали без BOT_TOKEN, JWT_SECRET и других секретов (Render Cron Job).
process.env.HW_CONFIG_SCOPE = 'db';
