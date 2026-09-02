import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Occurrence } from '../lib/occurrences'
import { layoutDay } from '../lib/layout'
import {
  DAY_END_MIN,
  DAY_START_MIN,
  clampMin,
  dateKey,
  fmtDayLabel,
  fmtTime,
  fmtTimeShort,
  isSameDay,
  minutesNow,
  snap,
} from '../lib/time'
import { BlockCard, RAIL_W } from './BlockCard'
import { moveOccurrenceToDate, reshapeOccurrence } from '../lib/store'
import { SCHEDULES, scheduleIdFor } from '../lib/bell'

const HOURS = Array.from(
  { length: Math.floor((DAY_END_MIN - DAY_START_MIN) / 60) + 1 },
  (_, i) => DAY_START_MIN + i * 60,
)

type Drag =
  | { kind: 'create'; day: number; a: number; b: number }
  | { kind: 'move'; occ: Occurrence; grabMin: number; day: number; start: number; moved: boolean }
  | { kind: 'resize'; occ: Occurrence; edge: 'top' | 'bottom'; start: number; end: number }

interface Props {
  pxPerMin: number
  isMobile: boolean
  /** The whole week, even when the grid is only drawing one day of it — a chip
   *  in the strip is how you drop something onto another day. */
  weekAll: Date[]
  /** Reports which strip chip a lifted block is over, so it can light up. */
  onDropTarget: (i: number | null) => void
  onSwipeDay: (dir: 1 | -1) => void
  schoolEnabled: boolean
  dayOverrides: Record<string, string>
  onEditDaySchedule: (date: string) => void
  empty: boolean
  onSetUpSchool: () => void
  days: Date[]
  occurrences: Occurrence[]
  focusedDay: number | null
  onFocusDay: (i: number | null) => void
  activeKey: string | null
  setActiveKey: (k: string | null) => void
  onOpenInspector: (occ: Occurrence) => void
  onAskReschedule: (occ: Occurrence) => void
  onCreate: (draft: { date: string; startMin: number; endMin: number }) => void
  now: Date
}

export function WeekGrid({
  pxPerMin,
  isMobile,
  weekAll,
  onDropTarget,
  onSwipeDay,
  schoolEnabled,
  dayOverrides,
  onEditDaySchedule,
  empty,
  onSetUpSchool,
  days,
  occurrences,
  focusedDay,
  onFocusDay,
  activeKey,
  setActiveKey,
  onOpenInspector,
  onAskReschedule,
  onCreate,
  now,
}: Props) {
  const colRefs = useRef<(HTMLDivElement | null)[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [railY, setRailY] = useState(0)
  const touch = useRef<{ x: number; y: number } | null>(null)
  // Long-press to lift a block, then drag it. `over` is the week-strip chip
  // under your finger, which is how you move something to another day when the
  // grid is only showing one.
  const [lift, setLift] = useState<{
    occ: Occurrence
    startMin: number
    grabMin: number
    x: number
    y: number
    over: number | null
  } | null>(null)
  const liftRef = useRef(lift)
  liftRef.current = lift
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const GRID_H = (DAY_END_MIN - DAY_START_MIN) * pxPerMin
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag

  // Open on the part of the day you're actually in, not on 6 AM.
  useEffect(() => {
    if (scrolled.current || !scrollRef.current) return
    scrolled.current = true
    const target = (minutesNow(now) - DAY_START_MIN - 105) * pxPerMin
    scrollRef.current.scrollTop = Math.max(0, target)
  }, [now, pxPerMin])

  const byDay = useMemo(() => {
    const m = new Map<string, Occurrence[]>()
    for (const d of days) m.set(dateKey(d), [])
    for (const o of occurrences) m.get(o.date)?.push(o)
    return m
  }, [days, occurrences])

  // Focused day gets ~2.6x the width; the rest stay equal. Same track count in
  // both states so the browser can interpolate between them.
  const template = useMemo(() => {
    // minmax(0, …) is required: without it the header chips ("EARLY OUT") set a
    // min-content floor and the focused day can never actually grow.
    const cols = days.map((_, i) =>
      focusedDay === i
        ? 'minmax(0, 3.4fr)'
        : focusedDay === null
          ? 'minmax(0, 1fr)'
          : 'minmax(0, 0.7fr)',
    )
    return `var(--gutter) ${cols.join(' ')}`
  }, [days, focusedDay])

  const pointToTime = useCallback((clientX: number, clientY: number) => {
    let day = -1
    for (let i = 0; i < colRefs.current.length; i++) {
      const el = colRefs.current[i]
      if (!el) continue
      const r = el.getBoundingClientRect()
      if (clientX >= r.left && clientX <= r.right) { day = i; break }
      if (day === -1 && i === colRefs.current.length - 1 && clientX > r.right) day = i
    }
    if (day === -1) day = clientX < (colRefs.current[0]?.getBoundingClientRect().left ?? 0) ? 0 : 0
    const el = colRefs.current[day]
    if (!el) return null
    const r = el.getBoundingClientRect()
    const min = DAY_START_MIN + (clientY - r.top) / pxPerMin
    return { day, min: clampMin(snap(min)) }
  }, [pxPerMin])

  useEffect(() => {
    if (!drag) return
    const onMove = (e: MouseEvent) => {
      const pt = pointToTime(e.clientX, e.clientY)
      if (!pt) return
      const d = dragRef.current
      if (!d) return
      if (d.kind === 'create') setDrag({ ...d, b: pt.min })
      else if (d.kind === 'move') {
        const start = clampMin(snap(pt.min - d.grabMin))
        setDrag({ ...d, day: pt.day, start, moved: true })
      } else {
        const dur = d.occ.endMin - d.occ.startMin
        if (d.edge === 'bottom') setDrag({ ...d, end: Math.max(pt.min, d.start + 10) })
        else setDrag({ ...d, start: Math.min(pt.min, d.end - 10) })
        void dur
      }
    }
    const onUp = () => {
      const d = dragRef.current
      setDrag(null)
      if (!d) return
      if (d.kind === 'create') {
        const a = Math.min(d.a, d.b)
        const b = Math.max(d.a, d.b)
        // A click on empty space is how you dismiss whatever you were looking at.
        // Treating it as "make me a block" ambushes you every single time.
        if (b - a < 10) return
        onCreate({ date: dateKey(days[d.day]), startMin: a, endMin: Math.min(b, DAY_END_MIN) })
      } else if (d.kind === 'move') {
        if (!d.moved) { setActiveKey(d.occ.key); return }
        const target = dateKey(days[d.day])
        const dur = d.occ.endMin - d.occ.startMin
        if (target === d.occ.date) reshapeOccurrence(d.occ, d.start, d.start + dur)
        else moveOccurrenceToDate(d.occ, target, d.start)
      } else {
        reshapeOccurrence(d.occ, d.start, d.end)
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, days, onCreate, pointToTime, setActiveKey])

  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current)
    pressTimer.current = null
  }

  const beginPress = (occ: Occurrence, e: React.TouchEvent) => {
    if (!isMobile || occ.generated || e.touches.length !== 1) return
    const t = e.touches[0]
    const startX = t.clientX
    const startY = t.clientY
    cancelPress()
    pressTimer.current = setTimeout(() => {
      const pt = pointToTime(startX, startY)
      if (!pt) return
      if (navigator.vibrate) navigator.vibrate(12)
      setLift({
        occ,
        startMin: occ.startMin,
        grabMin: pt.min - occ.startMin,
        x: startX,
        y: startY,
        over: null,
      })
    }, 420)
  }

  useEffect(() => {
    if (!lift) return
    const chipAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest('.chipday')
      if (!el) return null
      const all = [...document.querySelectorAll('.chipday')]
      const i = all.indexOf(el as Element)
      return i === -1 ? null : i
    }
    const onMove = (e: TouchEvent) => {
      e.preventDefault() // hold the page still while something is in the air
      const t = e.touches[0]
      const d = liftRef.current
      if (!d) return
      const over = chipAt(t.clientX, t.clientY)
      const pt = over === null ? pointToTime(t.clientX, t.clientY) : null
      setLift({
        ...d,
        x: t.clientX,
        y: t.clientY,
        over,
        startMin: pt ? clampMin(snap(pt.min - d.grabMin)) : d.startMin,
      })
    }
    const onEnd = () => {
      const d = liftRef.current
      setLift(null)
      if (!d) return
      const dur = d.occ.endMin - d.occ.startMin
      if (d.over !== null) {
        const target = dateKey(weekAll[d.over])
        if (target !== d.occ.date) moveOccurrenceToDate(d.occ, target, d.occ.startMin)
      } else if (d.startMin !== d.occ.startMin) {
        reshapeOccurrence(d.occ, d.startMin, d.startMin + dur)
      }
    }
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [lift, pointToTime, weekAll])

  useEffect(() => {
    onDropTarget(lift?.over ?? null)
  }, [lift?.over, onDropTarget])

  const startBlockDrag = (
    occ: Occurrence,
    dayIndex: number,
    e: React.MouseEvent,
    mode: 'move' | 'resize-top' | 'resize-bottom',
  ) => {
    if (e.button !== 0 || occ.generated) return
    e.preventDefault()
    const pt = pointToTime(e.clientX, e.clientY)
    if (!pt) return
    if (mode === 'move') {
      setDrag({ kind: 'move', occ, grabMin: pt.min - occ.startMin, day: dayIndex, start: occ.startMin, moved: false })
    } else {
      setDrag({
        kind: 'resize',
        occ,
        edge: mode === 'resize-top' ? 'top' : 'bottom',
        start: occ.startMin,
        end: occ.endMin,
      })
    }
  }

  const nowMin = minutesNow(now)
  const todayIdx = days.findIndex((d) => isSameDay(d, now))
  const showNow = todayIdx >= 0 && nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN
  const nowTop = (nowMin - DAY_START_MIN) * pxPerMin

  return (
    <div className="gridwrap">
      {!isMobile && (
      <div className="dayhead" style={{ gridTemplateColumns: template, transition: 'grid-template-columns .28s cubic-bezier(.4,0,.2,1)' }}>
        <div className="corner" />
        {days.map((d, i) => {
          const today = isSameDay(d, now)
          const key = dateKey(d)
          const past = key < dateKey(now)
          const weekend = d.getDay() === 0 || d.getDay() === 6
          const schedId = schoolEnabled ? scheduleIdFor(key, d.getDay(), dayOverrides) : null
          const manual = Boolean(dayOverrides[key])
          const chip = schoolEnabled
            ? schedId
              ? SCHEDULES[schedId]?.short
              : !weekend
                ? 'NO SCHOOL'
                : undefined
            : undefined
          return (
            <div
              key={i}
              className={`cell ${today ? 'today' : ''} ${past ? 'past' : ''} ${focusedDay === i ? 'focused' : ''}`}
              onClick={() => onFocusDay(focusedDay === i ? null : i)}
              title={focusedDay === i ? 'Collapse back to the week' : 'Expand this day'}
            >
              <div className="dow">
                {fmtDayLabel(d)}
                {schoolEnabled && (
                  <button
                    className="daycog"
                    title="Change this day's bell schedule"
                    onClick={(e) => { e.stopPropagation(); onEditDaySchedule(key) }}
                  >
                    ⋯
                  </button>
                )}
              </div>
              <div className="num">
                {String(d.getDate()).padStart(2, '0')}
                {today && <span className="todaypill">TODAY</span>}
              </div>
              {chip && <div className={`schedchip ${manual ? 'manual' : ''}`}>{chip}</div>}
            </div>
          )
        })}
      </div>
      )}

      {empty && (
        <div className="empty" style={{ zIndex: 9 }}>
          <b>Blank until you put your life here.</b>
          <span>Drag anywhere on the grid to add a block — or start with your bell schedule.</span>
          <button className="btn ghost" style={{ marginTop: 10, pointerEvents: 'auto' }} onClick={onSetUpSchool}>
            Set up school week
          </button>
        </div>
      )}

      <div
        className="scroll"
        ref={scrollRef}
        onTouchStart={(e) => {
          if (!isMobile || e.touches.length !== 1) return
          touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        }}
        onTouchEnd={(e) => {
          const t = touch.current
          touch.current = null
          if (!isMobile || !t) return
          const dx = e.changedTouches[0].clientX - t.x
          const dy = e.changedTouches[0].clientY - t.y
          // Only a clearly horizontal flick changes day — vertical is scrolling.
          if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6) return
          onSwipeDay(dx < 0 ? 1 : -1)
        }}
      >
        <div
          className="canvas"
          style={{
            gridTemplateColumns: template,
            height: GRID_H,
            transition: 'grid-template-columns .28s cubic-bezier(.4,0,.2,1)',
          }}
        >
          <div className="gutter">
            {HOURS.map((h) => (
              <div key={h} className="hr" style={{ top: (h - DAY_START_MIN) * pxPerMin }}>
                {fmtTime(h)}
              </div>
            ))}
            {showNow && <div className="nowtag" style={{ top: nowTop }}>{fmtTimeShort(nowMin)}</div>}
          </div>

          {days.map((d, i) => {
            const key = dateKey(d)
            const occs = byDay.get(key) ?? []
            const placed = layoutDay(occs, pxPerMin)
            // The rail is only for commitments you added — the "where my life is
            // happening" blocks. You don't do side work during a class, a task is
            // already the thing you're doing, and a block that's already riding on
            // something can't host a rider of its own.
            const railFor =
              !drag &&
              hoverKey &&
              placed.some(
                (x) =>
                  x.occ.key === hoverKey &&
                  x.width > 0.55 &&
                  !x.rider &&
                  !x.occ.generated &&
                  x.occ.series.kind === 'event',
              )
                ? hoverKey
                : null
            const today = isSameDay(d, now)
            const isPastDay = key < dateKey(now)
            const weekend = d.getDay() === 0 || d.getDay() === 6
            const veilH = isPastDay ? GRID_H : today ? Math.max(0, nowTop) : 0

            return (
              <div
                key={key}
                ref={(el) => { colRefs.current[i] = el }}
                className={`col ${today ? 'today' : ''} ${weekend ? 'weekend' : ''} ${focusedDay === i ? 'focused' : ''}`}
                onMouseDown={(e) => {
                  if (e.button !== 0) return
                  if ((e.target as HTMLElement).closest('.block')) return
                  const pt = pointToTime(e.clientX, e.clientY)
                  if (!pt) return
                  setActiveKey(null)
                  setDrag({ kind: 'create', day: i, a: pt.min, b: pt.min })
                }}
                onMouseLeave={() => setHoverKey(null)}
                onDoubleClick={(e) => {
                  if ((e.target as HTMLElement).closest('.block')) return
                  const pt = pointToTime(e.clientX, e.clientY)
                  if (!pt) return
                  onCreate({
                    date: dateKey(days[i]),
                    startMin: pt.min,
                    endMin: Math.min(pt.min + 45, DAY_END_MIN),
                  })
                }}
              >
                {HOURS.map((h) => (
                  <div key={h}>
                    <div className="hline" style={{ top: (h - DAY_START_MIN) * pxPerMin }} />
                    <div className="hline half" style={{ top: (h + 30 - DAY_START_MIN) * pxPerMin }} />
                  </div>
                ))}

                {veilH > 0 && <div className="pastveil" style={{ height: veilH }} />}

                {placed.map((p) => {
                  const live = drag?.kind === 'move' && drag.occ.key === p.occ.key
                  const rs = drag?.kind === 'resize' && drag.occ.key === p.occ.key
                  if (live && drag.day !== i) return null
                  const inAir = lift?.occ.key === p.occ.key
                  const shown = live
                    ? { ...p, occ: { ...p.occ, startMin: drag.start, endMin: drag.start + (p.occ.endMin - p.occ.startMin) } }
                    : rs
                      ? { ...p, occ: { ...p.occ, startMin: drag.start, endMin: drag.end } }
                      : inAir
                        ? { ...p, occ: { ...p.occ, startMin: lift.startMin, endMin: lift.startMin + (p.occ.endMin - p.occ.startMin) } }
                        : p
                  return (
                    <BlockCard
                      key={p.occ.key}
                      placed={shown}
                      pxPerMin={pxPerMin}
                      active={activeKey === p.occ.key}
                      hovered={hoverKey === p.occ.key}
                      onHover={(over, e) => {
                        // Moving between the block and its rail must not count
                        // as leaving — they're one hover target.
                        if (over) { setHoverKey(p.occ.key); return }
                        const to = e.relatedTarget as HTMLElement | null
                        if (to?.closest?.('.addrail')) return
                        setHoverKey((k) => (k === p.occ.key ? null : k))
                      }}
                      onActivate={() => setActiveKey(p.occ.key)}
                      onDismiss={() => setActiveKey(null)}
                      onOpenInspector={() => { setActiveKey(null); onOpenInspector(p.occ) }}
                      onAskReschedule={() => { setActiveKey(null); onAskReschedule(p.occ) }}
                      onAddAlongside={() => {
                        setActiveKey(null)
                        onCreate({ date: p.occ.date, startMin: p.occ.startMin, endMin: p.occ.endMin })
                      }}
                      onDragStart={(e, mode) => startBlockDrag(p.occ, i, e, mode)}
                      lifted={lift?.occ.key === p.occ.key}
                      onPressStart={(e) => beginPress(p.occ, e)}
                      onPressCancel={cancelPress}
                    />
                  )
                })}

                {/* Hover rail: lays over the right edge of a commitment rather
                    than shoving it aside — nothing on the grid moves. Click or
                    drag in it to add something alongside at that time. */}
                {railFor && (() => {
                  const p = placed.find((x) => x.occ.key === railFor)
                  if (!p) return null
                  const h = Math.max((p.occ.endMin - p.occ.startMin) * pxPerMin, 26)
                  return (
                    <div
                      className="addrail"
                      title="Add something alongside this"
                      style={{
                        top: (p.occ.startMin - DAY_START_MIN) * pxPerMin,
                        height: h,
                        left: `calc(${(p.left + p.width) * 100}% - ${RAIL_W + 3}px)`,
                        width: RAIL_W,
                      }}
                      onMouseEnter={(e) => {
                        setHoverKey(p.occ.key)
                        setRailY(e.clientY - e.currentTarget.getBoundingClientRect().top)
                      }}
                      onMouseMove={(e) =>
                        setRailY(e.clientY - e.currentTarget.getBoundingClientRect().top)
                      }
                      onMouseLeave={(e) => {
                        const to = e.relatedTarget as HTMLElement | null
                        if (to?.closest?.('.block')) return
                        setHoverKey(null)
                      }}
                    >
                      {/* The ＋ tracks your cursor instead of sitting dead centre,
                          so it's always visible and always points at the time
                          you'd actually be adding. */}
                      <span style={{ top: Math.min(Math.max(railY, 10), h - 10) }}>＋</span>
                    </div>
                  )
                })()}

                {/* a block being dragged in from another day */}
                {drag?.kind === 'move' && drag.moved && drag.day === i && drag.occ.date !== dateKey(d) && (
                  <div
                    className="dragghost"
                    style={{
                      top: (drag.start - DAY_START_MIN) * pxPerMin,
                      height: (drag.occ.endMin - drag.occ.startMin) * pxPerMin,
                      left: 3,
                      right: 3,
                    }}
                  >
                    {drag.occ.title}
                  </div>
                )}

                {drag?.kind === 'create' && drag.day === i && (
                  <div
                    className="dragghost"
                    style={{
                      top: (Math.min(drag.a, drag.b) - DAY_START_MIN) * pxPerMin,
                      height: Math.max(Math.abs(drag.b - drag.a), 18) * pxPerMin,
                      left: 3,
                      right: 3,
                    }}
                  >
                    {fmtTime(Math.min(drag.a, drag.b))}
                  </div>
                )}

                {today && showNow && <div className="nowline" style={{ top: nowTop }} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
