import mongoose from 'mongoose';
import { Report } from '../db/models/Report.js';
import { getUserBySpecId } from './userService.js';

const DAY_MS = 24 * 60 * 60 * 1000;

function fail(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

export async function canFileComplaint(fromUserId, onAdminId) {
  const since = new Date(Date.now() - DAY_MS);
  const last = await Report.findOne({ onAdminId, fromUserId, createdAt: { $gte: since } }).sort({ createdAt: -1 });
  if (!last) return { allowed: true, nextAttemptAt: new Date() };
  return { allowed: false, nextAttemptAt: new Date(last.createdAt.getTime() + DAY_MS) };
}

// fromUserId и onAdminId — specId: так жалобы работают и для аккаунтов без Telegram.
export async function createReport(fromUserId, onAdminId, classKey, text) {
  const value = String(text ?? '').trim();
  if (value.length < 10 || value.length > 1000) throw fail('invalid_text');
  if (fromUserId === onAdminId) throw fail('self_report');
  const { allowed } = await canFileComplaint(fromUserId, onAdminId);
  if (!allowed) throw fail('too_frequent');
  return Report.create({ fromUserId, onAdminId, classKey, text: value, status: 'open' });
}

export async function getOpenReports(limit = 20) {
  const reports = await Report.find({ status: 'open' }).sort({ createdAt: -1 }).limit(limit);
  const result = [];
  for (const report of reports) {
    const [fromUser, onAdmin] = await Promise.all([getUserBySpecId(report.fromUserId), getUserBySpecId(report.onAdminId)]);
    result.push({ report, fromUser, onAdmin });
  }
  return result;
}

export async function countOpenReports() {
  return Report.countDocuments({ status: 'open' });
}

export async function getReportById(reportId) {
  if (!mongoose.isValidObjectId(reportId)) return null;
  return Report.findById(reportId);
}

export async function resolveReport(reportId, resolvedBy, status) {
  if (!['resolved', 'rejected'].includes(status)) throw fail('invalid_status');
  if (!mongoose.isValidObjectId(reportId)) return null;
  // Условие status: 'open' защищает от двойного решения одной жалобы двумя модераторами.
  return Report.findOneAndUpdate(
    { _id: reportId, status: 'open' },
    { $set: { status, resolvedBy, resolvedAt: new Date() } },
    { new: true },
  );
}

export async function escalateReport(reportId) {
  if (!mongoose.isValidObjectId(reportId)) return null;
  return Report.findOneAndUpdate({ _id: reportId, status: 'open' }, { $set: { escalatedToCreator: true } }, { new: true });
}
