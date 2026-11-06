# Productive nights and mob-drop opportunities

> **Superseded 2026-11-06 (F071, `ce24690`):** by user direction the bot no longer hunts or
> works on the surface at night; `huntAtNight` and `prepare_night_weapon` were removed
> (recover from `db44453`). The hunting design below is kept as reference for a better
> armed bot; drops such as string and bones now come from fights the bot cannot avoid.


Checked 2026-11-05 against Java 26.1.2. The installed game JAR was read directly:
`/Users/rf/Library/Application Support/minecraft/versions/26.1.2/26.1.2.jar`.
The relevant owning data are `data/minecraft/loot_table/entities/*.json` and
`data/minecraft/advancement/{adventure,story,husbandry}/*.json`. Conditional rare
entries are not promises that an ordinary kill drops those items. No game files
or world data were changed or committed.

| Source | Useful drops | Advancement dependencies and scope |
| --- | --- | --- |
| Spider | String, spider eyes | String supplies bows for Take Aim, fishing rods for Fishy Business, and wool for beds/Sweet Dreams. Eyes can support later brewing and Zombie Doctor prerequisites. Crafting an item alone does not satisfy these advancements. |
| Skeleton | Bones and arrows; equipment drops are separate | Bones can tame wolves for Best Friends Forever and make bone meal for crops. Arrows support Take Aim; blocking a projectile with a shield can satisfy Not Today, Thank You. Ranged combat and wolf/crop skills remain future work. |
| Zombie | Rotten flesh; rare carrot, potato or iron ingot | Vegetables support renewable food and pig breeding. Rotten flesh can support wolves and cleric trading/What a Deal! later; it is not the bot's normal food supply. In 26.1.2 carrots/potatoes are absent from A Seedy Place's qualifying crop criteria. |
| Enderman | Ender pearls | With blaze powder, pearls become eyes of ender for stronghold/End progression; Eye Spy requires reaching a stronghold. Endermen are neutral until provoked, and deliberate hunting needs a dedicated safe method. |
| Creeper | Gunpowder | Supports fireworks and later elytra travel, plus optional TNT. Killing an ordinary creeper or collecting powder is not a special advancement by itself. Explosion handling remains deferred. |
| Witch | Redstone, glowstone dust, sugar, bottles, gunpowder, spider eyes, sticks | Useful for brewing and redstone prerequisites. Potion combat is deferred; witches are treated as a retreat trigger nearby. |
| Phantom | Phantom membranes | Slow Falling preparation for later dangerous falls/End work. Deliberate insomnia farming is outside this first hunting slice; beds help avoid it. |

Normal hostile kills can satisfy Monster Hunter and contribute criteria to
Monsters Hunted. The bot already has Monster Hunter confirmed. This project does
not chase every monster merely to complete an exhaustive challenge. The new hunt
selection is primarily for useful limited supplies.

Mojang sources: [string and spider drops](https://www.minecraft.net/en-us/article/taking-inventory--string),
[bones](https://www.minecraft.net/en-us/article/taking-inventory--bone),
[arrows](https://www.minecraft.net/en-us/article/taking-inventory--arrow),
[fishing rods](https://www.minecraft.net/en-us/article/fishing-rod),
[ender pearls](https://www.minecraft.net/de-de/article/ender-pearl),
[gunpowder](https://www.minecraft.net/en-us/article/taking-inventory--gunpowder),
and [beds and first-night survival](https://www.minecraft.net/en-us/article/how-survive-your-first-night-minecraft).
The local version's advancement predicates and loot tables take precedence over
later releases, Bedrock behavior, or an article's simplified wording.

## Implemented first slice

Nightfall does not interrupt ordinary healthy underground progression. On the
surface, a bot with at least 18 health, 18 hunger, eight carried food points, an
iron-or-better chestplate, an offhand shield and a stone-or-better sword may
select an isolated useful spider or adult zombie within twelve blocks. Missing
stone swords can be prepared from available materials. Skeleton selection also
requires at least fifteen armor points (full iron equivalent). A second nearby
threat prevents target selection; three hostiles within twelve blocks, nearby
creepers/witches, or a warden end surface night work.

Hunts have at most four attempts per game night, a sixteen-block travel radius,
a twenty-second combat limit, no pathfinder digging/bridging and safety checks
throughout combat and before drop collection. String cap: eight; bone cap: eight;
arrow cap: sixteen. Zombies are only tried early in the budget for a missing
Monster Hunter or missing vegetables. Rare vegetable drops are not guaranteed.
With no useful target, a prepared bot resumes its regular objective.

Shield use is active during short defensive intervals, with the shield released
before attacking. This is an implemented control sequence, not live proof of
reliably blocking skeleton arrows. Deliberate creeper, witch and enderman hunting
is deferred until its specialized safety behavior is implemented and validated.

Crowds, low health/hunger, or a sudden loss of at least four health points during
surface night work record a retreat decision for that game day and dimension.
After escaping immediate danger, the bot tries safe sleep or a checked shelter
and does not resume hunting merely because the crowd dispersed. Daylight exits
open a checked doorway; intact shelter coordinates survive reconnects.

For the visible LAN workflow, sleep is pursued only when the configured owner
is observably sleeping. If the owner wakes or their sleeping state is no longer
observable, the bot wakes too. Unknown/distant owner state does not trigger
automatic sleep. A safe attempt can also be made underground; an unsafe or
unavailable bed site still prevents joining. No sleep gamerule is changed.

The bot crafts a bed opportunistically from three same-color wool plus three
planks, or uses a nearby bed. Placement checks dry support, clear two-block space,
orientation, both bed halves and the server's sleeping state. It never activates
a bed outside the Overworld. Failed sleep attempts have a sixty-second cooldown.
Other LAN players may also need to sleep before the night actually skips. A
placed travel bed is retained as a respawn checkpoint; it is not automatically
broken afterward. Bed gathering, portable-bed logistics and reliable shelter
expansion for a bed remain future improvements.

Automated tests cover policy, cancellation, shield release, bed verification,
retreat scope and shelter exit. Live night hunting, projectile blocking, sleep
and a complete retreat/night/exit sequence still need natural survival trials.


Controlled-test evidence is separate from natural survival evidence. Commands may
set initial time, supplies, position or mobs only in an external ignored setup
script; no further commands are used during an autonomous trial. The 01:46:05
run received Sweet Dreams at 06:46:14.594Z with supplied bed/food and set night.
Its first placement verification failed, and a shelter click activated the bed;
this proves server-confirmed staged sleep but not a clean sleep-skill pass.
The later fix waits for forced rotation to transmit and for both bed halves.
Owner-gated sleep/wake has automated coverage and awaits a cooperative live trial.


The final 01:55:10 staged trial completed a stationary NoAI spider hunt and retained
two string, then encountered an unrelated natural zombie while mining. Continued
damage and recovery-cancellation failures led to stopping the bot; the patched
event logic has regression coverage but still needs live validation. This trial
is not evidence of reliable natural night combat. A later LAN run earned
Not Today, Thank You while returning to the surface (F046); that block does
not establish reliable defense against an archer or crowd.
