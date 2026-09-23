# Tests

Run with `node --test`.

Only `src/lib/*.js` is unit tested (pure logic, no GAS globals).
`src/gas/*.js` is thin glue code verified manually via `clasp push` + a
real run against the Sheet.

Fixtures for GitHub API responses live in `test/fixtures/`.

Test files land here as each `src/lib/` module gets implemented (PHASE 2
adds `transformer.test.js` and `githubClient.test.js`).
