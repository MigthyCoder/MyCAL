import { NO_SCHOOL, scheduleIdFor } from '../lib/bell'
import type { SchoolConfig } from '../lib/types'
import { setDaySchedule } from '../lib/store'
import { fmtTimeShort, parseKey } from '../lib/time'
import { Sheet } from './ui'

export function DayScheduleSheet({
  date,
  school,
  onClose,
}: {
  date: string
  school: SchoolConfig
  onClose: () => void
}) {
  const d = parseKey(date)
  const current = scheduleIdFor(date, d.getDay(), school)
  const manual = school.dayOverrides[date]
  const fromSheet = school.specialDates[date]

  const pick = (id: string | null) => { setDaySchedule(date, id); onClose() }

  return (
    <Sheet onClose={onClose}>
      <h3>{d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
      <div className="meta">
        {manual
          ? 'You set this day manually.'
          : fromSheet
            ? 'Set by the official schedule sheet.'
            : 'Following the normal weekday pattern.'}
      </div>

      <div className="schedlist">
        <button aria-pressed={manual === NO_SCHOOL} onClick={() => pick(NO_SCHOOL)}>
          <span className="sl">No school</span>
          <span className="sr">holiday / break</span>
        </button>
        {Object.values(school.schedules).map((s) => {
          const span = s.slots.filter((x) => x.role !== 'breakfast')
          const first = span[0]
          const last = span[span.length - 1]
          // A shape you have created but not filled in yet has no slots, so it
          // has no time range to print. It still has to be pickable.
          return (
            <button key={s.id} aria-pressed={current === s.id} onClick={() => pick(s.id)}>
              <span className="sl">{s.label}</span>
              <span className="sr">
                {first ? `${fmtTimeShort(first.startMin)}–${fmtTimeShort(last.endMin)}` : 'empty'}
              </span>
            </button>
          )
        })}
      </div>

      <div className="actions">
        {manual && (
          <button className="btn ghost" onClick={() => pick(null)}>Back to automatic</button>
        )}
        <div className="spacer" />
        <button className="btn solid" onClick={onClose}>Close</button>
      </div>
    </Sheet>
  )
}
