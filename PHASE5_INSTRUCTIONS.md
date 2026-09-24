# Phase 5 — HTML Email Digest

## Context
Read `CLAUDE.md`, `ARCHITECTURE.md`, and every file under
`.claude/skills/` — including the new
`.claude/skills/html-email-digest/SKILL.md` added for this phase —
before writing any code. Phases 1-4 are already merged; this phase only
adds a new capability, it doesn't change existing sync/sheet behavior.

## Goal
A well-designed HTML email digest of repo activity, sendable either on a
daily schedule or on demand from the Sheet's menu (for live demo
purposes), with a "recommended actions" section synthesized from the
same activity data already flowing through the pipeline — not a generic
bullet-point notification.

## Design requirements (non-negotiable)
- **No default-looking template.** No plain left-border-only
  "notification" styling. Structure it like an actual digest: a
  header/brand strip, grouped sections (e.g. "New," "Merged," "Needs
  attention"), color-coded priority chips matching the Kanban board's
  palette, and a clear call-to-action footer linking back to the Sheet.
- **Recommended actions, not just a recap.** At least one section
  should surface 2-4 concrete suggestions derived from the data — e.g.
  "3 issues have had no activity in 5+ days," "PR #12 has been open the
  longest — consider reviewing it first." Extend the existing Gemini
  summarization call rather than duplicating logic — see step 3.
- **Must render correctly in real email clients**, not just look fine
  in a browser preview — see `.claude/skills/html-email-digest/SKILL.md`
  for the constraints this implies (inline styles, table-based layout,
  no external CSS/JS).
- **Graceful empty state.** If nothing changed since the last digest,
  send a short, still well-designed "all quiet" email rather than an
  empty-looking one.

## Steps
1. **[CLAUDE CODE]** Create an issue: *"Add HTML email digest"*, labeled
   `status: in-progress`, `type: feature`, `priority: medium`. Branch:
   `feat/email-digest`.
2. **[CLAUDE CODE]** Add `src/lib/EmailDigestBuilder.js` — a pure
   function `buildDigestHtml(activityRows, recommendations, meta)`
   returning `{ subject, htmlBody, plainTextBody }`. No GAS globals
   here; this is unit-testable.
3. **[CLAUDE CODE]** Extend whatever the current Gemini integration
   looks like (check `src/lib/GeminiClient.js` and how it's called in
   `src/gas/Sync.js` — read the real, already-implemented code, don't
   assume the Phase 1 stub shape still applies) so it also returns 2-4
   short recommended actions alongside the existing summary — refactor
   the return shape if needed, but keep existing call sites working.
   Don't add a second, separate Gemini call if you can get both outputs
   from one prompt/response.
4. **[CLAUDE CODE]** Add `src/gas/EmailDigest.js`: reads recipients (see
   step 5), calls `buildDigestHtml`, sends via
   `GmailApp.sendEmail(recipients, subject, plainTextBody, {htmlBody})`.
5. **[CLAUDE CODE]** Add a small "Digest Settings" section to the
   **Settings** tab (e.g. a `recipients` row with a comma-separated
   email list) so recipients are editable without redeploying code.
   Read it the same way `Config.js` already reads the repo list.
6. **[CLAUDE CODE]** Add a **"Send digest now"** item to the
   `Repo Pulse` menu (`src/gas/Menu.js`), bound to a new
   `sendDigestNow()` function — this is what you'll click live on stage
   instead of waiting on the schedule.
7. **[CLAUDE CODE]** Add `installDigestTrigger()` in
   `src/gas/Triggers.js` — a daily time-based trigger (e.g. once per
   morning), separate from the sync trigger. Don't send a digest on
   every 10-minute sync; that's spam, not a digest.
8. **[CLAUDE CODE]** Recommended: log each send to a new **DigestLog**
   tab (timestamp, recipients, subject), same pattern as the existing
   Log tab.
9. **[CLAUDE CODE]** Write `test/emailDigestBuilder.test.js` covering:
   normal case with real fixture data, and the empty/"all quiet" case.
10. **[YOU]** `clasp push`, then click **Repo Pulse → Send digest now**
    and check the actual inbox — confirm it looks intentional, not
    templated, and renders correctly (check on both Gmail and at least
    one other client if you can, e.g. Outlook web or Apple Mail).
11. **[CLAUDE CODE]** `docs/features/email-digest.md` documenting the
    HTML approach, the recipients setting, and the schedule. Update
    `README.md` and `ARCHITECTURE.md`'s component table to include
    `EmailDigestBuilder.js` / `EmailDigest.js`.
12. **[CLAUDE CODE]** PR referencing the issue, merge.

## Acceptance criteria
- [ ] `node --test` passes for `emailDigestBuilder.test.js`
- [ ] A real test email was received and visually confirmed to not look
      like a default template
- [ ] "Recommended actions" section shows real, data-derived
      suggestions, not filler text
- [ ] Manual "Send digest now" works independently of the scheduled
      trigger
- [ ] Empty-state email doesn't look broken or blank
- [ ] Docs (`docs/features/email-digest.md`, `README.md`,
      `ARCHITECTURE.md`) updated
- [ ] Landed via issue + PR

## Out of scope
Per-repo changelog documents — deliberately deferred, not part of this
phase.
