require('dotenv').config();
const { Telegraf, Scenes, session } = require('telegraf');
const mongoose = require('mongoose');
const User = require('./models/User');
const Homework = require('./models/Homework');

// --- КОНФИГУРАЦИЯ ---
const BOT_TOKEN = process.env.BOT_TOKEN;
const DB_URI = process.env.DB_URI;

if (!BOT_TOKEN || !DB_URI) {
    console.error('❌ Ошибка: Проверьте переменные окружения (BOT_TOKEN, DB_URI) в файле .env');
    process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

// --- СПИСКИ ГОРОДОВ И ШКОЛ (Пример) ---
const CITIES = [
    'Москва', 'Санкт-Петербург', 'Новосибирск', 'Екатеринбург', 'Казань',
    'Нижний Новгород', 'Челябинск', 'Самара', 'Омск', 'Ростов-на-Дону',
    'Уфа', 'Красноярск', 'Воронеж', 'Пермь', 'Волгоград', 'Другой'
];

const SCHOOLS_MAP = {
    'Москва': ['Школа №1535', 'Лицей ВШЭ', 'Гимназия 1543', 'Школа 2000', 'Другая'],
    'Санкт-Петербург': ['Академическая гимназия №56', 'Школа №389', 'Лицей №30', 'Другая'],
    // Можно добавить больше городов, по умолчанию будет общий список
    'default': ['Гимназия №1', 'Лицей №5', 'Школа №10', 'Средняя школа №25', 'Другая']
};

// --- ПОДКЛЮЧЕНИЕ К БД ---
mongoose.connect(DB_URI)
    .then(() => console.log('✅ База данных подключена'))
    .catch(err => console.error('❌ Ошибка подключения к БД:', err));

// --- СЦЕНА РЕГИСТРАЦИИ ---
const registerScene = new Scenes.WizardScene(
    'register',
    // Шаг 1: ФИО
    async (ctx) => {
        ctx.wizard.state.data = {};
        await ctx.reply(
            '👋 Добро пожаловать! Давайте настроим бота.\n\n' +
            '📝 **Шаг 1/5:** Введите ваше **ФИО** (Фамилия Имя Отчество):',
            { parse_mode: 'Markdown' }
        );
        return ctx.wizard.next();
    },
    // Обработка ФИО
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) {
            await ctx.reply('⚠️ Пожалуйста, отправьте текст.');
            return ctx.wizard.selectStep(1); // Повторить шаг 1 (индекс 1, т.к. 0 это вход)
        }
        ctx.wizard.state.data.fullName = ctx.message.text.trim();
        await ctx.reply(`✅ Принято: ${ctx.wizard.state.data.fullName}\n\n🏙 **Шаг 2/5:** Выберите ваш город:`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: CITIES.map(c => [{ text: c }]),
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
        return ctx.wizard.next();
    },
    // Шаг 2: Город (выбор)
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return ctx.wizard.selectStep(2);
        
        ctx.wizard.state.data.city = ctx.message.text.trim();
        
        // Динамический список школ
        let schools = SCHOOLS_MAP[ctx.wizard.state.data.city] || SCHOOLS_MAP['default'];
        
        await ctx.reply(`✅ Город: ${ctx.wizard.state.data.city}\n\n🏫 **Шаг 3/5:** Выберите вашу школу:`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: schools.map(s => [{ text: s }]),
                resize_keyboard: true,
                one_time_keyboard: false
            }
        });
        return ctx.wizard.next();
    },
    // Шаг 3: Школа (выбор)
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return ctx.wizard.selectStep(3);

        ctx.wizard.state.data.school = ctx.message.text.trim();
        
        await ctx.reply(`✅ Школа: ${ctx.wizard.state.data.school}\n\n🎓 **Шаг 4/5:** Кто вы?`, {
            parse_mode: 'Markdown',
            reply_markup: {
                keyboard: [['Ученик', 'Учитель', 'Админ']],
                resize_keyboard: true,
                one_time_keyboard: true
            }
        });
        return ctx.wizard.next();
    },
    // Шаг 4: Роль
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return ctx.wizard.selectStep(4);

        const role = ctx.message.text.trim();
        if (!['Ученик', 'Учитель', 'Админ'].includes(role)) {
            await ctx.reply('⚠️ Выберите роль из списка.');
            return;
        }
        ctx.wizard.state.data.role = role;

        await ctx.reply(`✅ Роль: ${role}\n\n🔢 **Шаг 5/5:** Введите ваш класс (например, 9А, 11Б):`, {
            parse_mode: 'Markdown',
            reply_markup: { remove_keyboard: true }
        });
        return ctx.wizard.next();
    },
    // Шаг 5: Класс и завершение
    async (ctx) => {
        if (!ctx.message || !ctx.message.text) return ctx.wizard.selectStep(5);

        const classGrade = ctx.message.text.trim().toUpperCase();
        const userData = ctx.wizard.state.data;

        // Сохранение в БД
        try {
            let user = await User.findOne({ telegramId: ctx.from.id });
            if (user) {
                // Обновляем существующего
                user.fullName = userData.fullName;
                user.city = userData.city;
                user.school = userData.school;
                user.role = userData.role;
                user.classGrade = classGrade;
                await user.save();
            } else {
                // Создаем нового
                user = await User.create({
                    telegramId: ctx.from.id,
                    username: ctx.from.username,
                    fullName: userData.fullName,
                    city: userData.city,
                    school: userData.school,
                    role: userData.role,
                    classGrade: classGrade
                });
            }

            await ctx.reply(
                `🎉 **Регистрация завершена!**\n\n` +
                `👤 Профиль:\n` +
                `• ФИО: ${user.fullName}\n` +
                `• Город: ${user.city}\n` +
                `• Школа: ${user.school}\n` +
                `• Класс: ${user.classGrade}\n` +
                `• Роль: ${user.role}\n\n` +
                `Теперь используйте меню внизу 👇`,
                {
                    parse_mode: 'Markdown',
                    reply_markup: {
                        keyboard: [
                            ['📅 Моё ДЗ', '🔔 След. урок'],
                            ['📝 Обновить ДЗ', '⚙️ Настройки']
                        ],
                        resize_keyboard: true
                    }
                }
            );
            return ctx.scene.leave();
        } catch (e) {
            console.error(e);
            await ctx.reply('❌ Произошла ошибка при сохранении. Попробуйте /start позже.');
            return ctx.scene.leave();
        }
    }
);

// Настройка сцен
const stage = new Scenes.Stage([registerScene]);
bot.use(session());
bot.use(stage.middleware());

// --- КОМАНДЫ ---

bot.start(async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (user) {
        await ctx.reply(
            `👋 Привет, **${user.fullName}**!`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    keyboard: [
                        ['📅 Моё ДЗ', '🔔 След. урок'],
                        ['📝 Обновить ДЗ', '⚙️ Настройки']
                    ],
                    resize_keyboard: true
                }
            }
        );
    } else {
        // Запуск сцены регистрации
        await ctx.scene.enter('register');
    }
});

// Функция определения рекомендации (сегодня/завтра)
function getRecommendationDate() {
    const now = new Date();
    const day = now.getDay(); // 0 - Вс, 1 - Пн...
    const hours = now.getHours();

    let targetDate = new Date(now);
    let label = 'сегодня';

    // Если Воскресенье (0) ИЛИ вечер (после 18:00) -> рекомендуем завтра
    if (day === 0 || hours >= 18) {
        targetDate.setDate(now.getDate() + 1);
        label = 'завтра';
    }

    return { date: targetDate, label: label };
}

// Команда /today (показать ДЗ на сегодня)
bot.command('today', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user) return ctx.reply('⚠️ Сначала зарегистрируйтесь: /start');

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Ищем ДЗ на сегодня (от сегодня 00:00 до завтра 00:00)
    const homeworks = await Homework.find({
        classGrade: user.classGrade,
        school: user.school, // Учитываем школу
        dateFor: { $gte: today, $lt: tomorrow }
    }).sort({ lessonOrder: 1 });

    if (homeworks.length === 0) {
        const rec = getRecommendationDate();
        let msg = `🎉 **Отдыхайте!**\nНа ${rec.label === 'сегодня' ? 'сегодня' : 'завтра'} домашних заданий нет.\n\n`;
        if (rec.label === 'завтра') {
            msg += `💡 *Совет:* Сейчас вечер или воскресенье, лучше подготовьтесь к завтрашнему дню заранее!`;
        }
        return ctx.reply(msg, { parse_mode: 'Markdown' });
    }

    let text = `📚 **Расписание на ${rec.label === 'сегодня' ? 'сегодня' : 'завтра'} (${user.classGrade})**\n\n`;
    
    // Получаем расписание звонков (если есть)
    const schedule = user.schedule || getDefaultSchedule(); 
    const dayKey = getDayKey(new Date()); // например "monday"

    homeworks.forEach((hw, index) => {
        const timeInfo = getLessonTime(schedule, dayKey, index + 1);
        text += `🔹 **${hw.subject}** ${timeInfo ? `(${timeInfo})` : ''}\n`;
        text += `   📝 ${hw.task}\n`;
        if (hw.attachment) text += `   📎 Файл: ${hw.attachment}\n`;
        text += `\n`;
    });

    ctx.reply(text, { parse_mode: 'Markdown' });
});

// Кнопка "Моё ДЗ" (умная)
bot.hears('📅 Моё ДЗ', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user) return ctx.reply('⚠️ Сначала зарегистрируйтесь: /start');

    const rec = getRecommendationDate();
    const targetDate = rec.date;
    
    // Нормализуем дату для поиска (начало дня)
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0,0,0,0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setDate(endOfDay.getDate() + 1);

    const homeworks = await Homework.find({
        classGrade: user.classGrade,
        school: user.school,
        dateFor: { $gte: startOfDay, $lt: endOfDay }
    }).sort({ lessonOrder: 1 });

    if (homeworks.length === 0) {
        let msg = `🕊 **Пусто!**\nНа ${rec.label} уроков не задано.\n\n`;
        if (rec.label === 'завтра') {
             msg += `☀️ Отличный повод отдохнуть сегодня!`;
        } else {
             msg += `💡 Может, стоит посмотреть задание на завтра?`;
        }
        return ctx.reply(msg, { parse_mode: 'Markdown' });
    }

    let text = `🗓 **ДЗ на ${rec.label} (${targetDate.toLocaleDateString('ru-RU')})**\n` +
               `🏫 ${user.school}, ${user.classGrade}\n\n`;

    const schedule = user.schedule || getDefaultSchedule();
    const dayKey = getDayKey(targetDate);

    homeworks.forEach((hw, i) => {
        const timeStr = getLessonTime(schedule, dayKey, i + 1);
        text += `◾️ *${i+1}. ${hw.subject}* ${timeStr ? `⏰ [${timeStr}]` : ''}\n`;
        text += `   └─ ${hw.task}\n`;
        if (hw.deadline) text += `   └─ ⏳ Срок: ${new Date(hw.deadline).toLocaleDateString()}\n`;
        text += `\n`;
    });

    ctx.reply(text, { parse_mode: 'Markdown' });
});

// Кнопка "След. урок"
bot.hears('🔔 След. урок', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user) return ctx.reply('⚠️ Сначала зарегистрируйтесь: /start');

    const now = new Date();
    const schedule = user.schedule || getDefaultSchedule();
    const dayKey = getDayKey(now);
    
    // Получаем пары на сегодня
    const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
    const tomorrowStart = new Date(todayStart); tomorrowStart.setDate(tomorrowStart.getDate()+1);

    const lessonsToday = await Homework.find({
        classGrade: user.classGrade,
        school: user.school,
        dateFor: { $gte: todayStart, $lt: tomorrowStart }
    }).sort({ lessonOrder: 1 });

    // Определяем текущий урок по времени
    let nextLessonIndex = -1;
    const times = schedule[dayKey] || schedule['monday']; // fallback

    if (times) {
        for (let i = 0; i < times.length; i++) {
            const start = parseTime(times[i].start);
            const end = parseTime(times[i].end);
            
            // Если текущее время меньше начала урока, значит это следующий урок
            if (now < start) {
                nextLessonIndex = i;
                break;
            }
            // Если мы сейчас на уроке (между start и end), то следующий - это i+1
            if (now >= start && now < end) {
                nextLessonIndex = i + 1;
                break;
            }
        }
        // Если все уроки прошли, проверяем завтра
        if (nextLessonIndex === -1 && now > parseTime(times[times.length-1].end)) {
             // Переключаемся на завтра
             const tomorrowDate = new Date(now);
             tomorrowDate.setDate(tomorrowDate.getDate() + 1);
             const tmrwDayKey = getDayKey(tomorrowDate);
             
             const lessonsTmrw = await Homework.find({
                 classGrade: user.classGrade,
                 school: user.school,
                 dateFor: { $gte: new Date(tomorrowDate.setHours(0,0,0,0)), $lt: new Date(tomorrowDate.setHours(23,59,59,999)) }
             }).sort({ lessonOrder: 1 });

             if (lessonsTmrw.length > 0) {
                 const hw = lessonsTmrw[0];
                 const tmrwTimes = schedule[tmrwDayKey] || schedule['monday'];
                 const timeStr = tmrwTimes && tmrwTimes[0] ? `${tmrwTimes[0].start}-${tmrwTimes[0].end}` : 'Время не указано';
                 
                 return ctx.reply(
                     `🌅 **Уроки сегодня закончились.**\n\n` +
                     `🔜 **Следующий урок (ЗАВТРА):**\n` +
                     `📚 Предмет: *${hw.subject}*\n` +
                     `⏰ Время: ${timeStr}\n` +
                     `📝 ДЗ: ${hw.task}`,
                     { parse_mode: 'Markdown' }
                 );
             } else {
                 return ctx.reply('🌅 Уроки сегодня закончились, а на завтра пока ничего не задано! 😎');
             }
        }
    }

    if (nextLessonIndex !== -1 && lessonsToday[nextLessonIndex]) {
        const hw = lessonsToday[nextLessonIndex];
        const lessonTime = times[nextLessonIndex];
        const timeStr = `${lessonTime.start}-${lessonTime.end}`;
        
        // Сколько минут до начала?
        const startTimeObj = parseTime(lessonTime.start);
        const diffMs = startTimeObj - now;
        const diffMins = Math.ceil(diffMs / 60000);

        let msg = `🔔 **Следующий урок:**\n\n`;
        msg += `📚 *${hw.subject}*\n`;
        msg += `⏰ Время: ${timeStr}\n`;
        if (diffMins > 0) msg += `⏳ Начнется через: ${diffMins} мин.\n`;
        msg += `\n📝 **Задание:**\n${hw.task || 'Нет задания'}`;
        
        ctx.reply(msg, { parse_mode: 'Markdown' });
    } else {
        ctx.reply('😴 Уроков больше нет сегодня! Хорошего отдыха.');
    }
});

// Вспомогательные функции времени
function getDayKey(date) {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[date.getDay()];
}

function getDefaultSchedule() {
    // Стандартное расписание (можно менять)
    const standardSlot = { start: '08:30', end: '09:15' };
    return {
        monday: Array(6).fill(standardSlot),
        tuesday: Array(6).fill(standardSlot),
        wednesday: Array(6).fill(standardSlot),
        thursday: Array(6).fill(standardSlot),
        friday: Array(6).fill(standardSlot),
        saturday: [],
        sunday: []
    };
}

function getLessonTime(schedule, dayKey, lessonNum) {
    const daySchedule = schedule[dayKey];
    if (!daySchedule || !daySchedule[lessonNum - 1]) return null;
    return `${daySchedule[lessonNum - 1].start} - ${daySchedule[lessonNum - 1].end}`;
}

function parseTime(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
}

// --- ОБНОВЛЕНИЕ ДЗ (Для учителей/админов) ---
bot.hears('📝 Обновить ДЗ', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user) return ctx.reply('⚠️ Регистрация обязательна.');
    
    if (user.role === 'Ученик') {
        return ctx.reply('⚠️ Эта функция доступна только Учителям и Админам.');
    }

    await ctx.reply(
        `✍️ **Добавление ДЗ для ${user.classGrade}**\n\n` +
        `Введите данные в формате:\n` +
        `Предмет | Задание | Дата (ДД.ММ)` +
        `\n\nПример:\nМатематика | №123 стр.45 | 25.10`,
        { parse_mode: 'Markdown' }
    );
    
    // Простая одношаговая логика для примера, можно расширить до сцены
    bot.once('message', async (msgCtx) => {
        const text = msgCtx.message.text;
        const parts = text.split('|').map(p => p.trim());
        
        if (parts.length < 2) {
            return msgCtx.reply('❌ Неверный формат. Используйте разделитель "|".');
        }

        const subject = parts[0];
        const task = parts[1];
        let dateStr = parts[2] || new Date().toLocaleDateString('ru-RU'); // По умолчанию сегодня
        
        // Парсинг даты
        const dateParts = dateStr.split('.');
        const targetDate = new Date();
        if (dateParts.length === 3) {
            targetDate.setDate(parseInt(dateParts[0]));
            targetDate.setMonth(parseInt(dateParts[1]) - 1);
            // Год оставляем текущий, если не указан явно
        }
        targetDate.setHours(12, 0, 0, 0); // Полдень для удобства поиска

        try {
            // 1. Удаляем старое ДЗ по этому предмету на эту дату (чтобы не дублировать)
            await Homework.deleteOne({
                classGrade: user.classGrade,
                school: user.school,
                subject: subject,
                dateFor: {
                    $gte: new Date(targetDate.setHours(0,0,0,0)),
                    $lt: new Date(targetDate.setHours(23,59,59,999))
                }
            });

            // 2. Создаем новое
            await Homework.create({
                classGrade: user.classGrade,
                school: user.school,
                subject: subject,
                task: task,
                dateFor: targetDate,
                authorId: user.telegramId,
                lessonOrder: 1 // Можно усложнить подсчетом
            });

            await msgCtx.reply('✅ Домашнее задание успешно обновлено!');
            
            // Автоочистка старых записей (> 14 дней)
            const twoWeeksAgo = new Date();
            twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
            const deleted = await Homework.deleteMany({ dateFor: { $lt: twoWeeksAgo } });
            if (deleted.deletedCount > 0) {
                console.log(`🧹 Удалено ${deleted.deletedCount} устаревших записей ДЗ.`);
            }

        } catch (e) {
            console.error(e);
            await msgCtx.reply('❌ Ошибка при сохранении.');
        }
    });
});

// --- НАСТРОЙКА РАСПИСАНИЯ ЗВОНКОВ (Админы/Учителя) ---
bot.hears('⚙️ Настройки', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    if (!user) return;

    if (user.role === 'Ученик') {
        return ctx.reply('🔒 Настройки расписания доступны только персоналу.');
    }

    await ctx.reply(
        '⚙️ **Настройки**\n\n' +
        'Выберите действие:',
        {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [
                    [{ text: '🕒 Изменить расписание звонков', callback_data: 'edit_schedule' }],
                    [{ text: '👤 Мой профиль', callback_data: 'my_profile' }]
                ]
            }
        }
    );
});

bot.action('edit_schedule', async (ctx) => {
    await ctx.editMessageText(
        '🕒 **Редактор расписания звонков**\n\n' +
        'Отправьте JSON или текстовый список пар для каждого дня.\n' +
        'Формат: День | Начало-Конец, Начало-Конец...\n' +
        'Пример:\nmonday | 08:00-08:45, 09:00-09:45\n' +
        'Дни: monday, tuesday, ..., sunday'
    );
    
    bot.once('message', async (msgCtx) => {
        // Очень упрощенный парсер для демонстрации
        // В продакшене лучше использовать полноценную сцену с валидацией
        const lines = msgCtx.message.text.split('\n');
        const newSchedule = {};
        
        lines.forEach(line => {
            const [dayRaw, timesRaw] = line.split('|');
            if (dayRaw && timesRaw) {
                const day = dayRaw.trim().toLowerCase();
                const slots = timesRaw.trim().split(',').map(t => {
                    const [s, e] = t.trim().split('-');
                    return { start: s, end: e };
                });
                newSchedule[day] = slots;
            }
        });

        if (Object.keys(newSchedule).length === 0) {
            return msgCtx.reply('❌ Не удалось распознать расписание.');
        }

        await User.updateOne(
            { telegramId: msgCtx.from.id },
            { $set: { schedule: newSchedule } }
        );
        await msgCtx.reply('✅ Расписание звонков обновлено! Теперь оно учитывается в функции "След. урок".');
    });
});

bot.action('my_profile', async (ctx) => {
    const user = await User.findOne({ telegramId: ctx.from.id });
    ctx.editMessageText(
        `👤 **Профиль**\n` +
        `ФИО: ${user.fullName}\n` +
        `Город: ${user.city}\n` +
        `Школа: ${user.school}\n` +
        `Класс: ${user.classGrade}\n` +
        `Роль: ${user.role}`,
        { parse_mode: 'Markdown' }
    );
});

// Запуск бота
bot.launch().then(() => {
    console.log('🚀 Бот запущен...');
}).catch(err => {
    console.error('❌ Ошибка запуска:', err);
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
