/* The whole resume as short lowercase fact sentences. This is the entire training set. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AskBrianCorpus = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const CORPUS = {
    sentences: [
      'brian is the senior business consultant at entrata',
      'for entrata brian consults on business intelligence for multifamily clients',
      'brian was a senior solutions architect at pallet',
      'for pallet brian led client audits and product discovery',
      'brian was a senior solutions architect at smartrent',
      'for smartrent brian drove smart home rollouts across many units',
      'brian was a product manager at nextmune',
      'for nextmune brian managed custom erp projects',
      'brian was a solutions architect at optimumhq',
      'for optimumhq brian built hundreds of workflows',
      'brian was a data analyst at smartpractice',
      'for smartpractice brian designed reports and dashboards',
      'brian studied business at rio salado college',
      'brian earned the certified scrum product owner credential',
      'brian earned the certified scrum master credential',
      'brian writes sql and javascript',
      'brian uses jira git docker and postgres',
      'brian builds apps with claude code',
      'brian shipped smartdraft for fantasy football',
      'brian built household tools with the anthropic api',
      'brian runs an unraid media server',
      'brian likes snowboarding and golf',
      'brian reads sci fi and fantasy',
      'brian has a dog named biscuit',
    ],
    extra: ['salary'],
    questions: [
      { q: 'Where does Brian work now?', seed: ['brian', 'is'], answer: 'the senior business consultant at entrata',
        note: 'Nothing looked that up. After “brian is” the weights lean toward “the”, then toward “senior”, and so on until they lean toward stopping. With one word of context, “is” alone also leads to “certified”, so the answer can wander.' },
      { q: 'What did he do at SmartRent?', seed: ['smartrent', 'brian'], answer: 'drove smart home rollouts across many units',
        note: 'Two words that only ever sat next to each other once, so the network was pushed to handle exactly this pair. Try seeding it with “at smartrent” below and it stops immediately: in the text nothing ever follows those two words.' },
      { q: 'What did he study?', seed: ['brian', 'studied'], answer: 'business at rio salado college',
        note: 'Four words rebuilt in a row, each conditioned on the ones before it. “at” appears in a dozen sentences, so the words before it have to carry the decision.' },
      { q: 'What does he write?', seed: ['brian', 'writes'], answer: 'sql and javascript',
        note: 'Same network, different second word, and it goes somewhere completely different. Context is the whole trick.' },
      { q: 'Does he have a dog?', seed: ['brian', 'has'], answer: 'a dog named biscuit',
        note: 'Yes, and the network knows his name. Not because it stored the sentence, but because the weights lean that way after “brian has”.' },
      { q: 'What does Brian earn?', seed: ['brian', 'salary'], untrained: true,
        note: 'Salary was never in the text, so the connections for “salary” stayed random. “brian” takes over and it answers anyway, just as confidently. This is where made-up answers come from, and it is why you should ask him instead.' },
    ],
  };
  const LIMITS = { maxSentences: 60, maxVocab: 250 };

  // Lowercase, strip punctuation, one sentence per line. Returns { sentences, extra, error }.
  function parseText(text) {
    const sentences = String(text || '').split(/\r?\n/)
      .map((l) => l.toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const out = { sentences, extra: CORPUS.extra.slice(), error: null };
    if (!sentences.length) { out.error = 'Give it at least one sentence.'; return out; }
    if (sentences.length > LIMITS.maxSentences) { out.error = 'Keep it to ' + LIMITS.maxSentences + ' sentences or fewer, or the diagram and training grind to a halt.'; return out; }
    const vocab = new Set(); sentences.forEach((l) => l.split(' ').forEach((w) => vocab.add(w)));
    if (vocab.size > LIMITS.maxVocab) { out.error = 'That is ' + vocab.size + ' distinct words. Keep it under ' + LIMITS.maxVocab + ' so the output layer stays drawable.'; return out; }
    return out;
  }

  function corpusText(def) { return def.sentences.join('\n'); }

  // Questions whose seed words all exist in the current vocabulary.
  function usableQuestions(def, vocabSet) {
    return def.questions.filter((q) => q.seed.every((w) => vocabSet.has(w)));
  }

  return { CORPUS, LIMITS, parseText, corpusText, usableQuestions };
});
