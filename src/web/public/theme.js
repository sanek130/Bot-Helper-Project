// Переключатель тем оформления по дизайн-пакету hw-helper-design-handoff.
// Тема хранится в localStorage и применяется ко всем страницам сайта.

const THEME_KEY = 'hw-theme';
const DEFAULT_THEME = 'navy';

// Порядок и id должны совпадать со списком в theme-init.js.
export const THEMES = [
  { id: 'navy', label: 'Тёмно-синяя', bg: '#0b1730', accent: '#8cc4ff' },
  { id: 'mint-dark', label: 'Мятная тёмная', bg: '#101917', accent: '#b7f08b' },
  { id: 'white-blue', label: 'Бело-синяя', bg: '#f3f7fc', accent: '#2e67ce' },
  { id: 'light', label: 'Светлая', bg: '#f2f5ef', accent: '#34764e' },
  { id: 'beige', label: 'Бежевая', bg: '#f1e7d8', accent: '#a9513b' },
  { id: 'blue', label: 'Синяя', bg: '#123a7d', accent: '#9dd8f5' },
  { id: 'black-blue', label: 'Чёрно-синяя', bg: '#080d17', accent: '#7ba8ff' },
  { id: 'purple', label: 'Фиолетовая', bg: '#1b1420', accent: '#d3a6df' },
  { id: 'dark-gray', label: 'Тёмно-серая', bg: '#17191b', accent: '#cfda91' },
  { id: 'red', label: 'Красная', bg: '#201113', accent: '#ed918d' },
];

export function getStoredTheme() {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved && THEMES.some((t) => t.id === saved)) return saved;
  } catch {
    // localStorage может быть недоступен (например, в приватном режиме)
  }
  return DEFAULT_THEME;
}

export function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  document.documentElement.dataset.theme = theme.id;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme.bg);
}

// Кнопка выбора темы создаётся здесь, чтобы список тем жил в одном месте.
export function mountThemeSwitch() {
  let wrap = document.querySelector('.theme-switch');
  if (!wrap) {
    wrap = document.createElement('div');
    wrap.className = 'theme-switch';
    wrap.innerHTML = `
      <button class="theme-switch-toggle" type="button" aria-haspopup="true" aria-expanded="false" aria-label="Выбрать тему оформления">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/>
          <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
          <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/>
          <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
        </svg>
        <span class="theme-switch-label">Стиль</span>
      </button>
      <div class="theme-switch-panel" role="menu" aria-label="Темы оформления"></div>
    `;
    const panel = wrap.querySelector('.theme-switch-panel');
    for (const theme of THEMES) {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'theme-switch-item';
      item.dataset.themeId = theme.id;
      item.setAttribute('role', 'menuitemradio');
      item.innerHTML = `<span class="theme-dot" style="background: linear-gradient(135deg, ${theme.bg} 50%, ${theme.accent} 50%);"></span><span>${theme.label}</span>`;
      panel.appendChild(item);
    }
    document.body.appendChild(wrap);
  }

  const panel = wrap.querySelector('.theme-switch-panel');
  const toggle = wrap.querySelector('.theme-switch-toggle');

  for (const item of panel.querySelectorAll('.theme-switch-item')) {
    item.addEventListener('click', () => {
      setTheme(item.dataset.themeId);
      close();
    });
  }

  function refreshActive() {
    const current = document.documentElement.dataset.theme;
    for (const btn of panel.querySelectorAll('.theme-switch-item')) {
      const active = btn.dataset.themeId === current;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-checked', String(active));
    }
  }

  window.addEventListener('hw-theme-change', refreshActive);

  function open() {
    wrap.classList.add('open');
    toggle.setAttribute('aria-expanded', 'true');
  }

  function close() {
    wrap.classList.remove('open');
    toggle.setAttribute('aria-expanded', 'false');
  }

  toggle.addEventListener('click', () => {
    if (wrap.classList.contains('open')) close();
    else open();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') close();
  });

  document.addEventListener('click', (event) => {
    if (!wrap.contains(event.target)) close();
  });

  refreshActive();
}

export function setTheme(id) {
  applyTheme(id);
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    // игнорируем недоступное хранилище
  }
  window.dispatchEvent(new CustomEvent('hw-theme-change', { detail: { theme: id } }));
}

// theme-init.js в <head> уже применил тему до отрисовки; здесь
// синхронизируем состояние и активируем кнопку переключения.
applyTheme(getStoredTheme());

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountThemeSwitch, { once: true });
} else {
  mountThemeSwitch();
}
