const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLib } = require('./helpers/loadLib');

const { formatSyncSummary } = loadLib('SyncSummary.js');

const summary = overrides => ({ reposTotal: 2, reposSynced: 2, rowsUpserted: 46, errors: [], ...overrides });

test('a clean run reports counts and says complete', () => {
  assert.equal(
    formatSyncSummary(summary()),
    'Sync complete. 2 of 2 repo(s) synced, 46 row(s) added or updated.'
  );
});

test('zero enabled repos is visible in the message instead of a silent success', () => {
  const text = formatSyncSummary(summary({ reposTotal: 0, reposSynced: 0, rowsUpserted: 0 }));
  assert.match(text, /0 of 0 repo\(s\) synced/);
});

test('errors are listed in the popup and the run is not called complete', () => {
  const text = formatSyncSummary(summary({
    reposSynced: 1,
    errors: ['Joel-Fah/no-such-repo: GitHub API request failed (HTTP 404): Not Found']
  }));
  assert.match(text, /^Sync finished with problems\. 1 of 2 repo\(s\) synced/);
  assert.match(text, /• Joel-Fah\/no-such-repo: GitHub API request failed \(HTTP 404\): Not Found/);
  assert.ok(!text.includes('Sync complete'));
});

test('only the first few errors are shown, with a count of the rest', () => {
  const errors = Array.from({ length: 8 }, (_, i) => `repo${i}: boom`);
  const text = formatSyncSummary(summary({ errors }));
  assert.equal(text.split('\n').filter(line => line.startsWith('•')).length, 6);
  assert.match(text, /…and 3 more \(see the Log tab\)/);
});

test('a very long error message is truncated', () => {
  const text = formatSyncSummary(summary({ errors: ['x'.repeat(1000)] }));
  assert.ok(text.length < 500);
  assert.ok(text.includes('…'));
});
