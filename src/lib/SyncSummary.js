/**
 * SyncSummary.js
 * Turns the result of a sync run into the text shown in the "Sync now"
 * popup. Pure — no GAS globals.
 */

const SYNC_SUMMARY_MAX_ERRORS = 5;
const SYNC_SUMMARY_MAX_ERROR_LENGTH = 300;

/**
 * @typedef {object} SyncSummary
 * @property {number} reposTotal - enabled repos in the Settings tab
 * @property {number} reposSynced - repos fetched without a fatal error
 * @property {number} rowsUpserted - Activity rows added or changed
 * @property {string[]} errors - per-repo failures and non-fatal warnings
 */

/**
 * @param {SyncSummary} summary
 * @returns {string} popup text; lists errors (capped) when there are any
 */
function formatSyncSummary(summary) {
  const headline =
    `${summary.reposSynced} of ${summary.reposTotal} repo(s) synced, ` +
    `${summary.rowsUpserted} row(s) added or updated.`;
  if (!summary.errors.length) return `Sync complete. ${headline}`;

  const shown = summary.errors
    .slice(0, SYNC_SUMMARY_MAX_ERRORS)
    .map(message => `• ${truncateSyncError_(message)}`);
  const hidden = summary.errors.length - shown.length;
  if (hidden > 0) shown.push(`• …and ${hidden} more (see the Log tab)`);
  return `Sync finished with problems. ${headline}\n\n${shown.join('\n')}`;
}

/**
 * @param {string} message
 * @returns {string}
 */
function truncateSyncError_(message) {
  const text = String(message);
  return text.length > SYNC_SUMMARY_MAX_ERROR_LENGTH
    ? `${text.slice(0, SYNC_SUMMARY_MAX_ERROR_LENGTH)}…`
    : text;
}
