'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const Block = require('prismarine-block')('26.1')
const WorldSync = require('prismarine-world/src/worldsync')
const data = require('minecraft-data')('26.1')
const { blockInView, scanFor } = require('../src/vision')
const { miningSight } = require('../src/cave-exploration')
const { SurvivalController } = require('../src/survival-bot')

function leafWorld(entries) {
    const cells = new Map(entries.map(([p, name]) => [p.toString(), name]))
    const getBlock = p => {
        const b = Block.fromStateId(data.blocksByName[cells.get(p.toString()) || 'air'].defaultState, 0)
        b.position = p
        return b
    }
    const bot = {
        entity: { position: new Vec3(0.5, 64, 0.5), eyeHeight: 1.62, yaw: -Math.PI / 2, pitch: 0 },
        game: { dimension: 'overworld' }, blockAt: getBlock,
        world: { raycast: (...args) => WorldSync.prototype.raycast.call({ getBlock }, ...args) },
        canSeeBlock(b) {
            const eye = bot.entity.position.offset(0, 1.62, 0)
            const d = b.position.offset(0.5, 0.5, 0.5).minus(eye)
            const range = d.norm()
            return Boolean(bot.world.raycast(eye, d.normalize(), range + 0.01)?.position.equals(b.position))
        },
        async look(yaw, pitch) { Object.assign(bot.entity, { yaw, pitch }) }, waitForTicks: async () => {}
    }
    return { bot, cells }
}

test('resource sight passes through multiple leaf blocks but still stops at stone', () => {
    const target = new Vec3(3, 65, 0)
    const { bot, cells } = leafWorld([[new Vec3(1, 65, 0), 'oak_leaves'], [new Vec3(2, 65, 0), 'birch_leaves'], [target, 'oak_log']])
    assert.equal(bot.canSeeBlock(bot.blockAt(target)), false)
    assert.equal(blockInView(bot, bot.blockAt(target)), true)
    cells.set(new Vec3(2, 65, 0).toString(), 'stone')
    assert.equal(blockInView(bot, bot.blockAt(target)), false)
})

test('wood scans look upward to discover a remaining trunk directly under a canopy', async () => {
    const target = new Vec3(0, 71, 0)
    const { bot } = leafWorld([[new Vec3(0, 68, 0), 'oak_leaves'], [target, 'oak_log']])
    const c = { bot, checkAction() {} }
    const found = await scanFor(c, () => blockInView(bot, bot.blockAt(target)) ? bot.blockAt(target) : null, { lookUp: true })
    assert.deepEqual(found?.position, target)
})

test('ore sight permits leaves on exposed faces without seeing through stone', () => {
    const target = new Vec3(3, 65, 0)
    const { bot, cells } = leafWorld([[new Vec3(1, 65, 0), 'oak_leaves'], [new Vec3(2, 65, 0), 'oak_leaves'], [target, 'iron_ore']])
    const c = { bot, memory: {} }
    assert.ok(miningSight(c, bot.blockAt(target)))
    for (const y of [64, 65, 66]) {
        for (const z of [-1, 0, 1]) { cells.set(new Vec3(1, y, z).toString(), 'stone') }
    }
    assert.equal(miningSight(c, bot.blockAt(target)), null)
})

test('entity sight ignores leaves while testing solid obstructions beyond the first block', () => {
    const entries = [64, 65, 66].flatMap(y => [-1, 0, 1].map(z => [new Vec3(2, y, z), 'oak_leaves']))
    const { bot, cells } = leafWorld(entries)
    const c = { bot }
    const target = { position: new Vec3(4.5, 64, 0.5), height: 1.8 }
    assert.equal(SurvivalController.prototype.canSee.call(c, target), true)
    for (const [p] of entries) { cells.set(p.toString(), 'stone') }
    assert.equal(SurvivalController.prototype.canSee.call(c, target), false)
})

test('a reachable trunk behind leaves is harvested without an unnecessary approach', async t => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const target = new Vec3(3, 65, 0)
    const { bot, cells } = leafWorld([[new Vec3(1, 65, 0), 'oak_leaves'], [target, 'oak_log']])
    bot.heldItem = { name: 'iron_axe', type: data.itemsByName.iron_axe.id }
    bot.canDigBlock = () => true
    bot.tool = { equipForBlock: async () => {} }
    let dug = false
    bot.dig = async b => { dug = true; cells.set(b.position.toString(), 'air') }
    const c = { bot, running: true, paused: false, actionAbort: new AbortController(), movements: { safeToBreak: () => true }, log: { debug() {} },
        visibleDrops: () => [], rememberBlockedTarget() {},
        gotoWithTimeout: async () => assert.fail('approached a reachable leaf-obscured trunk') }
    const operation = SurvivalController.prototype.collectTarget.call(c, bot.blockAt(target))
    for (let i = 0; i < 20; i++) { await Promise.resolve(); t.mock.timers.tick(1000) }
    await operation
    assert.equal(dug, true)
})
