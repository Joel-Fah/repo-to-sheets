# GitHub client and transformer

`src/lib/GitHubClient.js` fetches raw issues and pull requests from the
GitHub REST API; `src/lib/Transformer.js` turns each one into a row for the
Activity tab. Both are pure (no GAS globals) and unit tested under
`node --test`.

## Fetching

```js
fetchIssues(fetchFn, token, owner, repo, options)       // -> raw issue objects
fetchPullRequests(fetchFn, token, owner, repo, options) // -> raw PR objects
```

- `fetchFn` follows the `UrlFetchApp.fetch` contract: `(url, options) =>
  response` with `getResponseCode()`, `getHeaders()` and `getContentText()`.
  In GAS pass `(url, opts) => UrlFetchApp.fetch(url, opts)`; tests pass a stub.
- Every request sends `Authorization: token <GITHUB_TOKEN>`, plus
  `Accept: application/vnd.github+json` and a pinned `X-GitHub-Api-Version`.
  `muteHttpExceptions` is set so the client reads the status itself.
- Endpoints: `/repos/{owner}/{repo}/issues` and `/pulls`, with
  `state=all&sort=updated&direction=desc&per_page=100`. Sorting by most
  recently updated means that if the page cap truncates results, it drops
  the *oldest* activity.
- `/issues` also returns PRs. Anything with a `pull_request` key is filtered
  out of `fetchIssues`; PRs come from `/pulls` instead.
- `options` (all optional): `onWarning(message)`, `maxPages` (default 10),
  `rateLimitThreshold` (default 50).

### Pagination

The client follows the `rel="next"` URL in the `Link` header until it is
absent. GitHub's next URLs can switch to a cursor form
(`/repositories/{id}/issues?...&after=...`), so the client follows the URL
as given and never builds page numbers itself. It stops after `maxPages`
pages and calls `onWarning` if more pages remained, so truncation is never
silent. At 100 items per page the default cap is 1000 items per repo per
resource.

### Rate limits

After every response the client reads `X-RateLimit-Remaining`:

- Below `rateLimitThreshold` **and** more pages remain: stop, keep what was
  already fetched, call `onWarning`. (On the last page there is nothing left
  to skip, so it returns normally without a warning.)
- HTTP 403/429 with remaining `0`: treated the same way — a graceful stop
  with a warning, not a throw.
- Any other non-2xx (401 bad token, 404 wrong repo, 5xx...) throws an error
  with the HTTP status and GitHub's `message`. The token is never included.
  `Sync.js` catches this per repo so one repo failing doesn't stop the run.

Header names are matched case-insensitively. This matters in Apps Script:
`UrlFetchApp` returns `x-ratelimit-remaining` in lowercase.

## Transforming

`normalize(raw, 'owner/repo', 'issue' | 'pr')` returns the Activity row:
`repo, type, number, title, state, status, priority, assignee, updatedAt, url`.
Missing optional fields become `''`, never `undefined`.

### `status`

| Item | Rule |
|---|---|
| Issue, closed | `done` — closing is equivalent to `status: done`, and wins over a stale `status: in-progress` label |
| Issue, open | value of its `status: *` label (`todo`, `in-progress`, ...), or `''` if it has none |
| PR, merged | `merged` (`merged_at` set, or `merged === true`) |
| PR, closed, not merged | `closed` |
| PR, open | `open` |

PRs ignore `status:` labels entirely; their lifecycle already models status.
An open issue with no status label gets `''` rather than a guessed `todo`,
so missing labels stay visible in the sheet.

### `priority`

The value of the first `priority: *` label (`high`, `medium`, `low`), or
`''`. Applies to issues and PRs.

### Label parsing

Labels match `^<prefix>:\s*(.+)$`, case-insensitively, and the value is
trimmed and lowercased. `high-priority` or `not-status: todo` do not match.
If an item has several labels with the same prefix, the first wins.

### `assignee`

All assignee logins joined with `, `, falling back to the singular
`assignee` field, or `''`.

## Verified against real data

Run from the Apps Script editor against `Joel-Fah/repo-to-sheets` and
`MENGUEDAVIS/devfest-yaounde` (a throwaway function, not committed):
`HTTP 200` from both endpoints, PRs correctly excluded from issues, rows
normalized as above, a real multi-page `Link` header followed, and both the
page-cap and low-rate-limit stops triggered with real headers.
