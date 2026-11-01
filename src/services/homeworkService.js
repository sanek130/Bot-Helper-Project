import { Homework } from '../db/models/Homework.js';
import { User } from '../db/models/User.js';
import { getSubjectHash, getSubjectByHash, rememberSubject } from '../utils/subjects.js';
import { truncate, escapeRegex } from '../utils/normalize.js';

export const ENTRY_LIMIT = 2000;
export const TOTAL_LIMIT = 4000;
export const PHOTO_LIMIT = 10;
const SEPARATOR = '\n———\n';

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function sameAuthor(a, b) {
  return a !== undefined && a !== null && String(a) === String(b);
}

export function getClassKey(school, className) {
  return `${school}::${className}`;
}

export function parseClassKey(classKey) {
  const [school, ...classParts] = String(classKey ?? '').split('::');
  return { school, class: classParts.join('::') };
}

export async function getHomeworkByClassKey(classKey) {
  if (!classKey) return null;
  return Homework.findOne({ classKey });
}

export async function getOrCreateHomework(classKey) {
  const existing = await Homework.findOne({ classKey });
  if (existing) return existing;
  try {
    return await Homework.create({ classKey, data: {}, schedulePhotoId: null });
  } catch (err) {
    // Два админа одновременно добавили первое ДЗ класса: второй получает уже созданный документ.
    if (err?.code === 11000) return Homework.findOne({ classKey });
    throw err;
  }
}

export async function getDayHomework(classKey, dateKey) {
  const homework = await getHomeworkByClassKey(classKey);
  const day = homework?.data?.[dateKey];
  if (!day || typeof day !== 'object') return { dateKey, subjects: {} };
  return { dateKey, subjects: day };
}

function uniquePhotos(list) {
  const result = [];
  for (const id of list) {
    if (typeof id === 'string' && id && !result.includes(id)) result.push(id);
  }
  return result;
}

export function mergeHomeworkTask(existingTask, newText, newPhotoIds) {
  const incomingText = truncate(String(newText ?? '').trim(), ENTRY_LIMIT);
  const incomingPhotos = Array.isArray(newPhotoIds) ? newPhotoIds : [];
  if (!existingTask) {
    return { text: incomingText, photoIds: uniquePhotos(incomingPhotos).slice(0, PHOTO_LIMIT) };
  }
  const oldText = String(existingTask.text ?? '').trim();
  let text = oldText;
  if (oldText && incomingText) text = `${oldText}${SEPARATOR}${incomingText}`;
  else if (incomingText) text = incomingText;
  text = truncate(text, TOTAL_LIMIT);
  // Новые фото идут первыми, причём самое последнее присланное — в самом начале:
  // в карточке и на сайте админ сразу видит то, что добавил только что.
  const photoIds = uniquePhotos([...[...incomingPhotos].reverse(), ...(existingTask.photoIds || [])]).slice(0, PHOTO_LIMIT);
  return { text, photoIds };
}

export async function addHomework(classKey, dateKey, subjectName, text, photoIds = [], addedByTgId = null) {
  const subjectHash = getSubjectHash(subjectName);
  rememberSubject(subjectName);
  const homework = await getOrCreateHomework(classKey);
  if (!homework.data || typeof homework.data !== 'object') homework.data = {};
  if (!homework.data[dateKey]) homework.data[dateKey] = {};
  const existing = homework.data[dateKey][subjectHash] || null;
  const merged = mergeHomeworkTask(existing && (existing.text || existing.photoIds?.length) ? existing : null, text, photoIds);
  const now = new Date();
  homework.data[dateKey][subjectHash] = {
    subject: existing?.subject || String(subjectName).toLowerCase().trim(),
    text: merged.text,
    photoIds: merged.photoIds,
    addedBy: existing?.addedBy ?? addedByTgId,
    addedAt: existing?.addedAt || now,
    updatedAt: now,
    updatedBy: addedByTgId,
  };
  homework.markModified('data');
  await homework.save();
  return { subjectHash, text: merged.text, photoIds: merged.photoIds };
}

function getTaskOrFail(homework, dateKey, subjectHash) {
  const task = homework?.data?.[dateKey]?.[subjectHash];
  if (!task) throw fail('subject_not_found');
  return task;
}

function dropIfEmpty(homework, dateKey) {
  if (homework.data[dateKey] && Object.keys(homework.data[dateKey]).length === 0) delete homework.data[dateKey];
}

export async function removeSubject(classKey, dateKey, subjectHash) {
  const homework = await getHomeworkByClassKey(classKey);
  if (!homework?.data?.[dateKey]?.[subjectHash]) return { success: false, reason: 'not_found' };
  delete homework.data[dateKey][subjectHash];
  dropIfEmpty(homework, dateKey);
  homework.markModified('data');
  await homework.save();
  return { success: true };
}

function mergeTasks(target, source) {
  const merged = mergeHomeworkTask(target, source.text, source.photoIds);
  return {
    ...target,
    text: merged.text,
    photoIds: merged.photoIds,
    updatedAt: new Date(),
  };
}

export async function moveSubject(classKey, fromDateKey, toDateKey, subjectHash) {
  const homework = await getHomeworkByClassKey(classKey);
  const task = getTaskOrFail(homework, fromDateKey, subjectHash);
  if (fromDateKey === toDateKey) throw fail('same_day');
  if (!homework.data[toDateKey]) homework.data[toDateKey] = {};
  const target = homework.data[toDateKey][subjectHash];
  homework.data[toDateKey][subjectHash] = target ? mergeTasks(target, task) : { ...task, updatedAt: new Date() };
  delete homework.data[fromDateKey][subjectHash];
  dropIfEmpty(homework, fromDateKey);
  homework.markModified('data');
  await homework.save();
  return { success: true, merged: Boolean(target) };
}

export async function changeSubject(classKey, dateKey, oldSubjectHash, newSubjectHash, newSubjectName = null) {
  const homework = await getHomeworkByClassKey(classKey);
  const task = getTaskOrFail(homework, dateKey, oldSubjectHash);
  if (oldSubjectHash === newSubjectHash) throw fail('same_subject');
  const name = newSubjectName || getSubjectByHash(newSubjectHash);
  if (!name) throw fail('unknown_subject');
  const target = homework.data[dateKey][newSubjectHash];
  homework.data[dateKey][newSubjectHash] = target
    ? mergeTasks(target, task)
    : { ...task, subject: String(name).toLowerCase().trim(), updatedAt: new Date() };
  delete homework.data[dateKey][oldSubjectHash];
  homework.markModified('data');
  await homework.save();
  return { success: true, merged: Boolean(target) };
}

export async function replaceText(classKey, dateKey, subjectHash, newText) {
  const homework = await getHomeworkByClassKey(classKey);
  const task = getTaskOrFail(homework, dateKey, subjectHash);
  task.text = truncate(String(newText ?? '').trim(), ENTRY_LIMIT);
  task.updatedAt = new Date();
  homework.markModified('data');
  await homework.save();
  return { success: true };
}

export async function addPhotoToTask(classKey, dateKey, subjectHash, photoId) {
  const homework = await getHomeworkByClassKey(classKey);
  const task = getTaskOrFail(homework, dateKey, subjectHash);
  const photos = Array.isArray(task.photoIds) ? task.photoIds : [];
  if (photos.includes(photoId)) return { success: false, reason: 'duplicate' };
  if (photos.length >= PHOTO_LIMIT) return { success: false, reason: 'limit' };
  task.photoIds = [photoId, ...photos];
  task.updatedAt = new Date();
  homework.markModified('data');
  await homework.save();
  return { success: true };
}

export async function removePhotos(classKey, dateKey, subjectHash) {
  const homework = await getHomeworkByClassKey(classKey);
  const task = getTaskOrFail(homework, dateKey, subjectHash);
  task.photoIds = [];
  task.updatedAt = new Date();
  homework.markModified('data');
  await homework.save();
  return { success: true };
}

export async function replacePhotos(classKey, dateKey, subjectHash, photoIds) {
  const homework = await getHomeworkByClassKey(classKey);
  const task = getTaskOrFail(homework, dateKey, subjectHash);
  task.photoIds = uniquePhotos(photoIds || []).slice(0, PHOTO_LIMIT);
  task.updatedAt = new Date();
  homework.markModified('data');
  await homework.save();
  return { success: true };
}

export async function setSchedulePhoto(classKey, photoId) {
  const homework = await getOrCreateHomework(classKey);
  homework.schedulePhotoId = photoId;
  await homework.save();
  return { success: true };
}

export async function getSchedulePhoto(classKey) {
  const homework = await getHomeworkByClassKey(classKey);
  return homework?.schedulePhotoId || null;
}

// Пользователь ищется по tgId (бот) или по specId (сайт): у веб-пользователя tgId может не быть.
function userFilter(key) {
  if (typeof key === 'string' && key.includes('-')) return { specId: key };
  return { tgId: Number(key) };
}

export async function toggleCompletedHomework(key, dateKey, subjectHash) {
  const user = await User.findOne(userFilter(key));
  if (!user) throw fail('user_not_found');
  const completed = user.completedHomework && typeof user.completedHomework === 'object' ? user.completedHomework : {};
  const list = Array.isArray(completed[dateKey]) ? [...completed[dateKey]] : [];
  const index = list.indexOf(subjectHash);
  if (index >= 0) list.splice(index, 1);
  else list.push(subjectHash);
  if (list.length > 0) completed[dateKey] = list;
  else delete completed[dateKey];
  user.completedHomework = completed;
  user.markModified('completedHomework');
  await user.save();
  return { completed: index < 0 };
}

export function isCompleted(user, dateKey, subjectHash) {
  const list = user?.completedHomework?.[dateKey];
  return Array.isArray(list) && list.includes(subjectHash);
}

export function taskSubjectName(subjectHash, task) {
  return task?.subject || getSubjectByHash(subjectHash) || 'предмет';
}

export async function getSubjectsForDate(classKey, dateKey) {
  const { subjects } = await getDayHomework(classKey, dateKey);
  return Object.entries(subjects)
    .map(([subjectHash, task]) => ({
      subjectHash,
      subjectName: taskSubjectName(subjectHash, task),
      text: task?.text || '',
      photoIds: Array.isArray(task?.photoIds) ? task.photoIds : [],
      addedBy: task?.addedBy ?? null,
      addedAt: task?.addedAt ? new Date(task.addedAt) : null,
    }))
    .sort((a, b) => (a.addedAt?.getTime() || 0) - (b.addedAt?.getTime() || 0));
}

export async function hasHomeworkOnDate(classKey, dateKey) {
  const { subjects } = await getDayHomework(classKey, dateKey);
  return Object.keys(subjects).length > 0;
}

export async function getDatesWithHomework(classKey, startDateKey, endDateKey) {
  const homework = await getHomeworkByClassKey(classKey);
  if (!homework?.data) return [];
  return Object.keys(homework.data)
    .filter((dateKey) => dateKey >= startDateKey && dateKey <= endDateKey)
    .filter((dateKey) => Object.keys(homework.data[dateKey] || {}).length > 0)
    .sort();
}

// Переименование класса (смена класса последним учеником): данные переносятся,
// а при совпадении дней и предметов задания сливаются, чтобы ничего не потерять.
export async function renameClassKey(oldClassKey, newClassKey) {
  if (!oldClassKey || !newClassKey || oldClassKey === newClassKey) return { success: false };
  const source = await getHomeworkByClassKey(oldClassKey);
  if (!source) return { success: false };
  const target = await getHomeworkByClassKey(newClassKey);
  if (!target) {
    source.classKey = newClassKey;
    await source.save();
    return { success: true, merged: false };
  }
  for (const [dateKey, day] of Object.entries(source.data || {})) {
    if (!target.data[dateKey]) target.data[dateKey] = {};
    for (const [subjectHash, task] of Object.entries(day || {})) {
      const existing = target.data[dateKey][subjectHash];
      target.data[dateKey][subjectHash] = existing ? mergeTasks(existing, task) : task;
    }
  }
  if (!target.schedulePhotoId && source.schedulePhotoId) target.schedulePhotoId = source.schedulePhotoId;
  target.markModified('data');
  await target.save();
  await Homework.deleteOne({ _id: source._id });
  return { success: true, merged: true };
}

export async function removeHomeworkByAdmin(tgId) {
  if (tgId === undefined || tgId === null || tgId === '') return { removedCount: 0 };
  let removedCount = 0;
  const documents = await Homework.find({});
  for (const homework of documents) {
    let changed = false;
    for (const dateKey of Object.keys(homework.data || {})) {
      const day = homework.data[dateKey] || {};
      for (const subjectHash of Object.keys(day)) {
        if (sameAuthor(day[subjectHash]?.addedBy, tgId)) {
          delete day[subjectHash];
          removedCount += 1;
          changed = true;
        }
      }
      if (Object.keys(day).length === 0) {
        delete homework.data[dateKey];
        changed = true;
      }
    }
    if (changed) {
      homework.markModified('data');
      await homework.save();
    }
  }
  return { removedCount };
}

export async function listClassKeys(limit = 100) {
  const docs = await Homework.find({}, { classKey: 1 }).sort({ updatedAt: -1 }).limit(limit).lean();
  const fromHomework = docs.map((doc) => doc.classKey);
  const pairs = await User.aggregate([
    { $match: { status: 'active', school: { $ne: '' }, class: { $ne: '' } } },
    { $group: { _id: { school: '$school', class: '$class' } } },
    { $limit: limit },
  ]);
  const fromUsers = pairs.map((p) => getClassKey(p._id.school, p._id.class));
  return [...new Set([...fromHomework, ...fromUsers])].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true })).slice(0, limit);
}

export async function countAddedOn(classKey, dateKey) {
  const homework = await getHomeworkByClassKey(classKey);
  if (!homework?.data) return 0;
  let count = 0;
  for (const day of Object.values(homework.data)) {
    for (const task of Object.values(day || {})) {
      if (task?.addedAt && toMoscowKey(task.addedAt) === dateKey) count += 1;
    }
  }
  return count;
}

const keyFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
function toMoscowKey(value) {
  return keyFormatter.format(new Date(value));
}

export async function countByAuthor(classKey, authorKey) {
  const homework = await getHomeworkByClassKey(classKey);
  let mine = 0;
  let others = 0;
  for (const day of Object.values(homework?.data || {})) {
    for (const task of Object.values(day || {})) {
      if (sameAuthor(task?.addedBy, authorKey)) mine += 1;
      else others += 1;
    }
  }
  return { myCount: mine, othersCount: others };
}

export async function searchHomework(classKey, query, limit = 50) {
  const homework = await getHomeworkByClassKey(classKey);
  const q = String(query ?? '').trim();
  if (!homework?.data || q.length < 2) return [];
  const re = new RegExp(escapeRegex(q), 'i');
  const results = [];
  for (const dateKey of Object.keys(homework.data).sort().reverse()) {
    for (const [subjectHash, task] of Object.entries(homework.data[dateKey] || {})) {
      const subjectName = taskSubjectName(subjectHash, task);
      if (re.test(task?.text || '') || re.test(subjectName)) {
        results.push({ dateKey, subjectHash, subjectName, text: task?.text || '', photoIds: task?.photoIds || [] });
        if (results.length >= limit) return results;
      }
    }
  }
  return results;
}

// Копирование дня: каждый предмет сливается с уже существующим через mergeHomeworkTask,
// поэтому повторное копирование не теряет записи на целевой дате.
export async function duplicateDay(classKey, fromDateKey, toDateKey, updatedBy = null) {
  if (fromDateKey === toDateKey) throw fail('same_day');
  const homework = await getHomeworkByClassKey(classKey);
  const source = homework?.data?.[fromDateKey];
  if (!source || Object.keys(source).length === 0) throw fail('day_empty');
  if (!homework.data[toDateKey]) homework.data[toDateKey] = {};
  const now = new Date();
  let subjectsCount = 0;
  for (const [subjectHash, task] of Object.entries(source)) {
    const existing = homework.data[toDateKey][subjectHash] || null;
    const merged = mergeHomeworkTask(existing, task?.text || '', task?.photoIds || []);
    homework.data[toDateKey][subjectHash] = {
      subject: existing?.subject || task?.subject || '',
      text: merged.text,
      photoIds: merged.photoIds,
      addedBy: existing?.addedBy ?? task?.addedBy ?? updatedBy,
      addedAt: existing?.addedAt || now,
      updatedAt: now,
      updatedBy,
    };
    subjectsCount += 1;
  }
  homework.markModified('data');
  await homework.save();
  return { subjectsCount };
}
