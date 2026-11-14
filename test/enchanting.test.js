'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { Vec3 } = require('vec3')
const { nextAdvancement } = require('../src/advancement-plan')
const { chooseOffer, enchantItem, ENCHANTER } = require('../src/enchanting')

const routeDone = new Set(['minecraft:story/lava_bucket', 'minecraft:story/enter_the_nether', 'minecraft:story/shiny_gear'])
const ready = {
    logs: 4, planks: 16, sticks: 8, cobblestone: 16, ironIngots: 0, rawIron: 0, hasCraftingTable: true,
    hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true, hasIronPickaxe: true,
    hasIronArmor: true, armorEquipped: true, hasShield: true, shieldEquipped: true, hasDiamondPickaxe: true,
    gear: new Set(['diamond_sword', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots']),
    hasBucket: true, emptyBuckets: 1, waterBuckets: 2, hasFlintAndSteel: true, diamonds: 0, obsidian: 0,
    flint: 0, redstone: 0, foodUnits: 24, hasSmeltingFuel: true, dimension: 'overworld', completedAdvancements: routeDone,
    sugarCane: 0, paper: 0, books: 0, leather: 0, lapis: 0, xpLevel: 0, hasEnchantingTable: false
}

test('after the Nether route Enchanter starts only from a book or paper already in hand', () => {
    const step = changes => nextAdvancement({ ...ready, ...changes })
    assert.match(step({}).item, /^diamond_/)
    assert.match(step({ sugarCane: 2 }).item, /^diamond_/)
    assert.equal(step({ sugarCane: 3 }).item, 'paper')
    assert.equal(step({ paper: 3 }).action, 'gather_leather')
    assert.equal(step({ paper: 3, leather: 1 }).item, 'book')
    assert.equal(step({ books: 1 }).action, 'gather_obsidian')
    assert.equal(step({ books: 1, waterBuckets: 1 }).action, 'fill_water_bucket')
    assert.equal(step({ books: 1, obsidian: 4 }).action, 'gather_diamonds')
    assert.equal(step({ books: 1, obsidian: 4, diamonds: 2 }).item, 'enchanting_table')
    assert.equal(step({ hasEnchantingTable: true }).action, 'gather_lapis')
    assert.equal(step({ hasEnchantingTable: true, lapis: 3 }).action, 'gather_coal')
    assert.equal(step({ hasEnchantingTable: true, lapis: 3, xpLevel: 2 }).action, 'enchant_item')
    assert.match(step({ books: 1, completedAdvancements: new Set([...routeDone, ENCHANTER]) }).item, /^diamond_/)
    assert.equal(step({ books: 1, dimension: 'the_nether' }).action, 'leave_nether')
})

test('the best offer within the experience level and lapis on hand is chosen', () => {
    assert.equal(chooseOffer([1, 4, 8], 30, 3), 2)
    assert.equal(chooseOffer([1, 4, 8], 5, 3), 1)
    assert.equal(chooseOffer([2, 4, 8], 30, 1), 0)
    assert.equal(chooseOffer([2, 4, 8], 1, 3), -1)
    assert.equal(chooseOffer([0, 0, 0], 30, 3), -1)
})

function tableScene({ xp = 3, levels = [2, 5, 8] } = {}) {
    const pick = { name: 'diamond_pickaxe', slot: 36, enchants: [] }
    const lapis = { name: 'lapis_lazuli', slot: 37, count: 3 }
    const events = []
    const advancements = new Set()
    const table = Object.assign(new EventEmitter(), {
        slots: [], enchantments: [0, 1, 2].map(() => ({ level: -1, expected: { enchant: -1, level: -1 } })),
        async putTargetItem(item) {
            table.slots[0] = item
            events.push('target')
            // Mirrors the library: the server first reports zero levels, then the real offers.
            table.enchantments.forEach(slot => { slot.level = 0 })
            setTimeout(() => table.enchantments.forEach((slot, i) => { slot.level = levels[i] }), 150)
        },
        async putLapis(item) { table.slots[1] = item; events.push('lapis') },
        async enchant(choice) { events.push(`enchant:${choice}`); advancements.add(ENCHANTER) },
        async takeTargetItem() { events.push('take') }
    })
    const block = { name: 'enchanting_table', position: new Vec3(1, 64, 0) }
    const c = {
        bot: {
            entity: { position: new Vec3(0.5, 64, 0.5) }, experience: { level: xp },
            inventory: { items: () => [pick, lapis] },
            async openEnchantmentTable() { return table },
            async closeWindow() { events.push('close') }
        },
        running: true, paused: false, log: { info() {}, warn() {} }, advancements: { completed: advancements },
        checkAction() {}, async getStation() { return block }, async reclaimStation() { events.push('reclaim') }
    }
    return { c, events }
}

test('enchanting waits past the zero-level update, takes the best affordable offer and reclaims the table', async () => {
    const { c, events } = tableScene({ xp: 5 })
    await enchantItem(c)
    assert.deepEqual(events, ['target', 'lapis', 'enchant:1', 'take', 'close', 'reclaim'])
})

test('an unaffordable table closes the window and reports the offers', async () => {
    const { c, events } = tableScene({ xp: 1 })
    await assert.rejects(enchantItem(c), /no affordable offer: levels 2\/5\/8 at experience level 1/)
    assert.equal(events.includes('close'), true)
    assert.equal(events.some(e => e.startsWith('enchant')), false)
})

test('fruitless scouting for cows defers Enchanter so the diamond armor route continues', async () => {
    const { gatherLeather, enchantingState } = require('../src/enchanting')
    let scouts = 0
    const c = {
        bot: { experience: { level: 0 } }, memory: {}, log: { warn() {} },
        nearestEntity: () => null, scout: async () => { scouts++ },
        countItems: () => 0, hasItem: name => name === 'book', findStation: () => null
    }
    for (let i = 0; i < 8; i++) {
        await gatherLeather(c)
    }
    assert.equal(scouts, 7)
    const state = enchantingState(c, { ...ready })
    assert.equal(state.enchanterDeferred, true)
    assert.match(nextAdvancement({ ...state, books: 1 }).item, /^diamond_/)
})
