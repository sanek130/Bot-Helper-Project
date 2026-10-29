// Telegram Mini App: мини-версия кабинета. Вход по initData от Telegram, токен — в памяти.
const tg = window.Telegram?.WebApp;
const root = document.getElementById('root');
const tabsNav = document.getElementById('tabs');

const CITIES = ['Краснодар', 'Москва', 'Санкт-Петербург', 'Другой город'];
const LETTERS = 'АБВГДЕЖЗИКЛМНОПРСТУФХЦЧШЩЭЮЯ'.split('');
const NUMBERS = ['4', '5', '6', '7', '8', '9', '10', '11'];
const ROLES = { user: 'Участник', admin: 'Админ', creator: 'Создатель' };
const TABS = [
  ['day', '📅', 'ДЗ'],
  ['week', '🗓', 'Неделя'],
  ['schedule', '🕒', 'Расписание'],
  ['support', '💬', 'Помощь'],
  ['profile', '👤', 'Профиль'],
];

const state = { token: '', user: null, tab: 'day', dayOffset: 0 };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function btn(text, className, onClick) {
  const node = el('button', className, text);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function haptic(type = 'light') {
  try { tg?.HapticFeedback?.impactOccurred(type); } catch { /* старый клиент */ }
}

async function api(path, { method = 'GET', body, raw = false } = {}) {
  const headers = { Accept: 'application/json' };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' });
  if (raw) {
    if (!response.ok) throw new Error('Не удалось загрузить файл');
    return response.blob();
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(errorText(data.error, response.status));
    error.code = data.error;
    error.data = data;
    throw error;
  }
  return data;
}

function errorText(code, status) {
  const texts = {
    banned: 'Аккаунт заблокирован создателем.',
    invalid_telegram: 'Telegram не подтвердил вход. Закрой и открой приложение снова.',
    already_registered: 'Аккаунт уже есть. Закрой и открой приложение снова.',
    invalid_class: 'Проверь класс.',
    invalid_school: 'Проверь название школы.',
    unknown_city: 'Проверь город.',
    invalid_text: 'Напиши сообщение: от 3 до 2000 символов.',
    too_many: 'Подожди ответа поддержки.',
    too_many_requests: 'Слишком много попыток, подожди немного.',
  };
  return texts[code] || (status >= 500 ? 'Ошибка на сервере. Попробуй позже.' : 'Что-то пошло не так.');
}

function screen(...nodes) {
  root.replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

function messageScreen(title, text, actions = []) {
  const card = el('div', 'card center');
  card.append(el('h2', null, title), el('p', 'muted', text), ...actions);
  screen(card);
  tabsNav.classList.add('hidden');
}

function openSite(path = '/') {
  const url = `${window.location.origin}${path}`;
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

/* ---------- Регистрация ---------- */

function selectOf(options, placeholder) {
  const node = document.createElement('select');
  const empty = el('option', null, placeholder);
  empty.value = '';
  node.append(empty);
  for (const value of options) {
    const option = el('option', null, value);
    option.value = value;
    node.append(option);
  }
  return node;
}

function renderRegistration(profile) {
  const card = el('div', 'card');
  card.append(
    el('h1', null, `Привет${profile?.firstName ? `, ${profile.firstName}` : ''}! 👋`),
    el('p', 'muted', 'Укажи школу и класс — и сразу увидишь ДЗ. Аккаунт привяжется к этому Telegram.')
  );
  const city = selectOf(CITIES, 'Выбери город');
  const customCity = document.createElement('input');
  customCity.placeholder = 'Название города';
  customCity.className = 'hidden';
  city.addEventListener('change', () => customCity.classList.toggle('hidden', city.value !== 'Другой город'));
  const school = document.createElement('input');
  school.placeholder = 'Например: школа 5 или гимназия 1';
  school.maxLength = 80;
  const number = selectOf(NUMBERS, 'Номер');
  const letter = selectOf(LETTERS, 'Буква');
  const classRow = el('div', 'row');
  classRow.append(number, letter);
  const error = el('p', 'error');

  const submit = btn('Создать аккаунт', 'btn', async () => {
    const cityName = city.value === 'Другой город' ? customCity.value.trim() : city.value;
    if (!cityName || school.value.trim().length < 2 || !number.value || !letter.value) {
      error.textContent = 'Заполни город, школу и класс.';
      return;
    }
    submit.disabled = true;
    error.textContent = '';
    try {
      const data = await api('/api/auth/register', {
        method: 'POST',
        body: { city: cityName, school: school.value.trim(), class: `${number.value}${letter.value}`, telegramInitData: tg.initData },
      });
      state.token = data.token;
      state.user = data.user;
      tg?.HapticFeedback?.notificationOccurred('success');
      startApp();
    } catch (err) {
      error.textContent = err.message;
      submit.disabled = false;
    }
  });

  card.append(
    el('label', null, 'Город'), city, customCity,
    el('label', null, 'Школа'), school,
    el('label', null, 'Класс'), classRow,
    error, submit
  );
  screen(card);
}

/* ---------- ДЗ ---------- */

function taskRow(date, item) {
  const row = el('div', 'task');
  const check = btn(item.done ? '✓' : '', `check${item.done ? ' done' : ''}`, async () => {
    const done = !item.done;
    check.disabled = true;
    try {
      await api('/api/homework/check', { method: 'POST', body: { date, subject: item.subject, done } });
      item.done = done;
      check.classList.toggle('done', done);
      check.textContent = done ? '✓' : '';
      haptic();
    } catch (err) {
      tg?.showAlert?.(err.message);
    } finally {
      check.disabled = false;
    }
  });
  const body = el('div');
  body.append(el('div', 'subj', `${item.icon || '📘'} ${item.subject}`), el('div', 'txt', item.text || 'Без текста'));
  if (item.photoCount) body.append(el('div', 'muted', `📷 фото: ${item.photoCount} — открой в боте или на сайте`));
  row.append(check, body);
  return row;
}

async function renderDay() {
  const seg = el('div', 'seg');
  ['Сегодня', 'Завтра', 'Послезавтра'].forEach((label, offset) => {
    seg.append(btn(label, state.dayOffset === offset ? 'on' : '', () => { state.dayOffset = offset; render(); }));
  });
  const card = el('div', 'card');
  card.append(el('div', 'muted', 'Загружаю…'));
  screen(seg, card);

  const date = new Date();
  date.setDate(date.getDate() + state.dayOffset);
  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const data = await api(`/api/homework?date=${key}`);
  card.replaceChildren(el('h2', null, `${data.title || ''} · ${data.dateHuman || ''}`), el('div', 'muted', data.classLabel || ''));
  if (!data.items?.length) card.append(el('p', null, 'ДЗ нет. Отдыхай! 🎉'));
  for (const item of data.items || []) card.append(taskRow(data.date, item));
}

async function renderWeek() {
  const data = await api('/api/homework/week?offset=0');
  const nodes = [];
  if (!data.days?.length) {
    const card = el('div', 'card');
    card.append(el('p', null, 'На этой неделе ДЗ нет.'));
    nodes.push(card);
  }
  for (const day of data.days || []) {
    const card = el('div', 'card');
    card.append(el('h2', null, day.title));
    for (const item of day.items) card.append(taskRow(day.date, item));
    nodes.push(card);
  }
  screen(...nodes);
}

async function renderSchedule() {
  const card = el('div', 'card');
  card.append(el('h2', null, 'Расписание'));
  screen(card);
  const data = await api('/api/schedule');
  if (!data.hasSchedule) {
    card.append(el('p', 'muted', 'Расписание пока не добавлено. Админ класса может загрузить фото в боте.'));
    return;
  }
  const blob = await api(data.photoUrl, { raw: true });
  const img = el('img', 'schedule');
  img.alt = 'Расписание класса';
  img.src = URL.createObjectURL(blob);
  card.append(img);
}

/* ---------- Поддержка ---------- */

async function renderSupport() {
  const form = el('div', 'card');
  const area = document.createElement('textarea');
  area.rows = 4;
  area.maxLength = 2000;
  area.placeholder = 'Опиши вопрос или проблему';
  const status = el('p', 'muted');
  const send = btn('Отправить', 'btn', async () => {
    send.disabled = true;
    try {
      await api('/api/support', { method: 'POST', body: { text: area.value, source: 'tma' } });
      area.value = '';
      tg?.HapticFeedback?.notificationOccurred('success');
      await renderSupport();
    } catch (err) {
      status.textContent = err.message;
      send.disabled = false;
    }
  });
  form.append(el('h2', null, '💬 Поддержка'), el('p', 'muted', 'Ответ придёт в чат с ботом и появится здесь.'), area, status, send);

  const nodes = [form];
  const data = await api('/api/support');
  for (const ticket of data.tickets || []) {
    const card = el('div', 'card');
    card.append(el('div', 'muted', ticket.status === 'open' ? 'Открыто' : 'Закрыто'));
    for (const message of ticket.messages) {
      card.append(el('div', `bubble ${message.from}`, `${message.from === 'support' ? 'Поддержка: ' : ''}${message.text}`));
    }
    nodes.push(card);
  }
  if (state.user?.banned) nodes.unshift(bannedBanner());
  screen(...nodes);
}

/* ---------- Профиль ---------- */

function renderProfile() {
  const user = state.user;
  const card = el('div', 'card');
  const facts = el('dl', 'facts');
  const rows = [
    ['Имя', user.firstName || '—'],
    ['Школа', user.school || '—'],
    ['Класс', user.class || '—'],
    ['Роль', ROLES[user.role] || 'Участник'],
    ['Телефон', user.phone || 'не указан'],
    ['Спец-ID', user.specId],
  ];
  for (const [name, value] of rows) {
    const row = el('div');
    row.append(el('dt', null, name), el('dd', null, value));
    facts.append(row);
  }
  card.append(el('h2', null, '👤 Профиль'), facts);

  if (tg?.requestContact) {
    card.append(btn(user.phone ? 'Обновить номер телефона' : '📱 Добавить номер телефона', 'btn sec', () => {
      tg.requestContact((shared) => {
        if (shared) tg.showAlert('Номер отправлен боту. Теперь на сайт можно входить по номеру.');
      });
    }));
  }
  card.append(btn('🌐 Открыть сайт', 'btn sec', () => openSite('/app')));
  if (user.role === 'admin' || user.role === 'creator') {
    card.append(btn(user.role === 'creator' ? '👑 Панель создателя' : '🛠 Админ-панель', 'btn sec', () => openSite(user.role === 'creator' ? '/creator' : '/admin')));
  }
  screen(card);
}

/* ---------- Каркас ---------- */

const RENDERERS = { day: renderDay, week: renderWeek, schedule: renderSchedule, support: renderSupport, profile: renderProfile };

async function render() {
  for (const node of tabsNav.children) node.classList.toggle('on', node.dataset.tab === state.tab);
  try {
    await RENDERERS[state.tab]();
  } catch (err) {
    if (err.code === 'banned') {
      state.user = { ...state.user, banned: true, banReason: err.data?.reason || state.user?.banReason };
      startBannedApp();
      return;
    }
    const card = el('div', 'card');
    card.append(el('p', 'error', err.message), btn('Повторить', 'btn sec', render));
    screen(card);
  }
}

function bannedBanner() {
  const reason = state.user?.banReason ? `Причина: ${state.user.banReason}. ` : '';
  const banner = el('div', 'card');
  banner.append(el('h2', 'error', '⛔ Аккаунт заблокирован'), el('p', 'muted', `${reason}Если это ошибка, напиши в поддержку ниже.`));
  return banner;
}

// Забаненному доступна только поддержка — чтобы обжаловать бан
function startBannedApp() {
  state.tab = 'support';
  tabsNav.classList.add('hidden');
  const reason = state.user?.banReason ? `Причина: ${state.user.banReason}. ` : '';
  renderSupport().catch((err) => {
    messageScreen('⛔ Аккаунт заблокирован', `${reason}Напиши боту /support.`, []);
    console.error(err);
  });
}

function startApp() {
  if (state.user?.banned) {
    startBannedApp();
    return;
  }
  tabsNav.replaceChildren(...TABS.map(([key, icon, label]) => {
    const node = btn('', '', () => { state.tab = key; haptic(); render(); });
    node.dataset.tab = key;
    node.append(el('span', null, icon), document.createTextNode(label));
    return node;
  }));
  tabsNav.classList.remove('hidden');
  render();
}

async function init() {
  if (!tg?.initData) {
    messageScreen('Открой из Telegram', 'Мини-приложение работает внутри Telegram: открой бота и нажми «Приложение».', [
      btn('Открыть сайт', 'btn', () => openSite('/')),
    ]);
    return;
  }
  tg.ready();
  tg.expand();

  try {
    const data = await api('/api/auth/provider', { method: 'POST', body: { telegramInitData: tg.initData } });
    if (!data.registered) {
      renderRegistration(data.profile);
      return;
    }
    state.token = data.token;
    state.user = data.user;
    startApp();
  } catch (err) {
    if (err.code === 'banned') {
      const reason = err.data?.reason ? `Причина: ${err.data.reason}. ` : '';
      messageScreen('⛔ Аккаунт заблокирован', `${reason}Если это ошибка, напиши боту команду /support.`, [
        btn('Закрыть', 'btn', () => tg.close()),
      ]);
      return;
    }
    messageScreen('Не удалось войти', err.message, [btn('Повторить', 'btn', init)]);
  }
}

init();
