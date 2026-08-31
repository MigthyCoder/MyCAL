import { useState } from 'react'
import type { Occurrence } from '../lib/occurrences'
import { reschedule } from '../lib/store'
import { fmtRange, parseKey } from '../lib/time'
import { Sheet, TimeField } from './ui'

export function RescheduleSheet({ occ, onClose }: { occ: Occurrence; onClose: () => void }) {
  const [date, setDate] = useState(occ.date)
  const [start, setStart] = useState(occ.startMin)
  const [why, setWhy] = useState('')

  return (
    <Sheet onClose={onClose}>
      <h3>Move “{occ.title}”</h3>
      <div className="meta">
        Was {parseKey(occ.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} ·{' '}
        {fmtRange(occ.startMin, occ.endMin)}
      </div>

      <div className="note" style={{ marginBottom: 18 }}>
        The original block stays where it was, marked with where it went. Nothing
        in your history gets rewritten.
      </div>

      <h4>Move to</h4>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <input className="field" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <TimeField value={start} onChange={setStart} />
      </div>

      <h4>Why didn't it happen?</h4>
      <input
        className="field"
        autoFocus
        value={why}
        onChange={(e) => setWhy(e.target.value)}
        placeholder="Couldn't work in car — bad service"
        onKeyDown={(e) => {
          if (e.key === 'Enter') { reschedule(occ, date, start, why); onClose() }
        }}
      />
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
        Optional, but this is the part that's actually worth reading back in three months.
      </div>

      <div className="actions">
        <div className="spacer" />
        <button className="btn ghost" onClick={onClose}>Cancel</button>
        <button className="btn solid" onClick={() => { reschedule(occ, date, start, why); onClose() }}>
          Move it
        </button>
      </div>
    </Sheet>
  )
}
