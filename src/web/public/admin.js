import {
  api,
  escapeHtml,
  errorMessage,
  showAlert,
  formatDate,
  toDateKey,
  addDaysKey,
  imageToDataUrl,
  photosHtml,
  capitalize,
  classLabel,
} from './common.js';
import { requireUser } from './auth.js';

const QUICK_SUBJECTS = [
  'алгебра',
  'геометрия',
  'русский',
  'литература',
  'физика',
  'химия',
  'биология',
  'история',
  'обществознание',
  'английский',
  'информатика',
  'география',
  'физкультура',
  'обж',
];
const MAX_PHOTOS = 10;

// Набор инструментов админа используется и на /admin (свой класс), и на /creator (выбранный класс).
export function mountAdminTools(root, { getClassKey = () => '', alertBox, isStaff = false } = {}) {
  const say = (text, type = 'success') => {
    showAlert(alertBox, text, type);
    alertBox?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };
  const fail = (err) => say(errorMessage(err), 'error');
  const classQuery = () => (getClassKey() ? `classKey=${encodeURIComponent(getClassKey())}` : '');
  const withClass = (body) => (getClassKey() ? { ...body, classKey: getClassKey() } : body);
  const tomorrow = addDaysKey(toDateKey(), 1);

  root.innerHTML = `
    <section class="card" id="add-block">
      <h2>Добавить ДЗ</h2>
      <form id="add-form" class="stack" novalidate>
        <div class="grid two">
          <div class="field"><label for="add-date">Дата</label><input type="date" id="add-date" value="${tomorrow}" required></div>
          <div class="field"><label for="add-subject">Предмет</label>
            <input id="add-subject" list="subjects-list" maxlength="60" placeholder="Например, алгебра" required>
            <datalist id="subjects-list">${QUICK_SUBJECTS.map((s) => `<option value="${escapeHtml(s)}">`).join('')}</datalist></div>
        </div>
        <div class="field"><label for="add-text">Задание</label><textarea id="add-text" maxlength="2000"></textarea></div>
        <div class="field"><label for="add-photos">Фото (до ${MAX_PHOTOS})</label><input type="file" id="add-photos" accept="image/jpeg,image/png,image/webp" multiple></div>
        <button type="submit">Добавить</button>
      </form>
    </section>
    <section class="card" id="edit-block">
      <h2>Редактировать и удалить ДЗ</h2>
      <div class="row">
        <input type="date" id="edit-date" value="${tomorrow}" aria-label="Дата для редактирования">
        <button type="button" id="edit-load">Показать</button>
      </div>
      <div id="edit-list" style="margin-top:12px"></div>
      <div class="row" style="margin-top:12px">
        <label for="dup-date" class="small">Скопировать весь день на дату</label>
        <input type="date" id="dup-date" aria-label="Дата копирования">
        <button type="button" class="secondary" id="dup-btn">Скопировать день</button>
      </div>
    </section>
    <section class="card" id="schedule-block">
      <h2>Загрузить расписание</h2>
      <div id="schedule-current" class="muted">Загрузка...</div>
      <div class="row" style="margin-top:10px">
        <input type="file" id="schedule-file" accept="image/jpeg,image/png,image/webp" aria-label="Фото расписания">
        <button type="button" id="schedule-upload">Загрузить</button>
      </div>
    </section>
    <section class="card" id="broadcast-block">
      <h2>Рассылка классу</h2>
      <form id="class-broadcast" class="stack" novalidate>
        <textarea id="class-broadcast-text" maxlength="3500" placeholder="Сообщение придёт всем ученикам класса в Telegram" aria-label="Текст рассылки"></textarea>
        <button type="submit">Отправить классу</button>
      </form>
    </section>
    <section class="card" id="stats-block">
      <div class="row" style="justify-content:space-between"><h2>Статистика</h2><button type="button" class="secondary" id="stats-load">Обновить</button></div>
      <div id="stats-content" class="muted">Нажми «Обновить».</div>
    </section>`;

  async function uploadPhoto(file) {
    const image = await imageToDataUrl(file);
    const { photoId } = await api('/api/homework/upload-photo', { method: 'POST', body: { image } });
    return photoId;
  }

  const addForm = root.querySelector('#add-form');
  addForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = addForm.querySelector('button[type="submit"]');
    const files = [...root.querySelector('#add-photos').files];
    if (files.length > MAX_PHOTOS) {
      say(errorMessage({ code: 'invalid_photos' }), 'error');
      return;
    }
    button.disabled = true;
    try {
      const photoIds = [];
      for (const file of files) photoIds.push(await uploadPhoto(file));
      const body = withClass({
        dateKey: root.querySelector('#add-date').value,
        subjectName: root.querySelector('#add-subject').value.trim(),
        text: root.querySelector('#add-text').value.trim(),
        photoIds,
      });
      await api('/api/homework', { method: 'POST', body });
      say(`ДЗ по предмету «${body.subjectName}» на ${formatDate(body.dateKey)} сохранено.`);
      addForm.reset();
      root.querySelector('#add-date').value = body.dateKey;
    } catch (err) {
      fail(err);
    } finally {
      button.disabled = false;
    }
  });

  const editList = root.querySelector('#edit-list');
  let editDate = tomorrow;
  let editClassKey = '';
  let editSubjects = [];

  function editCard(item) {
    return `<article class="hw-card" data-hash="${escapeHtml(item.subjectHash)}">
      <div class="hw-head"><span class="hw-subject">${escapeHtml(item.icon)} ${escapeHtml(item.subjectName)}</span></div>
      <div class="field" style="margin-top:8px"><textarea data-role="text" maxlength="2000" aria-label="Текст задания">${escapeHtml(item.text)}</textarea></div>
      ${photosHtml(item.photoIds)}
      <div class="row" style="margin-top:8px">
        <button type="button" data-edit="save">Сохранить текст</button>
        <label class="btn secondary">Добавить фото<input type="file" class="hidden" data-edit="add-photo" accept="image/jpeg,image/png,image/webp"></label>
        ${item.photoIds.length ? '<button type="button" class="secondary" data-edit="clear-photos">Удалить фото</button>' : ''}
      </div>
      <div class="row" style="margin-top:8px">
        <input type="date" data-role="move-date" aria-label="Новая дата">
        <button type="button" class="secondary" data-edit="move">Перенести</button>
        <button type="button" class="danger" data-edit="delete">Удалить</button>
      </div>
    </article>`;
  }

  async function loadEdit() {
    editDate = root.querySelector('#edit-date').value;
    if (!editDate) return;
    editList.innerHTML = '<p class="muted">Загрузка...</p>';
    try {
      const query = classQuery();
      const data = await api(`/api/homework/day/${editDate}${query ? `?${query}` : ''}`);
      editClassKey = data.classKey;
      editSubjects = data.subjects;
      editList.innerHTML = editSubjects.length
        ? `<p class="muted">${escapeHtml(formatDate(editDate))}</p>${editSubjects.map(editCard).join('')}`
        : '<p class="muted">На этот день записей нет.</p>';
    } catch (err) {
      editList.innerHTML = '';
      fail(err);
    }
  }

  root.querySelector('#edit-load').addEventListener('click', loadEdit);

  editList.addEventListener('change', async (event) => {
    const input = event.target.closest('[data-edit="add-photo"]');
    if (!input || !input.files[0]) return;
    const card = input.closest('[data-hash]');
    const item = editSubjects.find((subject) => subject.subjectHash === card.dataset.hash);
    try {
      if (item.photoIds.length >= MAX_PHOTOS) throw { code: 'invalid_photos' };
      const photoId = await uploadPhoto(input.files[0]);
      await api(taskUrl(card.dataset.hash), { method: 'PUT', body: { photoIds: [photoId, ...item.photoIds] } });
      say('Фото добавлено.');
      await loadEdit();
    } catch (err) {
      fail(err);
    }
  });

  function taskUrl(hash) {
    return `/api/homework/${encodeURIComponent(editClassKey)}/${editDate}/${hash}`;
  }

  editList.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-edit]');
    if (!button) return;
    const card = button.closest('[data-hash]');
    const hash = card.dataset.hash;
    button.disabled = true;
    try {
      if (button.dataset.edit === 'save') {
        const text = card.querySelector('[data-role="text"]').value.trim();
        await api(taskUrl(hash), { method: 'PUT', body: { text } });
        say('Текст обновлён.');
      } else if (button.dataset.edit === 'clear-photos') {
        if (!window.confirm('Удалить все фото у этой записи?')) return;
        await api(taskUrl(hash), { method: 'PUT', body: { photoIds: [] } });
        say('Фото удалены.');
        await loadEdit();
      } else if (button.dataset.edit === 'move') {
        const toDateKey = card.querySelector('[data-role="move-date"]').value;
        if (!toDateKey) throw { code: 'invalid_date' };
        await api('/api/homework/move', {
          method: 'POST',
          body: { classKey: editClassKey, fromDateKey: editDate, toDateKey, subjectHash: hash },
        });
        say(`Запись перенесена на ${formatDate(toDateKey)}.`);
        await loadEdit();
      } else if (button.dataset.edit === 'delete') {
        if (!window.confirm('Удалить запись? Это действие нельзя отменить.')) return;
        await api(taskUrl(hash), { method: 'DELETE' });
        say('Запись удалена.');
        await loadEdit();
      }
    } catch (err) {
      fail(err);
    } finally {
      button.disabled = false;
    }
  });

  root.querySelector('#dup-btn').addEventListener('click', async () => {
    const toDateKey = root.querySelector('#dup-date').value;
    const fromDateKey = root.querySelector('#edit-date').value;
    if (!toDateKey || !fromDateKey) {
      say(errorMessage({ code: 'invalid_date' }), 'error');
      return;
    }
    try {
      const { subjectsCount } = await api('/api/homework/duplicate', {
        method: 'POST',
        body: withClass({ fromDateKey, toDateKey }),
      });
      say(`Скопировано предметов: ${subjectsCount}.`);
    } catch (err) {
      fail(err);
    }
  });

  async function loadSchedule() {
    const box = root.querySelector('#schedule-current');
    try {
      const query = classQuery();
      const { photoId } = await api(`/api/schedule${query ? `?${query}` : ''}`);
      box.innerHTML = photoId
        ? `<img class="schedule-img" src="/api/files/${encodeURIComponent(photoId)}" alt="Текущее расписание">`
        : 'Расписание ещё не загружено.';
    } catch (err) {
      box.textContent = errorMessage(err);
    }
  }

  root.querySelector('#schedule-upload').addEventListener('click', async (event) => {
    const file = root.querySelector('#schedule-file').files[0];
    if (!file) {
      say('Выбери фото расписания.', 'error');
      return;
    }
    event.target.disabled = true;
    try {
      const image = await imageToDataUrl(file);
      await api('/api/schedule/upload', { method: 'POST', body: withClass({ image }) });
      say('Расписание обновлено.');
      await loadSchedule();
    } catch (err) {
      fail(err);
    } finally {
      event.target.disabled = false;
    }
  });

  const broadcastForm = root.querySelector('#class-broadcast');
  broadcastForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = root.querySelector('#class-broadcast-text').value.trim();
    if (!text) {
      say(errorMessage({ code: 'invalid_text' }), 'error');
      return;
    }
    if (!window.confirm('Отправить сообщение всему классу?')) return;
    const button = broadcastForm.querySelector('button');
    button.disabled = true;
    try {
      const body = { text, audience: 'class' };
      if (isStaff && getClassKey()) body.audienceValue = getClassKey();
      const result = await api('/api/admin/broadcast', { method: 'POST', body });
      say(result.queued ? `Рассылка запущена: ${result.recipients} получателей.` : `Доставлено: ${result.sent}, не доставлено: ${result.failed}.`);
      broadcastForm.reset();
    } catch (err) {
      fail(err);
    } finally {
      button.disabled = false;
    }
  });

  async function loadStats() {
    const box = root.querySelector('#stats-content');
    try {
      const query = classQuery();
      const s = await api(`/api/admin/stats${query ? `?${query}` : ''}`);
      const admins = (s.classAdminNames || []).map((name) => escapeHtml(name)).join(', ') || '—';
      const mine = s.myCount !== undefined ? `<dt>Добавлено тобой</dt><dd>${s.myCount}</dd><dt>Добавлено другими</dt><dd>${s.othersCount}</dd>` : '';
      box.classList.remove('muted');
      box.innerHTML = `<dl class="kv">
        <dt>Класс</dt><dd>${escapeHtml(classLabel(s.classKey))}</dd>
        <dt>Пользователей</dt><dd>${s.classUsers ?? 0}</dd>
        <dt>Просмотров ДЗ</dt><dd>${s.homeworkViews ?? 0}</dd>
        <dt>Админы (${s.classAdmins ?? 0})</dt><dd>${admins}</dd>
        <dt>Добавлено вчера</dt><dd>${s.yesterdayCount ?? 0}</dd>
        <dt>Добавлено сегодня</dt><dd>${s.todayCount ?? 0}</dd>
        <dt>Активность за день</dt><dd>${s.dayPercent ?? 0}%</dd>
        <dt>Активность за неделю</dt><dd>${s.weekPercent ?? 0}%</dd>
        ${mine}</dl>`;
    } catch (err) {
      box.textContent = errorMessage(err);
    }
  }

  root.querySelector('#stats-load').addEventListener('click', loadStats);

  return {
    refresh() {
      editList.innerHTML = '';
      loadSchedule();
      loadStats();
    },
  };
}

async function initAdminPage() {
  const user = await requireUser(['admin', 'moderator', 'creator']);
  if (!user) return;
  if (user.role !== 'admin') {
    window.location.href = '/creator';
    return;
  }
  document.getElementById('admin-class-line').textContent = `${capitalize(user.school)}, ${user.class}`;
  const tools = mountAdminTools(document.getElementById('admin-tools'), { alertBox: document.getElementById('admin-alert') });
  tools.refresh();
}

if (document.body.dataset.page === 'admin') initAdminPage();
