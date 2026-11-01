import { api, escapeHtml, errorMessage, showAlert, formatDateTime, truncate, capitalize, classLabel } from './common.js';
import { requireUser } from './auth.js';
import { mountAdminTools } from './admin.js';

const ROLE_TITLES = { user: 'Ученик', admin: 'Админ класса', support: 'Поддержка', moderator: 'Модератор', creator: 'Создатель' };
const AUDIENCE_TITLES = { all: 'Все пользователи', city: 'Город', school: 'Школа', class: 'Класс' };
const CLASS_STORAGE_KEY = 'hw_work_class';
const alertBox = document.getElementById('creator-alert');
const tabs = [...document.querySelectorAll('.tabs [data-tab]')];
const panels = Object.fromEntries([...document.querySelectorAll('[data-panel]')].map((el) => [el.dataset.panel, el]));
let me = null;
let classKey = '';
let tools = null;

const say = (text, type = 'success') => {
  showAlert(alertBox, text, type);
  alertBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
};
const fail = (err) => say(errorMessage(err), 'error');

// ---------- Класс ----------

async function initClassPanel() {
  const select = document.getElementById('class-select');
  const manual = document.getElementById('class-manual');
  const { classes } = await api('/api/admin/classes');
  const own = me.school && me.class ? `${me.school}::${me.class}` : '';
  const stored = window.localStorage.getItem(CLASS_STORAGE_KEY) || '';
  const list = [...new Set([own, ...classes].filter(Boolean))];
  classKey = list.includes(stored) || stored.includes('::') ? stored : own || list[0] || '';
  if (classKey && !list.includes(classKey)) list.unshift(classKey);
  select.innerHTML = list.length
    ? list.map((key) => `<option value="${escapeHtml(key)}" ${key === classKey ? 'selected' : ''}>${escapeHtml(classLabel(key))}</option>`).join('')
    : '<option value="">Классов пока нет</option>';
  tools = mountAdminTools(document.getElementById('admin-tools'), { getClassKey: () => classKey, alertBox, isStaff: true });
  if (classKey) tools.refresh();
  document.getElementById('class-apply').addEventListener('click', () => {
    const typed = manual.value.trim();
    const next = typed || select.value;
    if (!next.includes('::')) {
      say('Укажи класс в формате «школа::класс».', 'error');
      return;
    }
    classKey = next;
    window.localStorage.setItem(CLASS_STORAGE_KEY, classKey);
    if (typed && ![...select.options].some((option) => option.value === typed)) {
      select.insertAdjacentHTML('afterbegin', `<option value="${escapeHtml(typed)}">${escapeHtml(classLabel(typed))}</option>`);
    }
    select.value = classKey;
    manual.value = '';
    say(`Рабочий класс: ${classLabel(classKey)}.`);
    tools.refresh();
  });
}

// ---------- Новости ----------

function newsForm(item = null) {
  const audience = item?.audience || 'all';
  const options = Object.entries(AUDIENCE_TITLES)
    .map(([value, title]) => `<option value="${value}" ${value === audience ? 'selected' : ''}>${escapeHtml(title)}</option>`)
    .join('');
  return `<form class="stack" data-news-form="${item ? escapeHtml(item._id) : ''}" novalidate>
    <div class="field"><label>Заголовок</label><input name="title" maxlength="200" value="${escapeHtml(item?.title || '')}" required></div>
    <div class="field"><label>Текст</label><textarea name="body" maxlength="5000" required>${escapeHtml(item?.body || '')}</textarea></div>
    <div class="grid two">
      <div class="field"><label>Аудитория</label><select name="audience">${options}</select></div>
      <div class="field"><label>Значение аудитории</label><input name="audienceValue" maxlength="200" value="${escapeHtml(item?.audienceValue || '')}"></div>
    </div>
    <label class="row"><input type="checkbox" name="pinned" ${item?.pinned ? 'checked' : ''}> Закрепить</label>
    <div class="row"><button type="submit">${item ? 'Сохранить' : 'Опубликовать'}</button>
      ${item ? '<button type="button" class="secondary" data-news-cancel>Отмена</button>' : ''}</div>
  </form>`;
}

async function renderNews() {
  const panel = panels.news;
  panel.innerHTML = `<div class="card"><h2>Новая новость</h2>${newsForm()}</div><div id="news-admin-list"><p class="muted">Загрузка...</p></div>`;
  if (me.role !== 'creator') {
    panel.innerHTML = '<div class="card muted">Публиковать новости может только создатель.</div><div id="news-admin-list"></div>';
  }
  const { news } = await api('/api/news?limit=50');
  const list = document.getElementById('news-admin-list');
  list.innerHTML = news.length
    ? news
        .map(
          (item) => `<article class="card" data-news-id="${escapeHtml(item._id)}">
        <h3>${item.pinned ? '<span class="badge">Закреплено</span> ' : ''}${escapeHtml(item.title)}</h3>
        <p class="muted small">${escapeHtml(formatDateTime(item.publishedAt))} · ${escapeHtml(AUDIENCE_TITLES[item.audience] || item.audience)} ${escapeHtml(item.audienceValue)}</p>
        <p>${escapeHtml(truncate(item.body, 400))}</p>
        ${me.role === 'creator' ? '<div class="row"><button type="button" class="secondary" data-news-edit>Изменить</button><button type="button" class="danger" data-news-delete>Удалить</button></div>' : ''}
      </article>`,
        )
        .join('')
    : '<p class="muted">Новостей пока нет.</p>';
  panel.dataset.news = JSON.stringify(news);
}

panels.news.addEventListener('submit', async (event) => {
  const form = event.target.closest('[data-news-form]');
  if (!form) return;
  event.preventDefault();
  // Доступ через elements: у формы есть собственное свойство title, которое перекрыло бы поле.
  const fields = form.elements;
  const body = {
    title: fields.namedItem('title').value.trim(),
    body: fields.namedItem('body').value.trim(),
    audience: fields.namedItem('audience').value,
    audienceValue: fields.namedItem('audienceValue').value.trim(),
    pinned: fields.namedItem('pinned').checked,
  };
  try {
    const id = form.dataset.newsForm;
    if (id) await api(`/api/news/${encodeURIComponent(id)}`, { method: 'PUT', body });
    else await api('/api/news', { method: 'POST', body });
    say(id ? 'Новость обновлена.' : 'Новость опубликована.');
    await renderNews();
  } catch (err) {
    fail(err);
  }
});

panels.news.addEventListener('click', async (event) => {
  const card = event.target.closest('[data-news-id]');
  try {
    if (event.target.closest('[data-news-cancel]')) {
      await renderNews();
    } else if (card && event.target.closest('[data-news-edit]')) {
      const news = JSON.parse(panels.news.dataset.news || '[]');
      const item = news.find((n) => n._id === card.dataset.newsId);
      card.innerHTML = newsForm(item);
    } else if (card && event.target.closest('[data-news-delete]')) {
      if (!window.confirm('Удалить новость?')) return;
      await api(`/api/news/${encodeURIComponent(card.dataset.newsId)}`, { method: 'DELETE' });
      say('Новость удалена.');
      await renderNews();
    }
  } catch (err) {
    fail(err);
  }
});

// ---------- Пользователи ----------

function userCard(user) {
  const isCreator = me.role === 'creator';
  const actions = [];
  if (user.specId !== me.specId && user.role !== 'creator') {
    actions.push('<button type="button" class="secondary" data-user-action="warn">Варн</button>');
    if (user.role === 'admin') actions.push('<button type="button" class="secondary" data-user-action="demote">Понизить</button>');
    if (user.role === 'user' && !user.adminBanned) actions.push('<button type="button" class="secondary" data-user-action="promote">Сделать админом</button>');
    if (isCreator) {
      actions.push(
        user.banned
          ? '<button type="button" class="secondary" data-user-action="unban">Разбанить</button>'
          : '<button type="button" class="danger" data-user-action="ban">Забанить</button>',
      );
      if (user.warns > 0) actions.push('<button type="button" class="secondary" data-user-action="reset-warns">Сбросить варны</button>');
      if (user.adminBanned) actions.push('<button type="button" class="secondary" data-user-action="admin-unban">Снять запрет админа</button>');
      actions.push('<button type="button" class="danger" data-user-action="delete">Удалить аккаунт</button>');
    }
  }
  const badges = [
    user.banned ? '<span class="badge warn">бан</span>' : '',
    user.adminBanned ? '<span class="badge warn">запрет админа</span>' : '',
    user.status !== 'active' ? `<span class="badge">${escapeHtml(user.status)}</span>` : '',
  ].join(' ');
  return `<article class="card" data-spec="${escapeHtml(user.specId)}">
    <h3>${escapeHtml(user.firstName || 'Без имени')} ${user.username ? `<span class="muted">@${escapeHtml(user.username)}</span>` : ''} ${badges}</h3>
    <p class="small muted">${escapeHtml(ROLE_TITLES[user.role] || user.role)} · ${escapeHtml(capitalize(user.city) || '—')} · ${escapeHtml(capitalize(user.school) || '—')} · ${escapeHtml(user.class || '—')} · варны: ${user.warns}</p>
    <p class="small"><code>${escapeHtml(user.specId)}</code></p>
    <div class="row">${actions.join('')}</div>
  </article>`;
}

function renderUsersPanel() {
  panels.users.innerHTML = `<div class="card"><form id="users-search" class="row" novalidate>
      <input id="users-q" maxlength="100" placeholder="Имя, @username, школа, класс, спец-ID или Telegram ID" aria-label="Поиск пользователей">
      <button type="submit">Найти</button></form></div><div id="users-list"></div>`;
  document.getElementById('users-search').addEventListener('submit', (event) => {
    event.preventDefault();
    searchUsers();
  });
  searchUsers();
}

async function searchUsers() {
  const q = document.getElementById('users-q').value.trim();
  const list = document.getElementById('users-list');
  try {
    const { users } = await api(`/api/admin/users?limit=30&search=${encodeURIComponent(q)}`);
    list.innerHTML = users.length ? users.map(userCard).join('') : '<p class="muted">Никого не найдено.</p>';
  } catch (err) {
    fail(err);
  }
}

panels.users.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-user-action]');
  if (!button) return;
  const specId = button.closest('[data-spec]').dataset.spec;
  const action = button.dataset.userAction;
  try {
    if (action === 'delete') {
      if (!window.confirm('Удалить аккаунт навсегда? Это действие нельзя отменить.')) return;
      await api(`/api/admin/user/${encodeURIComponent(specId)}`, { method: 'DELETE' });
      say('Аккаунт удалён.');
    } else if (action === 'ban') {
      const reason = window.prompt('Причина бана (необязательно):', '');
      if (reason === null) return;
      await api('/api/admin/ban', { method: 'POST', body: { specId, reason } });
      say('Пользователь заблокирован.');
    } else if (action === 'warn') {
      const result = await api('/api/admin/warn', { method: 'POST', body: { specId } });
      if (result.escalated) say(`Выдан 3-й варн. Решение передано создателям.`);
      else if (result.warns >= 3) say(`Выдан 3-й варн: роль админа снята, удалено записей ДЗ: ${result.removedCount || 0}.`);
      else say(`Варн выдан. Сейчас варнов: ${result.warns}.`);
    } else {
      const messages = {
        demote: 'Пользователь понижен до ученика.',
        promote: 'Пользователь назначен админом.',
        unban: 'Пользователь разблокирован.',
        'reset-warns': 'Варны сброшены.',
        'admin-unban': 'Запрет на роль админа снят.',
      };
      await api(`/api/admin/${action}`, { method: 'POST', body: { specId } });
      say(messages[action]);
    }
    await searchUsers();
  } catch (err) {
    fail(err);
  }
});

// ---------- Жалобы ----------

async function renderReports() {
  panels.reports.innerHTML = '<p class="muted">Загрузка...</p>';
  const { reports } = await api('/api/creator/reports');
  panels.reports.innerHTML = reports.length
    ? reports
        .map(
          ({ report, fromUser, onAdmin }) => `<article class="card" data-report="${escapeHtml(report._id)}">
        <h3>Жалоба на ${escapeHtml(onAdmin?.firstName || 'удалённого админа')} ${report.escalatedToCreator ? '<span class="badge warn">эскалирована</span>' : ''}</h3>
        <p class="small muted">От: ${escapeHtml(fromUser?.firstName || '—')} · класс: ${escapeHtml(classLabel(report.classKey))} · ${escapeHtml(formatDateTime(report.createdAt))} · варны админа: ${onAdmin?.warns ?? 0}</p>
        <p class="hw-text">${escapeHtml(report.text)}</p>
        <div class="row">
          <button type="button" data-report-action="warn">Выдать варн</button>
          <button type="button" class="secondary" data-report-action="reject">Отклонить</button>
          <button type="button" class="secondary" data-report-action="demote">Понизить до участника</button>
          ${me.role === 'moderator' ? '<button type="button" class="secondary" data-report-action="escalate">Эскалировать создателю</button>' : ''}
        </div></article>`,
        )
        .join('')
    : '<div class="card muted">Открытых жалоб нет.</div>';
}

panels.reports.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-report-action]');
  if (!button) return;
  const reportId = button.closest('[data-report]').dataset.report;
  const action = button.dataset.reportAction;
  button.disabled = true;
  try {
    const result = await api('/api/creator/report/resolve', { method: 'POST', body: { reportId, action } });
    const messages = {
      warn: result.escalated ? 'Выдан 3-й варн, решение передано создателям.' : `Варн выдан. Сейчас варнов: ${result.warns ?? 0}.`,
      reject: 'Жалоба отклонена.',
      demote: 'Админ понижен до участника.',
      escalate: 'Жалоба передана создателям.',
    };
    say(messages[action]);
    await renderReports();
  } catch (err) {
    button.disabled = false;
    fail(err);
  }
});

// ---------- Рассылка ----------

function renderBroadcast() {
  const options = Object.entries(AUDIENCE_TITLES)
    .map(([value, title]) => `<option value="${value}">${escapeHtml(title)}</option>`)
    .join('');
  panels.broadcast.innerHTML = `<div class="card"><h2>Рассылка любой группе</h2>
    <form id="any-broadcast" class="stack" novalidate>
      <div class="grid two">
        <div class="field"><label for="bc-audience">Аудитория</label><select id="bc-audience">${options}</select></div>
        <div class="field"><label for="bc-value">Значение</label><select id="bc-value" disabled><option value="">—</option></select></div>
      </div>
      <div class="field"><label for="bc-text">Текст</label><textarea id="bc-text" maxlength="3500" required></textarea></div>
      <button type="submit">Отправить</button>
    </form></div>`;
  const audience = document.getElementById('bc-audience');
  const valueSelect = document.getElementById('bc-value');
  audience.addEventListener('change', async () => {
    if (audience.value === 'all') {
      valueSelect.innerHTML = '<option value="">—</option>';
      valueSelect.disabled = true;
      return;
    }
    try {
      const { values } = await api(`/api/admin/audience-values?audience=${audience.value}`);
      valueSelect.innerHTML = values.length
        ? values
            .map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(audience.value === 'class' ? classLabel(v) : capitalize(v))}</option>`)
            .join('')
        : '<option value="">Нет значений</option>';
      valueSelect.disabled = values.length === 0;
    } catch (err) {
      fail(err);
    }
  });
  document.getElementById('any-broadcast').addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = document.getElementById('bc-text').value.trim();
    if (!text) {
      say(errorMessage({ code: 'invalid_text' }), 'error');
      return;
    }
    if (audience.value !== 'all' && !valueSelect.value) {
      say(errorMessage({ code: 'audience_value_required' }), 'error');
      return;
    }
    if (!window.confirm('Отправить рассылку?')) return;
    const button = event.target.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      const result = await api('/api/admin/broadcast', {
        method: 'POST',
        body: { text, audience: audience.value, audienceValue: valueSelect.value },
      });
      say(result.queued ? `Рассылка запущена: ${result.recipients} получателей. Итог придёт в Telegram.` : `Доставлено: ${result.sent}, не доставлено: ${result.failed}.`);
      event.target.reset();
      valueSelect.disabled = true;
    } catch (err) {
      fail(err);
    } finally {
      button.disabled = false;
    }
  });
}

// ---------- Вкладки ----------

const loaded = new Set();

async function openTab(name) {
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  Object.entries(panels).forEach(([key, panel]) => panel.classList.toggle('hidden', key !== name));
  showAlert(alertBox, '');
  try {
    if (name === 'news') await renderNews();
    else if (name === 'users' && !loaded.has('users')) renderUsersPanel();
    else if (name === 'reports') await renderReports();
    else if (name === 'broadcast' && !loaded.has('broadcast')) renderBroadcast();
    loaded.add(name);
  } catch (err) {
    fail(err);
  }
}

for (const tab of tabs) tab.addEventListener('click', () => openTab(tab.dataset.tab));

async function init() {
  me = await requireUser(['creator', 'moderator']);
  if (!me) return;
  try {
    await initClassPanel();
  } catch (err) {
    fail(err);
  }
}

init();
