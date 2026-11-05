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

test('a healthy sheltered miner can head below ground at night', () => {
    const sheltered = state({ isNight: true, sheltered: true, canMineFromShelter: true, hasStonePickaxe: true })
    assert.equal(chooseAction(sheltered), 'mine_from_shelter')
    assert.equal(chooseAction({ ...sheltered, health: 12 }), 'wait')
    assert.equal(chooseAction({ ...sheltered, canMineFromShelter: false }), 'wait')
})

test('a nearby known shaft lets a healthy bot continue work before it builds a night shelter', () => {
    const outside = state({ isNight: true, nightShaftReady: true, hasStonePickaxe: true })
    assert.equal(chooseAction(outside), 'descend_shaft_at_night')
    assert.equal(chooseAction({ ...outside, health: 12 }), Actions.SHELTER)
    assert.equal(chooseAction({ ...outside, visibleHostiles: 1 }), Actions.SHELTER)
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

test('iron pick preparation outranks side advancements when survival permits', () => {
    const ready = state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true,
        hasFurnace: true, hasSmeltingFuel: true, ironIngots: 3, rawIron: 3, sticks: 2, canPlantSeed: true, canBreed: true })
    assert.equal(chooseAction(ready), Actions.CRAFT_IRON_PICKAXE)
    assert.equal(chooseAction({ ...ready, ironIngots: 0 }), Actions.SMELT_IRON)
    assert.equal(chooseAction({ ...ready, health: 6, hostileDistance: 2 }), Actions.ESCAPE)
})

test('the axe upgrade outranks optional activities while keeping threat interrupts', () => {
    const ready = state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true,
        hasWoodcuttingAxe: false, cobblestone: 3, sticks: 2, canPlantSeed: true })
    assert.equal(chooseAction(ready), 'craft_stone_axe')
    assert.equal(chooseAction({ ...ready, cobblestone: 0 }), Actions.STONE)
    assert.equal(chooseAction({ ...ready, health: 6, hostileDistance: 2 }), Actions.ESCAPE)
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
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true, sticks: 2, logs: 3 })), Actions.IRON)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true, sticks: 2, rawIron: 3 })), Actions.WOOD)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true, sticks: 2, rawIron: 3, hasSmeltingFuel: true })), Actions.SMELT_IRON)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true, ironIngots: 3, sticks: 2 })), Actions.CRAFT_IRON_PICKAXE)
    assert.equal(chooseAction(state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true, hasFurnace: true, ironIngots: 3, sticks: 2, hasIronPickaxe: true, foodUnits: 12, logs: 3 })), Actions.IRON)
})

test('an unarmed recovery does not run through a nearby hostile even at full health', () => {
    assert.equal(chooseAction(state({ recoveryAvailable: true, hostileDistance: 4, hasWeapon: false })), Actions.ESCAPE)
})

test('deep mining prepares food reserves at the surface without interrupting an underground return', () => {
    const ready = state({ hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true,
        hasStonePickaxe: true, hasStoneUtilityPickaxe: true, hasFurnace: true, hasIronPickaxe: true,
        hasIronArmor: true, armorEquipped: true, hasShield: true, shieldEquipped: true, gear: new Set(['iron_sword', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots']), 
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
        hasFurnace: true, hasIronPickaxe: true, hasIronArmor: true, armorEquipped: true, hasShield: true, shieldEquipped: true, gear: new Set(['iron_sword', 'iron_helmet', 'iron_chestplate', 'iron_leggings', 'iron_boots']), 
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

test('iron and coal trips also carry a wood reserve for replacement picks', () => {
    const early = {
        hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true, hasStonePickaxe: true,
        hasFurnace: true, cobblestone: 40, foodUnits: 20, hasFood: true, completedAdvancements: new Set(),
        logs: 0, planks: 1, sticks: 2
    }
    assert.equal(chooseAction(state(early)), Actions.WOOD)
    assert.equal(chooseAction(state({ ...early, logs: 3 })), 'gather_iron')
    assert.equal(chooseAction(state({ ...early, underground: true })), 'gather_iron')
})

test('an adjacent hostile is fought when armed and healthy, otherwise escaped', () => {
    assert.equal(chooseAction(state({ hostileDistance: 1.2, hasWeapon: true, health: 17 })), Actions.FIGHT)
    assert.equal(chooseAction(state({ hostileDistance: 1.2, hasWeapon: false, health: 17 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ hostileDistance: 1.2, hasWeapon: true, health: 9 })), Actions.ESCAPE)
})

test('critical health with no nearby threat rests instead of starting cancellable work', () => {
    assert.equal(chooseAction(state({ health: 4, food: 20 })), 'wait')
    assert.equal(chooseAction(state({ health: 4, food: 16, hasFood: true })), Actions.EAT)
    assert.equal(chooseAction(state({ health: 4, hostileDistance: 3 })), Actions.ESCAPE)
})

test('archers are fought at melee range and escaped from at range when hurt', () => {
    assert.equal(chooseAction(state({ rangedDistance: 0.8, hostileDistance: 0.8, hasWeapon: true, health: 8.5 })), Actions.FIGHT)
    assert.equal(chooseAction(state({ rangedDistance: 0.8, hostileDistance: 0.8, hasWeapon: true, health: 3 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ rangedDistance: 7.7, hostileDistance: 7.7, hasWeapon: true, health: 1.5, underground: true })), Actions.ESCAPE)
    assert.notEqual(chooseAction(state({ rangedDistance: 7.7, hostileDistance: 7.7, hasWeapon: true, health: 18 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ creeperDistance: 4, rangedDistance: 2, hasWeapon: true, health: 18 })), Actions.ESCAPE)
})

test('a crowd of hostiles is escaped rather than fought, even at full health', () => {
    const crowd = { rangedDistance: 0.8, hostileDistance: 0.8, hasWeapon: true, health: 20, hostileCount: 6 }
    assert.equal(chooseAction(state(crowd)), Actions.ESCAPE)
    assert.equal(chooseAction(state({ ...crowd, hostileCount: 1 })), Actions.FIGHT)
    assert.equal(chooseAction(state({ ...crowd, hostileCount: 2, rangedDistance: Infinity })), Actions.FIGHT)
})

test('hostiles hidden behind a sealed pocket do not force the bot back out', () => {
    assert.equal(chooseAction(state({ health: 1.3, food: 20, hostileCount: 6, visibleHostiles: 0, hostileDistance: 13 })), 'wait')
    assert.equal(chooseAction(state({ health: 18, hostileCount: 6, visibleHostiles: 4, hostileDistance: 3 })), Actions.ESCAPE)
})

test('an adjacent attacker is fought before eating when the bot is healthy and armed', () => {
    const near = { hostileDistance: 1.4, hasWeapon: true, health: 15.4, food: 16, hasFood: true }
    assert.equal(chooseAction(state(near)), Actions.FIGHT)
    assert.equal(chooseAction(state({ ...near, health: 9 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ ...near, hostileDistance: 8 })), Actions.EAT)
})

test('a fully armored, armed bot keeps fighting a lone melee attacker instead of fleeing at low health', () => {
    const duel = { hostileDistance: 0.5, hasWeapon: true, armorPoints: 15, visibleHostiles: 1, health: 9.9, food: 16, hasFood: true }
    assert.equal(chooseAction(state(duel)), Actions.FIGHT)
    assert.equal(chooseAction(state({ ...duel, health: 4 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ ...duel, armorPoints: 5 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ ...duel, visibleHostiles: 3 })), Actions.ESCAPE)
})

test('a lone archer shooting from mid-range is charged when healthy, covered from when hurt', () => {
    const archer = { rangedDistance: 7.9, hostileDistance: 7.9, hasWeapon: true, visibleHostiles: 1, health: 13.3, underground: true }
    assert.equal(chooseAction(state(archer)), Actions.FIGHT)
    assert.equal(chooseAction(state({ ...archer, health: 9.3 })), Actions.ESCAPE)
    assert.notEqual(chooseAction(state({ ...archer, hasWeapon: false })), Actions.FIGHT)
})

test('an armored bot fights two zombies once a creeper is beyond its fuse range', () => {
    const pair = { hostileDistance: 1.3, hasWeapon: true, armorPoints: 16, visibleHostiles: 2, health: 9.6 }
    assert.equal(chooseAction(state(pair)), Actions.FIGHT)
    assert.equal(chooseAction(state({ ...pair, creeperDistance: 5 })), Actions.ESCAPE)
    assert.equal(chooseAction(state({ ...pair, visibleHostiles: 3 })), Actions.ESCAPE)
})

test('a non-urgent surface trip waits underground in shelter at night', () => {
    const night = { underground: true, isNight: true, hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true,
        hasStonePickaxe: true, hasFurnace: true, hasIronPickaxe: true, rawIron: 3, cobblestone: 10, food: 17, hasFood: true, logs: 0, planks: 0, sticks: 0 }
    assert.equal(chooseAction(state(night)), Actions.IRON)
    assert.equal(chooseAction(state({ ...night, health: 12, hasFood: false })), Actions.SHELTER)
    assert.equal(chooseAction(state({ ...night, health: 12, hasFood: false, sheltered: true })), 'wait')
    assert.equal(chooseAction(state({ ...night, rawIron: 40 })), 'gather_diamonds')
    assert.equal(chooseAction(state({ ...night, rawIron: 40, hasIronPickaxe: false })), Actions.SHELTER)
    assert.equal(chooseAction(state({ ...night, isNight: false })), 'return_surface')
    assert.equal(chooseAction(state({ ...night, food: 10, hasFood: false })), 'return_surface')
})

test('a verified underground shelter is not mistaken for a shaft to escape from', () => {
    const night = { underground: true, isNight: true, hasCraftingTable: true, hasWoodenPickaxe: true, hasEarlySword: true,
        hasStonePickaxe: true, hasFurnace: true, hasIronPickaxe: true, rawIron: 3, cobblestone: 10,
        food: 17, hasFood: true, logs: 0, planks: 0, sticks: 0, shaftTrapped: true }
    assert.equal(chooseAction(state({ ...night, sheltered: true, health: 12, hasFood: false })), 'wait')
    assert.equal(chooseAction(state({ ...night, sheltered: false })), Actions.ASCEND)
})
