---
name: html-email-digest
description: Use when building or modifying the HTML email digest (EmailDigestBuilder.js, EmailDigest.js) — covers GmailApp usage and the HTML email compatibility constraints that don't apply to normal web HTML.
---

# HTML Email Digest

## Sending
Use `MailApp.sendEmail({ to, subject, body, htmlBody, name })` — `body` is the
plain-text alternative. It sends as the script owner's account, subject to Apps Script's
daily email quota.

**Scope:** the first send needs a *new* authorization, because the script had no email
scope before. `MailApp` needs only `script.send_mail` (send email as you).
`GmailApp.sendEmail` would need `https://mail.google.com/`, which is full read/send/delete
access to the mailbox — far more than a send-only feature should ask for, so this project
uses `MailApp` (see `docs/decisions/0003-send-the-digest-with-mailapp.md`).

## HTML email is not web HTML
Email clients render HTML very differently from browsers. Follow these
or the digest will look broken somewhere:
- **Inline styles only.** No `<style>` blocks, no external stylesheets
  — many clients (notably Outlook) strip them. Every element gets a
  `style="..."` attribute directly.
- **Table-based layout**, not flexbox/grid. Outlook's desktop rendering
  engine is Word, not a browser engine — it does not support modern CSS
  layout. Nested `<table>` elements are the reliable way to get
  multi-column or card-like structure.
- **No JavaScript.** It will simply never run in an email client.
- **No external images** unless you're fine with them being blocked by
  default in most clients — prefer colored HTML elements (colored table
  cells, borders, emoji) over images for chips/badges/icons.
- **Always include a plain-text fallback** (the third argument to
  `sendEmail`) — some clients/spam filters weight this.
- **Keep width around 600px**, mobile-safe (single column, or a layout
  that collapses gracefully — most digest opens happen on a phone).

## Structure this digest should have
Not a single flat list. At minimum: a header/brand strip, grouped
sections by what happened (e.g. new, merged, needs attention),
color-coded priority chips consistent with the Kanban board's palette,
a "recommended actions" callout box, and a footer link back to the
Sheet. See `PHASE5_INSTRUCTIONS.md` for the full requirements.

## Testability
`EmailDigestBuilder.js`'s `buildDigestHtml()` is pure — no GAS globals —
so it can be unit tested by asserting on the returned HTML/text strings
(e.g. that expected sections/counts appear). `EmailDigest.js` is the
thin glue that actually calls `GmailApp` and is verified manually.
