// Вход через Google и виджет Telegram. Кнопки появляются, только если способ настроен.
const PENDING_KEY = 'pendingProvider';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      if (existing.dataset.loaded) resolve();
      else existing.addEventListener('load', () => resolve());
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = true;
    script.addEventListener('load', () => { script.dataset.loaded = '1'; resolve(); });
    script.addEventListener('error', () => reject(new Error('script_failed')));
    document.head.append(script);
  });
}

export function googleEnabled() {
  return Boolean(window.__GOOGLE_CLIENT_ID__);
}

export function telegramWidgetEnabled() {
  return Boolean(window.__BOT_USERNAME__) && window.location.protocol === 'https:';
}

export async function mountGoogleButton(container, onCredential, text = 'signin_with') {
  if (!googleEnabled()) return false;
  try {
    await loadScript('https://accounts.google.com/gsi/client');
    window.google.accounts.id.initialize({
      client_id: window.__GOOGLE_CLIENT_ID__,
      callback: (response) => onCredential(response.credential),
    });
    window.google.accounts.id.renderButton(container, { theme: 'outline', size: 'large', text, locale: 'ru', width: 280 });
    return true;
  } catch {
    return false;
  }
}

// Режим редиректа: виджет вернёт на authPath с параметрами id, hash и т.д.
// Telegram требует, чтобы домен сайта был указан у бота через /setdomain в BotFather.
export function mountTelegramWidget(container, authPath) {
  if (!telegramWidgetEnabled()) return false;
  const script = document.createElement('script');
  script.async = true;
  script.src = 'https://telegram.org/js/telegram-widget.js?22';
  script.dataset.telegramLogin = String(window.__BOT_USERNAME__).replace(/^@/, '');
  script.dataset.size = 'large';
  script.dataset.radius = '10';
  script.dataset.requestAccess = 'write';
  script.dataset.authUrl = `${window.location.origin}${authPath}`;
  container.append(script);
  return true;
}

// Параметры, с которыми виджет Telegram возвращает на страницу
export function readTelegramRedirect() {
  const params = new URLSearchParams(window.location.search);
  if (!params.get('id') || !params.get('hash')) return null;
  const data = {};
  for (const key of ['id', 'first_name', 'last_name', 'username', 'photo_url', 'auth_date', 'hash']) {
    if (params.get(key)) data[key] = params.get(key);
  }
  window.history.replaceState(null, '', window.location.pathname);
  return data;
}

export function savePendingProvider(value) {
  sessionStorage.setItem(PENDING_KEY, JSON.stringify(value));
}

export function takePendingProvider({ keep = false } = {}) {
  try {
    const value = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null');
    if (!keep) sessionStorage.removeItem(PENDING_KEY);
    return value;
  } catch {
    return null;
  }
}
