import { useEffect, useMemo, useState } from 'react'
import { WeekGrid } from './components/WeekGrid'
import { Inspector } from './components/Inspector'
import { CreateSheet, type Draft } from './components/CreateSheet'
import { RescheduleSheet, type ReschedDraft } from './components/RescheduleSheet'
import { Onboarding } from './components/Onboarding'
import { DayScheduleSheet } from './components/DayScheduleSheet'
import { WeekStrip } from './components/WeekStrip'
import { SyncButton, SyncSheet } from './components/SyncSheet'
import { MOBILE, useMedia } from './lib/useMedia'
import { buildOccurrences, openLoops, type Occurrence } from './lib/occurrences'
import { DENSITY_STEPS, setDensity, useDB } from './lib/store'
import { CATEGORIES, CATEGORY_META } from './lib/seed'
import { addDays, dateKey, fmtMonthRange, fmtTime, isSameDay, parseKey, startOfWeek, weekDays } from './lib/time'

export default function App() {
  const db = useDB()
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()))
  const [now, setNow] = useState(() => new Date())
  const [focusedDay, setFocusedDay] = useState<number | null>(null)
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const [inspect, setInspect] = useState<Occurrence | null>(null)
  const [rescheduling, setRescheduling] = useState<Occurrence | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [onboarding, setOnboarding] = useState(false)
  const [schedDay, setSchedDay] = useState<string | null>(null)
  const [syncOpen, setSyncOpen] = useState(false)
  const [dropTarget, setDropTarget] = useState<number | null>(null)
  // "Pick on calendar": the next time you choose on the grid becomes the target
  // for the move you already started, instead of creating a new block.
  const [picking, setPicking] = useState<{ occ: Occurrence; draft: ReschedDraft } | null>(null)
  const [reschedInit, setReschedInit] = useState<ReschedDraft | null>(null)
  const isMobile = useMedia(MOBILE)
  const [mobileDay, setMobileDay] = useState(() => {
    const d = new Date().getDay()
    return d === 0 ? 6 : d - 1 // Monday-first index of today
  })

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  const days = useMemo(() => weekDays(anchor), [anchor])
  const dateKeys = useMemo(() => days.map(dateKey), [days])
  // Seven 47px columns is not a calendar. On a phone the grid renders one day
  // and the week lives in the strip above it.
  const gridDays = useMemo(
    () => (isMobile ? [days[Math.min(mobileDay, 6)]] : days),
    [isMobile, days, mobileDay],
  )

  const occurrences = useMemo(
    () => buildOccurrences(db, dateKeys, now),
    [db, dateKeys, now],
  )

  // Open loops are pulled from a wider window than the visible week — something
  // you skipped 10 days ago should still be nagging you.
  const loopWindow = useMemo(() => {
    const start = addDays(new Date(), -21)
    return Array.from({ length: 22 }, (_, i) => dateKey(addDays(start, i)))
  }, [now.toDateString()])

  const loops = useMemo(
    () => openLoops(buildOccurrences(db, loopWindow, now)),
    [db, loopWindow, now],
  )

  const thisWeek = isSameDay(startOfWeek(now), anchor)
  const jump = (n: number) => { setAnchor((a) => addDays(a, n * 7)); setFocusedDay(null) }
  const goToday = () => {
    setAnchor(startOfWeek(new Date()))
    setFocusedDay(null)
    const d = new Date().getDay()
    setMobileDay(d === 0 ? 6 : d - 1)
  }

  const goToOccurrence = (o: Occurrence) => {
    const d = parseKey(o.date)
    setAnchor(startOfWeek(d))
    const idx = d.getDay() === 0 ? 6 : d.getDay() - 1
    setMobileDay(idx)
    setInspect(o)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA/)) return
      if (e.key === 'Escape') {
        // Escape used to clear the grid selection and nothing else, so every
        // sheet had to be dismissed by finding its close button. Back out one
        // layer per press, innermost first, so a nested flow unwinds the way
        // you entered it instead of collapsing all at once.
        if (picking) { setPicking(null); return }
        if (schedDay) { setSchedDay(null); return }
        if (draft) { setDraft(null); return }
        if (rescheduling) { setRescheduling(null); return }
        if (inspect) { setInspect(null); return }
        if (syncOpen) { setSyncOpen(false); return }
        if (onboarding) { setOnboarding(false); return }
        setActiveKey(null); setFocusedDay(null)
        return
      }
      // Arrow keys page the week, so they must not fire underneath an open
      // sheet: the calendar would slide around behind the thing you are
      // reading.
      if (picking || schedDay || draft || rescheduling || inspect || syncOpen || onboarding) return
      if (e.key === 'ArrowLeft') jump(-1)
      if (e.key === 'ArrowRight') jump(1)
      if (e.key === 't' || e.key === 'T') goToday()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // The handler reads sheet state, so it has to be rebound when that changes
    // — with an empty dep list it closed over the initial nulls forever.
  }, [picking, schedDay, draft, rescheduling, inspect, syncOpen, onboarding])

  const empty = db.series.length === 0 && !db.school.enabled

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <h1>MyCAL</h1>
          <span>your life, in time</span>
        </div>
        <div className="nav">
          <button className="btn icon" onClick={() => jump(-1)} title="Previous week (←)" aria-label="Previous week">‹</button>
          {/* Looking back at an old week is a first-class use of this thing, so
              the range doubles as a jump-to-date control. */}
          <label className="range jump" title="Jump to a date">
            {fmtMonthRange(days)}
            <input
              type="date"
              value={dateKey(days[0])}
              onChange={(e) => {
                if (!e.target.value) return
                setAnchor(startOfWeek(parseKey(e.target.value)))
                setFocusedDay(null)
              }}
            />
          </label>
          <button className="btn icon" onClick={() => jump(1)} title="Next week (→)" aria-label="Next week">›</button>
          {!thisWeek && (
            <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={goToday}>
              Today
            </button>
          )}
          <div className="zoom" title="Row height — taller rows fit more of a note">
            <button
              aria-label="Shorter rows"
              disabled={db.density <= DENSITY_STEPS[0]}
              onClick={() => {
                const i = DENSITY_STEPS.findIndex((d) => d >= db.density)
                setDensity(DENSITY_STEPS[Math.max(0, i - 1)])
              }}
            >
              −
            </button>
            <button
              aria-label="Taller rows"
              disabled={db.density >= DENSITY_STEPS[DENSITY_STEPS.length - 1]}
              onClick={() => {
                const i = DENSITY_STEPS.findIndex((d) => d > db.density)
                setDensity(DENSITY_STEPS[i === -1 ? DENSITY_STEPS.length - 1 : i])
              }}
            >
              ＋
            </button>
          </div>
          <SyncButton onOpen={() => setSyncOpen(true)} />
          <button className="btn ghost" style={{ marginLeft: 10 }} onClick={() => setOnboarding(true)}>
            {db.school.enabled ? (isMobile ? 'Classes' : 'My classes') : 'Set up school'}
          </button>
          <button
            className="btn solid"
            style={{ marginLeft: 6 }}
            onClick={() => {
              const d = focusedDay !== null ? days[focusedDay] : now
              const inWeek = days.some((x) => isSameDay(x, d))
              setDraft({ date: dateKey(inWeek ? d : days[0]), startMin: 16 * 60, endMin: 17 * 60 })
            }}
          >
            + Block
          </button>
        </div>
      </div>

      <div className="headline">
        <h2>{thisWeek ? 'This week' : fmtMonthRange(days)}</h2>
        <div className="sub">
          {empty
            ? 'Nothing here yet — set up your school week, then drag to add anything else.'
            : `${occurrences.length} blocks · ${fmtTime(now.getHours() * 60 + now.getMinutes())} right now`}
        </div>
        <div className="legend">
          {CATEGORIES.map((c) => (
            // @ts-expect-error custom property
            <i key={c} style={{ '--h': CATEGORY_META[c].hue }}>{CATEGORY_META[c].label}</i>
          ))}
        </div>
      </div>

      {picking && (
        <div className="picking">
          <b>Pick a time for “{picking.occ.title}”</b>
          <span>Drag anywhere on the grid — any day, any week.</span>
          <button className="btn sm ghost" onClick={() => { setRescheduling(picking.occ); setReschedInit(picking.draft); setPicking(null) }}>
            Back
          </button>
        </div>
      )}

      {loops.length > 0 && (
        <div className="loops">
          <b>{loops.length} need{loops.length === 1 ? 's' : ''} an outcome</b>
          <div className="items">
            {loops.slice(0, 6).map((o) => (
              <button key={o.key} className="chip" onClick={() => goToOccurrence(o)}>
                {o.title} ·{' '}
                {/* Today's open loops are told apart by time, older ones by date. */}
                {o.date === dateKey(now)
                  ? fmtTime(o.startMin)
                  : o.date.slice(5).replace('-', '/')}
              </button>
            ))}
            {loops.length > 6 && <span style={{ color: 'var(--text-3)' }}>+{loops.length - 6} more</span>}
          </div>
        </div>
      )}

      {isMobile && (
        <WeekStrip
          days={days}
          selected={mobileDay}
          onSelect={setMobileDay}
          now={now}
          occurrences={occurrences}
          schoolEnabled={db.school.enabled}
          school={db.school}
          dropTarget={dropTarget}
        />
      )}

      <WeekGrid
        pxPerMin={db.density}
        weekAll={days}
        onDropTarget={setDropTarget}
        isMobile={isMobile}
        onSwipeDay={(dir) => {
          const next = mobileDay + dir
          if (next < 0) { jump(-1); setMobileDay(6) }
          else if (next > 6) { jump(1); setMobileDay(0) }
          else setMobileDay(next)
        }}
        schoolEnabled={db.school.enabled}
        school={db.school}
        onEditDaySchedule={setSchedDay}
        empty={empty}
        onSetUpSchool={() => setOnboarding(true)}
        days={gridDays}
        occurrences={occurrences}
        focusedDay={focusedDay}
        onFocusDay={setFocusedDay}
        activeKey={activeKey}
        setActiveKey={setActiveKey}
        onOpenInspector={setInspect}
        onAskReschedule={setRescheduling}
        onCreate={(d) => {
          if (picking) {
            setReschedInit({
              date: d.date,
              startMin: d.startMin,
              durationMin: Math.max(d.endMin - d.startMin, 10),
              why: picking.draft.why,
            })
            setRescheduling(picking.occ)
            setPicking(null)
            return
          }
          setDraft(d)
        }}
        now={now}
      />

      <div className="footer">
        <span>Drag empty time to add — or double-click it</span>
        <span>Click a block to write on that day</span>
        <span>Double-click for everything else</span>
        <span>Click a date to expand it</span>
      </div>

      {inspect && (
        <Inspector
          occ={occurrences.find((o) => o.key === inspect.key) ?? inspect}
          onClose={() => setInspect(null)}
          onAskReschedule={() => { setRescheduling(inspect); setInspect(null) }}
        />
      )}
      {rescheduling && (
        <RescheduleSheet
          occ={rescheduling}
          initial={reschedInit}
          onClose={() => { setRescheduling(null); setReschedInit(null) }}
          onPickOnCalendar={(draft) => {
            setPicking({ occ: rescheduling, draft })
            setRescheduling(null)
            setReschedInit(null)
          }}
        />
      )}
      {draft && (
        <CreateSheet
          draft={draft}
          sameDay={occurrences.filter((o) => o.date === draft.date)}
          onClose={() => setDraft(null)}
        />
      )}
      {onboarding && <Onboarding onClose={() => setOnboarding(false)} />}
      {syncOpen && <SyncSheet onClose={() => setSyncOpen(false)} />}
      {schedDay && (
        <DayScheduleSheet
          date={schedDay}
          school={db.school}
          onClose={() => setSchedDay(null)}
        />
      )}
    </div>
  )
}
