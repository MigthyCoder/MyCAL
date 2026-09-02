// A full midnight-to-midnight day. Anything narrower means some hour of your
// life simply has nowhere to be drawn — a meeting at 12 AM is still a meeting.
export const DAY_START_MIN = 0
export const DAY_END_MIN = 24 * 60
export const GRID_MINUTES = DAY_END_MIN - DAY_START_MIN

/** Local-date ISO key. Never use toISOString() here — that's UTC and it will
 *  silently shift your whole calendar by a day in the evening. */
export function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d)
  c.setDate(c.getDate() + n)
  return c
}

/** Monday-first week start, matching the week view. */
export function startOfWeek(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const dow = c.getDay() // 0=Sun
  const back = dow === 0 ? 6 : dow - 1
  return addDays(c, -back)
}

export function weekDays(anchor: Date): Date[] {
  const s = startOfWeek(anchor)
  return Array.from({ length: 7 }, (_, i) => addDays(s, i))
}

export function minutesNow(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes()
}

export function fmtTime(min: number): string {
  // 1440 is midnight ending the day, not noon — wrap before working out AM/PM.
  const h24 = Math.floor(min / 60) % 24
  const m = min % 60
  const ampm = h24 >= 12 ? 'PM' : 'AM'
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return m === 0 ? `${h} ${ampm}` : `${h}:${String(m).padStart(2, '0')} ${ampm}`
}

export function fmtTimeShort(min: number): string {
  const h24 = Math.floor(min / 60) % 24
  const m = min % 60
  const h = h24 % 12 === 0 ? 12 : h24 % 12
  return m === 0 ? `${h}` : `${h}:${String(m).padStart(2, '0')}`
}

export function fmtRange(a: number, b: number): string {
  // A to-do is a moment, not a span — "9:30–9:30 PM" is just noise.
  if (a === b) return fmtTime(a)
  return `${fmtTimeShort(a)}–${fmtTime(b)}`
}

export function fmtDayLabel(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()
}

export function fmtMonthRange(days: Date[]): string {
  const a = days[0]
  const b = days[days.length - 1]
  const fa = a.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const fb = b.toLocaleDateString(undefined, {
    month: a.getMonth() === b.getMonth() ? undefined : 'short',
    day: 'numeric',
  })
  return `${fa} – ${fb}`
}

export function isSameDay(a: Date, b: Date): boolean {
  return dateKey(a) === dateKey(b)
}

/** Snap to the nearest 5 minutes so dragging never lands on 4:37. */
export function snap(min: number, step = 5): number {
  return Math.round(min / step) * step
}

export function clampMin(min: number): number {
  return Math.max(DAY_START_MIN, Math.min(DAY_END_MIN, min))
}
