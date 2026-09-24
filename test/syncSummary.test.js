const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLib } = require('./helpers/loadLib');

const { formatSyncSummary, formatDigestResult } = loadLib('SyncSummary.js');

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


const digestResult = o => ({ subject: 'Repo Pulse · 4 shipped — Thu 24 Sep', recipients: ['a@x.com'], invalid: [], quiet: false, usedGemini: true, warnings: [], ...o });

test('digest popup: who it went to and the subject', () => {
  assert.equal(formatDigestResult(digestResult({ recipients: ['a@x.com', 'b@y.org'] })),
    'Digest sent to a@x.com, b@y.org.\nSubject: Repo Pulse · 4 shipped — Thu 24 Sep');
});

test('digest popup: says so when it was the all-quiet version', () => {
  assert.match(formatDigestResult(digestResult({ quiet: true, usedGemini: false })), /"all quiet" version/);
  assert.ok(!formatDigestResult(digestResult({ quiet: true, usedGemini: false })).includes('derived from the data'), 'quiet sends make no Gemini call, so no warning about it');
});

test('digest popup: says when Gemini was not used', () => {
  assert.match(formatDigestResult(digestResult({ usedGemini: false })), /derived from the data \(no Gemini summary this time\)/);
});

test('digest popup: lists skipped recipients and warnings', () => {
  const text = formatDigestResult(digestResult({ invalid: ['nope', 'bad@'], warnings: ['Gemini: Gemini unavailable on every model: x'] }));
  assert.match(text, /Skipped \(not valid emails\): nope, bad@/);
  assert.match(text, /Note: Gemini: Gemini unavailable on every model: x/);
});
