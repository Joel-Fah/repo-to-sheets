/**
 * Config.js
 * Reads runtime configuration: tracked repos from the "Settings" sheet
 * tab, and secrets from Script Properties. Never hardcode secrets here.
 */

const SETTINGS_TAB = 'Settings';
const ACTIVITY_TAB = 'Activity';
const LOG_TAB = 'Log';
const INSIGHTS_TAB = 'Insights';
const DIGEST_LOG_TAB = 'DigestLog';

/**
 * @returns {{owner: string, repo: string}[]} repos marked enabled in the Settings tab
 */
function getTrackedRepos() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_TAB);
  if (!sheet) {
    throw new Error(`Missing "${SETTINGS_TAB}" tab. Create it with columns: owner | repo | enabled`);
  }
  const rows = sheet.getDataRange().getValues();
  const [, ...data] = rows; // drop header row
  return data
    .filter(row => String(row[2]).toUpperCase() === 'TRUE')
    .map(row => ({ owner: String(row[0]).trim(), repo: String(row[1]).trim() }));
}

/**
 * The digest's recipients live in the Settings tab as one extra row:
 * `recipients | a@x.com, b@y.org` (column A = "recipients", column B = the list).
 * It has no TRUE in column C, so getTrackedRepos() ignores it.
 * @returns {string} the raw cell text, or '' if there is no recipients row
 */
function getDigestRecipientsText() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_TAB);
  if (!sheet) {
    throw new Error(`Missing "${SETTINGS_TAB}" tab. Create it with columns: owner | repo | enabled`);
  }
  const row = sheet.getDataRange().getValues().find(values => String(values[0]).trim().toLowerCase() === 'recipients');
  return row ? String(row[1]) : '';
}

/**
 * @returns {{githubToken: string, geminiApiKey: string}}
 */
function getSecrets() {
  const props = PropertiesService.getScriptProperties();
  const githubToken = props.getProperty('GITHUB_TOKEN');
  const geminiApiKey = props.getProperty('GEMINI_API_KEY');
  if (!githubToken) {
    throw new Error('GITHUB_TOKEN is not set. Set it under Project Settings > Script Properties.');
  }
  if (!geminiApiKey) {
    throw new Error('GEMINI_API_KEY is not set. Set it under Project Settings > Script Properties.');
  }
  return { githubToken, geminiApiKey };
}
