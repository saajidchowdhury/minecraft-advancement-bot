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

You can also override the port for one run:

```sh
./scripts/run.sh 49871
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
| `!pause` | Cancel work and remain paused |
| `!resume` | Stop following and resume autonomous progression |
| `!come` | Suspend progression and follow the requesting player while visible/loaded |
| `!redstone` | Queue a lever-powered piston block pusher after the advancement route |

Ctrl-C in the terminal stops the bot. An ordinary LAN world accepts a distinct offline bot username; an authenticated server requires `MC_AUTH=microsoft` and a separate Minecraft-owning account for the bot.

## Progression

The implemented route is:

1. **Minecraft** — crafting table; prepare a wooden pickaxe and sword.
2. **Stone Age** and **Getting an Upgrade** — cobblestone and a stone pickaxe.
3. Prepare a furnace; **Acquire Hardware** and **Isn't It Iron Pick** — smelt iron and craft an iron pickaxe.
4. **Suit Up** — craft and wear an iron chestplate; prepare a shield.
5. **Hot Stuff** — collect a lava source in a bucket.
6. **Diamonds!** — staircase/branch mining, then a diamond pickaxe.
7. Prepare water; **Ice Bucket Challenge** — mine exposed obsidian or cast individual blocks in a contained basin.
8. Gather ten obsidian, ignition supplies and food; **We Need to Go Deeper** — construct and enter a Nether portal.

The bot waits near its destination after the supported route. Return it to the Overworld before a queued redstone demo. Autonomous fortress, stronghold and dragon progression are not implemented. The diamond, casting, portal and redstone skills still need end-to-end survival-world validation; their planner and geometry checks alone do not prove successful gameplay.

Equipment and ingredient preparation are objectives, not invented Java advancements. Completion announcements come exclusively from server advancement packets, including AND/OR criterion requirements, resets and revocations. The server restores the bot's advancement history when it rejoins. Current inventory determines whether lost tools must be rebuilt.

Food, danger, recoverable death drops and night protection can interrupt the route. Mining uses exposed targets and checked staircase steps, avoids removing its own support, and replaces broken tools. Charcoal provides furnace fuel when coal is unavailable. Every eight horizontal tunnel blocks, it looks left and right and opens head-height probes from its current position until reach or safety checks stop it. Exposed ore returns control to resource harvesting. `BOT_PROBE_SPACING=8` sets the interval; `0` disables probing. Eight is a starting value, not a measured optimum.

Path searches and actions have limits; an operation that refuses cancellation triggers reconnection before another action starts.

## State and debugging

Each launch prints its output directory under `outputs/YYYY-MM-DD@HH.MM.SS/` (America/New_York):

- `bot.log`: actions, confirmed advancements and failures; timestamps are UTC.
- `state.json`: latest action snapshot, inventory, position and confirmed advancements.
- `session.json`: configuration, exploration seed, hostname, runtime, source hashes and Git revision when available.
- `p.pid`: bot process ID.
- `finished.json`: stop reason and elapsed wall time after a clean shutdown.

Set `MC_WORLD_ID` to a unique label to retain home, mining routes, failure memory and pause/follow state across script restarts. This setup uses `lan-49871` for the current world. Use a different label for a different world; a changed server seed hash also clears saved coordinates. Leave the field empty for memory limited to the current process. Advancement completion always comes from the server, never the coordinate cache. Saved memory lives in `.state/` and writes through a temporary file and rename.

`BOT_SEED` makes exploration choices repeatable; server timing, entities and world changes still affect gameplay. `BOT_LOG_LEVEL=debug` increases navigation detail. Source is tracked in the private GitHub repository `saajidchowdhury/minecraft-advancement-bot`. Startup source hashes also identify the exact code loaded when testing a working tree.

## Verify

Using the prepared runtime on this Mac:

```sh
PATH="$PWD/.tools/node-v26.13.0-darwin-x64/bin:$PATH" npm run check
PATH="$PWD/.tools/node-v26.13.0-darwin-x64/bin:$PATH" npm test
```

Tests cover advancement packet interpretation, prerequisite ordering, lost equipment, configuration bounds, resource routing, support-block safety, tunnel exits, liquid/falling-block checks, portal geometry, world-memory round trips and seeded exploration. Live-test results and remaining issues are recorded in `VALIDATION.md`.
