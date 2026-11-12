'use strict'

const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { discardableStacks, overflowStack } = require('./inventory')
const { storeOverflowAtBase } = require('./base')
const { exploreCave, collectOpportunity, safeFooting, dryMovements, miningSight, minedPassage, exposedDiamond, findPriorityDiamond,
    findPriorityOre, IRON_ORES, visibleMiningHazard } = require('./cave-exploration')
const { scanFor, canSeeBlock } = require('./vision')
const { RECIPES, ARMOR_TIERS, nextAdvancement, resourceAction } = require('./advancement-plan')
const { isFuelPlank, isCharcoalLog, furnaceFuelTicks, plankFuelPlan, preparePlankFuel } = require('./furnace-fuel')

const HAZARDS = new Set(['lava', 'water', 'fire', 'soul_fire', 'sand', 'red_sand', 'gravel', 'bedrock'])
const PROTECTED_CONTAINERS = new Set(['furnace', 'barrel', 'chest'])
const WOODCUTTING_AXES = ['netherite_axe', 'diamond_axe', 'iron_axe', 'copper_axe', 'stone_axe']
const DIGGING_SHOVELS = ['netherite_shovel', 'diamond_shovel', 'iron_shovel', 'stone_shovel']
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]]
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function check(c) {
    if (!c.running || c.paused || c.actionAbort?.signal.aborted || c.bot.health <= 0) {
        throw new Error('action cancelled')
    }
}

async function until(c, predicate, timeoutMs) {
    const deadline = Date.now() + timeoutMs
    while (Date.now() < deadline) {
        check(c)
        if (predicate()) {
            return
        }
        await sleep(100)
    }
    throw new Error(`world verification timed out after ${timeoutMs}ms`)
}

function supportedPlacement(bot, position) {
    return [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].some(([x, y, z]) => {
        const block = bot.blockAt(position.offset(x, y, z), false)
        return block?.boundingBox === 'block' && !HAZARDS.has(block.name)
    })
}

function safeTunnelStep(bot, feet, target, allowFloorPlacement = false) {
    const floor = bot.blockAt(target.offset(0, -1, 0), false)
    const floorPosition = target.offset(0, -1, 0)
    const base = bot.blockAt(target.offset(0, -2, 0), false)
    const canBuildFloor = allowFloorPlacement && target.y > feet.y && floor &&
        ['air', 'cave_air', 'void_air'].includes(floor.name) &&
        (supportedPlacement(bot, floorPosition) || (base && ['air', 'cave_air', 'void_air'].includes(base.name) &&
            supportedPlacement(bot, target.offset(0, -2, 0))))
    if (!floor || (!canBuildFloor && floor.boundingBox !== 'block') || HAZARDS.has(floor.name)) {
        return false
    }
    const cells = [target, target.offset(0, 1, 0)]
    if (target.y < feet.y) {
        cells.push(target.offset(0, 2, 0))
    } else if (target.y > feet.y) {
        cells.push(feet.offset(0, 2, 0), feet.offset(0, 3, 0), target.offset(0, 2, 0))
    }
    for (const p of cells) {
        const block = bot.blockAt(p, false)
        if (!block || HAZARDS.has(block.name) || PROTECTED_CONTAINERS.has(block.name) ||
            (block.boundingBox !== 'empty' && !block.diggable)) {
            return false
        }
        for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]]) {
            const neighbor = bot.blockAt(p.offset(dx, dy, dz), false)
            if (!neighbor || HAZARDS.has(neighbor.name)) {
                return false
            }
        }
    }
    return true
}

function miningPickaxe(c, block = null) {
    for (const name of ['netherite_pickaxe', 'diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'wooden_pickaxe']) {
        const item = c.bestItem([name])
        if (item && (!block || block.canHarvest(item.type))) {
            return item
        }
    }
    return null
}

function tunnelTool(c, block) {
    if (block.material === 'mineable/axe') {
        const axe = c.bestItem([...WOODCUTTING_AXES, 'golden_axe', 'wooden_axe'])
        if (axe) {
            return axe
        }
    }
    if (block.material === 'mineable/shovel') {
        return c.bestItem(DIGGING_SHOVELS) || miningPickaxe(c, block)
    }
    return miningPickaxe(c, block)
}

async function probeTunnelSides(c, direction) {
    const bot = c.bot
    const anchor = bot.entity.position.clone()
    const feet = anchor.floored()
    const [dx, dz] = DIRECTIONS[direction]
    let dug = 0
    let foundOre = false
    const eye = () => bot.entity.position.offset(0, 1.62, 0)
    probe: for (const side of [-1, 1]) {
        const faceNormal = new Vec3(-side * dz, 0, side * dx)
        check(c)
        await bot.lookAt(eye().minus(faceNormal), true)
        for (let depth = 1; depth <= 5; depth++) {
            check(c)
            if (!bot.entity.position.floored().equals(feet) || bot.entity.position.distanceTo(anchor) > 0.6) {
                throw new Error('moved away from the side-probe anchor')
            }
            const position = feet.offset(side * dz * depth, 1, -side * dx * depth)
            const block = bot.blockAt(position, false)
            if (!block || HAZARDS.has(block.name)) {
                break
            }
            if (block.boundingBox === 'empty') {
                continue
            }
            if (block.name.endsWith('_ore')) {
                foundOre ||= Boolean(miningSight(c, block))
                break
            }
            if (!['stone', 'deepslate', 'granite', 'diorite', 'andesite', 'tuff', 'calcite', 'netherrack'].includes(block.name) ||
                !block.diggable) {
                break
            }
            const neighbors = [[1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]]
                .map(([x, y, z]) => bot.blockAt(position.offset(x, y, z), false))
            if (neighbors.some(b => !b || HAZARDS.has(b.name))) {
                break
            }
            const face = position.offset(0.5, 0.5, 0.5).plus(faceNormal.scaled(0.5))
            if (depth === 5 && eye().distanceTo(face) > 4.5) {
                const floor = bot.blockAt(feet.offset(0, -1, 0), false)
                if (bot.entity.onGround === false || floor?.boundingBox !== 'block' || HAZARDS.has(floor.name)) {
                    break
                }
                await bot.lookAt(new Vec3(face.x, eye().y, face.z), true)
                check(c)
                try {
                    bot.setControlState('sneak', true)
                    bot.setControlState('forward', true)
                    for (let tick = 0; tick < 12 && eye().distanceTo(face) > 4.45; tick++) {
                        await bot.waitForTicks(1)
                        check(c)
                        if (!bot.entity.position.floored().equals(feet) || bot.entity.position.distanceTo(anchor) > 0.6) {
                            throw new Error('moved away from the side-probe anchor')
                        }
                    }
                } finally {
                    bot.setControlState('forward', false)
                    bot.setControlState('sneak', false)
                }
            }
            if (eye().distanceTo(face) > 4.5 || !bot.canDigBlock(block) || !canSeeBlock(bot, block)) {
                break
            }
            const tool = miningPickaxe(c, block)
            if (!tool) {
                throw new Error('side-probe pickaxe broke')
            }
            await bot.equip(tool, 'hand')
            check(c)
            await bot.dig(block, true, faceNormal)
            dug++
            foundOre ||= neighbors.some(b => b.name.endsWith('_ore') && miningSight(c, b))
            if (miningPickaxe(c)?.name !== tool.name) {
                break probe
            }
            if (foundOre) {
                break
            }
        }
        if (foundOre) {
            break
        }
    }
    c.memory.probeMinedBlocks = (c.memory.probeMinedBlocks || 0) + dug
    c.log.info(`Side probes at ${feet}: mined ${dug} blocks; exposed ore=${foundOre}.`)
    return { dug, foundOre }
}

// probeAnchors := [dimension, x, y, z] of tunnel cells already probed; oldest dropped past 2048.
function nearProbe(c, p) {
    const dimension = c.bot.game.dimension
    return (c.memory.probeAnchors || []).some(([d, x, y, z]) => d === dimension && Math.abs(y - p.y) <= 2 &&
        Math.max(Math.abs(x - p.x), Math.abs(z - p.z)) < c.probeSpacing)
}

function rememberProbe(c, p) {
    c.memory.probeAnchors ??= []
    c.memory.probeAnchors.push([c.bot.game.dimension, p.x, p.y, p.z])
    if (c.memory.probeAnchors.length > 2048) {
        c.memory.probeAnchors.shift()
    }
}

async function climbStep(c, target) {
    try {
        await c.gotoWithTimeout(new goals.GoalBlock(target.x, target.y, target.z), 4000, 'prepared stair step')
        return
    } catch (error) {
        check(c)
        const bot = c.bot
        const here = bot.entity.position
        const floor = bot.blockAt(target.offset(0, -1, 0))
        if (Math.hypot(here.x - target.x - 0.5, here.z - target.z - 0.5) > 1.8 ||
            Math.abs(here.y - target.y) > 1.5 || floor?.boundingBox !== 'block' || HAZARDS.has(floor.name) ||
            [target, target.offset(0, 1, 0)].some(p => bot.blockAt(p)?.boundingBox !== 'empty')) {
            throw error
        }
        c.log.warn(`Pathfinder stalled on a prepared stair; trying a short jump to ${target}.`)
        bot.pathfinder.setGoal(null)
        await bot.lookAt(target.offset(0.5, 1.62, 0.5), true)
        check(c)
        try {
            bot.setControlState('jump', true)
            bot.setControlState('forward', true)
            await until(c, () => Math.hypot(bot.entity.position.x - target.x - 0.5, bot.entity.position.z - target.z - 0.5) < 0.35 &&
                bot.entity.position.y >= target.y && bot.entity.position.y < target.y + 0.6, 2500)
        } finally {
            bot.clearControlStates()
        }
    }
}

async function mineTunnel(c, targetY, heading = null, undergroundOnly = false) {
    const bot = c.bot
    const tool = miningPickaxe(c)
    const start = bot.entity.position.floored()
    if (!tool) {
        throw new Error('mining requires a pickaxe')
    }
    await bot.equip(tool, 'hand')
    check(c)
    if (targetY < start.y && c.memory.surfaceByStaircase) {
        c.memory.surfaceByStaircase = false
        c.memory.mineRoute = []
    }
    let frontier = null
    if (!heading) {
        const saved = c.memory.tunnelFrontier
        if (saved?.dimension === bot.game.dimension && saved.targetY === targetY) {
            c.memory.mineDirection = saved.direction
            const point = new Vec3(saved.x, saved.y, saved.z)
            // 48 blocks: a furnace or crafting detour 29 blocks back restarted at the tunnel mouth (01:40Z).
            if (start.distanceTo(point) <= 48 && safeFooting(bot, point)) {
                frontier = saved
                if (!start.equals(point)) {
                    c.log.info(`Returning to tunnel frontier at ${point} without digging.`)
                    bot.pathfinder.setMovements(dryMovements(bot))
                    try {
                        await c.gotoWithTimeout(new goals.GoalBlock(point.x, point.y, point.z),
                            Math.max(12000, 400 * start.distanceTo(point)), 'tunnel frontier')
                        check(c)
                        if (!bot.entity.position.floored().equals(point)) {
                            throw new Error('tunnel frontier was not reached')
                        }
                    } catch (error) {
                        if (!c.actionAbort?.signal.aborted) {
                            c.memory.tunnelFrontier = null
                        }
                        throw error
                    } finally {
                        bot.pathfinder.setMovements(c.movements)
                    }
                }
            }
        }
        frontier ??= { x: start.x, y: start.y, z: start.z, dimension: bot.game.dimension,
            targetY, direction: c.memory.mineDirection || 0 }
        c.memory.tunnelFrontier = frontier
    }
    for (let step = 0; step < 4; step++) {
        check(c)
        const feet = bot.entity.position.floored()
        let target = null
        const forward = frontier?.direction ?? (c.memory.mineDirection || 0)
        const directionOrder = (heading ? [0, 1, 2, 3] : [0, 1, 3]).map(turn => (forward + turn) % 4)
        if (heading) {
            directionOrder.sort((a, b) =>
                Math.hypot(feet.x + DIRECTIONS[a][0] - heading.x, feet.z + DIRECTIONS[a][1] - heading.z) -
                Math.hypot(feet.x + DIRECTIONS[b][0] - heading.x, feet.z + DIRECTIONS[b][1] - heading.z))
        }
        // The wanted slope first; when liquid or falling blocks touch all four, a level step (or, on a
        // level tunnel, one step up or down) routes around the hazard (live 02.02.15, 02.29.19).
        const rise = Math.sign(targetY - feet.y)
        const slopes = rise ? (rise < 0 && frontier?.levelSteps >= 8 ? [rise] : [rise, 0]) : [0, 1, -1]
        // Fresh rock ahead beside an old tunnel or staircase running the same way would cut a parallel
        // duplicate (live 01:42Z dug z=269 along z=270; 07:37Z a lava descent beside the y=-54 stairs):
        // step sideways into the old passage and walk it.
        const [fx, fz] = DIRECTIONS[forward]
        const ahead = feet.offset(fx, Math.min(rise, 0), fz)
        const tunnelCell = p => c.memory.minedCells?.has(`${bot.game.dimension}:${p}`)
        const freshAhead = [0, 1, ...(rise < 0 ? [2] : [])].some(dy => bot.blockAt(ahead.offset(0, dy, 0), false)?.boundingBox !== 'empty')
        const merge = !heading && rise <= 0 && freshAhead
            ? [[fz, fx], [-fz, -fx]].map(([sx, sz]) => feet.offset(sx, 0, sz))
                .find(side => tunnelCell(side) && tunnelCell(side.offset(fx, rise, fz)) && !c.isBlockedTarget?.({ position: side }) &&
                    safeTunnelStep(bot, feet, side, Boolean(c.bestItem(['cobblestone', 'cobbled_deepslate', 'dirt']))))
            : null
        if (merge) {
            target = merge
        }
        for (const [index, dy] of merge ? [] : slopes.flatMap(dy => directionOrder.map(i => [i, dy]))) {
            const [dx, dz] = DIRECTIONS[index]
            const candidate = feet.offset(dx, dy, dz)
            if (undergroundOnly && openToSky(bot, candidate.offset(0, dy === 0 ? 2 : 3, 0))) {
                continue
            }
            if ((!heading && index !== forward && minedPassage(c, candidate)) ||
                c.isBlockedTarget?.({ position: candidate }) || !safeTunnelStep(bot, feet, candidate, Boolean(c.bestItem(['cobblestone', 'cobbled_deepslate', 'dirt'])))) {
                continue
            }
            target = candidate
            c.memory.mineDirection = index
            break
        }
        if (!target) {
            if (rise < 0 && frontier?.levelSteps >= 8) {
                throw new Error('tunnel descent blocked after eight level detour steps')
            }
            throw new Error('no supported dry tunnel step; exposed liquid or falling blocks nearby')
        }
        const floor = bot.blockAt(target.offset(0, -1, 0), false)
        if (floor.boundingBox === 'empty') {
            if (!supportedPlacement(bot, target.offset(0, -1, 0))) {
                await c.placeSurvivalBlock(target.offset(0, -2, 0))
                check(c)
            }
            await c.placeSurvivalBlock(target.offset(0, -1, 0))
            check(c)
        }
        let dugFresh = false
        const cells = target.y < feet.y
            ? [target.offset(0, 2, 0), target.offset(0, 1, 0), target]
            : (target.y > feet.y ? [feet.offset(0, 3, 0), feet.offset(0, 2, 0), target.offset(0, 2, 0), target.offset(0, 1, 0), target] : [target.offset(0, 1, 0), target])
        for (const p of cells) {
            check(c)
            if (!safeTunnelStep(bot, feet, target)) {
                throw new Error('tunnel conditions changed')
            }
            const block = bot.blockAt(p, false)
            if (block.boundingBox !== 'empty') {
                if (!bot.canDigBlock(block)) {
                    throw new Error('tunnel block out of reach')
                }
                const currentTool = tunnelTool(c, block)
                if (!currentTool) {
                    throw new Error('mining tool broke; rebuild it before continuing')
                }
                await bot.equip(currentTool, 'hand')
                await bot.dig(block, true)
                dugFresh = true
                if (c.findNearestBlock && exposedDiamond(c, p) && c.canPursueDiamond?.() !== false && findPriorityDiamond(c)) {
                    c.log.info('Tunnel dig exposed diamond ore; yielding to collect it.')
                    return
                }
                if (miningPickaxe(c)?.name !== tool.name) {
                    return
                }
            }
        }
        check(c)
        try {
            if (target.y > feet.y) {
                await climbStep(c, target)
            } else {
                await c.gotoWithTimeout(new goals.GoalBlock(target.x, target.y, target.z), 8000, 'tunnel step')
            }
        } catch (error) {
            c.rememberBlockedTarget?.({ position: target }, 'tunnel step', error)
            c.log.warn(`Tunnel step failed from ${feet} to ${target}; actual=${bot.entity.position}; ${error.message}`)
            throw error
        }
        if (!c.memory.minedCells) {
            c.memory.minedCells = new Set()
        }
        c.memory.minedCells.add(`${bot.game.dimension}:${feet}`)
        if (!c.memory.mineRoute) {
            c.memory.mineRoute = []
        }
        c.memory.mineRoute.push({ x: feet.x, y: feet.y, z: feet.z })
        if (frontier) {
            Object.assign(frontier, { x: target.x, y: target.y, z: target.z })
            frontier.levelSteps = target.y < feet.y ? 0 : (frontier.levelSteps || 0) + 1
        }
        if (c.memory.minedCells.size > 4096) {
            c.memory.minedCells.delete(c.memory.minedCells.values().next().value)
        }
        if (c.activeAction !== 'return_surface' && c.findNearestBlock && c.canPursueDiamond?.() !== false &&
            (findPriorityDiamond(c) || (c.ironWanted && findPriorityOre(c, IRON_ORES)))) {
            c.log.info('Priority ore came into view; leaving the tunnel segment to mine it.')
            return
        }
        // Walking an old tunnel digs nothing and must not re-probe beside earlier probes (01:40Z).
        if (dugFresh && target.y === feet.y && Math.abs(targetY - target.y) <= 8 && c.probeSpacing > 0) {
            c.memory.probeSteps = (c.memory.probeSteps || 0) + 1
            if (c.memory.probeSteps >= c.probeSpacing && !nearProbe(c, target)) {
                c.memory.probeSteps = 0
                rememberProbe(c, target)
                const result = await probeTunnelSides(c, c.memory.mineDirection)
                if (result.foundOre) {
                    return
                }
            }
        }
    }
    c.log.info(`Tunnel: Y ${start.y} -> ${bot.entity.position.y.toFixed(1)}; target Y=${targetY}.`)
    if (bot.entity.position.y < start.y) {
        rememberShaft(c)
    }
}

// The shaft is the continuous tail of mineRoute (steps at most 6 apart) from the last
// surface-level cell down to the bot, kept per dimension across deaths and reconnects.
function rememberShaft(c) {
    const bot = c.bot
    const surfaceY = c.home?.y || 64
    const route = [...(c.memory.mineRoute || []), bot.entity.position.floored()]
    let entrance = -1
    for (let i = route.length - 1; i > 0; i--) {
        if (Math.hypot(route[i].x - route[i - 1].x, route[i].y - route[i - 1].y, route[i].z - route[i - 1].z) > 6) {
            break
        }
        if (route[i - 1].y >= surfaceY - 6) {
            entrance = i - 1
        } else if (entrance >= 0) {
            break
        }
    }
    if (entrance < 0 || route.length - entrance < 8) {
        return
    }
    const cells = route.slice(entrance).map(p => ({ x: p.x, y: p.y, z: p.z }))
    const old = c.memory.shaft
    // Keep a deeper shaft, unless it is too far away (beyond followShaft's 128 blocks) to be used here.
    const oldUsable = old && Math.hypot(old.cells[0].x - cells[0].x, old.cells[0].z - cells[0].z) <= 128
    if (old?.dimension === bot.game.dimension && oldUsable && old.cells.at(-1).y < cells.at(-1).y) {
        return
    }
    c.memory.shaft = { dimension: bot.game.dimension, cells }
    c.log.info(`Remembered a ${cells.length}-cell shaft from ${new Vec3(cells[0].x, cells[0].y, cells[0].z)} to ${new Vec3(cells.at(-1).x, cells.at(-1).y, cells.at(-1).z)}.`)
}

// Re-walk the remembered shaft instead of carving a new staircase. Every eighth cell is
// a waypoint: the dug stairs are open, so the pathfinder covers each leg without digging.
async function followShaft(c, direction) {
    const bot = c.bot
    const shaft = c.memory.shaft
    if (!shaft || shaft.dimension !== bot.game.dimension || shaft.cells.length < 8 || shaft.retryAfter > Date.now()) {
        return false
    }
    const cells = shaft.cells.map(p => new Vec3(p.x, p.y, p.z))
    const here = bot.entity.position
    const end = direction === 'down' ? cells.length - 1 : 0
    let i = cells.reduce((best, p, j) => here.distanceTo(p.offset(0.5, 0, 0.5)) <= 6 &&
        (best < 0 || here.distanceTo(p) < here.distanceTo(cells[best])) ? j : best, -1)
    if (i < 0) {
        const entry = cells[direction === 'down' ? 0 : cells.length - 1]
        if (Math.hypot(here.x - entry.x, here.z - entry.z) > 128 || Math.abs(here.y - entry.y) > 12) {
            return false
        }
        c.log.info(`Travelling to the remembered shaft ${direction === 'down' ? 'entrance' : 'bottom'} at ${entry}.`)
        try {
            await c.gotoWithTimeout(new goals.GoalNear(entry.x, entry.y, entry.z, 1), 30000, 'shaft approach')
        } catch (error) {
            check(c)
            c.log.warn(`Could not reach the remembered shaft (${error.message}); digging instead for five minutes.`)
            shaft.retryAfter = Date.now() + 300000
            return false
        }
        i = cells.length - 1 - end
    }
    if (i === end) {
        return false
    }
    c.log.info(`Following the remembered shaft ${direction} from ${cells[i]} (${Math.abs(end - i)} cells).`)
    let repaired = -1
    let stride = direction === 'down' ? 8 : 1
    const step = direction === 'down' ? 1 : -1
    while (i !== end) {
        check(c)
        // The pathfinder stalls on stair jumps (F004), so climbing goes cell by cell with the
        // checked jump fallback; descending only drops and can take eight-cell legs.
        const from = i
        i = direction === 'down' ? Math.min(end, i + stride) : i - 1
        try {
            if (direction === 'up' && cells[i].y > bot.entity.position.y + 0.5) {
                await climbStep(c, cells[i])
            } else {
                await c.gotoWithTimeout(new goals.GoalBlock(cells[i].x, cells[i].y, cells[i].z), stride === 1 ? 6000 : 15000, 'shaft travel')
            }
        } catch (error) {
            check(c)
            const feet = bot.entity.position.floored()
            const near = cells.reduce((best, p, j) => feet.distanceTo(p) < feet.distanceTo(cells[best]) ? j : best, from)
            if (stride > 1) {
                // Retry a failed long leg one cell at a time from wherever the bot ended up.
                stride = 1
                i = near
                continue
            }
            // Drops leave no jump headroom and night shelters wall off cells; clear the next step
            // once, as a tunnel step would, before giving up on the shaft.
            const next = cells[i]
            const adjacent = Math.abs(next.x - feet.x) + Math.abs(next.z - feet.z) <= 1 && Math.abs(next.y - feet.y) <= 1
            if (adjacent && repaired !== i && safeTunnelStep(bot, feet, next)) {
                repaired = i
                c.log.warn(`Clearing the shaft step to ${next}.`)
                const cellsToClear = next.y > feet.y
                    ? [feet.offset(0, 3, 0), feet.offset(0, 2, 0), next.offset(0, 2, 0), next.offset(0, 1, 0), next]
                    : [next.offset(0, 2, 0), next.offset(0, 1, 0), next]
                for (const p of cellsToClear) {
                    const block = bot.blockAt(p, false)
                    if (block && block.boundingBox !== 'empty' && !PROTECTED_CONTAINERS.has(block.name) && bot.canDigBlock(block)) {
                        const tool = tunnelTool(c, block)
                        if (!tool && block.material === 'mineable/pickaxe') {
                            throw new Error(`shaft repair requires a pickaxe for ${block.name}`)
                        }
                        if (tool) {
                            await bot.equip(tool, 'hand')
                        }
                        await bot.dig(block, true)
                        check(c)
                    }
                }
                i -= step
                continue
            }
            c.log.warn(`Remembered shaft is blocked near ${cells[i]}; forgetting it: ${error.message}`)
            c.memory.shaft = null
            throw error
        }
    }
    c.memory.mineRoute = direction === 'down' ? cells.map(p => ({ x: p.x, y: p.y, z: p.z })) : []
    return true
}

async function gatherDeep(c, names) {
    const bot = c.bot
    const feet = bot.entity.position.floored()
    const block = await scanFor(c, () => c.findNearestBlock(name => names.includes(name), 24, {
        sight: b => miningSight(c, b, 24),
        filter: b => (b.position.x !== feet.x || b.position.z !== feet.z) &&
            !visibleMiningHazard(bot, b.position)
    }))
    if (block) {
        return c.collectTarget(block, block, block.name)
    }
    const targetY = bot.game.minY < 0 ? -54 : 11
    if (bot.entity.position.y > targetY + 8 && await followShaft(c, 'down')) {
        return
    }
    if (await collectOpportunity(c, names) || await exploreCave(c, targetY)) {
        return
    }
    return mineTunnel(c, targetY)
}

async function craftProgression(c, item) {
    const cost = RECIPES[item]
    if (!cost) {
        throw new Error(`unknown progression recipe: ${item}`)
    }
    const planks = (cost.planks || 0) + (c.countItems(['stick']) < (cost.sticks || 0) ? 2 : 0)
    if (planks > 0) {
        await c.ensurePlanks(planks)
    }
    check(c)
    if (c.countItems(['stick']) < (cost.sticks || 0)) {
        await c.craftItem('stick', 4, false)
    }
    check(c)
    await c.ensureItem(item, 1, item !== 'flint_and_steel')
}

async function fillLavaBucket(c) {
    if (c.hasItem('lava_bucket')) {
        return until(c, () => c.advancements.completed.has('minecraft:story/lava_bucket'), 5000)
    }
    const lava = await scanFor(c, () => c.findNearestBlock(name => name === 'lava', 32, {
        filter: b => Number(b.getProperties().level) === 0
    }))
    if (!lava) {
        const targetY = c.bot.game.minY < 0 ? -54 : 11
        if (await exploreCave(c, targetY)) {
            return
        }
        return mineTunnel(c, targetY)
    }
    const empty = c.bot.inventory.items().find(item => item.name === 'bucket')
    if (!empty) {
        throw new Error('lava needs an empty bucket; filled buckets would pour instead')
    }
    try {
        const center = lava.position.offset(0.5, 0.5, 0.5)
        try {
            await c.gotoWithTimeout(new goals.GoalNear(lava.position.x, lava.position.y, lava.position.z, 3), 12000, 'lava approach')
        } catch (error) {
            // Pools seen through rock had no walkable path (01.54.16); tunnel toward one, a few
            // segments at most; the tunnel's liquid checks stop it beside the pool, within reach.
            if (!/no path/i.test(error.message) || c.bot.entity.position.distanceTo(center) > 24) {
                throw error
            }
            const tunnels = c.memory.lavaTunnels ??= {}
            const key = `${lava.position}`
            if ((tunnels[key] || 0) >= 4) {
                throw error
            }
            tunnels[key] = (tunnels[key] || 0) + 1
            c.log.info(`No walking path to lava at ${lava.position}; tunneling toward it (${tunnels[key]}/4).`)
            // A failed goto defers its stop and would abort the first dig (F004).
            c.bot.pathfinder?.setGoal(null)
            await c.bot.waitForTicks?.(2)
            check(c)
            return mineTunnel(c, lava.position.y + 1, lava.position)
        }
        check(c)
        if (c.bot.entity.position.distanceTo(lava.position.offset(0.5, 0.5, 0.5)) > 4.5) {
            throw new Error('lava source is out of reach from dry ground')
        }
        await c.bot.equip(empty, 'hand')
        await c.bot.lookAt(lava.position.offset(0.5, 0.5, 0.5), true)
        c.bot.activateItem()
        try {
            await until(c, () => c.hasItem('lava_bucket'), 4000)
        } finally {
            c.bot.deactivateItem()
        }
    } catch (error) {
        // Ten casts need repeated lava trips; one unreachable source must not absorb every retry.
        if (c.running && !c.paused && !c.actionAbort?.signal.aborted) {
            c.rememberBlockedTarget(lava, 'lava source', error)
        }
        throw error
    }
}

async function smeltCharcoal(c, state) {
    const wanted = state.hasIronPickaxe && state.rawIron > 8 ? 3 : 1
    const block = await c.getFurnace()
    let furnace = await c.bot.openFurnace(block)
    let complete = false
    try {
        const checkInput = () => {
            const input = furnace.inputItem()
            if (input && !isCharcoalLog(input.name)) {
                throw new Error('charcoal furnace contains unrelated input')
            }
            return input
        }
        checkInput()
        const output = furnace.outputItem()
        if (output && output.name !== 'charcoal') {
            throw new Error(`charcoal furnace contains ${output.name} in the output slot`)
        }
        if (!output) {
            const bestLog = () => furnace.items().filter(item => isCharcoalLog(item.name)).sort((a, b) => b.count - a.count)[0]
            await c.bot.waitForTicks?.(2)
            let input = checkInput()
            let log = input || bestLog()
            if (!log) {
                throw new Error('a log is required for charcoal')
            }
            const planksNeeded = count => Math.ceil(Math.max(0, count * 200 - furnaceFuelTicks(furnace)) / 300)
            const needed = planksNeeded(Math.min(wanted, log.count))
            const items = furnace.items()
            const carried = items.filter(item => isFuelPlank(item.name)).reduce((n, item) => n + item.count, 0)
            if (carried < needed) {
                furnace = await preparePlankFuel(c, block, furnace, plankFuelPlan(items, needed))
                await c.bot.waitForTicks?.(2)
                input = checkInput()
                log = input || bestLog()
            }
            if (!log) {
                throw new Error('a log is required for charcoal after crafting fuel')
            }
            const count = Math.min(wanted, log.count)
            let remaining = planksNeeded(count)
            check(c)
            if (!input) {
                await furnace.putInput(log.type, log.metadata, count)
            }
            while (remaining > 0) {
                const available = () => furnace.items().find(item => isFuelPlank(item.name) && item.count > 0 &&
                    (!furnace.fuelItem() || furnace.fuelItem().name === item.name))
                if (!available() && furnace.fuelItem()) {
                    await until(c, () => !furnace.fuelItem(), 2500)
                }
                const planks = available()
                if (!planks) {
                    throw new Error('planks are required for charcoal fuel')
                }
                const added = Math.min(remaining, planks.count)
                await furnace.putFuel(planks.type, planks.metadata, added)
                remaining -= added
            }
            await until(c, () => furnace.outputItem()?.name === 'charcoal' && furnace.outputItem().count >= count, 6000 + count * 10000)
        }
        await furnace.takeOutput()
        if (checkInput()) {
            await furnace.takeInput()
        }
        if (furnace.fuelItem()) {
            await furnace.takeFuel()
        }
        complete = true
    } finally {
        if (!complete && !c.actionAbort?.signal.aborted && isCharcoalLog(furnace.inputItem()?.name ?? '')) {
            await furnace.takeInput().catch(() => {})
        }
        await c.bot.closeWindow(furnace).catch(() => {})
        if (complete) {
            check(c)
            await c.reclaimStation(block)
        }
    }
}

function liquidSource(block, name) {
    return block?.name === name && Number(block.getProperties().level) === 0
}

async function useBucket(c, name, aim, verify, label) {
    const bot = c.bot
    const item = bot.inventory.items().find(item => item.name === name)
    if (!item) {
        throw new Error(`missing ${name} for ${label}`)
    }
    const before = c.countItems([name])
    await bot.equip(item, 'hand')
    await bot.lookAt(aim, true)
    await bot.waitForTicks(2)
    check(c)
    bot.activateItem()
    try {
        await until(c, () => c.countItems([name]) < before && verify(), 4000)
    } catch (error) {
        // Record what the use actually aimed at; scoop misses had no other evidence (02.45.11).
        const eye = bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0)
        const hit = bot.world?.raycast?.(eye, aim.minus(eye).normalize(), 6, () => true)
        throw new Error(`${label}: ${error.message}; held=${bot.heldItem?.name}, ray hit ${hit?.name ?? 'nothing'} ` +
            `at ${hit?.position ?? '-'} aiming ${aim}`, { cause: error })
    } finally {
        bot.deactivateItem()
    }
}

async function fillWaterBucket(c) {
    const bot = c.bot
    const before = c.countItems(['water_bucket'])
    if (before >= 2) {
        return
    }
    const night = Boolean(c.isNight?.())
    const feet = bot.entity.position.floored()
    const outside = openToSky(bot, feet.offset(0, 1, 0))
    c.waterDaytimeSearch = !night
    const range = night && !outside ? 32 : outside && !night ? 48 : 4
    const water = await scanFor(c, () => c.findNearestBlock(name => name === 'water', range, {
        filter: b => liquidSource(b, 'water') &&
            (bot.entity.position.distanceTo(b.position.offset(0.5, 0.5, 0.5)) <= 4.5 ||
                openToSky(bot, b.position.offset(0, 1, 0)) === outside)
    }))
    if (!water) {
        if (night) {
            if (outside) {
                return c.makeNightSafe()
            }
            if (await exploreCave(c, feet.y, p => !openToSky(bot, p.offset(0, 1, 0)))) {
                return
            }
            try {
                return await mineTunnel(c, feet.y, null, true)
            } catch (error) {
                check(c)
                if (!/no supported dry tunnel step/.test(error.message)) {
                    throw error
                }
                c.log.info('No covered water-search route; waiting underground.')
                await bot.waitForTicks(20)
                check(c)
                return
            }
        }
        if (!outside) {
            return returnSurface(c)
        }
        return c.scout(24, { surfaceOnly: true })
    }
    const guarded = Boolean(bot.pathfinder && c.movements)
    if (guarded) {
        const walking = dryMovements(bot)
        walking.exclusionAreasStep.push(block => block.position &&
            openToSky(bot, block.position.offset(0, 1, 0)) === outside ? 0 : 100)
        bot.pathfinder.setMovements(walking)
    }
    try {
        const banks = DIRECTIONS.flatMap(([dx, dz]) => [water.position.offset(dx, 1, dz), water.position.offset(dx, 0, dz)])
            .filter(p => c.isEmptyPlacementBlock(bot.blockAt(p)) && c.isEmptyPlacementBlock(bot.blockAt(p.offset(0, 1, 0))) &&
                bot.blockAt(p.offset(0, -1, 0))?.boundingBox === 'block')
            .sort((a, b) => bot.entity.position.distanceTo(a) - bot.entity.position.distanceTo(b))
        const bank = banks[0]
        if (!bank) {
            // Cave springs sit in rock with no open bank (02.29.19: eight misses in a row); a bucket
            // reaches about 4.5 blocks, so stand anywhere near enough instead.
            await c.gotoWithTimeout(new goals.GoalNear(water.position.x, water.position.y, water.position.z, 3), 12000, 'water approach')
            if (bot.entity.position.distanceTo(water.position.offset(0.5, 0.5, 0.5)) > 4.5) {
                throw new Error('water source has no dry bank and is out of reach')
            }
            // The bucket's ray stops at rock; a hidden spring would only time out the 4 s scoop check.
            if (bot.canSeeBlock && !canSeeBlock(bot, water)) {
                throw new Error('water source has no dry bank and is not in line of sight')
            }
        } else if (!bot.entity.position.floored().equals(bank)) {
            await c.gotoWithTimeout(new goals.GoalBlock(bank.x, bank.y, bank.z), 12000, 'water approach')
        }
        await useBucket(c, 'bucket', water.position.offset(0.5, 0.5, 0.5),
            () => c.countItems(['water_bucket']) > before, 'fill water bucket')
        c.log.info(`Water buckets ready: ${c.countItems(['water_bucket'])}/2.`)
    } catch (error) {
        if (c.running && !c.paused && !c.actionAbort?.signal.aborted) {
            c.rememberBlockedTarget(water, 'water source', error)
        }
        throw error
    } finally {
        if (guarded) {
            bot.pathfinder.setMovements(c.movements)
        }
    }
}

function containedBasin(bot, cells, checkFloor = true) {
    const solid = p => {
        const block = bot.blockAt(p)
        return block?.boundingBox === 'block' && !HAZARDS.has(block.name) && !PROTECTED_CONTAINERS.has(block.name)
    }
    return cells.every(p => (!checkFloor || solid(p.offset(0, -1, 0))) && DIRECTIONS.every(([dx, dz]) => {
        const bank = p.offset(dx, 0, dz)
        return cells.some(cell => cell.equals(bank)) || solid(bank)
    }))
}

function safeCastingBasin(bot, basin) {
    return containedBasin(bot, [basin])
}

async function digBasinCell(c, p) {
    const bot = c.bot
    const block = bot.blockAt(p)
    if (c.isEmptyPlacementBlock(block)) {
        return
    }
    if (!block || !bot.canDigBlock(block) || !c.movements.safeToBreak(block) || HAZARDS.has(block.name) ||
        PROTECTED_CONTAINERS.has(block.name)) {
        throw new Error(`unsafe basin excavation at ${p}`)
    }
    await bot.tool.equipForBlock(block, { requireHarvest: true, getFromChest: false })
    check(c)
    await bot.dig(block, true)
    await until(c, () => c.isEmptyPlacementBlock(bot.blockAt(p)), 2000)
}

async function approachBasin(c, findAt) {
    const bot = c.bot
    const feet = bot.entity.position.floored()
    const here = findAt(feet)
    if (here) {
        return here
    }
    const site = c.findWorkstationPlacements(4).find(({ target }) => safeFooting(bot, target) && findAt(target))
    if (!site) {
        return null
    }
    const p = site.target
    bot.pathfinder.setMovements(dryMovements(bot))
    try {
        await c.gotoWithTimeout(new goals.GoalBlock(p.x, p.y, p.z), 8000, 'basin bank')
        check(c)
        return bot.entity.position.floored().equals(p) ? findAt(p) : null
    } finally {
        bot.pathfinder.setGoal(null)
        bot.pathfinder.setMovements(c.movements)
    }
}

async function prepareWaterPool(c) {
    const bot = c.bot
    const dimension = bot.game.dimension
    if (c.memory.waterPool?.dimension === dimension || c.countItems(['water_bucket']) < 2) {
        return
    }
    const layout = await approachBasin(c, feet => {
        for (const [dx, dz] of DIRECTIONS) {
            const center = feet.offset(dx, -1, dz)
            const ends = [center.offset(dz, 0, -dx), center.offset(-dz, 0, dx)]
            const cells = [center, ...ends]
            if (containedBasin(bot, cells) && cells.every(p => c.isEmptyPlacementBlock(bot.blockAt(p.offset(0, 1, 0))))) {
                return { center, ends, cells, dx, dz }
            }
        }
        return null
    })
    if (!layout) {
        return
    }
    const { center, ends, cells, dx, dz } = layout
    for (const p of cells) {
        await digBasinCell(c, p)
    }
    for (const p of ends) {
        await useBucket(c, 'water_bucket', p.offset(0.5 + 0.4 * dx, -0.01, 0.5 + 0.4 * dz),
            () => liquidSource(bot.blockAt(p), 'water'), 'seed renewable water pool')
    }
    await until(c, () => cells.every(p => liquidSource(bot.blockAt(p), 'water')), 4000)
    c.memory.waterPool = { dimension, x: center.x, y: center.y, z: center.z }
    c.log.info(`Renewable water pool at ${center}.`)
    for (let i = 0; i < 2; i++) {
        const before = c.countItems(['water_bucket'])
        await useBucket(c, 'bucket', center.offset(0.5, 0.5, 0.5),
            () => c.countItems(['water_bucket']) > before, 'refill from renewable water pool')
        await until(c, () => liquidSource(bot.blockAt(center), 'water'), 4000)
    }
}

async function gatherObsidian(c) {
    const bot = c.bot
    let feet = bot.entity.position.floored()
    const saved = c.memory.obsidianCast
    const savedBasin = saved && new Vec3(saved.x, saved.y, saved.z)
    let basin = saved?.dimension === bot.game.dimension && savedBasin.offset(0, 2, 0).distanceTo(feet) <= 1 &&
        ['lava', 'obsidian'].includes(bot.blockAt(savedBasin)?.name) ? savedBasin : null
    if (!basin) {
        delete c.memory.obsidianCast
    }
    const exposed = c.findNearestBlock(name => name === 'obsidian', 24, {
        mining: true,
        filter: block => c.movements.safeToBreak(block) &&
            !DIRECTIONS.some(([dx, dz]) => ['lava', 'water'].includes(c.bot.blockAt(block.position.offset(dx, 0, dz))?.name)) &&
            c.bot.blockAt(block.position.offset(0, -1, 0))?.boundingBox === 'block'
    })
    if (!basin && exposed) {
        return c.collectTarget(exposed, exposed, 'obsidian')
    }
    if (!basin && !c.hasItem('lava_bucket')) {
        await prepareWaterPool(c)
        return fillLavaBucket(c)
    }
    if (!basin) {
        if (c.countItems(['water_bucket']) < 2) {
            return fillWaterBucket(c)
        }
        basin = await approachBasin(c, bank => DIRECTIONS.map(([dx, dz]) => bank.offset(dx, -2, dz)).find(p =>
            safeCastingBasin(bot, p) && safeCastingBasin(bot, p.offset(0, 1, 0)) &&
            c.isEmptyPlacementBlock(bot.blockAt(p.offset(0, 2, 0))) &&
            [p, p.offset(0, 1, 0)].every(cell => c.movements.safeToBreak(bot.blockAt(cell)))))
        if (!basin) {
            return c.scout(8)
        }
        feet = bot.entity.position.floored()
        await digBasinCell(c, basin.offset(0, 1, 0))
        await digBasinCell(c, basin)
        c.memory.obsidianCast = { dimension: bot.game.dimension, x: basin.x, y: basin.y, z: basin.z }
        await useBucket(c, 'lava_bucket', basin.offset(0.5 + 0.4 * (basin.x - feet.x), -0.01, 0.5 + 0.4 * (basin.z - feet.z)),
            () => liquidSource(bot.blockAt(basin), 'lava'), 'pour casting lava')
    }
    const upper = basin.offset(0, 1, 0)
    if (bot.blockAt(basin)?.name === 'lava' && !liquidSource(bot.blockAt(upper), 'water')) {
        const dx = basin.x - feet.x
        const dz = basin.z - feet.z
        if (Math.abs(dx) + Math.abs(dz) !== 1 || !safeCastingBasin(bot, basin) || !containedBasin(bot, [upper], false)) {
            throw new Error('casting water needs a dry bank beside the basin')
        }
        await useBucket(c, 'water_bucket', upper.offset(0.5 + 0.51 * dx, 0.8, 0.5 + 0.51 * dz),
            () => liquidSource(bot.blockAt(upper), 'water'), 'pour water above casting lava')
    }
    await until(c, () => bot.blockAt(basin)?.name === 'obsidian', 4000)
    if (liquidSource(bot.blockAt(upper), 'water')) {
        await useBucket(c, 'bucket', upper.offset(0.5, 0.85, 0.5),
            () => c.isEmptyPlacementBlock(bot.blockAt(upper)), 'recover casting water')
    }
    check(c)
    const block = bot.blockAt(basin)
    c.log.info(`Cast obsidian at ${basin}.`)
    await c.collectTarget(block, block, 'cast obsidian')
    delete c.memory.obsidianCast
}

function portalFrame(origin) {
    // Ten-block frame in the XY plane, with omitted corners and a 2x3 interior.
    return [[1, 0], [2, 0], [0, 1], [0, 2], [0, 3], [3, 1], [3, 2], [3, 3], [1, 4], [2, 4]]
        .map(([x, y]) => origin.offset(x, y, 0))
}

async function placeAt(c, name, target, stand = null) {
    check(c)
    if (c.bot.blockAt(target)?.name === name) {
        return
    }
    if (!c.isEmptyPlacementBlock(c.bot.blockAt(target))) {
        throw new Error(`build site obstructed at ${target}`)
    }
    if (!stand) {
        await c.gotoWithTimeout(new goals.GoalNear(target.x, Math.min(target.y, c.bot.entity.position.y), target.z, 2), 10000, 'building approach')
    } else if (!c.bot.entity.position.floored().equals(stand)) {
        await c.gotoWithTimeout(new goals.GoalBlock(stand.x, stand.y, stand.z), 10000, 'building approach')
    }
    for (const [dx, dy, dz] of [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
        const ref = c.bot.blockAt(target.offset(dx, dy, dz))
        if (!ref || ref.boundingBox !== 'block') {
            continue
        }
        check(c)
        const item = c.bestItem([name])
        if (!item) {
            throw new Error(`missing build material: ${name}`)
        }
        await c.bot.equip(item, 'hand')
        await c.bot.placeBlock(ref, new Vec3(-dx, -dy, -dz))
        return until(c, () => c.bot.blockAt(target)?.name === name, 3000)
    }
    throw new Error(`no solid support at ${target}`)
}

async function enterNether(c) {
    const bot = c.bot
    if (bot.game.dimension === 'the_nether') {
        return until(c, () => c.advancements.completed.has('minecraft:story/enter_the_nether'), 5000)
    }
    let portal = await scanFor(c, () => c.findNearestBlock(name => name === 'nether_portal', 32))
    if (!portal) {
        if (!c.memory.portalOrigin) {
            const here = bot.entity.position.floored()
            for (let dx = -6; dx <= 6 && !c.memory.portalOrigin; dx++) {
                for (let dz = -6; dz <= 6 && !c.memory.portalOrigin; dz++) {
                    const origin = here.offset(dx, 0, dz)
                    let clear = true
                    for (let x = 0; x < 4; x++) {
                        for (let z = -1; z <= 1; z++) {
                            const floor = bot.blockAt(origin.offset(x, -1, z))
                            if (!floor || floor.boundingBox !== 'block' || HAZARDS.has(floor.name)) {
                                clear = false
                            }
                            for (let y = 0; y <= 4; y++) {
                                if (!c.isEmptyPlacementBlock(bot.blockAt(origin.offset(x, y, z)))) {
                                    clear = false
                                }
                            }
                        }
                    }
                    if (clear && !portalFrame(origin).some(p => p.equals(here) || p.equals(here.offset(0, 1, 0)))) {
                        c.memory.portalOrigin = { x: origin.x, y: origin.y, z: origin.z }
                    }
                }
            }
        }
        if (!c.memory.portalOrigin) {
            return c.scout(12)
        }
        const { x, y, z } = c.memory.portalOrigin
        const origin = new Vec3(x, y, z)
        // Build from the cleared row beside the frame plane, so the bot never stands in a frame cell.
        const build = (name, p) => placeAt(c, name, p, new Vec3(Math.min(Math.max(p.x, x), x + 3), y, z + 1))
        await build('cobblestone', origin)
        await build('cobblestone', origin.offset(3, 0, 0))
        for (const p of portalFrame(origin).filter(p => p.y < origin.y + 4)) {
            await build('obsidian', p)
        }
        await build('cobblestone', origin.offset(0, 4, 0))
        for (const p of portalFrame(origin).filter(p => p.y === origin.y + 4)) {
            await build('obsidian', p)
        }
        check(c)
        await bot.equip(c.bestItem(['flint_and_steel']), 'hand')
        await bot.activateBlock(bot.blockAt(origin.offset(1, 0, 0)), new Vec3(0, 1, 0))
        await until(c, () => bot.blockAt(origin.offset(1, 1, 0))?.name === 'nether_portal', 5000)
        portal = bot.blockAt(origin.offset(1, 1, 0))
    }
    check(c)
    await c.gotoWithTimeout(new goals.GoalBlock(portal.position.x, portal.position.y, portal.position.z), 15000, 'portal entry')
    await until(c, () => bot.game.dimension === 'the_nether', 10000)
    c.log.info('Entered the Nether. The supported route ends here; waiting near the portal.')
}

function redstonePlan(state) {
    if (state.redstoneInProgress) {
        return { action: 'build_redstone' }
    }
    for (const item of ['piston', 'lever']) {
        if (!state.items[item]) {
            return { action: resourceAction(state, RECIPES[item]) || 'craft_progression', item }
        }
    }
    return { action: resourceAction(state, { cobblestone: 4 }) || 'build_redstone' }
}

async function buildRedstone(c) {
    if (c.bot.game.dimension !== 'overworld') {
        throw new Error('redstone demo needs an Overworld build site; bring the bot back with !come first')
    }
    let origin = c.memory.redstoneOrigin
    if (!origin) {
        const candidate = c.findWorkstationPlacements(5).find(({ target }) =>
            [0, 1, 2].every(dx => c.isEmptyPlacementBlock(c.bot.blockAt(target.offset(dx, 0, 0))) &&
                c.bot.blockAt(target.offset(dx, -1, 0))?.boundingBox === 'block'))
        if (!candidate) {
            return c.scout(12)
        }
        origin = c.memory.redstoneOrigin = candidate.target
    }
    if (c.memory.redstoneBuilt) {
        c.memory.redstoneRequested = false
        return
    }
    await placeAt(c, 'piston', origin)
    const piston = c.bot.blockAt(origin)
    const facing = piston.getProperties().facing
    const offsets = { north: [0, 0, -1], south: [0, 0, 1], east: [1, 0, 0], west: [-1, 0, 0], up: [0, 1, 0], down: [0, -1, 0] }
    const front = origin.plus(new Vec3(...offsets[facing]))
    const lever = origin.offset(0, 0, facing === 'south' ? -1 : 1)
    if (facing === 'down' || !c.isEmptyPlacementBlock(c.bot.blockAt(front)) ||
        !c.isEmptyPlacementBlock(c.bot.blockAt(front.plus(front.minus(origin))))) {
        throw new Error('piston has no clear extension space')
    }
    await placeAt(c, 'cobblestone', front)
    await placeAt(c, 'lever', lever)
    await c.bot.activateBlock(c.bot.blockAt(lever))
    await until(c, () => c.bot.blockAt(origin)?.getProperties().extended === true, 4000)
    await sleep(1000)
    check(c)
    await c.bot.activateBlock(c.bot.blockAt(lever))
    await until(c, () => c.bot.blockAt(origin)?.getProperties().extended === false, 4000)
    c.memory.redstoneRequested = false
    c.memory.redstoneBuilt = true
    c.log.info(`Built and tested a lever-powered piston block pusher at ${origin}.`)
    c.bot.chat(`Piston demo built at ${origin.x}, ${origin.y}, ${origin.z}.`)
}

// Tree canopies dim sky light without making the bot underground: only a solid non-leaf block
// within 24 blocks overhead counts as cover (a valley floor under leaves stayed "underground").
function coveredAbove(bot, head) {
    for (let dy = 1; dy <= 24; dy++) {
        const block = bot.blockAt(head.offset(0, dy, 0), false)
        if (block?.boundingBox === 'block' && !block.name.endsWith('_leaves')) {
            return true
        }
    }
    return false
}

function openToSky(bot, head) {
    if (bot.blockAt(head, false)?.skyLight === 15) {
        return true
    }
    const top = (bot.game?.minY ?? -64) + (bot.game?.height ?? 384)
    for (let y = head.y; y < top; y++) {
        const block = bot.blockAt(new Vec3(head.x, y, head.z), false)
        if (!block || (block.boundingBox === 'block' && !block.name.endsWith('_leaves'))) {
            return false
        }
    }
    return true
}

async function returnSurface(c, surfaceY = c.home?.y || 64) {
    if (openToSky(c.bot, c.bot.entity.position.floored().offset(0, 1, 0))) {
        c.memory.surfaceByStaircase = false
        return
    }
    const retry = c.picklessReturnRetry
    const dimension = c.bot.game?.dimension
    if (retry && retry.dimension === dimension && retry.until > Date.now() && !miningPickaxe(c)) {
        return sleep(2000)
    }
    const route = c.memory.mineRoute || []
    // Walking off the route (ore pickup, restock) leaves deeper cells behind; resume at the nearest one.
    const here = c.bot.entity.position
    const nearest = route.reduce((best, p, i) => {
        const d = here.distanceTo(new Vec3(p.x + 0.5, p.y, p.z + 0.5))
        return d < best.d ? { i, d } : best
    }, { i: -1, d: Infinity })
    route.length = nearest.d <= 6 ? nearest.i + 1 : 0
    for (let i = 0; !c.memory.surfaceByStaircase && route.length; i++) {
        if (i === 6) {
            return
        }
        check(c)
        const { x, y, z } = route.at(-1)
        const target = new Vec3(x, y, z)
        const feet = c.bot.entity.position.floored()
        try {
            if (target.y === feet.y + 1 && Math.abs(target.x - feet.x) + Math.abs(target.z - feet.z) === 1) {
                await climbStep(c, target)
            } else {
                await c.gotoWithTimeout(new goals.GoalBlock(x, y, z), 8000, 'return staircase')
            }
            if (c.bot.entity.position.distanceTo(target.offset(0.5, 0, 0.5)) > 1.2) {
                throw new Error('return waypoint was not reached')
            }
        } catch (error) {
            check(c)
            c.log.warn(`Current return stairs blocked at ${target}: ${error.message}.`)
            break
        }
        route.pop()
    }
    const head = c.bot.entity.position.floored().offset(0, 1, 0)
    // Hills rise above the home level; reaching home Y inside one left the bot walled in (00.35.19).
    const outside = openToSky(c.bot, head)
    const enclosed = c.bot.entity.position.y >= surfaceY - 1 && !outside
    if (outside || (!enclosed && await followShaft(c, 'up'))) {
        c.memory.surfaceByStaircase = false
        return
    }
    if (!miningPickaxe(c)) {
        // Without a pick only walking (and hand-digging soft blocks) can climb; any node at the
        // surface level ends the search, and height is the A* heuristic.
        const up = Object.assign(new goals.Goal(), {
            heuristic: node => Math.max(0, surfaceY - 1 - node.y),
            isEnd: node => node.y >= surfaceY - 1 && (!enclosed || openToSky(c.bot, new Vec3(node.x, node.y + 1, node.z)))
        })
        try {
            await c.gotoWithTimeout(up, 20000, 'pickaxe-free climb')
            if (c.bot.entity.position.y >= surfaceY - 1 && (!enclosed || openToSky(c.bot, c.bot.entity.position.floored().offset(0, 1, 0)))) {
                return
            }
        } catch (error) {
            check(c)
            if (!/no path|timed out/i.test(error.message)) {
                throw error
            }
        }
        c.picklessReturnRetry = { dimension, until: Date.now() + 30000 }
        throw new Error('return stairs blocked and carving requires a pickaxe')
    }
    if (!c.memory.surfaceByStaircase) {
        c.log.warn('Known return stairs unavailable. Carving a supported staircase.')
        c.memory.surfaceByStaircase = true
        c.memory.mineRoute = []
    }
    return mineTunnel(c, enclosed ? head.y + 3 : surfaceY)
}

// Four open feet/head cells carry a level throw about three blocks, beyond the
// one-block pickup reach; a 45-degree throw up a carved stair lands about two steps up.
function tossLane(c, start) {
    const bot = c.bot
    const back = (c.memory.mineRoute || []).findLast(p => p.x !== start.x || p.z !== start.z)
    const empty = p => {
        const block = bot.blockAt(p, false)
        return block?.boundingBox === 'empty' && !['water', 'bubble_column'].includes(block.name)
    }
    let best = null
    for (const [dx, dz] of DIRECTIONS) {
        for (const rise of [0, 1]) {
            const open = (!rise || empty(start.offset(0, 2, 0))) && [1, 2, 3, 4 - rise].every(k =>
                [0, 1].every(dy => empty(start.offset(dx * k, rise * k + dy, dz * k))))
            const score = (back ? 2 * (dx * (back.x - start.x) + dz * (back.z - start.z)) : 0) - rise
            if (open && (!best || score > best.score)) {
                best = { dx, dz, rise, score }
            }
        }
    }
    return best
}

// User technique: from feet cell F facing wall d, dig F+d+1 and F+2d+1 at head height, then
// the pit F+2d. Items thrown through the hole fall into the pit; the intact F+d and roof
// F+d+2 keep the bot out, and the pit is 2 blocks away, beyond the 1.3-block pickup reach.
function disposalPit(c, start) {
    const bot = c.bot
    const back = (c.memory.mineRoute || []).findLast(p => p.x !== start.x || p.z !== start.z)
    const solid = b => b?.boundingBox === 'block' && !HAZARDS.has(b.name)
    const liquid = b => !b || ['water', 'lava', 'bubble_column'].includes(b.name)
    let best = null
    for (const [dx, dz] of DIRECTIONS) {
        const at = (k, dy) => start.offset(dx * k, dy, dz * k)
        const cells = [at(1, 1), at(2, 1), at(2, 0)]
        const sound = cells.every(p => {
            const block = bot.blockAt(p, false)
            return block && !HAZARDS.has(block.name) && !PROTECTED_CONTAINERS.has(block.name) &&
                (block.boundingBox === 'empty' || (block.diggable && bot.canDigBlock?.(block) !== false)) &&
                [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0], [0, -1, 0]].every(([x, y, z]) => !liquid(bot.blockAt(p.offset(x, y, z), false)))
        })
        if (!sound || !solid(bot.blockAt(at(1, 0), false)) || !solid(bot.blockAt(at(1, 2), false)) ||
            !solid(bot.blockAt(at(2, -1), false)) || ['sand', 'red_sand', 'gravel'].includes(bot.blockAt(at(2, 2), false)?.name)) {
            continue
        }
        const score = back ? -Math.abs(dx * (back.x - start.x) + dz * (back.z - start.z)) : 0
        if (!best || score > best.score) {
            best = { dx, dz, cells, score }
        }
    }
    return best
}

async function digDisposalPit(c, pit, signal) {
    const bot = c.bot
    for (const p of pit.cells) {
        check(c)
        if (signal?.aborted) {
            throw new Error('disposal cancelled')
        }
        const block = bot.blockAt(p, false)
        if (block?.boundingBox === 'empty') {
            continue
        }
        const tool = tunnelTool(c, block)
        if (tool) {
            await bot.equip(tool, 'hand')
        }
        await bot.dig(block, true)
        if (bot.blockAt(p, false)?.boundingBox !== 'empty') {
            throw new Error(`disposal pit cell ${p} was not cleared`)
        }
    }
}

function disposalFailed(c, message) {
    c.memory.disposalFailures = (c.memory.disposalFailures || 0) + 1
    if (c.memory.disposalFailures >= 3) {
        c.memory.disposalFailures = 0
        c.memory.disposalBackoffUntil = Date.now() + 60000
        c.log.warn?.('Disposal failed three times; continuing other work for 60s before retrying cleanup.')
    }
    return new Error(message)
}

async function tossAll(c, stacks, target, signal) {
    const bot = c.bot
    await bot.lookAt(target, true)
    // Forced look updates local rotation before the next movement packet transmits it.
    await bot.waitForTicks?.(2)
    for (const item of stacks) {
        check(c)
        if (signal?.aborted) {
            throw new Error('disposal cancelled')
        }
        await bot.tossStack(item)
    }
}

async function clearInventory(c) {
    const bot = c.bot
    const items = bot.inventory.items()
    const full = bot.inventory.emptySlotCount() === 0
    const surplus = discardableStacks(items)
    if (!surplus.length) {
        if (!full || !items.length) {
            return
        }
        surplus.push(overflowStack(items, bot.registry.foodsByName))
    }
    const signal = c.actionAbort?.signal
    const start = bot.entity.position.floored()
    const summary = surplus.map(item => `${item.count} ${item.name}`).join(', ')
    const pit = disposalPit(c, start)
    if (pit) {
        c.log.info(`Freeing inventory space: digging a shielded pit toward ${pit.dx},${pit.dz} and throwing ${summary} into it.`)
        await digDisposalPit(c, pit, signal)
        await tossAll(c, surplus, bot.entity.position.offset(3 * pit.dx, 1.62, 3 * pit.dz), signal)
        c.memory.lastDisposal = { x: pit.cells[2].x, z: pit.cells[2].z, dimension: bot.game.dimension, at: Date.now() }
        c.memory.disposalFailures = 0
        return
    }
    const lane = tossLane(c, start)
    if (lane) {
        c.log.info(`Freeing inventory space: throwing ${summary} along an open ${lane.rise ? 'stair' : 'level'} lane; no retreat needed.`)
        await tossAll(c, surplus, bot.entity.position.offset(4 * lane.dx, 1.62 + 4 * lane.rise, 4 * lane.dz), signal)
        c.memory.lastDisposal = { x: start.x + (3 - lane.rise) * lane.dx, z: start.z + (3 - lane.rise) * lane.dz, dimension: bot.game.dimension, at: Date.now() }
        c.memory.disposalFailures = 0
        return
    }
    const previousDrop = c.memory.lastDisposal
    const recentDrop = previousDrop && previousDrop.dimension === bot.game.dimension && Date.now() - previousDrop.at < 120000
    const queue = [{ p: start, path: [] }]
    const seen = new Set([start.toString()])
    let retreat = null
    for (let i = 0; i < queue.length && i < 64 && !retreat; i++) {
        const node = queue[i]
        if (Math.hypot(node.p.x - start.x, node.p.z - start.z) >= 3 &&
            (!recentDrop || Math.hypot(node.p.x - previousDrop.x, node.p.z - previousDrop.z) >= 4)) {
            retreat = node.path
            break
        }
        if (node.path.length >= 4) {
            continue
        }
        for (const [dx, dz] of DIRECTIONS) {
            for (const dy of [0, 1, -1]) {
                const p = node.p.offset(dx, dy, dz)
                if (seen.has(p.toString()) || c.isBlockedTarget?.({ position: p }) || !safeFooting(bot, p) ||
                    (dy !== 0 && !['air', 'cave_air', 'void_air'].includes(bot.blockAt((dy > 0 ? node.p : p).offset(0, 2, 0))?.name))) {
                    continue
                }
                seen.add(p.toString())
                queue.push({ p, path: [...node.path, p] })
                break
            }
        }
    }
    if (!retreat) {
        if (full) {
            const stack = surplus[0]
            const stored = await storeOverflowAtBase(c, stack).catch(error => {
                c.log.warn(`Overflow storage failed: ${error.message}`)
                return false
            })
            if (!stored && bot.inventory.emptySlotCount() === 0) {
                check(c)
                c.log.warn(`No safe disposal route; dropping ${stack.count} ${stack.name} here to free a slot.`)
                await tossAll(c, [stack], start.offset(1.5, 0.5, 0.5), signal)
                c.memory.disposalBackoffUntil = Date.now() + 5000
            }
            return
        }
        throw disposalFailed(c, 'no open toss lane or supported disposal retreat; refusing a stationary drop/pickup loop')
    }
    const away = start.minus(retreat.at(-1))
    c.log.info(`Freeing inventory space: dropping ${summary}; retreating ${retreat.length} steps.`)
    await tossAll(c, surplus, bot.entity.position.offset(away.x, 1.3, away.z), signal)
    c.memory.lastDisposal = { x: start.x, z: start.z, dimension: bot.game.dimension, at: Date.now() }
    check(c)
    bot.pathfinder.setMovements(dryMovements(bot))
    try {
        for (const p of retreat) {
            check(c)
            if (signal?.aborted || !safeFooting(bot, p)) {
                throw new Error('disposal retreat interrupted')
            }
            const feet = bot.entity.position.floored()
            c.memory.mineRoute ??= []
            c.memory.mineRoute.push({ x: feet.x, y: feet.y, z: feet.z })
            try {
                if (p.y > feet.y) {
                    await climbStep(c, p)
                } else {
                    await c.gotoWithTimeout(new goals.GoalBlock(p.x, p.y, p.z), 4000, 'disposal retreat')
                }
            } catch (error) {
                c.log.warn?.(`Disposal step failed: from=${feet}, target=${p}, actual=${bot.entity.position}; ${error.message}`)
                c.rememberBlockedTarget?.({ position: p }, 'disposal retreat', error)
                throw error
            }
        }
        c.memory.disposalFailures = 0
    } catch (error) {
        throw Object.assign(disposalFailed(c, error.message), { cause: error })
    } finally {
        bot.pathfinder.setGoal(null)
        bot.pathfinder.setMovements(c.movements)
    }
}

// Player inventory armor slots: 5 head, 6 torso, 7 legs, 8 feet.
const ARMOR_SLOTS = [['helmet', 'head', 5], ['chestplate', 'torso', 6], ['leggings', 'legs', 7], ['boots', 'feet', 8]]

function armorUpgrades(bot) {
    const tier = name => name ? ARMOR_TIERS.indexOf(name.split('_')[0]) : -1
    return ARMOR_SLOTS.map(([piece, destination, slot]) => {
        const item = bot.inventory.items().filter(i => i.name.endsWith(`_${piece}`) && tier(i.name) >= 0)
            .sort((a, b) => tier(b.name) - tier(a.name))[0]
        return item && tier(item.name) > tier(bot.inventory.slots[slot]?.name) ? { item, destination } : null
    }).filter(Boolean)
}

async function leaveNether(c) {
    const bot = c.bot
    if (bot.game.dimension !== 'the_nether') {
        return
    }
    const occupied = bot.blockAt(bot.entity.position.floored())
    const portal = occupied?.name === 'nether_portal'
        ? occupied : await scanFor(c, () => c.findNearestBlock(name => name === 'nether_portal', 16))
    if (!portal) {
        throw new Error('no nether portal within 16 blocks to return through')
    }
    // An arriving player stands in the portal on cooldown; step out, then walk back in.
    if (portal === occupied) {
        const out = DIRECTIONS.map(([dx, dz]) => bot.entity.position.floored().offset(dx, 0, dz))
            .find(p => safeFooting(bot, p) && bot.blockAt(p)?.name !== 'nether_portal')
        if (!out) {
            throw new Error('no safe cell beside the arrival portal')
        }
        await c.gotoWithTimeout(new goals.GoalBlock(out.x, out.y, out.z), 6000, 'portal exit')
        await bot.waitForTicks(20)
    }
    check(c)
    await c.gotoWithTimeout(new goals.GoalBlock(portal.position.x, portal.position.y, portal.position.z), 10000, 'portal return')
    await until(c, () => bot.game.dimension === 'overworld', 15000)
    c.log.info('Returned to the Overworld through the portal.')
}

async function performProgression(c, action, state) {
    switch (action) {
        case 'clear_inventory': return clearInventory(c)
        case 'smelt_charcoal': return smeltCharcoal(c, state)
        case 'craft_stone_axe': return craftProgression(c, 'stone_axe')
        case 'craft_stone_shovel': return craftProgression(c, 'stone_shovel')
        case 'craft_progression': {
            const goal = state.sideGoal || nextAdvancement(state)
            return craftProgression(c, goal.item)
        }
        case 'equip_armor':
            for (const { item, destination } of armorUpgrades(c.bot)) {
                check(c)
                await c.bot.equip(item, destination)
            }
            return
        case 'equip_shield':
            return c.bot.equip(c.bestItem(['shield']), 'off-hand')
        case 'fill_lava_bucket': return fillLavaBucket(c)
        case 'fill_water_bucket': return fillWaterBucket(c)
        case 'mine_diamond':
        case 'mine_iron': {
            const ore = action.slice(5)
            const block = ore === 'iron' ? findPriorityOre(c, IRON_ORES) : findPriorityDiamond(c)
            if (!block) {
                return
            }
            c.log.info(`Priority ${ore}: ${block.name} at ${block.position}.`)
            return c.collectTarget(block, block, `priority ${ore}`)
        }
        case 'gather_diamonds': return gatherDeep(c, ['diamond_ore', 'deepslate_diamond_ore'])
        case 'gather_redstone': return gatherDeep(c, ['redstone_ore', 'deepslate_redstone_ore'])
        case 'gather_lapis': return gatherDeep(c, ['lapis_ore', 'deepslate_lapis_ore'])
        case 'gather_obsidian': return gatherObsidian(c)
        case 'gather_flint': return c.gatherOre(['gravel'], 24)
        case 'enter_nether': return enterNether(c)
        case 'leave_nether': return leaveNether(c)
        case 'build_redstone': return buildRedstone(c)
        case 'return_surface': return returnSurface(c, state.departureSurfaceY)
        case 'wait': return sleep(2000)
        default: throw new Error(`unknown progression action: ${action}`)
    }
}

module.exports = { armorUpgrades, coveredAbove, openToSky, followShaft, rememberShaft, performProgression, safeTunnelStep, portalFrame, redstonePlan, until, mineTunnel, safeCastingBasin, probeTunnelSides, miningPickaxe, climbStep, PROTECTED_CONTAINERS, WOODCUTTING_AXES, DIGGING_SHOVELS }
