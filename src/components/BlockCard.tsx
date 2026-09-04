import type { Placed } from '../lib/layout'
import type { DayNote, MarkerType } from '../lib/types'
import { CATEGORY_META } from '../lib/seed'
import { DAY_START_MIN, fmtRange, fmtTime, parseKey } from '../lib/time'
import { clearOutcome, setNoteDone, setOutcome } from '../lib/store'

/** Width the hover rail claims, in px. The block slides left by this much so
 *  there's somewhere to click to add something beside it. */
export const RAIL_W = 34
/** How much of the host block stays visible down the left of a rider. */
export const SLIVER = 18
/** And how much of the block underneath a cascaded one stays visible. */
export const CASCADE_INSET = 16

export type DragMode = 'move' | 'resize-top' | 'resize-bottom'

interface Props {
  placed: Placed
  pxPerMin: number
  /** Pointer is over this block. Drives grow-to-fit only — the add-alongside
   *  rail lays over the block rather than moving it. */
  hovered: boolean
  onHover: (over: boolean, e: React.MouseEvent) => void
  /** A tap or click is always "show me everything about this". */
  onOpen: () => void
  onDragStart: (e: React.MouseEvent, mode: DragMode) => void
  /** Held down and picked up on a touch screen. */
  lifted: boolean
  onPressStart: (e: React.TouchEvent) => void
  onPressMove: (e: React.TouchEvent) => void
  onPressEnd: (e: React.TouchEvent) => void
  /** Finger went down on the top or bottom edge — the phone's resize handle. */
  onTouchResize: (e: React.TouchEvent, edge: 'top' | 'bottom') => void
  /** True while you're choosing a landing spot for something you're moving, and
   *  this block is a school period the work could go INTO. */
  dropInto?: boolean
  /** Text is bigger on a phone, so fewer lines fit in the same minutes. */
  isMobile: boolean
}

export function BlockCard({
  placed,
  pxPerMin,
  hovered,
  onHover,
  onOpen,
  onDragStart,
  lifted,
  onPressStart,
  onPressMove,
  onPressEnd,
  onTouchResize,
  dropInto,
  isMobile,
}: Props) {
  const { occ, left, width } = placed
  const hue = CATEGORY_META[occ.series.category].hue
  const duration = occ.endMin - occ.startMin
  const naturalH = duration * pxPerMin
  const isFlex = occ.series.schoolRole === 'flex'

  // A pin is a line, so it has a height of its own rather than one earned from
  // its duration — which is zero.
  const PIN_H = 26
  const height = occ.pin ? PIN_H : Math.max(naturalH, 18)
  // Hovering lets a block grow past its time slot to show the rest of a note.
  // Blocks whose text already fits don't move at all, so this never jitters.
  // Same rule as the hover rail: only a commitment that isn't already riding on
  // something can take one of its own.
  const top = (occ.startMin - DAY_START_MIN) * pxPerMin + (placed.pinOffset ?? 0)

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

  // Work parked inside this block reads as a checklist; everything else is a
  // note. They're the same shape in storage, but only one of them owes an answer.
  const plan = occ.notes.filter((n) => n.task)
  const plain = occ.notes.filter((n) => !n.task)

  // What the subtitle says depends on where the block is in its lifecycle. Flex
  // keeps BOTH lines once it has both — the gap between what you meant to do and
  // what you did is the entire point of writing them down.
  const subLines: string[] = []
  if (!isFlex) {
    if (plain.length > 0) for (const n of plain) subLines.push(n.text)
    else if (plan.length === 0 && occ.fallbackSubtitle) subLines.push(occ.fallbackSubtitle)
  } else {
    for (const n of plain) subLines.push(n.text)
    if (occ.did) subLines.push(`Did: ${occ.did}`)
  }

  // One chip per KIND of thing, not one chip and a count of everything else — a
  // test and a due date are different facts about the day and both deserve
  // saying. Two of the same kind collapse into "DUE (2)".
  const ORDER: MarkerType[] = ['test', 'quiz', 'due', 'presentation']
  const tally = new Map<MarkerType, number>()
  for (const n of occ.notes) if (n.marker) tally.set(n.marker, (tally.get(n.marker) ?? 0) + 1)
  const chips = ORDER.filter((t) => tally.has(t)).map((t) => ({ type: t, n: tally.get(t)! }))

  const movedTail =
    occ.state === 'rescheduled' && occ.movedTo
      ? `→ ${parseKey(occ.movedTo.date).toLocaleDateString(undefined, { weekday: 'short' })} ${fmtTime(occ.movedTo.startMin)}`
      : null
  const tail = movedTail ?? fmtRange(occ.startMin, occ.endMin)

  const hasBody = subLines.length > 0 || plan.length > 0
  // Only a block with something written in it can overflow its slot, so only
  // those grow. A bare block like Streetplay stays completely still.
  const grow = hovered && hasBody

  // A block only stacks title-over-note when there's room for both lines.
  // Below that it puts them on one line; below that, title only.
  const compact = height < 30
  const tight = !compact && height < 46
  // The clock is redundant — you can read the time off the grid — so a note
  // always outranks it for the space.
  // Something cascaded on top of this block will cover its lower half, and half
  // a time range reads worse than none.
  const covered = placed.stacked > 0 && placed.stacked < placed.cols
  const inset =
    (placed.rider ? SLIVER : 0) +
    (placed.stacked > 1 ? (placed.stacked - 1) * CASCADE_INSET : 0)
  // The clock is the first thing to go. You can read the time off the grid; you
  // cannot read the homework you parked in here off anything else.
  const showWhen = !tight && !covered && height >= 58 && (!hasBody || height >= 112)

  const tick = (n: DayNote) => (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation()
    e.preventDefault()
    setNoteDone(occ, n.id, n.done ? undefined : 'finished')
  }

  // Half a row of text looks broken, so work out how many actually fit and say
  // out loud that the rest are there. A Flex is 52 minutes; a plan can be six
  // items long. When it's tight the "Planned" label is the first thing dropped —
  // the numbers already say it's a list in order.
  const ROW = isMobile ? 20 : 17
  const LAB = isMobile ? 14 : 12
  const MORE = isMobile ? 16 : 14
  const room =
    height -
    12 - // padding
    (isMobile ? 17 : 16) - // title
    2 - // the plan's own top margin
    (chips.length ? 19 : 0) -
    subLines.length * (isMobile ? 17 : 15) -
    (showWhen ? 15 : 0)
  // n rows cost n*ROW minus the gap the last one doesn't have. The label is the
  // first thing given up, then whole items.
  const need = plan.length * ROW - 1
  const showLab = isFlex && need <= room - LAB
  const allFit = need <= room
  const shownPlan = allFit ? plan : plan.slice(0, Math.max(Math.floor((room - MORE + 1) / ROW), 0))
  const hidden = plan.length - shownPlan.length

  const planRows = plan.length > 0 && !compact && !tight && (
    <div className="plan">
      {showLab && <div className="planlab">Planned</div>}
      {shownPlan.map((n, i) => (
        <div className={`todo ${n.done ?? ''}`} key={n.id}>
          <button
            className="tick"
            title={n.done ? 'Not done after all' : 'Mark done'}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={tick(n)}
          >
            {n.done ? '✓' : isFlex ? i + 1 : ''}
          </button>
          <span>{n.text}</span>
        </div>
      ))}
      {hidden > 0 && <div className="planmore">+{hidden} more</div>}
    </div>
  )

  return (
    <div
      className={`block ${stateClass} ${compact ? 'short' : ''} ${tight ? 'tight' : ''} ${
        occ.series.schoolRole ? 'sch' : ''
      } ${grow ? 'grown' : ''} ${placed.rider ? 'rider' : ''} ${
        placed.stacked ? 'stacked' : ''
      } ${lifted ? 'lifted' : ''} ${occ.pin ? 'pin' : ''} ${dropInto ? 'dropinto' : ''}`}
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
        // base 2+layer · grown base 6 · rail 7 · rider 8+layer · grown rider 12.
        // A host never rises above its riders, and a cascaded block always sits
        // above the one it covers.
        zIndex: lifted
          ? 30
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
      onTouchMove={onPressMove}
      onTouchEnd={onPressEnd}
      onTouchCancel={onPressEnd}
      onMouseDown={(e) => {
        if (occ.generated) return
        onDragStart(e, 'move')
      }}
      onClick={(e) => {
        e.stopPropagation()
        onOpen()
      }}
    >
      {!occ.generated && (
        <>
          {/* Fat enough for a fingertip on a phone, invisible on a desktop. */}
          <div
            className="grabber top"
            onMouseDown={(e) => { e.stopPropagation(); onDragStart(e, 'resize-top') }}
            onTouchStart={(e) => onTouchResize(e, 'top')}
          />
          <div
            className="grabber bottom"
            onMouseDown={(e) => { e.stopPropagation(); onDragStart(e, 'resize-bottom') }}
            onTouchStart={(e) => onTouchResize(e, 'bottom')}
          />
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

      {occ.pin ? null : (
        <>
          {occ.overlapReason && !compact && !tight && <div className="why">{occ.overlapReason}</div>}

          <div className="title">
            <span className="tname">{occ.title}</span>
            {/* Where a moved block went is the whole point of leaving it behind,
                so it shows even when the block is too short for a second line. */}
            {movedTail ? (
              <span className="inlinesub moved">{movedTail}</span>
            ) : (
              tight &&
              subLines.length > 0 && (
                <span className="inlinesub">{subLines[subLines.length - 1]}</span>
              )
            )}
            {tight && plan.length > 0 && !movedTail && (
              <span className="inlinesub">{plan.length} planned</span>
            )}
          </div>

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

          {planRows}

          {!compact &&
            !tight &&
            (isFlex
              ? subLines.map((line, i) => (
                  <div className={`sub ${line.startsWith('Did:') ? 'did' : ''}`} key={i}>
                    {line}
                  </div>
                ))
              : plain.length > 0
                ? plain.map((n) => (
                    <div className={`sub ${n.marker ? `flag ${n.marker}` : ''}`} key={n.id}>
                      {n.text}
                    </div>
                  ))
                : subLines.map((line, i) => (
                    <div className="sub" key={i}>
                      {line}
                    </div>
                  )))}

          {/* A block with a checklist in it already says what it's waiting for,
              and the border is already orange. The banner is for the ones that
              would otherwise look finished. */}
          {occ.state === 'needs-outcome' && !compact && !tight && plan.length === 0 && (
            <div className="needsflag">Needs outcome</div>
          )}
          {showWhen && <div className="when">{tail}</div>}
        </>
      )}
    </div>
  )
}
