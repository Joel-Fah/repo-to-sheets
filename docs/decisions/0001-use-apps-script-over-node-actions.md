# ADR 0001: Use Google Apps Script instead of Node.js + GitHub Actions

**Date:** 2026-09-23
**Status:** Accepted

## Context
The pipeline needs to pull GitHub activity, write it to a Google Sheet,
and optionally call an LLM to summarize it — on a schedule, entirely on
free tiers, and demoable live on stage.

Two options were considered:
1. **Google Apps Script**, bound to the target Sheet, using
   `UrlFetchApp` for GitHub/Gemini calls, deployed and version-controlled
   locally via `clasp`.
2. **A standalone Node.js script**, triggered on a schedule by GitHub
   Actions, using the Sheets API (service account) and the GitHub API
   directly.

## Decision
Use **Google Apps Script**.

## Rationale
- No hosting or credentials-as-CI-secrets setup — the Sheet *is* the
  runtime.
- Fewer moving parts to get working before the deadline: no service
  account, no Sheets API OAuth flow, no Actions YAML.
- `clasp` lets us keep the code version-controlled, tested locally, and
  PR-reviewed exactly like a normal repo, so we don't lose the "this
  project tracks its own clean history" story.
- The trade-off (no push-button GitHub Actions demo trigger) is solved
  instead with a custom Sheet menu item (`Repo Pulse → Sync now`) that
  calls the sync function on demand — same live-demo effect, less
  infrastructure.

## Consequences
- We accept Apps Script's constraints: a shared global scope across
  files (no ES modules), a 6-minute execution limit per run, and quota
  limits on `UrlFetchApp` calls — all acceptable at this project's scale.
- Local unit testing only covers `src/lib/` (pure logic); GAS-specific
  glue code is verified manually against the real Sheet.
