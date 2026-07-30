// The bits every HomeKin email shares: escaping, money and date formatting,
// and the wrapper markup.
//
// Email HTML has to be inline-styled and table-safe — Gmail strips <style>
// blocks and most clients ignore flexbox — so the house style lives here as
// functions rather than a stylesheet. Previously each sender hand-rolled its
// own copy of `escapeHtml` and its own wrapper, which is how two of them ended
// up with different widths.

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
const BRAND = '#2563eb'
const MUTED = '#666'
const RULE = '#e5e7eb'

/**
 * The one escaping helper.
 *
 * Everything interpolated into an email body must go through this: member
 * names, event names and committee-typed labels are all user input, and an
 * apostrophe in "O'Brien" should not be able to break the markup — let alone a
 * deliberate `<script>` in an event name.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** `$1,234.50`, and `-$40.00` for a refund. */
export function formatMoney(amount: number): string {
  const rounded = Math.round(amount * 100) / 100
  const sign = rounded < 0 ? '-' : ''
  const body = Math.abs(rounded).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  return `${sign}$${body}`
}

/**
 * `March 1, 2026` from a 'YYYY-MM-DD' string.
 *
 * Parsed as UTC rather than through `new Date(str)`, which treats a bare date
 * as midnight UTC and then renders it in local time — turning a deadline of the
 * 1st into "February 28" for anyone in the Americas.
 */
export function formatDate(date: string | null): string {
  if (!date) return ''
  const [y, m, d] = date.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return date
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export function button(href: string, label: string): string {
  return `
    <p style="margin:24px 0 0;">
      <a href="${escapeHtml(href)}"
         style="background:${BRAND};color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block;font-weight:600;font-size:15px;">
        ${escapeHtml(label)}
      </a>
    </p>
  `
}

/** A muted line of small print. */
export function note(text: string): string {
  return `<p style="font-size:13px;color:${MUTED};line-height:1.5;margin:16px 0 0;">${text}</p>`
}

/** A section heading inside the body. */
export function heading(text: string): string {
  return `<h2 style="font-size:15px;margin:28px 0 8px;color:#111;">${escapeHtml(text)}</h2>`
}

export type TableColumn = {
  label: string
  /** Money and counts read better right-aligned. */
  align?: 'left' | 'right'
}

/**
 * A simple bordered table.
 *
 * Cells are passed already-escaped so a caller can put a `<strong>` or a line
 * break in one, which the statement needs for its per-event breakdown.
 */
export function table(columns: TableColumn[], rows: string[][]): string {
  const head = columns
    .map(
      (c) =>
        `<th style="text-align:${c.align ?? 'left'};font-size:12px;text-transform:uppercase;letter-spacing:0.04em;color:${MUTED};font-weight:600;padding:0 8px 6px 0;border-bottom:1px solid ${RULE};">${escapeHtml(c.label)}</th>`
    )
    .join('')

  const body = rows
    .map(
      (row) =>
        `<tr>${row
          .map(
            (cell, i) =>
              `<td style="text-align:${columns[i]?.align ?? 'left'};font-size:14px;color:#111;padding:8px 8px 8px 0;border-bottom:1px solid ${RULE};vertical-align:top;">${cell}</td>`
          )
          .join('')}</tr>`
    )
    .join('')

  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:4px 0 0;"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`
}

/** A right-aligned label/amount pair for totals under a table. */
export function totalRow(label: string, amount: string, emphasis = false): string {
  const weight = emphasis ? '600' : '400'
  const size = emphasis ? '16px' : '14px'
  return `
    <tr>
      <td style="font-size:${size};font-weight:${weight};color:#111;padding:6px 8px 6px 0;">${escapeHtml(label)}</td>
      <td style="font-size:${size};font-weight:${weight};color:#111;padding:6px 0 6px 0;text-align:right;">${escapeHtml(amount)}</td>
    </tr>
  `
}

export function totals(rows: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:12px 0 0;"><tbody>${rows}</tbody></table>`
}

/**
 * Wraps a body in the standard shell.
 *
 * `preheader` is the grey line most clients show next to the subject in the
 * inbox list. Left unset it fills with whatever the first line of markup
 * happens to be, which for a table is nothing useful.
 */
export function emailShell(input: {
  title: string
  /** Small line above the title — usually the reunion name. */
  eyebrow?: string
  preheader?: string
  body: string
}): string {
  const preheader = input.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(input.preheader)}</div>`
    : ''

  const eyebrow = input.eyebrow
    ? `<p style="font-size:13px;color:${MUTED};margin:0 0 4px;">${escapeHtml(input.eyebrow)}</p>`
    : ''

  return `
    <div style="font-family:${FONT};max-width:560px;margin:0 auto;padding:24px;color:#111;">
      ${preheader}
      ${eyebrow}
      <h1 style="font-size:20px;margin:0 0 16px;">${escapeHtml(input.title)}</h1>
      ${input.body}
    </div>
  `
}
