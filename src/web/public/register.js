// Пошаговая регистрация: город → школа → буква → номер → подтверждение и способ входа.
import {
  api,
  copyText,
  getBotLink,
  getMe,
  renderHeader,
  toast,
} from './common.js';
import {
  googleEnabled,
  mountGoogleButton,
  mountTelegramWidget,
  readTelegramRedirect,
  savePendingProvider,
  takePendingProvider,
  telegramWidgetEnabled,
} from './providers.js';

const CITIES = ['Краснодар', 'Москва', 'Санкт-Петербург', 'Другой город'];
const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К', 'Л', 'М', 'Н', 'О', 'П', 'Р', 'С', 'Т', 'У', 'Ф', 'Х', 'Ц', 'Ч', 'Ш', 'Щ', 'Э', 'Ю', 'Я'];
const NUMBERS = [4, 5, 6, 7, 8, 9, 10, 11];
const POLL_INTERVAL = 5000;

const state = {
  step: 1,
  city: '',
  school: '',
  letter: '',
  number: '',
  provider: null,
  specId: '',
  activationLink: '',
  pollTimer: null,
  active: false,
};

const wizard = document.getElementById('wizard');
const stepsList = document.getElementById('steps');

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined && text !== null) node.textContent = String(text);
  return node;
}

function button(text, className, onClick) {
  const node = el('button', className || 'btn', text);
  node.type = 'button';
  if (onClick) node.addEventListener('click', onClick);
  return node;
}

function linkButton(text, href, className) {
  const node = el('a', className || 'btn', text);
  node.href = href;
  return node;
}

const WIZARD_KEY = 'registerWizard';

// Виджет Telegram уводит со страницы — сохраняем введённые данные
function saveWizard() {
  const { city, school, letter, number } = state;
  sessionStorage.setItem(WIZARD_KEY, JSON.stringify({ city, school, letter, number }));
}

function restoreWizard() {
  try {
    Object.assign(state, JSON.parse(sessionStorage.getItem(WIZARD_KEY) || '{}'));
  } catch {
    // ignore
  }
}

function setStep(step) {
  state.step = Math.min(5, Math.max(1, step));
  saveWizard();
  for (const item of stepsList.querySelectorAll('.step')) {
    const value = Number(item.dataset.step);
    item.classList.toggle('is-active', value === state.step);
    item.classList.toggle('is-done', value < state.step || state.active);
  }
  render();
}

function errorBox(message) {
  const box = el('div', 'error-box');
  box.setAttribute('role', 'alert');
  box.textContent = message;
  return box;
}

function field(labelText, control, hintText) {
  const wrap = el('div', 'field');
  const label = el('label', null, labelText);
  const id = control.id || `field-${Math.random().toString(36).slice(2, 8)}`;
  control.id = id;
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(control.tagName)) label.htmlFor = id;
  wrap.append(label, control);
  if (hintText) wrap.append(el('span', 'hint', hintText));
  return wrap;
}

function select(options, value, onChange, placeholder) {
  const node = document.createElement('select');
  if (placeholder) {
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder;
    empty.disabled = true;
    empty.selected = !value;
    node.append(empty);
  }
  for (const optionData of options) {
    const option = document.createElement('option');
    option.value = optionData.value;
    option.textContent = optionData.label;
    if (optionData.value === value) option.selected = true;
    node.append(option);
  }
  if (onChange) node.addEventListener('change', () => onChange(node.value));
  return node;
}

function stepCity() {
  const form = el('form', 'form');
  form.noValidate = true;

  const citySelect = select(
    CITIES.map((city) => ({ value: city, label: city })),
    state.city,
    (value) => { state.city = value; },
    'Выбери город'
  );
  citySelect.required = true;

  form.append(field('Город', citySelect, 'Если твоего города нет в списке, выбери «Другой город».'));

  if (state.city === 'Другой город') {
    const note = el('div', 'info-box');
    note.textContent = 'Пока поддерживаются Краснодар, Москва и Санкт-Петербург. «Другой город» можно выбрать, но полный список появится позже.';
    form.append(note);
  }

  const actions = el('div', 'actions');
  actions.append(button('Дальше', 'btn', () => {
    if (!state.city) {
      toast('Выбери город');
      return;
    }
    setStep(2);
  }));
  form.append(actions);

  form.addEventListener('submit', (event) => event.preventDefault());
  citySelect.addEventListener('change', () => {
    state.city = citySelect.value;
    render();
  });

  return form;
}

function stepSchool() {
  const form = el('form', 'form');
  form.noValidate = true;

  const input = document.createElement('input');
  input.type = 'text';
  input.value = state.school;
  input.placeholder = 'Например: школа 5, гимназия 1, лицей 2';
  input.maxLength = 80;
  input.autocomplete = 'organization';

  form.append(field('Школа', input, 'Пиши так, как называешь её в классе. Формат: «школа 5» или «гимназия 1».'));

  const actions = el('div', 'actions');
  actions.append(button('Назад', 'btn btn-secondary', () => setStep(1)));
  actions.append(button('Дальше', 'btn', () => {
    const value = input.value.trim().replace(/\s+/g, ' ');
    if (value.length < 2) {
      toast('Название школы слишком короткое');
      input.focus();
      return;
    }
    state.school = value;
    setStep(3);
  }));
  form.append(actions);

  form.addEventListener('submit', (event) => event.preventDefault());
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      form.querySelector('.btn:last-child').click();
    }
  });
  input.addEventListener('input', () => { state.school = input.value; });

  return form;
}

function stepLetter() {
  const form = el('form', 'form');
  form.noValidate = true;

  const letterSelect = select(
    LETTERS.map((letter) => ({ value: letter, label: letter })),
    state.letter,
    null,
    'Выбери букву'
  );

  const preview = el('div', 'info-box');
  const updatePreview = () => {
    preview.textContent = state.letter ? `Буква класса: ${state.letter}` : 'Выбери одну букву — например, А.';
  };
  letterSelect.addEventListener('change', () => {
    state.letter = letterSelect.value;
    updatePreview();
  });
  updatePreview();

  form.append(field('Буква класса', letterSelect, 'Одна буква от А до Я.'), preview);

  const actions = el('div', 'actions');
  actions.append(button('Назад', 'btn btn-secondary', () => setStep(2)));
  actions.append(button('Дальше', 'btn', () => {
    if (!state.letter) {
      toast('Выбери букву класса');
      return;
    }
    setStep(4);
  }));
  form.append(actions);

  form.addEventListener('submit', (event) => event.preventDefault());
  return form;
}

function stepNumber() {
  const form = el('form', 'form');
  form.noValidate = true;

  const numberSelect = select(
    NUMBERS.map((number) => ({ value: String(number), label: `${number} класс` })),
    state.number,
    null,
    'Выбери номер'
  );

  const preview = el('div', 'info-box');
  const updatePreview = () => {
    preview.textContent = state.number
      ? `Твой класс: ${state.number}${state.letter || ''}`
      : 'Выбери номер класса от 4 до 11.';
  };
  numberSelect.addEventListener('change', () => {
    state.number = numberSelect.value;
    updatePreview();
  });
  updatePreview();

  form.append(field('Номер класса', numberSelect, 'От 4 до 11.'), preview);

  const actions = el('div', 'actions');
  actions.append(button('Назад', 'btn btn-secondary', () => setStep(3)));
  actions.append(button('Дальше', 'btn', () => {
    if (!state.number) {
      toast('Выбери номер класса');
      return;
    }
    setStep(5);
  }));
  form.append(actions);

  form.addEventListener('submit', (event) => event.preventDefault());
  return form;
}

const PROVIDER_LABELS = { telegramAuth: 'Telegram', telegramInitData: 'Telegram', googleCredential: 'Google' };

function providerName(provider) {
  const key = provider && Object.keys(provider).find((name) => PROVIDER_LABELS[name]);
  return key ? PROVIDER_LABELS[key] : '';
}

async function submitRegistration(provider, submit, errorHolder) {
  const original = submit ? submit.textContent : '';
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Регистрирую…';
  }
  errorHolder.replaceChildren();

  try {
    const data = await api('/api/auth/register', {
      method: 'POST',
      noRedirect: true,
      body: {
        city: state.city,
        school: state.school,
        class: `${state.number}${state.letter}`,
        ...(provider || {}),
      },
    });

    sessionStorage.removeItem(WIZARD_KEY);
    if (data.registered) {
      toast('Аккаунт создан');
      window.location.assign('/app');
      return;
    }

    state.specId = data.specId;
    state.activationLink = data.activationLink || '';
    state.step = 7;
    state.active = false;
    renderSuccess();
    startPolling();
  } catch (error) {
    errorHolder.replaceChildren(errorBox(error.message));
    if (error.code === 'already_registered') {
      errorHolder.append(linkButton('Войти', '/login', 'btn btn-small'));
    }
    if (submit) {
      submit.disabled = false;
      submit.textContent = original;
    }
  }
}

function stepConfirm() {
  const block = el('div', 'form');
  const errorHolder = el('div');

  const facts = el('dl', 'facts');
  const rows = [
    ['Город', state.city],
    ['Школа', state.school],
    ['Класс', `${state.number}${state.letter}`],
  ];

  for (const [name, value] of rows) {
    const wrap = el('div');
    wrap.append(el('dt', null, name), el('dd', null, value));
    facts.append(wrap);
  }

  block.append(facts);

  const back = el('div', 'actions');
  back.append(button('Назад', 'btn btn-secondary', () => setStep(4)));

  // Способ входа уже выбран на странице входа (Google/Telegram)
  if (state.provider) {
    const submit = button(`Создать аккаунт через ${providerName(state.provider)}`, 'btn', () => submitRegistration(state.provider, submit, errorHolder));
    back.append(submit);
    block.append(back, errorHolder);
    return block;
  }

  block.append(el('h3', null, 'Как будешь входить?'));

  const viaBot = el('div', 'card card-flat');
  viaBot.append(el('strong', null, 'Через Telegram-бота'), el('p', 'small muted', 'Получишь спец-ID и подтвердишь аккаунт в боте. Потом можно добавить номер телефона.'));
  const botSubmit = button('Продолжить в Telegram', 'btn', () => submitRegistration(null, botSubmit, errorHolder));
  viaBot.append(botSubmit);
  block.append(viaBot);

  if (telegramWidgetEnabled() || googleEnabled()) {
    const quick = el('div', 'card card-flat');
    quick.append(el('strong', null, 'В один клик'), el('p', 'small muted', 'Аккаунт сразу станет активным.'));
    const telegram = el('div', 'provider-slot');
    const google = el('div', 'provider-slot');
    quick.append(telegram, google);
    if (!mountTelegramWidget(telegram, '/register')) telegram.remove();
    mountGoogleButton(google, (credential) => submitRegistration({ googleCredential: credential }, null, errorHolder), 'signup_with')
      .then((ok) => { if (!ok) google.remove(); });
    block.append(quick);
  }

  block.append(back, errorHolder);
  return block;
}

function renderSuccess() {
  for (const item of stepsList.querySelectorAll('.step')) {
    item.classList.toggle('is-done', true);
    item.classList.toggle('is-active', false);
  }

  const card = el('div', 'stack');

  const head = el('div', 'card-head');
  const textBlock = el('div');
  textBlock.append(
    el('h2', null, 'Аккаунт создан'),
    el('p', 'muted', 'Остался один шаг — подтвердить аккаунт в Telegram.')
  );
  head.append(textBlock);
  card.append(head);

  const idBox = el('div', 'spec-id');
  const idText = el('div');
  idText.append(
    el('div', 'small muted', 'Твой спец-ID'),
    el('strong', 'mono', state.specId)
  );
  const copyButton = button('Скопировать', 'btn btn-secondary btn-small', async () => {
    try {
      await copyText(state.specId);
      toast('Спец-ID скопирован');
    } catch (error) {
      toast(error.message);
    }
  });
  idBox.append(idText, copyButton);
  card.append(idBox);

  const explain = el('div', 'info-box');
  explain.textContent = 'Спец-ID нужен для входа на сайт и в бота. Сохрани его и никому не передавай.';
  card.append(explain);

  const finish = el('div', 'card card-flat');
  finish.append(el('h3', null, 'Заверши регистрацию в боте'));

  if (state.activationLink) {
    finish.append(el('p', 'muted', 'Открой ссылку, нажми «Начать» и подтверди аккаунт. Ссылка действует 30 минут.'));
    const actionLink = linkButton('Открыть в Telegram', state.activationLink, 'btn');
    actionLink.target = '_blank';
    actionLink.rel = 'noopener noreferrer';
    actionLink.id = 'activation-link';
    finish.append(actionLink);
  } else {
    finish.append(el('p', 'muted', 'Открой бота и подтверди аккаунт.'));
    const botLink = linkButton('Бот в Telegram', getBotLink(), 'btn');
    botLink.target = '_blank';
    botLink.rel = 'noopener noreferrer';
    finish.append(botLink);
  }

  const statusBox = el('div', 'info-box');
  statusBox.id = 'pending-status';
  statusBox.textContent = 'Жду подтверждения в Telegram. Проверяю каждые 5 секунд…';
  finish.append(statusBox);

  card.append(finish);

  const nav = el('div', 'actions');
  nav.append(linkButton('Войти по спец-ID', '/login', 'btn btn-secondary'));
  card.append(nav);

  wizard.replaceChildren(card);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function stopPolling() {
  if (state.pollTimer) {
    window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function startPolling() {
  stopPolling();
  state.pollTimer = window.setInterval(checkPending, POLL_INTERVAL);
}

async function checkPending() {
  if (!state.specId || state.active) return;
  const statusBox = document.getElementById('pending-status');

  try {
    const data = await api(`/api/auth/pending?specId=${encodeURIComponent(state.specId)}`);

    if (data.status === 'active') {
      state.active = true;
      stopPolling();
      if (statusBox) {
        statusBox.className = 'ok-box';
        statusBox.replaceChildren();
        const title = el('strong', null, 'Аккаунт активен');
        const text = el('div', null, 'Можно входить на сайт.');
        const enter = linkButton('Войти', '/login', 'btn btn-small');
        enter.style.marginTop = '10px';
        statusBox.append(title, text, enter);
      }
      toast('Аккаунт активен');
      for (const item of stepsList.querySelectorAll('.step')) item.classList.add('is-done');
      return;
    }

    if (data.activationLink && statusBox) {
      const existing = document.getElementById('activation-link');
      if (existing) {
        existing.href = data.activationLink;
      } else if (data.activationLink) {
        const actionLink = linkButton('Открыть в Telegram', data.activationLink, 'btn');
        actionLink.id = 'activation-link';
        actionLink.target = '_blank';
        actionLink.rel = 'noopener noreferrer';
        statusBox.parentElement.append(actionLink);
      }
    }
  } catch (error) {
    if (error.status === 404) {
      stopPolling();
      if (statusBox) {
        statusBox.className = 'error-box';
        statusBox.replaceChildren();
        statusBox.append(el('strong', null, 'Заявка не найдена'));
        statusBox.append(el('div', null, 'Возможно, прошло больше 24 часов. Зарегистрируйся заново.'));
        const again = linkButton('Начать заново', '/register', 'btn btn-small');
        again.style.marginTop = '10px';
        statusBox.append(again);
      }
      return;
    }
    // Сетевые ошибки игнорируем: следующая проверка повторится сама.
  }
}

function render() {
  if (!wizard) return;
  if (state.step === 7) return;

  switch (state.step) {
    case 1:
      wizard.replaceChildren(stepCity());
      break;
    case 2:
      wizard.replaceChildren(stepSchool());
      break;
    case 3:
      wizard.replaceChildren(stepLetter());
      break;
    case 4:
      wizard.replaceChildren(stepNumber());
      break;
    case 5:
      wizard.replaceChildren(stepConfirm());
      break;
    default:
      setStep(1);
  }

  const input = wizard.querySelector('input[type="text"]');
  if (input && state.step === 2) input.focus();

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function init() {
  const user = await getMe();
  renderHeader(user);

  if (user) {
    stepsList.classList.add('hidden');
    const box = el('div', 'info-box');
    box.textContent = `Ты уже вошёл как ${user.firstName || user.username || 'пользователь'}. Регистрация не нужна.`;
    const enter = linkButton('Открыть кабинет', '/app', 'btn btn-small');
    enter.style.marginTop = '10px';
    box.append(enter);
    wizard.replaceChildren(box);
    return;
  }

  restoreWizard();
  const telegramAuth = readTelegramRedirect();
  state.provider = telegramAuth ? { telegramAuth } : takePendingProvider();
  if (state.provider) {
    savePendingProvider(state.provider);
    const notice = el('div', 'info-box');
    notice.textContent = `Вход через ${providerName(state.provider)} подтверждён. Осталось указать класс.`;
    wizard.before(notice);
  }

  const ready = state.city && state.school && state.letter && state.number;
  if (ready && telegramAuth) setStep(5);
  else render();
}

window.addEventListener('beforeunload', stopPolling);
init();
