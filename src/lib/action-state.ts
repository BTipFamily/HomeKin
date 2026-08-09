// What a Server Action hands back when it cannot do what was asked.
//
// A thrown Server Action is not an error message. React strips the message out
// of production builds and gives the caller a digest instead, so the person who
// hit the problem is told only that "an error occurred in the Server Components
// render" — whether it was a full event, an overpayment, or something that is
// genuinely not their fault. Returning the reason as a value is the only way it
// survives the trip.
//
// This module is deliberately plain. A module marked 'use server' may export
// nothing but async functions: a value export fails the build, and a *type*
// re-export by specifier list survives the server-action transform as a bare
// identifier and throws ReferenceError when the module is evaluated. So the type
// and its initial constant live out here, and the actions import them.

export type ActionStatus = 'idle' | 'success' | 'warning' | 'error'

export type ActionState = {
  status: ActionStatus
  message: string
}

/**
 * Four states rather than two, because these actions divide into ones that
 * redirect on success — where only a failure is ever rendered — and ones that
 * stay put and need to say that it worked. `warning` is for the half-successes
 * that already exist in this codebase: the thing was saved, but the email that
 * should have followed it was not sent.
 */
export const ACTION_IDLE: ActionState = { status: 'idle', message: '' }

export function actionError(message: string): ActionState {
  return { status: 'error', message }
}

export function actionSuccess(message = ''): ActionState {
  return { status: 'success', message }
}

/**
 * Turns whatever was thrown into something worth showing.
 *
 * Existing actions raise `new Error('Not enough capacity. Only 3 spots
 * remaining.')` and similar — messages already written for a person to read.
 * Keeping the throws and catching them here is far less invasive than rewriting
 * every guard into a return, and it means a message added later is surfaced
 * without anyone remembering to wire it up.
 */
export function failedWith(error: unknown, fallback: string): ActionState {
  const message = error instanceof Error ? error.message.trim() : ''
  return actionError(message || fallback)
}
