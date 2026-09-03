import { useMemo, useState } from 'react'
import {
  blankSchedule,
  nextSlotKey,
  ordinal,
  PRESETS,
  type BellSchedule,
  type Slot,
  type SlotRole,
} from '../lib/bell'
import {
  clearSchedules,
  deleteSchedule,
  getDB,
  loadPreset,
  saveSchedule,
  setWeekday,
} from '../lib/store'
import { fmtRange } from '../lib/time'
import { Sheet } from './ui'

const DOW_LABELS = [
  { dow: 1, label: 'Mon' },
  { dow: 2, label: 'Tue' },
  { dow: 3, label: 'Wed' },
  { dow: 4, label: 'Thu' },
  { dow: 5, label: 'Fri' },
  { dow: 6, label: 'Sat' },
  { dow: 0, label: 'Sun' },
]

const ROLES: { value: SlotRole; label: string }[] = [
  { value: 'class', label: 'Class' },
  { value: 'lunch', label: 'Lunch' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'advisory', label: 'Advisory' },
  { value: 'success', label: 'Study hall' },
  { value: 'special', label: 'Other' },
]

/** <input type="time"> speaks "HH:MM"; everything downstream counts minutes
 *  from midnight. Native picker over a hand-rolled one: it already knows the
 *  user's 12h/24h preference and works on a phone. */
const toTimeValue = (min: number) =>
  `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

const fromTimeValue = (v: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v)
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (h > 23 || mm > 59) return null
  return h * 60 + mm
}

/** A new day shape needs an id that is stable and not already taken. */
function freshId(existing: Record<string, BellSchedule>): string {
  let n = Object.keys(existing).length + 1
  while (existing[`sched${n}`]) n++
  return `sched${n}`
}

export function ScheduleEditor({ onClose }: { onClose: () => void }) {
  const db = getDB()
  const schedules = db.school.schedules
  const [editingId, setEditingId] = useState<string | null>(null)

  const ids = useMemo(() => Object.keys(schedules), [schedules])
  const activePreset = db.school.presetId ? PRESETS[db.school.presetId] : undefined
  const editing = editingId ? schedules[editingId] : null

  const addSchedule = () => {
    const id = freshId(schedules)
    saveSchedule(blankSchedule(id, `Day shape ${ids.length + 1}`))
    setEditingId(id)
  }

  // ---------------------------------------------------------------- one shape

  if (editing) {
    const patch = (next: Partial<BellSchedule>) => saveSchedule({ ...editing, ...next })

    const setSlot = (i: number, next: Partial<Slot>) => {
      const slots = editing.slots.map((s, j) => (j === i ? { ...s, ...next } : s))
      patch({ slots })
    }

    const addSlot = () => {
      // Start the new row where the last one ended, which is what you were
      // going to type anyway.
      const last = editing.slots[editing.slots.length - 1]
      const startMin = last ? last.endMin : 8 * 60 + 30
      const slot: Slot = {
        key: nextSlotKey(editing, 'class', undefined),
        label: 'New period',
        startMin,
        endMin: Math.min(startMin + 50, 24 * 60 - 1),
        role: 'class',
      }
      patch({ slots: [...editing.slots, slot] })
    }

    const removeSlot = (i: number) => patch({ slots: editing.slots.filter((_, j) => j !== i) })

    // Slots are stored in the order you typed them; the grid reads times, not
    // order, but a list that jumps around while you edit is horrible. Sort only
    // on demand.
    const sortSlots = () =>
      patch({ slots: [...editing.slots].sort((a, b) => a.startMin - b.startMin) })

    const outOfOrder = editing.slots.some((s, i) => i > 0 && s.startMin < editing.slots[i - 1].startMin)
    const backwards = editing.slots.filter((s) => s.endMin <= s.startMin)

    return (
      <Sheet onClose={() => setEditingId(null)} wide>
        <div className="onb">
          <h3>Edit day shape</h3>

          <div className="row" style={{ marginBottom: 4 }}>
            <input
              className="field"
              style={{ maxWidth: 280 }}
              value={editing.label}
              onChange={(e) => patch({ label: e.target.value })}
              placeholder="Regular day"
              aria-label="Name of this day shape"
            />
            <input
              className="field"
              style={{ maxWidth: 150 }}
              value={editing.short ?? ''}
              onChange={(e) => patch({ short: e.target.value || undefined })}
              placeholder="Short tag"
              aria-label="Short tag shown in the day header"
            />
            <div style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>
              The short tag shows in the calendar header when a day isn't shaped
              the way you'd expect — "EARLY OUT", "FINALS".
            </div>
          </div>

          <h4>Periods</h4>
          {editing.slots.length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '6px 0 2px' }}>
              Nothing here yet. Add the first period and work down the day.
            </div>
          ) : (
            <div className="ptable">
              <div className="prow head" style={{ gridTemplateColumns: '1fr 118px 118px 120px 44px' }}>
                <div>Name</div>
                <div>Starts</div>
                <div>Ends</div>
                <div>Counts as</div>
                <div />
              </div>
              {editing.slots.map((slot, i) => (
                <div
                  className="prow"
                  key={`${slot.key}-${i}`}
                  style={{ gridTemplateColumns: '1fr 118px 118px 120px 44px' }}
                >
                  <input
                    className="field"
                    value={slot.label}
                    onChange={(e) => setSlot(i, { label: e.target.value })}
                    placeholder="1st period"
                    aria-label={`Name of period ${i + 1}`}
                  />
                  <input
                    className="field"
                    type="time"
                    value={toTimeValue(slot.startMin)}
                    onChange={(e) => {
                      const v = fromTimeValue(e.target.value)
                      if (v !== null) setSlot(i, { startMin: v })
                    }}
                    aria-label={`Start time of ${slot.label}`}
                  />
                  <input
                    className="field"
                    type="time"
                    value={toTimeValue(slot.endMin)}
                    onChange={(e) => {
                      const v = fromTimeValue(e.target.value)
                      if (v !== null) setSlot(i, { endMin: v })
                    }}
                    aria-label={`End time of ${slot.label}`}
                  />
                  <select
                    className="field"
                    value={slot.role}
                    onChange={(e) => {
                      const role = e.target.value as SlotRole
                      // Only a class carries a period number, and the period is
                      // what makes a note on "6th" follow you across day shapes.
                      setSlot(i, role === 'class' ? { role } : { role, period: undefined })
                    }}
                    aria-label={`What ${slot.label} counts as`}
                  >
                    {ROLES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <button
                    className="rowx"
                    aria-label={`Remove ${slot.label}`}
                    title="Remove this period"
                    onClick={() => removeSlot(i)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Period numbers are the thing that makes one roster work across
              every day shape, so they get their own row rather than hiding in
              the table. */}
          {editing.slots.some((s) => s.role === 'class') && (
            <>
              <h4>Which period is which</h4>
              <div className="row wrap" style={{ gap: 8 }}>
                {editing.slots.map((slot, i) =>
                  slot.role !== 'class' ? null : (
                    <label key={`${slot.key}-${i}-p`} className="check" style={{ gap: 6 }}>
                      <span style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{slot.label}</span>
                      <input
                        className="field"
                        style={{ width: 62 }}
                        type="number"
                        min={1}
                        max={20}
                        value={slot.period ?? ''}
                        placeholder="—"
                        aria-label={`Period number for ${slot.label}`}
                        onChange={(e) => {
                          const n = e.target.value === '' ? undefined : Number(e.target.value)
                          setSlot(i, {
                            period: n,
                            key: n != null ? `p${n}` : nextSlotKey(editing, 'special'),
                          })
                        }}
                      />
                    </label>
                  ),
                )}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6, lineHeight: 1.5 }}>
                Give a period the same number in every day shape it appears in.
                That's what lets you name {ordinal(6)} period once and have the
                name — and any note on it — follow it onto block days.
              </div>
            </>
          )}

          {(outOfOrder || backwards.length > 0) && (
            <div className="note" style={{ marginTop: 12, borderLeftColor: 'var(--warn)' }}>
              {backwards.length > 0 && (
                <div>
                  {backwards.length === 1 ? 'One period ends' : `${backwards.length} periods end`}{' '}
                  before it starts. It won't show on the calendar until that's fixed.
                </div>
              )}
              {outOfOrder && (
                <div className="row" style={{ marginTop: backwards.length ? 8 : 0 }}>
                  <span>These are out of time order.</span>
                  <button className="btn sm ghost" onClick={sortSlots}>Sort by start time</button>
                </div>
              )}
            </div>
          )}

          <div className="actions">
            <button className="btn sm ghost" onClick={addSlot}>+ Add a period</button>
            <div className="spacer" />
            <button
              className="btn ghost danger"
              onClick={() => {
                deleteSchedule(editing.id)
                setEditingId(null)
              }}
            >
              Delete this shape
            </button>
            <button className="btn solid" onClick={() => setEditingId(null)}>Done</button>
          </div>
        </div>
      </Sheet>
    )
  }

  // ------------------------------------------------------------- the overview

  return (
    <Sheet onClose={onClose} wide>
      <div className="onb">
        <h3>Your bell schedules</h3>
        <p className="lede">
          A day shape is one version of your school day — a regular day, a block
          day, an early release. Build the shapes your school runs, then say
          which one each weekday uses.
        </p>

        <h4>Day shapes</h4>
        {ids.length === 0 ? (
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', padding: '4px 0 8px' }}>
            None yet. Add your regular day first — it's the one most weekdays use.
          </div>
        ) : (
          <div className="schedlist">
            {ids.map((id) => {
              const s = schedules[id]
              const span = s.slots.filter((x) => x.role !== 'breakfast')
              const first = span[0]
              const last = span[span.length - 1]
              const days = DOW_LABELS.filter((d) => db.school.weekdays[String(d.dow)] === id)
              return (
                <button key={id} onClick={() => setEditingId(id)}>
                  <span className="sl">
                    {s.label}
                    {days.length > 0 && (
                      <span style={{ color: 'var(--text-3)', fontWeight: 400 }}>
                        {'  ·  '}{days.map((d) => d.label).join(' ')}
                      </span>
                    )}
                  </span>
                  <span className="sr">
                    {first
                      ? `${fmtRange(first.startMin, last.endMin)} · ${span.length} periods`
                      : 'empty'}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn ghost" onClick={addSchedule}>+ Add a day shape</button>
        </div>

        <h4>A normal week</h4>
        <div className="ptable">
          {DOW_LABELS.map(({ dow, label }) => (
            <div className="prow" key={dow} style={{ gridTemplateColumns: '84px 1fr' }}>
              <div className="plabel">{label}</div>
              <select
                className="field"
                value={db.school.weekdays[String(dow)] ?? ''}
                aria-label={`Which schedule ${label} runs`}
                onChange={(e) => setWeekday(dow, e.target.value || null)}
              >
                <option value="">No school</option>
                {ids.map((id) => (
                  <option key={id} value={id}>{schedules[id].label}</option>
                ))}
              </select>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.5 }}>
          One-off changes — a rally, finals week, a snow day — don't belong here.
          Click any date on the calendar to swap that single day.
        </div>

        <h4>Start from a school</h4>
        <div className="row wrap" style={{ gap: 8 }}>
          {Object.values(PRESETS).map((p) => (
            <button
              key={p.id}
              className={`btn ghost ${db.school.presetId === p.id ? 'on' : ''}`}
              aria-pressed={db.school.presetId === p.id}
              onClick={() => {
                // Replacing every shape is not something to do to someone by
                // accident, and it drops their per-date swaps with it.
                if (ids.length > 0 && !confirm(`Replace your schedules with ${p.label}?`)) return
                loadPreset(p.id)
                setEditingId(null)
              }}
            >
              {p.label}
            </button>
          ))}
          <button
            className="btn ghost"
            onClick={() => {
              if (ids.length > 0 && !confirm('Delete every day shape and start empty?')) return
              clearSchedules()
            }}
          >
            Start from scratch
          </button>
        </div>
        {activePreset?.note && (
          <div className="note" style={{ marginTop: 10, borderLeftColor: 'var(--warn)' }}>
            {activePreset.note}
          </div>
        )}

        <div className="actions">
          <div className="spacer" />
          <button className="btn solid" onClick={onClose}>Done</button>
        </div>
      </div>
    </Sheet>
  )
}
