import { z } from 'zod';

// Валидация ФИО (только буквы, пробелы, дефис)
export const fullNameSchema = z.string()
  .min(2, 'ФИО должно содержать минимум 2 символа')
  .max(50, 'ФИО не должно превышать 50 символов')
  .regex(/^[\p{L}\s\-]+$/u, 'ФИО должно содержать только буквы, пробелы и дефис');

// Валидация названия города/школы
export const nameSchema = z.string()
  .min(2, 'Название должно содержать минимум 2 символа')
  .max(100, 'Название не должно превышать 100 символов')
  .regex(/^[\p{L}\p{N}\s\-\.\#]+$/u, 'Название содержит недопустимые символы');

// Валидация класса (буква + цифра)
export const classGradeSchema = z.string()
  .regex(/^\d+[А-ЯЁ]$/i, 'Класс должен быть в формате "9А", "11Б" и т.д.');

// Валидация роли
export const roleSchema = z.enum(['student', 'class_admin', 'admin']);

// Валидация часового пояса
export const timezoneSchema = z.string()
  .refine(
    (tz) => {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
      } catch {
        return false;
      }
    },
    { message: 'Неверный формат часового пояса' }
  );

// Валидация времени (HH:MM)
export const timeSchema = z.string()
  .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, 'Время должно быть в формате HH:MM');

// Валидация Telegram ID
export const telegramIdSchema = z.number().int().positive();

// Схема для шага онбординга "Город"
export const cityStepSchema = z.object({
  cityName: nameSchema
});

// Схема для шага онбординга "Школа"
export const schoolStepSchema = z.object({
  schoolName: nameSchema
});

// Схема для шага онбординга "Класс"
export const classStepSchema = z.object({
  grade: z.number().int().min(1).max(11),
  letter: z.string().regex(/^[А-ЯЁ]$/i, 'Буква класса должна быть одной русской буквой')
});

// Полная схема данных пользователя для онбординга
export const onboardingSchema = z.object({
  fullName: fullNameSchema,
  city: z.string(),
  school: z.string(),
  classGrade: classGradeSchema,
  role: roleSchema,
  timezone: timezoneSchema.optional().default('Europe/Moscow')
});

// Схема для заявки админа
export const adminRequestSchema = z.object({
  fullName: fullNameSchema,
  requestedRole: roleSchema,
  comment: z.string().max(500).optional()
});

export default {
  fullNameSchema,
  nameSchema,
  classGradeSchema,
  roleSchema,
  timezoneSchema,
  timeSchema,
  telegramIdSchema,
  cityStepSchema,
  schoolStepSchema,
  classStepSchema,
  onboardingSchema,
  adminRequestSchema
};
