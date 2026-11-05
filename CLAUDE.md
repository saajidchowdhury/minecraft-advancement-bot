# Minecraft bot development

This is the Git working tree for the private repository
https://github.com/saajidchowdhury/minecraft-advancement-bot.

## Purpose

Develop a reliable Minecraft bot that autonomously gets a useful selection of
advancements in a logical order. Live gameplay tests reusable bot behavior;
finishing one playthrough is not the whole project. Exhaustive challenges such
as visiting every biome are outside the intended scope. Occasionally building
interesting, functional redstone contraptions is an optional, lower priority.

Preserve the visible LAN workflow: the user opens a Java singleplayer survival
world to LAN and watches the bot as a separate player from a third-person view.
Do not use cheats to make a survival test appear successful.

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

New development may proceed while another revision runs. Keep tested and edited
versions distinguishable through commits or isolated copies and startup hashes.
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
