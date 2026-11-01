import { Router } from 'express';
import mongoose from 'mongoose';
import { requireAuth, requireRole } from '../auth.js';
import { asyncRoute, parseLimit, errorCode } from '../helpers.js';
import { resolveReportAction } from '../moderation.js';
import { getOpenReports } from '../../services/reportService.js';
import { publicUser } from '../../services/userService.js';

export const creatorRouter = Router();

creatorRouter.use(requireAuth, requireRole('creator', 'moderator'));

creatorRouter.get(
  '/reports',
  asyncRoute(async (req, res) => {
    const items = await getOpenReports(parseLimit(req.query.limit, 20, 50));
    return res.json({
      reports: items.map(({ report, fromUser, onAdmin }) => ({
        report: {
          _id: String(report._id),
          classKey: report.classKey,
          text: report.text,
          status: report.status,
          escalatedToCreator: Boolean(report.escalatedToCreator),
          createdAt: report.createdAt,
        },
        fromUser: publicUser(fromUser),
        onAdmin: publicUser(onAdmin),
      })),
    });
  }),
);

creatorRouter.post(
  '/report/resolve',
  asyncRoute(async (req, res) => {
    const reportId = String(req.body?.reportId ?? '');
    const action = String(req.body?.action ?? '');
    if (!mongoose.isValidObjectId(reportId)) return res.status(400).json({ error: 'invalid_report' });
    try {
      const result = await resolveReportAction(req.user, reportId, action);
      return res.json(result);
    } catch (err) {
      if (!err?.status) throw err;
      return res.status(err.status).json({ error: errorCode(err) });
    }
  }),
);
