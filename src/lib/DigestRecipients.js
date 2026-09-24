/**
 * DigestRecipients.js
 * Parses the recipients cell from the Settings tab. Pure — no GAS globals.
 */

// Conservative on purpose: letters, digits and . _ % + - in the local part, a dotted domain after the @.
// Anything else (colons, quotes, angle brackets, ...) is reported as invalid instead of being sent to.
const DIGEST_EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const DIGEST_MAX_RECIPIENTS = 20;

/**
 * @param {any} text - the recipients cell: emails separated by commas, semicolons, spaces or newlines
 * @returns {{valid: string[], invalid: string[]}} de-duplicated (case-insensitive) valid addresses, and the entries that were not emails
 */
function parseRecipients(text) {
  const valid = [];
  const invalid = [];
  const seen = new Set();
  String(text === null || text === undefined ? '' : text)
    .split(/[,;\s]+/)
    .map(entry => entry.trim())
    .filter(Boolean)
    .forEach(entry => {
      if (!DIGEST_EMAIL_PATTERN.test(entry)) {
        invalid.push(entry);
      } else if (!seen.has(entry.toLowerCase()) && valid.length < DIGEST_MAX_RECIPIENTS) {
        seen.add(entry.toLowerCase());
        valid.push(entry);
      }
    });
  return { valid, invalid };
}
