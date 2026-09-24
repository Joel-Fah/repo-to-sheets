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
  assert.throws(() => summarizeActivity(fetchFn, KEY, PROMPT, { model: 'only-model' }), /HTTP 429.*Quota exceeded/);
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

// ---- fallback model ----

test('falls back to the second model when the first stays overloaded, after its retry', () => {
  const overloaded = () => response(503, { error: { message: 'high demand' } });
  const { fetchFn, calls } = stubFetch([overloaded(), overloaded(), ok('From the fallback.')]);
  const text = summarizeActivity(fetchFn, KEY, PROMPT, { models: ['primary', 'backup'] });

  assert.equal(text, 'From the fallback.');
  assert.deepEqual(calls.map(c => c.url.match(/models\/([^:]+):/)[1]), ['primary', 'primary', 'backup']);
});

test('a retired model (404) falls back immediately, without a retry', () => {
  const { fetchFn, calls } = stubFetch([response(404, { error: { message: 'model not found' } }), ok('Backup answered.')]);
  assert.equal(summarizeActivity(fetchFn, KEY, PROMPT, { models: ['gone', 'backup'] }), 'Backup answered.');
  assert.equal(calls.length, 2);
});

test('a rate-limited first model (429) also falls back', () => {
  const limited = () => response(429, { error: { message: 'quota' } });
  const { fetchFn } = stubFetch([limited(), limited(), ok('Backup answered.')]);
  assert.equal(summarizeActivity(fetchFn, KEY, PROMPT, { models: ['a', 'b'] }), 'Backup answered.');
});

test('a bad key (400/403) does not fall back: another model would fail the same way', () => {
  const { fetchFn, calls } = stubFetch([response(403, { error: { message: 'API key invalid' } })]);
  assert.throws(() => summarizeActivity(fetchFn, KEY, PROMPT, { models: ['a', 'b'] }), /HTTP 403/);
  assert.equal(calls.length, 1);
});

test('a blocked prompt does not fall back', () => {
  const { fetchFn, calls } = stubFetch([response(200, { promptFeedback: { blockReason: 'SAFETY' } })]);
  assert.throws(() => summarizeActivity(fetchFn, KEY, PROMPT, { models: ['a', 'b'] }), /blocked/);
  assert.equal(calls.length, 1);
});

test('when every model is unavailable the error names each one and never contains the key', () => {
  const overloaded = () => response(503, { error: { message: 'high demand' } });
  const { fetchFn, calls } = stubFetch([overloaded(), overloaded(), overloaded(), overloaded()]);
  assert.throws(
    () => summarizeActivity(fetchFn, KEY, PROMPT, { models: ['primary', 'backup'] }),
    err => {
      assert.match(err.message, /unavailable on every model/);
      assert.match(err.message, /model primary/);
      assert.match(err.message, /model backup/);
      assert.ok(!err.message.includes(KEY));
      return true;
    }
  );
  assert.equal(calls.length, 4, 'two attempts per model');
});

test('by default two different models are configured, primary first', () => {
  const overloaded = () => response(503, { error: { message: 'high demand' } });
  const { fetchFn, calls } = stubFetch([overloaded(), overloaded(), ok('Default fallback worked.')]);
  assert.equal(summarizeActivity(fetchFn, KEY, PROMPT), 'Default fallback worked.');
  const used = calls.map(c => c.url.match(/models\/([^:]+):/)[1]);
  assert.notEqual(used[0], used[2]);
  assert.equal(used[0], used[1]);
});

test('the system instruction asks for owner/repo#number references and limited bold, and not for URLs', () => {
  const { fetchFn, calls } = stubFetch([ok('Fine.')]);
  summarizeActivity(fetchFn, KEY, PROMPT);
  const instruction = JSON.parse(calls[0].options.payload).systemInstruction.parts[0].text;
  assert.match(instruction, /owner\/repo#number/);
  assert.match(instruction, /\*\*double asterisks\*\*/);
  assert.match(instruction, /never invent/);
  assert.ok(!/https?:\/\//i.test(instruction), 'the model is never asked to produce URLs');
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

test('the system instruction limits references and marks imported history as not new work', () => {
  const { fetchFn, calls } = stubFetch([ok('Fine.')]);
  summarizeActivity(fetchFn, KEY, PROMPT);
  const instruction = JSON.parse(calls[0].options.payload).systemInstruction.parts[0].text;
  assert.match(instruction, /at most five items/);
  assert.match(instruction, /imported history/);
  assert.match(instruction, /never as shipped or new/);
});
