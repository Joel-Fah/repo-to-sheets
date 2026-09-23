/**
 * Sync.js
 * Orchestrator: for every enabled repo in the Settings tab, fetch issues and
 * PRs, normalize them, upsert everything into the Activity tab, and record
 * the run in the Log tab. One repo failing never stops the others — its
 * error goes in the Log's `errors` column and the run continues.
 */

const SYNC_LOCK_WAIT_MS = 30000;

/**
 * Runs one sync under a script-wide lock, so a timer run and a "Sync now"
 * click can't both read the Activity tab and append the same new row.
 * @returns {{reposTotal: number, reposSynced: number, rowsUpserted: number, errors: string[]}}
 */
function syncAll() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(SYNC_LOCK_WAIT_MS)) {
    throw new Error('Another sync is already running. Try again in a minute.');
  }
  try {
    return runSync_();
  } finally {
    lock.releaseLock();
  }
}

/**
 * @returns {{reposTotal: number, reposSynced: number, rowsUpserted: number, errors: string[]}}
 */
function runSync_() {
  const repos = getTrackedRepos(); // throws a clear error if Settings tab is missing/misconfigured
  const { githubToken } = getSecrets(); // throws a clear error if secrets aren't set — fail fast, fail clearly

  const fetchFn = (url, options) => UrlFetchApp.fetch(url, options);
  const rows = [];
  const errors = [];
  let reposSynced = 0;

  repos.forEach(({ owner, repo }) => {
    const fullName = `${owner}/${repo}`;
    try {
      // Warnings (rate limit low, page cap hit) are non-fatal: keep the partial data, log the note.
      const onWarning = message => errors.push(`${fullName}: ${message}`);
      const issues = fetchIssues(fetchFn, githubToken, owner, repo, { onWarning });
      const prs = fetchPullRequests(fetchFn, githubToken, owner, repo, { onWarning });
      issues.forEach(issue => rows.push(normalize(issue, fullName, 'issue')));
      prs.forEach(pr => rows.push(normalize(pr, fullName, 'pr')));
      reposSynced += 1;
    } catch (err) {
      errors.push(`${fullName}: ${err.message}`);
    }
  });

  let rowsUpserted = 0;
  try {
    const result = upsertActivityRows(SpreadsheetApp.getActiveSpreadsheet(), ACTIVITY_TAB, rows);
    rowsUpserted = result.added + result.updated;
  } catch (err) {
    errors.push(`${ACTIVITY_TAB} write: ${err.message}`);
  }

  writeLogEntry_({
    timestamp: new Date(),
    reposSynced,
    rowsUpserted,
    errors: errors.join(' | ')
  });
  return { reposTotal: repos.length, reposSynced, rowsUpserted, errors };
}

/**
 * @param {{timestamp: Date, reposSynced: number, rowsUpserted: number, errors: string}} entry
 */
function writeLogEntry_(entry) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(LOG_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(LOG_TAB);
    sheet.appendRow(['timestamp', 'reposSynced', 'rowsUpserted', 'errors']);
  }
  sheet.appendRow([entry.timestamp, entry.reposSynced, entry.rowsUpserted, entry.errors]);
}
