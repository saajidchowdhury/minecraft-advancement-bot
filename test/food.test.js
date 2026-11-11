'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { MIN_MINING_MEALS, mealReserve, foodState, cookFood, pickGlowBerries, huntFish, waitForFish } = require('../src/food')

function kitchen(items) {
    const furnace = { input: null, output: null, fuel: null }
    const window = {
        inputItem: () => furnace.input, outputItem: () => furnace.output, fuelItem: () => furnace.fuel,
        takeOutput: async () => { items.push(furnace.output); furnace.output = null },
        takeFuel: async () => { items.push(furnace.fuel); furnace.fuel = null },
        takeInput: async () => { items.push(furnace.input); furnace.input = null }
    }
    const names = {}
    const take = (name, count) => {
        const item = items.find(i => i.name === name)
        item.count -= count
        items.splice(0, items.length, ...items.filter(i => i.count > 0))
    }
    window.putInput = async (type, metadata, count) => { take(names[type], count); furnace.input = { name: names[type], count } }
    window.putFuel = async (type, metadata, count) => { take(names[type], count); furnace.fuel = { name: names[type], count } }
    const block = { name: 'furnace', position: new Vec3(1, 64, 0) }
    const c = {
        memory: {}, running: true, log: { info() {}, warn() {} }, checkAction() {},
        countItems: list => items.filter(i => list.includes(i.name)).reduce((n, i) => n + i.count, 0),
        bestItem: list => items.find(i => list.includes(i.name)),
        hasItem: name => items.some(i => i.name === name), findStation: () => block,
        getFurnace: async () => block, reclaimStation: async () => { c.reclaimed = true },
        bot: { game: { dimension: 'overworld' }, entity: { position: new Vec3(0, 64, 0) }, blockAt: () => block,
            inventory: { items: () => items }, openFurnace: async () => window, closeWindow: async () => {} }
    }
    for (const [i, item] of items.entries()) {
        item.type = i
        names[i] = item.name
    }
    return { c, furnace }
}

function hillsideKitchen() {
    const { c, furnace } = kitchen([])
    const position = new Vec3(-27, 74, 194)
    const block = c.bot.blockAt()
    block.position = position
    c.memory.cookJob = { dimension: 'overworld', ...position, input: 'chicken', count: 1, readyAt: Date.now() - 1 }
    furnace.output = { name: 'cooked_chicken', count: 1 }
    c.actionAbort = new AbortController()
    c.bot.entity.position = new Vec3(-33.5, 78, 191.5)
    c.bot.registry = require('minecraft-data')('26.1')
    c.bot.world = { raycast: () => ({ position }) }
    c.bot.waitForTicks = async () => {}
    c.movements = { normal: true }
    const movements = []
    c.bot.pathfinder = { setGoal() {}, setMovements(m) { movements.push(m) } }
    return { c, furnace, position, movements }
}

test('a finished cooking job can be collected from a reachable hillside ledge', async () => {
    const { c, movements } = hillsideKitchen()
    const ledge = new Vec3(-29, 76, 194)
    c.gotoWithTimeout = async goal => {
        assert.equal(goal.isEnd(ledge), true, 'a visible furnace within interaction reach must satisfy the return goal')
        c.bot.entity.position = ledge.offset(0.5, 0, 0.5)
    }
    await cookFood(c)
    assert.equal(c.countItems(['cooked_chicken']), 1)
    assert.equal(c.memory.cookJob, null)
    assert.equal(movements[0].canDig, false)
    assert.deepEqual(movements[0].scafoldingBlocks, [])
    assert.equal(movements.at(-1), c.movements)
})

test('the first failed furnace return immediately tries a short lateral detour and retries', async () => {
    const { c, movements } = hillsideKitchen()
    const calls = []
    c.gotoWithTimeout = async (goal, timeoutMs, label) => {
        calls.push({ goal, timeoutMs, label })
        assert.ok(timeoutMs <= 8000, 'a local furnace return must not spend thirty seconds per attempt')
        if (calls.length === 1) { throw new Error('cooking furnace return timed out') }
        if (label === 'cooking furnace detour') {
            assert.ok(timeoutMs <= 4000)
            c.bot.entity.position = new Vec3(goal.x + 0.5, 78, goal.z + 0.5)
        } else {
            c.bot.entity.position = new Vec3(-28.5, 76, 194.5)
        }
    }
    await cookFood(c)
    assert.equal(calls.length, 3)
    assert.equal(calls[1].label, 'cooking furnace detour')
    assert.equal(c.memory.cookJob, null)
    assert.equal(c.countItems(['cooked_chicken']), 1)
    assert.equal(movements.at(-1), c.movements)
})

test('a canceled furnace approach retains the food job without detouring or opening a window', async () => {
    const { c, furnace, movements } = hillsideKitchen()
    let calls = 0
    c.gotoWithTimeout = async () => { calls++; c.actionAbort.abort(); throw new Error('return canceled') }
    c.bot.openFurnace = async () => assert.fail('opened furnace after cancellation')
    await assert.rejects(cookFood(c), /canceled|cancelled/)
    assert.equal(calls, 1)
    assert.ok(c.memory.cookJob)
    assert.equal(furnace.output.count, 1)
    assert.equal(movements.at(-1), c.movements)
})

test('an empty no-path result cannot collect cooking output from an unreached furnace', async () => {
    const { EventEmitter } = require('node:events')
    const goto = require('mineflayer-pathfinder/lib/goto')
    const { SurvivalController } = require('../src/survival-bot')
    const { c, furnace } = hillsideKitchen()
    c.bot = Object.assign(new EventEmitter(), c.bot)
    c.bot.pathfinder.goto = goal => goto(c.bot, goal)
    c.bot.pathfinder.setGoal = goal => {
        c.bot.emit('goal_updated', goal)
        if (goal) { c.bot.emit('path_update', { status: 'noPath', path: [] }) }
    }
    c.gotoWithTimeout = SurvivalController.prototype.gotoWithTimeout.bind(c)
    c.bot.openFurnace = async () => assert.fail('opened an unreached furnace')
    await assert.rejects(cookFood(c), /not reached|outside/)
    assert.ok(c.memory.cookJob)
    assert.equal(furnace.output.count, 1)
    assert.equal(c.bot.listenerCount('path_update'), 0)
})

test('a known missing cooking furnace is forgotten before trying to walk toward it', async () => {
    const { c } = hillsideKitchen()
    c.bot.blockAt = () => ({ name: 'air' })
    c.gotoWithTimeout = async () => assert.fail('walked toward a known missing furnace')
    await assert.rejects(cookFood(c), /is gone/)
    assert.equal(c.memory.cookJob, null)
})

test('the mining meal reserve is 16 average cooked land meats, counting raw food at its cooked value', () => {
    assert.ok(Math.abs(MIN_MINING_MEALS - 16 * 16.28) < 1e-9)
    assert.ok(Math.abs(mealReserve([{ name: 'beef', count: 2 }, { name: 'glow_berries', count: 10 }]) - (2 * 20.8 + 10 * 2.4)) < 1e-9)
    assert.equal(mealReserve([{ name: 'cobblestone', count: 64 }]), 0)
})

test('raw food starts a fire-and-forget cooking job that is collected and the furnace reclaimed', async () => {
    const items = [{ name: 'beef', count: 12 }, { name: 'coal', count: 5 }, { name: 'furnace', count: 1 }]
    const { c, furnace } = kitchen(items)
    const state = { dimension: 'overworld', hostileDistance: Infinity, freeInventorySlots: 10, hasFurnace: true, cobblestone: 0 }
    foodState(c, state)
    assert.equal(state.canCook, true)
    assert.equal(state.rawFood, 12)
    await cookFood(c)
    assert.deepEqual(furnace.input, { name: 'beef', count: 12 })
    assert.deepEqual(furnace.fuel, { name: 'coal', count: 2 })
    assert.equal(c.memory.cookJob.count, 12)
    foodState(c, state)
    assert.deepEqual([state.canCook, state.cookJob.ready], [false, false])
    assert.ok(Math.abs(state.mealReserve - 12 * 20.8) < 1e-9, 'beef in the furnace still counts toward the reserve')
    c.memory.cookJob.readyAt = Date.now() - 1
    furnace.input = null
    furnace.output = { name: 'cooked_beef', count: 12 }
    furnace.fuel = { name: 'coal', count: 1 }
    await cookFood(c)
    assert.equal(c.memory.cookJob, null)
    assert.equal(c.countItems(['cooked_beef']), 12)
    assert.equal(c.reclaimed, true)
})

test('a cooking job is kept to 300 blocks, revisited by day on the surface and only at hand by night', () => {
    const { c } = kitchen([])
    c.bot.entity.position = new Vec3(0, 64, 0)
    const job = { dimension: 'overworld', x: 120, y: 70, z: 0, input: 'mutton', count: 15, readyAt: Date.now() - 1 }
    const at = extra => (c.memory.cookJob = { ...job, ...extra }, foodState(c, { dimension: 'overworld', hostileDistance: Infinity,
        freeInventorySlots: 10, hasFurnace: true, ...extra.state }))
    assert.deepEqual(at({}).cookJob, { ready: true })
    assert.ok(Math.abs(at({}).mealReserve - 15 * 15.6) < 1e-9)
    assert.equal(at({ state: { isNight: true } }).cookJob, null)
    assert.ok(c.memory.cookJob, 'a night away from the furnace keeps the job for the next surface visit')
    assert.equal(at({ state: { underground: true } }).cookJob, null)
    assert.equal(at({ x: 40, state: { underground: true } }).cookJob.ready, true)
    assert.equal(at({ x: 350 }).cookJob, null)
    assert.equal(c.memory.cookJob, null)
})

test('cooking collects leftover charcoal output instead of treating the furnace as busy', async () => {
    const items = [{ name: 'mutton', count: 2 }, { name: 'coal', count: 1 }]
    const { c, furnace } = kitchen(items)
    furnace.output = { name: 'charcoal', count: 1 }
    await cookFood(c)
    assert.equal(c.countItems(['charcoal']), 1)
    assert.deepEqual(furnace.input, { name: 'mutton', count: 2 })
})

test('cooking refuses a furnace holding iron and backs off instead of mixing jobs', async () => {
    const items = [{ name: 'porkchop', count: 3 }, { name: 'oak_planks', count: 4 }]
    const { c, furnace } = kitchen(items)
    furnace.input = { name: 'raw_iron', count: 5 }
    await assert.rejects(cookFood(c), /busy with raw_iron/)
    const state = { dimension: 'overworld', hostileDistance: Infinity, freeInventorySlots: 10, hasFurnace: true }
    assert.equal(foodState(c, state).canCook, false)
})

test('glow berries are picked from ripe vines and a vine that keeps its berries is skipped', async () => {
    const items = []
    const vine = { name: 'cave_vines', position: new Vec3(2, 66, 0), ripe: true, getProperties() { return { berries: this.ripe } } }
    const { c } = kitchen(items)
    let blocked = 0
    Object.assign(c, {
        findNearestBlock: (predicate, range, options) => predicate(vine.name) && options.filter(vine) && !blocked ? vine : null,
        gotoWithTimeout: async () => { items.push({ name: 'glow_berries', count: 1 }) },
        visibleDrops: () => Object.values(c.bot.entities),
        rememberBlockedTarget: () => { blocked++ }
    })
    c.bot.blockAt = () => vine
    c.bot.canDigBlock = c.bot.canSeeBlock = () => true
    c.bot.waitForTicks = async () => {}
    c.bot.entities = { 1: { isValid: true, name: 'item', position: new Vec3(2, 64, 0) } }
    let uses = 0
    c.bot.activateBlock = async () => { uses++; vine.ripe = false }
    await pickGlowBerries(c)
    assert.deepEqual([uses, c.countItems(['glow_berries']), blocked], [1, 1, 0])
    vine.ripe = true
    c.bot.activateBlock = async () => { uses++ }
    await pickGlowBerries(c)
    assert.deepEqual([uses, blocked], [2, 1])
})

function pond(entities, blocks = {}) {
    const c = {
        memory: {}, log: { info() {} }, isBlockedTarget: () => false, canSee: () => true,
        countItems: () => 0, findNearestBlock: (predicate, range, options = {}) =>
            Object.values(blocks).find(b => predicate(b.name) && (!options.filter || options.filter(b))) || null,
        bot: { game: { dimension: 'overworld' }, entity: { position: new Vec3(0, 63, 0) }, entities, inventory: { items: () => [] },
            blockAt: p => ({ name: p.y >= 63 ? 'air' : 'water' }) }
    }
    const state = { dimension: 'overworld', health: 20, hostileDistance: Infinity, freeInventorySlots: 5, hasCraftingTable: true, planks: 4, logs: 0 }
    return { c, state }
}
const fish = (name, x, y = 62) => ({ name, isValid: true, position: new Vec3(x, y, 0) })

test('food opportunities rank cod and salmon over berries, skip pufferfish and deep fish, then try stew', () => {
    const vine = { name: 'cave_vines', position: new Vec3(3, 66, 0), getProperties: () => ({ berries: true }) }
    const { c, state } = pond({ 1: fish('pufferfish', 2), 2: fish('cod', 9, 50), 3: fish('tropical_fish', 4) }, { vine })
    assert.equal(foodState(c, state).foodOpportunity.action, 'pick_glow_berries')
    c.bot.entities[4] = fish('salmon', 12)
    assert.equal(foodState(c, state).foodOpportunity.target.name, 'salmon')
    delete c.bot.entities[4]
    vine.getProperties = () => ({ berries: false })
    assert.equal(foodState(c, state).foodOpportunity.target.name, 'tropical_fish')
})

test('a red and a brown mushroom source become stew while fewer than four stews are carried', () => {
    const { c, state } = pond({}, { red: { name: 'red_mushroom' }, brown: { name: 'brown_mushroom_block' } })
    assert.equal(foodState(c, state).foodOpportunity.action, 'gather_mushroom_stew')
    assert.equal(foodState(c, { ...state, health: 10 }).foodOpportunity, null)
    c.countItems = names => names.includes('mushroom_stew') ? 4 : 0
    assert.equal(foodState(c, state).foodOpportunity, null)
})

test('a fish hunt records its shore and aborts the fight when short of air', async () => {
    const { c } = pond({})
    let reason
    c.fight = async (target, hunt, guard) => { assert.equal(hunt, true); c.bot.oxygenLevel = 12; reason = guard() }
    await huntFish(c, fish('cod', 2))
    assert.equal(reason, 'fish hunt is short of air')
    assert.deepEqual([c.memory.fishWater.x, c.memory.fishWater.misses], [0, 0])
    c.memory.fishWater.at -= 600001
    assert.equal(await waitForFish(c), false)
})

test('a cooking job that runs out of fuel with none carried takes its food back and ends', async () => {
    const items = [{ name: 'stick', count: 1 }]
    const { c, furnace } = kitchen(items)
    c.memory.cookJob = { dimension: 'overworld', x: 1, y: 64, z: 0, input: 'mutton', count: 1, readyAt: Date.now() - 1 }
    furnace.input = { name: 'mutton', count: 1 }
    await cookFood(c)
    assert.equal(c.memory.cookJob, null)
    assert.equal(c.countItems(['mutton']), 1)
    assert.equal(furnace.input, null)
})
