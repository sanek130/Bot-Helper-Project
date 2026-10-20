/**
 * Сервис для отдачи файлов Telegram через сервер
 * Файлы отдаются по file_id, токен бота не попадает в URL
 */

/**
 * Получить поток файла от Telegram и отдать его в ответе Express
 */
export async function serveTelegramFile(bot, fileId, res) {
  try {
    const file = await bot.telegram.getFile(fileId);
    
    if (!file || !file.file_path) {
      return res.status(404).json({ error: 'Файл не найден' });
    }
    
    // Формируем URL для получения файла
    const fileUrl = `https://api.telegram.org/file/bot${bot.token}/${file.file_path}`;
    
    // Получаем файл и отдаём его
    const response = await fetch(fileUrl);
    
    if (!response.ok) {
      return res.status(500).json({ error: 'Не удалось получить файл' });
    }
    
    // Устанавливаем заголовки
    res.setHeader('Content-Type', response.headers.get('Content-Type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=31536000'); // Кешируем на год
    
    // Отдаём поток
    if (response.body) {
      // Node.js 20+ имеет нативный fetch с readable stream
      const { Readable } = await import('stream');
      Readable.fromWeb(response.body).pipe(res);
    } else {
      return res.status(500).json({ error: 'Не удалось получить файл' });
    }
  } catch (e) {
    console.error('Ошибка отдачи файла:', e);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
}

/**
 * Получить информацию о файле (без отдачи содержимого)
 */
export async function getFileInfo(bot, fileId) {
  try {
    const file = await bot.telegram.getFile(fileId);
    
    if (!file || !file.file_path) {
      return null;
    }
    
    return {
      file_path: file.file_path,
      file_size: file.file_size,
      file_unique_id: file.file_unique_id
    };
  } catch (e) {
    console.error('Ошибка получения информации о файле:', e);
    return null;
  }
}
