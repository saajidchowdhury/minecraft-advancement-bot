'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { MIN_MINING_MEALS, mealReserve, foodState, cookFood, pickGlowBerries } = require('../src/food')

function kitchen(items) {
    const furnace = { input: null, output: null, fuel: null }
    const window = {
        inputItem: () => furnace.input, outputItem: () => furnace.output, fuelItem: () => furnace.fuel,
        takeOutput: async () => { items.push(furnace.output); furnace.output = null },
        takeFuel: async () => { items.push(furnace.fuel); furnace.fuel = null }
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
