'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { SurvivalController } = require('../src/survival-bot')

test('ordinary stone collection only requests exposed targets', async () => {
    let search
    const target = { position: new Vec3(1, 63, 0), name: 'stone' }
    const controller = {
        bot: { entity: { position: new Vec3(0, 64, 0) } },
        findNearestBlock(predicate, radius, options) {
            search = options
            assert.equal(predicate('stone'), true)
            return target
        },
        async collectTarget(block) {
            assert.equal(block, target)
        }
    }
    await SurvivalController.prototype.gatherStone.call(controller)
    assert.equal(search.visible, true)
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
        bot: {
            entity: { position: new Vec3(0, 10, 0) }, entities: {}, heldItem: { type: 1 }, world: {},
            blockAt: () => block, canDigBlock: () => true, canSeeBlock: () => true,
            tool: { equipForBlock: async () => {} },
            dig: async () => { dug = true }
        },
        movements: { safeToBreak: () => true },
        gotoWithTimeout: async () => {},
        rememberBlockedTarget: () => {}
    }
    await assert.rejects(SurvivalController.prototype.collectTarget.call(controller, block), /support/)
    assert.equal(dug, false)
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
