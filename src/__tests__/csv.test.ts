import { parseCsv, toCsv } from '@/lib/csv'

describe('parseCsv', () => {
  test('parses a simple header + row', () => {
    expect(parseCsv('name,email\nJane,jane@example.com')).toEqual([
      ['name', 'email'],
      ['Jane', 'jane@example.com'],
    ])
  })

  test('handles CRLF line endings', () => {
    expect(parseCsv('a,b\r\n1,2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  test('strips a UTF-8 BOM', () => {
    expect(parseCsv('﻿name,email\nJane,j@x.com')).toEqual([
      ['name', 'email'],
      ['Jane', 'j@x.com'],
    ])
  })

  test('preserves commas inside quoted fields', () => {
    expect(parseCsv('name,address\nJane,"123 Main St, Apt 4"')).toEqual([
      ['name', 'address'],
      ['Jane', '123 Main St, Apt 4'],
    ])
  })

  test('preserves newlines inside quoted fields', () => {
    expect(parseCsv('name,bio\nJane,"line one\nline two"')).toEqual([
      ['name', 'bio'],
      ['Jane', 'line one\nline two'],
    ])
  })

  test('unescapes doubled quotes inside quoted fields', () => {
    expect(parseCsv('name,nickname\nJane,"the ""Boss"""')).toEqual([
      ['name', 'nickname'],
      ['Jane', 'the "Boss"'],
    ])
  })

  test('keeps empty fields', () => {
    expect(parseCsv('a,b,c\n1,,3')).toEqual([
      ['a', 'b', 'c'],
      ['1', '', '3'],
    ])
  })

  test('keeps an explicitly quoted empty field as a row', () => {
    expect(parseCsv('a,b\n"",x')).toEqual([
      ['a', 'b'],
      ['', 'x'],
    ])
  })

  test('skips blank lines', () => {
    expect(parseCsv('a,b\n\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  test('ignores a single trailing newline', () => {
    expect(parseCsv('a,b\n1,2\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  test('handles ragged rows without padding them', () => {
    expect(parseCsv('a,b,c\n1,2')).toEqual([
      ['a', 'b', 'c'],
      ['1', '2'],
    ])
  })

  test('returns an empty array for empty input', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('\n')).toEqual([])
  })
})

describe('toCsv', () => {
  test('leaves plain cells unquoted', () => {
    expect(toCsv([['a', 'b']])).toBe('a,b')
  })

  test('quotes cells containing commas, quotes, or newlines', () => {
    expect(toCsv([['x,y', 'he said "hi"', 'one\ntwo']])).toBe(
      '"x,y","he said ""hi""","one\ntwo"'
    )
  })

  test('round-trips through parseCsv', () => {
    const rows = [
      ['name', 'address', 'bio'],
      ['Jane', '123 Main St, Apt 4', 'said "hello"\nthen left'],
    ]
    expect(parseCsv(toCsv(rows))).toEqual(rows)
  })
})
