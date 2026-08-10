import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Playfair_Display } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { ServiceWorker } from '@/components/service-worker'
import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

// Headings only — see the h1/h2/h3 rule in globals.css. Weights are limited to
// the two actually used so the download stays small.
const playfair = Playfair_Display({
  variable: '--font-playfair',
  subsets: ['latin'],
  weight: ['600', '700'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'HomeKin — Family Reunion',
  description: 'Plan and celebrate your family reunion',
  applicationName: 'HomeKin',
  // What the icon is labelled on an iPhone home screen. Without it iOS uses the
  // <title>, and "HomeKin — Family Reunion" truncates to "HomeKin —".
  appleWebApp: {
    capable: true,
    title: 'HomeKin',
    // Not 'black-translucent'. That one draws the page under the status bar,
    // which needs every screen to account for the inset or the clock sits on top
    // of the heading. 'default' lets iOS paint the bar in themeColor below.
    statusBarStyle: 'default',
  },
  // The app is invitation-only and holds a family's addresses and photographs.
  // Nothing here should ever appear in a search result.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // The status bar and the Mac title bar follow this. The background tokens
  // rather than the rust primary, so the bar blends into the page instead of
  // sitting on it as a stripe — and both schemes, because an installed app is
  // where a mismatch is most obvious.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fbf2ea' },
    { media: '(prefers-color-scheme: dark)', color: '#191310' },
  ],
  // Lets the page paint into the rounded corners and behind the home indicator,
  // which is what stops an installed app showing letterbox bars on a modern
  // iPhone. It also means content can land under the notch, so globals.css pads
  // the body by the safe-area insets to put it back.
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${playfair.variable} h-full`}
    >
      <body className="min-h-full bg-background text-foreground antialiased">
        {children}
        <Analytics />
        <ServiceWorker />
      </body>
    </html>
  )
}
