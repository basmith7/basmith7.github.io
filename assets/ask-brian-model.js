/* A tiny fixed-window language model: N one-hot words in, one tanh hidden layer,
   softmax over the vocabulary out. Pure functions, no DOM, so it can be tested in node. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TinyLM = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const H = 24, LR = 0.2;
  const BOS = '·start', EOS = '·end';

  // N = words of context. Sentences are padded with BOS so every word (and the end) is a target.
  function buildSet(def, N) {
    N = N || 2;
    const vocab = [BOS, EOS];
    const add = (w) => { if (!vocab.includes(w)) vocab.push(w); };
    def.sentences.forEach((s) => s.split(' ').forEach(add));
    (def.extra || []).forEach(add);
    const idx = {}; vocab.forEach((w, i) => { idx[w] = i; });
    const pairs = [];
    def.sentences.forEach((s) => {
      const t = Array(N).fill(BOS).concat(s.split(' '), [EOS]);
      for (let i = N; i < t.length; i++) {
        const words = t.slice(i - N, i + 1);
        pairs.push({ ctx: words.slice(0, N).map((w) => idx[w]), t: idx[t[i]], words });
      }
    });
    return { def, N, vocab, idx, pairs, V: vocab.length };
  }

  function initModel(S, rand) {
    const r = rand || (() => Math.random() - 0.5);
    const V = S.V, D = S.N * V;
    return {
      W1: Array.from({ length: H }, () => Array.from({ length: D }, r)),
      b1: new Array(H).fill(0),
      W2: Array.from({ length: V }, () => Array.from({ length: H }, r)),
      b2: new Array(V).fill(0),
    };
  }

  function paramCount(m) {
    return m.W1.length * m.W1[0].length + m.b1.length + m.W2.length * m.W2[0].length + m.b2.length;
  }

  // ctx: array of N vocabulary indices.
  function forward(m, S, ctx) {
    const V = S.V, a1 = new Array(H);
    for (let h = 0; h < H; h++) {
      let z = m.b1[h];
      for (let s = 0; s < S.N; s++) z += m.W1[h][s * V + ctx[s]];
      a1[h] = Math.tanh(z);
    }
    const z2 = new Array(V); let mx = -1e9;
    for (let v = 0; v < V; v++) {
      let z = m.b2[v];
      for (let h = 0; h < H; h++) z += m.W2[v][h] * a1[h];
      z2[v] = z; if (z > mx) mx = z;
    }
    let sum = 0; const p = new Array(V);
    for (let v = 0; v < V; v++) { p[v] = Math.exp(z2[v] - mx); sum += p[v]; }
    for (let v = 0; v < V; v++) p[v] /= sum;
    return { a1, p };
  }

  function step(m, S, ctx, t) {
    const V = S.V, { a1, p } = forward(m, S, ctx);
    const dz2 = p.slice(); dz2[t] -= 1;
    const da1 = new Array(H).fill(0);
    for (let v = 0; v < V; v++) {
      const g = dz2[v];
      if (Math.abs(g) < 1e-9) continue;
      for (let h = 0; h < H; h++) { da1[h] += g * m.W2[v][h]; m.W2[v][h] -= LR * g * a1[h]; }
      m.b2[v] -= LR * g;
    }
    for (let h = 0; h < H; h++) {
      const dz = da1[h] * (1 - a1[h] * a1[h]);
      for (let s = 0; s < S.N; s++) m.W1[h][s * V + ctx[s]] -= LR * dz;
      m.b1[h] -= LR * dz;
    }
    return -Math.log(Math.max(p[t], 1e-9));
  }

  // One pass over every context pair in shuffled order. Returns mean loss.
  function epochOnce(m, S, rand) {
    const r = rand || Math.random;
    const order = S.pairs.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [order[i], order[j]] = [order[j], order[i]]; }
    let L = 0;
    order.forEach((i) => { const pr = S.pairs[i]; L += step(m, S, pr.ctx, pr.t); });
    return L / S.pairs.length;
  }

  function argmax(p) { let b = 0; p.forEach((x, k) => { if (x > p[b]) b = k; }); return b; }

  // Sharpen (T<1) or flatten (T>1) a distribution. T=0 collapses onto the argmax.
  function tempered(p, T) {
    if (!T || T <= 0) { const q = new Array(p.length).fill(0); q[argmax(p)] = 1; return q; }
    const q = p.map((x) => Math.pow(Math.max(x, 1e-12), 1 / T));
    const sum = q.reduce((a, b) => a + b, 0);
    return q.map((x) => x / sum);
  }

  // Draw one index from p at temperature T. rand() in [0,1).
  function sample(p, T, rand) {
    const q = tempered(p, T);
    let r = (rand || Math.random)(), acc = 0;
    for (let i = 0; i < q.length; i++) { acc += q[i]; if (r < acc) return i; }
    return argmax(q);
  }

  // The last N seed words become the window, padded with BOS if the seed is shorter.
  function seedContext(S, seedWords) {
    const padded = Array(S.N).fill(BOS).concat(seedWords).slice(-S.N);
    return padded.map((w) => S.idx[w]);
  }

  function greedy(m, S, seedWords, maxSteps) {
    let ctx = seedContext(S, seedWords);
    const out = [];
    for (let s = 0; s < maxSteps; s++) {
      const best = argmax(forward(m, S, ctx).p);
      if (S.vocab[best] === EOS) break;
      out.push(S.vocab[best]);
      ctx = ctx.slice(1).concat([best]);
    }
    return out.join(' ');
  }

  return { H, LR, BOS, EOS, buildSet, initModel, paramCount, forward, step, epochOnce, greedy, argmax, seedContext, tempered, sample };
});
