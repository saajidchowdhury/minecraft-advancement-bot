# Minecraft Advancement Bot

A visible second player for your **Java Edition survival world opened to LAN**. Watch `AdvancementBot` from your own Minecraft client while it gathers, crafts, mines and pursues advancements. No LLM service or API key is required.

`minecraft-iris/` is the untouched original. The new bot runs from this directory.

## Start

1. Open your survival world → **Open to LAN** → **Start LAN World**.
2. Put the displayed port in `.env` as `MC_PORT=...`.
3. Run:

```sh
cd /Users/rf/Downloads/minecraft
./scripts/run.sh
```

You can also pass the displayed LAN port for one run. For example:

```sh
./scripts/run.sh 54390
```

The current configuration uses `AdvancementBot`, owner `newflag`, offline LAN authentication, and Minecraft **26.1.2**. Version 26.1.2 advertises protocol 775; this project selects the pinned library's compatible `26.1` protocol data. Keep Minecraft open while the bot runs. Watch it from your normal player, or type `!come` to bring it toward you; `!resume` restarts advancement work.

A Node runtime and dependencies are prepared on this Mac. The launcher prefers a native portable runtime, then installed Node, then the existing Intel runtime through Rosetta. To install a native runtime or set up another machine:

```sh
./scripts/bootstrap.sh
```

With Node 22 or newer already installed, `npm ci` installs the locked dependencies and reapplies the two inherited crafting synchronization patches. Mineflayer is pinned to 4.39.0. Other Minecraft protocol versions have not been tested here.

## In-game controls

Press **T** in Minecraft, type a command such as `!status`, then press **Enter**. These commands go in the game chat, not the terminal.

Only `MC_OWNER` can issue controls when that field is populated.

| Command | Effect |
| --- | --- |
| `!status` | Current action, advancement objective, health, hunger and coordinates |
| `!advancements` | Advancements confirmed by the Minecraft server |
| `!inventory` (`!inv`) | Tools with remaining durability, worn armor/offhand, then item counts |
| `!pause` | Cancel work and remain paused |
| `!resume` | Stop following and resume autonomous progression |
| `!come` | Suspend progression and follow the requesting player while visible/loaded |
| `!redstone` | Queue a lever-powered piston block pusher after the advancement route |

Ctrl-C in the terminal stops the bot. An ordinary LAN world accepts a distinct offline bot username; an authenticated server requires `MC_AUTH=microsoft` and a separate Minecraft-owning account for the bot.

## Progression

The implemented route is:

1. **Minecraft** — crafting table; prepare a wooden pickaxe and sword.
2. **Stone Age** and **Getting an Upgrade** — cobblestone and a stone pickaxe,
   then a stone axe for wood and a stone shovel for dirt, grass blocks, sand,
   and gravel. Replace lost or broken tools unless a higher-tier tool is carried.
3. Prepare a furnace; **Acquire Hardware** and **Isn't It Iron Pick** — smelt iron and craft an iron pickaxe.
4. **Suit Up** — craft and wear an iron chestplate; prepare a shield.
5. **Hot Stuff** — collect a lava source in a bucket.
6. **Diamonds!** — staircase/branch mining, then a diamond pickaxe.
7. Fill two water buckets. For **Ice Bucket Challenge**, mine exposed obsidian
   or cast it by pouring water above lava in a contained basin. A three-cell
   water trench can refill both buckets between casts.
8. Gather ten obsidian, ignition supplies and food; **We Need to Go Deeper** — construct and enter a Nether portal.

The bot waits near its destination after the supported route. Return it to the Overworld before a queued redstone demo. Autonomous fortress, stronghold and dragon progression are not implemented. Staged LAN trials verified the diamond interrupt, a renewable water source, and one cast with server-confirmed Ice Bucket Challenge. A continuous run to ten obsidian and Nether entry is still unverified, as is the redstone demo.

Equipment and ingredient preparation are objectives, not invented Java advancements. Completion announcements come exclusively from server advancement packets, including AND/OR criterion requirements, resets and revocations. The server restores the bot's advancement history when it rejoins. Current inventory determines whether lost tools must be rebuilt.

Food, danger, recoverable death drops and night protection can interrupt the route. Mining uses exposed targets and checked staircase steps, avoids removing its own support, and replaces broken tools. Charcoal provides furnace fuel when coal is unavailable. Every eight horizontal tunnel blocks, the bot opens head-height probes up to five blocks on each side. It can crouch closer to the wall while staying in the tunnel cell. Reach and safety checks can shorten a probe, and exposed ore returns control to resource harvesting. `BOT_PROBE_SPACING=8` sets the interval. Set it to `0` to disable probing. Eight is a starting value, not a measured optimum.

Newly exposed diamonds can interrupt another mining objective when safe. After
collecting the drop, the bot returns to the interrupted objective. It also
gathers other nearby ores up to small reserve caps. A supplied and protected
bot explores caves depth first, remembering checkpoints and return waypoints
by dimension. It checks lighting and support, stops for threats, and avoids
digging or bridging during the survey. It can loot visible chests and chest
minecarts and remember whether each was emptied. Before leaving the surface
to mine, it stocks at least eight logs' worth of wood and sixteen hunger
points of carried food. A full natural cave survey and return still needs
live validation. See
[cave-opportunities.md](cave-opportunities.md) for researched branches and limits.

Food gathering can turn nearby red and brown mushrooms, including drops from
giant mushroom caps, into stew. It crafts bowls at a crafting table when needed.
Repeated movement stalls switch to cardinal scouting and, if that fails, a
short staircase with support and liquid checks.

Inventory cleanup throws away clutter and surplus rubble while keeping prepared
food. If the pack fills without ordinary surplus, the bot frees a slot using a
lower-priority stack. A nearby owned chest or barrel can take overflow when
there is no safe place to throw it clear.

Nightfall alone does not stop underground work. On the surface, a prepared bot
can hunt isolated useful mobs within a small budget; weak or overwhelmed bots
try safe sleep or shelter. Bed preparation uses available same-color wool, and
beds are only used in the Overworld. In this LAN setup, the bot joins sleep
only when it can observe the owner sleeping, and wakes when the owner wakes.
Staged trials confirmed Sweet Dreams and a spider hunt. The bot also earned
Not Today, Thank You in a later LAN run. Reliable natural combat, cooperative
sleep and shelter exits still need live validation.
See [night-opportunities.md](night-opportunities.md) for researched drops,
advancement dependencies, readiness thresholds and remaining skills.

Path searches and actions have limits; an operation that refuses cancellation triggers reconnection before another action starts.

## State and debugging

Each launch prints its output directory under `outputs/YYYY-MM-DD@HH.MM.SS/` (America/New_York):

- `bot.log`: actions, confirmed advancements and failures; timestamps are UTC.
- `state.json`: latest action snapshot, inventory, position and confirmed advancements.
- `session.json`: configuration, exploration seed, hostname, runtime, source hashes and Git revision when available.
- `p.pid`: bot process ID.
- `finished.json`: stop reason and elapsed wall time after a clean shutdown.

To watch a live run from a second terminal, pass the run directory to the
read-only watcher. It starts at the end of the log and prints advancements,
iron pickaxe recoveries, deaths, critical damage, repeated failures, disconnects
and log silence. The optional duration defaults to 1,800 seconds. Attach to the
new directory after a restart.

```sh
node scripts/watch.js 'outputs/YYYY-MM-DD@HH.MM.SS' 1800
```

Set `MC_WORLD_ID` to a unique label to retain home, mining routes, cave checkpoints, chest visits, failure memory and pause/follow state across script restarts. Keep the label when only the LAN port changes. Use a different label for a different world; a changed server seed hash also clears saved coordinates. Leave the field empty for memory limited to the current process. Advancement completion always comes from the server, never the coordinate cache. Saved memory lives in `.state/` and writes through a temporary file and rename.

`BOT_SEED` makes exploration choices repeatable; server timing, entities and world changes still affect gameplay. `BOT_LOG_LEVEL=debug` increases navigation detail. Source is tracked in the private GitHub repository `saajidchowdhury/minecraft-advancement-bot`. Startup source hashes also identify the exact code loaded when testing a working tree.

## Verify

Using the prepared runtime on this Mac:

```sh
PATH="$PWD/.tools/node-v26.13.0-darwin-x64/bin:$PATH" npm run check
PATH="$PWD/.tools/node-v26.13.0-darwin-x64/bin:$PATH" npm test
```

Tests cover advancement packet interpretation, prerequisite ordering, lost equipment, configuration bounds, resource routing, support-block safety, tunnel exits, liquid/falling-block checks, portal geometry, world-memory round trips and seeded exploration. Live-test results and remaining issues are recorded in `VALIDATION.md`.
