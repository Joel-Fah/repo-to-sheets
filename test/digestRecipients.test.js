const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLib } = require('./helpers/loadLib');

const { parseRecipients } = loadLib('DigestRecipients.js');

test('splits on commas, semicolons, spaces and newlines', () => {
  assert.deepEqual(parseRecipients('a@x.com, b@y.org;c@z.io d@w.net\ne@v.dev').valid,
    ['a@x.com', 'b@y.org', 'c@z.io', 'd@w.net', 'e@v.dev']);
});

test('de-duplicates case-insensitively, keeping the first spelling', () => {
  assert.deepEqual(parseRecipients('A@x.com, a@X.COM, b@y.org').valid, ['A@x.com', 'b@y.org']);
});

test('entries that are not emails are reported, not sent to', () => {
  const result = parseRecipients('good@x.com, not-an-email, @nope.com, also bad@');
  assert.deepEqual(result.valid, ['good@x.com']);
  assert.deepEqual(result.invalid, ['not-an-email', '@nope.com', 'also', 'bad@']);
});

test('empty, blank and non-string cells give nothing', () => {
  assert.deepEqual(parseRecipients(''), { valid: [], invalid: [] });
  assert.deepEqual(parseRecipients('   '), { valid: [], invalid: [] });
  assert.deepEqual(parseRecipients(null), { valid: [], invalid: [] });
  assert.deepEqual(parseRecipients(undefined), { valid: [], invalid: [] });
});

test('header-injection attempts are rejected as invalid', () => {
  const result = parseRecipients('a@x.com,bcc:evil@x.com\nSubject:x@y.com');
  assert.ok(!result.valid.some(email => /bcc|subject/i.test(email)));
});

test('the list is capped', () => {
  const many = Array.from({ length: 30 }, (_, i) => `user${i}@x.com`).join(',');
  assert.equal(parseRecipients(many).valid.length, 20);
});
