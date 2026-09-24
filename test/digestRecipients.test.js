const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLib } = require('./helpers/loadLib');

const { parseRecipientRows } = loadLib('DigestRecipients.js');

test('an enabled row with a valid address becomes a recipient with its name', () => {
  assert.deepEqual(parseRecipientRows([['Joel Fah', 'joel@example.com', 'TRUE']]).recipients, [{ name: 'Joel Fah', email: 'joel@example.com' }]);
});

test('enabled is case-insensitive and accepts a real checkbox value', () => {
  const result = parseRecipientRows([['A', 'a@x.com', 'true'], ['B', 'b@x.com', true], ['C', 'c@x.com', ' True ']]);
  assert.deepEqual(result.recipients.map(r => r.email), ['a@x.com', 'b@x.com', 'c@x.com']);
});

test('a row that is not enabled is skipped and counted, never emailed', () => {
  const result = parseRecipientRows([['A', 'a@x.com', 'FALSE'], ['B', 'b@x.com', ''], ['C', 'c@x.com', 'yes'], ['D', 'd@x.com', 'TRUE']]);
  assert.deepEqual(result.recipients.map(r => r.email), ['d@x.com']);
  assert.equal(result.disabled, 3);
});

test('blank rows are ignored entirely', () => {
  const result = parseRecipientRows([['', '', ''], ['  ', ' ', null], ['A', 'a@x.com', 'TRUE']]);
  assert.equal(result.recipients.length, 1);
  assert.equal(result.disabled, 0);
  assert.deepEqual(result.invalid, []);
});

test('an enabled row with a bad or missing address is reported with its row number (header is row 1)', () => {
  const result = parseRecipientRows([['A', 'a@x.com', 'TRUE'], ['Bob', 'bob@', 'TRUE'], ['Cy', '', 'TRUE'], ['Di', 'di@x.com, ed@x.com', 'TRUE']]);
  assert.deepEqual(result.recipients.map(r => r.email), ['a@x.com']);
  assert.deepEqual(result.invalid, ['row 3: bob@', 'row 4: (no email)', 'row 5: di@x.com, ed@x.com']);
});

test('a disabled row with a bad address is not reported (it is switched off)', () => {
  assert.deepEqual(parseRecipientRows([['Bob', 'bob@', 'FALSE']]).invalid, []);
});

test('duplicate addresses are collapsed case-insensitively, keeping the first row', () => {
  const result = parseRecipientRows([['First', 'A@x.com', 'TRUE'], ['Second', 'a@X.COM', 'TRUE']]);
  assert.deepEqual(result.recipients, [{ name: 'First', email: 'A@x.com' }]);
});

test('header-injection attempts in the address cell are rejected', () => {
  const rows = [['x', 'a@x.com\nbcc:evil@x.com', 'TRUE'], ['y', 'bcc:evil@x.com', 'TRUE'], ['z', 'a@x.com,bcc@x.com', 'TRUE'], ['w', '"a"@x.com', 'TRUE']];
  const result = parseRecipientRows(rows);
  assert.equal(result.recipients.length, 0);
  assert.equal(result.invalid.length, 4);
});

test('names are cleaned: control characters and runs of whitespace collapse, length is capped', () => {
  const result = parseRecipientRows([['  Joel \n\t  Fah\u0007 ', 'j@x.com', 'TRUE'], ['x'.repeat(200), 'k@x.com', 'TRUE']]);
  assert.equal(result.recipients[0].name, 'Joel Fah');
  assert.equal(result.recipients[1].name.length, 60);
});

test('a missing name is fine: only the address matters', () => {
  assert.deepEqual(parseRecipientRows([['', 'a@x.com', 'TRUE']]).recipients, [{ name: '', email: 'a@x.com' }]);
});

test('the list is capped at 20 addresses', () => {
  const rows = Array.from({ length: 30 }, (_, i) => [`U${i}`, `user${i}@x.com`, 'TRUE']);
  assert.equal(parseRecipientRows(rows).recipients.length, 20);
});

test('no rows at all gives an empty result', () => {
  assert.deepEqual(parseRecipientRows([]), { recipients: [], invalid: [], disabled: 0 });
});
