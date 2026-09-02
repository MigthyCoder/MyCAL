import { useMemo, useState } from 'react'
import type { Occurrence } from '../lib/occurrences'
import { buildOccurrences } from '../lib/occurrences'
import { getDB, reschedule, rescheduleIntoPeriod } from '../lib/store'
import { fmtRange, fmtTime, parseKey } from '../lib/time'
import { Sheet, TimeField } from './ui'

interface Slot {
  label: string
  startMin: number
  endMin?: number
  kind: 'flex' | 'success' | 'gap'
  /** Set for a school period, which the task goes *into* rather than on top of. */
  period?: Occurrence
}

const DAY_OPEN = 7 * 60
const DAY_SHUT = 23 * 60

/**
 * Where a task can actually go on a given day. Flex is the whole reason this
 * exists — it's the obvious place to push work to, but its time moves with the
 * bell schedule, so asking someone to type it from memory is asking them to go
 * and look it up first.
 */
function slotsFor(date: string, now: Date, excludeKey: string, needMin: number): Slot[] {
  const occs = buildOccurrences(getDB(), [date], now)
    .filter((o) => o.key !== excludeKey && o.state !== 'rescheduled' && !o.pin)
    .sort((a, b) => a.startMin - b.startMin)

  const out: Slot[] = []
  for (const o of occs) {
    if (o.series.schoolRole === 'flex') {
      out.push({ label: o.title, startMin: o.startMin, endMin: o.endMin, kind: 'flex', period: o })
    } else if (o.series.schoolRole === 'success') {
      out.push({ label: 'SUCCESS', startMin: o.startMin, endMin: o.endMin, kind: 'success', period: o })
    }
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
  initial,
  onClose,
  onPickOnCalendar,
}: {
  occ: Occurrence
  initial?: ReschedDraft | null
  onClose: () => void
  onPickOnCalendar: (draft: ReschedDraft) => void
}) {
  const [date, setDate] = useState(initial?.date ?? occ.date)
  const [start, setStart] = useState(initial?.startMin ?? occ.startMin)
  const [duration, setDuration] = useState(initial?.durationMin ?? occ.endMin - occ.startMin)
  const [why, setWhy] = useState(initial?.why ?? '')
  const [intoPeriod, setIntoPeriod] = useState<Occurrence | null>(null)
  // Straight onto the end of that Flex's plan. Deciding the order is a thing you
  // do while looking at the plan, not while moving something into it.
  const priority = 'after' as const
  const now = useMemo(() => new Date(), [])

  const slots = useMemo(
    () => slotsFor(date, now, occ.key, Math.max(duration, 20)),
    [date, now, occ.key, duration],
  )

  const pick = (s: Slot) => {
    setStart(s.startMin)
    setIntoPeriod(s.period ?? null)
    if (s.endMin) setDuration(s.endMin - s.startMin)
  }

  const go = () => {
    if (intoPeriod) rescheduleIntoPeriod(occ, intoPeriod, why, priority)
    else reschedule(occ, date, start, why, duration)
    onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <h3>Move “{occ.title}”</h3>
      <div className="meta">
        Was {parseKey(occ.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} ·{' '}
        {fmtRange(occ.startMin, occ.endMin)}
      </div>

      <div className="note" style={{ marginBottom: 18 }}>
        The original block stays where it was, marked with where it went. Nothing
        in your history gets rewritten.
      </div>

      <h4>Move to</h4>
      <div className="row">
        <input
          className="field grow"
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
        {/* Sometimes you don't know when you want it until you look at the week. */}
        <button
          className="btn ghost"
          style={{ whiteSpace: 'nowrap' }}
          onClick={() => { setIntoPeriod(null); onPickOnCalendar({ date, startMin: start, durationMin: duration, why }) }}
        >
          Pick on calendar
        </button>
      </div>

      {slots.length > 0 && (
        <>
          <div className="slotlab">That day has room in</div>
          <div className="slots">
            {slots.map((s, i) => (
              <button
                key={i}
                className={`slot ${s.kind} ${start === s.startMin ? 'on' : ''}`}
                onClick={() => pick(s)}
              >
                <b>{s.label}</b>
                <span>{s.endMin ? fmtRange(s.startMin, s.endMin) : fmtTime(s.startMin)}</span>
              </button>
            ))}
          </div>
        </>
      )}

      {intoPeriod ? (
        <>
          <div className="note" style={{ marginTop: 12 }}>
            <span className="k">Into {intoPeriod.title}</span>
            It becomes what that {intoPeriod.series.schoolRole === 'flex' ? 'Flex' : 'period'} is
            for — no second block stacked on top of it.
          </div>
          {intoPeriod.notes.length > 0 && (
            <>
              <div className="slotlab">That Flex's plan will be</div>
              <ol className="planpreview">
                {[...intoPeriod.notes.map((n) => n.text), occ.title].map((t, i) => (
                  <li key={i} className={t === occ.title ? 'incoming' : ''}>
                    {t}
                  </li>
                ))}
              </ol>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.5 }}>
                Added at the end. Shuffle the order any time from the Flex itself.
              </div>
            </>
          )}
        </>
      ) : null}

      <div className="row" style={{ marginTop: 10 }}>
        <TimeField value={start} onChange={(v) => { setStart(v); setIntoPeriod(null) }} />
        <span style={{ color: 'var(--text-3)', whiteSpace: 'nowrap' }}>for</span>
        <select
          className="field"
          value={duration}
          disabled={Boolean(intoPeriod)}
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

      <h4>Why didn't it happen?</h4>
      <input
        className="field"
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        placeholder="Couldn't work in car — bad service"
        onKeyDown={(e) => { if (e.key === 'Enter') go() }}
      />
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
        Optional, but this is the part that's actually worth reading back in three months.
      </div>

      <div className="actions">
        <div className="spacer" />
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn solid" onClick={go}>Move it</button>
      </div>
    </Sheet>
  )
}
