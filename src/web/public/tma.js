// Mini App в Telegram: вход по initData и сразу задания на три дня одним запросом.
// Нарочно без общего кода сайта (common.js, styles.css, шрифты), чтобы открывалось быстро.

const tg = window.Telegram?.WebApp;
const content = document.getElementById('tma-content');
const tabs = document.getElementById('tma-tabs');
const classLine = document.getElementById('tma-class');
const fullLink = document.getElementById('tma-full');

const state = { token: '', days: [], schedulePhotoId: null, tab: '1' };

const ERRORS = {
  not_registered: 'Этот Telegram ещё не зарегистрирован. Нажми /start в боте и пройди регистрацию.',
  banned: 'Аккаунт заблокирован. Можно написать в поддержку на сайте.',
  invalid_init_data: 'Не удалось проверить вход. Закрой и снова открой приложение из бота.',
  too_many_requests: 'Слишком много запросов. Подожди пару минут.',
  no_class: 'Класс не выбран. Выбери его в профиле бота.',
};

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}

async function api(path, options = {}) {
  const headers = { Accept: 'application/json' };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(path, {
    method: options.method || 'GET',
    headers,
    credentials: 'same-origin',
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `http_${res.status}`);
    err.code = data.error || `http_${res.status}`;
    throw err;
  }
  return data;
}

function showNote(title, text, actions = '') {
  tabs.classList.add('hidden');
  content.innerHTML = `<div class="tma-note"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p>${
    actions ? `<div class="tma-actions">${actions}</div>` : ''
  }</div>`;
}

function botLink() {
  const username = window.BOT_CONFIG?.username;
  return username ? `<a class="tma-btn" href="https://t.me/${encodeURIComponent(username)}?start=1">Открыть бота</a>` : '';
}

function capitalize(text) {
  const value = String(text || '');
  return value ? value[0].toUpperCase() + value.slice(1) : value;
}

function renderDay(day) {
  if (!day) return;
  const head = `<p class="tma-day">${escapeHtml(day.dayTitle)} · ${escapeHtml(day.dateKey.split('-').reverse().join('.'))}</p>`;
  if (!day.subjects.length) {
    content.innerHTML = `${head}<div class="tma-empty">На этот день заданий нет</div>`;
    return;
  }
  const items = day.subjects
    .map((item) => {
      const photos = (item.photoIds || [])
        .map((id) => {
          const url = `/api/files/${encodeURIComponent(id)}`;
          return `<a href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Фото к заданию" loading="lazy"></a>`;
        })
        .join('');
      return `<article class="tma-item${item.completed ? ' done' : ''}">
        <div>
          <p class="tma-subject">${escapeHtml(item.icon || '')} ${escapeHtml(capitalize(item.subjectName))}</p>
          ${item.text ? `<p class="tma-text">${escapeHtml(item.text)}</p>` : ''}
          ${photos ? `<div class="tma-photos">${photos}</div>` : ''}
        </div>
        <button type="button" class="tma-check" data-date="${escapeHtml(day.dateKey)}" data-hash="${escapeHtml(item.subjectHash)}"
          aria-pressed="${item.completed}" aria-label="Отметить как сделанное">${item.completed ? '✓' : ''}</button>
      </article>`;
    })
    .join('');
  content.innerHTML = `${head}<div class="tma-list">${items}</div>`;
}

function renderSchedule() {
  if (!state.schedulePhotoId) {
    content.innerHTML = '<div class="tma-empty">Расписание ещё не загружено</div>';
    return;
  }
  const url = `/api/files/${encodeURIComponent(state.schedulePhotoId)}`;
  content.innerHTML = `<a class="tma-schedule" href="${url}" target="_blank" rel="noopener"><img src="${url}" alt="Расписание класса"></a>`;
}

function render() {
  for (const btn of tabs.querySelectorAll('button')) btn.classList.toggle('active', btn.dataset.tab === state.tab);
  if (state.tab === 'schedule') renderSchedule();
  else renderDay(state.days[Number(state.tab)]);
}

tabs.addEventListener('click', (event) => {
  const btn = event.target.closest('button[data-tab]');
  if (!btn || btn.dataset.tab === state.tab) return;
  state.tab = btn.dataset.tab;
  tg?.HapticFeedback?.selectionChanged();
  render();
});

content.addEventListener('click', async (event) => {
  const btn = event.target.closest('.tma-check');
  if (!btn || btn.disabled) return;
  btn.disabled = true;
  try {
    const { completed } = await api('/api/homework/toggle', {
      method: 'POST',
      body: { dateKey: btn.dataset.date, subjectHash: btn.dataset.hash },
    });
    const day = state.days.find((d) => d.dateKey === btn.dataset.date);
    const item = day?.subjects.find((s) => s.subjectHash === btn.dataset.hash);
    if (item) item.completed = completed;
    tg?.HapticFeedback?.impactOccurred('light');
    render();
  } catch {
    btn.disabled = false;
    tg?.HapticFeedback?.notificationOccurred('error');
  }
});

async function start() {
  if (tg) {
    tg.ready();
    tg.expand?.();
    try {
      tg.setHeaderColor?.('bg_color');
      tg.setBackgroundColor?.('bg_color');
    } catch {
      // старые клиенты Telegram не поддерживают смену цветов
    }
  }

  if (!tg?.initData) {
    classLine.textContent = 'Открыто вне Telegram';
    showNote(
      'Открой из бота',
      'Эта страница работает внутри Telegram. В браузере можно войти по спец-ID.',
      '<a class="tma-btn" href="/login">Войти на сайте</a><a class="tma-btn secondary" href="/register">Регистрация</a>',
    );
    return;
  }

  try {
    const auth = await api('/api/auth/tma', { method: 'POST', body: { initData: tg.initData } });
    state.token = auth.token || '';
    const { user } = auth;
    classLine.textContent = [user.class && `${user.class} класс`, user.school].filter(Boolean).join(' · ') || 'Класс не выбран';
    // В приложениях Telegram cookie сессии уже выставлена, поэтому полная версия откроется без входа.
    fullLink.href = '/app';

    const data = await api('/api/homework/upcoming');
    state.days = data.days || [];
    state.schedulePhotoId = data.schedulePhotoId;
    // Если на завтра пусто, а сегодня есть задания — сразу показываем сегодня.
    if (!state.days[1]?.subjects.length && state.days[0]?.subjects.length) state.tab = '0';
    tabs.classList.remove('hidden');
    render();
  } catch (err) {
    classLine.textContent = '';
    const text = ERRORS[err.code] || 'Не удалось загрузить данные. Проверь интернет и попробуй ещё раз.';
    const actions = err.code === 'not_registered' ? botLink() : '<button class="tma-btn" type="button" id="tma-retry">Повторить</button>';
    showNote('Не получилось', text, actions);
    document.getElementById('tma-retry')?.addEventListener('click', () => {
      content.innerHTML = '<div class="tma-skeleton"></div><div class="tma-skeleton"></div>';
      start();
    });
  }
}

start();
