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
const state = { cities: [], schools: [], cityId: '', cityName: '', school: '', letter: '', number: 0, role: '', firstName: '' };
let step = 1;

function markSteps() {
  steps.forEach((el, i) => el.classList.toggle('on', i < step));
}

function backButton() {
  return step > 1 ? '<button type="button" class="secondary" data-action="back">Назад</button>' : '';
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
    <p class="muted small">Нет твоей школы? Зарегистрируйся в боте — там можно добавить новую.</p>
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
      : '<p class="muted">Ничего не найдено.</p>';
  };
  draw('');
  document.getElementById('school-filter').addEventListener('input', (event) => draw(event.target.value));
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
  content.innerHTML = `
    <h2>Почти готово</h2>
    <p>Твой спец-ID — сохрани его, он нужен для входа на сайт:</p>
    <p><code id="spec-id">${escapeHtml(result.specId)}</code></p>
    <div class="row"><button type="button" class="secondary" data-action="copy">Скопировать</button></div>
    <div class="card" style="margin-top:16px">
      <h3>Заверши регистрацию в боте</h3>
      <p class="muted">Открой ссылку в Telegram и нажми «Запустить». Ссылка действует 30 минут.</p>
      <a class="btn" href="${escapeHtml(result.botLink)}" target="_blank" rel="noopener">Открыть бота</a>
    </div>
    <p class="muted">После подтверждения в боте войди на сайт по <a href="/login?spec=${encodeURIComponent(result.specId)}">спец-ID</a>.</p>`;
}

function render() {
  markSteps();
  showAlert(alertBox, '');
  const renderers = { 1: renderCity, 2: renderSchool, 3: renderLetter, 4: renderNumber, 5: renderRole, 6: renderConfirm };
  renderers[step]();
}

async function loadSchools() {
  const { schools } = await api(`/api/data/schools?cityId=${encodeURIComponent(state.cityId)}`, { allow401: true });
  state.schools = schools;
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
      step -= 1;
      render();
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
  try {
    const { cities } = await api('/api/data/cities', { allow401: true });
    state.cities = cities;
    render();
  } catch (err) {
    showAlert(alertBox, errorMessage(err), 'error');
  }
}

init();
