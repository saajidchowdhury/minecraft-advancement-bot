'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const registry = require('minecraft-data')('26.1')
const { installSculkCaution, updateSculkCaution, sculkZoneAt, fleeSculk } = require('../src/sculk-caution')
const { SurvivalController } = require('../src/survival-bot')
const { chooseAction } = require('../src/decision-engine')

function cautious({ sculkAt = null, busy = true } = {}) {
    const bot = new EventEmitter()
    const controls = {}
    Object.assign(bot, {
        registry, game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, -54, 0.5), effects: {} },
        findBlock: ({ maxDistance }) => sculkAt && sculkAt.distanceTo(bot.entity.position) <= maxDistance
            ? { name: 'sculk_sensor', position: sculkAt } : null,
        nearestEntity: () => null,
        setControlState: (key, value) => { controls[key] = value },
        clearControlStates: () => { for (const key of Object.keys(controls)) { controls[key] = false } }
    })
    const cancelled = []
    const c = { bot, memory: { tunnelFrontier: { dimension: 'overworld', x: 4, y: -54, z: 0 } }, running: true, busy,
        activeAction: 'fill_lava_bucket', log: { warn() {}, info() {} }, cancelCurrentTask: reason => cancelled.push(reason),
        scheduleLoop() {} }
    installSculkCaution(c)
    const ticks = n => { for (let i = 0; i < n; i++) { bot.emit('physicsTick') } }
    return { c, bot, controls, cancelled, ticks }
}

test('a sculk sensor within 16 blocks raises caution, cancels work and holds sneak every tick', () => {
    const { c, bot, controls, cancelled, ticks } = cautious({ sculkAt: new Vec3(10, -54, 0) })
    ticks(20)
    assert.ok(c.sculkCaution)
    assert.deepEqual(cancelled, ['sculk alarm'])
    assert.equal(c.memory.tunnelFrontier, null, 'a tunnel frontier inside the zone is dropped')
    assert.ok(sculkZoneAt(c, new Vec3(40, -54, 0)))
    bot.clearControlStates()
    ticks(1)
    assert.equal(controls.sneak, true, 'sneak is reasserted after other code clears controls')
})

test('a heard shriek or the Darkness effect raises caution with no sculk block in range', () => {
    const heard = cautious()
    heard.bot.emit('soundEffectHeard', 'block.sculk_shrieker.shriek', new Vec3(12, -50, 3), 1, 1)
    assert.ok(heard.c.sculkCaution)
    const dark = cautious()
    dark.bot.entity.effects[registry.effectsByName.Darkness.id] = { amplifier: 0 }
    dark.ticks(20)
    assert.ok(dark.c.sculkCaution)
    const far = cautious()
    far.bot.emit('soundEffectHeard', 'block.sculk_sensor.clicking', new Vec3(80, -54, 0), 1, 1)
    assert.equal(far.c.sculkCaution, undefined, 'a click beyond 32 blocks is ignored')
})

test('caution ends only outside every zone, 24 blocks from sculk and 30 s after the last alarm', t => {
    t.mock.timers.enable({ apis: ['Date'] })
    const { c, bot, controls, ticks } = cautious({ sculkAt: new Vec3(10, -54, 0) })
    ticks(20)
    bot.entity.position = new Vec3(30, -54, 0)
    t.mock.timers.tick(31000)
    updateSculkCaution(c)
    assert.ok(c.sculkCaution, 'still inside the 48-block zone')
    bot.entity.position = new Vec3(70, -54, 0)
    updateSculkCaution(c)
    assert.equal(c.sculkCaution, null)
    assert.equal(controls.sneak, false)
})

test('the planner flees a sculk zone before fighting, and zone blocks are refused as targets', () => {
    const state = { health: 20, food: 20, hostileDistance: 3, hasWeapon: true, sculkCaution: true, inSculkZone: true }
    assert.equal(chooseAction(state), 'flee_sculk')
    assert.notEqual(chooseAction({ ...state, inSculkZone: false }), 'flee_sculk')
    const c = Object.create(SurvivalController.prototype)
    c.bot = { game: { dimension: 'overworld' } }
    c.memory = { blockedTargets: new Map(), sculkZones: [{ dimension: 'overworld', x: 0, y: -54, z: 0, radius: 48 }] }
    assert.equal(c.isBlockedTarget({ position: new Vec3(20, -50, 5) }), true)
    assert.equal(c.isBlockedTarget({ position: new Vec3(90, -50, 5) }), false)
})

test('the flee path heads out of the zone without drops and never breaks sensors or shriekers', async () => {
    const { c, bot } = cautious()
    c.memory.sculkZones = [{ dimension: 'overworld', x: -10, y: -54, z: 0, radius: 48 }]
    let used = null
    bot.pathfinder = { setMovements(m) { used ??= m } }
    Object.assign(bot, { version: '26.1', inventory: { items: () => [] } })
    c.gotoWithTimeout = async goal => { c.goal = goal }
    await fleeSculk(c)
    assert.equal(used.maxDropDown, 0)
    assert.equal(used.canDig, true)
    assert.ok(used.blocksCantBreak.has(registry.blocksByName.sculk_shrieker.id))
    assert.ok(Math.hypot(c.goal.x + 10, c.goal.z) >= 48, 'the goal lies outside the zone')
})
