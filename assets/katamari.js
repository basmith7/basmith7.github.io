/* Katamari: roll up the résumé. The DOM side of assets/katamari-core.js.
   Technique after Katamari Hack (kathack.com, Alex Leone, David Nufer and David Truong, 2011):
   clone each page element onto the ball and hide the original. Independent rewrite.

   window.Katamari = { start({onExit}), stop(), running }
   Everything start() changes in the page is undone by stop(): split words are put back as the
   original text nodes and the kt-taken class comes off. No other page node is replaced, so
   listeners elsewhere (the ask-brian demo, the theme pills) keep working. */
(() => {
  const K = window.KatamariCore;
  if (!K) { console.warn('KatamariCore missing; Katamari disabled.'); return; }

  const START_R = 18;
  const CELL = 128;          // rect grid cell, px
  const MAX_CLONES = 160;
  const CAP_SHARE = 0.38;    // ball drawn at most this share of the viewport's short side
  const FLY_MS = 220;        // a picked-up item flies from its spot to the ball
  const DOTS = 44;
  const DOT_COLORS = ['#ff4f9a', '#33b5ff', '#ffd23f', '#5fd38d', '#ff8a3d', '#27295e', '#a86bff'];
  const SKIP = '.theme-picker, script, style, template, [hidden]';
  const ATOM = 'a, button, img, svg, input, textarea, select, kt-w, .skill-list li, .impact-strip strong';
  const NO_SPLIT = SKIP + ', #ask-brian, a, button, textarea, select, svg, .skill-list li, .impact-strip strong';
  const UI = '.kt-hud, .kt-end, .theme-picker';
  const STYLE_PROPS = ['font-family', 'font-size', 'font-weight', 'font-style', 'line-height', 'letter-spacing',
    'text-transform', 'text-shadow', 'text-align', 'color', 'background-color', 'background-image', 'border-top',
    'border-right', 'border-bottom', 'border-left', 'border-radius', 'padding-top', 'padding-right',
    'padding-bottom', 'padding-left', 'list-style'];
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let S = null;              // live game state; null when not running
  let hud = null, endCard = null, opts = {};
  let running = false;
  let pushed = false, backPending = false, opener = null;

  // ---------- page → pickables ----------

  function splitWords(shell) {
    const texts = [];
    const walker = document.createTreeWalker(shell, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (/\S/.test(n.nodeValue) && !n.parentElement.closest(NO_SPLIT)
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT),
    });
    while (walker.nextNode()) texts.push(walker.currentNode);
    return texts.map((original) => {
      const inserted = K.splitWords(original.nodeValue).map((tok) => {
        if (!K.isWord(tok)) return document.createTextNode(tok);
        const w = document.createElement('kt-w');
        w.textContent = tok;
        return w;
      });
      original.replaceWith(...inserted);
      return { original, inserted };
    });
  }

  function unsplitWords(splits) {
    for (let i = splits.length - 1; i >= 0; i--) {
      const { original, inserted } = splits[i];
      const first = inserted[0];
      if (first.parentNode) first.parentNode.insertBefore(original, first);
      inserted.forEach((n) => n.remove());
    }
  }

  function hasBox(cs) {
    const bg = cs.backgroundColor;
    if (cs.backgroundImage !== 'none') return true;
    if (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(bg)) return true;
    if (cs.boxShadow !== 'none') return true;
    return ['Top', 'Right', 'Bottom', 'Left'].some((s) =>
      parseFloat(cs['border' + s + 'Width']) > 0 && cs['border' + s + 'Style'] !== 'none');
  }

  function labelFor(el, kind) {
    if (kind === 'box') {
      const h = el.querySelector('h1, h2, h3, strong');
      return h ? `the whole "${clip(h.textContent)}" card` : 'an empty box';
    }
    const t = el.getAttribute('alt') || el.getAttribute('aria-label') || el.textContent;
    return clip(t) || el.tagName.toLowerCase();
  }
  const clip = (s) => { s = (s || '').replace(/\s+/g, ' ').trim(); return s.length > 28 ? s.slice(0, 27) + '…' : s; };

  function measure(it) {
    const r = it.el.getBoundingClientRect();
    it.w = r.width; it.h = r.height;
    it.rect = { left: r.left + scrollX, top: r.top + scrollY, right: r.right + scrollX, bottom: r.bottom + scrollY };
    it.vol = K.itemVolume(it.w, it.h, it.kind === 'box');
    return it.w >= 1 && it.h >= 1;
  }

  // One generic walk: atoms are taken whole; elements that draw a box become pickable once
  // everything inside them is gone; plain wrappers are never picked up themselves.
  function collect(shell) {
    const items = [];
    const walk = (el, parentBox) => {
      if (el.matches(SKIP)) return;
      const atom = el.matches(ATOM) || (el.parentElement && el.parentElement.id === 'ask-brian');
      if (atom) {
        const it = { el, kind: 'atom', parentBox };
        if (measure(it)) { items.push(it); if (parentBox) parentBox.left++; }
        return;
      }
      let box = null;
      if (hasBox(getComputedStyle(el))) {
        box = { el, kind: 'box', parentBox, left: 0 };
        if (!measure(box)) box = null;
      }
      for (const child of el.children) walk(child, box || parentBox);
      if (box) { items.push(box); if (parentBox) parentBox.left++; }
    };
    for (const child of shell.children) walk(child, null);
    items.forEach((it) => { it.label = labelFor(it.el, it.kind); });
    return items;
  }

  function buildGrid(items) {
    const grid = new Map();
    for (const it of items) {
      if (it.taken) continue;
      const x0 = Math.floor(it.rect.left / CELL), x1 = Math.floor(it.rect.right / CELL);
      const y0 = Math.floor(it.rect.top / CELL), y1 = Math.floor(it.rect.bottom / CELL);
      for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
        const key = gx + ',' + gy;
        (grid.get(key) || grid.set(key, []).get(key)).push(it);
      }
    }
    return grid;
  }

  function remeasure() {
    if (!S) return;
    S.items.forEach((it) => { if (!it.taken) measure(it); });
    S.grid = buildGrid(S.items);
  }

  // ---------- clones ----------

  function sanitize(node) {
    if (node.nodeType !== 1) return;
    ['id', 'for', 'name', 'href', 'onclick', 'tabindex', 'aria-labelledby', 'aria-describedby'].forEach((a) => node.removeAttribute(a));
    node.classList.remove('kt-taken');
    if (!node.classList.length) node.removeAttribute('class');
    for (const c of node.children) sanitize(c);
  }

  function makeClone(it) {
    const heavy = it.el.getElementsByTagName('*').length > 200;
    const clone = it.el.cloneNode(it.kind === 'atom' && !heavy);
    sanitize(clone);
    const cs = getComputedStyle(it.el);
    const st = clone.style;
    STYLE_PROPS.forEach((p) => st.setProperty(p, cs.getPropertyValue(p)));
    st.position = 'absolute';
    st.left = -it.w / 2 + 'px';
    st.top = -it.h / 2 + 'px';
    st.width = it.w + 'px';
    st.height = it.h + 'px';
    st.margin = '0';
    st.boxSizing = 'border-box';
    st.boxShadow = 'none';
    st.backdropFilter = 'none';
    st.overflow = 'hidden';
    st.display = cs.display === 'inline' ? 'inline-block' : (cs.display === 'list-item' ? 'block' : cs.display);
    if (it.kind === 'atom' && cs.display === 'inline') st.whiteSpace = 'nowrap';
    if (it.kind === 'box') {
      // An emptied card rides the ball as a bright plank, like the toys in the real game.
      st.background = DOT_COLORS[(S.count * 3) % DOT_COLORS.length];
      st.border = '3px solid #fff8ef';
      st.opacity = '0.92';
    }
    clone.classList.add('kt-clone');
    return clone;
  }

  // ---------- the ball ----------

  function fibonacciDots() {
    const dots = [], golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < DOTS; i++) {
      const y = 1 - (i + 0.5) * 2 / DOTS, rad = Math.sqrt(1 - y * y), th = golden * i;
      dots.push({ v: [Math.cos(th) * rad, y, Math.sin(th) * rad], color: DOT_COLORS[i % DOT_COLORS.length] });
    }
    return dots;
  }

  function drawBody() {
    const { ctx, canvas } = S;
    const R = S.drawR, pad = 4, size = Math.ceil((R + pad) * 2), dpr = Math.min(2, devicePixelRatio || 1);
    if (S.canvasSize !== size) {
      S.canvasSize = size;
      canvas.width = size * dpr; canvas.height = size * dpr;
      canvas.style.width = canvas.style.height = size + 'px';
      canvas.style.left = canvas.style.top = -size / 2 + 'px';
    }
    ctx.setTransform(dpr, 0, 0, dpr, size / 2 * dpr, size / 2 * dpr);
    ctx.clearRect(-size, -size, size * 2, size * 2);
    const g = ctx.createRadialGradient(-R * 0.35, -R * 0.4, R * 0.1, 0, 0, R);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.55, '#f3eefc');
    g.addColorStop(1, '#bfb3dd');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    const a = R * 0.2;
    for (const d of S.dots) {
      if (d.v[2] <= 0.02) continue;
      const x = d.v[0] * R, y = d.v[1] * R;
      ctx.fillStyle = d.color;
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(0.5, a * d.v[2]), a, Math.atan2(y, x), 0, Math.PI * 2);
      ctx.fill();
    }
    const shade = ctx.createRadialGradient(-R * 0.3, -R * 0.35, R * 0.2, 0, 0, R * 1.02);
    shade.addColorStop(0, 'rgba(255,255,255,0.35)');
    shade.addColorStop(0.7, 'rgba(255,255,255,0)');
    shade.addColorStop(1, 'rgba(40,20,90,0.35)');
    ctx.fillStyle = shade;
    ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(39,41,94,.55)'; ctx.stroke();
  }

  function placeClones(now) {
    const R = S.drawR, sc = S.scale;
    for (const s of S.stuck) {
      const p = K.project(s.v, R);
      const half = Math.min(Math.hypot(s.w, s.h) / 2 * sc, 1.6 * R);
      const hidden = !p.front && Math.hypot(p.x, p.y) + half < R;
      if (hidden !== s.hidden) { s.hidden = hidden; s.clone.style.display = hidden ? 'none' : s.display; }
      if (hidden) continue;
      const out = Math.min(s.w, s.h) * 0.3 * sc;
      const n = Math.hypot(p.x, p.y) || 1;
      let x = p.x + (p.x / n) * out * (1 - Math.abs(p.z)), y = p.y + (p.y / n) * out * (1 - Math.abs(p.z));
      let ang = Math.atan2(s.t[1], s.t[0]);
      // Nothing on the ball is drawn longer than the ball is wide, or a panel would swallow the view.
      const fit = Math.min(1, (2.2 * R) / (Math.max(s.w, s.h) * sc));
      let k = sc * fit * (0.55 + 0.45 * Math.hypot(s.t[0], s.t[1]));
      let ky = sc * fit;
      const age = (now - s.born) / FLY_MS;
      if (age < 1) {
        const e = 1 - Math.pow(1 - age, 3);
        x = s.fromX + (x - s.fromX) * e; y = s.fromY + (y - s.fromY) * e;
        ang *= e; k = 1 + (k - 1) * e; ky = 1 + (ky - 1) * e;
      }
      const z = p.front ? 200 + Math.round(p.z * 50) : 100 - Math.round(-p.z * 50);
      if (z !== s.z) { s.z = z; s.clone.style.zIndex = z; }
      s.clone.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${ang.toFixed(3)}rad) scale(${k.toFixed(3)},${ky.toFixed(3)})`;
    }
  }

  // ---------- pickup ----------

  function pickUp(it, now) {
    it.taken = true;
    S.left--;
    if (it.parentBox) it.parentBox.left--;
    const clone = makeClone(it);
    it.el.classList.add('kt-taken');
    const b = S.ball;
    const cx = Math.max(it.rect.left, Math.min(b.x, it.rect.right));
    const cy = Math.max(it.rect.top, Math.min(b.y, it.rect.bottom));
    const v = K.attach(b, cx, cy);
    const t = K.tangentFor(v, (Math.random() - 0.5) * 1.05);
    const midX = (it.rect.left + it.rect.right) / 2 - b.x, midY = (it.rect.top + it.rect.bottom) / 2 - b.y;
    S.ballEl.appendChild(clone);
    S.stuck.push({ clone, display: clone.style.display, v, t, w: it.w, h: it.h, born: now, fromX: midX, fromY: midY, hidden: false });
    if (S.stuck.length > MAX_CLONES) {
      let i = S.stuck.findIndex((s) => s.v[2] < 0 && now - s.born > FLY_MS);
      if (i < 0) i = 0;
      S.stuck[i].clone.remove();
      S.stuck.splice(i, 1);
    }
    K.grow(b, it.vol);
    S.count++;
    S.emitter.emit('pickup', { label: it.label, vol: it.vol, r: b.r, count: S.count });
  }

  function sweep(now) {
    const b = S.ball, R = S.drawR;
    const x0 = Math.floor((b.x - R) / CELL), x1 = Math.floor((b.x + R) / CELL);
    const y0 = Math.floor((b.y - R) / CELL), y1 = Math.floor((b.y + R) / CELL);
    const stamp = ++S.stamp;
    for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
      const cell = S.grid.get(gx + ',' + gy);
      if (!cell) continue;
      for (const it of cell) {
        if (it.taken || it.seen === stamp) continue;
        it.seen = stamp;
        if (it.kind === 'box' && it.left > 0) continue;
        if (!K.circleRect(b.x, b.y, R, it.rect)) continue;
        if (S.unstoppable || K.canPickUp(b, it.vol)) pickUp(it, now);
        else if (!S.tooBig || S.tooBig.it !== it) S.tooBig = { it, until: now + 1400 };
      }
    }
  }

  // ---------- loop ----------

  function input() {
    if (S.pointer) return { target: { x: S.pointer.x + scrollX, y: S.pointer.y + scrollY } };
    const k = S.keys, x = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0), y = (k.has('down') ? 1 : 0) - (k.has('up') ? 1 : 0);
    return x || y ? { dir: { x, y } } : null;
  }

  function camera() {
    const vh = innerHeight, vw = innerWidth, b = S.ball;
    const y = b.y - scrollY, x = b.x - scrollX;
    let dy = 0, dx = 0;
    if (y < vh * 0.3) dy = (y - vh * 0.3) * 0.12; else if (y > vh * 0.7) dy = (y - vh * 0.7) * 0.12;
    if (x < vw * 0.2) dx = (x - vw * 0.2) * 0.12; else if (x > vw * 0.8) dx = (x - vw * 0.8) * 0.12;
    if (dx || dy) scrollBy(dx, dy);
  }

  function frame(now) {
    if (!S) return;
    const t0 = performance.now();
    const dt = Math.min(0.05, (now - (S.last || now)) / 1000);
    S.last = now;
    S.frames++;
    const doc = document.documentElement;
    S.scale = K.drawScale(S.ball.r, Math.min(innerWidth, innerHeight) * CAP_SHARE);
    S.drawR = S.ball.r * S.scale;
    const roll = K.step(S.ball, input(), dt, { minX: 0, minY: 0, maxX: doc.scrollWidth, maxY: doc.scrollHeight }, S.drawR);
    if (roll.angle) {
      for (const s of S.stuck) { s.v = K.rotate(s.v, roll.axis, roll.angle); s.t = K.rotate(s.t, roll.axis, roll.angle); }
      for (const d of S.dots) d.v = K.rotate(d.v, roll.axis, roll.angle);
      if (S.frames % 60 === 0) {
        S.stuck.forEach((s) => { s.v = K.normalize(s.v); s.t = K.normalize(s.t); });
        S.dots.forEach((d) => { d.v = K.normalize(d.v); });
      }
    }
    sweep(now);
    S.ballEl.style.transform = `translate(${S.ball.x.toFixed(1)}px,${S.ball.y.toFixed(1)}px)`;
    drawBody();
    placeClones(now);
    if (!reduceMotion() || S.pointer || S.keys.size) camera();
    updateHud(now);
    if (S.left === 0 && !endCard) showEnd();
    // Safety net: if nothing left can ever fit, let the ball take whatever remains.
    if (S.frames % 30 === 0 && !S.unstoppable && S.left > 0 &&
        !S.items.some((it) => !it.taken && !(it.kind === 'box' && it.left > 0) && K.canPickUp(S.ball, it.vol))) S.unstoppable = true;
    S.frameMs = performance.now() - t0;
    S.raf = requestAnimationFrame(frame);
  }

  // ---------- music ----------
  // Loops while a game is on; fades in on begin() and out on stop(). Browsers only allow play()
  // during a user gesture, so the Katamari pill click starts it silently (see prime below).

  const MUSIC_SRC = '/assets/katamari-on-the-rocks.mp3';
  const MUSIC_VOL = 0.45;
  const MUTE_KEY = 'katamari-muted';
  let music = null, fadeRaf = 0;
  const muted = () => { try { return localStorage.getItem(MUTE_KEY) === '1'; } catch (e) { return false; } };

  function track() {
    if (!music) { music = new Audio(MUSIC_SRC); music.loop = true; music.volume = 0; }
    return music;
  }
  function play() { const p = track().play(); if (p && p.catch) p.catch(() => {}); }
  function fadeTo(target, ms, then) {
    cancelAnimationFrame(fadeRaf);
    const a = track(), from = a.volume, t0 = performance.now();
    const tick = (now) => {
      const k = Math.max(0, Math.min(1, (now - t0) / ms));
      a.volume = from + (target - from) * k;
      if (k < 1) fadeRaf = requestAnimationFrame(tick); else if (then) then();
    };
    fadeRaf = requestAnimationFrame(tick);
  }
  function musicOn() {
    if (!S || muted() || document.hidden) return;
    play();
    fadeTo(MUSIC_VOL, 900);
  }
  function musicOff(rewind) {
    if (!music) return;
    fadeTo(0, 450, () => { music.pause(); if (rewind) music.currentTime = 0; });
  }
  function toggleMute() {
    try { localStorage.setItem(MUTE_KEY, muted() ? '0' : '1'); } catch (e) { /* storage blocked: mute for this game only */ }
    showMute();
    if (muted()) musicOff(false); else musicOn();
  }
  function showMute() {
    const b = hud && hud.querySelector('.kt-mute');
    if (!b) return;
    b.textContent = muted() ? '🔇' : '🔊';
    b.setAttribute('aria-pressed', String(!muted()));
  }

  // ---------- HUD ----------

  const sizeText = (r) => { const cm = (2 * r) / 10; return cm >= 100 ? [(cm / 100).toFixed(2), 'm'] : [cm.toFixed(1), 'cm']; };

  function buildHud() {
    hud = document.createElement('div');
    hud.className = 'kt-hud';
    hud.setAttribute('role', 'region');
    hud.setAttribute('aria-label', 'Katamari game');
    hud.innerHTML = `
      <div class="kt-size"><b>0</b><span>cm</span></div>
      <div class="kt-count">0 things</div>
      <div class="kt-last">Hold the mouse or a finger to roll. Arrow keys work too.</div>
      <div class="kt-actions">
        <button type="button" class="kt-start" hidden>Start rolling</button>
        <button type="button" class="kt-reset">Reset</button>
        <button type="button" class="kt-exit" aria-label="Exit Katamari">✕ Exit</button>
        <button type="button" class="kt-mute" aria-label="Music"></button>
      </div>
      <p class="kt-sr" aria-live="polite"></p>`;
    hud.querySelector('.kt-reset').addEventListener('click', reset);
    hud.querySelector('.kt-exit').addEventListener('click', exit);
    hud.querySelector('.kt-mute').addEventListener('click', toggleMute);
    hud.querySelector('.kt-start').addEventListener('click', () => { hud.querySelector('.kt-start').hidden = true; begin(); });
    document.body.appendChild(hud);
    showMute();
  }

  function updateHud(now) {
    const [n, unit] = sizeText(S.ball.r);
    if (S.shown.size !== n) { S.shown.size = n; hud.querySelector('.kt-size b').textContent = n; hud.querySelector('.kt-size span').textContent = unit; }
    if (S.shown.count !== S.count) {
      S.shown.count = S.count;
      hud.querySelector('.kt-count').textContent = `${S.count} ${S.count === 1 ? 'thing' : 'things'}`;
    }
    let msg = S.lastLabel ? `Rolled up: ${S.lastLabel}` : null;
    if (S.tooBig && S.tooBig.until > now) {
      const need = K.radiusFor(S.tooBig.it.vol / K.FIT);
      msg = `Too big: “${clip(S.tooBig.it.label)}” needs ${sizeText(need).join(' ')}`;
    }
    if (msg && S.shown.msg !== msg) { S.shown.msg = msg; hud.querySelector('.kt-last').textContent = msg; }
    const whole = Math.floor((2 * S.ball.r) / 10);
    if (S.shown.whole !== whole) { S.shown.whole = whole; hud.querySelector('.kt-sr').textContent = `${sizeText(S.ball.r).join(' ')}, ${S.count} things`; }
  }

  function showEnd() {
    const [n, unit] = sizeText(S.ball.r);
    endCard = document.createElement('div');
    endCard.className = 'kt-end';
    endCard.setAttribute('role', 'dialog');
    endCard.setAttribute('aria-modal', 'true');
    endCard.setAttribute('aria-label', 'You rolled up the whole résumé');
    endCard.innerHTML = `
      <p class="kt-end-kicker">Royal rating: magnificent</p>
      <h2>You rolled up the whole résumé!</h2>
      <p class="kt-end-size"><b>${n}</b> ${unit} · ${S.count} things</p>
      <p>Brian is available, and he is all in one place now.</p>
      <p><a href="mailto:brian@basmith.net">brian@basmith.net</a></p>
      <div class="kt-actions"><button type="button" class="kt-again">Play again</button><button type="button" class="kt-back">Back to the résumé</button></div>`;
    endCard.querySelector('.kt-again').addEventListener('click', reset);
    endCard.querySelector('.kt-back').addEventListener('click', exit);
    document.body.appendChild(endCard);
    endCard.querySelector('.kt-again').focus();
  }

  // ---------- input ----------

  const KEYS = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up', ArrowDown: 'down', s: 'down', S: 'down' };
  const typing = (t) => t && t.closest && t.closest('input, textarea, select, [contenteditable]');
  const onUi = (t) => t && t.closest && t.closest(UI);

  const handlers = {
    pointerdown(e) {
      if (!S || S.pointer || !e.isPrimary || onUi(e.target) || (e.pointerType === 'mouse' && e.button !== 0)) return;
      S.pointer = { x: e.clientX, y: e.clientY, id: e.pointerId };
      e.preventDefault();
    },
    pointermove(e) { if (S && S.pointer && S.pointer.id === e.pointerId) { S.pointer.x = e.clientX; S.pointer.y = e.clientY; } },
    pointerup(e) { if (S && S.pointer && S.pointer.id === e.pointerId) S.pointer = null; },
    pointercancel(e) { handlers.pointerup(e); },
    click(e) { if (S && !onUi(e.target) && e.target.closest && e.target.closest('main')) { e.preventDefault(); e.stopPropagation(); } },
    keydown(e) {
      if (e.key === 'Tab' && endCard) {
        const f = [...endCard.querySelectorAll('a, button')];
        const i = f.indexOf(document.activeElement);
        const next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === f.length - 1 ? 0 : i + 1);
        f[next].focus(); e.preventDefault(); return;
      }
      if (e.key === 'Escape') { e.preventDefault(); exit(); return; }
      if (!S || typing(e.target) || !KEYS[e.key]) return;
      S.keys.add(KEYS[e.key]); e.preventDefault();
    },
    keyup(e) { if (S && KEYS[e.key]) S.keys.delete(KEYS[e.key]); },
    blur() { if (S) { S.keys.clear(); S.pointer = null; } },
    popstate() {
      // Our own history.back() from a previous stop() landing: push this game's entry now if waiting.
      if (backPending) { backPending = false; if (running && !pushed) { history.pushState({ katamari: true }, ''); pushed = true; } return; }
      if (running) exit();
    },
    resize() { clearTimeout(handlers.t); handlers.t = setTimeout(remeasure, 200); },
  };
  const listen = (on) => {
    const m = on ? 'addEventListener' : 'removeEventListener';
    ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'click', 'keydown', 'keyup'].forEach((n) => document[m](n, handlers[n], true));
    ['blur', 'resize'].forEach((n) => window[m](n, handlers[n]));
  };

  // ---------- lifecycle ----------

  // Start on the on-screen word nearest the middle that the new ball can take, so the first roll picks it up.
  function startSpot(items) {
    const cx = scrollX + innerWidth / 2, cy = scrollY + innerHeight * 0.55;
    let best = { x: cx, y: cy }, bd = Infinity;
    for (const it of items) {
      if (it.el.tagName !== 'KT-W' || !K.canPickUp({ r: START_R }, it.vol)) continue;
      const x = (it.rect.left + it.rect.right) / 2, y = (it.rect.top + it.rect.bottom) / 2;
      if (y < scrollY + 80 || y > scrollY + innerHeight - 40) continue;
      const d = Math.hypot(x - cx, y - cy);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return best;
  }

  function begin() {
    document.documentElement.classList.add('kt-playing');
    const shell = document.querySelector('main.resume-shell');
    const splits = splitWords(shell);
    const items = collect(shell);
    const ballEl = document.createElement('div');
    ballEl.className = 'kt-ball';
    ballEl.setAttribute('aria-hidden', 'true');
    ballEl.inert = true;
    const canvas = document.createElement('canvas');
    canvas.className = 'kt-canvas';
    ballEl.appendChild(canvas);
    document.body.appendChild(ballEl);
    S = {
      shell, splits, items, ballEl, canvas, ctx: canvas.getContext('2d'),
      ball: K.createBall({ ...startSpot(items), r: START_R }),
      dots: fibonacciDots(), stuck: [], keys: new Set(), pointer: null, emitter: K.createEmitter(),
      left: items.length, count: 0, stamp: 0, frames: 0, scale: 1, drawR: START_R, shown: {}, last: 0,
    };
    S.grid = buildGrid(items);
    S.emitter.on('pickup', (p) => { S.lastLabel = p.label; });
    S.observer = new ResizeObserver(handlers.resize);
    S.observer.observe(shell);
    // Web fonts arriving move the words: re-measure, and re-place the ball if it hasn't rolled yet.
    if (document.fonts) document.fonts.ready.then(() => {
      if (!S) return;
      remeasure();
      if (S.count === 0 && !S.ball.vx && !S.ball.vy) Object.assign(S.ball, startSpot(S.items));
    });
    S.raf = requestAnimationFrame(frame);
    musicOn();
  }

  function teardown() {
    if (!S) return;
    cancelAnimationFrame(S.raf);
    document.documentElement.classList.remove('kt-playing');
    S.observer.disconnect();
    S.ballEl.remove();
    S.items.forEach((it) => {
      it.el.classList.remove('kt-taken');
      if (!it.el.classList.length) it.el.removeAttribute('class');
    });
    unsplitWords(S.splits);
    S = null;
    if (endCard) { endCard.remove(); endCard = null; }
  }

  function start(o) {
    if (running) return;
    running = true;
    opts = o || {};
    buildHud();
    listen(true);
    opener = document.activeElement;
    pushed = false;
    if (!backPending) { history.pushState({ katamari: true }, ''); pushed = true; }
    if (reduceMotion()) hud.querySelector('.kt-start').hidden = false;
    else begin();
  }

  function stop() {
    if (!running) return;
    running = false;
    teardown();
    listen(false);
    clearTimeout(handlers.t);
    if (hud) { hud.remove(); hud = null; }
    musicOff(true);
    document.documentElement.classList.remove('kt-playing');
    if (pushed && history.state && history.state.katamari) { backPending = true; history.back(); }
    pushed = false;
    if (opener && opener.isConnected && document.activeElement === document.body) opener.focus({ preventScroll: true });
    opener = null;
  }

  function exit() { try { if (opts.onExit) opts.onExit(); } finally { stop(); } }
  function reset() { if (!running || !S) return; teardown(); hud.querySelector('.kt-start').hidden = true; begin(); }

  // Always listening: a history.back() from stop() can land after the game has ended.
  window.addEventListener('popstate', handlers.popstate);
  // Prime the music inside the pill click itself: the game starts a moment later, after the theme
  // transition, by which time Safari no longer counts it as a user gesture.
  document.addEventListener('click', (e) => {
    if (running || muted() || reduceMotion() || !e.target.closest || !e.target.closest('[data-theme-choice="katamari"]')) return;
    track().volume = 0;
    play();
    setTimeout(() => { if (!running || !S) musicOff(true); }, 2500);
  }, true);
  document.addEventListener('visibilitychange', () => {
    if (!music) return;
    if (document.hidden) music.pause(); else musicOn();
  });

  window.Katamari = {
    start, stop,
    get running() { return running; },
    // For tests and the curious: the live state, and a way to roll everything up at once.
    debug: {
      state: () => S,
      music: () => music,
      eatAll() { if (!S) return; let more = true; while (more) { more = false; for (const it of S.items) if (!it.taken && !(it.kind === 'box' && it.left > 0)) { pickUp(it, performance.now()); more = true; } } },
    },
  };
})();
