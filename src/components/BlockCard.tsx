import { useEffect, useRef, useState } from 'react'
import type { Placed } from '../lib/layout'
import type { MarkerType } from '../lib/types'
import { CATEGORY_META, FLEX_OPTIONS } from '../lib/seed'
import { DAY_START_MIN, fmtRange, fmtTime, parseKey } from '../lib/time'
import {
  BLOCK_GAP_X,
  BLOCK_INSET_X,
  BLOCK_MIN_H,
  BLOCK_OPEN_FLEX_H,
  BLOCK_OPEN_H,
  BLOCK_TITLE_ONLY_H,
  BLOCK_TWO_LINE_H,
  PIN_H,
} from '../lib/geometry'
import { clearOutcome, setOutcome, setQuickNote, patchOverride } from '../lib/store'

/** Width the hover rail claims, in px. The block slides left by this much so
 *  there's somewhere to click to add something beside it. */
/** Which part of a Flex a line belongs to, so the plan and the answer don't read
 *  as one undifferentiated block of text. */
function flexLineClass(line: string): string {
  if (line.startsWith('Did:')) return 'did'
  if (line === 'Planned') return 'planlabel'
  if (/^\d+\./.test(line)) return 'planitem'
  return 'plan'
}

export const RAIL_W = 34
/** How much of the host block stays visible down the left of a rider. */
export const SLIVER = 18
/** And how much of the block underneath a cascaded one stays visible. */
export const CASCADE_INSET = 16

interface Props {
  placed: Placed
  pxPerMin: number
  active: boolean
  /** Pointer is over this block. Drives grow-to-fit only — the add-alongside
   *  rail lays over the block rather than moving it. */
  hovered: boolean
  onHover: (over: boolean, e: React.MouseEvent) => void
  onActivate: () => void
  onDismiss: () => void
  onOpenInspector: () => void
  onAskReschedule: () => void
  onAddAlongside: () => void
  onDragStart: (e: React.MouseEvent, mode: 'move' | 'resize-top' | 'resize-bottom') => void
  /** Held down and picked up on a touch screen. */
  lifted: boolean
  onPressStart: (e: React.TouchEvent) => void
  onPressCancel: () => void
}

export function BlockCard({
  placed,
  pxPerMin,
  active,
  hovered,
  onHover,
  onActivate,
  onDismiss,
  onOpenInspector,
  onAskReschedule,
  onAddAlongside,
  onDragStart,
  lifted,
  onPressStart,
  onPressCancel,
}: Props) {
  const { occ, left, width } = placed
  const { hue, lift } = CATEGORY_META[occ.series.category]
  const duration = occ.endMin - occ.startMin
  const naturalH = duration * pxPerMin
  const isFlex = occ.series.schoolRole === 'flex'

  // The Flex quick-picks wrap to two rows in a narrow column, so an open Flex
  // block needs more room than an open note block.
  // A pin is a line, so it has a height of its own rather than one earned from
  // its duration — which is zero.
  const openMin = isFlex && occ.state === 'needs-outcome' ? BLOCK_OPEN_FLEX_H : BLOCK_OPEN_H
  const height = occ.pin
    ? PIN_H
    : active
      ? Math.max(naturalH, openMin)
      : Math.max(naturalH, BLOCK_MIN_H)
  // Hovering lets a block grow past its time slot to show the rest of a note.
  // Blocks whose text already fits don't move at all, so this never jitters.
  // Same rule as the hover rail: only a commitment that isn't already riding on
  // something can take one of its own.
  const canHostRider = !occ.generated && occ.series.kind === 'event' && !placed.rider
  const top = (occ.startMin - DAY_START_MIN) * pxPerMin + (placed.pinOffset ?? 0)

  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!active) return
    // Seed from what YOU wrote for this day, never from the series default —
    // otherwise you'd have to clear "Open" before typing every single time.
    const seed = isFlex
      ? occ.state !== 'future' && occ.state !== 'now'
        ? (occ.did ?? '')
        : (occ.notes[0]?.text ?? '')
      : (occ.notes.find((n) => !n.marker)?.text ?? '')
    setDraft(seed)
    const el = inputRef.current
    if (el) { el.focus(); el.select() }
    const t = setTimeout(() => inputRef.current?.focus(), 50)
    return () => clearTimeout(t)
  }, [active, occ.key])

  // Before it happens you're planning; after it happens you're reporting.
  const reporting = isFlex && occ.state !== 'future' && occ.state !== 'now'

  const commit = () => {
    if (isFlex) {
      const val = draft.trim()
      if (reporting) {
        patchOverride(occ.series.id, occ.date, {
          did: val || undefined,
          // Saying what you did IS the outcome — no second confirmation step.
          ...(val ? { outcome: 'finished' as const } : {}),
        })
      } else {
        // Editing the plan from the block touches the top item only.
        setQuickNote(occ, val)
      }
    } else {
      setQuickNote(occ, draft)
    }
    onDismiss()
  }

  const logFlex = (option: string) => {
    if (option === 'Other') { inputRef.current?.focus(); return }
    patchOverride(occ.series.id, occ.date, { did: option, outcome: 'finished' })
    onDismiss()
  }

  const stateClass =
    occ.state === 'needs-outcome'
      ? 'needs'
      : occ.state === 'now'
        ? 'live'
        : occ.state === 'finished'
          ? 'finished'
          : occ.state === 'dropped'
            ? 'dropped'
            : occ.state === 'rescheduled'
              ? 'rescheduled'
              : occ.state === 'past'
                ? 'past'
                : ''

  // What the subtitle says depends on where the block is in its lifecycle. Flex
  // keeps BOTH lines once it has both — the gap between what you meant to do and
  // what you did is the entire point of writing them down.
  const subLines: string[] = []
  if (isFlex) {
    // Always labelled. A bare numbered list loses the thing that makes a Flex
    // worth reading — that this was the intent, and that below it is the answer.
    if (occ.notes.length === 1) {
      subLines.push(`Planned: ${occ.notes[0].text}`)
    } else if (occ.notes.length > 1) {
      subLines.push('Planned')
      occ.notes.forEach((n, i) => subLines.push(`${i + 1}. ${n.text}`))
    }
    if (occ.did) subLines.push(`Did: ${occ.did}`)
  } else if (occ.notes.length > 0) {
    for (const n of occ.notes) subLines.push(n.text)
  } else if (occ.fallbackSubtitle) {
    subLines.push(occ.fallbackSubtitle)
  }

  // One chip per KIND of thing, not one chip and a count of everything else — a
  // test and a due date are different facts about the day and both deserve
  // saying. Two of the same kind collapse into "DUE (2)".
  const ORDER: MarkerType[] = ['test', 'quiz', 'due', 'presentation']
  const tally = new Map<MarkerType, number>()
  for (const n of occ.notes) if (n.marker) tally.set(n.marker, (tally.get(n.marker) ?? 0) + 1)
  const chips = ORDER.filter((t) => tally.has(t)).map((t) => ({ type: t, n: tally.get(t)! }))
  const subLine = subLines[0]

  const movedTail =
    occ.state === 'rescheduled' && occ.movedTo
      ? `→ ${parseKey(occ.movedTo.date).toLocaleDateString(undefined, { weekday: 'short' })} ${fmtTime(occ.movedTo.startMin)}`
      : null
  const tail = movedTail ?? fmtRange(occ.startMin, occ.endMin)

  // Only a block with note text can overflow its slot, so only those grow. A
  // bare block like Streetplay stays completely still when you pass over it.
  const grow = hovered && !active && Boolean(subLine)

  // A block only stacks title-over-note when there's room for both lines.
  // Below that it puts them on one line; below that, title only.
  // Derived from the type scale rather than picked: `compact` is "there is not
  // room for a second line", `tight` is "there is, but only just".
  const compact = height < BLOCK_TITLE_ONLY_H && !active
  const tight = !active && !compact && height < BLOCK_TWO_LINE_H
  // The clock is redundant — you can read the time off the grid — so a note
  // always outranks it for the space.
  // Something cascaded on top of this block will cover its lower half, and half
  // a time range reads worse than none.
  const covered = placed.stacked > 0 && placed.stacked < placed.cols
  const inset =
    (placed.rider ? SLIVER : 0) +
    (placed.stacked > 1 ? (placed.stacked - 1) * CASCADE_INSET : 0)
  const showWhen =
    !active && !tight && !covered && height >= 58 && (height >= 84 || subLines.length === 0)

  return (
    <div
      className={`block ${stateClass} ${compact ? 'short' : ''} ${tight ? 'tight' : ''} ${
        occ.series.schoolRole ? 'sch' : ''
      } ${grow ? 'grown' : ''} ${placed.rider ? 'rider' : ''} ${
        placed.stacked ? 'stacked' : ''
      } ${lifted ? 'lifted' : ''} ${occ.pin ? 'pin' : ''}`}
      style={{
        // @ts-expect-error custom property
        '--h': hue,
        '--lift': `${lift}%`,
        top,
        height: grow ? 'auto' : height,
        minHeight: height,
        // Inset from the left so a stripe of whatever is underneath still shows
        // — you can see this is *on* something, not beside it. Pixels rather
        // than a percentage, so the block keeps essentially its whole width.
        left: `calc(${left * 100}% + ${BLOCK_INSET_X + inset}px)`,
        width: `calc(${width * 100}% - ${BLOCK_INSET_X + BLOCK_GAP_X + inset}px)`,
        // base 2+layer · grown base 6 · rail 7 · rider 8+layer · grown rider 12 ·
        // open 20. A host never rises above its riders, and a cascaded block
        // always sits above the one it covers.
        zIndex: lifted
          ? 30
          : active
          ? 20
          : placed.rider
            ? grow
              ? 12
              : 8 + placed.stacked
            : grow
              ? 6
              : 2 + placed.stacked,
      }}
      onMouseEnter={(e) => onHover(true, e)}
      onMouseLeave={(e) => onHover(false, e)}
      onTouchStart={onPressStart}
      onTouchMove={onPressCancel}
      onTouchEnd={onPressCancel}
      onMouseDown={(e) => {
        if (active || occ.generated) return
        onDragStart(e, 'move')
      }}
      onClick={(e) => {
        e.stopPropagation()
        if (occ.pin) { onOpenInspector(); return }
        if (!active) onActivate()
      }}
      onDoubleClick={(e) => {
        e.stopPropagation()
        onOpenInspector()
      }}
    >
      {!active && !occ.generated && (
        <>
          <div className="grabber top" onMouseDown={(e) => { e.stopPropagation(); onDragStart(e, 'resize-top') }} />
          <div className="grabber bottom" onMouseDown={(e) => { e.stopPropagation(); onDragStart(e, 'resize-bottom') }} />
        </>
      )}

      {occ.pin && (
        <>
          {/* The dot is a checkbox: one tap is the whole answer most of the time.
              Everything else — rename, move, drop, delete — is behind the text,
              which leaves the line free to be dragged. */}
          <button
            className="pindot"
            title={occ.outcome === 'finished' ? 'Done — tap to undo' : 'Mark done'}
            aria-label={occ.outcome === 'finished' ? `Mark "${occ.title}" not done` : `Mark "${occ.title}" done`}
            aria-pressed={occ.outcome === 'finished'}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              if (occ.outcome) clearOutcome(occ)
              else setOutcome(occ, 'finished')
            }}
          />
          <span className="pintext">{occ.title}</span>
          <span className="pinwhen">
            {occ.state === 'rescheduled' && occ.movedTo
              ? `→ ${parseKey(occ.movedTo.date).toLocaleDateString(undefined, { weekday: 'short' })}`
              : occ.state === 'needs-outcome'
                ? 'done?'
                : occ.state === 'finished' || occ.state === 'dropped'
                  ? ''
                  : fmtTime(occ.startMin)}
          </span>
        </>
      )}

      {occ.overlapReason && !compact && !tight && <div className="why">{occ.overlapReason}</div>}

      {!occ.pin && (
      <div className="title">
        <span className="tname">{occ.title}</span>
        {/* The chip lives on the title line — on its own row it pushes the note
            out of any block shorter than an hour. */}

        {/* Where a moved block went is the whole point of leaving it behind, so
            it shows even when the block is too short for a second line. */}
        {movedTail && !active ? (
          <span className="inlinesub moved">{movedTail}</span>
        ) : (
          tight && subLines.length > 0 && (
            <span className="inlinesub">{subLines[subLines.length - 1]}</span>
          )
        )}
      </div>
      )}

      {chips.length > 0 && !compact && !tight && (
        <div className="markers">
          {chips.map((c) => (
            <span className={`marker ${c.type}`} key={c.type}>
              {c.type === 'presentation' ? 'PRESENT' : c.type.toUpperCase()}
              {c.n > 1 ? ` (${c.n})` : ''}
            </span>
          ))}
        </div>
      )}

      {active && !occ.pin ? (
        <div style={{ marginTop: 4 }} onMouseDown={(e) => e.stopPropagation()}>
          <input
            ref={inputRef}
            autoFocus
            className="field blocknote"
            value={draft}
            placeholder={
              isFlex
                ? reporting
                  ? 'What did you actually do?'
                  : 'Plan for this flex…'
                : occ.fallbackSubtitle || 'Add a note for this day…'
            }
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); commit() }
              if (e.key === 'Escape') { e.preventDefault(); onDismiss() }
            }}
            onBlur={commit}
          />
          <div className="row wrap" style={{ marginTop: 5, gap: 4 }}>
            {occ.state === 'needs-outcome' && isFlex && (
              <>
                {/* If you wrote a plan, the commonest honest answer is that you
                    followed it — and it records WHAT, not just "as planned". */}
                {occ.notes.length > 0 && (
                  <button
                    className="btn sm ghost plandone"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() =>
                      logFlex(occ.notes.map((n) => n.text.trim()).filter(Boolean).join(', '))
                    }
                  >
                    ✓ The plan
                  </button>
                )}
                {FLEX_OPTIONS.map((o) => (
                  <button
                    key={o}
                    className="btn sm ghost"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => logFlex(o)}
                  >
                    {o}
                  </button>
                ))}
              </>
            )}
            {occ.state === 'needs-outcome' && !isFlex && (
              <>
                <button className="btn sm ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOutcome(occ, 'finished'); onDismiss() }}>Done</button>
                <button className="btn sm ghost" onMouseDown={(e) => e.preventDefault()} onClick={onAskReschedule}>Move</button>
                <button className="btn sm ghost" onMouseDown={(e) => e.preventDefault()} onClick={() => { setOutcome(occ, 'dropped'); onDismiss() }}>Drop</button>
              </>
            )}
            {canHostRider && (
              <button
                className="btn sm"
                style={{ marginLeft: 'auto' }}
                title="Add something alongside this block"
                onMouseDown={(e) => e.preventDefault()}
                onClick={onAddAlongside}
              >
                ＋
              </button>
            )}
            <button
              className="btn sm"
              style={canHostRider ? undefined : { marginLeft: 'auto' }}
              title="More options"
              aria-label={`More options for "${occ.title}"`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={onOpenInspector}
            >
              ⋯
            </button>
          </div>
        </div>
      ) : occ.pin ? null : (
        <>
          {!compact &&
            !tight &&
            (occ.notes.length > 0 && !isFlex
              ? occ.notes.map((n) => (
                  <div className={`sub ${n.marker ? `flag ${n.marker}` : ''}`} key={n.id}>
                    {n.text}
                  </div>
                ))
              : subLines.map((line, i) => (
                  <div className={`sub ${isFlex ? flexLineClass(line) : ''}`} key={i}>
                    {line}
                  </div>
                )))}
          {occ.state === 'needs-outcome' && !compact && !tight && (
            <div className="needsflag">Needs outcome</div>
          )}
          {showWhen && <div className="when">{tail}</div>}
        </>
      )}
    </div>
  )
}
