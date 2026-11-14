'use strict'

const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { until } = require('./progression-skills')
const { canSeeBlock } = require('./vision')

// User direction (2026-11-14): scouting Nether terrain is deadly. Hold one cardinal line instead, tunnelling
// through rock and bridging gaps on top-half slab floors with bottom-half slab walls at head height, and look
// for fortress blocks every 16 steps; once one is seen, head for the nearest, one axis at a time.
const BRIDGE_BLOCKS = ['cobblestone', 'cobbled_deepslate', 'blackstone']
const SLABS = { cobblestone: 'cobblestone_slab', cobbled_deepslate: 'cobbled_deepslate_slab', blackstone: 'blackstone_slab' }
const FORTRESS = ['nether_bricks', 'nether_brick_fence', 'nether_brick_stairs', 'nether_brick_slab', 'nether_brick_wall',
    'cracked_nether_bricks', 'chiseled_nether_bricks']
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]]
const CHECK_EVERY = 16
const SIGHT_RANGE = 96
const SIGHT_CANDIDATES = 64
const MIN_SLABS = 6 // one bridged step with both walls bootstrapped uses five
const MAX_TURNS = 4
// path := every feet cell [x, y, z] from the portal outward. User direction (2026-11-14): go home along the
// recorded tunnel or bridge, not by pathfinding or scouting; a single 360-block goal also exceeded A*'s
// 48-block slack and the fallback crossed open Nether terrain (live 06:42Z).
const MAX_PATH = 8192
const STEP_MS = 4000
const AIR = new Set(['air', 'cave_air', 'void_air'])
const HOT = new Set(['lava', 'fire', 'soul_fire', 'magma_block'])
const KEEP = new Set(['obsidian', 'crying_obsidian', 'nether_portal', 'spawner', 'chest', 'bedrock'])

// A cancelled action must let go within 2 s (survival-bot reconnects otherwise; live 06:32Z), so loops check.
function check(c) {
    if (!c.running || c.paused || c.actionAbort?.signal.aborted || c.bot.health <= 0) {
        throw new Error('action cancelled')
    }
}
const CRAFT_BATCH = 4 // slab recipes per craft call, about half a second

const countOf = (bot, names) => bot.inventory.items().reduce((n, item) => n + (names.includes(item.name) ? item.count : 0), 0)
const slabCount = bot => countOf(bot, Object.values(SLABS))
// Bridge supply in blocks: a slab is half of one.
const bridgeSupply = bot => countOf(bot, BRIDGE_BLOCKS) + slabCount(bot) / 2
const vec = p => new Vec3(p.x, p.y, p.z)
// Soul sand (7/8 high) floors the feet at 100.875: rounding down took the floor for the cell ahead and
// dug three levels into a soul sand valley (live 06:23Z), so feet round from 0.2 above.
const feetOf = bot => {
    const p = bot.entity.position
    return new Vec3(Math.floor(p.x), Math.floor(p.y + 0.2), Math.floor(p.z))
}
const open = block => Boolean(block) && AIR.has(block.name)
const solid = block => Boolean(block) && block.boundingBox === 'block' && !HOT.has(block.name)

// The table goes beside or behind the line, never ahead: one placed in the path was dug as an obstacle
// and lost (live 06:23Z). Crafting then reclaims it; a table left behind as a drop is walked to.
async function craftSlabs(c, dir) {
    const bot = c.bot
    const [name, have] = BRIDGE_BLOCKS.map(n => [n, countOf(bot, [n])]).sort((a, b) => b[1] - a[1])[0]
    const blocks = Math.min(63, have - have % 3)
    if (blocks < 3) {
        throw new Error('out of bridge blocks for slabs')
    }
    const feet = feetOf(bot)
    const spots = [new Vec3(dir.z, 0, dir.x), new Vec3(-dir.z, 0, -dir.x), dir.scaled(-1)].map(s => feet.plus(s))
    const spot = spots.find(p => open(bot.blockAt(p)) && solid(bot.blockAt(p.offset(0, -1, 0))))
    if (spot && countOf(bot, ['crafting_table']) > 0) {
        await place(c, spot, 'crafting_table', null, [[spot.offset(0, -1, 0), new Vec3(0, 1, 0)]])
    }
    for (let made = 0; made < 2 * blocks; made += 6 * CRAFT_BATCH) {
        check(c)
        await c.craftItem(SLABS[name], Math.min(6 * CRAFT_BATCH, 2 * blocks - made), true)
    }
    const table = spot && bot.blockAt(spot)?.name === 'crafting_table' ? bot.blockAt(spot) : null
    if (table) {
        await bot.dig(table, true)
        await bot.waitForTicks(6)
    }
    const drop = Object.values(bot.entities ?? {}).find(e => e.name === 'item' && e.getDroppedItem?.()?.name === 'crafting_table' &&
        e.position.distanceTo(bot.entity.position) < 8)
    if (drop && countOf(bot, ['crafting_table']) === 0) {
        const p = drop.position.floored()
        await c.gotoWithTimeout(new goals.GoalNear(p.x, p.y, p.z, 0), 5000, 'crafting table pickup').catch(() => {})
    }
}

// Cells next to p, other than `except`, that hold lava: digging p would let it flow into the path.
function lavaBeside(bot, p, except) {
    return [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([x, y, z]) => {
        const q = p.offset(x, y, z)
        return !except.some(e => e.equals(q)) && bot.blockAt(q)?.name === 'lava'
    })
}

class LavaAhead extends Error {}

// Opens the given cells (feet, head, ...) in order; gravel that falls back in is dug again.
async function clearCells(c, cells) {
    const bot = c.bot
    for (let pass = 0; pass < 8; pass++) {
        const block = cells.map(p => bot.blockAt(p)).find(b => !open(b))
        if (!block) {
            return
        }
        if (block.name === 'lava' || lavaBeside(bot, block.position, cells)) {
            throw new LavaAhead(`lava at or beside ${block.position}`)
        }
        if (KEEP.has(block.name) || (!block.diggable && !['fire', 'soul_fire'].includes(block.name))) {
            throw new LavaAhead(`undiggable ${block.name} at ${block.position}`)
        }
        check(c)
        await bot.tool.equipForBlock(block, { requireHarvest: false, getFromChest: false }).catch(() => {})
        await bot.dig(block, true)
        await bot.waitForTicks(2)
    }
    throw new Error(`cells ahead keep refilling at ${cells[0]}`)
}

// refs := [reference position, face from it toward the target]; the first solid one is clicked.
async function place(c, target, item, half, refs) {
    const bot = c.bot
    const ref = refs.map(([p, face]) => [bot.blockAt(p), face]).find(([b]) => solid(b))
    if (!ref) {
        return false
    }
    const stack = bot.inventory.items().find(i => i.name === item)
    if (!stack) {
        throw new Error(`missing bridge item ${item}`)
    }
    await bot.equip(stack, 'hand')
    await bot._placeBlockWithOptions(ref[0], ref[1], { half, swingArm: 'right' })
    await until(c, () => solid(bot.blockAt(target)), 2000)
    return true
}

// User direction (2026-11-14): once no slab blocks are left, plain netherrack full blocks continue the line;
// it is dug on the way, so posts take it first and keep slab material for floors and walls.
const FULL_BLOCKS = ['netherrack', ...BRIDGE_BLOCKS]
const slabItem = bot => bot.inventory.items().find(i => Object.values(SLABS).includes(i.name))?.name
const fullItem = bot => FULL_BLOCKS.map(name => bot.inventory.items().find(i => i.name === name)).find(Boolean)?.name
// piece := [item, half]: a slab in the given half, or a full block where no slab is left.
const piece = (bot, half) => slabItem(bot) ? [slabItem(bot), half] : [fullItem(bot), null]

// Floor := top-half slab under the next feet cell, clicked high on the side of the block underfoot.
async function placeFloor(c, floor, dir) {
    const sides = DIRECTIONS.map(([x, z]) => [floor.offset(x, 0, z), new Vec3(-x, 0, -z)])
    const behind = [floor.offset(-dir.x, 0, -dir.z), dir]
    if (!await place(c, floor, ...piece(c.bot, 'top'), [behind, ...sides])) {
        throw new Error(`no support for a bridge floor at ${floor}`)
    }
}

// Wall := bottom-half slab at head height beside the next cell; it blocks the body without being a step.
// Without an earlier wall to click, a side floor slab and a full block start the run.
async function placeWall(c, wall, dir, side) {
    const bot = c.bot
    if (!open(bot.blockAt(wall)) || !open(bot.blockAt(wall.offset(0, -1, 0)))) {
        return
    }
    const refs = [[wall.offset(-dir.x, 0, -dir.z), dir], [wall.offset(0, -1, 0), new Vec3(0, 1, 0)]]
    if (await place(c, wall, ...piece(bot, 'bottom'), refs)) {
        return
    }
    const sideFloor = wall.offset(0, -2, 0)
    const post = wall.offset(0, -1, 0)
    if (open(bot.blockAt(sideFloor)) && !await place(c, sideFloor, ...piece(bot, 'top'), [[sideFloor.minus(side), side]])) {
        return
    }
    if (await place(c, post, fullItem(bot), null, [[sideFloor, new Vec3(0, 1, 0)]])) {
        await place(c, wall, ...piece(bot, 'bottom'), [[post, new Vec3(0, 1, 0)]])
    }
}

async function walkTo(c, cell, sneak) {
    const bot = c.bot
    const center = new Vec3(cell.x + 0.5, cell.y, cell.z + 0.5)
    const deadline = Date.now() + STEP_MS
    try {
        bot.setControlState('sneak', sneak)
        while (Date.now() < deadline) {
            check(c)
            const p = bot.entity.position
            if (Math.abs(p.x - center.x) < 0.2 && Math.abs(p.z - center.z) < 0.2 && bot.entity.onGround) {
                return
            }
            await bot.lookAt(center.offset(0, 1.5, 0), true)
            bot.setControlState('forward', true)
            await bot.waitForTicks(1)
        }
        throw new Error(`bridge step to ${cell} timed out`)
    } finally {
        bot.setControlState('forward', false)
        bot.setControlState('sneak', false)
    }
}

// One step along dir at feet level, or one level up or down where natural rock carries the stair.
async function step(c, feet, dir, dy) {
    const bot = c.bot
    const ahead = feet.offset(dir.x, 0, dir.z)
    if (dy > 0 && solid(bot.blockAt(ahead))) {
        const up = ahead.offset(0, 1, 0)
        await clearCells(c, [feet.offset(0, 2, 0), up, up.offset(0, 1, 0)])
        return c.gotoWithTimeout(new goals.GoalBlock(up.x, up.y, up.z), 6000, 'bridge stair up')
    }
    const down = ahead.offset(0, -1, 0)
    if (dy < 0 && solid(bot.blockAt(down.offset(0, -1, 0)))) {
        await clearCells(c, [ahead.offset(0, 1, 0), ahead, down])
        return c.gotoWithTimeout(new goals.GoalBlock(down.x, down.y, down.z), 6000, 'bridge stair down')
    }
    await clearCells(c, [ahead, ahead.offset(0, 1, 0)])
    const bridged = !solid(bot.blockAt(down))
    if (bridged) {
        await placeFloor(c, down, dir)
        const side = new Vec3(dir.z, 0, dir.x)
        for (const s of [side, side.scaled(-1)]) {
            await placeWall(c, ahead.offset(s.x, 1, s.z), dir, s).catch(error => c.log.warn(`Bridge wall skipped: ${error.message}`))
        }
    }
    await walkTo(c, ahead, bridged)
}

function visibleFortress(c) {
    const bot = c.bot
    const ids = FORTRESS.map(name => bot.registry.blocksByName[name]?.id).filter(id => id !== undefined)
    return bot.findBlocks({ matching: ids, maxDistance: SIGHT_RANGE, count: SIGHT_CANDIDATES })
        .map(p => bot.blockAt(p)).filter(block => block && canSeeBlock(bot, block)).map(block => block.position)
}

// Prefer blocks whose height can be matched by one-level stairs on the way: score = |dx| + |dz| + 2|dy|.
function chooseTarget(feet, seen) {
    const score = p => Math.abs(p.x - feet.x) + Math.abs(p.z - feet.z) + 2 * Math.abs(p.y - feet.y)
    return [...seen].sort((a, b) => score(a) - score(b))[0] ?? null
}

// Keep the current axis while it still closes the gap, else turn onto the other axis.
function heading(feet, target, dir) {
    if (!target) {
        return dir
    }
    const gap = [target.x - feet.x, target.z - feet.z]
    const [x, z] = DIRECTIONS[dir]
    if (x * gap[0] > 0 || z * gap[1] > 0) {
        return dir
    }
    if (gap[0] === 0 && gap[1] === 0) {
        return dir
    }
    const axis = gap[0] !== 0 && x === 0 ? 0 : gap[1] !== 0 ? 1 : 0
    return DIRECTIONS.findIndex(([dx, dz]) => axis === 0 ? dx === Math.sign(gap[0]) && dz === 0 : dz === Math.sign(gap[1]) && dx === 0)
}

function fortressBeside(bot, feet) {
    for (let x = -1; x <= 1; x++) {
        for (let y = -1; y <= 2; y++) {
            for (let z = -1; z <= 1; z++) {
                if (FORTRESS.includes(bot.blockAt(feet.offset(x, y, z))?.name)) {
                    return feet.offset(x, y, z)
                }
            }
        }
    }
    return null
}

async function findFortress(c) {
    const bot = c.bot
    const feet = () => feetOf(bot)
    const nb = c.memory.netherBridge ??= { dimension: bot.game.dimension, dir: Math.floor(c.rng() * 4), steps: 0,
        lastCheck: -Infinity, portal: feet(), target: null, turns: 0 }
    nb.path ??= [[nb.portal.x, nb.portal.y, nb.portal.z]]
    const record = () => {
        const here = feet()
        const last = nb.path.at(-1)
        if (nb.path.length < MAX_PATH && !(last && here.equals(new Vec3(...last)))) {
            nb.path.push([here.x, here.y, here.z])
        }
    }
    if (bot.blockAt(feet())?.name === 'nether_portal') {
        const out = DIRECTIONS.map(([x, z]) => feet().offset(x, 0, z)).find(p => open(bot.blockAt(p)) &&
            open(bot.blockAt(p.offset(0, 1, 0))) && solid(bot.blockAt(p.offset(0, -1, 0))))
        if (!out) {
            throw new Error('no open cell beside the arrival portal')
        }
        await c.gotoWithTimeout(new goals.GoalBlock(out.x, out.y, out.z), 6000, 'portal exit')
    }
    // A restocked bot walks its old line out to the frontier and carries on in the last segment's direction.
    if (nb.path.length > 1 && !feet().equals(new Vec3(...nb.path.at(-1)))) {
        await walkPath(c, nb.path.length - 1)
        const [a, b] = nb.path.slice(-2).map(p => new Vec3(...p))
        const last = DIRECTIONS.findIndex(([x, z]) => x === Math.sign(b.x - a.x) && z === Math.sign(b.z - a.z))
        nb.dir = last >= 0 ? last : nb.dir
    }
    record()
    c.log.info(`Fortress search heading ${DIRECTIONS[nb.dir]} from ${feet()} after ${nb.steps} steps.`)
    for (;;) {
        check(c)
        if (slabCount(bot) < MIN_SLABS && countOf(bot, BRIDGE_BLOCKS) >= 3) {
            const [x, z] = DIRECTIONS[nb.dir]
            await craftSlabs(c, new Vec3(x, 0, z))
        }
        if (!slabItem(bot) && !fullItem(bot)) {
            throw new Error('out of bridge blocks and netherrack')
        }
        if (nb.steps - nb.lastCheck >= CHECK_EVERY) {
            nb.lastCheck = nb.steps
            const target = chooseTarget(feet(), visibleFortress(c))
            if (target && !(nb.target && vec(nb.target).equals(target))) {
                c.log.info(`Fortress block in sight at ${target}; bridging toward it.`)
            }
            nb.target = target ?? nb.target
        }
        const brick = fortressBeside(bot, feet())
        if (brick) {
            const [x, z] = DIRECTIONS[nb.dir]
            const inside = feet().offset(x, 0, z)
            await clearCells(c, [inside, inside.offset(0, 1, 0)]).catch(error => c.log.warn(`Fortress entry dig: ${error.message}`))
            c.memory.netherFortress = { dimension: bot.game.dimension, x: brick.x, y: brick.y, z: brick.z, reached: true }
            c.log.info(`Reached the Nether fortress at ${brick} after ${nb.steps} steps.`)
            return
        }
        const target = nb.target ? vec(nb.target) : null
        nb.dir = heading(feet(), target, nb.dir)
        const [x, z] = DIRECTIONS[nb.dir]
        try {
            await step(c, feet(), new Vec3(x, 0, z), target ? Math.sign(target.y - feet().y) : 0)
            nb.steps++
            nb.turns = 0
            record()
        } catch (error) {
            if (!(error instanceof LavaAhead) || ++nb.turns > MAX_TURNS) {
                throw error
            }
            nb.dir = (nb.dir + (c.rng() < 0.5 ? 1 : 3)) % 4
            nb.target = null
            c.log.warn(`${error.message}; turning to ${DIRECTIONS[nb.dir]}.`)
        }
    }
}

// Walks the recorded line from the nearest recorded cell to index `to` (0 is the portal), cell by cell.
async function walkPath(c, to) {
    const bot = c.bot
    const path = (c.memory.netherBridge?.path ?? []).map(p => new Vec3(...p))
    if (path.length === 0) {
        return false
    }
    const here = feetOf(bot)
    let i = path.reduce((best, p, j) => p.distanceTo(here) < path[best].distanceTo(here) ? j : best, 0)
    if (path[i].distanceTo(here) > 0) {
        await c.gotoWithTimeout(new goals.GoalBlock(path[i].x, path[i].y, path[i].z), 10000, 'back onto the bridge')
    }
    const delta = Math.sign(to - i)
    if (delta !== 0) {
        c.log.info(`Walking ${Math.abs(to - i)} recorded bridge cells toward ${to === 0 ? 'the portal' : 'the frontier'}.`)
    }
    for (i += delta; delta !== 0 && i !== to + delta; i += delta) {
        check(c)
        const cell = path[i]
        await clearCells(c, [cell, cell.offset(0, 1, 0)])
        if (cell.y !== feetOf(bot).y) {
            await c.gotoWithTimeout(new goals.GoalBlock(cell.x, cell.y, cell.z), 6000, 'bridge stair')
        } else {
            // Sneak on a slab floor unless walls stand at head height on both sides.
            const from = feetOf(bot)
            const side = new Vec3(cell.z - from.z, 0, cell.x - from.x)
            const walled = [side, side.scaled(-1)].every(s => solid(bot.blockAt(cell.offset(s.x, 1, s.z))))
            await walkTo(c, cell, Boolean(bot.blockAt(cell.offset(0, -1, 0))?.name.endsWith('_slab')) && !walled)
        }
    }
    return true
}

const returnAlongPath = c => walkPath(c, 0)

module.exports = { findFortress, returnAlongPath, bridgeSupply, countOf, slabCount, heading, chooseTarget, BRIDGE_BLOCKS, SLABS, FORTRESS }
