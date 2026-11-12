'use strict'

const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { dryMovements, safeFooting } = require('./cave-exploration')
const { miningPickaxe, mineTunnel } = require('./progression-skills')
const { towerStep, descendPillar } = require('./tree-climb')

const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]]
const UNSAFE = new Set(['water', 'lava', 'sand', 'red_sand', 'gravel', 'magma_block',
    'bedrock', 'chest', 'barrel', 'furnace', 'spawner', 'trial_spawner', 'infested_stone', 'infested_deepslate'])

function observedThreats(c, names) {
    return Object.values(c.bot.entities || {}).filter(e => e.isValid && names.has(e.name) &&
        e.position.distanceTo(c.bot.entity.position) <= 16 && c.canSee(e, true))
}

function updateCrowdRetreat(c, names) {
    const dimension = c.bot.game?.dimension
    if (c.crowdRetreat?.dimension !== dimension) {
        c.crowdRetreat = null
    }
    const seen = observedThreats(c, names)
    if (!c.crowdRetreat && seen.length >= 3) {
        c.crowdRetreat = { dimension, threats: new Map() }
    }
    // A latched retreat ends after 10 s with no hostile within 24 blocks (round 6: a stale latch sent a
    // later hallway fight into the wall-refuge routine); briefly losing track keeps the latch.
    const tracked = Object.values(c.bot.entities || {}).some(e => e.isValid && names.has(e.name) &&
        e.position.distanceTo(c.bot.entity.position) <= 24)
    if (c.crowdRetreat && (tracked || c.crowdRetreat.trackedAt === undefined)) {
        c.crowdRetreat.trackedAt = Date.now()
    } else if (c.crowdRetreat && Date.now() - c.crowdRetreat.trackedAt > 10000) {
        c.crowdRetreat = null
    }
    if (c.crowdRetreat) {
        for (const e of seen) {
            c.crowdRetreat.threats.set(e.id, e.position.clone())
        }
        while (c.crowdRetreat.threats.size > 64) {
            c.crowdRetreat.threats.delete(c.crowdRetreat.threats.keys().next().value)
        }
    }
    return Boolean(c.crowdRetreat)
}

function solid(bot, p) {
    const b = bot.blockAt(p, false)
    return b?.boundingBox === 'block' && !UNSAFE.has(b.name) &&
        b.shapes.some(s => s.length === 6 && s.every((x, i) => x === (i < 3 ? 0 : 1)))
}

function sealedRefuge(c, refuge) {
    const center = new Vec3(refuge.x, refuge.y, refuge.z)
    return refuge.dimension === c.bot.game.dimension && safeFooting(c.bot, center) &&
        solid(c.bot, center.offset(0, 2, 0)) && DIRECTIONS.every(([dx, dz]) =>
            [0, 1].every(dy => solid(c.bot, center.offset(dx, dy, dz))))
}

function retreatRoute(c, rejected) {
    const bot = c.bot
    const start = bot.entity.position.floored()
    const threats = [...c.crowdRetreat.threats.values()]
    const clearance = p => Math.min(...threats.map(t => p.offset(0.5, 0, 0.5).distanceTo(t)))
    const initial = clearance(start)
    const queue = [{ p: start, path: [] }]
    const seen = new Set([start.toString()])
    let flee = null
    const refuges = []
    for (let i = 0; i < queue.length && i < 1600; i++) {
        const { p, path } = queue[i]
        const distance = clearance(p)
        if (path.length && (!flee || distance > flee.distance)) {
            flee = { path, distance }
        }
        if (distance >= 12 && ((!c.crowdRetreat.retry && initial >= 12) || path.length >= 10) && !rejected.has(p.toString())) {
            for (const [direction, [dx, dz]] of DIRECTIONS.entries()) {
                const center = p.offset(dx, 0, dz)
                const cells = [center, center.offset(0, 1, 0)]
                if (!cells.every(q => solid(bot, q) && bot.blockAt(q, false).diggable &&
                    (bot.blockAt(q, false).material !== 'mineable/pickaxe' || miningPickaxe(c, bot.blockAt(q, false))))) {
                    continue
                }
                if (!solid(bot, center.offset(0, -1, 0)) || !solid(bot, center.offset(0, 2, 0)) ||
                    DIRECTIONS.some(([x, z]) => (x !== -dx || z !== -dz) &&
                        [0, 1].some(y => !solid(bot, center.offset(x, y, z))))) {
                    continue
                }
                refuges.push({ path, center, entrance: p, direction, score: distance - path.length * 0.2 })
            }
        }
        if (path.length >= 24) {
            continue
        }
        for (const [dx, dz] of DIRECTIONS) {
            for (const dy of [0, -1, 1]) {
                const next = p.offset(dx, dy, dz)
                if (seen.has(next.toString()) || clearance(next) < Math.min(initial, 5) || !safeFooting(bot, next) ||
                    (dy !== 0 && bot.blockAt((dy > 0 ? p : next).offset(0, 2, 0), false)?.boundingBox !== 'empty')) {
                    continue
                }
                seen.add(next.toString())
                queue.push({ p: next, path: [...path, next] })
            }
        }
    }
    return refuges.sort((a, b) => b.score - a.score)[0] || flee
}

async function retreatToWall(c) {
    const bot = c.bot
    const previous = c.movements
    const rejected = new Set()
    const deadline = Date.now() + 25000
    bot.pathfinder.setGoal(null)
    bot.clearControlStates()
    bot.pathfinder.setMovements(dryMovements(bot))
    const nearby = () => observedThreats(c, c.hostileNames).some(e => e.position.distanceTo(bot.entity.position) < 8)
    try {
        for (let attempt = 0; attempt < 3 && Date.now() < deadline; attempt++) {
            c.checkAction()
            updateCrowdRetreat(c, c.hostileNames)
            const route = retreatRoute(c, rejected)
            if (!route) {
                throw new Error('crowd retreat has no supported walking route; refusing to bridge')
            }
            c.log.info(`Crowd retreat: ${route.path.length} supported steps${route.center ? ` to wall refuge ${route.center}` : ' away from the mob group'}; no bridging.`)
            for (const p of route.path) {
                c.checkAction()
                if (Date.now() >= deadline || !safeFooting(bot, p)) {
                    return
                }
                await c.gotoWithTimeout(new goals.GoalBlock(p.x, p.y, p.z), 2000, 'crowd retreat step')
                c.checkAction()
                if (!bot.entity.position.floored().equals(p)) {
                    throw new Error('crowd retreat waypoint was not reached')
                }
                updateCrowdRetreat(c, c.hostileNames)
            }
            if (!route.center || nearby()) {
                if (route.entrance) { rejected.add(route.entrance.toString()) }
                continue
            }
            const { center, entrance, direction } = route
            rejected.add(entrance.toString())
            try {
                for (const dy of [1, 0]) {
                    c.checkAction()
                    if (nearby()) { throw new Error('mobs caught up before the refuge was dug') }
                    const b = bot.blockAt(center.offset(0, dy, 0), false)
                    if (!solid(bot, b.position) || !bot.canDigBlock(b)) { throw new Error('refuge wall changed') }
                    await bot.lookAt(b.position.offset(0.5, 0.5, 0.5), true)
                    await bot.tool.equipForBlock(b, { requireHarvest: false, getFromChest: false })
                    c.checkAction()
                    await bot.dig(b, true)
                    c.checkAction()
                }
                if (nearby() || !safeFooting(bot, center)) { throw new Error('refuge entrance is unsafe') }
                await c.gotoWithTimeout(new goals.GoalBlock(center.x, center.y, center.z), 2000, 'enter wall refuge')
                c.checkAction()
                if (!bot.entity.position.floored().equals(center)) { throw new Error('wall refuge was not entered') }
                await bot.lookAt(entrance.offset(0.5, 1.5, 0.5), true)
                for (const dy of [1, 0]) {
                    c.checkAction()
                    if (nearby()) { throw new Error('mobs prevent sealing the refuge; retreating again') }
                    await c.placeSurvivalBlock(entrance.offset(0, dy, 0))
                    await bot.waitForTicks(2)
                    c.checkAction()
                    if (!solid(bot, entrance.offset(0, dy, 0))) { throw new Error('refuge seal was not confirmed') }
                }
                const refuge = { x: center.x, y: center.y, z: center.z, dimension: bot.game.dimension, direction }
                if (!sealedRefuge(c, refuge)) { throw new Error('wall refuge is not enclosed') }
                c.memory.combatRefuge = refuge
                c.memory.tunnelFrontier = null
                c.memory.mineDirection = direction
                c.memory.mineRoute = []
                if (c.memory.shaft) { c.memory.shaft.retryAfter = Date.now() + 60000 }
                c.crowdRetreat = null
                c.corneredUntil = 0
                c.log.info(`Wall refuge sealed at ${center}; mining can continue inward.`)
                return
            } catch (error) {
                c.checkAction()
                c.crowdRetreat.retry = true
                c.log.warn(`Wall refuge abandoned: ${error.message}`)
                for (const dy of [1, 0]) {
                    const b = bot.blockAt(entrance.offset(0, dy, 0), false)
                    if (b?.boundingBox === 'block' && b.diggable && bot.canDigBlock(b)) {
                        await bot.tool.equipForBlock(b, { requireHarvest: false, getFromChest: false })
                        c.checkAction()
                        await bot.dig(b, true)
                    }
                }
                await c.gotoWithTimeout(new goals.GoalBlock(entrance.x, entrance.y, entrance.z), 2000, 'abandon wall refuge')
            }
        }
    } finally {
        bot.pathfinder.setGoal(null)
        bot.clearControlStates()
        bot.pathfinder.setMovements(previous)
    }
}

async function mineFromRefuge(c, state) {
    const refuge = c.memory.combatRefuge
    if (!refuge || !sealedRefuge(c, refuge)) {
        c.memory.combatRefuge = null
        throw new Error('combat refuge seal is no longer intact')
    }
    const feet = c.bot.entity.position.floored()
    const targetY = Math.min(feet.y, state.hasIronPickaxe ? -54 : 16)
    c.memory.mineDirection = refuge.direction
    c.memory.tunnelFrontier = { x: feet.x, y: feet.y, z: feet.z, direction: refuge.direction,
        dimension: refuge.dimension, targetY }
    await mineTunnel(c, targetY)
    if (c.bot.entity.position.distanceTo(new Vec3(refuge.x, refuge.y, refuge.z)) >= 4) {
        c.memory.combatRefuge = null
    }
}

// Pillar refuge: reserved for baiting endermen onto a Nether pillar for pearls (user's tactic); overworld
// zombie crowds are kited instead (caves lack headroom; one skeleton ruins a pillar). Not yet dispatched.
// Mobs that can neither climb nor shoot; spiders climb a pillar and archers shoot its top.
const PILLAR_SAFE = new Set(['zombie', 'husk', 'zombie_villager', 'zombified_piglin', 'vindicator'])
const ARCHERS = new Set(['skeleton', 'stray', 'bogged', 'pillager', 'witch', 'blaze', 'ghast'])
const archerNear = (c, range) => Object.values(c.bot.entities || {}).some(e => e.isValid && ARCHERS.has(e.name) &&
    e.position.distanceTo(c.bot.entity.position) <= range)
const SCAFFOLD = ['dirt', 'coarse_dirt', 'cobblestone', 'cobbled_deepslate', 'netherrack', 'andesite', 'diorite', 'granite', 'tuff']
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

function pillarSafe(c) {
    const bot = c.bot
    const here = bot.entity.position
    const near = Object.values(bot.entities || {}).filter(e => e.isValid && c.hostileNames?.has(e.name) && e.position.distanceTo(here) <= 16)
    const scaffold = bot.inventory.items().reduce((n, i) => n + (SCAFFOLD.includes(i.name) ? i.count : 0), 0)
    const feet = here.floored()
    const headroom = [2, 3, 4, 5].every(dy => bot.blockAt(feet.offset(0, dy, 0), false)?.boundingBox === 'empty')
    // Any archer in range makes a pillar top a target, so only pure zombie crowds qualify (user rule).
    return near.length > 0 && near.every(e => PILLAR_SAFE.has(e.name)) && !archerNear(c, 32) && scaffold >= 3 && headroom
}

// Three blocks up, a zombie's attack box (no vertical reach, 1.95 tall) cannot touch us while zombies
// crowding the base stay inside our reach; dig back down once none is near (user tactic, round 5).
// c.pillarState keeps the pillar across actions so a later decision resumes the fight instead of leaving.
const WEAPONS = ['netherite_sword', 'diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword',
    'netherite_axe', 'diamond_axe', 'iron_axe', 'stone_axe', 'golden_axe', 'wooden_axe']

// Each stint ends inside the 30 s refuge action timeout; the next decision resumes on the pillar.
async function pillarRefuge(c, height = 3, seconds = 25) {
    const bot = c.bot
    const signal = c.actionAbort?.signal
    bot.pathfinder.setGoal(null)
    bot.clearControlStates()
    if (!c.pillarState) {
        const state = { base: bot.entity.position.floored(), placed: [], dimension: bot.game.dimension }
        c.pillarState = state
        while (state.placed.length < height) {
            state.placed.push(await towerStep(c, signal))
        }
        c.log.info(`Pillar refuge ${height} blocks above ${state.base}; fighting from the top.`)
    }
    const { base, placed } = c.pillarState
    // Towering leaves the scaffold in hand; punching with cobblestone was the user's live report.
    const weapon = WEAPONS.map(n => bot.inventory.items().find(i => i.name === n)).find(Boolean)
    if (weapon && bot.heldItem?.name !== weapon.name) {
        await bot.equip(weapon, 'hand')
    }
    const deadline = Date.now() + seconds * 1000
    let nextSwing = 0
    let leave = null
    while (Date.now() < deadline) {
        c.checkAction(signal)
        if (archerNear(c, 24)) {
            leave = 'an archer appeared; leaving the exposed pillar'
            break
        }
        const eye = bot.entity.position.offset(0, bot.entity.eyeHeight ?? 1.62, 0)
        const melee = Object.values(bot.entities || {}).filter(e => e.isValid && PILLAR_SAFE.has(e.name) &&
            e.position.distanceTo(base) <= 8)
        if (!melee.length) {
            leave = 'clear'
            break
        }
        c.combatLiveAt = Date.now()
        // Attack reach is measured to the nearest point of the 0.6 x 1.95 hitbox, as the server does.
        const reach = e => {
            const h = (e.height ?? 1.95)
            const p = new Vec3(Math.max(e.position.x - 0.3, Math.min(eye.x, e.position.x + 0.3)),
                Math.max(e.position.y, Math.min(eye.y, e.position.y + h)), Math.max(e.position.z - 0.3, Math.min(eye.z, e.position.z + 0.3)))
            return { e, p, d: eye.distanceTo(p) }
        }
        const target = melee.map(reach).filter(t => t.d <= 3).sort((a, b) => a.d - b.d)[0]
        if (target && Date.now() >= nextSwing) {
            await bot.lookAt(target.p, true)
            bot.attack(target.e)
            nextSwing = Date.now() + 500
        }
        await sleep(100)
    }
    if (!leave) {
        throw new Error('pillar refuge still surrounded; staying on the pillar')
    }
    if (!signal?.aborted) {
        await descendPillar(c, placed)
        c.pillarState = null
        c.crowdRetreat = null
    }
    if (leave !== 'clear') {
        throw new Error(leave)
    }
}

module.exports = { updateCrowdRetreat, retreatToWall, mineFromRefuge, sealedRefuge, pillarSafe, pillarRefuge, PILLAR_SAFE }
