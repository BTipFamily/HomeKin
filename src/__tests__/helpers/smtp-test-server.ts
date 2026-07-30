// A real SMTP server, on localhost, for tests.
//
// The point is to exercise the actual path a confirmation email takes —
// nodemailer, an SMTP session, AUTH, MIME encoding — rather than asserting that
// a mock was called. Everything Gmail would do to a message on the way through
// happens here too, which is how you catch things like a long confirmation link
// being soft-wrapped by quoted-printable encoding.

import { AddressInfo } from 'net'
import { SMTPServer } from 'smtp-server'
import { simpleParser, type ParsedMail } from 'mailparser'

export type CapturedMessage = {
  /** Envelope recipients — where BCC addresses actually live. */
  envelopeTo: string[]
  envelopeFrom: string
  parsed: ParsedMail
}

export type TestSmtpServer = {
  port: number
  messages: CapturedMessage[]
  /** Credentials the server will accept. */
  user: string
  pass: string
  close: () => Promise<void>
}

/**
 * Starts an SMTP server on an ephemeral port.
 *
 * Insecure auth is allowed because there is no certificate here; the real
 * connection to Gmail is TLS, which nodemailer handles the same way either way.
 */
export async function startTestSmtpServer({
  user = 'family@gmail.com',
  pass = 'app-password',
  rejectAuth = false,
  rejectRecipients = [] as string[],
} = {}): Promise<TestSmtpServer> {
  const messages: CapturedMessage[] = []

  const server = new SMTPServer({
    authMethods: ['PLAIN', 'LOGIN'],
    allowInsecureAuth: true,
    hideSTARTTLS: true,
    disabledCommands: [],

    onAuth(auth, _session, callback) {
      if (rejectAuth || auth.username !== user || auth.password !== pass) {
        // What Gmail returns for a bad app password.
        return callback(new Error('535-5.7.8 Username and Password not accepted'))
      }
      callback(null, { user: auth.username })
    },

    onRcptTo(address, _session, callback) {
      if (rejectRecipients.includes(address.address)) {
        return callback(new Error('550 5.1.1 No such user'))
      }
      callback()
    },

    onData(stream, session, callback) {
      const chunks: Buffer[] = []
      stream.on('data', (chunk: Buffer) => chunks.push(chunk))
      stream.on('end', async () => {
        try {
          const parsed = await simpleParser(Buffer.concat(chunks))
          messages.push({
            envelopeTo: session.envelope.rcptTo.map((r) => r.address),
            envelopeFrom: session.envelope.mailFrom
              ? session.envelope.mailFrom.address
              : '',
            parsed,
          })
          callback()
        } catch (e) {
          callback(e instanceof Error ? e : new Error('parse failed'))
        }
      })
    },
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })

  const port = (server.server.address() as AddressInfo).port

  return {
    port,
    messages,
    user,
    pass,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      }),
  }
}
