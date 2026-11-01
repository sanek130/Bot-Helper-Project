import {
  api,
  escapeHtml,
  errorMessage,
  showAlert,
  formatDate,
  formatDateTime,
  toDateKey,
  addDaysKey,
  copyToClipboard,
  capitalize,
  photosHtml,
} from './common.js';
import { requireUser, logout, logoutAll } from './auth.js';

const ROLE_TITLES = { user: 'Ученик', admin: 'Админ класса', support: 'Поддержка', moderator: 'Модератор', creator: 'Создатель' };
const content = document.getElementById('tab-content');
const alertBox = document.getElementById('app-alert');
const tabs = [...document.querySelectorAll('.tabs [data-tab]')];
let user = null;
let weekOffset = 0;
let currentDay = null;

function hwCard(dateKey, item) {
  const done = item.completed;
  const text = item.text ? `<p class="hw-text">${escapeHtml(item.text)}</p>` : '';
  return `<article class="hw-card ${done ? 'done' : ''}">
    <div class="hw-head">
      <button type="button" class="check ${done ? 'done' : ''}" data-action="toggle" data-date="${dateKey}" data-hash="${escapeHtml(item.subjectHash)}"
        aria-pressed="${done}" aria-label="${done ? 'Снять отметку' : 'Отметить выполненным'}">${done ? '✓' : ''}</button>
      <span class="hw-subject">${escapeHtml(item.icon || '')} ${escapeHtml(item.subjectName)}</span>
    </div>
    ${text}
    ${photosHtml(item.photoIds)}
  </article>`;
}

async function showDay(dateKey) {
  currentDay = dateKey;
  content.innerHTML = '<p class="muted">Загрузка...</p>';
  const data = await api(`/api/homework/day/${dateKey}`);
  const cards = data.subjects.length
    ? data.subjects.map((item) => hwCard(dateKey, item)).join('')
    : '<div class="card muted">На этот день ДЗ нет.</div>';
  const doneCount = data.subjects.filter((item) => item.completed).length;
  const progress = data.subjects.length ? `<span class="badge ${doneCount === data.subjects.length ? 'ok' : ''}">Выполнено ${doneCount} из ${data.subjects.length}</span>` : '';
  content.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:10px">
      <h2>${escapeHtml(formatDate(dateKey))}</h2>${progress}</div>${cards}`;
}

async function showWeek() {
  currentDay = null;
  content.innerHTML = '<p class="muted">Загрузка...</p>';
  const { days } = await api(`/api/homework/week?offset=${weekOffset}`);
  const today = toDateKey();
  const items = days
    .map(
      (day) => `<button type="button" class="week-day" data-action="open-day" data-date="${day.dateKey}">
        <span>${escapeHtml(formatDate(day.dateKey))}${day.dateKey === today ? ' · сегодня' : ''}</span>
        <span class="badge ${day.hasHomework ? 'ok' : ''}">${day.hasHomework ? 'есть ДЗ' : 'нет ДЗ'}</span></button>`,
    )
    .join('');
  content.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:10px">
      <button type="button" class="secondary" data-action="week-prev">← Неделя назад</button>
      <button type="button" class="secondary" data-action="week-next">Неделя вперёд →</button></div>${items}`;
}

async function showSchedule() {
  currentDay = null;
  content.innerHTML = '<p class="muted">Загрузка...</p>';
  const { photoId } = await api('/api/schedule');
  content.innerHTML = photoId
    ? `<div class="card"><h2>Расписание</h2><a href="/api/files/${encodeURIComponent(photoId)}" target="_blank" rel="noopener">
        <img class="schedule-img" src="/api/files/${encodeURIComponent(photoId)}" alt="Расписание класса"></a></div>`
    : '<div class="card muted">Расписание ещё не загружено. Попроси админа класса добавить его.</div>';
}

function showSearch() {
  currentDay = null;
  content.innerHTML = `<div class="card"><form id="search-form" class="row" novalidate>
      <input id="search-q" minlength="2" maxlength="100" placeholder="Предмет или слово из задания" aria-label="Поиск">
      <button type="submit">Найти</button></form></div><div id="search-results"></div>`;
  document.getElementById('search-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const q = document.getElementById('search-q').value.trim();
    const results = document.getElementById('search-results');
    if (q.length < 2) {
      results.innerHTML = '<div class="alert">Введи хотя бы 2 символа.</div>';
      return;
    }
    try {
      const data = await api(`/api/homework/search?q=${encodeURIComponent(q)}`);
      results.innerHTML = data.results.length
        ? data.results
            .map(
              (item) => `<article class="hw-card"><div class="hw-head"><span class="hw-subject">${escapeHtml(item.icon)} ${escapeHtml(item.subjectName)}</span>
                <button type="button" class="secondary" data-action="open-day" data-date="${item.dateKey}">${escapeHtml(formatDate(item.dateKey))}</button></div>
                ${item.text ? `<p class="hw-text">${escapeHtml(item.text)}</p>` : ''}${photosHtml(item.photoIds)}</article>`,
            )
            .join('')
        : '<div class="card muted">Ничего не найдено.</div>';
    } catch (err) {
      results.innerHTML = `<div class="alert error">${escapeHtml(errorMessage(err))}</div>`;
    }
  });
}

function showProfile() {
  currentDay = null;
  const warns = user.role === 'admin' || user.warns > 0 ? `<dt>Предупреждения</dt><dd>${user.warns} из 3</dd>` : '';
  const telegram = user.tgId ? 'привязан' : 'не привязан';
  content.innerHTML = `<div class="card">
      <h2>Профиль</h2>
      <dl class="kv">
        <dt>Имя</dt><dd>${escapeHtml(user.firstName || '—')}</dd>
        <dt>Город</dt><dd>${escapeHtml(capitalize(user.city) || '—')}</dd>
        <dt>Школа</dt><dd>${escapeHtml(capitalize(user.school) || '—')}</dd>
        <dt>Класс</dt><dd>${escapeHtml(user.class || '—')}</dd>
        <dt>Роль</dt><dd>${escapeHtml(ROLE_TITLES[user.role] || user.role)}</dd>
        <dt>Telegram</dt><dd>${telegram}</dd>
        <dt>Спец-ID</dt><dd><code id="spec-id">${escapeHtml(user.specId)}</code></dd>
        ${warns}
        <dt>Просмотров ДЗ</dt><dd>${user.stats.homeworkViews}</dd>
        <dt>Последняя активность</dt><dd>${escapeHtml(formatDateTime(user.stats.lastActive))}</dd>
      </dl>
      <div class="row" style="margin-top:14px">
        <button type="button" class="secondary" data-action="copy-spec">Скопировать спец-ID</button>
        <button type="button" class="secondary" data-action="logout">Выйти</button>
        <button type="button" class="danger" data-action="logout-all">Выйти со всех устройств</button>
      </div>
    </div>`;
}

async function openTab(name) {
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  showAlert(alertBox, '');
  const today = toDateKey();
  try {
    if (name === 'today') await showDay(today);
    else if (name === 'tomorrow') await showDay(addDaysKey(today, 1));
    else if (name === 'after') await showDay(addDaysKey(today, 2));
    else if (name === 'week') await showWeek();
    else if (name === 'schedule') await showSchedule();
    else if (name === 'search') showSearch();
    else if (name === 'profile') showProfile();
  } catch (err) {
    content.innerHTML = '';
    showAlert(alertBox, errorMessage(err), 'error');
  }
}

for (const tab of tabs) tab.addEventListener('click', () => openTab(tab.dataset.tab));

content.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action } = button.dataset;
  try {
    if (action === 'toggle') {
      button.disabled = true;
      await api('/api/homework/toggle', { method: 'POST', body: { dateKey: button.dataset.date, subjectHash: button.dataset.hash } });
      await showDay(currentDay || button.dataset.date);
    } else if (action === 'open-day') {
      tabs.forEach((tab) => tab.classList.remove('active'));
      await showDay(button.dataset.date);
    } else if (action === 'week-prev') {
      weekOffset = Math.max(-52, weekOffset - 1);
      await showWeek();
    } else if (action === 'week-next') {
      weekOffset = Math.min(52, weekOffset + 1);
      await showWeek();
    } else if (action === 'copy-spec') {
      const ok = await copyToClipboard(user.specId);
      showAlert(alertBox, ok ? 'Спец-ID скопирован.' : 'Не удалось скопировать.', ok ? 'success' : 'error');
    } else if (action === 'logout') {
      await logout();
    } else if (action === 'logout-all') {
      if (window.confirm('Выйти на всех устройствах? Придётся войти заново.')) await logoutAll();
    }
  } catch (err) {
    button.disabled = false;
    showAlert(alertBox, errorMessage(err), 'error');
  }
});

async function init() {
  user = await requireUser();
  if (!user) return;
  document.getElementById('class-line').textContent =
    user.school && user.class ? `${capitalize(user.school)}, ${user.class}` : 'Класс не указан';
  const initial = new URLSearchParams(window.location.search).get('tab') || 'today';
  await openTab(tabs.some((tab) => tab.dataset.tab === initial) ? initial : 'today');
}

init();
