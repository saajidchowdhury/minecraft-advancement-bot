'use strict'

const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { discardableStacks } = require('./inventory')
const { exploreCave, collectOpportunity, safeFooting, dryMovements, rememberOre, findPriorityDiamond } = require('./cave-exploration')
const { RECIPES, nextAdvancement, resourceAction } = require('./advancement-plan')

const HAZARDS = new Set(['lava', 'water', 'fire', 'soul_fire', 'sand', 'red_sand', 'gravel', 'bedrock'])
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
        if (!block || HAZARDS.has(block.name) || (block.boundingBox !== 'empty' && !block.diggable)) {
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
    for (const name of ['stone_pickaxe', 'wooden_pickaxe', 'iron_pickaxe', 'diamond_pickaxe', 'netherite_pickaxe']) {
        const item = c.bestItem([name])
        if (item && (!block || block.canHarvest(item.type))) {
            return item
        }
    }
    return null
}

async function probeTunnelSides(c, direction) {
    const bot = c.bot
    const anchor = bot.entity.position.clone()
    const feet = anchor.floored()
    const [dx, dz] = DIRECTIONS[direction]
    let dug = 0
    let foundOre = false
    for (const side of [-1, 1]) {
        for (let depth = 1; depth <= 6; depth++) {
            check(c)
            if (bot.entity.position.distanceTo(anchor) > 0.6) {
                throw new Error('moved away from the side-probe anchor')
            }
            const position = feet.offset(side * dz * depth, 1, -side * dx * depth)
            const block = bot.blockAt(position, false)
            const eye = bot.entity.position.offset(0, bot.entity.eyeHeight || 1.62, 0)
            if (!block || HAZARDS.has(block.name) || eye.distanceTo(position.offset(0.5, 0.5, 0.5)) > 4.5) {
                break
            }
            if (block.boundingBox === 'empty') {
                continue
            }
            if (block.name.endsWith('_ore')) {
                rememberOre(c, position)
                foundOre = true
                break
            }
            if (!['stone', 'deepslate', 'granite', 'diorite', 'andesite', 'tuff', 'calcite', 'netherrack'].includes(block.name) ||
                !block.diggable || !bot.canDigBlock(block) || !bot.canSeeBlock(block)) {
                break
            }
            const neighbors = [[1, 0, 0], [-1, 0, 0], [0, -1, 0], [0, 1, 0], [0, 0, 1], [0, 0, -1]]
                .map(([x, y, z]) => bot.blockAt(position.offset(x, y, z), false))
            if (neighbors.some(b => !b || HAZARDS.has(b.name))) {
                break
            }
            const tool = miningPickaxe(c, block)
            if (!tool) {
                throw new Error('side-probe pickaxe broke')
            }
            await bot.equip(tool, 'hand')
            await bot.lookAt(position.offset(0.5, 0.5, 0.5), true)
            check(c)
            await bot.dig(block, true)
            dug++
            for (const b of neighbors.filter(b => b.name.endsWith('_ore'))) {
                rememberOre(c, b.position)
                foundOre = true
            }
            if (foundOre) {
                break
            }
        }
    }
    c.memory.probeMinedBlocks = (c.memory.probeMinedBlocks || 0) + dug
    c.log.info(`Side probes at ${feet}: mined ${dug} blocks; exposed ore=${foundOre}.`)
    return { dug, foundOre }
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

async function mineTunnel(c, targetY, heading = null) {
    const bot = c.bot
    const tool = miningPickaxe(c)
    if (!tool) {
        throw new Error('mining requires a pickaxe')
    }
    await bot.equip(tool, 'hand')
    const start = bot.entity.position.floored()
    if (targetY < start.y && c.memory.surfaceByStaircase) {
        c.memory.surfaceByStaircase = false
        c.memory.mineRoute = []
    }
    for (let step = 0; step < 4; step++) {
        check(c)
        const feet = bot.entity.position.floored()
        let target = null
        const directionOrder = [0, 1, 2, 3].map(turn => ((c.memory.mineDirection || 0) + turn) % 4)
        if (heading) {
            directionOrder.sort((a, b) =>
                Math.hypot(feet.x + DIRECTIONS[a][0] - heading.x, feet.z + DIRECTIONS[a][1] - heading.z) -
                Math.hypot(feet.x + DIRECTIONS[b][0] - heading.x, feet.z + DIRECTIONS[b][1] - heading.z))
        }
        for (const index of directionOrder) {
            const [dx, dz] = DIRECTIONS[index]
            const candidate = feet.offset(dx, Math.sign(targetY - feet.y), dz)
            const key = candidate.toString()
            if (c.memory.minedCells?.has(key) || c.isBlockedTarget?.({ position: candidate }) || !safeTunnelStep(bot, feet, candidate, Boolean(c.bestItem(['cobblestone', 'cobbled_deepslate', 'dirt'])))) {
                continue
            }
            target = candidate
            c.memory.mineDirection = index
            break
        }
        if (!target) {
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
                const currentTool = miningPickaxe(c, block)
                if (!currentTool) {
                    throw new Error('mining tool broke; rebuild it before continuing')
                }
                await bot.equip(currentTool, 'hand')
                await bot.dig(block, true)
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
        c.memory.minedCells.add(feet.toString())
        if (!c.memory.mineRoute) {
            c.memory.mineRoute = []
        }
        c.memory.mineRoute.push({ x: feet.x, y: feet.y, z: feet.z })
        if (c.memory.minedCells.size > 4096) {
            c.memory.minedCells.delete(c.memory.minedCells.values().next().value)
        }
        if (c.findNearestBlock && findPriorityDiamond(c, 8)) {
            c.log.info('Diamond ore came into view; leaving the tunnel segment to mine it.')
            return
        }
        if (target.y === feet.y && c.probeSpacing > 0) {
            c.memory.probeSteps = (c.memory.probeSteps || 0) + 1
            if (c.memory.probeSteps >= c.probeSpacing) {
                c.memory.probeSteps = 0
                const result = await probeTunnelSides(c, c.memory.mineDirection)
                if (result.foundOre) {
                    return
                }
            }
        }
    }
    c.log.info(`Tunnel: Y ${start.y} -> ${bot.entity.position.y.toFixed(1)}; target Y=${targetY}.`)
}

async function gatherDeep(c, names) {
    const bot = c.bot
    const feet = bot.entity.position.floored()
    const block = c.findNearestBlock(name => names.includes(name), 24, {
        visible: true,
        filter: b => (b.position.x !== feet.x || b.position.z !== feet.z) &&
            ['air', 'cave_air', 'void_air', 'stone', 'deepslate'].includes(bot.blockAt(b.position.offset(0, -1, 0))?.name) &&
            ![new Vec3(1, 0, 0), new Vec3(-1, 0, 0), new Vec3(0, -1, 0), new Vec3(0, 0, 1), new Vec3(0, 0, -1)]
                .some(d => ['lava', 'water'].includes(bot.blockAt(b.position.plus(d))?.name))
    })
    if (block) {
        return c.collectTarget(block, block, block.name)
    }
    const targetY = bot.game.minY < 0 ? -54 : 11
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
    const lava = c.findNearestBlock(name => name === 'lava', 32, {
        filter: b => Number(b.getProperties().level) === 0
    })
    if (!lava) {
        return mineTunnel(c, c.bot.game.minY < 0 ? -54 : 11)
    }
    await c.gotoWithTimeout(new goals.GoalNear(lava.position.x, lava.position.y, lava.position.z, 3), 12000, 'lava approach')
    check(c)
    if (c.bot.entity.position.distanceTo(lava.position.offset(0.5, 0.5, 0.5)) > 4.5) {
        throw new Error('lava source is out of reach from dry ground')
    }
    await c.bot.equip(c.bestItem(['bucket']), 'hand')
    await c.bot.lookAt(lava.position.offset(0.5, 0.5, 0.5), true)
    c.bot.activateItem()
    try {
        await until(c, () => c.hasItem('lava_bucket'), 4000)
    } finally {
        c.bot.deactivateItem()
    }
}

async function smeltCharcoal(c) {
    await c.ensurePlanks(2)
    const block = await c.getFurnace()
    const furnace = await c.bot.openFurnace(block)
    let complete = false
    try {
        if (furnace.outputItem()?.name !== 'charcoal') {
            if (!furnace.inputItem()) {
                const log = furnace.items().find(item => item.name.endsWith('_log'))
                if (!log) {
                    throw new Error('a log is required for charcoal')
                }
                await furnace.putInput(log.type, log.metadata, 1)
            } else if (!furnace.inputItem().name.endsWith('_log')) {
                throw new Error('charcoal furnace contains unrelated input')
            }
            check(c)
            if (!furnace.fuelItem() && (furnace.fuelSeconds || 0) < 11) {
                let remaining = 2
                while (remaining > 0) {
                    const planks = furnace.items().find(item => item.name.endsWith('_planks') && item.count > 0)
                    if (!planks) {
                        throw new Error('two planks are required for charcoal fuel')
                    }
                    const count = Math.min(remaining, planks.count)
                    await furnace.putFuel(planks.type, planks.metadata, count)
                    remaining -= count
                    if (remaining > 0) {
                        await until(c, () => !furnace.fuelItem(), 2500)
                    }
                }
            }
            await until(c, () => furnace.outputItem()?.name === 'charcoal', 16000)
        }
        await furnace.takeOutput()
        complete = true
    } finally {
        if (!complete && !c.actionAbort?.signal.aborted && furnace.inputItem()) {
            await furnace.takeInput().catch(() => {})
        }
        await c.bot.closeWindow(furnace).catch(() => {})
        if (complete) {
            check(c)
            await c.reclaimStation(block)
        }
    }
}

async function fillWaterBucket(c) {
    const water = c.findNearestBlock(name => name === 'water', 48, {
        filter: b => Number(b.getProperties().level) === 0
    })
    if (!water) {
        return c.scout(24)
    }
    await c.gotoWithTimeout(new goals.GoalNear(water.position.x, water.position.y, water.position.z, 3), 12000, 'water approach')
    check(c)
    await c.bot.equip(c.bestItem(['bucket']), 'hand')
    await c.bot.lookAt(water.position.offset(0.5, 0.5, 0.5), true)
    c.bot.activateItem()
    try {
        await until(c, () => c.hasItem('water_bucket'), 4000)
    } finally {
        c.bot.deactivateItem()
    }
}

function safeCastingBasin(bot, basin) {
    for (const [dx, dy, dz] of [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]]) {
        const block = bot.blockAt(basin.offset(dx, dy, dz))
        if (!block || block.boundingBox !== 'block' || HAZARDS.has(block.name)) {
            return false
        }
    }
    for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
            const block = bot.blockAt(basin.offset(dx, 1, dz))
            if (!block || !['air', 'cave_air', 'void_air'].includes(block.name)) {
                return false
            }
        }
    }
    return true
}

async function gatherObsidian(c) {
    const exposed = c.findNearestBlock(name => name === 'obsidian', 24, {
        visible: true,
        filter: block => c.movements.safeToBreak(block) &&
            !DIRECTIONS.some(([dx, dz]) => ['lava', 'water'].includes(c.bot.blockAt(block.position.offset(dx, 0, dz))?.name)) &&
            c.bot.blockAt(block.position.offset(0, -1, 0))?.boundingBox === 'block'
    })
    if (exposed) {
        return c.collectTarget(exposed, exposed, 'obsidian')
    }
    if (!c.hasItem('lava_bucket')) {
        return fillLavaBucket(c)
    }
    const bot = c.bot
    const candidate = c.findWorkstationPlacements(4).find(({ target, distance }) =>
        distance >= 2.5 && safeCastingBasin(bot, target.offset(0, -1, 0)) &&
        bot.canDigBlock(bot.blockAt(target.offset(0, -1, 0))))
    if (!candidate) {
        return c.scout(8)
    }
    const basin = candidate.target.offset(0, -1, 0)
    const bank = basin.offset(1, 0, 0)
    const floor = bot.blockAt(basin.offset(0, -1, 0))
    await bot.tool.equipForBlock(bot.blockAt(basin), { requireHarvest: false, getFromChest: false })
    check(c)
    await bot.dig(bot.blockAt(basin), true)
    check(c)
    await bot.equip(c.bestItem(['lava_bucket']), 'hand')
    await bot.activateBlock(floor, new Vec3(0, 1, 0))
    await until(c, () => bot.blockAt(basin)?.name === 'lava', 4000)
    check(c)
    await bot.equip(c.bestItem(['water_bucket']), 'hand')
    await bot.activateBlock(bot.blockAt(bank), new Vec3(0, 1, 0))
    await until(c, () => bot.blockAt(basin)?.name === 'obsidian', 8000)
    check(c)
    await bot.equip(c.bestItem(['bucket']), 'hand')
    await bot.lookAt(bank.offset(0.5, 1.5, 0.5), true)
    bot.activateItem()
    try {
        await until(c, () => c.hasItem('water_bucket'), 4000)
    } finally {
        bot.deactivateItem()
    }
    await until(c, () => ['air', 'cave_air'].includes(bot.blockAt(basin.offset(0, 1, 0))?.name), 8000)
    check(c)
    const obsidian = bot.blockAt(basin)
    await c.collectTarget(obsidian, obsidian, 'cast obsidian')
}

function portalFrame(origin) {
    // Ten-block frame in the XY plane, with omitted corners and a 2x3 interior.
    return [[1, 0], [2, 0], [0, 1], [0, 2], [0, 3], [3, 1], [3, 2], [3, 3], [1, 4], [2, 4]]
        .map(([x, y]) => origin.offset(x, y, 0))
}

async function placeAt(c, name, target) {
    check(c)
    if (c.bot.blockAt(target)?.name === name) {
        return
    }
    if (!c.isEmptyPlacementBlock(c.bot.blockAt(target))) {
        throw new Error(`build site obstructed at ${target}`)
    }
    await c.gotoWithTimeout(new goals.GoalNear(target.x, Math.min(target.y, c.bot.entity.position.y), target.z, 2), 10000, 'building approach')
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
    let portal = c.findNearestBlock(name => name === 'nether_portal', 32)
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
        await placeAt(c, 'cobblestone', origin)
        await placeAt(c, 'cobblestone', origin.offset(3, 0, 0))
        for (const p of portalFrame(origin).filter(p => p.y < origin.y + 4)) {
            await placeAt(c, 'obsidian', p)
        }
        await placeAt(c, 'cobblestone', origin.offset(0, 4, 0))
        for (const p of portalFrame(origin).filter(p => p.y === origin.y + 4)) {
            await placeAt(c, 'obsidian', p)
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

async function returnSurface(c) {
    const surfaceY = c.home?.y || 64
    if (c.memory.surfaceByStaircase) {
        return mineTunnel(c, surfaceY)
    }
    const route = c.memory.mineRoute || []
    for (let i = 0; i < 6 && route.length; i++) {
        check(c)
        const p = route.at(-1)
        try {
            await c.gotoWithTimeout(new goals.GoalBlock(p.x, p.y, p.z), 8000, 'return staircase')
            if (c.bot.entity.position.distanceTo(new Vec3(p.x + 0.5, p.y, p.z + 0.5)) > 1.2) {
                throw new Error('return waypoint was not reached')
            }
        } catch (error) {
            check(c)
            c.log.warn(`Return route blocked: ${error.message}; carving a new supported staircase.`)
            c.memory.surfaceByStaircase = true
            c.memory.mineRoute = []
            await sleep(100)
            return mineTunnel(c, surfaceY)
        }
        route.pop()
    }
    if (!route.length && c.bot.entity.position.y < surfaceY - 1) {
        c.memory.surfaceByStaircase = true
        return mineTunnel(c, surfaceY)
    }
    if (c.bot.entity.position.y >= surfaceY - 1) {
        c.memory.surfaceByStaircase = false
    }
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
            return block && !HAZARDS.has(block.name) && (block.boundingBox === 'empty' || (block.diggable && bot.canDigBlock?.(block) !== false)) &&
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
        const tool = miningPickaxe(c, block)
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
    const surplus = discardableStacks(bot.inventory.items())
    if (!surplus.length) {
        c.paused = true
        c.memory.paused = true
        bot.chat('Inventory full of useful items. Please make room, then use !resume.')
        return
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

async function performProgression(c, action, state) {
    switch (action) {
        case 'clear_inventory': return clearInventory(c)
        case 'smelt_charcoal': return smeltCharcoal(c)
        case 'craft_progression': {
            const goal = state.sideGoal || nextAdvancement(state)
            return craftProgression(c, goal.item)
        }
        case 'equip_armor':
            return c.bot.equip(c.bestItem(['netherite_chestplate', 'diamond_chestplate', 'iron_chestplate']), 'torso')
        case 'equip_shield':
            return c.bot.equip(c.bestItem(['shield']), 'off-hand')
        case 'fill_lava_bucket': return fillLavaBucket(c)
        case 'fill_water_bucket': return fillWaterBucket(c)
        case 'mine_diamond': {
            const block = findPriorityDiamond(c)
            if (!block) {
                return
            }
            c.log.info(`Priority diamond: ${block.name} at ${block.position}.`)
            return c.collectTarget(block, block, 'priority diamond')
        }
        case 'gather_diamonds': return gatherDeep(c, ['diamond_ore', 'deepslate_diamond_ore'])
        case 'gather_redstone': return gatherDeep(c, ['redstone_ore', 'deepslate_redstone_ore'])
        case 'gather_obsidian': return gatherObsidian(c)
        case 'gather_flint': return c.gatherOre(['gravel'], 24)
        case 'enter_nether': return enterNether(c)
        case 'build_redstone': return buildRedstone(c)
        case 'return_surface': return returnSurface(c)
        case 'wait': return sleep(2000)
        default: throw new Error(`unknown progression action: ${action}`)
    }
}

module.exports = { performProgression, safeTunnelStep, portalFrame, redstonePlan, until, mineTunnel, safeCastingBasin, probeTunnelSides, miningPickaxe, climbStep }
