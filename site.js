/* WordWell Bible landing page · words, scroll and the notify form.
   Scroll position is the walk: 1 unit = one viewport height. This script owns the words laid over the hall and
   publishes the smoothed progress and the pointer on window.__ww, which scene.js reads to move the camera and the torch. */
(() => {
  'use strict';

  /* ---------- Configuration (the only values to edit before launch) ---------- */
  const NOTIFY_ENDPOINT = '';   // POST endpoint that accepts JSON {email}, e.g. a Formspree or Buttondown form URL.
  const NOTIFY_MAILTO = '';     // Fallback address for a prefilled mail when no endpoint is set.

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const ramp = (y, a, b) => clamp((y - a) / (b - a));
  const eo = t => 1 - Math.pow(1 - t, 3);

  /* ---------- Notify form ---------- */
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  $$('form[data-notify]').forEach(form => {
    const input = $('input', form), note = $('.note', form), button = $('button', form);
    const idle = note.textContent;
    const say = (text, state) => { form.classList.remove('is-error', 'is-done', 'is-sending'); if (state) form.classList.add(state); note.textContent = text; };
    input.addEventListener('input', () => { if (input.getAttribute('aria-invalid')) { input.removeAttribute('aria-invalid'); say(idle); } });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const email = input.value.trim();
      if (!EMAIL.test(email)) { input.setAttribute('aria-invalid', 'true'); say('That doesn’t look like an email address. Check it and try again.', 'is-error'); input.focus(); return; }
      if (NOTIFY_ENDPOINT) {
        say('Sending…', 'is-sending'); button.disabled = true;
        try {
          const r = await fetch(NOTIFY_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ email, source: 'wordwell-landing' }) });
          if (!r.ok) throw new Error(String(r.status));
          say('You’re on the list. One email when it ships.', 'is-done');
        } catch (err) {
          say('That didn’t send. Your address is still here; try again in a moment.', 'is-error');
        } finally { button.disabled = false; }
        return;
      }
      if (NOTIFY_MAILTO) {
        const subject = encodeURIComponent('Tell me when WordWell Bible ships');
        const body = encodeURIComponent(`Please email ${email} when WordWell Bible is on the App Store.`);
        say('Your mail app should open with the message ready to send.');
        location.href = `mailto:${NOTIFY_MAILTO}?subject=${subject}&body=${body}`;
        return;
      }
      say('Sign-up isn’t connected yet. This page needs its notify endpoint set before launch.', 'is-error');
    });
  });

  /* ---------- Stage or plain page ---------- */
  const html = document.documentElement, params = new URLSearchParams(location.search);
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches || params.has('rm');
  const touch = matchMedia('(hover: none)').matches;
  const webgl = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  const ww = window.__ww = { p: 0, rm: RM, touch, pointer: { x: 0, y: 0, moved: 0 }, END: 7 };

  /* ---------- Tap a word: a Verse View row opens its entry in Word Detail ---------- */
  // The seven words of John 1:1 as the pipeline keys them (SBLGNT occurrences to Strong's Greek, CC0). Definitions are the
  // Strong's text before its KJV gloss list, verbatim; the first letter is capitalised for the page.
  const WORDS = [
    { surface: 'Ἐν', lemma: 'ἐν', ltr: 'en', en: 'In', strong: 'G1722', from: '', def: 'A primary preposition denoting (fixed) position (in place, time or state), and (by implication) instrumentality (medially or constructively), i.e. a relation of rest (intermediate between 1519 and 1537); "in," at, (up-)on, by, etc.' },
    { surface: 'ἀρχῇ', lemma: 'ἀρχή', ltr: 'archē', en: 'the beginning', strong: 'G746', from: 'from G756 <span lang="el">(ἄρχομαι)</span>', def: '(Properly abstract) a commencement, or (concretely) chief (in various applications of order, time, place, or rank).' },
    { surface: 'ἦν', lemma: 'ἦν', ltr: 'ēn', en: 'was', strong: 'G2258', from: 'imperfect of G1510 <span lang="el">(εἰμί)</span>', def: 'I (thou, etc.) was (wast or were).' },
    { surface: 'λόγος', lemma: 'λόγος', ltr: 'logos', en: 'the Word', note: 'the word John chose for <q>Word</q>', strong: 'G3056', from: 'from G3004 <span lang="el">(λέγω)</span>', def: 'Something said (including the thought); by implication, a topic (subject of discourse), also reasoning (the mental faculty) or motive; by extension, a computation; specially, (with the article in John) the Divine Expression (i.e. Christ).' },
    { surface: 'καὶ', lemma: 'καί', ltr: 'kai', en: 'and', strong: 'G2532', from: '', def: 'Apparently, a primary particle, having a copulative and sometimes also a cumulative force; and, also, even, so then, too, etc.; often used in connection (or composition) with other particles or small words.' },
    { surface: 'πρὸς', lemma: 'πρός', ltr: 'pros', en: 'with', strong: 'G4314', from: 'a strengthened form of G4253 <span lang="el">(πρό)</span>', def: 'A preposition of direction; forward to, i.e. toward (with the genitive case, the side of, i.e. pertaining to; with the dative case, by the side of, i.e. near to; usually with the accusative case, the place, time, occasion, or respect, which is the destination of the relation, i.e. whither or for which it is predicated).' },
    { surface: 'θεόν', lemma: 'θεός', ltr: 'theos', en: 'God', strong: 'G2316', from: 'of uncertain affinity', def: 'A deity, especially (with 3588) the supreme Divinity; figuratively, a magistrate; by Hebraism, very.' },
  ];
  const entry = $('[data-entry]'), wordBtns = $$('[data-word]');
  const show = i => {   // set the entry for word i and mark it in both lists (the markup is the constants above, never input)
    const w = WORDS[i];
    $('.gk', entry).textContent = w.lemma;
    $('.tr', entry).innerHTML = `<i>${w.ltr}</i> · ${w.note || `<q>${w.en}</q>`}${w.surface !== w.lemma ? ` · in the verse, <span lang="el">${w.surface}</span>` : ''}`;
    $('.entry-head', entry).innerHTML = `<span>Strong's ${w.strong}</span><span>${w.from}</span>`;
    $('.entry-def', entry).textContent = w.def;
    wordBtns.forEach(b => { if (+b.dataset.word === i) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
  };
  // Opening a word from the rows: the plain page scrolls to the entry; the stage replaces this with a walk to its stop.
  let openWord = () => { $('#word').scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'start' }); $('.gk', entry).focus({ preventScroll: true }); };
  wordBtns.forEach(b => b.addEventListener('click', () => { show(+b.dataset.word); if (b.closest('.rows')) openWord(); }));

  if (!webgl || params.has('static')) return;   // plain page: every section stacks, night to day, no scene.
  html.classList.add('stage', 'torch');
  if (RM) html.classList.add('rm');
  html.style.setProperty('--track', String(ww.END + 1));
  if (touch) { const h = $('[data-hint]'); if (h) h.textContent = 'Touch the stone to light it.'; }

  /* ---------- Pointer: the torch follows it ---------- */
  const glow = $('.torch-glow');
  const point = (x, y) => {
    ww.pointer.x = x / innerWidth * 2 - 1; ww.pointer.y = -(y / innerHeight * 2 - 1); ww.pointer.moved = performance.now();
    html.classList.add('pointered');
    if (glow) glow.style.transform = `translate3d(${x}px,${y}px,0)`;
  };
  // Over a block of words the flame steps back (scene.js dims it, styles.css hides its dot and returns the system pointer).
  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    point(e.clientX, e.clientY);
    html.classList.toggle('reading', e.target instanceof Element && !!e.target.closest('.st-verse, .st-word, .st-about'));
  }, { passive: true });
  addEventListener('touchstart', e => { const t = e.touches[0]; if (t) point(t.clientX, t.clientY); }, { passive: true });
  addEventListener('touchmove', e => { const t = e.touches[0]; if (t) point(t.clientX, t.clientY); }, { passive: true });

  /* ---------- Sections ---------- */
  const sections = $$('.st').map(el => ({ el, a: +el.dataset.in, b: +el.dataset.out, kids: [...el.children].filter(k => !k.classList.contains('inscription')) }));
  const set = (n, o, y = 0) => { n.style.opacity = o; n.style.transform = RM || !y ? '' : `translate3d(0,${y}px,0)`; };
  const FADE = .3;
  const choreograph = p => {
    for (const s of sections) {
      const tin = s.a < 0 ? 1 : eo(ramp(p, s.a, s.a + FADE)), tout = eo(ramp(p, s.b - FADE, s.b));
      const vis = tin * (1 - tout);
      s.el.style.opacity = vis > 0.001 ? 1 : 0;
      s.el.classList.toggle('on', vis > 0.001);
      s.el.classList.toggle('live', vis > 0.6);
      s.kids.forEach((k, i) => {
        const ki = s.a < 0 ? 1 : eo(ramp(p, s.a + i * .05, s.a + FADE + i * .05));
        set(k, ki * (1 - tout), 22 * (1 - ki) - 18 * tout);
      });
    }
    const day = ramp(p, 5.9, 6.4);
    html.classList.toggle('walked', p > .08);
    html.classList.toggle('day', day > .5);
    html.classList.toggle('torch', day <= .5);
    // If the scene never draws (blocked CDN, lost context), the page itself still walks from night into day.
    document.body.style.background = day > 0 ? `color-mix(in srgb, var(--paper) ${Math.round(day * 100)}%, var(--night))` : '';
  };

  /* ---------- Frame loop ---------- */
  let cur = 0, target = 0;
  const tick = () => {
    target = clamp(scrollY / innerHeight, 0, ww.END);
    cur = Math.abs(target - cur) < .0005 ? target : lerp(cur, target, RM ? 1 : .1);
    ww.p = cur;
    choreograph(cur);
    requestAnimationFrame(tick);
  };

  /* ---------- Navigation ---------- */
  const targets = { entrance: 0, english: 1.05, verse: 2.6, word: 3.95, about: 5.25, iphone: 6.75 };
  // Settling: when the visitor stops scrolling, the walk finishes the step to the nearest stop, so every moment is easy to land on.
  const STOPS = Object.values(targets);
  let settleT = 0, settling = 0, handled = false;   // handled: the visitor has scrolled since the last settle (programmatic scrolls never settle)
  const settle = () => {
    const h = innerHeight, from = scrollY, near = STOPS.reduce((a, b) => Math.abs(b * h - from) < Math.abs(a * h - from) ? b : a) * h;
    if (Math.abs(near - from) < 2 || from > STOPS[STOPS.length - 1] * h + 2) return;
    if (RM) { scrollTo(0, near); return; }
    const t0 = performance.now(), dur = 650 + Math.min(450, Math.abs(near - from) / h * 500), id = ++settling;
    const step = now => { if (settling !== id) return; const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); scrollTo(0, from + (near - from) * e); if (k < 1) requestAnimationFrame(step); else settling = 0; };
    requestAnimationFrame(step);
  };
  const touchScroll = () => { settling = 0; handled = true; clearTimeout(settleT); };   // the visitor took over again
  addEventListener('wheel', touchScroll, { passive: true }); addEventListener('touchstart', touchScroll, { passive: true }); addEventListener('keydown', e => { if (/^(Arrow|Page|Space|Home|End)/.test(e.key) || e.key === ' ') touchScroll(); });
  addEventListener('scroll', () => { if (settling || !handled) return; clearTimeout(settleT); settleT = setTimeout(() => { handled = false; settle(); }, 170); }, { passive: true });
  const go = (id, smooth = true) => { const t = targets[id]; if (t == null) return; scrollTo({ top: t * innerHeight, behavior: smooth && !RM ? 'smooth' : 'auto' }); };
  ww.go = go;
  // A tapped row walks to Word Detail; focus follows once the entry is on screen (focusing it sooner would jump the walk).
  openWord = () => { go('word'); setTimeout(() => $('.gk', entry).focus({ preventScroll: true }), RM ? 0 : 1200); };
  $$('[data-go]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault(); go(a.dataset.go);
    if (a.dataset.go === 'iphone') setTimeout(() => $('#email')?.focus({ preventScroll: true }), RM ? 0 : 1400);
  }));
  sections.forEach(s => s.el.addEventListener('focusin', () => { if (!s.el.classList.contains('live')) go(s.el.id, false); }));

  /* ---------- Start ---------- */
  const at = parseFloat(params.get('at'));
  if (!Number.isNaN(at)) { scrollTo(0, at * innerHeight); cur = target = at; ww.p = at; }
  else if (location.hash && targets[location.hash.slice(1)] != null) { go(location.hash.slice(1), false); cur = scrollY / innerHeight; }
  requestAnimationFrame(tick);
})();
