import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'

const app = mount(App, {
  target: document.getElementById('app')!,
})

// Offline support. Only in production builds served over http(s); the dev server and file:// skip it.
if (import.meta.env.PROD && 'serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(err => console.warn('Service worker failed to register', err))
  })
}
// Ask the browser not to clear the saved career when storage runs low.
navigator.storage?.persist?.().catch(() => {})

export default app
