'use strict'

const { Vec3 } = require('vec3')
const { Movements, goals } = require('mineflayer-pathfinder')
const { inView, sightRay } = require('./vision')
const { ironStock, ironReserveCap } = require('./advancement-plan')

const RAILS = new Set(['rail', 'powered_rail', 'detector_rail', 'activator_rail'])
const AIR = new Set(['air', 'cave_air', 'void_air', 'torch', 'wall_torch', ...RAILS])
const FLUIDS = new Set(['water', 'lava', 'bubble_column'])
const FALLING = new Set(['sand', 'red_sand', 'gravel', 'suspicious_sand', 'suspicious_gravel', 'pointed_dripstone'])
const DANGER = new Set(['lava', 'water', 'fire', 'soul_fire', 'magma_block', 'campfire',
    'soul_campfire', 'cactus', 'powder_snow', 'pointed_dripstone', 'sculk_shrieker', 'sculk_sensor', 'spawner', 'trial_spawner'])
const SURVEY_STEPS = 48
const SURVEY_MS = 120000
const SURVEY_LEG_STEPS = 8
const TORCH_SPACING = 10
const ROCK = new Set(['stone', 'deepslate', 'granite', 'diorite', 'andesite', 'tuff', 'calcite', 'dripstone_block'])
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]]
const ORES = [
    { ore: 'diamond', items: ['diamond'], cap: 5, use: 'diamond tools and enchanting table' },
    { ore: 'iron', cap: null, use: 'missing gear, buckets and spare picks' },
    { ore: 'coal', items: ['coal', 'charcoal'], cap: 32, use: 'fuel and cave lighting' },
    { ore: 'gold', items: ['raw_gold', 'gold_ingot'], cap: 8, use: 'Nether protection and bartering' },
    { ore: 'lapis', items: ['lapis_lazuli'], cap: 8, use: 'enchanting' },
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

function minedPassage(c, p) {
    const dimension = c.bot.game.dimension
    return c.memory.minedCells?.has(`${dimension}:${p}`) ||
        (dimension === 'overworld' && c.memory.minedCells?.has(p.toString())) ||
        c.memory.excavatedCells?.has(`${dimension}:${p}`) ||
        c.memory.excavatedCells?.has(`${dimension}:${p.offset(0, 1, 0)}`)
}

function findCaveRoute(bot, visits, targetY, blocked = () => false) {
    const start = bot.entity.position.floored()
    const stack = [{ p: start, path: [] }]
    const seen = new Set()
    const visited = p => visits.has(`${bot.game.dimension}:${p}`)
    const depthCost = p => Math.abs(p.y - targetY)
    let best = null
    let junctions = 0
    let naturalPassage = false
    while (stack.length && seen.size < 160) {
        const node = stack.pop()
        if (seen.has(node.p.toString())) {
            continue
        }
        seen.add(node.p.toString())
        const neighbors = []
        for (const [dx, dz] of DIRECTIONS) {
            for (const dy of [0, -1, 1]) {
                const p = node.p.offset(dx, dy, dz)
                if (Math.abs(p.y - start.y) > 12 || Math.hypot(p.x - start.x, p.z - start.z) > 12 ||
                    blocked({ position: p }) || !safeFooting(bot, p) || (dy !== 0 && !AIR.has(bot.blockAt((dy > 0 ? node.p : p).offset(0, 2, 0), false)?.name))) {
                    continue
                }
                neighbors.push(p)
                break
            }
        }
        const feet = bot.blockAt(node.p, false)?.name
        const shaft = RAILS.has(feet)
        const roof = caveRoof(bot, node.p)
        naturalPassage ||= shaft || (roof && feet === 'cave_air')
        if (roof && neighbors.length >= 3) {
            junctions++
        }
        if ((roof || shaft) && node.path.length && !visited(node.p)) {
            const score = -3 * depthCost(node.p) + 0.9 * node.path.length
            if (!best || score > best.score) {
                best = { path: node.path, score }
            }
        }
        if (node.path.length < SURVEY_LEG_STEPS) {
            neighbors.sort((a, b) => Number(visited(b)) - Number(visited(a)) || depthCost(b) - depthCost(a))
            for (const p of neighbors) {
                if (!seen.has(p.toString())) {
                    stack.push({ p, path: [...node.path, p] })
                }
            }
        }
    }
    return best && (naturalPassage || junctions >= 4) ? best.path : []
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
        const cap = resource.cap ?? state.ironCap ?? ironReserveCap(state)
        const stock = resource.ore === 'iron' ? ironStock(state) : c.countItems(resource.items)
        if (names.some(name => excluded.includes(name)) || stock >= cap) {
            continue
        }
        const block = c.findNearestBlock(name => names.includes(name), 6, {
            sight: b => miningSight(c, b, 6),
            filter: b => (b.position.x !== feet.x || b.position.z !== feet.z) &&
                !visibleMiningHazard(c.bot, b.position) && c.bot.inventory.items().some(item => item.name.endsWith('_pickaxe') && b.canHarvest(item.type))
        })
        if (block) {
            c.log.info(`Opportunity: ${block.name} at ${block.position}; reserve for ${resource.use} (cap=${cap}).`)
            await c.collectTarget(block, block, 'opportunistic ore')
            return true
        }
    }
    return false
}

const DIAMOND_ORES = ['diamond_ore', 'deepslate_diamond_ore']
const IRON_ORES = ['iron_ore', 'deepslate_iron_ore']
const FACES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
const ORE_NEIGHBORS = [[0, 0, 0], ...FACES]
const OPEN_AIR = new Set(['air', 'cave_air', 'void_air'])
const MAX_MINED_OPENINGS = 128

function visibleMiningHazard(bot, position) {
    const eye = bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0)
    for (const [x, y, z] of ORE_NEIGHBORS) {
        const block = bot.blockAt(position.offset(x, y, z), false)
        if (!block || !(FLUIDS.has(block.name) || block.getProperties?.().waterlogged ||
            (y > 0 && (FALLING.has(block.name) || block.name.endsWith('_concrete_powder'))))) {
            continue
        }
        const delta = block.position.offset(0.5, 0.5, 0.5).minus(eye)
        const distance = delta.norm()
        const hit = sightRay(bot, eye, delta.normalize(), distance + 0.01, block.position)
        if ((hit?.position ?? hit?.intersect?.floored())?.equals(block.position)) {
            return block
        }
    }
    return null
}

function rememberMiningExposure(c, block) {
    const bot = c.bot
    const p = block.position
    if (OPEN_AIR.has(block.name) || !OPEN_AIR.has(bot.blockAt(p, false)?.name)) {
        return
    }
    const openings = c.minedOpenings ??= new Map()
    const key = `${bot.game.dimension}:${p}`
    const excavated = c.memory.excavatedCells ??= new Set()
    excavated.add(key)
    if (excavated.size > 4096) {
        excavated.delete(excavated.values().next().value)
    }
    openings.delete(key)
    openings.set(key, FACES.map(([x, y, z]) => bot.blockAt(p.offset(x, y, z), false)?.name))
    if (openings.size > MAX_MINED_OPENINGS) {
        openings.delete(openings.keys().next().value)
    }
}

function exposedByDig(c, block) {
    return Boolean(c.minedOpenings?.size) && FACES.some(([x, y, z], face) => {
        const p = block.position.offset(-x, -y, -z)
        return c.minedOpenings.get(`${c.bot.game.dimension}:${p}`)?.[face] === block.name &&
            OPEN_AIR.has(c.bot.blockAt(p, false)?.name)
    })
}

// Glow lichen, vines and moss carpet cover cave ore faces without hiding them; a user saw iron
// behind lichen that the bot skipped (17:23Z). Liquids stay opaque here.
function seeThrough(block) {
    return Boolean(block) && (AIR.has(block.name) || block.name.endsWith('_leaves') ||
        (block.boundingBox === 'empty' && !['water', 'lava', 'bubble_column'].includes(block.name)))
}

// Mineflayer's canSeeBlock aims only at the block centre; ore exposed on one face beside a
// probe hole fails it although a player sees that face. Ray-cast to each air-exposed face.
function oreSight(bot, block, range = 16, allowTurn = false) {
    const eye = bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0)
    for (const [x, y, z] of FACES) {
        if (!seeThrough(bot.blockAt(block.position.offset(x, y, z), false))) {
            continue
        }
        for (const u of [0.5, 0.2, 0.8]) {
            for (const v of [0.5, 0.2, 0.8]) {
                const point = block.position.offset(x ? 0.5 + 0.49 * x : u,
                    y ? 0.5 + 0.49 * y : x ? u : v, z ? 0.5 + 0.49 * z : v)
                const distance = eye.distanceTo(point)
                if (distance > range || (!allowTurn && !inView(bot, eye, point))) {
                    continue
                }
                const dir = point.minus(eye).scaled(1 / distance)
                const hit = sightRay(bot, eye, dir, distance + 0.1)
                if (hit?.intersect && hit.intersect.plus(dir.scaled(1e-3)).floored().equals(block.position)) {
                    return point
                }
            }
        }
    }
    return null
}

function oreSeen(bot, block, range) {
    return Boolean(oreSight(bot, block, range))
}

function miningSight(c, block, range, allowTurn = false) {
    return oreSight(c.bot, block, range, allowTurn || exposedByDig(c, block))
}

function exposedDiamond(c, opened) {
    const bot = c.bot
    return AIR.has(bot.blockAt(opened, false)?.name) && FACES.some(([dx, dy, dz]) => {
        const block = bot.blockAt(opened.offset(dx, dy, dz), false)
        return DIAMOND_ORES.includes(block?.name) && miningSight(c, block)
    })
}

// Prioritize exposed ore unless a nearby hazard is visible or the ore is directly underfoot.
// An ore face our own dig opened is known even when the opening is out of sight from here
// (live 01:54Z: vein faces in a diagonal pit behind stone); collectTarget walks to a view first.
function knownExposure(c, block) {
    const eye = c.bot.entity.position.offset(0, c.bot.entity.eyeHeight ?? 1.62, 0)
    return eye.distanceTo(block.position.offset(0.5, 0.5, 0.5)) <= 6 && exposedByDig(c, block)
}

function findPriorityOre(c, ores, range = 16) {
    const bot = c.bot
    const feet = bot.entity.position.floored()
    return c.findNearestBlock(name => ores.includes(name), range, {
        sight: b => Boolean(miningSight(c, b, range)) || knownExposure(c, b),
        filter: b => !(b.position.x === feet.x && b.position.z === feet.z && b.position.y < feet.y) &&
            !visibleMiningHazard(bot, b.position) &&
            bot.inventory.items().some(item => item.name.endsWith('_pickaxe') && b.canHarvest(item.type))
    })
}

function findPriorityDiamond(c, range = 16) {
    return findPriorityOre(c, DIAMOND_ORES, range)
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

async function exploreCave(c, targetY, canEnter = () => true) {
    const bot = c.bot
    const signal = c.actionAbort?.signal
    check(c, signal)
    const state = c.observe()
    if (state.dimension !== 'overworld' || state.health < 16 || state.food < 18 || state.foodUnits < 8 ||
        !state.armorEquipped || !state.shieldEquipped || state.hostileDistance <= 12 || bot.inventory.emptySlotCount() <= 1) {
        return false
    }
    if (!(c.memory.caveVisits instanceof Map)) {
        c.memory.caveVisits = new Map()
    }
    const budget = c.memory.caveSurvey
    if (budget?.dimension === state.dimension && Date.now() - budget.startedAt < SURVEY_MS && budget.steps >= SURVEY_STEPS) {
        return false
    }
    const route = findCaveRoute(bot, c.memory.caveVisits, targetY,
        b => !canEnter(b.position) || c.isBlockedTarget(b) || minedPassage(c, b.position))
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
    if (!budget || budget.dimension !== state.dimension || Date.now() - budget.startedAt >= SURVEY_MS) {
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
            if (current.lootTarget || current.diamondInView || current.ironInView) {
                return true
            }
            if (c.memory.caveSurvey.steps >= SURVEY_STEPS || Date.now() - c.memory.caveSurvey.startedAt >= SURVEY_MS ||
                current.health < 16 || current.food < 18 || current.hostileDistance <= 12 || current.visibleHostiles >= 2 ||
                bot.inventory.emptySlotCount() <= 1 || !canEnter(p) || !safeFooting(bot, p)) {
                break
            }
            const feet = bot.entity.position.floored()
            const key = `${bot.game.dimension}:${feet}`
            c.memory.caveVisits.set(key, Date.now())
            if (c.memory.caveVisits.size > 2048) {
                c.memory.caveVisits.delete(c.memory.caveVisits.keys().next().value)
            }
            const light = bot.blockAt(feet)
            const onRail = RAILS.has(light?.name)
            const torchCell = onRail ? feet.offset(0, 1, 0) : feet
            const lit = light?.skyLight >= 12 || light?.light >= 8 || bot.findBlock({
                point: torchCell,
                matching: ['torch', 'wall_torch'].map(name => bot.registry.blocksByName[name].id),
                maxDistance: TORCH_SPACING,
                useExtraInfo: block => block.position.distanceTo(torchCell) < TORCH_SPACING
            })
            if (c.countItems(['torch']) > 0 && !lit) {
                const support = onRail ? DIRECTIONS.map(([dx, dz]) => bot.blockAt(torchCell.offset(dx, 0, dz)))
                    .find(block => block?.boundingBox === 'block' && !DANGER.has(block.name)) : bot.blockAt(feet.offset(0, -1, 0))
                if (!support) {
                    break
                }
                await bot.equip(c.bestItem(['torch']), 'hand')
                check(c, signal)
                await bot.placeBlock(support, torchCell.minus(support.position))
                await bot.waitForTicks(4)
                check(c, signal)
                if (!['torch', 'wall_torch'].includes(bot.blockAt(torchCell)?.name)) {
                    throw new Error('cave torch placement was not confirmed')
                }
                c.log.info(`Placed cave torch at ${torchCell}; light=${light?.light}, minimum spacing=${TORCH_SPACING} blocks.`)
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
            if (!bot.entity.position.floored().equals(p)) {
                throw new Error('cave waypoint was not reached')
            }
            c.memory.caveSurvey.steps++
            c.memory.caveVisits.set(`${bot.game.dimension}:${p}`, Date.now())
            if (c.memory.mineRoute.at(-2) && p.equals(c.memory.mineRoute.at(-2))) {
                c.memory.mineRoute.splice(-2)
            }
            moved = true
        }
    } finally {
        bot.pathfinder.setGoal(null)
        bot.pathfinder.setMovements(previous)
    }
    return moved
}

module.exports = { safeFooting, findCaveRoute, exploreCave, collectOpportunity, dryMovements, oreSeen, miningSight, minedPassage, visibleMiningHazard,
    rememberMiningExposure, exposedByDig, exposedDiamond, findPriorityDiamond, findPriorityOre, IRON_ORES }
