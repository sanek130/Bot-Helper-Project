import { api, escapeHtml, errorMessage, showAlert } from './common.js';

const TG_ID_RE = /^\d{5,15}$/;

export function botUrl(start = '') {
  const username = window.BOT_CONFIG?.username || '';
  return `https://t.me/${username}${start ? `?start=${start}` : ''}`;
}

// Двухшаговое подтверждение Telegram ID: ID → код из бота. После успеха сервер ставит отметку
// о подтверждении, а onVerified получает список аккаунтов этого Telegram.
export function mountTgVerify(root, { onVerified, submitLabel = 'Получить код' } = {}) {
  let tgId = '';
  root.innerHTML = `
    <form class="stack" data-tg="id-form" novalidate>
      <div class="field">
        <label for="tg-id-input">Твой Telegram ID</label>
        <input id="tg-id-input" inputmode="numeric" autocomplete="off" placeholder="Например, 123456789" maxlength="15" required>
      </div>
      <p class="muted small">Не знаешь свой ID? Напиши боту <a href="${escapeHtml(botUrl())}" target="_blank" rel="noopener">команду /id</a> — он пришлёт число. Это не пароль, его можно вводить спокойно.</p>
      <button type="submit">${escapeHtml(submitLabel)}</button>
    </form>
    <form class="stack hidden" data-tg="code-form" novalidate>
      <div class="field">
        <label for="tg-code-input">Код из бота</label>
        <input id="tg-code-input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="6 цифр" required>
      </div>
      <div class="row">
        <button type="submit">Подтвердить</button>
        <button type="button" class="secondary" data-tg="back">Другой ID</button>
        <button type="button" class="secondary" data-tg="resend">Отправить код ещё раз</button>
      </div>
    </form>
    <div data-tg="alert" role="status"></div>`;
  const idForm = root.querySelector('[data-tg="id-form"]');
  const codeForm = root.querySelector('[data-tg="code-form"]');
  const idInput = root.querySelector('#tg-id-input');
  const codeInput = root.querySelector('#tg-code-input');
  const alertBox = root.querySelector('[data-tg="alert"]');

  function showError(err) {
    if (err.code === 'bot_not_started') {
      alertBox.innerHTML = `<div class="alert error">${escapeHtml(errorMessage(err))} <a href="${escapeHtml(botUrl())}" target="_blank" rel="noopener">Открыть бота</a></div>`;
      return;
    }
    showAlert(alertBox, err.data?.message || errorMessage(err), 'error');
  }

  async function requestCode() {
    await api('/api/auth/tg/start', { method: 'POST', body: { tgId }, allow401: true });
    idForm.classList.add('hidden');
    codeForm.classList.remove('hidden');
    codeInput.value = '';
    codeInput.focus();
    showAlert(alertBox, 'Бот прислал код в Telegram. Он действует 5 минут.', 'success');
  }

  idForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    tgId = idInput.value.replace(/\s+/g, '');
    if (!TG_ID_RE.test(tgId)) {
      showError({ code: 'invalid_tg_id' });
      return;
    }
    const button = idForm.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
      await requestCode();
    } catch (err) {
      showError(err);
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
      const data = await api('/api/auth/tg/verify', { method: 'POST', body: { tgId, code }, allow401: true });
      showAlert(alertBox, '');
      await onVerified?.(data);
    } catch (err) {
      showError(err);
    } finally {
      button.disabled = false;
    }
  });

  root.querySelector('[data-tg="back"]').addEventListener('click', () => {
    codeForm.classList.add('hidden');
    idForm.classList.remove('hidden');
    showAlert(alertBox, '');
    idInput.focus();
  });

  root.querySelector('[data-tg="resend"]').addEventListener('click', async () => {
    try {
      await requestCode();
    } catch (err) {
      showError(err);
    }
  });
}
