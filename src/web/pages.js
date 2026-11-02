import { readFile } from 'node:fs/promises';
import { config } from '../config.js';
import { News } from '../db/models/News.js';
import { TEXTS } from '../bot/texts.js';
import { escapeHtml } from '../utils/normalize.js';
import { CONTACTS } from '../utils/contacts.js';
import { asyncRoute } from './helpers.js';

const PUBLIC_DIR = new URL('./public/', import.meta.url);
const PRIVACY_FILE = new URL('../../docs/privacy.md', import.meta.url);
const templateCache = new Map();

async function loadTemplate(name) {
  if (config.env === 'production' && templateCache.has(name)) return templateCache.get(name);
  const template = await readFile(new URL(name, PUBLIC_DIR), 'utf8');
  templateCache.set(name, template);
  return template;
}

// Переменные вида {{NAME}} экранируются; {{{NAME}}} вставляются как готовый HTML,
// который формируется только на сервере из доверенных источников.
export function render(template, vars = {}) {
  return template.replace(/\{\{\{([A-Z_]+)\}\}\}|\{\{([A-Z_]+)\}\}/g, (match, rawKey, safeKey) => {
    const key = rawKey || safeKey;
    if (!(key in vars)) return '';
    return rawKey ? String(vars[key]) : escapeHtml(String(vars[key]));
  });
}

function baseVars() {
  return {
    BOT_USERNAME: config.bot.username,
    SITE_URL: config.siteUrl,
    BOT_LINK: `https://t.me/${config.bot.username}?start=site`,
    YEAR: new Date().getFullYear(),
    CREATOR_LINK: CONTACTS.creatorUrl || `https://t.me/${config.bot.username}?start=support`,
    CHAT_LINK: CONTACTS.chatUrl || `https://t.me/${config.bot.username}`,
    FOOTER_EXTRA: footerExtraHtml(),
    CONTACTS_BLOCK: contactsBlockHtml(),
  };
}

function footerExtraHtml() {
  if (!CONTACTS.donateUrl) return '';
  return `<a href="${escapeHtml(CONTACTS.donateUrl)}" target="_blank" rel="noopener">Поддержать проект</a>`;
}

function contactsBlockHtml() {
  const rows = [];
  if (CONTACTS.creatorUrl) {
    const name = CONTACTS.ownerName ? `${escapeHtml(CONTACTS.ownerName)}, ` : '';
    rows.push(`<dt>Создатель</dt><dd>${name}<a href="${escapeHtml(CONTACTS.creatorUrl)}" target="_blank" rel="noopener">@${escapeHtml(CONTACTS.creatorUsername)}</a></dd>`);
  }
  if (CONTACTS.emails.length) {
    const links = CONTACTS.emails.map((email) => `<a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a>`).join('<br>');
    rows.push(`<dt>Почта</dt><dd>${links}</dd>`);
  }
  if (CONTACTS.chatUrl) {
    rows.push(`<dt>Чат бота</dt><dd><a href="${escapeHtml(CONTACTS.chatUrl)}" target="_blank" rel="noopener">${escapeHtml(CONTACTS.chatUrl.replace(/^https:\/\//, ''))}</a></dd>`);
  }
  const donate = CONTACTS.donateUrl
    ? `<p style="margin-top:14px">Бот бесплатный и без рекламы. Если он тебе помогает, можно поддержать проект.</p><a class="btn" href="${escapeHtml(CONTACTS.donateUrl)}" target="_blank" rel="noopener">Поддержать проект</a>`
    : '';
  return `<dl class="kv">${rows.join('')}</dl>${donate}`;
}

function inlineMarkdown(text) {
  return escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>');
}

// Минимальный разбор Markdown для политики: заголовки, списки, абзацы, жирный текст и код.
export function markdownToHtml(markdown) {
  const lines = String(markdown || '').replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let paragraph = [];
  let listOpen = false;
  const flushParagraph = () => {
    if (paragraph.length > 0) {
      html.push(`<p>${paragraph.map(inlineMarkdown).join('<br>')}</p>`);
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listOpen) {
      html.push('</ul>');
      listOpen = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const heading = /^(#{1,4})\s+(.+)$/.exec(line);
    const item = /^\s*[-*]\s+(.+)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
    } else if (item) {
      flushParagraph();
      if (!listOpen) {
        html.push('<ul>');
        listOpen = true;
      }
      html.push(`<li>${inlineMarkdown(item[1])}</li>`);
    } else if (!line.trim()) {
      flushParagraph();
      closeList();
    } else {
      closeList();
      paragraph.push(line.trim());
    }
  }
  flushParagraph();
  closeList();
  return html.join('\n');
}

// TEXTS.HELP написан для Telegram (HTML-разметка и переносы строк), на сайте переносы заменяются на <br>.
function telegramHtmlToPage(text) {
  return String(text || '').split('\n').join('<br>');
}

async function latestNewsHtml() {
  const items = await News.find({}).sort({ publishedAt: -1 }).limit(3).lean();
  if (items.length === 0) return '<p class="muted">Новостей пока нет.</p>';
  return items
    .map(
      (item) =>
        `<article class="card news-item"><h3>${escapeHtml(item.title)}</h3><p class="news-date">${escapeHtml(
          new Date(item.publishedAt).toLocaleDateString('ru-RU', { timeZone: config.tz }),
        )}</p><p>${escapeHtml(item.body).split('\n').join('<br>')}</p></article>`,
    )
    .join('\n');
}

function page(file, extraVars = async () => ({})) {
  return asyncRoute(async (req, res) => {
    const template = await loadTemplate(file);
    const vars = { ...baseVars(), ...(await extraVars(req)) };
    res.type('html').send(render(template, vars));
  });
}

export async function renderNotFound() {
  const template = await loadTemplate('404.html');
  return render(template, baseVars());
}

export function setupPages(app) {
  app.get('/', page('index.html', async () => ({ NEWS: await latestNewsHtml() })));
  app.get('/register', page('register.html'));
  app.get('/login', page('login.html'));
  app.get('/app', page('app.html'));
  app.get('/admin', page('admin.html'));
  app.get('/creator', page('creator.html'));
  app.get('/news', page('news.html'));
  app.get('/support', page('support.html'));
  app.get('/help', page('help.html', async () => ({ HELP: telegramHtmlToPage(TEXTS.HELP) })));
  app.get(
    '/privacy',
    page('privacy.html', async () => {
      let markdown = '';
      try {
        markdown = await readFile(PRIVACY_FILE, 'utf8');
      } catch {
        markdown = '# Политика конфиденциальности\n\nДокумент временно недоступен.';
      }
      return { PRIVACY: markdownToHtml(markdown) };
    }),
  );
  app.get('/tma', page('tma.html'));
}
