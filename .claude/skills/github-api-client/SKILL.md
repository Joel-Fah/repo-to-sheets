---
name: github-api-client
description: Use when implementing or modifying anything that calls the GitHub REST API (GitHubClient.js) — covers auth headers, pagination, and rate-limit handling patterns specific to this project.
---

# GitHub API Client Pattern

## Auth
Every request needs: `Authorization: token <GITHUB_TOKEN>` (read from
`getSecrets()`, never hardcoded).

## Pagination
GitHub paginates list endpoints (issues, PRs) via a `Link` response
header. Follow `rel="next"` until it's absent, or cap at a sane page
limit (e.g. 10 pages) to respect the 6-minute execution limit — this
project's repos aren't huge, but don't assume that stays true.

## Rate limits
Check the `X-RateLimit-Remaining` header on every response. If it drops
below a safety threshold (e.g. 50), stop fetching further pages, log a
warning in the sync's error field, and finish gracefully with whatever
data was already fetched — never let a rate-limit hit crash the whole
sync.

## Issues vs PRs
GitHub's `/repos/{owner}/{repo}/issues` endpoint returns **both** issues
and PRs. Filter out anything with a `pull_request` key when fetching
"issues" — use `/repos/{owner}/{repo}/pulls` directly for PRs instead.

## Testability
`fetchIssues`/`fetchPullRequests` take an injected `fetchFn` parameter
so tests can pass a stub instead of `UrlFetchApp.fetch`. Never call GAS
globals directly inside these functions — see the `apps-script-dev`
skill for the pure-lib rule this is part of.
