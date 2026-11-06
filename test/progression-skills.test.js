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

test('tunneling routes around a furnace or storage container without discarding adjacent dry steps', () => {
    const feet = new Vec3(0, 64, 0)
    const target = feet.offset(1, 0, 0)
    for (const name of ['furnace', 'barrel', 'chest']) {
        const bot = world(new Map([[target.toString(), name]]))
        assert.equal(safeTunnelStep(bot, feet, target), false)
        assert.equal(safeTunnelStep(bot, feet, feet.offset(0, 0, 1)), true)
    }
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

test('tunneling uses the strongest available pick that can harvest the block', () => {
    const { miningPickaxe } = require('../src/progression-skills')
    const items = [
        { name: 'wooden_pickaxe', type: 1 }, { name: 'stone_pickaxe', type: 2 },
        { name: 'iron_pickaxe', type: 3 }, { name: 'diamond_pickaxe', type: 4 }
    ]
    const c = { bestItem: names => items.find(item => names.includes(item.name)) }
    assert.equal(miningPickaxe(c, { canHarvest: () => true }).name, 'diamond_pickaxe')
    assert.equal(miningPickaxe(c, { canHarvest: type => type >= 3 }).name, 'diamond_pickaxe')
    assert.equal(miningPickaxe(c, { canHarvest: type => type >= 4 }).name, 'diamond_pickaxe')
})

test('tunnel digging uses an axe on wooden blocks and keeps the iron pick for stone', async () => {
    const { mineTunnel } = require('../src/progression-skills')
    const Block = require('prismarine-block')('26.1')
    const data = require('minecraft-data')('26.1')
    const wood = new Vec3(1, 65, 0)
    const axe = { name: 'stone_axe', type: data.itemsByName.stone_axe.id }
    const pick = { name: 'iron_pickaxe', type: data.itemsByName.iron_pickaxe.id }
    const dug = []
    const bot = {
        health: 20, entity: { position: new Vec3(0, 64, 0) },
        blockAt(p) {
            const name = p.equals(wood) ? 'oak_planks' : 'stone'
            const block = Block.fromStateId(data.blocksByName[name].defaultState, 0)
            block.position = p
            return block
        },
        async equip(item) { this.heldItem = item }, canDigBlock: () => true,
        async dig(block) { dug.push([block.name, this.heldItem.name]) }
    }
    const c = {
        bot, running: true, memory: {}, bestItem: names => names.map(name => [axe, pick].find(item => item.name === name)).find(Boolean),
        log: { info() {} }, async gotoWithTimeout(goal) { bot.entity.position = new Vec3(goal.x, goal.y, goal.z) }
    }
    await mineTunnel(c, 64)
    assert.deepEqual(dug.slice(0, 2), [['oak_planks', 'stone_axe'], ['stone', 'iron_pickaxe']])
})

test('a stalled prepared stair can use a short checked jump and releases controls afterward', async () => {
    const { climbStep } = require('../src/progression-skills')
    const target = new Vec3(1, 65, 0)
    let jumping = false
    let jumped = false
    let cleared = false
    const bot = {
        health: 20, entity: { position: new Vec3(0.5, 64, 0.5) },
        blockAt: p => ({ name: p.y === 64 ? 'stone' : 'air', boundingBox: p.y === 64 ? 'block' : 'empty' }),
        pathfinder: { setGoal() {} }, lookAt: async () => {},
        setControlState(name, value) {
            if (name === 'jump') {
                jumping = value
            }
            if (name === 'forward' && jumping && value) {
                bot.entity.position = target.offset(0.5, 0, 0.5)
                jumped = true
            }
        },
        clearControlStates() { cleared = true }
    }
    const c = { bot, running: true, paused: false, actionAbort: new AbortController(),
        log: { warn() {} }, gotoWithTimeout: async () => { throw new Error('simulated pathfinder stall') } }
    await climbStep(c, target)
    assert.equal(jumped, true)
    assert.equal(cleared, true)
    bot.entity.position = new Vec3(0.5, 64, 0.5)
    bot.blockAt = () => ({ name: 'water', boundingBox: 'empty' })
    await assert.rejects(climbStep(c, target), /simulated pathfinder stall/)
})

test('without any pickaxe the bot can still hand-dig a staircase upward but not downward', async () => {
    const { mineTunnel } = require('../src/progression-skills')
    for (const [targetY, ok] of [[68, true], [60, false]]) {
        const air = new Set()
        let equips = 0
        const bot = {
            health: 20, entity: { position: new Vec3(0, 64, 0) },
            blockAt(p) {
                const empty = air.has(p.toString())
                return { name: empty ? 'air' : 'stone', position: p, boundingBox: empty ? 'empty' : 'block', diggable: true, canHarvest: () => false }
            },
            equip: async () => { equips++ }, canDigBlock: () => true,
            async dig(block) { air.add(block.position.toString()) }
        }
        const controller = {
            bot, running: true, paused: false, actionAbort: new AbortController(), memory: {},
            bestItem: () => undefined, log: { info() {} },
            async gotoWithTimeout(goal) { bot.entity.position = new Vec3(goal.x, goal.y, goal.z) }
        }
        if (ok) {
            await mineTunnel(controller, targetY, new Vec3(10, targetY, 0))
            assert.equal(bot.entity.position.y, 68)
            assert.equal(equips, 0)
        } else {
            await assert.rejects(mineTunnel(controller, targetY), /requires a pickaxe/)
        }
    }
})

test('tunnel digging prefers an iron pick even when the stone and wooden picks remain', () => {
    const { miningPickaxe } = require('../src/progression-skills')
    const held = ['wooden_pickaxe', 'iron_pickaxe']
    const c = { bestItem: names => held.includes(names[0]) ? { name: names[0], type: 1 } : null }
    assert.equal(miningPickaxe(c).name, 'iron_pickaxe')
    held.push('stone_pickaxe')
    assert.equal(miningPickaxe(c).name, 'iron_pickaxe')
})

test('losing the iron pick mid-tunnel stops digging so the planner can recover', async () => {
    const { mineTunnel } = require('../src/progression-skills')
    const start = new Vec3(0, 64, 0)
    const pickaxes = ['iron_pickaxe', 'stone_pickaxe']
    const bot = {
        health: 20, entity: { position: start }, blockAt: world().blockAt,
        equip: async () => {}, canDigBlock: () => true,
        async dig() { digs++; if (digs === 1) { pickaxes.shift() } }
    }
    let digs = 0
    const c = {
        bot, running: true, memory: {}, log: { info() {} },
        bestItem: names => names.find(name => pickaxes.includes(name)) ? { name: names[0], type: 1 } : null,
        async gotoWithTimeout(goal) { bot.entity.position = new Vec3(goal.x, goal.y, goal.z) }
    }
    await mineTunnel(c, 60)
    assert.equal(digs, 1)
    assert.deepEqual(bot.entity.position, start)
})

test('after entering the Nether the bot steps out of the arrival portal and walks back in', async () => {
    const { performProgression } = require('../src/progression-skills')
    const portalAt = new Vec3(0, 64, 0)
    const visits = []
    const c = {
        running: true, paused: false, actionAbort: new AbortController(), log: { info() {} },
        findNearestBlock: () => ({ name: 'nether_portal', position: portalAt }),
        bot: {
            health: 20, game: { dimension: 'the_nether' }, entity: { position: new Vec3(0.5, 64, 0.5) },
            blockAt: p => ({ name: p.equals(portalAt) || p.equals(portalAt.offset(0, 1, 0)) ? 'nether_portal' : p.y < 64 ? 'netherrack' : 'air',
                position: p, boundingBox: p.y < 64 ? 'block' : 'empty' }),
            waitForTicks: async () => {}
        },
        async gotoWithTimeout(goal, ms, label) {
            visits.push(label)
            c.bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5)
            if (label === 'portal return') {
                c.bot.game.dimension = 'overworld'
            }
        }
    }
    await performProgression(c, 'leave_nether', {})
    assert.deepEqual(visits, ['portal exit', 'portal return'])
    assert.equal(c.bot.game.dimension, 'overworld')
})
