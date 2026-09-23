# Labeling Conventions

Both tracked repos (`repo-to-sheets` and `devfest-yaounde`) use the same
label schema, so the Activity sheet can group and color-code consistently
regardless of source repo.

## Status (issues only — PR state does this job via open/merged/closed)
- `status: todo`
- `status: in-progress`
- `status: done` *(or just close the issue — closing is equivalent)*

## Priority
- `priority: high`
- `priority: medium`
- `priority: low`

## Type (issues and PRs)
- `type: feature`
- `type: bugfix`
- `type: chore`

## Rule of thumb
An issue should always carry exactly one `status:` and one `type:`
label; `priority:` is encouraged but optional. PRs only need `type:` —
their lifecycle (open → merged/closed) already models status.
