# Validation

Updated 2026-11-14 (America/New_York). Host: MacBookPro. Minecraft Java 26.1.2,
LAN protocol 775. Ordinary bot: Bot; staged trials use separate players
(CavePractice, DropTrial, NetherTrial). This file holds the baseline, what each
test file covers and live status; per-change history is in
`FINDINGS-ARCHIVE.md` and git. Update rows in place; no dated changelog.

## Baseline

596 tests and `npm run check` pass through F149.
Run them with the prepared runtime:

```sh
PATH="$PWD/.tools/node-v26.13.0-darwin-x64/bin:$PATH" npm run check
PATH="$PWD/.tools/node-v26.13.0-darwin-x64/bin:$PATH" npm test
```

Commit only on a zero-failure full suite, by exit status, not a filtered grep
(F035, F060). Each regression must fail on the pre-fix source; mocks mirror
the pinned library (F023); only server packets establish advancements. Code
files stay under 10% comment lines: `under-feet.js` 13/134, `nether-fortress.js`
32/408, `drop-caution.js` 10/110.

## Test files

| File | Tests | Covers |
|---|---|---|
| action-progress | 4 | what counts as progress for wood, ore and diamond actions |
| advancement-plan | 27 | route IDs, gear and tool order, water before lava, rebuilds after loss, iron cap |
| advancement-tracker | 5 | AND-of-OR requirements, resets, revocation, phantom completions |
| archery | 5 | Take Aim ballistics, line-of-fire safety, planner gating |
| bare-hands | 5 | pickaxe-stranded predicate, hand-diggable blocks, hand tunnel, hand return stairs, break exclusion |
| base | 13 | vault site, deposit/restock levels, migration, sealed-vault access |
| biome-exit | 4 | biome classification, cardinal travel, coastal routing, solid footing |
| cave-exploration | 29 | survey routing, checkpoints, footing, torches, reserves, loot interrupt |
| charcoal | 3 | furnace-window inventory (F008), cooking-job isolation |
| combat-navigation | 10 | creeper duel, hunting with axes, out-of-view prey and drops |
| config | 1 | LAN port bounds, 26.1.2 protocol data |
| crowd-retreat | 11 | crowd latch, wall-pocket retreat and seal, pillar refuge |
| decision-engine | 61 | planner priorities, initial land underground, biome exit, swimming combat and retreat |
| dependency-patches | 5 | crafting, furnace close, entity air, pathfinder jump landings |
| drop-caution | 7 | 10-block drop test, cliff edges, no diagonal or dig-jump beside drops, sprint off, builders wired, approach time |
| nether-fortress | 15 | expedition prep, in-Nether rules, carry limits, axis approach, slab bridge and walls, netherrack fallback, soul sand feet, table beside line, cancellation, path return, hole repair, rejoin, resume, piglin hostility |
| drowning | 6 | low-air interrupt, direct swim rescue, dry station pickup |
| enchanting | 5 | Enchanter gating, offer choice, zero-level wait |
| enderman | 11 | gaze avoidance, anger, refuge priority and persistence |
| farming | 6 | A Seedy Place, Fishy Business, breeding |
| food-gathering | 3 | stew crafting, prey quarantine, watchdog recovery |
| food | 24 | cooking depth, urgent meals, reach, berry path bound, parking, far returns, detours, due times |
| golem | 3 | Hired Help site, build order, gating |
| inventory | 22 | keep rules, wool/leather/seed disposal, batch trigger, stack merge, pits, lanes, full packs |
| leaf-vision | 8 | leaf-transparent rays, overhead trunks, moving drops |
| loot | 2 | chest and chest-minecart looting |
| memory-random | 2 | seeded rng, atomic world memory |
| mined-ore-recovery | 13 | diamond memory, longer dry approaches, independent cooldowns, alternate stairs, cancellation, hidden water, bounded diamond pickup retry |
| mining-timing | 6 | break times for tier ores, landing before digging, bare-hand stone when stranded, enchanted 26.1 tools, 5-tick destroy delay |
| mobility-recovery | 38 | unstick, shafts and pillars, safe drops, heap guard, surface scouts, swamp swims, tree approach limit and sliced search, land milestone, canopy descent, land mass and soil stock |
| night-policy | 10 | night work versus shelter, crowds, beds |
| night-skills | 13 | bed placement and sleep, shelter exits, cancellation |
| progression-skills | 37 | stairs, tunnels, verified liquid plugs, lava scoop rays, pool memory, side casting, portal approach and geometry |
| resource-routing | 9 | visible-target searches, support preservation, exits |
| sculk-caution | 8 | sculk alarms, zone, sneak flee, outward steps and carve fallback |
| shaft-memory | 11 | shaft recording, following, repair, pickless climb pause |
| side-probes | 23 | probe reach, spacing, anchors, hazards, descents |
| smelting | 16 | async smelt jobs, fuel due times, plank fuel, collection |
| station-recovery | 3 | workstation placement relocation, cooking recess beside a stair |
| survival-safety | 66 | shelters, health, reflexes, combat targeting and retreat on land and in water, self-overlapping placements |
| terrain-scout | 4 | land scouting, isolated pillars |
| tree-climb | 13 | eye-reach approach, tree pillars, scaffold recovery |
| under-feet | 7 | no digging under the hitbox, own blocks, dripstone |
| water-search | 11 | day/night water search, cover restriction, bucket-pair requirement, flooded-route avoidance and exit |

Run `npm run outline -- test/<file>` to list a file's test names with line numbers.

## Live status

Live means unaided survival unless marked staged (commands set up the scene,
none ran during the trial). "Automated" means regression tests only.

| Behavior | Status | Ref |
|---|---|---|
| Empty-inventory start through Suit Up (10 adv. in 28 min) | live | F057 |
| Iron pick priority, axe, shovel, rebuild after tool loss | live | F043–F045, F049, F095 |
| Full iron set, diamond pick/sword, Cover Me with Diamonds | live | F029, F031, F065 |
| Crafting and wearing diamond armor before Hot Stuff | automated / staged | F123 |
| Rejecting unsupported jump landings; dry berry approaches and pickup | automated | F124 |
| Drop caution: no diagonals, dig-jumps or sprinting beside 10+ block drops | automated / staged arena | F148 |
| Nether fortress line: prep, slab bridge, return and frontier walk on the recorded path, netherrack fallback | staged (no fortress seen yet) | F149 |
| Diamond interrupt, probe-exposed ore, dig-exposed vein ore | live / staged | F031, F054, F079, F100 |
| Remembered diamond behind an overhang, stair approach and pickup | automated / staged on original vein | F121 |
| Lava source with an obstructed centre ray | automated / staged at original ledge | F122 |
| Async smelting, plank fuel, one-charcoal batch | live | F037, F041, F106 |
| Wood-only cooking job, log-to-plank fuel, multi-charcoal | automated | F106 |
| Cooking cycle with parking and underground night cooking | live | F103 |
| Dusk descent with raw food, stair-side cooking and furnace pickup | automated / staged on existing stairs | F120 |
| Two-stage far cooking trip, parked job next day | automated | F103, F104 |
| Furnace return from a stalled hillside | staged | F096 |
| Hunting sheep, cows, pigs; out-of-view prey | live | F103 |
| Axe-equipped animal kill | automated | F095 |
| Shaft climb along a remembered route | live | F033 |
| Tunnel frontier return and parallel-tunnel merge | live / staged | F088, F098 |
| Descent merge into an old staircase | automated | F103 |
| Disposal pit, toss lanes and clutter cleanup | live | F019, F022, F050 |
| Keep rules and batch cleanup (1 to 9 free slots in one pass) | live | F115 |
| Line of sight without head turns | automated | F116 |
| Mining fallback while the water search is deferred | live | F116 |
| Night surface work when fully armed | automated | F117 |
| Gravel refills dug again, feet cleared after a fall | automated | F118 |
| Scooping water a dig reveals; water in reach as an opportunity | automated | F119 |
| Barrel vault build and deposit | live | F039, F044 |
| Restock after a death | not observed | F034, F039 |
| Cave survey and return through a natural cave | not observed | F013, F051 |
| Staged cave walk with checkpoints and loot | staged | F051 |
| High-tree pillar | staged | F097 |
| Water search with a daylight exit | live | F089 |
| Water-search stall deferral | live | F113, F115 |
| Rising staircase crossing its own excavations | automated | F113 |
| Digging into hidden water, verifying plugs, abandoning flooded routes | live dig, staged plug and escape, automated retry avoidance | F114, F141 |
| Night water search | automated | F089 |
| Underground night mining through a full night | live | F075 |
| Natural night burrow, 1x2 shelter, `mine_from_shelter` | automated / staged | F102 |
| Sleep with the owner, clean bed placement | automated; Sweet Dreams staged only | F017 |
| Melee interrupt and fight win; first fights back | live | F030, F031 |
| Kiting and alternating zombie crowds, armed skeletons | staged 7/7, rugged 12/13 | F101 |
| Isolated creeper sword duel | staged, 4 strikes, no damage | F112 |
| Cave combat while mining: lone skeleton, lone zombie | staged pass | F111 |
| Simultaneous creeper groups and staggered reinforcements | staged fail (timeouts, one death) | F111 |
| Crowd wall-pocket retreat and seal | staged | F094 |
| Pre-hit detection behind the bot | staged | F109 |
| Creeper flight, tunnel seal, archer cover | live | F020, F029, F030, F031 |
| Enderman gaze and refuges | staged | F086 |
| Sculk caution flee | staged 3/3 | F104 |
| Natural deep-dark flee, zone avoidance | not observed | F104 |
| Low-air rescue | staged pond | F091 |
| Lava escape, suffocation reflex | automated | F069, F074 |
| Pickless climb to the surface | live | F062, F110 |
| Not Today Thank You, A Seedy Place | live | F036, F046 |
| Ice Bucket Challenge, obsidian casting | staged | F053 |
| Same-pool cast from 8 to 10, dry reroute, swim ashore, Nether entry and return | staged casting, live recovery and portal | F142, F143, F144 |
| Take Aim, Enchanter, golem, fishing, breeding | automated | F036, F037, F059 |
| Redstone demo | automated | G009 |
| Bare-hand shelter exit and stair carving without a pickaxe | live (out of y=31, six levels) | F126 |
| Enchanted 26.1 tools at efficiency speed; 5-tick destroy delay | live | F128, F131 |
| Crafting two empty buckets before the first water search | live | F138 |
| Water buckets before lava, reachable berries, melee standoffs, water combat | automated; water combat staged | F127, F130, F146 |
| Disposal zones, sky-bound surface scouts, self-overlap placement | automated | F129 |
| Carving out of a sculk zone | live (left the zone 05:39Z) | F132 |
| Submerged-dig refusal, treading water, swamp swims and logs | live | F133, F134 |
| Biome exit, mainland after spawn, seagrass swims, tree route limit | live swamp exit; staged coast travel; coastal landing and tree route automated | F135–F137, F147 |
| Return to underground iron work after restart; first-time land search climbs and takes safe iron | live restart; initial climb and iron priority automated | F137 |
| Trunk platform, full canopy descent, soil stock | trunk platform staged, canopy automated, stock live | F135, F145 |
