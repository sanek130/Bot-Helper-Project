// Нормализация пользовательского ввода: регистр, лишние пробелы, управляющие символы
export function normalizeText(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

// Экранирование HTML для parse_mode: 'HTML'
export function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Название школы: 2–80 символов, без двойных пробелов и управляющих символов
export function sanitizeSchoolName(name) {
  if (name === null || name === undefined) return null;
  const cleaned = String(name)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (cleaned.length < 2 || cleaned.length > 80) return null;
  return cleaned;
}

// Название предмета: 1–60 символов
export function sanitizeSubjectName(name) {
  if (name === null || name === undefined) return null;
  const cleaned = String(name)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
  if (cleaned.length < 1 || cleaned.length > 60) return null;
  return cleaned;
}

// Обрезать длинный текст для сообщения
export function truncate(text, max) {
  const value = String(text ?? '');
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

// UUID v4 из спец-ID
export function isValidSpecId(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

// Приводит номер к виду +79991234567. Российские 8XXXXXXXXXX и 9XXXXXXXXX → +7.
export function normalizePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('8')) digits = `7${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith('9')) digits = `7${digits}`;
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}
