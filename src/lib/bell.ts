/**
 * Bell schedules: the types, the resolution rules, and one built-in preset.
 *
 * Nothing in here is the source of truth at runtime. A user's own schedules,
 * weekday pattern, and dated exceptions live in `db.school` so they can be
 * edited, added to, and thrown away. The MHHS tables below are seed data —
 * the school this was first built for, kept as a preset and as a worked
 * example of a genuinely awkward timetable.
 *
 * MHHS is worth keeping precisely because it is awkward: three different day
 * shapes in a normal week, which is why a "one column of periods, repeated
 * seven times" calendar can never be right.
 *   Mon/Tue/Wed → 8 short periods
 *   Thursday    → block: 1st, 2nd, Advisory, 3rd, 4th
 *   Friday      → block: 6th, 7th, 8th, early release
 * Period 5 is SUCCESS there every day, which is why the resolver must never
 * assume periods run 1..N with no gaps. Yours might skip a different one, or
 * none at all.
 */

export type SlotRole = 'class' | 'success' | 'advisory' | 'lunch' | 'breakfast' | 'special'

/** Any period number a school cares to use. MHHS skips 5; yours may not. */
export type PeriodNo = number

export interface Slot {
  /** Stable key used for per-day notes. Classes key off the period so a note on
   *  6th period survives whichever bell schedule that day happens to use. */
  key: string
  period?: PeriodNo
  label: string
  startMin: number
  endMin: number
  role: SlotRole
}

export interface BellSchedule {
  id: string
  label: string
  /** Shown in the day header when the day isn't shaped the way you'd expect. */
  short?: string
  slots: Slot[]
}

const t = (h: number, m: number) => h * 60 + m

const BREAKFAST: Slot = { key: 'breakfast', label: 'Breakfast', startMin: t(8, 0), endMin: t(8, 25), role: 'breakfast' }
const cls = (period: PeriodNo, sh: number, sm: number, eh: number, em: number): Slot => ({
  key: `p${period}`,
  period,
  label: `${period}${period === 1 ? 'st' : period === 2 ? 'nd' : period === 3 ? 'rd' : 'th'} period`,
  startMin: t(sh, sm),
  endMin: t(eh, em),
  role: 'class',
})
const success = (sh: number, sm: number, eh: number, em: number): Slot => ({
  key: 'success', label: 'SUCCESS', startMin: t(sh, sm), endMin: t(eh, em), role: 'success',
})
const lunch = (sh: number, sm: number, eh: number, em: number): Slot => ({
  key: 'lunch', label: 'Lunch', startMin: t(sh, sm), endMin: t(eh, em), role: 'lunch',
})
const advisory = (sh: number, sm: number, eh: number, em: number): Slot => ({
  key: 'advisory', label: 'Advisory', startMin: t(sh, sm), endMin: t(eh, em), role: 'advisory',
})
const special = (key: string, label: string, sh: number, sm: number, eh: number, em: number): Slot => ({
  key, label, startMin: t(sh, sm), endMin: t(eh, em), role: 'special',
})

export const MHHS_SCHEDULES: Record<string, BellSchedule> = {
  regular: {
    id: 'regular',
    label: 'Regular (Mon–Wed)',
    slots: [
      BREAKFAST,
      cls(1, 8, 30, 9, 18),
      cls(2, 9, 23, 10, 11),
      cls(3, 10, 16, 11, 8),
      cls(4, 11, 13, 12, 1),
      success(12, 6, 12, 36),
      lunch(12, 36, 13, 6),
      cls(6, 13, 11, 13, 59),
      cls(7, 14, 4, 14, 52),
      cls(8, 14, 57, 15, 45),
    ],
  },
  thuBlock: {
    id: 'thuBlock',
    label: 'Block — Thursday Advisory',
    short: 'BLOCK',
    slots: [
      BREAKFAST,
      cls(1, 8, 30, 9, 50),
      cls(2, 9, 55, 11, 15),
      advisory(11, 20, 11, 50),
      success(11, 55, 12, 25),
      lunch(12, 25, 12, 55),
      cls(3, 13, 0, 14, 20),
      cls(4, 14, 25, 15, 45),
    ],
  },
  friBlock: {
    id: 'friBlock',
    label: 'Block — Friday early release',
    short: 'EARLY OUT',
    slots: [
      BREAKFAST,
      cls(6, 8, 30, 9, 50),
      cls(7, 9, 55, 11, 15),
      success(11, 20, 11, 50),
      lunch(11, 50, 12, 20),
      cls(8, 12, 25, 13, 45),
    ],
  },
  friRally: {
    id: 'friRally',
    label: 'Friday rally',
    short: 'RALLY',
    slots: [
      BREAKFAST,
      cls(6, 8, 30, 9, 50),
      special('rallyBlue', 'Blue Rally / 7th', 9, 55, 10, 55),
      lunch(10, 55, 11, 25),
      special('rallySilver', 'Silver Rally / 7th', 11, 30, 12, 30),
      cls(8, 12, 35, 13, 45),
    ],
  },
  confMon: {
    id: 'confMon',
    label: 'Conferences — Monday',
    short: 'CONFERENCES',
    slots: [
      BREAKFAST,
      cls(1, 8, 30, 9, 25),
      cls(2, 9, 30, 10, 25),
      cls(3, 10, 30, 11, 30),
      cls(4, 11, 35, 12, 30),
      special('conf', 'Parent–Student–Teacher Conferences', 12, 30, 15, 45),
    ],
  },
  confTue: {
    id: 'confTue',
    label: 'Conferences / Homecoming Prep — Tuesday',
    short: 'CONFERENCES',
    slots: [
      BREAKFAST,
      cls(6, 8, 30, 9, 25),
      cls(7, 9, 30, 10, 25),
      advisory(10, 30, 10, 55),
      success(11, 0, 11, 30),
      cls(8, 11, 35, 12, 30),
      special('conf', 'Conferences / Homecoming Prep', 12, 30, 15, 45),
    ],
  },
  finals1: {
    id: 'finals1',
    label: 'Finals — Day 1',
    short: 'FINALS',
    slots: [
      BREAKFAST,
      special('rev1', 'Study review 1', 8, 30, 9, 5),
      special('rev2', 'Study review 2', 9, 10, 9, 45),
      special('rev3', 'Study review 3', 9, 50, 10, 25),
      special('brk', 'Break', 10, 25, 10, 45),
      cls(1, 10, 50, 12, 50),
    ],
  },
  finals2: {
    id: 'finals2',
    label: 'Finals — Day 2',
    short: 'FINALS',
    slots: [BREAKFAST, cls(2, 8, 30, 10, 30), special('brk', 'Break', 10, 30, 10, 45), cls(3, 10, 50, 12, 50)],
  },
  finals3: {
    id: 'finals3',
    label: 'Finals — Day 3',
    short: 'FINALS',
    slots: [BREAKFAST, cls(4, 8, 30, 10, 30), special('brk', 'Break', 10, 30, 10, 45), cls(6, 10, 50, 12, 50)],
  },
  finals4: {
    id: 'finals4',
    label: 'Finals — Day 4',
    short: 'FINALS',
    slots: [BREAKFAST, cls(7, 8, 30, 10, 30), special('brk', 'Break', 10, 30, 10, 45), cls(8, 10, 50, 12, 50)],
  },
  testing: {
    id: 'testing',
    label: 'CAASPP / CAST testing',
    short: 'TESTING',
    slots: [
      BREAKFAST,
      special('test', 'Testing period', 8, 30, 10, 30),
      cls(1, 10, 35, 11, 5),
      cls(2, 11, 10, 11, 40),
      cls(3, 11, 45, 12, 15),
      cls(4, 12, 20, 12, 50),
      success(12, 50, 13, 25),
      lunch(13, 30, 14, 0),
      cls(6, 14, 5, 14, 35),
      cls(7, 14, 40, 15, 10),
      cls(8, 15, 15, 15, 45),
    ],
  },
}

/** Dates that don't follow the normal weekday pattern, straight off the sheet. */
export const MHHS_SPECIAL_DATES: Record<string, string> = {
  '2026-10-19': 'confMon',
  '2026-10-20': 'confTue',
  '2026-10-23': 'friRally',
  '2026-12-15': 'finals1',
  '2026-12-16': 'finals2',
  '2026-12-17': 'finals3',
  '2026-12-18': 'finals4',
  '2027-01-15': 'friRally',
  '2027-03-19': 'friRally',
  '2027-05-25': 'finals1',
  '2027-05-26': 'finals2',
  '2027-05-27': 'finals3',
  '2027-05-28': 'finals4',
}

export const NO_SCHOOL = 'none'

/** Which schedule each weekday normally runs, keyed by `Date.getDay()`.
 *  A missing key, or null, means no school that day. */
export type WeekdayMap = Record<string, string | null>

/** MHHS's normal week. Weekends are absent, which is how "no school" is said. */
export const MHHS_WEEKDAYS: WeekdayMap = {
  '1': 'regular',
  '2': 'regular',
  '3': 'regular',
  '4': 'thuBlock',
  '5': 'friBlock',
}

/** Everything the resolver needs. `db.school` satisfies this, which is the
 *  point: the rules read your data, not a table compiled into the app. */
export interface ScheduleSource {
  schedules: Record<string, BellSchedule>
  weekdays: WeekdayMap
  specialDates: Record<string, string>
  dayOverrides: Record<string, string>
}

/**
 * Which bell schedule a given date runs, most specific answer first:
 * your own per-date override, then a dated exception from the school
 * calendar, then the normal weekday pattern.
 */
export function scheduleIdFor(date: string, dow: number, src: ScheduleSource): string | null {
  const manual = src.dayOverrides[date]
  if (manual) return manual === NO_SCHOOL ? null : manual
  if (src.specialDates[date]) return src.specialDates[date]
  return src.weekdays[String(dow)] ?? null
}

export function scheduleFor(date: string, dow: number, src: ScheduleSource): BellSchedule | null {
  const id = scheduleIdFor(date, dow, src)
  return id ? (src.schedules[id] ?? null) : null
}

/**
 * The period numbers this school actually teaches, read off the schedules
 * rather than assumed. MHHS returns [1,2,3,4,6,7,8] because 5 is SUCCESS
 * everywhere; a school with a plain eight-period day returns 1..8.
 */
export function periodsIn(schedules: Record<string, BellSchedule>): number[] {
  const seen = new Set<number>()
  for (const s of Object.values(schedules)) {
    for (const slot of s.slots) if (slot.period != null) seen.add(slot.period)
  }
  return [...seen].sort((a, b) => a - b)
}

/** Was a lookup table with seven MHHS-shaped holes in it. Any period number a
 *  school uses has to render, so it is computed. */
export const ordinal = (n: number) => {
  const suffix = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return `${n}${suffix[(v - 20) % 10] || suffix[v] || suffix[0]}`
}

/** A blank day shape to start editing, so "add a schedule" is one click and
 *  then typing, not a form you have to complete before anything exists. */
export function blankSchedule(id: string, label: string): BellSchedule {
  return { id, label, slots: [] }
}

/** Slot keys have to be unique inside a schedule: notes hang off them. */
export function nextSlotKey(sched: BellSchedule, role: SlotRole, period?: number): string {
  if (role === 'class' && period != null) return `p${period}`
  const base = role === 'special' ? 'slot' : role
  if (!sched.slots.some((s) => s.key === base)) return base
  let n = 2
  while (sched.slots.some((s) => s.key === `${base}${n}`)) n++
  return `${base}${n}`
}
