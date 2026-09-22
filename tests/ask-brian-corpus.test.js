const test = require('node:test');
const assert = require('node:assert/strict');
const { CORPUS, parseText, corpusText, usableQuestions, LIMITS } = require('../assets/ask-brian-corpus.js');

test('parseText lowercases, strips punctuation, and drops blank lines', () => {
  const r = parseText('Brian works at Entrata!\n\n  The Wi-Fi password is "falcon nine".  \n');
  assert.deepEqual(r.sentences, ['brian works at entrata', 'the wi fi password is falcon nine']);
  assert.equal(r.error, null);
});

test('parseText keeps the extra untrained words so the hallucination demo survives edits', () => {
  const r = parseText('the cat sat on the mat');
  assert.deepEqual(r.extra, CORPUS.extra);
});

test('parseText rejects empty input', () => {
  assert.match(parseText('   \n\n').error, /at least one sentence/i);
});

test('parseText rejects too many lines', () => {
  const r = parseText(Array(LIMITS.maxSentences + 1).fill('a b c').join('\n'));
  assert.match(r.error, /sentences/i);
});

test('parseText rejects too many distinct words', () => {
  const words = Array.from({ length: LIMITS.maxVocab + 5 }, (_, i) => 'w' + i);
  const lines = [];
  for (let i = 0; i < words.length; i += 10) lines.push(words.slice(i, i + 10).join(' '));
  const r = parseText(lines.join('\n'));
  assert.match(r.error, /distinct words/i);
});

test('corpusText round-trips the default corpus one sentence per line', () => {
  const text = corpusText(CORPUS);
  assert.equal(parseText(text).sentences.join('\n'), CORPUS.sentences.join('\n'));
});

test('usableQuestions keeps only questions whose seed words exist in the vocabulary', () => {
  const all = usableQuestions(CORPUS, new Set(CORPUS.sentences.join(' ').split(' ').concat(CORPUS.extra)));
  assert.equal(all.length, CORPUS.questions.length);
  const few = usableQuestions(CORPUS, new Set(['brian', 'has', 'a', 'dog', 'salary']));
  assert.deepEqual(few.map((q) => q.q), ['Does he have a dog?', 'What does Brian earn?']);
});
