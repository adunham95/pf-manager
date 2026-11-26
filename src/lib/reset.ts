// Saving and the emergency reset. Kept apart from the Svelte app so it still works when the app can't start.

export const SAVE_KEY = 'pixel-football-manager-v2'

/** The raw save text, for copying out before a reset. */
export function rawSave() {
  try { return localStorage.getItem(SAVE_KEY) ?? '' } catch { return '' }
}

/**
 * Clears everything the app stores in this browser, then reloads:
 * local and session storage (save and settings), offline caches and the service worker.
 */
export async function wipeEverything() {
  try { localStorage.clear() } catch { /* storage blocked */ }
  try { sessionStorage.clear() } catch { /* storage blocked */ }
  try {
    if ('caches' in window) for (const k of await caches.keys()) await caches.delete(k)
  } catch { /* no cache access */ }
  try {
    if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister()
  } catch { /* no service worker access */ }
  location.reload()
}

/**
 * Plain HTML recovery screen for when the app can't even start (no Svelte involved).
 * Same choices as the in-app one: reload, copy the save, or wipe everything.
 */
export function showStartupError(target: HTMLElement, err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  target.innerHTML = `
    <main class="crash">
      <div class="crash-card">
        <div class="brand">PIXEL <b>FOOTBALL</b></div>
        <h1>The game couldn't load</h1>
        <p>Something went wrong starting up. Reloading often fixes it. If not, start over: that clears everything this game has stored in your browser.</p>
        <details><summary>Error details</summary><pre></pre></details>
        <div class="crash-actions">
          <button class="btn" data-act="reload">Reload</button>
          <button class="btn" data-act="copy">Copy save</button>
          <button class="btn danger" data-act="wipe">Start over</button>
        </div>
      </div>
    </main>`
  target.querySelector('pre')!.textContent = msg
  let armed = false
  target.querySelector<HTMLButtonElement>('[data-act="reload"]')!.onclick = () => location.reload()
  target.querySelector<HTMLButtonElement>('[data-act="copy"]')!.onclick = async (e) => {
    const b = e.currentTarget as HTMLButtonElement
    try { await navigator.clipboard.writeText(rawSave()); b.textContent = 'Save copied' } catch { b.textContent = 'Copy blocked' }
  }
  target.querySelector<HTMLButtonElement>('[data-act="wipe"]')!.onclick = (e) => {
    const b = e.currentTarget as HTMLButtonElement
    if (!armed) { armed = true; b.textContent = 'Click again to erase everything'; return }
    wipeEverything()
  }
}
