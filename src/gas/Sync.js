/**
 * Sync.js
 * Orchestrator. PHASE 1: stub that proves Config + Sheet + Log
 * plumbing works end-to-end. PHASE 2+: replace the stub body with real
 * GitHubClient -> Transformer -> SheetService -> GeminiClient calls.
 */

function syncAll() {
  const repos = getTrackedRepos(); // throws a clear error if Settings tab is missing/misconfigured
  getSecrets(); // throws a clear error if secrets aren't set — fail fast, fail clearly

  // TODO(PHASE2): replace with real fetch + transform + write per repo
  writeLogEntry_({
    timestamp: new Date(),
    reposSynced: repos.length,
    rowsUpserted: 0,
    errors: ''
  });
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
