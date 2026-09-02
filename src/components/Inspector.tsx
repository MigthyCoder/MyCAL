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
  setMarker,
  setOutcome,
  setSubtitle,
  unsetOverrideFields,
  updateSeries,
} from '../lib/store'
import { fmtRange, fmtTime, parseKey } from '../lib/time'
import { CategoryPicker, DayPicker, Seg, Sheet, TimeField } from './ui'
import { FLEX_OPTIONS } from '../lib/seed'

const MARKERS: { value: MarkerType | 'none'; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'test', label: 'Test' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'due', label: 'Due' },
  { value: 'presentation', label: 'Present' },
]

export function Inspector({
  occ,
  onClose,
  onAskReschedule,
}: {
  occ: Occurrence
  onClose: () => void
  onAskReschedule: () => void
}) {
  const s = occ.series
  const isFlex = s.schoolRole === 'flex'
  const day = parseKey(occ.date)

  const [subtitle, setSub] = useState(occ.subtitle ?? '')
  const [after, setAfter] = useState(occ.afterNote ?? '')
  const [planned, setPlanned] = useState(occ.planned ?? '')
  const [did, setDid] = useState(occ.did ?? '')
  const [mType, setMType] = useState<MarkerType | 'none'>(occ.marker?.type ?? 'none')
  const [mLabel, setMLabel] = useState(occ.marker?.label ?? '')
  const [title, setTitle] = useState(occ.title)
  const [titleScope, setTitleScope] = useState<'series' | 'day'>('series')
  const [location, setLocation] = useState(s.location ?? '')
  const [overlap, setOverlap] = useState(s.overlapReason ?? '')
  const [start, setStart] = useState(occ.startMin)
  const [end, setEnd] = useState(occ.endMin)

  /** Everything typed into this sheet, written back. The outcome buttons call
   *  this too — otherwise hitting "Finished" would silently discard your note. */
  const persist = () => {
    renameOccurrence(occ, title, titleScope)
    if (!occ.generated && (s.location ?? '') !== location.trim()) {
      updateSeries(s.id, { location: location.trim() || undefined })
    }
    if (!isFlex) setSubtitle(occ, subtitle)
    else {
      const reported = did.trim()
      patchOverride(s.id, occ.date, {
        planned: planned.trim() || undefined,
        did: reported || undefined,
        // Reporting on a Flex that's already passed resolves it outright.
        ...(reported && occ.state !== 'future' && occ.state !== 'now'
          ? { outcome: 'finished' as const }
          : {}),
      })
    }
    if (after.trim()) patchOverride(s.id, occ.date, { afterNote: after.trim() })
    else unsetOverrideFields(s.id, occ.date, ['afterNote'])

    if (mType === 'none') setMarker(occ, null)
    else setMarker(occ, { type: mType, label: mLabel.trim() })

    if (!occ.generated && (s.overlapReason ?? '') !== overlap.trim()) {
      updateSeries(s.id, { overlapReason: overlap.trim().toUpperCase() || undefined })
    }

    if (start !== occ.startMin || end !== occ.endMin) {
      if (s.recurrence) patchOverride(s.id, occ.date, { startMin: start, endMin: end })
      else updateSeries(s.id, { startMin: start, endMin: end })
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
          <h4>Planned</h4>
          <input className="field" value={planned} onChange={(e) => setPlanned(e.target.value)} placeholder="What you meant to use flex for" />
          <h4>Did</h4>
          <input className="field" value={did} onChange={(e) => setDid(e.target.value)} placeholder="What actually happened" />
          <div className="row wrap" style={{ marginTop: 8, gap: 6 }}>
            {FLEX_OPTIONS.filter((o) => o !== 'Other').map((o) => (
              <button key={o} className="btn ghost sm" onClick={() => setDid(o)}>
                {o}
              </button>
            ))}
          </div>
        </>
      ) : (
        <>
          <h4>Note for this day</h4>
          <input
            className="field"
            value={subtitle}
            onChange={(e) => setSub(e.target.value)}
            placeholder={s.defaultSubtitle ? `Default: ${s.defaultSubtitle}` : 'Shows under the title'}
            autoFocus
          />
        </>
      )}

      {s.schoolRole === 'class' && (
        <>
          <h4>Test / due marker</h4>
          <div className="row">
            <div className="grow">
              <Seg value={mType} options={MARKERS} onChange={setMType} />
            </div>
          </div>
          {mType !== 'none' && (
            <input
              className="field"
              style={{ marginTop: 8 }}
              value={mLabel}
              onChange={(e) => setMLabel(e.target.value)}
              placeholder="Integrals unit 3"
            />
          )}
        </>
      )}

      <h4>{occ.pin ? 'When' : 'Time'}</h4>
      <div className="row">
        <TimeField value={start} onChange={(v) => { setStart(v); if (occ.pin) setEnd(v) }} />
        {!occ.pin && (
          <>
            <span style={{ color: 'var(--text-3)' }}>to</span>
            <TimeField value={end} onChange={setEnd} />
          </>
        )}
      </div>

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

      {occ.requiresOutcome && !isFlex && (
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

      {!occ.requiresOutcome && !isFlex && (
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
