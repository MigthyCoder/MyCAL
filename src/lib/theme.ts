import { useSyncExternalStore } from 'react'

/**
 * Appearance.
 *
 * The HIG is blunt about app-specific appearance switches: people expect the
 * system setting to win, and an app that ignores it reads as broken. So the
 * stored preference is three-way and defaults to `system`; the toggle is an
 * override for the times you want one, not a replacement for the OS.
 *
 * `data-theme` on <html> is always the *resolved* value, never `system`. That
 * keeps the stylesheet to two states instead of a duplicated
 * prefers-color-scheme copy of the whole palette.
 */
export type ThemePref = 'system' | 'light' | 'dark'
export type Appearance = 'light' | 'dark'

const KEY = 'mycal.theme'

/** Matches the dark --bg / light --bg, so the browser chrome and the PWA
 *  splash agree with the app instead of flashing the other appearance. */
const THEME_COLOR: Record<Appearance, string> = {
  dark: '#08090c',
  light: '#fbfbfa',
}

/**
 * Held at module scope on purpose. A MediaQueryList created inside a function
 * and only referenced by its own listener can be collected, taking the listener
 * with it — the app then keeps whatever appearance it booted with and silently
 * stops following the system. Keeping one instance alive for the page is the
 * fix, and it also means every read is asking the same object.
 */
const mql: MediaQueryList | null =
  typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null

const media = () => mql

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'light' || v === 'dark' || v === 'system') return v
  } catch {
    // private mode — fall through to system, which is the right default anyway
  }
  return 'system'
}

let pref: ThemePref = read()
const listeners = new Set<() => void>()

export function resolve(p: ThemePref = pref): Appearance {
  if (p !== 'system') return p
  return media()?.matches ? 'light' : 'dark'
}

function apply() {
  const appearance = resolve()
  const root = document.documentElement
  root.setAttribute('data-theme', appearance)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[appearance])
  listeners.forEach((l) => l())
}

export function setThemePref(next: ThemePref) {
  pref = next
  try {
    localStorage.setItem(KEY, next)
  } catch {
    // the choice just won't survive a reload
  }
  apply()
}

export const getThemePref = () => pref
const subscribe = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function useTheme(): { pref: ThemePref; appearance: Appearance } {
  const p = useSyncExternalStore(subscribe, getThemePref, getThemePref)
  return { pref: p, appearance: resolve(p) }
}

/**
 * Call once at startup. Also re-resolves when the OS appearance changes, which
 * is the case the HIG calls out: Auto flips mid-session and the app is expected
 * to follow without a reload.
 */
export function initTheme() {
  apply()
  const onChange = () => {
    if (pref === 'system') apply()
  }

  const m = media()
  if (m) {
    // Safari before 14 only has the deprecated listener.
    if (m.addEventListener) m.addEventListener('change', onChange)
    else m.addListener(onChange)
  }

  // Belt and braces. The `change` event is the right signal but not a reliable
  // one: it does not fire under devtools appearance emulation, and the common
  // real case is the OS flipping at sunset while this tab sat in the
  // background, where a backgrounded page may not be told at all. Re-resolving
  // whenever the tab comes back is cheap and catches both.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) onChange()
  })
  window.addEventListener('focus', onChange)
}
