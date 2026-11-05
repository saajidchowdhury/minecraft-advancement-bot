'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { SurvivalController } = require('../src/survival-bot')

test('pursuit keeps one dynamic goal while an animal remains out of attack range', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    let pursuitGoals = 0
    const target = { isValid: true, position: new Vec3(5, 0, 0) }
    const c = {
        bestItem: () => null,
        bot: { health: 20, entity: { position: new Vec3(0, 0, 0) },
            pathfinder: { setGoal(goal) { if (goal) { pursuitGoals++ } } } }
    }
    const operation = SurvivalController.prototype.fight.call(c, target, true)
    for (let i = 0; i < 4; i++) {
        t.mock.timers.tick(300)
        await Promise.resolve()
    }
    target.isValid = false
    t.mock.timers.tick(300)
    await Promise.resolve()
    t.mock.timers.tick(800)
    await operation
    assert.equal(pursuitGoals, 1)
})

test('recovery scouting uses a bounded path operation', async () => {
    let bounded = false
    const c = {
        bot: { entity: { position: new Vec3(0, 64, 0) },
            pathfinder: { goto: async () => { throw new Error('unbounded path used') } } },
        memory: { scoutVisits: new Map() }, scoutAngle: 0, scoutSteps: 0,
        log: { info() {} }, classifyTerrainColumn: () => 'land',
        async gotoWithTimeout(goal, timeoutMs) {
            assert.equal(timeoutMs > 0 && timeoutMs <= 30000, true)
            bounded = true
        }
    }
    await SurvivalController.prototype.scout.call(c, 12)
    assert.equal(bounded, true)
})
