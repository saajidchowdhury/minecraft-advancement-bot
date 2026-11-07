'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const goto = require('mineflayer-pathfinder/lib/goto')
const { SurvivalController } = require('../src/survival-bot')

test('pursuit keeps one dynamic goal while an animal remains out of attack range', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    let pursuitGoals = 0
    const target = { isValid: true, position: new Vec3(5, 0, 0) }
    const c = {
        running: true, paused: false, actionAbort: new AbortController(),
        checkAction: SurvivalController.prototype.checkAction, bestItem: () => null, canSee: () => true, visibleDrops: () => [],
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
            this.bot.entity.position = new Vec3(goal.x, 64, goal.z)
            bounded = true
        }
    }
    await SurvivalController.prototype.scout.call(c, 12)
    assert.equal(bounded, true)
})

test('scouting treats pathfinder resolving an empty path outside the goal as failure', async () => {
    const c = Object.create(SurvivalController.prototype)
    c.bot = new EventEmitter()
    c.bot.entity = { position: new Vec3(32.3, 63, -186.9) }
    c.bot.pathfinder = {
        goto: goal => goto(c.bot, goal),
        setGoal(goal) {
            c.bot.emit('goal_updated', goal)
            if (goal) {
                c.bot.emit('path_update', { status: 'noPath', path: [] })
            }
        }
    }
    c.memory = { scoutVisits: new Map() }
    c.log = { info() {} }
    c.classifyTerrainColumn = () => 'land'
    c.scoutAngle = c.scoutSteps = 0
    await assert.rejects(c.scout(16), /No path to the goal/)
    assert.equal(c.memory.scoutVisits.size, 0)
})
