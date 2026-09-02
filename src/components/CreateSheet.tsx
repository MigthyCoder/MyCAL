import { useMemo, useState } from 'react'
import type { Occurrence } from '../lib/occurrences'
import type { Category, Kind } from '../lib/types'
import { addSeries, endOfDayFor } from '../lib/store'
import { fmtRange, fmtTime, parseKey } from '../lib/time'
import { CategoryPicker, DayPicker, Seg, Sheet, TimeField } from './ui'

export interface Draft {
  date: string
  startMin: number
  endMin: number
}

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
  // A to-do has no duration you could honestly draw, so it lands after whatever
  // is already on that day rather than claiming a slot of its own.
  const [isPin, setIsPin] = useState(false)
  const [category, setCategory] = useState<Category>('work')
  const [start, setStart] = useState(draft.startMin)
  const [end, setEnd] = useState(draft.endMin)
  const [repeat, setRepeat] = useState<number[]>([])
  const [why, setWhy] = useState('')

  // The app never silently stacks blocks. If this lands on top of something,
  // it asks what makes the overlap actually work. A pin lies across whatever is
  // there by design, so it never asks.
  const collides = useMemo(
    () => (isPin ? [] : sameDay.filter((o) => !o.pin && o.startMin < end && start < o.endMin)),
    [sameDay, start, end, isPin],
  )

  const pinAt = useMemo(
    () => endOfDayFor(sameDay.filter((o) => !o.pin).map((o) => o.endMin)),
    [sameDay],
  )

  const create = () => {
    if (!title.trim()) return
    addSeries({
      title: title.trim(),
      kind: isPin ? 'task' : kind,
      category,
      schoolRole: null,
      ...(isPin ? { pin: true } : {}),
      startMin: isPin ? pinAt : start,
      endMin: isPin ? pinAt : Math.max(end, start + 10),
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
        {isPin ? '' : ` · ${fmtRange(start, end)}`}
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
          ? `No set time — it sits as a line at ${fmtTime(pinAt)}, after everything else that day. Drag it wherever you like, and it still asks whether it got done.`
          : kind === 'task'
            ? 'Takes a slot, and asks you afterwards whether it got done.'
            : 'Takes a slot. Never asks you for anything.'}
      </div>

      <h4>Color</h4>
      <CategoryPicker value={category} onChange={setCategory} />

      {!isPin && (
        <>
          <h4>Time</h4>
          <div className="row">
            <TimeField value={start} onChange={setStart} />
            <span style={{ color: 'var(--text-3)' }}>to</span>
            <TimeField value={end} onChange={setEnd} />
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
