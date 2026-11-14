# Development notes

Technical details moved out of the player-facing `README.md`. See also
`FINDINGS.md`, `GOALS.md`, `STRATEGY.md` and `VALIDATION.md`.

## Code map

`npm run outline -- <file...>` prints every function, method, test or heading
with its line number and length. Use it, then read only the ranges you need.
It works on `.js` and `.md` files.

- `src/index.js`, `config.js`, `memory.js`: launch, `.env` parsing, world memory.
- `src/decision-engine.js`: `chooseAction`, which maps an observed state to one
  action. Priorities and alert ranges live here.
- `src/advancement-plan.js`: route, recipes, `nextAdvancement`, iron reserve cap.
- `src/advancement-tracker.js`: server advancement packets.
- `src/survival-bot.js`, class `SurvivalController`, about 4100 lines:
  `bindEvents` (damage, hurt and breath events), `tick`, `observe` (state for
  the planner) and `perform` (action dispatch). Further groups are gathering
  (`gatherWood`, `collectTarget`), furnaces (`smeltIron`, `collectSmelt`),
  combat (`fight`, `fightCreeper`, `takeCover`, `escapeFrom`), endermen,
  reflexes (`escapeLava`, `surfaceForAir`, `clearHead`), spawn and water
  (`reachLand`, `landMassSize`, `descendFromCanopy`, `stockBlocks`,
  `buildLogPlatform`), shelter (`makeNightSafe`, `burrow`), stations, and
  recovery (`unstick`, `scout`, `recoverMobility`, `fleeSculk`).
- `src/progression-skills.js`: tunnels (`mineTunnel`, `probeTunnelSides`),
  shafts (`followShaft`, `returnSurface`), buckets and obsidian, the Nether
  portal, disposal (`clearInventory`, `disposalPit`), redstone.
- Other skills, one module each: `food.js` (cooking jobs, meal reserve),
  `furnace-fuel.js`, `cave-exploration.js` (surveys, ore sight),
  `crowd-retreat.js`, `night-policy.js`, `night-skills.js`, `base.js`,
  `tree-climb.js`, `under-feet.js`, `sculk-caution.js`, `vision.js`,
  `inventory.js`, `farming.js`, `archery.js`, `enchanting.js`, `golem.js`,
  `loot.js`, `terrain-scout.js`.
- Tests mirror modules: `test/<module>.test.js`. Controller-level cases are in
  `survival-safety`, `decision-engine` and `progression-skills`. The table in
  `VALIDATION.md` maps each file to the behavior it covers.

## Runtime and launch

The bot is a Mineflayer client for a **Java Edition survival world opened to
LAN**. No LLM service or API key is required. `minecraft-iris/` is a local,
untracked, untouched original kept for reference; the bot runs from this
directory.

The default configuration uses `AdvancementBot`, offline LAN authentication and
Minecraft **26.1.2**. Version 26.1.2 advertises protocol 775; the project
selects the pinned library's compatible `26.1` protocol data. Mineflayer is
pinned to 4.39.0. Other Minecraft protocol versions have not been tested.

Player launchers:

- `Start Bot.command` (macOS): runs `scripts/bootstrap.sh` when `node_modules/`
  is missing, asks for the LAN port, then calls `scripts/run.sh PORT`.
- `Start Bot.bat` (Windows, untested): needs an installed Node.js 22+, runs
  `npm ci` when `node_modules/` is missing, asks for the port and starts
  `src/index.js`. `.gitattributes` keeps it CRLF.

Developer launch:

```sh
./scripts/run.sh          # port from .env
./scripts/run.sh 54390    # port for this run only
```

`run.sh` copies `.env.example` to `.env` when `.env` is missing. It prefers a
native portable runtime in `.tools/`, then installed Node, then the Intel
runtime through Rosetta. `./scripts/bootstrap.sh` downloads and checksums
Node.js 26.13.0 into `.tools/` and runs `npm ci`. With Node 22 or newer already
installed, `npm ci` installs the locked dependencies and reapplies the local
patches in `patches/`: Mineflayer (crafting synchronization, player-only air
updates), mineflayer-pathfinder (landing checks) and prismarine-item (26.1
component enchantments).

Ctrl-C stops the bot. An ordinary LAN world accepts a distinct offline bot
username; an authenticated server requires `MC_AUTH=microsoft` and a separate
Minecraft-owning account for the bot.

## Configuration (`.env`)

| Variable | Meaning |
| --- | --- |
| `MC_HOST`, `MC_PORT` | LAN server address; the launcher's port overrides `.env` |
| `MC_USERNAME` | Bot player name, default `AdvancementBot` |
| `MC_AUTH` | `offline` or `microsoft` |
| `MC_VERSION` | `26.1.2` |
| `MC_OWNER` | If set, only this player can issue chat controls, and the bot sleeps only when this player sleeps; if empty, it sleeps when all other players sleep |
| `MC_WORLD_ID` | Label for persistent world memory (below) |
| `BOT_SEED` | Repeatable exploration choices; server timing, entities and world changes still affect gameplay |
| `BOT_PROBE_SPACING` | Main-tunnel interval between side branches; default `5` leaves four intervening blocks; `0` disables |
| `BOT_LOG_LEVEL` | `debug` increases navigation detail |
| `BOT_RECONNECT`, `BOT_RECONNECT_DELAY_MS`, `BOT_VIEW_DISTANCE` | Reconnection and view distance |

## In-game controls

Commands go in game chat (**T**), not the terminal. Only `MC_OWNER` can issue
controls when that field is populated.

| Command | Effect |
| --- | --- |
| `!status` | Current action, advancement objective, health, hunger and coordinates |
| `!advancements` | Advancements confirmed by the Minecraft server |
| `!inventory` (`!inv`) | Tools with remaining durability, worn armor/offhand, then item counts |
| `!pause` | Cancel work and remain paused |
| `!resume` | Stop following and resume autonomous progression |
| `!come` | Suspend progression and follow the requesting player while visible/loaded |
| `!redstone` | Queue a lever-powered piston block pusher after the advancement route |

## Progression

The implemented route is:

1. **Minecraft** — crafting table and wooden pickaxe.
2. **Stone Age** and **Getting an Upgrade** — cobblestone and a stone pickaxe,
   then a stone axe for wood and a stone shovel for dirt, grass blocks, sand,
   and gravel. Replace lost or broken tools unless a higher-tier tool is carried.
3. Prepare a furnace; **Acquire Hardware** and **Isn't It Iron Pick** — smelt
   iron and craft an iron pickaxe.
4. **Suit Up** — craft and wear an iron chestplate, then prepare a shield,
   an iron sword and the rest of the iron armor.
5. **Hot Stuff** — collect a lava source in a bucket.
6. **Diamonds!** — staircase/branch mining, then a diamond pickaxe.
7. Fill two water buckets. For **Ice Bucket Challenge**, mine exposed obsidian
   or cast it by pouring water above lava in a contained basin. A three-cell
   water trench can refill both buckets between casts.
8. Gather ten obsidian, ignition supplies and food; **We Need to Go Deeper** —
   construct and enter a Nether portal.

After server-confirmed Nether entry, the bot returns to the Overworld, can
pursue Enchanter if it already has book supplies, and works toward full diamond
armor. Autonomous fortress, stronghold and dragon progression are not
implemented. Staged LAN trials verified the diamond
interrupt, a renewable water source, and one cast with server-confirmed Ice
Bucket Challenge. A continuous run to ten obsidian and Nether entry is still
unverified, as is the redstone demo.

Equipment and ingredient preparation are objectives, not invented Java
advancements. Completion announcements come exclusively from server
advancement packets, including AND/OR criterion requirements, resets and
revocations. The server restores the bot's advancement history when it rejoins.
Current inventory determines whether lost tools must be rebuilt.

## Behavior summary

`chooseAction` in `src/decision-engine.js` picks one action per cycle. Food,
danger, environmental reflexes, recoverable death drops and night protection
interrupt the route above. After each Overworld spawn, reaching a large land
mass comes first, after the reflexes (F135). A threat cancellation replans after 100 ms, a
success after 250 ms, a failure after 1.5 s. Path searches and actions are
bounded. An operation that refuses cancellation forces a reconnect.
Minecraft commands for staged tests stay outside the gameplay controller.

The current rules for mining, furnaces, food, combat, night, shelter and
recovery, each with its constants and finding IDs, are under "Policies in
force" in `FINDINGS.md`. Research behind the cave and night branches is in
[CAVE-OPPORTUNITIES.md](CAVE-OPPORTUNITIES.md) and
[NIGHT-OPPORTUNITIES.md](NIGHT-OPPORTUNITIES.md).

## State and debugging

Each launch prints its output directory under `outputs/YYYY-MM-DD@HH.MM.SS/`
(America/New_York):

- `bot.log`: actions, confirmed advancements and failures; timestamps are UTC.
- `state.json`: latest action snapshot, inventory, position, iron reserve and
  confirmed advancements.
- `session.json`: configuration, exploration seed, hostname, runtime, source
  hashes and Git revision when available.
- `p.pid`: bot process ID.
- `finished.json`: stop reason and elapsed wall time after a clean shutdown.

The read-only watcher starts at the end of the log and prints advancements,
iron pickaxe recoveries, deaths, critical damage, repeated failures,
disconnects and log silence. The optional duration defaults to 1,800 seconds.
Attach to the new directory after a restart.

```sh
node scripts/watch.js 'outputs/YYYY-MM-DD@HH.MM.SS' 1800
```

Set `MC_WORLD_ID` to a unique label to retain home, mining routes, cave
checkpoints, chest visits, failure memory and pause/follow state across script
restarts. Keep the label when only the LAN port changes. Use a different label
for a different world; a changed server seed hash also clears saved
coordinates. With the label empty, the initial dry-land milestone is saved by
bot username and server seed hash. Other memory lasts for the current process.
Advancement completion always comes from the server, never the coordinate
cache. Saved memory lives in `.state/` and writes through a temporary file and
rename.

Source is tracked in the public GitHub repository
`saajidchowdhury/minecraft-advancement-bot`. Startup source hashes also
identify the exact code loaded when testing a working tree.

## Verify

Using the prepared runtime on the development Mac:

```sh
PATH="$PWD/.tools/node-v26.13.0-darwin-x64/bin:$PATH" npm run check
PATH="$PWD/.tools/node-v26.13.0-darwin-x64/bin:$PATH" npm test
```

Tests cover advancement packet interpretation, prerequisite ordering, lost
equipment, configuration bounds, resource routing, support-block safety, tunnel
exits, liquid/falling-block checks, portal geometry, world-memory round trips
and seeded exploration. Live-test results and remaining issues are recorded in
`VALIDATION.md`.

On the development checkout, the local `outputs/cave-mob-practice.js` harness
uses a separate `CavePractice` player and a temporary stone arena with a
tinted-glass viewing roof. It requires an open LAN world with commands enabled
and `MC_OWNER` connected. Use the same visible Terminal as the ordinary bot
and stop the verified ordinary process before staging. From the repository root
with the prepared Node runtime on `PATH`, select the current port and a run file:

```sh
MC_PORT=12345 CAVE_SEED=49910 CAVE_TRIALS=1 \
  CAVE_RESULTS=outputs/creeper-rematch.json \
  node --env-file=.env outputs/cave-mob-practice.js
```

Omit `CAVE_TRIALS` for all eight encounters, or set `CAVE_MODE=staggered` for
the two reinforcement cases. The seed fixes terrain and spawn placements.
The harness records setup commands, restores the observer and removes the arena.
