import type { SupabaseClient, Session } from '@supabase/supabase-js'
import type { DB, Override, Series } from './types'
import { getDB, hydrate, subscribe } from './store'

const URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
const KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** With no credentials the whole module is a no-op and MyCAL stays local-only. */
export const SYNC_CONFIGURED = Boolean(URL && KEY)

// Loaded on demand: with sync switched off the Supabase client never enters the
// bundle you download, which keeps the local-only app half the size.
let supabase: SupabaseClient | null = null
async function client(): Promise<SupabaseClient | null> {
  if (supabase) return supabase
  if (!SYNC_CONFIGURED) return null
  const { createClient } = await import('@supabase/supabase-js')
  supabase = createClient(URL!, KEY!, {
    auth: { persistSession: true, autoRefreshToken: true },
  })
  return supabase
}

export type SyncState =
  | { kind: 'off' }
  | { kind: 'signed-out' }
  | { kind: 'ready'; email: string; lastSync: number | null; busy: boolean; error?: string }

let state: SyncState = SYNC_CONFIGURED ? { kind: 'signed-out' } : { kind: 'off' }
const listeners = new Set<() => void>()
export const onSyncChange = (l: () => void) => {
  listeners.add(l)
  return () => listeners.delete(l)
}
export const getSyncState = () => state
const set = (patch: Partial<Extract<SyncState, { kind: 'ready' }>> | SyncState) => {
  state = 'kind' in patch ? (patch as SyncState) : ({ ...state, ...patch } as SyncState)
  listeners.forEach((l) => l())
}

const TABLE = 'mycal_state'

// ------------------------------------------------------------------- merge

/** A calendar with nothing in it. A device in this state has nothing worth
 *  keeping, so it must never win a merge. */
const isEmpty = (d: DB) => d.series.length === 0 && !d.school.enabled

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

// -------------------------------------------------------------- push/pull

let lastPushed = ''
let pushTimer: ReturnType<typeof setTimeout> | null = null
let channelBound = false
let applyingRemote = false

async function pull(userId: string): Promise<{ data: DB; updatedAt: number } | null> {
  const sb = (await client())!
  const { data, error } = await sb
    .from(TABLE)
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return { data: data.data as DB, updatedAt: new Date(data.updated_at).getTime() }
}

async function push(userId: string, doc: DB) {
  const sb = (await client())!
  const body = JSON.stringify(doc)
  const { error } = await sb
    .from(TABLE)
    .upsert({ user_id: userId, data: doc, updated_at: new Date().toISOString() })
  if (error) throw error
  lastPushed = body
  set({ lastSync: Date.now(), error: undefined })
}

/** Pull, merge with what's here, write the result back, and keep it in sync. */
export async function startSync(session: Session) {
  const sb = await client()
  if (!sb) return
  const userId = session.user.id
  set({ kind: 'ready', email: session.user.email ?? '', lastSync: null, busy: true })

  try {
    const remote = await pull(userId)
    if (remote) {
      // Local wins ties: you're looking at this device right now.
      const merged = mergeDB(getDB(), remote.data, remoteWins(getDB(), remote.data))
      applyingRemote = true
      hydrate(merged)
      applyingRemote = false
      await push(userId, merged)
    } else {
      await push(userId, getDB())
    }
    set({ busy: false })
  } catch (e) {
    set({ busy: false, error: (e as Error).message })
    return
  }

  if (!channelBound) {
    channelBound = true
    // Another device saved — take it without waiting for a reload.
    sb
      .channel('mycal')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE, filter: `user_id=eq.${userId}` },
        (payload) => {
          const next = (payload.new as { data?: DB } | null)?.data
          if (!next) return
          const body = JSON.stringify(next)
          if (body === lastPushed) return // our own write echoing back
          applyingRemote = true
          hydrate(mergeDB(getDB(), next, remoteWins(getDB(), next)))
          applyingRemote = false
          lastPushed = JSON.stringify(getDB())
          set({ lastSync: Date.now() })
        },
      )
      .subscribe()

    subscribe(() => {
      if (applyingRemote) return
      const body = JSON.stringify(getDB())
      if (body === lastPushed) return
      if (pushTimer) clearTimeout(pushTimer)
      // Debounced: typing a note shouldn't be one request per keystroke.
      pushTimer = setTimeout(() => {
        push(userId, getDB()).catch((e) => set({ error: (e as Error).message }))
      }, 1500)
    })
  }
}

// ---------------------------------------------------------------- session

export async function initSync() {
  const sb = await client()
  if (!sb) return
  const { data } = await sb.auth.getSession()
  if (data.session) await startSync(data.session)
  sb.auth.onAuthStateChange((_e, session) => {
    if (session) void startSync(session)
    else set({ kind: 'signed-out' })
  })
}

export async function signIn(email: string) {
  const sb = await client()
  if (!sb) throw new Error('Sync is not configured')
  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.href },
  })
  if (error) throw error
}

export async function signOut() {
  const sb = await client()
  await sb?.auth.signOut()
  lastPushed = ''
  set({ kind: 'signed-out' })
}
