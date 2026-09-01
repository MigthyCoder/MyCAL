import type { SupabaseClient, Session } from '@supabase/supabase-js'
import type { DB } from './types'
import { getDB, hydrate, subscribe } from './store'
import { mergeDB, remoteWins } from './merge'

export { mergeDB, remoteWins } from './merge'

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
    options: { emailRedirectTo: window.location.href, shouldCreateUser: true },
  })
  if (error) throw error
}

/**
 * Typing a code beats tapping a link on a phone. An installed home-screen app
 * has its own storage, and a link in Mail always opens the browser instead — so
 * the link signs in the browser and leaves the app you're holding logged out.
 * A code goes wherever you type it.
 */
export async function verifyCode(email: string, token: string) {
  const sb = await client()
  if (!sb) throw new Error('Sync is not configured')
  const { error } = await sb.auth.verifyOtp({
    email,
    token: token.replace(/\D/g, ''),
    type: 'email',
  })
  if (error) throw error
}

export async function signOut() {
  const sb = await client()
  await sb?.auth.signOut()
  lastPushed = ''
  set({ kind: 'signed-out' })
}
