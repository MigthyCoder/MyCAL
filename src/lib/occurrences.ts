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
}

/** Flex is scheduled like a class but graded like a task. */
export function requiresOutcome(s: Series): boolean {
  return s.kind === 'task' || s.schoolRole === 'flex'
}

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
    // MyCAL knows your whole school year, but it wasn't watching before you
    // started using it — nothing from back then gets to nag you.
    const needs = requiresOutcome(series) && date >= db.startedOn

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
      notes: ov?.notes ?? [],
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
    })
  }

  for (const date of dates) {
    const dow = parseKey(date).getDay()

    // --- school, straight from the bell schedule for that specific date ---
    if (school.enabled && date >= school.startDate && date <= school.endDate) {
      const sched = scheduleFor(date, dow, school)
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
