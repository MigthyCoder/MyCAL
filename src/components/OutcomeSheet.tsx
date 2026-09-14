import { useState } from 'react'
import type { Occurrence } from '../lib/occurrences'
import type { DayNote } from '../lib/types'
import { FLEX_OPTIONS } from '../lib/seed'
import { patchOverride, setNoteDone, setOutcome } from '../lib/store'
import { fmtDur, fmtRange, parseKey } from '../lib/time'
import { Sheet } from './ui'

/**
 * The one question a block that's already happened is asking — and nothing else.
 *
 * Tapping something that owes you an answer isn't the moment to rename it,
 * recolour it or change what days it repeats on. It's "did it happen?", so that
 * is all this shows. The full sheet is one link away for the rare time it's more.
 *
 * What the answer looks like depends on what's owed: a task answers for itself;
 * a class answers for each piece of work you parked in it, one line at a time,
 * because the class itself happened whether you like it or not; a Flex says what
 * you actually used it for.
 */
export function OutcomeSheet({
  occ,
  onClose,
  onMove,
  onMoveItem,
  onOpenFull,
}: {
  occ: Occurrence
  onClose: () => void
  /** Reschedule the block itself, carrying the reason already typed here. */
  onMove: (why: string) => void
  /** Reschedule one line back out of a period. */
  onMoveItem: (item: DayNote) => void
  onOpenFull: () => void
}) {
  const isFlex = occ.series.schoolRole === 'flex'
  const isTask = occ.series.kind === 'task'
  const [note, setNote] = useState('')
  const [did, setDid] = useState(occ.did ?? '')
  const items = occ.notes.filter((n) => n.task)
  const open = items.filter((n) => !n.done)
  const day = parseKey(occ.date).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })
  // Answered while the sheet was open: say so, rather than vanishing under you.
  const settled = occ.state !== 'needs-outcome'

  const answer = (outcome: 'finished' | 'dropped') => {
    setOutcome(occ, outcome, note)
    onClose()
  }
  const logFlex = (text: string) => {
    const t = text.trim()
    if (!t) return
    patchOverride(occ.series.id, occ.date, { did: t, outcome: 'finished' })
    onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <div className={`oc-kicker ${settled ? 'ok' : ''}`}>
        {settled ? 'All answered' : 'Needs an outcome'}
      </div>
      <h3>{occ.title}</h3>
      <div className="meta">
        {day} · {fmtRange(occ.startMin, occ.endMin)}
        {occ.pin ? '' : ` · ${fmtDur(occ.endMin - occ.startMin)}`}
      </div>

      {items.length > 0 && (
        <>
          <h4>{isFlex ? 'The plan' : `What you were doing in ${occ.title}`}</h4>
          <div className="oc-items">
            {items.map((n, i) => (
              <div key={n.id} className={`oc-item ${n.done ?? ''}`}>
                <span className="oc-text">
                  {isFlex && <b>{i + 1}</b>}
                  {n.text}
                  {n.done === 'rescheduled' && n.movedTo && (
                    <em>
                      {' '}
                      → {parseKey(n.movedTo.date).toLocaleDateString(undefined, { weekday: 'short' })}
                    </em>
                  )}
                </span>
                {n.done === 'rescheduled' ? (
                  <span className="oc-state">Moved</span>
                ) : n.done ? (
                  <button className="oc-undo" onClick={() => setNoteDone(occ, n.id, undefined)}>
                    {n.done === 'finished' ? 'Done' : 'Dropped'} · undo
                  </button>
                ) : (
                  <div className="oc-mini">
                    <button className="fin" onClick={() => setNoteDone(occ, n.id, 'finished')}>Done</button>
                    <button className="res" onClick={() => onMoveItem(n)}>Move</button>
                    <button className="drop" onClick={() => setNoteDone(occ, n.id, 'dropped')}>Drop</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {isFlex && (
        <>
          <h4>What did you actually use it for?</h4>
          <div className="oc-choices">
            {items.length > 0 && (
              <button className="plandone" onClick={() => logFlex(items.map((n) => n.text).join(', '))}>
                ✓ The plan
              </button>
            )}
            {FLEX_OPTIONS.filter((o) => o !== 'Other').map((o) => (
              <button key={o} onClick={() => logFlex(o)}>
                {o}
              </button>
            ))}
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <input
              className="field grow"
              value={did}
              onChange={(e) => setDid(e.target.value)}
              placeholder="Something else…"
              onKeyDown={(e) => { if (e.key === 'Enter') logFlex(did) }}
            />
            <button className="btn solid" disabled={!did.trim()} onClick={() => logFlex(did)}>
              Save
            </button>
          </div>
        </>
      )}

      {isTask && !isFlex && !settled && (
        <>
          <div className="oc-big">
            <button className="fin" onClick={() => answer('finished')}>
              <b>Done</b>
              <span>It happened</span>
            </button>
            <button className="res" onClick={() => onMove(note)}>
              <b>Move</b>
              <span>Somewhere else</span>
            </button>
            <button className="drop" onClick={() => answer('dropped')}>
              <b>Drop</b>
              <span>Not doing it</span>
            </button>
          </div>
          <input
            className="field"
            style={{ marginTop: 12 }}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Why, or anything worth remembering (optional)"
          />
        </>
      )}

      {!isTask && !isFlex && open.length === 0 && items.length > 0 && (
        <div className="note" style={{ marginTop: 14 }}>
          Every piece of work in this period has an answer.
        </div>
      )}

      <div className="actions">
        <button className="btn ghost sm" onClick={onOpenFull}>
          Edit everything else
        </button>
        <div className="spacer" />
        <button className="btn ghost" onClick={onClose}>
          {settled ? 'Close' : 'Later'}
        </button>
      </div>
    </Sheet>
  )
}
