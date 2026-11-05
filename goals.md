# Prioritized development goals

Updated 2026-11-05 (America/New_York). This is a working queue, not a rigid script.
Reorder it when new evidence or user instructions warrant. Keep IDs stable and
record completion evidence rather than deleting the history of a useful goal.
The project goal is to develop a bot that gets selected advancements logically;
one playthrough is a test, not the definition of success.

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

## G002 — High / ready — Stabilize supplies and finish shield preparation

Dependencies: G001; findings F005, F007, F011.
Inspect wood approach behavior: distinguish a too-short travel budget from
unreachable geometry or competing controls. Avoid retrying every log in one
failed tree. Maintain a useful wood/food reserve without endless gathering.
Verify cleanup of surplus rubble while retaining building reserves and valuables;
check duplicate/lost workstations and whether reclaiming them pays for its cost.

Live progress: the 00:33:48 run retained the chestplate, crafted/equipped the
shield and prepared/filled a bucket. Largest-stack cleanup, a bounded disposal
retreat and surface food reserves are implemented; live retry is next. The previous inventory and
shield progress were interrupted by death; do not assume they are still present.
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

## G005 — Medium / implemented, not yet live verified — Diamonds and obsidian

Validate deep stair/branch mining, lighting and food/tool reserves, collection of
three diamonds, and crafting a diamond pick. Check height choices against the
actual version/world. Verify water collection and safe obsidian harvesting or
contained casting, including source recovery and drop pickup.
Completion: server-confirmed Diamonds! and Ice Bucket Challenge, plus a retained
diamond pick and sufficient obsidian for a portal. Geometry tests alone are not
completion. Fix unsafe/unproductive skills before adding more branches.

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

Finding F006: side probes work, but spacing eight is a starting value.
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

## G010 — High / implemented, live validation pending — Caves and parallel preparation

User direction: live tests target under-tested behavior while development can
continue on distinguishable revisions. Favor worthwhile cave surveys and useful
later supplies alongside the current advancement. See F013 and the research in
`cave-opportunities.md`; both agent instruction files carry this guidance.

Implemented: dry supported cave routing, natural descent preference, lighting,
food/protection/threat gates, visit cooldowns, a shared 24-step/two-minute budget,
return waypoints and capped opportunistic ore reserves. The original primary
ore target retains priority. Surface deep mining prepares carried food first.

Next: live-test disposal retreat (F014), food provisioning, opportunity pickup,
then a naturally encountered large cave survey and return. Record movement,
lighting, ore/inventory changes and resource costs separately from server
advancement evidence. Refine the supplies policy if it prevents useful surveys.
After that, select one small cave branch (berry harvesting or safe axolotl
capture) with real server confirmation. Do not expand into ancient-city/trial
combat before dependable survival and return behavior.

## Completed groundwork

- Preserved the visible LAN player, original reference folder and private GitHub repo.
- Added server-confirmed advancement tracking, world memory, bounded navigation,
  work-pick conservation, food pursuit/drop pickup and side probes.
- Nine advancement IDs confirmed live through Suit Up (F003).
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
