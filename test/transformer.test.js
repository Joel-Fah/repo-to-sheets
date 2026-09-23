const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLib, loadFixture } = require('./helpers/loadLib');

const { normalize } = loadLib('Transformer.js');

const byNumber = (items, number) => items.find(item => item.number === number);
const labels = (...names) => names.map(name => ({ name }));

test('normalize maps a real open issue to the row shape from ARCHITECTURE.md', () => {
  const raw = byNumber(loadFixture('repo-to-sheets-issues.json'), 3);
  const row = normalize(raw, 'Joel-Fah/repo-to-sheets', 'issue');

  assert.deepEqual(row, {
    repo: 'Joel-Fah/repo-to-sheets',
    type: 'issue',
    number: 3,
    title: 'Implement GitHubClient + Transformer',
    state: 'open',
    status: 'in-progress',
    priority: 'high',
    assignee: '',
    updatedAt: raw.updated_at,
    url: 'https://github.com/Joel-Fah/repo-to-sheets/issues/3'
  });
});

test('a closed issue is "done" even with no status label (real fixture)', () => {
  const raw = byNumber(loadFixture('repo-to-sheets-issues.json'), 1);
  const row = normalize(raw, 'Joel-Fah/repo-to-sheets', 'issue');
  assert.equal(row.state, 'closed');
  assert.equal(row.status, 'done');
  assert.equal(row.priority, 'high');
});

test('issues from the second tracked repo use the same label schema (real fixture)', () => {
  const raw = byNumber(loadFixture('devfest-yaounde-issues.json'), 41);
  const row = normalize(raw, 'MENGUEDAVIS/devfest-yaounde', 'issue');
  assert.equal(row.repo, 'MENGUEDAVIS/devfest-yaounde');
  assert.equal(row.status, 'done');
  assert.equal(row.priority, 'low');
});

test('a merged PR is "merged" with state "closed" (real fixture, list endpoint has merged_at)', () => {
  const raw = byNumber(loadFixture('repo-to-sheets-pulls.json'), 2);
  const row = normalize(raw, 'Joel-Fah/repo-to-sheets', 'pr');

  assert.equal(row.type, 'pr');
  assert.equal(row.state, 'closed');
  assert.equal(row.status, 'merged');
  assert.equal(row.priority, '');
  assert.equal(row.url, 'https://github.com/Joel-Fah/repo-to-sheets/pull/2');
});

test('PR status: open, closed-unmerged, and merged via the `merged` flag', () => {
  const open = normalize({ number: 1, state: 'open', merged_at: null }, 'o/r', 'pr');
  const closed = normalize({ number: 2, state: 'closed', merged_at: null }, 'o/r', 'pr');
  const mergedFlag = normalize({ number: 3, state: 'closed', merged: true }, 'o/r', 'pr');

  assert.equal(open.status, 'open');
  assert.equal(closed.status, 'closed');
  assert.equal(mergedFlag.status, 'merged');
});

test('PR status ignores status: labels (a closed PR keeps its lifecycle state)', () => {
  const raw = byNumber(loadFixture('devfest-yaounde-issues.json'), 33);
  assert.ok(raw.labels.some(l => l.name === 'status: in-progress'), 'fixture has a stale status label');
  // #33 is a PR returned by the issues endpoint; it is normalized as a PR elsewhere.
  const row = normalize({ ...raw, merged_at: null }, 'MENGUEDAVIS/devfest-yaounde', 'pr');
  assert.equal(row.status, 'closed');
});

test('a closed issue is "done" even if a stale status: in-progress label remains', () => {
  const row = normalize(
    { number: 9, state: 'closed', labels: labels('status: in-progress', 'type: bugfix') },
    'o/r',
    'issue'
  );
  assert.equal(row.status, 'done');
});

test('an open issue with no status label gets an empty status, not a guess', () => {
  const row = normalize({ number: 9, state: 'open', labels: labels('type: chore') }, 'o/r', 'issue');
  assert.equal(row.status, '');
});

test('label parsing is case- and whitespace-tolerant and lowercases values', () => {
  const row = normalize(
    { number: 9, state: 'open', labels: labels('Status:   To-Do ', 'PRIORITY: High') },
    'o/r',
    'issue'
  );
  assert.equal(row.status, 'to-do');
  assert.equal(row.priority, 'high');
});

test('priority is empty when no priority: label is present', () => {
  const row = normalize({ number: 9, state: 'open', labels: labels('status: todo') }, 'o/r', 'issue');
  assert.equal(row.status, 'todo');
  assert.equal(row.priority, '');
});

test('labels that merely contain "status" or "priority" are not matched', () => {
  const row = normalize(
    { number: 9, state: 'open', labels: labels('bug', 'high-priority', 'not-status: todo') },
    'o/r',
    'issue'
  );
  assert.equal(row.status, '');
  assert.equal(row.priority, '');
});

test('assignees are joined; falls back to the singular assignee field', () => {
  const many = normalize(
    { number: 1, state: 'open', assignees: [{ login: 'alice' }, { login: 'bob' }] },
    'o/r',
    'issue'
  );
  const single = normalize({ number: 2, state: 'open', assignee: { login: 'carol' } }, 'o/r', 'issue');
  const none = normalize({ number: 3, state: 'open', assignee: null, assignees: [] }, 'o/r', 'issue');

  assert.equal(many.assignee, 'alice, bob');
  assert.equal(single.assignee, 'carol');
  assert.equal(none.assignee, '');
});

test('missing optional fields normalize to empty strings instead of undefined', () => {
  const row = normalize({ number: 5 }, 'o/r', 'issue');
  assert.deepEqual(row, {
    repo: 'o/r',
    type: 'issue',
    number: 5,
    title: '',
    state: '',
    status: '',
    priority: '',
    assignee: '',
    updatedAt: '',
    url: ''
  });
});

test('normalize rejects a missing item or an unknown type', () => {
  assert.throws(() => normalize(null, 'o/r', 'issue'), /raw GitHub issue\/PR object is required/);
  assert.throws(() => normalize({ number: 1 }, 'o/r', 'pull_request'), /unknown type "pull_request"/);
});

test('every row has exactly the columns from the Activity tab data model', () => {
  const rows = loadFixture('repo-to-sheets-issues.json')
    .filter(item => !item.pull_request)
    .map(item => normalize(item, 'Joel-Fah/repo-to-sheets', 'issue'));
  for (const row of rows) {
    assert.deepEqual(Object.keys(row), [
      'repo', 'type', 'number', 'title', 'state', 'status', 'priority', 'assignee', 'updatedAt', 'url'
    ]);
  }
});
