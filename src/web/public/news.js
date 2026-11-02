import { api, escapeHtml, formatDateTime, errorMessage } from './common.js';
import { initPublicNav } from './auth.js';

const PAGE_SIZE = 20;
const list = document.getElementById('news-list');
const more = document.getElementById('news-more');
let offset = 0;

function newsCard(item) {
  const pinned = item.pinned ? '<span class="badge">Закреплено</span> ' : '';
  const body = escapeHtml(item.body).split('\n').join('<br>');
  return `<article class="card news-item"><h3>${pinned}${escapeHtml(item.title)}</h3><p class="news-date">${escapeHtml(
    formatDateTime(item.publishedAt),
  )}</p><p>${body}</p></article>`;
}

async function loadMore() {
  more.disabled = true;
  try {
    const { news } = await api(`/api/news?limit=${PAGE_SIZE}&offset=${offset}`, { allow401: true });
    if (offset === 0) list.innerHTML = news.length ? '' : '<p class="muted">Новостей пока нет.</p>';
    list.insertAdjacentHTML('beforeend', news.map(newsCard).join(''));
    offset += news.length;
    more.classList.toggle('hidden', news.length < PAGE_SIZE);
  } catch (err) {
    list.innerHTML = `<div class="alert error">${escapeHtml(errorMessage(err))}</div>`;
  } finally {
    more.disabled = false;
  }
}

more.addEventListener('click', loadMore);
initPublicNav();
loadMore();
