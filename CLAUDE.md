# CLAUDE.md — Project Rules for Claude Code

## Project
repo-to-sheets is a Google Apps Script project that turns GitHub activity
(issues, PRs) across one or more repos into a live, self-updating Google
Sheet, with an AI-generated summary layer (Gemini) and a Sheets Canvas
board built on top. It also tracks itself — this repo is one of the two
repos it monitors.

## Non-negotiables
1. **No secrets in source, ever.** GitHub PAT and Gemini API key live only
   in Apps Script's PropertiesService, set via the Apps Script editor —
   never hardcoded, never committed, never logged.
2. **Idempotent sync.** Running `syncAll()` twice in a row must not
   duplicate rows. Writes are upserts keyed on `(repo, type, number)`.
3. **Respect rate limits.** Always send an auth header on GitHub calls.
   Check `X-RateLimit-Remaining` and back off / stop gracefully rather
   than failing loudly if it's low.
4. **Respect the 6-minute Apps Script execution limit.** Keep `syncAll()`
   fast; paginate deliberately; don't fetch more than needed.
5. **Pure logic is testable logic.** Anything that isn't a direct GAS API
   call (UrlFetchApp, SpreadsheetApp, PropertiesService) belongs in
   `src/lib/` as a pure function with no GAS globals, so it can run under
   plain Node and be unit tested.

## Code style
- Plain modern JavaScript (ES6+, GAS V8 runtime). No TypeScript, no
  bundler — keep clasp push/pull simple.
- JSDoc on every exported function (params, return type) — GAS has no
  compiler, JSDoc is our only type safety.
- camelCase for variables/functions, PascalCase for files.
- One responsibility per file. If a file's purpose needs an "and" in its
  description, split it.
- GAS shares one global scope across all files — no `import`/`export`.
  Call functions from any file freely, but never rely on top-level
  (outside-a-function) execution order between files.

## Git & tracking conventions (this repo is a demo dataset — keep it clean)
- **Every change goes through a branch + PR**, even solo. No direct
  commits to `main`.
- **Every PR references an issue** (`Closes #12`). If there's no issue
  yet for the work, create one first.
- Branch names: `feat/<short-name>`, `fix/<short-name>`,
  `docs/<short-name>`, `chore/<short-name>`.
- Commits follow **Conventional Commits**: `feat:`, `fix:`, `docs:`,
  `chore:`, `refactor:`, `test:`.
- Labels on every issue: one `status:` (`todo` / `in-progress` /
  `done`), one `priority:` (`high`/`medium`/`low`), one `type:`
  (`feature`/`bugfix`/`chore`). Same schema as the other tracked repo —
  the sheet depends on this consistency.
- Update `status:` labels as work progresses; close the issue instead of
  relabeling `done` once merged.

## Testing
- `test/` uses Node's built-in test runner (`node --test`) — no extra
  dependency.
- Only `src/lib/` is unit tested. `src/gas/` files are thin glue and are
  verified manually via `clasp push` + a real run against the Sheet.
- Fixtures for GitHub API responses live in `test/fixtures/`.

## Definition of done (every phase)
1. Issue exists and is referenced by the PR.
2. Code follows the style rules above.
3. Relevant `src/lib/` logic has a passing test.
4. `docs/` updated (a new file under `features/` for new capability, or
   an entry in `decisions/` for anything architecturally significant).
5. README updated if user-facing behavior changed.
6. Manually verified against the real Sheet with real data before
   merging.
7. Issue closed, PR merged.

## Before writing any code
Read `ARCHITECTURE.md` and the relevant `docs/` page for the feature
being touched, and every file under `.claude/skills/` — these encode
task-specific rules (Apps Script constraints, the git/issue/PR
workflow, GitHub API client patterns) that apply automatically
depending on what you're working on. If a phase instruction file
(`PHASE<N>_INSTRUCTIONS.md`) exists for the current work, follow it
exactly — it already encodes the scope boundaries for that step.
