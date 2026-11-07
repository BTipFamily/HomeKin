// Copying a member's own Facebook profile picture into HomeKin, once.
//
// Facebook gives a profile picture only to the person it belongs to: the
// member presses "Use my Facebook photo", signs in with Facebook, and the
// callback hands the token from that sign-in to importFacebookPhoto. Nobody can
// fetch a relative's picture on their behalf, which is why this lives on your
// own profile only.
//
// Copied rather than linked, because the picture URLs Facebook returns are
// signed and expire — a profile pointing at one breaks within days. HomeKin
// keeps the image and nothing else: no token, and the Facebook identity is
// unlinked straight afterwards by the caller.
//
// Everything that decides what is fetched is a plain function, testable
// without the network. The server fetches a URL that came back from Facebook,
// so only Facebook's own hosts are ever requested, at every redirect hop.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Bump when Meta retires it; versions live about two years. */
export const FACEBOOK_GRAPH_VERSION = 'v25.0'

/** The profile-photos bucket's own limit (migration 005). */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024

const FETCH_TIMEOUT_MS = 10_000
const MAX_REDIRECTS = 3

/** The bucket's allowed types that Facebook actually serves, with a file extension each. */
const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/**
 * Whether the server may request this URL: https, on Facebook's Graph API or
 * its image CDNs. Matched on a domain boundary, so `fbcdn.net.example.com`
 * does not pass.
 */
export function isFacebookImageHost(url: string): boolean {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  const host = parsed.hostname.toLowerCase()
  return (
    host === 'graph.facebook.com' ||
    host.endsWith('.fbcdn.net') ||
    host.endsWith('.fbsbx.com')
  )
}

export type PictureLookup =
  | { status: 'found'; url: string }
  | { status: 'silhouette' }
  | { status: 'error'; reason: string }

/**
 * Reads `GET /me/picture?redirect=false`, which answers
 * `{ data: { url, is_silhouette, width, height } }`. The silhouette is
 * Facebook's grey placeholder for someone with no picture — never worth
 * copying over the initials HomeKin would otherwise show.
 */
export function readPictureResponse(body: unknown): PictureLookup {
  const data = (body as { data?: { url?: unknown; is_silhouette?: unknown } } | null)?.data
  if (!data) {
    const message = (body as { error?: { message?: unknown } } | null)?.error?.message
    return { status: 'error', reason: typeof message === 'string' ? message : 'No picture data' }
  }
  if (data.is_silhouette === true) return { status: 'silhouette' }
  if (typeof data.url !== 'string' || !isFacebookImageHost(data.url)) {
    return { status: 'error', reason: 'Facebook returned a picture URL we will not fetch' }
  }
  return { status: 'found', url: data.url }
}

type Fetch = typeof fetch

export async function lookupPictureUrl(token: string, fetchImpl: Fetch = fetch): Promise<PictureLookup> {
  const endpoint = new URL(`https://graph.facebook.com/${FACEBOOK_GRAPH_VERSION}/me/picture`)
  endpoint.searchParams.set('type', 'large')
  endpoint.searchParams.set('redirect', 'false')
  endpoint.searchParams.set('access_token', token)
  try {
    const res = await fetchImpl(endpoint, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    return readPictureResponse(await res.json())
  } catch (e) {
    return { status: 'error', reason: e instanceof Error ? e.message : 'Picture lookup failed' }
  }
}

export type DownloadedImage =
  | { status: 'ok'; bytes: ArrayBuffer; contentType: string; extension: string }
  | { status: 'error'; reason: string }

/**
 * Downloads an image, following redirects by hand so every hop is checked
 * against isFacebookImageHost — `redirect: 'follow'` would happily land
 * somewhere else entirely.
 */
export async function downloadFacebookImage(url: string, fetchImpl: Fetch = fetch): Promise<DownloadedImage> {
  let current = url
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!isFacebookImageHost(current)) {
      return { status: 'error', reason: `Refusing to fetch ${safeHost(current)}` }
    }

    let res: Response
    try {
      res = await fetchImpl(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
    } catch (e) {
      return { status: 'error', reason: e instanceof Error ? e.message : 'Download failed' }
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location')
      if (!location) return { status: 'error', reason: 'Redirect without a location' }
      current = new URL(location, current).toString()
      continue
    }
    if (!res.ok) return { status: 'error', reason: `Facebook answered ${res.status}` }

    const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
    const extension = IMAGE_TYPES[contentType]
    if (!extension) return { status: 'error', reason: `Not a supported image (${contentType || 'no type'})` }

    const declared = Number(res.headers.get('content-length'))
    if (Number.isFinite(declared) && declared > MAX_PHOTO_BYTES) {
      return { status: 'error', reason: 'Image is over 5MB' }
    }
    const bytes = await res.arrayBuffer()
    if (bytes.byteLength > MAX_PHOTO_BYTES) return { status: 'error', reason: 'Image is over 5MB' }
    if (bytes.byteLength === 0) return { status: 'error', reason: 'Image was empty' }

    return { status: 'ok', bytes, contentType, extension }
  }
  return { status: 'error', reason: 'Too many redirects' }
}

function safeHost(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return 'an invalid URL'
  }
}

export type FacebookPhotoResult =
  | { status: 'ok'; photoUrl: string }
  | { status: 'no-photo' }
  | { status: 'failed'; reason: string }

/**
 * Looks up, downloads and stores the picture, then points the member's
 * profile at the stored copy.
 *
 * `providerToken` is the Facebook token from the sign-in that just happened —
 * preferred, because it lets Facebook say "this is the default silhouette".
 * `fallbackUrl` is the picture URL Supabase recorded on the identity, for when
 * no token came back.
 *
 * `service` must be the service-role client: the callback runs before the
 * member's own session is reliably in the request's cookies.
 */
export async function importFacebookPhoto({
  service,
  memberId,
  providerToken,
  fallbackUrl,
  fetchImpl = fetch,
  now = Date.now,
}: {
  service: SupabaseClient
  memberId: string
  providerToken?: string | null
  fallbackUrl?: string | null
  fetchImpl?: Fetch
  now?: () => number
}): Promise<FacebookPhotoResult> {
  let pictureUrl: string | null = null

  if (providerToken) {
    const lookup = await lookupPictureUrl(providerToken, fetchImpl)
    if (lookup.status === 'silhouette') return { status: 'no-photo' }
    if (lookup.status === 'found') pictureUrl = lookup.url
  }
  if (!pictureUrl && fallbackUrl && isFacebookImageHost(fallbackUrl)) {
    pictureUrl = fallbackUrl
  }
  if (!pictureUrl) return { status: 'failed', reason: 'Facebook did not give us a picture' }

  const image = await downloadFacebookImage(pictureUrl, fetchImpl)
  if (image.status === 'error') return { status: 'failed', reason: image.reason }

  const path = `${memberId}/facebook-${now()}.${image.extension}`
  const bucket = service.storage.from('profile-photos')
  const { error: uploadError } = await bucket.upload(path, image.bytes, {
    contentType: image.contentType,
    upsert: true,
  })
  if (uploadError) return { status: 'failed', reason: uploadError.message }

  const { data } = bucket.getPublicUrl(path)
  const { error: updateError } = await service
    .from('members')
    .update({ photo_url: data.publicUrl })
    .eq('id', memberId)
  if (updateError) return { status: 'failed', reason: updateError.message }

  return { status: 'ok', photoUrl: data.publicUrl }
}
