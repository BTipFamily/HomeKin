import {
  buildZip,
  sheetXml as sheet,
  STYLES_XML as STYLES,
  WORKBOOK_RELS_XML as RELS,
  WORKBOOK_XML as WORKBOOK,
} from './helpers/xlsx-fixture'
import { excelSerialToIsoDate, looksLikeLegacyXls, looksLikeZip, parseXlsx, XlsxError } from '@/lib/xlsx'

function buildXlsx(options: {
  sheet: string
  sharedStrings?: string[]
  styles?: string
}): Buffer {
  const files = [
    { name: 'xl/workbook.xml', content: WORKBOOK },
    { name: 'xl/_rels/workbook.xml.rels', content: RELS },
    { name: 'xl/worksheets/sheet1.xml', content: options.sheet },
    { name: 'xl/styles.xml', content: options.styles ?? STYLES },
  ]
  if (options.sharedStrings) {
    const items = options.sharedStrings.map((s) => `<si><t>${s}</t></si>`).join('')
    files.push({
      name: 'xl/sharedStrings.xml',
      content: `<?xml version="1.0"?><sst count="${options.sharedStrings.length}">${items}</sst>`,
    })
  }
  return buildZip(files)
}

// ---------------------------------------------------------------------------

describe('file sniffing', () => {
  test('recognizes a zip container', () => {
    expect(looksLikeZip(buildXlsx({ sheet: sheet('') }))).toBe(true)
    expect(looksLikeZip(Buffer.from('name,email\nJane,j@x.com'))).toBe(false)
  })

  test('recognizes a legacy OLE2 .xls', () => {
    const ole = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00])
    expect(looksLikeLegacyXls(ole)).toBe(true)
    expect(looksLikeLegacyXls(buildXlsx({ sheet: sheet('') }))).toBe(false)
  })
})

describe('excelSerialToIsoDate', () => {
  test('converts serials on both sides of the 1900 leap-year bug', () => {
    expect(excelSerialToIsoDate(1)).toBe('1900-01-01')
    expect(excelSerialToIsoDate(59)).toBe('1900-02-28')
    expect(excelSerialToIsoDate(61)).toBe('1900-03-01')
    expect(excelSerialToIsoDate(25569)).toBe('1970-01-01')
    expect(excelSerialToIsoDate(45000)).toBe('2023-03-15')
  })

  test('rejects out-of-range values', () => {
    expect(excelSerialToIsoDate(0)).toBeNull()
    expect(excelSerialToIsoDate(-5)).toBeNull()
    expect(excelSerialToIsoDate(Number.NaN)).toBeNull()
  })
})

describe('parseXlsx', () => {
  test('reads shared strings into a grid', () => {
    const buf = buildXlsx({
      sharedStrings: ['name', 'email', 'Jane', 'jane@example.com'],
      sheet: sheet(
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
          '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>'
      ),
    })
    expect(parseXlsx(buf)).toEqual([
      ['name', 'email'],
      ['Jane', 'jane@example.com'],
    ])
  })

  test('reads inline strings and formula results', () => {
    const buf = buildXlsx({
      sheet: sheet(
        '<row r="1"><c r="A1" t="inlineStr"><is><t>name</t></is></c>' +
          '<c r="B1" t="str"><v>Jane Smith</v></c></row>'
      ),
    })
    expect(parseXlsx(buf)).toEqual([['name', 'Jane Smith']])
  })

  test('pads skipped cells so columns stay aligned with the header', () => {
    const buf = buildXlsx({
      sharedStrings: ['a', 'b', 'c', 'z'],
      sheet: sheet(
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>' +
          // B2 is empty and therefore absent from the file entirely.
          '<row r="2"><c r="A2"><v>1</v></c><c r="C2" t="s"><v>3</v></c></row>'
      ),
    })
    expect(parseXlsx(buf)).toEqual([
      ['a', 'b', 'c'],
      ['1', '', 'z'],
    ])
  })

  test('converts date-formatted numbers to ISO dates', () => {
    const buf = buildXlsx({
      sharedStrings: ['date_of_birth'],
      sheet: sheet(
        '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
          // s="1" is numFmtId 14 (a built-in date format).
          '<row r="2"><c r="A2" s="1"><v>25569</v></c></row>'
      ),
    })
    expect(parseXlsx(buf)).toEqual([['date_of_birth'], ['1970-01-01']])
  })

  test('leaves plain numbers alone', () => {
    const buf = buildXlsx({
      // s="2" is numFmtId 2 ("0.00"), not a date.
      sheet: sheet('<row r="1"><c r="A1" s="2"><v>25569</v></c></row>'),
    })
    expect(parseXlsx(buf)).toEqual([['25569']])
  })

  test('honours a custom date format code', () => {
    const styles = `<styleSheet><numFmts><numFmt numFmtId="165" formatCode="mm/dd/yyyy"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="165"/></cellXfs></styleSheet>`
    const buf = buildXlsx({
      styles,
      sheet: sheet('<row r="1"><c r="A1" s="1"><v>45000</v></c></row>'),
    })
    expect(parseXlsx(buf)).toEqual([['2023-03-15']])
  })

  test('does not mistake an elapsed-time format for a date', () => {
    const styles = `<styleSheet><numFmts><numFmt numFmtId="166" formatCode="[mm]:ss"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="166"/></cellXfs></styleSheet>`
    const buf = buildXlsx({
      styles,
      sheet: sheet('<row r="1"><c r="A1" s="1"><v>90</v></c></row>'),
    })
    expect(parseXlsx(buf)).toEqual([['90']])
  })

  test('joins rich-text runs and decodes entities and _x000D_ escapes', () => {
    const files = [
      { name: 'xl/workbook.xml', content: WORKBOOK },
      { name: 'xl/_rels/workbook.xml.rels', content: RELS },
      {
        name: 'xl/sharedStrings.xml',
        content:
          '<sst><si><r><t>Jos</t></r><r><t>&#233; &amp; Co</t></r></si>' +
          '<si><t>123 Main St_x000D_\nApt 4</t></si></sst>',
      },
      {
        name: 'xl/worksheets/sheet1.xml',
        content: sheet(
          '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>'
        ),
      },
    ]
    expect(parseXlsx(buildZip(files))).toEqual([['José & Co', '123 Main St\r\nApt 4']])
  })

  test('drops rows that are entirely blank', () => {
    const buf = buildXlsx({
      sharedStrings: ['name'],
      sheet: sheet(
        '<row r="1"><c r="A1" t="s"><v>0</v></c></row>' +
          '<row r="2"><c r="A2" s="0"/></row>' +
          '<row r="3"/>'
      ),
    })
    expect(parseXlsx(buf)).toEqual([['name']])
  })

  test('reads stored (uncompressed) entries', () => {
    const files = [
      { name: 'xl/workbook.xml', content: WORKBOOK, store: true },
      { name: 'xl/_rels/workbook.xml.rels', content: RELS, store: true },
      {
        name: 'xl/worksheets/sheet1.xml',
        content: sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>hi</t></is></c></row>'),
        store: true,
      },
    ]
    expect(parseXlsx(buildZip(files))).toEqual([['hi']])
  })

  test('falls back to sheet1.xml when the relationship is missing', () => {
    const files = [
      {
        name: 'xl/worksheets/sheet1.xml',
        content: sheet('<row r="1"><c r="A1" t="inlineStr"><is><t>ok</t></is></c></row>'),
      },
    ]
    expect(parseXlsx(buildZip(files))).toEqual([['ok']])
  })

  test('rejects a file that is not a zip', () => {
    expect(() => parseXlsx(Buffer.from('name,email\nJane,j@x.com'))).toThrow(XlsxError)
  })
})
