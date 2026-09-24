/**
 * InsightFormat.js
 * Turns the model's summary text into rich-text instructions (bold ranges and
 * links) for the Insights tab. Pure — no GAS globals.
 *
 * The model is only ever asked to emit `**bold**` markers and owner/repo#N
 * references. Link URLs are never taken from model output: they come from
 * GitHub's own `html_url` for items we actually fetched, so a hallucinated or
 * injected reference simply stays plain text.
 */

const INSIGHT_REF_PATTERN = /([A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+)#(\d+)/g;

/**
 * @typedef {object} FormattedInsight
 * @property {string} text - the summary with ** markers removed
 * @property {{start: number, end: number}[]} bold - character ranges to bold (end exclusive)
 * @property {{start: number, end: number, url: string}[]} links - character ranges to link (end exclusive)
 */

/**
 * @param {string} summary - model output, possibly containing **bold** and owner/repo#N references
 * @param {object[]} knownItems - normalized rows ({repo, number, url}); only these can become links
 * @returns {FormattedInsight}
 */
function formatInsightSummary(summary, knownItems) {
  const urlByRef = new Map();
  (knownItems || []).forEach(item => {
    if (item.url) urlByRef.set(insightRefKey_(item.repo, item.number), item.url);
  });

  // Splitting on ** alternates plain / bold / plain ...; an unclosed marker bolds to the end.
  let text = '';
  const bold = [];
  String(summary).split('**').forEach((piece, index) => {
    const start = text.length;
    text += piece;
    if (index % 2 === 1 && piece.length > 0) bold.push({ start, end: text.length });
  });

  const links = [];
  let match;
  INSIGHT_REF_PATTERN.lastIndex = 0;
  while ((match = INSIGHT_REF_PATTERN.exec(text)) !== null) {
    const url = urlByRef.get(insightRefKey_(match[1], match[2]));
    if (url) links.push({ start: match.index, end: match.index + match[0].length, url });
  }
  return { text, bold, links };
}

/**
 * @param {string} repo
 * @param {string|number} number
 * @returns {string} case-insensitive key: GitHub repo names are case-insensitive
 */
function insightRefKey_(repo, number) {
  return `${String(repo).toLowerCase()}#${String(number)}`;
}
