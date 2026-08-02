// What the album accepts, and how it describes itself.
//
// The invariant worth protecting: the limit the UI promises and the limit the
// check enforces are the same number, and a rejected file says why in terms
// the person can act on.

import {
  ACCEPTED_VIDEO_TYPES,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
  describeAlbum,
  formatBytes,
  formatDuration,
  maxBytesFor,
  mediaTypeOf,
  rejectionReason,
  storagePathFor,
  thumbnailPathFor,
} from '@/lib/media'

function file(overrides: Partial<{ name: string; type: string; size: number }> = {}) {
  return { name: 'clip.mp4', type: 'video/mp4', size: 1024, ...overrides }
}

describe('mediaTypeOf', () => {
  it('sorts images from videos', () => {
    expect(mediaTypeOf({ type: 'image/jpeg' })).toBe('image')
    expect(mediaTypeOf({ type: 'image/heic' })).toBe('image')
    expect(mediaTypeOf({ type: 'video/quicktime' })).toBe('video')
  })

  it('refuses anything else', () => {
    expect(mediaTypeOf({ type: 'application/pdf' })).toBeNull()
    expect(mediaTypeOf({ type: '' })).toBeNull()
  })
})

describe('rejectionReason', () => {
  it('accepts a normal photo and a normal video', () => {
    expect(rejectionReason(file({ name: 'a.jpg', type: 'image/jpeg', size: 2_000_000 }))).toBeNull()
    expect(rejectionReason(file({ size: 40_000_000 }))).toBeNull()
  })

  it('holds videos and images to different limits', () => {
    // A 20MB file is fine as a clip and far too big as a still.
    const size = 20 * 1024 * 1024
    expect(rejectionReason(file({ size }))).toBeNull()
    expect(rejectionReason(file({ name: 'a.jpg', type: 'image/jpeg', size }))).toContain('too large')
  })

  it('names the real limit in the message', () => {
    // The number in the error has to come from the constant, or it drifts away
    // from what the bucket actually enforces.
    const reason = rejectionReason(file({ size: MAX_VIDEO_BYTES + 1 }))
    expect(reason).toContain(formatBytes(MAX_VIDEO_BYTES))
    expect(reason).toContain('video')
  })

  it('rejects a video format the browser cannot play', () => {
    expect(rejectionReason(file({ name: 'old.avi', type: 'video/x-msvideo' }))).toContain('MP4')
  })

  it('rejects a file that is neither', () => {
    expect(rejectionReason(file({ name: 'sheet.pdf', type: 'application/pdf' }))).toContain(
      'not a photo or a video'
    )
  })

  it('rejects an empty file', () => {
    expect(rejectionReason(file({ size: 0 }))).toContain('empty')
  })

  it('agrees with maxBytesFor', () => {
    expect(maxBytesFor('video')).toBe(MAX_VIDEO_BYTES)
    expect(maxBytesFor('image')).toBe(MAX_IMAGE_BYTES)
  })

  it('accepts exactly the formats the bucket allows', () => {
    for (const type of ACCEPTED_VIDEO_TYPES) {
      expect(rejectionReason(file({ type }))).toBeNull()
    }
  })
})

describe('storage paths', () => {
  it('scopes to the reunion and sanitizes the name', () => {
    expect(storagePathFor('r1', 'my holiday (1).mp4', 1000)).toBe('r1/1000-my_holiday__1_.mp4')
  })

  it('derives a poster path that cannot collide with the clip', () => {
    const path = storagePathFor('r1', 'a.mp4', 1000)
    expect(thumbnailPathFor(path)).toBe('r1/1000-a.mp4.poster.jpg')
    expect(thumbnailPathFor(path)).not.toBe(path)
  })
})

describe('describeAlbum', () => {
  it('counts photos and videos separately', () => {
    expect(
      describeAlbum([{ media_type: 'image' }, { media_type: 'image' }, { media_type: 'video' }])
    ).toBe('2 photos and 1 video')
  })

  it('says only what is there', () => {
    expect(describeAlbum([{ media_type: 'video' }])).toBe('1 video')
    expect(describeAlbum([{ media_type: 'image' }])).toBe('1 photo')
    expect(describeAlbum([])).toBe('Nothing here yet')
  })

  it('treats a row with no media_type as a photo', () => {
    // Every row that predates migration 020 looks like this in the type, even
    // though the column defaults to 'image' in the database.
    expect(describeAlbum([{}, { media_type: null }])).toBe('2 photos')
  })
})

describe('formatDuration', () => {
  it('renders mm:ss', () => {
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(9)).toBe('0:09')
    expect(formatDuration(600)).toBe('10:00')
  })

  it('has nothing to show for a photo', () => {
    expect(formatDuration(null)).toBeNull()
    expect(formatDuration(-1)).toBeNull()
    expect(formatDuration(NaN)).toBeNull()
  })
})
