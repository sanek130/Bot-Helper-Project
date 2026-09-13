import express from 'express';
import crypto from 'crypto';
import { User } from './models/User.js';
import { Homework } from './models/Homework.js';

const router = express.Router();

// Валидация initData от Telegram
function validateInitData(initData, botToken) {
  if (!initData) return null;
  
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    params.delete('hash');
    
    const sortedParams = Array.from(params.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();
    
    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(sortedParams)
      .digest('hex');
    
    if (calculatedHash !== hash) return null;
    
    const user = JSON.parse(params.get('user') || '{}');
    return user;
  } catch {
    return null;
  }
}

// Middleware для проверки авторизации
router.use(async (req, res, next) => {
  const initData = req.headers['x-telegram-init-data'];
  const botToken = process.env.BOT_TOKEN;
  
  const user = validateInitData(initData, botToken);
  if (!user || !user.id) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  // Проверяем, есть ли пользователь в БД
  const dbUser = await User.findOne({ id: user.id.toString() });
  if (!dbUser) {
    return res.status(403).json({ error: 'Not registered. Use /start in bot first.' });
  }
  
  req.user = dbUser;
  req.telegramUser = user;
  next();
});

// GET /api/me - профиль пользователя
router.get('/me', async (req, res) => {
  const user = req.user;
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  res.json({
    id: user.id,
    first_name: user.first_name || '',
    last_name: user.last_name || '',
    username: user.username || '',
    class: user.class,
    role: user.role || 'user',
    notification_slot: user.notification_slot || '20',
    today: todayKey
  });
});

// GET /api/homework?from=YYYY-MM-DD&to=YYYY-MM-DD
router.get('/homework', async (req, res) => {
  const user = req.user;
  const { from, to } = req.query;
  
  if (!from || !to) {
    return res.status(400).json({ error: 'Missing from/to parameters' });
  }
  
  const homework = await Homework.findOne({ classKey: user.class });
  const allHomework = homework?.data || {};
  
  // Получаем completed ДЗ
  const completedMap = user.completed_homework || {};
  
  const days = {};
  let currentDate = new Date(from + 'T00:00:00Z');
  const endDate = new Date(to + 'T00:00:00Z');
  
  while (currentDate <= endDate) {
    const dateKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
    const dayHomework = allHomework[dateKey] || {};
    
    days[dateKey] = {};
    for (const [subject, task] of Object.entries(dayHomework)) {
      const completedList = completedMap[dateKey] || [];
      days[dateKey][subject] = {
        text: typeof task === 'object' ? task.text : task,
        icon: getSubjectIcon(subject),
        done: completedList.includes(subject)
      };
    }
    
    currentDate.setUTCDate(currentDate.getUTCDate() + 1);
  }
  
  res.json({ days });
});

// POST /api/homework/done - отметить ДЗ как выполненное
router.post('/homework/done', async (req, res) => {
  const user = req.user;
  const { date, subject } = req.body;
  
  if (!date || !subject) {
    return res.status(400).json({ error: 'Missing date or subject' });
  }
  
  const completed = { ...(user.completed_homework || {}) };
  const list = Array.isArray(completed[date]) ? [...completed[date]] : [];
  const idx = list.indexOf(subject);
  
  let done;
  if (idx === -1) {
    list.push(subject);
    done = true;
  } else {
    list.splice(idx, 1);
    done = false;
  }
  
  completed[date] = list;
  await User.updateOne({ id: user.id }, { completed_homework: completed });
  
  res.json({ done });
});

// GET /api/subjects - список предметов
router.get('/subjects', async (req, res) => {
  const user = req.user;
  const homework = await Homework.findOne({ classKey: user.class });
  const allHomework = homework?.data || {};
  
  const subjectSet = new Set();
  for (const date in allHomework) {
    for (const subject in allHomework[date]) {
      subjectSet.add(subject);
    }
  }
  
  const subjects = Array.from(subjectSet).map(name => ({
    name,
    icon: getSubjectIcon(name)
  }));
  
  res.json({ subjects });
});

// GET /api/homework/by-subject?name=...
router.get('/homework/by-subject', async (req, res) => {
  const user = req.user;
  const { name } = req.query;
  
  if (!name) {
    return res.status(400).json({ error: 'Missing subject name' });
  }
  
  const homework = await Homework.findOne({ classKey: user.class });
  const allHomework = homework?.data || {};
  
  const items = [];
  const today = new Date();
  
  for (const date in allHomework) {
    if (date >= `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`) {
      if (allHomework[date][name]) {
        const task = allHomework[date][name];
        items.push({
          date,
          subject: name,
          text: typeof task === 'object' ? task.text : task,
          icon: getSubjectIcon(name)
        });
      }
    }
  }
  
  items.sort((a, b) => a.date.localeCompare(b.date));
  res.json({ items: items.slice(0, 10) });
});

// GET /api/schedule - расписание
router.get('/schedule', async (req, res) => {
  const user = req.user;
  const homework = await Homework.findOne({ classKey: user.class });
  
  if (!homework?.schedule_photo_id) {
    return res.json({ url: null });
  }
  
  // Получаем URL фото через Telegram API
  try {
    const { Telegraf } = await import('telegraf');
    const bot = new Telegraf(process.env.BOT_TOKEN);
    const file = await bot.telegram.getFile(homework.schedule_photo_id);
    const url = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
    res.json({ url });
  } catch {
    res.json({ url: null });
  }
});

// POST /api/homework - добавить ДЗ (только админ)
router.post('/homework', async (req, res) => {
  const user = req.user;
  const { date, subject, text } = req.body;
  
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admins only' });
  }
  
  if (!date || !subject || !text) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  const homework = await Homework.findOne({ classKey: user.class });
  const data = homework?.data || {};
  
  if (!data[date]) data[date] = {};
  data[date][subject] = { type: 'text', text };
  
  await Homework.findOneAndUpdate(
    { classKey: user.class },
    { data, updated_at: new Date() },
    { upsert: true, new: true }
  );
  
  res.json({ ok: true });
});

// POST /api/homework/duplicate - дублировать день (только админ)
router.post('/homework/duplicate', async (req, res) => {
  const user = req.user;
  const { from, to } = req.body;
  
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admins only' });
  }
  
  const homework = await Homework.findOne({ classKey: user.class });
  const data = homework?.data || {};
  
  if (!data[from] || Object.keys(data[from]).length === 0) {
    return res.status(400).json({ error: 'source_empty' });
  }
  
  data[to] = { ...data[from] };
  
  await Homework.findOneAndUpdate(
    { classKey: user.class },
    { data, updated_at: new Date() },
    { upsert: true, new: true }
  );
  
  res.json({ count: Object.keys(data[to]).length });
});

// POST /api/broadcast - рассылка (только админ)
router.post('/broadcast', async (req, res) => {
  const user = req.user;
  const { text } = req.body;
  
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admins only' });
  }
  
  // Отправка через бота будет реализована отдельно
  res.json({ sent: 0 });
});

// Вспомогательная функция для иконок
function getSubjectIcon(subject) {
  const icons = {
    'Алгебра': '📐',
    'Геометрия': '📐',
    'Русский': '📝',
    'Литература': '📚',
    'Английский': '',
    'Физика': '⚛️',
    'Химия': '⚗️',
    'Биология': '',
    'История': '',
    'География': '',
    'Информатика': '',
    'Физкультура': '⚽',
    'ОБЖ': '🦺',
    'Музыка': '🎵',
    'ИЗО': '🎨'
  };
  
  for (const [key, icon] of Object.entries(icons)) {
    if (subject.includes(key)) return icon;
  }
  return '📖';
}

export default router;
