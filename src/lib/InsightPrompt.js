/**
 * InsightPrompt.js
 * Builds the compact plain-text description of a sync's changes that is
 * sent to Gemini. Pure — no GAS globals. See docs/features/gemini-insights.md.
 */

const INSIGHT_MAX_CHANGES = 30;
const INSIGHT_MAX_STALE = 10;
const INSIGHT_STALE_DAYS = 14;
const INSIGHT_MAX_TITLE_LENGTH = 100;
const INSIGHT_DIFF_FIELDS = ['title', 'state', 'status', 'priority', 'assignee'];
const INSIGHT_SINCE_MARGIN_MS = 2 * 60 * 1000; // clock skew allowance between GitHub and Apps Script

/**
 * @param {ActivityChange[]} changes - rows added or changed by this sync (from upsertActivityRows)
 * @param {object[]} currentRows - normalized rows fetched in this sync, used to spot stale open items
 * @param {Date} now
 * @param {Date} [since] - time of the previous sync. An added row last updated before this is existing
 *   history being imported (e.g. a newly tracked repo), not new activity, and is reported as a count.
 *   When omitted, every added row is treated as new.
 * @returns {string} prompt text; '' when there are no changes (nothing to summarize)
 */
function buildInsightPrompt(changes, currentRows, now, since) {
  if (!changes || changes.length === 0) return '';

  const { news, backfill } = partitionChanges_(changes, since);
  const lines = ['Changes detected in this sync:'];
  if (news.length === 0) lines.push('- none');
  news.slice(0, INSIGHT_MAX_CHANGES).forEach(change => lines.push(`- ${describeChange_(change)}`));
  if (news.length > INSIGHT_MAX_CHANGES) {
    lines.push(`- ...and ${news.length - INSIGHT_MAX_CHANGES} more changes not listed`);
  }

  if (backfill.length > 0) {
    lines.push('', 'Existing items newly imported into the sheet (history, not new activity):');
    countByRepo_(backfill).forEach(([repo, count]) => lines.push(`- ${count} item(s) from ${repo}`));
  }

  // Always state this section: if it were omitted when empty, the model could only guess whether "nothing stale" was true.
  const stale = findStaleItems(currentRows || [], now, INSIGHT_STALE_DAYS);
  lines.push('', `Open items with no activity for ${INSIGHT_STALE_DAYS}+ days:`);
  if (stale.length === 0) {
    lines.push('- none');
  } else {
    stale.slice(0, INSIGHT_MAX_STALE).forEach(row => lines.push(`- ${describeItem_(row)}, last updated ${row.updatedAt.slice(0, 10)}`));
    if (stale.length > INSIGHT_MAX_STALE) lines.push(`- ...and ${stale.length - INSIGHT_MAX_STALE} more`);
  }
  return lines.join('\n');
}

/**
 * @param {ActivityChange[]} changes
 * @param {Date} [since]
 * @returns {{news: ActivityChange[], backfill: ActivityChange[]}} backfill = added rows older than the previous sync
 */
function partitionChanges_(changes, since) {
  if (!since) return { news: changes, backfill: [] };
  const cutoff = since.getTime() - INSIGHT_SINCE_MARGIN_MS;
  const news = [];
  const backfill = [];
  changes.forEach(change => {
    const isHistory = change.kind === 'added' && !(new Date(change.row.updatedAt).getTime() >= cutoff);
    (isHistory ? backfill : news).push(change);
  });
  return { news, backfill };
}

/**
 * @param {ActivityChange[]} changes
 * @returns {[string, number][]} [repo, count] pairs, in first-seen order
 */
function countByRepo_(changes) {
  const counts = new Map();
  changes.forEach(change => counts.set(change.row.repo, (counts.get(change.row.repo) || 0) + 1));
  return Array.from(counts.entries());
}

/**
 * @param {object[]} rows - normalized rows
 * @param {Date} now
 * @param {number} days - minimum age since last update
 * @returns {object[]} open rows not updated for at least `days`, oldest first
 */
function findStaleItems(rows, now, days) {
  const cutoff = now.getTime() - days * 24 * 60 * 60 * 1000;
  return rows
    .filter(row => row.state === 'open' && row.updatedAt && new Date(row.updatedAt).getTime() <= cutoff)
    .sort((a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime());
}

/**
 * @param {ActivityChange} change
 * @returns {string}
 */
function describeChange_(change) {
  if (change.kind === 'added') {
    const row = change.row;
    return `NEW ${describeItem_(row)} (${row.state}; status ${row.status || 'none'}; priority ${row.priority || 'none'})`;
  }
  const diffs = INSIGHT_DIFF_FIELDS
    .filter(field => String(change.before[field] ?? '') !== String(change.row[field] ?? ''))
    .map(field => `${field}: ${quoteIfTitle_(field, change.before[field])} -> ${quoteIfTitle_(field, change.row[field])}`);
  return `UPDATED ${describeItem_(change.row)}: ${diffs.length ? diffs.join('; ') : 'details changed'}`;
}

/**
 * @param {object} row
 * @returns {string} e.g. 'pr Joel-Fah/repo-to-sheets#4 "feat: implement ..."'; the owner/repo#number
 *   reference is what the model is told to repeat, and what InsightFormat turns into a link
 */
function describeItem_(row) {
  return `${row.type} ${row.repo}#${row.number} "${shortTitle_(row.title)}"`;
}

/**
 * @param {string} field
 * @param {any} value
 * @returns {string} titles are quoted and shortened, other values shown as-is ('none' if empty)
 */
function quoteIfTitle_(field, value) {
  if (field === 'title') return `"${shortTitle_(value)}"`;
  return value === '' || value === null || value === undefined ? 'none' : String(value);
}

/**
 * @param {any} title
 * @returns {string} single-line title, capped in length (GitHub titles are untrusted text)
 */
function shortTitle_(title) {
  const text = String(title ?? '').replace(/\s+/g, ' ').trim();
  return text.length > INSIGHT_MAX_TITLE_LENGTH ? `${text.slice(0, INSIGHT_MAX_TITLE_LENGTH)}...` : text;
}
