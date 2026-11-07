# Development notes

Technical details moved out of the player-facing `README.md`. See also
`findings.md`, `goals.md`, `strategy.md` and `VALIDATION.md`.

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
installed, `npm ci` installs the locked dependencies and reapplies the two
inherited crafting synchronization patches.

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

1. **Minecraft** — crafting table; prepare a wooden pickaxe and sword.
2. **Stone Age** and **Getting an Upgrade** — cobblestone and a stone pickaxe,
   then a stone axe for wood and a stone shovel for dirt, grass blocks, sand,
   and gravel. Replace lost or broken tools unless a higher-tier tool is carried.
3. Prepare a furnace; **Acquire Hardware** and **Isn't It Iron Pick** — smelt
   iron and craft an iron pickaxe.
4. **Suit Up** — craft and wear an iron chestplate; prepare a shield.
5. **Hot Stuff** — collect a lava source in a bucket.
6. **Diamonds!** — staircase/branch mining, then a diamond pickaxe.
7. Fill two water buckets. For **Ice Bucket Challenge**, mine exposed obsidian
   or cast it by pouring water above lava in a contained basin. A three-cell
   water trench can refill both buckets between casts.
8. Gather ten obsidian, ignition supplies and food; **We Need to Go Deeper** —
   construct and enter a Nether portal.

The bot waits near its destination after the supported route. Return it to the
Overworld before a queued redstone demo. Autonomous fortress, stronghold and
dragon progression are not implemented. Staged LAN trials verified the diamond
interrupt, a renewable water source, and one cast with server-confirmed Ice
Bucket Challenge. A continuous run to ten obsidian and Nether entry is still
unverified, as is the redstone demo.

Equipment and ingredient preparation are objectives, not invented Java
advancements. Completion announcements come exclusively from server
advancement packets, including AND/OR criterion requirements, resets and
revocations. The server restores the bot's advancement history when it rejoins.
Current inventory determines whether lost tools must be rebuilt.

## Behavior summary

Food, danger, recoverable death drops and night protection can interrupt the
route. Mining uses exposed targets and checked staircase steps, avoids removing
its own support, and replaces broken tools. Charcoal provides furnace fuel when
coal is unavailable. Every eight horizontal tunnel blocks, the bot opens
head-height probes up to five blocks on each side. It can crouch closer to the
wall while staying in the tunnel cell. Reach and safety checks can shorten a
probe, and exposed ore returns control to resource harvesting. Eight is a
starting value, not a measured optimum.

Newly exposed diamonds can interrupt another mining objective when safe. After
collecting the drop, the bot returns to the interrupted objective. Visible iron
interrupts the same way while raw iron plus ingots are below 16 plus the ingots
for missing iron gear (pickaxe, shield, sword, four armor pieces, three buckets).
It also gathers other nearby ores up to reserve caps (coal and charcoal: 32). A supplied and protected
bot explores caves depth first, remembering checkpoints and return waypoints by
dimension. It excludes remembered mining passages from surveys and checks the
local light level before placing a torch. A placement check enforces at least
10 blocks of straight-line distance from every nearby torch or wall torch,
including ones behind the bot. It checks support, stops for threats, and avoids
digging or bridging during the survey. It can loot visible chests and chest
minecarts and remember whether each was emptied. Target discovery uses a
100° horizontal by 70° vertical view and a clear ray from eye level.
Resource searches can turn in place to look around. Buried ore coordinates
do not steer the tunnel. With no visible iron, the fallback heads toward
Y=16. Tunneling keeps a stable heading and a frontier scoped by dimension and
target depth. After nearby detours it walks back without digging or bridging
before resuming. Existing excavations may be crossed forward; lateral bypasses
retain mining exclusions and cannot reverse the main heading.
A mined block opens up to six adjacent faces. The bot can turn to
mine a remembered face while the opening is still air and the face has a
clear sightline. Movement and placement checks still read nearby block geometry.
Before leaving the surface to mine in daylight, it stocks 32 logs (a plank
counts as a quarter log), then 16 average cooked land meats (260.48 hunger plus
saturation points). Urgent hunger and ready furnace output can still interrupt
restocking. Raw food counts at its cooked value. Nearby open ground sets the
reserve check's height at a shallow mine entrance even below the original spawn.
Raw meat, fish and potatoes are cooked in fire-and-forget
furnace jobs. While the meal reserve is short it takes food on the way, underground
or not: cod and salmon near the water surface, ripe glow berries, mushroom stew (up to
four) and tropical fish, and it waits at a remembered fish shore before scouting. At
night it never works or hunts on the surface: it takes a known shaft down, carves
down when protected, or shelters; underground it keeps mining regardless of
carried food and waits enclosed once health falls to 12 or less. A full natural cave survey and return still needs live
validation. See [cave-opportunities.md](cave-opportunities.md).

Food gathering can turn nearby red and brown mushrooms, including drops from
giant mushroom caps, into stew. It crafts bowls at a crafting table when
needed. Repeated movement stalls switch to cardinal scouting and, if that
fails, a short staircase with support and liquid checks.

Inventory cleanup throws away clutter and surplus rubble while keeping prepared
food. If the pack fills without ordinary surplus, the bot frees a slot using a
lower-priority stack. A nearby owned chest or barrel can take overflow when
there is no safe place to throw it clear.

Nightfall alone does not stop underground work. On the surface it does no night
work or hunting (removed in `ce24690`, F071); it sleeps when the owner sleeps,
takes a known shaft down, carves down when protected, or shelters. Bed preparation uses available same-color wool, and
beds are only used in the Overworld. In this LAN setup, the bot joins sleep
only when it can observe the owner sleeping, and wakes when the owner wakes.
Staged trials confirmed Sweet Dreams and a since-removed spider hunt. The bot also earned
Not Today, Thank You in a later LAN run. Reliable natural combat, cooperative
sleep and shelter exits still need live validation. See
[night-opportunities.md](night-opportunities.md).

Path searches and actions have limits; an operation that refuses cancellation
triggers reconnection before another action starts.

Water search uses actual sky exposure rather than the near-home height flag.
During daylight it finishes returning to open ground before surface scouting;
scout and bucket-approach paths cannot dig or bridge into another cave.
At night it searches covered caves and tunnels at the current depth, preserving
cover and interrupting any daytime water trip at nightfall. A visible spring
already within bucket reach can still supply water without a surface detour.

## State and debugging

Endermen have a separate defensive response. Ordinary look calls and each
physics tick avoid unobstructed enderman faces, including yaw interpolation.
Visible anger or an attributed hit interrupts work and follow mode. The bot
pours carried water outside the Nether, tries a sealed burrow, and carves a
two-high side refuge if the shaft cannot be sealed. It keeps the enclosure
closed while the remembered threat remains; endermen are never combat targets.
Command staging remains external to the gameplay controller.

Each launch prints its output directory under `outputs/YYYY-MM-DD@HH.MM.SS/`
(America/New_York):

- `bot.log`: actions, confirmed advancements and failures; timestamps are UTC.
- `state.json`: latest action snapshot, inventory, position and confirmed advancements.
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
coordinates. Leave the field empty for memory limited to the current process.
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
