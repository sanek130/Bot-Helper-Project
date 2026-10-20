/**
 * Скрипт миграции данных из старой структуры в новую
 * Идемпотентен - можно запускать повторно
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Подключение к MongoDB
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('❌ MONGO_URI не задан в переменных окружения');
  process.exit(1);
}

// Старые модели (для чтения)
const OldUserSchema = new mongoose.Schema({
  id: String,
  chat_id: Number,
  username: String,
  first_name: String,
  last_name: String,
  class: String,
  city: String,
  school: String,
  role: String,
  custom_keyboard: [String],
  notifications_enabled: Boolean,
  notification_slot: String,
  completed_homework: mongoose.Schema.Types.Mixed,
  pending_admin_request: Boolean,
  stats: {
    homework_views: Number,
    homework_added: Number,
    last_active: Date
  },
  registered_at: Date
}, { collection: 'users' });

const OldHomeworkSchema = new mongoose.Schema({
  classKey: String,
  data: mongoose.Schema.Types.Mixed,
  schedule_photo_id: String,
  updated_at: Date
}, { collection: 'homeworks' });

// Новые модели (для записи)
const NewUserSchema = new mongoose.Schema({
  specId: { type: String, unique: true },
  tgId: { type: Number, sparse: true, unique: true },
  username: String,
  firstName: String,
  city: String,
  school: String,
  class: String,
  role: String,
  adminBanned: Boolean,
  warns: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'active'], default: 'active' },
  platforms: [String],
  maxId: Number,
  completedHomework: mongoose.Schema.Types.Mixed,
  customKeyboard: [String],
  pendingAdminRequest: Boolean,
  stats: {
    homeworkViews: Number,
    homeworkAdded: Number,
    lastActive: Date
  },
  registeredAt: Date
}, { collection: 'users' });

const NewHomeworkSchema = new mongoose.Schema({
  classKey: String,
  data: mongoose.Schema.Types.Mixed,
  schedulePhotoId: String,
  updatedAt: Date
}, { collection: 'homeworks' });

const OldUser = mongoose.model('OldUser', OldUserSchema);
const OldHomework = mongoose.model('OldHomework', OldHomeworkSchema);
const NewUser = mongoose.model('User', NewUserSchema);
const NewHomework = mongoose.model('Homework', NewHomeworkSchema);

// Резервное копирование
async function createBackup() {
  const backupDir = path.join(__dirname, '..', 'backup');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const usersBackup = path.join(backupDir, `users-${timestamp}.json`);
  const homeworkBackup = path.join(backupDir, `homeworks-${timestamp}.json`);
  
  console.log('📦 Создание резервной копии...');
  
  const users = await OldUser.find({}).lean();
  const homeworks = await OldHomework.find({}).lean();
  
  fs.writeFileSync(usersBackup, JSON.stringify(users, null, 2));
  fs.writeFileSync(homeworkBackup, JSON.stringify(homeworks, null, 2));
  
  console.log(`✅ Резервная копия создана:`);
  console.log(`   ${usersBackup}`);
  console.log(`   ${homeworkBackup}`);
}

// Миграция пользователей
async function migrateUsers() {
  console.log('👤 Миграция пользователей...');
  
  const oldUsers = await OldUser.find({}).lean();
  let migrated = 0;
  let skipped = 0;
  
  for (const oldUser of oldUsers) {
    try {
      // Проверяем, есть ли уже новый пользователь с тем же specId
      const existingBySpecId = await NewUser.findOne({ specId: oldUser.id });
      if (existingBySpecId) {
        skipped++;
        continue;
      }
      
      // Генерируем specId, если его нет
      const specId = oldUser.id || crypto.randomUUID();
      
      // Определяем tgId (приоритет у chat_id, затем у id)
      const tgId = oldUser.chat_id || (oldUser.id ? Number(oldUser.id) : null);
      
      // Формируем данные для нового пользователя
      const newUser = {
        specId,
        tgId,
        username: oldUser.username,
        firstName: oldUser.first_name,
        city: oldUser.city,
        school: oldUser.school,
        class: oldUser.class,
        role: oldUser.role || 'user',
        adminBanned: false,
        warns: 0,
        status: 'active',
        platforms: ['telegram'],
        maxId: null,
        completedHomework: oldUser.completed_homework || {},
        customKeyboard: oldUser.custom_keyboard || [],
        pendingAdminRequest: oldUser.pending_admin_request || false,
        stats: oldUser.stats || {
          homeworkViews: 0,
          homeworkAdded: 0,
          lastActive: new Date()
        },
        registeredAt: oldUser.registered_at || new Date()
      };
      
      // Обновляем или создаём
      await NewUser.findOneAndUpdate(
        { specId },
        newUser,
        { upsert: true, new: true }
      );
      
      migrated++;
    } catch (e) {
      console.error(`❌ Ошибка миграции пользователя ${oldUser.id}:`, e.message);
    }
  }
  
  console.log(`✅ Пользователи: ${migrated} мигрировано, ${skipped} пропущено`);
}

// Миграция ДЗ
async function migrateHomework() {
  console.log('📚 Миграция ДЗ...');
  
  const oldHomeworks = await OldHomework.find({}).lean();
  let migrated = 0;
  let skipped = 0;
  let renamed = 0;
  
  for (const oldHw of oldHomeworks) {
    try {
      // Проверяем классKey
      let classKey = oldHw.classKey;
      
      // Если classKey без школы и школа известна из пользователей
      if (!classKey.includes('::')) {
        // Ищем пользователей этого класса
        const users = await NewUser.find({ class: classKey, school: { $ne: null } }).limit(1);
        if (users.length > 0) {
          const newClassKey = `${users[0].school}::${classKey}`;
          console.log(`   Переименование: ${classKey} → ${newClassKey}`);
          classKey = newClassKey;
          renamed++;
        }
      }
      
      // Формируем данные для нового ДЗ
      const newHomework = {
        classKey,
        data: oldHw.data || {},
        schedulePhotoId: oldHw.schedule_photo_id,
        updatedAt: oldHw.updated_at || new Date()
      };
      
      // Обновляем или создаём
      await NewHomework.findOneAndUpdate(
        { classKey },
        newHomework,
        { upsert: true, new: true }
      );
      
      migrated++;
    } catch (e) {
      console.error(`❌ Ошибка миграции ДЗ ${oldHw.classKey}:`, e.message);
    }
  }
  
  console.log(`✅ ДЗ: ${migrated} мигрировано, ${renamed} переименовано`);
}

// Удаление старых полей (для пользователей)
async function cleanupOldFields() {
  console.log('🧹 Очистка старых полей...');
  
  const result = await NewUser.updateMany(
    {},
    {
      $unset: {
        'chat_id': 1,
        'last_name': 1,
        'chat_type': 1,
        'notifications_enabled': 1,
        'notification_slot': 1
      }
    }
  );
  
  console.log(`✅ Очищено у ${result.modifiedCount} пользователей`);
}

// Основная функция
async function main() {
  try {
    console.log('🚀 Начало миграции...\n');
    
    await mongoose.connect(MONGO_URI);
    console.log('✅ Подключено к MongoDB\n');
    
    // Создаём резервную копию
    await createBackup();
    console.log();
    
    // Мигрируем пользователей
    await migrateUsers();
    console.log();
    
    // Мигрируем ДЗ
    await migrateHomework();
    console.log();
    
    // Очищаем старые поля
    await cleanupOldFields();
    console.log();
    
    console.log('✅ Миграция завершена успешно!');
    
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('❌ Ошибка миграции:', e);
    await mongoose.disconnect();
    process.exit(1);
  }
}

main();
