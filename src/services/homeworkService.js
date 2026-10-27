import { Homework } from '../db/models/Homework.js';
import { User } from '../db/models/User.js';

export const MAX_TEXT_LENGTH = 2000;
export const MAX_TOTAL_TEXT_LENGTH = 4000;
export const MAX_PHOTOS_PER_SUBJECT = 10;
export const SEPARATOR = '———';

export function getClassKey(user) {
  if (!user?.class) return '';
  return user.school ? `${user.school}::${user.class}` : user.class;
}

export function getClassLabel(user) {
  if (!user?.class) return '';
  return user.school ? `${user.school}, класс ${user.class}` : `класс ${user.class}`;
}

export function parseClassKey(classKey) {
  const value = String(classKey || '');
  const index = value.indexOf('::');
  if (index === -1) return { school: null, className: value };
  return { school: value.slice(0, index), className: value.slice(index + 2) };
}

export function collectPhotoIds(task) {
  if (!task) return [];
  if (typeof task === 'string') return [];
  const ids = [];
  const push = (id) => {
    if (typeof id === 'string' && id && !ids.includes(id)) ids.push(id);
  };
  if (Array.isArray(task.photoIds)) task.photoIds.forEach(push);
  push(task.photoId);
  return ids;
}

export function taskHasPhoto(task) {
  return collectPhotoIds(task).length > 0;
}

export function getTaskText(task) {
  if (!task) return '';
  return typeof task === 'string' ? task : String(task.text || '');
}

function normalizeTask(task) {
  if (!task) return { text: '', photoIds: [] };
  if (typeof task === 'string') return { text: task, photoIds: [] };
  return {
    text: String(task.text || ''),
    photoIds: collectPhotoIds(task),
  };
}

function limitRecordText(text) {
  const value = String(text || '').trim();
  if (value.length <= MAX_TEXT_LENGTH) return value;
  return `${value.slice(0, MAX_TEXT_LENGTH - 1).trimEnd()}…`;
}

function limitTotalText(text) {
  if (text.length <= MAX_TOTAL_TEXT_LENGTH) return text;
  return `…${text.slice(text.length - MAX_TOTAL_TEXT_LENGTH + 1)}`;
}

/**
 * Новое задание дописывается к старому через «———».
 * Каждая запись ограничена 2000 символами, фото — 10 на предмет, без дублей.
 */
export function mergeHomeworkTask(existing, incoming) {
  const oldTask = normalizeTask(existing);
  const newTask = normalizeTask(incoming);

  const newText = limitRecordText(newTask.text);
  let text = oldTask.text && newText ? `${oldTask.text}\n\n${SEPARATOR}\n\n${newText}` : (oldTask.text || newText);
  text = limitTotalText(text);

  const photoIds = [...newTask.photoIds, ...oldTask.photoIds.filter((id) => !newTask.photoIds.includes(id))]
    .slice(0, MAX_PHOTOS_PER_SUBJECT);

  return {
    text,
    photoIds,
    addedBy: incoming?.addedBy ?? existing?.addedBy,
    addedAt: incoming?.addedAt ?? existing?.addedAt ?? new Date().toISOString(),
  };
}

function normalizeData(data) {
  const result = {};
  for (const [dateKey, day] of Object.entries(data || {})) {
    result[dateKey] = {};
    for (const [subject, task] of Object.entries(day || {})) {
      result[dateKey][subject] = typeof task === 'string' ? { text: task, photoIds: [] } : task;
    }
  }
  return result;
}

export async function getClassHomework(classKey) {
  const doc = await Homework.findOne({ classKey }).lean();
  return normalizeData(doc?.data);
}

export async function getDayData(classKey, dateKey) {
  const data = await getClassHomework(classKey);
  return data[dateKey] || {};
}

async function mutateClass(classKey, mutate) {
  let doc = await Homework.findOne({ classKey });
  if (!doc) {
    doc = new Homework({ classKey, data: {} });
  }

  const result = mutate(doc);
  doc.markModified('data');
  doc.updatedAt = new Date();
  await doc.save();
  return result;
}

export async function addHomework({ classKey, dateKey, subject, text, photoIds = [], addedBy, addedAt }) {
  const incoming = {
    text,
    photoIds,
    addedBy,
    addedAt: addedAt || new Date(),
  };

  return mutateClass(classKey, (doc) => {
    const data = doc.data || {};
    if (!data[dateKey]) data[dateKey] = {};
    const existed = Boolean(data[dateKey][subject]);
    data[dateKey][subject] = mergeHomeworkTask(data[dateKey][subject], incoming);
    doc.data = data;
    return { task: data[dateKey][subject], merged: existed };
  });
}

export async function removeSubject(classKey, dateKey, subject) {
  return mutateClass(classKey, (doc) => {
    const data = doc.data || {};
    if (!data[dateKey]?.[subject]) return false;

    delete data[dateKey][subject];
    if (Object.keys(data[dateKey]).length === 0) delete data[dateKey];
    doc.data = data;
    return true;
  });
}

export async function removePhotos(classKey, dateKey, subject) {
  return mutateClass(classKey, (doc) => {
    const task = doc.data?.[dateKey]?.[subject];
    if (!task) return false;
    task.photoIds = [];
    doc.markModified('data');
    return true;
  });
}

export async function replaceText(classKey, dateKey, subject, text) {
  return mutateClass(classKey, (doc) => {
    const task = doc.data?.[dateKey]?.[subject];
    if (!task) return null;
    task.text = limitRecordText(text);
    doc.markModified('data');
    return task;
  });
}

export async function changeSubject(classKey, dateKey, oldSubject, newSubject) {
  return mutateClass(classKey, (doc) => {
    const day = doc.data?.[dateKey];
    if (!day?.[oldSubject]) return null;

    day[newSubject] = mergeHomeworkTask(day[newSubject], day[oldSubject]);
    delete day[oldSubject];
    doc.markModified('data');
    return day[newSubject];
  });
}

export async function moveSubject(classKey, dateKey, subject, targetDateKey) {
  let movedTask = null;

  await mutateClass(classKey, (doc) => {
    const data = doc.data || {};
    const task = data[dateKey]?.[subject];
    if (!task) return;

    movedTask = task;
    delete data[dateKey][subject];
    if (Object.keys(data[dateKey]).length === 0) delete data[dateKey];

    if (!data[targetDateKey]) data[targetDateKey] = {};
    data[targetDateKey][subject] = mergeHomeworkTask(data[targetDateKey][subject], task);
    doc.data = data;
  });

  return movedTask;
}

export async function duplicateDay(classKey, fromDateKey, toDateKey) {
  let copied = 0;

  await mutateClass(classKey, (doc) => {
    const data = doc.data || {};
    const source = data[fromDateKey];
    if (!source) return;

    if (!data[toDateKey]) data[toDateKey] = {};
    for (const [subject, task] of Object.entries(source)) {
      data[toDateKey][subject] = mergeHomeworkTask(data[toDateKey][subject], task);
      copied += 1;
    }
    doc.data = data;
  });

  return copied;
}

// Переименование ключа «Класс» → «Школа::Класс» при появлении школы у пользователя
export async function renameClassKey(oldKey, newKey) {
  if (!oldKey || !newKey || oldKey === newKey) return false;

  const oldDoc = await Homework.findOne({ classKey: oldKey });
  if (!oldDoc) return false;

  const newDoc = await Homework.findOne({ classKey: newKey });
  if (!newDoc) {
    oldDoc.classKey = newKey;
    oldDoc.updatedAt = new Date();
    await oldDoc.save();
    return true;
  }

  if (!newDoc.schedulePhotoId && oldDoc.schedulePhotoId) {
    newDoc.schedulePhotoId = oldDoc.schedulePhotoId;
  }
  for (const [dateKey, day] of Object.entries(oldDoc.data || {})) {
    newDoc.data[dateKey] = newDoc.data[dateKey] || {};
    for (const [subject, task] of Object.entries(day)) {
      newDoc.data[dateKey][subject] = mergeHomeworkTask(newDoc.data[dateKey][subject], task);
    }
  }
  newDoc.markModified('data');
  newDoc.updatedAt = new Date();
  await newDoc.save();
  await oldDoc.deleteOne();
  return true;
}

export async function getSchedulePhotoId(classKey) {
  const doc = await Homework.findOne({ classKey }).lean();
  return doc?.schedulePhotoId || null;
}

export async function setSchedulePhotoId(classKey, photoId) {
  await mutateClass(classKey, (doc) => {
    doc.schedulePhotoId = photoId;
  });
}

export async function touchUserActivity(tgId, { viewed = false, added = false } = {}) {
  const update = { $set: { 'stats.lastActive': new Date() } };
  if (viewed || added) {
    update.$inc = {};
    if (viewed) update.$inc['stats.homeworkViews'] = 1;
    if (added) update.$inc['stats.homeworkAdded'] = 1;
  }
  await User.updateOne({ tgId: Number(tgId) }, update);
}

export async function addPhotoToTask(classKey, dateKey, subject, fileId) {
  return mutateClass(classKey, (doc) => {
    const task = doc.data?.[dateKey]?.[subject];
    if (!task) return false;
    const photos = [fileId, ...collectPhotoIds(task).filter((id) => id !== fileId)].slice(0, MAX_PHOTOS_PER_SUBJECT);
    task.photoIds = photos;
    doc.markModified('data');
    return true;
  });
}
