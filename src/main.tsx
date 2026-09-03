import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { initSync } from './lib/sync'
import { initTheme } from './lib/theme'

// The inline script in index.html already set the attribute; this takes over
// so a mid-session OS appearance change is followed too.
initTheme()

void initSync()

// A new deploy takes over as soon as it's downloaded, but the page you're
// looking at was rendered by the old one. Reload once when that handover
// happens so you never have to think about it.
if ('serviceWorker' in navigator) {
  // Null on a first-ever visit, where the handover isn't an update and there's
  // nothing stale to replace.
  const hadController = Boolean(navigator.serviceWorker.controller)
  let reloading = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloading) return
    reloading = true
    location.reload()
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
