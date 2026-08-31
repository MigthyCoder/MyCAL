import { useSyncExternalStore } from 'react'

/** Reactive media query, without pulling in a dependency. */
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query)
      mql.addEventListener('change', cb)
      return () => mql.removeEventListener('change', cb)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

/** Below this the seven-column week stops being readable and we show one day. */
export const MOBILE = '(max-width: 760px)'
