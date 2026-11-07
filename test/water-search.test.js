'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { EventEmitter } = require('node:events')
const { performProgression, openToSky } = require('../src/progression-skills')
const { SurvivalController } = require('../src/survival-bot')

function waterWorld(night, roof = 65) {
    const air = new Set()
    const c = {
        running: true, paused: false, actionAbort: new AbortController(), memory: { surfaceByStaircase: true },
        home: { y: 63 }, log: { info() {}, warn() {}, debug() {} }, isNight: () => night,
        countItems: () => 0, findNearestBlock: () => null, checkAction() {},
        isEmptyPlacementBlock: b => b?.name === 'air',
        observe: () => ({ underground: false, dimension: 'overworld', health: 20, food: 20, foodUnits: 0 }),
        bestItem: names => names.includes('iron_pickaxe') ? { name: 'iron_pickaxe' } : null,
        scout: async () => assert.fail('scouted from beneath the roof'),
        bot: {
            health: 20, game: { dimension: 'overworld', minY: -64, height: 384 },
            entity: { position: new Vec3(108.5, 60, 65.5), yaw: 0, pitch: 0 },
            blockAt(p) {
                const name = air.has(p.toString()) || p.y > roof ? 'air' : 'stone'
                return { name, position: p, boundingBox: name === 'air' ? 'empty' : 'block', diggable: true, canHarvest: () => true }
            },
            equip: async () => {}, canDigBlock: () => true,
            async dig(b) { air.add(b.position.toString()) },
            look: async () => {}, waitForTicks: async () => {}
        },
        async gotoWithTimeout(g) { c.bot.entity.position = new Vec3(g.x + 0.5, g.y, g.z + 0.5) }
    }
    for (const y of [60, 61]) { air.add(new Vec3(108, y, 65).toString()) }
    return c
}

test('daytime water search keeps climbing beneath a roof even when underground is falsely reported as false', async () => {
    const c = waterWorld(false)
    await performProgression(c, 'fill_water_bucket', {})
    assert.ok(c.bot.entity.position.y > 60)
    assert.equal(c.bot.entity.position.z, 65.5)
})

test('nighttime water search stays underground instead of continuing the surface staircase', async () => {
    const c = waterWorld(true)
    await performProgression(c, 'fill_water_bucket', {})
    assert.ok(c.bot.entity.position.y <= 60)
    assert.equal(c.memory.surfaceByStaircase, true)
})

test('a blocked nighttime water search waits underground instead of invoking land scouting', async () => {
    const c = waterWorld(true)
    const at = c.bot.blockAt
    c.bot.blockAt = p => p.y === 60 && Math.abs(p.x - 108) + Math.abs(p.z - 65) === 1
        ? { ...at(p), name: 'bedrock', diggable: false } : at(p)
    const start = c.bot.entity.position.clone()
    await performProgression(c, 'fill_water_bucket', {})
    assert.deepEqual(c.bot.entity.position, start)
})

test('daytime water search scouts a lower open surface with the surface-only route restriction', async () => {
    const c = waterWorld(false, 57)
    c.bot.entity.position = new Vec3(108.5, 58, 65.5)
    let searched = false
    c.observe = () => ({ underground: true })
    c.scout = async (distance, options) => { assert.equal(options.surfaceOnly, true); searched = true }
    await performProgression(c, 'fill_water_bucket', {})
    assert.equal(searched, true)
})

test('interrupting a water approach does not quarantine the water source', async () => {
    const c = waterWorld(false, 57)
    c.bot.entity.position = new Vec3(108.5, 58, 65.5)
    const water = { name: 'water', position: new Vec3(115, 58, 65), getProperties: () => ({ level: 0 }) }
    c.findNearestBlock = () => water
    c.gotoWithTimeout = async () => { c.actionAbort.abort(); throw new Error('water approach cancelled') }
    c.rememberBlockedTarget = () => assert.fail('quarantined a source after interruption')
    await assert.rejects(performProgression(c, 'fill_water_bucket', {}), /water approach cancelled/)
})

test('surface-only scouting disables digging and rejects cave cells before walking', async () => {
    const c = Object.create(SurvivalController.prototype)
    c.memory = { scoutVisits: new Map() }
    c.movements = { canDig: true }
    c.scoutAngle = c.scoutSteps = 0
    c.isNight = () => false
    c.log = { info() {} }
    c.classifyTerrainColumn = () => 'land'
    let current = c.movements
    c.bot = {
        registry: require('minecraft-data')('26.1'),
        entity: { position: new Vec3(0.5, 64, 0.5) }, game: { minY: -64, height: 384 },
        pathfinder: { setMovements: m => { current = m } },
        blockAt: p => ({ name: p.y === 60 ? 'stone' : 'air', position: p, boundingBox: p.y === 60 ? 'block' : 'empty' })
    }
    c.gotoWithTimeout = async goal => {
        assert.equal(current.canDig, false)
        assert.equal(current.exclusionAreasStep[0]({ position: new Vec3(0, 40, 0) }), 100)
        assert.equal(current.exclusionAreasStep[0]({ position: new Vec3(0, 64, 0) }), 0)
        c.bot.entity.position = new Vec3(goal.x + 0.5, 64, goal.z + 0.5)
    }
    await c.scout(24, { surfaceOnly: true })
    assert.equal(current, c.movements)
})

test('the surface check rejects a distant cave roof and unloaded columns while allowing leaf cover', () => {
    const bot = {
        game: { minY: -64, height: 384 },
        blockAt: p => ({ name: p.y === 100 ? 'stone' : 'air', boundingBox: p.y === 100 ? 'block' : 'empty' })
    }
    assert.equal(openToSky(bot, new Vec3(0, 61, 0)), false)
    const covered = bot.blockAt
    bot.blockAt = p => ({ ...covered(p), skyLight: 14 })
    assert.equal(openToSky(bot, new Vec3(0, 61, 0)), false)
    bot.blockAt = p => ({ name: p.y === 70 ? 'oak_leaves' : 'air', boundingBox: p.y === 70 ? 'block' : 'empty' })
    assert.equal(openToSky(bot, new Vec3(0, 61, 0)), true)
    bot.blockAt = () => null
    assert.equal(openToSky(bot, new Vec3(0, 61, 0)), false)
})

test('nightfall interrupts a daytime water trip but leaves an underground night search running', () => {
    const bot = new EventEmitter()
    bot.health = 20
    let interrupted = 0
    const c = { bot, running: true, busy: true, activeAction: 'fill_water_bucket', waterDaytimeSearch: true,
        isNight: () => true, actionAbort: new AbortController(), cancelCurrentTask() { interrupted++ } }
    SurvivalController.prototype.bindEvents.call(c)
    bot.emit('time')
    assert.equal(interrupted, 1)
    c.waterDaytimeSearch = false
    bot.emit('time')
    assert.equal(interrupted, 1)
})
