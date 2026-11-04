import { api, escapeHtml, errorMessage, showAlert, copyToClipboard, capitalize } from './common.js';
import { initPublicNav } from './auth.js';

const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К', 'Л', 'М', 'Н', 'О', 'П', 'Р', 'С', 'Т', 'У', 'Ф', 'Х', 'Ц', 'Ч', 'Ш', 'Щ', 'Э', 'Ю', 'Я'];
const NUMBERS = [4, 5, 6, 7, 8, 9, 10, 11];
const ROLES = [
  { value: 'user', title: 'Ученик', hint: 'Смотрю ДЗ и расписание класса.' },
  { value: 'admin', title: 'Админ класса', hint: 'Добавляю ДЗ и расписание для всего класса.' },
];

const content = document.getElementById('step-content');
const alertBox = document.getElementById('register-alert');
const steps = [...document.querySelectorAll('#steps span')];
const state = { cities: [], schools: [], cityId: '', cityName: '', school: '', schoolType: '', schoolNumber: '', letter: '', number: 0, role: '', firstName: '' };
let step = 1;
let subStep = ''; // подшаг на этапе школы: '' | 'none' | 'number'

function markSteps() {
  steps.forEach((el, i) => el.classList.toggle('on', i < step));
}

function backButton() {
  return step > 1 ? '<button type="button" class="secondary" data-action="back">Назад</button>' : '';
}

function backTarget() {
  // Из подшагов создания школы возвращаемся на список школ, а не на предыдущий шаг целиком.
  if (step === 2 && subStep === 'number') return 'none';
  if (step === 2 && subStep === 'none') return 'list';
  return '';
}

function choiceButtons(values, active, action) {
  return values
    .map(
      (value) =>
        `<button type="button" data-action="${action}" data-value="${escapeHtml(value)}" class="${String(value) === String(active) ? 'active' : ''}">${escapeHtml(value)}</button>`,
    )
    .join('');
}

function renderCity() {
  const options = state.cities
    .map((city) => `<option value="${escapeHtml(city.id)}" ${city.id === state.cityId ? 'selected' : ''}>${escapeHtml(city.name)}</option>`)
    .join('');
  content.innerHTML = `
    <h2>Шаг 1. Город</h2>
    <div class="field"><label for="first-name">Как тебя зовут (необязательно)</label>
      <input id="first-name" maxlength="64" value="${escapeHtml(state.firstName)}"></div>
    <div class="field"><label for="city">Выбери город</label>
      <select id="city"><option value="">— выбери —</option>${options}</select></div>
    <div class="row"><button type="button" data-action="city-next">Далее</button></div>`;
}

function renderSchool() {
  content.innerHTML = `
    <h2>Шаг 2. Школа</h2>
    <p class="muted">Город: ${escapeHtml(state.cityName)}</p>
    <div class="field"><label for="school-filter">Поиск школы</label>
      <input id="school-filter" placeholder="Например, 25 или гимназия"></div>
    <div class="list-scroll stack" id="school-list"></div>
    <div class="row" style="margin-top:12px">
      <button type="button" class="secondary" data-action="school-none">Нет моей школы</button>
    </div>
    <div class="row">${backButton()}</div>`;
  const list = document.getElementById('school-list');
  const draw = (filter) => {
    const q = filter.trim().toLowerCase();
    const items = state.schools.filter((name) => !q || name.toLowerCase().includes(q));
    list.innerHTML = items.length
      ? items
          .map(
            (name) =>
              `<button type="button" class="secondary ${name === state.school ? 'active' : ''}" data-action="school" data-value="${escapeHtml(name)}">${escapeHtml(capitalize(name))}</button>`,
          )
          .join('')
      : '<p class="muted">Ничего не найдено. Нажми «Нет моей школы».</p>';
  };
  draw('');
  document.getElementById('school-filter').addEventListener('input', (event) => draw(event.target.value));
}

function renderSchoolNone() {
  content.innerHTML = `
    <h2>Шаг 2. Своя школа</h2>
    <p class="muted">Выбери тип школы:</p>
    <div class="choice-list">${choiceButtons(['лицей', 'гимназия', 'школа'], state.schoolType, 'school-type')}</div>
    <div class="row" style="margin-top:12px">${backButton()}<button type="button" data-action="school-number-next">Далее</button></div>`;
}

function renderSchoolNumber() {
  content.innerHTML = `
    <h2>Шаг 2. Номер школы</h2>
    <p class="muted">Тип: <b>${escapeHtml(state.schoolType)}</b>. Введи номер школы (только цифры).</p>
    <div class="field"><label for="school-number">Номер школы</label>
      <input id="school-number" inputmode="numeric" maxlength="4" value="${escapeHtml(state.schoolNumber)}" placeholder="Например, 25"></div>
    <div class="row" style="margin-top:12px">${backButton()}<button type="button" data-action="school-create">Продолжить</button></div>`;
}

function renderLetter() {
  content.innerHTML = `
    <h2>Шаг 3. Буква класса</h2>
    <div class="choice-list">${choiceButtons(LETTERS, state.letter, 'letter')}</div>
    <div class="row" style="margin-top:12px">${backButton()}</div>`;
}

function renderNumber() {
  content.innerHTML = `
    <h2>Шаг 4. Номер класса</h2>
    <div class="choice-list">${choiceButtons(NUMBERS, state.number, 'number')}</div>
    <div class="row" style="margin-top:12px">${backButton()}</div>`;
}

function renderRole() {
  const cards = ROLES.map(
    (role) => `<button type="button" class="secondary" data-action="role" data-value="${role.value}">
      <span><strong>${escapeHtml(role.title)}</strong><br><span class="small">${escapeHtml(role.hint)}</span></span></button>`,
  ).join('');
  content.innerHTML = `
    <h2>Шаг 5. Роль</h2>
    <div class="stack">${cards}</div>
    <div class="row" style="margin-top:12px">${backButton()}</div>`;
}

function renderConfirm() {
  const role = ROLES.find((item) => item.value === state.role);
  content.innerHTML = `
    <h2>Шаг 6. Подтверждение</h2>
    <dl class="kv">
      <dt>Имя</dt><dd>${escapeHtml(state.firstName || '—')}</dd>
      <dt>Город</dt><dd>${escapeHtml(state.cityName)}</dd>
      <dt>Школа</dt><dd>${escapeHtml(capitalize(state.school))}</dd>
      <dt>Класс</dt><dd>${escapeHtml(`${state.number}${state.letter}`)}</dd>
      <dt>Роль</dt><dd>${escapeHtml(role?.title || '')}</dd>
    </dl>
    <div class="row" style="margin-top:12px">${backButton()}<button type="button" data-action="submit">Зарегистрироваться</button></div>`;
}

function renderDone(result) {
  steps.forEach((el) => el.classList.add('on'));
  const specBlock = `
    <p>Твой спец-ID — это пароль от аккаунта. Сохрани его:</p>
    <p><code id="spec-id">${escapeHtml(result.specId)}</code></p>
    <div class="row"><button type="button" class="secondary" data-action="copy">Скопировать</button></div>`;
  if (result.active) {
    const note = result.linked
      ? '<p class="muted">Аккаунт привязан к твоему Telegram: полный доступ к фото, уведомлениям и ответам поддержки.</p>'
      : `<div class="alert">В боте у тебя основным остаётся аккаунт «${escapeHtml(capitalize(result.current?.school || ''))}, ${escapeHtml(result.current?.class || '')}». Новый аккаунт появится в боте в списке «Мои аккаунты», а сделать его основным можно в профиле кабинета.</div>`;
    content.innerHTML = `
      <h2>Аккаунт создан</h2>
      ${specBlock}
      ${note}
      <div class="row" style="margin-top:16px"><a class="btn" href="/app">Открыть кабинет</a></div>`;
    return;
  }
  content.innerHTML = `
    <h2>Почти готово</h2>
    ${specBlock}
    <div class="card" style="margin-top:16px">
      <h3>Заверши регистрацию в боте</h3>
      <p class="muted">Открой ссылку в Telegram и нажми «Запустить». Ссылка действует 30 минут. После этого аккаунт привяжется к твоему Telegram.</p>
      <a class="btn" href="${escapeHtml(result.botLink)}" target="_blank" rel="noopener">Открыть бота</a>
    </div>
    <p class="muted">После подтверждения в боте войди на сайт через <a href="/login?mode=tg">Telegram ID</a> или по <a href="/login?spec=${encodeURIComponent(result.specId)}">спец-ID</a>.</p>`;
}

async function loadTgStatus() {
  try {
    const status = await api('/api/auth/tg/status', { allow401: true });
    const banner = document.getElementById('tg-verify-banner');
    banner.classList.remove('hidden');
    if (status.verified) {
      document.getElementById('tg-verify-text').innerHTML = `<b>Telegram ID <code>${escapeHtml(status.tgId)}</code> подтверждён.</b> <span class="muted">Аккаунт заработает сразу после регистрации.</span>`;
      document.getElementById('tg-verify-link').classList.add('hidden');
      if (status.accounts?.length) {
        document.querySelector('#tg-banner .muted').textContent = `Аккаунтов у этого Telegram: ${status.accounts.length}. Можно войти в любой из них.`;
        document.querySelector('#tg-banner a').setAttribute('href', '/login?mode=tg');
      }
    }
  } catch {
    // Баннер необязательный.
  }
}

function render() {
  markSteps();
  showAlert(alertBox, '');
  if (step !== 2) subStep = '';
  if (step === 2 && subStep === 'none') return renderSchoolNone();
  if (step === 2 && subStep === 'number') return renderSchoolNumber();
  const renderers = { 1: renderCity, 2: renderSchool, 3: renderLetter, 4: renderNumber, 5: renderRole, 6: renderConfirm };
  return renderers[step]();
}

async function loadSchools() {
  const { schools } = await api(`/api/data/schools?cityId=${encodeURIComponent(state.cityId)}`, { allow401: true });
  state.schools = schools;
}

// «Нет моей школы»: если такая уже есть в справочнике — выбираем её, иначе создаём новую.
async function createCustomSchool(button) {
  const number = document.getElementById('school-number').value.trim();
  if (!/^\d{1,4}$/.test(number)) {
    showAlert(alertBox, 'Введи номер школы цифрами, например: 25.', 'error');
    return;
  }
  button.disabled = true;
  try {
    const check = await api('/api/data/school/check', {
      method: 'POST',
      allow401: true,
      body: { cityId: state.cityId, type: state.schoolType, number },
    });
    let name = check.name;
    if (!check.exists) {
      const created = await api('/api/data/school/create', {
        method: 'POST',
        allow401: true,
        body: { cityId: state.cityId, type: state.schoolType, number },
      });
      name = created.school.name;
    }
    state.schoolNumber = number;
    state.school = name;
    subStep = '';
    if (!state.schools.includes(name)) state.schools.push(name);
    showAlert(alertBox, check.exists ? `Такая школа уже есть: ${capitalize(name)}.` : `Добавил новую школу: ${capitalize(name)}.`, 'success');
    step = 3;
    render();
  } catch (err) {
    showAlert(alertBox, errorMessage(err), 'error');
    button.disabled = false;
  }
}

async function submit(button) {
  button.disabled = true;
  try {
    const result = await api('/api/auth/register', {
      method: 'POST',
      allow401: true,
      body: {
        firstName: state.firstName,
        cityId: state.cityId,
        school: state.school,
        letter: state.letter,
        number: state.number,
        role: state.role,
      },
    });
    renderDone(result);
  } catch (err) {
    showAlert(alertBox, errorMessage(err), 'error');
    button.disabled = false;
  }
}

content.addEventListener('click', async (event) => {
  const button = event.target.closest('[data-action]');
  if (!button) return;
  const { action, value } = button.dataset;
  try {
    if (action === 'back') {
      // Из подшагов «своей школы» возвращаемся на шаг назад внутри школы, а не к городу.
      const target = backTarget();
      if (target === 'none') subStep = 'none';
      else if (target === 'list') subStep = '';
      else step -= 1;
      render();
    } else if (action === 'school-none') {
      subStep = 'none';
      render();
    } else if (action === 'school-type') {
      state.schoolType = value;
      render();
    } else if (action === 'school-number-next') {
      if (!state.schoolType) {
        showAlert(alertBox, 'Выбери тип школы.', 'error');
        return;
      }
      subStep = 'number';
      render();
    } else if (action === 'school-create') {
      await createCustomSchool(button);
    } else if (action === 'city-next') {
      const cityId = document.getElementById('city').value;
      state.firstName = document.getElementById('first-name').value.trim();
      const city = state.cities.find((item) => item.id === cityId);
      if (!city) {
        showAlert(alertBox, errorMessage({ code: 'invalid_city' }), 'error');
        return;
      }
      if (city.id !== state.cityId) state.school = '';
      state.cityId = city.id;
      state.cityName = city.name;
      await loadSchools();
      step = 2;
      render();
    } else if (action === 'school') {
      state.school = value;
      step = 3;
      render();
    } else if (action === 'letter') {
      state.letter = value;
      step = 4;
      render();
    } else if (action === 'number') {
      state.number = Number(value);
      step = 5;
      render();
    } else if (action === 'role') {
      state.role = value;
      step = 6;
      render();
    } else if (action === 'submit') {
      await submit(button);
    } else if (action === 'copy') {
      const ok = await copyToClipboard(document.getElementById('spec-id').textContent);
      showAlert(alertBox, ok ? 'Спец-ID скопирован.' : 'Не удалось скопировать, выдели его вручную.', ok ? 'success' : 'error');
    }
  } catch (err) {
    showAlert(alertBox, errorMessage(err), 'error');
  }
});

async function init() {
  initPublicNav();
  loadTgStatus();
  try {
    const { cities } = await api('/api/data/cities', { allow401: true });
    state.cities = cities;
    render();
  } catch (err) {
    showAlert(alertBox, errorMessage(err), 'error');
  }
}

init();
