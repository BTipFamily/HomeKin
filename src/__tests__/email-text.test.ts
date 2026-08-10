import { describe, it, expect } from 'vitest'
import { htmlToText } from '@/lib/email-text'
import { inviteEmailHtml } from '@/lib/invite-email'
import { emailShell, button, note, heading, table, totals, totalRow } from '@/lib/email-layout'

// What the text/plain half of every email is built from.
//
// The rule these are all defending: a text part that has lost its link is worse
// than no text part at all, because it reads as a complete message that cannot
// be acted on.

const SIGNUP_URL = 'https://home-kin-vxzs.vercel.app/signup?code=FPELS4TQ'

const INVITE = inviteEmailHtml({
  signupUrl: SIGNUP_URL,
  inviterName: 'William Tipton',
  recipientName: 'Ali',
  expiresOn: '2026-09-08',
})

describe('the invite, converted', () => {
  const text = htmlToText(INVITE)

  it('keeps the signup link intact', () => {
    expect(text).toContain(SIGNUP_URL)
  })

  it('labels the link instead of leaving a bare button caption', () => {
    expect(text).toContain(`Set up my account: ${SIGNUP_URL}`)
  })

  it('greets the person by name', () => {
    expect(text).toContain('Hi Ali,')
  })

  it('still says when the invite expires', () => {
    expect(text).toContain('September 8, 2026')
  })

  it('leaves no markup behind', () => {
    expect(text).not.toMatch(/<[a-z/!]/i)
    expect(text).not.toContain('style=')
  })

  it('leaves no undecoded entities behind', () => {
    expect(text).not.toMatch(/&(amp|lt|gt|quot|rsquo|nbsp|#39);/)
  })

  it('does not leak a structural marker as visible text', () => {
    expect(text).not.toMatch(/[\u0000-\u0002]/)
    expect(text).not.toContain('BREAK')
  })

  it('drops the hidden preheader rather than repeating the subject', () => {
    // The preheader duplicates the opening line; emitted, it reads twice.
    expect(text).not.toContain('Set up your HomeKin account.')
    expect(text.match(/expires on September 8, 2026/g)?.length ?? 0).toBe(1)
  })

  it('does not print the same URL twice in a row', () => {
    expect(text).not.toContain(`${SIGNUP_URL}: ${SIGNUP_URL}`)
  })

  it('reads as paragraphs, not one run-on line', () => {
    expect(text.split('\n\n').length).toBeGreaterThan(2)
  })

  it('never runs to three blank lines', () => {
    expect(text).not.toMatch(/\n{3}/)
  })
})

describe('the layout helpers, converted', () => {
  it('turns a table into one readable line per row', () => {
    const html = table(
      [{ label: 'Event' }, { label: 'Amount', align: 'right' }],
      [
        ['Saturday banquet', '$120.00'],
        ['Sunday picnic', '$45.00'],
      ]
    )
    const text = htmlToText(html)
    expect(text).toContain('Event | Amount')
    expect(text).toContain('Saturday banquet | $120.00')
    expect(text).toContain('Sunday picnic | $45.00')
  })

  it('keeps totals attached to their labels', () => {
    const text = htmlToText(totals(totalRow('Balance due', '$165.00', true)))
    expect(text).toContain('Balance due | $165.00')
  })

  it('keeps a heading on its own line', () => {
    const text = htmlToText(`${heading('What you owe')}<p>Details below.</p>`)
    expect(text.split('\n')[0]).toBe('What you owe')
  })

  it('turns a <br> inside a note into a line break, not a paragraph', () => {
    const text = htmlToText(note('First line<br>Second line'))
    expect(text).toBe('First line\nSecond line')
  })

  it('unescapes what escapeHtml wrote, so O&#39;Brien reads as a name', () => {
    const text = htmlToText(emailShell({ title: "The O'Briens & the Tiptons", body: '' }))
    expect(text).toContain("The O'Briens & the Tiptons")
  })

  it('prints a bare URL once when the link text is the URL', () => {
    const text = htmlToText(`<p><a href="${SIGNUP_URL}">${SIGNUP_URL}</a></p>`)
    expect(text).toBe(SIGNUP_URL)
  })

  it('survives a button whose label is spread over several lines', () => {
    // `button` writes its label indented across three lines of source.
    const text = htmlToText(button(SIGNUP_URL, 'Set up my account'))
    expect(text).toBe(`Set up my account: ${SIGNUP_URL}`)
  })
})

describe('hostile input', () => {
  it('does not let an escaped tag in a member name become markup again', () => {
    // escapeHtml turns this into &lt;script&gt;; decoding happens after the tag
    // strip, so it comes out as visible text rather than being stripped.
    const text = htmlToText(emailShell({ title: '<script>alert(1)</script>', body: '' }))
    expect(text).toBe('<script>alert(1)</script>')
  })

  it('returns an empty string for an empty body rather than throwing', () => {
    expect(htmlToText('')).toBe('')
  })
})
