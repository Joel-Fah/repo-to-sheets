# Phase 2 — GitHub Client & Transformer

## Context
Read `CLAUDE.md` and `ARCHITECTURE.md`. Phase 1 must be merged before
starting this.

## Goal
Real data flowing from GitHub into normalized row objects, fully unit
tested — no Sheet writes yet (that's Phase 3).

## Steps
1. Create an issue: *"Implement GitHubClient + Transformer"*, labeled
   `status: in-progress`, `type: feature`, `priority: high`.
2. Branch: `feat/github-client-transformer`.
3. Implement `fetchIssues` and `fetchPullRequests` in
   `src/lib/GitHubClient.js`:
   - Auth header: `Authorization: token <GITHUB_TOKEN>`
   - Handle pagination (GitHub returns `Link` headers; follow
     `rel="next"` until exhausted, or cap at a sane page limit)
   - Check `X-RateLimit-Remaining` on each response; if below a safety
     threshold (e.g. 50), stop and log a warning instead of continuing
   - Exclude PRs from the issues endpoint response (GitHub's `/issues`
     includes PRs — filter out anything with a `pull_request` key)
4. Implement `normalize()` in `src/lib/Transformer.js` mapping raw
   GitHub objects to the row shape defined in `ARCHITECTURE.md`'s data
   model. Derive `status` from labels (`status: *`) for issues, and from
   `state`/`merged` for PRs. Derive `priority` from `priority: *` labels
   if present, else `''`.
5. Add `test/fixtures/` with 2-3 real sample JSON responses (sanitize
   any sensitive data) from both tracked repos.
6. Write `test/githubClient.test.js` and `test/transformer.test.js`
   using `node --test`, mocking `fetchFn`/GAS globals as needed.
7. Manually verify (temporary throwaway `Logger.log` calls are fine,
   remove before merging) against both real tracked repos via the Apps
   Script editor's execution log.
8. Update `docs/features/github-client.md` describing the
   pagination/rate-limit approach and the label → status/priority
   mapping rules.
9. Commit, PR referencing the issue, merge.

## Acceptance criteria
- [ ] `node --test` passes for both new test files
- [ ] Manually confirmed against real data from both tracked repos
- [ ] Rate-limit handling verified (can be checked by inspecting
      response headers in the log, doesn't need to be forced
      empirically)
- [ ] `docs/features/github-client.md` added
- [ ] Landed via issue + PR
