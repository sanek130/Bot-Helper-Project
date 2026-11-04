import { api } from './common.js';

let cachedUser;

export async function getCurrentUser({ required = false } = {}) {
  if (cachedUser !== undefined) return cachedUser;
  try {
    const data = await api(required ? '/api/auth/me' : '/api/auth/me?optional=1', { allow401: !required });
    cachedUser = data?.user || null;
  } catch (err) {
    if (err.status === 401) cachedUser = null;
    else throw err;
  }
  if (!cachedUser && required) {
    const next = encodeURIComponent(window.location.pathname + window.location.search);
    window.location.href = `/login?next=${next}`;
  }
  return cachedUser;
}

// Роль проверяется и на сервере; здесь проверка нужна только чтобы не показывать пустую панель.
export async function requireUser(roles = null) {
  const user = await getCurrentUser({ required: true });
  if (!user) return null;
  if (user.banned && window.location.pathname !== '/support') {
    window.location.href = '/support';
    return null;
  }
  if (roles && !roles.includes(user.role)) {
    window.location.href = '/app';
    return null;
  }
  setupNav(user);
  return user;
}

export function setupNav(user) {
  for (const link of document.querySelectorAll('[data-nav-role]')) {
    const roles = link.dataset.navRole.split(',');
    link.classList.toggle('hidden', !user || !roles.includes(user.role));
  }
  for (const link of document.querySelectorAll('[data-nav-guest]')) {
    link.classList.toggle('hidden', Boolean(user));
  }
  for (const link of document.querySelectorAll('[data-nav-user]')) {
    link.classList.toggle('hidden', !user);
  }
  for (const link of document.querySelectorAll('.nav a')) {
    link.classList.toggle('active', link.getAttribute('href') === window.location.pathname);
  }
}

export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST', allow401: true });
  } finally {
    cachedUser = undefined;
    window.location.href = '/login';
  }
}

export async function logoutAll() {
  try {
    await api('/api/auth/logout-all', { method: 'POST', allow401: true });
  } finally {
    cachedUser = undefined;
    window.location.href = '/login';
  }
}

// Публичные страницы только подстраивают меню под вошедшего пользователя.
export async function initPublicNav() {
  try {
    setupNav(await getCurrentUser());
  } catch {
    setupNav(null);
  }
}
