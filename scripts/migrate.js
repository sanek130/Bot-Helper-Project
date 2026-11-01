#!/usr/bin/env node
import './lib/db-only.js';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { config } from '../src/config.js';
import { connectDB, disconnectDB } from '../src/db/connect.js';

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

// Шаг 0. Полный JSON-дамп всех коллекций до любых изменений.
async function backupAll(db) {
  const dir = path.resolve('backup', timestamp());
  await fs.mkdir(dir, { recursive: true });
  const collections = await db.listCollections().toArray();
  let total = 0;
  for (const { name } of collections) {
    if (name.startsWith('system.')) continue;
    const docs = await db.collection(name).find({}).toArray();
    await fs.writeFile(path.join(dir, `${name}.json`), JSON.stringify(docs, null, 2), 'utf8');
    total += docs.length;
    console.log(`  бэкап ${name}: ${docs.length} док.`);
  }
  console.log(`Шаг 0: бэкап создан в ${dir} (${total} документов)`);
  return dir;
}

// Шаг 1. Переименование полей. $rename идемпотентен: если старого поля нет — документ не меняется.
async function renameUserFields(users) {
  let processed = 0;
  const legacyId = await users.updateMany(
    { tgId: { $exists: false }, id: { $type: 'number' } },
    [{ $set: { tgId: '$id' } }, { $unset: 'id' }],
  );
  processed += legacyId.modifiedCount;
  const legacyChat = await users.updateMany(
    { tgId: { $exists: false }, chat_id: { $exists: true } },
    [{ $set: { tgId: { $toLong: '$chat_id' } } }, { $unset: 'chat_id' }],
  );
  processed += legacyChat.modifiedCount;
  const renames = {
    completed_homework: 'completedHomework',
    custom_keyboard: 'customKeyboard',
    pending_admin_request: 'pendingAdminRequest',
  };
  for (const [from, to] of Object.entries(renames)) {
    const res = await users.updateMany({ [from]: { $exists: true }, [to]: { $exists: false } }, { $rename: { [from]: to } });
    processed += res.modifiedCount;
    // Если новое поле уже есть, старое просто удаляется, чтобы не было дублей.
    const cleanup = await users.updateMany({ [from]: { $exists: true } }, { $unset: { [from]: '' } });
    processed += cleanup.modifiedCount;
  }
  const unset = await users.updateMany(
    { $or: [{ notification_slot: { $exists: true } }, { notifications_enabled: { $exists: true } }] },
    { $unset: { notification_slot: '', notifications_enabled: '' } },
  );
  processed += unset.modifiedCount;
  // Остатки chat_id/id у документов, где tgId уже был.
  const leftovers = await users.updateMany(
    { tgId: { $exists: true }, $or: [{ chat_id: { $exists: true } }, { id: { $exists: true } }] },
    { $unset: { chat_id: '', id: '' } },
  );
  processed += leftovers.modifiedCount;
  console.log(`Шаг 1: переименование полей User — изменено ${processed} операций`);
}

async function generateSpecIds(users) {
  const cursor = users.find({ $or: [{ specId: { $exists: false } }, { specId: null }, { specId: '' }] }, { projection: { _id: 1 } });
  let processed = 0;
  for await (const doc of cursor) {
    await users.updateOne({ _id: doc._id }, { $set: { specId: crypto.randomUUID() } });
    processed += 1;
  }
  console.log(`Шаг 2: specId сгенерирован для ${processed} пользователей`);
}

async function fillStatus(users) {
  const res = await users.updateMany(
    { $or: [{ status: { $exists: false } }, { status: null }] },
    { $set: { status: 'active' } },
  );
  console.log(`Шаг 3: status='active' установлен для ${res.modifiedCount} пользователей`);
}

function mergeDayData(target, source) {
  const result = { ...(target || {}) };
  for (const [dateKey, subjects] of Object.entries(source || {})) {
    result[dateKey] = { ...(result[dateKey] || {}) };
    for (const [hash, task] of Object.entries(subjects || {})) {
      if (!result[dateKey][hash]) result[dateKey][hash] = task;
    }
  }
  return result;
}

async function migrateClassKeys(homeworks, users) {
  const cursor = homeworks.find({ classKey: { $not: /::/ } });
  let processed = 0;
  let skipped = 0;
  for await (const doc of cursor) {
    const owner = await users.findOne(
      { class: { $regex: new RegExp(`^${doc.classKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }, school: { $nin: [null, ''] } },
      { sort: { createdAt: 1 } },
    );
    if (!owner) {
      skipped += 1;
      console.log(`  пропущен classKey="${doc.classKey}": не найдена школа`);
      continue;
    }
    const newKey = `${owner.school}::${doc.classKey}`;
    const existing = await homeworks.findOne({ classKey: newKey });
    if (existing) {
      const merged = mergeDayData(existing.data, doc.data);
      await homeworks.updateOne(
        { _id: existing._id },
        { $set: { data: merged, schedulePhotoId: existing.schedulePhotoId || doc.schedulePhotoId || null } },
      );
      await homeworks.deleteOne({ _id: doc._id });
    } else {
      await homeworks.updateOne({ _id: doc._id }, { $set: { classKey: newKey } });
    }
    processed += 1;
  }
  console.log(`Шаг 4: classKey переименован у ${processed} документов, пропущено ${skipped}`);
}

async function main() {
  console.log(`[${new Date().toISOString()}] Миграция HW-Helper (CLEANUP_DAYS=${config.cleanupDays})`);
  try {
    await connectDB();
    const db = mongoose.connection.db;
    await backupAll(db);
    const users = db.collection('users');
    const homeworks = db.collection('homeworks');
    await renameUserFields(users);
    await generateSpecIds(users);
    await fillStatus(users);
    await migrateClassKeys(homeworks, users);
    await disconnectDB();
    console.log('Миграция завершена успешно.');
    process.exit(0);
  } catch (err) {
    console.error('Ошибка миграции:', err.message);
    try {
      await disconnectDB();
    } catch {
      // соединение уже закрыто
    }
    process.exit(1);
  }
}

main();
