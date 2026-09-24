/**
 * DigestRecipients.js
 * Parses the rows of the Recipients tab (`name | email | enabled`). Pure — no GAS globals.
 */

// Conservative on purpose: letters, digits and . _ % + - in the local part, a dotted domain after the @.
// Anything else (colons, quotes, angle brackets, spaces, commas...) is reported as invalid instead of being sent to.
const DIGEST_EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const DIGEST_MAX_RECIPIENTS = 20;
const DIGEST_MAX_NAME_LENGTH = 60;

/**
 * @param {any[][]} rows - the data rows of the Recipients tab (header excluded), columns name | email | enabled
 * @returns {{recipients: {name: string, email: string}[], invalid: string[], disabled: number}}
 *   `recipients`: enabled rows with a valid address, de-duplicated by address (case-insensitive), at most 20.
 *   `invalid`: enabled rows whose address is missing or not an email, as "row N: text" (N counts the header as row 1).
 *   `disabled`: rows switched off (enabled is not TRUE). Blank rows are ignored.
 */
function parseRecipientRows(rows) {
  const recipients = [];
  const invalid = [];
  const seen = new Set();
  let disabled = 0;

  rows.forEach((row, index) => {
    const name = cleanRecipientName_(row[0]);
    const email = String(row[1] === null || row[1] === undefined ? '' : row[1]).trim();
    if (!name && !email) return; // a blank row

    const enabled = String(row[2] === null || row[2] === undefined ? '' : row[2]).trim().toUpperCase() === 'TRUE';
    if (!enabled) {
      disabled += 1;
      return;
    }
    if (!DIGEST_EMAIL_PATTERN.test(email)) {
      invalid.push(`row ${index + 2}: ${email || '(no email)'}`);
      return;
    }
    const key = email.toLowerCase();
    if (seen.has(key) || recipients.length >= DIGEST_MAX_RECIPIENTS) return;
    seen.add(key);
    recipients.push({ name, email });
  });
  return { recipients, invalid, disabled };
}

/**
 * @param {any} value
 * @returns {string} a display name with control characters removed, whitespace collapsed, and a length cap
 */
function cleanRecipientName_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/[\u0000-\u001F\u007F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, DIGEST_MAX_NAME_LENGTH);
}
