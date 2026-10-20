import { Homework } from '../db/models/Homework.js';
import { User } from '../db/models/User.js';

const MAX_TEXT_LENGTH = 2000;
const MAX_PHOTOS_PER_SUBJECT = 10;

/**
 * Получить ключ класса для пользователя
 */
export function getClassKey(user) {
  if (!user?.class) return '';
  return user.school ? `${user.school}::${user.class}` : user.class;
}

/**
 * Получить метку класса для отображения
 */
export function getClassLabel(user) {
  if (!user?.class) return '';
  return user.school ? `${user.school} · ${user.class}` : user.class;
}

/**
 * Извлечь текст из задания
 */
function extractText(task) {
  if (!task) return '';
  if (typeof task === 'string') return task;
  return task.text || '';
}

/**
 * Собрать ID фото из задания
 */
export function collectPhotoIds(task) {
  const ids = [];
  if (!task || typeof task !== 'object') return ids;
  if (Array.isArray(task.photoIds)) {
    for (const id of task.photoIds) {
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  if (task.photoId && !ids.includes(task.photoId)) ids.unshift(task.photoId);
  return ids;
}

/**
 * Проверить, есть ли фото в задании
 */
export function taskHasPhoto(task) {
  if (!task || typeof task !== 'object') return false;
  return Boolean(task.photoId || (Array.isArray(task.photoIds) && task.photoIds.length));
}

/**
 * Объединить задания (новое дописывается сверху через "———")
 */
export function mergeHomeworkTask(existing, incoming) {
  if (existing == null || existing === '') return incoming;

  const oldText = extractText(existing);
  const newText = extractText(incoming);
  
  // Ограничение длины текста
  const trimmedNewText = newText.length > MAX_TEXT_LENGTH 
    ? newText.slice(0, MAX_TEXT_LENGTH) + '…' 
    : newText;
  
  const text = oldText ? `${trimmedNewText}\n\n———\n\n${oldText}` : trimmedNewText;

  const oldPhotos = collectPhotoIds(existing);
  const newPhotos = collectPhotoIds(incoming);
  
  // Ограничение количества фото
  const photoIds = [
    ...newPhotos,
    ...oldPhotos.filter((id) => !newPhotos.includes(id)),
  ].slice(0, MAX_PHOTOS_PER_SUBJECT);

  const result = {
    type: photoIds.length ? 'photo' : 'text',
    text,
  };

  if (photoIds.length) {
    result.photoId = photoIds[0];
    result.photoIds = photoIds;
  }

  return result;
}

/**
 * Получить ДЗ для класса
 */
export async function getClassHomework(classKey) {
  try {
    const hw = await Homework.findOne({ classKey });
    return hw ? hw.data : {};
  } catch (e) {
    console.error('Ошибка получения ДЗ:', e);
    return {};
  }
}

/**
 * Сохранить ДЗ для класса
 */
export async function saveClassHomework(classKey, data, schedulePhotoId = null) {
  try {
    const updateData = { classKey, data, updatedAt: new Date() };
    if (schedulePhotoId !== null) {
      updateData.schedulePhotoId = schedulePhotoId;
    }
    await Homework.findOneAndUpdate(
      { classKey },
      updateData,
      { upsert: true, new: true }
    );
    return true;
  } catch (e) {
    console.error('Ошибка сохранения ДЗ:', e);
    return false;
  }
}

/**
 * Получить file_id расписания
 */
export async function getSchedulePhotoId(classKey) {
  try {
    const hw = await Homework.findOne({ classKey });
    return hw?.schedulePhotoId || null;
  } catch (e) {
    console.error('Ошибка получения расписания:', e);
    return null;
  }
}

/**
 * Установить file_id расписания
 */
export async function setSchedulePhotoId(classKey, photoId) {
  try {
    await Homework.findOneAndUpdate(
      { classKey },
      { 
        schedulePhotoId: photoId, 
        updatedAt: new Date() 
      },
      { upsert: true, new: true }
    );
    return true;
  } catch (e) {
    console.error('Ошибка сохранения расписания:', e);
    return false;
  }
}

/**
 * Увеличить счётчик добавленных ДЗ у пользователя
 */
export async function incrementHomeworkAdded(userId) {
  await User.updateOne(
    { tgId: Number(userId) },
    { $inc: { 'stats.homeworkAdded': 1 } }
  );
}

/**
 * Миграция ДЗ при добавлении школы пользователю
 */
export async function migrateHomeworkToSchool(user) {
  if (!user?.school || !user?.class) return;
  const newKey = getClassKey(user);
  const oldKey = user.class;
  if (!newKey || newKey === oldKey) return;

  const existingNew = await Homework.findOne({ classKey: newKey });
  if (existingNew) return;

  const old = await Homework.findOne({ classKey: oldKey });
  if (!old) return;

  await Homework.updateOne({ _id: old._id }, { $set: { classKey: newKey } });
}
