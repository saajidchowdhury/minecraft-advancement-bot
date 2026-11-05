'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const { SurvivalController } = require('../src/survival-bot')
const { Actions } = require('../src/decision-engine')

function shelterWorld() {
    const blocks = new Map()
    const c = {
        memory: {}, running: true, paused: false, sheltered: false, actionAbort: new AbortController(),
        log: { info() {}, warn() {} }, countItems: () => 64, findNearestBlock: () => null,
        bot: {
            health: 20, game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, 64, 0.5) },
            blockAt(p) {
                const name = blocks.get(p.toString()) || (p.y < 64 ? 'stone' : 'air')
                return { name, position: p, boundingBox: name === 'air' ? 'empty' : 'block',
                    shapes: name === 'air' ? [] : [[0, 0, 0, 1, 1, 1]] }
            }
        },
        async placeSurvivalBlock(p) { blocks.set(p.toString(), 'cobblestone') },
        blocks
    }
    c.isEmptyPlacementBlock = SurvivalController.prototype.isEmptyPlacementBlock.bind(c)
    c.checkAction = SurvivalController.prototype.checkAction.bind(c)
    c.hasEnclosedShelter = SurvivalController.prototype.hasEnclosedShelter.bind(c)
    return c
}

test('critical-health events interrupt mining but do not cancel an active escape', () => {
    let cancellations = 0
    const bot = new EventEmitter()
    bot.health = 4
    const c = { bot, busy: true, activeAction: Actions.ESCAPE, lastAction: Actions.ESCAPE,
        cancelCurrentTask() { cancellations++ } }
    SurvivalController.prototype.bindEvents.call(c)
    bot.emit('health')
    assert.equal(cancellations, 0)
    c.activeAction = Actions.IRON
    bot.emit('health')
    assert.equal(cancellations, 1)
})

test('a failed wall placement cannot produce a complete shelter', async () => {
    const c = shelterWorld()
    const place = c.placeSurvivalBlock
    c.placeSurvivalBlock = async p => {
        if (p.equals(new Vec3(1, 65, 0))) {
            throw new Error('simulated placement failure')
        }
        await place(p)
    }
    await assert.rejects(SurvivalController.prototype.makeNightSafe.call(c), /incomplete|enclosure/)
    assert.equal(c.sheltered, false)
})

test('a cancelled shelter stops placing blocks and cannot announce completion', async () => {
    const c = shelterWorld()
    let placements = 0
    c.placeSurvivalBlock = async () => {
        placements++
        if (placements === 3) {
            c.actionAbort.abort()
        }
    }
    await assert.rejects(SurvivalController.prototype.makeNightSafe.call(c), /cancelled/)
    assert.equal(placements, 3)
    assert.equal(c.sheltered, false)
})

test('completed shelter geometry can be checked again after a wall is destroyed', async () => {
    const c = shelterWorld()
    await SurvivalController.prototype.makeNightSafe.call(c)
    assert.equal(c.sheltered, true)
    assert.equal(c.hasEnclosedShelter(c.shelterCenter), true)
    c.blocks.set(new Vec3(1, 65, 0).toString(), 'air')
    assert.equal(c.hasEnclosedShelter(c.shelterCenter), false)
})

test('cancellation during equipping prevents the subsequent placement packet', async () => {
    const c = shelterWorld()
    let placed = false
    c.bestItem = () => ({ name: 'cobblestone' })
    c.bot.equip = async () => { c.actionAbort.abort() }
    c.bot.placeBlock = async () => { placed = true }
    await assert.rejects(SurvivalController.prototype.placeSurvivalBlock.call(c, new Vec3(1, 64, 0)), /cancelled/)
    assert.equal(placed, false)
})

test('a repeated death during the same recovery preserves the first drop age and attempt count', () => {
    const bot = new EventEmitter()
    bot.health = 20
    bot.game = { dimension: 'overworld' }
    bot.entity = { position: new Vec3(-54, 74, 32) }
    const diedAt = Date.now() - 60000
    const c = { bot, memory: { lastDeath: { x: -52, y: 75, z: 32, dimension: 'overworld', diedAt, attempts: 2 } },
        log: { warn() {} }, cancelCurrentTask() {} }
    SurvivalController.prototype.bindEvents.call(c)
    bot.emit('death')
    assert.equal(c.memory.lastDeath.diedAt, diedAt)
    assert.equal(c.memory.lastDeath.attempts, 2)
    assert.equal(c.memory.lastDeath.x, -54)
    bot.game.dimension = 'the_nether'
    bot.emit('death')
    assert.equal(c.memory.lastDeath.attempts, 0)
    assert.equal(c.memory.lastDeath.dimension, 'the_nether')
})

test('damage invalidates shelter and reports nearby threats without interrupting escape', () => {
    const bot = new EventEmitter()
    bot.health = 20
    bot.entity = { position: new Vec3(0, 64, 0) }
    bot.entities = { 1: { name: 'zombie', isValid: true, position: new Vec3(3, 64, 0) } }
    let cancellations = 0
    const messages = []
    const c = { bot, running: true, busy: true, sheltered: true, shelterCenter: new Vec3(0, 64, 0),
        activeAction: Actions.ESCAPE, log: { warn: message => messages.push(message) },
        positionText: () => '0,64,0', cancelCurrentTask() { cancellations++ } }
    SurvivalController.prototype.bindEvents.call(c)
    bot.health = 4
    bot.emit('health')
    assert.equal(c.sheltered, false)
    assert.equal(c.shelterCenter, null)
    assert.equal(cancellations, 0)
    assert.equal(messages.some(message => message.includes('zombie:3.0')), true)
})

test('healing at critical health does not cancel eating or shelter construction', () => {
    for (const action of [Actions.EAT, Actions.SHELTER]) {
        const bot = new EventEmitter()
        bot.health = 3
        const c = { bot, busy: true, activeAction: action, actionAbort: new AbortController(),
            cancelCurrentTask() { assert.fail('healing cancelled recovery work') } }
        SurvivalController.prototype.bindEvents.call(c)
        bot.health = 4
        bot.emit('health')
    }
})

test('repeated modest surface-night damage interrupts mining before critically low health', () => {
    const bot = new EventEmitter()
    Object.assign(bot, { health: 18, game: { dimension: 'overworld' }, time: { day: 4 },
        entity: { position: new Vec3(0, 70, 0) }, entities: {} })
    const c = { bot, running: true, busy: true, memory: {}, activeAction: 'gather_diamonds',
        isNight: () => true, log: { warn() {} }, positionText: () => '0,70,0',
        cancelCurrentTask() { c.cancelled = true } }
    SurvivalController.prototype.bindEvents.call(c)
    bot.health = 15.5
    bot.emit('health')
    assert.equal(c.cancelled, true)
    assert.equal(c.memory.nightRetreat.day, 4)
})

function creeperWorld(open) {
    const blocks = new Map()
    const placed = []
    let fled = null
    const c = {
        memory: {}, running: true, paused: false, actionAbort: new AbortController(),
        log: { info() {}, warn() {} }, countItems: () => 64,
        bot: {
            entity: { position: new Vec3(0.5, 64, 0.5) },
            blockAt(p) {
                const name = blocks.get(p.toString()) || (open(p) ? 'air' : 'stone')
                return { name, position: p, boundingBox: name === 'air' ? 'empty' : 'block' }
            }
        },
        async placeSurvivalBlock(p) { blocks.set(p.toString(), 'cobblestone'); placed.push(p) },
        // Line of sight exists only while the cell between bot and creeper at head height is open.
        canSee: () => c.bot.blockAt(new Vec3(0, 65, 1)).name === 'air',
        async escapeFrom(entity) { fled = entity },
        placed, get fled() { return fled }
    }
    c.isEmptyPlacementBlock = SurvivalController.prototype.isEmptyPlacementBlock.bind(c)
    c.checkAction = SurvivalController.prototype.checkAction.bind(c)
    return c
}

test('a creeper approaching along a one-wide tunnel is sealed out instead of chased', async () => {
    const c = creeperWorld(p => p.x === 0 && p.z >= 0 && p.y >= 64 && p.y <= 65)
    const creeper = { name: 'creeper', position: new Vec3(0.5, 64, 5.5) }
    await SurvivalController.prototype.avoidCreeper.call(c, creeper)
    assert.deepEqual(c.placed.map(String), [new Vec3(0, 64, 1), new Vec3(0, 65, 1)].map(String))
    assert.equal(c.fled, null)
})

test('a creeper in open terrain is fled rather than walled with many blocks', async () => {
    const c = creeperWorld(p => p.y >= 64)
    const creeper = { name: 'creeper', position: new Vec3(4.5, 64, 4.5) }
    await SurvivalController.prototype.avoidCreeper.call(c, creeper)
    assert.equal(c.placed.length, 0)
    assert.equal(c.fled, creeper)
})

test('a visible creeper interrupts mining but not escape, and hidden creepers are ignored', () => {
    let cancels = 0
    const bot = new EventEmitter()
    bot.entity = { position: new Vec3(0, 64, 0) }
    let visible = true
    const c = { bot, running: true, busy: true, activeAction: 'gather_diamonds', log: { warn() {} },
        canSee: () => visible, cancelCurrentTask() { cancels++ } }
    SurvivalController.prototype.bindEvents.call(c)
    const creeper = { name: 'creeper', position: new Vec3(0, 64, 5) }
    bot.emit('entityMoved', { name: 'zombie', position: new Vec3(0, 64, 2) })
    bot.emit('entityMoved', { ...creeper, position: new Vec3(0, 64, 8) })
    visible = false
    bot.emit('entityMoved', creeper)
    assert.equal(cancels, 0)
    visible = true
    bot.emit('entityMoved', creeper)
    assert.equal(cancels, 1)
    c.activeAction = Actions.ESCAPE
    bot.emit('entityMoved', creeper)
    assert.equal(cancels, 1)
})

test('a perception fault still escapes a nearby hostile instead of idling to death', async () => {
    const performed = []
    const zombie = { name: 'zombie', position: new Vec3(2, 64, 0) }
    const c = {
        running: true, paused: false, busy: false, followPlayer: null, failures: new Map(),
        bot: { entity: { position: new Vec3(0, 64, 0) }, health: 12, food: 20 },
        log: { info() {}, warn() {} },
        observe() { throw new Error("Cannot read properties of undefined (reading 'equals')") },
        nearestEntity: () => zombie,
        async performWithTimeout(action, state) { performed.push([action, state.hostile]) },
        scheduleLoop() {}, clearCurrentTask() {}
    }
    await SurvivalController.prototype.tick.call(c)
    assert.deepEqual(performed, [[Actions.ESCAPE, zombie]])
    assert.equal(c.busy, false)
    c.nearestEntity = () => null
    await SurvivalController.prototype.tick.call(c)
    assert.deepEqual(performed.at(-1), ['wait', null])
})

test('earned advancements and deaths are recorded for throughput comparisons', () => {
    const bot = new EventEmitter()
    bot._client = new EventEmitter()
    bot.entity = { position: new Vec3(0, 64, 0) }
    bot.game = { dimension: 'overworld' }
    bot.chat = () => {}
    bot.loadPlugin = () => {}
    const runStats = { earned: [], deaths: [] }
    const c = new SurvivalController(bot, { runStats, log: { info() {}, warn() {}, error() {} } })
    c.running = true
    c.cancelCurrentTask = () => {}
    c.advancements.onComplete('minecraft:story/mine_diamond', true)
    c.advancements.onComplete('minecraft:story/iron_tools', false)
    bot.emit('death')
    assert.deepEqual(runStats.earned.map(e => e.id), ['minecraft:story/iron_tools'])
    assert.equal(runStats.deaths.length, 1)
})

test('daytime melee damage interrupts work so the bot fights or escapes before critical health', () => {
    let cancels = []
    const bot = new EventEmitter()
    bot.health = 20
    bot.entity = { position: new Vec3(0, 64, 0) }
    bot.entities = {}
    bot.game = { dimension: 'overworld' }
    const zombie = { name: 'zombie', position: new Vec3(1.2, 64, 0) }
    const c = { bot, busy: true, running: true, activeAction: Actions.WOOD, lastAction: Actions.WOOD, sheltered: false,
        log: { warn() {} }, positionText: () => '0,64,0', isNight: () => false, nearestEntity: () => zombie, cancelCurrentTask(reason) { cancels.push(reason) } }
    SurvivalController.prototype.bindEvents.call(c)
    bot.health = 17.54
    bot.emit('health')
    assert.deepEqual(cancels, ['attacked by zombie'])
    c.activeAction = Actions.FIGHT
    bot.health = 15
    bot.emit('health')
    assert.equal(cancels.length, 1)
    c.activeAction = Actions.WOOD
    c.nearestEntity = () => null
    bot.health = 14
    bot.emit('health')
    assert.equal(cancels.length, 1)
})

test('one unreachable death drop does not stop collection of the reachable stacks', async () => {
    const visited = []
    const c = {
        running: true, paused: false, actionAbort: new AbortController(), log: { warn() {} }, rememberBlockedTarget() {},
        bot: { entity: { position: new Vec3(0, 64, 0) } },
        async gotoWithTimeout(goal) {
            visited.push(goal.x)
            if (goal.x === 4) {
                throw new Error('item pickup timed out after 8s')
            }
        }
    }
    const item = x => ({ name: 'item', isValid: true, position: new Vec3(x + 0.3, 64, 0.4) })
    await SurvivalController.prototype.collectTarget.call(c, [item(4), item(2)], null, 'death drops')
    assert.deepEqual(visited, [4, 2])
    await assert.rejects(SurvivalController.prototype.collectTarget.call(c, [item(4)], null, 'death drops'), /timed out/)
})
