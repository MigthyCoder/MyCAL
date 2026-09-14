import { useMemo, useState } from 'react'
import type { Occurrence } from '../lib/occurrences'
import type { Category, Kind } from '../lib/types'
import { addSeries } from '../lib/store'
import { fmtDur, fmtRange, fmtTime, parseKey } from '../lib/time'
import { CategoryPicker, DayPicker, Seg, Sheet, TimeField } from './ui'

export interface Draft {
  date: string
  startMin: number
  endMin: number
}

/** The lengths you actually think in. "Vantage, 2 PM, for two hours" should be
 *  one tap on 2h, not clock arithmetic on the end time. */
const LENGTHS = [30, 60, 90, 120, 180]

export function CreateSheet({
  draft,
  sameDay,
  onClose,
}: {
  draft: Draft
  sameDay: Occurrence[]
  onClose: () => void
}) {
  const [title, setTitle] = useState('')
  const [kind, setKind] = useState<Kind>('task')
  const [isPin, setIsPin] = useState(false)
  // A to-do has no time until you give it one. It goes to the top of its day —
  // not to some slot after dinner you never chose — and you drag it down into
  // the day once you know when.
  const [pinTimed, setPinTimed] = useState(false)
  const [category, setCategory] = useState<Category>('work')
  const [start, setStart] = useState(draft.startMin)
  const [end, setEnd] = useState(draft.endMin)
  const [repeat, setRepeat] = useState<number[]>([])
  const [why, setWhy] = useState('')
  const len = end - start

  // The app never silently stacks blocks. If this lands on top of something,
  // it asks what makes the overlap actually work. A to-do lies across whatever
  // is there by design, so it never asks.
  const collides = useMemo(
    () => (isPin ? [] : sameDay.filter((o) => !o.pin && o.startMin < end && start < o.endMin)),
    [sameDay, start, end, isPin],
  )

  const create = () => {
    if (!title.trim()) return
    addSeries({
      title: title.trim(),
      kind: isPin ? 'task' : kind,
      category,
      schoolRole: null,
      ...(isPin ? { pin: true, allDay: !pinTimed } : {}),
      startMin: start,
      endMin: isPin ? start : Math.max(end, start + 10),
      recurrence: repeat.length ? { byDay: repeat } : null,
      anchorDate: draft.date,
      ...(collides.length && why.trim() ? { overlapReason: why.trim().toUpperCase() } : {}),
    })
    onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <h3>{isPin ? 'New to-do' : 'New block'}</h3>
      <div className="meta">
        {parseKey(draft.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
        {isPin
          ? pinTimed
            ? ` · ${fmtTime(start)}`
            : ' · no set time'
          : ` · ${fmtRange(start, end)} · ${fmtDur(len)}`}
      </div>

      <input
        className="field"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={isPin ? 'Call grandma' : 'CCIR Workshop 3'}
        onKeyDown={(e) => { if (e.key === 'Enter') create() }}
      />

      <h4>What kind of thing is it?</h4>
      <Seg
        value={isPin ? 'pin' : kind}
        options={[
          { value: 'task' as const, label: 'Task' },
          { value: 'event' as const, label: 'Event' },
          { value: 'pin' as const, label: 'To-do' },
        ]}
        onChange={(v) => {
          if (v === 'pin') setIsPin(true)
          else { setIsPin(false); setKind(v as Kind) }
        }}
      />
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
        {isPin
          ? 'Sits at the top of the day until you drag it down to a time. Either way it still asks whether it got done.'
          : kind === 'task'
            ? 'Takes a slot, and asks you afterwards whether it got done.'
            : 'Takes a slot. Never asks you for anything.'}
      </div>

      <h4>Color</h4>
      <CategoryPicker value={category} onChange={setCategory} />

      {isPin ? (
        <>
          <h4>When</h4>
          <Seg
            value={pinTimed ? 'at' : 'none'}
            options={[
              { value: 'none' as const, label: 'No set time' },
              { value: 'at' as const, label: 'At a time' },
            ]}
            onChange={(v) => setPinTimed(v === 'at')}
          />
          {pinTimed && (
            <div className="row" style={{ marginTop: 8 }}>
              <TimeField value={start} onChange={setStart} />
            </div>
          )}
        </>
      ) : (
        <>
          <h4>
            Time <span className="h4dur">{fmtDur(len)}</span>
          </h4>
          <div className="row">
            {/* Moving the start keeps the length — you meant "later", not "shorter". */}
            <TimeField value={start} onChange={(v) => { setEnd(Math.min(v + len, 24 * 60)); setStart(v) }} />
            <span style={{ color: 'var(--text-3)' }}>to</span>
            <TimeField value={end} onChange={setEnd} />
          </div>
          <div className="durchips">
            {LENGTHS.map((m) => (
              <button
                key={m}
                aria-pressed={len === m}
                onClick={() => setEnd(Math.min(start + m, 24 * 60))}
              >
                {fmtDur(m)}
              </button>
            ))}
          </div>
        </>
      )}

      <h4>Repeat weekly</h4>
      <DayPicker value={repeat} onChange={setRepeat} />

      {collides.length > 0 && (
        <>
          <h4>This overlaps {collides.map((c) => c.title).join(', ')}</h4>
          <input
            className="field"
            value={why}
            onChange={(e) => setWhy(e.target.value)}
            placeholder="Why does that work? e.g. Work in car"
          />
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
            This sits on top of {collides.length === 1 ? 'it' : 'them'} as a frosted
            pane, not beside {collides.length === 1 ? 'it' : 'them'}. Fill this in and
            the reason becomes the block's header.
          </div>
        </>
      )}

      <div className="actions">
        <div className="spacer" />
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn solid" onClick={create} disabled={!title.trim()}>
          {isPin ? 'Add to-do' : 'Add block'}
        </button>
      </div>
    </Sheet>
  )
}
