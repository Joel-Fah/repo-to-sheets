---
name: github-tracking-workflow
description: Use before making any code change in this repo — every change must go through an issue, a branch, and a PR with the project's label schema, since this repo's own activity is tracked live in the demo.
---

# GitHub Tracking Workflow

## Why this matters here specifically
This repo is tracked by its own tool (repo-to-sheets watches its own
activity). Sloppy issue/PR hygiene here shows up directly in the live
demo. Follow this exactly, every time — no shortcuts even for tiny
changes.

## Before writing any code
1. Check if an issue already exists for this work. If not, create one
   using `gh issue create` (if `gh` is authenticated) or ask the user to
   create it, with:
   - One `status:` label: `status: todo` → `status: in-progress` once
     you start
   - One `type:` label: `type: feature` / `type: bugfix` / `type: chore`
   - Ideally one `priority:` label: `priority: high` / `medium` / `low`
2. Branch from `main`: `feat/<short-name>`, `fix/<short-name>`,
   `docs/<short-name>`, or `chore/<short-name>`.

## While working
- Commit using **Conventional Commits**: `feat: ...`, `fix: ...`,
  `docs: ...`, `chore: ...`, `refactor: ...`, `test: ...`.
- Keep commits small and logical — this history is part of the demo.

## Before opening the PR
- Update `docs/features/*.md` (new capability) or
  `docs/decisions/*.md` (architecturally significant choice).
- Update `README.md` if user-facing behavior changed.
- Run `node --test` if `src/lib/` was touched.

## Opening the PR
- Reference the issue: `Closes #N`.
- Fill in every checkbox in `.github/PULL_REQUEST_TEMPLATE.md` honestly
  — don't check a box for something not actually done.

## After merge
- Close the issue if it isn't auto-closed by `Closes #N`.
- Don't leave a `status: in-progress` label on a closed issue.
