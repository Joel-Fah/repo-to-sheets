# repo-to-sheets

> Your repo already knows what your team did this week.

A Google Apps Script pipeline that turns GitHub issue/PR activity —
across one or more repos — into a live, self-updating Google Sheet. No
manual status updates. An AI layer (Gemini) summarizes what changed, and
the resulting sheet can be turned into an interactive Kanban board with
zero code using Google Sheets' Canvas feature.

Built as the live demo for a talk at GitHub Dev Days #26, Yaoundé.

## Status
🚧 Under active development. This README is updated at the end of every
phase — see `PHASE1_INSTRUCTIONS.md` through `PHASE4_INSTRUCTIONS.md`
for the build sequence and `docs/decisions/` for why things are built
the way they are.

- ✅ **Phase 1 — Bootstrap:** Apps Script project linked via `clasp`.
  `Repo Pulse → Sync now` and a 10-minute time-based trigger read the
  **Settings** tab + Script Properties and write a run entry to the
  **Log** tab. No GitHub or Gemini calls yet.
- ⏳ Phase 2 — GitHub client & transformer
- ⏳ Phase 3 — Sheet service & sync orchestration
- ⏳ Phase 4 — Gemini summarization & demo polish

## How it works
See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the full data flow. Short
version:

```
GitHub API → Apps Script → Google Sheet → Gemini summary → Sheets Canvas board
```

## Quickstart (for contributors)
See [`SETUP.md`](./SETUP.md) for the one-time setup checklist — it
splits out exactly what you need to do yourself in a browser (creating
the Sheet, `clasp login`, setting secrets, Google's one-time
authorization screen) versus what can be handed to Claude Code in a
terminal (writing code, `clasp push`, git/PR workflow). Claude Code has
no access to your Google account, so the browser steps can't be
automated.

## Tracked repos
Configured in the Sheet's **Settings** tab — no code changes needed to
add or remove a repo.

## Contributing
See [`CONTRIBUTING.md`](./CONTRIBUTING.md). This project tracks its own
activity — every change goes through an issue + PR, labeled per
[`docs/guidelines/labeling-conventions.md`](./docs/guidelines/labeling-conventions.md).

## License
MIT — see [`LICENSE`](./LICENSE).
