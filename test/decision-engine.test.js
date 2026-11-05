'use strict'

const test = require('node:test')
const assert = require('node:assert/strict')
const { Actions, chooseAction } = require('../src/decision-engine')

function state (overrides = {}) {
    return {
        health: 20,
        food: 20,
        hostileDistance: Infinity,
        hasWeapon: false,
        hasFood: false,
        isNight: false,
        sheltered: false,
        shaftTrapped: false,
        elevationTrapped: false,
        recoveryAvailable: false,
        logs: 0,
        planks: 0,
        sticks: 0,
        hasCraftingTable: false,
        hasWoodenPickaxe: false,
        hasEarlySword: false,
        cobblestone: 0,
        hasStonePickaxe: false,
        hasFurnace: false,
        foodUnits: 0,
        coal: 0,
        hasSmeltingFuel: false,
        rawIron: 0,
        ironIngots: 0,
        hasIronPickaxe: false,
        ...overrides
    }
}

test('critical danger outranks every progression goal', () => {
    assert.equal(chooseAction(state({ health: 6, hostileDistance: 2, hasFood: true })), Actions.ESCAPE)
})

test('healthy armed bot fights a nearby hostile', () => {
    assert.equal(chooseAction(state({ health: 18, hostileDistance: 3, hasWeapon: true })), Actions.FIGHT)
})

test('eating outranks night shelter when food is low', () => {
    assert.equal(chooseAction(state({ food: 10, hasFood: true, isNight: true })), Actions.EAT)
})

test('night shelter outranks resource progression', () => {
    assert.equal(chooseAction(state({ isNight: true })), Actions.SHELTER)
})

test('an isolated spawn pillar is descended before progression', () => {
    assert.equal(chooseAction(state({ elevationTrapped: true })), Actions.DESCEND)
})

test('a vertical mining shaft is escaped before progression', () => {
    assert.equal(chooseAction(state({ shaftTrapped: true })), Actions.ASCEND)
})

test('recovering time-limited death drops outranks ordinary progression', () => {
    assert.equal(chooseAction(state({ recoveryAvailable: true })), Actions.RECOVER)
})

test('critically injured bot seeks food instead of continuing progression', () => {
    assert.equal(chooseAction(state({ health: 4, food: 17 })), Actions.FOOD)
})

test('progresses through the popular early advancement path', () => {
    assert.equal(chooseAction(state()), Actions.WOOD)
    assert.equal(chooseAction(state({ logs: 1 })), Actions.CRAFT_TABLE)
    assert.equal(chooseAction(state({ hasCraftingTable: true, planks: 5 })), Actions.CRAFT_WOODEN_PICKAXE)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, planks: 2, sticks: 1 })), Actions.CRAFT_WOODEN_SWORD)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true })), Actions.STONE)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, cobblestone: 3, sticks: 2 })), Actions.CRAFT_STONE_PICKAXE)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true })), Actions.STONE)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, cobblestone: 8 })), Actions.CRAFT_FURNACE)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true, sticks: 2 })), Actions.IRON)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true, sticks: 2, rawIron: 3 })), Actions.WOOD)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true, sticks: 2, rawIron: 3, hasSmeltingFuel: true })), Actions.SMELT_IRON)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true, ironIngots: 3, sticks: 2 })), Actions.CRAFT_IRON_PICKAXE)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true, ironIngots: 3, sticks: 2, hasIronPickaxe: true, foodUnits: 12 })), Actions.IRON)
})

test('an unarmed recovery does not run through a nearby hostile even at full health', () => {
    assert.equal(chooseAction(state({ recoveryAvailable: true, hostileDistance: 4, hasWeapon: false })), Actions.ESCAPE)
})

test('deep mining prepares food reserves at the surface without interrupting an underground return', () => {
    const ready = state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true,
        hasStonePickaxe: true, hasStoneUtilityPickaxe: true, hasFurnace: true, hasIronPickaxe: true,
        hasIronArmor: true, armorEquipped: true, hasShield: true, shieldEquipped: true,
        logs: 3, planks: 4, sticks: 4, diamonds: 0, hasFood: false,
        completedAdvancements: new Set(['minecraft:story/lava_bucket']) })
    assert.equal(chooseAction({ ...ready, foodUnits: 0 }), Actions.FOOD)
    assert.equal(chooseAction({ ...ready, foodUnits: 12 }), 'gather_diamonds')
    assert.equal(chooseAction({ ...ready, underground: true, foodUnits: 0 }), 'gather_diamonds')
    assert.equal(chooseAction({ ...ready, underground: true, food: 16, foodUnits: 0 }), 'return_surface')
    assert.equal(chooseAction({ ...ready, inventoryFull: true }), 'clear_inventory')
})

test('a visible nearby creeper triggers avoidance even at full health underground', () => {
    const armed = { hasWeapon: true, underground: true, hostileDistance: 3 }
    assert.equal(chooseAction(state({ ...armed, creeperDistance: 5 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ ...armed, creeperDistance: Infinity })), Actions.FIGHT)
})

test('deep mining does not abandon the trip for sticks and departs with a wood reserve', () => {
    const { nextAdvancement } = require('../src/advancement-plan')
    const geared = {
        hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasStoneUtilityPickaxe: true,
        hasFurnace: true, hasIronPickaxe: true, hasIronArmor: true, armorEquipped: true, hasShield: true, shieldEquipped: true,
        hasBucket: true, completedAdvancements: new Set(['minecraft:story/lava_bucket']), foodUnits: 30, hasFood: true,
        cobblestone: 64, diamonds: 0, sticks: 1, planks: 0, logs: 0
    }
    assert.equal(nextAdvancement(state(geared)).action, 'gather_diamonds')
    assert.equal(chooseAction(state({ ...geared, underground: true })), 'gather_diamonds')
    assert.equal(chooseAction(state({ ...geared, underground: false })), Actions.WOOD)
    assert.equal(chooseAction(state({ ...geared, underground: false, logs: 3 })), 'gather_diamonds')
    const needSticks = { ...geared, diamonds: 3, underground: true }
    assert.equal(chooseAction(state({ ...needSticks, inventoryFull: true })), 'return_surface')
    assert.equal(chooseAction(state({ ...geared, underground: true, inventoryFull: true })), 'clear_inventory')
})

test('a seen diamond outranks cleanup and routine goals but not danger', () => {
    const busy = { underground: true, inventoryFull: true, diamondInView: true, hasWeapon: true }
    assert.equal(chooseAction(state(busy)), 'mine_diamond')
    assert.equal(chooseAction(state({ ...busy, health: 8, hostileDistance: 4 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ ...busy, hostileDistance: 3 })), Actions.FIGHT)
    assert.notEqual(chooseAction(state({ ...busy, diamondInView: false })), 'mine_diamond')
})
