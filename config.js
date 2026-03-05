import dotenv from 'dotenv';
dotenv.config();

const telegramToken = process.env.BOT_TOKEN;
const mongodbUri = process.env.MONGODB_URI;
const adminChatIds = [5191412364];

const appConfig = {
    maxHomeworkDisplay: 10,
    timezone: 'Europe/Moscow',
    supportedPhotoFormats: ['jpg', 'jpeg', 'png', 'gif'],
    maxButtonsPerRow: 2,
    limits: {
        maxClassNameLength: 10,
        maxSubjectNameLength: 50,
        maxHomeworkLength: 1000,
        maxPhotosPerHomework: 5
    }
};

//на всякий случай это оставлю
const messages = {
    welcome: '👋 Добро пожаловать в помощник по домашним заданиям!',
    registration: {
        step1: '📝 Регистрация\n\nШаг 1 из 3: Введите ваше имя',
        step2: '📝 Регистрация\n\nШаг 2 из 3: Введите ваш класс (например: 10А, 9Б)',
        step3: '📝 Регистрация\n\nШаг 3 из 3: Хотите ли вы стать администратором?',
        completed: '✅ Регистрация завершена!',
        error: '❌ Произошла ошибка при регистрации. Попробуйте еще раз.'
    },
    homework: {
        noHomework: '📝 На этот день домашние задания не заданы.',
        updated: '✅ Домашнее задание обновлено!',
        error: '❌ Произошла ошибка при работе с домашним заданием.'
    },
    
    schedule: {
        uploaded: '✅ Расписание обновлено!',
        notFound: '📝 Расписание пока не загружено.',
        error: '❌ Произошла ошибка при работе с расписанием.'
    },
    
    admin: {
        noPermission: '❌ У вас нет прав для выполнения этого действия.',
        requestSent: '📨 Заявка на роль администратора отправлена!',
        approved: '🎉 Поздравляем! Ваша заявка на роль администратора была одобрена.',
        rejected: '❌ К сожалению, ваша заявка на роль администратора была отклонена.'
    },
    
    errors: {
        userNotFound: '❌ Пользователь не найден. Используйте /start',
        databaseError: '❌ Произошла ошибка базы данных. Попробуйте позже.',
        invalidDate: '❌ Некорректная дата!',
        photoError: '❌ Ошибка при работе с фото.'
    }
};

const availableButtons = [
    { name: 'Сегодня', key: 'today', emoji: '📆' },
    { name: 'Завтра', key: 'tomorrow', emoji: '📅' },
    { name: 'Неделя', key: 'week', emoji: '📊' },
    { name: 'Другая неделя', key: 'other_week', emoji: '📋' },
    { name: 'Выбор дня', key: 'select_day', emoji: '📝' },
    { name: 'Всё ДЗ', key: 'all_homework', emoji: '📚' },
    { name: 'Расписание', key: 'schedule', emoji: '📖' },
    { name: 'Профиль', key: 'profile', emoji: '👤' },
    { name: 'Настройка', key: 'settings', emoji: '⚙️' }
];

const adminButtons = [
    { name: 'Загрузить расписание', key: 'upload_schedule', emoji: '📤' },
    { name: 'Редактировать ДЗ', key: 'edit_homework', emoji: '✏️' }
];

// === Объединяем всё в один объект конфигурации ===
const config = {
    telegramToken,
    mongodbUri,
    adminChatIds,
    appConfig,
    messages,
    availableButtons,
    adminButtons
};

export default config;

export { telegramToken, mongodbUri, adminChatIds, appConfig, messages, availableButtons, adminButtons };
