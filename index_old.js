import 'dotenv/config';
import { Telegraf, Markup, session } from 'telegraf';
import * as config from './config.js';
import mongoose from 'mongoose';
import express from 'express';

import { User } from './models/User.js';
import { Homework } from './models/Homework.js';

import { initNotifications } from './notifications.js';

const bot = new Telegraf(config.telegramToken);
const app = express();
const PORT = process.env.PORT || 5000;

// Health endpoints
app.get("/", (req, res) => res.status(200).send("OK"));
app.get("/health", (req, res) => {
    res.status(200).json({
        ok: true,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

const adminChatIds = [5191412364, 369745517];
const sessions = new Map();

// Список городов и школ
const CITIES = [
    "Краснодар",
    "Москва", 
    "Санкт-Петербург",
    "Новосибирск",
    "Екатеринбург",
    "Другой"
];

const SCHOOLS = {
    "Краснодар": ["Школа №1", "Школа №2", "Школа №3", "Гимназия №1", "Лицей №1", "Другая"],
    "Москва": ["Школа №1", "Школа №2", "Школа №3", "Гимназия №1", "Лицей №1", "Другая"],
    "Санкт-Петербург": ["Школа №1", "Школа №2", "Школа №3", "Гимназия №1", "Лицей №1", "Другая"],
    "Новосибирск": ["Школа №1", "Школа №2", "Школа №3", "Гимназия №1", "Лицей №1", "Другая"],
    "Екатеринбург": ["Школа №1", "Школа №2", "Школа №3", "Гимназия №1", "Лицей №1", "Другая"],
    "Другой": ["Другая школа"]
};

async function connectDB() {
    try {
        await mongoose.connect(config.mongodbUri);
        console.log('✅ MongoDB подключена успешно!');
        
        // Запускаем периодическую очистку старых ДЗ (каждые 24 часа)
        setInterval(async () => {
            try {
                await Homework.cleanupOldHomework();
                console.log('✅ Старое ДЗ (>14 дней) очищено');
            } catch (e) {
                console.error('❌ Ошибка очистки старого ДЗ:', e);
            }
        }, 86400000);
        
    } catch (error) {
        console.error('❌ Ошибка подключения к MongoDB:', error);
        process.exit(1);
    }
}

mongoose.connection.on("error", (err) => {
    console.error("❌ Ошибка MongoDB:", err);
});

bot.use(session());

// Rate limiting
const RATE_LIMIT_MAX_PER_MINUTE = 30;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateLimitBuckets = new Map();

bot.use(async (ctx, next) => {
    if (!ctx.from || ctx.updateType !== "message") return next();

    const userId = String(ctx.from.id);
    const now = Date.now();

    const bucket = rateLimitBuckets.get(userId) || { count: 0, resetAt: now + RATE_LIMIT_WINDOW_MS, lastWarnAt: 0 };
    if (now >= bucket.resetAt) {
        bucket.count = 0;
        bucket.resetAt = now + RATE_LIMIT_WINDOW_MS;
        bucket.lastWarnAt = 0;
    }

    bucket.count += 1;
    rateLimitBuckets.set(userId, bucket);

    if (bucket.count > RATE_LIMIT_MAX_PER_MINUTE) {
        if (now - bucket.lastWarnAt > 3000) {
            const secondsLeft = Math.ceil((bucket.resetAt - now) / 1000);
            bucket.lastWarnAt = now;
            rateLimitBuckets.set(userId, bucket);
            await ctx.reply(`⏳ Слишком много сообщений. Лимит: ${RATE_LIMIT_MAX_PER_MINUTE} в минуту.\nПопробуйте снова через ${secondsLeft} сек.`);
        }
        return;
    }

    return next();
});

bot.use((ctx, next) => {
    const sessionId = ctx.from?.id.toString() || "anonymous";
    ctx.session = sessions.get(sessionId) || {};
    return next().then(() => {
        if (Object.keys(ctx.session).length > 0) {
            sessions.set(sessionId, ctx.session);
        } else {
            sessions.delete(sessionId);
        }
    });
});

initNotifications(bot);
