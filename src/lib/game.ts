// Pixel Football Manager: game logic. Pure functions that mutate a plain state object.

export type Pos = 'QB' | 'RB' | 'TE' | 'WR' | 'DL' | 'LB' | 'DB' | 'K'
export type Dev = 'Slow' | 'Normal' | 'Fast' | 'Elite'

export interface Player {
  id: number; first: string; last: string; pos: Pos; year: number
  ovr: number; pot: number; dev: Dev; stars: number; snaps: number; walkOn?: boolean; inj?: number; lock?: boolean
  trait?: Trait
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
  /** Only for your games: the drive log, both game plans and the player of the game. */
  log?: Drive[]; plan?: Plan; oppPlan?: Plan; potg?: string
}
export interface Recruit {
  id: number; first: string; last: string; pos: Pos; stars: number
  ovr: number; pot: number; dev: Dev; scouted: boolean; offered: boolean; visited: boolean
  interest: number; rival: number; rivalTeam: number; committed: number | null
  trait?: Trait
  /** Week of a game-day visit. A home win that week adds interest, a loss takes some away. */
  visitWeek?: number
}
export interface SeasonReport {
  year: number; record: string; finish: string; prestigeBefore: number; prestigeAfter: number
  graduated: string[]; signed: string[]; cut: string[]; walkOns: number; bigJumps: string[]
  transfersIn?: string[]; transfersOut?: string[]
  ad?: { met: number; total: number; strikes: number; fired: boolean; lines: string[] }
  drafted?: string[]; boosters?: number
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
  rotation: number; plan?: Plan; news: string[]; history: { year: number; record: string; finish: string; prestige: number }[]
  champion: number | null; report: SeasonReport | null
  portal?: Portal | null
  recap?: Recap | null
  staff?: Coach[]; staffMarket?: Coach[]
  ad?: AD
  /** Set when the AD fires you: schools offering you a job. */
  fired?: { offers: number[] } | null
  facilities?: Partial<Record<Facility, number>>
  /** Booster money in $M, spent on facilities. */
  boosters?: number
  drafts?: DraftClass[]
}

// ---------- Traits ----------
export type Trait = 'Leader' | 'Big-game' | 'Gym rat' | 'Injury-prone' | 'Homesick'
export const TRAITS: Record<Trait, { good: boolean; text: string }> = {
  Leader: { good: true, text: 'Teammates at his position are happier.' },
  'Big-game': { good: true, text: 'Plays up in conference title and playoff games.' },
  'Gym rat': { good: true, text: 'Gets double from training and grows more in the offseason.' },
  'Injury-prone': { good: false, text: 'Gets hurt twice as often.' },
  Homesick: { good: false, text: 'More likely to enter the transfer portal.' },
}
function rollTrait(): Trait | undefined {
  const r = rnd()
  return r < 0.08 ? 'Leader' : r < 0.15 ? 'Big-game' : r < 0.23 ? 'Gym rat' : r < 0.3 ? 'Injury-prone' : r < 0.36 ? 'Homesick' : undefined
}

// ---------- Weekly recap ----------
export type RecapKind = 'injury' | 'commit' | 'lost' | 'visit' | 'goal' | 'league' | 'trait' | 'info'
export interface Recap {
  week: number; label: string; rankBefore: number; rankAfter: number
  result?: { opp: number; my: number; their: number; win: boolean; home: boolean; type: GameType }
  lines: { kind: RecapKind; text: string }[]
}
let building: Recap | null = null
/** Adds to league news, and to this week's recap while a week is being simmed. */
function log(g: State, kind: RecapKind, text: string) {
  g.news.unshift(text)
  if (g.news.length > 80) g.news.length = 80
  building?.lines.push({ kind, text })
}
export function weekName(week: number) {
  return week <= REGULAR_WEEKS ? `Week ${week}` : week === 13 ? 'Conference title week' : week === 14 ? 'Playoff semifinals' : 'National title game'
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
/** How each conference starts out. Prestige below follows these tiers, with some overlap at the edges. */
export const CONF_TIERS = ['Small schools', 'Power conference', 'Strong', 'Middle']
// school, mascot, abbr, color, base prestige
const SCHOOLS: [string, string, string, string, number][] = [
  ['Cumberland', 'Wolves', 'CUM', '#c2410c', 4], ['Blue Ridge State', 'Hawks', 'BRS', '#1d4ed8', 3], ['Holston', 'Rivermen', 'HOL', '#15803d', 2], ['Watauga Tech', 'Engineers', 'WAT', '#b91c1c', 2],
  ['Clinch Valley', 'Miners', 'CLV', '#525252', 1], ['Smoky Mountain', 'Bears', 'SMU', '#7c3aed', 5], ['Chattahoochee', 'Gators', 'CHA', '#0f766e', 3], ['Pine Bluff A&M', 'Owls', 'PBA', '#a16207', 1],
  ['Bayou State', 'Pelicans', 'BAY', '#9333ea', 9], ['Mobile Bay', 'Mariners', 'MOB', '#0369a1', 7], ['Galveston', 'Storm', 'GAL', '#dc2626', 7], ['Tallahassee Tech', 'Seminoles', 'TTE', '#9f1239', 8],
  ['Coastal Carolina A&M', 'Pirates', 'CCA', '#0d9488', 6], ['Okefenokee', 'Cranes', 'OKE', '#4d7c0f', 5], ['Sabine', 'Cajuns', 'SAB', '#ca8a04', 6], ['Pensacola', 'Admirals', 'PEN', '#1e3a8a', 8],
  ['Prairie State', 'Bison', 'PRS', '#92400e', 8], ['Ozark', 'Razorbacks', 'OZK', '#991b1b', 6], ['Platte River', 'Huskers', 'PLR', '#b91c1c', 7], ['Cedar Falls', 'Panthers', 'CDF', '#6d28d9', 5],
  ['Wichita Tech', 'Shockers', 'WIT', '#eab308', 5], ['Des Plaines', 'Foxes', 'DPL', '#c2410c', 4], ['Kankakee', 'Thunder', 'KAN', '#334155', 3], ['Missouri Valley', 'Mules', 'MOV', '#0f766e', 6],
  ['Cascade', 'Ducks', 'CAS', '#16a34a', 7], ['Sierra State', 'Grizzlies', 'SIS', '#1e40af', 6], ['Mojave', 'Scorpions', 'MOJ', '#d97706', 3], ['Willamette', 'Beavers', 'WIL', '#ea580c', 4],
  ['Puget Sound', 'Orcas', 'PUG', '#0e7490', 4], ['High Desert', 'Coyotes', 'HDS', '#a8a29e', 2], ['Big Sur', 'Condors', 'BSU', '#be123c', 5], ['Tahoe', 'Avalanche', 'TAH', '#2563eb', 2],
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
  const p: Player = { id: newId(g), first: pick(FIRST), last: pick(LAST), pos, year, ovr, pot, dev, stars, snaps: 0, walkOn }
  const trait = rollTrait()
  if (trait) p.trait = trait
  return p
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
  g.staff = (['assistant', 'oc', 'dc'] as Role[]).map(r => makeCoach(g, r, 1))
  g.staffMarket = makeMarket(g)
  g.ad = { goals: makeGoals(g), strikes: 0, bonus: 0 }
  g.facilities = {}; g.boosters = STARTING_BOOSTERS
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
  balanceHomeAway(g, games)
  return games
}

/** Home games each FBS team gets against other FBS teams (cupcakes are always at home on top of this). */
const FBS_HOME_TARGET = 5
/**
 * Conference games flip last season's site (home-and-home), then sites are swapped until every team
 * has FBS_HOME_TARGET home games against FBS teams, swapping non-conference games before conference ones.
 * `g.schedule` is still last season's schedule when this runs.
 */
function balanceHomeAway(g: State, games: Game[]) {
  const lastHome = new Map<string, number>()
  for (const x of g.schedule ?? []) if (x.type === 'conf') lastHome.set([x.home, x.away].sort((a, b) => a - b).join('-'), x.home)
  const fbs = games.filter(x => x.type === 'conf' || x.type === 'nonconf')
  for (const x of fbs) {
    const was = lastHome.get([x.home, x.away].sort((a, b) => a - b).join('-'))
    if (x.type === 'conf' && was === x.home) [x.home, x.away] = [x.away, x.home]
  }
  // Every team plays 10 FBS games, an even number, so an exact 5/5 split always exists.
  // Fix one surplus at a time by flipping a chain of games from a team with too many home games
  // to one with too few (everyone in between stays even). Non-conference games go first.
  const homes = new Map<number, number>()
  for (const x of fbs) homes.set(x.home, (homes.get(x.home) ?? 0) + 1)
  const h = (id: number) => homes.get(id) ?? 0
  const chain = (from: number, edges: Game[]) => {
    const prev = new Map<number, Game>([[from, null as unknown as Game]])
    const queue = [from]
    while (queue.length) {
      const u = queue.shift()!
      if (u !== from && h(u) < FBS_HOME_TARGET) {
        const path: Game[] = []
        for (let v = u; v !== from; v = prev.get(v)!.home) path.push(prev.get(v)!)
        return path
      }
      for (const x of edges) if (x.home === u && !prev.has(x.away)) { prev.set(x.away, x); queue.push(x.away) }
    }
    return null
  }
  const nonconf = fbs.filter(x => x.type === 'nonconf')
  for (let guard = 0; guard < 200; guard++) {
    const heavy = shuffle(g.teams.map(t => t.id)).find(id => h(id) > FBS_HOME_TARGET)
    if (heavy === undefined) break
    const path = chain(heavy, nonconf) ?? chain(heavy, fbs)
    if (!path) break
    for (const x of path) { homes.set(x.home, h(x.home) - 1); homes.set(x.away, h(x.away) + 1); [x.home, x.away] = [x.away, x.home] }
  }
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
      rival: 28 + stars * 13 + ri(0, 15), rivalTeam: rivals[0].id, committed: null, trait: rollTrait(),
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
// ---------- Game plan ----------
export type Lean = 'run' | 'balanced' | 'pass'
export const LEANS: Lean[] = ['run', 'balanced', 'pass']
/** off: how your offense leans. def: what your defense sells out to stop. */
export interface Plan { off: Lean; def: Lean }
export const DEFAULT_PLAN: Plan = { off: 'balanced', def: 'balanced' }
const RUN_SHARE: Record<Lean, number> = { run: 0.7, balanced: 0.5, pass: 0.3 }
/** How much the game plan matters. 1.5 puts smart plans about 5 win% above balanced. */
const PLAN_WEIGHT = 1.5
export function styleRatings(team: Team, blend = 0) {
  const d = depth(team)
  const R = (p: Pos) => groupRating(d, p, blend)
  return {
    runOff: R('RB') * 0.5 + R('QB') * 0.25 + R('TE') * 0.25,
    passOff: R('QB') * 0.5 + R('WR') * 0.4 + R('TE') * 0.1,
    runDef: R('DL') * 0.55 + R('LB') * 0.45,
    passDef: R('DB') * 0.6 + R('LB') * 0.2 + R('DL') * 0.2,
  }
}
type Style = ReturnType<typeof styleRatings>
/**
 * One side attacking. `off` is the attack's edge from leaning into its strengths and the defense's weak spot.
 * `def` is the defense's edge from guessing the lean: +3 for a right guess, -3 for the opposite one.
 */
export function planEdge(o: Style, offLean: Lean, d: Style, defLean: Lean) {
  const rs = RUN_SHARE[offLean]
  const off = (rs - 0.5) * ((o.runOff - d.runDef) - (o.passOff - d.passDef)) * PLAN_WEIGHT
  const def = (2 - 10 * Math.abs(rs - RUN_SHARE[defLean])) * PLAN_WEIGHT
  return { off, def }
}
/** What a coach would call against this opponent. With `rng`, a quarter of offenses and a third of defenses mix it up. */
export function aiPlan(t: Team, opp: Team, rng = true): Plan {
  if (t.conf < 0) return { ...DEFAULT_PLAN }
  const me = styleRatings(t), them = styleRatings(opp)
  const lean = (x: number): Lean => x > 3 ? 'run' : x < -3 ? 'pass' : 'balanced'
  let off = lean((me.runOff - them.runDef) - (me.passOff - them.passDef))
  let def = lean((them.runOff - me.runDef) - (them.passOff - me.passDef))
  if (rng) { if (rnd() < 0.25) off = pick(LEANS); if (rnd() < 0.35) def = pick(LEANS) }
  return { off, def }
}
/** Expected rating swing from your plan against their likely plan, for the matchup preview. */
export function planPreview(me: Team, opp: Team, plan: Plan, blend = 0) {
  const theirs = aiPlan(opp, me, false)
  const sm = styleRatings(me, blend), so = styleRatings(opp)
  const mine = planEdge(sm, plan.off, so, theirs.def), them = planEdge(so, theirs.off, sm, plan.def)
  return { theirs, offense: mine.off - mine.def, defense: them.def - them.off, net: (mine.off - mine.def + them.def - them.off) / 2 }
}
/** Plain-English scouting lines on an opponent. */
export function scouting(t: Team) {
  const s = styleRatings(t)
  const o = s.runOff - s.passOff, d = s.runDef - s.passDef
  return {
    ...s,
    offense: Math.abs(o) < 3 ? 'Balanced offense' : o > 0 ? 'Better at running the ball' : 'Better through the air',
    defense: Math.abs(d) < 3 ? 'No clear weak spot on defense' : d > 0 ? 'Weak against the pass' : 'Weak against the run',
  }
}

// ---------- Game sim (drive by drive) ----------
export interface Drive { q: number; side: 0 | 1; text: string; pts: number; score: [number, number] }
type Boost = { off: number; def: number }
interface Side { team: Team; blend: number; boost: Boost; plan: Plan }
const DRIVES = 22
/** Home crowd: added to the home offense's drive success, and AWAY_SHARE of it taken from the visitors'. */
export const HOME_EDGE = 0.035
const AWAY_SHARE = 0.6
/** Home edge for a team playing at home. Your stadium upgrades add to it. */
export function homeEdge(g: State, homeId: number) {
  return HOME_EDGE + (homeId === g.user ? facilityLevel(g, 'stadium') * STADIUM_EDGE : 0)
}
/** The same edge in team-rating points, for the win odds on the matchup card. */
export const homeEdgeRating = (g: State, homeId: number) => homeEdge(g, homeId) * 65 * (1 + AWAY_SHARE) / 2
/** Conference title games and the national title game are at neutral sites. */
export const isNeutral = (x: Game) => x.type === 'ccg' || x.type === 'final'
/** A player for a play, from starters, or backups in the 2nd half when the coach rotates. */
function onField(team: Team, pos: Pos, q: number, blend: number) {
  const d = depth(team)[pos]
  const pool = (blend >= 0.5 && q >= 3) || (blend > 0 && rnd() < blend) ? (d.backups.length ? d.backups : d.starters) : d.starters
  return pool.length ? pick(pool) : null
}
const nm = (p: Player | null) => p ? p.last : 'a walk-on'
function playGame(A: Side, B: Side, homeAdv: number, wantLog: boolean) {
  const ra = teamRatings(A.team, A.blend), rb = teamRatings(B.team, B.blend)
  const sa = styleRatings(A.team, A.blend), sb = styleRatings(B.team, B.blend)
  const ea = planEdge(sa, A.plan.off, sb, B.plan.def), eb = planEdge(sb, B.plan.off, sa, A.plan.def)
  const offA = ra.off + A.boost.off + ea.off, defB = rb.def + B.boost.def + ea.def
  const offB = rb.off + B.boost.off + eb.off, defA = ra.def + A.boost.def + eb.def
  const sides = [
    { s: A, p: clamp(0.36 + (offA - defB) / 65 + homeAdv, 0.1, 0.72), td: clamp(0.6 + (offA - defB) / 150, 0.35, 0.85), k: ra.k, def: B },
    { s: B, p: clamp(0.36 + (offB - defA) / 65 - homeAdv * AWAY_SHARE, 0.1, 0.72), td: clamp(0.6 + (offB - defA) / 150, 0.35, 0.85), k: rb.k, def: A },
  ]
  const score: [number, number] = [0, 0]
  const log: Drive[] = []
  const credit = new Map<Player, { td: number; pass: number; turn: number; sack: number; fg: number }>()
  const give = (pl: Player | null, k: 'td' | 'pass' | 'turn' | 'sack' | 'fg') => {
    if (!pl) return
    const c = credit.get(pl) ?? { td: 0, pass: 0, turn: 0, sack: 0, fg: 0 }
    c[k]++; credit.set(pl, c)
  }
  for (let i = 0; i < DRIVES; i++) {
    const side = (i % 2) as 0 | 1, x = sides[side], q = Math.min(4, Math.floor(i / 5.5) + 1)
    let pts = 0, kind: 'td' | 'fg' | 'miss' | 'stop' = 'stop'
    if (rnd() < x.p) {
      if (rnd() < x.td) { pts = 7; kind = 'td' } else if (rnd() < 0.55 + x.k / 300) { pts = 3; kind = 'fg' } else kind = 'miss'
    }
    score[side] += pts
    if (!wantLog) continue
    const t = x.s.team, dt = x.def.team, bl = x.s.blend, dbl = x.def.blend
    const run = rnd() < RUN_SHARE[x.s.plan.off]
    let text = ''
    if (kind === 'td') {
      if (run) {
        const r = rnd() < 0.15 ? onField(t, 'QB', q, bl) : onField(t, 'RB', q, bl)
        text = `${ri(1, 45)}-yd TD run by ${nm(r)}`; give(r, 'td')
      } else {
        const qb = onField(t, 'QB', q, bl), rc = onField(t, rnd() < 0.8 ? 'WR' : 'TE', q, bl)
        text = `${nm(qb)} ${ri(4, 75)}-yd TD pass to ${nm(rc)}`; give(qb, 'pass'); give(rc, 'td')
      }
    } else if (kind === 'fg') {
      const k = onField(t, 'K', q, bl); text = `${nm(k)} ${ri(22, 52)}-yd field goal`; give(k, 'fg')
    } else if (kind === 'miss') {
      text = `${nm(onField(t, 'K', q, bl))} missed a ${ri(38, 56)}-yd field goal`
    } else {
      const r = rnd()
      if (r < 0.2) {
        if (!run) { const db = onField(dt, 'DB', q, dbl); text = `${nm(onField(t, 'QB', q, bl))} intercepted by ${nm(db)}`; give(db, 'turn') }
        else { const lb = onField(dt, rnd() < 0.6 ? 'LB' : 'DL', q, dbl); text = `${nm(onField(t, 'RB', q, bl))} fumbled, recovered by ${nm(lb)}`; give(lb, 'turn') }
      } else if (r < 0.42) {
        const dl = onField(dt, rnd() < 0.7 ? 'DL' : 'LB', q, dbl); text = `Sacked by ${nm(dl)} on third down. Punt`; give(dl, 'sack')
      } else text = pick(['Three and out. Punt', 'Stalled near midfield. Punt', 'Drive stalls. Punt', 'Turned over on downs'])
    }
    log.push({ q, side, text, pts, score: [score[0], score[1]] })
  }
  const edge = (ra.ovr + (A.boost.off + A.boost.def) / 2) - (rb.ovr + (B.boost.off + B.boost.def) / 2)
  while (score[0] === score[1]) {
    const side = rnd() < 0.5 + edge / 60 ? 0 : 1, pts = pick([3, 7])
    score[side] += pts
    if (wantLog) {
      const t = sides[side].s.team
      const text = pts === 7 ? `Overtime TD by ${nm(onField(t, rnd() < 0.5 ? 'RB' : 'WR', 4, 0))}` : `Overtime field goal by ${nm(onField(t, 'K', 4, 0))}`
      log.push({ q: 5, side: side as 0 | 1, text, pts, score: [score[0], score[1]] })
    }
  }
  return { hs: score[0], as: score[1], log, credit }
}
/** Best player of a side by touchdowns, turnovers forced, sacks and kicks. */
function playerOfGame(team: Team, credit: ReturnType<typeof playGame>['credit']) {
  let best: Player | null = null, top = 0, line = ''
  for (const [pl, c] of credit) {
    if (!team.roster.includes(pl)) continue
    const v = c.td * 6 + c.pass * 4 + c.turn * 5 + c.sack * 2 + c.fg * 2
    if (v <= top) continue
    top = v; best = pl
    const bits = [c.pass && `${c.pass} TD pass${c.pass > 1 ? 'es' : ''}`, c.td && `${c.td} TD${c.td > 1 ? 's' : ''}`,
      c.turn && `${c.turn} takeaway${c.turn > 1 ? 's' : ''}`, c.sack && `${c.sack} sack${c.sack > 1 ? 's' : ''}`, c.fg && `${c.fg} FG`].filter(Boolean)
    line = bits.join(', ')
  }
  return best ? `${best.pos} ${best.first} ${best.last}: ${line}` : undefined
}
const BLEND_GROWTH = [0, 0.25, 0.6]
function applySnaps(team: Team, blend: number, isUser: boolean, focus: number[], injMult = 1, devMult: (p: Player) => number = () => 1, heal = 0): string[] {
  const d = depth(team)
  const played: [Player, number][] = []
  for (const pos of POSITIONS) {
    const bu = d[pos].backups.slice(0, STARTERS[pos])
    d[pos].starters.forEach((p, i) => played.push([p, i < bu.length ? Math.round(60 * (1 - blend)) : 60]))
    for (const p of bu) {
      const snaps = Math.round(60 * blend)
      played.push([p, snaps])
      if (snaps > 0) grow(p, (blend >= 0.5 ? BLEND_GROWTH[2] : BLEND_GROWTH[1]) * devMult(p))
    }
  }
  if (isUser) for (const id of focus) { const p = team.roster.find(x => x.id === id); if (p) grow(p, 0.35 * (p.trait === 'Gym rat' ? 2 : 1) * devMult(p)) }
  const hurt: string[] = []
  for (const [p, snaps] of played) {
    p.snaps += snaps
    if (snaps > 0 && rnd() < 0.014 * injMult * (snaps / 60) * (p.trait === 'Injury-prone' ? 2 : 1)) {
      p.inj = Math.max(1, ri(1, 4) - heal)
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
  ensureProgram(g)
  const before = rankAt(g, lastPlayedWeek(g))
  const rankBefore = before.find(r => r.team.id === g.user)!.rank
  const oppRank = new Map(before.map(r => [r.team.id, r.rank]))
  const goalsBefore = (g.ad?.goals ?? []).map(x => goalProgress(g, x).done)
  building = { week: g.week, label: weekName(g.week), rankBefore, rankAfter: rankBefore, lines: [] }
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
    const big = gm.type === 'ccg' || gm.type === 'semi' || gm.type === 'final'
    const homeAdv = neutral ? 0 : homeEdge(g, h.id)
    const myPlan = g.plan ?? DEFAULT_PLAN
    const hp = userHome ? myPlan : aiPlan(h, a), ap = userAway ? myPlan : aiPlan(a, h)
    const res = playGame({ team: h, blend: hb, boost: gameDayBoost(g, h, big), plan: hp }, { team: a, blend: ab, boost: gameDayBoost(g, a, big), plan: ap }, homeAdv, isUser)
    const hs = res.hs, as = res.as
    gm.hs = hs; gm.as = as; gm.played = true
    if (isUser) {
      gm.log = res.log; gm.plan = { ...myPlan }; gm.oppPlan = userHome ? ap : hp
      gm.potg = playerOfGame(userHome ? h : a, res.credit)
    }
    const hw = hs > as
    if (h.conf >= 0 && gm.type !== 'ccg' && gm.type !== 'semi' && gm.type !== 'final') { hw ? h.w++ : h.l++ }
    if (a.conf >= 0 && gm.type !== 'ccg' && gm.type !== 'semi' && gm.type !== 'final') { hw ? a.l++ : a.w++ }
    if (gm.type === 'conf') { if (hw) { h.cw++; a.cl++ } else { a.cw++; h.cl++ } }
    if (gm.type === 'ccg') (hw ? h : a).confChamp = true
    if (gm.type === 'final') { const c = hw ? h : a; c.champ = true; g.champion = c.id }
    const im = INJ_MULT[settingsOf(g).injuries]
    const med = facilityLevel(g, 'medical')
    const userInj = im * (1 - med * 0.12), heal = Math.floor(med / 2)
    const hurtH = h.conf >= 0 ? applySnaps(h, hb, userHome, g.focus, userHome ? userInj : im, userHome ? p => devBoost(g, p) : undefined, userHome ? heal : 0) : []
    const hurtA = a.conf >= 0 ? applySnaps(a, ab, userAway, g.focus, userAway ? userInj : im, userAway ? p => devBoost(g, p) : undefined, userAway ? heal : 0) : []
    if (isUser) {
      const opp = userHome ? a : h
      const my = userHome ? hs : as, their = userHome ? as : hs, win = my > their
      const tag = gm.type === 'ccg' ? 'Conference title game: ' : gm.type === 'semi' ? 'Playoff semifinal: ' : gm.type === 'final' ? 'National title game: ' : ''
      g.news.unshift(`Week ${g.week}. ${tag}${win ? 'Beat' : 'Lost to'} ${opp.school} ${my}-${their}.${gm.type === 'final' && win ? ' NATIONAL CHAMPIONS!' : ''}`)
      building.result = { opp: opp.id, my, their, win, home: userHome, type: gm.type }
      ;(userHome ? hurtH : hurtA).forEach(x => log(g, 'injury', x))
      if (big) {
        const d = depth(userHome ? h : a)
        const stars = POSITIONS.flatMap(pos => d[pos].starters).filter(p => p.trait === 'Big-game')
        if (stars.length) log(g, 'trait', `Big-game players stepped up: ${stars.map(p => `${p.pos} ${p.last}`).join(', ')}.`)
      }
      // game-day visits
      const ranked = (oppRank.get(opp.id) ?? 99) <= TOP_N
      for (const r of g.recruits) {
        if (r.visitWeek !== g.week || r.committed !== null) continue
        const delta = visitSwing(g, win, ranked)
        r.interest = Math.max(0, r.interest + delta)
        log(g, 'visit', win
          ? `${r.pos} ${r.first} ${r.last} loved the ${ranked ? 'win over a ranked team' : 'win'} on his visit (+${delta}).`
          : `${r.pos} ${r.first} ${r.last} left his visit after the loss (${delta}).`)
      }
    } else if (big) {
      const w = team(g, hs > as ? gm.home : gm.away), l = team(g, hs > as ? gm.away : gm.home)
      const what = gm.type === 'ccg' ? `won the ${g.confNames[w.conf]} title` : gm.type === 'semi' ? 'advanced to the national title game' : 'won the national title'
      log(g, 'league', `${w.school} ${what}, beating ${l.school} ${Math.max(hs, as)}-${Math.min(hs, as)}.`)
    }
  }
  if (g.week <= REGULAR_WEEKS) recruitingTick(g)
  if (g.week === REGULAR_WEEKS) log(g, 'info', 'Regular season is over. Recruiting is closed until next season.')
  const goals = g.ad?.goals ?? []
  // Only goals that can't be lost again once met. Rank and conference place move every week.
  const locks = (x: Goal) => x.kind === 'wins' || x.kind === 'confWins' || x.kind === 'recruits' || (x.kind === 'conf' && x.target === 1)
  goals.forEach((x, i) => { if (locks(x) && !goalsBefore[i] && goalProgress(g, x).done) log(g, 'goal', `AD goal met: ${x.text}.`) })
  g.week++
  g.points = weeklyPoints(g)
  g.rotation = 0
  // season over?
  if (g.week > 15 || (g.week === 14 && false)) g.phase = 'offseason'
  g.seed = getSeed()
  if (g.phase === 'offseason') openPortal(g)
  building.rankAfter = rankAt(g, lastPlayedWeek(g)).find(r => r.team.id === g.user)!.rank
  if (g.phase === 'offseason') building.lines.push({ kind: 'info', text: 'The season is over. The transfer portal is open until signing day.' })
  g.recap = building
  building = null
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
  if (champs.some(t => t.id === g.user)) log(g, 'info', 'You made the playoff!')
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
export function morale(p: Player, games: number, bonus = 0) {
  const expect = expectedShare(p)
  const share = games ? Math.min(1, p.snaps / (games * 60)) : 0
  const score = clamp(Math.round(60 + (share - expect) * 100 * Math.min(1, games / 4) + bonus), 0, 100)
  const mood: Mood = score >= 70 ? 'Happy' : score >= 45 ? 'Content' : score >= 25 ? 'Unhappy' : 'Wants out'
  return { score, mood, share, expect }
}

/** Morale bonus from a Leader at his position and, on your team, your assistant coach. */
export function moraleBonus(g: State, t: Team, p: Player) {
  const leader = t.roster.some(x => x.id !== p.id && x.pos === p.pos && x.trait === 'Leader') ? 8 : 0
  return leader + (t.id === g.user ? staffLevel(g, 'assistant') * 3 : 0)
}
/** Mood of a player on your team. */
export function playerMorale(g: State, p: Player) { return morale(p, userGamesPlayed(g), moraleBonus(g, g.teams[g.user], p)) }

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
      ? Math.round(morale(p, games, moraleBonus(g, me, p)).score / 2) + 5
      : 5 + (wouldStart(g, e) ? 15 : 0) + rankBonus + Math.round(me.prestige * 2) + ri(0, 8)
  }
  for (const t of g.teams) {
    const d = depth(t)
    const starters = new Set(POSITIONS.flatMap(pos => d[pos].starters.map(p => p.id)))
    for (const p of t.roster) {
      if (p.year >= 4) continue
      if (t.id === g.user) {
        const m = morale(p, games, moraleBonus(g, t, p))
        if (rnd() < PORTAL_ENTER[m.mood] + (p.trait === 'Homesick' ? 0.2 : 0)) add(p, t.id, m.mood === 'Wants out' ? 'Wants to play' : 'Unhappy with playing time')
      } else if (!starters.has(p.id)) {
        if (!p.walkOn && rnd() < clamp(0.1 + (p.stars - 2) * 0.06, 0.03, 0.3) + (p.trait === 'Homesick' ? 0.1 : 0)) add(p, t.id, 'Looking for playing time')
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
  return base * prestigeFactor(g) * (wouldStart(g, e) ? 1.25 : 1) * DIFF_MULT[settingsOf(g).difficulty] * recruitBoost(g) / resist
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
  const lounge = action === 'visit' ? 1 + facilityLevel(g, 'lounge') * 0.1 : 1
  return base * prestigeFactor(g) * needBoost * DIFF_MULT[settingsOf(g).difficulty] * recruitBoost(g) * lounge / resist
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
    if (action === 'visit') {
      if (r.visited) return 'He already visited.'
      if (r.interest < 30) return 'He needs 30 interest before he will visit.'
      r.visited = true
      const gm = userNextGame(g)
      if (gm && gm.home === g.user) { r.visitWeek = g.week; msg = `${r.first} ${r.last} will be at the home game against ${team(g, gm.away).school}. A win helps.` }
    }
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
    log(g, 'commit', `COMMIT: ${'★'.repeat(r.stars)} ${r.pos} ${r.first} ${r.last} committed to you!`)
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
      if (r.offered || r.interest > 25) log(g, 'lost', `Lost ${r.first} ${r.last} (${r.stars}★ ${r.pos}) to ${g.teams[r.rivalTeam].school}.`)
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
  ensureProgram(g)
  const ad = g.ad!
  const results = ad.goals.map(x => ({ x, done: goalProgress(g, x).done }))
  const met = results.filter(r => r.done).length
  // prestige drift: toward a target from final national rank (which counts schedule and conference strength),
  // pulled toward the conference's average so power conferences stay strong and small ones stay small
  const finalRank = new Map(rankAt(g, lastPlayedWeek(g)).map(r => [r.team.id, r.rank]))
  const confAvg = g.confNames.map((_, c) => { const m = g.teams.filter(t => t.conf === c); return m.reduce((n, t) => n + t.prestige, 0) / m.length })
  for (const t of g.teams) {
    const fromRank = 9.5 - ((finalRank.get(t.id) ?? 16) - 1) * (8 / (g.teams.length - 1))
    const target = fromRank * (1 - CONF_PULL) + confAvg[t.conf] * CONF_PULL + (t.confChamp ? 0.5 : 0) + (t.playoff ? 0.5 : 0) + (t.champ ? 1 : 0)
    t.prestige = clamp(Math.round((t.prestige + (target - t.prestige) * PRESTIGE_DRIFT) * 10) / 10, 1, 10)
  }
  me.prestige = clamp(Math.round((me.prestige + met * AD_PRESTIGE) * 10) / 10, 1, 10)
  report.prestigeAfter = me.prestige
  ad.strikes = met >= AD_GOALS_TO_PASS ? 0 : ad.strikes + 1
  ad.bonus = met * AD_POINTS
  const fired = ad.strikes >= AD_STRIKES
  report.ad = { met, total: results.length, strikes: ad.strikes, fired, lines: results.map(r => `${r.done ? 'Met' : 'Missed'}: ${r.x.text}`) }
  const draft = runDraft(g)
  const myPicks = draft.picks.filter(x => x.team === g.user)
  report.drafted = myPicks.map(x => `#${x.pick} (round ${x.round}) ${x.pos} ${x.name} (${x.ovr})${x.early ? ', left early' : ''}`)
  const income = boosterIncome(g, met, myPicks.length)
  g.boosters = Math.round(((g.boosters ?? 0) + income) * 10) / 10
  report.boosters = income
  resolvePortal(g, report)
  // graduation and progression
  for (const t of g.teams) {
    const grads = t.roster.filter(p => p.year >= 4)
    if (t.id === g.user) report.graduated = grads.map(p => `${p.pos} ${p.first} ${p.last} (${Math.round(p.ovr)})`)
    t.roster = t.roster.filter(p => p.year < 4)
    for (const p of t.roster) {
      const before = p.ovr
      const snapBonus = Math.min(3, p.snaps / 250)
      const mult = t.id === g.user ? devBoost(g, p) : 1
      p.ovr = Math.min(p.pot, Math.round(p.ovr + (p.pot - p.ovr) * 0.28 * DEV_MULT[p.dev] * mult + snapBonus + ri(0, 2) + (p.trait === 'Gym rat' ? 1 : 0)))
      p.year++; p.snaps = 0
      if (t.id === g.user && p.ovr - before >= 8) report.bigJumps.push(`${p.pos} ${p.first} ${p.last} +${Math.round(p.ovr - before)} (now ${p.ovr})`)
    }
  }
  // signing day
  for (const r of g.recruits) {
    if (r.committed === null) r.committed = r.rivalTeam
    const t = g.teams[r.committed]
    if (t.roster.length >= ROSTER_MAX && t.id !== g.user) continue
    t.roster.push({ id: r.id, first: r.first, last: r.last, pos: r.pos, year: 1, ovr: r.ovr, pot: r.pot, dev: r.dev, stars: r.stars, snaps: 0, ...(r.trait ? { trait: r.trait } : {}) })
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
  g.staffMarket = makeMarket(g)
  ad.goals = makeGoals(g)
  if (fired) {
    const offers = g.teams.filter(t => t.id !== g.user && t.prestige <= 4.5).sort(() => rnd() - 0.5).slice(0, 3).map(t => t.id)
    g.fired = { offers: offers.length ? offers : [g.teams.filter(t => t.id !== g.user).sort((a, b) => a.prestige - b.prestige)[0].id] }
  }
  g.points = weeklyPoints(g)
  g.report = report
  g.portal = null
  g.news = [`The ${g.year} season begins. Prestige is now ${me.prestige.toFixed(1)}.`, ...g.news].slice(0, 60)
  g.seed = getSeed()
}

// ---------- Coaching staff ----------
export type Role = 'assistant' | 'oc' | 'dc'
export const ROLES: Record<Role, { title: string; short: string; does: string }> = {
  assistant: { title: 'Assistant coach', short: 'Assistant', does: '+6% recruiting and portal interest, +3 morale for every player and kicker growth, per star' },
  oc: { title: 'Offensive coordinator', short: 'OC', does: '+0.8 offense on game day and +8% growth for QB, RB, TE and WR, per star' },
  dc: { title: 'Defensive coordinator', short: 'DC', does: '+0.8 defense on game day and +8% growth for DL, LB and DB, per star' },
}
const ROLE_LIST: Role[] = ['assistant', 'oc', 'dc']
export interface Coach { id: number; first: string; last: string; role: Role; level: number; salary: number }
/** Salary in $M by star level. */
const SALARY = [0, 0.4, 0.8, 1.4, 2.2, 3.2]
const OFFENSE: Pos[] = ['QB', 'RB', 'TE', 'WR']
const coachFor = (pos: Pos): Role => pos === 'K' ? 'assistant' : OFFENSE.includes(pos) ? 'oc' : 'dc'
function makeCoach(g: State, role: Role, level: number): Coach {
  return { id: newId(g), first: pick(FIRST), last: pick(LAST), role, level, salary: SALARY[level] }
}
function makeMarket(g: State): Coach[] {
  return ROLE_LIST.flatMap(role => [0, 1, 2].map(() => makeCoach(g, role, pick([1, 2, 2, 2, 3, 3, 3, 4, 4, 5])))).sort((a, b) => b.level - a.level)
}
export const staffBudget = (g: State) => Math.round((0.6 + g.teams[g.user].prestige * 0.6) * 10) / 10
export const payroll = (g: State) => Math.round((g.staff ?? []).reduce((s, c) => s + c.salary, 0) * 10) / 10
export const staffLevel = (g: State, role: Role) => g.staff?.find(c => c.role === role)?.level ?? 0
const recruitBoost = (g: State) => 1 + staffLevel(g, 'assistant') * 0.06 + pipelineBoost(g)
function devBoost(g: State, p: Player) { return 1 + staffLevel(g, coachFor(p.pos)) * 0.08 + facilityLevel(g, 'weights') * 0.05 }
/** Coordinators on your team, and Big-game starters in title and playoff games. */
export function gameDayBoost(g: State, t: Team, big = false) {
  const b = { off: 0, def: 0 }
  if (t.id === g.user) { b.off += staffLevel(g, 'oc') * 0.8; b.def += staffLevel(g, 'dc') * 0.8 }
  if (big && t.conf >= 0) {
    const d = depth(t)
    for (const pos of POSITIONS) for (const p of d[pos].starters) if (p.trait === 'Big-game') OFFENSE.includes(pos) || pos === 'K' ? (b.off += 1) : (b.def += 1)
  }
  return b
}
/** You can hire in the offseason and before week 1 is played. */
export function canHire(g: State) { return g.phase === 'offseason' || (g.week === 1 && userGamesPlayed(g) === 0) }
export function hireCoach(g: State, id: number) {
  ensureProgram(g)
  if (!canHire(g)) return 'You can only hire in the offseason or before week 1.'
  const c = g.staffMarket!.find(x => x.id === id)
  if (!c) return ''
  const cur = g.staff!.find(x => x.role === c.role)
  const after = payroll(g) - (cur?.salary ?? 0) + c.salary
  if (after > staffBudget(g) + 1e-9) return `That puts you over your $${staffBudget(g).toFixed(1)}M staff budget.`
  g.staff = [...g.staff!.filter(x => x.role !== c.role), c].sort((a, b) => ROLE_LIST.indexOf(a.role) - ROLE_LIST.indexOf(b.role))
  g.staffMarket = g.staffMarket!.filter(x => x.id !== id)
  if (cur) g.staffMarket.push(cur)
  g.news.unshift(`Hired ${c.first} ${c.last} as ${ROLES[c.role].title.toLowerCase()}.`)
  return `Hired ${c.first} ${c.last}.`
}

// ---------- Facilities ----------
export type Facility = 'weights' | 'lounge' | 'stadium' | 'medical'
export const FACILITIES: Record<Facility, { name: string; does: string }> = {
  weights: { name: 'Weight room', does: '+5% player growth per level' },
  lounge: { name: 'Recruiting lounge', does: '+10% interest from visits and +2 game-day visit bonus per level' },
  stadium: { name: 'Stadium', does: 'Bigger home-field edge each level' },
  medical: { name: 'Medical center', does: '12% fewer injuries per level, and every 2 levels heal a week faster' },
}
export const FACILITY_LIST = Object.keys(FACILITIES) as Facility[]
export const FACILITY_MAX = 5
export const STARTING_BOOSTERS = 1
const STADIUM_EDGE = 0.008
/** Booster money ($M) for the next level. */
export const facilityCost = (level: number) => level + 1
export const facilityLevel = (g: State, f: Facility) => g.facilities?.[f] ?? 0
export function upgradeFacility(g: State, f: Facility) {
  const lvl = facilityLevel(g, f)
  if (lvl >= FACILITY_MAX) return 'Already maxed out.'
  const cost = facilityCost(lvl)
  if ((g.boosters ?? 0) < cost) return `You need $${cost}M from boosters.`
  g.boosters = Math.round(((g.boosters ?? 0) - cost) * 10) / 10
  g.facilities = { ...(g.facilities ?? {}), [f]: lvl + 1 }
  g.news.unshift(`${FACILITIES[f].name} upgraded to level ${lvl + 1}.`)
  return `${FACILITIES[f].name} is now level ${lvl + 1}.`
}
/** Interest swing from a game-day visit. */
export function visitSwing(g: State, win: boolean, ranked: boolean) {
  return win ? (ranked ? 18 : 10) + facilityLevel(g, 'lounge') * 2 : -8
}
/** Booster money from the season just finished, in $M. */
function boosterIncome(g: State, goalsMet: number, picks: number) {
  const me = g.teams[g.user]
  const x = 0.5 + me.w * 0.12 + goalsMet * 0.4 + (me.confChamp ? 0.5 : 0) + (me.playoff ? 0.5 : 0) + (me.champ ? 1 : 0) + picks * 0.3
  return Math.round(x * 10) / 10
}

// ---------- Pro draft ----------
export interface DraftPick { pick: number; round: number; name: string; pos: Pos; ovr: number; team: number; early: boolean }
export interface DraftClass { year: number; picks: DraftPick[] }
export const DRAFT_ROUNDS = 3
export const DRAFT_PER_ROUND = 8
const DRAFT_PICKS = DRAFT_ROUNDS * DRAFT_PER_ROUND
/** Juniors this good may leave early. */
export const EARLY_OVR = 76
export const EARLY_CHANCE = 0.6
const draftScore = (p: Player) => p.ovr + (p.pot - p.ovr) * 0.15
function draftPool(g: State, declares: (p: Player) => boolean) {
  const inPortal = new Set(portalEntries(g).map(e => e.p.id))
  return g.teams.flatMap(t => t.roster
    .filter(p => p.year >= 4 || (p.year === 3 && p.ovr >= EARLY_OVR && !inPortal.has(p.id) && declares(p)))
    .map(p => ({ p, t })))
    .sort((a, b) => draftScore(b.p) - draftScore(a.p)).slice(0, DRAFT_PICKS)
}
/** Your players projected to be drafted if it were held today, counting every eligible junior as declaring. */
export function draftWatch(g: State) {
  const pool = draftPool(g, () => true)
  return pool.map((x, i) => ({ p: x.p, pick: i + 1, round: Math.floor(i / DRAFT_PER_ROUND) + 1 }))
    .filter(x => pool[x.pick - 1].t.id === g.user)
}
function runDraft(g: State): DraftClass {
  const pool = draftPool(g, () => rnd() < EARLY_CHANCE)
  const picks: DraftPick[] = pool.map(({ p, t }, i) => ({
    pick: i + 1, round: Math.floor(i / DRAFT_PER_ROUND) + 1, name: `${p.first} ${p.last}`, pos: p.pos,
    ovr: Math.round(p.ovr), team: t.id, early: p.year === 3,
  }))
  const gone = new Set(pool.map(x => x.p.id))
  for (const t of g.teams) t.roster = t.roster.filter(x => !gone.has(x.id))
  g.focus = g.focus.filter(x => !gone.has(x))
  const mine = picks.filter(x => x.team === g.user)
  if (mine.length) g.news.unshift(`Pro draft: ${mine.length} of your players were drafted.`)
  const cls = { year: g.year, picks }
  g.drafts = [cls, ...(g.drafts ?? [])].slice(0, 6)
  return cls
}
/** Your picks in the last 3 drafts. */
export function pipelinePicks(g: State) {
  return (g.drafts ?? []).slice(0, 3).reduce((n, d) => n + d.picks.filter(x => x.team === g.user).length, 0)
}
/** Each recent pick adds 3% recruiting interest, up to 30%. */
export const pipelineBoost = (g: State) => Math.min(0.3, pipelinePicks(g) * 0.03)

// ---------- Athletic director ----------
export type GoalKind = 'wins' | 'conf' | 'confWins' | 'rank' | 'recruits'
export interface Goal { kind: GoalKind; target: number; text: string }
export interface AD { goals: Goal[]; strikes: number; bonus: number }
/** How far prestige moves toward its target each offseason. */
const PRESTIGE_DRIFT = 0.22
/** Share of the prestige target that comes from the conference average. */
const CONF_PULL = 0.3
export const AD_STRIKES = 3
export const AD_GOALS_TO_PASS = 2
export const AD_PRESTIGE = 0.15
export const AD_POINTS = 10
function makeGoals(g: State): Goal[] {
  const me = g.teams[g.user], pr = me.prestige, conf = g.confNames[me.conf]
  const wins = clamp(Math.round(1.5 + pr * 0.85), 3, 10)
  const recruits = clamp(Math.round(pr / 2.5), 1, 4)
  const goals: Goal[] = [{ kind: 'wins', target: wins, text: `Win ${wins} regular-season games` }]
  const rankTarget = pr >= 8 ? 5 : pr >= 6.5 ? 10 : pr >= 5 ? 15 : 0
  if (rankTarget) goals.push({ kind: 'rank', target: rankTarget, text: `Finish in the top ${rankTarget}` })
  else { const cw = pr >= 3.5 ? 4 : pr >= 2 ? 3 : 2; goals.push({ kind: 'confWins', target: cw, text: `Win ${cw} ${conf} games` }) }
  if (pr >= 7) goals.push({ kind: 'conf', target: 1, text: `Win the ${conf}` })
  else goals.push({ kind: 'recruits', target: recruits, text: `Sign ${recruits} recruit${recruits > 1 ? 's' : ''} rated 3★ or better` })
  return goals
}
/** Where a goal stands right now. `done` is final once the season is over. */
export function goalProgress(g: State, x: Goal): { done: boolean; now: string } {
  const me = g.teams[g.user]
  if (x.kind === 'wins') return { done: me.w >= x.target, now: `${me.w} of ${x.target} wins` }
  if (x.kind === 'confWins') return { done: me.cw >= x.target, now: `${me.cw} of ${x.target} conference wins` }
  if (x.kind === 'recruits') {
    const n = g.recruits.filter(r => r.committed === g.user && r.stars >= 3).length
    return { done: n >= x.target, now: `${n} of ${x.target} signed` }
  }
  if (x.kind === 'rank') {
    const r = rankAt(g, lastPlayedWeek(g)).find(r => r.team.id === g.user)!.rank
    return { done: r <= x.target, now: `Ranked #${r}` }
  }
  const place = me.confChamp ? 1 : confStandings(g, me.conf).indexOf(me) + 1
  const placeText = `${place}${['st', 'nd', 'rd'][place - 1] ?? 'th'} in the conference standings`
  if (x.target === 1) {
    const titleGame = g.schedule.find(s => s.type === 'ccg' && s.played && (s.home === g.user || s.away === g.user))
    return { done: !!me.confChamp, now: me.confChamp ? 'Conference champions' : titleGame ? 'Lost the title game' : g.phase === 'offseason' ? 'Missed the title game' : placeText }
  }
  return { done: place <= x.target, now: me.confChamp ? 'Conference champions' : placeText }
}
export const weeklyPoints = (g: State) => POINTS_PER_WEEK + (g.ad?.bonus ?? 0)
/** Gives older saves a staff, a hiring market and AD goals. */
export function ensureProgram(g: State) {
  if (g.boosters === undefined) { g.boosters = STARTING_BOOSTERS; g.facilities = g.facilities ?? {} }
  if (g.staff && g.staffMarket && g.ad) return
  const seeded = getSeed()
  setSeed(g.seed)
  if (!g.staff) g.staff = ROLE_LIST.map(r => makeCoach(g, r, 1))
  if (!g.staffMarket) g.staffMarket = makeMarket(g)
  if (!g.ad) g.ad = { goals: makeGoals(g), strikes: 0, bonus: 0 }
  g.seed = getSeed()
  setSeed(seeded)
}
/** After a firing: take over at one of the schools that offered. */
export function takeJob(g: State, id: number) {
  if (!g.fired?.offers.includes(id)) return
  const old = g.teams[g.user]
  g.user = id
  g.fired = null; g.focus = []; g.rotation = 0; g.portal = null
  setSeed(g.seed)
  g.staff = ROLE_LIST.map(r => makeCoach(g, r, 1))
  g.staffMarket = makeMarket(g)
  g.ad = { goals: makeGoals(g), strikes: 0, bonus: 0 }
  for (const r of g.recruits) { r.offered = false; r.visited = false; r.scouted = false; r.visitWeek = undefined; if (r.committed === old.id) r.committed = null }
  g.points = weeklyPoints(g)
  g.seed = getSeed()
  g.news.unshift(`Fired by ${old.school}. You are the new head coach at ${g.teams[id].school}.`)
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
