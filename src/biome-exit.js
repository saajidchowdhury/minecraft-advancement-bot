'use strict'

const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const { dryMovements } = require('./cave-exploration')
const { soundFloor } = require('./under-feet')

const WET = new Set(['swamp', 'mangrove_swamp', 'river', 'frozen_river'])
const OCEAN = /(?:^|_)ocean$/
const BEACH = new Set(['beach', 'snowy_beach'])
const SIDES = [[1, 0], [0, 1], [-1, 0], [0, -1]]
const HEADINGS = ['east', 'south', 'west', 'north']
const STEP = 4
const LEG = 16

function surfaceBiome(bot, p) {
    const sample = new Vec3(Math.floor(p.x), Math.max(bot.game?.seaLevel ?? 63, Math.floor(p.y)), Math.floor(p.z))
    const world = bot.world
    if (!world?.getColumnAt?.(sample)) {
        return null
    }
    return bot.registry.biomes[world.getBiome(sample)]?.name ?? null
}

function wetBiome(name) {
    return Boolean(name && (WET.has(name) || BEACH.has(name) || OCEAN.test(name)))
}

function dryLanding(bot, p) {
    const floor = bot.blockAt(p.offset(0, -1, 0), false)
    const clear = q => ['air', 'cave_air', 'void_air', 'short_grass', 'tall_grass', 'fern', 'snow'].includes(bot.blockAt(q, false)?.name)
    return soundFloor(floor) && !floor.getProperties?.().waterlogged && clear(p) && clear(p.offset(0, 1, 0))
}

function solidExit(bot, p, name = surfaceBiome(bot, p)) {
    return Boolean(name && !wetBiome(name) && dryLanding(bot, p))
}

function coastTargets(at, start, visited, wetSide) {
    const nearOcean = p => SIDES.some(([dx, dz]) => OCEAN.test(at(p.offset(STEP * dx, 0, STEP * dz)) ?? ''))
    const queue = [start]
    const seen = new Set([String(start)])
    const candidates = []
    for (let i = 0; i < queue.length; i++) {
        const p = queue[i]
        for (const [dx, dz] of SIDES) {
            const q = p.offset(STEP * dx, 0, STEP * dz)
            const key = String(q)
            const distance = q.distanceTo(start)
            const biome = at(q)
            if (seen.has(key) || distance > 32 || !biome || (wetBiome(biome) && biome !== wetSide && !BEACH.has(biome))) {
                continue
            }
            seen.add(key)
            if (!visited.includes(key)) {
                candidates.push({ q, exit: !wetBiome(biome), distance })
            }
            if (BEACH.has(biome) || (biome === wetSide && nearOcean(q))) {
                queue.push(q)
            }
        }
    }
    return candidates.sort((a, b) => Number(b.exit) - Number(a.exit) ||
        (a.exit ? a.distance - b.distance : Math.abs(a.distance - LEG) - Math.abs(b.distance - LEG))).map(({ q }) => q)
}

async function leaveWetBiome(c) {
    const bot = c.bot
    const signal = c.actionAbort?.signal
    const at = p => surfaceBiome(bot, p)
    const start = bot.entity.position.floored()
    const biome = at(start)
    if (!biome) {
        await bot.waitForTicks(5)
        return
    }
    const exit = c.biomeExit ??= { direction: null, visited: [], coast: null }
    const land = p => solidExit(bot, p, at(p))
    if (land(start) && bot.entity.onGround && !bot.entity.isInWater) {
        c.biomeExit = null
        return
    }
    const ray = SIDES.map(([dx, dz]) => Array.from({ length: 16 }, (_, i) => start.offset(dx * (i + 1) * STEP, 0, dz * (i + 1) * STEP)))
    if (exit.direction === null) {
        const distance = points => {
            const index = points.findIndex(p => {
                const name = at(p)
                return name && (OCEAN.test(biome) ? !OCEAN.test(name) : !wetBiome(name))
            })
            return index < 0 ? Infinity : index
        }
        exit.direction = ray.reduce((best, points, i) => distance(points) < distance(ray[best]) ? i : best, 0)
    }
    const ahead = ray[exit.direction].slice(0, LEG / STEP)
    const oceanAhead = ahead.findIndex(p => OCEAN.test(at(p) ?? ''))
    const dryAhead = ahead.findIndex(p => at(p) && !wetBiome(at(p)))
    if (OCEAN.test(biome)) {
        exit.coast ??= exit.previousBiome ?? null
    } else {
        exit.previousBiome = biome
        if (!exit.coast && oceanAhead >= 0 && (dryAhead < 0 || oceanAhead < dryAhead)) {
            exit.coast = biome
        }
    }
    const anchor = exit.coast && oceanAhead >= 0 && biome === exit.coast ? (ahead[oceanAhead - 1] ?? start) : start
    const coast = exit.coast ? coastTargets(at, anchor, exit.visited, exit.coast) : []
    const targets = []
    if (exit.coast) {
        const shore = []
        for (let dx = -12; dx <= 12; dx++) {
            for (let dz = -12; dz <= 12; dz++) {
                const column = start.offset(dx, 0, dz)
                if (Math.hypot(dx, dz) > 12 || wetBiome(at(column))) {
                    continue
                }
                const footing = [0, 1, 2, -1, 3, 4].map(dy => column.offset(0, dy, 0))
                    .find(p => land(p) && !exit.visited.includes(String(p)))
                if (footing) {
                    shore.push(footing)
                }
            }
        }
        targets.push(...shore.sort((a, b) => a.distanceTo(start) - b.distanceTo(start)).slice(0, 2))
    }
    if (wetBiome(biome)) {
        targets.push(...coast.slice(0, 2 - targets.length))
    }
    if (targets.length < 2 && (!exit.coast || !wetBiome(biome))) {
        targets.push(ahead.at(-1))
    } else if (!targets.length && !anchor.equals(start)) {
        targets.push(anchor)
    }
    const walking = dryMovements(bot, true)
    walking.liquidCost = 1
    walking.maxDropDown = 4
    walking.infiniteLiquidDropdownDistance = true
    const neighbors = walking.getNeighbors.bind(walking)
    walking.getNeighbors = node => neighbors(node).filter(next => {
        const name = at(next)
        if (!name) {
            return false
        }
        if (!OCEAN.test(name) || (OCEAN.test(biome) && !exit.coast)) {
            return true
        }
        return Boolean(exit.coast && SIDES.some(([dx, dz]) =>
            at(new Vec3(next.x + STEP * dx, next.y, next.z + STEP * dz)) === exit.coast))
    })
    const pathfinder = bot.pathfinder
    const previous = pathfinder.movements
    const slack = pathfinder.searchRadius
    pathfinder.setMovements(walking)
    pathfinder.searchRadius = 96
    try {
        for (const target of targets) {
            c.checkAction(signal)
            const goal = land(target) ? new goals.GoalBlock(target.x, target.y, target.z) : new goals.GoalXZ(target.x, target.z)
            const end = goal.isEnd.bind(goal)
            goal.isEnd = node => land(new Vec3(node.x, node.y, node.z)) || end(node)
            exit.visited.push(String(target))
            if (exit.visited.length > 64) {
                exit.visited.shift()
            }
            try {
                const route = land(target) ? 'toward solid footing' : exit.coast ? 'along the ocean border' : HEADINGS[exit.direction]
                c.log.info(`Leaving ${biome} ${route} toward ${target}.`)
                await c.gotoWithTimeout(goal, 24000, 'biome exit')
                c.checkAction(signal)
                return
            } catch (error) {
                c.checkAction(signal)
                if (!/no path|timed out/i.test(error.message)) {
                    throw error
                }
                pathfinder.setGoal(null)
                if (bot.entity.position.floored().distanceTo(start) >= 4) {
                    return
                }
            }
        }
        if (exit.coast && !targets.length) {
            exit.visited.length = 0
            if (await c.descendFromCanopy() > 0) {
                return
            }
            await bot.waitForTicks(10)
            return
        }
        exit.direction = (exit.direction + 1) % SIDES.length
        await c.descendFromCanopy()
    } finally {
        pathfinder.setGoal(null)
        pathfinder.setMovements(previous)
        pathfinder.searchRadius = slack
    }
}

module.exports = { surfaceBiome, wetBiome, solidExit, leaveWetBiome }
