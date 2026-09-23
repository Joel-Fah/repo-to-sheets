/**
 * GitHubClient.js
 * Thin wrapper over the GitHub REST API. Pure-ish: takes an injected
 * fetch function so this can be tested under plain Node without GAS
 * globals.
 *
 * `fetchFn` follows the UrlFetchApp.fetch contract: (url, options) =>
 * response, where response exposes getResponseCode(), getHeaders() and
 * getContentText(). In GAS, pass `(url, opts) => UrlFetchApp.fetch(url, opts)`.
 *
 * See docs/features/github-client.md for the pagination and rate-limit
 * approach.
 */

const GITHUB_API_BASE = 'https://api.github.com';
const GITHUB_PER_PAGE = 100;
const GITHUB_MAX_PAGES = 10;
const GITHUB_RATE_LIMIT_THRESHOLD = 50;

/**
 * @typedef {object} FetchOptions
 * @property {function(string): void} [onWarning] - called with a message when fetching stops early (rate limit, page cap)
 * @property {number} [maxPages] - page cap per call (default 10)
 * @property {number} [rateLimitThreshold] - stop when X-RateLimit-Remaining drops below this (default 50)
 */

/**
 * @param {function} fetchFn - e.g. a UrlFetchApp.fetch wrapper in GAS, or a stub in tests
 * @param {string} token - GitHub personal access token
 * @param {string} owner
 * @param {string} repo
 * @param {FetchOptions} [options]
 * @returns {object[]} raw GitHub issue objects (PRs excluded), most recently updated first
 */
function fetchIssues(fetchFn, token, owner, repo, options) {
  const items = fetchAllPages_(fetchFn, token, githubListUrl_(owner, repo, 'issues'), options);
  // GitHub's /issues endpoint returns PRs too; only PRs carry a pull_request key.
  return items.filter(item => !item.pull_request);
}

/**
 * @param {function} fetchFn
 * @param {string} token
 * @param {string} owner
 * @param {string} repo
 * @param {FetchOptions} [options]
 * @returns {object[]} raw GitHub pull request objects, most recently updated first
 */
function fetchPullRequests(fetchFn, token, owner, repo, options) {
  return fetchAllPages_(fetchFn, token, githubListUrl_(owner, repo, 'pulls'), options);
}

/**
 * @param {string} owner
 * @param {string} repo
 * @param {'issues'|'pulls'} resource
 * @returns {string}
 */
function githubListUrl_(owner, repo, resource) {
  return `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/${resource}` +
    `?state=all&sort=updated&direction=desc&per_page=${GITHUB_PER_PAGE}`;
}

/**
 * Follows rel="next" Link headers, stopping early (and warning) on a low
 * rate limit or when the page cap is hit. Throws on any other non-2xx.
 * @param {function} fetchFn
 * @param {string} token
 * @param {string} firstUrl
 * @param {FetchOptions} [options]
 * @returns {object[]}
 */
function fetchAllPages_(fetchFn, token, firstUrl, options) {
  const opts = options || {};
  const maxPages = opts.maxPages || GITHUB_MAX_PAGES;
  const threshold = opts.rateLimitThreshold === undefined ? GITHUB_RATE_LIMIT_THRESHOLD : opts.rateLimitThreshold;
  const warn = opts.onWarning || function () {};
  const requestOptions = {
    method: 'get',
    muteHttpExceptions: true, // let us read the status/body instead of UrlFetchApp throwing
    headers: {
      Authorization: `token ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  };

  const items = [];
  let url = firstUrl;
  let page = 0;
  while (url) {
    page += 1;
    const response = fetchFn(url, requestOptions);
    const status = response.getResponseCode();
    const headers = response.getHeaders();
    const remaining = parseRateLimitRemaining_(headers);

    if ((status === 403 || status === 429) && remaining === 0) {
      warn(`GitHub rate limit exhausted; stopped after ${items.length} items (${url})`);
      return items;
    }
    if (status < 200 || status >= 300) {
      throw new Error(`GitHub API request failed (HTTP ${status}) for ${url}: ${githubErrorMessage_(response)}`);
    }

    const body = JSON.parse(response.getContentText());
    if (!Array.isArray(body)) {
      throw new Error(`GitHub API returned a non-list response for ${url}`);
    }
    items.push(...body);

    const next = parseNextLink_(getHeader_(headers, 'Link'));
    if (next && remaining !== null && remaining < threshold) {
      warn(`GitHub rate limit low (${remaining} remaining, threshold ${threshold}); stopped after ${items.length} items (${url})`);
      return items;
    }
    if (next && page >= maxPages) {
      warn(`Page cap of ${maxPages} reached; results truncated at ${items.length} items (${url})`);
      return items;
    }
    url = next;
  }
  return items;
}

/**
 * Case-insensitive header lookup (header casing differs between runtimes).
 * @param {object} headers
 * @param {string} name
 * @returns {string|undefined}
 */
function getHeader_(headers, name) {
  if (!headers) return undefined;
  const wanted = name.toLowerCase();
  const key = Object.keys(headers).find(k => k.toLowerCase() === wanted);
  return key === undefined ? undefined : headers[key];
}

/**
 * @param {object} headers
 * @returns {number|null} X-RateLimit-Remaining as a number, or null if absent/unparseable
 */
function parseRateLimitRemaining_(headers) {
  const value = parseInt(getHeader_(headers, 'X-RateLimit-Remaining'), 10);
  return Number.isNaN(value) ? null : value;
}

/**
 * @param {string|undefined} linkHeader - e.g. '<https://...?page=2>; rel="next", <...>; rel="last"'
 * @returns {string|null} the rel="next" URL, or null if there is none
 */
function parseNextLink_(linkHeader) {
  if (!linkHeader) return null;
  const linkPattern = /<([^>]+)>([^<]*)/g;
  let match;
  while ((match = linkPattern.exec(String(linkHeader))) !== null) {
    if (/rel="?next"?/.test(match[2])) return match[1];
  }
  return null;
}

/**
 * @param {{getContentText: function}} response
 * @returns {string} GitHub's `message` field if the body is JSON, else a fallback
 */
function githubErrorMessage_(response) {
  try {
    const parsed = JSON.parse(response.getContentText());
    if (parsed && parsed.message) return String(parsed.message);
  } catch (err) {
    // body wasn't JSON; fall through
  }
  return 'no error message in response body';
}
