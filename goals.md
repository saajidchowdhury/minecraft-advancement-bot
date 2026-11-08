# Prioritized development goals

Updated 2026-11-07 (America/New_York). Next: validate natural survival and
recovery on the current build before expanding the advancement route.
This is a working queue, not a rigid script.
Reorder it when new evidence or user instructions warrant. Keep IDs stable and
record completion evidence rather than deleting the history of a useful goal.
The project goal is to develop a bot that gets selected advancements logically;
one playthrough is a test, not the definition of success.

Session handoff: the normal bot runs on port 49278, PID 4360, from 9b61429
in outputs/2026-11-07@20.31.37, launched in a visible Terminal window (the
user's preferred method for live runs). Verify process identity and the
latest log before stopping or launching anything; do not duplicate it.
Automated baseline: 408 passing tests and syntax checks.

Next checks, in order:
1. F094 / survival: observe a natural crowd retreat, including an obstructed
   seal and retry. The four-mob staged corridor passed; a large cave remains
   unverified. The latest snapshot is rebuilding armor, so monitor threats.
2. F096 / cooking: observe a naturally earned cooking return. The original
   hillside staged repeat passed in 11.243 s; no repeated thirty-second walk
   retries should return. Preserve a pending job when cancellation interrupts.
3. F095 / hunting: verify a natural axe-equipped kill and charged swings.
   Axe/shovel crafting passed naturally; weapon selection and timing are
   automated evidence. Continue the iron kit, then diamond tools and portal
   preparation; do not expand Nether/stronghold behavior before survival holds.

Two existing sections below share G015 (death cascades and stronghold work).
Prioritize the survival section; stronghold work remains gated on a verified
Nether entry/return. IDs are preserved rather than silently renumbered.

F097 lets wood gathering reach high logs: eye-based approach reach (logs to
about feet+5 from the ground) and a bounded dirt/stone/log pillar beyond
that, dug back down with drops collected. Three staged runs at the user's
reported oak validated it after two live fixes (placement timing, drop
facing). Observe a natural high-tree pillar next; check that no "Tree pillar
failed" or refused-placement loops appear and that an interrupted pillar is
recovered. Consider widening overhead wood discovery if distant trees keep
winning over a nearer cut trunk.

F096 fixes repeated thirty-second cooking-return attempts: interaction-reach
goals, eight-second approaches and a bounded detour on the first failure.
All 399 tests pass. An original-site staged repeat recovered after the first
timeout and collected finished food in 11.243 s at full health. Observe the
next naturally earned cooking return; the one-item test output was supplied.

F095 restores stone pick -> axe -> shovel preparation after a rebuild and
before routine hunting. Prey attacks prefer axes and respect their cooldown.
All 394 tests pass. Natural restart crafted the axe and shovel in order,
then resumed food gathering at full health. Observe an axe-equipped animal
kill next; urgent survival remains ahead of tool preparation.

F094 fixes unlimited level detours, bridging recovery and crowd fight/escape
oscillation. All 390 tests pass. A staged three-zombie/one-skeleton trial
verified a 24-step retreat, two-block seal and inward mining at full health,
with no attacks or bridges. Test mobs, supplied gear and arena were removed.
Observe a natural large-cave retreat and a live obstructed-seal retry next.

F093 fixes gear left unequipped behind tool prerequisites and night idling with
a usable wooden backup pick. Three pre-fix regressions pass. The natural
restart equipped all armor and shield, escaped the shelter and resumed daytime
wood resupply. Observe the backup-pick fallback on a subsequent underground
night; the live restart was already daytime.

F092 fixes moving-drop pickup and prevents a pickup timeout from blacklisting
the remaining trunk. Verify the two logs from the live tree after restart.

F090 makes leaves transparent to visual rays and adds upward wood scans.
F091 interrupts work on low air and uses direct rescue swimming, with dry
workstation pickup. Observe natural canopy harvesting and another ordinary
water/furnace interaction after the staged pond safety trial.

F089 fixes the water search's false surface detection and cave-entering scout.
Daylight searches finish a real exit; nighttime searches stay underground.
A natural daylight exit and water pickup passed. Observe nighttime underground
search and the nightfall transition next. Automated coverage passes; no new
structure staging is needed.

F088 fixes clockwise tunnel spirals using a stable heading and a saved tunnel
frontier. Six pre-fix routing regressions now pass, along with cancellation
coverage. A command-staged sixteen-step LAN crossing and detour return passed.
Monitor a natural ore-detour return and hazard bypass next. Before removing any
staged structure, check for observers and return them to supported ground.

F086 adds enderman gaze protection and a dedicated refuge response. Staged LAN
checks cover neutral aiming, water, stone burrowing and an occupied-shaft side
refuge. Follow up on a natural encounter and refuge exit after anger clears;
the supplied iron gear and command-spawned mobs are not unaided progression.

Next daylight departure check (F077). Use a lower surface near a high spawn
with empty reserves. Confirm it stocks 32 log equivalents first, then reaches
260.48 meal points before departing. Also check that a protected bot still
goes underground at night. F082 supersedes F077's previous food-first order.

F078 is fixed. The port 52171 Terminal log captures warning stacks for the
next extended cooking and smelting run.

F079 needs a live check of a daylight food hunt and a complete iron trip.
Confirm that visible resources are still gathered after the view restriction.
During the iron trip, check a face-adjacent vein where a block exposed by
the bot falls outside its forward view (F080).

F081 needs a live rear-hit check. Confirm the first attributed melee
hit interrupts digging and the bot turns before it tries to eat.

F083 removes the deprecated entity getter from searches. Other terminal
warnings remain enabled.

F084 needs a live natural-cave check. Verify the survey enters new cave
space and lights it without retracing the bot's stairs or placing a torch
on every step.
F085 adds a hard minimum distance of ten blocks between cave torches.
Check the new placement coordinates against this bound in the next cave survey.

## G015 — Highest / next session — Stop death cascades (F076)

Five deaths in 20 minutes followed one kit loss. In priority order:
1. Cave-spider spawner: two or more visible cave spiders (or cobwebs plus one) means a
   spawner. Retreat along the remembered mine route, wall the tunnel behind with carried
   cobblestone, and mark the area off-limits for mining; do not fight in the open or flee
   unwalled. Regression with a staged spawner (commands are fine in test setup).
2. Bare respawn at night (user direction): with nothing to lose, do not bunker immediately.
   Rebuild (wood, table, wooden then stone tools) while keeping distance from mobs; take
   shelter only when cornered or hurt, and accept sand walls on a non-sand floor with a
   non-gravity roof, or a three-block plank pillar, when shelter is needed.
3. Weapon fallback: with no sword or axe, fight with the best pickaxe (stone pick 3 damage
   versus fist 1) and craft the stone axe first after a bare respawn.
4. Resting: no `wait` rest within 16 blocks of a visible pillager or skeleton; retreat behind
   cover first (#13).
Completion: regressions for each; a live bare respawn at night and a spawner encounter
without a cascade. Live-check F071–F074 behavior again afterwards.

## Session 2026-11-06 afternoon (port 49259)

The user's live-test notes are implemented in `ce24690` (F071). The bot was relaunched on
the same world at 17:08:46Z (`outputs/2026-11-06@12.08.45`). Live-check, in order:
1. Night: no surface work; shaft descent, carve-down or shelter; underground mining with
   no food until health <= 12, then an enclosed wait until daylight.
2. Cooking: a job starts with raw meat, the bot keeps working, collects it before mining
   or smelting, and reclaims the furnace. Watch for furnace contention with smelt jobs.
3. Departure reserves: 32 logs and 260.5 meal points; check that daytime food gathering
   does not stall for long where animals are scarce (lower the target if it does).
4. `mine_iron`: watch for unreachable-ore loops and pickaxe wear on early iron.
5. Find why the launch reported "World seed changed" and cleared base memory.
6. F072: watch fish hunts (air guard, drops in water), the shore wait, stew crafting and the
   provisional home being replaced on first open sky.
7. F073/F074: watch for "came into view during" interrupts on resource walks, the direct lava
   drive-out, and why a path entered lava despite `blocksToAvoid`. Death #8 (lava) reset gear.

## Session 2026-11-06 (port 55502)

Fresh world `lan-55502-20261106`: ten server-confirmed advancements in 28 min
with no deaths through Suit Up (F057). It ended at 15 advancements (through Cover Me
with Diamonds) after seven deaths, F062–F070. The bot was stopped at 09:07:55Z on `cecbf1d`
while rebuilding stone tools. Restart with `MC_WORLD_ID=lan-55502-20261106 ./scripts/run.sh PORT`.
Most new survival reflexes (lava, air, suffocation, cornered fight, creeper shield brace,
night restock and cave shelter) are regression-only; live-check them first. Next actions, in order:
0. F070: watch the next night after a death: no restock trip at night, shelter in a mob
   cave, and no drop-down scouting while surfacing. F069: audit environmental hazards with no reflex (fall, suffocation, fire, cactus,
   powder snow); live-check `escape_lava`, `surface_for_air` and the cornered fight.
   F068: live-check the cornered fight. Three deaths in about 3.5 h on this world
   (creeper+zombie, drowning, tunnel mob); survival again outranks new branches (G001).
   F065: live-check `surface_for_air`; read the next bucket-miss diagnostic before
   changing the scoop. F062: live-check the creeper shield brace and the rest-to-14-HP rule; make a
   low-health escape that cannot gain distance on a zombie fight behind the shield.
1. F063: Hot Stuff confirmed after tunneling toward a no-path pool. Lengthen the
   4 s scoop check if spurious lava quarantines recur, and watch the next casting trips.
   Confirm `ae4fb62` climbs out of hill-enclosed returns without the stall in F057.
2. G005: watch the first continuous casting run with the F056 fix: ten
   obsidian, the third bucket, lava quarantine and the portal standing row
   (F059). Require server packets for Ice Bucket Challenge and Nether entry.
3. Live-confirm Take Aim once string, flint and feathers coincide (F059).
   Natural string comes from night spider hunts.
4. Enchanter stays opportunistic (user direction: no sugar-cane farming).
   Plan the stronghold branch next: eyes of ender (blaze powder + ender pearls)
   and the library's bookshelves for serious enchanting.
5. F061: observe the first night carve-down on `6775643`+ (dusk, protected, no
   shaft) and any burrow refusal reason; seal the staircase entrance if mobs follow.
6. Acacia diagonal trunks can still fall outside the three-block vein that
   `c65d476` blocks; widen the vein if repeated per-log timeouts recur.

## G001 — Highest / active — Make survival and death recovery trustworthy

Why: F009–F010 show repeated deaths after an unverified shelter and a handler
that cancels its own escape. Later advancements are pointless if equipment is
repeatedly lost.

Next actions, in order:
1. Reproduce critical-health cancellation with a health-event regression and
   allow escape to continue while unsafe work is interrupted.
2. Check shelter enclosure from actual blocks; do not swallow failed placements
   and then announce success. Revalidate protection and respond to damage.
3. Ensure cancellation/death/disconnect prevents later shelter placement or a
   stale success log. Keep action ownership exclusive across recovery too.
4. Add enough targeted damage/threat evidence to distinguish likely causes in a
   subsequent failure. Do not label the previous death a creeper attack as fact.
5. Bound recovery attempts, consider local threat/health, and preserve the ages
   of older drops when repeated deaths occur. Prefer rebuilding over a death loop.

Progress: critical-health escape, enclosure verification/rechecking, placement
cancellation, damage diagnostics, nearby repeated-death budgets, and unarmed
threat avoidance are implemented with focused regressions. The full suite passes
75 tests. G001 remains active for live validation and any further route failures.

Completion: focused regressions pass; a live night/damage/recovery sequence is
observed without self-cancelling escape or false shelter success. Do not force a
suicidal demonstration just to satisfy a test. The 00:16:00 run was stopped at
00:24:23. The replacement 00:33:48 run waited through a night without recorded damage,
but daylight exit/reconnection and hostile-damage escape remain open. It was
stopped at 01:00:46 for the disposal loop; see
findings.md for its version and verify its PID before taking over.

## G002 — High / active — Stabilize mining supplies and disposal

Dependencies: G001; findings F005, F007, F011.
Inspect wood approach behavior: distinguish a too-short travel budget from
unreachable geometry or competing controls. Avoid retrying every log in one
failed tree. Maintain a useful wood/food reserve without endless gathering.
Verify cleanup of surplus rubble while retaining building reserves and valuables;
check duplicate/lost workstations and whether reclaiming them pays for its cost.

Live progress: the 00:33:48 run retained the chestplate, crafted/equipped the
shield and prepared/filled a bucket. Largest-stack cleanup, a bounded disposal
retreat and surface food reserves are implemented. Live `ac9e912` resumed mining
and reduced its rubble load; refined retreat routing and surface food reserves
still need live validation. Check actual equipment rather than historical ownership.
Completion: repeatable collection/crafting with verified inventory changes and
no repeated unproductive surface trips. Establish causes before optimizing quotas.

## G003 — High / implemented, live retry pending — Verify the furnace-window fix

Finding F008; checkpoint `2ba6526`. Reproduce mixed single-plank fueling in a real
furnace when the bot next needs charcoal. Read active window inventory, not a
stale player snapshot. Confirm correct input, output pickup and cancellation.
Do not alter the user's inventory or inject materials to manufacture a pass.
Completion: no duplicate consumed-stack selection and verified charcoal output.
Keep the frozen-snapshot regression; extend it if live behavior exposes another
container synchronization boundary.

## G004 — Live milestone reached / retry hardening remains — Hot Stuff

Dependencies: reliable survival/supplies; G002–G003 as needed.
Validate iron acquisition and bucket crafting, locate a source reachable from
supported dry ground, collect lava, and require the server's lava_bucket
advancement confirmation. Diagnose inaccessible-source repetition rather than
retrying forever. Preserve tools and avoid exposing feet/support to liquid.
Live evidence: revision `932b1ed` received the lava-bucket advancement at
05:40:56.578Z and retained its iron pick, chestplate and shield. This meets the
first live milestone. Five approach/activation failures preceded success; source
quarantine and repeatable dry-bank activation still need hardening.

## G005 — High / live retry loop — Diamonds and obsidian

Validate deep stair/branch mining, lighting and food/tool reserves, collection of
three diamonds, and crafting a diamond pick. Check height choices against the
actual version/world. Verify water collection and safe obsidian harvesting or
contained casting, including source recovery and drop pickup.
Completion: server-confirmed Diamonds! and Ice Bucket Challenge, plus a retained
diamond pick and sufficient obsidian for a portal. Geometry tests alone are not
completion. Fix unsafe/unproductive skills before adding more branches.

F053 confirmed Ice Bucket Challenge and two water buckets after a staged cast.
F054 verified the diamond interrupt on LAN with staged ore. F056 found the F055
cause: a suffix-matched water bucket was used to scoop lava; fixed in `de0892c`. Verify recovery at that site, natural lava resupply and the
ten-block reserve on a continuous run.

## G006 — Medium / implemented, not yet live verified — Nether entry and a route back

Dependencies: G005 and adequate protection/food.
Validate partial-frame resumption, support placement, ignition, actual dimension
transition and safe waiting near the portal. Keep world/dimension memory correct
and retain a practical return route before queuing Overworld construction.
Completion: server-confirmed Nether entry and a demonstrated safe return or
reliable way to return; do not immediately turn an unprepared bot loose in combat.

## G007 — Medium / plan after the survival foundation — Broaden useful advancements

The current ten-entry story route is not the final ceiling. Select achievable
husbandry/adventure/story branches by dependencies and cost, such as planting,
sleeping, basic breeding, further equipment and later targeted exploration.
Consider meaningful Nether/stronghold/End progression once its prerequisites
are reliable. Do not treat every-biome or similarly exhaustive challenges as
required. Propose a small next branch, implement its skills, then verify real
completion before expanding the planner again.

## G008 — Lower / measurements needed — Optimize mining and resource economics

Finding F006: side probes work. F087 sets the user-requested interval to five
(four intervening blocks); its throughput has not been compared with alternatives.
Compare a few intervals, including no probes, under comparable world/tool
conditions. Record revision, sample size, elapsed time, ore yield, tool wear,
travel and failures. Avoid claims from one lucky deposit. Also evaluate using
furnace residual fuel, batch sizes and resupply routing once correctness is stable.
Completion: a supported policy improvement, or an explicit inconclusive result;
do not optimize at the cost of unsafe mining or broken advancement prerequisites.

## G009 — Optional, lowest / implemented demo unverified — Redstone construction

After advancement capability is reliable, verify the queued lever/piston demo
using gathered resources, correct orientation and observed actuation. Then add
occasional more interesting functional blueprints with physical validation and
resumption after interruption. Return priority to survival and advancements when
needed. Completion: a real working build, not just a planner or inventory recipe.

## G010 — High / implemented, full live survey pending — Caves and parallel preparation

User direction: live tests target under-tested behavior while development can
continue on distinguishable revisions. Favor worthwhile cave surveys and useful
later supplies alongside the current advancement. See F013 and the research in
`cave-opportunities.md`; both agent instruction files carry this guidance.

Implemented: dry depth-first cave routing, saved checkpoints, natural descent
preference, lighting, food/protection/threat gates, a shared 48-step/two-minute
budget, return waypoints and capped opportunistic ore reserves. Visible diamonds
and reachable loot interrupt the survey. Surface deep mining prepares carried
food first.

Live progress: `ac9e912` reduced rubble and resumed mining, and gathered three
raw iron opportunistically while pursuing Diamonds! Some disposal routes still
revisited trash, prompting a separately tested endpoint-exclusion refinement.
Later LAN runs verified clutter cleanup and staged food recovery (F048/F050).
Next: follow a naturally encountered large cave or mineshaft through a survey
and return, including chest loot and remembered checkpoints. Record movement,
lighting, ore/inventory changes and resource costs separately from server
advancement evidence. Refine the supplies policy if it prevents useful surveys.
After that, select one small cave branch (berry harvesting or safe axolotl
capture) with real server confirmation. Do not expand into ancient-city/trial
combat before dependable survival and return behavior.

## G011 — High / implemented, live validation pending — Productive nights and sleep

Keep healthy underground work moving. Test readiness-based surface work and
isolated useful mob hunts, with limited attempts/distance, real drop pickup and
cancellation. Confirm that crowds, sudden damage or low supplies trigger escape
and rest for the remainder of that night rather than repeated engagement.

Validate opportunistic bed crafting, oriented two-block placement, safe entry,
actual server sleep and multiplayer wake-up behavior. Require a server packet
for Sweet Dreams or Not Today, Thank You. Never activate a bed outside the
Overworld. Validate persistent shelter recovery and a checked daylight doorway.
Mob-drop dependencies and exact initial thresholds are in night-opportunities.md.

Next live priority is G002/F015 so the bot can move productively; then validate
night decisions when a natural surface trip occurs. Existing wooden-sword/chestplate
and low food reserves are not hunting readiness; record why the policy rests or
continues rather than manufacturing gear or spawns for a demonstration.

## Completed groundwork

- Preserved the visible LAN player, original reference folder and private GitHub repo.
- Added server-confirmed advancement tracking, world memory, bounded navigation,
  work-pick conservation, food pursuit/drop pickup and side probes.
- Ten advancement IDs confirmed live through Hot Stuff (F003).
- Added matching agent instructions, findings and this prioritized queue.
- Added the active-furnace-inventory fix and its realistic regression (G003 remains
  open for live confirmation). See VALIDATION.md for the automated baseline.

## Handoff checklist

Before ending a session, update the affected findings and goal statuses, record
the actual tested revision and live outcome, and state whether a bot is running,
paused, stopped or disconnected. Keep transient PID/port observations dated and
recheck them next time. A clean Git tree or successful unit suite does not mean
all gameplay goals are complete. Preserve local evidence without committing
credentials, profiles, world state or logs.


The 01:06:47 run was stopped at 06:17:30Z for persistent disposal movement failures.
See F015: bounded retries and stair fallback need a live retry; the trigger is
still uncertain. Do not assume the prior disposal follow-up solved the problem.


Night follow-up: staged trials found placement/rotation timing bugs, now fixed
with regressions. Sweet Dreams was server-confirmed in the 01:46:05 staged run,
but via an unintended shelter click, so clean bed-skill completion remains open.
The LAN owner must be observably sleeping before the bot pursues sleep; waking
or losing sight of that state makes the bot wake. Cooperative sleep, corrected
placement, natural combat and projectile blocking remain the next live checks.
121 automated tests pass. Do not lose the unresolved F015 disposal/stair failure.


Final handoff: bot STOPPED at 06:56:14.900Z, run 01:55:10, code `58d68eb`.
A supplied stationary spider hunt yielded two string; a subsequent natural zombie
encounter exposed mining that continued through damage and healing updates that
cancelled recovery actions. Both event policies are patched with regressions;
123 tests pass. The final fixes are not yet live-tested. G001 has priority again:
review equipment/food and validate earlier withdrawal before an unattended restart.
Owner-coordinated sleep remains implemented; joining the owner's real sleep and
clean corrected bed placement remain pending. Respect the user's usage-limit
request: this session ends here rather than continuing new experiments.


## Session 2026-11-05 10:50–11:20 Eastern (port 51718)

Completed with live evidence (F019–F021): the tunnel-face disposal pause is fixed
by level and stair toss lanes plus a 60 s back-off; visible creepers interrupt work
and were fled without damage in one staged trial; deep trips no longer surface for
sticks before diamonds; survey torches are spaced. G002's original F015 symptom has
not recurred in about 15 minutes of live mining; keep it open until a full trip
to Y=-54 and back completes.

Next actions, in order:
1. G002: observe a full surface→Y=-54→surface trip on `944e832`+; confirm the
   return trip runs with a full inventory and no drop/pickup loop (regression only).
2. G001/F020: live-test tunnel sealing against a creeper in a one-wide tunnel
   (stage with the corrected `outputs/stage-depth-test.js`/`stage-creeper-test.js`);
   make escape conserve iron tools instead of digging with them.
3. F021: add a focused regression for the open-sky underground test and check
   night-policy effects of the new definition.
4. F011: reclaim placed crafting tables before crafting another.
5. G005: Diamonds! is server-confirmed (16:20:34Z). Next: three diamonds and a
   crafted diamond pickaxe; confirm live that probe-exposed or face-visible diamonds
   trigger `mine_diamond` (F022) and that liquid-adjacent ones are skipped safely.


## Throughput update 2026-11-05 ~11:50 Eastern

Per the user's efficiency principle (CLAUDE.md), rank work by expected advancements
per unit time including death risk. Next actions:
1. G001: the bot died through a code fault (F023). Before more features, add a
   watchdog test that `observe()`/`chooseAction` survive any single perception error,
   and live-validate the rebuild from nothing (wood → stone → iron) without deaths.
2. F024: live-validate the iron sword and full iron set, then diamond pickaxe/sword.
3. Measure throughput: log advancements and elapsed time per run in session output
   so policies can be compared (G008), separating staged from unaided time.
4. Recovery policy: a deep death with no tools cannot recover drops; skip doomed
   recovery quickly and rebuild instead of scouting into caves.

Update ~12:12 Eastern: two deaths today (F023 code fault, F025 unhandled daytime melee)
show G001 still dominates throughput. Next: live-validate melee interrupt + fight with
a staged single zombie; consider night underground work instead of shelter for a weak
bot; then resume the gear route (F024) and diamond priority (F022) live checks.

Update ~12:20 Eastern: four deaths today. Before more features, make a fresh or
tool-less bot survive its first night: craft a wooden sword and gather shelter
blocks before dusk, keep night shelter cheap (burrow live check pending), and stage a
single-zombie daytime fight to validate the melee interrupt (F025).

Update ~14:30 Eastern: full iron set, iron sword and shield crafted and worn live
(F024 iron stage done). Next: diamonds → diamond pickaxe and sword live, with the
F022 diamond priority and the F028/F029 cover and crowd logic watched for regressions.

Update ~16:00 Eastern: F024 complete live — full iron set, diamond pickaxe and sword,
diamond helmet worn, Cover Me with Diamonds server-confirmed (13 advancements). F022
diamond priority verified live. Next: G005 water bucket and obsidian (Ice Bucket
Challenge), then G006 Nether entry, keeping the F025–F031 survival fixes under watch.

Update ~16:20 Eastern: shaft memory implemented (F033). Validate live: record on the
next descent, follow it down after a surface trip or death, follow it up when returning.
Measure descent time versus carving (~4–5 min per 124 steps today).

## G012 — Long-term / not started — Relocate mining when a shaft's area is exhausted

User direction (2026-11-05): reusing one shaft forever is not required. When the area
reached from a shaft is drained, the bot should become increasingly likely to open a
new mining site elsewhere, travelling up and down by the same remembered-shaft method
(F033) at the new location.

Design sketch for later, kept small:
1. Per-shaft statistics in memory: blocks mined, valuable ores collected (diamond,
   iron, redstone, gold, lapis), branch length and elapsed mining time near the bottom.
2. Exhaustion score = recent ore yield per block mined (or per minute) versus a running
   baseline; branch tunnels already beyond a radius also count against the site.
3. Relocation is probabilistic, rising with exhaustion, seeded through the bot's rng
   for reproducibility; pick a new surface start some distance away (avoiding known
   danger sites from F029) and record a new shaft; keep several shafts, never delete a
   working one just because another exists.
4. Measure, do not assume: compare ore per minute before and after relocations (G008),
   counting travel time against the new site.
Completion: a live relocation chosen by measured exhaustion, with the new shaft reused
afterwards and yield data supporting the change.

## G013 — High / phase 1 implemented, live pending — Base for storage and fast restock

User direction (2026-11-05): a safe, easily reached base holding hard-earned items lets a
dead bot catch up quickly instead of starting from scratch, and keeps valuables out of
danger. Phase 1 (`55923a4`): a chest beside the shaft entrance, placed once the bot has an
iron pickaxe on the surface; surplus beyond carry levels (duplicate tools, armor no better
than worn, diamonds > 8, iron > 16, ores, coal, logs, food, mob drops) is stored when
passing; after a death a base within 256 blocks holding better gear is visited before
rebuilding. Next phases: (done in `90e95b4`: sealed underground vault with lit doorway); keep a spare kit stored
(craft a spare iron pickaxe/sword when ingots allow); let the planner count stored iron and
diamonds before mining more; consider a bed at the base as the spawn point so restocks are
immediate. Completion: a live death followed by a restock that re-arms the bot within a few
minutes, with measured time saved versus rebuilding.

## G014 — Medium / next — Cheap advancements that compound or cost little

Candidates ranked by cost against current skills (verify ids/criteria against 26.1.2):
1. Not Today, Thank You (story/deflect_arrow): raise the shield toward a visible archer;
   also reduces the arrow deaths of F027/F031. Highest value.
2. A Seedy Place (husbandry/plant_seed): craft a wooden hoe, till dirt, plant carried seeds.
3. The Parrots and the Bats (husbandry/breed_an_animal): seeds for two chickens or wheat
   for cows/sheep when found near the base.
4. Take Aim (adventure/shoot_arrow): bow from spider string, shoot any mob.
5. Fishy Business (husbandry/fishy_business): fishing rod from string near water.
6. Best Friends Forever (husbandry/tame_an_animal): bones on a wolf when one is near.
Then the planned Ice Bucket Challenge and Nether entry; Oh Shiny (barter stored gold) and
Into Fire/A Terrible Fortress once the Nether route is reliable.

G014 2026-11-06: Take Aim implemented (`5ce4c25`), live pending; side-goal string,
feathers and leather are now carried past the base (F058).

G014 progress ~16:45 Eastern: shield raised while charging archers (`abe265d`), A Seedy
Place (`8f5282d`) and Fishy Business (`cdf6e01`) implemented with tests; live pending.
Next G014 items: breeding (chickens with seeds), Take Aim (bow), wolf taming.

Update ~17:30 Eastern: instructions now stress development efficiency and strategic work
during passive watching; strategy.md ranks levers. Done: replan latency, async smelting.
Next by strategy.md: verify base deposit/restock live and add a bed at the base (death
cost), then the Nether route (Ice Bucket Challenge → portal → Oh Shiny, Hidden in the
Depths), then Enchanter.

Update ~18:00 Eastern: async smelting verified live; Hired Help, Nether return and
post-route diamond armor implemented. Next strategic items: Enchanter (book from sugar
cane + leather, table from 2 diamonds + 4 obsidian, lapis), gold boots before any longer
Nether stay (piglins), and a bed at the base. Measure throughput with state.json's
advancementsPerHour across a full run.


## Next session — start here (2026-11-05 ~18:20 Eastern)

1. **Fuel for stalled smelt jobs.** A remembered job with input left and no fuel in the
   furnace or inventory must trigger coal mining or charcoal (logs) and then refuel; today
   about 29 raw iron sit at (-283,68,-150) with no fuel. Bound revisits so a fuel-less job
   cannot draw the bot back repeatedly.
2. **Several smelt jobs.** memory.smeltJob holds one job; a newer job overwrote a 2-iron one.
   Keep a small list keyed by furnace position.
3. **Barrel vault live check** (F039): build once nine planks are available, then a deposit,
   a reseal and a restock after a death. Add lapis to the restock list before enchanting.
4. **Throughput measurement:** compare state.json advancementsPerHour across a full run
   against today's baseline (strategy.md).
5. Then strategy.md order: Nether route live (portal, return), Enchanter, gold boots, a bed
   at the base, golem/fishing/breeding live confirmation, smelting batches of ~8.

## Fresh LAN world (port 53606, 2026-11-05)

- F040: empty-inventory start through wooden/stone tools and A Seedy Place verified
  live. Use the new world ID `lan-53606-20261105` for subsequent restarts of this world.
- F041: stalled iron jobs now request coal, preserving partial output and loaded ore.
  Next focused trial is an empty fuel slot with partial output and no carried fuel.
  Observe coal acquisition, the return and pickup. Track multiple jobs only after
  checking which furnace callers can safely create or reclaim a second station.
- G001: four-sided roof support search passes its regression. Live-check an
  obstructed shelter roof and daylight exit before marking the night loop solved.
- G013: barrel vault build, deposit and reseal remain the next storage milestones.
- F042: check that a remembered furnace survives nearby mining, then collects
  normally after a restart. Check the failed shaft step at (1,63,25) separately
  if the return climb stalls again.
- F043: the third ingot immediately led to an equipped iron pick and the bot
  used it in the following mining work. Verify both night routes with a
  reachable remembered shaft and a shelter above a safe digging column. The
  hillside trial exposed refusal/recovery behavior, which now has a regression.
- F044: stone axe crafting, log cutting and crafting-table reclaim verified live. Check
  replacement when it wears out, and observe the axe on a base container when
  migration is needed. The barrel vault has now been built and used for deposit.
- F045: local stone pick rebuild, pickup of the saved three-ingot batch and
  replacement iron pick verified on port 53606. Recheck restock routing
  separately for gear losses after death.
- F046: verify local pick crafting during a food return, walking an existing
  route through a previously failing stair, and provisioning the next surface
  departure with wood and food. The retry earned Not Today, Thank You and
  exposed a low-health fight loop. The policy regression covers that loop.
- F047: two nearby visible threats now trigger withdrawal for a lightly armored
  bot, including during an ongoing duel. Live-test a changing group and a known
  exit on a future run. The original log cannot establish a survivable route.
- F048: a staged replay verified dry cardinal recovery from the shoreline,
  harvesting brown caps and crafting stew. Recovery retains a checked
  excavation fallback. Watch a natural foraging run reach the mining reserve,
  and record the time and number of cap blocks needed compared with hunting.
- F049: stone shovel crafting verified on the running LAN bot. Verify automatic
  replacement after wear during a future run.
- F050: the LAN bot recovered from the clutter pause. Watch for a naturally
  full pack to validate the ranked overflow and nearby storage paths in game.
- F051: validate a naturally encountered mineshaft from entry to a confirmed
  return. Record how far the descent saves tunneling and when threats end it.
- F052: five blocks per probe side verified on LAN. Include the extra blocks
  and tool wear in the G008 spacing measurements.
- F054: staged LAN replay verified an immediate diamond interrupt and return
  to the obsidian objective. Check natural interruptions during longer mining.

## G015 — Medium / not started — Stronghold, library enchanting and the End portal

User direction (2026-11-06): serious enchanting waits for a stronghold library's
bookshelves; the bot should not farm sugar cane. Enchanter itself stays
opportunistic (F059). A stronghold run also unlocks Eye Spy (`story/follow_ender_eye`),
The End? (`story/enter_the_end`) and the enchanting payoff.
Dependencies, cheapest first, to verify against 26.1.2 before coding:
1. Ender pearls: endermen at night (12–16 needed with throw losses), or piglin
   bartering with stored gold. Endermen need a 3-high-safe fighting spot.
2. Blaze rods: a Nether fortress (A Terrible Fortress; Into Fire). This is the
   riskiest step; it needs full iron or better, food, fire resistance if possible, and
   a remembered portal route back (G006).
3. Eyes of ender: throw, follow and triangulate; dig down to the stronghold.
4. Library: carry bookshelves (silk touch not needed; bookshelves drop 3 books
   without it, so take the books plus the room's loot) or enchant at a table placed
   inside the library with 15 shelves in range.
Completion: server-confirmed Eye Spy and a level-30 enchant on the diamond pick.
Do not start before the Nether entry/return route is live-verified.
