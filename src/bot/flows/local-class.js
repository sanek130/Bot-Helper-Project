import { TEXTS } from '../texts.js';
import {
  getLocalClassKeyboard,
  getJoinConfirmKeyboard,
  getVoteKeyboard,
  getMembersKeyboard,
  membersPage,
  getMemberCardKeyboard,
  getKickConfirmKeyboard,
  getMuteConfirmKeyboard,
  getMenuOnlyKeyboard,
} from '../keyboards.js';
import { show, say, toast } from '../ui.js';
import { canManageTargetClass, getWorkClassKey } from '../guards.js';
import { isModerator, isCreator } from '../roles.js';
import { notifyUser } from '../notify.js';
import { getUserBySpecId } from '../../services/userService.js';
import { getClassKey } from '../../services/homeworkService.js';
import {
  classKeyOf,
  getLocalClass,
  getClassMembers,
  getPendingRequest,
  getRequestById,
  listPendingRequests,
  createJoinRequest,
  voteOnRequest,
  rejectRequest,
  kickMember,
  setVoteBlocked,
  unkickMember,
  cancelOwnRequest,
  requiredVotesFor,
} from '../../services/localClassService.js';
import { fill } from '../../utils/normalize.js';import { capitalize } from '../../utils/subjects.js';

const HOUR_MS = 60 * 60 * 1000;

function failText(err) {
  const map = {
    ...TEXTS.LC_KICK_ERRORS,
    ...TEXTS.LC_VOTE_ERRORS,
    no_class: TEXTS.LC_NO_CLASS,
    already_member: TEXTS.LC_ALREADY_MEMBER,
    request_exists: TEXTS.LC_REQUEST_EXISTS,
    kicked: TEXTS.LC_HOME_KICKED,
    no_local_class: TEXTS.LC_NO_CLASS,
  };
  const code = err?.code;
  if (code && map[code]) return map[code];
  console.warn('localClass flow:', err?.message || err);
  return TEXTS.GENERIC_ERROR;
}

function whenText(date) {
  const diff = Date.now() - new Date(date).getTime();
  if (!Number.isFinite(diff) || diff < 0) return 'только что';
  const hours = Math.floor(diff / HOUR_MS);
  if (hours < 1) return 'меньше часа назад';
  if (hours < 24) return `${hours} ч назад`;
  return `${Math.floor(hours / 24)} дн назад`;
}

// Свой класс (или рабочий класс модератора). Модератор без workClassKey смотрит свой.
function viewerClassKey(user) {
  return getWorkClassKey(user);
}

async function classVars(user) {
  const classKey = classKeyOf(user) || viewerClassKey(user) || '';
  if (!classKey) return null;
  const members = await getClassMembers(classKey);
  // Заявку ищем при любом статусе, кроме участника: она могла остаться открытой
  // даже если статус в User ещё не обновился.
  const pendingRequest = user.classStatus === 'member' ? null : await getPendingRequest(classKey, user.specId);
  const pending = pendingRequest ? await listPendingRequests(classKey) : [];
  return {
    classKey,
    members,
    pendingRequest,
    pending,
    vars: {
      school: capitalize(user.school || ''),
      class: user.class || '',
      members: members.length,
      pending: pending.length,
      votes: pendingRequest ? pendingRequest.votes.length : 0,
      required: pendingRequest ? pendingRequest.requiredVotes : requiredVotesFor(members.length),
    },
  };
}

export async function showLocalClass(ctx, { forceNew = false, notice = '' } = {}) {
  const user = ctx.state.user || ctx.user;
  const info = await classVars(user);
  if (!info) return show(ctx, TEXTS.LC_NO_CLASS, getMenuOnlyKeyboard(user));
  let text;
  if (user.classStatus === 'member') text = fill(TEXTS.LC_HOME_MEMBER, info.vars);
  else if (info.pendingRequest) {
    text = fill(TEXTS.LC_HOME_PENDING, { ...info.vars, when: whenText(info.pendingRequest.createdAt) });
  } else if (user.classStatus === 'kicked') text = fill(TEXTS.LC_HOME_KICKED, info.vars);
  else text = fill(TEXTS.LC_HOME_GUEST, { ...info.vars, votes: requiredVotesFor(info.members.length) });
  if (notice) text = `${notice}\n\n${text}`;
  return show(ctx, text, getLocalClassKeyboard(user, { pending: Boolean(info.pendingRequest) }), { forceNew });
}

// После регистрации: если класс уже существовал, предлагаем подать заявку.
export async function offerJoinAfterRegistration(ctx, active) {
  const attached = active?.localClass;
  if (!attached || attached.isMember) return false;
  const user = ctx.state.user || active;
  const members = await getClassMembers(attached.classKey);
  const text = fill(TEXTS.LC_JOIN_PROMPT, {
    class: user.class || '',
    votes: requiredVotesFor(members.length),
  });
  await say(ctx, text, getJoinConfirmKeyboard(user));
  return true;
}

// Заявка уходит всем голосующим участникам класса: у каждого в чате появляются кнопки.
async function broadcastRequest(ctx, user, request) {
  const localClass = await getLocalClass(request.classKey);
  const voters = await getClassMembers(request.classKey);
  const body = fill(TEXTS.LC_REQUEST_INCOMING, {
    school: capitalize(localClass?.school || user.school || ''),
    class: localClass?.className || user.class || '',
    name: user.firstName || 'Без имени',
    username: user.username || 'нет',
    required: request.requiredVotes,
    votes: request.votes.length,
  });
  let sent = 0;
  for (const voter of voters) {
    if (!voter.tgId || voter.specId === user.specId) continue;
    if (await notifyUser(voter.tgId, body, { reply_markup: getVoteKeyboard(String(request._id)).reply_markup })) sent += 1;
  }
  // Никто из одноклассников недоступен — владелец заявки должен узнать, что ждать нечего.
  if (sent === 0) {
    await say(ctx, body, getMembersKeyboard(voters, user));
  }
  return sent;
}

export function localClassFlow(bot) {
  bot.action('lc:open', async (ctx) => showLocalClass(ctx));
  // Раньше здесь был выбор произвольного класса из списка. Теперь класс у человека один —
  // тот, где он учится, поэтому кнопка всегда ведёт в него же.
  bot.action(/^lc:class:(\d{1,3})$/, async (ctx) => showLocalClass(ctx));

  // Подача заявки: сначала подтверждение, потом создание и рассылка.
  bot.action('lc:join', async (ctx) => {
    const user = ctx.state.user || ctx.user;
    if (user.classStatus === 'member') return toast(ctx, TEXTS.LC_ALREADY_MEMBER, true);
    if (user.classStatus === 'kicked') return show(ctx, TEXTS.LC_HOME_KICKED, getMenuOnlyKeyboard(user));
    const classKey = classKeyOf(user);
    if (!classKey) return show(ctx, TEXTS.LC_NO_CLASS, getMenuOnlyKeyboard(user));
    const existing = await getPendingRequest(classKey, user.specId);
    if (existing) return toast(ctx, TEXTS.LC_REQUEST_EXISTS, true);
    const members = await getClassMembers(classKey);
    // Пустой класс: участников нет, значит и голосовать некому — человек станет участником сразу.
    if (!members.length) return show(ctx, TEXTS.LC_REQUEST_NO_VOTERS, getJoinConfirmKeyboard(user));
    return show(
      ctx,
      fill(TEXTS.LC_JOIN_PROMPT, { class: user.class || '', votes: requiredVotesFor(members.length) }),
      getJoinConfirmKeyboard(user),
    );
  });

  bot.action('lc:join_yes', async (ctx) => {
    const user = ctx.state.user || ctx.user;
    let request;
    try {
      request = await createJoinRequest(user);
    } catch (err) {
      return show(ctx, failText(err), getLocalClassKeyboard(user));
    }
    // Пустой класс заявитель занимает сам — голосовать некому, заявка не нужна.
    if (request.status === 'approved') {
      return showLocalClass(ctx);
    }
    const sent = await broadcastRequest(ctx, user, request);
    // Если одноклассники недоступны в Telegram, заявка всё равно живёт в БД:
    // они увидят её на сайте и в разделе «Состав класса».
    await show(ctx, sent > 0 ? TEXTS.LC_REQUEST_SENT : TEXTS.LC_REQUEST_SENT_OFFLINE, getMenuOnlyKeyboard(user));
    return null;
  });

  bot.action('lc:cancel', async (ctx) => {
    const user = ctx.state.user || ctx.user;
    const classKey = classKeyOf(user);
    if (classKey) await cancelOwnRequest(classKey, user.specId);
    await show(ctx, TEXTS.LC_REQUEST_CANCELLED, getMenuOnlyKeyboard(user));
  });

  bot.action(/^lc:vote:([0-9a-f]{24})$/, async (ctx) => {
    const user = ctx.state.user || ctx.user;
    let result;
    try {
      result = await voteOnRequest(ctx.match[1], user);
    } catch (err) {
      return toast(ctx, failText(err), true);
    }
    const { request, approved } = result;
    const text = fill(approved ? TEXTS.LC_VOTE_APPROVED : TEXTS.LC_VOTE_ADDED, {
      votes: request.votes.length,
      required: request.requiredVotes,
    });
    await toast(ctx, approved ? 'Заявка одобрена' : text, false);
    const applicant = await getUserBySpecId(request.applicantSpecId);
    if (approved) {
      if (applicant?.tgId) await notifyUser(applicant.tgId, TEXTS.LC_REQUEST_APPROVED_NOTIFY);
      // Кнопки голосования в остальных чатах больше не нужны.
      return ctx.editMessageReplyMarkup(undefined).catch(() => true);
    }
    return ctx.editMessageReplyMarkup(getVoteKeyboard(ctx.match[1], user).reply_markup).catch(() => true);
  });

  bot.action(/^lc:reject:([0-9a-f]{24})$/, async (ctx) => {
    const user = ctx.state.user || ctx.user;
    const request = await getRequestById(ctx.match[1]);
    if (!request) return toast(ctx, TEXTS.LC_VOTE_ERRORS.request_not_found, true);
    if (request.status !== 'pending') return toast(ctx, TEXTS.LC_VOTE_ERRORS.request_closed, true);
    // Отклонить заявку может только тот, кто вправе голосовать в этом классе.
    if (!canManageTargetClass(user, request.classKey) || classKeyOf(user) !== request.classKey) {
      return toast(ctx, TEXTS.LC_VOTE_ERRORS.vote_not_allowed, true);
    }
    await rejectRequest(request._id, user);
    const applicant = await getUserBySpecId(request.applicantSpecId);
    if (applicant?.tgId) await notifyUser(applicant.tgId, TEXTS.LC_REQUEST_REJECTED_NOTIFY);
    await toast(ctx, TEXTS.LC_REQUEST_REJECTED, false);
    return ctx.editMessageReplyMarkup(undefined).catch(() => true);
  });

  // ---------- Состав класса ----------

  async function showMembers(ctx, page = 0) {
    const user = ctx.state.user || ctx.user;
    const classKey = viewerClassKey(user);
    if (!classKey) return show(ctx, TEXTS.LC_NO_CLASS, getMenuOnlyKeyboard(user));
    const isStaff = isModerator(user);
    if (!isStaff && user.classStatus !== 'member') return toast(ctx, TEXTS.LC_NO_RIGHTS, true);
    // Модератор смотрит рабочий класс, обычный участник — свой.
    const { school, class: className } = (() => {
      const [s, c] = String(classKey).split('::');
      return { school: s, class: c };
    })();
    const members = await getClassMembers(classKey);
    // Список листается страницами: в классе может быть больше десяти человек,
    // а раньше хвост списка просто отрезался.
    const { slice, start, pages, page: current, total } = membersPage(members, page);
    const lines = slice.map((member, index) =>
      fill(TEXTS.LC_MEMBERS_LINE, {
        n: start + index + 1,
        name: member.firstName || member.username || 'Без имени',
        status: TEXTS.LC_STATUS_MEMBER,
        vote: member.voteBlocked ? TEXTS.LC_VOTE_MUTED : '',
      }),
    );
    const counter = pages > 1 ? fill(TEXTS.LC_MEMBERS_PAGE, { page: current + 1, pages, total }) : '';
    const text =
      fill(TEXTS.LC_MEMBERS_TITLE, { school: capitalize(school), class: className }) +
      (lines.length ? lines.join('') : '\n' + TEXTS.LC_MEMBER_EMPTY) +
      counter +
      TEXTS.LC_MEMBERS_FOOTER;
    return show(ctx, text, getMembersKeyboard(members, user, current));
  }

  bot.action(/^lc:members(?::(\d{1,4}))?$/, async (ctx) => showMembers(ctx, ctx.match?.[1] || 0));

  bot.action(/^lc:member:([0-9a-f-]{36})$/, async (ctx) => {
    const user = ctx.state.user || ctx.user;
    const member = await getUserBySpecId(ctx.match[1]);
    if (!member) return toast(ctx, TEXTS.LC_MEMBER_GONE, true);
    if (!canManageTargetClass(user, getClassKey(member.school || '', member.class || ''))) {
      return toast(ctx, TEXTS.LC_NO_RIGHTS, true);
    }
    const status = TEXTS[`LC_STATUS_${String(member.classStatus || 'guest').toUpperCase()}`] || member.classStatus;
    const text =
      `<b>${member.firstName || 'Без имени'}</b>\n` +
      `Username: @${member.username || 'нет'}\n` +
      `Класс: ${capitalize(member.school || '')}, ${member.class || ''}\n` +
      `Статус: ${status}${member.voteBlocked ? TEXTS.LC_VOTE_MUTED : ''}`;
    return show(ctx, text, getMemberCardKeyboard(member, user, user));
  });

  bot.action(/^lc:kick:([0-9a-f-]{36})$/, async (ctx) => {
    const user = ctx.state.user || ctx.user;
    const member = await getUserBySpecId(ctx.match[1]);
    if (!member) return toast(ctx, TEXTS.LC_MEMBER_GONE, true);
    if (member.specId === user.specId) return toast(ctx, TEXTS.LC_SELF_ACTION, true);
    if (isModerator(member) || isCreator(member)) return toast(ctx, TEXTS.LC_TARGET_STAFF, true);
    if (!canManageTargetClass(user, getClassKey(member.school || '', member.class || ''))) {
      return toast(ctx, TEXTS.LC_NO_RIGHTS, true);
    }
    return show(
      ctx,
      fill(TEXTS.LC_KICK_CONFIRM, { name: member.firstName || 'участника' }),
      getKickConfirmKeyboard(member.specId, user),
    );
  });

  bot.action(/^lc:kick_yes:([0-9a-f-]{36})$/, async (ctx) => {
    const user = ctx.state.user || ctx.user;
    const member = await getUserBySpecId(ctx.match[1]);
    if (!member) return toast(ctx, TEXTS.LC_MEMBER_GONE, true);
    if (member.specId === user.specId) return toast(ctx, TEXTS.LC_SELF_ACTION, true);
    if (isModerator(member) || isCreator(member)) return toast(ctx, TEXTS.LC_TARGET_STAFF, true);
    if (!canManageTargetClass(user, getClassKey(member.school || '', member.class || ''))) {
      return toast(ctx, TEXTS.LC_NO_RIGHTS, true);
    }
    try {
      await kickMember(member.specId);
    } catch (err) {
      return show(ctx, failText(err), getMenuOnlyKeyboard(user));
    }
    if (member.tgId) await notifyUser(member.tgId, TEXTS.LC_HOME_KICKED);
    // Карточку класса показываем сразу с пометкой: второй show() перетёр бы первое сообщение
    // через editMessageText, и «участник исключён» никто бы не увидел.
    return showLocalClass(ctx, { notice: fill(TEXTS.LC_KICKED, { name: member.firstName || 'Участник' }) });
  });

  bot.action(/^lc:mute:([0-9a-f-]{36})$/, async (ctx) => {
    const user = ctx.state.user || ctx.user;
    const member = await getUserBySpecId(ctx.match[1]);
    if (!member) return toast(ctx, TEXTS.LC_MEMBER_GONE, true);
    if (!canManageTargetClass(user, getClassKey(member.school || '', member.class || ''))) {
      return toast(ctx, TEXTS.LC_NO_RIGHTS, true);
    }
    return show(
      ctx,
      fill(TEXTS.LC_MUTE_CONFIRM, { name: member.firstName || 'участника' }),
      getMuteConfirmKeyboard(member.specId, user),
    );
  });

  bot.action(/^lc:mute_yes:([0-9a-f-]{36})$/, async (ctx) => {
    const user = ctx.state.user || ctx.user;
    const member = await getUserBySpecId(ctx.match[1]);
    if (!member) return toast(ctx, TEXTS.LC_MEMBER_GONE, true);
    if (!canManageTargetClass(user, getClassKey(member.school || '', member.class || ''))) {
      return toast(ctx, TEXTS.LC_NO_RIGHTS, true);
    }
    const updated = await setVoteBlocked(member.specId, true);
    return show(
      ctx,
      fill(TEXTS.LC_MUTED, { name: updated.firstName || 'Участник' }),
      getMemberCardKeyboard(updated, user, user),
    );
  });

  bot.action(/^lc:unmute:([0-9a-f-]{36})$/, async (ctx) => {
    const user = ctx.state.user || ctx.user;
    const member = await getUserBySpecId(ctx.match[1]);
    if (!member) return toast(ctx, TEXTS.LC_MEMBER_GONE, true);
    if (!canManageTargetClass(user, getClassKey(member.school || '', member.class || ''))) {
      return toast(ctx, TEXTS.LC_NO_RIGHTS, true);
    }
    await setVoteBlocked(member.specId, false);
    return show(ctx, TEXTS.LC_UNMUTED, getMembersKeyboard(await getClassMembers(getClassKey(member.school, member.class)), user));
  });

  bot.action(/^lc:unkick:([0-9a-f-]{36})$/, async (ctx) => {
    const user = ctx.state.user || ctx.user;
    const member = await getUserBySpecId(ctx.match[1]);
    if (!member) return toast(ctx, TEXTS.LC_MEMBER_GONE, true);
    if (!canManageTargetClass(user, getClassKey(member.school || '', member.class || ''))) {
      return toast(ctx, TEXTS.LC_NO_RIGHTS, true);
    }
    try {
      await unkickMember(member.specId);
    } catch (err) {
      return show(ctx, failText(err), getMenuOnlyKeyboard(user));
    }
    return show(ctx, fill(TEXTS.LC_UNKICKED, { name: member.firstName || 'Участник' }), getMenuOnlyKeyboard(user));
  });
}