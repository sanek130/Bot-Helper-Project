// Все строки интерфейса бота. Переменные подставляются через fill() из utils/normalize.js
// в формате {var}; пользовательские значения при подстановке экранируются.
export const TEXTS = {
  // Общие
  START_WELCOME:
    '<b>Привет! Я HW-Helper.</b>\nЯ помогаю школьникам видеть домашние задания и расписание своего класса.\nЧтобы пользоваться ботом, нужно зарегистрироваться. Это займёт меньше минуты.',
  WELCOME_BACK: 'С возвращением, {firstName}!',
  STALE_MENU: '⚠️ Это меню устарело. Открываю актуальное.',
  UNREGISTERED_ACCESS:
    'Ты не зарегистрирован. Для полного доступа к боту зарегистрируйся по кнопке ниже или через команду /start.',
  UNREGISTERED_SHORT: 'Ты не зарегистрирован. Для полного доступа зарегистрируйся.',
  UNKNOWN_COMMAND: 'Неизвестная команда. Доступные: /help',
  NOT_UNDERSTOOD: 'Не понял сообщение. Нажми /menu для возврата в меню.',
  UNEXPECTED_STEP: 'Неожиданный шаг. Открываю меню.',
  PHOTO_NOT_EXPECTED: 'Фото можно прикрепить, когда бот попросит.',
  DOCUMENT_REJECTED: 'Документы не принимаются. Используй фото или текст.',
  GENERIC_ERROR: 'Что-то пошло не так. Попробуй ещё раз или открой меню /menu',
  RATE_LIMIT: '⚠️ Слишком много действий, подожди немного.',
  BANNED: '⛔ Твой аккаунт заблокирован. Причина: {reason}. Напиши в поддержку.',
  BAN_NO_REASON: 'не указана',
  CANCELLED: 'Действие отменено.',
  NO_RIGHTS: 'У тебя нет прав на это действие.',
  ADMIN_BANNED_NO_RIGHTS: 'Ты больше не можешь быть админом (3 предупреждения).',
  CREATOR_ONLY: 'Это действие доступно только создателям.',
  MODERATOR_ONLY: 'Это действие доступно только модераторам и создателям.',
  NO_CLASS: 'У тебя не указан класс. Открой профиль или пройди регистрацию.',

  // Регистрация
  REG_STEP_1_CITY: '<b>Шаг 1 из 5. Город</b>\nВыбери город кнопками ниже или напиши свой.\nМожно писать в любом регистре.',
  REG_STEP_2_SCHOOL:
    '<b>Шаг 2 из 5. Школа</b>\nВыбери школу кнопками ниже или напиши название (например, «гимназия 25»).\nЕсли твоей школы нет — нажми «Нет моей школы».',
  REG_STEP_3_LETTER: '<b>Шаг 3 из 5. Буква класса</b>\nВыбери букву кнопками ниже или напиши от «а» до «я».',
  REG_STEP_3_NUMBER: '<b>Шаг 3 из 5. Номер класса</b>\nВыбери номер кнопками ниже или напиши цифру от 4 до 11.',
  REG_STEP_4_ROLE: '<b>Шаг 4 из 5. Роль</b>\nВыбери роль. Админ добавляет ДЗ и расписание своего класса.',
  REG_STEP_5_CONFIRM:
    '<b>Шаг 5 из 5. Проверь данные</b>\nГород: {city}\nШкола: {school}\nКласс: {class}\nРоль: {role}\n\nВсё верно?',
  REG_CITY_LIST: '<b>Все города</b>\n{list}\n\nНапиши номер или название города.',
  REG_CITY_SUGGEST: 'Возможно, ты имел в виду:',
  REG_CITY_NOT_FOUND: 'Город не найден. Попробуй ещё раз или выбери из списка.',
  REG_SCHOOL_LIST: '<b>Все школы города {city}</b>\n{list}\n\nНапиши номер школы из списка.',
  REG_SCHOOL_ONLY_LIST: 'Выбери школу кнопками выше или нажми «Нет моей школы».',
  REG_SCHOOL_EMPTY: 'Для этого города пока нет школ в списке. Нажми «Нет моей школы» и создай свою.',
  REG_SCHOOL_NONE: 'Нет твоей школы? Выбери тип школы:',
  REG_SCHOOL_TYPE: 'Отлично! Теперь напиши номер школы (только цифры, например 25).',
  REG_SCHOOL_NUMBER_INVALID: 'Напиши номер школы цифрами, например: 25.',
  REG_SCHOOL_CREATED: 'Готово! Я добавил новую школу в справочник: <b>{school}</b>. Продолжаем регистрацию.',
  REG_LETTER_INVALID: 'Введи одну букву от А до Я.',
  REG_NUMBER_INVALID: 'Введи число от 4 до 11.',
  REG_RESET_CONFIRM: 'Текущая регистрация будет сброшена. Продолжить?',
  REG_DONE:
    '✅ <b>Регистрация завершена!</b>\nГород: {city}\nШкола: {school}\nКласс: {class}\nРоль: {role}\n\nТвой спец-ID:\n<code>{specId}</code>\n\nСохрани его: по нему ты войдёшь на сайт и в бота с другого устройства. Кнопки внизу экрана открывают ДЗ на сегодня и завтра.',
  REG_ALREADY_ACTIVE: 'Ты уже зарегистрирован.',
  REG_INCOMPLETE: 'Не все шаги заполнены. Продолжаю регистрацию.',
  REG_CANCELLED: 'Регистрация отменена. Чтобы начать заново, нажми /start.',
  LINK_INVALID: 'Ссылка недействительна или истекла',
  LINK_TG_TAKEN: 'Этот Telegram уже привязан к другому аккаунту. Выйди из него в профиле и открой ссылку снова.',
  LINK_DONE: '✅ Telegram привязан к аккаунту с сайта.',

  // Вход
  LOGIN_START:
    '<b>Вход по спец-ID</b>\nСпец-ID — это пароль от аккаунта. Введи спец-ID, который ты получил при регистрации.',
  LOGIN_PASSWORD_OK: '✅ Спец-ID подошёл. Ты вошёл в аккаунт.',
  LOGIN_SWITCH_CONFIRM:
    'Сейчас ты в аккаунте: {current}.\nПерейти в аккаунт {target}?\n\nТекущий аккаунт не удалится: он останется в списке «Мои аккаунты» в профиле.',
  LOGIN_OWNER_GONE: 'Владелец аккаунта недоступен в Telegram, поэтому спец-ID сработал как пароль.',
  LOGIN_BAD_FORMAT: 'Неверный формат. Спец-ID выглядит как: 123e4567-e89b-42d3-a456-426614174000.',
  LOGIN_NOT_FOUND: 'Аккаунт не найден. Проверь спец-ID или зарегистрируйся заново.',
  LOGIN_UNREGISTERED: 'Аккаунт ещё не активирован. Заверши регистрацию.',
  LOGIN_PENDING: 'Аккаунт ещё не активирован. Открой сайт и заверши регистрацию.',
  LOGIN_ALREADY: 'Ты уже вошёл в этот аккаунт.',
  LOGIN_FOUND: 'ID найден. Подтверди вход.',
  LOGIN_OWNER_ASK: 'Кто-то хочет войти в твой аккаунт HW-Helper с другого Telegram. Подтвердить вход?',
  LOGIN_WAITING: 'Запрос отправлен владельцу аккаунта. Жду подтверждения (до 5 минут).',
  LOGIN_NOT_OWNER: 'Ты не владелец этого аккаунта.',
  LOGIN_OWNER_APPROVED: 'Вход подтверждён. Ты вышел из аккаунта на этом устройстве.',
  LOGIN_REQUESTER_APPROVED: 'Ты подтвердил вход.',
  LOGIN_OWNER_DENIED: 'Вход отклонён.',
  LOGIN_REQUESTER_DENIED: 'Владелец аккаунта отклонил вход.',
  LOGIN_EXPIRED: 'Время подтверждения истекло.',

  // Меню
  MENU_PAGE_1:
    '<b>🏠 Меню</b>\nПользователь: {username}\nРоль: {role}\nШкола: {school}, класс {class}\n\n🌐 Сайт: <a href="{siteUrl}">{siteUrl}</a>\n📱 Приложение в Telegram: /web_app\n🖥 Стиль кнопок: {styleEmoji} <b>{styleName}</b> — сменить: /style',
  MENU_PAGE_2:
    '<b>🏠 Меню · стр. 2/2</b>\n\n🌐 Сайт: <a href="{siteUrl}">{siteUrl}</a>\n📱 Приложение в Telegram: /web_app\n🖥 Стиль кнопок: {styleEmoji} <b>{styleName}</b> — сменить: /style',
  WEB_APP_LINK: '<b>Веб-версия</b>\nОткрой веб-приложение HW-Helper в Telegram.',
  WEB_SITE_LINK: '<b>Сайт проекта</b>\nОткрой главный сайт HW-Helper.',
  WEB_SITE_CODE: '<b>Код для входа на сайт HW-Helper</b>\n<code>{code}</code>\nКод действует 5 минут. Если это не ты, просто проигнорируй сообщение.',
  WEB_NO_TELEGRAM: 'Заверши регистрацию в боте',
  WEB_TG_CODE:
    '<b>Подтверждение Telegram на сайте HW-Helper</b>\nКод: <code>{code}</code>\nКод действует 5 минут. Если это не ты, просто проигнорируй сообщение.',
  WEB_TG_LINKED_NOTIFY:
    'Аккаунт «{school}, {className}» привязан к твоему Telegram через сайт. Теперь у него полный доступ: фото, уведомления и ответы поддержки. Нажми /start, чтобы открыть его в боте.',
  MY_TG_ID:
    '<b>Твой Telegram ID:</b> <code>{tgId}</code>\nВведи его на сайте в разделе «Вход», чтобы подтвердить Telegram и войти в свои аккаунты.',
  WEB_SUPPORT_SOURCE: 'Сайт',
  WEB_OPEN: '<b>Веб-версия</b>\nОткрой HW-Helper в браузере или прямо в Telegram.',

  // Профиль
  PROFILE_CARD:
    '<b>Профиль</b>\nИмя: {firstName}\nUsername: @{username}\nСпец-ID: <code>{specId}</code>\nTelegram ID: <code>{tgId}</code>\nГород: {city}\nШкола: {school}\nКласс: {class}\nРоль: {role}\nДата регистрации: {registeredAt}\nПросмотрено ДЗ: {homeworkViews}',
  PROFILE_ADDED_LINE: 'Добавлено ДЗ: {homeworkAdded}',
  PROFILE_WARNS_LINE: 'Предупреждения: {warns} из 3',
  PROFILE_COPY_ID: '<b>Твой спец-ID:</b>\n<code>{specId}</code>\nСкопируй его и сохрани.',
  PROFILE_LOGOUT_CONFIRM:
    '⚠️ Выйти из аккаунта?\nДанные сохранятся, а аккаунт останется привязан к твоему Telegram ID. Вернуться можно через /start или по спец-ID.',
  PROFILE_LOGOUT_DONE:
    'Ты вышел из аккаунта. Данные сохранены. Нажми /start — бот покажет твои аккаунты, и ты сможешь вернуться или зарегистрировать новый.',

  // Аккаунты, привязанные к Telegram ID
  ACC_LIST_TITLE:
    '<b>Твои аккаунты</b>\nК твоему Telegram ID привязаны аккаунты, из которых ты вышел. Спец-ID — это пароль: по нему можно войти в боте и на сайте.',
  ACC_LIST_ITEM:
    '<b>{n}. {city}, {school}, {class}</b>\nИмя: {firstName}\nРоль: {role}\nЗарегистрирован: {registeredAt}\nПароль (спец-ID): <code>{specId}</code>',
  ACC_LIST_FOOTER_REG: 'Выбери аккаунт, чтобы войти в него, или зарегистрируй новый.',
  ACC_LIST_FOOTER_PROFILE: 'Выбери аккаунт, чтобы перейти в него. Текущий аккаунт останется в этом списке.',
  ACC_LIST_EMPTY: 'Других аккаунтов, привязанных к твоему Telegram ID, нет.',
  ACC_BANNED_MARK: '⛔ Заблокирован',
  ACC_NOT_AVAILABLE: 'Этот аккаунт уже недоступен. Открываю актуальный список.',
  ACC_DELETE_CONFIRM: 'Удалить аккаунт {account} навсегда?\nВосстановить его будет нельзя.',
  ACC_DELETED: 'Аккаунт удалён.',
  PROFILE_CLASS_CHANGED: 'Класс изменён на {newClass}.',
  PROFILE_BECAME_ADMIN: 'Теперь ты админ своего класса. Можешь добавлять ДЗ и расписание.',
  PROFILE_ADMIN_BANNED: 'Ты больше не можешь стать админом: получено 3 предупреждения.',
  PROFILE_DEMOTE_CONFIRM:
    '⚠️ Понизить себя до участника?\nПредупреждения сохранятся. Снова стать админом можно будет в профиле.',
  PROFILE_DEMOTED: 'Ты стал участником. Предупреждения: {warns} из 3.',
  PROFILE_ONLY_USER: 'Это действие доступно только участникам.',
  PROFILE_ONLY_ADMIN: 'Это действие доступно только админам.',
  KB_SETTINGS: 'Выбери кнопки для нижней клавиатуры. Нажми на кнопку, чтобы добавить или убрать её.',
  KB_APPLIED: 'Нижняя клавиатура обновлена.',
  KB_PREVIEW: 'Так выглядит твоя нижняя клавиатура сейчас:',
  KB_PREVIEW_HINT: 'Это сохранённая клавиатура. Изменения из настроек появятся после «Применить».',
  KB_NEXT: 'Куда дальше?',

  // Помощь
  HELP:
    '<b>❓ Помощь · HW-Helper</b>\n\n' +
    '<b>📋 Команды бота</b>\n' +
    '/start — главный экран: вход, регистрация или твоё меню.\n' +
    '/menu — главное меню с ДЗ и разделами.\n' +
    '/today — домашние задания на сегодня.\n' +
    '/tomorrow — домашние задания на завтра.\n' +
    '/after_tomorrow — домашние задания на послезавтра.\n' +
    '/week — ДЗ сразу на всю неделю.\n' +
    '/schedule — фото расписания твоего класса.\n' +
    '/profile — профиль: данные, спец-ID, настройки.\n' +
    '/id — твой Telegram ID (нужен для входа на сайт).\n' +
    '/style — изменить вид кнопок бота.\n' +
    '/web_app — веб-приложение прямо внутри Telegram.\n' +
    '/web_site — открыть сайт проекта в браузере.\n' +
    '/web — все ссылки на веб-версию.\n' +
    '/help — эта справка.\n' +
    '/support — написать в поддержку (ответ придёт в бота).\n' +
    '/contacts — контакты создателя и чат бота.\n' +
    '/donate — поддержать проект.\n\n' +
    '<b>🎮 Кнопки меню</b>\n' +
    '📌 Сегодня · 🔜 Завтра · 🕑 Послезавтра — ДЗ на нужный день.\n' +
    '🗓 Неделя — ДЗ на 7 дней одним сообщением.\n' +
    '📍 Выбор дня — любая дата через календарь ([дд] — сегодня, • — есть ДЗ).\n' +
    '📖 Расписание — фото расписания класса.\n' +
    '🗂 Профиль — имя, класс, роль, спец-ID; смена класса, выход из аккаунта, настройка нижней клавиатуры.\n' +
    '🖥 Стиль — вид всех кнопок бота.\n' +
    '🔛 Ещё — вторая страница меню: веб-версия, статистика, поддержка.\n' +
    '🌐 Веб-версия — сайт и мини-приложение HW-Helper.\n' +
    '📊 Статистика — активность твоего класса.\n' +
    '🛎 Поддержка — тикет модераторам и создателю.\n\n' +
    '<b>✅ Домашние задания</b>\n' +
    'Открой день и отмечай галочками ✅ выполненные предметы.\n' +
    '«🔎 Показать фото» — фотографии ДЗ, «📋 Скопировать ДЗ» — текст для заметок.\n\n' +
    '<b>🖥 Стили кнопок</b> (/style)\n' +
    '📖 Классический — только текст, без эмодзи (по умолчанию).\n' +
    '📌 Со значками — значок перед каждой кнопкой.\n' +
    '🔊 Громкий — значок и подписи капсом.\n' +
    '🔈 Тихий — только значки.\n\n' +
    '<b>👑 Для админов класса</b>\n' +
    'Стать админом можно в профиле. Админ может: «✉️ Добавить ДЗ», «⌨️ Изменить ДЗ», «🪫 Удалить ДЗ», загружать фото расписания и делать рассылку классу.\n\n' +
    '<b>🔑 Аккаунты и вход</b>\n' +
    'Спец-ID — пароль от аккаунта: по нему можно войти в бота с другого устройства и на сайте.\n' +
    'Несколько аккаунтов привязаны к твоему Telegram ID — переключай их в разделе «Мои аккаунты».\n\n' +
    '<b>⚠️ Правила</b>\n' +
    'Не пиши слишком много сообщений подряд — сработает антиспам. За оскорбления и спам выдают варны: 3 варна — снятие роли админа. Жалобу на админа можно подать в помощи, бан обжалуется через /support.\n\n' +
    'Если что-то не работает — нажми «🏠 Меню» или напиши /start.',

  // Стили кнопок
  STYLE_PICKER:
    '<b>🖥 Стиль кнопок</b>\nВыбери, как выглядят кнопки бота. Текущий стиль отмечен ✅.\n\n{list}\n\nСтиль применяется ко всем кнопкам сразу, его можно вернуть в любой момент.',
  STYLE_APPLIED: 'Готово! Теперь стиль кнопок: {emoji} <b>{name}</b>.',
  STYLE_SAME: 'Этот стиль уже выбран 😌',
  STYLE_UNKNOWN: 'Такого стиля нет. Открываю выбор стиля.',
  STYLE_CANCELLED: 'Стиль не изменён.',

  // Контакты и донат
  CONTACTS_CARD:
    '<b>Контакты HW-Helper</b>\nСоздатель: {ownerName} (@{creatorUsername})\nПочта: {emails}\nЧат бота: {chatUrl}\n\nВопрос по аккаунту или ДЗ быстрее решится через поддержку: /support.',
  CONTACTS_DONATE_LINE: '\n\nНравится бот? Поддержи проект: /donate',
  DONATE_TEXT:
    '<b>Поддержать HW-Helper</b>\nБот бесплатный и без рекламы. Если он тебе помогает, можно поддержать проект — деньги пойдут на сервер и развитие.',
  DONATE_SOON: 'Ссылка на поддержку проекта скоро появится. А пока можно рассказать о боте одноклассникам.',

  // Статистика
  STATS_CARD:
    '<b>Статистика</b>\nГород: {city}\nШкола: {school}\nКласс: {class}\n\nПользователей в классе: {classUsers}\nПросмотров ДЗ: {homeworkViews}\n\nАдмины класса: {classAdmins}\nДобавлено вчера: {yesterdayCount}\nДобавлено сегодня: {todayCount}\n\nАктивность за день: {dayPercent}%\nАктивность за неделю: {weekPercent}%',
  STATS_ADMIN_BLOCK: '<b>Твоя статистика (админ)</b>\nДобавлено тобой ДЗ: {myCount}\nДобавлено другими: {othersCount}',

  // Просмотр ДЗ
  DAY_HEADER: '<b>📅 {dayTitle} · {dateHuman}</b>\n{school}, класс {class}',
  DAY_EMPTY: 'На {dateKey} ДЗ нет. Отдыхай!',
  DAY_SUBJECT: '{mark} {icon} <b>{subject}</b>\n{text}',
  DAY_NOTHING: 'Ничего не задано.',
  DAY_PHOTOS: '📷 фото: {count}',
  DAY_ADDED_BY: '✍️ {author}',
  WEEK_HEADER: '<b>📅 Неделя · {range}</b>\n{school}, класс {class}',
  WEEK_DAY: '<b>{dayTitle} · {dateHuman}</b>',
  WEEK_LINE: '{icon} {subject}: {text}',
  WEEK_EMPTY: 'На этой неделе ДЗ нет.',
  CALENDAR: 'Выбери день. В квадратных скобках сегодня. Точка • на дате: есть ДЗ.',
  CALENDAR_LIMIT_FORWARD: 'Дальше 8 недель вперёд листать нельзя.',
  CALENDAR_LIMIT_BACK: 'Старше срока хранения ДЗ дней нет.',
  PHOTO_CAPTION: '{icon} {subject} · {school}',
  PHOTO_CAPTION_MULTI: '{icon} {subject} · {school} · фото {n} из {total}',
  PHOTO_EXPIRED: 'Файл устарел. Админ может загрузить новое фото.',
  PHOTO_NONE: 'На этот день фото нет.',
  COPY_HEADER: '{dayTitle} · {dateHuman}\n{school}, класс {class}',
  COPY_HINT: 'Текст для копирования отправлен ниже.',

  // Расписание
  SCHEDULE_CAPTION: '<b>Расписание</b>\nГород: {city}\nШкола: {school}\nКласс: {class}',
  SCHEDULE_EMPTY: '<b>Расписание пока не добавлено.</b>\nАдмин класса может загрузить фото.',
  SCHEDULE_UPLOAD: 'Пришли фото расписания.',
  SCHEDULE_UPDATED: 'Расписание обновлено.',
  SCHEDULE_PHOTO_ONLY: 'Нужно именно фото. Документы и текст не принимаются.',

  // Админ: добавление
  ADD_NO_RIGHTS: 'У тебя нет прав на добавление ДЗ.',
  ADD_CHOOSE_SUBJECT: '<b>Добавление ДЗ</b>\nДата: {dateHuman}\n\nВыбери предмет из списка или нажми «Другой».',
  ADD_SUBJECT_TEXT: 'Напиши название предмета текстом, например: «химия».',
  ADD_SUBJECT_INVALID: 'Название предмета должно быть от 1 до 60 символов.',
  ADD_TASK_PROMPT:
    '<b>Добавление ДЗ</b>\nПредмет: {subject}\nДата: {dateHuman}\n\nНапиши задание текстом или отправь фото с подписью.',
  ADD_MORE_SAME: 'Добавь ещё задание к этому предмету. Оно допишется к существующему.',
  ADD_TOO_LONG: 'Слишком длинный текст. Максимум 2000 символов.',
  ADD_DONE: '✅ <b>Добавлено</b>\nПредмет: {subject}\nДата: {dateHuman}',
  ADD_DONE_TEXT: 'Текст: {text}',
  ADD_DONE_PHOTOS: '📷 Фото: {count}',
  ADD_SESSION_LOST: 'Сессия добавления устарела. Начни заново.',

  // Админ: редактирование
  EDIT_DAY_EMPTY: 'На этот день ДЗ нет.',
  EDIT_CHOOSE_SUBJECT: '<b>Редактирование ДЗ</b>\nДата: {dateHuman}\n\nВыбери предмет для редактирования.',
  EDIT_CARD: '<b>Текущее ДЗ · {subject} · {dateHuman}</b>\n{text}',
  EDIT_CARD_PHOTOS: '📷 Фото: {count}',
  EDIT_CARD_FOOTER: 'Выбери действие.',
  EDIT_NO_TEXT: 'Текста нет.',
  EDIT_TASK_GONE: 'Это задание было удалено.',
  EDIT_NO_PHOTOS: 'Фото уже отсутствуют.',
  EDIT_RM_PHOTOS_CONFIRM: '⚠️ Подтвердить удаление фото?\nПредмет: {subject}\nДата: {dateHuman}\nФото: {count}',
  EDIT_PHOTOS_REMOVED: 'Фото удалены.',
  EDIT_RM_FULL_CONFIRM: '⚠️ Подтвердить удаление ДЗ?\nПредмет: {subject}\nДата: {dateHuman}',
  EDIT_REMOVED: 'Успешно удалено.',
  EDIT_MOVE_SAME_DAY: 'Нельзя перенести на тот же день.',
  EDIT_MOVE_CONFIRM: 'Перенести ДЗ на {dateHuman}?\nПредмет: {subject}',
  EDIT_MERGE_WARNING: '⚠️ На эту дату уже есть ДЗ по этому предмету. Текст допишется к существующему.',
  EDIT_MOVED: 'Успешно перенесено.',
  EDIT_CHANGE_SUBJECT: '<b>Смена предмета</b>\nСейчас: {subject}\nДата: {dateHuman}\n\nВыбери новый предмет.',
  EDIT_CHANGE_CONFIRM: 'Поменять предмет с {oldSubject} на {newSubject}?\nДата: {dateHuman}',
  EDIT_CHANGE_SAME: 'Это тот же предмет. Выбери другой.',
  EDIT_SUBJECT_CHANGED: 'Предмет изменён.',
  EDIT_NEW_TEXT: '<b>Текущее ДЗ:</b>\n{text}\n\nНапиши новый текст или отправь фото.',
  EDIT_NEW_TEXT_PHOTOS: 'Фото сохранятся, если ты не уберёшь их отдельно.',
  EDIT_TEXT_UPDATED: 'Текст обновлён.',
  EDIT_PHOTO_ADDED: 'Фото добавлено.',
  EDIT_PHOTO_LIMIT: 'Достигнут лимит 10 фото. Удали старые перед добавлением новых.',
  EDIT_PHOTO_DUPLICATE: 'Это фото уже прикреплено.',

  // Админ: удаление
  DEL_CHOOSE_SUBJECT: '<b>Удаление ДЗ</b>\nДата: {dateHuman}\n\nВыбери предмет для удаления.',
  DEL_CONFIRM: '⚠️ Подтверди удаление ДЗ.\nДата: {dateHuman}\nПредмет: {subject}',

  // Админ-панель
  ADMIN_PANEL:
    '<b>Админ-панель</b>\nПредупреждения: {warns} из 3\nДобавлено тобой ДЗ: {myCount}\nДобавлено другими: {othersCount}\n\nВыбери действие.',
  CREATOR_PANEL_SHORT:
    '<b>Панель создателя</b>\nПользователей: {totalUsers}\nАдминов: {totalAdmins}\nЗабаненных: {totalBanned}\nОткрытых жалоб: {openReports}\nОткрытых тикетов: {openTickets}\n\nРабочий класс: {classKey}\n\nВыбери действие.',
  PICK_CLASS: '<b>Выбор класса</b>\nВыбери класс, с ДЗ которого будешь работать, или напиши его в формате «школа::класс», например «гимназия 25::10А».',
  PICK_CLASS_DONE: 'Рабочий класс: {classKey}',
  PICK_CLASS_INVALID: 'Формат: «школа::класс», например «гимназия 25::10А».',
  PICK_CLASS_EMPTY: 'Классов пока нет. Напиши класс в формате «школа::класс».',

  // Жалобы
  CMP_ONLY_ACTIVE: 'Жаловаться могут только зарегистрированные пользователи.',
  CMP_NO_ADMINS: 'В твоём классе нет админов.',
  CMP_CHOOSE_ADMIN: 'Выбери админа, на которого жалуешься.',
  CMP_TOO_FREQUENT: 'Ты уже подавал жалобу на этого админа. Подожди {hours} часов.',
  CMP_ENTER_TEXT: 'Опиши, что случилось. Жалоба уйдёт создателю и модераторам.',
  CMP_TEXT_INVALID: 'Текст жалобы должен быть от 10 до 1000 символов. Сейчас: {length}.',
  CMP_PREVIEW: '<b>Предпросмотр жалобы</b>\nАдмин: {adminName} (@{adminUsername})\nКласс: {class}\n\n{text}\n\nОтправить жалобу?',
  CMP_SENT: 'Жалоба отправлена. Модераторы и создатель рассмотрят её.',
  CMP_NOTIFY:
    '<b>Новая жалоба #{reportId}</b>\nПодал: {fromName} (@{fromUsername})\nНа админа: {adminName} (@{adminUsername})\nКласс: {classKey}\n\n{text}',
  CMP_SESSION_LOST: 'Черновик жалобы устарел. Начни заново.',

  // Рассмотрение жалоб и панель создателя
  CRT_PANEL:
    '<b>Панель {roleTitle}</b>\nПользователей: {totalUsers}\nАдминов: {totalAdmins}\nЗабаненных: {totalBanned}\nОткрытых жалоб: {openReports}\nОткрытых тикетов: {openTickets}\n\nВыбери действие.',
  CRT_NO_REPORTS: 'Открытых жалоб нет.',
  CRT_REPORT_CARD:
    '<b>Жалоба #{reportId}</b>\nПодал: {fromName} (@{fromUsername})\nНа админа: {adminName} (@{adminUsername})\nКласс: {classKey}\n{escalated}\n{text}',
  CRT_REPORT_ESCALATED: '⬆️ Ожидает решения создателя',
  CRT_REPORTS_FOOTER: 'Всего открытых жалоб: {count}.',
  REP_ALREADY_DONE: 'Жалоба уже рассмотрена.',
  REP_WARN_DONE: 'Админу выдан варн. Всего: {warns} из 3.',
  REP_WARN_ADMIN: 'Тебе выдано предупреждение. Всего: {warns} из 3.',
  REP_WARN_REPORTER: 'Жалоба рассмотрена, админу выдан варн.',
  REP_ESCALATE_THREE: 'Админ получил 3 варна. Требуется решение создателя: бан или сброс варнов.',
  REP_ESCALATE_THREE_NOTIFY:
    '<b>Админ {adminName} (@{adminUsername}) получил 3 варна</b>\nВыдал: модератор {moderatorName}.\nТребуется решение создателя: бан или сброс варнов.',
  REP_BANNED_THREE: 'Админ получил 3 варна: роль админа снята, его ДЗ удалены ({removed}).',
  REP_REJECTED: 'Жалоба отклонена.',
  REP_REJECTED_REPORTER: 'Твоя жалоба отклонена.',
  REP_DEMOTED: 'Админ понижен до участника.',
  REP_DEMOTED_ADMIN: 'Ты понижен до участника.',
  REP_DEMOTED_REPORTER: 'Жалоба рассмотрена, админ понижен.',
  REP_ESCALATED: 'Жалоба эскалирована создателю.',
  REP_ESCALATED_NOTIFY: 'Модератор {moderatorName} эскалировал жалобу #{reportId}. Требуется твоё решение.',
  REP_ESCALATE_ONLY_MOD: 'Эскалация доступна только модераторам.',
  REP_ADMIN_GONE: 'Аккаунт админа не найден.',
  CRT_USERS_SEARCH: 'Введи имя, username, Telegram ID, спец-ID или класс для поиска. Или нажми «Последние 10».',
  CRT_USERS_EMPTY: 'Никого не нашёл.',
  CRT_USERS_FOUND: 'Найдено: {count}.',
  CRT_USER_CARD:
    '<b>{firstName} (@{username})</b>\nСпец-ID: <code>{specId}</code>\nTelegram ID: <code>{tgId}</code>\nГород: {city}\nШкола: {school}\nКласс: {class}\nРоль: {role}',
  CRT_USER_DETAILS:
    'Статус: {status}\nTelegram ID: {tgId}\nПостоянный Telegram ID: {ownerTgId}\nПросмотрено ДЗ: {homeworkViews}\nДобавлено ДЗ: {homeworkAdded}\nПоследняя активность: {lastActive}\nДата регистрации: {registeredAt}',
  CRT_USER_WARNS: 'Предупреждения: {warns} из 3',
  CRT_USER_BANNED: '⛔ Забанен',
  CRT_USER_ADMIN_BANNED: '🚫 Запрет на роль админа',
  CRT_USER_NOT_FOUND: 'Пользователь не найден.',
  CRT_CANNOT_MODERATE: 'Этого пользователя нельзя модерировать: другой создатель или ты сам.',
  CRT_BAN_REASON: 'Напиши причину бана или нажми «Без причины».',
  CRT_BANNED_NOTIFY: '⛔ Твой аккаунт заблокирован. Причина: {reason}. Обжаловать можно через /support.',
  CRT_UNBANNED: 'Пользователь разбанен.',
  CRT_UNBANNED_NOTIFY: '✅ Твой аккаунт разблокирован.',
  CRT_BANNED_PERSON: 'Пользователь забанен. Бан действует на {target}: заблокировано аккаунтов — {count}, новые аккаунты тоже будут заблокированы.',
  CRT_BANNED_ACCOUNT_ONLY: 'Пользователь забанен. У аккаунта нет Telegram ID и юзернейма, поэтому заблокирован только этот аккаунт.',
  CRT_BANID_INPUT:
    '<b>Бан по ID</b>\nВведи Telegram ID (только цифры) или юзернейм (например, @name). Юзернейм используй, если у пользователя нет Telegram ID.',
  CRT_UNBANID_INPUT: '<b>Разбан по ID</b>\nВведи Telegram ID (только цифры) или юзернейм (например, @name).',
  CRT_BANID_BAD: 'Не понял. Telegram ID — это только цифры, юзернейм — от 4 до 32 латинских букв, цифр или _.',
  CRT_BANID_PREVIEW: '<b>Бан: {target}</b>\nНайдено аккаунтов: {count}\n{accounts}\n\nНапиши причину бана или нажми «Без причины».',
  CRT_BANID_NO_ACCOUNTS: 'аккаунтов пока нет — бан сработает, когда человек зайдёт в бот',
  CRT_BANID_FORBIDDEN: 'Этого человека нельзя забанить: это ты, создатель или модератор.',
  CRT_BANID_DONE: 'Готово: {target} забанен. Заблокировано аккаунтов — {count}.',
  CRT_UNBANID_DONE: 'Готово: {target} разбанен. Разблокировано аккаунтов — {count}.',
  CRT_UNBANID_NOT_FOUND: 'Бана для {target} нет, и заблокированных аккаунтов не найдено.',
  CRT_PROMOTED: 'Пользователь назначен админом.',
  CRT_PROMOTED_NOTIFY: 'Тебя назначили админом класса. Можешь добавлять ДЗ и расписание.',
  CRT_PROMOTE_BANNED: 'У пользователя запрет на роль админа (3 предупреждения). Сначала сбрось варны и сними запрет.',
  CRT_DEMOTED: 'Пользователь понижен до участника.',
  CRT_DEMOTED_NOTIFY: 'Ты понижен до участника.',
  CRT_WARNED: 'Варн выдан. Всего: {warns} из 3.',
  CRT_WARN_BANNED: 'Варн выдан: 3 из 3. Роль админа снята, ДЗ пользователя удалены ({removed}).',
  CRT_WARNS_RESET: 'Варны сброшены.',
  CRT_WARNS_RESET_NOTIFY: 'Твои предупреждения сброшены.',
  CRT_ADMIN_UNBAN: 'Запрет на роль админа снят.',
  CRT_ADMIN_UNBAN_NOTIFY: 'Запрет на роль админа снят. Снова стать админом можно в профиле.',
  CRT_DELETE_CONFIRM: '⚠️ Удалить аккаунт {firstName} безвозвратно? Это действие нельзя отменить.',
  CRT_DELETED: 'Аккаунт удалён.',
  CRT_DELETED_NOTIFY: 'Твой аккаунт HW-Helper удалён создателем. Чтобы пользоваться ботом снова, зарегистрируйся через /start.',
  CRT_NEWS: '<b>Новости</b>\nНовости публикуются на сайте в панели создателя.',

  // Рассылки
  BC_ONLY_ADMIN: 'Рассылка классу доступна только админам.',
  BC_CLASS_PROMPT: 'Напиши сообщение для класса {class}. Оно придёт всем ученикам и админам класса.',
  BC_CHOOSE_AUDIENCE: 'Выбери аудиторию для рассылки.',
  BC_CHOOSE_VALUE: 'Выбери значение аудитории «{audience}».',
  BC_NO_VALUES: 'Нет значений для этой аудитории.',
  BC_ENTER_TEXT: 'Напиши текст рассылки. Аудитория: {audience} {value}',
  BC_TEXT_INVALID: 'Текст рассылки должен быть от 1 до 3500 символов.',
  BC_CONFIRM: '<b>Подтверждение рассылки</b>\nАудитория: {audience} {value}\nПолучателей: {count}\n\nТекст:\n{text}\n\nОтправить?',
  BC_SENDING: 'Отправляю рассылку...',
  BC_DONE: 'Доставлено: {sent}, не доставлено: {failed}.',
  BC_FROM_ADMIN: '📢 Сообщение от админа {senderName}:\n\n{text}',
  BC_SESSION_LOST: 'Черновик рассылки устарел. Начни заново.',

  // Поддержка
  SUP_PROMPT: 'Опиши проблему. Сообщение уйдёт модераторам и создателям.',
  SUP_TOO_MANY: 'Ты отправил слишком много сообщений без ответа. Подожди, пока поддержка ответит.',
  SUP_TEXT_INVALID: 'Сообщение должно быть от 3 до 2000 символов.',
  SUP_SENT: 'Сообщение отправлено в поддержку.',
  SUP_NOTIFY: '<b>Поддержка · тикет #{ticketId}</b>\nОт: {name} (@{username}), класс {class}\nИсточник: {source}\n\n{text}',
  SUP_NO_TICKETS: 'Открытых тикетов нет.',
  SUP_TICKET_CARD:
    '<b>Тикет #{ticketId}</b>\nПользователь: {name} (@{username})\nКласс: {class}\nСообщений: {count}\nПоследнее: {last}',
  SUP_ANSWER_PROMPT: 'Напиши ответ пользователю.',
  SUP_ANSWER_TO_USER: '<b>Ответ от поддержки:</b>\n\n{text}',
  SUP_ANSWER_SENT: 'Ответ отправлен.',
  SUP_ANSWER_NOT_DELIVERED: 'Ответ сохранён, но пользователь недоступен в Telegram. Он увидит ответ на сайте.',
  SUP_CLOSED_USER: 'Тикет поддержки закрыт.',
  SUP_CLOSED: 'Тикет закрыт.',
  SUP_TICKET_GONE: 'Тикет не найден или уже закрыт.',
};

// ---------- Стили кнопок (/style) ----------
// Стиль определяет, как выглядят подписи кнопок меню и reply-клавиатуры.
export const BUTTON_STYLES = [
  { id: 'classic', name: 'Классический', emoji: '📖', desc: 'Только текст, без эмодзи (по умолчанию).' },
  { id: 'emoji', name: 'Со значками', emoji: '📌', desc: 'Значок перед каждой кнопкой.' },
  { id: 'bright', name: 'Громкий', emoji: '🔊', desc: 'Значок и подписи КАПСОМ.' },
  { id: 'minimal', name: 'Тихий', emoji: '🔈', desc: 'Только значки, без текста.' },
];

export function getStyleById(id) {
  return BUTTON_STYLES.find((style) => style.id === id) || BUTTON_STYLES[0];
}

// Значки кнопок по ключам (см. KEY_LABELS в keyboards.js). Один набор на все стили,
// чтобы одно и то же действие везде выглядело одинаково.
export const STYLE_EMOJI = {
  today: '📌', tomorrow: '🔜', next: '🔜', forward: '🔜', start: '🔜', after_tomorrow: '🕑', week: '🗓', prev_week: '🗓',
  next_week: '🗓', move_day: '🗓', calendar: '📍', pick_class: '📍', schedule: '📖', update_schedule: '📖', help: '📖',
  reg_help: '📖', profile: '🗂', register: '🗂', reg_new: '🗂', accounts: '🗂', more: '🔛', confirm: '🔛', confirm_action: '🔛',
  approve_yes: '🔛', move_confirm: '🔛', apply: '🔛', reset_yes: '🔛', confirm_login: '🔛', close_ticket: '🔛',
  web: '🌐', open_site: '🌐', open_tg: '🌐', open_web: '🌐', news: '🌐', stats: '📊', donate: '💡', support: '🛎',
  style: '🖥', kb_settings: '🖥', menu: '📋', copy_hw: '📋', copy_id: '📋', full_list: '📋', admin_add: '✉️', add_hw: '✉️',
  add_more_same: '✉️', add_other_hw: '✉️', new_text: '✉️', write_again: '✉️', contacts: '✉️', creator_msg: '✉️',
  bot_chat: '✉️', reply_support: '✉️', admin_edit: '⌨️', edit_day: '⌨️', change_data: '⌨️', change_subj: '⌨️',
  change_class: '⌨️', admin_delete: '🪫', delete: '🪫', rm_full: '🪫', rm_photos: '🪫', del_account: '🪫', yes_delete: '🪫',
  delete_account: '🪫', admin_panel: '🥇', creator_panel: '🏆', become_admin: '🥈', promote: '🥈', demote: '🥉',
  demote_user: '🥉', yes_demote: '🥉', broadcast: '📢', bc_all: '📢', bc_city: '📢', bc_school: '📢', bc_class: '📢',
  escalate: '📣', reports: '🔔', complain: '🔔', warn: '🔔', reset_warns: '🔕', reject: '🔕', deny_no: '🔕', ban: '🔇',
  ban_id: '🔇', ban_noreason: '🔇', unban: '🔊', unban_id: '🔊', admin_unban: '🔊', login: '🔐', login_by_id: '🔐',
  have_account: '🔐', enter_account: '🔐', preview: '🔎', view: '🔎', details: '🔎', show_photos: '🔎', photos: '🔎',
  users: '🔎', recent_10: '🔎', check_status: '🔎', logout: '🔚', yes_logout: '🔚', finish: '🔚', yes_confirm: '🔚',
  back: '🔙', cancel: '🔙', to_city: '🔙', to_school: '🔙', to_letter: '🔙', to_number: '🔙', to_settings: '🔙',
  to_panel: '🔙', to_users: '🔙', to_profile_menu: '🔙', to_user_card: '🔙', no_logout: '🔙', retry: '🔋', no_school: '🔋',
};

// Тексты reply-клавиатуры и соответствующие действия (сравнение без учёта регистра).
export const BUTTONS = {
  'сегодня': 'hw:today',
  'завтра': 'hw:tomorrow',
  'послезавтра': 'hw:after_tomorrow',
  'неделя': 'hw:week',
  'расписание': 'schedule:show',
  'профиль': 'prof:open',
  'помощь': 'help:open',
  'веб-версия': 'web:open',
  'статистика': 'stats:open',
  'админ-панель': 'adm:panel',
  'меню': 'menu:page:1',
  'у меня есть аккаунт': 'login:start',
};

export const KEYBOARD_ITEMS = [
  'Сегодня',
  'Завтра',
  'Послезавтра',
  'Неделя',
  'Расписание',
  'Профиль',
  'Помощь',
  'Веб-версия',
  'Статистика',
  'Админ-панель',
];

export const ROLE_LABELS = {
  user: 'Участник',
  admin: 'Админ',
  moderator: 'Модератор',
  creator: 'Создатель',
  support: 'Поддержка',
};

export const AUDIENCE_LABELS = {
  all: 'все',
  city: 'город',
  school: 'школа',
  class: 'класс',
};
