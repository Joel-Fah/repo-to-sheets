# Contributing

This repo is both a tool and a live demo dataset — its own issue/PR
history is part of the talk. Please keep it clean.

## Workflow
1. **Open an issue first** (use the templates under
   `.github/ISSUE_TEMPLATE/`), labeled with one `status:`, one `type:`,
   and ideally one `priority:`.
2. **Branch from `main`**: `feat/<short-name>`, `fix/<short-name>`,
   `docs/<short-name>`, or `chore/<short-name>`.
3. **Commit using Conventional Commits**: `feat: add pagination to
   GitHubClient`, `fix: handle empty settings tab`, etc.
4. **Open a PR that references the issue** (`Closes #N`) and fill in the
   PR template.
5. **Update docs**: a new `docs/features/*.md` entry for new capability,
   or a `docs/decisions/*.md` ADR for anything architecturally
   significant. Update the README if user-facing behavior changed.
6. **Update the issue's `status:` label** as work progresses; close it
   (don't just relabel `done`) once merged.

## Local setup
See the Quickstart in `README.md`.

## Code style & testing
See `CLAUDE.md` — same rules apply whether you're a human or Claude Code.

## Labels
See `docs/guidelines/labeling-conventions.md`. Same schema is used on
the other tracked repo (`devfest-yaounde`) so the Activity sheet stays
consistent.
