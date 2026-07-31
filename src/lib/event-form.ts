// The event form's result type.
//
// Kept out of `actions/sub-events.ts` because a module marked 'use server' may
// only export async functions — exporting the initial-state constant from there
// fails the build with "a 'use server' file can only export async functions,
// found object". Same reason `signup-confirmation.ts` sits outside its action.

/**
 * What the event form gets back when a save fails.
 *
 * Returned rather than thrown, and that distinction is the whole point. React
 * strips the message off a thrown Server Action in production — the client is
 * handed a generic Error and a digest — so every carefully worded reason the
 * action produces was invisible to the person who needed it, arriving as
 * "a server error occurred" and a number. A returned value survives.
 */
export type EventFormState = { status: 'idle' | 'error'; message: string }

export const EVENT_FORM_INITIAL: EventFormState = { status: 'idle', message: '' }
