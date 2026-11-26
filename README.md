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
  App.svelte     every screen (setup, My Team, Recruits, Portal, Program, Schedule, Postseason, League, History, Settings)
  app.css        theme tokens and styles, light and dark via light-dark()
  main.ts        mounts the app
```

### game.ts

Plain functions that mutate one `State` object. The UI keeps that object in a Svelte `$state` proxy, so mutations re-render.

- **RNG** is seeded (mulberry32). Every action that rolls dice calls `setSeed(g.seed)` first and stores `g.seed = getSeed()` after, so a save replays the same way.
- **Roster**: 12 starter slots (`SLOTS`), `ROSTER_MAX` 20, so 8 bench spots. `depth()` builds the depth chart: locked players first, then by OVR, injured players skipped. Empty starter slots play at `EMERGENCY_OVR` (38).
- **Sim**: `teamRatings()` blends starters and backups by the snap plan (0, 0.25, 0.5). `simScore()` runs 11 drives per side. Positions with no backup keep their starters in.
- **Development**: in-season growth for every starter from game experience (`STARTER_GROWTH` per full game), more for backups who get rotation snaps (`BLEND_GROWTH`), and training on one chosen skill (`grow()`). Each offseason brings a bigger jump based on potential, dev trait and a smaller bonus for snaps played.
- **Recruiting**: 130 recruits a year. Offer, then push interest past the rival's pull. Prestige, positional need and difficulty scale each point. Rivals sign recruits off the board as weeks pass. 5-stars are blue-chips rated `ELITE_OVR` (68) to 78, so most can start as freshmen. About 5% of 2 to 4-stars (`GEM_CHANCE`) are hidden gems rated like 5-stars; they look normal until scouted, and their low stars keep rivals' interest low. `recruitWouldStart()` flags day-one starters. The commit line (`rival`) is hidden in the UI: you see your interest and a rough read on the rival (`rivalHint()`), and only learn you've passed it when he's ready to offer or commits. Follow recruits (`Recruit.followed`) to keep them on My board with your offers and commits. `rosterOutlook()` shows next season by position: seniors graduating, juniors who might declare, commits and transfers.
- **Live signing day**: `startSigningDay()` decides every undecided recruit you offered (plus a few top national names) up front, seeded and saved in `g.signing`. Your chance depends on how close you were to his line (`signingChance()`, 2% to 45%), plus a postseason bump (`postseasonBuzz()`: +15% for a national title, +8% title game, +6% semifinal, +4% quarterfinal or conference title, +3% bowl win; up to 60%), and needs an open roster spot. The UI reveals them one at a time; `finishSigningDay()` then runs the offseason. `expectedGain()` gives the average interest a contact or visit adds, which the Recruits screen shows on each action.
- **Season**: weeks 1 and 4 are cupcakes, 3 non-conference weeks, 7 conference round-robin weeks, then conference title games (13), playoff semis (14) and the title game (15).
- **Home and away**: every team gets 7 home games a season: both cupcakes plus 5 of its 10 games against other FBS teams. Conference games switch sites each year (home-and-home), and `balanceHomeAway()` swaps sites along a chain of games, non-conference first, until every team is even. The home crowd adds `HOME_EDGE` to the home offense's drive success and takes part of it from the visitors (about 57% wins for evenly matched teams). Your stadium upgrades add to it at home. Conference title games and the national title game are at neutral sites; playoff semifinals are at the higher seed.
- **Rankings**: `rankings()` ranks all 32 teams from the schedule each time it is called, so nothing is stored. Score = win % (45%), strength of schedule (35%, opponents' record 2/3 plus their opponents' 1/3) and conference strength (20%). Prestige is a preseason prior worth `RANK_PRIOR_GAMES` games. `confRankings()` starts each conference at its average prestige and blends in non-conference results. The champion is #1 in the final poll, and playoff semis are seeded by rank.
- **Playing time**: `morale()` compares a player's share of snaps this season with `expectedShare()` (3% to 45% by stars, +5% for juniors and seniors, half for freshmen, nothing for walk-ons; a benched 3-star sophomore is Content, a benched 4-star is Unhappy, only benched 5-stars want out). Moods: Happy, Content, Unhappy, Wants out. Nothing is stored; it comes from `snaps`.
- **Transfer portal**: `openPortal()` runs when the national title game ends. Your unhappy players may enter (`PORTAL_ENTER`), plus AI backups and some standouts from low-prestige schools. `g.portal` holds the entries and a one-time `PORTAL_POINTS` budget. `portalAction()` offers, pitches and hosts visits, the same race against a rival as recruiting. `wouldStart()` adds 25% to every pitch. `resolvePortal()` runs first on signing day and sends anyone unsigned to his rival school. As in recruiting, the line is hidden in the UI; `portalRivalHint()` gives a rough read on the rival instead.
- **Weekly recap**: `simWeek()` builds `g.recap` (score, rank before and after, and lines tagged by kind). `log()` writes both news and the recap.
- **Traits**: `Player.trait` and `Recruit.trait` (hidden until scouted). Leader +8 morale to teammates at his position, Big-game boosts title and playoff games, Gym rat doubles training, Injury-prone doubles injury odds, Homesick raises portal odds. See `TRAITS` and `rollTrait()`.
- **Game-day visits**: a visit during a home week sets `visitWeek`. A win adds 10 interest (18 against a ranked team), a loss costs 8.
- **Coaching staff**: `g.staff` holds an Assistant, OC and DC (1 to 5 stars), and `g.staffMarket` the coaches you can hire. The budget is `staffBudget()`, from prestige. Hiring is open in the offseason and before week 1. Per star: Assistant +6% recruiting and portal interest, +3 morale, kicker growth. OC and DC +0.8 offense or defense on game day and +8% growth at their positions.
- **AD goals**: `makeGoals()` sets 3 goals from prestige (wins about 1 + 0.8 × prestige, at most 8; a top 8/12/15/20 finish from prestige 9/7.5/6/5; from prestige 7 a conference finish one place below your prestige rank inside the conference: reach the title game if you're its best program, win it only at 9.8, otherwise finish in the top N); `goalProgress()` tracks them. On signing day each goal met adds `AD_PRESTIGE` and `AD_POINTS` weekly recruiting points. Meeting fewer than `AD_GOALS_TO_PASS` adds a strike (a playoff trip always counts as a pass), and `AD_STRIKES` strikes in a row gets you fired (`g.fired`), with offers from smaller schools (`takeJob()`). `ensureProgram()` adds a staff and goals to older saves.
- **Game plan**: `g.plan` holds an offense lean and a defense lean, both run shares set with sliders (see Game plan sliders). `planEdge()` rewards leaning into your strengths and the opponent's weak spot, and guessing their offense. `aiPlan()` is how the AI calls it, with some randomness. `planPreview()` and `scouting()` feed the matchup card. `PLAN_WEIGHT` sets how much it matters.
- **Game sim**: `playGame()` plays 22 alternating drives. Your games keep a drive log with named players (`Game.log`), both plans and a player of the game (`playerOfGame()`). Each logged drive also has a start and end spot (yards from the offense's goal line), a play count and how it ended (`Drive.result`).
- **Rivalries**: `makeRivalries()` pairs every team with a rival in its own conference, each with a made-up trophy (`TROPHIES`) and a made-up series history. `makeSchedule()` seats rivals opposite each other in the round robin so they always meet in `RIVALRY_WEEK` (11). In that game the weaker team gets `RIVAL_UNDERDOG` on offense and defense (underdogs win about 34%). `settleRivalry()` updates the series, holder and streak. Your result swings the fan meter by `RIVAL_FANS`, and a win adds `RIVAL_RECRUIT` interest to undecided recruits your rival is chasing. Realignment re-pairs broken rivalries (`fixRivalries()`). The History tab shows your trophy and every trophy game.
- **Gamecast**: "Watch it live" sims the week like Play week, then `Gamecast.svelte` replays your game's drive log on a field (ball moving in a few hops per drive, result flashes, running feed) at 1×, 2× or 4×, with pause and skip. The result is already decided; it's only a replay. The recap shows after.
- **Facilities**: weight room, recruiting lounge, stadium and medical center, levels 0 to 5 (`g.facilities`), paid with booster money (`g.boosters`, from `boosterIncome()` on signing day). The next level costs `facilityCost()`.
- **Pro draft**: `runDraft()` on signing day takes the top 24 seniors and declaring juniors (`EARLY_OVR`, `EARLY_CHANCE`) league-wide. `g.drafts` keeps the last 6. Your picks in the last 3 drafts add 3% recruiting interest each (`pipelineBoost()`, up to 30%). `draftWatch()` projects your picks.
- **Conference tiers**: schools start in tiers by conference (`CONF_TIERS`): the Gulf Coast is the power conference (avg prestige about 7), then the Heartland 8 (about 5.5), the Pacific Frontier (about 4) and the Ridge Conference of small schools (about 2.6). Each offseason, prestige moves toward a target that is 70% final national rank and 30% the conference's average (`CONF_PULL`), so the tiers last but a winning small school still climbs.
- **Weather**: `weatherOf()` gives every game a forecast (clear, rain, wind, snow; title games are indoors) from the home team's region (`CLIMATE`) and the week, with snow from week 9. It's a hash of year, week and teams, so nothing is saved. `WEATHER_FX` cuts passing (more for pass-heavy plans), field goals and, in snow, all scoring. AI coaches stop throwing in wind and snow.
- **Saturday Spotlight**: `spotlightGame()` picks each week's biggest game, the best-ranked pair, and flags it when played. The winner gets `SPOTLIGHT_RANK_BONUS` in the poll and the home crowd is louder. In your Spotlight games, offered recruits gain or lose interest and game-day visits swing 50% more.
- **Fan meter**: `g.fans` (0 to 100, `fansOf()`). `fanSwing()` moves it after each of your games: home wins, ranked wins and Spotlight wins count most, and a cupcake loss costs 12. Each offseason it settles 30% toward what prestige earns, and titles add to it. Fans add to your home edge (`FAN_EDGE`), booster money and home visit swings. Home games record attendance (`stadiumSeats()` grows with stadium level).
- **Postseason scheduling**: conference title games, semifinals and the title game are scheduled when the week before ends (`scheduleNextRound()`), so you can preview them and set a game plan.
- **Skills**: every player has four skills for his position (`SKILLS`), and OVR is their weighted average (`SKILL_WEIGHTS`). `styleRatings()` builds run and pass strength on both sides of the ball from specific skills (for example QB accuracy, throw power and poise for the passing game), which drives game plan matchups and scouting. Training (`setTraining()`, `g.focusSkill`) puts a player's weekly growth into one skill. Rotation snaps and offseason growth spread over all four (`addGrowth()`), capped by potential. Recruits show skills once scouted.
- **Postseason**: week 13 conference title games, week 14 bowls and playoff quarterfinals, week 15 semifinals, week 16 (`FINAL_WEEK`) the title game. The playoff is 8 teams (`PLAYOFF_TEAMS`): the four conference champions plus the best-ranked others, seeded by rank; quarterfinals are at the higher seed, semis and the final at neutral sites (indoors). Bowls (`BOWLS`, made-up sponsor bowls, each with a tradition) pair the best remaining teams with `BOWL_MIN_WINS`+ wins, avoiding same-conference matchups. Postseason games don't count toward the regular-season record.
- **Postseason tab**: `projectPostseason()` shows where everyone would land if the season ended today: each conference's leader as projected champion, the poll filling the rest of the playoff, and bowls paired among teams on pace for 6+ wins (`projectedWins()`), plus the first teams out and the bowl bubble. It uses the same `selectField()` and `pairBowls()` as the real selection, and shows the real bracket and bowls once they're set.
- **Season stats**: every game is simulated drive by drive with stats for every player (`Player.stats`: passing, rushing and receiving yards and TDs, INTs, sacks, takeaways, field goals), cleared each offseason.
- **Golden Helmet Trophy**: `helmetRace()` ranks players by production weighted by team success; `awardHelmet()` hands it out after title week. The winner's school gets prestige, his draft stock rises, and it's listed in History.
- **Game plan sliders**: `Plan.off` is how often you run (0.2 to 0.8) and `Plan.def` is what your defense expects. The closer your defense is to their real lean, the bigger the edge (`planEdge()`).
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
| Prestige drift | `PRESTIGE_DRIFT`, `CONF_PULL` and the `target` formula in `advanceOffseason()` |
| Score spread | `playGame()` |
| Home-field edge | `HOME_EDGE`, `AWAY_SHARE`, `STADIUM_EDGE`, `FAN_EDGE`, `SPOTLIGHT_CROWD` |
| Weather | `CLIMATE`, `WEATHER_FX` |
| Fans | `fanSwing()`, `FAN_EDGE`, the offseason drift in `advanceOffseason()` |
| Portal entry odds, budget, limits | `PORTAL_ENTER`, `PORTAL_POINTS`, `MAX_TRANSFERS`, `MAX_PORTAL_OFFERS`, `PORTAL_COST` |
| Playing-time expectations | `expectedShare()` |
| Garbage time (late scoring when down 3 scores) | `GARBAGE_LEAD`, `GARBAGE_BOOST` |
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
