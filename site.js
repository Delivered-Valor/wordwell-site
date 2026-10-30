/* WordWell Bible landing page · words, scroll and the notify form.
   Scroll position is the walk: 1 unit = one viewport height. This script owns the words laid over the hall and
   publishes the smoothed progress and the pointer on window.__ww, which scene.js reads to move the camera and the torch. */
(() => {
  'use strict';

  /* ---------- Configuration (the only values to edit before launch) ---------- */
  const NOTIFY_KIT_FORM = 'https://app.kit.com/forms/10079640/subscriptions';   // the Kit form on Josh's account (embed uid 8aae8a8f03)
  const NOTIFY_ENDPOINT = '';   // Or, instead of Kit: a POST endpoint that accepts JSON {email} (Formspree, a Worker, ...).
  const NOTIFY_MAILTO = '';     // Fallback address for a prefilled mail when neither is set.

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
      if (NOTIFY_KIT_FORM || NOTIFY_ENDPOINT) {
        say('Sending…', 'is-sending'); button.disabled = true;
        try {
          if (NOTIFY_KIT_FORM) {   // Kit takes the form fields as posted and answers JSON with a status (it allows any origin)
            const body = new FormData(); body.append('email_address', email);
            const r = await fetch(NOTIFY_KIT_FORM, { method: 'POST', body, headers: { Accept: 'application/json' } });
            const reply = await r.json().catch(() => ({}));
            if (!r.ok || reply.status === 'failed') throw new Error(String(r.status));
          } else {
            const r = await fetch(NOTIFY_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ email, source: 'wordwell-landing' }) });
            if (!r.ok) throw new Error(String(r.status));
          }
          say('You’re on the list. If an email asks you to confirm, tap its link; after that, one email when it ships.', 'is-done');
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
  const ww = window.__ww = { p: 0, rm: RM, touch, pointer: { x: 0, y: 0, moved: 0 }, parallax: { x: 0, y: 0 }, END: 7 };

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

  if (!webgl || params.has('static')) { html.classList.remove('pre-stage'); return; }   // plain page: every section stacks, night to day, no scene.
  html.classList.add('stage', 'torch');
  if (RM) html.classList.add('rm');
  html.style.setProperty('--track', String(ww.END + 1));
  if (touch) { const h = $('[data-hint]'); if (h) h.textContent = 'Touch the stone to light it.'; }

  /* ---------- The final copy can scroll at enlarged browser text sizes ---------- */
  const finalScene = $('.st-iphone'), finalCopy = document.createElement('div');
  finalCopy.className = 'final-copy';
  finalCopy.dataset.finalScroll = '';
  finalCopy.tabIndex = -1;
  // display:contents preserves the normal layout; only overflowing copy becomes a bounded scroll region.
  finalCopy.append(...finalScene.children);
  finalScene.append(finalCopy);
  const updateFinalScroll = () => {
    const content = [...finalCopy.children].filter(el => !el.classList.contains('foot'));
    const height = content.reduce((sum, el) => {
      const style = getComputedStyle(el);
      return sum + el.scrollHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    }, 0);
    const scrolling = height > innerHeight * .62 || $('.foot', finalCopy).scrollHeight > innerHeight * .25;
    finalCopy.classList.toggle('is-scrollable', scrolling);
    finalCopy.tabIndex = scrolling ? 0 : -1;
    if (scrolling) { finalCopy.setAttribute('role', 'region'); finalCopy.setAttribute('aria-label', 'WordWell Bible launch'); }
    else { finalCopy.removeAttribute('role'); finalCopy.removeAttribute('aria-label'); finalCopy.scrollTop = 0; }
  };
  const finalObserver = new ResizeObserver(updateFinalScroll);
  [...finalCopy.children].forEach(el => finalObserver.observe(el));
  addEventListener('resize', updateFinalScroll, { passive: true });
  document.fonts.ready.then(updateFinalScroll);
  /* ---------- Keep every fact and the Plus copy between the header and Next ---------- */
  const about = $('.st-about'), aboutCopy = document.createElement('div');
  aboutCopy.className = 'about-copy';
  aboutCopy.dataset.aboutScroll = '';
  // Keep the section's oversized shade outside the native copy scroll extent.
  aboutCopy.append(...about.children);
  about.append(aboutCopy);
  const updateAboutScroll = () => {
    const top = $('.bar').getBoundingClientRect().bottom + 12;
    const bottom = $('[data-next-wrap]').getBoundingClientRect().top - 22;
    const height = [...aboutCopy.children].reduce((sum, el) => {
      const style = getComputedStyle(el);
      return sum + el.scrollHeight + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    }, 0);
    const scrolling = height + 12 > bottom - top;
    about.style.setProperty('--copy-top', `${top}px`);
    about.style.setProperty('--copy-bottom', `${innerHeight - bottom}px`);
    about.classList.toggle('has-copy-scroll', scrolling);
    aboutCopy.classList.toggle('is-scrollable', scrolling);
    if (scrolling) { aboutCopy.tabIndex = 0; aboutCopy.setAttribute('role', 'region'); aboutCopy.setAttribute('aria-label', 'What’s inside WordWell Bible'); }
    else { aboutCopy.removeAttribute('tabindex'); aboutCopy.removeAttribute('role'); aboutCopy.removeAttribute('aria-label'); aboutCopy.scrollTop = 0; }
  };
  const aboutObserver = new ResizeObserver(updateAboutScroll);
  [...aboutCopy.children, $('.bar'), $('[data-next-wrap]')].forEach(el => aboutObserver.observe(el));
  addEventListener('resize', updateAboutScroll, { passive: true });
  document.fonts.ready.then(updateAboutScroll);
  const inCopyScroll = node => node instanceof Element && !!node.closest('[data-final-scroll].is-scrollable, [data-about-scroll].is-scrollable');

  /* ---------- Pointer: the torch follows it ---------- */
  const glow = $('.torch-glow');
  const point = (x, y) => {
    ww.pointer.x = x / innerWidth * 2 - 1; ww.pointer.y = -(y / innerHeight * 2 - 1); ww.pointer.moved = performance.now();
    html.classList.add('pointered');
    if (glow) glow.style.transform = `translate3d(${x}px,${y}px,0)`;
  };
  // Pointer capture keeps a touch's original target even over a control, so check the live hit too.
  const controls = 'button, a, input, textarea, select, option, label, form, summary, [role="button"], [role="link"], [role="slider"], [role="switch"], [role="checkbox"], [role="textbox"], [contenteditable], [tabindex]';
  const isControl = node => node instanceof Element && !!node.closest(controls);
  const overControl = e => isControl(e.target) || isControl(document.elementFromPoint(e.clientX, e.clientY));
  let drag = null;
  const release = () => { drag = null; ww.parallax.x = ww.parallax.y = 0; };
  addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0) return;
    drag = { id: e.pointerId, blocked: overControl(e), x: e.clientX, y: e.clientY };
    if (!drag.blocked && e.pointerType !== 'mouse') point(e.clientX, e.clientY);
  }, { passive: true });
  addEventListener('pointermove', e => {
    if (!e.isPrimary || (drag && (drag.id !== e.pointerId || drag.blocked)) || overControl(e)) return;
    if (e.pointerType === 'mouse' || e.pointerType === 'pen' || drag) point(e.clientX, e.clientY);
    if (drag && !RM) {
      // A short drag gives a small perspective shift; longer drags stay within the same bounds.
      const span = Math.min(innerWidth, innerHeight) * .5;
      ww.parallax.x = clamp((e.clientX - drag.x) / span, -1, 1);
      ww.parallax.y = clamp(-(e.clientY - drag.y) / span, -1, 1);
    }
    html.classList.toggle('reading', e.target instanceof Element && !!e.target.closest('.st-verse, .st-word, .st-about'));
  }, { passive: true });
  const endPointer = e => { if (drag && drag.id === e.pointerId) release(); };
  addEventListener('pointerup', endPointer, { passive: true });
  addEventListener('pointercancel', endPointer, { passive: true });
  addEventListener('blur', release);
  addEventListener('pointerout', e => { if (!e.relatedTarget) endPointer(e); }, { passive: true });

  /* ---------- Sections ---------- */
  const sections = $$('.st').map(el => ({ el, a: +el.dataset.in, b: +el.dataset.out, kids: [...el.children].flatMap(k => k === finalCopy || k === aboutCopy ? [...k.children] : [k]).filter(k => !k.classList.contains('inscription')) }));
  const set = (n, o, y = 0) => { n.style.opacity = o; n.style.transform = RM || !y ? '' : `translate3d(0,${y}px,0)`; };
  const FADE = .3;
  const choreograph = p => {
    for (const s of sections) {
      const tin = s.a < 0 ? 1 : eo(ramp(p, s.a, s.a + FADE)), tout = eo(ramp(p, s.b - FADE, s.b));
      const vis = tin * (1 - tout);
      s.el.style.opacity = vis > 0.001 ? 1 : 0;
      s.el.style.setProperty('--vis', vis.toFixed(3));   // each block's shade fades with its words (styles.css reads --vis)
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
    updateNext();
    requestAnimationFrame(tick);
  };

  /* ---------- Navigation: one gesture, one stop ---------- */
  // The walk moves between stops and never rests between them. A wheel gesture, a swipe, an arrow key or the Next button
  // each walk exactly one stop at the same unhurried pace however fast the input was, so every move is deliberate and calm.
  const targets = { entrance: 0, english: 1.05, verse: 2.6, word: 3.95, about: 5.25, iphone: 6.75 };
  const STOPS = Object.values(targets);
  const NEXT = ['Read it in English', 'Walk through the door', 'Open a word', 'See what’s inside', 'Step into the daylight'];
  const stopAt = y => STOPS.reduce((best, s, i) => Math.abs(s * innerHeight - y) < Math.abs(STOPS[best] * innerHeight - y) ? i : best, 0);
  const inOut = t => (1 - Math.cos(Math.PI * t)) / 2;   // sine ease: its fastest moment is only ~1.6× the average pace (a cubic peaks at 3×)
  // How long each step takes, by the distance the camera travels: up to the English verse, through the doorway into the hall
  // (the longest walk, and the one that felt rushed), the two hall stops, and out into the daylight.
  const STEP_MS = [2800, 5600, 3600, 3600, 4800];
  let walk = 0, walkTo = -1;   // walk: the running walk's id (0 when still); walkTo: the stop it is heading for
  const walkToStop = (i, after) => {
    i = clamp(i, 0, STOPS.length - 1);
    const to = STOPS[i] * innerHeight, from = scrollY, done = () => { walk = 0; walkTo = -1; if (after) after(); };
    if (Math.abs(to - from) < 2) { walk = 0; return done(); }
    if (RM) { walk = 0; scrollTo(0, to); return done(); }   // Reduce Motion: the scene cuts through a dip to dark instead
    // One step takes its own time (less if a walk was interrupted part of the way); a jump of several steps is capped at 6 s.
    const at = stopAt(from), hops = Math.max(1, Math.abs(at - i));
    const lo = hops > 1 || at !== i ? Math.min(at, i) : (to > from ? i - 1 : i);   // the step being walked: stops lo and lo + 1
    const dur = hops > 1 ? Math.min(6000, STEP_MS.slice(lo, lo + hops).reduce((a, b) => a + b, 0) * .5)
      : STEP_MS[lo] * clamp(Math.abs(to - from) / ((STOPS[lo + 1] - STOPS[lo]) * innerHeight), .35, 1);
    const t0 = performance.now(), id = ++walk; walkTo = i;
    const step = now => {
      if (walk !== id) return;
      const k = Math.min(1, (now - t0) / dur); scrollTo(0, from + (to - from) * inOut(k));
      if (k < 1) requestAnimationFrame(step); else done();
    };
    requestAnimationFrame(step);
  };
  const here = () => walkTo >= 0 ? walkTo : stopAt(scrollY);
  const advance = dir => walkToStop(here() + dir);

  // Wheels and trackpads: a gesture is a burst of events (a trackpad's momentum keeps one going for a second or more),
  // and each burst walks one stop. Pinch-zoom (ctrl+wheel) is left to the browser.
  let wheelLast = 0, wheelSum = 0, wheelSpent = false;
  addEventListener('wheel', e => {
    if (e.ctrlKey || inCopyScroll(e.target)) return;
    e.preventDefault();
    const now = performance.now();
    if (now - wheelLast > 220) { wheelSum = 0; wheelSpent = false; }
    wheelLast = now;
    if (wheelSpent) return;
    wheelSum += e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
    if (Math.abs(wheelSum) > 30) { wheelSpent = true; advance(Math.sign(wheelSum)); }
  }, { passive: false });
  // Touch: a vertical swipe walks one stop; the page itself never drags. Pinches (two fingers) are left alone.
  let swipeY = null, swipeX = 0, copySwipe = false;
  addEventListener('touchstart', e => { copySwipe = inCopyScroll(e.target); if (copySwipe) { swipeY = null; return; } if (e.touches.length === 1) { swipeY = e.touches[0].clientY; swipeX = e.touches[0].clientX; } else swipeY = null; }, { passive: true });
  addEventListener('touchmove', e => { if (copySwipe) return; if (swipeY !== null && e.touches.length === 1 && e.cancelable) e.preventDefault(); }, { passive: false });
  addEventListener('touchend', e => {
    if (copySwipe) { copySwipe = false; swipeY = null; return; }
    if (swipeY === null) return;
    const t = e.changedTouches[0], dy = swipeY - t.clientY, dx = t.clientX - swipeX; swipeY = null;
    if (Math.abs(dy) > 40 && Math.abs(dy) > Math.abs(dx)) advance(Math.sign(dy));
  }, { passive: true });
  // Keys: arrows, Page Up/Down and Space walk a stop; Home and End go to either end. Typing and pressed controls keep their keys.
  addEventListener('keydown', e => {
    if (e.altKey || e.ctrlKey || e.metaKey || !(e.target instanceof Element)) return;
    if (inCopyScroll(e.target) || e.target.closest('input, textarea, select, [contenteditable]')) return;
    const k = e.key, onControl = !!e.target.closest('button, a');
    const down = k === 'ArrowDown' || k === 'PageDown' || (k === ' ' && !e.shiftKey && !onControl);
    const up = k === 'ArrowUp' || k === 'PageUp' || (k === ' ' && e.shiftKey && !onControl);
    if (down || up) { e.preventDefault(); advance(down ? 1 : -1); }
    else if (k === 'Home' || k === 'End') { e.preventDefault(); walkToStop(k === 'Home' ? 0 : STOPS.length - 1); }
  });
  // Anything else that moves the page (the scrollbar, find-in-page) settles on the nearest stop once it stops.
  const noSettle = params.has('at');   // review captures pin a position between stops
  let settleT = 0;
  addEventListener('scroll', () => {
    if (walk || noSettle) return;
    clearTimeout(settleT);
    settleT = setTimeout(() => { if (!walk && scrollY <= STOPS[STOPS.length - 1] * innerHeight + 2) walkToStop(stopAt(scrollY)); }, 200);
  }, { passive: true });

  const go = (id, smooth = true, after) => {
    const i = STOPS.indexOf(targets[id]); if (i < 0) return;
    if (smooth) walkToStop(i, after); else { walk = 0; walkTo = -1; scrollTo(0, STOPS[i] * innerHeight); if (after) after(); }
  };
  ww.go = go;
  // A tapped row walks to Word Detail, and focus follows it there.
  openWord = () => go('word', true, () => $('.gk', entry).focus({ preventScroll: true }));
  $$('[data-go]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    go(a.dataset.go, true, a.dataset.go === 'iphone' ? () => $('#email')?.focus({ preventScroll: true }) : undefined);
  }));
  sections.forEach(s => s.el.addEventListener('focusin', () => { if (!s.el.classList.contains('live') && !walk) go(s.el.id, false); }));

  // The Next control: on every screen until the daylight, named for where it goes.
  const nextWrap = $('[data-next-wrap]'), nextBtn = $('[data-next]'), nextLabel = $('[data-next-label]');
  let nextShown = -1;
  if (nextWrap) { nextWrap.hidden = false; nextBtn.addEventListener('click', () => advance(1)); }
  const updateNext = () => {
    if (!nextWrap) return;
    const i = here();
    if (i !== nextShown) { nextShown = i; if (i < NEXT.length) nextLabel.textContent = NEXT[i]; html.classList.toggle('at-end', i >= NEXT.length); }
  };

  /* ---------- Start ---------- */
  const at = parseFloat(params.get('at'));
  if (!Number.isNaN(at)) { scrollTo(0, at * innerHeight); cur = target = at; ww.p = at; }
  else if (location.hash && targets[location.hash.slice(1)] != null) { go(location.hash.slice(1), false); cur = scrollY / innerHeight; }
  // A blocked CDN or a stalled GPU never draws the first frame: after six seconds, show the words over the dark anyway.
  setTimeout(() => { if (!html.classList.contains('lit')) html.classList.add('scene-failed'); }, 6000);
  requestAnimationFrame(tick);
})();
