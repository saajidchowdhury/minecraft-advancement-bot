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
