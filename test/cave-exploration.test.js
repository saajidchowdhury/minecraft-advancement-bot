'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { safeFooting, findCaveRoute, exploreCave, collectOpportunity } = require('../src/cave-exploration')
const { performProgression } = require('../src/progression-skills')

function caveWorld() {
    const blocks = new Map()
    const inventory = [{ name: 'torch', count: 16 }, { name: 'iron_pickaxe', type: 1, count: 1 }]
    const state = { dimension: 'overworld', health: 20, food: 20, foodUnits: 12,
        armorEquipped: true, shieldEquipped: true, hostileDistance: Infinity, logs: 2, planks: 0 }
    const moves = []
    const original = { safeToBreak: () => true }
    const c = {
        memory: {}, running: true, paused: false, actionAbort: new AbortController(), movements: original,
        observe: () => state, log: { info() {} }, isBlockedTarget: () => false, rememberBlockedTarget() {},
        bestItem: names => inventory.find(item => names.includes(item.name)),
        countItems: names => inventory.filter(item => names.includes(item.name)).reduce((sum, item) => sum + item.count, 0),
        findNearestBlock: () => null,
        bot: {
            registry: require('minecraft-data')('26.1'), health: 20,
            game: { dimension: 'overworld', minY: -64 }, entity: { position: new Vec3(0.5, 64, 0.5) },
            inventory: { emptySlotCount: () => 10, items: () => inventory },
            blockAt(p) {
                const name = blocks.has(p.toString()) ? blocks.get(p.toString()) : (p.y < 64 || p.y >= 70 ? 'stone' : 'air')
                return name === null ? null : { name, position: p, boundingBox: ['air', 'torch'].includes(name) ? 'empty' : 'block' }
            },
            pathfinder: { setGoal() {}, setMovements(m) { c.activeMovements = m } },
            equip: async () => {}, waitForTicks: async () => {},
            async placeBlock(floor) {
                assert.equal(c.activeMovements.canDig, false)
                blocks.set(floor.position.offset(0, 1, 0).toString(), 'torch')
                inventory.find(item => item.name === 'torch').count--
            }
        },
        async gotoWithTimeout(goal) {
            assert.equal(c.activeMovements.canDig, false)
            assert.equal(c.activeMovements.allowParkour, false)
            assert.deepEqual(c.activeMovements.scafoldingBlocks, [])
            moves.push(new Vec3(goal.x, goal.y, goal.z))
            c.bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5)
        }
    }
    return { c, blocks, inventory, state, moves, original }
}

test('a large cave offers a bounded connected walk before more tunneling', () => {
    const { c } = caveWorld()
    const route = findCaveRoute(c.bot, new Map(), -54)
    assert.ok(route.length > 0 && route.length <= 6)
    let from = c.bot.entity.position.floored()
    for (const p of route) {
        assert.equal(Math.abs(p.x - from.x) + Math.abs(p.z - from.z), 1)
        assert.ok(Math.abs(p.y - from.y) <= 1)
        assert.equal(safeFooting(c.bot, p), true)
        from = p
    }
})

test('cave discovery rejects surface terrain and one-block tunnels', () => {
    const { c } = caveWorld()
    const blockAt = c.bot.blockAt
    c.bot.blockAt = p => p.y >= 70 ? { name: 'air', boundingBox: 'empty' } : blockAt(p)
    assert.deepEqual(findCaveRoute(c.bot, new Map(), 16), [])
    c.bot.blockAt = p => p.z !== 0 ? { name: 'stone', boundingBox: 'block' } : blockAt(p)
    assert.deepEqual(findCaveRoute(c.bot, new Map(), 16), [])
})

test('cave footing rejects unloaded terrain, liquids, spikes and deep-dark triggers', () => {
    const { c, blocks } = caveWorld()
    const p = new Vec3(0, 64, 0)
    for (const name of [null, 'water', 'lava', 'pointed_dripstone', 'sculk_shrieker', 'sculk_sensor']) {
        blocks.set(p.offset(1, 0, 0).toString(), name)
        assert.equal(safeFooting(c.bot, p), false)
    }
    blocks.clear()
    blocks.set(p.offset(0, -1, 0).toString(), 'magma_block')
    assert.equal(safeFooting(c.bot, p), false)
    blocks.set(p.offset(0, -1, 0).toString(), 'air')
    assert.equal(safeFooting(c.bot, p), false)
})

test('cave search prefers natural steps toward the requested ore depth', () => {
    const { c } = caveWorld()
    c.bot.blockAt = p => {
        const floorY = 63 - Math.max(0, Math.min(p.x, 5))
        const solid = p.y <= floorY || p.y >= 70
        return { name: solid ? 'stone' : 'air', position: p, boundingBox: solid ? 'block' : 'empty' }
    }
    const route = findCaveRoute(c.bot, new Map(), -54)
    assert.ok(route.length > 0)
    assert.ok(route.at(-1).y < 64)
})

test('cave visit cooldown is dimension scoped and expires', () => {
    const { c } = caveWorld()
    const visits = new Map()
    for (let x = -12; x <= 12; x++) {
        for (let z = -12; z <= 12; z++) {
            visits.set(`overworld:${new Vec3(x, 64, z)}`, 1000)
        }
    }
    assert.deepEqual(findCaveRoute(c.bot, visits, 16, 2000), [])
    c.bot.game.dimension = 'the_nether'
    assert.ok(findCaveRoute(c.bot, visits, 16, 2000).length > 0)
    c.bot.game.dimension = 'overworld'
    assert.ok(findCaveRoute(c.bot, visits, 16, 1000000).length > 0)
    assert.deepEqual(findCaveRoute(c.bot, new Map(), 16, 2000, () => true), [])
})

test('a cave survey lights supported steps, saves return waypoints and restores movement policy', async () => {
    const { c, moves, original } = caveWorld()
    assert.equal(await exploreCave(c, 16), true)
    assert.ok(moves.length > 0 && moves.length <= 6)
    assert.equal(c.memory.mineRoute.length, moves.length)
    assert.equal(c.memory.mineRoute[0].x, 0)
    assert.equal(c.activeMovements, original)
    assert.ok(c.memory.caveVisits.size > 0)
})

test('cave exploration yields to insufficient supplies, threats and equipment preparation', async () => {
    for (const change of [{ health: 15 }, { food: 17 }, { foodUnits: 0 }, { armorEquipped: false },
        { shieldEquipped: false }, { hostileDistance: 10 }, { dimension: 'the_nether' }]) {
        const { c, state, moves } = caveWorld()
        Object.assign(state, change)
        assert.equal(await exploreCave(c, 16), false)
        assert.equal(moves.length, 0)
    }
    const { c, inventory } = caveWorld()
    inventory[0].count = 0
    assert.equal(await exploreCave(c, 16), false)
})

test('cancellation during torch equip sends no placement or movement', async () => {
    const { c, moves, original } = caveWorld()
    c.bot.equip = async () => c.actionAbort.abort()
    c.bot.placeBlock = async () => assert.fail('placement after cancellation')
    await assert.rejects(exploreCave(c, 16), /cancelled/)
    assert.equal(moves.length, 0)
    assert.equal(c.activeMovements, original)
})

test('failed cave movement retains a return anchor, quarantines the target and restores policy', async () => {
    const { c, original } = caveWorld()
    let remembered = false
    c.gotoWithTimeout = async () => { throw new Error('blocked passage') }
    c.rememberBlockedTarget = () => { remembered = true }
    await assert.rejects(exploreCave(c, 16), /blocked passage/)
    assert.equal(remembered, true)
    assert.equal(c.activeMovements, original)
    assert.equal(c.memory.mineRoute.length, 1)
})

test('a newly approaching hostile ends the survey before another step', async () => {
    const { c, moves, state } = caveWorld()
    const go = c.gotoWithTimeout
    c.gotoWithTimeout = async goal => { await go(goal); state.hostileDistance = 8 }
    assert.equal(await exploreCave(c, 16), true)
    assert.equal(moves.length, 1)
})

test('opportunistic ores respect reserves, tool tier and inventory headroom', async () => {
    const { c, inventory } = caveWorld()
    const target = { name: 'deepslate_gold_ore', position: new Vec3(2, 64, 0), canHarvest: type => type === 1 }
    let collected = 0
    c.findNearestBlock = (predicate, radius, options) => predicate(target.name) && options.filter(target) ? target : null
    c.collectTarget = async block => { assert.equal(block, target); collected++ }
    assert.equal(await collectOpportunity(c), true)
    inventory.push({ name: 'raw_gold', count: 8 })
    assert.equal(await collectOpportunity(c), false)
    inventory.pop()
    assert.equal(await collectOpportunity(c, ['gold_ore', 'deepslate_gold_ore']), false)
    target.canHarvest = () => false
    assert.equal(await collectOpportunity(c), false)
    target.canHarvest = () => true
    c.bot.inventory.emptySlotCount = () => 4
    assert.equal(await collectOpportunity(c), false)
    assert.equal(collected, 1)
})

test('the real diamond action surveys a cave instead of digging when no requested ore is exposed', async () => {
    const { c, moves } = caveWorld()
    c.bot.dig = async () => assert.fail('resumed tunneling before surveying cave')
    await performProgression(c, 'gather_diamonds', {})
    assert.ok(moves.length > 0)
})

test('survey work has a shared step budget rather than exploring indefinitely', async () => {
    const { c, moves } = caveWorld()
    c.memory.caveSurvey = { dimension: 'overworld', startedAt: Date.now(), steps: 23 }
    assert.equal(await exploreCave(c, 16), true)
    assert.equal(moves.length, 1)
    assert.equal(await exploreCave(c, 16), false)
    c.memory.caveSurvey.startedAt -= 120001
    assert.equal(await exploreCave(c, 16), true)
})

test('unconfirmed lighting stops the survey before moving into darkness', async () => {
    const { c, moves, original } = caveWorld()
    c.bot.placeBlock = async () => {}
    await assert.rejects(exploreCave(c, 16), /not confirmed/)
    assert.equal(moves.length, 0)
    assert.equal(c.activeMovements, original)
})

test('large caverns with high ceilings still receive a survey', () => {
    const { c } = caveWorld()
    c.bot.blockAt = p => ({ name: p.y < 64 || p.y >= 110 ? 'stone' : 'air', position: p,
        boundingBox: p.y < 64 || p.y >= 110 ? 'block' : 'empty' })
    assert.ok(findCaveRoute(c.bot, new Map(), -54).length > 0)
})

test('a cave survey spaces torches instead of lighting every step', async () => {
    const { c, blocks, inventory, state, moves } = caveWorld()
    c.findNearestBlock = (match, distance) => [...blocks].map(([key, name]) => ({ name, p: new Vec3(...key.slice(1, -1).split(',').map(Number)) }))
        .find(b => match(b.name) && b.p.distanceTo(c.bot.entity.position.floored()) <= distance) || null
    assert.equal(await exploreCave(c, 16), true)
    assert.ok(moves.length >= 4)
    assert.equal(16 - inventory.find(item => item.name === 'torch').count, 1)
})
