// КлассныйБот — общие функции сайта.
// Никаких innerHTML с пользовательскими данными: только createElement/textContent.

const ERROR_TEXTS = {
  unauthorized: 'Нужно войти в аккаунт.',
  forbidden: 'Недостаточно прав для этого действия.',
  forbidden_origin: 'Запрос отклонён. Обнови страницу и попробуй снова.',
  not_found: 'Не найдено.',
  missing_fields: 'Заполни все поля.',
  unknown_city: 'Такой город не поддерживается.',
  invalid_school: 'Проверь название школы.',
  invalid_class: 'Проверь класс: например, 7А.',
  link_failed: 'Не удалось создать ссылку. Попробуй ещё раз.',
  missing_spec_id: 'Введи спец-ID.',
  too_many_requests: 'Слишком много попыток, подожди 15 минут.',
  too_many_attempts: 'Слишком много попыток, подожди 15 минут.',
  pending: 'Аккаунт не активирован. Заверши регистрацию в боте.',
  no_telegram: 'Аккаунт не привязан к Telegram. Открой бота и привяжи аккаунт.',
  telegram_unavailable: 'Telegram временно недоступен. Попробуй позже.',
  invalid_code: 'Код должен состоять из 6 цифр.',
  invalid: 'Неверный код. Проверь цифры.',
  expired: 'Срок действия кода истёк. Получи новый.',
  used: 'Код уже использован. Получи новый.',
  bad_request: 'Неверные данные запроса.',
  bad_photo: 'Не удалось прочитать фото. Выбери картинку заново.',
  bad_subject: 'Проверь название предмета.',
  bad_target: 'Выбери, кому отправить рассылку.',
  bad_text: 'Текст рассылки пустой или слишком длинный.',
  missing_value: 'Выбери город, школу или класс.',
  bad_audience: 'Выбери аудиторию новости.',
  missing_audience_value: 'Укажи город, школу или класс для новости.',
  already_resolved: 'Жалоба уже рассмотрена.',
  admin_not_found: 'Админ из жалобы не найден.',
  stale: 'ДЗ уже обновилось. Обновляю список.',
  internal_error: 'Ошибка на сервере. Попробуй позже.',
  network: 'Не удалось связаться с сервером. Проверь интернет и попробуй снова.',
};

const STATUS_TEXTS = {
  400: 'Неверные данные запроса.',
  401: 'Нужно войти в аккаунт.',
  403: 'Недостаточно прав для этого действия.',
  404: 'Не найдено.',
  409: 'Данные уже изменились. Обнови страницу.',
  429: 'Слишком много попыток, подожди 15 минут.',
  500: 'Ошибка на сервере. Попробуй позже.',
  502: 'Сервис временно недоступен. Попробуй позже.',
  503: 'Сервис временно недоступен. Попробуй позже.',
};

export class ApiError extends Error {
  constructor(message, status = 0, code = '') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

export function apiErrorMessage(code, status = 0) {
  if (code && ERROR_TEXTS[code]) return ERROR_TEXTS[code];
  if (status && STATUS_TEXTS[status]) return STATUS_TEXTS[status];
  return 'Что-то пошло не так. Попробуй ещё раз.';
}

function redirectToLogin() {
  if (window.location.pathname === '/login') return;
  window.location.assign('/login');
}

// fetch к API: cookie сессии, JSON, русские ошибки, редирект на /login при 401.
export async function api(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  const init = {
    method,
    credentials: 'same-origin',
    headers,
    cache: 'no-store',
  };

  if (options.body !== undefined && options.body !== null) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(options.body);
  }

  let response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(ERROR_TEXTS.network, 0, 'network');
  }

  const raw = await response.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch {
      data = null;
    }
  }

  if (response.status === 401) {
    if (!options.noRedirect) redirectToLogin();
    throw new ApiError(apiErrorMessage('unauthorized', 401), 401, 'unauthorized');
  }

  if (!response.ok) {
    const code = data && typeof data.error === 'string' ? data.error : '';
    throw new ApiError(apiErrorMessage(code, response.status), response.status, code);
  }

  return data || {};
}

// Текущий пользователь или null. Не редиректит: на публичных страницах это норма.
export async function getMe() {
  let response;
  try {
    response = await fetch('/api/auth/me', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  try {
    const data = await response.json();
    return data && data.user ? data.user : null;
  } catch {
    return null;
  }
}

export function hasBotUsername() {
  return Boolean(cleanBotUsername());
}

function cleanBotUsername() {
  if (typeof window === 'undefined') return '';
  const raw = window.__BOT_USERNAME__;
  if (!raw) return '';
  return String(raw).trim().replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '');
}

// Ссылка на бота: ник берём из window.__BOT_USERNAME__, иначе просто t.me.
export function getBotLink() {
  const username = cleanBotUsername();
  return username ? `https://t.me/${encodeURIComponent(username)}` : 'https://t.me';
}

export function botLinkLabel() {
  return hasBotUsername() ? 'Открыть в Telegram' : 'Бот в Telegram';
}

function makeLink(href, text, className) {
  const link = document.createElement('a');
  link.href = href;
  link.textContent = text;
  if (className) link.className = className;
  return link;
}

function isActivePath(href) {
  const path = window.location.pathname;
  if (href === '/') return path === '/';
  return path === href || path.startsWith(`${href}/`);
}

// Шапка сайта. Ссылки зависят от роли: admin видит «Админ», creator — ещё и «Создатель».
export function renderHeader(user) {
  const target = document.getElementById('site-header');
  if (!target) return;

  const brand = makeLink('/', '', 'brand');
  const icon = document.createElement('span');
  icon.className = 'brand-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '📚';
  const brandText = document.createElement('span');
  brandText.textContent = 'КлассныйБот';
  brand.append(icon, brandText);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'nav-toggle';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'site-nav');
  toggle.textContent = 'Меню';
  toggle.addEventListener('click', () => {
    const nav = document.getElementById('site-nav');
    if (!nav) return;
    const open = nav.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
  });

  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  nav.id = 'site-nav';
  nav.setAttribute('aria-label', 'Основная навигация');

  const links = [
    ['/', 'Главная'],
    ['/news', 'Новости'],
    ['/help', 'Помощь'],
  ];

  const isAdmin = user && (user.role === 'admin' || user.role === 'creator');
  const isCreator = user && user.role === 'creator';

  if (user) {
    links.push(['/app', 'Кабинет']);
    if (isAdmin) links.push(['/admin', 'Админ']);
    if (isCreator) links.push(['/creator', 'Создатель']);
  }

  for (const [href, text] of links) {
    const link = makeLink(href, text, 'nav-link');
    if (isActivePath(href)) {
      link.classList.add('is-active');
      link.setAttribute('aria-current', 'page');
    }
    nav.append(link);
  }

  const actions = document.createElement('div');
  actions.className = 'nav-actions';

  if (user) {
    const botLink = makeLink(getBotLink(), botLinkLabel(), 'btn btn-ghost btn-small');
    botLink.target = '_blank';
    botLink.rel = 'noopener noreferrer';
    actions.append(botLink);

    const logout = document.createElement('button');
    logout.type = 'button';
    logout.className = 'btn btn-secondary btn-small';
    logout.textContent = 'Выйти';
    logout.addEventListener('click', async () => {
      logout.disabled = true;
      try {
        await api('/api/auth/logout', { method: 'POST' });
      } catch {
        // Даже если сессия уже истекла — уходим на главную.
      }
      window.location.assign('/');
    });
    actions.append(logout);
  } else {
    actions.append(makeLink('/login', 'Войти', 'btn btn-ghost btn-small'));
    actions.append(makeLink('/register', 'Регистрация', 'btn btn-small'));
  }

  nav.append(actions);
  target.replaceChildren(brand, toggle, nav);
}

function parseDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const fromNumber = new Date(value);
    return Number.isNaN(fromNumber.getTime()) ? null : fromNumber;
  }
  if (typeof value !== 'string') return null;

  const text = value.trim();
  if (!text) return null;

  // Дата без времени: считаем её локальной, чтобы не съезжать на день назад.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split('-').map(Number);
    return new Date(year, month - 1, day, 12, 0, 0);
  }

  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

// «27 октября» или «27 октября 2027», с временем — «27 октября, 14:05».
export function fmtDate(value, withTime = false) {
  const date = parseDate(value);
  if (!date) return '';

  const options = { day: 'numeric', month: 'long' };
  if (date.getFullYear() !== new Date().getFullYear()) options.year = 'numeric';
  if (withTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }

  try {
    return new Intl.DateTimeFormat('ru-RU', options).format(date);
  } catch {
    return date.toLocaleDateString('ru-RU');
  }
}

let toastTimer = null;

export function toast(message) {
  if (!message) return;

  let element = document.querySelector('.toast');
  if (!element) {
    element = document.createElement('div');
    element.className = 'toast';
    element.setAttribute('role', 'status');
    element.setAttribute('aria-live', 'polite');
    document.body.append(element);
  }

  element.textContent = String(message);
  requestAnimationFrame(() => element.classList.add('is-visible'));

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => element.classList.remove('is-visible'), 3400);
}

// Копирование с запасным вариантом для старых браузеров и http.
export async function copyText(value) {
  const text = String(value ?? '');

  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Пробуем запасной способ ниже.
    }
  }

  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.top = '-1000px';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  area.remove();

  if (!copied) throw new Error('Не удалось скопировать. Выдели текст вручную.');
  return true;
}
