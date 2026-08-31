import { NO_SCHOOL, SCHEDULES, SPECIAL_DATES, scheduleIdFor } from '../lib/bell'
import { setDaySchedule } from '../lib/store'
import { fmtTimeShort, parseKey } from '../lib/time'
import { Sheet } from './ui'

export function DayScheduleSheet({
  date,
  overrides,
  onClose,
}: {
  date: string
  overrides: Record<string, string>
  onClose: () => void
}) {
  const d = parseKey(date)
  const current = scheduleIdFor(date, d.getDay(), overrides)
  const manual = overrides[date]
  const fromSheet = SPECIAL_DATES[date]

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
        {Object.values(SCHEDULES).map((s) => {
          const span = s.slots.filter((x) => x.role !== 'breakfast')
          const first = span[0]
          const last = span[span.length - 1]
          return (
            <button key={s.id} aria-pressed={current === s.id} onClick={() => pick(s.id)}>
              <span className="sl">{s.label}</span>
              <span className="sr">{fmtTimeShort(first.startMin)}–{fmtTimeShort(last.endMin)}</span>
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
