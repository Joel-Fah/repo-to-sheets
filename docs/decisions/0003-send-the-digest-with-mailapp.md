# ADR 0003: Send the digest with MailApp, not GmailApp

**Date:** 2026-09-24
**Status:** Accepted

## Context
`PHASE5_INSTRUCTIONS.md` and the `html-email-digest` skill specify
`GmailApp.sendEmail`, and the skill says it needs "no extra OAuth scope". Checking
Google's Apps Script reference showed otherwise:

- `GmailApp` requires the scope `https://mail.google.com/`, which is full access to
  the account's Gmail (read, send, delete).
- `MailApp.sendEmail` requires only `https://www.googleapis.com/auth/script.send_mail`
  ("send email as you"), and supports the same `htmlBody` and `name` options.

The digest only ever sends; it never reads or changes the mailbox.

## Decision
Use **`MailApp.sendEmail`** (the object form: `to`, `subject`, `body`, `htmlBody`, `name`).

## Consequences
- The first digest asks for the narrower send-only permission instead of full Gmail
  access. Either way Google shows a new authorization screen the first time, because the
  script had no email scope before.
- Behavior for the reader is the same: HTML body with a plain-text alternative, sent
  from the script owner's account.
- Apps Script's daily email quota applies (see Google's quotas page); a daily digest to
  a handful of recipients is far below it.
- If something `GmailApp` alone offers (labels, threads, drafts) is ever needed, switching
  is a one-line change in `src/gas/EmailDigest.js` plus the wider scope.
