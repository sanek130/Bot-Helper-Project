import { ArrowDown, ArrowRight, ArrowUpRight, BookOpen, CalendarDays, Check, ChevronDown, Clock3, LockKeyhole, Send, Sparkles } from "lucide-react";

export function Homepage() {
  return (
    <div className="hw-home">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap');
        .hw-home {
          --night: #101917; --panel: #17221f; --panel-hi: #1c2925; --line: rgba(220,239,226,.11);
          --ink: #eef5ec; --soft: #a6b6ab; --quiet: #778a7e; --mint: #b7f08b; --mint-dark: #152315;
          min-height: 100vh; overflow: hidden; color: var(--ink); background: var(--night);
          font-family: 'Manrope', ui-sans-serif, system-ui, sans-serif; font-size: 15px; line-height: 1.55;
          -webkit-font-smoothing: antialiased;
        }
        .hw-home * { box-sizing: border-box; }
        .hw-home a { color: inherit; text-decoration: none; }
        .hw-home a:focus-visible, .hw-home summary:focus-visible { outline: 2px solid var(--mint); outline-offset: 4px; border-radius: 4px; }
        .hw-home button { font: inherit; }
        .hw-shell { width: min(1160px, calc(100% - 64px)); margin: 0 auto; }
        .hw-topbar { height: 78px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--line); }
        .hw-brand { display: inline-flex; align-items: center; gap: 11px; font-size: 16px; font-weight: 800; letter-spacing: -.045em; }
        .hw-mark { width: 30px; height: 30px; display: grid; place-items: center; border: 1px solid rgba(183,240,139,.4); border-radius: 9px; background: rgba(183,240,139,.08); }
        .hw-mark-bars { display: flex; gap: 3px; align-items: flex-end; height: 13px; }
        .hw-mark-bars i { width: 3px; border-radius: 2px; background: var(--mint); display: block; }
        .hw-mark-bars i:nth-child(1) { height: 7px; }.hw-mark-bars i:nth-child(2) { height: 11px; }.hw-mark-bars i:nth-child(3) { height: 9px; }
        .hw-nav { display: flex; align-items: center; gap: 31px; color: var(--soft); font-size: 13px; }
        .hw-nav a, .hw-footer-links a { transition: color .2s ease; }
        .hw-nav a:hover, .hw-footer-links a:hover { color: var(--mint); }
        .hw-nav .hw-nav-cta { padding: 10px 16px; border: 1px solid rgba(183,240,139,.34); color: var(--mint); border-radius: 8px; }
        .hw-nav .hw-nav-cta:hover { color: var(--night); background: var(--mint); }
        .hw-hero { position: relative; min-height: 602px; display: grid; grid-template-columns: 1fr .92fr; align-items: center; gap: 5.5%; padding: 76px 0 91px; }
        .hw-hero:before { content: ""; position: absolute; z-index: 0; width: 670px; height: 670px; right: -280px; top: -185px; border-radius: 50%; background: radial-gradient(circle, rgba(147,196,127,.09), rgba(16,25,23,0) 68%); pointer-events: none; }
        .hw-hero-copy, .hw-preview-wrap { position: relative; z-index: 1; }
        .hw-kicker { display: inline-flex; gap: 10px; align-items: center; color: var(--mint); font: 11px 'DM Mono', monospace; letter-spacing: .11em; text-transform: uppercase; }
        .hw-kicker:before { content: ""; width: 24px; height: 1px; background: var(--mint); }
        .hw-hero h1 { margin: 23px 0 20px; max-width: 650px; font-size: clamp(46px, 6.5vw, 78px); line-height: .99; letter-spacing: -.075em; font-weight: 600; }
        .hw-hero h1 em { color: var(--mint); font-style: normal; }
        .hw-lead { max-width: 480px; margin: 0; color: var(--soft); font-size: 17px; line-height: 1.75; }
        .hw-actions { display: flex; flex-wrap: wrap; gap: 11px; margin-top: 32px; }
        .hw-button { min-height: 47px; padding: 0 18px; display: inline-flex; justify-content: center; align-items: center; gap: 10px; border-radius: 8px; font-weight: 700; font-size: 13px; transition: transform .2s ease, background .2s ease, border-color .2s ease; }
        .hw-button:hover { transform: translateY(-2px); }
        .hw-button-primary { background: var(--mint); color: #152116 !important; }
        .hw-button-primary:hover { background: #caf7aa; }
        .hw-button-ghost { color: var(--ink) !important; border: 1px solid var(--line); background: rgba(255,255,255,.025); }
        .hw-button-ghost:hover { border-color: rgba(183,240,139,.42); background: rgba(183,240,139,.06); }
        .hw-caption { margin-top: 20px; color: var(--quiet); font-size: 11px; }
        .hw-preview-wrap { padding: 10px 5px 15px 14px; }
        .hw-preview { border: 1px solid rgba(214,238,218,.15); border-radius: 17px; background: linear-gradient(145deg, rgba(31,45,39,.97), rgba(19,30,26,.98)); padding: 21px; box-shadow: 0 28px 90px rgba(0,0,0,.3); transform: rotate(.8deg); }
        .hw-preview-top { display: flex; justify-content: space-between; align-items: center; padding: 0 1px 17px; border-bottom: 1px solid var(--line); }
        .hw-preview-title { font-size: 13px; font-weight: 700; letter-spacing: -.02em; }
        .hw-date { color: var(--quiet); font: 10px 'DM Mono', monospace; }
        .hw-preview-day { display: flex; justify-content: space-between; align-items: baseline; padding: 18px 1px 12px; }
        .hw-preview-day strong { font-size: 14px; }.hw-preview-day span { color: var(--quiet); font: 10px 'DM Mono', monospace; }
        .hw-task { display: grid; grid-template-columns: 34px 1fr auto; align-items: center; gap: 11px; padding: 12px 10px; border: 1px solid rgba(221,239,225,.08); background: rgba(255,255,255,.025); border-radius: 9px; margin-bottom: 8px; }
        .hw-task:last-of-type { margin-bottom: 0; }
        .hw-task-icon { width: 32px; height: 32px; border-radius: 8px; display: grid; place-items: center; background: rgba(183,240,139,.09); color: var(--mint); }
        .hw-task-name { display: block; color: var(--ink); font-size: 12px; font-weight: 700; }
        .hw-task-desc { display: block; color: var(--quiet); font-size: 10px; margin-top: 2px; }
        .hw-due { color: #d3dfd4; font: 9px 'DM Mono', monospace; white-space: nowrap; }
        .hw-timetable { display: flex; align-items: center; gap: 10px; margin-top: 14px; padding: 12px; border-radius: 9px; background: rgba(183,240,139,.075); }
        .hw-time { color: var(--mint); font: 10px 'DM Mono', monospace; }
        .hw-timetable-copy { font-size: 10px; color: #dce8dc; }
        .hw-timetable-copy b { font-weight: 700; }
        .hw-preview-note { display: flex; align-items: center; justify-content: space-between; margin: 15px 1px 0; color: var(--quiet); font: 9px 'DM Mono', monospace; }
        .hw-preview-note span { display: flex; align-items: center; gap: 6px; }.hw-dot { width: 5px; height: 5px; border-radius: 50%; background: var(--mint); }
        .hw-scroll { display: flex; align-items: center; gap: 10px; color: var(--quiet); font: 10px 'DM Mono', monospace; letter-spacing: .08em; }
        .hw-section { border-top: 1px solid var(--line); padding: 92px 0; }
        .hw-section-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 30px; margin-bottom: 38px; }
        .hw-eyebrow { color: var(--mint); font: 10px 'DM Mono', monospace; letter-spacing: .13em; text-transform: uppercase; }
        .hw-section h2 { max-width: 620px; margin: 12px 0 0; font-size: clamp(30px, 4.2vw, 48px); line-height: 1.08; font-weight: 600; letter-spacing: -.06em; }
        .hw-section-intro { max-width: 310px; color: var(--soft); margin: 0 0 3px; font-size: 13px; line-height: 1.8; }
        .hw-order-grid { display: grid; grid-template-columns: 1.15fr .85fr; gap: 14px; }
        .hw-surface { border: 1px solid var(--line); border-radius: 13px; background: var(--panel); }
        .hw-homework { padding: 25px; }
        .hw-card-header { display: flex; align-items: center; justify-content: space-between; padding-bottom: 18px; border-bottom: 1px solid var(--line); }
        .hw-card-header strong { font-size: 13px; }.hw-card-header small { color: var(--quiet); font: 10px 'DM Mono', monospace; }
        .hw-list { padding-top: 5px; }
        .hw-list-row { display: grid; grid-template-columns: 25px 1fr auto; align-items: center; gap: 12px; min-height: 55px; border-bottom: 1px solid rgba(220,239,226,.065); }
        .hw-list-row:last-child { border-bottom: 0; }
        .hw-check { width: 19px; height: 19px; border: 1px solid rgba(183,240,139,.4); border-radius: 6px; display: grid; place-items: center; color: var(--mint); }
        .hw-list-row strong { font-size: 12px; font-weight: 600; }.hw-list-row small { display: block; color: var(--quiet); font-size: 10px; margin-top: 2px; }
        .hw-subject { color: var(--soft); font: 10px 'DM Mono', monospace; }
        .hw-schedule { padding: 25px; background: #1b2923; position: relative; overflow: hidden; }
        .hw-schedule:after { content: ""; position: absolute; right: -45px; bottom: -55px; width: 190px; height: 190px; border: 1px solid rgba(183,240,139,.13); border-radius: 50%; box-shadow: 0 0 0 22px rgba(183,240,139,.025), 0 0 0 44px rgba(183,240,139,.02); }
        .hw-schedule h3 { margin: 4px 0 5px; font-size: 20px; letter-spacing: -.04em; }
        .hw-schedule p { margin: 0; color: var(--soft); font-size: 11px; }
        .hw-period { display: grid; grid-template-columns: 48px 1fr; gap: 12px; padding: 13px 0; border-bottom: 1px solid var(--line); position: relative; z-index: 1; }
        .hw-period:first-of-type { margin-top: 23px; }.hw-period:last-of-type { border-bottom: 0; }
        .hw-period time { color: var(--mint); font: 10px 'DM Mono', monospace; padding-top: 2px; }
        .hw-period b { font-size: 11px; font-weight: 600; }.hw-period small { display: block; color: var(--quiet); font-size: 10px; margin-top: 3px; }
        .hw-note { color: var(--quiet); font-size: 10px; margin: 12px 0 0; }
        .hw-rhythm { display: grid; grid-template-columns: .88fr 1.12fr; align-items: center; gap: 10%; }
        .hw-rhythm-copy p { color: var(--soft); max-width: 400px; font-size: 14px; line-height: 1.8; }
        .hw-steps { border-left: 1px solid rgba(183,240,139,.35); padding-left: 28px; }
        .hw-step { position: relative; padding: 0 0 25px 8px; }.hw-step:last-child { padding-bottom: 0; }
        .hw-step:before { content: ""; position: absolute; left: -33px; top: 5px; width: 8px; height: 8px; background: var(--mint); border-radius: 50%; box-shadow: 0 0 0 5px var(--night); }
        .hw-step span { color: var(--mint); font: 10px 'DM Mono', monospace; }.hw-step b { display: block; margin-top: 4px; font-size: 14px; }.hw-step p { color: var(--quiet); margin: 4px 0 0; font-size: 11px; }
        .hw-messenger { display: grid; grid-template-columns: 1fr .78fr; gap: 15px; align-items: stretch; }
        .hw-messenger-card { display: flex; flex-direction: column; justify-content: space-between; padding: 30px; min-height: 268px; }
        .hw-messenger-card.telegram { background: #1a2928; }
        .hw-messenger-card.max { background: #1a211f; }
        .hw-messenger-top { display: flex; align-items: center; justify-content: space-between; }
        .hw-icon-bubble { width: 42px; height: 42px; display: grid; place-items: center; color: var(--mint); border: 1px solid rgba(183,240,139,.2); background: rgba(183,240,139,.07); border-radius: 12px; }
        .hw-status { padding: 6px 9px; border: 1px solid rgba(183,240,139,.24); border-radius: 999px; color: var(--mint); font: 9px 'DM Mono', monospace; }
        .hw-status.wait { color: var(--soft); border-color: var(--line); }
        .hw-messenger-card h3 { margin: 24px 0 7px; font-size: 24px; letter-spacing: -.05em; }
        .hw-messenger-card p { max-width: 400px; margin: 0; color: var(--soft); font-size: 12px; line-height: 1.8; }
        .hw-text-link { display: inline-flex; align-items: center; gap: 8px; width: fit-content; margin-top: 24px; color: var(--mint) !important; font-size: 12px; font-weight: 700; }
        .hw-text-link:hover { gap: 12px; }
        .hw-account { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 24px; padding: 32px 36px; border: 1px solid rgba(183,240,139,.19); border-radius: 13px; background: linear-gradient(110deg, rgba(183,240,139,.075), rgba(183,240,139,.015) 66%); }
        .hw-account h2 { font-size: 28px; margin: 0 0 7px; letter-spacing: -.055em; }.hw-account p { color: var(--soft); font-size: 12px; margin: 0; }
        .hw-account-actions { display: flex; gap: 9px; }
        .hw-lower { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .hw-info-card { padding: 25px; }
        .hw-info-card h3 { margin: 0 0 7px; font-size: 15px; letter-spacing: -.03em; }
        .hw-info-card > p { color: var(--soft); font-size: 11px; margin: 0 0 18px; }
        .hw-news-placeholder { display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--line); padding-top: 16px; color: var(--quiet); font-size: 10px; }
        .hw-faq details { border-top: 1px solid var(--line); padding: 13px 0; }
        .hw-faq details:last-child { border-bottom: 1px solid var(--line); }
        .hw-faq summary { cursor: pointer; list-style: none; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 11px; font-weight: 600; }
        .hw-faq summary::-webkit-details-marker { display: none; }.hw-faq summary svg { color: var(--quiet); transition: transform .2s ease; flex: none; }.hw-faq details[open] summary svg { transform: rotate(180deg); }
        .hw-faq details p { color: var(--soft); font-size: 11px; line-height: 1.7; margin: 10px 18px 0 0; }
        .hw-footer { border-top: 1px solid var(--line); padding: 26px 0 32px; }
        .hw-footer-row { display: flex; align-items: center; justify-content: space-between; gap: 20px; }
        .hw-footer-links { display: flex; gap: 24px; color: var(--soft); font-size: 10px; }
        .hw-copyright { color: var(--quiet); font: 9px 'DM Mono', monospace; }
        @keyframes hw-rise { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        .hw-hero-copy { animation: hw-rise .65s ease both; }.hw-preview-wrap { animation: hw-rise .8s .08s ease both; }
        @media (prefers-reduced-motion: reduce) { .hw-home *, .hw-home *:before, .hw-home *:after { animation-duration: .01ms !important; transition-duration: .01ms !important; scroll-behavior: auto !important; } }
        @media (max-width: 760px) {
          .hw-shell { width: min(100% - 38px, 580px); }
          .hw-topbar { height: 68px; }.hw-nav { gap: 15px; }.hw-nav a:nth-child(1), .hw-nav a:nth-child(2) { display: none; }.hw-nav .hw-nav-cta { padding: 8px 11px; }
          .hw-hero { grid-template-columns: 1fr; gap: 26px; min-height: auto; padding: 64px 0 60px; }.hw-hero h1 { font-size: clamp(48px, 12vw, 72px); }.hw-lead { font-size: 15px; }
          .hw-preview-wrap { max-width: 530px; width: 100%; margin: 0 auto; padding-left: 4px; }.hw-preview { transform: none; }
          .hw-section { padding: 68px 0; }.hw-section-head { display: block; margin-bottom: 27px; }.hw-section-intro { margin-top: 14px; }
          .hw-order-grid, .hw-rhythm, .hw-messenger, .hw-lower { grid-template-columns: 1fr; }.hw-rhythm { gap: 32px; }.hw-schedule:after { opacity: .55; }
          .hw-account { grid-template-columns: 1fr; padding: 26px; }.hw-account-actions { flex-wrap: wrap; }
          .hw-footer-row { align-items: flex-start; flex-direction: column; }.hw-footer-links { flex-wrap: wrap; gap: 14px 20px; }
        }
        @media (max-width: 420px) {
          .hw-shell { width: calc(100% - 32px); }.hw-brand { font-size: 14px; }.hw-nav { gap: 11px; font-size: 11px; }
          .hw-preview { padding: 15px; }.hw-task { grid-template-columns: 31px 1fr auto; gap: 8px; padding: 10px 7px; }.hw-due { font-size: 8px; }
          .hw-homework, .hw-schedule, .hw-info-card { padding: 19px; }.hw-list-row { grid-template-columns: 22px 1fr auto; gap: 8px; }.hw-subject { font-size: 9px; }
          .hw-messenger-card { min-height: 238px; padding: 23px; }.hw-account h2 { font-size: 24px; }
        }
      `}</style>

      <header className="hw-shell hw-topbar">
        <a className="hw-brand" href="#top" aria-label="HW-Helper — на главную">
          <span className="hw-mark"><span className="hw-mark-bars"><i /><i /><i /></span></span>
          <span>HW-Helper</span>
        </a>
        <nav className="hw-nav" aria-label="Основная навигация">
          <a href="#how">Как работает</a>
          <a href="#telegram">Telegram</a>
          <a href="#news">Новости</a>
          <a href="#help">Помощь</a>
          <a className="hw-nav-cta" href="#account">Войти</a>
        </nav>
      </header>

      <main id="top">
        <section className="hw-shell hw-hero">
          <div className="hw-hero-copy">
            <div className="hw-kicker">Учёба без лишнего шума</div>
            <h1>Завтра уже<br />в <em>порядке.</em></h1>
            <p className="hw-lead">Домашние задания и расписание класса — в одном месте. Чтобы не искать нужное среди сообщений и спокойно собраться на новый день.</p>
            <div className="hw-actions">
              <a className="hw-button hw-button-primary" href="#account">Начать пользоваться <ArrowRight size={15} /></a>
              <a className="hw-button hw-button-ghost" href="#how">Как это работает</a>
            </div>
            <p className="hw-caption">Для класса. Для ясности. Без бесконечной прокрутки чата.</p>
            <a className="hw-scroll" href="#today"><ArrowDown size={13} /> ЛИСТАЙТЕ НИЖЕ</a>
          </div>
          <div className="hw-preview-wrap" aria-label="Пример домашнего экрана HW-Helper">
            <div className="hw-preview">
              <div className="hw-preview-top"><span className="hw-preview-title">План класса</span><span className="hw-date">ПРИМЕР · СРЕДА</span></div>
              <div className="hw-preview-day"><strong>На завтра</strong><span>3 задания</span></div>
              <div className="hw-task">
                <span className="hw-task-icon"><BookOpen size={15} /></span>
                <span><b className="hw-task-name">Литература</b><small className="hw-task-desc">Прочитать рассказ</small></span>
                <span className="hw-due">стр. 42</span>
              </div>
              <div className="hw-task">
                <span className="hw-task-icon"><BookOpen size={15} /></span>
                <span><b className="hw-task-name">Математика</b><small className="hw-task-desc">Задачи из учебника</small></span>
                <span className="hw-due">№ 318–320</span>
              </div>
              <div className="hw-task">
                <span className="hw-task-icon"><BookOpen size={15} /></span>
                <span><b className="hw-task-name">История</b><small className="hw-task-desc">Подготовить краткий ответ</small></span>
                <span className="hw-due">§ 14</span>
              </div>
              <div className="hw-timetable">
                <CalendarDays size={16} color="#b7f08b" />
                <span className="hw-time">08:30</span>
                <span className="hw-timetable-copy"><b>Первый урок</b> · расписание класса</span>
              </div>
              <div className="hw-preview-note"><span><i className="hw-dot" /> всё в одном месте</span><span>ДЕМО-МАКЕТ</span></div>
            </div>
          </div>
        </section>

        <section className="hw-shell hw-section" id="today">
          <div className="hw-section-head">
            <div><div className="hw-eyebrow">01 / На каждый день</div><h2>Всё нужное —<br />на своём месте.</h2></div>
            <p className="hw-section-intro">Задания не теряются в переписке, а расписание не приходится искать перед выходом.</p>
          </div>
          <div className="hw-order-grid">
            <div className="hw-surface hw-homework">
              <div className="hw-card-header"><strong>Домашние задания</strong><small>ДЕМО-СПИСОК</small></div>
              <div className="hw-list">
                <div className="hw-list-row"><span className="hw-check"><Check size={12} /></span><span><strong>Литература</strong><small>Прочитать рассказ</small></span><span className="hw-subject">на завтра</span></div>
                <div className="hw-list-row"><span className="hw-check"><Check size={12} /></span><span><strong>Математика</strong><small>Решить задачи № 318–320</small></span><span className="hw-subject">на завтра</span></div>
                <div className="hw-list-row"><span className="hw-check"><Check size={12} /></span><span><strong>История</strong><small>Подготовить краткий ответ</small></span><span className="hw-subject">на завтра</span></div>
              </div>
              <p className="hw-note">Пример отображения · задания здесь учебные</p>
            </div>
            <div className="hw-surface hw-schedule">
              <div className="hw-eyebrow">Расписание класса</div><h3>Среда</h3><p>Пример расписания на день</p>
              <div className="hw-period"><time>08:30</time><span><b>Русский язык</b><small>Кабинет 204</small></span></div>
              <div className="hw-period"><time>09:25</time><span><b>Математика</b><small>Кабинет 312</small></span></div>
              <div className="hw-period"><time>10:25</time><span><b>История</b><small>Кабинет 118</small></span></div>
              <p className="hw-note">Предметы и время приведены для примера</p>
            </div>
          </div>
        </section>

        <section className="hw-shell hw-section" id="how">
          <div className="hw-rhythm">
            <div className="hw-rhythm-copy">
              <div className="hw-eyebrow">02 / Понятный ритм</div>
              <h2>Меньше поисков.<br />Больше ясности.</h2>
              <p>HW-Helper помогает классу держать учебные планы под рукой: посмотреть задания, свериться с расписанием, вернуться к нужной информации.</p>
            </div>
            <div className="hw-steps">
              <div className="hw-step"><span>ШАГ 01</span><b>Выберите свой класс</b><p>Информация собрана вокруг расписания и заданий именно вашего класса.</p></div>
              <div className="hw-step"><span>ШАГ 02</span><b>Проверьте, что задано</b><p>Список предметов и заданий — без пролистывания общей переписки.</p></div>
              <div className="hw-step"><span>ШАГ 03</span><b>Загляните в расписание</b><p>План уроков на день всегда рядом с домашней работой.</p></div>
            </div>
          </div>
        </section>

        <section className="hw-shell hw-section" id="telegram">
          <div className="hw-section-head">
            <div><div className="hw-eyebrow">03 / Там, где удобно</div><h2>Сайт или мессенджер —<br />выбирайте свой способ.</h2></div>
            <p className="hw-section-intro">Основные вещи остаются рядом: домашние задания, расписание и напоминания.</p>
          </div>
          <div className="hw-messenger">
            <article className="hw-surface hw-messenger-card telegram">
              <div className="hw-messenger-top"><span className="hw-icon-bubble"><Send size={18} /></span><span className="hw-status">TELEGRAM</span></div>
              <div><h3>Открыть в Telegram</h3><p>Бот может присылать задания, расписание и напоминания прямо в Telegram. Ссылка на бота в этом макете не подключена.</p><a className="hw-text-link" href="#account">Посмотреть вход в сервис <ArrowUpRight size={14} /></a></div>
            </article>
            <article className="hw-surface hw-messenger-card max">
              <div className="hw-messenger-top"><span className="hw-icon-bubble"><Clock3 size={18} /></span><span className="hw-status wait">СКОРО</span></div>
              <div><h3>Макс — позже</h3><p>Версия для мессенджера Макс появится позже. Пока можно пользоваться сайтом и Telegram.</p></div>
            </article>
          </div>
        </section>

        <section className="hw-shell hw-section" id="account">
          <div className="hw-account">
            <div><div className="hw-eyebrow">Ваш класс. Ваш план.</div><h2>Пусть завтра будет понятнее.</h2><p>Регистрация и вход — знакомые точки старта. В этом макете действия показаны для предварительного просмотра.</p></div>
            <div className="hw-account-actions">
              <a className="hw-button hw-button-primary" href="#account">Зарегистрироваться <ArrowRight size={14} /></a>
              <a className="hw-button hw-button-ghost" href="#account">Войти</a>
            </div>
          </div>
        </section>

        <section className="hw-shell hw-section">
          <div className="hw-section-head">
            <div><div className="hw-eyebrow">04 / На связи</div><h2>Новости и ответы —<br />без лишних кругов.</h2></div>
            <p className="hw-section-intro">О проекте, правилах и помощи — коротко и в одном месте.</p>
          </div>
          <div className="hw-lower">
            <article className="hw-surface hw-info-card" id="news">
              <div className="hw-eyebrow">Новости</div><h3>Важное — когда появится</h3>
              <p>Здесь будут новости HW-Helper и объявления для пользователей. Пока в макете нет опубликованных новостей.</p>
              <div className="hw-news-placeholder"><span>Раздел новостей</span><span>ОБНОВЛЕНИЯ ПОЯВЯТСЯ ЗДЕСЬ</span></div>
            </article>
            <article className="hw-surface hw-info-card hw-faq" id="help">
              <div className="hw-eyebrow">Помощь</div><h3>Коротко о главном</h3>
              <details><summary>Что можно найти в HW-Helper?<ChevronDown size={14} /></summary><p>Домашние задания и расписание своего класса — в удобном для просмотра виде.</p></details>
              <details><summary>Можно ли получать задания в Telegram?<ChevronDown size={14} /></summary><p>Да, Telegram-бот предусмотрен как способ получать задания, расписание и напоминания. Реальная ссылка здесь не указана.</p></details>
              <details><summary>Когда появится версия для Макс?<ChevronDown size={14} /></summary><p>Она появится позже. Точная дата в этом макете не заявляется.</p></details>
            </article>
          </div>
        </section>
      </main>

      <footer className="hw-shell hw-footer" id="privacy">
        <div className="hw-footer-row">
          <a className="hw-brand" href="#top"><span className="hw-mark"><span className="hw-mark-bars"><i /><i /><i /></span></span><span>HW-Helper</span></a>
          <nav className="hw-footer-links" aria-label="Ссылки в подвале">
            <a href="#help">Помощь</a><a href="#privacy">Политика</a><a href="#contact">Контакт создателя</a>
          </nav>
          <span className="hw-copyright">© HW-HELPER</span>
        </div>
        <span id="contact" className="hw-copyright" style={{ display: "block", marginTop: 15 }}>Демонстрационный макет. Реальные контакты и ссылки здесь не подключены.</span>
      </footer>
    </div>
  );
}
