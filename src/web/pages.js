import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.join(__dirname, 'public');

// Явные маршруты страниц сайта (Express 5: голый '*' в путях не используем).
// sendFile отдаёт файл с корректным Content-Type — так браузер не пытается
// исполнить HTML как скрипт (ошибка "Unexpected token '<'" из-за MIME text/plain).
const PAGES = [
  { path: '/', file: 'index.html' },
  { path: '/register', file: 'register.html' },
  { path: '/login', file: 'login.html' },
  { path: '/dashboard', file: 'dashboard.html' },
  { path: '/app', file: 'dashboard.html' }, // /app — то же, что личный кабинет
];

export function registerPages(app) {
  for (const page of PAGES) {
    app.get(page.path, (req, res) => {
      res.sendFile(path.join(publicDir, page.file));
    });
  }

  // Страницы «Помощь» и «Политика конфиденциальности» рендерим из markdown
  app.get('/help', async (req, res) => {
    const md = await readDoc('privacy-help.md');
    res.type('html').send(standalonePage('Помощь', md));
  });

  app.get('/privacy', async (req, res) => {
    const md = await readDoc('privacy.md');
    res.type('html').send(standalonePage('Политика конфиденциальности', md));
  });
}

async function readDoc(name) {
  try {
    const fs = await import('fs/promises');
    return await fs.readFile(path.join(__dirname, '../../docs', name), 'utf8');
  } catch {
    return '';
  }
}

// Мини-рендерер markdown: заголовки, списки, абзацы. Пользовательского ввода нет.
function standalonePage(title, md) {
  const body = md
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      if (line.startsWith('## ')) return `<h2>${escaped.slice(3)}</h2>`;
      if (line.startsWith('# ')) return `<h1>${escaped.slice(2)}</h1>`;
      if (line.startsWith('- ')) return `<li>${escaped.slice(2)}</li>`;
      return `<p>${escaped}</p>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — КлассныйБот</title>
  <link rel="stylesheet" href="/styles.css">
</head>
<body>
  <header>
    <div class="container">
      <h1><a href="/" style="text-decoration:none;color:inherit">📚 КлассныйБот</a></h1>
    </div>
  </header>
  <main class="container">${body || `<p>Текст появится позже.</p>`}</main>
  <footer class="container">
    <p><a href="/">На главную</a> · <a href="/help">Помощь</a> · <a href="/privacy">Политика конфиденциальности</a></p>
  </footer>
</body>
</html>`;
}
