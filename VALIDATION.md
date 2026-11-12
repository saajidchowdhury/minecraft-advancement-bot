# Validation

Updated 2026-11-12 (America/New_York). Host: MacBookPro. Minecraft Java 26.1.2,
LAN protocol 775. Ordinary bot: AdvancementBot. The seeded cave arena uses a
separate CavePractice player. This file holds the current baseline, what each
test file covers and the live status of each behavior. Per-change test
history is in `FINDINGS-ARCHIVE.md` and git. Update the baseline and the
affected rows in place; do not add a dated changelog.

## Baseline

497 tests and `npm run check` pass at `8bd5fab`.
Run them with the prepared runtime:

```sh
PATH="$PWD/.tools/node-v26.13.0-darwin-x64/bin:$PATH" npm run check
PATH="$PWD/.tools/node-v26.13.0-darwin-x64/bin:$PATH" npm test
```

Commit only when the full suite reports zero failures. Check the exit status
or the `# fail 0` line, not a filtered grep (F035, F060). Each regression that
guards a fix must fail on the pre-fix source. Mocks must mirror the pinned
library's real shapes (F023). A passing suite never establishes a live
advancement; only server packets do. Every produced code file stays under 10%
comment-bearing lines. The highest is `decision-engine.js` at 30/327 (9.2%),
which leaves little room for more comments there.

## Test files

| File | Tests | Covers |
|---|---|---|
| action-progress | 4 | what counts as progress for wood, ore and diamond actions |
| advancement-plan | 26 | route IDs, gear and tool order, rebuilds after loss, iron cap |
| advancement-tracker | 5 | AND-of-OR requirements, resets, revocation, phantom completions |
| archery | 5 | Take Aim ballistics, line-of-fire safety, planner gating |
| base | 13 | vault site, deposit/restock levels, migration, sealed-vault access |
| cave-exploration | 29 | survey routing, checkpoints, footing, torches, reserves, loot interrupt |
| charcoal | 3 | furnace-window inventory (F008), cooking-job isolation |
| combat-navigation | 10 | creeper duel, hunting with axes, out-of-view prey and drops |
| config | 1 | LAN port bounds, 26.1.2 protocol data |
| crowd-retreat | 11 | crowd latch, wall-pocket retreat and seal, pillar refuge |
| decision-engine | 57 | planner priorities: danger, food, night, threats, reflexes |
| dependency-patches | 4 | Mineflayer patch: crafting, furnace close, entity air |
| drowning | 6 | low-air interrupt, direct swim rescue, dry station pickup |
| enchanting | 5 | Enchanter gating, offer choice, zero-level wait |
| enderman | 11 | gaze avoidance, anger, refuge priority and persistence |
| farming | 6 | A Seedy Place, Fishy Business, breeding |
| food-gathering | 3 | stew crafting, prey quarantine, watchdog recovery |
| food | 22 | cooking jobs: reach, parking, far returns, detours, due times |
| golem | 3 | Hired Help site, build order, gating |
| inventory | 20 | keep rules, outclassed gear, batch trigger, stack merge, pits, lanes, full packs |
| leaf-vision | 8 | leaf-transparent rays, overhead trunks, moving drops |
| loot | 2 | chest and chest-minecart looting |
| memory-random | 2 | seeded rng, atomic world memory |
| mined-ore-recovery | 7 | dig-exposed ore, hidden water, corner approach, out-of-view drops |
| mining-timing | 3 | break times for tier ores, landing before digging |
| mobility-recovery | 16 | unstick, shaft and pillar detection, safe drops, heap guard |
| night-policy | 10 | night work versus shelter, crowds, beds |
| night-skills | 13 | bed placement and sleep, shelter exits, cancellation |
| progression-skills | 32 | stairs, tunnels, portal geometry, frontier, merges |
| resource-routing | 9 | visible-target searches, support preservation, exits |
| sculk-caution | 5 | sculk alarms, zone, sneak flee |
| shaft-memory | 11 | shaft recording, following, repair, pickless climb pause |
| side-probes | 23 | probe reach, spacing, anchors, hazards, descents |
| smelting | 16 | async smelt jobs, fuel due times, plank fuel, collection |
| station-recovery | 2 | workstation placement relocation |
| survival-safety | 62 | shelters, critical health, reflexes, threats, combat events |
| terrain-scout | 4 | land scouting, isolated pillars |
| tree-climb | 13 | eye-reach approach, tree pillars, scaffold recovery |
| under-feet | 7 | no digging under the hitbox, own blocks, dripstone |
| water-search | 8 | day/night water search, cover restriction |

Run `npm run outline -- test/<file>` to list a file's test names with line numbers.

## Live status

Live means unaided survival unless marked staged (commands set up the scene,
none ran during the trial). "Automated" means regression tests only.

| Behavior | Status | Ref |
|---|---|---|
| Empty-inventory start through Suit Up (10 adv. in 28 min) | live | F057 |
| Iron pick priority, axe, shovel, rebuild after tool loss | live | F043–F045, F049, F095 |
| Full iron set, diamond pick/sword, Cover Me with Diamonds | live | F029, F031, F065 |
| Diamond interrupt, probe-exposed ore, dig-exposed vein ore | live / staged | F031, F054, F079, F100 |
| Async smelting, plank fuel, one-charcoal batch | live | F037, F041, F106 |
| Wood-only cooking job, log-to-plank fuel, multi-charcoal | automated | F106 |
| Cooking cycle with parking and underground night cooking | live | F103 |
| Two-stage far cooking trip, parked job next day | automated | F103, F104 |
| Furnace return from a stalled hillside | staged | F096 |
| Hunting sheep, cows, pigs; out-of-view prey | live | F103 |
| Axe-equipped animal kill | automated | F095 |
| Shaft climb along a remembered route | live | F033 |
| Tunnel frontier return and parallel-tunnel merge | live / staged | F088, F098 |
| Descent merge into an old staircase | automated | F103 |
| Disposal pit and toss lanes | live | F019, F022 |
| Clutter cleanup | live | F050 |
| Keep rules and batch cleanup (1 to 9 free slots in one pass) | live | F115 |
| Night water-search stall deferred | live | F115 |
| Line of sight without head turns | automated | F116 |
| Barrel vault build and deposit | live | F039, F044 |
| Restock after a death | not observed | F034, F039 |
| Cave survey and return through a natural cave | not observed | F013, F051 |
| Staged cave walk with checkpoints and loot | staged | F051 |
| High-tree pillar | staged | F097 |
| Water search with a daylight exit | live | F089 |
| Water-search stall deferral | live | F113 |
| Rising staircase crossing its own excavations | automated | F113 |
| Digging into hidden water and plugging it | live (re-dig loop fixed after, regression only) | F114 |
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
| Continuous ten-obsidian cast, Nether entry and return | not observed | F056, F059 |
| Take Aim, Enchanter, golem, fishing, breeding | automated | F036, F037, F059 |
| Redstone demo | automated | G009 |
