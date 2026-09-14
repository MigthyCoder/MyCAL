import type { DayNote, DB, Outcome, Series } from './types'
import { dateKey, parseKey } from './time'
import { scheduleFor, type Slot } from './bell'

export type OccState =
  | 'future'
  | 'now'
  | 'past'
  | 'needs-outcome'
  | 'finished'
  | 'dropped'
  | 'rescheduled'

export interface Occurrence {
  key: string // `${seriesId}|${date}`
  series: Series
  date: string
  title: string
  /** Everything written against this specific day — jots and labelled items. */
  notes: DayNote[]
  /** What to show under the title when the day has nothing written on it. */
  fallbackSubtitle?: string
  startMin: number
  endMin: number
  requiresOutcome: boolean
  outcome?: Outcome
  outcomeNote?: string
  movedTo?: { date: string; startMin: number }
  did?: string
  afterNote?: string
  state: OccState
  overlapReason?: string
  edited: boolean
  /** Comes from the bell schedule rather than db.series — can't be dragged or deleted. */
  generated: boolean
  /** Drawn as a line at a moment rather than a box over a span. */
  pin: boolean
  /** A to-do with no time yet — it lives above the grid, not on it. */
  allDay: boolean
}

/** Flex is scheduled like a class but graded like a task. */
export function requiresOutcome(s: Series): boolean {
  return s.kind === 'task' || s.schoolRole === 'flex'
}

/** Work you parked inside a period and haven't answered for yet. A class is an
 *  event and never asks you for anything — until you put a task in it. */
export const openPlanItems = (notes: DayNote[]) => notes.filter((n) => n.task && !n.done)

function occursOn(s: Series, date: string, dow: number): boolean {
  if (date < s.anchorDate) return false
  if (!s.recurrence) return date === s.anchorDate
  if (s.recurrence.until && date > s.recurrence.until) return false
  return s.recurrence.byDay.includes(dow)
}

/** A stand-in Series for a bell-schedule slot, so notes and outcomes work the
 *  same way they do for anything you created yourself. */
function slotSeries(slot: Slot, title: string, isFlex: boolean, defaultSubtitle?: string): Series {
  return {
    id: `school:${slot.key}`,
    title,
    kind: 'event',
    category: 'school',
    schoolRole: isFlex
      ? 'flex'
      : slot.role === 'class'
        ? 'class'
        : slot.role === 'success'
          ? 'success'
          : null,
    defaultSubtitle,
    startMin: slot.startMin,
    endMin: slot.endMin,
    recurrence: { byDay: [1, 2, 3, 4, 5] },
    anchorDate: '1970-01-01',
    createdAt: 0,
  }
}

export function buildOccurrences(db: DB, dates: string[], now: Date): Occurrence[] {
  const ovIndex = new Map(db.overrides.map((o) => [`${o.seriesId}|${o.date}`, o]))
  const nowKey = dateKey(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const out: Occurrence[] = []
  const school = db.school

  const push = (
    series: Series,
    date: string,
    baseStart: number,
    baseEnd: number,
    generated: boolean,
  ) => {
    const ov = ovIndex.get(`${series.id}|${date}`)
    if (ov?.cancelled) return

    const startMin = ov?.startMin ?? baseStart
    const endMin = ov?.endMin ?? baseEnd
    // Anything you write on a day is something to remember, and anything worth
    // remembering is worth being asked about afterwards. Labels are the one
    // exception — a test or a due date is a fact about the day, not a thing you
    // do. Applied here on read rather than as a migration, so notes arriving by
    // sync from an older copy follow the same rule.
    const notes = (ov?.notes ?? []).map((n) => (n.marker || n.task ? n : { ...n, task: true }))
    // MyCAL knows your whole school year, but it wasn't watching before you
    // started using it — nothing from back then gets to nag you.
    const needs =
      (requiresOutcome(series) || openPlanItems(notes).length > 0) && date >= db.startedOn

    // Past/future is a full datetime comparison. Comparing only minutes would
    // mark next Tuesday's 8 AM class as already over.
    const isPast = date < nowKey || (date === nowKey && endMin <= nowMin)
    const isLive = date === nowKey && startMin <= nowMin && nowMin < endMin

    let state: OccState
    if (ov?.outcome === 'rescheduled') state = 'rescheduled'
    else if (ov?.outcome === 'finished') state = 'finished'
    else if (ov?.outcome === 'dropped') state = 'dropped'
    else if (isPast) state = needs ? 'needs-outcome' : 'past'
    else if (isLive) state = 'now'
    else state = 'future'

    out.push({
      key: `${series.id}|${date}`,
      series,
      date,
      title: ov?.title ?? series.title,
      notes,
      fallbackSubtitle: series.defaultSubtitle,
      startMin,
      endMin,
      requiresOutcome: needs,
      outcome: ov?.outcome,
      outcomeNote: ov?.outcomeNote,
      movedTo: ov?.movedTo,
      did: ov?.did,
      afterNote: ov?.afterNote,
      state,
      overlapReason: series.overlapReason,
      edited: Boolean(ov && ((ov.notes?.length ?? 0) > 0 || ov.title !== undefined)),
      generated,
      pin: Boolean(series.pin),
      allDay: Boolean(series.pin) && (ov?.allDay ?? series.allDay ?? false),
    })
  }

  for (const date of dates) {
    const dow = parseKey(date).getDay()

    // --- school, straight from the bell schedule for that specific date ---
    if (school.enabled && date >= school.startDate && date <= school.endDate) {
      const sched = scheduleFor(date, dow, school.dayOverrides)
      if (sched) {
        for (const slot of sched.slots) {
          if (slot.role === 'breakfast' && !school.showBreakfast) continue
          if (slot.role === 'lunch' && !school.showLunch) continue

          const roster = slot.period ? school.classes[String(slot.period)] : undefined
          let title = slot.label
          if (slot.period) {
            const assigned = roster?.title?.trim()
            if (!assigned) continue // period you don't have a class for
            title = assigned
          }
          // Flex is a period you were assigned, not a slot in the bell schedule.
          const isFlex = Boolean(roster?.flex)
          const defaultSub =
            slot.role === 'success'
              ? school.successDefault || undefined
              : roster?.room || undefined

          push(slotSeries(slot, title, isFlex, defaultSub), date, slot.startMin, slot.endMin, true)
        }
      }
    }

    // --- everything you added yourself ---
    for (const s of db.series) {
      if (s.archived) continue
      if (!occursOn(s, date, dow)) continue
      push(s, date, s.startMin, s.endMin, false)
    }
  }

  return out
}

/** Blocks that have passed and still owe you an answer, oldest first. */
export function openLoops(occs: Occurrence[]): Occurrence[] {
  return occs
    .filter((o) => o.state === 'needs-outcome')
    .sort((a, b) => (a.date === b.date ? a.startMin - b.startMin : a.date < b.date ? -1 : 1))
}

/** A deadline, drawn on the day it lands rather than the day you'll work on it. */
export interface DueMark {
  key: string
  series: Series
  title: string
  date: string
  startMin?: number
  done: boolean
}

export function dueMarks(db: DB, dates: string[]): DueMark[] {
  const want = new Set(dates)
  const out: DueMark[] = []
  for (const s of db.series) {
    if (s.archived || !s.due || !want.has(s.due.date)) continue
    out.push({
      key: `due:${s.id}`,
      series: s,
      title: s.title,
      date: s.due.date,
      startMin: s.due.startMin,
      done: db.overrides.some((o) => o.seriesId === s.id && o.outcome === 'finished'),
    })
  }
  return out
}

/**
 * Where each deadline gets drawn.
 *
 * One with a time is attached to whatever you'll be IN at that moment — a lab
 * report due during Physics shows up inside Physics, a form due during the
 * Vantage meeting shows up inside the meeting. The tightest block wins, so it
 * lands in the class rather than in the long commitment it happens to sit in.
 * No time, or nothing on the calendar then, and it has to stand on its own.
 */
export function placeDues(occs: Occurrence[], marks: DueMark[]) {
  const inBlock = new Map<string, DueMark[]>()
  const allDay: DueMark[] = []
  const loose: DueMark[] = []
  for (const m of marks) {
    if (m.startMin === undefined) {
      allDay.push(m)
      continue
    }
    const t = m.startMin
    const host = occs
      .filter(
        (o) =>
          o.date === m.date &&
          !o.pin &&
          o.state !== 'rescheduled' &&
          o.series.id !== m.series.id &&
          o.startMin <= t &&
          t < o.endMin,
      )
      .sort((a, b) => a.endMin - a.startMin - (b.endMin - b.startMin))[0]
    if (!host) loose.push(m)
    else inBlock.set(host.key, [...(inBlock.get(host.key) ?? []), m])
  }
  return { inBlock, allDay, loose }
}

export type PlacedDues = ReturnType<typeof placeDues>
