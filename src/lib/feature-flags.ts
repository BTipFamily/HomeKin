// Switches for features that depend on setup outside this codebase.

/**
 * "Use my Facebook photo" on your own profile.
 *
 * Off until a Meta app with Facebook Login is live, the Facebook provider is
 * configured in Supabase, and manual identity linking is on — with any of those
 * missing the button would send people to an error. See the README.
 *
 * NEXT_PUBLIC_ because the button is rendered from it; like every public
 * variable it is fixed at build time, so changing it needs a redeploy.
 */
export function facebookPhotoEnabled(): boolean {
  return process.env.NEXT_PUBLIC_FACEBOOK_PHOTO_ENABLED === 'true'
}
