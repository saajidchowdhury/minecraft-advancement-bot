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
    c.memory.cookJob.readyAt = Date.now() - 1
    furnace.input = null
    furnace.output = { name: 'cooked_beef', count: 12 }
    furnace.fuel = { name: 'coal', count: 1 }
    await cookFood(c)
    assert.equal(c.memory.cookJob, null)
    assert.equal(c.countItems(['cooked_beef']), 12)
    assert.equal(c.reclaimed, true)
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
