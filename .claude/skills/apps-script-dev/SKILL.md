---
name: apps-script-dev
description: Use whenever writing, testing, or deploying code for the repo-to-sheets Google Apps Script project — covers the clasp workflow, GAS runtime constraints, secrets handling, and the pure-lib/thin-glue testing split.
---

# Apps Script Development

## When to use this skill
Any time you're about to write or modify a file under `src/gas/` or
`src/lib/`, run `clasp push`/`clasp pull`, or add a Script Property.

## Runtime constraints
- GAS V8 runtime: ES6+ syntax works (arrow functions, classes, template
  literals), but there are **no ES modules** — no `import`/`export`.
  Every file in the Apps Script project shares one global scope; a
  function defined in `src/lib/GitHubClient.js` is callable directly
  from `src/gas/Sync.js` with no import.
- Execution time limit: 6 minutes per run. Keep `syncAll()` lean —
  paginate deliberately, don't over-fetch.
- `appsscript.json` must live directly inside `rootDir` (`src/`) per
  `.clasp.json` — never move it.

## The pure-lib / thin-glue split
- `src/lib/*.js`: pure functions only. No `SpreadsheetApp`,
  `UrlFetchApp`, `PropertiesService`, or any other GAS global — GAS
  globals are only ever passed in as parameters (dependency injection),
  e.g. `fetchIssues(fetchFn, token, owner, repo)`. This is what makes
  these files testable with `node --test` outside of Apps Script.
- `src/gas/*.js`: thin orchestration/glue that calls GAS globals and the
  `src/lib/` functions. Not unit tested — verified manually via
  `clasp push` + running against the real Sheet.

## Secrets
- `GITHUB_TOKEN` and `GEMINI_API_KEY` live only in
  `PropertiesService.getScriptProperties()`. Read them via
  `getSecrets()` in `src/gas/Config.js`. Never hardcode, never log, never
  write them into any committed file.
- If a secret is missing, fail fast with a clear `throw new Error(...)` —
  don't silently continue.

## Deploying
- `clasp push` after any change under `src/`.
- Manual verification happens in the real Sheet (`Repo Pulse → Sync
  now`) — this project has no CI that runs GAS code, so this step isn't
  optional.

## Testing
- `node --test` runs everything under `test/`.
- Only test `src/lib/`. Mock the injected GAS-global parameters with
  plain JS stubs or `test/fixtures/` JSON.
