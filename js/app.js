/* Кликабельный прототип: роутинг экранов, сценарный чат, экран результата. */
(() => {
  const $ = (s, root = document) => root.querySelector(s);
  const $$ = (s, root = document) => [...root.querySelectorAll(s)];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const screens = { landing: $('#screen-landing'), chat: $('#screen-chat'), result: $('#screen-result') };
  const log = $('#chat-log'), chips = $('#chips'), input = $('#chat-input');

  const fresh = () => ({ scenario: null, region: null, regionName: '', answers: {}, queue: [], current: null, busy: false,
    started: false, tries: 0, showContact: false, feedback: null, run: 0 });
  let S = fresh();
  let pending = null, focusInput = false; // старт сценария с лендинга

  /* ---------- Роутинг ---------- */
  function route() {
    const h = location.hash.replace('#', '');
    let name = h === 'chat' ? 'chat' : h === 'result' ? 'result' : 'landing';
    if (name === 'result' && !S.scenario) { location.replace('#chat'); return; }
    Object.entries(screens).forEach(([k, el]) => { el.hidden = k !== name; });
    if (name === 'chat') {
      if (!log.children.length) greet();
      if (pending) { const p = pending; pending = null; start(p.text, p.scenario); }
      if (focusInput) { focusInput = false; input.focus(); }
      scrollChat();
    }
    if (name === 'result') { renderResult(); window.scrollTo(0, 0); }
    if (name === 'landing' && !h) window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  /* ---------- Тост и заглушки ---------- */
  let toastTimer;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
  }
  document.addEventListener('click', (e) => {
    const stub = e.target.closest('[data-stub]');
    if (stub) { e.preventDefault(); toast('В прототипе: ' + stub.dataset.stub); }
  });

  /* ---------- Типографика: без висячих предлогов, союзов и частиц ---------- */
  const SHORT = 'в|во|на|с|со|к|ко|у|о|об|обо|от|ото|до|из|изо|за|по|под|над|при|про|для|без|через|перед|между|и|а|но|да|или|либо|что|чтобы|как|если|то|не|ни|же|ведь|вот|даже|уже|лишь|это';
  const reLead = new RegExp(`(?<=^|[\\s(«„\\u00A0])(${SHORT})[ \\t\\n]+`, 'gi');
  const reTail = /[ \t\n]+(же|ли|ль|бы|б|ж)(?=[\s.,!?:;»)]|$)/gi;
  function typograph(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!n.nodeValue.trim()) continue;
      n.nodeValue = n.nodeValue.replace(reLead, '$1 ').replace(reTail, ' $1').replace(/[ \t\n]+—/g, ' —');
    }
  }
  typograph(screens.landing);

  /* ---------- Лендинг: вход в помощника ---------- */
  screens.landing.addEventListener('click', (e) => {
    if (e.target.closest('[data-focus-input]')) { focusInput = true; return; }
    const tile = e.target.closest('[data-scn]');
    if (!tile) return;
    const id = tile.dataset.scn || null;
    resetChat();
    pending = { scenario: id, text: id ? SCENARIOS[id].example : 'Нашёл дикое животное, не знаю, что делать' };
    location.hash = '#chat';
  });

  /* ---------- Лендинг: липкая кнопка и точки карусели ---------- */
  const sticky = $('#sticky-cta');
  new IntersectionObserver(([en]) => { sticky.hidden = en.isIntersecting; }, { threshold: 0.15 }).observe($('.hero'));
  function bindDots(track, dots, gap) {
    track.addEventListener('scroll', () => {
      const step = track.firstElementChild.offsetWidth + gap;
      const atEnd = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
      const i = atEnd ? dots.length - 1 : Math.min(dots.length - 1, Math.round(track.scrollLeft / step));
      dots.forEach((d, n) => d.classList.toggle('is-on', n === i));
    }, { passive: true });
  }
  bindDots($('#projects'), $$('#projects-dots i'), 10);
  bindDots($('#lines'), $$('#lines-dots i'), 10);

  /* ---------- Чат: вывод ---------- */
  function scrollChat() { const c = $('#chat-scroll'); requestAnimationFrame(() => { c.scrollTop = c.scrollHeight; }); }
  function add(html, cls) {
    const el = document.createElement('div');
    el.className = cls; el.innerHTML = html;
    log.appendChild(el); scrollChat();
    return el;
  }
  const addUser = (text) => add(esc(text), 'msg msg--user');
  async function bot(html, cls = 'msg msg--bot', delay = 650) {
    const run = S.run;
    const t = add('<span class="typing"><i></i><i></i><i></i></span>', 'msg msg--bot');
    await sleep(delay);
    t.remove();
    if (run !== S.run) return null; // сценарий сбросили, пока «печатали»
    return add(html, cls);
  }
  const listHtml = (items) => `<ul class="list list--no">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`;

  function setChips(options, onPick, soft) {
    chips.innerHTML = '';
    options.forEach((o) => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'chip' + (soft ? ' chip--soft' : ''); b.textContent = o.label;
      b.addEventListener('click', () => { if (!S.busy) onPick(o); });
      chips.appendChild(b);
    });
    scrollChat();
  }

  function greet() {
    add('Сегодня', 'msg msg--system');
    add('<h3 class="t-h3">Что случилось?</h3><p>Опишите своими словами или выберите пример ниже. Подскажу, что делать прямо сейчас, и дам контакт специалиста рядом.</p><p>Помощник не заменяет ветеринара и не ставит диагноз. Если есть угроза для людей — звоните 112.</p>', 'msg msg--bot');
    setChips(STARTERS, (o) => start(o.text || SCENARIOS[o.scenario].example, o.scenario), true);
  }

  function resetChat() {
    const run = S.run + 1;
    S = fresh(); S.run = run;
    log.innerHTML = ''; chips.innerHTML = '';
  }

  /* ---------- Чат: логика сценариев ---------- */
  const hits = (text, kw = []) => kw.filter((k) => text.includes(k)).length;
  function detect(text) {
    const t = text.toLowerCase();
    for (const id of ['fledgling', 'moose', 'injuredBird']) if (hits(t, SCENARIOS[id].kw)) return id;
    if (hits(t, Q_GROUP.options[3].kw)) return 'predator';
    return null;
  }
  function matchOption(q, text) {
    const t = text.toLowerCase().trim();
    let best = null, score = 0;
    q.options.forEach((o) => {
      const s = o.label.toLowerCase() === t ? 99 : hits(t, o.kw);
      if (s > score) { best = o; score = s; }
    });
    return best;
  }

  const Q_REGION = { id: 'region', text: 'Где вы находитесь? От региона зависит, кто сможет помочь.', options: REGIONS };

  async function start(text, scenarioId) {
    if (S.busy) return;
    S.busy = true; S.started = true; chips.innerHTML = '';
    addUser(text);
    const id = scenarioId || detect(text);
    if (id) { await begin(id); return; }
    await bot('Понял. Задам пару вопросов, чтобы подсказать точнее.');
    S.queue = [Q_GROUP, Q_WHAT];
    next();
  }

  async function begin(id) {
    S.busy = true;
    S.scenario = id;
    const sc = SCENARIOS[id];
    // Жёсткое предупреждение — до любых вопросов
    if (sc.warning) await bot(`<div class="card__title">${esc(sc.warning.title)}</div>${esc(sc.warning.text)}`, 'card card--danger', 400);
    await bot(esc(sc.ack));
    // Правила показываем сразу, не дожидаясь конца диалога
    await bot(`<div class="card__title">Чего не стоит делать</div>${listHtml(sc.rules)}`, 'card', 350);
    S.queue = [Q_REGION, ...sc.questions.filter((q) => !(q.id in S.answers))];
    next();
  }

  async function next() {
    const q = S.queue.shift();
    if (!q) { finish(); return; }
    S.busy = true;
    S.current = q;
    if (!(await bot(esc(q.text)))) return;
    setChips(q.options, (o) => answer(q, o, o.label));
    S.busy = false;
  }

  async function answer(q, opt, text) {
    S.busy = true; chips.innerHTML = ''; S.current = null;
    addUser(text);
    if (q.id === 'region') { S.region = opt.id; S.regionName = opt.id === 'other' && text !== opt.label ? text : opt.label; }
    else S.answers[q.id] = opt.id;

    // Развилка для свободного описания: тип животного + что случилось → сценарий
    if (q.id === 'what') {
      const g = S.answers.group, w = opt.id;
      let id = 'generic';
      if (g === 'bird') id = (w === 'baby' || w === 'sitting') ? 'fledgling' : 'injuredBird';
      else if (g === 'hoofed') id = 'moose';
      else if (g === 'predator') id = 'predator';
      if (id === 'injuredBird' && w === 'injured') S.answers.blood = 'yes';
      if (id === 'moose' && w === 'place') { /* место всё равно уточняем отдельным вопросом */ }
      await begin(id);
      return;
    }
    next();
  }

  async function finish() {
    S.busy = true;
    const r = buildResult();
    if (!(await bot('Спасибо, этого достаточно. Собрал, что делать.'))) return;
    await bot(`<div class="card__title">${esc(r.badge)}</div><p class="card__sub">${esc(r.title)}</p>
      <a class="btn btn--dark btn--s" href="#result">Открыть рекомендации</a>`, 'card card--summary', 300);
    setChips([{ label: 'Начать заново' }], () => { resetChat(); greet(); }, true);
    S.busy = false;
  }

  $('#chat-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || S.busy) return;
    input.value = '';
    if (!S.started) { start(text); return; }
    const q = S.current;
    if (!q) { addUser(text); bot('В прототипе диалог на этом закончен. Откройте рекомендации или начните заново.'); return; }
    const opt = matchOption(q, text) || (q.id === 'region' ? REGIONS[2] : null);
    if (opt) { answer(q, opt, text); return; }
    addUser(text);
    S.busy = true;
    bot('Не уверен, что понял. Выберите, пожалуйста, один из вариантов ниже.').then(() => { S.busy = false; });
  });

  /* ---------- Результат ---------- */
  function buildResult() {
    const sc = SCENARIOS[S.scenario];
    const r = { ...sc.resolve(S.answers) };
    const covered = S.region !== 'other';
    r.contact = covered ? CONTACTS[S.region][sc.group] : CONTACTS.remote;
    r.backup = covered ? CONTACTS[S.region].backup : null;

    if (!covered) {
      r.notice = 'В вашем регионе пока нет партнёров РБО. Специалисты проконсультируют дистанционно — по фото и видео.';
      if (r.tone === 'contact') {
        r.badge = 'В регионе пока нет партнёров';
        r.title = 'Рядом пока нет центра-партнёра — помогут дистанционно';
        r.lead = 'Ниже — общие безопасные действия и ближайший центр, который консультирует удалённо.';
        r.steps = [
          { t: 'Не приближайтесь и не трогайте животное', s: 'Наблюдайте с расстояния.' },
          { t: 'Сфотографируйте или снимите видео' },
          { t: 'Напишите в центр дистанционной консультации', s: 'Специалист подскажет, что делать и к кому обратиться на месте.' },
        ];
      }
    }

    if (S.tries === 1) {
      Object.assign(r, {
        tone: 'contact', badge: 'Центр не отвечает', title: 'Не дозвонились? Напишите в мессенджер',
        lead: 'Специалисты часто заняты с животными и не могут взять трубку. Сообщение они прочитают, как только освободятся.',
        steps: [
          { t: 'Напишите центру в мессенджер', s: 'Приложите фото или видео, место и короткое описание.' },
          { t: 'Параллельно напишите в запасной центр', s: 'Так шанс быстрого ответа выше.' },
          { t: 'Пока ждёте — продолжайте соблюдать правила ниже' },
        ],
        emergency: null, contactHidden: false, forceMessenger: true, backupFull: true,
      });
    } else if (S.tries >= 2) {
      Object.assign(r, {
        tone: 'contact', badge: 'Никто не ответил', title: 'Напишите в РБО — проконсультируют дистанционно',
        lead: 'Жаль, что не получилось связаться. Мы передадим, что контакты не отвечают. А пока — напишите в общую линию РБО.',
        steps: [
          { t: 'Напишите в дистанционную консультацию РБО', s: 'Приложите фото или видео, место и короткое описание.' },
          { t: 'Продолжайте соблюдать правила ниже' },
        ],
        emergency: null, contactHidden: false, forceMessenger: true, contact: CONTACTS.remote, backup: null, reportDead: true,
      });
    }
    return r;
  }

  function contactCard(c, { backup = false, forceMessenger = false, label = '' } = {}) {
    const pref = forceMessenger ? 'messenger' : c.preferred;
    const btnM = `<button class="btn ${pref === 'messenger' ? 'btn--primary' : 'btn--secondary'}" type="button" data-stub="откроется ${esc(c.messenger)} центра с готовым текстом сообщения">Написать в ${esc(c.messenger)}</button>`;
    const btnP = `<button class="btn ${pref === 'phone' ? 'btn--primary' : 'btn--secondary'}" type="button" data-stub="звонок на ${esc(c.phone)}">Позвонить ${esc(c.phone)}</button>`;
    const stub = c.stub ? '<span class="tag tag--stub">заглушка: контакт уточнить у РБО</span>'
      : c.stubFields ? `<span class="tag tag--stub">заглушка: ${esc(c.stubFields)}</span>` : '';
    return `
      <div class="contact ${backup ? 'contact--backup' : ''}">
        <div class="contact__head">
          ${label ? `<span class="t-caption">${esc(label)}</span>` : ''}
          <div class="contact__name">${esc(c.name)}</div>
          <span class="tag tag--pref">Лучше ${pref === 'messenger' ? 'написать в мессенджер' : 'позвонить'}</span>
        </div>
        <dl class="kv">
          <dt>Кому помогают</dt><dd>${esc(c.animals)}</dd>
          <dt>Часы работы</dt><dd>${esc(c.hours)}</dd>
          ${backup ? '' : `<dt>Телефон</dt><dd>${esc(c.phone)}</dd><dt>Мессенджер</dt><dd>${esc(c.messenger)}</dd>`}
          ${c.email ? `<dt>Почта</dt><dd>${esc(c.email)}</dd>` : ''}
        </dl>
        ${backup ? '' : `<div class="contact__hint"><b>Что отправить:</b> ${SEND_HINT.map(esc).join('; ')}.</div>`}
        <div class="contact__actions">${pref === 'messenger' ? btnM + btnP : btnP + btnM}</div>
        <div class="contact__late">Могут ответить не сразу: специалисты часто заняты с животными.</div>
        ${stub}
      </div>`;
  }

  function feedbackHtml(r) {
    const contactShown = !r.contactHidden || S.showContact;
    if (S.feedback === 'yes') {
      return `<div class="feedback"><h3 class="t-h3">Спасибо, что не прошли мимо</h3>
        <p class="t-body">Дальше действуйте по указаниям специалиста. Если хотите, поддержите центры, которые помогают диким животным.</p>
        <a class="btn btn--overlay" href="#help-ways">Поддержать РБО</a></div>`;
    }
    if (S.feedback === 'later') {
      return `<div class="feedback"><h3 class="t-h3">Хорошо</h3>
        <p class="t-body">Эта страница никуда не денется. Вернитесь, если связаться не получится — подскажем запасной вариант.</p>
        <div class="feedback__row"><button class="btn btn--s" type="button" data-act="fb-reset">Изменить ответ</button></div></div>`;
    }
    if (S.feedback === 'useful' || S.feedback === 'useless') {
      return `<div class="feedback"><h3 class="t-h3">Спасибо за ответ</h3>
        <p class="t-body">${S.feedback === 'useful' ? 'Рады, что помогли разобраться.' : 'Жаль. Специалист подскажет точнее — контакт ниже.'}</p>
        ${S.feedback === 'useful' ? '<a class="btn btn--overlay" href="#help-ways">Поддержать РБО</a>' : ''}</div>`;
    }
    if (!contactShown) {
      return `<div class="feedback"><h3 class="t-h3">Ответ был полезен?</h3>
        <div class="feedback__row">
          <button class="btn btn--s" type="button" data-act="fb-useful">Да</button>
          <button class="btn btn--s" type="button" data-act="fb-useless">Нет</button>
        </div></div>`;
    }
    return `<div class="feedback"><h3 class="t-h3">Получилось связаться?</h3>
      <div class="feedback__row">
        <button class="btn btn--s" type="button" data-act="fb-yes">Да</button>
        <button class="btn btn--s" type="button" data-act="fb-no">Не дозвонился</button>
        <button class="btn btn--s" type="button" data-act="fb-later">Ещё не пробовал</button>
      </div></div>`;
  }

  function renderResult() {
    const r = buildResult();
    const sc = SCENARIOS[S.scenario];
    $('#result-context').textContent = [sc.title, S.regionName || (REGIONS.find((x) => x.id === S.region) || {}).label].filter(Boolean).join(' · ');
    const contactShown = !r.contactHidden || S.showContact;
    const parts = [];

    parts.push(`<div class="outcome"><h2 class="t-h1">${esc(r.title)}</h2><p class="t-body">${esc(r.lead)}</p></div>`);

    if (r.emergency) parts.push(`<div class="emergency"><p class="t-dense">${esc(r.emergency.text)}</p>
      <button class="btn btn--dark" type="button" data-stub="звонок на 112">${esc(r.emergency.label)}</button></div>`);

    if (r.notice) parts.push(`<div class="notice">${esc(r.notice)}</div>`);

    parts.push(`<section><h2 class="sec__title sec__title--h2">Что делать сейчас</h2><ol class="steps">${
      r.steps.map((s) => `<li>${esc(s.t)}${s.s ? `<small>${esc(s.s)}</small>` : ''}</li>`).join('')}</ol></section>`);

    parts.push(`<section class="donts"><h3 class="sec__title">Чего не стоит делать</h3>${listHtml(r.donts)}</section>`);

    if (contactShown) {
      parts.push(`<section id="contact"><h3 class="sec__title">${S.region === 'other' || S.tries >= 2 ? 'Кто проконсультирует' : 'Кто поможет рядом'}</h3>
        ${contactCard(r.contact, { forceMessenger: r.forceMessenger })}</section>`);
      if (r.backup) parts.push(`<section><h3 class="sec__title">Если не ответят</h3>
        ${contactCard(r.backup, { backup: !r.backupFull, forceMessenger: r.forceMessenger, label: 'Запасной контакт' })}</section>`);
      if (r.reportDead) parts.push('<button class="btn btn--secondary" type="button" data-stub="сообщение о неотвечающем контакте уйдёт в РБО">Сообщить, что контакты не отвечают</button>');
    } else {
      parts.push('<button class="btn btn--secondary" type="button" data-act="show-contact">Всё равно хочу посоветоваться со специалистом</button>');
    }

    parts.push(feedbackHtml(r));
    parts.push(`<p class="result__foot">Помощник даёт первые шаги по инструкциям РБО и не заменяет специалиста. Решение о лечении и дальнейших действиях принимает он.</p>
      <button class="btn btn--ghost" type="button" data-act="restart">Спросить о другом животном</button>`);

    $('#result-body').innerHTML = parts.join('');
  }

  $('#result-body').addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'show-contact') { S.showContact = true; renderResult(); $('#contact').scrollIntoView({ behavior: 'smooth', block: 'start' }); return; }
    if (act === 'restart') { resetChat(); location.hash = '#chat'; return; }
    if (act === 'fb-no') { S.tries += 1; S.feedback = null; renderResult(); window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    S.feedback = { 'fb-yes': 'yes', 'fb-later': 'later', 'fb-useful': 'useful', 'fb-useless': 'useless', 'fb-reset': null }[act];
    if (act === 'fb-useless') S.showContact = true;
    renderResult();
  });

  /* ---------- Меню прототипа ---------- */
  const sheet = $('#sheet');
  $('#sheet-list').innerHTML = SHORTCUTS.map((s, i) => `<button type="button" data-i="${i}"><b>${esc(s.title)}</b><span>${esc(s.note)}</span></button>`).join('')
    + '<button type="button" data-i="reset"><b>Начать чат заново</b><span>Пройти сценарий через диалог</span></button>';
  $('#open-sheet').addEventListener('click', () => { sheet.hidden = false; });
  sheet.addEventListener('click', (e) => {
    if (e.target.closest('[data-close-sheet]')) { sheet.hidden = true; return; }
    const b = e.target.closest('[data-i]');
    if (!b) return;
    sheet.hidden = true;
    resetChat();
    if (b.dataset.i === 'reset') { greet(); return; }
    openShortcut(SHORTCUTS[b.dataset.i]);
  });
  function openShortcut(sc) {
    Object.assign(S, JSON.parse(JSON.stringify(sc.state)), { started: true });
    add('Сегодня', 'msg msg--system');
    add(`Сценарий «${esc(sc.title)}» открыт из меню прототипа`, 'msg msg--system');
    setChips([{ label: 'Начать заново' }], () => { resetChat(); greet(); }, true);
    if (location.hash === '#result') route(); else location.hash = '#result';
  }

  // Прямая ссылка на экран результата: ?demo=1…6 (порядок как в меню прототипа)
  const demo = SHORTCUTS[new URLSearchParams(location.search).get('demo') - 1];
  if (demo) openShortcut(demo);
  route();
})();
