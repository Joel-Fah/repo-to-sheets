# ADR 0002: Gemini summaries — `generateContent`, model fallback, and links only from GitHub data

**Date:** 2026-09-24
**Status:** Accepted

## Context
Phase 4 adds an AI-written summary of what changed on each sync, stored in
the Insights tab. Checking the live API and a real key showed three things
that shaped the design:

- Google now recommends a newer "Interactions" API for new projects;
  `generateContent` is described as legacy but still fully supported.
- The free tier is unreliable under load. In one live check, 3 of 5 models
  returned HTTP 503 "high demand" (one took 24 s to fail) while two answered
  in 1–4 s. Older models (2.5 line) are being access-restricted.
- Sheets evaluates text starting with `=` (and, in rich-text cells, `+`) as a
  formula, and GitHub titles are untrusted input.

## Decision
1. **Use `generateContent`**, not the Interactions API. It is stable and its
   request/response shape is documented in the API reference; we need a single
   stateless call, which is what the newer API's extra features don't help with.
2. **Try two models in order** (`gemini-flash-lite-latest`, then
   `gemini-3.5-flash-lite`), with one retry per model. Fall back only on
   HTTP 404 (retired), 429 (quota) or 5xx (overloaded). A bad key or a
   blocked prompt fails immediately — another model would fail the same way.
   The `-latest` alias follows Google's retirements automatically.
3. **Summarize only when the sync found a change.** An unchanged run costs no
   quota and adds no Insights row.
4. **Compare against the previous sync.** An added row last updated before the
   previous Log entry is existing history (e.g. a newly tracked or moved repo),
   reported to the model as a count, not as new activity.
5. **Rich text, but never model-written links.** The model may only write
   `**bold**` and `owner/repo#number`. Code turns a reference into a link only
   if that item was fetched from GitHub in this run, using GitHub's own
   `html_url`; anything else stays plain text. Leading `= + - @` are stripped
   from the summary before it is written.

## Consequences
- A Gemini failure never fails the sync: the data is already written; the
  error goes to the Log `errors` column and the popup, and that window simply
  has no Insights row.
- When the model is overloaded on every attempt, up to four calls and a few
  seconds are spent before giving up.
- To demo a fresh summary, make a change on GitHub first; **Sync now** on an
  unchanged repo adds no row.
- The model alias may change behavior when Google repoints it; the fallback
  model is pinned.
- Moving or renaming a tracked repo still creates new Activity rows (the key
  includes the repo name); see `docs/features/sheet-service.md`.
