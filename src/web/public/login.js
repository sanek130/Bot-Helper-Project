import { api, escapeHtml, errorMessage, showAlert, capitalize } from './common.js';
import { initPublicNav } from './auth.js';
import { mountTgVerify } from './tgverify.js';

const SPEC_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ROLE_LABELS = { user: 'Ученик', admin: 'Админ класса', moderator: 'Модератор', creator: 'Создатель' };
const specForm = document.getElementById('spec-form');
const codeForm = document.getElementById('code-form');
const specInput = document.getElementById('spec-id');
const codeInput = document.getElementById('code');
const alertBox = document.getElementById('login-alert');
const tgVerifyBox = document.getElementById('tg-verify');
const accountsBox = document.getElementById('tg-accounts');
const params = new URLSearchParams(window.location.search);
let specId = '';
let tgState = null;

// Разрешены только относительные пути, чтобы ?next= нельзя было использовать для перехода на чужой сайт.
function nextUrl() {
  const next = params.get('next') || '/app';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/app';
}

function setMode(mode) {
  document.querySelectorAll('[data-mode]').forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  document.getElementById('mode-tg').classList.toggle('hidden', mode !== 'tg');
  document.getElementById('mode-spec').classList.toggle('hidden', mode !== 'spec');
  showAlert(alertBox, '');
}

function accountTitle(account) {
  const school = capitalize(account.school) || 'Школа не указана';
  return `${school}, ${account.class}`;
}

function accountButtons(account) {
  if (account.banned) return '<span class="badge warn">Заблокирован</span>';
  if (account.linked || !tgState.hasBound) {
    return `<button type="button" data-enter="${escapeHtml(account.specId)}">Войти</button>`;
  }
  return `<button type="button" data-enter="${escapeHtml(account.specId)}">Войти</button>
    <button type="button" class="secondary" data-enter="${escapeHtml(account.specId)}" data-main="1">Войти и сделать основным в Telegram</button>`;
}

function renderAccounts() {
  tgVerifyBox.classList.add('hidden');
  accountsBox.classList.remove('hidden');
  const items = tgState.accounts
    .map(
      (account) => `
      <div class="account-item">
        <div>
          <h3>${escapeHtml(accountTitle(account))}</h3>
          <p class="muted small" style="margin:4px 0 0">${escapeHtml(account.city)}${account.firstName ? ` · ${escapeHtml(account.firstName)}` : ''}</p>
        </div>
        <div class="account-meta">
          <span class="badge">${escapeHtml(ROLE_LABELS[account.role] || account.role)}</span>
          ${account.linked ? '<span class="badge ok">Основной в боте · полный доступ</span>' : '<span class="badge">Не основной</span>'}
          ${tgState.current === account.specId ? '<span class="badge ok">Ты сейчас в нём</span>' : ''}
        </div>
        <div class="row">${accountButtons(account)}</div>
      </div>`,
    )
    .join('');
  accountsBox.innerHTML = `
    <p class="muted small" style="margin-top:0">Telegram ID <code>${escapeHtml(tgState.tgId)}</code> подтверждён.</p>
    ${
      tgState.accounts.length
        ? `<h2 style="margin:0">Твои аккаунты</h2>
          <p class="muted small">«Основной» — аккаунт, который открывается в боте. Если войти в другой аккаунт без отметки «сделать основным», в боте ничего не поменяется, но фото к ДЗ и уведомления в нём будут недоступны.</p>
          <div class="account-list">${items}</div>`
        : '<p>К этому Telegram ещё нет аккаунтов. Создай новый — он сразу будет привязан и получит полный доступ.</p>'
    }
    <div class="row">
      <a class="btn ${tgState.accounts.length ? 'secondary' : ''}" href="/register">Создать новый аккаунт</a>
      <button type="button" class="secondary" data-action="forget">Другой Telegram ID</button>
    </div>`;
}

async function onVerified(data) {
  tgState = data;
  const next = nextUrl();
  // Со страницы регистрации пришли только за подтверждением — сразу возвращаем обратно.
  if (next === '/register') {
    window.location.href = next;
    return;
  }
  renderAccounts();
}

function mountVerify() {
  accountsBox.classList.add('hidden');
  tgVerifyBox.classList.remove('hidden');
  mountTgVerify(tgVerifyBox, { onVerified });
}

accountsBox.addEventListener('click', async (event) => {
  const enter = event.target.closest('[data-enter]');
  if (enter) {
    enter.disabled = true;
    try {
      await api('/api/auth/tg/enter', {
        method: 'POST',
        allow401: true,
        body: { specId: enter.dataset.enter, makeMain: enter.dataset.main === '1' },
      });
      window.location.href = nextUrl() === '/register' ? '/app' : nextUrl();
      return;
    } catch (err) {
      if (err.code === 'tg_not_verified') {
        tgState = null;
        mountVerify();
      }
      showAlert(alertBox, errorMessage(err), 'error');
    } finally {
      enter.disabled = false;
    }
    return;
  }
  if (event.target.closest('[data-action="forget"]')) {
    await api('/api/auth/tg/forget', { method: 'POST', allow401: true }).catch(() => null);
    tgState = null;
    showAlert(alertBox, '');
    mountVerify();
  }
});

async function requestCode() {
  await api('/api/auth/start', { method: 'POST', body: { specId }, allow401: true });
  specForm.classList.add('hidden');
  codeForm.classList.remove('hidden');
  codeInput.value = '';
  codeInput.focus();
  showAlert(alertBox, 'Код отправлен в Telegram. Он действует 5 минут.', 'success');
}

specForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  specId = specInput.value.trim().toLowerCase();
  if (!SPEC_ID_RE.test(specId)) {
    showAlert(alertBox, errorMessage({ code: 'invalid_spec_id' }), 'error');
    return;
  }
  const button = specForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await requestCode();
  } catch (err) {
    showAlert(alertBox, err.data?.message || errorMessage(err), 'error');
  } finally {
    button.disabled = false;
  }
});

codeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const code = codeInput.value.trim();
  if (!/^\d{6}$/.test(code)) {
    showAlert(alertBox, 'Введи 6 цифр из сообщения бота.', 'error');
    return;
  }
  const button = codeForm.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await api('/api/auth/verify', { method: 'POST', body: { specId, code }, allow401: true });
    window.location.href = nextUrl();
  } catch (err) {
    showAlert(alertBox, errorMessage(err), 'error');
  } finally {
    button.disabled = false;
  }
});

document.getElementById('back-btn').addEventListener('click', () => {
  codeForm.classList.add('hidden');
  specForm.classList.remove('hidden');
  showAlert(alertBox, '');
  specInput.focus();
});

document.getElementById('resend-btn').addEventListener('click', async () => {
  try {
    await requestCode();
  } catch (err) {
    showAlert(alertBox, errorMessage(err), 'error');
  }
});

document.querySelectorAll('[data-mode]').forEach((tab) => {
  tab.addEventListener('click', () => setMode(tab.dataset.mode));
});

async function tryLinkToken() {
  const token = params.get('link');
  if (!token) return false;
  try {
    await api('/api/auth/link', { method: 'POST', body: { token }, allow401: true });
    window.location.href = '/app';
  } catch (err) {
    showAlert(alertBox, errorMessage(err), 'error');
  }
  return true;
}

async function init() {
  initPublicNav();
  const next = nextUrl();
  const note = document.getElementById('next-note');
  if (params.get('next') && next.startsWith('/app')) {
    showAlert(note, 'Чтобы открыть кабинет, войди в аккаунт. Если аккаунта ещё нет — зарегистрируйся.');
  } else if (next === '/register') {
    showAlert(note, 'Подтверди Telegram ID и вернёшься к регистрации. Аккаунт заработает сразу, без перехода в бота.');
  }
  if (params.get('spec')) {
    specInput.value = params.get('spec');
    setMode('spec');
  } else {
    setMode(params.get('mode') === 'spec' ? 'spec' : 'tg');
  }
  mountVerify();
  if (await tryLinkToken()) return;
  try {
    const status = await api('/api/auth/tg/status', { allow401: true });
    if (status.verified && next !== '/register') {
      tgState = status;
      renderAccounts();
    }
  } catch {
    // Без статуса просто показываем форму ввода ID.
  }
}

init();
