# Kickoff Prompt

Paste this whole block as your first message to Claude Code in this
repo, once `SETUP.md` steps 1-5 are done for at least one repo.

---

You are working in the repo-to-sheets repository. Before writing any
code, do the following, in order, and do not skip steps.

## 0. Orient yourself
Read, in this order: `CLAUDE.md`, `ARCHITECTURE.md`, `SETUP.md`, and
every file under `.claude/skills/`. These are binding for everything
that follows — the workflow in
`.claude/skills/github-tracking-workflow/SKILL.md` applies to every
single change you make in this repo, no exceptions, even trivial ones.

## 1. Confirm environment readiness
- Check whether `.clasp.json` already exists locally. If not, ask me for
  the Script ID from the Apps Script project (see `SETUP.md` step 4) and
  run `clasp clone <scriptId>`.
- If `clasp` reports it isn't logged in, stop and ask me to run
  `clasp login` myself (this needs a browser — you can't do it). Wait
  for my confirmation before continuing.
- I've already set `GITHUB_TOKEN` and `GEMINI_API_KEY` as Script
  Properties. The Settings tab currently has only one row enabled
  (`<owner>/repo-to-sheets`) — `devfest-yaounde` isn't added yet since
  its access isn't confirmed. Don't hardcode single-repo assumptions
  anywhere; `Config.js` already treats this as a list, and I'll add the
  second row myself once that's sorted.

## 2. Work through the phases in order, autonomously
Execute `PHASE1_INSTRUCTIONS.md`, then `PHASE2_INSTRUCTIONS.md`, then
`PHASE3_INSTRUCTIONS.md`, then `PHASE4_INSTRUCTIONS.md` — back to back,
without waiting for me to re-paste each file. For each phase:
- Do every step tagged **[CLAUDE CODE]** yourself.
- When you hit a step tagged **[YOU]**, stop, tell me exactly what to do
  and why, and wait for my confirmation before continuing — don't guess
  or skip it.
- Do not move to the next phase until every item in the current phase's
  "Acceptance criteria" checklist is genuinely true — verify each one
  explicitly (run the tests, check the actual Sheet state, confirm the
  PR is merged) rather than assuming.
- If an acceptance criterion can't be met (a test fails, the Sheet
  doesn't update as expected), stop, tell me what's wrong and what you
  think the fix is, and wait for my go-ahead rather than pushing forward
  with something broken.

## 3. Report after each phase
After each phase's acceptance criteria are all met and the PR is
merged, give me a short summary: what was built, what you verified, and
what (if anything) is still pending on my side before the next phase
can start.

## 4. General rules for the whole run
- Never invent scope beyond what a phase file specifies — if you think
  something's missing, flag it to me instead of adding it unprompted.
- Never mark a checklist item done without actually verifying it.
- Never touch secrets, `.clasp.json`, or anything in `.gitignore`.
- If you're ever unsure whether something is a [YOU] or [CLAUDE CODE]
  step, treat it as [YOU] and ask.

Start now with step 0 (orientation).
