import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { asyncRoute, errorCode, requireClassEditor, canEditClass, canEditHomework } from '../helpers.js';
import { isModerator, isCreator } from '../../bot/roles.js';
import { notifyUser } from '../../bot/notify.js';
import { TEXTS } from '../../bot/texts.js';
import { getVoteKeyboard } from '../../bot/keyboards.js';
import { getUserBySpecId, getClassUsers, publicUser } from '../../services/userService.js';
import { getClassKey } from '../../services/homeworkService.js';
import {
  classKeyOf,
  getClassMembers,
  getPendingRequest,
  listPendingRequests,
  getRequestById,
  createJoinRequest,
  voteOnRequest,
  rejectRequest,
  kickMember,
  setVoteBlocked,
  unkickMember,
  cancelOwnRequest,
  setMemberRole,
  requiredVotesFor,
} from '../../services/localClassService.js';
import { fill } from '../../utils/normalize.js';
import { capitalize } from '../../utils/subjects.js';

export const localClassRouter = Router();

localClassRouter.use(requireAuth);

function memberView(member) {
  return {
    ...publicUser(member),
    name: member.firstName || member.username || 'Без имени',
    classStatus: member.classStatus || 'guest',
    voteBlocked: Boolean(member.voteBlocked),
    classJoinedAt: member.classJoinedAt || null,
  };
}

// Карточка класса для текущего пользователя: состав, заявки, право управлять.
localClassRouter.get(
  '/',
  asyncRoute(async (req, res) => {
    const user = req.user;
    const classKey = classKeyOf(user);
    if (!classKey) return res.status(400).json({ error: 'no_class' });
    const [members, pending, ownRequest] = await Promise.all([
      getClassMembers(classKey),
      isModerator(user) || user.classStatus === 'member' ? listPendingRequests(classKey) : [],
      user.classStatus === 'member' ? null : getPendingRequest(classKey, user.specId),
    ]);
    return res.json({
      classKey,
      school: capitalize(user.school || ''),
      className: user.class || '',
      classStatus: user.classStatus || 'guest',
      voteBlocked: Boolean(user.voteBlocked),
      canManage: isModerator(user) || user.classStatus === 'member',
      // Право на ДЗ отдельное: состав правит любой участник, содержимое — только админ.
      canEdit: canEditHomework(user, classKey),
      canVote: user.classStatus === 'member' && !user.voteBlocked,
      isStaff: isModerator(user),
      isCreator: isCreator(user),
      requiredVotes: ownRequest ? ownRequest.requiredVotes : requiredVotesFor(members.length),
      members: members.map(memberView),
      pending: pending.map((request) => ({
        _id: String(request._id),
        applicantSpecId: request.applicantSpecId,
        applicantName: request.applicantName || '',
        votes: request.votes.length,
        requiredVotes: request.requiredVotes,
        votedByMe: request.votes.some((vote) => vote.voterSpecId === user.specId),
        createdAt: request.createdAt,
      })),
      ownRequest: ownRequest
        ? {
            _id: String(ownRequest._id),
            votes: ownRequest.votes.length,
            requiredVotes: ownRequest.requiredVotes,
            createdAt: ownRequest.createdAt,
          }
        : null,
    });
  }),
);

// Все участники класса, включая гостей: нужен модератору для управления составом.
localClassRouter.get(
  '/all',
  requireClassEditor((req) => req.query),
  asyncRoute(async (req, res) => {
    const [school, className] = String(req.classKey).split('::');
    const users = await getClassUsers(school, className);
    return res.json({ classKey: req.classKey, users: users.map(memberView) });
  }),
);

// Уведомление в Telegram не должно задерживать HTTP-ответ: доставка идёт в фоне.
function notifyQuiet(tgId, text) {
  if (!tgId) return;
  notifyUser(tgId, text).catch((err) => {
    console.warn(`local-class: уведомление tgId=${tgId} не доставлено: ${err?.message || err}`);
  });
}

// Рассылка заявки участникам. Ответ на запрос не ждёт Telegram: сеть до api.telegram.org
// может тормозить, и человек не должен видеть вечную загрузку из-за чужой доставки.
function notifyVoters(members, body, requestId, applicantSpecId) {
  const keyboard = getVoteKeyboard(String(requestId)).reply_markup;
  const targets = members.filter((member) => member.tgId && member.specId !== applicantSpecId);
  if (!targets.length) return;
  Promise.all(targets.map((member) => notifyUser(member.tgId, body, { reply_markup: keyboard }))).catch((err) => {
    console.warn(`local-class: рассылка заявки не удалась: ${err?.message || err}`);
  });
}

// Подать заявку на вступление в свой класс.
localClassRouter.post(
  '/join',
  asyncRoute(async (req, res) => {
    let request;
    try {
      request = await createJoinRequest(req.user);
    } catch (err) {
      return res.status(400).json({ error: errorCode(err, 'join_failed') });
    }
    const members = await getClassMembers(request.classKey);
    // Пустой класс заявитель занимает сам: голосовать некому, заявка в базе не создавалась.
    if (request.status === 'approved') {
      return res.status(201).json({ ok: true, becameMember: true, request: null });
    }
    const body = fill(TEXTS.LC_REQUEST_INCOMING, {
      school: capitalize(req.user.school || ''),
      class: req.user.class || '',
      name: req.user.firstName || 'Без имени',
      username: req.user.username || 'нет',
      required: request.requiredVotes,
      votes: request.votes.length,
    });
    notifyVoters(members, body, request._id, req.user.specId);
    return res.status(201).json({
      ok: true,
      becameMember: false,
      request: { _id: String(request._id), requiredVotes: request.requiredVotes, votes: 0 },
    });
  }),
);

localClassRouter.post(
  '/cancel',
  asyncRoute(async (req, res) => {
    const classKey = classKeyOf(req.user);
    if (!classKey) return res.status(400).json({ error: 'no_class' });
    await cancelOwnRequest(classKey, req.user.specId);
    return res.json({ ok: true });
  }),
);

localClassRouter.post(
  '/requests/:id/vote',
  asyncRoute(async (req, res) => {
    const request = await getRequestById(req.params.id);
    if (!request) return res.status(404).json({ error: 'request_not_found' });
    // Проверяем право по классу самой заявки, а не по телу запроса: клиент не должен
    // иметь возможности проголосовать в чужом классе, подставив другой classKey.
    if (!canEditClass(req.user, request.classKey)) return res.status(403).json({ error: 'forbidden_class' });
    let result;
    try {
      result = await voteOnRequest(request._id, req.user);
    } catch (err) {
      return res.status(400).json({ error: errorCode(err, 'vote_failed') });
    }
    const applicant = await getUserBySpecId(request.applicantSpecId);
    if (result.approved) notifyQuiet(applicant?.tgId, TEXTS.LC_REQUEST_APPROVED_NOTIFY);
    return res.json({
      ok: true,
      approved: result.approved,
      votes: result.request.votes.length,
      requiredVotes: result.request.requiredVotes,
    });
  }),
);

localClassRouter.post(
  '/requests/:id/reject',
  asyncRoute(async (req, res) => {
    const request = await getRequestById(req.params.id);
    if (!request) return res.status(404).json({ error: 'request_not_found' });
    if (!canEditClass(req.user, request.classKey)) return res.status(403).json({ error: 'forbidden_class' });
    try {
      await rejectRequest(request._id, req.user);
    } catch (err) {
      return res.status(400).json({ error: errorCode(err, 'reject_failed') });
    }
    const applicant = await getUserBySpecId(request.applicantSpecId);
    notifyQuiet(applicant?.tgId, TEXTS.LC_REQUEST_REJECTED_NOTIFY);
    return res.json({ ok: true });
  }),
);

// Исключить участника: модераторы и создатели — в любом классе, участники — в своём.
localClassRouter.post(
  '/members/:specId/kick',
  asyncRoute(async (req, res) => {
    const target = await getUserBySpecId(req.params.specId);
    if (!target) return res.status(404).json({ error: 'user_not_found' });
    if (target.specId === req.user.specId) return res.status(400).json({ error: 'self_action' });
    if (isModerator(target) || isCreator(target)) return res.status(403).json({ error: 'target_staff' });
    const targetClassKey = getClassKey(target.school || '', target.class || '');
    if (!canEditClass(req.user, targetClassKey)) return res.status(403).json({ error: 'forbidden_class' });
    try {
      await kickMember(target.specId);
    } catch (err) {
      return res.status(400).json({ error: errorCode(err, 'kick_failed') });
    }
    notifyQuiet(target.tgId, TEXTS.LC_HOME_KICKED);
    return res.json({ ok: true });
  }),
);

// Право голоса: отнять или вернуть.
localClassRouter.post(
  '/members/:specId/vote-block',
  asyncRoute(async (req, res) => {
    const target = await getUserBySpecId(req.params.specId);
    if (!target) return res.status(404).json({ error: 'user_not_found' });
    const targetClassKey = getClassKey(target.school || '', target.class || '');
    if (!canEditClass(req.user, targetClassKey)) return res.status(403).json({ error: 'forbidden_class' });
    const blocked = req.body?.blocked !== false;
    const updated = await setVoteBlocked(target.specId, blocked);
    return res.json({ ok: true, voteBlocked: Boolean(updated.voteBlocked) });
  }),
);

localClassRouter.post(
  '/members/:specId/unkick',
  asyncRoute(async (req, res) => {
    const target = await getUserBySpecId(req.params.specId);
    if (!target) return res.status(404).json({ error: 'user_not_found' });
    const targetClassKey = getClassKey(target.school || '', target.class || '');
    if (!canEditClass(req.user, targetClassKey)) return res.status(403).json({ error: 'forbidden_class' });
    try {
      await unkickMember(target.specId);
    } catch (err) {
      return res.status(400).json({ error: errorCode(err, 'unkick_failed') });
    }
    return res.json({ ok: true });
  }),
);

// Роль внутри класса: user — только смотрит ДЗ, admin — правит.
// Право то же, что на состав: любой участник класса и staff.
localClassRouter.post(
  '/members/:specId/role',
  asyncRoute(async (req, res) => {
    const target = await getUserBySpecId(req.params.specId);
    if (!target) return res.status(404).json({ error: 'user_not_found' });
    if (target.specId === req.user.specId) return res.status(400).json({ error: 'self_action' });
    if (isModerator(target) || isCreator(target)) return res.status(403).json({ error: 'target_staff' });
    const targetClassKey = getClassKey(target.school || '', target.class || '');
    if (!canEditClass(req.user, targetClassKey)) return res.status(403).json({ error: 'forbidden_class' });
    let updated;
    try {
      updated = await setMemberRole(target.specId, req.body?.role);
    } catch (err) {
      return res.status(400).json({ error: errorCode(err, 'role_failed') });
    }
    notifyQuiet(
      updated.tgId,
      updated.role === 'admin' ? TEXTS.LC_ROLE_UP_NOTIFY : TEXTS.LC_ROLE_DOWN_NOTIFY,
    );
    return res.json({ ok: true, role: updated.role });
  }),
);
