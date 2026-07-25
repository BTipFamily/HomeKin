// Minimal .xlsx reader: enough of ZIP + SpreadsheetML to turn the first
// worksheet of an Excel/Google Sheets export into the same string[][] grid
// parseCsv produces.
//
// Hand-rolled rather than pulled from npm for the same reason as csv.ts: the
// only workbooks we open are our own directory-import template, and the two
// maintained npm readers are either deprecated on the registry or an order of
// magnitude larger than the ~300 lines below. Node's zlib already does the
// only genuinely hard part (DEFLATE).
//
// Server-only — do not import this from a client component.

import { inflateRawSync } from 'node:zlib'

/** Thrown for a file we recognize as a workbook but cannot read. */
export class XlsxError extends Error {}

// ---------------------------------------------------------------------------
// File-type sniffing
// ---------------------------------------------------------------------------

/** .xlsx (and every other OOXML file) is a ZIP: "PK\x03\x04". */
export function looksLikeZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

/** Legacy .xls is an OLE2 compound document: D0 CF 11 E0 A1 B1 1A E1. */
export function looksLikeLegacyXls(bytes: Uint8Array): boolean {
  const magic = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
  return magic.every((b, i) => bytes[i] === b)
}

// ---------------------------------------------------------------------------
// ZIP central directory
// ---------------------------------------------------------------------------

const EOCD_SIG = 0x06054b50
const CEN_SIG = 0x02014b50
const LOC_SIG = 0x04034b50

type ZipEntry = { method: number; compressedSize: number; localOffset: number }

/** Reads the central directory into a name -> entry map. */
function readZipIndex(buf: Buffer): Map<string, ZipEntry> {
  // The end-of-central-directory record sits at the very end, after a comment
  // of up to 65535 bytes. Scan backwards for its signature.
  const minEocd = 22
  const scanFrom = Math.max(0, buf.length - (minEocd + 0xffff))
  let eocd = -1
  for (let i = buf.length - minEocd; i >= scanFrom; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) {
      eocd = i
      break
    }
  }
  if (eocd === -1) throw new XlsxError('That file is not a readable spreadsheet.')

  const entryCount = buf.readUInt16LE(eocd + 10)
  const cenOffset = buf.readUInt32LE(eocd + 16)
  if (entryCount === 0xffff || cenOffset === 0xffffffff) {
    throw new XlsxError(
      'That workbook uses the ZIP64 format, which we cannot read. Please re-save it as CSV.'
    )
  }

  const index = new Map<string, ZipEntry>()
  let p = cenOffset
  for (let i = 0; i < entryCount; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN_SIG) break
    const method = buf.readUInt16LE(p + 10)
    const compressedSize = buf.readUInt32LE(p + 20)
    const nameLen = buf.readUInt16LE(p + 28)
    const extraLen = buf.readUInt16LE(p + 30)
    const commentLen = buf.readUInt16LE(p + 32)
    const localOffset = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    index.set(name, { method, compressedSize, localOffset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return index
}

/** Inflates one member of the archive to a UTF-8 string. */
function readZipFile(buf: Buffer, index: Map<string, ZipEntry>, name: string): string | null {
  const entry = index.get(name)
  if (!entry) return null

  const p = entry.localOffset
  if (buf.readUInt32LE(p) !== LOC_SIG) throw new XlsxError('That spreadsheet appears to be damaged.')
  // The local header repeats the name/extra lengths, and they can differ from
  // the central directory's — always trust the local ones for the data offset.
  const nameLen = buf.readUInt16LE(p + 26)
  const extraLen = buf.readUInt16LE(p + 28)
  const start = p + 30 + nameLen + extraLen
  const raw = buf.subarray(start, start + entry.compressedSize)

  if (entry.method === 0) return raw.toString('utf8')
  if (entry.method === 8) {
    try {
      return inflateRawSync(raw).toString('utf8')
    } catch {
      throw new XlsxError('That spreadsheet appears to be damaged.')
    }
  }
  throw new XlsxError('That spreadsheet uses an unsupported compression method.')
}

// ---------------------------------------------------------------------------
// XML helpers
// ---------------------------------------------------------------------------

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

/**
 * Excel escapes characters that are illegal in XML (notably the CR in a
 * multi-line cell) as _xHHHH_. Undo that after entity decoding.
 */
function decodeXmlEscapes(text: string): string {
  return decodeEntities(text).replace(/_x([0-9a-fA-F]{4})_/g, (_, hex) =>
    String.fromCodePoint(parseInt(hex, 16))
  )
}

function attr(tag: string, name: string): string | null {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*"([^"]*)"`))
  return match ? decodeEntities(match[1]) : null
}

/** Concatenates every <t> descendant, which is how rich-text runs are stored. */
function joinTextNodes(xml: string): string {
  let out = ''
  const re = /<t(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/t>)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out += m[1] ?? ''
  return decodeXmlEscapes(out)
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

// Built-in number formats that render as a date or date+time.
const BUILTIN_DATE_FORMATS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 50, 57, 59])

/**
 * A custom format is a date format if, after stripping quoted literals,
 * escaped characters, colour/condition brackets and the currency-ish [$...]
 * section, a y or d token survives. Requiring y-or-d keeps "0.00" and
 * elapsed-time formats like [mm]:ss from being mistaken for dates.
 */
function isDateFormatCode(code: string): boolean {
  const stripped = code
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[[^\]]*\]/g, '')
  return /[yd]/i.test(stripped)
}

/**
 * Excel counts days from 1900-01-01 = 1 but also believes 1900 was a leap year,
 * so serial 60 is the phantom 1900-02-29. Using a 1899-12-30 epoch absorbs that
 * off-by-one for every date from 1900-03-01 on; the handful of serials below it
 * need the true 1899-12-31 epoch instead.
 */
export function excelSerialToIsoDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 2_958_465) return null
  const days = Math.round(serial)
  const epoch = days < 60 ? Date.UTC(1899, 11, 31) : Date.UTC(1899, 11, 30)
  const ms = days * 86_400_000 + epoch
  const date = new Date(ms)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

/** Maps each cellXfs style index to true when that style renders a date. */
function readDateStyles(stylesXml: string | null): boolean[] {
  if (!stylesXml) return []

  const customIsDate = new Map<number, boolean>()
  const numFmtRe = /<numFmt\s[^>]*\/>/g
  let m: RegExpExecArray | null
  while ((m = numFmtRe.exec(stylesXml)) !== null) {
    const id = Number(attr(m[0], 'numFmtId'))
    const code = attr(m[0], 'formatCode')
    if (Number.isFinite(id) && code !== null) customIsDate.set(id, isDateFormatCode(code))
  }

  // Only the <cellXfs> block is indexed by a cell's s="" attribute; <cellStyleXfs>
  // shares the same <xf> tag name, so slice the right block out first.
  const block = stylesXml.match(/<cellXfs[\s\S]*?<\/cellXfs>/)
  if (!block) return []

  const out: boolean[] = []
  const xfRe = /<xf\s[^>]*?(?:\/>|>)/g
  while ((m = xfRe.exec(block[0])) !== null) {
    const id = Number(attr(m[0], 'numFmtId') ?? '0')
    out.push(customIsDate.get(id) ?? BUILTIN_DATE_FORMATS.has(id))
  }
  return out
}

// ---------------------------------------------------------------------------
// Worksheet
// ---------------------------------------------------------------------------

/** "BC12" -> 54 (0-based column index). */
function columnIndex(ref: string): number {
  let n = 0
  for (const char of ref) {
    const code = char.charCodeAt(0)
    if (code < 65 || code > 90) break
    n = n * 26 + (code - 64)
  }
  return n - 1
}

function readSharedStrings(xml: string | null): string[] {
  if (!xml) return []
  const out: string[] = []
  const re = /<si(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/si>)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(xml)) !== null) out.push(m[1] ? joinTextNodes(m[1]) : '')
  return out
}

/** Resolves the first sheet listed in the workbook to its part name. */
function firstSheetPath(
  workbookXml: string | null,
  relsXml: string | null,
  index: Map<string, ZipEntry>
): string {
  const sheetTag = workbookXml?.match(/<sheet\s[^>]*\/?>/)?.[0]
  const relId = sheetTag ? attr(sheetTag, 'r:id') ?? attr(sheetTag, 'id') : null

  if (relId && relsXml) {
    const relRe = /<Relationship\s[^>]*\/>/g
    let m: RegExpExecArray | null
    while ((m = relRe.exec(relsXml)) !== null) {
      if (attr(m[0], 'Id') !== relId) continue
      const target = attr(m[0], 'Target')
      if (!target) break
      // Targets are relative to xl/ and may be written with a leading slash.
      const path = target.startsWith('/')
        ? target.slice(1)
        : `xl/${target.replace(/^\.\//, '')}`
      if (index.has(path)) return path
      break
    }
  }

  if (index.has('xl/worksheets/sheet1.xml')) return 'xl/worksheets/sheet1.xml'
  const any = [...index.keys()].find((k) => /^xl\/worksheets\/[^/]+\.xml$/.test(k))
  if (any) return any
  throw new XlsxError('That workbook has no readable worksheet.')
}

function readSheet(xml: string, shared: string[], dateStyles: boolean[]): string[][] {
  const rows: string[][] = []

  const rowRe = /<row(?:\s[^>]*)?(?:\/>|>([\s\S]*?)<\/row>)/g
  let rowMatch: RegExpExecArray | null
  while ((rowMatch = rowRe.exec(xml)) !== null) {
    const body = rowMatch[1] ?? ''
    const cells: string[] = []

    const cellRe = /<c(\s[^>]*)?(?:\/>|>([\s\S]*?)<\/c>)/g
    let cellMatch: RegExpExecArray | null
    while ((cellMatch = cellRe.exec(body)) !== null) {
      const tag = cellMatch[1] ?? ''
      const inner = cellMatch[2] ?? ''

      // Honour the cell reference so skipped (empty) cells keep later columns
      // aligned with the header row.
      const ref = attr(`<c${tag}>`, 'r')
      const col = ref ? columnIndex(ref) : cells.length
      while (cells.length < col) cells.push('')

      cells[col] = readCellValue(tag, inner, shared, dateStyles)
    }

    rows.push(cells.map((c) => c ?? ''))
  }

  // Excel keeps trailing rows/columns that were only ever formatted. Drop the
  // fully blank ones so the header/row counting downstream matches what the
  // user sees.
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c.trim() === '')) rows.pop()
  return rows.filter((row) => row.some((c) => c.trim() !== ''))
}

function readCellValue(
  tag: string,
  inner: string,
  shared: string[],
  dateStyles: boolean[]
): string {
  const type = attr(`<c${tag}>`, 't') ?? 'n'

  if (type === 'inlineStr') return joinTextNodes(inner)

  const rawValue = inner.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)?.[1]
  if (rawValue === undefined) return ''
  const value = decodeXmlEscapes(rawValue)

  switch (type) {
    case 's': {
      const i = Number(value)
      return shared[i] ?? ''
    }
    case 'b':
      return value === '1' ? 'TRUE' : 'FALSE'
    case 'e':
      return '' // #REF!, #N/A and friends import as blank.
    case 'str':
      return value
    default: {
      // Numeric — render date-formatted cells as ISO so the importer's date
      // columns work whether the user typed text or a real date.
      const styleIndex = Number(attr(`<c${tag}>`, 's') ?? '')
      if (Number.isFinite(styleIndex) && dateStyles[styleIndex]) {
        const iso = excelSerialToIsoDate(Number(value))
        if (iso) return iso
      }
      return value
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Parses the first worksheet of an .xlsx workbook into a grid of cell strings,
 * matching the shape parseCsv returns.
 */
export function parseXlsx(bytes: Uint8Array): string[][] {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes)
  const index = readZipIndex(buf)

  const workbook = readZipFile(buf, index, 'xl/workbook.xml')
  const rels = readZipFile(buf, index, 'xl/_rels/workbook.xml.rels')
  const sheetPath = firstSheetPath(workbook, rels, index)

  const sheetXml = readZipFile(buf, index, sheetPath)
  if (sheetXml === null) throw new XlsxError('That workbook has no readable worksheet.')

  const shared = readSharedStrings(readZipFile(buf, index, 'xl/sharedStrings.xml'))
  const dateStyles = readDateStyles(readZipFile(buf, index, 'xl/styles.xml'))

  return readSheet(sheetXml, shared, dateStyles)
}
