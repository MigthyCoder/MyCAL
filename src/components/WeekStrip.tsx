import { useEffect, useLayoutEffect, useRef } from 'react'
import { addDays, dateKey, fmtDayLabel, startOfWeek } from '../lib/time'
import { SCHEDULES, scheduleIdFor } from '../lib/bell'

/**
 * The phone's week: seven day chips you tap between — and scroll, like any strip
 * of dates on a phone should.
 *
 * It holds three weeks, the one you're on and one either side, each a full page.
 * Swipe to a neighbour and the strip re-centres on it, so it scrolls forever
 * while only ever drawing 21 chips. Chips are addressed by date rather than by
 * position, which is what lets a block you're holding be dropped onto a day in
 * next week just as easily as one in this week.
 */
export function WeekStrip({
  anchor,
  selected,
  onSelect,
  onWeek,
  now,
  openDates,
  schoolEnabled,
  dayOverrides,
  dropDate,
}: {
  anchor: Date
  selected: string
  onSelect: (date: string) => void
  /** The strip settled on the week before (-1) or after (1). */
  onWeek: (dir: 1 | -1) => void
  now: Date
  /** Days that still owe you an answer, so the debt shows before you open them. */
  openDates: Set<string>
  schoolEnabled: boolean
  dayOverrides: Record<string, string>
  /** The day a lifted block is hovering over. */
  dropDate: string | null
}) {
  const ref = useRef<HTMLDivElement>(null)
  const onWeekRef = useRef(onWeek)
  onWeekRef.current = onWeek
  const start = startOfWeek(anchor)
  const todayKey = dateKey(now)

  // Every time the week changes, sit back on the middle page without animating,
  // so the swap is invisible.
  useLayoutEffect(() => {
    const el = ref.current
    if (el) el.scrollLeft = el.clientWidth
  }, [start.getTime()])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let t: ReturnType<typeof setTimeout> | undefined
    const onScroll = () => {
      clearTimeout(t)
      t = setTimeout(() => {
        const w = el.clientWidth
        if (!w) return
        const page = el.scrollLeft / w
        // Only act once snapping has actually come to rest on a page. Acting
        // mid-glide would jump the week while your finger is still moving.
        if (Math.abs(page - Math.round(page)) > 0.02) return
        const p = Math.round(page)
        if (p === 0) onWeekRef.current(-1)
        else if (p === 2) onWeekRef.current(1)
      }, 120)
    }
    // Holding a block against either edge of the strip turns the page, so you
    // can carry it into next week without letting go.
    const onEdge = (e: Event) => {
      const dir = (e as CustomEvent<number>).detail
      el.scrollBy({ left: dir * el.clientWidth, behavior: 'smooth' })
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('mycal:strip-edge', onEdge)
    return () => {
      clearTimeout(t)
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('mycal:strip-edge', onEdge)
    }
  }, [])

  return (
    <div className="strip" ref={ref}>
      {[-1, 0, 1].map((w) => (
        <div className="stripweek" key={w}>
          {Array.from({ length: 7 }, (_, i) => {
            const d = addDays(start, w * 7 + i)
            const key = dateKey(d)
            const sched = schoolEnabled ? scheduleIdFor(key, d.getDay(), dayOverrides) : null
            const short = schoolEnabled ? SCHEDULES[sched ?? '']?.short : undefined
            return (
              <button
                key={key}
                data-date={key}
                className={`chipday ${key === selected ? 'on' : ''} ${key === todayKey ? 'today' : ''} ${
                  key < todayKey ? 'past' : ''
                } ${dropDate === key ? 'droptarget' : ''}`}
                onClick={() => onSelect(key)}
              >
                <span className="dw">{fmtDayLabel(d)}</span>
                <span className="dn">{d.getDate()}</span>
                <span className="dm">
                  {openDates.has(key) && <i className="dot" />}
                  {short && <i className="bar" title={short} />}
                </span>
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
