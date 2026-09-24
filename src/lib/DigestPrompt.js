/**
 * DigestPrompt.js
 * Builds the compact plain-text data block sent to Gemini for the email
 * digest (one call returns both the headline and the recommended actions).
 * Pure — no GAS globals. Reuses shortTitle_ from InsightPrompt.js.
 */

const DIGEST_PROMPT_MAX_PER_SECTION = 8;

/**
 * @param {DigestSelection} selection
 * @param {string[]} derivedRecommendations - facts already computed from the data (see deriveRecommendations)
 * @param {Date} since
 * @param {Date} now
 * @returns {string} the prompt text
 */
function buildDigestPrompt(selection, derivedRecommendations, since, now) {
  const lines = [
    `Digest window: ${since.toISOString()} to ${now.toISOString()}.`,
    `Counts: ${selection.shipped.length} shipped, ${selection.active.length} in motion, ` +
      `${selection.attention.length} needing attention; ${selection.stats.openIssues} open issues and ` +
      `${selection.stats.openPrs} open pull requests across ${selection.stats.repos} repos.`
  ];

  const addSection = (title, items, describe) => {
    lines.push('', `${title}:`);
    if (items.length === 0) {
      lines.push('- none');
      return;
    }
    items.slice(0, DIGEST_PROMPT_MAX_PER_SECTION).forEach(item => lines.push(`- ${describe(item)}`));
    if (items.length > DIGEST_PROMPT_MAX_PER_SECTION) {
      lines.push(`- ...and ${items.length - DIGEST_PROMPT_MAX_PER_SECTION} more not listed`);
    }
  };

  const base = item => `${item.row.type} ${item.row.repo}#${item.row.number} "${shortTitle_(item.row.title)}"`;
  const priorityOf = item => `priority ${item.row.priority || 'none'}`;
  addSection('Shipped (merged PRs and closed issues)', selection.shipped,
    item => `${base(item)}: ${item.row.status}, ${priorityOf(item)}`);
  addSection('In motion (open items updated in the window)', selection.active,
    item => `${base(item)}: ${item.row.status || 'no status'}, ${priorityOf(item)}`);
  addSection('Needs attention', selection.attention,
    item => `${base(item)}: ${item.reason === 'stale' ? `no activity for ${item.ageDays} days` : 'high priority, not started'}, ${priorityOf(item)}`);

  lines.push('', 'Facts already computed from the data (build on these; do not add facts that are not in this message):');
  if (derivedRecommendations.length === 0) lines.push('- none');
  derivedRecommendations.forEach(text => lines.push(`- ${text.replace(/\*\*/g, '')}`));
  return lines.join('\n');
}
