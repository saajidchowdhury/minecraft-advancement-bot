# Findings

Updated 2026-11-06 (America/New_York). Evidence labels distinguish live observations,
automated regressions, code inspection and hypotheses. Keep useful finding IDs
stable; correct or qualify an old finding when new evidence changes it.

## Current handoff

Port 52171 is active in Terminal (PID 27456, run `outputs/2026-11-06@22.26.46`,
profile `lan-49871`). It uses the working-tree changes through F085 and
resumed descending toward diamonds. F082 reached 33 logs before food.

The 19:59 Eastern run on port 51528 (PID 18292, `6091863`, world profile
`lan-49871`) started its iron descent without food below a high spawn (F077).
The departure fix is in the working tree. The running bot is already deep
underground on its startup revision.

Updated 2026-11-06 ~13:45 Eastern. Session ended: the bot was STOPPED at 18:40:11Z (SIGINT,
PID 7261, run `outputs/2026-11-06@12.39.17` on `c085d82`) after five deaths in 20 minutes
(F076); it is bare at spawn. No bot, watcher or monitor is running. The LAN world is the same
`lan-55502-20261106` profile, last opened on port 49259 (the port changes per LAN open). Code
at the pushed head passes all 319 tests and syntax checks. Start with goals.md G015.
Monitoring lesson: a `Monitor` pipeline ending in `cut` buffers output and delivered no events
for an hour; filter with `grep --line-buffered` only.

Previous handoff, ~04:08 Eastern. Session ended: the bot was STOPPED at 09:07:55Z (SIGINT,
run `outputs/2026-11-06@04.03.39` on `cecbf1d`), rebuilding stone tools after seven deaths.
No bot or watcher process is running. A fresh LAN world on port 55502 uses world ID
`lan-55502-20261106`; see F057 for its timeline. F055 is resolved by F056. Code
at `cecbf1d` passes all 303 tests and syntax checks. Read the latest
`outputs/2026-11-06@*/session.json` for the running revision, and verify the PID
with `pgrep -f src/index.js` before taking over.

Historical 18:20 Eastern handoff. Bot ran on LAN port 51718, PID 56696, code
`a18c0ff`, rebuilding basic tools after a pickaxe loss; no log watcher is running. Verify the
PID and connection before stopping it; `pgrep -f src/index.js` must return one PID.
Fourteen advancements are server-confirmed. A furnace at (-283,68,-150) holds about 29 raw
iron as the remembered smelt job, but the bot carries no coal or charcoal and nothing yet
fetches fuel for a stalled job (top item in goals.md). The base is migrating to a barrel
vault (F039), pending nine planks. Suite: 214 tests plus syntax checks. Staging helpers and
setup records (`outputs/stage-*.js`, `outputs/*-setup.json`) are ignored local files.

The previous 01:55:10 handoff is in git history and VALIDATION.md; the 02:08:36 run
(`a80974a`) followed it unrecorded and is analysed in F019/F020. The server lists
fourteen completed advancements, including the staged Sweet Dreams from F017.

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
adventure/kill_a_mob, husbandry/root and story/lava_bucket (all in the minecraft namespace).
Evidence: `outputs/2026-11-05@00.06.22/`, especially 00:09 food/eating and
00:13:30 armor; Hot Stuff is in the 00:33:48 run at 05:40:56.578Z. See `test/advancement-tracker.test.js` and
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

67 focused tests passed at `2ba6526`; the survival follow-up passed 75 tests.
The cave/disposal follow-up now passes 94 tests plus syntax checks.
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
A large cave survey and return still need live evidence. Revision `ac9e912`,
run `outputs/2026-11-05@01.04.11/`, gathered three raw iron through Opportunity
actions at 06:04:41–06:05:17Z while targeting Diamonds!, verifying that first
slice live. A 46-block-high synthetic cavern exposed an overly short roof check;
the follow-up scans up to 64 blocks overhead.

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
Revision `ac9e912` reduced 920 cobblestone to 664 and resumed mining, but later
retreats sometimes returned toward recent drops. A follow-up corridor regression
covers two successive disposals; retreat endpoints now stay four horizontal
blocks from the preceding same-dimension drop for two minutes. This refinement
still needs live validation; no claims about permanent inventory economics yet.

## F015 — Disposal retreat still stalled in the long run [live + uncertainty]

The `50f4151` run reached diamond-region depth but then retried the same stationary
disposal failure over fifty times. A local loaded-terrain capture replay found a
valid path, and a fresh three-second live approach reached the first upward step.
This does not identify why the long-running controller stalled: physics alignment,
timing or retained movement state remain plausible. Dropped item entities are
passable in the pinned pathfinder, so collision with the item itself is unsupported.

Upward disposal steps now use the existing checked stair-jump fallback; failures
log actual/target positions and quarantine their target. After three unsuccessful
retreats, cleanup pauses rather than tossing indefinitely. `!resume` resets that
failure budget. The focused repeated-stall regression verifies a three-toss maximum,
not a successful live retreat. This is containment plus recovery reuse; the original
physics trigger remains unresolved until a successful long live retry or sharper
failure evidence is obtained. Captured terrain and diagnostic artifacts are ignored.

## F016 — Night work now depends on readiness and useful opportunities [tests + research]

Surface nightfall previously forced shelter regardless of equipment. Underground
work already bypassed that rule. `night-policy.js` now selects short, local useful
hunts for supplied and protected bots, or leaves their regular objective active.
Crowds, dangerous mobs, low supplies/health and sudden surface-night damage can
end hunting for that night. Bed sleep is an Overworld-only option with checked
placement/orientation, both halves and server sleep state; other LAN players may
also need to sleep. Checked shelter exits replace shaft-style wall escape, and
intact shelter coordinates survive reconnects.

`night-opportunities.md` records Mojang sources and exact 26.1.2 loot/advancement
JSON inspected in the installed JAR. Spider string, skeleton bones/arrows and
later pearl/brewing prerequisites offer useful parallel branches. Carrots and
potatoes do NOT satisfy this version's A Seedy Place predicates. Ordinary loot
collection, shield activation or a sleep request never substitutes for a server
advancement packet. Hunt readiness/retreat, cancellation, beds and shelter exits
have focused tests; night hunting, projectile blocking and sleep are not live-proven.

## F017 — Controlled night evidence and LAN sleep coordination [live + regression]

The user authorizes commands solely for staged initial conditions, outside bot
feature code. Test setup records remain ignored. Runs 01:39:28 and 01:42:09 exposed
vegetation/bed-space limits and a setup canopy mistakenly treated as ground.
Vegetation is now cleared safely; the setup helper now excludes leaf supports.

The 01:46:05 run (`2c1a714`) received Sweet Dreams at 06:46:14.594Z using staged
bed/food/time. Its first sleep-skill placement failed verification; a subsequent
shelter click activated the placed bed. Do not claim a clean sleep-skill pass.
Source inspection found that forced look returns before transmission; `097f6a2`
waits for rotation packets and both bed halves, with regression coverage.

LAN sleep now requires observable sleeping state for the configured owner. If
the owner is awake or cannot be observed, the bot does not enter bed and wakes
if already sleeping. No gamerule is changed. This avoids waiting in bed while
the host must remain awake to keep the LAN world active. Owner/bot cooperation
still needs a live trial. Full suite: 121 passing tests plus syntax checks.

Correction to F015 diagnostic wording: the standalone pathfinder reported success
while the bot was still airborne below the target Y; that is not proof of a
settled stair landing. The 01:34:25 run hit the same stair failure and then paused
at the retry cap, confirming containment but not the underlying navigation fix.

## F018 — Staged hunt succeeded; natural encounter exposed earlier retreat needs [live + regression]

The 01:55:10 run at `58d68eb` selected the supplied stationary NoAI spider,
completed the hunt and retained two string by 06:55:20Z. This validates selection,
approach, attacking and pickup under staged conditions. It does not validate a
fighting spider or reliably blocking projectiles.

A natural zombie approached while gather_diamonds was still executing. Repeated
roughly 2.46-health hits did not meet the single-hit four-health interruption
threshold, so mining continued too long. At critical health, even positive healing
updates cancelled eat/shelter actions. The bot repeatedly escaped and stayed alive
but was stopped at 06:56:14.900Z instead of leaving that encounter running.

The follow-up interrupts surface night work when damaged at health <=16 as well
as after a large single hit. Healing updates no longer cancel eating or shelter
construction at critical health; actual damage can still interrupt those actions.
Focused event regressions pass. This is not a live proof of safe escape, shelter,
recovery or natural night combat. The bot remains stopped for the handoff.

## F019 — Lane disposal fixed the tunnel-face pause; drops seed return routes [live + regression]

The unrecorded 02:08:36 run (`a80974a`, port 50330) reached Y=-54 and then paused
from 07:29:51Z until the LAN closed at 10:09Z. At the face of a one-wide tunnel the
retreat search found no endpoint within four steps that was also four blocks from
the preceding drop, so the third failure set a persistent `paused` flag. The state
file still carried that pause; it was cleared like `!resume` before 10:54:41.

`152ed85` throws every surplus stack along a four-cell open feet/head lane, after
waiting two ticks for the forced look to transmit, with no movement. It prefers the
lane toward the latest route point. Reserves are now 64 cobblestone, 64 cobbled
deepslate and 16 dirt; stone variants are not reserved. Repeated failures back off
for 60 s instead of pausing indefinitely. Live 15:54:43Z at the exact failing spot:
nine stacks thrown in 1.6 s, mining resumed and none was re-collected while advancing.

Return trips then walked through those drops: at 15:55:53–15:56:17Z the bot threw,
re-collected, threw ahead along its own route and finally backed off. `e474275`
lets `return_surface` proceed with a full inventory; cleanup waits for the surface.
That return-path exemption has a regression, not yet a live retry.

Descending staircases have no level lane. Live `2bcab2b` fell back to retreat, threw
toward the face, walked back down over the drop and went from 226 to 270 cobblestone.
`944e832` adds a rising lane (open feet/head cells one step up per block, plus jump
room) with a 45-degree throw. Live 16:08:45Z at Y=31: seven stacks thrown up the
stairs in 1.6 s, no retreat, 64 cobblestone kept and descent resumed.

## F020 — Creepers: interrupt on sight, seal narrow passages, otherwise flee [live + regression]

The 02:08:36 run took creeper blasts of 11.4 hp during a fight and 9.2 hp during a
cave walk with the creeper logged 5.8 blocks away; mining continued until damage.
Creepers only swell while they see their target. `152ed85` raycasts line of sight;
a visible creeper within six blocks cancels any non-escape action and selects
escape. Escape seals up to four facing openings when building blocks suffice and
verifies lost sight, otherwise flees. Staged 16:04:50Z (creeper summoned 9–10
blocks away with sight, all else natural): interrupt at 6.0 blocks within 0.9 s,
six facing openings so the bot fled, no damage. Tunnel sealing is tested by mocks only.
The bot's worn iron pickaxe disappeared during that flee, most likely broken by
generic escape digging; escape does not yet conserve iron tools (compare F005).

## F021 — Planner wood order, survey torches and the surface test [live + regression]

`152ed85` climbed from Y=-54 for two sticks: resource order checked wood before
diamonds, so a diamond pickaxe recipe with one stick sent the bot to the surface
before any diamond was found. Location-bound ingredients (diamonds, obsidian,
flint, redstone) now precede wood; surface departures for deep work carry twelve
plank-equivalents. Live `e474275` then left at Y=65 with ~7.5, because an open
valley five blocks under the home height already counted as underground, and its
cave survey placed a torch on every step (coal 17 to 12 in 30 s). `2bcab2b`
spaces torches (none within six blocks or under sky light 12+, regression fails
before the fix) and requires the head cell to lack open sky before calling the
bot underground. The sky-light state change has no focused regression yet.
A placed crafting table was also left behind and replaced (`crafting_table=2`),
consistent with F011's workstation-reclaim inefficiency.

Staged depth setup 16:12:10Z (user-requested, `outputs/depth-setup.json`): from
(-117,-6,-29) the helper sent `/fill` air at Y=-30..-29 and `/tp` to Y=-30. The
cells were already cave air, so the bot fell to Y=-38 (health 20 to 15.2) beside
water. The stop command also missed (two PIDs matched), so the helper's login kicked
the live bot, which reconnected at the staged spot. The helper now places a floor
before teleporting; stop scripts must match exactly one verified bot PID.

## F022 — Shielded-pit disposal and diamond priority [user technique + live + regression]

The user's disposal technique is now first choice (`7aa7c7c`): facing wall d from
feet F, dig F+d+1 and F+2d+1 at head height, then the pit F+2d, and throw through
the hole. Intact F+d and roof F+d+2 keep the bot out; the pit is two blocks away and
below feet level, beyond the 1.3-block pickup reach. Cells next to liquids or under
sand/gravel are refused; lanes and retreat remain fallbacks. Live 16:23:50Z at Y=-54:
pit dug and four stacks plus tuff thrown in ~5 s; deepslate stayed at 64 afterwards.

The server confirmed Diamonds! at 16:20:34.805Z (run 11.16.50, `7aa7c7c`, natural
mining after the staged teleport). Twelve advancements are now confirmed.

User report: probes exposed diamonds that the bot never mined. Cause: every ore
search required `canSeeBlock`, a single ray to the block centre; a diamond beside a
one-high probe hole shows only one face, so `foundOre=true` led nowhere. `gatherDeep`
also rejected diamonds unless the block below was air/stone/deepslate. `cedc6f8`
ray-casts each air-exposed face, remembers probe-exposed ores for ten minutes, stops
tunnel segments when a diamond comes into view, and adds `mine_diamond`, which outranks
cleanup and routine goals but not escape, eating or combat. Liquid-adjacent diamonds
are still refused. Three regressions fail before the fix; live evidence pending.

## F023 — A perception exception killed the bot; respawn recovery gaps [live failure + regression]

Live `cedc6f8` threw `Cannot read properties of undefined (reading 'equals')` in
`observe()`: prismarine-world's sync raycast returns blocks with an intersection but
no position. Every decision cycle failed, so the bot never escaped a skeleton and
died at 16:27:05.763Z at (-131,-50,-36), four seconds before it was stopped. All
equipment, two diamonds and 15 raw iron were dropped at Y=-50. `e6078ea` locates the
hit from the intersection, makes the test raycast return the real shape, and logs
and ignores diamond-search errors so perception cannot disable safety again.
Lesson: mocks of library calls must mirror the library's actual return shape.

Respawn exposed two loops. At the bed (-95,73,56) the bot stood in a two-deep hole
inside roofless staged shelter walls and the shaft escape demanded eight upward
steps; `a980f7c` accepts a supported level rim exit (live: out in 1.3 s). Recovery
from Y=-50 with no tools failed, scouting led into a cave at Y=53, and return_surface
failed 245 times for lack of a pickaxe; `7454615` lets upward staircases dig by hand
(live: slow, about one step per 60 s action). The drops were not recovered.

## F024 — Throughput principle and the gear route [user direction + regression]

The user made expected advancement throughput an explicit project goal (CLAUDE.md
and AGENTS.md, `ef8234d`): fast progress without large risks, since deaths cost
recovery time or a restart; compounding investments such as a diamond pickaxe,
weapons and a full armor set come early. `f6aba27` crafts an iron sword and the
remaining iron armor after Hot Stuff, then the diamond pickaxe and sword, then any
affordable diamond armor piece (Cover Me with Diamonds, `minecraft:story/shiny_gear`);
`equip_armor` upgrades all four slots. Tests cover order and slot upgrades; no live
crafting of the new pieces yet. Ingot and diamond costs are vanilla recipe counts.

## F025 — Second death and stuck-terrain fixes [live + regression]

16:59:37Z (`804e2f3`): at dawn a zombie 1.2 blocks away hit the bot eight times in
7 s during gather_wood; only surface-night and critical-health damage interrupted
work, and escape at 3.8 hp came too late. `7a8b75f` cancels non-combat work on any
damage with a hostile within four blocks and escapes adjacent hostiles when unarmed.
Recovery reached the drops but the first unreachable stack aborted all pickup;
`f0583eb` approaches each stack within pickup reach and skips failures.

The tool-less bot then stood on a ravine ledge and failed gather_wood 26 times with
'No path'. Probing from that spot showed partial paths after 20–66 nodes: stone it
cannot hand-dig within the pathfinder's cost cutoff and drops beyond the 3-block
limit. `f3aa690`/`8bd0fcb` add an unstick step (6-block drop limit at health 16+,
then a hand-dug stair up after clearing the deferred goal); live it climbed Y 66→78
in about 4 min. The deeper cause of most 'No path' scouting was the goal itself:
`GoalNear(x, current Y, z, 3)` lies in air or rock on hilly terrain. `6628e8c` uses
`GoalNearXZ`. Regressions fail before each fix; live scouting after `6628e8c` pending.

## F026 — Empty-handed nights: burrow, roof support and two more deaths [live + regression]

Deaths 3 and 4 (17:15:39Z, 17:16:35Z, `6628e8c`): an empty-handed bot at night
could not wall a shelter, could not collect dirt next to its own support, and could
not outrun zombies on hilly ground; it was killed again just after respawning, then
stopped. `c57fd6a` adds an emergency burrow (dig three hand-diggable blocks straight
down, keep the drops, plug the cell above the head; liquids, falling blocks and voids
refused). Live, the burrow was refused on that hillside, so its behaviour is still
unproven in the world. Separately the walled shelter failed at the roof every time:
the roof cell touches only the head cell and air. `73aaefd` seats it on a wall-top
block first and falls back to burrowing. A recovered-dirt shelter was then verified
at 17:18:21Z and held until daylight; the creeper interrupt fired at 5.9 blocks.
Four deaths today: survival under weak gear dominates throughput (G001).

## F027 — Creeper chase, critical-health thrash and an archer death [live + regression]

17:19:30Z (`73aaefd`): fleeing in single 16-block legs let a creeper close in and
explode (18.3 to 0.22 hp). At health <= 6 each regeneration update cancelled the next
work action. `ba59971` keeps fleeing for up to four legs and rests at critical health
when food >= 18 and no threat is near. Live after that: walled shelter with the new
roof support verified at 17:33:59Z.

Death 5 (17:40:50Z): a skeleton 0.8 blocks away dropped the bot from 12.5 hp; it fled
at 8.5 hp (below the fight threshold) through its tunnel and, at 1.5 hp, resumed
return_surface because the archer was 7.7 blocks away, outside the five-block escape
rule. `beec699` melees archers within 3.5 blocks above 4 hp, and at <= 10 hp takes
cover from a visible archer within 16 blocks (seal narrow openings, else flee until
out of sight), sharing the creeper routine. Five deaths today; all regressions fail
before their fixes. Live archer handling pending.

## F028 — Gear route live; a skeleton crowd killed the bot [live + regression]

Run on `beec699` (17:42–18:41Z) rebuilt from nothing: iron pickaxe 17:51, chestplate
17:54, shield 18:08:52, iron sword 18:20:26 and iron leggings 18:28:19, which
`equip_armor` wore at once (legs slot). This is the first live evidence for F024's
gear route. A creeper escape at 18:07:56 fled in the open with no damage, and walled
night shelters were verified at 17:55:58 and 18:10:09.

Death 6 (18:40:46Z at -154,67,31): while unsticking from a pocket, the bot was hit by
at least six skeletons (possibly a spawner); the new archer melee rule fought them at
13.9 hp. `25934b3` makes three or more hostiles within twelve blocks trigger escape or
cover at any time and depth, and allows archer melee only when no other hostile is
near. Regression fails before the fix; live crowd behaviour pending.

## F029 — Sealing works live; the skeleton nest needed line-of-sight threat logic [live + regression]

18:41:49Z (`25934b3`): with recovered cobblestone the bot sealed three openings toward
a skeleton, the first live cover seal. At 1.3 hp it then kept escaping because the
crowd count and nearest hostile included skeletons behind its new walls; `c4b666f`
requires line of sight for both (melee damage still interrupts). Death 7 (18:43:13Z)
came at the same nest (-154,67,31) as death 6, and the next respawn walked back for its
drops. The bot was stopped at 18:43:27Z; `4ae003a` marks a death with two or more
hostiles within twelve blocks or an archer within sixteen as dangerous and skips its
recovery. The live memory's last death was marked dangerous by hand (operator action,
like `!resume`). The restarted bot skipped recovery and is rebuilding.

Shelter exit follow-up: at dawn (18:59Z, `4ae003a`) leave_shelter and the staircase
escape failed 25+ times; past the wall top the flat ground lay two blocks lower and the
rim rule required level ground. `e75cc79` accepts any supported non-hazard landing within
the 3-block safe drop; live it climbed out at 19:00:23Z and resumed work.

Mixed planks: live `e75cc79` failed the shield craft 100+ times (19:05–19:12Z) with
5 birch + 1 oak plank, because Mineflayer matches each recipe variant against one plank
type. `de766af` grows a single type; live it crafted birch planks and the shield at
19:12:32Z.

Gear milestone (live, `de766af`, run started 19:12Z after a rebuild from nothing at
18:43Z): shield 19:12:32, iron sword 19:13:26, leggings 19:20:36, helmet 19:27:30, boots
19:29:15. state.json then showed all four iron armor slots plus the shield worn and the
planner moved to gather_diamonds. This completes F024's iron stage live; diamond
pickaxe/sword and diamond armor remain pending.

## F030 — Fast replanning, live seals and burrow; a lone zombie killed an armored bot [live + regression]

19:39:35Z (`cd21c27`): a second creeper 2.9 blocks away exploded 1.3 s after notice (20
to 0.61 hp in full iron); every cancelled action waited 1.5 s before replanning.
`122f5a2` replans 100 ms after threat cancellations. Live on `122f5a2`: a tunnel seal
against a creeper at 19:47:58Z (first live creeper seal) and a damage-free open flight
at 19:48:22Z. A crowd of two spiders, a zombie and a skeleton at 19:50:55Z was escaped.

Death 8 (19:51:33Z): one zombie killed the bot in full iron armor with an iron sword.
It ate four times under point-blank hits, then at 9.9 hp the near-and-hurt rule chose
escape; in a cave the zombie hit it every second and the sword was never swung.
`03561b5` fights an attacker within 3.5 blocks before eating (healthy, armed) and, with
12+ worn armor points, duels a lone melee attacker to 4 hp. After respawning at night
the emergency burrow was verified live for the first time (19:51:42Z at the bed).

## F031 — First fights back, mid-range archers and the off-centre burrow [live + regression]

20:13:04Z (`03561b5`): a zombie hit for 3 and the bot chose fight at once (F030's
rule, first live use); the zombie left the threat list. A skeleton 8–11 blocks away
then shot it from 17 to 9.3 hp while it mined and crafted, since ranged damage never
interrupted work. At 9.3 hp it sealed four openings toward the skeleton (live cover),
then fled and died (death 9, 20:13:50Z). `c312ff8` lets damage from a visible archer
within 16 blocks interrupt and charges a lone archer within 12 blocks above 10 hp.

After respawn the burrow failed ('descent ended at -96,73,54'): an off-centre bot
rests on the neighbouring block's edge. `980d0f7` steps into the dug cell; a burrow
was then verified at 20:14:16Z. The regression models neighbour support and fails on
the pre-fix source. Nine deaths today.

Rebuild on `6f077df` after death 9: from the 20:14:16Z burrow to iron pick 20:26:31,
chestplate 20:31:30, shield 20:31:53, iron sword 20:35:51, leggings 20:39:56, helmet
20:41:38 and boots 20:43:48 (about 29 min, versus about 45 min for the previous
rebuild). A zombie attack at 20:37:09 was fought and won (hp 20 to 14.5, work resumed
in about 6 s), the first live melee win under F030/F031 rules.

Diamond priority live (F022, `6f077df`): at 20:55:38Z 'Diamond ore came into view' cut a
tunnel segment short; mine_diamond then cleared a deepslate diamond vein around
(-175,-54,-132) in nine targeted digs (20:55:40–20:57:08). The bot crafted its first
diamond pickaxe at 20:57:29Z and still held 10 diamonds, enough for the planned
diamond sword and chestplate (Cover Me with Diamonds).

Gear route complete live: diamond sword crafted 20:57:42Z; a diamond helmet (the most
protective affordable piece) at 20:57:49Z, with the server's minecraft:story/shiny_gear
(Cover Me with Diamonds) packet at 20:57:49.261Z, the thirteenth confirmed advancement.
equip_armor then wore the diamond helmet over the iron one. The planner moved on to the
water bucket for obsidian (G005). Throughput: from an empty inventory at the 20:14Z
burrow to Cover Me with Diamonds in about 44 min with no deaths.

## F032 — Death 10 lost the diamond gear to a creeper flight under zombie hits [live + regression]

21:00:23–39Z (`6f077df`): a creeper 2.9 blocks away started an escape; seal placements
were refused and the bot fled for 16 s while one, then two zombies hit it about once a
second. Escape is exempt from melee interruption, so the diamond sword was never used;
the creeper finished the bot at -176,25,-48. The death was marked dangerous, so the
diamond pickaxe, sword and helmet were not recovered — the costliest death today.
`19be10b`: creeper flight ends at eight blocks (beyond the seven-block fuse range);
melee damage interrupts an escape when no creeper is within seven blocks and 12+ armor
points are worn; armored duels cover up to two melee attackers. Both regressions fail
on the prior source. Ten deaths today.

## F033 — Remembered shaft for surface↔Y=-54 travel [user direction + regression]

User direction: after a death or surface trip the bot should reuse its route between
the surface (Y≈70) and Y=-54 instead of carving new stairs. Cause: returnSurface popped
mineRoute step by step, so the next descent always dug a fresh ~124-step staircase.
`e0691a3`: a descent from the surface that reaches its target stores the continuous
tail of mineRoute (steps at most 6 blocks apart, starting at the last surface-level
cell) as `memory.shaft`, per dimension, surviving deaths and reconnects. gather_diamonds
and gather_redstone above the target walk to an entrance within 128 blocks and follow
the shaft down with eight-cell pathfinder waypoints; return_surface follows it up. A
blocked shaft is forgotten; an unreachable one is skipped for five minutes. Five
regressions cover recording, gaps, both directions and failure handling. Live: the
first post-restart descent should log 'Remembered a … shaft'; reuse pending.
Possible later upgrades: a water elevator or ladder column for faster vertical travel.

User direction on F033: the same stairs need not be reused indefinitely; drained sites
should make relocation increasingly likely, using the same shaft travel method at the
new site. Recorded as long-term goal G012; not implemented yet.

F033 live follow-up: the first live shaft (recorded during an iron descent, 21:06–21:10Z)
was climbed at about 1.5 cells/s for 43 cells, then eight-cell legs stalled on a stair
jump (F004) and the stuck watchdog cancelled three times. `bdf9808` climbs cell by cell
through climbStep's jump fallback; then one step, which the bot had descended by a drop
while collecting ore, had no jump headroom and the shaft was forgotten. `9950015` carves
that headroom once (only where safeTunnelStep allows) before giving up. `ad3b38e` keeps
a deeper shaft over a shallower descent. Live reuse of a complete shaft remains pending;
the current shaft was forgotten and will be re-recorded on the next descent.

F033 live: on `5f78a8e` the bot climbed a remembered 25-cell shaft from (10,53,-102) to
the surface in about 12 s (21:28:46–21:28:58Z) with the per-cell climb, no stalls, then
resumed surface work. Descent along a remembered shaft is still unobserved live.

## F034 — Base chest phase 1 [user direction + regression]

`55923a4` adds src/base.js: a chest at the shaft entrance once an iron pickaxe is held on
the surface, deposits of surplus beyond carry levels when within 32 blocks, and restocks
after deaths (gear trips up to 256 blocks; small refills when passing). Carry and restock
levels are equal so restocking never triggers a deposit (tested). Seven regressions cover
plans, decisions and mocked chest I/O. Live placement, deposit and restock are pending;
the bot was rebuilding after death 11 when the revision started.

## F035 — Night surfacing deaths; shield while charging archers [live + regression]

Deaths 11–13 (21:17:10, 21:36:18, 21:36:46Z): weak, rebuilding bots met skeleton/zombie/
creeper groups near the surface at night. Deaths 12–13 began when the bot, with food 17,
climbed its shaft at night for wood, then respawned beside the same mobs. `abe265d` makes
a non-urgent surface trip at night shelter underground (or wait if sheltered); hunger
returns are unchanged. While charging an archer the shield now stays raised until the
strike (aims at story/deflect_arrow and fewer arrow hits). The first commit of that test
failed on the fixed code; `1a0861c` corrected the mock's movement timing and the test was
verified to fail only on the pre-fix source. Process lesson: a grep of test output does not
stop a shell chain, so check the pass count before committing. Thirteen deaths today.

## F036 — Cheap husbandry branches: A Seedy Place and Fishy Business [JAR criteria + regression]

From the 26.1.2 JAR: husbandry/plant_seed accepts placed wheat, beetroots, melon/pumpkin
stems, torchflower, pitcher crop or nether wart; husbandry/fishy_business triggers on
fishing_rod_hooked with cod, salmon, pufferfish or tropical fish. `8f5282d` plants (grass
for seeds, wooden hoe, till, plant) and `cdf6e01` fishes (rod from two string, four
bounded bot.fish() casts) when calm on the surface by day; each backs off ten minutes
after three failures. bot.fish() detects bites from particle packets, so the 26.1 packet
format is a live uncertainty. Three regressions; live evidence pending.

Husbandry live follow-up: the first live plant_seed (cdf6e01) failed in 50 ms because
collectTarget skips collision-free grass; `8d1cd43` breaks grass directly and walks onto
seed drops; the next attempt timed out reaching mountainside grass, so `b651c68` marks
unreachable grass and tries the next. `506cf48` adds breeding for The Parrots and the
Bats (husbandry/breed_an_animal; foods from the 26.1.2 item tags). Live completion of
A Seedy Place, Fishy Business and breeding is still pending.

A Seedy Place live: on `506cf48` plant_seed started at 22:09:38Z, crafted a wooden hoe at
22:09:41 and the server sent minecraft:husbandry/plant_seed at 22:09:46.475Z (about 8 s),
the fourteenth confirmed advancement and the first from the G014 husbandry branch.

## F037 — Throughput from the strategy review: loop latency and async smelting [logs + regression]

strategy.md (new) measured today's sinks: ~29 min waiting at furnaces (60 smelt_iron
actions, 1744 s, batches of three) and a fixed 1.5 s replan delay after every action
against a 3.6 s median action gap (~5% of run time). `b85f0da` replans 250 ms after a
success (failures keep 1.5 s, threats 100 ms). `bc7b277` smelts fire-and-forget: all raw
iron (≤64) plus fuel go in, a job is recorded, the planner keeps mining iron and collects
when the expected time passes or the bot strays beyond 48 blocks. Regressions fail on the
pre-fix source. Live: the restart at about 22:30Z loads both; time savings still to be
measured against today's baseline.

Night underground follow-up: the F035 night shelter tripped shaft detection (escape,
re-shelter, repeat); `6436679` ignores shaft traps inside a verified shelter. Waiting a
whole night underground then idled the bot, so `8afbc05` mines iron instead (pickaxe,
health > 12, under 40 iron banked) and, per user direction, `242cb07` mines for diamonds
once 40 iron is banked (iron pickaxe required); it shelters or waits only when hurt.
`7acd838` places the base where the bot works when no shaft entrance is within 48 blocks,
and lets a shaft over 128 blocks away be replaced by a local one.

Shaft and work-pick follow-up: live 242cb07 forgot its shaft where the earlier shelter
loop had walled the route; `5b942df` retries a failed eight-cell leg cell by cell and
clears a blocked adjacent step in any direction once before forgetting. Logs showed 38
stone pickaxes and 8 stick-driven surface trips today, and a carried wooden pick dug
tunnels before the iron one; `0069f45` requires a stone work pick only below 6 iron
(ingots plus raw) and orders iron before wood for digging.

Pre-Nether review (`2b16f72`): the route ended by waiting beside the arrival portal with
no Nether skills or gold armor, risking gear in the Nether, and the planner then idled.
The bot now steps out of the arrival portal and back in once enter_the_nether is
confirmed, and after the route mines diamonds toward a full diamond set before waiting.
Async smelting live: at 22:45:03Z (`0069f45`) a job of 3 raw iron started and the bot kept
working; collection not yet observed.

Async smelting confirmed live (`2b16f72`): jobs of 3 and 5 raw iron started at 22:45:03
and 22:45:57Z and were collected at 22:45:38 and 22:47:03Z with mining in between, instead
of standing at the furnace. `8fe959e` adds Hired Help (adventure/summon_iron_golem): with
full iron armor, 36 ingots (+2 for shears) across inventory and base, a pumpkin within 32
blocks and calm daylight, the bot carves the pumpkin in place, crafts four iron blocks and
builds the golem T with the lower corners clear, head last. Three regressions; live pending.

Base live (`8fe959e`): the chest was crafted and placed at (-245,68,-185) at 22:49:55Z
where the bot was working, and the first deposit stored 1 wooden_sword (a better sword is
carried), 13 lapis_lazuli, 8 raw_copper and 2 spare furnaces. Restock after a death is
still unobserved. Note for the Enchanter: lapis is stored but not in the restock list.

## F038 — Base hardened into a sealed underground vault [user direction + regression]

User report: the phase-1 base chest at (-245,68,-185) stood exposed on the surface at
night without lighting; a creeper exploding beside the bot (surface or underground) could
destroy it. Threat model: creepers detonate only near a player, so risk peaks during
visits; mobs spawning in the dark turn visits into fights; lava nearby endangers the bot;
endermen cannot take chests and chests do not burn. `90e95b4` builds the base as a vault
cut into solid dry rock beside an underground tunnel: chest two cells from the tunnel,
natural rock on every face but a one-cell niche, the niche refilled with two cobblestone
after every visit, and a torch at the tunnel spot. An existing surface chest is emptied by
day, picked up, and its items go to the next vault. Vault visits are allowed at night
underground. Five regressions cover site rules, decisions, the open/reseal sequence and
migration; live vault construction is pending.

## F039 — Vault container and forgotten furnace iron [user reports + regression]

User reports: (1) the vault chest had a dirt block above it and could not open; deposit
hung until the stuck watchdog reset the bot about every 25 s. A chest needs a non-solid
block on top, which the vault roof forbids. `38eb7a1` uses a barrel (opens fully enclosed;
six planks and two slabs), migrates chest vaults by digging the block above first, and puts
the doorway torch on a wall at head height. Live: the chest vault was emptied and removed
at 23:12:00Z; the barrel vault awaits nine planks. (2) About 30 raw iron sat in a furnace
at (-283,68,-150) the bot did not remember: at 22:43:02Z the input went in, then putFuel
failed ('destination full', planks left by a charcoal attempt) before the job was saved.
`22570d1` saves the job right after the input, uses existing fuel and tolerates fuel
errors; reclaiming furnaces/tables digs them directly (the pathfinder refuses to break
furnaces). The lost job was restored in memory by hand (operator action, overwriting a
newer 2-iron job — memory holds one job); the bot collected 8 ingots at 23:12:17Z and the
fuel had run out, so `3fa8dc0` refuels and reschedules a stalled job. Follow-up: support
several smelt jobs at once.

Later fix: `a18c0ff` stops a valley floor under tree leaves from counting as underground
(the bot tried to carve stairs in open air for a food trip). Session evidence summary for
the 51718 runs: Diamonds!, Cover Me with Diamonds and A Seedy Place were earned live; the
gear route, diamond priority, shaft climb, async smelting, base deposit, creeper flight,
tunnel and archer seals, burrow and melee interrupts were each observed working at least
once; fifteen deaths informed F023–F035.

## F040 — Fresh-world bootstrap and clean early disconnect (port 53606)

The new LAN world uses `lan-53606-20261105` for memory. The launch at 18:26:34
Eastern (`a6a138c`) started empty-handed and earned the story root, A Seedy Place,
Stone Age and Getting an Upgrade without staged supplies or commands. The 18:29:45
restart (`646ae27`) recovered all four from server packets and continued the same
descent. A sandbox-denied connection exposed a second error during teardown:
Mineflayer had not installed `clearControlStates` yet. The regression reproduces
the lifecycle failure and a repeat of the sandbox-denied launch exits cleanly.

## F041 — Fuel-starved iron jobs and obstructed shelter roofs

`646ae27` records when a furnace with raw iron has no active or queued fuel.
When ingots are needed, the planner gathers coal before returning, including for
the first ingot and when the furnace is out of local reach. It still collects
partial output, caps the on-site smelt wait at five seconds and checks for
cancellation before transfers. Existing single-job records remain readable.
In the 18:29:45 run the bot made charcoal, started two iron at 18:31:58,
mined four more raw iron while it ran, and collected both ingots at 18:32:22
Eastern. The server confirmed Acquire Hardware. The empty-fuel recovery path
still needs a live trial.

The prior world's final run failed twelve times at the same open roof cell.
`14546ef` reproduces its error with a non-solid block in the fixed east support
cell. The bot now checks up to four wall-top supports and still verifies the
enclosure. The old log lacks the support block's identity, so the obstruction
repro establishes one possible cause for the old failure.

## F042 — A loaded furnace disappeared during mining

At 18:32:36 Eastern, `646ae27` loaded four raw iron at (16,50,21). During the
following `gather_iron` action, the bot picked up a furnace and five raw iron.
After reconnecting, `14546ef` found the remembered station gone. The recovered
items point to the bot breaking it. Both generic pathfinder digging and direct
tunneling accepted furnaces, so the exact dig path is uncertain. Both now protect
furnaces, barrels and chests. Explicit station reclaim and vault migration still
use their own dig paths. The first return climb stalled at (1,63,25) even after a
shaft repair and reverted to carving a new staircase.

## F043 — Iron pickaxe priority and productive nights

User direction: reserve the first three iron ingots for an iron pickaxe, use
that pick for mining, and favor protected underground work at night. The planner
now puts that upgrade ahead of optional activities, smelts only the missing
ingots before the first pick, and equips it after crafting. A spare flammable
plank can fuel a small initial batch while the bot keeps any planks it needs for
sticks. Tunnels and probes prefer netherite, diamond, then iron over stone or wood.

At 18:36:04 Eastern, `4e2e664` verified a surface shelter at (12,79,25). It
waited there with two ingots, five raw iron and two planks. It had come back to
the surface for fuel after the shaft repair failed. `38ece5e` tried a short
descent through the shelter, but the terrain failed the existing dry, enclosed
column check. Generic recovery mistook the intact shelter for a trapped shaft
and repeatedly climbed out. Stopped that run at 18:43:01 without a logged death.
`2e11db8` preserves an intact enclosure on refusal and skips repeat attempts
there. It also uses a nearby remembered mine before sheltering when the bot is
healthy and sees no nearby hostiles. Both routes keep the normal threat checks.

Live on `2e11db8`, the bot used one carried plank to start the missing ingot
at 18:45:11. A skeleton interrupted the action, but the furnace operation
completed while cancellation was in flight. The bot killed the skeleton,
returned and collected the third ingot at 18:45:35. Its next action crafted the
iron pickaxe. The server confirmed Isn't It Iron Pick at 18:45:36, the bot
equipped it at 18:45:41, and the 18:46:22 mining trace showed it held after a
completed tunnel segment. No commands or supplies were staged. The run stayed
connected on port 53606 at handoff. The next night trial should demonstrate a
successful descent. Audit cancellation between furnace placement and loading.

## F044 — Stone axe for wood and workstation recovery

User direction: craft a stone axe after the stone pickaxe and keep an axe handy
for logs, planks, crafting tables and storage containers. `d3f5068` schedules
the axe ahead of routine mining and optional advancements. It keeps the
immediate three-ingot iron pick craft and survival interrupts ahead of the axe.
Stone, iron, diamond and netherite axes satisfy the woodcutting reserve.
Ordinary gathering and explicit workstation or container removal use the dig
time selector. Tunnels and shaft repairs now select an axe for axe-mined blocks.
Restocking can retrieve a stored axe.

In the 18:51:28 Eastern run, the bot crafted the stone axe at 18:51:32 and
immediately used it to reclaim its crafting table. Debug logs at 18:51:42–49
show it breaking oak logs with the axe. The bot stayed connected. The earlier 18:45:08 run
also built the sealed barrel vault at (9,76,23) and deposited items at 18:47:23.

## F045 — Restore mining tools locally and collect the ready furnace

The 18:51:28 run lost its iron pick during tunneling at 18:54:15 Eastern, then
lost its stone pick on an ore collection at about 18:55:30. The timing and
inventory changes are consistent with wear. The bot had hundreds of cobblestone,
a table, and three sticks. It nevertheless planned a wooden pick and repeated
unreachable base restock. Its remembered furnace at (26,59,49) had a ready
three-ingot batch that the user observed in the world.

The planner now crafts a stone pick directly from carried supplies and puts local
pick recovery ahead of an underground restock. It then collects ready smelts or
continues obtaining iron. Three carried ingots still permit an immediate iron
pick. Tunnel and side-probe work stop when their pick tier is lost so the planner
can act at the next cycle. Danger, hunger, and drop recovery retain priority.

Live `ecf3f21` at 19:03 Eastern reproduced recovery from the same inventory and
saved furnace, with no staged items. The bot crafted a stone pick at 19:03:04,
collected the three ingots from (26,59,49) at 19:03:08, crafted and equipped
the iron pick by 19:03:11, and resumed mining with the stone pick still carried.

## F046 — Mining supplies and return stairs

At 19:21:27 Eastern, the 19:03 run started a food return from Y=7 with hunger
16 and no food. The lava-search action had tunneled without the mining supply
checks. The bot walked the existing route to Y=43. An eight-second waypoint
timeout at 19:22:14 discarded that route, and the older shaft was unreachable.
After a creeper retreat and more climbing, both picks had worn out. Hunger
still selected a food return over the available stone recipe, and the upward
tunnel branch permitted hand digging. Stopped the run at 19:29:03.

`cf4f19b` checks for 32 planks' worth of wood and 16 hunger points of carried
food before mining from the surface, including a lava search. A ready pick
recipe takes priority when the underground bot lacks a stone-tier tool. Stone
digging requires a compatible pickaxe, including at the final dig call. Returns
try the current route before the older shaft and use the checked jump for an
adjacent rising step. Active descents save their stairs before the target depth.

The 19:34:50 live retry encountered a skeleton before local crafting. The
server confirmed Not Today, Thank You at 19:34:56. At 4.9 HP with a chestplate,
the planner repeatedly chose a fight that the combat skill refused below 8 HP.
The watcher reported the loop and death. After respawn the bot restocked a
wooden pick and table from the vault and crafted a new stone pick at 19:36:23.
The planner and executor now share the low-health limit. The supply check
also covers shallow underground staging during daylight, including at the base.

## F047 — A zombie group grew during a fight

At 19:41:22 Eastern the 19:37:55 run took its first hit at (20,51,33).
Mining cancelled immediately and a fight started 220 ms later. The bot wore
zero armor after the previous death and fought with a wooden sword. By 19:41:25
two zombies were within 1.4 blocks and the bot remained at the same position.
The fight stopped below 8 HP, but the ordinary failure backoff left another
1.6 s before escape. It started escaping at 1.7 HP and died about 0.6 s later.
The nearby creeper was logged roughly nine blocks away. The log shows nearby
mobs and damage, with no per-hit attacker attribution or evidence that a
viable escape route existed earlier.

The planner and active fight now use the same visible-threat check within
five blocks. Two nearby threats trigger withdrawal with under 12 armor points,
and three trigger it with heavier armor. The fight checks again each cycle,
and a combat withdrawal replans on the threat schedule without routine
mobility recovery. A replay regression verifies an arriving second zombie
ends the attack sequence. Surviving the original cave encounter remains open.
At handoff `9b7be67` was running on port 53606 in `outputs/2026-11-05@19.45.00`.
It left the respawn shelter at 19:45:06 and began heading to the base. No
replacement combat encounter was staged.

## F048 — Food search stalled at a shoreline corner [live replay + regression]

In `outputs/2026-11-05@22.00.12/` on port 54390, the bot had full health and
hunger and three food points carried against the sixteen-point mining reserve.
After several prey timeouts it repeatedly started at (32,63,-187). The
12-second movement watchdog cancelled food gathering, and the generic retry
scouted again without invoking mobility recovery.

A targeted replay found dry footing beside water. Pathfinder repeatedly
selected a diagonal corner step, held forward, and reset as stuck after
3.5 seconds without leaving the cell. Cardinal steps cleared the corner, but
the first distant replay route then went into the river. The patched recovery
avoids water when starting dry and retains the existing checked staircase if
scouting fails. Repeated food watchdog cancellations now reach that recovery.
Prey pursuit also backs off after eight seconds without movement. Scouts verify
arrival before recording a visit because the pinned pathfinder can resolve an
empty unsuccessful path.

With a staged teleport to the original position, recovery reached
(19.5,56,-189.5) dry at 20 HP. A second fixture placed brown cap blocks in empty
cells near spawn. The bot harvested brown mushrooms from those caps. The first
trial exposed that the bowl recipe needs the crafting table. A command-free
retry used the harvested mushrooms, crafted four bowls, reclaimed the table
and made one stew in the inventory grid, worth six carried food points. See
`outputs/food-replay-setup.json` and `outputs/food-replay-craft.json` for the
separate staged setup and recipe retry.

## F049 — Maintain a digging shovel after the stone axe

After the pickaxe and axe, the planner crafts a stone shovel from one
cobblestone and two sticks. It schedules a replacement if the bot loses the
shovel or wears it out. Iron, diamond and netherite shovels satisfy the reserve.
Tunnels, shaft repairs, disposal pits and manual escape or shelter digs now
select the shovel for shovel-mined terrain. Existing falling-block and liquid
checks still govern where the bot can dig. Nearby base restocks can recover a
spare shovel.

On port 54390, the `22.26.16` run made the shovel on its first action at
22:26:20 Eastern, using its carried materials, and resumed iron gathering.
The mixed-tunnel regression verifies shovel selection for dirt and grass
blocks and pickaxe selection for stone.

## F050 — Inventory cleanup must free space autonomously

The `22.26.16` run paused with 32 of 36 slots occupied because cleanup only
recognized surplus rubble. The inventory held exactly one stack of cobblestone,
plus azalea, leaf litter, moss, a birch sapling, both raw mushrooms and a bowl.
Cleanup now discards those incidental stacks while preserving prepared stew.
After clearing the saved automatic pause, the `22.35.41` LAN run threw away all
seven stacks, retained three stews, and resumed iron gathering.

With a genuinely full pack, cleanup chooses one low-priority stack even if
everything falls outside ordinary surplus. It uses the existing pit, toss lane,
or retreat first. With no such route, it tries nearby owned storage and then
drops one stack in place as a last resort. This last drop can be picked up again
if the bot remains in the same cell, so cleanup gives other actions a brief
window to use the new slot. Survival actions retain priority.

## F051 — Cave checkpoints and chest loot

At 22:42 Eastern the bot alternated between (63,5,-19) and (59,2,-17).
The old survey could choose an unvisited endpoint beyond its six-step walk,
then reverse direction before reaching that endpoint. It also required four
junctions, which excludes narrow mineshafts. The depth-first search now picks a
fresh checkpoint within the walking limit and can use visited cells to reach a
different branch. Rails and natural cave air can qualify a narrow passage.
Checkpoints and chest locations persist with world memory. Diamond sightings
and loot interrupt the survey after a step, with existing ore and threat checks.

In the staged LAN cave run, the bot walked eight steps from (63,5,-19) to
(57,2,-17) and saved nine checkpoints. A separate staged ordinary chest and
chest minecart yielded five bread and both containers were recorded as emptied.
The bot was returned to its original position. No native mineshaft was
identified at the replay site. See `outputs/cave-loot-setup.json` and
`outputs/cave-loot-containers.json` for setup and teardown.

## F052 — Five blocks per side probe

The reach check used block centers and stopped at four blocks from a centered
stance. The bot now aims at the exposed face and crouches closer within the
same tunnel cell if needed for block five. Ore, liquid, falling-block and tool
checks still apply.

The staged LAN trial teleported to a clear site in the existing tunnel at
(7,-46,-79). The bot used its carried pickaxe and broke five deepslate blocks
on each side. The server showed all ten cells as air, and the bot stayed in
the original tunnel cell before returning to its prior position. See
`outputs/five-probes-setup.json`.

## F053 — Two water buckets and working obsidian casting

The water planner previously stopped at one bucket. Obsidian gathering then
rejected most nearby sites and used a block interaction that failed to pour
lava on the accepted site. The water goal now counts two full buckets. Casting
looks for a supported bank, uses the held bucket to pour lava into a pit and
water above it, then scoops the water back up before mining.

At the staged LAN bank the bot filled its second bucket, cast one block from
its carried lava and recovered the water. The first mining attempt exposed an
incorrect material tag in the pinned registry. A diamond pick was assigned
75 seconds to break obsidian. Correcting the tool-speed tag reduced this to
9.4 seconds. The retry picked up the obsidian and received Ice Bucket Challenge
from the server while retaining two full water buckets.

A separate temporary platform verified the renewable three-cell trench. The
bot scooped from the middle twice and confirmed that the source regenerated
and both buckets were full. The fixtures and repositioning are recorded in
`outputs/obsidian-cast-setup.json`, `outputs/obsidian-mining-setup.json`, and
`outputs/obsidian-setup.json`. A continuous run casting all ten portal blocks
remains open.

## F054 — Mine safe diamond discoveries before continuing the tunnel

The prior run recorded diamond approaches interrupted by mobs and a pickup
that failed on an exact-cell goal. The tunnel also scanned only after walking
to the next cell. It now records adjacent diamond ore immediately when a dig
exposes it and yields before advancing if pursuit is safe. The collector can
aim at a visible part of a face and reach the drop from an adjacent cell.
Threat cancellations leave the ore eligible when the threat clears.

The staged LAN replay placed one ore block behind solid deepslate at
(12,-53,-64). Mining at Y=-54 opened its face and yielded while the bot was
still in its original cell. The bot collected the fourth diamond, retained
obsidian as its goal despite the newly affordable diamond boots, and queued
inventory cleanup first. See `outputs/diamond-interrupt-setup.json`.

## F055 — Obsidian verification repeats at a natural site [live failure; resolved by F056]

After the F054 restart, the bot repeatedly attempted `gather_obsidian` near
(-18,27,-8), timed out after four seconds verifying a world change, and
scouted without escaping the retry cycle. The log does not identify the
failed interaction. This is separate from the successful staged cast in
F053. Reproduce at the recorded site and identify the failed interaction
before changing the casting geometry or recovery policy.

## F056 — F055 root cause: a water bucket was used to scoop lava [log + regression]

Resolves F055. The `23.51.05` state snapshot showed two water buckets, no empty
bucket and no lava bucket. The action summary hid all bucket items. With no
lava carried, `gather_obsidian` called `fillLavaBucket`, which equipped
`bestItem(['bucket'])`. That helper also accepts a `_bucket` suffix, so it
returned `water_bucket`. The bare `until(hasItem('lava_bucket'))` then timed
out at four seconds on every retry. `de0892c` requires an exact empty bucket.
When the bot carries neither lava nor an empty bucket, the planner crafts a
third bucket before casting. A steady cast cycle then has 2 water + 1 lava,
or 2 water + 1 empty. `6d13ef7` quarantines a lava source for 120 s after a
non-cancelled failure. `4cbca1b` adds buckets, axes, diamonds and obsidian to
the action summary. Both regressions failed on the pre-fix source. A
continuous ten-block cast is still not live-verified.

## F057 — Fresh world on port 55502: early route and three planner stalls [live]

World ID `lan-55502-20261106`, started empty-handed at 05:16:10Z on `317fc9b`.
No commands or staged items were used. Server-confirmed timeline (UTC): root
05:16:27, A Seedy Place 05:16:48, Stone Age 05:17:19, Getting an Upgrade
05:17:23, Adventure 05:22:18, Acquire Hardware 05:26:52, Isn't It Iron Pick
05:26:55, Monster Hunter 05:29:13, Husbandry 05:29:20, Suit Up 05:44:22.
That is ten advancements in 28 minutes with no deaths through 05:44. The run
restarted onto newer code at 05:22, 05:35 and 05:41.

1. Stone before wood (`731bac3`). The bot dug down for three cobblestone, then
   spent them climbing back to trees, three times in about two minutes. When
   a recipe lacks both, the planner now gathers wood first.
2. Stale return waypoint (`22c3050`). After walking off its route (restock,
   pickup), `return_surface` targeted the deepest remembered cell first. That
   cell was 17 blocks away, so each attempt burned an 8 s timeout. The route
   now resumes at the nearest cell within 6 blocks, or is dropped.
3. Hill-enclosed "surface" (`dda1c30`, `ae4fb62`). The return staircase ended
   at home Y=69 under stone, while the local hill surface was at Y=74. The bot
   then failed every tree approach and land scout without moving for over
   three minutes. Failure escalation called `unstick` only for "No path"
   errors or food watchdog stalls. Three failures within 1.5 blocks now also
   trigger it. Live on `dda1c30` at 05:42:17, the third failure triggered
   unstick. Scouting timed out, the upward dig reached Y=74, and the bot cut
   wood. It crafted and equipped an iron pick by 05:42:59 and earned Suit Up
   at 05:44:22. `ae4fb62` keeps `return_surface` climbing while a solid
   non-leaf block covers the bot. It is not yet live-tested.

Later on `ca042f8` (`outputs/2026-11-06@00.54.52`): in-place recovery fired
again at 05:55:29 on a liquid-blocked tunnel and the bot moved on. Diamonds!
was server-confirmed at 06:00:56, about 45 minutes after the empty-handed
start, and the bot carried six diamonds. The F056 lava quarantine was
observed live: (-27,-16,27) was remembered after "No path to the goal!", and
the bot tunneled toward Y=-54 to look for another source. The widened action
summary showed `diamond=6 bucket=1`.

Also seen: savanna acacia trees cost one 10 s approach timeout per log.
`c65d476` and `f12d1d9` now block a 12-log vein after one failure, which
should cover diagonal acacia trunks. The iron pick
wore out at 05:36 while carving a staircase. The bot rebuilt it from six
carried ingots once it had wood.

## F058 — Side-goal materials were deposited at the base [code + regression]

The base `CARRY` table stored all string, feathers and leather (limit 0).
Fishing and Take Aim check carried items only, so a deposit permanently
starved them. `18ae882` carries 5 string (rod 2 + bow 3), 4 feathers,
1 leather, 16 arrows and 8 lapis, and restocks them from the base. Live: the
restarted bot restocked 4 feathers at 05:35:56.

## F059 — Take Aim, portal standing row and Enchanter [regressions only]

`5ce4c25` adds Take Aim (`adventure/shoot_arrow`). In calm daylight with 3
string, flint and a feather (or a bow and arrows), it crafts a bow and
arrows. It shoots a passive animal 5–14 blocks away, aiming at the centre
plus 0.025·t² blocks of drop (t = distance/3 ticks) and leading by velocity.
It draws for 22 ticks and refuses a shot if a player is within 2 blocks of the
line of fire. It stops after three arrows or the server packet. Not live-tested.

`c86bda1`: portal placement used `GoalNear(target, 2)`. That goal can be
satisfied with the bot standing in a frame cell, and every retry then fails
in place. Placements now stand on the cleared row at z+1 beside the frame.

`45c6ce0` and `75fe33f` add Enchanter (`story/enchant_item`) after the Nether
return. User direction (2026-11-06): serious enchanting waits for a
stronghold library's bookshelves, and the bot must not farm sugar cane. The
branch starts only when a book, paper or three cane are already carried
(e.g. chest loot). It then gets leather from cows (deferred 15 min after
eight fruitless scouts), four cast obsidian, two diamonds, lapis and level 1.
It takes the best offer affordable with the levels and lapis on hand, then
reclaims the table. The pinned Mineflayer emits `ready` on all-zero offer
levels, so the skill polls for a positive level. The 26.1 protocol data still
names `enchant_item` and `craft_progress_bar` as the library expects. Not
live-tested.

## F060 — Session efficiency notes

- Every F055/F057 diagnosis came from `bot.log` plus `state.json`. Logging
  buckets and tools in the action line removes the need for the snapshot.
- Restarting a fresh-world bot costs seconds: advancements come back from
  server packets, and world memory persists under the world ID.
- Process slip: `ae8f4d2` was pushed with three failing night-policy tests.
  The shell chain gated the commit on `npm run check`, not on the `npm test`
  exit code. `6775643` fixed it within minutes, and the live bot never ran the
  broken revision. Gate commits on the captured test exit status.

## F061 — A geared bot idled a night in a surface shelter [live + regression]

At 05:45:04Z the `00.41.40` bot (`dda1c30`) had an iron pick, chestplate,
shield, 20 HP, 9 logs and no remembered shaft. Night arrived on a hillside.
The shelter needed four placements, and its mining burrow was refused with
"no hand-diggable enclosed column below". That left about seven minutes of
`wait`. `8968369` names the failing column, wall or floor cell in that error.
`6775643` lets a bot that would otherwise shelter (not combat-ready, no weapon
to craft, no retreat earlier that night) start its mining action instead. It
must have an iron pick, an equipped shield, at least 6 armor points,
HP >= 16, hunger >= 17, the mining wood and food reserves and no hostile
within 16 blocks. Carving from the surface at night leaves an open staircase
behind the bot; followers are left to the existing threat-facing seal and
fight logic. Not yet live-tested.

## F062 — First death on the 55502 world, and the bare-respawn loops [live + regressions]

At 06:11:18Z on `ca042f8`, mining at Y≈-46 with six diamonds, the bot saw
a creeper at 5.4 blocks. It could not seal five facing openings, fled, and
took the blast at 06:11:30 while fleeing, dropping from 15.6 to 4.4 HP. The
rest rule (HP <= 6, fed, no hostile within 12) ended at 7.7 HP, and the bot
resumed `fill_lava_bucket` in the same cave. A zombie hit it at 8.7 HP. The
low-health escape kept the zombie within 1.3–1.6 blocks for three more hits,
and the bot died at 06:12:06Z, about 56 minutes into the world. The deep
drops (six diamonds, iron kit, shield) were not recoverable.
`5c973a8`: a creeper within four blocks after a failed seal, or during the
flight, is now faced with the off-hand shield raised. The brace lasts until
the creeper explodes or despawns, moves beyond 7 blocks, or 3 s pass. After
HP <= 6 the bot now rests until 14 HP when fed and no hostile is within 12.
Both are regression-tested and not yet live-tested. Still open: an escape
that cannot gain distance on a zombie should turn and fight behind the shield.

After the respawn, the empty-handed bot stood under its night shelter at
Y=65 (home 69) and counted as underground. `return_surface` needed a
pickaxe, and the F057 in-place escalation then used the six-block-drop
`unstick`, which dropped it into a cave at Y=46. `458ac05` lets a bot without
a pickaxe pathfind up to the surface level, and excludes `return_surface`
from in-place escalation. Live on `458ac05`, the pickaxe-free climb went
from Y=51 to Y=68 in 9 s. The bot then shuttled between the surface and its
sealed underground vault: opening the cobblestone seal needs a pickaxe, and
the F046 guard correctly refuses stone by hand. `3f6325c`/`9a2ef22` allow a
restock from a sealed vault only with a pickaxe in hand. A hand-dig attempt,
`cd366a3`, was undone; its `git revert` silently failed, which `9a2ef22`
corrects. Live on `9a2ef22`, the bot gathered wood, crafted a table and a
wooden pick at 06:20:46, then a stone pick and furnace. It rebuilt locally
because the vault held only a wooden pick, a table and feathers.

At 06:33:18Z, on `9a2ef22` at Y≈1, the bot placed its smelting furnace in a
staircase cell. The tunnel then read as a vertical shaft, and three
`escape_shaft` retries picked the direction through the furnace and refused
to dig it. In-place escalation's `unstick` freed it, and it had an iron pick
again by 06:34:37. `2ddee6a` ranks stair directions that pass a station or
container as unusable. It is regression-tested and loads at the next restart.

## F063 — Iron picks spent on a lava search while carrying diamonds [live]

From 06:26 to 06:53Z on `9a2ef22`, the rebuilt bot crafted four iron picks
(06:26, 06:34, 06:41, 06:53). Wear came from tunneling while it searched for
a reachable Hot Stuff lava source. Several sources were quarantined after
"No path" or 12 s approach timeouts. It carried six diamonds, but the route
put the diamond pick after the lava bucket and the full iron kit, so about
half of each cycle went to iron for replacement picks. `dac689a` crafts the
diamond pick (1561 uses vs 250) as soon as three diamonds are carried; live,
the restarted bot crafted it at 06:54:18. The lava search failed because pools visible through rock had no walking
path; each source cell failed "No path" in turn. `188b1fe` tunnels up to
four segments toward a pool within 24 blocks before quarantining it. The
first live attempt failed every segment with "Digging aborted" (the F004
deferred-stop trap). `b228b62` clears the failed goal and waits two ticks
before tunneling. Live on `b228b62`, the bot tunneled once toward
(140,-55,-213), and the server confirmed Hot Stuff at 07:02:53Z: 14
advancements on this world. The scoop's 4 s inventory check had timed out
just before the packet, so it is too tight under load; it caused only a
spurious 120 s quarantine.

## F064 — Tunnels stalled where liquid touched every sloped step [live + regression]

On `b228b62` (`02.02.15`), `gather_iron` and `return_surface` failed
"no supported dry tunnel step" three times between 07:12 and 07:28Z. Each
stall cleared only after the generic relocation scout, costing 5–20 s.
`mineTunnel` tried four sloped steps and nothing else. `2420de5` tries
level side steps when every sloped step touches liquid or falling blocks;
already-mined cells stay excluded, so it cannot oscillate back. Restarted
onto `2420de5` at 07:29Z (`outputs/2026-11-06@02.29.19`). At 07:39 a level
tunnel at Y=31 still stalled, because the fallback covered only sloped
tunnels; in-place escalation recovered it in about 8 s. `6bd5f03` lets a level
tunnel take one step up, then one down, around the hazard. It is
regression-tested and not yet loaded into the running bot.

## F065 — Cave springs, a drowning, and the water-bucket step [live + regressions]

After Cover Me with Diamonds (07:42:46Z, 15 advancements: a diamond sword
and boots), `fill_water_bucket` rejected ten cave springs in a row with
"water source has no dry bank". `fbc8df9` approaches a bankless source
within 3 blocks and scoops if it is within 4.5 blocks. `5be400a` first
rejects springs hidden behind rock. Scoops from banks also timed out at
4 s, so `8eacbf9` records the held item and the block the eye ray reaches.

Death #2 at 07:56:19Z: the bot was restarted at 07:56:08 while working at
water level beside a spring at (124,47,-152). It reconnected out of air,
filled its second bucket, and then lost 2 HP every 1.0 s with no threat
nearby, at a fixed position, while choosing `gather_obsidian` and
`return_surface`. That rate is drowning; suffocation would be 1 HP per
0.5 s. Nothing in the planner read `bot.oxygenLevel`. `dc4b3cd` puts
`surface_for_air` ahead of every other decision when the head is in water
and oxygen is at or below 12/20. It paths to the nearest breathable cell
within 6 blocks, holding jump, or swims straight up for 1.5 s.
Regression-tested; live from 07:59Z (`outputs/2026-11-06@02.59.01`). The
drops lie underwater at (123,50,-151).
Restarting a bot that stands in water is itself a risk; check the position first.

## F066 — Tunnel back to an unreachable smelt furnace [live + regression]

After death #2, the respawned bot (`dc4b3cd`, `02.59.01`) failed nine
`smelt_iron` furnace returns between 07:59 and 08:01Z with a 30 s timeout
or "No path". The remembered job held 32 raw iron at (172,43,-176), about
20 blocks below it. `7b403bc` tunnels toward the furnace on such failures
and drops the job after twelve segments. Live on `7b403bc`, two segments
(Y 60 → 53) reached it, and at 08:02:11 the bot reported "input waiting for
fuel". The F041 fuel path is next.
At 08:05Z three coal-ore pickups during `gather_iron` were judged "no
verified progress" and escalated into unstick scouting. Only `rawIron`
counted for that action. `3fb7ee8` credits coal, raw iron, diamonds or
redstone for both iron and coal trips (regression; not yet loaded).

## F067 — Survival blocks refused against the bot's own furnace [live + regression]

At 08:34:26Z (`65fdc2e`), the bot placed a smelting furnace at (233,-54,-155).
The next tunnel step needed a floor block above it, and the server refused
it three times ("the block is still air"). The only listed support was the
furnace, and clicking a furnace opens it. `0d7f28e` prefers plain supports
in `placeSurvivalBlock` and sneaks when an interactive block is the only
support. Regression-tested; running from 08:36Z (`03.36.15`). Related
station hazards: F042 (furnaces broken while mining) and the shaft-escape
stair through a furnace (`2ddee6a`).

## F068 — Death #3: an armored escape pinned in a tunnel [live + regression]

At 08:41Z on `0d7f28e` (`03.36.15`), the bot wore iron armor (each zombie
hit cost about 1.4 HP) and carried an iron sword. It was climbing a return
staircase at Y≈-15 when two zombies and a skeleton engaged it. The fight
ended with "outnumbered in combat; replanning escape". At 6.6 HP the escape
could not seal two openings, and the bot stayed at (242,-19,-127) for
2.6 s while two zombies hit it every 0.5 s. It died at 08:41:42.
`state.json` lists carried items only, not worn armor; read worn slots or
hit damage before concluding a bot was unarmored. The F032 armored-flee
cancel required HP > 6 after the hit, which missed the 6.6→5.2 hit.
`77426ca`: an escape that has not left its starting cell for 1 s with a
melee mob within 2.5 blocks latches a 6 s cornered state. The damage
handler cancels the escape, the planner chooses `fight`, and the fight
skips its outnumbered and low-health refusals; never with a creeper within
6 blocks. Regression-tested; live from 08:45Z (`03.45.28`). The drops were
left because threats remained at the death site.

## F069 — Death #4: burning in lava with no reflex [live + regression]

Five minutes after death #3, on `77426ca` (`03.45.28`), the bot tunneled
toward its furnace at (233,-54,-155) (segment 5/12). At 08:46:31Z it took
4 HP every 0.5 s at a fixed position, (245,-52,-156), with no threat
nearby, and died at 08:46:34. That is the lava damage rate; the pinned
pathfinder avoids lava, so the lava most likely flowed in after a dig
(unconfirmed). Nothing reacted: the current action continued until the
critical-health cancel, and the next action was `wait`. `738c3be` adds an
`inLava` check (entity flag, or lava/fire at the feet or head). It cancels
the current task and pre-empts every decision with `escape_lava`: pour a
carried water bucket at the feet, then step to the nearest dry,
solid-floored cell within 4 blocks. Critical-health cancellation now spares
`escape_lava` and `surface_for_air`. `8dc2db6` marks a lava death site as
dangerous, so the drops, which lava burns, are not sought. Regression-tested;
live from 08:50Z (`03.50.23`).

Four deaths on this world in 3.5 h: creeper blast then zombie (F062),
drowning (F065), a pinned tunnel escape (F068) and lava (F069). Three were
environmental reflexes or escape mechanics with no response at all. Audit the
remaining hazards the same way (fall damage, suffocation in gravel or sand,
fire, cactus or berry bushes, powder snow) before adding new branches.
Audit progress: `7558bda` adds the suffocation reflex. A solid block at
eye height pre-empts decisions with `clear_head`, which digs it out, and
critical-health cancellation spares it. Regression only; not yet loaded.
Fall damage, fire, cactus and powder snow are still unaudited.

## F070 — Deaths #5–#7: bare respawns in mob caves at night [live + regressions]

On `8dc2db6` (`03.50.23`), deaths #5–#7 came at 08:56:16, 08:56:55 and
08:57:36Z, within 90 s of each other. #5: the rebuilt bot (stone tools, no
armor) was walking about 250 blocks toward a 3-iron furnace job and met
three skeletons and a spider in a cave at Y≈8–13. #6 and #7: at night,
respawns landed in a cave under the world spawn, at (5,51,-4) and (2,52,-5).
The bare bot then restocked or worked through caves full of zombies and
skeletons. I stopped the bot at 08:58 to break the loop.
Fixes, all with regressions that fail on the old code:
- `1cd3519`: a smelt job is dropped when its furnace is farther than
  48 + 4 blocks per raw iron.
- `ff8771a`: long restock trips wait for daylight, or stay within 24 blocks
  underground; an unarmored bot underground at night with a hostile within
  16 blocks shelters. Quiet tunnels keep the productive-night policy.
- `6c6e441`: wooden tools never justify a long restock trip.
- `ff7d545`: `return_surface` failures never escalate into drop-down unstick.
- `cecbf1d`: any restock from the rock-enclosed vault needs a carried pickaxe.
Live on `cecbf1d` (`04.03.39`), the rebuild proceeded: stone pick, furnace,
wood. Seven deaths in 3h40m on this world; every one since #2 was a reflex
or routing gap, not a combat-strength gap.

## F071 — User live-test notes applied (2026-11-06) [user observation + regressions; live pending]

User observations from the port 55502 run: the bot died exploring the surface at night,
left for its first mining trip with too little food, and wasted planks on a wooden sword.
Code inspection confirmed it never cooked meat (raw beef restores 3 hunger, 1.8 saturation;
steak 8, 12.8). Changes in `ce24690`, each with a regression that fails on the old source:

- Gear order: no wooden sword; after the shield, an iron sword (2 ingots), then leggings,
  helmet and boots before any bucket. Hot Stuff now waits for the full iron set.
- Iron cap: visible iron is mined like a seen diamond while raw + ingots < 16 + ingots for
  missing iron gear and buckets (55 with nothing, 16 with full gear and three buckets).
  Base deposits keep at least max(32, cap) iron so restocks never trigger a deposit.
- Coal opportunity cap 32; base carry levels: coal 32, logs 40, food 24.
- Night: surface work and night hunting are removed (`huntAtNight`, `prepare_night_weapon`;
  recover them from `db44453` if a better-armed bot needs them). Underground mining at
  night ignores carried food and stops at health <= 12 (shelter, then wait).
- Mining departure: 32 logs and 260.5 meal points (16 x 16.28, the mean hunger+saturation
  of the five cooked land meats).

Departure from the user's note, flagged to them: the reserve uses hunger + saturation, not
saturation alone, which would value a glow berry (0.4) at 1/32 of a steak and require
~390 berries. Under either metric 16 average meats is ~8–16 animals per trip, so watch
whether gather_food stalls by day when animals are scarce. The underground night
threshold also waits at health <= 12 even with high hunger, because resting there
regenerates in seconds; this is stricter than "low on both".

The launch at 17:08:46Z on port 49259 logged "World seed changed" and cleared remembered
coordinates (base vault, shafts) although the user described the same world; check
whether the profile or the seed fingerprint is wrong before relying on base memory.

## F072 — Underground food opportunities, fish shores and a provisional home [regressions; live pending]

User direction (2026-11-06): while the meal reserve is short, food found on the way is taken
underground and on the surface: cod and salmon within three blocks of open air (swum to at
the surface, guard aborts below 15 air), ripe glow berries, mushroom stew (at most four
stews; they do not stack), then tropical fish (1.2 meal points, the lush-cave fallback).
A shore where fish were hunted is remembered for ten minutes; `gather_food` waits there
for respawning fish before scouting, and two empty waits forget it. The user confirmed
hunger + saturation as the measure and low health alone as the night-mining stop. If daytime
departure hunting stalls, lower only the departure threshold in `decision-engine.js`; the
opportunistic underground cap stays 16 average cooked meats (260.5 points).

Live (17:11–17:15Z, `9350b49`): after the F071 memory reset, home was set at the login
position Y=-19, so a sky-lit ravine floor read as surface and the bot scouted for trees there.
`updateHome` now gives an underground login a provisional sea-level home (Y >= 63) that the
first open-sky position above Y=50 replaces; stored homes below Y=50 are treated the same way.
Four `mine_iron` "No path" failures on unreachable ores escalated to unstick scouting;
opportunistic actions (`mine_iron`, berries, fish, stew) no longer trigger unstick or scouting.
`pick_glow_berries` ran live once and blocked an unreachable vine correctly.

## F073 — Diamond sword order and lichen-covered ore faces [user observation + regressions]

User (17:30Z, `bbff3f7`): with a diamond pick and 8 diamonds the bot had not made a diamond
sword, and it ignored deepslate iron near (-1,-13,137) that the user could see. The planner
put the diamond sword after the full iron set and Hot Stuff; it now follows the diamond pick
as soon as two diamonds are spare. Log: from 17:23:18 to 17:23:46 the bot was ~8 blocks from
that ore choosing `gather_iron`, so the priority filter rejected it. The face test accepted
only air neighbours; faces behind glow lichen, vines or moss carpet (no collision box) now
count as visible. Correction: the user then reported only air and deepslate beside that ore,
and that the bot walked through tall grass a few blocks from it, so neither lichen nor liquid
explains this case. Better explanation (code inspection): priority targets were re-checked
only between actions and tunnel steps, so a long walk (the furnace return tunnel, a
`gather_iron` route) passed visible iron and glow berries (-6,-15,136) without yielding. An
opportunity watchdog now checks every 1.5 s during resource walks (`INTERRUPTIBLE`) and ends
the action as progress when a new diamond, wanted iron, fish or ripe berry comes into view.
Remaining sight differences from a player, by design: rays sample nine points per exposed face
(a grazing sliver can be missed), glass and other collision blocks stop rays, and ores beside
liquid are excluded; the bot needs no light and no facing direction.

## F074 — Death #8: a fuel-less cooking job walked the bot into lava [live + regressions]

Run `outputs/2026-11-06@12.27.24` (`6794c26`), 17:29:37–17:30:26Z. The diamond sword was
crafted live at 17:28:23 (F073). A cooking job's furnace ran dry with one mutton left and the
bot carried no fuel, so `collectCooking` reset the job every ~10 s; the third return trip
pathed from (10,-17,127) into lava at (11,-17,128). The lava cancel fired at 17:30:23.2, but
`cancelCurrentTask` overwrote the handler's `urgentReplan` (its regex lacked "lava"), so the
1.5 s failure back-off delayed `escape_lava` to 17:30:25.0; the pathfinder escape then did not
move the bot and it died from 20 HP in 3.5 s. Fixes: a dry job with no carried fuel takes its
input back and ends; lava, suffocation and air cancels replan in 100 ms; the lava escape drives
forward+sprint+jump toward the nearest dry cell for up to 1.2 s before falling back to the
pathfinder. Not yet seen live: why the walk entered lava although lava is in `blocksToAvoid`
(possibly flowing lava next to the path). Death drops were judged unrecoverable (threats).
The respawn replaced the provisional home with (25,77,87) on first open sky, as intended (F072).

## F075 — Live: rebuild after death #8 with the F071–F074 policy [live]

Run `outputs/2026-11-06@12.39.17` (`c085d82`), 17:39–18:09Z, no deaths or damage. From a bare
respawn (logs only) the bot crafted stone tools, an iron pick (17:43:50), chestplate, iron
sword, leggings, helmet and boots (17:54:04), equipped a shield, and a diamond pickaxe
(18:06:27); the diamond sword became the next target at once (F073). The walk interrupt fired
seven times ("iron came into view during gather_iron"). It entered a cave at dusk and mined
through the whole night underground (timeOfDay 12558 -> 23938) without surfacing, as intended.
Still unobserved: fish hunts, stew, shore waits, the lava drive-out and a full cooking cycle
with fuel.

## F076 — Deaths #9–#13: cave-spider spawner, then bare respawns on sand [live]

Run `outputs/2026-11-06@12.39.17` (`c085d82`), 18:18–18:38Z; game day began ~18:09Z.
- #9 18:19:09 at (69,-22,135): with full iron, a shield, iron sword and diamond pick, mining
  iron at Y=-23 met ~5 cave spiders and 3 creepers (likely a mineshaft spawner). Fight for
  ~10 s under poison ticks (1 HP each), then `creeper approaching` switched to escape; the
  spiders kept pace. Kit judged unrecoverable (threats at the drop).
- #10 18:23:18, surface spawn at night, bare: shelter failed 9+ times ("burrow unavailable:
  column cell is sand", no building blocks, no path to dirt); cornered by zombies + creeper.
- #11 18:30:59 dawn: creeper explosion 16.7 -> 0 while escaping (two creepers at 4.6–4.8).
- #12 18:36:47 day: one zombie, bot at 7.8 HP with a stone pick and no sword/axe; escape lost.
- #13 18:38:35: resting at 3.2 HP (`wait`), shot by a pillager at 11.7 blocks.
The earlier success (F075) shows the rebuild works; the losses are the spawner encounter and
a hostile spawn area. User direction for the fix (2026-11-06): a bare respawn at night has
nothing to lose, so it need not bunker immediately; see G015.

## F077 — First iron descent skipped the meal reserve [live observation + regressions]

Run `outputs/2026-11-06@19.59.31` (`6091863`, port 51528). The bot gathered
wood from Y=122 down to Y=86. At 01:04:13Z it chose `gather_iron` at
(-63,86,22) with 31 logs, one logged plank and no carried food or previous food
action. The saved home is (-1,119,-5), and the saved mine route begins at the
iron departure. The old planner replays this bypass if the bot sees cover on
the lower terrain. The historical log has no time-of-day or underground reading
for that decision.

Daylight departure now prioritizes food over the wood reserve and visible ore
near the surface. Shallow covered ground uses the last nearby open ground as
its reference, including when returning to the surface. Action logs record
meal points, time of day and the underground classification. Both regressions
failed on the original source and pass with the fix. Live verification is pending.

The new world on port 52171 exercised the daylight food priority. It chose
`gather_food` at 0 meal points and moved to bulk wood at 270.8 points.
The first iron descent started after nightfall with 289.6 meal points, so
this did not exercise the final daylight departure gate.

## F078 — Furnace window progress listener leak [reproduced + regressions]

A prior launch log printed `MaxListenersExceededWarning` for 11
`craft_progress_bar` listeners, and the user saw the same count on port 52171.
Opening and closing 12 furnaces via the real Mineflayer plugins reproduced the
warning. `bot.closeWindow(window)` fired the bot-level event but skipped the
window's own `close` event, leaving one callback registered after each close.
Server close packets also skipped that event.

The pinned Mineflayer patch now emits both events through one close path.
Stale close calls and packets leave the next window alone. Both regressions
failed before the fix and pass after it. Fresh-package patch application
passed. The bot was restarted in Terminal on the same LAN port with warning
traces enabled. It collected the pending cooked beef and resumed surfacing
without a listener warning.

## F079 — Mining follows visible targets only [replay + regressions]

In the port 52171 run, `gather_iron` chose Y=27 because it had found an
unexposed ore block in loaded chunk data. It tunneled for about 25 s
before exposing the first block, then gathered seven raw iron. Cached
ore could also bypass the sightline requirement on priority searches.

Resource and entity discovery now uses a bounded forward view and an
eye-level sightline. The bot turns when a resource search comes up
empty. Iron falls back to Y=16 with no visible target, side probes only
flag ore that is in view, and stale ore memory does not select targets.
Pathfinding and safety checks still use block geometry. Regressions
cover buried iron, a cached diamond behind stone, facing away from an
exposed diamond, turning to find a resource, and an approach that
finishes with the target still occluded.

Live smoke test on port 52171 after restart. At 02:22:35Z the bot selected
visible deepslate diamond at (66,-10,232), then resumed looking for lava
with the diamond count up from three to four. No staged commands were used.

## F080 — Continue mining newly exposed faces [saved terrain + regression]

In the F079 run the bot mined diamond at (65,-53,276) and passed the
neighbor at (66,-53,276). The saved tunnel shows the second ore's west
face open. A sight replay at (65.5,-54,276.5) sees it after turning east
and misses it while facing down the tunnel.

Successful digs record the neighbors of the opening in the controller's
dimension-scoped cache, capped at 128 openings. A mining search can
consider a recorded neighbor outside the view while the opening is
still air and a ray reaches the target. The bot turns to aim before
digging. An unrelated ore still requires the normal view. The focused
regression failed before the change and now mines the second block,
checks a resealed opening and checks dimension isolation.

## F081 — A close zombie hit failed to interrupt an upward dig [live + regression]

On port 52171 the server recorded the bot's zombie death at 21:41:19
Eastern and the owner's zombie death 29 s later. It did not identify the
zombies. The inventory reply showed a diamond chestplate and leggings,
iron helmet and boots, diamond sword, shield and cooked food. While
carving upward for water at (-27,-36,364), the bot took six hits of
about 2.38 HP and kept digging until 5.7 HP. It attempted to eat three
times while a zombie was within 0.5 blocks. It died at (-27,-35,363).

The health listener consulted the forward view before interrupting
work. A regression reproduced the missed interrupt with a zombie
behind the bot. The Mineflayer hurt event now interrupts work on a
close hit attributed to a hostile and provides a short-lived bearing.
The next decision turns toward that point and checks sight normally.
The regression confirms a fight at 17.62 HP, with no response to another
player's hit or a hit without a source.

## F082 — Daylight wood before food and the delayed iron pick [live + regressions]

Port 52171, run `outputs/2026-11-06@21.46.10`. The bot spent its
remaining daylight on the meal reserve and entered the night with one
birch log. It reached 14 raw iron by 02:55:34Z with no coal, charcoal
or planks. The planner could burn carried planks but did not convert the
log for fuel. It requested surface wood and the nighttime fallback
continued mining. At 02:58:27Z, a replacement stone pick converted the
birch log, leaving two sticks and two planks. Those planks fueled three
ingots at 02:58:34Z. The bot collected the ingots at 02:59:12Z and
crafted the iron pick at 02:59:13Z.

User direction supersedes F077's food-first ordering. Daylight mining
preparation now stocks 32 log equivalents before optional food
gathering or starting cooking. The wood task also ignores ordinary
ore and food detours until stocked. Emergency hunger and collecting
ready furnace output still take priority.

## F083 — Remove deprecated entity lookup traces [logs + regression]

The terminal trace `entity.mobType is deprecated` appears in the earlier
2026-11-06 run at about 12:49 Eastern (`outputs/launch-head.txt`) and in
the evening Terminal logs. Mineflayer's entity lookup can encounter
unnamed placeholders. The fallback accessed a deprecated getter that
calls `console.trace` on every read, outside the normal bot log.
Searches now match the registry name and skip unnamed entries.

## F084 — Surveys climbed the bot's stairs and placed excess torches [live + regressions]

Run `outputs/2026-11-06@22.07.48`, 03:14:11–03:14:48Z. The bot
surveyed upward along its own staircase, from about (-20,24,163) to
(-10,34,162). The survey classification accepted the passage's open
geometry, without excluding known mining cells. Each step looked for
a torch using the F079 view filter. Torches behind the bot were missed,
and four coal were crafted into torches as it walked back up.

Surveys now exclude remembered excavated cells. New mining-cell entries
carry a dimension prefix, and legacy entries apply to the Overworld.
Lighting uses the local block-light level, with a threshold of eight,
so turning away from a torch does not trigger another placement.
Checkpoints remain memory entries. Both regressions failed before
these changes.

## F085 — Hard ten-block cave torch spacing [live report + regressions]

F084's light-only guard was insufficient. Run `outputs/2026-11-06@22.18.10`
tried to place a torch at (14,16,151) at 03:22:58Z while the cell already
contained a torch. The placement exception and repeated lighting attempts
show that the light reading alone did not prevent duplicates.

User direction sets a minimum ten-meter separation. Cave placement now
checks torch and wall-torch block positions within ten blocks, as a local
placement constraint independent of the forward view. It refuses distances
below ten and permits exactly ten. The spacing regression forces all light
readings to zero. Mining exposure tracking also persists the actual cells
dug out by ore collection, so those rooms can be excluded from cave surveys
along with the staircase. All three new regressions failed before the fix.

## F086 — Enderman gaze prevention and sealed refuges [live + regressions]

Port 52171 recorded the enderman death at 22:38:16 Eastern, near
(44,0,193). Repeated hits interrupted neither mining nor subsequent eating
and waiting; diagnostics reported no threats. Endermen were excluded from
ordinary hostiles because they are neutral, but had no separate aggression
response. The initial provocation was not recorded, so accidental gaze is
possible rather than established.

Look calls and a physics-tick guard now avoid unobstructed enderman faces,
including intermediate yaw sweeps. Visible anger uses registry metadata;
attributed damage works behind the bot. Either interrupts work or following
and selects a dedicated refuge before eating or combat. Further enderman
hits cannot cancel that response. Direct enderman combat is refused.

The bot pours carried water outside the Nether, digs a checked three-block
column and seals it. If that fails, it carves a two-high side passage, moves
two blocks sideways, seals the entrance and verifies the enclosure. A refuge
failure cannot invoke normal shaft escape or unstick recovery. A still-present
remembered enderman is not declared safe after sixty seconds: calm must be
visible, or the entity absent after the quiet interval. This conservative
policy may wait enclosed rather than resume productive mining.

Command-staged trials supplied iron armor, shield, iron tools and cooked pork,
with clear midnight weather and spawned endermen near (96,96,240). Commands
stopped before each autonomous trial. Ten face-aim requests left a neutral
enderman neutral. Water, stone without water and occupied-shaft trials ended
enclosed at 20 HP without attacking, after one, two and three enderman hits,
respectively. These are supplied-kit tests, not survival-earned progression.

Earlier trials exposed water flooding because shelter placement skipped water
cells, and a refused shaft roof under continued enderman attack. Roof placement
now replaces water and waits for drainage; the occupied-shaft trial validates
the low side-refuge fallback. The final repeat recorded the bot still protected
at 66.5 seconds with the enderman present. Ignored records are under
outputs/enderman-* and outputs/stage-enderman-test.js. Cleanup removed the
arena and tagged mob, retained one supplied kit and returned the bot to its
prior surface position. Natural encounters and departure after anger clears
remain unverified. All 346 tests and syntax checks pass.

## F087 — Four blocks between successive side branches [user direction + regression]

The side-probe interval is now five main-tunnel steps, leaving four blocks
between successive branch positions. Each side branch remains five blocks long.
Defaults, the example configuration and local LAN configuration use five.
The regression tunnels twelve blocks and verifies branch positions at steps
five and ten, with twenty total side blocks mined. It failed with the former
eight-step default. Existing explicit interval-eight coverage remains valid.

## F088 — Clockwise tunnel steering can excavate rectangular rooms [logs + replay]

The 23:19:37 LAN run spiraled near (203–206,-54,27–33) after collecting
diamonds and resuming gather_diamonds. There were ten gather_diamonds actions
and no cave-survey messages during 23:20–23:21 Eastern. Floor drops and stair
corrections accompanied the loop. This episode is tunnel routing, not a cave
survey; cave surveys explicitly disable digging.

mineTunnel rejects minedPassage cells, which include both previously walked
mining cells and blocks opened by probes or ore collection. It then tries
headings in a fixed clockwise order from mineDirection. Those two rules can
force successive turns around older passages and spiral inward through fresh
stone instead of returning to the advancing tunnel end.

The ignored outputs/replay-mining-spiral.js uses the real mineTunnel routine
with the side-probe test fixture. An existing passage around a 6x7 interior
causes forty of forty-two cells to be traversed and excavated in a spiral,
without invoking cave exploration or side probes. This establishes the routing
failure independently of cave detection. This was the pre-fix replay.
Keep the cave exclusion, but separate it from tunnel continuation: preserve
forward progress across ore detours and return to a usable tunnel frontier
rather than treating every remembered excavation as a forbidden destination.


F088 fix: tunnel continuation now retains a dimension/depth-scoped frontier and
a stable main heading. A nearby detour returns to that point using dry movements
with digging, bridging and tower building disabled. The return is bounded to
twelve seconds; a path failure restores mining movements and invalidates that
frontier. Unsafe or distant frontiers are ignored. Forward steps may cross
remembered openings; lateral fallbacks still exclude mined passages and cannot
reverse the main heading. Cave-survey exclusions remain intact.

Six routing regressions failed on the pre-fix source and now pass: the 6x7
spiral, a probe opening, ore-detour return, local obstacle heading, frontier
scoping and failed-return recovery. An additional cancellation check guards
equipping before a return. The original replay now advances forty straight
steps, crossing one row of the rectangle rather than filling its interior.
All 354 tests and syntax checks pass.

Command-staged LAN validation used existing mining gear and a temporary stone
enclosure near (97,96,61). The bot walked back from a staged detour without
digging, crossed a remembered surrounding passage, then mined sixteen forward
steps at Y=96 and Z=61, ending at 20 HP. Side probes appeared at X=102,107,112.
No commands ran during the mining phase. This validates the targeted routine
under staged geometry; a natural ore-detour return remains to be observed.
The first setup was outside loaded chunks and never ran the trial; moving the
setup near the bot resolved that setup issue. Ignored evidence is recorded in
outputs/tunnel-frontier-test.json and its log.

Cleanup incident: the owner teleported into the test enclosure before cleanup.
Removing it caused a fall death. The recovery helper preserved and returned
21 nearby dropped item entities and the available XP orb to the respawned
player; inventory pickup was server-confirmed. Original pre-death XP was not
recorded, so full XP restoration is unverified. The external staging helper
now moves any observer still inside the removal bounds to the bot's original
supported position before deleting the temporary blocks. Check for observers
before all future staged-structure cleanup.


## F089 — Water search abandoned a covered staircase at the surface-height threshold

Port 52171, run outputs/2026-11-06@23.35.06: fill_water_bucket carved
from (92,44,65) to (108,60,65). At 23:36:40 Eastern its observation changed
to underground=false at Y=60, because home Y was 63 and the depth test used
a strict three-block margin. That was not proof of an actual surface exit.
The next land scout selected (91,60,48), using a horizontal-only goal, and
ended at (89,39,50). It then built another staircase from that lower location.

Water search now checks the actual sky column, including roofs beyond the
old twenty-four-block cover check. Leaves do not count as solid cave roofs,
and unloaded columns are not assumed open. During daylight, no visible water
within bucket reach means finish the surface return, then scout with digging
and bridging disabled and covered cave cells excluded. Water approach paths
use the same covered/outdoor distinction. Generic failure recovery cannot
start an unrestricted land scout for this action.

User steering: surface exploration is daytime only. At night the bot searches
visible underground sources and bounded covered cave routes, then tunnels at
its present depth while retaining cover. It shelters if invoked on the open
surface, and waits underground if every covered tunnel step is blocked.
Nightfall interrupts a daytime water action before continuing surface travel.
A nearby reachable spring can still be filled immediately.

All eight water-search regressions fail against the pre-fix sources; a further
cave-route test covers the nighttime cover restriction. Nine new cases bring
the full suite to 363 passing tests, plus syntax checks. Existing return-route
fixtures now include actual roofs above underground starting cells, so an
all-air mock is not incorrectly treated as an underground staircase.
No new artificial world structures are used for this fix's validation.


F089 natural daylight validation: outputs/2026-11-06@23.52.04, PID 33316,
started at (116,66,50) with matching source hashes. Despite underground=false,
water search continued climbing to (120,70,50), then reached an outdoor source
and filled a water bucket without commands. One candidate source had no walking
path and was quarantined; the next search succeeded. The planner then moved on
to smelting iron for additional buckets. The live night search and sunset
interrupt remain unverified; automated day/night cases pass.


## F090 — Leaves hid remaining trunks; level scans missed overhead logs

The wood search used Mineflayer's collision-based canSeeBlock, so leaves were
opaque to discovery and to the final harvesting check. Its search turns also
kept pitch at zero, missing trunks directly overhead after lower logs were cut.
Visual rays now ignore *_leaves while retaining solid-block intersections and
the forward field of view. Wood search also scans upward at sixty degrees.
Resource approach goals, harvesting, ore faces, entities and enderman gaze
protection share the leaf-transparent rays; movement collision remains solid.

The new ray helper uses the actual Prismarine World matcher contract, computes
shape intersections and retains face/intersection data. Tests use the real
world ray iterator and real block shapes. Review also found that Vec3.normalize
mutates its vector: the entity sight check had measured the range afterward,
limiting obstruction checks to one block. It now records distance first.
Stone beyond the first block therefore still blocks entity sight.

Five leaf-vision regressions cover layered leaves versus stone, overhead trunk
search, ore faces, entity obstruction and direct harvesting. All fail on the
pre-fix source. Natural wood gathering remains a live observation target.

## F091 — Low-air work interruption and direct rescue swimming

Run outputs/2026-11-06@23.52.04 recorded drowning at (124,58,37) at
2026-11-07T04:54:34Z. After crafting and reclaiming a table near the furnace,
the bot descended to Y=54 while retrieving a workstation drop. No breath event
interrupted that action. Once air ran out, surface_for_air repeatedly selected
(124,62,37) without securing breathable air. It even briefly chose craft_table
at zero air. The precise head block during that brief false-negative was not
recorded; a head-name check was an unnecessary prerequisite for low-air safety.

A server breath event now pre-empts work at twelve of twenty air units, and
low air outranks ordinary work independently of the head block name. Water,
bubble columns, aquatic plants and waterlogged blocks are recognized in the
head observation. Emergency surfacing stops pathfinding and directly holds
swim controls, steering through a bounded search of two-block-clear water/air
cells around obstacles. It continues until at least eighteen air units return
or its six-second bound ends. Cancellation remains exclusive and controls are
released in finally. Follow mode also yields to low air.

Workstation pickup requires a safe dry landing and uses no-dig/no-bridge
movement, instead of following a dropped block underwater. Reclamation also
leaves the bot's supporting station intact and stops if equipping was canceled.
Six regressions cover the authoritative-air policy, breath interruption,
overhang swimming, wet pickup refusal, supporting blocks and cancellation.
All fail on the pre-fix source. The earlier air-rescue test now checks sustained
direct swimming rather than merely issuing a pathfinding goal.

The original remaining drops were temporarily preserved with an external
command while the repair was developed. A command-positioned trial in the
original natural pond survived direct ascent from Y=54 to Y=62.2 and restored
air, starting with low health and only three air units. That trial took no
health damage during rescue. The setup then returned the bot to the shore and
recovered seventeen remaining dropped item entities by command. These are
staged safety/recovery conditions, not unaided inventory recovery. No terrain
or player-owned structures were created or removed.


Final F091 pond repeat: the server reported Air=300 before submersion, and work
was interrupted at twelve air units. The direct swim reached at least eighteen
air units and the water surface; outputs/natural-pond-rescue.json records the
trial and matching final source hash. No commands ran during submersion/rescue.
An earlier setup assumed Mineflayer always initializes oxygenLevel; its field
can be undefined while air is at the protocol default. The corrected setup
queries the server's actual Air value before starting.

The interrupted holding-work phase was simulated as an unfinished craft action;
server breath metadata, cancellation and the swim rescue used the real runtime.
The initial low-health setup also exposed a separate startup limitation: a
water-supported spawn can be mistaken for a raised platform before the normal
loop starts. That startup path remains an observation/follow-up target.

## F092 — A moving log drop was mistaken for an unreachable tree

The first F090 restart did find and cut oak at (114,73,41), but timed out
on mined-item pickup at 2026-11-07T05:15:04Z. That exception blacklisted the
remaining logs at Y=74 and 75 for two minutes. A read-only live inspection
confirmed the lower remaining log was visible through leaves but excluded by
the active quarantine. Its native collision-based sight check remained false,
so the leaf-transparency change was working; pickup handling was a second bug.

Pickup goals now follow the item's current position and complete when the
server marks the collected entity invalid. Both loose-item collection and
post-mining pickup use this goal. Tree pickup has a four-second bound and a
failed pickup no longer quarantines reachable trunk blocks; cancellation still
propagates. Resource-approach failures continue to blacklist unreachable trees.
Two regressions failed before this change and now pass. The full suite has
376 tests. The incorrect live quarantine expired while this fix was tested.
