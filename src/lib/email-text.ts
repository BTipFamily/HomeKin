// The plain-text half of every email.
//
// Every message this app sends used to go out as a single text/html part, with
// no text/plain alternative. That is a long-standing spam signal on its own, and
// here it compounded with everything else about the profile — first contact from
// a personal Gmail address, a large call-to-action button, a link on a
// random-looking *.vercel.app hostname. An invite that Gmail accepted, filed in
// Sent, and never bounced simply did not arrive.
//
// The text is derived from the HTML rather than hand-written per sender. There
// are eight call sites across seven files, and a second body written out
// longhand in each is eight things to keep in step with their markup — the first
// one to drift would do so silently, and nobody reads the text part often enough
// to notice. Deriving covers all eight, and the ninth nobody has written yet.
//
// That is only safe because the input is not arbitrary HTML. It comes from the
// helpers in email-layout.ts — button, note, heading, table, totalRow, totals,
// emailShell — a vocabulary small enough to convert properly rather than
// approximately. This is not a general-purpose converter and should not be used
// as one.

/** Entities `escapeHtml` produces, plus the few the templates write by hand. */
const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
  '&#39;': "'",
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&rdquo;': '”',
  '&ldquo;': '“',
  '&mdash;': '—',
  '&ndash;': '–',
  '&nbsp;': ' ',
  '&times;': '×',
}

// One pass, alternating over the whole set: decoding `&amp;` separately and
// first would turn a literal `&amp;lt;` into `<`.
const ENTITY_RE = new RegExp(Object.keys(ENTITIES).join('|'), 'g')

function decodeEntities(value: string): string {
  return value.replace(ENTITY_RE, (match) => ENTITIES[match] ?? match)
}

// Structure has to survive both the tag strip and the whitespace collapse, so it
// is carried by control characters rather than by words or spacing. Anything
// spelled with spaces around it — ' BREAK ' — gets welded to its neighbour by
// the collapse and reappears as literal text in somebody's inbox.
const BREAK = '\u0000'
const NEWLINE = '\u0001'
const CELL = '\u0002'

/**
 * Turns one of our email bodies into readable plain text.
 *
 * The link handling is the part that matters: an invite whose text part has lost
 * its signup URL is worse than no text part at all, because it reads as a
 * complete message that cannot be acted on.
 */
export function htmlToText(html: string): string {
  let text = html

  // The preheader is a hidden duplicate of the subject line, shown by inbox
  // lists beside the subject. In text it would read as the same sentence twice.
  text = text.replace(/<div[^>]*display:\s*none[^>]*>[\s\S]*?<\/div>/gi, '')

  // Anchors become "Label: URL". The href is the thing worth keeping — the label
  // on its own ("Set up my account") tells the reader nothing they can act on.
  text = text.replace(
    /<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
    (_match, href: string, label: string) => {
      const url = decodeEntities(href).trim()
      const words = decodeEntities(stripTags(label)).replace(/\s+/g, ' ').trim()
      // The invite prints its link twice by design — once as a button, once as
      // copyable text. Repeating "https://… : https://…" helps nobody.
      if (!words || words === url) return url
      return `${words}: ${url}`
    }
  )

  text = text.replace(/<br\s*\/?>/gi, NEWLINE)

  // Cells before rows: a `</td></tr>` pair has to become one separator and one
  // break, not two breaks.
  text = text.replace(/<\/t[dh]>\s*(?=<t[dh]\b)/gi, CELL)
  text = text.replace(/<\/(p|div|h1|h2|h3|tr|li|table|thead|tbody)>/gi, BREAK)
  text = text.replace(/<(hr|li)\b[^>]*>/gi, BREAK)

  text = stripTags(text)
  text = decodeEntities(text)

  // Every remaining run of whitespace is markup indentation, not content: the
  // templates are written across many lines for legibility.
  text = text.replace(/\s+/g, ' ')

  text = text.split(CELL).join(' | ')
  text = text.split(NEWLINE).join('\n')
  text = text.split(BREAK).join('\n\n')

  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '')
}
