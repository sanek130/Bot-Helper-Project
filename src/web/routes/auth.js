import express from 'express';
import { User } from '../../db/models/User.js';
import { createCodeLoginRequest, verifyCodeLogin, createLinkLoginRequest, approveLinkLogin } from '../../services/loginService.js';
import { createToken, verifyToken, setAuthCookie, clearAuthCookie, revokeAllTokens } from '../auth.js';
import { rateLimit } from 'express-rate-limit';

const router = express.Router();

// Rate limiting для авторизации
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 10, // максимум 10 запросов
  message: 'Слишком много попыток. Попробуйте позже.'
});

// POST /api/auth/register - регистрация на сайте
router.post('/register', authLimiter, async (req, res) => {
  try {
    const { city, school, class: className, role } = req.body;
    
    if (!city || !school || !className || !role) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Создаём pending-пользователя
    const user = new User({
      specId: crypto.randomUUID(),
      tgId: null,
      city,
      school,
      class: className,
      role: role === 'admin' ? 'user' : role,
      status: 'pending',
      platforms: ['web'],
      customKeyboard: ['Сегодня', 'Завтра', 'Меню'],
      completedHomework: {},
      stats: {
        homeworkViews: 0,
        homeworkAdded: 0,
        lastActive: new Date()
      },
      registeredAt: new Date(),
      pendingExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
    });
    
    await user.save();
    
    // Создаём одноразовую ссылку для активации
    const linkResult = await createLinkLoginRequest(user.specId);
    
    if (!linkResult.success) {
      return res.status(500).json({ error: linkResult.error });
    }
    
    res.json({
      success: true,
      specId: user.specId,
      activationLink: `t.me/${process.env.BOT_USERNAME}?start=link_${linkResult.token}`
    });
  } catch (e) {
    console.error('Registration error:', e);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login - вход по спец-ID с кодом
router.post('/login', authLimiter, async (req, res) => {
  try {
    const { specId } = req.body;
    
    if (!specId) {
      return res.status(400).json({ error: 'Missing specId' });
    }
    
    // Создаём запрос на вход с кодом
    const result = await createCodeLoginRequest(specId);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    
    res.json({
      success: true,
      message: 'Код отправлен в Telegram'
    });
  } catch (e) {
    console.error('Login error:', e);
    res.status(500).json({ error: 'Login failed' });
  }
});

// POST /api/auth/verify - проверка кода
router.post('/verify', authLimiter, async (req, res) => {
  try {
    const { specId, code, attempts } = req.body;
    
    if (!specId || !code) {
      return res.status(400).json({ error: 'Missing specId or code' });
    }
    
    const result = await verifyCodeLogin(specId, code, attempts || 0);
    
    if (!result.success) {
      return res.status(400).json({ error: result.error, attempts: result.attempts });
    }
    
    // Создаём JWT токен
    const token = await createToken(result.user.specId);
    setAuthCookie(res, token);
    
    res.json({
      success: true,
      user: {
        specId: result.user.specId,
        firstName: result.user.firstName,
        city: result.user.city,
        school: result.user.school,
        class: result.user.class,
        role: result.user.role
      }
    });
  } catch (e) {
    console.error('Verify error:', e);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// POST /api/auth/logout - выход
router.post('/logout', async (req, res) => {
  try {
    if (req.userId) {
      await revokeAllTokens(req.userId);
    }
    
    clearAuthCookie(res);
    res.json({ success: true });
  } catch (e) {
    console.error('Logout error:', e);
    res.status(500).json({ error: 'Logout failed' });
  }
});

// GET /api/auth/me - текущий пользователь
router.get('/me', async (req, res) => {
  try {
    const user = await User.findOne({ specId: req.userId });
    
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    
    res.json({
      specId: user.specId,
      firstName: user.firstName,
      username: user.username,
      city: user.city,
      school: user.school,
      class: user.class,
      role: user.role,
      warns: user.warns,
      completedHomework: user.completedHomework || {}
    });
  } catch (e) {
    console.error('Get user error:', e);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

export default router;
