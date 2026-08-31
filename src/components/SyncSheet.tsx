import { useState, useSyncExternalStore } from 'react'
import {
  SYNC_CONFIGURED,
  getSyncState,
  onSyncChange,
  signIn,
  signOut,
  type SyncState,
} from '../lib/sync'
import { Sheet } from './ui'

export function useSync(): SyncState {
  return useSyncExternalStore(onSyncChange, getSyncState, getSyncState)
}

function ago(t: number | null) {
  if (!t) return 'just now'
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)}m ago`
  return `${Math.round(s / 3600)}h ago`
}

export function SyncButton({ onOpen }: { onOpen: () => void }) {
  const sync = useSync()
  if (!SYNC_CONFIGURED) return null
  const ready = sync.kind === 'ready'
  return (
    <button
      className={`btn ghost syncbtn ${ready ? (sync.error ? 'bad' : 'on') : ''}`}
      onClick={onOpen}
      title={ready ? `Synced ${ago(sync.lastSync)}` : 'Sync across devices'}
    >
      <i />
      {ready ? (sync.busy ? 'Syncing' : 'Synced') : 'Sync'}
    </button>
  )
}

export function SyncSheet({ onClose }: { onClose: () => void }) {
  const sync = useSync()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (!email.trim()) return
    setBusy(true)
    setErr(null)
    try {
      await signIn(email.trim())
      setSent(true)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet onClose={onClose}>
      <h3>Sync</h3>
      <div className="meta">One calendar on your laptop and your phone.</div>

      {sync.kind === 'ready' ? (
        <>
          <div className="note">
            <span className="k">Signed in</span>
            {sync.email}
            <br />
            {sync.error ? `Last error: ${sync.error}` : `Last synced ${ago(sync.lastSync)}`}
          </div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 14, lineHeight: 1.55 }}>
            Changes push a second or two after you make them, and land on your other
            device without a reload. Blocks added on both devices are kept — only
            editing the same block in both places picks a winner.
          </div>
          <div className="actions">
            <button className="btn danger" onClick={() => { void signOut(); onClose() }}>
              Sign out
            </button>
            <div className="spacer" />
            <button className="btn solid" onClick={onClose}>Done</button>
          </div>
        </>
      ) : sent ? (
        <>
          <div className="note">
            <span className="k">Check your email</span>
            A sign-in link is on its way to {email}. Open it on this device.
          </div>
          <div className="actions">
            <div className="spacer" />
            <button className="btn ghost" onClick={() => setSent(false)}>Use another email</button>
            <button className="btn solid" onClick={onClose}>Done</button>
          </div>
        </>
      ) : (
        <>
          <h4>Email</h4>
          <input
            className="field"
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            onKeyDown={(e) => { if (e.key === 'Enter') void send() }}
          />
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.55 }}>
            No password — you get a link by email. Sign in on both devices with the
            same address and they become the same calendar. What's already on this
            device is kept and merged in.
          </div>
          {err && (
            <div className="note" style={{ marginTop: 12, borderLeftColor: '#ff8f8f', color: '#ff8f8f' }}>
              {err}
            </div>
          )}
          <div className="actions">
            <div className="spacer" />
            <button className="btn ghost" onClick={onClose}>Cancel</button>
            <button className="btn solid" onClick={() => void send()} disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Send me a link'}
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}
