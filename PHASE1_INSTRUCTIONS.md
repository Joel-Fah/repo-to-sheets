# Phase 1 — Bootstrap & Config Plumbing

## Context
Read `CLAUDE.md` and `ARCHITECTURE.md` first. **Complete `SETUP.md`
before starting this phase** — several steps below assume clasp is
already logged in and the Google Sheet + Apps Script project already
exist.

The initial project scaffold has already been placed in this repo
(folders, stub files, docs, LICENSE, CONTRIBUTING, issue/PR templates),
but **nothing has been committed to git yet**. Your first job is to turn
this scaffold into the project's first properly tracked change.

Each step is tagged **[YOU]** (do it yourself, in a browser) or
**[CLAUDE CODE]** (hand it to Claude Code in the terminal).

## Goal
Get a minimal but real end-to-end path working: opening the bound Google
Sheet, clicking **Repo Pulse → Sync now**, and seeing a row appear in a
**Log** tab — proving Config, PropertiesService, Menu, Triggers, and
Sync are wired correctly, before any real GitHub/Gemini logic exists.

## Steps
1. **[CLAUDE CODE]** Create a GitHub issue: *"Bootstrap Apps Script
   project scaffold"*, labeled `status: in-progress`, `type: chore`,
   `priority: high`. (Requires the optional `gh auth login --with-token`
   step in `SETUP.md`; otherwise do this one yourself in the GitHub UI.)
2. **[CLAUDE CODE]** Branch: `chore/bootstrap-scaffold`.
3. **[YOU]** In the Google Sheet created during `SETUP.md`, add a
   **Settings** tab with header row `owner | repo | enabled`, and one
   row for `<your-username>/repo-to-sheets` with `enabled = TRUE`. Add a
   second row for `MENGUEDAVIS/devfest-yaounde` once its token access is
   confirmed — the code never assumes a fixed repo count, so this is a
   safe row to add later without touching anything.
4. **[CLAUDE CODE]** `clasp clone <scriptId>` using the Script ID you
   copied in `SETUP.md`, to link this local repo to that Apps Script
   project. This writes `.clasp.json` locally (gitignored — never
   committed).
5. **[YOU]** Confirm Script Properties `GITHUB_TOKEN` and
   `GEMINI_API_KEY` are set (done in `SETUP.md` step 5). Never commit
   these anywhere.
6. **[CLAUDE CODE]** `clasp push`.
7. **[YOU]** Open the Sheet, reload it, confirm the **Repo Pulse** menu
   appears, and run **Sync now**. The first click will trigger Google's
   one-time authorization screen (`SETUP.md` step 6) — click through it.
   Confirm:
   - No errors (Config correctly reads Settings + secrets)
   - A **Log** tab is created with one row
8. **[YOU]** In the Apps Script editor, run `installSyncTrigger()` once
   (via the editor's function selector + Run button) to install the
   recurring trigger.
9. **[CLAUDE CODE]** Commit the scaffold in logical chunks (Conventional
   Commits), push the branch, open a PR referencing the issue, fill in
   the PR template, merge.
10. **[CLAUDE CODE]** Update the README's "Status" section to reflect
    that bootstrap is complete.

## Acceptance criteria
- [ ] Settings, Log tabs exist in the real Sheet
- [ ] Secrets are set via Script Properties only
- [ ] `Repo Pulse → Sync now` runs without error and writes a Log row
- [ ] Recurring trigger installed
- [ ] Work landed via issue + branch + PR, properly labeled
- [ ] README status updated

## Out of scope (do not implement yet)
GitHubClient, Transformer, SheetService, GeminiClient logic — these
throw `Not implemented` on purpose. That's Phase 2+.
