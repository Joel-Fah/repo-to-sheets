# One-Time Setup (do this before Phase 1)

## What Claude Code cannot do
Claude Code runs in your terminal — it has no access to your Google
account, no browser session, and can't complete Google's OAuth consent
screens. It can run `clasp` commands, but any step where Google needs
you to click "Allow" in a browser has to be done by you, once.

## Your manual steps (do these yourself, in order)
1. **Install clasp** — `npm install -g @google/clasp` (Claude Code can
   run this too, it's just an npm install, no auth involved).
2. **`clasp login`** — run this yourself in a terminal with browser
   access; it opens a browser, you sign in with the Google account you
   want the Sheet on. This caches a token locally (`~/.clasprc.json`)
   that Claude Code can then reuse for every `clasp push`/`clasp pull`
   afterward. One-time only.
3. **Create the Google Sheet** (any name, e.g. "Repo Pulse Dashboard")
   — via sheets.google.com, in your browser.
4. **Extensions → Apps Script**, from that Sheet — this creates the
   bound script project. Copy its **Script ID** from Project Settings
   (⚙️ icon in the Apps Script editor) — give this to Claude Code.
5. **Set Script Properties** — in that same Apps Script editor, Project
   Settings → Script Properties → add `GITHUB_TOKEN` and
   `GEMINI_API_KEY`. Browser UI only, no CLI shortcut.
6. **First-run authorization** — the first time any function runs (via
   the Sheet's menu, or the editor's "Run" button), Google shows a
   consent screen ("This app isn't verified" → Advanced → Go to
   project (unsafe) → Allow). Click through it once — this is Google
   being cautious about a script requesting Sheet/network access, not
   an error.

## What you can hand to Claude Code after that
Once steps 1-2 are done (clasp is logged in) and you've given it the
Script ID from step 4:
- `clasp clone <scriptId>` to link this repo to that Apps Script project
- Writing/editing all the actual code
- `clasp push` to deploy changes
- Running local tests (`node --test`)
- Git branching, committing, and — if you also do the optional step
  below — creating issues and PRs

## Optional: let Claude Code manage issues/PRs too
`gh auth login` normally opens a browser too, but you can skip that by
piping in a personal access token instead (no browser needed):
```
echo YOUR_GITHUB_TOKEN | gh auth login --with-token
```
Do this once, and Claude Code can run `gh issue create`, `gh pr create`,
etc. on your behalf for the rest of the project.
