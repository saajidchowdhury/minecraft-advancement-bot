# Cave opportunities and advancement dependencies

Research checked 2026-11-05 for the current Java 26.1.2 LAN setup. Sources below
are Java release notes and Mojang articles about established mechanics; avoid
applying later Bedrock or Java updates to this world. Candidate branches are
planning, not claims that their skills or advancements are implemented.

| Find | Useful preparation or advancement branch | Current handling |
| --- | --- | --- |
| Exposed iron, coal and diamonds | Armor, shields, tools, buckets, fuel, lighting; Diamonds! and later enchanting | Current ore first; nearby harvestable reserves collected opportunistically |
| Gold | Gold armor for ordinary piglins and ingots for later bartering; does not protect against piglin brutes | Capped raw-gold/ingot reserve; armor/bartering skills pending |
| Lapis | Later enchanting after a table, experience and equipment are available | Capped reserve; enchanting skill pending |
| Copper and amethyst geodes | Two copper ingots plus an amethyst shard make a spyglass; looking at a parrot, ghast or dragon can give its associated advancement | Copper reserve; mature-cluster harvesting and spyglass skills pending; preserve budding amethyst |
| Lush-cave glow berries | Edible supplies and renewable vines; can support cave trips without returning to surface | Food value known; harvesting berry-bearing cave vines pending |
| Lush-cave axolotls and tropical fish | Catch an axolotl for The Cutest Predator; later axolotl-assisted combat for The Healing Power of Friendship! | Bucket/entity interaction and safe-bank approach pending |
| Glow squid | Glow ink for Glow and Behold, which requires making a sign glow | Combat, pickup and sign interaction pending |
| Mineshafts | Wood structures, rails and chest minecarts; glow berries are among chest loot | Recognizing structures and selective container looting pending; avoid cave-spider spawners |
| Underground lava/water and natural descent | Hot Stuff, obsidian, portal preparation and access to deeper ore levels | Existing bucket/obsidian route; bounded dry walking added, no swimming or cliff drops for exploration |
| Deep-dark/ancient-city features | Possible later exploration and loot | Defer; survey avoids adjacent sculk sensors/shriekers and treats wardens as threats |

Mojang's [lush-cave overview](https://www.minecraft.net/en-us/article/around-block--lush-caves)
describes ores, glow berries, tropical fish, axolotls, glow squid and hostile mobs.
The [Java Caves & Cliffs Part I release notes](https://www.minecraft.net/en-us/article/caves---cliffs--part-i-out-today-java)
provide the axolotl/sign/spyglass advancement triggers, spyglass ingredients,
mature-amethyst drops, berry food/planting mechanics and mineshaft berry loot.
The [structure guide](https://help.minecraft.net/hc/en-us/articles/360059615491-Rare-Structures-in-Minecraft)
describes mineshafts, cave-spider spawners and deep-dark ancient cities. The
[dripstone-cave overview](https://www.minecraft.net/en-us/article/around-block--dripstone-caves)
explains their terrain and resources. These explain opportunities; a cave is not
necessarily safer or a better diamond yield per minute than a tunnel.

## Implemented first slice

When no current ore target is exposed, mining can collect one nearby visible ore
for a capped later reserve, or survey connected cave floor before resuming its
tunnel. Reserve caps count raw and processed forms together where appropriate:
diamonds 5, iron 24, coal/charcoal 16, gold 8, copper 4, lapis 12, redstone 16.
One block's drop can exceed a cap. These are initial quotas, not optimized values.

A survey searches at most 160 connected cells within 12 horizontal blocks and
six vertical blocks, distinguishes roofed chambers from tunnels/surface, and
walks at most six adjacent supported steps per action. It favors unvisited
floor and useful descent, with a total budget of 24 steps per two-minute window.
Each step has a three-second navigation limit. Digging, bridging, parkour and
multi-block drops are disabled during the survey. Torches are placed and checked
before moving; low food/health, nearby threats or missing protection stop it.
At least eight hunger points of carried food, armor and an offhand shield are
required. A surface departure for deep mining prepares twelve food points.

Visit cooldowns include dimension, expire after fifteen minutes and retain at
most 2048 cells. Existing world-seed invalidation clears them for a new world.
Return waypoints are appended before walking, including when navigation fails;
this records a route, not proof that a later return cannot become obstructed.
The bot still needs live cave/return validation. Looting, entity capture,
planting, enchanting and spyglass use remain separate future skills.
