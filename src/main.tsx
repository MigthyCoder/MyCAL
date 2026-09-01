import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './styles.css'
import { initSync } from './lib/sync'

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
