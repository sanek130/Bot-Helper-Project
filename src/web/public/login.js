// Вход по спец-ID: сначала ID, затем шестизначный код из Telegram.
import { api, getMe, renderHeader, toast } from './common.js';

const card = document.getElementById('login-card');

const state = {
  step: 1,
  specId: '',
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
      return 'Аккаунт не найден. Проверь спец-ID';
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

function renderStepOne() {
  const form = el('form', 'form');
  form.noValidate = true;

  const head = el('div', 'card-head');
  const headText = el('div');
  headText.append(el('h2', null, 'Спец-ID'), el('p', 'card-sub', 'Его выдавали при регистрации. Он есть в профиле бота.'));
  head.append(headText, stepBadge());
  form.append(head);

  const input = document.createElement('input');
  input.type = 'text';
  input.value = state.specId;
  input.placeholder = 'Например: 6f1c2a9e-…';
  input.autocomplete = 'username';
  input.spellcheck = false;
  input.maxLength = 64;

  form.append(field('Твой спец-ID', input));

  const errorHolder = el('div');
  const submit = button('Продолжить', 'btn btn-block', async () => {
    const specId = input.value.trim();
    if (!specId) {
      toast('Введи спец-ID');
      input.focus();
      return;
    }

    state.specId = specId;
    submit.disabled = true;
    submit.textContent = 'Проверяю…';
    errorHolder.replaceChildren();

    try {
      await api('/api/auth/login', { method: 'POST', body: { specId } });
      state.step = 2;
      render();
      toast('Код отправлен в Telegram');
    } catch (error) {
      errorHolder.replaceChildren(errorBox(loginErrorMessage(error)));

      if (error.code === 'pending') {
        errorHolder.append(await activationHelper(specId));
      } else if (error.code === 'no_telegram') {
        const hint = el('div', 'note');
        hint.textContent = 'Похоже, аккаунт создан только на сайте. Привяжи Telegram в профиле после входа или зарегистрируйся заново.';
        errorHolder.append(hint);
      }

      submit.disabled = false;
      submit.textContent = 'Продолжить';
    }
  });

  form.append(errorHolder, submit);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    submit.click();
  });

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
  account.append(el('span', 'muted', 'Спец-ID: '), el('span', 'mono', state.specId));
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
      await api('/api/auth/verify', { method: 'POST', body: { specId: state.specId, code } });
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
  const back = button('Изменить спец-ID', 'btn btn-ghost btn-small', () => {
    state.step = 1;
    render();
  });

  const resend = button('Отправить код заново', 'btn btn-secondary btn-small', async () => {
    resend.disabled = true;
    resend.textContent = 'Отправляю…';
    try {
      await api('/api/auth/login', { method: 'POST', body: { specId: state.specId } });
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
}

init();
