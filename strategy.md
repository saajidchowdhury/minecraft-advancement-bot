# Strategy review

Living document for higher-level throughput analysis (CLAUDE.md "Two efficiency
goals"). Numbers come from the 2026-11-05 logs unless marked as estimates. Revise
when new evidence changes a ranking; goals.md carries the actionable queue.

## Where the time went (2026-11-05, port 51718)

| Sink | Evidence | Rough cost |
| --- | --- | --- |
| Deaths and rebuilds | 13+ deaths; rebuilds to full iron took 29–45 min | Dominant: hours |
| Waiting at furnaces | 60 smelt_iron actions, 1744 s total; batches of 3, ~10 s/item | ~29 min/day; ~5.5 min per rebuild (async smelting `bc7b277`) |
| Decision-loop idle | 1.5 s fixed delay after every action; median action gap 3.6 s | ~5% of run time (fixed `b85f0da`) |
| Idle nights | sheltering a whole night (~7 min) with nothing to do | Fixed: night mining `8afbc05`, `242cb07` |
| Re-digging stairs | ~124 steps, 4–5 min per descent before F033 | Now mostly removed |
| Stuck loops | wood/scout 'No path', shelter exits, recipe mismatches | Tens of minutes; several causes fixed, obsidian retries still open (F055) |

## Throughput levers, ranked by expected gain per effort

1. **Death cost.** The base (G013) turns a 30–45 min rebuild into a short walk once
   it holds spares; next add a bed at the base so respawn is beside it, and keep a
   spare iron kit stored. Survival fixes (F025–F035) cut the death rate itself.
2. **Fire-and-forget smelting.** Load all raw iron with enough fuel, leave the
   furnace, keep mining, and collect when the expected time has passed or when
   ingots are needed. Saves ~5 min per rebuild and most of the 29 min/day of idling.
3. **Loop latency.** Replan 250 ms after a successful action instead of 1.5 s; keep
   1.5 s only after failures (to avoid fast failure loops) and 100 ms after threats.
4. **Route to the Nether.** Fix the natural-site obsidian retry loop (F055)
   before measuring a continuous portal run. Nether entry unlocks several cheap
   advancements: Oh Shiny (gold to a piglin), Hidden in the Depths (ancient
   debris at Y 8–22 with the diamond pick), and later Into Fire / A Terrible Fortress.
5. **Enchanter.** User direction (2026-11-06): no sugar-cane farming; serious
   enchanting waits for a stronghold library's bookshelves. The bot earns Enchanter
   only from a book or paper already in hand (F059). The stronghold branch (eyes
   of ender, library) therefore carries the enchanting payoff.
6. **Cheap side advancements** (G014): breeding, fishing, Take Aim, wolf taming,
   Tactical Fishing. Each costs about a minute when conditions are met.
7. **Mining yield** (G008): measure ore per block for probe spacing; later G012
   relocation when a site is exhausted.
8. **Use banked iron.** Night mining now banks iron (up to 40) before diamonds. Spare
   iron makes Hired Help cheap (4 iron blocks = 36 ingots, plus a carved pumpkin from a
   pumpkin and shears) and fills the base's spare kit (G013).

## Advancements reachable with current or near-current skills

Earned in the port 51718 run (14): story root, mine_stone, upgrade_tools, smelt_iron, iron_tools,
obtain_armor, lava_bucket, mine_diamond, shiny_gear; adventure root, kill_a_mob,
sleep_in_bed (staged bed); husbandry root, plant_seed.

Near: deflect_arrow (shield charge implemented), breed_an_animal and fishy_business
(implemented), enter_the_nether (implemented, unverified),
shoot_arrow, tame_an_animal, tactical_fishing, enchant_item, distract_piglin,
obtain_ancient_debris, obtain_crying_obsidian, summon_iron_golem (36 iron + pumpkin).

Ice Bucket Challenge was server-confirmed in a later staged LAN cast (F053).

Out of scope: adventuring_time, explore_nether, all_effects, all_potions,
balanced_diet, bred_all_animals, complete_catalogue and similar exhaustive goals.

## Open refinements noticed live

- Async smelting starts a job at three raw iron, so jobs of 3–5 repeat furnace placement
  and pickup; batching to about eight when the need allows would cut overhead.
- Enchanter needs a book, an enchanting table (book, two diamonds, four obsidian) and
  lapis; without bookshelves offers cap at level 8. Per user direction, books and
  bookshelves come from loot and the stronghold library, not sugar-cane farming.
- A longer Nether stay needs one gold armor piece (gold boots: four ingots) against
  piglins; the base currently stores all gold, so the planner must keep four ingots then.
