# Minecraft bot development

This is the Git working tree for the private repository
https://github.com/saajidchowdhury/minecraft-advancement-bot.

## Purpose

Develop a reliable Minecraft bot that autonomously gets a useful selection of
advancements in a logical order. Live gameplay tests reusable bot behavior;
finishing one playthrough is not the whole project. Consider bounded exploration
of large caves before resuming tunnels: exposed resources, natural descent and
other discoveries may help progression. Research relevant cave opportunities for
the actual game version. Gather useful supplies for later advancements during
current work when the detour is worthwhile; the planner need not pursue only one
advancement at a time. Survival, supply reserves and a usable return route take
priority over optional exploration. Nightfall alone should not stop safe underground
work. On the surface, use gear, health, food, nearby threats and useful drops to
choose bounded hunting or productive work versus sleep or shelter. Withdraw when
overwhelmed or badly hurt; beds are an Overworld-only option. In the LAN
workflow, pursue sleep only when the configured owner is observably sleeping,
and wake when the owner wakes or their sleep state is no longer observable. Research mob drops
and their advancement dependencies before expanding hunting goals. Exhaustive challenges such
as visiting every biome are outside the intended scope. Occasionally building
interesting, functional redstone contraptions is an optional, lower priority.

Preserve the visible LAN workflow: the user opens a Java singleplayer survival
world to LAN and watches the bot as a separate player from a third-person view.
Do not use cheats to make a survival test appear successful. The user authorizes
Minecraft commands solely to stage initial test conditions (time, supplies,
position or mobs). Keep this setup outside the bot feature code, record it
explicitly, then run the live trial without subsequent commands. Distinguish
staged-condition evidence and supplied items from survival-earned progression.

## Read first

- `findings.md`: accumulated lessons, evidence, pitfalls and current limitations.
- `goals.md`: specific next steps, in priority order, with completion criteria.
- `README.md`: setup, controls and architecture; `VALIDATION.md`: test coverage.

Findings and goals provide informed direction, not rigid rules. Recheck
changeable facts and adjust priorities to new evidence and user instructions.

## Working discipline

Keep changes compact, technically precise and focused on reproducible behavior.
Fix bugs before cosmetic issues. Use four-space indentation, braces, focused
regression tests and at most 10% comment-bearing lines per produced code file.
Preserve user/concurrent-agent changes; do not reset or discard their work.

The user authorizes iterative live testing in the supplied LAN world: run,
observe, stop a misbehaving bot, diagnose, patch and rerun. Verify PID/process
identity before stopping it; avoid duplicate bots. Use the latest supplied port.
Keep actions and recovery bounded, cancellation exclusive, and memory scoped to
the correct world/dimension. Only server packets confirm actual advancements.

Use live runs primarily to validate behavior with little or no live evidence.
While a run proceeds, continue planning and implementing other specific goals
when useful. Keep tested and edited versions distinguishable through commits or
isolated copies and startup hashes; a running process does not load later edits.
Run appropriate checks; report live evidence separately from automated tests.
Keep this repo private. Never commit credentials, runtime profiles, world state,
logs, dependencies, tools or the preserved `minecraft-iris` reference directory.

## Session handoff

Near the end of a session, update `findings.md` with important discoveries and
corrections, including evidence and uncertainty. Update `goals.md` with completed
work, reordered priorities and concrete next actions. Refresh `VALIDATION.md`
when coverage changes. Keep this general instruction file relatively steady.

`AGENTS.md` and `CLAUDE.md` must contain the same complete instructions and remain
byte-for-byte identical. Update both together and verify equality.
