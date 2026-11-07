// Copying a member's own Facebook picture.
//
// The invariants worth protecting: the server only ever requests Facebook's
// own hosts, at every redirect; the grey default silhouette is never copied;
// and the profile ends up pointing at HomeKin's stored copy, never at an
// expiring Facebook URL.

import {
  MAX_PHOTO_BYTES,
  downloadFacebookImage,
  importFacebookPhoto,
  isFacebookImageHost,
  readPictureResponse,
} from '@/lib/facebook-photo'
import type { SupabaseClient } from '@supabase/supabase-js'

const CDN = 'https://scontent-lga3-1.xx.fbcdn.net/v/t39/123_n.jpg?oh=a&oe=b'

function imageResponse(
  bytes = 1024,
  type = 'image/jpeg',
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'content-type': type, ...extraHeaders },
  })
}

function redirect(location: string): Response {
  return new Response(null, { status: 302, headers: { location } })
}

/** A fetch that answers from a list, recording what it was asked for. */
function scriptedFetch(responses: Response[]) {
  const calls: string[] = []
  const impl = (async (input: RequestInfo | URL) => {
    calls.push(String(input))
    const next = responses.shift()
    if (!next) throw new Error('unexpected fetch')
    return next
  }) as typeof fetch
  return { impl, calls }
}

/** Just enough of the service client for importFacebookPhoto. */
function fakeService() {
  const uploads: { path: string; contentType?: string }[] = []
  const updates: { photo_url: string; id: string }[] = []
  const service = {
    storage: {
      from: () => ({
        upload: async (path: string, _b: ArrayBuffer, opts: { contentType?: string }) => {
          uploads.push({ path, contentType: opts.contentType })
          return { error: null }
        },
        getPublicUrl: (path: string) => ({
          data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/profile-photos/${path}` },
        }),
      }),
    },
    from: () => ({
      update: (row: { photo_url: string }) => ({
        eq: async (_col: string, id: string) => {
          updates.push({ ...row, id })
          return { error: null }
        },
      }),
    }),
  } as unknown as SupabaseClient
  return { service, uploads, updates }
}

describe('isFacebookImageHost', () => {
  test("accepts Facebook's Graph API and image CDNs", () => {
    expect(isFacebookImageHost(CDN)).toBe(true)
    expect(isFacebookImageHost('https://graph.facebook.com/v25.0/me/picture')).toBe(true)
    expect(isFacebookImageHost('https://platform-lookaside.fbsbx.com/platform/profilepic/')).toBe(true)
  })

  test('rejects anything else, including look-alikes', () => {
    expect(isFacebookImageHost('https://evil.com/a.jpg')).toBe(false)
    expect(isFacebookImageHost('https://fbcdn.net.evil.com/a.jpg')).toBe(false)
    expect(isFacebookImageHost('https://evilfbcdn.net/a.jpg')).toBe(false)
    expect(isFacebookImageHost('https://facebook.com/someone')).toBe(false)
    expect(isFacebookImageHost('not a url')).toBe(false)
  })

  test('rejects plain http even on a Facebook host', () => {
    expect(isFacebookImageHost('http://scontent.xx.fbcdn.net/a.jpg')).toBe(false)
  })
})

describe('readPictureResponse', () => {
  test('returns the URL of a real picture', () => {
    expect(readPictureResponse({ data: { url: CDN, is_silhouette: false } })).toEqual({
      status: 'found',
      url: CDN,
    })
  })

  test('recognises the default silhouette', () => {
    expect(readPictureResponse({ data: { url: CDN, is_silhouette: true } })).toEqual({
      status: 'silhouette',
    })
  })

  test('refuses a picture URL off Facebook', () => {
    expect(readPictureResponse({ data: { url: 'https://evil.com/a.jpg' } }).status).toBe('error')
  })

  test("passes on Facebook's own error message", () => {
    const result = readPictureResponse({ error: { message: 'Invalid OAuth access token.' } })
    expect(result).toEqual({ status: 'error', reason: 'Invalid OAuth access token.' })
  })
})

describe('downloadFacebookImage', () => {
  test('downloads a JPEG', async () => {
    const { impl } = scriptedFetch([imageResponse()])
    const result = await downloadFacebookImage(CDN, impl)
    expect(result).toMatchObject({ status: 'ok', contentType: 'image/jpeg', extension: 'jpg' })
  })

  test('follows a redirect that stays on Facebook', async () => {
    const { impl, calls } = scriptedFetch([redirect(CDN), imageResponse()])
    const result = await downloadFacebookImage('https://graph.facebook.com/123/picture', impl)
    expect(result.status).toBe('ok')
    expect(calls).toEqual(['https://graph.facebook.com/123/picture', CDN])
  })

  test('refuses to follow a redirect off Facebook, and never requests it', async () => {
    const { impl, calls } = scriptedFetch([redirect('http://169.254.169.254/latest/meta-data')])
    const result = await downloadFacebookImage(CDN, impl)
    expect(result.status).toBe('error')
    expect(calls).toEqual([CDN])
  })

  test('rejects something that is not an image', async () => {
    const { impl } = scriptedFetch([imageResponse(100, 'text/html')])
    expect((await downloadFacebookImage(CDN, impl)).status).toBe('error')
  })

  test('rejects an image over the bucket limit, by header or by size', async () => {
    const declared = scriptedFetch([
      imageResponse(10, 'image/jpeg', { 'content-length': String(MAX_PHOTO_BYTES + 1) }),
    ])
    expect((await downloadFacebookImage(CDN, declared.impl)).status).toBe('error')

    const actual = scriptedFetch([imageResponse(MAX_PHOTO_BYTES + 1)])
    expect((await downloadFacebookImage(CDN, actual.impl)).status).toBe('error')
  })

  test('gives up after too many redirects', async () => {
    const { impl } = scriptedFetch([redirect(CDN), redirect(CDN), redirect(CDN), redirect(CDN)])
    expect(await downloadFacebookImage(CDN, impl)).toEqual({
      status: 'error',
      reason: 'Too many redirects',
    })
  })
})

describe('importFacebookPhoto', () => {
  const lookup = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

  test('stores the picture and points the profile at the stored copy', async () => {
    const { service, uploads, updates } = fakeService()
    const { impl, calls } = scriptedFetch([
      lookup({ data: { url: CDN, is_silhouette: false } }),
      imageResponse(2048, 'image/png'),
    ])
    const result = await importFacebookPhoto({
      service,
      memberId: 'm1',
      providerToken: 'tok',
      fetchImpl: impl,
      now: () => 42,
    })

    expect(calls[0]).toMatch(/^https:\/\/graph\.facebook\.com\/v[\d.]+\/me\/picture\?/)
    expect(uploads).toEqual([{ path: 'm1/facebook-42.png', contentType: 'image/png' }])
    expect(updates).toHaveLength(1)
    expect(updates[0].id).toBe('m1')
    // HomeKin's copy, never the expiring Facebook URL.
    expect(updates[0].photo_url).toMatch(/\/profile-photos\/m1\/facebook-42\.png$/)
    expect(result).toEqual({ status: 'ok', photoUrl: updates[0].photo_url })
  })

  test('copies nothing for the default silhouette', async () => {
    const { service, uploads, updates } = fakeService()
    const { impl } = scriptedFetch([lookup({ data: { url: CDN, is_silhouette: true } })])
    const result = await importFacebookPhoto({ service, memberId: 'm1', providerToken: 'tok', fetchImpl: impl })
    expect(result).toEqual({ status: 'no-photo' })
    expect(uploads).toEqual([])
    expect(updates).toEqual([])
  })

  test('falls back to the URL recorded on the identity when there is no token', async () => {
    const { service, uploads } = fakeService()
    const { impl, calls } = scriptedFetch([imageResponse()])
    const result = await importFacebookPhoto({ service, memberId: 'm1', fallbackUrl: CDN, fetchImpl: impl })
    expect(result.status).toBe('ok')
    expect(calls).toEqual([CDN])
    expect(uploads).toHaveLength(1)
  })

  test('ignores a fallback URL that is not on Facebook', async () => {
    const { service } = fakeService()
    const { impl, calls } = scriptedFetch([])
    const result = await importFacebookPhoto({
      service,
      memberId: 'm1',
      fallbackUrl: 'https://evil.com/a.jpg',
      fetchImpl: impl,
    })
    expect(result.status).toBe('failed')
    expect(calls).toEqual([])
  })

  test('leaves the profile alone when the download fails', async () => {
    const { service, updates } = fakeService()
    const { impl } = scriptedFetch([
      lookup({ data: { url: CDN, is_silhouette: false } }),
      imageResponse(10, 'text/html'),
    ])
    const result = await importFacebookPhoto({ service, memberId: 'm1', providerToken: 'tok', fetchImpl: impl })
    expect(result.status).toBe('failed')
    expect(updates).toEqual([])
  })
})
