# Findings

Updated 2026-11-13 (America/New_York). This file is the digest: the current
handoff, stable facts, policies in force, open problems and a one-line index.
Full evidence for each finding is in `FINDINGS-ARCHIVE.md`; search it by ID
(`rg -n '^## F112' FINDINGS-ARCHIVE.md`) rather than reading it whole.
Evidence labels: live (unaided), staged (commands set up the scene),
regression, inspection, hypothesis. Keep IDs stable.

To record a finding, append its full entry to the archive, add one index line
below, and edit the digest bullets it changes. Replace the current handoff
instead of adding another. Keep everything above the index under ~200 lines.

## Current handoff — 2026-11-13 evening

Bot is on port 51391 (PID 27956, Terminal window 2250, logs
`outputs/2026-11-13@23.40.12/`). It left the stuck swamp canopy and gathered
wood on forest ground without a teleport (F147). At 23:42 ET it was
returning upward near 150,32,-58 at full health with eight raw iron,
one plank and no pickaxe. It switched to hand excavation after its stone
pick broke. Its startup Git revision predates the biome commit, but the
startup source hashes match the committed code. Baseline: 573 tests pass.

## Stable facts and process lessons

- Java 26.1.2, protocol 775. Mineflayer 4.39.0 uses its `26.1` data
  (`src/config.js`). Local registry fixes: obsidian tool speed (F053), 108
  blocks wrongly tagged `incorrect_for_wooden_tool` (F105). `keep_inventory`
  is false in the LAN world; staged trials enable it and restore it (F101).
- `patch-package` patches: Mineflayer (mixed-plank crafting, window `close`
  F078, `air_supply` guard F099), mineflayer-pathfinder (landing checks), and
  prismarine-item, which normalizes 26.1 component enchantments to
  `[{ name, lvl }]` (F128). `patch-package --reverse` reverts every patch;
  reapply them all afterwards.
- Pathfinder facts: `searchRadius` (48) is also A*'s cost slack above the start
  heuristic (F134). Only water and lava are library liquids; seagrass, kelp
  and bubble columns are added (F136). Movements without `liquids`,
  `exclusionAreasStep`, `getMoveDiagonal` or `getMoveJumpUp` are not real
  ones; mocks must carry them.
- Perch caution (`src/perch-caution.js`, F148): where every column within ±2
  in x and z, except the move's own, tops out 4+ blocks below the support,
  A* drops diagonals from or onto it and digging jump-ups, and sprint is off.
- Launch with `./scripts/run.sh [port]`; a changed seed clears saved
  coordinates (F002, F071). Runs record commit, hashes, PID and events under
  `outputs/<New York time>/` (F012); a running process never loads later
  edits. Stop only a verified PID (F021); restart a swimming bot right after a
  breath (F065, F133).
- Only server packets confirm advancements (F003). Staged supplies, such as
  the user's enchanted netherite pickaxe, make progress command-assisted
  (F101, F102, F128).
- Tests: mocks mirror the real library: `blockAt` floors positions,
  `inventory.items()` exists, getPathFromTo is a generator (F008, F023, F133).
  `Vec3.normalize` mutates (F090). An empty no-path can resolve as success,
  so check the final position (F048, F096). `stop()` defers; clear goals with
  `setGoal(null)` (F004). Gate commits on the `npm test` exit status (F035, F060).
- Staging: space commands 800 ms apart and await replies; place a platform
  before teleporting; run staged scripts visibly and teleport the owner to a
  vantage point (F021, F088, F101). Read-only EffectHelper probes replay the
  bot's path searches on real chunks (F134). Most diagnoses need only
  `bot.log` and `state.json`, which omits worn armor (F060, F068).

## Policies in force

Checked against `src/` on 2026-11-13. Named constants are in the cited files.

Spawn, water and land
- Leave swamps, mangrove swamps, rivers, frozen rivers, oceans, and sandy
  beaches before looking for mainland. Hold one cardinal heading and follow
  the ocean edge when reached. Finish on solid footing in a different biome.
  Skip trees whose approach requires over eight consecutive swim blocks (F147).
- A new Overworld player seeks dry land until it reaches it once (F137).
  Existing progress migrates old saves; the milestone survives death and
  restarts. The initial land seeker uses the surface-return skill while
  underground and collects safe visible iron within the reserve cap. A land
  destination has open sky, dry feet and head, dry horizontal neighbours and
  at least 1000 exposed ground blocks joined 26-ways (`landMassSize`). Candidates
  come from 96 blocks out, trips swim at water cost 1 with a 192 slack and
  1.2 s per block, and failures scout. A tree-top or stump spawn digs down
  through tree blocks onto a safe landing. A bot that swam stocks 16 soil
  blocks first (F135).
- Water-filled blocks (water, bubble columns, seagrass, kelp, waterlogged)
  are water everywhere (`waterFilled`, F135, F136). Water costs 3 per step, or
  1 while the bot is in water; unstick from water may swim (F134). An idle
  bot in water holds jump to tread (F134).
- Collection digs that outlast the air above the 12-bubble cutoff are refused,
  and a low-air cancel blocks the whole tree (F133, F134). Wood targets only
  logs that are safe to break. A four-sided water-bound trunk gets a
  low-cost platform at the waterline even with a dry bank nearby (F145).

Planner and gear order
- The first three ingots make an iron pick (F043). The stone pick is followed
  by a stone axe and shovel (F044, F049, F095). No wooden sword (F071).
  Carried armor and shields equip first (F093).
- Shield, iron sword, then iron-or-better armor before planned bucket
  work (F071). Craft both empty buckets before the first water scoop, or one
  empty if one water bucket is already filled. An eligible water source can
  interrupt work even when the search is deferred (F119, F127, F138). A
  diamond pick at three diamonds, a diamond sword with two spare, then
  affordable armor before routine work (F063, F073, F103, F123).
- Location-bound ingredients precede wood; wood precedes stone when a recipe
  lacks both (F021, F057). The iron reserve counts furnace input and budgets
  three spare picks, three buckets and missing gear (`ironReserveCap`, F108).
- Mining departure needs 32 log equivalents and 16 average cooked meats
  (`MIN_MINING_WOOD_PLANKS`, `MIN_MINING_MEALS`; F071, F082). An empty-handed
  bot builds stone tools and an axe before hunting unless food is 6 or less (F104).

Mining and tunnels
- Digs follow vanilla timing plus the 5-tick (250 ms) delay after any break
  longer than one tick (F131). With no pickaxe and too little wood for one
  (`pickaxeStranded`), stone and deepslate are dug by hand, never ore or
  obsidian, with fourfold timeouts (F126).
- Targets need line of sight, not field of view (F116). Buried ore never steers
  a tunnel; with no visible iron the bot heads toward Y=16. Ore its own dig
  exposed within 6 blocks stays a target (F079, F080, F090, F100, F107).
- A confirmed diamond stays a priority within 48 blocks (F121); lava scoops
  verify a ray from dry ground (F122). Diamond walks allow 15 seconds and a
  target's cooldown leaves other visible ore eligible (F139). A diamond drop
  gets 45 seconds to approach and a separate retry ahead of new ore (F140).
  Never mine a natural block under the hitbox except in a canopy descent; a placement overlapping the hitbox
  centres the bot first (F102, F129, F135).
- Hazards count only when visible (`cellVisible`). A revealed liquid triggers
  verified plugs in the openings, including extra cuts made for a scoop.
  Keep those plugs intact. A flooded staircase is abandoned, with a nearby
  reachable upstream plug tried before leaving the current (F141).
- Keep up to ten visible lava sources from the active pool and replenish
  the list as the pool opens up. Cast in a reusable side pit off the
  walking floor (F142). Reject stair steps crossing known plugs before
  choosing a target, and allow lateral return detours into earlier cuts (F143).
  Gravel matters only above an opened cell (F118).
  Liquid-blocked slopes take level side steps; descents allow eight level
  detours (F064, F094).
- Sculk zones (48 blocks) block steps that do not gain distance from their
  centre; a failed walking flee carves up and away (F132).
- Frontiers and merges prevent spirals (F088, F098, F103); probes every 5
  fresh steps (F052, F087); containers are never dug (F042); shafts are stored
  (F033); cave surveys are dry and bounded (F013, F051, F084, F085).

Inventory, base and disposal
- Disposal: shielded pit, then toss lane, then retreat; 60 s back-off (F019,
  F022). Cleanup starts at two free slots and throws every discardable stack
  (F115). Lane and in-place drops leave a 5 min, radius-3 zone costing walking
  routes 20 per step (F129).
- Carry rules (`src/inventory.js`): 64 stone-type blocks plus 16 dirt, logs 40,
  fuel 32, the two best pickaxes, the best other tool per kind, better armor
  only. Wool, leather and all seeds are junk (F115, F125, F127).
- The base is a sealed barrel vault with matching carry and restock levels;
  leather is neither (F038, F039, F058, F070, F127).

Furnaces, fuel and food
- Furnace jobs are asynchronous with `furnaceDue`; one smelt job, one active
  and several parked cooking jobs (F037, F103). Jobs are abandoned beyond 300
  blocks; cooking reach is 300 by day, 64 underground, 8 at night; surface
  jobs must finish by tick 12500 (F103, F104).
- Coal first; logs become planks only as needed; charcoal three at a time
  (F106); dry jobs take their input back (F074). Underground cooking uses a
  recess beside the stair (F120). Food in passing: fish, ripe glow berries
  with a dry walk of at most 24 moves (F127) and up to four stews (F072).
- Hunts prefer axes and wait for charged swings; prey is dropped after 3 s of
  occlusion (F095, F103). Low health starts a hunt only below 18 food (F104).

Combat and threats
- Line-of-sight alerts: melee 6, creeper 8, archer 12 blocks; attributed hits
  interrupt work (F081, F101, F109, F116). A lone creeper is duelled at 12 HP
  or more, otherwise escaped or shielded (F020, F062, F109, F112).
- The bot fights before eating, rotates swings, kites up to four melee mobs
  when armed and healthy, and wall-retreats from three or more otherwise
  (F030, F068, F094, F101). A lone archer is charged with the shield cycled
  (F031, F035, F101).
- Water combat can swim to close, strike a visible enemy already in range,
  and swim away when hurt. Air and lava reflexes take priority (F146).
- A melee mob that gains under 0.5 blocks in 4 s while awaited is stood down
  for 60 s unless it closes 1 block; archers never are (F130).
- Endermen are avoided, never fought (F086). Deaths near threats or lava skip
  drop recovery (F029, F069).

Environmental reflexes, night and recovery
- `escape_lava`, a swim at 12/20 air until 18, and `clear_head` for blocks at
  eye height (F065, F069, F074, F091, F099, F118). At 6 HP or less the bot rests
  to 14 when fed and calm (F062). Fall, fire, cactus and powder snow have no
  reflex audit (F069).
- Surface work at night needs full iron-or-better armor, a diamond sword, a
  shield and HP above 12 (`nightSurfaceReady`, F117). Underground mining
  continues to 12 HP (F071, F104). Shelters are verified 1x2 rooms; sleep only
  while the owner sleeps (F009, F017, F102).
- Surface scouts that start under open sky stay there (F129). Unstick never
  bridges and never runs with a hostile within 8 (F094, F101). High logs use
  eye-based reach and pillars of at most 5 (F097). Pickless climbs pause 30 s
  between failures (F062, F110). Three in-place water-search failures defer
  the water and portal route 5 min (`WATER_DEFER_MS`, F113, F116).

## Open problems and unverified behavior

Highest risk first.
1. Full coastal landing, first-spawn mainland selection and a natural
   trunk-platform approach still need live evidence (F135–F137, F145, F147).
   A "falling air above the bot" loop (05:39Z) cleared itself, unrecorded.
2. Retreat under pursuit and creepers in mixed groups failed staged cases
   (F111). The night water search watchdog stall is contained but unexplained
   (F113); digging into hidden lava relies on the plug and reflex (F114).
3. Missing natural evidence: crowd retreat with an obstructed seal (F094), the
   creeper duel on rough ground (F112), burrows and `mine_from_shelter` (F102),
   a high-tree pillar (F097), a cave survey (F013, F051), sculk exits (F132).
4. Unexplained: inventory loss after the warden recovery (F104), an
   unattributed 16 HP hit (2026-11-11), the F071 memory reset, a path into lava
   (F074).
5. Skeleton shielding should react to blocked arrows, not a timer (F101).
6. Regression-only: multi-charcoal jobs (F106), Take Aim and Enchanter (F059),
   golem (F037), fishing and breeding (F036), base restock after a death
   (F034, F039), and a long bare-hand climb (F126). Casting ten obsidian
   from zero remains open (F142). Forced-death respawns are only an idea
   (STRATEGY.md).

## Progress records

- Unaided: ten advancements in 28 min, Diamonds! at about 45 min (F057); a
  bare rebuild to full iron in 29 min (F031).
- Confirmed live at least once: story root, Stone Age, Getting an Upgrade,
  Acquire Hardware, Isn't It Iron Pick, Suit Up, Hot Stuff, Diamonds!, Cover
  Me with Diamonds, Not Today Thank You, Adventure, Monster Hunter, Husbandry,
  A Seedy Place, Ice Bucket Challenge, We Need to Go Deeper and Nether
  root (F142, F144). Staged only: Sweet Dreams (F017).
- Deaths come from survival gaps: 13 on 2026-11-05 (F023–F035), 13 on
  2026-11-06 (F062–F076), then F081 through F124.

## Index

- F001 Project scope and visibility [user requirement]
- F002 Runtime, identity and world memory [live verified; changeable]
- F003 Advancement completion is not equipment ownership [live + regression]
- F004 Navigation needs bounded, supported steps [live + regressions]
- F005 Tool conservation affects net advancement progress [live + regression]
- F006 Side probing works; spacing eight is not optimized [live + regression]
- F007 Pursuit must retain its dynamic follow goal [live + regression]
- F008 Furnace windows own the active inventory [regression; live retry pending]
- F009 A shelter-complete log is not a safety proof [live failure + inspection]
- F010 Critical-health cancellation currently interrupts escape [live + inspection]
- F011 Wood, inventory and workstation logistics remain inefficient [observed]
- F012 Coverage and source provenance [verified baseline]
- F013 Cave surveys and shared-resource preparation [implementation + regression]
- F014 Rubble disposal can immediately undo itself [live failure + regression]
- F015 Disposal retreat still stalled in the long run [live + uncertainty]
- F016 Night work now depends on readiness and useful opportunities [tests + research]
- F017 Controlled night evidence and LAN sleep coordination [live + regression]
- F018 Staged hunt succeeded; natural encounter exposed earlier retreat needs [live + regression]
- F019 Lane disposal fixed the tunnel-face pause; drops seed return routes [live + regression]
- F020 Creepers: interrupt on sight, seal narrow passages, otherwise flee [live + regression]
- F021 Planner wood order, survey torches and the surface test [live + regression]
- F022 Shielded-pit disposal and diamond priority [user technique + live + regression]
- F023 A perception exception killed the bot; respawn recovery gaps [live failure + regression]
- F024 Throughput principle and the gear route [user direction + regression]
- F025 Second death and stuck-terrain fixes [live + regression]
- F026 Empty-handed nights: burrow, roof support and two more deaths [live + regression]
- F027 Creeper chase, critical-health thrash and an archer death [live + regression]
- F028 Gear route live; a skeleton crowd killed the bot [live + regression]
- F029 Sealing works live; the skeleton nest needed line-of-sight threat logic [live + regression]
- F030 Fast replanning, live seals and burrow; a lone zombie killed an armored bot [live + regression]
- F031 First fights back, mid-range archers and the off-centre burrow [live + regression]
- F032 Death 10 lost the diamond gear to a creeper flight under zombie hits [live + regression]
- F033 Remembered shaft for surface↔Y=-54 travel [user direction + regression]
- F034 Base chest phase 1 [user direction + regression]
- F035 Night surfacing deaths; shield while charging archers [live + regression]
- F036 Cheap husbandry branches: A Seedy Place and Fishy Business [JAR criteria + regression]
- F037 Throughput from the strategy review: loop latency and async smelting [logs + regression]
- F038 Base hardened into a sealed underground vault [user direction + regression]
- F039 Vault container and forgotten furnace iron [user reports + regression]
- F040 Fresh-world bootstrap and clean early disconnect (port 53606)
- F041 Fuel-starved iron jobs and obstructed shelter roofs
- F042 A loaded furnace disappeared during mining
- F043 Iron pickaxe priority and productive nights
- F044 Stone axe for wood and workstation recovery
- F045 Restore mining tools locally and collect the ready furnace
- F046 Mining supplies and return stairs
- F047 A zombie group grew during a fight
- F048 Food search stalled at a shoreline corner [live replay + regression]
- F049 Maintain a digging shovel after the stone axe
- F050 Inventory cleanup must free space autonomously
- F051 Cave checkpoints and chest loot
- F052 Five blocks per side probe
- F053 Two water buckets and working obsidian casting
- F054 Mine safe diamond discoveries before continuing the tunnel
- F055 Obsidian verification repeats at a natural site [live failure; resolved by F056]
- F056 F055 root cause: a water bucket was used to scoop lava [log + regression]
- F057 Fresh world on port 55502: early route and three planner stalls [live]
- F058 Side-goal materials were deposited at the base [code + regression]
- F059 Take Aim, portal standing row and Enchanter [regressions only]
- F060 Session efficiency notes
- F061 A geared bot idled a night in a surface shelter [live + regression]
- F062 First death on the 55502 world, and the bare-respawn loops [live + regressions]
- F063 Iron picks spent on a lava search while carrying diamonds [live]
- F064 Tunnels stalled where liquid touched every sloped step [live + regression]
- F065 Cave springs, a drowning, and the water-bucket step [live + regressions]
- F066 Tunnel back to an unreachable smelt furnace [live + regression]
- F067 Survival blocks refused against the bot's own furnace [live + regression]
- F068 Death #3: an armored escape pinned in a tunnel [live + regression]
- F069 Death #4: burning in lava with no reflex [live + regression]
- F070 Deaths #5–#7: bare respawns in mob caves at night [live + regressions]
- F071 User live-test notes applied (2026-11-06) [user observation + regressions; live pending]
- F072 Underground food opportunities, fish shores and a provisional home [regressions; live pending]
- F073 Diamond sword order and lichen-covered ore faces [user observation + regressions]
- F074 Death #8: a fuel-less cooking job walked the bot into lava [live + regressions]
- F075 Live: rebuild after death #8 with the F071–F074 policy [live]
- F076 Deaths #9–#13: cave-spider spawner, then bare respawns on sand [live]
- F077 First iron descent skipped the meal reserve [live observation + regressions]
- F078 Furnace window progress listener leak [reproduced + regressions]
- F079 Mining follows visible targets only [replay + regressions]
- F080 Continue mining newly exposed faces [saved terrain + regression]
- F081 A close zombie hit failed to interrupt an upward dig [live + regression]
- F082 Daylight wood before food and the delayed iron pick [live + regressions]
- F083 Remove deprecated entity lookup traces [logs + regression]
- F084 Surveys climbed the bot's stairs and placed excess torches [live + regressions]
- F085 Hard ten-block cave torch spacing [live report + regressions]
- F086 Enderman gaze prevention and sealed refuges [live + regressions]
- F087 Four blocks between successive side branches [user direction + regression]
- F088 Clockwise tunnel steering can excavate rectangular rooms [logs + replay]
- F089 Water search abandoned a covered staircase at the surface-height threshold
- F090 Leaves hid remaining trunks; level scans missed overhead logs
- F091 Low-air work interruption and direct rescue swimming
- F092 A moving log drop was mistaken for an unreachable tree
- F093 Unequipped recovery gear and a broken pick caused a night idle loop
- F094 A failed descent recovered by bridging into a mob-filled cave
- F095 Rebuilding iron progression skipped hunting tools
- F096 Cooking return retried a stalled walking route for ninety seconds
- F097 High tree logs were "No path" because approach reach was measured from the feet
- F098 Detour returns re-probed and paralleled an existing tunnel
- F099 False low-air alarms came from other entities' air supply
- F100 Mined iron left behind: out-of-view drops and pit-hidden vein faces
- F101 Skeleton death root cause and staged combat practice
- F102 Fall through a stalactite under mined iron; no digging under the feet
- F103 Hunt abandoned an adjacent cow; cooking interrupted gathering
- F104 Warden death in the deep dark; sculk caution [live + staged recovery]
- F105 Late ore breaks and hunting drops outside the view cone
- F106 Convert furnace wood to planks and batch charcoal
- F107 Ore visibility, blind aquifers and approach alignment
- F108 Furnace iron counts toward the equipment reserve
- F109 Pre-hit mob detection and a shorter creeper retreat
- F110 Surface return exhausted both picks
- F111 Cave combat while mining and smelting
- F112 Sword strikes and retreat against an isolated creeper
- F113 A water search froze beside water; deferral released Cover Me with Diamonds [live + regression]
- F114 Hazards judged by sight, not hidden chunk data; revealed liquid is plugged [user direction + live + regression]
- F115 Inventory cleanup ran every tunnel segment; keep rules, outclassed gear, batch cleanup [live + regression]
- F116 Line of sight replaces the view cone; head turns removed [user direction + regression]
- F117 Night surface work for a fully armed bot [user direction + regression]
- F118 A fallen gravel column trapped the bot by the feet; gravel handling [live + regression]
- F119 Water treated as an opportunity while buckets are short [user direction + regression]
- F120 Cooking furnace obstructed the stairs and was left outside night shelter [live failure + regression + staged]
- F121 Diamond under an overhang lost after path failures [live failure + regression + staged]
- F122 Deepslate blocked a lava bucket's centre ray [live failure + regression + staged]
- F123 Diamond armor now interrupts routine work [live delay + regression + staged]
- F124 Fatal fall during a deferred water search [live failure + regression]
- F125 Cleanup throws wool, leather and wheat seeds [user direction + regression]
- F126 Pickless bot sealed in night shelter digs out by hand [live failure + user direction + regression]
- F127 Water buckets before lava; reachable glow berries only; no leather restock [user direction + live failure + regression]
- F128 Enchanted tools crashed dig timing on 26.1 item components [live failure + regression]
- F129 Surface scouts walked down own stairs; placements overlapped the bot; lane tosses re-collected [live failure + staged + regression]
- F130 Unreachable zombie froze repeated fights [live failure + regression]
- F131 Vanilla 5-tick destroy delay between timed breaks [user report + regression]
- F132 Sculk zone blocked every tunnel step, including the way out [live failure + regression]
- F133 Submerged log dig retried after every breath [live failure + regression]
- F134 Water impassable inside the path cost budget; swamp trees blocked [live failure + inspection + regression]
- F135 Reach dry land first after every Overworld spawn [user direction + regression]
- F136 Pathfinder treated seagrass and kelp as air [user report + inspection + regression]
- F137 Returning underground players no longer repeat the initial land search [live + regression]
- F138 Wait for the full pair of empty buckets before the first water scoop [user direction + live + regression]
- F139 Cave diamonds needed a longer supported walk and independent cooldowns [live + replay + regression]
- F140 Mined diamonds get a longer pickup and a separate retry [user direction + regression]
- F141 Seal staircase leaks and abandon flooded routes [user direction + staged + regression]
- F142 Remember lava sources and reuse a casting pit off the path [user direction + staged + regression]
- F143 Route around sealed ceiling plugs when returning to the surface [live + regression]
- F144 Swim to dry ground when portal preparation starts in water [live + regression]
- F145 Stand on a surface-water platform before cutting a water-ringed trunk [user direction + staged + regression]
- F146 Use swimming routes for combat and retreat [live failure + staged + regression]
- F147 Leave water-heavy surface biomes before seeking mainland or wood [live + staged + regression]
- F148 Perch caution after a 22-block dig-then-diagonal-jump fall [live failure + user direction + regression]
