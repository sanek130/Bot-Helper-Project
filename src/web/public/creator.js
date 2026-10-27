// Панель создателя: новости, пользователи, жалобы и рассылка.
import {
  api,
  fmtDate,
  getMe,
  renderHeader,
  toast,
} from './common.js';

const ROLE_LABELS = { user: 'Участник', admin: 'Админ', creator: 'Создатель' };
const AUDIENCE_LABELS = { all: 'Всем', city: 'Городу', school: 'Школе', class: 'Классу' };
const TABS = ['news', 'users', 'reports', 'broadcast'];

const state = {
  user: null,
  tab: 'news',
  editingNews: null,
  usersQuery: '',
  audiences: { cities: [], schools: [], classes: [] },
};

const panel = document.getElementById('creator-panel');
const tablist = document.getElementById('creator-tabs');

let panelToken = 0;
let newsToken = 0;
let usersToken = 0;
let reportsToken = 0;

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

function link(label, href, className) {
  const node = el('a', className || 'btn', label);
  node.href = href;
  return node;
}

function loadingState(text = 'Загружаю') {
  return el('div', 'loading', text);
}

function emptyState(title, text) {
  const box = el('div', 'empty');
  box.append(el('strong', null, title));
  if (text) box.append(el('span', null, text));
  return box;
}

function errorBox(message) {
  const box = el('div', 'error-box');
  box.setAttribute('role', 'alert');
  box.textContent = message;
  return box;
}

function okBox(message) {
  const box = el('div', 'ok-box');
  box.setAttribute('role', 'status');
  box.textContent = message;
  return box;
}

function warningBox(message) {
  const box = el('div', 'warn-box');
  box.setAttribute('role', 'status');
  box.textContent = message;
  return box;
}

function field(labelText, control, hintText) {
  const wrap = el('div', 'field');
  const label = el('label', null, labelText);
  const id = control.id || `creator-field-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName)) label.htmlFor = id;
  wrap.append(label, control);
  if (hintText) wrap.append(el('span', 'hint', hintText));
  return wrap;
}

function makeSelect(options, value, onChange) {
  const node = document.createElement('select');
  for (const item of options) {
    const option = document.createElement('option');
    option.value = item.value;
    option.textContent = item.label;
    if (item.value === value) option.selected = true;
    node.append(option);
  }
  if (onChange) node.addEventListener('change', () => onChange(node.value));
  return node;
}

function roleBadge(role) {
  const badge = el('span', 'badge', ROLE_LABELS[role] || 'Участник');
  if (role === 'creator') badge.classList.add('badge-accent');
  else if (role === 'admin') badge.classList.add('badge-success');
  return badge;
}

function humanClass(value) {
  return String(value || '').replace('::', ' · ');
}

function displayName(user) {
  if (!user) return 'Неизвестно';
  return user.firstName || (user.username ? `@${user.username}` : user.specId);
}

function audienceText(item) {
  if (item.audience === 'all') return 'Всем';
  if (item.audience === 'city') return `Город: ${item.audienceValue || '—'}`;
  if (item.audience === 'school') return `Школа: ${item.audienceValue || '—'}`;
  if (item.audience === 'class') return `Класс: ${humanClass(item.audienceValue) || '—'}`;
  return 'Всем';
}

function audienceOptions(target) {
  if (target === 'city') {
    return state.audiences.cities.map((value) => ({ value, label: value }));
  }
  if (target === 'school') {
    return state.audiences.schools.map((value) => ({ value, label: value }));
  }
  if (target === 'class') {
    return state.audiences.classes.map((value) => ({ value, label: humanClass(value) }));
  }
  return [];
}

async function loadAudiences() {
  const data = await api('/api/creator/audiences');
  state.audiences = {
    cities: Array.isArray(data.cities) ? data.cities : [],
    schools: Array.isArray(data.schools) ? data.schools : [],
    classes: Array.isArray(data.classes) ? data.classes : [],
  };
}

/* ---------- Новости ---------- */

function buildNewsTab() {
  const wrap = el('div', 'stack');
  wrap.append(buildNewsForm());

  const card = el('section', 'card');
  const head = el('div', 'card-head');
  const info = el('div');
  info.append(
    el('h2', null, 'Новости'),
    el('p', 'card-sub', 'Закреплённые показываются сверху. Видны тебе и твоим аудиториям.')
  );
  const list = el('div', 'stack');
  list.append(loadingState('Загружаю новости'));

  head.append(info, button('Обновить', 'btn btn-ghost btn-small', () => fillNewsList(list)));
  card.append(head, list);
  wrap.append(card);

  fillNewsList(list);
  return wrap;
}

function buildNewsForm() {
  const editing = state.editingNews;
  const card = el('section', 'card');
  card.id = 'news-form';

  const head = el('div', 'card-head');
  const info = el('div');
  info.append(
    el('h2', null, editing ? 'Редактировать новость' : 'Новая новость'),
    el('p', 'card-sub', editing ? 'Изменения появятся сразу после сохранения.' : 'Заголовок, текст и аудитория.')
  );
  head.append(info, el('span', editing ? 'badge badge-warning' : 'badge badge-accent', editing ? 'Редактирование' : 'Публикация'));
  card.append(head);

  const form = el('form', 'form');
  form.noValidate = true;

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.maxLength = 200;
  titleInput.value = editing ? editing.title || '' : '';
  titleInput.placeholder = 'Например: новый раздел с расписанием';
  form.append(field('Заголовок', titleInput));

  const bodyInput = document.createElement('textarea');
  bodyInput.maxLength = 5000;
  bodyInput.value = editing ? editing.body || '' : '';
  bodyInput.placeholder = 'Текст новости. Абзацы сохранятся.';
  form.append(field('Текст', bodyInput, 'До 5000 символов.'));

  const grid = el('div', 'form-grid two');

  const audienceSelect = makeSelect(
    [
      { value: 'all', label: 'Всем' },
      { value: 'city', label: 'Городу' },
      { value: 'school', label: 'Школе' },
      { value: 'class', label: 'Классу' },
    ],
    editing ? editing.audience || 'all' : 'all'
  );
  grid.append(field('Аудитория', audienceSelect, 'Кому показывать новость.'));

  const valueField = el('div', 'field hidden');
  const valueLabel = el('label', null, 'Город');
  const valueSelect = document.createElement('select');
  valueSelect.id = 'news-audience-value';
  valueLabel.htmlFor = valueSelect.id;
  valueField.append(valueLabel, valueSelect, el('span', 'hint', 'Список из зарегистрированных пользователей.'));
  grid.append(valueField);

  form.append(grid);

  const pinnedLabel = el('label', 'row');
  pinnedLabel.style.cursor = 'pointer';
  const pinnedInput = document.createElement('input');
  pinnedInput.type = 'checkbox';
  pinnedInput.checked = Boolean(editing && editing.pinned);
  pinnedLabel.append(pinnedInput, el('span', null, 'Закрепить новость'));
  form.append(pinnedLabel);

  const syncValue = (initialValue) => {
    const target = audienceSelect.value;

    if (target === 'all') {
      valueField.classList.add('hidden');
      return;
    }

    valueField.classList.remove('hidden');
    valueLabel.textContent = target === 'city' ? 'Город' : target === 'school' ? 'Школа' : 'Класс';

    const selected = initialValue === undefined ? valueSelect.value : initialValue;
    let options = audienceOptions(target);

    if (selected && !options.some((option) => option.value === selected)) {
      options = [{ value: selected, label: humanClass(selected) }, ...options];
    }

    valueSelect.replaceChildren();

    if (!options.length) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Нет данных';
      empty.disabled = true;
      empty.selected = true;
      valueSelect.append(empty);
      return;
    }

    for (const optionData of options) {
      const option = document.createElement('option');
      option.value = optionData.value;
      option.textContent = optionData.label;
      if (optionData.value === selected) option.selected = true;
      valueSelect.append(option);
    }

    if (selected && options.some((option) => option.value === selected)) {
      valueSelect.value = selected;
    }
  };

  audienceSelect.addEventListener('change', () => syncValue(''));
  syncValue(editing ? editing.audienceValue || '' : '');

  const result = el('div');
  const actions = el('div', 'actions');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn';
  submit.textContent = editing ? 'Сохранить изменения' : 'Опубликовать';

  actions.append(submit);

  if (editing) {
    actions.append(button('Отмена', 'btn btn-ghost', () => {
      state.editingNews = null;
      renderTab();
    }));
  }

  form.append(actions, result);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const title = titleInput.value.trim();
    const body = bodyInput.value.trim();
    const audience = audienceSelect.value;
    const audienceValue = audience === 'all' ? null : valueSelect.value;

    if (!title || !body) {
      result.replaceChildren(errorBox('Заполни заголовок и текст новости.'));
      return;
    }

    if (audience !== 'all' && !audienceValue) {
      result.replaceChildren(errorBox('Выбери город, школу или класс.'));
      return;
    }

    const payload = {
      title,
      body,
      audience,
      audienceValue,
      pinned: pinnedInput.checked,
    };

    submit.disabled = true;
    submit.textContent = 'Сохраняю…';
    result.replaceChildren();

    try {
      if (editing) {
        await api(`/api/news/${encodeURIComponent(editing.id)}`, { method: 'PUT', body: payload });
      } else {
        await api('/api/news', { method: 'POST', body: payload });
      }

      state.editingNews = null;
      toast(editing ? 'Новость обновлена' : 'Новость опубликована');
      await renderTab();
    } catch (error) {
      result.replaceChildren(errorBox(error.message));
      submit.disabled = false;
      submit.textContent = editing ? 'Сохранить изменения' : 'Опубликовать';
    }
  });

  card.append(form);
  return card;
}

function newsCard(item) {
  const card = el('article', 'card item-card');

  const meta = el('div', 'news-meta');
  if (item.pinned) meta.append(el('span', 'badge badge-accent', '📌 Закреплено'));
  meta.append(el('span', 'badge', audienceText(item)));
  if (item.publishedAt) meta.append(el('span', 'small muted', fmtDate(item.publishedAt, true)));
  card.append(meta);

  card.append(el('h3', null, item.title || 'Без названия'));
  card.append(el('p', 'news-body', item.body || ''));

  const actions = el('div', 'item-foot');

  const editButton = button('Редактировать', 'btn btn-secondary btn-small', async () => {
    state.editingNews = item;
    await renderTab();
    const formNode = document.getElementById('news-form');
    if (formNode) formNode.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  const pinButton = button(item.pinned ? 'Открепить' : 'Закрепить', 'btn btn-secondary btn-small', async () => {
    pinButton.disabled = true;
    try {
      await api(`/api/news/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        body: { pinned: !item.pinned },
      });
      toast(item.pinned ? 'Новость откреплена' : 'Новость закреплена');
      renderTab();
    } catch (error) {
      toast(error.message);
      pinButton.disabled = false;
    }
  });

  const deleteButton = button('Удалить', 'btn btn-danger-ghost btn-small', async () => {
    if (!window.confirm(`Удалить новость «${item.title || 'без названия'}»?`)) return;
    deleteButton.disabled = true;
    try {
      await api(`/api/news/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      if (state.editingNews && state.editingNews.id === item.id) state.editingNews = null;
      toast('Новость удалена');
      renderTab();
    } catch (error) {
      toast(error.message);
      deleteButton.disabled = false;
    }
  });

  actions.append(editButton, pinButton, deleteButton);
  card.append(actions);

  return card;
}

async function fillNewsList(container) {
  const token = ++newsToken;
  container.replaceChildren(loadingState('Загружаю новости'));

  try {
    const data = await api('/api/news');
    if (token !== newsToken || !container.isConnected) return;

    const items = Array.isArray(data.news) ? data.news : [];
    if (!items.length) {
      container.replaceChildren(emptyState('Новостей пока нет', 'Опубликуй первую новость формой выше.'));
      return;
    }

    container.replaceChildren(...items.map((item) => newsCard(item)));
  } catch (error) {
    if (token !== newsToken || !container.isConnected) return;
    container.replaceChildren(
      errorBox(error.message),
      button('Повторить', 'btn btn-secondary btn-small', () => fillNewsList(container))
    );
  }
}

/* ---------- Пользователи ---------- */

function buildUsersTab() {
  const wrap = el('div', 'stack');

  const searchCard = el('section', 'card');
  const head = el('div', 'card-head');
  const info = el('div');
  info.append(
    el('h2', null, 'Пользователи'),
    el('p', 'card-sub', 'Поиск по имени, @username, спец-ID, школе или классу.')
  );
  head.append(info);
  searchCard.append(head);

  const form = el('form', 'form');
  form.noValidate = true;

  const input = document.createElement('input');
  input.type = 'search';
  input.value = state.usersQuery;
  input.placeholder = 'Имя, @username или спец-ID';
  input.autocomplete = 'off';

  form.append(field('Кого ищем', input, 'Пустой запрос — последние зарегистрированные.'));

  const searchButton = document.createElement('button');
  searchButton.type = 'submit';
  searchButton.className = 'btn';
  searchButton.textContent = 'Найти';
  form.append(searchButton);

  searchCard.append(form);

  const listCard = el('section', 'card');
  const list = el('div', 'stack');
  list.append(loadingState('Загружаю пользователей'));
  listCard.append(list);

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.usersQuery = input.value.trim();
    refreshUsers(list, state.usersQuery);
  });

  wrap.append(searchCard, listCard);

  refreshUsers(list, state.usersQuery);

  return wrap;
}

function userCard(container, user) {
  const card = el('article', 'card item-card');
  const self = user.specId === state.user.specId;

  const head = el('div', 'item-head');
  head.append(el('h3', 'item-subject', displayName(user)), roleBadge(user.role));

  if (user.status === 'pending') head.append(el('span', 'badge badge-warning', 'Не активирован'));
  if (user.adminBanned) head.append(el('span', 'badge badge-danger', 'Без админки'));
  if (self) head.append(el('span', 'badge', 'Это ты'));
  head.append(el('span', 'spacer'));
  card.append(head);

  const idLine = el('p', 'small muted');
  idLine.append(el('span', null, 'Спец-ID: '), el('span', 'mono', user.specId));
  card.append(idLine);

  const where = [user.city, user.school, user.class ? `${user.class} класс` : '']
    .filter(Boolean)
    .join(' · ');
  card.append(el('p', 'small muted', where || 'Класс не указан'));

  const badges = el('div', 'row');
  badges.append(el('span', 'badge', `Варны: ${user.warns || 0}/3`));
  if (user.username) badges.append(el('span', 'badge', `@${user.username}`));
  if (user.registeredAt) badges.append(el('span', 'badge', `С ${fmtDate(user.registeredAt)}`));
  if (user.stats && user.stats.homeworkAdded) {
    badges.append(el('span', 'badge', `Добавил ДЗ: ${user.stats.homeworkAdded}`));
  }
  card.append(badges);

  const actions = el('div', 'item-foot');

  const runAction = async (node, path, method, successMessage, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    const original = node.textContent;
    node.disabled = true;
    node.textContent = '…';
    try {
      await api(path, { method });
      toast(successMessage);
      await refreshUsers(container, state.usersQuery);
    } catch (error) {
      toast(error.message);
      node.disabled = false;
      node.textContent = original;
    }
  };

  if (!self && user.role !== 'creator') {
    const warnButton = button('Варн', 'btn btn-secondary btn-small', () => {
      runAction(
        warnButton,
        `/api/creator/users/${encodeURIComponent(user.specId)}/warn`,
        'POST',
        'Предупреждение выдано',
        `Выдать предупреждение ${displayName(user)}?`
      );
    });
    actions.append(warnButton);
  }

  if (!self && user.role === 'admin') {
    const demoteButton = button('Понизить', 'btn btn-secondary btn-small', () => {
      runAction(
        demoteButton,
        `/api/creator/users/${encodeURIComponent(user.specId)}/demote`,
        'POST',
        'Понижен до участника',
        `Понизить ${displayName(user)} до участника?`
      );
    });
    actions.append(demoteButton);
  }

  if (!self && user.role === 'user') {
    const promoteButton = button('Повысить', 'btn btn-secondary btn-small', () => {
      runAction(
        promoteButton,
        `/api/creator/users/${encodeURIComponent(user.specId)}/promote`,
        'POST',
        'Повышен до админа',
        `Повысить ${displayName(user)} до админа?`
      );
    });
    actions.append(promoteButton);
  }

  if (!self) {
    const deleteButton = button('Удалить', 'btn btn-danger-ghost btn-small', () => {
      runAction(
        deleteButton,
        `/api/creator/users/${encodeURIComponent(user.specId)}`,
        'DELETE',
        'Аккаунт удалён',
        `Удалить аккаунт ${displayName(user)}? ДЗ класса останутся, аккаунт и сессии исчезнут.`
      );
    });
    actions.append(deleteButton);
  }

  if (actions.childElementCount) card.append(actions);
  return card;
}

async function refreshUsers(container, query) {
  const token = ++usersToken;
  container.replaceChildren(loadingState('Загружаю пользователей'));

  try {
    const data = await api(`/api/creator/users?q=${encodeURIComponent(query || '')}`);
    if (token !== usersToken || !container.isConnected) return;

    const users = Array.isArray(data.users) ? data.users : [];
    if (!users.length) {
      container.replaceChildren(emptyState('Никого не нашли', 'Попробуй другой запрос.'));
      return;
    }

    container.replaceChildren(...users.map((user) => userCard(container, user)));
  } catch (error) {
    if (token !== usersToken || !container.isConnected) return;
    container.replaceChildren(
      errorBox(error.message),
      button('Повторить', 'btn btn-secondary btn-small', () => refreshUsers(container, query))
    );
  }
}

/* ---------- Жалобы ---------- */

function buildReportsTab() {
  const card = el('section', 'card');

  const head = el('div', 'card-head');
  const info = el('div');
  info.append(
    el('h2', null, 'Жалобы'),
    el('p', 'card-sub', 'Открытые жалобы на админов классов.')
  );

  const list = el('div', 'stack');
  list.append(loadingState('Загружаю жалобы'));

  head.append(info, button('Обновить', 'btn btn-ghost btn-small', () => fillReports(list)));
  card.append(head, list);

  fillReports(list);
  return card;
}

function reportCard(container, report) {
  const card = el('article', 'card item-card');

  const head = el('div', 'item-head');
  head.append(el('h3', 'item-subject', 'Жалоба'), el('span', 'badge badge-warning', 'Открыта'));
  head.append(el('span', 'spacer'));
  if (report.createdAt) head.append(el('span', 'small muted', fmtDate(report.createdAt, true)));
  card.append(head);

  card.append(el('p', 'item-text', report.text || 'Без текста.'));

  const meta = [
    `От: ${report.from ? displayName(report.from) : 'неизвестно'}`,
    `На: ${report.onAdmin ? displayName(report.onAdmin) : 'неизвестно'}`,
    report.classKey ? `Класс: ${humanClass(report.classKey)}` : '',
  ].filter(Boolean).join(' · ');

  card.append(el('p', 'small muted', meta));

  const actions = el('div', 'item-foot');

  const runAction = async (node, action, successMessage, confirmText) => {
    if (confirmText && !window.confirm(confirmText)) return;
    const original = node.textContent;
    node.disabled = true;
    node.textContent = '…';
    try {
      await api(`/api/creator/reports/${encodeURIComponent(report.id)}/${action}`, { method: 'POST' });
      toast(successMessage);
      await fillReports(container);
    } catch (error) {
      toast(error.message);
      node.disabled = false;
      node.textContent = original;
    }
  };

  const warnButton = button('Варн', 'btn btn-secondary btn-small', () => {
    runAction(
      warnButton,
      'warn',
      'Варн выдан, жалоба закрыта',
      `Выдать варн админу ${report.onAdmin ? displayName(report.onAdmin) : ''}?`
    );
  });

  const demoteButton = button('Понизить', 'btn btn-secondary btn-small', () => {
    runAction(
      demoteButton,
      'demote',
      'Админ понижен, жалоба закрыта',
      `Понизить ${report.onAdmin ? displayName(report.onAdmin) : 'админа'} до участника?`
    );
  });

  const rejectButton = button('Отклонить', 'btn btn-ghost btn-small', () => {
    runAction(rejectButton, 'reject', 'Жалоба отклонена');
  });

  actions.append(warnButton, demoteButton, rejectButton);
  card.append(actions);

  return card;
}

async function fillReports(container) {
  const token = ++reportsToken;
  container.replaceChildren(loadingState('Загружаю жалобы'));

  try {
    const data = await api('/api/creator/reports?status=open');
    if (token !== reportsToken || !container.isConnected) return;

    const reports = Array.isArray(data.reports) ? data.reports : [];
    if (!reports.length) {
      container.replaceChildren(emptyState('Открытых жалоб нет', 'Это хорошая новость.'));
      return;
    }

    container.replaceChildren(...reports.map((report) => reportCard(container, report)));
  } catch (error) {
    if (token !== reportsToken || !container.isConnected) return;
    container.replaceChildren(
      errorBox(error.message),
      button('Повторить', 'btn btn-secondary btn-small', () => fillReports(container))
    );
  }
}

/* ---------- Рассылка ---------- */

function buildBroadcastTab() {
  const card = el('section', 'card');

  const head = el('div', 'card-head');
  const info = el('div');
  info.append(
    el('h2', null, 'Рассылка'),
    el('p', 'card-sub', 'Сообщение придёт в Telegram. Кому — выбираешь ниже.')
  );
  head.append(info);
  card.append(head);

  const form = el('form', 'form');
  form.noValidate = true;

  const grid = el('div', 'form-grid two');

  const targetSelect = makeSelect(
    [
      { value: 'all', label: 'Всем' },
      { value: 'city', label: 'Городу' },
      { value: 'school', label: 'Школе' },
      { value: 'class', label: 'Классу' },
    ],
    'all'
  );
  grid.append(field('Кому', targetSelect));

  const valueField = el('div', 'field hidden');
  const valueLabel = el('label', null, 'Город');
  const valueSelect = document.createElement('select');
  valueSelect.id = 'broadcast-value';
  valueLabel.htmlFor = valueSelect.id;
  valueField.append(valueLabel, valueSelect, el('span', 'hint', 'Список из зарегистрированных пользователей.'));
  grid.append(valueField);

  form.append(grid);

  const syncValue = () => {
    const target = targetSelect.value;

    if (target === 'all') {
      valueField.classList.add('hidden');
      return;
    }

    valueField.classList.remove('hidden');
    valueLabel.textContent = target === 'city' ? 'Город' : target === 'school' ? 'Школа' : 'Класс';

    const options = audienceOptions(target);
    valueSelect.replaceChildren();

    if (!options.length) {
      const empty = document.createElement('option');
      empty.value = '';
      empty.textContent = 'Нет данных';
      empty.disabled = true;
      empty.selected = true;
      valueSelect.append(empty);
      return;
    }

    for (const optionData of options) {
      const option = document.createElement('option');
      option.value = optionData.value;
      option.textContent = optionData.label;
      valueSelect.append(option);
    }
  };

  targetSelect.addEventListener('change', syncValue);
  syncValue();

  const textarea = document.createElement('textarea');
  textarea.maxLength = 4000;
  textarea.placeholder = 'Например: завтра в 18:00 обновление расписания.';
  textarea.id = 'broadcast-text';
  form.append(field('Текст сообщения', textarea, 'До 4000 символов.'));

  const counter = el('span', 'small muted', '0 / 4000');
  textarea.addEventListener('input', () => {
    counter.textContent = `${textarea.value.length} / 4000`;
  });

  const result = el('div');
  const actions = el('div', 'actions');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn';
  submit.textContent = 'Отправить';

  actions.append(submit, counter);
  form.append(actions, result);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const target = targetSelect.value;
    const value = target === 'all' ? '' : valueSelect.value;
    const text = textarea.value.trim();

    if (!text) {
      result.replaceChildren(errorBox('Напиши текст сообщения.'));
      textarea.focus();
      return;
    }

    if (target !== 'all' && !value) {
      result.replaceChildren(errorBox('Выбери город, школу или класс.'));
      return;
    }

    let who = 'всем пользователям';
    if (target === 'city') who = `городу «${value}»`;
    else if (target === 'school') who = `школе «${value}»`;
    else if (target === 'class') who = `классу «${humanClass(value)}»`;

    if (!window.confirm(`Отправить сообщение ${who}?`)) return;

    submit.disabled = true;
    submit.textContent = 'Отправляю…';
    result.replaceChildren();

    try {
      const data = await api('/api/creator/broadcast', {
        method: 'POST',
        body: { target, value, text },
      });

      const total = Number(data.total) || 0;
      const delivered = Number(data.delivered) || 0;
      const failed = Number(data.failed) || 0;

      result.append(okBox(`Отправлено ${delivered} из ${total}.`));
      if (failed > 0) {
        result.append(warningBox(`Не доставлено: ${failed}. Возможно, кто-то не запускал бота.`));
      }
      if (total === 0) {
        result.append(el('p', 'small muted', 'По этому фильтру пока нет получателей.'));
      }

      textarea.value = '';
      counter.textContent = '0 / 4000';
    } catch (error) {
      result.replaceChildren(errorBox(error.message));
    } finally {
      submit.disabled = false;
      submit.textContent = 'Отправить';
    }
  });

  card.append(form);
  return card;
}

/* ---------- Страница ---------- */

async function renderTab() {
  const token = ++panelToken;
  panel.replaceChildren(loadingState());

  try {
    let content;
    switch (state.tab) {
      case 'users':
        content = buildUsersTab();
        break;
      case 'reports':
        content = buildReportsTab();
        break;
      case 'broadcast':
        content = buildBroadcastTab();
        break;
      case 'news':
      default:
        content = buildNewsTab();
    }

    if (token !== panelToken) return;
    panel.replaceChildren(content);
  } catch (error) {
    if (token !== panelToken) return;
    panel.replaceChildren(errorBox(error.message), button('Повторить', 'btn btn-secondary', () => renderTab()));
  }
}

function updateTabs() {
  for (const tab of tablist.querySelectorAll('.tab')) {
    const active = tab.dataset.tab === state.tab;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    tab.tabIndex = active ? 0 : -1;
  }
}

async function setTab(tab) {
  if (!TABS.includes(tab)) tab = 'news';
  if (tab === state.tab) return;
  state.tab = tab;
  updateTabs();
  await renderTab();
}

function bindTabs() {
  tablist.addEventListener('click', (event) => {
    const tab = event.target.closest('.tab');
    if (!tab || !tablist.contains(tab)) return;
    setTab(tab.dataset.tab);
  });

  tablist.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;

    const tabs = [...tablist.querySelectorAll('.tab')];
    const index = tabs.indexOf(document.activeElement);
    if (index === -1) return;

    event.preventDefault();
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else next = tabs.length - 1;

    tabs[next].focus();
    setTab(tabs[next].dataset.tab);
  });
}

function renderDenied() {
  const card = el('div', 'card');
  card.append(el('h1', null, 'Нет доступа'));
  card.append(el('p', 'muted', 'Панель создателя доступна только создателю бота.'));

  const actions = el('div', 'actions');
  actions.append(link('В кабинет', '/app', 'btn btn-secondary'));
  if (state.user && (state.user.role === 'admin' || state.user.role === 'creator')) {
    actions.append(link('В админ-панель', '/admin', 'btn btn-secondary'));
  }
  actions.append(link('На главную', '/', 'btn btn-ghost'));
  card.append(actions);

  panel.replaceChildren(card);
}

async function init() {
  const user = await getMe();

  if (!user) {
    window.location.replace('/login');
    return;
  }

  state.user = user;
  renderHeader(user);

  if (user.role !== 'creator') {
    renderDenied();
    return;
  }

  try {
    await loadAudiences();
  } catch (error) {
    toast(`Не удалось загрузить аудитории: ${error.message}`);
  }

  bindTabs();
  updateTabs();
  await renderTab();
}

init();
