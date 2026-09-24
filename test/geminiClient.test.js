const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLib } = require('./helpers/loadLib');

const { summarizeActivity } = loadLib('GeminiClient.js');

const KEY = 'test-gemini-key-value';
const PROMPT = 'Changes detected in this sync:\n- NEW issue #1 in o/r "Add thing"';

/**
 * @param {number} status
 * @param {any} body
 * @returns {{getResponseCode: function, getContentText: function}} UrlFetchApp-shaped response
 */
function response(status, body) {
  return {
    getResponseCode: () => status,
    getContentText: () => (typeof body === 'string' ? body : JSON.stringify(body))
  };
}

const ok = text => response(200, { candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });

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

test('sends a generateContent request with the key in a header, never in the URL or body', () => {
  const { fetchFn, calls } = stubFetch([ok('Two issues opened.')]);
  summarizeActivity(fetchFn, KEY, PROMPT);

  const { url, options } = calls[0];
  assert.match(url, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta\/models\/[^/:]+:generateContent$/);
  assert.equal(options.method, 'post');
  assert.equal(options.contentType, 'application/json');
  assert.equal(options.headers['x-goog-api-key'], KEY);
  assert.ok(!url.includes(KEY), 'key must not be in the URL');
  assert.ok(!options.payload.includes(KEY), 'key must not be in the payload');

  const body = JSON.parse(options.payload);
  assert.equal(body.contents[0].role, 'user');
  assert.equal(body.contents[0].parts[0].text, PROMPT);
  assert.match(body.systemInstruction.parts[0].text, /2 to 4 plain sentences/);
  assert.ok(body.generationConfig.maxOutputTokens >= 256);
});

test('uses the model from options', () => {
  const { fetchFn, calls } = stubFetch([ok('Fine.')]);
  summarizeActivity(fetchFn, KEY, PROMPT, { model: 'some-model-1' });
  assert.match(calls[0].url, /\/models\/some-model-1:generateContent$/);
});

test('returns the generated text on one line, joining parts and collapsing whitespace', () => {
  const body = { candidates: [{ content: { parts: [{ text: 'First sentence.\n\n' }, { text: ' Second   sentence. ' }] } }] };
  const { fetchFn } = stubFetch([response(200, body)]);
  assert.equal(summarizeActivity(fetchFn, KEY, PROMPT), 'First sentence. Second sentence.');
});

test('retries once on a 503 after waiting, then returns the result', () => {
  const waits = [];
  const { fetchFn, calls } = stubFetch([
    response(503, { error: { message: 'The model is overloaded' } }),
    ok('Recovered.')
  ]);
  assert.equal(summarizeActivity(fetchFn, KEY, PROMPT, { sleepFn: ms => waits.push(ms) }), 'Recovered.');
  assert.equal(calls.length, 2);
  assert.deepEqual(waits, [2000]);
});

test('gives up after one retry on repeated 429s, reporting the status and message', () => {
  const { fetchFn, calls } = stubFetch([
    response(429, { error: { message: 'Quota exceeded' } }),
    response(429, { error: { message: 'Quota exceeded' } })
  ]);
  assert.throws(() => summarizeActivity(fetchFn, KEY, PROMPT), /HTTP 429.*Quota exceeded/);
  assert.equal(calls.length, 2);
});

test('does not retry client errors, and the error never contains the key', () => {
  const { fetchFn, calls } = stubFetch([response(400, { error: { message: 'API key not valid. Please pass a valid API key.' } })]);
  assert.throws(
    () => summarizeActivity(fetchFn, KEY, PROMPT),
    err => {
      assert.match(err.message, /HTTP 400/);
      assert.match(err.message, /API key not valid/);
      assert.ok(!err.message.includes(KEY));
      return true;
    }
  );
  assert.equal(calls.length, 1);
});

test('an empty prompt throws before any request is made', () => {
  const { fetchFn, calls } = stubFetch([]);
  assert.throws(() => summarizeActivity(fetchFn, KEY, '   '), /nothing to summarize/);
  assert.equal(calls.length, 0);
});

test('a blocked prompt is reported with its reason', () => {
  const { fetchFn } = stubFetch([response(200, { promptFeedback: { blockReason: 'SAFETY' } })]);
  assert.throws(() => summarizeActivity(fetchFn, KEY, PROMPT), /blocked the prompt \(SAFETY\)/);
});

test('a response with no text (e.g. truncated by the token cap) is an error, not an empty summary', () => {
  const { fetchFn } = stubFetch([response(200, { candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }] })]);
  assert.throws(() => summarizeActivity(fetchFn, KEY, PROMPT), /no text \(finishReason MAX_TOKENS\)/);
});

test('a non-JSON error body still yields a readable error', () => {
  const { fetchFn } = stubFetch([response(403, '<html>Forbidden</html>')]);
  assert.throws(() => summarizeActivity(fetchFn, KEY, PROMPT), /HTTP 403.*no error message/);
});
