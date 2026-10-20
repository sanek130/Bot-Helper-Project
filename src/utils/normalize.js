// Нормализация текста: нижний регистр, очистка пробелов
export function normalizeText(text) {
  if (!text) return '';
  return String(text).trim().toLowerCase().replace(/\s+/g, ' ');
}

// Экранирование HTML
export function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Очистка названия школы
export function sanitizeSchoolName(name) {
  if (!name) return null;
  const cleaned = String(name).trim().replace(/\s+/g, ' ');
  if (cleaned.length < 2 || cleaned.length > 80) return null;
  return cleaned;
}
