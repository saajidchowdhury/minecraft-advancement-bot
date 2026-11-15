'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { performProgression, openCookingAlcove } = require('../src/progression-skills')
const { SurvivalController } = require('../src/survival-bot')
const { rockWorld } = require('./fixtures/rock-world')

test('gold mining digs a two-column pit across action boundaries and lands exactly at Y=-54', async () => {
    const start = new Vec3(0, 64, 0)
    const { c, bot, digs, placements } = rockWorld(start, start.y - 1)
    for (let i = 0; i < 32 && bot.entity.position.y > -54; i++) {
        await performProgression(c, 'gather_gold', {})
    }
    assert.equal(bot.entity.position.y, -54)
    assert.equal(bot.entity.onGround, true)
    assert.equal(new Set(digs.map(p => `${p.x},${p.z}`)).size, 2)
    assert.equal(digs.length, 235)
    assert.equal(placements.length, 0)
    const pit = new Set(digs.map(p => `${p.x},${p.z}`))
    await performProgression(c, 'return_surface', {})
    assert.ok(placements.length > 0)
    assert.ok(placements.every(p => !pit.has(`${p.x},${p.z}`)), 'left the open pit before spending scaffold')
    assert.ok(bot.entity.position.y > -54)
})

test('a return ignores old stairs, clears overhead in batches and steps onto the surface above home Y', async () => {
    const start = new Vec3(0, -54, 0)
    const { c, bot, digs, placements } = rockWorld(start, 69)
    c.memory.mineRoute = [start.offset(-1, 1, 0)]
    c.memory.shaft = { dimension: 'overworld', cells: Array(8).fill(start) }
    for (let i = 0; i < 24 && (bot.entity.position.y < 70 || c.memory.surfaceClimb); i++) {
        await performProgression(c, 'return_surface', {})
    }
    const feet = bot.entity.position.floored()
    assert.equal(feet.y, 70)
    assert.ok(feet.x !== 0 || feet.z !== 0, 'still standing over the shaft')
    assert.equal(digs.length, 122)
    assert.ok(digs.every(p => p.x === 0 && p.z === 0))
    assert.equal(placements.length, 124)
    assert.equal(c.memory.surfaceClimb, null)
})

test('an unsupported drop is skipped for a supported neighboring column', async () => {
    const start = new Vec3(0, -53, 0)
    const { c, bot, set } = rockWorld(start, start.y - 1)
    for (let y = -60; y <= -55; y++) {
        set(new Vec3(1, y, 0), 'air')
    }
    await performProgression(c, 'gather_gold', {})
    assert.deepEqual(bot.entity.position.floored(), start.offset(0, -1, 1))
    assert.equal(bot.entity.onGround, true)
})

test('the ascent plugs overhead lava, walks laterally under the pool and resumes pillaring', async () => {
    const start = new Vec3(0, 59, 0)
    const { c, bot, set, digs, placements } = rockWorld(start, 67)
    for (let x = 0; x < 3; x++) {
        set(new Vec3(x, 62, 0), 'lava')
    }
    for (let i = 0; i < 6 && (bot.entity.position.y < 68 || c.memory.surfaceClimb); i++) {
        await performProgression(c, 'return_surface', {})
    }
    assert.equal(bot.entity.position.y, 68)
    assert.equal(bot.entity.isInLava, false)
    assert.equal(c.memory.surfaceClimb, null)
    assert.equal(placements[0].x, 4)
    assert.ok(c.memory.liquidPlugs.has('overworld:(0, 61, 0)'))
    assert.ok(digs.every(p => p.y !== 62 || p.z !== 0 || p.x >= 3))
})

test('a stranded hand miner can pillar out through rock with carried scaffold', async () => {
    const start = new Vec3(0, 62, 0)
    const { c, bot, digs, pick } = rockWorld(start, 65)
    pick.count = 0
    await performProgression(c, 'return_surface', {})
    assert.equal(bot.entity.position.y, 66)
    assert.deepEqual(digs, [start.offset(0, 2, 0), start.offset(0, 3, 0)])
})

test('cancelling a pillar jump releases controls before placing a block', async () => {
    const start = new Vec3(0, 59, 0)
    const { c, bot, placements } = rockWorld(start, 67)
    c.checkAction = signal => assert.ok(!signal.aborted, 'action cancelled')
    const tick = bot.waitForTicks
    bot.waitForTicks = async n => {
        await tick(n)
        if (bot.controls.jump) {
            c.actionAbort.abort()
        }
    }
    await assert.rejects(performProgression(c, 'return_surface', {}), /action cancelled/)
    assert.equal(placements.length, 0)
    assert.equal(bot.controls.jump, false)
    assert.equal(bot.entity.onGround, true)
    assert.deepEqual(bot.entity.position.floored(), start)
    bot.waitForTicks = tick
    c.actionAbort = new AbortController()
    for (let i = 0; i < 3 && c.memory.surfaceClimb; i++) {
        await performProgression(c, 'return_surface', {})
    }
    assert.equal(bot.entity.position.y, 68)
    assert.equal(c.memory.surfaceClimb, null)
})

test('a skylit mining pit still requires an ascent to the rim', async () => {
    const start = new Vec3(0, -43, 0)
    const { c, bot, digs, placements } = rockWorld(start, start.y - 1)
    while (bot.entity.position.y > -54) {
        await performProgression(c, 'gather_gold', {})
    }
    const mined = digs.length
    for (let i = 0; i < 4 && (bot.entity.position.y < start.y || c.memory.surfaceClimb); i++) {
        await performProgression(c, 'return_surface', {})
    }
    assert.equal(bot.entity.position.y, start.y)
    assert.equal(placements.length, 11)
    assert.equal(digs.length, mined)
    assert.equal(c.memory.surfaceClimb, null)
})

test('a first-day meat descent stops exactly at Y=47 and keeps the furnace outside its two columns', async () => {
    const start = new Vec3(0, 50, 0)
    const { c, bot } = rockWorld(start, start.y - 1)
    c.memory.firstDayMeal = 'pending'
    c.activeAction = 'gather_gold'
    c.isEmptyPlacementBlock = block => block?.name === 'air'
    await performProgression(c, 'gather_gold', {})
    const checkpoint = bot.entity.position.floored()
    assert.equal(checkpoint.y, 47)
    assert.equal(c.memory.miningDescent.action, 'gather_gold')
    const furnace = await openCookingAlcove(c)
    assert.equal(furnace.y, 47)
    assert.equal(furnace.x, checkpoint.x)
    assert.equal(Math.abs(furnace.z - checkpoint.z), 1)
    await performProgression(c, 'gather_gold', {})
    assert.deepEqual(bot.entity.position.floored(), checkpoint)
    c.memory.firstDayMeal = 'done'
    c.observe = () => assert.fail('a resumed shaft must continue without surveying the route again')
    await SurvivalController.prototype.perform.call(c, 'gather_gold', { descentAction: 'gather_gold', descentTargetY: -54 })
    assert.equal(bot.entity.position.y, 43)
})

test('gather_stone mines a continuous level batch and saves enough for the return', async () => {
    const { c, bot, digs, cobble } = rockWorld(new Vec3(0, 47, 0), 49)
    c.home.y = 50
    cobble.count = 0
    c.countItems = names => names.includes('cobblestone') ? cobble.count : 0
    c.findNearestBlock = () => assert.fail('stone gathering started a target search')
    const dig = bot.dig
    bot.dig = async block => {
        const lateral = block.position.x !== bot.entity.position.floored().x
        await dig(block)
        if (lateral) {
            cobble.count++
        }
    }
    const state = { dimension: 'overworld', hasCraftingTable: true, hasStonePickaxe: true, hasWoodenPickaxe: true,
        hasFurnace: true, hostileDistance: Infinity, y: 47, underground: true, health: 20, food: 20,
        sideGoal: { action: 'gather_stone', item: 'piston' } }
    await SurvivalController.prototype.gatherStone.call(c, state)
    assert.deepEqual(digs.map(p => [p.x, p.y, p.z]), [[1, 48, 0], [1, 47, 0], [2, 48, 0], [2, 47, 0],
        [3, 48, 0], [3, 47, 0], [4, 48, 0], [4, 47, 0]])
    assert.equal(c.memory.stoneTrip.ready, true)
    assert.equal(require('../src/decision-engine').chooseAction({ ...state, stoneTrip: c.memory.stoneTrip }), 'return_surface')
    await performProgression(c, 'return_surface', {})
    assert.equal(bot.entity.position.y, 50)
    assert.ok(cobble.count >= 4)
    assert.equal(c.memory.stoneTrip, null)
})

test('a stone trip from below rises directly to Y=47 without finishing the surface climb', async () => {
    const { c, bot, digs, placements } = rockWorld(new Vec3(0, 43, 0), 62)
    const state = { dimension: 'overworld', hasCraftingTable: true, hasStonePickaxe: true, hasWoodenPickaxe: true,
        hasWoodcuttingAxe: true, hasDiggingShovel: true, hasFurnace: true }
    c.findNearestBlock = () => assert.fail('stone gathering started a target search')
    await SurvivalController.prototype.gatherStone.call(c, state)
    assert.equal(bot.entity.position.y, 47)
    assert.equal(placements.length, 4)
    assert.ok(digs.every(p => p.x === 0 && p.z === 0 && p.y <= 49))
    assert.equal(c.memory.surfaceClimb, null)
    assert.equal(c.memory.stoneTrip.ready, false)
})

test('a stone descent reaches Y=47 in its pit and leaves the first-day meal stop pending', async () => {
    const { c, bot } = rockWorld(new Vec3(0, 52, 0), 51)
    const state = { dimension: 'overworld', hasCraftingTable: true, hasWoodenPickaxe: true }
    c.activeAction = 'gather_stone'
    c.memory.firstDayMeal = 'pending'
    c.findNearestBlock = () => assert.fail('stone gathering started a target search')
    await SurvivalController.prototype.gatherStone.call(c, state)
    assert.equal(bot.entity.position.y, 48)
    await SurvivalController.prototype.gatherStone.call(c, { ...state, stoneTrip: c.memory.stoneTrip })
    assert.equal(bot.entity.position.y, 47)
    assert.equal(c.memory.miningDescent.targetY, 47)
    assert.equal(c.memory.miningDescent.action, 'gather_stone')
    assert.equal(c.memory.firstDayMeal, 'pending')
    assert.equal(c.memory.stoneTrip.ready, false)
})
