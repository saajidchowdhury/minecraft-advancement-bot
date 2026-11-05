# Findings

Updated 2026-11-05 (America/New_York). Evidence labels distinguish live observations,
automated regressions, code inspection and hypotheses. Keep useful finding IDs
stable; correct or qualify an old finding when new evidence changes it.

## Current handoff

The private repo is `saajidchowdhury/minecraft-advancement-bot`. The 00:33:48
run on port 50330 used code `932b1ed4b671`, PID 8097, artifacts
`outputs/2026-11-05@00.33.48/`. It was stopped with SIGTERM at
2026-11-05T06:00:46.294Z after a sustained rubble toss/re-pickup loop at Y=14.
Identity, working directory and TCP connection were verified before stopping.

That run crafted/equipped the shield, collected lava and received the server's
Hot Stuff packet at 05:40:56.578Z, bringing the confirmed total to ten. It also
verified a shelter enclosure at 05:45:11.762Z and waited through the night
without recorded damage. A later daylight exit needed recovery/reconnections;
night waiting is supported by evidence, reliable shelter exit still needs work.
No new hostile-damage escape/recovery trial occurred. The charcoal fix completed
ordinary smelts; the exact two-single-plank scenario remains unconfirmed live.

New cave surveys, opportunistic reserves, surface food preparation and inventory
cleanup fixes are implemented with automated coverage; their live status must be
read separately below. Source edits did not change the stopped running process.

## F001 — Project scope and visibility [user requirement]

Develop the bot's reusable ability to get selected advancements in sensible
prerequisite order, rather than merely finishing one world's playthrough. Do not
chase exhaustive achievements such as every biome. Functional redstone builds
are optional and secondary. Preserve a separate visible player in the user's
LAN survival world. Controls such as `!status` go in Minecraft chat (T, command,
Enter), not the shell. The preserved original lives in `minecraft-iris/` and is
ignored by Git.

## F002 — Runtime, identity and world memory [live verified; changeable]

The tested setup is Java 26.1.2, protocol 775. The pinned Mineflayer 4.39.0 stack
uses its `26.1` protocol data for `MC_VERSION=26.1.2`; `src/config.js` implements
this mapping. Last supplied LAN port: 50330. Last bot/owner: AdvancementBot /
newflag. Read current `.env` and the user's latest instruction rather than
reusing these as permanent defaults.

`./scripts/run.sh [port]` selects an available runtime. Node 22+ is required;
this Mac has a working Intel portable runtime via Rosetta in `.tools/`, while
bootstrap can install a native runtime. `npm ci` reapplies the inherited crafting
patch. `MC_WORLD_ID` is a memory label, not necessarily the current LAN port;
the existing label `lan-49871` was retained after the port changed. Memory writes
atomically under `.state/`; a changed server seed hash clears saved coordinates.

## F003 — Advancement completion is not equipment ownership [live + regression]

`src/advancement-tracker.js` consumes server advancement packets. Requirements
are AND-of-OR groups, and resets, criterion revocations and removed definitions
must be honored. Recipes are excluded from announcements. An inventory-based
planner transition does not establish completion. Conversely, a completed
advancement does not mean the bot still owns its tool after breakage or death.

Ten confirmed IDs: story/root, story/mine_stone, story/upgrade_tools,
story/smelt_iron, story/iron_tools, story/obtain_armor, adventure/root,
adventure/kill_a_mob husbandry/root and story/lava_bucket (all in the minecraft namespace).
Evidence: `outputs/2026-11-05@00.06.22/`, especially 00:09 food/eating and
00:13:30 armor. See `test/advancement-tracker.test.js` and
`test/advancement-plan.test.js` for durable regressions.

## F004 — Navigation needs bounded, supported steps [live + regressions]

Selecting buried stone and asking generic pathfinding to reach it caused repeated
failures and pits. Exposed resource targets plus deliberately carved stair steps
worked. Do not remove the bot's support block. Stair preflight checks loaded
blocks, liquids/falling blocks, support, tool tier and jump clearance. Open caves
may require placing attached stair supports. Treat horizontal exits, step-up exits
and step-down exits as usable exits, not vertical-shaft traps. A short checked
jump is available when pathfinder stalls on an already prepared adjacent stair.

The pathfinder's `stop()` defers stopping and can poison a subsequently installed
goal. Cancellation now clears the goal synchronously with `setGoal(null)`.
Recovery scouting also needs its own timeout; an outer action timeout does not
cover work performed later in a catch handler. A cancelled operation must release
control before another begins; otherwise reconnect.
Evidence: `test/resource-routing.test.js`, `test/progression-skills.test.js`,
`test/combat-navigation.test.js`; 23:52:54 run climbed Y=48 to Y=68.

## F005 — Tool conservation affects net advancement progress [live + regression]

Using the iron pick for all tunnel stone consumed replacement ingots before the
bot could accumulate armor materials. Maintain a stone work pick; reserve iron
and diamond tools for blocks that need their harvest tier. Re-evaluate the held
tool after breakage during a multi-block action. Current priority logic is in
`miningPickaxe()` and the work-pick prerequisite in `nextAdvancement()`.
The 00:06:22 run subsequently accumulated eight ingots and crafted/equipped the
chestplate. Do not confuse successful tool replacement with overall progress if
valuable inputs are being consumed as fast as they are gathered.

## F006 — Side probing works; spacing eight is not optimized [live + regression]

Every eight horizontal main-tunnel blocks, probe left and right at head height
without walking into the probes, stopping at reach, hazards, unknown blocks or
ore. Newly exposed ore returns control to harvesting. BOT_PROBE_SPACING changes
the interval; zero disables it. The 23:46:42 run mined eight side blocks at one
station; the 00:06:22 run later logged probes exposing ore.

This demonstrates operation, not superior yield. No controlled comparison of
spacing values has been run. Measure useful ore per elapsed time and tool wear,
not only exposed surface area. Tests: `test/side-probes.test.js`.

## F007 — Pursuit must retain its dynamic follow goal [live + regression]

Resetting GoalFollow every 300 ms interrupted navigation to prey. Keep one dynamic
goal while approaching, then clear it when attacking. After a kill, explicitly
collect the drops; attack range can exceed pickup range. Inaccessible prey is
remembered briefly. Regression: `test/combat-navigation.test.js`.
Food pickup/eating and Husbandry were verified in the 00:06:22 run, so the earlier
food-chase limitation in historical logs is no longer wholly untested.

## F008 — Furnace windows own the active inventory [regression; live retry pending]

While a furnace window is open, `bot.inventory` can retain a stale view. After
feeding one of two single-plank stacks, selecting from that stale view picked the
same consumed plank again: `Can't find oak_planks in slots [3 - 39]` at 00:09:48
in the 00:06:22 run. Charcoal input/fuel selection now reads `furnace.items()`.

An earlier test mutated both inventory views together and missed the real bug.
`test/charcoal.test.js` now freezes the player-inventory snapshot while the open
window changes, reproduces the failure, and passes the fix (`2ba6526`). A new live
mixed-plank smelt has not been confirmed. The general lesson is to model the
actual container boundary, not just a mutable array shared by every mock.

## F009 — A shelter-complete log is not a safety proof [live failure + inspection]

The 00:16:00 run reported a shelter complete at 00:16:31 near (-50,76,32), waited,
then dropped from full health to about 3.9 at 00:22:32 and died at 00:22:34. Damage
source was not recorded; a creeper, another hostile, environmental damage or an
external player action cannot be distinguished from this log alone.

Inspection of `2ba6526` shows `makeNightSafe()` suppresses individual placement failures and
sets `sheltered=true` unconditionally. It does not verify the enclosing geometry
or revalidate protection during waiting. A cancelled shelter operation also
logged completion after disconnect at 00:23:52. Treat night shelter and its
cancellation as unverified until G001 is addressed. Test physical enclosure and
liveness, and do not present a tiny wall shell as explosion-proof.

Follow-up: physical floor/wall/roof checks now gate success and are rechecked
while waiting. Damage invalidates the shelter and logs active action and nearby
threats. Shelter construction and individual placements capture and check their
cancellation signal, including after equipping and before sending placement.
Focused regressions passed; live validation of the new night behavior is
still pending. `test/survival-safety.test.js` contains the reproductions.

## F010 — Critical-health cancellation currently interrupts escape [live + inspection]

In the same run, `Action: escape` was followed by `Cancelling current task:
critical health`, then death. The `2ba6526` health-event callback cancels every busy action
at health <=6, including the escape it is supposed to allow. Reproduce this at the
event boundary and exempt or explicitly prioritize the active escape operation.
This is a concrete bug; it does not by itself establish the original damage cause.
Repeated recovery deaths also replaced the saved last-death position; the first
inventory's despawn clock must not be assumed to reset with a later death.

Follow-up: the active escape is exempt from critical-health interruption; unsafe
work is still cancelled. Nearby repeated deaths in the same dimension preserve
the first incident's conservative recovery age and attempt count. A new dimension
starts a separate incident. Unarmed recovery flees threats within six blocks.
Event-boundary and priority-policy regressions pass. This reduces one death-loop
mechanism; it is not proof that every recovery route or hostile encounter is safe.

## F011 — Wood, inventory and workstation logistics remain inefficient [observed]

Wood approach timed out after 10 s for a tree around 44 blocks away, then retried
a different log in the same column. The code quarantines individual block
coordinates, not whole failed tree approaches. Determine whether the failure is
travel budget, path geometry or control ownership before changing navigation.
The bot carried hundreds of cobblestone and sometimes duplicate furnaces; cleanup
exists but its live behavior and station retrieval still need scrutiny. Small
wood batches and lost furnace burn time can force repeated surface trips.

## F012 — Coverage and source provenance [verified baseline]

67 focused tests passed at `2ba6526`; the survival follow-up passes 75 tests.
See `VALIDATION.md` for commands and scope.
The Mineflayer crafting patch applies to reconstructed pristine 4.39.0 sources.
The installed dependencies are locked. Passing planner/geometry tests do not
validate diamond mining, lava collection, casting, portals or redstone end to end.
The implemented route currently ends after Nether entry; that is an implementation
limit, not the project's final objective.

Each run records commit, source hashes, PID, config, hostname, inventory snapshots
and UTC event times under a directory named in America/New_York. Code edits are
not loaded by an already-running process. Verify PID identity and current server
connection before stopping/restarting; an absent `finished.json` is not proof a
process is still alive. Keep local logs/state/credentials out of GitHub.

## F013 — Cave surveys and shared-resource preparation [implementation + regression]

The original mining fallback immediately carved a tunnel when no requested ore
was exposed. There was no cave survey or general reserve policy. Mining now
checks nearby harvestable ore for capped future reserves and searches connected
roofed cave floor before tunneling. Short dry walking, verified torch placement,
protection/food/threat gates, a shared step budget, dimension-scoped expiring
visits and return anchors are covered in `test/cave-exploration.test.js`.
The actual diamond-action dispatch is tested, not just the scoring function.

Surface deep-mining departures reserve twelve hunger points of food; cleanup
starts with four empty slots remaining to leave room for supplies and drops.
These are initial policies, not measured optimum quotas or proof of safe return.
`cave-opportunities.md` records official-source research and separates implemented
ore reserves from later berry, axolotl, geode, container and enchanting skills.
A large cave survey and return still need live evidence.

## F014 — Rubble disposal can immediately undo itself [live failure + regression]

At 05:58:20Z cleanup dropped a one-item stack while carrying 897 cobblestone.
From roughly 05:59Z to shutdown the same-position inventory oscillated between
about 856 and 896 as discarded rubble was picked up again. The original policy
selects the first eligible stack and tosses without moving. Inventory arithmetic
and caller-level regressions reproduce both shortcomings.

Cleanup now chooses the largest eligible surplus stack, preserves existing
building reserves/valuables, and preflights a three-block dry retreat before
throwing in the opposite direction. It walks at most four checked adjacent steps
with digging/bridging disabled and restores normal movement afterward. No safe
retreat means no toss. Later revisiting the disposal area can still pick up
rubble; this patch addresses the immediate stationary loop, not permanent storage.
A live retry is required; no claims about permanent inventory economics yet.
