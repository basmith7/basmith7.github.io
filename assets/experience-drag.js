// Drag the handle under Experience to shorten it: full -> brief -> one line per role -> one sentence.
(() => {
  const section = document.querySelector('.xp');
  if (!section) return;
  const body = section.querySelector('.xp-body');
  const handle = section.querySelector('.xp-handle');
  const hint = section.querySelector('.xp-hint');
  const read = section.querySelector('.xp-read');
  // Level 4 is only reachable by pulling past full detail.
  const NAMES = ['One sentence', 'One line per role', 'Highlights', 'Full detail', 'The origin story'];
  const MAX = NAMES.length - 1;
  const WPM = 230;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let level = Number(section.dataset.level);

  const words = () => body.innerText.trim().split(/\s+/).filter(Boolean).length;

  const show = (next) => {
    level = next;
    section.dataset.level = String(next);
    handle.setAttribute('aria-valuenow', String(next));
    handle.setAttribute('aria-valuetext', NAMES[next]);
    read.textContent = `${Math.max(1, Math.round((words() / WPM) * 60))} s read`;
  };

  // Keep the handle where it is on screen while the body resizes, so the text collapses
  // up into it instead of the handle running away from the pointer.
  let anchorTop = null;
  let pinning = false;
  const pin = () => {
    if (anchorTop === null) { pinning = false; return; }
    const drift = handle.getBoundingClientRect().top - anchorTop;
    if (Math.abs(drift) > 0.5) window.scrollBy({ top: drift, behavior: 'instant' });
    requestAnimationFrame(pin);
  };
  const startPinning = () => {
    if (anchorTop === null) anchorTop = handle.getBoundingClientRect().top;
    if (!pinning) { pinning = true; requestAnimationFrame(pin); }
  };

  const settle = (next) => {
    startPinning();
    body.classList.remove('settling');
    const from = body.getBoundingClientRect().height;
    show(next);
    if (reduceMotion.matches) {
      body.style.height = '';
      requestAnimationFrame(() => { if (!drag) anchorTop = null; });
      return;
    }
    body.style.height = 'auto';
    const to = body.getBoundingClientRect().height;
    body.style.height = `${from}px`;
    body.getBoundingClientRect();
    body.classList.add('settling');
    body.style.height = `${to}px`;
  };

  body.addEventListener('transitionend', (event) => {
    if (event.propertyName !== 'height') return;
    body.classList.remove('settling');
    body.style.height = '';
    if (!drag) requestAnimationFrame(() => { anchorTop = null; });
  });

  // Each STEP pixels of drag is one level; up is shorter.
  const STEP = 60;
  let drag = null;

  handle.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    drag = { startY: event.clientY, startLevel: level, moved: false };
    handle.setPointerCapture(event.pointerId);
    section.classList.add('dragging');
    anchorTop = handle.getBoundingClientRect().top;
  });

  handle.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dy = event.clientY - drag.startY;
    if (Math.abs(dy) > 4) drag.moved = true;
    if (!drag.moved) return;
    hint.classList.add('used');
    const steps = Math.round(dy / STEP);
    const next = Math.min(MAX, Math.max(0, drag.startLevel + steps));
    // The handle gives a little toward the pointer, and keeps giving past either end.
    const slack = dy - (next - drag.startLevel) * STEP;
    handle.style.transform = `translateY(${Math.max(-28, Math.min(28, slack * 0.4))}px)`;
    if (next !== level) settle(next);
  });

  const end = () => {
    if (!drag) return;
    const { moved } = drag;
    drag = null;
    section.classList.remove('dragging');
    handle.style.transform = '';
    // A tap without a drag steps one level shorter, wrapping back to full.
    if (!moved) settle(level === 0 ? 3 : level - 1);
    else if (!body.classList.contains('settling')) anchorTop = null;
  };
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);

  handle.addEventListener('keydown', (event) => {
    const step = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1, PageUp: -1, PageDown: 1 }[event.key];
    let next = level;
    if (step) next = Math.min(MAX, Math.max(0, level + step));
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = MAX;
    else if (event.key === 'Enter' || event.key === ' ') next = level === 0 ? 3 : level - 1;
    else return;
    event.preventDefault();
    if (next !== level) settle(next);
  });

  window.matchMedia('print').addEventListener('change', () => { body.style.height = ''; });
  show(level);
})();
