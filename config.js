import dotenv from 'dotenv';
dotenv.config();

const telegramToken = process.env.BOT_TOKEN;
const mongodbUri = process.env.MONGODB_URI;
const adminChatIds = [5191412364, 369745517];

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