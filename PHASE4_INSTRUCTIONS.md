# Phase 4 — Gemini Summarization & Demo Polish

## Context
Read `CLAUDE.md` and `ARCHITECTURE.md`. Phases 1-3 must be merged first.
This is the last build phase before rehearsal.

## Goal
An AI-written summary of what changed, an Insights tab, and the project
in a demo-ready state.

## Steps
1. Create an issue: *"Add Gemini summarization + Insights tab"*, labeled
   `status: in-progress`, `type: feature`, `priority: high`.
2. Branch: `feat/gemini-insights`.
3. Implement `summarizeActivity()` in `src/lib/GeminiClient.js`: call the
   Gemini API (free tier) with a compact prompt describing what changed
   since the last Log entry (new/closed issues, merged PRs, anything
   stale). Keep the prompt short and the expected output to 2-4
   sentences.
4. Wire it into `syncAll()`: after the Sheet write, build the diff
   summary text, call `summarizeActivity`, write the result + timestamp
   to a new **Insights** tab.
5. Run a full sync against real data, confirm the Insights tab reads
   sensibly.
6. `docs/features/gemini-insights.md` — document the prompt used and
   why.
7. **Manual step (not code):** in the Gemini side panel for this Sheet,
   build a Sheets Canvas Kanban-style board from the Activity tab. Take
   a screenshot for the docs/slides.
8. Do a final labeling pass on both tracked repos so the demo has
   visible variety across `status: todo/in-progress/done` and a couple
   of `priority:` values.
9. Record a full backup run-through (screen recording) of: opening the
   Sheet → Sync now → Log/Activity/Insights updating → the Canvas board
   reflecting it.
10. Final README pass: update Status to "demo-ready," add a short "How
    this was built" section linking to the PHASE files and ADRs for
    anyone reading the repo after the talk.
11. Commit, PR, merge.

## Acceptance criteria
- [ ] Insights tab shows a real Gemini-generated summary
- [ ] Canvas board built and screenshotted
- [ ] Both tracked repos show label variety for the demo
- [ ] Backup recording exists
- [ ] README finalized
- [ ] Landed via issue + PR
