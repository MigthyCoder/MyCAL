import { useSyncExternalStore } from 'react'
import type { DayNote, DB, MarkerType, Outcome, Override, SchoolConfig, Series } from './types'
import type { Occurrence } from './occurrences'

const KEY = 'mycal.db.v1'

// Declared up here on purpose: load() runs at module init and the migrations it
// calls need this. Below the call site it's in the temporal dead zone, and the
// resulting throw is swallowed by load()'s catch — which quietly hands back an
// empty calendar instead of yours.
export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)


export const DEFAULT_SCHOOL: SchoolConfig = {
  enabled: false,
  startDate: '2026-08-06',
  endDate: '2027-05-28',
  classes: {},
  showBreakfast: false,
  showLunch: true,
  successDefault: 'Open',
  dayOverrides: {},
}

const todayKey = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const DENSITY_STEPS = [1.15, 1.5, 1.85, 2.3, 2.9]
export const DEFAULT_DENSITY = 1.85

const emptyDB = (): DB => ({
  version: 1,
  density: DEFAULT_DENSITY,
  startedOn: todayKey(),
  series: [],
  overrides: [],
  reminders: [],
  school: DEFAULT_SCHOOL,
  onboarded: false,
})

/** The default moment for something with no time: after the last thing you've
 *  already got on, or a late-evening fallback on an empty day. */
export const END_OF_DAY_MIN = 21 * 60 + 30

/** Reminders used to be a list beside the grid. They're pins on it now, which is
 *  what lets them be rescheduled and answered for like any other intention. */
function migrateReminders(parsed: DB): Pick<DB, 'series' | 'overrides' | 'reminders'> {
  const legacy = parsed.reminders ?? []
  if (legacy.length === 0) {
    return { series: parsed.series, overrides: parsed.overrides, reminders: [] }
  }
  const known = new Set(parsed.series.map((s) => s.id))
  const series = [...parsed.series]
  const overrides = [...parsed.overrides]
  for (const r of legacy) {
    if (known.has(r.id)) continue
    series.push({
      id: r.id,
      title: r.text,
      kind: 'task',
      category: 'personal',
      schoolRole: null,
      startMin: END_OF_DAY_MIN,
      endMin: END_OF_DAY_MIN,
      recurrence: null,
      anchorDate: r.date,
      createdAt: r.createdAt,
      pin: true,
    })
    if (r.done) overrides.push({ seriesId: r.id, date: r.date, outcome: 'finished' })
  }
  return { series, overrides, reminders: [] }
}

/** A day used to hold one note and one marker. Both are just notes now, one of
 *  which happens to be labelled. */
function migrateNotes(overrides: Override[]): Override[] {
  return overrides.map((o) => {
    if (!o.subtitle && !o.marker && !o.planned) return o
    const notes: DayNote[] = [...(o.notes ?? [])]
    // A Flex plan is a list in priority order, so the old single plan leads it.
    if (o.planned) notes.unshift({ id: uid(), text: o.planned })
    if (o.marker) notes.push({ id: uid(), text: o.marker.label, marker: o.marker.type })
    if (o.subtitle) notes.push({ id: uid(), text: o.subtitle })
    const { subtitle: _s, marker: _m, planned: _p, ...rest } = o
    return { ...rest, notes }
  })
}

function load(): DB {
  const fresh = emptyDB()
  let parsed: DB
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fresh
    parsed = JSON.parse(raw) as DB
    if (parsed.version !== 1) return fresh
  } catch {
    return fresh
  }

  const base: DB = {
    ...fresh,
    ...parsed,
    startedOn: parsed.startedOn || fresh.startedOn,
    density: parsed.density || fresh.density,
    school: { ...DEFAULT_SCHOOL, ...(parsed.school ?? {}) },
  }

  try {
    const migrated = migrateReminders(parsed)
    return { ...base, ...migrated, overrides: migrateNotes(migrated.overrides) }
  } catch (err) {
    // Your calendar is never the thing that gets sacrificed to a migration bug.
    // Worst case the old shape renders a bit oddly; it does not disappear.
    console.error('MyCAL: migration failed, keeping stored data unchanged', err)
    return base
  }
}

let db: DB = load()
const listeners = new Set<() => void>()

function commit(next: DB, keepTouch = false) {
  // touchedAt is what lets sync tell a device that's been edited recently from
  // one that's just been sitting open on a stale copy.
  db = keepTouch ? next : { ...next, touchedAt: Date.now() }
  try {
    localStorage.setItem(KEY, JSON.stringify(db))
  } catch {
    // quota or private mode — the session still works, it just won't survive reload
  }
  listeners.forEach((l) => l())
}

export function subscribe(l: () => void) {
  listeners.add(l)
  return () => listeners.delete(l)
}

export function getDB(): DB {
  return db
}

/** Replace the whole document — used by sync when the server has newer state.
 *  Marked so the sync layer can tell its own writes from yours. */
export function hydrate(next: DB) {
  commit({ ...next, version: 1 }, true)
}

export function useDB(): DB {
  return useSyncExternalStore(subscribe, getDB, getDB)
}


// ---------------------------------------------------------------- series

export function addSeries(s: Omit<Series, 'id' | 'createdAt'>): Series {
  const full: Series = { ...s, id: uid(), createdAt: Date.now() }
  commit({ ...db, series: [...db.series, full] })
  return full
}

export function updateSeries(id: string, patch: Partial<Series>) {
  commit({
    ...db,
    series: db.series.map((s) => (s.id === id ? { ...s, ...patch } : s)),
  })
}

/** Archive rather than delete, so past weeks don't silently rewrite themselves. */
export function archiveSeries(id: string) {
  updateSeries(id, { archived: true })
}

/** Hard delete — only offered for one-off blocks created by mistake. */
export function deleteSeries(id: string) {
  commit({
    ...db,
    series: db.series.filter((s) => s.id !== id),
    overrides: db.overrides.filter((o) => o.seriesId !== id),
  })
}

// ------------------------------------------------------------- overrides

export function patchOverride(seriesId: string, date: string, patch: Partial<Override>) {
  const i = db.overrides.findIndex((o) => o.seriesId === seriesId && o.date === date)
  const next = [...db.overrides]
  if (i === -1) next.push({ seriesId, date, ...patch })
  else next[i] = { ...next[i], ...patch }
  commit({ ...db, overrides: next })
}

/** Pass undefined to a field to actually remove it (spread-merge can't). */
export function unsetOverrideFields(seriesId: string, date: string, fields: (keyof Override)[]) {
  const i = db.overrides.findIndex((o) => o.seriesId === seriesId && o.date === date)
  if (i === -1) return
  const copy = { ...db.overrides[i] }
  for (const f of fields) delete copy[f]
  const next = [...db.overrides]
  next[i] = copy
  commit({ ...db, overrides: next })
}

export function setDayNotes(occ: Occurrence, notes: DayNote[]) {
  const cleaned = notes.filter((n) => n.text.trim()).map((n) => ({ ...n, text: n.text.trim() }))
  if (cleaned.length === 0) unsetOverrideFields(occ.series.id, occ.date, ['notes'])
  else patchOverride(occ.series.id, occ.date, { notes: cleaned })
}

export const newNote = (text = '', marker?: MarkerType): DayNote => ({ id: uid(), text, marker })

/** A piece of work living inside a period rather than beside it. */
export const newPlanItem = (text: string): DayNote => ({ id: uid(), text, task: true })

/** Tick (or untick) one planned item inside a block. */
export function setNoteDone(occ: Occurrence, noteId: string, done?: 'finished' | 'dropped') {
  setDayNotes(
    occ,
    occ.notes.map((n) => (n.id === noteId ? { ...n, done } : n)),
  )
}

/** Reorder a planned item — the priority list is the whole point of the plan. */
export function moveNote(occ: Occurrence, noteId: string, dir: -1 | 1) {
  const notes = [...occ.notes]
  const i = notes.findIndex((n) => n.id === noteId)
  const j = i + dir
  if (i === -1 || j < 0 || j >= notes.length) return
  ;[notes[i], notes[j]] = [notes[j], notes[i]]
  setDayNotes(occ, notes)
}

/**
 * Rename. What that means depends on what you're renaming: a class is stored in
 * your roster, so renaming it there fixes every day of the year at once, while a
 * one-off is just itself.
 */
export function renameOccurrence(occ: Occurrence, title: string, scope: 'series' | 'day') {
  const t = title.trim()
  if (!t || t === occ.title) return
  if (scope === 'day') {
    patchOverride(occ.series.id, occ.date, { title: t })
    return
  }
  const period = /^school:p(\d)$/.exec(occ.series.id)?.[1]
  if (period && db.school.classes[period]) {
    setSchool({
      classes: { ...db.school.classes, [period]: { ...db.school.classes[period], title: t } },
    })
    return
  }
  if (occ.generated) {
    // SUCCESS, Lunch, Advisory: no roster entry to change, so this day only.
    patchOverride(occ.series.id, occ.date, { title: t })
    return
  }
  updateSeries(occ.series.id, { title: t })
}

/** Same thing, same day, one copy. */
export function duplicateOccurrence(occ: Occurrence): Series {
  return addSeries({
    title: `${occ.title} (copy)`,
    kind: occ.series.kind,
    category: occ.series.category,
    schoolRole: null,
    defaultSubtitle: occ.notes.find((n) => !n.marker)?.text ?? occ.fallbackSubtitle,
    location: occ.series.location,
    startMin: occ.startMin,
    endMin: occ.endMin,
    recurrence: null,
    anchorDate: occ.date,
    ...(occ.series.pin ? { pin: true } : {}),
    ...(occ.series.overlapReason ? { overlapReason: occ.series.overlapReason } : {}),
  })
}

// --------------------------------------------------------------- outcomes

export function setOutcome(occ: Occurrence, outcome: Outcome, note?: string) {
  patchOverride(occ.series.id, occ.date, {
    outcome,
    ...(note?.trim() ? { outcomeNote: note.trim() } : {}),
  })
}

export function clearOutcome(occ: Occurrence) {
  unsetOverrideFields(occ.series.id, occ.date, ['outcome', 'outcomeNote', 'movedTo'])
}

/**
 * Rescheduling never moves the original. The old block stays exactly where you
 * planned it, marked with where it went and why — that's the whole history idea.
 */
export function reschedule(
  occ: Occurrence,
  toDate: string,
  toStartMin: number,
  why?: string,
  /** Fit the slot you dropped it into rather than keeping its old length. */
  durationMin?: number,
): Series {
  const duration = durationMin ?? occ.endMin - occ.startMin
  const copy = addSeries({
    title: occ.title,
    kind: occ.series.kind,
    category: occ.series.category,
    schoolRole: occ.series.schoolRole,
    defaultSubtitle: occ.notes.find((n) => !n.marker)?.text ?? occ.fallbackSubtitle,
    location: occ.series.location,
    startMin: toStartMin,
    endMin: toStartMin + duration,
    recurrence: null,
    anchorDate: toDate,
  })
  patchOverride(occ.series.id, occ.date, {
    outcome: 'rescheduled',
    movedTo: { date: toDate, startMin: toStartMin },
    ...(why?.trim() ? { outcomeNote: why.trim() } : {}),
  })
  return copy
}

/**
 * Move a task INTO a school period rather than on top of one.
 *
 * You're already in that room for those 52 minutes — a second block laid over
 * the top says nothing and looks like a mistake. The task becomes a line inside
 * the period, in priority order, and the period now owes you an answer for it.
 * Works for any period: Flex, SUCCESS, or a class you'll do it during.
 */
export function rescheduleIntoPeriod(
  occ: Occurrence,
  target: Occurrence,
  why?: string,
  /** Where in that period's plan it goes. A period you're moving work into
   *  usually already has work in it. */
  priority: 'first' | 'after' = 'after',
) {
  const item = newPlanItem(occ.title)
  const plan = priority === 'first' ? [item, ...target.notes] : [...target.notes, item]
  setDayNotes(target, plan)
  patchOverride(occ.series.id, occ.date, {
    outcome: 'rescheduled',
    movedTo: { date: target.date, startMin: target.startMin },
    ...(why?.trim() ? { outcomeNote: why.trim() } : {}),
  })
}

// ------------------------------------------------------------ move/resize

/** Same-day drag or resize: this occurrence only, series untouched. */
export function reshapeOccurrence(occ: Occurrence, startMin: number, endMin: number) {
  // A pin has no length to preserve — dragging it just moves the moment.
  if (occ.series.pin) endMin = startMin
  if (!occ.series.recurrence) {
    updateSeries(occ.series.id, { startMin, endMin })
  } else {
    patchOverride(occ.series.id, occ.date, { startMin, endMin })
  }
}

/** Cross-day drag of a recurring occurrence: lift it out as a one-off so the
 *  rest of the series keeps its shape. */
export function moveOccurrenceToDate(occ: Occurrence, toDate: string, startMin: number) {
  const duration = occ.endMin - occ.startMin
  if (!occ.series.recurrence) {
    updateSeries(occ.series.id, { anchorDate: toDate, startMin, endMin: startMin + duration })
    return
  }
  patchOverride(occ.series.id, occ.date, { cancelled: true })
  addSeries({
    title: occ.title,
    kind: occ.series.kind,
    category: occ.series.category,
    schoolRole: occ.series.schoolRole,
    defaultSubtitle: occ.notes.find((n) => !n.marker)?.text ?? occ.fallbackSubtitle,
    location: occ.series.location,
    startMin,
    endMin: startMin + duration,
    recurrence: null,
    anchorDate: toDate,
  })
}

// ------------------------------------------------------------------ misc

// ------------------------------------------------------------------- pins

/** Where a new to-do lands: below everything already on that day. */
export function endOfDayFor(occupiedEndMins: number[]): number {
  const last = occupiedEndMins.length ? Math.max(...occupiedEndMins) : 0
  return Math.max(END_OF_DAY_MIN, Math.min(last + 20, 23 * 60 + 30))
}

export function setOnboarded(v: boolean) {
  commit({ ...db, onboarded: v })
}

export function setSchool(patch: Partial<SchoolConfig>) {
  commit({ ...db, school: { ...db.school, ...patch } })
}

/** Swap the bell schedule for one date — a holiday, a break, a testing day. */
export function setDaySchedule(date: string, scheduleId: string | null) {
  const next = { ...db.school.dayOverrides }
  if (scheduleId === null) delete next[date]
  else next[date] = scheduleId
  commit({ ...db, school: { ...db.school, dayOverrides: next } })
}

export function setDensity(px: number) {
  commit({ ...db, density: px })
}

export function setStartedOn(date: string) {
  commit({ ...db, startedOn: date })
}

export function resetAll() {
  commit(emptyDB())
}

export function exportJSON(): string {
  return JSON.stringify(db, null, 2)
}

export function importJSON(raw: string) {
  const parsed = JSON.parse(raw) as DB
  if (parsed.version !== 1) throw new Error('Unsupported file version')
  commit({ ...emptyDB(), ...parsed })
}
