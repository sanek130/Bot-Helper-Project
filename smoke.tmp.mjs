import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '/home/alexandr/Documents/Bot-Helper-Project-7664f58_2mainver/src/db/connect.js';
import { User } from '/home/alexandr/Documents/Bot-Helper-Project-7664f58_2mainver/src/db/models/User.js';
import { Homework } from '/home/alexandr/Documents/Bot-Helper-Project-7664f58_2mainver/src/db/models/Homework.js';
import { News } from '/home/alexandr/Documents/Bot-Helper-Project-7664f58_2mainver/src/db/models/News.js';
import { Report } from '/home/alexandr/Documents/Bot-Helper-Project-7664f58_2mainver/src/db/models/Report.js';
import { addHomework, getClassKey } from '/home/alexandr/Documents/Bot-Helper-Project-7664f58_2mainver/src/services/homeworkService.js';
import { createToken } from '/home/alexandr/Documents/Bot-Helper-Project-7664f58_2mainver/src/web/auth.js';
import { activateLink, createLinkLoginRequest } from '/home/alexandr/Documents/Bot-Helper-Project-7664f58_2mainver/src/services/loginService.js';
import { toDateKey, addDaysToKey } from '/home/alexandr/Documents/Bot-Helper-Project-7664f58_2mainver/src/services/dateService.js';
import app from '/home/alexandr/Documents/Bot-Helper-Project-7664f58_2mainver/src/web/app.js';

const BASE = 'http://127.0.0.1:3999';

async function call(path, { method = 'GET', body, cookie } = {}) {
  const headers = { Accept: 'application/json', Origin: process.env.SITE_URL };
  if (body) headers['Content-Type'] = 'application/json';
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

await connectDB();
await mongoose.connection.db.dropDatabase();

const today = toDateKey();
const classKey = 'гимназия 1::10А';

const creator = await User.create({ tgId: 111111111, firstName: 'Создатель', city: 'Краснодар', school: 'гимназия 1', class: '10А', role: 'creator', status: 'active', platforms: ['telegram'] });
const admin = await User.create({ tgId: 222222222, firstName: 'Админ', username: 'admin', city: 'Краснодар', school: 'гимназия 1', class: '10А', role: 'admin', status: 'active', platforms: ['telegram'] });
const student = await User.create({ tgId: 333333333, firstName: 'Ученик', city: 'Краснодар', school: 'гимназия 1', class: '10А', role: 'user', status: 'active', platforms: ['telegram'] });

const creatorToken = await createToken(creator.specId);
const adminToken = await createToken(admin.specId);
const studentToken = await createToken(student.specId);
const creatorCookie = `session=${creatorToken}`;
const adminCookie = `session=${adminToken}`;
const studentCookie = `session=${studentToken}`;

await addHomework({ classKey, dateKey: today, subject: 'Алгебра', text: 'Решить 1–10', addedBy: admin.tgId });
await addHomework({ classKey, dateKey: today, subject: 'Русский', text: 'Упражнение 215', addedBy: admin.tgId });

const server = app.listen(3999);

let r = await call('/health');
console.log('health', r.status, r.data);

r = await call(`/api/homework?date=${today}`, { cookie: studentCookie });
assert.equal(r.status, 200);
assert.equal(r.data.items.length, 2);
console.log('homework ok', r.data.items.map((i) => i.subject));

r = await call('/api/homework/check', { method: 'POST', body: { date: today, subject: 'Алгебра', done: true }, cookie: studentCookie });
assert.equal(r.data.done, true);
console.log('check ok');

r = await call('/api/homework', { method: 'POST', body: { date: addDaysToKey(today, 1), subject: 'Физика', text: '§ 12' }, cookie: studentCookie });
assert.equal(r.status, 403);
console.log('student cannot add: ok');

r = await call('/api/homework', { method: 'POST', body: { date: addDaysToKey(today, 1), subject: 'Физика', text: '§ 12' }, cookie: adminCookie });
assert.equal(r.status, 200);
console.log('admin add ok', r.data);

r = await call('/api/homework/week?offset=0', { cookie: studentCookie });
assert.equal(r.status, 200);
console.log('week days', r.data.days.length);

r = await call('/api/homework/copy?date=' + today, { cookie: studentCookie });
assert.ok(r.data.text.includes('Алгебра'));
console.log('copy ok');

r = await call('/api/homework', { method: 'PUT', body: { date: addDaysToKey(today, 1), subject: 'Физика', text: '§ 13' }, cookie: adminCookie });
assert.equal(r.status, 200);
r = await call('/api/homework', { method: 'POST', body: { date: addDaysToKey(today, 1), subject: 'Химия', text: 'Задача 5' }, cookie: adminCookie });
r = await call('/api/homework/duplicate', { method: 'POST', body: { from: addDaysToKey(today, 1), to: addDaysToKey(today, 2) }, cookie: adminCookie });
assert.equal(r.data.copied, 2);
console.log('duplicate ok');

r = await call('/api/news', { method: 'POST', body: { title: 'Привет', body: 'Текст новости', audience: 'all' }, cookie: creatorCookie });
assert.equal(r.status, 200, JSON.stringify(r.data));
r = await call('/api/news');
assert.equal(r.data.news.length, 1);
console.log('news ok');

r = await call('/api/creator/users?q=админ', { cookie: creatorCookie });
assert.equal(r.status, 200);
assert.ok(r.data.users.some((u) => u.firstName === 'Админ'));
console.log('creator users ok');

r = await call('/api/creator/reports', { cookie: creatorCookie });
assert.equal(r.status, 200);
console.log('reports ok', r.data.reports.length);

r = await call('/api/creator/audiences', { cookie: creatorCookie });
assert.ok(r.data.cities.includes('Краснодар'));
console.log('audiences ok', r.data);

r = await call('/api/admin/stats', { cookie: adminCookie });
assert.equal(r.status, 200);
console.log('stats', r.data.stats.classUsers, r.data.stats.adminCount);

// Регистрация на сайте и активация одноразовой ссылкой
r = await call('/api/auth/register', { method: 'POST', body: { city: 'Краснодар', school: 'гимназия 1', class: '9Б', role: 'user' } });
assert.equal(r.status, 200, JSON.stringify(r.data));
const pendingSpec = r.data.specId;
assert.ok(r.data.activationLink.includes('t.me/'));
console.log('register ok', r.data.activationLink);

r = await call('/api/auth/pending?specId=' + pendingSpec);
assert.equal(r.data.status, 'pending');

const link = await createLinkLoginRequest(pendingSpec);
const activated = await activateLink(link.token, 444444444, { first_name: 'Новый', username: 'newbie' });
assert.equal(activated.ok, true);
assert.equal(activated.user.status, 'active');
console.log('link activation ok');

r = await call('/api/auth/pending?specId=' + pendingSpec);
assert.equal(r.data.status, 'active');

// Повторная активация уже использованной ссылки
const again = await activateLink(link.token, 444444444);
assert.equal(again.ok, false);

// Чеклист и completedHomework
r = await call('/api/auth/me', { cookie: studentCookie });
assert.equal(r.status, 200);
assert.equal(r.data.user.firstName, 'Ученик');

// Выход и отзыв токена
r = await call('/api/auth/logout', { method: 'POST', cookie: studentCookie });
assert.equal(r.status, 200);
r = await call('/api/auth/me', { cookie: studentCookie });
assert.equal(r.status, 401);
console.log('logout ok');

// Отчёт создаётся в сервисе/боте, проверим модель и панель
await Report.create({ fromUserId: String(student.tgId), onAdminId: String(admin.tgId), classKey, text: 'Плохо удалил ДЗ', status: 'open' });
r = await call('/api/creator/reports', { cookie: creatorCookie });
assert.equal(r.data.reports.length, 1);
assert.equal(r.data.reports[0].onAdmin.firstName, 'Админ');
console.log('reports data ok');

server.close();
await disconnectDB();
console.log('SMOKE OK');
process.exit(0);
