import type { MetadataRoute } from 'next'

/**
 * What makes HomeKin installable.
 *
 * On its own this gets the app onto an iPhone or iPad home screen and into the
 * Mac Dock, with its own icon and no browser chrome, today and without anybody's
 * review. It is also the groundwork a Capacitor shell needs later — the icons,
 * the colours and the name all come from here rather than being restated in an
 * Xcode project.
 *
 * `background_color` is the cream the splash screen paints while the app boots,
 * and `theme_color` the rust the platform uses for the title bar. Neither can
 * vary by colour scheme — a manifest has one of each — so both are the light
 * values. The `viewport` export in layout.tsx does carry a dark variant, and
 * that is what the status bar actually follows once the app is running.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'HomeKin — Family Reunion',
    short_name: 'HomeKin',
    description:
      'Your family directory, its tree, and every moving part of a reunion: who is coming, what is happening, and who still owes what.',
    // Not /dashboard. Signed out, that redirects to /login and the very first
    // thing a newly installed app does is bounce; `/` is the one route that is
    // right either way, since the proxy sends a signed-in visitor onward.
    start_url: '/',
    scope: '/',
    display: 'standalone',
    // Deliberately unset rather than 'portrait': this has to be usable on a
    // 13-inch iPad in landscape, and locking orientation would be the first
    // thing an App Store reviewer noticed on a tablet.
    background_color: '#fbf2ea',
    theme_color: '#8a4924',
    categories: ['lifestyle', 'social', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      // Separate files, not the same ones re-declared. A launcher crops a
      // maskable icon to its own shape and keeps only the middle 80%, so these
      // are drawn inset — declaring the ordinary icon maskable is how you get a
      // house with its roof sliced off.
      {
        src: '/icons/icon-192-maskable.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icons/icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
