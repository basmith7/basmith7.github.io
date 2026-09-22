const test = require('node:test');
const assert = require('node:assert/strict');
const TinyLM = require('../assets/ask-brian-model.js');
const { CORPUS } = require('../assets/ask-brian-corpus.js');

const SMALL = {
  sentences: ['brian works at entrata', 'brian has a dog named biscuit'],
  extra: ['salary'],
};

function seededRand(seed) {
  return () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff - 0.5; };
}

test('buildSet adds start and end tokens to the vocabulary', () => {
  const S = TinyLM.buildSet(SMALL, 2);
  assert.ok(S.vocab.includes(TinyLM.BOS));
  assert.ok(S.vocab.includes(TinyLM.EOS));
  assert.ok(S.vocab.includes('salary'));
  assert.equal(S.N, 2);
});

test('buildSet pads every sentence so each word, and the end, is a target', () => {
  const S = TinyLM.buildSet(SMALL, 2);
  const first = S.pairs.slice(0, 5).map((p) => p.words);
  assert.deepEqual(first, [
    [TinyLM.BOS, TinyLM.BOS, 'brian'],
    [TinyLM.BOS, 'brian', 'works'],
    ['brian', 'works', 'at'],
    ['works', 'at', 'entrata'],
    ['at', 'entrata', TinyLM.EOS],
  ]);
});

test('context length 1 and 3 change the window and the input width', () => {
  const S1 = TinyLM.buildSet(SMALL, 1), S3 = TinyLM.buildSet(SMALL, 3);
  assert.deepEqual(S1.pairs[2].words, ['works', 'at']);
  assert.deepEqual(S3.pairs[3].words, ['brian', 'works', 'at', 'entrata']);
  const m1 = TinyLM.initModel(S1, () => 0.1), m3 = TinyLM.initModel(S3, () => 0.1);
  assert.equal(m1.W1[0].length, 1 * S1.V);
  assert.equal(m3.W1[0].length, 3 * S3.V);
});

test('paramCount matches the weight and bias shapes', () => {
  const S = TinyLM.buildSet(SMALL, 2);
  const m = TinyLM.initModel(S, () => 0.1);
  const H = TinyLM.H;
  assert.equal(TinyLM.paramCount(m), H * 2 * S.V + H + S.V * H + S.V);
});

test('forward returns a probability distribution over the vocabulary', () => {
  const S = TinyLM.buildSet(SMALL, 2);
  const m = TinyLM.initModel(S, () => 0.1);
  const { p } = TinyLM.forward(m, S, [S.idx.brian, S.idx.works]);
  assert.equal(p.length, S.V);
  assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test('greedy pads a short seed with start tokens and stops at the end token', () => {
  const S = TinyLM.buildSet(SMALL, 3);
  const rand = seededRand(7);
  const m = TinyLM.initModel(S, rand);
  for (let e = 0; e < 300; e++) TinyLM.epochOnce(m, S, () => rand() + 0.5);
  assert.equal(TinyLM.greedy(m, S, ['brian', 'has'], 12), 'a dog named biscuit');
});

test('the full resume corpus rebuilds every canned answer at 2 words of context', () => {
  const S = TinyLM.buildSet(CORPUS, 2);
  const rand = seededRand(12345);
  const m = TinyLM.initModel(S, rand);
  let loss = Infinity;
  for (let e = 0; e < 420; e++) loss = TinyLM.epochOnce(m, S, () => rand() + 0.5);
  assert.ok(loss < 0.8, `loss ${loss}`);
  for (const q of CORPUS.questions) {
    if (q.untrained) continue;
    assert.equal(TinyLM.greedy(m, S, q.seed, 12), q.answer, q.q);
  }
});

test('the full resume corpus still answers at 3 words of context', () => {
  const S = TinyLM.buildSet(CORPUS, 3);
  const rand = seededRand(99);
  const m = TinyLM.initModel(S, rand);
  for (let e = 0; e < 420; e++) TinyLM.epochOnce(m, S, () => rand() + 0.5);
  for (const q of CORPUS.questions) {
    if (q.untrained) continue;
    assert.equal(TinyLM.greedy(m, S, q.seed, 12), q.answer, q.q);
  }
});

test('an untrained seed word still produces an answer', () => {
  const S = TinyLM.buildSet(CORPUS, 2);
  const m = TinyLM.initModel(S, () => 0.1);
  const out = TinyLM.greedy(m, S, ['brian', 'salary'], 4);
  assert.ok(out.length > 0);
});

test('sample at temperature 0 is the argmax', () => {
  const p = [0.1, 0.6, 0.3];
  assert.equal(TinyLM.sample(p, 0, () => 0.99), 1);
});

test('sample at temperature 1 follows the distribution', () => {
  const p = [0.1, 0.6, 0.3];
  assert.equal(TinyLM.sample(p, 1, () => 0.05), 0);
  assert.equal(TinyLM.sample(p, 1, () => 0.5), 1);
  assert.equal(TinyLM.sample(p, 1, () => 0.95), 2);
});

test('higher temperature flattens the distribution before sampling', () => {
  const p = [0.05, 0.9, 0.05];
  // At T=1 a draw of 0.06 lands on the second entry; at a hot temperature the first entry has more room.
  assert.equal(TinyLM.sample(p, 1, () => 0.06), 1);
  assert.equal(TinyLM.sample(p, 3, () => 0.06), 0);
});

test('tempered returns the renormalized distribution used for sampling', () => {
  const q = TinyLM.tempered([0.05, 0.9, 0.05], 3);
  assert.ok(Math.abs(q.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.ok(q[1] < 0.9 && q[0] > 0.05);
  assert.deepEqual(TinyLM.tempered([0.05, 0.9, 0.05], 0), [0, 1, 0]);
});
