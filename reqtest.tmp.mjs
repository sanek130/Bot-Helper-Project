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
const from = 555555555;
async function send(text, entities) {
  await bot.handleUpdate({ update_id: uid++, message: { message_id: mid++, date: 0, chat: { id: from, type: 'private' }, from: { id: from, is_bot: false, first_name: 'Заявитель' }, text, ...(entities ? { entities } : {}) } });
}
async function press(data, user = from) {
  await bot.handleUpdate({ update_id: uid++, callback_query: { id: String(uid), from: { id: user, is_bot: false, first_name: 'X' }, chat_instance: 'x', data, message: { message_id: mid++, date: 0, chat: { id: user, type: 'private' }, text: 'x' } } });
}
const wait = () => new Promise((r) => setTimeout(r, 40));

await send('/start', [{ type: 'bot_command', offset: 0, length: 6 }]);
await wait();
await press('reg:start'); await wait();
await send('Москва'); await wait();
await press('reg:school:0'); await wait();
await press('reg:letter:А'); await wait();
await press('reg:num:9'); await wait();
await press('reg:role:admin'); await wait();
await press('reg:done'); await wait();

const user = await User.findOne({ tgId: from });
console.log('pending request:', user.pendingAdminRequest, 'role:', user.role);
const requestMessage = calls.find((c) => c.method === 'sendMessage' && c.payload.chat_id === 999999999);
console.log('moderator notified:', Boolean(requestMessage));
const cb = requestMessage?.payload?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data;
console.log('callback:', cb);
await press(cb, 999999999);
await wait();
const updated = await User.findOne({ tgId: from });
console.log('approved role:', updated.role, 'pending:', updated.pendingAdminRequest);
const notified = calls.some((c) => c.method === 'sendMessage' && c.payload.chat_id === from && String(c.payload.text).includes('одобрена'));
console.log('user notified:', notified);

await disconnectDB();
console.log('REQ SMOKE OK');
process.exit(0);
