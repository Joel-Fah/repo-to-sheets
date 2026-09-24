const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLib } = require('./helpers/loadLib');

const { formatInsightSummary } = loadLib('InsightFormat.js');

const items = [
  { repo: 'Joel-Fah/repo-to-sheets', number: 4, url: 'https://github.com/Joel-Fah/repo-to-sheets/pull/4' },
  { repo: 'MENGUEDAVIS/devfest-yaounde', number: 4, url: 'https://github.com/MENGUEDAVIS/devfest-yaounde/pull/4' },
  { repo: 'Joel-Fah/repo-to-sheets', number: 7, url: 'https://github.com/Joel-Fah/repo-to-sheets/issues/7' }
];

const slice = (result, range) => result.text.slice(range.start, range.end);

test('plain text passes through with no formatting', () => {
  assert.deepEqual(formatInsightSummary('Nothing special here.', items), { text: 'Nothing special here.', bold: [], links: [] });
});

test('**bold** markers are removed and become ranges', () => {
  const result = formatInsightSummary('**Two PRs merged** today, and **one issue** closed.', items);
  assert.equal(result.text, 'Two PRs merged today, and one issue closed.');
  assert.deepEqual(result.bold.map(r => slice(result, r)), ['Two PRs merged', 'one issue']);
});

test('an unclosed ** bolds to the end and leaves no stray asterisks', () => {
  const result = formatInsightSummary('Start **never closed', items);
  assert.equal(result.text, 'Start never closed');
  assert.deepEqual(result.bold.map(r => slice(result, r)), ['never closed']);
});

test('empty bold markers and empty input produce nothing odd', () => {
  assert.deepEqual(formatInsightSummary('a **** b', items), { text: 'a  b', bold: [], links: [] });
  assert.deepEqual(formatInsightSummary('', items), { text: '', bold: [], links: [] });
});

test('a known owner/repo#N reference becomes a link to the real GitHub URL', () => {
  const result = formatInsightSummary('Merged Joel-Fah/repo-to-sheets#4 today.', items);
  assert.equal(result.links.length, 1);
  assert.equal(slice(result, result.links[0]), 'Joel-Fah/repo-to-sheets#4');
  assert.equal(result.links[0].url, 'https://github.com/Joel-Fah/repo-to-sheets/pull/4');
});

test('the same number in two repos links to the right one each time', () => {
  const result = formatInsightSummary('MENGUEDAVIS/devfest-yaounde#4 and Joel-Fah/repo-to-sheets#4', items);
  assert.deepEqual(result.links.map(l => l.url), [
    'https://github.com/MENGUEDAVIS/devfest-yaounde/pull/4',
    'https://github.com/Joel-Fah/repo-to-sheets/pull/4'
  ]);
});

test('an unknown (hallucinated) reference stays plain text: links only come from real data', () => {
  const result = formatInsightSummary('Also Joel-Fah/repo-to-sheets#999 and evil/repo#1.', items);
  assert.deepEqual(result.links, []);
});

test('reference matching is case-insensitive on the repo', () => {
  const result = formatInsightSummary('joel-fah/REPO-TO-SHEETS#7', items);
  assert.equal(result.links[0].url, 'https://github.com/Joel-Fah/repo-to-sheets/issues/7');
});

test('link offsets stay correct after bold markers shift the text', () => {
  const result = formatInsightSummary('**Big news**: Joel-Fah/repo-to-sheets#4 merged, then Joel-Fah/repo-to-sheets#7 opened.', items);
  assert.equal(result.text.startsWith('Big news: '), true);
  assert.deepEqual(result.links.map(l => slice(result, l)), ['Joel-Fah/repo-to-sheets#4', 'Joel-Fah/repo-to-sheets#7']);
});

test('a reference inside bold text is both bold and linked', () => {
  const result = formatInsightSummary('**Joel-Fah/repo-to-sheets#4 merged** today', items);
  assert.equal(slice(result, result.bold[0]), 'Joel-Fah/repo-to-sheets#4 merged');
  assert.equal(slice(result, result.links[0]), 'Joel-Fah/repo-to-sheets#4');
});

test('the same reference twice yields two links', () => {
  const result = formatInsightSummary('Joel-Fah/repo-to-sheets#7 ... Joel-Fah/repo-to-sheets#7', items);
  assert.equal(result.links.length, 2);
});

test('model-written URLs and markdown links are not turned into links', () => {
  const result = formatInsightSummary('See [click here](http://evil.example/x) or https://evil.example/a/b#3', items);
  assert.deepEqual(result.links, []);
  assert.ok(result.text.includes('[click here](http://evil.example/x)'), 'left as literal text');
});

test('items without a URL and a missing item list are tolerated', () => {
  assert.deepEqual(formatInsightSummary('Joel-Fah/repo-to-sheets#4', [{ repo: 'Joel-Fah/repo-to-sheets', number: 4 }]).links, []);
  assert.deepEqual(formatInsightSummary('Joel-Fah/repo-to-sheets#4', undefined).links, []);
});

test('leading formula triggers are removed so a rich-text cell can never start with = + - or @', () => {
  const cases = [
    ['=1+1 is not a formula', '1+1 is not a formula'],
    ['+1 opened', '1 opened'],
    ['- looks like a bullet', 'looks like a bullet'],
    ['-2+3 result', '2+3 result'],
    ['@SUM(1) mention', 'SUM(1) mention'],
    ['  = spaced', 'spaced']
  ];
  cases.forEach(([input, expected]) => assert.equal(formatInsightSummary(input, items).text, expected));
});

test('removing leading characters shifts bold ranges and links to the right place', () => {
  const result = formatInsightSummary('= **Merged** Joel-Fah/repo-to-sheets#4 today', items);
  assert.equal(result.text, 'Merged Joel-Fah/repo-to-sheets#4 today');
  assert.equal(slice(result, result.bold[0]), 'Merged');
  assert.equal(slice(result, result.links[0]), 'Joel-Fah/repo-to-sheets#4');
});

test('a bold range that sits entirely inside the removed prefix is dropped', () => {
  const result = formatInsightSummary('**==** then text', items);
  assert.equal(result.text, 'then text');
  assert.deepEqual(result.bold, []);
});

test('an "=" or "+" in the middle of a sentence is left alone', () => {
  assert.equal(formatInsightSummary('Ran 1+1 = 2 checks', items).text, 'Ran 1+1 = 2 checks');
});
