import mongoose from 'mongoose';
import { connectDB, disconnectDB } from './src/db/connect.js';
import bot from './src/bot/bot.js';
import './src/bot/router.js';
import { User } from './src/db/models/User.js';
import { Session } from './src/db/models/Session.js';
import { addHomework } from './src/services/homeworkService.js';
import { toDateKey } from './src/services/dateService.js';
import { subjectKey } from './src/utils/subjects.js';

await connectDB();
await mongoose.connection.db.dropDatabase();

bot.botInfo = { id: 999, is_bot: true, first_name: 'Bot', username: 'classbot_bot' };

const calls = [];
let messageId = 100;

function fake(method, payload) {
  if (method === 'getMe') return bot.botInfo;
  if (method === 'sendMessage' || method === 'sendPhoto') {
    return { message_id: ++messageId, date: Math.floor(Date.now() / 1000), chat: { id: payload.chat_id, type: 'private' }, text: payload.text || payload.caption || '' };
  }
  if (method === 'editMessageText') return { message_id: payload.message_id, date: 0, chat: { id: payload.chat_id, type: 'private' }, text: payload.text };
  if (method === 'answerCallbackQuery') return true;
  if (method === 'setMyCommands') return true;
  return true;
}

const telegramProto = Object.getPrototypeOf(bot.telegram);
telegramProto.callApi = async function fakeCallApi(method, payload) {
  calls.push({ method, payload });
  return fake(method, payload);
};

let updateId = 1;
async function send(text, entities) {
  await bot.handleUpdate({
    update_id: updateId++,
    message: {
      message_id: messageId++,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 123456789, type: 'private' },
      from: { id: 123456789, is_bot: false, first_name: 'Тест', username: 'tester' },
      text,
      ...(entities ? { entities } : {}),
    },
  });
}

async function press(data, text = 'кнопка') {
  calls.push({ method: 'PRESS', payload: { data } });
  await bot.handleUpdate({
    update_id: updateId++,
    callback_query: {
      id: String(updateId),
      from: { id: 123456789, is_bot: false, first_name: 'Тест', username: 'tester' },
      chat_instance: 'x',
      data,
      message: {
        message_id: messageId++,
        date: 0,
        chat: { id: 123456789, type: 'private' },
        text,
      },
    },
  });
}

function lastText() {
  for (let i = calls.length - 1; i >= 0; i -= 1) {
    if (calls[i].payload?.text) return calls[i].payload.text;
    if (calls[i].payload?.caption) return calls[i].payload.caption;
  }
  return '';
}

const wait = () => new Promise((resolve) => setTimeout(resolve, 50));

await send('/start', [{ type: 'bot_command', offset: 0, length: 6 }]);
await wait();
console.log('start:', lastText().slice(0, 40));

await press('reg:start');
await wait();
console.log('city step:', lastText().slice(0, 40));

await send('Москва');
await wait();
console.log('school step:', lastText().slice(0, 40));

await press('reg:school:0');
await wait();
await send('А');
await wait();
await send('10');
await wait();
await press('reg:role:user');
await wait();
await press('reg:done');
await wait();

const user = await User.findOne({ tgId: 123456789 });
if (!user) throw new Error('Пользователь не создан');
console.log('registered:', user.city, user.school, user.class, user.role, user.specId);

const session = await Session.findOne({ userId: '123456789' });
console.log('session cleared:', session === null);

await press('menu1');
await wait();
console.log('menu:', lastText().slice(0, 30));

await addHomework({ classKey: `${user.school}::${user.class}`, dateKey: toDateKey(), subject: 'Алгебра', text: 'Параграф 5', addedBy: user.tgId });
await press('hw:today');
await wait();
const card = lastText();
console.log('card has:', card.includes('Алгебра'), card.includes('Параграф 5'));

await press(`chk:${toDateKey()}:${subjectKey('Алгебра')}`);
await wait();
const updated = await User.findOne({ tgId: 123456789 });
console.log('checked:', updated.completedHomework?.[toDateKey()]);

// Админский сценарий: повышаем и добавляем ДЗ
await User.updateOne({ tgId: 123456789 }, { $set: { role: 'admin' } });
await press('adm:add');
await wait();
console.log('add calendar:', lastText().includes('Добавление'));
await press(`add_day_${toDateKey()}`);
await wait();
console.log('subject prompt:', lastText().includes('Выбери предмет'));
await press(`add:subject:${toDateKey()}:${subjectKey('Физика')}`);
await wait();
await send('§ 12, задачи 1-3');
await wait();
console.log('saved:', lastText().includes('Добавлено'));
await press('add:finish');
await wait();
console.log('finish card:', lastText().includes('Физика'));

// Ветка входа по спец-ID: показываем экран
await press('login:start');
await wait();
console.log('login screen:', lastText().includes('Вход по спец-ID'));

// Редактирование и удаление
await press('adm:edit');
await wait();
await press(`edit_day_${toDateKey()}`);
await wait();
await press(`edit:sub:${toDateKey()}:${subjectKey('Физика')}`);
await wait();
await press(`edit:text:${toDateKey()}:${subjectKey('Физика')}`);
await wait();
await send('Новый текст параграфа');
await wait();
const { getDayData } = await import('./src/services/homeworkService.js');
let day = await getDayData(`${user.school}::${user.class}`, toDateKey());
console.log('edited:', day['Физика']?.text);

await press('adm:del');
await wait();
await press(`del_day_${toDateKey()}`);
await wait();
await press(`del:sub:${toDateKey()}:${subjectKey('Алгебра')}`);
await wait();
await press(`del:yes:${toDateKey()}:${subjectKey('Алгебра')}`);
await wait();
day = await getDayData(`${user.school}::${user.class}`, toDateKey());
console.log('after delete db:', Object.keys(day));
console.log('recent:', calls.slice(-10).map((c) => c.method + ':' + (c.payload.text || c.payload.data || '').toString().slice(0, 30)));
console.log('deleted:', !day['Алгебра'], 'kept:', Boolean(day['Физика']));

// Профиль и настройки клавиатуры
await press('profile');
await wait();
console.log('profile:', lastText().includes('Спец-ID'));
await press('kb:open');
await wait();
await press('kb:toggle:0');
await wait();
await press('kb:apply');
await wait();
const afterKb = await User.findOne({ tgId: 123456789 });
console.log('keyboard:', afterKb.customKeyboard);

// Смена класса запрещена админу
await press('prof:class');
await wait();
console.log('class guard:', !lastText().includes('Буква класса'));

// Выход из аккаунта
await press('prof:logout');
await wait();
await press('prof:logout_yes');
await wait();
const loggedOut = await User.findOne({ tgId: 123456789 });
console.log('logged out:', loggedOut === null);

const errors = calls.filter((call) => call.method === 'sendMessage' && String(call.payload.text || '').includes('Что-то пошло не так'));
console.log('handler errors:', errors.length);
if (errors.length) console.log(errors.map((e) => e.payload.text));

await disconnectDB();
console.log('BOT SMOKE OK');
process.exit(0);
