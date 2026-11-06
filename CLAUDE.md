# Minecraft bot development

This is the Git working tree for the public repository
https://github.com/saajidchowdhury/minecraft-advancement-bot.

## Purpose

Develop a reliable Minecraft bot that autonomously gets a useful selection of
advancements in a logical order. Live gameplay tests reusable bot behavior;
finishing one playthrough is not the whole project. Exhaustive challenges such as
visiting every biome or having every effect at once are outside the intended scope.
Occasionally building interesting, functional redstone contraptions is an optional,
lower priority.

## Two efficiency goals

1. **The bot's efficiency.** Optimize expected advancement throughput, not just
   ordering: reach advancements as quickly as possible without large risks, since a
   death costs recovery time or, if items despawn, a restart from scratch. Favor
   investments that compound, such as diamonds for a faster pickaxe, weapons and
   armor, and a full armor set rather than a lone chestplate. Judge a policy by
   advancements per unit time including risk.
2. **The development's efficiency.** The process of building and optimizing this bot
   should itself be as efficient as possible. Prefer the change with the largest
   expected gain per unit of effort, reuse existing skills and evidence, avoid
   re-deriving what findings already record, and choose live tests that resolve the
   most uncertainty per minute of play.

## Gameplay strategy

Consider bounded exploration of large caves before resuming tunnels: exposed
resources, natural descent and other discoveries may help progression. Research
relevant cave opportunities for the actual game version. Gather useful supplies for
later advancements during current work when the detour is worthwhile; the planner
need not pursue only one advancement at a time. Survival, supply reserves and a
usable return route take priority over optional exploration.

Nightfall alone should not stop safe underground work. On the surface, use gear,
health, food, nearby threats and useful drops to choose bounded hunting or
productive work versus sleep or shelter. Withdraw when overwhelmed or badly hurt;
beds are an Overworld-only option. In the LAN workflow, pursue sleep only when the
configured owner is observably sleeping, and wake when the owner wakes or their
sleep state is no longer observable. Research mob drops and their advancement
dependencies before expanding hunting goals.

## LAN workflow and staged tests

Preserve the visible LAN workflow: the user opens a Java singleplayer survival
world to LAN and watches the bot as a separate player from a third-person view.
Use Minecraft commands proactively as a development tactic to stage initial
conditions for focused live tests: time, supplies, position or mobs. This is
explicitly authorized and useful for isolating untested behavior, reproducing
failures and avoiding long prerequisite sequences before each trial.
Keep command usage in external test setup code; it must not become an intrinsic
feature of the bot. Record the setup explicitly, then let the bot live-test
autonomously without subsequent commands. Distinguish staged-condition evidence
and supplied items from survival-earned progression; do not present a staged
survival test as an unaided playthrough.

The user authorizes iterative live testing in the supplied LAN world: run,
observe, stop a misbehaving bot, diagnose, patch and rerun. Verify PID/process
identity before stopping it; avoid duplicate bots. Use the latest supplied port.
Use live runs primarily to validate behavior with little or no live evidence.

## Work in parallel with live runs

Watching a live run through a log watcher is passive and costs little. Do not
spend that time idle or only waiting for the next event. Between check-ins, put
most of the effort into higher-level work: think abstractly about whether the
current strategies and algorithms are optimal, strategize future advancement
branches, plan and implement the next goals, and optimize existing skills so they
are ready for later live tests. When the watcher reports a stuck or misbehaving
bot, fix it promptly, restart onto the fix, then return to that strategic and
implementation work.

## Read first

- `findings.md`: accumulated lessons, evidence, pitfalls and current limitations.
- `goals.md`: specific next steps, in priority order, with completion criteria.
- `strategy.md`: higher-level throughput analysis and ranked levers behind the goals.
- `README.md`: player setup; `DEVELOPMENT.md`: configuration, controls and
  architecture; `VALIDATION.md`: test coverage.

Findings and goals provide informed direction, not rigid rules. Recheck
changeable facts and adjust priorities to new evidence and user instructions.

## Working discipline

Keep changes compact, technically precise and focused on reproducible behavior.
Fix bugs before cosmetic issues. Use four-space indentation, braces, focused
regression tests and at most 10% comment-bearing lines per produced code file.
Preserve user/concurrent-agent changes; do not reset or discard their work.

Keep actions and recovery bounded, cancellation exclusive, and memory scoped to
the correct world/dimension. Only server packets confirm actual advancements.
Make regression tests mirror the real library's behavior and confirm that each one
fails on the pre-fix source. Commit only when the full suite reports zero
failures; a filtered test summary in a shell chain does not stop the commit.

Keep tested and edited versions distinguishable through commits or isolated
copies and startup hashes; a running process does not load later edits. Run
appropriate checks; report live evidence separately from automated tests.
The user allows pushing commits to the public repository without asking first.
Everything pushed is public. Never commit credentials, runtime profiles, world state,
logs, dependencies, tools or the preserved `minecraft-iris` reference directory.

## Session handoff

Near the end of a session, update `findings.md` with important discoveries and
corrections, including evidence and uncertainty. Update `goals.md` with completed
work, reordered priorities and concrete next actions. Refresh `VALIDATION.md`
when coverage changes. Keep this general instruction file relatively steady.

`AGENTS.md` and `CLAUDE.md` must contain the same complete instructions and remain
byte-for-byte identical. Update both together and verify equality.
