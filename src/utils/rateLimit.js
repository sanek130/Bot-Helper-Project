// Скользящее окно в памяти процесса: подходит для одного инстанса на Render.
export function createRateLimiter(limit = 30, windowMs = 60_000) {
  const hits = new Map();

  function prune(key, now) {
    const list = hits.get(key);
    if (!list) return [];
    while (list.length > 0 && now - list[0] >= windowMs) list.shift();
    if (list.length === 0) hits.delete(key);
    return list;
  }

  return {
    check(key) {
      const now = Date.now();
      const list = prune(key, now);
      if (list.length >= limit) return false;
      if (!hits.has(key)) hits.set(key, list);
      list.push(now);
      return true;
    },
    reset(key) {
      hits.delete(key);
    },
    size() {
      return hits.size;
    },
  };
}
