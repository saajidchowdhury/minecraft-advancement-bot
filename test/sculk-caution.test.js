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

// Live F132: zone centre (-76,-44,-13), radius 48; the bot at (-49,-11,-6) sat 43 blocks off.
const LIVE_ZONE = { dimension: 'overworld', x: -76, y: -44, z: -13, radius: 48 }

test('a sculk zone blocks tunnel steps toward its centre but not steps leading out (F132)', () => {
    const { sculkInward } = require('../src/sculk-caution')
    const c = { bot: { game: { dimension: 'overworld' } }, memory: { sculkZones: [LIVE_ZONE] } }
    const feet = new Vec3(-49, -11, -6)
    assert.equal(sculkInward(c, feet, feet.offset(-1, 0, 0)), true, 'toward the centre')
    assert.equal(sculkInward(c, feet, feet.offset(1, 1, 0)), false, 'up and away')
    assert.equal(sculkInward(c, new Vec3(-30, 0, 0), new Vec3(-30, 1, 0)), false, 'outside every zone')
    c.bot.game.dimension = 'the_nether'
    assert.equal(sculkInward(c, feet, feet.offset(-1, 0, 0)), false)
})

// One-wide pocket at (-49,-11,-6) in deepslate, inside the live zone, with a netherite pickaxe.
function zoneTunnel() {
    const air = new Set(['(-49, -11, -6)', '(-49, -10, -6)'])
    const dug = []
    const pick = { name: 'netherite_pickaxe', type: 1, count: 1 }
    const bot = {
        health: 20, game: { dimension: 'overworld' }, entity: { position: new Vec3(-48.5, -11, -5.5) }, registry, version: '26.1',
        inventory: { items: () => [pick] }, pathfinder: { setMovements() {} },
        blockAt: p => air.has(p.toString()) || dug.some(d => d.equals(p)) ? { name: 'air', position: p, boundingBox: 'empty' }
            : { name: 'deepslate', position: p, boundingBox: 'block', diggable: true, canHarvest: () => true },
        canDigBlock: () => true, equip: async () => {}, async dig(block) { dug.push(block.position) }
    }
    const c = Object.create(SurvivalController.prototype)
    Object.assign(c, { bot, running: true, paused: false, log: { info() {}, warn() {} },
        memory: { blockedTargets: new Map(), sculkZones: [LIVE_ZONE] },
        bestItem: names => names.includes('netherite_pickaxe') ? pick : null,
        async gotoWithTimeout(goal) { bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5) },
        // No ore in this pocket; the priority-ore scan is out of scope here.
        findNearestBlock: () => null, async placeSurvivalBlock() {} })
    return { c, bot, dug }
}
const centre = new Vec3(LIVE_ZONE.x, LIVE_ZONE.y, LIVE_ZONE.z)
const start = new Vec3(-49, -11, -6)

test('a tunnel inside a sculk zone climbs out instead of finding every step blocked (F132)', async () => {
    const { mineTunnel } = require('../src/progression-skills')
    const { c, bot } = zoneTunnel()
    await mineTunnel(c, -7)
    assert.equal(bot.entity.position.y, -7)
    assert.ok(bot.entity.position.distanceTo(centre) > start.distanceTo(centre))
})

test('a sculk flee whose walking path fails carves up and away from the zone (F132)', async () => {
    const { c, bot } = zoneTunnel()
    const walk = c.gotoWithTimeout
    c.gotoWithTimeout = async (goal, ms, label) => {
        if (label === 'sculk flee') {
            throw new Error('sculk flee timed out after 20s')
        }
        return walk(goal)
    }
    await c.fleeSculk()
    assert.equal(bot.entity.position.y, -7)
    assert.ok(bot.entity.position.distanceTo(centre) > start.distanceTo(centre) + 4)
})
