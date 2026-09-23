const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLib, loadFixture } = require('./helpers/loadLib');

const { fetchIssues, fetchPullRequests } = loadLib('GitHubClient.js');

const TOKEN = 'test-token-value';

/**
 * @param {number} status
 * @param {any} body
 * @param {object} [headers]
 * @returns {{getResponseCode: function, getHeaders: function, getContentText: function}} UrlFetchApp-shaped response
 */
function response(status, body, headers = {}) {
  return {
    getResponseCode: () => status,
    getHeaders: () => headers,
    getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body))
  };
}

/**
 * @param {object[]} responses - returned in order, one per call
 * @returns {{fetchFn: function, calls: {url: string, options: object}[]}}
 */
function stubFetch(responses) {
  const calls = [];
  const fetchFn = (url, options) => {
    calls.push({ url, options });
    if (calls.length > responses.length) throw new Error(`unexpected extra fetch: ${url}`);
    return responses[calls.length - 1];
  };
  return { fetchFn, calls };
}

const nextLink = url => ({ Link: `<${url}>; rel="next", <${url}&last>; rel="last"` });

test('fetchIssues requests the issues endpoint with auth and API headers', () => {
  const { fetchFn, calls } = stubFetch([response(200, [], { 'X-RateLimit-Remaining': '4999' })]);
  fetchIssues(fetchFn, TOKEN, 'Joel-Fah', 'repo-to-sheets');

  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://api.github.com/repos/Joel-Fah/repo-to-sheets/issues?state=all&sort=updated&direction=desc&per_page=100'
  );
  assert.equal(calls[0].options.headers.Authorization, `token ${TOKEN}`);
  assert.equal(calls[0].options.headers.Accept, 'application/vnd.github+json');
  assert.equal(calls[0].options.muteHttpExceptions, true);
});

test('fetchPullRequests requests the pulls endpoint', () => {
  const { fetchFn, calls } = stubFetch([response(200, [])]);
  fetchPullRequests(fetchFn, TOKEN, 'Joel-Fah', 'repo-to-sheets');
  assert.match(calls[0].url, /\/repos\/Joel-Fah\/repo-to-sheets\/pulls\?state=all/);
});

test('fetchIssues excludes pull requests returned by the issues endpoint (real fixture)', () => {
  const raw = loadFixture('repo-to-sheets-issues.json');
  assert.ok(raw.some(item => item.pull_request), 'fixture should contain a PR to filter');

  const { fetchFn } = stubFetch([response(200, raw)]);
  const issues = fetchIssues(fetchFn, TOKEN, 'Joel-Fah', 'repo-to-sheets');

  assert.ok(issues.length > 0);
  assert.ok(issues.every(item => !item.pull_request));
  assert.equal(issues.length, raw.filter(item => !item.pull_request).length);
});

test('fetchPullRequests returns every PR as-is (real fixture)', () => {
  const raw = loadFixture('repo-to-sheets-pulls.json');
  const { fetchFn } = stubFetch([response(200, raw)]);
  assert.deepEqual(fetchPullRequests(fetchFn, TOKEN, 'Joel-Fah', 'repo-to-sheets'), raw);
});

test('follows rel="next" links until exhausted and concatenates pages', () => {
  const page2 = 'https://api.github.com/repositories/1/issues?page=2';
  const page3 = 'https://api.github.com/repositories/1/issues?page=3';
  const { fetchFn, calls } = stubFetch([
    response(200, [{ number: 1 }, { number: 2 }], nextLink(page2)),
    response(200, [{ number: 3 }], nextLink(page3)),
    response(200, [{ number: 4 }], {})
  ]);

  const issues = fetchIssues(fetchFn, TOKEN, 'o', 'r');

  assert.deepEqual(issues.map(i => i.number), [1, 2, 3, 4]);
  assert.deepEqual(calls.slice(1).map(c => c.url), [page2, page3]);
});

test('reads Link and rate-limit headers case-insensitively', () => {
  const page2 = 'https://api.github.com/repositories/1/issues?page=2';
  const { fetchFn, calls } = stubFetch([
    response(200, [{ number: 1 }], { link: `<${page2}>; rel="next"`, 'x-ratelimit-remaining': '4000' }),
    response(200, [{ number: 2 }], {})
  ]);
  assert.equal(fetchIssues(fetchFn, TOKEN, 'o', 'r').length, 2);
  assert.equal(calls.length, 2);
});

test('stops and warns when X-RateLimit-Remaining is below the threshold and more pages exist', () => {
  const warnings = [];
  const { fetchFn, calls } = stubFetch([
    response(200, [{ number: 1 }], { ...nextLink('https://api.github.com/x?page=2'), 'X-RateLimit-Remaining': '49' })
  ]);

  const issues = fetchIssues(fetchFn, TOKEN, 'o', 'r', { onWarning: msg => warnings.push(msg) });

  assert.deepEqual(issues.map(i => i.number), [1], 'keeps what was already fetched');
  assert.equal(calls.length, 1, 'does not request the next page');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /rate limit low \(49 remaining/);
});

test('does not stop when remaining is exactly at the threshold', () => {
  const { fetchFn, calls } = stubFetch([
    response(200, [{ number: 1 }], { ...nextLink('https://api.github.com/x?page=2'), 'X-RateLimit-Remaining': '50' }),
    response(200, [{ number: 2 }], { 'X-RateLimit-Remaining': '49' })
  ]);
  assert.equal(fetchIssues(fetchFn, TOKEN, 'o', 'r').length, 2);
  assert.equal(calls.length, 2);
});

test('a low rate limit on the last page returns normally with no warning', () => {
  const warnings = [];
  const { fetchFn } = stubFetch([response(200, [{ number: 1 }], { 'X-RateLimit-Remaining': '3' })]);
  const issues = fetchIssues(fetchFn, TOKEN, 'o', 'r', { onWarning: msg => warnings.push(msg) });
  assert.equal(issues.length, 1);
  assert.deepEqual(warnings, []);
});

test('a 403 with zero remaining is a graceful stop, not a throw', () => {
  const warnings = [];
  const { fetchFn } = stubFetch([
    response(200, [{ number: 1 }], { ...nextLink('https://api.github.com/x?page=2'), 'X-RateLimit-Remaining': '60' }),
    response(403, { message: 'API rate limit exceeded' }, { 'X-RateLimit-Remaining': '0' })
  ]);

  const issues = fetchIssues(fetchFn, TOKEN, 'o', 'r', { onWarning: msg => warnings.push(msg) });

  assert.deepEqual(issues.map(i => i.number), [1]);
  assert.match(warnings[0], /rate limit exhausted/);
});

test('caps the number of pages and warns that results are truncated', () => {
  const warnings = [];
  const { fetchFn, calls } = stubFetch([
    response(200, [{ number: 1 }], nextLink('https://api.github.com/x?page=2')),
    response(200, [{ number: 2 }], nextLink('https://api.github.com/x?page=3')),
    response(200, [{ number: 3 }], {})
  ]);

  const issues = fetchIssues(fetchFn, TOKEN, 'o', 'r', { maxPages: 2, onWarning: msg => warnings.push(msg) });

  assert.deepEqual(issues.map(i => i.number), [1, 2]);
  assert.equal(calls.length, 2);
  assert.match(warnings[0], /Page cap of 2 reached/);
});

test('throws on a non-rate-limit error, surfacing status and GitHub message but never the token', () => {
  const { fetchFn } = stubFetch([response(404, { message: 'Not Found' }, { 'X-RateLimit-Remaining': '4000' })]);

  assert.throws(
    () => fetchIssues(fetchFn, TOKEN, 'o', 'missing'),
    err => {
      assert.match(err.message, /HTTP 404/);
      assert.match(err.message, /Not Found/);
      assert.ok(!err.message.includes(TOKEN), 'error message must not leak the token');
      return true;
    }
  );
});

test('a 403 that is not a rate limit (remaining > 0) still throws', () => {
  const { fetchFn } = stubFetch([response(403, { message: 'Resource not accessible' }, { 'X-RateLimit-Remaining': '4000' })]);
  assert.throws(() => fetchIssues(fetchFn, TOKEN, 'o', 'r'), /HTTP 403.*Resource not accessible/);
});

test('throws a clear error when the body is not a list', () => {
  const { fetchFn } = stubFetch([response(200, { unexpected: true })]);
  assert.throws(() => fetchIssues(fetchFn, TOKEN, 'o', 'r'), /non-list response/);
});

test('error message survives a non-JSON error body', () => {
  const { fetchFn } = stubFetch([response(502, '<html>Bad gateway</html>')]);
  assert.throws(() => fetchIssues(fetchFn, TOKEN, 'o', 'r'), /HTTP 502.*no error message/);
});
