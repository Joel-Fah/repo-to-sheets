/**
 * Menu.js
 * Adds a custom menu to the bound Sheet for manual control during
 * demos — no need to wait on the time-based trigger.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Repo Pulse')
    .addItem('Sync now', 'manualSyncNow')
    .addToUi();
}
