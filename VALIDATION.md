# Validation

Live tests: 2026-11-04–05, America/New_York. Host: MacBookPro. Minecraft Java 26.1.2, LAN protocol 775, bot identity AdvancementBot. The original minecraft-iris directory was preserved.

## Verified in the user's survival world

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

`npm run check` and `npm test` pass; the current baseline has 116 focused tests. These cover protocol advancement requirements and revocations, inventory-based prerequisites, configuration bounds, seeds, atomic memory persistence, support preservation, up/down tunnel geometry, cave stair supports, tool-tier selection, mixed-plank charcoal fuel, cancellation, side-probe interval/reach/hazards, and portal geometry.

The inherited Mineflayer patch was applied successfully to reconstructed pristine 4.39.0 craft/inventory sources. Dependency versions are locked. No gameplay result is inferred solely from a passing unit test.

## Still being tested

The 00:06:22 run on LAN port 50330 verified pursuit, food pickup, eating, Husbandry, chestplate crafting and equipping, and Suit Up. It also recorded probes exposing ore. The bot reached nine server-confirmed advancements.

A mixed-plank charcoal failure was reproduced with an inventory snapshot that remains stale while a furnace window is open. Fuel selection now reads the open furnace window's inventory. The corrected regression passes; the new revision still needs a live mixed-plank retry. Later bucket, diamond, obsidian-casting, portal and redstone behavior has not yet completed an end-to-end live survival test. No claim of autonomous dragon completion or all-advancement support is made.

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
