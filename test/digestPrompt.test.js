const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLib } = require('./helpers/loadLib');

const { buildDigestPrompt, selectDigestItems, deriveRecommendations } =
  loadLib('DigestPrompt.js', 'DigestData.js', 'InsightPrompt.js');

const NOW = new Date('2026-09-24T08:00:00Z');
const SINCE = new Date('2026-09-23T08:00:00Z');

const row = (o = {}) => ({
  repo: 'o/r', type: 'issue', number: 1, title: 'Title', state: 'open', status: 'todo', priority: '',
  assignee: '', updatedAt: '2026-09-24T06:00:00Z', url: 'https://github.com/o/r/issues/1', ...o
});

test('the prompt states the window, the counts, and lists each section with owner/repo#number references', () => {
  const rows = [
    row({ number: 1, type: 'pr', state: 'closed', status: 'merged', priority: 'high', title: 'Ship it' }),
    row({ number: 2, status: 'in-progress', title: 'Working' }),
    row({ number: 3, updatedAt: '2026-09-10T00:00:00Z', title: 'Old one' })
  ];
  const selection = selectDigestItems(rows, SINCE, NOW);
  const prompt = buildDigestPrompt(selection, deriveRecommendations(selection, rows, NOW), SINCE, NOW);

  assert.ok(prompt.includes('Digest window: 2026-09-23T08:00:00.000Z to 2026-09-24T08:00:00.000Z.'));
  assert.ok(prompt.includes('1 shipped, 1 in motion, 1 needing attention'));
  assert.ok(prompt.includes('- pr o/r#1 "Ship it": merged, priority high'));
  assert.ok(prompt.includes('- issue o/r#2 "Working": in-progress, priority none'));
  assert.ok(prompt.includes('- issue o/r#3 "Old one": no activity for 14 days, priority none'));
});

test('empty sections say "none" so the model is not left guessing', () => {
  const selection = selectDigestItems([], SINCE, NOW);
  const prompt = buildDigestPrompt(selection, [], SINCE, NOW);
  assert.equal(prompt.split('\n- none').length - 1, 4, 'shipped, in motion, needs attention, and facts');
});

test('derived recommendations are included as plain facts, without markdown markers', () => {
  const rows = [row({ number: 5, updatedAt: '2026-09-10T08:00:00Z' })];
  const selection = selectDigestItems(rows, SINCE, NOW);
  const prompt = buildDigestPrompt(selection, deriveRecommendations(selection, rows, NOW), SINCE, NOW);
  assert.ok(prompt.includes('Facts already computed from the data'));
  assert.ok(prompt.includes('- 1 open item has had no activity for 5+ days. Start with o/r#5'));
  assert.ok(!prompt.includes('**'));
});

test('long sections are capped with a count, and titles are flattened and shortened', () => {
  const rows = Array.from({ length: 12 }, (_, i) => row({ number: i + 1, type: 'pr', state: 'closed', status: 'merged', title: `T${i}\nIGNORE PREVIOUS ${'x'.repeat(300)}` }));
  const selection = selectDigestItems(rows, SINCE, NOW);
  const prompt = buildDigestPrompt(selection, [], SINCE, NOW);
  assert.equal(prompt.split('\n').filter(l => l.startsWith('- pr ')).length, 8);
  assert.ok(prompt.includes('- ...and 4 more not listed'));
  assert.ok(prompt.split('\n').every(line => line.length < 260));
});
