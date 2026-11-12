'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const Block = require('prismarine-block')('26.1')
const WorldSync = require('prismarine-world/src/worldsync')
const data = require('minecraft-data')('26.1')
const { findPriorityOre, IRON_ORES, miningSight, rememberMiningExposure } = require('../src/cave-exploration')
const { SurvivalController } = require('../src/survival-bot')

// Inspected live cells at 01:59Z around (371,17,270): a 1-high probe corridor at y=17, x=371,
// the bot's cleared head cells, and a diagonal pit left by the two mined ores.
function oreWorld(cells = new Map(), position = new Vec3(371.5, 17, 270.5)) {
    const set = (x, y, z, name) => cells.set(new Vec3(x, y, z).toString(), name)
    const getBlock = p => {
        p = p.floored()
        const b = Block.fromStateId(data.blocksByName[cells.get(p.toString()) || 'stone'].defaultState, 0)
        b.position = p
        return b
    }
    const bot = {
        entity: { position, eyeHeight: 1.62, yaw: 0, pitch: 0 },
        game: { dimension: 'overworld' }, blockAt: getBlock, canSeeBlock: () => false,
        world: { raycast: (...a) => WorldSync.prototype.raycast.call({ getBlock }, ...a) },
        inventory: { items: () => [{ name: 'iron_pickaxe', type: data.itemsByName.iron_pickaxe.id }] }
    }
    const c = { bot, memory: {}, isBlockedTarget: () => false }
    c.findNearestBlock = (match, range, options) => [...cells].filter(([, n]) => n === 'iron_ore')
        .map(([k]) => getBlock(new Vec3(...k.slice(1, -1).split(', ').map(Number))))
        .filter(b => match(b.name) && b.position.distanceTo(bot.entity.position) <= range && options.filter(b) && options.sight(b))
        .sort((a, b) => a.position.distanceTo(bot.entity.position) - b.position.distanceTo(bot.entity.position))[0] || null
    return { c, bot, cells, getBlock, set }
}

function pitWorld() {
    const world = oreWorld()
    const { set } = world
    for (let z = 269; z <= 273; z++) { set(371, 17, z, 'air') }
    for (let z = 269; z <= 271; z++) { set(371, 18, z, 'air') }
    set(372, 17, 269, 'air')
    set(372, 16, 269, 'air')
    for (const [x, y, z] of [[372, 16, 270], [373, 16, 269], [373, 16, 270], [374, 16, 270], [373, 15, 270]]) {
        set(x, y, z, 'iron_ore')
    }
    return world
}

test('ore exposed by our own dig but hidden in a diagonal pit is still targeted', () => {
    const { c } = pitWorld()
    assert.equal(findPriorityOre(c, IRON_ORES), null, 'without dig memory the pit faces are out of sight')
    for (const p of [new Vec3(372, 17, 269), new Vec3(372, 16, 269)]) {
        rememberMiningExposure(c, { name: 'iron_ore', position: p })
    }
    const found = findPriorityOre(c, IRON_ORES)
    assert.ok(found, 'expected a vein ore beside the dug pit')
    assert.ok(['(372, 16, 270)', '(373, 16, 269)'].includes(found.position.toString()))
})

test('dig memory does not reveal an exposed ore farther than six blocks away', () => {
    const { c, bot } = pitWorld()
    for (const p of [new Vec3(372, 17, 269), new Vec3(372, 16, 269)]) {
        rememberMiningExposure(c, { name: 'iron_ore', position: p })
    }
    bot.entity.position = new Vec3(371.5, 17, 277.5)
    assert.equal(findPriorityOre(c, IRON_ORES), null)
})

test('ore selection treats hidden water as unknown and visible water as a hazard', () => {
    const { c, bot, set } = oreWorld(new Map(), new Vec3(0.5, 16, 2.5))
    const target = new Vec3(0, 17, 0)
    set(0, 17, 0, 'iron_ore')
    set(0, 17, -1, 'water')
    for (const z of [1, 2]) {
        set(0, 16, z, 'air')
        set(0, 17, z, 'air')
    }
    assert.ok(miningSight(c, bot.blockAt(target), 4.5))
    assert.deepEqual(findPriorityOre(c, IRON_ORES)?.position, target)
    set(1, 17, 1, 'air')
    set(1, 17, 0, 'water')
    assert.ok(miningSight(c, bot.blockAt(target), 4.5))
    assert.equal(findPriorityOre(c, IRON_ORES), null)
})

test('the bot breaks visible ore in front of concealed water and leaves the newly exposed spill', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const { c, bot, set } = oreWorld(new Map(), new Vec3(0.5, 16, 1.5))
    const target = new Vec3(0, 17, 0)
    set(0, 16, 1, 'air')
    set(0, 17, 1, 'air')
    set(0, 17, 0, 'iron_ore')
    set(0, 17, -1, 'water')
    Object.assign(bot, { health: 20, heldItem: bot.inventory.items()[0], canDigBlock: () => true,
        tool: { equipForBlock: async () => {} }, lookAt: async () => {}, waitForTicks: async () => {},
        async dig() { set(0, 17, 0, 'air') } })
    Object.setPrototypeOf(c, SurvivalController.prototype)
    Object.assign(c, { running: true, log: { info() {} }, movements: { safeToBreak: () => false },
        visibleDrops: () => assert.fail('attempted to collect inside the exposed spill'), rememberBlockedTarget() {} })
    const mining = c.collectTarget(bot.blockAt(target)).then(() => null, error => error)
    for (let i = 0; i < 20; i++) {
        await Promise.resolve()
        t.mock.timers.tick(300)
    }
    assert.equal(await mining, null)
    assert.equal(bot.blockAt(target).name, 'air')
})

test('ore approach centers in a supported cell when its corner blocks the view', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const edge = new Vec3(-1.69, 16, 2.31)
    const { c, bot, set } = oreWorld(new Map(), edge)
    const target = new Vec3(0, 17, 0)
    for (const x of [-2, -1, 0]) {
        for (const z of [0, 1, 2]) {
            set(x, 16, z, 'air')
            set(x, 17, z, 'air')
        }
    }
    set(-2, 17, 1, 'stone')
    set(0, 17, 0, 'iron_ore')
    const block = bot.blockAt(target)
    rememberMiningExposure(c, { position: new Vec3(0, 17, 1), name: 'iron_ore' })
    assert.equal(miningSight(c, block, 4.5, true), null)
    let dug = false
    const controls = {}
    Object.assign(bot, { health: 20, heldItem: bot.inventory.items()[0], canDigBlock: () => true,
        tool: { equipForBlock: async () => {} }, lookAt: async () => {},
        setControlState: (key, value) => { controls[key] = value },
        async waitForTicks() { if (controls.sneak && controls.forward) { bot.entity.position = new Vec3(-1.5, 16, 2.5) } },
        async dig() { dug = true } })
    Object.setPrototypeOf(c, SurvivalController.prototype)
    Object.assign(c, { running: true, movements: { safeToBreak: () => true }, visibleDrops: () => [],
        rememberBlockedTarget: () => {},
        async gotoWithTimeout(goal) { assert.equal(goal.isEnd(edge.floored()), true) } })
    const mining = c.collectTarget(block).then(() => null, error => error)
    for (let i = 0; i < 20; i++) {
        await Promise.resolve()
        t.mock.timers.tick(300)
    }
    assert.equal(await mining, null)
    assert.equal(dug, true)
})

function dropCollector(t, drop, goto) {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const target = new Vec3(372, 17, 269)
    const { bot, cells, getBlock } = pitWorld()
    cells.set(target.toString(), 'iron_ore')
    Object.assign(bot, {
        heldItem: { name: 'iron_pickaxe', type: data.itemsByName.iron_pickaxe.id }, canDigBlock: () => true,
        tool: { equipForBlock: async () => {} }, entities: { 5: drop }, looks: [],
        async lookAt(p) { bot.looks.push(p) }, async waitForTicks() {},
        async dig(b) { cells.set(b.position.toString(), 'air') }
    })
    const warnings = []
    const c = Object.create(SurvivalController.prototype)
    Object.assign(c, { bot, running: true, paused: false, actionAbort: new AbortController(),
        movements: { safeToBreak: () => true }, log: { debug() {}, warn: m => warnings.push(m) }, minedOpenings: new Map(),
        canSee: () => false, gotoWithTimeout: goto,
        rememberBlockedTarget: () => assert.fail('a pickup problem quarantined the mined ore') })
    const run = async () => {
        const operation = c.collectTarget(getBlock(target), getBlock(target), 'priority iron')
        for (let i = 0; i < 60; i++) { await Promise.resolve(); t.mock.timers.tick(200) }
        await operation
    }
    return { bot, warnings, run }
}

test('a hidden mined drop is followed without turning and stood on when the follow misses it', async t => {
    const drop = { name: 'item', isValid: true, position: new Vec3(371.52, 17, 269.6), getDroppedItem: () => ({ name: 'raw_iron' }) }
    const labels = []
    const { bot, warnings, run } = dropCollector(t, drop, async (goal, ms, label) => {
        labels.push(label)
        if (label === 'mined item cell') {
            assert.deepEqual([goal.x, goal.y, goal.z, goal.rangeSq], [371, 17, 269, 0])
            drop.isValid = false
        }
    })
    await run()
    assert.deepEqual(labels, ['mined item pickup', 'mined item cell'])
    assert.ok(!bot.looks.some(p => p === drop.position), 'turned toward the drop (F116)')
    assert.equal(drop.isValid, false)
    assert.deepEqual(warnings, [])
})

test('an unreachable mined drop is reported and does not abort the ore collection', async t => {
    const drop = { name: 'item', isValid: true, position: new Vec3(372.5, 16, 269.5), getDroppedItem: () => ({ name: 'raw_iron' }) }
    const { warnings, run } = dropCollector(t, drop, async () => { throw new Error('No path to the goal!') })
    await run()
    assert.ok(warnings.some(m => /Left a mined raw_iron at \(372, 16, 269\)/.test(m)), warnings.join('\n'))
})
