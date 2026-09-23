const test = require('node:test');
const assert = require('node:assert/strict');
const { loadLib, loadFixture } = require('./helpers/loadLib');

const { upsertActivityRows, planActivityUpsert, normalize } = loadLib('SheetService.js', 'Transformer.js');

const HEADERS = ['repo', 'type', 'number', 'title', 'state', 'status', 'priority', 'assignee', 'updatedAt', 'url'];
const TAB = 'Activity';

/**
 * @param {object} [overrides]
 * @returns {object} a normalized row
 */
function makeRow(overrides = {}) {
  return {
    repo: 'Joel-Fah/repo-to-sheets',
    type: 'issue',
    number: 1,
    title: 'First issue',
    state: 'open',
    status: 'todo',
    priority: 'high',
    assignee: '',
    updatedAt: '2026-09-23T10:00:00Z',
    url: 'https://github.com/Joel-Fah/repo-to-sheets/issues/1',
    ...overrides
  };
}

/**
 * In-memory stand-in for the parts of the Spreadsheet/Sheet API SheetService uses.
 * `calls` records every mutation so tests can assert ordering and skipped writes.
 * @param {any[][]} [initialGrid] - optional pre-existing sheet contents (header included)
 * @returns {{spreadsheet: object, sheet: object, calls: string[], grid: any[][]}}
 */
function fakeSpreadsheet(initialGrid) {
  const calls = [];
  const grid = initialGrid ? initialGrid.map(r => r.slice()) : [];
  const sheets = {};
  let sheet = null;
  if (initialGrid) sheet = makeSheet();

  function makeSheet() {
    return {
      getLastRow: () => grid.length,
      appendRow: values => { calls.push('appendRow'); grid.push(values.slice()); },
      getRange: (row, col, numRows, numCols) => ({
        getValues: () => Array.from({ length: numRows }, (_, r) =>
          Array.from({ length: numCols }, (_, c) => (grid[row - 1 + r] || [])[col - 1 + c] ?? '')),
        setNumberFormats: formats => {
          calls.push('setNumberFormats');
          assert.equal(formats.length, numRows);
          assert.equal(formats[0].length, numCols);
        },
        setValues: values => {
          calls.push('setValues');
          assert.equal(values.length, numRows);
          values.forEach((vals, r) => { grid[row - 1 + r] = vals.slice(); });
        }
      })
    };
  }

  const spreadsheet = {
    getSheetByName: name => (name === TAB ? sheet : null),
    insertSheet: name => { calls.push(`insertSheet:${name}`); sheet = makeSheet(); sheets[name] = sheet; return sheet; }
  };
  return { spreadsheet, calls, grid };
}

// ---- planActivityUpsert (pure) ----

test('planActivityUpsert appends rows whose key is not in the sheet', () => {
  const plan = planActivityUpsert([], [makeRow({ number: 1 }), makeRow({ number: 2 })]);
  assert.equal(plan.added, 2);
  assert.equal(plan.updated, 0);
  assert.deepEqual(plan.table.map(r => r[2]), [1, 2]);
});

test('planActivityUpsert updates a changed row in place, without moving it', () => {
  const first = makeRow({ number: 1 });
  const second = makeRow({ number: 2, title: 'Second' });
  const existing = planActivityUpsert([], [first, second]).table;

  const plan = planActivityUpsert(existing, [makeRow({ number: 1, state: 'closed', status: 'done' })]);

  assert.deepEqual([plan.added, plan.updated, plan.unchanged], [0, 1, 0]);
  assert.equal(plan.table.length, 2);
  assert.equal(plan.table[0][4], 'closed');
  assert.equal(plan.table[0][5], 'done');
  assert.equal(plan.table[1][3], 'Second', 'other rows untouched');
});

test('planActivityUpsert is idempotent: the same rows twice change nothing the second time', () => {
  const rows = [makeRow({ number: 1 }), makeRow({ number: 2 }), makeRow({ type: 'pr', number: 1 })];
  const once = planActivityUpsert([], rows);
  const twice = planActivityUpsert(once.table, rows);

  assert.deepEqual([twice.added, twice.updated, twice.unchanged], [0, 0, 3]);
  assert.deepEqual(twice.table, once.table);
});

test('the key is (repo, type, number): same number with a different type or repo is a different row', () => {
  const rows = [
    makeRow({ type: 'issue', number: 7 }),
    makeRow({ type: 'pr', number: 7 }),
    makeRow({ repo: 'MENGUEDAVIS/devfest-yaounde', type: 'issue', number: 7 })
  ];
  assert.equal(planActivityUpsert([], rows).table.length, 3);
});

test('repo comparison is case-insensitive so changing case in Settings does not duplicate rows', () => {
  const existing = planActivityUpsert([], [makeRow({ repo: 'Joel-Fah/repo-to-sheets' })]).table;
  const plan = planActivityUpsert(existing, [makeRow({ repo: 'joel-fah/Repo-To-Sheets' })]);
  assert.equal(plan.table.length, 1);
  assert.equal(plan.added, 0);
});

test('duplicates within one batch (page-shift overlap) collapse to a single row, last one winning', () => {
  const plan = planActivityUpsert([], [makeRow({ title: 'old title' }), makeRow({ title: 'new title' })]);
  assert.equal(plan.table.length, 1);
  assert.equal(plan.table[0][3], 'new title');
  assert.equal(plan.added, 1);
});

test('stale-row policy: rows missing from the fetch are kept exactly as they were', () => {
  const existing = planActivityUpsert([], [makeRow({ number: 1 }), makeRow({ number: 2 })]).table;
  const plan = planActivityUpsert(existing, [makeRow({ number: 2, title: 'renamed' })]);
  assert.equal(plan.table.length, 2);
  assert.deepEqual(plan.table[0], existing[0]);
});

test('an empty fetch (e.g. every repo failed) leaves the table unchanged', () => {
  const existing = planActivityUpsert([], [makeRow({ number: 1 })]).table;
  const plan = planActivityUpsert(existing, []);
  assert.deepEqual(plan.table, existing);
  assert.deepEqual([plan.added, plan.updated], [0, 0]);
});

test('blank rows in the sheet are preserved and never matched', () => {
  const blank = ['', '', '', '', '', '', '', '', '', ''];
  const plan = planActivityUpsert([blank], [makeRow({ number: 1 })]);
  assert.equal(plan.table.length, 2);
  assert.deepEqual(plan.table[0], blank);
  assert.equal(plan.added, 1);
});

test('updatedAt is stored as a real Date, and an identical instant is not seen as a change', () => {
  const plan = planActivityUpsert([], [makeRow({ updatedAt: '2026-09-23T10:00:00Z' })]);
  assert.ok(plan.table[0][8] instanceof Date);
  // Sheets hands back an equal Date object on the next read, not the same instance.
  const readBack = plan.table.map(r => r.map(c => (c instanceof Date ? new Date(c.getTime()) : c)));
  assert.equal(planActivityUpsert(readBack, [makeRow()]).updated, 0);
});

test('a number stored as text in the sheet still matches the numeric key', () => {
  const existing = [['Joel-Fah/repo-to-sheets', 'issue', '1', 'First issue', 'open', 'todo', 'high', '', new Date('2026-09-23T10:00:00Z'), 'https://github.com/Joel-Fah/repo-to-sheets/issues/1']];
  const plan = planActivityUpsert(existing, [makeRow()]);
  assert.deepEqual([plan.added, plan.updated, plan.unchanged], [0, 0, 1]);
});

test('works with real normalized rows from the fixtures', () => {
  const issues = loadFixture('repo-to-sheets-issues.json').filter(i => !i.pull_request);
  const rows = issues.map(i => normalize(i, 'Joel-Fah/repo-to-sheets', 'issue'));
  const first = planActivityUpsert([], rows);
  assert.equal(first.added, rows.length);
  assert.equal(planActivityUpsert(first.table, rows).updated, 0);
});

// ---- upsertActivityRows (with the fake spreadsheet) ----

test('creates the Activity tab with headers when it does not exist', () => {
  const { spreadsheet, calls, grid } = fakeSpreadsheet();
  const result = upsertActivityRows(spreadsheet, TAB, [makeRow()]);

  assert.deepEqual(result, { added: 1, updated: 0, unchanged: 0 });
  assert.equal(calls[0], `insertSheet:${TAB}`);
  assert.deepEqual(grid[0], HEADERS);
  assert.equal(grid.length, 2);
  assert.equal(grid[1][3], 'First issue');
});

test('running the upsert twice does not duplicate rows and skips the second write', () => {
  const { spreadsheet, calls, grid } = fakeSpreadsheet();
  const rows = [makeRow({ number: 1 }), makeRow({ number: 2 })];

  upsertActivityRows(spreadsheet, TAB, rows);
  const writesAfterFirst = calls.filter(c => c === 'setValues').length;
  const second = upsertActivityRows(spreadsheet, TAB, rows);

  assert.deepEqual(second, { added: 0, updated: 0, unchanged: 2 });
  assert.equal(grid.length, 3, 'header + 2 rows, no duplicates');
  assert.equal(calls.filter(c => c === 'setValues').length, writesAfterFirst, 'no write when nothing changed');
});

test('a changed row is updated at the same position on the next run', () => {
  const { spreadsheet, grid } = fakeSpreadsheet();
  upsertActivityRows(spreadsheet, TAB, [makeRow({ number: 1 }), makeRow({ number: 2 })]);

  const result = upsertActivityRows(spreadsheet, TAB, [makeRow({ number: 1, state: 'closed', status: 'done' })]);

  assert.deepEqual(result, { added: 0, updated: 1, unchanged: 0 });
  assert.equal(grid.length, 3);
  assert.equal(grid[1][2], 1);
  assert.equal(grid[1][4], 'closed');
  assert.equal(grid[2][2], 2, 'row 2 still in place');
});

test('number formats are applied before values so titles like "=1+1" stay literal text', () => {
  const { spreadsheet, calls } = fakeSpreadsheet();
  upsertActivityRows(spreadsheet, TAB, [makeRow({ title: '=IMPORTDATA("http://example.com")' })]);
  assert.ok(calls.indexOf('setNumberFormats') !== -1);
  assert.ok(calls.indexOf('setNumberFormats') < calls.indexOf('setValues'));
});

test('an existing but empty Activity tab gets its header row', () => {
  const { spreadsheet, grid } = fakeSpreadsheet([]);
  upsertActivityRows(spreadsheet, TAB, [makeRow()]);
  assert.deepEqual(grid[0], HEADERS);
  assert.equal(grid.length, 2);
});

test('throws a clear error, without writing, when the header row was changed', () => {
  const { spreadsheet, calls } = fakeSpreadsheet([['repo', 'kind', 'number']]);
  assert.throws(() => upsertActivityRows(spreadsheet, TAB, [makeRow()]), /headers don't match/);
  assert.ok(!calls.includes('setValues'));
});
