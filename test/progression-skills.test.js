'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { safeTunnelStep, portalFrame, redstonePlan } = require('../src/progression-skills')
const { chooseAction } = require('../src/decision-engine')

function world(overrides = new Map()) {
    return {
        blockAt(p) {
            return { name: overrides.get(p.toString()) || 'stone', boundingBox: 'block', diggable: true, canHarvest: () => true }
        }
    }
}

test('stair mining rejects liquid, falling blocks, missing support and unloaded neighbors', () => {
    const feet = new Vec3(0, 64, 0)
    const target = feet.offset(1, -1, 0)
    assert.equal(safeTunnelStep(world(), feet, target), true)
    for (const name of ['lava', 'water', 'gravel', 'sand', 'bedrock']) {
        assert.equal(safeTunnelStep(world(new Map([[target.offset(1, 0, 0).toString(), name]])), feet, target), false)
    }
    assert.equal(safeTunnelStep({ blockAt: () => null }, feet, target), false)
    const noFloor = world()
    const blockAt = noFloor.blockAt
    noFloor.blockAt = p => p.equals(target.offset(0, -1, 0)) ? { name: 'air', boundingBox: 'empty' } : blockAt(p)
    assert.equal(safeTunnelStep(noFloor, feet, target), false)
})

test('portal blueprint uses ten distinct obsidian blocks around a clear 2x3 interior', () => {
    const origin = new Vec3(0, 64, 0)
    const frame = portalFrame(origin)
    const positions = new Set(frame.map(p => p.toString()))
    assert.equal(positions.size, 10)
    for (const x of [1, 2]) {
        for (const y of [1, 2, 3]) {
            assert.equal(positions.has(origin.offset(x, y, 0).toString()), false)
        }
    }
})

test('redstone request prepares materials without replacing the main advancement route', () => {
    const state = { logs: 4, planks: 0, sticks: 4, cobblestone: 8, ironIngots: 1, redstone: 0, items: {} }
    assert.equal(redstonePlan(state).action, 'gather_redstone')
    assert.equal(redstonePlan({ ...state, redstone: 1 }).item, 'piston')
    assert.equal(redstonePlan({ ...state, items: { piston: 1, lever: 1 } }).action, 'build_redstone')
})

test('full hunger does not trigger an endless failed eating loop after damage', () => {
    const state = { health: 18, food: 20, hasFood: true, hostileDistance: Infinity,
        logs: 1, planks: 0, sticks: 0, hasCraftingTable: false }
    assert.equal(chooseAction(state), 'craft_table')
})

test('surface resources use the return staircase when deep underground', () => {
    const state = { health: 20, food: 20, hasFood: false, hostileDistance: Infinity,
        logs: 0, planks: 0, sticks: 0, hasCraftingTable: false, underground: true }
    assert.equal(chooseAction(state), 'return_surface')
})

test('obsidian casting requires a contained basin with a solid floor and dry banks', () => {
    const { safeCastingBasin } = require('../src/progression-skills')
    const basin = new Vec3(0, 10, 0)
    const bot = {
        blockAt(p) {
            const air = p.y >= 11
            return { name: air ? 'air' : 'stone', boundingBox: air ? 'empty' : 'block' }
        }
    }
    assert.equal(safeCastingBasin(bot, basin), true)
    const blockAt = bot.blockAt
    bot.blockAt = p => p.equals(basin.offset(0, -1, 0)) ? { name: 'lava', boundingBox: 'empty' } : blockAt(p)
    assert.equal(safeCastingBasin(bot, basin), false)
})

test('a completed night shelter remains occupied even if its walls resemble a shaft', () => {
    assert.equal(chooseAction({ health: 20, food: 20, hostileDistance: Infinity,
        sheltered: true, isNight: true, shaftTrapped: true }), 'wait')
})

test('directed staircase mines supported steps without ever digging below the current feet', async () => {
    for (const [targetY, headingX, expectedX] of [[60, -10, -4], [68, 10, 4]]) {
        const { mineTunnel } = require('../src/progression-skills')
        const air = new Set()
        const tool = { name: 'stone_pickaxe' }
        const bot = {
            health: 20,
            entity: { position: new Vec3(0, 64, 0) },
            blockAt(p) {
                const empty = air.has(p.toString())
                return { name: empty ? 'air' : 'stone', position: p, boundingBox: empty ? 'empty' : 'block', diggable: true, canHarvest: () => true }
            },
            equip: async () => {},
            canDigBlock: () => true,
            async dig(block) {
                const feet = bot.entity.position.floored()
                assert.equal(block.position.x === feet.x && block.position.z === feet.z && block.position.y < feet.y, false)
                air.add(block.position.toString())
            }
        }
        const controller = {
            bot, running: true, paused: false, actionAbort: new AbortController(), memory: {},
            bestItem: () => tool, log: { info() {} },
            async gotoWithTimeout(goal) {
                bot.entity.position = new Vec3(goal.x, goal.y, goal.z)
            }
        }
        await mineTunnel(controller, targetY, new Vec3(headingX, targetY, 0))
        assert.equal(bot.entity.position.y, targetY)
        assert.equal(bot.entity.position.x, expectedX)
        assert.equal(controller.memory.mineRoute.length, 4)
        assert.equal(controller.memory.minedCells.size, 4)
    }
})

test('ascending across an open cave places attached stair supports before walking', async () => {
    const { mineTunnel } = require('../src/progression-skills')
    const placed = new Set()
    const bot = {
        health: 20, entity: { position: new Vec3(0.5, 64, 0.5) },
        blockAt(p) {
            const solid = p.y < 64 || placed.has(p.toString())
            return { name: solid ? 'stone' : 'air', position: p, boundingBox: solid ? 'block' : 'empty', diggable: true, canHarvest: () => true }
        },
        equip: async () => {}, canDigBlock: () => true
    }
    const c = {
        bot, running: true, paused: false, actionAbort: new AbortController(), memory: {}, log: { info() {} },
        bestItem: () => ({ name: 'cobblestone' }),
        async placeSurvivalBlock(p) {
            const supported = [[0, -1, 0], [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]].some(([x, y, z]) =>
                bot.blockAt(p.offset(x, y, z)).boundingBox === 'block')
            assert.equal(supported, true)
            placed.add(p.toString())
        },
        async gotoWithTimeout(goal) {
            assert.equal(bot.blockAt(new Vec3(goal.x, goal.y - 1, goal.z)).boundingBox, 'block')
            bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5)
        }
    }
    await mineTunnel(c, 68)
    assert.equal(bot.entity.position.y, 68)
    assert.equal(placed.size, 7)
})

test('tunneling preserves iron and diamond picks but selects a sufficient tier for ore', () => {
    const { miningPickaxe } = require('../src/progression-skills')
    const items = [
        { name: 'wooden_pickaxe', type: 1 }, { name: 'stone_pickaxe', type: 2 },
        { name: 'iron_pickaxe', type: 3 }, { name: 'diamond_pickaxe', type: 4 }
    ]
    const c = { bestItem: names => items.find(item => names.includes(item.name)) }
    assert.equal(miningPickaxe(c, { canHarvest: () => true }).name, 'stone_pickaxe')
    assert.equal(miningPickaxe(c, { canHarvest: type => type >= 3 }).name, 'iron_pickaxe')
    assert.equal(miningPickaxe(c, { canHarvest: type => type >= 4 }).name, 'diamond_pickaxe')
})
