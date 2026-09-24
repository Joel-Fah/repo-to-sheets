/**
 * EmailDigest.js
 * Sends the HTML digest email. Thin glue: reads the Sheet, calls the pure
 * pieces in src/lib/ (DigestData, DigestPrompt, GeminiClient,
 * EmailDigestBuilder), and sends with MailApp. Two entry points:
 *   sendDigestNow()         - "Repo Pulse > Send digest now" (menu, for live demos)
 *   sendScheduledDigest()   - the daily time-based trigger (installDigestTrigger)
 * Both send the same digest; only the log entry and the window rule differ.
 * See docs/features/email-digest.md.
 */

const DIGEST_LOCK_WAIT_MS = 30000;
const DIGEST_SENDER_NAME = 'Repo Pulse';

/**
 * Bound to the custom menu. Sends the digest now and reports what happened.
 */
function sendDigestNow() {
  const ui = SpreadsheetApp.getUi();
  try {
    ui.alert('Repo Pulse', formatDigestResult(sendDigest_('manual')), ui.ButtonSet.OK);
  } catch (err) {
    ui.alert('Repo Pulse', `Digest failed: ${err.message}`, ui.ButtonSet.OK);
    throw err;
  }
}

/**
 * Handler for the daily trigger installed by installDigestTrigger().
 */
function sendScheduledDigest() {
  sendDigest_('scheduled');
}

/**
 * Sends one digest under the script lock, so a click and the daily trigger
 * (or a sync) can't run at once and send twice.
 * @param {'manual'|'scheduled'} mode
 * @returns {DigestResult}
 */
function sendDigest_(mode) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(DIGEST_LOCK_WAIT_MS)) {
    throw new Error('A sync or another digest is running. Try again in a minute.');
  }
  try {
    return runDigest_(mode);
  } finally {
    lock.releaseLock();
  }
}

/**
 * @param {'manual'|'scheduled'} mode
 * @returns {DigestResult}
 */
function runDigest_(mode) {
  const { valid: recipients, invalid } = parseRecipients(getDigestRecipientsText());
  if (recipients.length === 0) {
    throw new Error(`No recipients. Add a row to the ${SETTINGS_TAB} tab: recipients | you@example.com, teammate@example.com`);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const rows = readActivityRows_(ss);
  if (rows.length === 0) {
    throw new Error(`The ${ACTIVITY_TAB} tab has no data yet. Run Repo Pulse > Sync now first.`);
  }

  const now = new Date();
  const since = digestWindowStart(readLastScheduledDigestTime_(), now);
  const selection = selectDigestItems(rows, since, now);

  // Data-derived actions are always computed: they ground the Gemini prompt and are
  // the fallback if Gemini is unavailable. An all-quiet digest makes no Gemini call.
  const derived = deriveRecommendations(selection, rows, now);
  let summary = '';
  let recommendations = derived;
  let usedGemini = false;
  const warnings = [];
  if (!selection.quiet) {
    try {
      const { geminiApiKey } = getSecrets();
      const insights = generateDigestInsights(
        (url, options) => UrlFetchApp.fetch(url, options),
        geminiApiKey,
        buildDigestPrompt(selection, derived, since, now),
        { sleepFn: ms => Utilities.sleep(ms) }
      );
      summary = insights.summary;
      recommendations = chooseRecommendations(insights.actions, derived);
      usedGemini = true;
    } catch (err) {
      warnings.push(`Gemini: ${err.message}`);
    }
  }

  const tz = Session.getScriptTimeZone();
  const { subject, htmlBody, plainTextBody } = buildDigestHtml(rows, recommendations, {
    now,
    since,
    dateLabel: Utilities.formatDate(now, tz, 'EEEE d MMMM'),
    dateShort: Utilities.formatDate(now, tz, 'EEE d MMM'),
    sinceLabel: Utilities.formatDate(since, tz, 'EEE d MMM, HH:mm'),
    sheetUrl: ss.getUrl(),
    summary,
    mode
  });

  MailApp.sendEmail({
    to: recipients.join(','),
    subject,
    body: plainTextBody, // plain-text alternative for clients and spam filters that want one
    htmlBody,
    name: DIGEST_SENDER_NAME
  });
  writeDigestLogEntry_({ timestamp: now, recipients: recipients.join(', '), subject, trigger: mode });

  return { subject, recipients, invalid, quiet: selection.quiet, usedGemini, warnings };
}

/**
 * @param {Spreadsheet} ss
 * @returns {object[]} Activity rows as objects (updatedAt as an ISO string), skipping blank rows
 */
function readActivityRows_(ss) {
  const sheet = ss.getSheetByName(ACTIVITY_TAB);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet
    .getRange(2, 1, sheet.getLastRow() - 1, ACTIVITY_COLUMNS.length)
    .getValues()
    .map(activityValuesToRow_)
    .filter(row => String(row.repo) !== '');
}

/**
 * @returns {Date|null} time of the most recent *scheduled* digest in the DigestLog, or null.
 *   Manual sends are ignored so repeated "Send digest now" clicks keep showing the same window.
 */
function readLastScheduledDigestTime_() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DIGEST_LOG_TAB);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues();
  for (let i = values.length - 1; i >= 0; i -= 1) {
    const [timestamp, , , trigger] = values[i];
    if (trigger === 'scheduled' && Object.prototype.toString.call(timestamp) === '[object Date]') return timestamp;
  }
  return null;
}

/**
 * @param {{timestamp: Date, recipients: string, subject: string, trigger: string}} entry
 */
function writeDigestLogEntry_(entry) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(DIGEST_LOG_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(DIGEST_LOG_TAB);
    sheet.appendRow(['timestamp', 'recipients', 'subject', 'trigger']);
  }
  sheet.appendRow([entry.timestamp, escapeSheetText_(entry.recipients), escapeSheetText_(entry.subject), entry.trigger]);
}
