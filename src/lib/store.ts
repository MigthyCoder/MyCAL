import { useSyncExternalStore } from 'react'
import type { DayNote, DB, MarkerType, Outcome, Override, SchoolConfig, Series, Task } from './types'
import type { Occurrence } from './occurrences'
import { MHHS_SCHEDULES, MHHS_SPECIAL_DATES, MHHS_WEEKDAYS, PRESETS, type BellSchedule } from './bell'

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
  // Seeded with MHHS rather than left blank, which does two jobs: anyone who
  // set up school before schedules were editable keeps exactly the week they
  // had (the spread in load() fills these in for them, so there is no
  // migration to get wrong), and a new user somewhere else opens the editor
  // onto a working example instead of an empty screen. All of it is editable
  // and deletable — "Start from scratch" in the editor clears the lot.
  schedules: MHHS_SCHEDULES,
  weekdays: MHHS_WEEKDAYS,
  specialDates: MHHS_SPECIAL_DATES,
  presetId: 'mhhs',
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
  tasks: [],
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
  // An archived series stops generating occurrences, so a task still pointing
  // at it would claim to be scheduled with nothing to show. Same treatment as
  // delete: back to the pile.
  commit({
    ...db,
    series: db.series.map((s) => (s.id === id ? { ...s, archived: true } : s)),
    tasks: (db.tasks ?? []).map((t) =>
      t.seriesId === id ? { ...t, seriesId: undefined, scheduledFor: undefined } : t,
    ),
  })
}

/** Hard delete — only offered for one-off blocks created by mistake. */
export function deleteSeries(id: string) {
  commit({
    ...db,
    series: db.series.filter((s) => s.id !== id),
    overrides: db.overrides.filter((o) => o.seriesId !== id),
    // A task pointing at a deleted block would render as "scheduled" forever
    // with nothing to jump to. Send it back to the pile instead.
    tasks: (db.tasks ?? []).map((t) =>
      t.seriesId === id ? { ...t, seriesId: undefined, scheduledFor: undefined } : t,
    ),
  })
}

// ------------------------------------------------------------- overrides

/** Compute the next overrides array without committing, so a change that has to
 *  touch tasks and overrides together lands in one write. */
function withOverride(
  overrides: Override[],
  seriesId: string,
  date: string,
  patch: Partial<Override>,
): Override[] {
  const i = overrides.findIndex((o) => o.seriesId === seriesId && o.date === date)
  const next = [...overrides]
  if (i === -1) next.push({ seriesId, date, ...patch })
  else next[i] = { ...next[i], ...patch }
  return next
}

/** As above, for removing fields (spread-merge cannot express undefined). */
function withoutOverrideFields(
  overrides: Override[],
  seriesId: string,
  date: string,
  fields: (keyof Override)[],
): Override[] {
  const i = overrides.findIndex((o) => o.seriesId === seriesId && o.date === date)
  if (i === -1) return overrides
  const copy = { ...overrides[i] }
  for (const f of fields) delete copy[f]
  const next = [...overrides]
  next[i] = copy
  return next
}

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

/**
 * The one-tap jot from clicking a block. It only ever touches the first UNLABELLED
 * note, so quickly writing "ask about grade" can't overwrite the test you already
 * put on that day.
 */
export function setQuickNote(occ: Occurrence, text: string) {
  const t = text.trim()
  const notes = [...occ.notes]
  const i = notes.findIndex((n) => !n.marker)
  if (i === -1) {
    if (t) notes.push({ id: uid(), text: t })
  } else if (t) {
    notes[i] = { ...notes[i], text: t }
  } else {
    notes.splice(i, 1)
  }
  setDayNotes(occ, notes)
}

export const newNote = (text = '', marker?: MarkerType): DayNote => ({ id: uid(), text, marker })

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
  const overrides = withOverride(db.overrides, occ.series.id, occ.date, {
    outcome,
    ...(note?.trim() ? { outcomeNote: note.trim() } : {}),
  })
  // Finishing the block ticks the task it came from, so a scheduled task is
  // never something you have to resolve twice. Only 'finished' counts:
  // 'dropped' means you did not do it, so the task is still owed.
  const tasks = (db.tasks ?? []).map((t) =>
    t.seriesId === occ.series.id && t.scheduledFor === occ.date && outcome === 'finished'
      ? { ...t, done: true, doneAt: Date.now() }
      : t,
  )
  commit({ ...db, overrides, tasks })
}

export function clearOutcome(occ: Occurrence) {
  const overrides = withoutOverrideFields(db.overrides, occ.series.id, occ.date, [
    'outcome',
    'outcomeNote',
    'movedTo',
  ])
  const tasks = (db.tasks ?? []).map((t) =>
    t.seriesId === occ.series.id && t.scheduledFor === occ.date
      ? { ...t, done: false, doneAt: undefined }
      : t,
  )
  commit({ ...db, overrides, tasks })
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
 * Move a task into a free school period rather than on top of one.
 *
 * Flex is already the slot for doing your own work, so laying a block over it
 * says nothing and looks like a mistake. The task becomes what that Flex is
 * *for* — its plan — and the original block still records that it moved.
 */
export function rescheduleIntoPeriod(
  occ: Occurrence,
  target: Occurrence,
  why?: string,
  /** Where in that period's plan it goes. A period you're moving work into
   *  usually already has work in it. */
  priority: 'first' | 'after' = 'after',
) {
  const item = newNote(occ.title)
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

/** Add or replace one day shape. */
export function saveSchedule(sched: BellSchedule) {
  commit({
    ...db,
    school: { ...db.school, schedules: { ...db.school.schedules, [sched.id]: sched } },
  })
}

/**
 * Drop a day shape, and every reference to it. A weekday still pointing at a
 * deleted schedule would resolve to null and read as "no school", which looks
 * like the calendar losing your week rather than you deleting a schedule.
 */
export function deleteSchedule(id: string) {
  const schedules = { ...db.school.schedules }
  delete schedules[id]

  const weekdays = { ...db.school.weekdays }
  for (const [dow, sid] of Object.entries(weekdays)) if (sid === id) delete weekdays[dow]

  const specialDates = { ...db.school.specialDates }
  for (const [date, sid] of Object.entries(specialDates)) if (sid === id) delete specialDates[date]

  const dayOverrides = { ...db.school.dayOverrides }
  for (const [date, sid] of Object.entries(dayOverrides)) if (sid === id) delete dayOverrides[date]

  commit({ ...db, school: { ...db.school, schedules, weekdays, specialDates, dayOverrides } })
}

/** Point one weekday at a day shape, or at nothing (no school that day). */
export function setWeekday(dow: number, scheduleId: string | null) {
  const weekdays = { ...db.school.weekdays }
  if (scheduleId === null) delete weekdays[String(dow)]
  else weekdays[String(dow)] = scheduleId
  commit({ ...db, school: { ...db.school, weekdays } })
}

/** Wipe the seeded preset so a school that looks nothing like MHHS starts
 *  from a blank week instead of deleting eleven schedules by hand. */
export function clearSchedules() {
  commit({
    ...db,
    school: {
      ...db.school,
      schedules: {},
      weekdays: {},
      specialDates: {},
      dayOverrides: {},
      presetId: undefined,
    },
  })
}

/** Load a school's tables wholesale. Replaces the shapes and the weekday
 *  pattern; leaves your class names alone, since period numbers usually still
 *  mean the same thing and retyping them is the tedious part. */
export function loadPreset(presetId: string) {
  const preset = PRESETS[presetId]
  if (!preset) return
  commit({
    ...db,
    school: {
      ...db.school,
      schedules: preset.schedules,
      weekdays: preset.weekdays,
      specialDates: preset.specialDates,
      // Your own per-date swaps pointed at the old school's shape ids, which
      // do not exist here. Keeping them would silently blank those days.
      dayOverrides: {},
      presetId: preset.id,
    },
  })
}

// ------------------------------------------------------------------ tasks

/** Undated work. Blank text is a no-op rather than an empty row you then have
 *  to delete. */
export function addTask(text: string): Task | null {
  const t = text.trim()
  if (!t) return null
  const task: Task = { id: uid(), text: t, createdAt: Date.now() }
  // Newest first: you add a task because it just occurred to you, and burying
  // it under everything you already wrote down is how it gets forgotten.
  commit({ ...db, tasks: [task, ...(db.tasks ?? [])] })
  return task
}

export function toggleTask(id: string) {
  const task = (db.tasks ?? []).find((t) => t.id === id)
  if (!task) return
  const nextDone = !task.done

  const tasks = (db.tasks ?? []).map((t) =>
    t.id === id ? { ...t, done: nextDone, doneAt: nextDone ? Date.now() : undefined } : t,
  )

  // A scheduled task and its block are the same promise. Ticking here resolves
  // the block too, so the grid does not keep asking about something you have
  // already said you did.
  let overrides = db.overrides
  if (task.seriesId && task.scheduledFor) {
    overrides = nextDone
      ? withOverride(overrides, task.seriesId, task.scheduledFor, { outcome: 'finished' })
      : withoutOverrideFields(overrides, task.seriesId, task.scheduledFor, [
          'outcome',
          'outcomeNote',
        ])
  }

  commit({ ...db, tasks, overrides })
}

/**
 * Give a task a day. It becomes a pin — a moment on the grid rather than a
 * box — because a task you have not sized is exactly what a pin is for.
 *
 * The task stays in the list, linked. Scheduling something is not the same as
 * having done it, and a list that empties when you make a plan is a list that
 * lies to you.
 */
export function scheduleTask(id: string, date: string): Series | null {
  const task = (db.tasks ?? []).find((t) => t.id === id)
  if (!task) return null
  if (task.seriesId) return null // already on the grid; unschedule first

  const series: Series = {
    id: uid(),
    title: task.text,
    kind: 'task',
    category: 'personal',
    schoolRole: null,
    startMin: END_OF_DAY_MIN,
    endMin: END_OF_DAY_MIN,
    recurrence: null,
    anchorDate: date,
    createdAt: Date.now(),
    pin: true,
  }

  commit({
    ...db,
    series: [...db.series, series],
    tasks: (db.tasks ?? []).map((t) =>
      t.id === id ? { ...t, seriesId: series.id, scheduledFor: date } : t,
    ),
  })
  return series
}

/** Take it back off the grid. The task returns to the pile rather than being
 *  deleted — you still have to do it, you just have not said when. */
export function unscheduleTask(id: string) {
  const task = (db.tasks ?? []).find((t) => t.id === id)
  if (!task?.seriesId) return
  const sid = task.seriesId
  commit({
    ...db,
    series: db.series.filter((s) => s.id !== sid),
    overrides: db.overrides.filter((o) => o.seriesId !== sid),
    tasks: (db.tasks ?? []).map((t) =>
      t.id === id ? { ...t, seriesId: undefined, scheduledFor: undefined } : t,
    ),
  })
}

export function editTask(id: string, text: string) {
  const t = text.trim()
  if (!t) return
  commit({ ...db, tasks: (db.tasks ?? []).map((x) => (x.id === id ? { ...x, text: t } : x)) })
}

export function deleteTask(id: string) {
  commit({ ...db, tasks: (db.tasks ?? []).filter((t) => t.id !== id) })
}

export function clearDoneTasks() {
  commit({ ...db, tasks: (db.tasks ?? []).filter((t) => !t.done) })
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
