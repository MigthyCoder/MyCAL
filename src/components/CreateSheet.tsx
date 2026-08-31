import { useMemo, useState } from 'react'
import type { Occurrence } from '../lib/occurrences'
import type { Category, Kind } from '../lib/types'
import { addSeries } from '../lib/store'
import { fmtRange, parseKey } from '../lib/time'
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
  const [category, setCategory] = useState<Category>('work')
  const [start, setStart] = useState(draft.startMin)
  const [end, setEnd] = useState(draft.endMin)
  const [repeat, setRepeat] = useState<number[]>([])
  const [why, setWhy] = useState('')

  // The app never silently stacks blocks. If this lands on top of something,
  // it asks what makes the overlap actually work.
  const collides = useMemo(
    () => sameDay.filter((o) => o.startMin < end && start < o.endMin),
    [sameDay, start, end],
  )

  const create = () => {
    if (!title.trim()) return
    addSeries({
      title: title.trim(),
      kind,
      category,
      schoolRole: null,
      startMin: start,
      endMin: Math.max(end, start + 10),
      recurrence: repeat.length ? { byDay: repeat } : null,
      anchorDate: draft.date,
      ...(collides.length && why.trim() ? { overlapReason: why.trim().toUpperCase() } : {}),
    })
    onClose()
  }

  return (
    <Sheet onClose={onClose}>
      <h3>New block</h3>
      <div className="meta">
        {parseKey(draft.date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })} ·{' '}
        {fmtRange(start, end)}
      </div>

      <input
        className="field"
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="CCIR Workshop 3"
        onKeyDown={(e) => { if (e.key === 'Enter') create() }}
      />

      <h4>Does this need an outcome?</h4>
      <Seg
        value={kind}
        options={[
          { value: 'task' as const, label: 'Task — ask me after' },
          { value: 'event' as const, label: 'Event — just happens' },
        ]}
        onChange={setKind}
      />

      <h4>Color</h4>
      <CategoryPicker value={category} onChange={setCategory} />

      <h4>Time</h4>
      <div className="row">
        <TimeField value={start} onChange={setStart} />
        <span style={{ color: 'var(--text-3)' }}>to</span>
        <TimeField value={end} onChange={setEnd} />
      </div>

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
        <button className="btn solid" onClick={create} disabled={!title.trim()}>Add block</button>
      </div>
    </Sheet>
  )
}
