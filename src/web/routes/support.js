import express from 'express';
import rateLimit from 'express-rate-limit';
import { requireAuthAllowBanned } from '../auth.js';
import {
  addUserMessage,
  listUserTickets,
  publicTicket,
} from '../../services/supportService.js';
import { forwardToCreators } from '../../bot/flows/support.js';

const router = express.Router();

const sendLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests' },
});

router.use(requireAuthAllowBanned);

router.get('/', async (req, res, next) => {
  try {
    const tickets = await listUserTickets(req.user.specId);
    return res.json({ tickets: tickets.map((ticket) => publicTicket(ticket)) });
  } catch (error) {
    return next(error);
  }
});

router.post('/', sendLimiter, async (req, res, next) => {
  try {
    const source = req.body?.source === 'tma' ? 'tma' : 'web';
    const result = await addUserMessage(req.user, req.body?.text, source);
    if (!result.ok) return res.status(result.error === 'too_many' ? 429 : 400).json({ error: result.error });
    await forwardToCreators(req.user, result.ticket, result.text, source);
    return res.json({ ticket: publicTicket(result.ticket) });
  } catch (error) {
    return next(error);
  }
});

export default router;
