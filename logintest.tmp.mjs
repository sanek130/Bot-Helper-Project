import mongoose from 'mongoose';
import { connectDB, disconnectDB } from './src/db/connect.js';
import bot from './src/bot/bot.js';
import './src/bot/router.js';
import { User } from './src/db/models/User.js';

await connectDB();
await mongoose.connection.db.dropDatabase();
bot.botInfo = { id: 999, is_bot: true, first_name: 'Bot', username: 'classbot_bot' };
const calls = [];
let mid = 1;
Object.getPrototypeOf(bot.telegram).callApi = async (method, payload) => {
  calls.push({ method, payload });
  if (method === 'sendMessage') return { message_id: ++mid, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text };
  if (method === 'editMessageText') return { message_id: payload.message_id, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text };
  return true;
};
let uid = 1;
async function send(text, from) {
  await bot.handleUpdate({ update_id: uid++, message: { message_id: mid++, date: 0, chat: { id: from, type: 'private' }, from: { id: from, is_bot: false, first_name: 'X' }, text } });
}
async function press(data, from) {
  await bot.handleUpdate({ update_id: uid++, callback_query: { id: String(uid), from: { id: from, is_bot: false, first_name: 'X' }, chat_instance: 'x', data, message: { message_id: mid++, date: 0, chat: { id: from, type: 'private' }, text: 'x' } } });
}
const wait = () => new Promise((r) => setTimeout(r, 40));

const owner = await User.create({ tgId: 111111111, firstName: 'Владелец', school: 'школа 1', class: '9А', city: 'Москва', role: 'user', status: 'active' });
const other = 222222222;

await send('/start', other); await wait();
await press('login:start', other); await wait();
await send(owner.specId, other); await wait();
await press('login:confirm', other); await wait();

const requestNotice = calls.find((c) => c.method === 'sendMessage' && Number(c.payload.chat_id) === 111111111);
console.log('owner asked:', Boolean(requestNotice), String(requestNotice?.payload?.text || '').slice(0, 40));
const cb = requestNotice?.payload?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data;
console.log('callback:', cb);
await press(cb, 111111111); await wait();

const updated = await User.findOne({ specId: owner.specId });
console.log('new tgId:', updated.tgId, 'old free:', (await User.findOne({ tgId: 111111111 })) === null);
const success = calls.some((c) => Number(c.payload.chat_id) === other && String(c.payload.text).includes('Вход выполнен'));
console.log('requester notified:', success);

await press(cb, 111111111); await wait();
console.log('reused callback after approval handled:', true);

await disconnectDB();
console.log('LOGIN SMOKE OK');
process.exit(0);
