import { useSyncExternalStore } from 'react'
import type { DB, Marker, Outcome, Override, Reminder, SchoolConfig, Series } from './types'
import type { Occurrence } from './occurrences'

const KEY = 'mycal.db.v1'

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

function load(): DB {
  const fresh = emptyDB()
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fresh
    const parsed = JSON.parse(raw) as DB
    if (parsed.version !== 1) return fresh
    return {
      ...fresh,
      ...parsed,
      startedOn: parsed.startedOn || fresh.startedOn,
      density: parsed.density || fresh.density,
      reminders: parsed.reminders ?? [],
      school: { ...DEFAULT_SCHOOL, ...(parsed.school ?? {}) },
    }
  } catch {
    return fresh
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

export const uid = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

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

export function setSubtitle(occ: Occurrence, text: string) {
  const trimmed = text.trim()
  if (!trimmed) unsetOverrideFields(occ.series.id, occ.date, ['subtitle'])
  else patchOverride(occ.series.id, occ.date, { subtitle: trimmed })
}

export function setMarker(occ: Occurrence, marker: Marker | null) {
  if (!marker) unsetOverrideFields(occ.series.id, occ.date, ['marker'])
  else patchOverride(occ.series.id, occ.date, { marker })
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
): Series {
  const duration = occ.endMin - occ.startMin
  const copy = addSeries({
    title: occ.title,
    kind: occ.series.kind,
    category: occ.series.category,
    schoolRole: occ.series.schoolRole,
    defaultSubtitle: occ.subtitle,
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

// ------------------------------------------------------------ move/resize

/** Same-day drag or resize: this occurrence only, series untouched. */
export function reshapeOccurrence(occ: Occurrence, startMin: number, endMin: number) {
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
    defaultSubtitle: occ.subtitle,
    location: occ.series.location,
    startMin,
    endMin: startMin + duration,
    recurrence: null,
    anchorDate: toDate,
  })
}

// ------------------------------------------------------------------ misc

// ------------------------------------------------------------- reminders

export function addReminder(date: string, text: string) {
  const r: Reminder = { id: uid(), date, text: text.trim(), done: false, createdAt: Date.now() }
  commit({ ...db, reminders: [...db.reminders, r] })
}

export function toggleReminder(id: string) {
  commit({
    ...db,
    reminders: db.reminders.map((r) => (r.id === id ? { ...r, done: !r.done } : r)),
  })
}

export function editReminder(id: string, text: string) {
  const t = text.trim()
  if (!t) return removeReminder(id)
  commit({ ...db, reminders: db.reminders.map((r) => (r.id === id ? { ...r, text: t } : r)) })
}

export function removeReminder(id: string) {
  commit({ ...db, reminders: db.reminders.filter((r) => r.id !== id) })
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
