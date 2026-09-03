import { setThemePref, useTheme, type ThemePref } from '../lib/theme'
import { MOBILE, useMedia } from '../lib/useMedia'

/**
 * Three states, not two.
 *
 * A plain light/dark switch quietly stops tracking the OS the moment you touch
 * it, which is the failure the HIG warns about — your phone goes dark at sunset
 * and this one app stays bright. Auto is the default and stays reachable.
 */
const OPTIONS: { value: ThemePref; label: string; glyph: string; hint: string }[] = [
  { value: 'system', label: 'Auto', glyph: '◐', hint: 'Follow the system appearance' },
  { value: 'light', label: 'Light', glyph: '☀', hint: 'Always light' },
  { value: 'dark', label: 'Dark', glyph: '☾', hint: 'Always dark' },
]

export function ThemeToggle() {
  const { pref, appearance } = useTheme()
  const isMobile = useMedia(MOBILE)

  // Three segments cost ~120px, and the phone topbar only fits on one row
  // because the week arrows were dropped to make room. So on a phone this is a
  // single button that cycles, showing the state it is in now. Same three
  // states, a third of the width.
  if (isMobile) {
    const i = OPTIONS.findIndex((o) => o.value === pref)
    const current = OPTIONS[i] ?? OPTIONS[0]
    const next = OPTIONS[(i + 1) % OPTIONS.length]
    return (
      <button
        className="themecycle"
        title={`${current.label} — tap for ${next.label}`}
        aria-label={
          current.value === 'system'
            ? `Appearance: Auto, currently ${appearance}. Tap for ${next.label}.`
            : `Appearance: ${current.label}. Tap for ${next.label}.`
        }
        onClick={() => setThemePref(next.value)}
      >
        <span aria-hidden="true">{current.glyph}</span>
      </button>
    )
  }

  return (
    <div
      className="themetoggle"
      role="radiogroup"
      aria-label={`Appearance — currently ${appearance}`}
    >
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={pref === o.value}
          className={pref === o.value ? 'on' : ''}
          title={o.hint}
          // The glyph alone is not a name. Auto in particular has to say what it
          // resolved to, or a screen reader user cannot tell light from dark.
          aria-label={o.value === 'system' ? `Auto — currently ${appearance}` : o.label}
          onClick={() => setThemePref(o.value)}
        >
          <span aria-hidden="true">{o.glyph}</span>
        </button>
      ))}
    </div>
  )
}
