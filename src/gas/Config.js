/**
 * Config.js
 * Reads runtime configuration: tracked repos from the "Settings" sheet
 * tab, and secrets from Script Properties. Never hardcode secrets here.
 */

const SETTINGS_TAB = 'Settings';
const ACTIVITY_TAB = 'Activity';
const LOG_TAB = 'Log';
const INSIGHTS_TAB = 'Insights';

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
