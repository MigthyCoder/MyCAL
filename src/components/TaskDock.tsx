import { useEffect, useMemo, useRef, useState } from 'react'
import type { Task } from '../lib/types'
import {
  addTask,
  clearDoneTasks,
  deleteTask,
  editTask,
  scheduleTask,
  toggleTask,
  unscheduleTask,
} from '../lib/store'
import { dateKey, parseKey } from '../lib/time'

/** "Thu Sep 3" — enough to place it without spending a whole row on a date. */
const fmtWhen = (d: string) =>
  parseKey(d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })

const OPEN_KEY = 'mycal.tasks.open'

/**
 * The undated pile.
 *
 * Sits above the grid rather than inside it on purpose: the grid is a claim
 * about when things happen, and the whole point of these is that you have not
 * made that claim yet. Collapsed it costs one row, because most of the time
 * you are looking at the week, not the list.
 */
export function TaskDock({
  tasks,
  onJumpTo,
}: {
  tasks: Task[]
  /** Show me the block this task became. */
  onJumpTo?: (seriesId: string, date: string) => void
}) {
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === '1'
    } catch {
      return false
    }
  })
  const [draft, setDraft] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [schedulingId, setSchedulingId] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, open ? '1' : '0')
    } catch {
      // private mode — the panel just forgets its state between reloads
    }
  }, [open])

  // Open ones first, then the done ones newest-first, so ticking something
  // moves it out of the way instead of leaving a hole where you were reading.
  const { todo, done } = useMemo(() => {
    const todo = tasks.filter((t) => !t.done)
    const done = tasks
      .filter((t) => t.done)
      .sort((a, b) => (b.doneAt ?? 0) - (a.doneAt ?? 0))
    return { todo, done }
  }, [tasks])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!addTask(draft)) return
    setDraft('')
    // Show the thing that was just captured. Adding from the collapsed bar and
    // getting nothing back but a number ticking up reads as "did that work?",
    // which is the exact doubt a capture box has to not create.
    setOpen(true)
    // Stay in the field: writing down one thing usually reminds you of the next.
    inputRef.current?.focus()
  }

  const commitEdit = () => {
    if (editingId) editTask(editingId, editText)
    setEditingId(null)
  }

  return (
    <div className={`taskdock ${open ? 'open' : ''}`}>
      <div className="taskbar">
        <button
          className="taskToggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className={`caret ${open ? 'on' : ''}`} aria-hidden="true">›</span>
          Tasks
          {todo.length > 0 && <span className="taskcount">{todo.length}</span>}
        </button>

        {/* The add field lives in the collapsed bar too. Having to open a panel
            before you can write down the thing you just remembered is how the
            thing stops getting written down. */}
        <form className="taskadd" onSubmit={submit}>
          <input
            ref={inputRef}
            className="field"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Something to do, no date needed"
            aria-label="Add a task"
          />
          <button className="btn sm ghost" type="submit" disabled={!draft.trim()}>
            Add
          </button>
        </form>
      </div>

      {open && (
        <div className="tasklist">
          {todo.length === 0 && done.length === 0 && (
            <div className="taskempty">
              Nothing here. This is for the work that has to happen but doesn’t
              belong to a particular day yet.
            </div>
          )}

          {todo.map((t) => (
            <div className="taskrow" key={t.id}>
              {/* The label is the tap target, not the 22px box: a checkbox is a
                  replaced element, so it cannot grow a hit area with a
                  pseudo-element the way .pindot does. */}
              <label className="taskcheck">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => toggleTask(t.id)}
                  aria-label={`Mark "${t.text}" done`}
                />
              </label>
              {editingId === t.id ? (
                <input
                  className="field"
                  autoFocus
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  onBlur={commitEdit}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitEdit()
                    if (e.key === 'Escape') setEditingId(null)
                  }}
                  aria-label={`Edit "${t.text}"`}
                />
              ) : (
                <button
                  className="tasktext"
                  onClick={() => {
                    setEditingId(t.id)
                    setEditText(t.text)
                  }}
                  title="Click to rename"
                >
                  {t.text}
                </button>
              )}
              {t.scheduledFor && t.seriesId ? (
                <span className="taskwhen">
                  <button
                    className="whenchip"
                    title="Show me this on the calendar"
                    aria-label={`"${t.text}" is scheduled for ${fmtWhen(t.scheduledFor)}. Show it on the calendar.`}
                    onClick={() => onJumpTo?.(t.seriesId!, t.scheduledFor!)}
                  >
                    {fmtWhen(t.scheduledFor)}
                  </button>
                  <button
                    className="rowx"
                    title="Take it back off the calendar"
                    aria-label={`Unschedule "${t.text}"`}
                    onClick={() => unscheduleTask(t.id)}
                  >
                    ↩
                  </button>
                </span>
              ) : schedulingId === t.id ? (
                <input
                  className="field taskdate"
                  type="date"
                  autoFocus
                  defaultValue={dateKey(new Date())}
                  aria-label={`Pick a day for "${t.text}"`}
                  onBlur={() => setSchedulingId(null)}
                  onChange={(e) => {
                    if (!e.target.value) return
                    scheduleTask(t.id, e.target.value)
                    setSchedulingId(null)
                  }}
                />
              ) : (
                <button
                  className="btn sm ghost taskwhenbtn"
                  aria-label={`Schedule "${t.text}"`}
                  onClick={() => setSchedulingId(t.id)}
                >
                  Schedule
                </button>
              )}
              <button
                className="rowx"
                aria-label={`Delete "${t.text}"`}
                title="Delete"
                onClick={() => deleteTask(t.id)}
              >
                ×
              </button>
            </div>
          ))}

          {done.length > 0 && (
            <div className="taskdone">
              <div className="taskdonehead">
                <span>{done.length} done</span>
                <button className="btn sm ghost" onClick={clearDoneTasks}>
                  Clear
                </button>
              </div>
              {done.map((t) => (
                <div className="taskrow is-done" key={t.id}>
                  <label className="taskcheck">
                    <input
                      type="checkbox"
                      checked
                      onChange={() => toggleTask(t.id)}
                      aria-label={`Mark "${t.text}" not done`}
                    />
                  </label>
                  <span className="tasktext">{t.text}</span>
                  <button
                    className="rowx"
                    aria-label={`Delete "${t.text}"`}
                    title="Delete"
                    onClick={() => deleteTask(t.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
