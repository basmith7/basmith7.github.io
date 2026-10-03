// "Weightless" resume theme: the page's blocks, words and letters come loose and drift.
// start() splits text into floating pieces (custom tags, so the page's span rules leave them alone), settle() glides everything home, teardown()
// puts the original text nodes back.
(() => {
  const BLOCKS = '.hero-copy > :not(.theme-picker), .portrait, .impact-strip article, .sidebar section, .skill-list li, .section-heading, .role, .project-grid article, .ab-stage, .ab-readout, .ab-controls, .ab-answer, footer';
  const SKIP = '.theme-picker, .ab-pairs, script, style, textarea, select, option, svg';
  const LETTERS_UNDER = 40; // text nodes shorter than this come apart letter by letter
  const RAMP_MS = 16000;    // time to reach full chaos
  const SETTLE_MS = 1100;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let pieces = [];   // { el, ax, ay, fx, fy, px, py, rot, fr }
  let wrapped = [];  // { span, text }
  let visible = new Set();
  let observer = null;
  let raf = 0;
  let t0 = 0;
  let chaos = () => 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const piece = (el, amp, rot) => ({
    el, ax: rand(.3, 1) * amp, ay: rand(.3, 1) * amp,
    fx: rand(.00012, .0004), fy: rand(.00012, .0004),
    px: rand(0, 6.3), py: rand(0, 6.3), rot: rand(-rot, rot), fr: rand(.0001, .0003)
  });

  function split(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => !n.data.trim() || n.parentElement.closest(SKIP) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((node) => {
      const letters = node.data.trim().length < LETTERS_UNDER;
      const span = document.createElement('wl-text');
      node.data.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { span.append(part); return; }
        const word = document.createElement('wl-word');
        if (letters) {
          [...part].forEach((ch) => {
            const l = document.createElement('wl-char');
            l.textContent = ch;
            word.append(l);
            pieces.push(piece(l, 70, 200));
          });
        } else {
          word.textContent = part;
          pieces.push(piece(word, 45, 35));
        }
        span.append(word);
      });
      node.replaceWith(span);
      wrapped.push({ span, text: node.data });
    });
  }

  function render(now) {
    const c = chaos(now);
    const t = now - t0;
    pieces.forEach((p) => {
      if (!visible.has(p.el)) return;
      const x = c * p.ax * (Math.sin(t * p.fx + p.px) + .4 * Math.sin(t * p.fx * 2.7 + p.py));
      const y = c * p.ay * (Math.cos(t * p.fy + p.py) + .4 * Math.sin(t * p.fy * 3.1 + p.px));
      const r = c * p.rot * Math.sin(t * p.fr + p.px);
      p.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${r.toFixed(1)}deg)`;
    });
  }

  function loop(now) {
    render(now);
    raf = requestAnimationFrame(loop);
  }

  function start() {
    if (pieces.length) return;
    // On first load, wait for the rest of the page's scripts to fill in their text.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => { if (document.documentElement.dataset.theme === 'weightless') start(); }, { once: true });
      return;
    }
    const root = document.querySelector('.resume-shell');
    document.querySelectorAll(BLOCKS).forEach((el) => {
      el.classList.add('wl-b');
      pieces.push(piece(el, 90, 10));
    });
    split(root);
    observer = new IntersectionObserver((entries) => entries.forEach((e) => {
      if (e.isIntersecting) visible.add(e.target); else visible.delete(e.target);
    }), { rootMargin: '300px' });
    pieces.forEach((p) => observer.observe(p.el));
    t0 = performance.now();
    if (reduced.matches) {
      // No drifting: leave everything gently askew instead.
      chaos = () => .3;
      requestAnimationFrame(render);
      return;
    }
    chaos = (now) => { const k = Math.min(1, (now - t0) / RAMP_MS); return k * k * (3 - 2 * k); };
    raf = requestAnimationFrame(loop);
  }

  function settle() {
    if (!pieces.length || reduced.matches) return Promise.resolve();
    const from = chaos(performance.now());
    const begin = performance.now();
    // Bring every piece home, including ones scrolled out of view.
    pieces.forEach((p) => visible.add(p.el));
    chaos = (now) => { const k = Math.min(1, (now - begin) / SETTLE_MS); return from * (1 - k * k * (3 - 2 * k)); };
    return new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
  }

  function teardown() {
    cancelAnimationFrame(raf);
    if (observer) observer.disconnect();
    pieces.forEach((p) => { p.el.style.transform = ''; p.el.classList.remove('wl-b'); });
    wrapped.forEach(({ span, text }) => { if (span.isConnected) span.replaceWith(text); });
    pieces = []; wrapped = []; visible = new Set(); observer = null;
  }

  window.Weightless = { start, settle, teardown };
})();
