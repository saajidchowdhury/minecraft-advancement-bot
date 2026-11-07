'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const { SurvivalController } = require('../src/survival-bot')
const { chooseAction } = require('../src/decision-engine')

function fixture() {
    const c = Object.create(SurvivalController.prototype)
    c.bot = new EventEmitter()
    Object.assign(c.bot, {
        entity: { position: new Vec3(0.5, 64, 0.5), eyeHeight: 1.62, yaw: 0, pitch: 0 },
        health: 20, entities: {}, game: { dimension: 'overworld' },
        registry: { entitiesByName: { enderman: { metadataKeys: ['creepy', 'stared_at'] } } },
        world: { raycast: () => null }, look: async (yaw, pitch, force) => { c.aims.push({ yaw, pitch, force }) }
    })
    c.aims = []
    c.running = c.busy = true
    c.memory = {}
    c.activeAction = 'mine_iron'
    c.actionAbort = new AbortController()
    c.log = { warn() {}, info() {} }
    c.cancellations = []
    c.cancelCurrentTask = reason => { c.cancellations.push(reason); c.actionAbort.abort() }
    c.canSee = () => true
    c.positionText = () => '0,64,0'
    return c
}

test('enderman danger takes priority over eating, cornered combat and mining', () => {
    for (const health of [4, 20]) {
        assert.equal(chooseAction({ health, food: 10, hasFood: true, hasWeapon: true, cornered: true,
            hostileDistance: 2, endermanDanger: true }), 'avoid_enderman')
    }
})

test('an enderman hit behind the bot interrupts mining without aiming at its head', () => {
    const c = fixture()
    c.bindEvents()
    const source = { id: 42, isValid: true, name: 'enderman', height: 2.9, position: new Vec3(0.5, 64, 2.5) }
    c.bot.entities[42] = source
    c.bot.emit('entityHurt', c.bot.entity, source)
    assert.equal(c.cancellations.length, 1)
    assert.equal(c.endermanThreat?.id, 42)
    assert.equal(c.lastHitBearing == null, true)
    assert.equal(c.endermanDanger(), true)
    c.activeAction = 'avoid_enderman'
    c.actionAbort = new AbortController()
    c.bot.health = 3
    c.bot.emit('health')
    assert.equal(c.cancellations.length, 1)
})

test('all look callers avoid a visible enderman face, including a yaw sweep', async () => {
    const c = fixture()
    c.bot.entities[42] = { id: 42, name: 'enderman', isValid: true, height: 2.9, position: new Vec3(0.5, 64, -7.5) }
    c.configureLooking()
    const facePitch = Math.atan2(2.55 - 1.62, 8)
    await c.bot.look(0, facePitch, false)
    assert.ok(c.aims.at(-1).pitch < facePitch - 0.1)
    c.bot.entity.yaw = -Math.PI / 2
    await c.bot.look(Math.PI / 2, facePitch, false)
    assert.equal(c.aims.at(-1).force, true)
    c.bot.world.raycast = () => ({ position: new Vec3(0, 65, -3) })
    await c.bot.look(0, facePitch, true)
    assert.equal(c.aims.at(-1).pitch, facePitch)
})

test('the look guard covers the wider gaze trigger at long range', async () => {
    const c = fixture()
    c.bot.entities[42] = { id: 42, name: 'enderman', isValid: true, position: new Vec3(0.5, 64, -49.5) }
    c.configureLooking()
    const pitch = Math.atan2(2.55 - 1.62, 50)
    await c.bot.look(0.025, pitch, true)
    assert.ok(c.aims.at(-1).pitch < 0)
})

test('neutral endermen do not cause retreat; observed anger does and is dimension scoped', () => {
    const c = fixture()
    const e = { id: 42, name: 'enderman', isValid: true, position: new Vec3(0, 64, 5), metadata: { 0: false, 1: false } }
    c.bot.entities[42] = e
    assert.equal(c.endermanDanger(), false)
    e.metadata[0] = true
    assert.equal(c.endermanDanger(), true)
    c.bot.entities = {}
    c.bot.game.dimension = 'the_nether'
    assert.equal(c.endermanDanger(), false)
})

test('a still-present enderman cannot be declared safe just because sixty seconds elapsed', () => {
    const c = fixture()
    c.canSee = () => false
    c.endermanThreat = { id: 42, dimension: 'overworld', at: Date.now() - 61000 }
    c.bot.entities[42] = { id: 42, name: 'enderman', isValid: true, position: new Vec3(0, 64, 1), metadata: { 0: true } }
    assert.equal(c.endermanDanger(), true)
    c.bot.entities = {}
    assert.equal(c.endermanDanger(), false)
})

test('enderman refuge pours water before digging, verifies enclosure and keeps it closed', async () => {
    const c = fixture()
    c.bot.food = 20
    c.bot.pathfinder = { setGoal() {} }
    c.bot.clearControlStates = () => {}
    const order = []
    c.bestItem = () => ({ name: 'water_bucket' })
    c.bestFood = () => null
    c.bot.blockAt = () => ({ boundingBox: 'block' })
    c.bot.equip = async () => order.push('equip')
    c.bot.lookAt = async () => order.push('aim')
    c.bot.activateItem = () => order.push('water')
    c.bot.deactivateItem = () => {}
    c.bot.waitForTicks = async () => {}
    c.hasEnclosedShelter = () => true
    c.burrow = async () => { order.push('burrow'); c.shelterCenter = new Vec3(0, 61, 0) }
    await c.avoidEnderman()
    assert.deepEqual(order, ['equip', 'aim', 'water', 'burrow'])
    order.length = 0
    await c.avoidEnderman()
    assert.deepEqual(order, [])
})

test('refuge cancellation during equip prevents pouring or digging', async () => {
    const c = fixture()
    c.bot.pathfinder = { setGoal() {} }
    c.bot.clearControlStates = () => {}
    c.bestItem = () => ({ name: 'water_bucket' })
    c.bot.blockAt = () => ({ boundingBox: 'block' })
    c.bot.equip = async () => c.actionAbort.abort()
    c.bot.activateItem = () => assert.fail('poured after cancellation')
    c.burrow = async () => assert.fail('dug after cancellation')
    await assert.rejects(c.avoidEnderman(), /cancelled/)
})

test('a refuge roof replaces flowing water rather than silently leaving the shaft open', async () => {
    const c = fixture()
    const roof = new Vec3(0, 66, 0)
    let placed = false
    c.bot.blockAt = p => ({ position: p, name: p.equals(roof) ? 'water' : 'stone',
        boundingBox: p.equals(roof) ? 'empty' : 'block' })
    c.bot.equip = async () => {}
    c.bot.setControlState = () => {}
    c.bot.placeBlock = async () => { placed = true }
    c.bestItem = () => ({ name: 'cobblestone' })
    await c.placeSurvivalBlock(roof)
    assert.equal(placed, true)
})

test('enderman danger interrupts follow mode before it issues another movement goal', async () => {
    const c = fixture()
    c.busy = false
    c.followPlayer = 'owner'
    c.bot.players = { owner: { entity: { position: new Vec3(5, 64, 0) } } }
    c.bot.pathfinder = { isMoving: () => false, setGoal: () => assert.fail('followed while threatened') }
    c.endermanDanger = () => true
    c.observe = () => ({ health: 20, food: 20, endermanDanger: true, completedAdvancements: new Set() })
    c.failures = new Map()
    c.inventorySummary = () => ''
    c.verifyActionProgress = c.onState = c.scheduleLoop = () => {}
    let performed
    c.performWithTimeout = async action => { performed = action }
    await c.tick()
    assert.equal(performed, 'avoid_enderman')
})

test('an enderman blocking the shaft roof triggers a sealed two-high side refuge', async () => {
    const c = fixture()
    const blocks = new Map()
    const dug = []
    c.bot.entity.position = new Vec3(0.5, 61, 0.5)
    c.bot.food = 20
    c.bot.blockAt = p => {
        const name = blocks.get(p.toString()) || (p.y >= 64 || (p.x === 0 && p.z === 0 && p.y >= 61) ? 'air' : 'stone')
        return { position: p, name, diggable: true, boundingBox: name === 'air' ? 'empty' : 'block',
            shapes: name === 'air' ? [] : [[0, 0, 0, 1, 1, 1]] }
    }
    c.bot.pathfinder = { setGoal() {} }
    c.bot.clearControlStates = () => {}
    c.bot.waitForTicks = async () => {}
    c.bot.dig = async b => { dug.push(b.position); blocks.set(b.position.toString(), 'air') }
    c.equipStoneDigTool = async () => {}
    c.gotoWithTimeout = async goal => { c.bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5) }
    c.placeSurvivalBlock = async p => { blocks.set(p.toString(), 'cobblestone') }
    c.burrow = async () => { throw new Error('roof refused: enderman occupies shaft') }
    c.makeNightSafe = async () => assert.fail('built a cage in the occupied shaft')
    c.bestItem = c.bestFood = () => null
    c.endermanDanger = () => false
    await c.avoidEnderman()
    assert.equal(dug.length, 4)
    assert.equal(dug.every(p => p.y === 61 || p.y === 62), true)
    assert.equal(c.hasEnclosedShelter(c.shelterCenter), true)
    assert.equal(c.bot.entity.position.distanceTo(new Vec3(0.5, 61, 0.5)), 2)
    assert.equal(c.bot.blockAt(new Vec3(1, 63, 0)).name, 'stone')
})
