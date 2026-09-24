# Sheet service and sync orchestration

`src/lib/SheetService.js` upserts normalized rows into the **Activity** tab.
`src/gas/Sync.js` runs the whole pipeline (Settings → GitHub → Transformer →
Activity → Log). `src/lib/SyncSummary.js` formats the "Sync now" popup.

## Activity tab

Created on first run, with this header row (the columns of `normalize()`):

`repo | type | number | title | state | status | priority | assignee | updatedAt | url`

If the tab exists but its header row was changed, the upsert throws a clear
error and writes nothing, rather than guessing which column is which.
Columns to the right of `url` are never touched, so notes or formulas added
there survive.

## Upsert key and idempotency

A row is identified by **`(repo, type, number)`**. The repo is compared
case-insensitively (GitHub treats repo names that way, so changing the case
in Settings does not duplicate rows); `type` is `issue` or `pr`, so issue #7
and PR #7 in the same repo are different rows.

`upsertActivityRows(spreadsheet, tabName, rows)`:

1. Reads the whole data area once.
2. `planActivityUpsert()` (pure, unit tested) matches each incoming row to an
   existing row by key: new keys are appended, changed rows are replaced **in
   place** (their position never moves), identical rows are left alone.
3. Writes the data area back once, and only if something was added or
   changed. A second run over unchanged data performs no writes.

Two API calls per run regardless of size, which keeps `syncAll()` far below
the 6-minute limit. If the same key appears twice in one batch (possible when
items shift between pages while paginating), the last one wins.

It returns `{added, updated, unchanged, changes}`. The Log's `rowsUpserted` is
`added + updated`, so a run that changed nothing shows `0`. `changes` lists each
added row and each changed row (with its previous values), which is what the
[Insights summary](gemini-insights.md) is built from.

## Stale-row policy: never delete, never mark

Rows already in the sheet but absent from a fetch are **left exactly as they
are**. Reasons:

- Absence does not mean "gone". Fetches are newest-first and capped at 1000
  items per resource, and they stop early when the rate limit runs low — so
  a healthy repo can legitimately return only part of its history. Deleting
  or marking on absence would wipe good data after any partial run.
- A repo disabled in Settings, or one whose fetch failed, should not lose
  its rows.
- It keeps history, so the sheet works as a record and not just a mirror.

Consequence: an issue deleted or transferred on GitHub stays in the sheet
with its last known state. That is rare; remove such a row by hand if it
matters.

**Moving or renaming a tracked repo is the big case.** The key includes the repo
name, so pointing Settings at the new name (e.g. `MENGUEDAVIS/devfest-yaounde` →
`gdgyaounde/devfest-yaounde`) adds every item again under the new name, and the
old rows stay. This happened live (41 duplicates). Delete the old-name rows by
hand after switching (filter the `repo` column, delete the rows). Following a
repo across renames automatically would mean keying on GitHub's numeric repo ID,
which is not done here.

## Text safety

GitHub titles, labels and logins are untrusted text. Checked against a real
Sheet, `setValues` evaluates a string starting with `=` as a formula **even
in a plain-text cell**, and coerces `007`, `2024`, `TRUE`, `1e3`, `1/2` to
numbers, booleans and dates. A hostile issue title such as `=IMPORTDATA(...)`
would otherwise run in the Sheet. The service therefore:

- sets every text column to the plain-text format (`@`) before writing, which
  stops the number/date/boolean coercion;
- prefixes strings starting with `=`, `+`, `-`, `@` or `'` with an apostrophe
  when writing. Sheets consumes the apostrophe, so reads return the original
  text, and comparisons use the raw values.

All strings are escaped on every write, including unchanged rows, because the
whole data area is rewritten whenever anything changes. `updatedAt` is stored
as a real Date (format `yyyy-mm-dd hh:mm:ss`, in the spreadsheet's time zone)
so it sorts and filters; it round-trips as the same instant.

## Sync orchestration (`syncAll`)

- Loops over every enabled row in **Settings**; the code never assumes a
  repo count.
- Per repo: `fetchIssues` + `fetchPullRequests` → `normalize`. **A failure in
  one repo is caught, recorded, and the loop continues** — the other repos
  still sync. A repo counts toward `reposSynced` when its fetch did not throw;
  warnings from the GitHub client (rate limit low, page cap reached) keep the
  partial data and are recorded as notes.
- Then one `upsertActivityRows` for all repos together, then one Log row:
  `timestamp | reposSynced | rowsUpserted | errors`, with messages joined by
  ` | `. An Activity write failure is recorded the same way.
- Runs under a script-wide lock, so a timer run and a "Sync now" click cannot
  both append the same new row. If the lock is not free within 30 seconds,
  that run fails with "Another sync is already running".
- `syncAll()` returns `{reposTotal, reposSynced, rowsUpserted, errors}`.
  **Repo Pulse → Sync now** shows it: "Sync complete. 2 of 2 repo(s)
  synced, N row(s) added or updated.", or "Sync finished with problems…" with
  the first five errors. `0 of 0 repo(s) synced` makes an empty or
  mis-formatted Settings tab obvious.

## Verified against the real Sheet

- Both tracked repos populate Activity (46 rows: 5 + 41).
- Running the sync again, by hand and by the timer, adds no rows and reports
  `rowsUpserted = 0`.
- A deliberately bad Settings row (`Joel-Fah/no-such-repo`) is logged as a 404
  while the other repos still sync.
- The formula-injection bug was found by this manual check (a title of `=1+1`
  came back as `2`, and every run rewrote the row); fixed as described above
  and re-verified with 11 tricky strings across add, repeat, and edit runs.
- A change made on GitHub shows up on the next sync: relabelling an issue
  `priority: high` → `priority: medium` updated exactly that row (new
  priority and `updatedAt`), the popup and Log reported `1` row upserted, and
  no other row changed.
