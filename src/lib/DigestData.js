/**
 * DigestData.js
 * Pure selection logic for the email digest: which Activity rows belong in
 * which section, the time window, and data-derived recommended actions.
 * No GAS globals. See docs/features/email-digest.md.
 */

const DIGEST_STALE_DAYS = 5;
const DIGEST_DEFAULT_LOOKBACK_HOURS = 24;
const DIGEST_MAX_LOOKBACK_DAYS = 7;
const DIGEST_MAX_RECOMMENDATIONS = 4;
const DIGEST_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @typedef {object} DigestItem
 * @property {object} row - the Activity row
 * @property {number} ageDays - whole days since the row was last updated
 * @property {string} [reason] - 'stale' or 'high-todo', for needs-attention items
 */

/**
 * @typedef {object} DigestSelection
 * @property {DigestItem[]} shipped - merged PRs and closed issues updated in the window, newest first
 * @property {DigestItem[]} active - open items updated in the window, newest first
 * @property {DigestItem[]} attention - open items untouched for DIGEST_STALE_DAYS+ days (oldest first),
 *   then high-priority items not started; never duplicates an item in `active`
 * @property {{openIssues: number, openPrs: number, repos: number}} stats - whole-sheet snapshot
 * @property {boolean} quiet - nothing shipped and nothing in motion
 */

/**
 * The digest covers activity since the last *scheduled* digest, so clicking
 * "Send digest now" repeatedly during a demo keeps showing the same content
 * instead of an empty "all quiet". Capped so a missed week does not dump
 * everything; with no previous digest, the last 24 hours.
 * @param {Date|null} lastScheduledAt - time of the last scheduled digest, or null
 * @param {Date} now
 * @returns {Date}
 */
function digestWindowStart(lastScheduledAt, now) {
  const earliest = now.getTime() - DIGEST_MAX_LOOKBACK_DAYS * DIGEST_DAY_MS;
  if (!lastScheduledAt || Number.isNaN(lastScheduledAt.getTime())) {
    return new Date(now.getTime() - DIGEST_DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000);
  }
  return new Date(Math.min(now.getTime(), Math.max(earliest, lastScheduledAt.getTime())));
}

/**
 * @param {object[]} rows - Activity rows (normalized shape; updatedAt as an ISO string)
 * @param {Date} since - start of the window
 * @param {Date} now
 * @returns {DigestSelection}
 */
function selectDigestItems(rows, since, now) {
  const sinceMs = since.getTime();
  const nowMs = now.getTime();
  const staleCutoff = nowMs - DIGEST_STALE_DAYS * DIGEST_DAY_MS;

  const dated = rows
    .map(row => ({ row, ms: Date.parse(row.updatedAt) }))
    .filter(entry => !Number.isNaN(entry.ms));
  const toItem = entry => ({ row: entry.row, ageDays: Math.max(0, Math.floor((nowMs - entry.ms) / DIGEST_DAY_MS)) });
  const newestFirst = (a, b) => b.ms - a.ms;

  const isShipped = row => row.status === 'merged' || (row.type === 'issue' && row.status === 'done');
  const shippedEntries = dated.filter(e => isShipped(e.row) && e.ms >= sinceMs).sort(newestFirst);
  const activeEntries = dated.filter(e => e.row.state === 'open' && e.ms >= sinceMs).sort(newestFirst);
  const activeSet = new Set(activeEntries);

  const openNotActive = dated.filter(e => e.row.state === 'open' && !activeSet.has(e));
  const stale = openNotActive.filter(e => e.ms <= staleCutoff).sort((a, b) => a.ms - b.ms)
    .map(e => ({ ...toItem(e), reason: 'stale' }));
  const staleSet = new Set(stale.map(item => item.row));
  const highTodo = openNotActive
    .filter(e => !staleSet.has(e.row) && e.row.priority === 'high' && e.row.status === 'todo')
    .sort((a, b) => a.ms - b.ms)
    .map(e => ({ ...toItem(e), reason: 'high-todo' }));

  const openRows = rows.filter(row => row.state === 'open');
  return {
    shipped: shippedEntries.map(toItem),
    active: activeEntries.map(toItem),
    attention: stale.concat(highTodo),
    stats: {
      openIssues: openRows.filter(row => row.type === 'issue').length,
      openPrs: openRows.filter(row => row.type === 'pr').length,
      repos: new Set(rows.map(row => row.repo)).size
    },
    quiet: shippedEntries.length === 0 && activeEntries.length === 0
  };
}

/**
 * Concrete suggestions computed straight from the data (no model involved).
 * Used to ground the Gemini prompt, and as the recommendations themselves if
 * Gemini is unavailable, so the section is never filler.
 * @param {DigestSelection} selection
 * @param {object[]} rows - all Activity rows
 * @param {Date} now
 * @returns {string[]} up to DIGEST_MAX_RECOMMENDATIONS lines; may contain **bold** and owner/repo#N references
 */
function deriveRecommendations(selection, rows, now) {
  const recommendations = [];
  const refOf = item => `${item.row.repo}#${item.row.number}`;
  const refsOf = (items, max) => items.slice(0, max).map(refOf).join(', ');
  const plural = (n, one, many) => (n === 1 ? one : many);

  const stale = selection.attention.filter(item => item.reason === 'stale');
  if (stale.length > 0) {
    recommendations.push(
      `**${stale.length} open ${plural(stale.length, 'item has', 'items have')} had no activity for ${DIGEST_STALE_DAYS}+ days.** ` +
      `Start with ${refOf(stale[0])}, quiet for ${stale[0].ageDays} days.`
    );
  }

  const openPrs = rows
    .filter(row => row.type === 'pr' && row.state === 'open' && !Number.isNaN(Date.parse(row.updatedAt)))
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt));
  if (openPrs.length > 0) {
    const age = Math.max(0, Math.floor((now.getTime() - Date.parse(openPrs[0].updatedAt)) / DIGEST_DAY_MS));
    recommendations.push(
      `**${openPrs[0].repo}#${openPrs[0].number} has been open the longest** (${age} ${plural(age, 'day', 'days')} since its last update), so consider reviewing it first.`
    );
  }

  const highTodo = selection.attention.filter(item => item.reason === 'high-todo');
  if (highTodo.length > 0) {
    recommendations.push(
      `**${highTodo.length} high-priority ${plural(highTodo.length, 'item is', 'items are')} not started:** ${refsOf(highTodo, 3)}. Pick one up or lower its priority.`
    );
  }

  const unlabeled = rows.filter(row => row.state === 'open' && row.type === 'issue' && !row.status);
  if (unlabeled.length > 0) {
    recommendations.push(
      `**${unlabeled.length} open ${plural(unlabeled.length, 'issue has', 'issues have')} no status label**, so ${plural(unlabeled.length, 'it is', 'they are')} missing from the board: ` +
      `${unlabeled.slice(0, 3).map(row => `${row.repo}#${row.number}`).join(', ')}.`
    );
  }

  return recommendations.slice(0, DIGEST_MAX_RECOMMENDATIONS);
}

/**
 * Prefer the model's actions when it gave a usable set (2+), otherwise the
 * ones derived from the data.
 * @param {string[]|null|undefined} modelActions
 * @param {string[]} derived
 * @returns {string[]}
 */
function chooseRecommendations(modelActions, derived) {
  const usable = Array.isArray(modelActions) ? modelActions.filter(a => typeof a === 'string' && a.trim()) : [];
  return usable.length >= 2 ? usable.slice(0, DIGEST_MAX_RECOMMENDATIONS) : derived;
}
