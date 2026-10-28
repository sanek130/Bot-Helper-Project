// Вход: номер телефона или спец-ID + код из Telegram, либо быстрый вход через Telegram/Google.
import { api, getMe, renderHeader, toast } from './common.js';
import { mountGoogleButton, mountTelegramWidget, readTelegramRedirect, savePendingProvider } from './providers.js';

const card = document.getElementById('login-card');

const state = {
  step: 1,
  method: 'phone',
  specId: '',
  phone: '',
};

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function button(text, className, onClick) {
  const node = el('button', className || 'btn', text);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

function field(labelText, control, hintText) {
  const wrap = el('div', 'field');
  const label = el('label', null, labelText);
  const id = control.id || `login-field-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName)) label.htmlFor = id;
  wrap.append(label, control);
  if (hintText) wrap.append(el('span', 'hint', hintText));
  return wrap;
}

function errorBox(message) {
  const box = el('div', 'error-box');
  box.setAttribute('role', 'alert');
  box.textContent = message;
  return box;
}

// Для входа важны свои формулировки: «Не найдено» тут мало помогает.
function loginErrorMessage(error) {
  switch (error.code) {
    case 'not_found':
      return state.method === 'phone' ? 'Аккаунт не найден. Проверь номер' : 'Аккаунт не найден. Проверь спец-ID';
    case 'pending':
      return 'Аккаунт не активирован. Заверши регистрацию в боте';
    case 'no_telegram':
      return 'Аккаунт не привязан к Telegram. Открой бота и привяжи аккаунт.';
    default:
      return error.message || 'Что-то пошло не так. Попробуй ещё раз.';
  }
}

function stepBadge() {
  return el('span', 'badge badge-accent', `Шаг ${state.step} из 2`);
}

// Ссылка на активацию: показываем, если аккаунт ещё pending.
async function activationHelper(specId) {
  const box = el('div', 'info-box');
  box.append(el('div', null, 'Получаю свежую ссылку для активации…'));

  try {
    const data = await api(`/api/auth/pending?specId=${encodeURIComponent(specId)}`);

    if (data.status === 'active') {
      box.className = 'ok-box';
      box.replaceChildren(el('div', null, 'Аккаунт уже активен. Попробуй войти ещё раз.'));
      return box;
    }

    if (data.activationLink) {
      box.replaceChildren();
      box.append(el('div', null, 'Открой бота и подтверди регистрацию:'));
      const link = el('a', 'btn btn-small', 'Открыть в Telegram');
      link.href = data.activationLink;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.marginTop = '8px';
      box.append(link);
      return box;
    }

    box.replaceChildren(el('div', null, 'Открой бота в Telegram и заверши регистрацию там.'));
    return box;
  } catch (error) {
    box.className = 'error-box';
    box.replaceChildren(el('div', null, error.message || 'Не удалось получить ссылку.'));
    return box;
  }
}

function identityBody() {
  return state.method === 'phone' ? { phone: state.phone } : { specId: state.specId };
}

function methodSwitch(onChange) {
  const choice = el('div', 'choice');
  const options = [
    { value: 'phone', title: 'По номеру телефона' },
    { value: 'specId', title: 'По спец-ID' },
  ];
  for (const option of options) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'login-method';
    input.value = option.value;
    input.checked = state.method === option.value;
    input.addEventListener('change', () => onChange(option.value));
    label.append(input, el('span', null, option.title));
    choice.append(label);
  }
  return choice;
}

async function loginWithProvider(body, errorHolder) {
  try {
    const data = await api('/api/auth/provider', { method: 'POST', body, noRedirect: true });
    if (data.registered) {
      window.location.assign('/app');
      return;
    }
    // Аккаунта ещё нет: регистрация продолжит с этим способом входа
    savePendingProvider(body);
    window.location.assign('/register');
  } catch (error) {
    const box = errorBox(loginErrorMessage(error));
    if (errorHolder) errorHolder.replaceChildren(box);
    else card.prepend(box);
  }
}

function quickLogin(errorHolder) {
  const wrap = el('div', 'stack');
  const google = el('div', 'provider-slot');
  const telegram = el('div', 'provider-slot');
  wrap.append(el('div', 'divider', 'или быстрый вход'), telegram, google);

  const hasTelegram = mountTelegramWidget(telegram, '/login');
  if (!hasTelegram) telegram.remove();
  mountGoogleButton(google, (credential) => loginWithProvider({ googleCredential: credential }, errorHolder))
    .then((ok) => { if (!ok) google.remove(); if (!ok && !hasTelegram) wrap.remove(); });

  return wrap;
}

function renderStepOne() {
  const form = el('form', 'form');
  form.noValidate = true;

  const head = el('div', 'card-head');
  const headText = el('div');
  headText.append(el('h2', null, 'Как войти?'), el('p', 'card-sub', 'Код для входа придёт в Telegram — пароль не нужен.'));
  head.append(headText, stepBadge());
  form.append(head);

  form.append(field('Способ', methodSwitch((value) => {
    state.method = value;
    render();
  })));

  const input = document.createElement('input');
  input.type = state.method === 'phone' ? 'tel' : 'text';
  input.value = state.method === 'phone' ? state.phone : state.specId;
  input.placeholder = state.method === 'phone' ? '+7 999 123-45-67' : 'Например: 6f1c2a9e-…';
  input.autocomplete = state.method === 'phone' ? 'tel' : 'username';
  input.spellcheck = false;
  input.maxLength = 64;

  const hint = state.method === 'phone'
    ? 'Номер должен быть добавлен в боте: «Профиль» → «Добавить номер».'
    : 'Спец-ID выдаётся при регистрации и есть в профиле бота.';
  form.append(field(state.method === 'phone' ? 'Номер телефона' : 'Твой спец-ID', input, hint));

  const errorHolder = el('div');
  const submit = button('Получить код', 'btn btn-block', async () => {
    const value = input.value.trim();
    if (!value) {
      toast(state.method === 'phone' ? 'Введи номер телефона' : 'Введи спец-ID');
      input.focus();
      return;
    }

    if (state.method === 'phone') state.phone = value;
    else state.specId = value;
    submit.disabled = true;
    submit.textContent = 'Проверяю…';
    errorHolder.replaceChildren();

    try {
      await api('/api/auth/login', { method: 'POST', body: identityBody(), noRedirect: true });
      state.step = 2;
      render();
      toast('Код отправлен в Telegram');
    } catch (error) {
      errorHolder.replaceChildren(errorBox(loginErrorMessage(error)));

      if (error.code === 'pending' && state.method === 'specId') {
        errorHolder.append(await activationHelper(value));
      } else if (error.code === 'no_telegram') {
        const note = el('div', 'note');
        note.textContent = 'Похоже, аккаунт создан через Google. Войди кнопкой Google ниже.';
        errorHolder.append(note);
      }

      submit.disabled = false;
      submit.textContent = 'Получить код';
    }
  });

  form.append(errorHolder, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit.click();
  });

  form.append(quickLogin(errorHolder));

  card.replaceChildren(form);
  input.focus();
}

function digitsOnly(value) {
  return String(value).replace(/\D/g, '').slice(0, 6);
}

function renderStepTwo() {
  const form = el('form', 'form');
  form.noValidate = true;

  const head = el('div', 'card-head');
  const headText = el('div');
  headText.append(el('h2', null, 'Код из Telegram'), el('p', 'card-sub', 'Код действует 5 минут. Не сообщай его никому.'));
  head.append(headText, stepBadge());
  form.append(head);

  const account = el('div', 'note');
  account.append(
    el('span', 'muted', state.method === 'phone' ? 'Номер: ' : 'Спец-ID: '),
    el('span', 'mono', state.method === 'phone' ? state.phone : state.specId)
  );
  form.append(account);

  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.autocomplete = 'one-time-code';
  input.placeholder = '000000';
  input.maxLength = 6;
  input.pattern = '\\d{6}';
  input.style.letterSpacing = '0.35em';
  input.style.fontSize = '1.25rem';
  input.style.textAlign = 'center';

  input.addEventListener('input', () => {
    input.value = digitsOnly(input.value);
  });

  form.append(field('Шесть цифр', input, 'Если код не пришёл, проверь Telegram и запроси новый.'));

  const errorHolder = el('div');

  const submit = button('Войти', 'btn btn-block', async () => {
    const code = digitsOnly(input.value);
    if (code.length !== 6) {
      errorHolder.replaceChildren(errorBox('Код должен состоять из 6 цифр.'));
      input.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Вхожу…';
    errorHolder.replaceChildren();

    try {
      await api('/api/auth/verify', { method: 'POST', body: { ...identityBody(), code }, noRedirect: true });
      window.location.assign('/app');
    } catch (error) {
      errorHolder.replaceChildren(errorBox(loginErrorMessage(error)));
      if (['expired', 'used', 'invalid'].includes(error.code)) {
        input.value = '';
        input.focus();
      }
      submit.disabled = false;
      submit.textContent = 'Войти';
    }
  });

  form.append(errorHolder, submit);

  const actions = el('div', 'actions');
  const back = button('Изменить данные', 'btn btn-ghost btn-small', () => {
    state.step = 1;
    render();
  });

  const resend = button('Отправить код заново', 'btn btn-secondary btn-small', async () => {
    resend.disabled = true;
    resend.textContent = 'Отправляю…';
    try {
      await api('/api/auth/login', { method: 'POST', body: identityBody(), noRedirect: true });
      toast('Новый код отправлен в Telegram');
      errorHolder.replaceChildren();
      input.value = '';
      input.focus();
    } catch (error) {
      errorHolder.replaceChildren(errorBox(loginErrorMessage(error)));
    } finally {
      resend.disabled = false;
      resend.textContent = 'Отправить код заново';
    }
  });

  actions.append(back, resend);
  form.append(actions);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit.click();
  });

  card.replaceChildren(form);
  input.focus();
}

function render() {
  if (state.step === 1) renderStepOne();
  else renderStepTwo();
}

async function init() {
  const user = await getMe();
  renderHeader(user);

  if (user) {
    window.location.replace('/app');
    return;
  }

  render();

  const telegramAuth = readTelegramRedirect();
  if (telegramAuth) await loginWithProvider({ telegramAuth });
}

init();
