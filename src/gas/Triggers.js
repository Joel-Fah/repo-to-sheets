/**
 * Triggers.js
 * Installs the time-based trigger and exposes a manual entry point
 * bound to the "Repo Pulse > Sync now" menu item.
 */

const SYNC_INTERVAL_MINUTES = 10;

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
 * Bound to the custom menu. Wraps syncAll() with user-facing feedback.
 */
function manualSyncNow() {
  const ui = SpreadsheetApp.getUi();
  try {
    syncAll();
    ui.alert('Repo Pulse', 'Sync complete.', ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Repo Pulse', `Sync failed: ${err.message}`, ui.ButtonSet.OK);
    throw err;
  }
}
