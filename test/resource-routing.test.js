'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { SurvivalController } = require('../src/survival-bot')
const { scanFor } = require('../src/vision')

test('entity searches ignore unnamed packet placeholders without deprecation traces', t => {
    const Entity = require('prismarine-entity')('26.1')
    const unnamed = new Entity(1)
    const zombie = new Entity(2)
    zombie.name = 'zombie'
    zombie.position = new Vec3(0, 64, -2)
    const trace = t.mock.method(console, 'trace', () => {})
    const c = {
        bot: { entity: { position: new Vec3(0, 64, 0) },
            nearestEntity: match => [unnamed, zombie].find(match) || null },
        canSee: () => true
    }
    assert.equal(SurvivalController.prototype.nearestEntity.call(c, new Set(['zombie'])), zombie)
    assert.equal(trace.mock.callCount(), 0)
})

test('block searches reject occluded targets and turn to discover a target behind the bot', async () => {
    const hidden = { position: new Vec3(0, 65, -3), name: 'stone' }
    const target = { position: new Vec3(0, 65, 3), name: 'stone' }
    const controller = Object.create(SurvivalController.prototype)
    controller.mcData = { blocksByName: { stone: { name: 'stone', id: 1 } } }
    controller.isBlockedTarget = () => false
    controller.checkAction = () => {}
    controller.bot = {
        entity: { position: new Vec3(0.5, 64, 0.5), yaw: 0, pitch: 0 },
        canSeeBlock: block => block !== hidden,
        findBlock: ({ useExtraInfo }) => [hidden, target].find(useExtraInfo) || null,
        waitForTicks: async () => {},
        async look(yaw, pitch) {
            Object.assign(this.entity, { yaw, pitch })
        }
    }
    const find = () => controller.findNearestBlock(name => name === 'stone', 12)
    assert.equal(find(), null)
    assert.equal(await scanFor(controller, find), target)
    assert.equal(controller.bot.entity.yaw, Math.PI)
})

test('a mining staircase with a walkable step behind is not treated as a vertical trap', () => {
    const bot = {
        entity: { position: new Vec3(0, 10, 0) },
        blockAt(p) {
            const air = (p.x === 0 && p.z === 0 && p.y >= 10) ||
                (p.x === -1 && p.z === 0 && p.y >= 11)
            return { name: air ? 'air' : 'stone', boundingBox: air ? 'empty' : 'block' }
        }
    }
    assert.equal(SurvivalController.prototype.detectVerticalShaft.call({ bot }), false)
})

test('approaching a resource cannot make the bot mine its own support block', async () => {
    let dug = false
    const block = { type: 1, name: 'stone', position: new Vec3(0, 9, 0), boundingBox: 'block', canHarvest: () => true }
    const controller = {
        running: true,
        paused: false,
        actionAbort: new AbortController(),
        memory: {}, log: { info() {}, warn() {} },
        bot: {
            entity: { position: new Vec3(0.5, 10, 0.5) }, entities: {}, heldItem: { type: 1 }, world: {},
            game: { dimension: 'overworld' }, registry: { blocksByName: {} }, pathfinder: { goal: null },
            blockAt: () => block, canDigBlock: () => true, canSeeBlock: () => true,
            tool: { equipForBlock: async () => {} },
            dig: async () => { dug = true }
        },
        movements: { safeToBreak: () => true },
        gotoWithTimeout: async () => {},
        rememberBlockedTarget: () => {}
    }
    controller.stepOffBlock = SurvivalController.prototype.stepOffBlock.bind(controller)
    SurvivalController.prototype.configureDigging.call(controller)
    // Enclosed in stone there is no cell to step to, so the dig guard refuses the support block.
    await assert.rejects(SurvivalController.prototype.collectTarget.call(controller, block), /under the bot/)
    assert.equal(dug, false)
})

test('collection refuses to dig when the resource is still occluded after approaching', async () => {
    const target = { type: 1, name: 'stone', position: new Vec3(0, 65, -2), boundingBox: 'block', canHarvest: () => true }
    const controller = {
        running: true,
        bot: {
            entity: { position: new Vec3(0.5, 64, 0.5) }, heldItem: { type: 1 }, world: {},
            blockAt: () => target, canDigBlock: () => true, canSeeBlock: () => false,
            tool: { equipForBlock: async () => {} },
            dig: async () => assert.fail('attempted to dig through the wall')
        },
        movements: { safeToBreak: () => true },
        gotoWithTimeout: async () => {},
        rememberBlockedTarget: () => {}
    }
    await assert.rejects(SurvivalController.prototype.collectTarget.call(controller, target), /not visible or reachable/)
})

test('a horizontal tunnel dead end still has a walkable exit behind', () => {
    const bot = {
        entity: { position: new Vec3(0, 10, 0) },
        blockAt(p) {
            const air = p.z === 0 && [0, -1].includes(p.x) && [10, 11].includes(p.y)
            return { name: air ? 'air' : 'stone', boundingBox: air ? 'empty' : 'block' }
        }
    }
    assert.equal(SurvivalController.prototype.detectVerticalShaft.call({ bot }), false)
})

test('cancellation clears the current goal without poisoning the next path', async () => {
    let deferredStop = false
    const pathfinder = {
        stop() { deferredStop = true },
        setGoal(goal) {
            assert.equal(goal, null)
            deferredStop = false
        },
        async goto() {
            if (deferredStop) {
                throw new Error('PathStopped')
            }
        }
    }
    const controller = { actionAbort: new AbortController(), bot: { pathfinder, clearControlStates() {} } }
    SurvivalController.prototype.clearCurrentTask.call(controller)
    await assert.doesNotReject(pathfinder.goto())
})

test('a one-block descent behind the bot is a usable staircase exit', () => {
    const bot = {
        entity: { position: new Vec3(0, 10, 0) },
        blockAt(p) {
            const air = (p.x === 0 && p.z === 0 && [10, 11].includes(p.y)) ||
                (p.x === -1 && p.z === 0 && [9, 10, 11].includes(p.y))
            return { name: air ? 'air' : 'stone', boundingBox: air ? 'empty' : 'block' }
        }
    }
    assert.equal(SurvivalController.prototype.detectVerticalShaft.call({ bot }), false)
})

test('a tree whose log cannot be reached is skipped as a whole trunk', async () => {
    const logs = [73, 74, 75].map(y => ({ name: 'acacia_log', position: new Vec3(-35, y, -27) }))
    const branch = [{ name: 'acacia_log', position: new Vec3(-36, 76, -28) }, { name: 'acacia_log', position: new Vec3(-37, 77, -29) }]
    const c = Object.create(SurvivalController.prototype)
    Object.assign(c, {
        memory: { blockedTargets: new Map() }, actionAbort: new AbortController(),
        bot: { entity: { position: new Vec3(-34.5, 72, -25.5) }, canSeeBlock: () => true, nearestEntity: () => null, blockAt: () => null,
            collectBlock: { findFromVein: (block, max) => max > 3 ? [...logs, ...branch] : logs } },
        findNearestBlock: () => logs[0],
        async collectTarget(target, anchor) {
            c.rememberBlockedTarget(anchor, 'tree', new Error('resource approach timed out after 10s'))
            throw new Error('resource approach timed out after 10s')
        },
        log: { warn() {} }
    })
    await assert.rejects(c.gatherWood(), /approach timed out/)
    assert.equal([...logs, ...branch].every(log => c.isBlockedTarget(log)), true)
})
