import {
  api,
  escapeHtml,
  errorMessage,
  showAlert,
  formatDate,
  formatDateTime,
  toDateKey,
  addDaysKey,
  copyToClipboard,
  capitalize,
  photosHtml,
} from './common.js';
import { requireUser, logout, logoutAll } from './auth.js';
import { mountTgVerify } from './tgverify.js';
import { mountAdminTools } from './admin.js';

const ROLE_TITLES = { user: 'Участник', admin: 'Админ', support: 'Поддержка', moderator: 'Модератор', creator: 'Создатель' };
const content = document.getElementById('tab-content');
const alertBox = document.getElementById('app-alert');
const tabs = [...document.querySelectorAll('.tabs [data-tab]')];
let user = null;
let weekOffset = 0;
let currentDay = null;
let classTools = null;

function hwCard(dateKey, item) {
  const done = item.completed;
  const text = item.text ? `<p class="hw-text">${escapeHtml(item.text)}</p>` : '';
  return `<article class="hw-card ${done ? 'done' : ''}">
    <div class="hw-head">
      <button type="button" class="check ${done ? 'done' : ''}" data-action="toggle" data-date="${dateKey}" data-hash="${escapeHtml(item.subjectHash)}"
        aria-pressed="${done}" aria-label="${done ? 'Снять отметку' : 'Отметить выполненным'}">${done ? '✓' : ''}</button>
      <span class="hw-subject">${escapeHtml(item.icon || '')} ${escapeHtml(item.subjectName)}</span>
    </div>
    ${text}
    ${photosHtml(item.photoIds)}
  </article>`;
}

async function showDay(dateKey) {
  currentDay = dateKey;
  content.innerHTML = '<p class="muted">Загрузка...</p>';
  const data = await api(`/api/homework/day/${dateKey}`);
  const cards = data.subjects.length
    ? data.subjects.map((item) => hwCard(dateKey, item)).join('')
    : '<div class="card muted">На этот день ДЗ нет.</div>';
  const doneCount = data.subjects.filter((item) => item.completed).length;
  const progress = data.subjects.length ? `<span class="badge ${doneCount === data.subjects.length ? 'ok' : ''}">Выполнено ${doneCount} из ${data.subjects.length}</span>` : '';
  content.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:10px">
      <h2>${escapeHtml(formatDate(dateKey))}</h2>${progress}</div>${cards}`;
}

async function showWeek() {
  currentDay = null;
  content.innerHTML = '<p class="muted">Загрузка...</p>';
  const { days } = await api(`/api/homework/week?offset=${weekOffset}`);
  const today = toDateKey();
  const items = days
    .map(
      (day) => `<button type="button" class="week-day" data-action="open-day" data-date="${day.dateKey}">
        <span>${escapeHtml(formatDate(day.dateKey))}${day.dateKey === today ? ' · сегодня' : ''}</span>
        <span class="badge ${day.hasHomework ? 'ok' : ''}">${day.hasHomework ? 'есть ДЗ' : 'нет ДЗ'}</span></button>`,
    )
    .join('');
  content.innerHTML = `<div class="row" style="justify-content:space-between;margin-bottom:10px">
      <button type="button" class="secondary" data-action="week-prev">← Неделя назад</button>
      <button type="button" class="secondary" data-action="week-next">Неделя вперёд →</button></div>${items}`;
}

async function showSchedule() {
  currentDay = null;
  content.innerHTML = '<p class="muted">Загрузка...</p>';
  const { photoId } = await api('/api/schedule');
  content.innerHTML = photoId
    ? `<div class="card"><h2>Расписание</h2><a href="/api/files/${encodeURIComponent(photoId)}" target="_blank" rel="noopener">
        <img class="schedule-img" src="/api/files/${encodeURIComponent(photoId)}" alt="Расписание класса"></a></div>`
    : '<div class="card muted">Расписание ещё не загружено. Попроси админа класса добавить его.</div>';
}

function showSearch() {
  currentDay = null;
  content.innerHTML = `<div class="card"><form id="search-form" class="row" novalidate>
      <input id="search-q" minlength="2" maxlength="100" placeholder="Предмет или слово из задания" aria-label="Поиск">
      <button type="submit">Найти</button></form></div><div id="search-results"></div>`;
  document.getElementById('search-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const q = document.getElementById('search-q').value.trim();
    const results = document.getElementById('search-results');
    if (q.length < 2) {
      results.innerHTML = '<div class="alert">Введи хотя бы 2 символа.</div>';
      return;
    }
    try {
      const data = await api(`/api/homework/search?q=${encodeURIComponent(q)}`);
      results.innerHTML = data.results.length
        ? data.results
            .map(
              (item) => `<article class="hw-card"><div class="hw-head"><span class="hw-subject">${escapeHtml(item.icon)} ${escapeHtml(item.subjectName)}</span>
                <button type="button" class="secondary" data-action="open-day" data-date="${item.dateKey}">${escapeHtml(formatDate(item.dateKey))}</button></div>
                ${item.text ? `<p class="hw-text">${escapeHtml(item.text)}</p>` : ''}${photosHtml(item.photoIds)}</article>`,
            )
            .join('')
        : '<div class="card muted">Ничего не найдено.</div>';
    } catch (err) {
      results.innerHTML = `<div class="alert error">${escapeHtml(errorMessage(err))}</div>`;
    }
  });
}

async function showClass() {
  currentDay = null;
  content.innerHTML = '<p class="muted">Загрузка...</p>';
  const data = await api('/api/local-class');
  const statuses = {
    member: '<span class="badge ok">участник</span>',
    guest: '<span class="badge warn">гость</span>',
    pending: '<span class="badge warn">ждёт голосов</span>',
    kicked: '<span class="badge danger">исключён</span>',
  };
  const ownRequest = data.ownRequest
    ? `<div class="card"><h3>Твоя заявка</h3>
        <p class="muted">Голосов: ${data.ownRequest.votes} из ${data.ownRequest.requiredVotes}. Ответ придёт в бот.</p>
        <div class="row"><button type="button" class="secondary" data-action="lc-cancel">Отменить заявку</button></div></div>`
    : '';
  const joinButton =
    data.classStatus === 'guest'
      ? `<div class="row" style="margin-top:12px"><button type="button" data-action="lc-join">Попроситься в класс</button></div>`
      : '';
  const kickedNote =
    data.classStatus === 'kicked'
      ? '<div class="alert error">Тебя исключили из участников класса. Попроси участников или модератора снять исключение.</div>'
      : '';
  const members = data.members.length
    ? data.members
        .map(
          (member) => {
            const isStaff = member.role === 'moderator' || member.role === 'creator';
            const roleLabel = escapeHtml(ROLE_TITLES[member.role] || member.role);
            const manageable = data.canManage && member.specId !== user.specId && !isStaff;
            const roleButton = manageable
              ? `<button type="button" class="secondary" data-action="lc-role" data-spec="${escapeHtml(member.specId)}" data-role="${member.role === 'admin' ? 'user' : 'admin'}">${member.role === 'admin' ? 'Сделать участником' : 'Сделать админом'}</button>`
              : '';
            const tools = manageable
              ? `<span class="row">
                   ${roleButton}
                   <button type="button" class="secondary" data-action="lc-vote-block" data-spec="${escapeHtml(member.specId)}" data-blocked="${member.voteBlocked ? '0' : '1'}">${member.voteBlocked ? 'Вернуть голос' : 'Отнять голос'}</button>
                   <button type="button" class="danger" data-action="lc-kick" data-spec="${escapeHtml(member.specId)}" data-name="${escapeHtml(member.name)}">Исключить</button>
                 </span>`
              : '';
            return `<li class="row" style="justify-content:space-between">
            <span>${escapeHtml(member.name)} · <span class="muted">${roleLabel}</span>${member.voteBlocked ? ' · <span class="muted">голос отнят</span>' : ''}</span>
            ${tools}
          </li>`;
          },
        )
        .join('')
    : '<li class="muted">Участников пока нет.</li>';
  const pending = data.pending.length
    ? data.pending
        .map(
          (request) => `<li class="row" style="justify-content:space-between">
            <span>${escapeHtml(request.applicantName || 'Без имени')} · ${request.votes} из ${request.requiredVotes}</span>
            <span class="row">
              <button type="button" data-action="lc-approve" data-request="${escapeHtml(request._id)}" ${request.votedByMe ? 'disabled' : ''}>Принять</button>
              <button type="button" class="secondary" data-action="lc-reject" data-request="${escapeHtml(request._id)}">Отклонить</button>
            </span>
          </li>`,
        )
        .join('')
    : '<li class="muted">Открытых заявок нет.</li>';
  content.innerHTML = `<div class="card">
      <h2>Локальный класс ${escapeHtml(data.className || '')}</h2>
      <p class="muted">${escapeHtml(capitalize(data.school || ''))} · ${statuses[data.classStatus] || ''}</p>
      <p>Участники класса сами добавляют и правят ДЗ, расписание и состав. Порог приёма — ${data.requiredVotes} голос(а).</p>
      ${kickedNote}${joinButton}${ownRequest}
    </div>
    <div class="card"><h3>Участники (${data.members.length})</h3><ul class="plain">${members}</ul></div>
    ${data.canManage ? `<div class="card"><h3>Заявки на вступление</h3><ul class="plain">${pending}</ul></div>` : ''}
    ${data.canEdit ? '<div id="class-tools"></div>' : '<div class="card"><p class="muted">ДЗ и расписание правят админы класса. Попроси участника с ролью админа выдать право в списке участников.</p></div>'}`;
  if (data.canEdit) {
    classTools = mountAdminTools(content.querySelector('#class-tools'), {
      getClassKey: () => data.classKey,
      alertBox,
      showStaffTools: Boolean(data.isStaff),
    });
    classTools.refresh();
  }
}

async function classAction(action, button) {
  button.disabled = true;
  if (action === 'lc-join') {
    const result = await api('/api/local-class/join', { method: 'POST' });
    showAlert(
      alertBox,
      result?.becameMember
        ? 'В классе пока нет участников — ты стал его участником сам.'
        : 'Заявка отправлена одноклассникам. Ответ придёт в бот.',
      'success',
    );
  } else if (action === 'lc-cancel') {
    await api('/api/local-class/cancel', { method: 'POST' });
    showAlert(alertBox, 'Заявка отменена.', 'success');
  } else if (action === 'lc-approve') {
    await api(`/api/local-class/requests/${encodeURIComponent(button.dataset.request)}/vote`, { method: 'POST' });
    showAlert(alertBox, 'Голос учтён.', 'success');
  } else if (action === 'lc-reject') {
    if (!window.confirm('Отклонить заявку? Человек останется гостем класса.')) {
      button.disabled = false;
      return;
    }
    await api(`/api/local-class/requests/${encodeURIComponent(button.dataset.request)}/reject`, { method: 'POST' });
    showAlert(alertBox, 'Заявка отклонена.', 'success');
  } else if (action === 'lc-kick') {
    if (!window.confirm(`Исключить «${button.dataset.name}» из участников класса?`)) {
      button.disabled = false;
      return;
    }
    await api(`/api/local-class/members/${encodeURIComponent(button.dataset.spec)}/kick`, { method: 'POST' });
    showAlert(alertBox, 'Участник исключён.', 'success');
  } else if (action === 'lc-role') {
    const nextRole = button.dataset.role === 'admin' ? 'admin' : 'user';
    await api(`/api/local-class/members/${encodeURIComponent(button.dataset.spec)}/role`, {
      method: 'POST',
      body: { role: nextRole },
    });
    showAlert(alertBox, nextRole === 'admin' ? 'Теперь админ класса: может менять ДЗ.' : 'Теперь участник: ДЗ только для просмотра.', 'success');
  } else if (action === 'lc-vote-block') {
    const blocked = button.dataset.blocked === '1';
    await api(`/api/local-class/members/${encodeURIComponent(button.dataset.spec)}/vote-block`, {
      method: 'POST',
      body: { blocked },
    });
    showAlert(alertBox, blocked ? 'Право голоса отнято.' : 'Право голоса возвращено.', 'success');
  }
  await showClass();
}

function renderAccessBanner() {
  document.getElementById('access-banner').classList.toggle('hidden', Boolean(user.tgId));
}

function tgSectionHtml() {
  if (user.tgId) {
    return `<div class="card" id="tg-link">
      <h3>Telegram</h3>
      <p class="muted">Аккаунт привязан к Telegram ID <code>${escapeHtml(user.tgId)}</code>. Доступно всё: фото к ДЗ, уведомления, ответы поддержки. Другие аккаунты этого Telegram можно открыть через «Сменить аккаунт».</p>
      <a class="btn secondary" href="/login?mode=tg">Сменить аккаунт</a>
    </div>`;
  }
  return `<div class="card" id="tg-link">
    <h3>Подтверди Telegram — получишь полный доступ</h3>
    <p class="muted">Введи свой Telegram ID, бот пришлёт код. После подтверждения аккаунт привяжется к твоему Telegram и откроются фото к ДЗ, уведомления и ответы поддержки.</p>
    <div id="tg-link-box"></div>
    <div id="tg-link-alert" role="status"></div>
  </div>`;
}

async function linkTelegram(makeMain = false) {
  const box = document.getElementById('tg-link-alert');
  try {
    const result = await api('/api/auth/tg/link', { method: 'POST', body: { makeMain } });
    user = result.user;
    renderAccessBanner();
    showProfile();
    showAlert(alertBox, 'Telegram подтверждён, теперь у аккаунта полный доступ.', 'success');
  } catch (err) {
    if (err.code === 'tg_has_account') {
      const current = err.data?.current || {};
      const label = `${capitalize(current.school || '')}, ${current.class || ''}`;
      // В боте у Telegram только один основной аккаунт: замену подтверждает сам пользователь.
      const ok = window.confirm(
        `К этому Telegram уже привязан аккаунт «${label}». Сделать основным этот аккаунт? Старый не удалится: он останется в боте в списке «Мои аккаунты».`,
      );
      if (ok) await linkTelegram(true);
      return;
    }
    if (err.code === 'tg_not_verified') {
      showProfile();
      return;
    }
    showAlert(box, errorMessage(err), 'error');
  }
}

async function mountTgLink() {
  const box = document.getElementById('tg-link-box');
  if (!box) return;
  let status = null;
  try {
    status = await api('/api/auth/tg/status', { allow401: true });
  } catch {
    status = null;
  }
  if (status?.verified) {
    box.innerHTML = `<p>Telegram ID <code>${escapeHtml(status.tgId)}</code> уже подтверждён.</p>
      <div class="row"><button type="button" data-action="tg-link">Привязать к нему этот аккаунт</button>
      <button type="button" class="secondary" data-action="tg-forget">Другой Telegram ID</button></div>`;
    return;
  }
  mountTgVerify(box, { onVerified: () => linkTelegram(false) });
}

function showProfile() {
  currentDay = null;
  const warns = user.role === 'admin' || user.warns > 0 ? `<dt>Предупреждения</dt><dd>${user.warns} из 3</dd>` : '';
  const telegram = user.tgId
    ? '<span class="badge ok">привязан · полный доступ</span>'
    : '<span class="badge warn">не привязан · ограниченный доступ</span>';
  content.innerHTML = `<div class="card">
      <h2>Профиль</h2>
      <dl class="kv">
        <dt>Имя</dt><dd>${escapeHtml(user.firstName || '—')}</dd>
        <dt>Город</dt><dd>${escapeHtml(capitalize(user.city) || '—')}</dd>
        <dt>Школа</dt><dd>${escapeHtml(capitalize(user.school) || '—')}</dd>
        <dt>Класс</dt><dd>${escapeHtml(user.class || '—')}</dd>
        <dt>Роль</dt><dd>${escapeHtml(ROLE_TITLES[user.role] || user.role)}</dd>
        <dt>Telegram</dt><dd>${telegram}</dd>
        <dt>Спец-ID</dt><dd><code id="spec-id">${escapeHtml(user.specId)}</code></dd>
        ${warns}
        <dt>Просмотров ДЗ</dt><dd>${user.stats.homeworkViews}</dd>
        <dt>Последняя активность</dt><dd>${escapeHtml(formatDateTime(user.stats.lastActive))}</dd>
      </dl>
      <div class="row" style="margin-top:14px">
        <button type="button" class="secondary" data-action="copy-spec">Скопировать спец-ID</button>
        <a class="btn secondary" href="/login?mode=tg">Сменить аккаунт</a>
        <button type="button" class="secondary" data-action="logout">Выйти</button>
        <button type="button" class="danger" data-action="logout-all">Выйти со всех устройств</button>
      </div>
    </div>
    ${tgSectionHtml()}`;
  mountTgLink();
}

async function openTab(name) {
  tabs.forEach((tab) => tab.classList.toggle('active', tab.dataset.tab === name));
  showAlert(alertBox, '');
  const today = toDateKey();
  try {
    if (name === 'today') await showDay(today);
    else if (name === 'tomorrow') await showDay(addDaysKey(today, 1));
    else if (name === 'after') await showDay(addDaysKey(today, 2));
    else if (name === 'week') await showWeek();
    else if (name === 'schedule') await showSchedule();
    else if (name === 'class') await showClass();
    else if (name === 'search') showSearch();
    else if (name === 'profile') showProfile();
  } catch (err) {
    content.innerHTML = '';
    showAlert(alertBox, errorMessage(err), 'error');
  }
}

for (const tab of tabs) tab.addEventListener('click', () => openTab(tab.dataset.tab));

content.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action } = button.dataset;
  try {
    if (action === 'toggle') {
      button.disabled = true;
      await api('/api/homework/toggle', { method: 'POST', body: { dateKey: button.dataset.date, subjectHash: button.dataset.hash } });
      await showDay(currentDay || button.dataset.date);
    } else if (action === 'open-day') {
      tabs.forEach((tab) => tab.classList.remove('active'));
      await showDay(button.dataset.date);
    } else if (action === 'week-prev') {
      weekOffset = Math.max(-52, weekOffset - 1);
      await showWeek();
    } else if (action === 'week-next') {
      weekOffset = Math.min(52, weekOffset + 1);
      await showWeek();
    } else if (action === 'copy-spec') {
      const ok = await copyToClipboard(user.specId);
      showAlert(alertBox, ok ? 'Спец-ID скопирован.' : 'Не удалось скопировать.', ok ? 'success' : 'error');
    } else if (action === 'tg-link') {
      button.disabled = true;
      await linkTelegram(false);
    } else if (action === 'tg-forget') {
      await api('/api/auth/tg/forget', { method: 'POST' });
      showProfile();
    } else if (action === 'logout') {
      await logout();
    } else if (action === 'logout-all') {
      if (window.confirm('Выйти на всех устройствах? Придётся войти заново.')) await logoutAll();
    } else if (action.startsWith('lc-')) {
      await classAction(action, button);
    }
  } catch (err) {
    button.disabled = false;
    showAlert(alertBox, errorMessage(err), 'error');
  }
});

async function init() {
  user = await requireUser();
  if (!user) return;
  document.getElementById('class-line').textContent =
    user.school && user.class ? `${capitalize(user.school)}, ${user.class}` : 'Класс не указан';
  renderAccessBanner();
  document.getElementById('access-banner-btn').addEventListener('click', async () => {
    await openTab('profile');
    document.getElementById('tg-link')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  const initial = new URLSearchParams(window.location.search).get('tab') || 'today';
  await openTab(tabs.some((tab) => tab.dataset.tab === initial) ? initial : 'today');
}

init();
