import { api, errorMessage, showAlert } from './common.js';
import { initPublicNav } from './auth.js';

const SPEC_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const specForm = document.getElementById('spec-form');
const codeForm = document.getElementById('code-form');
const specInput = document.getElementById('spec-id');
const codeInput = document.getElementById('code');
const alertBox = document.getElementById('login-alert');
const params = new URLSearchParams(window.location.search);
let specId = '';

// Разрешены только относительные пути, чтобы ?next= нельзя было использовать для перехода на чужой сайт.
function nextUrl() {
  const next = params.get('next') || '/app';
  return next.startsWith('/') && !next.startsWith('//') ? next : '/app';
}

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

async function tryLinkToken() {
  const token = params.get('link');
  if (!token) return;
  try {
    await api('/api/auth/link', { method: 'POST', body: { token }, allow401: true });
    window.location.href = '/app';
  } catch (err) {
    showAlert(alertBox, errorMessage(err), 'error');
  }
}

if (params.get('spec')) specInput.value = params.get('spec');
initPublicNav();
tryLinkToken();
