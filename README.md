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

The build uses `vite-plugin-singlefile`, so `dist/index.html` has all JS and CSS inlined. Drop it anywhere static.

## Layout

```
src/
  lib/game.ts    all game logic, no UI code
  App.svelte     every screen (setup, My Team, Recruits, Portal, Schedule, League, History, Settings)
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
| Ranking weights | `RANK_WEIGHTS`, `RANK_PRIOR_GAMES`, `CONF_PRIOR_GAMES` |

## Not built yet

- NIL budget
- Exporting a custom league (teams and conferences) separate from a career save
- Moving `game.ts` into a shared package for the mobile Pixel Football game
