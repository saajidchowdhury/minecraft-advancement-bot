'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const goto = require('mineflayer-pathfinder/lib/goto')
const { SurvivalController } = require('../src/survival-bot')

function axeHunter() {
    const c = Object.create(SurvivalController.prototype)
    const target = { name: 'cow', isValid: true, position: new Vec3(2, 64, 0) }
    const hits = [], equipped = [], aims = []
    Object.assign(c, { running: true, paused: false, actionAbort: new AbortController(), canSee: () => true,
        visibleDrops: () => [], bot: { health: 20, entity: { position: new Vec3(0, 64, 0) },
            inventory: { items: () => [{ name: 'diamond_sword' }, { name: 'stone_axe' }], slots: [] },
            pathfinder: { setGoal() {} }, lookAt: async point => { aims.push(point) },
            async equip(item) { equipped.push(item.name) },
            attack() { hits.push(Date.now()); if (hits.length === 2) { target.isValid = false } }
        } })
    return { c, target, hits, equipped, aims }
}

test('prey attacks prefer a stone axe over a carried sword and wait for charged swings', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const { c, target, hits, equipped, aims } = axeHunter()
    const start = Date.now()
    const operation = c.fight(target, true)
    await Promise.resolve()
    for (let i = 0; i < 50; i++) {
        t.mock.timers.tick(100)
        await Promise.resolve()
        await Promise.resolve()
        if (i === 5) {
            assert.ok(aims.length > 0, 'the hunter must track its prey while the axe charges')
            assert.equal(hits.length, 0)
        }
    }
    await operation
    assert.equal(equipped[0], 'stone_axe')
    assert.equal(hits.length, 2)
    assert.ok(hits[0] - start >= 1250)
    assert.ok(hits[1] - hits[0] >= 1250)
})

test('an adjacent cow outside the view cone is turned to and hit, not abandoned as out of view', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const { c, target, hits } = axeHunter()
    delete c.canSee
    Object.assign(c.bot.entity, { yaw: 0, pitch: 0 })
    c.bot.world = { raycast: () => null }
    const operation = c.fight(target, true)
    for (let i = 0; i < 40; i++) {
        t.mock.timers.tick(100)
        await Promise.resolve()
        await Promise.resolve()
    }
    await operation
    assert.equal(hits.length, 2)
})

test('prey hidden by terrain for under 3 s is still hunted; hidden for 3 s ends the hunt', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    for (const [hiddenTicks, outcome] of [[20, 'hit'], [40, 'lost']]) {
        const { c, target, hits } = axeHunter()
        delete c.canSee
        target.position = new Vec3(outcome === 'hit' ? 2 : 10, 64, 0)
        let ticks = 0
        c.bot.world = { raycast: () => ticks < hiddenTicks ? { position: new Vec3(1, 65, 0) } : null }
        const operation = c.fight(target, true).then(() => 'hit', error => error.message)
        for (let i = 0; i < 80; i++) {
            ticks++
            t.mock.timers.tick(100)
            await Promise.resolve()
            await Promise.resolve()
        }
        assert.equal(await operation, outcome === 'hit' ? 'hit' : 'prey went out of view')
        assert.equal(hits.length, outcome === 'hit' ? 2 : 0)
    }
})

test('a hidden prey the bot keeps closing on is still pursued past the 3 s occlusion limit', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const { c, target } = axeHunter()
    delete c.canSee
    target.position = new Vec3(30, 64, 0)
    c.bot.world = { raycast: () => ({ position: new Vec3(1, 65, 0) }) }
    let error = null
    const operation = c.fight(target, true).catch(e => { error = e })
    for (let i = 0; i < 60; i++) {
        c.bot.entity.position = new Vec3(i * 0.4, 64, 0)
        t.mock.timers.tick(100)
        await Promise.resolve()
        await Promise.resolve()
    }
    assert.equal(error, null, 'closing 24 blocks in 6 s must not count as losing the prey')
    target.isValid = false
    for (let i = 0; i < 12; i++) {
        t.mock.timers.tick(100)
        await Promise.resolve()
        await Promise.resolve()
    }
    await operation
})

test('the prey guard can interrupt an axe cooldown before the first attack', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const { c, target, hits } = axeHunter()
    let shortOfAir = false
    const operation = c.fight(target, true, () => shortOfAir ? 'fish hunt is short of air' : null)
    const rejected = assert.rejects(operation, /short of air/)
    await Promise.resolve()
    await Promise.resolve()
    shortOfAir = true
    for (let i = 0; i < 10; i++) {
        t.mock.timers.tick(100)
        await Promise.resolve()
        await Promise.resolve()
    }
    await rejected
    assert.equal(hits.length, 0)
})

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
