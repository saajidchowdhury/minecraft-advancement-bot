'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { EARLY_ADVANCEMENTS, nextAdvancement, plankPotential, resourceAction } = require('../src/advancement-plan')

const established = {
    logs: 4, planks: 16, sticks: 8, cobblestone: 16, ironIngots: 0, rawIron: 0,
    hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true,
    hasStonePickaxe: true, hasFurnace: true, hasIronPickaxe: true,
    hasIronArmor: true, armorEquipped: true, hasShield: true, shieldEquipped: true,
    hasBucket: true, hasWaterBucket: true, hasDiamondPickaxe: false, hasFlintAndSteel: false,
    diamonds: 0, obsidian: 0, flint: 0, redstone: 0, foodUnits: 24,
    hasSmeltingFuel: true, completedAdvancements: new Set(['minecraft:story/lava_bucket'])
}

test('route uses real Java advancement IDs with preparation goals kept separate', () => {
    assert.equal(EARLY_ADVANCEMENTS.length, 10)
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
    assert.equal(nextAdvancement({ ...established, hasDiamondPickaxe: true }).action, 'gather_obsidian')
})

test('portal needs ignition and provisions; partial frame is resumed instead of remined', () => {
    const state = { ...established, hasDiamondPickaxe: true, obsidian: 10, ironIngots: 1, flint: 1 }
    assert.equal(nextAdvancement(state).item, 'flint_and_steel')
    assert.equal(nextAdvancement({ ...state, hasFlintAndSteel: true, foodUnits: 0 }).action, 'gather_food')
    assert.equal(nextAdvancement({ ...state, hasFlintAndSteel: true, obsidian: 2, portalInProgress: true }).action, 'enter_nether')
})

test('completed route waits near the portal rather than starting an unsupported End quest', () => {
    assert.equal(nextAdvancement({ ...established, hasDiamondPickaxe: true,
        completedAdvancements: new Set(['minecraft:story/lava_bucket', 'minecraft:story/enter_the_nether']) }).action, 'wait')
})
