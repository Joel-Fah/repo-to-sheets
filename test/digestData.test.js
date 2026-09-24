const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLib } = require('./helpers/loadLib');

const { digestWindowStart, selectDigestItems, deriveRecommendations, chooseRecommendations } = loadLib('DigestData.js');

const NOW = new Date('2026-09-24T08:00:00Z');
const SINCE = new Date('2026-09-23T08:00:00Z');

/**
 * @param {object} [overrides]
 * @returns {object} an Activity row
 */
function row(overrides = {}) {
  return {
    repo: 'o/r', type: 'issue', number: 1, title: 'Title', state: 'open', status: 'todo', priority: '',
    assignee: '', updatedAt: '2026-09-24T06:00:00Z', url: 'https://github.com/o/r/issues/1', ...overrides
  };
}

// ---- window ----

test('with no previous scheduled digest the window is the last 24 hours', () => {
  assert.equal(digestWindowStart(null, NOW).toISOString(), '2026-09-23T08:00:00.000Z');
});

test('the window starts at the last scheduled digest', () => {
  assert.equal(digestWindowStart(new Date('2026-09-23T20:00:00Z'), NOW).toISOString(), '2026-09-23T20:00:00.000Z');
});

test('the lookback is capped at 7 days so a missed week does not dump everything', () => {
  assert.equal(digestWindowStart(new Date('2026-08-01T00:00:00Z'), NOW).toISOString(), '2026-09-17T08:00:00.000Z');
});

test('a "last digest" in the future or an invalid date cannot produce a window after now', () => {
  assert.equal(digestWindowStart(new Date('2026-09-25T00:00:00Z'), NOW).toISOString(), NOW.toISOString());
  assert.equal(digestWindowStart(new Date('nope'), NOW).toISOString(), '2026-09-23T08:00:00.000Z');
});

// ---- selection ----

test('shipped = merged PRs and closed issues updated in the window, newest first', () => {
  const rows = [
    row({ number: 1, type: 'pr', state: 'closed', status: 'merged', updatedAt: '2026-09-24T01:00:00Z' }),
    row({ number: 2, state: 'closed', status: 'done', updatedAt: '2026-09-24T05:00:00Z' }),
    row({ number: 3, type: 'pr', state: 'closed', status: 'merged', updatedAt: '2026-09-20T05:00:00Z' }), // before the window
    row({ number: 4, type: 'pr', state: 'closed', status: 'closed', updatedAt: '2026-09-24T05:00:00Z' }) // closed unmerged
  ];
  assert.deepEqual(selectDigestItems(rows, SINCE, NOW).shipped.map(i => i.row.number), [2, 1]);
});

test('in motion = open items updated in the window', () => {
  const rows = [
    row({ number: 1, updatedAt: '2026-09-24T07:00:00Z' }),
    row({ number: 2, updatedAt: '2026-09-23T09:00:00Z' }),
    row({ number: 3, updatedAt: '2026-09-22T00:00:00Z' }) // before the window
  ];
  assert.deepEqual(selectDigestItems(rows, SINCE, NOW).active.map(i => i.row.number), [1, 2]);
});

test('the window boundary is inclusive', () => {
  const rows = [row({ updatedAt: '2026-09-23T08:00:00Z' })];
  assert.equal(selectDigestItems(rows, SINCE, NOW).active.length, 1);
});

test('needs attention: open items untouched for 5+ days, oldest first, with their age', () => {
  const rows = [
    row({ number: 1, updatedAt: '2026-09-19T08:00:00Z' }), // exactly 5 days
    row({ number: 2, updatedAt: '2026-09-10T08:00:00Z' }), // 14 days
    row({ number: 3, updatedAt: '2026-09-21T08:00:00Z' }), // 3 days: not stale
    row({ number: 4, state: 'closed', status: 'done', updatedAt: '2026-08-01T00:00:00Z' }) // closed: never stale
  ];
  const attention = selectDigestItems(rows, SINCE, NOW).attention;
  assert.deepEqual(attention.map(i => [i.row.number, i.ageDays, i.reason]), [[2, 14, 'stale'], [1, 5, 'stale']]);
});

test('needs attention also flags high-priority items not started, after the stale ones', () => {
  const rows = [
    row({ number: 1, priority: 'high', status: 'todo', updatedAt: '2026-09-22T08:00:00Z' }),
    row({ number: 2, updatedAt: '2026-09-01T08:00:00Z' }),
    row({ number: 3, priority: 'high', status: 'in-progress', updatedAt: '2026-09-22T08:00:00Z' }) // started: not flagged
  ];
  assert.deepEqual(selectDigestItems(rows, SINCE, NOW).attention.map(i => [i.row.number, i.reason]), [[2, 'stale'], [1, 'high-todo']]);
});

test('an item never appears both in motion and in needs attention', () => {
  const longWindow = new Date('2026-09-17T08:00:00Z'); // 7-day lookback
  const rows = [row({ number: 1, updatedAt: '2026-09-18T08:00:00Z' })]; // 6 days old, inside the window
  const selection = selectDigestItems(rows, longWindow, NOW);
  assert.equal(selection.active.length, 1);
  assert.equal(selection.attention.length, 0);
});

test('quiet means nothing shipped and nothing in motion (stale items alone do not break the quiet)', () => {
  const rows = [row({ updatedAt: '2026-09-01T00:00:00Z' })];
  const selection = selectDigestItems(rows, SINCE, NOW);
  assert.equal(selection.quiet, true);
  assert.equal(selection.attention.length, 1);
});

test('stats are a whole-sheet snapshot, and rows with a bad date are ignored for sections but counted in stats', () => {
  const rows = [
    row({ number: 1 }),
    row({ number: 2, type: 'pr', repo: 'x/y' }),
    row({ number: 3, updatedAt: 'not a date' }),
    row({ number: 4, state: 'closed', status: 'done', updatedAt: '2026-01-01T00:00:00Z' })
  ];
  const selection = selectDigestItems(rows, SINCE, NOW);
  assert.deepEqual(selection.stats, { openIssues: 2, openPrs: 1, repos: 2 });
  assert.equal(selection.active.length + selection.attention.length + selection.shipped.length, 2);
});

// ---- recommendations ----

test('recommendations are derived from the data, each naming a real item', () => {
  const rows = [
    row({ number: 5, updatedAt: '2026-09-10T08:00:00Z' }),
    row({ number: 6, updatedAt: '2026-09-12T08:00:00Z' }),
    row({ number: 9, type: 'pr', state: 'open', status: '', updatedAt: '2026-09-15T08:00:00Z' }),
    row({ number: 7, priority: 'high', status: 'todo', updatedAt: '2026-09-22T08:00:00Z' })
  ];
  const selection = selectDigestItems(rows, SINCE, NOW);
  const recs = deriveRecommendations(selection, rows, NOW);

  assert.match(recs[0], /^\*\*3 open items have had no activity for 5\+ days\.\*\* Start with o\/r#5, quiet for 14 days\.$/);
  assert.ok(recs.some(r => r.includes('o/r#9 has been open the longest') && r.includes('9 days')));
  assert.ok(recs.some(r => r.includes('1 high-priority item is not started') && r.includes('o/r#7')));
});

test('singular and plural wording is right', () => {
  const rows = [row({ number: 5, updatedAt: '2026-09-10T08:00:00Z' })];
  const recs = deriveRecommendations(selectDigestItems(rows, SINCE, NOW), rows, NOW);
  assert.match(recs[0], /\*\*1 open item has had no activity/);
});

test('issues with no status label are called out because they are missing from the board', () => {
  const rows = [row({ number: 3, status: '' }), row({ number: 4, status: '' }), row({ number: 5, status: 'todo' })];
  const recs = deriveRecommendations(selectDigestItems(rows, SINCE, NOW), rows, NOW);
  assert.ok(recs.some(r => r.includes('2 open issues have no status label') && r.includes('o/r#3, o/r#4')));
});

test('at most 4 recommendations, and none when the data offers nothing', () => {
  const busy = [
    row({ number: 1, updatedAt: '2026-09-01T00:00:00Z' }),
    row({ number: 2, type: 'pr', updatedAt: '2026-09-02T00:00:00Z', status: '' }),
    row({ number: 3, priority: 'high', updatedAt: '2026-09-22T00:00:00Z' }),
    row({ number: 4, status: '', updatedAt: '2026-09-22T00:00:00Z' })
  ];
  assert.ok(deriveRecommendations(selectDigestItems(busy, SINCE, NOW), busy, NOW).length <= 4);

  const calm = [row({ number: 1, updatedAt: '2026-09-24T06:00:00Z' })];
  assert.deepEqual(deriveRecommendations(selectDigestItems(calm, SINCE, NOW), calm, NOW), []);
});

test('chooseRecommendations prefers the model when it gave 2+ usable actions, else the derived ones', () => {
  const derived = ['derived one'];
  assert.deepEqual(chooseRecommendations(['a', 'b'], derived), ['a', 'b']);
  assert.deepEqual(chooseRecommendations(['a'], derived), derived);
  assert.deepEqual(chooseRecommendations(null, derived), derived);
  assert.deepEqual(chooseRecommendations(['a', '  ', 5, 'b', 'c', 'd', 'e'], derived), ['a', 'b', 'c', 'd']);
});
