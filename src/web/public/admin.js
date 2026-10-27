// Админ-панель класса: статистика, ДЗ, фото, расписание и рассылка.
import {
  api,
  fmtDate,
  getMe,
  renderHeader,
  toast,
} from './common.js';

const SUBJECTS = [
  'Алгебра', 'Геометрия', 'Русский', 'Литература', 'Английский',
  'Физика', 'Химия', 'Биология', 'История', 'Обществознание',
  'География', 'Информатика', 'ОБЖ', 'Физкультура', 'Музыка',
  'ИЗО', 'Технология',
];

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

const state = {
  user: null,
  date: todayKey(),
};

let statsToken = 0;
let homeworkToken = 0;
let scheduleToken = 0;

const app = document.getElementById('admin-app');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function button(label, className, onClick) {
  const node = el('button', className || 'btn', label);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

function link(label, href, className) {
  const node = el('a', className || 'btn', label);
  node.href = href;
  return node;
}

function loadingState(text = 'Загружаю') {
  return el('div', 'loading', text);
}

function emptyState(title, text) {
  const box = el('div', 'empty');
  box.append(el('strong', null, title));
  if (text) box.append(el('span', null, text));
  return box;
}

function errorBox(message) {
  const box = el('div', 'error-box');
  box.setAttribute('role', 'alert');
  box.textContent = message;
  return box;
}

function okBox(message) {
  const box = el('div', 'ok-box');
  box.setAttribute('role', 'status');
  box.textContent = message;
  return box;
}

function warningBox(message) {
  const box = el('div', 'warn-box');
  box.setAttribute('role', 'status');
  box.textContent = message;
  return box;
}

function field(labelText, control, hintText) {
  const wrap = el('div', 'field');
  const label = el('label', null, labelText);
  const id = control.id || `admin-field-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName)) label.htmlFor = id;
  wrap.append(label, control);
  if (hintText) wrap.append(el('span', 'hint', hintText));
  return wrap;
}

function dateKeyLocal(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromKey(key) {
  const [year, month, day] = String(key).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function todayKey() {
  return dateKeyLocal(new Date());
}

function addDays(key, days) {
  const date = dateFromKey(key);
  date.setDate(date.getDate() + days);
  return dateKeyLocal(date);
}

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Не удалось прочитать файл.'));
    reader.readAsDataURL(file);
  });
}

function checkImage(file) {
  if (!file.type || !file.type.startsWith('image/')) {
    toast('Выбери картинку');
    return false;
  }
  if (file.size > MAX_PHOTO_BYTES) {
    toast('Файл больше 5 МБ — выбери поменьше');
    return false;
  }
  return true;
}

/* ---------- Статистика ---------- */

function buildStatsCard() {
  const card = el('section', 'card');
  const head = el('div', 'card-head');
  const info = el('div');
  info.append(
    el('h2', null, 'Статистика класса'),
    el('p', 'card-sub', 'Сколько учеников, админов и активности в классе.')
  );
  head.append(info, button('Обновить', 'btn btn-ghost btn-small', () => loadStats()));

  const body = el('div');
  body.id = 'stats-body';
  body.append(loadingState());

  card.append(head, body);
  return card;
}

function renderStats(body, stats) {
  const grid = el('div', 'stat-grid');

  const addStat = (label, value) => {
    const cell = el('div', 'stat');
    cell.append(el('p', 'stat-value', String(value ?? 0)), el('p', 'stat-label', label));
    grid.append(cell);
  };

  addStat('Учеников в классе', stats.classUsers);
  addStat('ДЗ на сегодня', stats.todayCount);
  addStat('ДЗ на вчера', stats.yesterdayCount);
  addStat('Просмотров ДЗ', stats.homeworkViews);
  addStat('Активны за день', `${stats.dayPercent ?? 0}%`);
  addStat('Активны за неделю', `${stats.weekPercent ?? 0}%`);
  addStat('Админов', stats.adminCount);

  const percent = el('div', 'stat');
  percent.append(
    el('p', 'stat-value', stats.school ? stats.school : '—'),
    el('p', 'stat-label', [stats.city, stats.className ? `${stats.className} класс` : ''].filter(Boolean).join(' · ') || 'Класс')
  );
  grid.append(percent);

  const adminsTitle = el('h3', null, 'Админы класса');
  adminsTitle.style.marginTop = '18px';

  const admins = Array.isArray(stats.admins) ? stats.admins : [];
  const adminsRow = el('div', 'row');
  if (!admins.length) {
    adminsRow.append(el('span', 'small muted', 'Пока нет админов.'));
  } else {
    for (const admin of admins) {
      adminsRow.append(el('span', 'badge badge-success', `${admin.name || 'Админ'} · +${admin.added || 0} ДЗ`));
    }
  }

  body.replaceChildren(grid, adminsTitle, adminsRow);
}

async function loadStats() {
  const body = document.getElementById('stats-body');
  if (!body) return;

  const token = ++statsToken;
  body.replaceChildren(loadingState());

  try {
    const data = await api('/api/admin/stats');
    if (token !== statsToken || !body.isConnected) return;
    renderStats(body, data.stats || {});
  } catch (error) {
    if (token !== statsToken || !body.isConnected) return;
    body.replaceChildren(
      errorBox(error.message),
      button('Повторить', 'btn btn-secondary btn-small', () => loadStats())
    );
  }
}

/* ---------- Домашние задания ---------- */

function buildHomeworkCard() {
  const card = el('section', 'card');

  const head = el('div', 'card-head');
  const info = el('div');
  info.append(
    el('h2', null, 'Домашние задания'),
    el('p', 'card-sub', 'Выбери дату — покажу задания этого дня. Фото и правки — прямо в карточке.')
  );

  const dateField = el('div', 'field');
  dateField.style.minWidth = '168px';
  const dateLabel = el('label', null, 'Дата');
  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.id = 'admin-date';
  dateInput.value = state.date;
  dateLabel.htmlFor = dateInput.id;
  dateField.append(dateLabel, dateInput);

  head.append(info, dateField);
  card.append(head);

  const duplicateRow = el('div', 'row');
  duplicateRow.style.marginBottom = '14px';
  const duplicateLabel = el('span', 'small muted', 'Дублировать день на');
  const duplicateInput = document.createElement('input');
  duplicateInput.type = 'date';
  duplicateInput.id = 'duplicate-date';
  duplicateInput.value = addDays(state.date, 1);
  duplicateInput.style.maxWidth = '168px';

  const duplicateButton = button('Дублировать на дату', 'btn btn-secondary btn-small', async () => {
    const to = duplicateInput.value;
    if (!to) {
      toast('Выбери дату, куда дублировать');
      return;
    }
    if (!window.confirm(`Скопировать все ДЗ за ${state.date} на ${to}?`)) return;

    duplicateButton.disabled = true;
    duplicateButton.textContent = 'Копирую…';
    try {
      const data = await api('/api/homework/duplicate', {
        method: 'POST',
        body: { from: state.date, to },
      });
      if (data.copied) toast(`Дублировано заданий: ${data.copied}`);
      else toast('На выбранной дате нет ДЗ');
      if (to === state.date) loadHomework();
    } catch (error) {
      toast(error.message);
    } finally {
      duplicateButton.disabled = false;
      duplicateButton.textContent = 'Дублировать на дату';
    }
  });

  duplicateRow.append(duplicateLabel, duplicateInput, duplicateButton);
  card.append(duplicateRow);

  const list = el('div', 'stack');
  list.id = 'homework-list';
  list.append(loadingState('Загружаю ДЗ'));
  card.append(list);

  dateInput.addEventListener('change', () => {
    state.date = dateInput.value || todayKey();
    duplicateInput.value = addDays(state.date, 1);

    const addDate = document.getElementById('add-date');
    if (addDate) addDate.value = state.date;

    loadHomework();
  });

  return card;
}

function adminItemCard(date, item) {
  const card = el('article', 'card item-card');

  const head = el('div', 'item-head');
  head.append(
    el('span', 'item-icon', item.icon || '📘'),
    el('h3', 'item-subject', item.subject || 'Предмет'),
    el('span', 'spacer')
  );

  const headActions = el('div', 'actions');
  const editButton = button('Редактировать', 'btn btn-secondary btn-small');
  const moveButton = button('Перенести', 'btn btn-secondary btn-small');
  const deleteButton = button('Удалить', 'btn btn-danger-ghost btn-small');
  headActions.append(editButton, moveButton, deleteButton);
  head.append(headActions);
  card.append(head);

  card.append(el('p', 'item-text', item.text || 'Ничего не задано.'));

  const photos = Array.isArray(item.photos) ? item.photos : [];
  if (photos.length) {
    const strip = el('div', 'row');
    strip.style.marginTop = '10px';
    for (const fileId of photos) {
      const img = document.createElement('img');
      img.className = 'photo';
      img.src = `/api/files/${encodeURIComponent(fileId)}`;
      img.alt = `Фото к заданию: ${item.subject}`;
      img.loading = 'lazy';
      img.style.maxWidth = '150px';
      strip.append(img);
    }
    card.append(strip);
  }

  const photoFoot = el('div', 'item-foot');
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.className = 'hidden';

  const uploadButton = button('Загрузить фото', 'btn btn-secondary btn-small', () => fileInput.click());
  photoFoot.append(uploadButton);

  if (photos.length) {
    const removeButton = button('Убрать фото', 'btn btn-danger-ghost btn-small', async () => {
      if (!window.confirm(`Убрать все фото у «${item.subject}»?`)) return;
      removeButton.disabled = true;
      try {
        await api('/api/homework/photos/remove', {
          method: 'POST',
          body: { date, subject: item.subject },
        });
        toast('Фото убраны');
        loadHomework();
      } catch (error) {
        toast(error.message);
        removeButton.disabled = false;
      }
    });
    photoFoot.append(removeButton);
  }

  if (item.photoCount) {
    photoFoot.append(el('span', 'small muted', `Фото: ${item.photoCount}`));
  }

  card.append(photoFoot, fileInput);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file || !checkImage(file)) return;

    const original = uploadButton.textContent;
    uploadButton.disabled = true;
    uploadButton.textContent = 'Загружаю…';

    try {
      const photo = await readFileAsDataURL(file);
      await api('/api/homework/photos', {
        method: 'POST',
        body: { date, subject: item.subject, photo },
      });
      toast('Фото добавлено');
      loadHomework();
    } catch (error) {
      toast(error.message);
    } finally {
      uploadButton.disabled = false;
      uploadButton.textContent = original;
    }
  });

  const editBox = el('div', 'form hidden');
  editBox.style.marginTop = '12px';
  const editTextarea = document.createElement('textarea');
  editTextarea.value = item.text || '';
  editTextarea.maxLength = 2000;
  editBox.append(field('Текст задания', editTextarea));

  const editActions = el('div', 'actions');
  const saveButton = button('Сохранить', 'btn btn-small', async () => {
    saveButton.disabled = true;
    try {
      await api('/api/homework', {
        method: 'PUT',
        body: { date, subject: item.subject, text: editTextarea.value },
      });
      toast('Сохранено');
      loadHomework();
    } catch (error) {
      toast(error.message);
      saveButton.disabled = false;
    }
  });
  const cancelButton = button('Отмена', 'btn btn-ghost btn-small', () => {
    editBox.classList.add('hidden');
  });
  editActions.append(saveButton, cancelButton);
  editBox.append(editActions);
  card.append(editBox);

  editButton.addEventListener('click', () => {
    editBox.classList.toggle('hidden');
    if (!editBox.classList.contains('hidden')) editTextarea.focus();
  });

  const moveBox = el('div', 'form hidden');
  moveBox.style.marginTop = '12px';
  const moveDate = document.createElement('input');
  moveDate.type = 'date';
  moveDate.value = addDays(date, 1);
  moveBox.append(field('Новая дата', moveDate));

  const moveActions = el('div', 'actions');
  const moveSave = button('Перенести', 'btn btn-small', async () => {
    if (!moveDate.value) {
      toast('Выбери новую дату');
      return;
    }
    moveSave.disabled = true;
    try {
      const data = await api('/api/homework/move', {
        method: 'POST',
        body: { date, subject: item.subject, toDate: moveDate.value },
      });
      if (data.ok) {
        toast('Задание перенесено');
        loadHomework();
      } else {
        toast('Не удалось перенести задание');
        moveSave.disabled = false;
      }
    } catch (error) {
      toast(error.message);
      moveSave.disabled = false;
    }
  });
  const moveCancel = button('Отмена', 'btn btn-ghost btn-small', () => {
    moveBox.classList.add('hidden');
  });
  moveActions.append(moveSave, moveCancel);
  moveBox.append(moveActions);
  card.append(moveBox);

  moveButton.addEventListener('click', () => {
    moveBox.classList.toggle('hidden');
    if (!moveBox.classList.contains('hidden')) moveDate.focus();
  });

  deleteButton.addEventListener('click', async () => {
    if (!window.confirm(`Удалить «${item.subject}» за ${date}?`)) return;
    deleteButton.disabled = true;
    try {
      await api('/api/homework', {
        method: 'DELETE',
        body: { date, subject: item.subject },
      });
      toast('Удалено');
      loadHomework();
    } catch (error) {
      toast(error.message);
      deleteButton.disabled = false;
    }
  });

  return card;
}

function renderHomeworkList(list, data) {
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) {
    list.replaceChildren(emptyState('На эту дату ДЗ нет', 'Добавь задание формой «Добавить ДЗ».'));
    return;
  }

  list.replaceChildren(...items.map((item) => adminItemCard(data.date, item)));
}

async function loadHomework() {
  const list = document.getElementById('homework-list');
  if (!list) return;

  const token = ++homeworkToken;
  list.replaceChildren(loadingState('Загружаю ДЗ'));

  try {
    const data = await api(`/api/homework?date=${encodeURIComponent(state.date)}`);
    if (token !== homeworkToken || !list.isConnected) return;
    renderHomeworkList(list, data);
  } catch (error) {
    if (token !== homeworkToken || !list.isConnected) return;
    list.replaceChildren(
      errorBox(error.message),
      button('Повторить', 'btn btn-secondary btn-small', () => loadHomework())
    );
  }
}

/* ---------- Добавление ДЗ ---------- */

function buildAddCard() {
  const card = el('section', 'card');

  const head = el('div', 'card-head');
  const info = el('div');
  info.append(
    el('h2', null, 'Добавить ДЗ'),
    el('p', 'card-sub', 'Если предмет уже есть, текст объединится с существующим.')
  );
  head.append(info);
  card.append(head);

  const form = el('form', 'form');
  form.noValidate = true;

  const grid = el('div', 'form-grid two');

  const dateInput = document.createElement('input');
  dateInput.type = 'date';
  dateInput.id = 'add-date';
  dateInput.value = state.date;
  grid.append(field('Дата', dateInput));

  const subjectInput = document.createElement('input');
  subjectInput.type = 'text';
  subjectInput.id = 'add-subject';
  subjectInput.maxLength = 60;
  subjectInput.placeholder = 'Например: Алгебра';
  subjectInput.setAttribute('list', 'admin-subjects');
  grid.append(field('Предмет', subjectInput, 'До 60 символов.'));

  form.append(grid);

  const datalist = document.createElement('datalist');
  datalist.id = 'admin-subjects';
  for (const subject of SUBJECTS) {
    const option = document.createElement('option');
    option.value = subject;
    datalist.append(option);
  }
  form.append(datalist);

  const textarea = document.createElement('textarea');
  textarea.maxLength = 2000;
  textarea.placeholder = 'Что задали? Номер параграфа, страницы, упражнения.';
  form.append(field('Текст задания', textarea, 'До 2000 символов. Можно оставить пустым.'));

  const result = el('div');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn';
  submit.textContent = 'Добавить ДЗ';

  form.append(submit, result);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const date = dateInput.value;
    const subject = subjectInput.value.trim();
    const text = textarea.value.trim();

    if (!date) {
      result.replaceChildren(errorBox('Выбери дату.'));
      return;
    }
    if (!subject) {
      result.replaceChildren(errorBox('Введи предмет.'));
      subjectInput.focus();
      return;
    }

    submit.disabled = true;
    submit.textContent = 'Добавляю…';
    result.replaceChildren();

    try {
      const data = await api('/api/homework', {
        method: 'POST',
        body: { date, subject, text },
      });

      state.date = date;
      const listDate = document.getElementById('admin-date');
      if (listDate) listDate.value = date;
      const duplicateDate = document.getElementById('duplicate-date');
      if (duplicateDate) duplicateDate.value = addDays(date, 1);

      result.replaceChildren(okBox(data.merged ? 'ДЗ добавлено и объединено с существующим.' : 'ДЗ добавлено.'));
      subjectInput.value = '';
      textarea.value = '';
      subjectInput.focus();
      loadHomework();
    } catch (error) {
      result.replaceChildren(errorBox(error.message));
    } finally {
      submit.disabled = false;
      submit.textContent = 'Добавить ДЗ';
    }
  });

  card.append(form);
  return card;
}

/* ---------- Расписание ---------- */

function buildScheduleCard() {
  const card = el('section', 'card');

  const head = el('div', 'card-head');
  const info = el('div');
  info.append(
    el('h2', null, 'Расписание класса'),
    el('p', 'card-sub', 'Загрузи фото расписания — его увидят ученики класса.')
  );
  head.append(info, button('Обновить', 'btn btn-ghost btn-small', () => loadSchedule()));
  card.append(head);

  const body = el('div', 'stack');
  body.id = 'schedule-body';
  body.append(loadingState());
  card.append(body);

  const uploadRow = el('div', 'actions');
  uploadRow.style.marginTop = '14px';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.className = 'hidden';

  const uploadButton = button('Загрузить расписание', 'btn btn-secondary', () => fileInput.click());
  uploadRow.append(uploadButton, el('span', 'small muted', 'Картинка до 5 МБ.'));
  card.append(uploadRow, fileInput);

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (!file || !checkImage(file)) return;

    const original = uploadButton.textContent;
    uploadButton.disabled = true;
    uploadButton.textContent = 'Загружаю…';

    try {
      const photo = await readFileAsDataURL(file);
      await api('/api/schedule', { method: 'POST', body: { photo } });
      toast('Расписание обновлено');
      loadSchedule();
    } catch (error) {
      toast(error.message);
    } finally {
      uploadButton.disabled = false;
      uploadButton.textContent = original;
    }
  });

  return card;
}

function renderSchedule(body, data) {
  if (!data.hasSchedule) {
    body.replaceChildren(emptyState('Расписание не загружено', 'Загрузи фото — его увидят ученики класса.'));
    return;
  }

  const wrap = el('div', 'stack');

  const img = document.createElement('img');
  img.className = 'photo';
  img.src = data.photoUrl;
  img.alt = 'Расписание класса';
  img.loading = 'lazy';
  wrap.append(img);

  if (data.updatedAt) {
    wrap.append(el('p', 'small muted', `Обновлено ${fmtDate(data.updatedAt, true)}`));
  }

  const actions = el('div', 'actions');
  const removeButton = button('Удалить расписание', 'btn btn-danger-ghost btn-small', async () => {
    if (!window.confirm('Удалить расписание класса?')) return;
    removeButton.disabled = true;
    try {
      await api('/api/schedule', { method: 'DELETE' });
      toast('Расписание удалено');
      loadSchedule();
    } catch (error) {
      toast(error.message);
      removeButton.disabled = false;
    }
  });
  actions.append(removeButton);
  wrap.append(actions);

  body.replaceChildren(wrap);
}

async function loadSchedule() {
  const body = document.getElementById('schedule-body');
  if (!body) return;

  const token = ++scheduleToken;
  body.replaceChildren(loadingState());

  try {
    const data = await api('/api/schedule');
    if (token !== scheduleToken || !body.isConnected) return;
    renderSchedule(body, data);
  } catch (error) {
    if (token !== scheduleToken || !body.isConnected) return;
    body.replaceChildren(
      errorBox(error.message),
      button('Повторить', 'btn btn-secondary btn-small', () => loadSchedule())
    );
  }
}

/* ---------- Рассылка классу ---------- */

function buildBroadcastCard() {
  const card = el('section', 'card');

  const head = el('div', 'card-head');
  const info = el('div');
  info.append(
    el('h2', null, 'Рассылка классу'),
    el('p', 'card-sub', 'Сообщение получат ученики твоего класса в Telegram.')
  );
  head.append(info);
  card.append(head);

  const form = el('form', 'form');
  form.noValidate = true;

  const textarea = document.createElement('textarea');
  textarea.maxLength = 4000;
  textarea.placeholder = 'Например: завтра контрольная, повторите формулы.';
  textarea.id = 'broadcast-text';
  form.append(field('Текст сообщения', textarea, 'До 4000 символов.'));

  const counter = el('span', 'small muted', '0 / 4000');
  textarea.addEventListener('input', () => {
    counter.textContent = `${textarea.value.length} / 4000`;
  });

  const result = el('div');
  const actions = el('div', 'actions');

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'btn';
  submit.textContent = 'Отправить классу';

  actions.append(submit, counter);
  form.append(actions, result);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const text = textarea.value.trim();

    if (!text) {
      result.replaceChildren(errorBox('Напиши текст сообщения.'));
      textarea.focus();
      return;
    }

    if (!window.confirm('Отправить сообщение всему классу?')) return;

    submit.disabled = true;
    submit.textContent = 'Отправляю…';
    result.replaceChildren();

    try {
      const data = await api('/api/admin/broadcast', {
        method: 'POST',
        body: { text },
      });

      const total = Number(data.total) || 0;
      const delivered = Number(data.delivered) || 0;
      const failed = Number(data.failed) || 0;

      result.append(okBox(`Отправлено ${delivered} получателям.`));
      if (failed > 0) {
        result.append(warningBox(`Не доставлено: ${failed}. Возможно, кто-то не запускал бота.`));
      }
      if (total === 0) {
        result.append(el('p', 'small muted', 'В классе пока нет получателей с Telegram.'));
      }

      textarea.value = '';
      counter.textContent = '0 / 4000';
    } catch (error) {
      result.replaceChildren(errorBox(error.message));
    } finally {
      submit.disabled = false;
      submit.textContent = 'Отправить классу';
    }
  });

  card.append(form);
  return card;
}

/* ---------- Страница ---------- */

function renderPage() {
  const wrap = el('div', 'stack');
  wrap.append(
    buildStatsCard(),
    buildHomeworkCard(),
    buildAddCard(),
    buildScheduleCard(),
    buildBroadcastCard()
  );
  app.replaceChildren(wrap);

  loadStats();
  loadHomework();
  loadSchedule();
}

function renderDenied() {
  const card = el('div', 'card');
  card.append(el('h1', null, 'Нет доступа'));
  card.append(el('p', 'muted', 'Страница доступна админу класса и создателю. Если тебе нужна роль админа — попроси создателя бота.'));

  const actions = el('div', 'actions');
  actions.append(link('В кабинет', '/app', 'btn btn-secondary'));
  actions.append(link('На главную', '/', 'btn btn-ghost'));
  card.append(actions);

  app.replaceChildren(card);
}

async function init() {
  const user = await getMe();

  if (!user) {
    window.location.replace('/login');
    return;
  }

  state.user = user;
  state.date = todayKey();
  renderHeader(user);

  if (user.role !== 'admin' && user.role !== 'creator') {
    renderDenied();
    return;
  }

  renderPage();
}

init();
