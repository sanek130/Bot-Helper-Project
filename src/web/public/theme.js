// Выбор цветовой схемы сайта. Схема хранится в localStorage и действует на всех страницах.

const THEME_KEY = 'hw-theme';
const DEFAULT_THEME = 'navy';

// Порядок и id должны совпадать со списком в theme-init.js.
export const THEMES = [
  { id: 'navy', label: 'Тёмно-синяя', bg: '#0f2350' },
  { id: 'mint-dark', label: 'Зелёная', bg: '#1f3a33' },
  { id: 'white-blue', label: 'Голубая', bg: '#c6d4ea' },
  { id: 'light', label: 'Светлая', bg: '#d6dccd' },
  { id: 'beige', label: 'Бежевая', bg: '#d9c9a8' },
  { id: 'blue', label: 'Синяя', bg: '#2050a0' },
  { id: 'black-blue', label: 'Чёрная', bg: '#000000' },
  { id: 'purple', label: 'Фиолетовая', bg: '#3a2a4a' },
  { id: 'dark-gray', label: 'Серая', bg: '#333333' },
  { id: 'red', label: 'Красная', bg: '#4a1010' },
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

export function setTheme(id) {
  applyTheme(id);
  try {
    localStorage.setItem(THEME_KEY, id);
  } catch {
    // игнорируем недоступное хранилище
  }
}

// Обычный выпадающий список «Оформление» в подвале.
export function mountThemeSwitch() {
  const footer = document.querySelector('.site-footer .container') || document.body;
  if (footer.querySelector('.theme-switch')) return;
  const label = document.createElement('label');
  label.className = 'theme-switch';
  label.textContent = 'Оформление: ';
  const select = document.createElement('select');
  for (const theme of THEMES) select.add(new Option(theme.label, theme.id));
  select.value = getStoredTheme();
  select.addEventListener('change', () => setTheme(select.value));
  label.appendChild(select);
  footer.appendChild(label);
}

applyTheme(getStoredTheme());

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mountThemeSwitch, { once: true });
} else {
  mountThemeSwitch();
}
