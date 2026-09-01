import type { DB, Override, Series } from './types'

/** A calendar with nothing in it. A device in this state has nothing worth
 *  keeping, so it must never win a merge. */
export const isEmpty = (d: DB) => d.series.length === 0 && !d.school.enabled

/**
 * Which document's settings — school roster, density, start date — survive.
 *
 * An empty document ALWAYS loses. Signing in on a fresh phone used to hand it the
 * win on recency alone, which quietly wiped the school setup on the laptop while
 * leaving the blocks behind (those get unioned either way).
 */
export function remoteWins(local: DB, remote: DB): boolean {
  if (isEmpty(remote) && !isEmpty(local)) return false
  if (isEmpty(local) && !isEmpty(remote)) return true
  return (remote.touchedAt ?? 0) > (local.touchedAt ?? 0)
}

/**
 * Union the two documents rather than picking a winner wholesale. Adding
 * Streetplay on the laptop and CCIR on the phone must not delete either — only a
 * genuine edit to the *same* thing falls back to the winner above.
 */
export function mergeDB(local: DB, remote: DB, remoteIsNewer: boolean): DB {
  const winner = remoteIsNewer ? remote : local
  const loser = remoteIsNewer ? local : remote

  const series = new Map<string, Series>()
  for (const s of loser.series) series.set(s.id, s)
  for (const s of winner.series) series.set(s.id, s)

  const ovKey = (o: Override) => `${o.seriesId}|${o.date}`
  const overrides = new Map<string, Override>()
  for (const o of loser.overrides) overrides.set(ovKey(o), o)
  for (const o of winner.overrides) overrides.set(ovKey(o), o)

  return {
    ...winner,
    series: [...series.values()],
    overrides: [...overrides.values()],
  }
}
