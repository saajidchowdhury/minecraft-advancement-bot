# Findings

Updated 2026-11-12 (America/New_York). This file is the digest: the current
handoff, stable facts, policies in force, open problems and a one-line index.
Full evidence for each finding is in `FINDINGS-ARCHIVE.md`; search it by ID
(`rg -n '^## F112' FINDINGS-ARCHIVE.md`) rather than reading it whole.
Evidence labels: live (unaided), staged (commands set up the scene),
regression, inspection, hypothesis. Keep IDs stable.

To record a finding, append its full entry to the archive, add one index line
below, and edit the digest bullets it changes. Replace the current handoff
instead of adding another. Keep everything above the index under ~200 lines.

## Current handoff — 2026-11-12, session end

AdvancementBot resumed on `f0a8ab0` on LAN port 49503, PID 6832, with logs in
`outputs/2026-11-12@22.52.48/`. The F120 fix passed a staged LAN trial on the
existing staircase. The owner kit was supplied and verified before the restart
(`outputs/owner-kit-f120.json`). Check the newest snapshot and process before
live work. Verify the owner's kit for every gameplay login, including trials.
Baseline: 509 tests pass. The digest above the index is about 250 lines.

## Stable facts and process lessons

- Java 26.1.2, protocol 775. Mineflayer 4.39.0 uses its `26.1` data
  (`src/config.js`). Pinned registry errors are corrected locally for the
  obsidian tool speed (F053) and 108 blocks wrongly tagged
  `incorrect_for_wooden_tool` (F105). The game rule is `keep_inventory` (F101).
- The `patch-package` Mineflayer patch covers mixed-plank crafting, the window
  `close` event (F078) and an `air_supply` guard so other entities' air is not
  read as the bot's (F099).
- Launch with `./scripts/run.sh [port]` (Node 22+, `.tools/` runtime).
  `MC_WORLD_ID` labels memory in `.state/`; a changed seed hash clears saved
  coordinates. One unexplained reset on the same world is in F071 (F002).
- Each run records commit, source hashes, PID, config and UTC events under
  `outputs/<New York time>/` (F012). A running process never loads later edits.
  Stop only a verified single bot PID (F021). Do not restart a bot that is
  standing in water (F065).
- Only server packets confirm advancements, including AND-of-OR requirements
  and revocations (F003). Advancements earned with staged supplies are
  command-assisted, not survival progression (F101, F102).
- Tests: mocks must mirror the real library's return shapes and container
  boundaries (F008, F023). `Vec3.normalize` mutates (F090). The pinned
  pathfinder can resolve an empty no-path as success, so check the final
  position (F048, F096). `stop()` defers; clear goals with `setGoal(null)` (F004).
  Gate commits on the `npm test` exit status, not a grep of its output (F035, F060).
- Staging: space commands 800 ms apart and await replies (F101). Place a floor
  or glass platform before teleporting (F021, F101). Move observers out
  before removing structures (F088). Give summoned skeletons an explicit bow
  (F101). Run staged scripts in the visible Terminal and teleport the owner
  to a vantage point.
- Watching: a `Monitor` pipeline ending in `cut` buffers; filter with
  `grep --line-buffered`. Most diagnoses need only `bot.log` and `state.json`
  (F060). `state.json` lists carried items, not worn armor (F068).

## Policies in force

Checked against `src/` on 2026-11-12. Named constants are in the cited files.

Planner and gear order
- The first three ingots make an iron pick at once (F043). After the stone pick
  come a stone axe and shovel, before ordinary hunting and after rebuilds (F044,
  F049, F095). No wooden sword (F071). Carried armor and shields equip before
  tool progression or waiting (F093).
- Shield, iron sword, then iron leggings, helmet and boots before buckets.
  Hot Stuff waits for the full iron set (F071). A diamond pick at three
  diamonds, a diamond sword with two spare, even during a detour (F063, F073,
  F103), then diamond armor (F024).
- Location-bound ingredients (diamonds, obsidian, flint, redstone) precede
  wood. When a recipe lacks both wood and stone, wood comes first (F021, F057).
- The iron reserve counts furnace input, raw iron and ingots, and budgets three
  spare picks, three buckets and missing iron gear (`ironReserveCap`, F108).
  Visible iron interrupts work below the cap (F071).
- Daylight mining departure needs 32 log equivalents (`MIN_MINING_WOOD_PLANKS`),
  then 16 average cooked meats (`MIN_MINING_MEALS`, about 260.5 hunger plus
  saturation) (F071, F082). An empty-handed bot builds stone tools and an axe
  before hunting unless food is 6 or less (F104).

Mining and tunnels
- Targets need line of sight, not field of view (user direction, F116): a line
  from the eye to any point, edge or corner of the thing that passes no opaque
  block (leaves and glass are clear), whichever way the bot faces. Searches do
  not turn the head. Buried ore never steers a tunnel; with
  no visible iron the bot heads toward Y=16. Ore that its own dig exposed within
  6 blocks stays a target (F079, F080, F090, F100, F107). A watchdog checks
  resource walks every 1.5 s for new targets (F073).
- A confirmed diamond stays a priority within 48 blocks after loss of sight or
  combat. If dry walking fails, cut toward supported positions on up to four
  sides. Stand within one block of the ore's height before breaking it so its
  drop can be reached. A failed round defers the saved target for 120 s (F121).
- Never mine a natural block under the hitbox; step off first. Own placed blocks
  on sound support are exempt, and pointed dripstone is not a floor (F102).
- Hazards count only when visible: tunnel steps, probes and exposed ore judge
  liquid, falling blocks and missing floors by a sight line from the eye
  (`cellVisible`), never by chunk data behind rock. A dig that opens onto liquid
  plugs the opening and blocks that step for 120 s (F107, F114), except that
  water is taken while buckets are short: the bot digs what hides the source,
  scoops it, then plugs. A visible source in bucket reach outranks iron even
  while the water search is deferred (`waterInReach`, F119). The pathfinder's
  own digging (`safeToBreak`) still reads hidden liquid. Gravel and sand matter
  only above an opened cell: beside a step they are ignored, inside a cell they
  are dug through, refills are dug again (`settleFalling`), and one seen above
  the bot's own column refuses the step (F118). Sloped steps blocked by liquid
  fall back to level side steps (F064).
  Descents allow at most eight level detours (F094). Digs wait up to 400 ms for
  footing (F105).
- A saved frontier and stable heading prevent spirals. Returns reach 48 blocks.
  Only fresh digs count toward probe spacing, and probe anchors are remembered.
  Tunnels and staircases merge into parallel old ones (F088, F098, F103).
- Side probes run every 5 fresh steps, 5 blocks per side (`BOT_PROBE_SPACING`,
  F052, F087). A stone work pick is required only below 6 iron. Axes and
  shovels dig their own blocks (F005, F037, F044, F049).
- Furnaces, barrels and chests are never dug by tunnels or the pathfinder
  (F042). Stairs through a station are unusable (F062). Survival blocks go on
  plain supports, or the bot sneaks (F067).
- A completed surface-to-depth descent is stored as a shaft per dimension and
  climbed cell by cell. A blocked shaft is forgotten (F033).
- Cave surveys are dry with no digging: 48 steps or 2 min, saved checkpoints,
  own excavations excluded, torches at least 10 blocks apart (F013, F051, F084, F085).

Inventory, base and disposal
- Disposal tries the shielded pit (user technique), then a level or rising toss
  lane, then retreat, with a 60 s back-off (F019, F022). Cleanup starts at two
  free slots (`needsCleanup`), merges split stacks, then throws every
  discardable stack at once (F115).
- Carry rules (`src/inventory.js`, F115): at least 64 cobblestone, deepslate or
  netherrack in total plus 16 dirt; logs 40, fuel 32, gold 8, lapis 8, redstone
  16, side-goal drops and food; the two best pickaxes, the best other tool of
  each kind, and armor only if better than what is worn. Items without a rule,
  including copper and gunpowder, are junk. A full pack with no junk throws
  one low-priority stack, tries nearby storage, then drops in place (F050).
- The base is a sealed barrel vault in rock beside a tunnel. Restock needs a
  carried pickaxe. Carry and restock levels are equal, and side-goal
  materials stay carried (`src/base.js`, F038, F039, F058, F070).

Furnaces, fuel and food
- Jobs are asynchronous: load everything, keep working, and collect when the fuel
  runs out (`furnaceDue` from window tick properties) (F037, F103). Memory holds
  one smelt job and one active cooking job plus parked cooking jobs. Cooking
  furnaces are not used for iron or charcoal (F103).
- Smelt and cook jobs are abandoned only beyond 300 blocks. Cooking reach is
  300 by day on the surface, 64 underground, 8 at night; out-of-reach cooking
  jobs park (`src/food.js`, F103). A surface cooking job starts only if it
  finishes before tick 12500. Iron jobs are fetched early only beyond 250
  blocks. Far returns use normal movement beyond 24 blocks at 400 ms per block
  and pause after eight failed detours (F104).
- Carried coal and charcoal come first. Logs become planks only as needed:
  300 ticks per log or plank, 1600 per charcoal, 200 per item. Charcoal is made
  up to three at a time (`src/furnace-fuel.js`, F106). A fuel-starved job is
  ready when carried wood covers it (F103). A dry job without fuel takes its
  input back (F074).
- Stocked miners carry raw food to covered ground at Y=47 or lower. New
  underground cooking furnaces go in a supported recess beside the stair, with
  room to collect the furnace after breaking it (F120). Urgent meals can cook
  sooner. Furnace contents count toward the reserve (F103). Underground food
  taken in passing includes fish, ripe glow berries and up to four stews (F072).
- Hunts prefer axes and wait for charged swings (stone axe 1.25 s). Prey is
  dropped only after 3 s of terrain occlusion without closing 2 blocks (F095,
  F103). Low health starts a hunt only below 18 food (F104).

Combat and threats
- Line-of-sight alerts in any direction: melee 6, creeper 8, archer 12 blocks,
  with a 100 ms scan (`decision-engine.js`, F109). Attributed hits interrupt work
  (melee close, archers to 24 blocks); no turn to the bearing is needed (F081, F101, F116).
- An isolated creeper meets a sword at the edge of reach when HP is at least
  `CREEPER_DUEL_HP` (12), and the bot backs off farther if it swells (F112).
  Otherwise it escapes, sealing facing openings, or braces the shield within 4
  blocks (F020, F062, F109).
- The bot fights an attacker before eating, rotates between in-reach attackers,
  and does not eat with melee within 4 (F030, F101). It kites melee-only crowds of up
  to four when armed, above 10 HP, with no archer within 16 or creeper within 8,
  and not on a surface night. Three or more visible hostiles otherwise latch a
  wall-pocket retreat (F094, F101). A cornered escape becomes a fight (F068).
- A lone archer is charged with the shield cycled 0.6 s up and 0.9 s down
  (F031, F035, F101). The pillar refuge in `crowd-retreat.js` is not dispatched;
  it is kept for baiting Nether endermen (F101).
- Endermen: never face them and never fight; anger or a hit sends the bot to
  water, a sealed burrow or a side refuge (F086). Sculk or warden alarms record a
  48-block zone, and the bot sneaks out without drops or breaking sensors (F104).
- Deaths near crowds, archers or lava skip drop recovery (F029, F069).

Environmental reflexes
- Lava triggers `escape_lava` (pour water, drive to a dry cell) (F069, F074).
  Air at 12/20 or less triggers a direct swim until 18 (F065, F091, F099). A
  block at eye height, or a falling block enclosing the feet, triggers
  `clear_head` (F069, F118). Critical-health
  cancellation spares escapes and reflexes (F010, F069). At 6 HP or less the
  bot rests to 14 when fed and calm (F062).
- Fall damage, fire, cactus, berry bushes and powder snow have no reflex audit (F069).

Night and shelter
- No surface work at night unless night-ready: full iron-or-better armor worn,
  a diamond or netherite sword, a shield equipped and HP above 12
  (`nightSurfaceReady`, user direction, F117). Such a bot works and searches for
  water on the surface; a night retreat still shelters it. Underground mining
  continues at 12 HP as displayed (`state.health >= 11.5`); below that the bot
  shelters and waits (F071, F104). Other bots' night surface trips shelter
  underground instead (F035). Long restocks wait for
  daylight (F070). Surface exploration and water search outdoors are
  daytime only (F089).
- Shelters are 1x2 rooms (23-block surface enclosure, burrow, enderman refuge),
  verified from blocks and rechecked (F009, F102). The bot sleeps only while
  the configured owner is observably sleeping, Overworld only (F017).

Navigation and recovery
- Generic scaffolding is off. Escape and pursuit walk dry. Unstick never
  bridges or digs and never runs with a hostile within 8 (F094, F101). Scouts
  use `GoalNearXZ` (F025). High logs use eye-based reach and a pillar of at
  most 5 blocks (F097).
- A pickless bot climbs to surface level by pathfinding. Failed climbs pause
  for 30 s, and the surface never starts a lateral scout (F062, F110).
  `return_surface` never escalates to a drop-down unstick (F070).
- Path searches and actions are bounded. An operation that refuses cancellation
  forces a reconnect before the next action starts (F004).
- Rising tunnel steps may cross old excavations sideways; level and falling steps
  may not. Three in-place `fill_water_bucket` failures defer the water and portal
  route for 5 min (`WATER_DEFER_MS`), since that action has no other recovery (F113).
  While deferred, a bot with nothing else to do mines for diamonds until it holds
  16 (`DEFERRED_DIAMONDS`, F116).

## Open problems and unverified behavior

Highest risk first.
0. A night water search at (305,10,-106) hit the 12 s movement watchdog three
   times with no log line saying what it was doing. The deferral contains it,
   but it will retry every 5 min (F113). Digging into hidden lava is now
   possible, as for a player; the plug and the lava reflex are the only
   defences (F114).
1. Retreat under pursuit: reinforcements during an escape turned it into a
   wall-refuge search and one death. The staggered cases were not rerun after
   the F112 duel (F111).
2. Creepers in mixed groups: all four simultaneous creeper cases timed out (F111).
3. Missing natural evidence: crowd retreat with an obstructed seal (F094), the
   creeper duel on rough ground (F112), a deep-dark flee (F104), a night burrow,
   1x2 shelter and `mine_from_shelter` (F102), an axe kill (F095), a high-tree
   pillar (F097), a cave survey and return (F013, F051).
4. Unexplained: inventory loss after the warden recovery (F104), an unattributed
   16 HP hit at 07:59:04Z on 2026-11-11, the F071 memory reset, and a path into
   lava (F074).
5. Skeleton shielding should react to blocked arrows, not a timer. The bot also
   tunnelled perpendicular in a hallway trial (F101).
6. Regression-only: wood-only furnace jobs and multi-charcoal batches (F106),
   Take Aim and Enchanter (F059), golem (F037), fishing and breeding (F036), a
   continuous ten-obsidian cast and Nether entry (F053, F056), base restock
   after a death (F034, F039).
7. Unmeasured throughput: probe spacing (F006) and site relocation (G012).

## Progress records

- Fresh world 55502, unaided: ten advancements in 28 min with no deaths, then
  Diamonds! at about 45 min (F057).
- A bare rebuild reached full iron in about 29 min, and Cover Me with Diamonds
  44 min after an empty respawn (F031).
- Confirmed live at least once: story root, Stone Age, Getting an Upgrade,
  Acquire Hardware, Isn't It Iron Pick, Suit Up, Hot Stuff, Diamonds!, Cover
  Me with Diamonds, Not Today Thank You, Adventure, Monster Hunter, Husbandry,
  A Seedy Place. Staged only: Sweet Dreams (F017), Ice Bucket Challenge (F053).
- Deaths come from survival gaps more than missing features: 13 on 2026-11-05
  (F023–F035) and 13 on 2026-11-06 (F062–F076), then F081, F086, F094, F100,
  F102, F104, F109 and F111.

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
