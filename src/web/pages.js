import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import config from '../config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const docsDir = path.join(__dirname, '../../docs');

const PAGES = [
  ['/', 'index.html'],
  ['/register', 'register.html'],
  ['/login', 'login.html'],
  ['/app', 'app.html'],
  ['/dashboard', 'app.html'],
  ['/admin', 'admin.html'],
  ['/creator', 'creator.html'],
  ['/news', 'news.html'],
  ['/support', 'support.html'],
  ['/tma', 'tma.html'],
];

function escapeHtml(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Простой рендер markdown для docs/: заголовки, списки, абзацы, жирный текст
function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let inList = false;

  const inline = (text) => escapeHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2">$1</a>');

  for (const line of lines) {
    const value = line.trim();
    if (!value) {
      if (inList) { html.push('</ul>'); inList = false; }
      continue;
    }
    if (value.startsWith('- ')) {
      if (!inList) { html.push('<ul>'); inList = true; }
      html.push(`<li>${inline(value.slice(2))}</li>`);
      continue;
    }
    if (inList) { html.push('</ul>'); inList = false; }
    if (value.startsWith('### ')) html.push(`<h3>${inline(value.slice(4))}</h3>`);
    else if (value.startsWith('## ')) html.push(`<h2>${inline(value.slice(3))}</h2>`);
    else if (value.startsWith('# ')) html.push(`<h1>${inline(value.slice(2))}</h1>`);
    else html.push(`<p>${inline(value)}</p>`);
  }

  if (inList) html.push('</ul>');
  return html.join('\n');
}

function docPage(title, body) {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — КлассныйБот</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body>
<header class="site-header"><div class="container"><a class="brand" href="/">📚 КлассныйБот</a></div></header>
<main class="container doc">${body}</main>
<footer class="site-footer"><div class="container">
<a href="/">Главная</a> · <a href="/help">Помощь</a> · <a href="/privacy">Политика конфиденциальности</a>
</div></footer>
</body>
</html>`;
}

async function readDoc(name) {
  try {
    return await readFile(path.join(docsDir, name), 'utf8');
  } catch {
    return '';
  }
}

const botConfig = `window.__BOT_USERNAME__ = ${JSON.stringify(config.bot.username)};\nwindow.__SITE_URL__ = ${JSON.stringify(config.site.url)};\nwindow.__GOOGLE_CLIENT_ID__ = ${JSON.stringify(config.google.clientId)};\nwindow.__WEBAPP_URL__ = ${JSON.stringify(config.site.webAppUrl)};\n`;

export function registerPages(app) {
  // Небольшой конфиг для фронтенда: ник бота нужен для ссылок t.me/...
  app.get('/bot-config.js', (req, res) => {
    res.type('application/javascript').send(botConfig);
  });

  for (const [route, file] of PAGES) {
    app.get(route, async (req, res, next) => {
      try {
        const html = await readFile(path.join(publicDir, file), 'utf8');
        // Подключаем конфиг синхронным скриптом до ES-модулей страницы
        const withConfig = html.includes('</head>')
          ? html.replace('</head>', '<script src="/bot-config.js"></script>\n</head>')
          : html;
        res.type('html').send(withConfig);
      } catch (error) {
        next(error);
      }
    });
  }

  app.get('/help', async (req, res) => {
    const body = await readDoc('help.md');
    res.type('html').send(docPage('Помощь', renderMarkdown(body || 'Текст появится позже.')));
  });

  app.get('/privacy', async (req, res) => {
    const body = await readDoc('privacy.md');
    res.type('html').send(docPage('Политика конфиденциальности', renderMarkdown(body || 'Текст появится позже.')));
  });

  app.get('/robots.txt', (req, res) => {
    res.type('text/plain').send(`User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /admin\nDisallow: /creator\nDisallow: /tma\n`);
  });
}
