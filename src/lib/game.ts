// Pixel Football Manager: game logic. Pure functions that mutate a plain state object.

export type Pos = 'QB' | 'RB' | 'TE' | 'WR' | 'DL' | 'LB' | 'DB' | 'K'
export type Dev = 'Slow' | 'Normal' | 'Fast' | 'Elite'

export interface Player {
  id: number; first: string; last: string; pos: Pos; year: number
  ovr: number; pot: number; dev: Dev; stars: number; snaps: number; walkOn?: boolean; inj?: number; lock?: boolean
}
export interface Team {
  id: number; school: string; mascot: string; abbr: string; color: string
  conf: number; prestige: number; roster: Player[]
  w: number; l: number; cw: number; cl: number
  confChamp?: boolean; playoff?: boolean; champ?: boolean
}
export type GameType = 'cupcake' | 'nonconf' | 'conf' | 'ccg' | 'semi' | 'final'
export interface Game {
  week: number; home: number; away: number; type: GameType
  hs?: number; as?: number; played: boolean; rotation?: number
}
export interface Recruit {
  id: number; first: string; last: string; pos: Pos; stars: number
  ovr: number; pot: number; dev: Dev; scouted: boolean; offered: boolean; visited: boolean
  interest: number; rival: number; rivalTeam: number; committed: number | null
}
export interface SeasonReport {
  year: number; record: string; finish: string; prestigeBefore: number; prestigeAfter: number
  graduated: string[]; signed: string[]; cut: string[]; walkOns: number; bigJumps: string[]
  transfersIn?: string[]; transfersOut?: string[]
}
export interface PortalEntry {
  /** A copy of the player when he entered. The real one stays on his old roster until signing day. */
  p: Player; from: number; reason: string
  interest: number; rival: number; rivalTeam: number; offered: boolean; visited: boolean
  /** null until he picks a school. During the window only the user can land him; rivals take the rest on signing day. */
  to: number | null
}
export interface Portal { points: number; entries: PortalEntry[] }
export interface Settings { difficulty: 'easy' | 'normal' | 'hard'; injuries: 'off' | 'normal' | 'high' }
export const DEFAULT_SETTINGS: Settings = { difficulty: 'normal', injuries: 'normal' }
export const settingsOf = (g: State): Settings => ({ ...DEFAULT_SETTINGS, ...(g.settings ?? {}) })
const DIFF_MULT = { easy: 1.35, normal: 1, hard: 0.75 }
const INJ_MULT = { off: 0, normal: 1, high: 2 }
export interface State {
  settings?: Settings
  version: number; seed: number; nextId: number
  year: number; week: number; phase: 'season' | 'offseason'
  user: number; teams: Team[]; cupcakes: Team[]; confNames: string[]
  schedule: Game[]; recruits: Recruit[]; points: number; focus: number[]
  rotation: number; news: string[]; history: { year: number; record: string; finish: string; prestige: number }[]
  champion: number | null; report: SeasonReport | null
  portal?: Portal | null
}

// ---------- RNG (seeded so a save replays the same way) ----------
let s = 1
export function setSeed(n: number) { s = n >>> 0 || 1 }
export function getSeed() { return s }
function rnd() {
  s = (s + 0x6d2b79f5) >>> 0
  let t = s
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}
const ri = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))
const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)]
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]] }
  return arr
}

// ---------- Constants ----------
export const SLOTS: Pos[] = ['QB', 'RB', 'TE', 'WR', 'WR', 'DL', 'DL', 'LB', 'LB', 'DB', 'DB', 'K']
export const POSITIONS: Pos[] = ['QB', 'RB', 'TE', 'WR', 'DL', 'LB', 'DB', 'K']
export const STARTERS: Record<Pos, number> = { QB: 1, RB: 1, TE: 1, WR: 2, DL: 2, LB: 2, DB: 2, K: 1 }
export const GROUP: Record<Pos, number> = { QB: 2, RB: 2, TE: 2, WR: 4, DL: 4, LB: 4, DB: 4, K: 2 }
export const ROSTER_MAX = 20
export const BENCH_MAX = 8
const AI_BENCH: Pos[] = ['QB', 'RB', 'WR', 'WR', 'DL', 'DL', 'LB', 'DB']
export const POINTS_PER_WEEK = 100
export const MAX_OFFERS = 12
export const MAX_FOCUS = 3
export const REGULAR_WEEKS = 12
export const COST = { contact: 10, scout: 10, visit: 30 }
const DEV_MULT: Record<Dev, number> = { Slow: 0.7, Normal: 1, Fast: 1.3, Elite: 1.6 }

const FIRST = ['Jalen', 'Marcus', 'Tyler', 'Caleb', 'Deshawn', 'Brady', 'Isaiah', 'Cole', 'Trey', 'Jaylen', 'Mason', 'Darius', 'Eli', 'Bryce', 'Xavier', 'Hunter', 'Malik', 'Grant', 'Tre', 'Owen', 'Jordan', 'Kendrick', 'Luke', 'Andre', 'Zion', 'Wyatt', 'Cam', 'Jace', 'Rashad', 'Noah', 'Dante', 'Colby', 'Micah', 'Quinn', 'Silas', 'Rico', 'Tanner', 'Amari', 'Beau', 'Kobe']
const LAST = ['Johnson', 'Carter', 'Hughes', 'Ward', 'Bishop', 'Reeves', 'Coleman', 'Price', 'Hale', 'Brooks', 'Sanders', 'Fletcher', 'Mack', 'Dawson', 'Pryor', 'Tate', 'Holloway', 'Banks', 'Whitaker', 'Greer', 'Vance', 'Moody', 'Booker', 'Pruitt', 'Lyle', 'Combs', 'Sutton', 'Rivers', 'Fox', 'Barnes', 'Oakley', 'Stroud', 'Pace', 'Kemp', 'McCoy', 'Hester', 'Rollins', 'Duke', 'Ingram', 'Shaw']

const CONFS = ['Ridge Conference', 'Gulf Coast', 'Heartland 8', 'Pacific Frontier']
// school, mascot, abbr, color, base prestige
const SCHOOLS: [string, string, string, string, number][] = [
  ['Cumberland', 'Wolves', 'CUM', '#c2410c', 7], ['Blue Ridge State', 'Hawks', 'BRS', '#1d4ed8', 6], ['Holston', 'Rivermen', 'HOL', '#15803d', 4], ['Watauga Tech', 'Engineers', 'WAT', '#b91c1c', 3],
  ['Clinch Valley', 'Miners', 'CLV', '#525252', 2], ['Smoky Mountain', 'Bears', 'SMU', '#7c3aed', 8], ['Chattahoochee', 'Gators', 'CHA', '#0f766e', 5], ['Pine Bluff A&M', 'Owls', 'PBA', '#a16207', 2],
  ['Bayou State', 'Pelicans', 'BAY', '#9333ea', 9], ['Mobile Bay', 'Mariners', 'MOB', '#0369a1', 5], ['Galveston', 'Storm', 'GAL', '#dc2626', 4], ['Tallahassee Tech', 'Seminoles', 'TTE', '#9f1239', 7],
  ['Coastal Carolina A&M', 'Pirates', 'CCA', '#0d9488', 3], ['Okefenokee', 'Cranes', 'OKE', '#4d7c0f', 1], ['Sabine', 'Cajuns', 'SAB', '#ca8a04', 3], ['Pensacola', 'Admirals', 'PEN', '#1e3a8a', 6],
  ['Prairie State', 'Bison', 'PRS', '#92400e', 8], ['Ozark', 'Razorbacks', 'OZK', '#991b1b', 6], ['Platte River', 'Huskers', 'PLR', '#b91c1c', 7], ['Cedar Falls', 'Panthers', 'CDF', '#6d28d9', 3],
  ['Wichita Tech', 'Shockers', 'WIT', '#eab308', 4], ['Des Plaines', 'Foxes', 'DPL', '#c2410c', 2], ['Kankakee', 'Thunder', 'KAN', '#334155', 1], ['Missouri Valley', 'Mules', 'MOV', '#0f766e', 5],
  ['Cascade', 'Ducks', 'CAS', '#16a34a', 8], ['Sierra State', 'Grizzlies', 'SIS', '#1e40af', 7], ['Mojave', 'Scorpions', 'MOJ', '#d97706', 3], ['Willamette', 'Beavers', 'WIL', '#ea580c', 5],
  ['Puget Sound', 'Orcas', 'PUG', '#0e7490', 4], ['High Desert', 'Coyotes', 'HDS', '#a8a29e', 2], ['Big Sur', 'Condors', 'BSU', '#be123c', 6], ['Tahoe', 'Avalanche', 'TAH', '#2563eb', 1],
]
const CUPCAKES: [string, string, string][] = [
  ['Northwest Directional', 'Sheep', 'NWD'], ['Little Rock Christian', 'Lambs', 'LRC'], ['Saint Agnes', 'Doves', 'SAG'], ['Eastern Lowland', 'Moles', 'ELO'],
  ['Valley Tech JC', 'Gnats', 'VTJ'], ['Mount Pleasant', 'Kittens', 'MTP'], ['Ferris Junction', 'Ducklings', 'FJN'], ['Cobb County Poly', 'Hamsters', 'CCP'],
]

// ---------- Generation ----------
function rollDev(): Dev { const r = rnd(); return r < 0.2 ? 'Slow' : r < 0.75 ? 'Normal' : r < 0.95 ? 'Fast' : 'Elite' }
function ratingsForStars(stars: number) {
  const base = [0, 40, 46, 52, 58, 64][stars]
  const ovr = base + ri(0, 10)
  const pot = clamp(ovr + ri(10, 20) + stars * 2, 0, 99)
  return { ovr, pot }
}
function newId(g: State) { return g.nextId++ }
function makePlayer(g: State, pos: Pos, stars: number, year: number, walkOn = false): Player {
  let { ovr, pot } = ratingsForStars(stars)
  if (walkOn) { ovr -= 4; pot -= 6 }
  const dev = rollDev()
  for (let y = 1; y < year; y++) ovr = Math.min(pot, ovr + Math.round((pot - ovr) * 0.3 * DEV_MULT[dev]) + ri(0, 2))
  return { id: newId(g), first: pick(FIRST), last: pick(LAST), pos, year, ovr, pot, dev, stars, snaps: 0, walkOn }
}
function starsForPrestige(p: number) { return clamp(Math.round(p / 2.3 + rnd() * 1.8 - 0.4), 1, 5) }

function buildRoster(g: State, prestige: number): Player[] {
  const roster: Player[] = []
  for (const pos of [...SLOTS, ...AI_BENCH]) roster.push(makePlayer(g, pos, starsForPrestige(prestige), ri(1, 4)))
  return roster
}

export function newGame(userIndex: number, seed = Date.now()): State {
  setSeed(seed)
  const g: State = {
    version: 1, seed, nextId: 1, year: 2027, week: 1, phase: 'season', user: userIndex,
    teams: [], cupcakes: [], confNames: CONFS, schedule: [], recruits: [], points: POINTS_PER_WEEK,
    focus: [], rotation: 0, news: [], history: [], champion: null, report: null, settings: { ...DEFAULT_SETTINGS },
  }
  g.teams = SCHOOLS.map(([school, mascot, abbr, color, p], i) => ({
    id: i, school, mascot, abbr, color, conf: Math.floor(i / 8), prestige: p + Math.round(rnd() * 10) / 10,
    roster: [], w: 0, l: 0, cw: 0, cl: 0,
  }))
  for (const t of g.teams) t.roster = buildRoster(g, t.prestige)
  g.cupcakes = CUPCAKES.map(([school, mascot, abbr], i) => ({
    id: 100 + i, school, mascot, abbr, color: '#78716c', conf: -1, prestige: 0.5,
    roster: [...SLOTS, ...AI_BENCH].map(pos => makePlayer(g, pos, 1, ri(1, 4), true)),
    w: 0, l: 0, cw: 0, cl: 0,
  }))
  g.schedule = makeSchedule(g)
  g.recruits = makeRecruits(g)
  g.news.unshift(`Welcome to ${g.teams[userIndex].school}. Your first season kicks off with a cupcake game.`)
  g.seed = getSeed()
  return g
}
export const SCHOOL_LIST = SCHOOLS.map(([school, mascot, , color, p], i) => ({ i, school, mascot, color, prestige: p, conf: CONFS[Math.floor(i / 8)] }))

function makeSchedule(g: State): Game[] {
  const games: Game[] = []
  const confs = [0, 1, 2, 3].map(c => g.teams.filter(t => t.conf === c).map(t => t.id))
  // cupcake weeks
  for (const week of [1, 4]) for (const t of g.teams) games.push({ week, home: t.id, away: pick(g.cupcakes).id, type: 'cupcake', played: false })
  // nonconference vs other conferences
  const pairings: [number, number, number][] = [[2, 0, 1], [3, 0, 2], [12, 0, 3]]
  for (const [week, a, b] of pairings) {
    const others = [0, 1, 2, 3].filter(c => c !== a && c !== b)
    for (const [x, y] of [[a, b], [others[0], others[1]]]) {
      const ys = shuffle([...confs[y]])
      confs[x].forEach((tid, i) => { const home = rnd() < 0.5; games.push({ week, home: home ? tid : ys[i], away: home ? ys[i] : tid, type: 'nonconf', played: false }) })
    }
  }
  // conference round robin, weeks 5 to 11 (circle method)
  for (const conf of confs) {
    const arr = shuffle([...conf])
    for (let r = 0; r < 7; r++) {
      for (let i = 0; i < 4; i++) {
        const a = arr[i], b = arr[7 - i]
        const home = (r + i) % 2 === 0
        games.push({ week: 5 + r, home: home ? a : b, away: home ? b : a, type: 'conf', played: false })
      }
      arr.splice(1, 0, arr.pop()!)
    }
  }
  return games
}

function starRoll() { const r = rnd(); return r < 0.04 ? 5 : r < 0.18 ? 4 : r < 0.53 ? 3 : r < 0.83 ? 2 : 1 }
function makeRecruits(g: State): Recruit[] {
  const list: Recruit[] = []
  const weights: Pos[] = ['QB', 'RB', 'RB', 'TE', 'WR', 'WR', 'WR', 'DL', 'DL', 'DL', 'LB', 'LB', 'LB', 'DB', 'DB', 'DB', 'K']
  for (let i = 0; i < 130; i++) {
    const stars = starRoll()
    const { ovr, pot } = ratingsForStars(stars)
    const rivals = g.teams.filter(t => t.id !== g.user).sort((a, b) => Math.abs(a.prestige - stars * 2) - Math.abs(b.prestige - stars * 2) + (rnd() - 0.5) * 3)
    list.push({
      id: newId(g), first: pick(FIRST), last: pick(LAST), pos: pick(weights), stars, ovr, pot, dev: rollDev(),
      scouted: false, offered: false, visited: false, interest: ri(0, 15),
      rival: 28 + stars * 13 + ri(0, 15), rivalTeam: rivals[0].id, committed: null,
    })
  }
  return list.sort((a, b) => b.stars - a.stars || b.ovr - a.ovr)
}

// ---------- Depth chart and ratings ----------
export function depth(team: Team) {
  const out: Record<Pos, { starters: Player[]; backups: Player[]; hurt: Player[] }> = {} as any
  for (const pos of POSITIONS) {
    const all = team.roster.filter(p => p.pos === pos).sort((a, b) => (b.lock ? 1 : 0) - (a.lock ? 1 : 0) || b.ovr - a.ovr)
    const ps = all.filter(p => !p.inj)
    out[pos] = { starters: ps.slice(0, STARTERS[pos]), backups: ps.slice(STARTERS[pos]), hurt: all.filter(p => p.inj) }
  }
  return out
}
export const EMERGENCY_OVR = 38
const sum = (ps: Player[]) => ps.reduce((n, p) => n + p.ovr, 0)
function groupRating(d: ReturnType<typeof depth>, pos: Pos, blend: number) {
  const n = STARTERS[pos], st = d[pos].starters
  const stAvg = (sum(st) + (n - st.length) * EMERGENCY_OVR) / n
  const bu = d[pos].backups.slice(0, n)
  if (!bu.length) return stAvg
  // positions without enough backups keep their starters on the field
  const rotAvg = (sum(bu) + sum(st.slice(bu.length)) + (n - Math.max(st.length, bu.length)) * EMERGENCY_OVR) / n
  return stAvg * (1 - blend) + rotAvg * blend
}
export function teamRatings(team: Team, blend = 0) {
  const d = depth(team)
  const R = (p: Pos) => groupRating(d, p, blend)
  const off = R('QB') * 0.32 + R('RB') * 0.16 + R('TE') * 0.12 + R('WR') * 0.4
  const def = R('DL') * 0.35 + R('LB') * 0.3 + R('DB') * 0.35
  const k = R('K')
  return { off, def, k, ovr: off * 0.48 + def * 0.44 + k * 0.08 }
}

// ---------- Simulation ----------
function simScore(off: number, def: number, k: number, homeAdv: number) {
  let pts = 0
  const p = clamp(0.36 + (off - def) / 65 + homeAdv, 0.1, 0.72)
  for (let d = 0; d < 11; d++) {
    if (rnd() < p) {
      if (rnd() < clamp(0.6 + (off - def) / 150, 0.35, 0.85)) pts += 7
      else if (rnd() < 0.55 + k / 300) pts += 3
    }
  }
  return pts
}
function playGame(a: Team, b: Team, ab: number, bb: number, homeAdv = 0.03) {
  const ra = teamRatings(a, ab), rb = teamRatings(b, bb)
  let as = simScore(ra.off, rb.def, ra.k, homeAdv), bs = simScore(rb.off, ra.def, rb.k, 0)
  while (as === bs) { if (rnd() < 0.5 + (ra.ovr - rb.ovr) / 60) as += pick([3, 7]); else bs += pick([3, 7]) }
  return [as, bs]
}
const BLEND_GROWTH = [0, 0.25, 0.6]
function applySnaps(team: Team, blend: number, isUser: boolean, focus: number[], injMult = 1): string[] {
  const d = depth(team)
  const played: [Player, number][] = []
  for (const pos of POSITIONS) {
    const bu = d[pos].backups.slice(0, STARTERS[pos])
    d[pos].starters.forEach((p, i) => played.push([p, i < bu.length ? Math.round(60 * (1 - blend)) : 60]))
    for (const p of bu) {
      const snaps = Math.round(60 * blend)
      played.push([p, snaps])
      if (snaps > 0) grow(p, blend >= 0.5 ? BLEND_GROWTH[2] : BLEND_GROWTH[1])
    }
  }
  if (isUser) for (const id of focus) { const p = team.roster.find(x => x.id === id); if (p) grow(p, 0.35) }
  const hurt: string[] = []
  for (const [p, snaps] of played) {
    p.snaps += snaps
    if (snaps > 0 && rnd() < 0.014 * injMult * (snaps / 60)) {
      p.inj = ri(1, 4)
      hurt.push(`${p.pos} ${p.first} ${p.last} is hurt, out ${p.inj} week${p.inj > 1 ? 's' : ''}.`)
    }
  }
  return hurt
}
function grow(p: Player, amt: number) {
  const gap = p.pot - p.ovr
  if (gap <= 0) return
  p.ovr = Math.min(p.pot, Math.round((p.ovr + amt * DEV_MULT[p.dev] * (gap > 15 ? 1.2 : 1)) * 10) / 10)
}

export const team = (g: State, id: number) => id >= 100 ? g.cupcakes[id - 100] : g.teams[id]
export const label = (t: Team) => `${t.school}`

export function userNextGame(g: State) { return g.schedule.find(x => !x.played && (x.home === g.user || x.away === g.user) && x.week === g.week) }

export function simWeek(g: State) {
  if (g.phase !== 'season') return
  setSeed(g.seed)
  if (g.week === 13) addConfChampionships(g)
  if (g.week === 14) addSemis(g)
  if (g.week === 15) addFinal(g)
  for (const t of g.teams) for (const p of t.roster) if (p.inj) p.inj--
  const games = g.schedule.filter(x => x.week === g.week && !x.played)
  for (const gm of games) {
    const h = team(g, gm.home), a = team(g, gm.away)
    const userHome = gm.home === g.user, userAway = gm.away === g.user
    const isUser = userHome || userAway
    const cupcakeAI = gm.type === 'cupcake' ? 0.5 : 0
    const hb = userHome ? g.rotation : cupcakeAI
    const ab = userAway ? g.rotation : gm.type === 'cupcake' ? 0 : 0
    if (isUser) gm.rotation = g.rotation
    const neutral = gm.type === 'final' || gm.type === 'ccg'
    const [hs, as] = playGame(h, a, hb, ab, neutral ? 0 : 0.03)
    gm.hs = hs; gm.as = as; gm.played = true
    const hw = hs > as
    if (h.conf >= 0 && gm.type !== 'ccg' && gm.type !== 'semi' && gm.type !== 'final') { hw ? h.w++ : h.l++ }
    if (a.conf >= 0 && gm.type !== 'ccg' && gm.type !== 'semi' && gm.type !== 'final') { hw ? a.l++ : a.w++ }
    if (gm.type === 'conf') { if (hw) { h.cw++; a.cl++ } else { a.cw++; h.cl++ } }
    if (gm.type === 'ccg') (hw ? h : a).confChamp = true
    if (gm.type === 'final') { const c = hw ? h : a; c.champ = true; g.champion = c.id }
    const im = INJ_MULT[settingsOf(g).injuries]
    const hurtH = h.conf >= 0 ? applySnaps(h, hb, userHome, g.focus, im) : []
    const hurtA = a.conf >= 0 ? applySnaps(a, ab, userAway, g.focus, im) : []
    if (userHome) hurtH.forEach(x => g.news.unshift(x))
    if (userAway) hurtA.forEach(x => g.news.unshift(x))
    if (isUser) {
      const me = userHome ? h : a, opp = userHome ? a : h
      const my = userHome ? hs : as, their = userHome ? as : hs
      const tag = gm.type === 'ccg' ? 'Conference title game: ' : gm.type === 'semi' ? 'Playoff semifinal: ' : gm.type === 'final' ? 'National title game: ' : ''
      g.news.unshift(`Week ${g.week}. ${tag}${my > their ? 'Beat' : 'Lost to'} ${opp.school} ${my}-${their}.${gm.type === 'final' && my > their ? ' NATIONAL CHAMPIONS!' : ''}`)
      void me
    }
  }
  if (g.week <= REGULAR_WEEKS) recruitingTick(g)
  if (g.week === REGULAR_WEEKS) g.news.unshift('Regular season is over. Recruiting is closed until next season.')
  g.week++
  g.points = POINTS_PER_WEEK
  g.rotation = 0
  // season over?
  if (g.week > 15 || (g.week === 14 && false)) g.phase = 'offseason'
  g.seed = getSeed()
  if (g.phase === 'offseason') openPortal(g)
}

export function confStandings(g: State, conf: number) {
  return g.teams.filter(t => t.conf === conf).sort((a, b) =>
    (b.cw - b.cl) - (a.cw - a.cl) || (b.w - b.l) - (a.w - a.l) || teamRatings(b).ovr - teamRatings(a).ovr)
}
function addConfChampionships(g: State) {
  for (let c = 0; c < 4; c++) {
    const [a, b] = confStandings(g, c)
    g.schedule.push({ week: 13, home: a.id, away: b.id, type: 'ccg', played: false })
  }
}
function addSemis(g: State) {
  // Conference champions get in, seeded by national rank.
  const champs = rankAt(g, lastPlayedWeek(g)).map(r => r.team).filter(t => t.confChamp)
  champs.forEach(t => (t.playoff = true))
  g.schedule.push({ week: 14, home: champs[0].id, away: champs[3].id, type: 'semi', played: false })
  g.schedule.push({ week: 14, home: champs[1].id, away: champs[2].id, type: 'semi', played: false })
  if (champs.some(t => t.id === g.user)) g.news.unshift('You made the playoff!')
}
function addFinal(g: State) {
  const semis = g.schedule.filter(x => x.type === 'semi')
  const winners = semis.map(x => (x.hs! > x.as! ? x.home : x.away))
  g.schedule.push({ week: 15, home: winners[0], away: winners[1], type: 'final', played: false })
}
export function userInPostseason(g: State) {
  if (g.week < 13) return true
  if (g.week === 13) return confStandings(g, team(g, g.user).conf).slice(0, 2).some(t => t.id === g.user)
  return !!userNextGame(g) || g.schedule.some(x => x.week === g.week && (x.home === g.user || x.away === g.user))
}

// ---------- National rankings ----------
// Computed from the schedule every time, so nothing is stored and old saves work.
export interface ConfRow { conf: number; name: string; prestige: number; ncW: number; ncL: number; strength: number; rank: number }
export interface RankRow {
  team: Team; rank: number; prev: number | null; score: number
  w: number; l: number; sos: number; sosRank: number; confStrength: number
}
/** How much the preseason prior (prestige) counts, in games. It fades as real games are played. */
const RANK_PRIOR_GAMES = 3
/** Non-conference games it takes before results count as much as prestige in conference strength. */
const CONF_PRIOR_GAMES = 8
export const RANK_WEIGHTS = { winPct: 0.45, sos: 0.35, conf: 0.2 }

export function lastPlayedWeek(g: State) {
  return g.schedule.reduce((m, x) => (x.played && x.week > m ? x.week : m), 0)
}
function playedThrough(g: State, week: number) { return g.schedule.filter(x => x.played && x.week <= week) }

export function confRankings(g: State, week = lastPlayedWeek(g)): ConfRow[] {
  const games = playedThrough(g, week).filter(x => x.type === 'nonconf')
  const rows = g.confNames.map((name, conf) => {
    const members = g.teams.filter(t => t.conf === conf)
    const prestige = members.reduce((s, t) => s + t.prestige, 0) / members.length
    let ncW = 0, ncL = 0
    for (const x of games) {
      const hc = team(g, x.home).conf, ac = team(g, x.away).conf
      if (hc === ac) continue
      const homeWon = x.hs! > x.as!
      if (hc === conf) homeWon ? ncW++ : ncL++
      if (ac === conf) homeWon ? ncL++ : ncW++
    }
    const n = ncW + ncL, wt = n / (n + CONF_PRIOR_GAMES)
    const strength = (prestige / 10) * (1 - wt) + (n ? ncW / n : 0.5) * wt
    return { conf, name, prestige, ncW, ncL, strength, rank: 0 }
  })
  ;[...rows].sort((a, b) => b.strength - a.strength).forEach((r, i) => (r.rank = i + 1))
  return rows
}

function rankAt(g: State, week: number): Omit<RankRow, 'prev'>[] {
  const rec = new Map<number, { w: number; l: number; opps: number[] }>()
  const get = (id: number) => { let r = rec.get(id); if (!r) rec.set(id, (r = { w: 0, l: 0, opps: [] })); return r }
  for (const x of playedThrough(g, week)) {
    const h = get(x.home), a = get(x.away), homeWon = x.hs! > x.as!
    homeWon ? (h.w++, a.l++) : (a.w++, h.l++)
    h.opps.push(x.away); a.opps.push(x.home)
  }
  // Smoothed so a 1-0 team isn't treated as perfect.
  const pct = (id: number) => { const r = rec.get(id); return r ? (r.w + 1) / (r.w + r.l + 2) : 0.5 }
  const avg = (xs: number[]) => xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0.5
  const oppPct = (id: number) => avg((rec.get(id)?.opps ?? []).map(pct))
  const confs = confRankings(g, week)
  const rows = g.teams.map(t => {
    const r = rec.get(t.id) ?? { w: 0, l: 0, opps: [] }
    const gp = r.w + r.l
    const sos = gp ? (2 * avg(r.opps.map(pct)) + avg(r.opps.map(oppPct))) / 3 : 0.5
    const cs = confs[t.conf].strength
    const resume = RANK_WEIGHTS.winPct * pct(t.id) + RANK_WEIGHTS.sos * sos + RANK_WEIGHTS.conf * cs
    // Prestige mapped onto the range a real resume lands in (about 0.3 to 0.75), so scores don't jump after week 1.
    const prior = 0.25 + t.prestige / 20
    const score = (prior * RANK_PRIOR_GAMES + resume * gp) / (RANK_PRIOR_GAMES + gp)
    return { team: t, rank: 0, score: Math.round(score * 1000) / 10, w: r.w, l: r.l, sos, sosRank: 0, confStrength: cs }
  })
  ;[...rows].sort((a, b) => b.sos - a.sos).forEach((r, i) => (r.sosRank = i + 1))
  rows.sort((a, b) => b.score - a.score || b.team.prestige - a.team.prestige)
  // The national champion finishes #1 in the final poll.
  const champ = week >= 15 ? rows.findIndex(r => r.team.champ) : -1
  if (champ > 0) rows.unshift(rows.splice(champ, 1)[0])
  rows.forEach((r, i) => (r.rank = i + 1))
  return rows
}

/** Every FBS team ranked, with last week's rank for movement. Before any games it is a preseason poll by prestige. */
export function rankings(g: State): RankRow[] {
  const week = lastPlayedWeek(g)
  const before = week > 0 ? new Map(rankAt(g, week - 1).map(r => [r.team.id, r.rank])) : null
  return rankAt(g, week).map(r => ({ ...r, prev: before?.get(r.team.id) ?? null }))
}
export const TOP_N = 25

// ---------- Playing time ----------
export type Mood = 'Happy' | 'Content' | 'Unhappy' | 'Wants out'
export function userGamesPlayed(g: State) {
  return g.schedule.filter(x => x.played && (x.home === g.user || x.away === g.user)).length
}
/** Share of snaps a player expects, from his stars and class. Walk-ons expect nothing, freshmen are patient. */
export function expectedShare(p: Player) {
  if (p.walkOn) return 0
  let e = [0, 0.05, 0.15, 0.3, 0.45, 0.6][p.stars] ?? 0.3
  if (p.year >= 3) e += 0.1
  if (p.year === 1) e *= 0.5
  return e
}
/** Mood from this season's snaps against what he expected. It takes about 4 games to firm up. */
export function morale(p: Player, games: number) {
  const expect = expectedShare(p)
  const share = games ? Math.min(1, p.snaps / (games * 60)) : 0
  const score = clamp(Math.round(60 + (share - expect) * 100 * Math.min(1, games / 4)), 0, 100)
  const mood: Mood = score >= 70 ? 'Happy' : score >= 45 ? 'Content' : score >= 25 ? 'Unhappy' : 'Wants out'
  return { score, mood, share, expect }
}

// ---------- Transfer portal ----------
export const PORTAL_POINTS = 100
export const MAX_TRANSFERS = 3
export const MAX_PORTAL_OFFERS = 6
export const PORTAL_COST = { pitch: 10, visit: 30 }
/** Chance a player of yours enters the portal, by mood. */
const PORTAL_ENTER: Record<Mood, number> = { 'Wants out': 0.9, Unhappy: 0.55, Content: 0.08, Happy: 0 }

const portalEntries = (g: State) => g.portal?.entries ?? []
/** Ids of your players in the portal you haven't won back. Unless you do, they leave on signing day. */
function portalLeaving(g: State) { return new Set(portalEntries(g).filter(e => e.from === g.user && e.to !== g.user).map(e => e.p.id)) }
function portalIncoming(g: State) { return portalEntries(g).filter(e => e.to === g.user && e.from !== g.user).map(e => e.p) }

/** Would he start for you next season, against returning players, commits and other transfers? */
export function wouldStart(g: State, e: PortalEntry) {
  const leaving = portalLeaving(g)
  const pool = [
    ...g.teams[g.user].roster.filter(p => p.year < 4 && !leaving.has(p.id) && p.id !== e.p.id),
    ...g.recruits.filter(r => r.committed === g.user), ...portalIncoming(g).filter(p => p.id !== e.p.id),
  ].filter(p => p.pos === e.p.pos).sort((a, b) => b.ovr - a.ovr)
  const n = STARTERS[e.p.pos]
  return pool.length < n || pool[n - 1].ovr < e.p.ovr
}

function portalRival(g: State, p: Player, exclude: number) {
  const target = clamp((p.ovr - 48) / 3, 1, 10)
  return g.teams.filter(t => t.id !== g.user && t.id !== exclude)
    .sort((a, b) => Math.abs(a.prestige - target) - Math.abs(b.prestige - target) + (rnd() - 0.5) * 3)[0].id
}

export function openPortal(g: State) {
  if (g.phase !== 'offseason' || g.portal) return
  setSeed(g.seed)
  const games = userGamesPlayed(g)
  const ranks = rankAt(g, lastPlayedWeek(g))
  const myRank = ranks.find(r => r.team.id === g.user)!.rank
  const me = g.teams[g.user]
  const rankBonus = myRank <= 5 ? 15 : myRank <= 10 ? 10 : myRank <= TOP_N ? 5 : 0
  g.portal = { points: PORTAL_POINTS, entries: [] }
  const add = (p: Player, from: number, reason: string) => {
    const e: PortalEntry = {
      p: { ...p, lock: false, inj: 0 }, from, reason, interest: 0, offered: false, visited: false, to: null,
      rival: Math.round(25 + Math.max(0, p.ovr - 50) * 1.5 + ri(0, 15)), rivalTeam: portalRival(g, p, from),
    }
    g.portal!.entries.push(e)
    e.interest = from === g.user
      ? Math.round(morale(p, games).score / 2) + 5
      : 5 + (wouldStart(g, e) ? 15 : 0) + rankBonus + Math.round(me.prestige * 2) + ri(0, 8)
  }
  for (const t of g.teams) {
    const d = depth(t)
    const starters = new Set(POSITIONS.flatMap(pos => d[pos].starters.map(p => p.id)))
    for (const p of t.roster) {
      if (p.year >= 4) continue
      if (t.id === g.user) {
        const m = morale(p, games)
        if (rnd() < PORTAL_ENTER[m.mood]) add(p, t.id, m.mood === 'Wants out' ? 'Wants to play' : 'Unhappy with playing time')
      } else if (!starters.has(p.id)) {
        if (!p.walkOn && rnd() < clamp(0.1 + (p.stars - 2) * 0.06, 0.03, 0.3)) add(p, t.id, 'Looking for playing time')
      } else if (t.prestige < 4.5 && p.ovr >= 68 && rnd() < 0.2) {
        add(p, t.id, 'Moving up to a bigger program')
      }
    }
  }
  g.portal.entries.sort((a, b) => b.p.ovr - a.p.ovr)
  const mine = g.portal.entries.filter(e => e.from === g.user).length
  g.news.unshift(`The transfer portal is open with ${g.portal.entries.length} players.${mine ? ` ${mine} of yours entered.` : ''}`)
  g.seed = getSeed()
}

export function expectedPortalGain(g: State, e: PortalEntry, action: 'pitch' | 'visit') {
  const base = action === 'visit' ? 30 : 10
  const resist = Math.max(0.6, 1 + (e.p.stars - g.teams[g.user].prestige / 2) * 0.15)
  return base * prestigeFactor(g) * (wouldStart(g, e) ? 1.25 : 1) * DIFF_MULT[settingsOf(g).difficulty] / resist
}
export const portalOffers = (g: State) => portalEntries(g).filter(e => e.offered && e.to === null && e.from !== g.user).length
export const portalSigned = (g: State) => portalIncoming(g).length

export function portalAction(g: State, e: PortalEntry, action: 'offer' | 'pitch' | 'visit') {
  const P = g.portal
  if (g.phase !== 'offseason' || !P) return 'The portal is closed.'
  if (e.to !== null) return 'He already picked a school.'
  const own = e.from === g.user
  setSeed(g.seed)
  let msg = ''
  if (action === 'offer') {
    if (e.offered) { e.offered = false; msg = 'Offer pulled.' }
    else if (!own && portalOffers(g) >= MAX_PORTAL_OFFERS) msg = `You can only have ${MAX_PORTAL_OFFERS} open portal offers.`
    else { e.offered = true; e.interest += 5; msg = own ? `Asked ${e.p.first} ${e.p.last} to stay.` : `Offered ${e.p.first} ${e.p.last}.` }
  } else {
    const cost = PORTAL_COST[action]
    if (P.points < cost) return 'Not enough portal points.'
    if (action === 'visit') { if (e.visited) return 'He already visited.'; if (e.interest < 25) return 'He needs 25 interest before he will visit.'; e.visited = true }
    P.points -= cost
    e.interest = Math.round(e.interest + expectedPortalGain(g, e, action) * (0.8 + rnd() * 0.4))
  }
  const why = portalCommit(g, e)
  g.seed = getSeed()
  return why || msg
}
/** Signs him if he's offered and past the rival. Returns why not when that's the only thing in the way. */
function portalCommit(g: State, e: PortalEntry) {
  if (!e.offered || e.interest < e.rival) return ''
  const own = e.from === g.user
  if (!own && portalSigned(g) >= MAX_TRANSFERS) return `He wants to come, but you can only sign ${MAX_TRANSFERS} transfers.`
  if (!own && rosterNeeds(g).open <= 0) return 'He wants to come, but you have no open roster spots.'
  e.to = g.user
  g.news.unshift(own ? `${e.p.pos} ${e.p.first} ${e.p.last} is staying!` : `TRANSFER: ${e.p.pos} ${e.p.first} ${e.p.last} (${Math.round(e.p.ovr)}) is coming from ${g.teams[e.from].school}!`)
  return ''
}
function resolvePortal(g: State, report: SeasonReport) {
  report.transfersIn = []; report.transfersOut = []
  for (const e of portalEntries(g)) {
    const to = e.to ?? e.rivalTeam
    e.to = to
    if (to === e.from) continue
    const from = g.teams[e.from], i = from.roster.findIndex(p => p.id === e.p.id)
    if (i < 0) continue
    const [p] = from.roster.splice(i, 1)
    p.lock = false
    g.teams[to].roster.push(p)
    const who = `${p.pos} ${p.first} ${p.last} (${Math.round(p.ovr)})`
    if (e.from === g.user) { g.focus = g.focus.filter(x => x !== p.id); report.transfersOut.push(`${who} to ${g.teams[to].school}`) }
    if (to === g.user) report.transfersIn.push(`${who} from ${from.school}`)
  }
  g.portal = null
}

// ---------- Recruiting ----------
export function rosterNeeds(g: State) {
  const t = g.teams[g.user]
  const leaving = portalLeaving(g)
  const returning = t.roster.filter(p => p.year < 4 && !leaving.has(p.id))
  const commits = g.recruits.filter(r => r.committed === g.user)
  const incoming = portalIncoming(g)
  const need: Record<Pos, number> = {} as any, have: Record<Pos, number> = {} as any
  for (const pos of POSITIONS) {
    have[pos] = [...returning, ...commits, ...incoming].filter(p => p.pos === pos).length
    need[pos] = STARTERS[pos] - have[pos]
  }
  return { open: ROSTER_MAX - returning.length - commits.length - incoming.length, need, have, commits: commits.length, transfers: incoming.length }
}
function prestigeFactor(g: State) { return 0.6 + g.teams[g.user].prestige / 12 }
/** Average interest one contact or visit adds. The real roll is 80% to 120% of this. */
export function expectedGain(g: State, r: Recruit, action: 'contact' | 'visit') {
  const needBoost = rosterNeeds(g).need[r.pos] > 0 ? 1.2 : 1
  const base = action === 'visit' ? 30 : 10
  const resist = Math.max(0.6, 1 + (r.stars - g.teams[g.user].prestige / 2) * 0.15)
  return base * prestigeFactor(g) * needBoost * DIFF_MULT[settingsOf(g).difficulty] / resist
}
export function recruitAction(g: State, r: Recruit, action: 'contact' | 'scout' | 'visit' | 'offer') {
  if (r.committed !== null || g.phase !== 'season' || g.week > REGULAR_WEEKS) return 'Recruiting is closed.'
  setSeed(g.seed)
  let msg = ''
  if (action === 'offer') {
    if (r.offered) { r.offered = false; msg = 'Offer pulled.' }
    else if (g.recruits.filter(x => x.offered && x.committed === null).length >= MAX_OFFERS) msg = `You can only have ${MAX_OFFERS} open offers.`
    else { r.offered = true; r.interest += 5; msg = `Offered ${r.first} ${r.last}.` }
  } else {
    const cost = COST[action]
    if (g.points < cost) return 'Not enough recruiting points this week.'
    if (action === 'scout') { if (r.scouted) return 'Already scouted.'; r.scouted = true }
    if (action === 'visit') { if (r.visited) return 'He already visited.'; if (r.interest < 30) return 'He needs 30 interest before he will visit.'; r.visited = true }
    g.points -= cost
    if (action !== 'scout') r.interest = Math.round(r.interest + expectedGain(g, r, action) * (0.8 + rnd() * 0.4))
  }
  checkCommit(g, r)
  g.seed = getSeed()
  return msg
}
function checkCommit(g: State, r: Recruit) {
  if (r.committed === null && r.offered && r.interest >= r.rival && rosterNeeds(g).open > 0) {
    r.committed = g.user
    g.news.unshift(`COMMIT: ${'★'.repeat(r.stars)} ${r.pos} ${r.first} ${r.last} committed to you!`)
  }
}
function recruitingTick(g: State) {
  const late = g.week / REGULAR_WEEKS
  for (const r of g.recruits) {
    if (r.committed !== null) continue
    checkCommit(g, r)
    if (r.committed !== null) continue
    r.rival += ri(0, 2)
    if (rnd() < 0.02 + late * 0.06 + r.stars * 0.005) {
      r.committed = r.rivalTeam
      if (r.offered || r.interest > 25) g.news.unshift(`Lost ${r.first} ${r.last} (${r.stars}★ ${r.pos}) to ${g.teams[r.rivalTeam].school}.`)
    }
  }
}

// ---------- Training ----------
export function toggleFocus(g: State, id: number) {
  const i = g.focus.indexOf(id)
  if (i >= 0) g.focus.splice(i, 1)
  else if (g.focus.length < MAX_FOCUS) g.focus.push(id)
}

// ---------- Offseason ----------
const posCount = (t: Team, pos: Pos) => t.roster.filter(p => p.pos === pos).length
function fillRoster(g: State, t: Team, stars: () => number, isUser: boolean, cutLog?: string[]) {
  let walkOns = 0
  for (const pos of POSITIONS) while (posCount(t, pos) < STARTERS[pos]) { t.roster.push(makePlayer(g, pos, stars(), 1, true)); walkOns++ }
  while (t.roster.length > ROSTER_MAX) {
    const c = t.roster.filter(p => posCount(t, p.pos) > STARTERS[p.pos]).sort((a, b) => a.ovr - b.ovr)[0]
    t.roster.splice(t.roster.indexOf(c), 1)
    cutLog?.push(`${c.pos} ${c.first} ${c.last} (${Math.round(c.ovr)})`)
  }
  if (!isUser) while (t.roster.length < ROSTER_MAX) { t.roster.push(makePlayer(g, pick(AI_BENCH), stars(), 1, true)); walkOns++ }
  return walkOns
}
export function addWalkOn(g: State, pos: Pos) {
  const t = g.teams[g.user]
  if (t.roster.length >= ROSTER_MAX) return
  setSeed(g.seed)
  const p = makePlayer(g, pos, 1, 1, true)
  t.roster.push(p)
  g.news.unshift(`Walk-on ${pos} ${p.first} ${p.last} joined the team.`)
  g.seed = getSeed()
}
export function swapLineup(g: State, benchId: number, starterId: number) {
  const t = g.teams[g.user]
  const b = t.roster.find(p => p.id === benchId), s0 = t.roster.find(p => p.id === starterId)
  if (!b || !s0 || b.pos !== s0.pos) return
  for (const p of depth(t)[b.pos].starters) p.lock = true
  s0.lock = false; b.lock = true
}
export function autoLineup(g: State) { for (const p of g.teams[g.user].roster) p.lock = false }
export function winProb(a: number, b: number) { return 1 / (1 + Math.exp(-(a - b) / 4)) }
export function releasePlayer(g: State, id: number) {
  const t = g.teams[g.user]
  const i = t.roster.findIndex(p => p.id === id)
  if (i < 0) return
  const [p] = t.roster.splice(i, 1)
  g.focus = g.focus.filter(x => x !== id)
  g.news.unshift(`Released ${p.pos} ${p.first} ${p.last}.`)
}
export function finishLabel(g: State, t: Team) {
  if (t.champ) return 'National champions'
  if (t.playoff) return 'Playoff'
  if (t.confChamp) return 'Conference champions'
  const rank = confStandings(g, t.conf).indexOf(t) + 1
  return `${rank}${['st', 'nd', 'rd'][rank - 1] ?? 'th'} in ${g.confNames[t.conf]}`
}
export function advanceOffseason(g: State) {
  if (g.phase !== 'offseason') return
  setSeed(g.seed)
  const me = g.teams[g.user]
  const report: SeasonReport = {
    year: g.year, record: `${me.w}-${me.l}`, finish: finishLabel(g, me), prestigeBefore: me.prestige, prestigeAfter: 0,
    graduated: [], signed: [], cut: [], walkOns: 0, bigJumps: [],
  }
  g.history.unshift({ year: g.year, record: report.record, finish: report.finish, prestige: Math.round(me.prestige * 10) / 10 })
  // prestige drift
  for (const t of g.teams) {
    const pct = t.w / Math.max(1, t.w + t.l)
    const target = 1 + pct * 7.5 + (t.confChamp ? 0.8 : 0) + (t.playoff ? 0.6 : 0) + (t.champ ? 1.2 : 0)
    t.prestige = clamp(Math.round((t.prestige + (target - t.prestige) * 0.22) * 10) / 10, 1, 10)
  }
  report.prestigeAfter = me.prestige
  resolvePortal(g, report)
  // graduation and progression
  for (const t of g.teams) {
    const grads = t.roster.filter(p => p.year >= 4)
    if (t.id === g.user) report.graduated = grads.map(p => `${p.pos} ${p.first} ${p.last} (${Math.round(p.ovr)})`)
    t.roster = t.roster.filter(p => p.year < 4)
    for (const p of t.roster) {
      const before = p.ovr
      const snapBonus = Math.min(3, p.snaps / 250)
      p.ovr = Math.min(p.pot, Math.round(p.ovr + (p.pot - p.ovr) * 0.28 * DEV_MULT[p.dev] + snapBonus + ri(0, 2)))
      p.year++; p.snaps = 0
      if (t.id === g.user && p.ovr - before >= 8) report.bigJumps.push(`${p.pos} ${p.first} ${p.last} +${Math.round(p.ovr - before)} (now ${p.ovr})`)
    }
  }
  // signing day
  for (const r of g.recruits) {
    if (r.committed === null) r.committed = r.rivalTeam
    const t = g.teams[r.committed]
    if (t.roster.length >= ROSTER_MAX && t.id !== g.user) continue
    t.roster.push({ id: r.id, first: r.first, last: r.last, pos: r.pos, year: 1, ovr: r.ovr, pot: r.pot, dev: r.dev, stars: r.stars, snaps: 0 })
    if (t.id === g.user) report.signed.push(`${'★'.repeat(r.stars)} ${r.pos} ${r.first} ${r.last}`)
  }
  for (const t of g.teams) {
    for (const p of t.roster) p.inj = 0
    const w = fillRoster(g, t, () => starsForPrestige(t.prestige), t.id === g.user, t.id === g.user ? report.cut : undefined)
    if (t.id === g.user) report.walkOns = w
  }
  // reset season
  for (const t of g.teams) { t.w = t.l = t.cw = t.cl = 0; t.confChamp = t.playoff = t.champ = false }
  g.year++; g.week = 1; g.phase = 'season'; g.champion = null; g.focus = []; g.rotation = 0
  g.schedule = makeSchedule(g)
  g.recruits = makeRecruits(g)
  g.points = POINTS_PER_WEEK
  g.report = report
  g.portal = null
  g.news = [`The ${g.year} season begins. Prestige is now ${me.prestige.toFixed(1)}.`, ...g.news].slice(0, 60)
  g.seed = getSeed()
}

export const grade = (n: number) => n >= 90 ? 'A+' : n >= 85 ? 'A' : n >= 80 ? 'A-' : n >= 76 ? 'B+' : n >= 72 ? 'B' : n >= 68 ? 'B-' : n >= 64 ? 'C+' : n >= 60 ? 'C' : n >= 55 ? 'C-' : n >= 50 ? 'D' : 'F'
export const YEARS = ['', 'FR', 'SO', 'JR', 'SR']

// ---------- League editing ----------
export const TEAM_COLORS = ['#b91c1c', '#dc2626', '#ea580c', '#d97706', '#ca8a04', '#4d7c0f', '#15803d', '#0f766e', '#0e7490', '#0369a1', '#1d4ed8', '#1e3a8a', '#6d28d9', '#7c3aed', '#9333ea', '#9f1239', '#be123c', '#92400e', '#525252', '#0f172a']
export interface TeamPatch { school: string; mascot: string; abbr: string; color: string }
export function cleanPatch(p: TeamPatch): TeamPatch | string {
  const school = p.school.trim().slice(0, 28), mascot = p.mascot.trim().slice(0, 20)
  const abbr = p.abbr.trim().toUpperCase().replace(/[^A-Z0-9&]/g, '').slice(0, 4)
  if (!school) return 'School name is required.'
  if (!mascot) return 'Mascot is required.'
  if (abbr.length < 2) return 'Abbreviation needs 2 to 4 letters.'
  if (!/^#[0-9a-f]{6}$/i.test(p.color)) return 'Pick a color.'
  return { school, mascot, abbr, color: p.color }
}
export function editTeam(g: State, id: number, patch: TeamPatch) {
  const clean = cleanPatch(patch)
  if (typeof clean === 'string') return clean
  const t = team(g, id)
  const old = t.school
  Object.assign(t, clean)
  if (old !== clean.school) g.news.unshift(`${old} is now ${clean.school}.`)
  return ''
}
export function renameConf(g: State, i: number, name: string) {
  const n = name.trim().slice(0, 28)
  if (n) g.confNames[i] = n
}
// Conference moves only before week 1 is played, so schedules and standings stay honest.
export function canRealign(g: State) { return g.phase === 'season' && g.week === 1 && !g.schedule.some(x => x.played) }
export function swapConference(g: State, a: number, b: number) {
  if (!canRealign(g)) return 'Conference moves open at the start of a season, before week 1.'
  const ta = g.teams[a], tb = g.teams[b]
  if (ta.conf === tb.conf) return 'Those schools are already in the same conference.'
  ;[ta.conf, tb.conf] = [tb.conf, ta.conf]
  setSeed(g.seed)
  g.schedule = makeSchedule(g)
  g.seed = getSeed()
  g.news.unshift(`Realignment: ${ta.school} moves to the ${g.confNames[ta.conf]}, ${tb.school} moves to the ${g.confNames[tb.conf]}.`)
  return ''
}

export function setSetting<K extends keyof Settings>(g: State, k: K, v: Settings[K]) {
  g.settings = { ...settingsOf(g), [k]: v }
}
export function parseSave(text: string): State | string {
  try {
    const x = JSON.parse(text)
    if (!x || !Array.isArray(x.teams) || !Array.isArray(x.schedule) || typeof x.user !== 'number') return 'That does not look like a Pixel Football save.'
    return x as State
  } catch { return 'Could not read that save. Paste the whole thing.' }
}
