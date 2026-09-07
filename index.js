import { Telegraf, Markup } from 'telegraf';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

// Инициализация переменных окружения (для локального запуска, на Render они уже есть)
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const MONGODB_URI = process.env.MONGODB_URI || process.env.DB_URI;

if (!BOT_TOKEN || !MONGODB_URI) {
    console.error('❌ Ошибка: Не найдены BOT_TOKEN или MONGODB_URI');
    process.exit(1);
}

// Импорт моделей
import User from './models/User.js';
import Homework from './models/Homework.js';

const bot = new Telegraf(BOT_TOKEN);

// --- СОСТОЯНИЯ РЕГИСТРАЦИИ ---
const registrationSteps = {
    WAITING_FULL_NAME: 1,
    WAITING_CITY: 2,
    WAITING_SCHOOL_SELECT: 3,
    WAITING_SCHOOL_CUSTOM: 4,
    WAITING_ROLE: 5,
    WAITING_CLASS: 6
};

// Хранилище временных данных регистрации (в памяти)
// В продакшене лучше использовать Redis, но для простоты пока так
const tempUserData = {}; 

// --- СПИСОК ГОРОДОВ И ШКОЛ (Пример) ---
const CITIES = [
    "Москва", "Санкт-Петербург", "Новосибирск", "Екатеринбург", "Казань", 
    "Нижний Новгород", "Челябинск", "Самара", "Омск", "Ростов-на-Дону",
    "Уфа", "Красноярск", "Пермь", "Воронеж", "Волгоград", "Другой город"
];

// Заглушка для школ (можно расширить)
const SCHOOLS_BY_CITY = {
    "Москва": ["Школа №1", "Школа №1535", "Лицей ВШЭ", "Другая школа"],
    "Санкт-Петербург": ["Гимназия №2", "Школа №189", "Академическая гимназия", "Другая школа"],
    "Другой город": ["Школа №1", "Гимназия №1", "Лицей", "Другая школа"]
};
// Для городов, которых нет в списке, используем дефолт
const getDefaultSchools = () => ["Школа №1", "Гимназия №1", "Лицей", "Другая школа"];

// --- ЗАПУСК БОТА ---
bot.start(async (ctx) => {
    const userId = ctx.from.id;
    
    try {
        // Проверяем, есть ли пользователь в базе
        let user = await User.findOne({ telegramId: userId });

        if (user) {
            // Если пользователь уже зарегистрирован
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0 = Воскресенье
            const hour = now.getHours();
            
            // Логика умной рекомендации
            let targetDate = new Date();
            let isTomorrow = false;

            // Если воскресенье ИЛИ вечер (после 18:00), рекомендуем завтра
            if (dayOfWeek === 0 || hour >= 18) {
                targetDate.setDate(targetDate.getDate() + 1);
                isTomorrow = true;
            }

            const dateStr = targetDate.toISOString().split('T')[0]; // YYYY-MM-DD
            
            // Получаем ДЗ
            const homeworks = await Homework.find({
                classGrade: user.classGrade,
                school: user.school,
                dateFor: dateStr
            });

            let message = `👋 Привет, ${user.fullName}!\n\n`;
            
            if (homeworks.length > 0) {
                message += `📚 <b>Домашнее задание на ${isTomorrow ? 'завтра' : 'сегодня'} (${dateStr}):</b>\n\n`;
                homeworks.forEach((hw, index) => {
                    message += `<b>${index + 1}. ${hw.subject}</b>\n📝 ${hw.task}\n\n`;
                });
                message += `ℹ️ Твой класс: ${user.classGrade} | Школа: ${user.school}`;
            } else {
                if (isTomorrow) {
                    message += `🎉 На завтра (${dateStr}) домашних заданий пока нет!\nМожно отдыхать.`;
                } else {
                    message += `🎉 На сегодня домашних заданий нет!\nОтличная возможность отдохнуть.\n\n💡 Так как сейчас вечер или воскресенье, возможно, стоит посмотреть расписание на завтра? Просто напиши /nextday`;
                }
                message += `\n\nℹ️ Твой класс: ${user.classGrade} | Школа: ${user.school}`;
            }

            // Кнопки управления
            const keyboard = Markup.inlineKeyboard([
                [Markup.button.callback('📅 ДЗ на завтра', 'show_tomorrow')],
                [Markup.button.callback('🔔 След. урок', 'next_lesson')],
                ...(user.role === 'teacher' || user.role === 'admin' ? [
                    [Markup.button.callback('✏️ Добавить ДЗ', 'add_homework_start'), 
                     Markup.button.callback('⏰ Расписание звонков', 'edit_schedule')]
                ] : [])
            ]);

            return ctx.replyWithHTML(message, keyboard);
        } else {
            // Если пользователя нет - начинаем регистрацию
            tempUserData[userId] = { step: registrationSteps.WAITING_FULL_NAME };
            
            return ctx.reply(
                "👋 Добро пожаловать в Бот-Помощник! \n" +
                "Давай настроим тебя для работы.\n\n" +
                "1️⃣ Для начала напиши своё <b>ФИО</b> (Фамилия Имя):",
                { parse_mode: 'HTML' }
            );
        }
    } catch (error) {
        console.error('Ошибка в start:', error);
        ctx.reply("😕 Произошла ошибка при загрузке данных. Попробуйте позже.");
    }
});

// --- ОБРАБОТКА РЕГИСТРАЦИИ (ТЕКСТ) ---
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const text = ctx.message.text;
    const userState = tempUserData[userId];

    // Если пользователь не в процессе регистрации, игнорируем текст (если это не команда)
    if (!userState) return;

    try {
        // ШАГ 1: ФИО
        if (userState.step === registrationSteps.WAITING_FULL_NAME) {
            tempUserData[userId].fullName = text;
            tempUserData[userId].step = registrationSteps.WAITING_CITY;
            
            const citiesKeyboard = Markup.keyboard(
                CITIES.map(city => [city])
            ).resize();
            
            return ctx.reply("2️⃣ Отлично! Теперь выбери свой <b>город</b>:", { 
                parse_mode: 'HTML',
                ...citiesKeyboard 
            });
        }

        // ШАГ 2: ГОРОД
        if (userState.step === registrationSteps.WAITING_CITY) {
            tempUserData[userId].city = text;
            
            // Определяем школы для выбранного города
            let schools = SCHOOLS_BY_CITY[text];
            if (!schools) schools = getDefaultSchools();
            
            tempUserData[userId].availableSchools = schools;
            tempUserData[userId].step = registrationSteps.WAITING_SCHOOL_SELECT;

            const schoolsKeyboard = Markup.keyboard(
                schools.map(school => [school])
            ).resize();

            return ctx.reply(`3️⃣ Выбери школу в городе ${text}:`, {
                ...schoolsKeyboard
            });
        }

        // ШАГ 3: ШКОЛА (Если выбрали из списка)
        if (userState.step === registrationSteps.WAITING_SCHOOL_SELECT) {
            // Если пользователь выбрал "Другая школа" или ввод руками
            if (text === "Другая школа") {
                 tempUserData[userId].step = registrationSteps.WAITING_SCHOOL_CUSTOM;
                 return ctx.reply("3️⃣ (доп) Напишите название вашей школы:");
            }
            
            tempUserData[userId].school = text;
            tempUserData[userId].step = registrationSteps.WAITING_ROLE;
            
            const roleKeyboard = Markup.keyboard([
                ['Ученик'],
                ['Учитель'],
                ['Админ']
            ]).resize();
            
            return ctx.reply("4️⃣ Кто вы?", { ...roleKeyboard });
        }

        // ШАГ 3 (доп): ШКОЛА (Свой вариант)
        if (userState.step === registrationSteps.WAITING_SCHOOL_CUSTOM) {
            tempUserData[userId].school = text;
            tempUserData[userId].step = registrationSteps.WAITING_ROLE;
            
            const roleKeyboard = Markup.keyboard([
                ['Ученик'],
                ['Учитель'],
                ['Админ']
            ]).resize();
            
            return ctx.reply("4️⃣ Кто вы?", { ...roleKeyboard });
        }

        // ШАГ 4: РОЛЬ
        if (userState.step === registrationSteps.WAITING_ROLE) {
            const roleMap = { 'Ученик': 'student', 'Учитель': 'teacher', 'Админ': 'admin' };
            const selectedRole = roleMap[text];
            
            if (!selectedRole) {
                return ctx.reply("⚠️ Пожалуйста, выберите роль из предложенных кнопок.");
            }
            
            tempUserData[userId].role = selectedRole;
            tempUserData[userId].step = registrationSteps.WAITING_CLASS;
            
            return ctx.reply("5️⃣ Введите ваш <b>класс</b> (например, 9А или 10-Б):", {
                parse_mode: 'HTML'
            });
        }

        // ШАГ 5: КЛАСС -> ФИНАЛ
        if (userState.step === registrationSteps.WAITING_CLASS) {
            const newUser = new User({
                telegramId: userId,
                fullName: tempUserData[userId].fullName,
                city: tempUserData[userId].city,
                school: tempUserData[userId].school,
                role: tempUserData[userId].role,
                classGrade: text.toUpperCase()
            });

            await newUser.save();
            
            // Очищаем временные данные
            delete tempUserData[userId];
            
            return ctx.reply(
                `✅ <b>Регистрация завершена!</b>\n\n` +
                `👤 Имя: ${newUser.fullName}\n` +
                `🏫 Школа: ${newUser.school} (${newUser.city})\n` +
                `🎓 Класс: ${newUser.classGrade}\n` +
                `🔹 Роль: ${newUser.role === 'student' ? 'Ученик' : (newUser.role === 'teacher' ? 'Учитель' : 'Админ')}\n\n` +
                `Теперь используйте меню внизу или команду /start для просмотра ДЗ.`
            , { parse_mode: 'HTML' });
        }

    } catch (error) {
        console.error('Ошибка регистрации:', error);
        ctx.reply("😕 Что-то пошло не так при регистрации. Попробуйте /start заново.");
        delete tempUserData[userId];
    }
});

// --- ОБРАБОТКА КНОПОК (CALLBACK) ---
bot.action('show_tomorrow', async (ctx) => {
    const userId = ctx.from.id;
    const user = await User.findOne({ telegramId: userId });
    if (!user) return ctx.answerCbQuery("Вы не зарегистрированы!");

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split('T')[0];

    const homeworks = await Homework.find({
        classGrade: user.classGrade,
        school: user.school,
        dateFor: dateStr
    });

    let msg = `📅 <b>ДЗ на завтра (${dateStr}):</b>\n\n`;
    if (homeworks.length === 0) msg += "🎉 Ура! Завтра уроков нет или ДЗ не задано.";
    else {
        homeworks.forEach((hw, i) => {
            msg += `<b>${i+1}. ${hw.subject}</b>\n${hw.task}\n\n`;
        });
    }
    
    await ctx.editMessageText(msg, { parse_mode: 'HTML' });
    await ctx.answerCbQuery();
});

bot.action('next_lesson', async (ctx) => {
    const userId = ctx.from.id;
    const user = await User.findOne({ telegramId: userId });
    if (!user) return ctx.answerCbQuery("Вы не зарегистрированы!");

    // Здесь должна быть логика получения расписания из БД
    // Пока заглушка, так как модель Schedule еще не создана в коде выше, 
    // но предполагается, что она будет использоваться.
    
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const currentTime = hours * 60 + minutes;

    // Пример статического расписания (нужно заменить на динамическое из БД)
    const schedule = [
        { name: "Математика", start: 480, end: 525 }, // 08:00 - 08:45
        { name: "Русский язык", start: 535, end: 580 },
        { name: "Литература", start: 590, end: 635 },
        { name: "Обед", start: 635, end: 665 },
        { name: "Физика", start: 675, end: 720 },
    ];

    let nextLesson = null;
    for (let lesson of schedule) {
        if (lesson.start > currentTime) {
            nextLesson = lesson;
            break;
        }
    }

    let msg = "🔔 <b>Следующий урок:</b>\n\n";
    if (nextLesson) {
        const startH = Math.floor(nextLesson.start / 60);
        const startM = nextLesson.start % 60;
        const endH = Math.floor(nextLesson.end / 60);
        const endM = nextLesson.end % 60;
        
        msg += `📚 <b>${nextLesson.name}</b>\n`;
        msg += `⏰ Начало: ${String(startH).padStart(2,'0')}:${String(startM).padStart(2,'0')}\n`;
        msg += `⏳ Конец: ${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}\n`;
        
        // Попытка найти ДЗ для этого предмета на сегодня
        const todayStr = new Date().toISOString().split('T')[0];
        const hw = await Homework.findOne({
            classGrade: user.classGrade,
            school: user.school,
            subject: new RegExp(nextLesson.name, 'i'),
            dateFor: todayStr
        });
        
        if (hw) {
            msg += `\n📝 <b>ДЗ:</b> ${hw.task}`;
        } else {
            msg += `\n📝 <b>ДЗ:</b> Нет информации`;
        }
    } else {
        msg += "Уроков на сегодня больше нет! 🎉";
    }

    await ctx.editMessageText(msg, { parse_mode: 'HTML' });
    await ctx.answerCbQuery();
});

bot.action('add_homework_start', async (ctx) => {
    const userId = ctx.from.id;
    const user = await User.findOne({ telegramId: userId });
    if (!user || (user.role !== 'teacher' && user.role !== 'admin')) {
        return ctx.answerCbQuery("Только учителя и админы могут добавлять ДЗ!");
    }
    
    tempUserData[userId] = { step: 'WAITING_HW_SUBJECT' };
    await ctx.editMessageText("✏️ <b>Добавление ДЗ</b>\n\nВведите название предмета (например, Алгебра):", { parse_mode: 'HTML' });
    await ctx.answerCbQuery();
});

// Обработка ввода предмета и задания (упрощенно)
bot.on('text', async (ctx) => {
    const userId = ctx.from.id;
    const userState = tempUserData[userId];
    
    // Пропускаем если это этап регистрации
    if (userState && userState.step >= 1 && userState.step <= 6) return;

    if (userState && userState.step === 'WAITING_HW_SUBJECT') {
        tempUserData[userId].subject = ctx.message.text;
        tempUserData[userId].step = 'WAITING_HW_TASK';
        return ctx.reply("Введите само задание:");
    }
    
    if (userState && userState.step === 'WAITING_HW_TASK') {
        const user = await User.findOne({ telegramId: userId });
        const taskText = ctx.message.text;
        
        // Дата: если вечер, то на завтра, иначе сегодня
        const now = new Date();
        let targetDate = new Date();
        if (now.getHours() >= 18 || now.getDay() === 0) {
             targetDate.setDate(targetDate.getDate() + 1);
        }
        const dateStr = targetDate.toISOString().split('T')[0];

        // Удаляем старое ДЗ по этому предмету на эту дату
        await Homework.deleteOne({
            classGrade: user.classGrade,
            school: user.school,
            subject: userState.subject,
            dateFor: dateStr
        });

        const newHw = new Homework({
            classGrade: user.classGrade,
            school: user.school,
            subject: userState.subject,
            task: taskText,
            dateFor: dateStr,
            addedBy: userId
        });
        
        await newHw.save();
        delete tempUserData[userId];
        
        return ctx.reply(`✅ ДЗ по предмету "${userState.subject}" добавлено на ${dateStr}`);
    }
});

// Запуск
console.log('🚀 Бот запускается...');
mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('✅ MongoDB подключена');
        bot.launch();
        console.log('✅ Бот запущен');
    })
    .catch(err => {
        console.error('❌ Ошибка подключения к MongoDB:', err);
        process.exit(1);
    });

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
