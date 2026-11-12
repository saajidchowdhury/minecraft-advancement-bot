# Cave opportunities and advancement dependencies

Research checked 2026-11-05 for Java 26.1.2. Bot behavior updated 2026-11-12. Sources below
are Java release notes and Mojang articles about established mechanics; avoid
applying later Bedrock or Java updates to this world. Candidate branches are
planning, not claims that their skills or advancements are implemented.

| Find | Useful preparation or advancement branch | Current handling |
| --- | --- | --- |
| Exposed iron, coal and diamonds | Armor, shields, tools, buckets, fuel, lighting; Diamonds! and later enchanting | Safe exposed diamonds and needed iron can interrupt mining; other ores can fill capped reserves |
| Gold | Gold armor for ordinary piglins and ingots for later bartering; does not protect against piglin brutes | Capped raw-gold/ingot reserve; armor/bartering skills pending |
| Lapis | Enchanting after a table, experience and equipment are available | Capped reserve; the Enchanter objective can use a book or paper already carried after Nether entry |
| Copper and amethyst geodes | Two copper ingots plus an amethyst shard make a spyglass; looking at a parrot, ghast or dragon can give its associated advancement | Copper reserve; mature-cluster harvesting and spyglass skills pending; preserve budding amethyst |
| Lush-cave glow berries | Edible supplies and renewable vines; can support cave trips without returning to surface | Picks ripe berries when food is short |
| Lush-cave axolotls and tropical fish | Catch an axolotl for The Cutest Predator; later axolotl-assisted combat for The Healing Power of Friendship! | Can hunt fish near the surface for food; axolotl capture is pending |
| Glow squid | Glow ink for Glow and Behold, which requires making a sign glow | Combat, pickup and sign interaction pending |
| Mineshafts | Wood structures, rails and chest minecarts with loot including glow berries | Survey walks rails and can loot chest minecarts. Nearby spawner blocks and mobs limit exploration |
| Underground lava/water and natural descent | Hot Stuff, obsidian, portal preparation and access to deeper ore levels | Existing bucket/obsidian route; bounded dry walking added, no swimming or cliff drops for exploration |
| Deep-dark/ancient-city features | Possible later exploration and loot | Sculk cues interrupt work and mark a 48-block area to avoid; natural deep-dark escape remains unverified |

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
diamonds 5, coal/charcoal 32, gold 8, copper 4, lapis 12, redstone 16. Iron
counts carried raw iron, ingots and recoverable furnace iron against missing
gear, up to three buckets and up to three spare iron picks. One block's drop
can exceed a cap. Known liquid hazards on exposed ore must be visible, and the
bot skips the drop approach if a break exposes liquid.

A depth-first survey checks at most 160 connected cells within 12 horizontal
and vertical blocks. It recognizes roofed caves and rail corridors and chooses
an unvisited endpoint within eight supported walking steps. It can cross
earlier checkpoints to reach another branch and favors movement toward the
requested depth. The shared budget is 48 steps per two-minute window.
Each step has a three-second navigation limit. Digging, bridging, parkour and
multi-block drops are disabled during the survey. Torches are placed and checked
before moving; low food/health, nearby threats or missing protection stop it.
At least eight hunger points of carried food, armor and an offhand shield are
required. Before a daylight departure for deep mining it prepares 32 logs or
equivalent planks, then the equivalent of sixteen average cooked land meats.

Explored checkpoints are stored by dimension, up to 2048 cells, and survive
restarts with world memory enabled. The bot records return waypoints before
walking and shortens the return route when retracing a step. It yields at a
checkpoint when diamond ore or an accessible chest comes into view.

The bot can open visible ordinary chests and chest minecarts, leaving one
inventory slot free and skipping its own base. It records each location and
whether the container was emptied. It can retry a partial or failed visit
after two minutes. A full survey and return through a naturally encountered
mineshaft remains to be verified on LAN (G010).
