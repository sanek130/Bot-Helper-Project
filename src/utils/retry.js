// Повтор сетевого вызова с растущей паузой: 2, 4, 8 ... до maxDelayMs.
// Нужен для запросов к Telegram при старте: короткий сбой сети не должен ронять сервер.
export async function retry(fn, { label = 'операция', attempts = 8, baseDelayMs = 2000, maxDelayMs = 60_000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt === attempts) break;
      const delay = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      console.warn(`${label}: попытка ${attempt}/${attempts} не удалась (${err.code || err.message}). Повтор через ${Math.round(delay / 1000)} с`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
