# Prioritized development goals

Updated 2026-11-14 (America/New_York). This is a working queue, not a rigid
script. Reorder it when evidence or user instructions change. Keep goal IDs
stable. When a goal is done, reduce it to one line under "Completed" with its
evidence reference. Dated session narratives belong in `FINDINGS-ARCHIVE.md`
or git history, not here. Keep this file under ~150 lines. The project goal is
a bot that reliably gets selected advancements in a logical order. One
playthrough is a test, not the definition of success.

## Now

1. Nether fortress (G006, G019). Restart the regular bot onto current code.
   Then a staged run that sights and enters a fortress, golden boots against
   piglins, a restock round trip that resumes at the frontier, a ghast
   answer, and faster 256-block stone gathering (tunnel mining, not single
   blocks). Live-verify the F148 drop caution and tree approach in natural play.
2. Fresh-world early game: wet-biome exit, mainland search and soil stock
   (F135–F137, F145, F147); compare an unaided start with F057.
3. Live-verify still unproven changes: diamond pickup retry (F140), staircase
   floods (F141), berries (F127), disposal zones (F129), standoffs (F130),
   dig delay cost (F131), sculk exits (F132), bare-hand escapes (F126);
   then cast obsidian (G005).
4. Retreat under pursuit (F111): rerun `CAVE_SEED=49910 CAVE_MODE=staggered`
   and the simultaneous creepers until both end in a kill or scored escape.
5. Flooded caves (user, 2026-11-13): leave a water-floored cave, such as
   94,16,-127 in seed -3576454559444207221, by tunnelling away, or pillar to
   the surface if faster. Then G017 and G018.

## Active goals

### G001 — Highest / active — Survival and death recovery

Most reflexes and combat rules are live (see the digest); deaths still
dominate throughput (F100–F111, F149). Not yet built (F076, F101): a
cave-spider spawner retreat and seal; pickaxe fighting without a sword;
bare night respawns that rebuild at a distance; no rest near a visible
archer; wall strafing, a 2x1 lure dent and shield timing from blocked
arrows, each with a focused skeleton scenario first. A natural submerged
archer fight still needs a run (F146). Done when a live bare night respawn
and a natural cave crowd pass without a death cascade.

### G005 — High / live retry loop — Diamonds and obsidian

Diamonds! and Ice Bucket Challenge are confirmed (F053). A staged 8-to-10 run
used the same pool and casting pit twice (F142). Still verify an unaided run
casting ten from zero. The original blocked lava scoop passes on LAN (F122).

### G006 — High / staged — Nether fortress expedition

F144 verified portal entry and return. F149 adds the fortress expedition:
staged prep, a 363-step slab bridge line and a return along the recorded
path work. Next: a run that sights and enters a fortress, a restock round
trip resuming at the frontier (frontier walk and netherrack fallback now live),
golden boots (G019), ghast fireballs,
and faster 256-block stone gathering. Portal search needs sight within 32
blocks; a hidden portal triggered a failed rebuild (F149).

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

Serious enchanting waits for a stronghold library; never farm sugar cane.
Dependencies, cheapest first: ender pearls (endermen or bartering), blaze
rods (a fortress via G006), eyes of ender, then the library's shelves. Done
with server-confirmed Eye Spy and a level-30 enchant on the diamond pick.

### G019 — High / not started — Golden boots keep piglins neutral

Any one golden armor piece keeps piglins neutral unless the bot attacks them,
opens chests or breaks gold blocks near them. An ignored piglin on the bridge
killed NetherTrial (F149). Add 4 gold ingots to the expedition kit, craft
golden boots, wear them in place of the iron boots while in the Nether and
switch back in the Overworld. Done when a staged run bridges past piglins
without being attacked.

### G017 — High / not started — Keep mining out of sculk biomes

User direction (2026-11-14): until the dragon is dead, never mine in deep dark
or windswept hills ("extreme hills"), where sculk generates. On entering one,
sneak (as `flee_sculk` does) several dozen blocks the opposite way, confirm a
safer biome, then mine onward in that direction. Done when a staged deep-dark
entry exits sneaking and resumes mining outside it (extends F132).

### G018 — Medium / not started — Side probes survive unimportant ore

User direction (2026-11-14): an exposed ore halts a side excursion only when the
bot wants to mine it now; mine it, then resume. Any other exposed ore, whether
unimportant (copper) or important but not wanted now (capped iron or coal,
an unsafe diamond), no longer ends the probe. Done with a regression and one
live probe that passes such an ore (F052, F087).

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
