# Findings archive

Full evidence for every finding, verbatim and in ID order. `FINDINGS.md` holds the
current digest and a one-line index; open this file only by searching for an ID
(`rg -n '^## F0NN' FINDINGS-ARCHIVE.md`). Append each new full entry at the end and
add its index line to `FINDINGS.md`. Correct an old entry in place when new evidence
changes it. Superseded session handoffs were removed on 2026-11-12; see git history.

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
this mapping. Last supplied LAN port: 50330. Last bot/owner: Bot /
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
`CAVE-OPPORTUNITIES.md` records official-source research and separates implemented
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

`NIGHT-OPPORTUNITIES.md` records Mojang sources and exact 26.1.2 loot/advancement
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

STRATEGY.md (new) measured today's sinks: ~29 min waiting at furnaces (60 smelt_iron
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

## F093 — Unequipped recovery gear and a broken pick caused a night idle loop

Run outputs/2026-11-07@00.18.50 broke its stone pick at 05:21:26Z,
sealed a shelter at (122,45,61), then repeatedly waited at full health and
food. The last snapshot carried armor and shields but all equipment slots
were empty. It had 29 cooked porkchops and abundant cobblestone, but only
one plank, no logs and no sticks: a replacement stone pick was not craftable.
The remaining wooden pick was usable. Armor selection sat behind tool
prerequisites, and the night fallback required a stone pick before allowing
any work.

Carried armor upgrades and a shield now equip after urgent survival actions,
ahead of tool progression or waiting. A sheltered miner crafts a ready
replacement pick before the night wait gate. Without enough sticks, a wooden
backup pick permits coal gathering, then stone work after the coal reserve
reaches 32; it is not assigned iron or diamond harvesting. No-tool and
low-health shelters still wait. Three regressions fail on the old source;
all 379 tests and syntax checks pass.

Natural restart on 39f5df1, outputs/2026-11-07@00.29.28, immediately
equipped diamond helmet, iron chestplate/leggings/boots and shield. Daytime
had arrived during development. After a bounded staircase escape from its
sealed shelter, the bot followed its return route from Y=45 to Y=60 and
selected gather_wood at 05:29:49Z, still at 20 HP/food. All running source
hashes match the commit. This confirms equipment and ending the idle loop;
wooden-pick night mining remains regression-only because the live restart
was during daylight. No commands or inventory changes staged this restart.
Comment-bearing lines: decision-engine.js 25/281 (8.90%); its test 1/452 (0.22%).

## F094 — A failed descent recovered by bridging into a mob-filled cave

Run outputs/2026-11-07@00.29.28 retained target Y=-54 but repeatedly
logged Y=-5 -> -5. Its downward steps were rejected while level fallbacks
remained available indefinitely. At 05:49:39Z the third failed tunnel action
triggered unstick scouting with generic scaffolding and a six-block drop
limit. The bounded cave survey itself disables bridging. Skeleton damage
followed at 05:49:52Z, then mining/escape/fight alternation and death at
05:51:02Z, (-40,-13,236). The exact placed bridge blocks were not logged;
the user observed dirt bridging and a shot-induced fall. The recovery path
permitted both, which is reproduced by the movement regressions.

Generic pathfinder scaffolding is now disabled. Combat escape and pursuit
use dry walking movements; unstick no longer bridges, digs during its scout,
or accepts deeper falls. Deep-mining recovery rotates and attempts a supported
descent instead of digging up. A descending tunnel permits at most eight
level detour steps before reporting a blocked descent, and does not open
side probes more than eight blocks from its intended mining layer.

Three observed hostiles within sixteen blocks latch a wall retreat ahead
of cornered combat. The latch retains only actually observed threat positions
and survives turning away; mob movement pre-empts ordinary work immediately.
Supported routes seek clearance before digging a one-block-wide, two-high
wall pocket. The bot enters and verifies two doorway blocks, placing the head
block first. Obstruction or failed sealing causes another run and a different
pocket attempt. A confirmed seal clears the retreat; inward mining replaces
the old cave frontier. Lava, suffocation, air rescue and enderman refuge retain
priority. Attempts, searches and path legs are bounded; cancellation restores
movement ownership. No supported route means refusal to bridge, not combat
against the crowd.

All 390 tests and syntax checks pass. Three policy/descent regressions and
two strengthened bridge/recovery regressions fail on the pre-fix sources.
Eight new component tests cover threat memory, event interruption, a real
two-block seal, continued inward mining, a failed-seal retry, unsupported
gaps, cancellation, and combat movement. Staged LAN evidence follows separately.

Staged LAN trial on 5c76964, outputs/crowd-refuge-test.json: supplied iron
gear, a pick, blocks and food; created a roofed stone corridor entirely in
previously verified air. Three zombies and a skeleton were released with AI
enabled before the autonomous trial. Four hostiles were visible at its start.
The bot ran 24 supported steps, sealed the pocket at (-21,142,125) with
exactly two blocks and continued inward to Y=138.9. Health stayed 20; there
were no attacks and no scaffold placements. Every retreat leg used no-dig
movements. No commands ran during retreat, sealing or inward mining.

Cleanup returned only the bot to its original location, removed the four
tagged test mobs and supplied items, and restored its original equipment.
The temporary arena was removed with a server-side guard requiring no player
anywhere above its footprint. No observer was teleported. The obstructed-seal
retry and a natural large-cave encounter remain automated-only/unverified
respectively; the narrow staged corridor is not an unaided survival run.
Produced code files have 0–8.68% comment-bearing lines (highest: decision-engine.js
25/288). The new refuge skill and its tests contain no comment-bearing lines.

## F095 — Rebuilding iron progression skipped hunting tools

The stone axe and shovel were already planner goals after a stone pick,
but a remembered iron-tools advancement suppressed both during iron-pick
replacement. After the F094 death this let the bot hunt without either tool.
Surface hunger and food opportunities also preceded ordinary tool preparation,
and fight(..., true) preferred swords over every axe.

The historical-advancement exception is removed. After a stone pick, the bot
prepares its axe and shovel before ordinary surface hunting, including their
wood/stone prerequisites. Immediate danger, eating, critical health and severe
hunger still interrupt. An already craftable iron pick or finished iron smelt
can still be collected first. Hunting prefers the best carried axe over a
sword; hostile combat retains sword preference. Copper axes are recognized
as usable tools in this Java version.

Hunting axe attacks wait for a charged first swing and subsequent swings:
1250 ms for wood/stone/copper, 1112 ms for iron and 1000 ms for gold/diamond/
netherite. These values follow the installed official Java 26.1.2 Items class:
axe attack-speed modifiers are -3.2/-3.1/-3.0 against the player's base 4/s.
The previous shared 650 ms interval weakened axe hits. Cooldown polling keeps
the hunting air/health guard and cancellation responsive.

Four regressions fail on the pre-fix source: tool rebuilding after iron was
previously earned, preparation before routine hunting, axe preference/charged
swings, and the air guard interrupting before a swing. All 394 tests and
syntax checks pass.

Natural restart on 3ed68c9, outputs/2026-11-07@01.20.17, crafted a
stone axe at 06:20:22Z and stone shovel at 06:20:25Z. It collected its
finished cooking job, restored the wood reserve and resumed gather_food at
06:20:35Z with both tools, 20 HP and 20 food. No commands staged this run;
all runtime source hashes match. A natural axe-equipped animal kill remains
unverified; weapon choice, charge timing and air interruption are regression
evidence. Produced code files have 0–8.56% comment-bearing lines (highest:
decision-engine.js 25/292).

F095 follow-up: keep aiming at close prey during axe charging. The initial
cooldown check ran before lookAt, so it postponed tracking for up to 1.25 s.
A strengthened assertion fails on 3ed68c9 and requires aiming before the
first swing while retaining the full charge. The aim update now precedes
the cooldown wait. All 394 tests and syntax checks still pass.

## F096 — Cooking return retried a stalled walking route for ninety seconds

Run outputs/2026-11-07@01.22.50 attempted to return to the finished
chicken furnace at (-27,74,194). Cooking furnace return timed out after
30 seconds at 06:24:24Z, 06:24:56Z and 06:25:28Z. The bot was repeatedly
near (-33,78,191). The third failure triggered supported scouting, and the
next return collected the food at 06:25:39Z. Thus it did recover, as the
user's follow-up suggested. The timeout was navigation, not a request waiting
for a furnace response. An empty furnace input already completes collection
without waiting for the estimated cooking finish time.

The old goal required standing within two blocks of the furnace coordinates,
although a hillside ledge farther away can be within interaction reach.
Cooking returns now target visible interaction reach capped at four blocks,
using dry walking movements. Each approach has an eight-second limit.
The first no-path/timeout immediately attempts a six-block lateral detour
(four-second limit), then retries once. Subsequent detours alternate sides.
Every goal is checked against the actual final position, covering the pinned
pathfinder's empty-noPath result that resolves without reaching its goal.
Canceled returns retain the job and do not start a detour or open a window;
known missing furnaces are forgotten before walking toward them. Movement
settings are restored in finally. No cooking-completion or inventory result
is inferred from the estimated finish timestamp.

Five regressions fail on the pre-fix source, including the real pathfinder
goto implementation's empty-path behavior. All 399 tests and syntax checks
pass.

Original-site LAN trial on 458fb97, outputs/furnace-return-test.json:
staged one furnace at the now-empty original site (-27,74,194), with a
single cooked chicken in its output and no input. Started from the original
stalled cell (-33,78,191). The first approach timed out at eight seconds;
the immediate lateral detour and retry collected the food after 11.243 s
total. It finished near (-28.32,76.23,195.53) at 20 HP, from an interaction
position outside the old two-block goal. The job was cleared despite a
deliberately future estimated finish timestamp, confirming actual empty input
and output collection control completion. All three route legs disabled
digging and scaffolding. No commands ran during the autonomous trial.

Setup replaced only verified air. Cleanup returned only the bot to its
original mine position, removed the supplied chicken and removed the staged
furnace using a server-side guard against players above/around it. An initial
setup stopped before placing anything because the distant site was unloaded;
the repeat loaded the recorded safe hillside before validating the site.
Produced code comment ratios: food.js 22/324 (6.79%), its tests 0/259 (0%).

## F097 — High tree logs were "No path" because approach reach was measured from the feet

Run outputs/2026-11-07@20.07.01 (01:07–01:11Z) blacklisted two nearby oaks
seven times with "No path to the goal!", then unstuck and walked away. The
user reported a tree base at (-24,69,194); its lower trunk was cut and logs
remained at (-25,74..77,194) and nearby (-25..-23,74..77,192..198).
Cause: mineflayer-pathfinder 2.4.5 GoalLookAtBlock.isEnd measures distance
from the feet node to the block raised by entityHeight. For an overhead block
that removes ~3.2 blocks of reach: an adjacent node accepted logs only up to
feet+2, although eye-to-centre reach covers about feet+5.

Fix (src/tree-climb.js): resource and glow-berry approaches use a subclass
measuring eye to block centre (reach 4.5, eye 1.62). Logs beyond standing
reach get a bounded pillar: a column within one block of the tree's highest
log, solid footing, open (or leaf) cells up to the head, at most 5 blocks.
Scaffold prefers dirt (descendSafely() can dig an interrupted dirt pillar),
then stone types, then logs; with none held it digs nearby dirt. Logs are cut
from the top, the pillar is dug back down (scaffold recovered), then the bot
turns to each settled ground drop. Abort skips descent so threat handling
owns the bot at once. Climbing requires no hostile within 16 blocks.

Live staged evidence (setup commands only; outputs/tree-pillar-test-{1,2,3}.json):
1. 04d3a0e: two pillar starts at the original tree were refused by the server
   ("block is still air"), one after a successful first placement; the
   abort path dug the placed block back down. Placement had been sent on the
   first tick above y0+1.05. Fix 296f32f: look down first, place one tick
   after y0+1.15 with forceLook ignore, retry a refusal up to 3 times. The
   exact refusal cause (server-side position lag vs another check) is inferred,
   not proven; the retry bounds it either way.
2. 296f32f: 3-block pillar at (-24,69,196) cut all 12 remaining logs and
   recovered its dirt in 24 s at 20 HP. Six ground drops were left: the
   descent ends looking straight down and canSee() requires inView.
   Fix 9b61429 turns to each ground drop; canopy-caught drops are skipped.
3. 9b61429: the four original remnant logs (-25,74..77,194) were refilled
   into air by command. The eye-reach goal cut Y=74, 75, 76 from the ground
   (pre-fix "No path"); Y=77 took a 2-block pillar, then drop pickup raised
   held logs 55 -> 60 (leftover run-2 drops included). 20 HP throughout.
Cleanup returned only the bot to its pre-test mine cell (127.5,16,269.5)
and set time back to night (16100); staging had set day, cleared weather
and killed hostiles within 64 blocks. Two log drops stayed on canopy leaves.

Discovery caveat: wood search only accepts logs inside the 35-degree vertical
view; a distant visible tree wins over overhead logs at pitch 0 (run 2
attempt 0). In the natural run the bot was already targeting these trees.
Ten regressions (test/tree-climb.test.js) use real prismarine blocks, the
real world raycast and a 0.42/0.08/0.98 jump model; all fail on pre-fix
source. Full suite 408/408. Comment lines: tree-climb.js 18/317 (5.7%).

## F098 — Detour returns re-probed and paralleled an existing tunnel

Run outputs/2026-11-07@20.31.37: after crafting an iron pickaxe at the
tunnel mouth (206,16,270) at 01:40:20Z, the saved frontier near x=235 was
29 blocks away, beyond mineTunnel's 24-block return limit. The bot started a
new frontier at the mouth and walked its own z=270 tunnel; every walked step
counted toward the 5-step probe spacing, so it probed x=211, 216, 221, 226
beside the earlier x=210, 215, 220, 225 probes (most mined a fresh 10
blocks). At 01:41:19Z, restarting from (205,17,269), it dug a new tunnel at
z=269 alongside the z=270 tunnel to x=231 before it was stopped (user report).

Fix d5fdd81: frontier returns accept 48 blocks with a 400 ms/block timeout
(12 s minimum); only tunnel steps that dig fresh rock count toward probe
spacing; probe anchors are remembered (2048 cap) and a probe within the
spacing of one is skipped; fresh rock ahead beside an old main tunnel running
the same way (side cell and its forward neighbour both in minedCells) makes
the bot step sideways into that tunnel and follow it. Requiring both cells
keeps a perpendicular old passage from pulling the bot sideways.
Five regressions fail on pre-fix source; the old anti-spiral ring test now
expects the bot to follow the ring edge instead of digging beside it.

Live restart (5852, outputs/2026-11-07@20.45.41, no commands): from the
mouth area it returned to the frontier (231,16,269), merged into z=270 and
resumed fresh digging beyond x=235. The first new probe at x=237 sat two
blocks from the pre-fix x=235 probe, which predates anchor memory; later
probes are spaced normally. Comment lines: progression-skills.js 41/1498.

## F099 — False low-air alarms came from other entities' air supply

Run outputs/2026-11-07@20.45.41 ran surface_for_air twice in a dry Y=16
tunnel (01:47:45Z at x=272, 01:49:11Z at x=297), reporting air 12 -> 4 ->
0 -> -1 at a vanilla drowning rate while HP stayed 20. The direct-control
rescue swam/hopped between adjacent cells (user report: "dancing").
Cause: mineflayer 4.39.0 lib/plugins/entities.js (mcDataHasEntityMetadata
path) sets bot.oxygenLevel and emits 'breath' for the air_supply field of
any entity's metadata. Every entity carries air_supply, so a nearby
submerged mob's falling air was read as the bot's. The legacy breath.js path
checked entityId; the merged path did not. Other runs since 2026-11-07 also
logged 3-4 "Low air" lines; whether each was false is not recorded, and the
F091 pond drowning was real (the bot was observed underwater).

Fix c0e0888: the patch-package patch guards the update with
entity === bot.entity; it applies cleanly to a pristine mineflayer 4.39.0
tarball and reproduces the installed entities.js byte for byte. A regression
drives the real entities plugin: a zombie's air_supply=60 set oxygenLevel to
4 before the fix and is ignored after it. The F091 policy (server air
outranks the head-block observation) is unchanged because the value is now
the bot's own. Restarted as PID 6597 (outputs/2026-11-07@20.53.00).
The patch's craft.js/inventory.js output differs from the installed files
only in comment wording (pre-existing; behavior identical).

## F100 — Mined iron left behind: out-of-view drops and pit-hidden vein faces

Run outputs/2026-11-07@20.53.00: a side probe from (371,16,274) exposed iron;
mine_iron dug (372,17,269) and (372,16,269) from (371,17,270), standing in the
1-high y=17 probe corridor (head cells cleared above). raw_iron stayed at 2
across both actions and no failure was logged. A spectator inspection by a
separate "Inspector" player (commands: /gamemode spectator, /tp; no world
changes; outputs/inspect-iron-371.json, 01:59:32Z) found one raw_iron
entity at (371.52,17,269.60) and the vein continuing at (372,16,270) (-z face
open), (373,16,269) (-x face open), (373,16,270), (374,16,270), (373,15,270).
Causes, reproduced on the inspected geometry with the real code:
1. findPriorityOre required a visible face. Both faces opened into the
   diagonal pit and every eye ray from (371.5,18.62,270.5) hit stone at
   (372,18,269), even with turning allowed, so the vein was dropped although
   exposedByDig() was true.
2. Post-dig pickup considered only drops passing canSee (in view, clear
   ray). Drops in or beside the pit were skipped silently, and a goal reached
   one cell away was never checked for actual pickup. Which of the two digs
   produced the surviving drop, and whether the other dropped or despawned
   in the unloaded chunk, is uncertain.
Fix 6b1a39c: ore our own dig exposed within six blocks of the eye remains a
priority target; collectTarget then approaches a position with a visible
face (no blind digging). Drops within 3 blocks of a mined block are turned
to, followed, confirmed collected (1 s), then the bot stands in the drop's
cell if needed; a drop still left is logged ("Left a mined ...") and no longer
aborts the collection. Three regressions fail on pre-fix source (the
six-block bound test guards over-reach). Live validation pending; the bot
died before restart (see the death below), so this restart (PID 8558,
outputs/2026-11-07@21.04.40) begins a new life.

Death in the same run, not yet diagnosed: at 01:57:45Z mine_iron targeted
(432,22,277) from (428,20,278); a skeleton 7-10 blocks away hit the bot
seven times from 20 HP to 0 by 01:58:21Z while it kept mining, then chose
eat/wait under "critical health". No fight, cover or retreat was attempted.
Drops were abandoned at (428,20,278) because the threat remained. The iron
pickaxe had broken at 01:55:17Z. Investigate why the skeleton never
outranked mine_iron and why critical health chose wait in the open.

## F101 — Skeleton death root cause and staged combat practice

Death at 01:57-01:58Z (F100): a skeleton 7.7-10.4 blocks away hit the bot
seven times while mine_iron, then eat/wait, continued. The server's
damage_event names the shooter (mineflayer entityHurt source), but the
handler ignored sources farther than four blocks, and the health handler
only counted archers already in view. The skeleton was outside the view
cone, so observe() also never reported it and no fight or cover was chosen.
Fix 8f3548c: archer hits count to 24 blocks, cancel work, record the hit
bearing; the next loop turns to the shooter, then fights or takes cover.

Combat practice harness (outputs/combat-practice.js, not committed): builds a
roofed stone arena in verified air at y=150 above the bot, supplies a kit
(IRON: iron sword, shield, full iron armor; STONE: stone sword only), summons
tagged NoAI mobs, enables their AI and then runs the bot's real decision loop
with no further commands. keepInventory is on during trials; cleanup restores
the bot's inventory, position and the gamerule and clears the arena. The
viewer is moved into a tinted-glass roof enclosure (no sky light, so staged
undead do not burn; blocks mob sight) with Resistance V, and returned after.
Harness lessons: commands sent 450 ms apart were silently dropped (round 1 lost
its final fill, tp and gives; the bot was later found falling from the sky
and its inventory was restored from the record and verified). Commands now
wait for a server reply with 800 ms spacing and one resend. The per-scenario
air refill once dropped the bot 78 blocks; bot and viewer now move to a glass
platform outside the rebuild volume first.

Rounds 1-2 (staged, iron kit unless noted; PASS = alive and all mobs gone):
death replica tunnel_skeleton_behind PASS x3 (killed in 9.5-10 s, 19-20 HP);
stone-sword variant PASS; far skeleton PASS; two zombies (iron) PASS;
zombie+skeleton PASS x2; spiders PASS; creeper survived at 17.3 HP (it
exploded; not a kill); skeleton at 8 HP PASS. Stone sword vs two zombies:
round 1 survived at 4.8 HP, round 2 died once (a second "death" was the
harness fall). Causes found and fixed:
- 80337a1: night surface damage cancelled ongoing fights ("night damage
  retreat" on every hit); fights/refuge now continue with the flag set.
- 80337a1 + c4723f8: two adjacent zombies make the unarmored bot escape;
  with no route it retried under hits. Zombies within ~1 block sit below
  the eye's view cone, so sight-gated checks missed them. A no-path escape
  with melee within three blocks (raw entities) now marks cornered, and the
  cornered fight targets that attacker even unseen.
- 5650194: fight() locked onto one zombie while the other hit freely (user
  observation), and a kill ended the action with the second still attacking.
  Defensive swings now rotate to the in-reach melee attacker swung at least
  recently, and the fight continues against a remaining attacker within 3.
- e9a3c51: kiting (user advice). Zombie reach ~1.5 blocks vs ours 3 and a
  walking player outpaces zombies, so defensive fights hold back/strafe
  controls away from all melee inside 2.5 blocks (safe footing only: solid
  floor, no liquids, at most a one-block step down), swing every 650 ms when
  a target is within 3, and await approaching melee mobs within 6 instead of
  walking into them. The shield is raised only when no retreat cell exists.
Round 3 (c4723f8): stone vs two zombies PASS at 1.2 and 10 HP, one death;
iron two zombies, zombie+skeleton PASS; it then disconnected: the harness
force-cleared a running eat and the controller reconnected ("Cancelled task
retained control"). Harness now waits for the action instead. Its gamerule
command also used the pre-26.1 name: keepInventory is rejected on 26.1.2,
the rule is keep_inventory; earlier rounds never enabled it (the world rule
stayed false throughout). Cleanup restored the viewer, arena (0 blocks
left), bot inventory (verified equal to the record) and position.
Round 4 (5650194, alternation, no kiting yet): 8/8 PASS; stone vs two zombies
ended at 12.2, 12.0, 2.0 and 20 HP. All rounds are staged evidence: Monster
Hunter was earned on a staged skeleton kill, not in survival progression.
Round 5 (e9a3c51, kiting): stone vs two zombies PASS x2 at 20 HP, one death;
flanking pair died; 1-wide tunnel pair PASS (15.2 HP); three zombies died in
wall-refuge attempts ("mobs prevent sealing"); iron pair and spiders PASS.
Causes: fight() still aborted unarmored two-zombie fights as outnumbered, the
no-route escape then reached unstick, whose rising staircase the user saw
("not a good escape tactic"), and the wall refuge could not seal against three
close zombies. Fix 7809452 (user guidance: fight, dig in, or tower 3+ up):
one extra melee-only attacker is fightable above 10 HP (no archer within 16,
no creeper within 8); unstick/scout never run with a hostile within 8;
zombie-type crowds (cannot climb or shoot) get a 3-block pillar refuge built
with the tree-pillar tower step: a zombie's attack box has no vertical reach,
its 1.95-block height is below our feet, and zombies at the base are ~2.8
blocks from our eye, so the bot hits them from the top and digs down when
none remain. Spiders (climb) and archers (shoot) keep the wall refuge.
Kiting also jumps onto a one-block rise behind when no level cell exists.
Round 6 (7809452): stone vs two zombies PASS x3 (20, 13.7, 20 HP), flanking
PASS x2 at 20 HP, zombie+skeleton PASS; three zombies x2 FAIL (pillar built,
0 kills in 75 s); hallway pair died. Causes: the 12 s movement watchdog
cancelled the stationary pillar fight ("retreat_to_wall is stuck"); the next
REFUGE decision failed pillarSafe on the pillar top (roof in the headroom
check) and fell back to retreatToWall, which cannot route off a pillar (user
saw "retreating to wall while standing on a pillar"); reach was measured to
the zombie's hitbox top rather than its nearest point; a crowd latch from the
three-zombie trial survived into the hallway trial and chose the wall refuge.
User rules: no pillar once any skeleton targets the bot (skeletons need their
own testing); a hallway of zombies is held off by fast swings.
Fix cfb2f92: combat swings and pillar fights mark watchdog liveness; the
pillar persists in c.pillarState and a bot on it resumes the refuge fight
(top decision priority) without towering again; any archer within 32 rules
out a pillar and one within 24 while up brings the bot down; pillar attacks
use nearest-point hitbox reach (3.0); crowd latches expire after 10 s with no
hostile within 24; defensive swings every 0.5 s (10-tick hurt invulnerability).
The harness now resets crowd/pillar/cornered state between trials.
Rounds 7-8 (cfb2f92, 3e3ab31): three zombies PASS x3 via the pillar
(17-50 s, 20 HP; the user saw it punch with cobblestone until 3e3ab31 equipped
the sword); round 7's harness lost its socket (EPIPE, cause not logged; kick
and socket errors are now recorded) and was cleaned up with the confirmed
cleanup script. Round 8: hallway pair PASS once and once sheltered for the
night (safe, timed out); stone two zombies PASS x2 (17.7, 18 HP).
User decision: the pillar trick does not generalize (caves lack 5 blocks of
headroom; one skeleton ruins it); keep it only for baiting Nether endermen
for pearls. d38b407 kites melee-only crowds of up to four close attackers
(armed, above 10 HP, no archer within 16, no creeper within 8, not a surface
night) and no longer dispatches the pillar refuge.
Harness caveat (user observation): /summon gave skeletons no bow, so every
skeleton PASS before round 9 was against an unarmed skeleton and is not
archer evidence. Summons now set equipment.mainhand to a bow and check it.
Round 9 (d38b407, armed skeletons): disconnected in the first trial. The
entityMoved crowd interrupt still cancelled the kiting fight against three
zombies (ten restarts in seconds; the user saw the bot slow to move), and an
eat at 11 HP beside three zombies could not be cancelled (9 HP lost, then the
controller's cancelled-task reconnect). Fix 84329a4: the interrupt and fight()
share one kiteable-crowd rule (armed, above 10 HP, only melee within 16, at
most four within 6); no eating with melee within 4; kiting can step forward or
diagonally forward so an attacker behind is escaped before turning.
Round 10 (84329a4): 7/7 PASS, all at 20 HP: three zombies x2 (15.5, 21.1 s) and
four zombies (23.2 s) with a stone sword and no armor in one continuous fight
action; stone two zombies; armed-skeleton scenarios (bow verified by /data get)
far skeleton, zombie+skeleton, and the death replica. Staged evidence only;
natural fights remain unverified. Comment lines: survival-bot.js 3.4%,
crowd-retreat.js and decision-engine.js under 10%.
Shield and hallway fixes after round 10: fbc3238 cycles the shield 0.6 s up /
0.9 s down while an archer is out of reach (a held shield slows to sneaking
speed and a hallway skeleton backed off as fast; user report); edd81c2 makes
kiting release only the keys it set (kite(null) on every chase tick had been
clearing the pathfinder's forward key, freezing a charge at 3.4 blocks; user
saw the shield cycling in place for ~25 s); 6528d10 ends a defensive charge
after 5 s without progress (a night shelter block had sealed the hallway).
Round 12: hallway skeleton killed in 10.4 s with 2 hits; 5/6 PASS. Round 11
also exposed a harness fall: the start-of-round teleport into open sky killed
the bot; the harness now places its glass platform first.
Round 13, rugged terrain (6528d10; seeded raised patches 1-2 high and 1-deep
pits in rooms, a 3-high hallway with steps and dips; daytime set per trial):
11 of 13 reported at time of writing: 10 PASS (hallway skeleton with shield at
15.5 HP; far skeleton, iron and stone zombie pairs, zombie+skeleton, creeper,
spiders, low-health skeleton, three zombies, flanking pair all at 17-20 HP).
The stone-kit hallway skeleton was not killed in 60 s (bot unharmed; it
tunnelled perpendicular out of the hallway, user observation); the user judged
survival a pass. Final two: rugged hallway zombie pair and four zombies PASS at 20 HP. Round 13
total: 12/13 PASS, no deaths; cleanup restored inventory, position, viewer,
Resistance and keep_inventory (false).
User notes for the next session (not implemented):
- Shield timing vs skeletons: hold the block until an arrow hits the shield,
  then lower and advance (and strike when in reach), then block again for the
  next shot. The fixed 0.6/0.9 s cycle does not match the skeleton's draw
  rhythm. Detect the blocked arrow (shield-block sound/status or the arrow
  entity hitting us) rather than timing it.
- During a hallway skeleton fight the bot tunnelled perpendicular instead of
  advancing along the hallway (stone kit, no shield); diagnose which action dug.

## F102 — Fall through a stalactite under mined iron; no digging under the feet

Death at 05:04:47Z (2026-11-09, outputs/2026-11-08@23.29.37): mine_iron at
(-54,16,204) mined iron_ore (-55,15,204) diagonally below. Its raw iron fell to
Y=-45, so a tall cave lay under it; ~12 s later the bot died at -56,-44,203
with no threats (20 -> 0 HP) during the drop pickup. User diagnosis: a
pointed-dripstone stalactite hung under the ore. Likely mechanisms (not
separated by the info log): the 0.6-wide hitbox rested over the ore column
while the floored cell was the neighbour (collectTarget only refused the
floored column), and/or the pickup path stepped down into the ore cell onto
the stalactite, which pathfinder counted as a floor; a stalactite falls once
the block above goes.
Fix f40371e (src/under-feet.js + the dig wrapper):
- "Under the feet" = any cell below the hitbox footprint, from the feet level
  down to the first full block (snow layers and mid-jump air included).
- Such a collision block is mined only if the bot placed it and a sound full,
  non-falling block is (or, when unloaded, was at placement) right below it.
  Natural blocks never qualify. Otherwise the bot steps to an adjacent
  standable, in-reach cell, sneaks to its centre and mines from there; with no
  cell it refuses. A pathfinder-issued dig is refused, not redirected.
- Own placements: placeBlock and _placeBlockWithOptions record
  memory.placedBlocks (per dimension, last 1024), also when an unanswered
  placement lands within 2 s (tree pillars); a dig forgets the record.
- Pathfinder treats pointed_dripstone as no floor (Movements.fences).
- Natural isolated pillars: descendSafely is refused by the guard and
  recoverMobility/DESCEND fall back to the controlled-landing route.
Emergency shelters are now 1x2 rooms (user): the surface enclosure (20 ring
walls, a roof seat, two roofs; 23 blocks), the burrow (dig neighbour column B
from centred top cell A, a damage-free 3-block drop into B, open A's lower two
cells from the side, plug B's top; A's original support is A's roof; 1 block)
and the enderman side refuge (three cells in, seal the first). Shelter state
is shelterCenter + shelterSide ([dx, dz], also in memory.shelter.side);
leaveShelter opens exits from either cell.
Staged live practice (outputs/dig-guard-practice.js, port 50876, f40371e
clean; sky arena at y=160 with a glass catch floor 8 below; each trial calls
one skill with no trial commands; 72 setup/cleanup commands recorded):
5/5 PASS, no damage. ore_centred: stepped off to (-4,160,2), mined, left the
raw iron that fell down the 7-deep hole. ore_edge (hitbox edge over the ore,
floored cell east of it): stepped to (-2,160,1); the raw iron stayed in the ore
cell on the stalactite and pickup was "No path" instead of stepping onto it,
the suspected 05:04Z move. burrow_dirt: 2-cell room verified in 6.3 s, no
step-off needed. surface_shelter: side [1,0] verified, exit opened (13.7 s).
own_pillar: three tower steps then descendPillar back to the floor (6.0 s).
Staged supplies earned story/upgrade_tools (given stone pickaxe) and
story/mine_stone (given cobblestone) on this world; they are command-assisted,
not survival progression. Unverified: natural night burrow/enclosure, the
mineFromShelter descent from a 2-cell shelter, a natural pillar spawn.

## F103 — Hunt abandoned an adjacent cow; cooking interrupted gathering

Live 2026-11-11 06:37:00-06:37:07Z (outputs/2026-11-11@01.29.23, no commands):
gather_food failed three times with "prey went out of view" at (-75,72,-26)
while the user saw the bot stand beside a cow. fight(hunt) tested canSee(),
which includes the 100x70 degree view cone, at the top of each loop before the
melee branch turned the bot toward its prey, so a cow beside or behind the bot
always failed. Fix fa41fe3: the hunt check tests occlusion only
(canSee(entity, true)). Regression test fails on the pre-fix source with the
live error. Live rerun (98bd572, 06:49:50-06:50:13Z) still failed three
hunts "out of view" from a y=86 hilltop: prey is chosen up to 48 blocks away
and the grazing sight ray flickered, one attempt 0.2 s after selection. Fix:
abort only after 3 s of continuous occlusion; hunts now log target and range.
Rerun on faed260 (06:52-06:54Z): hunts reached sheep and cows and killed
them, but the eat rule (health < 20) ate each raw mutton at food 17, so
mealPoints stayed 0. User direction: cook anything about to be eaten. The
planner now sends a raw-only meal to cook_food (start, or collect a ready
job); raw is eaten only when no furnace serves in time (food <= 14 or health
<= 10 without a job; food or health <= 6 while one cooks). Rerun on 6b01805
(06:55Z): reserve 275.6 started cooking 15 mutton at (-201,99,-336), but
furnace contents left mealReserve, so the hunt resumed and the job was
abandoned at 64 blocks 24 s later (15 mutton lost). The 64-block cap
(ce24690) had no recorded reason. Fix: the job's input counts toward
mealReserve; per user direction a job is abandoned only beyond 300 blocks,
revisited within 300 by day on the surface, 64 underground, 8 at night.
Rerun on 13e5fb4 (06:58-07:01Z): two pig hunts ended "out of view" after 3 s
while the bot closed 45.8 -> 19.4 blocks up toward a crest; closing 2 blocks
now also resets the occlusion timer (the 8 s stall and 20 s caps remain).
First full policy cycle: reserve 274.2 started cooking 5 porkchop (fuel: one
plank, 1.5 items), the reserve stayed 274.2 so no hunt pulled the bot away,
and nightfall sent it to shelter-mine beside the furnace with the job kept.
User report (07:03Z): the bot did not return to that surface furnace and
should have cooked underground after nightfall. Cause: one cookJob slot; the
surface job (night reach 8 blocks, bot at y~23) blocked canCook while ~191
raw meal points sat in the pack. Fix: an out-of-reach job parks
(memory.parkedCookJobs) so raw food cooks where the bot is; parked jobs come
back when in reach (daylight surface, 300 blocks). Jobs record whether their
furnace is underground; those keep a 64-block reach at night. A surface job
starts only if it finishes before tick 12500 (200 ticks per item).
Live 9bf8421 (07:06-07:08Z): the surface job parked and 5 beef started
cooking underground at (-81,19,-342), but smelt_charcoal opened that same
furnace, failed "unrelated input" and its cleanup took the beef back; the
next cook check saw an empty furnace, called it complete and reclaimed it,
looping four times. Fix: charcoal only takes back its own log, and iron and
charcoal smelting skip furnaces holding cooking jobs (getFurnace(cooking)).
User report (07:17Z): 13 raw iron sat fuel-less at (-80,16,-344). A
fuel-starved job counted as ready only with coal or charcoal, so the bot
went coal hunting with 25 logs carried and reached 72 of its 100-block
abandonment radius (48 + 4 per raw iron). Fix: such a job is ready when
carried wood covers ceil(count/1.5) planks; collectSmelt crafts and adds
the planks. Live 72c84cf: the bot returned 84 blocks and the job resumed
("input still smelting", 07:19:32Z). User direction: smelt jobs, like cooking
jobs, are abandoned only beyond 300 blocks (was 48 + 4 per raw iron, from
death #5). Jobs over 48 blocks away still count as ready, so a far job pulls
the bot back from up to 300 blocks; watch that against death #5's long walk.
Live 88681ef (07:23Z): 50 s into a 100 s smelt the bot walked back from 51
blocks and found "input still smelting". The early-ready distance (48) only
guarded the old abandonment radius; it is now 250, so unfinished jobs wait.
User direction: a furnace job is due when its fuel runs out; then the bot
refuels for input it still wants, else collects the output. Due times had
been 10 s per input item regardless of fuel (21 iron "due in 210 s" with fuel
for 8). furnaceDue now reads the window's tick properties (ticks left in the
burning item, cook progress) plus fuel-slot burn ticks (coal 1600, wood 300)
and stores readyAtTick in world age; jobDue compares bot.time.age. mineflayer
can derive a 0 fuel fraction when property 0 precedes property 1, so it waits
two ticks first. Unverified live; a furnace in an unloaded chunk stops while
world age advances, so such a visit comes early, not late. Live ed90991
(07:35:08Z): a 4-iron job far away for minutes was still smelting (furnace
idle in an unloaded chunk); the refuel check rescheduled it by readyAtTick.
User report (07:37Z): stairs dug beside stairs. A lava descent on z=-352 ran
beside the earlier y=-54 staircase on z=-351 from x=-126 to -135. The
parallel-tunnel merge covered only level tunnels, and the saved frontier
(48-block reuse) ended ~60 blocks away. Fix: descents also step sideways
into an adjacent mined staircase that continues one step forward and down.
User report (07:40Z): five diamonds mined on a lava-bucket search, no diamond
pickaxe crafted. memory.diamondDetour {lava_bucket, diamonds: 0} made
nextAdvancement plan as if the bot held 0 diamonds, so the craft rule (3+
diamonds, no pick) never fired and the detour never cleared. Fix: a fresh
plan for the diamond pickaxe or sword always wins; armor is still deferred.
User direction (same day): cook only after food is fully gathered or night
stops the hunt. The planner had started cook_food whenever any raw meat, a
furnace (or 8 cobblestone) and fuel were held; it now also requires
!needsDepartureFood, i.e. reserve >= MIN_MINING_MEALS, night, or deep below
the departure surface. Raw food already counts at its cooked value in
mealReserve, so the reserve target is unchanged. A surface bot at nightfall
still shelters first and cooks once sheltered or underground.

## F104 — Warden death in the deep dark; sculk caution [live + staged recovery]

Run `outputs/2026-11-11@02.42.09` (`dc53974`), 07:44:12–07:44:23Z, (-242,-54,-351) under mountains.
The user's own player triggered a shrieker (Darkness on their screen). The warden hit the bot
20 -> 10, 17.5 -> 7.5, then killed it through its emergency shelter: `warden` was only a generic
hostile, so the planner chose shelter, which a sonic boom ignores. Drops: diamond pickaxe and
sword (crafted 2 min earlier), iron armor, 4 diamonds, food.
Command-assisted from here (user approved; this run is no longer unaided). Commands, all
recorded in `outputs/warden-recovery*.json`: `/kill @e[type=warden,...,distance=..64]` (killed
one), `/tp` to the death cell, `/tp @e[type=item,...,distance=..12] @s` (58 entities; inventory
filled before the armor), a second pass that tossed junk stacks and pulled leggings and boots,
and a third pass. After pass 2 the inventory read only leggings and boots, and after pass 3 it
was empty. Cause unexplained; suspects are mineflayer `tossStack` on 26.1 throwing more than
the chosen stack, or deaths between passes (HP read 13.5 between them). The user said not to
pursue the inventory.
User direction: on hearing a detector or seeing warden blocks, hold sneak, leave the area and
mine somewhere completely different. `src/sculk-caution.js`: alarms are a sculk-family block
within 16 blocks, a heard sculk-sensor click, shriek or warden sound within 32, Darkness, or a
warden within 32. Each records a 48-block zone (`memory.sculkZones`) that `isBlockedTarget`
refuses, and drops a tunnel frontier inside it. `flee_sculk` (after enderman in the planner, ahead
of combat and shelter) walks out with no drops and no parkour, since sneaking stops at ledges, and
never breaks sensors or shriekers. Sneak is reasserted every physics tick until there is no sculk
within 24 blocks, the bot is outside every zone, and 30 s pass without an alarm. Open question: once
a warden is chasing, sneaking at 0.3x speed may be worse than running.
Staged practice (`outputs/sculk-caution-practice.js`, cdb34da + e682544, 07:55-07:57Z; 121x121
stone floor at y=160; setup commands only, recorded in `outputs/sculk-caution-practice.json`):
3/3 PASS. A sculk patch plus sensor 10 blocks away, a played shriek 10 blocks away, and Darkness
each raised caution within 1 s, the planner chose flee_sculk, and fleeSculk walked about 52 blocks
in 30-38 s with sneak held on 98% of ticks (brief gaps when the pathfinder cleared controls), no
drop, ending outside the zone; caution cleared as the walk ended (30 s quiet). Unverified:
a real deep-dark flee through caves, and tunnels and targets avoiding a stored zone live.
Live (07:52-07:54Z): a parked porkchop job 210 blocks away looped 30 lateral detours, because
collectCooking gave each walk 8 s (set when jobs lay within 64 blocks); e682544 gives it 400 ms
per block. It still failed with an immediate "No path" (41 detours): the dry no-dig approach cannot
plan to a furnace beyond loaded chunks. Now a furnace over 24 blocks away is first reached with
normal movements, and eight failed detours pause the job (retryAfter, 5 min; foodState treats it as
out of reach) instead of looping.

User direction (08:05Z): with an empty inventory (and no drops to recover) the bot builds wood and
stone tools before hunting. Respawned at 5-10 HP, it had hunted bare-handed: "health <= 10, no food"
and "food <= 16, no food" both sent it to gather_food. Now, until it holds a stone pickaxe and an
axe, only food <= 6 starts a hunt. The low-health rule also needs food < 18, since a full bar
regenerates on its own. Death-drop recovery is still decided first.
User direction (08:07Z): night work from a shelter continues at exactly 12 HP. ae79e95 sat out a
night underground at 12 HP, hunger 17 (no regen) with only a raw chicken and no furnace, because both
night rules waited at health <= 12. Underground-night waiting is now health < 12 and surface
mine_from_shelter is now >= 12; the shaft-descent, carve-down and surface-retreat thresholds stay.
736e44c still waited: the log's hp=12.0 (toFixed) was just under 12 after fractional damage, so
499cba0 compares against 11.5 (12 HP as displayed); the bot then switched to gather_stone at once.

## F105 — Late ore breaks and hunting drops outside the view cone

Live on port 49910 (2026-11-11, `outputs/2026-11-11@22.51.28/bot.log`):
the pig hunt ending near (399,73,16) and the chicken hunt ending near
(426,70,-8) left the food reserve unchanged, matching both user reports.
After the 800 ms post-hunt wait, the bot used its current view cone twice
to filter item entities. Hunting now searches server-tracked items within
four blocks of the prey's last position, then uses the mined-drop routine
to turn to them, follow them and try the exact item cell if needed. The
hunt's dry pathfinder settings still apply. A post-fix hunt remains unobserved.

The pinned 26.1 registry gives 108 blocks `incorrect_for_wooden_tool` where
the 26.1.2 game jar tags all of them `mineable/pickaxe`. The local correction
now applies to that set; `canHarvest()` still uses the original tier data.
The Mineflayer finish packet moves from 4550 to 1150 ms for grounded iron
ore with a stone pickaxe and from 4550 to 750 ms for grounded diamond ore
with an iron pickaxe. The previous run's world clock averaged about 20 ticks/s
before the report. The average cannot resolve individual stalls.

Natural restart at 23:00 Eastern on port 49910 in the same Terminal (no
Minecraft commands). The server confirmed removal at 1202 and 1159 ms for
two iron ore blocks and 1166 ms for one copper ore, with a grounded stone
pickaxe. The same trace showed one stair-transition copper dig start
airborne and send finish at 5651 ms. Routine dry digs now wait up to 400 ms
for footing before starting, with cancellation checked during the wait.
On the next natural restart, an airborne copper dig request started grounded
after 102 ms and sent finish 751 ms later with an iron pickaxe. Traces are in
`outputs/mining-and-hunt-restart-49910.log` and
`outputs/mining-and-hunt-landing-49910.log`.

## F106 — Convert furnace wood to planks and batch charcoal

User reported raw oak logs being burned. The cooking start and refuel paths
could choose logs directly; iron's first-pick fallback could only use
already-crafted planks. The installed Java 26.1.2 `FuelValues` and recipes
give 300 burn ticks for a log or plank, 150 per wooden slab, 100 per stick
and 1600 per charcoal, at 200 ticks per furnace item. Per oak log this is
1.5 items raw, 6 via planks or slabs, and 4 via sticks. Slabs tie planks
in bulk and need another recipe. Two planks make three charcoal, enough
to smelt 24 items from 3.5 log equivalents (about 6.86 items/log).

Cooking and first-iron jobs convert logs only when needed, using enough
compatible planks for the fuel slot. Cooking closes and reopens its
window before and after inventory crafting. The existing charcoal action
makes up to three at once for a larger iron batch. Already-carried coal or
charcoal remains preferred. A natural restart on port 49910 loaded the
patch. The bot has coal, so a wood-only furnace job is still pending live.

2026-11-12 follow-up: after a skeleton death, the bot loaded two carried
oak planks at (502,20,136) and used the three resulting ingots to rebuild
an iron pick. It later burned one carried oak plank to make one charcoal
and used that charcoal to start an eight-iron batch at (490,17,134).
The live record is `outputs/creeper-sword-restart-49910-r3.log`. A wood-only
food job, conversion of logs into fuel planks and the multi-charcoal path
still await live observation.

## F107 — Ore visibility, blind aquifers and approach alignment

Port 49910, 2026-11-11. At (492,17,38), the 23:04 Eastern run rejected
iron as unsafe. A read-only inspection of the saved region found water
directly north and below the ore. The old target and dig checks could
read those cells even through rock. Exposed-ore selection and direct
mining now use sight rays to recognize adjacent hazards. If a break
reveals water or lava, the bot skips the drop approach. The tunneling,
probe excavation and generic pathfinder checks still use chunk data.
In the installed Java 26.1.2 client, the ambient sound from flowing water
is a client-local animation effect. It is not available as a position cue
from the server, and stationary source blocks do not play that effect.

At (573,17,32), an approach ended without a valid sight ray at 23:10:44.
The 120 s cooldown delayed the retry until 23:13:06, then the server
confirmed removal. A real raycast replay reproduced an occluded eye
position within a cell the pathfinder considered reachable from its
center. A failed ore approach now checks again after landing, then tries
centering in the supported cell when its center has a view. A visibility
failure retries after 15 s. Exact sub-block live position was not logged.

At (600,15,29), the fuel-update restart interrupted the selected ore at
23:14:27. The bot collected the nearby furnace output at 23:16:48 and the
server confirmed the ore break at 23:16:54, before this change.

## F108 — Furnace iron counts toward the equipment reserve

On port 49910, the old underground reserve with boots missing was 29 iron:
16 unallocated ingots, 9 for three buckets, and 4 for boots. Moving raw
iron into a furnace dropped it from that calculation, allowing visible
iron to keep interrupting the plan. Count the recoverable furnace job,
carried raw iron and ingots together. Budget up to three spare iron picks
(9 ingots), up to three buckets (9 ingots), and missing iron equipment.
An iron pick already serving as the main pick does not fill a spare slot.
The planner starts a needed smelt ahead of optional visible iron.

## F109 — Pre-hit mob detection and a shorter creeper retreat

At 23:30:35 Eastern on port 49910, the server confirmed a creeper killed
Bot at (700,3,25). Multiple skeleton arrows had worn the bot
down, five escape attempts failed, and the explosion took its final
2.93 HP. `outputs/visible-ore-restart-49910.log` contains the bot trace.
Commands to give the owner gear and visit the scene are recorded in
`outputs/creeper-death-visit.json`.

Check line of sight in any direction before interrupting work. Melee
alerts reach 6 blocks, creepers 8, and archers 12. Entity updates and a
100 ms scan cover stationary mobs coming into reach as the bot moves.
The first staged trial caught both mobs behind a working bot at full
health. The zombie was killed, but the creeper escape targeted a point
16 blocks away outside the arena. The new goal permits shorter retreats
in any direction that increases separation, using dry walking movement.
Commands and outcomes are in `outputs/proactive-mob-practice.json` and
`outputs/proactive-mob-practice-2.json`. In the rerun, MobPractice stopped
digging at 6 blocks from the zombie and 8 from the creeper, then killed
the zombie and reached 12.04 blocks from the creeper at 20 HP in both
trials. The owner watched from the tinted-glass roof. The server
confirmed the owner's return and the arena was removed.

## F110 — Surface return exhausted both picks

The old bot reached Y48 on a carved exit with one plank and no sticks.
Both picks broke. Failed walking searches repeated and the generic
scout sent it farther down. Six sticks and two cooked beef let the bot
craft new picks, eat and resume work; see `outputs/surface-resupply.json`.
Failed pickless climbs now pause route retries for 30 seconds in that
dimension, or until a pick is available. Surface failures no longer
start a lateral scout, and an upward return segment does not abandon
the staircase for optional ore.

The restarted bot climbed from Y16 to open ground at (483,64,78) and
started gathering wood at 23:53:16 Eastern. It cut the exit with picks
crafted after the resupply and without any teleport or blocks supplied
for the climb. See `outputs/iron-threat-restart-49910.log` and
`outputs/iron-threat-restart-2-49910.log`.

## F111 — Cave combat while mining and smelting

`outputs/cave-mob-practice.js` stages eight encounters for a separate
CavePractice player. `CAVE_SEED` selects three ore veins, up to ten patches of
uneven stone and pits, mob placement, and two of the three possible
pairs. Three single-mob trials and an all-three trial guarantee coverage
of creepers, bow-equipped skeletons and zombies. Each starts with iron
helmet, chestplate, leggings, sword and pickaxe, a shield and empty boots.
The normal bot controller starts smelting 16 raw iron and chooses an
exposed iron dig before a single command moves the mobs out of their
holding cells. The last two trials release reinforcements while the bot
is moving on an escape or refuge path with the initial pair still a
threat. All released mobs remain in the same trial's scoring. The escape
window starts after the last wave. Only wave release commands run during
combat. Run all cases with the current LAN port and seed, or select
`CAVE_MODE=simultaneous` or `CAVE_MODE=staggered` to run one group. Set
`CAVE_RESULTS` to save a new result file without replacing an older run.

The observer sees glowing mobs from a lit arena under a tinted-glass roof.
The harness credits a kill only when the server reports death and damage
from the bot. An escape must move at least four blocks during a defensive
response and maintain clearance from all surviving mobs for four seconds
without taking damage. The clearance is 10 blocks for creepers, 12 for
zombies and 16 for skeletons, or 7 with stone or other terrain blocking
sight. Timeout, bot death and disappearance without attribution cannot
pass. The harness logs commands and samples to JSON, returns the observer
to their position and removes the temporary arena.

On Nov 12, seed 49910 passed the lone skeleton and lone zombie. All four
simultaneous cases with creepers timed out. The bot killed the skeleton
in the creeper/skeleton pair and both non-creepers in the three-mob case.
In the lone creeper trial it resumed work between retreats, then braced
with its shield at 3.1 blocks and stayed at 20 HP. The creeper disappeared
without a credited kill. In the creeper/zombie pair both mobs remained
alive and were still following at the deadline. The simultaneous run is
in `outputs/cave-mob-practice-49910-r2.json`.

Both reinforcement waves fired during a real `escape` action, at 4.286 s
and 7.606 s. Creeper and zombie followed the bot into a wall-refuge search
after a skeleton arrived. It survived to the deadline at a minimum of
17.76 HP. In the other trial, it killed the initial skeleton, then took
heavy damage while seeking a wall refuge after the zombie and second
creeper arrived. The server confirmed a creeper explosion killed it at
(437,168,41). See `outputs/cave-mob-practice-49910-staggered.json`.
The server restored the owner and removed the arena after each run.
Bot rejoined port 49910 and resumed mining.

## F112 — Sword strikes and retreat against an isolated creeper

The planner previously sent every nearby creeper to escape. A healthy
bot with a sword now waits for an isolated creeper at the edge of sword
reach. It verifies a dry path, sets the back or strafe control as it
strikes, opens a gap and waits for the next approach. It backs off farther
if the creeper is swelling and falls back to cover or its shield if the
route fails. A new nearby attacker can interrupt the duel.

In the first two same-seed cave reruns, a short path-search budget
prevented the first swing, and full-distance retreats after all swings
pushed the bot into a corner. The third rerun used the edge of the mob's
hitbox and a shorter route before swelling. With the requested iron kit
and shield, it killed the creeper in four strikes at 2.94–3.20 blocks and
took zero damage. The nonlethal strikes were followed by gaps of 5.79,
6.13 and 8.63 blocks, with an extra retreat to 8.29 when it saw swelling.
The trial began during an iron dig with 16 raw iron smelting. The owner
was restored, the arena was removed, and Bot rejoined port
49910. See `outputs/creeper-sword-cave-49910-r3.json` and its companion
log. `CAVE_TRIALS=1` selects that lone-creeper case. The staggered crowd
cases from F111 were not rerun with this change.

## F113 — A water search froze beside water; deferral released Cover Me with Diamonds [live + regression]

Live 2026-11-12 on `510b533`, `outputs/2026-11-12@00.19.31`. At 06:18:58Z a
daylight `fill_water_bucket`, underground with no visible water, was carving a
staircase from Y=-14 toward Y=75 heading north. At (305,10,-106) it failed
"no supported dry tunnel step" 40+ times, about every 2.5 s, without moving. A
read-only parse of the saved region (`r.0.-1.mca`, saved 06:20Z, after the
stall began) showed water source blocks from z=-108 north at Y 8–15. The north
step's neighbour cells were water; south had gravel at z=-104. East was the
bot's own shielded disposal pit, dug at 06:18:56Z, and west was its own stair.
Both were in `excavatedCells`, which lateral tunnel steps refuse (F088). The
hazard check reads chunk data, not sight or memory, so it correctly saw that
digging north would open into the water. A failed `fill_water_bucket` skips all
failure recovery (F089), so nothing broke the loop.

Fix `a76b2d6`: a rising step may cross old excavations sideways, because each step
gains height and cannot spiral. The stall error now counts unsafe, excavated
and blocked candidates. Three in-place `fill_water_bucket` failures set
`memory.waterDeferredUntil` for 5 min, and the planner skips the water,
obsidian and portal steps while it is set. Three regressions replay the saved
geometry and the tick loop; all fail on the previous source. 492 tests pass.

Restart at 06:30:05Z in Terminal window 781: by then it was night
(timeOfDay 18586), so the covered night search ran instead of the climb. Each
of three tries hit the 12 s movement watchdog with nothing logged. The
deferral fired at 06:30:48Z. The planner then crafted a diamond chestplate and
the server confirmed Cover Me with Diamonds (`story/shiny_gear`) at 06:30:51Z.
The bot also crafted diamond leggings and went back to mining for a helmet.
The bot had carried 15 diamonds since about 05:57Z. The diamond detour (F103)
had kept the interrupted water goal ahead of affordable armor, delaying the
advancement by about 30 min. The sideways climb is regression-only so far.
No commands were used.

## F114 — Hazards judged by sight, not hidden chunk data; revealed liquid is plugged [user direction + live + regression]

User direction (2026-11-12): the bot must not refuse to dig toward water it could not physically see
from where it stands, whichever way it looks. In F113 the north step was refused because the cell
behind the granite at (305,11,-107) was water in chunk data.

`c72c0bc`: `cellVisible` (src/vision.js) walks voxels from the eye to a cell's centre and six face
centres, ignoring view direction, with full collision blocks opaque and leaves clear, up to 16
blocks. `safeTunnelStep` counts a liquid or falling-block hazard, and checks a missing floor, only
when the cell is visible. A hidden floor is checked after the step's cells are dug, and an open one
is built with carried blocks or the step is blocked. After each tunnel or probe dig,
`revealedHazard` treats liquid in or beside the opened cell, or a falling block above it, as now
seen: liquid flows in within ticks. Liquid is plugged with `placeSurvivalBlock`, which now accepts
lava cells as well as water. The dug cell is blocked for 120 s and the dig throws. Probes stop that
side.

Live on `c72c0bc` (06:40Z, daylight, no commands): the climb dug north into the water at
(307,8,-107) and plugged it, which F113 had made impossible. The next plan chose the same step and
reopened the plug, because only the dug cell had been blocked. `f0b1468` also blocks the step that
needed the cell. Restarted at 06:41:28Z; the bot went on tunnelling toward Y=-54 for a diamond
helmet. A plug after the second fix has not been observed live. Regressions (stall geometry, a
hidden water layer under a descent, probe reveals, the visible and hidden cases of
`safeTunnelStep`) fail on the previous source. 493 tests pass.

Remaining chunk-data reads: mineflayer-pathfinder's own `safeToBreak` (`dontCreateFlow`) still
refuses path digs beside hidden liquid, and support, container and diggability checks in
`safeTunnelStep` still read the cells being dug. The owner was also given infinite Night Vision and
Regeneration I by a separate EffectHelper login; commands and replies are in
`outputs/owner-effects.json`.

## F115 — Inventory cleanup ran every tunnel segment; keep rules, outclassed gear, batch cleanup [live + regression]

Live 2026-11-12 06:41–06:43Z on `f0b1468`: 10 of 19 actions were `clear_inventory`, about 20% of
mining time. The pack held 35 of 36 stacks. The trigger (4 or fewer free slots with any surplus)
was always met. Each tunnel segment mined about 12 cobbled deepslate past the 64 reserve and
started another shielded pit, which threw only those 12. Only listed rubble was ever
discardable, so junk and outclassed gear accumulated: 27 raw copper, 6 oak saplings, 1
gunpowder, wooden and stone pickaxes beside iron and diamond, an iron sword beside a diamond
one, an iron chestplate and leggings under worn diamond, and a split cobblestone stack (59 + 1).

`52609d2` (user direction): keep rules replace the reserve list. Every cleanup throws whole
stacks beyond each rule (logs 40, coal and charcoal 32, gold 8, lapis 8, redstone 16, string
5, feathers 4, food, valuables). The two best pickaxes and the best other tool of each kind
are kept, armor only if better than worn, and items with no rule are thrown. Copper and
gunpowder are junk by user direction, and caves no longer collect copper. Stone blocks share
one 64 reserve and dirt has its own 16, because dirt seals have blast resistance 0.5. Cleanup
starts at two free slots and merges split partial stacks first. `9d49a46`: at night,
`fill_water_bucket` had swallowed a tunnel stall and returned success, looping every 1.7 s
for six minutes at (308,-54,-148) (06:45:58Z onward). It now fails with the tunnel reason, so
the F113 deferral applies.

Restart 06:53:55Z (`9d49a46`, no commands; the owner kit ran beforehand and gave 6 enchanted
golden apples): one cleanup threw iron leggings, saplings, 27 copper, stone and wooden picks,
the iron chestplate, gunpowder, 57 cobblestone and the iron sword. Free slots went from 1 to
9. The water search failed three times in place and was deferred for 5 min, and the bot went
on to tunnel for a diamond helmet. Regressions use the 06:42Z inventory and fail on the
previous source. 496 tests pass.

## F116 — Line of sight replaces the view cone; head turns removed [user direction + regression]

User observation (2026-11-12): the bot often turned its head, sometimes after a pause, and then
went straight back to work. The cause was the F079 field-of-view rule. Searches (`scanFor`)
turned through four directions with a tick pause each when nothing was in the 100° by 70° view
cone. Ores were aimed at before digging (one more tick), drops were turned to before following
(F100, F105, F097), and the hit bearing was turned to before deciding (F081, F101). The user
retracted the rule: the bot may use anything that a line from its eye reaches at any point,
edge or corner, without passing an opaque block, whichever way it faces. Things it once saw
(dig-exposure memory) still count.

`8bd5fab`: the cone is gone from block, ore and entity sight. `canSeeBlock` samples the centre,
face centres and corners. Ore faces add edge samples, and `canSee` adds hitbox corners. Leaves
and glass are see-through in `sightRay`. `scanFor` no longer turns. Ores are dug without a
pre-aim turn (`dig(..., 'ignore')`), drops are followed without facing them, and the hit
bearing is no longer recorded. Looks that interaction needs remain: throws, attacks,
placement, movement steering and enderman gaze avoidance. A first draft normalised a Vec3
before taking its length, which made every entity ray one block long. The existing leaf test
caught it (compare F090). Nine tests that required turning now require none, and a new test
covers a hitbox corner over a wall and sight through glass. Each fails on the previous
source. 497 tests pass.

Restart 07:03:36Z on `8bd5fab` (the owner kit check gave nothing). With full diamond armor
crafted at 06:56–06:59Z and the water route deferred, the planner had only `wait` left. The
bot idled until the deferral expired, so the fallback when the water route is deferred is
idle time.

Follow-up `3d436d7` (user direction): when the water route is deferred and the bot holds a
diamond pickaxe and fewer than 16 diamonds, the planner chooses `gather_diamonds` instead of
`wait`. That banks diamonds for the enchanting table and collects capped gold, lapis, redstone
and iron on the way. The regression fails on the previous source. 498 tests pass.
Live 07:08:52Z on `3d436d7`: gravel revealed above a night water-search step at (313,-4,-38) ended
three tries in place, the route was deferred, and a second later the planner chose `gather_diamonds`
("mining while water waits") instead of `wait`. No commands were used.

## F117 — Night surface work for a fully armed bot [user direction + regression]

User direction (2026-11-12): now that combat is decent, a bot in full iron-or-better armor
with a diamond sword and a shield may go to the surface at night. This should speed up the
water search in particular, since surface water is far easier to find than cave springs
(F113, F115). `95e7e6d`: `nightSurfaceReady` (all four armor slots iron, diamond or netherite,
shield in the off-hand, diamond or netherite sword carried, HP above 12) clears the night
surface rules in `chooseAction`: shelter, carve down or descend a shaft, and no surface-bound
trips at night. `fill_water_bucket` then searches as in daylight, and nightfall no longer
cancels its surface search. A night retreat (crowd, low health or food, sudden surface
damage; night-policy) still shelters the bot, and kiting stays disabled on a surface night.
Three regressions fail on the previous source. 500 tests pass. Restarted at 07:13:11Z (timeOfDay 22327)
with dawn near, so a ready night on the surface is not yet observed.

## F118 — A fallen gravel column trapped the bot by the feet; gravel handling [live + regression]

Live 2026-11-12 07:15:49Z on `95e7e6d` at (280,29,-40), during a daylight water-search climb.
Digging the stair headroom (280,32,-40) exposed a gravel column, and the gravel fell down the
bot's column. `clear_head` dug the head-level gravel three times over about 3 s (HP 20 to
14.2), but the lowest block landed in the feet cell. The saved region showed gravel at
(280,29,-40) with air above. Neither the reflex (eye level only) nor the under-feet guard
handled it: the guard counted a full block enclosing the feet as support. The gravel-filled
cave walls then refused every tunnel step, because gravel beside any step cell counted as a
hazard. Water deferral and `gather_diamonds` failed in place 26+ times.

`6f6286a`: the reflex also digs a falling block (gravel, sand, concrete powder) enclosing the
feet, and the guard skips a full block whose top is above the feet. Gravel and sand matter
only above an opened cell: beside a step they are ignored and inside a cell they are dug
through. A refill is dug again until the column is gone (`settleFalling`, which watches the
cell above and `falling_block` entities). Only a falling block seen above the bot's own
column refuses a step. One that starts to fall there is stopped by placing a block in the
opened cell. Bedrock is now a valid floor. Five regressions fail on the previous source.
504 tests pass.

Restart 07:22:17Z (the owner kit topped up one enchanted golden apple): the reflex dug the
feet gravel at 07:22:20Z, and `gather_diamonds` tunnelled away to (276,25,-40) at once. A
live refill dig and a stopped column fall have not been observed yet.

## F119 — Water treated as an opportunity while buckets are short [user direction + regression]

Live 2026-11-12 on `6f6286a`: at 07:23:08–15Z a `gather_diamonds` tunnel opened onto water
three times at (252,0,-41) and (250,0,-39) and plugged it each time. The user also saw a climb
dig up into water above the bot, which was treated as a hazard and deferred the water search.
In both cases the bot needed two water buckets and carried an empty one. The revealed source
is usually not yet in line of sight: it sits above the opened cell or behind one block, so a
plain scoop could not reach it.

`e7e85b6` (user direction: treat water opportunistically while it is on hold): when a tunnel
or probe dig reveals water and buckets are short, `takeRevealedWater` digs up to three blocks
on the line from the eye to the nearest source within reach. It then scoops with the empty
bucket and plugs the leftover flow. The tunnel segment ends as progress, not a failure. A
visible water source within bucket reach (`waterInReach`) outranks iron and routine work even
while the water search is deferred, and interrupts resource walks. `fill_water_bucket` now
searches 6 blocks underground by day so it finds that source. Three regressions (saved stall
geometry, water directly above the column, planner priority) fail on the previous source.
507 tests pass.

## F120 — Cooking furnace blocked the stairs before night shelter [live failure + regression + staged]

On LAN port 49503, `outputs/2026-11-12@22.14.28/bot.log` shows two surface
batches between 03:22:10Z and 03:23:53Z. After a short descent the bot loaded
pork at (28,67,238), inside its own stair route. The furnace blocked the return
stairs. The bot carved another exit, built a shelter at nightfall and failed
eight attempts to reach the furnace from below. The user reported five lost
porkchops. The log records four in the batch at that location.

The planner now carries the reserve to covered ground at foot-block Y=47 or
lower before starting routine Overworld cooking. Urgent meals can still cook
sooner. New underground cooking furnaces use a supported side recess. The
first staged trial recovered five supplied porkchops, but the furnace drop
remained in the single-block recess. The final two-block recess preserved both
adjacent stair steps. At night the trial bot continued mining at Y=48, selected
cooking at Y=47, walked to Y=46 and recovered all five cooked porkchops and the
furnace. See `outputs/cooking-recess-verified.json` for commands and source
hashes. Position and supplies were staged. Placement, cooking and collection
ran without commands. Both focused regressions failed before the fix and all
509 tests pass. The owner's kit requirement now explicitly covers test logins.

## F121 — A diamond below an overhang was forgotten after failed approaches

LAN 49503, `outputs/2026-11-12@22.14.28/bot.log`. At 03:38:13Z the bot
selected (150,7,258) from (141,-1,263) and timed out in 10 s after reaching
(150,3,259). At 03:40:49Z it saw the same ore and got `No path to the goal`.
Each failure blacklisted the block for 120 s. A creeper interrupted nearby
work, then the bot collected its iron and resumed lava search. The planner
remembered the progression objective but had no saved coordinates for the ore.

Inspection found two ore blocks at (150,7,258–259). Real block shapes and
pathfinder replay on the saved terrain showed that the old approach tried a
combined climb and dig under the overhang. The exact live jump trace was
not logged. The planner now saves a confirmed target per dimension through
occlusion, interruptions and failed approaches. It tries a supported dry walk,
then bounded stair segments from up to four sides, approaching the ore's
height before breaking it. After all sides fail, it saves the target and waits
120 s before retrying. A lava search can yield when the target becomes ready.

On the actual vein, staged position and tools reproduced the lost sight.
The first trial switched approaches and broke (150,7,258), but the drop
landed overhead. After adding the height check, the next trial approached
(150,7,259) from Y=3, reached (151,6,259), broke the second block and picked up
two diamonds. No commands assisted movement, mining or pickup after setup.
Evidence: `outputs/diamond-150-first-results.json` and
`outputs/diamond-150-live-results.json`. Combat cancellation was verified in
regression, not staged on the live vein.

## F122 — Deepslate blocked the bucket ray to a lava source

At 03:45:06Z, the bot timed out after using a bucket on the source at
(80,-41,294), then blacklisted it and resumed tunneling from (78,-42,293).
The terrain inspection and ray replay found deepslate at (79,-41,294) on
the centre ray and a clear ray to the source edge. The approach goal only
required proximity and the scoop always aimed at the centre.

Lava scoops now verify a ray from dry footing, try the edge, and reuse
the inventory-verified bucket use. If no ray works, a single reachable
rock can be dug from a supported position at least two columns away,
provided its removal opens the ray. Walking uses dry movements.
The real-block regression failed before the fix and covers both paths.

A staged LAN trial supplied the bucket and position, then filled it at
(77.5,-42,293.5) with no movement, digging or further commands. The server
confirmed Hot Stuff. See `outputs/lava-77-live-results.json`. The regular
bot separately earned Hot Stuff at 04:10:04Z on its original lava search.

## F123 — Spend available diamonds on armor during other work

In `outputs/2026-11-12@22.52.48/bot.log`, the bot carried 32 diamonds at
03:54:13Z, with a diamond pickaxe and sword, and kept searching for lava.
The first diamond chestplate was crafted only after Hot Stuff at 04:10:04Z
(`outputs/2026-11-12@23.06.16/bot.log`). The affordable armor check ran
after Hot Stuff, and the saved detour could also suppress armor upgrades.

With the pickaxe and sword ready, select the first affordable missing piece
in chestplate, leggings, helmet, boots order. Carried and worn pieces count,
including netherite upgrades. Craft before routine work and equip through the
existing armor action. Threats and an inventory with no free slot still take
precedence. Three updated regressions fail on the previous source.

On LAN 49503, ArmorTrial2 crafted and wore all four pieces before Hot Stuff
using 24 of 32 supplied diamonds. The successful setup used spare crafting
tables because the earlier trial failed to reclaim its table after leggings.
See `outputs/diamond-armor-live-results.json` for setup commands and results.

## F124 — Water search deferred after stair failures; berry detour preceded a fatal fall

At (32,-3,490), two stair-jump attempts timed out and a floor placement was
refused. At 04:14:50Z the bot deferred water search for five minutes. It held
27 diamonds, above the 16-diamond threshold for mining while deferred, so
the planner chose wait between berry opportunities. It did not have a
completed portal route. At 04:16:03Z a berry approach moved it off the stair
line. It was falling by the next wait action and died at (32,-51,489).
The log did not record which movement control initiated the fall.

The pathfinder's jump simulation accepted airborne proximity as success,
and the live waypoint loop could advance midair. The dependency patch
requires a landing on ground or in water to accept a simulated jump and
retains ladder waypoints. A manual stair jump now requires an adjacent
one-block rise, grounded takeoff, sound floors and jump headroom. Berry
routes use dry movement and supported interaction and pickup cells.
The regression for airborne jump acceptance fails before the patch. Exact
live fall reproduction remains pending.

## F125 — Cleanup throws wool, leather and wheat seeds

The user reported repeated cleanup while black wool, white wool, leather and
wheat seeds stayed carried. The keep rules retained at least three wool,
one leather and sixteen wheat seeds. Removing those limits lets the normal
cleanup pass throw all four stacks with the other junk. The historical
inventory and the cleanup action regressions failed before the change.

## F126 — Pickless bot sealed in night shelter digs out by hand

Live, `a581a73`, run `outputs/2026-11-12@23.28.48/`: the wooden pickaxe broke
during a y=31 tunnel (the stone pick had broken earlier), and the bot sealed a
night shelter at -4,31,-46. From dawn every `leave_shelter` failed with "no
safe supported shelter exit" and unstick failed with "mining requires a
pickaxe", every 2 s. The user thought it could craft a pickaxe; an
EffectHelper `/data get entity Bot Inventory` showed 1 oak plank,
no sticks, 104 cobblestone and 2 crafting tables, so the planner's
`gather_wood` route was right and nothing could make sticks. User direction:
when genuinely unable to craft a pickaxe, break stone with bare hands.
`pickaxeStranded(items)` is true without a carried pickaxe when planks plus
4 per log fall short of sticks (2 unless carried), a table (4 unless carried)
and either 3 cobblestone or 3 more planks. While stranded, the dig guard,
pathfinder break exclusion, shelter exit, `mineTunnel` and `returnSurface`
accept hand-diggable blocks (hardness <= 3.5, no `_ore`; stone 7.5 s, deepslate
15 s) with an empty hand; side probes are skipped and action timeouts are
multiplied by 4. Regression: `test/bare-hands.test.js` and the timing test in
`test/mining-timing.test.js` fail on the pre-fix source; four older fixtures
now carry three logs so they keep testing the refuse-while-craftable path.
Live hand-dig escape is unverified at commit time.

## F127 — Water buckets before lava; reachable glow berries only; no leather restock

User direction (2026-11-12): fill two water buckets before collecting lava.
Lava searches run near y=-54, so with the water already carried a large pool
can be cast into obsidian on the spot, with no surface round trip for water.
The `lava_bucket` step in `planAdvancement` now crafts or fills water buckets
until two are carried, then crafts a third bucket for lava. A deferred water
search still lets lava go first, so the bot does not sit idle.

The user also saw the bot try to pick glow berries that were far out of reach.
The F124 run (`outputs/2026-11-12@23.13.28`, 04:16:01Z) shows five vines tried
in 3 s, each one up to about 13 blocks away and failing with "No path" or "kept
its berries". The fatal 48-block fall came right after the last one. Fix: before
a vine is offered in `foodOpportunity`, and before `pickLocalGlowBerries`
approaches one, a single synchronous `getPathFromTo` search runs with dry
movements, a 50 ms timeout and the approach's own goal (a standable cell within
4.5 blocks of reach). The vine qualifies only on `success` with at most 24
moves. Otherwise it is blocked for 120 s.

Cleanup already threw every wool color, leather and all six seed types
(F125). A test now checks this against the real 26.1 food data. The base
vault still kept one leather on the bot and restocked one, which cleanup then
threw, so leather left both its carry and its restock levels.
Regression: the bucket, glow-berry and base tests fail on the pre-fix
source. The inventory test passes on both versions, since F125 already threw
these items. One lava-search decision fixture now carries two water buckets.
Not yet checked live.

## F128 — Enchanted tools crashed dig timing on 26.1 item components

Live, `4a0d52f`, run `outputs/2026-11-12@23.49.25/`: once the hand-carved
stairs reached y=37, the user gave the bot their enchanted netherite pickaxe.
After that, every `gather_iron` failed with "enchantments is not iterable" (20+
times). Cause: prismarine-item 1.18.0 `Item.enchants` returned the raw 26.1
`enchantments` component, `{ enchantments: [{ id, level }] }`. Mineflayer's
`digTime` passes that object to prismarine-block, which iterates over it. Any
enchanted held tool therefore threw before a dig started. The same object
also made `src/enchanting.js` read enchanted items as unenchanted, because an
object has no `.length`. Fix: `patches/prismarine-item+1.18.0.patch`
normalizes the component (and `stored_enchantments` for books) to
`[{ name, lvl }]` through `registry.enchantments[id].name`. Regression: a
network-shaped Efficiency V / Unbreaking III netherite pickaxe digs deepslate
at 150 ms, against 500 ms without Efficiency, in `test/mining-timing.test.js`.
The test fails with the patch reversed. `miningPickaxe` already prefers
netherite, then diamond, iron, stone and wooden. The pickaxe was supplied by
the user, so progress made with it is assisted.

## F129 — Surface scouts walked down own stairs; placements overlapped the bot; lane tosses re-collected

Live, `01d17da`, run `outputs/2026-11-13@00.06.37/`. The user saw the bot go
up and down its staircase repeatedly. At the stair top (-57..-61, 72..76,
-85), `gather_wood` scouted for trees with a `GoalNearXZ`, which accepts any
height, toward x of about -25 to -47. A* walked back down the bot's own
staircase to y=44..62, and the next `return_surface` climbed up again. This
happened four times (05:13-05:16Z). Fix: a scout that starts with its head
open to sky adds a temporary step exclusion to the active movements, so each
step must also be open to sky (cost 100 otherwise; leaves do not count as
cover). The exclusion is removed afterwards. Underground scouts, such as
unstick, are unchanged.

The user then saw the bot stuck placing cobblestone. `return_surface` failed
136 times with "Server refused to place cobblestone at (-46, 61, -85)". The
bot stood at x=-44.876, z=-84.329. Its 0.6-wide hitbox reached into the
stair-floor cell beside its feet, and the server refuses a block that would
intersect the placer. Fix: `placeSurvivalBlock` checks `overlapsBody`. When
the target is not the bot's own column, it first sneaks the bot to the centre
of its own cell, and it throws if the overlap remains.

Open: each surface cleanup at the stair top threw about 390 cobblestone,
cobbled deepslate and junk along a toss lane. The next scout walked that lane
and picked everything up again (the server inventory still held it all at
05:20Z). Staged probe (`outputs/toss-probe.js`, player TossProbe, owner kit
verified first, commands and replies in `outputs/toss-probe-results.json`):
tosses go through with and without an enchanted netherite pickaxe carried
(128 -> 64 both times), and a probe that stands still re-collects its own
stack. So disposal drops need to land where later routes do not pass, or be
avoided by those routes.

Update (same session): disposal fixed. A lane toss records a zone around its
landing spot (start + 3 along the lane), and an in-place drop records one at
the start cell. Each zone lasts the 5 min item despawn time and has a
3-block radius (within 2 blocks vertically), and `configureSafeMovements`
charges each walking step inside it a cost of 20. It is a cost rather than a
ban, so a one-wide tunnel through a drop stays passable. Pit drops lie out
of pickup reach and record no zone. Regression in `test/inventory.test.js`.

## F130 — Unreachable zombie froze repeated fights

Live, `01d17da`, run `outputs/2026-11-13@00.06.37/`, 05:23:25-05:24:07Z, as
the user reported: a zombie 5.8 blocks away across a ravine could not reach
the bot. `fight` awaits a melee mob between 3.1 and 6 blocks off, so the bot
stood still until the 12 s movement watchdog cancelled it ("fight is
stuck"). With `hostileDistance <= 6`, the same fight was chosen again four
times. Fix: while awaiting a melee mob, if it gains less than 0.5 blocks in
4 s, `rememberStandoff` stores its distance for 60 s and the fight ends
("not approaching; standing down"). A 5 s unreachable charge records one too.
While the standoff holds, `nearestEntity` and the nearby-hostile interrupt
skip that entity unless it comes 1 block closer than the recorded distance.
Archers are never stood down, since they shoot across gaps. Regression:
`test/survival-safety.test.js` fails on the pre-fix source. Not yet seen
live.

## F131 — Vanilla 5-tick destroy delay between timed breaks

User report: with the same Efficiency V netherite pickaxe, the owner mines
stone noticeably slower than the bot carves stairs. Per-block break times
already matched vanilla: Mineflayer uses the game formula (multiplier 9 plus
level squared plus 1), giving 100 ms for stone, 150 ms for deepslate and
350 ms airborne. The Java protocol has the client decide when a break
finishes, and the server only rejects a finish that comes much too early. The
gap is the vanilla client's `destroyDelay`: after a break that took more
than one tick, the next block waits 5 ticks (250 ms) while attack is held.
Mineflayer skips it, so the bot needed about 0.10 s per stone block against
the player's 0.35 s, about 3.5x faster; the live stairs showed about 20
blocks in 3.6 s. Instant breaks (where `digTime` returns 0) set no delay,
as in vanilla. The user asked to match vanilla. The `bot.dig` wrapper now
waits until 250 ms have passed since the last timed break, and time spent
walking counts toward the wait. Regression in `test/mining-timing.test.js`
fails on the pre-fix source. The tier-timing test now lets the delay pass
between blocks. Expected cost: Efficiency V netherite on stone goes from
0.10 to 0.35 s per block, and a stone pickaxe from 0.60 to 0.85 s.

## F132 — Sculk zone blocked every tunnel step, including the way out

Live, runs `outputs/2026-11-13@00.24.09/` to `00.34.18/`. At 05:25:52Z sculk
caution saw a sculk vein at (-76,-44,-13) and recorded a zone of radius 48
there. `isBlockedTarget` treats every cell in a zone as blocked, and
`mineTunnel` checks it for each candidate step, so no tunnel step anywhere in
the zone could be dug, not even one leading out. `flee_sculk` only walks
(pathfinder, 45 s). It timed out seven times without leaving
-64,-26,-10, and unstick reported "0 unsafe, 0 already excavated, 6 blocked".
After two restarts the bot was at -49,-11,-6, still 43 blocks from the
centre. With caution cleared by the restart, `return_surface` failed the same
way 18 times. Fix: `mineTunnel` asks `rememberedBlocked` (failures only) plus
`sculkInward`, which blocks a step only if it does not gain distance from
every zone that contains it. `fleeSculk` now walks for 20 s, then carves 4
rising steps toward a point 16 blocks out from the zone centre. Sensors and
shriekers stay unbreakable on the walking path. Ore and target searches still
treat a zone as off-limits. Regression in `test/sculk-caution.test.js`
(geometry, a real `mineTunnel` climbing out, flee fallback) fails on the
pre-fix source. Not yet seen live.

## F133 — Submerged log dig retried after every breath

Live, new world on port 50636, run `outputs/2026-11-13@00.44.57/` (started
outside this session), 05:45Z. The fresh bot had empty hands, and its nearest
oak had its trunk under water at 72,61..63,-35. It dug bare-handed while
submerged. Mineflayer's dig time is 3 s by hand, 5x slower with the eye in
water and 5x again while floating. The air guard cancelled the dig at 12
bubbles, `surface_for_air` took a breath, and `gather_wood` chose the same
log again. This repeated every ~8 s, and the cancelled dig restarted from zero
each time. A cancel is an abort, so `gatherWood` never blocked the tree.
Fix: before a collection dig, `collectTarget` compares `bot.digTime` with
`submergedAirMs`: the bubbles left above the 12-bubble cutoff times 750 ms,
or Infinity with the eye out of water. A longer dig throws "underwater dig
... needs Ns", and `gatherWood` then blocks the whole trunk for 120 s like
any other failure. A stone axe under water (about 3.75 s) still fits within
6 s of air. Regression in `test/leaf-vision.test.js` fails on the pre-fix
source. Its world fixture now floors positions, as Mineflayer's `blockAt`
does. Not yet seen live.

## F134 — Water impassable inside the path cost budget; swamp trees blocked

Live, run `outputs/2026-11-13@00.53.57/` (port 50636, new world): after F133
the bot stayed at its water spawn (73,61,-35). Every tree failed with "unsafe
block to mine" or "No path", and every land scout and unstick failed within
about 20 ms. A read-only EffectHelper map (`outputs/inspect-water-spawn.js`,
`outputs/water-spawn-map.json`) showed a flooded swamp: water was the top
block in 1199 of 1681 columns of a 41x41 area, 2 deep (y=61-62 over dirt at
60), with oaks standing in it. A bot walking the bottom has its head under
water. Replaying the bot's own path searches on those chunks
(`outputs/inspect-water-paths.js`, logs `water-paths*.log`) found three
causes:
1. `pathfinder.searchRadius = 48` also caps A*'s cost above the start
   heuristic (`maxCost = h + searchRadius`). At `liquidCost = 50`, a single
   water step used the whole slack, so water was impassable. The only paths
   left tunnelled under the water bed (ending at y=58), which the F129
   sky-bound scout bans.
2. `unstick` used `dryMovements`, whose DANGER set avoids water, so from
   inside water it found no first step (noPath, 1 node visited).
3. The nearest log was the trunk base beside the water. `dontCreateFlow`
   refused it, and the failure blocked the whole tree for 120 s.
Fix: `liquidCost` 3 still prefers land. `gotoWithTimeout` drops it to 1
while the bot is in water, since at 3 the slack ends a swim after about 16
cells. Unstick from water no longer avoids water. Wood targets and trunk logs
must pass `safeToBreak`. After the fix the replay gives success to the near
targets from both the surface and the bottom, and partial paths toward 47,-10.
Regression in `test/mobility-recovery.test.js` (the real A* on a 20-cell
2-deep strip, unstick movements, swamp logs) fails on the pre-fix source.

Update (same session, run `outputs/2026-11-13@01.02.05/`): with the path
fixes loaded, the bot still lost its air every ~8 s. It stood still on the
swamp floor at 73,61,-35 while it searched and approached, because nothing
held jump unless a path was moving. The low-air cancel came before the 10 s
approach timeout, so the tree was not blocked. Following the user's
suggestion to hold space, a physicsTick handler now holds jump whenever the
body is in water and no path is moving. Surfacing, lava escape and head
clearing keep their own control, and jump is released once a path takes
over. A low-air abort now blocks the whole trunk, like any other wood
failure. The user also suggested standing on a lily pad or swimming to land.
`safeFooting` already accepts a lily pad as floor (its 1/16-high collision
box), and F134's swim fix lets the scout reach land. Regression tests in
`test/mobility-recovery.test.js` fail on the pre-fix source.

## F135 — Reach dry land first after every Overworld spawn

User direction (2026-11-13). The F134 treading fix worked, but the user found
it far too slow: in the swamp the bot cut log after log while holding jump
in water. Rule: after each spawn or respawn in the Overworld, the first goal
is to stand on a ground block (soil, sand, gravel or rock; the pattern is
`LAND_GROUND`) with no water in the feet cell. `spawn` sets `landPending`.
`needsLand()` clears it once the bot is on the ground and out of water. The
planner returns `reach_land` after the air, lava, sculk, crowd and melee
reflexes and before any other work. `reachLand` uses `findBlocks` (sorted by
distance, radius 48) to find ground with two dry, empty cells above it, and
tries the nearest 3 with a 20 s `GoalBlock` each, blocking any that fail.
With no ground loaded it scouts, and after 6 attempts it gives up the goal so
work can resume. In the Nether the goal does nothing. Regression in
`test/mobility-recovery.test.js` (priority, nearest shore rather than the
dirt under the water, scout and give-up) fails on the pre-fix source.

Update (same session). Staged check (teleport to 73.5,62,-34.5, then a
restart on `2a3ced7`): `reach_land` chose dirt at y=59-60 with air above it.
These were pockets below the swamp surface with water all round, so the bot
reached them and still touched water. It cycled through them, with two 20 s
timeouts. The landing cell must now be dry and empty, along with the cell
above it, and none of its 4 neighbours may hold water. User additions: if
reaching land took a swim, the bot first digs dirt or grass until it carries
16 building blocks (`stock_blocks`; it gives up if no dirt is reachable).
`gatherWood` calls `buildLogPlatform` when the bot is in water or the log
sits on water. If no dry standable cell lies within reach of the log, it
places a building block on the water surface beside the trunk (against a
solid side face) and stands on it to chop. With no block carried it throws,
and the tree is blocked. Regression tests (dry pocket, stock, platform)
fail on the pre-fix source.

Update (same session, user report): the second staged run still targeted
swamp-floor dirt at y=60. Its two cells above held seagrass and tall
seagrass, which are always full of water but have no `waterlogged` property
and are not named water. `waterFilled` now treats water, bubble columns,
seagrass, tall seagrass, kelp and kelp plants as water, as well as anything
waterlogged. The land check, `standsOnLand` and the F133 eye-in-water check
all use it. The regression test fails on the pre-fix source.

Update (same session, user report; world remade, run
`outputs/2026-11-13@01.28.21/`). The bot spawned on a tree top (oak leaves
at 60,69,-36, grass at y=62). Every land route failed within milliseconds
("No path"), because the safe movements never dig straight down and allow at
most a 2-block drop. The 6-attempt give-up fired after 9 s. The bot then got
wood and a wooden pickaxe and ended up on a stump in water, with the goal
gone. User rule: until the bot has stood on dry ground, that stays the
primary goal. Fix: the give-up is removed, and a failed attempt now scouts
instead. While the block underfoot is a tree part (leaves, log, wood,
vines, mangrove roots), `descendFromCanopy` digs it and drops a level, but
only onto water or a fall of 3 or less, and never onto lava, fire or magma.
`canopyDescent` lets the dig wrapper mine straight down for this. The land
trip swims at water cost 1 even when the bot itself is not in water (it was
on a stump). Regression tests (no lapse, swim cost, canopy descent) fail on
the pre-fix source.

Update (same session, user direction): the 06:36Z live "land" at 63,62,-4
was a tiny island. Land now means a ground block in a large land mass.
`landMassSize` runs an iterative DFS over exposed ground (a ground block
under a dry, empty cell) joined by faces, edges or corners (26 neighbours).
It stops at 1000, and every visited cell shares the result, so an island is
searched only once. Reach-land candidates (now up to 256 within 48 blocks)
must belong to a mass of at least 1000, and `standsOnLand` requires one too,
so standing on an island no longer completes the goal. Live inspection
(`outputs/inspect-land-mass.js`, `outputs/land-mass.log`): 63,62,-4 was in
a mass of 2 and 68,62,-3 in one of 11. Of 202 candidates near the stump, 118
lay on large masses; the nearest was 91,62,-53. The search took 727 ms. The
regression test fails on the pre-fix source.

Update (same session): the live restart on `97b850b` scouted from the
island, then stalled on a 42-block land trip from 67,63,-16 to 94,62,-49
("is stuck", then "No path"). A replay on the real chunks
(`outputs/inspect-land-path.js`, `outputs/land-path.log`) found that trip
at both cost slacks (48 and 192: 35 steps, cost 68), so the stall happened
while following the path, not in the search; still unexplained. `aca2456`
widens the candidate radius to 96 and lands trips' slack to 192 as
headroom. By the next restart the bot had reached 88,62,-62. It completed the
goal on grass at 91,62,-59 (a large mass) within 2.5 s and moved on to wood.

## F136 — Pathfinder treated seagrass and kelp as air

User report (run `outputs/2026-11-13@01.50.57/`): land trips stall while the
bot swims through seagrass. mineflayer-pathfinder `Movements` registers only
water and lava in `liquids`. Seagrass, tall seagrass, kelp, kelp plant and
bubble columns have empty collision boxes, so the planner treated them as
open air and planned walks and jumps through them. prismarine-physics counts
the same blocks as water (`waterLike`), so the bot was actually swimming,
could not perform the planned moves, and stalled. This explains the
unexplained F135 stall, where a replay found the path but the live
follow-through failed. Fix: `waterPlantsAsWater` adds those blocks to
`liquids` in `configureSafeMovements` and in `dryMovements`, and
`dryMovements` also avoids them as it avoids water. Unstick from water lifts
that avoidance. The same run also spawned the bot on leaves again: it was in
mid-jump when `reachLand` checked, so the canopy descent was skipped. It now
waits up to 1.5 s for the bot to land on ground or water. The regression
test (real `Movements`) fails on the pre-fix source.

Update (same session). Staged check on `bb6e73b`, port 50902 (teleport into
the seagrass swamp at 67.5,62,-20.5, then restart): the bot swam from
72,62,-26 to mainland grass at 93,63,-50, about 32 blocks in 21 s, with no
stall. The first candidate's fixed 20 s timeout expired on arrival, so a
land trip now gets 1.2 s per block of straight-line distance, with 20 s as
the floor.

## F137 — Returning underground players no longer repeat the initial land search

On port 51391, `136b1c2` logged in with eight confirmed advancements and
stone and iron picks at 52,16,-95. `spawn` re-armed `landPending`. Land
scouting used an XZ-only goal and carved near Y=16 through repeated 25 s
timeouts. It never selected the `mine_iron` detour while seeking land. The
old run eventually chose deepslate at Y=-4 and reported success at
53,-3,-55, still underground (`outputs/2026-11-13@21.17.15/bot.log`).

User clarification: dry land is the first goal for a fresh player. Once
completed it survives death, reconnects and script restarts on that world.
`landReached` is saved with world memory and resets with a changed seed.
Without `MC_WORLD_ID`, the milestone alone persists by username and server
seed hash. Existing saves migrate from completed non-recipe advancements or
items in player slots, including worn gear. An explicitly pending milestone
survives later pickups or advancements until the bot stands on land. The
land search rejects covered destinations and requires open sky to complete.
An underground land seeker uses the existing surface-return skill and can
collect visible safe iron between climb segments. Threats, meals, tool
rebuilds and a necessary inventory clear take precedence underground.

Live restart on 51391 in Terminal window 2250 at 21:28:28 ET. The bot resumed
`gather_iron` at 1,16,-57 and wrote `landReached: true` to the existing world
save. The owner-kit helper checked eight enchanted items, 64 enchanted golden
apples and both infinite effects (`outputs/f137-owner-kit.log`). It added
nothing. There were no gameplay setup commands. Fresh underground climbing
and iron selection are covered by regressions. All three new regressions
failed before their fixes, and the full 553-test suite and syntax checks passed.

## F138 — Wait for two empty buckets before the first water scoop

User direction, 2026-11-13. The port 51391 bot began `fill_water_bucket`
with one empty bucket and no filled buckets (`outputs/2026-11-13@21.28.28/`,
21:42:06 ET). The planner and both water-opportunity paths accepted a
single empty. The craft action also requested a total of one item, so
choosing the same bucket recipe again would do nothing.

The planner budgets three ingots per missing bucket and passes the desired
empty count through to the existing crafting skill. Normal searches, visible
opportunities and water exposed by a dig use the same requirement. Start with
two empties if neither is filled, or one empty when one is already full.
Deferring the water search still allows crafting a missing bucket. Regressions
cover both recipe paths, the second scoop and opportunistic water. There are
554 passing tests and syntax checks pass.

Restarted on 51391 in Terminal window 2250 at 21:48:17 ET
(`outputs/2026-11-13@21.48.17/`). The bot had one empty bucket, one ingot and
16 raw iron. It started a smelt for the missing bucket. The owner kit helper
added one enchanted golden apple and verified the kit
(`outputs/f138-owner-kit.log`). No bot supplies were staged.

The smelt finished at 21:51:53 ET. After rebuilding its iron pick and
crafting diamond tools, the bot made the second bucket at 21:53:04 ET.
The inventory count rose from one empty to two before `fill_water_bucket`
resumed (`outputs/2026-11-13@21.48.17/bot.log`).

## F139 — Cave diamonds needed a longer supported walk and independent cooldowns

User reported two exposed veins near -136,-37,-25 and -129,-39,-34. At
21:48:35 ET on port 51391, the cave survey yielded to a diamond at
-137,-37,-26. Its dry approach timed out after four seconds. Four carved
approaches then failed, two after exposing water. The old cooldown checked
the nearest ore after selection. When that ore was on cooldown it could
hide another valid visible target.

EffectHelper inspected the live terrain after verifying the owner kit.
Pathfinder replay found a 27-step dry walk to the first ore from the survey
area. From the lower passage it found the second vein in line of sight and
a 5–9-step route to several blocks. Only EffectHelper was moved. Commands,
replies and paths are in `outputs/f139-diamond-inspection.json`.

The direct approach now has 15 seconds, retries a dry walk after the
cooldown, and advances the staircase side explicitly when a side fails.
Cooldowns are recorded by dimension and position and filtered out during
ore selection. The two new regressions failed before the fix.

Before the restart onto this fix, the bot mined the first recorded block
at 21:52:32 ET and logged a failed pickup. It then mined five blocks from
the second vein, collected five diamonds and earned the server-confirmed
Diamonds! advancement. It used the diamonds for a pickaxe and a sword.
No gameplay commands assisted that run. The original drop pickup remains a
separate failure. Evidence is in `outputs/2026-11-13@21.48.17/bot.log`.

## F140 — Mined diamonds get a longer pickup and a separate retry

User pointed out the first drop was left after the bot mined it. The log
at 21:52:40 ET confirms an eight-second pickup timeout at -137,-37,-26
before the bot moved on to the second vein. The generic pickup path logged
the failure and dropped its reference as soon as the mining action ended.

Diamond drops now get 45 seconds to approach. The mining action's total
budget accounts for the approach and pickup. The short movement watchdog
leaves the diamond pickup's own deadline in charge. A still-loaded missed
diamond is remembered by position and dimension, with a single dry retry
ahead of routine work if safe. A cancelled retry stays eligible. Regression
reproduces the old timeout and verifies pickup priority and emergency
preemption. All 557 tests and syntax checks passed.

Restarted in window 2250 at 21:58:21 ET with owner kit verified and no
supplies added (`outputs/f140-owner-kit.log`). The bot had one empty and
one water bucket. The original diamond drop was created before tracking
was enabled. No successful recovery of that item was observed.

## F141 — Seal staircase leaks and abandon flooded routes

At 21:55:36 ET on 51391, a staircase dig filled a bucket from
-173,5,-35, then the bot lost roughly 40 blocks of elevation while trying
to continue mining. The post-scoop plug silently swallowed placement failure
and ignored extra cuts made by the scoop routine. The return planner could
still select flooded waypoints. Live terrain inspection found the remaining
source at -173,4,-35 feeding -172,4,-35, then water falling down the staircase.
See `outputs/f141-water-inspection.json` and `outputs/2026-11-13@21.53.48/`.

The tunnel, side probe and shaft repair verify that each liquid plug is a
solid block. The scoop path tracks and seals additional openings touching
liquid. Confirmed plugs are protected against re-digging. Flooded stair
waypoints are skipped. In an underground current the bot clears its mining
frontier, tries one reachable upstream plug, then seeks dry footing with
bounded downstream movement. Oxygen and combat reflexes retain priority.
The three new regressions fail before the patch and pass afterwards.

The original staircase was repaired with a cobblestone block at -172,4,-35.
Inspection confirmed downstream drainage. EffectHelper issued and recorded
the repair command. A separate trial reproduced the current and autonomously
placed a downstream plug at -169,1,-35. The controller initially tried to
move before the water drained. The final trial supplied eight cobblestone
and staged only the start in the same current. FloodTrial placed its own
plug at -169,2,-35 and reached dry footing at -155,-11,-36 without a command
between those actions. EffectHelper then restored the inlet plug at
-172,4,-35 and verified that the downstream staircase drained. Commands
and positions are in `outputs/f141-live-source.json`. All 560 tests pass.

## F142 — Remember lava sources and reuse a casting pit off the path

At the first pool, the bot picked up obsidian four and filled a bucket again
at -245,-55,-43. Then the first geometrically suitable casting bank had no
walking path. Three errors triggered generic relocation with the full lava
bucket. At the second pool, the eighth pickup left the bot at -237,-56,-109.
The next search saw no source from that position and started another tunnel.
Spectator inspection found 73 and 78 source blocks in the two surveyed
volumes, including blocks behind rock. Evidence is in
`outputs/2026-11-13@22.15.56/bot.log` and `outputs/f142-lava-inspection.json`.

Remember up to ten nearby visible level-zero lava cells in dimension-scoped
world memory, recheck them before use, and replenish the list as cells are
scooped. Prefer a dry bank with a verified bucket ray and try other sources
in the pool on path failure. Find a reachable contained side pit that leaves
the walking floor intact. Scoop the cooling water, pick up the obsidian, then
use the existing one-block pillar step to get back to the bank. Reuse the pit
and its support for the next cast.

The first staging teleport put the bot above a floor opening and led to a
lava death during startup. EffectHelper recovered 14 dropped entities and
restored missing items from the prior snapshot, including eight obsidian.
The retry placed the bot on confirmed dry deepslate at -238,-54,-109. It
remembered ten visible sources, scooped two without further commands and
cast both at -236,-57,-110. It ended with ten obsidian and both water
buckets at -237,-55,-110. See `outputs/2026-11-13@22.33.58/bot.log` lines
144–158 and `outputs/f142-lava-{live-setup,recovery,retry}.json`. A full
ten-cast run from zero remains unverified.

## F143 — Route around sealed ceiling plugs when returning to the surface

After reaching ten obsidian the bot cut a new staircase. Water kept entering
it around Y=19. The bot sealed those openings and eventually stalled at
-229,19,-186. Every rising direction required cutting a known ceiling plug
in its current column. The planner discovered the plug only after selecting a
step and repeatedly quarantined innocent neighboring steps. It also rejected
side passages marked as excavated even when only the head cell had been dug.

Use the same clearance cells for planning and digging. Reject any step whose
cut intersects a known plug, keep the execution guard, and let a surfacing bot
use other dry level cells while excluding the immediate previous step. The
focused regression reproduces the shared plug and partially dug detour.

After the owner kit check, the bot restarted at the exact stuck position.
It took the south-side detour, sealed two newly revealed leaks, gained
elevation on the east dry staircase, and kept all ten obsidian. No teleport
or terrain command assisted its return. See `outputs/f143-return-inspection.json`
and `outputs/2026-11-13@22.55.02/bot.log`.

## F144 — Swim to dry ground when portal preparation starts in water

F143 cleared the Y=19 blockage and reached the ocean surface at -203,62,-184
with ten obsidian and full health. The portal task found no dry platform and
called the general land scout, which repeatedly rejected all open-water routes.
With no known portal and the bot in water, portal preparation now calls the
same `reachLand` routine used by the first-spawn objective. It uses the existing
dry-ground and land-mass checks and the swimming path budget. World startup
still honors its one-time land milestone. The focused test fails on the old
portal code and passes after the change. After the owner-kit check, the live
bot restarted in the same water, swam roughly 29 blocks and stood on sand at
-192,63,-211 at 22:58:30 ET. It used the ten obsidian to build the portal,
earned the server-confirmed We Need to Go Deeper advancement, and returned
to the Overworld through the portal, all at full health. See
`outputs/owner-kit-f144.json` and `outputs/2026-11-13@22.58.12/bot.log`.

## F145 — Stand on a surface-water platform before cutting a water-ringed trunk

An upper log selected from dry ground bypassed the platform trigger because
its bottom neighbor was another log. The previous platform search also gave
up when a nearby dry bank was within reach. The regression calls the normal
wood action from a nearby bank and checks placement and footing before
collection. It fails on the previous version.

Check the vertical log column for a four-sided surface-water ring. Use a
cardinal surface cell against that log face and a low-cost solid block such
as dirt, cobblestone or planks. Approach and mount with a swimming path that
cannot dig. Verify the block and dry grounded footing before chopping.
A bot-placed platform beside three remaining wet sides can be reused.

TrunkTrial was supplied an axe, oak logs and planks and placed on the bank
near a natural swamp oak. No terrain commands were used. The wood action
placed planks at 77,62,2 beside the stump at 77,62,1. It was dry and
grounded at 77,63,2 during all three recorded cuts. One drop landed out of
reach. See `outputs/f145-tree-trial.json` and
`outputs/2026-11-13@23.06.47/tree-platform.log`.

## F146 — Use swimming routes for combat and retreat

On port 51391, combat began at 20 HP near -96,21,-257. After dropping into
a submerged cave, the bot stayed near -96,16,-257 under skeleton arrows.
The charge used movements that rejected water. Retreat then installed the
same dry movements and tried unsupported cover placements while the bot
treaded water. It died at -98,16,-255. See
`outputs/2026-11-13@23.08.11/bot.log` at 23:10:36–23:11:04 ET.

Water fights use non-digging movements that admit water and aquatic plants,
strike visible mobs already in sword reach and use unobstructed swimming
lanes to kite. A stalled charge or a wounded retreat can swim away.
A retreat that gained at least three blocks can return to the planner when
there is no path farther. The air reflex still takes priority. The three
focused regressions fail on the old source and pass with the change.

The staged LAN pond rounds used an iron-armored trial player with a diamond
sword and shield. The lone drowned died with 20 HP remaining. The skeleton
and bogged both died with 16.03 HP remaining. A mixed drowned and skeleton
round landed seven swings in water and finished at 19.12 HP. In the first
wounded round it swam four blocks without losing HP, then the tank wall
blocked the next leg. The owner returned to the saved position and the
temporary arena was removed. Setup commands, movement, and attacks are in
`outputs/f146-water-combat-first.json` and
`outputs/f146-water-combat-second.json`.

The next wounded round moved 4.5 blocks at 7 HP with no further damage or
path error. A healthy round exposed a one-tick dry-physics reading while the
feet cell still held water. The final controller treats either signal as
swimming. This last adjustment has a focused regression and was loaded by
the regular bot at 23:20:28 ET. The terrain at the original cave death
location was not replayed. See `outputs/f146-water-combat-final.json`.

## F147 — Leave water-heavy surface biomes before seeking mainland or wood

The empty-handed bot repeatedly targeted water-bound trunks from a swamp
canopy at 77,68,-33. It had previously completed the world's initial land
milestone, so the existing first-spawn travel could not break the loop.
See `outputs/2026-11-13@23.20.28/bot.log`.

Mojang's biome guide and the pinned Java registry identify swamps and
mangrove swamps, rivers and frozen rivers, and all ocean variants. The
user also classifies beach and snowy beach as ocean-side. Stony shore can
qualify for the exit. The biome action precedes the initial land goal and
resource work. It holds a cardinal heading across multiple legs, follows
the prior biome's ocean boundary, and waits for actual solid footing in a
different biome. The separate first-spawn goal still applies its mainland
check when pending. Loaded biome data is sampled at surface level; unknown
chunks cannot certify an exit. Tree selection skips a route with more than
eight consecutive blocks of swimming.

The regular bot restarted at the original canopy without a teleport,
traveled east, entered forest while still swimming, then stopped on solid
ground at 126,63,-33 and gathered wood. See
`outputs/2026-11-13@23.27.28/bot.log`. The staged river-mouth trials used
the natural interface at 48,62,32 and a heading toward ocean. No terrain
commands modified the interface. The trial followed river and beach
segments, and continued after entering windswept savanna while afloat.
The bounded live runs ended before confirming an on-foot coastal exit.
The regression tests verify that completion, heading continuity, beach
handling, and the tree-route limit.

## F148 — Drop caution after a 22-block dig-then-diagonal-jump fall

Live failure, `outputs/2026-11-14@00.06.16/bot.log` 05:10:39Z: during a
gather_wood land scout from -7,79,-110 toward 7,79,-143 the bot fell to
-7,57,-112 and died at full health (hp 20 to 0, no threats). The user saw
it dig dirt to make a landing block and then jump diagonally. Inspection:
`getMoveDiagonal` in mineflayer-pathfinder 2.4.5 emits a jump-up-by-one
diagonal that breaks corner and headroom blocks, and the movement monitor
then sprint-jumps or walk-jumps it with no check on what lies beside the
route. Parkour was already off.

User direction, refined twice: be careful with jumps and digging moves near
a big drop, checked within ±2 in x and z (first ±5, cut so navigation does
not slow) with a 10-block threshold (first 4, then 8, both judged too strict). A first
version keyed on the tallest neighbouring block. That cannot fire on a
jump-up, since the block being jumped onto sits beside the bot at foot
height, nor on a cliff edge, since the ground behind is tallest. The user
wants both treated as dangerous, so the rule keys on the deepest column:
a spot is near a drop when any neighbouring column (not the bot's own) is
air from head height down to 10 below the support block. Unloaded blocks
count as solid. Near a drop the pathfinder drops diagonal moves from or
onto the spot, cardinal jump-ups with blocks to break, and sprinting (the
`allowSprinting` getter reads the bot's current block each tick). Plain
cardinal jumps, walks and drops stay. `src/drop-caution.js` is applied in
`configureSafeMovements` and `dryMovements`.

Cost, MacBookPro, Node 24.12.0, synthetic rolling hills with mock blocks,
A* to 8 goals 40 blocks away, 5 interleaved repetitions after warm-up,
n = 40 each, two runs: 51.0 ± 10.9 vs 58.4 ± 12.2 ms and 49.3 ± 9.5 vs
56.0 ± 10.5 ms (unguarded vs guarded), identical paths. Results are cached
per column and per spot for 1 s. Regression only; no live trial yet. Not
probed in the world: the drop beside -7,79,-110.
