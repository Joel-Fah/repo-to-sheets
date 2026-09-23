/**
 * Transformer.js
 * Pure functions: raw GitHub JSON -> normalized row objects.
 * No GAS globals — fully unit tested under plain Node.
 *
 * Implemented in PHASE 2 — see PHASE2_INSTRUCTIONS.md.
 */

/**
 * @param {object} rawIssueOrPr
 * @param {string} repo - "owner/repo"
 * @param {'issue'|'pr'} type
 * @returns {{repo:string, type:string, number:number, title:string, state:string,
 *            status:string, priority:string, assignee:string, updatedAt:string, url:string}}
 */
function normalize(rawIssueOrPr, repo, type) {
  throw new Error('Not implemented yet — see PHASE2_INSTRUCTIONS.md');
}
