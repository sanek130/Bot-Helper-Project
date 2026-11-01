import { api, escapeHtml, errorMessage, showAlert, formatDateTime, capitalize } from './common.js';
import { requireUser } from './auth.js';

const STAFF_ROLES = ['support', 'moderator', 'creator'];
const alertBox = document.getElementById('support-alert');
const form = document.getElementById('support-form');
const myTickets = document.getElementById('my-tickets');
const staffBlock = document.getElementById('staff-block');
const openTickets = document.getElementById('open-tickets');
let me = null;

function messagesHtml(ticket) {
  if (!ticket.messages.length) return '<p class="muted">Сообщений пока нет.</p>';
  return ticket.messages
    .map(
      (message) => `<div class="message ${message.from === 'support' ? 'support' : ''}">
        <div class="small muted">${message.from === 'support' ? 'Поддержка' : escapeHtml(message.authorName || 'Ты')} · ${escapeHtml(formatDateTime(message.createdAt))}</div>
        ${escapeHtml(message.text)}</div>`,
    )
    .join('');
}

async function loadMine() {
  try {
    const { tickets } = await api('/api/support/tickets?mine=true');
    myTickets.innerHTML = tickets.length
      ? tickets
          .map(
            (ticket) => `<article class="card">
          <div class="row" style="justify-content:space-between"><strong>Обращение от ${escapeHtml(formatDateTime(ticket.createdAt))}</strong>
          <span class="badge ${ticket.status === 'open' ? '' : 'ok'}">${ticket.status === 'open' ? 'открыто' : 'закрыто'}</span></div>
          <div style="margin-top:8px">${messagesHtml(ticket)}</div></article>`,
          )
          .join('')
      : '<p class="muted">Обращений пока нет.</p>';
  } catch (err) {
    myTickets.innerHTML = `<div class="alert error">${escapeHtml(errorMessage(err))}</div>`;
  }
}

async function loadOpen() {
  try {
    const { tickets } = await api('/api/support/tickets?limit=30');
    openTickets.innerHTML = tickets.length
      ? tickets
          .map(
            ({ ticket, user }) => `<article class="card" data-ticket="${escapeHtml(ticket._id)}">
          <strong>${escapeHtml(user?.firstName || 'Без имени')}</strong>
          <span class="small muted">${user?.username ? `@${escapeHtml(user.username)} · ` : ''}${escapeHtml(capitalize(user?.school) || '—')} · ${escapeHtml(user?.class || '—')}</span>
          <div style="margin-top:8px">${messagesHtml(ticket)}</div>
          <div class="field"><textarea data-role="reply" maxlength="2000" placeholder="Ответ пользователю" aria-label="Ответ"></textarea></div>
          <div class="row"><button type="button" data-ticket-action="reply">Ответить</button>
            <button type="button" class="secondary" data-ticket-action="close">Закрыть тикет</button></div>
        </article>`,
          )
          .join('')
      : '<p class="muted">Открытых тикетов нет.</p>';
  } catch (err) {
    openTickets.innerHTML = `<div class="alert error">${escapeHtml(errorMessage(err))}</div>`;
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const textarea = document.getElementById('support-text');
  const text = textarea.value.trim();
  if (text.length < 3) {
    showAlert(alertBox, 'Сообщение должно быть от 3 до 2000 символов.', 'error');
    return;
  }
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    await api('/api/support/message', { method: 'POST', body: { text } });
    textarea.value = '';
    showAlert(alertBox, 'Сообщение отправлено в поддержку.', 'success');
    await loadMine();
  } catch (err) {
    showAlert(alertBox, errorMessage(err), 'error');
  } finally {
    button.disabled = false;
  }
});

openTickets.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-ticket-action]');
  if (!button) return;
  const card = button.closest('[data-ticket]');
  const ticketId = card.dataset.ticket;
  button.disabled = true;
  try {
    if (button.dataset.ticketAction === 'reply') {
      const text = card.querySelector('[data-role="reply"]').value.trim();
      const result = await api('/api/support/reply', { method: 'POST', body: { ticketId, text } });
      showAlert(
        alertBox,
        result.delivered ? 'Ответ отправлен.' : 'Ответ сохранён, но пользователь недоступен в Telegram. Он увидит ответ на сайте.',
        'success',
      );
    } else {
      await api('/api/support/close', { method: 'POST', body: { ticketId } });
      showAlert(alertBox, 'Тикет закрыт.', 'success');
    }
    await loadOpen();
  } catch (err) {
    button.disabled = false;
    showAlert(alertBox, errorMessage(err), 'error');
  }
});

async function init() {
  me = await requireUser();
  if (!me) return;
  if (me.banned) showAlert(alertBox, 'Твой аккаунт заблокирован. Здесь можно обжаловать блокировку.', 'error');
  await loadMine();
  if (STAFF_ROLES.includes(me.role)) {
    staffBlock.classList.remove('hidden');
    await loadOpen();
  }
}

init();
