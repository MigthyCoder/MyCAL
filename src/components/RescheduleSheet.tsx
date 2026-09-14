import { useMemo, useState } from 'react'
import type { Occurrence } from '../lib/occurrences'
import { buildOccurrences } from '../lib/occurrences'
import type { DayNote } from '../lib/types'
import { getDB } from '../lib/store'
import { dateKey, fmtRange, fmtTime, parseKey } from '../lib/time'
import { Sheet, TimeField } from './ui'

interface Slot {
  label: string
  startMin: number
  endMin?: number
  kind: 'flex' | 'success' | 'class' | 'gap'
  /** Set for a school period, which the task goes *into* rather than on top of. */
  period?: Occurrence
}

const DAY_OPEN = 7 * 60
const DAY_SHUT = 23 * 60

/**
 * Where a task can actually go on a given day.
 *
 * School periods come first, because during school there is no "open time" —
 * you're in a room either way, and the honest question is which room you'll do
 * it in. Then the real holes in the evening.
 */
function slotsFor(date: string, now: Date, excludeKey: string, needMin: number): Slot[] {
  const occs = buildOccurrences(getDB(), [date], now)
    .filter((o) => o.key !== excludeKey && o.state !== 'rescheduled' && !o.pin)
    .sort((a, b) => a.startMin - b.startMin)

  const out: Slot[] = []
  for (const o of occs) {
    const role = o.series.schoolRole
    if (!role) continue
    out.push({
      label: role === 'success' ? 'SUCCESS' : o.title,
      startMin: o.startMin,
      endMin: o.endMin,
      kind: role,
      period: o,
    })
  }

  // Actual holes in the day. Merge what's booked, then report what's left.
  const busy: [number, number][] = []
  for (const o of occs) {
    const last = busy[busy.length - 1]
    if (last && o.startMin <= last[1]) last[1] = Math.max(last[1], o.endMin)
    else busy.push([o.startMin, o.endMin])
  }
  let cursor = DAY_OPEN
  const gaps: [number, number][] = []
  for (const [a, b] of busy) {
    if (a - cursor >= needMin) gaps.push([cursor, a])
    cursor = Math.max(cursor, b)
  }
  if (DAY_SHUT - cursor >= needMin) gaps.push([cursor, DAY_SHUT])

  for (const [a, b] of gaps.slice(0, 4)) {
    out.push({ label: 'Open', startMin: a, endMin: Math.min(b, a + Math.max(needMin, 60)), kind: 'gap' })
  }

  return out
}

export interface ReschedDraft {
  date: string
  startMin: number
  durationMin: number
  why: string
}

export function RescheduleSheet({
  occ,
  item,
  whyInit,
  initial,
  onClose,
  onLandAt,
  onDropInto,
  onPickOnCalendar,
}: {
  occ: Occurrence
  /** Moving one planned line out of `occ` (a period), rather than `occ` itself.
   *  The class never moves — only the work you'd parked in it. */
  item?: DayNote
  /** A reason already typed somewhere else, e.g. in the outcome sheet. */
  whyInit?: string
  initial?: ReschedDraft | null
  onClose: () => void
  onLandAt: (date: string, startMin: number, durationMin: number, why: string) => void
  onDropInto: (target: Occurrence, why: string) => void
  onPickOnCalendar: (draft: ReschedDraft) => void
}) {
  // A day that's already over has no open time left to move anything into, so
  // moving something out of last Wednesday starts from today, not from then.
  const [date, setDate] = useState(() => {
    const today = dateKey(new Date())
    return initial?.date ?? (occ.date < today ? today : occ.date)
  })
  const [start, setStart] = useState(initial?.startMin ?? occ.startMin)
  const [duration, setDuration] = useState(
    initial?.durationMin ?? (item ? 45 : occ.endMin - occ.startMin),
  )
  const [why, setWhy] = useState(initial?.why ?? whyInit ?? '')
  const name = item?.text ?? occ.title
  const wasDay = parseKey(occ.date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
  // Typing an exact time is the rare case, so it stays folded away until asked
  // for. Nine times out of ten you want to look at the week and point at it.
  const [exact, setExact] = useState(Boolean(initial))
  const now = useMemo(() => new Date(), [])

  const slots = useMemo(
    () => slotsFor(date, now, occ.key, Math.max(duration, 20)),
    [date, now, occ.key, duration],
  )

  const pick = (s: Slot) => {
    if (s.period) onDropInto(s.period, why)
    else onLandAt(date, s.startMin, (s.endMin ?? s.startMin + duration) - s.startMin, why)
  }

  return (
    <Sheet onClose={onClose}>
      <h3>Move “{name}”</h3>
      <div className="meta">
        {item ? (
          <>Was planned in {occ.title} · {wasDay}</>
        ) : (
          <>
            Was {wasDay} · {fmtRange(occ.startMin, occ.endMin)}
          </>
        )}
      </div>

      <h4>Why didn't it happen?</h4>
      <input
        className="field"
        autoFocus
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        placeholder="Couldn't work in car — bad service"
      />
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
        Optional, but this is the part that's actually worth reading back in three
        months.{' '}
        {item
          ? `The line stays in ${occ.title}, struck through with where it went. The class itself isn't touched.`
          : 'The original block stays where it was, marked with where it went.'}
      </div>

      {/* The whole point of a calendar is that you can see the week. Pointing at
          it beats describing a time to a form, so that's the button. */}
      <button
        className="bigpick"
        onClick={() => onPickOnCalendar({ date, startMin: start, durationMin: duration, why })}
      >
        <b>Put it on the calendar</b>
        <span>Tap any open time — or tap a class, Flex or SUCCESS to do it in that period</span>
      </button>

      {slots.length > 0 && (
        <>
          <div className="slotlab">
            Or straight into{' '}
            {parseKey(date).toLocaleDateString(undefined, { weekday: 'long' })}
          </div>
          <div className="slots">
            {slots.map((s, i) => (
              <button key={i} className={`slot ${s.kind}`} onClick={() => pick(s)}>
                <b>{s.label}</b>
                <span>{s.endMin ? fmtRange(s.startMin, s.endMin) : fmtTime(s.startMin)}</span>
              </button>
            ))}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.5 }}>
            A period takes it <i>inside</i> — it becomes a line in that block's list
            and still asks you whether it got done. Nothing gets stacked on top.
          </div>
        </>
      )}

      {exact ? (
        <>
          <h4>Exact time</h4>
          <div className="row">
            <input
              className="field grow"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <TimeField value={start} onChange={setStart} />
            <span style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>for</span>
            <select
              className="field"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            >
              {[15, 20, 30, 45, 52, 60, 80, 90, 120].map((m) => (
                <option key={m} value={m}>
                  {m} min
                </option>
              ))}
              {![15, 20, 30, 45, 52, 60, 80, 90, 120].includes(duration) && (
                <option value={duration}>{duration} min</option>
              )}
            </select>
          </div>
          <div className="actions">
            <div className="spacer" />
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn solid" onClick={() => onLandAt(date, start, duration, why)}>
              Move it
            </button>
          </div>
        </>
      ) : (
        <div className="actions">
          <button className="btn ghost sm" onClick={() => setExact(true)}>
            Type an exact time instead
          </button>
          <div className="spacer" />
          <button className="btn ghost" onClick={onClose}>Cancel</button>
        </div>
      )}
    </Sheet>
  )
}
