// Поддержка: форма обращения и история переписки. Доступна и заблокированным — для обжалования.
import { api, fmtDate, getMe, getBotLink, renderHeader, toast } from './common.js';

const root = document.getElementById('support-root');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

export function ticketView(ticket) {
  const card = el('article', 'card item-card');
  const head = el('div', 'item-head');
  head.append(
    el('h3', 'item-subject', `Обращение от ${fmtDate(ticket.createdAt, true)}`),
    el('span', ticket.status === 'open' ? 'badge badge-warning' : 'badge badge-success', ticket.status === 'open' ? 'Открыто' : 'Закрыто')
  );
  card.append(head);
  const thread = el('div', 'thread');
  for (const message of ticket.messages) {
    const bubble = el('div', `bubble ${message.from === 'support' ? 'bubble-support' : 'bubble-user'}`);
    bubble.append(
      el('div', 'small muted', `${message.from === 'support' ? 'Поддержка' : 'Ты'} · ${fmtDate(message.at, true)}`),
      el('div', 'item-text', message.text)
    );
    thread.append(bubble);
  }
  card.append(thread);
  return card;
}

function buildForm(onSent) {
  const card = el('section', 'card');
  const form = el('form', 'form');
  form.noValidate = true;
  const label = el('label', null, 'Твоё сообщение');
  const area = document.createElement('textarea');
  area.id = 'support-text';
  area.maxLength = 2000;
  area.rows = 5;
  area.placeholder = 'Например: не вижу ДЗ своего класса, хотя админ его добавил.';
  label.htmlFor = area.id;
  const field = el('div', 'field');
  field.append(label, area, el('span', 'hint', 'До 2000 символов. Опиши, что делал и что пошло не так.'));
  const submit = el('button', 'btn', 'Отправить');
  submit.type = 'submit';
  form.append(field, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = area.value.trim();
    if (text.length < 3) {
      toast('Напиши чуть подробнее');
      area.focus();
      return;
    }
    submit.disabled = true;
    try {
      await api('/api/support', { method: 'POST', body: { text, source: 'web' } });
      area.value = '';
      toast('Сообщение отправлено');
      await onSent();
    } catch (error) {
      toast(error.message);
    } finally {
      submit.disabled = false;
    }
  });
  card.append(el('h2', null, 'Написать в поддержку'), form);
  return card;
}

async function render(user) {
  const blocks = [];
  if (user.banned) {
    const box = el('div', 'error-box');
    box.append(el('strong', null, 'Аккаунт заблокирован'));
    box.append(el('div', null, user.banReason ? `Причина: ${user.banReason}` : 'Создатель заблокировал аккаунт.'));
    box.append(el('div', null, 'Если это ошибка — опиши ситуацию ниже, создатели рассмотрят обращение.'));
    blocks.push(box);
  }
  blocks.push(buildForm(() => render(user)));

  const list = el('div', 'stack');
  try {
    const data = await api('/api/support');
    const tickets = Array.isArray(data.tickets) ? data.tickets : [];
    if (tickets.length) {
      list.append(el('h2', null, 'Мои обращения'), ...tickets.map(ticketView));
    }
  } catch (error) {
    list.append(el('div', 'error-box', error.message));
  }
  blocks.push(list);
  root.replaceChildren(...blocks);
}

async function init() {
  const user = await getMe();
  renderHeader(user);
  if (!user) {
    const card = el('div', 'card');
    card.append(
      el('h2', null, 'Сначала войди'),
      el('p', 'muted', 'Обращение привязывается к аккаунту, чтобы ответ пришёл тебе. Без аккаунта напиши боту команду /support.')
    );
    const actions = el('div', 'actions');
    const login = el('a', 'btn', 'Войти');
    login.href = '/login';
    const bot = el('a', 'btn btn-secondary', 'Открыть бота');
    bot.href = getBotLink();
    bot.target = '_blank';
    bot.rel = 'noopener noreferrer';
    actions.append(login, bot);
    card.append(actions);
    root.replaceChildren(card);
    return;
  }
  await render(user);
}

if (root) init();
