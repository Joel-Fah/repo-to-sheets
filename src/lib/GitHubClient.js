/**
 * GitHubClient.js
 * Thin wrapper over the GitHub REST API. Pure-ish: takes an injected
 * fetch function so this can be tested under plain Node without GAS
 * globals.
 *
 * Implemented in PHASE 2 — see PHASE2_INSTRUCTIONS.md.
 */

/**
 * @param {function} fetchFn - e.g. UrlFetchApp.fetch in GAS, or fetch in tests
 * @param {string} token - GitHub personal access token
 * @param {string} owner
 * @param {string} repo
 * @returns {object[]} raw GitHub issue objects (PRs excluded)
 */
function fetchIssues(fetchFn, token, owner, repo) {
  throw new Error('Not implemented yet — see PHASE2_INSTRUCTIONS.md');
}

/**
 * @param {function} fetchFn
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @returns {object[]} raw GitHub pull request objects
 */
function fetchPullRequests(fetchFn, token, owner, repo) {
  throw new Error('Not implemented yet — see PHASE2_INSTRUCTIONS.md');
}
