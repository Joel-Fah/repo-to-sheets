/**
 * Transformer.js
 * Pure functions: raw GitHub JSON -> normalized row objects.
 * No GAS globals — fully unit tested under plain Node.
 *
 * See docs/features/github-client.md for the label -> status/priority
 * mapping rules.
 */

/**
 * @param {object} rawIssueOrPr - one item from GitHub's issues or pulls list endpoint
 * @param {string} repo - "owner/repo"
 * @param {'issue'|'pr'} type
 * @returns {{repo:string, type:string, number:number, title:string, state:string,
 *            status:string, priority:string, assignee:string, updatedAt:string, url:string}}
 */
function normalize(rawIssueOrPr, repo, type) {
  if (!rawIssueOrPr || typeof rawIssueOrPr !== 'object') {
    throw new Error('normalize: a raw GitHub issue/PR object is required');
  }
  if (type !== 'issue' && type !== 'pr') {
    throw new Error(`normalize: unknown type "${type}" (expected "issue" or "pr")`);
  }
  return {
    repo,
    type,
    number: rawIssueOrPr.number,
    title: rawIssueOrPr.title || '',
    state: rawIssueOrPr.state || '',
    status: deriveStatus_(rawIssueOrPr, type),
    priority: labelValue_(rawIssueOrPr.labels, 'priority'),
    assignee: assigneeLogins_(rawIssueOrPr),
    updatedAt: rawIssueOrPr.updated_at || '',
    url: rawIssueOrPr.html_url || ''
  };
}

/**
 * Issues: a closed issue is `done` (closing is equivalent to the done label,
 * and wins over a stale `status: in-progress`); an open issue takes its
 * `status: *` label, or '' if it has none. PRs: `merged`, `closed`, or `open`.
 * @param {object} raw
 * @param {'issue'|'pr'} type
 * @returns {string}
 */
function deriveStatus_(raw, type) {
  if (type === 'pr') {
    // The list endpoint has merged_at; only the single-PR endpoint has `merged`.
    if (raw.merged === true || raw.merged_at) return 'merged';
    return raw.state === 'closed' ? 'closed' : 'open';
  }
  if (raw.state === 'closed') return 'done';
  return labelValue_(raw.labels, 'status');
}

/**
 * @param {(object|string)[]} labels - GitHub label objects (or plain names)
 * @param {string} prefix - label namespace, e.g. 'status' matches "status: in-progress"
 * @returns {string} the lowercased value of the first matching label, or ''
 */
function labelValue_(labels, prefix) {
  const pattern = new RegExp(`^${prefix}:\\s*(.+)$`, 'i');
  for (const label of labels || []) {
    const name = typeof label === 'string' ? label : label && label.name;
    const match = pattern.exec(String(name || '').trim());
    if (match) return match[1].trim().toLowerCase();
  }
  return '';
}

/**
 * @param {object} raw
 * @returns {string} comma-separated assignee logins, or ''
 */
function assigneeLogins_(raw) {
  const assignees = raw.assignees && raw.assignees.length ? raw.assignees : [raw.assignee];
  return assignees
    .filter(a => a && a.login)
    .map(a => a.login)
    .join(', ');
}
