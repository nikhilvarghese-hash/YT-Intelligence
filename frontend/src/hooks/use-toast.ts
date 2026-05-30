import * as React from 'react'

interface Toast {
  id: string
  title?: string
  description?: string
  action?: React.ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

const TOAST_LIMIT = 5
const TOAST_REMOVE_DELAY = 4000

type ToasterToast = Toast

const actionTypes = {
  ADD_TOAST: 'ADD_TOAST',
  UPDATE_TOAST: 'UPDATE_TOAST',
  DISMISS_TOAST: 'DISMISS_TOAST',
  REMOVE_TOAST: 'REMOVE_TOAST',
} as const

let count = 0
function genId() { return String(count++) }

type State = { toasts: ToasterToast[] }
const listeners: Array<(state: State) => void> = []
let memoryState: State = { toasts: [] }

function dispatch(action: { type: string; toast?: Partial<ToasterToast>; toastId?: string }) {
  memoryState = reducer(memoryState, action as any)
  listeners.forEach(l => l(memoryState))
}

function reducer(state: State, action: any): State {
  switch (action.type) {
    case actionTypes.ADD_TOAST:
      return { toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) }
    case actionTypes.DISMISS_TOAST:
      return { toasts: state.toasts.map(t => t.id === action.toastId || !action.toastId ? { ...t, open: false } : t) }
    case actionTypes.REMOVE_TOAST:
      return { toasts: state.toasts.filter(t => t.id !== action.toastId) }
    default:
      return state
  }
}

export function toast(props: Omit<ToasterToast, 'id'>) {
  const id = genId()
  dispatch({ type: actionTypes.ADD_TOAST, toast: { ...props, id, open: true } })
  setTimeout(() => dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id }), TOAST_REMOVE_DELAY)
  setTimeout(() => dispatch({ type: actionTypes.REMOVE_TOAST, toastId: id }), TOAST_REMOVE_DELAY + 300)
  return id
}

export function useToast() {
  const [state, setState] = React.useState<State>(memoryState)
  React.useEffect(() => {
    listeners.push(setState)
    return () => { const idx = listeners.indexOf(setState); if (idx > -1) listeners.splice(idx, 1) }
  }, [])
  return state
}
