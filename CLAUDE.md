# Minecraft bot development

## Repository and objective

This directory is the Git working tree for the private GitHub repository
https://github.com/saajidchowdhury/minecraft-advancement-bot.

The goal is to develop a Minecraft bot that gets a useful selection of
advancements autonomously in a logical order. Develop reusable, reliable
behavior; live gameplay is a test of that behavior, not the entire project.
Do not target every advancement: exhaustive challenges such as visiting every
biome are outside the intended scope. Prerequisites, survival, food, equipment
and recovery should support sensible progression through the game.

An optional secondary goal is occasionally building interesting, functional
redstone contraptions. Advancement capability and reliability take priority.
The current route is an implementation milestone, not a permanent ceiling on
the project's ambition. Read README.md and VALIDATION.md for current coverage
and distinguish implemented skills from behavior verified in a live world.

## Preserve the visible LAN workflow

The user plays Java Edition singleplayer survival, opens the world to LAN,
sets its current port in .env, and starts the script. The bot joins as a
separate visible player so the user can watch it from a third-person view.
Preserve this workflow when changing architecture or dependencies. Do not
replace it with a simulation or a separate server the user cannot observe.
Do not grant advancements/items, teleport, or change game mode to make a
survival test appear successful unless the user explicitly requests cheats.

Use the latest port supplied by the user; LAN ports change when worlds reopen.
.env is local and ignored. Never commit credentials, account profiles, world
state, logs, node_modules, .tools, or the original minecraft-iris directory.
minecraft-iris is the preserved reference implementation.

In-game commands go in Minecraft chat: press T, enter a command such as
!status, and press Enter. They are not shell commands. MC_OWNER restricts who
can control the bot. See README.md for all controls and authentication setup.

## Work and test discipline

Read existing code, tests, README.md, VALIDATION.md and recent run logs before
changing behavior. Resolve the host with hostname -s before environment-specific
commands; do not assume the current machine has another machine's toolchain.
Keep changes compact, direct and technically precise. Fix likely bugs before
cosmetic issues; explain a minimal patch before a large rewrite. Use four-space
indentation and braces. Do not silently reformat unrelated code. Comments explain
invariants or reasons; comment-bearing lines must stay at or below 10% of each
produced code file. No dead commented-out code or speculative abstractions.

Run ./scripts/run.sh from this directory; an optional numeric argument overrides
the LAN port for one run. The launcher locates the prepared Node runtime. For
checks, put an available Node 22+ runtime on PATH, then run npm run check and
npm test. Use npm ci and retain the dependency lock and crafting patches when
reinstalling. Do not assume the latest Minecraft release is protocol-compatible.

The user authorizes iterative live testing in the supplied LAN world: run the
bot, inspect logs and in-game results, stop it when it stalls or misbehaves,
reproduce the problem, patch it, and rerun. Avoid duplicate bot processes using
the same identity. Check the recorded PID and process identity before stopping
an existing process. Do not kill unrelated Minecraft or Node processes.

New features may be implemented while an earlier revision is being tested.
Keep the tested version unambiguous through commits or an isolated copy.
Record the exact commit and startup source hashes; do not attribute a running
process's behavior to edits it has not loaded. Preserve user changes and never
reset or discard another agent's work. Prefer small commits with evidence of
what changed and what was tested. Never publish this repository publicly.

For a bug, reproduce it and add a focused regression test at the actual failing
boundary when practical. Keep actions and recovery paths bounded, cancellation
exclusive, and memory scoped to the correct world and dimension. Check current
inventory and tool tiers separately from historical advancement completion.
Only server advancement packets establish actual completion. Unit tests and
planner transitions alone are not proof of successful Minecraft gameplay.

When tunneling, preserve support, check reach and hazards, retain an exit, and
conserve higher-tier tools for blocks that need them. Side probes currently run
every eight horizontal blocks, mining left and right without leaving the main
tunnel until reach or safety checks stop them. BOT_PROBE_SPACING configures the
interval; eight is a starting value, not an experimentally established optimum.

Each run writes outputs/YYYY-MM-DD@HH.MM.SS/ with logs, state, runtime metadata,
source hashes and a PID. Inspect these to diagnose behavior. Update VALIDATION.md
with concrete live results and remaining limitations; do not overstate coverage.

AGENTS.md and CLAUDE.md must remain byte-for-byte identical, with the complete
instructions in both files. When editing either, update both and verify equality.
