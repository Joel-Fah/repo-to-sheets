/**
 * EmailDigestBuilder.js
 * Pure: turns Activity rows plus recommended actions into the digest email
 * ({ subject, htmlBody, plainTextBody }). No GAS globals.
 *
 * The HTML follows the email-client rules in .claude/skills/html-email-digest:
 * inline styles only, nested tables for layout, no images/CSS blocks/JS, ~600px
 * wide. Colors come from the Kanban board's palette. See docs/features/email-digest.md.
 * Uses selectDigestItems (DigestData.js) and formatInsightSummary (InsightFormat.js).
 */

const DIGEST_MAX_ITEMS_PER_SECTION = 6;
const DIGEST_QUIET_MAX_ATTENTION = 3;

const DIGEST_COLORS = {
  ink: '#0F172A',
  text: '#1E293B',
  muted: '#64748B',
  faint: '#94A3B8',
  line: '#E2E8F0',
  page: '#EEF1F6',
  card: '#FFFFFF',
  soft: '#F8FAFC',
  accent: '#1A73E8',
  // The four Kanban columns: To Do, In Progress, Done, Merged
  columns: ['#5F6368', '#1A73E8', '#137333', '#8430CE'],
  shipped: '#137333',
  motion: '#1A73E8',
  attention: '#C5221F',
  tipBg: '#EEF2FF',
  tipLine: '#C7D2FE'
};

// Priority chip colors match the Kanban cards (High red, Medium amber, Low green, none grey).
const DIGEST_PRIORITY_CHIPS = {
  high: { label: 'High', fg: '#C5221F', bg: '#FCE8E6' },
  medium: { label: 'Medium', fg: '#B45309', bg: '#FEF3C7' },
  low: { label: 'Low', fg: '#137333', bg: '#E6F4EA' },
  none: { label: 'None', fg: '#5F6368', bg: '#F1F3F4' }
};

const DIGEST_STATUS_CHIPS = {
  todo: { label: 'To do', fg: '#5F6368', bg: '#F1F3F4' },
  'in-progress': { label: 'In progress', fg: '#1A73E8', bg: '#E8F0FE' },
  done: { label: 'Done', fg: '#137333', bg: '#E6F4EA' },
  merged: { label: 'Merged', fg: '#8430CE', bg: '#F3E8FD' },
  open: { label: 'Open', fg: '#1A73E8', bg: '#E8F0FE' },
  closed: { label: 'Closed', fg: '#5F6368', bg: '#F1F3F4' }
};

const DIGEST_FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif";

/**
 * @typedef {object} DigestMeta
 * @property {Date} now
 * @property {Date} since - start of the digest window
 * @property {string} dateLabel - e.g. "Thursday 24 September", formatted by the caller in the script's time zone
 * @property {string} dateShort - e.g. "Thu 24 Sep" (used in the subject)
 * @property {string} sinceLabel - e.g. "Wed 23 Sep, 08:00"
 * @property {string} [sheetUrl] - link for the call-to-action button
 * @property {string} [summary] - one or two sentences (Gemini's headline), optional; may contain **bold** and owner/repo#N
 * @property {'manual'|'scheduled'} [mode]
 */

/**
 * @param {object[]} activityRows - all Activity rows (updatedAt as an ISO string)
 * @param {string[]} recommendations - recommended actions; may contain **bold** and owner/repo#N references
 * @param {DigestMeta} meta
 * @returns {{subject: string, htmlBody: string, plainTextBody: string}}
 */
function buildDigestHtml(activityRows, recommendations, meta) {
  const selection = selectDigestItems(activityRows, meta.since, meta.now);
  const recs = (recommendations || []).filter(text => typeof text === 'string' && text.trim());
  const context = { rows: activityRows, meta, selection, recs, quiet: selection.quiet };

  return {
    subject: digestSubject_(context),
    htmlBody: digestHtmlDocument_(context),
    plainTextBody: digestPlainText_(context)
  };
}

// ---------------------------------------------------------------- subject

/**
 * @param {object} context
 * @returns {string}
 */
function digestSubject_(context) {
  const { selection, meta } = context;
  if (context.quiet) return `Repo Pulse · all quiet — ${meta.dateShort}`;
  const parts = [`${selection.shipped.length} shipped`, `${selection.active.length} in motion`];
  if (selection.attention.length > 0) parts.push(`${selection.attention.length} need attention`);
  return `Repo Pulse · ${parts.join(', ')} — ${meta.dateShort}`;
}

// ---------------------------------------------------------------- html

/**
 * @param {object} context
 * @returns {string} full HTML document
 */
function digestHtmlDocument_(context) {
  const { meta, selection } = context;
  const preheader = digestPreheader_(context);
  const body = [
    digestBrandStrip_(context),
    digestColorBar_(),
    context.quiet ? digestQuietHero_(context) : digestStatsRow_(selection),
    !context.quiet && meta.summary ? digestSummaryBlock_(context) : '',
    context.recs.length > 0 ? digestRecommendationsBox_(context) : '',
    context.quiet ? '' : digestSection_(context, 'Shipped', selection.shipped, DIGEST_COLORS.shipped, item => digestItemMeta_(item, meta.now, false)),
    context.quiet ? '' : digestSection_(context, 'In motion', selection.active, DIGEST_COLORS.motion, item => digestItemMeta_(item, meta.now, false)),
    digestSection_(context, 'Needs attention', selection.attention, DIGEST_COLORS.attention,
      item => digestItemMeta_(item, meta.now, true), context.quiet ? DIGEST_QUIET_MAX_ATTENTION : DIGEST_MAX_ITEMS_PER_SECTION),
    digestCallToAction_(context),
    digestFooter_(context)
  ].join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="x-apple-disable-message-reformatting">
<title>${digestEsc_(digestSubject_(context))}</title>
</head>
<body style="margin:0;padding:0;background-color:${DIGEST_COLORS.page};">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${DIGEST_COLORS.page};opacity:0;">${digestEsc_(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${DIGEST_COLORS.page}" style="background-color:${DIGEST_COLORS.page};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="${DIGEST_COLORS.card}" style="width:100%;max-width:600px;background-color:${DIGEST_COLORS.card};border-radius:14px;font-family:${DIGEST_FONT};color:${DIGEST_COLORS.text};">
${body}
</table>
</td></tr>
</table>
</body>
</html>`;
}

/**
 * @param {object} context
 * @returns {string} the hidden inbox-preview line
 */
function digestPreheader_(context) {
  const { selection, meta } = context;
  if (context.quiet) return `Nothing shipped or moved since ${meta.sinceLabel}. ${selection.stats.openIssues} open issues, ${selection.stats.openPrs} open PRs.`;
  if (meta.summary) return digestPlainRich_(meta.summary, context.rows);
  return `${selection.shipped.length} shipped, ${selection.active.length} in motion, ${selection.attention.length} need attention.`;
}

/**
 * @param {object} context
 * @returns {string} dark header with a logo built from the Kanban column colors, the date, and the window
 */
function digestBrandStrip_(context) {
  const { meta, selection } = context;
  const bar = (color, height) =>
    `<td width="5" height="${height}" bgcolor="${color}" valign="bottom" style="width:5px;height:${height}px;background-color:${color};font-size:0;line-height:0;">&nbsp;</td><td width="3" style="width:3px;font-size:0;line-height:0;">&nbsp;</td>`;
  const logo = `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>` +
    [[DIGEST_COLORS.columns[0], 10], [DIGEST_COLORS.columns[1], 18], [DIGEST_COLORS.columns[2], 13], [DIGEST_COLORS.columns[3], 22]]
      .map(([color, height]) => bar(color, height)).join('') +
    `</tr></table>`;
  const modeLabel = meta.mode === 'manual' ? 'On demand' : 'Daily digest';

  return `<tr><td bgcolor="${DIGEST_COLORS.ink}" style="background-color:${DIGEST_COLORS.ink};padding:26px 28px 24px;border-radius:14px 14px 0 0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr>
<td valign="bottom" style="width:40px;">${logo}</td>
<td valign="bottom" style="padding-left:6px;font-family:${DIGEST_FONT};font-size:13px;font-weight:800;letter-spacing:2.4px;color:#FFFFFF;">REPO PULSE</td>
<td align="right" valign="bottom" style="font-family:${DIGEST_FONT};font-size:11px;font-weight:700;letter-spacing:1.2px;color:${DIGEST_COLORS.faint};text-transform:uppercase;">${digestEsc_(modeLabel)}</td>
</tr>
<tr><td colspan="3" style="padding-top:22px;font-family:${DIGEST_FONT};font-size:28px;line-height:1.2;font-weight:800;color:#FFFFFF;">${digestEsc_(meta.dateLabel)}</td></tr>
<tr><td colspan="3" style="padding-top:6px;font-family:${DIGEST_FONT};font-size:13px;line-height:1.5;color:${DIGEST_COLORS.faint};">Since ${digestEsc_(meta.sinceLabel)} &nbsp;·&nbsp; ${selection.stats.repos} ${selection.stats.repos === 1 ? 'repo' : 'repos'} tracked</td></tr>
</table>
</td></tr>`;
}

/**
 * @returns {string} thin four-segment bar in the Kanban column colors
 */
function digestColorBar_() {
  const cells = DIGEST_COLORS.columns
    .map(color => `<td width="25%" height="5" bgcolor="${color}" style="background-color:${color};height:5px;font-size:0;line-height:0;">&nbsp;</td>`)
    .join('');
  return `<tr><td style="font-size:0;line-height:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cells}</tr></table></td></tr>`;
}

/**
 * @param {string} label
 * @param {number|string} value
 * @param {string} color
 * @returns {string} one stat cell: big number over a small caps label, capped by a colored rule
 */
function digestStatCell_(label, value, color) {
  return `<td width="33%" valign="top" style="border-top:3px solid ${color};padding:12px 4px 0 0;">
<div style="font-family:${DIGEST_FONT};font-size:34px;line-height:1;font-weight:800;color:${DIGEST_COLORS.ink};">${value}</div>
<div style="font-family:${DIGEST_FONT};font-size:11px;line-height:1.4;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:${DIGEST_COLORS.muted};padding-top:6px;">${digestEsc_(label)}</div>
</td>`;
}

/**
 * @param {DigestSelection} selection
 * @returns {string}
 */
function digestStatsRow_(selection) {
  return `<tr><td style="padding:24px 28px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${digestStatCell_('Shipped', selection.shipped.length, DIGEST_COLORS.shipped)}
<td width="12" style="width:12px;">&nbsp;</td>
${digestStatCell_('In motion', selection.active.length, DIGEST_COLORS.motion)}
<td width="12" style="width:12px;">&nbsp;</td>
${digestStatCell_('Need attention', selection.attention.length, DIGEST_COLORS.attention)}
</tr></table>
</td></tr>`;
}

/**
 * @param {object} context
 * @returns {string} the "all quiet" hero plus a snapshot of where things stand
 */
function digestQuietHero_(context) {
  const { meta, selection } = context;
  const stale = selection.attention.filter(item => item.reason === 'stale').length;
  return `<tr><td style="padding:34px 28px 8px;">
<div style="font-family:${DIGEST_FONT};font-size:44px;line-height:1.05;font-weight:800;color:${DIGEST_COLORS.ink};letter-spacing:-1px;">All quiet.</div>
<div style="font-family:${DIGEST_FONT};font-size:16px;line-height:1.55;color:${DIGEST_COLORS.text};padding-top:12px;">Nothing shipped or moved since ${digestEsc_(meta.sinceLabel)}. Here is where things stand.</div>
</td></tr>
<tr><td style="padding:14px 28px 4px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
${digestStatCell_('Open issues', selection.stats.openIssues, DIGEST_COLORS.columns[1])}
<td width="12" style="width:12px;">&nbsp;</td>
${digestStatCell_('Open PRs', selection.stats.openPrs, DIGEST_COLORS.columns[3])}
<td width="12" style="width:12px;">&nbsp;</td>
${digestStatCell_(`Quiet ${DIGEST_STALE_DAYS}+ days`, stale, stale > 0 ? DIGEST_COLORS.attention : DIGEST_COLORS.columns[2])}
</tr></table>
</td></tr>`;
}

/**
 * @param {object} context
 * @returns {string} the headline paragraph
 */
function digestSummaryBlock_(context) {
  return `<tr><td style="padding:22px 28px 6px;">
<div style="font-family:${DIGEST_FONT};font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:${DIGEST_COLORS.muted};padding-bottom:8px;">The short version</div>
<div style="font-family:${DIGEST_FONT};font-size:17px;line-height:1.55;color:${DIGEST_COLORS.ink};">${digestRichHtml_(context.meta.summary, context.rows)}</div>
</td></tr>`;
}

/**
 * @param {object} context
 * @returns {string} a tinted box with numbered actions
 */
function digestRecommendationsBox_(context) {
  const rows = context.recs.map((text, index) => `<tr>
<td valign="top" width="30" style="width:30px;padding:${index === 0 ? '4px' : '12px'} 0 0 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="24" height="24" align="center" valign="middle" bgcolor="${DIGEST_COLORS.accent}" style="width:24px;height:24px;background-color:${DIGEST_COLORS.accent};border-radius:12px;font-family:${DIGEST_FONT};font-size:12px;font-weight:800;color:#FFFFFF;line-height:24px;">${index + 1}</td></tr></table>
</td>
<td valign="top" style="padding:${index === 0 ? '4px' : '12px'} 0 0 0;font-family:${DIGEST_FONT};font-size:14.5px;line-height:1.55;color:${DIGEST_COLORS.text};">${digestRichHtml_(text, context.rows)}</td>
</tr>`).join('\n');

  return `<tr><td style="padding:20px 28px 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${DIGEST_COLORS.tipBg}" style="background-color:${DIGEST_COLORS.tipBg};border:1px solid ${DIGEST_COLORS.tipLine};border-radius:12px;">
<tr><td style="padding:18px 20px 18px;">
<div style="font-family:${DIGEST_FONT};font-size:11px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:${DIGEST_COLORS.accent};padding-bottom:10px;">Recommended actions</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows}
</table>
</td></tr>
</table>
</td></tr>`;
}

/**
 * @param {object} context
 * @param {string} title
 * @param {DigestItem[]} items
 * @param {string} color - section accent
 * @param {function(DigestItem): string} describe - the grey meta line under an item's title, as plain text
 * @param {number} [cap]
 * @returns {string} '' when there are no items
 */
function digestSection_(context, title, items, color, describe, cap) {
  if (items.length === 0) return '';
  const max = cap || DIGEST_MAX_ITEMS_PER_SECTION;
  const shown = items.slice(0, max);
  const rows = shown.map((item, index) => digestItemRow_(item, describe(item), index === shown.length - 1 && items.length <= max)).join('\n');
  const more = items.length > max
    ? `<tr><td style="padding:12px 28px 4px;font-family:${DIGEST_FONT};font-size:13px;color:${DIGEST_COLORS.muted};">+ ${items.length - max} more${context.meta.sheetUrl ? ` &nbsp;·&nbsp; <a href="${digestEsc_(digestSafeUrl_(context.meta.sheetUrl))}" style="color:${DIGEST_COLORS.accent};text-decoration:underline;">see all in the sheet</a>` : ' in the sheet'}</td></tr>`
    : '';

  return `<tr><td style="padding:26px 28px 6px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="10" height="10" bgcolor="${color}" style="width:10px;height:10px;background-color:${color};font-size:0;line-height:0;border-radius:3px;">&nbsp;</td>
<td style="padding-left:10px;font-family:${DIGEST_FONT};font-size:13px;font-weight:800;letter-spacing:1.4px;text-transform:uppercase;color:${DIGEST_COLORS.ink};">${digestEsc_(title)}</td>
<td align="right" style="font-family:${DIGEST_FONT};font-size:13px;font-weight:700;color:${DIGEST_COLORS.muted};">${items.length}</td>
</tr></table>
</td></tr>
${rows}
${more}`;
}

/**
 * @param {DigestItem} item
 * @param {string} metaLine - plain text
 * @param {boolean} isLast - no divider under the last visible item
 * @returns {string} one item: priority chip, linked title, grey meta line
 */
function digestItemRow_(item, metaLine, isLast) {
  const row = item.row;
  const priority = DIGEST_PRIORITY_CHIPS[row.priority] || DIGEST_PRIORITY_CHIPS.none;
  const url = digestSafeUrl_(row.url);
  const title = digestEsc_(row.title || `${row.repo}#${row.number}`);
  const titleHtml = url
    ? `<a href="${digestEsc_(url)}" style="font-family:${DIGEST_FONT};font-size:15px;line-height:1.4;font-weight:700;color:${DIGEST_COLORS.ink};text-decoration:none;">${title}</a>`
    : `<span style="font-family:${DIGEST_FONT};font-size:15px;line-height:1.4;font-weight:700;color:${DIGEST_COLORS.ink};">${title}</span>`;
  const divider = isLast ? 'none' : `1px solid ${DIGEST_COLORS.line}`;

  return `<tr><td style="padding:0 28px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="top" width="86" style="width:86px;padding:14px 12px 14px 0;border-bottom:${divider};">${digestChip_(priority.label, priority.fg, priority.bg)}</td>
<td valign="top" style="padding:13px 0 14px 0;border-bottom:${divider};">
${titleHtml}
<div style="font-family:${DIGEST_FONT};font-size:12px;line-height:1.5;color:${DIGEST_COLORS.muted};padding-top:3px;">${digestEsc_(metaLine)}</div>
</td>
</tr></table>
</td></tr>`;
}

/**
 * @param {string} label
 * @param {string} fg
 * @param {string} bg
 * @returns {string} a pill: colored dot plus small caps text
 */
function digestChip_(label, fg, bg) {
  return `<span style="display:inline-block;padding:4px 9px;border-radius:999px;background-color:${bg};color:${fg};font-family:${DIGEST_FONT};font-size:10.5px;line-height:1.2;font-weight:800;letter-spacing:0.8px;text-transform:uppercase;white-space:nowrap;"><span style="font-size:8px;">&#9679;</span>&nbsp;${digestEsc_(label)}</span>`;
}

/**
 * @param {DigestItem} item
 * @param {Date} now
 * @param {boolean} showReason
 * @returns {string} e.g. "Joel-Fah/repo-to-sheets #4 · Merged · 3d ago"
 */
function digestItemMeta_(item, now, showReason) {
  const row = item.row;
  const status = DIGEST_STATUS_CHIPS[row.status] || DIGEST_STATUS_CHIPS[row.state] || null;
  const parts = [`${row.repo} #${row.number}`];
  if (showReason && item.reason === 'stale') parts.push(`quiet for ${item.ageDays} ${item.ageDays === 1 ? 'day' : 'days'}`);
  if (showReason && item.reason === 'high-todo') parts.push('high priority, not started');
  if (status) parts.push(status.label);
  if (!showReason) parts.push(digestAge_(item, now));
  return parts.join(' · ');
}

/**
 * @param {DigestItem} item
 * @param {Date} now
 * @returns {string} "just now", "5h ago", "3d ago"
 */
function digestAge_(item, now) {
  const ms = now.getTime() - Date.parse(item.row.updatedAt);
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${item.ageDays}d ago`;
}

/**
 * @param {object} context
 * @returns {string} the call-to-action button back to the Sheet ('' when no sheet URL was given)
 */
function digestCallToAction_(context) {
  const url = digestSafeUrl_(context.meta.sheetUrl);
  if (!url) return '';
  return `<tr><td align="center" style="padding:30px 28px 8px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" bgcolor="${DIGEST_COLORS.accent}" style="background-color:${DIGEST_COLORS.accent};border-radius:10px;">
<a href="${digestEsc_(url)}" style="display:inline-block;padding:15px 30px;font-family:${DIGEST_FONT};font-size:15px;font-weight:800;color:#FFFFFF;text-decoration:none;">Open the dashboard &rarr;</a>
</td></tr></table>
<div style="font-family:${DIGEST_FONT};font-size:12px;line-height:1.5;color:${DIGEST_COLORS.muted};padding-top:12px;">Kanban board, Insights and the full activity log live in the sheet.</div>
</td></tr>`;
}

/**
 * @param {object} context
 * @returns {string}
 */
function digestFooter_(context) {
  const how = context.meta.mode === 'manual' ? 'sent on demand from the sheet menu' : 'sent daily';
  return `<tr><td bgcolor="${DIGEST_COLORS.soft}" style="background-color:${DIGEST_COLORS.soft};padding:22px 28px;margin-top:24px;border-top:1px solid ${DIGEST_COLORS.line};border-radius:0 0 14px 14px;">
<div style="font-family:${DIGEST_FONT};font-size:12px;line-height:1.6;color:${DIGEST_COLORS.muted};"><strong style="color:${DIGEST_COLORS.text};">Repo Pulse</strong> ${how}. Recipients are managed in the sheet's <em>Recipients</em> tab; this digest covers activity since ${digestEsc_(context.meta.sinceLabel)}.</div>
</td></tr>`;
}

// ---------------------------------------------------------------- rich text

/**
 * Renders model/derived text as safe HTML: **bold** becomes <strong>, and an
 * owner/repo#N reference becomes a link only if that item is in `rows`.
 * Everything else is escaped.
 * @param {string} text
 * @param {object[]} rows - known items (their url is the only link target)
 * @returns {string}
 */
function digestRichHtml_(text, rows) {
  const formatted = formatInsightSummary(text, rows);
  const points = new Set([0, formatted.text.length]);
  formatted.bold.forEach(range => { points.add(range.start); points.add(range.end); });
  formatted.links.forEach(link => { points.add(link.start); points.add(link.end); });
  const sorted = Array.from(points).sort((a, b) => a - b);

  let html = '';
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const start = sorted[i];
    const end = sorted[i + 1];
    if (end <= start) continue;
    let piece = digestEsc_(formatted.text.slice(start, end));
    const link = formatted.links.find(l => l.start <= start && end <= l.end);
    const url = link ? digestSafeUrl_(link.url) : '';
    if (url) piece = `<a href="${digestEsc_(url)}" style="color:${DIGEST_COLORS.accent};text-decoration:underline;">${piece}</a>`;
    if (formatted.bold.some(r => r.start <= start && end <= r.end)) piece = `<strong>${piece}</strong>`;
    html += piece;
  }
  return html;
}

/**
 * @param {string} text
 * @param {object[]} rows
 * @returns {string} the text with ** markers removed (for the plain-text part and the preheader)
 */
function digestPlainRich_(text, rows) {
  return formatInsightSummary(text, rows).text;
}

// ---------------------------------------------------------------- plain text

/**
 * @param {object} context
 * @returns {string} the plain-text alternative: same sections, with the URLs spelled out
 */
function digestPlainText_(context) {
  const { meta, selection, rows } = context;
  const lines = [`REPO PULSE · ${meta.dateLabel}`, `Since ${meta.sinceLabel} · ${selection.stats.repos} ${selection.stats.repos === 1 ? 'repo' : 'repos'} tracked`, ''];

  if (context.quiet) {
    lines.push('ALL QUIET.', `Nothing shipped or moved since ${meta.sinceLabel}.`,
      `Open issues: ${selection.stats.openIssues} · Open PRs: ${selection.stats.openPrs}`, '');
  } else {
    lines.push(`Shipped: ${selection.shipped.length} · In motion: ${selection.active.length} · Need attention: ${selection.attention.length}`, '');
    if (meta.summary) lines.push('THE SHORT VERSION', digestPlainRich_(meta.summary, rows), '');
  }

  if (context.recs.length > 0) {
    lines.push('RECOMMENDED ACTIONS');
    context.recs.forEach((text, index) => lines.push(`${index + 1}. ${digestPlainRich_(text, rows)}`));
    lines.push('');
  }

  const addSection = (title, items, showReason, cap) => {
    if (items.length === 0) return;
    lines.push(`${title.toUpperCase()} (${items.length})`);
    items.slice(0, cap).forEach(item => {
      const priority = (DIGEST_PRIORITY_CHIPS[item.row.priority] || DIGEST_PRIORITY_CHIPS.none).label.toUpperCase();
      lines.push(`- [${priority}] ${item.row.title}`, `  ${digestItemMeta_(item, meta.now, showReason)}`);
      if (digestSafeUrl_(item.row.url)) lines.push(`  ${item.row.url}`);
    });
    if (items.length > cap) lines.push(`  + ${items.length - cap} more in the sheet`);
    lines.push('');
  };
  if (!context.quiet) {
    addSection('Shipped', selection.shipped, false, DIGEST_MAX_ITEMS_PER_SECTION);
    addSection('In motion', selection.active, false, DIGEST_MAX_ITEMS_PER_SECTION);
  }
  addSection('Needs attention', selection.attention, true, context.quiet ? DIGEST_QUIET_MAX_ATTENTION : DIGEST_MAX_ITEMS_PER_SECTION);

  if (digestSafeUrl_(meta.sheetUrl)) lines.push(`Open the dashboard: ${meta.sheetUrl}`, '');
  lines.push(`Repo Pulse ${meta.mode === 'manual' ? 'sent on demand from the sheet menu' : 'sent daily'}. Recipients are managed in the Recipients tab.`);
  return lines.join('\n');
}

// ---------------------------------------------------------------- helpers

/**
 * @param {any} value
 * @returns {string} HTML-escaped text (GitHub titles and repo names are untrusted)
 */
function digestEsc_(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * @param {any} url
 * @returns {string} the URL if it is https, else '' (never javascript:, data:, etc.)
 */
function digestSafeUrl_(url) {
  const text = String(url === null || url === undefined ? '' : url).trim();
  return /^https:\/\//i.test(text) ? text : '';
}
