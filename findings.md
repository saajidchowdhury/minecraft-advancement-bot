# Findings

Updated 2026-11-05 (America/New_York). Evidence labels distinguish live observations,
automated regressions, code inspection and hypotheses. Keep useful finding IDs
stable; correct or qualify an old finding when new evidence changes it.

## Current handoff

Updated 2026-11-05 ~14:01 Eastern. Bot is RUNNING on LAN port 51718, PID 36683, code
`de766af`, code `03561b5`, rebuilding after eight deaths today (F023, F025–F030). Verify PID and connection before stopping it; `pgrep -f src/index.js`
must return one PID.
Earlier runs today on 51718: 10.54.41 (`152ed85`), 11.01.36 (`e474275`) and 11.05.01
(`2bcab2b`), each stopped deliberately to load the next fix. F019–F021 hold their
evidence. Suite: 164 tests plus syntax checks. The user allows autonomous pushes to GitHub. Staging helpers and setup records
(`outputs/stage-*.js`, `outputs/*-setup.json`) are ignored local files.

The previous 01:55:10 handoff is in git history and VALIDATION.md; the 02:08:36 run
(`a80974a`) followed it unrecorded and is analysed in F019/F020. The server lists
eleven completed advancements, including the staged Sweet Dreams from F017.

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
