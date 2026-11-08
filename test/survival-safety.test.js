'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const { SurvivalController } = require('../src/survival-bot')
const { Actions } = require('../src/decision-engine')

test('disconnect before Mineflayer injects its plugins stops the controller cleanly', () => {
    const bot = new EventEmitter()
    bot._client = new EventEmitter()
    bot.loadPlugin = () => {}
    const controller = new SurvivalController(bot, { log: { warn() {} } })
    assert.doesNotThrow(() => controller.stop())
})

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
        async placeSurvivalBlock(p) { blocks.set(p.toString(), 'cobblestone'); c.placed.push(p) },
        async burrow() { throw new Error('no hand-diggable enclosed column below') },
        blocks, placed: []
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
    await SurvivalController.prototype.takeCover.call(c, creeper)
    assert.deepEqual(c.placed.map(String), [new Vec3(0, 64, 1), new Vec3(0, 65, 1)].map(String))
    assert.equal(c.fled, null)
})

test('a creeper in open terrain is fled rather than walled with many blocks', async () => {
    const c = creeperWorld(p => p.y >= 64)
    const creeper = { name: 'creeper', position: new Vec3(4.5, 64, 4.5) }
    await SurvivalController.prototype.takeCover.call(c, creeper)
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

test('a confirmed hit from behind interrupts digging and turns an armored bot to fight', async () => {
    const bot = new EventEmitter()
    bot.entity = { position: new Vec3(0.5, 64, 0.5), yaw: 0, pitch: 0 }
    bot.game = { dimension: 'overworld' }
    bot.health = 20
    bot.world = { raycast: () => null }
    const zombie = { isValid: true, name: 'zombie', height: 1.9, position: new Vec3(0.5, 64, 2) }
    bot.entities = { 1: zombie }
    bot.nearestEntity = predicate => predicate(zombie) ? zombie : null
    bot.lookAt = async point => {
        assert.ok(point.z > bot.entity.position.z)
        bot.entity.yaw = Math.PI
    }
    const c = Object.create(SurvivalController.prototype)
    const actions = []
    Object.assign(c, {
        bot, running: true, busy: true, activeAction: 'fill_water_bucket', actionAbort: new AbortController(),
        memory: {}, failures: new Map(),
        log: { info() {}, warn() {} }, isNight: () => false, onState() {}, inventorySummary: () => '',
        scheduleLoop() {}, verifyActionProgress() {},
        observe() {
            const hostile = c.nearestEntity(new Set(['zombie']), 4)
            return {
                health: bot.health, food: 16, hasFood: true, hasWeapon: true, armorPoints: 18, underground: true,
                hostile, hostileDistance: hostile ? 1.5 : Infinity, visibleHostiles: hostile ? 1 : 0,
                completedAdvancements: new Set()
            }
        },
        async performWithTimeout(action, state) { actions.push([action, state.hostile]) }
    })
    c.bindEvents()
    assert.equal(c.canSee(zombie), false)
    bot.emit('entityHurt', bot.entity)
    bot.emit('entityHurt', { position: bot.entity.position }, zombie)
    assert.equal(c.actionAbort.signal.aborted, false)
    bot.emit('entityHurt', bot.entity, zombie)
    bot.health = 17.62
    bot.emit('health')
    assert.equal(c.actionAbort.signal.reason, 'attacked by zombie')
    assert.equal(c.canSee(zombie), false)
    c.busy = false
    c.activeAction = null
    await c.tick()
    assert.deepEqual(actions, [[Actions.FIGHT, zombie]])
})

test('one unreachable death drop does not stop collection of the reachable stacks', async () => {
    const visited = []
    const c = {
        running: true, paused: false, actionAbort: new AbortController(), log: { warn() {} }, rememberBlockedTarget() {},
        bot: { entity: { position: new Vec3(0, 64, 0) } }, canSee: () => true,
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

function burrowWorld(overrides = {}) {
    const blocks = new Map(Object.entries(overrides))
    let dirt = 0
    const c = {
        memory: {}, running: true, paused: false, sheltered: false, actionAbort: new AbortController(), log: { info() {}, warn() {} },
        countItems: () => dirt, positionText: () => String(c.bot.entity.position.floored()),
        bot: {
            registry: {}, game: { dimension: 'overworld' }, health: 20, entity: { position: new Vec3(0.5, 64, 0.5) },
            blockAt(p) {
                const name = blocks.get(p.toString()) || (p.y < 64 ? 'dirt' : 'air')
                return { name, position: p, diggable: name !== 'air', boundingBox: name === 'air' || name === 'water' ? 'empty' : 'block',
                    shapes: name === 'air' ? [] : [[0, 0, 0, 1, 1, 1]] }
            },
            digTime: () => 750,
            async dig(block) {
                blocks.set(block.position.toString(), 'air')
                dirt++
                c.bot.entity.position = block.position.offset(0.5, 0, 0.5)
            },
            waitForTicks: async () => {}
        },
        async placeSurvivalBlock(p) { blocks.set(p.toString(), 'dirt'); dirt-- },
        blocks
    }
    for (const name of ['isEmptyPlacementBlock', 'checkAction', 'hasEnclosedShelter']) {
        c[name] = SurvivalController.prototype[name].bind(c)
    }
    return c
}

test('an empty-handed bot burrows three blocks down and plugs the top before night threats arrive', async () => {
    const c = burrowWorld()
    await SurvivalController.prototype.burrow.call(c)
    assert.deepEqual(c.bot.entity.position.floored(), new Vec3(0, 61, 0))
    assert.equal(c.blocks.get(new Vec3(0, 63, 0).toString()), 'dirt')
    assert.equal(c.sheltered, true)
    assert.deepEqual(c.shelterCenter, new Vec3(0, 61, 0))
})

test('burrowing is refused over water, falling blocks or an open cave below', async () => {
    for (const hazard of [{ [new Vec3(1, 62, 0)]: 'water' }, { [new Vec3(0, 62, 0)]: 'gravel' }, { [new Vec3(0, 60, 0)]: 'air' }, { [new Vec3(1, 61, 1)]: 'air' }]) {
        const c = burrowWorld(hazard)
        await assert.rejects(SurvivalController.prototype.burrow.call(c), /no hand-diggable enclosed column/)
        assert.equal(c.bot.entity.position.y, 64)
    }
})

test('a refused burrow names the open wall, floor or column cell that blocked it', async () => {
    for (const [hazard, reason] of [[{ [new Vec3(1, 61, 1)]: 'air' }, /wall cell \(1, 61, 1\) is air/],
        [{ [new Vec3(0, 60, 0)]: 'air' }, /floor \(0, 60, 0\) is air/], [{ [new Vec3(0, 62, 0)]: 'gravel' }, /column cell \(0, 62, 0\) is gravel/]]) {
        await assert.rejects(SurvivalController.prototype.burrow.call(burrowWorld(hazard)), reason)
    }
})

test('a refused mining descent leaves an intact shelter closed and disables retries there', async () => {
    const c = shelterWorld()
    const center = new Vec3(0, 64, 0)
    c.shelterCenter = center
    c.sheltered = true
    c.memory.shelter = { x: center.x, y: center.y, z: center.z }
    c.hasEnclosedShelter = p => p.equals(center)
    c.bestItem = () => ({ name: 'stone_pickaxe' })
    c.bot.equip = async () => {}
    await SurvivalController.prototype.mineFromShelter.call(c)
    assert.equal(c.memory.shelter.descentFailed, true)
    assert.equal(c.sheltered, true)
})

test('the shelter roof is seated on a wall-top block, and a failed shell falls back to burrowing', async () => {
    const c = shelterWorld()
    await SurvivalController.prototype.makeNightSafe.call(c)
    const order = c.placed.map(String)
    assert.ok(order.indexOf(String(new Vec3(1, 66, 0))) < order.indexOf(String(new Vec3(0, 66, 0))))
    const failing = shelterWorld()
    let burrowed = false
    failing.burrow = async () => { burrowed = true }
    const place = failing.placeSurvivalBlock
    failing.placeSurvivalBlock = async p => {
        if (p.equals(new Vec3(1, 65, 0))) {
            throw new Error('simulated placement failure')
        }
        await place(p)
    }
    await SurvivalController.prototype.makeNightSafe.call(failing)
    assert.equal(burrowed, true)
})

test('the shelter uses another wall when a non-solid block obstructs the first roof support', async () => {
    const c = shelterWorld()
    const east = new Vec3(1, 66, 0)
    const west = new Vec3(-1, 66, 0)
    const blockAt = c.bot.blockAt
    c.bot.blockAt = p => p.equals(east) ? { name: 'vine', position: p, boundingBox: 'empty', shapes: [] } : blockAt(p)
    c.bestItem = () => ({ name: 'cobblestone' })
    c.bot.equip = async () => {}
    c.bot.placeBlock = async (ref, face) => { c.blocks.set(ref.position.plus(face).toString(), 'cobblestone') }
    c.placeSurvivalBlock = SurvivalController.prototype.placeSurvivalBlock.bind(c)
    await SurvivalController.prototype.makeNightSafe.call(c)
    assert.equal(c.blocks.get(west.toString()), 'cobblestone')
    assert.equal(c.sheltered, true)
})

test('fleeing a creeper keeps running until it is ten blocks away', async () => {
    const c = creeperWorld(p => p.y >= 64)
    let legs = 0
    const creeper = { name: 'creeper', isValid: true, position: new Vec3(4.5, 64, 4.5) }
    c.escapeFrom = async () => {
        legs++
        c.bot.entity.position = c.bot.entity.position.offset(-3, 0, -3)
    }
    await SurvivalController.prototype.takeCover.call(c, creeper)
    assert.equal(legs, 2)
    assert.ok(c.bot.entity.position.distanceTo(creeper.position) >= 10)
})

test('a creeper that closes within four blocks is met behind a raised shield, not with a turned back', async () => {
    const c = creeperWorld(() => true)
    const events = []
    const creeper = { name: 'creeper', isValid: true, position: new Vec3(6.5, 64, 0.5) }
    Object.assign(c.bot, {
        inventory: { slots: { 45: { name: 'shield' } } },
        activateItem(offHand) { events.push(`raise:${offHand}`) },
        deactivateItem() { events.push('lower') },
        async lookAt(p) { assert.ok(p.x > c.bot.entity.position.x) },
        async waitForTicks() { creeper.isValid = false }
    })
    c.canSee = () => true
    c.braceAgainst = SurvivalController.prototype.braceAgainst?.bind(c)
    c.escapeFrom = async () => {
        events.push('flee')
        creeper.position = creeper.position.offset(-3, 0, 0)
    }
    await SurvivalController.prototype.takeCover.call(c, creeper, 8)
    assert.deepEqual(events, ['flee', 'raise:true', 'lower'])
})

test('a visible archer is fled until out of sight, not just a fixed distance', async () => {
    const c = creeperWorld(p => p.y >= 64)
    let legs = 0
    let visible = true
    c.canSee = () => visible
    const skeleton = { name: 'skeleton', isValid: true, position: new Vec3(6.5, 64, 6.5) }
    c.escapeFrom = async () => {
        legs++
        visible = legs < 2
    }
    await SurvivalController.prototype.takeCover.call(c, skeleton, 24)
    assert.equal(legs, 2)
})

test('a death among archers or a crowd is marked dangerous and its drops are not recovered', () => {
    const bot = new EventEmitter()
    bot.health = 20
    bot.game = { dimension: 'overworld' }
    bot.entity = { position: new Vec3(-154, 67, 31) }
    bot.entities = { 1: { name: 'skeleton', isValid: true, position: new Vec3(-152, 67, 31) } }
    const c = { bot, memory: {}, log: { warn() {} }, cancelCurrentTask() {} }
    SurvivalController.prototype.bindEvents.call(c)
    bot.emit('death')
    assert.equal(c.memory.lastDeath.dangerous, true)
    bot.entities = { 1: { name: 'zombie', isValid: true, position: new Vec3(-140, 67, 31) } }
    c.memory = {}
    bot.emit('death')
    assert.equal(c.memory.lastDeath.dangerous, false)
    c.memory = {}
    c.inLava = () => true
    bot.emit('death')
    assert.equal(c.memory.lastDeath.dangerous, true)
})

test('plank preparation grows one wood type when mixed planks cannot fill a recipe', async () => {
    const inventory = [{ name: 'birch_planks', count: 5 }, { name: 'oak_planks', count: 1 }, { name: 'oak_log', count: 1 }, { name: 'birch_log', count: 2 }]
    const crafted = []
    const c = {
        bot: { inventory: { items: () => inventory } },
        async craftItem(name, count) {
            crafted.push(name)
            const log = inventory.find(i => i.name === name.replace('_planks', '_log'))
            log.count--
            if (!log.count) { inventory.splice(inventory.indexOf(log), 1) }
            inventory.push({ name, count: 4 })
        }
    }
    await SurvivalController.prototype.ensurePlanks.call(c, 6)
    assert.deepEqual(crafted, ['birch_planks'])
})

test('threat cancellations replan within 100 ms instead of the routine 1.5 s', async () => {
    const delays = []
    const c = {
        running: true, paused: false, busy: false, followPlayer: null, failures: new Map(),
        bot: { entity: { position: new Vec3(0, 64, 0) }, health: 20, food: 20 }, log: { info() {}, warn() {} },
        observe() { throw new Error('perception fault') }, nearestEntity: () => null,
        async performWithTimeout() { c.cancelCurrentTask('creeper approaching') },
        scheduleLoop(delay) { delays.push(delay) }, clearCurrentTask() {}
    }
    c.cancelCurrentTask = SurvivalController.prototype.cancelCurrentTask.bind(c)
    await SurvivalController.prototype.tick.call(c)
    c.performWithTimeout = async () => {}
    await SurvivalController.prototype.tick.call(c)
    assert.deepEqual(delays, [100, 250])
})

test('an off-centre burrow steps into its own hole instead of failing the descent', async () => {
    const c = burrowWorld()
    c.bot.entity.position = new Vec3(0.95, 64, 0.5)
    const dig = c.bot.dig
    // The bot only drops when its 0.6-wide box is over the dug cell, not resting on a neighbour.
    c.bot.dig = async block => {
        const before = c.bot.entity.position
        await dig(block)
        c.bot.entity.position = Math.abs(before.x - 0.5) < 0.2 ? block.position.offset(0.5, 0, 0.5) : before
    }
    c.gotoWithTimeout = async goal => { c.bot.entity.position = new Vec3(goal.x + 0.5, goal.y, goal.z + 0.5) }
    await SurvivalController.prototype.burrow.call(c)
    assert.deepEqual(c.bot.entity.position.floored(), new Vec3(0, 61, 0))
    assert.equal(c.sheltered, true)
})

test('an armored bot stops fleeing to fight a zombie that keeps hitting it, but never near a creeper', () => {
    const cancels = []
    const bot = new EventEmitter()
    bot.health = 16.95
    bot.entity = { position: new Vec3(0, 64, 0) }
    bot.entities = {}
    bot.game = { dimension: 'overworld' }
    bot.inventory = { slots: Object.assign([], { 5: { name: 'diamond_helmet' }, 6: { name: 'iron_chestplate' }, 7: { name: 'iron_leggings' }, 8: { name: 'iron_boots' } }) }
    const zombie = { name: 'zombie', position: new Vec3(1.3, 64, 0) }
    let creeper = null
    const c = { bot, busy: true, running: true, activeAction: Actions.ESCAPE, sheltered: false, log: { warn() {} },
        positionText: () => '0,64,0', isNight: () => false, canSee: () => true,
        nearestEntity: names => names.has('creeper') && !names.has('zombie') ? creeper : zombie,
        cancelCurrentTask(reason) { cancels.push(reason) } }
    SurvivalController.prototype.bindEvents.call(c)
    creeper = { name: 'creeper', position: new Vec3(3, 64, 0) }
    bot.health = 15.7
    bot.emit('health')
    assert.equal(cancels.length, 0)
    creeper = null
    bot.health = 14.5
    bot.emit('health')
    assert.deepEqual(cancels, ['attacked while fleeing by zombie'])
})

test('charging an archer keeps the shield raised and lowers it only to strike', async () => {
    const events = []
    const skeleton = { name: 'skeleton', isValid: true, position: new Vec3(6, 64, 0), height: 1.99 }
    const c = {
        running: true, paused: false, actionAbort: new AbortController(), log: { warn() {} },
        bestItem: () => ({ name: 'iron_sword' }), rememberBlockedTarget() {}, collectTarget: async () => {},
        bot: {
            health: 20, entity: { position: new Vec3(0, 64, 0) }, entities: {},
            inventory: { slots: Object.assign([], { 45: { name: 'shield' } }) },
            equip: async () => {}, lookAt: async () => {},
            activateItem: offhand => events.push(offhand && c.bot.entity.position.distanceTo(skeleton.position) > 3.1 ? 'raise at range' : 'raise'),
            deactivateItem: () => events.push('lower'),
            attack: () => { events.push('attack'); skeleton.isValid = false },
            pathfinder: { setGoal: goal => { if (goal) { setTimeout(() => { c.bot.entity.position = new Vec3(4, 64, 0) }, 150) } } }
        }
    }
    c.checkAction = SurvivalController.prototype.checkAction.bind(c)
    c.visibleThreatCount = SurvivalController.prototype.visibleThreatCount.bind(c)
    c.closeMelee = SurvivalController.prototype.closeMelee.bind(c)
    await SurvivalController.prototype.fight.call(c, skeleton)
    assert.equal(events[0], 'raise at range')
    assert.ok(events.indexOf('lower') < events.indexOf('attack'))
    assert.ok(events.filter(e => e === 'lower').length >= events.filter(e => e.startsWith('raise')).length)
    assert.equal(events.at(-1), 'lower')
})

test('a visible archer joining ends an unarmored melee fight before the next attack', async () => {
    // A second zombie alone is now fought with kiting (staged rounds 4-5); an archer still forces a withdrawal.
    const zombie = { name: 'zombie', isValid: true, position: new Vec3(1, 64, 0) }
    const other = { name: 'skeleton', isValid: true, position: new Vec3(4, 64, 0) }
    let attacks = 0
    const c = {
        running: true, actionAbort: new AbortController(), canSee: () => true,
        bestItem: () => ({ name: 'wooden_sword' }),
        bot: {
            health: 17, entity: { position: new Vec3(0, 64, 0) }, entities: { 1: zombie }, inventory: { slots: [] },
            blockAt: p => ({ name: p.y < 64 ? 'stone' : 'air', boundingBox: p.y < 64 ? 'block' : 'empty' }),
            equip: async () => {}, lookAt: async () => {}, pathfinder: { setGoal() {} },
            attack() {
                attacks++
                if (attacks === 1) {
                    this.entities[2] = other
                } else {
                    zombie.isValid = false
                }
            }
        }
    }
    c.checkAction = SurvivalController.prototype.checkAction.bind(c)
    c.visibleThreatCount = SurvivalController.prototype.visibleThreatCount.bind(c)
    await assert.rejects(SurvivalController.prototype.fight.call(c, zombie), /outnumbered/)
    assert.equal(attacks, 1)
    assert.equal(c.urgentReplan, true)
})

test('successful actions replan after 250 ms while failures keep the 1.5 s back-off', async () => {
    const delays = []
    let fail = false
    const state = { health: 20, food: 20, hostileDistance: Infinity, completedAdvancements: new Set() }
    const c = {
        running: true, paused: false, busy: false, followPlayer: null, failures: new Map(), memory: {},
        bot: { entity: { position: new Vec3(0, 64, 0) }, health: 20, food: 20 }, log: { info() {}, warn() {} },
        observe: () => state, onState() {}, inventorySummary: () => '', positionText: () => '0,64,0',
        verifyActionProgress() {}, clearCurrentTask() {}, scout: async () => {}, detectVerticalShaft: () => false, detectElevationTrap: () => null,
        async performWithTimeout() { if (fail) { throw new Error('simulated failure') } },
        scheduleLoop(delay) { delays.push(delay) }
    }
    await SurvivalController.prototype.tick.call(c)
    fail = true
    await SurvivalController.prototype.tick.call(c)
    assert.deepEqual(delays, [250, 1500])
})

test('a bot out of air underwater swims to the nearest breathable cell before any other work', async () => {
    const { chooseAction } = require('../src/decision-engine')
    assert.equal(chooseAction({ health: 14, food: 17, hostileDistance: 3, hasWeapon: true, headInWater: true, oxygen: 4 }), 'surface_for_air')
    assert.notEqual(chooseAction({ health: 20, food: 20, hostileDistance: Infinity, headInWater: true, oxygen: 18 }), 'surface_for_air')
    const pocket = new Vec3(2, 53, 0)
    const c = Object.create(SurvivalController.prototype)
    const controls = []
    c.running = true
    c.paused = false
    c.actionAbort = new AbortController()
    c.log = { warn() {} }
    c.bot = {
        health: 20, oxygenLevel: 3, entity: { position: new Vec3(0.5, 50, 0.5) },
        blockAt(p) {
            const name = p.equals(pocket.offset(0, 1, 0)) ? 'air' :
                p.y >= 50 && p.y <= 53 && Math.abs(p.x) <= 2 && p.z === 0 ? 'water' : 'stone'
            return { name, boundingBox: name === 'stone' ? 'block' : 'empty' }
        },
        setControlState(control, on) { controls.push(`${control}:${on}`) },
        lookAt: async () => {},
        async waitForTicks() { c.bot.oxygenLevel = 20 }
    }
    c.gotoWithTimeout = async () => assert.fail('navigation cannot own the swim controls')
    await c.surfaceForAir()
    assert.equal(c.bot.oxygenLevel, 20)
    assert.equal(controls.includes('jump:true'), true)
    assert.deepEqual(controls.slice(-2), ['jump:false', 'forward:false'])
})

test('a survival block is placed against plain stone before a furnace, and sneaks when only a furnace supports it', async () => {
    for (const [sideSolid, expected] of [[true, 'stone:1,0,0'], [false, 'furnace:0,1,0:sneak']]) {
        const target = new Vec3(0, -53, 0)
        const placed = []
        let sneaking = false
        const c = Object.create(SurvivalController.prototype)
        Object.assign(c, {
            running: true, paused: false, actionAbort: new AbortController(), log: { info() {}, warn() {} },
            bestItem: () => ({ name: 'cobblestone' }), isEmptyPlacementBlock: b => b?.name === 'air',
            bot: {
                health: 20, entity: { position: new Vec3(0.5, -52, 1.5) },
                blockAt(p) {
                    const name = p.equals(target.offset(0, -1, 0)) ? 'furnace' : (sideSolid && p.equals(target.offset(-1, 0, 0))) ? 'stone' : 'air'
                    return { name, position: p, boundingBox: name === 'air' ? 'empty' : 'block' }
                },
                async equip() {},
                setControlState(control, on) { if (control === 'sneak') sneaking = on },
                async placeBlock(ref, face) { placed.push(`${ref.name}:${face.x},${face.y},${face.z}${sneaking ? ':sneak' : ''}`) }
            }
        })
        await c.placeSurvivalBlock(target)
        assert.deepEqual(placed, [expected])
        assert.equal(sneaking, false)
    }
})

test('an escape pinned in its starting cell cannot turn crowd retreat into a fight', () => {
    const { chooseAction, Actions } = require('../src/decision-engine')
    const c = Object.create(SurvivalController.prototype)
    const zombie = { name: 'zombie' }
    c.bot = { entity: { position: new Vec3(242.5, -19, -126.5) } }
    c.lastAction = Actions.ESCAPE
    c.nearestEntity = (names, range) => names.has('zombie') && range >= 0.4 ? zombie : null
    c.escapeOrigin = { position: new Vec3(242.4, -19, -126.6), at: Date.now() - 1500 }
    assert.equal(c.escapePinned(), true)
    c.escapeOrigin = { position: new Vec3(242.4, -19, -126.6), at: Date.now() - 300 }
    assert.equal(c.escapePinned(), false)
    c.escapeOrigin = { position: new Vec3(238.5, -19, -126.5), at: Date.now() - 1500 }
    assert.equal(c.escapePinned(), false)
    const trapped = { health: 6.6, food: 17, hasWeapon: true, armorPoints: 15, closeHostiles: 3, visibleHostiles: 3, hostileDistance: 0.4 }
    assert.equal(chooseAction(trapped), Actions.REFUGE)
    assert.equal(chooseAction({ ...trapped, cornered: true }), Actions.REFUGE)
    assert.equal(chooseAction({ ...trapped, cornered: true, creeperDistance: 4 }), Actions.REFUGE)
    assert.equal(chooseAction({ ...trapped, cornered: true, closeHostiles: 1, visibleHostiles: 1 }), Actions.FIGHT)
})

test('burning in lava pre-empts everything: water is poured at the feet and the bot steps to dry ground', async () => {
    const { chooseAction } = require('../src/decision-engine')
    assert.equal(chooseAction({ health: 6, food: 20, hostileDistance: 2, hasWeapon: true, inLava: true, headInWater: true, oxygen: 2 }), 'escape_lava')
    const c = Object.create(SurvivalController.prototype)
    const events = []
    let goal
    c.log = { warn() {} }
    c.bot = {
        entity: { position: new Vec3(245.5, -52, -155.5), isInLava: true },
        inventory: { items: () => [{ name: 'water_bucket' }] },
        blockAt(p) {
            const name = p.y === -53 ? 'stone' : (p.x === 245 && p.z === -156) || (p.x === 246 && p.z === -156) ? 'lava' : 'air'
            return { name, boundingBox: name === 'stone' ? 'block' : 'empty' }
        },
        async equip(item) { events.push(`equip:${item.name}`) },
        async lookAt() {}, activateItem() { events.push('pour') }, deactivateItem() {},
        setControlState(control, on) { events.push(`${control}:${on}`) }
    }
    c.gotoWithTimeout = async g => { goal = g }
    assert.equal(c.inLava(), true)
    await c.escapeLava()
    assert.deepEqual(events, ['equip:water_bucket', 'pour', 'forward:true', 'sprint:true', 'jump:true',
        'forward:false', 'sprint:false', 'jump:false', 'jump:true', 'jump:false'])
    assert.equal(c.bot.blockAt(new Vec3(goal.x, goal.y, goal.z)).name, 'air')
    assert.notDeepEqual([goal.x, goal.z], [246, -156])
})

test('a block filling the eye cell is dug out before any other work', async () => {
    const { chooseAction } = require('../src/decision-engine')
    assert.equal(chooseAction({ health: 12, food: 20, hostileDistance: Infinity, suffocating: true }), 'clear_head')
    const gravel = { name: 'gravel', position: new Vec3(0, 65, 0), boundingBox: 'block', diggable: true }
    const c = Object.create(SurvivalController.prototype)
    const dug = []
    c.log = { warn() {} }
    c.bot = {
        entity: { position: new Vec3(0.5, 64, 0.5), eyeHeight: 1.62 },
        // Like Mineflayer, blockAt floors a fractional eye position.
        blockAt: p => Math.floor(p.y) === 65 ? gravel : { name: 'air', boundingBox: 'empty' },
        async dig(block) { dug.push(block.name) }
    }
    await c.clearHead()
    assert.deepEqual(dug, ['gravel'])
    c.bot.blockAt = () => ({ name: 'air', boundingBox: 'empty' })
    assert.equal(c.suffocatingBlock(), null)
})

test('an underground login gets a provisional sea-level home that open sky above Y=50 replaces', () => {
    const { updateHome } = require('../src/survival-bot')
    const memory = {}
    assert.equal(updateHome(memory, new Vec3(3.5, -19, 140.5), 0), true)
    assert.deepEqual(memory.home, { x: 3, y: 63, z: 140, provisional: true })
    assert.equal(updateHome(memory, new Vec3(4, -19, 140), 15), false)
    assert.equal(updateHome(memory, new Vec3(10, 71, 2), 15), true)
    assert.deepEqual(memory.home, { x: 10, y: 71, z: 2 })
    assert.equal(updateHome(memory, new Vec3(0, 90, 0), 15), false)
    const stale = { home: { x: 3, y: -19, z: 140 } }
    assert.equal(updateHome(stale, new Vec3(3, -19, 140), 0), true)
    assert.deepEqual(stale.home, { x: 3, y: 63, z: 140, provisional: true })
})

test('a resource walk yields once iron or food comes into view, and the yield counts as progress', async t => {
    const { actionMadeProgress } = require('../src/survival-bot')
    t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
    let seen = null
    let cancelled = null
    const c = Object.create(SurvivalController.prototype)
    Object.assign(c, {
        bot: { entity: { position: new Vec3(0, 64, 0) }, targetDigBlock: null }, log: { info() {}, warn() {} },
        actionAbort: new AbortController(), priorityTargetInView: () => seen,
        perform: () => new Promise(resolve => c.actionAbort.signal.addEventListener('abort', resolve)),
        cancelCurrentTask(reason) { cancelled = reason; c.actionAbort.abort(reason) }
    })
    const run = c.performWithTimeout(Actions.IRON, {})
    await new Promise(resolve => setImmediate(resolve))
    t.mock.timers.tick(1500)
    assert.equal(cancelled, null)
    seen = 'pick_glow_berries'
    t.mock.timers.tick(1500)
    await run
    assert.equal(cancelled, 'pick_glow_berries came into view during gather_iron')
    assert.equal(actionMadeProgress(Actions.IRON, {}, { ironInView: true }, false), true)
    assert.equal(actionMadeProgress(Actions.IRON, { ironInView: true }, { ironInView: true }, false), false)
})

test('a daylight wood run below its reserve does not yield to opportunistic food', async t => {
    t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] })
    const c = Object.create(SurvivalController.prototype)
    let seen = null
    let cancelled = null
    let finish
    Object.assign(c, {
        bot: { entity: { position: new Vec3(0, 64, 0) } }, log: { info() {}, warn() {} },
        actionAbort: new AbortController(), priorityTargetInView: () => seen,
        perform: () => new Promise(resolve => { finish = resolve }),
        cancelCurrentTask(reason) { cancelled = reason; c.actionAbort.abort(reason) }
    })
    const run = c.performWithTimeout(Actions.WOOD, { logs: 31, planks: 3, isNight: false })
    await new Promise(resolve => setImmediate(resolve))
    seen = 'pick_glow_berries'
    t.mock.timers.tick(1500)
    finish()
    await run
    assert.equal(cancelled, null)
})

test('a lava escape that drives out directly skips the pathfinder, and lava cancels replan at once', async () => {
    const c = Object.create(SurvivalController.prototype)
    let gone = false
    c.log = { warn() {} }
    c.inLava = () => !gone
    c.bot = {
        entity: { position: new Vec3(0.5, 64, 0.5) }, inventory: { items: () => [] },
        blockAt: p => ({ name: p.y === 63 ? 'stone' : p.x === 0 && p.z === 0 ? 'lava' : 'air', boundingBox: p.y === 63 ? 'block' : 'empty' }),
        async lookAt() {}, setControlState(control, on) { if (control === 'forward' && on) { setTimeout(() => { gone = true }, 150) } }
    }
    c.gotoWithTimeout = async () => { throw new Error('pathfinder should not run') }
    await c.escapeLava()
    assert.equal(gone, true)
    c.actionAbort = new AbortController()
    c.clearCurrentTask = () => {}
    c.cancelCurrentTask('burning in lava')
    assert.equal(c.urgentReplan, true)
})

test('an unseen skeleton shooting from eight blocks behind interrupts mining and is turned to and fought', async () => {
    // Live 01:57Z: mine_iron kept digging through seven arrow hits from a skeleton 7-10 blocks behind.
    const bot = new EventEmitter()
    bot.entity = { position: new Vec3(0.5, 20, 0.5), yaw: 0, pitch: 0 }
    bot.game = { dimension: 'overworld' }
    bot.health = 20
    bot.world = { raycast: () => null }
    const skeleton = { isValid: true, name: 'skeleton', height: 1.99, position: new Vec3(0.5, 20, 8.5), heldItem: { name: 'bow' } }
    bot.entities = { 1: skeleton }
    bot.nearestEntity = predicate => predicate(skeleton) ? skeleton : null
    const looks = []
    bot.lookAt = async point => {
        looks.push(point)
        bot.entity.yaw = Math.PI
    }
    const c = Object.create(SurvivalController.prototype)
    const actions = []
    Object.assign(c, {
        bot, running: true, busy: true, activeAction: 'mine_iron', actionAbort: new AbortController(),
        memory: {}, failures: new Map(),
        log: { info() {}, warn() {} }, isNight: () => false, onState() {}, inventorySummary: () => '',
        scheduleLoop() {}, verifyActionProgress() {},
        observe() {
            const ranged = c.canSee(skeleton) ? skeleton : null
            return {
                health: bot.health, food: 20, hasFood: true, hasWeapon: true, armorPoints: 15, underground: true,
                ranged, rangedDistance: ranged ? 8 : Infinity, hostile: ranged, hostileDistance: ranged ? 8 : Infinity,
                visibleHostiles: ranged ? 1 : 0, completedAdvancements: new Set()
            }
        },
        async performWithTimeout(action, state) { actions.push([action, state.ranged]) }
    })
    c.bindEvents()
    assert.equal(c.canSee(skeleton), false)
    bot.emit('entityHurt', bot.entity, skeleton)
    assert.match(c.actionAbort.signal.reason, /attacked by skeleton holding bow/)
    c.busy = false
    c.activeAction = null
    await c.tick()
    assert.ok(looks[0]?.z > 8, 'did not turn toward the shooter')
    assert.deepEqual(actions, [[Actions.FIGHT, skeleton]])
})

function nightSurfaceBot(activeAction) {
    const bot = new EventEmitter()
    bot.entity = { position: new Vec3(0.5, 70, 0.5), yaw: 0, pitch: 0 }
    bot.game = { dimension: 'overworld' }
    bot.time = { day: 3 }
    bot.health = 20
    bot.entities = {}
    const c = Object.create(SurvivalController.prototype)
    Object.assign(c, { bot, running: true, busy: true, activeAction, actionAbort: new AbortController(), memory: {},
        home: { y: 64 }, failures: new Map(), log: { info() {}, warn() {} }, isNight: () => true, nearestEntity: () => null })
    c.bindEvents()
    return { bot, c }
}

test('night surface damage still ends ordinary work but no longer restarts an ongoing melee fight', () => {
    // Staged 02:11Z: two zombies hit a stone-sword bot; every hit cancelled its fight as "night damage retreat".
    for (const [action, cancelled] of [[Actions.FIGHT, false], [Actions.REFUGE, false], ['gather_wood', true]]) {
        const { bot, c } = nightSurfaceBot(action)
        bot.health = 16
        bot.emit('health')
        assert.equal(c.actionAbort.signal.aborted, cancelled, action)
        assert.equal(c.memory.nightRetreat?.reason, 'surface damage or reduced health')
    }
})

test('an escape with no route while a zombie is at arm\'s length marks the bot cornered so it fights next', async () => {
    const zombie = { isValid: true, name: 'zombie', position: new Vec3(1.5, 64, 0.5) }
    const c = Object.create(SurvivalController.prototype)
    // Staged 02:21Z: the zombie at 0.5 blocks sat below the view cone, so sight-gated searches missed it.
    Object.assign(c, { bot: { entity: { position: new Vec3(0.5, 64, 0.5) }, entities: { 1: zombie } }, actionAbort: new AbortController(), memory: {},
        escapeFrom: async () => { throw new Error('No path to the goal!') }, nearestEntity: () => null })
    await assert.rejects(c.perform(Actions.ESCAPE, { hostile: zombie, rangedDistance: Infinity, creeperDistance: Infinity }), /No path/)
    assert.ok(c.corneredUntil > Date.now())
    const fought = []
    c.fight = async (target, hunt, guard, cornered) => fought.push([target, cornered])
    await c.perform(Actions.FIGHT, { hostile: null, rangedDistance: Infinity, cornered: true })
    assert.deepEqual(fought, [[zombie, true]])
})

test('a cornered bot alternates swings between two adjacent zombies and finishes the second without replanning', async t => {
    // User report on staged 02:21Z: the bot fought one zombie while ignoring the other that was hitting it.
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const a = { id: 1, name: 'zombie', isValid: true, position: new Vec3(1.2, 64, 0.5), height: 1.95, hits: 0 }
    const b = { id: 2, name: 'zombie', isValid: true, position: new Vec3(0.5, 64, 1.3), height: 1.95, hits: 0 }
    const struck = []
    const c = Object.create(SurvivalController.prototype)
    Object.assign(c, { running: true, paused: false, actionAbort: new AbortController(), canSee: () => true,
        bestItem: () => ({ name: 'stone_sword' }), visibleThreatCount: () => 2,
        bot: { health: 18, entity: { position: new Vec3(0.5, 64, 0.5) }, entities: { 1: a, 2: b }, inventory: { slots: [] },
            blockAt: p => ({ name: p.y < 64 ? 'stone' : 'air', boundingBox: p.y < 64 ? 'block' : 'empty' }),
            equip: async () => {}, lookAt: async () => {}, pathfinder: { setGoal() {} },
            attack(z) { struck.push(z.id); if (++z.hits === 4) { z.isValid = false } } } })
    const operation = c.fight(a, false, null, true)
    for (let i = 0; i < 80; i++) { t.mock.timers.tick(100); await Promise.resolve(); await Promise.resolve() }
    await operation
    assert.deepEqual(struck.slice(0, 4), [1, 2, 1, 2])
    assert.equal(a.isValid, false)
    assert.equal(b.isValid, false)
})

function kitingBot(walls = new Set(), floorAt = () => 'stone') {
    const controls = {}
    const bot = { entity: { position: new Vec3(0.5, 64, 0.5), yaw: 0, pitch: 0 }, controls,
        setControlState(key, on) { controls[key] = on },
        blockAt(p) {
            const name = p.y === 63 ? floorAt(p) : walls.has(`${p.x},${p.z}`) && p.y <= 65 ? 'stone' : p.y < 63 ? 'stone' : 'air'
            return { name, boundingBox: ['air', 'lava', 'water'].includes(name) ? 'empty' : 'block' }
        } }
    return { bot, controls }
}

test('melee inside 2.5 blocks makes the bot back away while it keeps facing the attacker', () => {
    // User advice: zombies are slower than a walking player and reach half as far; back up while hitting.
    const { kite } = require('../src/survival-bot')
    const { bot, controls } = kitingBot()
    const zombie = { name: 'zombie', isValid: true, position: new Vec3(0.5, 64, -1.5) }
    assert.deepEqual(kite({ bot }, [zombie]), ['back'])
    assert.equal(controls.back, true)
    zombie.position = new Vec3(0.5, 64, -3.2)
    assert.equal(kite({ bot }, [zombie]), null)
    assert.equal(controls.back, false)
})

test('kiting strafes around a wall behind and never steps back into lava or off a ledge', () => {
    const { kite } = require('../src/survival-bot')
    const zombie = { name: 'zombie', isValid: true, position: new Vec3(0.3, 64, -1.5) }
    const walled = kitingBot(new Set(['0,1']))
    const keys = kite({ bot: walled.bot }, [zombie])
    assert.ok(keys && keys.join() !== 'back', `walked into the wall behind: ${keys}`)
    const boxed = kitingBot(new Set(['0,1', '1,1', '-1,1']))
    assert.ok(['left', 'right'].includes(kite({ bot: boxed.bot }, [zombie])?.join()), 'a wall row behind leaves only a strafe')
    const lava = kitingBot(new Set(), p => p.z >= 1 ? 'lava' : 'stone')
    assert.ok(!kite({ bot: lava.bot }, [zombie])?.some(k => k === 'back'))
    const ledge = kitingBot(new Set(), p => p.z >= 1 ? 'air' : 'stone')
    const ledgeBot = ledge.bot
    const deepBlockAt = ledgeBot.blockAt
    ledgeBot.blockAt = p => p.z >= 1 && p.y < 64 ? { name: 'air', boundingBox: 'empty' } : deepBlockAt(p)
    assert.ok(!kite({ bot: ledgeBot }, [zombie])?.some(k => k === 'back'))
})

test('two zombies in front make the bot keep swinging while it backs away from both', async t => {
    t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
    const a = { id: 1, name: 'zombie', isValid: true, position: new Vec3(0.0, 64, -1.4), height: 1.95, hits: 0 }
    const b = { id: 2, name: 'zombie', isValid: true, position: new Vec3(1.1, 64, -1.6), height: 1.95, hits: 0 }
    const { bot, controls } = kitingBot()
    const backing = []
    Object.assign(bot, { health: 18, entities: { 1: a, 2: b }, inventory: { slots: [] }, equip: async () => {},
        lookAt: async () => {}, pathfinder: { setGoal() {} },
        attack(z) { backing.push(Boolean(controls.back)); if (++z.hits === 4) { z.isValid = false } } })
    const c = Object.create(SurvivalController.prototype)
    Object.assign(c, { running: true, paused: false, actionAbort: new AbortController(), canSee: () => true,
        bestItem: () => ({ name: 'stone_sword' }), visibleThreatCount: () => 2, bot })
    const operation = c.fight(a, false, null, true)
    for (let i = 0; i < 80; i++) { t.mock.timers.tick(100); await Promise.resolve(); await Promise.resolve() }
    await operation
    assert.equal(a.isValid || b.isValid, false)
    assert.ok(backing.length >= 8 && backing.every(Boolean), `swung without backing: ${backing}`)
    assert.equal(controls.back, false, 'controls must be released when the fight ends')
})

test('kiting jumps up a one-block rise behind instead of standing still (user terrain note)', () => {
    const { kite } = require('../src/survival-bot')
    const zombie = { name: 'zombie', isValid: true, position: new Vec3(0.3, 64, -1.5) }
    const { bot, controls } = kitingBot(new Set(), () => 'stone')
    const blockAt = bot.blockAt
    // Every cell with z >= 1 is one block higher: floor at y=64, open at 65-66; the sides are walled.
    bot.blockAt = p => {
        if (p.z >= 1) {
            return p.y <= 64 ? { name: 'stone', boundingBox: 'block' } : { name: 'air', boundingBox: 'empty' }
        }
        if (p.x !== 0 && p.y <= 65 && p.y >= 64) {
            return { name: 'stone', boundingBox: 'block' }
        }
        return blockAt(p)
    }
    const keys = kite({ bot }, [zombie])
    assert.ok(keys?.includes('jump') && keys.includes('back'), `expected a jumping back-step, got ${keys}`)
    assert.equal(controls.jump, true)
    kite({ bot }, [])
    assert.equal(controls.jump, false)
})

test('a failed combat action under attack never starts the staircase unstick', async () => {
    // Staged round 5: three failed escapes triggered unstick, which carved stairs up into the zombies.
    const bot = new EventEmitter()
    bot.entity = { position: new Vec3(0.5, 64, 0.5), yaw: 0, pitch: 0 }
    bot.game = { dimension: 'overworld' }
    bot.health = 18
    bot.entities = { 1: { isValid: true, name: 'zombie', position: new Vec3(3, 64, 0.5) } }
    const c = Object.create(SurvivalController.prototype)
    Object.assign(c, { bot, running: true, busy: false, memory: {}, failures: new Map([[Actions.ESCAPE, 2]]),
        log: { info() {}, warn() {} }, isNight: () => false, onState() {}, inventorySummary: () => '', scheduleLoop() {},
        clearCurrentTask() {}, detectVerticalShaft: () => false, detectElevationTrap: () => null,
        observe: () => ({ health: 18, food: 20, hostileDistance: 2.5, closeHostiles: 3, visibleHostiles: 1, completedAdvancements: new Set() }),
        async performWithTimeout() { throw new Error('No path to the goal!') },
        unstickCalls: 0, scoutCalls: 0,
        async unstick() { this.unstickCalls++ },
        async scout() { this.scoutCalls++ } })
    await c.tick()
    assert.equal(c.failures.get(Actions.ESCAPE), 3)
    assert.equal(c.unstickCalls, 0, 'started the staircase unstick under attack')
    assert.equal(c.scoutCalls, 0, 'scouted away under attack')
})

test('a pillar fight held in place for 14 s is not cancelled by the movement watchdog', async t => {
    // Round 6: "retreat_to_wall is stuck" cancelled a stationary pillar fight after 12 s.
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] })
    const c = Object.create(SurvivalController.prototype)
    const cancels = []
    Object.assign(c, { bot: { entity: { position: new Vec3(0.5, 67, 0.5) } }, actionAbort: new AbortController(),
        cancelCurrentTask: reason => cancels.push(reason),
        async perform() {
            for (let i = 0; i < 28; i++) {
                c.combatLiveAt = Date.now()
                await new Promise(resolve => setTimeout(resolve, 500))
            }
        } })
    const run = c.performWithTimeout(Actions.REFUGE, {})
    for (let i = 0; i < 160; i++) { t.mock.timers.tick(100); await Promise.resolve(); await Promise.resolve() }
    await run
    assert.deepEqual(cancels, [])
})


test('an attacker behind the bot makes it step forward away at once, before turning (user: move on the first hit)', () => {
    const { kite } = require('../src/survival-bot')
    const { bot, controls } = kitingBot()
    const zombie = { name: 'zombie', isValid: true, position: new Vec3(0.5, 64, 2.0) }
    const keys = kite({ bot }, [zombie])
    assert.ok(keys?.includes('forward'), `expected a forward step, got ${keys}`)
    assert.equal(controls.forward, true)
    assert.equal(controls.back, false)
})
