import type { Occurrence } from './occurrences'
import { DAY_START_MIN } from './time'

export interface Placed {
  occ: Occurrence
  /** fraction of the column width, 0..1 */
  left: number
  width: number
  cols: number
  /** Sits on top of a bigger block rather than beside it. */
  rider: boolean
  /** Extra pixels down, so two to-dos at the same moment stack rather than
   *  printing on top of each other. */
  pinOffset?: number
  /** Laid over a partly-overlapping neighbour instead of splitting the column.
   *  0 means not cascaded; otherwise it's the 1-based layer, so `stacked < cols`
   *  says something is sitting on top of this one. */
  stacked: number
  /** Key of the block it's riding on, when rider. */
  hostKey?: string
}

const MIN_VISUAL_MIN = 22 // a 10-minute block still needs to be clickable

const span = (o: Occurrence) => ({
  s: o.startMin,
  e: Math.max(o.endMin, o.startMin + MIN_VISUAL_MIN),
})

const isEvent = (o: Occurrence) => o.series.kind === 'event'

/**
 * Does `a` enclose `b`? A commitment you're inside of — Streetplay, a drive —
 * hosts whatever you're doing during it. On an exact time tie the commitment
 * hosts and the task rides, because "where you are" contains "what you're doing".
 */
function contains(a: Occurrence, b: Occurrence): boolean {
  if (a.key === b.key) return false
  const A = span(a)
  const B = span(b)
  if (A.s > B.s || A.e < B.e) return false
  const da = A.e - A.s
  const db = B.e - B.s
  if (da > db) return true
  return da === db && isEvent(a) && !isEvent(b)
}

interface Slot {
  occ: Occurrence
  left: number
  width: number
  cols: number
  stacked: number
}

/** Past this many deep a cascade stops being readable; split the column instead. */
const MAX_CASCADE = 3

/** Google-Calendar-style column packing, for blocks that genuinely compete. */
function packColumns(occs: Occurrence[]): Slot[] {
  if (occs.length === 0) return []

  const items = [...occs].sort((a, b) =>
    a.startMin !== b.startMin ? a.startMin - b.startMin : b.endMin - a.endMin,
  )

  const out: Slot[] = []
  let cluster: Occurrence[] = []
  let clusterEnd = -Infinity

  const flush = () => {
    if (!cluster.length) return
    const colEnds: number[] = []
    const colOf = new Map<string, number>()
    for (const o of cluster) {
      const { s, e } = span(o)
      let col = colEnds.findIndex((x) => x <= s)
      if (col === -1) {
        col = colEnds.length
        colEnds.push(e)
      } else {
        colEnds[col] = e
      }
      colOf.set(o.key, col)
    }
    const cols = colEnds.length

    // Two things that merely clip each other aren't competing for the hour —
    // one just runs into the other. Cascading keeps both nearly full width and
    // readable, where an even split makes two tall blocks into two slivers.
    // It only works when the starts differ, since the block underneath is read
    // by the strip of it showing above and to the left.
    const starts = new Set(cluster.map((o) => o.startMin))
    const cascade = cols > 1 && cols <= MAX_CASCADE && starts.size === cluster.length

    if (cascade) {
      // Every block keeps the full column. The nudge that reveals what's
      // underneath is a fixed handful of pixels applied at render time, so a
      // long commitment doesn't lose a fifth of its width to sit on top of
      // something it merely brushes against.
      for (const o of cluster) {
        const col = colOf.get(o.key)!
        out.push({ occ: o, left: 0, width: 1, cols, stacked: col + 1 })
      }
      cluster = []
      clusterEnd = -Infinity
      return
    }

    for (const o of cluster) {
      const col = colOf.get(o.key)!
      const { s, e } = span(o)
      // let a block widen into empty columns to its right
      let reach = col + 1
      while (reach < cols) {
        const blocked = cluster.some((other) => {
          if (other.key === o.key || colOf.get(other.key) !== reach) return false
          const t = span(other)
          return t.s < e && s < t.e
        })
        if (blocked) break
        reach++
      }
      out.push({ occ: o, left: col / cols, width: (reach - col) / cols, cols, stacked: 0 })
    }
    cluster = []
    clusterEnd = -Infinity
  }

  for (const o of items) {
    const { s, e } = span(o)
    if (s >= clusterEnd) flush()
    cluster.push(o)
    clusterEnd = Math.max(clusterEnd, e)
  }
  flush()

  return out
}

/** Drawn height of a pin, in px. Needed here to stop two of them colliding. */
export const PIN_H = 26

export function layoutDay(all: Occurrence[], pxPerMin = 1): Placed[] {
  if (all.length === 0) return []

  // A pin is a line at a moment, not a box over a span. It has no width to
  // compete for, so it sits out of the packing and lies across whatever is
  // already there — but two of them at the same moment still have to be
  // readable, so they stack downward instead of printing over each other.
  const pins = [...all.filter((o) => o.pin)].sort((a, b) => a.startMin - b.startMin)
  const occs = all.filter((o) => !o.pin)
  let lastBottom = -Infinity
  const pinned: Placed[] = pins.map((o) => {
    const top = (o.startMin - DAY_START_MIN) * pxPerMin
    const pinOffset = top < lastBottom ? lastBottom - top : 0
    lastBottom = top + pinOffset + PIN_H + 2
    return { occ: o, left: 0, width: 1, cols: 1, rider: false, stacked: 0, pinOffset }
  })
  if (occs.length === 0) return pinned

  // Work out what rides on what. Best host = an event first, then the longest.
  const hostOf = new Map<string, Occurrence>()
  for (const b of occs) {
    let best: Occurrence | null = null
    for (const a of occs) {
      if (!contains(a, b)) continue
      if (!best) {
        best = a
        continue
      }
      const rank = (isEvent(a) ? 1 : 0) - (isEvent(best) ? 1 : 0)
      if (rank > 0) best = a
      else if (rank === 0) {
        const la = span(a).e - span(a).s
        const lb = span(best).e - span(best).s
        if (la > lb) best = a
      }
    }
    if (best) hostOf.set(b.key, best)
  }

  // Collapse chains so a rider never rides another rider.
  const byKey = new Map(occs.map((o) => [o.key, o]))
  const topHost = new Map<string, Occurrence>()
  for (const [key] of hostOf) {
    let h = hostOf.get(key)!
    for (let i = 0; i < 8 && hostOf.has(h.key); i++) h = hostOf.get(h.key)!
    if (h.key !== key && byKey.has(h.key)) topHost.set(key, h)
  }

  const base = occs.filter((o) => !topHost.has(o.key))
  const basePlaced = packColumns(base)
  const baseByKey = new Map(basePlaced.map((p) => [p.occ.key, p]))

  const out: Placed[] = basePlaced.map((p) => ({ ...p, rider: false }))

  const riders = new Map<string, Occurrence[]>()
  for (const [key, host] of topHost) {
    const o = byKey.get(key)!
    const list = riders.get(host.key) ?? []
    list.push(o)
    riders.set(host.key, list)
  }

  for (const [hostKey, list] of riders) {
    const hp = baseByKey.get(hostKey)
    if (!hp) continue
    // Riders that clash with each other still split — but only within the
    // host's own width, so they stay on top of it.
    for (const r of packColumns(list)) {
      out.push({
        occ: r.occ,
        left: hp.left + r.left * hp.width,
        width: r.width * hp.width,
        cols: r.cols,
        stacked: r.stacked,
        rider: true,
        hostKey,
      })
    }
  }

  return [...out, ...pinned]
}
