'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Vec3 } = require('vec3')
const { depositPlan, restockPlan, baseState, depositAtBase, restockAtBase } = require('../src/base')
const { chooseAction } = require('../src/decision-engine')

const kit = [
    { name: 'diamond_pickaxe', count: 1 }, { name: 'iron_pickaxe', count: 1 }, { name: 'stone_pickaxe', count: 1 },
    { name: 'diamond_sword', count: 1 }, { name: 'iron_sword', count: 1 }, { name: 'iron_helmet', count: 1 },
    { name: 'diamond', count: 11 }, { name: 'iron_ingot', count: 20 }, { name: 'raw_gold', count: 6 },
    { name: 'coal', count: 30 }, { name: 'oak_log', count: 20 }, { name: 'bread', count: 26 },
    { name: 'cobblestone', count: 64 }, { name: 'white_bed', count: 3 }, { name: 'obsidian', count: 10 }
]
const asMap = plan => Object.fromEntries(plan.map(entry => [entry.name, entry.count]))

test('deposit keeps the best tools, a work pick and carry levels and stores the surplus', () => {
    const plan = asMap(depositPlan(kit, { helmet: 'diamond_helmet', chestplate: 'iron_chestplate' }))
    assert.deepEqual(plan, {
        iron_pickaxe: 1, iron_sword: 1, iron_helmet: 1, diamond: 3, iron_ingot: 4, raw_gold: 6,
        coal: 14, oak_log: 4, bread: 10, white_bed: 2
    })
})

test('an unworn better armor piece is not stored before it can be equipped', () => {
    assert.equal(asMap(depositPlan([{ name: 'diamond_boots', count: 1 }], { boots: 'iron_boots' })).diamond_boots, undefined)
})

test('after a death the restock takes the best gear and refills carry levels', () => {
    const stored = { diamond_pickaxe: 1, iron_pickaxe: 1, stone_pickaxe: 2, diamond_sword: 1, iron_chestplate: 1, iron_helmet: 1,
        shield: 1, diamond: 20, iron_ingot: 40, coal: 30, oak_log: 30, bread: 40, crafting_table: 2, raw_gold: 6 }
    const plan = asMap(restockPlan(stored, [], {}))
    assert.deepEqual(plan, {
        diamond_pickaxe: 1, diamond_sword: 1, stone_pickaxe: 1, iron_helmet: 1, iron_chestplate: 1, shield: 1,
        diamond: 8, iron_ingot: 16, coal: 16, crafting_table: 1, oak_log: 16, bread: 16
    })
})

test('a restock never creates a deposit, so the bot cannot shuttle items in and out', () => {
    const stored = { diamond: 20, iron_ingot: 40, coal: 30, oak_log: 30, bread: 40, torch: 64, raw_iron: 30, crafting_table: 2 }
    const items = restockPlan(stored, [], {})
    assert.deepEqual(depositPlan(items, {}), [])
})

function baseBot(items = [], position = new Vec3(0.5, 70, 0.5)) {
    return {
        game: { dimension: 'overworld' }, entity: { position },
        inventory: { items: () => items, slots: [] }
    }
}

test('base decisions: establish near the shaft once mid-game, deposit when passing, restock after a death', () => {
    const calm = { isNight: false, hostileDistance: Infinity, underground: false, hasIronPickaxe: true, hasCraftingTable: true, planks: 8, logs: 0 }
    const fresh = { bot: baseBot(), memory: { shaft: { dimension: 'overworld', cells: [{ x: 3, y: 70, z: 0 }] } }, home: { x: 0, y: 70, z: 0 } }
    assert.equal(baseState(fresh, { ...calm }).baseEstablish, true)
    assert.equal(baseState(fresh, { ...calm, isNight: true }).baseEstablish, false)
    assert.equal(baseState(fresh, { ...calm, hasIronPickaxe: false }).baseEstablish, false)
    const memory = { base: { dimension: 'overworld', chest: { x: 2, y: 70, z: 0 }, contents: { diamond_pickaxe: 1, iron_sword: 1, bread: 20 } } }
    const rich = baseState({ bot: baseBot(kit), memory }, { ...calm })
    assert.equal(rich.baseDeposit, true)
    const dead = baseState({ bot: baseBot([], new Vec3(150.5, 70, 0.5)), memory }, { ...calm })
    assert.equal(dead.baseRestock, true)
    assert.equal(baseState({ bot: baseBot([], new Vec3(400.5, 70, 0.5)), memory }, { ...calm }).baseRestock, false)
})

test('restock outranks rebuilding from wood; danger still comes first', () => {
    const base = { health: 20, food: 20, hostileDistance: Infinity, cobblestone: 0, logs: 0, planks: 0, sticks: 0 }
    assert.equal(chooseAction({ ...base, baseRestock: true }), 'restock_base')
    assert.equal(chooseAction({ ...base, baseRestock: true, hostileDistance: 2, health: 6 }), 'escape')
    assert.equal(chooseAction({ ...base, baseDeposit: true }), 'deposit_base')
})

function chestWorld(items, contents) {
    const stored = Object.entries(contents).map(([name, count]) => ({ name, count }))
    const registry = require('minecraft-data')('26.1')
    const byId = id => registry.items[id].name
    const window = {
        containerItems: () => stored.filter(item => item.count > 0),
        async deposit(id, meta, count) {
            const item = items.find(i => i.name === byId(id))
            item.count -= count
            stored.push({ name: item.name, count })
        },
        async withdraw(id, meta, count) {
            const item = stored.find(i => i.name === byId(id))
            item.count -= count
            items.push({ name: item.name, count })
        },
        close() { window.closed = true }
    }
    const c = {
        memory: { base: { dimension: 'overworld', chest: { x: 1, y: 70, z: 0 }, contents: { ...contents } } },
        log: { info() {}, warn() {} }, checkAction() {},
        bot: {
            registry, game: { dimension: 'overworld' }, entity: { position: new Vec3(0.5, 70, 0.5) },
            inventory: { items: () => items.filter(item => item.count > 0), slots: [] },
            blockAt: p => ({ name: 'chest', position: p }),
            openContainer: async () => window
        },
        async gotoWithTimeout() { throw new Error('should not need to move') }
    }
    return { c, window, stored }
}

test('depositing and restocking move the planned stacks through the chest and record its contents', async () => {
    const items = kit.map(item => ({ ...item }))
    const { c, window } = chestWorld(items, {})
    await depositAtBase(c)
    assert.equal(window.closed, true)
    assert.equal(c.memory.base.contents.raw_gold, 6)
    assert.equal(items.find(i => i.name === 'diamond').count, 8)
    const empty = []
    const after = chestWorld(empty, { diamond_pickaxe: 1, bread: 30 })
    await restockAtBase(after.c)
    assert.deepEqual(empty.map(i => [i.name, i.count]), [['diamond_pickaxe', 1], ['bread', 16]])
    assert.equal(after.c.memory.base.contents.bread, 14)
})
