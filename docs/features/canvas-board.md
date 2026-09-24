# Canvas board

The Kanban board is built with Google Sheets' **Canvas** feature on top of the
**Activity** tab, using the Gemini side panel in the Sheet. It is created by
hand, not by code: nothing in `src/` touches it, and it needs no script access.

![Activity Kanban board](../images/canvas-board.png)

What the board shows, as built:

- **Columns from `status`:** To Do, In Progress, Done, and Merged. Issues land in
  the first three (from their `status:` label, or Done once closed); merged PRs
  land in Merged. This is why `status` is derived the way it is in
  `Transformer.js` (see [github-client.md](github-client.md)).
- **Cards colored by `priority`** (High / Med / Low / none), from the `priority:`
  label.
- **Card details:** repo, issue/PR number, title, updated date, issue-or-PR
  badge and state, with a link to the item on GitHub.
- **Filters** for repository and type, and a search box over title, repo and
  number.
- 48 cards at the time of the screenshot: 7 from `Joel-Fah/repo-to-sheets` and
  41 from `gdgyaounde/devfest-yaounde`, matching the 48 rows of the Activity
  tab.

## Recreating it

1. Make sure the **Activity** tab has data (run **Repo Pulse → Sync now**).
2. Open the Gemini side panel in the Sheet and ask it to build a Kanban board
   from the Activity tab, with columns from `status` and cards colored by
   `priority`.
3. Tidy the result (column names, filters) by hand if needed.

Because the board is built on the Activity tab's columns, keep the header row
(`repo | type | number | title | state | status | priority | assignee |
updatedAt | url`) as it is; the sync refuses to write if it was changed.
