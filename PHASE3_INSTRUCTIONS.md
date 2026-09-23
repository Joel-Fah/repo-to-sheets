# Phase 3 — Sheet Service & Sync Orchestration

## Context
Read `CLAUDE.md` and `ARCHITECTURE.md`. Phases 1-2 must be merged first.

## Goal
Real, idempotent data flowing end-to-end: GitHub → Sheet, for both
tracked repos, on both the timer and the manual menu trigger.

## Steps
1. Create an issue: *"Wire Sync orchestration + Sheet writes"*, labeled
   `status: in-progress`, `type: feature`, `priority: high`.
2. Branch: `feat/sync-orchestration`.
3. Implement `upsertActivityRows()` in `src/lib/SheetService.js`:
   - Create the **Activity** tab with headers (per `ARCHITECTURE.md`) if
     it doesn't exist
   - Key existing rows by `(repo, type, number)`; update in place if
     found, append if new
   - Consider clearing/marking rows that no longer appear in the fetch
     (closed long ago and out of scope) — decide and document the
     approach in `docs/features/sheet-service.md`
4. Replace the `syncAll()` stub in `src/gas/Sync.js` with the real
   orchestration: loop `getTrackedRepos()` → `fetchIssues`/
   `fetchPullRequests` → `normalize` → collect all rows →
   `upsertActivityRows` → `writeLogEntry_` with real counts and any
   caught errors (don't let one repo's failure kill the whole run —
   catch per-repo, record in the log, continue).
5. Run `Repo Pulse → Sync now` against the real Sheet. Confirm rows for
   both repos appear correctly and re-running doesn't duplicate rows.
6. Manually close/relabel an issue on one tracked repo, re-run sync,
   confirm the Activity row updates.
7. `docs/features/sheet-service.md` — document the upsert key and the
   stale-row policy decided in step 3.
8. Commit, PR, merge.

## Acceptance criteria
- [ ] Activity tab populates from both real repos
- [ ] Re-running sync does not duplicate rows
- [ ] A manual GitHub-side change is reflected after the next sync
- [ ] Per-repo failure doesn't crash the whole run
- [ ] `docs/features/sheet-service.md` added
- [ ] Landed via issue + PR
