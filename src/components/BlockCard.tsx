import { useEffect, useRef, useState } from 'react'
import type { Placed } from '../lib/layout'
import { CATEGORY_META, FLEX_OPTIONS } from '../lib/seed'
import { DAY_START_MIN, fmtRange, fmtTime, parseKey } from '../lib/time'
import { setOutcome, setSubtitle, patchOverride } from '../lib/store'

/** Width the hover rail claims, in px. The block slides left by this much so
 *  there's somewhere to click to add something beside it. */
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
}: Props) {
  const { occ, left, width } = placed
  const hue = CATEGORY_META[occ.series.category].hue
  const duration = occ.endMin - occ.startMin
  const naturalH = duration * pxPerMin
  const isFlex = occ.series.schoolRole === 'flex'

  // The Flex quick-picks wrap to two rows in a narrow column, so an open Flex
  // block needs more room than an open note block.
  const openMin = isFlex && occ.state === 'needs-outcome' ? 156 : 104
  const height = active ? Math.max(naturalH, openMin) : Math.max(naturalH, 18)
  // Hovering lets a block grow past its time slot to show the rest of a note.
  // Blocks whose text already fits don't move at all, so this never jitters.
  // Same rule as the hover rail: only a commitment that isn't already riding on
  // something can take one of its own.
  const canHostRider = !occ.generated && occ.series.kind === 'event' && !placed.rider
  const top = (occ.startMin - DAY_START_MIN) * pxPerMin

  const [draft, setDraft] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!active) return
    // Seed from what YOU wrote for this day, never from the series default —
    // otherwise you'd have to clear "Open" before typing every single time.
    const seed = isFlex
      ? (occ.state !== 'future' && occ.state !== 'now' ? (occ.did ?? '') : (occ.planned ?? ''))
      : (occ.ownSubtitle ?? '')
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
      const val = draft.trim() || undefined
      patchOverride(occ.series.id, occ.date, {
        [reporting ? 'did' : 'planned']: val,
        // Saying what you did IS the outcome — no second confirmation step.
        ...(reporting && val ? { outcome: 'finished' as const } : {}),
      })
    } else {
      setSubtitle(occ, draft)
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

  // What the subtitle line says depends on where the block is in its lifecycle.
  let subLine: string | undefined
  if (isFlex) {
    if (occ.did) subLine = `Did: ${occ.did}`
    else if (occ.planned) subLine = `Planned: ${occ.planned}`
  } else {
    // A test beats a room number for the one line you get.
    subLine = occ.marker?.label || occ.subtitle
  }

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
  const compact = height < 30 && !active
  const tight = !active && !compact && height < 46
  // The clock is redundant — you can read the time off the grid — so a note
  // always outranks it for the space.
  // Something cascaded on top of this block will cover its lower half, and half
  // a time range reads worse than none.
  const covered = placed.stacked > 0 && placed.stacked < placed.cols
  const inset =
    (placed.rider ? SLIVER : 0) +
    (placed.stacked > 1 ? (placed.stacked - 1) * CASCADE_INSET : 0)
  const showWhen =
    !active && !tight && !covered && height >= 58 && (height >= 84 || !subLine)

  return (
    <div
      className={`block ${stateClass} ${compact ? 'short' : ''} ${tight ? 'tight' : ''} ${
        occ.series.schoolRole ? 'sch' : ''
      } ${grow ? 'grown' : ''} ${placed.rider ? 'rider' : ''} ${
        placed.stacked ? 'stacked' : ''
      }`}
      style={{
        // @ts-expect-error custom property
        '--h': hue,
        top,
        height: grow ? 'auto' : height,
        minHeight: height,
        // Inset from the left so a stripe of whatever is underneath still shows
        // — you can see this is *on* something, not beside it. Pixels rather
        // than a percentage, so the block keeps essentially its whole width.
        left: `calc(${left * 100}% + ${3 + inset}px)`,
        width: `calc(${width * 100}% - ${6 + inset}px)`,
        // base 2+layer · grown base 6 · rail 7 · rider 8+layer · grown rider 12 ·
        // open 20. A host never rises above its riders, and a cascaded block
        // always sits above the one it covers.
        zIndex: active
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
      onMouseDown={(e) => {
        if (active || occ.generated) return
        onDragStart(e, 'move')
      }}
      onClick={(e) => {
        e.stopPropagation()
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

      {occ.overlapReason && !compact && !tight && <div className="why">{occ.overlapReason}</div>}

      <div className="title">
        <span className="tname">{occ.title}</span>
        {/* The chip lives on the title line — on its own row it pushes the note
            out of any block shorter than an hour. */}
        {occ.marker && !compact && (
          <span className={`marker ${occ.marker.type === 'due' ? 'due' : ''}`}>
            {occ.marker.type.toUpperCase()}
          </span>
        )}
        {/* Where a moved block went is the whole point of leaving it behind, so
            it shows even when the block is too short for a second line. */}
        {movedTail && !active ? (
          <span className="inlinesub moved">{movedTail}</span>
        ) : (
          tight && subLine && <span className="inlinesub">{subLine}</span>
        )}
      </div>

      {active ? (
        <div style={{ marginTop: 4 }} onMouseDown={(e) => e.stopPropagation()}>
          <input
            ref={inputRef}
            autoFocus
            className="field"
            style={{ padding: '5px 8px', fontSize: 12 }}
            value={draft}
            placeholder={
              isFlex
                ? reporting
                  ? 'What did you actually do?'
                  : 'Plan for this flex…'
                : occ.series.defaultSubtitle || 'Add a note for this day…'
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
              onMouseDown={(e) => e.preventDefault()}
              onClick={onOpenInspector}
            >
              ⋯
            </button>
          </div>
        </div>
      ) : (
        <>
          {subLine && !compact && !tight && <div className="sub">{subLine}</div>}
          {occ.state === 'needs-outcome' && !compact && !tight && (
            <div className="needsflag">Needs outcome</div>
          )}
          {showWhen && <div className="when">{tail}</div>}
        </>
      )}
    </div>
  )
}
