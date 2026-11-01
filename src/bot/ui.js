// Общие помощники вывода: при нажатии inline-кнопки сообщение редактируется на месте,
// чтобы чат не засорялся десятками карточек; если редактирование невозможно — отправляется новое.
export async function show(ctx, text, extra = {}) {
  const options = { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra };
  const message = ctx.callbackQuery?.message;
  if (message && typeof message.text === 'string') {
    try {
      return await ctx.editMessageText(text, options);
    } catch (err) {
      const description = err?.response?.description || err.message || '';
      if (description.includes('message is not modified')) return message;
    }
  }
  return ctx.reply(text, options);
}

export async function say(ctx, text, extra = {}) {
  return ctx.reply(text, { parse_mode: 'HTML', link_preview_options: { is_disabled: true }, ...extra });
}

export async function toast(ctx, text, alert = false) {
  if (!ctx.callbackQuery) return null;
  try {
    return await ctx.answerCbQuery(text, { show_alert: alert });
  } catch {
    return null;
  }
}

export function cbArgs(ctx) {
  const data = ctx.callbackQuery?.data || '';
  return data.split(':');
}
