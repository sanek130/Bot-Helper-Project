(() => {
  const tg = window.Telegram?.WebApp;
  const main = document.getElementById('main');
  const statusEl = document.getElementById('status');
  const greeting = document.getElementById('greeting');
  const meta = document.getElementById('meta');
  const tabs = document.getElementById('tabs');
  const tabAdmin = document.getElementById('tab-admin');

  const WD = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  let me = null;
  let weekData = null;
  let selectedDate = null;
  let currentTab = 'week';
  let subjects = [];

  function initData() {
    return tg?.initData || '';
  }

  async function api(path, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': initData(),
      ...(options.headers || {}),
    };
    const res = await fetch(`/api${path}`, { ...options, headers });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(data.message || data.error || 'request_failed');
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  function applyTheme() {
    if (!tg) return;
    tg.ready();
    tg.expand();
    const tp = tg.themeParams || {};
    const root = document.documentElement;
    if (tp.bg_color) root.style.setProperty('--bg', tp.bg_color);
    if (tp.secondary_bg_color) root.style.setProperty('--surface', tp.secondary_bg_color);
    if (tp.text_color) root.style.setProperty('--text', tp.text_color);
    if (tp.hint_color) root.style.setProperty('--muted', tp.hint_color);
    if (tp.button_color) root.style.setProperty('--accent', tp.button_color);
    if (tg.setHeaderColor) tg.setHeaderColor('secondary_bg_color');
  }

  function addDays(dateKey, n) {
    const [y, m, d] = dateKey.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    dt.setUTCDate(dt.getUTCDate() + n);
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  }

  function parseDate(dateKey) {
    const [y, m, d] = dateKey.split('-').map(Number);
    return new Date(y, m - 1, d);
  }

  function dayLabel(dateKey) {
    const dt = parseDate(dateKey);
    return `${String(dt.getDate()).padStart(2, '0')}.${String(dt.getMonth() + 1).padStart(2, '0')} · ${WD[dt.getDay()]}`;
  }

  function titleFor(dateKey) {
    if (!me) return dayLabel(dateKey);
    if (dateKey === me.today) return `Сегодня, ${dayLabel(dateKey)}`;
    if (dateKey === addDays(me.today, 1)) return `Завтра, ${dayLabel(dateKey)}`;
    return dayLabel(dateKey);
  }

  async function loadWeek(anchor = null) {
    const from = anchor || me.today;
    const to = addDays(from, 6);
    weekData = await api(`/homework?from=${from}&to=${to}`);
    if (!selectedDate || selectedDate < from || selectedDate > to) {
      selectedDate = me.today >= from && me.today <= to ? me.today : from;
    }
  }

  function renderWeek() {
    if (!weekData) return;
    const days = Object.keys(weekData.days).sort();
    const cells = days
      .map((date) => {
        const count = Object.keys(weekData.days[date] || {}).length;
        const dt = parseDate(date);
        const cls = [
          'day-cell',
          count ? 'has' : '',
          date === me.today ? 'today' : '',
          date === selectedDate ? 'selected' : '',
        ]
          .filter(Boolean)
          .join(' ');
        return `<button type="button" class="${cls}" data-date="${date}">
          <span class="wd">${WD[dt.getDay()]}</span>
          <span class="num">${dt.getDate()}</span>
        </button>`;
      })
      .join('');

    const dayTasks = weekData.days[selectedDate] || {};
    const entries = Object.entries(dayTasks);
    const tasksHtml =
      entries.length === 0
        ? `<p class="empty">На этот день заданий нет.</p>`
        : entries
            .map(([subject, task]) => {
              const checked = task.done ? 'checked' : '';
              const doneCls = task.done ? 'done' : '';
              return `<div class="task ${doneCls}">
                <input type="checkbox" data-subject="${escapeAttr(subject)}" ${checked} />
                <div class="task-body">
                  <p class="task-title">${task.icon || ''} ${escapeHtml(subject)}</p>
                  <p class="task-text">${escapeHtml(task.text || '—')}</p>
                </div>
              </div>`;
            })
            .join('');

    main.innerHTML = `
      <div class="week">${cells}</div>
      <section class="panel">
        <h2>${escapeHtml(titleFor(selectedDate))}</h2>
        ${tasksHtml}
        <div class="row-actions">
          <button type="button" class="btn" id="btn-copy">Скопировать</button>
          <button type="button" class="btn" id="btn-prev-week">← Неделя</button>
          <button type="button" class="btn" id="btn-next-week">Неделя →</button>
        </div>
      </section>`;

    main.querySelectorAll('.day-cell').forEach((btn) => {
      btn.addEventListener('click', () => {
        selectedDate = btn.dataset.date;
        renderWeek();
      });
    });

    main.querySelectorAll('.task input[type="checkbox"]').forEach((box) => {
      box.addEventListener('change', async () => {
        const subject = box.dataset.subject;
        try {
          const r = await api('/homework/done', {
            method: 'POST',
            body: JSON.stringify({ date: selectedDate, subject }),
          });
          if (weekData.days[selectedDate]?.[subject]) {
            weekData.days[selectedDate][subject].done = r.done;
          }
          renderWeek();
        } catch (e) {
          box.checked = !box.checked;
          tg?.showAlert?.('Не удалось обновить');
        }
      });
    });

    document.getElementById('btn-copy')?.addEventListener('click', () => {
      const day = weekData.days[selectedDate] || {};
      let text = `${titleFor(selectedDate)}\nКласс ${me.class}\n`;
      const entries2 = Object.entries(day);
      if (!entries2.length) text += '\nЗаданий нет.';
      else {
        for (const [s, t] of entries2) text += `\n${s}\n${t.text || '—'}\n`;
      }
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text).then(() => tg?.showPopup?.({ message: 'Скопировано' }));
      } else {
        tg?.showAlert?.(text.slice(0, 200));
      }
    });

    document.getElementById('btn-prev-week')?.addEventListener('click', async () => {
      const from = addDays(Object.keys(weekData.days).sort()[0], -7);
      await loadWeek(from);
      renderWeek();
    });
    document.getElementById('btn-next-week')?.addEventListener('click', async () => {
      const from = addDays(Object.keys(weekData.days).sort()[0], 7);
      await loadWeek(from);
      renderWeek();
    });
  }

  async function renderSearch() {
    if (!subjects.length) {
      const r = await api('/subjects');
      subjects = r.subjects || [];
    }
    main.innerHTML = `
      <section class="panel">
        <h2>Поиск по предмету</h2>
        <div class="chips" id="chips">
          ${subjects
            .map(
              (s) =>
                `<button type="button" class="chip" data-name="${escapeAttr(s.name)}">${s.icon || ''} ${escapeHtml(s.name)}</button>`
            )
            .join('') || '<p class="empty">Пока нет предметов в ДЗ класса.</p>'}
        </div>
      </section>
      <div class="section" id="search-results"></div>`;

    main.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', async () => {
        main.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        const name = chip.dataset.name;
        const box = document.getElementById('search-results');
        box.innerHTML = '<p class="status">Загрузка…</p>';
        try {
          const r = await api(`/homework/by-subject?name=${encodeURIComponent(name)}`);
          if (!r.items?.length) {
            box.innerHTML = '<p class="empty">Ближайших заданий нет.</p>';
            return;
          }
          box.innerHTML = r.items
            .map(
              (item) => `<div class="list-item">
                <strong>${escapeHtml(titleFor(item.date))}</strong>
                <span>${item.icon || ''} ${escapeHtml(item.subject)}</span>
                <p class="task-text">${escapeHtml(item.text || '—')}</p>
              </div>`
            )
            .join('');
        } catch {
          box.innerHTML = '<p class="error">Ошибка загрузки</p>';
        }
      });
    });
  }

  async function renderSchedule() {
    main.innerHTML = '<p class="status">Загрузка расписания…</p>';
    try {
      const r = await api('/schedule');
      if (!r.url) {
        main.innerHTML = `<section class="panel"><h2>Расписание</h2><p class="empty">Ещё не загружено. Админ может добавить фото в боте.</p></section>`;
        return;
      }
      main.innerHTML = `<section class="panel"><h2>Расписание · ${escapeHtml(me.class)}</h2>
        <img class="schedule-img" src="${escapeAttr(r.url)}" alt="Расписание" /></section>`;
    } catch {
      main.innerHTML = '<p class="error">Не удалось загрузить расписание</p>';
    }
  }

  function renderAdmin() {
    const today = me.today;
    const tomorrow = addDays(today, 1);
    main.innerHTML = `
      <section class="panel">
        <h2>Добавить ДЗ</h2>
        <form class="form" id="form-add">
          <label>Дата</label>
          <input type="date" name="date" value="${today}" required />
          <label>Предмет</label>
          <input type="text" name="subject" placeholder="Алгебра" required maxlength="50" />
          <label>Задание</label>
          <textarea name="text" placeholder="стр. 42, № 3–5" required maxlength="1000"></textarea>
          <button type="submit" class="btn primary">Сохранить</button>
        </form>
      </section>
      <section class="panel section">
        <h3>Дублировать день</h3>
        <form class="form" id="form-dup">
          <label>Откуда</label>
          <input type="date" name="from" value="${today}" required />
          <label>Куда</label>
          <input type="date" name="to" value="${tomorrow}" required />
          <button type="submit" class="btn primary">Скопировать ДЗ</button>
        </form>
      </section>
      <section class="panel section">
        <h3>Рассылка классу</h3>
        <form class="form" id="form-bc">
          <textarea name="text" placeholder="Короткое сообщение ученикам" required maxlength="1000"></textarea>
          <button type="submit" class="btn primary">Отправить</button>
        </form>
      </section>`;

    document.getElementById('form-add').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('/homework', {
          method: 'POST',
          body: JSON.stringify({
            date: fd.get('date'),
            subject: fd.get('subject'),
            text: fd.get('text'),
          }),
        });
        tg?.showAlert?.('ДЗ сохранено');
        e.target.reset();
        e.target.date.value = today;
      } catch {
        tg?.showAlert?.('Ошибка сохранения');
      }
    });

    document.getElementById('form-dup').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const r = await api('/homework/duplicate', {
          method: 'POST',
          body: JSON.stringify({ from: fd.get('from'), to: fd.get('to') }),
        });
        tg?.showAlert?.(`Скопировано предметов: ${r.count}`);
      } catch (err) {
        tg?.showAlert?.(err.data?.error === 'source_empty' ? 'В исходном дне нет ДЗ' : 'Ошибка');
      }
    });

    document.getElementById('form-bc').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        const r = await api('/broadcast', {
          method: 'POST',
          body: JSON.stringify({ text: fd.get('text') }),
        });
        tg?.showAlert?.(`Отправлено: ${r.sent}`);
        e.target.reset();
      } catch {
        tg?.showAlert?.('Ошибка рассылки');
      }
    });
  }

  async function switchTab(tab) {
    currentTab = tab;
    tabs.querySelectorAll('button').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });
    if (tab === 'week') {
      if (!weekData) await loadWeek();
      renderWeek();
    } else if (tab === 'search') await renderSearch();
    else if (tab === 'schedule') await renderSchedule();
    else if (tab === 'admin') renderAdmin();
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  async function boot() {
    applyTheme();
    if (!initData()) {
      statusEl.textContent = 'Открой ДЗник кнопкой в Telegram-боте.';
      return;
    }
    try {
      me = await api('/me');
      greeting.textContent = me.first_name || 'Привет';
      meta.textContent = `Класс ${me.class} · ${me.role === 'admin' ? 'админ' : 'ученик'}`;
      tabs.hidden = false;
      if (me.role === 'admin') tabAdmin.hidden = false;
      tabs.querySelectorAll('button').forEach((btn) => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
      });
      await switchTab('week');
    } catch (e) {
      if (e.status === 403) {
        main.innerHTML = `<p class="error">Сначала зарегистрируйся в боте командой /start</p>`;
      } else if (e.status === 401) {
        main.innerHTML = `<p class="error">Не удалось авторизоваться. Открой приложение из бота.</p>`;
      } else {
        main.innerHTML = `<p class="error">Ошибка загрузки. Попробуй позже.</p>`;
      }
    }
  }

  boot();
})();
