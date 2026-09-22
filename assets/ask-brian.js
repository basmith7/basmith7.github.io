/* "Ask a tiny model about Brian" — UI around assets/ask-brian-model.js and assets/ask-brian-corpus.js */
(() => {
  const LM = window.TinyLM, AB = window.AskBrianCorpus, CORPUS = AB && AB.CORPUS;
  const STAGE = 60, FULL = 420, MAXEPOCH = 900, MAXWORDS = 12;
  let target = 0, steps = [];
  const $ = (id) => document.getElementById('ab-' + id);
  const root = document.getElementById('ask-brian');
  if (!root || !LM || !CORPUS) return;

  const H = LM.H;
  let N = 2, S = null, model = null, epoch = 0, lossHist = [], training = false, busy = false;
  let corpus = CORPUS;
  let ctx = [];
  const label = (w) => (w === LM.BOS ? 'start' : w === LM.EOS ? 'end' : w);

  /* ---------- diagram ---------- */
  const NS = 'http://www.w3.org/2000/svg';
  const net = $('net');
  let el = {};
  const mk = (tag, attrs) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };

  function buildNet() {
    net.innerHTML = '';
    el = { ih: [], ho: [], hid: [], out: [], slot: [] };
    const V = S.V, hx = 176, ox = 330, top = 14, bottom = 268;
    const hy = (h) => 30 + h * (220 / (H - 1));
    const oy = (v) => top + v * ((bottom - top) / Math.max(1, V - 1));
    const sy = Array.from({ length: N }, (_, s) => 141 - (N - 1) * 34 + s * 68);
    const gHO = mk('g', {}); net.appendChild(gHO);
    for (let h = 0; h < H; h++) {
      el.ho[h] = [];
      for (let v = 0; v < V; v++) { const l = mk('line', { x1: hx, y1: hy(h), x2: ox, y2: oy(v), 'stroke-linecap': 'round' }); gHO.appendChild(l); el.ho[h][v] = l; }
    }
    const gIH = mk('g', {}); net.appendChild(gIH);
    for (let s = 0; s < N; s++) {
      el.ih[s] = [];
      for (let h = 0; h < H; h++) { const l = mk('line', { x1: 96, y1: sy[s], x2: hx, y2: hy(h), 'stroke-linecap': 'round' }); gIH.appendChild(l); el.ih[s][h] = l; }
    }
    for (let s = 0; s < N; s++) {
      const g = mk('g', {});
      g.appendChild(mk('rect', { x: 4, y: sy[s] - 14, width: 92, height: 28, rx: 4, class: 'ab-slot' }));
      const t = mk('text', { x: 50, y: sy[s] + 4, 'text-anchor': 'middle', class: 'ab-slotword' });
      g.appendChild(t); net.appendChild(g); el.slot[s] = t;
    }
    for (let h = 0; h < H; h++) { const c = mk('circle', { cx: hx, cy: hy(h), r: 4.5, class: 'ab-hid' }); net.appendChild(c); el.hid[h] = c; }
    for (let v = 0; v < V; v++) { const c = mk('circle', { cx: ox, cy: oy(v), r: 1.6, class: 'ab-out' }); net.appendChild(c); el.out[v] = c; }
    net.appendChild(mk('text', { x: 4, y: 24, class: 'ab-label' })).textContent = N + (N === 1 ? ' word in' : ' words in');
    net.appendChild(mk('text', { x: hx, y: 290, class: 'ab-label', 'text-anchor': 'middle' })).textContent = H + ' hidden units';
    const t3 = mk('text', { x: 356, y: 290, class: 'ab-label', 'text-anchor': 'end' }); t3.textContent = V + ' possible next words'; net.appendChild(t3);
    setSlots(); paint();
  }

  function setSlots() { for (let s = 0; s < N; s++) el.slot[s].textContent = label(S.vocab[ctx[s]]); }

  function paint() {
    const V = S.V;
    for (let s = 0; s < N; s++) {
      const base = s * V + ctx[s];
      for (let h = 0; h < H; h++) {
        const w = model.W1[h][base], l = el.ih[s][h];
        l.setAttribute('stroke', w >= 0 ? 'var(--cyan)' : 'var(--pink)');
        l.setAttribute('stroke-width', Math.min(2.6, 0.3 + Math.abs(w) * 1.3).toFixed(2));
        l.setAttribute('stroke-opacity', Math.min(0.9, 0.14 + Math.abs(w) * 0.5).toFixed(2));
      }
    }
    for (let h = 0; h < H; h++) for (let v = 0; v < V; v++) {
      const w = model.W2[v][h], l = el.ho[h][v];
      l.setAttribute('stroke', w >= 0 ? 'var(--cyan)' : 'var(--pink)');
      l.setAttribute('stroke-width', Math.min(1.4, 0.12 + Math.abs(w) * 0.6).toFixed(2));
      l.setAttribute('stroke-opacity', Math.min(0.45, 0.02 + Math.abs(w) * 0.22).toFixed(2));
    }
  }

  function showActivity(a1, p) {
    for (let h = 0; h < H; h++) {
      const a = Math.abs(a1[h]);
      el.hid[h].setAttribute('r', (3.5 + a * 3.5).toFixed(2));
      el.hid[h].style.fill = a1[h] >= 0 ? 'var(--cyan)' : 'var(--pink)';
      el.hid[h].setAttribute('fill-opacity', (0.15 + a * 0.85).toFixed(2));
    }
    const best = LM.argmax(p);
    for (let v = 0; v < S.V; v++) {
      el.out[v].setAttribute('r', (1.4 + p[v] * 6).toFixed(2));
      el.out[v].style.fill = v === best ? 'var(--pink)' : 'var(--text)';
      el.out[v].setAttribute('fill-opacity', (0.16 + p[v] * 0.84).toFixed(2));
    }
  }

  function clearActivity() {
    for (let h = 0; h < H; h++) { el.hid[h].setAttribute('r', 4.5); el.hid[h].style.fill = ''; el.hid[h].setAttribute('fill-opacity', 1); }
    for (let v = 0; v < S.V; v++) { el.out[v].setAttribute('r', 1.6); el.out[v].style.fill = ''; el.out[v].setAttribute('fill-opacity', 1); }
  }

  function drawSpark() {
    const spark = $('spark'); spark.innerHTML = '';
    if (lossHist.length < 2) return;
    const mx = Math.max(...lossHist), n = lossHist.length;
    const pts = lossHist.map((L, i) => ((i / (n - 1)) * 146 + 2).toFixed(1) + ',' + (40 - (L / (mx || 1)) * 34).toFixed(1)).join(' ');
    spark.appendChild(mk('polyline', { points: pts, fill: 'none', stroke: 'var(--pink)', 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  }

  /* ---------- ui ---------- */
  function renderData() {
    $('count').textContent = S.def.sentences.length;
    $('custom').hidden = corpus === CORPUS;
    $('source').textContent = corpus === CORPUS ? 'my resume as' : 'your text,';
    const pairs = $('pairs'); pairs.innerHTML = '';
    S.pairs.forEach((p) => {
      const d = document.createElement('span'); d.className = 'ab-pair';
      const c = p.words.slice(0, N).map(label).join(' '), t = label(p.words[N]);
      d.innerHTML = '<b>' + c + '</b> → <i>' + t + '</i>';
      pairs.appendChild(d);
    });
    $('npairs').textContent = S.pairs.length;
    const qs = $('qs'); qs.innerHTML = '';
    const usable = AB.usableQuestions(CORPUS, new Set(S.vocab));
    usable.forEach((q) => {
      const b = document.createElement('button');
      b.className = 'ab-q'; b.type = 'button'; b.setAttribute('aria-pressed', 'false'); b.textContent = q.q;
      b.addEventListener('click', () => ask(q));
      qs.appendChild(b);
    });
    $('noqs').hidden = usable.length > 0;
    ['s1', 's2'].forEach((id, n) => {
      const sel = $(id); sel.innerHTML = '';
      S.vocab.forEach((w, i) => { if (w === LM.BOS || w === LM.EOS) return; const o = document.createElement('option'); o.value = i; o.textContent = w; sel.appendChild(o); });
      const first = S.pairs[N] ? S.pairs[N].ctx : [];
      const fallback = S.vocab.findIndex((w) => w !== LM.BOS && w !== LM.EOS);
      const want = n === 0 ? first[Math.max(0, N - 2)] : first[N - 1];
      sel.value = (want !== undefined && want > 1) ? want : fallback;
    });
    $('params').textContent = LM.paramCount(model).toLocaleString();
    root.querySelectorAll('.ab-ctx').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.n === N)));
  }

  function updateMetrics() {
    $('epoch').textContent = epoch;
    $('loss').textContent = lossHist.length ? lossHist[lossHist.length - 1].toFixed(2) : '—';
    drawSpark();
  }

  const prefersStill = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sleep = (ms) => new Promise((r) => setTimeout(r, prefersStill() ? 0 : ms));
  const setCaption = (t) => { $('caption').textContent = t; };
  const DEFAULT_NOTE = 'It answers one word at a time. Each word it produces is fed back in as context for the next, and it keeps going until the weights lean toward stopping.';

  function reset(full) {
    S = LM.buildSet(corpus, N);
    model = LM.initModel(S); epoch = 0; lossHist = [];
    ctx = S.pairs[N].ctx.slice();
    renderData(); buildNet(); clearActivity(); updateMetrics();
    $('train').textContent = 'Train it a little'; $('train').disabled = false; $('full').disabled = false;
    $('trail').innerHTML = ''; steps = [];
    $('seed').textContent = 'Nothing asked yet'; $('out').textContent = '—';
    $('probs').className = 'ab-probs'; $('probs').innerHTML = '';
    $('note').textContent = DEFAULT_NOTE;
    setCaption(full === 'text'
      ? 'New text, new vocabulary, so the network starts over from random. Nothing carries across. Train it and ask about what you wrote.'
      : full === 'ctx'
      ? 'Different window, different network: the input layer changed shape, so every connection is random again. Train it and compare.'
      : full
        ? 'Wiped. Every connection is a fresh random number again. Whatever it knew is gone, because the numbers were the only place it lived.'
        : 'Right now every connection is a random number, so the web is a tangle with no shape. Cyan pulls a word toward being next, pink pushes it away. Thickness is how strongly.');
  }

  function train(passes) {
    if (training || busy || epoch >= MAXEPOCH) return;
    training = true; target = Math.min(MAXEPOCH, epoch + passes);
    $('train').disabled = true; $('full').disabled = true; $('wipe').disabled = true;
    root.querySelectorAll('.ab-ctx').forEach((b) => { b.disabled = true; });
    box.disabled = true;
    clearActivity();
    setCaption('Training. Each pass runs every scrap through the network, checks how far off the guess was, and pushes every connection a little way toward being less wrong.');
    const tick = () => {
      let L = 0;
      for (let i = 0; i < 6 && epoch < target; i++) { L = LM.epochOnce(model, S); epoch++; }
      lossHist.push(L);
      if (lossHist.length > 160) lossHist = lossHist.filter((_, i) => i % 2 === 0 || i > lossHist.length - 40);
      paint(); updateMetrics();
      if (epoch < target) requestAnimationFrame(tick);
      else {
        training = false; $('wipe').disabled = false;
        root.querySelectorAll('.ab-ctx').forEach((b) => { b.disabled = false; });
        box.disabled = false;
        const done = epoch >= MAXEPOCH;
        $('train').disabled = done; $('full').disabled = done || epoch >= FULL;
        $('train').textContent = done ? 'That is plenty' : 'Train ' + STAGE + ' more passes';
        setCaption(epoch < FULL
          ? 'Part-way. The web has some shape but it is still hedging: ask it something and look at the bars. Then train more and watch the spreads collapse.'
          : 'Settled. The tangle has structure now: some connections grew thick, most faded toward nothing. That shape is the entire memory. Go ask it something.');
      }
    };
    requestAnimationFrame(tick);
  }

  const pct = (x) => (x * 100 < 9.95 ? (x * 100).toFixed(1) : Math.round(x * 100)) + '%';

  function renderProbs(p, chosen) {
    const box = $('probs'); box.className = 'ab-probs on'; box.innerHTML = '';
    p.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).forEach(([val, i]) => {
      const row = document.createElement('div'); row.className = 'ab-prow' + (i === chosen ? ' chosen' : '');
      row.innerHTML = '<div class="w">' + label(S.vocab[i]) + '</div><div class="bar"><span></span></div><div class="v">' + pct(val) + '</div>';
      box.appendChild(row);
      requestAnimationFrame(() => { row.querySelector('.bar span').style.width = Math.max(1, val * 100) + '%'; });
    });
  }

  // The answer, word by word. Clicking a word shows the distribution it was drawn from.
  function renderTrail(active) {
    const trail = $('trail'); trail.innerHTML = '';
    if (!steps.length) return;
    const cap = document.createElement('div'); cap.className = 'ab-trailcap';
    cap.textContent = 'Each word was drawn from its own spread. Click one.';
    trail.appendChild(cap);
    const row = document.createElement('div'); row.className = 'ab-trailrow';
    steps.forEach((st, i) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'ab-step';
      b.setAttribute('aria-pressed', String(i === active));
      const conf = st.p[st.chosen];
      b.innerHTML = '<span class="w">' + label(S.vocab[st.chosen]) + '</span><span class="c">' + pct(conf) + '</span>';
      if (conf < 0.6) b.classList.add('unsure');
      b.addEventListener('click', () => { renderProbs(st.p, st.chosen); showActivity(st.a1, st.p); renderTrail(i); });
      row.appendChild(b);
    });
    trail.appendChild(row);
  }

  async function generate(seedWords, noteText) {
    busy = true;
    root.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const out = $('out');
    const given = '<span class="given">' + seedWords.join(' ') + '</span>';
    out.innerHTML = given;
    ctx = LM.seedContext(S, seedWords);
    const T = +$('temp').value;
    const made = []; steps = []; $('trail').innerHTML = '';
    let stopped = false;
    for (let s = 0; s < MAXWORDS; s++) {
      setSlots(); paint();
      await sleep(300);
      const { a1, p } = LM.forward(model, S, ctx);
      const q = T > 0 ? LM.tempered(p, T) : p;
      const pick = LM.sample(p, T);
      showActivity(a1, q); renderProbs(q, pick);
      steps.push({ a1, p: q, chosen: pick });
      await sleep(380);
      if (S.vocab[pick] === LM.EOS) {
        stopped = true;
        out.innerHTML = given + ' <span class="made">' + made.join(' ') + '</span> <span class="stop">\u25a0</span>';
        break;
      }
      made.push(S.vocab[pick]);
      out.innerHTML = given + ' <span class="made">' + made.slice(0, -1).join(' ') + '</span> <span class="made fresh">' + made[made.length - 1] + '</span>';
      await sleep(260);
      ctx = ctx.slice(1).concat([pick]);
    }
    if (!stopped) out.innerHTML = given + ' <span class="made">' + made.join(' ') + '</span> <span class="stop" title="cut off">\u2026</span>';
    // Open on the step the network was least sure about.
    let least = 0; steps.forEach((st, i) => { if (st.p[st.chosen] < steps[least].p[steps[least].chosen]) least = i; });
    renderProbs(steps[least].p, steps[least].chosen); showActivity(steps[least].a1, steps[least].p); renderTrail(least);
    if (noteText) $('note').textContent = epoch === 0
      ? 'Untrained, so that is pure noise. The weights are random and the answer is random with them. Train it and ask again.'
      : noteText;
    busy = false;
    root.querySelectorAll('button').forEach((b) => { b.disabled = false; });
    $('train').disabled = epoch >= MAXEPOCH; $('full').disabled = epoch >= FULL;
    if (training) { $('train').disabled = true; $('full').disabled = true; }
  }

  function ask(q) {
    if (busy || training) return;
    root.querySelectorAll('.ab-q').forEach((b) => b.setAttribute('aria-pressed', b.textContent === q.q ? 'true' : 'false'));
    $('seed').textContent = 'starting it off with “' + q.seed.join(' ') + '”';
    generate(q.seed, q.note);
  }

  $('train').addEventListener('click', () => train(STAGE));
  $('full').addEventListener('click', () => train(FULL - epoch));
  const tempLabels = ['always the top word', 'mostly the top word', 'follows the odds', 'takes chances'];
  const tempLabel = () => { const T = +$('temp').value; $('templabel').textContent = tempLabels[T === 0 ? 0 : T < 0.7 ? 1 : T <= 1.05 ? 2 : 3]; };
  $('temp').addEventListener('input', tempLabel); tempLabel();
  $('wipe').addEventListener('click', () => { if (!training && !busy) reset(true); });
  root.querySelectorAll('.ab-ctx').forEach((b) => b.addEventListener('click', () => {
    const n = +b.dataset.n;
    if (training || busy || n === N) return;
    N = n; reset('ctx');
  }));
  $('go').addEventListener('click', () => {
    if (busy || training) return;
    const a = S.vocab[+$('s1').value], b = S.vocab[+$('s2').value];
    root.querySelectorAll('.ab-q').forEach((x) => x.setAttribute('aria-pressed', 'false'));
    $('seed').textContent = 'starting it off with “' + a + ' ' + b + '”';
    const seen = S.pairs.some((p) => p.words.slice(0, N).join(' ').endsWith(a + ' ' + b) || (N === 1 && p.words[0] === b));
    generate([a, b], seen
      ? 'That pairing was in the text, so the network has been pushed to handle it directly.'
      : 'Those two words never appeared together in the text. It answered anyway. There is no mechanism in here for stopping on doubt, only for guessing.');
  });

  const box = $('text'), err = $('texterr');
  box.value = AB.corpusText(CORPUS);
  function applyText(text, fromReset) {
    if (training || busy) return;
    const r = AB.parseText(text);
    err.textContent = r.error || ''; err.hidden = !r.error;
    if (r.error) return;
    const isDefault = r.sentences.join('\n') === CORPUS.sentences.join('\n');
    corpus = isDefault ? CORPUS : { sentences: r.sentences, extra: r.extra, questions: CORPUS.questions };
    box.value = isDefault ? AB.corpusText(CORPUS) : r.sentences.join('\n');
    reset(fromReset ? true : 'text');
  }
  $('apply').addEventListener('click', () => applyText(box.value, false));
  $('restore').addEventListener('click', () => applyText(AB.corpusText(CORPUS), true));
  box.addEventListener('input', () => { err.hidden = true; });

  reset(false);
})();
