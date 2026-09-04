import { useEffect, useMemo, useRef, useState } from 'react'
import type { Task } from '../lib/types'
import {
  addTask,
  clearDoneTasks,
  deleteTask,
  editTask,
  setTaskCategory,
  toggleTask,
  unscheduleTask,
} from '../lib/store'
import { parseKey } from '../lib/time'
import { CATEGORIES, CATEGORY_META } from '../lib/seed'
import { ChevronRight, Undo2, X } from 'lucide-react'
import { Button } from './shadcn/button'
import { Input } from './shadcn/input'
import { Badge } from './shadcn/badge'
import { Checkbox } from './shadcn/checkbox'

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
  onSchedule,
}: {
  tasks: Task[]
  /** Show me the block this task became. */
  onJumpTo?: (seriesId: string, date: string) => void
  /** Start placing this task on the grid by dragging its box. */
  onSchedule?: (task: Task) => void
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
  const [coloringId, setColoringId] = useState<string | null>(null)
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
          <ChevronRight className={`caret ${open ? 'on' : ''}`} aria-hidden="true" />
          Tasks
          {todo.length > 0 && (
            <Badge variant="secondary" className="taskcount">{todo.length}</Badge>
          )}
        </button>

        {/* The add field lives in the collapsed bar too. Having to open a panel
            before you can write down the thing you just remembered is how the
            thing stops getting written down. */}
        <form className="taskadd" onSubmit={submit}>
          <Input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => setOpen(true)}
            placeholder="Something to do, no date needed"
            aria-label="Add a task"
          />
          <Button size="sm" variant="secondary" type="submit" disabled={!draft.trim()}>
            Add
          </Button>
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
              {/* Radix renders a real button rather than an <input>, so the tap
                  area is sized on the control itself and the wrapper is only
                  there to hold the row's rhythm. */}
              <span className="taskcheck">
                <Checkbox
                  checked={false}
                  onCheckedChange={() => toggleTask(t.id)}
                  aria-label={`Mark "${t.text}" done`}
                />
              </span>
              <span className="taskcolor">
                <button
                  className="colordot"
                  aria-label={`Colour of "${t.text}": ${CATEGORY_META[t.category ?? 'personal'].label}`}
                  aria-expanded={coloringId === t.id}
                  title={CATEGORY_META[t.category ?? 'personal'].label}
                  // @ts-expect-error custom property
                  style={{ '--h': CATEGORY_META[t.category ?? 'personal'].hue }}
                  onClick={() => setColoringId(coloringId === t.id ? null : t.id)}
                />
                {coloringId === t.id && (
                  <span className="colorpop">
                    {CATEGORIES.map((c) => (
                      <button
                        key={c}
                        className="swatch"
                        title={CATEGORY_META[c].label}
                        aria-label={CATEGORY_META[c].label}
                        aria-pressed={(t.category ?? 'personal') === c}
                        // @ts-expect-error custom property
                        style={{ '--h': CATEGORY_META[c].hue }}
                        onClick={() => {
                          setTaskCategory(t.id, c)
                          setColoringId(null)
                        }}
                      />
                    ))}
                  </span>
                )}
              </span>
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
                  <Badge
                    asChild
                    variant="outline"
                    className="whenchip"
                  >
                    <button
                      aria-label={`"${t.text}" is scheduled for ${fmtWhen(t.scheduledFor)}. Show it on the calendar.`}
                      onClick={() => onJumpTo?.(t.seriesId!, t.scheduledFor!)}
                    >
                      {fmtWhen(t.scheduledFor)}
                    </button>
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label={`Unschedule "${t.text}"`}
                    onClick={() => unscheduleTask(t.id)}
                  >
                    <Undo2 />
                  </Button>
                </span>
              ) : (
                <Button
                  variant="ghost"
                  size="xs"
                  className="taskwhenbtn"
                  aria-label={`Schedule "${t.text}" by dragging it onto the calendar`}
                  onClick={() => onSchedule?.(t)}
                >
                  Schedule
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-xs"
                className="taskdel"
                aria-label={`Delete "${t.text}"`}
                onClick={() => deleteTask(t.id)}
              >
                <X />
              </Button>
            </div>
          ))}

          {done.length > 0 && (
            <div className="taskdone">
              <div className="taskdonehead">
                <span>{done.length} done</span>
                <Button variant="ghost" size="xs" onClick={clearDoneTasks}>
                  Clear
                </Button>
              </div>
              {done.map((t) => (
                <div className="taskrow is-done" key={t.id}>
                  <span className="taskcheck">
                    <Checkbox
                      checked
                      onCheckedChange={() => toggleTask(t.id)}
                      aria-label={`Mark "${t.text}" not done`}
                    />
                  </span>
                  <span className="tasktext">{t.text}</span>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="taskdel"
                    aria-label={`Delete "${t.text}"`}
                    onClick={() => deleteTask(t.id)}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
