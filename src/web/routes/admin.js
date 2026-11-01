import { Router } from 'express';
import { requireAuth, requireRole, revokeAllUserTokens } from '../auth.js';
import { asyncRoute, resolveClassKey, sendClassError, parseLimit, errorCode, displayName } from '../helpers.js';
import { warnUser } from '../moderation.js';
import { TEXTS } from '../../bot/texts.js';
import { fill } from '../../utils/normalize.js';
import { notifyUser } from '../../bot/notify.js';
import { canModerate } from '../../bot/guards.js';
import { isModerator } from '../../bot/roles.js';
import { getClassStats, getAdminStats } from '../../services/statsService.js';
import { AUDIENCES, countRecipients, getAudienceValues, sendBroadcast } from '../../services/broadcastService.js';
import { parseClassKey, listClassKeys } from '../../services/homeworkService.js';
import {
  SPEC_ID_RE,
  getUserBySpecId,
  searchUsers,
  demoteToUser,
  setRole,
  ban,
  unban,
  resetWarns,
  liftAdminBan,
  deleteAccount,
  publicUser,
} from '../../services/userService.js';

export const adminRouter = Router();

const BROADCAST_MAX = 3500;
// Большие рассылки идут фоном: при паузе 100 мс между сообщениями HTTP-запрос иначе упрётся в таймаут прокси.
const SYNC_BROADCAST_LIMIT = 200;

adminRouter.use(requireAuth, requireRole('admin', 'creator', 'moderator'));

adminRouter.get(
  '/stats',
  asyncRoute(async (req, res) => {
    const resolved = resolveClassKey(req.user, req.query);
    if (resolved.error) return sendClassError(res, resolved.error);
    const { school, class: className } = parseClassKey(resolved.classKey);
    const stats = await getClassStats(school, className);
    const payload = { classKey: resolved.classKey, ...stats };
    if (req.user.role === 'admin') Object.assign(payload, await getAdminStats(req.user.specId));
    return res.json(payload);
  }),
);

adminRouter.get(
  '/classes',
  requireRole('creator', 'moderator'),
  asyncRoute(async (req, res) => {
    const classes = await listClassKeys(200);
    return res.json({ classes });
  }),
);

adminRouter.get(
  '/audience-values',
  requireRole('creator', 'moderator'),
  asyncRoute(async (req, res) => {
    const audience = String(req.query.audience ?? '');
    if (!AUDIENCES.includes(audience)) return res.status(400).json({ error: 'invalid_audience' });
    return res.json({ values: await getAudienceValues(audience) });
  }),
);

adminRouter.post(
  '/broadcast',
  asyncRoute(async (req, res) => {
    const text = String(req.body?.text ?? '').trim();
    if (text.length < 1 || text.length > BROADCAST_MAX) return res.status(400).json({ error: 'invalid_text' });
    const user = req.user;
    let audience = 'class';
    let audienceValue = '';
    if (isModerator(user)) {
      audience = String(req.body?.audience ?? 'class');
      audienceValue = String(req.body?.audienceValue ?? '').trim();
      if (!AUDIENCES.includes(audience)) return res.status(400).json({ error: 'invalid_audience' });
      if (audience === 'class' && !audienceValue.includes('::')) {
        const resolved = resolveClassKey(user, {});
        if (resolved.error) return sendClassError(res, resolved.error);
        audienceValue = resolved.classKey;
      }
      if ((audience === 'city' || audience === 'school') && !audienceValue) {
        return res.status(400).json({ error: 'audience_value_required' });
      }
    } else if (req.body?.audience && req.body.audience !== 'class') {
      return res.status(403).json({ error: 'forbidden' });
    }
    const recipients = await countRecipients(audience, audienceValue, user.school, user.class);
    const run = () =>
      sendBroadcast(audience, audienceValue, text, displayName(user), user.school, user.class, { excludeTgId: user.tgId });
    if (recipients > SYNC_BROADCAST_LIMIT) {
      run()
        .then((result) => (user.tgId ? notifyUser(user.tgId, fill(TEXTS.BC_DONE, result)) : null))
        .catch((err) => console.error(`broadcast: ${err.message}`));
      return res.json({ ok: true, queued: true, recipients });
    }
    const { sent, failed } = await run();
    return res.json({ ok: true, sent, failed });
  }),
);

adminRouter.get(
  '/users',
  requireRole('creator', 'moderator'),
  asyncRoute(async (req, res) => {
    const search = String(req.query.search ?? '').trim().slice(0, 100);
    const users = await searchUsers(search, parseLimit(req.query.limit, 10, 50));
    return res.json({ users: users.map(publicUser) });
  }),
);

// Загружает цель модерации по specId из тела или пути и проверяет право действия над ней.
async function loadTarget(req, res, action) {
  const specId = String(req.body?.specId ?? req.params?.specId ?? '').trim().toLowerCase();
  if (!SPEC_ID_RE.test(specId)) {
    res.status(400).json({ error: 'invalid_spec_id' });
    return null;
  }
  const target = await getUserBySpecId(specId);
  if (!target) {
    res.status(404).json({ error: 'user_not_found' });
    return null;
  }
  if (!canModerate(req.user, target, action)) {
    res.status(403).json({ error: 'forbidden' });
    return null;
  }
  return target;
}

adminRouter.post(
  '/warn',
  requireRole('creator', 'moderator'),
  asyncRoute(async (req, res) => {
    const target = await loadTarget(req, res, 'warn');
    if (!target) return null;
    return res.json(await warnUser(req.user, target));
  }),
);

adminRouter.post(
  '/demote',
  requireRole('creator', 'moderator'),
  asyncRoute(async (req, res) => {
    const target = await loadTarget(req, res, 'demote');
    if (!target) return null;
    await demoteToUser(target.specId);
    if (target.tgId) await notifyUser(target.tgId, TEXTS.CRT_DEMOTED_NOTIFY);
    return res.json({ ok: true });
  }),
);

adminRouter.post(
  '/promote',
  requireRole('creator', 'moderator'),
  asyncRoute(async (req, res) => {
    const target = await loadTarget(req, res, 'promote');
    if (!target) return null;
    if (target.adminBanned) return res.status(400).json({ error: 'admin_banned' });
    try {
      await setRole(target.specId, 'admin');
    } catch (err) {
      return res.status(400).json({ error: errorCode(err, 'invalid_role') });
    }
    if (target.tgId) await notifyUser(target.tgId, TEXTS.CRT_PROMOTED_NOTIFY);
    return res.json({ ok: true });
  }),
);

adminRouter.post(
  '/ban',
  requireRole('creator'),
  asyncRoute(async (req, res) => {
    const target = await loadTarget(req, res, 'ban');
    if (!target) return null;
    const reason = String(req.body?.reason ?? '').trim().slice(0, 300);
    await ban(target.specId, reason, req.user.specId);
    if (target.tgId) await notifyUser(target.tgId, fill(TEXTS.CRT_BANNED_NOTIFY, { reason: reason || TEXTS.BAN_NO_REASON }));
    return res.json({ ok: true });
  }),
);

adminRouter.post(
  '/unban',
  requireRole('creator'),
  asyncRoute(async (req, res) => {
    const target = await loadTarget(req, res, 'unban');
    if (!target) return null;
    await unban(target.specId);
    if (target.tgId) await notifyUser(target.tgId, TEXTS.CRT_UNBANNED_NOTIFY);
    return res.json({ ok: true });
  }),
);

adminRouter.post(
  '/reset-warns',
  requireRole('creator'),
  asyncRoute(async (req, res) => {
    const target = await loadTarget(req, res, 'resetwarns');
    if (!target) return null;
    await resetWarns(target.specId);
    if (target.tgId) await notifyUser(target.tgId, TEXTS.CRT_WARNS_RESET_NOTIFY);
    return res.json({ ok: true });
  }),
);

adminRouter.post(
  '/admin-unban',
  requireRole('creator'),
  asyncRoute(async (req, res) => {
    const target = await loadTarget(req, res, 'adminunban');
    if (!target) return null;
    await liftAdminBan(target.specId);
    if (target.tgId) await notifyUser(target.tgId, TEXTS.CRT_ADMIN_UNBAN_NOTIFY);
    return res.json({ ok: true });
  }),
);

adminRouter.delete(
  '/user/:specId',
  requireRole('creator'),
  asyncRoute(async (req, res) => {
    const target = await loadTarget(req, res, 'delete');
    if (!target) return null;
    const { tgId, specId } = target;
    await revokeAllUserTokens(specId);
    await deleteAccount(specId);
    if (tgId) await notifyUser(tgId, TEXTS.CRT_DELETED_NOTIFY, { reply_markup: { remove_keyboard: true } });
    return res.json({ ok: true });
  }),
);
