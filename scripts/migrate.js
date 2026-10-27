import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const uri = process.env.MONGO_URI;

if (!uri) {
  console.error('Не задана переменная MONGO_URI');
  process.exit(1);
}

const FIELD_RENAMES = {
  id: 'tgId',
  chat_id: 'tgId',
  completed_homework: 'completedHomework',
  custom_keyboard: 'customKeyboard',
  pending_admin_request: 'pendingAdminRequest',
};

const FIELD_DROP = ['notification_slot', 'notifications_enabled'];

async function backupCollection(db, name, stamp) {
  const docs = await db.collection(name).find({}).toArray();
  const file = path.join('backup', `${name}-${stamp}.json`);
  await writeFile(file, JSON.stringify(docs, null, 2), 'utf8');
  console.log(`Резервная копия: ${file} (${docs.length} документов)`);
}

async function migrateUsers(db) {
  const users = db.collection('users');
  const cursor = users.find({});
  let migrated = 0;

  for await (const doc of cursor) {
    const set = {};
    const unset = {};

    for (const [oldField, newField] of Object.entries(FIELD_RENAMES)) {
      if (doc[oldField] !== undefined) {
        if (doc[newField] === undefined || doc[newField] === null) {
          set[newField] = oldField === 'id' || oldField === 'chat_id' ? Number(doc[oldField]) : doc[oldField];
        }
        unset[oldField] = '';
      }
    }

    for (const field of FIELD_DROP) {
      if (doc[field] !== undefined) unset[field] = '';
    }

    if (!doc.specId) set.specId = crypto.randomUUID();
    if (!doc.status) set.status = 'active';
    if (!doc.role) set.role = 'user';
    if (!Array.isArray(doc.platforms) || !doc.platforms.length) set.platforms = ['telegram'];
    if (!doc.registeredAt) set.registeredAt = doc.createdAt || new Date();
    if (doc.tgId !== undefined && typeof doc.tgId !== 'number') set.tgId = Number(doc.tgId);

    if (!Object.keys(set).length && !Object.keys(unset).length) continue;

    const update = {};
    if (Object.keys(set).length) update.$set = set;
    if (Object.keys(unset).length) update.$unset = unset;
    await users.updateOne({ _id: doc._id }, update);
    migrated += 1;
  }

  console.log(`Пользователей обновлено: ${migrated}`);
}

async function migrateHomework(db, collectionName = 'homeworks') {
  const collection = db.collection(collectionName);
  const docs = await collection.find({}).toArray();
  const users = await db.collection('users').find({ school: { $nin: [null, ''] } }).toArray();
  const keyByClass = new Map();
  for (const user of users) {
    if (user.class && user.school) keyByClass.set(user.class, `${user.school}::${user.class}`);
  }

  let renamed = 0;

  for (const doc of docs) {
    const classKey = doc.classKey;
    if (typeof classKey !== 'string' || classKey.includes('::')) continue;

    const newKey = keyByClass.get(classKey);
    if (!newKey) continue;

    const existing = await collection.findOne({ classKey: newKey });
    if (!existing) {
      await collection.updateOne({ _id: doc._id }, { $set: { classKey: newKey, updatedAt: new Date() } });
      renamed += 1;
      continue;
    }

    // Оба документа есть: переносим дни в новый ключ, старый удаляем
    const merged = { ...(existing.data || {}) };
    for (const [date, subjects] of Object.entries(doc.data || {})) {
      merged[date] = { ...(merged[date] || {}), ...subjects };
    }
    await collection.updateOne({ _id: existing._id }, { $set: { data: merged, updatedAt: new Date() } });
    await collection.deleteOne({ _id: doc._id });
    renamed += 1;
  }

  console.log(`Ключей ДЗ переименовано: ${renamed}`);
}

async function main() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await mkdir('backup', { recursive: true });

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15_000 });
  const db = mongoose.connection.db;

  const names = (await db.listCollections().toArray()).map((item) => item.name);
  for (const name of ['users', 'homeworks', 'homework']) {
    if (names.includes(name)) await backupCollection(db, name, stamp);
  }

  if (names.includes('users')) await migrateUsers(db);
  if (names.includes('homeworks')) await migrateHomework(db, 'homeworks');
  else if (names.includes('homework')) await migrateHomework(db, 'homework');

  console.log('Миграция завершена');
}

main()
  .then(() => mongoose.disconnect())
  .then(() => process.exit(0))
  .catch(async (error) => {
    console.error('Миграция не удалась:', error.message);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
  });
