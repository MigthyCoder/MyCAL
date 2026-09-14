import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DueMark, Occurrence, PlacedDues } from '../lib/occurrences'
import { layoutDay } from '../lib/layout'
import {
  DAY_END_MIN,
  DAY_START_MIN,
  clampMin,
  dateKey,
  fmtDayLabel,
  fmtDur,
  fmtRange,
  fmtTime,
  fmtTimeShort,
  isSameDay,
  minutesNow,
  snap,
} from '../lib/time'
import { BlockCard, RAIL_W, type DragMode } from './BlockCard'
import {
  clearOutcome,
  moveOccurrenceToDate,
  placePin,
  reshapeOccurrence,
  setOutcome,
} from '../lib/store'
import { SCHEDULES, scheduleIdFor } from '../lib/bell'
import { CATEGORY_META } from '../lib/seed'

const HOURS = Array.from(
  { length: Math.floor((DAY_END_MIN - DAY_START_MIN) / 60) + 1 },
  (_, i) => DAY_START_MIN + i * 60,
)

/** How long a new block is when you didn't draw a length yourself. */
const DEFAULT_LEN = 45
/** Finger slop before a press counts as a drag rather than a tap. */
const SLOP = 9
/** The add-alongside rail only appears once you've deliberately rested on a
 *  block — never just because the cursor happened to pass over it. */
const RAIL_DWELL = 380
/** …and never in the moment after you've dropped something. Your cursor is still
 *  sitting on whatever you dropped it next to, and a strip fading in over that
 *  block right then reads as the block being shoved aside. */
const RAIL_QUIET = 900
const PIN_H = 26

type Drag =
  | { kind: 'create'; day: number; a: number; b: number }
  | {
      kind: 'move'
      occ: Occurrence
      grabMin: number
      day: number
      start: number
      moved: boolean
      /** A to-do carried up over a day's header, to lose its time. */
      head: number | null
    }
  | { kind: 'resize'; occ: Occurrence; edge: 'top' | 'bottom'; start: number; end: number }
  | {
      /** A to-do dragged down out of the top of its day, to be given a time. */
      kind: 'place'
      occ: Occurrence
      day: number
      start: number
      overGrid: boolean
      head: number | null
      moved: boolean
    }

/** The same gestures, driven by a finger. Touch keeps its own state because it
 *  has to decide, mid-gesture, whether you meant to drag at all — a mouse tells
 *  you that with a button, a finger only tells you by moving. */
type Touch =
  | {
      kind: 'lift'
      occ: Occurrence
      startMin: number
      grabMin: number
      x: number
      y: number
      /** The strip chip under your finger, by date. */
      over: string | null
      overGrid: boolean
      /** Over the row of untimed to-dos at the top of the day. */
      overTop: boolean
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
  /** Reports which strip day a lifted block is over, so it can light up. */
  onDropTarget: (date: string | null) => void
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
  /**
   * What a tap on the grid means right now. `move`: where something you're
   * rescheduling goes. `due`: when a task is due. One tap is the whole gesture
   * either way — no long press, no sheet.
   */
  pickMode: 'move' | 'due' | null
  /** Tapped a block while picking. */
  onPickBlock: (occ: Occurrence) => void
  /** Tapped the top of a day while picking a due date: due that day, any time. */
  onPickAllDay: (date: string) => void
  /** How long the thing you're placing is, so tapping a spot keeps its length
   *  instead of resizing it to some default you never asked for. */
  pickLen: number
  dues: PlacedDues
  onOpenDue: (m: DueMark) => void
  now: Date
}

/** A period you can drop work into rather than on top of. */
const isPeriod = (o: Occurrence) => Boolean(o.series.schoolRole) && !o.pin

const inside = (el: Element | null, x: number, y: number) => {
  if (!el) return false
  const r = el.getBoundingClientRect()
  return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom
}

const stateClass = (o: Occurrence) =>
  o.state === 'needs-outcome'
    ? 'needs'
    : o.state === 'finished' || o.state === 'dropped' || o.state === 'rescheduled' || o.state === 'past'
      ? o.state
      : ''

export function WeekGrid({
  pxPerMin,
  isMobile,
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
  pickMode,
  onPickBlock,
  onPickAllDay,
  pickLen,
  dues,
  onOpenDue,
  now,
}: Props) {
  const colRefs = useRef<(HTMLDivElement | null)[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const headRef = useRef<HTMLDivElement>(null)
  const topRowRef = useRef<HTMLDivElement>(null)
  const scrolled = useRef(false)
  const [drag, setDrag] = useState<Drag | null>(null)
  const [hoverKey, setHoverKey] = useState<string | null>(null)
  const [railKey, setRailKey] = useState<string | null>(null)
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
  const lastGesture = useRef(0)
  const lastEdge = useRef(0)
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

  // Untimed to-dos live above the grid, so they're kept out of its layout.
  const { byDay, topByDay } = useMemo(() => {
    const grid = new Map<string, Occurrence[]>()
    const top = new Map<string, Occurrence[]>()
    for (const d of days) {
      grid.set(dateKey(d), [])
      top.set(dateKey(d), [])
    }
    for (const o of occurrences) (o.allDay ? top : grid).get(o.date)?.push(o)
    return { byDay: grid, topByDay: top }
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
    lastGesture.current = Date.now()
    setTimeout(() => { handled.current = false }, 350)
  }

  // The rail waits for a deliberate hover, and stays away right after a drop.
  useEffect(() => {
    if (!hoverKey || drag || touch || pickMode) {
      setRailKey(null)
      return
    }
    setRailKey((k) => (k === hoverKey ? k : null))
    const quiet = RAIL_QUIET - (Date.now() - lastGesture.current)
    const t = setTimeout(() => setRailKey(hoverKey), Math.max(RAIL_DWELL, quiet))
    return () => clearTimeout(t)
  }, [hoverKey, drag, touch, pickMode])

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
        const head = d.occ.pin && inside(headRef.current, e.clientX, e.clientY) ? pt.day : null
        setDrag({ ...d, day: pt.day, start: clampMin(snap(pt.min - d.grabMin)), moved: true, head })
      } else if (d.kind === 'place') {
        const overGrid = inside(scrollRef.current, e.clientX, e.clientY)
        const head = !overGrid && inside(headRef.current, e.clientX, e.clientY) ? pt.day : null
        setDrag({ ...d, day: pt.day, start: pt.min, overGrid, head, moved: true })
      } else if (d.edge === 'bottom') setDrag({ ...d, end: Math.max(pt.min, d.start + 10) })
      else setDrag({ ...d, start: Math.min(pt.min, d.end - 10) })
    }
    const onUp = () => {
      const d = dragRef.current
      setDrag(null)
      lastGesture.current = Date.now()
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
        if (d.head !== null) { placePin(d.occ, dateKey(days[d.head]), null); return }
        const target = dateKey(days[d.day])
        if (d.occ.pin) { placePin(d.occ, target, d.start); return }
        const dur = d.occ.endMin - d.occ.startMin
        if (target === d.occ.date) reshapeOccurrence(d.occ, d.start, d.start + dur)
        else moveOccurrenceToDate(d.occ, target, d.start)
      } else if (d.kind === 'place') {
        if (!d.moved) return
        markHandled()
        if (d.overGrid) placePin(d.occ, dateKey(days[d.day]), d.start)
        else if (d.head !== null && dateKey(days[d.head]) !== d.occ.date) {
          placePin(d.occ, dateKey(days[d.head]), null)
        }
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
    if (e.button !== 0 || occ.generated || pickMode) return
    e.preventDefault()
    const pt = pointToTime(e.clientX, e.clientY)
    if (!pt) return
    if (mode === 'move') {
      setDrag({
        kind: 'move',
        occ,
        grabMin: pt.min - occ.startMin,
        day: dayIndex,
        start: occ.startMin,
        moved: false,
        head: null,
      })
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

  /** Pick an untimed to-do up off the top of its day. */
  const startPlaceDrag = (occ: Occurrence, dayIndex: number, e: React.MouseEvent) => {
    if (e.button !== 0 || pickMode) return
    e.preventDefault()
    e.stopPropagation()
    setDrag({ kind: 'place', occ, day: dayIndex, start: occ.startMin, overGrid: false, head: dayIndex, moved: false })
  }

  // ------------------------------------------------------------------ touch

  const cancelPress = () => {
    if (press.current) clearTimeout(press.current.timer)
    press.current = null
  }

  const buzz = (ms = 12) => { if (navigator.vibrate) navigator.vibrate(ms) }

  /** Hold a block — or an untimed to-do — to pick it up. */
  const beginPress = (occ: Occurrence, e: React.TouchEvent, fromTop = false) => {
    if (!isMobile || occ.generated || pickMode || e.touches.length !== 1) return
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
        setTouch({
          kind: 'lift',
          occ,
          startMin: occ.startMin,
          grabMin: fromTop ? 0 : pt.min - occ.startMin,
          x,
          y,
          over: null,
          overGrid: !fromTop,
          overTop: fromTop,
        })
      }, 300),
    }
  }

  /** Hold empty time to draw a new block there — then keep dragging to size it. */
  const beginEmptyPress = (dayIndex: number, e: React.TouchEvent) => {
    if (!isMobile || pickMode || e.touches.length !== 1) return
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
    if (!isMobile || occ.generated || pickMode || e.touches.length !== 1) return
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
    const chipAt = (x: number, y: number) =>
      (document.elementFromPoint(x, y)?.closest('.chipday') as HTMLElement | null)?.dataset.date ?? null
    // Holding something against either end of the week strip turns its page.
    const nudgeStrip = (x: number, y: number) => {
      const strip = document.querySelector('.strip')
      if (!strip || !inside(strip, x, y)) return
      const r = strip.getBoundingClientRect()
      const dir = x < r.left + 30 ? -1 : x > r.right - 30 ? 1 : 0
      if (!dir || Date.now() - lastEdge.current < 700) return
      lastEdge.current = Date.now()
      window.dispatchEvent(new CustomEvent('mycal:strip-edge', { detail: dir }))
    }
    const onMove = (e: TouchEvent) => {
      const d = touchRef.current
      if (!d) return
      const t = e.touches[0]
      const pt = pointToTime(t.clientX, t.clientY)
      if (d.kind === 'lift') {
        e.preventDefault() // hold the page still while something is in the air
        nudgeStrip(t.clientX, t.clientY)
        const over = chipAt(t.clientX, t.clientY)
        const overGrid = over === null && inside(scrollRef.current, t.clientX, t.clientY)
        const overTop = over === null && !overGrid && inside(topRowRef.current, t.clientX, t.clientY)
        setTouch({
          ...d,
          x: t.clientX,
          y: t.clientY,
          over,
          overGrid,
          overTop,
          startMin: overGrid && pt ? clampMin(snap(pt.min - d.grabMin)) : d.startMin,
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
        const o = d.occ
        markHandled()
        if (d.over !== null) {
          if (d.over !== o.date) {
            if (o.pin) placePin(o, d.over, o.allDay ? null : o.startMin)
            else moveOccurrenceToDate(o, d.over, o.startMin)
          }
        } else if (d.overTop) {
          if (o.pin && !o.allDay) placePin(o, o.date, null)
        } else if (d.overGrid) {
          if (o.allDay) placePin(o, o.date, d.startMin)
          else if (d.startMin !== o.startMin) {
            reshapeOccurrence(o, d.startMin, d.startMin + (o.endMin - o.startMin))
          }
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
  }, [touch, pointToTime, days, onCreate])

  const lifted = touch?.kind === 'lift' ? touch : null
  useEffect(() => {
    onDropTarget(lifted?.over ?? null)
  }, [lifted?.over, onDropTarget])

  useEffect(() => cancelPress, [])

  // ----------------------------------------------------------------- render

  const isTarget = (o: Occurrence) =>
    pickMode === 'move' ? isPeriod(o) : pickMode === 'due' ? !o.pin : false

  /** A tap on empty time. It only ever means something while you're picking a
   *  spot for something — otherwise it dismisses, which is what a tap on the
   *  background should do. */
  const tapEmpty = (dayIndex: number, clientX: number, clientY: number) => {
    if (!pickMode || handled.current) return
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
    if (pickMode) {
      if (isTarget(occ)) onPickBlock(occ)
      return
    }
    onOpenInspector(occ)
  }

  /** The untimed to-dos and deadlines for one day — drawn in the header on a
   *  desktop, and in a row above the grid on a phone. */
  const topItems = (dayIndex: number) => {
    const key = dateKey(days[dayIndex])
    const pins = topByDay.get(key) ?? []
    const due = dues.allDay.filter((m) => m.date === key)
    if (pins.length === 0 && due.length === 0) return null
    return (
      <>
        {due.map((m) => (
          <button
            key={m.key}
            className={`addue ${m.done ? 'done' : ''}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => { e.stopPropagation(); onOpenDue(m) }}
          >
            <i>DUE</i>
            <span>{m.title}</span>
          </button>
        ))}
        {pins.map((o) => (
          <div
            key={o.key}
            className={`adpin ${stateClass(o)} ${lifted?.occ.key === o.key ? 'lifted' : ''}`}
            // @ts-expect-error custom property
            style={{ '--h': CATEGORY_META[o.series.category].hue }}
            title="Drag into the day to give it a time"
            onMouseDown={(e) => startPlaceDrag(o, dayIndex, e)}
            onTouchStart={(e) => beginPress(o, e, true)}
            onTouchMove={pressMove}
            onTouchEnd={cancelPress}
            onTouchCancel={cancelPress}
            onClick={(e) => { e.stopPropagation(); openBlock(o) }}
          >
            <button
              className="pindot"
              title={o.outcome === 'finished' ? 'Done — tap to undo' : 'Mark done'}
              onMouseDown={(e) => e.stopPropagation()}
              onTouchStart={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation()
                if (o.outcome) clearOutcome(o)
                else setOutcome(o, 'finished')
              }}
            />
            <span>{o.title}</span>
          </div>
        ))}
      </>
    )
  }

  const nowMin = minutesNow(now)
  const todayIdx = days.findIndex((d) => isSameDay(d, now))
  const showNow = todayIdx >= 0 && nowMin >= DAY_START_MIN && nowMin <= DAY_END_MIN
  const nowTop = (nowMin - DAY_START_MIN) * pxPerMin

  const mobileTop = isMobile ? topItems(0) : null
  const carryingTimedPin = Boolean(lifted?.occ.pin && !lifted.occ.allDay)

  return (
    <div className={`gridwrap ${pickMode ? 'pickmode' : ''}`}>
      {!isMobile && (
      <div
        ref={headRef}
        className="dayhead"
        style={{ gridTemplateColumns: template, transition: 'grid-template-columns .28s cubic-bezier(.4,0,.2,1)' }}
      >
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
          const headTarget =
            (drag?.kind === 'move' && drag.head === i) ||
            (drag?.kind === 'place' && drag.moved && !drag.overGrid && drag.head === i)
          const items = topItems(i)
          return (
            <div
              key={i}
              className={`cell ${today ? 'today' : ''} ${past ? 'past' : ''} ${focusedDay === i ? 'focused' : ''} ${
                headTarget ? 'adtarget' : ''
              } ${pickMode === 'due' ? 'duepick' : ''}`}
              onClick={() => {
                if (pickMode === 'due') { onPickAllDay(key); return }
                onFocusDay(focusedDay === i ? null : i)
              }}
              title={
                pickMode === 'due'
                  ? 'Due this day, no particular time'
                  : focusedDay === i
                    ? 'Collapse back to the week'
                    : 'Expand this day'
              }
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
              {items && <div className="allday">{items}</div>}
            </div>
          )
        })}
      </div>
      )}

      {/* The phone's top-of-day: shown only when there's something in it, or when
          you're carrying a to-do that could be dropped back into it. */}
      {isMobile && (mobileTop || carryingTimedPin || pickMode === 'due') && (
        <div
          ref={topRowRef}
          className={`adrow ${lifted?.overTop && carryingTimedPin ? 'target' : ''} ${
            pickMode === 'due' ? 'duepick' : ''
          }`}
          onClick={() => { if (pickMode === 'due') onPickAllDay(dateKey(days[0])) }}
        >
          {pickMode === 'due' && <span className="adhint">Tap here — due today, no particular time</span>}
          {carryingTimedPin && !mobileTop && <span className="adhint">Drop here to take its time away</span>}
          {mobileTop}
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
              railKey &&
              placed.some(
                (x) =>
                  x.occ.key === railKey &&
                  x.width > 0.55 &&
                  !x.rider &&
                  !x.occ.generated &&
                  !x.occ.pin &&
                  x.occ.series.kind === 'event',
              )
                ? railKey
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
                  if (e.button !== 0 || pickMode) return
                  if ((e.target as HTMLElement).closest('.block, .dueline')) return
                  const pt = pointToTime(e.clientX, e.clientY)
                  if (!pt) return
                  setDrag({ kind: 'create', day: i, a: pt.min, b: pt.min })
                }}
                onMouseLeave={() => setHoverKey(null)}
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('.block, .dueline')) return
                  tapEmpty(i, e.clientX, e.clientY)
                }}
                onTouchStart={(e) => beginEmptyPress(i, e)}
                onTouchMove={pressMove}
                onTouchEnd={cancelPress}
                onTouchCancel={cancelPress}
                onDoubleClick={(e) => {
                  if (pickMode || (e.target as HTMLElement).closest('.block, .dueline')) return
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
                  const dur = p.occ.endMin - p.occ.startMin
                  const live = drag?.kind === 'move' && drag.occ.key === p.occ.key
                  const rs = drag?.kind === 'resize' && drag.occ.key === p.occ.key
                  // Carried to another day, or up into the header: not drawn here.
                  if (live && (drag.day !== i || drag.head !== null)) return null
                  const trs = touch?.kind === 'resize' && touch.occ.key === p.occ.key ? touch : null
                  const inAir = lifted?.occ.key === p.occ.key ? lifted : null
                  const shown = live
                    ? { ...p, occ: { ...p.occ, startMin: drag.start, endMin: drag.start + dur } }
                    : rs
                      ? { ...p, occ: { ...p.occ, startMin: drag.start, endMin: drag.end } }
                      : trs
                        ? { ...p, occ: { ...p.occ, startMin: trs.start, endMin: trs.end } }
                        : inAir
                          ? { ...p, occ: { ...p.occ, startMin: inAir.startMin, endMin: inAir.startMin + dur } }
                          : p
                  // Say how long, not just when — "2h" is the number you're
                  // actually dragging towards.
                  const liveLabel =
                    live && drag.moved
                      ? p.occ.pin
                        ? fmtTime(drag.start)
                        : fmtRange(drag.start, drag.start + dur)
                      : rs
                        ? `${fmtDur(drag.end - drag.start)} · ${fmtRange(drag.start, drag.end)}`
                        : trs?.moved
                          ? `${fmtDur(trs.end - trs.start)} · ${fmtRange(trs.start, trs.end)}`
                          : inAir?.overGrid
                            ? p.occ.pin
                              ? fmtTime(inAir.startMin)
                              : fmtRange(inAir.startMin, inAir.startMin + dur)
                            : undefined
                  return (
                    <BlockCard
                      key={p.occ.key}
                      placed={shown}
                      pxPerMin={pxPerMin}
                      hovered={hoverKey === p.occ.key}
                      dropInto={isTarget(p.occ)}
                      isMobile={isMobile}
                      dues={dues.inBlock.get(p.occ.key)}
                      onOpenDue={onOpenDue}
                      liveLabel={liveLabel}
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

                {/* Deadlines with a time but nothing on the calendar to sit in. */}
                {dues.loose
                  .filter((m) => m.date === key)
                  .map((m) => (
                    <button
                      key={m.key}
                      className={`dueline ${m.done ? 'done' : ''}`}
                      style={{ top: ((m.startMin ?? 0) - DAY_START_MIN) * pxPerMin }}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => { e.stopPropagation(); onOpenDue(m) }}
                    >
                      <i>DUE</i>
                      <span>{m.title}</span>
                      <em>{fmtTime(m.startMin ?? 0)}</em>
                    </button>
                  ))}

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
                {drag?.kind === 'move' && drag.moved && drag.head === null && drag.day === i && drag.occ.date !== key && (
                  <div
                    className="dragghost"
                    style={{
                      top: (drag.start - DAY_START_MIN) * pxPerMin,
                      height: Math.max((drag.occ.endMin - drag.occ.startMin) * pxPerMin, PIN_H),
                      left: 3,
                      right: 3,
                    }}
                  >
                    <b>{drag.occ.title}</b>
                    <span>
                      {drag.occ.pin
                        ? fmtTime(drag.start)
                        : fmtRange(drag.start, drag.start + drag.occ.endMin - drag.occ.startMin)}
                    </span>
                  </div>
                )}

                {/* an untimed to-do being given a time */}
                {drag?.kind === 'place' && drag.overGrid && drag.day === i && (
                  <div
                    className="dragghost pinghost"
                    style={{ top: (drag.start - DAY_START_MIN) * pxPerMin, height: PIN_H, left: 3, right: 3 }}
                  >
                    <b>{drag.occ.title}</b>
                    <span>{fmtTime(drag.start)}</span>
                  </div>
                )}
                {lifted?.occ.allDay && lifted.overGrid && lifted.occ.date === key && (
                  <div
                    className="dragghost live pinghost"
                    style={{ top: (lifted.startMin - DAY_START_MIN) * pxPerMin, height: PIN_H, left: 3, right: 3 }}
                  >
                    <b>{lifted.occ.title}</b>
                    <span>{fmtTime(lifted.startMin)}</span>
                  </div>
                )}

                {drag?.kind === 'create' && drag.day === i && (() => {
                  const a = Math.min(drag.a, drag.b)
                  const b = Math.max(drag.a, drag.b)
                  return (
                    <div
                      className="dragghost"
                      style={{
                        top: (a - DAY_START_MIN) * pxPerMin,
                        height: Math.max(b - a, 18) * pxPerMin,
                        left: 3,
                        right: 3,
                      }}
                    >
                      {b - a < 5 ? (
                        <span>{fmtTime(a)}</span>
                      ) : (
                        <>
                          <b>{fmtDur(b - a)}</b>
                          <span>{fmtRange(a, b)}</span>
                        </>
                      )}
                    </div>
                  )
                })()}

                {touch?.kind === 'create' && touch.day === i && (() => {
                  const a = Math.min(touch.a, touch.b)
                  const b = Math.max(touch.a, touch.b)
                  return (
                    <div
                      className="dragghost live"
                      style={{
                        top: (a - DAY_START_MIN) * pxPerMin,
                        height: Math.max(b - a, 18) * pxPerMin,
                        left: 3,
                        right: 3,
                      }}
                    >
                      <b>{fmtDur(Math.max(b - a, 10))}</b>
                      <span>{fmtRange(a, Math.max(b, a + 10))}</span>
                    </div>
                  )
                })()}

                {today && showNow && <div className="nowline" style={{ top: nowTop }} />}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
