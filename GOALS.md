# Prioritized development goals

Updated 2026-11-13 (America/New_York). This is a working queue, not a rigid
script. Reorder it when evidence or user instructions change. Keep goal IDs
stable. When a goal is done, reduce it to one line under "Completed" with its
evidence reference. Dated session narratives belong in `FINDINGS-ARCHIVE.md`
or git history, not here. Keep this file under ~150 lines. The project goal is
a bot that reliably gets selected advancements in a logical order. One
playthrough is a test, not the definition of success.

## Now

1. Fresh-world early game on port 50902 (the world was remade three times on
   2026-11-13). Watch a natural start end to end with the F133-F136 spawn,
   water and land handling. Done when a spawn in or near water reaches a
   large land mass, stocks soil, uses a trunk platform or canopy descent when
   needed, and matches the F057 pace (ten advancements in 28 min) unaided.
2. Live-verify the 2026-11-12/13 changes still lacking natural evidence:
   water buckets before lava and reachable berries (F127), disposal zones and
   sky-bound surface scouts (F129), melee standoffs (F130), the 5-tick dig
   delay's cost on throughput (F131), sculk exits (F132), a bare-hand escape
   (F126). Then cast obsidian toward the portal (G005).
3. Retreat under ongoing pursuit (F111). Rerun `CAVE_SEED=49910
   CAVE_MODE=staggered` and the simultaneous creeper cases. Done when both
   staggered cases end in a kill or a scored escape on the same seed.
4. Watch natural play for: the creeper duel on poor footing (F112), a furnace
   job near the iron cap (F108), an unaided dusk descent with stair-side
   cooking (F120), a diamond approach resumed after combat (F121), cleanup
   frequency under the keep rules (F115).
5. Diagnose the self-clearing "falling air above the bot" loop (05:39Z on
   2026-11-13), the inventory loss after warden recovery (F104) and the
   unattributed damage. Decide whether to patch the pathfinder's
   `safeToBreak` reading hidden liquid (F114).

## Active goals

### G001 — Highest / active — Survival and death recovery

Most reflexes and combat rules are implemented and many are live-verified
(see the findings digest). Deaths still dominate throughput (F100–F111).
Not yet built, from the 2026-11-06 death cascade (F076):
- cave-spider spawner response: two or more visible cave spiders (or cobwebs
  plus one) mean a spawner, so retreat along the route, wall the tunnel and
  mark the area off-limits;
- with no sword or axe, fight with the best pickaxe;
- a bare night respawn rebuilds while keeping distance, sheltering only when
  cornered or hurt; accept sand walls on a non-sand floor;
- no `wait` rest within 16 blocks of a visible archer; take cover first.
User combat tactics not yet built (F101): strafe along a nearby wall while
facing away from it; dig a 2x1 dent, lure zombies away, return and seal;
time skeleton shield blocks from blocked arrows. Build focused skeleton
scenarios (open room, tunnel, skeleton with zombies) before relying on
charge-and-shield.
Done when a live bare respawn at night and a natural cave crowd pass
without a death cascade.

### G005 — High / live retry loop — Diamonds and obsidian

Diamonds! and Ice Bucket Challenge are confirmed (staged cast, F053). Remaining:
a continuous run casting ten obsidian with the third bucket, lava quarantine and
the portal standing row (F056, F059). Done with server packets and enough
obsidian for a portal. The original blocked lava scoop passes on LAN (F122).

### G006 — Medium / implemented, not live-verified — Nether entry and return

Validate partial-frame resumption, ignition, the dimension change, stepping
out and back (F037) and a remembered route home. Do not let an unprepared bot
loose in the Nether. Add gold boots before any longer stay (piglins).

### G010 — High / implemented, full survey pending — Caves and parallel preparation

Follow a natural large cave or mineshaft through a survey and return, with
loot and checkpoints (F013, F051). Record movement, lighting, ore and resource
costs. Then pick one small cave branch, berries or axolotl capture, with
server confirmation. No ancient-city or trial combat yet.

### G011 — High / implemented, live validation pending — Nights and sleep

Underground night mining works live (F075). Still open: sleeping with the
owner's real sleep and clean bed placement (F017), a natural night burrow and
`mine_from_shelter` from a 1x2 shelter (F102), and night water search (F089).

### G013 — High / phase 1 live — Base for storage and fast restock

The barrel vault is built and deposits are verified live (F039, F044). Remaining:
a restock after a death that re-arms the bot in minutes, measured against a
rebuild. Then a stored spare kit, counting stored iron and diamonds in the
planner, and a bed at the base as the spawn point.

### G014 — Medium — Cheap advancements that compound

Implemented, live pending: Take Aim (F059), Fishy Business and The Parrots and
the Bats (F036), Hired Help (F037), Enchanter (opportunistic only, F059). Next
candidate: Best Friends Forever (bones on a wolf). After the Nether route: Oh
Shiny, Into Fire, A Terrible Fortress.

### G016 — Medium / not started — Stronghold, library enchanting and the End portal

(Renumbered from the second G015 on 2026-11-12.) Serious enchanting waits for
a stronghold library's bookshelves; never farm sugar cane. Dependencies,
cheapest first, to check against 26.1.2: ender pearls (endermen, or piglin
bartering), blaze rods (a fortress, with full iron, food and a route back via
G006), eyes of ender to triangulate, then the library's shelves. Done with
server-confirmed Eye Spy and a level-30 enchant on the diamond pick. Starts only
after G006 is live-verified.

### G008 — Lower / measurements needed — Mining and resource economics

Compare probe intervals, including none, under comparable conditions: ore per
elapsed minute, tool wear, travel and failures (F006, F052, F087). Also furnace
batch sizes and resupply routing. Report an inconclusive result honestly.

### G012 — Long-term / not started — Relocate mining when a site is exhausted

Track per-shaft yield. Relocation becomes more likely as yield falls, seeded through
the bot's rng, and avoids known danger sites. The new shaft is reused the same
way (F033). Done with a live relocation that measured yield supports.

### G009 — Optional, lowest — Redstone construction

Verify the lever and piston demo with gathered resources and observed actuation,
then occasional functional builds. Lower than every survival goal.

## Completed

- G002 Mining supplies and disposal: lanes, pit and back-off live (F019, F022, F050).
- G003 Furnace-window inventory fix: regression, plus live smelts since (F008, F106).
- G004 Hot Stuff: confirmed live on two worlds (F003, F063).
- G007 Broadened route: gear route, husbandry and the Nether plan now live in
  G005, G006, G014 and G016.
- G015 (survival part) Death cascades: night restock and cave-shelter rules (F070),
  bare respawn builds tools first (F104). The rest is under G001.
