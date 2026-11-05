'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EARLY_ADVANCEMENTS, nextAdvancement, plankPotential, resourceAction } = require('../src/advancement-plan')

const established = {
    logs: 4, planks: 16, sticks: 8, cobblestone: 16, ironIngots: 0, rawIron: 0,
    hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true,
    hasStonePickaxe: true, hasFurnace: true, hasIronPickaxe: true,
    hasIronArmor: true, armorEquipped: true, hasShield: true, shieldEquipped: true,
    gear: new Set(['iron_sword', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots']), 
    hasBucket: true, hasWaterBucket: true, hasDiamondPickaxe: false, hasFlintAndSteel: false,
    diamonds: 0, obsidian: 0, flint: 0, redstone: 0, foodUnits: 24,
    hasSmeltingFuel: true, completedAdvancements: new Set(['minecraft:story/lava_bucket'])
}

const diamondSword = new Set([...established.gear, 'diamond_sword'])

test('route uses real Java advancement IDs with preparation goals kept separate', () => {
    assert.equal(EARLY_ADVANCEMENTS.length, 11)
    assert.equal(EARLY_ADVANCEMENTS.every(goal => goal.id.startsWith('minecraft:story/')), true)
    assert.equal(EARLY_ADVANCEMENTS.at(-1).id, 'minecraft:story/enter_the_nether')
})

test('logs count as four potential planks and stick crafting reserves its planks', () => {
    assert.equal(plankPotential({ logs: 2, planks: 3 }), 11)
    assert.equal(resourceAction({ ...established, logs: 0, planks: 3, sticks: 0 }, { planks: 3, sticks: 2 }), 'gather_wood')
})

test('lost tools are rebuilt even when the server remembers past advancements', () => {
    const goal = nextAdvancement({ ...established, hasIronPickaxe: false, hasStonePickaxe: false,
        hasWoodenPickaxe: false, completedAdvancements: new Set(EARLY_ADVANCEMENTS.map(g => g.id)) })
    assert.equal(goal.action, 'craft_wooden_pickaxe')
})

test('advanced tools satisfy earlier tool tiers without crafting obsolete equipment', () => {
    assert.equal(nextAdvancement(established).action, 'gather_diamonds')
})

test('armor needs eight ingots and smelts available raw iron in bounded batches', () => {
    assert.equal(nextAdvancement({ ...established, hasIronArmor: false }).action, 'gather_iron')
    assert.equal(nextAdvancement({ ...established, hasIronArmor: false, rawIron: 3 }).action, 'smelt_iron')
    assert.equal(nextAdvancement({ ...established, hasIronArmor: false, ironIngots: 8 }).item, 'iron_chestplate')
})

test('lava bucket follows iron protection and precedes diamond mining', () => {
    const state = { ...established, completedAdvancements: new Set() }
    assert.equal(nextAdvancement(state).action, 'fill_lava_bucket')
    assert.equal(nextAdvancement({ ...state, hasBucket: false, ironIngots: 3 }).item, 'bucket')
})

test('diamonds are reserved for the pickaxe before obsidian mining', () => {
    assert.equal(nextAdvancement({ ...established, diamonds: 3 }).item, 'diamond_pickaxe')
    assert.equal(nextAdvancement({ ...established, hasDiamondPickaxe: true, gear: diamondSword }).action, 'gather_obsidian')
})

test('portal needs ignition and provisions; partial frame is resumed instead of remined', () => {
    const state = { ...established, hasDiamondPickaxe: true, gear: diamondSword, obsidian: 10, ironIngots: 1, flint: 1 }
    assert.equal(nextAdvancement(state).item, 'flint_and_steel')
    assert.equal(nextAdvancement({ ...state, hasFlintAndSteel: true, foodUnits: 0 }).action, 'gather_food')
    assert.equal(nextAdvancement({ ...state, hasFlintAndSteel: true, obsidian: 2, portalInProgress: true }).action, 'enter_nether')
})

test('completed route waits near the portal rather than starting an unsupported End quest', () => {
    assert.equal(nextAdvancement({ ...established, hasDiamondPickaxe: true, gear: diamondSword,
        completedAdvancements: new Set(['minecraft:story/lava_bucket', 'minecraft:story/enter_the_nether']) }).action, 'wait')
})

test('a full iron set and sword precede diamonds; diamond gear follows the pickaxe', () => {
    const bare = { ...established, gear: new Set(['iron_chestplate']), ironIngots: 30 }
    assert.equal(nextAdvancement(bare).item, 'iron_sword')
    const order = []
    let gear = new Set(bare.gear)
    for (let i = 0; i < 4; i++) {
        const goal = nextAdvancement({ ...bare, gear })
        order.push(goal.item)
        gear = new Set([...gear, goal.item])
    }
    assert.deepEqual(order, ['iron_sword', 'iron_leggings', 'iron_helmet', 'iron_boots'])
    assert.equal(nextAdvancement({ ...bare, ironIngots: 0, gear: new Set(['iron_chestplate', 'iron_sword']) }).action, 'gather_iron')
    const ironed = { ...established, diamonds: 3 }
    assert.equal(nextAdvancement(ironed).item, 'diamond_pickaxe')
    assert.equal(nextAdvancement({ ...ironed, hasDiamondPickaxe: true, diamonds: 2 }).item, 'diamond_sword')
    const goal = nextAdvancement({ ...ironed, hasDiamondPickaxe: true, gear: diamondSword, diamonds: 8 })
    assert.deepEqual([goal.id, goal.item], ['minecraft:story/shiny_gear', 'diamond_chestplate'])
    assert.equal(nextAdvancement({ ...ironed, hasDiamondPickaxe: true, gear: diamondSword, diamonds: 4 }).item, 'diamond_boots')
    assert.equal(nextAdvancement({ ...established, diamondsArmorUpgrade: true, armorUpgrade: true }).action, 'equip_armor')
})

test('a stone work pick is only required while iron is scarce', () => {
    const base = { ...established, hasStoneUtilityPickaxe: false, ironIngots: 0, rawIron: 0 }
    assert.equal(nextAdvancement(base).item, 'stone_pickaxe')
    assert.notEqual(nextAdvancement({ ...base, ironIngots: 4, rawIron: 3 }).item, 'stone_pickaxe')
})
