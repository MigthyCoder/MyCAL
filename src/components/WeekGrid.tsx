import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Occurrence } from '../lib/occurrences'
import { layoutDay } from '../lib/layout'
import {
  DAY_END_MIN,
  DAY_START_MIN,
  clampMin,
  dateKey,
  fmtDayLabel,
  fmtRange,
  fmtTime,
  fmtTimeShort,
  isSameDay,
  minutesNow,
  snap,
} from '../lib/time'
import { BlockCard, RAIL_W, type DragMode } from './BlockCard'
import { moveOccurrenceToDate, reshapeOccurrence } from '../lib/store'
import { SCHEDULES, scheduleIdFor } from '../lib/bell'

const HOURS = Array.from(
  { length: Math.floor((DAY_END_MIN - DAY_START_MIN) / 60) + 1 },
  (_, i) => DAY_START_MIN + i * 60,
)

/** How long a new block is when you didn't draw a length yourself. */
const DEFAULT_LEN = 45
/** Finger slop before a press counts as a drag rather than a tap. */
const SLOP = 9

type Drag =
  | { kind: 'create'; day: number; a: number; b: number }
  | { kind: 'move'; occ: Occurrence; grabMin: number; day: number; start: number; moved: boolean }
  | { kind: 'resize'; occ: Occurrence; edge: 'top' | 'bottom'; start: number; end: number }

/** The same three gestures, driven by a finger. Touch keeps its own state because
 *  it has to decide, mid-gesture, whether you meant to drag at all — a mouse
 *  tells you that with a button, a finger only tells you by moving. */
type Touch =
  | {
      kind: 'lift'
      occ: Occurrence
      startMin: number
      grabMin: number
      x: number
      y: number
      over: number | null
    }
  | {
      kind: 'resize'
      occ: Occurrence
      edge: 'top' | 'bottom'
      start: number
      end: number
      /** Where the finger went down, so a tap on the edge stays a tap. */
      y0: number
      moved: boolean
    }
  | { kind: 'create'; day: number; a: number; b: number }

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
  onOpenInspector: (occ: Occurrence) => void
  onCreate: (draft: { date: string; startMin: number; endMin: number }) => void
  /** Set while you're choosing a landing spot for something you're moving. One
   *  tap is the whole gesture then — no long press, no sheet. */
  picking: boolean
  /** Tapped a school period while picking: the work goes inside it. */
  onDropIntoPeriod: (occ: Occurrence) => void
  /** How long the thing you're placing is, so tapping a spot keeps its length
   *  instead of resizing it to some default you never asked for. */
  pickLen: number
  now: Date
}

/** A period you can drop work into rather than on top of. */
const isPeriod = (o: Occurrence) => Boolean(o.series.schoolRole) && !o.pin

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
  onOpenInspector,
  onCreate,
  picking,
  onDropIntoPeriod,
  pickLen,
  now,
}: Props) {
  const colRefs = useRef<(HTMLDivElement | null)[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [railY, setRailY] = useState(0)
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const [touch, setTouch] = useState<Touch | null>(null)
  const touchRef = useRef(touch)
  touchRef.current = touch
  // A finger that has gone down but hasn't yet committed to anything. Whichever
  // happens first wins: the timer (a long press) or enough movement (a scroll).
  const press = useRef<{ x: number; y: number; timer: ReturnType<typeof setTimeout> } | null>(null)
  // A gesture that did something must not also fire the click that follows it.
  // Otherwise every drag ends by opening the sheet for the thing you just moved.
  const handled = useRef(false)
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
    if (day === -1) day = 0
    const el = colRefs.current[day]
    if (!el) return null
    const r = el.getBoundingClientRect()
    const min = DAY_START_MIN + (clientY - r.top) / pxPerMin
    return { day, min: clampMin(snap(min)) }
  }, [pxPerMin])

  /** Swallow the click that a completed gesture is about to produce. */
  const markHandled = () => {
    handled.current = true
    setTimeout(() => { handled.current = false }, 350)
  }

  // ------------------------------------------------------------------ mouse

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
      } else if (d.edge === 'bottom') setDrag({ ...d, end: Math.max(pt.min, d.start + 10) })
      else setDrag({ ...d, start: Math.min(pt.min, d.end - 10) })
    }
    const onUp = () => {
      const d = dragRef.current
      setDrag(null)
      if (!d) return
      if (d.kind === 'create') {
        const a = Math.min(d.a, d.b)
        const b = Math.max(d.a, d.b)
        // A click on empty space is how you dismiss whatever you were looking at,
        // or — while you're picking a time — how you choose one. Treating it as
        // "make me a block" ambushes you every single time.
        if (b - a < 10) return
        markHandled()
        onCreate({ date: dateKey(days[d.day]), startMin: a, endMin: Math.min(b, DAY_END_MIN) })
      } else if (d.kind === 'move') {
        if (!d.moved) return
        markHandled()
        const target = dateKey(days[d.day])
        const dur = d.occ.endMin - d.occ.startMin
        if (target === d.occ.date) reshapeOccurrence(d.occ, d.start, d.start + dur)
        else moveOccurrenceToDate(d.occ, target, d.start)
      } else {
        if (d.start === d.occ.startMin && d.end === d.occ.endMin) return
        markHandled()
        reshapeOccurrence(d.occ, d.start, d.end)
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [drag, days, onCreate, pointToTime])

  const startBlockDrag = (occ: Occurrence, dayIndex: number, e: React.MouseEvent, mode: DragMode) => {
    if (e.button !== 0 || occ.generated || picking) return
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

  // ------------------------------------------------------------------ touch

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
  }

  const buzz = (ms = 12) => { if (navigator.vibrate) navigator.vibrate(ms) }

  /** Hold a block to pick it up. */
  const beginPress = (occ: Occurrence, e: React.TouchEvent) => {
    if (!isMobile || occ.generated || picking || e.touches.length !== 1) return
    const t = e.touches[0]
    const x = t.clientX
    const y = t.clientY
    cancelPress()
    press.current = {
      x,
      y,
      timer: setTimeout(() => {
        press.current = null
        const pt = pointToTime(x, y)
        if (!pt) return
        buzz()
        setTouch({ kind: 'lift', occ, startMin: occ.startMin, grabMin: pt.min - occ.startMin, x, y, over: null })
      }, 300),
    }
  }

  /** Hold empty time to draw a new block there — then keep dragging to size it. */
  const beginEmptyPress = (dayIndex: number, e: React.TouchEvent) => {
    if (!isMobile || picking || e.touches.length !== 1) return
    if ((e.target as HTMLElement).closest('.block')) return
    const t = e.touches[0]
    const x = t.clientX
    const y = t.clientY
    cancelPress()
    press.current = {
      x,
      y,
      timer: setTimeout(() => {
        press.current = null
        const pt = pointToTime(x, y)
        if (!pt) return
        buzz(16)
        setTouch({ kind: 'create', day: dayIndex, a: pt.min, b: Math.min(pt.min + DEFAULT_LEN, DAY_END_MIN) })
      }, 330),
    }
  }

  /** A finger on the top or bottom edge resizes straight away — but a finger that
   *  never moves was a tap on the block, and still opens it. */
  const beginTouchResize = (occ: Occurrence, e: React.TouchEvent, edge: 'top' | 'bottom') => {
    if (!isMobile || occ.generated || picking || e.touches.length !== 1) return
    e.stopPropagation()
    cancelPress()
    setTouch({
      kind: 'resize',
      occ,
      edge,
      start: occ.startMin,
      end: occ.endMin,
      y0: e.touches[0].clientY,
      moved: false,
    })
  }

  /** Only real movement kills a press. A fingertip always drifts a pixel or two,
   *  and cancelling on that is why holding a block never seemed to work. */
  const pressMove = (e: React.TouchEvent) => {
    const p = press.current
    if (!p) return
    const t = e.touches[0]
    if (Math.hypot(t.clientX - p.x, t.clientY - p.y) > SLOP) cancelPress()
  }

  useEffect(() => {
    if (!touch) return
    const chipAt = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest('.chipday')
      if (!el) return null
      const all = [...document.querySelectorAll('.chipday')]
      const i = all.indexOf(el as Element)
      return i === -1 ? null : i
    }
    const onMove = (e: TouchEvent) => {
      const d = touchRef.current
      if (!d) return
      const t = e.touches[0]
      const pt = pointToTime(t.clientX, t.clientY)
      if (d.kind === 'lift') {
        e.preventDefault() // hold the page still while something is in the air
        const over = chipAt(t.clientX, t.clientY)
        setTouch({
          ...d,
          x: t.clientX,
          y: t.clientY,
          over,
          startMin: over === null && pt ? clampMin(snap(pt.min - d.grabMin)) : d.startMin,
        })
      } else if (d.kind === 'resize') {
        // Under the slop it's still a tap on the block — let the page scroll and
        // let the click through, rather than snapping the block to a new length
        // because a fingertip drifted two pixels.
        if (!pt || (!d.moved && Math.abs(t.clientY - d.y0) < SLOP)) return
        e.preventDefault()
        setTouch(
          d.edge === 'bottom'
            ? { ...d, end: Math.max(pt.min, d.start + 10), moved: true }
            : { ...d, start: Math.min(pt.min, d.end - 10), moved: true },
        )
      } else {
        if (!pt) return
        e.preventDefault()
        setTouch({ ...d, b: pt.min })
      }
    }
    const onEnd = () => {
      const d = touchRef.current
      setTouch(null)
      if (!d) return
      if (d.kind === 'lift') {
        const dur = d.occ.endMin - d.occ.startMin
        markHandled()
        if (d.over !== null) {
          const target = dateKey(weekAll[d.over])
          if (target !== d.occ.date) moveOccurrenceToDate(d.occ, target, d.occ.startMin)
        } else if (d.startMin !== d.occ.startMin) {
          reshapeOccurrence(d.occ, d.startMin, d.startMin + dur)
        }
      } else if (d.kind === 'resize') {
        // Went down on the edge but never moved: that was a tap on the block.
        if (!d.moved) return
        markHandled()
        buzz(8)
        reshapeOccurrence(d.occ, d.start, d.end)
      } else {
        markHandled()
        const a = Math.min(d.a, d.b)
        const b = Math.max(d.a, d.b)
        onCreate({
          date: dateKey(days[d.day]),
          startMin: a,
          endMin: Math.min(Math.max(b, a + 10), DAY_END_MIN),
        })
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
  }, [touch, pointToTime, weekAll, days, onCreate])

  const lifted = touch?.kind === 'lift' ? touch : null
  useEffect(() => {
    onDropTarget(lifted?.over ?? null)
  }, [lifted?.over, onDropTarget])

  useEffect(() => cancelPress, [])

  // ----------------------------------------------------------------- render

  /** A tap on empty time. It only ever means something while you're picking a
   *  spot for something — otherwise it dismisses, which is what a tap on the
   *  background should do. */
  const tapEmpty = (dayIndex: number, clientX: number, clientY: number) => {
    if (!picking || handled.current) return
    const pt = pointToTime(clientX, clientY)
    if (!pt) return
    onCreate({
      date: dateKey(days[dayIndex]),
      startMin: pt.min,
      endMin: Math.min(pt.min + pickLen, DAY_END_MIN),
    })
  }

  const openBlock = (occ: Occurrence) => {
    if (handled.current) return
    if (picking) {
      if (isPeriod(occ)) onDropIntoPeriod(occ)
      return
    }
    onOpenInspector(occ)
  }

  const nowMin = minutesNow(now)
  const todayIdx = days.findIndex((d) => isSameDay(d, now))
  const showNow = todayIdx >= 0 && nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN
  const nowTop = (nowMin - DAY_START_MIN) * pxPerMin

  return (
    <div className={`gridwrap ${picking ? 'pickmode' : ''}`}>
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
          <span>
            {isMobile
              ? 'Hold anywhere on the grid to add a block — or start with your bell schedule.'
              : 'Drag anywhere on the grid to add a block — or start with your bell schedule.'}
          </span>
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
          swipe.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
        }}
        onTouchEnd={(e) => {
          const t = swipe.current
          swipe.current = null
          if (!isMobile || !t || touchRef.current) return
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
              !picking &&
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
                  if (e.button !== 0 || picking) return
                  if ((e.target as HTMLElement).closest('.block')) return
                  const pt = pointToTime(e.clientX, e.clientY)
                  if (!pt) return
                  setDrag({ kind: 'create', day: i, a: pt.min, b: pt.min })
                }}
                onMouseLeave={() => setHoverKey(null)}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('.block')) return
                  tapEmpty(i, e.clientX, e.clientY)
                }}
                onTouchStart={(e) => beginEmptyPress(i, e)}
                onTouchMove={pressMove}
                onTouchEnd={cancelPress}
                onTouchCancel={cancelPress}
                onDoubleClick={(e) => {
                  if (picking || (e.target as HTMLElement).closest('.block')) return
                  const pt = pointToTime(e.clientX, e.clientY)
                  if (!pt) return
                  onCreate({
                    date: dateKey(days[i]),
                    startMin: pt.min,
                    endMin: Math.min(pt.min + DEFAULT_LEN, DAY_END_MIN),
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
                  const trs = touch?.kind === 'resize' && touch.occ.key === p.occ.key ? touch : null
                  const inAir = lifted?.occ.key === p.occ.key ? lifted : null
                  const shown = live
                    ? { ...p, occ: { ...p.occ, startMin: drag.start, endMin: drag.start + (p.occ.endMin - p.occ.startMin) } }
                    : rs
                      ? { ...p, occ: { ...p.occ, startMin: drag.start, endMin: drag.end } }
                      : trs
                        ? { ...p, occ: { ...p.occ, startMin: trs.start, endMin: trs.end } }
                        : inAir
                          ? { ...p, occ: { ...p.occ, startMin: inAir.startMin, endMin: inAir.startMin + (p.occ.endMin - p.occ.startMin) } }
                          : p
                  return (
                    <BlockCard
                      key={p.occ.key}
                      placed={shown}
                      pxPerMin={pxPerMin}
                      hovered={hoverKey === p.occ.key}
                      dropInto={picking && isPeriod(p.occ)}
                      isMobile={isMobile}
                      onHover={(over, e) => {
                        // Moving between the block and its rail must not count
                        // as leaving — they're one hover target.
                        if (over) { setHoverKey(p.occ.key); return }
                        const to = e.relatedTarget as HTMLElement | null
                        if (to?.closest?.('.addrail')) return
                        setHoverKey((k) => (k === p.occ.key ? null : k))
                      }}
                      onOpen={() => openBlock(p.occ)}
                      onDragStart={(e, mode) => startBlockDrag(p.occ, i, e, mode)}
                      lifted={lifted?.occ.key === p.occ.key}
                      onPressStart={(e) => beginPress(p.occ, e)}
                      onPressMove={pressMove}
                      onPressEnd={cancelPress}
                      onTouchResize={(e, edge) => beginTouchResize(p.occ, e, edge)}
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

                {touch?.kind === 'create' && touch.day === i && (
                  <div
                    className="dragghost live"
                    style={{
                      top: (Math.min(touch.a, touch.b) - DAY_START_MIN) * pxPerMin,
                      height: Math.max(Math.abs(touch.b - touch.a), 18) * pxPerMin,
                      left: 3,
                      right: 3,
                    }}
                  >
                    {fmtRange(Math.min(touch.a, touch.b), Math.max(touch.a, touch.b))}
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
