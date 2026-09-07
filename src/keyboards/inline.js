const { Markup } = require('telegraf');

/**
 * Reply-клавиатура для выбора параллели класса (1-11)
 */
function getGradeKeyboard() {
  const keyboard = [];
  for (let i = 1; i <= 11; i += 3) {
    const row = [];
    for (let j = 0; j < 3 && i + j <= 11; j++) {
      row.push(Markup.button.callback(`${i + j}`, `grade_${i + j}`));
    }
    keyboard.push(row);
  }
  return Markup.inlineKeyboard(keyboard);
}

/**
 * Inline-клавиатура для выбора буквы класса (А, Б, В, Г...)
 * @param {string[]} existingLetters - существующие буквы классов в школе
 */
function getLetterKeyboard(existingLetters = []) {
  const defaultLetters = ['А', 'Б', 'В', 'Г', 'Д', 'Е'];
  const letters = [...new Set([...existingLetters, ...defaultLetters])].slice(0, 6);
  
  const keyboard = [];
  for (let i = 0; i < letters.length; i += 3) {
    const row = letters.slice(i, i + 3).map(letter => 
      Markup.button.callback(letter, `letter_${letter}`)
    );
    keyboard.push(row);
  }
  
  keyboard.push([Markup.button.callback('✏️ Ввести вручную', 'letter_manual')]);
  
  return Markup.inlineKeyboard(keyboard);
}

/**
 * Клавиатура с кнопкой добавления своего города/школы
 */
function getAddCustomButton(text, callbackData) {
  return Markup.inlineKeyboard([
    [Markup.button.callback(`➕ ${text}`, callbackData)]
  ]);
}

/**
 * Клавиатура подтверждения действий
 */
function getConfirmKeyboard(customBack = 'back_to_main') {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('✅ Всё верно', 'confirm_yes'),
      Markup.button.callback('❌ Исправить', customBack)
    ]
  ]);
}

/**
 * Клавиатура пагинации для списков (города, школы)
 * @param {number} page - текущая страница (0-based)
 * @param {number} totalPages - всего страниц
 * @param {string} prefix - префикс для callback_data
 */
function getPaginationKeyboard(page, totalPages, prefix) {
  const keyboard = [];
  const row = [];
  
  if (page > 0) {
    row.push(Markup.button.callback('⬅️ Назад', `${prefix}_prev`));
  }
  
  row.push(Markup.button.callback(`${page + 1}/${totalPages}`, `${prefix}_page`));
  
  if (page < totalPages - 1) {
    row.push(Markup.button.callback('Вперёд ➡️', `${prefix}_next`));
  }
  
  keyboard.push(row);
  keyboard.push([Markup.button.callback('Отмена', 'cancel_search')]);
  
  return Markup.inlineKeyboard(keyboard);
}

/**
 * Клавиатура для карусели дней недели (виджет "Неделя одним взглядом")
 */
function getWeekCarouselKeyboard(currentDayIndex, t = (k) => k) {
  const days = [
    t('days.monday'),
    t('days.tuesday'),
    t('days.wednesday'),
    t('days.thursday'),
    t('days.friday'),
    t('days.saturday'),
    t('days.sunday')
  ];
  
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('⬅️', 'week_prev'),
      Markup.button.callback(days[currentDayIndex], 'week_current'),
      Markup.button.callback('➡️', 'week_next')
    ],
    [Markup.button.callback(t('common.close'), 'week_close')]
  ]);
}

module.exports = {
  getGradeKeyboard,
  getLetterKeyboard,
  getAddCustomButton,
  getConfirmKeyboard,
  getPaginationKeyboard,
  getWeekCarouselKeyboard
};
