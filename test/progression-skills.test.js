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

test('a carried lava bucket is poured and cooled from above, and both water buckets are retained', async () => {
    const { performProgression } = require('../src/progression-skills')
    const inventory = { water_bucket: 2, lava_bucket: 1 }
    const blocks = new Map()
    const basin = new Vec3(1, 62, 0)
    const upper = basin.offset(0, 1, 0)
    const used = []
    let held
    let aim
    const bot = {
        health: 20, game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, 64, 0.5) },
        inventory: { items: () => Object.entries(inventory).filter(([, count]) => count).map(([name, count]) => ({ name, count })) },
        blockAt(position) {
            const name = blocks.get(position.toString()) ?? (position.y < 64 ? 'stone' : 'air')
            return { position, name, boundingBox: name === 'stone' || name === 'obsidian' ? 'block' : 'empty',
                getProperties: () => ({ level: 0 }) }
        },
        canDigBlock: () => true,
        tool: { equipForBlock: async () => {} },
        async dig(block) { blocks.set(block.position.toString(), 'air') },
        async equip(item) { held = item.name },
        async lookAt(target) { aim = target },
        async waitForTicks() {},
        activateItem() {
            used.push(held)
            inventory[held]--
            if (held === 'lava_bucket') {
                assert.equal(bot.blockAt(basin).name, 'air')
                assert.equal(aim.y < basin.y, true)
                blocks.set(basin.toString(), 'lava')
            } else if (held === 'water_bucket') {
                assert.equal(bot.blockAt(basin).name, 'lava')
                assert.equal(aim.y > basin.y + 1, true)
                blocks.set(basin.toString(), 'obsidian')
                blocks.set(upper.toString(), 'water')
            } else {
                assert.equal(bot.blockAt(upper).name, 'water')
                inventory.water_bucket++
                blocks.set(upper.toString(), 'air')
                return
            }
            inventory.bucket = (inventory.bucket || 0) + 1
        },
        deactivateItem() {}
    }
    const c = {
        bot, running: true, paused: false, memory: {}, log: { info() {} }, movements: { safeToBreak: () => true },
        isEmptyPlacementBlock: block => block?.name === 'air',
        countItems: names => names.reduce((sum, name) => sum + (inventory[name] || 0), 0),
        hasItem: name => inventory[name] > 0,
        findNearestBlock: () => null,
        async collectTarget(block) { assert.equal(block.name, 'obsidian'); assert.deepEqual(block.position, basin) },
        scout: async () => assert.fail('scouted with a contained adjacent casting site')
    }
    await performProgression(c, 'gather_obsidian', {})
    assert.deepEqual(used, ['lava_bucket', 'water_bucket', 'bucket'])
    assert.equal(inventory.water_bucket, 2)
    assert.equal(inventory.lava_bucket, 0)
    assert.equal(c.memory.obsidianCast, undefined)
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
            game: { dimension: 'overworld' },
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
        health: 20, game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, 64, 0.5) },
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
        health: 20, game: { dimension: 'overworld' }, entity: { position: new Vec3(0, 64, 0) },
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

test('a missing pickaxe prevents carving stairs in either direction', async () => {
    const { mineTunnel } = require('../src/progression-skills')
    const c = {
        running: true, memory: {}, bestItem: () => undefined, log: { info() {} },
        bot: {
            health: 20, entity: { position: new Vec3(0, 64, 0) },
            blockAt: world().blockAt, canDigBlock: () => true,
            async dig() { assert.fail('dug stone with bare hands') }
        }
    }
    for (const targetY of [68, 60]) {
        await assert.rejects(mineTunnel(c, targetY), /requires a pickaxe/)
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
        health: 20, game: { dimension: 'overworld' }, entity: { position: start }, blockAt: world().blockAt,
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

test('lava for a cast is scooped only with an empty bucket, never a suffix-matched water bucket', async () => {
    const { performProgression } = require('../src/progression-skills')
    const { SurvivalController } = require('../src/survival-bot')
    const inventory = { water_bucket: 2 }
    const lava = { name: 'lava', position: new Vec3(2, 63, 0), getProperties: () => ({ level: 0 }) }
    const equipped = []
    const bot = {
        health: 20, game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, 64, 0.5) },
        inventory: { items: () => Object.entries(inventory).filter(([, count]) => count).map(([name, count]) => ({ name, count })) },
        blockAt: () => null,
        async equip(item) { equipped.push(item?.name) },
        async lookAt() {},
        activateItem: () => assert.fail('activated a bucket with no empty bucket carried'),
        deactivateItem() {}
    }
    const c = {
        bot, running: true, paused: false, memory: { waterPool: { dimension: 'overworld' } }, log: { info() {} },
        movements: { safeToBreak: () => true },
        countItems: names => names.reduce((sum, name) => sum + (inventory[name] || 0), 0),
        hasItem: name => inventory[name] > 0,
        bestItem: names => SurvivalController.prototype.bestItem.call({ bot }, names),
        findNearestBlock: matcher => matcher('lava') ? lava : null,
        gotoWithTimeout: async () => {}
    }
    await assert.rejects(performProgression(c, 'gather_obsidian', {}), /empty bucket/)
    assert.deepEqual(equipped, [])
})

test('a lava source that cannot be scooped is quarantined, but a cancelled trip is not', async () => {
    const { performProgression } = require('../src/progression-skills')
    const lava = { name: 'lava', position: new Vec3(3, 63, 0), getProperties: () => ({ level: 0 }) }
    for (const cancel of [false, true]) {
        const inventory = { bucket: 1 }
        const blocked = []
        const c = {
            bot: {
                health: 20, game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, 64, 0.5) },
                inventory: { items: () => Object.entries(inventory).filter(([, n]) => n).map(([name, count]) => ({ name, count })) }
            },
            running: true, paused: false, actionAbort: new AbortController(), log: { info() {}, warn() {} },
            hasItem: name => inventory[name] > 0,
            findNearestBlock: matcher => matcher('lava') ? lava : null,
            async gotoWithTimeout() {
                if (cancel) {
                    c.actionAbort.abort()
                }
                throw new Error('lava approach timed out after 12s')
            },
            rememberBlockedTarget: block => blocked.push(block)
        }
        await assert.rejects(performProgression(c, 'fill_lava_bucket', {}), /lava approach/)
        assert.deepEqual(blocked, cancel ? [] : [lava])
    }
})

test('portal construction stands beside the frame plane, never inside a frame cell', async () => {
    const { performProgression, portalFrame } = require('../src/progression-skills')
    const origin = new Vec3(0, 64, 0)
    const blocks = new Map()
    const inventory = { obsidian: 10, cobblestone: 3, flint_and_steel: 1 }
    const bot = {
        health: 20, game: { dimension: 'overworld' }, entity: { position: origin.offset(1.5, 0, 0.5), yaw: 0, pitch: 0 },
        async look() {},
        async waitForTicks() {},
        blockAt(p) {
            const name = blocks.get(p.toString()) ?? (p.y < 64 ? 'stone' : 'air')
            return { position: p, name, boundingBox: ['air', 'fire', 'nether_portal'].includes(name) ? 'empty' : 'block' }
        },
        async equip() {},
        async placeBlock(ref, face) {
            const target = ref.position.plus(face)
            const feet = bot.entity.position.floored()
            assert.equal(target.equals(feet) || target.equals(feet.offset(0, 1, 0)), false, `placed into the bot at ${target}`)
            const name = held
            inventory[name]--
            blocks.set(target.toString(), name)
        },
        async activateBlock(block) {
            assert.equal(block.position.equals(origin.offset(1, 0, 0)), true)
            for (const y of [1, 2, 3]) {
                blocks.set(origin.offset(1, y, 0).toString(), 'nether_portal')
                blocks.set(origin.offset(2, y, 0).toString(), 'nether_portal')
            }
        }
    }
    let held
    const stands = []
    const c = {
        bot, running: true, paused: false, memory: { portalOrigin: { x: 0, y: 64, z: 0 } }, log: { info() {} },
        advancements: { completed: new Set() }, checkAction() {},
        isEmptyPlacementBlock: block => ['air', 'fire'].includes(block?.name),
        bestItem: names => { held = names[0]; return inventory[held] > 0 ? { name: held } : null },
        findNearestBlock: () => null,
        async gotoWithTimeout(goal, ms, label) {
            if (label === 'portal entry') {
                bot.game.dimension = 'the_nether'
                return
            }
            stands.push(new Vec3(goal.x, goal.y, goal.z))
            bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5)
        }
    }
    await performProgression(c, 'enter_nether', {})
    assert.equal(portalFrame(origin).every(p => blocks.get(p.toString()) === 'obsidian'), true)
    assert.ok(stands.length > 0)
    assert.equal(stands.every(p => p.z === 1 && p.y === 64 && p.x >= 0 && p.x <= 3), true)
    assert.equal(bot.game.dimension, 'the_nether')
})

test('a return trip resumes the remembered stairs at the nearest cell, not a stale deeper waypoint', async () => {
    const { performProgression } = require('../src/progression-skills')
    const route = [{ x: 0, y: 63, z: 0 }, { x: 1, y: 62, z: 1 }, { x: 2, y: 61, z: 2 }, { x: 20, y: 50, z: 20 }]
    const bot = { health: 20, entity: { position: new Vec3(2.5, 61, 2.5) }, blockAt: () => ({ name: 'air', boundingBox: 'empty' }) }
    const visited = []
    const c = {
        bot, running: true, paused: false, home: { y: 64 }, memory: { mineRoute: route }, log: { info() {}, warn() {} },
        async gotoWithTimeout(goal) {
            const target = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5)
            if (bot.entity.position.distanceTo(target) > 3) {
                throw new Error('return staircase timed out after 8s')
            }
            visited.push(`${goal.x},${goal.y},${goal.z}`)
            bot.entity.position = target
        }
    }
    await performProgression(c, 'return_surface', {})
    assert.deepEqual(visited, ['2,61,2', '1,62,1', '0,63,0'])
    assert.equal(c.memory.surfaceByStaircase, false)
})

test('reaching the home level inside a hill keeps climbing until the sky is open', async () => {
    const { performProgression } = require('../src/progression-skills')
    for (const [roof, expectClimb] of [[74, true], [null, false]]) {
        const bot = {
            health: 20, game: { dimension: 'overworld' }, entity: { position: new Vec3(-33.5, 70, -32.5) },
            blockAt: p => ({ name: p.y === roof ? 'stone' : 'air', boundingBox: p.y === roof ? 'block' : 'empty' })
        }
        const c = { bot, running: true, paused: false, home: { y: 69 }, memory: {}, log: { info() {}, warn() {} }, bestItem: () => null,
            gotoWithTimeout: async () => { throw new Error('No path to the goal!') } }
        const run = performProgression(c, 'return_surface', {})
        if (expectClimb) {
            await assert.rejects(run, /No path to the goal/)
        } else {
            await run
        }
    }
})

test('a shallow return finishes at open ground below the home plateau', async () => {
    const { performProgression } = require('../src/progression-skills')
    const bot = { health: 20, entity: { position: new Vec3(-63.5, 85, 22.5) },
        blockAt: () => ({ name: 'air', boundingBox: 'empty' }) }
    const c = { bot, home: { y: 119 }, memory: {}, bestItem: () => null,
        async gotoWithTimeout() { assert.fail('already out on the lower surface') } }
    await performProgression(c, 'return_surface', { departureSurfaceY: 86 })
    assert.equal(c.memory.surfaceByStaircase, false)
})

test('a pickaxe-free bot below the surface walks up toward the home level instead of failing at once', async () => {
    const { performProgression } = require('../src/progression-skills')
    const bot = { health: 20, game: { dimension: 'overworld' }, entity: { position: new Vec3(6.5, 65, 3.5) },
        blockAt: p => ({ name: p.y === 67 ? 'oak_planks' : 'air', boundingBox: p.y === 67 ? 'block' : 'empty' }) }
    let goal
    const c = { bot, running: true, paused: false, home: { y: 69 }, memory: {}, log: { info() {}, warn() {} }, bestItem: () => null,
        async gotoWithTimeout(g) { goal = g; bot.entity.position = new Vec3(9.5, 68, 3.5) } }
    await performProgression(c, 'return_surface', {})
    assert.equal(goal.isEnd({ y: 68 }), true)
    assert.equal(goal.isEnd({ y: 66 }), false)
    assert.equal(goal.heuristic({ y: 60 }), 8)
})

test('lava with no walking path is tunneled toward before the source is quarantined', async () => {
    const { performProgression } = require('../src/progression-skills')
    const lava = { name: 'lava', position: new Vec3(20, -55, 0), getProperties: () => ({ level: 0 }) }
    const blocked = []
    const c = {
        bot: {
            health: 20, game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, -54, 0.5) },
            inventory: { items: () => [{ name: 'bucket', count: 1 }] }
        },
        running: true, paused: false, actionAbort: new AbortController(), memory: {}, log: { info() {}, warn() {} },
        hasItem: name => name === 'bucket', bestItem: () => null,
        findNearestBlock: matcher => matcher('lava') ? lava : null,
        async gotoWithTimeout() {
            c.bot.pathfinder.goal = 'stale'
            throw new Error('No path to the goal!')
        },
        rememberBlockedTarget: block => blocked.push(block)
    }
    let goalAtTunnel
    c.bot.pathfinder = { goal: null, setGoal(goal) { this.goal = goal } }
    c.bot.waitForTicks = async () => { goalAtTunnel = c.bot.pathfinder.goal }
    // With no pickaxe in the fixture, reaching mineTunnel shows the tunnel branch was taken.
    await assert.rejects(performProgression(c, 'fill_lava_bucket', {}), /mining requires a pickaxe/)
    assert.equal(c.memory.lavaTunnels[`${lava.position}`], 1)
    assert.equal(goalAtTunnel, null)
    c.memory.lavaTunnels[`${lava.position}`] = 4
    await assert.rejects(performProgression(c, 'fill_lava_bucket', {}), /No path/)
})

test('when water above blocks every rising step, the tunnel takes a level side step instead of stalling', async () => {
    const { mineTunnel } = require('../src/progression-skills')
    const air = new Set(['0,64,0', '0,65,0'])
    const water = new Vec3(0, 68, 0)
    const bot = {
        health: 20, game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, 64, 0.5) },
        blockAt(p) {
            const name = p.equals(water) ? 'water' : air.has(`${p.x},${p.y},${p.z}`) ? 'air' : 'stone'
            return { name, position: p, boundingBox: name === 'stone' ? 'block' : 'empty', diggable: true, canHarvest: () => true }
        },
        equip: async () => {}, canDigBlock: () => true,
        async dig(block) { air.add(`${block.position.x},${block.position.y},${block.position.z}`) }
    }
    const steps = []
    const c = {
        bot, running: true, paused: false, actionAbort: new AbortController(), memory: {}, log: { info() {}, warn() {} },
        bestItem: names => names.includes('iron_pickaxe') ? { name: 'iron_pickaxe' } : null,
        async gotoWithTimeout(goal) { steps.push(goal.y); throw new Error('stop after one step') },
        rememberBlockedTarget() {}
    }
    await assert.rejects(mineTunnel(c, 69), /stop after one step/)
    assert.deepEqual(steps, [64])
})

test('a level tunnel blocked by liquid on every side climbs one step around it', async () => {
    const { mineTunnel } = require('../src/progression-skills')
    const air = new Set(['0,64,0', '0,65,0'])
    const water = [new Vec3(2, 64, 0), new Vec3(-2, 64, 0), new Vec3(0, 64, 2), new Vec3(0, 64, -2)]
    const bot = {
        health: 20, entity: { position: new Vec3(0.5, 64, 0.5) },
        blockAt(p) {
            const name = water.some(w => w.equals(p)) ? 'water' : air.has(`${p.x},${p.y},${p.z}`) ? 'air' : 'stone'
            return { name, position: p, boundingBox: name === 'stone' ? 'block' : 'empty', diggable: true, canHarvest: () => true }
        },
        equip: async () => {}, canDigBlock: () => true,
        async dig(block) { air.add(`${block.position.x},${block.position.y},${block.position.z}`) }
    }
    const steps = []
    const c = {
        bot, running: true, paused: false, actionAbort: new AbortController(), memory: {}, log: { info() {}, warn() {} },
        bestItem: names => names.includes('iron_pickaxe') ? { name: 'iron_pickaxe' } : null,
        async gotoWithTimeout(goal) { steps.push(goal.y); throw new Error('stop after one step') },
        rememberBlockedTarget() {}
    }
    // The rising step goes through climbStep, which this fixture cannot complete; any error but
    // the stall means a step was chosen.
    await assert.rejects(mineTunnel(c, 64), error => !/no supported dry tunnel step/.test(error.message))
})

test('a cave spring with no dry bank is filled from within bucket reach', async () => {
    const { performProgression } = require('../src/progression-skills')
    const spring = new Vec3(3, 66, 0)
    const inventory = { bucket: 1, water_bucket: 1 }
    let held
    const bot = {
        health: 20, game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, 64, 0.5) },
        inventory: { items: () => Object.entries(inventory).filter(([, n]) => n).map(([name, count]) => ({ name, count })) },
        blockAt: p => p.equals(spring) ? { name: 'water', position: p, boundingBox: 'empty', getProperties: () => ({ level: 0 }) } :
            { name: 'stone', position: p, boundingBox: 'block', getProperties: () => ({}) },
        async equip(item) { held = item.name },
        async lookAt() {}, async waitForTicks() {},
        activateItem() {
            if (held === 'bucket') {
                inventory.bucket--
                inventory.water_bucket++
            }
        },
        deactivateItem() {}
    }
    const c = {
        bot, running: true, paused: false, memory: {}, log: { info() {}, warn() {} },
        countItems: names => names.reduce((n, name) => n + (inventory[name] || 0), 0),
        hasItem: name => inventory[name] > 0,
        isEmptyPlacementBlock: block => block?.name === 'air',
        findNearestBlock: matcher => matcher('water') ? bot.blockAt(spring) : null,
        async gotoWithTimeout() { bot.entity.position = new Vec3(1.5, 65, 0.5) },
        rememberBlockedTarget: () => assert.fail('quarantined a reachable spring')
    }
    await performProgression(c, 'fill_water_bucket', {})
    assert.equal(inventory.water_bucket, 2)
    inventory.bucket = 1
    inventory.water_bucket = 1
    bot.entity.position = new Vec3(0.5, 64, 0.5)
    bot.canSeeBlock = () => false
    const quarantined = []
    c.rememberBlockedTarget = block => quarantined.push(block.position)
    await assert.rejects(performProgression(c, 'fill_water_bucket', {}), /not in line of sight/)
    assert.deepEqual(quarantined, [spring])
})
