import { Homework } from './models/Homework.js';
import { User } from './models/User.js';

export function homeworkKey(user) {
  if (!user?.class) return '';
  return user.school ? `${user.school}::${user.class}` : user.class;
}

export function classLabel(user) {
  if (!user?.class) return '';
  return user.school ? `${user.school} · ${user.class}` : user.class;
}

function extractText(task) {
  if (!task) return '';
  if (typeof task === 'string') return task;
  return task.text || '';
}

export function collectPhotoIds(task) {
  const ids = [];
  if (!task || typeof task !== 'object') return ids;
  if (Array.isArray(task.photo_ids)) {
    for (const id of task.photo_ids) {
      if (id && !ids.includes(id)) ids.push(id);
    }
  }
  if (task.photo_id && !ids.includes(task.photo_id)) ids.unshift(task.photo_id);
  return ids;
}

export function taskHasPhoto(task) {
  if (!task || typeof task !== 'object') return false;
  return Boolean(task.photo_id || (Array.isArray(task.photo_ids) && task.photo_ids.length));
}

/** New assignment text goes on top of the existing subject block. */
export function mergeHomeworkTask(existing, incoming) {
  if (existing == null || existing === '') return incoming;

  const oldText = extractText(existing);
  const newText = extractText(incoming);
  const text = oldText ? `${newText}\n\n———\n\n${oldText}` : newText;

  const oldPhotos = collectPhotoIds(existing);
  const newPhotos = collectPhotoIds(incoming);
  const photo_ids = [
    ...newPhotos,
    ...oldPhotos.filter((id) => !newPhotos.includes(id)),
  ];

  const result = {
    type: photo_ids.length || incoming?.photo_url || existing?.photo_url ? 'photo' : (incoming?.type || 'text'),
    text,
  };

  if (photo_ids.length) {
    result.photo_id = photo_ids[0];
    result.photo_ids = photo_ids;
  }
  if (incoming?.photo_url) result.photo_url = incoming.photo_url;
  else if (existing?.photo_url) result.photo_url = existing.photo_url;

  return result;
}

export async function incrementHomeworkAdded(userId) {
  await User.updateOne(
    { id: String(userId) },
    { $inc: { 'stats.homework_added': 1 } }
  );
}

/** Move legacy class-only homework onto school::class once the user picks a school. */
export async function migrateHomeworkToSchool(user) {
  if (!user?.school || !user?.class) return;
  const newKey = homeworkKey(user);
  const oldKey = user.class;
  if (!newKey || newKey === oldKey) return;

  const existingNew = await Homework.findOne({ classKey: newKey });
  if (existingNew) return;

  const old = await Homework.findOne({ classKey: oldKey });
  if (!old) return;

  await Homework.updateOne({ _id: old._id }, { $set: { classKey: newKey } });
}
