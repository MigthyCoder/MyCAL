import { useState, useSyncExternalStore } from 'react'
import {
  SYNC_CONFIGURED,
  getSyncState,
  onSyncChange,
  createAccount,
  signIn,
  signInWithPassword,
  setPassword as saveAccountPassword,
  sendPasswordReset,
  signOut,
  verifyCode,
  type SyncState,
} from '../lib/sync'
import { Sheet } from './ui'
import { exportJSON, importJSON } from '../lib/store'

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
  const ready = sync.kind === 'ready'
  // Always rendered: even with sync switched off this is the way to get a copy
  // of your calendar out of one browser and into another.
  return (
    <button
      className={`btn ghost syncbtn ${ready ? (sync.error ? 'bad' : 'on') : ''}`}
      onClick={onOpen}
      title={ready ? `Synced ${ago(sync.lastSync)}` : 'Sync and transfer'}
    >
      <i />
      {!SYNC_CONFIGURED ? 'Data' : ready ? (sync.busy ? 'Syncing' : 'Synced') : 'Sync'}
    </button>
  )
}

export function SyncSheet({ onClose }: { onClose: () => void }) {
  const sync = useSync()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [needsAccount, setNeedsAccount] = useState(false)
  const [emailMode, setEmailMode] = useState(false)
  const [newPw, setNewPw] = useState('')
  const [pwSaved, setPwSaved] = useState(false)
  const [resetSent, setResetSent] = useState(false)

  const forgot = async () => {
    if (!email.trim()) { setErr('Put your email in first.'); return }
    setBusy(true)
    setErr(null)
    try {
      await sendPasswordReset(email)
      setResetSent(true)
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const savePassword = async () => {
    if (newPw.length < 6) return
    setBusy(true)
    setErr(null)
    try {
      await saveAccountPassword(newPw)
      setPwSaved(true)
      setNewPw('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const [sent, setSent] = useState(false)
  const [code, setCode] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const send = async () => {
    if (!email.trim()) return
    setBusy(true)
    setErr(null)
    try {
      await signIn(email.trim())
      setSent(true)
      setCode('')
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const [copied, setCopied] = useState(false)
  const [paste, setPaste] = useState('')
  const [showImport, setShowImport] = useState(false)
  const [transferErr, setTransferErr] = useState<string | null>(null)

  const doCopy = async () => {
    try {
      await navigator.clipboard.writeText(exportJSON())
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      setTransferErr('Clipboard blocked — use Download instead.')
    }
  }

  const doDownload = () => {
    const url = URL.createObjectURL(new Blob([exportJSON()], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'mycal-backup.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const doImport = () => {
    try {
      importJSON(paste)
      setTransferErr(null)
      onClose()
    } catch (e) {
      setTransferErr((e as Error).message)
    }
  }

  const looksLikeLink = /^https?:\/\//i.test(code.trim())
  const canVerify = looksLikeLink || code.replace(/\D/g, '').length >= 6

  const submitPassword = async (create: boolean) => {
    if (!email.trim() || password.length < 6) return
    setBusy(true)
    setErr(null)
    try {
      if (create) await createAccount(email, password)
      else await signInWithPassword(email, password)
      onClose()
    } catch (e) {
      const msg = (e as Error).message
      // Supabase says the same thing for a wrong password and no account at all.
      if (/invalid login credentials/i.test(msg)) {
        setNeedsAccount(true)
        setErr("No account with that email, or the password is wrong.")
      } else {
        setErr(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  const verify = async () => {
    if (!canVerify) return
    setBusy(true)
    setErr(null)
    try {
      await verifyCode(email.trim(), code)
      onClose()
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const transfer = (
    <>
      <h4>Move this calendar somewhere else</h4>
      <div className="row wrap" style={{ gap: 6 }}>
        <button className="btn ghost" onClick={() => void doCopy()}>
          {copied ? 'Copied ✓' : 'Copy everything'}
        </button>
        <button className="btn ghost" onClick={doDownload}>Download file</button>
        <button className="btn ghost" onClick={() => setShowImport((v) => !v)}>
          Paste from another browser
        </button>
      </div>
      {showImport && (
        <>
          <textarea
            className="field"
            style={{ marginTop: 8, minHeight: 90, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            placeholder='Paste the copied text here, then hit Load'
          />
          <div className="row" style={{ marginTop: 6 }}>
            <button className="btn solid sm" onClick={doImport} disabled={!paste.trim()}>
              Load it
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
              Replaces what's in this browser.
            </span>
          </div>
        </>
      )}
      {transferErr && (
        <div className="note" style={{ marginTop: 10, borderLeftColor: '#ff8f8f', color: '#ff8f8f' }}>
          {transferErr}
        </div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.55 }}>
        Browser storage never crosses between two addresses — localhost and the
        live site are separate boxes. This is how you get from one to the other.
      </div>
    </>
  )

  return (
    <Sheet onClose={onClose}>
      <h3>{SYNC_CONFIGURED ? 'Sync' : 'Your data'}</h3>
      <div className="meta">
        {SYNC_CONFIGURED
          ? 'One calendar on your laptop and your phone.'
          : 'Sync is off in this build — you can still move your calendar by hand.'}
      </div>

      {sync.kind === 'ready' ? (
        <>
          <div className="note">
            <span className="k">Signed in</span>
            {sync.email}
            <br />
            {sync.error ? `Last error: ${sync.error}` : `Last synced ${ago(sync.lastSync)}`}
          </div>
          <h4>Password for your other devices</h4>
          {pwSaved ? (
            <div className="note" style={{ borderLeftColor: 'var(--ok)' }}>
              <span className="k">Saved</span>
              Sign in on your phone with <strong>{sync.email}</strong> and this password.
            </div>
          ) : (
            <>
              <div className="row">
                <input
                  className="field grow"
                  type="password"
                  autoComplete="new-password"
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  placeholder="At least 6 characters"
                  onKeyDown={(e) => { if (e.key === 'Enter') void savePassword() }}
                />
                <button
                  className="btn solid"
                  onClick={() => void savePassword()}
                  disabled={busy || newPw.length < 6}
                >
                  {busy ? 'Saving…' : 'Set it'}
                </button>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.55 }}>
                If you signed in here with an emailed link, this account has no
                password yet — so there's nothing for your phone to sign in with.
                Set one here and use it there.
              </div>
            </>
          )}
          {err && (
            <div className="note" style={{ marginTop: 12, borderLeftColor: '#ff8f8f', color: '#ff8f8f' }}>
              {err}
            </div>
          )}

          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 14, lineHeight: 1.55 }}>
            Changes push a second or two after you make them, and land on your other
            device without a reload. Blocks added on both devices are kept — only
            editing the same block in both places picks a winner.
          </div>
          {transfer}
          <div className="actions">
            <button className="btn danger" onClick={() => { void signOut(); onClose() }}>
              Sign out
            </button>
            <div className="spacer" />
            <button className="btn solid" onClick={onClose}>Done</button>
          </div>
        </>
      ) : !SYNC_CONFIGURED ? (
        <>
          {transfer}
          <div className="actions">
            <div className="spacer" />
            <button className="btn solid" onClick={onClose}>Done</button>
          </div>
        </>
      ) : sent ? (
        <>
          <h4>{looksLikeLink ? 'Sign-in link' : 'Code from your email'}</h4>
          <input
            className={`field ${looksLikeLink ? 'linkfield' : 'codefield'}`}
            autoFocus
            value={code}
            onChange={(e) => {
              const v = e.target.value
              // Accepts either credential, so keep a pasted URL intact.
              setCode(/^https?:/i.test(v.trim()) ? v.trim() : v.replace(/\D/g, '').slice(0, 6))
            }}
            placeholder="000000"
            inputMode={looksLikeLink ? 'url' : 'numeric'}
            autoComplete="one-time-code"
            onKeyDown={(e) => { if (e.key === 'Enter') void verify() }}
          />
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.55 }}>
            Sent to {email}. <strong>If the email only has a button or a link</strong>,
            press and hold it, choose <strong>Copy Link</strong>, and paste it in
            here — that works exactly the same. Don't just tap it: on a phone it
            opens your browser, which signs the browser in and leaves this app
            logged out.
          </div>
          {err && (
            <div className="note" style={{ marginTop: 12, borderLeftColor: '#ff8f8f', color: '#ff8f8f' }}>
              {err}
            </div>
          )}
          <div className="actions">
            <button className="btn ghost" onClick={() => { setSent(false); setErr(null) }}>
              Back
            </button>
            <div className="spacer" />
            <button
              className="btn solid"
              onClick={() => void verify()}
              disabled={busy || !canVerify}
            >
              {busy ? 'Checking…' : 'Sign in'}
            </button>
          </div>
        </>
      ) : emailMode ? (
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
            You'll get a code or a link. Note that a link is single-use — if your
            browser opened it already, it won't work when you paste it.
          </div>
          {err && (
            <div className="note" style={{ marginTop: 12, borderLeftColor: '#ff8f8f', color: '#ff8f8f' }}>
              {err}
            </div>
          )}
          <div className="actions">
            <button className="btn ghost" onClick={() => { setEmailMode(false); setErr(null) }}>
              Use a password
            </button>
            <div className="spacer" />
            <button className="btn solid" onClick={() => void send()} disabled={busy || !email.trim()}>
              {busy ? 'Sending…' : 'Send it'}
            </button>
          </div>
        </>
      ) : (
        <>
          <h4>Email</h4>
          <input
            className="field"
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(e) => { setEmail(e.target.value); setNeedsAccount(false) }}
            placeholder="you@example.com"
          />
          <h4>Password</h4>
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => { setPassword(e.target.value); setNeedsAccount(false) }}
            placeholder="At least 6 characters"
            onKeyDown={(e) => { if (e.key === 'Enter') void submitPassword(needsAccount) }}
          />
          <div style={{ fontSize: 12.5, color: 'var(--text-3)', marginTop: 8, lineHeight: 1.55 }}>
            Same email and password on your laptop and your phone and they're the
            same calendar. No emailed links to chase — those are single-use and
            open the wrong app on a phone.
          </div>
          {resetSent && (
            <div className="note" style={{ marginTop: 12, borderLeftColor: 'var(--ok)' }}>
              <span className="k">Reset sent</span>
              Open the link from {email} <strong>on this device</strong>. It signs you
              in, then set a new password from this same panel.
            </div>
          )}
          {err && (
            <div className="note" style={{ marginTop: 12, borderLeftColor: '#ff8f8f', color: '#ff8f8f' }}>
              {err}
            </div>
          )}
          <button
            className="btn ghost sm"
            style={{ marginTop: 10 }}
            onClick={() => void forgot()}
            disabled={busy}
          >
            Forgot the password?
          </button>
          {transfer}
          <div className="actions">
            <button className="btn ghost sm" onClick={() => { setEmailMode(true); setErr(null) }}>
              Email me a code instead
            </button>
            <div className="spacer" />
            {needsAccount ? (
              <button
                className="btn solid"
                onClick={() => void submitPassword(true)}
                disabled={busy || password.length < 6}
              >
                {busy ? 'Creating…' : 'Create account'}
              </button>
            ) : (
              <button
                className="btn solid"
                onClick={() => void submitPassword(false)}
                disabled={busy || !email.trim() || password.length < 6}
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            )}
          </div>
        </>
      )}
    </Sheet>
  )
}
