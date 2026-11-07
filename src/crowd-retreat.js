'use strict'

const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { dryMovements, safeFooting } = require('./cave-exploration')
const { miningPickaxe, mineTunnel } = require('./progression-skills')

const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]]
const UNSAFE = new Set(['water', 'lava', 'sand', 'red_sand', 'gravel', 'magma_block',
    'bedrock', 'chest', 'barrel', 'furnace', 'spawner', 'trial_spawner', 'infested_stone', 'infested_deepslate'])

function observedThreats(c, names) {
    return Object.values(c.bot.entities || {}).filter(e => e.isValid && names.has(e.name) &&
        e.position.distanceTo(c.bot.entity.position) <= 16 && c.canSee(e))
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

module.exports = { updateCrowdRetreat, retreatToWall, mineFromRefuge, sealedRefuge }
