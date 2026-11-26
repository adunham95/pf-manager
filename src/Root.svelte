<script lang="ts">
  // Wraps the app so any error while loading or drawing it shows a recovery screen instead of a blank page.
  import App from './App.svelte'
  import { rawSave, wipeEverything } from './lib/reset'

  let armed = $state(false)
  let copyLabel = $state('Copy save')
  let wiping = $state(false)

  async function copy() {
    try { await navigator.clipboard.writeText(rawSave()); copyLabel = 'Save copied' } catch { copyLabel = 'Copy blocked by the browser' }
  }
  function startOver() {
    if (!armed) { armed = true; return }
    wiping = true
    wipeEverything()
  }
  const message = (e: unknown) => e instanceof Error ? e.message : String(e)
</script>

<svelte:boundary onerror={(e) => console.error('Pixel Football crashed:', e)}>
  <App />

  {#snippet failed(error, reset)}
    <main class="crash">
      <div class="crash-card">
        <div class="brand">PIXEL <b>FOOTBALL</b></div>
        <h1>Something went wrong</h1>
        <p>The game hit an error. Try again first. If it keeps happening, start over: that erases everything this game has stored in your browser, including your career, so copy your save first if you want to keep it.</p>
        <details><summary>Error details</summary><pre>{message(error)}</pre></details>
        <div class="crash-actions">
          <button class="btn primary" onclick={reset}>Try again</button>
          <button class="btn" onclick={copy}>{copyLabel}</button>
          <button class="btn danger" onclick={startOver} disabled={wiping}>{wiping ? 'Clearing…' : armed ? 'Click again to erase everything' : 'Start over'}</button>
        </div>
      </div>
    </main>
  {/snippet}
</svelte:boundary>
