import { useCallback, useEffect, useMemo, useState } from 'react'
import { WeekGrid } from './components/WeekGrid'
import { Inspector } from './components/Inspector'
import { OutcomeSheet } from './components/OutcomeSheet'
import { CreateSheet, type Draft } from './components/CreateSheet'
import { RescheduleSheet, type ReschedDraft } from './components/RescheduleSheet'
import { Onboarding } from './components/Onboarding'
import { DayScheduleSheet } from './components/DayScheduleSheet'
import { WeekStrip } from './components/WeekStrip'
import { SyncButton, SyncSheet } from './components/SyncSheet'
import { MOBILE, useMedia } from './lib/useMedia'
import {
  buildOccurrences,
  dueMarks,
  openLoops,
  placeDues,
  type DueMark,
  type Occurrence,
} from './lib/occurrences'
import type { DayNote } from './lib/types'
import {
  DENSITY_STEPS,
  clearOutcome,
  deleteSeries,
  reschedule,
  rescheduleIntoPeriod,
  rescheduleItem,
  rescheduleItemIntoPeriod,
  setDayNotes,
  setDensity,
  setDue,
  useDB,
} from './lib/store'
import { CATEGORIES, CATEGORY_META } from './lib/seed'
import { addDays, dateKey, fmtMonthRange, fmtTime, isSameDay, parseKey, startOfWeek, weekDays } from './lib/time'

/** What a tap on the calendar is choosing right now. */
type Pick =
  | { mode: 'move'; occ: Occurrence; item?: DayNote; draft: ReschedDraft }
  | { mode: 'due'; occ: Occurrence }

const mondayIndex = (d: Date) => (d.getDay() === 0 ? 6 : d.getDay() - 1)
const shortDay = (date: string) => parseKey(date).toLocaleDateString(undefined, { weekday: 'short' })

export default function App() {
  const db = useDB()
  const [anchor, setAnchor] = useState(() => startOfWeek(new Date()))
  const [now, setNow] = useState(() => new Date())
  const [focusedDay, setFocusedDay] = useState<number | null>(null)
  const [inspect, setInspect] = useState<Occurrence | null>(null)
  // Something that owes you an answer opens the answer, not the whole editor.
  const [answering, setAnswering] = useState<Occurrence | null>(null)
  const [rescheduling, setRescheduling] = useState<{ occ: Occurrence; item?: DayNote; why?: string } | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [onboarding, setOnboarding] = useState(false)
  const [schedDay, setSchedDay] = useState<string | null>(null)
  const [syncOpen, setSyncOpen] = useState(false)
  const [dropDate, setDropDate] = useState<string | null>(null)
  const [picking, setPicking] = useState<Pick | null>(null)
  const [reschedInit, setReschedInit] = useState<ReschedDraft | null>(null)
  // Choosing a spot commits the moment you choose it — one tap, no confirmation
  // sheet. This is what makes that safe.
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null)
  const isMobile = useMedia(MOBILE)
  const [mobileDay, setMobileDay] = useState(() => mondayIndex(new Date()))

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

  const occurrences = useMemo(() => buildOccurrences(db, dateKeys, now), [db, dateKeys, now])
  const dues = useMemo(
    () => placeDues(occurrences, dueMarks(db, dateKeys)),
    [db, occurrences, dateKeys],
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

  const openDates = useMemo(
    () =>
      new Set([
        ...loops.map((o) => o.date),
        ...occurrences.filter((o) => o.state === 'needs-outcome').map((o) => o.date),
      ]),
    [loops, occurrences],
  )

  /** Always act on the block as it is now, not as it was when a sheet opened. */
  const fresh = (o: Occurrence) => occurrences.find((x) => x.key === o.key) ?? o

  const thisWeek = isSameDay(startOfWeek(now), anchor)
  const jump = useCallback((n: number) => {
    setAnchor((a) => addDays(a, n * 7))
    setFocusedDay(null)
  }, [])
  const goToday = () => {
    setAnchor(startOfWeek(new Date()))
    setFocusedDay(null)
    setMobileDay(mondayIndex(new Date()))
  }

  /** The door into a block depends on what the block is waiting for. */
  const openBlock = (o: Occurrence) => {
    if (o.state === 'needs-outcome') setAnswering(o)
    else setInspect(o)
  }

  const goToOccurrence = (o: Occurrence) => {
    const d = parseKey(o.date)
    setAnchor(startOfWeek(d))
    setMobileDay(mondayIndex(d))
    openBlock(o)
  }

  /**
   * A deadline opens the task it belongs to — without dragging you off to the
   * week that task happens to be scheduled in. You tapped it from here, and the
   * next thing you're likely to do is pick a new due date on this week.
   */
  const openDue = (m: DueMark) => {
    const occ =
      occurrences.find((o) => o.series.id === m.series.id) ??
      buildOccurrences(db, [m.series.anchorDate], now).find((o) => o.series.id === m.series.id)
    if (occ) openBlock(occ)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName?.match(/INPUT|TEXTAREA/)) return
      if (e.key === 'Escape') { setFocusedDay(null); setPicking(null) }
      if (e.key === 'ArrowLeft') jump(-1)
      if (e.key === 'ArrowRight') jump(1)
      if (e.key === 't' || e.key === 'T') goToday()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [jump])

  const empty = db.series.length === 0 && !db.school.enabled

  const closeMoveFlow = () => {
    setPicking(null)
    setRescheduling(null)
    setReschedInit(null)
  }

  /** Choosing the spot IS the confirmation. Nothing pops up afterwards asking
   *  you whether you meant it — the undo bar is there if you didn't. */
  const landAt = (
    occ: Occurrence,
    date: string,
    startMin: number,
    durationMin: number,
    why: string,
    item?: DayNote,
  ) => {
    const when = `${shortDay(date)} ${fmtTime(startMin)}`
    if (item) {
      const before = occ.notes
      const copy = rescheduleItem(occ, item.id, date, startMin, why, durationMin)
      closeMoveFlow()
      setToast({
        text: `Moved to ${when}`,
        undo: () => { if (copy) deleteSeries(copy.id); setDayNotes(occ, before) },
      })
      return
    }
    const copy = reschedule(occ, date, startMin, why, durationMin)
    closeMoveFlow()
    setToast({ text: `Moved to ${when}`, undo: () => { deleteSeries(copy.id); clearOutcome(occ) } })
  }

  const dropInto = (occ: Occurrence, target: Occurrence, why: string, item?: DayNote) => {
    const targetBefore = target.notes
    const text = `Into ${target.title} · ${shortDay(target.date)}`
    if (item) {
      const before = occ.notes
      rescheduleItemIntoPeriod(occ, item.id, target, why)
      closeMoveFlow()
      setToast({ text, undo: () => { setDayNotes(target, targetBefore); setDayNotes(occ, before) } })
      return
    }
    rescheduleIntoPeriod(occ, target, why)
    closeMoveFlow()
    setToast({ text, undo: () => { setDayNotes(target, targetBefore); clearOutcome(occ) } })
  }

  /** A due date chosen by tapping the calendar. */
  const setDueFromPick = (occ: Occurrence, due: { date: string; startMin?: number }, text: string) => {
    const before = occ.series.due ?? null
    setDue(occ.series.id, due)
    setPicking(null)
    setToast({ text, undo: () => setDue(occ.series.id, before) })
  }

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 6000)
    return () => clearTimeout(t)
  }, [toast])

  const pickTitle = picking
    ? picking.mode === 'move'
      ? picking.item?.text ?? picking.occ.title
      : picking.occ.title
    : ''

  return (
    <div className="app">
      <div className="topbar">
        <div className="brand">
          <h1>MyCAL</h1>
          <span>your life, in time</span>
        </div>
        <div className="nav">
          <button className="btn icon" onClick={() => jump(-1)} title="Previous week (←)">‹</button>
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
          <button className="btn icon" onClick={() => jump(1)} title="Next week (→)">›</button>
          {!thisWeek && (
            <button className="btn ghost sm" style={{ marginLeft: 8 }} onClick={goToday}>
              Today
            </button>
          )}
          <div className="zoom" title="Row height — taller rows fit more of a note">
            <button
              disabled={db.density <= DENSITY_STEPS[0]}
              onClick={() => {
                const i = DENSITY_STEPS.findIndex((d) => d >= db.density)
                setDensity(DENSITY_STEPS[Math.max(0, i - 1)])
              }}
            >
              −
            </button>
            <button
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
              // The day you're looking at, at the next half hour — on a phone
              // that's almost always the one you meant.
              const d = isMobile ? days[mobileDay] : focusedDay !== null ? days[focusedDay] : now
              const inWeek = days.some((x) => isSameDay(x, d))
              const soon = isSameDay(d, now)
                ? Math.min(Math.ceil((now.getHours() * 60 + now.getMinutes() + 10) / 30) * 30, 22 * 60)
                : 16 * 60
              setDraft({ date: dateKey(inWeek ? d : days[0]), startMin: soon, endMin: soon + 60 })
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
          {picking.mode === 'move' ? (
            <>
              <b>Where does “{pickTitle}” go?</b>
              <span>Tap any open time — or tap a class, Flex or SUCCESS to do it during that period.</span>
              <button
                className="btn sm ghost"
                onClick={() => {
                  setRescheduling({ occ: picking.occ, item: picking.item, why: picking.draft.why })
                  setReschedInit(picking.draft)
                  setPicking(null)
                }}
              >
                Back
              </button>
            </>
          ) : (
            <>
              <b>When is “{pickTitle}” due?</b>
              <span>
                Tap a class or meeting to make it due during it, a time for an exact
                deadline, or the top of a day for no particular time.
              </span>
              <button className="btn sm ghost" onClick={() => { setInspect(picking.occ); setPicking(null) }}>
                Back
              </button>
            </>
          )}
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
                {o.date === dateKey(now) ? fmtTime(o.startMin) : o.date.slice(5).replace('-', '/')}
              </button>
            ))}
            {loops.length > 6 && <span style={{ color: 'var(--text-3)' }}>+{loops.length - 6} more</span>}
          </div>
        </div>
      )}

      {isMobile && (
        <WeekStrip
          anchor={anchor}
          selected={dateKey(days[Math.min(mobileDay, 6)])}
          onSelect={(key) => {
            const d = parseKey(key)
            setAnchor(startOfWeek(d))
            setMobileDay(mondayIndex(d))
          }}
          onWeek={jump}
          now={now}
          openDates={openDates}
          schoolEnabled={db.school.enabled}
          dayOverrides={db.school.dayOverrides}
          dropDate={dropDate}
        />
      )}

      <WeekGrid
        pxPerMin={db.density}
        onDropTarget={setDropDate}
        isMobile={isMobile}
        onSwipeDay={(dir) => {
          const next = mobileDay + dir
          if (next < 0) { jump(-1); setMobileDay(6) }
          else if (next > 6) { jump(1); setMobileDay(0) }
          else setMobileDay(next)
        }}
        schoolEnabled={db.school.enabled}
        dayOverrides={db.school.dayOverrides}
        onEditDaySchedule={setSchedDay}
        empty={empty}
        onSetUpSchool={() => setOnboarding(true)}
        days={gridDays}
        occurrences={occurrences}
        focusedDay={focusedDay}
        onFocusDay={setFocusedDay}
        onOpenInspector={openBlock}
        pickMode={picking?.mode ?? null}
        pickLen={picking?.mode === 'move' ? picking.draft.durationMin : 45}
        dues={dues}
        onOpenDue={openDue}
        onPickBlock={(target) => {
          if (!picking) return
          if (picking.mode === 'move') {
            dropInto(fresh(picking.occ), target, picking.draft.why, picking.item)
          } else {
            setDueFromPick(
              picking.occ,
              { date: target.date, startMin: target.startMin },
              `Due during ${target.title} · ${shortDay(target.date)}`,
            )
          }
        }}
        onPickAllDay={(date) => {
          if (picking?.mode === 'due') setDueFromPick(picking.occ, { date }, `Due ${shortDay(date)}`)
        }}
        onCreate={(d) => {
          if (picking?.mode === 'move') {
            landAt(
              fresh(picking.occ),
              d.date,
              d.startMin,
              Math.max(d.endMin - d.startMin, 10),
              picking.draft.why,
              picking.item,
            )
            return
          }
          if (picking?.mode === 'due') {
            setDueFromPick(
              picking.occ,
              { date: d.date, startMin: d.startMin },
              `Due ${shortDay(d.date)} ${fmtTime(d.startMin)}`,
            )
            return
          }
          setDraft(d)
        }}
        now={now}
      />

      <div className="footer">
        <span>Drag empty time to add — the length shows as you go</span>
        <span>Click a block to open it</span>
        <span>Drag a to-do down from the top of its day to give it a time</span>
        <span>Click a date to expand it</span>
      </div>

      {toast && (
        <div className="toast">
          <span>{toast.text}</span>
          <button className="btn sm ghost" onClick={() => { toast.undo(); setToast(null) }}>Undo</button>
        </div>
      )}

      {answering && (() => {
        const occ = fresh(answering)
        return (
          <OutcomeSheet
            key={occ.key}
            occ={occ}
            onClose={() => setAnswering(null)}
            onMove={(why) => { setRescheduling({ occ, why }); setAnswering(null) }}
            onMoveItem={(item) => { setRescheduling({ occ, item }); setAnswering(null) }}
            onOpenFull={() => { setInspect(occ); setAnswering(null) }}
          />
        )
      })()}
      {inspect && (() => {
        const occ = fresh(inspect)
        return (
          <Inspector
            key={occ.key}
            occ={occ}
            onClose={() => setInspect(null)}
            onAskReschedule={() => { setRescheduling({ occ }); setInspect(null) }}
            onAddAlongside={() => {
              setDraft({ date: occ.date, startMin: occ.startMin, endMin: occ.endMin })
              setInspect(null)
            }}
            onMoveItem={(item) => { setRescheduling({ occ, item }); setInspect(null) }}
            onPickDue={() => { setPicking({ mode: 'due', occ }); setInspect(null) }}
          />
        )
      })()}
      {rescheduling && (
        <RescheduleSheet
          occ={fresh(rescheduling.occ)}
          item={rescheduling.item}
          whyInit={rescheduling.why}
          initial={reschedInit}
          onClose={() => { setRescheduling(null); setReschedInit(null) }}
          onLandAt={(date, startMin, durationMin, why) =>
            landAt(fresh(rescheduling.occ), date, startMin, durationMin, why, rescheduling.item)
          }
          onDropInto={(target, why) => dropInto(fresh(rescheduling.occ), target, why, rescheduling.item)}
          onPickOnCalendar={(d) => {
            setPicking({ mode: 'move', occ: rescheduling.occ, item: rescheduling.item, draft: d })
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
          overrides={db.school.dayOverrides}
          onClose={() => setSchedDay(null)}
        />
      )}
    </div>
  )
}
