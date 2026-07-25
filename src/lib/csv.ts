// Minimal RFC 4180 CSV parser.
//
// Hand-rolled rather than pulled from npm: the only CSV we parse is our own
// member-import template, and this keeps the dependency surface at zero.
// Handles quoted fields, embedded commas/newlines/quotes, CRLF, and a BOM.

/**
 * Parses CSV text into a grid of raw (untrimmed) cell strings.
 * Blank lines are skipped. A trailing newline does not produce an empty row.
 */
export function parseCsv(text: string): string[][] {
  // Strip UTF-8 BOM — Excel adds one when saving as "CSV UTF-8".
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false
  let fieldWasQuoted = false

  function endField() {
    row.push(field)
    field = ''
    fieldWasQuoted = false
  }

  function endRow() {
    endField()
    // Skip blank lines (a single empty, unquoted field).
    const isBlank = row.length === 1 && row[0] === ''
    if (!isBlank) rows.push(row)
    row = []
  }

  for (let i = 0; i < input.length; i++) {
    const char = input[i]

    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          // Escaped quote inside a quoted field.
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += char
      }
      continue
    }

    if (char === '"' && field === '') {
      inQuotes = true
      fieldWasQuoted = true
      continue
    }

    if (char === ',') {
      endField()
      continue
    }

    if (char === '\r') {
      // Consume CRLF as a single line break.
      if (input[i + 1] === '\n') i++
      endRow()
      continue
    }

    if (char === '\n') {
      endRow()
      continue
    }

    field += char
  }

  // Flush the final field/row unless the input ended exactly on a line break.
  if (field !== '' || fieldWasQuoted || row.length > 0) endRow()

  return rows
}

/** Serializes a grid back to CSV, quoting only cells that need it. */
export function toCsv(rows: string[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) =>
          /[",\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
        )
        .join(',')
    )
    .join('\r\n')
}
