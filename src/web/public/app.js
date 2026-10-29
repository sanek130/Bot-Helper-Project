// Кабинет: ДЗ по дням, неделя, расписание, поиск и профиль.
import {
  api,
  copyText,
  fmtDate,
  getBotLink,
  getMe,
  hasBotUsername,
  renderHeader,
  toast,
} from './common.js';
import { googleEnabled, mountGoogleButton } from './providers.js';

const TABS = ['today', 'tomorrow', 'after', 'week', 'schedule', 'search', 'profile'];
const DAY_OFFSETS = { today: 0, tomorrow: 1, after: 2 };
const ROLE_LABELS = { user: 'Участник', admin: 'Админ', creator: 'Создатель' };

const state = {
  user: null,
  tab: 'today',
  weekOffset: 0,
};

let renderToken = 0;
const panel = document.getElementById('tab-panel');
const tablist = document.getElementById('app-tabs');

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

function loadingState(text = 'Загружаю') {
  return el('div', 'loading', text);
}

function emptyState(title, text) {
  const box = el('div', 'empty');
  box.append(el('strong', null, title));
  if (text) box.append(el('span', null, text));
  return box;
}

function dateKeyLocal(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function addDays(key, days) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + days);
  return dateKeyLocal(date);
}

function todayKey() {
  return dateKeyLocal(new Date());
}

function prettyDate(key) {
  const date = dateFromKey(key);
  if (Number.isNaN(date.getTime())) return '';
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      weekday: 'short',
      day: 'numeric',
      month: 'long',
    }).format(date);
  } catch {
    return fmtDate(key);
  }
}

function renderGreeting() {
  const user = state.user;
  if (!user) return;

  const name = user.firstName || (user.username ? `@${user.username}` : 'друг');
  document.getElementById('greeting-title').textContent = `Привет, ${name}!`;

  const parts = [];
  if (user.school) parts.push(user.school);
  if (user.class) parts.push(`${user.class} класс`);
  if (!parts.length && user.city) parts.push(user.city);

  document.getElementById('greeting-sub').textContent = parts.length
    ? `Твой класс: ${parts.join(', ')}`
    : 'Класс пока не указан.';

  const badge = document.getElementById('greeting-role');
  badge.textContent = ROLE_LABELS[user.role] || 'Участник';
  badge.className = 'badge';
  if (user.role === 'creator') badge.classList.add('badge-accent');
  else if (user.role === 'admin') badge.classList.add('badge-success');
}

function updateTabs() {
  for (const tab of tablist.querySelectorAll('.tab')) {
    const active = tab.dataset.tab === state.tab;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', active ? 'true' : 'false');
    tab.tabIndex = active ? 0 : -1;
  }
}

function copyDayButton(date) {
  return button('Скопировать ДЗ', 'btn btn-secondary btn-small', async (event) => {
    const node = event.currentTarget;
    const original = node.textContent;
    node.disabled = true;
    node.textContent = 'Копирую…';
    try {
      const data = await api(`/api/homework/copy?date=${encodeURIComponent(date)}`);
      await copyText(data.text || '');
      toast('ДЗ скопировано');
    } catch (error) {
      toast(error.message);
    } finally {
      node.disabled = false;
      node.textContent = original;
    }
  });
}

function paintCheck(node, done) {
  node.setAttribute('aria-pressed', done ? 'true' : 'false');
  node.replaceChildren(
    el('span', 'check-mark', done ? '✅' : '☐'),
    el('span', 'check-label', done ? 'Сделано' : 'Отметить')
  );
}

function makeCheckButton(date, item, onUpdate) {
  const node = button('', 'check');
  paintCheck(node, Boolean(item.done));

  node.addEventListener('click', async () => {
    node.disabled = true;
    const next = !item.done;
    try {
      const data = await api('/api/homework/check', {
        method: 'POST',
        body: { date, subject: item.subject, done: next },
      });
      item.done = Boolean(data.done);
      paintCheck(node, item.done);
      if (onUpdate) onUpdate(item);
    } catch (error) {
      if (error.code === 'stale') {
        toast(error.message);
        renderTab();
      } else {
        toast(error.message);
      }
    } finally {
      node.disabled = false;
    }
  });

  return node;
}

function photoBlock(item) {
  const photos = Array.isArray(item.photos) ? item.photos : [];
  if (!photos.length) return null;

  const foot = el('div', 'item-foot');
  const box = el('div', 'photos hidden');
  let loaded = false;

  const toggle = button(`Показать фото (${photos.length})`, 'btn btn-secondary btn-small');

  toggle.addEventListener('click', () => {
    const hidden = box.classList.toggle('hidden');

    if (!hidden && !loaded) {
      loaded = true;
      for (const fileId of photos) {
        const wrap = el('div', 'photo-wrap');
        const img = document.createElement('img');
        img.className = 'photo';
        img.loading = 'lazy';
        img.decoding = 'async';
        img.src = `/api/files/${encodeURIComponent(fileId)}`;
        img.alt = `Фото к заданию: ${item.subject}`;
        img.addEventListener('error', () => {
          img.replaceWith(el('div', 'empty', 'Не удалось загрузить фото.'));
        });
        wrap.append(img);
        box.append(wrap);
      }
    }

    toggle.textContent = hidden ? `Показать фото (${photos.length})` : 'Скрыть фото';
  });

  foot.append(toggle);
  return { foot, box };
}

function homeworkCard(date, item, withPhotos) {
  const card = el('article', 'card item-card');

  const head = el('div', 'item-head');
  head.append(
    el('span', 'item-icon', item.icon || '📘'),
    el('h3', 'item-subject', item.subject || 'Предмет'),
    el('span', 'spacer'),
    makeCheckButton(date, item)
  );
  card.append(head);

  card.append(el('p', 'item-text', item.text || 'Ничего не задано.'));

  if (withPhotos) {
    const photos = photoBlock(item);
    if (photos) card.append(photos.foot, photos.box);
  }

  return card;
}

function dayHead(data) {
  const head = el('div', 'card-head');
  const info = el('div');
  const subParts = [];
  if (data.dateHuman) subParts.push(data.dateHuman);
  else if (data.date) subParts.push(prettyDate(data.date));
  if (data.classLabel) subParts.push(data.classLabel);

  info.append(
    el('h2', null, data.title || 'Домашнее задание'),
    el('p', 'card-sub', subParts.join(' · '))
  );

  const actions = el('div', 'actions');
  actions.append(copyDayButton(data.date));
  actions.append(button('Обновить', 'btn btn-ghost btn-small', () => renderTab()));

  head.append(info, actions);
  return head;
}

function dayContent(data) {
  const wrap = el('div', 'stack');
  wrap.append(dayHead(data));

  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) {
    wrap.append(emptyState('ДЗ нет', 'На этот день пока ничего не задали.'));
    return wrap;
  }

  const list = el('div', 'stack');
  for (const item of items) list.append(homeworkCard(data.date, item, true));
  wrap.append(list);
  return wrap;
}

async function buildDay(offset) {
  const date = addDays(todayKey(), offset);
  const data = await api(`/api/homework?date=${encodeURIComponent(date)}`);
  return dayContent(data);
}

async function buildWeek() {
  const data = await api(`/api/homework/week?offset=${state.weekOffset}`);
  const wrap = el('div', 'stack');

  const head = el('div', 'card-head');
  const info = el('div');
  info.append(
    el('h2', null, 'Неделя'),
    el('p', 'card-sub', `${fmtDate(data.start)} — ${fmtDate(data.end)}`)
  );

  const nav = el('div', 'actions');
  nav.append(button('← Прошлая', 'btn btn-secondary btn-small', () => {
    state.weekOffset -= 1;
    renderTab();
  }));
  nav.append(button('Эта неделя', 'btn btn-ghost btn-small', () => {
    state.weekOffset = 0;
    renderTab();
  }));
  nav.append(button('Следующая →', 'btn btn-secondary btn-small', () => {
    state.weekOffset += 1;
    renderTab();
  }));

  head.append(info, nav);
  wrap.append(head);

  const days = Array.isArray(data.days) ? data.days : [];
  if (!days.length) {
    wrap.append(emptyState('На этой неделе ДЗ нет', 'Выбери другую неделю или загляни позже.'));
    return wrap;
  }

  for (const day of days) {
    const card = el('section', 'card');
    const dayHeadNode = el('div', 'card-head');
    const dayInfo = el('div');
    const dayTitle = day.title || prettyDate(day.date);
    dayInfo.append(el('h3', null, dayTitle));

    if (['Сегодня', 'Завтра', 'Послезавтра'].includes(dayTitle)) {
      dayInfo.append(el('p', 'card-sub', prettyDate(day.date)));
    }

    dayHeadNode.append(dayInfo);
    card.append(dayHeadNode);

    const list = el('div', 'stack');
    for (const item of Array.isArray(day.items) ? day.items : []) {
      list.append(homeworkCard(day.date, item, false));
    }
    card.append(list);
    wrap.append(card);
  }

  return wrap;
}

function searchResultList(results) {
  if (!results.length) {
    return emptyState('Ничего не нашлось', 'Попробуй другое слово: например, «алгебра» или «параграф».');
  }

  const list = el('div', 'stack');
  for (const result of results) {
    const card = el('article', 'card item-card');
    const head = el('div', 'item-head');
    head.append(
      el('span', 'item-icon', result.icon || '📘'),
      el('h3', 'item-subject', result.subject || 'Предмет'),
      el('span', 'spacer'),
      el('span', 'badge', fmtDate(result.date))
    );
    card.append(head);
    card.append(el('p', 'item-text', result.text || 'Ничего не задано.'));
    card.append(el('p', 'small muted', result.title || prettyDate(result.date)));
    list.append(card);
  }
  return list;
}

function buildSearch() {
  const wrap = el('div', 'stack');

  const form = el('form', 'card form');
  form.noValidate = true;

  const head = el('div', 'card-head');
  const info = el('div');
  info.append(
    el('h2', null, 'Поиск по предмету'),
    el('p', 'card-sub', 'Ищу по названию предмета и тексту задания. Только будущие даты, до 10 результатов.')
  );
  head.append(info);
  form.append(head);

  const field = el('div', 'field');
  const label = el('label', null, 'Что ищем');
  const input = document.createElement('input');
  input.type = 'search';
  input.id = 'homework-search';
  input.placeholder = 'Алгебра или «параграф 12»';
  input.maxLength = 60;
  input.autocomplete = 'off';
  label.htmlFor = input.id;

  const hint = el('span', 'hint', 'Минимум 2 символа.');
  field.append(label, input, hint);
  form.append(field);

  const actions = el('div', 'actions');
  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn';
  submit.textContent = 'Найти';
  actions.append(submit);
  form.append(actions);

  const results = el('div', 'stack');
  results.append(emptyState('Начни с запроса', 'Например: «алгебра» или «параграф».'));

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const query = input.value.trim();

    if (query.length < 2) {
      results.replaceChildren(emptyState('Слишком короткий запрос', 'Введи хотя бы 2 символа.'));
      input.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Ищу…';
    results.replaceChildren(loadingState('Ищу'));

    try {
      const data = await api(`/api/homework/search?q=${encodeURIComponent(query)}`);
      results.replaceChildren(searchResultList(Array.isArray(data.results) ? data.results : []));
    } catch (error) {
      results.replaceChildren(emptyState('Ошибка поиска', error.message));
    } finally {
      submit.disabled = false;
      submit.textContent = 'Найти';
    }
  });

  wrap.append(form, results);
  return wrap;
}

async function buildSchedule() {
  const data = await api('/api/schedule');
  const wrap = el('div', 'stack');

  const head = el('div', 'card-head');
  const info = el('div');
  info.append(
    el('h2', null, 'Расписание'),
    el('p', 'card-sub', 'Фото расписания твоего класса.')
  );
  head.append(info);
  wrap.append(head);

  if (!data.hasSchedule) {
    wrap.append(emptyState('Расписание не загружено', 'Админ класса может добавить фото расписания на странице «Админ».'));
    return wrap;
  }

  const actions = el('div', 'actions');
  const open = el('a', 'btn btn-secondary btn-small', 'Открыть фото');
  open.href = data.photoUrl;
  open.target = '_blank';
  open.rel = 'noopener noreferrer';
  actions.append(open, button('Обновить', 'btn btn-ghost btn-small', () => renderTab()));

  const card = el('div', 'card');
  const img = document.createElement('img');
  img.className = 'photo';
  img.loading = 'lazy';
  img.alt = 'Расписание класса';
  img.src = data.photoUrl;
  img.addEventListener('error', () => {
    img.replaceWith(emptyState('Не удалось загрузить расписание', 'Попробуй обновить страницу.'));
  });
  card.append(img);

  if (data.updatedAt) {
    card.append(el('p', 'small muted', `Обновлено ${fmtDate(data.updatedAt, true)}`));
  }

  wrap.append(card);
  return wrap;
}

function factRow(name, value) {
  const row = el('div');
  row.append(el('dt', null, name), el('dd', null, value));
  return row;
}

function showTelegramLink(holder, link, noteText) {
  const box = el('div', 'info-box');
  box.append(el('div', null, noteText || 'Ссылка готова. Открой её в Telegram.'));

  if (typeof link === 'string' && link.startsWith('https://t.me/')) {
    const anchor = el('a', 'btn btn-small', 'Открыть в Telegram');
    anchor.href = link;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.style.marginTop = '8px';
    box.append(anchor);
  } else {
    box.append(el('div', 'small', 'Ссылку получить не удалось. Попробуй ещё раз.'));
  }

  holder.replaceChildren(box);
}

async function copySpecId(specId) {
  try {
    await copyText(specId);
    toast('Спец-ID скопирован');
  } catch (error) {
    toast(error.message);
  }
}

async function logout(allDevices) {
  if (allDevices && !window.confirm('Выйти со всех устройств? Все сессии завершатся.')) return;

  try {
    await api(allDevices ? '/api/auth/logout-all' : '/api/auth/logout', { method: 'POST' });
  } catch (error) {
    toast(error.message);
  }
  window.location.assign('/');
}

function buildProfile() {
  const user = state.user;
  const wrap = el('div', 'stack');

  const card = el('div', 'card');
  const head = el('div', 'card-head');
  const info = el('div');
  info.append(el('h2', null, 'Профиль'), el('p', 'card-sub', 'Данные аккаунта и вход в Telegram.'));
  head.append(info, el('span', 'badge badge-accent', ROLE_LABELS[user.role] || 'Участник'));
  card.append(head);

  const facts = el('dl', 'facts');
  facts.append(factRow('Имя', user.firstName || 'Не указано'));

  if (user.username) facts.append(factRow('Telegram', `@${user.username}`));
  else if (user.tgId) facts.append(factRow('Telegram', 'Привязан'));
  else facts.append(factRow('Telegram', 'Не привязан'));
  facts.append(factRow('Телефон', user.phone || 'Не указан — добавь в боте: «Профиль» → «Добавить номер»'));
  facts.append(factRow('Google', user.hasGoogle ? (user.email || 'Привязан') : 'Не привязан'));

  facts.append(factRow('Город', user.city || '—'));
  facts.append(factRow('Школа', user.school || '—'));
  facts.append(factRow('Класс', user.class ? `${user.class} класс` : '—'));
  facts.append(factRow('Роль', ROLE_LABELS[user.role] || 'Участник'));
  facts.append(factRow('Статус', user.status === 'active' ? 'Активен' : 'Не активирован'));

  if (user.role === 'admin' || user.role === 'creator') {
    facts.append(factRow('Предупреждения', `${user.warns || 0} из 3`));
  }

  const idRow = el('div');
  idRow.append(el('dt', null, 'Спец-ID'));
  const idValue = el('dd');
  const idLine = el('div', 'row');
  const idText = el('span', 'mono', user.specId);
  idLine.append(idText, button('Скопировать', 'btn btn-secondary btn-small', () => copySpecId(user.specId)));
  idValue.append(idLine);
  idRow.append(idValue);
  facts.append(idRow);

  card.append(facts);

  const linkHolder = el('div');
  card.append(linkHolder);

  const actions = el('div', 'actions');
  actions.style.marginTop = '16px';

  const attach = button('Привязать Telegram', 'btn btn-secondary', async () => {
    const original = attach.textContent;
    attach.disabled = true;
    attach.textContent = 'Готовлю ссылку…';
    try {
      const data = await api('/api/auth/link', { method: 'POST' });
      if (data.activationLink) {
        showTelegramLink(linkHolder, data.activationLink, 'Ссылка для привязки готова. Она действует 30 минут.');
        toast('Ссылка готова');
      }
    } catch (error) {
      toast(error.message);
    } finally {
      attach.disabled = false;
      attach.textContent = original;
    }
  });

  const bot = el('a', 'btn btn-secondary', hasBotUsername() ? 'Открыть в боте' : 'Бот в Telegram');
  bot.href = getBotLink();
  bot.target = '_blank';
  bot.rel = 'noopener noreferrer';

  const exit = button('Выйти', 'btn btn-danger-ghost', () => logout(false));
  const exitAll = button('Выйти со всех устройств', 'btn btn-danger-ghost', () => logout(true));

  if (user.tgId) attach.textContent = 'Перепривязать Telegram';
  const support = el('a', 'btn btn-secondary', 'Поддержка');
  support.href = '/support';
  actions.append(attach, bot, support, exit, exitAll);
  card.append(actions);

  if (!user.hasGoogle && googleEnabled()) {
    const googleSlot = el('div', 'provider-slot');
    googleSlot.style.marginTop = '12px';
    card.append(el('p', 'small muted', 'Привяжи Google, чтобы входить в один клик:'), googleSlot);
    mountGoogleButton(googleSlot, async (credential) => {
      try {
        const data = await api('/api/auth/link-provider', { method: 'POST', body: { googleCredential: credential } });
        state.user = data.user;
        toast('Google привязан');
        renderTab();
      } catch (error) {
        toast(error.message);
      }
    }, 'continue_with');
  }

  const note = el('p', 'small muted');
  note.textContent = 'Код для входа (по спец-ID или номеру) приходит в Telegram. Если Telegram не привязан — привяжи его здесь.';
  note.style.marginTop = '12px';
  card.append(note);

  wrap.append(card);
  return wrap;
}

function errorState(error) {
  const card = el('div', 'card');
  card.append(el('h2', null, error.status === 403 ? 'Нет доступа' : 'Не получилось загрузить'));
  card.append(el('p', 'muted', error.message || 'Попробуй ещё раз.'));
  card.append(button('Повторить', 'btn btn-secondary', () => renderTab()));
  return card;
}

async function buildTab(tab) {
  switch (tab) {
    case 'today':
    case 'tomorrow':
    case 'after':
      return buildDay(DAY_OFFSETS[tab]);
    case 'week':
      return buildWeek();
    case 'schedule':
      return buildSchedule();
    case 'search':
      return buildSearch();
    case 'profile':
      return buildProfile();
    default:
      return buildDay(0);
  }
}

async function renderTab() {
  const token = ++renderToken;
  panel.replaceChildren(loadingState());

  try {
    const content = await buildTab(state.tab);
    if (token !== renderToken) return;
    panel.replaceChildren(content);
  } catch (error) {
    if (token !== renderToken) return;
    panel.replaceChildren(errorState(error));
  }
}

async function setTab(tab) {
  if (!TABS.includes(tab)) tab = 'today';
  if (state.tab === tab) return;
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

async function init() {
  const user = await getMe();

  if (!user) {
    window.location.replace('/login');
    return;
  }

  state.user = user;
  renderHeader(user);
  renderGreeting();
  bindTabs();
  updateTabs();
  await renderTab();
}

init();
