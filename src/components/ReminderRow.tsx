import { useEffect, useRef, useState } from 'react'
import type { Reminder } from '../lib/types'
import { addReminder, editReminder, removeReminder, toggleReminder } from '../lib/store'
import { dateKey } from '../lib/time'

/**
 * The untimed strip above the grid. Things that belong to a day but not to an
 * hour live here rather than being given a fake 30 minutes somewhere.
 */
export function ReminderRow({
  days,
  reminders,
  template,
  isMobile,
}: {
  days: Date[]
  reminders: Reminder[]
  template: string
  isMobile: boolean
}) {
  const [adding, setAdding] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (adding || editing) inputRef.current?.focus()
  }, [adding, editing])

  const byDay = new Map<string, Reminder[]>()
  for (const d of days) byDay.set(dateKey(d), [])
  for (const r of reminders) byDay.get(r.date)?.push(r)

  const commitAdd = (date: string) => {
    if (draft.trim()) addReminder(date, draft)
    setDraft('')
    setAdding(null)
  }
  const commitEdit = (id: string) => {
    editReminder(id, draft)
    setDraft('')
    setEditing(null)
  }

  const anything = reminders.some((r) => byDay.has(r.date))

  return (
    <div className={`remrow ${anything ? '' : 'quiet'}`} style={{ gridTemplateColumns: template }}>
      <div className="remgutter">{anything || adding ? 'TO DO' : ''}</div>
      {days.map((d) => {
        const key = dateKey(d)
        const list = byDay.get(key) ?? []
        return (
          <div key={key} className="remcell">
            {list.map((r) =>
              editing === r.id ? (
                <input
                  key={r.id}
                  ref={inputRef}
                  className="reminput"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => commitEdit(r.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit(r.id)
                    if (e.key === 'Escape') { setEditing(null); setDraft('') }
                  }}
                />
              ) : (
                <button
                  key={r.id}
                  className={`rem ${r.done ? 'done' : ''}`}
                  onClick={() => toggleReminder(r.id)}
                  onDoubleClick={() => { setEditing(r.id); setDraft(r.text) }}
                  title={r.done ? 'Done — tap to undo' : 'Tap when done, double-tap to edit'}
                >
                  <i />
                  <span>{r.text}</span>
                  <em
                    onClick={(e) => { e.stopPropagation(); removeReminder(r.id) }}
                    title="Remove"
                  >
                    ×
                  </em>
                </button>
              ),
            )}
            {adding === key ? (
              <input
                ref={inputRef}
                className="reminput"
                value={draft}
                placeholder="Call grandma"
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => commitAdd(key)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitAdd(key)
                  if (e.key === 'Escape') { setAdding(null); setDraft('') }
                }}
              />
            ) : (
              <button
                className="remadd"
                onClick={() => { setDraft(''); setAdding(key) }}
                title="Add something to do this day, with no set time"
              >
                {isMobile || list.length === 0 ? '+ to do' : '+'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
