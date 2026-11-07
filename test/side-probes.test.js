'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const mcData = require('minecraft-data')('26.1')
const { probeTunnelSides, mineTunnel } = require('../src/progression-skills')
const { SurvivalController } = require('../src/survival-bot')
const { loadConfig } = require('../src/config')

function miningWorld(overrides = new Map()) {
    const air = new Set(['(0, 64, 0)', '(0, 65, 0)'])
    const dug = []
    const controls = {}
    let heading = new Vec3(0, 0, 0)
    const bot = {
        health: 20,
        entity: { position: new Vec3(0.5, 64, 0.5), eyeHeight: 1.62, yaw: -Math.PI / 2, pitch: 0 },
        game: { dimension: 'overworld' },
        world: {
            raycast(eye, dir, range) {
                for (let t = 0; t <= range; t += 0.01) {
                    const intersect = eye.plus(dir.scaled(t))
                    if (bot.blockAt(intersect.floored()).boundingBox === 'block') {
                        return { intersect }
                    }
                }
                return null
            }
        },
        blockAt(p) {
            const name = overrides.get(p.toString()) || (air.has(p.toString()) ? 'air' : 'stone')
            return { name, position: p, boundingBox: name === 'air' ? 'empty' : 'block', diggable: true, canHarvest: () => true }
        },
        canDigBlock: block => bot.entity.position.offset(0, 1.65, 0).distanceTo(block.position.offset(0.5, 0.5, 0.5)) <= 5.1,
        canSeeBlock: () => true, equip: async () => {},
        async look(yaw, pitch) {
            Object.assign(bot.entity, { yaw, pitch })
        },
        async lookAt(target) {
            const delta = target.minus(bot.entity.position.offset(0, bot.entity.eyeHeight, 0))
            await bot.look(Math.atan2(-delta.x, -delta.z), Math.atan2(delta.y, Math.hypot(delta.x, delta.z)))
            heading = new Vec3(delta.x, 0, delta.z).normalize()
        },
        setControlState(key, value) { controls[key] = value },
        async waitForTicks() {
            if (controls.forward && controls.sneak) {
                bot.entity.position.add(heading.scaled(0.06))
            }
        },
        async dig(block, force, face) {
            if (face) {
                const target = block.position.offset(0.5, 0.5, 0.5).plus(face.scaled(0.5))
                assert.ok(bot.entity.position.offset(0, 1.62, 0).distanceTo(target) <= 4.5)
            }
            dug.push(block.position)
            air.add(block.position.toString())
        }
    }
    return {
        bot, dug, memory: {}, running: true, paused: false, actionAbort: new AbortController(), probeSpacing: 8,
        bestItem: () => ({ name: 'iron_pickaxe' }), log: { info() {}, debug() {}, warn() {} },
        async gotoWithTimeout(goal) {
            bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5)
        }
    }
}

test('probes reach five blocks on both sides while staying in the tunnel cell', async () => {
    const c = miningWorld()
    const anchor = c.bot.entity.position.clone()
    const result = await probeTunnelSides(c, 0)
    assert.equal(result.dug, 10)
    assert.equal(result.foundOre, false)
    assert.deepEqual(c.bot.entity.position.floored(), anchor.floored())
    assert.equal(c.dug.every(p => p.x === 0 && p.y === 65 && Math.abs(p.z) <= 5), true)
    assert.equal(c.dug.some(p => p.z === -5), true)
    assert.equal(c.dug.some(p => p.z === 5), true)
})

test('a liquid or falling-block neighbor stops that probe before opening the hazard', async () => {
    for (const hazard of ['lava', 'water', 'gravel', 'sand']) {
        const c = miningWorld(new Map([[new Vec3(0, 65, 3).toString(), hazard]]))
        await probeTunnelSides(c, 0)
        assert.equal(c.dug.some(p => p.z >= 2), false)
        assert.equal(c.dug.filter(p => p.z < 0).length, 5)
    }
})

test('exposed ore is left for the harvesting skill and stops further probing on that side', async () => {
    const c = miningWorld(new Map([[new Vec3(0, 65, 3).toString(), 'iron_ore']]))
    const result = await probeTunnelSides(c, 0)
    assert.equal(result.foundOre, true)
    assert.equal(c.dug.some(p => p.z >= 3), false)
})

test('two four-block tunnel actions trigger one pair of probes at spacing eight', async () => {
    const c = miningWorld()
    await mineTunnel(c, 64)
    assert.equal(c.memory.probeMinedBlocks || 0, 0)
    await mineTunnel(c, 64)
    assert.equal(c.memory.probeMinedBlocks, 10)
    assert.equal(c.memory.probeSteps, 0)
    assert.equal(c.bot.entity.position.x, 8.5)
})

test('default side probes leave four main-tunnel blocks between successive branches', async () => {
    const c = miningWorld()
    c.probeSpacing = loadConfig().probeSpacing
    for (let i = 0; i < 3; i++) {
        await mineTunnel(c, 64)
    }
    const branches = [...new Set(c.dug.filter(p => p.z !== 0).map(p => p.x))]
    assert.deepEqual(branches, [5, 10])
    assert.equal(branches[1] - branches[0] - 1, 4)
    assert.equal(c.dug.filter(p => p.z !== 0).length, 20)
})

test('an old passage around a 6x7 area cannot make the tunnel spiral through its interior', async () => {
    const openings = new Map()
    const visited = new Set()
    for (let x = 0; x <= 7; x++) {
        for (let z = 0; z <= 8; z++) {
            if (x === 0 || x === 7 || z === 0 || z === 8) {
                const p = new Vec3(x, 64, z)
                visited.add(`overworld:${p}`)
                openings.set(p.toString(), 'air')
                openings.set(p.offset(0, 1, 0).toString(), 'air')
            }
        }
    }
    const c = miningWorld(openings)
    c.bot.entity.position = new Vec3(1.5, 64, 1.5)
    c.memory.minedCells = visited
    c.probeSpacing = 0
    for (let i = 0; i < 10; i++) {
        await mineTunnel(c, 64)
    }
    assert.equal(c.bot.entity.position.x, 41.5)
    assert.equal(c.bot.entity.position.z, 1.5)
    assert.equal(c.dug.every(p => p.z === 1), true)
})

test('a head-height probe opening does not turn the main tunnel', async () => {
    const p = new Vec3(1, 65, 0)
    const c = miningWorld(new Map([[p.toString(), 'air']]))
    c.memory.excavatedCells = new Set([`overworld:${p}`])
    c.probeSpacing = 0
    await mineTunnel(c, 64)
    assert.deepEqual(c.bot.entity.position, new Vec3(4.5, 64, 0.5))
})

test('after an ore detour the bot walks to the frontier without digging, then resumes its heading', async () => {
    const c = miningWorld()
    c.probeSpacing = 0
    c.bot.registry = mcData
    c.movements = { canDig: true }
    let movements = c.movements
    c.bot.pathfinder = { setMovements: m => { movements = m } }
    await mineTunnel(c, 64)
    const frontier = c.bot.entity.position.clone()
    c.bot.entity.position = new Vec3(3.5, 63, 2.5)
    let returned = false
    const move = c.gotoWithTimeout
    c.gotoWithTimeout = async (goal, timeout, label) => {
        if (!returned) {
            assert.equal(movements.canDig, false)
            assert.deepEqual(new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5), frontier)
            returned = true
        }
        await move(goal)
    }
    await mineTunnel(c, 64)
    assert.equal(returned, true)
    assert.equal(movements, c.movements)
    assert.deepEqual(c.bot.entity.position, new Vec3(8.5, 64, 0.5))
})

test('a local obstacle detour keeps the original main-tunnel heading on subsequent steps', async () => {
    const c = miningWorld(new Map([[new Vec3(1, 64, 0).toString(), 'furnace']]))
    c.probeSpacing = 0
    await mineTunnel(c, 64)
    await mineTunnel(c, 64)
    assert.deepEqual(c.bot.entity.position, new Vec3(7.5, 64, 1.5))
})

test('a frontier is scoped to its dimension and mining depth and ignored after distant travel', async () => {
    for (const change of ['dimension', 'depth', 'distance']) {
        const c = miningWorld()
        c.probeSpacing = 0
        await mineTunnel(c, 64)
        c.bot.entity.position = new Vec3(change === 'distance' ? 100.5 : 1.5, 64, 1.5)
        if (change === 'dimension') {
            c.bot.game.dimension = 'the_nether'
        }
        const depth = change === 'depth' ? 60 : 64
        await mineTunnel(c, depth)
        assert.equal(c.memory.tunnelFrontier?.dimension, c.bot.game.dimension)
        assert.equal(c.memory.tunnelFrontier?.targetY, depth)
        assert.equal(c.bot.entity.position.z, 1.5)
        assert.equal(c.bot.entity.position.x, change === 'distance' ? 104.5 : 5.5)
    }
})

test('a failed frontier return restores mining movements and never carves a replacement route', async () => {
    const c = miningWorld()
    c.probeSpacing = 0
    c.bot.registry = mcData
    c.movements = { canDig: true }
    let movements = c.movements
    c.bot.pathfinder = { setMovements: m => { movements = m } }
    await mineTunnel(c, 64)
    c.bot.entity.position = new Vec3(3.5, 64, 1.5)
    const dug = c.dug.length
    c.gotoWithTimeout = async () => { throw new Error('No path to tunnel frontier') }
    await assert.rejects(mineTunnel(c, 64), /No path to tunnel frontier/)
    assert.equal(movements, c.movements)
    assert.equal(c.dug.length, dug)
    assert.equal(c.memory.tunnelFrontier, null)
})

test('cancellation during equip cannot start a frontier return', async () => {
    const c = miningWorld()
    c.probeSpacing = 0
    c.bot.registry = mcData
    await mineTunnel(c, 64)
    c.bot.entity.position = new Vec3(3.5, 64, 1.5)
    c.bot.equip = async () => c.actionAbort.abort()
    c.bot.pathfinder = { setMovements: () => assert.fail('started returning after cancellation') }
    await assert.rejects(mineTunnel(c, 64), /action cancelled/)
})

test('tunneling yields for newly exposed diamond ore before advancing past it', async () => {
    const ore = new Vec3(1, 65, 1)
    const c = miningWorld(new Map([[ore.toString(), 'deepslate_diamond_ore']]))
    c.bot.inventory = { items: () => [{ name: 'iron_pickaxe', type: 1 }] }
    c.findNearestBlock = (matches, range, { filter, sight }) => {
        const block = c.bot.blockAt(ore)
        return matches(block.name) && filter(block) && sight(block) ? block : null
    }
    await mineTunnel(c, 64)
    assert.deepEqual(c.dug, [new Vec3(1, 65, 0)])
    assert.equal(c.bot.entity.position.x, 0.5)
})

test('mining one diamond reveals its face-adjacent vein even while the bot faces away', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const first = new Vec3(1, 65, 0)
    const next = new Vec3(1, 65, 1)
    const unrelated = new Vec3(0, 65, -1)
    const c = miningWorld(new Map([first, next, unrelated].map(p => [p.toString(), 'deepslate_diamond_ore'])))
    c.mcData = mcData
    c.bot.registry = mcData
    c.bot.heldItem = { name: 'iron_pickaxe', type: 1 }
    c.bot.inventory = { items: () => [c.bot.heldItem] }
    c.bot.tool = { equipForBlock: async () => {} }
    c.movements = { safeToBreak: () => true }
    c.checkAction = () => {}
    c.isBlockedTarget = () => false
    c.visibleDrops = () => []
    c.findNearestBlock = SurvivalController.prototype.findNearestBlock
    c.bot.findBlock = ({ matching, useExtraInfo }) => [first, next, unrelated].map(p => c.bot.blockAt(p))
        .find(b => matching.includes(mcData.blocksByName[b.name].id) && useExtraInfo(b)) || null
    const blockAt = c.bot.blockAt
    let sealed = false
    c.bot.blockAt = p => {
        const block = blockAt(p)
        block.type = mcData.blocksByName[block.name].id
        if (sealed && p.equals(first)) {
            return { ...block, name: 'deepslate', type: mcData.blocksByName.deepslate.id }
        }
        return c.dug.some(dug => dug.equals(p)) ? { ...block, name: 'air', boundingBox: 'empty', type: 0 } : block
    }
    const { findPriorityDiamond } = require('../src/cave-exploration')
    assert.deepEqual(findPriorityDiamond(c)?.position, first)
    SurvivalController.prototype.configureDigging.call(c)
    await c.bot.dig(c.bot.blockAt(first), true)
    await c.bot.look(Math.PI / 2, 0)
    sealed = true
    assert.equal(findPriorityDiamond(c), null)
    sealed = false
    c.bot.game.dimension = 'the_nether'
    assert.equal(findPriorityDiamond(c), null)
    c.bot.game.dimension = 'overworld'
    const target = findPriorityDiamond(c)
    assert.deepEqual(target?.position, next)
    const mining = SurvivalController.prototype.collectTarget.call(c, target, target, 'priority diamond')
    for (let i = 0; i < 12; i++) {
        await Promise.resolve()
        t.mock.timers.tick(600)
    }
    await mining
    assert.deepEqual(c.dug, [first, next])
    assert.equal(findPriorityDiamond(c), null)
})

test('the iron skill descends toward its normal depth when loaded iron is behind stone', async () => {
    const hidden = new Vec3(0, 64, -4)
    const c = miningWorld(new Map([[hidden.toString(), 'iron_ore']]))
    c.mcData = mcData
    c.observe = () => ({ dimension: 'overworld', health: 12 })
    c.checkAction = () => {}
    c.isBlockedTarget = () => false
    c.findNearestBlock = SurvivalController.prototype.findNearestBlock
    c.bot.canSeeBlock = () => false
    c.bot.findBlock = ({ matching, useExtraInfo }) => {
        const block = c.bot.blockAt(hidden)
        return matching.includes(mcData.blocksByName[block.name].id) && useExtraInfo(block) ? block : null
    }
    await SurvivalController.prototype.gatherOre.call(c, ['iron_ore'], 16)
    assert.equal(c.bot.entity.position.y, 60)
})

test('a mixed tunnel uses the stone shovel on dirt and grass blocks and the pick on stone', async () => {
    const c = miningWorld(new Map([['(1, 65, 0)', 'dirt'], ['(1, 64, 0)', 'grass_block']]))
    const tools = ['stone_shovel', 'iron_pickaxe'].map(name => mcData.itemsByName[name])
    c.bestItem = names => names.map(name => tools.find(item => item.name === name)).find(Boolean)
    const blockAt = c.bot.blockAt
    c.bot.blockAt = p => {
        const block = blockAt(p)
        block.material = mcData.blocksByName[block.name].material
        return block
    }
    c.bot.equip = async item => { c.bot.heldItem = item }
    const digs = []
    const dig = c.bot.dig
    c.bot.dig = async block => {
        digs.push([block.name, c.bot.heldItem.name])
        await dig(block)
    }
    await mineTunnel(c, 64)
    assert.deepEqual(digs.slice(0, 3), [['dirt', 'stone_shovel'], ['grass_block', 'stone_shovel'], ['stone', 'iron_pickaxe']])
})

test('pausing during a probe prevents subsequent digs', async () => {
    const c = miningWorld()
    const dig = c.bot.dig
    c.bot.dig = async block => {
        await dig(block)
        c.actionAbort.abort()
    }
    await assert.rejects(probeTunnelSides(c, 0), /cancelled/)
    assert.equal(c.dug.length, 1)
})
