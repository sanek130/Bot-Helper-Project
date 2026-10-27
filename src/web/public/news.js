// Новости: публичный список на /news и последние три публикации на главной.
import {
  api,
  fmtDate,
  getBotLink,
  getMe,
  hasBotUsername,
  renderHeader,
} from './common.js';

const LANDING_LIMIT = 3;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function button(label, className, onClick) {
  const node = el('button', className || 'btn', label);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

function emptyState(title, text) {
  const box = el('div', 'empty');
  box.append(el('strong', null, title));
  if (text) box.append(el('span', null, text));
  return box;
}

function newsCard(item, headingTag) {
  const card = el('article', 'card news-card');

  const meta = el('div', 'news-meta');
  if (item.pinned) meta.append(el('span', 'badge badge-accent', '📌 Закреплено'));
  if (item.publishedAt) meta.append(el('span', 'small muted', fmtDate(item.publishedAt, true)));
  card.append(meta);

  card.append(el(headingTag || 'h2', null, item.title || 'Без названия'));
  card.append(el('p', 'news-body', item.body || ''));

  return card;
}

function sortNews(items) {
  return [...items].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1;
    return new Date(b.publishedAt || 0) - new Date(a.publishedAt || 0);
  });
}

async function loadNewsInto(container, limit) {
  container.replaceChildren(el('div', 'loading', 'Загружаю новости'));

  try {
    const data = await api('/api/news');
    let items = sortNews(Array.isArray(data.news) ? data.news : []);
    if (limit) items = items.slice(0, limit);

    if (!items.length) {
      container.replaceChildren(emptyState('Новостей пока нет', 'Загляни позже — здесь появятся объявления.'));
      return;
    }

    container.replaceChildren(...items.map((item) => newsCard(item, limit ? 'h3' : 'h2')));
  } catch (error) {
    const box = el('div', 'stack');
    box.append(emptyState('Не удалось загрузить новости', error.message || 'Попробуй обновить страницу.'));
    box.append(button('Повторить', 'btn btn-secondary', () => loadNewsInto(container, limit)));
    container.replaceChildren(box);
  }
}

function setupBotLink() {
  const link = document.getElementById('telegram-link');
  if (!link) return;

  link.href = getBotLink();
  if (!hasBotUsername()) {
    link.textContent = 'Бот в Telegram';
    link.removeAttribute('target');
  }
}

async function init() {
  const user = await getMe();
  renderHeader(user);
  setupBotLink();

  const landing = document.getElementById('landing-news');
  if (landing) await loadNewsInto(landing, LANDING_LIMIT);

  const page = document.getElementById('news-list');
  if (page) await loadNewsInto(page, 0);
}

init();
