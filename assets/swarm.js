// "Swarm" resume theme: a crew of agent cursors builds the page in front of you, section by section as you scroll.
// start() hides every block and splits its text into words (custom tags, so the page's span rules leave them alone);
// each agent claims the next block in view, selects it, and places its words. stop() puts the original text nodes back.
(() => {
  const BLOCKS = 'h1, h2, h3, p, li, figure, .role-meta, .impact-strip article, .xp-grip, .ab-text, .ab-stage, .ab-readout, .ab-controls, .ab-ctxbar, .ab-pairs, .ab-textbar, .ab-temp, .ab-qs, .ab-answer, .ab-exp, .contact-links a, .sw-replay, footer';
  const SKIP = '.theme-picker';
  const NO_WORDS = 'script, style, textarea, select, option, svg';
  const COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#3b82f6', '#8b5cf6', '#ec4899'];
  const NS = 'http://www.w3.org/2000/svg';

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let gen = 0;          // bumped by stop(); suspended agent loops check it and quit
  let waiters = new Set();
  let agents = [];
  let pending = new Set();
  let blocks = [];
  let wrapped = [];     // { span, text }
  let active = 0;
  let finished = false;
  let layer = null, skip = null, credit = null, raf = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const ease = (k) => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const docRect = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, right: r.right + scrollX, bottom: r.bottom + scrollY };
  };
  const make = (tag, cls, parent) => { const el = document.createElement(tag); if (cls) el.className = cls; if (parent) parent.append(el); return el; };

  function wait(ms) {
    return new Promise((resolve) => {
      const done = () => { clearTimeout(id); waiters.delete(done); resolve(); };
      const id = setTimeout(done, ms);
      waiters.add(done);
    });
  }

  // Glide along a gentle curve rather than a straight line, like a hand moving a mouse.
  function moveTo(agent, x, y, dur) {
    agent.orbit = null;
    const dist = Math.hypot(x - agent.x, y - agent.y);
    dur = dur ?? Math.min(900, Math.max(260, dist * .7));
    const bend = rand(-.25, .25) * dist;
    const mx = (agent.x + x) / 2, my = (agent.y + y) / 2;
    const nx = dist ? -(y - agent.y) / dist : 0, ny = dist ? (x - agent.x) / dist : 0;
    return new Promise((resolve) => {
      if (agent.anim) agent.anim.resolve();
      agent.anim = { x0: agent.x, y0: agent.y, x1: x, y1: y, cx: mx + nx * bend, cy: my + ny * bend, t0: performance.now(), dur, resolve };
    });
  }

  function place(agent, x, y) {
    if (agent.anim) { agent.anim.resolve(); agent.anim = null; }
    agent.orbit = null;
    agent.x = x; agent.y = y;
  }

  function frame(now) {
    agents.forEach((a) => {
      if (a.anim) {
        const { x0, y0, x1, y1, cx, cy, t0, dur, resolve } = a.anim;
        const k = Math.min(1, (now - t0) / dur), e = ease(k), u = 1 - e;
        a.x = u * u * x0 + 2 * u * e * cx + e * e * x1;
        a.y = u * u * y0 + 2 * u * e * cy + e * e * y1;
        if (k === 1) { a.anim = null; resolve(); }
      } else if (a.orbit) {
        const o = a.orbit;
        o.angle += o.speed;
        a.x = o.cx + Math.cos(o.angle) * o.r;
        a.y = o.cy + Math.sin(o.angle) * o.r * .8;
      }
      a.el.style.transform = `translate(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px)`;
    });
    raf = requestAnimationFrame(frame);
  }

  function cursor(color) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 20');
    svg.setAttribute('class', 'sw-agent');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M1 1 L1 16 L5 12 L8 19 L11 17.6 L8 11 L14 11 Z');
    path.setAttribute('fill', color);
    svg.append(path);
    return svg;
  }

  function split(block) {
    const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => {
        const parent = n.parentElement;
        if (!n.data.trim() || parent.closest(NO_WORDS)) return NodeFilter.FILTER_REJECT;
        // Text other scripts rewrite (anything under an id) fades in with its block instead.
        if (parent !== block && parent.id) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    const words = [];
    nodes.forEach((node) => {
      const span = document.createElement('sw-t');
      node.data.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { span.append(part); return; }
        const word = document.createElement('sw-w');
        word.textContent = part;
        span.append(word);
        words.push(word);
      });
      node.replaceWith(span);
      wrapped.push({ span, text: node.data });
    });
    return words;
  }

  function reveal(b) {
    pending.delete(b.el);
    b.el.classList.remove('sw-wait', 'sw-typing');
    b.words.forEach((w) => w.classList.add('on'));
  }

  // Next block for an agent: whatever is on screen, top first, then anything scrolled past. Nothing below the fold.
  function claim() {
    let best = null, bestScore = Infinity;
    const fold = innerHeight + 60;
    for (const el of pending) {
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) { reveal(el.swBlock); continue; }
      if (r.top > fold) continue;
      const score = (r.bottom > 0 ? 0 : 1e6 - r.top) + r.top;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) pending.delete(best);
    return best && best.swBlock;
  }

  function guide(x, y, vertical) {
    const g = make('div', 'sw-guide ' + (vertical ? 'v' : 'h'), layer);
    if (vertical) { g.style.left = x + 'px'; g.style.height = document.documentElement.scrollHeight + 'px'; }
    else { g.style.top = y + 'px'; g.style.width = document.documentElement.clientWidth + 'px'; }
    setTimeout(() => g.remove(), 1400);
  }

  async function build(agent, b, my) {
    const r = docRect(b.el);
    await moveTo(agent, r.x, r.y);
    if (my !== gen) return;
    const sel = make('div', 'sw-select', layer);
    sel.style.cssText = `left:${r.x - 3}px;top:${r.y - 3}px;width:${r.w + 6}px;height:${r.h + 6}px;--c:${agent.color}`;
    make('span', 'sw-dim', sel).textContent = `${Math.round(r.w)} × ${Math.round(r.h)}`;
    if (Math.random() < .3) guide(r.x, 0, true);
    if (Math.random() < .2) guide(0, r.y, false);
    b.el.classList.replace('sw-wait', 'sw-typing');
    if (!b.words.length) {
      b.el.classList.remove('sw-typing');
      await moveTo(agent, r.right, r.bottom, 420);
    } else {
      // Long blocks place several words per tick so nothing takes much over a second and a half.
      const per = Math.ceil(b.words.length / 50);
      const tick = Math.min(55, Math.max(16, 900 / b.words.length));
      for (let i = 0; i < b.words.length; i += per) {
        const batch = b.words.slice(i, i + per);
        batch.forEach((w) => w.classList.add('on'));
        const wr = batch[batch.length - 1].getBoundingClientRect();
        place(agent, wr.right + scrollX, wr.bottom + scrollY - 4);
        await wait(tick);
        if (my !== gen) return;
      }
      b.el.classList.remove('sw-typing');
    }
    sel.classList.add('out');
    setTimeout(() => sel.remove(), 300);
    await wait(rand(60, 180));
  }

  async function idle(agent, my) {
    const shell = document.querySelector('.resume-shell').getBoundingClientRect();
    await moveTo(agent, rand(shell.left, shell.right) + scrollX, scrollY + innerHeight * rand(.55, .92), rand(500, 900));
    if (my === gen) await wait(rand(250, 700));
  }

  async function work(agent, my) {
    while (my === gen && !finished) {
      const b = claim();
      if (!b) {
        if (!pending.size && !active) return finale(my);
        await idle(agent, my);
        continue;
      }
      active++;
      try { await build(agent, b, my); } finally { active--; }
    }
  }

  // Everyone gathers round the credit, circles once, and clocks off.
  async function finale(my) {
    if (finished) return;
    finished = true;
    skip.hidden = true;
    const r = docRect(credit.querySelector('p') || credit);
    const cx = r.x + Math.min(r.w, 420) / 2, cy = r.y + r.h / 2;
    await Promise.all(agents.map((a, i) => moveTo(a, cx + Math.cos(i) * 70, cy + Math.sin(i) * 50, rand(600, 1000))));
    if (my !== gen) return;
    agents.forEach((a, i) => { a.orbit = { cx, cy, r: rand(40, 90), angle: i * 2.4, speed: rand(.03, .06) }; });
    await wait(1600);
    if (my !== gen) return;
    layer.classList.add('out');
    await wait(700);
    if (my !== gen) return;
    cancelAnimationFrame(raf);
    layer.remove();
    agents = [];
  }

  function skipAll() {
    blocks.forEach(reveal);
    layer.querySelectorAll('.sw-select, .sw-guide').forEach((el) => el.remove());
    if (!finished) { gen++; waiters.forEach((done) => done()); finale(gen); }
  }

  function addCredit(count) {
    credit = make('section', 'sw-credit');
    credit.setAttribute('aria-label', 'How this page was built');
    make('p', 'sw-credit-kicker', credit).textContent = `This page was built by ${count} agents while you scrolled.`;
    make('p', '', credit).textContent = 'Every word, box and line above was placed by a cursor working alongside the others. (The agents are pretend. The résumé is not.)';
    const again = make('button', 'sw-replay', credit);
    again.type = 'button';
    again.textContent = 'Build it again';
    again.addEventListener('click', () => { stop(); scrollTo({ top: 0 }); start(); });
    document.querySelector('.resume-shell footer').before(credit);
  }

  function start() {
    if (layer || reduced.matches) return;
    const my = ++gen;
    finished = false;
    const count = innerWidth < 760 ? 10 : 18;
    addCredit(count);
    const shell = document.querySelector('.resume-shell');
    const all = [...shell.querySelectorAll(BLOCKS)].filter((el) => !el.closest(SKIP));
    const leaves = all.filter((el) => !all.some((other) => other !== el && el.contains(other)));
    blocks = leaves.map((el) => {
      const b = { el, words: split(el) };
      el.swBlock = b;
      el.classList.add('sw-b', 'sw-wait');
      pending.add(el);
      return b;
    });

    layer = make('div', 'sw-layer', document.body);
    layer.setAttribute('aria-hidden', 'true');
    skip = make('button', 'sw-skip', document.body);
    skip.type = 'button';
    skip.innerHTML = '<span>Agents build as you scroll</span> Skip';
    skip.addEventListener('click', skipAll);

    // Agents gather in the middle of the screen, circle for a beat, then fan out to work.
    const cx = scrollX + innerWidth / 2, cy = scrollY + innerHeight * .45;
    agents = Array.from({ length: count }, (_, i) => {
      const color = COLORS[i % COLORS.length];
      const el = cursor(color);
      layer.append(el);
      const angle = (i / count) * Math.PI * 2;
      const spread = Math.min(300, innerWidth * .45);
      return { el, color, x: cx + Math.cos(angle) * spread, y: cy + Math.sin(angle) * spread * .8, anim: null, orbit: null };
    });
    raf = requestAnimationFrame(frame);
    agents.forEach((a, i) => {
      const angle = (i / count) * Math.PI * 2;
      moveTo(a, cx + Math.cos(angle) * 70, cy + Math.sin(angle) * 56, rand(500, 800)).then(() => {
        if (my !== gen) return;
        a.orbit = { cx, cy, r: Math.hypot(a.x - cx, a.y - cy), angle, speed: .045 };
      });
    });
    wait(1300).then(() => {
      if (my !== gen) return;
      agents.forEach((a, i) => wait(i * 45).then(() => my === gen && work(a, my)));
    });
  }

  function stop() {
    gen++;
    waiters.forEach((done) => done());
    agents.forEach((a) => a.anim && a.anim.resolve());
    cancelAnimationFrame(raf);
    if (layer) layer.remove();
    if (skip) skip.remove();
    if (credit) credit.remove();
    blocks.forEach(({ el }) => { el.classList.remove('sw-b', 'sw-wait', 'sw-typing'); delete el.swBlock; });
    wrapped.forEach(({ span, text }) => { if (span.isConnected) span.replaceWith(text); });
    waiters = new Set(); agents = []; pending = new Set(); blocks = []; wrapped = [];
    active = 0; finished = false; layer = skip = credit = null;
  }

  window.Swarm = { start, stop };
})();
