<script lang="ts">
  // A pared-down live view of your game: the field, the ball moving drive by drive, and a running feed.
  // The game is already decided when this opens; it only replays the drive log at watchable speed.
  import { onDestroy } from 'svelte'
  import type { Game, Team, Drive, DriveEnd } from './lib/game'

  let { game, home, away, user, label, onDone }: {
    game: Game; home: Team; away: Team; user: number; label: string; onDone: () => void
  } = $props()

  const log: Drive[] = $derived(game.log ?? [])
  const teams = $derived([home, away])
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches

  let idx = $state(-1)          // drive on the field
  let shown = $state(0)         // drives finished (in the score and feed)
  let yd = $state(25)           // ball spot, yards from the offense's goal line
  let from = $state(25)         // where this drive started
  let flash = $state<{ text: string; kind: DriveEnd | 'half'; side: 0 | 1 } | null>(null)
  let speed = $state(1)
  let paused = $state(false)
  let done = $state(false)
  let stopped = false
  let timer: ReturnType<typeof setTimeout> | undefined

  const cur = $derived(idx >= 0 ? log[idx] : null)
  const score = $derived(shown ? log[shown - 1].score : [0, 0])
  const quarter = $derived(done ? 'Final' : cur ? (cur.q > 4 ? 'OT' : `Q${cur.q}`) : 'Q1')
  /** Field position on screen: home attacks left to right, away right to left. */
  const screenX = (side: 0 | 1, y: number) => side === 0 ? y : 100 - y
  const ballX = $derived(cur ? screenX(cur.side, yd) : 50)
  const fromX = $derived(cur ? screenX(cur.side, from) : 50)
  const myWin = $derived(home.id === user ? (game.hs ?? 0) > (game.as ?? 0) : (game.as ?? 0) > (game.hs ?? 0))

  const RESULT: Record<DriveEnd, string> = { td: 'TOUCHDOWN', fg: 'FIELD GOAL', miss: 'NO GOOD', punt: 'PUNT', turnover: 'TURNOVER', downs: 'ON DOWNS' }
  const spot = (d: Drive, y: number) => {
    const off = teams[d.side], def = teams[1 - d.side]
    return y === 50 ? 'midfield' : y < 50 ? `${off.abbr} ${y}` : `${def.abbr} ${100 - y}`
  }

  /** Waits in small ticks so speed changes and pauses take effect right away. */
  function wait(ms: number) {
    return new Promise<void>(res => {
      let left = ms
      const tick = () => {
        if (stopped) return
        if (!paused) left -= 50 * speed
        if (left <= 0) res(); else timer = setTimeout(tick, 50)
      }
      timer = setTimeout(tick, 50)
    })
  }
  /** Splits a drive into a few visible hops, ending exactly at the drive's end. */
  function hops(d: Drive) {
    const n = Math.max(2, Math.min(6, Math.round(d.plays / 2)))
    const out: number[] = []
    for (let i = 1; i <= n; i++) {
      const t = i / n, wobble = i < n ? (Math.random() - 0.4) * 6 : 0
      out.push(Math.round(Math.max(1, Math.min(99, d.start + (d.end - d.start) * t + wobble))))
    }
    out[n - 1] = Math.min(d.end, 100)
    return out
  }

  async function run() {
    for (let i = 0; i < log.length; i++) {
      if (stopped) return
      const d = log[i]
      if (i > 0 && log[i - 1].q === 2 && d.q === 3) {
        flash = { text: 'HALFTIME', kind: 'half', side: d.side }
        await wait(1300)
      }
      flash = null
      idx = i; from = d.start; yd = d.start
      await wait(650)
      for (const y of hops(d)) { yd = y; await wait(380) }
      flash = { text: RESULT[d.result], kind: d.result, side: d.side }
      shown = i + 1
      await wait(d.pts ? 1500 : 1000)
    }
    finish()
  }
  function finish() {
    stopped = true; clearTimeout(timer)
    shown = log.length; idx = -1; flash = null; done = true
  }
  run()
  onDestroy(() => { stopped = true; clearTimeout(timer) })

  const feed = $derived(log.slice(0, shown).map((d, i) => ({ d, i })).reverse())
</script>

<div class="modal" role="dialog" aria-modal="true" aria-label="Gamecast">
  <div class="card gamecast" style="--hc:{home.color}; --ac:{away.color}; --hop:{reduced ? 0 : Math.round(340 / speed)}ms">
    <div class="eyebrow">{label}</div>

    <div class="gc-board">
      {#each teams as t, side}
        <div class="gc-team" class:me={t.id === user} class:poss={!done && cur?.side === side}>
          <span class="badge md" style="--c:{t.color}">{t.abbr}</span>
          <span class="gc-name">{t.school}</span>
          <b class="gc-pts">{score[side]}</b>
        </div>
        {#if side === 0}<div class="gc-q">{quarter}</div>{/if}
      {/each}
    </div>

    <div class="gc-field" aria-hidden="true">
      <div class="gc-ez" style="--c:{home.color}">{home.abbr}</div>
      <div class="gc-turf">
        {#each [10, 20, 30, 40, 50, 60, 70, 80, 90] as y}<span class="gc-num" style="left:{y}%">{y <= 50 ? y : 100 - y}</span>{/each}
        {#if cur}
          <span class="gc-los" style="left:{fromX}%"></span>
          <span class="gc-run" style="left:{Math.min(fromX, ballX)}%; width:{Math.abs(ballX - fromX)}%; --c:{teams[cur.side].color}"></span>
          <span class="gc-ball" style="left:{ballX}%">🏈</span>
        {/if}
        {#if flash}
          {#key flash}
            <div class="gc-flash {flash.kind}" style="--c:{flash.kind === 'half' ? '#1f2a44' : teams[flash.side].color}">{flash.text}</div>
          {/key}
        {/if}
        {#if done}<div class="gc-flash final" class:win={myWin}>FINAL</div>{/if}
      </div>
      <div class="gc-ez" style="--c:{away.color}">{away.abbr}</div>
    </div>

    <p class="gc-now" aria-live="polite">
      {#if done}
        {@const mine = home.id === user ? [game.hs, game.as] : [game.as, game.hs]}
        {myWin ? 'Win' : 'Loss'}, {mine[0]}-{mine[1]}.
      {:else if cur && flash && flash.kind !== 'half'}
        <b>{cur.text}.</b> <span class="muted">{cur.plays} plays, {cur.end - cur.start} yds</span>
      {:else if cur}
        <b>{teams[cur.side].abbr} ball</b> <span class="muted">at the {spot(cur, yd)}</span>
      {:else}
        <span class="muted">Kickoff…</span>
      {/if}
    </p>

    <ol class="gc-feed">
      {#each feed as { d, i } (i)}
        <li class:scored={d.pts > 0} class:mine={teams[d.side].id === user}>
          <span class="dq">{d.q > 4 ? 'OT' : `Q${d.q}`}</span>
          <span class="dteam" style="--c:{teams[d.side].color}">{teams[d.side].abbr}</span>
          <span class="grow">{d.text}</span>
          <span class="dscore">{d.score[0]}-{d.score[1]}</span>
        </li>
      {/each}
    </ol>

    {#if done}
      <button class="btn primary block" onclick={onDone}>See the recap</button>
    {:else}
      <div class="gc-controls">
        <button class="btn" onclick={() => (paused = !paused)} aria-pressed={paused}>{paused ? '▶ Resume' : '❚❚ Pause'}</button>
        <div class="seg gc-speed" role="group" aria-label="Speed">
          {#each [1, 2, 4] as v}<button class:on={speed === v} onclick={() => (speed = v)}>{v}×</button>{/each}
        </div>
        <button class="btn" onclick={finish}>Skip to final</button>
      </div>
    {/if}
  </div>
</div>
