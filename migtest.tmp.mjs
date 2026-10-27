import mongoose from 'mongoose';
import { connectDB, disconnectDB } from './src/db/connect.js';
import bot from './src/bot/bot.js';
import './src/bot/router.js';
import { User } from './src/db/models/User.js';
import { Homework } from './src/db/models/Homework.js';

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
async function send(text, entities) {
  await bot.handleUpdate({ update_id: uid++, message: { message_id: mid++, date: 0, chat: { id: 777, type: 'private' }, from: { id: 777, is_bot: false, first_name: 'Без школы' }, text, ...(entities ? { entities } : {}) } });
}
async function press(data) {
  await bot.handleUpdate({ update_id: uid++, callback_query: { id: String(uid), from: { id: 777, is_bot: false, first_name: 'X' }, chat_instance: 'x', data, message: { message_id: mid++, date: 0, chat: { id: 777, type: 'private' }, text: 'x' } } });
}
const wait = () => new Promise((r) => setTimeout(r, 40));

await User.create({ tgId: 777, firstName: 'Без школы', city: 'Москва', class: '9А', role: 'user', status: 'active' });
await Homework.create({ classKey: '9А', data: { '2026-10-27': { Алгебра: { text: 'x' } } } });

await send('/start', [{ type: 'bot_command', offset: 0, length: 6 }]); await wait();
console.log('prompt:', String(calls.at(-1).payload.text).includes('школа'));
await press('mig:school:0'); await wait();
const updated = await User.findOne({ tgId: 777 });
console.log('school:', updated.school);
const hw = await Homework.findOne({ classKey: `${updated.school}::9А` });
console.log('renamed hw:', Boolean(hw));
console.log('old removed:', (await Homework.findOne({ classKey: '9А' })) === null);

await disconnectDB();
console.log('MIG SMOKE OK');
process.exit(0);
