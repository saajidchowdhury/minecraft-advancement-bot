'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { EventEmitter } = require('node:events')
const { SurvivalController } = require('../src/survival-bot')
const { prepareBed, sleepSafely, huntAtNight, leaveShelter } = require('../src/night-skills')

function restWorld() {
    const blocks = new Map()
    const items = [{ name: 'white_bed', count: 1 }]
    const state = { dimension: 'overworld', canSleep: true, hostileDistance: Infinity, bedWool: null }
    const c = {
        memory: {}, running: true, paused: false, actionAbort: new AbortController(), movements: {},
        checkAction: SurvivalController.prototype.checkAction, log: { info() {}, warn() {} },
        observe: () => state, findNearestBlock: () => null,
        countItems: names => items.filter(i => names.includes(i.name)).reduce((sum, i) => sum + i.count, 0),
        isEmptyPlacementBlock: b => b?.name === 'air',
        bot: {
            health: 20, game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, 64, 0.5) },
            inventory: { items: () => items }, time: { day: 2 },
            blockAt(p) {
                const name = blocks.get(p.toString()) || (p.y < 64 ? 'stone' : 'air')
                return { name, position: p, boundingBox: name === 'air' ? 'empty' : 'block' }
            },
            equip: async () => {}, lookAt: async () => {},
            async _placeBlockWithOptions(floor, face, options) {
                assert.equal(options.forceLook, 'ignore')
                const foot = floor.position.offset(0, 1, 0)
                blocks.set(foot.toString(), 'white_bed')
                blocks.set(foot.offset(1, 0, 0).toString(), 'white_bed')
            },
            async sleep() { c.bot.isSleeping = true }
        }
    }
    return { c, state, blocks, items }
}

test('sleep places both bed halves without overriding orientation and requires server sleep state', async () => {
    const { c, state } = restWorld()
    c.bot.lookAt = async p => {
        assert.ok(p.x > c.bot.entity.position.x)
        assert.equal(p.z, c.bot.entity.position.z)
    }
    await sleepSafely(c, state)
    assert.equal(c.bot.isSleeping, true)
    assert.equal(c.memory.travelBed.dimension, 'overworld')
    assert.equal(c.memory.sleepRetry, undefined)
})

test('beds are never used outside the Overworld', async () => {
    const { c, state } = restWorld()
    c.bot.game.dimension = 'the_nether'
    c.bot.sleep = async () => assert.fail('bed used in Nether')
    await assert.rejects(sleepSafely(c, state), /Overworld/)
})

test('an incomplete or server-rejected bed cannot count as successful sleep', async () => {
    const { c, state, blocks } = restWorld()
    c.bot._placeBlockWithOptions = async floor => blocks.set(floor.position.offset(0, 1, 0).toString(), 'white_bed')
    c.bot.sleep = async () => assert.fail('sleeping on incomplete bed')
    await sleepSafely(c, state)
    assert.ok(c.memory.sleepRetry.until > Date.now())
    assert.equal(c.bot.isSleeping, undefined)
    c.findNearestBlock = () => ({ name: 'white_bed' })
    c.bot.sleep = async () => {}
    await sleepSafely(c, state)
    assert.equal(c.bot.isSleeping, undefined)
})

test('cancellation during bed equip prevents placement and is not swallowed as a sleep retry', async () => {
    const { c, state } = restWorld()
    c.bot.equip = async () => c.actionAbort.abort()
    c.bot._placeBlockWithOptions = async () => assert.fail('placement after cancellation')
    await assert.rejects(sleepSafely(c, state), /cancelled/)
    assert.equal(c.memory.sleepRetry, undefined)
})

test('new monsters near a bed abort the sleep attempt', async () => {
    const { c, state } = restWorld()
    c.findNearestBlock = () => ({ name: 'white_bed' })
    state.hostileDistance = 5
    c.bot.sleep = async () => assert.fail('sleep attempt near monsters')
    await sleepSafely(c, state)
    assert.ok(c.memory.sleepRetry.until > Date.now())
})

test('bed crafting respects cancellation before sending a craft request', async () => {
    const { c, items } = restWorld()
    items.splice(0, 1, { name: 'red_wool', count: 3 })
    c.ensurePlanks = async () => c.actionAbort.abort()
    c.ensureItem = async () => assert.fail('craft after cancellation')
    await assert.rejects(prepareBed(c, 'red_wool'), /cancelled/)
})

test('sudden night damage cancels hunting and persists a rest decision for that night', () => {
    const bot = new EventEmitter()
    Object.assign(bot, { health: 20, game: { dimension: 'overworld' }, time: { day: 7 },
        entity: { position: new Vec3(0, 64, 0) }, entities: {} })
    const c = { bot, memory: {}, running: true, busy: true, activeAction: 'hunt_night',
        isNight: () => true, positionText: () => '0,64,0', log: { warn() {} },
        cancelCurrentTask() { c.cancelled = true } }
    SurvivalController.prototype.bindEvents.call(c)
    bot.health = 14
    bot.emit('health')
    assert.equal(c.cancelled, true)
    assert.equal(c.memory.nightRetreat.day, 7)
    assert.equal(c.memory.nightRetreat.dimension, 'overworld')
})

test('night hunt abandons a changed threat state and restores normal movement', async () => {
    const { c, state } = restWorld()
    c.bot.registry = require('minecraft-data')('26.1')
    Object.assign(state, { health: 20, food: 20, foodUnits: 12, armorEquipped: true,
        shieldEquipped: true, hasNightWeapon: true, hostileCount: 1, nightHuntCount: 0,
        nightTarget: { name: 'spider' }, isNight: true })
    let movement = null
    c.bot.deactivateItem = () => {}
    c.bot.pathfinder = { setGoal() {}, setMovements(m) { movement = m } }
    c.fight = async (target, hunt, guard) => {
        assert.equal(target.name, 'spider')
        assert.equal(hunt, true)
        state.hostileCount = 3
        throw new Error(guard())
    }
    await assert.rejects(huntAtNight(c, state), /safety limit/)
    assert.ok(c.memory.nightRetreat)
    assert.equal(movement, c.movements)
})

test('combat cancellation releases an active shield and prevents the next attack', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const { c } = restWorld()
    const target = { isValid: true, position: new Vec3(2, 64, 0) }
    let shield = false
    let attacks = 0
    c.bestItem = () => null
    c.bot.inventory.slots = []
    c.bot.inventory.slots[45] = { name: 'shield' }
    c.bot.pathfinder = { setGoal() {} }
    c.bot.activateItem = offhand => { assert.equal(offhand, true); shield = true }
    c.bot.deactivateItem = () => { shield = false }
    c.bot.attack = () => { attacks++ }
    const operation = SurvivalController.prototype.fight.call(c, target, true, () => null)
    await Promise.resolve()
    assert.equal(shield, true)
    c.actionAbort.abort()
    t.mock.timers.tick(350)
    await assert.rejects(operation, /cancelled/)
    assert.equal(attacks, 0)
    assert.equal(shield, false)
})

test('daylight shelter exit opens a checked doorway and clears only the shelter memory', async () => {
    const { c, blocks } = restWorld()
    c.sheltered = true
    c.shelterCenter = new Vec3(0, 64, 0)
    c.memory.shelter = { x: 0, y: 64, z: 0, dimension: 'overworld' }
    c.hasEnclosedShelter = () => true
    for (const y of [64, 65]) {
        blocks.set(new Vec3(1, y, 0).toString(), 'cobblestone')
    }
    c.movements.safeToBreak = () => true
    const blockAt = c.bot.blockAt
    c.bot.blockAt = p => ({ ...blockAt(p), diggable: true })
    c.bot.tool = { equipForBlock: async () => {} }
    c.bot.dig = async b => blocks.set(b.position.toString(), 'air')
    c.gotoWithTimeout = async goal => { c.bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5) }
    await leaveShelter(c)
    assert.equal(c.memory.shelter, undefined)
    assert.equal(c.sheltered, false)
    assert.equal(c.bot.entity.position.x, 1.5)
})

test('ordinary ground vegetation is cleared before bed placement instead of preventing sleep', async () => {
    const { c, state, blocks } = restWorld()
    for (let x = -4; x <= 4; x++) {
        for (let z = -4; z <= 4; z++) {
            blocks.set(new Vec3(x, 64, z).toString(), 'short_grass')
        }
    }
    c.bot.canDigBlock = () => true
    c.bot.dig = async b => blocks.set(b.position.toString(), 'air')
    await sleepSafely(c, state)
    assert.equal(c.bot.isSleeping, true)
})
