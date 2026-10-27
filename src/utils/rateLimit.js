// Антиспам: не больше 30 действий в минуту на пользователя.
// Текстовые сообщения и нажатия кнопок считаются вместе.
export const RATE_LIMIT_MAX = 30;
export const RATE_LIMIT_WINDOW_MS = 60_000;
export const RATE_WARN_EVERY_MS = 3_000;

export function createRateLimiter({
  max = RATE_LIMIT_MAX,
  windowMs = RATE_LIMIT_WINDOW_MS,
  warnEveryMs = RATE_WARN_EVERY_MS,
} = {}) {
  const buckets = new Map();

  return {
    check(tgId, now = Date.now()) {
      const key = String(tgId);
      let bucket = buckets.get(key);

      if (!bucket || now >= bucket.resetAt) {
        bucket = { count: 0, resetAt: now + windowMs, lastWarnAt: 0 };
        buckets.set(key, bucket);
      }

      bucket.count += 1;

      if (bucket.count <= max) return { allowed: true };

      const canWarn = now - bucket.lastWarnAt >= warnEveryMs;
      if (canWarn) bucket.lastWarnAt = now;
      return { allowed: false, canWarn };
    },

    reset(tgId) {
      buckets.delete(String(tgId));
    },
  };
}
