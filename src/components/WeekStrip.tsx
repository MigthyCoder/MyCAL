import { dateKey, fmtDayLabel, isSameDay } from '../lib/time'
import type { Occurrence } from '../lib/occurrences'
import { scheduleIdFor } from '../lib/bell'
import type { SchoolConfig } from '../lib/types'

/**
 * The phone's replacement for seven columns: a row of day chips you tap between.
 * Each chip carries a dot per open loop so you can see where the debt is without
 * opening the day.
 */
export function WeekStrip({
  days,
  selected,
  onSelect,
  now,
  occurrences,
  schoolEnabled,
  school,
  dropTarget,
}: {
  days: Date[]
  selected: number
  onSelect: (i: number) => void
  now: Date
  occurrences: Occurrence[]
  schoolEnabled: boolean
  school: SchoolConfig
  /** Index of the day a lifted block is currently hovering over. */
  dropTarget: number | null
}) {
  const openByDay = new Map<string, number>()
  for (const o of occurrences) {
    if (o.state !== 'needs-outcome') continue
    openByDay.set(o.date, (openByDay.get(o.date) ?? 0) + 1)
  }

  return (
    <div className="strip">
      {days.map((d, i) => {
        const key = dateKey(d)
        const today = isSameDay(d, now)
        const past = key < dateKey(now)
        const open = openByDay.get(key) ?? 0
        const sched = schoolEnabled ? scheduleIdFor(key, d.getDay(), school) : null
        const short = schoolEnabled ? school.schedules[sched ?? '']?.short : undefined
        return (
          <button
            key={key}
            className={`chipday ${i === selected ? 'on' : ''} ${today ? 'today' : ''} ${
              past ? 'past' : ''
            } ${dropTarget === i ? 'droptarget' : ''}`}
            onClick={() => onSelect(i)}
          >
            <span className="dw">{fmtDayLabel(d)}</span>
            <span className="dn">{d.getDate()}</span>
            <span className="dm">
              {open > 0 && <i className="dot" />}
              {short && <i className="bar" title={short} />}
            </span>
          </button>
        )
      })}
    </div>
  )
}
