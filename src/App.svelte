<script lang="ts">
  import * as G from './lib/game'
  import { SAVE_KEY } from './lib/reset'
  import type { State, Recruit, Pos, Player, Game, PortalEntry, Lean } from './lib/game'

  const KEY = SAVE_KEY
  /** Reads the saved career. A damaged save throws, so the recovery screen in Root.svelte shows instead of a blank page. */
  function load(): State | null {
    let raw: string | null = null
    try { raw = localStorage.getItem(KEY) } catch { return null }
    if (!raw) return null
    let s: any
    try { s = JSON.parse(raw) } catch { throw new Error('Your saved career is damaged and can\'t be read.') }
    if (!s || !Array.isArray(s.teams) || !Array.isArray(s.schedule) || typeof s.user !== 'number' || !s.teams[s.user])
      throw new Error('Your saved career is missing data and can\'t be loaded.')
    return s as State
  }
  let g = $state<State | null>(load())
  type Tab = 'team' | 'recruits' | 'portal' | 'program' | 'schedule' | 'postseason' | 'league' | 'history' | 'settings'
  let tab = $state<Tab>('team')
  let toast = $state('')
  let posFilter = $state<'ALL' | Pos>('ALL')
  let starFilter = $state(0)
  type RView = 'board' | 'open' | 'all'
  type RSort = 'stars' | 'ovr' | 'race' | 'need'
  let rView = $state<RView>('open')
  let rSort = $state<RSort>('stars')
  let selId = $state<number | null>(null)
  let swapFrom = $state<number | null>(null)
  let playerSel = $state<number | null>(null)
  let releaseId = $state<number | null>(null)
  let walkPos = $state<Pos>('QB')
  let confirmReset = $state(false)

  // theme
  const THEME_KEY = 'pixel-football-theme'
  let theme = $state<'system' | 'light' | 'dark'>((() => { try { return (localStorage.getItem(THEME_KEY) as any) || 'system' } catch { return 'system' } })())
  $effect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme; else root.dataset.theme = theme
    try { localStorage.setItem(THEME_KEY, theme) } catch {}
  })

  // install as an app (PWA)
  type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
  let installEvt = $state<InstallPrompt | null>(null)
  const standalone = typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true)
  let installed = $state(standalone)
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent)
  $effect(() => {
    const onPrompt = (e: Event) => { e.preventDefault(); installEvt = e as InstallPrompt }
    const onInstalled = () => { installed = true; installEvt = null }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  })
  async function install() {
    if (!installEvt) return
    await installEvt.prompt()
    const { outcome } = await installEvt.userChoice
    installEvt = null
    if (outcome === 'accepted') flash('Installed. Find Pixel Football on your home screen.')
  }

  // team editor
  let editId = $state<number | null>(null)
  let draft = $state({ school: '', mascot: '', abbr: '', color: '#000000' })
  let editErr = $state('')
  let swapWith = $state<number>(-1)
  function openEdit(id: number) {
    const t = G.team(g!, id)
    draft = { school: t.school, mascot: t.mascot, abbr: t.abbr, color: t.color }
    editErr = ''; swapWith = -1; editId = id
  }
  function saveEdit() {
    const err = G.editTeam(g!, editId!, { ...draft })
    if (err) { editErr = err; return }
    editId = null; flash('Team saved.')
  }
  function doRealign() {
    if (swapWith < 0) return
    const err = G.swapConference(g!, editId!, swapWith)
    if (err) editErr = err; else { swapWith = -1; flash('Conferences updated. Schedule rebuilt.') }
  }

  // saves
  let pasteText = $state('')
  async function copySave() {
    try { await navigator.clipboard.writeText(JSON.stringify($state.snapshot(g))); flash('Save copied. Paste it somewhere safe.') }
    catch { flash('Copy was blocked by the browser.') }
  }
  function loadSave() {
    const r = G.parseSave(pasteText)
    if (typeof r === 'string') { flash(r); return }
    g = r; pasteText = ''; tab = 'team'; flash('Save loaded.')
  }

  $effect(() => {
    if (!g) return
    const snap = $state.snapshot(g)
    try { localStorage.setItem(KEY, JSON.stringify(snap)) } catch {}
  })

  function flash(m: string) { if (!m) return; toast = m; setTimeout(() => { if (toast === m) toast = '' }, 2200) }
  function start(i: number) { g = G.newGame(i); tab = 'team' }
  function reset() {
    if (!confirmReset) { confirmReset = true; setTimeout(() => (confirmReset = false), 3000); return }
    try { localStorage.removeItem(KEY) } catch {}
    confirmReset = false; g = null
  }

  const me = $derived(g ? g.teams[g.user] : null)
  const next = $derived(g ? G.userNextGame(g) : undefined)
  const opp = $derived(g && next ? G.team(g, next.home === g.user ? next.away : next.home) : null)
  const needs = $derived(g ? G.rosterNeeds(g) : null)
  const ranks = $derived(g ? G.rankings(g) : [])
  const rankOf = $derived(new Map(ranks.map(r => [r.team.id, r.rank])))
  const confRanks = $derived(g ? G.confRankings(g) : [])
  const pollWeek = $derived(g ? G.lastPlayedWeek(g) : 0)
  const pollTitle = $derived(!g ? '' : pollWeek === 0 ? 'Preseason poll' : g.phase === 'offseason' ? 'Final poll' : `Poll after week ${pollWeek}`)
  let showAllRanks = $state(false)
  /** "#7 " for ranked teams, "" for unranked teams and cupcakes. */
  const rk = (id: number) => { const n = rankOf.get(id); return n && n <= G.TOP_N ? `#${n} ` : '' }
  const d = $derived(me ? G.depth(me) : null)
  const myR = $derived(me && g ? G.teamRatings(me, next ? g.rotation : 0) : null)
  const oppR = $derived(opp ? G.teamRatings(opp, 0) : null)
  const bigGame = $derived(!!next && G.isPostseason(next.type))
  const boostOf = (t: G.Team) => { const b = G.gameDayBoost(g!, t, bigGame); return (b.off + b.def) / 2 }
  const myOvr = $derived(me && myR ? myR.ovr + boostOf(me) : 0)
  const oppOvr = $derived(opp && oppR ? oppR.ovr + boostOf(opp) : 0)
  const plan = $derived(g?.plan ?? G.DEFAULT_PLAN)
  const scout = $derived(opp ? G.scouting(opp) : null)
  // The game plan is left out on purpose, so picking one is a read on the opponent, not a number to max.
  const site = $derived<'home' | 'away' | 'neutral'>(!next || !g ? 'neutral' : G.isNeutral(next) ? 'neutral' : next.home === g.user ? 'home' : 'away')
  const spot = $derived(g && g.phase === 'season' ? G.spotlightGame(g) : undefined)
  const sameGame = (a?: Game, b?: Game) => !!a && !!b && a.week === b.week && a.home === b.home && a.away === b.away
  const mySpot = $derived(sameGame(spot, next))
  const weather = $derived(g && next ? G.weatherOf(g, next) : null)
  const fans = $derived(g ? G.fansOf(g) : 50)
  const homeRating = $derived(next && g && site !== 'neutral' ? G.homeEdgeRating(g, next.home, mySpot) : 0)
  const prob = $derived(myR && oppR ? G.winProb(myOvr + (site === 'home' ? homeRating : site === 'away' ? -homeRating : 0), oppOvr) : 0.5)
  const SITE_LABEL = { home: 'Home', away: 'Away', neutral: 'Neutral site' }
  const siteOf = (gm: Game): 'home' | 'away' | 'neutral' => G.isNeutral(gm) ? 'neutral' : gm.home === g!.user ? 'home' : 'away'
  const siteCount = $derived.by(() => {
    const c = { home: 0, away: 0, neutral: 0 }
    if (g) for (const x of g.schedule) if (x.home === g.user || x.away === g.user) c[siteOf(x)]++
    return c
  })
  function setPlan(k: 'off' | 'def', v: Lean) { if (g) g.plan = { ...(g.plan ?? G.DEFAULT_PLAN), [k]: v } }
  const offText = (x: number) => `${Math.round(x * 100)}% run · ${Math.round((1 - x) * 100)}% pass`
  const defText = (x: number) => x >= 0.7 ? 'Selling out to stop the run' : x >= 0.58 ? 'Leaning against the run'
    : x <= 0.3 ? 'Selling out to stop the pass' : x <= 0.42 ? 'Leaning against the pass' : 'Balanced'
  let showDrives = $state(false)
  let viewGame = $state<Game | null>(null)
  function lineScore(gm: Game) {
    const qs = Math.max(4, ...(gm.log ?? []).map(d => d.q))
    const rows: number[][] = [Array(qs).fill(0), Array(qs).fill(0)]
    for (const d of gm.log ?? []) rows[d.side][d.q - 1] += d.pts
    return { qs, rows }
  }
  /** Team stats for the box score, read from the drive log. Index 0 is the home team. */
  function teamStats(gm: Game) {
    const z = () => ({ td: 0, fg: 0, drives: 0, scoring: 0, sacks: 0, turnovers: 0, missed: 0 })
    const st = [z(), z()]
    for (const d of gm.log ?? []) {
      if (d.q > 4) { if (d.pts === 7) st[d.side].td++; else if (d.pts === 3) st[d.side].fg++; continue }
      const me = st[d.side], them = st[1 - d.side]
      me.drives++
      if (d.pts > 0) me.scoring++
      if (d.pts === 7) me.td++
      if (d.pts === 3) me.fg++
      if (d.text.includes('missed a')) me.missed++
      if (/intercepted|fumbled/.test(d.text)) me.turnovers++
      if (d.text.startsWith('Sacked')) them.sacks++
    }
    return st
  }
  const offers = $derived(g ? g.recruits.filter(r => r.offered && r.committed === null).length : 0)
  const recruitingOpen = $derived(!!g && g.phase === 'season' && g.week <= G.REGULAR_WEEKS)
  const weekLabel = $derived(!g ? '' : g.phase === 'offseason' ? 'Offseason' : G.weekName(g.week))
  /** A game's label, with the bowl's name for bowl games. */
  const gameTag = (gm: Game) => gm.type === 'bowl' ? `${G.BOWLS[gm.bowl ?? 0].icon} ${G.BOWLS[gm.bowl ?? 0].name}` : typeTag[gm.type]
  // postseason views
  const proj = $derived(g && tab === 'postseason' ? G.projectPostseason(g) : null)
  const myProjection = $derived.by(() => {
    if (!g || !proj || !me) return ''
    const verb = proj.projected ? "You're projected" : "You're"
    const q = proj.quarters.find(x => x.home === g!.user || x.away === g!.user)
    if (q) { const seed = q.home === g.user ? q.seeds![0] : q.seeds![1]; return `${verb} in the playoff as the #${seed} seed${proj.champs.has(g.user) ? ', as conference champion' : ''}.` }
    const b = proj.bowls.find(x => x.home === g!.user || x.away === g!.user)
    if (b) return `${verb} ${proj.projected ? 'for' : 'in'} the ${G.BOWLS[b.bowl ?? 0].name} against ${G.team(g, b.home === g.user ? b.away : b.home).school}.`
    if (!proj.projected) return "You're not in the postseason this year."
    if (proj.firstOut.some(t => t.id === g!.user)) return "You're among the first teams out of the playoff, and on track for a bowl."
    const pw = G.projectedWins(g, me)
    return pw < 6 ? `You're on pace for ${pw} wins. Bowls need 6.` : "You're on pace for 6 wins but outside the projected bowls for now."
  })
  const quarters = $derived(g ? g.schedule.filter(x => x.type === 'quarter').sort((a, b) => a.seeds![0] - b.seeds![0]) : [])
  const semis = $derived(g ? g.schedule.filter(x => x.type === 'semi') : [])
  const finalGame = $derived(g ? g.schedule.find(x => x.type === 'final') : undefined)
  const helmetNow = $derived(g ? g.awards?.find(a => a.year === g!.year) : undefined)
  const helmetWatch = $derived(g && !helmetNow && g.schedule.some(x => x.played) ? G.helmetRace(g).slice(0, 5) : [])

  // lineup: 12 slots in order, then bench
  const lineup = $derived.by(() => {
    if (!d) return []
    const used: Record<string, number> = {}
    return G.SLOTS.map(pos => { const i = used[pos] ?? 0; used[pos] = i + 1; return { pos, p: d[pos].starters[i] as Player | undefined } })
  })
  const starterIds = $derived(new Set(lineup.filter(x => x.p).map(x => x.p!.id)))
  const bench = $derived(me ? me.roster.filter(p => !starterIds.has(p.id)).sort((a, b) => G.POSITIONS.indexOf(a.pos) - G.POSITIONS.indexOf(b.pos) || b.ovr - a.ovr) : [])
  const openBench = $derived(me ? Math.max(0, G.ROSTER_MAX - me.roster.length) : 0)
  const noBackup = $derived(d ? G.POSITIONS.filter(p => d[p].backups.length === 0) : [])

  const STAR_LO = [0, 40, 46, 52, 58, 64]
  // Unscouted recruits sort by the middle of their star range, so sorting never leaks the real rating.
  const shownOvr = (r: Recruit) => r.scouted ? r.ovr : STAR_LO[r.stars] + 5
  const onBoard = (r: Recruit) => r.committed === g!.user || (r.offered && r.committed === null)
  const board = $derived.by(() => {
    if (!g || !needs) return []
    const list = g.recruits.filter(r =>
      (posFilter === 'ALL' || r.pos === posFilter) && (!starFilter || r.stars === starFilter) &&
      (rView === 'all' || (rView === 'board' ? onBoard(r) : r.committed === null)))
    const by: Record<RSort, (a: Recruit, b: Recruit) => number> = {
      stars: (a, b) => b.stars - a.stars || shownOvr(b) - shownOvr(a),
      ovr: (a, b) => shownOvr(b) - shownOvr(a) || b.stars - a.stars,
      race: (a, b) => (b.interest - b.rival) - (a.interest - a.rival),
      need: (a, b) => Number(needs!.need[b.pos] > 0) - Number(needs!.need[a.pos] > 0) || b.stars - a.stars,
    }
    return list.sort(by[rSort])
  })
  const commitList = $derived(g ? g.recruits.filter(r => r.committed === g!.user) : [])
  const boardCount = $derived(g ? g.recruits.filter(onBoard).length : 0)
  const sel = $derived(g ? (g.recruits.find(r => r.id === selId) ?? board[0] ?? null) : null)
  const weeksLeft = $derived(g && recruitingOpen ? G.REGULAR_WEEKS - g.week + 1 : 0)

  type RStatus = { k: 'mine' | 'gone' | 'lead' | 'behind' | 'ready' | 'cold'; text: string }
  function rStatus(r: Recruit): RStatus {
    if (r.committed === g!.user) return { k: 'mine', text: 'Committed' }
    if (r.committed !== null) return { k: 'gone', text: `Signed with ${G.team(g!, r.committed).abbr}` }
    const gap = r.rival - r.interest
    if (r.offered) return gap <= 0 ? { k: 'lead', text: 'Leading' } : { k: 'behind', text: `Behind ${gap}` }
    return gap <= 0 ? { k: 'ready', text: 'Ready to offer' } : { k: 'cold', text: 'No offer' }
  }
  function rNote(r: Recruit) {
    const rv = G.team(g!, r.rivalTeam).school
    if (r.committed === g!.user) return 'Committed. He joins your roster on signing day.'
    if (r.committed !== null) return `Signed with ${G.team(g!, r.committed).school}.`
    if (!recruitingOpen) return 'Recruiting is closed until next season.'
    const gap = r.rival - r.interest
    if (gap <= 0) {
      if (!r.offered) return 'He is ready. Offer him and he commits.'
      return needs!.open <= 0 ? 'He wants to commit, but you have no open roster spots. Free one up to sign him.' : `Ahead of ${rv}. He commits at the next check.`
    }
    const n = Math.ceil(gap / G.expectedGain(g!, r, 'contact'))
    return `${gap} behind ${rv}. About ${n} contact${n === 1 ? '' : 's'} to pass them, and their pull grows each week.${r.offered ? '' : ' He only commits to schools that offer.'}`
  }
  // playing time
  const games = $derived(g ? G.userGamesPlayed(g) : 0)
  const moods = $derived(me ? me.roster.filter(p => p.year < 4).map(p => ({ p, m: G.playerMorale(g!, p) })).sort((a, b) => a.m.score - b.m.score) : [])
  const moodOf = $derived(new Map(moods.map(x => [x.p.id, x.m])))
  const atRisk = $derived(moods.filter(x => x.m.mood === 'Unhappy' || x.m.mood === 'Wants out').length)
  const pct = (n: number) => `${Math.round(n * 100)}%`

  // transfer portal
  type PView = 'all' | 'mine' | 'targets'
  let pView = $state<PView>('all')
  let pPos = $state<'ALL' | Pos>('ALL')
  let pSelId = $state<number | null>(null)
  $effect(() => { if (g && g.phase === 'offseason' && !g.portal && !g.report) G.openPortal(g) })
  $effect(() => { if (g && (!g.staff || !g.staffMarket || !g.ad || g.boosters === undefined)) G.ensureProgram(g) })
  function upgrade(f: G.Facility) { if (g) flash(G.upgradeFacility(g, f)) }
  const watch = $derived(g ? G.draftWatch(g) : [])
  let draftYear = $state(0)
  const budget = $derived(g ? G.staffBudget(g) : 0)
  const pay = $derived(g ? G.payroll(g) : 0)
  function hire(id: number) { if (g) flash(G.hireCoach(g, id)) }
  const RECAP_ICON: Record<G.RecapKind, string> = { injury: '✚', commit: '★', lost: '✕', visit: '⌂', goal: '✓', league: '🏆', trait: '⚡', info: '•', spotlight: '📺', bowl: '', award: '🏈' }
  const traitTag = (t?: G.Trait) => t ? G.TRAITS[t] : null
  function train(p: Player, i: number) { if (g) flash(G.setTraining(g, p.id, i)) }
  const trainName = (p: Player) => { const i = g ? G.trainingSkill(g, p.id) : null; return i === null ? null : G.SKILLS[p.pos][i] }
  /** The skill or two that count most toward OVR at a position. */
  const keySkill = (pos: Pos, i: number) => G.SKILL_WEIGHTS[pos][i] >= Math.max(...G.SKILL_WEIGHTS[pos]) - 0.001
  const portal = $derived(g?.portal ?? null)
  const myEntries = $derived(portal ? portal.entries.filter(e => e.from === g!.user) : [])
  const pList = $derived(!portal ? [] : portal.entries.filter(e =>
    (pPos === 'ALL' || e.p.pos === pPos) &&
    (pView === 'all' || (pView === 'mine' ? e.from === g!.user : (e.offered || e.to === g!.user) && e.from !== g!.user))))
  const pSel = $derived(portal ? (portal.entries.find(e => e.p.id === pSelId) ?? pList[0] ?? null) : null)
  function pStatus(e: PortalEntry): RStatus {
    const own = e.from === g!.user
    if (e.to === g!.user) return { k: 'mine', text: own ? 'Staying' : 'Signed' }
    const gap = e.rival - e.interest
    if (e.offered) return gap <= 0 ? { k: 'lead', text: 'Leading' } : { k: 'behind', text: `Behind ${gap}` }
    return gap <= 0 ? { k: 'ready', text: own ? 'Ask him to stay' : 'Ready to offer' } : { k: own ? 'behind' : 'cold', text: own ? 'Leaving' : 'No offer' }
  }
  function pNote(e: PortalEntry) {
    const own = e.from === g!.user, rv = G.team(g!, e.rivalTeam).school
    if (e.to === g!.user) return own ? 'He is staying with you.' : 'Signed. He joins your roster on signing day.'
    const gap = e.rival - e.interest
    if (gap <= 0) {
      if (!e.offered) return own ? 'He would stay. Ask him to stay to keep him.' : 'He is ready. Offer him and he signs.'
      return 'He wants to come, but you are out of transfer slots or roster spots.'
    }
    const n = Math.ceil(gap / G.expectedPortalGain(g!, e, 'pitch'))
    return `${gap} behind ${rv}. About ${n} pitch${n === 1 ? '' : 'es'} to pass them.${own ? ` If you don't, he goes to ${rv} on signing day.` : e.offered ? '' : ' He only signs with schools that offer.'}`
  }
  function pAct(e: PortalEntry, a: 'offer' | 'pitch' | 'visit') { if (g) flash(G.portalAction(g, e, a)) }

  const gainStr = (r: Recruit, a: 'contact' | 'visit') => `about +${Math.round(G.expectedGain(g!, r, a))}`

  function sim() { if (!g) return; swapFrom = null; G.simWeek(g); if (g.phase === 'offseason') tab = 'team' }
  function act(r: Recruit, a: 'contact' | 'scout' | 'visit' | 'offer') { if (g) flash(G.recruitAction(g, r, a)) }
  function doSwap(starterId: number) { if (g && swapFrom !== null) { G.swapLineup(g, swapFrom, starterId); swapFrom = null } }
  function release(id: number) {
    if (releaseId !== id) { releaseId = id; setTimeout(() => { if (releaseId === id) releaseId = null }, 3000); return }
    G.releasePlayer(g!, id); releaseId = null
  }

  // setup screen: strongest conference first
  const confOrder = [0, 1, 2, 3].sort((a, b) => {
    const avg = (c: number) => G.SCHOOL_LIST.filter(s => s.conf === G.SCHOOL_LIST[c * 8].conf).reduce((n, s) => n + s.prestige, 0)
    return avg(b) - avg(a)
  })
  const starStr = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n)
  const initials = (p: { first: string; last: string }) => p.first[0] + p.last[0]
  const typeTag: Record<string, string> = { cupcake: 'Cupcake', nonconf: 'Non-conference', conf: 'Conference', ccg: 'Conference title', quarter: 'Playoff quarterfinal', semi: 'Playoff semifinal', final: 'National title', bowl: 'Bowl game' }
  const ROT = [
    { v: 0, name: 'Starters', note: 'Your best lineup plays the whole game.' },
    { v: 0.25, name: 'Rotate', note: 'Backups take a quarter of the snaps and grow a little.' },
    { v: 0.5, name: 'Backups 2nd half', note: 'Big growth for backups. Risky against a real team.' },
  ]
  function estRange(r: Recruit) {
    if (r.scouted) return `${r.ovr}`
    const lo = STAR_LO[r.stars]
    return `${lo}-${lo + 10}`
  }
  function oppOf(gm: Game) { return G.team(g!, gm.home === g!.user ? gm.away : gm.home) }
  function result(gm: Game) {
    if (!gm.played) return null
    const mine = gm.home === g!.user ? gm.hs! : gm.as!, theirs = gm.home === g!.user ? gm.as! : gm.hs!
    return { w: mine > theirs, text: `${mine}-${theirs}` }
  }
</script>

{#snippet badge(t: G.Team, size = 'md')}
  <span class="badge {size}" style="--c:{t.color}">{t.abbr}</span>
{/snippet}

{#snippet playerRow(p: Player, slot: Pos, isStarter: boolean)}
  {@const swapTarget = isStarter && swapFrom !== null && me?.roster.find(x => x.id === swapFrom)?.pos === p.pos}
  <button class="prow" class:sel={playerSel === p.id} class:hurt={p.inj} class:target={swapTarget} class:picked={swapFrom === p.id}
    onclick={() => swapTarget ? doSwap(p.id) : (playerSel = playerSel === p.id ? null : p.id)}
    aria-expanded={swapTarget ? undefined : playerSel === p.id}>
    <span class="pill {slot}">{slot}</span>
    <span class="avatar" style="--c:{me?.color}">{initials(p)}</span>
    <span class="who">
      <span class="pname">{p.first[0]}. {p.last} {#if p.lock}<span class="tag">Set</span>{/if}</span>
      <span class="psub">{G.YEARS[p.year]} · <span class="dev {p.dev}">{p.dev} dev</span>{#if p.trait}{' · '}<span class="trait" class:bad={!G.TRAITS[p.trait].good}>{p.trait}</span>{/if} · {p.snaps} snaps{#if p.walkOn} · walk-on{/if}</span>
    </span>
    <span class="tags">
      {#if p.inj}<span class="tag out">Out {p.inj}w</span>{/if}
      {#if g?.focus.includes(p.id)}<span class="tag train">Training {trainName(p)?.toLowerCase()}</span>{/if}
      {#if g?.phase === 'season'}
        {@const m = moodOf.get(p.id)}
        {#if m && (m.mood === 'Unhappy' || m.mood === 'Wants out')}<span class="tag mood {m.mood === 'Wants out' ? 'out' : 'low'}" title="Playing {pct(m.share)} of snaps, expects {pct(m.expect)}">{m.mood}</span>{/if}
      {/if}
      {#if swapTarget}<span class="tag swapin">Swap in</span>{:else if swapFrom === p.id}<span class="tag train">Picked</span>{/if}
    </span>
    <span class="nums"><b>{Math.round(p.ovr)}</b><small>POT {G.grade(p.pot)}</small></span>
    <span class="chev" aria-hidden="true">{playerSel === p.id ? '▾' : '▸'}</span>
  </button>
  {#if playerSel === p.id}<div class="rinline">{@render playerCard(p, isStarter)}</div>{/if}
{/snippet}

{#snippet boxScore(gm: Game)}
  {@const h = G.team(g!, gm.home)}
  {@const a = G.team(g!, gm.away)}
  {@const ls = lineScore(gm)}
  {@const st = teamStats(gm)}
  <table class="linescore">
    <thead><tr><th></th>{#each Array(ls.qs) as _, i}<th class="r">{i < 4 ? `Q${i + 1}` : 'OT'}</th>{/each}<th class="r">T</th></tr></thead>
    <tbody>
      {#each [h, a] as t, side}
        <tr class:me={t.id === g!.user}><td><div class="tcell">{@render badge(t, 'sm')} {t.abbr}</div></td>
          {#each ls.rows[side] as v}<td class="r">{v}</td>{/each}<td class="r"><b>{side === 0 ? gm.hs : gm.as}</b></td></tr>
      {/each}
    </tbody>
  </table>
  <table class="teamstats">
    <thead><tr><th class="r">{h.abbr}</th><th></th><th>{a.abbr}</th></tr></thead>
    <tbody>
      {#each [['Touchdowns', 'td'], ['Field goals', 'fg'], ['Scoring drives', 'scoring'], ['Missed field goals', 'missed'], ['Sacks', 'sacks'], ['Turnovers', 'turnovers']] as [label, k]}
        {@const hv = st[0][k as keyof typeof st[0]]}
        {@const av = st[1][k as keyof typeof st[1]]}
        {@const better = k === 'turnovers' || k === 'missed' ? (hv < av ? 0 : av < hv ? 1 : -1) : (hv > av ? 0 : av > hv ? 1 : -1)}
        <tr><td class="r" class:lead={better === 0}>{k === 'scoring' ? `${hv} of ${st[0].drives}` : hv}</td><th>{label}</th><td class:lead={better === 1}>{k === 'scoring' ? `${av} of ${st[1].drives}` : av}</td></tr>
      {/each}
    </tbody>
  </table>
  <p class="gamefacts">
    <span>{G.WEATHER_TEXT[G.weatherOf(g!, gm)].icon} {G.WEATHER_TEXT[G.weatherOf(g!, gm)].name}</span>
    {#if gm.spotlight}<span class="spotchip">📺 Saturday Spotlight</span>{/if}
    {#if gm.attendance}<span>Attendance {gm.attendance.toLocaleString()}{gm.attendance >= G.stadiumSeats(g!) ? ' (sellout)' : ''}</span>{/if}
    {#if gm.fanDelta}<span class:up={gm.fanDelta > 0} class:down={gm.fanDelta < 0}>Fans {gm.fanDelta > 0 ? '+' : ''}{gm.fanDelta}</span>{/if}
  </p>
  {#if gm.potg}<p class="potg"><span class="eyebrow">Player of the game</span> {gm.potg}</p>{/if}
{/snippet}

{#snippet gameLog(gm: Game, withBox = true)}
  {@const h = G.team(g!, gm.home)}
  {@const a = G.team(g!, gm.away)}
  {#if withBox}{@render boxScore(gm)}{/if}
  {#if gm.plan && gm.oppPlan}
    {@const guessed = gm.plan.def === gm.oppPlan.off}
    <p class="muted small">Your offense went {G.leanWord(gm.plan.off, 'off')} with a defense {G.leanWord(gm.plan.def, 'def')}. They went {G.leanWord(gm.oppPlan.off, 'off')}{Math.abs(gm.plan.def - gm.oppPlan.off) <= 0.1 ? ', so your defense read them well.' : Math.abs(gm.plan.def - gm.oppPlan.off) >= 0.3 ? ', so your defense guessed wrong.' : '.'}</p>
  {/if}
  {#if gm.log}
    <ol class="drives">
      {#each gm.log as d}
        {@const t = d.side === 0 ? h : a}
        <li class:scored={d.pts > 0} class:mine={t.id === g!.user}>
          <span class="dq">{d.q > 4 ? 'OT' : `Q${d.q}`}</span>
          <span class="dteam" style="--c:{t.color}">{t.abbr}</span>
          <span class="grow">{d.text}{d.pts ? ` (+${d.pts})` : ''}</span>
          <span class="dscore">{d.score[0]}-{d.score[1]}</span>
        </li>
      {/each}
    </ol>
  {/if}
{/snippet}

{#snippet skillList(pos: Pos, skills: number[], p: Player | null = null)}
  {@const tr = p && g ? G.trainingSkill(g, p.id) : null}
  <div class="skills">
    {#each G.SKILLS[pos] as name, i}
      {@const v = skills[i]}
      {#if p}
        <button class="skillrow" class:on={tr === i} onclick={() => train(p, i)}
          disabled={tr === null && (g?.focus.length ?? 0) >= G.MAX_FOCUS} aria-pressed={tr === i}>
          <span class="skname">{name}{#if keySkill(pos, i)}<em>key</em>{/if}</span>
          <span class="skbar"><i style="width:{v}%"></i></span>
          <b>{Math.round(v)}</b>
          <span class="sktrain">{tr === i ? 'Training' : 'Train'}</span>
        </button>
      {:else}
        <div class="skillrow static">
          <span class="skname">{name}{#if keySkill(pos, i)}<em>key</em>{/if}</span>
          <span class="skbar"><i style="width:{v}%"></i></span>
          <b>{Math.round(v)}</b>
        </div>
      {/if}
    {/each}
  </div>
{/snippet}

{#snippet bracketGame(x: Game, champs: Set<number> = new Set())}
  {@const h = G.team(g!, x.home)}
  {@const a = G.team(g!, x.away)}
  <div class="bgame" class:me={x.home === g!.user || x.away === g!.user}>
    {#each [[h, x.seeds?.[0], x.hs], [a, x.seeds?.[1], x.as]] as [t, sd, sc]}
      {@const tm = t as G.Team}
      <div class="bteam" class:won={x.played && (sc as number) > ((tm.id === x.home ? x.as : x.hs) as number)} class:lost={x.played && (sc as number) < ((tm.id === x.home ? x.as : x.hs) as number)}>
        <span class="seed">{sd}</span>{@render badge(tm, 'sm')}<span class="grow">{tm.school}{#if champs.has(tm.id)}<em class="cchamp" title="Conference champion">C</em>{/if}</span><b>{x.played ? sc : ''}</b>
      </div>
    {/each}
  </div>
{/snippet}

{#snippet traitBox(t: G.Trait)}
  <div class="traitbox" class:bad={!G.TRAITS[t].good}><b>{t}</b><span>{G.TRAITS[t].text}</span></div>
{/snippet}

{#snippet coachRow(c: G.Coach, hireable: boolean)}
  {@const cur = g!.staff?.find(x => x.role === c.role)}
  {@const after = Math.round((pay - (cur?.salary ?? 0) + c.salary) * 10) / 10}
  <div class="coach">
    <span class="role">{G.ROLES[c.role].short}</span>
    <div class="grow"><b>{c.first} {c.last}</b><div class="stars">{starStr(c.level)}</div></div>
    <span class="salary">${c.salary.toFixed(1)}M</span>
    {#if hireable}
      <button class="btn sm" class:primary={c.level > (cur?.level ?? 0)} disabled={!G.canHire(g!) || after > budget + 1e-9} onclick={() => hire(c.id)}
        title={after > budget + 1e-9 ? 'Over budget' : ''}>{c.level > (cur?.level ?? 0) ? 'Upgrade' : 'Hire'}</button>
    {/if}
  </div>
{/snippet}

{#snippet playerCard(p: Player, isStarter: boolean)}
  {@const m = G.playerMorale(g!, p)}
  <div class="rdetail">
    <div class="rd-head">
      <span class="pill big {p.pos}">{p.pos}</span>
      <div class="grow">
        <h2>{p.first} {p.last}</h2>
        <div class="stars lg">{starStr(p.stars)}</div>
      </div>
      <button class="btn sm" onclick={() => (playerSel = null)} aria-label="Close player card">Close</button>
    </div>
    <div class="cardtags">
      <span class="tag">{G.YEARS[p.year]}</span>
      {#each p.awards ?? [] as a}<span class="tag award">🏈 {a}</span>{/each}
      <span class="tag" class:ok={isStarter}>{p.inj ? `Out ${p.inj}w` : isStarter ? 'Starter' : 'Bench'}</span>
      {#if p.walkOn}<span class="tag">Walk-on</span>{/if}
      {#if p.lock}<span class="tag">Locked in lineup</span>{/if}
      {#if g?.focus.includes(p.id)}<span class="tag train">Training {trainName(p)?.toLowerCase()}</span>{/if}
      {#if p.year >= 4}<span class="tag">Graduates this year</span>{/if}
    </div>
    <div class="rd-ratings">
      <div><b>{Math.round(p.ovr)}</b><small>OVR</small></div>
      <div><b>{G.grade(p.pot)}</b><small>Potential ({p.pot})</small></div>
      <div><b class="dev {p.dev}">{p.dev}</b><small>Dev trait</small></div>
    </div>
    {#if p.trait}{@render traitBox(p.trait)}{/if}
    {#if p.stats?.g}<div class="seasonstats"><span class="muted small">{g?.year} season · {p.stats.g} games</span><b>{G.statLine(p)}</b></div>{/if}
    <div>
      <div class="race-top small"><span class="muted">Skills · tap one to train it</span><span class="muted small">{g?.focus.length}/{G.MAX_FOCUS} training slots</span></div>
      {@render skillList(p.pos, G.skillsOf(p), p)}
      <p class="muted small skillhelp">{p.ovr >= p.pot ? 'He has reached his potential, so training won\'t raise him any more.' : 'Training puts all of his weekly work into one skill. Key skills count most toward OVR, but every skill matters on game day.'}</p>
    </div>
    {#if p.year < 4}
      <div class="race">
        <div class="race-top">
          <span class="you">Playing time <b>{pct(m.share)}</b></span>
          <span class="them"><span><small>Expects</small><b>{pct(m.expect)}</b></span></span>
        </div>
        <div class="race-bar" class:ahead={m.share >= m.expect}>
          <i style="width:{m.share * 100}%"></i><em style="left:{m.expect * 100}%"></em>
        </div>
        <p class="race-note"><b class="mood-{m.mood.replace(' ', '-')}">{m.mood}.</b>
          {#if games === 0}His mood forms over the first few games.
          {:else if m.share >= m.expect}He's getting the snaps he wants.
          {:else if isStarter}He starts, so his snaps will catch up.
          {:else}Rotate backups in on game day so he plays. Unhappy players may enter the transfer portal after the season.{/if}
          {p.snaps} snaps over {games} game{games === 1 ? '' : 's'}.</p>
      </div>
    {/if}
    <div class="rd-actions">
      {#if !isStarter && !p.inj}
        <button class="atile" onclick={() => { swapFrom = p.id; playerSel = null }}><b>Start him</b><small>Pick who he replaces</small></button>
      {/if}
      {#if g?.focus.includes(p.id)}
        <button class="atile plain" onclick={() => G.toggleFocus(g!, p.id)}><b>Stop training</b><small>Frees a training slot</small></button>
      {/if}
      {#if !isStarter}
        <button class="atile plain danger" onclick={() => release(p.id)}><b>{releaseId === p.id ? 'Click again to cut' : 'Cut'}</b><small>Frees a roster spot</small></button>
      {/if}
    </div>
  </div>
{/snippet}

{#snippet portalDetail(e: PortalEntry)}
  {@const rv = G.team(g!, e.rivalTeam)}
  {@const from = G.team(g!, e.from)}
  {@const st = pStatus(e)}
  {@const own = e.from === g!.user}
  {@const scale = Math.max(e.rival, e.interest, 30) * 1.15}
  {@const starts = G.wouldStart(g!, e)}
  <div class="rdetail">
    <div class="rd-head">
      <span class="pill big {e.p.pos}">{e.p.pos}</span>
      <div class="grow">
        <h2>{e.p.first} {e.p.last}</h2>
        <div class="stars lg">{starStr(e.p.stars)}</div>
      </div>
      <span class="rstat {st.k} big">{st.text}</span>
    </div>
    <div class="fromrow">{@render badge(from, 'sm')}<span>{own ? 'Your player' : `From ${from.school}`} · {G.YEARS[e.p.year]} · {e.reason}</span></div>
    {#if starts && e.to === null}<div class="tag ok startstag">Would start for you</div>{/if}
    <div class="rd-ratings">
      <div><b>{Math.round(e.p.ovr)}</b><small>OVR</small></div>
      <div><b>{G.grade(e.p.pot)}</b><small>Potential</small></div>
      <div><b class="dev {e.p.dev}">{e.p.dev}</b><small>Dev trait</small></div>
    </div>
    {@render skillList(e.p.pos, G.skillsOf(e.p))}
    {#if e.p.trait}{@render traitBox(e.p.trait)}{/if}
    <div class="race">
      <div class="race-top">
        <span class="you">{me?.abbr} <b>{e.interest}</b></span>
        <span class="them">{@render badge(rv, 'sm')} <span><small>Top rival</small>{rv.school} <b>{e.rival}</b></span></span>
      </div>
      <div class="race-bar" class:ahead={e.interest >= e.rival}>
        <i style="width:{Math.min(100, e.interest / scale * 100)}%"></i>
        <em style="left:{Math.min(100, e.rival / scale * 100)}%"></em>
      </div>
      <p class="race-note">{pNote(e)}</p>
    </div>
    {#if e.to === null}
      <div class="rd-actions">
        <button class="atile" class:on={e.offered} onclick={() => pAct(e, 'offer')} disabled={!own && !e.offered && G.portalOffers(g!) >= G.MAX_PORTAL_OFFERS}>
          <b>{e.offered ? 'Pull offer' : own ? 'Ask him to stay' : 'Offer'}</b>
          <small>{e.offered ? 'Frees an offer slot' : 'Free · +5 interest'}</small>
        </button>
        <button class="atile" onclick={() => pAct(e, 'pitch')} disabled={portal!.points < G.PORTAL_COST.pitch}>
          <b>{own ? 'Talk to him' : 'Pitch'}</b><small>{G.PORTAL_COST.pitch} pts · about +{Math.round(G.expectedPortalGain(g!, e, 'pitch'))}</small>
        </button>
        <button class="atile" onclick={() => pAct(e, 'visit')} disabled={e.visited || e.interest < 25 || portal!.points < G.PORTAL_COST.visit}>
          <b>{own ? 'Sit down with him' : 'Campus visit'}</b>
          <small>{e.visited ? 'Already done' : e.interest < 25 ? `Needs 25 interest (${e.interest})` : `${G.PORTAL_COST.visit} pts · about +${Math.round(G.expectedPortalGain(g!, e, 'visit'))}`}</small>
        </button>
      </div>
    {/if}
  </div>
{/snippet}

{#snippet recruitDetail(r: Recruit)}
  {@const rv = G.team(g!, r.rivalTeam)}
  {@const st = rStatus(r)}
  {@const scale = Math.max(r.rival, r.interest, 30) * 1.15}
  {@const live = recruitingOpen && r.committed === null}
  <div class="rdetail">
    <div class="rd-head">
      <span class="pill big {r.pos}">{r.pos}</span>
      <div class="grow">
        <h2>{r.first} {r.last}</h2>
        <div class="stars lg">{starStr(r.stars)}</div>
      </div>
      <span class="rstat {st.k} big">{st.text}</span>
    </div>
    {#if needs && needs.need[r.pos] > 0 && r.committed === null}<div class="tag need">Fills a need at {r.pos}</div>{/if}

    <div class="rd-ratings">
      <div><b>{estRange(r)}</b><small>OVR</small></div>
      <div><b>{r.scouted ? G.grade(r.pot) : '?'}</b><small>Potential</small></div>
      <div><b class={r.scouted ? `dev ${r.dev}` : ''}>{r.scouted ? r.dev : '?'}</b><small>Dev trait</small></div>
    </div>
    {#if !r.scouted}<p class="muted small">Not scouted. OVR is a range based on stars, and his trait is hidden.</p>
    {:else}
      {@render skillList(r.pos, G.skillsOf(r))}
      {#if r.trait}{@render traitBox(r.trait)}{/if}
    {/if}
    {#if r.visitWeek === g!.week && g!.phase === 'season' && r.committed === null}<div class="tag ok startstag">Visiting for this week's home game</div>{/if}

    <div class="race">
      <div class="race-top">
        <span class="you">{me?.abbr} <b>{r.interest}</b></span>
        <span class="them">{@render badge(rv, 'sm')} <span><small>Top rival</small>{rv.school} <b>{r.rival}</b></span></span>
      </div>
      <div class="race-bar" class:ahead={r.interest >= r.rival}>
        <i style="width:{Math.min(100, r.interest / scale * 100)}%"></i>
        <em style="left:{Math.min(100, r.rival / scale * 100)}%"></em>
      </div>
      <p class="race-note">{rNote(r)}</p>
    </div>

    {#if live}
      <div class="rd-actions">
        <button class="atile" class:on={r.offered} onclick={() => act(r, 'offer')} disabled={!r.offered && offers >= G.MAX_OFFERS}>
          <b>{r.offered ? 'Pull offer' : 'Offer'}</b>
          <small>{r.offered ? 'Frees an offer slot' : offers >= G.MAX_OFFERS ? `All ${G.MAX_OFFERS} offers used` : 'Free · +5 interest'}</small>
        </button>
        <button class="atile" onclick={() => act(r, 'contact')} disabled={g!.points < G.COST.contact}>
          <b>Contact</b><small>{G.COST.contact} pts · {gainStr(r, 'contact')}</small>
        </button>
        <button class="atile" onclick={() => act(r, 'visit')} disabled={r.visited || r.interest < 30 || g!.points < G.COST.visit}>
          <b>Campus visit</b>
          <small>{r.visited ? 'Already visited' : r.interest < 30 ? `Needs 30 interest (${r.interest})` : `${G.COST.visit} pts · ${gainStr(r, 'visit')}`}</small>
          {#if !r.visited && r.interest >= 30}<small class="visitnote">{next && next.home === g!.user ? `Home vs ${G.team(g!, next.away).school}: a win adds ${rk(next.away) ? 18 : 10}, a loss costs 8` : 'Away week: a quiet visit, no game-day bonus'}</small>{/if}
        </button>
        <button class="atile" onclick={() => act(r, 'scout')} disabled={r.scouted || g!.points < G.COST.scout}>
          <b>Scout</b><small>{r.scouted ? 'Scouted' : `${G.COST.scout} pts · reveals ratings`}</small>
        </button>
      </div>
    {/if}
  </div>
{/snippet}

{#if !g}
  <main class="setup">
    <div class="brand big">PIXEL <b>FOOTBALL</b> <span>Manager</span></div>
    <h1>Pick your program</h1>
    <p class="muted">Higher prestige recruits easier. Lower prestige is a longer climb. Conferences aren't equal: the power conference is stacked, and small schools are a rebuild.</p>
    <div class="confgrid">
      {#each confOrder as c}
        {@const conf = G.SCHOOL_LIST[c * 8].conf}
        {@const members = G.SCHOOL_LIST.filter(s => s.conf === conf)}
        <section class="card">
          <h3>{conf}</h3>
          <div class="tierline"><span class="tag tier{c}">{G.CONF_TIERS[c]}</span><span class="muted small">Avg prestige {(members.reduce((n, s) => n + s.prestige, 0) / members.length).toFixed(1)}</span></div>
          {#each G.SCHOOL_LIST.filter(s => s.conf === conf).sort((a, b) => b.prestige - a.prestige) as s}
            <button class="pick" onclick={() => start(s.i)}>
              <span class="badge md" style="--c:{s.color}">{s.school.slice(0, 3).toUpperCase()}</span>
              <span class="grow"><b>{s.school}</b><small>{s.mascot}</small></span>
              <span class="stars">{starStr(Math.max(1, Math.round(s.prestige / 2)))}</span>
            </button>
          {/each}
        </section>
      {/each}
    </div>
  </main>
{:else if me && d && needs}
  <header class="top">
    <div class="brand">PIXEL <b>FOOTBALL</b></div>
    <nav class="tabs">
      {#each [['team', 'My Team'], ['recruits', 'Recruits'], ['portal', 'Portal'], ['program', 'Program'], ['schedule', 'Schedule'], ['league', 'League'], ['postseason', 'Postseason'], ['history', 'History'], ['settings', 'Settings']] as [k, l]}
        <button class:on={tab === k} onclick={() => (tab = k as Tab)}>{l}</button>
      {/each}
    </nav>
  </header>

  <section class="teambar">
    <div class="tb-id">
      {@render badge(me, 'lg')}
      <div class="grow">
        <div class="tname">{me.school} {me.mascot}</div>
        <div class="muted">{g.year} · {weekLabel} · {g.confNames[me.conf]} · <button class="link inline" onclick={() => openEdit(me.id)}>Edit team</button></div>
      </div>
    </div>
    <div class="tb-stats">
      <div class="stat"><small>Rank</small><b>{rk(me.id) || 'NR'}</b></div>
      <div class="stat"><small>Record</small><b>{me.w}-{me.l}</b></div>
      <div class="stat"><small>Fans</small><b>{G.fanMood(fans)}</b><span class="meter fanmeter"><i style="width:{fans}%"></i></span></div>
      <div class="stat"><small>Prestige</small><b>{me.prestige.toFixed(1)}</b><span class="meter"><i style="width:{me.prestige * 10}%"></i></span></div>
      <div class="stat"><small>Roster</small><b>{me.roster.length}/{G.ROSTER_MAX}</b></div>
    </div>
  </section>

  <main>
    {#if tab === 'team'}
      <div class="layout">
        <div class="col">
          {#if playerSel !== null && me.roster.some(x => x.id === playerSel)}
            {@const sp = me.roster.find(x => x.id === playerSel)!}
            <section class="card pcard">{@render playerCard(sp, starterIds.has(sp.id))}</section>
          {/if}
          <section class="card matchup">
            {#if g.phase === 'offseason'}
              <div class="eyebrow">Season complete</div>
              <h2>{G.finishLabel(g, me)}</h2>
              <p>Final record {me.w}-{me.l}.{#if g.champion !== null} National champion: <b>{g.teams[g.champion].school}</b>.{/if}</p>
              {#if portal}
                <div class="portalcall">
                  <div class="grow"><b>The transfer portal is open</b>
                    <div class="muted small">{portal.entries.length} players in it{myEntries.length ? `, ${myEntries.length} of them yours` : ''}. Sign transfers or win your players back before signing day.</div></div>
                  <button class="btn" onclick={() => (tab = 'portal')}>Open portal</button>
                </div>
              {/if}
              <p class="muted">On signing day the portal closes, seniors graduate, players develop and your commits and transfers join the roster.</p>
              <button class="btn primary block" onclick={() => G.advanceOffseason(g!)}>Go to signing day</button>
            {:else if next && opp && myR && oppR}
              {#if mySpot}
                <div class="spotbanner"><span class="spotlogo">📺 Saturday Spotlight</span>
                  <span>{site === 'neutral' ? 'The show is live from the title game.' : `The show is live from ${G.team(g, next.home).school}.`} The whole country, and every recruit you've offered, is watching.</span></div>
              {/if}
              {#if next.type === 'bowl'}
                {@const b = G.BOWLS[next.bowl ?? 0]}
                <div class="bowlbanner"><span class="bowlname">{b.icon} {b.name}</span><span>{b.tradition}</span></div>
              {:else if next.seeds}
                <div class="bowlbanner playoff"><span class="bowlname">🏆 {typeTag[next.type]}</span>
                  <span>#{next.home === g.user ? next.seeds[0] : next.seeds[1]} seed vs #{next.home === g.user ? next.seeds[1] : next.seeds[0]} seed. Win or go home.</span></div>
              {/if}
              <div class="eyebrow">{weekLabel} · <span class:cupcake={next.type === 'cupcake'}>{gameTag(next)}</span> · {SITE_LABEL[site]}</div>
              <div class="score">
                <div class="side">
                  {@render badge(me, 'lg')}
                  <div class="sname"><span class="rk">{rk(me.id)}</span>{me.school}</div>
                  <div class="muted">{me.w}-{me.l}</div>
                  {#if site !== 'neutral'}<span class="sitetag" class:home={site === 'home'}>{site === 'home' ? 'Home' : 'Away'}</span>{/if}
                </div>
                <div class="nums">
                  <b>{Math.round(myOvr)}</b><span>vs</span><b class="them">{Math.round(oppOvr)}</b>
                  <small>Team rating</small>
                </div>
                <div class="side">
                  {@render badge(opp, 'lg')}
                  <div class="sname"><span class="rk">{rk(opp.id)}</span>{opp.school}</div>
                  <div class="muted">{opp.conf >= 0 ? `${opp.w}-${opp.l}` : 'Cupcake'}</div>
                  {#if site !== 'neutral'}<span class="sitetag" class:home={site === 'away'}>{site === 'away' ? 'Home' : 'Away'}</span>{/if}
                </div>
              </div>
              <div class="prob"><i style="width:{prob * 100}%"></i></div>
              <div class="problabels"><span>{Math.round(prob * 100)}% win</span><span>{100 - Math.round(prob * 100)}%</span></div>
              <div class="seg">
                {#each ROT as r}<button class:on={g.rotation === r.v} onclick={() => (g!.rotation = r.v)}>{r.name}</button>{/each}
              </div>
              <p class="muted small">{ROT.find(r => r.v === g!.rotation)?.note}</p>
              <p class="sitenote {site}">
                {#if site === 'home'}Home game. Your crowd lifts your offense and makes it harder on theirs.{#if g.facilities?.stadium} Your stadium upgrades make it louder.{/if}
                {:else if site === 'away'}Road game. Their crowd is on their side, so expect a tougher day.
                {:else}Neutral site. No home crowd for either team.{/if}
              </p>
              {#if weather}<p class="wxnote wx-{weather}"><span class="wxicon">{G.WEATHER_TEXT[weather].icon}</span><b>{G.WEATHER_TEXT[weather].name}.</b> {G.WEATHER_TEXT[weather].note}</p>{/if}
              {#if site === 'home'}<p class="muted small">Fans: {G.fanMood(fans).toLowerCase()}. {fans >= 65 ? 'Expect a packed, loud house.' : fans < 35 ? 'Expect empty seats and a quiet crowd.' : 'A decent crowd should show up.'}</p>{/if}
              {#if mySpot}<p class="spotnote">Win and you climb the poll, your recruits get excited and your fans go wild. Lose and everyone sees it.</p>
              {:else if spot}<p class="muted small">This week's Spotlight: <b>{rk(spot.away)}{G.team(g, spot.away).school}</b> at <b>{rk(spot.home)}{G.team(g, spot.home).school}</b>.</p>{/if}
              {#if next.type === 'cupcake'}<p class="hint">Cupcake week. Good time to get your bench real snaps.</p>{/if}
              {#if g.rotation > 0 && noBackup.length}<p class="muted small">No backup at {noBackup.join(', ')}, so those starters stay in.</p>{/if}
              {#if scout}
                <div class="gameplan">
                  <div class="gp-head"><h4>Game plan</h4></div>
                  <div class="scout">
                    <div><small>Scouting their offense</small><b>{scout.offense}</b></div>
                    <div><small>Scouting their defense</small><b>{scout.defense}</b></div>
                  </div>
                  <div class="gp-row"><span class="muted small">Offense</span>
                    <input class="lean" type="range" min={G.LEAN_MIN} max={G.LEAN_MAX} step={G.LEAN_STEP} value={plan.off}
                      oninput={(e) => setPlan('off', +e.currentTarget.value)} aria-label="Offense: pass to run" />
                    <div class="leanlabels"><span>Pass-heavy</span><b>{offText(plan.off)}</b><span>Run-heavy</span></div></div>
                  <div class="gp-row"><span class="muted small">Defense</span>
                    <input class="lean def" type="range" min={G.LEAN_MIN} max={G.LEAN_MAX} step={G.LEAN_STEP} value={plan.def}
                      oninput={(e) => setPlan('def', +e.currentTarget.value)} aria-label="Defense: stop the pass to stop the run" />
                    <div class="leanlabels"><span>Stop the pass</span><b>{defText(plan.def)}</b><span>Stop the run</span></div></div>
                  <p class="muted small">Lean into what your team does well and where they're weak, and set your defense for what you think they'll call. Coaches mix it up, so it's never certain.</p>
                </div>
              {/if}
              <button class="btn primary block" onclick={sim}>Play week {g.week}</button>
            {:else}
              <div class="eyebrow">{weekLabel}</div>
              <h2>No game for you this week</h2>
              <p class="muted">{g.week > G.REGULAR_WEEKS ? 'Your season is done. Sim to watch the bowls and the playoff play out.' : 'Sim the week to see the results.'}</p>
              <button class="btn primary block" onclick={sim}>Sim week</button>
            {/if}
          </section>

        </div>

        <div class="col">
          <section class="card flush">
            <div class="cardhead">
              <h3>Starting lineup</h3>
              <button class="btn sm" onclick={() => G.autoLineup(g!)}>Auto set</button>
            </div>
            {#if swapFrom !== null}
              {@const sp = me.roster.find(x => x.id === swapFrom)}
              <div class="hint inset swaphint"><span class="grow">Tap the {sp?.pos} starter {sp ? `${sp.first[0]}. ${sp.last}` : ''} replaces.</span><button class="btn sm" onclick={() => (swapFrom = null)}>Cancel</button></div>
            {/if}
            {#each lineup as slot}
              {#if slot.p}
                {@render playerRow(slot.p, slot.pos, true)}
              {:else}
                <div class="prow empty"><span class="pill {slot.pos}">{slot.pos}</span><span class="muted">Empty. An emergency walk-on ({G.EMERGENCY_OVR}) plays here.</span></div>
              {/if}
            {/each}
            <div class="cardhead sub">
              <h3>Bench <small class="muted">{bench.length}/{G.BENCH_MAX}</small></h3>
              {#if noBackup.length}<span class="muted small">No backup: {noBackup.join(', ')}</span>{/if}
            </div>
            {#each bench as p}{@render playerRow(p, p.pos, false)}{/each}
            {#each Array(openBench) as _, i}
              <div class="prow empty">
                <span class="pill none">BN</span>
                <span class="muted grow">Open bench spot</span>
                {#if i === 0}
                  <select bind:value={walkPos}>{#each G.POSITIONS as p}<option>{p}</option>{/each}</select>
                  <button class="btn sm" onclick={() => G.addWalkOn(g!, walkPos)}>Add walk-on</button>
                {/if}
              </div>
            {/each}
            <p class="muted small pad">Training: {g.focus.length}/{G.MAX_FOCUS}. Players in training improve a little every week. Recruiting fills open spots on signing day.</p>
          </section>
        </div>
      </div>

    {:else if tab === 'recruits'}
      <section class="card rhq">
        <div class="rhq-stats">
          <div class="stat"><b>{recruitingOpen ? g.points : 0}<small>/{G.weeklyPoints(g)}</small></b><small>Points this week</small><span class="meter"><i style="width:{recruitingOpen ? g.points / G.weeklyPoints(g) * 100 : 0}%"></i></span></div>
          <div class="stat"><b>{offers}<small>/{G.MAX_OFFERS}</small></b><small>Open offers</small><span class="meter"><i style="width:{offers / G.MAX_OFFERS * 100}%"></i></span></div>
          <div class="stat"><b>{needs.commits}</b><small>Commits</small></div>
          <div class="stat"><b class:hot={needs.open <= 0}>{needs.open}</b><small>Open spots</small></div>
          <div class="stat"><b>{weeksLeft}</b><small>{weeksLeft === 1 ? 'Week left' : 'Weeks left'}</small></div>
        </div>
        {#if !recruitingOpen}<p class="hint">Recruiting is closed until next season.</p>{/if}
        <div class="needchips" role="group" aria-label="Filter by position">
          <button class="chip" class:on={posFilter === 'ALL'} onclick={() => (posFilter = 'ALL')}>All</button>
          {#each G.POSITIONS as p}
            <button class="chip" class:on={posFilter === p} class:need={needs.need[p] > 0} onclick={() => (posFilter = posFilter === p ? 'ALL' : p)}
              title="{needs.have[p]} returning or committed, {G.STARTERS[p]} starters needed">
              <span class="pill {p}">{p}</span><span>{needs.have[p]}/{G.STARTERS[p]}</span>
            </button>
          {/each}
        </div>
        <p class="muted small">Returning players plus commits against starters needed. Red positions are short, and recruits there gain interest 20% faster.</p>
        {#if commitList.length}
          <div class="classrow">
            <span class="eyebrow">Your class</span>
            {#each commitList as r}<button class="commit" onclick={() => (selId = r.id)}><span class="pill {r.pos}">{r.pos}</span>{r.first[0]}. {r.last}<span class="stars">{'★'.repeat(r.stars)}</span></button>{/each}
          </div>
        {/if}
      </section>

      <div class="rlayout">
        <section class="card flush">
          <div class="rtools">
            <div class="seg">
              {#each [['board', `My board ${boardCount}`], ['open', 'Available'], ['all', 'Everyone']] as [v, l]}
                <button class:on={rView === v} onclick={() => (rView = v as RView)}>{l}</button>
              {/each}
            </div>
            <div class="rselects">
              <select bind:value={starFilter} aria-label="Stars"><option value={0}>All stars</option>{#each [5, 4, 3, 2, 1] as s}<option value={s}>{s} star</option>{/each}</select>
              <select bind:value={rSort} aria-label="Sort">
                <option value="stars">Sort: Stars</option><option value="ovr">Sort: OVR</option>
                <option value="race">Sort: Closest to signing</option><option value="need">Sort: Fills a need</option>
              </select>
            </div>
          </div>
          {#if board.length === 0}
            <p class="muted pad">{rView === 'board' ? 'Nobody on your board yet. Offer recruits from Available.' : 'No recruits match these filters.'}</p>
          {/if}
          <div class="rlist">
            {#each board as r (r.id)}
              {@const st = rStatus(r)}
              <button class="rrow {st.k}" class:sel={sel?.id === r.id} onclick={() => (selId = r.id)} aria-pressed={sel?.id === r.id}>
                <span class="pill {r.pos}" class:need={needs.need[r.pos] > 0}>{r.pos}</span>
                <span class="who">
                  <span class="pname">{r.first} {r.last}</span>
                  <span class="stars">{starStr(r.stars)}</span>
                </span>
                <span class="rmini">
                  <span class="bar" class:ahead={r.interest >= r.rival}><i style="width:{Math.min(100, r.interest / 1.4)}%"></i><em style="left:{Math.min(100, r.rival / 1.4)}%"></em></span>
                  <span class="rstat {st.k}">{st.text}</span>
                </span>
                <span class="nums"><b>{estRange(r)}</b><small>OVR</small></span>
              </button>
              {#if sel?.id === r.id}<div class="rinline">{@render recruitDetail(r)}</div>{/if}
            {/each}
          </div>
        </section>
        <aside class="card rside">
          {#if sel}{@render recruitDetail(sel)}{:else}<p class="muted">Pick a recruit to see his details.</p>{/if}
        </aside>
      </div>

    {:else if tab === 'portal'}
      {#if !portal}
        <section class="card rhq">
          <h3>Transfer portal</h3>
          <p class="muted">The portal opens after the national title game and closes on signing day. Players who don't get the playing time they expected may enter. You can try to win them back, and sign players leaving other schools.</p>
        </section>
        <section class="card flush">
          <div class="cardhead"><h3>Playing time <small class="muted">{atRisk ? `${atRisk} at risk of leaving` : 'Nobody at risk'}</small></h3></div>
          <div class="scroll">
            <table>
              <thead><tr><th>Pos</th><th>Player</th><th class="r">OVR</th><th class="r">Snaps</th><th class="r">Expects</th><th>Mood</th></tr></thead>
              <tbody>
                {#each moods as { p, m } (p.id)}
                  <tr>
                    <td><span class="pill {p.pos}">{p.pos}</span></td>
                    <td><button class="link inline strong" onclick={() => { playerSel = p.id; tab = 'team' }}>{p.first} {p.last}</button> <span class="muted small">{G.YEARS[p.year]}</span><div class="stars">{starStr(p.stars)}</div></td>
                    <td class="r">{Math.round(p.ovr)}</td>
                    <td class="r">{pct(m.share)}</td>
                    <td class="r">{pct(m.expect)}</td>
                    <td><span class="moodcell"><span class="bar" class:ahead={m.share >= m.expect}><i style="width:{m.score}%"></i></span><b class="mood-{m.mood.replace(' ', '-')}">{m.mood}</b></span></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <p class="muted small pad">Expectations grow with stars and class. Walk-ons expect nothing, and freshmen are patient. Use Rotate or Backups 2nd half on game day to get backups snaps.</p>
        </section>
      {:else}
        <section class="card rhq">
          <div class="rhq-stats">
            <div class="stat"><b>{portal.points}<small>/{G.PORTAL_POINTS}</small></b><small>Portal points</small><span class="meter"><i style="width:{portal.points / G.PORTAL_POINTS * 100}%"></i></span></div>
            <div class="stat"><b>{G.portalSigned(g)}<small>/{G.MAX_TRANSFERS}</small></b><small>Transfers signed</small></div>
            <div class="stat"><b>{G.portalOffers(g)}<small>/{G.MAX_PORTAL_OFFERS}</small></b><small>Open offers</small></div>
            <div class="stat"><b class:hot={needs.open <= 0}>{needs.open}</b><small>Open spots</small></div>
          </div>
          <p class="muted small">Points don't refill. Anyone you haven't signed goes to his top rival on signing day, and that includes your own players unless you win them back.</p>
          {#if myEntries.length}
            <div class="classrow">
              <span class="eyebrow">Your players in the portal</span>
              {#each myEntries as e}{@const st = pStatus(e)}<button class="commit {st.k}" onclick={() => { pSelId = e.p.id; pView = 'mine' }}><span class="pill {e.p.pos}">{e.p.pos}</span>{e.p.first[0]}. {e.p.last}<span class="rstat {st.k}">{st.text}</span></button>{/each}
            </div>
          {/if}
        </section>
        <div class="rlayout">
          <section class="card flush">
            <div class="rtools">
              <div class="seg">
                {#each [['all', `Everyone ${portal.entries.length}`], ['mine', `Yours ${myEntries.length}`], ['targets', 'My targets']] as [v, l]}
                  <button class:on={pView === v} onclick={() => (pView = v as PView)}>{l}</button>
                {/each}
              </div>
              <div class="rselects">
                <select bind:value={pPos} aria-label="Position"><option value="ALL">All positions</option>{#each G.POSITIONS as p}<option>{p}</option>{/each}</select>
              </div>
            </div>
            {#if pList.length === 0}<p class="muted pad">Nobody here.</p>{/if}
            <div class="rlist">
              {#each pList as e (e.p.id)}
                {@const st = pStatus(e)}
                {@const from = G.team(g, e.from)}
                <button class="rrow {st.k}" class:sel={pSel?.p.id === e.p.id} onclick={() => (pSelId = e.p.id)} aria-pressed={pSel?.p.id === e.p.id}>
                  <span class="pill {e.p.pos}" class:need={needs.need[e.p.pos] > 0}>{e.p.pos}</span>
                  <span class="who">
                    <span class="pname">{e.p.first} {e.p.last}</span>
                    <span class="psub">{e.from === g.user ? 'Yours' : from.abbr} · {G.YEARS[e.p.year]} · <span class="stars">{'★'.repeat(e.p.stars)}</span></span>
                  </span>
                  <span class="rmini">
                    <span class="bar" class:ahead={e.interest >= e.rival}><i style="width:{Math.min(100, e.interest / 1.4)}%"></i><em style="left:{Math.min(100, e.rival / 1.4)}%"></em></span>
                    <span class="rstat {st.k}">{st.text}</span>
                  </span>
                  <span class="nums"><b>{Math.round(e.p.ovr)}</b><small>OVR</small></span>
                </button>
                {#if pSel?.p.id === e.p.id}<div class="rinline">{@render portalDetail(e)}</div>{/if}
              {/each}
            </div>
          </section>
          <aside class="card rside">
            {#if pSel}{@render portalDetail(pSel)}{:else}<p class="muted">Pick a player to see his details.</p>{/if}
          </aside>
        </div>
      {/if}

    {:else if tab === 'program' && g.ad && g.staff && g.staffMarket}
      {@const ad = g.ad}
      <div class="layout">
        <div class="col">
          <section class="card rhq">
            <div class="cardhead0"><h3>Athletic director</h3><span class="muted small">{g.year} goals</span></div>
            {#each ad.goals as goal}
              {@const pr = G.goalProgress(g, goal)}
              <div class="adgoal" class:done={pr.done}>
                <span class="check">{pr.done ? '✓' : ''}</span>
                <div class="grow"><b>{goal.text}</b><div class="muted small">{pr.now}</div></div>
                <span class="rstat {pr.done ? 'lead' : 'cold'}">{pr.done ? (g.phase === 'offseason' ? 'Met' : 'On track') : g.phase === 'offseason' ? 'Missed' : 'Not yet'}</span>
              </div>
            {/each}
            <div class="hotseat">
              <span class="muted small">Hot seat</span>
              <span class="pips">{#each Array(G.AD_STRIKES) as _, i}<i class:on={i < ad.strikes}></i>{/each}</span>
              <span class="small">{ad.strikes === 0 ? 'Safe' : ad.strikes === G.AD_STRIKES - 1 ? 'One more bad season and you are fired' : `${ad.strikes} strike${ad.strikes > 1 ? 's' : ''}`}</span>
            </div>
            <p class="muted small">Each goal met adds {G.AD_PRESTIGE} prestige and {G.AD_POINTS} recruiting points a week next season{ad.bonus ? ` (this season: +${ad.bonus})` : ''}. Meet fewer than {G.AD_GOALS_TO_PASS} and you get a strike. {G.AD_STRIKES} strikes in a row and you're fired.</p>
          </section>

          <section class="card">
            <div class="cardhead0"><h3>Fan base</h3><span class="fanmood">{G.fanMood(fans)}</span></div>
            <span class="meter wide fanmeter big"><i style="width:{fans}%"></i></span>
            <p class="muted small">Wins fill the stands, especially at home, against ranked teams and in the Spotlight. Losses drain them, and losing to a cupcake is a disaster. Each offseason fans settle toward what your prestige earns, and titles fire them up.</p>
            <ul class="fanfx small">
              <li>A louder home crowd ({fans >= 50 ? 'a bigger' : 'a smaller'} home edge than usual)</li>
              <li>More booster money on signing day</li>
              <li>Bigger interest swings from home game-day visits</li>
              <li>Stadium holds {G.stadiumSeats(g).toLocaleString()}. Stadium upgrades add seats.</li>
            </ul>
          </section>

          <section class="card flush">
            <div class="cardhead"><h3>Facilities</h3><span class="money">${(g.boosters ?? 0).toFixed(1)}M <small class="muted">from boosters</small></span></div>
            {#each G.FACILITY_LIST as f}
              {@const lvl = G.facilityLevel(g, f)}
              {@const cost = G.facilityCost(lvl)}
              <div class="facility">
                <div class="grow">
                  <b>{G.FACILITIES[f].name}</b>
                  <span class="lvl">{#each Array(G.FACILITY_MAX) as _, i}<i class:on={i < lvl}></i>{/each}</span>
                  <div class="muted small">{G.FACILITIES[f].does}.</div>
                </div>
                {#if lvl >= G.FACILITY_MAX}<span class="tag ok">Maxed</span>
                {:else}<button class="btn sm" class:primary={(g.boosters ?? 0) >= cost} disabled={(g.boosters ?? 0) < cost} onclick={() => upgrade(f)}>Upgrade ${cost}M</button>{/if}
              </div>
            {/each}
            <p class="muted small pad">Boosters pay out on signing day: more for wins, titles, AD goals met and players drafted. Upgrades are permanent.</p>
          </section>

          <section class="card flush">
            <div class="cardhead"><h3>Pro draft watch</h3><span class="muted small">Pipeline: {G.pipelinePicks(g)} picks in 3 drafts, +{Math.round(G.pipelineBoost(g) * 100)}% recruiting</span></div>
            {#each watch as w (w.p.id)}
              <div class="facility">
                <span class="pill {w.p.pos}">{w.p.pos}</span>
                <div class="grow"><b>{w.p.first} {w.p.last}</b> <span class="muted small">{G.YEARS[w.p.year]} · {Math.round(w.p.ovr)} OVR</span>
                  {#if w.p.year === 3}<div class="small hot">Junior: {Math.round(G.EARLY_CHANCE * 100)}% chance he leaves early</div>{/if}</div>
                <span class="rstat lead">Round {w.round} · #{w.pick}</span>
              </div>
            {:else}
              <p class="muted small pad">Nobody projected yet. Seniors and juniors rated {G.EARLY_OVR}+ are draft candidates.</p>
            {/each}
            <p class="muted small pad">{G.DRAFT_ROUNDS} rounds of {G.DRAFT_PER_ROUND} on signing day. Each of your picks adds 3% recruiting interest for 3 years (up to 30%) and booster money.</p>
          </section>
        </div>
        <div class="col">
          <section class="card flush">
            <div class="cardhead"><h3>Coaching staff</h3>
              <span class="small" class:hot={pay > budget}>${pay.toFixed(1)}M of ${budget.toFixed(1)}M</span></div>
            <div class="pad0"><span class="meter wide"><i style="width:{Math.min(100, pay / budget * 100)}%"></i></span></div>
            {#each g.staff as c}
              {@render coachRow(c, false)}
              <p class="muted small roledoes">{G.ROLES[c.role].does}.</p>
            {/each}
            <div class="cardhead sub"><h3>Coaches available</h3>
              <span class="muted small">{G.canHire(g) ? 'Hiring is open' : 'Hiring opens after the season'}</span></div>
            {#each g.staffMarket as c (c.id)}{@render coachRow(c, true)}{/each}
            <p class="muted small pad">Your budget grows with prestige. Hiring replaces the coach in that role, and he goes back on the market. New coaches show up every offseason.</p>
          </section>
        </div>
      </div>

    {:else if tab === 'schedule'}
      <section class="card flush">
        <div class="cardhead"><h3>{g.year} schedule</h3>
          <span class="muted small">{siteCount.home} home · {siteCount.away} away{siteCount.neutral ? ` · ${siteCount.neutral} neutral` : ''}</span></div>
        {#each g.schedule.filter(x => x.home === g!.user || x.away === g!.user).sort((a, b) => a.week - b.week) as gm}
          {@const o = oppOf(gm)}
          {@const res = result(gm)}
          {#snippet srowBody()}
            <span class="wk">Wk {gm.week}</span>
            {@render badge(o, 'sm')}
            <div class="grow"><b>{siteOf(gm) === 'away' ? 'at' : 'vs'} <span class="rk">{rk(o.id)}</span>{o.school}</b><div class="muted small"><span class="sitetag sm" class:home={siteOf(gm) === 'home'}>{SITE_LABEL[siteOf(gm)]}</span> {#if gm.played || gm.week === g!.week}<span title={G.WEATHER_TEXT[G.weatherOf(g!, gm)].name}>{G.WEATHER_TEXT[G.weatherOf(g!, gm)].icon}</span>{' '}{/if}{#if gm.spotlight || sameGame(spot, gm)}<span class="spotchip sm">📺 Spotlight</span>{' '}{/if}{gameTag(gm)}{gm.played && gm.rotation ? (gm.rotation >= 0.5 ? ' · backups played 2nd half' : ' · rotated') : ''}</div></div>
            {#if res}<span class="result" class:w={res.w}>{res.w ? 'W' : 'L'} {res.text}</span>{:else}<span class="muted small">Upcoming</span>{/if}
          {/snippet}
          {#if gm.log}
            <button class="srow clickable" class:current={gm.week === g.week && !gm.played} onclick={() => (viewGame = gm)} aria-label="Game log, week {gm.week}">{@render srowBody()}</button>
          {:else}
            <div class="srow" class:current={gm.week === g.week && !gm.played}>{@render srowBody()}</div>
          {/if}
        {/each}
      </section>

    {:else if tab === 'league'}
      {#if spot}
        <section class="card spotcard">
          <span class="spotlogo">📺 Saturday Spotlight · {weekLabel}</span>
          <div class="spotmatch">
            {@render badge(G.team(g, spot.away), 'md')}<b>{rk(spot.away)}{G.team(g, spot.away).school}</b>
            <span class="muted">at</span>
            {@render badge(G.team(g, spot.home), 'md')}<b>{rk(spot.home)}{G.team(g, spot.home).school}</b>
          </div>
          <span class="muted small">{G.WEATHER_TEXT[G.weatherOf(g, spot)].icon} {G.WEATHER_TEXT[G.weatherOf(g, spot)].name} · The winner gets a bump in the poll.</span>
        </section>
      {/if}
      {#if helmetNow || helmetWatch.length}
        <div class="postgrid">
          <section class="card flush">
            <div class="cardhead"><h3>🏈 {G.HELMET} Trophy</h3><span class="muted small">{helmetNow ? `${g.year} winner` : 'Watch list · awarded after title week'}</span></div>
            {#if helmetNow}
              <div class="helmetwin">{@render badge(G.team(g, helmetNow.team), 'md')}<div><b>{helmetNow.pos} {helmetNow.name}</b><div class="muted small">{G.team(g, helmetNow.team).school} · {helmetNow.line}</div></div></div>
              {#each helmetNow.finalists as f}<div class="hrow muted small"><span>Finalist</span><b>{f.pos} {f.name}</b><span>{G.team(g, f.team).abbr} · {f.line}</span></div>{/each}
            {:else}
              {#each helmetWatch as x, i}<div class="hrow" class:me={x.team.id === g.user}><span class="rnum">{i + 1}</span><b>{x.p.pos} {x.p.first} {x.p.last}</b><span class="muted small">{x.team.abbr} · {G.statLine(x.p)}</span></div>{/each}
            {/if}
          </section>
        </div>
      {/if}
      <div class="ranklayout">
        <section class="card flush">
          <div class="cardhead">
            <h3>National rankings <small class="muted">{pollTitle}</small></h3>
            <button class="btn sm" onclick={() => (showAllRanks = !showAllRanks)}>{showAllRanks ? `Top ${G.TOP_N}` : `All ${ranks.length}`}</button>
          </div>
          <div class="scroll">
            <table class="poll">
              <thead><tr><th class="r">#</th><th></th><th>Team</th><th class="r">Record</th><th class="r" title="Strength of schedule rank, 1 is hardest">SOS</th><th class="hide-sm">Conf</th><th class="r">Score</th></tr></thead>
              <tbody>
                {#each ranks.filter(r => showAllRanks || r.rank <= G.TOP_N || r.team.id === g!.user) as r (r.team.id)}
                  {@const mv = r.prev === null ? 0 : r.prev - r.rank}
                  <tr class:me={r.team.id === g.user} class:unranked={r.rank > G.TOP_N}>
                    <td class="r rnum">{r.rank > G.TOP_N ? 'NR' : r.rank}</td>
                    <td class="mv {mv > 0 ? 'up' : mv < 0 ? 'down' : ''}">{mv > 0 ? `▲${mv}` : mv < 0 ? `▼${-mv}` : r.prev === null ? '' : '–'}</td>
                    <td><div class="tcell">{@render badge(r.team, 'sm')} <button class="link inline strong" onclick={() => openEdit(r.team.id)}>{r.team.school}</button>{#if r.team.champ}<span class="tag ok">Champs</span>{/if}</div></td>
                    <td class="r">{r.w}-{r.l}</td>
                    <td class="r">{pollWeek ? r.sosRank : '–'}</td>
                    <td class="small muted hide-sm">{g.confNames[r.team.conf]}</td>
                    <td class="r"><b>{r.score.toFixed(1)}</b></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          <p class="muted small pad">
            Score blends win % ({G.RANK_WEIGHTS.winPct * 100}%), strength of schedule ({G.RANK_WEIGHTS.sos * 100}%) and conference strength ({G.RANK_WEIGHTS.conf * 100}%).
            Strength of schedule is your opponents' record (2/3) and their opponents' record (1/3), and cupcakes drag it down.
            Before week 1 the poll is prestige, and that fades as games are played. Conference champions make the playoff, seeded by this ranking.
          </p>
        </section>

        <section class="card flush">
          <div class="cardhead"><h3>Conference strength</h3></div>
          {#each [...confRanks].sort((a, b) => a.rank - b.rank) as c}
            <div class="confrow" class:me={c.conf === me.conf}>
              <span class="rnum">{c.rank}</span>
              <div class="grow">
                <b>{c.name}</b>
                <div class="muted small">Prestige {c.prestige.toFixed(1)} · Non-conference {c.ncW}-{c.ncL}</div>
                <span class="meter wide"><i style="width:{c.strength * 100}%"></i></span>
              </div>
              <b class="cscore">{(c.strength * 100).toFixed(0)}</b>
            </div>
          {/each}
          <p class="muted small pad">Starts as the average prestige of its schools. Non-conference results take over as the season goes on.</p>
        </section>
      </div>

      <div class="grid2">
        {#each [0, 1, 2, 3] as c}
          <section class="card flush">
            <div class="cardhead"><h3>{g.confNames[c]}</h3></div>
            <table>
              <thead><tr><th>#</th><th>Team</th><th class="r">Conf</th><th class="r">All</th><th class="r">Prestige</th></tr></thead>
              <tbody>
                {#each G.confStandings(g, c) as t, i}
                  <tr class:me={t.id === g.user}>
                    <td>{i + 1}</td>
                    <td><div class="tcell">{@render badge(t, 'sm')} <button class="link inline strong" onclick={() => openEdit(t.id)}><span class="rk">{rk(t.id)}</span>{t.school}</button>{#if t.champ}<span class="tag ok">Champs</span>{:else if t.confChamp}<span class="tag">Conf champs</span>{/if}</div></td>
                    <td class="r">{t.cw}-{t.cl}</td><td class="r">{t.w}-{t.l}</td><td class="r">{t.prestige.toFixed(1)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </section>
        {/each}
      </div>

    {:else if tab === 'postseason' && proj}
      <section class="card rhq">
        <div class="cardhead0"><h3>{proj.projected ? 'Postseason projection' : g.phase === 'offseason' ? `${g.year} postseason` : 'The postseason field is set'}</h3>
          <span class="muted small">{proj.projected ? `If the season ended today · poll after ${G.lastPlayedWeek(g) ? `week ${G.lastPlayedWeek(g)}` : 'preseason'}` : 'Results fill in as games are played'}</span></div>
        <p class="myproj">{myProjection}</p>
        {#if proj.projected}<p class="muted small">Each conference's leader takes its automatic spot as projected champion (C). The poll fills the other playoff spots and the bowls, among teams on pace for {6}+ wins. The real field is picked after conference title week.</p>{/if}
      </section>
      <div class="postgrid">
        <section class="card flush bracketcard">
          <div class="cardhead"><h3>{proj.projected ? 'Projected playoff' : 'Playoff'}</h3><span class="muted small">8 teams · seeded by rank</span></div>
          <div class="bracket">
            {#each [['Quarterfinals', proj.quarters], ['Semifinals', proj.projected ? [] : semis], ['Title game', !proj.projected && finalGame ? [finalGame] : []]] as [label, games]}
              <div class="round"><span class="eyebrow">{label}</span>
                <div class="rgames">{#each games as Game[] as x}{@render bracketGame(x, proj.champs)}{:else}<div class="bgame tbd muted small">To be decided</div>{/each}</div></div>
            {/each}
          </div>
        </section>
        <section class="card flush">
          <div class="cardhead"><h3>{proj.projected ? 'Projected bowls' : 'Bowl games'}</h3></div>
          {#each proj.bowls as x}
            {@const b = G.BOWLS[x.bowl ?? 0]}
            {@const h = G.team(g, x.home)}
            {@const a = G.team(g, x.away)}
            <div class="bowlrow" class:me={x.home === g.user || x.away === g.user}>
              <span class="bowlicon">{b.icon}</span>
              <div class="grow"><b>{b.name}</b><div class="small">
                <span class:win={x.played && x.hs! > x.as!}>{rk(h.id)}{h.school} ({proj.projected ? `on pace for ${G.projectedWins(g, h)}-${12 - G.projectedWins(g, h)}` : `${h.w}-${h.l}`}){x.played ? ` ${x.hs}` : ''}</span> vs
                <span class:win={x.played && x.as! > x.hs!}>{rk(a.id)}{a.school} ({proj.projected ? `on pace for ${G.projectedWins(g, a)}-${12 - G.projectedWins(g, a)}` : `${a.w}-${a.l}`}){x.played ? ` ${x.as}` : ''}</span></div></div>
            </div>
          {:else}
            <p class="muted pad">Not enough teams on pace for 6 wins yet.</p>
          {/each}
        </section>
        <section class="card flush">
          <div class="cardhead"><h3>On the bubble</h3></div>
          <div class="bubblehead eyebrow">First teams out of the playoff</div>
          {#each proj.firstOut as t, i}
            <div class="hrow" class:me={t.id === g.user}><span class="rnum">{i + 1}</span><b>{rk(t.id)}{t.school}</b><span class="muted small">{t.w}-{t.l} · {g.confNames[t.conf]}</span></div>
          {/each}
          {#if proj.projected && proj.bowlBubble.length}
            <div class="bubblehead eyebrow">Bowl bubble</div>
            {#each proj.bowlBubble as t}
              <div class="hrow" class:me={t.id === g.user}><span></span><b>{t.school}</b><span class="muted small">{t.w}-{t.l} · on pace for {G.projectedWins(g, t)} wins</span></div>
            {/each}
          {/if}
        </section>
      </div>

    {:else if tab === 'history'}
      <section class="card flush">
        <div class="cardhead"><h3>Program history</h3></div>
        {#if g.history.length === 0}<p class="muted pad">Finish a season to start your history.</p>{/if}
        {#each g.history as h}
          <div class="srow"><span class="wk">{h.year}</span><b class="grow">{h.finish}</b><span>{h.record}</span><span class="muted small">Prestige {h.prestige}</span></div>
        {/each}
      </section>
      {#if g.awards?.length}
        <section class="card flush draftboard">
          <div class="cardhead"><h3>🏈 {G.HELMET} winners</h3></div>
          {#each g.awards as a}
            <div class="srow" class:current={a.team === g.user}><span class="wk">{a.year}</span>{@render badge(G.team(g, a.team), 'sm')}<div class="grow"><b>{a.pos} {a.name}</b><div class="muted small">{G.team(g, a.team).school} · {a.line}</div></div></div>
          {/each}
        </section>
      {/if}
      {#if g.drafts?.length}
        {@const d = g.drafts[Math.min(draftYear, g.drafts.length - 1)]}
        <section class="card flush draftboard">
          <div class="cardhead"><h3>Pro draft</h3>
            <select bind:value={draftYear} aria-label="Draft year">{#each g.drafts as x, i}<option value={i}>{x.year + 1} draft · {x.picks.filter(p => p.team === g!.user).length} yours</option>{/each}</select></div>
          <div class="scroll">
            <table>
              <thead><tr><th class="r">Pick</th><th>Rd</th><th>Player</th><th class="r">OVR</th><th>School</th></tr></thead>
              <tbody>
                {#each d.picks as x}
                  <tr class:me={x.team === g.user}>
                    <td class="r rnum">{x.pick}</td><td>{x.round}</td>
                    <td><span class="pill {x.pos}">{x.pos}</span> {x.name}{#if x.early} <span class="tag">Early</span>{/if}</td>
                    <td class="r">{x.ovr}</td>
                    <td><div class="tcell">{@render badge(g.teams[x.team], 'sm')} {g.teams[x.team].school}</div></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </section>
      {/if}
    {:else if tab === 'settings'}
      {@const st = G.settingsOf(g)}
      <div class="layout">
        <div class="col">
          <section class="card">
            <h3>Gameplay</h3>
            <h4>Recruiting difficulty</h4>
            <div class="seg">
              {#each [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']] as [v, l]}
                <button class:on={st.difficulty === v} onclick={() => G.setSetting(g!, 'difficulty', v as any)}>{l}</button>
              {/each}
            </div>
            <p class="muted small">How much interest each recruiting point buys.</p>
            <h4>Injuries</h4>
            <div class="seg">
              {#each [['off', 'Off'], ['normal', 'Normal'], ['high', 'High']] as [v, l]}
                <button class:on={st.injuries === v} onclick={() => G.setSetting(g!, 'injuries', v as any)}>{l}</button>
              {/each}
            </div>
            <p class="muted small">High injuries make your bench choices matter more.</p>
          </section>
          <section class="card">
            <h3>Appearance</h3>
            <h4>Theme</h4>
            <div class="seg">
              {#each [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']] as [v, l]}
                <button class:on={theme === v} onclick={() => (theme = v as any)}>{l}</button>
              {/each}
            </div>
            <h4>App</h4>
            {#if installed}
              <p class="muted small">You're playing the installed app. It works offline.</p>
            {:else if installEvt}
              <button class="btn primary" onclick={install}>Install app</button>
              <p class="muted small">Adds Pixel Football to your home screen or desktop. It opens in its own window and works offline.</p>
            {:else if isIOS}
              <p class="muted small">To install on iPhone or iPad, tap Share in Safari, then Add to Home Screen. It works offline once installed.</p>
            {:else}
              <p class="muted small">Your browser can install this as an app from its menu (look for Install or Add to Home Screen). Once it's loaded, it works offline.</p>
            {/if}
          </section>
          <section class="card">
            <h3>Save</h3>
            <p class="muted small">Your career saves in this browser automatically. Copy it to back it up or move it to another device.</p>
            <button class="btn" onclick={copySave}>Copy save</button>
            <h4>Load a save</h4>
            <textarea bind:value={pasteText} rows="3" placeholder="Paste a copied save here"></textarea>
            <button class="btn" disabled={!pasteText.trim()} onclick={loadSave}>Load save</button>
            <h4>Start over</h4>
            <button class="btn danger" onclick={reset}>{confirmReset ? 'Click again to wipe this career' : 'New career'}</button>
          </section>
        </div>
        <div class="col">
          <section class="card flush">
            <div class="cardhead"><h3>Teams and conferences</h3></div>
            <p class="muted small pad">Rename any school or conference. Moving a school to another conference is only possible before week 1 of a season.</p>
            {#each [0, 1, 2, 3] as c}
              <div class="confedit">
                <input class="confname" value={g.confNames[c]} onchange={(e) => G.renameConf(g!, c, (e.currentTarget as HTMLInputElement).value)} aria-label="Conference name" />
                {#each g.teams.filter(t => t.conf === c) as t}
                  <button class="erow" onclick={() => openEdit(t.id)}>
                    {@render badge(t, 'sm')}
                    <span class="grow"><b>{t.school}</b> <span class="muted">{t.mascot}</span></span>
                    <span class="muted small">Edit</span>
                  </button>
                {/each}
              </div>
            {/each}
          </section>
        </div>
      </div>
    {/if}
  </main>

  {#if g.report}
    {@const r = g.report}
    <div class="modal">
      <div class="card">
        <div class="eyebrow">Signing day</div>
        <h2>{r.year} season recap</h2>
        <p>{r.record} · {r.finish} · Prestige {r.prestigeBefore.toFixed(1)} to <b>{r.prestigeAfter.toFixed(1)}</b></p>
        <div class="cols">
          <div><h4>Graduated</h4>{#each r.graduated as x}<div>{x}</div>{:else}<div class="muted">None</div>{/each}</div>
          <div><h4>Signed</h4>{#each r.signed as x}<div>{x}</div>{:else}<div class="muted">Nobody signed.</div>{/each}
            {#if r.walkOns}<div class="muted">{r.walkOns} walk-on{r.walkOns > 1 ? 's' : ''} filled empty starting spots</div>{/if}</div>
          {#if r.transfersIn?.length || r.transfersOut?.length}
            <div><h4>Transfers in</h4>{#each r.transfersIn ?? [] as x}<div>{x}</div>{:else}<div class="muted">None</div>{/each}
              <h4>Transfers out</h4>{#each r.transfersOut ?? [] as x}<div>{x}</div>{:else}<div class="muted">None</div>{/each}</div>
          {/if}
          {#if r.drafted}
            <div><h4>Drafted</h4>{#each r.drafted as x}<div>{x}</div>{:else}<div class="muted">Nobody drafted</div>{/each}
              {#if r.boosters !== undefined}<h4>Boosters</h4><div>+${r.boosters.toFixed(1)}M for facilities</div>{/if}</div>
          {/if}
          <div><h4>Big jumps</h4>{#each r.bigJumps as x}<div>{x}</div>{:else}<div class="muted">No big jumps</div>{/each}</div>
        </div>
        {#if r.ad}
          <div class="adbox" class:bad={r.ad.met < G.AD_GOALS_TO_PASS}>
            <b>Athletic director: {r.ad.met} of {r.ad.total} goals met</b>
            {#each r.ad.lines as x}<div class="small">{x}</div>{/each}
            <div class="small muted">{r.ad.fired ? 'You have been fired.' : r.ad.strikes ? `Hot seat: ${r.ad.strikes} of ${G.AD_STRIKES} strikes.` : 'Your job is safe.'}</div>
          </div>
        {/if}
        {#if r.cut.length}<p class="muted small">Cut to get down to {G.ROSTER_MAX}: {r.cut.join(', ')}</p>{/if}
        <button class="btn primary block" onclick={() => (g!.report = null)}>{g.fired ? 'See job offers' : `Start the ${g.year} season`}</button>
      </div>
    </div>
  {:else if g.fired}
    <div class="modal" role="dialog" aria-modal="true" aria-label="Fired">
      <div class="card editor">
        <div class="eyebrow">Athletic director</div>
        <h2>You've been fired</h2>
        <p class="muted">{G.AD_STRIKES} seasons in a row without meeting the AD's goals. A few smaller programs want you.</p>
        {#each g.fired.offers as id}
          {@const t = g.teams[id]}
          <button class="pick" onclick={() => { G.takeJob(g!, id); tab = 'team'; flash(`Welcome to ${t.school}.`) }}>
            {@render badge(t, 'md')}
            <span class="grow"><b>{t.school}</b><small>{g.confNames[t.conf]} · Prestige {t.prestige.toFixed(1)}</small></span>
            <span class="btn sm primary">Take the job</span>
          </button>
        {/each}
        <button class="btn danger" onclick={reset}>{confirmReset ? 'Click again to wipe this career' : 'Retire and start a new career'}</button>
      </div>
    </div>
  {:else if g.recap}
    {@const rc = g.recap}
    {@const ro = rc.result ? G.team(g, rc.result.opp) : null}
    {@const mv = rc.rankBefore - rc.rankAfter}
    <div class="modal" role="dialog" aria-modal="true" aria-label="Weekly recap">
      <div class="card recap">
        <div class="eyebrow">{rc.label}{rc.result ? ` · ${typeTag[rc.result.type]}` : ''}</div>
        {#if rc.result && ro}
          <div class="recap-score" class:win={rc.result.win}>
            {@render badge(me, 'md')}
            <b>{rc.result.my}</b><span class="dash">–</span><b>{rc.result.their}</b>
            {@render badge(ro, 'md')}
          </div>
          <h2>{rc.result.win ? 'Win' : 'Loss'} {rc.result.home ? 'vs' : 'at'} {ro.school}</h2>
          {@const rg = g.schedule.find(x => x.week === rc.week && (x.home === g!.user || x.away === g!.user))}
          {#if rg?.log}
            {@render boxScore(rg)}
            <button class="link inline" onclick={() => (showDrives = !showDrives)}>{showDrives ? 'Hide' : 'Show'} the drive-by-drive log</button>
            {#if showDrives}<div class="recaplog">{@render gameLog(rg, false)}</div>{/if}
          {/if}
        {:else}
          <h2>{rc.label} results</h2>
        {/if}
        <div class="recap-rank">
          <span>National rank</span>
          <b>{rc.rankBefore <= G.TOP_N ? `#${rc.rankBefore}` : 'NR'} → {rc.rankAfter <= G.TOP_N ? `#${rc.rankAfter}` : 'NR'}</b>
          {#if mv}<span class="mv {mv > 0 ? 'up' : 'down'}">{mv > 0 ? `▲${mv}` : `▼${-mv}`}</span>{/if}
          <span class="grow"></span>
          <span>Fans</span><b>{G.fanMood(fans)}</b>
          {#if rc.result?.fanDelta}<span class="mv {rc.result.fanDelta > 0 ? 'up' : 'down'}">{rc.result.fanDelta > 0 ? `▲${rc.result.fanDelta}` : `▼${-rc.result.fanDelta}`}</span>{/if}
        </div>
        {#if rc.lines.length}
          <ul class="recap-lines">
            {#each rc.lines as l}<li class={l.kind}><span class="ico">{RECAP_ICON[l.kind]}</span>{l.text}</li>{/each}
          </ul>
        {:else}
          <p class="muted">A quiet week otherwise.</p>
        {/if}
        <button class="btn primary block" onclick={() => { g!.recap = null; showDrives = false }}>{g.phase === 'offseason' ? 'On to the offseason' : `Continue to ${G.weekName(g.week).toLowerCase()}`}</button>
      </div>
    </div>
  {/if}


  {#if editId !== null}
    {@const et = G.team(g, editId)}
    <div class="modal" role="dialog" aria-modal="true" aria-label="Edit team">
      <div class="card editor">
        <div class="preview">
          <span class="badge lg" style="--c:{draft.color}">{draft.abbr.toUpperCase().slice(0, 4) || '?'}</span>
          <div><div class="tname">{draft.school || 'School'}</div><div class="muted">{draft.mascot || 'Mascot'}</div></div>
        </div>
        <label class="field">School<input bind:value={draft.school} maxlength="28" /></label>
        <div class="two">
          <label class="field">Mascot<input bind:value={draft.mascot} maxlength="20" /></label>
          <label class="field">Abbreviation<input bind:value={draft.abbr} maxlength="4" /></label>
        </div>
        <div class="field">Color
          <div class="swatches">
            {#each G.TEAM_COLORS as c}<button class="sw" class:on={draft.color === c} style="background:{c}" onclick={() => (draft.color = c)} aria-label="Color {c}"></button>{/each}
            <input type="color" bind:value={draft.color} aria-label="Custom color" />
          </div>
        </div>
        {#if et.conf >= 0}
          <div class="field">Conference: <b>{g.confNames[et.conf]}</b>
            {#if G.canRealign(g)}
              <div class="two">
                <select bind:value={swapWith}>
                  <option value={-1}>Swap places with...</option>
                  {#each [0, 1, 2, 3].filter(c => c !== et.conf) as c}
                    <optgroup label={g.confNames[c]}>{#each g.teams.filter(t => t.conf === c) as t}<option value={t.id}>{t.school}</option>{/each}</optgroup>
                  {/each}
                </select>
                <button class="btn" disabled={swapWith < 0} onclick={doRealign}>Swap</button>
              </div>
            {:else}
              <p class="muted small">Conference moves open at the start of next season, before week 1.</p>
            {/if}
          </div>
        {/if}
        {#if editErr}<p class="hint">{editErr}</p>{/if}
        <div class="two">
          <button class="btn" onclick={() => (editId = null)}>Cancel</button>
          <button class="btn primary" onclick={saveEdit}>Save team</button>
        </div>
      </div>
    </div>
  {/if}
  {#if viewGame}
    {@const vg = viewGame}
    <div class="modal" role="dialog" aria-modal="true" aria-label="Game log" onclick={(e) => e.target === e.currentTarget && (viewGame = null)}
      onkeydown={(e) => e.key === 'Escape' && (viewGame = null)} tabindex="-1">
      <div class="card recap">
        <div class="cardhead0"><div class="eyebrow">{G.weekName(vg.week)} · {gameTag(vg)}</div><button class="btn sm" onclick={() => (viewGame = null)}>Close</button></div>
        <h2>{G.team(g, vg.away).school} at {G.team(g, vg.home).school}</h2>
        {@render gameLog(vg)}
      </div>
    </div>
  {/if}
  {#if toast}<div class="toast">{toast}</div>{/if}
{/if}
