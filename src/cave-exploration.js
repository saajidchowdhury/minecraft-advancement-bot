'use strict'

const { Vec3 } = require('vec3')
const { Movements, goals } = require('mineflayer-pathfinder')

const AIR = new Set(['air', 'cave_air', 'void_air', 'torch', 'wall_torch'])
const DANGER = new Set(['lava', 'water', 'fire', 'soul_fire', 'magma_block', 'campfire',
    'soul_campfire', 'cactus', 'powder_snow', 'pointed_dripstone', 'sculk_shrieker', 'sculk_sensor'])
const ROCK = new Set(['stone', 'deepslate', 'granite', 'diorite', 'andesite', 'tuff', 'calcite', 'dripstone_block'])
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]]
const ORES = [
    { ore: 'diamond', items: ['diamond'], cap: 5, use: 'diamond tools and enchanting table' },
    { ore: 'iron', items: ['raw_iron', 'iron_ingot'], cap: 24, use: 'equipment and spare buckets' },
    { ore: 'coal', items: ['coal', 'charcoal'], cap: 16, use: 'fuel and cave lighting' },
    { ore: 'gold', items: ['raw_gold', 'gold_ingot'], cap: 8, use: 'Nether protection and bartering' },
    { ore: 'copper', items: ['raw_copper', 'copper_ingot'], cap: 4, use: 'spyglass preparation' },
    { ore: 'lapis', items: ['lapis_lazuli'], cap: 12, use: 'enchanting' },
    { ore: 'redstone', items: ['redstone'], cap: 16, use: 'later redstone builds' }
]

function check(c, signal) {
    if (signal?.aborted || !c.running || c.paused || c.bot.health <= 0) {
        throw new Error('cave action cancelled')
    }
}

function safeFooting(bot, p, clearNames = AIR) {
    const floor = bot.blockAt(p.offset(0, -1, 0), false)
    if (!floor || floor.boundingBox !== 'block' || DANGER.has(floor.name)) {
        return false
    }
    for (const dy of [0, 1]) {
        if (!clearNames.has(bot.blockAt(p.offset(0, dy, 0), false)?.name)) {
            return false
        }
        for (const [dx, dz] of DIRECTIONS) {
            const block = bot.blockAt(p.offset(dx, dy, dz), false)
            if (!block || DANGER.has(block.name)) {
                return false
            }
        }
    }
    return true
}

function caveRoof(bot, p) {
    for (let y = 2; y <= 64; y++) {
        const block = bot.blockAt(p.offset(0, y, 0), false)
        if (!block) {
            return false
        }
        if (block.boundingBox === 'block') {
            return ROCK.has(block.name) || block.name.endsWith('_ore')
        }
    }
    return bot.blockAt(p, false)?.name === 'cave_air'
}

function findCaveRoute(bot, visits, targetY, now = Date.now(), blocked = () => false) {
    const start = bot.entity.position.floored()
    const queue = [{ p: start, path: [] }]
    const seen = new Set([start.toString()])
    const candidates = []
    let junctions = 0
    for (let i = 0; i < queue.length && i < 160; i++) {
        const node = queue[i]
        let exits = 0
        for (const [dx, dz] of DIRECTIONS) {
            for (const dy of [0, -1, 1]) {
                const p = node.p.offset(dx, dy, dz)
                if (Math.abs(p.y - start.y) > 6 || Math.hypot(p.x - start.x, p.z - start.z) > 12 ||
                    blocked({ position: p }) || !safeFooting(bot, p) || (dy !== 0 && !AIR.has(bot.blockAt((dy > 0 ? node.p : p).offset(0, 2, 0), false)?.name))) {
                    continue
                }
                exits++
                if (!seen.has(p.toString()) && queue.length < 160) {
                    seen.add(p.toString())
                    queue.push({ p, path: [...node.path, p] })
                }
                break
            }
        }
        if (caveRoof(bot, node.p)) {
            if (exits >= 3) {
                junctions++
            }
            const key = `${bot.game.dimension}:${node.p}`
            if (node.path.length > 0 && now - (visits.get(key) ?? -Infinity) >= 15 * 60 * 1000) {
                const score = exits * 2 + Math.min(node.path.length, 6) - Math.abs(node.p.y - targetY) * 0.75
                candidates.push({ ...node, score })
            }
        }
    }
    if (junctions < 4 || candidates.length === 0) {
        return []
    }
    candidates.sort((a, b) => b.score - a.score)
    return candidates[0].path.slice(0, 6)
}

async function collectOpportunity(c, excluded = []) {
    const state = c.observe()
    if (state.dimension !== 'overworld' || state.health < 16 || state.food <= 16 ||
        state.hostileDistance <= 12 || c.bot.inventory.emptySlotCount() <= 4) {
        return false
    }
    const feet = c.bot.entity.position.floored()
    for (const resource of ORES) {
        const names = [`${resource.ore}_ore`, `deepslate_${resource.ore}_ore`]
        if (names.some(name => excluded.includes(name)) || c.countItems(resource.items) >= resource.cap) {
            continue
        }
        const block = c.findNearestBlock(name => names.includes(name), 6, {
            visible: true,
            filter: b => (b.position.x !== feet.x || b.position.z !== feet.z) &&
                c.movements.safeToBreak(b) && c.bot.inventory.items().some(item => item.name.endsWith('_pickaxe') && b.canHarvest(item.type))
        })
        if (block) {
            c.log.info(`Opportunity: ${block.name} at ${block.position}; reserve for ${resource.use} (cap=${resource.cap}).`)
            await c.collectTarget(block, block, 'opportunistic ore')
            return true
        }
    }
    return false
}

const DIAMOND_ORES = ['diamond_ore', 'deepslate_diamond_ore']
const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]

// Mineflayer's canSeeBlock aims only at the block centre; ore exposed on one face beside a
// probe hole fails it although a player sees that face. Ray-cast to each air-exposed face.
function oreSeen(bot, block, range = 16) {
    const eye = bot.entity.position.offset(0, 1.62, 0)
    return FACES.some(([x, y, z]) => {
        if (!AIR.has(bot.blockAt(block.position.offset(x, y, z), false)?.name)) {
            return false
        }
        const face = block.position.offset(0.5 + 0.49 * x, 0.5 + 0.49 * y, 0.5 + 0.49 * z)
        const distance = eye.distanceTo(face)
        const hit = distance <= range && bot.world.raycast(eye, face.minus(eye).scaled(1 / distance), distance + 0.1)
        return Boolean(hit?.position.equals(block.position))
    })
}

function rememberOre(c, position) {
    const bot = c.bot
    const block = bot.blockAt(position, false)
    if (!block?.name.endsWith('_ore')) {
        return
    }
    c.memory.knownOres = (c.memory.knownOres || []).filter(o => Date.now() - o.at < 600000 && !position.equals(new Vec3(o.x, o.y, o.z))).slice(-63)
    c.memory.knownOres.push({ x: position.x, y: position.y, z: position.z, dimension: bot.game?.dimension, at: Date.now() })
}

function knownOre(c, block) {
    return (c.memory.knownOres || []).some(o => o.dimension === c.bot.game?.dimension && Date.now() - o.at < 600000 &&
        block.position.equals(new Vec3(o.x, o.y, o.z)))
}

// Diamonds outrank routine work once seen or exposed by a probe, unless mining them could
// release liquid or remove the bot's own support.
function findPriorityDiamond(c, range = 16) {
    const bot = c.bot
    const feet = bot.entity.position.floored()
    return c.findNearestBlock(name => DIAMOND_ORES.includes(name), range, {
        filter: b => !(b.position.x === feet.x && b.position.z === feet.z && b.position.y < feet.y) &&
            FACES.every(([x, y, z]) => !['water', 'lava', 'bubble_column'].includes(bot.blockAt(b.position.offset(x, y, z), false)?.name ?? 'water')) &&
            bot.inventory.items().some(item => item.name.endsWith('_pickaxe') && b.canHarvest(item.type)) &&
            (knownOre(c, b) || oreSeen(bot, b, range))
    })
}

function dryMovements(bot) {
    const walking = new Movements(bot)
    walking.canDig = false
    walking.allow1by1towers = false
    walking.allowParkour = false
    walking.maxDropDown = 2
    walking.scafoldingBlocks = []
    walking.allowFreeMotion = false
    walking.infiniteLiquidDropdownDistance = false
    for (const name of DANGER) {
        if (bot.registry.blocksByName[name]) {
            walking.blocksToAvoid.add(bot.registry.blocksByName[name].id)
        }
    }
    return walking
}

async function exploreCave(c, targetY) {
    const bot = c.bot
    const signal = c.actionAbort?.signal
    check(c, signal)
    const state = c.observe()
    if (state.dimension !== 'overworld' || state.health < 16 || state.food < 18 || state.foodUnits < 8 ||
        !state.armorEquipped || !state.shieldEquipped || state.hostileDistance <= 12 || bot.inventory.emptySlotCount() <= 4) {
        return false
    }
    if (!(c.memory.caveVisits instanceof Map)) {
        c.memory.caveVisits = new Map()
    }
    const budget = c.memory.caveSurvey
    if (budget?.dimension === state.dimension && Date.now() - budget.startedAt < 120000 && budget.steps >= 24) {
        return false
    }
    const route = findCaveRoute(bot, c.memory.caveVisits, targetY, Date.now(), b => c.isBlockedTarget(b))
    if (route.length === 0) {
        return false
    }
    if (c.countItems(['torch']) < 4) {
        if (c.countItems(['coal', 'charcoal']) === 0 || state.planks + state.logs * 4 < 2) {
            return false
        }
        await c.ensurePlanks(2)
        check(c, signal)
        await c.ensureItem('stick', 4, false)
        check(c, signal)
        await c.ensureItem('torch', 4, false)
        check(c, signal)
    }
    const walking = dryMovements(bot)
    if (!budget || budget.dimension !== state.dimension || Date.now() - budget.startedAt >= 120000) {
        c.memory.caveSurvey = { dimension: state.dimension, startedAt: Date.now(), steps: 0 }
    }
    const previous = c.movements
    c.log.info(`Cave survey: ${route.length} supported steps toward Y=${targetY}; digging and bridging disabled.`)
    bot.pathfinder.setMovements(walking)
    let moved = false
    try {
        for (const p of route) {
            check(c, signal)
            const current = c.observe()
            if (c.memory.caveSurvey.steps >= 24 || current.health < 16 || current.food < 18 || current.hostileDistance <= 12 || !safeFooting(bot, p)) {
                break
            }
            const feet = bot.entity.position.floored()
            const key = `${bot.game.dimension}:${feet}`
            c.memory.caveVisits.set(key, Date.now())
            if (c.memory.caveVisits.size > 2048) {
                c.memory.caveVisits.delete(c.memory.caveVisits.keys().next().value)
            }
            // Torch light 14 falls by one per block; one per ~7 cells keeps survey floors lit.
            const lit = bot.blockAt(feet)?.skyLight >= 12 || c.findNearestBlock?.(name => name === 'torch' || name === 'wall_torch', 6)
            if (c.countItems(['torch']) > 0 && !lit) {
                await bot.equip(c.bestItem(['torch']), 'hand')
                check(c, signal)
                await bot.placeBlock(bot.blockAt(feet.offset(0, -1, 0)), new Vec3(0, 1, 0))
                await bot.waitForTicks(4)
                check(c, signal)
                if (bot.blockAt(feet)?.name !== 'torch') {
                    throw new Error('cave torch placement was not confirmed')
                }
            }
            check(c, signal)
            if (!c.memory.mineRoute) {
                c.memory.mineRoute = []
            }
            c.memory.mineRoute.push({ x: feet.x, y: feet.y, z: feet.z })
            try {
                await c.gotoWithTimeout(new goals.GoalBlock(p.x, p.y, p.z), 3000, 'cave step')
            } catch (error) {
                c.rememberBlockedTarget({ position: p }, 'cave step', error)
                throw error
            }
            check(c, signal)
            if (bot.entity.position.distanceTo(p.offset(0.5, 0, 0.5)) > 1) {
                throw new Error('cave waypoint was not reached')
            }
            c.memory.caveSurvey.steps++
            c.memory.caveVisits.set(`${bot.game.dimension}:${p}`, Date.now())
            moved = true
        }
    } finally {
        bot.pathfinder.setGoal(null)
        bot.pathfinder.setMovements(previous)
    }
    return moved
}

module.exports = { safeFooting, findCaveRoute, exploreCave, collectOpportunity, dryMovements, oreSeen, rememberOre, findPriorityDiamond }
