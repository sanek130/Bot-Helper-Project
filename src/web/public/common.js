const TZ = 'Europe/Moscow';
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const MAX_IMAGE_SIDE = 2048;

export const ERROR_MESSAGES = {
  unauthorized: 'Нужно войти в аккаунт.',
  forbidden: 'У тебя нет прав на это действие.',
  invalid_ban_target: 'Нужен Telegram ID (только цифры) или юзернейм.',
  banned: 'Твой аккаунт заблокирован. Можно написать в поддержку.',
  admin_banned: 'У тебя запрет на роль админа.',
  origin_mismatch: 'Запрос отклонён: открой сайт по основному адресу.',
  too_many_requests: 'Слишком много запросов. Подожди несколько минут.',
  invalid_spec_id: 'Проверь спец-ID: он выглядит как 8-4-4-4-12 символов.',
  not_found_or_pending: 'Аккаунт не найден или регистрация не завершена в боте.',
  no_telegram: 'Заверши регистрацию в боте, чтобы получать коды входа.',
  telegram_unavailable: 'Не удалось отправить код в Telegram. Проверь, что бот не заблокирован.',
  invalid_code: 'Неверный код.',
  too_many_attempts: 'Слишком много попыток. Попробуй через 15 минут.',
  expired: 'Код истёк. Запроси новый.',
  invalid_or_expired: 'Ссылка недействительна или устарела.',
  invalid_city: 'Выбери город из списка.',
  invalid_school: 'Выбери школу из списка.',
  invalid_letter: 'Выбери букву класса.',
  invalid_number: 'Выбери номер класса от 4 до 11.',
  invalid_date: 'Неверная дата.',
  invalid_subject: 'Название предмета: от 1 до 60 символов.',
  text_too_long: 'Текст слишком длинный.',
  invalid_photos: 'Можно прикрепить не больше 10 фото.',
  empty_task: 'Добавь текст задания или фото.',
  no_class: 'Класс не выбран.',
  forbidden_class: 'Ты можешь работать только со своим классом.',
  invalid_class: 'Неверный класс.',
  subject_not_found: 'Запись не найдена.',
  same_day: 'Выбери другую дату.',
  day_empty: 'На этот день нет записей.',
  telegram_required: 'Чтобы загружать фото, привяжи Telegram к аккаунту.',
  file_too_large: 'Файл слишком большой.',
  unsupported_type: 'Поддерживаются только JPEG, PNG и WEBP.',
  invalid_image: 'Не удалось прочитать изображение.',
  upload_failed: 'Не удалось загрузить фото.',
  payload_too_large: 'Файл слишком большой.',
  invalid_text: 'Проверь длину текста.',
  invalid_audience: 'Выбери аудиторию.',
  audience_value_required: 'Укажи значение аудитории.',
  too_many_messages: 'Ты отправил слишком много сообщений без ответа. Подожди ответа поддержки.',
  ticket_not_found: 'Тикет не найден или уже закрыт.',
  report_closed: 'Жалоба уже обработана.',
  user_not_found: 'Пользователь не найден.',
  invalid_title: 'Заголовок: от 1 до 200 символов.',
  invalid_body: 'Текст новости: от 1 до 5000 символов.',
  not_found: 'Не найдено.',
  escalate_only_moderator: 'Эскалировать может только модератор.',
  invalid_tg_id: 'Telegram ID — это только цифры, от 5 до 15. Узнать его можно командой /id в боте.',
  bot_not_started: 'Бот не может тебе написать. Открой бота, нажми «Старт» и проверь, что ID введён верно.',
  code_cooldown: 'Код уже отправлен. Новый можно запросить через минуту.',
  tg_not_verified: 'Подтверждение Telegram устарело. Введи Telegram ID ещё раз.',
  tg_already_linked: 'Этот аккаунт уже привязан к другому Telegram.',
  tg_has_account: 'К этому Telegram уже привязан другой аккаунт.',
  internal: 'Что-то пошло не так. Попробуй ещё раз.',
  network: 'Нет связи с сервером. Проверь интернет.',
};

export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class ApiError extends Error {
  constructor(code, status, data) {
    super(code);
    this.code = code;
    this.status = status;
    this.data = data;
  }
}

export async function api(path, options = {}) {
  const { method = 'GET', body, allow401 = false } = options;
  const init = { method, credentials: 'same-origin', headers: { Accept: 'application/json' } };
  if (body !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError('network', 0, null);
  }
  let data = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (response.status === 401 && !allow401) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
    throw new ApiError('unauthorized', 401, data);
  }
  if (!response.ok) throw new ApiError(data?.error || 'internal', response.status, data);
  return data;
}

export function errorMessage(err) {
  return ERROR_MESSAGES[err?.code] || ERROR_MESSAGES.internal;
}

export function toDateKey(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  return parts;
}

export function addDaysKey(dateKey, days) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function formatDate(dateKey) {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  if (!y || !m || !d) return String(dateKey ?? '');
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${String(d).padStart(2, '0')}.${String(m).padStart(2, '0')}, ${weekday}`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: TZ,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(date)
    .replace(',', '');
}

export function truncate(text, maxLen) {
  const value = String(text ?? '');
  if (value.length <= maxLen) return value;
  return `${value.slice(0, Math.max(0, maxLen - 3))}...`;
}

export async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(String(text));
    return true;
  } catch {
    const area = document.createElement('textarea');
    area.value = String(text);
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

export function showAlert(container, text, type = 'info') {
  if (!container) return;
  container.innerHTML = text ? `<div class="alert ${type === 'info' ? '' : type}">${escapeHtml(text)}</div>` : '';
}

export function capitalize(text) {
  const value = String(text ?? '');
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : '';
}

export function classLabel(classKey) {
  const [school, ...rest] = String(classKey ?? '').split('::');
  return `${capitalize(school)}, ${rest.join('::')}`;
}

// Фото уменьшается в браузере до 2048 px по большей стороне и сжимается в JPEG,
// чтобы запрос с base64 укладывался в лимит тела 8 МБ.
export function imageToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) {
      reject(new ApiError('unsupported_type', 400, null));
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ApiError('invalid_image', 400, null));
    };
    img.src = url;
  });
}

export function photosHtml(photoIds) {
  if (!Array.isArray(photoIds) || photoIds.length === 0) return '';
  const items = photoIds
    .map((id) => {
      const src = `/api/files/${encodeURIComponent(id)}`;
      return `<a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="Фото к заданию" loading="lazy"></a>`;
    })
    .join('');
  return `<div class="photos">${items}</div>`;
}

export function botUsername() {
  return window.BOT_CONFIG?.username || '';
}
