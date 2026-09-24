const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLib, loadFixture } = require('./helpers/loadLib');

const { buildDigestHtml, normalize, selectDigestItems, deriveRecommendations } =
  loadLib('EmailDigestBuilder.js', 'DigestData.js', 'InsightFormat.js', 'Transformer.js');

const NOW = new Date('2026-09-24T08:00:00Z');
const SHEET_URL = 'https://docs.google.com/spreadsheets/d/abc123/edit';

/**
 * @param {object} [overrides]
 * @returns {object} DigestMeta
 */
function makeMeta(overrides = {}) {
  return {
    now: NOW,
    since: new Date('2026-09-23T08:00:00Z'),
    dateLabel: 'Thursday 24 September',
    dateShort: 'Thu 24 Sep',
    sinceLabel: 'Wed 23 Sep, 09:00',
    sheetUrl: SHEET_URL,
    mode: 'scheduled',
    ...overrides
  };
}

/**
 * Real GitHub data from the fixtures, normalized the way the sync does.
 * @returns {object[]} Activity rows
 */
function fixtureRows() {
  const rows = [];
  loadFixture('repo-to-sheets-issues.json').filter(i => !i.pull_request)
    .forEach(i => rows.push(normalize(i, 'Joel-Fah/repo-to-sheets', 'issue')));
  loadFixture('repo-to-sheets-pulls.json').forEach(p => rows.push(normalize(p, 'Joel-Fah/repo-to-sheets', 'pr')));
  loadFixture('devfest-yaounde-issues.json').filter(i => !i.pull_request)
    .forEach(i => rows.push(normalize(i, 'gdgyaounde/devfest-yaounde', 'issue')));
  return rows;
}

const extra = (o = {}) => {
  const row = {
    repo: 'o/r', type: 'issue', number: 900, title: 'Extra', state: 'open', status: 'todo', priority: '', assignee: '',
    updatedAt: '2026-09-24T06:00:00Z', ...o
  };
  return { url: `https://github.com/${row.repo}/${row.type === 'pr' ? 'pull' : 'issues'}/${row.number}`, ...row };
};

// ---- normal case, real fixture data ----

test('real fixture data: subject counts, sections, and titles come from the data', () => {
  const rows = fixtureRows();
  const selection = selectDigestItems(rows, makeMeta().since, NOW);
  const { subject, htmlBody, plainTextBody } = buildDigestHtml(rows, [], makeMeta());

  assert.equal(selection.shipped.length, 4); // repo-to-sheets #1 done, PR #2 merged; devfest #41 and #35 done
  assert.equal(selection.active.length, 1); // repo-to-sheets #3, still open
  assert.equal(subject, 'Repo Pulse · 4 shipped, 1 in motion — Thu 24 Sep');
  assert.ok(htmlBody.includes('Bootstrap Apps Script project scaffold'));
  assert.ok(htmlBody.includes('Implement GitHubClient + Transformer'));
  assert.ok(htmlBody.includes('Add photos for the ten team members'));
  assert.ok(htmlBody.includes('>Shipped<') && htmlBody.includes('>In motion<'));
  assert.ok(plainTextBody.includes('SHIPPED (4)') && plainTextBody.includes('IN MOTION (1)'));
});

test('a section with no items is omitted (no empty "Needs attention" box)', () => {
  const { htmlBody } = buildDigestHtml(fixtureRows(), [], makeMeta());
  assert.ok(!htmlBody.includes('>Needs attention<'));
});

test('with stale and unstarted high-priority work, a Needs attention section and count appear', () => {
  const rows = fixtureRows().concat([
    extra({ number: 901, title: 'Old and quiet', updatedAt: '2026-09-10T08:00:00Z' }),
    extra({ number: 902, title: 'Urgent, not started', priority: 'high', updatedAt: '2026-09-22T08:00:00Z' })
  ]);
  const { subject, htmlBody } = buildDigestHtml(rows, [], makeMeta());
  assert.match(subject, /2 need attention/);
  assert.ok(htmlBody.includes('>Needs attention<'));
  assert.ok(htmlBody.includes('quiet for 14 days'));
  assert.ok(htmlBody.includes('high priority, not started'));
});

test('priority chips use the Kanban board palette', () => {
  const rows = [
    extra({ number: 1, state: 'closed', status: 'done', priority: 'high' }),
    extra({ number: 2, state: 'closed', status: 'done', priority: 'medium' }),
    extra({ number: 3, state: 'closed', status: 'done', priority: 'low' }),
    extra({ number: 4, state: 'closed', status: 'done', priority: '' })
  ];
  const { htmlBody } = buildDigestHtml(rows, [], makeMeta());
  assert.ok(htmlBody.includes('background-color:#FCE8E6;color:#C5221F')); // High: red
  assert.ok(htmlBody.includes('background-color:#FEF3C7;color:#B45309')); // Medium: amber
  assert.ok(htmlBody.includes('background-color:#E6F4EA;color:#137333')); // Low: green
  assert.ok(htmlBody.includes('background-color:#F1F3F4;color:#5F6368')); // none: grey
});

test('item titles link to the GitHub item', () => {
  const { htmlBody } = buildDigestHtml(fixtureRows(), [], makeMeta());
  assert.ok(htmlBody.includes('href="https://github.com/Joel-Fah/repo-to-sheets/issues/3"'));
});

// ---- recommended actions ----

test('recommended actions render as a numbered box with bold text and links to real items only', () => {
  const rows = fixtureRows();
  const recs = [
    '**Review Joel-Fah/repo-to-sheets#3 first**, it has been in progress longest.',
    'Also look at Joel-Fah/repo-to-sheets#999, which does not exist.'
  ];
  const { htmlBody, plainTextBody } = buildDigestHtml(rows, recs, makeMeta());

  assert.ok(htmlBody.includes('Recommended actions'));
  assert.ok(htmlBody.includes('<strong>Review </strong>') || htmlBody.includes('<strong>'));
  assert.ok(htmlBody.includes('href="https://github.com/Joel-Fah/repo-to-sheets/issues/3"'));
  assert.ok(!htmlBody.includes('/issues/999'), 'an unknown reference must not become a link');
  assert.ok(htmlBody.includes('Joel-Fah/repo-to-sheets#999'), 'but its text is kept');
  assert.ok(plainTextBody.includes('RECOMMENDED ACTIONS\n1. Review Joel-Fah/repo-to-sheets#3 first, it has been in progress longest.\n2. Also look at'));
  assert.ok(!plainTextBody.includes('**'));
});

test('data-derived recommendations from the same rows show up in the email', () => {
  const rows = fixtureRows().concat([extra({ number: 901, title: 'Old and quiet', updatedAt: '2026-09-10T08:00:00Z' })]);
  const selection = selectDigestItems(rows, makeMeta().since, NOW);
  const recs = deriveRecommendations(selection, rows, NOW);
  const { htmlBody } = buildDigestHtml(rows, recs, makeMeta());
  assert.ok(htmlBody.includes('no activity for 5+ days'));
  assert.ok(htmlBody.includes('href="https://github.com/o/r/issues/901"'), 'the recommended item is linked');
});

test('no recommendations means no recommendations box', () => {
  const { htmlBody } = buildDigestHtml(fixtureRows(), [], makeMeta());
  assert.ok(!htmlBody.includes('Recommended actions'));
});

// ---- summary, meta, call to action ----

test('the short version appears only when a summary is given, and is formatted', () => {
  const withSummary = buildDigestHtml(fixtureRows(), [], makeMeta({ summary: '**Five items shipped**, including Joel-Fah/repo-to-sheets#1.' }));
  assert.ok(withSummary.htmlBody.includes('The short version'));
  assert.ok(withSummary.htmlBody.includes('<strong>Five items shipped</strong>'));
  assert.ok(withSummary.htmlBody.includes('href="https://github.com/Joel-Fah/repo-to-sheets/issues/1"'));

  const without = buildDigestHtml(fixtureRows(), [], makeMeta());
  assert.ok(!without.htmlBody.includes('The short version'));
});

test('the footer call to action links back to the sheet', () => {
  const { htmlBody, plainTextBody } = buildDigestHtml(fixtureRows(), [], makeMeta());
  assert.ok(htmlBody.includes(`href="${SHEET_URL}"`));
  assert.ok(htmlBody.includes('Open the dashboard'));
  assert.ok(plainTextBody.includes(`Open the dashboard: ${SHEET_URL}`));
});

test('a missing or non-https sheet URL drops the button instead of emitting a bad link', () => {
  assert.ok(!buildDigestHtml(fixtureRows(), [], makeMeta({ sheetUrl: '' })).htmlBody.includes('Open the dashboard'));
  assert.ok(!buildDigestHtml(fixtureRows(), [], makeMeta({ sheetUrl: 'javascript:alert(1)' })).htmlBody.includes('javascript:'));
});

test('the header shows the date, window, repo count, and whether it was scheduled or on demand', () => {
  const scheduled = buildDigestHtml(fixtureRows(), [], makeMeta()).htmlBody;
  assert.ok(scheduled.includes('Thursday 24 September') && scheduled.includes('Since Wed 23 Sep, 09:00'));
  assert.ok(scheduled.includes('2 repos tracked'));
  assert.ok(scheduled.includes('Daily digest'));
  assert.ok(buildDigestHtml(fixtureRows(), [], makeMeta({ mode: 'manual' })).htmlBody.includes('On demand'));
});

test('a hidden preheader gives inboxes a useful preview line', () => {
  const { htmlBody } = buildDigestHtml(fixtureRows(), [], makeMeta({ summary: '**Five items shipped** today.' }));
  assert.match(htmlBody, /<div style="display:none;[^"]*">Five items shipped today\.<\/div>/);
});

// ---- email-client constraints ----

test('follows the email rules: inline styles and tables only, no style blocks, scripts, images or classes', () => {
  const rows = fixtureRows().concat([extra({ number: 901, updatedAt: '2026-09-10T08:00:00Z' })]);
  const { htmlBody } = buildDigestHtml(rows, ['**One** action for o/r#901.'], makeMeta({ summary: 'A summary.' }));

  for (const forbidden of ['<style', '<script', '<link', '<img', '<svg', '<iframe', '<form', 'class=', '@media', 'display:flex', 'display:grid', 'position:', 'javascript:']) {
    assert.ok(!htmlBody.toLowerCase().includes(forbidden), `must not contain ${forbidden}`);
  }
  assert.ok(htmlBody.startsWith('<!DOCTYPE html>'));
  assert.ok(htmlBody.includes('role="presentation"'));
  assert.ok(htmlBody.includes('max-width:600px'));
  assert.ok(htmlBody.includes('bgcolor="'), 'background colors are also set as attributes for Outlook');
  const anchors = htmlBody.match(/<a [^>]*>/g) || [];
  assert.ok(anchors.length > 0);
  anchors.forEach(tag => assert.ok(/style="/.test(tag), `anchor without inline style: ${tag}`));
});

test('the HTML is well nested: every table, row and cell that opens also closes', () => {
  const { htmlBody } = buildDigestHtml(fixtureRows(), ['**A** rec.'], makeMeta({ summary: 'Sum.' }));
  for (const tag of ['table', 'tr', 'td']) {
    const opens = (htmlBody.match(new RegExp(`<${tag}[\\s>]`, 'g')) || []).length;
    const closes = (htmlBody.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    assert.equal(opens, closes, `<${tag}> opens ${opens} vs closes ${closes}`);
  }
});

// ---- safety ----

test('GitHub-supplied text is HTML-escaped, and non-https item URLs are not linked', () => {
  const rows = [
    extra({ number: 1, state: 'closed', status: 'done', title: '<script>alert(1)</script> & "quoted" <b>bold</b>', repo: 'o/<r>', url: 'javascript:alert(1)' })
  ];
  const { htmlBody } = buildDigestHtml(rows, [], makeMeta());
  assert.ok(!htmlBody.includes('<script>'));
  assert.ok(htmlBody.includes('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;quoted&quot; &lt;b&gt;bold&lt;/b&gt;'));
  assert.ok(htmlBody.includes('o/&lt;r&gt;'));
  assert.ok(!htmlBody.includes('javascript:'));
});

test('a model-written HTML or markdown link in a recommendation is shown as inert text', () => {
  const { htmlBody } = buildDigestHtml(fixtureRows(), ['See <a href="http://evil.example">this</a> or [x](http://evil.example)'], makeMeta());
  assert.ok(!htmlBody.includes('href="http://evil.example"'));
  assert.ok(htmlBody.includes('&lt;a href=&quot;http://evil.example&quot;&gt;'));
});

// ---- caps ----

test('long sections are capped at 6 with a "+N more" link to the sheet', () => {
  const rows = Array.from({ length: 9 }, (_, i) => extra({ number: i + 1, type: 'pr', state: 'closed', status: 'merged', title: `Merged PR ${i + 1}`, updatedAt: `2026-09-24T0${i}:00:00Z` }));
  const { htmlBody, plainTextBody } = buildDigestHtml(rows, [], makeMeta());
  assert.equal((htmlBody.match(/Merged PR \d/g) || []).length, 6);
  assert.ok(htmlBody.includes('+ 3 more'));
  assert.ok(htmlBody.includes('see all in the sheet'));
  assert.ok(plainTextBody.includes('+ 3 more in the sheet'));
});

// ---- plain text ----

test('the plain-text body mirrors the sections with URLs and no HTML', () => {
  const rows = fixtureRows().concat([extra({ number: 901, title: 'Old and quiet', updatedAt: '2026-09-10T08:00:00Z' })]);
  const { plainTextBody } = buildDigestHtml(rows, ['Do the thing.'], makeMeta({ summary: 'Short.' }));
  assert.ok(plainTextBody.startsWith('REPO PULSE · Thursday 24 September'));
  assert.ok(plainTextBody.includes('THE SHORT VERSION\nShort.'));
  assert.ok(plainTextBody.includes('NEEDS ATTENTION (1)'));
  assert.ok(plainTextBody.includes('https://github.com/Joel-Fah/repo-to-sheets/issues/3'));
  assert.ok(!/<[a-z][^>]*>/i.test(plainTextBody), 'no HTML tags in the plain-text part');
});

// ---- empty / all-quiet state ----

test('all quiet: a short, complete email with a hero, a snapshot, a call to action, and no empty sections', () => {
  const rows = [
    extra({ number: 1, type: 'issue', updatedAt: '2026-09-20T08:00:00Z' }),
    extra({ number: 2, type: 'pr', updatedAt: '2026-09-22T08:00:00Z' })
  ];
  const { subject, htmlBody, plainTextBody } = buildDigestHtml(rows, [], makeMeta({ since: new Date('2026-09-24T07:00:00Z'), sinceLabel: 'Thu 24 Sep, 08:00' }));

  assert.equal(subject, 'Repo Pulse · all quiet — Thu 24 Sep');
  assert.ok(htmlBody.includes('All quiet.'));
  assert.ok(htmlBody.includes('Nothing shipped or moved since Thu 24 Sep, 08:00'));
  assert.ok(htmlBody.includes('Open issues') && htmlBody.includes('Open PRs'));
  assert.ok(htmlBody.includes('Open the dashboard'));
  assert.ok(!htmlBody.includes('>Shipped<') && !htmlBody.includes('>In motion<'));
  assert.ok(htmlBody.length > 3000, 'not an empty-looking email');
  assert.ok(plainTextBody.includes('ALL QUIET.'));
});

test('all quiet still surfaces things that need attention (at most 3) and derived actions', () => {
  const rows = Array.from({ length: 5 }, (_, i) => extra({ number: i + 1, updatedAt: `2026-09-0${i + 1}T08:00:00Z` }));
  const selection = selectDigestItems(rows, new Date('2026-09-24T07:00:00Z'), NOW);
  const recs = deriveRecommendations(selection, rows, NOW);
  const { htmlBody } = buildDigestHtml(rows, recs, makeMeta({ since: new Date('2026-09-24T07:00:00Z') }));
  assert.ok(htmlBody.includes('>Needs attention<'));
  assert.equal((htmlBody.match(/o\/r #\d+ · quiet for \d+ days/g) || []).length, 3, 'three items listed');
  assert.ok(htmlBody.includes('+ 2 more'));
  assert.ok(htmlBody.includes('Recommended actions'));
});

test('no rows at all still produces a valid all-quiet email', () => {
  const { subject, htmlBody, plainTextBody } = buildDigestHtml([], [], makeMeta());
  assert.equal(subject, 'Repo Pulse · all quiet — Thu 24 Sep');
  assert.ok(htmlBody.includes('All quiet.'));
  assert.ok(htmlBody.includes('Open the dashboard'));
  assert.ok(plainTextBody.includes('ALL QUIET.'));
});
