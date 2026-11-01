export function escapeHtml(text) {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function escapeRegex(text) {
  return String(text ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeText(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitize(text, min, max, errorCode) {
  const value = String(text ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
  if (value.length < min || value.length > max) {
    const error = new Error(errorCode);
    error.code = errorCode;
    error.min = min;
    error.max = max;
    throw error;
  }
  return value;
}

export function sanitizeSchoolName(text) {
  return sanitize(text, 2, 80, 'invalid_school_name');
}

export function sanitizeSubjectName(text) {
  return sanitize(text, 1, 60, 'invalid_subject_name');
}

export function truncate(text, maxLen) {
  const value = String(text ?? '');
  if (value.length <= maxLen) return value;
  return `${value.slice(0, Math.max(0, maxLen - 3))}...`;
}

// Подстановка {var} в строки из TEXTS. Значения экранируются, если не указано иное.
export function fill(template, vars = {}, { escape = true } = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => {
    if (!(key in vars)) return match;
    const value = vars[key] ?? '';
    return escape ? escapeHtml(value) : String(value);
  });
}
