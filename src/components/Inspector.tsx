import { useState } from 'react'
import type { Occurrence } from '../lib/occurrences'
import type { Category, MarkerType } from '../lib/types'
import {
  archiveSeries,
  duplicateOccurrence,
  renameOccurrence,
  clearOutcome,
  deleteSeries,
  patchOverride,
  setDue,
  setOutcome,
  setPinTime,
  unsetOverrideFields,
  updateSeries,
} from '../lib/store'
import { fmtDur, fmtRange, fmtTime, parseKey } from '../lib/time'
import { CategoryPicker, DayPicker, Seg, Sheet, TimeField } from './ui'
import { FLEX_OPTIONS } from '../lib/seed'
import { newNote, newPlanItem, setDayNotes } from '../lib/store'
import type { DayNote } from '../lib/types'

export function Inspector({
  occ,
  onClose,
  onAskReschedule,
  onAddAlongside,
  onMoveItem,
  onPickDue,
}: {
  occ: Occurrence
  onClose: () => void
  onAskReschedule: () => void
  onAddAlongside: () => void
  /** Move one planned line back out of this block. */
  onMoveItem: (item: DayNote) => void
  /** Choose this task's due date by tapping the calendar. */
  onPickDue: () => void
}) {
  const s = occ.series
  const isFlex = s.schoolRole === 'flex'
  const day = parseKey(occ.date)

  const [notes, setNotes] = useState<DayNote[]>(() =>
    occ.notes.length ? occ.notes.map((n) => ({ ...n })) : [newNote()],
  )
  const [after, setAfter] = useState(occ.afterNote ?? '')

  const [did, setDid] = useState(occ.did ?? '')
  const [title, setTitle] = useState(occ.title)
  const [titleScope, setTitleScope] = useState<'series' | 'day'>('series')
  const [location, setLocation] = useState(s.location ?? '')
  const [overlap, setOverlap] = useState(s.overlapReason ?? '')
  const [start, setStart] = useState(occ.startMin)
  const [end, setEnd] = useState(occ.endMin)
  const [pinAllDay, setPinAllDay] = useState(occ.allDay)
  const [dueOn, setDueOn] = useState(s.due?.date ?? '')
  const [dueAt, setDueAt] = useState<number | null>(s.due?.startMin ?? null)
  /** A line can only be moved once it's actually been saved into the block. */
  const saved = (n: DayNote) => occ.notes.some((x) => x.id === n.id)

  /** Everything typed into this sheet, written back. The outcome buttons call
   *  this too — otherwise hitting "Finished" would silently discard your note. */
  const persist = () => {
    renameOccurrence(occ, title, titleScope)
    if (!occ.generated && (s.location ?? '') !== location.trim()) {
      updateSeries(s.id, { location: location.trim() || undefined })
    }
    if (!isFlex) setDayNotes(occ, notes)
    else {
      const reported = did.trim()
      setDayNotes(occ, notes)
      patchOverride(s.id, occ.date, {
        did: reported || undefined,
        // Reporting on a Flex that's already passed resolves it outright.
        ...(reported && occ.state !== 'future' && occ.state !== 'now'
          ? { outcome: 'finished' as const }
          : {}),
      })
    }
    if (after.trim()) patchOverride(s.id, occ.date, { afterNote: after.trim() })
    else unsetOverrideFields(s.id, occ.date, ['afterNote'])

    if (!occ.generated && (s.overlapReason ?? '') !== overlap.trim()) {
      updateSeries(s.id, { overlapReason: overlap.trim().toUpperCase() || undefined })
    }

    if (occ.pin) {
      if (pinAllDay !== occ.allDay || (!pinAllDay && start !== occ.startMin)) {
        setPinTime(occ, pinAllDay ? null : start)
      }
    } else if (start !== occ.startMin || end !== occ.endMin) {
      if (s.recurrence) patchOverride(s.id, occ.date, { startMin: start, endMin: end })
      else updateSeries(s.id, { startMin: start, endMin: end })
    }

    if (!occ.generated && s.kind === 'task') {
      const at = dueOn ? dueAt : null
      const same = (s.due?.date ?? '') === dueOn && (s.due?.startMin ?? null) === at
      if (!same) setDue(s.id, dueOn ? { date: dueOn, ...(at !== null ? { startMin: at } : {}) } : null)
    }
  }

  const saveAndClose = () => {
    persist()
    onClose()
  }

  const resolve = (outcome: 'finished' | 'dropped') => {
    persist()
    setOutcome(occ, outcome)
    onClose()
  }

  return (
    <Sheet onClose={saveAndClose}>
      <input
        className="field titlefield"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Name"
        onKeyDown={(e) => { if (e.key === 'Enter') saveAndClose() }}
      />
      {/* Renaming a repeating thing almost always means renaming all of it, but
          not always — so say which, rather than guessing. */}
      {(s.recurrence || occ.generated) && title.trim() !== occ.title && (
        <div style={{ marginTop: 8 }}>
          <Seg
            value={titleScope}
            options={[
              { value: 'series' as const, label: 'Rename every time' },
              { value: 'day' as const, label: 'Just this day' },
            ]}
            onChange={setTitleScope}
          />
        </div>
      )}
      <div className="meta" style={{ marginTop: 10 }}>
        {day.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} ·{' '}
        {fmtRange(occ.startMin, occ.endMin)}
        {s.recurrence ? ' · repeats weekly' : ''}
      </div>

      {occ.state === 'rescheduled' && occ.movedTo && (
        <div className="note" style={{ marginBottom: 16 }}>
          <span className="k">Moved</span>
          → {parseKey(occ.movedTo.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} at{' '}
          {fmtTime(occ.movedTo.startMin)}
          {occ.outcomeNote ? ` — ${occ.outcomeNote}` : ''}
        </div>
      )}

      {isFlex ? (
        <>
          <h4>Planned — in the order you'll do them</h4>
          <div className="notelist">
            {notes.map((n, i) => (
              <div className={`noterow plan ${n.done ?? ''}`} key={n.id}>
                {/* The number IS the checkbox. Ticking it off is the commonest
                    thing you do to a plan, so it gets the biggest target. */}
                <button
                  className="rank"
                  title={n.done ? 'Not done after all' : 'Mark done'}
                  onClick={() =>
                    setNotes((ns) =>
                      ns.map((x, j) =>
                        j === i && x.done !== 'rescheduled'
                          ? { ...x, task: true, done: x.done ? undefined : 'finished' }
                          : x,
                      ),
                    )
                  }
                >
                  {n.done === 'rescheduled' ? '→' : n.done ? '✓' : i + 1}
                </button>
                <input
                  className="field"
                  value={n.text}
                  autoFocus={i === 0}
                  onChange={(e) =>
                    setNotes((ns) => ns.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
                  }
                  placeholder="Calc homework"
                  onKeyDown={(e) => { if (e.key === 'Enter') setNotes((ns) => [...ns, newPlanItem('')]) }}
                />
                <button
                  className="rowx"
                  title="Higher priority"
                  disabled={i === 0}
                  onClick={() =>
                    setNotes((ns) => {
                      const c = [...ns]
                      ;[c[i - 1], c[i]] = [c[i], c[i - 1]]
                      return c
                    })
                  }
                >
                  ↑
                </button>
                <button
                  className="rowx"
                  title="Lower priority"
                  disabled={i === notes.length - 1}
                  onClick={() =>
                    setNotes((ns) => {
                      const c = [...ns]
                      ;[c[i + 1], c[i]] = [c[i], c[i + 1]]
                      return c
                    })
                  }
                >
                  ↓
                </button>
                <button
                  className="rowx move"
                  title={saved(n) ? 'Move this somewhere else' : 'Save it first'}
                  disabled={!saved(n) || n.done === 'rescheduled'}
                  onClick={() => { persist(); onMoveItem(n) }}
                >
                  ↗
                </button>
                <button
                  className="rowx"
                  title="Remove"
                  onClick={() => setNotes((ns) => (ns.length === 1 ? [newPlanItem('')] : ns.filter((_, j) => j !== i)))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setNotes((ns) => [...ns, newPlanItem('')])}>
            + Another
          </button>
          <h4>Did</h4>
          <input className="field" value={did} onChange={(e) => setDid(e.target.value)} placeholder="What actually happened" />
          <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
            {notes.some((n) => n.text.trim()) && (
              <button
                className="btn ghost sm plandone"
                onClick={() => setDid(notes.map((n) => n.text.trim()).filter(Boolean).join(', '))}
              >
                ✓ Did the plan
              </button>
            )}
            {FLEX_OPTIONS.filter((o) => o !== 'Other').map((o) => (
              <button key={o} className="btn ghost sm" onClick={() => setDid(o)}>
                {o}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <h4>On this day</h4>
          <div className="notelist">
            {notes.map((n, i) => (
              <div className={`noterow ${n.task ? 'istask' : ''} ${n.done ?? ''}`} key={n.id}>
                {/* A to-do inside a block is a note that owes you an answer. It's
                    the same row, one dropdown along. */}
                {n.task && (
                  <button
                    className="rank"
                    title={n.done ? 'Not done after all' : 'Mark done'}
                    onClick={() =>
                      setNotes((ns) =>
                        ns.map((x, j) =>
                          j === i && x.done !== 'rescheduled'
                            ? { ...x, done: x.done ? undefined : 'finished' }
                            : x,
                        ),
                      )
                    }
                  >
                    {n.done === 'rescheduled' ? '→' : n.done ? '✓' : ''}
                  </button>
                )}
                <select
                  className="field notekind"
                  value={n.marker ?? 'task'}
                  onChange={(e) => {
                    const v = e.target.value
                    setNotes((ns) =>
                      ns.map((x, j) =>
                        j === i
                          ? v === 'task'
                            ? { ...x, task: true, marker: undefined }
                            : {
                                ...x,
                                task: undefined,
                                done: undefined,
                                marker: (v || undefined) as MarkerType | undefined,
                              }
                          : x,
                      ),
                    )
                  }}
                >
                  <option value="task">To-do</option>
                  <option value="test">Test</option>
                  <option value="quiz">Quiz</option>
                  <option value="due">Due</option>
                  <option value="presentation">Present</option>
                </select>
                <input
                  className="field"
                  value={n.text}
                  autoFocus={i === 0}
                  onChange={(e) =>
                    setNotes((ns) => ns.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
                  }
                  placeholder={
                    n.marker ? 'Integrals unit 3' : 'Ask Mr. Lohmann about the grade'
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') setNotes((ns) => [...ns, newNote()])
                  }}
                />
                {n.task && (
                  <button
                    className="rowx move"
                    title={saved(n) ? 'Move this somewhere else' : 'Save it first'}
                    disabled={!saved(n) || n.done === 'rescheduled'}
                    onClick={() => { persist(); onMoveItem(n) }}
                  >
                    ↗
                  </button>
                )}
                <button
                  className="rowx"
                  title="Remove"
                  onClick={() => setNotes((ns) => (ns.length === 1 ? [newNote()] : ns.filter((_, j) => j !== i)))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => setNotes((ns) => [...ns, newNote()])}>
            + Another
          </button>
        </>
      )}


      {occ.pin ? (
        <>
          <h4>When</h4>
          {/* A to-do with no time sits at the top of its day. Giving it one puts
              it on the grid; taking it away sends it back up. */}
          <Seg
            value={pinAllDay ? 'none' : 'at'}
            options={[
              { value: 'none' as const, label: 'No set time' },
              { value: 'at' as const, label: 'At a time' },
            ]}
            onChange={(v) => setPinAllDay(v === 'none')}
          />
          {!pinAllDay && (
            <div className="row" style={{ marginTop: 8 }}>
              <TimeField value={start} onChange={(v) => { setStart(v); setEnd(v) }} />
            </div>
          )}
        </>
      ) : (
        <>
          <h4>
            Time <span className="h4dur">{fmtDur(end - start)}</span>
          </h4>
          <div className="row">
            <TimeField value={start} onChange={setStart} />
            <span style={{ color: 'var(--text-3)' }}>to</span>
            <TimeField value={end} onChange={setEnd} />
          </div>
        </>
      )}

      {!occ.generated && s.kind === 'task' && (
        <>
          <h4>Due</h4>
          <div className="row">
            <input
              className="field grow"
              type="date"
              value={dueOn}
              onChange={(e) => setDueOn(e.target.value)}
            />
            {dueOn &&
              (dueAt === null ? (
                <button className="btn ghost" onClick={() => setDueAt(12 * 60)}>+ Time</button>
              ) : (
                <>
                  <TimeField value={dueAt} onChange={setDueAt} />
                  <button className="btn ghost sm" onClick={() => setDueAt(null)}>Any time</button>
                </>
              ))}
            {dueOn && (
              <button className="rowx" title="No due date" onClick={() => { setDueOn(''); setDueAt(null) }}>
                ×
              </button>
            )}
          </div>
          <button className="btn ghost sm" style={{ marginTop: 8 }} onClick={() => { persist(); onPickDue() }}>
            Pick it on the calendar
          </button>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
            Tap a class or a meeting and it's due during that — it shows up inside
            that block. With no time, it sits at the top of the day.
          </div>
        </>
      )}

      {!occ.generated && !occ.pin && (
        <>
          <h4>Where</h4>
          <input
            className="field"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Room C12, Ruthvik's house, the car…"
          />
        </>
      )}

      {s.kind === 'task' && occ.requiresOutcome && !isFlex && (
        <>
          <h4>Outcome</h4>
          {occ.outcome ? (
            <div className="row">
              <div className="note grow">
                <span className="k">{occ.outcome}</span>
                {occ.outcomeNote || 'No reason recorded'}
              </div>
              <button className="btn ghost" onClick={() => clearOutcome(occ)}>Undo</button>
            </div>
          ) : (
            <div className="outcomerow">
              <button className="fin" onClick={() => resolve('finished')}>Finished</button>
              <button className="res" onClick={() => { persist(); onAskReschedule() }}>Reschedule</button>
              <button className="drop" onClick={() => resolve('dropped')}>Drop</button>
            </div>
          )}
        </>
      )}

      {s.kind !== 'task' && !isFlex && (
        <>
          <h4>What happened</h4>
          <textarea
            className="field"
            value={after}
            onChange={(e) => setAfter(e.target.value)}
            placeholder="Add this after the fact — it stays in history."
          />
        </>
      )}

      {!occ.generated && !occ.pin && (
        <>
          <h4>Riding alongside</h4>
          <input
            className="field"
            value={overlap}
            onChange={(e) => setOverlap(e.target.value)}
            placeholder="Work in car"
          />
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
            Set this when the block deliberately overlaps something else. It becomes
            the header, so the overlap reads as a decision instead of a mistake.
          </div>
        </>
      )}

      {!occ.generated && <><h4>{occ.pin ? 'To-do' : 'Series'}</h4>
      <div className="row wrap" style={{ gap: 12 }}>
        <CategoryPicker value={s.category} onChange={(c: Category) => updateSeries(s.id, { category: c })} />
        <div className="grow">
          <Seg
            value={s.kind}
            options={[
              { value: 'event' as const, label: 'Event' },
              { value: 'task' as const, label: 'Task' },
            ]}
            onChange={(k) => updateSeries(s.id, { kind: k })}
          />
        </div>
      </div>
      {s.recurrence && (
        <div style={{ marginTop: 10 }}>
          <DayPicker
            value={s.recurrence.byDay}
            onChange={(byDay) => updateSeries(s.id, { recurrence: { ...s.recurrence!, byDay } })}
          />
        </div>
      )}</>}

      {occ.generated && (
        <div className="note" style={{ marginTop: 20 }}>
          <span className="k">From your bell schedule</span>
          Times come from the official MHHS schedule for this date, so they're right
          on block days too. Notes and markers you add here stay on this day only.
        </div>
      )}

      <div className="actions">
        {!occ.generated && (
          <button className="btn ghost" onClick={() => { persist(); duplicateOccurrence(occ); onClose() }}>
            Duplicate
          </button>
        )}
        {!occ.generated && !occ.pin && (
          <button className="btn ghost" onClick={() => { persist(); onAddAlongside() }}>
            Add alongside
          </button>
        )}
        {/* Skipping only means something for a thing that comes back. For a
            one-off it's just a more confusing Delete. */}
        {(s.recurrence || occ.generated) && (
          <button
            className="btn danger"
            onClick={() => { patchOverride(s.id, occ.date, { cancelled: true }); onClose() }}
          >
            {occ.generated ? 'Not today' : 'Skip this day'}
          </button>
        )}
        {!occ.generated && (
          <button
            className="btn danger"
            onClick={() => {
              if (s.recurrence) archiveSeries(s.id)
              else deleteSeries(s.id)
              onClose()
            }}
          >
            {s.recurrence ? 'End series' : 'Delete'}
          </button>
        )}
        <div className="spacer" />
        <button className="btn solid" onClick={saveAndClose}>Done</button>
      </div>
    </Sheet>
  )
}
