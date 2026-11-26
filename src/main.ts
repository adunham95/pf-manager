import { mount } from 'svelte'
import './app.css'
import Root from './Root.svelte'
import { showStartupError } from './lib/reset'

const target = document.getElementById('app')!
let app: ReturnType<typeof mount> | undefined
try {
  app = mount(Root, { target })
  ;(window as any).__pfmReady = true
} catch (err) {
  console.error('Pixel Football failed to start:', err)
  showStartupError(target, err)
  ;(window as any).__pfmReady = true
}

// Offline support. Only in production builds served over http(s); the dev server and file:// skip it.
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker failed to register', err))
  })
}
// Ask the browser not to clear the saved career when storage runs low.
navigator.storage?.persist?.().catch(() => {})

export default app
