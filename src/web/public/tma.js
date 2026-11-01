import { api, errorMessage } from './common.js';

const status = document.getElementById('tma-status');
const actions = document.getElementById('tma-actions');

async function start() {
  const webApp = window.Telegram?.WebApp;
  if (!webApp || !webApp.initData) {
    status.textContent = 'Открой эту страницу из бота в Telegram или войди по спец-ID.';
    actions.classList.remove('hidden');
    return;
  }
  webApp.ready();
  webApp.expand();
  try {
    await api('/api/auth/tma', { method: 'POST', body: { initData: webApp.initData }, allow401: true });
    window.location.replace('/app');
  } catch (err) {
    status.textContent =
      err.code === 'not_registered' ? 'Ты ещё не зарегистрирован. Заверши регистрацию в боте или на сайте.' : errorMessage(err);
    actions.classList.remove('hidden');
  }
}

start();
