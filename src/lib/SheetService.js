/**
 * SheetService.js
 * Upserts normalized rows into the Activity tab, keyed on
 * (repo, type, number).
 *
 * No GAS globals: the spreadsheet is injected, so the upsert logic runs under
 * plain Node with a fake. See docs/features/sheet-service.md for the upsert
 * key and the stale-row policy.
 */

const ACTIVITY_COLUMNS = [
  'repo', 'type', 'number', 'title', 'state', 'status', 'priority', 'assignee', 'updatedAt', 'url'
];

// Plain text for every text column, so text like "007", "1/2" or "TRUE" is
// stored as typed instead of being coerced to a number, date or boolean.
// This alone does not stop "=..." being evaluated: see escapeSheetText_.
const ACTIVITY_NUMBER_FORMATS = [
  '@', '@', '0', '@', '@', '@', '@', '@', 'yyyy-mm-dd hh:mm:ss', '@'
];

/**
 * Inserts new rows and updates changed ones in place. Rows already in the
 * sheet but absent from `rows` are left untouched (never deleted or marked).
 * @param {{getSheetByName: function, insertSheet: function}} spreadsheet - e.g. SpreadsheetApp.getActiveSpreadsheet()
 * @param {string} tabName - Activity tab name
 * @param {object[]} rows - normalized rows from Transformer.normalize
 * @returns {{added: number, updated: number, unchanged: number, changes: ActivityChange[]}}
 *   counts for this run, plus each added/changed row (what the Insights summary is built from)
 */
function upsertActivityRows(spreadsheet, tabName, rows) {
  const sheet = getOrCreateActivitySheet_(spreadsheet, tabName);
  const width = ACTIVITY_COLUMNS.length;
  const lastRow = sheet.getLastRow();
  const existing = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, width).getValues() : [];

  const plan = planActivityUpsert(existing, rows);

  if (plan.added + plan.updated > 0) {
    const range = sheet.getRange(2, 1, plan.table.length, width);
    range.setNumberFormats(plan.table.map(() => ACTIVITY_NUMBER_FORMATS)); // formats first, so values stay literal
    // Every string is escaped, including unchanged rows: the whole data area is rewritten.
    range.setValues(plan.table.map(values => values.map(escapeSheetText_)));
  }
  return { added: plan.added, updated: plan.updated, unchanged: plan.unchanged, changes: plan.changes };
}

/**
 * @typedef {object} ActivityChange
 * @property {'added'|'updated'} kind
 * @property {object} row - the normalized row as it is now
 * @property {object} [before] - for 'updated': the row as it was in the sheet, keyed by column name
 */

/**
 * Pure planning step of the upsert.
 * @param {any[][]} existingValues - current Activity data rows (header excluded), in ACTIVITY_COLUMNS order
 * @param {object[]} rows - normalized rows; if the same key appears twice the last one wins
 * @returns {{table: any[][], added: number, updated: number, unchanged: number, changes: ActivityChange[]}}
 *   `table` is the full data area to write back: existing rows in their original
 *   order (changed ones replaced in place), then new rows appended.
 */
function planActivityUpsert(existingValues, rows) {
  const table = existingValues.map(values => values.slice());
  const indexByKey = new Map();
  table.forEach((values, index) => {
    const key = activityKey_(values[0], values[1], values[2]);
    if (key !== null && !indexByKey.has(key)) indexByKey.set(key, index);
  });

  const incomingByKey = new Map();
  rows.forEach(row => incomingByKey.set(activityKey_(row.repo, row.type, row.number), row));

  let added = 0;
  let updated = 0;
  let unchanged = 0;
  const changes = [];
  incomingByKey.forEach((row, key) => {
    const values = activityRowToValues_(row);
    if (!indexByKey.has(key)) {
      table.push(values);
      indexByKey.set(key, table.length - 1);
      added += 1;
      changes.push({ kind: 'added', row });
    } else if (sameRow_(table[indexByKey.get(key)], values)) {
      unchanged += 1;
    } else {
      const before = activityValuesToRow_(table[indexByKey.get(key)]);
      table[indexByKey.get(key)] = values;
      updated += 1;
      changes.push({ kind: 'updated', row, before });
    }
  });
  return { table, added, updated, unchanged, changes };
}

/**
 * @param {any[]} values - one sheet row in ACTIVITY_COLUMNS order
 * @returns {object} the same data keyed by column name; a Date cell becomes an ISO string
 */
function activityValuesToRow_(values) {
  const row = {};
  ACTIVITY_COLUMNS.forEach((column, i) => {
    const cell = values[i];
    row[column] = Object.prototype.toString.call(cell) === '[object Date]' && !Number.isNaN(cell.getTime())
      ? cell.toISOString()
      : cell;
  });
  return row;
}

/**
 * @param {{getSheetByName: function, insertSheet: function}} spreadsheet
 * @param {string} tabName
 * @returns {object} the Activity sheet, created with headers if missing or empty
 */
function getOrCreateActivitySheet_(spreadsheet, tabName) {
  let sheet = spreadsheet.getSheetByName(tabName);
  if (!sheet) sheet = spreadsheet.insertSheet(tabName);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(ACTIVITY_COLUMNS);
    return sheet;
  }
  const headers = sheet.getRange(1, 1, 1, ACTIVITY_COLUMNS.length).getValues()[0].map(String);
  if (headers.join('|') !== ACTIVITY_COLUMNS.join('|')) {
    throw new Error(
      `"${tabName}" tab headers don't match the expected columns (${ACTIVITY_COLUMNS.join(' | ')}). ` +
      'Fix the header row, or rename/delete the tab so it can be recreated.'
    );
  }
  return sheet;
}

/**
 * Upsert key. Repo is lowercased because GitHub treats repo names case-insensitively.
 * @param {any} repo
 * @param {any} type
 * @param {any} number
 * @returns {string|null} null for a blank row (no key)
 */
function activityKey_(repo, type, number) {
  if (String(repo) === '' && String(type) === '' && String(number) === '') return null;
  return `${String(repo).toLowerCase()}|${String(type)}|${String(number)}`;
}

/**
 * @param {object} row - normalized row
 * @returns {any[]} cell values in ACTIVITY_COLUMNS order; updatedAt as a real Date so it sorts and formats in Sheets
 */
function activityRowToValues_(row) {
  const updatedAt = row.updatedAt ? new Date(row.updatedAt) : null;
  return [
    row.repo,
    row.type,
    row.number,
    row.title,
    row.state,
    row.status,
    row.priority,
    row.assignee,
    updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : '',
    row.url
  ];
}

/**
 * Protects GitHub-supplied text (titles, labels, assignees) from being
 * interpreted by Sheets. Verified against a real Sheet: setValues evaluates a
 * leading "=" even in a plain-text cell, so a hostile issue title could run a
 * formula. A leading apostrophe forces literal text and is stripped on write,
 * so reads return the original string. "'" is included because Sheets would
 * otherwise strip a title's own leading apostrophe.
 * @param {any} value
 * @returns {any} the value, with "'" prepended if it is a string starting with = + - @ or '
 */
function escapeSheetText_(value) {
  return typeof value === 'string' && /^[=+\-@']/.test(value) ? `'${value}` : value;
}

/**
 * @param {any[]} a
 * @param {any[]} b
 * @returns {boolean} true if every cell is equivalent (Dates compare by instant, everything else as text)
 */
function sameRow_(a, b) {
  return a.length === b.length && a.every((cell, i) => cellComparable_(cell) === cellComparable_(b[i]));
}

/**
 * @param {any} value
 * @returns {string}
 */
function cellComparable_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Number.isNaN(value.getTime()) ? '' : value.toISOString();
  }
  return value === null || value === undefined ? '' : String(value);
}
