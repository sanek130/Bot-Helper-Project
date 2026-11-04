// Применяет сохранённую тему до первой отрисовки, чтобы не было вспышки.
// Отдельный файл, а не инлайн-скрипт: CSP сайта запрещает встроенные скрипты.
(function () {
  var ids = ['navy', 'mint-dark', 'white-blue', 'light', 'beige', 'blue', 'black-blue', 'purple', 'dark-gray', 'red'];
  var t = 'navy';
  try {
    var s = localStorage.getItem('hw-theme');
    if (s && ids.indexOf(s) !== -1) t = s;
  } catch {
    // localStorage недоступен (приватный режим) — остаётся тема по умолчанию
  }
  document.documentElement.setAttribute('data-theme', t);
})();
