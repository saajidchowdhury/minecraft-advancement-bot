# Validation

Live tests: 2026-11-04–06, America/New_York. Host: MacBookPro. Minecraft Java 26.1.2, LAN protocol 775, bot identity AdvancementBot. The original minecraft-iris directory was preserved.

F094 passes 390 tests and syntax checks. Three new policy/descent regressions
and two strengthened movement regressions fail on the old source. Eight new
component tests exercise the crowd latch, immediate interruption, two-block
wall sealing, inward continuation, retry after an obstructed seal, unsupported
gap refusal, cancellation and combat movement. These new component tests are
specifications for the new refuge skill. Staged LAN trial on 5c76964 supplied
iron gear and released three zombies plus a skeleton in a roofed corridor.
The bot ran 24 supported steps, placed exactly two sealing blocks, then
mined inward four steps at 20 HP with no attacks or scaffolding. Commands
were limited to setup and cleanup. Test mobs, supplied gear and temporary
arena were removed; cleanup guarded against any player above the footprint.
Natural large-cave behavior and a live blocked-seal retry remain unverified.

F093 passes 379 tests and syntax checks. Three regressions fail on the old
source: equip carried armor/shield despite missing tool materials, craft a
ready replacement before a shelter wait, and use a wooden backup for coal or
stone while nighttime wood resupply waits. Urgent danger still wins, and
no-tool/low-health shelters still wait. Natural restart on 39f5df1 equipped
diamond helmet, iron chestplate/leggings/boots and shield, escaped its shelter
and returned from Y=45 to Y=60 for daytime wood resupply at full health/food.
All runtime source hashes match. No commands staged this restart; wooden-pick
night mining remains covered by automated regressions only.

F092 adds two moving-item pickup regressions, bringing the suite to 376.
Both fail on the pre-fix source. Live inspection confirms the leaf sight
change works; a subsequent pickup timeout had quarantined the remaining logs.

F090/F091 pass 374 tests and syntax checks. Five new leaf-vision regressions
use actual block shapes and the Prismarine ray iterator; six drowning/station
regressions cover interruption, direct swimming and safe workstation handling.
All eleven fail on the pre-fix sources. The old air-rescue fixture now verifies
restored air with continuous swim control rather than a navigation request.
A command-positioned natural-pond trial survived ascent from Y=54 to Y=62.2
without rescue damage. A full-air repeat interrupted work at 12/20 air and
restored at least 18/20; the server confirmed initial Air=300. Drops were
preserved/recovered by external commands;
this is staged safety evidence. Natural canopy harvesting remains pending.

F089 passes 363 tests and syntax checks. Eight water-search regressions fail
on the pre-fix source and pass now: falsely reported surface state, underground
night search, blocked night search, lower surface, covered-path restrictions,
full-column sky checks, nightfall interruption and cancellation without
quarantining a usable water source. A cave-route regression
checks the supplied cover restriction. A natural daylight run continued from Y=66 to a real exit at Y=70 and filled
a water bucket without commands. Live nighttime searching and the sunset
interrupt remain observation targets. No new world structures were staged.

F088 passes 354 tests and syntax checks. Six routing regressions fail on the
pre-fix source and pass after the stable-heading/frontier change; an additional
check covers cancellation before a return. The 6x7 replay advances straight.
A command-staged LAN test returned from a detour with digging disabled, crossed
a remembered passage and advanced sixteen straight steps at full health.
Natural ore-detour return and hazard bypass remain observation targets. The
cleanup incident and dropped-item recovery are documented in findings.md.

F087 adds a regression verifying four intervening main-tunnel blocks between
five-block side branches. The old eight-step default fails; the new five-step
interval passes. All 347 tests and syntax checks pass.

F086 passes 346 tests and syntax checks. Eleven regressions cover enderman
hit interrupts, refuge priority and cancellation, neutral/angry metadata,
dimension isolation, face avoidance including long-range gaze, follow-mode
interruption, water replacement, an occupied-shaft side refuge and threat
persistence beyond sixty seconds. All eleven fail on the pre-fix source.

Command-staged LAN tests on port 52171 supplied iron gear and spawned
endermen. Neutral face-aim requests stayed safe; water, stone/no-water and
occupied-shaft trials ended in verified enclosures at full health without
attacking. Earlier trials exposed water flooding and a refused no-water
roof; reruns passed after fixes. The final occupied-shaft trial kept its
refuge closed beyond sixty seconds with the enderman still present.
These are supplied-kit tests. Natural encounters and safe resumption after
anger clears remain pending. Setup scripts and logs stay under ignored outputs.

F085 passes 335 tests and syntax checks. New regressions enforce ten-block
torch spacing with light fixed at zero, verify the nine/ten-block boundary
and duplicate-cell refusal, and exclude ore-excavated rooms from surveys.
All three failed before the fix.

F084 covers torch spacing when earlier torches are out of view and
exclusion of excavated passages from cave surveys. It checks legacy
mining memory and dimension isolation. Both regressions failed before
the fix. All 332 tests and syntax checks passed. The patched LAN bot
reconnected and resumed crafting. A fresh natural-cave trial is pending.

F083's regression searches a real unnamed Prismarine entity followed by
a named zombie. The old code emitted one trace. The fix finds the zombie
without emitting any. All 330 tests and syntax checks passed.

F082 verifies daylight wood before the meal reserve, including when food
or iron is visible. The resource watchdog regression verifies that visible
food cannot cancel a wood run below the reserve. Both failed before the fix.
All 329 tests and syntax checks passed. On the replacement LAN run
`outputs/2026-11-06@22.03.34`, the bot chose wood with both reserves
short. It resumed wood after the F083 restart at 30 logs and switched to
food at 33 logs in `outputs/2026-11-06@22.07.48`.

F081 replays an attributed melee hit from outside the forward view through
the controller's event handling and decision tick. The regression failed
before the fix and now confirms the bot interrupts work, turns and fights
while healthy. All 328 tests and syntax checks passed. The LAN restart
was verified. A live rear-hit trial is pending.

F080 adds a two-block vein regression through the normal dig wrapper,
target selection and harvesting path. It verifies the newly exposed face
can be mined while the bot starts facing away, and that a resealed
opening, another dimension and unrelated ore do not get the exception.
All 327 tests and syntax checks passed. The patched LAN run started
successfully and awaits a live vein check.

F079 covers occluded and out-of-view block targets, visible ore faces at
probe holes, deliberate turns to scan, and default iron descent despite
buried ore in loaded chunks. The five focused regressions failed against
the original source. All 326 tests and syntax checks passed. On port 52171,
the restarted bot collected one visible diamond before resuming the lava search.

F078 passes 323 tests and syntax checks. Its two new regressions run the actual
Mineflayer inventory and furnace plugins with simulated window packets.
Twelve direct open/close cycles return the progress listener count to
baseline. A server close removes the listener and stale closes preserve the
next window. Both tests failed before the fix. Patch-package applied the
updated patch to a fresh 4.39.0 tarball.

The F077 departure fix passes 321 tests and syntax checks. The two new
regressions reproduce the missing daytime meal check below a high spawn and
an unnecessary climb past the lower exit. Both fail against the pre-fix
source. Port 51528 supplied the failure trace. The fix awaits a live daylight
departure.

The latest code baseline (`c085d82` code, docs after) passed all 319 tests and syntax checks.
F072–F074 added fish, stew, shore-wait, provisional-home, walk-interrupt, lava-escape and
fuel-less cooking regressions. Live 2026-11-06 afternoon: priority iron, walk interrupts,
cooking, glow-berry blocking, the diamond sword and night mining were observed (F073–F075);
fish hunts, stew, the lava drive-out and the G015 cascade fixes are not live-verified. It adds
regressions for the F071 user notes: gear order (no wooden sword, iron set before buckets),
the iron reserve cap and visible-iron interrupt, coal cap 32, night underground policy,
the 32-log and 16-meat departure reserves, cooking jobs and glow-berry picking
(`test/food.test.js`). The night-hunt tests were removed with the feature.
The staged LAN evidence for casting and diamond interrupts is near the end of
this file. F056 resolves the F055 obsidian timeout. Continuous portal
preparation is still not live-verified.

## Initial survival baseline

Server advancement packets confirmed:

- Minecraft (`minecraft:story/root`)
- Stone Age (`minecraft:story/mine_stone`)
- Getting an Upgrade (`minecraft:story/upgrade_tools`)
- Acquire Hardware (`minecraft:story/smelt_iron`)
- Isn't It Iron Pick (`minecraft:story/iron_tools`)
- Adventure (`minecraft:adventure/root`)
- Monster Hunter (`minecraft:adventure/kill_a_mob`)
- Husbandry (`minecraft:husbandry/root`)
- Suit Up (`minecraft:story/obtain_armor`)

The bot also crafted/retrieved workstations, made charcoal, replaced broken tools, resumed after reconnects, mined supported stairs, and opened both side probes at one station. The first live probe pair mined eight blocks without advancing the bot off the main tunnel. Spacing eight is configurable and has not been optimized by a comparative experiment.

Logs and snapshots are local in outputs/. The run beginning 23:33:29 captured iron smelting and the iron-pick advancement. The run beginning 23:46:42 captured the side probes. The run beginning 23:52:54 captured the updated stair ascent from Y=48 to Y=68 and use of a stone work pickaxe.

## Automated checks

`npm run check` and `npm test` passed the initial baseline of 123 focused tests. These cover protocol advancement requirements and revocations, inventory-based prerequisites, configuration bounds, seeds, atomic memory persistence, support preservation, up/down tunnel geometry, cave stair supports, tool-tier selection, mixed-plank charcoal fuel, cancellation, side-probe interval/reach/hazards, and portal geometry.

The inherited Mineflayer patch was applied successfully to reconstructed pristine 4.39.0 craft/inventory sources. Dependency versions are locked. No gameplay result is inferred solely from a passing unit test.

## Still being tested

The 00:06:22 run on LAN port 50330 verified pursuit, food pickup, eating, Husbandry, chestplate crafting and equipping, and Suit Up. It also recorded probes exposing ore. The bot reached nine server-confirmed advancements.

A mixed-plank charcoal failure was reproduced with an inventory snapshot that remains stale while a furnace window is open. Fuel selection now reads the open furnace window's inventory. The corrected regression passes; the new revision still needs a live mixed-plank retry. At this point the bucket, diamond, obsidian, portal and redstone skills still awaited live validation. Later sections record progress. No claim of autonomous dragon completion or all-advancement support is made.

## Comment ceiling

All authored code and patch files are below 10% comment-bearing physical lines. The highest ratio is 7/78 (8.97%) in the dependency patch, including upstream context. The highest JavaScript ratio is 3/42 (7.14%) in terrain-scout.js. Other nonzero ratios at this baseline: advancement-tracker.js 1.82%, decision-engine.js below 6%, index.js 1.23%, survival-bot.js about 1.4%, progression-skills.js below 0.2%; remaining authored scripts/tests have zero comments. Shebangs and URL text were excluded.

The 00:01:14 run records commit f7f77293fa4a and its startup hashes match the current source. It restored all seven server-confirmed advancements and remained connected in its night shelter. The code and configured LAN viewing workflow are usable; later route completion remains unverified.

## Survival follow-up

The 00:16:00 run failed after a shelter-complete message: sudden damage, escape
cancellation at critical health, and repeated recovery deaths. It was stopped at
00:24:23. Damage source is unknown. Earlier uneventful waiting did not establish
night-shelter safety.

New regressions verify that critical-health events leave escape running, failed
walls cannot produce shelter success, enclosure can be rechecked, cancellation
stops building before additional placement packets, nearby repeated deaths share
a recovery budget, and unarmed recovery avoids nearby hostiles. The full suite
passes 75 tests. The corrected behavior still needs live survival validation.
See findings.md and goals.md for evidence and prioritized next work.

The replacement 00:33:48 run uses commit 932b1ed on port 50330. It rejoined,
restored nine historical advancements, rebuilt a sword and stone work pick,
re-equipped a recovered chestplate and resumed iron gathering for the shield.
That is evidence of recovery/rebuilding behavior, not yet a successful live
night/damage trial of the revised shelter and escape logic.


## Cave and inventory follow-up

The 00:33:48 run at `932b1ed` earned Hot Stuff from a server packet at
2026-11-05T05:40:56.578Z, confirming ten advancements. It crafted/equipped a
shield and retained an iron pick and armor. Its verified night enclosure held
through the night without recorded damage; daylight exit still led to recovery
and reconnections. This is not a hostile-damage escape validation.

That run stopped at 06:00:46.294Z after a stationary rubble toss/re-pickup loop.
New regressions cover selecting a full surplus stack, retaining valuables and
building reserves, retreating beyond pickup range with digging disabled, and
refusing a toss with no safe retreat. The caller-level regression failed before
the retreat patch; the stack-selection regression failed before its patch.

Fifteen cave tests cover connected supported routes, roofed-chamber detection,
natural descent, hazards/unloaded blocks, expiring dimension-scoped visits,
lighting confirmation, return anchors, cancellation, failed-route quarantine,
new threats, reserve caps/tool tier/slot headroom and the real diamond-action
fallback. A policy regression checks surface food preparation and underground
return priority. These do not establish live cave exploration or better yields.

Comment ratios in changed code: cave-exploration.js and the changed tests 0%;
inventory.js 0%; progression-skills.js 1/736 (0.14%); survival-bot.js 23/1795 (1.28%);
decision-engine.js 4/79 (5.06%). All are under the 10% ceiling. Agent instruction
files remain byte-for-byte identical.


The follow-up fixture also covers a cavern with a ceiling 46 blocks above the
floor. The original twelve-block roof check failed that case; the survey now
checks up to 64 blocks overhead. A two-cleanup corridor regression reproduces
retreat oscillation back toward the preceding disposal spot; recent same-dimension
drop positions now exclude that retreat endpoint for two minutes.

Live revision `ac9e912`, run `outputs/2026-11-05@01.04.11/`, reduced cobblestone
from 920 to 664 in its first cleanup sequence and resumed mining. Some subsequent
retreats revisited drops; it has not proved permanent trash disposal. At
06:04:41–06:05:17Z, three Opportunity actions increased raw iron from zero to
three while the main objective remained Diamonds! This is live evidence for
parallel material gathering, not a new advancement. The tall-cavern and
anti-oscillation refinements were edited separately while that revision ran.


Active handoff: `50f4151`, PID 10165, port 50330, run beginning 01:06:47 Eastern.
Its source hashes match current source. At 06:07:18Z it was connected and mining
at Y=0 with health 20, food 19 and ten restored advancements. `ac9e912` was
stopped cleanly first. New code has 94 passing tests and syntax checks; large-cave
survey/return, surface food reserves and the final disposal-route refinement
remain awaiting suitable live evidence. Bot remains running for those tests.


## Productive-night follow-up

The previous active handoff is now historical: `50f4151` was stopped at
06:17:30.511Z after repeated disposal movement timeouts at Y=-44. A fresh live
non-digging approach reached the first stair; replay of the captured local
terrain also found a valid path. The long-run physics/timing trigger remains
unresolved. New containment tests ensure no more than three failed toss/retreat
attempts before pausing; upward steps reuse the checked stair fallback.

The full suite now passes 116 tests plus syntax checks. Eleven new policy tests
cover productive underground/surface night work, readiness, useful isolated
mobs, armor thresholds, limits, crowds, low health/hunger, beds and dimension/day
scope. Ten skill/event tests cover oriented two-half bed placement, Overworld-only
activation, server sleep state, cancellation, new threats, crafting, sudden damage,
shield release and checked shelter exit. Existing combat/shelter mocks now include
the controller liveness and world fields used by the real caller.

These are automated checks. No new night hunt, shield block, Sweet Dreams,
multiplayer sleep skip or full emergency retreat/night/exit is yet live-confirmed.
No new advancement is inferred from a policy choice or an inventory change.

Changed code comment ratios: new night modules/tests 0%; decision-engine.js
4/98 (4.08%); survival-bot.js 23/1844 (1.25%); progression-skills.js 1/757
(0.13%); index.js 2/166 (1.20%); other changed tests 0%. All are below 10%.
AGENTS.md and CLAUDE.md were updated together and compare byte-for-byte equal.


## Controlled night trials and owner sleep

The user explicitly authorized setup-only Minecraft commands. Ignored per-run
`test-setup.json` files record the supplied bed/food, teleports, rubble clearing,
nearby hostile clearing and night changes; these trials are not natural survival
progression. Setup helpers disconnected before autonomous runs and no commands
were sent during the trials.

The 01:39:28 and 01:42:09 trials exposed natural-ground placement limitations,
including vegetation and a setup site mistakenly selected on leaves. Those runs
were stopped and the setup selector was corrected to ground. Bed/shelter skills
now clear ordinary vegetation, with a focused regression.

The 01:46:05 trial (`2c1a714`) received the Sweet Dreams server packet at
06:46:14.594Z. Its intended sleep action had rejected the bed's orientation;
shelter placement later activated it. Treat this as staged server sleep evidence,
not a clean sleep-skill success. Pinned Mineflayer's forced look returns before
its next movement packet transmits rotation. `097f6a2` adds a transmission wait,
checks both halves with a bounded wait and has a failing-before-fix regression.

The user's LAN correction is implemented: sleep requires the owner's observable
sleeping metadata/pose, and an awake/unobservable owner triggers waking. Tests
cover awake, sleeping, waking, unloaded, sheltered and underground cases, plus an
owner waking during bed preparation. The full suite passes 121 tests and syntax
checks. Cooperative owner/bot sleep and the corrected placement need live retry.
Current new modules/tests remain below 10% comment-bearing lines; the highest
changed-code ratio remains decision-engine.js, below 5%.


## Final bounded trial and stop

Run `outputs/2026-11-05@01.55.10/`, code `58d68eb`, has an ignored setup record:
food/sword/bed supplied, time changed, bot teleported, rubble and nearby hostiles
cleared, one stationary NoAI spider summoned. No commands were sent during the
autonomous trial. It selected hunt_night, killed the stationary spider and retained
two string, then resumed diamond work. This does not validate fighting live AI.

A naturally arriving zombie exposed repeated modest damage during a long mining
action and low-health healing events cancelling eating/shelter. The bot escaped
several times without a logged death, but was stopped at 06:56:14.900Z. New event
regressions cover earlier surface withdrawal at damaged health <=16 and healing
that leaves eating/shelter active. All 123 tests and syntax checks pass. The final
safety changes have not had a live retry. No bot remains connected/running.

Final changed-source comment ratios (all <10%; changed tests 0%):

- src/night-policy.js: 0/93 (0.00%)
- src/night-skills.js: 1/211 (0.47%)
- src/decision-engine.js: 4/101 (3.96%)
- src/index.js: 2/166 (1.20%)
- src/survival-bot.js: 23/1850 (1.24%)
- src/progression-skills.js: 1/757 (0.13%)
- src/cave-exploration.js: 0/232 (0.00%)
- src/advancement-plan.js: 0/147 (0.00%)


## Disposal lanes, creepers and deep-trip planning (port 51718)

Code `152ed85`→`944e832`; 132 tests plus syntax checks pass. New regressions:
batch surplus selection with lowered reserves; level-lane throw in the F015 dead-end
geometry with no movement and a transmitted look; stair-lane throw while descending
(fails on `2bcab2b`); retreat fallback; 60 s back-off instead of a persistent pause;
creeper decision priority, sealing a one-wide tunnel, fleeing in the open, and the
sight-gated interrupt; planner ordering of diamonds before sticks, the surface wood
reserve and the full-inventory return trip; cave torch spacing (fails on `e474275`).

Live (setup separated from autonomous play):

- 15:54:43Z, unstaged except clearing the stale disposal pause: nine stacks thrown
  along the tunnel at the exact 02:08:36 failure spot; mining resumed without re-pickup.
- 16:05:04Z, after a setup-only creeper summon 9–10 blocks away: interrupt at 6.0
  blocks, flee, no damage. Sealing has not been exercised live.
- 16:08:45Z and 16:11:38Z, unstaged: stair-lane throws during descent, no retreat.
- 16:12:10Z, user-requested staged teleport toward Y=-30 landed at Y=-38 after a
  fall (setup error, now corrected). The run continued autonomously.

No new advancement was earned in these runs. Changed-code comment ratios stay
below 10% (highest changed source: survival-bot.js about 1.4%).

Follow-up (`7aa7c7c`, `cedc6f8`; 137 tests): shielded-pit disposal geometry and its
liquid/loose-roof refusals; face-level diamond visibility, probe-exposed ore memory,
liquid refusal and decision priority (three fail before the fix). Live: pit disposal
at 16:23:50Z and the Diamonds! server packet at 16:20:34.805Z. Diamond priority awaits
a live sighting.

Later follow-up (`e6078ea`–`f6aba27`; 141 tests). A live death at 16:27:05Z was caused
by a raycast-shape bug the mock hid; the mock now mirrors prismarine-world. Live
fixes verified: shallow-pit shaft escape (16:29:16Z). Hand-dug return is live but slow.
Full iron set, diamond sword and diamond armor ordering are unit-tested only.

Survival/terrain follow-up (`7a8b75f`–`6628e8c`; 149 tests): melee-damage interrupt,
unarmed adjacent escape, best-effort drop pickup, unstick drop limit and movement
restore, horizontal scout goal — each fails before its fix. Live: unstick hand-dug
Y 66→78; melee interrupt and new scouting await a live encounter.

Night follow-up (`c57fd6a`, `73aaefd`; 152 tests): burrow geometry and refusals, roof
support ordering and burrow fallback. Live: walled shelter verified 17:18:21Z after the
roof fix's predecessor; burrow refused on the tested hillside.


## Session summary (2026-11-05, port 51718)

214 automated tests and syntax checks pass at the handoff revision. New coverage this
session: disposal pits/lanes, creeper/archer cover, melee and decision-fault fallbacks,
burrow, shelter roof and exits, unstick, horizontal scouting, shaft memory (record, follow,
repair), base plans and barrel vault (site, seal sequence, migration), husbandry branches
(planting, fishing, breeding), golem, async smelting (record-before-fuel, refuel, collect),
throughput logging, !inventory and planner gear order. Each regression was confirmed to
fail on its pre-fix source where it guards a fix. Live evidence is recorded per finding in
findings.md (F019–F039); not yet observed live: tunnel sealing vs. creeper (observed),
vault restock, Nether entry/return, golem, fishing, breeding and deflect_arrow.

## Fresh LAN world (port 53606)

221 tests and syntax checks pass. Seven new regressions reproduced
their failures on the earlier code: pre-plugin disconnect, stalled smelt with
partial output, first-iron fuel recovery with a distant furnace, first-iron
planning with a running job and fresh raw iron, obstructed roof support, and
container protection in direct tunneling and generic pathfinder digging.
Changed-file comment ratios: `survival-bot.js` 63/2225, `advancement-plan.js`
7/201, `progression-skills.js` 21/1058, `smelting.test.js` 0/153,
`survival-safety.test.js` 2/547, `mobility-recovery.test.js` 2/149 and
`progression-skills.test.js` 0/262.

Live, unstaged: four advancements from an empty inventory in the 18:26:34 run
(`a6a138c`), server history restored on restart at 18:29:45 (`646ae27`), and a
32-cell shaft recorded in the new world. The sandbox-denied connection before
plugin injection was rerun after the teardown fix without the secondary crash.
On `646ae27`, the first charcoal-fed job ran while four additional raw iron
were mined. The bot returned, collected both ingots and received Acquire Hardware
at 18:32:22 Eastern. Fuel-starved recovery and alternate roof support have
automated coverage and await focused live trials.

Follow-up `2e11db8`: 229 tests and syntax checks pass. Added coverage for the
three-ingot priority, limited first batch, spare plank fuel, stronger mining
tools, night descent policy, remembered shaft preference and keeping a shelter
closed when descent is refused. Updated the night surface-trip fixtures to use
a fuel shortage after removing the obsolete stone work-pick goal.
Final changed-code comment ratios are at most 8.20% (`decision-engine.js` 15/183).
Other changed source ratios: `survival-bot.js` 63/2274,
`progression-skills.js` 20/1057 and `advancement-plan.js` 5/206. Changed tests
are at most 1.34%.

Live without staging: the 18:45:08 run used carried plank fuel for one ingot,
collected its third ingot, crafted and equipped the pick, and received the
server advancement. Mining resumed with the iron pick in hand. See F043 for
the unsuccessful hillside descent and the pending successful night trial.

`d3f5068` passes 232 tests and syntax checks. The planner, optional-action
priority, axe selection on real block data, base restock and chest/barrel
migration checks each failed on the previous code. Changed source comment
ratios are 5/209 (`advancement-plan.js`), 20/357 (`base.js`), 15/185
(`decision-engine.js`), 20/1069 (`progression-skills.js`) and 63/2282
(`survival-bot.js`). Changed tests are at most 0.82%.

Live on port 53606, the 18:51:28 run crafted a stone axe on its first action
and immediately reclaimed the crafting table with it. Debug logs confirmed it
used the axe on oak logs during the next wood-gathering action. No staged
supplies were used.

`ecf3f21` passes 234 tests and syntax checks. The new decision regression
reproduces local stone crafting losing to an unreachable base restock. The
tunnel regression reproduces continued digging after an iron pick wears out.
Both fail on the earlier code. Changed code comment ratios are 5/213
(`advancement-plan.js`), 15/192 (`decision-engine.js`), 20/1075
(`progression-skills.js`) and 63/2286 (`survival-bot.js`). Changed tests have
zero comments. Live, the 19:03:00 run rebuilt stone, collected three ingots
from the saved furnace and equipped a new iron pick before resuming work.

`cf4f19b` passes 237 tests and syntax checks. Regressions cover the observed
hungry-miner decision, pickless staircase refusal, the checked jump before a
stale shaft, and wood and food reserves before iron or lava mining. Changed
code comment ratios are 15/205 (`decision-engine.js`), 19/1078
(`progression-skills.js`), and 63/2314 (`survival-bot.js`). Changed tests stay
at or below 1.78%.

The follow-up adds the observed low-health archer case and a shallow-base
provisioning check. Both failed before the follow-up. Live on `cf4f19b`, the
watcher reported critical damage, repeated fight refusal, and death. The bot
restocked and rebuilt a stone pick after respawn. The exact hungry-miner craft
and former stair timeout have regression coverage and await another live trial.

The F047 regressions cover the planner selecting withdrawal as a second zombie
closes in and an active duel yielding before the next attack. Both fail on the
earlier code. Changed source comment ratios are 15/212 for `decision-engine.js`
and 63/2325 for `survival-bot.js`. Changed tests are at most 0.34%.
All 239 tests and syntax checks pass.

The read-only log watcher was attached to the live port 53606 run for 120 s.
Routine mining stayed quiet. A replay appended the real iron-pick recovery
line, critical damage, a third retry, and an advancement to a temporary log.
All were reported, while historical lines, ordinary actions, and a single
failure were suppressed. The watcher exited on the run's finish marker.
All 234 tests and syntax checks pass. Watcher comment ratio is 0/66.

F048 covers the food watchdog's recovery dispatch, the earlier no-movement
prey cutoff, cardinal recovery, the pinned pathfinder's empty-path resolution,
and the 26.1 recipe dimensions used to make bowls and stew. Each new behavior
failed its regression before the fix. The full suite passes 243 tests plus
syntax checks. Comment-bearing lines are 63/2384 in `survival-bot.js`, 2/156 in
`mobility-recovery.test.js`, and zero in the two other changed tests.

On port 54390, a staged teleport to the recorded shoreline reproduced the
starting position and the patched recovery reached dry ground at full health.
Brown mushroom caps were placed for a separate foraging fixture. The bot broke
the blocks and picked up their drops in survival. A command-free retry crafted
four bowls at the table and one stew in the inventory grid from those drops.
F048 records the setup and retry separately from unaided progression.

F049 adds regressions for shovel crafting order, replacement, survival and
cleanup priorities, mixed-material tunnel tool selection, and base restocking.
All 246 tests and syntax checks pass. Comment-bearing lines are 5/217 in
`advancement-plan.js`, 20/357 in `base.js`, 17/213 in `decision-engine.js`,
19/1083 in `progression-skills.js`, and 63/2394 in `survival-bot.js`. Changed
tests have at most 2/245 comment-bearing lines. The LAN run crafted a shovel
from carried materials. Replacement after wear is covered by the planner test.

F050 verifies clutter disposal, full packs without ordinary surplus, priority
over a blocked tool craft, nearby chest storage, and the last-resort drop.
All 252 tests and syntax checks pass. Changed JavaScript files stay below 8%
comment-bearing lines. The LAN bot discarded the seven clutter stacks and
resumed mining. The exact-full and chest paths have regression coverage.

F051 covers a narrow rail corridor, checkpoint backtracking, dimension-scoped
checkpoints, interruption by visible diamonds, and discovery and looting of
chests and chest minecarts. The LAN replay exercised a natural cave walk and
two staged loot containers. All 256 tests and syntax checks pass. Changed
JavaScript files stay below 8% comment-bearing lines.

F052 verifies five head-height blocks on each side, same-cell movement and
early stopping at hazards or ore. All 256 tests and syntax checks pass.
Comment-bearing lines are 19/1131 in `progression-skills.js` and 0/119 in
`side-probes.test.js`. The staged LAN trial cleared all ten deepslate cells
with the bot's carried pickaxe.

F053 covers planning for two water buckets, allowing local casting before
mining-trip provisioning, and pouring and recovering water above contained
lava. All 258 tests and syntax checks pass. Changed JavaScript files stay
below 8% comment-bearing lines. Staged LAN trials verified a second fill,
one cast with server-confirmed Ice Bucket Challenge, and a renewable water
trench that refilled both buckets.

F054 verifies tunnel discovery before moving, accepting the discovery as
progress, and retaining the interrupted objective after the pickup. The
staged LAN trial collected one diamond from the hidden fixture at Y=-54.
All 261 tests and syntax checks pass. Changed JavaScript files stay below 3%
comment-bearing lines.

F055 is an unresolved live failure. The natural run on `e01b598` repeatedly
timed out in `gather_obsidian` near (-18,27,-8). The staged cast does not
cover this site or prove a repeatable supply for a portal.

## Fresh LAN world (port 55502, 2026-11-06)

Unaided survival, with no commands or staged items. The server confirmed ten
advancements from an empty inventory in 28 minutes, with no deaths through
Suit Up at 05:44:22Z (F057). The runs were on `317fc9b`, `731bac3`,
`45c6ce0` and `dda1c30`, in `outputs/2026-11-06@00.16.10` through
`@00.41.40`. Diamonds! followed at 06:00:56Z on `ca042f8`, about 45 minutes in, with lava-source
quarantine and a second in-place recovery observed live. Live-verified on `dda1c30`:
in-place failure escalation into
`unstick`, which dug out of a hill pocket, followed by an iron pick rebuilt
from carried ingots. Restocking feathers from the base was also seen live.

Automated only (regressions that failed on the pre-fix source): exact empty
bucket for lava and the third-bucket plan (F056), the night carve-down (F061),
wood before stone, nearest-cell return routes, enclosed-return climbing,
whole-trunk blocking, carried side-goal materials (F058), Take Aim, the
portal standing row and Enchanter (F059). Enchanter and Take Aim are new
modules, so their tests are first-version specifications rather than
pre-fix reproductions.

Not Today, Thank You was server-confirmed at 06:11:06Z. The first death on this
world came at 06:12:06Z, from a creeper blast followed by a zombie (F062).
Live-verified on `458ac05` and `9a2ef22`: a pickaxe-free climb out of a cave,
and a bare respawn crafting a pickaxe before attempting the sealed vault.
The creeper shield brace and the rest-to-14-HP rule are covered by regressions only.
Hot Stuff was server-confirmed at 07:02:53Z on `b228b62`, after a live tunnel toward a lava pool
with no walking path (F063). An early diamond pickaxe was crafted live at 06:54:18 on `dac689a`.
Cover Me with Diamonds was server-confirmed at 07:42:46Z on `2420de5`. Death #2, by drowning after a
restart beside a spring, came at 07:56:19Z; the drowning response is regression-only (F065).
Live on `7b403bc`: two tunnel segments reached a remembered 32-iron furnace that had no walking path (F066).
Death #3 came at 08:41:42Z in a tunnel melee: an armored escape pinned in place. The cornered-fight response is regression-only (F068).
Death #4 came at 08:46:34Z in lava. The lava escape reflex is regression-only (F069).
Deaths #5–#7 came at 08:56–08:57Z: bare respawns in mob caves at night (F070). The bot was stopped at 08:58,
patched and restarted on `cecbf1d`; the night-restock and cave-shelter rules are regression-only.

Session end 2026-11-06 09:07:55Z: bot stopped on `cecbf1d`; 15 server-confirmed advancements on this world,
seven deaths. Automated baseline: 303 tests passing, syntax checks passing.
