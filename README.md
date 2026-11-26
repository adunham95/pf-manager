# Pixel Football Manager

The management side of Pixel Football. Run a college program: recruiting, a 20-man roster, depth chart, training, injuries, seasons, prestige and conferences. No on-field play.

Built with Svelte 5, TypeScript and Vite. No backend. Saves live in localStorage.

## Run it

```
pnpm install
pnpm dev            # local dev server
pnpm build          # single self-contained dist/index.html
pnpm check          # svelte-check + tsc
```

The build uses `vite-plugin-singlefile`, so `dist/index.html` has all JS and CSS inlined. Upload the whole `dist/` folder to any static host, in any folder (`base: './'` keeps every path relative).

### Installable app (PWA)

`dist/` also holds the files that make it an installable app that works offline:

- `public/manifest.webmanifest`: name, colors and the icons in `public/`.
- `public/sw.js`: the service worker. It loads the page from the network first, so a new deploy shows up right away, and falls back to the cached copy when offline or after 3 seconds. Icons and Google Fonts are cached on first load. Bump `VERSION` in it after changing the file to clear old caches.
- `src/main.ts` registers it in production builds served over http(s), and asks for persistent storage so the saved career isn't cleared.
- Settings has an Install app button when the browser offers one, and Add to Home Screen steps on iPhone.

Service workers need https (or localhost), so the PWA parts don't run from `file://` or under `pnpm dev`. To try it locally: `pnpm build && pnpm preview`.

## Layout

```
src/
  lib/game.ts    all game logic, no UI code
  App.svelte     every screen (setup, My Team, Recruits, Portal, Program, Schedule, League, History, Settings)
  app.css        theme tokens and styles, light and dark via light-dark()
  main.ts        mounts the app
```

### game.ts

Plain functions that mutate one `State` object. The UI keeps that object in a Svelte `$state` proxy, so mutations re-render.

- **RNG** is seeded (mulberry32). Every action that rolls dice calls `setSeed(g.seed)` first and stores `g.seed = getSeed()` after, so a save replays the same way.
- **Roster**: 12 starter slots (`SLOTS`), `ROSTER_MAX` 20, so 8 bench spots. `depth()` builds the depth chart: locked players first, then by OVR, injured players skipped. Empty starter slots play at `EMERGENCY_OVR` (38).
- **Sim**: `teamRatings()` blends starters and backups by the snap plan (0, 0.25, 0.5). `simScore()` runs 11 drives per side. Positions with no backup keep their starters in.
- **Development**: in-season growth from snaps and training focus (`grow()`), plus a bigger jump each offseason based on potential, dev trait and snaps.
- **Recruiting**: 130 recruits a year. Offer, then push interest past the rival's pull. Prestige, positional need and difficulty scale each point. Rivals sign recruits off the board as weeks pass. `expectedGain()` gives the average interest a contact or visit adds, which the Recruits screen shows on each action.
- **Season**: weeks 1 and 4 are cupcakes, 3 non-conference weeks, 7 conference round-robin weeks, then conference title games (13), playoff semis (14) and the title game (15).
- **Rankings**: `rankings()` ranks all 32 teams from the schedule each time it is called, so nothing is stored. Score = win % (45%), strength of schedule (35%, opponents' record 2/3 plus their opponents' 1/3) and conference strength (20%). Prestige is a preseason prior worth `RANK_PRIOR_GAMES` games. `confRankings()` starts each conference at its average prestige and blends in non-conference results. The champion is #1 in the final poll, and playoff semis are seeded by rank.
- **Playing time**: `morale()` compares a player's share of snaps this season with `expectedShare()` (more for higher stars and upperclassmen, half for freshmen, nothing for walk-ons). Moods: Happy, Content, Unhappy, Wants out. Nothing is stored; it comes from `snaps`.
- **Transfer portal**: `openPortal()` runs when the national title game ends. Your unhappy players may enter (`PORTAL_ENTER`), plus AI backups and some standouts from low-prestige schools. `g.portal` holds the entries and a one-time `PORTAL_POINTS` budget. `portalAction()` offers, pitches and hosts visits, the same race against a rival as recruiting. `wouldStart()` adds 25% to every pitch. `resolvePortal()` runs first on signing day and sends anyone unsigned to his rival school.
- **Weekly recap**: `simWeek()` builds `g.recap` (score, rank before and after, and lines tagged by kind). `log()` writes both news and the recap.
- **Traits**: `Player.trait` and `Recruit.trait` (hidden until scouted). Leader +8 morale to teammates at his position, Big-game boosts title and playoff games, Gym rat doubles training, Injury-prone doubles injury odds, Homesick raises portal odds. See `TRAITS` and `rollTrait()`.
- **Game-day visits**: a visit during a home week sets `visitWeek`. A win adds 10 interest (18 against a ranked team), a loss costs 8.
- **Coaching staff**: `g.staff` holds an Assistant, OC and DC (1 to 5 stars), and `g.staffMarket` the coaches you can hire. The budget is `staffBudget()`, from prestige. Hiring is open in the offseason and before week 1. Per star: Assistant +6% recruiting and portal interest, +3 morale, kicker growth. OC and DC +0.8 offense or defense on game day and +8% growth at their positions.
- **AD goals**: `makeGoals()` sets 3 goals from prestige; `goalProgress()` tracks them. On signing day each goal met adds `AD_PRESTIGE` and `AD_POINTS` weekly recruiting points. Meeting fewer than `AD_GOALS_TO_PASS` adds a strike, and `AD_STRIKES` strikes in a row gets you fired (`g.fired`), with offers from smaller schools (`takeJob()`). `ensureProgram()` adds a staff and goals to older saves.
- **Game plan**: `g.plan` holds an offense lean (run, balanced, pass) and a defense lean (what it sells out to stop). `planEdge()` rewards leaning into your strengths and the opponent's weak spot, and guessing their offense. `aiPlan()` is how the AI calls it, with some randomness. `planPreview()` and `scouting()` feed the matchup card. `PLAN_WEIGHT` sets how much it matters.
- **Game sim**: `playGame()` plays 22 alternating drives. Your games keep a drive log with named players (`Game.log`), both plans and a player of the game (`playerOfGame()`).
- **Facilities**: weight room, recruiting lounge, stadium and medical center, levels 0 to 5 (`g.facilities`), paid with booster money (`g.boosters`, from `boosterIncome()` on signing day). The next level costs `facilityCost()`.
- **Pro draft**: `runDraft()` on signing day takes the top 24 seniors and declaring juniors (`EARLY_OVR`, `EARLY_CHANCE`) league-wide. `g.drafts` keeps the last 6. Your picks in the last 3 drafts add 3% recruiting interest each (`pipelineBoost()`, up to 30%). `draftWatch()` projects your picks.
- **Offseason**: `advanceOffseason()` moves prestige toward a target based on results, graduates seniors, develops players, signs recruits, fills empty starter slots with walk-ons and builds the next schedule.
- **Editing**: `editTeam()`, `renameConf()`, `swapConference()` (only before week 1 is played, rebuilds the schedule).
- **Settings**: `g.settings` holds recruiting difficulty and injury rate. Older saves without it fall back to `DEFAULT_SETTINGS`.

## Balance knobs

All in `game.ts`:

| What | Where |
| --- | --- |
| Recruiting points per week | `POINTS_PER_WEEK` |
| Max open offers | `MAX_OFFERS` |
| Action costs | `COST` |
| Interest per action | `recruitAction()`, `base` and `resist` |
| Rival poaching rate | `recruitingTick()` |
| Injury rate | `applySnaps()`, `0.014` per full game |
| Prestige drift | `advanceOffseason()`, the `0.22` step and `target` formula |
| Score spread | `simScore()` |
| Portal entry odds, budget, limits | `PORTAL_ENTER`, `PORTAL_POINTS`, `MAX_TRANSFERS`, `MAX_PORTAL_OFFERS`, `PORTAL_COST` |
| Playing-time expectations | `expectedShare()` |
| AD goals and firing | `makeGoals()`, `AD_STRIKES`, `AD_GOALS_TO_PASS`, `AD_PRESTIGE`, `AD_POINTS` |
| Staff budget and salaries | `staffBudget()`, `SALARY` |
| Game plan strength | `PLAN_WEIGHT`, `planEdge()` |
| Facility costs and effects | `facilityCost()`, `FACILITIES`, `STADIUM_EDGE` |
| Draft size and early declares | `DRAFT_ROUNDS`, `DRAFT_PER_ROUND`, `EARLY_OVR`, `EARLY_CHANCE` |
| Ranking weights | `RANK_WEIGHTS`, `RANK_PRIOR_GAMES`, `CONF_PRIOR_GAMES` |

## Not built yet

- NIL budget
- Exporting a custom league (teams and conferences) separate from a career save
- Moving `game.ts` into a shared package for the mobile Pixel Football game
