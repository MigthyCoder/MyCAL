import type { Occurrence } from '../lib/occurrences'
import { CATEGORY_META } from '../lib/seed'
import { fmtRange, fmtTime, parseKey } from '../lib/time'
import { Badge } from './shadcn/badge'
import { HoverCardContent } from './shadcn/hover-card'

const STATE_LABEL: Record<string, string> = {
  'needs-outcome': 'Needs an outcome',
  now: 'Happening now',
  finished: 'Done',
  dropped: 'Dropped',
  rescheduled: 'Moved',
  past: 'Passed',
  future: '',
}

const MARKER_LABEL: Record<string, string> = {
  test: 'TEST',
  quiz: 'QUIZ',
  due: 'DUE',
  presentation: 'PRESENTATION',
}

const fmtDuration = (min: number) => {
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h}h ${m}m` : `${h}h`
}

/**
 * What the block itself cannot say.
 *
 * A block is sized by its duration, so a short one has room for a title and
 * little else — the teacher, the full note, the marker labels and the outcome
 * all get truncated or dropped. Rather than make the block bigger, hovering
 * shows the whole record while the grid stays dense.
 *
 * Deliberately not a click target: clicking a block already opens it for
 * editing, and this must not compete with that or with dragging. It carries
 * nothing interactive, so pointer-events-none makes it literally incapable of
 * swallowing a click meant for the grid underneath — Radix already closes it
 * when a drag starts, but that relies on the drag reaching the trigger, and a
 * card sitting under the cursor is exactly where that would fail.
 */
export function BlockDetails({ occ }: { occ: Occurrence }) {
  const cat = CATEGORY_META[occ.series.category]
  const duration = occ.endMin - occ.startMin
  const state = STATE_LABEL[occ.state] ?? ''
  const room = occ.series.location ?? occ.fallbackSubtitle
  const notes = occ.notes.filter((n) => n.text.trim())

  return (
    <HoverCardContent side="right" align="start" sideOffset={10} className="blockdetail pointer-events-none">
      <div className="bd-head">
        {/* @ts-expect-error custom property */}
        <span className="bd-dot" style={{ '--h': cat.hue }} aria-hidden="true" />
        <span className="bd-title">{occ.title}</span>
      </div>

      <div className="bd-when">
        {occ.pin ? (
          fmtTime(occ.startMin)
        ) : (
          <>
            {fmtRange(occ.startMin, occ.endMin)}
            <span className="bd-dur">{fmtDuration(duration)}</span>
          </>
        )}
      </div>
      <div className="bd-date">
        {parseKey(occ.date).toLocaleDateString(undefined, {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
        })}
      </div>

      {(room || state) && (
        <div className="bd-row">
          {room && <span className="bd-room">{room}</span>}
          {state && (
            <Badge variant="secondary" className="bd-state">
              {state}
            </Badge>
          )}
        </div>
      )}

      {notes.length > 0 && (
        <div className="bd-notes">
          {notes.map((n) => (
            <div className="bd-note" key={n.id}>
              {n.marker && (
                <Badge variant="outline" className="bd-marker">
                  {MARKER_LABEL[n.marker] ?? n.marker}
                </Badge>
              )}
              <span>{n.text}</span>
            </div>
          ))}
        </div>
      )}

      {occ.did && (
        <div className="bd-note bd-did">
          <span className="bd-k">Did</span>
          {occ.did}
        </div>
      )}

      {occ.movedTo && (
        <div className="bd-note">
          <span className="bd-k">Moved to</span>
          {parseKey(occ.movedTo.date).toLocaleDateString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
          })}{' '}
          {fmtTime(occ.movedTo.startMin)}
        </div>
      )}

      {occ.overlapReason && (
        <div className="bd-note">
          <span className="bd-k">Overlaps because</span>
          {occ.overlapReason}
        </div>
      )}

      <div className="bd-foot">
        {cat.label}
        {occ.generated && ' · from your bell schedule'}
      </div>
    </HoverCardContent>
  )
}
