/**
 * Triggers.js
 * Installs the time-based trigger and exposes a manual entry point
 * bound to the "Repo Pulse > Sync now" menu item.
 */

const SYNC_INTERVAL_MINUTES = 10;
const DIGEST_TRIGGER_HOUR = 8; // Apps Script runs it some time within this hour, in the script's time zone

/**
 * Run once manually (from the Apps Script editor) to install the
 * recurring trigger.
 */
function installSyncTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'syncAll') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('syncAll')
    .timeBased()
    .everyMinutes(SYNC_INTERVAL_MINUTES)
    .create();
}

/**
 * Run once manually (from the Apps Script editor) to install the daily
 * digest trigger. Separate from the sync trigger, so re-running either
 * installer never touches the other.
 */
function installDigestTrigger() {
  ScriptApp.getProjectTriggers().forEach(t => {
    if (t.getHandlerFunction() === 'sendScheduledDigest') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('sendScheduledDigest')
    .timeBased()
    .everyDays(1)
    .atHour(DIGEST_TRIGGER_HOUR)
    .create();
}

/**
 * Bound to the custom menu. Wraps syncAll() with user-facing feedback,
 * including any per-repo errors (the same ones recorded in the Log tab).
 */
function manualSyncNow() {
  const ui = SpreadsheetApp.getUi();
  try {
    const summary = syncAll();
    ui.alert('Repo Pulse', formatSyncSummary(summary), ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Repo Pulse', `Sync failed: ${err.message}`, ui.ButtonSet.OK);
    throw err;
  }
}
