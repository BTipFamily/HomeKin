'use client'

// The toast store.
//
// Deliberately a module-level store rather than context: a toast is fired from
// deep inside a row action, and threading a provider down to every such caller
// would mean every one of them becoming a client component. `toast()` is a
// plain function anything can import.

import * as React from 'react'
import type { ToastActionElement, ToastProps } from '@/components/ui/toast'

const TOAST_LIMIT = 3
/** How long a toast stays up before dismissing itself. */
const TOAST_DURATION = 6000
/** Time to let the close animation finish before dropping the toast. */
const REMOVE_DELAY = 400

export type ToasterToast = ToastProps & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

type State = { toasts: ToasterToast[] }

type Action =
  | { type: 'ADD'; toast: ToasterToast }
  | { type: 'UPDATE'; toast: Partial<ToasterToast> & { id: string } }
  | { type: 'DISMISS'; toastId?: string }
  | { type: 'REMOVE'; toastId?: string }

let count = 0
function nextId(): string {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return String(count)
}

const removeTimers = new Map<string, ReturnType<typeof setTimeout>>()

function scheduleRemoval(toastId: string) {
  if (removeTimers.has(toastId)) return
  removeTimers.set(
    toastId,
    setTimeout(() => {
      removeTimers.delete(toastId)
      dispatch({ type: 'REMOVE', toastId })
    }, REMOVE_DELAY)
  )
}

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD':
      return { ...state, toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) }

    case 'UPDATE':
      return {
        ...state,
        toasts: state.toasts.map((t) => (t.id === action.toast.id ? { ...t, ...action.toast } : t)),
      }

    case 'DISMISS': {
      const { toastId } = action
      if (toastId) scheduleRemoval(toastId)
      else state.toasts.forEach((t) => scheduleRemoval(t.id))

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          toastId === undefined || t.id === toastId ? { ...t, open: false } : t
        ),
      }
    }

    case 'REMOVE':
      if (action.toastId === undefined) return { ...state, toasts: [] }
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.toastId) }
  }
}

const listeners: Array<(state: State) => void> = []
let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => listener(memoryState))
}

type ToastInput = Omit<ToasterToast, 'id'>

export function toast(props: ToastInput) {
  const id = nextId()
  const dismiss = () => dispatch({ type: 'DISMISS', toastId: id })

  dispatch({
    type: 'ADD',
    toast: {
      ...props,
      id,
      open: true,
      duration: props.duration ?? TOAST_DURATION,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return { id, dismiss, update: (next: Partial<ToasterToast>) => dispatch({ type: 'UPDATE', toast: { ...next, id } }) }
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) listeners.splice(index, 1)
    }
  }, [])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: 'DISMISS', toastId }),
  }
}
