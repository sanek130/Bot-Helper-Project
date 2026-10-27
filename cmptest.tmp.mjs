import mongoose from 'mongoose';
import { connectDB, disconnectDB } from './src/db/connect.js';
import bot from './src/bot/bot.js';
import './src/bot/router.js';
import { User } from './src/db/models/User.js';
import { Report } from './src/db/models/Report.js';
import { sendBroadcast } from './src/services/broadcastService.js';

await connectDB();
await mongoose.connection.db.dropDatabase();
bot.botInfo = { id: 999, is_bot: true, first_name: 'Bot', username: 'classbot_bot' };
const calls = [];
let mid = 1;
const proto = Object.getPrototypeOf(bot.telegram);
proto.callApi = async (method, payload) => {
  calls.push({ method, payload });
  if (method === 'sendMessage') return { message_id: ++mid, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text };
  if (method === 'editMessageText') return { message_id: payload.message_id, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text };
  return true;
};
let uid = 1;
async function press(data, from = 333333333) {
  await bot.handleUpdate({ update_id: uid++, callback_query: { id: String(uid), from: { id: from, is_bot: false, first_name: 'Ученик' }, chat_instance: 'x', data, message: { message_id: mid++, date: 0, chat: { id: from, type: 'private' }, text: 'x' } } });
}
async function send(text, from = 333333333) {
  await bot.handleUpdate({ update_id: uid++, message: { message_id: mid++, date: 0, chat: { id: from, type: 'private' }, from: { id: from, is_bot: false, first_name: 'Ученик' }, text } });
}
const wait = () => new Promise((r) => setTimeout(r, 40));

await User.create({ tgId: 222222222, firstName: 'Админ', school: 'школа 1', class: '9А', city: 'Москва', role: 'admin', status: 'active' });
await User.create({ tgId: 333333333, firstName: 'Ученик', school: 'школа 1', class: '9А', city: 'Москва', role: 'user', status: 'active' });

await press('cmp:start');
await wait();
await press('cmp:admin:0');
await wait();
await send('Админ удалил моё домашнее задание без причины');
await wait();
console.log('confirm shown:', calls.at(-1).payload.text?.includes('Отправить создателю'));
await press('cmp:send');
await wait();
const report = await Report.findOne({ fromUserId: '333333333' });
console.log('report:', Boolean(report), report?.text?.slice(0, 20));
console.log('sends:', calls.filter((c) => c.method === 'sendMessage').map((c) => c.payload.chat_id));
console.log('creator notified:', calls.some((c) => c.method === 'sendMessage' && Number(c.payload.chat_id) === 999999999));

// рассылка классу: 2 получателя, один блокирует
const admin = await User.findOne({ tgId: 222222222 });
const delivered = [];
proto.callApi = async (method, payload) => {
  if (method === 'sendMessage') {
    if (payload.chat_id === 333333333) { delivered.push(payload.chat_id); return { message_id: ++mid, date: 0, chat: {}, text: '' }; }
    throw Object.assign(new Error('blocked'), { response: { error_code: 403 }, code: 403 });
  }
  return true;
};
const result = await sendBroadcast(bot, { target: 'class', value: 'школа 1::9А', text: 'Тест', fromName: 'Админ' });
console.log('broadcast:', result);

await disconnectDB();
console.log('CMP SMOKE OK');
process.exit(0);
